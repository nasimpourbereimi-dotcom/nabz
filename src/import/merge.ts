import type { Workout, WorkoutSource } from '../db/types';

const PRIORITY: Record<WorkoutSource, number> = { export: 3, shortcut: 2, inferred: 1 };

/** Two workouts are the same session if they overlap by ≥ 50% of the shorter one. */
export function sameSession(a: Pick<Workout, 'start' | 'end'>, b: Pick<Workout, 'start' | 'end'>): boolean {
  const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
  if (overlap <= 0) return false;
  const shorter = Math.max(1, Math.min(a.end - a.start, b.end - b.start));
  return overlap / shorter >= 0.5;
}

export interface MergePlan {
  put: Workout[];
  /** ids of existing workouts superseded by incoming ones */
  remove: string[];
  skipped: number;
}

/**
 * Merge incoming workouts into existing ones. Priority export > shortcut > inferred.
 * User-entered fields (rpe, notes, confirmed type when the winner isn't Health's own) survive replacement.
 */
export function planMerge(existing: Workout[], incoming: Workout[]): MergePlan {
  const sorted = [...existing].sort((a, b) => a.start - b.start);
  const plan: MergePlan = { put: [], remove: [], skipped: 0 };
  const removed = new Set<string>();
  const putById = new Map<string, Workout>();

  for (const w of incoming) {
    const overlapping = findOverlapping(sorted, w).filter((e) => !removed.has(e.id));
    const stronger = overlapping.find(
      (e) => PRIORITY[e.source] > PRIORITY[w.source] && e.id !== w.id,
    );
    if (stronger) { plan.skipped++; continue; }

    let merged: Workout = { ...w };
    for (const e of overlapping) {
      if (e.rpe !== undefined && merged.rpe === undefined) merged.rpe = e.rpe;
      if (e.notes && !merged.notes) merged.notes = e.notes;
      if (e.typeSource === 'confirmed' && merged.typeSource !== 'health') {
        merged = { ...merged, type: e.type, typeSource: 'confirmed' };
      }
      if (e.id !== w.id) { plan.remove.push(e.id); removed.add(e.id); }
    }
    putById.set(merged.id, merged);
  }
  plan.put = [...putById.values()];
  return plan;
}

function findOverlapping(sorted: Workout[], w: Pick<Workout, 'start' | 'end'>): Workout[] {
  // binary search for first workout that could overlap (ends after w.start); sessions are < 1 day long
  let lo = 0, hi = sorted.length;
  const from = w.start - 86_400_000;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].start < from) lo = mid + 1; else hi = mid;
  }
  const out: Workout[] = [];
  for (let i = lo; i < sorted.length && sorted[i].start < w.end; i++) {
    if (sameSession(sorted[i], w)) out.push(sorted[i]);
  }
  return out;
}
