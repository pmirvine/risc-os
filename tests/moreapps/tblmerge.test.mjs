// TblMerge and the merge / split commands (Batch C4.3, D25, TB13,
// TB14, R16): mergeCells (in each row of the rectangle the cells
// become one, gridSpan the columns' sum, the first cell's tcPr, tcW
// summed; across rows the first row's cell restart, the rows below
// continue; the content the shown cells' blocks in flow order, empty
// cells' lone empty paragraphs skipped, at least one paragraph; a
// hidden (continue) cell's content stays hidden in its row; refused
// (null) when the rectangle cannot be made whole or is one cell);
// splitCell (a cell with gridSpan >= cols divides its span; else grid
// columns split, the other rows' cells across them grow their span;
// rows: new rows after, the row's other cells vMerge-extended; a
// vertically merged cell divides its rows; the content stays in the
// first new cell; null past MAX_COLS / MAX_ROWS); the commands (one
// undo step each, undo gives the very old table). Fixtures are
// deep-frozen: no object that exists is changed.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {mergeCells, splitCell}
  from '../../tools/moreapps/!Letters/TblMerge';
import {mergeCmd, splitCellsCmd, rectOf}
  from '../../tools/moreapps/!Letters/TblCmd';
import {TABLE} from '../../tools/moreapps/!Letters/TblCmdCols';
import {gridOf} from '../../tools/moreapps/!Letters/TblGrid';
import {checkTable, MAX_ROWS} from '../../tools/moreapps/!Letters/TblCheck';
import {checkBlock, checkProps} from '../../tools/moreapps/!Letters/ModelCheck';
import {newPara, reserveIds, OBJ}
  from '../../tools/moreapps/!Letters/Model';
import {at as walkAt, ids as allIds, forEachBlock}
  from '../../tools/moreapps/!Letters/Walk';
import {run} from '../../tools/moreapps/!Letters/EditApply';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {mk, undoable, S} from './edit-docs.mjs';
import {rng} from './word-docs.mjs';
import {modelTable, freeze} from './tbl-fixtures.mjs';

const CK = {block: checkBlock, props: checkProps};
const valid = (t) => checkTable(t, CK, 1);
const txt = (c) => c.blocks.map((b) => (b.type === 'p' ? b.text : '#'))
  .join('|');
const texts = (t) => t.rows.map((r) => r.cells.map(txt));
const dxa = (w) => ({w, type: 'dxa'});
/** A cell {blocks, tcPr} for modelTable, tcW dxa w, more tcPr. */
const cw = (text, w, more = {}) => ({blocks: [newPara(text)],
  tcPr: {tcW: dxa(w), ...more, extra: []}});
const tcW = (t) => t.rows.map((r) => r.cells.map((c) => c.tcPr.tcW &&
  c.tcPr.tcW.w));
const spans = (t) => t.rows.map((r) => r.cells.map((c) =>
  c.tcPr.gridSpan || 1));
const vm = (t) => t.rows.map((r) => r.cells.map((c) =>
  c.tcPr.vMerge || '-'));
const sum = (a) => a.reduce((x, y) => x + y, 0);
const keep = (T) => reserveIds({sections: [{blocks: [T]}]});
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
/** The paragraph and table ids of t, every one once. */
function uniqueIds(t) {
  const got = [];
  forEachBlock({sections: [{blocks: [t]}]}, (b) => {
    if (b.id !== undefined) got.push(b.id);
  });
  assert.equal(new Set(got).size, got.length, 'ids unique');
  return got;
}
const mark = (kind, id) => ({name: 'w:bookmark' + kind,
  attrs: [['w:id', String(id)]].concat(kind === 'Start'
    ? [['w:name', 'b' + id]] : []), children: []});

/** A 3-column table of 3000-twip columns from rows of texts. */
const T = (rows, more = {}) => freeze(modelTable(rows.map((r) =>
  r.map((c) => (typeof c === 'string' ? cw(c, 3000) : c))),
{grid: [3000, 3000, 3000], ...more}));

describe('mergeCells (D25, TB13)', () => {
  it('2x3 with text in 4 cells: one restart cell over 3 columns and ' +
    '2 rows, paragraphs in flow order, empty cells skipped', () => {
    const X = T([['a', '', 'b'], ['', 'c', 'd']]);
    keep(X);
    const t = mergeCells(X, gridOf(X), {r0: 0, r1: 1, c0: 0, c1: 2});
    valid(t);
    covers(t);
    assert.deepEqual(texts(t), [['a|b|c|d'], ['']]);
    assert.deepEqual(spans(t), [[3], [3]]);
    assert.deepEqual(vm(t), [['restart'], ['continue']]);
    assert.deepEqual(tcW(t), [[9000], [9000]], 'tcW summed');
    const g = gridOf(t);
    assert.equal(g.rows[0].cells[0].rowSpan, 2);
    assert.equal(g.rows[1].cells[0].cont, true);
    assert.notEqual(t.grid, X.grid, 'a new grid array');
    assert.deepEqual(t.grid, X.grid);
    // the paragraphs are the very ones moved (their ids kept)
    assert.equal(t.rows[0].cells[0].blocks[0], X.rows[0].cells[0]
      .blocks[0]);
    assert.equal(t.rows[0].cells[0].blocks[3], X.rows[1].cells[2]
      .blocks[0]);
    const ids = uniqueIds(t);
    assert.ok(!ids.includes(X.rows[1].cells[0].blocks[0].id),
      'the empty cells\' lone paragraphs gone');
    assert.ok(t.rows[1].cells[0].blocks[0].id > Math.max(...uniqueIds(X)),
      'the continue cell\'s paragraph is new (a fresh id)');
  });
  it('a rectangle inside a table: rows and cells outside shared; ' +
    'the first cell\'s tcPr kept (vAlign), one row: no vMerge', () => {
    const X = T([[cw('a', 3000, {vAlign: 'center'}), 'b', 'c'],
      ['d', 'e', 'f'], ['g', 'h', 'i']]);
    keep(X);
    const t = mergeCells(X, gridOf(X), {r0: 1, r1: 1, c0: 1, c1: 2});
    valid(t);
    covers(t);
    assert.deepEqual(texts(t), [['a', 'b', 'c'], ['d', 'e|f'],
      ['g', 'h', 'i']]);
    assert.equal(t.rows[0], X.rows[0]);
    assert.equal(t.rows[2], X.rows[2]);
    assert.equal(t.rows[1].cells[0], X.rows[1].cells[0]);
    assert.deepEqual(vm(t)[1], ['-', '-']);
    const u = mergeCells(X, gridOf(X), {r0: 0, r1: 1, c0: 0, c1: 0});
    assert.deepEqual(texts(u)[0][0], 'a|d');
    assert.equal(u.rows[0].cells[0].tcPr.vAlign, 'center');
    assert.equal(u.rows[0].cells[0].tcPr.gridSpan, undefined);
  });
  it('every cell empty: one paragraph (the first cell\'s); a cell ' +
    'with an empty paragraph among others keeps it', () => {
    const X = T([['', ''], ['', '']], {grid: [3000, 3000]});
    keep(X);
    const t = mergeCells(X, gridOf(X), {r0: 0, r1: 1, c0: 0, c1: 1});
    assert.deepEqual(texts(t), [[''], ['']]);
    assert.equal(t.rows[0].cells[0].blocks[0], X.rows[0].cells[0]
      .blocks[0]);
    valid(t);
    const Y = T([[{blocks: [newPara('x'), newPara('')], tcPr: {
      extra: []}}, '', 'y']]);
    keep(Y);
    assert.deepEqual(texts(mergeCells(Y, gridOf(Y), {r0: 0, r1: 0,
      c0: 0, c1: 2})), [['x||y']]);
  });
  it('ragged rows (gridBefore / a short row / a span crossing the ' +
    'edge) and a merge reaching outside: null', () => {
    const before = freeze(modelTable([[cw('a', 3000), cw('b', 3000)],
      [{blocks: [newPara('c')], tcPr: {tcW: dxa(3000), extra: []}}]],
    {grid: [3000, 3000]}));
    const r1 = {...before.rows[1], trPr: {gridBefore: 1, extra: []}};
    const B = freeze({...before, rows: [before.rows[0], r1]});
    assert.equal(mergeCells(B, gridOf(B), {r0: 0, r1: 1, c0: 0, c1: 1}),
      null);
    const short = T([['a', 'b'], ['c']], {grid: [3000, 3000]});
    assert.equal(mergeCells(short, gridOf(short), {r0: 0, r1: 1, c0: 0,
      c1: 1}), null);
    const cross = T([['a', cw('bc', 6000, {gridSpan: 2})],
      ['d', 'e', 'f']]);
    assert.equal(mergeCells(cross, gridOf(cross), {r0: 0, r1: 1, c0: 0,
      c1: 1}), null);
    const down = T([['a', cw('b', 3000, {vMerge: 'restart'}), 'c'],
      ['d', cw('', 3000, {vMerge: 'continue'}), 'f']]);
    assert.equal(mergeCells(down, gridOf(down), {r0: 0, r1: 0, c0: 0,
      c1: 1}), null, 'the merge goes on below the rectangle');
  });
  it('one cell (a plain one, or exactly one merged cell): null', () => {
    const X = T([['a', 'b'], ['c', 'd']], {grid: [3000, 3000]});
    assert.equal(mergeCells(X, gridOf(X), {r0: 0, r1: 0, c0: 1, c1: 1}),
      null);
    const M = T([[cw('ab', 6000, {gridSpan: 2, vMerge: 'restart'})],
      [cw('', 6000, {gridSpan: 2, vMerge: 'continue'})]],
    {grid: [3000, 3000]});
    assert.equal(mergeCells(M, gridOf(M), {r0: 0, r1: 1, c0: 0, c1: 1}),
      null);
  });
  it('a vertical merge inside: its hidden content stays hidden (in ' +
    'its row\'s continue cell), the shown cells\' content merged', () => {
    const X = T([[cw('top', 3000, {vMerge: 'restart'}), 'b', 'x'],
      [cw('hidden', 3000, {vMerge: 'continue'}), 'c', 'y']]);
    keep(X);
    const t = mergeCells(X, gridOf(X), {r0: 0, r1: 1, c0: 0, c1: 1});
    valid(t);
    covers(t);
    assert.deepEqual(texts(t), [['top|b|c', 'x'], ['hidden', 'y']]);
    assert.deepEqual(vm(t), [['restart', '-'], ['continue', '-']]);
    assert.equal(gridOf(t).rows[1].cells[0].cont, true);
  });
  it('marks kept: the leads of the cells joined go to the merged ' +
    'cell\'s lead in order; bookmarks in paragraphs go with them', () => {
    const s = mark('Start', 1), e = mark('End', 1), l = mark('Start', 2);
    const bm = newPara(OBJ + 'b' + OBJ, {inlines: {0: {kind: 'raw',
      level: 'p', node: s}, 2: {kind: 'raw', level: 'p', node: e}}});
    const X0 = modelTable([['a', {blocks: [bm], tcPr: {tcW: dxa(3000),
      extra: []}}, 'c']], {grid: [3000, 3000, 3000]});
    const lead0 = mark('End', 9);
    X0.rows[0].cells[0] = {...X0.rows[0].cells[0], lead: [lead0]};
    X0.rows[0].cells[1] = {...X0.rows[0].cells[1], lead: [l]};
    const X = freeze(X0);
    keep(X);
    const t = mergeCells(X, gridOf(X), {r0: 0, r1: 0, c0: 0, c1: 1});
    valid(t);
    assert.deepEqual(t.rows[0].cells[0].lead, [lead0, l]);
    assert.equal(t.rows[0].cells[0].blocks[1], bm);
  });
  it('tcW: dxa summed; mixed types: dxa of the columns\' widths', () => {
    const X = T([['a', {blocks: [newPara('b')], tcPr: {tcW: {w: 2500,
      type: 'pct'}, extra: []}}, 'c']]);
    keep(X);
    const t = mergeCells(X, gridOf(X), {r0: 0, r1: 0, c0: 0, c1: 1});
    assert.deepEqual(t.rows[0].cells[0].tcPr.tcW, dxa(6000));
  });
  it('bad rectangles: RangeError', () => {
    const X = T([['a', 'b']], {grid: [3000, 3000]});
    for (const bad of [{r0: 0, r1: 1, c0: 0, c1: 1}, {r0: -1, r1: 0,
      c0: 0, c1: 1}, {r0: 0, r1: 0, c0: 1, c1: 0}, {r0: NaN, r1: 0,
      c0: 0, c1: 0}, {}]) {
      assert.throws(() => mergeCells(X, gridOf(X), bad), RangeError);
    }
  });
});

describe('splitCell (D25, TB14)', () => {
  it('a plain cell 2x2: the grid column split, the other rows\' ' +
    'cells across it grow their span, a new row with its neighbour ' +
    'vMerge-extended; the content in the first new cell', () => {
    const X = freeze(modelTable([[cw('a', 3000), cw('b', 3000)],
      [cw('c', 3000), cw('d', 3000)]], {grid: [3000, 3000]}));
    keep(X);
    const t = splitCell(X, gridOf(X), {r: 0, k: 0}, {cols: 2, rows: 2});
    valid(t);
    covers(t);
    assert.deepEqual(t.grid, [1500, 1500, 3000]);
    assert.deepEqual(texts(t), [['a', '', 'b'], ['', '', ''],
      ['c', 'd']]);
    assert.deepEqual(spans(t), [[1, 1, 1], [1, 1, 1], [2, 1]]);
    assert.deepEqual(vm(t), [['-', '-', 'restart'],
      ['-', '-', 'continue'], ['-', '-']]);
    assert.deepEqual(tcW(t), [[1500, 1500, 3000], [1500, 1500, 3000],
      [3000, 3000]]);
    assert.equal(gridOf(t).rows[0].cells[2].rowSpan, 2);
    assert.equal(t.rows[0].cells[0].blocks[0], X.rows[0].cells[0]
      .blocks[0], 'the content stays (the same paragraph)');
    assert.equal(t.rows[2].cells[1], X.rows[1].cells[1]);
    const ids = uniqueIds(t), old = Math.max(...uniqueIds(X));
    assert.equal(ids.filter((id) => id > old).length, 4, 'fresh ids');
    assert.notEqual(t.grid, X.grid);
  });
  it('a merged cell (gridSpan 3) into 3x1: the span divided, no grid ' +
    'change', () => {
    const X = T([[cw('abc', 9000, {gridSpan: 3})], ['d', 'e', 'f']],
      {grid: [1000, 2000, 3000]});
    keep(X);
    const t = splitCell(X, gridOf(X), {r: 0, k: 0}, {cols: 3, rows: 1});
    valid(t);
    covers(t);
    assert.deepEqual(t.grid, [1000, 2000, 3000]);
    assert.notEqual(t.grid, X.grid);
    assert.deepEqual(texts(t)[0], ['abc', '', '']);
    assert.deepEqual(spans(t)[0], [1, 1, 1]);
    assert.deepEqual(tcW(t)[0], [1000, 2000, 3000]);
    assert.equal(t.rows[1], X.rows[1]);
    const u = splitCell(X, gridOf(X), {r: 0, k: 0}, {cols: 2, rows: 1});
    assert.deepEqual(spans(u)[0], [2, 1], 'the remainder first');
    assert.deepEqual(tcW(u)[0], [3000, 3000]);
  });
  it('more columns than a span of 2: lines at equal widths added, ' +
    'the old line kept; every row covers the new grid', () => {
    const X = T([[cw('ab', 4000, {gridSpan: 2}), 'c'], ['d', 'e', 'f']],
      {grid: [1000, 3000, 2000]});
    keep(X);
    const t = splitCell(X, gridOf(X), {r: 0, k: 0}, {cols: 3, rows: 1});
    valid(t);
    covers(t);
    assert.equal(sum(t.grid), 6000);
    assert.deepEqual(t.grid, [1000, 333, 1334, 1333, 2000]);
    assert.deepEqual(spans(t), [[2, 1, 1, 1], [1, 3, 1]]);
    assert.deepEqual(tcW(t)[0], [1333, 1334, 1333, 3000]);
  });
  it('a vertically merged cell: rows divide its merge; columns split ' +
    'every row of it; rows not dividing it: null', () => {
    const X = T([[cw('top', 3000, {vMerge: 'restart'}), 'b'],
      [cw('', 3000, {vMerge: 'continue'}), 'c']], {grid: [3000, 3000]});
    keep(X);
    const t = splitCell(X, gridOf(X), {r: 1, k: 0}, {cols: 1, rows: 2});
    valid(t);
    assert.deepEqual(vm(t), [['-', '-'], ['-', '-']]);
    assert.deepEqual(texts(t), [['top', 'b'], ['', 'c']]);
    const u = splitCell(X, gridOf(X), {r: 0, k: 0}, {cols: 2, rows: 1});
    valid(u);
    covers(u);
    assert.deepEqual(vm(u), [['restart', 'restart', '-'],
      ['continue', 'continue', '-']]);
    assert.deepEqual(spans(u), [[1, 1, 1], [1, 1, 1]]);
    assert.equal(gridOf(u).rows[0].cells[1].rowSpan, 2);
    assert.equal(splitCell(X, gridOf(X), {r: 0, k: 0}, {cols: 1,
      rows: 3}), null);
  });
  it('rows of a plain cell beside a merge: the merge grows over the ' +
    'new rows', () => {
    const X = T([['a', cw('b', 3000, {vMerge: 'restart'})],
      ['c', cw('', 3000, {vMerge: 'continue'})]], {grid: [3000, 3000]});
    keep(X);
    const t = splitCell(X, gridOf(X), {r: 0, k: 0}, {cols: 1, rows: 3});
    valid(t);
    assert.deepEqual(texts(t), [['a', 'b'], ['', ''], ['', ''],
      ['c', '']]);
    assert.equal(gridOf(t).rows[0].cells[1].rowSpan, 4);
  });
  it('1x1: the same table; past 63 columns or MAX_ROWS rows: null; ' +
    'absurd numbers: null', () => {
    const W = freeze(modelTable([Array.from({length: 62}, (_, i) =>
      'w' + i)], {grid: Array(62).fill(100)}));
    keep(W);
    assert.equal(splitCell(W, gridOf(W), {r: 0, k: 0}, {cols: 1,
      rows: 1}), W);
    assert.equal(splitCell(W, gridOf(W), {r: 0, k: 0}, {cols: 3,
      rows: 1}), null);
    const ok = splitCell(W, gridOf(W), {r: 0, k: 0}, {cols: 2, rows: 1});
    valid(ok);
    assert.equal(ok.grid.length, 63);
    for (const bad of [0, -1, 1.5, NaN, 1e9, 64, '2', '__proto__',
      null, undefined, Infinity]) {
      assert.equal(splitCell(W, gridOf(W), {r: 0, k: 1}, {cols: bad,
        rows: 1}), null, String(bad));
      if (bad === 64) continue;            // 64 rows are allowed
      assert.equal(splitCell(W, gridOf(W), {r: 0, k: 1}, {cols: 1,
        rows: bad}), null, String(bad));
    }
    const one = modelTable([['x']]);
    const big = {...one, rows: Array(MAX_ROWS).fill(one.rows[0])};
    assert.equal(splitCell(big, gridOf(big), {r: 0, k: 0}, {cols: 1,
      rows: 2}), null, 'MAX_ROWS');
    assert.throws(() => splitCell(W, gridOf(W), {r: 1, k: 0}, {cols: 2,
      rows: 1}), RangeError);
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
const T3 = () => T([0, 1, 2].map((i) => [0, 1, 2].map((j) =>
  `r${i}c${j}`)));
const doc = (X = T3()) => ({d: mk(['p0', X, 'p2']), X});

describe('merge and split commands', () => {
  it('merge a cells shape: one undo step, the caret at the merged ' +
    'cell\'s start; undo gives the very old table', () => {
    const {d, X} = doc();
    const out = undoable(d, () => mergeCmd(d, sel(d, 'r0c0', 1, 'r1c1',
      2)));
    const t = walkAt(d.doc, [0, 1]);
    assert.deepEqual(texts(t), [['r0c0|r0c1|r1c0|r1c1', 'r0c2'],
      ['', 'r1c2'], ['r2c0', 'r2c1', 'r2c2']]);
    assert.equal(out.head.id, t.rows[0].cells[0].blocks[0].id);
    assert.equal(out.head.off, 0);
    assert.equal(d.undoDepth, 1);
    d.undo();
    assert.equal(walkAt(d.doc, [0, 1]), X);
  });
  it('merge refused (a caret, a mixed range, ragged): null, no step',
    () => {
      const {d} = doc();
      assert.equal(mergeCmd(d, car(d, 'r1c1', 1)), null);
      assert.equal(mergeCmd(d, sel(d, 'p0', 1, 'r1c1', 1)), null);
      assert.equal(mergeCmd(d, null), null);
      const e = doc(T([['a', 'b'], ['c']], {grid: [3000, 3000]})).d;
      assert.equal(mergeCmd(e, sel(e, 'b', 0, 'c', 0)), null);
      assert.equal(d.undoDepth + e.undoDepth, 0);
    });
  it('split the caret\'s cell: one step, the caret in its first new ' +
    'cell; refused past the cap: no step', () => {
    const {d, X} = doc();
    const out = undoable(d, () => splitCellsCmd(d, car(d, 'r1c1', 2),
      {cols: 2, rows: 2}));
    const t = walkAt(d.doc, [0, 1]);
    assert.equal(t.grid.length, 4);
    assert.equal(t.rows.length, 4);
    assert.equal(out.head.id, byText(d.doc, 'r1c1').id);
    assert.equal(d.undoDepth, 1);
    d.undo();
    assert.equal(walkAt(d.doc, [0, 1]), X);
    assert.equal(splitCellsCmd(d, car(d, 'r1c1', 2), {cols: 63,
      rows: 1}), null);
    assert.equal(splitCellsCmd(d, car(d, 'r1c1', 2), {cols: 1,
      rows: 1}), null, 'nothing to change');
    assert.equal(splitCellsCmd(d, car(d, 'r1c1', 2), {}), null);
    assert.equal(splitCellsCmd(d, car(d, 'p0', 0), {cols: 2, rows: 1}),
      null);
    assert.equal(d.undoDepth, 0, 'refused: no step');
  });
  it('split a cells shape: merged first, then split (one step)', () => {
    const {d} = doc();
    undoable(d, () => splitCellsCmd(d, sel(d, 'r0c0', 0, 'r0c1', 1),
      {cols: 1, rows: 2}));
    const t = walkAt(d.doc, [0, 1]);
    assert.deepEqual(texts(t)[0], ['r0c0|r0c1', 'r0c2']);
    assert.deepEqual(spans(t)[1], [2, 1]);
    assert.equal(t.rows.length, 4);
    assert.equal(d.undoDepth, 1);
  });
  it('rectOf still from TblCmdCols; TABLE.mergeCells through ' +
    'EditApply.run: one step', () => {
    const {d} = doc();
    assert.equal(typeof TABLE.mergeCells, 'function');
    assert.ok(rectOf(d.doc, car(d, 'r0c0', 0)).one);
    const ty = new Typing(d);
    const out = run('mergeCells', d, ty, sel(d, 'r0c0', 0, 'r0c2', 1));
    assert.ok(out && out.head);
    assert.equal(d.undoDepth, 1);
    assert.deepEqual(texts(walkAt(d.doc, [0, 1]))[0],
      ['r0c0|r0c1|r0c2']);
    assert.equal(run('mergeCells', d, ty, car(d, 'r2c2', 0)), null);
    assert.equal(d.undoDepth, 1);
  });
  it('a nested table: merge and split act on it', () => {
    const N = T([['n0', 'n1'], ['n2', 'n3']], {grid: [1000, 1000]});
    const {d} = doc(freeze(modelTable([[{blocks: [newPara('a'), N,
      newPara('z')], tcPr: {extra: []}}, 'b']])));
    undoable(d, () => mergeCmd(d, sel(d, 'n0', 0, 'n1', 1)));
    const at = [0, 1, 0, 0, 1];
    assert.deepEqual(texts(walkAt(d.doc, at)), [['n0|n1'],
      ['n2', 'n3']]);
    undoable(d, () => splitCellsCmd(d, car(d, 'n2', 0), {cols: 2,
      rows: 1}));
    assert.deepEqual(walkAt(d.doc, at).grid, [500, 500, 1000]);
  });
  it('60 random merge / split commands: ids unique, every block ' +
    'valid, the grid covered, each at most one step', () => {
    const d = mk(['p0', T3(), 'p1', T([['a', 'b', 'c'], ['d', 'e', 'f'],
      ['g', 'h', 'i'], ['j', 'k', 'l']]), 'p2']);
    const rand = rng(11);
    let done = 0;
    for (let k = 0; k < 60; k++) {
      const paras = [];
      forEachBlock(d.doc, (b, at) => {
        if (b.type === 'p' && at.length > 2) paras.push(b);
      });
      const pick = () => paras[Math.floor(rand() * paras.length)];
      const a = {id: pick().id, off: 0}, b = {id: pick().id, off: 0};
      const n = d.undoDepth;
      const cmd = Math.floor(rand() * 3);
      const out = cmd === 0 ? mergeCmd(d, S.select(a, b))
        : splitCellsCmd(d, cmd === 1 ? S.caret(a) : S.select(a, b),
          {cols: 1 + Math.floor(rand() * 3),
            rows: 1 + Math.floor(rand() * 3)});
      if (out) done++;
      assert.ok(d.undoDepth <= n + 1, 'at most one step');
      const all = allIds(d.doc);
      assert.equal(new Set(all).size, all.length, 'ids unique');
      for (const x of d.doc.sections[0].blocks) {
        checkBlock(x);
        if (x.type === 'tbl') covers(x);
      }
    }
    assert.ok(done > 20, 'commands applied: ' + done);
  });
});
