// Adds $.Diversions.!Lander2 to the seed hard disc (assets/disc/HardDisc4): Lander II, an enhanced,
// Zarch-like game grown from David Braben's 1987 Lander demo, written in JavaScript. Unlike !Lander (a
// built-in app in src/apps/Lander) the whole game is on the disc as JSScript modules, so users can read
// and change it: the sources are tools/lander2/!Lander2 (no extension = JSScript &F81, !Run / !Boot =
// Obey, !Help = Text), the icon is drawn by tools/lander2/icon.mjs. See docs/apps/Lander2.md.
//
// Idempotent: it rewrites only Diversions.!Lander2 and its manifest entry.
// Usage: node tools/disc-lander2.mjs   (run by tools/build.mjs)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { iconFiles } from './lander2/icon.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'tools/lander2/!Lander2');
const DISC = path.join(ROOT, 'assets/disc');
const PARENT = 'Diversions', NAME = '!Lander2';
const encodeName = (n) => n.replace(/[^A-Za-z0-9_-]/g, (c) => '=' + c.charCodeAt(0).toString(16).padStart(2, '0'));

// ---------------------------------------------------------------- collect the files
const problems = [];
const collect = (dir, rel) => {
  const out = [];
  for (const name of fs.readdirSync(dir).filter((f) => !f.startsWith('.')).sort()) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) { out.push({ name, dir: true, children: collect(full, `${rel}/${name}`) }); continue; }
    const text = fs.readFileSync(full, 'utf8');
    if (/[^\n\x20-\x7e\xa0-\xff]/.test(text)) problems.push(`${rel}/${name}: only Latin-1 text (no tabs, no CR) please`);
    const suffix = /^(.+),([0-9a-f]{3})$/i.exec(name);
    const leaf = suffix ? suffix[1] : name;
    const type = suffix ? suffix[2].toLowerCase() : /^!(Run|Boot)$/.test(name) ? 'feb' : /^(!Help|ReadMe)$/.test(name) ? 'fff' : 'f81';
    out.push({ name: leaf, type, data: Buffer.from(text, 'latin1') });
  }
  return out;
};
const files = collect(SRC, '!Lander2');
for (const [leaf, data] of Object.entries(iconFiles())) files.push({ name: leaf, type: 'ff9', data });
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

// ---------------------------------------------------------------- write files, then patch the manifest
// several people (or agents) may run this at once while developing: take a simple lock for the manifest
const LOCK = path.join(DISC, '.lander2-lock');
for (let i = 0; ; i++) {
  try { fs.mkdirSync(LOCK); break; } catch { if (i > 200) { fs.rmSync(LOCK, { recursive: true, force: true }); } Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); }
}
process.on('exit', () => fs.rmSync(LOCK, { recursive: true, force: true }));
const base = path.join(DISC, 'HardDisc4', PARENT, encodeName(NAME));
fs.rmSync(base, { recursive: true, force: true });
const write = (dir, list) => {
  fs.mkdirSync(dir, { recursive: true });
  const nodes = [];
  for (const f of list) {
    const host = path.join(dir, encodeName(f.name));
    if (f.dir) { nodes.push({ name: f.name, type: 'dir', children: write(host, f.children) }); continue; }
    fs.writeFileSync(host, f.data);
    nodes.push({ name: f.name, type: f.type, size: f.data.length, path: path.relative(DISC, host).split(path.sep).join('/') });
  }
  return nodes.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
};
const node = { name: NAME, type: 'app', children: write(base, files) };

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
console.log(`lander2: ${PARENT}.${NAME} (${files.length} files); manifest now ${count} files`);
