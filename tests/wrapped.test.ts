import { describe, expect, it } from 'vitest';
import { bestOf, goldenHour, recordsSetBy } from '../src/analytics/records';
import { monthStats } from '../src/analytics/wrapped';
import { addJMonths, jmonthName, jmonthOf, jmonthRange } from '../src/lib/jalaliMonth';
import { tehranHour } from '../src/lib/time';
import type { Workout } from '../src/db/types';

const H = 3_600_000;
let n = 0;
const w = (o: Partial<Workout> & { start: number }): Workout => ({
  id: `w${n++}`, end: o.start + (o.durationSec ?? 2700) * 1000, durationSec: 2700, type: 'strength',
  typeSource: 'health', source: 'export', ...o,
});

describe('jalali months', () => {
  it('maps day keys to Jalali months and back', () => {
    expect(jmonthOf('2026-11-19')).toEqual({ y: 1405, m: 8 });
    expect(jmonthRange({ y: 1405, m: 8 })).toEqual(['2026-10-23', '2026-11-22']);
    expect(jmonthRange({ y: 1405, m: 12 })[1]).toBe('2027-03-21'); // Nowruz 1406
    expect(addJMonths({ y: 1405, m: 12 }, 1)).toEqual({ y: 1406, m: 1 });
    expect(addJMonths({ y: 1405, m: 1 }, -1)).toEqual({ y: 1404, m: 12 });
    expect(jmonthName({ y: 1405, m: 7 })).toBe('مهر');
  });
  it('gives Tehran hours', () => {
    expect(tehranHour(Date.UTC(2026, 10, 19, 15, 0))).toBe(18);
    expect(tehranHour(Date.UTC(2026, 10, 19, 20, 30))).toBe(0);
  });
});

describe('records', () => {
  const hist = Array.from({ length: 6 }, (_, i) => w({ start: i * 24 * H, durationSec: 2400 + i * 60, energyKcal: 300, load: 50, hrRecovery1m: 25 }));
  it('flags a workout that beats everything before it', () => {
    const big = w({ start: 10 * 24 * H, durationSec: 4000, energyKcal: 290, load: 80, hrRecovery1m: 25 });
    expect(recordsSetBy(big, [...hist, big]).sort()).toEqual(['highestLoad', 'longest']);
    expect(recordsSetBy(hist[2], hist)).toEqual([]); // not enough history before it
  });
  it('picks the best per kind', () => {
    const b = bestOf(hist);
    expect(b.longest?.durationSec).toBe(2700);
    expect(b.mostKcal).toBeDefined();
  });
  it('finds the golden hour only when it clearly stands out', () => {
    const at = (h: number, kcal: number) => w({ start: Date.UTC(2026, 10, 1, h - 4, 30), durationSec: 3000, energyKcal: kcal, hrAvg: 130 });
    // 18–20 Tehran: more kcal at the same HR
    const ws = [at(18, 420), at(19, 430), at(18, 410), at(8, 300), at(9, 310), at(8, 305), at(13, 320), at(13, 300), at(12, 310)];
    expect(goldenHour(ws, tehranHour)).toMatchObject({ from: 18, to: 20, sessions: 3 });
    const flat = ws.map((x) => ({ ...x, energyKcal: 300 }));
    expect(goldenHour(flat, tehranHour)).toBeUndefined();
  });
});

describe('monthStats', () => {
  const day = (k: string, hour = 15) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10), hour);
  const key = (x: Workout) => new Date(x.start).toISOString().slice(0, 10);
  const range: [string, string] = ['2026-09-23', '2026-10-23']; // Mehr 1405
  const prev: [string, string] = ['2026-08-23', '2026-09-23'];
  const before = Array.from({ length: 8 }, (_, i) => w({ start: day(`2026-09-0${i + 1}`), energyKcal: 300, durationSec: 2400 }));
  const inMonth = [
    w({ start: day('2026-09-25'), energyKcal: 350, durationSec: 3000 }),
    w({ start: day('2026-09-26'), energyKcal: 500, durationSec: 5400, type: 'walk' }),
    w({ start: day('2026-10-01'), energyKcal: 320, durationSec: 2700 }),
  ];
  it('summarises the month against the previous one', () => {
    const s = monthStats({
      workouts: [...before, ...inMonth], dayOf: key, range, prevRange: prev,
      days: [
        { date: '2026-09-25', restingHR: 56, hrvSDNN: 50, sleepMin: 440 },
        { date: '2026-09-26', restingHR: 58, hrvSDNN: 54, sleepMin: 400 },
        { date: '2026-09-10', restingHR: 60, hrvSDNN: 45 },
      ],
      activeDays: new Set(['2026-09-25', '2026-09-26', '2026-09-27', '2026-10-01']),
    });
    expect(s).toMatchObject({ sessions: 3, prevSessions: 8, totalMin: 185, kcal: 1170, topType: 'strength', activeDays: 4, daysInMonth: 30, bestStreak: 3 });
    expect(s.allTime.sort()).toEqual(['longest', 'mostKcal']);
    expect(s.restingHR).toEqual({ value: 57, prev: 60 });
    expect(s.hrv).toEqual({ value: 52, prev: 45 });
    expect(s.sleepMin).toBe(420);
  });
});
