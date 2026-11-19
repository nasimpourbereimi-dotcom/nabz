// Monthly "Wrapped" numbers. Pure: the caller passes day keys and month ranges.
import type { DailyMetrics, Workout } from '../db/types';
import { streaks } from './habits';
import { bestOf, MIN_FOR_RECORD, RECORD_VALUE, type RecordKind } from './records';
import { daysBetween } from './dates';

export interface MonthStats {
  sessions: number;
  prevSessions: number;
  totalMin: number;
  kcal: number;
  topType?: string;
  activeDays: number;
  daysInMonth: number;
  bestStreak: number;
  perWeek: number;
  best: Partial<Record<RecordKind, Workout>>;
  /** record kinds where this month's best beats everything before the month */
  allTime: RecordKind[];
  restingHR?: { value: number; prev?: number };
  hrv?: { value: number; prev?: number };
  sleepMin?: number;
}

const inRange = (k: string, [a, b]: [string, string]) => k >= a && k < b;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

export function monthStats(opts: {
  workouts: Workout[];
  dayOf: (w: Workout) => string;
  days: DailyMetrics[];
  range: [string, string];
  prevRange: [string, string];
  activeDays: Set<string>;
}): MonthStats {
  const { workouts, dayOf, days, range, prevRange } = opts;
  const ws = workouts.filter((w) => inRange(dayOf(w), range));
  const before = workouts.filter((w) => dayOf(w) < range[0]);

  const typeCount = new Map<string, number>();
  for (const w of ws) typeCount.set(w.type, (typeCount.get(w.type) ?? 0) + 1);
  const topType = [...typeCount].sort((a, b) => b[1] - a[1])[0]?.[0];

  const best = bestOf(ws);
  const allTime: RecordKind[] = [];
  for (const kind of Object.keys(best) as RecordKind[]) {
    const prev = before.map(RECORD_VALUE[kind]).filter((x): x is number => x !== undefined);
    const v = RECORD_VALUE[kind](best[kind]!)!;
    if (prev.length >= MIN_FOR_RECORD && v > Math.max(...prev)) allTime.push(kind);
  }

  const monthActive = new Set([...opts.activeDays].filter((d) => inRange(d, range)));
  const daysInMonth = daysBetween(range[0], range[1]);
  const metric = (r: [string, string], k: 'restingHR' | 'hrvSDNN' | 'sleepMin') =>
    mean(days.filter((d) => inRange(d.date, r) && typeof d[k] === 'number').map((d) => d[k] as number));
  const rhr = metric(range, 'restingHR'), rhrPrev = metric(prevRange, 'restingHR');
  const hrv = metric(range, 'hrvSDNN'), hrvPrev = metric(prevRange, 'hrvSDNN');
  const sleep = metric(range, 'sleepMin');
  const r1 = (x?: number) => (x === undefined ? undefined : Math.round(x));

  return {
    sessions: ws.length,
    prevSessions: workouts.filter((w) => inRange(dayOf(w), prevRange)).length,
    totalMin: Math.round(ws.reduce((a, w) => a + w.durationSec / 60, 0)),
    kcal: Math.round(ws.reduce((a, w) => a + (w.energyKcal ?? 0), 0)),
    topType,
    activeDays: monthActive.size,
    daysInMonth,
    bestStreak: streaks(monthActive, range[1]).best,
    perWeek: Math.round((ws.length / daysInMonth) * 7 * 10) / 10,
    best,
    allTime,
    restingHR: rhr !== undefined ? { value: r1(rhr)!, prev: r1(rhrPrev) } : undefined,
    hrv: hrv !== undefined ? { value: r1(hrv)!, prev: r1(hrvPrev) } : undefined,
    sleepMin: r1(sleep),
  };
}
