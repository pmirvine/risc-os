// Adds $.MoreApps to the seed hard disc (assets/disc/HardDisc4): a directory beside $.Apps for the larger
// applications written in JavaScript on the disc, starting with !Word (a word processor for Word documents). The
// modules they share, WimpLib (imported as 'wimplib/<Name>': src/core/jsrun.js), are a library in
// !Boot.Resources, put there by tools/disc-wimplib.mjs; this removes the library's old home, MoreApps.WimpLib.
// The source is tools/moreapps/!Word (no extension = JSScript &F81, !Run / !Boot = Obey, !Help = Text); its
// Fonts directory holds font files (Data &FFD) and their Licences (Text); the icons are drawn by
// tools/moreapps/icon.mjs. The sources must be Latin-1 text with no tabs or CRs, and lines of at most 72
// characters (they are read in !Edit); the fonts are exempt, and the Licences may have tabs and long lines.
//
// It also wires $.MoreApps into the boot sequence, in !Boot's Choices.Boot.Desktop (the Filer boots the
// applications in it, so !Word's file type is known from start-up) and PreDesktop (they are added to the Apps
// menu), and the same two files in Utilities.!ResetBoot: one line is added after the one for Utilities / Apps.
// tools/disc.mjs writes these files afresh, so this must run after it (tools/build.mjs does).
//
// Idempotent: it rewrites only MoreApps.!Word, the four boot files and their manifest entries, and removes
// MoreApps.WimpLib (disc and manifest) if it is there.
// Usage: node tools/disc-moreapps.mjs   (run by tools/build.mjs); --check only checks the sources
// MOREAPPS_SRC / MOREAPPS_DISC change the source tree / disc root (for tests/moreapps/disc.test.mjs); the lock on
// the disc root is shared with tools/disc-wimplib.mjs.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { iconFiles } from './moreapps/icon.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.resolve(process.env.MOREAPPS_SRC ?? path.join(ROOT, 'tools/moreapps'));
const DISC = path.resolve(process.env.MOREAPPS_DISC ?? path.join(ROOT, 'assets/disc'));
const PARENT = 'MoreApps', APP = '!Word', OLD_LIB = 'WimpLib';
const encodeName = (n) => n.replace(/[^A-Za-z0-9_-]/g, (c) => '=' + c.charCodeAt(0).toString(16).padStart(2, '0'));
const byName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

// ---------------------------------------------------------------- collect the files
const problems = [];
const text = (full, rel, { strict = true } = {}) => {
  const s = fs.readFileSync(full, 'utf8');
  const bad = strict ? /[^\n\x20-\x7e\xa0-\xff]/ : /[^\t\n\x20-\x7e\xa0-\xff]/;
  if (bad.test(s)) problems.push(`${rel}: only Latin-1 text (no tabs, no CR) please`);
  if (strict) s.split('\n').forEach((l, i) => { if (l.length > 72) problems.push(`${rel}:${i + 1}: longer than 72 characters`); });
  return Buffer.from(s, 'latin1');
};
// a directory of the sources: fonts (under Fonts) are binary, everything else is checked text
const tree = (dir, rel, top) => fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'))
  .sort(byName).map((e) => {
    const full = path.join(dir, e.name), r = `${rel}/${e.name}`;
    if (e.isDirectory()) return { name: e.name, dir: true, children: tree(full, r, false) };
    if (/\/Fonts\/[^/]+$/.test(r)) {
      if (e.name === 'Licences') return { name: e.name, type: 'fff', data: text(full, r, { strict: false }) };
      return { name: e.name, type: 'ffd', data: fs.readFileSync(full) };
    }
    const type = top && /^!(Run|Boot)$/.test(e.name) ? 'feb' : top && e.name === '!Help' ? 'fff' : 'f81';
    return { name: e.name, type, data: text(full, r) };
  });
const app = tree(path.join(SRC, APP), APP, true);
for (const [leaf, data] of Object.entries(iconFiles())) app.push({ name: leaf, type: 'ff9', data });
const count = (l) => l.reduce((n, f) => n + (f.dir ? count(f.children) : 1), 0);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
if (process.argv.includes('--check')) {
  console.log(`moreapps: ${APP} ${count(app)} files; all Latin-1 and 72 columns (fonts exempt)`);
  process.exit(0);
}

// ---------------------------------------------------------------- the boot files: one line after an anchor
const BOOTS = [['!Boot', 'Choices', 'Boot'], ['Utilities', '!ResetBoot', 'Choices', 'Boot']];
const PATCHES = [
  ['Desktop', 'IfThere Boot:^.Utilities then Repeat Filer_Boot Boot:^.Utilities -Applications -Tasks',
    'IfThere Boot:^.MoreApps then Repeat Filer_Boot Boot:^.MoreApps -Applications -Tasks'],
  ['PreDesktop', 'IfThere Boot:^.Apps then AddApp Boot:^.Apps.!*',
    'IfThere Boot:^.MoreApps then AddApp Boot:^.MoreApps.!*'],
];
const patchBoot = (host, anchor, line) => {
  const s = fs.readFileSync(host, 'latin1');
  const eol = s.includes('\r\n') ? '\r\n' : s.includes('\r') && !s.includes('\n') ? '\r' : '\n';
  const lines = s.split(eol);
  const have = lines.filter((l) => l === line).length;
  if (have === 1) return s.length;
  if (have > 1) throw new Error(`${host}: ${have} MoreApps lines (expected one)`);
  const at = lines.indexOf(anchor);
  if (at < 0) throw new Error(`${host}: can't find the line '${anchor}'`);
  lines.splice(at + 1, 0, line);
  const out = lines.join(eol);
  fs.writeFileSync(host, out, 'latin1');
  return out.length;
};

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
const base = path.join(DISC, 'HardDisc4', PARENT);
for (const n of [APP, OLD_LIB]) fs.rmSync(path.join(base, encodeName(n)), { recursive: true, force: true });
const nodes = [{ name: APP, type: 'app', children: write(path.join(base, encodeName(APP)), app) }];

const mfPath = path.join(DISC, 'manifest.json');
const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
let parent = mf.root.children.find((c) => c.name === PARENT);
if (!parent) {
  parent = { name: PARENT, type: 'dir', children: [] };
  const at = mf.root.children.findIndex((c) => byName(c, parent) > 0);
  mf.root.children.splice(at < 0 ? mf.root.children.length : at, 0, parent);
}
parent.children = parent.children.filter((c) => c.name !== APP && c.name !== OLD_LIB);
parent.children.push(...nodes);
parent.children.sort(byName);
const find = (names) => names.reduce((n, name) => n?.children?.find((c) => c.name === name), mf.root);
for (const dir of BOOTS) {
  for (const [leaf, anchor, line] of PATCHES) {
    const entry = find([...dir, leaf]);
    if (!entry?.path) throw new Error(`manifest: no ${[...dir, leaf].join('.')}`);
    entry.size = patchBoot(path.join(DISC, entry.path), anchor, line);
  }
}
let files = 0, bytes = 0;
const walk = (n) => { for (const c of n.children ?? []) { if (c.children) walk(c); else if (!c.placeholder) { files++; bytes += c.size ?? 0; } } };
walk(mf.root);
mf.files = files; mf.totalBytes = bytes;
fs.writeFileSync(mfPath, JSON.stringify(mf));
console.log(`moreapps: ${PARENT}.${APP} (${count(app)} files), boot files wired; manifest now ${files} files`);
