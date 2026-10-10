// Bookmarks / BookmarkFind / BookmarkKeep: Insert > Bookmark...
// (Ctrl+Shift+F5). A bookmark is a pair of raw level-'p' inlines
// w:bookmarkStart w:id w:name / w:bookmarkEnd w:id round the
// selection; the id is one more than the largest bookmark id in the
// document (tables' XML included), never past 2^31 - 1; names as
// Word's (a letter, then letters, digits and _, at most 40, unique
// ignoring case: adding an existing name moves it); one undo step;
// a range deleted keeps the mark whose partner is outside it.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {list, checkName, addBookmark, deleteBookmark, goTo,
  bookmarkNames, findBookmark, linkNames, NAME_MAX}
  from '../../tools/moreapps/!Word/Bookmarks';
import {marks} from '../../tools/moreapps/!Word/BookmarkFind';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {Document} from '../../tools/moreapps/!Word/Document';
import {deepEqual} from '../../tools/moreapps/!Word/Model';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import * as X from '../../tools/moreapps/!Word/EditDel';
import {typeText} from '../../tools/moreapps/!Word/Edit';
import {keymap, WINDOW} from '../../tools/moreapps/!Word/Keymap';
import {macKey} from '../../tools/moreapps/!Word/MacKeys';
import {mk, P, C, SEL, O, texts, valid} from './edit-docs.mjs';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {strictDocx} from './docx-fixtures.mjs';

const DATE = new Date(Date.UTC(2026, 0, 1));
const node = (name, id, nm) => ({name: 'w:' + name, attrs: nm ===
  undefined ? [['w:id', String(id)]] : [['w:id', String(id)],
  ['w:name', nm]], children: []});
const S0 = (id, nm) => ({kind: 'raw', level: 'p', text: '',
  node: node('bookmarkStart', id, nm)});
const E0 = (id) => ({kind: 'raw', level: 'p', text: '',
  node: node('bookmarkEnd', id)});
const tbl = (...kids) => ({type: 'opaque', node: {name: 'w:tbl',
  attrs: [], children: kids}});
/** The bookmark marks of paragraph k: [off, 'S'|'E', id, name?]. */
const mk2 = (d, k) => Object.entries(P(d, k).inlines)
  .filter(([, x]) => /bookmark/.test(x.node?.name ?? ''))
  .map(([off, x]) => {
    const a = Object.fromEntries(x.node.attrs);
    return [Number(off), x.node.name === 'w:bookmarkStart' ? 'S' : 'E',
      a['w:id'], ...(a['w:name'] === undefined ? [] : [a['w:name']])];
  });
const state = (d) => structuredClone(d.doc.sections);

/** cmd is one undo step; undo gives back the doc exactly. */
function step(d, cmd) {
  const before = state(d), n = d.undoDepth;
  const out = cmd(new Typing(d));
  assert.ok(out && out.sel, 'done: ' + (out && out.error));
  valid(d);
  assert.equal(d.undoDepth, n + 1, 'one undo step');
  const after = state(d);
  d.undo();
  assert.ok(deepEqual(d.doc.sections, before), 'undo exact');
  d.redo();
  assert.ok(deepEqual(d.doc.sections, after), 'redo exact');
  return out;
}

/** cmd is refused: {error}, nothing changed, no undo step. */
function refused(d, cmd, re) {
  const before = state(d), n = d.undoDepth;
  const out = cmd(new Typing(d));
  assert.ok(out && typeof out.error === 'string', JSON.stringify(out));
  if (re) assert.match(out.error, re);
  assert.equal(d.undoDepth, n);
  assert.ok(deepEqual(d.doc.sections, before));
  return out.error;
}

describe('checkName: Word\'s rules', () => {
  it('a letter first, then letters, digits and _, 1..40', () => {
    for (const n of ['a', 'Intro', 'Café_1', 'x'.repeat(40),
      'A1_b2', 'Été', 'Chapter_10'])
      assert.equal(checkName(n), null, n);
    assert.equal(NAME_MAX, 40);
  });
  it('refused with a reason', () => {
    for (const n of ['', 'x'.repeat(41), '1abc', '9', '_Toc123',
      '__proto__', 'has space', ' lead', 'trail ', 'a-b', 'a.b',
      'a￼', '\ud800a', 'a\u0000', 'a#b', 'constructor!',
      'tab\tx'])
      assert.equal(typeof checkName(n), 'string', JSON.stringify(n));
    for (const n of [null, undefined, 5, {}, ['a']])
      assert.equal(typeof checkName(n), 'string');
    assert.match(checkName('x'.repeat(41)), /40/);
    assert.match(checkName('1abc'), /letter/);
  });
});

describe('addBookmark', () => {
  it('round the selection: start, end; one step; the selection kept ' +
    'inside them', () => {
    const d = mk(['one two three', 'next']);
    const out = step(d, (t) => addBookmark(d, t, SEL(d, 0, 4, 0, 7),
      'Two'));
    assert.deepEqual(mk2(d, 0), [[4, 'S', '0', 'Two'], [8, 'E', '0']]);
    assert.equal(P(d, 0).text, 'one ' + O + 'two' + O + ' three');
    assert.deepEqual([out.sel.anchor.off, out.sel.head.off], [5, 8]);
    assert.deepEqual(list(d.doc), [{name: 'Two', id: '0',
      at: {s: 0, i: 0, off: 4}}]);
  });
  it('at a caret: the start, then the end, at one place', () => {
    const d = mk(['ab']);
    const out = step(d, (t) => addBookmark(d, t, C(d, 0, 1), 'Here'));
    assert.deepEqual(mk2(d, 0), [[1, 'S', '0', 'Here'], [2, 'E', '0']]);
    assert.equal(out.sel.head.off, 2);
    assert.ok(out.sel.anchor.off === 2);
  });
  it('the marks are plain runs (as read); text typed next to one ' +
    'takes the format of the text beyond it', () => {
    const bold = {b: true, extra: []};
    const d = mk([['abcd', {runs: [{start: 0, end: 4, rPr: bold}]}]]);
    const out = addBookmark(d, new Typing(d), C(d, 0, 2), 'B');
    const sel = typeText(d, out.sel, 'X');
    assert.equal(P(d, 0).text, 'ab' + O + 'X' + O + 'cd');
    const fmt = (k) => P(d, 0).runs.find((q) => q.start <= k &&
      k < q.end).rPr;
    assert.ok(fmt(3).b, 'X bold');
    assert.ok(!fmt(2).b && !fmt(4).b, 'the marks plain');
    assert.equal(sel.head.off, 4);
    // at a paragraph's start, after a mark: the text after it
    const e = mk([['ab', {runs: [{start: 0, end: 2, rPr: bold}]}]]);
    addBookmark(e, new Typing(e), C(e, 0, 0), 'S');
    typeText(e, C(e, 0, 1), 'Y');
    assert.equal(P(e, 0).text, O + 'Y' + O + 'ab');
    assert.ok(P(e, 0).runs.find((q) => q.start <= 1 && 1 < q.end).rPr.b);
  });
  it('ids: one more than the largest, tables\' XML included', () => {
    const d = mk([[O + 'a' + O, {inlines: {0: S0(3, 'A'), 2: E0(3)}}],
      tbl(node('bookmarkStart', 7, 'InTable'), node('bookmarkEnd', 7)),
      'text']);
    addBookmark(d, new Typing(d), SEL(d, 2, 0, 2, 4), 'New');
    assert.deepEqual(mk2(d, 2), [[0, 'S', '8', 'New'], [5, 'E', '8']]);
  });
  it('ids that are not numbers, negative or past 2^31 - 1 are ' +
    'passed over; at 2^31 - 1 a new one is refused', () => {
    const d = mk([[O + O + O + O + 'x', {inlines: {0: S0('abc', 'A'),
      1: S0('-4', 'B'), 2: S0('4294967296', 'C'),
      3: S0('99999999999999999999', 'D')}}]]);
    addBookmark(d, new Typing(d), C(d, 0, 5), 'E');
    assert.deepEqual(mk2(d, 0).slice(4), [[5, 'S', '0', 'E'],
      [6, 'E', '0']]);
    const m = mk([[O + 'x', {inlines: {0: S0('2147483647', 'Max')}}]]);
    refused(m, (t) => addBookmark(m, t, C(m, 0, 2), 'More'),
      /number/);
    const m2 = mk([[O + 'x', {inlines: {0: S0('2147483646', 'Max')}}]]);
    addBookmark(m2, new Typing(m2), C(m2, 0, 2), 'Last');
    assert.equal(mk2(m2, 0)[1][2], '2147483647');
  });
  it('a name already there (case ignored) is moved: one step', () => {
    const d = mk([[O + 'abc' + O, {inlines: {0: S0(1, 'Intro'),
      4: E0(1)}}], 'xyz']);
    step(d, (t) => addBookmark(d, t, SEL(d, 1, 1, 1, 2), 'INTRO'));
    assert.deepEqual(mk2(d, 0), []);
    assert.equal(P(d, 0).text, 'abc');
    assert.deepEqual(mk2(d, 1), [[1, 'S', '2', 'INTRO'],
      [3, 'E', '2']]);
    assert.deepEqual(list(d.doc).map((b) => b.name), ['INTRO']);
  });
  it('moved within its own paragraph, before and after itself', () => {
    const d = mk([['ab' + O + 'cd' + O + 'ef', {inlines: {2: S0(0, 'M'),
      5: E0(0)}}]]);
    addBookmark(d, new Typing(d), SEL(d, 0, 0, 0, 1), 'M');
    assert.equal(P(d, 0).text, O + 'a' + O + 'bcdef');
    addBookmark(d, new Typing(d), SEL(d, 0, 5, 0, 7), 'm');
    assert.equal(P(d, 0).text, 'abc' + O + 'de' + O + 'f');
    assert.deepEqual(mk2(d, 0), [[3, 'S', '2', 'm'], [6, 'E', '2']]);
  });
  it('two names that differ only in case in a file: both go', () => {
    const d = mk([[O + 'a' + O + O + 'b' + O, {inlines: {0: S0(1, 'X'),
      2: E0(1), 3: S0(2, 'x'), 5: E0(2)}}], 'c']);
    addBookmark(d, new Typing(d), C(d, 1, 0), 'x');
    assert.equal(P(d, 0).text, 'ab');
    assert.deepEqual(list(d.doc).map((b) => b.name), ['x']);
  });
  it('the same name round the same text again: no step', () => {
    const d = mk(['one two']);
    const a = addBookmark(d, new Typing(d), SEL(d, 0, 0, 0, 3), 'One');
    const n = d.undoDepth, b0 = P(d, 0);
    const again = addBookmark(d, new Typing(d), a.sel, 'One');
    assert.ok(again.sel);
    assert.equal(d.undoDepth, n);
    assert.equal(P(d, 0), b0);
    // the same text selected from outside the marks
    const out = addBookmark(d, new Typing(d), SEL(d, 0, 0, 0, 5), 'One');
    assert.ok(out.sel);
    assert.equal(d.undoDepth, n);
  });
  it('across paragraphs: start in the first, end in the last; read ' +
    'back from the file', async () => {
    const d = mk(['first', 'middle', 'last']);
    step(d, (t) => addBookmark(d, t, SEL(d, 0, 2, 2, 3), 'Span'));
    assert.deepEqual(mk2(d, 0), [[2, 'S', '0', 'Span']]);
    assert.deepEqual(mk2(d, 2), [[3, 'E', '0']]);
    const g = goTo(d.doc, 'span');
    assert.deepEqual([g.sel.anchor.off, g.sel.head.off], [3, 3]);
    assert.equal(g.sel.anchor.id, P(d, 0).id);
    assert.equal(g.sel.head.id, P(d, 2).id);
    const back = await readDocx(await writeDocx(d.doc, {date: DATE}));
    const e = new Document(back);
    assert.deepEqual(list(back), list(d.doc));
    assert.deepEqual(mk2(e, 0), mk2(d, 0));
    assert.deepEqual(mk2(e, 2), mk2(d, 2));
  });
  it('refused: a bad name, a table edge, a name in a table', () => {
    const d = mk(['ab', tbl(node('bookmarkStart', 1, 'InTable'),
      node('bookmarkEnd', 1)), 'cd']);
    refused(d, (t) => addBookmark(d, t, C(d, 0, 1), '1st'), /letter/);
    refused(d, (t) => addBookmark(d, t, C(d, 0, 1), '_Hidden'));
    refused(d, (t) => addBookmark(d, t, C(d, 0, 1), 'x'.repeat(41)));
    refused(d, (t) => addBookmark(d, t, C(d, 1, 0), 'Edge'), /table/);
    refused(d, (t) => addBookmark(d, t, SEL(d, 0, 0, 1, 1), 'Over'),
      /table/);
    refused(d, (t) => addBookmark(d, t, C(d, 0, 1), 'intable'),
      /table/);
    refused(d, (t) => addBookmark(d, t, null, 'Nowhere'));
    // across the table, from text to text: fine
    step(d, (t) => addBookmark(d, t, SEL(d, 0, 1, 2, 1), 'Round'));
  });
  it('__proto__ and constructor from a file are only names', () => {
    const d = mk([[O + O + 'x', {inlines: {0: S0(1, '__proto__'),
      1: S0(2, 'constructor')}}]]);
    assert.deepEqual(list(d.doc).map((b) => b.name), ['constructor']);
    assert.deepEqual(list(d.doc, {hidden: true}).map((b) => b.name),
      ['__proto__', 'constructor']);
    addBookmark(d, new Typing(d), C(d, 0, 3), 'Constructor');
    assert.deepEqual(list(d.doc).map((b) => b.name), ['Constructor']);
    assert.equal({}.polluted, undefined);
    assert.equal(Object.prototype.Constructor, undefined);
  });
  it('a Strict document: written and read back', async () => {
    const doc = await readDocx(await strictDocx());
    const d = new Document(doc);
    const out = addBookmark(d, new Typing(d), C(d, 0, 0), 'Strict');
    assert.ok(out.sel, out.error);
    const back = await readDocx(await writeDocx(d.doc, {date: DATE}));
    assert.deepEqual(list(back).map((b) => b.name), ['Strict']);
  });
});

describe('list, goTo, deleteBookmark', () => {
  const doc3 = () => mk([[O + 'zeta' + O, {inlines: {0: S0(1, 'Zeta'),
    5: E0(1)}}], [O + 'alpha' + O + O + O, {inlines: {0: S0(2, 'alpha'),
    6: E0(2), 7: S0(3, '_Toc9'), 8: E0(3)}}],
  tbl(node('bookmarkStart', 4, 'Mid'), node('bookmarkEnd', 4)),
  [O + 'q', {inlines: {0: S0(5, 'Orphan')}}]]);
  it('by location or by name (case ignored); hidden ones only when ' +
    'asked; in a table at null', () => {
    const d = doc3();
    assert.deepEqual(list(d.doc).map((b) => b.name), ['Zeta', 'alpha',
      'Mid', 'Orphan']);
    assert.deepEqual(list(d.doc, {sort: 'name'}).map((b) => b.name),
      ['alpha', 'Mid', 'Orphan', 'Zeta']);
    assert.deepEqual(list(d.doc, {hidden: true, sort: 'name'})
      .map((b) => b.name), ['_Toc9', 'alpha', 'Mid', 'Orphan', 'Zeta']);
    assert.equal(list(d.doc).find((b) => b.name === 'Mid').at, null);
    assert.deepEqual(list(d.doc)[1], {name: 'alpha', id: '2',
      at: {s: 0, i: 1, off: 0}});
  });
  it('goTo selects the bookmarked text; a table: refused with a ' +
    'message; a start without its end: the caret after it', () => {
    const d = doc3();
    const g = goTo(d.doc, 'ALPHA');
    assert.deepEqual([g.sel.anchor.off, g.sel.head.off], [1, 6]);
    assert.equal(g.sel.head.id, P(d, 1).id);
    assert.match(goTo(d.doc, 'Mid').error, /table/);
    const o = goTo(d.doc, 'Orphan');
    assert.deepEqual([o.sel.anchor.off, o.sel.head.off], [1, 1]);
    assert.ok(goTo(d.doc, 'nope').error);
    assert.ok(goTo(d.doc, '').error);
    assert.ok(goTo(d.doc, '__proto__').error);
  });
  it('deleteBookmark: start and end gone, one step; refusals', () => {
    const d = doc3();
    const del = step(d, (t) => deleteBookmark(d, t, 'zeta'));
    assert.equal(del.name, 'Zeta', 'the name as stored');
    assert.equal(P(d, 0).text, 'zeta');
    step(d, (t) => deleteBookmark(d, t, 'Orphan'));
    assert.equal(P(d, 3).text, 'q');
    refused(d, (t) => deleteBookmark(d, t, 'Mid'), /table/);
    refused(d, (t) => deleteBookmark(d, t, 'Zeta'), /no bookmark/i);
    refused(d, (t) => deleteBookmark(d, t, ''));
    refused(d, (t) => deleteBookmark(d, t, '__proto__'));
  });
  it('two starts with one id: each takes the first free end after ' +
    'it', () => {
    const d = mk([[O + 'a' + O + 'b' + O + 'c' + O, {inlines: {
      0: S0(5, 'A'), 2: S0(5, 'B'), 4: E0(5), 6: E0(5)}}]]);
    const g = goTo(d.doc, 'B');
    assert.deepEqual([g.sel.anchor.off, g.sel.head.off], [3, 6]);
    deleteBookmark(d, new Typing(d), 'B');
    assert.equal(P(d, 0).text, O + 'a' + 'b' + O + 'c');
    assert.deepEqual(mk2(d, 0), [[0, 'S', '5', 'A'], [3, 'E', '5']]);
  });
  it('the lookups links use (Hyperlink box, Ctrl-click)', () => {
    const start = (name) => S0(1, name);
    const d = mk([[O + 'a' + O, {inlines: {0: start('Intro'),
      2: start('_Toc1')}}], tbl(node('bookmarkStart', 1, 'InTable')),
    [O, {inlines: {0: start('intro')}}],
    [O + O, {inlines: {0: start('__proto__'), 1: start('Bad￼')}}]]);
    assert.deepEqual(bookmarkNames(d.doc), ['Intro', 'InTable',
      'Bad￼']);
    assert.deepEqual(bookmarkNames(d.doc, {hidden: true, max: 2}),
      ['Intro', '_Toc1']);
    assert.deepEqual(linkNames(d.doc), ['Intro', 'InTable']);
    assert.deepEqual(findBookmark(d.doc, 'Intro'), {id: P(d, 0).id,
      off: 0});
    assert.deepEqual(findBookmark(d.doc, 'intro'), {id: P(d, 2).id,
      off: 0});
    assert.ok(findBookmark(d.doc, 'INTABLE').id < 0);
    assert.equal(findBookmark(d.doc, 'nope'), null);
    assert.equal(findBookmark(d.doc, null), null);
  });
});

describe('a deleted range keeps a mark whose partner is outside it', () => {
  it('the paragraph holding the start deleted: the start kept at ' +
    'the join, the bookmark still whole', () => {
    const d = mk([['a' + O + 'b', {inlines: {1: S0(1, 'Keep')}}], 'cd',
      ['e' + O + 'f', {inlines: {1: E0(1)}}]]);
    const out = X.deleteSelection(d, SEL(d, 0, 0, 1, 1));
    assert.deepEqual(texts(d), [O + 'd', 'e' + O + 'f']);
    assert.deepEqual(mk2(d, 0), [[0, 'S', '1', 'Keep']]);
    assert.equal(out.head.off, 0);
    const g = goTo(d.doc, 'Keep');
    assert.equal(g.sel.head.id, P(d, 1).id);
  });
  it('the end kept when its start is before the range', () => {
    const d = mk([['a' + O + 'b', {inlines: {1: S0(1, 'K')}}],
      ['c' + O + 'd', {inlines: {1: E0(1)}}], 'ef']);
    X.deleteSelection(d, SEL(d, 1, 0, 2, 1));
    assert.deepEqual(texts(d), ['a' + O + 'b', O + 'f']);
    assert.deepEqual(mk2(d, 1), [[0, 'E', '1']]);
  });
  it('a whole bookmark in the range goes; one undo step', () => {
    const d = mk([['a' + O + 'b' + O + 'c', {inlines: {1: S0(1, 'K'),
      3: E0(1)}}], 'de']);
    const n = d.undoDepth;
    X.deleteSelection(d, SEL(d, 0, 0, 1, 1));
    assert.deepEqual(texts(d), ['e']);
    assert.equal(d.undoDepth, n + 1);
    d.undo();
    assert.deepEqual(mk2(d, 0).length, 2);
  });
  it('typing over a selection holding a start keeps it', () => {
    const d = mk([['ab' + O + 'cd' + O, {inlines: {2: S0(1, 'K'),
      5: E0(1)}}]]);
    typeText(d, SEL(d, 0, 1, 0, 4), 'X');
    assert.equal(P(d, 0).text, 'aX' + O + 'd' + O);
    assert.deepEqual(mk2(d, 0), [[2, 'S', '1', 'K'], [4, 'E', '1']]);
  });
  const wrap = (name, ...kids) => ({kind: 'raw', level: 'p', text: '',
    node: {name, attrs: [], children: kids}});
  it('review: the partner inside a table, a link or an insertion that ' +
    'the range covers is in the range: nothing kept', () => {
    const t1 = mk([['a' + O + 'b', {inlines: {1: S0(1, 'K')}}],
      tbl(node('bookmarkEnd', 1)), 'cd']);
    X.deleteSelection(t1, SEL(t1, 0, 0, 2, 1));
    assert.deepEqual(texts(t1), ['d']);
    for (const w of ['w:hyperlink', 'w:ins']) {
      const d = mk([['a' + O + 'b', {inlines: {1: S0(1, 'K')}}],
        ['x' + O + 'y', {inlines: {1: wrap(w, {name: 'w:r', attrs: [],
          children: []}, node('bookmarkEnd', 1))}}], 'cd']);
      X.deleteSelection(d, SEL(d, 0, 0, 2, 1));
      assert.deepEqual(texts(d), ['d'], w);
    }
  });
  it('review: the partner in a table or wrapper outside the range: ' +
    'the start kept', () => {
    const t1 = mk([['a' + O + 'b', {inlines: {1: S0(1, 'K')}}], 'cd',
      tbl(node('bookmarkEnd', 1)), 'ef']);
    X.deleteSelection(t1, SEL(t1, 0, 0, 1, 1));
    assert.deepEqual(texts(t1), [O + 'd', '#', 'ef']);
    const d = mk([['a' + O + 'b', {inlines: {1: S0(1, 'K')}}], 'cd',
      ['x' + O, {inlines: {1: wrap('w:ins', node('bookmarkEnd', 1))}}]]);
    X.deleteSelection(d, SEL(d, 0, 0, 1, 1));
    assert.deepEqual(texts(d), [O + 'd', 'x' + O]);
  });
  it('a range that ends on tables both sides: the mark is kept at ' +
    'the nearest paragraph, the pair never broken', () => {
    const ids = (d) => marks(d.doc).map((m) => m.kind + m.id).sort();
    // the next paragraph after the range
    const d = mk([tbl(), ['x' + O + 'y', {inlines: {1: S0(1, 'K')}}],
      tbl(), ['e' + O + 'f', {inlines: {1: E0(1)}}]]);
    X.deleteSelection(d, SEL(d, 0, 0, 2, 1));
    valid(d);
    assert.deepEqual(ids(d), ['end1', 'start1']);
    assert.deepEqual(mk2(d, d.doc.sections[0].blocks.length - 1),
      [[0, 'S', '1', 'K'], [2, 'E', '1']]);
    assert.ok(goTo(d.doc, 'K').sel);
    // nothing after: the end of the paragraph before
    const e = mk([['a' + O + 'b', {inlines: {1: S0(2, 'L')}}], tbl(),
      ['c' + O, {inlines: {1: E0(2)}}], tbl()]);
    X.deleteSelection(e, SEL(e, 1, 0, 3, 1));
    valid(e);
    assert.deepEqual(ids(e), ['end2', 'start2']);
    assert.deepEqual(mk2(e, 0), [[1, 'S', '2', 'L'], [3, 'E', '2']]);
    assert.ok(goTo(e.doc, 'L').sel);
  });
  it('an orphan end (no start anywhere) is not kept', () => {
    const d = mk([['a' + O + 'b', {inlines: {1: E0(9)}}], 'c']);
    X.deleteSelection(d, SEL(d, 0, 0, 1, 0));
    assert.deepEqual(texts(d), ['c']);
  });
});

describe('keys: Ctrl+Shift+F5', () => {
  it('a window command; not F5, Ctrl+F5, Shift+F5; not Cmd on a Mac',
    () => {
      const f5 = (o) => keymap.lookup({code: 0x185, key: 'F5', ...o});
      assert.equal(f5({ctrl: true, shift: true}), 'bookmark');
      assert.equal(keymap.lookup({code: 0x1b5}), 'bookmark');
      assert.equal(f5({}), null);
      assert.equal(f5({ctrl: true}), null);
      assert.equal(f5({shift: true}), null);
      assert.equal(f5({ctrl: true, shift: true, alt: true}), null);
      assert.equal(keymap.labelFor('bookmark'), 'Ctrl+Shift+F5');
      assert.ok(WINDOW.has('bookmark'));
      assert.equal(keymap.row('bookmark').menu, 'Window');
      const ev = {code: 0x195, key: 'F5', shift: true, ctrl: false,
        alt: false, domEvent: {metaKey: true, ctrlKey: false,
          altKey: false}};
      assert.equal(macKey(ev, true), ev, 'Cmd-Shift-F5 not mapped');
      assert.equal(keymap.lookup(macKey(ev, true)), null);
    });
});

describe('10,000 bookmarks', () => {
  it('listed, added, found and deleted quickly', () => {
    const blocks = [];
    for (let k = 0; k < 10000; k++) {
      blocks.push([O + 'para ' + k + O, {inlines: {0: S0(k, 'B' + k),
        [6 + String(k).length]: E0(k)}}]);
    }
    const d = mk(blocks);
    let t = performance.now();
    const all = list(d.doc, {sort: 'name'});
    const tList = performance.now() - t;
    assert.equal(all.length, 10000);
    t = performance.now();
    const out = addBookmark(d, new Typing(d), C(d, 5000, 3), 'New');
    const tAdd = performance.now() - t;
    assert.ok(out.sel);
    assert.equal(mk2(d, 5000)[1][2], '10000');
    t = performance.now();
    assert.ok(goTo(d.doc, 'B9999').sel);
    assert.ok(deleteBookmark(d, new Typing(d), 'b7').sel);
    const tRest = performance.now() - t;
    assert.equal(marks(d.doc).length, 20000);
    assert.ok(tList < 1000 && tAdd < 1000 && tRest < 1000,
      JSON.stringify({tList, tAdd, tRest}));
  });
});
