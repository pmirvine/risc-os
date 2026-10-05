#!/usr/bin/env node
// Fetches sample .docx files from public repositories with permissive
// licences into tests/moreapps/corpus/ (git-ignored, never committed),
// for tests/moreapps/corpus.test.mjs: real-world documents with tracked
// changes, comments, footnotes, fields, tables, text boxes, charts,
// Strict-format files and so on. Every source is pinned to a commit;
// each file is checked against the git blob hash that commit lists, so
// the corpus is the same bytes every run. The licence file of each
// repository must say what is expected below, or that source is skipped.
// Nothing GPL is fetched (Pandoc's test documents are left out on
// purpose). Sources:
//   python-docx   MIT           all .docx files
//   poi           Apache-2.0    test-data/document/*.docx
//   open-xml-sdk  MIT           test/**/*.docx
//   libreoffice   MPL-2.0       up to 3 files per sw/qa/extras/*/data
// Files over 5 MB are left out (and the total is capped at 60 MB).
// SOURCES.txt in the corpus folder records URL, commit, licence, and
// the SHA-256 of every file. Running it again skips files that are
// already there with the right hash. An unreachable source is a
// warning; only a failure to write files is an error.
//
// Requires the GitHub CLI `gh`, installed and logged in (`gh auth
// status`): it lists the files of each commit. Without it every source
// is skipped with a warning and the script still exits 0 ("0 sources
// fetched"). Run the test with
//   NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/corpus.test.mjs
// (about 25 s and up to ~1.9 GB of memory; the corpus is about 24 MB in
// 630 files and the download about 15 s).
//   Usage: node tools/moreapps-corpus.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'tests/moreapps/corpus');
const MAX_FILE = 5 * 1024 * 1024;
const MAX_TOTAL = 60 * 1024 * 1024;
const PER_DIR = 3; // libreoffice only

const SOURCES = [
  {id: 'python-docx', repo: 'python-openxml/python-docx',
    commit: 'e45454602b53e8e572b179ccf1c91093ec9f4ed7',
    licence: 'MIT', licFile: 'LICENSE', licRe: /MIT License|Permission is hereby granted, free of charge/,
    pick: (p) => /\.docx$/i.test(p), strip: ''},
  {id: 'poi', repo: 'apache/poi',
    commit: 'ae62bb5116b9aee19ebd5834e3a82066132c9f7f',
    licence: 'Apache-2.0', licFile: 'legal/LICENSE', licRe: /Apache License\s+Version 2\.0/,
    pick: (p) => /^test-data\/document\/[^/]+\.docx$/i.test(p), strip: 'test-data/document/'},
  {id: 'open-xml-sdk', repo: 'dotnet/Open-XML-SDK',
    commit: '431ab05cf160248cc3885a4a766026d4f8243792',
    licence: 'MIT', licFile: 'LICENSE', licRe: /MIT License|Permission is hereby granted, free of charge/,
    pick: (p) => /^test\/.*\.docx$/i.test(p),
    strip: 'test/DocumentFormat.OpenXml.Tests.Assets/assets/TestDataStorage/'},
  {id: 'libreoffice', repo: 'LibreOffice/core',
    commit: '5c7c6a2eaa2fb4f83a68895b246fc787f76b5193',
    licence: 'MPL-2.0', licFile: 'COPYING.MPL', licRe: /Mozilla Public License Version 2\.0/,
    dirs: 'sw/qa/extras', strip: 'sw/qa/extras/',
    note: 'mixed repository: GPLv3 COPYING; test files assumed MPL-2.0, not verified per file'},
];

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const gitSha = (b) => crypto.createHash('sha1')
  .update(`blob ${b.length}\0`).update(b).digest('hex');
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';

let haveGh;
function api(p) {
  if (haveGh === undefined) {
    try { execFileSync('gh', ['auth', 'status'], {stdio: 'ignore'}); haveGh = true; }
    catch (e) { haveGh = false; }
  }
  if (haveGh) {
    return JSON.parse(execFileSync('gh', ['api', p],
      {maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe']}).toString());
  }
  throw new Error('gh is not available (needed to list the files)');
}

async function raw(s, p) {
  const url = `https://raw.githubusercontent.com/${s.repo}/${s.commit}/` +
    p.split('/').map(encodeURIComponent).join('/');
  for (let tries = 0; ; tries++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (tries >= 2) throw e;
    }
  }
}

/** [{path, size, sha}] of the files to fetch from one source. */
function list(s) {
  const tree = (sha, rec) => api(`repos/${s.repo}/git/trees/${sha}${rec ? '?recursive=1' : ''}`);
  if (!s.dirs) {
    const t = tree(s.commit, true);
    if (t.truncated) throw new Error('file list truncated');
    return t.tree.filter((e) => e.type === 'blob' && s.pick(e.path));
  }
  // a huge repository: look in each <dirs>/*/data folder only
  let node = {sha: s.commit};
  for (const part of s.dirs.split('/')) {
    node = tree(node.sha).tree.find((e) => e.path === part);
    if (!node) throw new Error('no ' + s.dirs);
  }
  const out = [];
  for (const d of tree(node.sha).tree.filter((e) => e.type === 'tree')) {
    const sub = tree(d.sha).tree.find((e) => e.path === 'data' && e.type === 'tree');
    if (!sub) continue;
    const docx = tree(sub.sha).tree
      .filter((e) => e.type === 'blob' && /\.docx$/i.test(e.path) && e.size <= 1 << 20)
      .sort((a, b) => (a.path < b.path ? -1 : 1)).slice(0, PER_DIR);
    for (const e of docx) out.push({...e, path: `${s.dirs}/${d.path}/data/${e.path}`});
  }
  return out;
}

async function fetchSource(s, budget) {
  const lic = (await raw(s, s.licFile)).toString('utf8');
  if (!s.licRe.test(lic)) throw new Error(`${s.repo}: ${s.licFile} does not look like ${s.licence}`);
  const files = list(s).filter((e) => e.size <= MAX_FILE)
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  const dir = path.join(OUT, s.id);
  const done = [];
  let fetched = 0, kept = 0, bytes = 0, next = 0;
  async function worker() {
    while (next < files.length) {
      const e = files[next++];
      if (bytes + e.size > budget.left) continue;
      const rel = e.path.startsWith(s.strip) ? e.path.slice(s.strip.length) : e.path;
      const dest = path.join(dir, ...rel.split('/'));
      let data = fs.existsSync(dest) ? fs.readFileSync(dest) : null;
      if (!data || gitSha(data) !== e.sha) {
        data = await raw(s, e.path);
        if (gitSha(data) !== e.sha) throw new Error(`${e.path}: hash differs from the commit's`);
        fs.mkdirSync(path.dirname(dest), {recursive: true});
        fs.writeFileSync(dest, data);
        fetched++;
      }
      bytes += data.length; kept++;
      done.push({rel, size: data.length, sha: sha256(data)});
    }
  }
  await Promise.all(Array.from({length: 8}, worker));
  budget.left -= bytes;
  done.sort((a, b) => (a.rel < b.rel ? -1 : 1));
  return {s, done, fetched, bytes, skipped: files.length - kept};
}

let ghOk = true;
try { execFileSync('gh', ['auth', 'status'], {stdio: 'ignore'}); }
catch (e) {
  ghOk = false;
  console.warn('WARNING: the GitHub CLI `gh` is missing or not logged in ' +
    '(gh auth status fails); it is needed to list the files, so no ' +
    'source can be fetched. Install it and run `gh auth login`.');
}
fs.mkdirSync(OUT, {recursive: true});
const budget = {left: MAX_TOTAL};
const results = [];
for (const s of ghOk ? SOURCES : []) {
  try {
    const r = await fetchSource(s, budget);
    results.push(r);
    console.log(`${s.id}: ${r.done.length} files (${r.fetched} downloaded), ${mb(r.bytes)}` +
      (r.skipped ? `, ${r.skipped} left out (size cap)` : ''));
  } catch (e) {
    console.warn(`WARNING: ${s.id} (${s.repo}) skipped: ${e.message.split('\n')[0]}`);
  }
}
if (!results.length) {
  console.warn('WARNING: 0 sources fetched' + (ghOk ? ' (see above)' : ''));
} else {
  const txt = ['Sample .docx files for tests/moreapps/corpus.test.mjs, fetched by',
    'tools/moreapps-corpus.mjs. Not committed. Each file is the unmodified',
    'file at the pinned commit (checked against its git blob hash).',
    'Licences are repository-level; individual files may contain third-party',
    'content (for example scraped or conformance-sample documents). Local',
    'testing only: the corpus is never committed or redistributed.',
    'python-docx (MIT), Apache POI (Apache-2.0) and Open XML SDK (MIT) have',
    'the licences found in their LICENSE files, checked when fetched. The',
    'LibreOffice repository is mixed (COPYING is GPLv3; the test documents',
    'are taken as MPL-2.0 per COPYING.MPL, which is not verified per file).',
    ''];
  for (const {s, done, bytes} of results) {
    txt.push('=' .repeat(70), `Source:  https://github.com/${s.repo}`,
      `Commit:  ${s.commit}`, `Licence: ${s.licence} (${s.licFile} in the repository, checked)` +
      (s.note ? '\nNote:    ' + s.note : ''),
      `Files:   ${done.length}, ${bytes} bytes`, `Folder:  ${s.id}/`, 'SHA-256  file');
    for (const f of done) txt.push(`${f.sha}  ${f.rel}`);
    txt.push('');
  }
  fs.writeFileSync(path.join(OUT, 'SOURCES.txt'), txt.join('\n'));
  const n = results.reduce((a, r) => a + r.done.length, 0);
  const b = results.reduce((a, r) => a + r.bytes, 0);
  console.log(`total ${n} files, ${mb(b)} in tests/moreapps/corpus`);
}
