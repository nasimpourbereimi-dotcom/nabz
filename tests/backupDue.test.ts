import { describe, expect, it } from 'vitest';
import { backupDue } from '../src/db/queries';

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 22);

describe('backupDue', () => {
  it('waits two weeks after the first data before the first nudge', () => {
    expect(backupDue(undefined, undefined, now)).toBe(false);
    expect(backupDue(undefined, now - 10 * DAY, now)).toBe(false);
    expect(backupDue(undefined, now - 15 * DAY, now)).toBe(true);
  });
  it('then asks every 30 days', () => {
    expect(backupDue(now - 29 * DAY, now - 400 * DAY, now)).toBe(false);
    expect(backupDue(now - 31 * DAY, now - 400 * DAY, now)).toBe(true);
  });
});
