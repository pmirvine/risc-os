// Adds three classic Acorn applications that shipped before RISC OS 3.5 (or, for Hopper, after it) to the
// seed hard disc (assets/disc/HardDisc4):
//
//   $.Apps.!Calc          the Arthur / RISC OS 2 / 3.0-3.1 desktop calculator (JS app: src/apps/Calc)
//   $.Diversions.!Madness the window-drifting desktop toy (JS app: src/apps/Madness)
//   $.Diversions.!Hopper  Simon Foster's Frogger-style game (JS app: src/apps/Hopper)
//
// Original resources come from tools/classics/ (see the LICENSE files there): !Madness from RISC OS Open's
// Apps/Diversions/Madness (Apache 2.0), !Hopper from Apps/Diversions/Hopper (BSD 3-clause). !Calc's sprites
// are the RISC OS 3 ROM's !calc / sm!calc pixel for pixel (they are still in the 3.71 Wimp sprite pool).
// Sprite files are written with Paint's sprite file writer (src/apps/Paint/spritefile.js). !Hopper is installed
// as its Makefile installs it (Resources + DataFiles: Graphics, Levels, Music, Sounds), with the build's _Version
// appended to Messages; its !RunImage (C) is recreated in JavaScript. QTMTracker and PsychoEffect, which !Run
// RMEnsures, are third-party modules that are not part of the source release; src/apps/Hopper stands in for them.
//
// Idempotent: it rewrites only these three application directories and their manifest entries.
// Usage: node tools/disc-classics.mjs   (run by tools/build.mjs after basicwimp-demo.mjs)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { newSprite, writeSpriteFile, readSpriteFile } from '../src/apps/Paint/spritefile.js';
import { textToLines, buildProgram } from '../src/basic/tokens.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'tools/classics');
const DISC = path.join(ROOT, 'assets/disc');
const encodeName = (n) => n.replace(/[^A-Za-z0-9_-]/g, (c) => '=' + c.charCodeAt(0).toString(16).padStart(2, '0'));
const latin1 = (s) => Buffer.from(s, 'latin1');
const src = (...p) => fs.readFileSync(path.join(SRC, ...p));

// ---------------------------------------------------------------- sprites from pixel maps
// rows: one character per pixel, a hex digit = Wimp colour (4bpp) or '.' = transparent (masked)
function mapSprite(name, mode, rows) {
  const h = rows.length, w = rows[0].length;
  const s = newSprite({ name, w, h, mode, mask: true });
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === '.') s.mask[y * w + x] = 0;
    else s.px[y * w + x] = parseInt(ch, 16);
  }));
  return s;
}

// The RISC OS 3 ROM's calculator icons (Wimp Sprites22 and Sprites, as still found in the 3.71 ROM)
const CALC22 = [
  '.5555555555555555555555555555.', '555555555555555555555555555555', '555CCCCCCCCCCCCCCCCC5555555555',
  '55CC7C7CCC777C777C7CC555555555', '55CC7C7C7CCC7C7C7C7CC555BBB555', '55CC7C777CCC7C7C7C7CC55BBBBB55',
  '55CC7CCC7CCC7C777C7CC55BBBBB55', '555CCCCCCCCCCCCCCCCC5555BBB555', '555555555555555555555555555555',
  '555555555555555555555555555555', '555222555522255552225555CCC555', '55224225522422552242255CC4CC55',
  '55224225522422552242255CC4CC55', '555222555522255552225555CCC555', '555555555555555555555555555555',
  '555555555555555555555555555555', '555222555522255552225555CCC555', '55224225522422552242255CC4CC55',
  '55224225522422552242255CC4CC55', '555222555522255552225555CCC555', '555555555555555555555555555555',
  '555555555555555555555555555555', '555222555522255552225555CCC555', '55224225522422552242255CC4CC55',
  '55224225522422552242255CC4CC55', '555222555522255552225555CCC555', '555555555555555555555555555555',
  '555555555555555555555555555555', '55522255551115555CCC5555CCC555', '5522422551141155CC4CC55CC4CC55',
  '5522422551141155CC4CC55CC4CC55', '55522255551115555CCC5555CCC555', '555555555555555555555555555555',
  '.5555555555555555555555555555.',
];
const SMCALC22 = [
  '.555555555555555.', '5CCCCCCCCCCC55555', '5C7C7CC77C7C5BBB5', '5C7C77CC7C7C5BBB5', '55555555555555555',
  '5222522252225CCC5', '5222522252225CCC5', '55555555555555555', '5222522252225CCC5', '5222522252225CCC5',
  '55555555555555555', '5222522252225CCC5', '5222522252225CCC5', '55555555555555555', '522251115CCC5CCC5',
  '522251115CCC5CCC5', '55555555555555555', '.555555555555555.',
];
const CALC12 = [
  '.6666666666666666666666666666.', '66CCCCCCCCCCCCCCCCCCC666666666', '66C7C7C77C77C7C77C7CC66BBBBB66',
  '66C7C7CC7CC7C7CC7C7CC66BBBBB66', '666666666666666666666666666666', '66222226622222662222266CCCCC66',
  '66222226622222662222266CCCCC66', '666666666666666666666666666666', '66222226622222662222266CCCCC66',
  '66222226622222662222266CCCCC66', '666666666666666666666666666666', '66222226622222662222266CCCCC66',
  '66222226622222662222266CCCCC66', '666666666666666666666666666666', '6622222661111166CCCCC66CCCCC66',
  '6622222661111166CCCCC66CCCCC66', '.6666666666666666666666666666.',
];
const SMCALC12 = [
  '.6666666666666.', '6CCCCCCCC66BB66', '666666666666666', '62262262266CC66', '666666666666666',
  '62262262266CC66', '666666666666666', '62262262266CC66', '.6666666666666.',
];

// ---------------------------------------------------------------- tokenised BASIC
const tokenise = (text) => Buffer.from(buildProgram(textToLines(text).lines));

// ---------------------------------------------------------------- the three directories
const madnessRunImage = src('Madness', '!RunImage').toString('latin1');
const apps = [
  {
    parent: 'Apps', name: '!Calc',
    files: [
      ['!Boot', 'feb', latin1('| !Boot file for !Calc\nIconSprites <Obey$Dir>.!Sprites\n')],
      ['!Help', 'fff', latin1(fs.readFileSync(path.join(ROOT, 'src/apps/Calc/Help.txt'), 'utf8'))],
      ['!Run', 'feb', latin1('| version 0.40\nSet Calculator$Dir <Obey$Dir>\nIconSprites <Calculator$Dir>.!Sprites\nWimpslot -min 32K -max 32K\nRun <Calculator$Dir>.!RunImage\n')],
      ['!RunImage', 'ffb', null],          // the BASIC program is recreated in JavaScript (src/apps/Calc)
      ['!Sprites', 'ff9', Buffer.from(writeSpriteFile({ sprites: [mapSprite('!calc', 12, CALC12), mapSprite('sm!calc', 12, SMCALC12)] }))],
      ['!Sprites22', 'ff9', Buffer.from(writeSpriteFile({ sprites: [mapSprite('!calc', 20, CALC22), mapSprite('sm!calc', 20, SMCALC22)] }))],
    ],
  },
  {
    parent: 'Diversions', name: '!Madness',
    files: [
      ['!Help', 'fff', src('Madness', '!Help')],
      ['!Run', 'feb', src('Madness', '!Run,feb')],
      ['!RunImage', 'ffb', tokenise(madnessRunImage)],
      ['!Sprites', 'ff9', Buffer.from(writeSpriteFile(readSpriteFile(src('Madness', '!Sprites,ff9'))))],
      ['!Sprites22', 'ff9', Buffer.from(writeSpriteFile(readSpriteFile(src('Madness', '!Sprites22,ff9'))))],
      ['LICENSE', 'fff', src('Madness', 'LICENSE')],
      ['Messages', 'fff', src('Madness', 'Messages')],
    ],
  },
  {
    parent: 'Diversions', name: '!Hopper',
    files: [
      ['!Help', 'fff', src('Hopper', '!Help')],
      ['!Run', 'feb', src('Hopper', '!Run,feb')],
      ['!RunImage', 'ff8', null],          // C program: recreated in JavaScript (src/apps/Hopper)
      ['!Sprites', 'ff9', src('Hopper', '!Sprites,ff9')],
      ['!Sprites11', 'ff9', src('Hopper', '!Sprites11,ff9')],
      ['!Sprites22', 'ff9', src('Hopper', '!Sprites22,ff9')],
      ['Keys', 'fff', src('Hopper', 'Keys')],
      ['LICENSE', 'fff', src('Hopper', 'LICENSE')],
      ['Messages', 'fff', Buffer.concat([src('Hopper', 'Messages'), latin1('_Version:1.05 (23 Dec 2014)\n')])],
      ['Templates', 'fec', src('Hopper', 'Templates,fec')],
      ...['Fly', 'Frog', 'Letters', 'Numbers', 'Scenery', 'Snake', 'Title', 'Vehicles', 'Water']
        .map((g) => [`Graphics/${g}`, 'ffd', src('Hopper', 'Graphics', g + ',ffd')]),
      ['Levels/Cars', 'ffd', src('Hopper', 'Levels', 'Cars,ffd')],
      ['Levels/Water', 'ffd', src('Hopper', 'Levels', 'Water,ffd')],
      ...['HiScore', 'InGame', 'Intro'].map((m) => [`Music/${m}`, 'cb6', src('Hopper', 'Music', m + ',cb6')]),
      ...['Alarm', 'Bank', 'Burp', 'Clear', 'Eaten', 'Frog', 'Jump', 'Splash', 'Splat']
        .map((s) => [`Sounds/${s}`, 'ffd', src('Hopper', 'Sounds', s.toLowerCase() + ',ffd')]),
    ],
  },
];

// ---------------------------------------------------------------- write files, then patch the manifest
const nodesFor = (app) => {
  const base = path.join(DISC, 'HardDisc4', app.parent, encodeName(app.name));
  fs.rmSync(base, { recursive: true, force: true });
  const root = { name: app.name, type: 'app', children: [] };
  for (const [rel, type, data] of app.files) {
    const parts = rel.split('/');
    let dirNode = root, hostDir = base;
    for (const d of parts.slice(0, -1)) {
      hostDir = path.join(hostDir, encodeName(d));
      let n = dirNode.children.find((c) => c.name === d);
      if (!n) { n = { name: d, type: 'dir', children: [] }; dirNode.children.push(n); }
      dirNode = n;
    }
    const leaf = parts[parts.length - 1];
    if (data == null) { dirNode.children.push({ name: leaf, type, size: 0, placeholder: true }); continue; }
    fs.mkdirSync(hostDir, { recursive: true });
    const host = path.join(hostDir, encodeName(leaf));
    fs.writeFileSync(host, data);
    dirNode.children.push({ name: leaf, type, size: data.length, path: path.relative(DISC, host).split(path.sep).join('/') });
  }
  const sort = (n) => { n.children?.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })); n.children?.forEach(sort); };
  sort(root);
  return root;
};
const built = apps.map((a) => ({ app: a, node: nodesFor(a) }));

const mfPath = path.join(DISC, 'manifest.json');
const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
for (const { app, node } of built) {
  let parent = mf.root.children.find((c) => c.name === app.parent);
  if (!parent) { parent = { name: app.parent, type: 'dir', children: [] }; mf.root.children.push(parent); }
  parent.children = parent.children.filter((c) => c.name !== app.name);
  parent.children.push(node);
  parent.children.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}
let files = 0, bytes = 0;
const count = (n) => { for (const c of n.children ?? []) { if (c.children) count(c); else if (!c.placeholder) { files++; bytes += c.size ?? 0; } } };
count(mf.root);
mf.files = files; mf.totalBytes = bytes;
fs.writeFileSync(mfPath, JSON.stringify(mf));
console.log(`classics: ${built.map((b) => `${b.app.parent}.${b.app.name}`).join(', ')}; manifest now ${files} files`);
