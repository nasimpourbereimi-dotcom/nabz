// Shortcuts payload v1 (docs/shortcuts.md). Strict about structure, tolerant about value formats.
// Accepts tuples (["ISO", 98]) or dictionaries ({"date": "ISO", "value": 98}) — dictionaries are
// much easier to build in Shortcuts.
import { latinDigits } from '../lib/digits';
import { toNumber, toTime } from './normalize';

export const PAYLOAD_VERSION = 1;

export interface PointSample { t: number; v: number }
export interface IntervalSample { start: number; end: number; v: number; source?: string }
export interface SleepSample { start: number; end: number; stage: SleepStageName; source?: string }
export type SleepStageName = 'core' | 'deep' | 'rem' | 'awake' | 'inBed' | 'asleep';

export interface PayloadWorkout {
  start: number;
  end: number;
  activeKcal?: number;
  hr: PointSample[];
}

export interface Payload {
  v: 1;
  generatedAt: number;
  since?: number;
  workouts: PayloadWorkout[];
  heartRate: PointSample[];
  restingHR: PointSample[];
  hrvSDNN: PointSample[];
  sleep: SleepSample[];
  activeEnergy: IntervalSample[];
  exerciseMinutes: IntervalSample[];
  steps: IntervalSample[];
  /** entries dropped because a value couldn't be read */
  skipped: number;
}

export class PayloadError extends Error {
  constructor(public code: 'empty' | 'not-json' | 'not-nabz' | 'version', message?: string) {
    super(message ?? code);
  }
}

const SLEEP_STAGES: Record<string, SleepStageName> = {
  core: 'core', deep: 'deep', rem: 'rem', awake: 'awake', inbed: 'inBed', asleep: 'asleep',
  // Shortcuts / Health spellings, English and Persian
  'asleep core': 'core', 'asleep deep': 'deep', 'asleep rem': 'rem', 'in bed': 'inBed', 'asleep unspecified': 'asleep',
  asleepcore: 'core', asleepdeep: 'deep', asleeprem: 'rem', asleepunspecified: 'asleep',
  'هسته': 'core', 'عمیق': 'deep', 'rem خواب': 'rem', 'بیدار': 'awake', 'در رختخواب': 'inBed', 'خواب': 'asleep',
};

export function sleepStageFrom(v: unknown): SleepStageName | undefined {
  if (typeof v !== 'string') return undefined;
  const k = v.trim().toLowerCase().replace(/^hkcategoryvaluesleepanalysis/, '').replace(/[_-]/g, ' ');
  return SLEEP_STAGES[k] ?? SLEEP_STAGES[k.replace(/\s+/g, '')];
}

/**
 * Columnar form — parallel lists, the easiest shape to build in Shortcuts without per-sample loops:
 *   {"t": [dates…], "v": [values…]}  or  {"start": […], "end": […], "v": […], "source": […]}
 * Converted to a list of dictionaries.
 */
function rows(list: unknown): unknown {
  if (!list || typeof list !== 'object' || Array.isArray(list)) return list;
  const o = list as Record<string, unknown>;
  // A list variable put into a Dictionary as Text arrives as one newline-separated string.
  const asList = (v: unknown) =>
    typeof v === 'string' && v.includes('\n') ? v.split('\n').map((x) => x.trim()).filter(Boolean) : v;
  const cols = Object.entries(o).map(([k, v]) => [k, asList(v)] as const).filter(([, v]) => Array.isArray(v)) as [string, unknown[]][];
  if (!cols.length) return list;
  const n = Math.max(...cols.map(([, v]) => v.length));
  return Array.from({ length: n }, (_, i) => Object.fromEntries(cols.map(([k, v]) => [k, v[i]])));
}

const pickKey = (o: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined) return o[k];
  return undefined;
};
const T_KEYS = ['t', 'date', 'time', 'start', 'startDate'];
const START_KEYS = ['start', 'startDate', 'from', 't', 'date'];
const END_KEYS = ['end', 'endDate', 'to'];
const V_KEYS = ['v', 'value', 'bpm', 'quantity', 'stage'];

function points(input: unknown, skipped: { n: number }): PointSample[] {
  const list = rows(input);
  if (!Array.isArray(list)) return [];
  const out: PointSample[] = [];
  for (const e of list) {
    let t: number | undefined, v: number | undefined;
    if (Array.isArray(e)) { t = toTime(e[0]); v = toNumber(e[1]); }
    else if (e && typeof e === 'object') {
      const o = e as Record<string, unknown>;
      t = toTime(pickKey(o, T_KEYS)); v = toNumber(pickKey(o, V_KEYS));
    }
    if (t === undefined || v === undefined) { skipped.n++; continue; }
    out.push({ t, v });
  }
  return out.sort((a, b) => a.t - b.t);
}

function intervals(input: unknown, skipped: { n: number }): IntervalSample[] {
  const list = rows(input);
  if (!Array.isArray(list)) return [];
  const out: IntervalSample[] = [];
  for (const e of list) {
    let start: number | undefined, end: number | undefined, v: number | undefined, source: unknown;
    if (Array.isArray(e)) { start = toTime(e[0]); end = toTime(e[1]); v = toNumber(e[2]); source = e[3]; }
    else if (e && typeof e === 'object') {
      const o = e as Record<string, unknown>;
      start = toTime(pickKey(o, START_KEYS)); end = toTime(pickKey(o, END_KEYS)) ?? start; v = toNumber(pickKey(o, V_KEYS));
      source = o.source ?? o.sourceName;
    }
    if (start === undefined || end === undefined || v === undefined || end < start) { skipped.n++; continue; }
    out.push({ start, end, v, ...(typeof source === 'string' && source ? { source } : {}) });
  }
  return out.sort((a, b) => a.start - b.start);
}

function sleeps(input: unknown, skipped: { n: number }): SleepSample[] {
  const list = rows(input);
  if (!Array.isArray(list)) return [];
  const out: SleepSample[] = [];
  for (const e of list) {
    let start: number | undefined, end: number | undefined, stage: SleepStageName | undefined, source: unknown;
    if (Array.isArray(e)) { start = toTime(e[0]); end = toTime(e[1]); stage = sleepStageFrom(e[2]); source = e[3]; }
    else if (e && typeof e === 'object') {
      const o = e as Record<string, unknown>;
      start = toTime(pickKey(o, START_KEYS)); end = toTime(pickKey(o, END_KEYS)); stage = sleepStageFrom(pickKey(o, V_KEYS));
      source = o.source ?? o.sourceName;
    }
    if (start === undefined || end === undefined || !stage || end <= start) { skipped.n++; continue; }
    out.push({ start, end, stage, ...(typeof source === 'string' && source ? { source } : {}) });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Parses clipboard text into a validated payload. Throws PayloadError with a code the UI can phrase. */
export function parsePayload(text: string): Payload {
  const trimmed = text?.trim();
  if (!trimmed) throw new PayloadError('empty');
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    // Persian digits outside strings make JSON invalid; retry once with Latin digits.
    try { raw = JSON.parse(latinDigits(trimmed)); } catch { throw new PayloadError('not-json'); }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PayloadError('not-nabz');
  const o = raw as Record<string, unknown>;
  if (o.v === undefined || (o.samples === undefined && o.workouts === undefined)) throw new PayloadError('not-nabz');
  if (toNumber(o.v) !== PAYLOAD_VERSION) throw new PayloadError('version', String(o.v));

  const skipped = { n: 0 };
  const s = (o.samples && typeof o.samples === 'object' ? o.samples : {}) as Record<string, unknown>;
  const workouts: PayloadWorkout[] = [];
  // The automation's queue file may be pasted as {"items": [...]}.
  const wl = Array.isArray(o.workouts) ? o.workouts : (o.workouts as { items?: unknown })?.items;
  for (const w of Array.isArray(wl) ? wl : []) {
    if (!w || typeof w !== 'object') { skipped.n++; continue; }
    const r = w as Record<string, unknown>;
    const start = toTime(pickKey(r, START_KEYS)), end = toTime(pickKey(r, END_KEYS));
    if (start === undefined || end === undefined || end <= start) { skipped.n++; continue; }
    const kcal = toNumber(r.activeKcal ?? r.kcal);
    workouts.push({ start, end, ...(kcal !== undefined ? { activeKcal: kcal } : {}), hr: points(r.hr, skipped) });
  }

  return {
    v: 1,
    generatedAt: toTime(o.generatedAt) ?? Date.now(),
    since: toTime(o.since),
    workouts: workouts.sort((a, b) => a.start - b.start),
    heartRate: points(s.heartRate, skipped),
    restingHR: points(s.restingHR, skipped),
    hrvSDNN: points(s.hrvSDNN ?? s.hrv, skipped),
    sleep: sleeps(s.sleep, skipped),
    activeEnergy: intervals(s.activeEnergy, skipped),
    exerciseMinutes: intervals(s.exerciseMinutes, skipped),
    steps: intervals(s.steps, skipped),
    skipped: skipped.n,
  };
}
