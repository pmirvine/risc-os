#!/usr/bin/env node
// Extract the RISC OS 8x8 system font (Kernel/s/vdu/vdufontl1, the Latin-1 font used by 3.71)
// → assets/fonts/system8x8.json (256 × 8 bytes; row 0 = top, bit 7 = leftmost pixel; chars 0-31 empty)
// → assets/fonts/system8x8.png (16×16 grid of 8×8 cells, char n at (n%16*8, (n>>4)*8), white glyphs on transparent)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, V } from './lib/sources.mjs';
import { encodePNG } from './lib/png.mjs';

const src = fs.readFileSync(path.join(V, 'Sources/OS_Core/Kernel/s/vdu/vdufontl1'), 'latin1');
const bytes = [];
for (const line of src.split('\n')) {
  const m = line.match(/^\s*=\s*([^;]*)/);
  if (!m) continue;
  for (const v of m[1].split(',')) { const t = v.trim(); if (t) bytes.push(parseInt(t.replace('&', ''), 16)); }
}
if (bytes.length !== 224 * 8) throw new Error('unexpected font size ' + bytes.length);
const chars = [];
for (let c = 0; c < 256; c++) chars.push(c < 32 ? [0, 0, 0, 0, 0, 0, 0, 0] : bytes.slice((c - 32) * 8, (c - 31) * 8));
const OUT = path.join(ROOT, 'assets/fonts');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'system8x8.json'), JSON.stringify({
  source: 'Sources/OS_Core/Kernel/s/vdu/vdufontl1', width: 8, height: 8,
  note: 'chars[n][row], row 0 = top, bit 7 = leftmost pixel. Chars 0-31 are VDU control codes (empty).',
  chars,
}));
const rgba = new Uint8Array(128 * 128 * 4);
for (let c = 0; c < 256; c++) for (let r = 0; r < 8; r++) for (let b = 0; b < 8; b++) {
  if (chars[c][r] & (0x80 >> b)) {
    const o = (((c >> 4) * 8 + r) * 128 + (c & 15) * 8 + b) * 4;
    rgba[o] = rgba[o + 1] = rgba[o + 2] = rgba[o + 3] = 255;
  }
}
fs.writeFileSync(path.join(OUT, 'system8x8.png'), encodePNG(128, 128, rgba));
console.log('system font written');
