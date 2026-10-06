// DocLayout: the document laid out as a page-width column of
// paragraphs and kept blocks; positions <-> places across the items.
// Measured with a fake: 8 px per UTF-16 unit.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {selectAll} from '../../tools/moreapps/!Word/Selection';
import * as PM from '../../tools/moreapps/!Word/PositionMap';
import {loadStyles, tm, mkDoc, box} from './word-docs.mjs';

before(loadStyles);

const A4W = 11906 / 15, TEXTW = (11906 - 2880) / 15;
const three = () => mkDoc(['hello world', 'second para', box(),
  'third one here']);
const laid = (doc = three(), w = 1000) => {
  const L = new DocLayout(doc, tm());
  L.layout(w);
  return L;
};
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6,
  `${msg ?? ''} ${a} != ${b}`);

describe('DocLayout column', () => {
  it('A4 by default: page and text widths, centred', () => {
    const L = new DocLayout(three(), tm());
    const r = L.layout(1000);
    near(L.pageW, A4W, 'page');
    near(L.textW, TEXTW, 'text');
    near(L.pageLeft, (1000 - A4W) / 2, 'page left');
    near(L.left, L.pageLeft + 96, 'text left');
    assert.equal(r.w, 1000);
    assert.equal(L.items[0].y, 24);
    const last = L.items.at(-1);
    near(r.h, last.y + last.h + 24, 'height');
  });
  it('a narrow view: no negative offsets, the extent holds the page',
    () => {
      const L = new DocLayout(three(), tm());
      const r = L.layout(300);
      assert.equal(L.pageLeft, 24);
      near(L.left, 24 + 96);
      assert.ok(r.w >= 24 + A4W + 24, `extent ${r.w}`);
    });
  it('page size and margins from the first section, clamped', () => {
    const props = {pgSz: {w: 12240, h: 15840},
      pgMar: {left: 720, right: 1080, top: 0, bottom: 0}, extra: []};
    const L = new DocLayout(mkDoc(['a'], props), tm());
    L.layout(2000);
    near(L.pageW, 12240 / 15);
    near(L.textW, (12240 - 1800) / 15);
    near(L.left, L.pageLeft + 48);
    const odd = new DocLayout(mkDoc(['a'], {pgSz: {w: 2000},
      pgMar: {left: 1000, right: 1000}, extra: []}), tm());
    odd.layout(800);
    assert.equal(odd.textW, 80);
    const huge = new DocLayout(mkDoc(['a'], {pgSz: {w: 1e9},
      pgMar: {left: 0, right: 0}, extra: []}), tm());
    const r = huge.layout(800);
    assert.equal(huge.textW, 4000);
    assert.ok(Number.isFinite(r.w) && r.w < 20000, `extent ${r.w}`);
  });
  it('a wider view moves the page, not the lines', () => {
    const L = laid();
    const lines = L.items[0].lines;
    L.layout(1400);
    assert.equal(L.items[0].lines, lines);
    near(L.pageLeft, (1400 - A4W) / 2);
  });
});

describe('DocLayout items', () => {
  it('paragraphs and a box, stacked, with ids', () => {
    const L = laid();
    assert.deepEqual(L.items.map((x) => x.kind), ['p', 'p', 'box', 'p']);
    const b = L.items[2];
    assert.equal(b.label, '[table - preserved, not shown]');
    assert.ok(b.h > 0 && !b.lines);
    for (let i = 1; i < L.items.length; i++) {
      near(L.items[i].y, L.items[i - 1].y + L.items[i - 1].h);
    }
    for (const x of L.items) assert.equal(L.byId.get(x.id), x);
    assert.equal(L.items[0].id, L.doc.sections[0].blocks[0].id);
    assert.equal(new Set(L.items.map((x) => x.id)).size, 4);
    // a box keeps its id when laid out again
    assert.equal(laid(L.doc).items[2].id, b.id);
  });
  it('itemAtY, next and previous', () => {
    const L = laid();
    const [a, b, c, d] = L.items;
    assert.equal(L.itemAtY(-5), a);
    assert.equal(L.itemAtY(b.y + 1), b);
    assert.equal(L.itemAtY(c.y + c.h / 2), c);
    assert.equal(L.itemAtY(1e9), d);
    assert.equal(L.nextItem(a), b);
    assert.equal(L.prevItem(a), null);
    assert.equal(L.nextItem(d), null);
    assert.equal(L.prevItem(d), c);
  });
  it('locate, paraStart and paraEnd', () => {
    const L = laid();
    const [a, , c] = L.items;
    const loc = L.locate({id: a.id, off: 99});
    assert.equal(loc.item, a);
    assert.equal(loc.off, 11);
    assert.equal(loc.index, 0);
    assert.equal(L.locate({id: 123456789, off: 0}), null);
    assert.deepEqual(L.paraStart({id: a.id, off: 4}), {id: a.id, off: 0});
    assert.deepEqual(L.paraEnd({id: a.id, off: 4}), {id: a.id, off: 11});
    assert.deepEqual(L.paraEnd({id: c.id, off: 0}), {id: c.id, off: 1});
  });
});

describe('DocLayout caret and hits', () => {
  it('caretRect: a paragraph as PositionMap, moved to the column', () => {
    const L = laid();
    for (const x of [L.items[0], L.items[3]]) {
      for (const off of [0, 3, x.block.text.length]) {
        const pm = PM.caretRect(x, off);
        const c = L.caretRect({id: x.id, off});
        assert.deepEqual(c, {x: pm.x + L.left, y: pm.y, h: pm.h});
      }
    }
    near(L.caretRect({id: L.items[0].id, off: 3}).x, L.left + 24);
  });
  it('caretRect: before and after a box', () => {
    const L = laid(), b = L.items[2];
    const c0 = L.caretRect({id: b.id, off: 0});
    const c1 = L.caretRect({id: b.id, off: 1});
    near(c0.x, L.left);
    near(c1.x, L.left + L.textW);
    assert.ok(c0.y >= b.y && c0.y + c0.h <= b.y + b.h);
  });
  it('hitTest: in paragraphs, in a box, above and below', () => {
    const L = laid(), [a, , c, d] = L.items;
    const ly = (x, i) => x.y + x.lines[i].y + 2;
    assert.deepEqual(L.hitTest(L.left + 25, ly(a, 0)),
      {pos: {id: a.id, off: 3}, affinity: 'down'});
    assert.deepEqual(L.hitTest(L.left + 1000, ly(d, 0)).pos,
      {id: d.id, off: 14});
    assert.deepEqual(L.hitTest(L.left + 10, c.y + 5).pos,
      {id: c.id, off: 0});
    assert.deepEqual(L.hitTest(L.left + L.textW - 10, c.y + 5).pos,
      {id: c.id, off: 1});
    assert.deepEqual(L.hitTest(500, -40).pos, {id: a.id, off: 0});
    assert.deepEqual(L.hitTest(500, 1e6).pos, {id: d.id, off: 14});
    assert.deepEqual(L.hitTest(-1e9, ly(a, 0)).pos, {id: a.id, off: 0});
  });
  it('hitTest at the bottom margin is the end of the document', () => {
    const L = laid(mkDoc(['ab', 'cd'])), d = L.items[1];
    assert.deepEqual(L.hitTest(L.left, d.y + d.h + 3).pos,
      {id: d.id, off: 2});
  });
});

describe('DocLayout selectionRects', () => {
  const sel = (a, b) => ({anchor: a, head: b, affinity: 'down',
    goalX: null});
  it('across paragraphs and a box, with paragraph-mark stubs', () => {
    const L = laid(), [a, b, c, d] = L.items;
    const rs = L.selectionRects(sel({id: a.id, off: 6},
      {id: d.id, off: 5}));
    const ofA = rs.filter((x) => x.y < b.y);
    // 'world' and the mark of a
    assert.deepEqual(ofA.map((x) => [x.x - L.left, x.w]),
      [[48, 40], [88, 6]]);
    const ofB = rs.filter((x) => x.y >= b.y && x.y < c.y);
    assert.deepEqual(ofB.map((x) => [x.x - L.left, x.w]),
      [[0, 88], [88, 6]]);
    const ofC = rs.filter((x) => x.y >= c.y && x.y < d.y);
    assert.equal(ofC.length, 1);
    near(ofC[0].x, L.left);
    near(ofC[0].w, L.textW);
    const ofD = rs.filter((x) => x.y >= d.y);
    assert.deepEqual(ofD.map((x) => [x.x - L.left, x.w]), [[0, 40]]);
    // the same, whichever end is the anchor
    assert.deepEqual(L.selectionRects(sel({id: d.id, off: 5},
      {id: a.id, off: 6})), rs);
  });
  it('a box half in the range is not lit; one fully in is', () => {
    const L = laid(), [, b, c] = L.items;
    assert.equal(L.selectionRects(sel({id: c.id, off: 0},
      {id: c.id, off: 0})).length, 0);
    const rs = L.selectionRects(sel({id: b.id, off: 11},
      {id: c.id, off: 0}));
    // only the mark of b
    assert.deepEqual(rs.map((x) => x.w), [6]);
    const all = L.selectionRects(sel({id: c.id, off: 0},
      {id: c.id, off: 1}));
    assert.equal(all.length, 1);
  });
  it('an empty paragraph crossed shows its stub', () => {
    const L = laid(mkDoc(['ab', '', 'cd'])), [a, , c] = L.items;
    const rs = L.selectionRects(sel({id: a.id, off: 2},
      {id: c.id, off: 0}));
    assert.deepEqual(rs.map((x) => x.w), [6, 6]);
  });
  it('only the items in a y range', () => {
    const L = laid(), [a, b, c, d] = L.items;
    const s = sel({id: a.id, off: 0}, {id: d.id, off: 14});
    const rs = L.selectionRects(s, b.y, c.y + c.h - 1);
    assert.ok(rs.length > 0);
    assert.ok(rs.every((x) => x.y >= b.y && x.y < d.y));
  });
});

describe('DocLayout on a large document', () => {
  it('50,000 paragraphs: layout < 1.5 s; select all and the ' +
    'visible rects < 50 ms', () => {
    const words = 'the quick brown fox jumps over the lazy dog ';
    const blocks = [];
    for (let i = 0; i < 50000; i++) {
      blocks.push(i % 1000 === 7 ? box()
        : words.repeat(1 + (i % 5)) + i);
    }
    const doc = mkDoc(blocks);
    let t0 = performance.now();
    const L = new DocLayout(doc, tm());
    const r = L.layout(1000);
    const took = performance.now() - t0;
    assert.ok(took < 1500, `layout took ${took} ms`);
    assert.ok(r.h > 50000 * 18);
    t0 = performance.now();
    const s = selectAll(L);
    const y0 = r.h / 2, rs = L.selectionRects(s, y0, y0 + 800);
    const t2 = performance.now() - t0;
    assert.ok(t2 < 50, `select all + rects took ${t2} ms`);
    assert.ok(rs.length > 20 && rs.length < 400, `${rs.length} rects`);
  });
});
