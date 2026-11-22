// Peak JS heap of the streaming pipeline alone (unzip → text → tag scanner → attribute reads), without a
// database: fake-indexeddb keeps every stored row in the JS heap, real IndexedDB does not.
// Run: BENCH=scripts/out/export5y.zip npx vitest run tests/benchMemory.test.ts
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { openHealthZip } from '../src/import/zipSource';
import { attr, TagScanner } from '../src/import/tagScanner';

const file = process.env.BENCH;
describe.skipIf(!file)('bench memory', () => {
  it('streams without holding the file', async () => {
    const zip = await openHealthZip(new Blob([readFileSync(file!)]));
    global.gc?.();
    const base = process.memoryUsage().heapUsed;
    let peak = base, records = 0;
    const scanner = new TagScanner((t) => {
      if (t.name === 'Record' && !t.isEnd) { records++; attr(t.raw, 'type'); attr(t.raw, 'startDate'); attr(t.raw, 'value'); }
    });
    let chunks = 0;
    for await (const c of zip.source(() => {})) {
      scanner.push(c);
      if (++chunks % 50 === 0) peak = Math.max(peak, process.memoryUsage().heapUsed);
    }
    scanner.end();
    console.log(JSON.stringify({ records, peakAboveBaseMb: Math.round((peak - base) / 1e6), zipFileMb: Math.round(readFileSync(file!).length / 1e6) }));
  }, 600_000);
});
