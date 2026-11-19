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
