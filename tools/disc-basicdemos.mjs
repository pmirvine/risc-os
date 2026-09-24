// Adds $.Demos.BASIC to the seed hard disc: the BBC BASIC V demo programs in src/basic/demos/
// (listed in index.json), tokenised as BASIC files (&FFB), plus a ReadMe (&FFF) describing each.
// Double-clicking one runs it full screen (docs/BASIC_WIMP.md); WimpClock runs as a desktop task.
// Idempotent: replaces only $.Demos.BASIC (creating $.Demos if needed) and leaves the rest of the
// manifest alone. Re-run after `node tools/disc.mjs`.   Usage: node tools/disc-basicdemos.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { textToLines, buildProgram } from '../src/basic/tokens.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src/basic/demos');
const DISC = path.join(ROOT, 'assets/disc');
const encodeName = (n) => n.replace(/[^A-Za-z0-9_-]/g, (c) => '=' + c.charCodeAt(0).toString(16).padStart(2, '0'));

/** Tokenise a listing; throws if the tokeniser reports a problem. */
export function tokeniseFile(file) {
  const r = textToLines(fs.readFileSync(path.join(SRC, file), 'latin1'));
  if (r.errors?.length) throw new Error(`${file}: ${JSON.stringify(r.errors)}`);
  return Buffer.from(buildProgram(r.lines));
}

/** Word-wrap text to width columns, indenting continuation lines by indent spaces. */
function wrap(first, text, width, indent) {
  const out = []; let line = first.padEnd(indent);
  for (const w of text.split(/\s+/)) {
    if (line.trim() && line.length + 1 + w.length > width) { out.push(line); line = ' '.repeat(indent) + w; }
    else line = /\S$/.test(line) ? line + ' ' + w : line + w;
  }
  if (line) out.push(line);
  return out.join('\n');
}

export function readMe(list) {
  const head = [
    'BBC BASIC V demonstration programs',
    '==================================',
    '',
    'Double-click a program to run it. Most take over the whole screen in their',
    'own screen mode; press Escape (or any key) to stop, then SPACE to get back',
    'to the desktop. WimpClock is a desktop task: it puts an icon on the icon bar.',
    'Shift-double-click a program to load it into Edit and read the listing.',
    '',
  ];
  const body = list.map((d) => wrap(d.name, d.about, 76, 12));
  return head.join('\n') + '\n' + body.join('\n') + '\n\n' +
    'The listings are also in src/basic/demos/ in the source tree.\n';
}

function main() {
  const list = JSON.parse(fs.readFileSync(path.join(SRC, 'index.json'), 'utf8'));
  const OUT = path.join(DISC, 'HardDisc4', 'Demos', 'BASIC');
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const put = (name, type, data) => {
    const host = path.join(OUT, encodeName(name));
    fs.writeFileSync(host, data);
    return { name, type, size: data.length, path: path.relative(DISC, host).split(path.sep).join('/') };
  };
  const nodes = [put('ReadMe', 'fff', Buffer.from(readMe(list), 'latin1'))];
  for (const d of list) nodes.push(put(d.name, 'ffb', tokeniseFile(d.file)));
  nodes.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

  // read-modify-write the manifest in one go
  const mfPath = path.join(DISC, 'manifest.json');
  const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
  let demos = mf.root.children.find((c) => c.name === 'Demos' && c.type === 'dir');
  if (!demos) {
    demos = { name: 'Demos', type: 'dir', children: [] };
    mf.root.children.push(demos);
    mf.root.children.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  }
  demos.children = (demos.children ?? []).filter((c) => c.name !== 'BASIC');
  demos.children.push({ name: 'BASIC', type: 'dir', children: nodes });
  demos.children.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  let files = 0, bytes = 0;
  const count = (n) => { for (const c of n.children ?? []) { if (c.children) count(c); else if (!c.placeholder) { files++; bytes += c.size ?? 0; } } };
  count(mf.root);
  mf.files = files; mf.totalBytes = bytes;
  fs.writeFileSync(mfPath, JSON.stringify(mf));
  console.log(`$.Demos.BASIC written (${nodes.length} files); manifest now ${files} files`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
