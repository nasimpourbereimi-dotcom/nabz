import { describe, expect, it } from 'vitest';
import {
  ageAt, detectSets, estimateProfile, hrRecovery1m, hrStats, tanakaMaxHR, trimp, trimpFromAverage, zoneBounds, zoneOf,
  zoneSeconds, type HrPoint,
} from '../src/analytics/hr';
import { loadSeries, weekVsUsual } from '../src/analytics/load';
import { addDays, weekdaySat0, weekStart } from '../src/analytics/dates';
import { readiness } from '../src/analytics/readiness';
import { streaks, weekSummary } from '../src/analytics/habits';
import { efficiencyWin, recoveryWin, sessionScore, sleepEffect, weeklySuggestion } from '../src/analytics/insights';
import type { DailyMetrics, Workout } from '../src/db/types';

const S = 1000, M = 60_000;
const P = { maxHR: 190, restHR: 60, source: 'manual' as const };
const flat = (bpm: number, from: number, to: number, step = 5 * S): HrPoint[] => {
  const xs: HrPoint[] = [];
  for (let t = from; t <= to; t += step) xs.push({ t, bpm });
  return xs;
};

describe('hr profile', () => {
  it('computes age and Tanaka max', () => {
    expect(ageAt('1992-03-14', Date.UTC(2026, 10, 19))).toBe(34);
    expect(ageAt('1992-12-14', Date.UTC(2026, 10, 19))).toBe(33);
    expect(tanakaMaxHR(34)).toBe(184);
  });
  it('prefers observed max when the watch saw higher than the formula', () => {
    const p = estimateProfile({ age: 34, workoutMaxes: [170, 188, 192, 195, 190, 186], restingHRs: [58, 60, 57] });
    expect(p.source).toBe('observed');
    expect(p.maxHR).toBeGreaterThan(184);
    expect(p.restHR).toBe(58);
    expect(estimateProfile({ age: 34, workoutMaxes: [150, 160], restingHRs: [] })).toMatchObject({ maxHR: 184, source: 'age', restHR: 60 });
    expect(estimateProfile({ workoutMaxes: [], restingHRs: [] })).toMatchObject({ maxHR: 190, source: 'default' });
  });
  it('maps bpm to zones', () => {
    const b = zoneBounds(200); // 120/140/160/180
    expect([100, 120, 145, 165, 185].map((x) => zoneOf(x, b))).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('workout HR math', () => {
  it('splits time into zones and caps gaps', () => {
    const xs = [...flat(100, 0, 10 * M), ...flat(170, 10 * M + 5 * S, 20 * M)];
    const z = zoneSeconds(xs, 0, 20 * M, 190);
    expect(Math.abs(z[0] - 600)).toBeLessThanOrEqual(10);
    expect(Math.abs(z[3] - 600)).toBeLessThanOrEqual(10);
    // a 5-minute hole is not credited
    const holey = [...flat(150, 0, M), ...flat(150, 6 * M, 7 * M)];
    expect(zoneSeconds(holey, 0, 7 * M, 190).reduce((a, b) => a + b)).toBeLessThan(160);
  });
  it('TRIMP grows with intensity and matches the average-HR fallback for flat HR', () => {
    const easy = trimp(flat(110, 0, 30 * M), 0, 30 * M, P);
    const hard = trimp(flat(160, 0, 30 * M), 0, 30 * M, P);
    expect(hard).toBeGreaterThan(easy * 2);
    expect(trimpFromAverage(30 * 60, 160, P)).toBeCloseTo(hard, 0);
  });
  it('measures 1-minute recovery from the tail', () => {
    const end = 30 * M;
    const xs = [...flat(150, end - 30 * S, end), { t: end + 60 * S, bpm: 118 }];
    expect(hrRecovery1m(xs, end)).toBe(32);
    expect(hrRecovery1m(flat(150, 0, end), end)).toBeUndefined();
  });
  it('hrStats is time-weighted', () => {
    expect(hrStats([...flat(100, 0, 10 * M), ...flat(160, 10 * M + 5 * S, 20 * M)], 0, 20 * M)?.avg).toBeCloseTo(130, -1);
  });
  it('counts strength sets and judges rest regularity', () => {
    const xs: HrPoint[] = [];
    for (let t = 0; t < 9 * 150 * S; t += 5 * S) {
      const ph = (t / S) % 150;
      xs.push({ t, bpm: ph < 45 ? 95 + 55 * (ph / 45) : 150 - 50 * Math.min(1, (ph - 45) / 60) });
    }
    const r = detectSets(xs, 0, 9 * 150 * S);
    expect(r.peaks.length).toBeGreaterThanOrEqual(8);
    expect(r.peaks.length).toBeLessThanOrEqual(9);
    expect(r.regular).toBe(true);
    expect(detectSets(flat(120, 0, 30 * M), 0, 30 * M).peaks).toEqual([]);
  });
});

describe('dates', () => {
  it('Iranian week starts on Saturday', () => {
    expect(weekdaySat0('2026-11-21')).toBe(0); // Saturday
    expect(weekdaySat0('2026-11-20')).toBe(6); // Friday
    expect(weekStart('2026-11-19')).toBe('2026-11-14');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('load', () => {
  it('builds CTL/ATL/TSB and fills rest days', () => {
    const m = new Map([['2026-11-01', 100], ['2026-11-03', 100]]);
    const s = loadSeries(m, '2026-11-05');
    expect(s.map((p) => p.date)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
    expect(s[0].atl).toBeGreaterThan(s[0].ctl); // fatigue reacts faster
    expect(s[1].tsb).toBeLessThan(0);
    expect(s[4].atl).toBeLessThan(s[3].atl);
  });
  it('converges to the daily load under constant training', () => {
    const m = new Map<string, number>();
    for (let i = 0; i < 300; i++) m.set(addDays('2026-01-01', i), 50);
    const last = loadSeries(m, addDays('2026-01-01', 299)).at(-1)!;
    expect(last.ctl).toBeCloseTo(50, 0);
    expect(Math.abs(last.tsb)).toBeLessThan(1);
  });
  it('compares this week with the usual one', () => {
    const m = new Map<string, number>();
    for (let i = 7; i < 35; i += 2) m.set(addDays('2026-11-19', -i), 50);
    for (let i = 0; i < 7; i++) m.set(addDays('2026-11-19', -i), 50);
    const r = weekVsUsual(m, '2026-11-19')!;
    expect(r.ratio).toBeGreaterThan(1.5);
    expect(weekVsUsual(new Map([['2026-11-19', 10]]), '2026-11-19')).toBeUndefined();
    expect(weeklySuggestion(r.ratio)).toMatchObject({ kind: 'heavy' });
    expect(weeklySuggestion(0.5)).toEqual({ kind: 'light' });
    expect(weeklySuggestion(1)).toEqual({ kind: 'steady' });
  });
});

describe('readiness', () => {
  const history = (n: number, f: (i: number) => Partial<DailyMetrics>): DailyMetrics[] =>
    Array.from({ length: n }, (_, i) => ({ date: addDays('2026-11-19', -(n - i)), ...f(i) }));
  const base = history(30, (i) => ({ hrvSDNN: 45 + (i % 5), restingHR: 58 + (i % 3), sleepMin: 420 }));

  it('needs a baseline first', () => {
    expect(readiness([...history(3, () => ({ hrvSDNN: 50, restingHR: 58 })), { date: '2026-11-19', hrvSDNN: 50, restingHR: 58 }], '2026-11-19')).toBeUndefined();
  });
  it('is high on a good day and easy on a rough one', () => {
    const good = readiness([...base, { date: '2026-11-19', hrvSDNN: 56, restingHR: 55, sleepMin: 470 }], '2026-11-19')!;
    const rough = readiness([...base, { date: '2026-11-19', hrvSDNN: 36, restingHR: 64, sleepMin: 300 }], '2026-11-19')!;
    expect(good.level).toBe('high');
    expect(rough.level).toBe('easy');
    expect(good.hrv!.delta).toBeGreaterThan(0);
    expect(good.rhr!.delta).toBeLessThan(0);
    const normal = readiness([...base, { date: '2026-11-19', hrvSDNN: 47, restingHR: 59, sleepMin: 420 }], '2026-11-19')!;
    expect(normal.score).toBeGreaterThanOrEqual(60);
    expect(normal.score).toBeLessThanOrEqual(80);
  });
  it('falls back to yesterday in the morning', () => {
    const r = readiness(base, '2026-11-19');
    expect(r?.date).toBe('2026-11-18');
  });
});

describe('habits', () => {
  it('forgives one rest day, not two', () => {
    const d = (k: number) => addDays('2026-11-19', -k);
    const s = new Set([d(0), d(1), d(3), d(4), d(5), d(8), d(9)]);
    expect(streaks(s, d(0))).toEqual({ current: 5, best: 5 });
    expect(streaks(new Set([d(2), d(3)]), d(0)).current).toBe(2); // yesterday was rest, still alive
    expect(streaks(new Set([d(3), d(4)]), d(0)).current).toBe(0);
  });
  it('summarises the current Saturday-first week', () => {
    const w = weekSummary(
      [{ date: '2026-11-14', durationSec: 3000 }, { date: '2026-11-19', durationSec: 1800 }, { date: '2026-11-13', durationSec: 999 }],
      '2026-11-19',
    );
    expect(w.minutesByDay).toEqual([50, 0, 0, 0, 0, 30, 0]);
    expect(w).toMatchObject({ sessions: 2, totalMin: 80 });
  });
});

describe('insights', () => {
  let n = 0;
  const w = (o: Partial<Workout>): Workout => ({
    id: `w${n++}`, start: n * 86_400_000, end: n * 86_400_000 + 45 * M, durationSec: 45 * 60, type: 'strength',
    typeSource: 'health', source: 'export', ...o,
  });
  const hist = Array.from({ length: 8 }, (_, i) => w({ load: 40 + i * 5, hrRecovery1m: 20 + i, hrAvg: 130 + (i % 3) }));

  it('scores a session against the same type only', () => {
    const big = w({ load: 200 });
    expect(sessionScore(big, hist)).toMatchObject({ score: 100, tier: 'big' });
    expect(sessionScore(w({ load: 200, type: 'walk' }), hist)).toBeUndefined();
  });
  it('reports recovery and efficiency only when favourable', () => {
    expect(recoveryWin(w({ hrRecovery1m: 32 }), hist)).toEqual({ drop: 32, betterThanPct: 100 });
    expect(recoveryWin(w({ hrRecovery1m: 15 }), hist)).toBeUndefined();
    expect(efficiencyWin(w({ hrAvg: 124 }), hist)).toMatchObject({ sessions: 5 });
    expect(efficiencyWin(w({ hrAvg: 140 }), hist)).toBeUndefined();
  });
  it('finds the sleep effect when rested sessions are longer', () => {
    const ws = Array.from({ length: 10 }, (_, i) => w({ durationSec: i < 5 ? 3600 : 2400, hrAvg: i < 5 ? 125 : 132 }));
    const sleep = (x: Workout) => (ws.indexOf(x) < 5 ? 450 : 330);
    const r = sleepEffect(ws, sleep)!;
    expect(r.longerPct).toBeGreaterThanOrEqual(40);
    expect(r.easierPct).toBeGreaterThan(0);
    expect(sleepEffect(ws.slice(0, 4), sleep)).toBeUndefined();
  });
});
