// TblWidth: table column widths, alignment and cell boxes (D18,
// R24), Batch C2.3.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {TW_PX, MAX_PX, twToPx, widthTw, colsOf, cellBox, alignOf,
  marginsOf, spacingOf} from '../../tools/moreapps/!Letters/TblWidth';
import {modelTable, freeze} from './tbl-fixtures.mjs';

const dxa = (w) => ({w, type: 'dxa'});
const pct = (w) => ({w, type: 'pct'});
const AUTO = {w: 0, type: 'auto'};
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9,
  `${msg || ''} ${a} != ${b}`);
const closeAll = (a, b) => {
  assert.equal(a.length, b.length, `${a} vs ${b}`);
  a.forEach((x, i) => close(x, b[i], `col ${i}:`));
};
const cell = (tcW, gridSpan) => ({blocks: ['x'],
  tcPr: {extra: [], ...(tcW ? {tcW} : {}),
    ...(gridSpan ? {gridSpan} : {})}});
const tbl = (spec, grid, tblPr = {}) =>
  freeze(modelTable(spec, {grid, tblPr: {extra: [], ...tblPr}}));

describe('TblWidth: units', () => {
  it('TW_PX and twToPx: px = tw / 15, not rounded', () => {
    assert.equal(TW_PX, 15);
    assert.equal(MAX_PX, 4000);
    close(twToPx(2000), 2000 / 15);
    assert.equal(twToPx(720), 48);
  });

  it('widthTw: dxa as is, pct of the base, auto / nil null', () => {
    assert.equal(widthTw(dxa(1440), 9000), 1440);
    assert.equal(widthTw(dxa(-720), 9000), -720);
    assert.equal(widthTw(pct(2500), 9000), 4500);
    assert.equal(widthTw(pct('50%'), 9000), 4500);
    assert.equal(widthTw(pct('12.5%'), 1000), 125);
    assert.equal(widthTw(pct('500%'), 1000), 5000);
    assert.equal(widthTw(AUTO, 9000), null);
    assert.equal(widthTw({w: 0, type: 'nil'}, 9000), null);
  });

  it('widthTw: hostile values are null', () => {
    for (const w of [undefined, null, 5, {}, dxa(NaN), dxa(Infinity),
      dxa('12'), pct('x%'), pct('__proto__'), {w: 5, type: '__proto__'},
      {w: 5, type: 'constructor'}, pct(NaN)])
      assert.equal(widthTw(w, 9000), null, JSON.stringify(w));
    assert.equal(widthTw(pct(2500), NaN), null);
  });
});

describe('TblWidth: colsOf, D18 step 1 (the grid)', () => {
  it('a Word-made grid is shown as written', () => {
    const t = tbl([['a', 'b']], [2000, 3000]);
    const v = colsOf(t, null, 600);
    closeAll(v.cols, [2000 / 15, 200]);
    close(v.width, 5000 / 15);
    assert.equal(v.left, 0);
  });

  it('a grid entry of 0 among others is 1 px', () => {
    const v = colsOf(tbl([['a', 'b']], [0, 3000]), null, 600);
    closeAll(v.cols, [1, 200]);
  });

  it('a dxa tblW within 1/20 of the grid keeps it (then scales)', () =>
  {
    const t = tbl([['a', 'b']], [2000, 3000], {tblW: dxa(5200)});
    const v = colsOf(t, null, 600);
    closeAll(v.cols, [2000 / 15 * 1.04, 200 * 1.04]);
  });
});

describe('TblWidth: colsOf, D18 step 2 (no usable grid)', () => {
  it('tcW dxa / pct / auto mix: auto columns share the rest', () => {
    const t = tbl([[cell(dxa(1500)), cell(pct('25%')), 'c', 'd']],
      [0, 0, 0, 0]);
    const v = colsOf(t, null, 600, () => 10);
    closeAll(v.cols, [100, 150, 175, 175]);
  });

  it('integer pct; the widest tcW of a column wins', () => {
    const t = tbl([[cell(pct(1250)), cell(dxa(300))],
      [cell(dxa(600)), cell(dxa(1500))]], [0, 0]);
    closeAll(colsOf(t, null, 600, () => 0).cols, [150, 100]);
  });

  it('an auto column is at least its widest min width', () => {
    const t = tbl([[cell(dxa(1500)), 'b', 'c'], ['x', 'y', 'z']],
      [0, 0, 0]);
    const minOf = (r, k) => (r === 1 && k === 2 ? 400 : 20);
    closeAll(colsOf(t, null, 600, minOf).cols, [100, 250, 400]);
  });

  it('a min width is capped at the text width', () => {
    const t = tbl([['a', 'b']], [0, 0]);
    const v = colsOf(t, null, 600, (r, k) => (k ? 5000 : 0));
    closeAll(v.cols, [300, 600]);
  });

  it('a spanning cell gives no column width', () => {
    const t = tbl([[cell(dxa(6000), 2)], [cell(dxa(1500)), 'b']],
      [0, 0]);
    closeAll(colsOf(t, null, 600, () => 0).cols, [100, 500]);
  });

  it('fewer grid columns than the widest row: unusable', () => {
    const t = tbl([[cell(dxa(1500)), 'b', 'c']], [3000]);
    closeAll(colsOf(t, null, 600, () => 0).cols, [100, 250, 250]);
  });

  it('a grid off a dxa tblW by more than 1/20: unusable', () => {
    const t = tbl([['a', 'b']], [2000, 3000], {tblW: dxa(6000)});
    closeAll(colsOf(t, null, 600, () => 0).cols, [200, 200]);
  });

  it('without minOf the min widths are 0', () => {
    const t = tbl([['a', 'b']], [0, 0]);
    closeAll(colsOf(t, null, 600).cols, [300, 300]);
  });
});

describe('TblWidth: colsOf, D18 steps 3 and 4', () => {
  it('tblW pct 50 with autofit scales to half the text width', () => {
    for (const w of [pct(2500), pct('50%')]) {
      const t = tbl([['a', 'b']], [2000, 3000], {tblW: w});
      const v = colsOf(t, null, 600);
      closeAll(v.cols, [120, 180]);
      close(v.width, 300);
    }
    const t = tbl([['a', 'b']], [2000, 3000],
      {tblW: pct(2500), tblLayout: 'autofit'});
    closeAll(colsOf(t, null, 600).cols, [120, 180]);
  });

  it('fixed layout never scales (the style may say fixed)', () => {
    const t = tbl([['a', 'b']], [2000, 3000],
      {tblW: pct(2500), tblLayout: 'fixed'});
    closeAll(colsOf(t, null, 600).cols, [2000 / 15, 200]);
    const u = tbl([['a', 'b']], [2000, 3000], {tblW: pct(2500)});
    const view = freeze({tblPr: {tblLayout: 'fixed', extra: []}});
    closeAll(colsOf(u, view, 600).cols, [2000 / 15, 200]);
  });

  it('the style gives tblW when the table does not', () => {
    const t = tbl([['a', 'b']], [2000, 3000]);
    const view = freeze({tblPr: {tblW: pct(2500), extra: []}});
    closeAll(colsOf(t, view, 600).cols, [120, 180]);
  });

  it('wider than the column is allowed', () => {
    const v = colsOf(tbl([['a', 'b']], [9000, 9000]), null, 600);
    closeAll(v.cols, [600, 600]);
    close(v.width, 1200);
    assert.equal(v.left, 0);
  });

  it('total capped at 4000 px; every column >= 1 px', () => {
    const v = colsOf(tbl([['a', 'b', 'c']], [31680, 31680, 31680]),
      null, 600);
    close(v.width, 4000);
    closeAll(v.cols, [4000 / 3, 4000 / 3, 4000 / 3]);
  });
});

describe('TblWidth: alignment', () => {
  it('tblInd 720 shifts 48 px', () => {
    const t = tbl([['a']], [3000], {tblInd: dxa(720)});
    assert.equal(colsOf(t, null, 600).left, 48);
    assert.equal(alignOf({tblInd: dxa(720), extra: []}, 200, 600), 48);
  });

  it('tblInd pct / auto counts as 0', () => {
    assert.equal(alignOf({tblInd: pct(500)}, 200, 600), 0);
    assert.equal(alignOf({tblInd: AUTO}, 200, 600), 0);
    assert.equal(alignOf(null, 200, 600), 0);
  });

  it('jc center / right / Strict end align; ignored when wider', () => {
    assert.equal(alignOf({jc: 'center'}, 200, 600), 200);
    assert.equal(alignOf({jc: 'right'}, 200, 600), 400);
    assert.equal(alignOf({jc: 'end'}, 200, 600), 400);
    assert.equal(alignOf({jc: 'left'}, 200, 600), 0);
    assert.equal(alignOf({jc: 'start'}, 200, 600), 0);
    assert.equal(alignOf({jc: 'center'}, 800, 600), 0);
    assert.equal(alignOf({jc: 'right', tblInd: dxa(720)}, 800, 600),
      48);
    const t = tbl([['a', 'b']], [2000, 3000], {jc: 'center'});
    close(colsOf(t, null, 600).left, (600 - 5000 / 15) / 2);
  });

  it('a centred table ignores tblInd', () => {
    assert.equal(alignOf({jc: 'center', tblInd: dxa(720)}, 200, 600),
      200);
  });

  it('hostile tblInd is capped at +-31680 twips', () => {
    assert.equal(alignOf({tblInd: dxa(-31680)}, 200, 600), -2112);
    assert.equal(alignOf({tblInd: dxa(-1e9)}, 200, 600), -2112);
    assert.equal(alignOf({tblInd: dxa(1e9)}, 200, 600), 2112);
    assert.equal(alignOf({tblInd: dxa(NaN)}, 200, 600), 0);
    assert.equal(alignOf({jc: '__proto__'}, 200, 600), 0);
  });
});

describe('TblWidth: margins, spacing and cell boxes', () => {
  it('margins default to 108 twips left and right, 0 top/bottom', () => {
    assert.deepEqual(marginsOf(),
      {top: 0, left: 7.2, bottom: 0, right: 7.2});
    assert.deepEqual(marginsOf(null, undefined),
      {top: 0, left: 7.2, bottom: 0, right: 7.2});
  });

  it('tcMar over tblCellMar over the style, side by side', () => {
    const tcMar = {left: dxa(0)};
    const tblCellMar = {left: dxa(300), right: dxa(150)};
    const style = {top: dxa(30), right: dxa(600), bottom: dxa(45)};
    assert.deepEqual(marginsOf(tcMar, tblCellMar, style),
      {top: 2, left: 0, bottom: 3, right: 10});
  });

  it('margins: nil is 0, pct / auto fall through, capped', () => {
    assert.deepEqual(marginsOf({left: {w: 0, type: 'nil'},
      right: pct(50), top: dxa(1e9), bottom: dxa(-5)}),
    {top: 2112, left: 0, bottom: 0, right: 7.2});
  });

  it('cellBox: the span and its text area', () => {
    const b = cellBox([100, 200, 300], 1, 3, marginsOf(), 0);
    assert.deepEqual(Object.keys(b).sort(), ['tw', 'tx', 'w', 'x']);
    closeAll([b.x, b.w, b.tx, b.tw], [100, 500, 107.2, 485.6]);
  });

  it('cellBox: the text area is at least 1 px', () => {
    const b = cellBox([10], 0, 1, marginsOf(), 0);
    assert.equal(b.tw, 1);
    assert.equal(cellBox([1], 0, 1, {left: 0, right: 0}, 5).w, 1);
  });

  it('tblCellSpacing 20 adds 20 twips around every cell', () => {
    const s = spacingOf(dxa(20));
    close(s, 20 / 15);
    const b = cellBox([100, 200], 1, 2, marginsOf(), s);
    close(b.x, 100 + s);
    close(b.w, 200 - 2 * s);
    close(b.tx, 100 + s + 7.2);
    close(b.tw, 200 - 2 * s - 14.4);
  });

  it('spacingOf: the first dxa given wins; hostile capped', () => {
    assert.equal(spacingOf(), 0);
    assert.equal(spacingOf(undefined, dxa(30)), 2);
    assert.equal(spacingOf(dxa(1e9)), 2112);
    assert.equal(spacingOf(dxa(-5)), 0);
    assert.equal(spacingOf(pct(50), dxa(15)), 1);
  });
});

describe('TblWidth: hostile tables', () => {
  it('grid entries all 0 share the text width', () => {
    const v = colsOf(tbl([['a', 'b', 'c']], [0, 0, 0]), null, 600);
    closeAll(v.cols, [200, 200, 200]);
  });

  it('tblW 1e9 is capped at 4000 px', () => {
    const t = tbl([['a', 'b']], [2000, 3000], {tblW: dxa(1e9)});
    const v = colsOf(t, null, 600);
    close(v.width, 4000);
    closeAll(v.cols, [2000, 2000]);
  });

  it('tcW -5 counts as auto', () => {
    const t = tbl([[cell(dxa(-5)), 'b']], [0, 0]);
    closeAll(colsOf(t, null, 600, () => 0).cols, [300, 300]);
  });

  it('pct "500%" is five times the text width, capped', () => {
    const t = tbl([['a', 'b']], [2000, 3000], {tblW: pct('500%')});
    const v = colsOf(t, null, 600);
    close(v.width, 3000);
    closeAll(v.cols, [1200, 1800]);
    const u = tbl([['a', 'b']], [2000, 3000], {tblW: pct('900%')});
    close(colsOf(u, null, 600).width, 4000);
  });

  it('a hostile text width or min width gives finite columns', () => {
    const t = tbl([['a', 'b']], [0, 0]);
    for (const w of [0, -5, NaN, Infinity]) {
      const v = colsOf(t, null, w, () => NaN);
      assert.ok(v.cols.every((c) => Number.isFinite(c) && c >= 1), w);
      assert.ok(Number.isFinite(v.width) && Number.isFinite(v.left));
    }
  });
});

describe('TblWidth: memo', () => {
  it('per (grid, tblPr, view, textW): a table copy shares it', () => {
    const t = tbl([['a', 'b']], [2000, 3000]);
    const v = colsOf(t, null, 600);
    assert.equal(colsOf(t, null, 600), v);
    assert.equal(colsOf({...t, rows: [...t.rows]}, null, 600), v);
    assert.notEqual(colsOf(t, null, 601), v);
    assert.notEqual(colsOf({...t, tblPr: {...t.tblPr}}, null, 600), v);
    const view = freeze({tblPr: {extra: []}});
    assert.notEqual(colsOf(t, view, 600), v);
    assert.equal(colsOf(t, view, 600), colsOf(t, view, 600));
    assert.ok(Object.isFrozen(v) && Object.isFrozen(v.cols));
  });

  it('without a usable grid the rows are part of the key', () => {
    const t = tbl([['a', 'b']], [0, 0]);
    const v = colsOf(t, null, 600, () => 0);
    assert.equal(colsOf(t, null, 600, () => 0), v);
    const u = {...t, rows: [...t.rows]};
    const w = colsOf(u, null, 600, (r, k) => (k ? 400 : 0));
    closeAll(w.cols, [300, 400]);
  });

  it('without a usable grid the measuring deps are part of the key ' +
    '(M1: new styles or fonts measure again)', () => {
    const t = tbl([['a', 'b']], [0, 0]);
    const s1 = {}, s2 = {}, m1 = {}, m2 = {};
    let calls = 0;
    const minOf = (k) => (r, kk) => { calls++; return kk ? k : 0; };
    const v = colsOf(t, null, 600, minOf(400), [s1, m1]);
    closeAll(v.cols, [300, 400]);
    assert.equal(colsOf(t, null, 600, minOf(400), [s1, m1]), v);
    const n = calls;
    closeAll(colsOf(t, null, 600, minOf(500), [s2, m1]).cols,
      [300, 500]);
    closeAll(colsOf(t, null, 600, minOf(550), [s1, m2]).cols,
      [300, 550]);
    assert.ok(calls > n, 'measured again');
  });

  it('a usable grid ignores the deps (nothing is measured)', () => {
    const t = tbl([['a', 'b']], [2000, 3000]);
    const v = colsOf(t, null, 600, () => 0, [{}, {}]);
    assert.equal(colsOf(t, null, 600, () => 0, [{}, {}]), v);
  });
});

describe('TblWidth: the 4000 px cap holds exactly (M2)', () => {
  const capped = (v) => {
    assert.ok(v.width <= MAX_PX + 1e-9, `width ${v.width}`);
    close(v.width, MAX_PX);
    close(v.cols.reduce((a, b) => a + b, 0), v.width);
    assert.ok(v.cols.every((c) => c >= 1), `${v.cols}`);
  };
  it('tcW 1e9 and one auto column', () => {
    const t = tbl([[cell(dxa(1e9)), 'b']], [0, 0]);
    capped(colsOf(t, null, 600, () => 0));
  });
  it('63 columns: three wide, 60 of 0 width', () => {
    const t = tbl([Array(63).fill('x')],
      [31680, 31680, 31680, ...Array(60).fill(0)]);
    const v = colsOf(t, null, 600);
    capped(v);
    v.cols.slice(3).forEach((c) => close(c, 1));
    close(v.cols[0], (4000 - 60) / 3);
  });
  it('columns scaled under 1 px are lifted and the rest shrink', () => {
    const t = tbl([Array(5).fill('x')], [31680, 31680, 31680, 10, 20]);
    const v = colsOf(t, null, 600);
    capped(v);
    close(v.cols[3], 1);
    close(v.cols[4], 1);
  });
});
