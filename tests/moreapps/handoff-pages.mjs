// Generates the real-Word hand-off files of Batch D (R3): pages (prefix
// PG), headers, footers and fields (HF), and columns, line numbers,
// text wrap, floating tables and the views (CL); local only, never
// committed: tests/moreapps/corpus/ is git-ignored.
// Not a test:
//
//   node tests/moreapps/handoff-pages.mjs [--word-md]
//
// Writes into tests/moreapps/corpus/handoff/ (made if missing):
//   pg-setup.docx, pg-x1-margins.docx, pg-x2-size0.docx,
//   pg-1b-widows.docx, pg-40a-lastbreak-12.docx,
//   pg-40b-lastbreak-15.docx, pg-40c-break-section.docx,
//   pg-5a-spacebefore-14.docx, pg-5b-spacebefore-15.docx,
//   pg-3-oddpage.docx, pg-4-sizes.docx, pg-36-metrics.docx,
//   pg-1-breaks.docx, pg-6-valign.docx, pg-8-splitrow.docx,
//   pg-10-headers.docx, pg-7-keeptable.docx, pg-38-bordergroup.docx,
//   pg-14-mirror.docx, pg-24-borders.docx, pg-39-docgrid.docx,
//   hf-1-oddeven.docx, hf-2-float.docx, hf-3-new.docx,
//   hf-4-numfmt.docx, hf-5-unlink.docx, hf-6-date.docx,
//   hf-8-bodypage.docx, hf-10-mergeformat.docx, hf-fields.docx,
//   hf-x1-continuous.docx, hf-x2-tall.docx (handoff-pages-hf.mjs),
//   cl-1-colsep.docx, cl-2-balance.docx, cl-3-maxcols.docx,
//   cl-4-lnnum.docx, cl-6-floatbottom.docx, cl-7-centred.docx,
//   cl-8-oscillate.docx, cl-9-outline.docx, cl-columns.docx,
//   cl-wrap.docx, cl-11-floattable.docx, cl-12-floatwrap.docx
//   (handoff-pages-c.mjs; the Batch A clipboard files cl-1-source ..
//   cl-3-strict and cl-README.txt are other names, never touched) and
//   pg-README.txt, the ONE README of Batch D: a PRIORITY list first
//   (the files that could show a repair prompt first), then the files
//   in session order, what !Letters wrote, and every question by
//   prefix (PG, HF, CL) with its ids, file, steps in Word and what
//   !Letters does.
// Every file is a document !Letters read (a fixture built from XML, or a
// new document) and wrote itself, after its own commands where the
// question is about them (Insert > Section break, Format > Page
// setup..., Format > Layout..., the header menu, the first edit of a
// header, Insert > Page number / Field..., Edit > Update field,
// Format > Columns..., Insert > Column break, the Line numbers box,
// Format > Wrap text, Outline's commands, the Table menu); each
// is linted, read back and every
// block checked (handoff-pages-lib.mjs save); handoff-xsd.test.mjs
// checks schema order and values. A file is written only when its
// bytes change; nothing else in the folder is touched (run
// handoff-index.mjs after for INDEX.txt). --word-md prints the rows
// of docs/apps/Letters.md's "To check in real Word (Batch D)".
import {put, wrote} from './handoff-pages-lib.mjs';
import {makeA} from './handoff-pages-a.mjs';
import {makeB} from './handoff-pages-b.mjs';
import {makeHf} from './handoff-pages-hf.mjs';
import {makeC} from './handoff-pages-c.mjs';
import {FILES, Q, PRIORITY, beliefs} from './handoff-pages-q.mjs';

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
// HF1..HF11 are the spec's PG12, PG13, PG15..PG23, CL1..CL10 its
// PG25..PG34, CL11 and CL12 the owner's ruling R5 (R3)
const HF_PG = [12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23];
const spec = (id) => (/^(PG|HF|CL)X/.test(id) ? ' (no spec id)'
  : /^HF\d+$/.test(id) ? ` (spec PG${HF_PG[+id.slice(2) - 1]})`
    : /^CL(11|12)$/.test(id) ? ' (owner ruling R5)'
      : /^CL\d+$/.test(id) ? ` (spec PG${24 + +id.slice(2)})` : '');

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
for (const [what, files, qs] of PRIORITY) {
  for (const f of files) {
    if (!named.has(f)) throw new Error(what + ': unknown file ' + f);
  }
  for (const q of qs) if (!ids.has(q)) throw new Error('no question ' + q);
}

if (process.argv.includes('--word-md')) {
  for (const [id, files] of Q) {
    const [q, say] = bel.get(id).map((s) => s.replace(/\|/g, '/'));
    console.log(`| ${id}${spec(id)} | ${files ? files.map((f) => '`' + f +
      '`').join(', ') : '(No file)'} | ${q} | ${say} |`);
  }
  process.exit(0);
}

await makeA();
await makeB();
await makeHf();
await makeC();
for (const [f] of FILES) {
  if (!wrote.has(f)) throw new Error('not written: ' + f);
}
for (const f of wrote.keys()) {
  if (!named.has(f)) throw new Error('written but not listed: ' + f);
}

const README = [
  'Pages, headers, footers, fields, columns, line numbers, text wrap,',
  'floating tables and the views (!Letters Batch D): the real-Word',
  'hand-off, one README for the whole batch',
  '(made by node tests/moreapps/handoff-pages.mjs; local only, this',
  'folder is never committed)',
  '',
  'Every file is a document !Letters read and wrote itself, after its own',
  'commands where the question is about them (Insert > Section break,',
  'Format > Page setup..., Format > Layout..., the header menu, typing',
  'in a header, Insert > Page number and Field..., Edit > Update',
  'field, Format > Columns..., Insert > Column break, the Line numbers',
  'box, Format > Wrap text, a picture dragged, Outline\'s Promote,',
  'Demote and Move up, typing in a floating table, Table > Insert row',
  'and Split table). Each was written,',
  'checked by the package lint and the schemas, read back by !Letters and',
  'every block checked. Most files have a footer with the page number',
  '(a PAGE field), and most lines are exactly 12 pt high, so a page',
  'holds 58 of them (A4, 1 in margins) in Word and in !Letters alike: the',
  'bold first line of each case says what to look at. Open each file',
  'in !Letters too (Print layout) to compare page by page. The cl',
  'files are Batch D\'s (cl-1-colsep .. cl-12-floatwrap, cl-columns,',
  'cl-wrap); cl-1-source, cl-2-pasted, cl-2b, cl-2c and cl-3-strict',
  'in this folder are Batch A\'s clipboard files (cl-README.txt).',
  '',
  'PRIORITY: the ' + Q.length + ' questions may be too many for one',
  'session. Take these ' + PRIORITY.length + ' first, in this order: the',
  'files that could show a repair prompt (made or edited by !Letters\'',
  'own commands, or with geometry Word\'s dialogs refuse). Everything',
  'else below is marked "if time allows". Each names the files and the',
  'question ids to read under "Questions".',
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
  '     of the questions below in order. Use Print layout (View >',
  '     Print Layout) and read the page number in the status bar or',
  '     the footer.',
  '',
  'Files, in the order for one session',
  '-----------------------------------',
  ...FILES.flatMap(([f, what, qs]) => [`  ${f}`, ...wrap(what +
    (qs.length ? '. Questions: ' + qs.join(' ') : ''), '      ')]),
  '',
  'What !Letters wrote (each file read back: its sections with their',
  'start, page size, margins (top/bottom/left/right) and vertical',
  'alignment, then its paragraphs and words)',
  '-----------------------------------------------------------------',
  ...FILES.flatMap(([f]) => [`  ${f}`, ...wrote.get(f).flatMap((l) =>
    wrap(l.trim(), '    '))]),
  '',
  'Questions',
  '---------',
  ...wrap('Each has a stable id, the file(s) it is asked of, the ' +
    'steps in Word, the question as recorded while !Letters was built, ' +
    'and what !Letters does now (to compare with Word). They come by ' +
    'prefix: PG (pages), HF (headers, footers and fields), CL ' +
    '(columns, line numbers, wrap, floating tables, views). PG ids are ' +
    'the spec\'s (PG1..PG11, PG14, PG24, PG35..PG39) with their ' +
    'sub-questions (PG1a ..) and PG40 (a page break as the last ' +
    'thing); HF1..HF11 are the spec\'s PG12, PG13 and PG15..PG23, ' +
    'CL1..CL10 its PG25..PG34 (each printed with its spec id), CL11 ' +
    'and CL12 the owner\'s ruling on floating tables (R5); PGX1.., ' +
    'HFX1.. and CLX1.. were recorded while Batch D was built and have ' +
    'no spec id. The hf files\' fields were worked out by !Letters at ' +
    '14:05 on 14 October 2026 (local time); "What !Letters wrote" ' +
    'lists, for each, the header and footer !Letters shows on every ' +
    'page and what each field holds, and for each cl file, page by ' +
    'page, where !Letters starts each column, where it places each ' +
    'float (inches from the page\'s top left corner), the lines beside ' +
    'it and the line numbers it shows.', ''),
  `${Q.length} questions, ${Q.filter((q) => !q[1]).length} with no file.`,
  '',
  ...Q.flatMap(([id, files, steps], k) => {
    const [q, say] = bel.get(id);
    const tag = first.has(id) ? '   [PRIORITY]' : '   [if time allows]';
    const on = `${id}${spec(id)}  ${files ? files.join(', ') :
      '(No file)'}${tag}`;
    const pre = id.slice(0, 2), head = k === 0 || Q[k - 1][0]
      .slice(0, 2) !== pre ? [{PG: 'PG: pages', HF: 'HF: headers, ' +
        'footers and fields', CL: 'CL: columns, line numbers, wrap, ' +
        'floating tables, views'}[pre], ''] : [];
    return [...head, ...(on.length <= 72 ? [on] : [id + spec(id) + tag,
      ...wrap('Files: ' + files.join(', '), '    ')]),
      ...wrap('Steps in Word: ' + steps + (/[.?]$/.test(steps) ? '' :
        '.'), '    '),
      ...wrap('Question: ' + q, '    '),
      ...wrap('!Letters: ' + say, '    '), ''];
  }),
];
const text = latin(README.join('\n')) + '\n';
console.log('pg-README.txt: ' + put('pg-README.txt',
  new TextEncoder().encode(text)));
console.log(`${FILES.length} files, ${Q.length} questions`);
