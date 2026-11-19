// Recovering workouts the automation missed (HR density) and guessing a workout's type from its HR shape.
// CLAUDE.md §4c/§4d. Pure.
import { detectSets, type HrPoint, type HrProfile } from './hr';

export interface Window { start: number; end: number }

const DENSE_GAP = 20_000; // Watch logs every ~5 s during workouts, every few minutes otherwise
const BRIDGE_GAP = 3 * 60_000; // short dropouts inside one session
const MIN_DURATION = 10 * 60_000;

/**
 * Dense HR clusters that don't overlap a known workout and look like exercise:
 * ≥ 40% of the window covered by exercise minutes, or (without exercise data) mean HR ≥ rest + 25.
 */
export function inferWorkouts(
  hr: HrPoint[],
  known: Window[],
  opts: { exercise?: Window[]; restHR: number },
): Window[] {
  const xs = [...hr].sort((a, b) => a.t - b.t);
  const runs: Window[] = [];
  let runStart = -1;
  for (let i = 1; i <= xs.length; i++) {
    const dense = i < xs.length && xs[i].t - xs[i - 1].t <= DENSE_GAP;
    if (dense && runStart < 0) runStart = i - 1;
    if (!dense && runStart >= 0) { runs.push({ start: xs[runStart].t, end: xs[i - 1].t }); runStart = -1; }
  }
  const merged: Window[] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r.start - last.end <= BRIDGE_GAP) last.end = r.end;
    else merged.push({ ...r });
  }
  return merged.filter((w) => {
    if (w.end - w.start < MIN_DURATION) return false;
    if (known.some((k) => k.start < w.end && k.end > w.start)) return false;
    if (opts.exercise?.length) {
      let covered = 0;
      for (const e of opts.exercise) covered += Math.max(0, Math.min(e.end, w.end) - Math.max(e.start, w.start));
      if (covered >= 0.4 * (w.end - w.start)) return true;
    }
    const inside = xs.filter((s) => s.t >= w.start && s.t <= w.end);
    const mean = inside.reduce((a, s) => a + s.bpm, 0) / Math.max(1, inside.length);
    return mean >= opts.restHR + 25;
  });
}

export interface ShapeFeatures {
  intensity: number; // mean HR as fraction of max
  peakIntensity: number; // p90 HR as fraction of max
  setsPer10: number; // detected set peaks per 10 minutes
  variability: number; // coefficient of variation of HR
  stepsPerMin: number;
}

export function shapeFeatures(samples: HrPoint[], w: Window, p: HrProfile, steps = 0): ShapeFeatures | undefined {
  const xs = samples.filter((s) => s.t >= w.start && s.t <= w.end);
  if (xs.length < 20) return undefined;
  const bpm = xs.map((s) => s.bpm);
  const mean = bpm.reduce((a, b) => a + b, 0) / bpm.length;
  const sd = Math.sqrt(bpm.reduce((a, b) => a + (b - mean) ** 2, 0) / bpm.length);
  const sorted = [...bpm].sort((a, b) => a - b);
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  const minutes = (w.end - w.start) / 60_000;
  return {
    intensity: round3(mean / p.maxHR),
    peakIntensity: round3(p90 / p.maxHR),
    setsPer10: round3((detectSets(xs, w.start, w.end).peaks.length / minutes) * 10),
    variability: round3(sd / mean),
    stepsPerMin: Math.round(steps / minutes),
  };
}

export interface TypeGuess { type: string; confidence: number; how: 'learned' | 'rules' }

/**
 * Guess the type. With ≥ 3 labelled examples per type (Health's official type or one the owner confirmed),
 * use the nearest type centroid — the app learns the owner's own patterns. Otherwise simple rules.
 */
export function guessType(f: ShapeFeatures, examples: { type: string; f: ShapeFeatures }[] = []): TypeGuess {
  const byType = new Map<string, ShapeFeatures[]>();
  for (const e of examples) byType.set(e.type, [...(byType.get(e.type) ?? []), e.f]);
  const centroids = [...byType.entries()].filter(([, fs]) => fs.length >= 3).map(([type, fs]) => ({ type, c: centroid(fs) }));
  if (centroids.length >= 2) {
    const ranked = centroids.map((c) => ({ type: c.type, d: distance(f, c.c) })).sort((a, b) => a.d - b.d);
    const [best, second] = ranked;
    const confidence = round3(Math.min(0.95, 0.5 + (second.d - best.d) / (second.d + best.d + 1e-9)));
    return { type: best.type, confidence, how: 'learned' };
  }
  if (f.stepsPerMin >= 60 && f.setsPer10 < 1.5) {
    return { type: f.stepsPerMin >= 140 && f.intensity >= 0.75 ? 'run' : 'walk', confidence: 0.7, how: 'rules' };
  }
  if (f.setsPer10 >= 1.5) {
    return f.peakIntensity >= 0.85 && f.setsPer10 >= 3
      ? { type: 'hiit', confidence: 0.6, how: 'rules' }
      : { type: 'strength', confidence: 0.65, how: 'rules' };
  }
  return { type: 'strength', confidence: 0.4, how: 'rules' }; // the owner's most common session at home
}

// Normalise each dimension to a comparable scale.
const SCALE: Record<keyof ShapeFeatures, number> = { intensity: 0.1, peakIntensity: 0.1, setsPer10: 1.5, variability: 0.05, stepsPerMin: 40 };
function distance(a: ShapeFeatures, b: ShapeFeatures) {
  let s = 0;
  for (const k of Object.keys(SCALE) as (keyof ShapeFeatures)[]) s += ((a[k] - b[k]) / SCALE[k]) ** 2;
  return Math.sqrt(s);
}
function centroid(fs: ShapeFeatures[]): ShapeFeatures {
  const out = { intensity: 0, peakIntensity: 0, setsPer10: 0, variability: 0, stepsPerMin: 0 };
  for (const f of fs) for (const k of Object.keys(out) as (keyof ShapeFeatures)[]) out[k] += f[k] / fs.length;
  return out;
}
const round3 = (x: number) => Math.round(x * 1000) / 1000;
