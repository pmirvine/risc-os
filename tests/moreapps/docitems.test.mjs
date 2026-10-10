// DocItems and DocStack: which lines a layout made from an older one
// keeps (the reuse key: the paragraph object, its label, its
// section-end mark; doc.styles, doc.numbering and doc.rawSettings by
// identity), and decorators' gaps: items below a gap move down by it
// and itemAtY, hitTest, caretRect and selectionRects agree.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {reuseKey, sameKey, sameMark, markOf} from
  '../../tools/moreapps/!Word/DocItems';
import {sectDeco} from '../../tools/moreapps/!Word/SectDeco';
import {flowDeco} from '../../tools/moreapps/!Word/FlowDeco';
import {borderDeco} from '../../tools/moreapps/!Word/BorderGroups';
import {DECORATORS} from '../../tools/moreapps/!Word/DocStack';
import {spacingDeco} from '../../tools/moreapps/!Word/ParaSpace';
import {selectAll} from '../../tools/moreapps/!Word/Selection';
import {loadStyles, tm, mkDoc, para, box} from './word-docs.mjs';

before(loadStyles);

const TEXTS = ['hello world', 'second paragraph a little longer ' +
  'than one line of text, as it goes on and on and on and on and on',
  'third', 'fourth one here', 'fifth', ''];
const laid = (doc, prev, opts) => {
  const L = new DocLayout(doc, prev ? prev.metrics : tm(), prev, opts);
  L.layout(1000);
  return L;
};
const kept = (a, b) => b.items.map((it) => it.kind === 'p' &&
  a.byId.get(it.id) && a.byId.get(it.id).lines === it.lines);
const typeNode = (v) => ({name: 'w:type',
  attrs: v === undefined ? [] : [['w:val', v]], children: []});
const sect = (blocks, extra = []) => ({props: {extra}, raw: null,
  blocks: blocks.map((b) => (b && b.type ? b : para(b)))});

describe('DocItems reuse key', () => {
  it('unchanged paragraphs keep their lines', () => {
    const doc = mkDoc(TEXTS);
    const a = laid(doc), b = laid(doc, a);
    assert.ok(kept(a, b).every(Boolean));
  });
  for (const field of ['styles', 'numbering', 'rawSettings']) {
    it(`a replaced doc.${field} drops them all`, () => {
      const doc = mkDoc(TEXTS);
      doc.numbering = {raw: null, nums: new Map()};
      doc.rawSettings = {name: 'w:settings', attrs: [], children: []};
      const a = laid(doc);
      doc[field] = {...doc[field]};
      const b = laid(doc, a);
      assert.ok(kept(a, b).every((k) => !k), field);
      assert.equal(b[field === 'rawSettings' ? 'settings' : field],
        doc[field]);
      assert.ok(kept(b, laid(doc, b)).every(Boolean));
    });
  }
  it('section-end marks: the last block of each section but the ' +
    'last (a paragraph or a box), the FOLLOWING section\'s type',
  () => {
    const doc = mkDoc([]);
    doc.sections = [sect(['a', 'b']), sect(['c', box()]),
      sect(['d'], [typeNode('continuous')]), sect(['e', 'f'])];
    doc.sections[3].props.type = 'evenPage';
    const L = laid(doc);
    assert.deepEqual(L.items.map((it) => it.mark || null),
      [null, {type: 'nextPage'}, null, {type: 'continuous'},
        {type: 'evenPage'}, null, null]);
  });
  it('a changed mark drops that paragraph only; an equal one keeps',
    () => {
      const doc = mkDoc([]);
      doc.sections = [sect(['a', 'b']), sect(['c', 'd'])];
      const a = laid(doc);
      // (the same type in a new props object: kept; the mark of
      // section 0 is section 1's type)
      doc.sections = [doc.sections[0], {...doc.sections[1],
        props: {extra: [typeNode('nextPage')]}}];
      const b = laid(doc, a);
      assert.deepEqual(kept(a, b), [true, true, true, true]);
      doc.sections = [doc.sections[0], {...doc.sections[1],
        props: {type: 'evenPage', extra: []}}];
      const c = laid(doc, b);
      assert.deepEqual(kept(b, c), [true, false, true, true]);
      // the sections merged (stub of a later op): b no longer ends one
      doc.sections = [{...doc.sections[0], blocks: [
        ...doc.sections[0].blocks, ...doc.sections[1].blocks]}];
      const d = laid(doc, c);
      assert.deepEqual(kept(c, d), [true, false, true, true]);
      assert.equal(d.items[1].mark, null);
    });
  it('markOf: hostile w:type nodes and sections', () => {
    const two = (props) => ({sections: [sect(['a']),
      {props, blocks: [], raw: null}]});
    assert.equal(markOf(two({extra: []}), 1), null, 'the last');
    assert.equal(markOf(two({extra: []}), 2), null);
    assert.equal(markOf(two({extra: []}), -1), null);
    assert.equal(markOf(undefined, 0), null);
    assert.deepEqual(markOf(two(undefined), 0), {type: 'nextPage'});
    assert.deepEqual(markOf(two({}), 0), {type: 'nextPage'});
    assert.deepEqual(markOf(two({extra: [typeNode(), null,
      {name: 'w:type'}, {name: 'w:type', attrs: [['w:val', 5]]}]}), 0),
    {type: 'nextPage'});
    assert.deepEqual(markOf(two({extra: [typeNode('__proto__')]}), 0),
      {type: '__proto__'});
    assert.deepEqual(markOf(two({type: 'oddPage', extra: [
      typeNode('continuous')]}), 0), {type: 'oddPage'},
    'the field first');
  });
  it('reuseKey / sameKey / sameMark', () => {
    const L = laid(mkDoc(TEXTS));
    const it0 = L.items[0], k = reuseKey(it0);
    assert.deepEqual(Object.keys(k), ['block', 'list', 'mark']);
    assert.equal(k.block, it0.block);
    assert.ok(sameKey(k, reuseKey(it0)));
    assert.ok(!sameKey(k, reuseKey(L.items[1])));
    assert.ok(!sameKey(k, {...k, mark: {type: 'nextPage'}}));
    assert.ok(sameMark(null, null));
    assert.ok(sameMark({type: 'x'}, {type: 'x'}));
    assert.ok(!sameMark({type: 'x'}, null));
    assert.ok(!sameMark({type: 'x'}, {type: 'y'}));
  });
});

describe('DocStack decorators', () => {
  const doc = () => mkDoc([...TEXTS.slice(0, 3), box(),
    ...TEXTS.slice(3)]);
  const gap3 = (it) => (it.index === 3 ? {gapAbove: 10} : null);
  it('by default ParaSpace\'s, BorderGroups\', SectDeco\'s and ' +
    'FlowDeco\'s (no contextual spacing, no borders, one section ' +
    'here): items edge to edge, gaps 0', () => {
    const L = laid(doc());
    assert.equal(L.decorators, DECORATORS);
    assert.deepEqual([...DECORATORS], [spacingDeco, borderDeco, sectDeco,
      flowDeco]);
    assert.ok(Object.isFrozen(DECORATORS));
    for (const it of L.items) {
      assert.equal(it.gapAbove, 0);
      assert.equal(it.gapBelow, 0);
      assert.deepEqual(it.marks, []);
    }
  });
  it('gapAbove 10 on item 3 moves items 3.. down by 10; the rest ' +
    'agrees', () => {
    const d = doc(), a = laid(d), L = laid(d, null,
      {decorators: [gap3]});
    for (const it of L.items) {
      const o = a.byId.get(it.id);
      assert.equal(it.y, o.y + (it.index >= 3 ? 10 : 0), it.index);
      assert.equal(it.h, o.h);
    }
    assert.equal(L.height, a.height);  // (a short page: a whole one)
    const i2 = L.items[2], i3 = L.items[3], i4 = L.items[4];
    assert.equal(i3.gapAbove, 10);
    assert.equal(L.itemAtY(i2.y + i2.h - 0.5), i2);
    assert.equal(L.itemAtY(i2.y + i2.h), i3);   // in the gap: below
    assert.equal(L.itemAtY(i3.y - 0.5), i3);
    assert.equal(L.itemAtY(i4.y), i4);
    // a hit in the gap above a paragraph: its first line
    const g = laid(d, null, {decorators: [(it) => (it.index === 4
      ? {gapAbove: 10} : null)]});
    const p4 = g.items[4];
    assert.deepEqual(g.hitTest(g.left, p4.y - 5).pos,
      {id: p4.id, off: 0});
    // round trips on every offset of every paragraph
    for (const it of L.items) {
      if (it.kind !== 'p') continue;
      for (let off = 0; off <= it.block.text.length; off++) {
        const pos = {id: it.id, off};
        for (const aff of ['down', 'up']) {
          const c = L.caretRect(pos, aff), c0 = a.caretRect(pos, aff);
          assert.equal(c.x, c0.x);
          assert.equal(c.y, c0.y + (it.index >= 3 ? 10 : 0));
          const h = L.hitTest(c.x, c.y + c.h / 2);
          assert.deepEqual(L.caretRect(h.pos, h.affinity), c,
            `${it.index}:${off}:${aff}`);
        }
      }
    }
    const rs = L.selectionRects(selectAll(L));
    const r0 = a.selectionRects(selectAll(a));
    assert.equal(rs.length, r0.length);
    const y3 = i3.y;
    rs.forEach((r, k) => {
      assert.equal(r.x, r0[k].x);
      assert.equal(r.y, r0[k].y + (r.y >= y3 ? 10 : 0));
    });
  });
  it('gapBelow, marks, the order, bad gaps, the ends', () => {
    const seen = [];
    const one = (it, L, acc) => {
      seen.push(acc.gapAbove);
      return {gapAbove: 4, gapBelow: 6, marks: [{k: 'one'}]};
    };
    const two = () => ({gapAbove: NaN, gapBelow: -5,
      marks: [{k: 'two'}]});
    const bad = () => ({gapAbove: Infinity, marks: 'x'});
    const d = doc(), a = laid(d);
    const L = laid(d, null, {decorators: [one, two, bad, () => null]});
    assert.deepEqual(seen, [0, 0, 0, 0, 0, 0, 0]);
    L.items.forEach((it, k) => {
      assert.equal(it.gapAbove, 4);
      assert.equal(it.gapBelow, 6);
      assert.deepEqual(it.marks.map((m) => m.k), ['one', 'two']);
      assert.equal(it.y, a.items[k].y + 4 + 10 * k);
    });
    const last = L.items.at(-1), first = L.items[0];
    // above the first item's text: the start; below the last: the end
    assert.deepEqual(L.hitTest(L.left + 50, first.y - 2).pos,
      L.docStart());
    assert.deepEqual(L.hitTest(L.left, last.y + last.h + 3).pos,
      L.docEnd());
    assert.equal(L.itemAtY(last.y + last.h + 3), last);
  });
  it('kept under the reuse key: unchanged blocks are not asked ' +
    'again', () => {
    let calls = 0;
    const decos = [(it) => { calls++; return {gapBelow: 2}; }];
    const d = doc(), a = laid(d, null, {decorators: decos});
    assert.equal(calls, 7);
    const b = laid(d, a);
    assert.equal(b.decorators, decos);
    assert.equal(calls, 7);
    assert.equal(b.items[5].gapBelow, 2);
    const blocks = d.sections[0].blocks;
    d.sections = [{...d.sections[0], blocks: [para('new'),
      ...blocks.slice(1)]}];
    const c = laid(d, b);
    assert.equal(calls, 8);
    d.styles = {...d.styles};
    laid(d, c);
    assert.equal(calls, 15);
    laid(d, c, {decorators: [...decos]});
    assert.equal(calls, 22);
  });
});

describe('DocStack decorator key (stale results)', () => {
  const doc = () => mkDoc(TEXTS);
  it('a new text width asks again', () => {
    const decos = [(it, L) => ({gapAbove: L.textW > 500 ? 10 : 2})];
    const d = doc(), a = laid(d, null, {decorators: decos});
    assert.equal(a.items[2].gapAbove, 10);
    d.sections = [{...d.sections[0], props: {extra: [],
      pgMar: {left: 1440, right: 6000}}}];
    const b = laid(d, a);
    assert.ok(b.textW < 500);
    assert.deepEqual(b.items.map((i) => i.gapAbove), TEXTS.map(() => 2));
  });
  it('new metrics ask again', () => {
    const decos = [(it, L) => ({gapBelow: L.metrics.tag || 0})];
    const d = doc(), a = laid(d, null, {decorators: decos});
    const m = tm();
    m.tag = 7;
    const b = new DocLayout(d, m, a);
    b.layout(1000);
    assert.deepEqual(b.items.map((i) => i.gapBelow), TEXTS.map(() => 7));
  });
  it('a replaced doc.numbering (the label) asks again', () => {
    const lvl = (t) => ({ilvl: 0, numFmt: 'decimal', lvlText: t,
      start: 1, suff: 'tab', pPr: {ind: {left: 720, hanging: 360}}});
    const nums = (t) => ({raw: null, nums: new Map([[1, {abstractNumId: 1,
      levels: [lvl(t)], overrides: new Map()}]])});
    const decos = [(it) => ({gapAbove: it.list ? it.list.text.length
      : 0})];
    const d = mkDoc([['one', {pPr: {numPr: {numId: 1, ilvl: 0}}}],
      'two']);
    d.numbering = nums('%1.');
    const a = laid(d, null, {decorators: decos});
    assert.equal(a.items[0].gapAbove, 2);
    d.numbering = nums('(%1)');
    const b = laid(d, a);
    assert.equal(b.items[0].gapAbove, 3);
  });
  it('keyOf: a decorator that reads the paragraph above', () => {
    let calls = 0;
    const above = (it, L) => {
      calls++;
      const p = L.items[it.index - 1];
      return {gapAbove: p && p.kind === 'p' ? p.block.text.length : 0};
    };
    above.keyOf = (it, L) => {
      const p = L.items[it.index - 1];
      return p ? p.block : null;
    };
    const d = doc(), a = laid(d, null, {decorators: [above]});
    assert.equal(a.items[3].gapAbove, TEXTS[2].length);
    assert.equal(calls, TEXTS.length);
    const bs = d.sections[0].blocks.slice();
    bs[2] = para('changed text');
    d.sections = [{...d.sections[0], blocks: bs}];
    const b = laid(d, a);
    // item 2 is new, item 3's neighbour is new: two asked again
    assert.equal(calls, TEXTS.length + 2);
    assert.equal(b.items[3].gapAbove, 'changed text'.length);
    const full = laid(d, null, {decorators: [above]});
    assert.deepEqual(b.items.map((i) => i.y), full.items.map((i) => i.y));
  });
  it('invalidate() asks again', () => {
    let calls = 0;
    const decos = [() => { calls++; return null; }];
    const L = laid(doc(), null, {decorators: decos});
    L.invalidate();
    L.layout(1000);
    assert.equal(calls, 2 * TEXTS.length);
  });
});
