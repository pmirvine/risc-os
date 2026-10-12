// Table properties (Batch C5.1, D26): ./TblPatch fill / patchOf (the
// box's values from a table and the shape; the patch they make, only
// what changed, never clamped), ./TblEditProps setProps (a NEW table
// and grid array; fields set with prWith, a raw twin dropped; hostile
// patches refused) and the commands propsCmd / alignCmd of ./TblCmd
// (one undo step, the selection kept; Cell alignment > Centre on a
// 2 x 2 touches those four cells only).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {fill, patchOf, fieldOf} from '../../tools/moreapps/!Letters/TblPatch';
import {setProps, cellsOf} from '../../tools/moreapps/!Letters/TblEdit';
import {propsCmd, alignCmd, rectOf} from '../../tools/moreapps/!Letters/TblCmd';
import {TABLE} from '../../tools/moreapps/!Letters/TblCmdCols';
import {gridOf} from '../../tools/moreapps/!Letters/TblGrid';
import {at as walkAt, forEachBlock} from '../../tools/moreapps/!Letters/Walk';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {assertSameDoc, expectedBack} from './docx-compare.mjs';
import {mk, undoable} from './edit-docs.mjs';
import {modelTable, freeze} from './tbl-fixtures.mjs';

const raw = (name, attrs = []) => ({name, attrs, children: []});
const dxa = (w) => ({w, type: 'dxa'});

/** An r x c model table of 'r<i>c<j>' cells, with trPr / tcPr / tblPr
 *  given per row / cell / table. */
function table(r, c, {tblPr, trPr = () => ({}), tcPr = () => ({}),
  grid} = {}) {
  const spec = [];
  for (let i = 0; i < r; i++) {
    spec.push([...Array(c).keys()].map((j) => ({blocks: [`r${i}c${j}`],
      tcPr: {extra: [], ...tcPr(i, j)}})));
  }
  const t = modelTable(spec, {grid, tblPr: tblPr && {extra: [],
    ...tblPr}});
  return {...t, rows: t.rows.map((row, i) => ({...row,
    trPr: {extra: [], ...trPr(i)}}))};
}
const rect = (r0, r1, c0, c1) => ({r0, r1, c0, c1});
const whole = (t) => rect(0, t.rows.length - 1, 0, gridOf(t).cols - 1);

describe('fill', () => {
  it('a uniform 2 x 2: every group', () => {
    const t = table(2, 2, {tblPr: {tblW: dxa(4000), jc: 'center',
      tblInd: dxa(100)}, trPr: () => ({trHeight: {val: 720,
      hRule: 'atLeast'}}), tcPr: () => ({tcW: dxa(2000),
      vAlign: 'center'}), grid: [2000, 2000]});
    assert.deepEqual(fill(whole(t), t), {widthMode: 'length',
      width: 4000, align: 'center', indent: 100, rowMode: 'atLeast',
      rowHeight: 720, colWidth: 2000, cellWidth: 2000,
      vAlign: 'center'});
  });
  it('nothing written: Auto, left, 0, Auto rows, the grid width, top',
    () => {
      const t = table(2, 2, {grid: [1500, 2500]});
      const f = fill(rect(0, 0, 0, 0), t);
      assert.equal(f.widthMode, 'auto');
      assert.equal(f.align, 'left');
      assert.equal(f.indent, 0);
      assert.equal(f.rowMode, 'auto');
      assert.equal(f.rowHeight, undefined);
      assert.equal(f.colWidth, 1500);
      assert.equal(f.cellWidth, 1500, 'no tcW: the columns\' sum');
      assert.equal(f.vAlign, 'top');
    });
  it('mixed rows, columns, cells: undefined', () => {
    const t = table(2, 2, {grid: [1500, 2500], trPr: (i) => (i ? {
      trHeight: {val: 300, hRule: 'exact'}} : {trHeight: {val: 720,
      hRule: 'atLeast'}}), tcPr: (i, j) => ({vAlign: j ? 'bottom'
      : 'top', tcW: dxa(1000 + j)})});
    const f = fill(whole(t), t);
    assert.equal(f.rowMode, undefined);
    assert.equal(f.rowHeight, undefined);
    assert.equal(f.colWidth, undefined);
    assert.equal(f.cellWidth, undefined);
    assert.equal(f.vAlign, undefined);
    assert.equal(fill(rect(0, 0, 0, 0), t).rowHeight, 720);
  });
  it('same rule, different heights: the mode, no height', () => {
    const t = table(2, 1, {trPr: (i) => ({trHeight: {val: 100 + i,
      hRule: 'exact'}})});
    const f = fill(whole(t), t);
    assert.equal(f.rowMode, 'exact');
    assert.equal(f.rowHeight, undefined);
  });
  it('a percentage, a raw tblW / jc / tcW, a "both" vAlign: undefined',
    () => {
      const t = table(1, 1, {tblPr: {tblW: {w: '50%', type: 'pct'},
        jc: 'both', extra: [raw('w:tblInd', [['w:w', '1.5pt'],
          ['w:type', 'dxa']])]},
      tcPr: () => ({tcW: {w: '50%', type: 'pct'}, vAlign: 'both'})});
      const f = fill(whole(t), t);
      assert.equal(f.widthMode, undefined);
      assert.equal(f.width, undefined);
      assert.equal(f.align, undefined);
      assert.equal(f.indent, undefined);
      assert.equal(f.cellWidth, undefined);
      assert.equal(f.vAlign, undefined);
      const s = table(1, 1, {tblPr: {extra: [raw('w:tblW')]}});
      assert.equal(fill(whole(s), s).widthMode, undefined);
    });
  it('Strict start / end read as left / right', () => {
    for (const [jc, want] of [['start', 'left'], ['end', 'right']]) {
      const t = table(1, 1, {tblPr: {jc}});
      assert.equal(fill(whole(t), t).align, want);
    }
  });
  it('a merged cell counts once, by its top cell', () => {
    const t = table(2, 2, {tcPr: (i, j) => (j === 0 ? {vMerge: i ?
      'continue' : 'restart', vAlign: i ? undefined : 'center'} : {})});
    assert.equal(cellsOf(gridOf(t), whole(t)).length, 3);
    assert.equal(fill(rect(0, 1, 0, 0), t).vAlign, 'center');
  });
});

describe('patchOf', () => {
  const t = table(2, 2, {grid: [2000, 2000], trPr: () => ({trHeight: {
    val: 720, hRule: 'atLeast'}}), tcPr: () => ({tcW: dxa(2000)})});
  const q = fill(whole(t), t);
  it('nothing changed: {}; as shown (a hundredth of an inch)', () => {
    assert.deepEqual(patchOf({...q}, q), {});
    assert.deepEqual(patchOf({rowHeight: 721, cellWidth: 2001}, q), {});
    assert.deepEqual(patchOf({}, q), {});
  });
  it('only Row height changed: only trHeight', () => {
    assert.deepEqual(patchOf({...q, rowMode: 'exact', rowHeight: 432},
      q), {rows: {trHeight: {val: 432, hRule: 'exact'}}});
    assert.deepEqual(patchOf({...q, rowHeight: 1000}, q),
      {rows: {trHeight: {val: 1000, hRule: 'atLeast'}}});
    assert.deepEqual(patchOf({rowMode: 'auto'}, q),
      {rows: {trHeight: null}});
  });
  it('table, column, cell fields', () => {
    assert.deepEqual(patchOf({widthMode: 'length', width: 5000,
      align: 'right', indent: -100, colWidth: 3000, cellWidth: 2500,
      vAlign: 'bottom'}, q), {tblPr: {tblW: dxa(5000), jc: 'right',
      tblInd: dxa(-100)}, cols: {widthTw: 3000}, cells: {tcW: 2500,
      vAlign: 'bottom'}});
    assert.deepEqual(patchOf({widthMode: 'length'}, {...q,
      widthMode: 'auto'}), {error: 'range', field: 'width'});
    assert.deepEqual(patchOf({widthMode: 'auto'}, {...q,
      widthMode: 'length', width: 4000}), {tblPr: {tblW: {w: 0,
      type: 'auto'}}});
    assert.deepEqual(patchOf({align: 'right'}, q, true),
      {tblPr: {jc: 'end'}});
  });
  it('never clamped: -1", 23", text, blank where a length is due',
    () => {
      for (const f of ['width', 'colWidth', 'cellWidth']) {
        for (const v of [-1440, 0, 28, 33120, null, NaN, Infinity]) {
          assert.deepEqual(patchOf({[f]: v}, {...q, widthMode: 'length',
            width: 1}), {error: 'range', field: f}, f + ' ' + v);
        }
      }
      for (const v of [-1440, 33120, null]) {
        assert.equal(patchOf({rowHeight: v}, q).error, 'range');
      }
      for (const v of [-31681, 31681, null]) {
        assert.equal(patchOf({indent: v}, q).error, 'range');
      }
      assert.deepEqual(patchOf({rowHeight: 200}, {...q, rowMode:
        undefined, rowHeight: undefined}), {error: 'range',
        field: 'rowMode'}, 'a length with no rule');
      assert.deepEqual(patchOf({rowMode: 'atLeast'}, {...q,
        rowMode: 'auto', rowHeight: undefined}), {error: 'range',
        field: 'rowHeight'}, 'a rule with no length');
      for (const k of ['widthMode', 'align', 'rowMode', 'vAlign']) {
        assert.equal(patchOf({[k]: '__proto__'}, q).error, 'range', k);
      }
      assert.equal(patchOf({width: 5000}, {...q, widthMode: 'length',
        width: 4000}).tblPr.tblW.w, 5000);
    });
  it('the edges are accepted: 29 and 31680 twips, 0 height', () => {
    assert.ok(patchOf({colWidth: 29, cellWidth: 31680, rowHeight: 0},
      q).cols);
  });
  it('a width typed with no Auto / Length (a percentage table): ' +
    'refused, field widthMode; with Length chosen it is the width', () => {
    const p = table(1, 1, {tblPr: {tblW: {w: 5000, type: 'pct'}}});
    const qp = fill(whole(p), p);
    assert.equal(qp.widthMode, undefined);
    assert.deepEqual(patchOf({width: 7200}, qp), {error: 'range',
      field: 'widthMode'});
    assert.deepEqual(patchOf({widthMode: 'length', width: 7200}, qp),
      {tblPr: {tblW: dxa(7200)}});
    assert.deepEqual(patchOf({widthMode: 'auto'}, qp),
      {tblPr: {tblW: {w: 0, type: 'auto'}}});
    assert.deepEqual(patchOf({align: 'center'}, qp),
      {tblPr: {jc: 'center'}}, 'other fields still work');
  });
  it('only the rule changed: the height kept as stored, not as shown',
    () => {
      const r = table(1, 1, {trPr: () => ({trHeight: {val: 3000,
        hRule: 'atLeast'}})});
      const qr = fill(whole(r), r);
      assert.deepEqual(patchOf({rowMode: 'exact', rowHeight: 2995}, qr),
        {rows: {trHeight: {val: 3000, hRule: 'exact'}}});
      assert.deepEqual(patchOf({rowMode: 'exact', rowHeight: 2500}, qr),
        {rows: {trHeight: {val: 2500, hRule: 'exact'}}});
      const w = table(1, 1, {tblPr: {tblW: dxa(3000)}});
      const qw = fill(whole(w), w);
      assert.deepEqual(patchOf({widthMode: 'length', width: 2995,
        align: 'right'}, qw), {tblPr: {jc: 'right'}});
    });
  it('fieldOf: the field of the part of a patch the command refuses',
    () => {
      const t2 = table(2, 2);
      const g = gridOf(t2), x = whole(t2);
      const run = (sub) => setProps(t2, g, x, sub);
      assert.equal(fieldOf({tblPr: {tblW: dxa(5000)}, cells: {vAlign:
        'both'}}, run), 'vAlign');
      assert.equal(fieldOf({tblPr: {tblInd: dxa(99999)}}, run), 'indent');
      assert.equal(fieldOf({rows: {trHeight: {val: -1, hRule: 'exact'}}},
        run), 'rowHeight');
      assert.equal(fieldOf({cols: {widthTw: 0}}, run), 'colWidth');
      assert.equal(fieldOf({cells: {tcW: 1e9}}, run), 'cellWidth');
      assert.equal(fieldOf({tblPr: {jc: 'both'}}, run), 'align');
      assert.equal(fieldOf({tblPr: {tblW: dxa(5000)}}, run), undefined);
    });
});

describe('setProps', () => {
  const g2 = (t) => gridOf(t);
  it('only Row height: trHeight on the shape\'s rows, all else kept',
    () => {
      const keep = raw('w:cnfStyle', [['w:val', '1']]);
      const t = freeze(table(3, 2, {trPr: () => ({extra: [keep]}),
        tblPr: {jc: 'center'}, tcPr: () => ({tcW: dxa(2000)})}));
      const n = setProps(t, g2(t), rect(0, 1, 0, 0), {rows: {
        trHeight: {val: 720, hRule: 'atLeast'}}});
      assert.notEqual(n, t);
      assert.deepEqual(n.rows.map((r) => r.trPr.trHeight), [{val: 720,
        hRule: 'atLeast'}, {val: 720, hRule: 'atLeast'}, undefined]);
      assert.equal(n.rows[0].trPr.extra[0], keep);
      assert.equal(n.rows[2], t.rows[2]);
      assert.equal(n.tblPr, t.tblPr);
      assert.deepEqual(n.rows[0].cells, t.rows[0].cells);
      assert.notEqual(n.grid, t.grid, 'a new grid array');
      assert.deepEqual(n.grid, t.grid);
      assert.equal(n.rows[0].cells[0], t.rows[0].cells[0]);
    });
  it('a raw w:tblW / w:trHeight / w:tcW / w:vAlign is replaced by the '
    + 'field', () => {
    const rw = (n) => raw('w:' + n, [['w:w', '1.5pt']]);
    const t = table(1, 1, {tblPr: {extra: [rw('tblW'), rw('keep')]},
      trPr: () => ({extra: [rw('trHeight')]}), tcPr: () => ({extra: [
        rw('tcW'), rw('vAlign')]})});
    const n = setProps(t, g2(t), whole(t), {tblPr: {tblW: dxa(5000)},
      rows: {trHeight: {val: 300, hRule: 'exact'}},
      cells: {tcW: 1234, vAlign: 'center'}});
    assert.deepEqual(n.tblPr.extra.map((x) => x.name), ['w:keep']);
    assert.deepEqual(n.rows[0].trPr.extra, []);
    assert.deepEqual(n.rows[0].cells[0].tcPr.extra, []);
    assert.deepEqual(n.rows[0].cells[0].tcPr.tcW, dxa(1234));
    assert.deepEqual(t.rows[0].cells[0].tcPr.extra.length, 2, 'old');
  });
  it('Auto removes trHeight', () => {
    const t = table(2, 1, {trPr: () => ({trHeight: {val: 5,
      hRule: 'exact'}})});
    const n = setProps(t, g2(t), rect(1, 1, 0, 0),
      {rows: {trHeight: null}});
    assert.equal(n.rows[0].trPr.trHeight.val, 5);
    assert.equal('trHeight' in n.rows[1].trPr, false);
  });
  it('column width: the grid columns and every cell over them', () => {
    const t = freeze(table(2, 3, {grid: [1000, 2000, 3000],
      tcPr: (i, j) => ({tcW: dxa([1000, 2000, 3000][j])})}));
    const n = setProps(t, g2(t), rect(0, 0, 1, 1), {cols: {
      widthTw: 2500}});
    assert.deepEqual(n.grid, [1000, 2500, 3000]);
    assert.deepEqual(n.rows.map((r) => r.cells.map((c) => c.tcPr.tcW.w)),
      [[1000, 2500, 3000], [1000, 2500, 3000]]);
    assert.equal(n.rows[0].cells[0], t.rows[0].cells[0]);
    const w = setProps(t, g2(t), rect(0, 0, 0, 2), {cols: {
      widthTw: 1500}});
    assert.deepEqual(w.grid, [1500, 1500, 1500]);
  });
  it('a spanning cell over a changed column gets the new sum', () => {
    const t = table(2, 2, {tcPr: (i, j) => (i === 0 ? (j === 0 ? {
      gridSpan: 2, tcW: dxa(4000)} : null) : {})});
    const t1 = {...t, rows: [{...t.rows[0], cells: [t.rows[0].cells[0]]},
      t.rows[1]]};
    const n = setProps(t1, g2(t1), rect(1, 1, 1, 1), {cols: {
      widthTw: 3000}});
    assert.deepEqual(n.grid, [2000, 3000]);
    assert.equal(n.rows[0].cells[0].tcPr.tcW.w, 5000);
  });
  it('cell width and vAlign: the shape\'s cells, a merged one once; '
    + 'its continue cells too', () => {
    const t = table(3, 2, {tcPr: (i, j) => (j === 0 && i > 0 ? {
      vMerge: i === 1 ? 'restart' : 'continue'} : {})});
    const n = setProps(t, g2(t), rect(1, 1, 0, 0), {cells: {tcW: 1800,
      vAlign: 'bottom'}});
    const col = n.rows.map((r) => r.cells[0].tcPr);
    assert.equal(col[0].vAlign, undefined);
    assert.equal(col[1].vAlign, 'bottom');
    assert.equal(col[2].vAlign, 'bottom', 'the continue cell');
    assert.deepEqual(col[2].tcW, dxa(1800));
    assert.equal(n.rows[1].cells[1], t.rows[1].cells[1]);
  });
  it('tblPr: width, alignment, indent', () => {
    const t = freeze(table(1, 1));
    const n = setProps(t, g2(t), whole(t), {tblPr: {tblW: dxa(5000),
      jc: 'center', tblInd: dxa(-50)}});
    assert.deepEqual([n.tblPr.tblW, n.tblPr.jc, n.tblPr.tblInd],
      [dxa(5000), 'center', dxa(-50)]);
    assert.equal(t.tblPr.jc, undefined);
    assert.equal(n.rows, t.rows);
  });
  it('no change: the same table; a stray alone is not a change', () => {
    const t = table(2, 1, {tcPr: () => ({vAlign: 'top', tcW: dxa(2000)}),
      grid: [2000]});
    assert.equal(setProps(t, g2(t), whole(t), {cells: {vAlign: 'top',
      tcW: 2000}}), t);
    assert.equal(setProps(t, g2(t), whole(t), {}), t);
    const s = table(2, 1, {tcPr: (i) => (i === 1 ? {vMerge: 'continue'}
      : {})});
    assert.equal(setProps(s, g2(s), whole(s), {cells: {}}), s);
  });
  it('hostile: bad shape, widths, vAlign, tblPr keys', () => {
    const t = table(2, 2);
    const bad = (shape, patch) => assert.throws(() => setProps(t,
      g2(t), shape, patch), RangeError, JSON.stringify([shape, patch]));
    bad(rect(0, 2, 0, 0), {});
    bad(rect(1, 0, 0, 0), {});
    bad(rect(0, 0, 0, 2), {});
    bad(rect(0, 0, -1, 0), {});
    bad(undefined, {});
    bad(rect(0, 0, 0, 0), {cols: {widthTw: 0}});
    bad(rect(0, 0, 0, 0), {cols: {widthTw: 31681}});
    bad(rect(0, 0, 0, 0), {cols: {widthTw: 1.5}});
    bad(rect(0, 0, 0, 0), {cols: {widthTw: NaN}});
    bad(rect(0, 0, 0, 0), {cells: {tcW: -1}});
    bad(rect(0, 0, 0, 0), {cells: {vAlign: 'both'}});
    bad(rect(0, 0, 0, 0), {cells: {vAlign: '__proto__'}});
    bad(rect(0, 0, 0, 0), {rows: {trHeight: {val: -1, hRule: 'exact'}}});
    bad(rect(0, 0, 0, 0), {rows: {trHeight: {val: 1, hRule: 'x'}}});
    bad(rect(0, 0, 0, 0), {rows: {}});
    bad(rect(0, 0, 0, 0), {tblPr: {extra: []}});
    bad(rect(0, 0, 0, 0), JSON.parse('{"tblPr":{"__proto__":1}}'));
    bad(rect(0, 0, 0, 0), {tblPr: {tblW: {w: 1, type: 'pct'}}});
    bad(rect(0, 0, 0, 0), {tblPr: {tblInd: dxa(99999)}});
    bad(rect(0, 0, 0, 0), {tblPr: {jc: 'both'}});
    assert.equal(({}).extra, undefined, 'Object.prototype clean');
  });
});

describe('the commands', () => {
  const car = (d, t) => {
    let out = null;
    forEachBlock(d.doc, (b) => { if (b.type === 'p' && b.text === t) out = b; });
    return out;
  };
  const sel = (d, a, b) => S.select({id: car(d, a).id, off: 0},
    {id: car(d, b).id, off: 1});
  const doc = (r = 2, c = 2) => {
    const T = freeze(table(r, c));
    return {d: mk(['p0', T, 'p2']), T};
  };
  const cellsOfDoc = (d) => walkAt(d.doc, [0, 1]).rows.map((r) =>
    r.cells.map((x) => x.tcPr.vAlign));
  it('Cell alignment > Centre on 2 x 2: those four only, one step',
    () => {
      const {d} = doc(3, 3);
      const out = undoable(d, () => alignCmd(d, sel(d, 'r0c0', 'r1c1'),
        'center'));
      assert.deepEqual(cellsOfDoc(d), [['center', 'center', undefined],
        ['center', 'center', undefined], [undefined, undefined,
          undefined]]);
      assert.deepEqual(out.head, sel(d, 'r0c0', 'r1c1').head, 'kept');
    });
  it('a caret: its cell; undo gives the very old table', () => {
    const {d, T} = doc();
    const before = d.undoDepth;
    alignCmd(d, S.caret({id: car(d, 'r1c0').id, off: 0}), 'bottom');
    assert.equal(d.undoDepth, before + 1);
    assert.deepEqual(cellsOfDoc(d), [[undefined, undefined],
      ['bottom', undefined]]);
    d.undo();
    assert.equal(walkAt(d.doc, [0, 1]), T);
  });
  it('no change or no table: null, no step', () => {
    const {d} = doc();
    const n = d.undoDepth;
    const s = S.caret({id: car(d, 'r0c0').id, off: 0});
    assert.equal(propsCmd(d, S.caret({id: car(d, 'p0').id, off: 0}),
      {cells: {vAlign: 'top'}}), null);
    assert.equal(propsCmd(d, s, {}), null);
    assert.notEqual(propsCmd(d, s, {cells: {vAlign: 'top'}}), null,
      'top is written explicitly (a style may say otherwise)');
    assert.equal(d.undoDepth, n + 1);
    assert.equal(alignCmd(d, s, 'top'), null, 'now already top');
    assert.equal(d.undoDepth, n + 1);
  });
  it('through TABLE: cellTop, cellCenter, cellBottom', () => {
    const {d} = doc();
    const s = S.caret({id: car(d, 'r0c1').id, off: 0});
    for (const [id, v] of [['cellTop', 'top'], ['cellCenter', 'center'],
      ['cellBottom', 'bottom']]) {
      undoable(d, () => TABLE[id](d, s));
      assert.equal(cellsOfDoc(d)[0][1], v);
    }
  });
  it('propsCmd: the whole patch in one step; written back as the XML',
    async () => {
      const {d} = doc();
      const s = sel(d, 'r0c0', 'r1c0');
      const x = rectOf(d.doc, s);
      assert.deepEqual([x.c0, x.c1], [0, 0]);
      undoable(d, () => propsCmd(d, s, {tblPr: {tblW: dxa(5000)},
        rows: {trHeight: {val: 432, hRule: 'exact'}}, cols: {
          widthTw: 1000}, cells: {vAlign: 'center'}}));
      const t = walkAt(d.doc, [0, 1]);
      assert.equal(t.grid[0], 1000);
      assert.equal(t.rows[1].trPr.trHeight.hRule, 'exact');
      const bytes = await writeDocx(d.doc, {date: new Date(2024, 4, 6)});
      assertSameDoc(await readDocx(bytes, {}), expectedBack(d.doc),
      'read back equal');
    });
  it('a bad patch: RangeError, nothing changed', () => {
    const {d, T} = doc();
    const n = d.undoDepth;
    assert.throws(() => propsCmd(d, S.caret({id: car(d, 'r0c0').id,
      off: 0}), {cells: {vAlign: 'both'}}), RangeError);
    assert.equal(d.undoDepth, n);
    assert.equal(walkAt(d.doc, [0, 1]), T);
  });
});
