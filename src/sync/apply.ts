// Applies a validated Shortcuts payload to the DB. Idempotent: re-applying the same payload changes nothing.
import type { NabzDB } from '../db/schema';
import type { DailyMetrics, HrBucket, HrSample, IntervalRow, Sample, Workout } from '../db/types';
import { enrichWorkouts, getProfile } from '../db/enrich';
import { planMerge } from '../import/merge';
import { ASLEEP_STAGES, type SleepStage } from '../import/mapping';
import { BUCKET, RAW_HR_PAD_AFTER, RAW_HR_PAD_BEFORE } from '../import/healthImport';
import { tehranDateKey } from '../lib/time';
import { guessType, inferWorkouts, shapeFeatures, type Window } from '../analytics/workoutShape';
import type { HrPoint } from '../analytics/hr';
import type { IntervalSample, Payload } from './payload';

const DAY = 86_400_000;
const TEHRAN_OFFSET = 210 * 60_000;

export interface SyncSummary {
  workouts: number; // from the automation queue
  inferred: number;
  skipped: number; // superseded by stronger sources (e.g. already in an export)
  days: number;
  guessed: string[]; // ids of workouts whose type is a guess (ask the owner)
  hrSamples: number;
}

/** UTC range of a Tehran calendar day. */
function dayRange(key: string): [number, number] {
  const start = Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) - TEHRAN_OFFSET;
  return [start, start + DAY];
}

const sumIn = (xs: IntervalSample[], w: Window) =>
  xs.reduce((a, x) => a + (x.start >= w.start && x.start < w.end ? x.v : 0), 0);

export async function applyPayload(db: NabzDB, p: Payload, now = Date.now()): Promise<SyncSummary> {
  const profile = await getProfile(db);
  const hr: HrPoint[] = p.heartRate.map((s) => ({ t: s.t, bpm: s.v }));
  for (const w of p.workouts) for (const s of w.hr) hr.push({ t: s.t, bpm: s.v });
  hr.sort((a, b) => a.t - b.t);

  const times = [...hr.map((s) => s.t), ...p.workouts.map((w) => w.start)];
  const from = times.length ? Math.min(...times) - DAY : now - 30 * DAY;
  const existing = await db.workouts.where('start').above(from - DAY).toArray();

  // 1) Workouts from the automation queue
  const examples = (await db.workouts.toArray())
    .filter((w) => w.features && (w.typeSource === 'health' || w.typeSource === 'confirmed'))
    .map((w) => ({ type: w.type, f: w.features! }));
  const build = (win: Window, source: 'shortcut' | 'inferred', kcal?: number): Workout => {
    const steps = Math.round(sumIn(p.steps, win));
    const f = shapeFeatures(hr, win, profile, steps);
    const g = f ? guessType(f, examples) : { type: 'strength', confidence: 0.3 };
    return {
      id: `${source === 'shortcut' ? 's' : 'i'}${win.start}`,
      start: win.start, end: win.end, durationSec: Math.round((win.end - win.start) / 1000),
      type: g.type, typeSource: 'guessed', typeConfidence: g.confidence, source,
      energyKcal: kcal ?? (Math.round(sumIn(p.activeEnergy, win)) || undefined),
      steps: steps || undefined,
      ...(f ? { features: f } : {}),
    };
  };
  const incoming = p.workouts.map((w) => build(w, 'shortcut', w.activeKcal));

  // 2) Workouts the automation missed, from HR density
  const inferredWins = inferWorkouts(hr, [...existing, ...incoming], {
    exercise: p.exerciseMinutes, restHR: profile.restHR,
  });
  const inferred = inferredWins.map((w) => build(w, 'inferred'));

  const plan = planMerge(existing, [...incoming, ...inferred]);
  const accepted = plan.put;

  // 3) Raw HR around accepted workouts; 5-min buckets for the rest
  const windows = [...existing.filter((e) => !plan.remove.includes(e.id)), ...accepted]
    .map((w) => ({ id: w.id, start: w.start - RAW_HR_PAD_BEFORE, end: w.end + RAW_HR_PAD_AFTER }))
    .sort((a, b) => a.start - b.start);
  const acceptedIds = new Set(accepted.map((w) => w.id));
  const raw: HrSample[] = [];
  const buckets = new Map<number, { sum: number; n: number; min: number; max: number }>();
  for (const s of hr) {
    const win = windows.find((w) => s.t >= w.start && s.t <= w.end);
    if (win) {
      if (acceptedIds.has(win.id)) raw.push({ t: s.t, bpm: s.bpm, workoutId: win.id });
      continue; // HR around an existing (e.g. export) workout is already stored
    }
    const k = Math.floor(s.t / BUCKET) * BUCKET;
    const b = buckets.get(k) ?? { sum: 0, n: 0, min: Infinity, max: 0 };
    b.sum += s.bpm; b.n++; b.min = Math.min(b.min, s.bpm); b.max = Math.max(b.max, s.bpm);
    buckets.set(k, b);
  }
  const bucketRows: HrBucket[] = [...buckets].map(([t, b]) => ({ t, avg: Math.round((b.sum / b.n) * 10) / 10, min: b.min, max: b.max, n: b.n }));

  // 4) Samples
  const samples: Sample[] = [
    ...p.restingHR.map((s) => ({ type: 'restingHR' as const, start: s.t, end: s.t, value: s.v })),
    ...p.hrvSDNN.map((s) => ({ type: 'hrvSDNN' as const, start: s.t, end: s.t, value: s.v })),
    ...p.sleep.map((s) => ({ type: 'sleep' as const, start: s.start, end: s.end, value: s.stage, sourceName: s.source })),
  ];
  const intervalRows: IntervalRow[] = [
    ...p.activeEnergy.map((s) => ({ type: 'activeEnergy' as const, source: s.source ?? '', start: s.start, end: s.end, value: s.v })),
    ...p.exerciseMinutes.map((s) => ({ type: 'exerciseMin' as const, source: s.source ?? '', start: s.start, end: s.end, value: s.v })),
    ...p.steps.map((s) => ({ type: 'steps' as const, source: s.source ?? '', start: s.start, end: s.end, value: s.v })),
  ];

  await db.transaction('rw', [db.workouts, db.hrSamples, db.hrBuckets, db.samples, db.intervalSamples], async () => {
    if (plan.remove.length) {
      await db.workouts.bulkDelete(plan.remove);
      await db.hrSamples.where('workoutId').anyOf(plan.remove).delete();
    }
    await db.workouts.bulkPut(accepted);
    await db.hrSamples.bulkPut(raw);
    await db.hrBuckets.bulkPut(bucketRows);
    await db.samples.bulkPut(samples);
    await db.intervalSamples.bulkPut(intervalRows);
  });

  // 5) Recompute affected days
  const dayKeys = new Set<string>();
  for (const s of samples) dayKeys.add(tehranDateKey(s.type === 'sleep' ? s.end : s.start));
  for (const s of intervalRows) dayKeys.add(tehranDateKey(s.start));
  for (const key of dayKeys) await recomputeDay(db, key);

  // 6) Analytics for the new workouts
  if (accepted.length) await enrichWorkouts(db, accepted.map((w) => w.id));

  await db.syncLog.add({
    at: now, kind: 'shortcut', payloadVersion: p.v,
    counts: { workouts: incoming.length, inferred: inferred.length, days: dayKeys.size, hr: hr.length, skipped: p.skipped },
  });
  await db.settings.put({ key: 'lastSync', value: p.generatedAt });

  return {
    workouts: accepted.filter((w) => w.source === 'shortcut').length,
    inferred: accepted.filter((w) => w.source === 'inferred').length,
    skipped: plan.skipped,
    days: dayKeys.size,
    guessed: accepted.filter((w) => w.typeSource === 'guessed').map((w) => w.id),
    hrSamples: hr.length,
  };
}

/**
 * Rebuilds one day's metrics from everything stored for it. Values the export already aggregated
 * (no raw rows kept) are never lowered: we take max(existing, recomputed).
 */
export async function recomputeDay(db: NabzDB, key: string): Promise<void> {
  const [from, to] = dayRange(key);
  const cur: DailyMetrics = (await db.dailyMetrics.get(key)) ?? { date: key };
  const next: DailyMetrics = { ...cur };

  for (const [type, field] of [['activeEnergy', 'activeEnergy'], ['exerciseMin', 'exerciseMin'], ['steps', 'steps']] as const) {
    const rows = await db.intervalSamples.where('[type+start]').between([type, from], [type, to], true, false).toArray();
    if (!rows.length) continue;
    const per = new Map<string, number>();
    for (const r of rows) per.set(r.source, (per.get(r.source) ?? 0) + r.value);
    const v = Math.round(Math.max(...per.values()));
    next[field] = Math.max(cur[field] ?? 0, v);
  }

  const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : undefined);
  const inDay = (await db.samples.where('start').between(from, to, true, false).toArray());
  const rhr = mean(inDay.filter((s) => s.type === 'restingHR').map((s) => s.value as number));
  const hrv = mean(inDay.filter((s) => s.type === 'hrvSDNN').map((s) => s.value as number));
  if (rhr !== undefined) next.restingHR = rhr;
  if (hrv !== undefined) next.hrvSDNN = hrv;

  // Sleep belongs to the day you wake up: segments ending inside this day (started up to 18h before).
  const sleepRows = (await db.samples.where('start').between(from - 18 * 3_600_000, to, true, false).toArray())
    .filter((s) => s.type === 'sleep' && s.end > from && s.end <= to);
  if (sleepRows.length) {
    const per = new Map<string, Partial<Record<SleepStage, number>>>();
    for (const s of sleepRows) {
      const st = per.get(s.sourceName ?? '') ?? {};
      const stage = s.value as SleepStage;
      st[stage] = (st[stage] ?? 0) + (s.end - s.start) / 60_000;
      per.set(s.sourceName ?? '', st);
    }
    let best: Partial<Record<SleepStage, number>> | undefined, bestMin = 0;
    for (const st of per.values()) {
      let m = 0;
      for (const k of ASLEEP_STAGES) m += st[k] ?? 0;
      if (m > bestMin) { bestMin = m; best = st; }
    }
    if (best && bestMin >= (cur.sleepMin ?? 0)) {
      next.sleepMin = Math.round(bestMin);
      const stages: DailyMetrics['sleepStages'] = {};
      for (const k of ['core', 'deep', 'rem', 'awake', 'asleep'] as const) if (best[k]) stages[k] = Math.round(best[k]!);
      next.sleepStages = stages;
    }
  }
  await db.dailyMetrics.put(next);
}
