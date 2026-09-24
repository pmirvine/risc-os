// Adds the BASIC Wimp bridge examples to the seed hard disc (assets/disc/HardDisc4/Examples):
//   Examples.!Doodle   a small BBC BASIC Wimp application (tokenised !RunImage, !Run, !Help, !Sprites)
//   Examples.Spiral    a single-tasking BASIC program (full screen, MODE 28)
//   Examples.ReadMe
// Sources: src/core/basicwimp/demo/. Idempotent; re-run after `node tools/disc.mjs` (which rebuilds
// assets/disc from vendor/ and would drop these).   Usage: node tools/basicwimp-demo.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { textToLines, buildProgram } from '../src/basic/tokens.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src/core/basicwimp/demo');
const DISC = path.join(ROOT, 'assets/disc');
const encodeName = (n) => n.replace(/[^A-Za-z0-9_-]/g, (c) => '=' + c.charCodeAt(0).toString(16).padStart(2, '0'));

const tokenise = (file) => buildProgram(textToLines(fs.readFileSync(path.join(SRC, file), 'latin1')).lines);
const text = (file) => Buffer.from(fs.readFileSync(path.join(SRC, file), 'latin1'), 'latin1');

// ---------------------------------------------------------------- a little !Sprites file
// 4bpp, mode 27 (square pixels), Wimp colours; drawn from character maps.
function sprite(name, rows) {
  const h = rows.length, w = rows[0].length;
  const words = Math.ceil(w * 4 / 32), rowBytes = words * 4;
  const img = Buffer.alloc(rowBytes * h), mask = Buffer.alloc(rowBytes * h);
  const col = { '.': -1, W: 0, K: 7, R: 11, Y: 9, G: 10, B: 15, D: 8, C: 12, O: 14, g: 2 };
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const c = col[ch] ?? -1;
    const o = y * rowBytes + (x >> 1), sh = (x & 1) * 4;
    if (c >= 0) { img[o] |= c << sh; mask[o] |= 0xF << sh; }
  }));
  const hdr = Buffer.alloc(44);
  const size = 44 + img.length * 2;
  hdr.writeUInt32LE(size, 0);
  Buffer.from(name.padEnd(12, '\0').slice(0, 12), 'latin1').copy(hdr, 4);
  hdr.writeUInt32LE(words - 1, 16); hdr.writeUInt32LE(h - 1, 20); hdr.writeUInt32LE(0, 24);
  hdr.writeUInt32LE((w * 4 - 1) % 32, 28); hdr.writeUInt32LE(44, 32); hdr.writeUInt32LE(44 + img.length, 36); hdr.writeUInt32LE(27, 40);
  return Buffer.concat([hdr, img, mask]);
}
function spriteFile(list) {
  const body = Buffer.concat(list);
  const h = Buffer.alloc(12);
  h.writeUInt32LE(list.length, 0); h.writeUInt32LE(16, 4); h.writeUInt32LE(16 + body.length, 8);
  return Buffer.concat([h, body]);
}
const big = [
  '..................................',
  '...KKKKKKKKKKKKKKKKKKKKKKKKKKK....',
  '...KWWWWWWWWWWWWWWWWWWWWWWWWWKK...',
  '...KWWWWWWWWWWWWWWWWWWWWWWWWWKWK..',
  '...KWWWWRRRRWWWWWWWWWWWWWWWWWKWWK.',
  '...KWWWRRRRRRWWWWWWWWWWWWWWWWKKKKK',
  '...KWWRRRRRRRRWWWWWWWWWWWWWWWWWWWK',
  '...KWWRRRRRRRRWWWWWWYYYYWWWWWWWWWK',
  '...KWWRRRRRRRRWWWWWYYYYYYWWWWWWWWK',
  '...KWWWRRRRRRWWWWWYYYYYYYYWWWWWWWK',
  '...KWWWWRRRRWWWWWWYYYYYYYYWWWWWWWK',
  '...KWWWWWWWWWWWWWWYYYYYYYYWWWWWWWK',
  '...KWWWWWWWWWWWWWWWYYYYYYWWWWWWWWK',
  '...KWWWWWWWWWWWWWWWWYYYYWWWWWWWWWK',
  '...KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK',
  '...KWWWWWWWBBBBWWWWWWWWWWWWWWWWWWK',
  '...KWWWWWWBBBBBBWWWWWWWWWWGGGGWWWK',
  '...KWWWWWBBBBBBBBWWWWWWWWGGGGGGWWK',
  '...KWWWWWBBBBBBBBWWWWWWWGGGGGGGGWK',
  '...KWWWWWBBBBBBBBWWWWWWWGGGGGGGGWK',
  '...KWWWWWWBBBBBBWWWWWWWWGGGGGGGGWK',
  '...KWWWWWWWBBBBWWWWWWWWWWGGGGGGWWK',
  '...KWWWWWWWWWWWWWWWWWWWWWWGGGGWWWK',
  '...KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK',
  '...KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK',
  '...KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK',
  '...KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK',
  '...KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK',
  '...KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK',
  '...KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK',
  '...KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK',
  '...KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK',
  '...KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
  '..................................',
];
const small = [
  '..................',
  '..KKKKKKKKKKKKK...',
  '..KWWWWWWWWWWWKK..',
  '..KWRRRWWWWWWWKWK.',
  '..KWRRRWWWWWWWKKKK',
  '..KWRRRWWYYYWWWWWK',
  '..KWWWWWWYYYWWWWWK',
  '..KWWWWWWYYYWWWWWK',
  '..KWWWWWWWWWWWWWWK',
  '..KWWBBBWWWWWGGGWK',
  '..KWWBBBWWWWWGGGWK',
  '..KWWBBBWWWWWGGGWK',
  '..KWWWWWWWWWWWWWWK',
  '..KWWWWWWWWWWWWWWK',
  '..KWWWWWWWWWWWWWWK',
  '..KWWWWWWWWWWWWWWK',
  '..KKKKKKKKKKKKKKKK',
  '..................',
];

// ---------------------------------------------------------------- write files + manifest
const OUT = path.join(DISC, 'HardDisc4', 'Examples');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, encodeName('!Doodle')), { recursive: true });
const nodes = [];
const put = (rel, type, data) => {
  const parts = rel.split('/');
  const host = path.join(OUT, ...parts.map(encodeName));
  fs.writeFileSync(host, data);
  return { name: parts[parts.length - 1], type, size: data.length, path: path.relative(DISC, host).split(path.sep).join('/') };
};
const doodle = [
  put('!Doodle/!Boot', 'feb', Buffer.from('| !Boot file for !Doodle\nIconSprites <Obey$Dir>.!Sprites\n', 'latin1')),
  put('!Doodle/!Help', 'fff', text('DoodleHelp.txt')),
  put('!Doodle/!Run', 'feb', Buffer.concat([Buffer.from('| !Run file for !Doodle (a BASIC Wimp example)\nSet Doodle$Dir <Obey$Dir>\nIconSprites <Doodle$Dir>.!Sprites\nWimpSlot -min 64K -max 64K\nRun <Doodle$Dir>.!RunImage %*0\n', 'latin1')])),
  put('!Doodle/!RunImage', 'ffb', Buffer.from(tokenise('Doodle.bas'))),
  put('!Doodle/!Sprites', 'ff9', spriteFile([sprite('!doodle', big), sprite('sm!doodle', small)])),
];
nodes.push({ name: '!Doodle', type: 'app', children: doodle });
nodes.push(put('ReadMe', 'fff', Buffer.from(
  'Examples for the BBC BASIC desktop bridge\n\n' +
  '!Doodle   a Wimp application written in BBC BASIC V: its !RunImage is an ordinary\n' +
  '          tokenised BASIC program using Wimp_Initialise, Wimp_Poll, redraw loops...\n' +
  'Spiral    a single-tasking BASIC program: double-click it and it takes over the\n' +
  '          screen in its own MODE; press SPACE at the end to return to the desktop.\n\n' +
  'To run the original !SciCalc (or another BASIC application) through the bridge\n' +
  'instead of the built-in version, copy its application directory somewhere else\n' +
  '(e.g. to the RAM disc) and double-click the copy.\n', 'latin1')));
nodes.push(put('Spiral', 'ffb', Buffer.from(tokenise('Spiral.bas'))));

const mfPath = path.join(DISC, 'manifest.json');
const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
mf.root.children = mf.root.children.filter((c) => c.name !== 'Examples');
mf.root.children.push({ name: 'Examples', type: 'dir', children: nodes });
mf.root.children.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
let files = 0, bytes = 0;
const count = (n) => { for (const c of n.children ?? []) { if (c.children) count(c); else if (!c.placeholder) { files++; bytes += c.size ?? 0; } } };
count(mf.root);
mf.files = files; mf.totalBytes = bytes;
fs.writeFileSync(mfPath, JSON.stringify(mf));
console.log(`Examples written (${nodes.length} entries); manifest now ${files} files`);
