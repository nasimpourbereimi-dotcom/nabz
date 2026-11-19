// Apple HealthKit identifiers → Nabz model. Pure, no DB access.

export const HK = {
  heartRate: 'HKQuantityTypeIdentifierHeartRate',
  restingHR: 'HKQuantityTypeIdentifierRestingHeartRate',
  hrv: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  hrRecovery: 'HKQuantityTypeIdentifierHeartRateRecoveryOneMinute',
  vo2max: 'HKQuantityTypeIdentifierVO2Max',
  activeEnergy: 'HKQuantityTypeIdentifierActiveEnergyBurned',
  exerciseTime: 'HKQuantityTypeIdentifierAppleExerciseTime',
  steps: 'HKQuantityTypeIdentifierStepCount',
  sleep: 'HKCategoryTypeIdentifierSleepAnalysis',
} as const;

export type SleepStage = 'inBed' | 'asleep' | 'core' | 'deep' | 'rem' | 'awake';

export function sleepStage(value: string): SleepStage | undefined {
  switch (value) {
    case 'HKCategoryValueSleepAnalysisInBed': return 'inBed';
    case 'HKCategoryValueSleepAnalysisAsleep':
    case 'HKCategoryValueSleepAnalysisAsleepUnspecified': return 'asleep';
    case 'HKCategoryValueSleepAnalysisAsleepCore': return 'core';
    case 'HKCategoryValueSleepAnalysisAsleepDeep': return 'deep';
    case 'HKCategoryValueSleepAnalysisAsleepREM': return 'rem';
    case 'HKCategoryValueSleepAnalysisAwake': return 'awake';
    default: return undefined;
  }
}

export const ASLEEP_STAGES: ReadonlySet<SleepStage> = new Set(['asleep', 'core', 'deep', 'rem']);

/** Short internal workout type. Unknown types keep a readable suffix of the HK name. */
export function normalizeWorkoutType(raw: string): string {
  const t = raw.replace('HKWorkoutActivityType', '');
  switch (t) {
    case 'TraditionalStrengthTraining':
    case 'FunctionalStrengthTraining': return 'strength';
    case 'HighIntensityIntervalTraining':
    case 'CrossTraining':
    case 'MixedCardio': return 'hiit';
    case 'Walking':
    case 'Hiking': return 'walk';
    case 'Running': return 'run';
    case 'Cycling': return 'cycle';
    case 'CoreTraining': return 'core';
    case 'Yoga':
    case 'Flexibility':
    case 'Pilates':
    case 'MindAndBody':
    case 'Cooldown': return 'mobility';
    default: return t ? t.charAt(0).toLowerCase() + t.slice(1) : 'other';
  }
}

export function energyToKcal(value: number, unit: string | undefined): number {
  if (unit === 'kJ') return value / 4.184;
  return value; // "kcal" and "Cal" are the same
}

export function distanceToKm(value: number, unit: string | undefined): number {
  switch (unit) {
    case 'mi': return value * 1.609344;
    case 'm': return value / 1000;
    case 'yd': return value * 0.0009144;
    default: return value; // km
  }
}
