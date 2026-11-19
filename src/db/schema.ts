import Dexie, { type Table } from 'dexie';
import type {
  DailyMetrics, HrBucket, HrSample, InsightLogEntry, Rollup, Sample, SettingRow, SyncLogEntry, Workout,
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

  constructor(name = 'nabz') {
    super(name);
    // Phase 2 (program / sessionPlan / setLog) will come as version(2); keep v1 stable.
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
  }
}

export const TABLES = [
  'workouts', 'hrSamples', 'hrBuckets', 'samples', 'dailyMetrics', 'syncLog', 'settings', 'rollups', 'insightLog',
] as const;
export type TableName = (typeof TABLES)[number];

let instance: NabzDB | undefined;
export function getDB(): NabzDB {
  return (instance ??= new NabzDB());
}
