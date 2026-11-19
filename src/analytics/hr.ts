// Heart-rate profile, zones and per-workout HR math. Pure functions only.

export interface HrPoint { t: number; bpm: number }

export interface HrProfile {
  maxHR: number;
  restHR: number;
  /** where maxHR came from, so the UI can say "based on your age" / "based on your workouts" */
  source: 'age' | 'observed' | 'default' | 'manual';
}

export const DEFAULT_PROFILE: HrProfile = { maxHR: 190, restHR: 60, source: 'default' };

/** Tanaka et al.: 208 − 0.7 × age. */
export const tanakaMaxHR = (age: number) => Math.round(208 - 0.7 * age);

export function ageAt(dobISO: string, at: number): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dobISO);
  if (!m) return undefined;
  const now = new Date(at);
  let age = now.getUTCFullYear() - +m[1];
  if (now.getUTCMonth() + 1 < +m[2] || (now.getUTCMonth() + 1 === +m[2] && now.getUTCDate() < +m[3])) age--;
  return age > 5 && age < 110 ? age : undefined;
}

export function quantile(xs: number[], q: number): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export const median = (xs: number[]) => quantile(xs, 0.5);

/**
 * Max HR: the higher of the age formula and what the watch actually saw (p95 of workout maxima),
 * because formulas underestimate for many people and an underestimate inflates every zone.
 */
export function estimateProfile(opts: { age?: number; workoutMaxes: number[]; restingHRs: number[] }): HrProfile {
  const observed = opts.workoutMaxes.length >= 5 ? quantile(opts.workoutMaxes, 0.95) : undefined;
  const byAge = opts.age !== undefined ? tanakaMaxHR(opts.age) : undefined;
  let maxHR = DEFAULT_PROFILE.maxHR, source: HrProfile['source'] = 'default';
  if (byAge !== undefined && (observed === undefined || byAge >= observed)) { maxHR = byAge; source = 'age'; }
  else if (observed !== undefined) { maxHR = Math.round(observed); source = 'observed'; }
  const rest = median(opts.restingHRs);
  return { maxHR, restHR: rest !== undefined ? Math.round(rest) : DEFAULT_PROFILE.restHR, source };
}

/** Lower bounds (bpm) of zones 2..5 as % of max HR: 60/70/80/90. Below 60% counts as zone 1 (warm-up). */
export function zoneBounds(maxHR: number): [number, number, number, number] {
  return [0.6, 0.7, 0.8, 0.9].map((p) => Math.round(maxHR * p)) as [number, number, number, number];
}

export function zoneOf(bpm: number, bounds: readonly number[]): 0 | 1 | 2 | 3 | 4 {
  let z = 0;
  for (const b of bounds) if (bpm >= b) z++;
  return z as 0 | 1 | 2 | 3 | 4;
}

const MAX_GAP_MS = 30_000; // a missing stretch longer than this isn't credited to any zone
const LAST_SAMPLE_MS = 5_000;

/** Iterates samples inside [start, end] with the time each one "covers" (ms). */
function* spans(samples: HrPoint[], start: number, end: number): Generator<[HrPoint, number]> {
  const xs = samples.filter((s) => s.t >= start && s.t <= end);
  for (let i = 0; i < xs.length; i++) {
    const next = i + 1 < xs.length ? xs[i + 1].t : Math.min(end, xs[i].t + LAST_SAMPLE_MS);
    yield [xs[i], Math.max(0, Math.min(MAX_GAP_MS, next - xs[i].t))];
  }
}

export function zoneSeconds(samples: HrPoint[], start: number, end: number, maxHR: number): [number, number, number, number, number] {
  const out: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  const b = zoneBounds(maxHR);
  for (const [s, dt] of spans(samples, start, end)) out[zoneOf(s.bpm, b)] += dt / 1000;
  return out.map(Math.round) as typeof out;
}

/** Banister TRIMP: Σ minutes × HRr × 0.64·e^(k·HRr). k = 1.92 (Banister's default). */
export function trimp(samples: HrPoint[], start: number, end: number, p: HrProfile, k = 1.92): number {
  let sum = 0;
  for (const [s, dt] of spans(samples, start, end)) sum += (dt / 60_000) * trimpRate(s.bpm, p, k);
  return Math.round(sum * 10) / 10;
}

/** Fallback when only average HR is known (e.g. old exports). */
export function trimpFromAverage(durationSec: number, hrAvg: number, p: HrProfile, k = 1.92): number {
  return Math.round((durationSec / 60) * trimpRate(hrAvg, p, k) * 10) / 10;
}

function trimpRate(bpm: number, p: HrProfile, k: number): number {
  const r = Math.max(0, Math.min(1, (bpm - p.restHR) / Math.max(1, p.maxHR - p.restHR)));
  return r * 0.64 * Math.exp(k * r);
}

/**
 * 1-minute HR recovery: HR at the end (max of the last 20 s) minus HR ~60 s later.
 * Needs samples after the end (the import keeps a 5-minute tail).
 */
export function hrRecovery1m(samples: HrPoint[], end: number): number | undefined {
  const atEnd = samples.filter((s) => s.t >= end - 20_000 && s.t <= end + 2_000);
  const after = samples.filter((s) => s.t >= end + 50_000 && s.t <= end + 75_000);
  if (!atEnd.length || !after.length) return undefined;
  const peak = Math.max(...atEnd.map((s) => s.bpm));
  const target = end + 60_000;
  const later = after.reduce((a, b) => (Math.abs(b.t - target) < Math.abs(a.t - target) ? b : a));
  const drop = peak - later.bpm;
  return drop > 0 ? drop : undefined;
}

export function hrStats(samples: HrPoint[], start: number, end: number) {
  let sum = 0, w = 0, max = 0, min = Infinity;
  for (const [s, dt] of spans(samples, start, end)) {
    sum += s.bpm * dt; w += dt;
    max = Math.max(max, s.bpm); min = Math.min(min, s.bpm);
  }
  return w ? { avg: Math.round(sum / w), max, min } : undefined;
}

export interface SetPattern {
  peaks: number[]; // times of set peaks
  regular: boolean; // rest intervals are even
}

/**
 * Strength-style "sets": peaks in smoothed HR with ≥ 12 bpm rise from the preceding valley,
 * at least 40 s apart. Rest regularity = coefficient of variation of peak spacing < 0.3.
 */
export function detectSets(samples: HrPoint[], start: number, end: number): SetPattern {
  const xs = samples.filter((s) => s.t >= start && s.t <= end);
  if (xs.length < 10) return { peaks: [], regular: false };
  // moving average over ±10 s
  const sm = xs.map((s, i) => {
    let sum = 0, n = 0;
    for (let j = i; j >= 0 && s.t - xs[j].t <= 10_000; j--) { sum += xs[j].bpm; n++; }
    for (let j = i + 1; j < xs.length && xs[j].t - s.t <= 10_000; j++) { sum += xs[j].bpm; n++; }
    return { t: s.t, v: sum / n };
  });
  const PROM = 12, MIN_GAP = 40_000;
  const peaks: number[] = [];
  let valley = sm[0].v, cand: { t: number; v: number } | null = null;
  for (const p of sm) {
    if (cand) {
      if (p.v > cand.v) cand = p;
      else if (cand.v - p.v >= PROM / 2) {
        if (!peaks.length || cand.t - peaks[peaks.length - 1] >= MIN_GAP) peaks.push(cand.t);
        cand = null; valley = p.v;
      }
    } else {
      valley = Math.min(valley, p.v);
      if (p.v - valley >= PROM) cand = p;
    }
  }
  const gaps = peaks.slice(1).map((t, i) => t - peaks[i]);
  let regular = false;
  if (gaps.length >= 3) {
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length);
    regular = sd / mean < 0.3;
  }
  return { peaks, regular };
}

/** Evenly thins a series to at most n points for drawing. */
export function downsample(samples: HrPoint[], n: number): HrPoint[] {
  if (samples.length <= n) return samples;
  const step = samples.length / n;
  const out: HrPoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * step), b = Math.max(a + 1, Math.floor((i + 1) * step));
    let sum = 0;
    for (let j = a; j < b; j++) sum += samples[j].bpm;
    out.push({ t: samples[a].t, bpm: sum / (b - a) });
  }
  return out;
}
