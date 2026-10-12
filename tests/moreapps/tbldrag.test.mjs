// Column edges dragged (Batch C5.3, D33): the pure parts of the drag.
// ./TblEdge dragWidths (the two columns beside a border change, the
// table width stays; the right edge changes the last column; the drag
// stops at 0.1 in per column, never grows a narrower one), dragGrid
// (px to twips: the untouched columns keep their twips, the pair
// keeps its sum) and edgeAt (within 3 SCREEN px of a vertical cell
// border, the table's right edge, a row's bottom border; the innermost
// table first); ./TblEditDist withCols (a NEW table and grid array,
// every cell over a changed column tcW dxa of its columns, pct / auto
// / raw ones too, a dxa or pct tblW to the new total for the right
// edge; the same table when nothing changes; hostile grids refused);
// ./TblCmdCols colDragCmd (one undo step, none for no change or a
// table that is not the one dragged). And the C4 carry (N2): merge,
// split, delete and insert columns give a cell whose tcW is kept raw
// (a Strict w:tcW w:w="155.80pt") the dxa width of its columns.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {dragWidths, dragGrid, dragHeight, edgeAt, MIN_PX, EDGE,
  MIN_ROW_PX} from '../../tools/moreapps/!Letters/TblEdge';
import {withCols} from '../../tools/moreapps/!Letters/TblEditDist';
import {colDragCmd, rowDragCmd} from '../../tools/moreapps/!Letters/TblCmdCols';
import {mergeCells, splitCell} from '../../tools/moreapps/!Letters/TblMerge';
import {insertCols, deleteCols}
  from '../../tools/moreapps/!Letters/TblEditCols';
import {gridOf} from '../../tools/moreapps/!Letters/TblGrid';
import {at as walkAt} from '../../tools/moreapps/!Letters/Walk';
import {findBlock} from '../../tools/moreapps/!Letters/EditPos';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {loadStyles, tm} from './word-docs.mjs';
import {mk, S, undoable} from './edit-docs.mjs';
import {modelTable, freeze} from './tbl-fixtures.mjs';

before(loadStyles);

const near = (a, b) => a.length === b.length &&
  a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
const dxa = (w) => ({w, type: 'dxa'});
const pct = (w) => ({w, type: 'pct'});
const raw = (name, attrs) => ({name, attrs, children: []});
const RAW_W = () => raw('w:tcW', [['w:w', '155.80pt'], ['w:type', 'dxa']]);
const hasRaw = (c) => (c.tcPr.extra || []).some((n) => n.name === 'w:tcW');
const tcWs = (t) => t.rows.map((row) => row.cells.map((c) =>
  (c.tcPr.tcW ? c.tcPr.tcW.w : null)));

describe('dragWidths: the columns a drag gives', () => {
  it('+30 px on border 1 of [100, 100, 100] -> [130, 70, 100]', () => {
    assert.deepEqual(dragWidths([100, 100, 100], 1, 30, MIN_PX),
      [130, 70, 100]);
    assert.deepEqual(dragWidths([100, 100, 100], 2, -30, MIN_PX),
      [100, 70, 130]);
  });

  it('0.1 in is 9.6 px; past the limit the shrinking column stops ' +
    'there, the total stays', () => {
    assert.equal(MIN_PX, 9.6);
    const a = dragWidths([100, 100, 100], 1, 200, MIN_PX);
    assert.ok(near(a, [190.4, 9.6, 100]), String(a));
    const b = dragWidths([100, 100, 100], 1, -500, MIN_PX);
    assert.ok(near(b, [9.6, 190.4, 100]), String(b));
  });

  it('the right edge: the last column and the total change', () => {
    assert.deepEqual(dragWidths([100, 100, 100], 3, 50, MIN_PX),
      [100, 100, 150]);
    assert.ok(near(dragWidths([100, 100, 100], 3, -500, MIN_PX),
      [100, 100, 9.6]));
  });

  it('a column already under 0.1 in is not grown: it cannot shrink',
    () => {
      assert.deepEqual(dragWidths([5, 100], 1, -10, MIN_PX), [5, 100]);
      assert.deepEqual(dragWidths([5, 100], 1, 10, MIN_PX), [15, 90]);
      assert.deepEqual(dragWidths([100, 5], 2, -10, MIN_PX), [100, 5]);
    });

  it('the most a column may grow to (maxPx), unless it is wider', () => {
    assert.deepEqual(dragWidths([2100, 100], 1, 50, MIN_PX, 2112),
      [2112, 88]);
    assert.deepEqual(dragWidths([3000, 100], 1, 50, MIN_PX, 2112),
      [3000, 100]);
    assert.deepEqual(dragWidths([100, 100], 2, 5000, MIN_PX, 2112),
      [100, 2112]);
  });

  it('no border, a bad index or a bad dx: the same widths (a copy)',
    () => {
      const c = [100, 100];
      for (const [i, dx] of [[0, 5], [3, 5], [1.5, 5], [-1, 5],
        [1, NaN], [1, Infinity], [NaN, 1]]) {
        const o = dragWidths(c, i, dx, MIN_PX);
        assert.deepEqual(o, c);
        assert.notEqual(o, c);
      }
    });
});

describe('dragGrid: the twips written', () => {
  it('the pair keeps its sum, the others their twips', () => {
    const o = dragGrid([200, 200, 200], [230, 170, 200], 1);
    assert.deepEqual(o.grid, [3450, 2550, 3000]);
    assert.equal(o.total, 9000);
  });

  it('fractions: rounded, the sum of the old twips kept', () => {
    const cols = [133.3333, 133.3333, 133.3334];
    const next = dragWidths(cols, 2, 7.77, MIN_PX);
    const o = dragGrid(cols, next, 2);
    const base = cols.map((w) => Math.round(w * 15));
    assert.equal(o.grid.reduce((a, b) => a + b),
      base.reduce((a, b) => a + b));
    assert.equal(o.grid[0], base[0]);
    assert.ok(o.grid.every(Number.isInteger));
  });

  it('the right edge: the last column, the total grows', () => {
    const o = dragGrid([200, 200], [200, 250], 2);
    assert.deepEqual(o.grid, [3000, 3750]);
    assert.equal(o.total, 6750);
  });
});

/** A 3 x 3 table: tcW dxa 2000, (1, 1) pct, (2, 0..1) one cell
 *  spanning two columns. */
function sample() {
  const c = (t, tcPr = {tcW: dxa(2000), extra: []}) => ({blocks: [t],
    tcPr});
  return modelTable([
    [c('a'), c('b'), c('c')],
    [c('d'), c('e', {tcW: pct(1666), extra: []}), c('f')],
    [c('g', {tcW: dxa(4000), gridSpan: 2, extra: []}), c('i')],
  ], {grid: [2000, 2000, 2000], tblPr: {tblW: dxa(6000), extra: []}});
}

describe('withCols: the new widths in the model', () => {
  it('a NEW grid array; every cell over a changed column tcW dxa of ' +
    'its columns (pct too); the rest shared', () => {
    const t = freeze(sample());
    const n = withCols(t, gridOf(t), [2450, 1550, 2000]);
    assert.notEqual(n, t);
    assert.notEqual(n.grid, t.grid);
    assert.deepEqual(n.grid, [2450, 1550, 2000]);
    assert.deepEqual(tcWs(n), [[2450, 1550, 2000], [2450, 1550, 2000],
      [4000, 2000]]);
    assert.equal(n.rows[1].cells[1].tcPr.tcW.type, 'dxa');
    assert.equal(n.rows[0].cells[2], t.rows[0].cells[2], 'shared');
    assert.equal(n.rows[2].cells[0], t.rows[2].cells[0],
      'a span over both: its width is the same');
    assert.equal(n.tblPr, t.tblPr, 'tblW kept (plain drag)');
  });

  it('fitW (the right edge): a dxa or pct tblW becomes the total, ' +
    'auto stays', () => {
    const t = freeze(sample());
    const n = withCols(t, gridOf(t), [2000, 2000, 2600], {fitW: true});
    assert.deepEqual(n.tblPr.tblW, dxa(6600));
    assert.deepEqual(tcWs(n)[0], [2000, 2000, 2600]);
    const p = freeze({...sample(), tblPr: {tblW: pct(5000),
      extra: []}});
    assert.deepEqual(withCols(p, gridOf(p), [2000, 2000, 2600],
      {fitW: true}).tblPr.tblW, dxa(6600));
    const a = freeze({...sample(), tblPr: {tblW: {w: 0, type: 'auto'},
      extra: []}});
    const an = withCols(a, gridOf(a), [2000, 2000, 2600], {fitW: true});
    assert.equal(an.tblPr, a.tblPr);
  });

  it('fitW with the width from the table style (styleW): the table ' +
    'gets tblW dxa of the total, so the drag shows (C5 fix M5)', () => {
    const t = freeze({...sample(), tblPr: {extra: []}});
    assert.equal(withCols(t, gridOf(t), [2000, 2000, 2600], {fitW: true})
      .tblPr, t.tblPr, 'no tblW anywhere: none written');
    const n = withCols(t, gridOf(t), [2000, 2000, 2600], {fitW: true,
      styleW: pct(5000)});
    assert.deepEqual(n.tblPr.tblW, dxa(6600));
    const own = freeze({...sample(), tblPr: {tblW: {w: 0, type: 'auto'},
      extra: []}});
    assert.equal(withCols(own, gridOf(own), [2000, 2000, 2600],
      {fitW: true, styleW: dxa(9000)}).tblPr, own.tblPr,
    'the table\'s own auto wins over the style\'s');
    const plain = withCols(t, gridOf(t), [2000, 2000, 2600],
      {fitW: true, styleW: {w: 0, type: 'auto'}});
    assert.equal(plain.tblPr, t.tblPr, 'a style\'s auto: no tblW');
  });

  it('a raw (Strict) tcW is replaced, not written twice', () => {
    const t = freeze(modelTable([[{blocks: ['a'], tcPr: {extra:
      [RAW_W()]}}, 'b']], {grid: [2000, 2000]}));
    const n = withCols(t, gridOf(t), [2500, 1500]);
    const c = n.rows[0].cells[0];
    assert.deepEqual(c.tcPr.tcW, dxa(2500));
    assert.ok(!hasRaw(c));
  });

  it('nothing changes: the same table (a stray alone is no change)',
    () => {
      const t = freeze(modelTable([['a', 'b'], [{blocks: ['s'], tcPr:
        {vMerge: 'continue', extra: []}}, 'c']], {grid: [2000, 2000]}));
      assert.equal(withCols(t, gridOf(t), [2000, 2000]), t);
      const n = withCols(t, gridOf(t), [2100, 1900]);
      assert.equal(n.rows[1].cells[0].tcPr.vMerge, 'restart',
        'the stray written restart (unstray)');
    });

  it('a hostile grid is refused (RangeError), never clamped', () => {
    const t = freeze(sample()), g = gridOf(t);
    for (const bad of [null, [2000, 2000], [2000, 2000, 2000, 1],
      [2000, -1, 2000], [2000, 1.5, 2000], [2000, NaN, 2000],
      [2000, 31681, 2000], ['2000', 2000, 2000], {length: 3}]) {
      assert.throws(() => withCols(t, g, bad), RangeError,
        JSON.stringify(bad));
    }
    assert.equal(withCols(t, g, [31680, 2000, 2000]).grid[0], 31680);
  });
});

describe('colDragCmd: one undo step', () => {
  const setup = () => {
    const t = freeze(sample());
    const d = mk(['Before', t, 'After']);
    return {d, t, sel: S.caret({id: t.rows[0].cells[0].blocks[0].id,
      off: 0})};
  };

  it('a change: one step; undo gives back the very old table', () => {
    const {d, t, sel} = setup();
    let out;
    undoable(d, () => (out = colDragCmd(d, sel, {table: t,
      grid: [2450, 1550, 2000]})));
    assert.ok(out);
    assert.equal(d.undoDepth, 1);
    const n = walkAt(d.doc, findBlock(d.doc, t.id).at);
    assert.deepEqual(n.grid, [2450, 1550, 2000]);
    assert.deepEqual(out.head, sel.head, 'the selection stays');
    d.undo();
    assert.equal(walkAt(d.doc, findBlock(d.doc, t.id).at), t);
  });

  it('no change, or a table that is not the one dragged: null, no ' +
    'step', () => {
    const {d, t, sel} = setup();
    assert.equal(colDragCmd(d, sel, {table: t, grid: [2000, 2000,
      2000]}), null);
    const other = freeze(sample());
    assert.equal(colDragCmd(d, sel, {table: other, grid: [2450, 1550,
      2000]}), null);
    assert.equal(d.undoDepth, 0);
  });
});

/** Before, t, After laid out at width w. */
function laid(t, w = 800) {
  const d = mk(['Before', freeze(t), 'After']);
  const L = new DocLayout(d.doc, tm());
  L.layout(w);
  return {d, L, it: L.byId.get(t.id)};
}
/** The x of grid line c of table item it. */
const lineX = (it, c) => it.x + it.left +
  it.key.cols.slice(0, c).reduce((a, b) => a + b, 0);

describe('edgeAt: the border under the pointer', () => {
  it('within 3 screen px of a vertical cell border: col, its grid ' +
    'line', () => {
    const {L, it} = laid(sample());
    const row = it.rows[0], y = row.y + row.h / 2, x = lineX(it, 1);
    assert.equal(EDGE, 3);
    for (const dx of [-3, -1, 0, 2, 3]) {
      const e = edgeAt(L, x + dx, y, 1);
      assert.deepEqual(e && [e.kind, e.index, e.table], ['col', 1, it],
        String(dx));
    }
    assert.equal(edgeAt(L, x + 3.1, y, 1), null);
    assert.equal(edgeAt(L, x - 3.1, y, 1), null);
    const e2 = edgeAt(L, lineX(it, 2) + 1, y, 1);
    assert.deepEqual([e2.kind, e2.index], ['col', 2]);
  });

  it('at 200% the zone is 3 screen px: 1.5 layout px', () => {
    const {L, it} = laid(sample());
    const row = it.rows[0], y = row.y + row.h / 2, x = lineX(it, 1);
    assert.equal(edgeAt(L, x + 1.4, y, 2).kind, 'col');
    assert.equal(edgeAt(L, x + 1.6, y, 2), null);
    assert.equal(edgeAt(L, x + 5.9, y, 0.5).kind, 'col');
    assert.equal(edgeAt(L, x + 6.1, y, 0.5), null);
  });

  it('the right edge: right, index the column count; the left edge ' +
    'none', () => {
    const {L, it} = laid(sample());
    const row = it.rows[1], y = row.y + row.h / 2;
    const e = edgeAt(L, lineX(it, 3) + 2, y, 1);
    assert.deepEqual([e.kind, e.index], ['right', 3]);
    assert.equal(edgeAt(L, lineX(it, 0), y, 1), null);
  });

  it('no border inside a cell spanning the line in that row', () => {
    const {L, it} = laid(sample());
    const row = it.rows[2], y = row.y + row.h / 2;
    assert.equal(edgeAt(L, lineX(it, 1), y, 1), null);
    assert.equal(edgeAt(L, lineX(it, 2), y, 1).index, 2);
  });

  it('a row\'s bottom border: row, its index (a column wins at a ' +
    'crossing)', () => {
    const {L, it} = laid(sample());
    const row = it.rows[0], x = (lineX(it, 1) + lineX(it, 2)) / 2;
    const e = edgeAt(L, x, row.y + row.h + 2, 1);
    assert.deepEqual([e.kind, e.index], ['row', 0]);
    assert.equal(edgeAt(L, x, row.y + row.h - 3.1, 1), null);
    assert.equal(edgeAt(L, lineX(it, 1), row.y + row.h, 1).kind, 'col');
  });

  it('a nested table\'s borders are its own', () => {
    const N = modelTable([['n1', 'n2']], {grid: [1000, 1000]});
    const t = modelTable([['a', ['b1', N, 'b2']], ['c', 'd']],
      {grid: [3000, 3000]});
    const {L} = laid(t);
    const n = L.byId.get(N.id), row = n.rows[0];
    const e = edgeAt(L, lineX(n, 1) + 1, row.y + row.h / 2, 1);
    assert.deepEqual([e.kind, e.index, e.table], ['col', 1, n]);
    const o = L.byId.get(t.id);
    const e2 = edgeAt(L, lineX(o, 1), row.y + row.h / 2, 1);
    assert.deepEqual([e2.kind, e2.index, e2.table], ['col', 1, o]);
  });

  it('no row border inside a vertically merged cell (C5 fix M2)', () => {
    const t = modelTable([[{blocks: ['a'], tcPr: {vMerge: 'restart'}},
      'b'], [{blocks: [''], tcPr: {vMerge: 'continue'}}, 'd'],
    ['e', 'f']], {grid: [3000, 3000]});
    const {L, it} = laid(t);
    const row = it.rows[0], y = row.y + row.h;
    assert.equal(edgeAt(L, (lineX(it, 0) + lineX(it, 1)) / 2, y, 1),
      null, 'inside the merge: no line there');
    const e = edgeAt(L, (lineX(it, 1) + lineX(it, 2)) / 2, y, 1);
    assert.deepEqual([e.kind, e.index], ['row', 0]);
    const r1 = it.rows[1], e1 = edgeAt(L, (lineX(it, 0) +
      lineX(it, 1)) / 2, r1.y + r1.h, 1);
    assert.deepEqual([e1.kind, e1.index], ['row', 1], 'the merge\'s end');
  });

  it('a nested table\'s edge and a nearer outer border: the nearer ' +
    'wins (C5 fix M1, 50%)', () => {
    const N = modelTable([['n1', 'n2']], {grid: [1392, 1392]});
    const t = modelTable([[['a1', N, 'a2'], 'b'], ['c', 'd']],
      {grid: [3000, 3000]});
    const {L} = laid(t);
    const n = L.byId.get(N.id), o = L.byId.get(t.id);
    const row = n.rows[0], y = row.y + row.h / 2, X = lineX(o, 1);
    assert.ok(X - lineX(n, 2) > 3 && X - lineX(n, 2) < 9,
      String(X - lineX(n, 2)));
    const e = edgeAt(L, X - 3, y, 0.5);
    assert.deepEqual([e.kind, e.index, e.table], ['col', 1, o]);
    const f = edgeAt(L, lineX(n, 2) + 0.5, y, 0.5);
    assert.deepEqual([f.kind, f.index, f.table], ['right', 2, n]);
  });

  it('none in text, without a table, or for absurd points', () => {
    const {L, it} = laid(sample());
    const row = it.rows[0], y = row.y + row.h / 2;
    assert.equal(edgeAt(L, (lineX(it, 1) + lineX(it, 2)) / 2, y, 1),
      null);
    const d = mk(['one', 'two']);
    const L2 = new DocLayout(d.doc, tm());
    L2.layout(800);
    assert.equal(edgeAt(L2, L2.left, L2.items[0].y + 3, 1), null);
    for (const v of [NaN, Infinity, -1e9, 1e9]) {
      assert.equal(edgeAt(L, v, y, 1), null);
      assert.equal(edgeAt(L, lineX(it, 1), v, 1), null);
    }
    assert.equal(edgeAt(L, lineX(it, 1), y, 0), null, 'zoom 0');
    assert.equal(edgeAt(L, lineX(it, 1), y, NaN), null);
  });
});

describe('N2 (C4 carry): a raw tcW gets the dxa width of its columns',
  () => {
    const rc = (t) => ({blocks: [t], tcPr: {extra: [RAW_W()]}});
    const rawT = () => freeze(modelTable([[rc('a'), rc('b'), rc('c')],
      [rc('d'), rc('e'), rc('f')]], {grid: [2000, 3000, 4000]}));

    it('merge: the merged cell the columns\' sum', () => {
      const t = rawT();
      const n = mergeCells(t, gridOf(t), {r0: 0, r1: 0, c0: 0, c1: 1});
      const c = n.rows[0].cells[0];
      assert.deepEqual(c.tcPr.tcW, dxa(5000));
      assert.ok(!hasRaw(c));
    });

    it('split: each piece its own columns', () => {
      const t = rawT();
      const n = splitCell(t, gridOf(t), {r: 0, k: 1}, {cols: 3,
        rows: 1});
      const g = gridOf(n);
      n.rows[0].cells.slice(1, 4).forEach((c, i) => {
        const gc = g.rows[0].cells[1 + i];
        const w = n.grid.slice(gc.c0, gc.c1).reduce((a, b) => a + b);
        assert.deepEqual(c.tcPr.tcW, dxa(w));
        assert.ok(!hasRaw(c));
      });
    });

    it('delete columns: a span crossing them its remaining columns',
      () => {
        const t0 = rawT();
        const t = mergeCells(t0, gridOf(t0), {r0: 0, r1: 0, c0: 0,
          c1: 2});
        const wide = {...t, rows: [{...t.rows[0], cells: [{
          ...t.rows[0].cells[0], tcPr: {...t.rows[0].cells[0].tcPr,
            tcW: undefined, extra: [RAW_W()]}}]}, t.rows[1]]};
        const n = deleteCols(wide, gridOf(wide), {c0: 1, c1: 1});
        assert.deepEqual(n.rows[0].cells[0].tcPr.tcW, dxa(6000));
        assert.ok(!hasRaw(n.rows[0].cells[0]));
      });

    it('insert columns, scaled to the text width: a cell ending at ' +
      'the new columns keeps its own width (C5 fix B1)', () => {
      const rc3 = () => freeze(modelTable([[rc('a'), rc('b'), rc('c')],
        [rc('d'), rc('e'), rc('f')]], {grid: [3000, 3000, 3000]}));
      for (const at of [{c0: 0, c1: 0, right: true},
        {c0: 1, c1: 1, right: false}]) {
        const t = rc3();
        const n = insertCols(t, gridOf(t), at, 9000);
        assert.deepEqual(n.grid, [2250, 2250, 2250, 2250]);
        const g = gridOf(n);
        n.rows.forEach((row, r) => {
          row.cells.forEach((c, k) => {
            const gc = g.rows[r].cells[k];
            assert.deepEqual(c.tcPr.tcW, dxa(n.grid.slice(gc.c0, gc.c1)
              .reduce((x, y) => x + y)), `${JSON.stringify(at)} ${r},${k}`);
          });
          assert.equal(row.cells.reduce((s2, c) => s2 + c.tcPr.tcW.w, 0),
            9000, 'the row\'s widths sum to the grid');
        });
      }
    });

    it('insert columns: a span growing over them its columns', () => {
      const t0 = rawT();
      const m = mergeCells(t0, gridOf(t0), {r0: 0, r1: 0, c0: 0,
        c1: 1});
      const t = {...m, rows: [{...m.rows[0], cells: [{
        ...m.rows[0].cells[0], tcPr: {...m.rows[0].cells[0].tcPr,
          tcW: undefined, extra: [RAW_W()]}}, m.rows[0].cells[1]]},
      m.rows[1]]};
      const n = insertCols(t, gridOf(t), {c0: 0, c1: 0, right: true});
      assert.deepEqual(n.rows[0].cells[0].tcPr.tcW, dxa(7000));
      assert.ok(!hasRaw(n.rows[0].cells[0]));
    });
  });

describe('row edges dragged (C5.4, D19, D33)', () => {
  const trH = (t, r) => t.rows[r].trPr && t.rows[r].trPr.trHeight;
  const setup = (rowPr = {}) => {
    const t = freeze(modelTable([['a', 'b'], ['c', 'd'], ['e', 'f']]));
    const rows = t.rows.map((row, r) => (r === 1 ? {...row, trPr:
      {...row.trPr, ...rowPr, extra: []}} : row));
    const u = freeze({...t, rows});
    const d = mk(['Before', u, 'After']);
    const L = new DocLayout(d.doc, tm());
    L.layout(800);
    return {d, t: u, L, it: L.byId.get(u.id), sel: S.caret({id:
      u.rows[0].cells[0].blocks[0].id, off: 0})};
  };
  const now = (d, t) => walkAt(d.doc, findBlock(d.doc, t.id).at);

  it('dragHeight: the row\'s height plus dy, not under 0, not over ' +
    'the most; a bad dy changes nothing', () => {
    assert.equal(dragHeight(30, 20, 2112), 50);
    assert.equal(MIN_ROW_PX, 1, '15 twips, 0.01 in');
    assert.equal(dragHeight(30, -100, 2112), MIN_ROW_PX,
      'the drag stops at the least row height (never 0: no rule)');
    assert.equal(dragHeight(0.5, -3, 2112), 0.5, 'shorter already: kept');
    assert.equal(dragHeight(30, 5000, 2112), 2112);
    assert.equal(dragHeight(3000, 5, 2112), 3000, 'already over');
    for (const dy of [NaN, Infinity, undefined, 'x']) {
      assert.equal(dragHeight(30, dy, 2112), 30);
    }
    assert.equal(dragHeight(NaN, 5, 2112), 0);
  });

  it('a row 20 px taller: atLeast its dragged height in twips, one ' +
    'step; undo gives back the very table', () => {
    const {d, t, it, sel} = setup();
    const h = it.rows[1].h + 20;
    let out;
    undoable(d, () => (out = rowDragCmd(d, sel, {table: t, row: 1,
      val: Math.round(h * 15), rule: 'atLeast'})));
    assert.ok(out);
    assert.equal(d.undoDepth, 1);
    const n = now(d, t);
    assert.deepEqual(trH(n, 1), {val: Math.round(h * 15),
      hRule: 'atLeast'});
    assert.equal(trH(n, 0), undefined, 'the other rows are as they were');
    assert.equal(n.rows[0], t.rows[0]);
    assert.deepEqual(out.head, sel.head, 'the selection stays');
    const L = new DocLayout(d.doc, tm());
    L.layout(800);
    assert.ok(Math.abs(L.byId.get(t.id).rows[1].h - h) < 0.1);
    d.undo();
    assert.equal(now(d, t), t);
  });

  it('an exact row stays exact with the new val; auto becomes ' +
    'atLeast; an inherited exact is the caller\'s rule', () => {
    const {d, t, sel} = setup({trHeight: {val: 600, hRule: 'exact'}});
    rowDragCmd(d, sel, {table: t, row: 1, val: 900, rule: 'exact'});
    assert.deepEqual(trH(now(d, t), 1), {val: 900, hRule: 'exact'});
    const e = setup({trHeight: {val: 600, hRule: 'auto'}});
    rowDragCmd(e.d, e.sel, {table: e.t, row: 1, val: 700,
      rule: 'atLeast'});
    assert.deepEqual(trH(now(e.d, e.t), 1), {val: 700,
      hRule: 'atLeast'});
  });

  it('no change, another table, a bad row or value: null, no step',
    () => {
      const {d, t, sel} = setup({trHeight: {val: 600,
        hRule: 'atLeast'}});
      const go = (a) => rowDragCmd(d, sel, {table: t, row: 1,
        val: 700, rule: 'atLeast', ...a});
      assert.equal(go({val: 600}), null, 'the same height');
      assert.equal(go({table: setup().t}), null);
      for (const a of [{row: 3}, {row: -1}, {row: 1.5}, {val: -1},
        {val: NaN}, {val: 31681}, {rule: 'auto'}, {rule: 'x'}]) {
        assert.equal(go(a), null, JSON.stringify(a));
      }
      assert.equal(d.undoDepth, 0);
    });
});
