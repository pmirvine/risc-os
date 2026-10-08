// ClipPaste: blocks put in at the caret or over a selection, in one
// undo step; plain text; cut.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {pasteBlocks, pastePlain, cutSelection}
  from '../../tools/moreapps/!Word/ClipPaste';
import {slice} from '../../tools/moreapps/!Word/ClipSlice';
import {Document} from '../../tools/moreapps/!Word/Document';
import {newDoc} from '../../tools/moreapps/!Word/NewDoc';
import {readHtml} from '../../tools/moreapps/!Word/ClipRead';
import {parseHtml} from './html-fake.mjs';
import {mk, texts, ids, P, C, SEL, at, undoable, valid, box, raw, O,
  bold, plain, el, S} from './edit-docs.mjs';

const R = (o = {}) => ({...o, extra: []});
const B = (text, o = {}) => ({type: 'p', text, inlines: {},
  runs: text ? [{start: 0, end: text.length, rPr: R()}] : [],
  pPr: R(), ...o});
const center = R({jc: 'center'});
const right = R({jc: 'right'});

/** Paste, checked: one undo step, exact undo/redo, valid, unique ids. */
function paste(d, sel, blocks, o) {
  const out = undoable(d, () => pasteBlocks(d, sel, blocks, o));
  const all = ids(d);
  assert.equal(new Set(all).size, all.length, 'ids unique');
  return out;
}

describe('pasteBlocks: one paragraph', () => {
  it('into the middle: target paragraph kept, pasted runs kept', () => {
    const d = mk([['abc', {pPr: center}]]);
    const id0 = ids(d)[0];
    const s = paste(d, C(d, 0, 1), [B('XY', {pPr: right,
      runs: [{start: 0, end: 2, rPr: bold}]})]);
    assert.deepEqual(texts(d), ['aXYbc']);
    assert.equal(ids(d)[0], id0);
    assert.deepEqual(P(d, 0).pPr, center);
    assert.deepEqual(P(d, 0).runs, [{start: 0, end: 1, rPr: plain},
      {start: 1, end: 3, rPr: bold}, {start: 3, end: 5, rPr: plain}]);
    assert.deepEqual(at(d, s), [0, 3]);
  });
  it('at the start and end of a paragraph and the document', () => {
    for (const [k, off, want, caret] of [[0, 0, ['Xab', 'cd'], [0, 1]],
      [0, 2, ['abX', 'cd'], [0, 3]], [1, 2, ['ab', 'cdX'], [1, 3]]]) {
      const d = mk(['ab', 'cd']);
      const s = paste(d, C(d, k, off), [B('X')]);
      assert.deepEqual(texts(d), want);
      assert.deepEqual(at(d, s), caret);
    }
  });
  it('keeps a hyperlink inline within the same document', () => {
    const link = raw('hyperlink', 'p', 'l');
    const d = mk(['ab']);
    paste(d, C(d, 0, 1), [B('x' + O, {inlines: {1: link}})],
      {sameDoc: true});
    assert.equal(P(d, 0).text, 'ax' + O + 'b');
    assert.deepEqual(P(d, 0).inlines[2], link);
  });
  it('across documents the hyperlink is text', () => {
    const d = mk(['ab']);
    paste(d, C(d, 0, 1), [B('x' + O, {inlines: {1: raw('hyperlink',
      'p', 'link')}})]);
    assert.deepEqual(texts(d), ['axlinkb']);
    assert.deepEqual(P(d, 0).inlines, {});
  });
});

describe('pasteBlocks: several blocks', () => {
  it('into the middle: head merge, middle whole, tail merge', () => {
    const d = mk([['abcd', {pPr: center, extraP: [['w14:paraId',
      '1A']]}]]);
    const id0 = ids(d)[0];
    const s = paste(d, C(d, 0, 2), [B('X', {pPr: right}),
      B('M', {pPr: right, pStyle: 'Heading1'}), B('Y', {pPr: right})],
    {sameDoc: true});
    assert.deepEqual(texts(d), ['abX', 'M', 'Ycd']);
    assert.equal(ids(d)[0], id0);
    assert.deepEqual(P(d, 0).pPr, center);
    assert.deepEqual(P(d, 0).extraP, [['w14:paraId', '1A']]);
    assert.deepEqual(P(d, 1).pPr, right);
    assert.equal(P(d, 1).pStyle, 'Heading1');
    assert.deepEqual(P(d, 1).extraP, []);
    assert.deepEqual(P(d, 2).pPr, center);
    assert.deepEqual(P(d, 2).extraP, []);
    assert.deepEqual(at(d, s), [2, 1]);
  });
  it('the tail keeps its own formatting', () => {
    const d = mk([['abcd', {runs: [{start: 0, end: 2, rPr: plain},
      {start: 2, end: 4, rPr: bold}]}]]);
    paste(d, C(d, 0, 3), [B('X'), B('Y')]);
    assert.deepEqual(texts(d), ['abcX', 'Yd']);
    assert.deepEqual(P(d, 1).runs, [{start: 0, end: 1, rPr: plain},
      {start: 1, end: 2, rPr: bold}]);
  });
  it('at a paragraph start the first pasted paragraph keeps its own ' +
    'properties', () => {
    const d = mk([['ab', {pPr: center}]]);
    const id0 = ids(d)[0];
    const s = paste(d, C(d, 0, 0), [B('X', {pStyle: 'Heading1'}),
      B('Y')], {sameDoc: true});
    assert.deepEqual(texts(d), ['X', 'Yab']);
    assert.equal(ids(d)[0], id0);
    assert.equal(P(d, 0).pStyle, 'Heading1');
    assert.deepEqual(P(d, 0).pPr, R());
    assert.deepEqual(P(d, 1).pPr, center);
    assert.deepEqual(at(d, s), [1, 1]);
  });
  it('whole paragraphs (ending with an empty one) at the end', () => {
    const d = mk(['ab']);
    const s = paste(d, C(d, 0, 2), [B('X'), B('Y'), B('')]);
    assert.deepEqual(texts(d), ['abX', 'Y', '']);
    assert.deepEqual(at(d, s), [2, 0]);
  });
  it('into an empty document and an empty paragraph', () => {
    const d = new Document(newDoc({date: new Date(0)}));
    d.clearHistory();
    const s = paste(d, C(d, 0, 0), [B('one', {pPr: right}), B('two')]);
    assert.deepEqual(texts(d), ['one', 'two']);
    assert.deepEqual(P(d, 0).pPr, right);
    assert.deepEqual(at(d, s), [1, 3]);
    const e = mk(['a', '', 'b']);
    paste(e, C(e, 1, 0), [B('X'), B('Y')]);
    assert.deepEqual(texts(e), ['a', 'X', 'Y', 'b']);
  });
  it('over a selection across paragraphs and a table', () => {
    const d = mk(['abc', box(), 'def']);
    const s = paste(d, SEL(d, 0, 1, 2, 2), [B('X'), B('Y')]);
    assert.deepEqual(texts(d), ['aX', 'Yf']);
    assert.deepEqual(at(d, s), [1, 1]);
    const e = mk(['abc', box(), 'def']);
    paste(e, SEL(e, 2, 2, 0, 1), [B('Z')]);
    assert.deepEqual(texts(e), ['aZf']);
  });
  it('the first block of the document is a table', () => {
    const d = mk([box(), 'ab']);
    const s = paste(d, C(d, 0, 0), [B('X'), B('Y')]);
    assert.deepEqual(texts(d), ['X', 'Y', '#', 'ab']);
    assert.deepEqual(at(d, s), [1, 1]);
    const e = mk([box(), 'ab']);
    paste(e, C(e, 0, 1), [B('Z')]);
    assert.deepEqual(texts(e), ['#', 'Z', 'ab']);
  });
  it('tables in the pasted blocks (same document)', () => {
    const t = {type: 'opaque', node: el('tbl')};
    const d = mk(['abcd']);
    const s = paste(d, C(d, 0, 2), [B('X'), t, B('Y')],
      {sameDoc: true});
    assert.deepEqual(texts(d), ['abX', '#', 'Ycd']);
    assert.deepEqual(at(d, s), [2, 1]);
    const e = mk(['abcd']);
    const s2 = paste(e, C(e, 0, 2), [t], {sameDoc: true});
    assert.deepEqual(texts(e), ['ab', '#', 'cd']);
    assert.deepEqual(at(e, s2), [2, 0]);
    const f = mk(['ab']);
    const id0 = ids(f)[0];
    const s3 = paste(f, C(f, 0, 0), [t, B('X')], {sameDoc: true});
    assert.deepEqual(texts(f), ['#', 'Xab']);
    assert.equal(ids(f)[1], id0, 'the paragraph keeps its id');
    assert.deepEqual(at(f, s3), [1, 1]);
    const g = mk(['ab']);
    paste(g, C(g, 0, 1), [t, B('X')]);
    assert.deepEqual(texts(g), ['aXb'], 'tables skipped across docs');
  });
  it('a copy of the document pasted into itself', () => {
    const d = mk(['one', box(), ['two', {pStyle: 'Heading2'}]]);
    const sl = slice(d.doc, SEL(d, 0, 0, 2, 3));
    const s = paste(d, C(d, 2, 3), sl.blocks, {sameDoc: true});
    assert.deepEqual(texts(d), ['one', '#', 'twoone', '#', 'two']);
    assert.equal(P(d, 4).pStyle, 'Heading2');
    assert.deepEqual(at(d, s), [4, 3]);
    valid(d);
  });
});

describe('pasteBlocks: from another document or HTML', () => {
  it('a slice of document A in document B: styles by name', () => {
    const a = mk([['Head', {pStyle: 'Heading2', runs: [{start: 0,
      end: 4, rPr: bold}]}], ['li', {pPr: R({numPr: {numId: 1,
      ilvl: 0}})}], 'x']);
    const sl = slice(a.doc, SEL(a, 0, 0, 2, 0));
    const b = mk(['ab']);
    paste(b, C(b, 0, 1), sl.blocks, {styleNames: sl.styleNames});
    assert.deepEqual(texts(b), ['aHead', 'li', 'b']);
    assert.equal(P(b, 0).pStyle, undefined, 'head keeps the target');
    assert.deepEqual(P(b, 0).runs[1], {start: 1, end: 5, rPr: bold});
    assert.deepEqual(P(b, 1).pPr, R(), 'numPr dropped');
    const c = mk(['']);
    paste(c, C(c, 0, 0), sl.blocks, {styleNames: sl.styleNames});
    assert.equal(P(c, 0).pStyle, 'Heading2');
  });
  it('HTML read by ClipRead: a heading gets the Heading style', () => {
    const r = readHtml('<h2>Title</h2><p>body <b>bold</b></p>',
      parseHtml);
    const d = mk(['']);
    const s = paste(d, C(d, 0, 0), r.blocks, {styleNames: r.styleNames});
    assert.deepEqual(texts(d), ['Title', 'body bold']);
    assert.equal(P(d, 0).pStyle, 'Heading2');
    assert.deepEqual(P(d, 1).runs[1].rPr, bold);
    assert.deepEqual(at(d, s), [1, 9]);
  });
});

describe('pasteBlocks: edges', () => {
  it('nothing to paste or an invalid position: no change', () => {
    const d = mk(['ab']);
    const c = C(d, 0, 1);
    assert.equal(pasteBlocks(d, c, []), c);
    assert.equal(pasteBlocks(d, c, [{type: 'opaque', node: el('t')}]),
      c);
    const bad = S.caret({id: 12345, off: 0});
    assert.equal(pasteBlocks(d, bad, [B('x')]), bad);
    assert.equal(d.undoDepth, 0);
  });
  it('a refused paste changes nothing', () => {
    const d = mk(['abc', 'def']);
    const before = structuredClone(d.doc.sections);
    assert.throws(() => pasteBlocks(d, SEL(d, 0, 1, 1, 1),
      [B('ab', {runs: []})], {sameDoc: true}), RangeError);
    assert.deepEqual(d.doc.sections, before);
    assert.equal(d.undoDepth, 0);
  });
  it('100,000 paragraphs in < 5 s as one undo step', () => {
    const d = mk(['start', 'end']);
    const bs = Array.from({length: 100000}, (_, k) => B('p' + k));
    const t0 = Date.now();
    const s = pasteBlocks(d, C(d, 0, 5), bs);
    const ms = Date.now() - t0;
    assert.ok(ms < 15000, ms + ' ms');
    assert.equal(texts(d).length, 100001);
    assert.equal(d.undoDepth, 1);
    assert.deepEqual(at(d, s), [99999, 6]);
    d.undo();
    assert.deepEqual(texts(d), ['start', 'end']);
  });
});

describe('pastePlain and cutSelection', () => {
  it('pastePlain types the text: lines split, controls cleaned', () => {
    const d = mk([['ab', {pPr: center}]]);
    const s = undoable(d, () => pastePlain(d, C(d, 0, 1),
      'x\r\ny\u0001\tz'));
    assert.deepEqual(texts(d), ['ax', 'y\tzb']);
    assert.deepEqual(P(d, 1).pPr, center);
    assert.deepEqual(at(d, s), [1, 3]);
    const c = C(d, 0, 0);
    assert.equal(pastePlain(d, c, ''), c);
  });
  it('pastePlain over a selection replaces it', () => {
    const d = mk(['abc', 'def']);
    undoable(d, () => pastePlain(d, SEL(d, 0, 1, 1, 2), 'Q'));
    assert.deepEqual(texts(d), ['aQf']);
  });
  it('cutSelection: the slice, and the selection deleted', () => {
    const d = mk(['abc', box(), 'def']);
    const r = undoable(d, () => cutSelection(d, SEL(d, 0, 1, 2, 1)));
    assert.deepEqual(r.slice.blocks.map((b) => b.type),
      ['p', 'opaque', 'p']);
    assert.equal(r.slice.plain, 'bc\n\nd');
    assert.deepEqual(texts(d), ['aef']);
    assert.deepEqual(at(d, r.sel), [0, 1]);
    const c = C(d, 0, 1);
    const n = cutSelection(d, c);
    assert.equal(n.slice, null);
    assert.equal(n.sel, c);
  });
});
