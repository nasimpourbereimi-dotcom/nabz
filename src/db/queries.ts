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
import { candidates, pick, type Candidate } from '../analytics/insightEngine';
import { learningProgress, type LearnItem } from '../analytics/learning';

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
  /** all data lives only on this phone: nudge a backup every few weeks */
  backupDue: boolean;
  insight?: { candidate: Candidate; logged: boolean };
  learning: LearnItem[];
}

export async function loadToday(db: NabzDB, now = Date.now()): Promise<TodayModel> {
  const today = tehranDateKey(now);
  const [workouts, days, lastSync] = await Promise.all([
    db.workouts.toArray(),
    db.dailyMetrics.orderBy('date').toArray(),
    db.settings.get('lastSync'),
  ]);
  const [lastBackup, firstExport] = await Promise.all([
    db.settings.get('lastBackup'),
    db.syncLog.orderBy('at').first(),
  ]);
  const latest = days.at(-1)?.date;
  const stale = latest !== undefined && daysBetween(latest, today) > 1;
  const asOf = stale ? latest! : today;

  const dailyLoad = sumByDay(workouts, workoutDay, (w) => w.load);
  const series = loadSeries(dailyLoad, asOf);
  const active = new Set<string>(workouts.map(workoutDay));
  for (const d of days) if ((d.exerciseMin ?? 0) >= ACTIVE_EXERCISE_MIN) active.add(d.date);

  // Insight of the day: stable through the day, never repeated within a week.
  const sleepByDay = new Map(days.map((d) => [d.date, d.sleepMin]));
  const sleepBefore = (w: Workout) => sleepByDay.get(workoutDay(w));
  const weekRatio = weekVsUsual(dailyLoad, asOf)?.ratio;
  const streak = streaks(active, asOf);
  const cands = candidates({
    today: asOf, workouts, dayOf: workoutDay,
    golden: goldenHour(workouts, tehranHour),
    sleep: sleepEffect(workouts, sleepBefore),
    streak,
    hrvChange: change(dailySeries(days, 'hrvSDNN', addDays(asOf, -59), asOf)),
    rhrChange: change(dailySeries(days, 'restingHR', addDays(asOf, -59), asOf)),
    weekRatio,
  });
  const log = await db.insightLog.orderBy('shownAt').toArray();
  const shown = new Map<string, string>();
  for (const e of log) shown.set(e.insightId, tehranDateKey(e.shownAt));
  const todays = log.filter((e) => tehranDateKey(e.shownAt) === today).at(-1);
  const kept = todays && cands.find((c) => c.id === todays.insightId);
  const chosen = kept ?? pick(cands, shown, today);

  return {
    today,
    asOf,
    stale,
    insight: chosen ? { candidate: chosen, logged: !!kept } : undefined,
    learning: learningProgress({ workouts, days, today: asOf, hourOf: tehranHour, sleepBefore }),
    readiness: readiness(days, asOf),
    suggestion: weeklySuggestion(weekRatio),
    load: series.filter((p) => p.date > addDays(asOf, -42)),
    week: weekSummary(workouts.map((w) => ({ date: workoutDay(w), durationSec: w.durationSec })), asOf),
    streak,
    // only a real Shortcuts sync counts; an export's date is not a "sync"
    lastSync: lastSync?.value as number | undefined,
    hasData: workouts.length + days.length > 0,
    backupDue: backupDue(lastBackup?.value as number | undefined, firstExport?.at, now),
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

// ---------- Trends ----------
import { change, dailySeries, heatmap, rangeStart, rolling, weekly, type RangeKey } from '../analytics/trends';
import { bestOf } from '../analytics/records';

export async function loadTrends(db: NabzDB, range: RangeKey, now = Date.now()) {
  const [workouts, days] = await Promise.all([db.workouts.orderBy('start').toArray(), db.dailyMetrics.orderBy('date').toArray()]);
  const today = tehranDateKey(now);
  const lastData = days.at(-1)?.date;
  const to = lastData && lastData < today ? lastData : today;
  const firstDay = [days[0]?.date, workouts[0] ? workoutDay(workouts[0]) : undefined].filter(Boolean).sort()[0] as string | undefined;
  const from = rangeStart(range, to, firstDay);
  const inRange = workouts.filter((w) => { const d = workoutDay(w); return d >= from && d <= to; });

  const load = loadSeries(sumByDay(workouts, workoutDay, (w) => w.load), to).filter((p) => p.date >= from);
  const rhr = dailySeries(days, 'restingHR', from, to);
  const hrv = dailySeries(days, 'hrvSDNN', from, to);
  const sleep = dailySeries(days, 'sleepMin', from, to);
  const vo2 = dailySeries(days, 'vo2max', from, to);
  const minutesByDay = sumByDay(workouts, workoutDay, (w) => w.durationSec / 60);
  const heatFrom = from < addDays(to, -364) ? addDays(to, -364) : from;

  return {
    from, to, hasData: workouts.length + days.length > 0,
    load,
    weeklyMinutes: weekly(inRange, workoutDay, (w) => w.durationSec / 60, from, to),
    rhr: { series: rhr, avg7: rolling(rhr, 7), change: change(rhr) },
    hrv: { series: hrv, avg7: rolling(hrv, 7), change: change(hrv) },
    sleep: { series: sleep, avg7: rolling(sleep, 7) },
    vo2: vo2.some((p) => p.v !== undefined) ? { series: vo2, change: change(vo2) } : undefined,
    recovery: inRange.filter((w) => w.hrRecovery1m !== undefined).map((w) => ({ t: w.start, v: w.hrRecovery1m! })),
    heat: heatmap(minutesByDay, heatFrom, to),
    records: bestOf(workouts),
    sessions: inRange.length,
  };
}
export type TrendsModel = Awaited<ReturnType<typeof loadTrends>>;

export const BACKUP_EVERY_DAYS = 30;
/** Due when the last backup is older than 30 days, or there was never one and data is older than 14 days. */
export function backupDue(lastBackup: number | undefined, firstData: number | undefined, now: number): boolean {
  if (firstData === undefined) return false;
  const DAY = 86_400_000;
  if (lastBackup === undefined) return now - firstData > 14 * DAY;
  return now - lastBackup > BACKUP_EVERY_DAYS * DAY;
}
