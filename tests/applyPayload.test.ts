import { beforeEach, describe, expect, it } from 'vitest';
import { NabzDB } from '../src/db/schema';
import { applyPayload } from '../src/sync/apply';
import { parsePayload } from '../src/sync/payload';

const S = 1000, M = 60_000;
const iso = (t: number) => new Date(t).toISOString();
// 2026-11-18 in Tehran: 00:00 local = 2026-11-17T20:30Z
const DAY0 = Date.UTC(2026, 10, 17, 20, 30);
const at = (h: number, m = 0) => DAY0 + h * 60 * M + m * M;

function strengthHr(from: number, mins: number): [string, number][] {
  const out: [string, number][] = [];
  for (let t = 0; t < mins * M; t += 5 * S) {
    const ph = (t / S) % 150;
    out.push([iso(from + t), Math.round(ph < 45 ? 95 + 55 * (ph / 45) : 150 - 50 * Math.min(1, (ph - 45) / 60))]);
  }
  return out;
}

function payloadText() {
  const queued = { start: iso(at(18)), end: iso(at(18, 45)), activeKcal: 310, hr: strengthHr(at(18), 45) };
  const baseline: [string, number][] = [];
  for (let t = at(7); t < at(23); t += 5 * M) if (t < at(17, 55) || t > at(19)) baseline.push([iso(t), 72]);
  const missed = strengthHr(at(10), 35); // a workout with no automation record
  return JSON.stringify({
    v: 1,
    generatedAt: iso(at(23, 30)),
    since: iso(at(0)),
    workouts: [queued],
    samples: {
      heartRate: [...baseline, ...missed],
      restingHR: [[iso(at(8)), 57]],
      hrvSDNN: [[iso(at(3)), 50], [iso(at(4)), 46]],
      sleep: [
        [iso(at(-0.5)), iso(at(3)), 'Core', 'Apple Watch'],
        [iso(at(3)), iso(at(4)), 'Deep', 'Apple Watch'],
        [iso(at(4)), iso(at(6, 50)), 'REM', 'Apple Watch'],
        [iso(at(-1)), iso(at(7)), 'In Bed', 'iPhone'],
      ],
      activeEnergy: [[iso(at(18)), iso(at(18, 45)), 300, 'Apple Watch'], [iso(at(12)), iso(at(13)), 40, 'Apple Watch']],
      exerciseMinutes: [[iso(at(10)), iso(at(10, 30)), 30, 'Apple Watch'], [iso(at(18)), iso(at(18, 45)), 45, 'Apple Watch']],
      steps: [[iso(at(9)), iso(at(10)), 3000, 'Apple Watch'], [iso(at(9)), iso(at(10)), 2800, 'iPhone'], [iso(at(14)), iso(at(15)), 1000, 'Apple Watch']],
    },
  });
}

let n = 0, db: NabzDB;
beforeEach(() => { db = new NabzDB(`apply-${n++}`); });

describe('applyPayload', () => {
  it('stores queued and inferred workouts, HR, samples and day metrics', async () => {
    const s = await applyPayload(db, parsePayload(payloadText()), at(23, 31));
    expect(s).toMatchObject({ workouts: 1, inferred: 1, days: 1 });
    expect(s.guessed).toHaveLength(2);

    const ws = await db.workouts.orderBy('start').toArray();
    expect(ws.map((w) => w.source)).toEqual(['inferred', 'shortcut']);
    for (const w of ws) {
      expect(w.typeSource).toBe('guessed');
      expect(w.type).toBe('strength');
      expect(w.load).toBeGreaterThan(0);
      expect(w.zones).toBeDefined();
    }
    expect(ws[1].energyKcal).toBe(310);
    expect(await db.hrSamples.where('workoutId').equals(ws[1].id).count()).toBeGreaterThan(500);
    expect(await db.hrBuckets.count()).toBeGreaterThan(100);

    const d = (await db.dailyMetrics.get('2026-11-18'))!;
    expect(d.steps).toBe(4000); // Watch (3000 + 1000) beats iPhone (2800)
    expect(d.activeEnergy).toBe(340);
    expect(d.exerciseMin).toBe(75);
    expect(d.restingHR).toBe(57);
    expect(d.hrvSDNN).toBe(48);
    expect(d.sleepMin).toBe(440); // in-bed from the iPhone doesn't count
    expect(d.sleepStages?.deep).toBe(60);
    expect((await db.settings.get('lastSync'))?.value).toBe(at(23, 30));
  });

  it('is idempotent', async () => {
    const p = parsePayload(payloadText());
    await applyPayload(db, p);
    const snap = async () => ({
      w: await db.workouts.toArray(), hr: await db.hrSamples.count(), b: await db.hrBuckets.toArray(),
      s: await db.samples.count(), i: await db.intervalSamples.count(), d: await db.dailyMetrics.toArray(),
    });
    const a = await snap();
    await applyPayload(db, p);
    expect(await snap()).toEqual(a);
  });

  it('never lowers totals the export already aggregated', async () => {
    await db.dailyMetrics.put({ date: '2026-11-18', steps: 9000, sleepMin: 470 });
    await applyPayload(db, parsePayload(payloadText()));
    const d = (await db.dailyMetrics.get('2026-11-18'))!;
    expect(d.steps).toBe(9000);
    expect(d.sleepMin).toBe(470);
  });

  it('does not duplicate a workout that an export already has', async () => {
    await db.workouts.put({ id: `x${at(18)}`, start: at(18), end: at(18, 45), durationSec: 2700, type: 'hiit', typeSource: 'health', source: 'export' });
    const s = await applyPayload(db, parsePayload(payloadText()));
    expect(s.skipped).toBe(1);
    const ws = await db.workouts.toArray();
    expect(ws.filter((w) => w.start >= at(17)).map((w) => w.id)).toEqual([`x${at(18)}`]);
  });
});
