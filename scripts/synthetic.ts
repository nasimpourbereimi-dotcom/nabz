// Synthetic Apple Health export.xml generator.
// Mirrors the real structure (DOCTYPE with internal subset, Records first, Workouts at the end,
// escaped device strings, metadata children) so the parser can be tested without real health data.
// Standalone on purpose (no src/ imports) so Node can run it directly.

export interface SynthOptions {
  days: number;
  endDate?: Date; // last day (UTC midnight-ish); default 2026-11-18
  seed?: number;
  /** Inject a malformed element and a raw ">" inside an attribute, to test parser tolerance. */
  quirks?: boolean;
}

export interface SynthWorkoutTruth {
  start: number;
  end: number;
  rawType: string;
  energyKcal: number;
  hrAvg: number;
  hrMax: number;
}

export interface SynthTruth {
  workouts: SynthWorkoutTruth[];
  hrRecords: number;
  days: number;
}

const OFFSET_MIN = 210; // +03:30
const MIN = 60_000;
const DAY = 86_400_000;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const p2 = (n: number) => String(n).padStart(2, '0');
/** epoch ms → "2026-11-18 18:42:10 +0330" */
export function fmt(ms: number): string {
  const d = new Date(ms + OFFSET_MIN * MIN);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(
    d.getUTCMinutes(),
  )}:${p2(d.getUTCSeconds())} +0330`;
}

const WATCH = 'Owner’s Apple Watch';
const PHONE = 'Owner’s iPhone';
const WATCH_DEVICE =
  '&lt;&lt;HKDevice: 0x30123&gt;, name:Apple Watch, manufacturer:Apple Inc., model:Watch, hardware:Watch7,1, software:12.0&gt;';

const HEADER = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [
<!-- HealthKit Export Version: 14 -->
<!ELEMENT HealthData (ExportDate,Me,(Record|Correlation|Workout|ActivitySummary|ClinicalRecord|Audiogram|VisionPrescription)*)>
<!ATTLIST HealthData
  locale CDATA #REQUIRED
>
<!ELEMENT Record ((MetadataEntry|HeartRateVariabilityMetadataList)*)>
<!ATTLIST Record
  type          CDATA #REQUIRED
  unit          CDATA #IMPLIED
  value         CDATA #IMPLIED
  sourceName    CDATA #REQUIRED
  startDate     CDATA #REQUIRED
  endDate       CDATA #REQUIRED
>
<!ELEMENT Workout ((MetadataEntry|WorkoutEvent|WorkoutRoute|WorkoutStatistics)*)>
]>
`;

type Rec = [number, string]; // [sort time, xml]

export function* generateExportXml(opts: SynthOptions, truth?: SynthTruth): Generator<string> {
  const rnd = mulberry32(opts.seed ?? 42);
  const endDay = Math.floor((opts.endDate ?? new Date('2026-11-18T00:00:00Z')).getTime() / DAY) * DAY;
  const firstDay = endDay - (opts.days - 1) * DAY;
  const exportAt = endDay + DAY - 4 * 60 * MIN;
  const t = truth ?? { workouts: [], hrRecords: 0, days: opts.days };
  t.days = opts.days;

  yield HEADER;
  yield `<HealthData locale="en_IR">\n <ExportDate value="${fmt(exportAt)}"/>\n`;
  yield ` <Me HKCharacteristicTypeIdentifierDateOfBirth="1992-03-14" HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexNotSet" HKCharacteristicTypeIdentifierBloodType="HKBloodTypeNotSet" HKCharacteristicTypeIdentifierFitzpatrickSkinType="HKFitzpatrickSkinTypeNotSet" HKCharacteristicTypeIdentifierCardioFitnessMedicationsUse="None"/>\n`;

  const rec = (type: string, src: string, unit: string, s: number, e: number, value: string | number, meta = '') =>
    ` <Record type="${type}" sourceName="${src}" sourceVersion="12.0"${
      src === WATCH ? ` device="${WATCH_DEVICE}"` : ''
    } unit="${unit}" creationDate="${fmt(e)}" startDate="${fmt(s)}" endDate="${fmt(e)}" value="${value}"${
      meta ? `>\n${meta}  </Record>\n` : '/>\n'
    }`;

  const workoutsXml: string[] = [];
  const types = [
    'HKWorkoutActivityTypeTraditionalStrengthTraining',
    'HKWorkoutActivityTypeHighIntensityIntervalTraining',
    'HKWorkoutActivityTypeWalking',
    'HKWorkoutActivityTypeFunctionalStrengthTraining',
  ];

  for (let day = firstDay; day <= endDay; day += DAY) {
    const recs: Rec[] = [];
    const localMidnight = day - OFFSET_MIN * MIN; // 00:00 Tehran
    // Workout on ~4 of 7 days, around 18:30 local.
    let wStart = 0, wEnd = 0, wType = '';
    if (rnd() < 0.57) {
      wStart = localMidnight + (18 * 60 + 30 + Math.floor(rnd() * 60)) * MIN + Math.floor(rnd() * 60) * 1000;
      wEnd = wStart + (30 + Math.floor(rnd() * 40)) * MIN;
      wType = types[Math.floor(rnd() * types.length)];
    }

    // Baseline HR every ~5 min (Watch), dense every 5 s inside workouts.
    let hrSum = 0, hrN = 0, hrMax = 0;
    for (let ts = localMidnight + Math.floor(rnd() * 300_000); ts < localMidnight + DAY; ) {
      const inW = wStart && ts >= wStart && ts <= wEnd;
      let bpm: number;
      if (inW) {
        const ph = ((ts - wStart) / 1000) % 150; // set every 150 s
        const peak = wType.includes('Walking') ? 112 : wType.includes('HighIntensity') ? 165 : 150;
        bpm = Math.round(ph < 45 ? 95 + (peak - 95) * (ph / 45) : peak - (peak - 100) * Math.min(1, (ph - 45) / 60));
        bpm += Math.round((rnd() - 0.5) * 6);
        hrSum += bpm; hrN++; hrMax = Math.max(hrMax, bpm);
      } else {
        const hourLocal = (ts - localMidnight) / (60 * MIN);
        bpm = Math.round((hourLocal < 7 ? 56 : 72) + (rnd() - 0.5) * 12);
      }
      const meta = inW ? '' : `  <MetadataEntry key="HKMetadataKeyHeartRateMotionContext" value="${rnd() < 0.5 ? 1 : 0}"/>\n`;
      recs.push([ts, rec('HKQuantityTypeIdentifierHeartRate', WATCH, 'count/min', ts, ts, bpm, meta)]);
      t.hrRecords++;
      ts += inW ? 5000 : 240_000 + Math.floor(rnd() * 120_000);
      if (!inW && wStart && ts > wStart && ts < wEnd) ts = wStart;
    }

    // Daily: resting HR, HRV x3, steps (two sources, overlapping), active energy, exercise minutes.
    recs.push([localMidnight + 7 * 60 * MIN, rec('HKQuantityTypeIdentifierRestingHeartRate', WATCH, 'count/min', localMidnight, localMidnight + 20 * 60 * MIN, 55 + Math.floor(rnd() * 6))]);
    for (const h of [3, 11, 22]) {
      const s = localMidnight + h * 60 * MIN;
      recs.push([s, rec('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', WATCH, 'ms', s, s + MIN, (38 + rnd() * 20).toFixed(4))]);
    }
    for (let h = 8; h < 23; h++) {
      const s = localMidnight + h * 60 * MIN;
      const steps = Math.floor(200 + rnd() * 700);
      recs.push([s, rec('HKQuantityTypeIdentifierStepCount', WATCH, 'count', s, s + 60 * MIN, steps)]);
      recs.push([s + 1, rec('HKQuantityTypeIdentifierStepCount', PHONE, 'count', s, s + 60 * MIN, Math.floor(steps * 0.8))]);
      for (let m = 0; m < 60; m += 10) {
        const es = s + m * MIN;
        const inW = wStart && es >= wStart && es < wEnd;
        recs.push([es, rec('HKQuantityTypeIdentifierActiveEnergyBurned', WATCH, 'kcal', es, es + 10 * MIN, (inW ? 60 : 2 + rnd() * 4).toFixed(3))]);
      }
    }
    if (wStart) {
      for (let m = wStart; m < wEnd; m += MIN) {
        recs.push([m, rec('HKQuantityTypeIdentifierAppleExerciseTime', WATCH, 'min', m, m + MIN, 1)]);
      }
      recs.push([wEnd + MIN, rec('HKQuantityTypeIdentifierHeartRateRecoveryOneMinute', WATCH, 'count/min', wEnd, wEnd + MIN, 20 + Math.floor(rnd() * 15))]);
      if (wType.includes('Walking')) {
        recs.push([wEnd + 2 * MIN, rec('HKQuantityTypeIdentifierVO2Max', WATCH, 'mL/min·kg', wEnd, wEnd, (38 + rnd() * 4).toFixed(2))]);
      }
    }
    // Sleep: previous night 23:30 → 07:00 local, ending on this day.
    let ss = localMidnight - 30 * MIN;
    const sleepEnd = localMidnight + 7 * 60 * MIN;
    recs.push([ss, rec('HKCategoryTypeIdentifierSleepAnalysis', PHONE, '', ss - 10 * MIN, sleepEnd + 5 * MIN, 'HKCategoryValueSleepAnalysisInBed')]);
    const stages = ['AsleepCore', 'AsleepDeep', 'AsleepCore', 'AsleepREM', 'Awake'];
    let i = 0;
    while (ss < sleepEnd) {
      const len = (stages[i % 5] === 'Awake' ? 3 : 20 + Math.floor(rnd() * 30)) * MIN;
      const se = Math.min(sleepEnd, ss + len);
      recs.push([ss, rec('HKCategoryTypeIdentifierSleepAnalysis', WATCH, '', ss, se, `HKCategoryValueSleepAnalysis${stages[i % 5]}`)]);
      ss = se; i++;
    }

    if (opts.quirks && day === firstDay) {
      // Raw ">" inside an attribute value, and a broken element; parser must survive both.
      recs.push([localMidnight + 1, ` <Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Odd > Source" unit="count/min" startDate="${fmt(localMidnight + 1000)}" endDate="${fmt(localMidnight + 1000)}" value="61"/>\n`]);
      recs.push([localMidnight + 2, ` <Record type="HKQuantityTypeIdentifierHeartRate" sourceName=BROKEN unit="count/min" startDate="nope"/>\n`]);
    }

    recs.sort((a, b) => a[0] - b[0]);
    let buf = '';
    for (const [, x] of recs) {
      buf += x;
      if (buf.length > 256_000) { yield buf; buf = ''; }
    }
    if (buf) yield buf;

    if (wStart) {
      const kcal = Math.round(((wEnd - wStart) / (10 * MIN)) * 60);
      const avg = Math.round(hrSum / Math.max(1, hrN));
      t.workouts.push({ start: wStart, end: wEnd, rawType: wType, energyKcal: kcal, hrAvg: avg, hrMax });
      workoutsXml.push(
        ` <Workout workoutActivityType="${wType}" duration="${((wEnd - wStart) / MIN).toFixed(6)}" durationUnit="min" sourceName="${WATCH}" sourceVersion="12.0" device="${WATCH_DEVICE}" creationDate="${fmt(wEnd)}" startDate="${fmt(wStart)}" endDate="${fmt(wEnd)}">
  <MetadataEntry key="HKIndoorWorkout" value="${wType.includes('Walking') ? 0 : 1}"/>
  <MetadataEntry key="HKTimeZone" value="Asia/Tehran"/>
  <WorkoutEvent type="HKWorkoutEventTypeSegment" date="${fmt(wStart)}" duration="${((wEnd - wStart) / MIN).toFixed(3)}" durationUnit="min"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="${fmt(wStart)}" endDate="${fmt(wEnd)}" sum="${kcal}" unit="kcal"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierBasalEnergyBurned" startDate="${fmt(wStart)}" endDate="${fmt(wEnd)}" sum="${Math.round(kcal / 4)}" unit="kcal"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" startDate="${fmt(wStart)}" endDate="${fmt(wEnd)}" average="${avg}" minimum="88" maximum="${hrMax}" unit="count/min"/>${
    wType.includes('Walking')
      ? `
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" startDate="${fmt(wStart)}" endDate="${fmt(wEnd)}" sum="${(((wEnd - wStart) / MIN) * 0.09).toFixed(3)}" unit="km"/>
  <WorkoutRoute sourceName="${WATCH}" sourceVersion="12.0" creationDate="${fmt(wEnd)}" startDate="${fmt(wStart)}" endDate="${fmt(wEnd)}">
   <MetadataEntry key="HKMetadataKeySyncVersion" value="2"/>
   <FileReference path="/workout-routes/route_${fmt(wStart).slice(0, 10)}.gpx"/>
  </WorkoutRoute>`
      : ''
  }
 </Workout>
`,
      );
    }
  }

  yield workoutsXml.join('');
  yield ` <ActivitySummary dateComponents="${fmt(endDay).slice(0, 10)}" activeEnergyBurned="512" activeEnergyBurnedGoal="500" activeEnergyBurnedUnit="Cal" appleMoveTime="0" appleMoveTimeGoal="0" appleExerciseTime="45" appleExerciseTimeGoal="30" appleStandHours="12" appleStandHoursGoal="12"/>\n`;
  yield '</HealthData>\n';
}
