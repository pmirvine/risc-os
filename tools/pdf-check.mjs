#!/usr/bin/env node
// Do poppler's tools read these PDF files? (a developer's check of
// the files !Letters' Export as PDF... (window menu) writes; not on the
// disc.) poppler is an independent reader: pdfinfo counts the pages,
// pdftotext reads the text back.
//
//   node tools/pdf-check.mjs <file-or-dir>...
//     a directory means every .pdf under it (sorted)
//   Each file: its page count, then each page's first 200
//   characters (white space shown as one space), and every line the
//   tools wrote to stderr (a Syntax Error, an I/O Error, a Warning).
// Exit: 0 every file read with nothing on stderr; 1 a tool failed
// or reported a problem with a file (or a file is missing); 2 a
// usage error. When pdfinfo or pdftotext is not installed (brew
// install poppler) it says so on one line, checks nothing and exits
// 0, so a test or script may run it anywhere.
// PDF_CHECK_BIN names the directory of the tools (default: the
// first of /opt/homebrew/bin, /usr/local/bin and /usr/bin that has
// both: ./lib/poppler.mjs, which the tests use too).
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {popplerDir} from './lib/poppler.mjs';

const HEAD = 200;

/** Every .pdf under a directory, sorted; a file as it is. */
function pdfsOf(p, out = []) {
  if (!fs.statSync(p).isDirectory()) {
    out.push(p);
    return out;
  }
  const names = fs.readdirSync(p).sort();
  for (const n of names) {
    const q = path.join(p, n);
    if (fs.statSync(q).isDirectory()) pdfsOf(q, out);
    else if (n.toLowerCase().endsWith('.pdf')) out.push(q);
  }
  return out;
}

/** White space runs as one space, ends trimmed (no regexp). */
function oneLine(s) {
  let out = '', gap = false;
  for (const c of s) {
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' ||
      c === '\f' || c === '\v' || c === ' ') {
      gap = out.length > 0;
      continue;
    }
    if (gap) out += ' ';
    gap = false;
    out += c;
  }
  return out;
}

/** Run a tool: {out, problems} (problems: stderr lines, exit). */
function run(bin, args) {
  const r = spawnSync(bin, args, {encoding: 'utf8',
    maxBuffer: 1 << 28});
  const problems = String(r.stderr || '').split('\n')
    .filter((l) => l.trim());
  if (r.error) problems.push(String(r.error.message));
  else if (r.status !== 0) {
    problems.push(path.basename(bin) + ' exited with ' + r.status);
  }
  return {out: String(r.stdout || ''), problems};
}

/** Check one file: prints its report; true when it is fine. */
function check(dir, f) {
  const info = run(path.join(dir, 'pdfinfo'), [f]);
  let pages = null;
  for (const l of info.out.split('\n')) {
    if (l.startsWith('Pages:')) pages = Number(l.slice(6).trim());
  }
  const text = run(path.join(dir, 'pdftotext'), ['-enc', 'UTF-8',
    f, '-']);
  const problems = [...info.problems, ...text.problems];
  if (!Number.isInteger(pages)) problems.push('pdfinfo: no page count');
  console.log(`${problems.length ? 'PROBLEM' : 'OK'} ${f}: ` +
    `${pages ?? '?'} page${pages === 1 ? '' : 's'}`);
  // pdftotext ends each page with a form feed
  const texts = text.out.split('\f');
  if (texts.length && !texts[texts.length - 1].trim()) texts.pop();
  texts.forEach((t, i) => {
    const s = oneLine(t);
    console.log(`  page ${i + 1}: ${s.length > HEAD
      ? s.slice(0, HEAD) + '...' : s}`);
  });
  if (Number.isInteger(pages) && texts.length > pages) {
    problems.push(`pdftotext read ${texts.length} pages`);
  }
  for (const p of problems) console.log('  reported: ' + p);
  return problems.length === 0;
}

const args = process.argv.slice(2);
if (!args.length || args.some((a) => a.startsWith('-'))) {
  console.error('usage: node tools/pdf-check.mjs <file-or-dir>...');
  process.exit(2);
}
const dir = popplerDir();
if (!dir) {
  console.log('pdf-check: skipped: pdfinfo / pdftotext not ' +
    'installed (brew install poppler)');
  process.exit(0);
}
let bad = 0, n = 0;
for (const a of args) {
  if (!fs.existsSync(a)) {
    console.log(`PROBLEM ${a}: no such file`);
    bad++;
    continue;
  }
  for (const f of pdfsOf(a)) {
    n++;
    if (!check(dir, f)) bad++;
  }
}
console.log(`pdf-check: ${n} file${n === 1 ? '' : 's'}, ` +
  `${bad} with problems`);
process.exit(bad ? 1 : 0);
