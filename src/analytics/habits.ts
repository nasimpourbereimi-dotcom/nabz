// Consistency (forgiving streak) and this-week summary. Pure.
import { dayIndex, weekStart } from './dates';

export const ACTIVE_EXERCISE_MIN = 20;

/**
 * Forgiving streak (docs/product.md): a single rest day never breaks the run; two inactive days in a row do.
 * Counts active days in the run. Today not being active yet doesn't break anything.
 */
export function streaks(activeDays: Set<string>, today: string): { current: number; best: number } {
  const sorted = [...activeDays].filter((d) => d <= today).sort();
  let best = 0, run = 0, prev: string | undefined;
  for (const d of sorted) {
    run = prev !== undefined && dayIndex(d) - dayIndex(prev) <= 2 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  // current run is alive if the last active day is today, yesterday, or the day before (one rest day)
  const alive = prev !== undefined && dayIndex(today) - dayIndex(prev) <= 2;
  return { current: alive ? run : 0, best };
}

export interface WeekSummary {
  start: string;
  minutesByDay: number[]; // 7 entries, Saturday first
  sessions: number;
  totalMin: number;
}

export function weekSummary(workouts: { date: string; durationSec: number }[], today: string): WeekSummary {
  const start = weekStart(today);
  const minutesByDay = Array(7).fill(0) as number[];
  let sessions = 0, total = 0;
  for (const w of workouts) {
    const i = dayIndex(w.date) - dayIndex(start);
    if (i < 0 || i > 6) continue;
    minutesByDay[i] += w.durationSec / 60;
    sessions++;
    total += w.durationSec / 60;
  }
  return { start, minutesByDay: minutesByDay.map(Math.round), sessions, totalMin: Math.round(total) };
}

