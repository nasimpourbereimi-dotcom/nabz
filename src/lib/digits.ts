const FA = '۰۱۲۳۴۵۶۷۸۹';

/** Latin digits → Persian digits. */
export function faDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA[+d]);
}

/** Persian / Arabic-Indic digits → Latin (for parsing Shortcuts payloads on a Persian-locale phone). */
export function latinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[٫]/g, '.')
    .replace(/[٬]/g, ',');
}

/** Formats a number with Persian digits and Persian thousands separator. */
export function faNumber(n: number, maxFractionDigits = 0): string {
  return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: maxFractionDigits }).format(n);
}
