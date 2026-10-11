// TblGrid: the resolved grid view of a table (D2), Batch C2.3.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {newPara, newTable, newRow, newCell}
  from '../../tools/moreapps/!Word/Model';
import {gridOf, cellAt, spanOf} from '../../tools/moreapps/!Word/TblGrid';
import {modelTable, freeze} from './tbl-fixtures.mjs';

const tc = (tcPr) => ({blocks: ['x'], tcPr: {extra: [], ...tcPr}});
const RS = tc({vMerge: 'restart'}), CO = tc({vMerge: 'continue'});
const cells = (g, r) => g.rows[r].cells.map(({c0, c1, rowSpan, top,
  cont}) => ({c0, c1, rowSpan, top, cont}));

// 3x3: row 0 a gridSpan 2 then a restart in column 2; rows 1 and 2
// continue it.
const T33 = () => modelTable([
  [tc({gridSpan: 2}), RS],
  ['a', 'b', CO],
  ['c', 'd', CO],
], {grid: [1000, 2000, 3000]});

describe('TblGrid: gridOf', () => {
  it('a 3x3 with a gridSpan and a vertical merge', () => {
    const g = gridOf(T33());
    assert.equal(g.cols, 3);
    assert.equal(g.width, 6000);
    assert.deepEqual(g.grid, [1000, 2000, 3000]);
    assert.deepEqual(cells(g, 0), [
      {c0: 0, c1: 2, rowSpan: 1, top: [0, 0], cont: false},
      {c0: 2, c1: 3, rowSpan: 3, top: [0, 1], cont: false}]);
    assert.deepEqual(cells(g, 1)[2],
      {c0: 2, c1: 3, rowSpan: 0, top: [0, 1], cont: true});
    assert.deepEqual(cells(g, 2)[2],
      {c0: 2, c1: 3, rowSpan: 0, top: [0, 1], cont: true});
    assert.deepEqual(cells(g, 1)[0],
      {c0: 0, c1: 1, rowSpan: 1, top: [1, 0], cont: false});
    for (const row of g.rows) {
      assert.equal(row.before, 0);
      assert.equal(row.after, 0);
    }
  });

  it('cellAt: a continue cell gives its top; spanOf', () => {
    const g = gridOf(T33());
    assert.deepEqual(cellAt(g, 2, 2), {r: 0, k: 1});
    assert.deepEqual(cellAt(g, 0, 1), {r: 0, k: 0});
    assert.deepEqual(cellAt(g, 0, 0), {r: 0, k: 0});
    assert.deepEqual(cellAt(g, 1, 1), {r: 1, k: 1});
    assert.equal(cellAt(g, 1, 3), null);
    assert.equal(cellAt(g, 3, 0), null);
    assert.equal(cellAt(g, -1, 0), null);
    assert.equal(cellAt(g, 0, -1), null);
    assert.equal(cellAt(g, 0, 1.5), null);
    assert.deepEqual(spanOf(g, 0, 1), {r0: 0, r1: 3, c0: 2, c1: 3});
    assert.deepEqual(spanOf(g, 2, 2), {r0: 0, r1: 3, c0: 2, c1: 3});
    assert.deepEqual(spanOf(g, 0, 0), {r0: 0, r1: 1, c0: 0, c1: 2});
    assert.equal(spanOf(g, 0, 5), null);
    assert.equal(spanOf(g, 9, 0), null);
  });

  it('a continue in the first row is a restart', () => {
    const g = gridOf(modelTable([[CO, 'a'], [CO, 'b']]));
    assert.deepEqual(cells(g, 0)[0],
      {c0: 0, c1: 1, rowSpan: 2, top: [0, 0], cont: false});
    assert.deepEqual(cells(g, 1)[0].top, [0, 0]);
    assert.equal(cells(g, 1)[0].cont, true);
  });

  it('a continue under a plain cell or another column restarts', () => {
    const g = gridOf(modelTable([
      ['a', RS],
      [CO, tc({vMerge: 'continue', gridSpan: 1})],
      [tc({gridSpan: 2, vMerge: 'continue'})],
    ]));
    assert.deepEqual(cells(g, 1)[0],
      {c0: 0, c1: 1, rowSpan: 1, top: [1, 0], cont: false});
    assert.equal(cells(g, 1)[1].cont, true);
    assert.equal(cells(g, 0)[1].rowSpan, 2);
    // row 2's cell spans columns 0..2: not the shape of the cell
    // above, so it restarts (merged cells stay rectangles)
    assert.deepEqual(cells(g, 2)[0],
      {c0: 0, c1: 2, rowSpan: 1, top: [2, 0], cont: false});
  });

  it('a continue joins the merge above of the same columns', () => {
    const g = gridOf(modelTable([
      [tc({gridSpan: 2, vMerge: 'restart'}), 'a'],
      [tc({gridSpan: 2, vMerge: 'continue'}), 'b'],
    ]));
    assert.equal(cells(g, 0)[0].rowSpan, 2);
    assert.deepEqual(cellAt(g, 1, 1), {r: 0, k: 0});
    assert.deepEqual(spanOf(g, 1, 0), {r0: 0, r1: 2, c0: 0, c1: 2});
  });

  it('a span past the grid widens the view only', () => {
    const t = freeze(modelTable([[tc({gridSpan: 5})], ['a', 'b']],
      {grid: [1000, 2000, 3000]}));
    const g = gridOf(t);
    assert.equal(g.cols, 5);
    assert.deepEqual(g.grid, [1000, 2000, 3000, 3000, 3000]);
    assert.equal(g.width, 6000 + 2 * 3000);
    assert.deepEqual(t.grid, [1000, 2000, 3000]);
    assert.deepEqual(cells(g, 0)[0].c1, 5);
  });

  it('ragged rows: gridBefore 1 / gridAfter 1', () => {
    const t = newTable({grid: [1000, 1000, 1000], rows: [
      newRow([newCell([newPara('a')]), newCell([newPara('b')])],
        {gridBefore: 1, extra: []}),
      newRow([newCell([newPara('c')]), newCell([newPara('d')])],
        {gridAfter: 1, extra: []}),
    ]});
    const g = gridOf(t);
    assert.equal(g.rows[0].before, 1);
    assert.equal(g.rows[0].after, 0);
    assert.equal(g.rows[1].before, 0);
    assert.equal(g.rows[1].after, 1);
    assert.deepEqual(cells(g, 0).map((c) => [c.c0, c.c1]),
      [[1, 2], [2, 3]]);
    assert.deepEqual(cells(g, 1).map((c) => [c.c0, c.c1]),
      [[0, 1], [1, 2]]);
    assert.equal(cellAt(g, 0, 0), null);
    assert.equal(cellAt(g, 1, 2), null);
    assert.deepEqual(cellAt(g, 0, 2), {r: 0, k: 1});
    assert.equal(g.cols, 3);
  });

  it('memoised per table object; the view is frozen', () => {
    const t = T33();
    const g = gridOf(t);
    assert.equal(gridOf(t), g);
    assert.ok(Object.isFrozen(g));
    assert.ok(Object.isFrozen(g.rows[0].cells[0]));
    assert.ok(Object.isFrozen(g.rows[0].cells[0].top));
    // (a copy with the very same grid array, trPr and tcPr gets the
    // same grid since C3.4: below; another one a grid of its own)
    const t2 = {...t, grid: [...t.grid]};
    const g2 = gridOf(t2);
    assert.notEqual(g2, g);
    assert.deepEqual(g2, g);
    assert.equal(gridOf({...t}), g);
  });

  it('hostile values are clamped, never thrown', () => {
    const cell = (tcPr) => ({tcPr: {extra: [], ...tcPr}, blocks: []});
    const t = {type: 'tbl', grid: [0, 31680], rows: [
      {trPr: {gridBefore: -4, gridAfter: 1e9, extra: []}, cells: [
        cell({gridSpan: 1e9}), cell({gridSpan: NaN}),
        cell({gridSpan: '__proto__'}), cell({gridSpan: 0})]},
      {trPr: {gridBefore: 1.5, extra: []}, cells: [
        cell({vMerge: '__proto__'})]},
    ]};
    const g = gridOf(t);
    assert.equal(g.rows[0].before, 0);
    assert.equal(g.rows[0].after, 63);
    assert.deepEqual(cells(g, 0).map((c) => c.c1 - c.c0),
      [63, 1, 1, 1]);
    assert.equal(g.rows[1].before, 0);
    assert.equal(cells(g, 1)[0].cont, false);
    assert.ok(Number.isFinite(g.width));
    assert.ok(g.cols >= 63);
  });

  it('a 10,000-row table is viewed in < 50 ms', () => {
    const row = newRow([0, 1, 2, 3, 4].map((i) =>
      newCell([newPara('c' + i)])));
    // one row object shared (ids repeat: a view does not check them)
    const rows = Array.from({length: 10000}, () => row);
    const t = {type: 'tbl', id: 1, tblPr: {extra: []},
      grid: [1000, 1000, 1000, 1000, 1000], rows};
    gridOf({...t});
    const times = [];
    for (let i = 0; i < 21; i++) {
      const u = {...t};
      const t0 = performance.now();
      gridOf(u);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    assert.ok(times[10] < 50, 'median ' + times[10] + ' ms');
    const g = gridOf(t);
    assert.equal(g.rows.length, 10000);
    assert.deepEqual(cellAt(g, 9999, 4), {r: 9999, k: 4});
  });
});

describe('gridOf: a copy with the same structure (D20, C3.4)', () => {
  it('a cell edit\'s copy gets the very same grid; a changed tcPr, ' +
    'trPr, row count or grid array does not', () => {
    const T = freeze(modelTable([['a', RS], ['b', CO], ['c', 'd']]));
    const g = gridOf(T);
    const edit = (t, f) => ({...t, rows: t.rows.map((r, i) => (i === 1
      ? {...r, cells: r.cells.map((c, k) => (k === 0 ? f(c) : c))}
      : r))});
    const typed = edit(T, (c) => ({...c, blocks: [newPara('bx')]}));
    assert.equal(gridOf(typed), g);
    const spanned = edit(T, (c) => ({...c, tcPr: {...c.tcPr}}));
    const g2 = gridOf(spanned);
    assert.notEqual(g2, g);
    assert.deepEqual(g2, g);
    const merged = edit(T, (c) => ({...c, tcPr: {...c.tcPr,
      gridSpan: 2}}));
    assert.deepEqual(cells(gridOf(merged), 1)[0].c1, 2);
    const fewer = {...T, rows: T.rows.slice(0, 2)};
    assert.equal(gridOf(fewer).rows.length, 2);
    const regrid = {...T, grid: [...T.grid]};
    assert.notEqual(gridOf(regrid), g);
    const rowed = {...T, rows: T.rows.map((r, i) => (i === 2
      ? {...r, trPr: {...r.trPr, gridAfter: 1}} : r))};
    assert.equal(gridOf(rowed).rows[2].after, 1);
  });
});
