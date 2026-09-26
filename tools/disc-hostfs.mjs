// Adds $.Utilities.!HostFS to the seed hard disc: the application that mounts folders from this computer (the
// program is src/apps/HostFS, the mounts themselves src/core/hostfs): !Boot, !Run, !Help, !Sprites (drawn here:
// a computer with a folder on its screen) and a placeholder !RunImage. Idempotent: replaces only Utilities.!HostFS.
//   Usage: node tools/disc-hostfs.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sprite, spriteFile } from './lib/spritewrite.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src/apps/HostFS');
const DISC = path.join(ROOT, 'assets/disc');
const encodeName = (n) => n.replace(/[^A-Za-z0-9_-]/g, (c) => '=' + c.charCodeAt(0).toString(16).padStart(2, '0'));
const latin1 = (s) => Buffer.from(s, 'latin1');

/** A computer (monitor on a stand) with a yellow folder on its blue screen, s pixels square. */
function computer(s) {
  const g = Array.from({ length: s }, () => Array(s).fill('.'));
  const box = (x0, y0, x1, y1, c, edge) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = edge && (x === x0 || x === x1 || y === y0 || y === y1) ? edge : c; };
  const k = s / 34, r = (v) => Math.round(v * k);
  box(r(2), r(3), s - 1 - r(2), r(24), 'l', 'K');          // the monitor
  box(r(5), r(6), s - 1 - r(5), r(21), 'L', 'K');          // its screen
  box(r(13), r(25), s - 1 - r(13), r(27), 'g', 'K');       // the neck
  box(r(7), r(28), s - 1 - r(7), r(31), 'l', 'K');         // the base
  // a folder on the screen
  box(r(10), r(10), r(16), r(12), 'Y', 'K');
  box(r(10), r(12), s - 1 - r(10), r(18), 'Y', 'K');
  box(r(11), r(13), s - 2 - r(10), r(13), 'O');
  return g.map((row) => row.join(''));
}

const files = [
  ['!Boot', 'feb', latin1('| !Boot file for !HostFS\nIconSprites <Obey$Dir>.!Sprites\n')],
  ['!Run', 'feb', latin1('| !Run file for !HostFS\nSet HostFS$Dir <Obey$Dir>\nIconSprites <HostFS$Dir>.!Sprites\nWimpSlot -min 64K -max 64K\nRun <HostFS$Dir>.!RunImage %*0\n')],
  ['!Help', 'fff', latin1(fs.readFileSync(path.join(SRC, 'Help.txt'), 'utf8'))],
  ['!Sprites', 'ff9', spriteFile([sprite('!hostfs', computer(34)), sprite('sm!hostfs', computer(18))])],
  ['!RunImage', 'ffd', latin1('')],                    // the program is JavaScript in src/apps/HostFS
];

const OUT = path.join(DISC, 'HardDisc4', 'Utilities', encodeName('!HostFS'));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const node = { name: '!HostFS', type: 'app', children: [] };
for (const [n, t, d] of files) {
  const host = path.join(OUT, encodeName(n));
  fs.writeFileSync(host, d);
  node.children.push({ name: n, type: t, size: d.length, path: path.relative(DISC, host).split(path.sep).join('/') });
}
node.children.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

const mfPath = path.join(DISC, 'manifest.json');
const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
const utils = mf.root.children.find((c) => c.name === 'Utilities');
utils.children = utils.children.filter((c) => c.name !== '!HostFS');
utils.children.push(node);
utils.children.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
let count = 0, bytes = 0;
const walk = (n) => { for (const c of n.children ?? []) { if (c.children) walk(c); else if (!c.placeholder) { count++; bytes += c.size ?? 0; } } };
walk(mf.root);
mf.files = count; mf.totalBytes = bytes;
fs.writeFileSync(mfPath, JSON.stringify(mf));
if (process.argv.includes('--show')) console.log(computer(34).join('\n'));
console.log(`$.Utilities.!HostFS written (${files.length} files); manifest now ${count} files`);
