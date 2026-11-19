// Screen view-models: read from Dexie, then hand plain data to the pure analytics functions.
import type { NabzDB } from './schema';
import type { DailyMetrics, HrSample, Workout } from './types';
import { tehranDateKey } from '../lib/time';
import { addDays, daysBetween } from '../analytics/dates';
import { loadSeries, sumByDay, weekVsUsual, type LoadPoint } from '../analytics/load';
import { readiness, type Readiness } from '../analytics/readiness';
import { ACTIVE_EXERCISE_MIN, streaks, weekSummary, type WeekSummary } from '../analytics/habits';
import {
  efficiencyWin, recoveryWin, sessionScore, sleepEffect, weeklySuggestion, type SessionScore, type WeeklySuggestion,
} from '../analytics/insights';
import { detectSets, type HrProfile, type SetPattern } from '../analytics/hr';
import { readProfile } from './enrich';

export const workoutDay = (w: Pick<Workout, 'start'>) => tehranDateKey(w.start);

export interface TodayModel {
  today: string;
  /** day the dashboard is based on; earlier than today when there's no fresh data */
  asOf: string;
  stale: boolean;
  readiness?: Readiness;
  suggestion?: WeeklySuggestion;
  load: LoadPoint[]; // last 42 days
  week: WeekSummary;
  streak: { current: number; best: number };
  lastSync?: number;
  hasData: boolean;
}

export async function loadToday(db: NabzDB, now = Date.now()): Promise<TodayModel> {
  const today = tehranDateKey(now);
  const [workouts, days, lastSync, lastExport] = await Promise.all([
    db.workouts.toArray(),
    db.dailyMetrics.orderBy('date').toArray(),
    db.settings.get('lastSync'),
    db.syncLog.where('kind').equals('export').last(),
  ]);
  const latest = days.at(-1)?.date;
  const stale = latest !== undefined && daysBetween(latest, today) > 1;
  const asOf = stale ? latest! : today;

  const dailyLoad = sumByDay(workouts, workoutDay, (w) => w.load);
  const series = loadSeries(dailyLoad, asOf);
  const active = new Set<string>(workouts.map(workoutDay));
  for (const d of days) if ((d.exerciseMin ?? 0) >= ACTIVE_EXERCISE_MIN) active.add(d.date);

  return {
    today,
    asOf,
    stale,
    readiness: readiness(days, asOf),
    suggestion: weeklySuggestion(weekVsUsual(dailyLoad, asOf)?.ratio),
    load: series.filter((p) => p.date > addDays(asOf, -42)),
    week: weekSummary(workouts.map((w) => ({ date: workoutDay(w), durationSec: w.durationSec })), asOf),
    streak: streaks(active, asOf),
    lastSync: (lastSync?.value as number | undefined) ?? lastExport?.exportDate,
    hasData: workouts.length + days.length > 0,
  };
}

export interface WorkoutDetailModel {
  workout: Workout;
  samples: HrSample[];
  profile: HrProfile;
  score?: SessionScore;
  sets: SetPattern;
  recovery?: ReturnType<typeof recoveryWin>;
  efficiency?: ReturnType<typeof efficiencyWin>;
  sleep?: ReturnType<typeof sleepEffect>;
  records: RecordKind[];
}

export async function loadWorkoutDetail(db: NabzDB, id: string): Promise<WorkoutDetailModel | undefined> {
  const workout = await db.workouts.get(id);
  if (!workout) return undefined;
  const [samples, all, days, profile] = await Promise.all([
    db.hrSamples.where('workoutId').equals(id).toArray().then((xs) => xs.sort((a, b) => a.t - b.t)),
    db.workouts.toArray(),
    db.dailyMetrics.toArray(),
    readProfile(db),
  ]);
  const sleepByDay = new Map(days.map((d: DailyMetrics) => [d.date, d.sleepMin]));
  const isStrength = workout.type === 'strength' || workout.type === 'hiit' || workout.type === 'core';
  return {
    workout,
    samples,
    profile,
    score: sessionScore(workout, all),
    sets: isStrength ? detectSets(samples, workout.start, workout.end) : { peaks: [], regular: false },
    recovery: recoveryWin(workout, all),
    efficiency: efficiencyWin(workout, all),
    sleep: sleepEffect(all, (w) => sleepByDay.get(workoutDay(w))),
    records: recordsSetBy(workout, all),
  };
}

// ---------- Wrapped ----------
import { monthStats, type MonthStats } from '../analytics/wrapped';
import { goldenHour, recordsSetBy, type GoldenHour, type RecordKind } from '../analytics/records';
import { addJMonths, jmonthName, jmonthOf, jmonthRange, type JMonth } from '../lib/jalaliMonth';
import { tehranHour } from '../lib/time';

export interface WrappedModel {
  month: JMonth;
  name: string;
  prevName: string;
  stats: MonthStats;
  golden?: GoldenHour;
  hasPrev: boolean;
  hasNext: boolean;
  hasData: boolean;
}

/** Default month: the current one, or the previous one during the first week (when it's still empty). */
export function defaultWrappedMonth(now = Date.now()): JMonth {
  const today = tehranDateKey(now);
  const cur = jmonthOf(today);
  return jmonthRange(cur)[0] > addDays(today, -7) ? addJMonths(cur, -1) : cur;
}

export async function loadWrapped(db: NabzDB, month: JMonth, now = Date.now()): Promise<WrappedModel> {
  const [workouts, days] = await Promise.all([db.workouts.toArray(), db.dailyMetrics.toArray()]);
  const range = jmonthRange(month);
  const prev = addJMonths(month, -1);
  const active = new Set<string>(workouts.map(workoutDay));
  for (const d of days) if ((d.exerciseMin ?? 0) >= ACTIVE_EXERCISE_MIN) active.add(d.date);
  const first = workouts.length ? workouts.reduce((a, w) => (w.start < a ? w.start : a), Infinity) : undefined;
  const upToMonth = workouts.filter((w) => workoutDay(w) < range[1]);
  return {
    month,
    name: jmonthName(month),
    prevName: jmonthName(prev),
    stats: monthStats({ workouts, dayOf: workoutDay, days, range, prevRange: jmonthRange(prev), activeDays: active }),
    golden: goldenHour(upToMonth, tehranHour),
    hasPrev: first !== undefined && tehranDateKey(first) < range[0],
    hasNext: range[1] <= tehranDateKey(now),
    hasData: workouts.length > 0,
  };
}

export function workoutRecords(w: Workout, all: Workout[]): RecordKind[] {
  return recordsSetBy(w, all);
}
