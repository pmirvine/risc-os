// Selection shapes (Batch C3.2, D10): SelShape derives the shape of a
// selection from the Doc. 'text' (both ends in one cell, or in one
// container with no typed table between), 'cells' (the ends in
// different cells of one table: the innermost such table; a nested
// table's paragraph counts as its outer cell; the rectangle of grid
// rows r0..r1 and columns c0..c1, inclusive, grown to a fixpoint
// until no merged cell crosses its edge; whole when every cell is in
// it or the selection is {t,0}..{t,1}), 'mixed' (an end outside the
// table or in another one: every table touched taken as whole rows,
// from the touched row to its edge in the range's direction; a table
// spanned whole). paraRanges lists every paragraph touched in flow
// order; cellRect the shape of one cell. And their painting
// (DocRects): a 'cells' shape lights its cells' boxes, a whole table
// and a 'mixed' range's tables whole-row boxes.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {shapeOf, paraRanges, cellRect}
  from '../../tools/moreapps/!Letters/SelShape';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {loadStyles, tm} from './word-docs.mjs';
import {mk, S} from './edit-docs.mjs';
import {modelTable, freeze} from './tbl-fixtures.mjs';

before(loadStyles);

const lay = (doc, w = 800) => {
  const L = new DocLayout(doc, tm());
  L.layout(w);
  return L;
};

/** The paragraph whose text is t (any depth). */
function byText(doc, t) {
  let out = null;
  const look = (list) => list.forEach((b) => {
    if (b.type === 'p' && b.text === t && !out) out = b;
    if (b.type === 'tbl') {
      b.rows.forEach((r) => r.cells.forEach((c) => look(c.blocks)));
    }
  });
  doc.sections.forEach((s) => look(s.blocks));
  return out;
}
const at = (doc, t, off = 0) => ({id: byText(doc, t).id, off});
const sel = (doc, a, ao, h, ho) => S.select(at(doc, a, ao),
  at(doc, h, ho));
const cellsOf = (sh) => sh.cells.map((c) => [c.r, c.k]);

/** p0, a rows x cols table (cell text 'r<i>c<j>'), p2. */
function grid(rows, cols, cell = () => null, grid2) {
  const spec = Array.from({length: rows}, (_, i) =>
    Array.from({length: cols}, (_, j) => cell(i, j) || `r${i}c${j}`)
      .filter((x) => x !== 'none'));
  const T = modelTable(spec, grid2 ? {grid: grid2} : {});
  return {d: mk(['p0', freeze(T), 'p2']), T};
}

describe('shapeOf: cells (D10)', () => {
  it('anchor in (0,0), head in (1,1) of a 3x3: r0..r1, c0..c1, ' +
    '4 cells', () => {
    const {d} = grid(3, 3);
    for (const s of [sel(d.doc, 'r0c0', 1, 'r1c1', 2),
      sel(d.doc, 'r1c1', 2, 'r0c0', 1)]) {
      const sh = shapeOf(d.doc, s);
      assert.equal(sh.kind, 'cells');
      assert.deepEqual(sh.table, [0, 1]);
      assert.deepEqual([sh.r0, sh.r1, sh.c0, sh.c1], [0, 1, 0, 1]);
      assert.deepEqual(cellsOf(sh), [[0, 0], [0, 1], [1, 0], [1, 1]]);
      assert.deepEqual(sh.cells[3].at, [0, 1, 1, 1]);
      assert.equal(sh.whole, false);
    }
  });

  it('a gridSpan 2 crossing the rectangle\'s edge grows it ' +
    '(c1 = 3)', () => {
    // 3 rows x 4 grid columns; row 1: r1c0, r1c1, r1c2 spanning 2-3
    const {d} = grid(3, 4, (i, j) => {
      if (i !== 1 || j < 2) return null;
      return j === 2 ? {blocks: ['r1c2'], tcPr: {gridSpan: 2,
        extra: []}} : 'none';
    }, [1000, 1000, 1000, 1000]);
    const sh = shapeOf(d.doc, sel(d.doc, 'r0c0', 0, 'r2c2', 0));
    assert.equal(sh.kind, 'cells');
    assert.deepEqual([sh.r0, sh.r1, sh.c0, sh.c1], [0, 2, 0, 3]);
    assert.deepEqual(cellsOf(sh), [[0, 0], [0, 1], [0, 2], [0, 3],
      [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2], [2, 3]]);
    assert.equal(sh.whole, true, 'every cell covered');
  });

  it('a vMerge restart at (0,2) over 3 rows grows the rectangle to ' +
    'r1 = 2; then a span in row 2 grows it left (fixpoint)', () => {
    const vm = (i, j) => {
      if (j !== 2) return null;
      return {blocks: [`r${i}c2`], tcPr: {vMerge: i ? 'continue'
        : 'restart', extra: []}};
    };
    const {d} = grid(3, 3, vm);
    const sh = shapeOf(d.doc, sel(d.doc, 'r1c1', 0, 'r1c2', 0));
    assert.deepEqual([sh.r0, sh.r1, sh.c0, sh.c1], [0, 2, 1, 2]);
    assert.deepEqual(cellsOf(sh), [[0, 1], [0, 2], [1, 1], [1, 2],
      [2, 1], [2, 2]]);
    // row 2: r2c0 spans columns 0-1, then the merge's last cell
    const {d: d2} = grid(3, 3, (i, j) => {
      if (i === 2 && j === 0) return {blocks: ['r2c0'],
        tcPr: {gridSpan: 2, extra: []}};
      if (i === 2 && j === 1) return 'none';
      return vm(i, j);
    }, [1000, 1000, 1000]);
    const s2 = shapeOf(d2.doc, sel(d2.doc, 'r0c1', 0, 'r1c2', 0));
    assert.deepEqual([s2.r0, s2.r1, s2.c0, s2.c1], [0, 2, 0, 2]);
    assert.equal(s2.whole, true);
    assert.equal(s2.cells.length, 8);
  });

  it('a nested table\'s paragraph counts as its outer cell; in two ' +
    'cells of the nested table: its own rectangle', () => {
    const N = modelTable([['n1', 'n2']]);
    const T = modelTable([['a', ['b1', N, 'b2']], ['c', 'd']]);
    const d = mk(['p0', freeze(T), 'p2']);
    const sh = shapeOf(d.doc, sel(d.doc, 'a', 0, 'n2', 1));
    assert.equal(sh.kind, 'cells');
    assert.deepEqual(sh.table, [0, 1]);
    assert.deepEqual(cellsOf(sh), [[0, 0], [0, 1]]);
    const sn = shapeOf(d.doc, sel(d.doc, 'n1', 0, 'n2', 1));
    assert.equal(sn.kind, 'cells');
    assert.deepEqual(sn.table, [0, 1, 0, 1, 1]);
    assert.deepEqual(sn.cells.map((c) => c.at), [[0, 1, 0, 1, 1, 0, 0],
      [0, 1, 0, 1, 1, 0, 1]]);
    // b1 to n1: in one cell of T, into N: mixed inside that cell
    const sm = shapeOf(d.doc, sel(d.doc, 'b1', 1, 'n1', 1));
    assert.equal(sm.kind, 'mixed');
    assert.deepEqual(sm.tables, [{table: [0, 1, 0, 1, 1], r0: 0,
      r1: 0}]);
  });

  it('{t,0}..{t,1} (either way) is the whole table', () => {
    const {d, T} = grid(3, 3);
    for (const [a, h] of [[0, 1], [1, 0]]) {
      const sh = shapeOf(d.doc, S.select({id: T.id, off: a},
        {id: T.id, off: h}));
      assert.equal(sh.kind, 'cells');
      assert.deepEqual([sh.r0, sh.r1, sh.c0, sh.c1], [0, 2, 0, 2]);
      assert.equal(sh.cells.length, 9);
      assert.equal(sh.whole, true);
    }
  });

  it('every cell covered is whole; cellRect gives one (merged) cell',
    () => {
      const {d} = grid(2, 2);
      assert.equal(shapeOf(d.doc, sel(d.doc, 'r0c0', 0, 'r1c1', 0))
        .whole, true);
      const one = cellRect(d.doc, [0, 1, 1, 0]);
      assert.equal(one.kind, 'cells');
      assert.deepEqual(cellsOf(one), [[1, 0]]);
      assert.deepEqual(cellRect(d.doc, [0, 1, 1, 0, 0]), one,
        'a block path in the cell: the same');
      const {d: d2} = grid(3, 3, (i, j) => (j === 2
        ? {blocks: [`r${i}c2`], tcPr: {vMerge: i ? 'continue'
          : 'restart', extra: []}} : null));
      const m = cellRect(d2.doc, [0, 1, 1, 2]);
      assert.deepEqual([m.r0, m.r1, m.c0, m.c1], [0, 2, 2, 2]);
      assert.equal(cellRect(d.doc, [0, 0, 0, 0]), null, 'not a table');
      assert.equal(cellRect(d.doc, [0, 1, 5, 0]), null, 'no row 5');
      assert.equal(cellRect(d.doc, 'x'), null);
    });
});

describe('shapeOf: text and mixed (D10)', () => {
  it('both ends in one cell, a caret, no table between: text', () => {
    const {d} = grid(3, 3);
    assert.equal(shapeOf(d.doc, sel(d.doc, 'r1c1', 0, 'r1c1', 3))
      .kind, 'text');
    assert.equal(shapeOf(d.doc, S.caret(at(d.doc, 'r1c1', 1))).kind,
      'text');
    const d2 = mk(['a', 'b', 'c']);
    assert.equal(shapeOf(d2.doc, sel(d2.doc, 'a', 0, 'c', 1)).kind,
      'text');
  });

  it('anchor before the table, head in row 1: mixed, rows 0..1 ' +
    '(forward)', () => {
    const {d} = grid(3, 3);
    const s = sel(d.doc, 'p0', 1, 'r1c0', 1);
    const sh = shapeOf(d.doc, s);
    assert.equal(sh.kind, 'mixed');
    assert.deepEqual(sh.tables, [{table: [0, 1], r0: 0, r1: 1}]);
    assert.deepEqual([sh.from, sh.to], [s.anchor, s.head]);
  });

  it('backward from after the table into row 1: rows 1..2', () => {
    const {d} = grid(3, 3);
    const s = sel(d.doc, 'p2', 1, 'r1c2', 0);
    const sh = shapeOf(d.doc, s);
    assert.equal(sh.kind, 'mixed');
    assert.deepEqual(sh.tables, [{table: [0, 1], r0: 1, r1: 2}]);
    assert.deepEqual([sh.from, sh.to], [s.head, s.anchor]);
  });

  it('a range spanning a whole table and beyond: the table whole; ' +
    'an end at a table\'s far edge does not touch it', () => {
    const {d, T} = grid(3, 3);
    const sh = shapeOf(d.doc, sel(d.doc, 'p0', 0, 'p2', 1));
    assert.equal(sh.kind, 'mixed');
    assert.deepEqual(sh.tables, [{table: [0, 1], r0: 0, r1: 2}]);
    const e0 = shapeOf(d.doc, S.select({id: T.id, off: 0},
      at(d.doc, 'p2', 1)));
    assert.deepEqual(e0.tables, [{table: [0, 1], r0: 0, r1: 2}]);
    assert.equal(shapeOf(d.doc, S.select({id: T.id, off: 1},
      at(d.doc, 'p2', 1))).kind, 'text');
    assert.equal(shapeOf(d.doc, S.select(at(d.doc, 'p0', 0),
      {id: T.id, off: 0})).kind, 'text');
    const e1 = shapeOf(d.doc, S.select({id: T.id, off: 0},
      at(d.doc, 'r1c1', 0)));
    assert.deepEqual(e1.tables, [{table: [0, 1], r0: 0, r1: 1}]);
  });

  it('an end in each of two tables: both touched toward each other; ' +
    'a table between whole', () => {
    const A = modelTable([['a0'], ['a1'], ['a2']]);
    const B = modelTable([['m0']]);
    const C = modelTable([['c0'], ['c1'], ['c2']]);
    const d = mk([freeze(A), 'x', freeze(B), 'y', freeze(C)]);
    const sh = shapeOf(d.doc, sel(d.doc, 'c1', 0, 'a1', 1));
    assert.equal(sh.kind, 'mixed');
    assert.deepEqual(sh.tables, [{table: [0, 0], r0: 1, r1: 2},
      {table: [0, 2], r0: 0, r1: 0}, {table: [0, 4], r0: 0, r1: 1}]);
  });

  it('an invalid or stale selection is text', () => {
    const {d} = grid(2, 2);
    assert.equal(shapeOf(d.doc, S.select({id: 9e9, off: 0},
      at(d.doc, 'p0', 0))).kind, 'text');
    assert.equal(shapeOf(d.doc, null).kind, 'text');
    assert.deepEqual(paraRanges(d.doc, S.select({id: -5, off: 0},
      {id: 9e9, off: 0})), []);
  });
});

describe('paraRanges (D10)', () => {
  it('a 2x2 cells shape: every paragraph of the four cells (flow ' +
    'order, whole) and nothing else', () => {
    const {d} = grid(3, 3, (i, j) => (i === 0 && j === 1
      ? ['r0c1', 'r0c1b'] : null));
    const s = sel(d.doc, 'r0c0', 2, 'r1c1', 1);
    const got = paraRanges(d.doc, s);
    assert.deepEqual(got.map((x) => [x.at, x.from, x.to]), [
      [[0, 1, 0, 0, 0], 0, 4], [[0, 1, 0, 1, 0], 0, 4],
      [[0, 1, 0, 1, 1], 0, 5], [[0, 1, 1, 0, 0], 0, 4],
      [[0, 1, 1, 1, 0], 0, 4]]);
  });

  it('text: the ends\' offsets; a caret: its paragraph', () => {
    const d = mk(['abc', 'de', 'fgh']);
    assert.deepEqual(paraRanges(d.doc, sel(d.doc, 'fgh', 1, 'abc', 2))
      .map((x) => [x.at, x.from, x.to]),
    [[[0, 0], 2, 3], [[0, 1], 0, 2], [[0, 2], 0, 1]]);
    assert.deepEqual(paraRanges(d.doc, S.caret(at(d.doc, 'de', 1)))
      .map((x) => [x.at, x.from, x.to]), [[[0, 1], 1, 1]]);
  });

  it('mixed: the text around, the covered rows\' paragraphs whole ' +
    '(nested too), not the other rows', () => {
    const N = modelTable([['n1']]);
    const {d} = grid(3, 2, (i, j) => (i === 0 && j === 1
      ? ['r0c1', N, 'r0c1z'] : null));
    const got = paraRanges(d.doc, sel(d.doc, 'p0', 1, 'r1c0', 2));
    assert.deepEqual(got.map((x) => [x.at, x.from, x.to]), [
      [[0, 0], 1, 2],
      [[0, 1, 0, 0, 0], 0, 4], [[0, 1, 0, 1, 0], 0, 4],
      [[0, 1, 0, 1, 1, 0, 0, 0], 0, 2], [[0, 1, 0, 1, 2], 0, 5],
      [[0, 1, 1, 0, 0], 0, 4], [[0, 1, 1, 1, 0], 0, 4]]);
  });
});

describe('memo and cost', () => {
  it('memoised per owner (a layout): equal selections hit; a new ' +
    'owner computes again', () => {
    const {d} = grid(3, 3);
    const L = lay(d.doc);
    const a = shapeOf(d.doc, sel(d.doc, 'r0c0', 0, 'r1c1', 0), L);
    const b = shapeOf(d.doc, sel(d.doc, 'r0c0', 0, 'r1c1', 0), L);
    assert.equal(a, b, 'the same object');
    assert.ok(Object.isFrozen(a) && Object.isFrozen(a.cells));
    const c = shapeOf(d.doc, sel(d.doc, 'r0c0', 0, 'r1c1', 0));
    assert.notEqual(c, a, 'no owner: no memo');
    assert.deepEqual(c, a);
    assert.equal(shapeOf(d.doc, sel(d.doc, 'r0c0', 0, 'r1c1', 0),
      lay(d.doc)) === a, false);
    assert.equal(paraRanges(d.doc, sel(d.doc, 'r0c0', 0, 'r1c1', 0),
      L), paraRanges(d.doc, sel(d.doc, 'r0c0', 0, 'r1c1', 0), L));
  });

  it('a 1000-row whole-table selection\'s shape in < 20 ms (median ' +
    'of 20 after 3 warm-ups, no memo)', () => {
    const {d} = grid(1000, 5);
    const ts = [];
    for (let n = 0; n < 23; n++) {
      const s = sel(d.doc, `r0c${n % 5}`, n % 3, `r999c${(n + 2) % 5}`,
        n % 4);
      const t0 = performance.now();
      const sh = shapeOf(d.doc, s);
      ts.push(performance.now() - t0);
      assert.equal(sh.whole, sh.c0 === 0 && sh.c1 === 4);
      assert.deepEqual([sh.r0, sh.r1], [0, 999]);
    }
    const tail = ts.slice(3).sort((x, y) => x - y);
    const med = tail[10];
    assert.ok(med < 20, `median ${med.toFixed(2)} ms`);
  });
});

describe('painting (DocRects)', () => {
  /** A cell's box on whole pixels (as DocRects gives it). */
  const box = (row, c) => {
    const x = Math.round(c.x), y = Math.round(row.y);
    return {x, y, w: Math.round(c.x + c.w) - x,
      h: Math.round(row.y + row.h) - y};
  };

  it('cells (0,0)..(1,1) of a 3x3: the four cell boxes, nothing else',
    () => {
      const {d, T} = grid(3, 3);
      const L = lay(d.doc);
      const it = L.byId.get(T.id);
      const rs = L.selectionRects(sel(d.doc, 'r0c0', 1, 'r1c1', 2));
      const want = [];
      for (const r of [0, 1]) {
        for (const k of [0, 1]) want.push(box(it.rows[r], it.rows[r]
          .cells[k]));
      }
      assert.deepEqual(rs, want);
      // a band: row 1 only
      const row = it.rows[1];
      assert.deepEqual(L.selectionRects(sel(d.doc, 'r0c0', 1, 'r1c1',
        2), row.y + 1, row.y + row.h - 1), want.slice(2));
    });

  it('a merged cell is lit over every row it spans', () => {
    const {d, T} = grid(3, 3, (i, j) => (j === 2
      ? {blocks: [`r${i}c2`], tcPr: {vMerge: i ? 'continue'
        : 'restart', extra: []}} : null));
    const L = lay(d.doc);
    const it = L.byId.get(T.id);
    const rs = L.selectionRects(sel(d.doc, 'r1c1', 0, 'r1c2', 0));
    const top = it.rows[0].cells[2], last = it.rows[2];
    const y0 = Math.round(it.rows[0].y);
    assert.ok(rs.some((q) => q.x === Math.round(top.x) && q.y === y0 &&
      q.h === Math.round(last.y + last.h) - y0), JSON.stringify(rs));
    assert.equal(rs.length, 4, 'cells (0,1) (1,1) (2,1) and the merge');
    // a band below the merge's first row: it is still lit
    const r2 = L.selectionRects(sel(d.doc, 'r1c1', 0, 'r1c2', 0),
      last.y + 1, last.y + 2);
    assert.equal(r2.length, 2);
  });

  it('mixed: the text before and whole-row boxes for rows 0..1', () => {
    const {d, T} = grid(3, 3);
    const L = lay(d.doc);
    const it = L.byId.get(T.id);
    const rs = L.selectionRects(sel(d.doc, 'p0', 1, 'r1c0', 1));
    const rows = rs.filter((q) => q.x === it.x + it.left &&
      q.w === it.width);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].y, it.y);
    assert.equal(rows[0].h, it.rows[1].y + it.rows[1].h - it.y);
    assert.ok(rs.some((q) => q.y < it.y), 'p0 lit');
    assert.ok(rs.every((q) => q.y + q.h <= it.rows[2].y + 1e-9),
      'row 2 not lit');
  });

  it('a whole table: once, as its box (cells shape or spanned)', () => {
    const {d, T} = grid(3, 3);
    const L = lay(d.doc);
    const b = L.boxRect(L.byId.get(T.id));
    const same = (q) => q.x === b.x && q.y === b.y && q.w === b.w &&
      q.h === b.h;
    assert.equal(L.selectionRects(sel(d.doc, 'r0c0', 0, 'r2c2', 1))
      .filter(same).length, 1);
    const all = L.selectionRects(sel(d.doc, 'p0', 0, 'p2', 1));
    assert.equal(all.filter(same).length, 1);
    assert.equal(all.length, 2 + 1 + 1, 'p0 and its mark, T, p2');
  });

  it('text in one cell: as before (line rects in the cell)', () => {
    const {d, T} = grid(3, 3);
    const L = lay(d.doc);
    const c = L.byId.get(T.id).rows[1].cells[1];
    const rs = L.selectionRects(sel(d.doc, 'r1c1', 1, 'r1c1', 3));
    assert.equal(rs.length, 1);
    assert.ok(rs[0].x >= c.x && rs[0].x + rs[0].w <= c.x + c.w);
  });
});
