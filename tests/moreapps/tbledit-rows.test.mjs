// TblEdit's row functions (Batch C4.1, D23, D25, R16, R17): insertRows
// (as many rows as r0..r1, copied trPr without tblHeader when the
// new rows end the header run, each cell's tcPr without vMerge
// restart (strictly inside a vertical merge: continue, the merge
// grows; below its last row: none, C4 fix A4), one
// emptyLike paragraph per cell with a fresh id, rows not involved
// shared, a NEW grid array, MAX_ROWS); deleteRows (a removed restart
// passes restart to the next row's continue cell, TB25; the removed
// rows' marks move to the next row's lead, a bookmark pair is never
// broken; every row: null); splitTable (two valid tables, the second
// a fresh id, the same tblPr and grid values, the rows from r).
// Fixtures are deep-frozen: no object that exists is changed.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {insertRows, deleteRows, splitTable}
  from '../../tools/moreapps/!Word/TblEdit';
import {gridOf} from '../../tools/moreapps/!Word/TblGrid';
import {checkTable, MAX_ROWS} from '../../tools/moreapps/!Word/TblCheck';
import {checkBlock, checkProps} from '../../tools/moreapps/!Word/ModelCheck';
import {newPara, reserveIds, OBJ}
  from '../../tools/moreapps/!Word/Model';
import {blockIds} from '../../tools/moreapps/!Word/Walk';
import {modelTable, freeze} from './tbl-fixtures.mjs';

const CK = {block: checkBlock, props: checkProps};
const valid = (t) => checkTable(t, CK, 1);
const texts = (t) => t.rows.map((r) => r.cells.map((c) =>
  c.blocks.map((b) => (b.type === 'p' ? b.text : '#')).join('|')));
const node = (n, id) => ({name: 'w:' + n, attrs: [['w:id', String(id)]],
  children: []});
const mark = (n, id) => ({kind: 'raw', level: 'p', text: '',
  node: node(n, id)});
/** A paragraph holding text with a bookmark mark at its start. */
const marked = (text, n, id) => newPara(OBJ + text,
  {inlines: {0: mark(n, id)}});
const names = (list) => list.map((x) => x.name + x.attrs[0][1]);

/** A 3x3: row 0 a header row, a vertical merge in column 2 from row
 *  1 down, row 2's paragraphs right-aligned in the Title style. */
function T33() {
  const vm = (v, t) => ({tcPr: {vMerge: v, tcW: {w: 2000, type: 'dxa'},
    extra: []}, blocks: [t]});
  const t = modelTable([['a0', 'b0', 'c0'], ['a1', 'b1',
    vm('restart', 'c1')], [{blocks: [newPara('a2', {pPr: {jc: 'right',
    extra: []}, pStyle: 'Title'})], tcPr: {extra: []}}, 'b2',
  vm('continue', '')]]);
  const rows = t.rows.map((r, i) => (i === 0 ? {...r, trPr: {...r.trPr,
    tblHeader: true}} : i === 2 ? {...r, trPr: {...r.trPr, cantSplit:
    true, trHeight: {val: 400, hRule: 'atLeast'}}} : r));
  return freeze({...t, rows});
}

describe('insertRows (D23)', () => {
  it('2 rows below rows 1-2: copied trPr / tcPr, the merge ending ' +
    'at row 2 not grown (C4 fix A4), empty paragraphs like the first ' +
    'one, fresh ids', () => {
    const T = T33();
    reserveIds({sections: [{blocks: [T]}]});
    const t = insertRows(T, 1, 2, true);
    valid(t);
    assert.equal(t.rows.length, 5);
    assert.equal(t.rows[0], T.rows[0]);
    assert.equal(t.rows[1], T.rows[1]);
    assert.equal(t.rows[2], T.rows[2]);
    assert.notEqual(t.grid, T.grid, 'a new grid array');
    assert.deepEqual(t.grid, T.grid);
    for (const r of [3, 4]) {
      const row = t.rows[r];
      assert.deepEqual(row.trPr, T.rows[2].trPr);
      assert.deepEqual([row.attrs, row.lead, row.tail, row.tblPrEx],
        [[], [], [], null]);
      assert.equal(row.cells[2].tcPr.vMerge, undefined);
      assert.deepEqual(row.cells[2].tcPr.tcW, {w: 2000, type: 'dxa'});
      const p = row.cells[0].blocks[0];
      assert.equal(p.text, '');
      assert.deepEqual(p.pPr, {jc: 'right', extra: []});
      assert.equal(p.pStyle, 'Title');
      for (const c of row.cells) {
        assert.equal(c.blocks.length, 1);
        assert.deepEqual([c.attrs, c.lead], [[], []]);
      }
    }
    // below the merge's last row: plain cells, the merge as it was
    assert.equal(gridOf(t).rows[1].cells[2].rowSpan, 2);
    assert.deepEqual(texts(t).slice(3), [['', '', ''], ['', '', '']]);
    const ids = blockIds([t]);
    assert.equal(new Set(ids).size, ids.length, 'ids unique');
    for (const id of blockIds([T])) {
      assert.equal(ids.filter((x) => x === id).length, 1);
    }
  });
  it('below a restart: the new cell continues the merge; above it: ' +
    'no vMerge; above a continue cell: continue', () => {
    const T = T33();
    const below = insertRows(T, 1, 1, true);
    assert.equal(below.rows[2].cells[2].tcPr.vMerge, 'continue');
    assert.equal(gridOf(below).rows[1].cells[2].rowSpan, 3);
    const above = insertRows(T, 1, 1, false);
    assert.equal(above.rows[1].cells[2].tcPr.vMerge, undefined);
    assert.equal(above.rows[2], T.rows[1]);
    const cont = insertRows(T, 2, 2, false);
    assert.equal(cont.rows[2].cells[2].tcPr.vMerge, 'continue');
    assert.equal(gridOf(cont).rows[1].cells[2].rowSpan, 3);
    for (const t of [below, above, cont]) valid(t);
  });
  it('tblHeader: kept above a header row; dropped below the header ' +
    'run and below a non-header row', () => {
    const T = T33();
    assert.equal(insertRows(T, 0, 0, false).rows[0].trPr.tblHeader, true);
    const t = insertRows(T, 0, 0, true);
    assert.equal(t.rows[1].trPr.tblHeader, undefined);
    assert.equal(T.rows[0].trPr.tblHeader, true, 'not changed');
    // two header rows: below the first the run goes on
    const H = freeze({...T, rows: T.rows.map((r, i) => (i === 1
      ? {...r, trPr: {...r.trPr, tblHeader: true}} : r))});
    assert.equal(insertRows(H, 0, 0, true).rows[1].trPr.tblHeader, true);
    assert.equal(insertRows(H, 1, 1, true).rows[2].trPr.tblHeader,
      undefined);
  });
  it('MAX_ROWS (R16): one past it refused with RangeError \'rows\'', () => {
    const T = T33();
    const big = (n) => ({...T, rows: Array(n).fill(T.rows[1])});
    assert.equal(insertRows(big(MAX_ROWS - 2), 0, 1, true).rows.length,
      MAX_ROWS);
    assert.throws(() => insertRows(big(MAX_ROWS - 1), 0, 1, true),
      /rows/);
    assert.throws(() => insertRows(big(MAX_ROWS), 0, 0, false), /rows/);
  });
  it('bad rows refused', () => {
    const T = T33();
    for (const [a, b] of [[-1, 0], [0, 3], [2, 1], [NaN, 0], [0, 1e9],
      ['0', 1], [0.5, 1]]) {
      assert.throws(() => insertRows(T, a, b, true), RangeError, `${a} ${b}`);
    }
  });
});

describe('deleteRows (D23)', () => {
  it('a row holding a vMerge restart: the next row\'s continue cell ' +
    'becomes the restart (TB25); a new grid array', () => {
    const T = T33();
    const t = deleteRows(T, 1, 1);
    valid(t);
    assert.deepEqual(texts(t), [['a0', 'b0', 'c0'], ['a2', 'b2', '']]);
    assert.equal(t.rows[1].cells[2].tcPr.vMerge, 'restart');
    assert.equal(T.rows[2].cells[2].tcPr.vMerge, 'continue');
    assert.equal(t.rows[0], T.rows[0]);
    assert.notEqual(t.grid, T.grid);
    assert.deepEqual(t.grid, T.grid);
  });
  it('a bookmark start in a deleted row\'s cell, its end in row 3: ' +
    'the start moves to the next row\'s lead; a pair in the deleted ' +
    'row goes with it', () => {
    const T = freeze(modelTable([['r0'], [[marked('x', 'bookmarkStart',
      1), marked('y', 'bookmarkStart', 2), marked('z', 'bookmarkEnd',
      2)]], ['r2'], [[marked('r3', 'bookmarkEnd', 1)]]]));
    const t = deleteRows(T, 1, 1);
    valid(t);
    assert.deepEqual(names(t.rows[1].lead), ['w:bookmarkStart1']);
    assert.deepEqual(texts(t), [['r0'], ['r2'], [OBJ + 'r3']]);
    // the last rows: to the table's tail, before what it held
    const T2 = freeze({...T, tail: [node('bookmarkEnd', 9)]});
    // rows 1..3 hold the pair 1 whole: nothing of it moves
    const z = deleteRows(T2, 1, 3);
    assert.deepEqual(names(z.tail), ['w:bookmarkEnd9']);
    // rows 2..3: the end moves to the tail, before what it held
    const y = deleteRows(T2, 2, 3);
    assert.deepEqual(names(y.tail), ['w:bookmarkEnd1', 'w:bookmarkEnd9']);
  });
  it('every row: null', () => {
    assert.equal(deleteRows(T33(), 0, 2), null);
  });
});

describe('splitTable (D25)', () => {
  it('at row 1: two valid tables, the second a fresh id, the same ' +
    'tblPr and grid values; a merge crossing the split restarts', () => {
    const T = freeze({...T33(), tail: [node('bookmarkEnd', 4)]});
    reserveIds({sections: [{blocks: [T]}]});
    const [a, b] = splitTable(T, 2);
    valid(a);
    valid(b);
    assert.equal(a.id, T.id);
    assert.notEqual(b.id, T.id);
    assert.deepEqual(texts(a), [['a0', 'b0', 'c0'], ['a1', 'b1', 'c1']]);
    assert.deepEqual(texts(b), [['a2', 'b2', '']]);
    assert.equal(a.tblPr, T.tblPr);
    assert.equal(b.tblPr, T.tblPr);
    assert.deepEqual(a.grid, T.grid);
    assert.deepEqual(b.grid, T.grid);
    assert.notEqual(a.grid, T.grid);
    assert.notEqual(b.grid, T.grid);
    assert.equal(a.rows[0], T.rows[0]);
    assert.equal(b.rows[0].cells[2].tcPr.vMerge, 'restart');
    assert.deepEqual(a.tail, []);
    assert.deepEqual(names(b.tail), ['w:bookmarkEnd4']);
    const [a1, b1] = splitTable(T, 1);
    assert.equal(a1.rows.length, 1);
    assert.equal(b1.rows[0], T.rows[1]);
    assert.equal(b1.rows[1], T.rows[2]);
  });
  it('row 0, past the last row or not a row: RangeError', () => {
    for (const r of [0, 3, -1, NaN, '1', 1.5]) {
      assert.throws(() => splitTable(T33(), r), RangeError, String(r));
    }
  });
});
