// Adds $.Apps.!Browse to the seed hard disc: the application directory of the web browser (the program itself is
// src/apps/Browse, registered in src/apps/index.js): !Boot, !Run, !Help, !Sprites (the globe, and URI / URL file
// icons, drawn here) and a placeholder !RunImage. Idempotent: replaces only Apps.!Browse.
//   Usage: node tools/disc-browse.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sprite, spriteFile } from './lib/spritewrite.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src/apps/Browse');
const DISC = path.join(ROOT, 'assets/disc');
const encodeName = (n) => n.replace(/[^A-Za-z0-9_-]/g, (c) => '=' + c.charCodeAt(0).toString(16).padStart(2, '0'));
const latin1 = (s) => Buffer.from(s, 'latin1');

// ------------------------------------------------------------------ sprites
const blank = (w, h) => Array.from({ length: h }, () => Array(w).fill('.'));
const rows = (g) => g.map((r) => r.join(''));

/** A globe of radius r centred at (cx, cy): sea, land, lines of latitude and longitude, a shine. */
function globe(g, cx, cy, r, { lines = true } = {}) {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const nx = (x + 0.5 - cx) / r, ny = (y + 0.5 - cy) / r, d = nx * nx + ny * ny;
      if (y < 0 || x < 0 || y >= g.length || x >= g[0].length) continue;
      if (d > 1.18) continue;
      if (d > 1) { g[y][x] = 'K'; continue; }
      const nz = Math.sqrt(1 - d);
      const lat = Math.asin(-ny), lon = Math.atan2(nx, nz) + 0.6;
      const land = Math.sin(2.1 * lon + 0.4) * Math.cos(1.6 * lat) + 0.55 * Math.sin(4.3 * lon) * Math.sin(3.1 * lat + 0.5) > 0.35;
      let c = land ? 'G' : 'L';
      const dark = nx * 0.6 + ny * 0.8 > 0.45;
      if (dark) c = land ? 'E' : 'B';
      if (lines && r >= 10) {
        const m = ((lon % (Math.PI / 4)) + Math.PI / 4) % (Math.PI / 4), p = ((lat % (Math.PI / 6)) + Math.PI / 6) % (Math.PI / 6);
        if (Math.min(m, Math.PI / 4 - m) * r * nz < 0.45 || Math.min(p, Math.PI / 6 - p) * r < 0.5) c = dark ? 'K' : 'B';
      }
      if (nx < -0.2 && ny < -0.2 && (nx + 0.5) ** 2 + (ny + 0.5) ** 2 < 0.03) c = 'W';
      g[y][x] = c;
    }
  }
}

/** A file icon: a page with a turned corner, and a globe on it; corner colour marks URL files. */
function page(w, h, gr, corner) {
  const g = blank(w, h);
  const x0 = Math.round(w * 0.18), x1 = w - 1 - Math.round(w * 0.18), y0 = 1, y1 = h - 2, f = Math.round(w / 5);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (x > x1 - f + (y - y0) && y < y0 + f) continue;          // the turned-down corner
    g[y][x] = x === x0 || x === x1 || y === y0 || y === y1 ? 'K' : 'W';
  }
  for (let i = 0; i <= f; i++) { g[y0 + i][x1 - f + i] = 'K'; g[y0 + f][x1 - f + i] = 'K'; g[y0 + i][x1 - f] = 'K'; }
  for (let y = y0 + 1; y < y0 + f; y++) for (let x = x1 - f + 1; x < x1 - f + (y - y0); x++) g[y][x] = corner;
  globe(g, (x0 + x1 + 1) / 2, (y0 + y1) / 2 + h * 0.08, gr, { lines: gr >= 10 });
  return rows(g);
}

const app = blank(34, 34);
globe(app, 17, 17, 15);
const small = blank(18, 18);
globe(small, 9, 9, 8, { lines: false });
const sprites = [
  sprite('!browse', rows(app)), sprite('sm!browse', rows(small)),
  sprite('file_f91', page(34, 34, 10, 'l')), sprite('small_f91', page(18, 18, 4, 'l')),
  sprite('file_b28', page(34, 34, 10, 'O')), sprite('small_b28', page(18, 18, 4, 'O')),
];

const files = [
  ['!Boot', 'feb', latin1('| !Boot file for !Browse: its icons, URI and URL files, and web addresses from other programs\nIconSprites <Obey$Dir>.!Sprites\nSet File$Type_F91 URI\nSet File$Type_B28 URL\nIf "<Alias$URLOpen_http>" = "" Then Set Alias$URLOpen_http Run <Obey$Dir>.!Run -url %%*0\nIf "<Alias$URLOpen_https>" = "" Then Set Alias$URLOpen_https Run <Obey$Dir>.!Run -url %%*0\n')],
  ['!Run', 'feb', latin1('| !Run file for !Browse\nSet Browse$Dir <Obey$Dir>\nIconSprites <Browse$Dir>.!Sprites\nSet Alias$@RunType_F91 Run <Browse$Dir>.!Run %%*0\nSet Alias$@RunType_B28 Run <Browse$Dir>.!Run %%*0\nWimpSlot -min 512K -max 512K\nRun <Browse$Dir>.!RunImage %*0\n')],
  ['!Help', 'fff', latin1(fs.readFileSync(path.join(SRC, 'Help.txt'), 'utf8'))],
  ['!Sprites', 'ff9', spriteFile(sprites)],
  ['!RunImage', 'ffd', latin1('')],                    // the program is JavaScript in src/apps/Browse
];

const OUT = path.join(DISC, 'HardDisc4', 'Apps', encodeName('!Browse'));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const node = { name: '!Browse', type: 'app', children: [] };
for (const [n, t, d] of files) {
  const host = path.join(OUT, encodeName(n));
  fs.writeFileSync(host, d);
  node.children.push({ name: n, type: t, size: d.length, path: path.relative(DISC, host).split(path.sep).join('/') });
}
node.children.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

const mfPath = path.join(DISC, 'manifest.json');
const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
const apps = mf.root.children.find((c) => c.name === 'Apps');
apps.children = apps.children.filter((c) => c.name !== '!Browse');
apps.children.push(node);
apps.children.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
let count = 0, bytes = 0;
const walk = (n) => { for (const c of n.children ?? []) { if (c.children) walk(c); else if (!c.placeholder) { count++; bytes += c.size ?? 0; } } };
walk(mf.root);
mf.files = count; mf.totalBytes = bytes;
fs.writeFileSync(mfPath, JSON.stringify(mf));
if (process.argv.includes('--show')) for (const [n, r] of [['!browse', rows(app)], ['file_f91', page(34, 34, 10, 'l')], ['small_f91', page(18, 18, 4, 'l')]]) console.log(n + '\n' + r.join('\n'));
console.log(`$.Apps.!Browse written (${files.length} files); manifest now ${count} files`);
