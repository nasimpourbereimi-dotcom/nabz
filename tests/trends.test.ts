import { describe, expect, it } from 'vitest';
import { change, dailySeries, heatmap, rangeStart, rolling, weekly } from '../src/analytics/trends';
import { addDays } from '../src/analytics/dates';

describe('trends', () => {
  it('clamps the range to the first day with data', () => {
    expect(rangeStart('3m', '2026-11-19')).toBe('2026-08-21');
    expect(rangeStart('1y', '2026-11-19', '2026-06-01')).toBe('2026-06-01');
    expect(rangeStart('all', '2026-11-19', '2024-01-01')).toBe('2024-01-01');
  });

  it('rolls by calendar days and skips gaps', () => {
    const s = [
      { date: '2026-11-01', v: 10 }, { date: '2026-11-02' }, { date: '2026-11-03', v: 20 },
      { date: '2026-11-10', v: 40 },
    ];
    expect(rolling(s, 7)).toEqual([10, 10, 15, 40]);
  });

  it('builds daily series with gaps', () => {
    const s = dailySeries([{ date: '2026-11-02', restingHR: 58 }], 'restingHR', '2026-11-01', '2026-11-03');
    expect(s).toEqual([{ date: '2026-11-01', v: undefined }, { date: '2026-11-02', v: 58 }, { date: '2026-11-03', v: undefined }]);
  });

  it('sums per Saturday week including empty weeks', () => {
    const items = [{ d: '2026-11-14', m: 30 }, { d: '2026-11-19', m: 45 }, { d: '2026-11-01', m: 20 }];
    const w = weekly(items, (x) => x.d, (x) => x.m, '2026-11-01', '2026-11-19');
    expect(w).toEqual([
      { week: '2026-10-31', v: 20 }, { week: '2026-11-07', v: 0 }, { week: '2026-11-14', v: 75 },
    ]);
  });

  it('measures change between the two ends of a range', () => {
    const s = Array.from({ length: 90 }, (_, i) => ({ date: addDays('2026-08-01', i), v: i < 45 ? 60 : 57 }));
    expect(change(s)).toEqual({ from: 60, to: 57, delta: -3 });
    expect(change(s.slice(0, 30))).toBeUndefined();
    expect(change(s.map((p, i) => (i % 5 ? { date: p.date } : p)))).toBeUndefined(); // too sparse
  });

  it('lays out a Saturday-first heatmap', () => {
    const h = heatmap(new Map([['2026-11-19', 50], ['2026-11-14', 10]]), '2026-11-14', '2026-11-20');
    expect(h.weeks).toBe(1);
    expect(h.cells.find((c) => c.date === '2026-11-14')).toMatchObject({ row: 0, level: 1 });
    expect(h.cells.find((c) => c.date === '2026-11-19')).toMatchObject({ row: 5, level: 3 });
  });
});
