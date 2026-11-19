import { describe, expect, it } from 'vitest';
import { toNumber, toTime } from '../src/sync/normalize';
import { parsePayload, PayloadError, sleepStageFrom } from '../src/sync/payload';

const T = Date.UTC(2026, 10, 19, 7, 30, 0); // 11:00 Tehran

describe('normalize', () => {
  it('reads localized numbers', () => {
    expect(toNumber(312.4)).toBe(312.4);
    expect(toNumber('۳۱۲٫۴')).toBe(312.4);
    expect(toNumber('312,4')).toBe(312.4);
    expect(toNumber('1,234')).toBe(1234);
    expect(toNumber('۱٬۲۳۴')).toBe(1234);
    expect(toNumber(' 98 ')).toBe(98);
    expect(toNumber('abc')).toBeUndefined();
    expect(toNumber(NaN)).toBeUndefined();
  });
  it('reads many date shapes', () => {
    expect(toTime('2026-11-19T07:30:00Z')).toBe(T);
    expect(toTime('2026-11-19T11:00:00+03:30')).toBe(T);
    expect(toTime('2026-11-19T11:00:00+0330')).toBe(T);
    expect(toTime('2026-11-19 11:00:00 +0330')).toBe(T);
    expect(toTime('2026-11-19T11:00:00')).toBe(T); // no offset → Tehran
    expect(toTime('۲۰۲۶-۱۱-۱۹T۱۱:۰۰:۰۰+۰۳:۳۰')).toBe(T);
    expect(toTime('1405-08-28T11:00:00+03:30')).toBe(T); // Jalali year
    expect(toTime('1405/08/28 11:00')).toBe(T);
    expect(toTime(T / 1000)).toBe(T);
    expect(toTime(String(T))).toBe(T);
    expect(toTime('2026-11-19T11:00:00.123+03:30')).toBe(T);
    expect(toTime('yesterday')).toBeUndefined();
    expect(toTime('2026-13-01')).toBeUndefined();
  });
});

describe('parsePayload', () => {
  const base = {
    v: 1,
    generatedAt: '2026-11-19T07:30:00Z',
    since: '2026-11-18T19:00:00Z',
    workouts: [{ start: '2026-11-18T15:00:00Z', end: '2026-11-18T15:45:00Z', activeKcal: '۳۱۲٫۴', hr: [['2026-11-18T15:00:05Z', 98], ['2026-11-18T15:00:10Z', '121']] }],
    samples: {
      heartRate: [['2026-11-18T20:00:00Z', 72]],
      restingHR: [{ date: '2026-11-19T03:00:00Z', value: 58 }],
      hrvSDNN: [['2026-11-19T00:00:00Z', 47.9]],
      sleep: [['2026-11-18T20:00:00Z', '2026-11-18T21:00:00Z', 'Asleep Core', 'Apple Watch'], { start: '2026-11-18T21:00:00Z', end: '2026-11-18T21:30:00Z', value: 'HKCategoryValueSleepAnalysisAsleepDeep' }],
      activeEnergy: [['2026-11-18T15:00:00Z', '2026-11-18T15:10:00Z', 12.3, 'Apple Watch']],
      exerciseMinutes: [{ start: '2026-11-18T15:00:00Z', end: '2026-11-18T15:01:00Z', value: 1 }],
      steps: [['2026-11-18T15:00:00Z', '2026-11-18T16:00:00Z', 230], ['bad', 'x', 1]],
    },
  };

  it('parses tuples and dictionaries into one shape', () => {
    const p = parsePayload(JSON.stringify(base));
    expect(p.workouts).toHaveLength(1);
    expect(p.workouts[0].activeKcal).toBe(312.4);
    expect(p.workouts[0].hr).toHaveLength(2);
    expect(p.restingHR[0].v).toBe(58);
    expect(p.sleep.map((s) => s.stage)).toEqual(['core', 'deep']);
    expect(p.sleep[0].source).toBe('Apple Watch');
    expect(p.activeEnergy[0]).toMatchObject({ v: 12.3, source: 'Apple Watch' });
    expect(p.exerciseMinutes[0].v).toBe(1);
    expect(p.steps).toHaveLength(1);
    expect(p.skipped).toBe(1);
    expect(p.generatedAt).toBe(T);
  });

  it('accepts columnar lists (what Shortcuts builds without loops)', () => {
    const p = parsePayload(JSON.stringify({
      v: 1,
      workouts: { items: [{ start: '2026-11-18T15:00:00Z', end: '2026-11-18T15:45:00Z', hr: { t: ['2026-11-18T15:00:05Z', '2026-11-18T15:00:10Z'], v: [98, '121'] } }] },
      samples: {
        heartRate: { t: ['2026-11-18T20:00:00Z', '2026-11-18T20:05:00Z'], v: [72, 70] },
        steps: { start: ['2026-11-18T15:00:00Z'], end: ['2026-11-18T16:00:00Z'], v: [230], source: ['Apple Watch'] },
        sleep: { start: ['2026-11-18T20:00:00Z'], end: ['2026-11-18T21:00:00Z'], v: ['Core'], source: ['Apple Watch'] },
      },
    }));
    expect(p.workouts[0].hr.map((h) => h.v)).toEqual([98, 121]);
    expect(p.heartRate).toHaveLength(2);
    expect(p.steps[0]).toMatchObject({ v: 230, source: 'Apple Watch' });
    expect(p.sleep[0].stage).toBe('core');
  });

  it('accepts columns that arrive as newline-separated text', () => {
    const p = parsePayload(JSON.stringify({
      v: 1,
      samples: { heartRate: { t: '2026-11-18T20:00:00Z\n2026-11-18T20:05:00Z\n', v: '۷۲\n۷۰' } },
    }));
    expect(p.heartRate.map((h) => h.v)).toEqual([72, 70]);
  });

  it('accepts Persian digits outside strings', () => {
    const txt = '{"v":۱,"workouts":[],"samples":{"restingHR":[["2026-11-19T03:00:00Z",۵۸]]}}';
    expect(parsePayload(txt).restingHR[0].v).toBe(58);
  });

  it('rejects junk with friendly codes', () => {
    const code = (t: string) => { try { parsePayload(t); return 'ok'; } catch (e) { return (e as PayloadError).code; } };
    expect(code('')).toBe('empty');
    expect(code('hello')).toBe('not-json');
    expect(code('{"a":1}')).toBe('not-nabz');
    expect(code('[1,2]')).toBe('not-nabz');
    expect(code('{"v":2,"samples":{}}')).toBe('version');
  });

  it('maps sleep stage spellings', () => {
    expect(sleepStageFrom('In Bed')).toBe('inBed');
    expect(sleepStageFrom('REM')).toBe('rem');
    expect(sleepStageFrom('HKCategoryValueSleepAnalysisAwake')).toBe('awake');
    expect(sleepStageFrom('nap')).toBeUndefined();
  });
});
