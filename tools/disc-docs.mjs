// Adds $.Docs to the seed hard disc: help files about this desktop's own features (for example HostFS), read
// from tools/docs/ (each file becomes a Text file, &FFF, of the same name; double-click to read it in !Edit).
// Idempotent: replaces only $.Docs and leaves the rest of the manifest alone. Re-run after `node tools/disc.mjs`.
//   Usage: node tools/disc-docs.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'tools/docs');
const DISC = path.join(ROOT, 'assets/disc');
const encodeName = (n) => n.replace(/[^A-Za-z0-9_-]/g, (c) => '=' + c.charCodeAt(0).toString(16).padStart(2, '0'));

const OUT = path.join(DISC, 'HardDisc4', 'Docs');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const nodes = [];
for (const name of fs.readdirSync(SRC).filter((f) => !f.startsWith('.')).sort()) {
  const text = fs.readFileSync(path.join(SRC, name), 'utf8');
  if (/[^\n\x20-\x7e\xa0-\xff]/.test(text)) throw new Error(`${name}: only Latin-1 text (and no tabs) please`);
  const data = Buffer.from(text, 'latin1');
  const host = path.join(OUT, encodeName(name));
  fs.writeFileSync(host, data);
  nodes.push({ name, type: 'fff', size: data.length, path: path.relative(DISC, host).split(path.sep).join('/') });
}

// read-modify-write the manifest in one go
const mfPath = path.join(DISC, 'manifest.json');
const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
mf.root.children = mf.root.children.filter((c) => c.name !== 'Docs');
mf.root.children.push({ name: 'Docs', type: 'dir', children: nodes });
mf.root.children.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
let files = 0, bytes = 0;
const count = (n) => { for (const c of n.children ?? []) { if (c.children) count(c); else if (!c.placeholder) { files++; bytes += c.size ?? 0; } } };
count(mf.root);
mf.files = files; mf.totalBytes = bytes;
fs.writeFileSync(mfPath, JSON.stringify(mf));
console.log(`$.Docs written (${nodes.length} files); manifest now ${files} files`);
