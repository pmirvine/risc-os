// ODT import cross-checked against real tools (task 9): LibreOffice
// made an .odt of each .docx in the corpus (tools/moreapps-convert.mjs:
// tests/moreapps/corpus/converted/odt/<source>/<path>.odt; optional,
// git-ignored: the test skips when they are absent). Each twin read
// by readOdt is compared with readDocx of its source (./odt-corpus.mjs
// statsOf): paragraph, table, list paragraph and comment counts and
// the body's text (white space collapsed). The differences are
// printed with a class; what each class is (LibreOffice's
// conversion, the .docx reader's model, a limit of ours) is in the
// task 9 findings. Asserted: every twin reads without a throw, and
// the text equality ratio (./odt-corpus.mjs ratio) is at least 0.98
// for the documents in PICKED.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readOdt} from '../../tools/moreapps/!Letters/OdtRead';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {twins, statsOf, ratio} from './odt-corpus.mjs';

const TWINS = twins();
const SKIP = TWINS.length ? false : 'no LibreOffice-made .odt twins ' +
  '(optional, git-ignored: run node tools/moreapps-convert.mjs)';

/** The documents whose text must match, each for what it holds (all
 *  read to the same words as their source when they were picked):
 *  long documents with tables and lists, many comments, comments in
 *  table cells, text boxes, headers, footnotes and endnotes, tracked
 *  changes (with a link in deleted text), bookmarks, numbering, CJK
 *  and other scripts. */
const PICKED = new Map([
  ['open-xml-sdk/v2FxTestFiles/wordprocessing/footer & header/' +
    'BackgroundReport - THE WORKING GROUP ON INTERNET GOVERNANCE.docx',
    '1900 paragraphs, 5 tables, 323 numbered'],
  ['open-xml-sdk/v2FxTestFiles/wordprocessing/hyperlink/' +
    '632399964516872542 1.docx',
    '2600 paragraphs, 11 tables, links'],
  ['open-xml-sdk/O15Conformance/WD/CommentExTest/Comments-Sample-15-12-' +
    '01/Comment033.docx',
    '136 comments, ranges and replies'],
  ['open-xml-sdk/v2FxTestFiles/ForTestCase/comment.docx',
    'comments with tables and lists'],
  ['open-xml-sdk/v2FxTestFiles/ForTestCase/footnote.docx',
    'footnotes'],
  ['open-xml-sdk/v2FxTestFiles/ForTestCase/header.docx',
    'headers, numbered lists and comments'],
  ['open-xml-sdk/v2FxTestFiles/wordprocessing/footnote & endnote/' +
    'endnote.docx',
    'endnotes'],
  ['open-xml-sdk/v2FxTestFiles/wordprocessing/table/TableComments/' +
    'cellWithComment.docx',
    'comments in table cells'],
  ['open-xml-sdk/v2FxTestFiles/wordprocessing/bookmark/bookmark.docx',
    'bookmarks, 64 numbered paragraphs'],
  ['open-xml-sdk/v2FxTestFiles/wordprocessing/complexDocx/' +
    'complexity.docx',
    'text boxes, a table, lists'],
  ['open-xml-sdk/v2FxTestFiles/wordprocessing/table/2007.docx',
    'nine tables and text boxes'],
  ['open-xml-sdk/test/DocumentFormat.OpenXml.Tests.Assets/assets/' +
    'TestFiles/complex0.docx',
    'text boxes, tables, comments'],
  ['open-xml-sdk/v2FxTestFiles/wordprocessing/bullet/' +
    'bullet-complex.docx',
    '80 bulleted paragraphs'],
  ['open-xml-sdk/v2FxTestFiles/wordprocessing/numbering/' +
    'numbering-list.docx',
    'numbered lists'],
  ['open-xml-sdk/v2FxTestFiles/wordprocessing/mixed languages/' +
    'Unit1Translation.docx',
    'other scripts'],
  ['libreoffice/docbookexport/data/tdf91095.docx',
    'ten tables, lists'],
  ['poi/delins.docx',
    'tracked insertions and deletions, a link deleted'],
  ['poi/bug56075-changeTracking_on.docx',
    'tracked changes'],
  ['poi/form_footnotes.docx',
    'form fields and footnotes'],
]);

/** The class of a difference, from the reader's notes and the
 *  counts (the findings say what each is). */
function classOf(a, b, notes) {
  const n = notes.join('\n');
  const out = [];
  if (/text boxes and drawing shapes/.test(n)) out.push('text boxes');
  if (/embedded objects/.test(n)) out.push('objects');
  if (/ruby/.test(n)) out.push('ruby');
  if (/index or table of contents/.test(n)) out.push('index');
  if (a.text === b.text && a.paras > b.paras) out.push('paragraphs');
  if (a.lists !== b.lists) out.push('lists');
  if (a.comments !== b.comments) out.push('comments');
  if (a.tables !== b.tables) out.push('tables');
  return out.length ? out.join('+') : 'other';
}

describe('ODT twins made by LibreOffice, against their .docx', {skip:
  SKIP}, () => {
  it('read alike; the picked ones to the same text', async () => {
    const failures = [], classes = new Map();
    let same = 0, n = 0;
    for (const t of TWINS) {
      let a, b, notes;
      try {
        a = statsOf(await readDocx(new Uint8Array(fs.readFileSync(
          t.docx))));
      } catch (e) {
        continue; // (a source the .docx reader refuses: no baseline)
      }
      try {
        const r = await readOdt(new Uint8Array(fs.readFileSync(t.odt)));
        b = statsOf(r.doc);
        notes = r.notes;
      } catch (e) {
        failures.push(`${t.name}: ${e.name} ${e.message}`);
        continue;
      }
      n++;
      const q = ratio(a.text, b.text);
      const diff = ['paras', 'tables', 'lists', 'comments'].filter((k) =>
        a[k] !== b[k]).map((k) => `${k} ${a[k]}/${b[k]}`);
      if (a.text !== b.text) diff.push('text ' + q.toFixed(3));
      if (!diff.length) same++;
      else {
        const c = classOf(a, b, notes);
        classes.set(c, (classes.get(c) || 0) + 1);
        console.log(`# differs [${c}] ${t.name}: ${diff.join(', ')}`);
      }
      if (PICKED.has(t.name) && q < 0.98) {
        failures.push(`${t.name} (${PICKED.get(t.name)}): text ratio ` +
          q.toFixed(3));
      }
    }
    console.log(`# twins: ${n} compared, ${same} alike; classes: ` +
      [...classes].sort((p, q) => q[1] - p[1]).map(([k, v]) =>
        `${k} ${v}`).join(', '));
    const names = new Set(TWINS.map((t) => t.name));
    for (const p of PICKED.keys()) {
      if (!names.has(p)) console.log('# note: picked but absent: ' + p);
    }
    assert.deepEqual(failures, []);
  });
});
