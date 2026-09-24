// Adds !Patch's patch data files (filetype &FC3 "Patch") to the seed hard disc. tools/disc.mjs skips
// ,fc3 files along with the ARM binaries, but these are plain text patch definitions that the
// JavaScript !Patch (src/apps/Patch) reads:
//   Utilities.Patches.!Patch.BootStrap                  (read at start-up: PatchesDir / TransformsFile)
//   Utilities.Patches.!Patch.Patches.Advance.Advance    (Advance 1.01 StrongARM fix)
//   Utilities.Patches.!Patch.Patches.PocketFS.PocketFS  (PocketFS 2.03 RISC OS 3.7 fix)
// Idempotent; touches only these entries. Re-run after `node tools/disc.mjs`.   Usage: node tools/disc-patch.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, 'vendor/ro371/Install/HardDisc4');
const DISC = path.join(ROOT, 'assets/disc');
const encodeName = (n) => n.replace(/[^A-Za-z0-9_-]/g, (c) => '=' + c.charCodeAt(0).toString(16).padStart(2, '0'));

const FILES = [
  'Utilities/Patches/!Patch/BootStrap',
  'Utilities/Patches/!Patch/Patches/Advance/Advance',
  'Utilities/Patches/!Patch/Patches/PocketFS/PocketFS',
];

// copy the data (read everything first so a missing vendor tree changes nothing)
const data = FILES.map((rel) => {
  const src = path.join(VENDOR, rel + ',fc3');
  if (!fs.existsSync(src)) throw new Error(`missing ${src}`);
  return fs.readFileSync(src);
});

// read-modify-write the manifest in one go
const mfPath = path.join(DISC, 'manifest.json');
const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
FILES.forEach((rel, k) => {
  const parts = rel.split('/');
  let node = mf.root;
  for (const p of parts.slice(0, -1)) {
    let c = node.children?.find((x) => x.name === p);
    if (!c) {
      c = { name: p, type: p.startsWith('!') ? 'app' : 'dir', children: [] };
      (node.children ??= []).push(c);
    }
    c.children ??= [];
    node = c;
  }
  const leaf = parts[parts.length - 1];
  const host = path.join(DISC, 'HardDisc4', ...parts.map(encodeName));
  fs.mkdirSync(path.dirname(host), { recursive: true });
  fs.writeFileSync(host, data[k]);
  const entry = { name: leaf, type: 'fc3', size: data[k].length, path: path.relative(DISC, host).split(path.sep).join('/') };
  node.children = node.children.filter((c) => c.name !== leaf);
  node.children.push(entry);
  node.children.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
});
let files = 0, bytes = 0;
const count = (n) => { for (const c of n.children ?? []) { if (c.children) count(c); else if (!c.placeholder) { files++; bytes += c.size ?? 0; } } };
count(mf.root);
mf.files = files; mf.totalBytes = bytes;
fs.writeFileSync(mfPath, JSON.stringify(mf));
console.log(`!Patch data: ${FILES.length} patch files; manifest now ${files} files`);
