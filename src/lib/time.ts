export const TZ = 'Asia/Tehran';
export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

/**
 * Parses Apple Health export dates: "2024-05-01 18:42:10 +0330".
 * Hand-rolled because it runs millions of times during import.
 * Returns epoch ms, or NaN if the string is malformed.
 */
export function parseHealthDate(s: string): number {
  if (s.length < 19) return NaN;
  const n = (i: number, len: number) => {
    let v = 0;
    for (let k = i; k < i + len; k++) {
      const c = s.charCodeAt(k) - 48;
      if (c < 0 || c > 9) return NaN;
      v = v * 10 + c;
    }
    return v;
  };
  const ms = Date.UTC(n(0, 4), n(5, 2) - 1, n(8, 2), n(11, 2), n(14, 2), n(17, 2));
  if (Number.isNaN(ms)) return NaN;
  // Offset: " +0330" / " -0500"; tolerate "Z" or missing (treat as UTC).
  const off = s.slice(19).trim();
  if (off.length >= 5 && (off[0] === '+' || off[0] === '-')) {
    const sign = off[0] === '-' ? -1 : 1;
    const digits = off.replace(':', '');
    const oh = Number(digits.slice(1, 3));
    const om = Number(digits.slice(3, 5));
    if (Number.isNaN(oh) || Number.isNaN(om)) return NaN;
    return ms - sign * (oh * 60 + om) * MIN;
  }
  return ms;
}

/** Local calendar date ("YYYY-MM-DD") of an Apple Health date string, in the timezone it was recorded in. */
export function healthLocalDate(s: string): string {
  return s.slice(0, 10);
}

const dayKeyCache = new Map<number, string>();
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Gregorian "YYYY-MM-DD" of an instant in Asia/Tehran. Cached per 30 min (Tehran offset is :30). */
export function tehranDateKey(ms: number): string {
  const bucket = Math.floor(ms / (30 * MIN));
  let v = dayKeyCache.get(bucket);
  if (v === undefined) {
    v = dayFmt.format(new Date(bucket * 30 * MIN));
    if (dayKeyCache.size > 50_000) dayKeyCache.clear();
    dayKeyCache.set(bucket, v);
  }
  return v;
}

const hourCache = new Map<number, number>();
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' });
/** Hour of day (0–23) in Asia/Tehran. Cached per 30 min. */
export function tehranHour(ms: number): number {
  const bucket = Math.floor(ms / (30 * MIN));
  let h = hourCache.get(bucket);
  if (h === undefined) {
    h = Number(hourFmt.format(new Date(bucket * 30 * MIN))) % 24;
    if (hourCache.size > 50_000) hourCache.clear();
    hourCache.set(bucket, h);
  }
  return h;
}
