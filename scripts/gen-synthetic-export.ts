// Usage: npm run gen:export -- [days=365] [out=scripts/out/export.zip]
// Writes a zip with the same layout as Health's "Export All Health Data".
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Zip, ZipDeflate } from 'fflate';
import { generateExportXml, type SynthTruth } from './synthetic.ts';

const days = Number(process.argv[2] ?? 365);
const out = process.argv[3] ?? 'scripts/out/export.zip';
mkdirSync(dirname(out), { recursive: true });

const file = createWriteStream(out);
let pending = 0;
const zip = new Zip((err, chunk, final) => {
  if (err) throw err;
  pending++;
  file.write(chunk, () => pending--);
  if (final) file.end();
});

const enc = new TextEncoder();
const add = (name: string, text: string) => {
  const f = new ZipDeflate(name, { level: 6 });
  zip.add(f);
  f.push(enc.encode(text), true);
};

// A big CDA file Apple also ships; the importer must skip it.
add('apple_health_export/export_cda.xml', '<?xml version="1.0"?><ClinicalDocument>skip me</ClinicalDocument>\n');
add('apple_health_export/workout-routes/route_dummy.gpx', '<gpx></gpx>\n');

const xml = new ZipDeflate('apple_health_export/export.xml', { level: 6 });
zip.add(xml);
const truth: SynthTruth = { workouts: [], hrRecords: 0, days };
let bytes = 0;
for (const part of generateExportXml({ days, quirks: true }, truth)) {
  const b = enc.encode(part);
  bytes += b.length;
  xml.push(b);
}
xml.push(new Uint8Array(0), true);
zip.end();

file.on('close', () => {
  console.log(
    `export.xml: ${(bytes / 1e6).toFixed(1)} MB · ${truth.workouts.length} workouts · ${truth.hrRecords} HR records → ${out}`,
  );
});
