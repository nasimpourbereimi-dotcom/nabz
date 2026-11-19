import Dexie, { type Table } from 'dexie';
import type {
  DailyMetrics, HrBucket, HrSample, InsightLogEntry, IntervalRow, Rollup, Sample, SettingRow, SyncLogEntry, Workout,
} from './types';

export class NabzDB extends Dexie {
  workouts!: Table<Workout, string>;
  hrSamples!: Table<HrSample, number>;
  hrBuckets!: Table<HrBucket, number>;
  samples!: Table<Sample, [string, number, number]>;
  dailyMetrics!: Table<DailyMetrics, string>;
  syncLog!: Table<SyncLogEntry, number>;
  settings!: Table<SettingRow, string>;
  rollups!: Table<Rollup, string>;
  insightLog!: Table<InsightLogEntry, number>;
  intervalSamples!: Table<IntervalRow, [string, string, number, number]>;

  constructor(name = 'nabz') {
    super(name);
    // Phase 2 (program / sessionPlan / setLog) will come as a later version; never edit old versions.
    this.version(1).stores({
      workouts: 'id, start, end, type, source',
      hrSamples: 't, workoutId',
      hrBuckets: 't',
      samples: '[type+start+end], type, start',
      dailyMetrics: 'date',
      syncLog: '++id, at, kind',
      settings: 'key',
      rollups: 'key',
      insightLog: '++id, insightId, shownAt',
    });
    // v2: Shortcuts sync keeps interval samples per source so days can be recomputed idempotently.
    this.version(2).stores({
      intervalSamples: '[type+source+start+end], [type+start]',
    });
  }
}

export const TABLES = [
  'workouts', 'hrSamples', 'hrBuckets', 'samples', 'dailyMetrics', 'syncLog', 'settings', 'rollups', 'insightLog',
  'intervalSamples',
] as const;
export type TableName = (typeof TABLES)[number];

let instance: NabzDB | undefined;
export function getDB(): NabzDB {
  return (instance ??= new NabzDB());
}
