// .doc import cross-checked against real tools (task 16, as
// ./odtcross.test.mjs for ODT): LibreOffice made a .doc of each .docx
// in the corpus (tools/moreapps-convert.mjs: corpus/converted/doc/
// <source>/<path>.doc) and real Word saved a few
// (word-check-out/doc-from-word; all optional, git-ignored: the test
// skips when they are absent). Each .doc read by readDoc is compared
// with readDocx of its source (./doc-corpus.mjs docStats): the body's
// text (white space collapsed, as a multiset of words: ./odt-corpus.mjs
// ratio), its paragraph, table, list paragraph, comment, footnote and
// endnote counts, and the notes' and comments' text. This is the
// overall text-level check; the property-by-property comparisons are
// the earlier tasks' (docprops, doctables, docparts, docreview,
// docword). The differences are printed with a class; what each class
// is (LibreOffice's conversion, the .docx reader's model, a limit of
// ours) is in the task 16 findings. Asserted: every twin reads without
// a throw other than an ImportError; the text equality ratio is at
// least 0.97 for every Word-saved file and the documents in PICKED.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readDoc} from '../../tools/moreapps/!Letters/DocRead';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {ratio} from './odt-corpus.mjs';
import {docTwins, docStats} from './doc-corpus.mjs';

const TWINS = docTwins();
const SKIP = TWINS.length ? false : 'no .doc twins (optional, ' +
  'git-ignored: run node tools/moreapps-convert.mjs)';

const O = 'open-xml-sdk/v2FxTestFiles/';
/** The documents whose text must match, each for what it holds (all
 *  read to the same words as their source when they were picked;
 *  none with text boxes, which are not read): long documents with
 *  tables, lists and notes, many comments and replies, comments in
 *  table cells, headers, footnotes and endnotes, tracked changes,
 *  bookmarks and links, numbering, other scripts, the biggest
 *  document, and the files real Word saved (by Word, see below). */
const PICKED = new Map([
  [O + 'wordprocessing/footer & header/BackgroundReport - THE WORKING ' +
    'GROUP ON INTERNET GOVERNANCE.docx',
  '1922 paragraphs, 5 tables, 323 numbered, 54 notes, 30 headers'],
  [O + 'wordprocessing/hyperlink/632399964516872542 1.docx',
    '2630 paragraphs, 11 tables, links'],
  ['open-xml-sdk/O15Conformance/WD/CommentExTest/Comments-Sample-15-12-' +
    '01/Comment033.docx', '136 comments, ranges and replies'],
  [O + 'ForTestCase/comment.docx', 'comments with tables and lists'],
  [O + 'ForTestCase/footnote.docx', 'footnotes'],
  [O + 'ForTestCase/header.docx', 'headers, numbered lists, comments'],
  [O + 'wordprocessing/footnote & endnote/endnote.docx', 'endnotes'],
  [O + 'wordprocessing/table/TableComments/cellWithComment.docx',
    'comments in table cells'],
  [O + 'wordprocessing/table/TableFntEdnt/TableFntEdnt.docx',
    'notes in table cells'],
  [O + 'wordprocessing/bookmark/bookmark.docx',
    'bookmarks, fields in links, 64 numbered paragraphs'],
  [O + 'wordprocessing/table/2007.docx', 'nine tables'],
  ['open-xml-sdk/test/DocumentFormat.OpenXml.Tests.Assets/assets/' +
    'TestFiles/complex0.docx', '19 sections, tables, 208 bookmarks'],
  [O + 'wordprocessing/bullet/bullet-complex.docx', '80 bullets'],
  [O + 'wordprocessing/numbering/numbering-list.docx', 'numbered lists'],
  [O + 'wordprocessing/mixed languages/Unit1Translation.docx',
    'other scripts'],
  ['libreoffice/docbookexport/data/tdf91095.docx', 'ten tables, lists'],
  ['poi/bug56075-changeTracking_on.docx', 'tracked changes'],
  ['poi/form_footnotes.docx', 'form fields and footnotes'],
  ['poi/bug65649.docx', '16,075 paragraphs, 13,000 table cells'],
  ['poi/bug59058.docx', '317 links'],
]);

/** The class of a difference, from the reader's notes, the counts
 *  and the words (the findings say what each is). */
function classOf(a, b, notes, only) {
  const n = notes.join('\n');
  const out = [];
  if (/text boxes are not read/.test(n)) out.push('text boxes');
  if (/floating pictures/.test(n) && a.text !== b.text) {
    out.push('drawings');
  }
  if (/form fields/.test(n)) out.push('form fields');
  if (/ruby/.test(n)) out.push('ruby');
  if (/field code without its end/.test(n)) out.push('open field');
  if (/deleted pictures, links/.test(n)) out.push('deleted link');
  // (a date or time LibreOffice or Word updated when it saved)
  if (only.some((w) => /^\d+[/.:时-]\d+/.test(w))) out.push('dates');
  if (a.text === b.text && a.paras !== b.paras) out.push('paragraphs');
  if (a.lists !== b.lists) out.push('lists');
  if (a.comments !== b.comments) out.push('comments');
  if (a.tables !== b.tables) out.push('tables');
  if (a.footnotes !== b.footnotes) out.push('notes');
  return out.length ? out.join('+') : 'other';
}

/** The words of the .doc's text that the .docx's lacks. */
function extra(a, b) {
  const bag = new Map();
  for (const w of a.split(' ')) bag.set(w, (bag.get(w) || 0) + 1);
  const out = [];
  for (const w of b.split(' ').filter(Boolean)) {
    const k = bag.get(w);
    if (k) bag.set(w, k - 1);
    else out.push(w);
  }
  return out;
}

/** The notes' and comments' text, white space collapsed. */
function sideText(doc) {
  const out = [];
  for (const k of ['footnotes', 'endnotes']) {
    for (const x of doc.notes[k].values()) {
      if (x.type === 'normal') out.push(...x.blocks.map((p) => p.text));
    }
  }
  for (const c of doc.comments.map.values()) {
    out.push(...c.blocks.map((p) => p.text));
  }
  return out.join(' ').replace(/[￼​­-]/g, '')
    .replace(/\s+/g, ' ').trim();
}

describe('.doc twins made by LibreOffice and Word, against their ' +
  '.docx (task 16)', {skip: SKIP}, () => {
  it('read alike; the Word ones and the picked ones to the same text',
    async () => {
      const failures = [], classes = new Map(), by = {};
      for (const t of TWINS) {
        let a, b, notes, sa, sb;
        try {
          const x = await readDocx(new Uint8Array(fs.readFileSync(t.docx)));
          a = docStats(x);
          sa = sideText(x);
        } catch (e) {
          continue; // (a source the .docx reader refuses: no baseline)
        }
        try {
          const r = readDoc(new Uint8Array(fs.readFileSync(t.doc)));
          b = docStats(r.doc);
          sb = sideText(r.doc);
          notes = r.notes;
        } catch (e) {
          if (e.name !== 'ImportError') {
            failures.push(`${t.name}: ${e.name} ${e.message}`);
          }
          continue;
        }
        const s = by[t.who] ||= {n: 0, same: 0, sum: 0, alike: 0,
          side: 0};
        s.n++;
        const q = ratio(a.text, b.text);
        s.sum += q;
        if (q >= 0.97) s.alike++;
        if (ratio(sa, sb) >= 0.97) s.side++;
        const diff = ['paras', 'tables', 'lists', 'comments', 'footnotes',
          'endnotes'].filter((k) => a[k] !== b[k])
          .map((k) => `${k} ${a[k]}/${b[k]}`);
        if (a.text !== b.text) diff.push('text ' + q.toFixed(3));
        if (!diff.length) s.same++;
        else {
          const c = classOf(a, b, notes, extra(a.text, b.text));
          classes.set(c, (classes.get(c) || 0) + 1);
          console.log(`# differs [${c}] ${t.who} ${t.name}: ` +
            diff.join(', '));
        }
        if ((t.who === 'Word' || PICKED.has(t.name)) && q < 0.97) {
          failures.push(`${t.who} ${t.name} (${PICKED.get(t.name) ||
            'saved by Word'}): text ratio ${q.toFixed(3)}`);
        }
      }
      for (const [who, s] of Object.entries(by)) {
        console.log(`# doc twins (${who}): ${s.n} compared, ${s.same} ` +
          `alike, mean text ratio ${(s.sum / s.n).toFixed(3)}, ` +
          `${s.alike} at 0.97 or more, notes and comments text at ` +
          `0.97 or more ${s.side}`);
      }
      console.log('# doc twins classes: ' + [...classes].sort((p, q) =>
        q[1] - p[1]).map(([k, v]) => `${k} ${v}`).join(', '));
      const names = new Set(TWINS.map((t) => t.name));
      for (const p of PICKED.keys()) {
        if (!names.has(p)) console.log('# note: picked but absent: ' + p);
      }
      assert.deepEqual(failures, []);
      assert.ok(by.LibreOffice && by.LibreOffice.alike / by.LibreOffice.n
        > 0.9, JSON.stringify(by));
    });
});
