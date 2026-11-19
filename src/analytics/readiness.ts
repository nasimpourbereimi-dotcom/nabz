// Today's readiness 0–100, relative to the owner's own last 30 days only. Pure.
import type { DailyMetrics } from '../db/types';
import { addDays } from './dates';

export interface Readiness {
  date: string; // day the numbers come from
  score: number;
  level: 'high' | 'normal' | 'easy';
  hrv?: { value: number; delta: number };
  rhr?: { value: number; delta: number };
  sleep?: { min: number; delta: number };
}

export const BASELINE_DAYS = 30;
export const MIN_BASELINE = 7;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};
const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));

/**
 * Score = 0.45·HRV + 0.30·resting HR + 0.25·sleep, each component 0..100 where 70 = "your normal".
 * HRV/RHR use z-scores vs the 30-day baseline (SD floored so tiny day-to-day noise isn't amplified).
 * Returns undefined when there is not enough history ("هنوز داریم یادت می‌گیریم").
 */
export function readiness(days: DailyMetrics[], today: string): Readiness | undefined {
  const byDate = new Map(days.map((d) => [d.date, d]));
  // Morning view: today's values if they exist, else yesterday's.
  const pick = <K extends keyof DailyMetrics>(k: K) => byDate.get(today)?.[k] ?? byDate.get(addDays(today, -1))?.[k];
  const hrvToday = pick('hrvSDNN') as number | undefined;
  const rhrToday = pick('restingHR') as number | undefined;
  const sleepToday = pick('sleepMin') as number | undefined;

  const base = (k: 'hrvSDNN' | 'restingHR' | 'sleepMin') => {
    const xs: number[] = [];
    for (let i = 1; i <= BASELINE_DAYS; i++) {
      const v = byDate.get(addDays(today, -i))?.[k];
      if (typeof v === 'number') xs.push(v);
    }
    return xs;
  };
  const hrvBase = base('hrvSDNN'), rhrBase = base('restingHR'), sleepBase = base('sleepMin');
  if (hrvToday === undefined || rhrToday === undefined) return undefined;
  if (hrvBase.length < MIN_BASELINE || rhrBase.length < MIN_BASELINE) return undefined;

  const hrvM = mean(hrvBase), rhrM = mean(rhrBase);
  const zH = (hrvToday - hrvM) / Math.max(sd(hrvBase), hrvM * 0.08);
  const zR = (rhrToday - rhrM) / Math.max(sd(rhrBase), 1.5);
  const hrvC = clamp(70 + 15 * zH);
  const rhrC = clamp(70 - 15 * zR);

  let sleepC = 70;
  let sleep: Readiness['sleep'];
  if (sleepToday !== undefined) {
    const target = Math.max(420, sleepBase.length >= MIN_BASELINE ? mean(sleepBase) : 420);
    sleepC = clamp((sleepToday / target) * 85);
    sleep = { min: sleepToday, delta: sleepBase.length ? Math.round(sleepToday - mean(sleepBase)) : 0 };
  }
  const score = Math.round(0.45 * hrvC + 0.3 * rhrC + 0.25 * sleepC);
  return {
    date: byDate.get(today)?.hrvSDNN !== undefined ? today : addDays(today, -1),
    score,
    level: score >= 75 ? 'high' : score >= 55 ? 'normal' : 'easy',
    hrv: { value: Math.round(hrvToday), delta: Math.round(hrvToday - hrvM) },
    rhr: { value: Math.round(rhrToday), delta: Math.round(rhrToday - rhrM) },
    sleep,
  };
}
