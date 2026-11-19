// Computes per-workout analytics (zones, TRIMP load, 1-min recovery) and stores them on the workout,
// so dashboards never have to touch raw HR. Re-run after imports or when the HR profile changes.
import type { NabzDB } from './schema';
import type { Workout } from './types';
import {
  ageAt, estimateProfile, hrRecovery1m, hrStats, trimp, trimpFromAverage, zoneSeconds, type HrProfile,
} from '../analytics/hr';
import { shapeFeatures } from '../analytics/workoutShape';

/** Read-only (safe inside liveQuery): stored profile, or a fresh estimate. */
export async function readProfile(db: NabzDB): Promise<HrProfile> {
  const stored = (await db.settings.get('hrProfile'))?.value as HrProfile | undefined;
  if (stored) return stored;
  return estimateFromDb(db);
}

/** Re-estimates (unless the owner set it manually) and stores the profile. */
export async function getProfile(db: NabzDB): Promise<HrProfile> {
  const stored = (await db.settings.get('hrProfile'))?.value as HrProfile | undefined;
  if (stored?.source === 'manual') return stored;
  const p = await estimateFromDb(db);
  await db.settings.put({ key: 'hrProfile', value: p });
  return p;
}

async function estimateFromDb(db: NabzDB): Promise<HrProfile> {
  const dob = (await db.settings.get('dateOfBirth'))?.value as string | undefined;
  const age = dob ? ageAt(dob, Date.now()) : undefined;
  const workouts = await db.workouts.toArray();
  const recentDays = await db.dailyMetrics.orderBy('date').reverse().limit(60).toArray();
  const p = estimateProfile({
    age,
    workoutMaxes: workouts.map((w) => w.hrMax).filter((x): x is number => x !== undefined),
    restingHRs: recentDays.map((d) => d.restingHR).filter((x): x is number => x !== undefined),
  });
  return p;
}

export async function enrichWorkouts(db: NabzDB, onlyIds?: string[]): Promise<void> {
  const profile = await getProfile(db);
  const k = ((await db.settings.get('trimpK'))?.value as number | undefined) ?? 1.92;
  const workouts = onlyIds ? (await db.workouts.bulkGet(onlyIds)).filter((w): w is Workout => !!w) : await db.workouts.toArray();
  const recoveries = (await db.samples.where('type').equals('hrRecovery1m').toArray()).sort((a, b) => a.start - b.start);

  const out: Workout[] = [];
  for (const w of workouts) {
    const samples = (await db.hrSamples.where('workoutId').equals(w.id).toArray()).sort((a, b) => a.t - b.t);
    const next: Workout = { ...w };
    if (samples.length >= 20) {
      next.zones = zoneSeconds(samples, w.start, w.end, profile.maxHR);
      next.load = trimp(samples, w.start, w.end, profile, k);
      if (next.hrAvg === undefined || next.hrMax === undefined) {
        const st = hrStats(samples, w.start, w.end);
        if (st) { next.hrAvg ??= st.avg; next.hrMax ??= st.max; next.hrMin ??= st.min; }
      }
    } else if (w.hrAvg !== undefined) {
      next.load = trimpFromAverage(w.durationSec, w.hrAvg, profile, k);
    }
    const f = shapeFeatures(samples, w, profile, w.steps ?? 0);
    if (f) next.features = f;
    // Prefer the watch's own recovery measurement (recorded within 10 min after the end).
    const health = recoveries.find((r) => r.start >= w.end - 60_000 && r.start <= w.end + 10 * 60_000);
    next.hrRecovery1m = typeof health?.value === 'number' ? health.value : hrRecovery1m(samples, w.end);
    out.push(next);
  }
  for (let i = 0; i < out.length; i += 500) await db.workouts.bulkPut(out.slice(i, i + 500));
}
