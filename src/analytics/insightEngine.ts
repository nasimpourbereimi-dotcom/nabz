// Insight engine with memory (docs/product.md): every day, show the most interesting *new* finding.
// Candidates are typed data (the UI phrases them); selection is deterministic and never repeats an insight
// within REPEAT_DAYS. Only positive or useful-neutral findings are ever generated (CLAUDE.md §7).
import type { Workout } from '../db/types';
import type { GoldenHour, RecordKind } from './records';
import { recordsSetBy } from './records';
import { daysBetween } from './dates';

export type InsightData =
  | { type: 'golden'; from: number; to: number }
  | { type: 'sleep'; longerPct: number; easierPct: number }
  | { type: 'record'; kind: RecordKind; workoutId: string }
  | { type: 'streakBest'; days: number }
  | { type: 'hrvUp'; delta: number }
  | { type: 'rhrDown'; delta: number }
  | { type: 'weekMore'; pct: number }
  | { type: 'consistency'; perWeek: number }
  | { type: 'recoveryUp'; delta: number };

export interface Candidate {
  id: string; // stable identity for memory, e.g. "record:longest:x123"
  kind: 'info' | 'suggest';
  data: InsightData;
  positivity: number; // 0..1
  confidence: number; // 0..1
}

export const REPEAT_DAYS = 7;
const NOVELTY_DAYS = 30;

export interface InsightContext {
  today: string;
  workouts: Workout[];
  dayOf: (w: Workout) => string;
  golden?: GoldenHour;
  sleep?: { longerPct: number; easierPct: number; samples: number };
  streak: { current: number; best: number };
  hrvChange?: { delta: number };
  rhrChange?: { delta: number };
  weekRatio?: number;
}

export function candidates(c: InsightContext): Candidate[] {
  const out: Candidate[] = [];
  if (c.golden) {
    out.push({ id: `golden:${c.golden.from}`, kind: 'suggest', data: { type: 'golden', from: c.golden.from, to: c.golden.to },
      positivity: 0.8, confidence: Math.min(1, c.golden.sessions / 8) });
  }
  if (c.sleep) {
    out.push({ id: 'sleep', kind: 'suggest', data: { type: 'sleep', longerPct: c.sleep.longerPct, easierPct: c.sleep.easierPct },
      positivity: 0.7, confidence: Math.min(1, c.sleep.samples / 20) });
  }
  // records set in the last 7 days
  const recent = c.workouts.filter((w) => daysBetween(c.dayOf(w), c.today) < 7);
  for (const w of recent) {
    for (const kind of recordsSetBy(w, c.workouts)) {
      out.push({ id: `record:${kind}:${w.id}`, kind: 'info', data: { type: 'record', kind, workoutId: w.id }, positivity: 1, confidence: 1 });
    }
  }
  if (c.streak.current >= 5 && c.streak.current >= c.streak.best) {
    out.push({ id: `streakBest:${c.streak.current}`, kind: 'info', data: { type: 'streakBest', days: c.streak.current }, positivity: 0.95, confidence: 1 });
  }
  if (c.hrvChange && c.hrvChange.delta >= 2) {
    out.push({ id: 'hrvUp', kind: 'info', data: { type: 'hrvUp', delta: c.hrvChange.delta }, positivity: 0.85, confidence: Math.min(1, c.hrvChange.delta / 6) });
  }
  if (c.rhrChange && c.rhrChange.delta <= -1) {
    out.push({ id: 'rhrDown', kind: 'info', data: { type: 'rhrDown', delta: c.rhrChange.delta }, positivity: 0.85, confidence: Math.min(1, -c.rhrChange.delta / 3) });
  }
  if (c.weekRatio !== undefined && c.weekRatio >= 1.1 && c.weekRatio < 1.25) {
    out.push({ id: `weekMore:${c.today}`, kind: 'info', data: { type: 'weekMore', pct: Math.round((c.weekRatio - 1) * 100) }, positivity: 0.8, confidence: 0.8 });
  }
  const last28 = c.workouts.filter((w) => daysBetween(c.dayOf(w), c.today) < 28 && c.dayOf(w) <= c.today).length;
  if (last28 >= 12) {
    out.push({ id: 'consistency', kind: 'info', data: { type: 'consistency', perWeek: Math.round((last28 / 4) * 10) / 10 }, positivity: 0.75, confidence: 0.9 });
  }
  const rec = c.workouts.filter((w) => w.hrRecovery1m !== undefined && c.dayOf(w) <= c.today).sort((a, b) => a.start - b.start);
  if (rec.length >= 20) {
    const m = (xs: Workout[]) => xs.reduce((a, w) => a + w.hrRecovery1m!, 0) / xs.length;
    const delta = Math.round(m(rec.slice(-10)) - m(rec.slice(-20, -10)));
    if (delta >= 2) out.push({ id: 'recoveryUp', kind: 'info', data: { type: 'recoveryUp', delta }, positivity: 0.85, confidence: Math.min(1, delta / 5) });
  }
  return out;
}

/** Most interesting candidate not shown in the last REPEAT_DAYS days. `shown` maps id → last day shown. */
export function pick(cands: Candidate[], shown: Map<string, string>, today: string): Candidate | undefined {
  let best: Candidate | undefined, bestScore = -1;
  for (const c of cands) {
    const last = shown.get(c.id);
    const age = last === undefined ? Infinity : daysBetween(last, today);
    if (age < REPEAT_DAYS) continue;
    const novelty = age === Infinity ? 1 : Math.min(1, age / NOVELTY_DAYS);
    const score = 0.4 * c.positivity + 0.3 * c.confidence + 0.3 * novelty;
    // deterministic tie-break by id so the same day always picks the same insight
    if (score > bestScore || (score === bestScore && best && c.id < best.id)) { best = c; bestScore = score; }
  }
  return best;
}

