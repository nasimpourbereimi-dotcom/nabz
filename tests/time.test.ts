import { describe, expect, it } from 'vitest';
import { parseHealthDate, tehranDateKey } from '../src/lib/time';
import { faDigits, latinDigits } from '../src/lib/digits';

describe('time', () => {
  it('parses Health dates with offsets', () => {
    expect(parseHealthDate('2026-11-18 18:42:10 +0330')).toBe(Date.UTC(2026, 10, 18, 15, 12, 10));
    expect(parseHealthDate('2020-06-01 10:00:00 +0430')).toBe(Date.UTC(2020, 5, 1, 5, 30, 0));
    expect(parseHealthDate('2026-01-01 00:00:00 -0500')).toBe(Date.UTC(2026, 0, 1, 5, 0, 0));
    expect(parseHealthDate('nope')).toBeNaN();
    expect(parseHealthDate('2026-1x-01 00:00:00 +0000')).toBeNaN();
  });

  it('maps instants to Tehran calendar days', () => {
    expect(tehranDateKey(Date.UTC(2026, 10, 18, 20, 29))).toBe('2026-11-18'); // 23:59 Tehran
    expect(tehranDateKey(Date.UTC(2026, 10, 18, 20, 30))).toBe('2026-11-19'); // 00:00 Tehran
  });

  it('converts digits both ways', () => {
    expect(faDigits('12:30')).toBe('۱۲:۳۰');
    expect(latinDigits('۱۲٫۵ و ٣')).toBe('12.5 و 3');
  });
});
