import { beforeEach, describe, expect, it } from 'vitest';
import { NabzDB } from '../src/db/schema';
import { importHealthExport, RAW_HR_PAD_AFTER, RAW_HR_PAD_BEFORE, type XmlSource } from '../src/import/healthImport';
import { generateExportXml, type SynthTruth } from '../scripts/synthetic';

function sourceFrom(xml: string, chunk = 65_536): XmlSource {
  return (onFraction) => ({
    async *[Symbol.asyncIterator]() {
      for (let i = 0; i < xml.length; i += chunk) {
        onFraction(Math.min(1, (i + chunk) / xml.length));
        yield xml.slice(i, i + chunk);
      }
    },
  });
}

let n = 0;
let db: NabzDB;
beforeEach(() => { db = new NabzDB(`test-${n++}`); });

function makeExport(days: number) {
  const truth: SynthTruth = { workouts: [], hrRecords: 0, days };
  const xml = [...generateExportXml({ days, quirks: true, seed: 7 }, truth)].join('');
  return { xml, truth };
}

describe('importHealthExport', () => {
  it('imports workouts, HR and daily metrics from a synthetic export', async () => {
    const { xml, truth } = makeExport(21);
    const events: string[] = [];
    const summary = await importHealthExport(db, sourceFrom(xml), (e) => events.push(e.type));

    const workouts = await db.workouts.orderBy('start').toArray();
    expect(workouts.length).toBe(truth.workouts.length);
    expect(workouts.length).toBeGreaterThan(5);
    for (const [i, t] of truth.workouts.entries()) {
      expect(workouts[i]).toMatchObject({ start: t.start, end: t.end, rawType: t.rawType, source: 'export', typeSource: 'health' });
      expect(workouts[i].energyKcal).toBe(t.energyKcal);
      expect(workouts[i].hrAvg).toBe(t.hrAvg);
      expect(workouts[i].hrMax).toBe(t.hrMax);
      if (t.rawType.includes('Walking')) expect(workouts[i].distanceKm).toBeGreaterThan(0);
    }

    // raw HR only inside padded workout windows
    const raw = await db.hrSamples.toArray();
    expect(raw.length).toBeGreaterThan(0);
    const byId = new Map(workouts.map((w) => [w.id, w]));
    for (const s of raw) {
      const w = byId.get(s.workoutId!)!;
      expect(s.t).toBeGreaterThanOrEqual(w.start - RAW_HR_PAD_BEFORE);
      expect(s.t).toBeLessThanOrEqual(w.end + RAW_HR_PAD_AFTER);
    }
    // every HR record is either raw or counted in a bucket
    const buckets = await db.hrBuckets.toArray();
    const bucketN = buckets.reduce((a, b) => a + b.n, 0);
    expect(raw.length + bucketN).toBe(truth.hrRecords);
    expect(summary.hrRecords).toBe(truth.hrRecords);

    // daily metrics: steps take the max source (Watch), not Watch + iPhone
    const days = await db.dailyMetrics.toArray();
    expect(days.length).toBeGreaterThanOrEqual(21);
    const full = days.find((d) => d.steps && d.sleepMin)!;
    expect(full.restingHR).toBeGreaterThan(40);
    expect(full.hrvSDNN).toBeGreaterThan(30);
    expect(full.sleepMin).toBeGreaterThan(400);
    expect(full.sleepMin).toBeLessThan(460); // 7.5h minus awake bits; iPhone "inBed" not counted
    expect(full.sleepStages?.deep).toBeGreaterThan(0);

    // quirks: the record with ">" in sourceName is kept, the broken one is counted as malformed
    expect(await db.samples.where('type').equals('restingHR').count()).toBe(22);
    expect(summary.malformed).toBeGreaterThanOrEqual(1);
    expect(summary.exportDate).toBeGreaterThan(0);

    expect(events).toContain('discoveries');
    expect(await db.syncLog.count()).toBe(1);
  });

  it('is idempotent: importing the same export twice changes nothing', async () => {
    const { xml } = makeExport(10);
    await importHealthExport(db, sourceFrom(xml), () => {});
    const snap = async () => ({
      w: await db.workouts.count(), hr: await db.hrSamples.count(), b: await db.hrBuckets.count(),
      s: await db.samples.count(), d: await db.dailyMetrics.toArray(),
    });
    const first = await snap();
    await importHealthExport(db, sourceFrom(xml, 4093), () => {});
    expect(await snap()).toEqual(first);
  });

  it('keeps user input when a newer export replaces a shortcut workout', async () => {
    const { xml, truth } = makeExport(7);
    const t = truth.workouts[0];
    await db.workouts.put({
      id: 's1', start: t.start + 20_000, end: t.end - 15_000, durationSec: 1, type: 'hiit',
      typeSource: 'guessed', source: 'shortcut', rpe: 8,
    });
    await db.hrSamples.put({ t: t.start + 30_001, bpm: 99, workoutId: 's1' });
    await importHealthExport(db, sourceFrom(xml), () => {});
    expect(await db.workouts.get('s1')).toBeUndefined();
    const replaced = await db.workouts.get(`x${t.start}`);
    expect(replaced).toMatchObject({ rpe: 8, typeSource: 'health' });
    expect(await db.hrSamples.where('workoutId').equals('s1').count()).toBe(0);
  });
});
