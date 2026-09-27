// Adds $.Apps.!GraphTask to the seed hard disc: the application that runs BASIC programs in desktop windows (the
// program is src/apps/GraphTask, registered in src/apps/index.js; the windows src/core/basicwimp): !Boot, !Run,
// !Help, !Sprites (drawn here: a little desktop window with a BASIC picture in it - a teletext headline, a sun over
// hills, a > prompt) and a placeholder !RunImage. Idempotent: replaces only Apps.!GraphTask.
//   Usage: node tools/disc-graphtask.mjs [--show]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sprite, spriteFile } from './lib/spritewrite.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src/apps/GraphTask');
const DISC = path.join(ROOT, 'assets/disc');
const encodeName = (n) => n.replace(/[^A-Za-z0-9_-]/g, (c) => '=' + c.charCodeAt(0).toString(16).padStart(2, '0'));
const latin1 = (s) => Buffer.from(s, 'latin1');

/** A window (cream title bar, close and toggle icons) showing a BASIC screen, s pixels square (34 or 18). */
function graphWindow(s) {
  const g = Array.from({ length: s }, () => Array(s).fill('.'));
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < s && y < s) g[y][x] = c; };
  const box = (x0, y0, x1, y1, c, edge) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, edge && (x === x0 || x === x1 || y === y0 || y === y1) ? edge : c); };
  const big = s >= 30;
  const x0 = 1, x1 = s - 2, y0 = big ? 2 : 1, y1 = s - 2, tb = big ? 6 : 4;       // window, title bar height
  box(x0 + 1, y0 + 1, x1 + 1, y1 + 1, 'm');                                       // a shadow
  box(x0, y0, x1, y1, 'K', 'K');
  box(x0, y0, x1, y0 + tb, 'C', 'K');                                              // title bar (input focus: cream)
  if (big) {
    box(x0, y0, x0 + tb, y0 + tb, 'l', 'K');                                       // close icon
    box(x0 + 2, y0 + 2, x0 + tb - 2, y0 + tb - 2, 'K');
    box(x1 - tb, y0, x1, y0 + tb, 'l', 'K');                                       // toggle size icon
    box(x1 - tb + 2, y0 + 2, x1 - 1, y0 + tb - 2, 'K', 'K'); box(x1 - tb + 3, y0 + 3, x1 - 2, y0 + tb - 2, 'l');
    for (let x = x0 + tb + 3; x < x1 - tb - 3; x += 2) set(x, y0 + 3, 'm');         // the title, suggested
  }
  // the program's screen: black, a teletext headline in colour bands, a sun over green hills, a > prompt
  const sx0 = x0 + 1, sx1 = x1 - 1, sy0 = y0 + tb + 1, sy1 = y1 - 1;
  const W = sx1 - sx0 + 1, H = sy1 - sy0 + 1;
  const band = big ? 3 : 2;
  const cols = ['R', 'Y', 'G', 'L', 'O'];
  for (let x = sx0; x <= sx1; x++) {
    const c = cols[Math.floor((x - sx0) / (W / cols.length))];
    for (let y = sy0; y < sy0 + band; y++) set(x, y, c);
  }
  if (big) for (let x = sx0 + 2; x <= sx1 - 2; x += 3) { set(x, sy0 + 1, 'W'); set(x + 1, sy0 + 1, 'W'); }   // headline "text"
  const cx = sx0 + W * 0.7, cy = sy0 + band + H * (big ? 0.3 : 0.3), r = big ? 4.4 : 2.4;
  for (let y = sy0 + band; y <= sy1; y++) {
    for (let x = sx0; x <= sx1; x++) {
      const t = (x - sx0) / W;
      const hill1 = sy1 - H * (0.28 + 0.14 * Math.sin(t * 5.2 + 0.6));
      const hill2 = sy1 - H * (0.16 + 0.08 * Math.sin(t * 8.1 + 2.1));
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (y >= hill2) set(x, y, 'E');
      else if (y >= hill1) set(x, y, 'G');
      else if (d <= r) set(x, y, d <= r - (big ? 1.4 : 0.9) ? 'Y' : 'O');
      else set(x, y, (x * 7 + y * 13) % (big ? 37 : 23) === 0 ? 'W' : 'B');
    }
  }
  // "> _" at the bottom left, in white on the dark hill
  const py = sy1 - (big ? 2 : 1);
  if (big) {
    set(sx0 + 1, py - 2, 'W'); set(sx0 + 2, py - 1, 'W'); set(sx0 + 1, py, 'W');
    for (let x = sx0 + 4; x <= sx0 + 6; x++) set(x, py, 'W');
  } else { set(sx0 + 1, py, 'W'); set(sx0 + 2, py, 'W'); }
  return g.map((row) => row.join(''));
}

const files = [
  ['!Boot', 'feb', latin1('| !Boot file for !GraphTask\nIconSprites <Obey$Dir>.!Sprites\nSet GraphTask$Dir <Obey$Dir>\n')],
  ['!Run', 'feb', latin1('| !Run file for !GraphTask\nSet GraphTask$Dir <Obey$Dir>\nIconSprites <GraphTask$Dir>.!Sprites\nWimpSlot -min 64K -max 64K\nRun <GraphTask$Dir>.!RunImage %*0\n')],
  ['!Help', 'fff', latin1(fs.readFileSync(path.join(SRC, 'Help.txt'), 'utf8'))],
  ['!Sprites', 'ff9', spriteFile([sprite('!graphtask', graphWindow(34)), sprite('sm!graphtask', graphWindow(18))])],
  ['!RunImage', 'ffd', latin1('')],                    // the program is JavaScript in src/apps/GraphTask
];

const OUT = path.join(DISC, 'HardDisc4', 'Apps', encodeName('!GraphTask'));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const node = { name: '!GraphTask', type: 'app', children: [] };
for (const [n, t, d] of files) {
  const host = path.join(OUT, encodeName(n));
  fs.writeFileSync(host, d);
  node.children.push({ name: n, type: t, size: d.length, path: path.relative(DISC, host).split(path.sep).join('/') });
}
node.children.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

const mfPath = path.join(DISC, 'manifest.json');
const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
const apps = mf.root.children.find((c) => c.name === 'Apps');
apps.children = apps.children.filter((c) => c.name !== '!GraphTask');
apps.children.push(node);
apps.children.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
let count = 0, bytes = 0;
const walk = (n) => { for (const c of n.children ?? []) { if (c.children) walk(c); else if (!c.placeholder) { count++; bytes += c.size ?? 0; } } };
walk(mf.root);
mf.files = count; mf.totalBytes = bytes;
fs.writeFileSync(mfPath, JSON.stringify(mf));
if (process.argv.includes('--show')) console.log(graphWindow(34).join('\n') + '\n\n' + graphWindow(18).join('\n'));
console.log(`$.Apps.!GraphTask written (${files.length} files); manifest now ${count} files`);
