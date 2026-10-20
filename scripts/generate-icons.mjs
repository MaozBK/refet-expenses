// Generates the PWA PNG icons with no external dependencies.
// Run: npm run icons
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    let c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(size, pixelFn) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Colour of a point in unit space (0..1). Returns [r,g,b,a].
function sample(u, v, rounded) {
  if (rounded) {
    const r = 0.22;
    const cx = Math.min(Math.max(u, r), 1 - r);
    const cy = Math.min(Math.max(v, r), 1 - r);
    if ((u - cx) ** 2 + (v - cy) ** 2 > r * r) return [0, 0, 0, 0];
  }
  const t = (u + v) / 2;
  const bg = [47 + (76 - 47) * t, 125 + (175 - 125) * t, 50 + (80 - 50) * t, 255];
  const white = [255, 255, 255, 255];
  const d = Math.hypot(u - 0.5, v - 0.5);
  if (d <= 0.31 && d >= 0.25) return white; // ring
  const bar = (x0, x1, y0, y1) => u >= x0 && u <= x1 && v >= y0 && v <= y1;
  if (bar(0.33, 0.43, 0.52, 0.68) || bar(0.45, 0.55, 0.38, 0.68) || bar(0.57, 0.67, 0.45, 0.68)) return white;
  return bg;
}

function render(size, rounded) {
  const SS = 3;
  return encodePng(size, (x, y) => {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const c = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, rounded);
        r += c[0] * c[3];
        g += c[1] * c[3];
        b += c[2] * c[3];
        a += c[3];
      }
    }
    if (a === 0) return [0, 0, 0, 0];
    return [Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(a / (SS * SS))];
  });
}

const files = [
  ['pwa-192.png', 192, true],
  ['pwa-512.png', 512, true],
  ['pwa-maskable-512.png', 512, false],
  ['apple-touch-icon.png', 180, false],
];
for (const [name, size, rounded] of files) {
  fs.writeFileSync(path.join(outDir, name), render(size, rounded));
  console.log('wrote', name);
}
