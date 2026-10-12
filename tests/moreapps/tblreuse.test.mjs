// D20: a table's item is reused when nothing it depends on changed
// (C2 fix wave, I2). A keystroke outside a table keeps every table's
// rows, cells and cell columns (no cell stacked again; a table that
// moves is only placed again); a keystroke in a cell stacks that cell
// only; list labels flowing through a table, a new width, new
// decorators and invalidate() lay the cells out again; every result
// equals a full layout. The budget: a plain keystroke in a document
// with five 1000 x 5 tables within +5 ms of the same document without
// them, and a keystroke in a cell of one within +5 ms of it too.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {DECORATORS} from '../../tools/moreapps/!Letters/DocStack';
import {newPara} from '../../tools/moreapps/!Letters/Model';
import {apply} from '../../tools/moreapps/!Letters/Ops';
import {loadStyles, tm, mkDoc} from './word-docs.mjs';
import {modelTable} from './tbl-fixtures.mjs';

before(loadStyles);

const BIG = (n, k, f = (i, j) => `r${i}c${j}`) => modelTable(
  Array.from({length: n}, (_, i) =>
    Array.from({length: k}, (_, j) => f(i, j))));

/** A layout of doc after prev, counting the cells it stacks. */
function lay(doc, m, prev, w = 800, opts) {
  const L = new DocLayout(doc, m, prev, opts);
  const stack = L.stackColumn.bind(L);
  L.stacked = 0;
  L.stackColumn = (col, y0) => { L.stacked++; return stack(col, y0); };
  L.layout(w);
  return L;
}

/** Everything placed, at every depth (byId order). */
function deep(L) {
  return [...L.byId.values()].map((x) => [x.id, x.kind, x.index, x.x,
    x.y, x.h, x.gapAbove, x.gapBelow, x.lines ? x.lines.length : -1,
    x.list ? x.list.text : null,
    x.rows ? x.rows.map((r) => [r.y, r.h, r.cells.map((c) => [c.x,
      c.w, c.tx, c.tw, c.dy, c.clip, c.need, c.rowSpan, c.cont])])
      : null, x.left, x.width]);
}

function same(L, doc, m, w = 800) {
  const full = new DocLayout(doc, m);
  full.layout(w);
  assert.deepEqual(deep(L), deep(full));
  assert.equal(L.height, full.height);
}

const cellsOf = (it) => it.rows.map((r) => r.cells);
const type = (doc, at, ins, off = 0) => apply(doc, {op: 'replaceText',
  block: at, at: off, del: 0, ins});

describe('a table item reused (D20, I2)', () => {
  it('a plain keystroke keeps every table; no cell stacked', () => {
    const doc = mkDoc(['one', BIG(30, 3), 'two', BIG(20, 2), 'three']);
    const m = tm();
    const L1 = lay(doc, m);
    assert.equal(L1.stacked, 30 * 3 + 20 * 2);
    type(doc, [0, 2], 'k');
    const L2 = lay(doc, m, L1);
    assert.equal(L2.stacked, 0, 'no cell stacked');
    for (const i of [1, 3]) {
      const a = L1.items[i], b = L2.items[i];
      assert.notEqual(a, b, 'a new item');
      a.rows.forEach((r, k) => assert.equal(b.rows[k].cells, r.cells));
    }
    same(L2, doc, m);
  });

  it('a table that moves down is placed again, not stacked', () => {
    const doc = mkDoc(['one', BIG(30, 3), 'two', BIG(5, 2)]);
    const m = tm();
    const L1 = lay(doc, m);
    type(doc, [0, 0], 'many words that wrap '.repeat(12));
    const L2 = lay(doc, m, L1);
    assert.ok(L2.items[1].y > L1.items[1].y);
    assert.equal(L2.stacked, 0);
    same(L2, doc, m);
    type(doc, [0, 0], 'x');
    same(lay(doc, m, L2), doc, m);
  });

  it('a new paragraph above: new indexes, the same cells', () => {
    const doc = mkDoc(['one', BIG(10, 3), 'two']);
    const m = tm();
    const L1 = lay(doc, m);
    apply(doc, {op: 'splitBlock', block: [0, 0], at: 1});
    const L2 = lay(doc, m, L1);
    assert.equal(L2.stacked, 0);
    assert.equal(L2.items[2].kind, 'tbl');
    // (C3.1: kept cell items get their places in the new flow)
    L2.flow.forEach((x, i) => assert.ok(x.index === i ||
      x.endIndex === i, `place ${i}`));
    assert.equal(L2.items[2].index, 2);
    for (const x of L2.byId.values()) {
      if (x.col !== L2.root) assert.ok(x.index > 2, x.id);
    }
    same(L2, doc, m);
  });

  it('a keystroke in a cell stacks that cell only', () => {
    const doc = mkDoc(['one', BIG(40, 3), 'two', BIG(20, 2)]);
    const m = tm();
    const L1 = lay(doc, m);
    type(doc, [0, 1, 17, 1, 0], 'k');
    const L2 = lay(doc, m, L1);
    assert.equal(L2.stacked, 1);
    const a = L1.items[1], b = L2.items[1];
    a.rows.forEach((r, k) => {
      if (k === 17) assert.notEqual(b.rows[k].cells, r.cells);
      else assert.equal(b.rows[k].cells, r.cells, 'row ' + k);
    });
    assert.deepEqual(cellsOf(L2.items[3]), cellsOf(L1.items[3]));
    same(L2, doc, m);
  });

  it('a cell that grows moves the rows below it (placed only)', () => {
    const doc = mkDoc(['one', BIG(40, 3), 'two']);
    const m = tm();
    const L1 = lay(doc, m);
    type(doc, [0, 1, 5, 0, 0], 'many words that wrap '.repeat(6));
    const L2 = lay(doc, m, L1);
    assert.equal(L2.stacked, 1);
    assert.ok(L2.items[1].rows[5].h > L1.items[1].rows[5].h);
    same(L2, doc, m);
  });

  it('merges, vAlign and nested tables, edited and moved', () => {
    const inner = modelTable([['in a', 'in b'], ['in c', '']]);
    const T = modelTable([
      [{blocks: ['top'], tcPr: {vMerge: 'restart', extra: []}},
        {blocks: ['mid'], tcPr: {vAlign: 'center', extra: []}}],
      [{blocks: [''], tcPr: {vMerge: 'continue', extra: []}},
        ['x', inner, '']],
      ['last', {blocks: ['b'], tcPr: {vAlign: 'bottom', extra: []}}]]);
    const doc = mkDoc(['one', T, 'two']);
    const m = tm();
    let L = lay(doc, m);
    const steps = [[[0, 0], 'words wrap here '.repeat(10)],
      [[0, 1, 1, 1, 0], 'grow '.repeat(30)],
      [[0, 1, 1, 1, 1, 0, 1, 0], 'deep '.repeat(9)],
      [[0, 1, 0, 0, 0], 'merge '.repeat(20)],
      [[0, 2], 'k']];
    for (const [at, t] of steps) {
      type(doc, at, t);
      L = lay(doc, m, L);
      same(L, doc, m);
    }
    for (const w of [1400, 700]) {
      L.layout(w);
      same(L, doc, m, w);
    }
  });

  it('list labels flowing through a table lay its cells out again', () => {
    const lvl = {ilvl: 0, numFmt: 'decimal', lvlText: '%1.', start: 1,
      suff: 'tab', pPr: {ind: {left: 720, hanging: 360}}};
    const num = {pPr: {numPr: {numId: 1, ilvl: 0}}};
    const T = modelTable([[[newPara('in', num)], 'b'], ['c', 'd']]);
    const doc = mkDoc([['one', num], T, 'two']);
    doc.numbering = {raw: null, nums: new Map([[1, {abstractNumId: 1,
      levels: [lvl], overrides: new Map()}]])};
    const m = tm();
    const L1 = lay(doc, m);
    const cell = (L) => L.items.find((x) => x.kind === 'tbl').rows[0]
      .cells[0].col.items[0];
    assert.equal(cell(L1).list.text, '2.');
    apply(doc, {op: 'splitBlock', block: [0, 0], at: 1});
    const L2 = lay(doc, m, L1);
    assert.equal(cell(L2).list.text, '3.');
    assert.equal(L2.stacked, 1, 'the cell with the label');
    same(L2, doc, m);
  });

  it('a new width, new decorators, invalidate(): stacked again', () => {
    const doc = mkDoc(['one', BIG(6, 2), 'two']);
    const m = tm();
    const L1 = lay(doc, m);
    doc.sections[0].props = {...doc.sections[0].props,
      pgMar: {left: 720, right: 720}};
    const L2 = lay(doc, m, L1);
    assert.equal(L2.stacked, 12, 'a new width');
    same(L2, doc, m);
    const L3 = lay(doc, m, L2, 800, {decorators: [...DECORATORS]});
    assert.equal(L3.stacked, 12, 'new decorators');
    L3.invalidate();
    L3.stacked = 0;
    L3.layout(800);
    assert.equal(L3.stacked, 12, 'invalidate()');
    for (const x of L3.byId.values()) {
      if (x.kind === 'p') assert.ok(x.lines, x.id);
    }
    same(L3, doc, m);
  });
});

/** Median of 20 after 3 warm-ups of f(). */
function median(f) {
  const t = [];
  for (let i = 0; i < 23; i++) {
    const t0 = performance.now();
    f();
    if (i >= 3) t.push(performance.now() - t0);
  }
  t.sort((a, b) => a - b);
  return t[10];
}

/** One keystroke's op and layout at `at` (median; 'k', ' ' by turns). */
function keystroke(doc, at) {
  const m = tm();
  let L = new DocLayout(doc, m), n = 0;
  L.layout(800);
  return median(() => {
    type(doc, at, n++ % 2 ? ' ' : 'k');
    L = new DocLayout(doc, m, L);
    L.layout(800);
  });
}

describe('D20 budget: five 1000 x 5 tables (I2)', () => {
  it('a plain keystroke within +5 ms of the document without them; ' +
    'a cell keystroke too', () => {
    const paras = (k) => Array.from({length: 200}, (_, i) =>
      `paragraph ${k}.${i} with a few words`);
    const blocks = (tables) => {
      const out = [];
      for (let k = 0; k < 5; k++) {
        out.push(...paras(k));
        if (tables) out.push(BIG(1000, 5));
      }
      return out;
    };
    const free = keystroke(mkDoc(blocks(false)), [0, 0]);
    const doc = mkDoc(blocks(true));
    const plain = keystroke(doc, [0, 0]);
    const cell = keystroke(doc, [0, 200, 500, 2, 0]);
    console.log(`# without tables ${free.toFixed(2)} ms; with five ` +
      `1000x5: plain ${plain.toFixed(2)} ms, cell ${cell.toFixed(2)} ms`);
    assert.ok(plain <= free + 5, `plain ${plain} vs ${free}`);
    assert.ok(cell <= free + 5, `cell ${cell} vs ${free}`);
  });
});
