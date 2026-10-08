// Adds $.!Boot.Resources.!GameLib to the seed hard disc (assets/disc/HardDisc4): GameLib, the library of
// JavaScript modules that games import as 'gamelib/<Name>' (src/core/jsrun.js finds them through the system
// variable GameLib$Path, else GameLib$Dir). It is a library application among the system resources, like
// !WimpLib: its !Boot (run at start-up by src/main.js) sets GameLib$Dir, GameLib$Path and GameLib$Version unless
// they are set already; its !Run shows its !Help.
//
// The source is tools/games/!GameLib (no extension = JSScript &F81, !Run / !Boot = Obey &FEB, !Help = Text &FFF);
// !Sprites (&FF9) is drawn by tools/games/icon.mjs. The sources must be Latin-1 text with no tabs or CRs, lines of
// at most 72 characters and files of at most 250 lines (they are read in !Edit), say 'riscos' nowhere (the modules
// are plain JavaScript) and have no 'import ... from' text in a comment (jsrun's import scan reads comments).
//
// Idempotent: it rewrites only !Boot.Resources.!GameLib and its manifest entry (the other entries of
// !Boot.Resources keep their order). tools/disc.mjs writes !Boot afresh, so this runs after it (tools/build.mjs).
// Usage: node tools/disc-gamelib.mjs   (run by tools/build.mjs); --check only checks the sources
// GAMES_SRC / GAMES_DISC change the source tree (holding !GameLib) / disc root (for tests/games/disc.test.mjs);
// the script shares the lock on the disc root with the other disc scripts, as all rewrite manifest.json.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { libIconFiles } from './games/icon.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.resolve(process.env.GAMES_SRC ?? path.join(ROOT, 'tools/games'));
const DISC = path.resolve(process.env.GAMES_DISC ?? path.join(ROOT, 'assets/disc'));
const LIB = '!GameLib', PARENT = ['!Boot', 'Resources'];
const MAX_LINES = 250;
const encodeName = (n) => n.replace(/[^A-Za-z0-9_-]/g, (c) => '=' + c.charCodeAt(0).toString(16).padStart(2, '0'));
const byName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

// ---------------------------------------------------------------- collect the files
const problems = [];
const text = (full, rel, app) => {
  const s = fs.readFileSync(full, 'utf8');
  if (/[^\n\x20-\x7e\xa0-\xff]/.test(s)) problems.push(`${rel}: only Latin-1 text (no tabs, no CR) please`);
  const lines = s.replace(/\n$/, '').split('\n');
  if (lines.length > MAX_LINES) problems.push(`${rel}: ${lines.length} lines (at most ${MAX_LINES}: split it)`);
  lines.forEach((l, i) => {
    if (l.length > 72) problems.push(`${rel}:${i + 1}: longer than 72 characters`);
    if (/riscos/i.test(l)) problems.push(`${rel}:${i + 1}: 'riscos' has no place in the library`);
    if (!app && /^\s*(\/\/|\/?\*)/.test(l) && /\bimport\b[^'"]*\bfrom\b/.test(l)) {
      problems.push(`${rel}:${i + 1}: no 'import ... from' text in a comment`);
    }
  });
  return Buffer.from(s, 'latin1');
};
const tree = (dir, rel, top) => fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'))
  .sort(byName).map((e) => {
    const full = path.join(dir, e.name), r = `${rel}/${e.name}`;
    if (e.isDirectory()) return { name: e.name, dir: true, children: tree(full, r, false) };
    const type = top && /^!(Run|Boot)$/.test(e.name) ? 'feb' : top && e.name === '!Help' ? 'fff' : 'f81';
    return { name: e.name, type, data: text(full, r, top && e.name.startsWith('!')) };
  });
const lib = tree(path.join(SRC, LIB), LIB, true).filter((f) => f.name !== '!Sprites');
for (const [leaf, data] of Object.entries(libIconFiles())) lib.push({ name: leaf, type: 'ff9', data });
lib.sort(byName);
const count = (l) => l.reduce((n, f) => n + (f.dir ? count(f.children) : 1), 0);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
if (process.argv.includes('--check')) {
  console.log(`gamelib: ${LIB} ${count(lib)} files; all Latin-1, 72 columns, at most ${MAX_LINES} lines`);
  process.exit(0);
}

// ---------------------------------------------------------------- write files, then patch the manifest
const LOCK = path.join(DISC, '.moreapps-lock');
for (let i = 0; ; i++) {
  try { fs.mkdirSync(LOCK); break; } catch { if (i > 200) { fs.rmSync(LOCK, { recursive: true, force: true }); } Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); }
}
process.on('exit', () => fs.rmSync(LOCK, { recursive: true, force: true }));
const write = (dir, list) => {
  fs.mkdirSync(dir, { recursive: true });
  const nodes = [];
  for (const f of list) {
    const host = path.join(dir, encodeName(f.name));
    if (f.dir) { nodes.push({ name: f.name, type: 'dir', children: write(host, f.children) }); continue; }
    fs.writeFileSync(host, f.data);
    nodes.push({ name: f.name, type: f.type, size: f.data.length, path: path.relative(DISC, host).split(path.sep).join('/') });
  }
  return nodes.sort(byName);
};
const base = path.join(DISC, 'HardDisc4', ...PARENT.map(encodeName), encodeName(LIB));
fs.rmSync(base, { recursive: true, force: true });
const node = { name: LIB, type: 'app', children: write(base, lib) };

const mfPath = path.join(DISC, 'manifest.json');
const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
const parent = PARENT.reduce((n, name) => n?.children?.find((c) => c.name === name), mf.root);
if (!parent?.children) throw new Error(`manifest: no ${PARENT.join('.')} (run tools/disc.mjs first)`);
// replace the entry, or insert it where it sorts: the other entries stay as they are
const was = parent.children.findIndex((c) => c.name === LIB);
if (was >= 0) parent.children[was] = node;
else {
  const at = parent.children.findIndex((c) => byName(c, node) > 0);
  parent.children.splice(at < 0 ? parent.children.length : at, 0, node);
}
let files = 0, bytes = 0;
const walk = (n) => { for (const c of n.children ?? []) { if (c.children) walk(c); else if (!c.placeholder) { files++; bytes += c.size ?? 0; } } };
walk(mf.root);
mf.files = files; mf.totalBytes = bytes;
fs.writeFileSync(mfPath, JSON.stringify(mf));
console.log(`gamelib: ${PARENT.join('.')}.${LIB} (${count(lib)} files); manifest now ${files} files`);
