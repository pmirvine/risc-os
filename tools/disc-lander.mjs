// Adds $.Diversions.!Lander to the seed hard disc (assets/disc/HardDisc4): David Braben's 1987 Archimedes
// demo, run by the JS app in src/apps/Lander (the original binary on the emulated ARM2 when the user has it,
// the JavaScript port otherwise).
//
// Lander is (C) D. J. Braben 1987. Nothing of the original goes on the disc: !RunImage is an empty
// placeholder (the JS app stands in for it), !Run and !Help are written here, and the !Sprites icon is drawn
// here (an Acorn-style ship over a chequered landscape), written with Paint's sprite file writer
// (src/apps/Paint/spritefile.js).
//
// Idempotent: it rewrites only Diversions.!Lander and its manifest entry.
// Usage: node tools/disc-lander.mjs   (run by tools/build.mjs after basicwimp-demo.mjs)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { newSprite, writeSpriteFile } from '../src/apps/Paint/spritefile.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DISC = path.join(ROOT, 'assets/disc');
const PARENT = 'Diversions', NAME = '!Lander';
const encodeName = (n) => n.replace(/[^A-Za-z0-9_-]/g, (c) => '=' + c.charCodeAt(0).toString(16).padStart(2, '0'));
const latin1 = (s) => Buffer.from(s, 'latin1');

// ---------------------------------------------------------------- the icon
// Drawn on a w x h grid of Wimp colours (-1 = transparent) at 2x resolution, then reduced.
function drawIcon(w, h) {
  const g = Array.from({ length: h }, () => new Array(w).fill(-1));
  const tri = (pts, c) => {   // filled triangle, pts in grid units (fractions allowed)
    const [a, b, d] = pts;
    const minY = Math.floor(Math.min(a[1], b[1], d[1])), maxY = Math.ceil(Math.max(a[1], b[1], d[1]));
    for (let y = minY; y <= maxY; y++) for (let x = 0; x < w; x++) {
      const px = x + 0.5, py = y + 0.5;
      const s = (p, q) => (q[0] - p[0]) * (py - p[1]) - (q[1] - p[1]) * (px - p[0]);
      const s1 = s(a, b), s2 = s(b, d), s3 = s(d, a);
      if ((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)) if (y >= 0 && y < h) g[y][x] = c;
    }
  };
  const quad = (p, c) => { tri([p[0], p[1], p[2]], c); tri([p[0], p[2], p[3]], c); };
  const W = w / 34, H = h / 34;       // design units: a 34 x 34 icon
  const P = (x, y) => [x * W, y * H];
  // the landscape: rows of tiles in perspective, green and dark green, the launch pad grey
  const rows = [[17, 20], [20, 23.5], [23.5, 28], [28, 33]];
  rows.forEach(([y0, y1], r) => {
    const n = 6, t0 = (y0 - 17) / 16, t1 = (y1 - 17) / 16;
    const half0 = 13 + 4 * t0, half1 = 13 + 4 * t1;   // widening towards the front
    for (let i = 0; i < n; i++) {
      const xa0 = 17 - half0 + (2 * half0 * i) / n, xb0 = 17 - half0 + (2 * half0 * (i + 1)) / n;
      const xa1 = 17 - half1 + (2 * half1 * i) / n, xb1 = 17 - half1 + (2 * half1 * (i + 1)) / n;
      let c = (i + r) % 2 ? 13 : 10;
      if (r >= 2 && (i === 2 || i === 3)) c = (i + r) % 2 ? 3 : 2;   // the launch pad
      if (r === 0 && i === 5) c = 15;                                 // a little sea
      quad([P(xa0, y0), P(xb0, y0), P(xb1, y1), P(xa1, y1)], c);
    }
  });
  // the ship's shadow on the pad
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x + 0.5) / W - 17, dy = (y + 0.5) / H - 26;
    if ((dx * dx) / 20 + (dy * dy) / 1.6 <= 1) g[y][x] = 7;
  }
  // exhaust
  for (const [x, y, c] of [[16, 15.5, 14], [18, 16.5, 9], [15, 17.5, 9], [17, 18.5, 14], [19, 19.5, 11], [16, 21, 14], [18, 22.5, 9]]) {
    quad([P(x, y), P(x + 1.2, y), P(x + 1.2, y + 1.2), P(x, y + 1.2)], c);
  }
  // the ship: an arrowhead seen from above and behind, lit from the left
  const nose = [17, 1.5], left = [4, 11.5], right = [30, 11.5], tail = [17, 15], top = [17, 9.5];
  tri([P(...left), P(...nose), P(...top)], 0);        // upper left face (lit)
  tri([P(...right), P(...nose), P(...top)], 1);       // upper right face
  tri([P(...left), P(...top), P(...tail)], 3);        // under faces
  tri([P(...right), P(...top), P(...tail)], 5);
  // outline: black edges of the silhouette
  const edge = (a, b) => {
    const n = Math.ceil(Math.max(Math.abs(b[0] - a[0]) * W, Math.abs(b[1] - a[1]) * H) * 1.5) + 1;
    for (let i = 0; i <= n; i++) {
      const x = Math.floor((a[0] + (b[0] - a[0]) * i / n) * W), y = Math.floor((a[1] + (b[1] - a[1]) * i / n) * H);
      if (y >= 0 && y < h && x >= 0 && x < w) g[y][x] = 7;
    }
  };
  edge(nose, left); edge(nose, right); edge(left, tail); edge(right, tail);
  return g;
}
function sprite(name, mode, w, h) {
  const g = drawIcon(w, h);
  const s = newSprite({ name, w, h, mode, mask: true });
  g.forEach((row, y) => row.forEach((c, x) => { if (c < 0) s.mask[y * w + x] = 0; else s.px[y * w + x] = c; }));
  return s;
}
// mode 20 (square pixels) for !Sprites22, mode 12 (rectangular) for !Sprites; small icons for Filer small/full info
const sprites22 = writeSpriteFile({ sprites: [sprite('!lander', 20, 34, 34), sprite('sm!lander', 20, 18, 18)] });
const sprites12 = writeSpriteFile({ sprites: [sprite('!lander', 12, 34, 17), sprite('sm!lander', 12, 18, 9)] });

// ---------------------------------------------------------------- the application
const RUN = `| !Run file for !Lander
| Lander is (C) D.J.Braben 1987. This !Lander runs the original program when you have it:
| drop it (the !RunImage from the Archimedes application disc) onto the game, or
| *Run <Lander$Dir> <file>; it is then kept (in the browser's IndexedDB). Otherwise
| it plays a faithful JavaScript version. *Run <Lander$Dir> -port always plays that.
Set Lander$Dir <Obey$Dir>
IconSprites <Lander$Dir>.!Sprites
WimpSlot -min 168K -max 168K
Run <Lander$Dir>.!RunImage %*0
`;
const BOOT = 'Set Lander$Dir <Obey$Dir>\nIconSprites <Obey$Dir>.!Sprites\n';
const HELP = `Lander
======

Lander Demo/Practice (C) D.J.Braben 1987, the demonstration game that came
with the first Archimedes computers and grew into Zarch.

Fly the ship with the mouse: its distance and direction from the centre of
the screen tilt the ship. The buttons fire the engine:

  Select   full thrust
  Menu     hover (a gentle push)
  Adjust   fire

(In the browser: left, middle and right button. Click once to capture the
pointer.) Land gently on the launch pad to refuel. Shooting trees and
buildings scores points; each bullet costs one. Above 800 points rocks fall
from the sky. Escape ends the game.

The original program
--------------------
Lander is (C) D.J.Braben 1987 and is not included. If you have it - the
!RunImage (or the Arthur GameCode file) from the Archimedes application
disc - drop it onto the game (from your computer), or give it to !Lander
with *Run <Lander$Dir> <file>. It is kept in the browser and runs on the
emulated ARM2 at the speed of an A310. A local copy of Mark Moxon's
lander-source-code-acorn-archimedes repository in vendor/lander (served by
the development server) is used too.

Without it, !Lander plays a JavaScript version that follows Mark Moxon's
documented reconstruction of the source (https://lander.bbcelite.com) and
draws the same frames as the original from the same mouse movements.
*Run <Lander$Dir> -port always plays the JavaScript version.
`;
const files = [
  ['!Boot', 'feb', latin1(BOOT)],
  ['!Help', 'fff', latin1(HELP)],
  ['!Run', 'feb', latin1(RUN)],
  ['!RunImage', 'ff8', null],        // the original (C) D.J.Braben: never on the disc (the JS app runs instead)
  ['!Sprites', 'ff9', Buffer.from(sprites12)],
  ['!Sprites22', 'ff9', Buffer.from(sprites22)],
];

// ---------------------------------------------------------------- write files, then patch the manifest
const base = path.join(DISC, 'HardDisc4', PARENT, encodeName(NAME));
fs.rmSync(base, { recursive: true, force: true });
fs.mkdirSync(base, { recursive: true });
const node = { name: NAME, type: 'app', children: [] };
for (const [leaf, type, data] of files) {
  if (data == null) { node.children.push({ name: leaf, type, size: 0, placeholder: true }); continue; }
  const host = path.join(base, encodeName(leaf));
  fs.writeFileSync(host, data);
  node.children.push({ name: leaf, type, size: data.length, path: path.relative(DISC, host).split(path.sep).join('/') });
}
node.children.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

const mfPath = path.join(DISC, 'manifest.json');
const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
let parent = mf.root.children.find((c) => c.name === PARENT);
if (!parent) { parent = { name: PARENT, type: 'dir', children: [] }; mf.root.children.push(parent); }
parent.children = parent.children.filter((c) => c.name !== NAME);
parent.children.push(node);
parent.children.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
let count = 0, bytes = 0;
const walk = (n) => { for (const c of n.children ?? []) { if (c.children) walk(c); else if (!c.placeholder) { count++; bytes += c.size ?? 0; } } };
walk(mf.root);
mf.files = count; mf.totalBytes = bytes;
fs.writeFileSync(mfPath, JSON.stringify(mf));
console.log(`lander: ${PARENT}.${NAME}; manifest now ${count} files`);
