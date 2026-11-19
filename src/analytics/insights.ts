// Comparisons of a workout against the owner's own history. Pure; returns data, the UI phrases it.
// Tone rule: only surface wins or neutral-useful facts; when a comparison isn't favourable, return nothing.
import type { Workout } from '../db/types';

export const MIN_HISTORY = 5;

export interface SessionScore { score: number; tier: 'big' | 'solid' | 'light' }

/** Load percentile among earlier workouts of the same type. Undefined until there are enough of them. */
export function sessionScore(w: Workout, history: Workout[]): SessionScore | undefined {
  if (w.load === undefined) return undefined;
  const same = history.filter((h) => h.id !== w.id && h.type === w.type && h.start < w.start && h.load !== undefined);
  if (same.length < MIN_HISTORY) return undefined;
  const below = same.filter((h) => h.load! < w.load!).length;
  const eq = same.filter((h) => h.load === w.load).length;
  const score = Math.round(((below + eq / 2) / same.length) * 100);
  return { score, tier: score >= 70 ? 'big' : score >= 35 ? 'solid' : 'light' };
}

/** "Recovery was N bpm; better than P% of earlier workouts." Only when P ≥ 50. */
export function recoveryWin(w: Workout, history: Workout[]): { drop: number; betterThanPct: number } | undefined {
  if (w.hrRecovery1m === undefined) return undefined;
  const prev = history.filter((h) => h.start < w.start && h.hrRecovery1m !== undefined).map((h) => h.hrRecovery1m!);
  if (prev.length < MIN_HISTORY) return undefined;
  const pct = Math.round((prev.filter((x) => x < w.hrRecovery1m!).length / prev.length) * 100);
  return pct >= 50 ? { drop: Math.round(w.hrRecovery1m), betterThanPct: pct } : undefined;
}

/**
 * Efficiency: average HR vs the last 5 similar sessions (same type, duration within ±25%).
 * Only reported when HR was lower by ≥ 2 bpm (doing the same work more easily).
 */
export function efficiencyWin(w: Workout, history: Workout[]): { sessions: number; lowerBy: number } | undefined {
  if (w.hrAvg === undefined) return undefined;
  const similar = history
    .filter((h) => h.start < w.start && h.type === w.type && h.hrAvg !== undefined && Math.abs(h.durationSec - w.durationSec) <= w.durationSec * 0.25)
    .sort((a, b) => b.start - a.start)
    .slice(0, 5);
  if (similar.length < 3) return undefined;
  const avg = similar.reduce((a, h) => a + h.hrAvg!, 0) / similar.length;
  const lowerBy = Math.round(avg - w.hrAvg);
  return lowerBy >= 2 ? { sessions: similar.length, lowerBy } : undefined;
}

/**
 * Sleep effect: workouts after > 7h sleep vs < 6h, normalised per workout type (duration and HR relative
 * to that type's mean). Reported when well-rested sessions were ≥ 5% longer or ≥ 2% lower HR.
 */
export function sleepEffect(workouts: Workout[], sleepBefore: (w: Workout) => number | undefined) {
  const byType = new Map<string, Workout[]>();
  for (const w of workouts) byType.set(w.type, [...(byType.get(w.type) ?? []), w]);
  const good: { d: number; h?: number }[] = [], poor: { d: number; h?: number }[] = [];
  for (const ws of byType.values()) {
    const md = ws.reduce((a, w) => a + w.durationSec, 0) / ws.length;
    const withHr = ws.filter((w) => w.hrAvg !== undefined);
    const mh = withHr.length ? withHr.reduce((a, w) => a + w.hrAvg!, 0) / withHr.length : undefined;
    for (const w of ws) {
      const s = sleepBefore(w);
      if (s === undefined) continue;
      const row = { d: w.durationSec / md, h: mh && w.hrAvg !== undefined ? w.hrAvg / mh : undefined };
      if (s >= 420) good.push(row); else if (s < 360) poor.push(row);
    }
  }
  if (good.length < 3 || poor.length < 3) return undefined;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const longer = avg(good.map((r) => r.d)) / avg(poor.map((r) => r.d)) - 1;
  const gh = good.filter((r) => r.h !== undefined).map((r) => r.h!);
  const ph = poor.filter((r) => r.h !== undefined).map((r) => r.h!);
  const easier = gh.length >= 3 && ph.length >= 3 ? 1 - avg(gh) / avg(ph) : 0;
  if (longer < 0.05 && easier < 0.02) return undefined;
  return { longerPct: Math.round(longer * 100), easierPct: Math.round(easier * 100), samples: good.length + poor.length };
}

export type WeeklySuggestion =
  | { kind: 'heavy'; pctMore: number }
  | { kind: 'light' }
  | { kind: 'steady' };

/** Turns last-7-days vs usual into a calm suggestion. */
export function weeklySuggestion(ratio: number | undefined): WeeklySuggestion | undefined {
  if (ratio === undefined) return undefined;
  if (ratio >= 1.25) return { kind: 'heavy', pctMore: Math.round((ratio - 1) * 100) };
  if (ratio <= 0.7) return { kind: 'light' };
  return { kind: 'steady' };
}
