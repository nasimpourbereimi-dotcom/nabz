import { describe, expect, it } from 'vitest';
import { candidates, pick, type Candidate } from '../src/analytics/insightEngine';
import { learningProgress } from '../src/analytics/learning';
import { addDays } from '../src/analytics/dates';
import type { Workout } from '../src/db/types';

const DAY = 86_400_000;
const today = '2026-11-19';
const t0 = Date.UTC(2026, 10, 19, 12);
let n = 0;
const w = (daysAgo: number, o: Partial<Workout> = {}): Workout => ({
  id: `w${n++}`, start: t0 - daysAgo * DAY, end: t0 - daysAgo * DAY + 2700_000, durationSec: 2700, type: 'strength',
  typeSource: 'health', source: 'export', energyKcal: 300, load: 50, hrRecovery1m: 25, hrAvg: 130, ...o,
});
const dayOf = (x: Workout) => new Date(x.start).toISOString().slice(0, 10);

describe('insight candidates', () => {
  it('only produces wins and useful suggestions', () => {
    const hist = Array.from({ length: 14 }, (_, i) => w(30 - i * 2));
    const rec = w(2, { durationSec: 5000 });
    const cs = candidates({
      today, workouts: [...hist, rec], dayOf,
      golden: { from: 18, to: 20, betterPct: 12, sessions: 6 },
      sleep: { longerPct: 10, easierPct: 3, samples: 12 },
      streak: { current: 9, best: 9 },
      hrvChange: { delta: 3 }, rhrChange: { delta: 0.5 }, weekRatio: 1.4,
    });
    const types = cs.map((c) => c.data.type).sort();
    expect(types).toContain('record');
    expect(types).toContain('golden');
    expect(types).toContain('sleep');
    expect(types).toContain('streakBest');
    expect(types).toContain('hrvUp');
    expect(types).not.toContain('rhrDown'); // resting HR went up: say nothing
    expect(types).not.toContain('weekMore'); // a heavy week is the weekly suggestion's job
    expect(cs.find((c) => c.data.type === 'record')!.id).toBe(`record:longest:${rec.id}`);
  });
});

describe('pick', () => {
  const c = (id: string, positivity: number, confidence = 1): Candidate => ({ id, kind: 'info', data: { type: 'consistency', perWeek: 3 }, positivity, confidence });

  it('prefers new, positive, confident findings', () => {
    expect(pick([c('a', 0.7), c('b', 0.9)], new Map(), today)?.id).toBe('b');
  });
  it('never repeats within a week, and favours what has not been seen for long', () => {
    const shown = new Map([['b', addDays(today, -2)]]);
    expect(pick([c('a', 0.7), c('b', 0.9)], shown, today)?.id).toBe('a');
    const old = new Map([['b', addDays(today, -8)]]);
    expect(pick([c('a', 0.8), c('b', 0.9)], old, today)?.id).toBe('a'); // b seen 8 days ago → low novelty
    expect(pick([c('b', 0.9)], new Map([['b', today]]), today)).toBeUndefined();
  });
  it('is deterministic on ties', () => {
    expect(pick([c('z', 0.8), c('m', 0.8)], new Map(), today)?.id).toBe('m');
  });
});

describe('learning progress', () => {
  it('reports what each insight still needs', () => {
    const ws = [w(1), w(3), w(5, { type: 'walk', typeSource: 'confirmed', features: { intensity: 0.5, peakIntensity: 0.6, setsPer10: 0, variability: 0.03, stepsPerMin: 100 } })];
    const items = learningProgress({
      workouts: ws, today,
      days: Array.from({ length: 4 }, (_, i) => ({ date: addDays(today, -1 - i), hrvSDNN: 50, restingHR: 58 })),
      hourOf: () => 18, sleepBefore: () => 450,
    });
    const by = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(by.readiness).toMatchObject({ have: 4, need: 7, done: false });
    expect(by.compare).toMatchObject({ have: 2, need: 6, detail: 'strength' });
    expect(by.types).toMatchObject({ have: 1, need: 6 });
    expect(by.golden).toMatchObject({ have: 3, need: 6 });
    expect(by.sleep).toMatchObject({ have: 3, need: 6 });
  });
});
