// Adds a sample, freely licensed Type 1 font to the seed hard disc for !T1ToFont to convert:
//   Utilities.Type1Fonts.cmr10/pfb   Computer Modern Roman 10 (AMS Type 1 version, PC binary format)
//   Utilities.Type1Fonts.cmr10/afm   its metrics
//   Utilities.Type1Fonts.OFL         the SIL Open Font License 1.1 it is under
//   Utilities.Type1Fonts.ReadMe      what to do with it
// Sources: tools/type1/ (see README.md there). Idempotent; touches only these entries. Re-run after
// `node tools/disc.mjs`.   Usage: node tools/disc-type1.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'tools/type1');
const DISC = path.join(ROOT, 'assets/disc');
const DIR = ['Utilities', 'Type1Fonts'];
const encodeName = (n) => n.replace(/[^A-Za-z0-9_-]/g, (c) => '=' + c.charCodeAt(0).toString(16).padStart(2, '0'));

const README = `Type 1 fonts
============

cmr10/pfb is Computer Modern Roman 10 point, a PostScript Type 1 font (PC
binary format), with its metrics in cmr10/afm. It is from the American
Mathematical Society's Type 1 versions of Donald Knuth's Computer Modern
fonts:

  Copyright (c) 1997, 2009 American Mathematical Society
  (http://www.ams.org), with Reserved Font Name CMR10.

It is licensed under the SIL Open Font License, version 1.1: see the file OFL.

To make a RISC OS outline font from it:

1. Run !T1ToFont (in the Utilities directory) and click on its icon on the
   icon bar to open the converter window.
2. Drag cmr10/pfb to the "Type 1 font file" box and cmr10/afm to the "AFM
   file" box. Choose where to save the font (Save in) and give it a name,
   such as CompModern.Medium.
3. Click on OK.

The new font then appears in the font menus of !Draw, !Edit, !Chars and
!Configure.

A converted font is a Modified Version under the Open Font License: if you
give a copy to anyone else, it must not be called CMR10.
`;

const FILES = [
  ['cmr10/pfb', 'ffd', fs.readFileSync(path.join(SRC, 'cmr10.pfb'))],
  ['cmr10/afm', 'fff', fs.readFileSync(path.join(SRC, 'cmr10.afm'))],
  ['OFL', 'fff', fs.readFileSync(path.join(SRC, 'OFL.txt'))],
  ['ReadMe', 'fff', Buffer.from(README, 'latin1')],
];

// read-modify-write the manifest in one go
const mfPath = path.join(DISC, 'manifest.json');
const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
let node = mf.root;
for (const p of DIR) {
  let c = node.children?.find((x) => x.name === p);
  if (!c) { c = { name: p, type: 'dir', children: [] }; (node.children ??= []).push(c); node.children.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })); }
  c.children ??= [];
  node = c;
}
for (const [leaf, type, data] of FILES) {
  const host = path.join(DISC, 'HardDisc4', ...DIR.map(encodeName), encodeName(leaf));
  fs.mkdirSync(path.dirname(host), { recursive: true });
  fs.writeFileSync(host, data);
  node.children = node.children.filter((c) => c.name !== leaf);
  node.children.push({ name: leaf, type, size: data.length, path: path.relative(DISC, host).split(path.sep).join('/') });
}
node.children.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
let files = 0, bytes = 0;
const count = (n) => { for (const c of n.children ?? []) { if (c.children) count(c); else if (!c.placeholder) { files++; bytes += c.size ?? 0; } } };
count(mf.root);
mf.files = files; mf.totalBytes = bytes;
fs.writeFileSync(mfPath, JSON.stringify(mf));
console.log(`Type 1 sample font: ${FILES.length} files in $.${DIR.join('.')}; manifest now ${files} files`);
