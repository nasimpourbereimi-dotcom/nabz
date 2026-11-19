// Rasterizes the app icon (a pulse line on the dark ground) to PNG with no image deps.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x0b, 0x0c, 0x0e];
const FG = [0xff, 0x7a, 0x1a];
// Pulse polyline in a 0..1 box.
const PTS: [number, number][] = [
  [0.14, 0.55], [0.36, 0.55], [0.44, 0.36], [0.53, 0.72], [0.61, 0.28], [0.68, 0.55], [0.86, 0.55],
];

function distToSeg(px: number, py: number, a: [number, number], b: [number, number]) {
  const [ax, ay] = a, [bx, by] = b;
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function crc32(buf: Buffer) {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size: number) {
  const half = (0.045 * size) / 2; // stroke half-width
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let d = Infinity;
      for (let i = 0; i < PTS.length - 1; i++) {
        const a: [number, number] = [PTS[i][0] * size, PTS[i][1] * size];
        const b: [number, number] = [PTS[i + 1][0] * size, PTS[i + 1][1] * size];
        d = Math.min(d, distToSeg(x + 0.5, y + 0.5, a, b));
      }
      const cov = Math.max(0, Math.min(1, half - d + 0.5));
      const o = y * (size * 3 + 1) + 1 + x * 3;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(BG[c] + (FG[c] - BG[c]) * cov);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync('public/icon-192.png', png(192));
writeFileSync('public/icon-512.png', png(512));
writeFileSync('public/apple-touch-icon.png', png(180));
console.log('icons written');
