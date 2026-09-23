#!/usr/bin/env node
// assets/palette.json (Wimp 16 colours + default 256) and assets/filetypes.json (hex → name).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, V } from './lib/sources.mjs';
import { WIMP16, WIMP_NAMES, VIDC256, WIMP_EXTRA_WORDS, word2rgb, hex } from './lib/palette.mjs';

const pal = {
  source: 'Sources/OS_Core/Desktop/Wimp/s/!Palette (Wimp), Kernel/s/vdu/vdupal20 (256-colour default)',
  wimp: WIMP16.map((c, i) => ({ index: i, hex: hex(c), rgb: c, name: WIMP_NAMES[i] })),
  wimpHex: WIMP16.map(hex),
  border: hex(word2rgb(WIMP_EXTRA_WORDS.border)),
  pointer: [1, 2, 3].map((k) => hex(word2rgb(WIMP_EXTRA_WORDS['pointer' + k]))),
  vidc256: VIDC256.map(hex),
};
fs.writeFileSync(path.join(ROOT, 'assets/palette.json'), JSON.stringify(pal, null, 1));

const src = fs.readFileSync(path.join(V, 'Sources/HdrSrc/Derived/FileTypes'), 'latin1');
const nums = {}, names = {};
for (const m of src.matchAll(/^FileType_(\w+?)\s+EQU\s+&([0-9A-Fa-f]+)/gm)) nums[m[1]] = parseInt(m[2], 16);
for (const m of src.matchAll(/^FileType_(\w+?)_Name\s+SETS\s+"([^"]*)"/gm)) names[m[1]] = m[2];
const ft = {};
for (const [k, n] of Object.entries(nums)) {
  const h = n.toString(16).padStart(3, '0');
  if (n > 0xfff || ft[h]) continue;
  ft[h] = names[k] || k;
}
// A few common types not in Hdr:FileTypes of this era.
for (const [h, n] of Object.entries({ c85: 'JPEG', '695': 'GIF', b60: 'PNG', ff0: 'TIFF', fb1: 'WAVE', ff7: 'BBC font', ff5: 'PoScript', fea: 'Desktop', fe4: 'DOS', fc8: 'DOSDisc', fd6: 'TaskExec', fd7: 'TaskObey' })) ft[h] ||= n;
const sorted = Object.fromEntries(Object.entries(ft).sort(([a], [b]) => b.localeCompare(a)));
fs.writeFileSync(path.join(ROOT, 'assets/filetypes.json'), JSON.stringify(sorted, null, 1));
console.log('palette.json, filetypes.json:', Object.keys(sorted).length, 'types');
