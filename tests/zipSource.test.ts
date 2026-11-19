import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { ImportError, openHealthZip } from '../src/import/zipSource';

async function readAll(src: Awaited<ReturnType<typeof openHealthZip>>['source']) {
  let s = '', last = 0;
  for await (const c of src((f) => { last = f; })) s += c;
  return { s, last };
}

describe('openHealthZip', () => {
  it('finds export.xml (not export_cda.xml) and can read it twice', async () => {
    const xml = '<HealthData>' + 'نبض '.repeat(50_000) + '</HealthData>';
    const zip = zipSync({
      'apple_health_export/export_cda.xml': strToU8('<cda/>'),
      'apple_health_export/export.xml': strToU8(xml),
      'apple_health_export/workout-routes/r.gpx': strToU8('<gpx/>'),
    });
    const h = await openHealthZip(new Blob([zip]));
    const a = await readAll(h.source);
    const b = await readAll(h.source);
    expect(a.s).toBe(xml);
    expect(b.s).toBe(xml);
    expect(a.last).toBe(1);
    await h.close();
  });

  it('reports a friendly error code for wrong files', async () => {
    const noXml = zipSync({ 'something.txt': strToU8('hi') });
    await expect(openHealthZip(new Blob([noXml]))).rejects.toMatchObject({ code: 'no-export-xml' });
    await expect(openHealthZip(new Blob([strToU8('not a zip')]))).rejects.toBeInstanceOf(ImportError);
  });
});
