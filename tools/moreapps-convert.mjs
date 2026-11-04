#!/usr/bin/env node
// Converts the .docx files of the corpus (tests/moreapps/corpus, see
// tools/moreapps-corpus.mjs) to .odt and .doc with headless LibreOffice,
// into tests/moreapps/corpus/converted/<odt|doc>/<source folder>/.
// The results are real-tool inputs for cross-checking the ODT and .doc
// readers; they are git-ignored with the rest of the corpus.
//
// Refuses to run without LibreOffice's `soffice` (on the PATH, in
// /Applications/LibreOffice.app, or named by SOFFICE=/path/to/soffice).
// A private profile folder is used (nothing in the user's own
// LibreOffice settings is read or changed). Files go in batches; a batch
// that fails or hangs (killed after 5 minutes) is converted one file at
// a time (60 s each). Failures are listed at the end and written to
// converted/failures.txt; the exit status is 0 either way.
//   Usage: node tools/moreapps-convert.mjs [--only odt|doc] [--limit N]
//                                          [source-folder ...]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CORPUS = path.join(ROOT, 'tests/moreapps/corpus');
const OUT = path.join(CORPUS, 'converted');
const SKIP = new Set(['handoff', 'word-check', 'converted', 'poi-doc', 'libreoffice-odt']);
const TARGETS = {odt: 'odt:writer8', doc: 'doc:MS Word 97'};
const BATCH = 25;

function findSoffice() {
  const cands = [process.env.SOFFICE, 'soffice',
    '/opt/homebrew/bin/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice'].filter(Boolean);
  for (const c of cands) {
    const r = spawnSync(c, ['--headless', '--version'], {encoding: 'utf8', timeout: 120000});
    if (r.status === 0 && /LibreOffice/.test(r.stdout)) return {bin: c, version: r.stdout.trim()};
  }
  return null;
}

const args = process.argv.slice(2);
let only = null, limit = Infinity;
const folders = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--only') only = args[++i];
  else if (args[i] === '--limit') limit = +args[++i];
  else folders.push(args[i]);
}
const so = findSoffice();
if (!so) {
  console.error('soffice (LibreOffice) was not found: install it ' +
    '(brew install --cask libreoffice) or set SOFFICE=/path/to/soffice');
  process.exit(1);
}
if (only && !TARGETS[only]) { console.error('--only odt|doc'); process.exit(1); }
if (!fs.existsSync(CORPUS)) {
  console.error('no corpus: run node tools/moreapps-corpus.mjs first');
  process.exit(1);
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})
    .sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.docx$/i.test(e.name) && !e.name.startsWith('~$')) yield p;
  }
}

const sources = [];
for (const d of fs.readdirSync(CORPUS, {withFileTypes: true})) {
  if (!d.isDirectory() || SKIP.has(d.name)) continue;
  if (folders.length && !folders.includes(d.name)) continue;
  for (const f of walk(path.join(CORPUS, d.name))) sources.push(f);
}
sources.splice(limit);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-profile-'));
const run = (target, outdir, files, timeout) => spawnSync(so.bin,
  [`-env:UserInstallation=file://${profile}`, '--headless', '--norestore',
    '--convert-to', TARGETS[target], '--outdir', outdir, ...files],
  {encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe']});

// the first line of output that is not a font warning
const why = (r) => (`${r.stderr}\n${r.stdout}`.split('\n')
  .map((l) => l.trim()).find((l) => l && !/^Fontconfig/.test(l)) || 'no output');
const failures = [];
let made = 0;
console.log(`${so.version}; ${sources.length} .docx files`);
for (const target of only ? [only] : Object.keys(TARGETS)) {
  // group by output folder so --outdir is one folder per call
  const groups = new Map();
  for (const f of sources) {
    const rel = path.relative(CORPUS, f);
    const outdir = path.join(OUT, target, path.dirname(rel));
    if (!groups.has(outdir)) groups.set(outdir, []);
    groups.get(outdir).push(f);
  }
  for (const [outdir, files] of groups) {
    fs.mkdirSync(outdir, {recursive: true});
    const outOf = (f) => path.join(outdir, path.basename(f).replace(/\.docx$/i, '.' + target));
    const todo = files.filter((f) => !fs.existsSync(outOf(f)));
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      run(target, outdir, batch, 300000);
      for (const f of batch) {
        if (fs.existsSync(outOf(f))) continue;
        const r = run(target, outdir, [f], 60000);   // alone
        if (!fs.existsSync(outOf(f))) {
          failures.push(`${target}\t${path.relative(CORPUS, f)}\t` +
            (r.error ? String(r.error.code || r.error.message) : why(r)));
        }
      }
    }
    made += files.filter((f) => fs.existsSync(outOf(f))).length;
    console.log(`${target} ${path.relative(CORPUS, outdir)}: ` +
      `${files.filter((f) => fs.existsSync(outOf(f))).length}/${files.length}`);
  }
}
fs.rmSync(profile, {recursive: true, force: true});
fs.mkdirSync(OUT, {recursive: true});
fs.writeFileSync(path.join(OUT, 'failures.txt'), failures.join('\n') + (failures.length ? '\n' : ''));
console.log(`${made} converted, ${failures.length} failed` +
  (failures.length ? ' (see tests/moreapps/corpus/converted/failures.txt)' : ''));
for (const f of failures) console.log('FAILED ' + f);
