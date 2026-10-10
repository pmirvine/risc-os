// FormatPaint: the format painter's rules. pick: a caret gives the
// character format at the caret and its paragraph's format; a
// selection inside one paragraph the character format of its first
// character; a selection reaching the paragraph's end also the
// paragraph format (the list included). paint: the picked run
// properties REPLACE the target's (nothing is merged), paragraph
// format likewise, as one undo step; nothing to change makes no step;
// inlines written outside any run are skipped.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {pick, paint} from '../../tools/moreapps/!Word/FormatPaint';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {blockId} from '../../tools/moreapps/!Word/DocPos';
import {P, C, SEL, S, texts, undoable, snap, undoAll, blocks, mk, O}
  from './edit-docs.mjs';
import {listDoc, li} from './list-docs.mjs';
import {raw} from './word-docs.mjs';
import {addStyle} from '../../tools/moreapps/!Word/Styles';

const chars = (d, ...ids) => ids.forEach((id) => addStyle(d.doc.styles,
  {id, type: 'character', name: id, rPr: {extra: []}}));

const T = (d) => new Typing(d);
const paintOn = (d, sel, picked, L) => undoable(d, () =>
  paint(d, T(d), sel, picked, L));
const runs = (d, k) => P(d, k).runs.map((r) => [r.start, r.end,
  Object.keys(r.rPr).filter((x) => x !== 'extra').sort().join(','),
  r.rStyle ?? null]);
const B = {b: true, extra: []};
const IT = {i: true, extra: []};
/** A layout that knows where its blocks are (for selectWord). */
const layout = (d) => ({locate: (pos) => {
  const b = blocks(d).find((x) => blockId(x) === pos.id);
  return {item: {id: pos.id, kind: 'p', block: b}, off: pos.off};
}});

describe('FormatPaint.pick', () => {
  it('a caret: the format at the caret and its paragraph\'s', () => {
    const d = mk([['abc def', {runs: [{start: 0, end: 3, rPr: B},
      {start: 3, end: 7, rPr: IT}], pPr: {jc: 'center', extra: []},
    pStyle: 'Title'}]]);
    const a = pick(d.doc, C(d, 0, 2));
    assert.deepEqual(a.rPr, B);
    assert.deepEqual(a.pPr, {jc: 'center', extra: []});
    assert.equal(a.pStyle, 'Title');
    const b = pick(d.doc, C(d, 0, 5));
    assert.deepEqual(b.rPr, IT);
  });
  it('a selection inside a paragraph: its first character only', () => {
    const d = mk([['abc def', {runs: [{start: 0, end: 3, rPr: B},
      {start: 3, end: 7, rPr: IT}], pPr: {jc: 'center', extra: []}}]]);
    const a = pick(d.doc, SEL(d, 0, 1, 0, 5));
    assert.deepEqual(a.rPr, B);
    assert.equal(a.pPr, undefined);
    assert.equal(a.pStyle, undefined);
    // backwards: the same
    assert.deepEqual(pick(d.doc, SEL(d, 0, 5, 0, 1)).rPr, B);
  });
  it('a selection reaching the paragraph\'s end: the paragraph too',
    () => {
      const d = mk([['abc def', {pPr: {jc: 'right', extra: []},
        pStyle: 'Title'}], 'next']);
      const a = pick(d.doc, SEL(d, 0, 4, 0, 7));
      assert.deepEqual(a.pPr, {jc: 'right', extra: []});
      assert.equal(a.pStyle, 'Title');
      // across paragraphs: the first paragraph's
      const b = pick(d.doc, SEL(d, 0, 2, 1, 2));
      assert.deepEqual(b.pPr, {jc: 'right', extra: []});
      // a paragraph without a style: pStyle null (it is replaced)
      const c = pick(d.doc, SEL(d, 1, 0, 1, 4));
      assert.equal(c.pStyle, null);
    });
  it('the list format is picked: numPr and the level', () => {
    const d = listDoc([li('one', 1), 'plain']);
    const a = pick(d.doc, C(d, 0, 1));
    assert.deepEqual(a.pPr.numPr, {numId: 1, ilvl: 1});
  });
  it('an inline outside any run is passed over; a selection of only' +
    ' inlines and a start at the end use the caret rule', () => {
    const d = mk([[O + 'bold', {runs: [{start: 0, end: 1, rPr: IT},
      {start: 1, end: 5, rPr: B}], inlines: {0: raw('hyperlink')}}],
    ['ab' + O, {inlines: {2: raw('bookmarkStart')}}], 'x']);
    assert.deepEqual(pick(d.doc, SEL(d, 0, 0, 0, 3)).rPr, B);
    assert.deepEqual(pick(d.doc, SEL(d, 1, 2, 1, 3)).rPr,
      pick(d.doc, C(d, 1, 3)).rPr);
    // from the end of one paragraph to the next
    const e = pick(d.doc, SEL(d, 1, 3, 2, 1));
    assert.ok(e.rPr && e.pPr);
  });
  it('an empty paragraph, a table and a bad position', () => {
    const d = mk(['', 'x']);
    assert.deepEqual(pick(d.doc, C(d, 0, 0)).rPr, {extra: []});
    const t = mk(['a', {type: 'opaque', node: {name: 'w:tbl',
      attrs: [], children: []}}]);
    assert.equal(pick(t.doc, S.caret({id: blockId(blocks(t)[1]),
      off: 0})), null);
    assert.equal(pick(d.doc, S.caret({id: -999, off: 0})), null);
  });
});

describe('FormatPaint.paint: characters', () => {
  it('the run properties are replaced, not merged', () => {
    const d = mk([['xx yy', {runs: [{start: 0, end: 5,
      rPr: {b: true, i: true, color: 'FF0000', extra: []}}]}],
    ['src', {rPr: {u: 'single', extra: []}}]]);
    const picked = pick(d.doc, SEL(d, 1, 0, 1, 2));
    paintOn(d, SEL(d, 0, 1, 0, 4), picked);
    assert.deepEqual(runs(d, 0), [[0, 1, 'b,color,i', null],
      [1, 4, 'u', null], [4, 5, 'b,color,i', null]]);
    assert.equal(d.undoDepth, 1);
    assert.deepEqual(texts(d), ['xx yy', 'src']);
  });
  it('a nested field is replaced too (rFonts attributes)', () => {
    const d = mk([['ab', {rPr: {rFonts: {ascii: 'Arial', hAnsi: 'Arial'},
      extra: []}}], ['cd', {rPr: {rFonts: {ascii: 'Times'},
      extra: []}}]]);
    paintOn(d, SEL(d, 0, 0, 0, 2), pick(d.doc, C(d, 1, 1)));
    assert.deepEqual(P(d, 0).runs[0].rPr.rFonts, {ascii: 'Times'});
  });
  it('the character style is copied, or removed when the pick has' +
    ' none', () => {
    const d = mk([['ab', {rStyle: 'Strong'}], 'cd',
      ['ef', {rStyle: 'Emphasis'}]]);
    chars(d, 'Strong', 'Emphasis');
    paintOn(d, SEL(d, 1, 0, 1, 2), pick(d.doc, C(d, 0, 1)));
    assert.equal(P(d, 1).runs[0].rStyle, 'Strong');
    paintOn(d, SEL(d, 2, 0, 2, 2), pick(d.doc, C(d, 0, 1)));
    assert.equal(P(d, 2).runs[0].rStyle, 'Strong');
    const e = mk([['ab', {rStyle: 'Strong'}], 'cd']);
    chars(e, 'Strong');
    paintOn(e, SEL(e, 0, 0, 0, 2), pick(e.doc, C(e, 1, 1)));
    assert.equal(P(e, 0).runs[0].rStyle, undefined);
  });
  it('raw run elements of the pick come over; the target\'s go', () => {
    const rawC = {name: 'w:color', attrs: [['w:val', '00FF00'],
      ['w:themeColor', 'accent1']], children: []};
    const d = mk([['ab', {rPr: {color: 'FF0000', extra: []}}],
      ['cd', {rPr: {extra: [rawC]}}]]);
    // the conflict case: the target's modelled colour is removed, the
    // pick's raw colour (same element name) is kept
    paintOn(d, SEL(d, 0, 0, 0, 2), pick(d.doc, C(d, 1, 1)));
    assert.deepEqual(P(d, 0).runs[0].rPr, {extra: [rawC]});
    // and a target's raw element the pick lacks goes
    const e = mk([['ab', {rPr: {extra: [rawC]}}], 'cd']);
    paintOn(e, SEL(e, 0, 0, 0, 2), pick(e.doc, C(e, 1, 1)));
    assert.deepEqual(P(e, 0).runs[0].rPr, {extra: []});
  });
  it('across paragraphs: every one touched; undo restores all', () => {
    const d = mk([['aa', {rPr: B}], 'bb', 'cc', ['dd', {rPr: IT}]]);
    const before = snap(d);
    paintOn(d, SEL(d, 1, 1, 3, 1), pick(d.doc, C(d, 0, 1)));
    assert.deepEqual(runs(d, 1), [[0, 1, '', null], [1, 2, 'b', null]]);
    assert.deepEqual(runs(d, 2), [[0, 2, 'b', null]]);
    assert.deepEqual(runs(d, 3), [[0, 1, 'b', null], [1, 2, 'i', null]]);
    assert.equal(d.undoDepth, 1);
    undoAll(d, before);
  });
  it('the U+FFFC of an inline outside any run is skipped', () => {
    const d = mk([['a' + O + 'b', {runs: [{start: 0, end: 3, rPr:
      {extra: []}}], inlines: {1: raw('hyperlink')}}], ['z', {rPr: B}]]);
    const before = snap(d);
    paintOn(d, SEL(d, 0, 0, 0, 3), pick(d.doc, C(d, 1, 1)));
    assert.deepEqual(runs(d, 0), [[0, 1, 'b', null], [1, 2, '', null],
      [2, 3, 'b', null]]);
    assert.equal(P(d, 0).text, 'a' + O + 'b');
    undoAll(d, before);
  });
  it('nothing to change: no undo step, not dirty', () => {
    const d = mk([['aa', {rPr: B}], ['bb', {rPr: B}]]);
    const out = paintOn(d, SEL(d, 1, 0, 1, 2), pick(d.doc, C(d, 0, 1)));
    assert.ok(out);
    assert.equal(d.undoDepth, 0);
    assert.equal(d.dirty, false);
  });
  it('the selection is returned as it was', () => {
    const d = mk([['aa', {rPr: B}], 'bb']);
    const sel = SEL(d, 1, 0, 1, 2);
    assert.equal(paint(d, T(d), sel, pick(d.doc, C(d, 0, 1))), sel);
  });
  it('a bad selection or no pick does nothing', () => {
    const d = mk(['aa']);
    const bad = S.caret({id: -5, off: 0});
    assert.equal(paint(d, T(d), bad, {rPr: B}), bad);
    const c = C(d, 0, 0);
    assert.equal(paint(d, T(d), c, null), c);
    assert.equal(d.undoDepth, 0);
  });
});

describe('FormatPaint: fidelity and stale picks', () => {
  const rec = (name) => ({name: 'w:' + name, attrs: [['w:id', '7'],
    ['w:author', 'a']], children: []});
  it('id-bearing raw elements are not picked; the target keeps its ' +
    'own change records when its run properties are replaced', () => {
    const d = mk([['ab', {rPr: {b: true, extra: [rec('rPrChange')]}}],
      ['cd', {rPr: {i: true, extra: [rec('rPrChange')]}}]]);
    const picked = pick(d.doc, C(d, 0, 1));
    assert.deepEqual(picked.rPr, {b: true, extra: []});
    paintOn(d, SEL(d, 1, 0, 1, 2), picked);
    assert.deepEqual(P(d, 1).runs[0].rPr, {b: true,
      extra: [rec('rPrChange')]});
  });
  it('paragraph: a change record, sectPr and raw non-format children' +
    ' are never picked, the target\'s stay', () => {
    const keep = rec('pPrChange'), bidi = {name: 'w:bidi', attrs: [],
      children: []}, tabs = {name: 'w:tabs', attrs: [], children: []};
    const d = mk([['src', {pPr: {extra: [rec('pPrChange'), bidi,
      tabs]}}], ['dst', {pPr: {extra: [keep]}}]]);
    const picked = pick(d.doc, C(d, 0, 0));
    assert.ok(!picked.pPr.extra.includes(picked.pPr.extra.find((x) =>
      x.name === 'w:pPrChange')));
    paintOn(d, C(d, 1, 0), picked);
    assert.deepEqual(P(d, 1).pPr.extra, [keep, tabs]);
    // (bidi stays on the source; it is not carried)
    assert.ok(!P(d, 1).pPr.extra.includes(bidi));
  });
  it('a numbering or character style gone since the pick: that part' +
    ' of the pick is dropped, the target\'s list left alone', () => {
    const d = listDoc([li('one'), ['two', {rStyle: 'Gone'}], li('three')]);
    chars(d, 'Gone');
    const picked = pick(d.doc, C(d, 1, 1));
    assert.equal(picked.rStyle, 'Gone');
    const li2 = pick(d.doc, C(d, 0, 1));
    d.doc.styles.styles.delete('Gone');       // (as an undo would)
    d.doc.numbering = {...d.doc.numbering, nums: new Map()};
    paintOn(d, SEL(d, 1, 0, 1, 3), picked);
    assert.equal(P(d, 1).runs[0].rStyle, undefined);
    // the dangling list: three keeps its own numPr
    paintOn(d, C(d, 2, 0), li2);
    assert.deepEqual(P(d, 2).pPr.numPr, {numId: 1, ilvl: 0});
  });
});

describe('FormatPaint.paint: a caret (a click)', () => {
  it('paints the word there and the paragraph', () => {
    const d = mk([['one two three', {rPr: B, pPr: {jc: 'center',
      extra: []}}], 'a bc d']);
    const picked = pick(d.doc, C(d, 0, 1));
    paintOn(d, C(d, 1, 3), picked, layout(d));
    assert.deepEqual(runs(d, 1), [[0, 2, '', null], [2, 4, 'b', null],
      [4, 6, '', null]]);
    assert.equal(P(d, 1).pPr.jc, 'center');
  });
  it('without a layout only the paragraph is painted', () => {
    const d = mk([['x', {rPr: B, pPr: {jc: 'right', extra: []}}], 'ab']);
    paintOn(d, C(d, 1, 1), pick(d.doc, C(d, 0, 0)));
    assert.deepEqual(runs(d, 1), [[0, 2, '', null]]);
    assert.equal(P(d, 1).pPr.jc, 'right');
  });
  it('a character-only pick leaves the paragraph alone', () => {
    const d = mk([['ab', {rPr: B}], ['cd', {pPr: {jc: 'right',
      extra: []}}]]);
    const picked = pick(d.doc, SEL(d, 0, 0, 0, 1));
    assert.equal(picked.pPr, undefined);
    paintOn(d, SEL(d, 1, 0, 1, 2), picked);
    assert.equal(P(d, 1).pPr.jc, 'right');
    assert.deepEqual(runs(d, 1), [[0, 2, 'b', null]]);
  });
});

describe('FormatPaint.paint: paragraphs', () => {
  it('the paragraph format is replaced: what the pick lacks goes',
    () => {
      const d = mk([['src', {pPr: {jc: 'center', extra: []}}],
        ['dst', {pPr: {jc: 'right', ind: {left: 720},
          spacing: {before: 240}, extra: []}, pStyle: 'Title'}]]);
      const picked = pick(d.doc, SEL(d, 0, 0, 0, 3));
      paintOn(d, C(d, 1, 0), picked);
      assert.deepEqual(P(d, 1).pPr, {jc: 'center', extra: []});
      assert.equal(P(d, 1).pStyle, undefined);
      assert.equal(d.undoDepth, 1);
    });
  it('the pick\'s style comes over', () => {
    const d = mk([['src', {pStyle: 'Title'}], 'dst']);
    paintOn(d, C(d, 1, 0), pick(d.doc, C(d, 0, 0)));
    assert.equal(P(d, 1).pStyle, 'Title');
  });
  it('the list format is carried: numPr and level, and taken away',
    () => {
      const d = listDoc([li('one', 2), 'plain', li('two', 0)]);
      paintOn(d, C(d, 1, 0), pick(d.doc, C(d, 0, 0)));
      assert.deepEqual(P(d, 1).pPr.numPr, {numId: 1, ilvl: 2});
      // a plain paragraph's format takes a list item out of its list
      paintOn(d, C(d, 2, 0), {rPr: {extra: []}, pPr: {extra: []},
        pStyle: null});
      assert.equal(P(d, 2).pPr.numPr, undefined);
    });
  it('raw paragraph elements: the pick\'s format ones come over, the' +
    ' target\'s are replaced, other raw (the mark\'s rPr) stay', () => {
    const tabs = {name: 'w:tabs', attrs: [], children: []};
    const mark = {name: 'w:rPr', attrs: [], children: []};
    const d = mk([['src', {pPr: {extra: [tabs]}}],
      ['dst', {pPr: {extra: [mark]}}]]);
    paintOn(d, C(d, 1, 0), pick(d.doc, C(d, 0, 0)));
    assert.deepEqual(P(d, 1).pPr.extra, [mark, tabs]);
    const e = mk([['src'], ['dst', {pPr: {extra: [tabs, mark]}}]]);
    paintOn(e, C(e, 1, 0), pick(e.doc, C(e, 0, 0)));
    assert.deepEqual(P(e, 1).pPr.extra, [mark]);
  });
  it('only paragraphs the selection reaches: a last one it only' +
    ' touches the start of is left alone', () => {
    const d = mk([['s', {pPr: {jc: 'center', extra: []}}], 'a', 'b']);
    paintOn(d, SEL(d, 1, 0, 2, 0), pick(d.doc, C(d, 0, 0)));
    assert.equal(P(d, 1).pPr.jc, 'center');
    assert.equal(P(d, 2).pPr.jc, undefined);
  });
  it('a table between is skipped', () => {
    const t = {type: 'opaque', node: {name: 'w:tbl', attrs: [],
      children: []}};
    const d = mk([['s', {pPr: {jc: 'center', extra: []}}], 'a', t, 'b']);
    paintOn(d, SEL(d, 1, 0, 3, 1), pick(d.doc, C(d, 0, 0)));
    assert.equal(P(d, 1).pPr.jc, 'center');
    assert.equal(P(d, 3).pPr.jc, 'center');
  });
});

describe('FormatPaint at scale', () => {
  it('50,000 paragraphs painted at once in well under 5 s; one step',
    () => {
      const d = mk([['x', {rPr: B, pPr: {jc: 'center', extra: []}}],
        ...Array.from({length: 50000}, () => 'text')]);
      const picked = pick(d.doc, C(d, 0, 0));
      const t0 = Date.now();
      const sel = SEL(d, 1, 0, 50000, 4);
      paint(d, T(d), sel, picked);
      assert.ok(Date.now() - t0 < 5000);
      assert.equal(d.undoDepth, 1);
      assert.equal(P(d, 50000).pPr.jc, 'center');
      const t1 = Date.now();
      d.undo();
      assert.ok(Date.now() - t1 < 5000);
      assert.equal(P(d, 50000).pPr.jc, undefined);
    });
});
