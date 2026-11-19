// "We're still learning you" made visible (docs/product.md): what each insight needs and how far along it is.
import type { DailyMetrics, Workout } from '../db/types';
import { addDays } from './dates';
import { MIN_BASELINE } from './readiness';
import { MIN_HISTORY } from './insights';

export type LearnKey = 'readiness' | 'compare' | 'types' | 'golden' | 'sleep';
export interface LearnItem { key: LearnKey; have: number; need: number; done: boolean; detail?: string }

export function learningProgress(opts: {
  workouts: Workout[];
  days: DailyMetrics[];
  today: string;
  hourOf: (ms: number) => number;
  sleepBefore: (w: Workout) => number | undefined;
}): LearnItem[] {
  const { workouts, days, today } = opts;
  const items: LearnItem[] = [];
  const clamp = (have: number, need: number, key: LearnKey, detail?: string): LearnItem =>
    ({ key, have: Math.min(have, need), need, done: have >= need, detail });

  // Readiness: HRV & resting HR on ≥ 7 of the last 30 days
  const recent = days.filter((d) => d.date >= addDays(today, -30) && d.date < today);
  const both = recent.filter((d) => d.hrvSDNN !== undefined && d.restingHR !== undefined).length;
  items.push(clamp(both, MIN_BASELINE, 'readiness'));

  // Session comparisons: ≥ 5 sessions of your most common type
  const byType = new Map<string, number>();
  for (const w of workouts) byType.set(w.type, (byType.get(w.type) ?? 0) + 1);
  const [topType, topN] = [...byType].sort((a, b) => b[1] - a[1])[0] ?? ['strength', 0];
  items.push(clamp(topN, MIN_HISTORY + 1, 'compare', topType));

  // Type learning: 3 labelled sessions (Health or confirmed) with HR shape, for 2 types
  const labelled = new Map<string, number>();
  for (const w of workouts) if (w.features && (w.typeSource === 'health' || w.typeSource === 'confirmed')) labelled.set(w.type, (labelled.get(w.type) ?? 0) + 1);
  const ready = [...labelled.values()].filter((n) => n >= 3).length;
  const counts = [...labelled.values()].sort((a, b) => b - a);
  items.push(clamp(Math.min(counts[0] ?? 0, 3) + Math.min(counts[1] ?? 0, 3), 6, 'types', ready >= 2 ? undefined : topType));

  // Golden hour: 3 sessions in each of 2 different 2-hour windows
  const slots = new Map<number, number>();
  for (const w of workouts) if (w.energyKcal && w.hrAvg) { const s = Math.floor(opts.hourOf(w.start) / 2); slots.set(s, (slots.get(s) ?? 0) + 1); }
  const top2 = [...slots.values()].sort((a, b) => b - a);
  items.push(clamp(Math.min(top2[0] ?? 0, 3) + Math.min(top2[1] ?? 0, 3), 6, 'golden'));

  // Sleep effect: 3 workouts after > 7h and 3 after < 6h
  let good = 0, poor = 0;
  for (const w of workouts) { const s = opts.sleepBefore(w); if (s === undefined) continue; if (s >= 420) good++; else if (s < 360) poor++; }
  items.push(clamp(Math.min(good, 3) + Math.min(poor, 3), 6, 'sleep'));

  return items;
}
