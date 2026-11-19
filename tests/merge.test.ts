import { describe, expect, it } from 'vitest';
import { planMerge, sameSession } from '../src/import/merge';
import type { Workout } from '../src/db/types';

const M = 60_000;
const w = (id: string, start: number, mins: number, source: Workout['source'], extra: Partial<Workout> = {}): Workout => ({
  id, start: start * M, end: (start + mins) * M, durationSec: mins * 60, type: 'strength',
  typeSource: source === 'export' ? 'health' : 'guessed', source, ...extra,
});

describe('merge', () => {
  it('detects the same session by overlap, not equality', () => {
    expect(sameSession(w('a', 0, 45, 'export'), w('b', 1, 44, 'shortcut'))).toBe(true);
    expect(sameSession(w('a', 0, 45, 'export'), w('b', 40, 45, 'shortcut'))).toBe(false);
  });

  it('export replaces shortcut and inferred, keeping user input', () => {
    const existing = [w('s1', 0, 45, 'shortcut', { rpe: 7, notes: 'خوب بود' }), w('i1', 300, 30, 'inferred')];
    const plan = planMerge(existing, [w('x1', 1, 44, 'export'), w('x2', 301, 30, 'export')]);
    expect(plan.remove.sort()).toEqual(['i1', 's1']);
    expect(plan.put.find((p) => p.id === 'x1')).toMatchObject({ rpe: 7, notes: 'خوب بود', typeSource: 'health' });
  });

  it('lower priority never replaces higher', () => {
    const plan = planMerge([w('x1', 0, 45, 'export')], [w('s1', 1, 44, 'shortcut')]);
    expect(plan.put).toEqual([]);
    expect(plan.skipped).toBe(1);
  });

  it('a confirmed type survives a shortcut re-sync', () => {
    const plan = planMerge([w('s1', 0, 45, 'shortcut', { type: 'hiit', typeSource: 'confirmed' })], [w('s1', 0, 45, 'shortcut')]);
    expect(plan.put[0]).toMatchObject({ type: 'hiit', typeSource: 'confirmed' });
    expect(plan.remove).toEqual([]);
  });

  it('re-importing the same export is a no-op', () => {
    const ex = [w('x1', 0, 45, 'export')];
    const plan = planMerge(ex, ex);
    expect(plan.remove).toEqual([]);
    expect(plan.put).toEqual(ex);
  });
});
