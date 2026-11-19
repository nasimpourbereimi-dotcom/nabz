/**
 * Two-pass import of Apple Health export.xml.
 *
 * export.xml lists all Records (incl. heart rate) BEFORE all Workouts, but we want raw HR only inside
 * workout windows. So:
 *   pass 1 — cheap: jump from "<Workout " to "<Workout " (native indexOf), collect workouts.
 *   pass 2 — full: walk Records; raw HR inside workout windows, 5-min HR buckets outside,
 *            low-volume samples raw, high-volume metrics aggregated per day.
 * Everything is written with put() on deterministic keys, so re-importing a newer export is idempotent.
 */
import type { NabzDB } from '../db/schema';
import type { DailyMetrics, HrBucket, HrSample, Sample, SampleType, Workout } from '../db/types';
import { healthLocalDate, parseHealthDate, MIN } from '../lib/time';
import { attr, parseAttrs, TagScanner, type Tag } from './tagScanner';
import {
  ASLEEP_STAGES, distanceToKm, energyToKcal, HK, normalizeWorkoutType, sleepStage, type SleepStage,
} from './mapping';
import { planMerge } from './merge';
import { enrichWorkouts } from '../db/enrich';

export const RAW_HR_PAD_BEFORE = 2 * MIN;
export const RAW_HR_PAD_AFTER = 5 * MIN; // keep the recovery tail
export const BUCKET = 5 * MIN;
const BATCH = 5000;

/** Opens export.xml as a stream of text chunks; reports fraction 0..1 of the file read. */
export type XmlSource = (onFraction: (f: number) => void) => AsyncIterable<string>;

export type ImportEvent =
  | { type: 'progress'; phase: 'scan' | 'parse' | 'save' | 'analyze'; fraction: number; counts: ImportCounts }
  | { type: 'discoveries'; discoveries: Discoveries };

export interface ImportCounts {
  workouts: number;
  hrRecords: number;
  samples: number;
  days: number;
  years: number;
  malformed: number;
}

export interface Discoveries {
  workouts: number;
  firstWorkout?: number;
  totalHours: number;
  longestMin: number;
  topType?: string;
}

export interface ImportSummary extends ImportCounts {
  exportDate?: number;
  firstDate?: string;
  lastDate?: string;
  removedWorkouts: number;
}

// ---------- pass 1: workouts ----------

export async function scanWorkouts(source: XmlSource, onFraction: (f: number) => void, malformed: { n: number }) {
  const workouts: Workout[] = [];
  let exportDate: number | undefined;
  let dateOfBirth: string | undefined;
  let cur: Workout | null = null;

  const scanner: TagScanner = new TagScanner((tag: Tag) => {
    if (tag.name === 'Workout') {
      if (tag.isEnd) {
        if (cur) workouts.push(cur);
        cur = null;
        scanner.seek = '<Workout ';
        return;
      }
      const w = workoutFromAttrs(parseAttrs(tag.raw));
      if (!w) { malformed.n++; return; }
      if (tag.selfClosing) workouts.push(w);
      else { cur = w; scanner.seek = null; }
      return;
    }
    // Header (ExportDate) is read tag by tag; from the first ExportDate/Record on, fast-forward between workouts.
    if (tag.name === 'ExportDate' && !tag.isEnd) {
      exportDate = parseHealthDate(attr(tag.raw, 'value') ?? '');
      return;
    }
    if (tag.name === 'Me' && !tag.isEnd) {
      dateOfBirth = attr(tag.raw, 'HKCharacteristicTypeIdentifierDateOfBirth') || undefined;
      if (!cur) scanner.seek = '<Workout ';
      return;
    }
    if (tag.name === 'Record' && !cur) { scanner.seek = '<Workout '; return; }
    if (!cur || tag.isEnd) return;
    if (tag.name === 'WorkoutStatistics') applyStatistics(cur, parseAttrs(tag.raw));
    else if (tag.name === 'MetadataEntry') {
      const a = parseAttrs(tag.raw);
      if (a.key === 'HKIndoorWorkout') cur.indoor = a.value === '1';
    }
  });
  for await (const chunk of source(onFraction)) scanner.push(chunk);
  scanner.end();
  malformed.n += scanner.malformed;
  workouts.sort((a, b) => a.start - b.start);
  return { workouts, exportDate, dateOfBirth };
}

function workoutFromAttrs(a: Record<string, string>): Workout | null {
  const start = parseHealthDate(a.startDate ?? '');
  const end = parseHealthDate(a.endDate ?? '');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const rawType = a.workoutActivityType ?? 'HKWorkoutActivityTypeOther';
  let durationSec = (end - start) / 1000;
  if (a.duration) {
    const d = Number(a.duration);
    if (Number.isFinite(d)) durationSec = a.durationUnit === 'sec' ? d : a.durationUnit === 'hr' ? d * 3600 : d * 60;
  }
  const w: Workout = {
    id: `x${start}`,
    start, end,
    durationSec: Math.round(durationSec),
    type: normalizeWorkoutType(rawType),
    rawType,
    typeSource: 'health',
    source: 'export',
    sourceName: a.sourceName,
  };
  // Older exports put totals on the Workout element itself.
  if (a.totalEnergyBurned) w.energyKcal = energyToKcal(Number(a.totalEnergyBurned), a.totalEnergyBurnedUnit);
  if (a.totalDistance) w.distanceKm = distanceToKm(Number(a.totalDistance), a.totalDistanceUnit);
  return w;
}

function applyStatistics(w: Workout, a: Record<string, string>) {
  const num = (k: string) => (a[k] !== undefined && Number.isFinite(Number(a[k])) ? Number(a[k]) : undefined);
  switch (a.type) {
    case HK.activeEnergy: {
      const s = num('sum');
      if (s !== undefined) w.energyKcal = energyToKcal(s, a.unit);
      break;
    }
    case HK.heartRate:
      w.hrAvg = num('average') ?? w.hrAvg;
      w.hrMax = num('maximum') ?? w.hrMax;
      w.hrMin = num('minimum') ?? w.hrMin;
      break;
    case 'HKQuantityTypeIdentifierDistanceWalkingRunning':
    case 'HKQuantityTypeIdentifierDistanceCycling':
    case 'HKQuantityTypeIdentifierDistanceSwimming': {
      const s = num('sum');
      if (s !== undefined) w.distanceKm = distanceToKm(s, a.unit);
      break;
    }
  }
}

export function summarizeWorkouts(workouts: Workout[]): Discoveries {
  const typeCount = new Map<string, number>();
  let totalSec = 0, longest = 0;
  for (const w of workouts) {
    totalSec += w.durationSec;
    longest = Math.max(longest, w.durationSec);
    typeCount.set(w.type, (typeCount.get(w.type) ?? 0) + 1);
  }
  const topType = [...typeCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return {
    workouts: workouts.length,
    firstWorkout: workouts[0]?.start,
    totalHours: totalSec / 3600,
    longestMin: longest / 60,
    topType,
  };
}

// ---------- pass 2: records ----------

/** Sorted, merged [start, end] windows for raw HR; binary-searchable. */
class Windows {
  private starts: Float64Array;
  private ends: Float64Array;
  private ids: string[];
  constructor(workouts: Workout[]) {
    const ws = [...workouts].sort((a, b) => a.start - b.start);
    this.starts = new Float64Array(ws.map((w) => w.start - RAW_HR_PAD_BEFORE));
    this.ends = new Float64Array(ws.map((w) => w.end + RAW_HR_PAD_AFTER));
    this.ids = ws.map((w) => w.id);
  }
  /** workout id whose padded window contains t, else undefined */
  find(t: number): string | undefined {
    let lo = 0, hi = this.starts.length - 1, hit = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.starts[mid] <= t) { hit = mid; lo = mid + 1; } else hi = mid - 1;
    }
    // padded windows may overlap; check a couple of neighbours
    for (let i = hit; i >= 0 && i >= hit - 2; i--) if (t <= this.ends[i]) return this.ids[i];
    return undefined;
  }
}

/** HR buckets in paged typed arrays (millions of records, small memory). */
class BucketAgg {
  private pages = new Map<number, { sum: Float64Array; min: Uint16Array; max: Uint16Array; n: Uint32Array }>();
  add(t: number, bpm: number) {
    const idx = Math.floor(t / BUCKET);
    const pk = Math.floor(idx / 4096), off = idx - pk * 4096;
    let p = this.pages.get(pk);
    if (!p) {
      p = { sum: new Float64Array(4096), min: new Uint16Array(4096).fill(65535), max: new Uint16Array(4096), n: new Uint32Array(4096) };
      this.pages.set(pk, p);
    }
    p.sum[off] += bpm; p.n[off]++;
    if (bpm < p.min[off]) p.min[off] = bpm;
    if (bpm > p.max[off]) p.max[off] = bpm;
  }
  *rows(): Generator<HrBucket> {
    for (const [pk, p] of this.pages) {
      for (let off = 0; off < 4096; off++) {
        if (!p.n[off]) continue;
        yield { t: (pk * 4096 + off) * BUCKET, avg: Math.round((p.sum[off] / p.n[off]) * 10) / 10, min: p.min[off], max: p.max[off], n: p.n[off] };
      }
    }
  }
}

type PerSource = Map<string, number>;
interface DayAcc {
  energy: PerSource; exercise: PerSource; steps: PerSource;
  resting: number[]; hrv: number[]; vo2: number[];
  sleep: Map<string, Partial<Record<SleepStage, number>>>; // per source, minutes
}

function dayAcc(days: Map<string, DayAcc>, date: string): DayAcc {
  let d = days.get(date);
  if (!d) {
    d = { energy: new Map(), exercise: new Map(), steps: new Map(), resting: [], hrv: [], vo2: [], sleep: new Map() };
    days.set(date, d);
  }
  return d;
}
const addTo = (m: PerSource, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
/** Health has overlapping sources (iPhone + Watch steps). Approximate its dedup by taking the max source. */
const maxSource = (m: PerSource) => (m.size ? Math.max(...m.values()) : undefined);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const round1 = (x: number | undefined) => (x === undefined ? undefined : Math.round(x * 10) / 10);

export function finalizeDay(date: string, d: DayAcc): DailyMetrics {
  const out: DailyMetrics = { date };
  const e = maxSource(d.energy); if (e !== undefined) out.activeEnergy = Math.round(e);
  const x = maxSource(d.exercise); if (x !== undefined) out.exerciseMin = Math.round(x);
  const s = maxSource(d.steps); if (s !== undefined) out.steps = Math.round(s);
  out.restingHR = round1(mean(d.resting));
  out.hrvSDNN = round1(mean(d.hrv));
  out.vo2max = round1(mean(d.vo2));
  // Sleep: pick the source with the most asleep time (usually the Watch, which has stages).
  let best: Partial<Record<SleepStage, number>> | undefined, bestAsleep = 0;
  for (const st of d.sleep.values()) {
    let asleep = 0;
    for (const k of ASLEEP_STAGES) asleep += st[k] ?? 0;
    if (asleep > bestAsleep) { bestAsleep = asleep; best = st; }
  }
  if (best) {
    out.sleepMin = Math.round(bestAsleep);
    const stages: DailyMetrics['sleepStages'] = {};
    for (const k of ['core', 'deep', 'rem', 'awake', 'asleep'] as const) if (best[k]) stages[k] = Math.round(best[k]!);
    out.sleepStages = stages;
  }
  for (const k of Object.keys(out) as (keyof DailyMetrics)[]) if (out[k] === undefined) delete out[k];
  return out;
}

// ---------- orchestration ----------

export async function importHealthExport(
  db: NabzDB,
  source: XmlSource,
  emit: (e: ImportEvent) => void,
): Promise<ImportSummary> {
  const malformed = { n: 0 };
  const counts: ImportCounts = { workouts: 0, hrRecords: 0, samples: 0, days: 0, years: 0, malformed: 0 };
  const SCAN_W = 0.25; // pass 1 share of the progress bar

  // Pass 1
  const { workouts, exportDate, dateOfBirth } = await scanWorkouts(
    source,
    (f) => emit({ type: 'progress', phase: 'scan', fraction: f * SCAN_W, counts }),
    malformed,
  );
  counts.workouts = workouts.length;
  if (dateOfBirth) await db.settings.put({ key: 'dateOfBirth', value: dateOfBirth });
  emit({ type: 'discoveries', discoveries: summarizeWorkouts(workouts) });

  // Merge workouts into DB right away (user sees them even if pass 2 is interrupted).
  const existing = await db.workouts.toArray();
  const plan = planMerge(existing, workouts);
  await db.transaction('rw', db.workouts, db.hrSamples, async () => {
    if (plan.remove.length) {
      await db.workouts.bulkDelete(plan.remove);
      await db.hrSamples.where('workoutId').anyOf(plan.remove).delete();
    }
    await db.workouts.bulkPut(plan.put);
  });

  // Pass 2
  const windows = new Windows(workouts);
  const buckets = new BucketAgg();
  const days = new Map<string, DayAcc>();
  const years = new Set<string>();
  let hrBatch: HrSample[] = [];
  let sampleBatch: Sample[] = [];
  const pendingWrites: Promise<unknown>[] = [];
  const flush = async (force = false) => {
    if (hrBatch.length >= BATCH || (force && hrBatch.length)) { const b = hrBatch; hrBatch = []; pendingWrites.push(db.hrSamples.bulkPut(b)); }
    if (sampleBatch.length >= BATCH || (force && sampleBatch.length)) { const b = sampleBatch; sampleBatch = []; pendingWrites.push(db.samples.bulkPut(b)); }
    // Backpressure: never let more than a few batches queue up in memory.
    if (pendingWrites.length > 4 || force) { await Promise.all(pendingWrites); pendingWrites.length = 0; }
  };

  const pushSample = (type: SampleType, start: number, end: number, value: number | string, sourceName?: string) => {
    sampleBatch.push({ type, start, end, value, sourceName });
    counts.samples++;
  };

  const scanner = new TagScanner((tag) => {
    if (tag.name !== 'Record' || tag.isEnd) return;
    const raw = tag.raw;
    const type = attr(raw, 'type');
    if (!type) { malformed.n++; return; }

    if (type === HK.heartRate) {
      const sd = attr(raw, 'startDate') ?? '';
      const t = parseHealthDate(sd);
      const bpm = Number(attr(raw, 'value'));
      if (!Number.isFinite(t) || !(bpm > 0 && bpm < 300)) { malformed.n++; return; }
      counts.hrRecords++;
      years.add(sd.slice(0, 4));
      const wid = windows.find(t);
      if (wid) hrBatch.push({ t, bpm, workoutId: wid });
      else buckets.add(t, bpm);
      return;
    }

    let kind: 'energy' | 'exercise' | 'steps' | SampleType;
    switch (type) {
      case HK.activeEnergy: kind = 'energy'; break;
      case HK.exerciseTime: kind = 'exercise'; break;
      case HK.steps: kind = 'steps'; break;
      case HK.restingHR: kind = 'restingHR'; break;
      case HK.hrv: kind = 'hrvSDNN'; break;
      case HK.hrRecovery: kind = 'hrRecovery1m'; break;
      case HK.vo2max: kind = 'vo2max'; break;
      case HK.sleep: kind = 'sleep'; break;
      default: return; // not interesting
    }
    const sd = attr(raw, 'startDate') ?? '';
    const ed = attr(raw, 'endDate') ?? sd;
    const start = parseHealthDate(sd), end = parseHealthDate(ed);
    const value = attr(raw, 'value') ?? '';
    const src = attr(raw, 'sourceName') ?? '';
    if (!Number.isFinite(start) || !Number.isFinite(end)) { malformed.n++; return; }
    years.add(sd.slice(0, 4));

    if (kind === 'sleep') {
      const stage = sleepStage(value);
      if (!stage) return;
      pushSample('sleep', start, end, stage, src);
      // Sleep belongs to the day you wake up.
      const d = dayAcc(days, healthLocalDate(ed));
      const st = d.sleep.get(src) ?? {};
      st[stage] = (st[stage] ?? 0) + (end - start) / MIN;
      d.sleep.set(src, st);
      return;
    }
    const v = Number(value);
    if (!Number.isFinite(v)) { malformed.n++; return; }
    const d = dayAcc(days, healthLocalDate(sd));
    switch (kind) {
      case 'energy': addTo(d.energy, src, energyToKcal(v, attr(raw, 'unit'))); return;
      case 'exercise': addTo(d.exercise, src, v); return;
      case 'steps': addTo(d.steps, src, v); return;
      case 'restingHR': d.resting.push(v); break;
      case 'hrvSDNN': d.hrv.push(v); break;
      case 'vo2max': d.vo2.push(v); break;
    }
    pushSample(kind, start, end, v, src);
  });

  let lastEmit = 0;
  for await (const chunk of source((f) => {
    const now = Date.now();
    if (now - lastEmit > 150) {
      lastEmit = now;
      counts.years = years.size; counts.malformed = malformed.n + scanner.malformed;
      emit({ type: 'progress', phase: 'parse', fraction: SCAN_W + f * (0.95 - SCAN_W), counts });
    }
  })) {
    scanner.push(chunk);
    await flush();
  }
  scanner.end();
  await flush(true);

  // Save aggregates
  emit({ type: 'progress', phase: 'save', fraction: 0.95, counts });
  let bucketBatch: HrBucket[] = [];
  for (const b of buckets.rows()) {
    bucketBatch.push(b);
    if (bucketBatch.length >= BATCH) { await db.hrBuckets.bulkPut(bucketBatch); bucketBatch = []; }
  }
  if (bucketBatch.length) await db.hrBuckets.bulkPut(bucketBatch);

  const dailyRows = [...days.entries()].map(([date, acc]) => finalizeDay(date, acc));
  for (let i = 0; i < dailyRows.length; i += BATCH) await db.dailyMetrics.bulkPut(dailyRows.slice(i, i + BATCH));

  counts.days = days.size;
  counts.years = years.size;
  counts.malformed = malformed.n + scanner.malformed;
  const dates = [...days.keys()].sort();
  const summary: ImportSummary = {
    ...counts,
    exportDate,
    firstDate: dates[0],
    lastDate: dates[dates.length - 1],
    removedWorkouts: plan.remove.length,
  };
  await db.syncLog.add({
    at: Date.now(),
    kind: 'export',
    counts: { workouts: counts.workouts, hrRecords: counts.hrRecords, samples: counts.samples, days: counts.days, malformed: counts.malformed },
    exportDate,
  });
  emit({ type: 'progress', phase: 'analyze', fraction: 0.97, counts });
  await enrichWorkouts(db);
  emit({ type: 'progress', phase: 'analyze', fraction: 1, counts });
  return summary;
}
