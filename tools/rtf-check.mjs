#!/usr/bin/env node
// Do these RTF files read? A quick independent check by macOS
// textutil (Apple's Cocoa RTF reader), for the RTF !Letters writes.
// Real Word is the authority (tools/word-open-check.mjs, which takes
// .rtf too); this is the cheap check. See docs/apps/Letters.md,
// "Checking files in real Word".
//
//   node tools/rtf-check.mjs <file-or-dir>...
//     a directory means every .rtf under it (sorted)
//     --show   print the text textutil gives for each file
// Each file is converted by `textutil -convert txt -stdout`: FAILED
// when textutil refuses it (an error or a non-zero exit), EMPTY when
// it gives no text at all (a file with text that reads as nothing is
// probably damaged), else OK with the number of characters and
// lines. A summary line follows.
// Exit: 0 when every file is OK (or textutil is absent: a SKIP line
// is printed, not a failure), 1 when any is FAILED or EMPTY, 2 on a
// usage error.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const TEXTUTIL = '/usr/bin/textutil';

function walk(paths) {
  const out = new Set();
  const visit = (p) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      for (const n of fs.readdirSync(p).sort()) visit(path.join(p, n));
    } else if (st.isFile() && p.toLowerCase().endsWith('.rtf')) out.add(p);
  };
  for (const p of paths) {
    const st = fs.statSync(p);
    if (st.isFile()) out.add(p); else visit(p);
  }
  return [...out].sort();
}

/** -> {verdict: 'OK'|'FAILED'|'EMPTY', text?, detail?} */
function check(file) {
  let text;
  try {
    text = execFileSync(TEXTUTIL, ['-convert', 'txt', '-stdout', file],
      {stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 512 * 1024 * 1024,
        timeout: 60000}).toString('utf8');
  } catch (e) {
    const why = String(e && e.stderr || e && e.message || e).trim()
      .split('\n').pop();
    return {verdict: 'FAILED', detail: why};
  }
  if (!text.trim()) return {verdict: 'EMPTY', text};
  return {verdict: 'OK', text};
}

function main(argv) {
  const show = argv.includes('--show');
  const paths = argv.filter((a) => a !== '--show');
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(fs.readFileSync(new URL(import.meta.url), 'utf8')
      .split('\nimport ')[0]);
    return 0;
  }
  if (!paths.length || paths.some((a) => a.startsWith('--'))) {
    console.error('usage: node tools/rtf-check.mjs [--show] <file-or-dir>...');
    return 2;
  }
  if (!fs.existsSync(TEXTUTIL)) {
    console.log('SKIP: no ' + TEXTUTIL + ' (macOS only): nothing checked.');
    return 0;
  }
  let files;
  try {
    files = walk(paths.map((p) => path.resolve(p)));
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  const tally = {OK: 0, FAILED: 0, EMPTY: 0};
  for (const f of files) {
    const r = check(f);
    tally[r.verdict]++;
    const rel = path.relative(process.cwd(), f) || f;
    const what = r.verdict === 'OK' ? '  (' + r.text.length + ' characters, ' +
      r.text.split('\n').length + ' lines)' : r.detail ? '  ' + r.detail : '';
    console.log(r.verdict.padEnd(7) + rel + what);
    if (show && r.text) console.log(r.text.replace(/^/gm, '    '));
  }
  console.log(files.length + ' file(s): ' + Object.entries(tally)
    .map(([k, v]) => v + ' ' + k).join(', '));
  return tally.FAILED || tally.EMPTY ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
