// Long-range trends for the Trends tab. Pure; input is day keys in the owner's timezone.
import type { DailyMetrics } from '../db/types';
import { addDays, dayIndex, weekStart } from './dates';

export type RangeKey = '3m' | '6m' | '1y' | 'all';
export const RANGE_DAYS: Record<Exclude<RangeKey, 'all'>, number> = { '3m': 91, '6m': 182, '1y': 365 };

export function rangeStart(range: RangeKey, today: string, firstDay?: string): string {
  if (range === 'all') return firstDay ?? addDays(today, -365);
  const from = addDays(today, -RANGE_DAYS[range] + 1);
  return firstDay && firstDay > from ? firstDay : from;
}

/** Trailing mean over `window` days (by calendar, not by count); undefined where no data in window. */
export function rolling(series: { date: string; v?: number }[], window: number): (number | undefined)[] {
  const out: (number | undefined)[] = [];
  let sum = 0, n = 0, lo = 0;
  for (let i = 0; i < series.length; i++) {
    const v = series[i].v;
    if (v !== undefined) { sum += v; n++; }
    while (dayIndex(series[i].date) - dayIndex(series[lo].date) >= window) {
      const old = series[lo].v;
      if (old !== undefined) { sum -= old; n--; }
      lo++;
    }
    out.push(n ? Math.round((sum / n) * 10) / 10 : undefined);
  }
  return out;
}

/** Daily series of one metric from `from` to `to` inclusive, gaps as undefined. */
export function dailySeries(days: DailyMetrics[], key: 'restingHR' | 'hrvSDNN' | 'sleepMin' | 'vo2max', from: string, to: string) {
  const by = new Map(days.map((d) => [d.date, d[key] as number | undefined]));
  const out: { date: string; v?: number }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push({ date: d, v: by.get(d) });
  return out;
}

/** Totals per Saturday-started week. */
export function weekly<T>(items: T[], dayOf: (x: T) => string, value: (x: T) => number, from: string, to: string) {
  const weeks = new Map<string, number>();
  for (let w = weekStart(from); w <= to; w = addDays(w, 7)) weeks.set(w, 0);
  for (const x of items) {
    const d = dayOf(x);
    if (d < from || d > to) continue;
    const w = weekStart(d);
    weeks.set(w, (weeks.get(w) ?? 0) + value(x));
  }
  return [...weeks].map(([week, v]) => ({ week, v }));
}

/**
 * Change between the first and last 21 days of a range (means). Undefined unless both ends have ≥ 7 values.
 * The UI only phrases it as a win when the direction is favourable; otherwise it says "steady" or nothing.
 */
export function change(series: { date: string; v?: number }[], edge = 21): { from: number; to: number; delta: number } | undefined {
  if (!series.length) return undefined;
  const first = series[0].date, last = series[series.length - 1].date;
  const a = series.filter((p) => p.v !== undefined && dayIndex(p.date) - dayIndex(first) < edge).map((p) => p.v!);
  const b = series.filter((p) => p.v !== undefined && dayIndex(last) - dayIndex(p.date) < edge).map((p) => p.v!);
  if (a.length < 7 || b.length < 7 || dayIndex(last) - dayIndex(first) < edge * 2) return undefined;
  const m = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const from = Math.round(m(a) * 10) / 10, to = Math.round(m(b) * 10) / 10;
  return { from, to, delta: Math.round((to - from) * 10) / 10 };
}

/** Activity heatmap cells: weeks as columns (Saturday-first rows), level 0..4 by minutes. */
export function heatmap(minutesByDay: Map<string, number>, from: string, to: string) {
  const start = weekStart(from);
  const cells: { date: string; col: number; row: number; level: 0 | 1 | 2 | 3 | 4; minutes: number; inRange: boolean }[] = [];
  for (let d = start; d <= to; d = addDays(d, 1)) {
    const i = dayIndex(d) - dayIndex(start);
    const m = minutesByDay.get(d) ?? 0;
    const level = (m <= 0 ? 0 : m < 20 ? 1 : m < 40 ? 2 : m < 60 ? 3 : 4) as 0 | 1 | 2 | 3 | 4;
    cells.push({ date: d, col: Math.floor(i / 7), row: i % 7, level, minutes: Math.round(m), inRange: d >= from });
  }
  return { cells, weeks: cells.length ? cells[cells.length - 1].col + 1 : 0 };
}
