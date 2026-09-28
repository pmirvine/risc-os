// Adds $.Apps.!Journal to the seed hard disc (assets/disc/HardDisc4): the Journal, a diary with a page for
// every day, written in JavaScript on the disc so users can read and change it (docs/apps/Journal.md). The
// sources are tools/journal/!Journal (no extension = JSScript &F81, !Run / !Boot = Obey, !Help = Text); the
// toolkit modules it uses (Emitter, Dates, Form, ListView) are copied into its Toolkit directory from
// tools/jsapps/toolkit, as the JSApps book's examples get them; the icons are drawn by tools/journal/icon.mjs.
// The sources must be Latin-1 text with no tabs, and lines of at most 72 characters (they are read in !Edit).
//
// Idempotent: it rewrites only Apps.!Journal and its manifest entry.
// Usage: node tools/disc-journal.mjs   (run by tools/build.mjs); --check only checks the sources
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { iconFiles } from './journal/icon.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'tools/journal/!Journal');
const TOOLKIT = path.join(ROOT, 'tools/jsapps/toolkit');
const TOOLS = ['Emitter', 'Dates', 'Form', 'ListView'];
const DISC = path.join(ROOT, 'assets/disc');
const PARENT = 'Apps', NAME = '!Journal';
const encodeName = (n) => n.replace(/[^A-Za-z0-9_-]/g, (c) => '=' + c.charCodeAt(0).toString(16).padStart(2, '0'));

// ---------------------------------------------------------------- collect the files
const problems = [];
const file = (full, name, rel, own = true) => {
  const text = fs.readFileSync(full, 'utf8');
  if (/[^\n\x20-\x7e\xa0-\xff]/.test(text)) problems.push(`${rel}: only Latin-1 text (no tabs, no CR) please`);
  if (own) text.split('\n').forEach((l, i) => { if (l.length > 72) problems.push(`${rel}:${i + 1}: longer than 72 characters`); });
  const type = /^!(Run|Boot)$/.test(name) ? 'feb' : name === '!Help' ? 'fff' : 'f81';
  return { name, type, data: Buffer.from(text, 'latin1') };
};
const files = fs.readdirSync(SRC).filter((f) => !f.startsWith('.')).sort()
  .map((name) => file(path.join(SRC, name), name, `!Journal/${name}`));
files.push({ name: 'Toolkit', dir: true, children: TOOLS.map((t) => file(path.join(TOOLKIT, t), t, `Toolkit/${t}`, false)) });
for (const [leaf, data] of Object.entries(iconFiles())) files.push({ name: leaf, type: 'ff9', data });
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
if (process.argv.includes('--check')) { console.log(`journal: ${files.length} files, all Latin-1 and 72 columns`); process.exit(0); }

// ---------------------------------------------------------------- write files, then patch the manifest
const LOCK = path.join(DISC, '.journal-lock');
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
console.log(`journal: ${PARENT}.${NAME} (${files.length} files); manifest now ${count} files`);
