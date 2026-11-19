// Training load over time (Banister fitness–fatigue model). Pure functions.
// UI labels: CTL = آمادگی, ATL = بار اخیر, TSB = فرم (never "fatigue" — CLAUDE.md §7).
import { addDays } from './dates';

export interface LoadPoint { date: string; load: number; ctl: number; atl: number; tsb: number }

const CTL_DAYS = 42;
const ATL_DAYS = 7;

/** Daily load series from the first loaded day through `until` (inclusive). */
export function loadSeries(dailyLoad: Map<string, number>, until: string): LoadPoint[] {
  const days = [...dailyLoad.keys()].filter((d) => d <= until).sort();
  if (!days.length) return [];
  const kc = 1 - Math.exp(-1 / CTL_DAYS);
  const ka = 1 - Math.exp(-1 / ATL_DAYS);
  const out: LoadPoint[] = [];
  let ctl = 0, atl = 0;
  for (let d = days[0]; d <= until; d = addDays(d, 1)) {
    const load = dailyLoad.get(d) ?? 0;
    // TSB is "form going into the day": yesterday's fitness minus yesterday's fatigue
    const tsb = ctl - atl;
    ctl += (load - ctl) * kc;
    atl += (load - atl) * ka;
    out.push({ date: d, load, ctl: round1(ctl), atl: round1(atl), tsb: round1(tsb) });
  }
  return out;
}

/**
 * Last 7 days vs your usual week (mean of the 4 weeks before). Used only to phrase a friendly suggestion.
 * Returns undefined until there are 4 earlier weeks with some training.
 */
export function weekVsUsual(dailyLoad: Map<string, number>, today: string): { ratio: number; last7: number; usual: number } | undefined {
  const sum = (from: number, to: number) => {
    let s = 0;
    for (let i = from; i < to; i++) s += dailyLoad.get(addDays(today, -i)) ?? 0;
    return s;
  };
  const last7 = sum(0, 7);
  const weeks = [sum(7, 14), sum(14, 21), sum(21, 28), sum(28, 35)];
  if (weeks.filter((w) => w > 0).length < 4) return undefined;
  const usual = weeks.reduce((a, b) => a + b, 0) / 4;
  if (usual <= 0) return undefined;
  return { ratio: last7 / usual, last7, usual };
}

export function sumByDay<T>(items: T[], day: (x: T) => string, value: (x: T) => number | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of items) {
    const v = value(x);
    if (v === undefined || !Number.isFinite(v)) continue;
    const d = day(x);
    m.set(d, (m.get(d) ?? 0) + v);
  }
  return m;
}

const round1 = (x: number) => Math.round(x * 10) / 10;
