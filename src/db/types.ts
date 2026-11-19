export type WorkoutSource = 'export' | 'shortcut' | 'inferred';
export type TypeSource = 'health' | 'guessed' | 'confirmed';

export interface Workout {
  id: string;
  start: number; // epoch ms (UTC)
  end: number;
  durationSec: number;
  type: string; // normalized short type, e.g. "strength", "walk", "hiit", "other"
  rawType?: string; // HKWorkoutActivityType… as exported
  typeSource: TypeSource;
  source: WorkoutSource;
  sourceName?: string;
  energyKcal?: number;
  distanceKm?: number;
  hrAvg?: number;
  hrMax?: number;
  hrMin?: number;
  hrRecovery1m?: number;
  indoor?: boolean;
  // Filled by analytics (step 2):
  load?: number; // TRIMP
  zones?: [number, number, number, number, number]; // seconds per zone
  // User input:
  rpe?: number; // 1..10 session RPE
  notes?: string;
}

/** Raw HR sample, kept only around workouts. */
export interface HrSample {
  t: number;
  bpm: number;
  workoutId?: string;
}

/** HR outside workouts, downsampled to 5-minute buckets. */
export interface HrBucket {
  t: number; // bucket start (epoch ms, multiple of 5 min)
  avg: number;
  min: number;
  max: number;
  n: number;
}

export type SampleType = 'restingHR' | 'hrvSDNN' | 'hrRecovery1m' | 'vo2max' | 'sleep';

/** Low-volume samples, kept raw. Primary key [type+start+end] makes re-imports idempotent. */
export interface Sample {
  type: SampleType;
  start: number;
  end: number;
  value: number | string; // number, or sleep stage
  sourceName?: string;
}

export interface DailyMetrics {
  date: string; // "YYYY-MM-DD" in the local timezone of the owner (Tehran)
  activeEnergy?: number; // kcal
  exerciseMin?: number;
  steps?: number;
  restingHR?: number;
  hrvSDNN?: number;
  vo2max?: number;
  sleepMin?: number;
  sleepStages?: Partial<Record<'core' | 'deep' | 'rem' | 'awake' | 'asleep', number>>; // minutes
}

export interface SyncLogEntry {
  id?: number;
  at: number;
  kind: 'export' | 'shortcut' | 'restore';
  counts: Record<string, number>;
  payloadVersion?: number;
  exportDate?: number;
}

export interface Rollup {
  key: string; // e.g. "w:2026-11-15" (week start) or "d:2026-11-19"
  data: unknown;
  computedAt: number;
}

export interface InsightLogEntry {
  id?: number;
  insightId: string;
  shownAt: number;
}

export interface SettingRow {
  key: string;
  value: unknown;
}
