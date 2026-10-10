// Clipboard and Find with lists made by !Word itself (Bullets /
// Numbering, ./ListMake): the numbering definitions are the ones
// ./NumWrite writes, not a fixture's. Copy and paste within the
// document keep the items in their list and level (the exact route
// keeps numPr and List Paragraph); the same copy pasted as from
// another document drops numPr (question L6, recorded in
// docs/apps/Word.md: no list is made) but keeps the text; the HTML
// copy is <ul> / <ol> and reads back as paragraphs; plain text has no
// labels; Find neither finds nor replaces a label; Replace all inside
// items keeps them in their list; a cut and a paste are one undo step
// each and undo gives the numbering back exactly.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {toggleList} from '../../tools/moreapps/!Word/ListMake';
import {setList} from '../../tools/moreapps/!Word/FormatList';
import {labels} from '../../tools/moreapps/!Word/ListNumbers';
import {slice} from '../../tools/moreapps/!Word/ClipSlice';
import {toHtml} from '../../tools/moreapps/!Word/ClipHtml';
import {readTree} from '../../tools/moreapps/!Word/ClipRead';
import {pasteBlocks, pastePlain, cutSelection}
  from '../../tools/moreapps/!Word/ClipPaste';
import {ClipStore} from '../../tools/moreapps/!Word/ClipStore';
import {pick} from '../../tools/moreapps/!Word/ClipPick';
import * as F from '../../tools/moreapps/!Word/Find';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {parseHtml} from './html-fake.mjs';
import {P, C, SEL, mk, blocks, texts} from './edit-docs.mjs';

const T = (d) => new Typing(d);
const state = (d) => structuredClone({sections: d.doc.sections,
  numbering: d.doc.numbering, rels: d.doc.rels, styles: d.doc.styles,
  meta: d.doc.meta});
const shown = (d) => {
  const m = labels(d.doc);
  return blocks(d).map((b) => (b.type !== 'p' ? '#'
    : m.has(b.id) ? m.get(b.id).text : null));
};
const numIds = (d) => blocks(d).map((b) => (b.type === 'p' &&
  b.pPr.numPr ? b.pPr.numPr.numId : null));
const html = (d, sel, o) => toHtml(d.doc, slice(d.doc, sel), o);
const tagsOf = (h) => [...h.matchAll(/<(\/?)([a-z0-9]+)/g)]
  .filter((m) => !m[1]).map((m) => m[2]);

/** Four paragraphs; 0..2 made a numbered list, 3 plain. */
function numbered() {
  const d = mk(['one', 'two', 'three', 'plain']);
  toggleList(d, T(d), SEL(d, 0, 0, 2, 5), {kind: 'number'});
  d.clearHistory();
  return d;
}
function bulleted() {
  const d = mk(['one', 'two', 'plain']);
  toggleList(d, T(d), SEL(d, 0, 0, 1, 3), {kind: 'bullet'});
  d.clearHistory();
  return d;
}
const whole = (d) => {
  const bs = blocks(d);
  return SEL(d, 0, 0, bs.length - 1, bs.at(-1).text.length);
};

describe('copy and paste within the document: new lists', () => {
  it('numbered items pasted after the list continue it', () => {
    const d = numbered();
    const before = state(d);
    const sl = slice(d.doc, SEL(d, 1, 0, 2, 5));
    const out = pasteBlocks(d, C(d, 2, 5), sl.blocks, {sameDoc: true});
    assert.ok(out);
    assert.deepEqual(texts(d), ['one', 'two', 'threetwo', 'three',
      'plain']);
    // the pasted items are in the list (one numId), same level
    const ids = numIds(d);
    assert.deepEqual(ids.slice(0, 4), [1, 1, 1, 1].map(() => ids[0]));
    assert.equal(ids[4], null);
    assert.deepEqual(shown(d), ['1.', '2.', '3.', '4.', null]);
    assert.equal(P(d, 3).pStyle, 'ListParagraph');
    assert.equal(d.undo(), true);
    assert.deepEqual(state(d), before);
  });
  it('a whole-list copy pasted into a plain paragraph: the target ' +
    'keeps its own paragraph properties', () => {
    const d = bulleted();
    const sl = slice(d.doc, SEL(d, 0, 0, 1, 3));
    pasteBlocks(d, C(d, 2, 5), sl.blocks, {sameDoc: true});
    assert.deepEqual(texts(d), ['one', 'two', 'plainone', 'two']);
    // the first piece joins the target, the last takes the target's
    // tail: neither is an item (as for any paste)
    assert.deepEqual(numIds(d).slice(2), [null, null]);
    assert.deepEqual(shown(d).slice(0, 2), ['\u2022', '\u2022']);
  });
  it('a copy pasted into an item of the list: all in the list', () => {
    const d = bulleted();
    const sl = slice(d.doc, SEL(d, 0, 0, 1, 3));
    pasteBlocks(d, C(d, 1, 3), sl.blocks, {sameDoc: true});
    assert.deepEqual(texts(d), ['one', 'twoone', 'two', 'plain']);
    const ids = numIds(d);
    assert.deepEqual(ids, [ids[0], ids[0], ids[0], null]);
    assert.deepEqual(shown(d), ['\u2022', '\u2022', '\u2022', null]);
  });
  it('through the store: exact copy, same document', () => {
    const d = numbered();
    const store = new ClipStore();
    const s = slice(d.doc, SEL(d, 0, 0, 1, 3));
    const token = store.put(s, 7);
    const h = toHtml(d.doc, s, {token});
    const x = pick({text: s.plain, html: h}, {store, docKey: 7,
      parseHtml});
    assert.equal(x.route, 'exact');
    assert.equal(x.opts.sameDoc, true);
    pasteBlocks(d, C(d, 2, 5), x.blocks, x.opts);
    assert.deepEqual(texts(d), ['one', 'two', 'threeone', 'two', 'plain']);
    const ids = numIds(d);
    assert.deepEqual(ids.slice(0, 4), [ids[0], ids[0], ids[0], ids[0]]);
    assert.deepEqual(shown(d), ['1.', '2.', '3.', '4.', null]);
  });
  it('cut items and paste elsewhere: one undo step each', () => {
    const d = numbered();
    const before = state(d);
    const sl = slice(d.doc, SEL(d, 0, 0, 0, 3));
    const cut = cutSelection(d, SEL(d, 0, 0, 1, 0));
    assert.ok(cut);
    assert.equal(d.undoDepth, 1);
    pasteBlocks(d, cut.sel, sl.blocks, {sameDoc: true});
    assert.equal(d.undoDepth, 2);
    d.undo();
    d.undo();
    assert.deepEqual(state(d), before);
  });
});

describe('pasted into another document', () => {
  it('numPr is dropped, the text and the paragraphs stay (L6)', () => {
    const src = numbered();
    const dst = mk(['target']);
    const store = new ClipStore();
    const s = slice(src.doc, SEL(src, 0, 0, 2, 5));
    const token = store.put(s, 1);
    const h = toHtml(src.doc, s, {token});
    const x = pick({text: s.plain, html: h}, {store, docKey: 2,
      parseHtml});
    assert.equal(x.route, 'exact');
    pasteBlocks(dst, C(dst, 0, 6), x.blocks, x.opts);
    assert.deepEqual(texts(dst), ['targetone', 'two', 'three']);
    assert.deepEqual(numIds(dst), [null, null, null]);
    assert.equal(dst.doc.numbering, null, 'no numbering part made');
    assert.deepEqual(shown(dst), [null, null, null]);
    for (const b of blocks(dst)) {
      assert.ok(!b.pPr.numPr);
      // (List Paragraph is mapped by name, or dropped: never a list)
    }
  });
  it('another program\'s <ol> / <ul> gives paragraphs, no list', () => {
    const dst = mk(['a']);
    const x = pick({text: 'x\ny', html: '<ol><li>x</li><li>y</li></ol>' +
      '<ul><li>z</li></ul>'}, {store: new ClipStore(), docKey: 1,
      parseHtml});
    pasteBlocks(dst, C(dst, 0, 1), x.blocks, x.opts);
    assert.deepEqual(numIds(dst).filter((n) => n !== null), []);
  });
});

describe('HTML and plain text of new lists', () => {
  it('numbered: <ol> with <li>, text without labels', () => {
    const d = numbered();
    const sel = whole(d);
    const h = html(d, sel);
    assert.deepEqual(tagsOf(h), ['ol', 'li', 'li', 'li', 'p']);
    assert.ok(!/1\.|2\./.test(h.replace(/<[^>]*>/g, '')), 'no labels');
    assert.equal(slice(d.doc, sel).plain, 'one\ntwo\nthree\nplain');
    const back = readTree(parseHtml(h));
    assert.deepEqual(back.blocks.map((b) => b.text),
      ['one', 'two', 'three', 'plain']);
  });
  it('bulleted: <ul> with <li>', () => {
    const d = bulleted();
    const h = html(d, whole(d));
    assert.deepEqual(tagsOf(h), ['ul', 'li', 'li', 'p']);
  });
  it('a bullet list and a numbered list side by side stay apart', () => {
    const d = mk(['a', 'b', 'c', 'd']);
    toggleList(d, T(d), SEL(d, 0, 0, 1, 1), {kind: 'bullet'});
    toggleList(d, T(d), SEL(d, 2, 0, 3, 1), {kind: 'number'});
    const h = html(d, whole(d));
    assert.deepEqual(tagsOf(h), ['ul', 'li', 'li', 'ol', 'li', 'li']);
  });
  it('three levels: nested depth does not break the markup', () => {
    const d = mk(['a', 'b', 'c']);
    toggleList(d, T(d), SEL(d, 0, 0, 2, 1), {kind: 'number'});
    setList(d, T(d), C(d, 1, 0), {by: 1});
    setList(d, T(d), C(d, 2, 0), {by: 1});
    setList(d, T(d), C(d, 2, 0), {by: 1});
    const h = html(d, whole(d));
    assert.equal((h.match(/<li/g) || []).length, 3);
    assert.deepEqual(readTree(parseHtml(h)).blocks.map((b) => b.text),
      ['a', 'b', 'c']);
  });
  it('plain paste of list text makes no list', () => {
    const d = numbered();
    pastePlain(d, C(d, 3, 5), 'x\ny');
    assert.deepEqual(texts(d), ['one', 'two', 'three', 'plainx', 'y']);
    assert.equal(numIds(d)[4], null);
  });
});

describe('Find with new lists', () => {
  it('labels are not text: not found, not replaced', () => {
    const d = numbered();
    assert.equal(F.count(d.doc, '1.'), 0);
    assert.equal(F.count(d.doc, '.'), 0);
    const bd = bulleted();
    assert.equal(F.count(bd.doc, '•'), 0);
    assert.equal(F.count(d.doc, 'two'), 1);
  });
  it('Replace all in items keeps them in their list; undo exact', () => {
    const d = numbered();
    const before = state(d), lab = shown(d);
    const n = F.replaceAll(d, 'o', '00');
    assert.ok(n);
    assert.deepEqual(texts(d), ['00ne', 'tw00', 'three', 'plain']);
    assert.deepEqual(shown(d), lab);
    assert.deepEqual(numIds(d).slice(0, 3), [numIds(d)[0], numIds(d)[0],
      numIds(d)[0]]);
    d.undo();
    assert.deepEqual(state(d), before);
  });
  it('Replace one in an item, and a match across items refused',
    () => {
      const d = numbered();
      const m = F.search(d.doc, {s: 0, i: 0, off: 0}, 'two', {});
      assert.ok(m);
      F.replaceOne(d, m, 'second item');
      assert.equal(P(d, 1).text, 'second item');
      assert.equal(shown(d)[1], '2.');
      assert.equal(F.count(d.doc, 'one\ntwo'), 0);
    });
});
