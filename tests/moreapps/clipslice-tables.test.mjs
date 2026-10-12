// Tables on the clipboard (Batch C, C6.1, D28): a copy of a 'cells'
// shape is a table block of the rectangle (./ClipCut cutRect: spans
// cut at its edges, a continue cell at its top row a restart, the
// grid of its columns); a 'mixed' copy is the paragraphs plus table
// blocks of the covered rows (cutRows); a whole table comes whole;
// `ids` has a source id per walked block (./Walk); styleNames,
// lists and pics are collected inside table blocks; ClipStore counts
// the blocks of a 1000 x 63 table at every depth.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {slice} from '../../tools/moreapps/!Letters/ClipSlice';
import {toHtml} from '../../tools/moreapps/!Letters/ClipHtml';
import {cutRect, cutRows} from '../../tools/moreapps/!Letters/ClipCut';
import {ClipStore, LIMITS} from '../../tools/moreapps/!Letters/ClipStore';
import {walkBlocks, forEachIn} from '../../tools/moreapps/!Letters/Walk';
import {gridOf} from '../../tools/moreapps/!Letters/TblGrid';
import {checkBlock} from '../../tools/moreapps/!Letters/ModelCheck';
import {blockId} from '../../tools/moreapps/!Letters/DocPos';
import {newPara} from '../../tools/moreapps/!Letters/Model';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {p, r} from './build-docx.mjs';
import {tbl, tr, tc, tblDocx, modelTable, freeze, TABLE_NORMAL,
  TABLE_GRID} from './tbl-fixtures.mjs';
import {drawingXml, picDocx} from './pic-fixtures.mjs';
import {item} from './list-fixtures.mjs';
import {sourceDocx} from './clip-lists-docs.mjs';
import {mk} from './edit-docs.mjs';

const tops = (d) => d.doc.sections.flatMap((s) => s.blocks);
const pos = (b, off) => ({id: blockId(b), off});
const sel = (a, o1, b, o2) => S.select(pos(a, o1), pos(b, o2));
const cellP = (t, r0, k, j = 0) => t.rows[r0].cells[k].blocks[j];
const texts = (t) => t.rows.map((row) => row.cells.map((c) =>
  c.blocks.map((b) => (b.type === 'p' ? b.text : '#')).join('|')));
const X = (extra = []) => ({extra});
const span = (n, w) => ({gridSpan: n, tcW: {w, type: 'dxa'},
  extra: []});
const vm = (v) => ({vMerge: v, extra: []});
const noIds = (blocks) => {
  for (const {b} of walkBlocks(blocks)) {
    assert.ok(!('id' in b), 'no id');
    assert.ok(!('extraP' in b), 'no extraP');
  }
};

/** The source ids walkBlocks order gives for table t (null: not p). */
function walkIds(t) {
  const out = [];
  forEachIn([t], [], (b) => out.push(b.type === 'p' ? b.id : null));
  return out;
}

describe('ClipCut: the part of a table a copy takes', () => {
  it('cutRect: a gridSpan crossing the right edge is cut, the grid ' +
    'is the rectangle\'s columns', () => {
    const t = freeze(modelTable([
      ['a', {blocks: ['B'], tcPr: span(2, 4000)}],
      ['c', 'd', 'e'], ['f', 'g', 'h']],
    {grid: [2000, 2500, 3000], tblPr: {tblW: {w: 7500, type: 'dxa'},
      extra: []}}));
    const u = cutRect(t, {r0: 0, r1: 1, c0: 0, c1: 1});
    checkBlock(u);
    assert.deepEqual(u.grid, [2000, 2500]);
    assert.deepEqual(texts(u), [['a', 'B'], ['c', 'd']]);
    assert.equal(u.rows[0].cells[1].tcPr.gridSpan, undefined);
    assert.deepEqual(u.rows[0].cells[1].tcPr.tcW, {w: 1000,
      type: 'dxa'}, 'the width loses the column cut off');
    assert.deepEqual(u.tblPr.tblW, {w: 4500, type: 'dxa'});
    assert.equal(gridOf(u).cols, 2);
    // the paragraphs are the source's own (ids and all)
    assert.equal(cellP(u, 1, 1), cellP(t, 1, 1));
    // the left edge too: columns 1..2 of rows 1..2
    const v = cutRect(t, {r0: 1, r1: 2, c0: 1, c1: 2});
    assert.deepEqual(v.grid, [2500, 3000]);
    assert.deepEqual(texts(v), [['d', 'e'], ['g', 'h']]);
    // the B cell cut on its left: columns 1..1 of row 0
    const w = cutRect(t, {r0: 0, r1: 0, c0: 2, c1: 2});
    assert.deepEqual(texts(w), [['B']]);
    assert.deepEqual(w.grid, [3000]);
  });

  it('cutRect: a vMerge whose restart is above the rectangle starts ' +
    'again at its top row', () => {
    const t = freeze(modelTable([
      ['a', {blocks: ['M'], tcPr: vm('restart')}, 'c'],
      ['d', {blocks: [''], tcPr: vm('continue')}, 'f'],
      ['g', {blocks: [''], tcPr: vm('continue')}, 'i']]));
    const u = cutRect(t, {r0: 1, r1: 2, c0: 0, c1: 1});
    checkBlock(u);
    assert.equal(u.rows[0].cells[1].tcPr.vMerge, 'restart');
    assert.equal(u.rows[1].cells[1].tcPr.vMerge, 'continue');
    assert.equal(gridOf(u).rows[1].cells[1].cont, true,
      'the merge goes on inside the rectangle');
    assert.equal(t.rows[1].cells[1].tcPr.vMerge, 'continue',
      'the source is not changed');
    // whole rows: the same rule
    const v = cutRows(t, 1, 2);
    assert.equal(v.rows[0].cells[1].tcPr.vMerge, 'restart');
    assert.equal(v.rows.length, 2);
    assert.deepEqual(v.grid, t.grid);
    assert.notEqual(v.grid, t.grid, 'a new grid array');
  });

  it('cutRows: every row is the table itself; the tail only with ' +
    'the last row', () => {
    const t = freeze({...modelTable([['a'], ['b'], ['c']]),
      tail: [{name: 'w:proofErr', attrs: [], children: []}]});
    assert.equal(cutRows(t, 0, 2), t);
    assert.deepEqual(cutRows(t, 0, 1).tail, []);
    assert.equal(cutRows(t, 1, 2).tail, t.tail);
    assert.throws(() => cutRows(t, 2, 3), RangeError);
    assert.throws(() => cutRect(t, {r0: 0, r1: 0, c0: 0, c1: 1}),
      RangeError);
    for (const v of [-1, NaN, 1e9, 0.5, '0', undefined, null]) {
      assert.throws(() => cutRows(t, v, 1), RangeError, String(v));
      assert.throws(() => cutRect(t, {r0: 0, r1: 0, c0: v, c1: 0}),
        RangeError, String(v));
    }
    assert.throws(() => cutRect(t), RangeError);
  });
});

/** P, a 3x3 table (cell (0,0): a, a nested table, a2; cell (0,1):
 *  b, b2; column 1 merged in rows 1..2), Q. */
function doc3() {
  const inner = modelTable([['n1', 'n2']]);
  const T = modelTable([
    [['a', inner, 'a2'], ['b', 'b2'], 'c'],
    ['d', {blocks: ['M'], tcPr: vm('restart')}, 'f'],
    ['g', {blocks: ['m'], tcPr: vm('continue')}, 'i']]);
  return mk(['Para', T, 'Queue']);
}

describe('ClipSlice: a cells shape', () => {
  it('a 2 x 2 rectangle: one table block of its cells, a nested ' +
    'table whole, no ids', () => {
    const d = doc3();
    const [, T] = tops(d);
    const s = slice(d.doc, sel(cellP(T, 0, 0), 0, cellP(T, 0, 1), 1));
    assert.deepEqual(s.blocks.map((b) => b.type), ['tbl']);
    const u = s.blocks[0];
    assert.deepEqual(texts(u), [['a|#|a2', 'b|b2']]);
    assert.deepEqual(u.grid, [2000, 2000]);
    const nested = u.rows[0].cells[0].blocks[1];
    assert.equal(nested.type, 'tbl');
    assert.deepEqual(texts(nested), [['n1', 'n2']]);
    noIds(s.blocks);
    assert.deepEqual(s.ids, walkIds(cutRect(T, {r0: 0, r1: 0, c0: 0,
      c1: 1})));
    assert.equal(s.ids.length, 8, 'table, a, nested, n1, n2, a2, b, b2');
    assert.equal(s.ids[1], cellP(T, 0, 0).id);
    assert.equal(s.plain, 'a n1 n2 a2\tb b2', 'C6.3');
  });

  it('the rectangle grows to the whole merge (SelShape), so the ' +
    'merge comes whole', () => {
    const d = doc3();
    const [, T] = tops(d);
    const s = slice(d.doc, sel(cellP(T, 2, 0), 0, cellP(T, 2, 1), 1));
    const u = s.blocks[0];
    assert.deepEqual(texts(u), [['d', 'M'], ['g', 'm']]);
    assert.equal(u.rows[0].cells[1].tcPr.vMerge, 'restart');
    assert.equal(u.rows[1].cells[1].tcPr.vMerge, 'continue');
  });

  it('the whole table (its two edges) comes whole', () => {
    const d = doc3();
    const [, T] = tops(d);
    const s = slice(d.doc, S.select(pos(T, 0), pos(T, 1)));
    const u = s.blocks[0];
    assert.equal(u.grid, T.grid, 'the table itself, without ids');
    assert.equal(u.tblPr, T.tblPr);
    assert.deepEqual(texts(u), texts(T));
    assert.deepEqual(s.ids, walkIds(T));
  });

  it('text in one cell is a text slice', () => {
    const d = doc3();
    const [, T] = tops(d);
    const b = cellP(T, 0, 1), b2 = cellP(T, 0, 1, 1);
    const s = slice(d.doc, sel(b, 0, b2, 1));
    assert.deepEqual(s.blocks.map((x) => x.type), ['p', 'p']);
    assert.deepEqual(s.blocks.map((x) => x.text), ['b', 'b']);
    assert.deepEqual(s.ids, [b.id, b2.id]);
  });
});

describe('ClipSlice: a mixed shape', () => {
  it('from a paragraph into row 1: the paragraph and rows 0..1',
    () => {
      const d = doc3();
      const [P, T] = tops(d);
      const s = slice(d.doc, sel(P, 1, cellP(T, 1, 0), 1));
      assert.deepEqual(s.blocks.map((b) => b.type), ['p', 'tbl']);
      assert.equal(s.blocks[0].text, 'ara');
      const u = s.blocks[1];
      assert.deepEqual(texts(u), [['a|#|a2', 'b|b2', 'c'], ['d', 'M',
        'f']]);
      assert.deepEqual(u.grid, T.grid);
      assert.deepEqual(s.ids, [P.id, ...walkIds(cutRows(T, 0, 1))]);
      noIds(s.blocks);
      // backwards: the same
      const b = slice(d.doc, sel(cellP(T, 1, 0), 1, P, 1));
      assert.deepEqual(b.blocks, s.blocks);
    });

  it('from row 2 out to the paragraph after: rows 2.., a continue ' +
    'at the top a restart', () => {
    const d = doc3();
    const [, T, Q] = tops(d);
    const s = slice(d.doc, sel(cellP(T, 2, 0), 0, Q, 2));
    assert.deepEqual(s.blocks.map((b) => b.type), ['tbl', 'p']);
    const u = s.blocks[0];
    assert.deepEqual(texts(u), [['g', 'm', 'i']]);
    assert.equal(u.rows[0].cells[1].tcPr.vMerge, 'restart');
    assert.equal(T.rows[2].cells[1].tcPr.vMerge, 'continue');
    assert.equal(s.blocks[1].text, 'Qu');
    checkBlock({...cutRows(T, 2, 2)});
  });

  it('a table spanned comes whole; one at its far edge does not ' +
    'come', () => {
    const d = doc3();
    const [P, T, Q] = tops(d);
    const s = slice(d.doc, sel(P, 0, Q, 5));
    assert.deepEqual(s.blocks.map((b) => b.type), ['p', 'tbl', 'p']);
    assert.equal(s.blocks[1].grid, T.grid);
    const e = slice(d.doc, S.select(pos(T, 1), pos(Q, 2)));
    assert.deepEqual(e.blocks.map((b) => b.type), ['p']);
  });

  it('inside a cell: a paragraph and rows of a nested table', () => {
    const d = doc3();
    const [, T] = tops(d);
    const a = cellP(T, 0, 0), inner = T.rows[0].cells[0].blocks[1];
    const s = slice(d.doc, sel(a, 0, cellP(inner, 0, 1), 1));
    assert.deepEqual(s.blocks.map((b) => b.type), ['p', 'tbl']);
    assert.deepEqual(texts(s.blocks[1]), [['n1', 'n2']]);
    assert.equal(s.blocks[1].grid, inner.grid, 'its every row: whole');
  });
});

describe('ClipSlice: what travels with table blocks', () => {
  it('lists in cells are collected (ClipNums through Walk)',
    async () => {
      const bytes = await sourceDocx({paras: [p(r('x')),
        tbl([tr([tc(item('one', 2)), tc(item('two', 1))])]),
        p(r('y'))]});
      const d = new Document(await readDocx(bytes));
      const [x, T, y] = tops(d);
      assert.equal(T.type, 'tbl');
      const s = slice(d.doc, sel(x, 0, y, 1));
      assert.deepEqual([...s.lists.keys()].sort(), [1, 2]);
      const c = slice(d.doc, sel(cellP(T, 0, 0), 0, cellP(T, 0, 1),
        1));
      assert.deepEqual([...c.lists.keys()].sort(), [1, 2]);
    });

  it('ClipHtml finds a list item\'s label after a table (ids in ' +
    'walk order)', async () => {
    const bytes = await sourceDocx({paras: [item('first', 2),
      tbl([tr([tc(p(r('x'))), tc(p(r('y')))])]), item('second', 2)]});
    const d = new Document(await readDocx(bytes));
    const [a, , b] = tops(d);
    const s = slice(d.doc, sel(a, 0, b, 6));
    assert.equal(s.ids.length, 5, 'first, table, x, y, second');
    assert.equal(s.ids[4], b.id);
    const html = toHtml(d.doc, s);
    assert.equal((html.match(/<li /g) || []).length, 2, html);
  });

  it('a picture in a cell is in pics (cells shape)', async () => {
    const pic = p('<w:r>' + drawingXml({id: 40, embed: 'rId11',
      decl: false}) + '</w:r>');
    const d = new Document(await readDocx(await picDocx({body:
      p(r('before')) + tbl([tr([tc(p(r('a'))), tc(pic)])]) +
      p(r('after'))})));
    const T = tops(d).find((b) => b.type === 'tbl');
    const s = slice(d.doc, sel(cellP(T, 0, 0), 0, cellP(T, 0, 1), 1));
    assert.equal(s.blocks[0].type, 'tbl');
    assert.equal(s.pics.size, 1);
    assert.ok(s.picScope instanceof Map);
  });

  it('styleNames hold the table styles used (tblStyle)', async () => {
    const d = new Document(await readDocx(await tblDocx(p(r('a')) +
      tbl([tr([tc(p(r('x'))), tc(p(r('y')))])], {tblPr:
        '<w:tblStyle w:val="TableGrid"/>'}) + p(r('b')),
    {styles: TABLE_NORMAL + TABLE_GRID})));
    const [a, T] = tops(d);
    assert.equal(T.tblPr.tblStyle, 'TableGrid');
    const s = slice(d.doc, sel(a, 0, cellP(T, 0, 0), 1));
    assert.deepEqual(s.styleNames.get('TableGrid'), {name: 'Table Grid',
      type: 'table'});
  });
});

describe('ClipStore: a 1000 x 63 table copied whole', () => {
  it('fits LIMITS (blocks counted at every depth); past 100,000 ' +
    'refused', () => {
    const rows = Array.from({length: 1000}, () => Array(63).fill('x'));
    const T = modelTable(rows);
    const d = mk(['P', T, 'Q']);
    const t0 = performance.now();
    const s = slice(d.doc, S.select(pos(T, 0), pos(T, 1)));
    const ms = performance.now() - t0;
    assert.ok(ms < 5000, `slice took ${ms} ms`);
    let n = 0;
    for (const e of walkBlocks(s.blocks)) n += e ? 1 : 0;
    assert.equal(n, 63001);
    assert.equal(s.ids.length, 63001);
    const store = new ClipStore();
    assert.equal(typeof store.put(s, 1), 'string');
    const q = newPara('');
    const {id, extraP, ...para} = q;
    const fill = (k) => [s.blocks[0], ...Array(k).fill(para)];
    assert.equal(typeof store.put(fill(LIMITS.blocks - 63001), 1),
      'string');
    assert.equal(store.put(fill(LIMITS.blocks - 63000), 1), null);
    assert.equal(store.put([s.blocks[0], s.blocks[0]], 1), null);
  });
});
