// TblCheck: the invariants of a typed Table (D1, D3, R9, R16), through
// ModelCheck.checkBlock, Batch C1.1.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {newPara, checkBlock} from '../../tools/moreapps/!Letters/Model';
import {checkProps} from '../../tools/moreapps/!Letters/ModelCheck';
import {checkTable, MAX_COLS, MAX_DEPTH, MAX_TW, MAX_ROWS}
  from '../../tools/moreapps/!Letters/TblCheck';
import {blockId} from '../../tools/moreapps/!Letters/DocPos';
import {modelTable, freeze} from './tbl-fixtures.mjs';

const CK = {block: checkBlock, props: checkProps};
const el = (name) => ({name, attrs: [], children: []});

/** Expect checkBlock(t) to throw a RangeError matching re. */
function bad(t, re) {
  assert.throws(() => checkBlock(t), (e) => e instanceof RangeError &&
    re.test(e.message), String(re));
}

/** t with cell (r, c) replaced by f(cell). */
function withCell(t, r, c, f) {
  const rows = t.rows.slice();
  const cells = rows[r].cells.slice();
  cells[c] = f(cells[c]);
  rows[r] = {...rows[r], cells};
  return {...t, rows};
}
const withRow = (t, r, f) => {
  const rows = t.rows.slice();
  rows[r] = f(rows[r]);
  return {...t, rows};
};
const tcPr = (t, o) => withCell(t, 0, 0, (c) => ({...c,
  tcPr: {...c.tcPr, ...o}}));

/** A raw table around `inner` (no checks: for refused shapes). */
const shell = (inner, id) => ({type: 'tbl', id, tblPr: {extra: []},
  grid: [2000], attrs: [], tail: [], gridAttrs: [], rows: [{
    trPr: {extra: []}, attrs: [], lead: [], tail: [], tblPrEx: null,
    cells: [{tcPr: {extra: []}, attrs: [], lead: [],
      blocks: [newPara('o'), inner, newPara('e')]}]}]});

/** A table nested n deep (built with newTable: n <= MAX_DEPTH). */
function nest(n) {
  let t = modelTable([['L' + n]]);
  for (let d = n - 1; d >= 1; d--) t = modelTable([[['L' + d, t, '']]]);
  return t;
}

describe('TblCheck', () => {
  const T = freeze(modelTable([['a', 'b'], ['c', 'd']]));

  it('constants (R16)', () => {
    assert.equal(MAX_COLS, 63);
    assert.equal(MAX_DEPTH, 8);
    assert.equal(MAX_TW, 31680);
    assert.equal(MAX_ROWS, 32767);
  });
  it('a valid 2x2 passes', () => {
    checkBlock(T);
    checkTable(T, CK, 1);
  });
  it('checkBlock refuses a bare {type: tbl}', () => {
    bad({type: 'tbl'}, /./);
    bad({...T, id: 1.5}, /id/);
    bad({...T, id: undefined}, /id/);
    bad({...T, tblPr: {}}, /tblPr/);
  });
  it('rows, cells, blocks', () => {
    bad({...T, rows: []}, /row/);
    bad({...T, rows: 'x'}, /row/);
    bad(withRow(T, 1, (r) => ({...r, cells: []})), /cell/);
    bad(withCell(T, 1, 1, (c) => ({...c, blocks: []})), /block/);
    bad(withCell(T, 0, 0, (c) => ({...c, blocks: [{type: 'x'}]})),
      /paragraph/);
    bad(withRow(T, 0, (r) => ({...r, trPr: null})), /trPr/);
    bad(withCell(T, 0, 0, (c) => ({...c, tcPr: {}})), /tcPr/);
  });
  it('gridSpan', () => {
    for (const v of [0, 64, 1.5, '2', -1, NaN, null]) {
      bad(tcPr(T, {gridSpan: v}), /gridSpan/);
    }
    checkBlock(tcPr(T, {gridSpan: 1}));
    // its row has a second cell: 62 + 1 columns (a row's cap, I3)
    checkBlock(tcPr(T, {gridSpan: 62}));
    checkBlock(tcPr(modelTable([['a']]), {gridSpan: 63}));
  });
  it('vMerge', () => {
    bad(tcPr(T, {vMerge: 'x'}), /vMerge/);
    bad(tcPr(T, {vMerge: true}), /vMerge/);
    checkBlock(tcPr(T, {vMerge: 'restart'}));
    checkBlock(tcPr(T, {vMerge: 'continue'}));
  });
  it('grid', () => {
    bad({...T, grid: []}, /grid/);
    bad({...T, grid: Array(64).fill(10)}, /grid/);
    bad({...T, grid: [10, -1]}, /grid/);
    bad({...T, grid: [10, 31681]}, /grid/);
    bad({...T, grid: [10, '10']}, /grid/);
    bad({...T, grid: [10, 1.5]}, /grid/);
    bad({...T, grid: 'x'}, /grid/);
    checkBlock({...T, grid: Array(63).fill(0)});
    checkBlock({...T, grid: [31680]});
  });
  it('attrs and gridAttrs: [string, string] pairs', () => {
    bad({...T, attrs: [['a']]}, /attrs/);
    bad({...T, attrs: [['a', 1]]}, /attrs/);
    bad({...T, attrs: 'a'}, /attrs/);
    bad({...T, gridAttrs: [['a', 'b', 'c']]}, /gridAttrs/);
    bad(withRow(T, 0, (r) => ({...r, attrs: [[1, 'x']]})), /attrs/);
    bad(withCell(T, 0, 0, (c) => ({...c, attrs: [null]})), /attrs/);
  });
  it('lead, tail and tblPrEx hold element nodes', () => {
    bad(withRow(T, 0, (r) => ({...r, lead: ['x']})), /lead/);
    bad(withRow(T, 0, (r) => ({...r, tail: [{name: 1}]})), /tail/);
    bad(withCell(T, 0, 1, (c) => ({...c, lead: ['x']})), /lead/);
    bad(withCell(T, 0, 1, (c) => ({...c, lead: undefined})), /lead/);
    bad({...T, tail: [{name: 'w:x', attrs: [], children: 'y'}]},
      /tail/);
    bad(withRow(T, 0, (r) => ({...r, tblPrEx: 'x'})), /tblPrEx/);
    checkBlock(withRow(T, 0, (r) => ({...r, tblPrEx: el('w:tblPrEx'),
      lead: [el('w:bookmarkStart')], tail: [el('w:bookmarkEnd')]})));
  });
  it('ids unique within the table', () => {
    const a = T.rows[0].cells[0].blocks[0];
    bad(withCell(T, 1, 1, (c) => ({...c, blocks: [a]})), /duplicate/);
    bad(withCell(T, 1, 1, (c) => ({...c, blocks: [{...a, text: 'z',
      runs: [{start: 0, end: 1, rPr: {extra: []}}]}]})), /duplicate/);
    const N = modelTable([['n']]);
    bad(withCell(T, 0, 0, (c) => ({...c, blocks: [newPara('x'),
      {...N, id: T.id}, newPara('y')]})), /duplicate/);
    bad(withCell(T, 0, 0, (c) => ({...c, blocks: [{...newPara('x'),
      id: T.id}]})), /duplicate/);
  });
  it('no sectPr in a cell paragraph', () => {
    const q = newPara('x', {pPr: {extra: [el('w:sectPr')]}});
    bad(withCell(T, 0, 0, (c) => ({...c, blocks: [q]})), /sectPr/);
    const s = newPara('x', {pPr: {extra: [el('sectPr')]}});
    bad(withCell(T, 0, 0, (c) => ({...c, blocks: [s]})), /sectPr/);
  });
  it('nested tables are checked, depth <= 8', () => {
    const t8 = nest(MAX_DEPTH);
    checkBlock(t8);
    bad(shell(t8, 1e9), /deep/);
    assert.throws(() => nest(MAX_DEPTH + 1), RangeError);
    assert.throws(() => checkTable(t8, CK, 2), /deep/);
    assert.throws(() => checkTable(T, CK, 9), /deep/);
    assert.throws(() => checkTable(T, CK, 0), RangeError);
    // a bad paragraph two tables down
    const N = modelTable([['n']]);
    const badN = withCell(N, 0, 0, (c) => ({...c,
      blocks: [{...c.blocks[0], runs: []}]}));
    bad(withCell(T, 0, 0, (c) => ({...c, blocks: [newPara('x'), badN,
      newPara('y')]})), /runs/);
  });
  it('Opaque cell blocks pass', () => {
    checkBlock(withCell(T, 0, 0, (c) => ({...c, blocks: [{type: 'opaque',
      node: el('w:sdt')}, newPara('x')]})));
  });
  it('ragged rows pass', () => {
    checkBlock(modelTable([['a', 'b', 'c'], ['d']]));
  });
  it('gridBefore / gridAfter integers 0..MAX_COLS (R2)', () => {
    const trPr = (o) => withRow(T, 0, (r) => ({...r,
      trPr: {...r.trPr, ...o}}));
    for (const k of ['gridBefore', 'gridAfter']) {
      for (const v of [-1, 64, 100, 1.5, '1', NaN, null, 1e9]) {
        bad(trPr({[k]: v}), new RegExp(k));
      }
      checkBlock(trPr({[k]: 0}));
    }
    checkBlock(trPr({gridBefore: 30, gridAfter: 31}));
  });
  it('a row at most MAX_COLS grid columns wide (I3)', () => {
    const cells = (n) => Array.from({length: n}, () =>
      T.rows[0].cells[0]).map((c, k) => ({...c,
      blocks: [newPara('c' + k)]}));
    const row = (o) => withRow(T, 0, (r) => ({...r, ...o}));
    bad(row({cells: cells(64)}), /wide/);
    bad(row({cells: cells(5000)}), /wide/);
    checkBlock(row({cells: cells(63)}));
    const span = (n) => ({...T.rows[0].cells[0], tcPr: {extra: [],
      gridSpan: n}});
    bad(row({trPr: {extra: [], gridBefore: 63, gridAfter: 63},
      cells: [span(63)]}), /wide/);
    bad(row({trPr: {extra: [], gridBefore: 1}, cells: [span(62),
      T.rows[0].cells[1]]}), /wide/);
    checkBlock(row({trPr: {extra: [], gridBefore: 1, gridAfter: 1},
      cells: [span(61)]}));
    assert.throws(() => modelTable([Array(64).fill('x')],
      {grid: [2000]}), /wide/);
  });
  it('__proto__ as an attribute name is inert', () => {
    const t = {...T, attrs: [['__proto__', 'x'], ['constructor', 'y']]};
    checkBlock(t);
    assert.equal(({}).x, undefined);
    assert.equal(Object.getPrototypeOf(t.attrs), Array.prototype);
  });
  it('DocPos.blockId of a table is its id', () => {
    assert.equal(blockId(T), T.id);
    assert.ok(blockId({type: 'opaque', node: el('w:sdt')}) < 0);
  });
});
