import { describe, expect, it } from 'vitest';
import { NabzDB, TABLES } from '../src/db/schema';
import { BackupError, createBackup, restoreBackup } from '../src/backup/backup';

const NL = String.fromCharCode(10);

async function seed(db: NabzDB) {
  await db.workouts.bulkPut([
    { id: 'x1', start: 1, end: 2, durationSec: 1, type: 'strength', typeSource: 'health', source: 'export', rpe: 6, notes: 'یادداشت' },
    { id: 'x2', start: 3, end: 4, durationSec: 1, type: 'walk', typeSource: 'health', source: 'export' },
  ]);
  await db.hrSamples.bulkPut(Array.from({ length: 4500 }, (_, i) => ({ t: i * 5000, bpm: 100 + (i % 50), workoutId: 'x1' })));
  await db.samples.bulkPut([
    { type: 'sleep', start: 10, end: 20, value: 'deep' },
    { type: 'hrvSDNN', start: 10, end: 20, value: 48.2 },
  ]);
  await db.dailyMetrics.put({ date: '2026-11-18', steps: 8000, sleepStages: { deep: 60 } });
  await db.settings.put({ key: 'accent', value: '#FF7A1A' });
  await db.syncLog.add({ at: 5, kind: 'export', counts: { workouts: 2 } });
}

async function dump(db: NabzDB) {
  const out: Record<string, unknown[]> = {};
  for (const t of TABLES) out[t] = await db.table(t).toArray();
  return out;
}

describe('backup / restore', () => {
  it('round-trips every table exactly', async () => {
    const a = new NabzDB('bk-a');
    await seed(a);
    const blob = await createBackup(a);
    expect(blob.size).toBeGreaterThan(100);

    const b = new NabzDB('bk-b');
    await b.workouts.put({ id: 'stale', start: 0, end: 1, durationSec: 1, type: 'x', typeSource: 'guessed', source: 'inferred' });
    await restoreBackup(b, blob);
    const restored = await dump(b);
    const original = await dump(a);
    // restore adds one syncLog entry of its own
    expect(restored.syncLog.length).toBe(original.syncLog.length + 1);
    delete restored.syncLog; delete original.syncLog;
    expect(restored).toEqual(original);
  });

  it('rolls back to the previous data when writing fails half-way', async () => {
    const db = new NabzDB('bk-d');
    await seed(db);
    const before = await dump(db);
    // Structurally valid, but the hrSamples row has no primary key → bulkPut fails after the wipe.
    const lines = [
      JSON.stringify({ nabz: 'backup', v: 1, schema: 2, exportedAt: 1 }),
      JSON.stringify({ t: 'workouts', r: [{ id: 'new', start: 1, end: 2, durationSec: 1, type: 'walk', typeSource: 'health', source: 'export' }] }),
      JSON.stringify({ t: 'hrSamples', r: [{ bpm: 100 }] }),
    ].join(NL) + NL;
    const gz = await new Response(new Blob([lines]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
    await expect(restoreBackup(db, gz)).rejects.toMatchObject({ code: 'rolled-back' });
    const after = await dump(db);
    expect(after).toEqual(before);
  });

  it('validates the whole file before touching anything', async () => {
    const db = new NabzDB('bk-e');
    await seed(db);
    const good = await createBackup(db);
    const text = await new Response(good.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    const broken = text + '{"t":"workouts","r":[' + NL; // corrupt tail
    const gz = await new Response(new Blob([broken]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
    await expect(restoreBackup(db, gz)).rejects.toMatchObject({ code: 'corrupt' });
    expect(await db.workouts.count()).toBe(2);
  });

  it('refuses a non-backup file without touching data', async () => {
    const db = new NabzDB('bk-c');
    await seed(db);
    const notGz = new Blob(['hello']);
    await expect(restoreBackup(db, notGz)).rejects.toBeInstanceOf(BackupError);
    const gzOther = await new Response(
      new Blob(['{"hello":1}\n']).stream().pipeThrough(new CompressionStream('gzip')),
    ).blob();
    await expect(restoreBackup(db, gzOther)).rejects.toMatchObject({ code: 'not-backup' });
    expect(await db.workouts.count()).toBe(2);
  });
});
