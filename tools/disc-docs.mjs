// Adds $.Docs to the seed hard disc: help files about this desktop's own features (for example HostFS), read
// from tools/docs/ (each file becomes a Text file, &FFF, of the same name; double-click to read it in !Edit).
// Idempotent: replaces only $.Docs and leaves the rest of the manifest alone. Re-run after `node tools/disc.mjs`.
//   Usage: node tools/disc-docs.mjs [--check]
// --check builds the same output in memory, writes nothing, and exits 1 naming each file under the disc root that
// differs (HardDisc4/Docs/<name>, manifest.json), 0 when the disc is up to date.
// DOCS_SRC / DOCS_DISC change the guides' directory / the disc root (for tests/moreapps/disc-docs.test.mjs).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.resolve(process.env.DOCS_SRC ?? path.join(ROOT, 'tools/docs'));
const DISC = path.resolve(process.env.DOCS_DISC ?? path.join(ROOT, 'assets/disc'));
const OUT = path.join(DISC, 'HardDisc4', 'Docs');
const encodeName = (n) => n.replace(/[^A-Za-z0-9_-]/g, (c) => '=' + c.charCodeAt(0).toString(16).padStart(2, '0'));
const rel = (p) => path.relative(DISC, p).split(path.sep).join('/');

// the files of $.Docs ({host path -> bytes}) and the new manifest text, built without touching the disc
function build() {
  const files = new Map();
  const nodes = [];
  for (const name of fs.readdirSync(SRC).filter((f) => !f.startsWith('.')).sort()) {
    const text = fs.readFileSync(path.join(SRC, name), 'utf8');
    if (/[^\n\x20-\x7e\xa0-\xff]/.test(text)) throw new Error(`${name}: only Latin-1 text (and no tabs) please`);
    const data = Buffer.from(text, 'latin1');
    const host = path.join(OUT, encodeName(name));
    files.set(host, data);
    nodes.push({ name, type: 'fff', size: data.length, path: rel(host) });
  }
  const mfPath = path.join(DISC, 'manifest.json');
  const old = fs.readFileSync(mfPath, 'utf8');
  const mf = JSON.parse(old);
  mf.root.children = mf.root.children.filter((c) => c.name !== 'Docs');
  mf.root.children.push({ name: 'Docs', type: 'dir', children: nodes });
  mf.root.children.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  let count = 0, bytes = 0;
  const walk = (n) => { for (const c of n.children ?? []) { if (c.children) walk(c); else if (!c.placeholder) { count++; bytes += c.size ?? 0; } } };
  walk(mf.root);
  mf.files = count; mf.totalBytes = bytes;
  return { files, nodes, mfPath, old, manifest: JSON.stringify(mf), count };
}

const out = build();
if (process.argv.includes('--check')) {
  const differ = [];
  const onDisc = fs.existsSync(OUT) ? fs.readdirSync(OUT).map((f) => path.join(OUT, f)) : [];
  for (const [host, data] of out.files) {
    if (!fs.existsSync(host) || !fs.readFileSync(host).equals(data)) differ.push(rel(host));
  }
  for (const host of onDisc) if (!out.files.has(host)) differ.push(rel(host));
  if (out.manifest !== out.old) differ.push('manifest.json');
  if (differ.length) {
    console.error(`$.Docs is out of date (run node tools/disc-docs.mjs):\n  ${differ.sort().join('\n  ')}`);
    process.exit(1);
  }
  console.log(`$.Docs up to date (${out.nodes.length} files)`);
} else {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const [host, data] of out.files) fs.writeFileSync(host, data);
  fs.writeFileSync(out.mfPath, out.manifest);
  console.log(`$.Docs written (${out.nodes.length} files); manifest now ${out.count} files`);
}
