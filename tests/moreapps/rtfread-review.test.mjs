// RtfRead (Batch G2, task 6): footnotes, endnotes, comments and
// tracked changes. Fixture: tests/moreapps/rtf-fixtures/
// 19-spec-word-review.rtf (SPEC-DERIVED, see its README) and small
// strings. Every Doc read here must write as .docx and read back
// equal (docx-compare's assertSameDoc after expectedBack and
// withNewReview: the notes and comments parts made in memory).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {readRtf} from '../../tools/moreapps/!Letters/RtfRead';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkBlock, OBJ} from '../../tools/moreapps/!Letters/Model';
import {checkNotes, checkComments}
  from '../../tools/moreapps/!Letters/ModelCheck';
import {read as noteOpts} from '../../tools/moreapps/!Letters/NoteOpts';
import {dttm, cleanName, MAX_AUTHORS, MAX_NAME, MAX_REVS}
  from '../../tools/moreapps/!Letters/RtfRevs';
import {MAX_COMMENTS} from '../../tools/moreapps/!Letters/RtfComments';
import {MAX_NOTES} from '../../tools/moreapps/!Letters/RtfNotes';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {assertSameDoc, expectedBack, withNewParts, withNewStories,
  withNewReview} from './docx-compare.mjs';
import {lintPackage} from './lint-package.mjs';
import {emit} from './word-emit.mjs';

const DIR = fileURLToPath(new URL('./rtf-fixtures/', import.meta.url));
const FIX = '19-spec-word-review.rtf';
const DATE = new Date(2024, 4, 6, 7, 8, 10);
const enc = (s) => Uint8Array.from(Buffer.from(s, 'latin1'));
const R = (s, o = {}) => readRtf(enc(s), {date: DATE, ...o});
const fixture = () => readRtf(new Uint8Array(fs.readFileSync(DIR + FIX)),
  {date: DATE});
const blocks = (doc) => doc.sections.flatMap((s) => s.blocks);
const marksOf = (p) => Object.entries(p.inlines).map(([k, x]) =>
  [Number(k), x.kind, x.id]);
const normal = (m) => [...m.values()].filter((n) => n.type === 'normal');
const runAt = (p, k) => p.runs.find((r) => r.start <= k && k < r.end);
const runOf = (p, s) => runAt(p, p.text.indexOf(s));
const TBL = '{\\*\\revtbl {Unknown;}{Alice Author;}{Bob Builder;}}';
const doc0 = (body, head = '') => '{\\rtf1\\ansi\\deff0{\\fonttbl' +
  '{\\f0 Times;}}' + head + body + '}';

function valid(doc) {
  for (const b of blocks(doc)) checkBlock(b);
  for (const st of doc.stories.values()) {
    for (const b of st.blocks) checkBlock(b);
  }
  checkNotes(doc.notes);
  checkComments(doc.comments);
}

async function roundTrips(doc, what) {
  valid(doc);
  const bytes = await writeDocx(doc, {date: DATE});
  emit('rtf-review-' + what, bytes);
  const errors = lintPackage(await readZip(bytes)).problems
    .filter((q) => q.level === 'error');
  assert.deepEqual(errors, [], what);
  const back = await readDocx(bytes);
  assertSameDoc(back, withNewReview(withNewStories(withNewParts(
    expectedBack(doc), back), back), back), what);
  return back;
}

describe('RtfRead: footnotes and endnotes', () => {
  it('reads one footnote and one endnote with their marks', () => {
    const {doc, notes} = fixture();
    assert.deepEqual(notes, []);
    const p = blocks(doc)[0];
    assert.equal(p.text, 'Body text' + OBJ + ' and more' + OBJ + '.');
    const [a, b] = [p.inlines[9], p.inlines[19]];
    assert.deepEqual(a, {kind: 'noteRef', note: 'footnote', id: 1,
      level: 'r', node: {name: 'w:footnoteReference',
        attrs: [['w:id', '1']], children: []}});
    assert.equal(b.note, 'endnote');
    assert.equal(b.id, 1);
    assert.equal(b.node.name, 'w:endnoteReference');
    // the mark has the format of the text at its \chftn
    // (its \\super is the character style's own)
    const r = runAt(p, 9);
    assert.equal(doc.styles.styles.get(r.rStyle).rPr.vertAlign,
      'superscript');
    const [fn] = normal(doc.notes.footnotes);
    const [en] = normal(doc.notes.endnotes);
    assert.equal(fn.id, 1);
    assert.equal(fn.blocks[0].text, OBJ + ' A footnote.');
    assert.deepEqual(fn.blocks[0].inlines[0], {kind: 'noteRef',
      note: 'footnote', id: null, self: true, level: 'r',
      node: {name: 'w:footnoteRef', attrs: [], children: []}});
    assert.equal(en.blocks[0].text, OBJ + ' An endnote.');
    assert.equal(en.blocks[0].inlines[0].node.name, 'w:endnoteRef');
    // Word's separators, as a command makes the part
    assert.deepEqual([...doc.notes.footnotes.keys()], [-1, 0, 1]);
    assert.equal(doc.meta.noteParts.footnotes, 'word/footnotes.xml');
    assert.equal(doc.meta.noteParts.endnotes, 'word/endnotes.xml');
  });

  it('reads the note settings', () => {
    const o = noteOpts(fixture().doc);
    assert.deepEqual(o.footnotes, {pos: 'pageBottom', numFmt: 'decimal',
      numStart: 1, numRestart: 'continuous'});
    assert.deepEqual(o.endnotes, {pos: 'docEnd', numFmt: 'lowerRoman',
      numStart: 1, numRestart: 'continuous'});
    const x = noteOpts(R(doc0('\\pard A\\par', '\\ftntj\\ftnnauc' +
      '\\ftnstart5\\ftnrstpg\\aendnotes\\aftnnchi\\aftnrestart')).doc);
    assert.deepEqual(x.footnotes, {pos: 'beneathText',
      numFmt: 'upperLetter', numStart: 5, numRestart: 'eachPage'});
    assert.deepEqual(x.endnotes, {pos: 'sectEnd', numFmt: 'chicago',
      numStart: 1, numRestart: 'eachSect'});
  });

  it('\\fet1 makes every note an endnote; ids count a kind', () => {
    const {doc} = R(doc0('\\pard A{\\footnote \\pard x\\par}B' +
      '{\\footnote \\pard y\\par}\\par', '\\fet1'));
    assert.deepEqual(normal(doc.notes.endnotes).map((n) => n.id), [1, 2]);
    assert.equal(doc.notes.footnotes.size, 0);
    assert.deepEqual(marksOf(blocks(doc)[0]), [[1, 'noteRef', 1],
      [3, 'noteRef', 2]]);
  });

  it('a note without \\chftn gets its number mark first', () => {
    const {doc} = R(doc0('\\pard A{\\footnote \\pard Text\\par}\\par'));
    const [n] = normal(doc.notes.footnotes);
    assert.equal(n.blocks[0].text, OBJ + 'Text');
    assert.equal(n.blocks[0].inlines[0].self, true);
  });

  it('a note in a header or a note is skipped, with a note', () => {
    const {doc, notes} = R(doc0('{\\header \\pard H{\\footnote \\pard ' +
      'x\\par}\\par}\\pard A{\\footnote \\pard B{\\footnote \\pard z' +
      '\\par}\\par}\\par'));
    assert.equal(normal(doc.notes.footnotes).length, 1);
    assert.equal(normal(doc.notes.footnotes)[0].blocks[0].text,
      OBJ + 'B');
    assert.ok(notes.some((n) => n.startsWith('notes in headers')));
    valid(doc);
  });

  it(`more than ${MAX_NOTES} notes a kind: the rest are skipped`, () => {
    const many = R(doc0('\\pard ' + 'x{\\footnote \\pard n\\par}'
      .repeat(MAX_NOTES + 2) + '\\par'));
    assert.equal(normal(many.doc.notes.footnotes).length, MAX_NOTES);
    assert.equal(Object.keys(blocks(many.doc)[0].inlines).length,
      MAX_NOTES);
    assert.ok(many.notes.some((n) => n.startsWith('more than ' +
      MAX_NOTES + ' footnotes')));
    valid(many.doc);
  });

  it('a link in a footnote is related from the notes part', async () => {
    const {doc} = R(doc0('\\pard A{\\footnote \\pard {\\field{\\*' +
      '\\fldinst HYPERLINK "https://example.com/"}{\\fldrslt site}}' +
      '\\par}\\par'));
    const [n] = normal(doc.notes.footnotes);
    assert.equal(n.rels.length, 1);
    assert.equal(n.rels[0].target, 'https://example.com/');
    assert.equal(doc.notes.footnotes.get(-1).rels, n.rels);
    assert.ok(!doc.rels.some((r) => r.target === 'https://example.com/'));
    await roundTrips(doc, 'note-link');
  });
});

describe('RtfRead: comments', () => {
  it('reads two comments and a reply with authors, initials, ' +
    'dates', () => {
    const {doc} = fixture();
    const cs = [...doc.comments.map.values()];
    assert.deepEqual(cs.map((c) => [c.id, c.author, c.initials, c.date,
      c.parent, c.done]), [
      [0, 'Alice Author', 'AA', '2024-05-06T07:08:00Z', null, false],
      [1, 'Bob Builder', 'BB', '2025-12-31T23:59:00Z', null, false],
      [2, 'Alice Author', 'AA', '2024-05-06T07:09:00Z', 1, false]]);
    assert.deepEqual(cs.map((c) => c.blocks.map((b) => b.text)),
      [[OBJ + 'First comment.'], [OBJ + 'Second comment.'],
        [OBJ + 'A reply.']]);
    assert.equal(cs[0].blocks[0].inlines[0].node.name,
      'w:annotationRef');
    // a paraId each, distinct, on the comment's last paragraph
    const ids = cs.map((c) => c.paraId);
    assert.equal(new Set(ids).size, 3);
    assert.deepEqual(cs[2].blocks[0].extraP, [['w14:paraId', ids[2]]]);
    assert.equal(doc.meta.commentParts.comments, 'word/comments.xml');
    assert.equal(doc.meta.commentParts.extended,
      'word/commentsExtended.xml');
    // the same file reads the same
    assert.deepEqual(ids, [...fixture().doc.comments.map.values()]
      .map((c) => c.paraId));
  });

  it('a comment whose range crosses runs, and one across ' +
    'paragraphs', () => {
    const {doc} = fixture();
    const [, p1, p2] = blocks(doc);
    assert.deepEqual(marksOf(p1), [[0, 'cmtStart', 0], [21, 'cmtEnd', 0],
      [22, 'cmtRef', 0], [29, 'cmtStart', 1]]);
    assert.equal(p1.text.slice(1, 21), 'Commented bold words');
    // the range holds three runs: plain, bold, plain
    assert.equal(runOf(p1, 'bold').rPr.b, true);
    assert.notEqual(runOf(p1, 'Commented'), runOf(p1, 'bold'));
    assert.deepEqual(marksOf(p2), [[18, 'cmtEnd', 1], [19, 'cmtRef', 1],
      [20, 'cmtRef', 2]]);
    assert.equal(runAt(p1, 22).rStyle, runAt(p2, 19).rStyle);
    assert.ok(runAt(p1, 22).rStyle);
  });

  it('comment ids are unique, even for a repeated tag', () => {
    const c = (tag, t) => '{\\*\\atrfstart ' + tag + '}' + t +
      '{\\*\\atrfend ' + tag + '}{\\*\\atnauthor A}\\chatn{\\*' +
      '\\annotation {\\*\\atnref ' + tag + '}\\pard n\\par}';
    const {doc} = R(doc0('\\pard ' + c(5, 'a') + c(5, 'b') + c(7, 'c') +
      '{\\*\\annotation \\pard point\\par}\\par'));
    const ids = [...doc.comments.map.keys()];
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids.length, 4);
    const p = blocks(doc)[0];
    // the repeated tag's second range is not read: its comment is a
    // point comment (a reference only)
    const refs = marksOf(p).filter(([, k]) => k === 'cmtRef')
      .map(([, , id]) => id);
    assert.deepEqual(refs.sort(), ids.slice().sort());
    valid(doc);
  });

  it('unmatched \\atrfstart and \\atrfend are tolerated', async () => {
    const {doc} = R(doc0('\\pard {\\*\\atrfend 9}A{\\*\\atrfstart 1}' +
      'B{\\*\\atrfend 1}C{\\*\\atrfstart 2}D{\\*\\atnauthor X}\\chatn' +
      '{\\*\\annotation {\\*\\atnref 2}\\pard n\\par}E\\par'));
    const p = blocks(doc)[0];
    // 1 never had a comment: its marks are gone; 2 ends at its mark
    assert.equal(p.text, 'ABC' + OBJ + 'D' + OBJ + OBJ + 'E');
    assert.deepEqual(marksOf(p), [[3, 'cmtStart', 1], [5, 'cmtEnd', 1],
      [6, 'cmtRef', 1]]);
    assert.deepEqual([...doc.comments.map.keys()], [1]);
    await roundTrips(doc, 'unmatched');
  });

  it('a reply to a reply has the thread\'s first comment as ' +
    'parent; a cycle or a missing parent is top level', () => {
    const a = (ref, parent) => '{\\*\\atnauthor A}\\chatn{\\*' +
      '\\annotation {\\*\\atnref ' + ref + '}' + (parent === undefined
      ? '' : '{\\*\\atnparent ' + parent + '}') + '\\pard t\\par}';
    const {doc} = R(doc0('\\pard x' + a(1) + a(2, 1) + a(3, 2) + a(4, 9) +
      a(5, 6) + a(6, 5) + a(7, 7) + '\\par'));
    assert.deepEqual([...doc.comments.map.values()].map((c) => c.parent),
      [null, 0, 0, null, null, null, null]);
    valid(doc);
  });

  it('a comment in a note or header is skipped, with a note', () => {
    const {doc, notes} = R(doc0('\\pard A{\\footnote \\pard {\\*' +
      '\\atrfstart 1}B{\\*\\atrfend 1}\\chatn{\\*\\annotation \\pard ' +
      'c\\par}\\par}\\par'));
    assert.equal(doc.comments.map.size, 0);
    assert.ok(notes.some((n) => n.startsWith('comments in headers')));
    assert.equal(normal(doc.notes.footnotes)[0].blocks[0].text, OBJ + 'B');
  });

  it('a comment inside a deleted run keeps its text', () => {
    const {doc, notes} = R(doc0('\\pard a \\deleted {\\*\\atnid X}' +
      '{\\*\\atnauthor Y}\\chatn{\\*\\annotation {\\*\\atnref 1}' +
      '\\pard hi\\par}gone\\deleted0  ok\\par'));
    const [c] = [...doc.comments.map.values()];
    assert.deepEqual([c.author, c.initials], ['Y', 'X']);
    assert.equal(c.blocks[0].text, OBJ + 'hi');
    assert.equal(c.blocks[0].runs.some((r) => r.rev), false);
    const p = blocks(doc)[0];
    assert.equal(runOf(p, 'gone').rev.kind, 'del');
    assert.equal(runOf(p, 'ok').rev, undefined);
    assert.ok(!notes.some((n) => n.startsWith('tracked changes in')));
    // and a note inside an insertion: its text untracked, quietly
    const n = R(doc0('\\pard {\\revised x{\\footnote \\pard ' +
      'in\\par}}\\par'));
    assert.equal(normal(n.doc.notes.footnotes)[0].blocks[0].text,
      OBJ + 'in');
    assert.deepEqual(n.notes, []);
  });

  it('a stale \\atnid or \\atnauthor does not reach a later ' +
    'comment; a note where no mark can go is ignored', () => {
    const {doc} = R(doc0('\\pard {\\*\\atnid OLD}{\\*\\atnauthor ' +
      'Old}x\\par\\pard y\\chatn{\\*\\annotation \\pard c\\par}' +
      '{\\field{\\*\\fldinst PAGE{\\footnote \\pard z\\par}}' +
      '{\\fldrslt 1}}\\par'));
    const [c] = [...doc.comments.map.values()];
    assert.deepEqual([c.author, c.initials], ['', '']);
    assert.equal(normal(doc.notes.footnotes).length, 0);
    valid(doc);
  });

  it('authors and dates are cleaned', () => {
    const long = 'x'.repeat(400);
    const {doc} = R(doc0('\\pard {\\*\\atnid  I\tJ }{\\*\\atnauthor ' +
      long + '}\\chatn{\\*\\annotation {\\*\\atndate 2000000000}\\pard ' +
      'n\\par}{\\*\\atnauthor \\u-10240?Z}\\chatn{\\*\\annotation ' +
      '{\\*\\atndate 12x}\\pard m\\par}\\par'));
    const [c0, c1] = [...doc.comments.map.values()];
    assert.equal(c0.author.length, MAX_NAME);
    assert.equal(c0.initials, 'I J');
    assert.equal(c0.date, null);
    assert.equal(c1.author, '\ufffdZ');
    assert.equal(c1.date, null);
  });

  it(`more than ${MAX_COMMENTS} comments: the rest are skipped`, () => {
    const one = '\\chatn{\\*\\annotation \\pard c\\par}';
    const {doc, notes} = R(doc0('\\pard ' + one.repeat(MAX_COMMENTS + 2) +
      '\\par'));
    assert.equal(doc.comments.map.size, MAX_COMMENTS);
    assert.ok(notes.some((n) => n.startsWith('more than ' +
      MAX_COMMENTS + ' comments')));
    valid(doc);
  });
});

describe('RtfRead: tracked changes', () => {
  it('an insertion and a deletion by two authors with dates', () => {
    const {doc} = fixture();
    const p = blocks(doc)[3];
    assert.equal(p.text, 'Kept inserted removed text and a format ' +
      'change.');
    const ins = runOf(p, 'inserted'), del = runOf(p, 'removed');
    assert.deepEqual(ins.rev, {id: 1, kind: 'ins', author: 'Alice Author',
      date: '2024-05-06T07:08:00Z', attrs: [['w:id', '1'],
        ['w:author', 'Alice Author'], ['w:date', '2024-05-06T07:08:00Z']],
      extra: []});
    assert.equal(p.text.slice(ins.start, ins.end), 'inserted ');
    assert.deepEqual([del.rev.id, del.rev.kind, del.rev.author,
      del.rev.date], [2, 'del', 'Bob Builder', '2025-12-31T23:59:00Z']);
    assert.equal(p.text.slice(del.start, del.end), 'removed ');
    // a formatting revision is read as plain formatted text
    const f = runOf(p, 'a format change');
    assert.equal(f.rev, undefined);
    assert.equal(f.rPr.b, true);
    assert.equal(runOf(p, 'Kept').rev, undefined);
    assert.equal(runOf(p, 'text and').rev, undefined);
  });

  it('deleted text is rev-tagged, never live', () => {
    const {doc, notes} = R(doc0('\\pard A{\\deleted\\revauthdel1 gone ' +
      '{\\b more} {\\field{\\*\\fldinst HYPERLINK "https://x.org/"}' +
      '{\\fldrslt link}} {\\field{\\*\\fldinst PAGE}{\\fldrslt 3}}' +
      '{\\footnote \\pard n\\par}\\tab end}B\\par', TBL));
    const p = blocks(doc)[0];
    for (let k = 1; k < p.text.length - 1; k++) {
      assert.equal(runAt(p, k).rev && runAt(p, k).rev.kind, 'del',
        'offset ' + k + ' ' + JSON.stringify(p.text[k]));
    }
    assert.equal(runAt(p, 0).rev, undefined);
    assert.equal(runAt(p, p.text.length - 1).rev, undefined);
    assert.ok(!p.text.includes('link'));
    assert.ok(p.text.includes('3'));
    assert.equal(normal(doc.notes.footnotes).length, 0);
    assert.ok(notes.some((n) => n.startsWith('deleted pictures')));
    assert.ok(notes.some((n) => n.startsWith('deleted footnotes')));
    // a run of one revision is one tag even across formats
    assert.equal(runOf(p, 'gone').rev, runOf(p, 'more').rev);
  });

  it('each stretch of a revision is its own tag; \\plain and ' +
    '\\revised0 end it', () => {
    const {doc} = R(doc0('\\pard {\\revised\\revauth1 a}b{\\revised' +
      '\\revauth1 c}\\revised\\revauth2 d\\revised0 e\\revised f' +
      '\\plain g\\par', TBL));
    const p = blocks(doc)[0];
    const tags = [...'abcdefg'].map((ch) => runOf(p, ch).rev);
    assert.deepEqual(tags.map((t) => t && t.id),
      [1, undefined, 2, 3, undefined, 4, undefined]);
    assert.deepEqual(tags.map((t) => t && t.author), ['Alice Author',
      undefined, 'Alice Author', 'Bob Builder', undefined, 'Bob Builder',
      undefined]);
  });

  it('an author missing from the table, or no table: no author', () => {
    const {doc} = R(doc0('\\pard {\\revised\\revauth7 a}{\\deleted b}' +
      '\\par', TBL));
    const p = blocks(doc)[0];
    assert.deepEqual(runOf(p, 'a').rev.attrs, [['w:id', '1']]);
    assert.equal(runOf(p, 'a').rev.author, undefined);
    assert.equal(runOf(p, 'b').rev.kind, 'del');
  });

  it('the paragraph mark\'s revision (best effort)', () => {
    const {doc} = R(doc0('\\pard {\\revised\\revauth1\\revdttm667234760 ' +
      'new\\par}old\\par', TBL));
    const [p, q] = blocks(doc);
    assert.deepEqual(p.pPr.extra, [{name: 'w:rPr', attrs: [],
      children: [{name: 'w:ins', attrs: [['w:id', '2'],
        ['w:author', 'Alice Author'],
        ['w:date', '2024-05-06T07:08:00Z']], children: []}]}]);
    assert.deepEqual(q.pPr.extra, []);
  });

  it('the author table is capped and cleaned', () => {
    const many = '{\\*\\revtbl ' + '{N;}'.repeat(MAX_AUTHORS + 5) +
      '{Last;}}';
    const {doc, notes} = R(doc0('\\pard {\\revised\\revauth' +
      (MAX_AUTHORS + 5) + ' a}{\\revised\\revauth1 b}\\par', many));
    const p = blocks(doc)[0];
    assert.equal(runOf(p, 'a').rev.author, undefined);
    assert.equal(runOf(p, 'b').rev.author, 'N');
    assert.ok(notes.some((n) => n.startsWith('more than ' + MAX_AUTHORS +
      ' authors')));
    assert.equal(cleanName(' a \t\n b '), 'a b');
    assert.equal(cleanName('\ud800x'), '\ufffdx');
    assert.equal(cleanName('y'.repeat(300)).length, MAX_NAME);
  });

  it(`past ${MAX_REVS} tags, one tag a kind with no author`, () => {
    const {doc, notes} = R(doc0('\\pard ' + '{\\revised\\revauth1 a}b'
      .repeat(MAX_REVS + 2) + '{\\deleted\\revauthdel1 c}\\par', TBL));
    const p = blocks(doc)[0];
    const tags = new Set(p.runs.map((r) => r.rev).filter(Boolean));
    assert.equal(tags.size, MAX_REVS + 2);
    const last = p.runs[p.runs.length - 1].rev;
    assert.deepEqual([last.kind, last.author], ['del', undefined]);
    assert.equal(p.runs[p.runs.length - 3].rev.author, undefined);
    assert.ok(notes.some((n) => n.startsWith('more than ' + MAX_REVS)));
  });

  it('dates: the DTTM bit fields, checked', () => {
    // 2024-05-06 07:08, a Monday
    assert.equal(dttm(8 | 7 << 6 | 6 << 11 | 5 << 16 | 124 << 20 |
      1 << 29), '2024-05-06T07:08:00Z');
    // 2025-12-31 23:59, a Wednesday (bit 30 set: a negative 32-bit)
    assert.equal(dttm(1742536187), '2025-12-31T23:59:00Z');
    assert.equal(dttm((59 | 23 << 6 | 31 << 11 | 12 << 16 | 125 << 20 |
      6 << 29) | 0), '2025-12-31T23:59:00Z');
    assert.equal(dttm(29 << 11 | 2 << 16 | 124 << 20),
      '2024-02-29T00:00:00Z');
    for (const bad of [0, 29 << 11 | 2 << 16 | 123 << 20,
      1 << 11 | 13 << 16, 60 | 1 << 11 | 1 << 16, 24 << 6 | 1 << 11 |
      1 << 16, 1 << 16, 2 ** 32, -(2 ** 31) - 1, 1.5, undefined,
      1 << 11 | 1 << 16 | 500 << 20]) {
      assert.equal(dttm(bad), undefined, String(bad));
    }
  });
});

describe('RtfRead: the review set writes and reads back', () => {
  it('writeDocx -> readDocx equal for the fixture', async () => {
    const back = await roundTrips(fixture().doc, '19');
    assert.equal(back.comments.map.get(2).parent, 1);
    assert.equal(normal(back.notes.endnotes).length, 1);
  });

  it('and for revisions around marks, in tables and notes', async () => {
    const {doc} = R(doc0('\\pard {\\deleted\\revauthdel1 x{\\*' +
      '\\bkmkstart b}y{\\*\\bkmkend b}z}\\par' +
      '\\trowd\\cellx2000\\cellx4000\\pard\\intbl {\\revised\\revauth2 ' +
      'in}{\\*\\atrfstart 1}cell\\cell\\pard\\intbl two{\\*\\atrfend 1}' +
      '\\chatn{\\*\\annotation {\\*\\atnref 1}\\pard {\\revised\\revauth1 ' +
      'note}\\par}\\cell\\row\\pard A{\\footnote \\pard {\\deleted f}' +
      '\\par}\\par', TBL));
    await roundTrips(doc, 'marks');
  });

  it('never throws on the mutated fixture', () => {
    const src = fs.readFileSync(DIR + FIX);
    let seed = 1966;
    const rnd = (n) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let k = 0; k < 300; k++) {
      const b = new Uint8Array(src.slice(0, 1 + rnd(src.length)));
      for (let m = 0; m < 1 + rnd(20); m++) {
        b[rnd(b.length)] = '{}\\\'u0-9 ab;'.charCodeAt(rnd(14));
      }
      const {doc, notes} = readRtf(b, {date: DATE});
      assert.ok(!notes.some((n) => n.startsWith('part of the file')),
        notes.join('|'));
      valid(doc);
    }
  });
});
