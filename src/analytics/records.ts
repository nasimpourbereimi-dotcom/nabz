// Personal records and "golden hour". Pure. Lead with wins (CLAUDE.md §7): many record dimensions,
// so there is almost always something to celebrate.
import type { Workout } from '../db/types';

export type RecordKind = 'longest' | 'mostKcal' | 'highestLoad' | 'bestRecovery';

export const RECORD_VALUE: Record<RecordKind, (w: Workout) => number | undefined> = {
  longest: (w) => w.durationSec,
  mostKcal: (w) => w.energyKcal,
  highestLoad: (w) => w.load,
  bestRecovery: (w) => w.hrRecovery1m,
};

/** Minimum earlier workouts before a "new record" means anything. */
export const MIN_FOR_RECORD = 5;

/** Records this workout set: strictly better than every earlier workout (with enough history). */
export function recordsSetBy(w: Workout, all: Workout[]): RecordKind[] {
  const earlier = all.filter((x) => x.start < w.start && x.id !== w.id);
  if (earlier.length < MIN_FOR_RECORD) return [];
  const out: RecordKind[] = [];
  for (const kind of Object.keys(RECORD_VALUE) as RecordKind[]) {
    const v = RECORD_VALUE[kind](w);
    if (v === undefined) continue;
    const prev = earlier.map(RECORD_VALUE[kind]).filter((x): x is number => x !== undefined);
    if (prev.length >= MIN_FOR_RECORD && v > Math.max(...prev)) out.push(kind);
  }
  return out;
}

/** Best workout per record kind within a set. */
export function bestOf(ws: Workout[]): Partial<Record<RecordKind, Workout>> {
  const out: Partial<Record<RecordKind, Workout>> = {};
  for (const kind of Object.keys(RECORD_VALUE) as RecordKind[]) {
    let best: Workout | undefined, bv = -Infinity;
    for (const w of ws) {
      const v = RECORD_VALUE[kind](w);
      if (v !== undefined && v > bv) { bv = v; best = w; }
    }
    if (best) out[kind] = best;
  }
  return out;
}

export interface GoldenHour { from: number; to: number; betterPct: number; sessions: number }

/**
 * Two-hour window of the day where output per heartbeat is highest: (kcal / minute) / avg HR.
 * Needs ≥ 3 sessions in the window, ≥ 2 windows to compare, and ≥ 5% better than the overall mean.
 */
export function goldenHour(ws: Workout[], hourOf: (ms: number) => number): GoldenHour | undefined {
  const rows = ws
    .filter((w) => w.energyKcal && w.hrAvg && w.durationSec >= 600)
    .map((w) => ({ slot: Math.floor(hourOf(w.start) / 2), eff: w.energyKcal! / (w.durationSec / 60) / w.hrAvg! }));
  if (rows.length < 6) return undefined;
  const bySlot = new Map<number, number[]>();
  for (const r of rows) bySlot.set(r.slot, [...(bySlot.get(r.slot) ?? []), r.eff]);
  const slots = [...bySlot].filter(([, xs]) => xs.length >= 3).map(([slot, xs]) => ({ slot, mean: avg(xs), n: xs.length }));
  if (slots.length < 2) return undefined;
  const overall = avg(rows.map((r) => r.eff));
  const best = slots.sort((a, b) => b.mean - a.mean)[0];
  const betterPct = Math.round((best.mean / overall - 1) * 100);
  if (betterPct < 5) return undefined;
  return { from: best.slot * 2, to: best.slot * 2 + 2, betterPct, sessions: best.n };
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
