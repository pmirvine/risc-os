// Generates the real-Word hand-off files for tables (Batch C; local
// only, never committed: tests/moreapps/corpus/ is git-ignored). Not a
// test:
//
//   node tests/moreapps/handoff-tables.mjs [--word-md]
//
// Writes into tests/moreapps/corpus/handoff/ (made if missing):
//   tb-1-insert.docx, tb-1b-existing.docx, tb-2-rows-cols.docx,
//   tb-3-merge-split.docx, tb-4-widths.docx, tb-5-borders-shading.docx,
//   tb-6-styles.docx, tb-6b-compat14.docx, tb-6c-compat15.docx,
//   tb-7-nested.docx, tb-7b-nested-edits.docx, tb-8-source.docx,
//   tb-8-pasted.docx, tb-8b-style-clash.docx,
//   tb-8c-content-control.docx, tb-9-convert.docx, tb-10-strict.docx,
//   tb-11-bookmarks.docx, tb-12-hostile-but-valid.docx,
//   tb-13-roundtrip-{merged,nested,styled}.docx (Word-made tables of
//   the corpus; skipped with a note when the corpus is absent),
//   tb-14-floating-bidi.docx and tb-README.txt (the steps in Word,
//   what !Letters wrote, every question with its id and file).
// The files are made with !Letters' own commands (Insert > Table, the
// row, column, merge, split, distribute, drag, Table properties,
// Borders and shading, paste and convert commands) on documents built
// from XML where a fixture is needed; each is written, linted, read
// back and every block checked (handoff-tables-lib.mjs save), and its
// tables are listed in the README. A file is written only when its
// bytes change; nothing else in the folder is touched except INDEX.txt
// (run handoff-index.mjs after). --word-md prints the index of
// docs/apps/Letters.md ("To check in real Word (tables, consolidated)").
import {put, wrote} from './handoff-tables-lib.mjs';
import {makeA, notes} from './handoff-tables-a.mjs';
import {makeB} from './handoff-tables-b.mjs';
import {makeC} from './handoff-tables-c.mjs';
import {FILES, Q, PRIORITY, beliefs} from './handoff-tables-q.mjs';

const wrap = (text, indent, width = 72) => {
  const out = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    if (line && indent.length + line.length + 1 + w.length > width) {
      out.push(indent + line);
      line = w;
    } else line = line ? line + ' ' + w : w;
  }
  if (line) out.push(indent + line);
  return out;
};
const latin = (s) => s.replace(/[^\x00-\xff]/g, '?');

const bel = beliefs();
const first = new Set(PRIORITY.flatMap((x) => x[2]));
const ids = new Set(Q.map((q) => q[0]));
for (const id of bel.keys()) {
  if (!ids.has(id)) throw new Error('no Q row for ' + id);
}
for (const id of ids) {
  if (!bel.has(id)) throw new Error('no belief for ' + id);
}
const named = new Set(FILES.map((f) => f[0]));
for (const [id, files] of Q) {
  for (const f of files || []) {
    if (!named.has(f)) throw new Error(id + ': unknown file ' + f);
  }
}

if (process.argv.includes('--word-md')) {
  for (const [id, files] of Q) {
    console.log(`| ${id} | ${files ? files.map((f) => '`' + f + '`')
      .join(', ') : '(No file)'} | ${bel.get(id)[0].replace(/\|/g, '/')} |`);
  }
  process.exit(0);
}

await makeA();
await makeB();
await makeC();
for (const [f] of FILES) {
  if (!wrote.has(f) && !notes.has(f)) throw new Error('not written: ' + f);
}

const README = [
  'Tables (!Letters Batch C): the real-Word hand-off',
  '(made by node tests/moreapps/handoff-tables.mjs; local only, this',
  'folder is never committed)',
  '',
  'Every file is made by !Letters\' own commands (Insert > Table, the Table',
  'menu, Table properties, Borders and shading, column and row drags,',
  'paste between documents, Convert) on a fixture, or is a Word-made',
  'table of the corpus read and written untouched. Each was written,',
  'checked by the package lint, read back by !Letters and every block',
  'checked. Table numbers are those in each file\'s captions (the line',
  'above a table says what was done to it and which question it is for).',
  '',
  'PRIORITY: the ' + Q.length + ' questions are too many for one',
  'session. Take these ' + PRIORITY.length + ' first, in this order (the',
  'ones that could show a repair prompt or an "unreadable content"',
  'message come first); everything else below is marked "if time',
  'allows". Each names the file and the question ids to read under',
  '"Questions".',
  '',
  ...PRIORITY.flatMap(([what, files, qs], i) => [
    ...wrap(`${i + 1}. ${what}`, '  '),
    ...(files.length ? wrap('Files: ' + files.join(', '), '     ') : []),
    ...(qs.length ? wrap('Questions: ' + qs.join(' '), '     ') : []),
    '']),
  'How to use this:',
  '  1. Smoke test: open EVERY file once in Word and note only whether',
  '     it complains (a repair prompt, "unreadable content"). Any',
  '     complaint is the most valuable finding: write down the file.',
  '  2. Then the PRIORITY list above, then, if time allows, the rest',
  '     of the questions below in order: open the file, look at',
  '     the table the caption names, and compare with what !Letters',
  '     believes. "(No file)" questions are done by making the thing in',
  '     Word, or in !Letters, and opening the result in the other.',
  '  3. Word counts: INDEX.txt lists the word counts !Letters shows for each',
  '     file; Review > Word Count in Word should match.',
  '',
  'Files, in the order for one session',
  '-----------------------------------',
  ...FILES.flatMap(([f, what, qs]) => [`  ${f}`, ...wrap(what +
    (qs.length ? '. Questions: ' + qs.join(' ') : ''), '      ')]),
  '',
  'What !Letters wrote (the tables of each file, read back; Table n is the',
  'caption\'s number from 0, nested tables are listed under their own',
  'table, 63-column tables with a grid abbreviated)',
  '-------------------------------------------------------------------',
  ...FILES.flatMap(([f]) => [`  ${f}`,
    ...(notes.has(f) ? wrap(notes.get(f), '    ') : []),
    ...(wrote.get(f) || [])]),
  '',
  'Questions',
  '---------',
  'Each has a stable id, the file(s) it is asked of, the steps in Word,',
  'the question as recorded while !Letters was built, and what !Letters does',
  'now (to compare with Word). Ids that start TB: the spec\'s TB1 to',
  'TB26 and their sub-questions (a, b ...); TBC4, TBC5, TBC6: readings',
  'made while building the Table menu, Table properties / borders /',
  'drags and clipboard / convert; TBX: known limits recorded at the end.',
  `${Q.length} questions, ${Q.filter((q) => !q[1]).length} with no file.`,
  '',
  ...Q.flatMap(([id, files, steps]) => {
    const [q, say] = bel.get(id);
    return [`${id}  ${files ? files.join(', ') : '(No file)'}` +
      (first.has(id) ? '   [PRIORITY]' : '   [if time allows]'),
      ...wrap('Steps in Word: ' + steps + '.', '    '),
      ...wrap('Question: ' + q, '    '),
      ...wrap('!Letters: ' + say, '    '), ''];
  }),
];
const text = latin(README.join('\n')) + '\n';
console.log('tb-README.txt: ' + put('tb-README.txt',
  new TextEncoder().encode(text)));
console.log(`${FILES.length} files, ${Q.length} questions`);
