// Jalali month ↔ Gregorian day keys ("YYYY-MM-DD"). Uses the device's local calendar day, which for the
// owner is Asia/Tehran — the same calendar the day keys are in.
import { format, getMonth, getYear, newDate } from 'date-fns-jalali';
import { faIR } from 'date-fns-jalali/locale';

export interface JMonth { y: number; m: number } // m: 1..12

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromKey = (k: string) => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10), 12);

export function jmonthOf(dayKey: string): JMonth {
  const d = fromKey(dayKey);
  return { y: getYear(d), m: getMonth(d) + 1 };
}

export function addJMonths(j: JMonth, n: number): JMonth {
  const i = j.y * 12 + (j.m - 1) + n;
  return { y: Math.floor(i / 12), m: (i % 12) + 1 };
}

/** [first day, first day of next month) as Gregorian day keys. */
export function jmonthRange(j: JMonth): [string, string] {
  const n = addJMonths(j, 1);
  return [key(newDate(j.y, j.m - 1, 1)), key(newDate(n.y, n.m - 1, 1))];
}

export function jmonthName(j: JMonth): string {
  return format(newDate(j.y, j.m - 1, 1), 'MMMM', { locale: faIR });
}

export const jmonthEq = (a: JMonth, b: JMonth) => a.y === b.y && a.m === b.m;
