// Generates the real-Word hand-off files for lists, borders, shading
// and tab stops pasted from one !Word document into another (question
// L6; local only, never committed: tests/moreapps/corpus/ is
// git-ignored). Not a test:
//
//   node tests/moreapps/handoff-cliplists.mjs
//
// Writes into tests/moreapps/corpus/handoff/ (made if missing):
//   cl-1-source.docx    the document to copy FROM, in Word and in
//                       !Word: a multilevel list, its restarted twin
//                       (at 5), a bordered, shaded paragraph with tab
//                       stops, a bullet list
//   cl-2-pasted.docx    a new !Word document: all of cl-1 pasted; then
//                       a list of its own with cl-1's first items
//                       pasted after it
//   cl-2c-last-item-text.docx  "One" to the end of "Two"'s text
//                       pasted (the last item without its mark)
//   cl-3-strict.docx    a Strict document (as Word saves "Strict Open
//                       XML") with all of cl-1 pasted
//   cl-README.txt       the steps in Word, what !Word did, the questions
// The pastes are !Word's own (./ClipSlice, ./ClipStore, ./ClipPick,
// ./ClipPaste, as ./EditClip runs them); each file is read back and
// every paragraph listed with its label. A file is written only when
// its bytes change; nothing else in the folder is touched.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {Document} from '../../tools/moreapps/!Word/Document';
import * as S from '../../tools/moreapps/!Word/Selection';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {lintPackage} from './lint-package.mjs';
import {p, r} from './build-docx.mjs';
import {item} from './list-fixtures.mjs';
import {sourceDocx, strictDocx, open, copyPaste, labelTexts}
  from './clip-lists-docs.mjs';
import {rng} from './word-docs.mjs';
import {mk} from './edit-docs.mjs';

// (new lists get random nsids: seeded, so a re-run writes the same)
Math.random = rng(20261010);

const OUT = fileURLToPath(new URL('./corpus/handoff/', import.meta.url));
const DATE = new Date(Date.UTC(2026, 9, 10, 12));
fs.mkdirSync(OUT, {recursive: true});

/** Write bytes to name unless the file already holds them. */
function put(name, bytes) {
  const f = path.join(OUT, name);
  const b = Buffer.from(bytes);
  if (fs.existsSync(f) && fs.readFileSync(f).equals(b)) return 'same';
  fs.writeFileSync(f, b);
  return 'written';
}

const all = (d) => d.doc.sections.flatMap((s) => s.blocks);
const sel = (d, a, oa, b, ob) => S.select({id: all(d)[a].id, off: oa},
  {id: all(d)[b].id, off: ob});
const at = (d, k) => S.caret({id: all(d)[k].id, off: 0});

/** Save d; read it back; its paragraphs with labels, for the README. */
async function save(name, d) {
  const bytes = await writeDocx(d.doc, {date: DATE});
  const errs = lintPackage(await readZip(bytes)).problems
    .filter((q) => q.level === 'error');
  if (errs.length) throw new Error(name + ': ' + JSON.stringify(errs));
  const back = new Document(await readDocx(bytes));
  const labs = labelTexts(back);
  console.log(name + ': ' + put(name, bytes));
  return all(back).map((b, k) => b.type === 'p' ? '    ' +
    (labs[k] === null ? '   ' : JSON.stringify(labs[k]).padEnd(6)) +
    ' ' + JSON.stringify(b.text.replace(/\t/g, '<tab>')) +
    (b.pPr.numPr ? ' (list ' + b.pPr.numPr.numId + ', level ' +
      (b.pPr.numPr.ilvl ?? 0) + ')' : '') +
    (b.pPr.pBdr ? ' borders' : '') + (b.pPr.shd ? ' shading' : '') +
    (b.pPr.tabs ? ' tab stops' : '') : '    [table]');
}

const srcBytes = await sourceDocx();
console.log('cl-1-source.docx: ' + put('cl-1-source.docx', srcBytes));
const src = await open(srcBytes);
const n = all(src).length;

const d2 = mk(['', '']);
copyPaste(src, sel(src, 0, 0, n - 1, 0), d2, at(d2, 0));
const own = all(d2).length;
const tgt = await open(await sourceDocx({paras: [item('Own one', 2),
  item('Own two', 2), p(r('')), p(r('End'))]}));
const listed2 = await save('cl-2-pasted.docx', d2);
copyPaste(src, sel(src, 0, 0, 3, 0), tgt, at(tgt, 2));
const listed2b = await save('cl-2b-next-to-a-list.docx', tgt);

// the last item selected up to the end of its text only
const d2c = mk(['']);
copyPaste(src, sel(src, 0, 0, 2, all(src)[2].text.length), d2c,
  at(d2c, 0));
const listed2c = await save('cl-2c-last-item-text.docx', d2c);

const d3 = await open(await strictDocx(p('')));
copyPaste(src, sel(src, 0, 0, n - 1, 0), d3, at(d3, 0));
const listed3 = await save('cl-3-strict.docx', d3);

const README = [
  'Lists, borders, shading and tab stops pasted between documents',
  '(!Word question L6; the owner ruled: keep them, as Word does)',
  '',
  'Files (made by node tests/moreapps/handoff-cliplists.mjs):',
  '  cl-1-source.docx   the document to copy FROM',
  '  cl-2-pasted.docx   !Word: all of cl-1 pasted into a new document',
  '                     (' + own + ' paragraphs)',
  '  cl-2b-next-to-a-list.docx  !Word: a list of its own ("Own one",',
  '                     "Own two"), cl-1\'s first three items pasted',
  '                     after it',
  '  cl-2c-last-item-text.docx  !Word: "One" to the end of "Two"\'s',
  '                     text (not its paragraph mark) pasted',
  '  cl-3-strict.docx   !Word: all of cl-1 pasted into a Strict document',
  '',
  'Steps in Word:',
  '  1. Open cl-1-source.docx. Select from "One" to the start of',
  '     "After the lists" and copy (Ctrl-C).',
  '  2. Make a new blank document and paste (Ctrl-V, Keep Source',
  '     Formatting, the default). Compare with cl-2-pasted.docx.',
  '  3. Make a document with a numbered list "Own one", "Own two" and',
  '     an empty paragraph after it; copy "One" to the start of "Five"',
  '     from cl-1 and paste into the empty paragraph. Compare with',
  '     cl-2b-next-to-a-list.docx.',
  '  4. Open cl-2-pasted.docx, cl-2b and cl-3-strict.docx: any repair',
  '     prompt? Are the numbers, bullets, borders, shading and tab',
  '     stops as in cl-1?',
  '',
  'What !Word shows (label, text, list, formatting) after reading',
  'each file back:',
  '  cl-2-pasted.docx', ...listed2,
  '  cl-2b-next-to-a-list.docx', ...listed2b,
  '  cl-2c-last-item-text.docx', ...listed2c,
  '  cl-3-strict.docx', ...listed3,
  '',
  'Questions:',
  '  L6-1 Do cl-2, cl-2b and cl-3 open without a repair prompt?',
  '  L6-2 cl-2: are the labels those of cl-1 (1. a. 2. 5. 6., the',
  '       bullets)? Word gives the pasted items new list definitions',
  '       too (a new w:abstractNum, new w:nsid)?',
  '  L6-3 cl-2b: !Word starts a NEW list (1. a. 2.) after "Own two".',
  '       Does Word (step 3) carry on the target list (3. 4.) or',
  '       start a new one?',
  '  L6-4 Items copied from the middle of a list ("Two" alone with',
  '       its paragraph mark): !Word numbers them from the list\'s',
  '       start (1.). Does Word keep 2.?',
  '  L6-5 The bordered paragraph: same borders (top single, left',
  '       double red), yellow shading, the two tab stops (left at 2",',
  '       right with dots at 6"), indents and right alignment?',
  '  L6-6 cl-3 (Strict): w:ind w:start, lvlJc start, w:jc end, tab',
  '       stops start / end, pBdr w:start: shown right in Word? Other',
  '       values are copied as written (Transitional-only ones such',
  '       as w:w 150 or on/off may be among them): any repair prompt?',
  '  L6-7 cl-2c: in Word copy "One" to the end of "Two"\'s text (not',
  '       its paragraph mark) and paste into a new document: is "Two"',
  '       a list item there? !Word: no (it takes the target',
  '       paragraph\'s properties; only whole paragraphs bring theirs).',
];
console.log('cl-README.txt: ' + put('cl-README.txt',
  new TextEncoder().encode(README.join('\n') + '\n')));
