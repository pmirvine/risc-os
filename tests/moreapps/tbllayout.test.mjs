// Tables laid out (Batch C2.4, D17, D19, D20): a typed table is ONE
// 'tbl' item of its column holding rows of cells, each cell a column
// of items stacked as the page's; row heights (content + margins,
// trHeight exact / atLeast, a vertical merge growing its LAST row),
// vAlign, nested tables (depth 8, the depth-9 Opaque a box), the
// table style's layer (derived styles), reuse by identity (a
// keystroke in one cell re-lays out that cell only), byId at every
// depth, L.flow with the cells' items (C3.1: the table's item at its
// start and end), the table's edge carets and hits in its cells
// (caretRect / hitTest), rowAtY, columns moved with the page, and
// D20's keystroke budget in a 1000-row table.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {rowAtY} from '../../tools/moreapps/!Letters/TblLayout';
import {newPara, newTable, newRow, newCell}
  from '../../tools/moreapps/!Letters/Model';
import {apply} from '../../tools/moreapps/!Letters/Ops';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {ids} from '../../tools/moreapps/!Letters/Walk';
import {loadStyles, tm, fake, mkDoc} from './word-docs.mjs';
import {TextMetrics} from '../../tools/moreapps/!WimpLib/TextMetrics';
import {MARGIN} from '../../tools/moreapps/!Letters/DocStack';
import {modelTable, tblDocx, tbl, tr, tc, nestedTable, TABLE_NORMAL,
  GRID_TABLE_4} from './tbl-fixtures.mjs';
import {p, r} from './build-docx.mjs';

before(loadStyles);

const lay = (doc, m = tm(), prev, w = 800) => {
  const L = new DocLayout(doc, m, prev);
  L.layout(w);
  return L;
};
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6,
  `${msg}: ${a} vs ${b}`);
const WORDS = 'one two three four five six seven eight nine ten ' +
  'eleven twelve thirteen fourteen fifteen sixteen';
const cellOf = (blocks, tcPr) => newCell(blocks.map((b) =>
  (typeof b === 'string' ? newPara(b) : b)), tcPr);
const rowOf = (cells, trPr) => newRow(cells.map((c) =>
  (Array.isArray(c) ? cellOf(c) : c.blocks ? cellOf(c.blocks, c.tcPr)
    : cellOf([c]))), trPr);
const tableOf = (rows, grid = [2000, 2000]) =>
  newTable({grid, rows});
/** Every 'tbl' item under (and with) it, outermost first. */
function tables(it, out = []) {
  out.push(it);
  for (const row of it.rows) {
    for (const c of row.cells) {
      for (const x of c.col.items) if (x.kind === 'tbl') tables(x, out);
    }
  }
  return out;
}
const content = (c) => c.need - c.mar.top - c.mar.bottom;

describe('a table is one item; cells are columns', () => {
  it('a 2x2 with one long cell: the row is the tall cell\'s need, ' +
    'cell items at the cell\'s tx', () => {
    const T = modelTable([[WORDS, 'b'], ['c', 'd']]);
    const doc = mkDoc(['before', T, 'after']);
    const L = lay(doc);
    assert.deepEqual(L.items.map((x) => x.kind), ['p', 'tbl', 'p']);
    const it = L.byId.get(T.id);
    assert.equal(it.block, T);
    assert.equal(it.rows.length, 2);
    const [a, b] = it.rows[0].cells;
    assert.ok(a.col.items[0].lines.length > 1, 'the long cell wraps');
    near(a.need, a.col.items[0].h + a.mar.top + a.mar.bottom, 'need');
    near(it.rows[0].h, Math.max(a.need, b.need), 'row 0');
    assert.ok(it.rows[0].h > b.need);
    for (const row of it.rows) {
      for (const c of row.cells) {
        near(c.tx - c.x, 108 / 15, 'left margin');
        near(c.tw, c.w - 2 * 108 / 15, 'text width');
        assert.equal(c.col.x, c.tx);
        assert.equal(c.col.w, c.tw);
        for (const x of c.col.items) {
          assert.equal(x.x, c.tx);
          assert.equal(x.w, c.tw);
          assert.equal(x.col, c.col);
        }
        near(c.col.items[0].y, row.y + c.mar.top + c.dy, 'item y');
      }
    }
    near(it.rows[1].y, it.rows[0].y + it.rows[0].h, 'row 1 y');
    near(it.h, it.rows[0].h + it.rows[1].h, 'table h');
    near(it.rows[0].y, it.y, 'row 0 at the item\'s y');
    near(L.items[2].y, it.y + it.h, 'the paragraph after');
    near(it.width, 4000 / 15, 'width');
    assert.equal(it.left, 0);
    assert.ok(it.tops instanceof Float64Array);
    assert.deepEqual([...it.tops], it.rows.map((x) => x.y));
  });
  it('an exact 300 tw row with three lines: 20 px, clipped', () => {
    const T = tableOf([rowOf([WORDS, 'x'],
      {trHeight: {val: 300, hRule: 'exact'}, extra: []})]);
    const it = lay(mkDoc([T])).byId.get(T.id);
    assert.ok(it.rows[0].cells[0].col.items[0].lines.length >= 3);
    near(it.rows[0].h, 20, 'exact');
    assert.ok(it.rows[0].cells.every((c) => c.clip === true));
    near(it.h, 20, 'table');
  });
  it('atLeast 720 tw raises an empty row to 48 px; no rule too', () => {
    for (const hRule of ['atLeast', undefined]) {
      const trHeight = hRule ? {val: 720, hRule} : {val: 720};
      const T = tableOf([rowOf(['', '']), rowOf(['', ''],
        {trHeight, extra: []})]);
      const it = lay(mkDoc([T])).byId.get(T.id);
      assert.ok(it.rows[0].h < 48, 'an empty row is lower');
      near(it.rows[1].h, 48, String(hRule));
      assert.ok(it.rows[1].cells.every((c) => c.clip === false));
    }
    // hRule auto: the height is the content's
    const T = tableOf([rowOf([''], {trHeight: {val: 720,
      hRule: 'auto'}, extra: []})], [2000]);
    assert.ok(lay(mkDoc([T])).byId.get(T.id).rows[0].h < 48);
  });
  it('a vertical merge over 3 rows grows the LAST row only', () => {
    const tall = Array.from({length: 12}, (_, k) => 'line ' + k);
    const T = tableOf([
      rowOf([{blocks: tall, tcPr: {vMerge: 'restart', extra: []}},
        'a']),
      rowOf([{blocks: [''], tcPr: {vMerge: 'continue', extra: []}},
        'b']),
      rowOf([{blocks: [''], tcPr: {vMerge: 'continue', extra: []}},
        'c'])]);
    const it = lay(mkDoc([T])).byId.get(T.id);
    const m = it.rows[0].cells[0];
    assert.equal(m.rowSpan, 3);
    assert.ok(it.rows[1].cells[0].cont && it.rows[2].cells[0].cont);
    assert.ok(content(m) >= 200, 'the merged content needs 200 px');
    near(it.rows[0].h, it.rows[0].cells[1].need, 'row 0');
    near(it.rows[1].h, it.rows[1].cells[1].need, 'row 1');
    near(it.rows[2].h, m.need - it.rows[0].h - it.rows[1].h, 'row 2');
    assert.ok(it.rows[2].h > it.rows[2].cells[1].need * 2);
    near(it.h, m.need, 'the table is the merged cell\'s need');
  });
  it('vAlign center and bottom shift the cell\'s items by dy', () => {
    for (const [v, f] of [['center', 0.5], ['bottom', 1]]) {
      const T = tableOf([rowOf([WORDS,
        {blocks: ['x'], tcPr: {vAlign: v, extra: []}}])]);
      const it = lay(mkDoc([T])).byId.get(T.id);
      const row = it.rows[0], c = row.cells[1];
      assert.equal(c.vAlign, v);
      assert.ok(c.dy > 0);
      near(c.dy, (row.h - c.need) * f, v);
      near(c.col.items[0].y, row.y + c.mar.top + c.dy, 'item');
      assert.equal(row.cells[0].dy, 0);
    }
  });
  it('nested to depth 8 lays out; the depth-9 table is a box', async () => {
    const doc = await readDocx(await tblDocx(nestedTable(9)));
    const L = lay(doc);
    const top = L.items.find((x) => x.kind === 'tbl');
    const all = tables(top);
    assert.equal(all.length, 8);
    const inner = all[7];
    const kinds = inner.rows[0].cells[0].col.items.map((x) => x.kind);
    assert.deepEqual(kinds, ['p', 'box', 'p']);
    for (let k = 1; k < all.length; k++) {
      const outer = all[k - 1].rows[0].cells[0];
      assert.equal(all[k].col, outer.col);
      assert.ok(all[k].y >= outer.col.items[0].y);
      assert.ok(all[k].y + all[k].h <= all[k - 1].y + all[k - 1].h);
    }
    for (const x of L.byId.values()) {
      assert.ok(Number.isFinite(x.y) && Number.isFinite(x.h), x.id);
    }
  });
  it('cell paragraphs use the derived styles: a firstRow bold layer',
    async () => {
      const look = '<w:tblStyle w:val="GridTable4"/><w:tblLook ' +
        'w:val="0020" w:firstRow="1" w:lastRow="0" ' +
        'w:firstColumn="0" w:lastColumn="0" w:noHBand="1" ' +
        'w:noVBand="1"/>';
      const doc = await readDocx(await tblDocx(tbl([
        tr([tc(p(r('Head'))), tc(p(r('Two')))]),
        tr([tc(p(r('body'))), tc(p(r('cell')))])], {tblPr: look}),
      {styles: TABLE_NORMAL + GRID_TABLE_4}));
      const L = lay(doc);
      const it = L.items.find((x) => x.kind === 'tbl');
      const f = (r0, k) => it.rows[r0].cells[k].col.items[0].lines[0]
        .items[0].f;
      assert.equal(f(0, 0).bold, true);
      assert.equal(f(0, 1).bold, true);
      assert.equal(f(1, 0).bold, false);
      const head = it.rows[0].cells[0];
      assert.notEqual(head.styles, doc.styles);
      assert.equal(head.col.styles, head.styles);
      const body = it.rows[1].cells[0];
      assert.notEqual(body.styles, head.styles);
      assert.notEqual(body.styles, doc.styles, 'the style\'s pPr');
      assert.equal(body.styles.docDefaults.pPr.spacing.after, 0);
      assert.equal(it.rows[1].cells[1].styles, body.styles,
        'the same layer, the same derived styles');
    });
});

describe('ids, flow and the caret (C3.1: into the cells)', () => {
  it('byId holds every id at every depth; L.flow every item in flow ' +
    'order, a table at its start and end', async () => {
    const doc = await readDocx(await tblDocx(p(r('a')) +
      nestedTable(3) + p(r('z'))));
    const L = lay(doc);
    for (const id of ids(doc)) assert.ok(L.byId.has(id), id);
    assert.deepEqual(L.items.map((x) => x.kind), ['p', 'tbl', 'p']);
    L.items.forEach((x, i) => {
      assert.equal(x.ci, i);
      assert.equal(x.col, L.root);
    });
    assert.equal(L.flow.length, L.byId.size +
      [...L.byId.values()].filter((x) => x.kind === 'tbl').length);
    L.flow.forEach((x, i) => assert.ok(x.index === i ||
      x.endIndex === i, `place ${i}`));
    const t = L.items[1];
    assert.deepEqual([t.index, t.endIndex], [1, L.flow.length - 2]);
    for (const x of L.byId.values()) {
      if (x.col !== L.root) {
        assert.ok(x.index > t.index && x.index < t.endIndex, 'inside');
      }
    }
    assert.equal(L.nextItem(L.flow[0]), t);
    assert.equal(L.flow[t.endIndex + 1], L.items[2]);
  });
  it('caretRect at a table\'s edges; hitTest in its cells', () => {
    const T = modelTable([['a', 'b'], ['c', WORDS]]);
    const L = lay(mkDoc(['x', T, 'y']));
    const it = L.byId.get(T.id);
    const [r0, r1] = it.rows;
    const left = it.x + it.left;
    assert.deepEqual(L.caretRect({id: T.id, off: 0}),
      {x: left, y: r0.y, h: r0.h});
    assert.deepEqual(L.caretRect({id: T.id, off: 1}),
      {x: left + it.width, y: r1.y, h: r1.h});
    const y = r0.y + r0.h / 2;
    assert.equal(L.hitTest(left + 5, y).pos.id, T.rows[0].cells[0]
      .blocks[0].id);
    assert.equal(L.hitTest(left + it.width - 5, y).pos.id,
      T.rows[0].cells[1].blocks[0].id);
    assert.deepEqual(L.boxRect(it), {x: left, y: it.y, w: it.width,
      h: it.h});
  });
  it('rowAtY: binary search over the row tops', () => {
    const T = modelTable(Array.from({length: 40}, (_, k) =>
      [k % 7 ? 'r' + k : WORDS, 'x']));
    const it = lay(mkDoc([T])).byId.get(T.id);
    assert.equal(rowAtY(it, it.y - 50), 0);
    assert.equal(rowAtY(it, it.y + it.h + 50), 39);
    for (let k = 0; k < 40; k++) {
      const row = it.rows[k];
      assert.equal(rowAtY(it, row.y), k);
      assert.equal(rowAtY(it, row.y + row.h / 2), k);
      assert.equal(rowAtY(it, row.y + row.h - 0.01), k);
    }
  });
  it('the nested columns move with the page (another view width)',
    async () => {
      const doc = await readDocx(await tblDocx(nestedTable(3)));
      const L = lay(doc, tm(), undefined, 800);
      const before = new Map([...L.byId.values()].map((x) => [x, x.x]));
      L.layout(1400);
      const dx = L.items[0].x - before.get(L.items[0]);
      assert.ok(dx > 0);
      assert.equal(L.root.x, L.left);
      for (const x of L.byId.values()) near(x.x, before.get(x) + dx, x.id);
      for (const t of tables(L.items[0])) {
        for (const c of t.rows[0].cells) {
          assert.equal(c.col.x, c.tx);
          for (const x of c.col.items) assert.equal(x.x, c.tx);
        }
      }
      const fresh = lay(doc, tm(), undefined, 1400);
      const xs = (M) => [...M.byId.values()].map((x) => [x.id, x.x, x.y]);
      assert.deepEqual(xs(L), xs(fresh));
    });
});

/** A metrics object that measures every time (no cache) and says what. */
function spy() {
  const seen = [];
  return {seen, width: (t, css) => { seen.push(t); return fake(t, css); },
    widthTo: (t, css, k) => fake(t.slice(0, k), css),
    offsetAt: () => 0};
}
const BIG = (n, k) => modelTable(Array.from({length: n}, (_, i) =>
  Array.from({length: k}, (_, j) => `r${i}c${j}`)));

describe('reuse by identity (D20)', () => {
  it('a new paragraph in cell (500, 2) of a 1000x5 table re-lays out ' +
    'that cell only', () => {
    const T = BIG(1000, 5);
    const doc = mkDoc(['before', T, 'after']);
    const m = spy();
    const L1 = lay(doc, m);
    const t1 = L1.byId.get(T.id);
    m.seen.length = 0;
    apply(doc, {op: 'replaceText', block: [0, 1, 500, 2, 0], at: 0,
      del: 0, ins: 'Q'});
    const L2 = lay(doc, m, L1);
    const t2 = L2.byId.get(T.id);
    assert.notEqual(t2, t1);
    assert.deepEqual([...new Set(m.seen)], ['Qr500c2'],
      'one paragraph measured (one layoutPara)');
    for (let k = 0; k < 1000; k++) {
      if (k === 500) assert.notEqual(t2.rows[k].geo, t1.rows[k].geo);
      else assert.equal(t2.rows[k].geo, t1.rows[k].geo, 'row ' + k);
    }
    for (const x of L2.byId.values()) {
      if (x.kind !== 'p' || x.block.text === 'Qr500c2') continue;
      assert.equal(x.lines, L1.byId.get(x.id).lines, x.block.text);
    }
    const full = lay(doc, tm());
    const shape = (M) => [...M.byId.values()].map((x) => [x.id, x.kind,
      x.x, x.y, x.h]);
    assert.deepEqual(shape(L2), shape(full));
  });
  it('a new width re-lays out every cell; the same width none', () => {
    const T = BIG(3, 2);
    const doc = mkDoc([T]);
    const m = spy();
    const L1 = lay(doc, m);
    m.seen.length = 0;
    const L2 = lay(doc, m, L1);
    assert.equal(m.seen.length, 0, 'the same width: nothing measured');
    doc.sections[0].props = {...doc.sections[0].props,
      pgMar: {left: 720, right: 720}};
    lay(doc, m, L2);
    assert.deepEqual([...new Set(m.seen)].sort(),
      ['r0c0', 'r0c1', 'r1c0', 'r1c1', 'r2c0', 'r2c1']);
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

/**
 * The time of one keystroke's op and layout at path `at` (median):
 * 'k' and a space by turns, typed at the start (words stay short:
 * a word wider than an autofit column widens it, and every cell of
 * the column is laid out again, as it must be).
 */
function keystroke(doc, at) {
  const m = tm();
  let L = lay(doc, m), n = 0;
  return median(() => {
    apply(doc, {op: 'replaceText', block: at, at: 0, del: 0,
      ins: n++ % 2 ? ' ' : 'k'});
    L = lay(doc, m, L);
  });
}

describe('D20: a keystroke in a cell of a 1000x5 table', () => {
  for (const [what, grid] of [['a usable grid', undefined],
    ['an unusable grid (every entry 0)', Array(5).fill(0)]]) {
    it(`within +5 ms of a plain paragraph's (${what})`, () => {
      const T = grid ? modelTable(Array.from({length: 1000}, (_, i) =>
        Array.from({length: 5}, (_, j) => `r${i}c${j}`)), {grid})
        : BIG(1000, 5);
      const doc = mkDoc(['before', T, 'after']);
      const plain = keystroke(doc, [0, 0]);
      const cell = keystroke(doc, [0, 1, 500, 2, 0]);
      console.log(`# ${what}: plain ${plain.toFixed(2)} ms, cell ` +
        `${cell.toFixed(2)} ms`);
      assert.ok(cell <= plain + 5, `${cell} vs ${plain}`);
    });
  }
});

describe('autofit widths follow the fonts (M1)', () => {
  it('an unusable grid is measured again with new metrics', () => {
    const long = 'x'.repeat(60);
    const T = modelTable([[long, 'b']], {grid: [0, 0]});
    const doc = mkDoc([T]);
    const L1 = lay(doc, tm());
    const wide = new TextMetrics((t) => 10 * t.length);
    const L2 = lay(doc, wide, L1);
    const ref = lay(mkDoc([{...T, grid: [0, 0]}]), wide);
    const cols = (L) => L.items[0].key.cols;
    assert.notDeepEqual(cols(L1), cols(ref), 'the fonts matter here');
    assert.deepEqual(cols(L2), cols(ref));
  });
});

describe('the work area reaches a wide table (D18 step 4, I1)', () => {
  const pageRight = (L) => L.pageLeft + Math.max(L.pageW,
    L.marL + L.textW) + MARGIN;
  const right = (L, it) => L.left + it.left + it.width + MARGIN;
  it('a 4000 px table: the extent is its right edge + MARGIN', () => {
    const T = modelTable([['a', 'b']], {grid: [30000, 30000]});
    const doc = mkDoc(['before', T, 'after']);
    const L = new DocLayout(doc, tm());
    for (const vw of [800, 1400, 800]) {
      const ext = L.layout(vw);
      const it = L.items[1];
      near(it.width, 4000, 'width');
      assert.equal(ext.w, Math.ceil(right(L, it)), `view ${vw}`);
      assert.ok(ext.w > pageRight(L));
    }
    assert.equal(L.layout(9000).w, 9000, 'a wider view');
  });
  it('kept with the lines (a re-layout of the same document)', () => {
    const T = modelTable([['a', 'b']], {grid: [30000, 30000]});
    const doc = mkDoc(['before', T, 'after']);
    const L1 = lay(doc);
    const L2 = new DocLayout(doc, L1.metrics, L1);
    assert.equal(L2.layout(800).w, Math.ceil(right(L2, L2.items[1])));
  });
  it('tables within the page and table-free documents: the page', () => {
    for (const doc of [mkDoc(['one', 'two']),
      mkDoc(['a', modelTable([['a', 'b']]), 'b'])]) {
      const L = new DocLayout(doc, tm());
      const ext = L.layout(700);
      assert.equal(ext.w, Math.ceil(pageRight(L)));
    }
  });
  it('a nested table wider than its cell does not count', () => {
    const inner = modelTable([['wide', 'w']], {grid: [30000, 30000]});
    const T = modelTable([[{blocks: [inner, '']}]], {grid: [3000]});
    const L = new DocLayout(mkDoc([T]), tm());
    assert.equal(L.layout(700).w, Math.ceil(pageRight(L)));
  });
});
