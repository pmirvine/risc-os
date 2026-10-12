// TblEditCols and the column, select and distribute commands (Batch
// C4.2, D24, D26, TB12, TB25, R16): insertCols (as many columns as
// selected, each the width of the selected column it copies; each row
// a cell there (a copy of the neighbour's tcPr without vMerge and
// gridSpan, tcW dxa of the new width) or, where a gridSpan crosses the
// point, the span grows; a table within the text width that would
// leave it is scaled back to its old total, TB12); deleteCols (spans
// crossing shrink, cells inside go, rows left with no cell go, every
// column: null; their bookmark marks kept); distributeCols (equal
// widths over the columns' total); distributeRows (trHeight atLeast =
// the tallest, from the layout's px); the commands (one undo step,
// undo gives the very old table; select: no step). Fixtures are
// deep-frozen: no object that exists is changed.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {insertCols, deleteCols, distributeCols, distributeRows}
  from '../../tools/moreapps/!Letters/TblEditCols';
import {insertColsCmd, deleteColsCmd, selectCmd, distributeRowsCmd,
  distributeColsCmd, TABLE} from '../../tools/moreapps/!Letters/TblCmdCols';
import {gridOf} from '../../tools/moreapps/!Letters/TblGrid';
import {checkTable, MAX_COLS} from '../../tools/moreapps/!Letters/TblCheck';
import {checkBlock, checkProps} from '../../tools/moreapps/!Letters/ModelCheck';
import {newPara, reserveIds, OBJ}
  from '../../tools/moreapps/!Letters/Model';
import {blockIds, at as walkAt, ids as allIds, forEachBlock}
  from '../../tools/moreapps/!Letters/Walk';
import {shapeOf} from '../../tools/moreapps/!Letters/SelShape';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {run} from '../../tools/moreapps/!Letters/EditApply';
import {runView} from '../../tools/moreapps/!Letters/EditRun';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {findBlock} from '../../tools/moreapps/!Letters/EditPos';
import {mk, undoable, S} from './edit-docs.mjs';
import {tm, rng} from './word-docs.mjs';
import {modelTable, freeze} from './tbl-fixtures.mjs';

const CK = {block: checkBlock, props: checkProps};
const valid = (t) => checkTable(t, CK, 1);
const texts = (t) => t.rows.map((r) => r.cells.map((c) =>
  c.blocks.map((b) => (b.type === 'p' ? b.text : '#')).join('|')));
const dxa = (w) => ({w, type: 'dxa'});
/** A cell {blocks, tcPr} for modelTable, tcW dxa w, more tcPr. */
const cw = (text, w, more = {}) => ({blocks: [newPara(text)],
  tcPr: {tcW: dxa(w), ...more, extra: []}});
const tcW = (t) => t.rows.map((r) => r.cells.map((c) => c.tcPr.tcW &&
  c.tcPr.tcW.w));
const sum = (a) => a.reduce((x, y) => x + y, 0);
/** Every row covers the grid once (but gridBefore / gridAfter). */
function covers(t) {
  const g = gridOf(t);
  for (const row of g.rows) {
    const cs = row.cells;
    assert.equal(cs[0].c0, row.before);
    for (let k = 1; k < cs.length; k++) assert.equal(cs[k].c0,
      cs[k - 1].c1);
    assert.ok(cs[cs.length - 1].c1 + row.after <= t.grid.length);
  }
}

/** A 3x3 of 3000-twip columns, tcW dxa 3000, tblW dxa 9000. */
const T33 = () => freeze(modelTable([0, 1, 2].map((i) => [0, 1, 2]
  .map((j) => cw(`r${i}c${j}`, 3000))), {grid: [3000, 3000, 3000],
  tblPr: {tblW: dxa(9000), extra: []}}));
const keep = (T) => reserveIds({sections: [{blocks: [T]}]});

describe('insertCols (D24)', () => {
  it('right of column 1 in a full-width 3x3: 4 columns scaled to ' +
    'the old total (TB12), integers', () => {
    const T = T33();
    keep(T);
    const t = insertCols(T, gridOf(T), {c0: 1, c1: 1, right: true}, 9026);
    valid(t);
    covers(t);
    assert.equal(t.grid.length, 4);
    assert.ok(t.grid.every(Number.isInteger));
    assert.equal(sum(t.grid), 9000);
    assert.deepEqual(t.grid, [2250, 2250, 2250, 2250]);
    assert.deepEqual(tcW(t), [0, 1, 2].map(() => [2250, 2250, 2250,
      2250]));
    assert.deepEqual(t.tblPr.tblW, dxa(9000), 'the total kept');
    assert.deepEqual(texts(t)[1], ['r1c0', 'r1c1', '', 'r1c2']);
    assert.notEqual(t.grid, T.grid);
  });
  it('a table already wider than the text, or one that still fits: ' +
    'not scaled; untouched cells shared; tblW dxa grows', () => {
    const T = T33();
    keep(T);
    for (const tw of [5000, 20000]) {
      const t = insertCols(T, gridOf(T), {c0: 1, c1: 1, right: true},
        tw);
      valid(t);
      assert.deepEqual(t.grid, [3000, 3000, 3000, 3000]);
      assert.deepEqual(t.tblPr.tblW, dxa(12000));
      for (let r = 0; r < 3; r++) {
        assert.equal(t.rows[r].cells[0], T.rows[r].cells[0]);
        assert.equal(t.rows[r].cells[1], T.rows[r].cells[1]);
        assert.equal(t.rows[r].cells[3], T.rows[r].cells[2]);
        assert.deepEqual(t.rows[r].cells[2].tcPr.tcW, dxa(3000));
      }
    }
  });
  it('left of column 0; two columns selected: two columns of their ' +
    'widths', () => {
    const T = freeze(modelTable([[cw('a', 1000), cw('b', 2000),
      cw('c', 3000)]], {grid: [1000, 2000, 3000]}));
    keep(T);
    const l = insertCols(T, gridOf(T), {c0: 0, c1: 0, right: false},
      1e9);
    assert.deepEqual(l.grid, [1000, 1000, 2000, 3000]);
    assert.deepEqual(texts(l), [['', 'a', 'b', 'c']]);
    const r = insertCols(T, gridOf(T), {c0: 0, c1: 1, right: true}, 1e9);
    assert.deepEqual(r.grid, [1000, 2000, 1000, 2000, 3000]);
    assert.deepEqual(tcW(r), [[1000, 2000, 1000, 2000, 3000]]);
    assert.deepEqual(texts(r), [['a', 'b', '', '', 'c']]);
    valid(r);
  });
  it('a gridSpan crossing the point grows by one (tcW dxa with it)',
    () => {
      const T = freeze(modelTable([[cw('ab', 6000, {gridSpan: 2}),
        cw('c', 3000)], [cw('a', 3000), cw('b', 3000), cw('c', 3000)]],
      {grid: [3000, 3000, 3000]}));
      keep(T);
      const t = insertCols(T, gridOf(T), {c0: 0, c1: 0, right: true}, 1e9);
      valid(t);
      covers(t);
      assert.equal(t.rows[0].cells.length, 2);
      assert.equal(t.rows[0].cells[0].tcPr.gridSpan, 3);
      assert.deepEqual(t.rows[0].cells[0].tcPr.tcW, dxa(9000));
      assert.equal(t.rows[0].cells[0].blocks, T.rows[0].cells[0].blocks);
      assert.equal(t.rows[0].cells[1], T.rows[0].cells[1]);
      assert.deepEqual(texts(t)[1], ['a', '', 'b', 'c']);
    });
  it('next to a vertical merge: new cells plain, the merge kept; ' +
    'empty paragraphs like the neighbour\'s, fresh ids', () => {
    const p = newPara('x', {pPr: {jc: 'right', extra: []},
      pStyle: 'Title'});
    const T = freeze(modelTable([[cw('a', 3000), {blocks: [p], tcPr: {
      vMerge: 'restart', tcW: dxa(3000), extra: []}}], [cw('b', 3000),
      cw('', 3000, {vMerge: 'continue'})]], {grid: [3000, 3000]}));
    keep(T);
    const t = insertCols(T, gridOf(T), {c0: 1, c1: 1, right: true}, 1e9);
    valid(t);
    const g = gridOf(t);
    assert.equal(g.rows[0].cells[1].rowSpan, 2, 'the merge kept');
    for (const r of [0, 1]) {
      const c = t.rows[r].cells[2];
      assert.equal(c.tcPr.vMerge, undefined);
      assert.equal(g.rows[r].cells[2].cont, false);
    }
    const n = t.rows[0].cells[2].blocks[0];
    assert.equal(n.text, '');
    assert.equal(n.pStyle, 'Title');
    assert.deepEqual(n.pPr, p.pPr);
    const all = blockIds([t]);
    assert.equal(new Set(all).size, all.length, 'ids unique');
  });
  it('a row whose gridBefore holds the point: gridBefore grows', () => {
    const T = freeze(modelTable([[cw('a', 3000), cw('b', 3000)],
      [{blocks: [newPara('c')], tcPr: {tcW: dxa(3000), extra: []}}]],
    {grid: [3000, 3000]}));
    const T1 = freeze({...T, rows: [T.rows[0], {...T.rows[1], trPr: {
      gridBefore: 1, extra: []}}]});
    keep(T1);
    const t = insertCols(T1, gridOf(T1), {c0: 0, c1: 0, right: false},
      1e9);
    valid(t);
    covers(t);
    assert.equal(t.rows[1].trPr.gridBefore, 2);
    assert.equal(T1.rows[1].trPr.gridBefore, 1);
    assert.deepEqual(texts(t), [['', 'a', 'b'], ['c']]);
  });
  it('past 63 columns: refused (RangeError columns); 63 allowed', () => {
    const T = freeze(modelTable([Array.from({length: 62}, (_, i) =>
      'c' + i)], {grid: Array(62).fill(100)}));
    keep(T);
    const t = insertCols(T, gridOf(T), {c0: 0, c1: 0, right: true}, 1e9);
    assert.equal(t.grid.length, MAX_COLS);
    valid(t);
    assert.throws(() => insertCols(t, gridOf(t), {c0: 0, c1: 0,
      right: true}, 1e9), /columns/);
    assert.throws(() => insertCols(T, gridOf(T), {c0: 0, c1: 1,
      right: true}, 1e9), /columns/);
  });
  it('a row ending before the point: nothing there (ragged); its ' +
    'gridAfter holding the point grows; absurd textTw: never scaled',
  () => {
    const T = freeze(modelTable([[cw('a', 3000), cw('b', 3000),
      cw('c', 3000)], [cw('d', 3000)], [cw('e', 3000)]],
    {grid: [3000, 3000, 3000]}));
    const T1 = freeze({...T, rows: [T.rows[0], T.rows[1], {...T.rows[2],
      trPr: {gridAfter: 2, extra: []}}]});
    keep(T1);
    const t = insertCols(T1, gridOf(T1), {c0: 2, c1: 2, right: true},
      1e9);
    valid(t);
    assert.equal(t.rows[1], T1.rows[1], 'row 1 ends at column 1');
    assert.equal(t.rows[2].trPr.gridAfter, 3);
    assert.deepEqual(texts(t)[0], ['a', 'b', 'c', '']);
    for (const tw of [NaN, -1, 0, undefined, '9026', 1e9]) {
      const u = insertCols(T1, gridOf(T1), {c0: 0, c1: 0, right: true},
        tw);
      assert.equal(sum(u.grid), 12000, String(tw));
    }
  });
  it('bad columns: RangeError', () => {
    const T = T33();
    for (const x of [{c0: -1, c1: 0}, {c0: 1, c1: 0}, {c0: 0, c1: 3},
      {c0: NaN, c1: 1}, {c0: '__proto__', c1: 1}]) {
      assert.throws(() => insertCols(T, gridOf(T), {...x, right: true},
        1e9), RangeError);
      assert.throws(() => deleteCols(T, gridOf(T), x), RangeError);
      assert.throws(() => distributeCols(T, gridOf(T), x), RangeError);
    }
  });
});

describe('deleteCols (D24, TB25)', () => {
  it('column 1 through a gridSpan 2 cell: the span shrinks, the cell ' +
    'inside goes, tblW dxa follows', () => {
    const T = freeze(modelTable([[cw('ab', 6000, {gridSpan: 2}),
      cw('c', 3000)], [cw('a', 3000), cw('b', 3000), cw('c', 3000)]],
    {grid: [3000, 3000, 3000], tblPr: {tblW: dxa(9000), extra: []}}));
    const t = deleteCols(T, gridOf(T), {c0: 1, c1: 1});
    valid(t);
    covers(t);
    assert.deepEqual(t.grid, [3000, 3000]);
    assert.equal(t.rows[0].cells[0].tcPr.gridSpan, undefined);
    assert.deepEqual(t.rows[0].cells[0].tcPr.tcW, dxa(3000));
    assert.equal(t.rows[0].cells[1], T.rows[0].cells[1]);
    assert.deepEqual(texts(t), [['ab', 'c'], ['a', 'c']]);
    assert.equal(t.rows[1].cells[0], T.rows[1].cells[0]);
    assert.deepEqual(t.tblPr.tblW, dxa(6000));
  });
  it('every column: null; a row left with no cell goes', () => {
    const T = T33();
    assert.equal(deleteCols(T, gridOf(T), {c0: 0, c1: 2}), null);
    const U = freeze(modelTable([[cw('a', 3000), cw('b', 3000),
      cw('c', 3000)], [cw('d', 6000, {gridSpan: 2})]],
    {grid: [3000, 3000, 3000]}));
    const U1 = freeze({...U, rows: [U.rows[0], {...U.rows[1], trPr: {
      gridBefore: 1, extra: []}}]});
    const t = deleteCols(U1, gridOf(U1), {c0: 1, c1: 2});
    valid(t);
    assert.deepEqual(texts(t), [['a']]);
    assert.deepEqual(t.grid, [3000]);
  });
  it('gridBefore / gridAfter over deleted columns shrink', () => {
    const T = freeze(modelTable([[cw('a', 3000), cw('b', 3000),
      cw('c', 3000)], [cw('d', 3000)]], {grid: [3000, 3000, 3000]}));
    const T1 = freeze({...T, rows: [T.rows[0], {...T.rows[1], trPr: {
      gridBefore: 1, gridAfter: 1, extra: []}}]});
    const t = deleteCols(T1, gridOf(T1), {c0: 2, c1: 2});
    valid(t);
    assert.equal(t.rows[1].trPr.gridBefore, 1);
    assert.equal(t.rows[1].trPr.gridAfter, undefined);
    const u = deleteCols(T1, gridOf(T1), {c0: 0, c1: 0});
    assert.equal(u.rows[1].trPr.gridBefore, undefined);
    assert.equal(u.rows[1].trPr.gridAfter, 1);
  });
  it('a merge crossing the columns shrinks on every row; a continue ' +
    'cell that would now join a merge it was not in restarts', () => {
    const T = freeze(modelTable([[cw('a', 3000), cw('bc', 6000,
      {gridSpan: 2, vMerge: 'restart'})], [cw('d', 3000),
      cw('', 3000, {vMerge: 'continue'}), cw('f', 3000)], [cw('g', 3000),
      cw('hi', 6000, {gridSpan: 2, vMerge: 'restart'})], [cw('j', 3000),
      cw('', 6000, {gridSpan: 2, vMerge: 'continue'})]],
    {grid: [3000, 3000, 3000]}));
    assert.equal(gridOf(T).rows[1].cells[1].cont, false);
    assert.equal(gridOf(T).rows[2].cells[1].rowSpan, 2);
    const t = deleteCols(T, gridOf(T), {c0: 2, c1: 2});
    valid(t);
    const g = gridOf(t);
    assert.equal(t.rows[1].cells[1].tcPr.vMerge, 'restart');
    assert.equal(g.rows[0].cells[1].rowSpan, 1, 'no new join');
    assert.equal(g.rows[2].cells[1].rowSpan, 2, 'the merge kept');
    assert.deepEqual(texts(t), [['a', 'bc'], ['d', ''], ['g', 'hi'],
      ['j', '']]);
  });
  it('a bookmark start in a deleted cell, its end in a kept one: the ' +
    'start moves to the next cell\'s lead (row tail at the end)', () => {
    const mark = (n) => ({kind: 'raw', level: 'p', text: '', node: {
      name: 'w:' + n, attrs: [['w:id', '7']], children: []}});
    const at = (n, t) => newPara(OBJ + t, {inlines: {0: mark(n)}});
    const T = freeze(modelTable([[cw('a', 3000), {blocks: [at(
      'bookmarkStart', 'b')], tcPr: {extra: []}}, cw('c', 3000)],
    [cw('d', 3000), cw('e', 3000), {blocks: [at('bookmarkEnd', 'f')],
      tcPr: {extra: []}}]], {grid: [3000, 3000, 3000]}));
    const t = deleteCols(T, gridOf(T), {c0: 1, c1: 1});
    valid(t);
    assert.deepEqual(t.rows[0].cells[1].lead.map((n) => n.name),
      ['w:bookmarkStart']);
    const u = deleteCols(T, gridOf(T), {c0: 2, c1: 2});
    assert.deepEqual(u.rows[1].tail.map((n) => n.name),
      ['w:bookmarkEnd']);
    const both = deleteCols(T, gridOf(T), {c0: 1, c1: 2});
    assert.deepEqual(both.rows.map((r) => r.tail.length), [0, 0],
      'a pair wholly removed goes with its cells');
  });
});

describe('distribute (D26)', () => {
  it('3 columns of 1000 / 2000 / 3000: 2000 each, tcW with them', () => {
    const T = freeze(modelTable([[cw('a', 1000), cw('b', 2000),
      cw('c', 3000)], [cw('d', 3000, {gridSpan: 2}), cw('e', 3000)]],
    {grid: [1000, 2000, 3000]}));
    const t = distributeCols(T, gridOf(T), {c0: 0, c1: 2});
    valid(t);
    assert.deepEqual(t.grid, [2000, 2000, 2000]);
    assert.deepEqual(tcW(t), [[2000, 2000, 2000], [4000, 2000]]);
    const u = distributeCols(T, gridOf(T), {c0: 0, c1: 1});
    assert.deepEqual(u.grid, [1500, 1500, 3000]);
    assert.equal(u.rows[0].cells[2], T.rows[0].cells[2]);
    const v = distributeCols(t, gridOf(t), {c0: 0, c1: 2});
    assert.equal(v, t, 'already even: the same table');
    const w = distributeCols(freeze(modelTable([['a', 'b']],
      {grid: [1000, 1001]})), null, {c0: 0, c1: 1});
    assert.deepEqual(w.grid, [1000, 1001], 'integers, the total kept');
  });
  it('rows of 20 / 40 px: trHeight atLeast 600 twips each; rows ' +
    'outside shared', () => {
    const T = freeze(modelTable([['a'], ['b'], ['c']]));
    const t = distributeRows(T, {r0: 0, r1: 1}, [20, 40]);
    valid(t);
    for (const r of [0, 1]) {
      assert.deepEqual(t.rows[r].trPr.trHeight, {val: 600,
        hRule: 'atLeast'});
      assert.equal(t.rows[r].cells, T.rows[r].cells);
    }
    assert.equal(t.rows[2], T.rows[2]);
    assert.equal(distributeRows(t, {r0: 0, r1: 1}, [40, 40]), t);
    for (const bad of [[20], [20, NaN], [20, -1], null, ['x', 2]]) {
      assert.throws(() => distributeRows(T, {r0: 0, r1: 1}, bad),
        RangeError);
    }
    const big = distributeRows(T, {r0: 0, r1: 0}, [1e9]);
    assert.equal(big.rows[0].trPr.trHeight.val, 31680, 'MAX_TW');
  });
});

// ---- the commands ----------------------------------------------------

function byText(doc, t) {
  let out = null;
  forEachBlock(doc, (b) => {
    if (b.type === 'p' && b.text === t) {
      out = b;
      return false;
    }
    return true;
  });
  return out;
}
const pos = (d, t, off = 0) => ({id: byText(d.doc, t).id, off});
const car = (d, t, off) => S.caret(pos(d, t, off));
const sel = (d, a, ao, h, ho) => S.select(pos(d, a, ao), pos(d, h, ho));
const T3 = () => freeze(modelTable([0, 1, 2].map((i) => [0, 1, 2]
  .map((j) => cw(`r${i}c${j}`, 3000))), {grid: [3000, 3000, 3000]}));
function doc(T = T3()) {
  return {d: mk(['p0', T, 'p2']), T};
}
const laid = (d) => {
  const L = new DocLayout(d.doc, tm());
  L.layout(800);
  return L;
};
const name = (d, p) => {
  let out = null;
  forEachBlock(d.doc, (b) => {
    if (b.id === p.id) out = b.type === 'p' ? `${b.text}:${p.off}`
      : `tbl:${p.off}`;
    return out === null;
  });
  return out;
};

describe('column commands', () => {
  it('insert right: one step, scaled to the text width with a ' +
    'layout (TB12); undo gives the very old table', () => {
    const {d, T} = doc();
    const L = laid(d);
    const out = undoable(d, () => insertColsCmd(d, car(d, 'r1c1', 1),
      true, L));
    const t = walkAt(d.doc, [0, 1]);
    assert.equal(t.grid.length, 4);
    assert.equal(sum(t.grid), 9000);
    assert.equal(name(d, out.head), 'r1c1:1', 'the selection stays');
    assert.equal(d.undoDepth, 1);
    d.undo();
    assert.equal(walkAt(d.doc, [0, 1]), T);
  });
  it('insert left over a cells shape of two columns: two columns, ' +
    'unscaled without a layout', () => {
    const {d} = doc();
    undoable(d, () => insertColsCmd(d, sel(d, 'r0c1', 0, 'r1c2', 1),
      false));
    const t = walkAt(d.doc, [0, 1]);
    assert.deepEqual(t.grid, [3000, 3000, 3000, 3000, 3000]);
    assert.deepEqual(texts(t)[0], ['r0c0', '', '', 'r0c1', 'r0c2']);
  });
  it('delete the caret\'s column: the caret in the column after; ' +
    'every column: the table goes', () => {
    const {d, T} = doc();
    const out = undoable(d, () => deleteColsCmd(d, car(d, 'r1c1', 1)));
    assert.equal(name(d, out.head), 'r1c2:0');
    assert.deepEqual(texts(walkAt(d.doc, [0, 1]))[1], ['r1c0', 'r1c2']);
    d.undo();
    assert.equal(walkAt(d.doc, [0, 1]), T);
    const last = undoable(d, () => deleteColsCmd(d, car(d, 'r0c2', 0)));
    assert.equal(name(d, last.head), 'r0c1:0', 'the column before');
    const e = doc().d;
    const all = undoable(e, () => deleteColsCmd(e,
      sel(e, 'r0c0', 0, 'r2c2', 1)));
    assert.equal(name(e, all.head), 'p2:0');
    assert.equal(e.doc.sections[0].blocks.length, 2);
  });
  it('past 63 columns or not in a table: refused, no step', () => {
    const W = freeze(modelTable([Array.from({length: 63}, (_, i) =>
      'w' + i)], {grid: Array(63).fill(100)}));
    const {d} = doc(W);
    assert.equal(insertColsCmd(d, car(d, 'w3', 0), true), null);
    const e = doc().d;
    for (const fn of [(s) => insertColsCmd(e, s, true),
      (s) => deleteColsCmd(e, s), (s) => distributeColsCmd(e, s),
      (s) => distributeRowsCmd(e, s, laid(e)),
      (s) => selectCmd(e, s, 'row')]) {
      assert.equal(fn(car(e, 'p0', 1)), null);
      assert.equal(fn(sel(e, 'p0', 1, 'r1c1', 1)), null);
      assert.equal(fn(null), null);
    }
    assert.equal(d.undoDepth + e.undoDepth, 0);
  });
});

describe('select (no step)', () => {
  const shape = (d, s) => {
    const x = shapeOf(d.doc, s);
    return x.kind === 'cells' ? [x.r0, x.r1, x.c0, x.c1, x.whole]
      : x.kind;
  };
  it('cell, row, column, table from a caret and from a shape', () => {
    const {d} = doc();
    const c = car(d, 'r1c1', 2);
    const cell = selectCmd(d, c, 'cell');
    assert.equal(name(d, cell.anchor), 'r1c1:0');
    assert.equal(name(d, cell.head), 'r1c1:4');
    assert.deepEqual(shape(d, selectCmd(d, c, 'row')), [1, 1, 0, 2,
      false]);
    assert.deepEqual(shape(d, selectCmd(d, c, 'column')), [0, 2, 1, 1,
      false]);
    assert.deepEqual(shape(d, selectCmd(d, c, 'table')), [0, 2, 0, 2,
      true]);
    const s = sel(d, 'r0c0', 1, 'r1c1', 1);
    assert.deepEqual(shape(d, selectCmd(d, s, 'row')), [0, 1, 0, 2,
      false]);
    assert.deepEqual(shape(d, selectCmd(d, s, 'column')), [0, 2, 0, 1,
      false]);
    assert.equal(name(d, selectCmd(d, s, 'cell').head), 'r1c1:4');
    assert.equal(selectCmd(d, c, 'nonsense'), null);
    assert.equal(d.undoDepth, 0);
  });
  it('through EditApply.run: no undo step; in a nested table, its ' +
    'own rows', () => {
    const N = freeze(modelTable([['n0', 'n1'], ['n2', 'n3']]));
    const {d} = doc(freeze(modelTable([[{blocks: [newPara('a'), N,
      newPara('z')], tcPr: {extra: []}}, 'b']])));
    const ty = new Typing(d);
    const out = run('selectTable', d, ty, car(d, 'n2', 1));
    const x = shapeOf(d.doc, out);
    assert.equal(x.kind, 'cells');
    assert.equal(x.whole, true);
    assert.deepEqual(x.table, findBlock(d.doc, N.id).at);
    const col = run('selectColumn', d, ty, car(d, 'n3', 0));
    assert.deepEqual(shape(d, col), [0, 1, 1, 1, false]);
    assert.equal(d.undoDepth, 0);
  });
  it('a merged cell: the row and column grow over it', () => {
    const T = freeze(modelTable([[cw('a', 3000), cw('b', 3000,
      {vMerge: 'restart'})], [cw('c', 3000), cw('', 3000,
      {vMerge: 'continue'})], [cw('e', 3000), cw('f', 3000)]],
    {grid: [3000, 3000]}));
    const {d} = doc(T);
    assert.deepEqual(shape(d, selectCmd(d, car(d, 'c', 0), 'row')),
      [0, 1, 0, 1, false]);
  });
});

describe('distribute commands', () => {
  it('columns: a caret distributes the whole table; a shape its ' +
    'columns; one step, undo the very old table', () => {
    const T = freeze(modelTable([[cw('a', 1000), cw('b', 2000),
      cw('c', 3000)]], {grid: [1000, 2000, 3000]}));
    const {d} = doc(T);
    undoable(d, () => distributeColsCmd(d, car(d, 'a', 0)));
    assert.deepEqual(walkAt(d.doc, [0, 1]).grid, [2000, 2000, 2000]);
    assert.equal(d.undoDepth, 1);
    d.undo();
    assert.equal(walkAt(d.doc, [0, 1]), T);
    undoable(d, () => distributeColsCmd(d, sel(d, 'a', 0, 'b', 1)));
    assert.deepEqual(walkAt(d.doc, [0, 1]).grid, [1500, 1500, 3000]);
    const n = d.undoDepth;
    assert.equal(distributeColsCmd(d, sel(d, 'a', 0, 'b', 1)), null,
      'nothing to change: null, no step');
    assert.equal(d.undoDepth, n);
  });
  it('rows: the tallest row\'s height from the layout, atLeast; ' +
    'refused without a layout', () => {
    const T = freeze(modelTable([['a'], [{blocks: [newPara('b1'),
      newPara('b2'), newPara('b3')], tcPr: {extra: []}}], ['c']]));
    const {d} = doc(T);
    const L = laid(d);
    const it = L.byId.get(T.id);
    const tall = Math.round(Math.max(...it.rows.map((r) => r.h)) * 15);
    assert.equal(distributeRowsCmd(d, car(d, 'a', 0)), null);
    undoable(d, () => distributeRowsCmd(d, car(d, 'a', 0), L));
    const t = walkAt(d.doc, [0, 1]);
    for (const r of t.rows) {
      assert.deepEqual(r.trPr.trHeight, {val: tall, hRule: 'atLeast'});
    }
    assert.ok(tall > 3 * 15 * 10);
    const e = doc(T).d;
    run('distributeRows', e, new Typing(e), car(e, 'a', 0), {arg: {
      L: laid(e)}});
    assert.equal(e.undoDepth, 1, 'through EditApply.run with arg L');
  });
  it('the view runs a table command with its layout (EditRun)', () => {
    const T = freeze(modelTable([['a'], [{blocks: [newPara('b1'),
      newPara('b2')], tcPr: {extra: []}}]]));
    const {d} = doc(T);
    let got = null, laidOut = 0;
    const v = {d, sel: car(d, 'a', 0), typing: new Typing(d),
      pending: null, refused: () => assert.fail('refused'),
      edited: (s) => { got = s; }, ensure() {},
      get L() { laidOut++; return laid(d); }};
    assert.equal(runView(v, 'distributeRows'), true);
    assert.equal(laidOut, 1);
    assert.ok(got && got.head);
    assert.equal(d.undoDepth, 1);
    assert.ok(walkAt(d.doc, [0, 1]).rows[0].trPr.trHeight);
    laidOut = 0;
    v.sel = car(d, 'a', 1);
    runView(v, 'enter');
    assert.equal(laidOut, 0, 'not for other commands');
  });
});

describe('TABLE ids and ids (tblids)', () => {
  it('every command has its id', () => {
    for (const id of ['tabRow', 'splitTable', 'rowsAbove', 'rowsBelow',
      'deleteRows', 'colsLeft', 'colsRight', 'deleteCols',
      'selectCell', 'selectRow', 'selectColumn', 'selectTable',
      'distributeRows', 'distributeCols']) {
      assert.equal(typeof TABLE[id], 'function', id);
    }
  });
  it('60 random column commands: no id twice, every block valid, ' +
    'each at most one step', () => {
    const N = modelTable([['n0', 'n1'], ['n2', 'n3']]);
    const d = mk(['p0', freeze(modelTable([['a', 'b'], [{blocks: [
      newPara('c'), N, newPara('e')], tcPr: {extra: []}}, 'f']])), 'p1',
    T3(), 'p2']);
    const rand = rng(7);
    let done = 0;
    for (let k = 0; k < 60; k++) {
      const paras = [];
      forEachBlock(d.doc, (b, at) => {
        if (b.type === 'p' && at.length > 2) paras.push(b);
      });
      if (!paras.length) break;
      const p = paras[Math.floor(rand() * paras.length)];
      const s = S.caret({id: p.id, off: 0});
      const cmd = [() => insertColsCmd(d, s, rand() < 0.5, laid(d)),
        () => deleteColsCmd(d, s), () => distributeColsCmd(d, s),
        () => insertColsCmd(d, s, true)][Math.floor(rand() * 4)];
      const n = d.undoDepth;
      if (cmd()) done++;
      assert.ok(d.undoDepth <= n + 1, 'at most one step');
      const all = allIds(d.doc);
      assert.equal(new Set(all).size, all.length, 'ids unique');
      for (const b of d.doc.sections[0].blocks) checkBlock(b);
    }
    assert.ok(done > 30, 'commands applied: ' + done);
  });
});
