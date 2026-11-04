#!/usr/bin/env node
// Makes the real-Word .doc fixtures of tests/moreapps/docword.test.mjs
// (macOS, Microsoft Word): each source .docx of
// tests/moreapps/docword-fixtures.mjs is written over
// $HOME/word-open-check/check.docx (the one file Word has a lasting
// access grant for, as tools/word-open-check.mjs uses it), opened in
// Word, saved as Word 97-2003 (.doc) inside Word's own container and
// closed without saving; the .doc is then copied, with its source
// .docx, to tests/moreapps/word-check-out/doc-from-word/ as
// fix-<name>.doc / fix-<name>.docx (git-ignored, never committed).
//
//   node tools/doc-word-fixtures.mjs [name...]
//
// Safe by the repo's rules: one program drives Word at a time; it
// refuses to run when Word has any document open (none of the owner's
// documents is ever touched); only check.docx is opened and closed; no
// System Events / Accessibility scripting, no screenshots. AppleEvent
// errors (-1712: Word not answering) stop the run: they are reported,
// never retried in a loop.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fixtures} from '../tests/moreapps/docword-fixtures.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname),
  '..');
const OUT = path.join(ROOT, 'tests/moreapps/word-check-out/doc-from-word');
const CHECK = path.join(os.homedir(), 'word-open-check', 'check.docx');
const BOX = path.join(os.homedir(),
  'Library/Containers/com.microsoft.Word/Data');

const osa = (script) => execFileSync('osascript', ['-'], {input: script,
  encoding: 'utf8', timeout: 120000}).trim();

function openCount() {
  return Number(osa('with timeout of 60 seconds\n' +
    'tell application "Microsoft Word" to count of documents\n' +
    'end timeout'));
}

function saveAsDoc(name) {
  const target = path.join(BOX, name + '.doc');
  fs.rmSync(target, {force: true});
  osa(`with timeout of 90 seconds
tell application "Microsoft Word"
  open POSIX file "${CHECK}"
  set d to active document
  save as d file name "${target}" file format format document97
  close d saving no
end tell
end timeout`);
  return target;
}

async function main() {
  if (!fs.existsSync(CHECK)) {
    throw new Error('no ' + CHECK + ' (tools/word-open-check.mjs makes it)');
  }
  const want = process.argv.slice(2);
  const all = await fixtures();
  const before = openCount();
  if (before !== 0) {
    throw new Error(`Word has ${before} document(s) open: close them first`);
  }
  fs.mkdirSync(OUT, {recursive: true});
  for (const [name, bytes] of Object.entries(all)) {
    if (want.length && !want.includes(name)) continue;
    const stem = 'fix-' + name;
    fs.writeFileSync(path.join(OUT, stem + '.docx'), bytes);
    fs.writeFileSync(CHECK, bytes);      // (in place: the same file)
    const made = saveAsDoc(stem);
    fs.copyFileSync(made, path.join(OUT, stem + '.doc'));
    console.log('made', path.join(OUT, stem + '.doc'));
  }
  if (openCount() !== 0) console.log('warning: Word has documents open');
}

main().catch((e) => {
  console.error('doc-word-fixtures: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
