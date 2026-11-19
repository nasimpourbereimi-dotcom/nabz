import { describe, expect, it } from 'vitest';
import { guessType, inferWorkouts, shapeFeatures, type ShapeFeatures } from '../src/analytics/workoutShape';
import type { HrPoint } from '../src/analytics/hr';

const S = 1000, M = 60_000;
const P = { maxHR: 190, restHR: 60, source: 'manual' as const };

function day(): HrPoint[] {
  const xs: HrPoint[] = [];
  for (let t = 0; t < 8 * 60 * M; t += 5 * M) xs.push({ t, bpm: 70 }); // sparse baseline
  return xs;
}
const dense = (from: number, mins: number, f: (t: number) => number, step = 5 * S): HrPoint[] => {
  const xs: HrPoint[] = [];
  for (let t = from; t < from + mins * M; t += step) xs.push({ t, bpm: f(t - from) });
  return xs;
};
const strength = (t: number) => { const ph = (t / S) % 150; return ph < 45 ? 95 + 55 * (ph / 45) : 150 - 50 * Math.min(1, (ph - 45) / 60); };
const walk = (t: number) => 108 + Math.sin(t / 60_000) * 3;
const hiit = (t: number) => { const ph = (t / S) % 60; return ph < 30 ? 120 + 55 * (ph / 30) : 175 - 50 * ((ph - 30) / 30); };

describe('inferWorkouts', () => {
  it('finds a dense elevated cluster the automation missed', () => {
    const hr = [...day(), ...dense(2 * 60 * M, 40, strength)];
    const found = inferWorkouts(hr, [], { restHR: 60 });
    expect(found).toHaveLength(1);
    expect(found[0].start).toBe(2 * 60 * M);
    expect(found[0].end - found[0].start).toBeGreaterThan(39 * M);
  });
  it('bridges short dropouts and ignores known workouts and short bursts', () => {
    const hr = [...dense(0, 15, strength), ...dense(16 * M, 15, strength), ...dense(60 * M, 5, strength), ...dense(120 * M, 30, strength)];
    const found = inferWorkouts(hr, [{ start: 119 * M, end: 151 * M }], { restHR: 60 });
    expect(found).toHaveLength(1);
    expect(found[0].end - found[0].start).toBeGreaterThan(30 * M);
  });
  it('needs exercise or elevated HR (a dense but resting stretch is not a workout)', () => {
    const hr = dense(0, 30, () => 66);
    expect(inferWorkouts(hr, [], { restHR: 60 })).toHaveLength(0);
    expect(inferWorkouts(hr, [], { restHR: 60, exercise: [{ start: 0, end: 20 * M }] })).toHaveLength(1);
  });
});

describe('guessType', () => {
  const feat = (f: (t: number) => number, steps = 0) => shapeFeatures(dense(0, 40, f), { start: 0, end: 40 * M }, P, steps)!;

  it('uses rules before there is history', () => {
    expect(guessType(feat(strength)).type).toBe('strength');
    expect(guessType(feat(walk, 40 * 100)).type).toBe('walk');
    expect(guessType(feat(hiit)).type).toBe('hiit');
  });
  it('learns from labelled examples', () => {
    // the owner's "core" sessions look like slow steady HR without steps
    const coreF: ShapeFeatures = { intensity: 0.55, peakIntensity: 0.6, setsPer10: 0.5, variability: 0.04, stepsPerMin: 2 };
    const ex = [
      ...Array(3).fill({ type: 'core', f: coreF }),
      ...Array(3).fill({ type: 'strength', f: feat(strength) }),
    ];
    const g = guessType({ ...coreF, intensity: 0.57 }, ex);
    expect(g).toMatchObject({ type: 'core', how: 'learned' });
    expect(g.confidence).toBeGreaterThan(0.6);
    expect(guessType(feat(strength), ex).type).toBe('strength');
  });
});
