// Tolerant value parsing for Shortcuts payloads. A Persian-locale iPhone may emit Persian digits,
// Persian decimal marks, comma decimals, Jalali years, or Health-export style dates. Be generous here,
// strict everywhere else.
import { newDate } from 'date-fns-jalali';
import { latinDigits } from '../lib/digits';
import { parseHealthDate } from '../lib/time';

/** Number from a JSON number or a localized string. Undefined if it isn't a finite number. */
export function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  let s = latinDigits(v).trim().replace(/[\s ‎‏]/g, '');
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, ''); // 1,234 or 1,234.5
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.'); // 312,4
  if (!/^-?\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

const ISO_RE =
  /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;
const TEHRAN_OFFSET_MIN = 210;

/**
 * Epoch ms from: ISO 8601 (with/without offset), "YYYY-MM-DD HH:mm:ss +0330", "YYYY/MM/DD …",
 * Jalali years (< 1700 → converted), epoch seconds/ms, all with Persian or Latin digits.
 * Missing offset → Asia/Tehran (+03:30; Iran has no DST since 2022).
 */
export function toTime(v: unknown): number | undefined {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return undefined;
    return v > 1e11 ? v : v * 1000; // ms vs seconds
  }
  if (typeof v !== 'string') return undefined;
  const s = latinDigits(v).trim().replace(/[‎‏]/g, '');
  if (/^\d{10}(\d{3})?$/.test(s)) return toTime(Number(s));

  const m = ISO_RE.exec(s);
  if (!m) {
    const t = parseHealthDate(s);
    return Number.isFinite(t) ? t : undefined;
  }
  let y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1700) {
    // Jalali calendar on the phone
    const g = newDate(y, mo - 1, d);
    if (Number.isNaN(g.getTime())) return undefined;
    y = g.getFullYear(); mo = g.getMonth() + 1; d = g.getDate();
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  const hh = +(m[4] ?? 0), mi = +(m[5] ?? 0), ss = +(m[6] ?? 0);
  if (hh > 23 || mi > 59 || ss > 60) return undefined;
  let offsetMin = TEHRAN_OFFSET_MIN;
  if (m[7]) {
    if (m[7].toUpperCase() === 'Z') offsetMin = 0;
    else {
      const o = m[7].replace(':', '');
      offsetMin = (o[0] === '-' ? -1 : 1) * (+o.slice(1, 3) * 60 + +o.slice(3, 5));
    }
  }
  return Date.UTC(y, mo - 1, d, hh, mi, ss) - offsetMin * 60_000;
}
