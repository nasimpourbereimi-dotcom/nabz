import { format } from 'date-fns-jalali';
import { faIR } from 'date-fns-jalali/locale';
import { faDigits } from './digits';

/** e.g. "چهارشنبه ۶ آبان" — presentation only; storage stays UTC ms. */
export function faDayLabel(ms: number): string {
  return faDigits(format(ms, 'EEEE d MMMM', { locale: faIR }));
}

export function faYear(ms: number): string {
  return faDigits(format(ms, 'yyyy', { locale: faIR }));
}

export function faDate(ms: number): string {
  return faDigits(format(ms, 'd MMMM yyyy', { locale: faIR }));
}

const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hour12: false });
/** "18:42" in Tehran time, Persian digits. */
export function faTime(ms: number): string {
  return faDigits(timeFmt.format(ms));
}
