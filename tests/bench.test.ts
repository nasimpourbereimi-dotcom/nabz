// Parser throughput on a big synthetic export. Run: BENCH=scripts/out/export.zip npx vitest run tests/bench.test.ts
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { NabzDB } from '../src/db/schema';
import { importHealthExport } from '../src/import/healthImport';
import { openHealthZip } from '../src/import/zipSource';

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
    console.log(JSON.stringify({ mb: (n / 1e6).toFixed(0), unzipOnlyMs: Math.round(readMs), totalMs: Math.round(performance.now() - t0), phases, s }, null, 1));
  }, 600_000);
});
