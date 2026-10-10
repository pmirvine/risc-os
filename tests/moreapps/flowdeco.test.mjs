// FlowDeco: "page break before" on the screen: the flag resolved
// from the paragraph, its style and the defaults; a 12 px gap above
// and a mark; no cut of contextual spacing across it; reuse equals a
// full layout while the flag, the style or the styles change; the
// rule is painted (also when only the gap is in the rect); clicks in
// the gap belong to the paragraph below; hostile flag values.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {flowDeco, breaksBefore, flowMark, flowPaint, GAP}
  from '../../tools/moreapps/!Word/FlowDeco';
import {DECORATORS} from '../../tools/moreapps/!Word/DocStack';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {paint} from '../../tools/moreapps/!Word/DocPaint';
import {addStyle} from '../../tools/moreapps/!Word/Styles';
import {mk} from './edit-docs.mjs';
import {tm} from './word-docs.mjs';

const PB = {pPr: {pageBreakBefore: true, extra: []}};
const M = tm();
const laid = (d, prev, opts) => {
  const L = new DocLayout(d.doc, M, prev, opts);
  L.layout(900);
  return L;
};
const bareLayout = (d) => laid(d, null, {decorators: []});

describe('FlowDeco: the flag', () => {
  it('direct, style and defaults: the last layer that says', () => {
    const d = mk(['a', ['b', PB], ['c', {pPr: {pageBreakBefore: false,
      extra: []}}]]);
    const st = d.doc.styles;
    const [a, b, c] = d.doc.sections[0].blocks;
    assert.equal(breaksBefore(st, a), false);
    assert.equal(breaksBefore(st, b), true);
    assert.equal(breaksBefore(st, c), false);
    addStyle(st, {id: 'PBStyle', type: 'paragraph', name: 'pb',
      pPr: {pageBreakBefore: true, extra: []}});
    assert.equal(breaksBefore(st, {...a, pStyle: 'PBStyle'}), true);
    // direct false beats the style
    assert.equal(breaksBefore(st, {...c, pStyle: 'PBStyle'}), false);
    st.docDefaults.pPr = {...st.docDefaults.pPr,
      pageBreakBefore: true};
    assert.equal(breaksBefore(st, a), true);
    assert.equal(breaksBefore(null, b), true);
  });
  it('a flag that is not a boolean counts for nothing', () => {
    const d = mk([['a', {pPr: {pageBreakBefore: 'true', extra: []}}],
      ['b', {pPr: {pageBreakBefore: 1, extra: []}}],
      ['c', {pPr: {pageBreakBefore: null, extra: []}}]]);
    for (const b of d.doc.sections[0].blocks) {
      assert.equal(breaksBefore(d.doc.styles, b), false);
    }
    const L = laid(d);
    assert.deepEqual(L.items.map((i) => i.gapAbove), [0, 0, 0]);
  });
  it('flowDeco: kept blocks, bad items, no flag give null', () => {
    const d = mk(['a']);
    const L = {doc: d.doc};
    assert.equal(flowDeco(null, L), null);
    assert.equal(flowDeco({kind: 'box'}, L), null);
    assert.equal(flowDeco({kind: 'p', block: null}, L), null);
    assert.equal(flowDeco({kind: 'p', block: d.doc.sections[0].blocks[0]},
      L), null);
  });
  it('the decorator list ends with flowDeco', () => {
    assert.equal(DECORATORS.at(-1), flowDeco);
  });
});

describe('FlowDeco: the gap and the mark', () => {
  it('12 px above the paragraph, a mark -12 .. 0 from its top', () => {
    const d = mk(['one', ['two', PB], 'three']);
    const L = laid(d), plain = bareLayout(d);
    const [a, b, c] = L.items;
    assert.equal(GAP, 12);
    assert.equal(a.gapAbove, 0);
    assert.equal(b.gapAbove, 12);
    assert.equal(c.gapAbove, 0);
    assert.equal(b.y, plain.items[1].y + 12);
    assert.equal(c.y, plain.items[2].y + 12);
    const m = flowMark(b);
    assert.deepEqual({...m}, {kind: 'flow', label: 'Page break before',
      dy: -12, h: 12});
    assert.ok(Object.isFrozen(m));
    assert.equal(flowMark(a), null);
    assert.equal(flowMark(null), null);
    // the rule is in the gap: below the end of the item above
    assert.equal(b.y + m.dy, a.y + a.h + a.gapBelow);
  });
  it('the first paragraph has it too (the flag is shown)', () => {
    const d = mk([['one', PB]]);
    const L = laid(d);
    assert.equal(L.items[0].gapAbove, 12);
  });
  it('nothing changes when no paragraph has the flag', () => {
    const d = mk(['one', 'two', 'three']);
    const L = laid(d);
    assert.deepEqual(L.items.map((i) => [i.y, i.gapAbove, i.marks.length]),
      bareLayout(d).items.map((i) => [i.y, 0, 0]));
  });
  it('it is never text: lines, offsets and ids are the same', () => {
    const d = mk(['one', ['two', PB]]);
    const L = laid(d), plain = bareLayout(d);
    assert.equal(L.items[1].lines.length, plain.items[1].lines.length);
    assert.equal(L.items[1].block.text, 'two');
  });
  it('contextual spacing is not cut across it', () => {
    const LP = (t, extra = {}) => [t, {pStyle: 'ListParagraph',
      pPr: {spacing: {before: 120, after: 240}, ...extra, extra: []}}];
    const d = mk([LP('one'), LP('two', {pageBreakBefore: true}),
      LP('three')]);
    const L = laid(d);
    assert.equal(L.items[1].gapAbove, 12, 'only the 12 px gap');
    assert.ok(L.items[2].gapAbove < 0, 'still cut where no flag');
  });
  it('under a section band: both gaps count', () => {
    const d = mk(['one', ['two', PB]]);
    d.apply({op: 'splitSection', at: [0, 0], props: {extra: []}, raw: null});
    const L = laid(d);
    const [a, b] = L.items;
    assert.equal(a.gapBelow, 18);
    assert.equal(b.gapAbove, 12);
    assert.equal(b.y, a.y + a.h + 18 + 12);
  });
});

describe('FlowDeco: reuse equals a full layout', () => {
  const shape = (L) => L.items.map((i) => [i.y, i.h, i.gapAbove,
    i.gapBelow, i.marks.map((m) => m.kind)]);
  it('flag, style and docDefaults changes', () => {
    const d = mk(['one', 'two', 'three', 'four']);
    let L = laid(d);
    const flip = (k, v) => d.apply({op: 'setProps', block: [0, k],
      pPr: {pageBreakBefore: v}});
    for (const [k, v] of [[1, true], [2, true], [1, null], [3, true],
      [3, false], [0, true]]) {
      flip(k, v);
      const prev = L;
      L = laid(d, prev);
      assert.deepEqual(shape(L), shape(laid(d)), `${k} ${v}`);
    }
    // the untouched ones are reused with their lines
    const e = laid(d, L);
    assert.equal(e.items[1].lines, L.items[1].lines);
    // a style that gains the flag: the paragraphs using it change
    addStyle(d.doc.styles, {id: 'PBS', type: 'paragraph', name: 'x',
      pPr: {pageBreakBefore: true, extra: []}});
    d.apply({op: 'setProps', block: [0, 2], pStyle: 'PBS'});
    const f = laid(d, e);
    assert.equal(f.items[2].gapAbove, 12);
    assert.deepEqual(shape(f), shape(laid(d)));
  });
});

describe('FlowDeco: painting and clicks', () => {
  function fakeG() {
    const g = {rects: [], texts: [], font: '', fillStyle: '',
      strokeStyle: '', lineWidth: 1, textBaseline: '',
      fillRect: (x, y) => g.rects.push(y),
      fillText: (t) => g.texts.push(t),
      strokeRect() {}, measureText: (t) => ({width: t.length * 6}),
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}};
    return g;
  }
  it('flowPaint: one rule, the label in the middle, dots only when ' +
    'too narrow', () => {
    const m = {kind: 'flow', label: 'x', dy: -12, h: 12};
    const w = flowPaint(m, 600, 100);
    assert.equal(w.y, 7);
    assert.equal(w.label, 250);
    assert.deepEqual(w.dots, [[0, 244], [356, 600]]);
    const n = flowPaint(m, 100, 100);
    assert.equal(n.label, null);
    assert.deepEqual(n.dots, [[0, 100]]);
    assert.equal(flowPaint(m, 100, NaN).label, null);
  });
  it('drawn in the gap; a rect only in the gap draws it, one ' +
    'beside it does not', () => {
    const d = mk(['one', ['two', PB]]);
    const L = laid(d);
    const b = L.items[1];
    const g = fakeG();
    paint(L, g, {x0: 0, y0: b.y - 11, x1: 2000, y1: b.y - 1});
    assert.deepEqual(g.texts, ['Page break before']);
    assert.ok(g.rects.length > 50 && g.rects.every((y) => y >= b.y - 12
      && y < b.y), 'dots in the gap');
    const h = fakeG();
    paint(L, h, {x0: 0, y0: 0, x1: 2000, y1: b.y - 13});
    assert.ok(!h.texts.includes('Page break before'));
    const k = fakeG();
    paint(L, k, {x0: 0, y0: b.y + 2, x1: 2000, y1: b.y + 10});
    assert.ok(!k.texts.includes('Page break before'));
    const all = fakeG();
    paint(L, all, {x0: 0, y0: 0, x1: 2000, y1: 5000});
    assert.equal(all.texts.filter((t) => t === 'Page break before')
      .length, 1);
  });
  it('a click in the gap is in the paragraph below, never in a ' +
    'new place', () => {
    const d = mk(['one', ['two', PB]]);
    const L = laid(d);
    const b = L.items[1];
    for (const dy of [-11, -6, -1]) {
      assert.equal(L.itemAtY(b.y + dy), b);
      const h = L.hitTest(L.left + 3, b.y + dy);
      assert.equal(h.pos.id, b.id);
      assert.equal(h.pos.off, 0);
    }
  });
});
