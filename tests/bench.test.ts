// Parser throughput on a big synthetic export. Run: BENCH=scripts/out/export.zip npx vitest run tests/bench.test.ts
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { NabzDB } from '../src/db/schema';
import { importHealthExport } from '../src/import/healthImport';
import { openHealthZip } from '../src/import/zipSource';
import { loadToday, loadTrends, loadWorkoutDetail, loadWrapped } from '../src/db/queries';

const file = process.env.BENCH;
describe.skipIf(!file)('bench', () => {
  it('imports a large export', async () => {
    const zip = await openHealthZip(new Blob([readFileSync(file!)]));
    let t0 = performance.now();
    let n = 0;
    for await (const c of zip.source(() => {})) n += c.length;
    const readMs = performance.now() - t0;
    t0 = performance.now();
    const phases: Record<string, number> = {};
    let last = t0, lastPhase = '';
    const s = await importHealthExport(new NabzDB('bench'), zip.source, (e) => {
      if (e.type === 'progress' && e.phase !== lastPhase) {
        const now = performance.now();
        if (lastPhase) phases[lastPhase] = (phases[lastPhase] ?? 0) + now - last;
        last = now; lastPhase = e.phase;
      }
    });
    phases[lastPhase] = (phases[lastPhase] ?? 0) + performance.now() - last;
    const totalMs = Math.round(performance.now() - t0);
    const heapMb = Math.round(process.memoryUsage().heapUsed / 1e6);

    // How long do the screens take to compute their models on this much data?
    const db = new NabzDB('bench');
    const now = Date.UTC(2026, 10, 19, 6);
    const time = async (name: string, fn: () => Promise<unknown>) => {
      await fn(); // warm
      const a = performance.now();
      await fn();
      return [name, Math.round(performance.now() - a)] as const;
    };
    const firstWorkout = (await db.workouts.orderBy('start').first())!;
    const screens = Object.fromEntries([
      await time('today', () => loadToday(db, now)),
      await time('trends3m', () => loadTrends(db, '3m', now)),
      await time('trendsAll', () => loadTrends(db, 'all', now)),
      await time('wrapped', () => loadWrapped(db, { y: 1405, m: 8 }, now)),
      await time('workoutDetail', () => loadWorkoutDetail(db, firstWorkout.id)),
    ]);
    console.log(JSON.stringify({ mb: (n / 1e6).toFixed(0), unzipOnlyMs: Math.round(readMs), totalMs, heapMb, phases, s, screensMs: screens }, null, 1));
  }, 600_000);
});
