// Calendar math on "YYYY-MM-DD" keys (already in the owner's local timezone). No timezone logic here.

const DAY = 86_400_000;

export function dayIndex(key: string): number {
  return Math.round(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / DAY);
}

export function fromIndex(i: number): string {
  return new Date(i * DAY).toISOString().slice(0, 10);
}

export const addDays = (key: string, n: number) => fromIndex(dayIndex(key) + n);

export const daysBetween = (a: string, b: string) => dayIndex(b) - dayIndex(a);

/** Iranian week starts on Saturday. 0 = Saturday … 6 = Friday. */
export function weekdaySat0(key: string): number {
  const js = new Date(dayIndex(key) * DAY).getUTCDay(); // 0 = Sunday
  return (js + 1) % 7;
}

export const weekStart = (key: string) => addDays(key, -weekdaySat0(key));
