// Borders and shading for cells and tables (Batch C5.2, D31):
// ./TblBorderPatch fill / patch (the box's values for Apply to Cell
// or Table from the table and the shape; the patch OK makes: Cell's
// sides on the rectangle's outer edges and between its cells; a line
// turned off is also turned off on the neighbours across its outer
// edges whose edge lies along it (not a wider one; none in a table
// with cell spacing); Table's tblBorders and tblPr shd), ./TblEditProps
// setBorders
// (only tcBorders / shd / tblBorders touched, copy on write, raw
// sides refused, hostile patches refused) and ./TblCmdCols
// bordersCmd (one undo step, the selection kept).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {fill, patch, settingOf, sidesOf, SIDES6}
  from '../../tools/moreapps/!Letters/TblBorderPatch';
import {setBorders} from '../../tools/moreapps/!Letters/TblEditProps';
import {bordersCmd} from '../../tools/moreapps/!Letters/TblCmdCols';
import {rectOf} from '../../tools/moreapps/!Letters/TblCmd';
import {gridOf} from '../../tools/moreapps/!Letters/TblGrid';
import {at as walkAt, forEachBlock} from '../../tools/moreapps/!Letters/Walk';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {assertSameDoc, expectedBack} from './docx-compare.mjs';
import {mk, undoable} from './edit-docs.mjs';
import {modelTable, freeze} from './tbl-fixtures.mjs';

const ONE = {val: 'single', sz: 4, space: 0, color: 'auto'};
const NIL = {val: 'nil'};
const rawEl = (name, kids = []) => ({name: 'w:' + name, attrs: [],
  children: kids});
const themed = () => rawEl('tcBorders', [{name: 'w:top', attrs: [
  ['w:val', 'single'], ['w:sz', '4'], ['w:space', '0'],
  ['w:color', '4472C4'], ['w:themeColor', 'accent1']], children: []}]);

/** An r x c model table of 'r<i>c<j>' cells; tcPr / tblPr given. */
function table(r, c, {tblPr, tcPr = () => ({})} = {}) {
  const spec = [];
  for (let i = 0; i < r; i++) {
    spec.push([...Array(c).keys()].map((j) => ({blocks: [`r${i}c${j}`],
      tcPr: {extra: [], tcW: {w: 2000, type: 'dxa'}, ...tcPr(i, j)}})));
  }
  return freeze(modelTable(spec, {tblPr: {extra: [], ...tblPr}}));
}
const rect = (r0, r1, c0, c1) => ({r0, r1, c0, c1});
const q = (t, shape) => ({shape, table: t, g: gridOf(t)});
const off = Object.fromEntries(SIDES6.map((k) => [k, false]));
const tcb = (t) => t.rows.map((row) => row.cells.map((c) =>
  c.tcPr.tcBorders || null));
/** The values with sides set (the rest as fill gave them). */
const ask = (t, shape, apply, o) => ({...fill(shape, t, gridOf(t),
  apply), ...o});

describe('fill', () => {
  it('no borders: None, no side, Single, 1/2 pt, Automatic, no fill',
    () => {
      const t = table(3, 3);
      const v = fill(rect(0, 1, 0, 1), t, gridOf(t), 'cell');
      assert.deepEqual(v, {setting: 'none', ...off, between: false,
        style: 'single', width: 4, colour: 'auto', fillkind: 'none',
        fill: undefined, apply: 'cell'});
    });
  it('the table\'s own borders are what the cells show', () => {
    const t = table(3, 3, {tblPr: {tblBorders: Object.fromEntries(
      SIDES6.map((k) => [k, ONE]))}});
    const v = fill(rect(0, 1, 0, 1), t, gridOf(t), 'cell');
    assert.equal(v.setting, 'all');
    for (const k of SIDES6) assert.equal(v[k], true, k);
    assert.equal(fill(rect(0, 0, 0, 0), t, gridOf(t), 'table').setting,
      'all');
  });
  it('a side drawn on some cells only is mixed (undefined)', () => {
    const t = table(2, 2, {tcPr: (i, j) => (j ? {} : {tcBorders: {
      top: ONE}})});
    const v = fill(rect(0, 0, 0, 1), t, gridOf(t), 'cell');
    assert.equal(v.top, undefined);
    assert.equal(v.bottom, false);
    assert.equal(v.setting, 'custom');
    assert.equal(fill(rect(0, 0, 0, 0), t, gridOf(t), 'cell').top,
      true);
  });
  it('one cell: no inside sides (false)', () => {
    const t = table(2, 2);
    const v = fill(rect(1, 1, 1, 1), t, gridOf(t), 'cell');
    assert.equal(v.insideH, false);
    assert.equal(v.insideV, false);
  });
  it('shading: the cells\' own, mixed undefined; the table\'s tblPr shd',
    () => {
      const shd = {val: 'clear', color: 'auto', fill: 'D9D9D9'};
      const t = table(2, 2, {tcPr: (i) => (i ? {} : {shd}),
        tblPr: {shd: {val: 'clear', color: 'auto', fill: 'FF0000'}}});
      const g = gridOf(t);
      assert.equal(fill(rect(0, 0, 0, 1), t, g, 'cell').fill, 'D9D9D9');
      assert.equal(fill(rect(0, 1, 0, 1), t, g, 'cell').fillkind,
        undefined);
      assert.equal(fill(rect(1, 1, 0, 0), t, g, 'cell').fillkind, 'none');
      assert.equal(fill(rect(1, 1, 0, 0), t, g, 'table').fill, 'FF0000');
    });
  it('a themed raw side: unknown (undefined), style too', () => {
    const t = table(2, 2, {tcPr: (i, j) => (i || j ? {} : {
      extra: [themed()]})});
    const v = fill(rect(0, 0, 0, 0), t, gridOf(t), 'cell');
    assert.equal(v.top, undefined);
    assert.equal(v.style, undefined);
  });
  it('eff (the layout\'s resolved sides) wins over the direct ones',
    () => {
      const t = table(2, 2);
      const eff = {cell: () => ({top: ONE, left: ONE, bottom: ONE,
        right: ONE}), table: Object.fromEntries(SIDES6.map((k) =>
        [k, ONE]))};
      const v = fill(rect(0, 1, 0, 1), t, gridOf(t), 'cell', eff);
      assert.equal(v.setting, 'all');
      assert.equal(fill(rect(0, 0, 0, 0), t, gridOf(t), 'table', eff)
        .setting, 'all');
    });
});

describe('settingOf / sidesOf', () => {
  it('None, Box, All, Custom', () => {
    assert.equal(settingOf(off), 'none');
    assert.equal(settingOf(sidesOf('box')), 'box');
    assert.equal(settingOf(sidesOf('all')), 'all');
    assert.equal(settingOf({...off, insideH: true}), 'custom');
    assert.equal(sidesOf('custom'), null);
    assert.deepEqual(sidesOf('box'), {top: true, bottom: true,
      left: true, right: true, insideH: false, insideV: false});
  });
});

describe('patch and setBorders', () => {
  it('Cell + Box on a 2 x 2 of a 3 x 3: its outer sides single 4, ' +
    'the inside and the neighbours untouched (a drawn side wins)', () => {
    const t = table(3, 3), x = rect(0, 1, 0, 1);
    const p = patch(ask(t, x, 'cell', {setting: 'box',
      ...sidesOf('box')}), q(t, x));
    assert.equal(p.bad, undefined);
    assert.equal(p.tblPr, undefined);
    const n = setBorders(t, p);
    assert.deepEqual(tcb(n), [
      [{top: ONE, left: ONE}, {top: ONE, right: ONE}, null],
      [{bottom: ONE, left: ONE}, {bottom: ONE, right: ONE}, null],
      [null, null, null]]);
    assert.equal(n.grid, t.grid, 'the grid is not changed');
  });
  /** Row 0 one cell over the 3 columns, rows 1 and 2 three cells. */
  const wide = (top, rest = () => ({})) => freeze(modelTable([
    [{blocks: ['w'], tcPr: {extra: [], gridSpan: 3, ...top}}],
    ...[1, 2].map((i) => [0, 1, 2].map((j) => ({blocks: [`r${i}c${j}`],
      tcPr: {extra: [], ...rest(i, j)}})))], {grid: [2000, 2000, 2000],
    tblPr: {extra: []}}));
  it('Box on the middle cell below a cell spanning 3 columns: the wide ' +
    'neighbour and every other cell unchanged', () => {
    const t = wide({}), x = rect(1, 1, 1, 1);
    const n = setBorders(t, patch(ask(t, x, 'cell', {setting: 'box',
      ...sidesOf('box')}), q(t, x)));
    assert.deepEqual(tcb(n), [[null],
      [null, {top: ONE, bottom: ONE, left: ONE, right: ONE}, null],
      [null, null, null]]);
    assert.equal(n.rows[0], t.rows[0]);
    assert.equal(n.rows[2], t.rows[2]);
  });
  it('turning a line off: a wider neighbour is skipped (its line may ' +
    'still be drawn), one along the edge gets nil', () => {
    const t = wide({tcBorders: {bottom: ONE}}, (i) => (i === 2 ? {}
      : {tcBorders: {top: ONE}}));
    const x = rect(1, 1, 1, 1);
    const n = setBorders(t, patch(ask(t, x, 'cell', {top: false}),
      q(t, x)));
    assert.equal(n.rows[0], t.rows[0], 'the wide cell unchanged');
    assert.deepEqual(n.rows[1].cells[1].tcPr.tcBorders, {top: NIL});
    assert.equal(n.rows[1].cells[0], t.rows[1].cells[0]);
    // three cells above a selection over the 3 columns: each is along
    // its edge, so each gets nil
    const y = rect(2, 2, 0, 2);
    const t2 = wide({}, (i) => ({tcBorders: i === 1 ? {bottom: ONE}
      : {top: ONE}}));
    const m = setBorders(t2, patch(ask(t2, y, 'cell', {top: false}),
      q(t2, y)));
    assert.deepEqual(m.rows[1].cells.map((c) => c.tcPr.tcBorders),
      [{bottom: NIL}, {bottom: NIL}, {bottom: NIL}]);
    assert.equal(m.rows[0], t2.rows[0]);
  });
  it('cell spacing: every cell draws its own sides, so Cell + Box on ' +
    'the middle cell changes that cell only, on and off', () => {
    const SP = {w: 60, type: 'dxa'};
    const all = Object.fromEntries(SIDES6.map((k) => [k, ONE]));
    const base = table(3, 3, {tblPr: {tblBorders: all}});
    for (const t of [table(3, 3, {tblPr: {tblBorders: all,
      tblCellSpacing: SP}}), freeze({...base, rows: base.rows.map(
      (row) => ({...row, trPr: {...row.trPr, tblCellSpacing: SP}}))})]) {
      const x = rect(1, 1, 1, 1);
      for (const v of [{setting: 'box', ...sidesOf('box'),
        style: 'double'}, {setting: 'none', ...sidesOf('none')}]) {
        const n = setBorders(t, patch(ask(t, x, 'cell', v), q(t, x)));
        n.rows.forEach((row, r) => row.cells.forEach((c, k) => {
          if (r !== 1 || k !== 1) {
            assert.equal(c, t.rows[r].cells[k], `${r},${k}`);
          }
        }));
        assert.notEqual(n.rows[1].cells[1], t.rows[1].cells[1]);
      }
    }
  });
  it('Inside horizontal only: the two inner horizontal edges', () => {
    const t = table(3, 3), x = rect(0, 1, 0, 1);
    const p = patch(ask(t, x, 'cell', {insideH: true}), q(t, x));
    assert.deepEqual(tcb(setBorders(t, p)), [
      [{bottom: ONE}, {bottom: ONE}, null],
      [{top: ONE}, {top: ONE}, null], [null, null, null]]);
  });
  it('Inside vertical only: the line between the columns', () => {
    const t = table(2, 3), x = rect(0, 1, 0, 1);
    const p = patch(ask(t, x, 'cell', {insideV: true}), q(t, x));
    assert.deepEqual(tcb(setBorders(t, p)), [
      [{right: ONE}, {left: ONE}, null], [{right: ONE}, {left: ONE},
        null]]);
  });
  it('a side turned off writes nil (the table\'s line hidden) on the ' +
    'cells and their neighbours', () => {
    const t = table(3, 3, {tblPr: {tblBorders: Object.fromEntries(
      SIDES6.map((k) => [k, ONE]))}});
    const x = rect(1, 1, 1, 1);
    const p = patch(ask(t, x, 'cell', {top: false}), q(t, x));
    const n = tcb(setBorders(t, p));
    assert.deepEqual(n[1][1], {top: {val: 'nil'}});
    assert.deepEqual(n[0][1], {bottom: {val: 'nil'}});
    assert.equal(n[0][0], null);
  });
  it('Table + All: tblBorders six sides, cells\' own tcBorders kept',
    () => {
      const own = {top: {...ONE, val: 'double'}};
      const t = table(2, 2, {tcPr: (i, j) => (i || j ? {} : {
        tcBorders: own})});
      const x = rect(0, 0, 0, 0);
      const p = patch(ask(t, x, 'table', {setting: 'all',
        ...sidesOf('all')}), q(t, x));
      assert.equal(p.cells, undefined);
      const n = setBorders(t, p);
      assert.deepEqual(n.tblPr.tblBorders, Object.fromEntries(
        SIDES6.map((k) => [k, ONE])));
      assert.equal(n.rows[0].cells[0].tcPr.tcBorders,
        t.rows[0].cells[0].tcPr.tcBorders);
      assert.deepEqual(n.rows[0].cells[0].tcPr.tcBorders, own);
      assert.equal(n.rows[1], t.rows[1], 'rows shared');
    });
  it('shading D9D9D9 on cells: tcPr shd fill on those cells only', () => {
    const t = table(3, 3), x = rect(0, 1, 0, 1);
    const p = patch(ask(t, x, 'cell', {fillkind: 'colour',
      fill: 'D9D9D9'}), q(t, x));
    const n = setBorders(t, p);
    const shd = n.rows.map((r) => r.cells.map((c) => c.tcPr.shd ?? null));
    const S0 = {val: 'clear', color: 'auto', fill: 'D9D9D9'};
    assert.deepEqual(shd, [[S0, S0, null], [S0, S0, null],
      [null, null, null]]);
    const back = patch(ask(n, x, 'cell', {fillkind: 'none'}), q(n, x));
    const m = setBorders(n, back);
    assert.equal(m.rows[0].cells[0].tcPr.shd, undefined, 'None: gone');
    assert.equal(Object.hasOwn(m.rows[0].cells[0].tcPr, 'shd'), false);
  });
  it('Table shading: tblPr shd', () => {
    const t = table(2, 2), x = rect(0, 0, 0, 0);
    const p = patch(ask(t, x, 'table', {fillkind: 'colour',
      fill: 'FFFF00'}), q(t, x));
    assert.deepEqual(setBorders(t, p).tblPr.shd, {val: 'clear',
      color: 'auto', fill: 'FFFF00'});
  });
  it('a cell with a themed raw border: bad, nothing changed', () => {
    const t = table(3, 3, {tcPr: (i, j) => (i || j ? {} : {
      extra: [themed()]})});
    const x = rect(0, 1, 0, 1);
    assert.deepEqual(patch(ask(t, x, 'cell', {setting: 'box',
      ...sidesOf('box')}), q(t, x)), {bad: ['raw']});
    // a neighbour's raw border is touched too (a line turned off)
    const y = rect(1, 1, 0, 0);
    assert.deepEqual(patch(ask(t, y, 'cell', {top: true}), q(t, y))
      .bad, undefined, 'on: the neighbour is not written');
    const tt = freeze({...t, tblPr: {extra: [], tblBorders: {insideH:
      ONE}}});
    assert.deepEqual(patch(ask(tt, y, 'cell', {top: false}), q(tt, y)),
      {bad: ['raw']});
    // shading only: the raw border is not touched
    const s = patch(ask(t, x, 'cell', {fillkind: 'colour',
      fill: 'D9D9D9'}), q(t, x));
    assert.equal(s.bad, undefined);
    assert.throws(() => setBorders(t, {cells: new Map([['0,0',
      {tcBorders: {top: ONE}}]])}), RangeError);
  });
  it('a themed raw table border or shading: bad for Table', () => {
    const t = freeze({...table(2, 2), tblPr: {extra: [
      rawEl('tblBorders'), rawEl('shd')]}});
    const x = rect(0, 0, 0, 0);
    assert.deepEqual(patch(ask(t, x, 'table', {top: true}), q(t, x)),
      {bad: ['raw']});
    assert.deepEqual(patch(ask(t, x, 'table', {fillkind: 'colour',
      fill: 'D9D9D9'}), q(t, x)), {bad: ['raw']});
  });
  it('patches touch only tcBorders / shd (extra and the rest ===)',
    () => {
      const keep = rawEl('cnfStyle');
      const t = table(3, 3, {tcPr: () => ({extra: [keep],
        vAlign: 'center'})});
      const x = rect(0, 1, 0, 1);
      const n = setBorders(t, patch(ask(t, x, 'cell', {setting: 'box',
        ...sidesOf('box'), fillkind: 'colour', fill: 'D9D9D9'}),
      q(t, x)));
      n.rows.forEach((row, r) => row.cells.forEach((c, k) => {
        const o = t.rows[r].cells[k];
        assert.equal(c.tcPr.extra, o.tcPr.extra);
        assert.equal(c.tcPr.tcW, o.tcPr.tcW);
        assert.equal(c.tcPr.vAlign, 'center');
        assert.equal(c.blocks, o.blocks);
        const ks = Object.keys(c.tcPr).filter((f) => c.tcPr[f] !==
          o.tcPr[f]);
        assert.ok(ks.every((f) => f === 'tcBorders' || f === 'shd'), ks);
      }));
      assert.equal(n.tblPr, t.tblPr);
      assert.equal(n.rows[2].cells[2], t.rows[2].cells[2]);
    });
  it('nothing changed: {}, setBorders gives the same table', () => {
    const t = table(2, 2), x = rect(0, 0, 0, 0);
    const p = patch(fill(x, t, gridOf(t), 'cell'), q(t, x));
    assert.deepEqual(p, {});
    assert.equal(setBorders(t, p), t);
    const on = patch(ask(t, x, 'cell', {top: true}), q(t, x));
    const n = setBorders(t, on);
    assert.deepEqual(patch(ask(n, x, 'cell', {top: true}), q(n, x)), {});
  });
  it('Style, Width, Colour on drawn sides rewrite them', () => {
    const t = table(1, 1, {tcPr: () => ({tcBorders: {top: ONE}})});
    const x = rect(0, 0, 0, 0);
    const p = patch(ask(t, x, 'cell', {style: 'double', width: 12,
      colour: 'FF0000'}), q(t, x));
    assert.deepEqual(setBorders(t, p).rows[0].cells[0].tcPr.tcBorders,
      {top: {val: 'double', sz: 12, space: 0, color: 'FF0000'}});
  });
  it('a look changed with no side known: bad sides; bad values', () => {
    const t = table(2, 1, {tcPr: (i) => (i ? {} : {tcBorders: {
      bottom: ONE}})});
    const x = rect(0, 1, 0, 0);
    const v = fill(x, t, gridOf(t), 'cell');
    assert.equal(v.insideH, undefined, 'one of the two sides drawn');
    const none = Object.fromEntries(SIDES6.map((k) => [k, undefined]));
    assert.deepEqual(patch({...v, ...none, style: 'double'}, q(t, x)),
      {bad: ['sides']});
    for (const [k, val] of [['style', 'wave'], ['width', 5],
      ['colour', 'red'], ['top', 'yes'], ['fillkind', 'x'],
      ['fill', '__proto__'], ['apply', 'para']]) {
      assert.ok(patch({...v, [k]: val}, q(t, x)).bad.length, k);
    }
  });
  it('a vertical merge: no line inside it, its bottom from the last cell',
    () => {
      const t = table(3, 2, {tcPr: (i, j) => (j === 0 && i < 2
        ? {vMerge: i ? 'continue' : 'restart'} : {})});
      const x = rect(0, 1, 0, 0);
      const p = patch(ask(t, x, 'cell', {setting: 'box',
        ...sidesOf('box'), insideH: true}), q(t, x));
      const n = tcb(setBorders(t, p));
      assert.deepEqual(n[0][0], {top: ONE, left: ONE, right: ONE});
      assert.deepEqual(n[1][0], {bottom: ONE, left: ONE, right: ONE});
      assert.equal(n[2][0], null, 'on: the neighbour not written');
    });
  it('setBorders refuses hostile patches (RangeError)', () => {
    const t = table(2, 2);
    const bad = (p) => assert.throws(() => setBorders(t, p), RangeError,
      JSON.stringify(p));
    bad(null);
    bad({cells: {}});
    bad({cells: new Map([['2,0', {shd: null}]])});
    bad({cells: new Map([['0,5', {shd: null}]])});
    bad({cells: new Map([['x', {shd: null}]])});
    bad({cells: new Map([['0,0', {vAlign: 'top'}]])});
    bad({cells: new Map([['0,0', {tcBorders: {top: {val: 'bogus'}}}]])});
    bad({cells: new Map([['0,0', {tcBorders: {middle: ONE}}]])});
    bad({cells: new Map([['0,0', {tcBorders: {top: {...ONE,
      sz: 1e9}}}]])});
    bad({cells: new Map([['0,0', {shd: {val: 'x'}}]])});
    bad({tblPr: {jc: 'left'}});
    bad({tblPr: JSON.parse('{"__proto__": {"x": 1}}')});
    bad({tblPr: {tblBorders: {tl2br: ONE}}});
    bad({other: 1});
    assert.equal(({}).x, undefined, 'Object.prototype clean');
  });
});

describe('bordersCmd', () => {
  const car = (d, s) => {
    let out = null;
    forEachBlock(d.doc, (b) => { if (b.type === 'p' && b.text === s) out = b; });
    return out;
  };
  const sel = (d, a, b) => S.select({id: car(d, a).id, off: 0},
    {id: car(d, b).id, off: 1});
  it('one undo step, the selection kept, undo gives the old table; ' +
    'written back', async () => {
    const T = table(3, 3);
    const d = mk(['p0', T, 'p2']);
    const s = sel(d, 'r0c0', 'r1c1'), x = rectOf(d.doc, s);
    const p = patch(ask(T, x, 'cell', {setting: 'box',
      ...sidesOf('box')}), q(T, x));
    const out = undoable(d, () => bordersCmd(d, s, p));
    assert.deepEqual(out.head, s.head);
    assert.deepEqual(walkAt(d.doc, [0, 1]).rows[0].cells[0].tcPr
      .tcBorders, {top: ONE, left: ONE});
    const bytes = await writeDocx(d.doc, {date: new Date(2024, 4, 6)});
    assertSameDoc(await readDocx(bytes, {}), expectedBack(d.doc),
      'read back equal');
    d.undo();
    assert.equal(walkAt(d.doc, [0, 1]), T);
  });
  it('nothing to do or no table: null, no step', () => {
    const d = mk(['p0', table(2, 2), 'p2']);
    const n = d.undoDepth;
    assert.equal(bordersCmd(d, S.caret({id: car(d, 'p0').id, off: 0}),
      {tblPr: {shd: null}}), null);
    assert.equal(bordersCmd(d, S.caret({id: car(d, 'r0c0').id, off: 0}),
      {}), null);
    assert.equal(d.undoDepth, n);
  });
});
