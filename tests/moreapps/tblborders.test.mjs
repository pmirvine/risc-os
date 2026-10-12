// A table's resolved cell borders (Batch C2.5, D22, TB3): every cell
// side from its tcBorders, else the style's conditional / whole-table
// tcBorders (a region's outer sides, insideH / insideV within it),
// else the table's (outer sides on the outer edges, insideH / insideV
// inside; direct over style); where two cells share an edge (no cell
// spacing) ECMA-376 17.4.66 decides: the heavier (eighths x lines),
// then Word's precedence list, then the darker colour (R + B + 2G),
// then the cell above / to the left; nil and none lose to any border.
// With cell spacing each cell has its own four sides and the table an
// outer box. Themed sides are shown by their literal colour
// (TblColor.showThemed) and kept raw in the model.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {edgesOf, sidesOf, weightOf, conflict, PRECEDENCE}
  from '../../tools/moreapps/!Letters/TblBorders';
import {loadStyles, tm} from './word-docs.mjs';
import {tblDocx, tbl, tr, tc, TABLE_NORMAL, TABLE_GRID, GRID_TABLE_4,
  bigTable} from './tbl-fixtures.mjs';
import {p, r} from './build-docx.mjs';

before(loadStyles);

const S = (side, val, sz, color = '000000', more = '') =>
  `<w:${side} w:val="${val}"` + (sz === undefined ? '' : ` w:sz="${sz}"`) +
  ` w:space="0" w:color="${color}"${more}/>`;
const BDR = (...sides) => `<w:tcBorders>${sides.join('')}</w:tcBorders>`;
const cell = (text, tcPr = '') => tc(p(r(text)), {tcPr});

/** The laid-out 'tbl' item of a document whose body is `body`. */
async function table(body, styles) {
  const doc = await readDocx(await tblDocx(body, styles === undefined ? {}
    : {styles}));
  const L = new DocLayout(doc, tm());
  L.layout(800);
  const it = L.items.find((x) => x.kind === 'tbl');
  return {L, it, doc, map: L.ns, E: edgesOf(it, L.ns)};
}
/** The vertical edge of row r at x (px from the table's left). */
const vAt = (E, r, x) => E.v[r].find((e) => Math.abs(e.x - x) < 0.5);
const COL = 2000 / 15;                 // a 2000-twip grid column, px

describe('weights and the precedence list', () => {
  it('weightOf: eighths x the style\'s line count', () => {
    assert.equal(weightOf({val: 'single', sz: 4}), 4);
    assert.equal(weightOf({val: 'double', sz: 6}), 12);
    assert.equal(weightOf({val: 'triple', sz: 4}), 12);
    assert.equal(weightOf({val: 'thinThickSmallGap', sz: 4}), 8);
    assert.equal(weightOf({val: 'thickThinLargeGap', sz: 6}), 12);
    assert.equal(weightOf({val: 'thinThickThinMediumGap', sz: 3}), 6);
    assert.equal(weightOf({val: 'dotted', sz: 24}), 24);
    assert.equal(weightOf({val: 'nil', sz: 24}), 0);
    assert.equal(weightOf({val: 'none'}), 0);
    assert.equal(weightOf(null), 0);
    assert.equal(weightOf(undefined), 0);
  });
  it('hostile sizes and names: sz missing or bad 4, clamped 2..96; ' +
    'an unknown style counts one line and ranks last', () => {
    assert.equal(weightOf({val: 'single'}), 4);
    assert.equal(weightOf({val: 'single', sz: NaN}), 4);
    assert.equal(weightOf({val: 'single', sz: 1.5}), 4);
    assert.equal(weightOf({val: 'single', sz: 1e9}), 96);
    assert.equal(weightOf({val: 'single', sz: -1}), 2);
    assert.equal(weightOf({val: 'single', sz: 0}), 2);
    assert.equal(weightOf({val: '__proto__', sz: 4}), 0, 'not a name');
    assert.equal(weightOf({val: 'constructor', sz: 4}), 4);
    assert.equal(weightOf({val: 7, sz: 4}), 0);
    const u = {val: 'apples', sz: 4}, s = {val: 'single', sz: 4};
    assert.equal(conflict(u, s), s);
    assert.equal(conflict(s, u), s);
    assert.equal(conflict({val: 'constructor', sz: 4}, s), s);
  });
  it('PRECEDENCE is D22\'s list, frozen', () => {
    assert.deepEqual(PRECEDENCE.slice(0, 8), ['single', 'thick', 'double',
      'dotted', 'dashed', 'dotDash', 'dotDotDash', 'triple']);
    assert.deepEqual(PRECEDENCE.slice(-8), ['wave', 'doubleWave',
      'dashSmallGap', 'dashDotStroked', 'threeDEmboss', 'threeDEngrave',
      'outset', 'inset']);
    assert.ok(PRECEDENCE.indexOf('thinThickSmallGap') >
      PRECEDENCE.indexOf('triple'));
    assert.ok(PRECEDENCE.indexOf('thinThickThinLargeGap') <
      PRECEDENCE.indexOf('wave'));
    assert.equal(PRECEDENCE.at(-1), 'inset');
    assert.equal(PRECEDENCE.length, 25);
    assert.ok(Object.isFrozen(PRECEDENCE));
  });
});

describe('TB3: neighbours sharing an edge (no cell spacing)', () => {
  /** The shared vertical edge of a 1x2 whose cells' sides are a, b. */
  async function shared(a, b) {
    const {E} = await table(tbl([tr([cell('a', BDR(a)),
      cell('b', BDR(b))])]));
    const e = vAt(E, 0, COL);
    return e ? e.side : null;
  }
  it('single 4 vs double 6 -> double (weight 12 > 4)', async () => {
    const s = await shared(S('right', 'single', 4), S('left', 'double', 6));
    assert.equal(s.val, 'double');
    const t = await shared(S('right', 'double', 6), S('left', 'single', 4));
    assert.equal(t.val, 'double');
  });
  it('thick 12 vs double 6 -> equal weight 12, thick (earlier in the ' +
    'list)', async () => {
    assert.equal((await shared(S('right', 'double', 6),
      S('left', 'thick', 12))).val, 'thick');
    assert.equal((await shared(S('right', 'thick', 12),
      S('left', 'double', 6))).val, 'thick');
  });
  it('dotted 24 vs single 4 -> dotted (24)', async () => {
    assert.equal((await shared(S('right', 'single', 4),
      S('left', 'dotted', 24))).val, 'dotted');
  });
  it('same style and width: the darker colour by R + B + 2G', async () => {
    // green 2 x 255 = 510 against red 255: red is darker
    const s = await shared(S('right', 'single', 4, '00FF00'),
      S('left', 'single', 4, 'FF0000'));
    assert.equal(s.color, 'FF0000');
    // auto is black, darker than any colour
    const a = await shared(S('right', 'single', 4, '010101'),
      S('left', 'single', 4, 'auto'));
    assert.equal(a.color, 'auto');
    // FF0000 against 0000FF: 255 each, a full tie: the left cell's
    const t = await shared(S('right', 'single', 4, 'FF0000'),
      S('left', 'single', 4, '0000FF'));
    assert.equal(t.color, 'FF0000');
    const u = await shared(S('right', 'single', 4, '0000FF'),
      S('left', 'single', 4, 'FF0000'));
    assert.equal(u.color, '0000FF');
  });
  it('nil (or none) vs single -> single; nil vs nil -> no edge',
    async () => {
      assert.equal((await shared(S('right', 'nil'),
        S('left', 'single', 4))).val, 'single');
      assert.equal((await shared(S('right', 'single', 4),
        S('left', 'none', 4))).val, 'single');
      assert.equal(await shared(S('right', 'nil'), S('left', 'nil')),
        null);
    });
  it('the cell above wins a full tie', async () => {
    const {E} = await table(tbl([
      tr([cell('a', BDR(S('bottom', 'single', 4, 'FF0000')))]),
      tr([cell('b', BDR(S('top', 'single', 4, '0000FF')))])]));
    assert.equal(E.h[1].length, 1);
    assert.equal(E.h[1][0].side.color, 'FF0000');
    const {E: F} = await table(tbl([
      tr([cell('a', BDR(S('bottom', 'single', 4, '0000FF')))]),
      tr([cell('b', BDR(S('top', 'single', 8, 'FF0000')))])]));
    assert.equal(F.h[1][0].side.color, 'FF0000', 'the heavier below');
  });
  it('conflict() directly: a missing side loses; the order', () => {
    const s = {val: 'single', sz: 4};
    assert.equal(conflict(null, s), s);
    assert.equal(conflict(s, undefined), s);
    assert.equal(conflict(null, null), null);
    assert.equal(conflict({val: 'nil'}, {val: 'none'}), null);
  });
});

describe('where a side comes from', () => {
  it('Table Grid: the style\'s six sides; every grid line one edge; ' +
    'outer sides top / left / bottom / right, inside insideH / insideV',
  async () => {
    const tblPr = '<w:tblStyle w:val="TableGrid"/>';
    const rows = [0, 1, 2].map((i) => tr([0, 1, 2].map((j) =>
      cell(`r${i}c${j}`))));
    const {E, it} = await table(tbl(rows, {tblPr}),
      TABLE_NORMAL + TABLE_GRID);
    for (let r0 = 0; r0 <= 3; r0++) {
      assert.equal(E.h[r0].length, 1, `one segment across, h${r0}`);
      assert.equal(E.h[r0][0].x0, 0);
      assert.ok(Math.abs(E.h[r0][0].x1 - 3 * COL) < 1e-6);
      assert.equal(E.h[r0][0].side.val, 'single');
    }
    for (let r0 = 0; r0 < 3; r0++) {
      assert.deepEqual(E.v[r0].map((e) => Math.round(e.x)),
        [0, 133, 267, 400]);
    }
    assert.equal(it.rows.length, 3);
    // a direct table border beats the style's
    const {E: F} = await table(tbl(rows, {tblPr: tblPr + '<w:tblBorders>' +
      S('insideV', 'double', 4, '00FF00') + '</w:tblBorders>'}),
    TABLE_NORMAL + TABLE_GRID);
    assert.equal(vAt(F, 1, COL).side.val, 'double');
    assert.equal(vAt(F, 1, 0).side.val, 'single', 'left: the style\'s');
  });
  it('a cell\'s own tcBorders side beats the table\'s', async () => {
    // (sides in schema order: else the reader keeps tblBorders raw)
    const tblPr = '<w:tblBorders>' + S('left', 'single', 4) +
      S('insideV', 'single', 4) + '</w:tblBorders>';
    const {E} = await table(tbl([tr([cell('a', BDR(S('left', 'dotted', 4))),
      cell('b')])], {tblPr}));
    assert.equal(vAt(E, 0, 0).side.val, 'dotted');
    assert.equal(vAt(E, 0, COL).side.val, 'single');
  });
  it('a conditional firstRow bottom border over the style\'s insideH',
    async () => {
      const style = '<w:style w:type="table" w:styleId="T"><w:name ' +
        'w:val="T"/><w:tblPr><w:tblBorders>' +
        S('insideH', 'single', 4, '0000FF') + '</w:tblBorders></w:tblPr>' +
        '<w:tblStylePr w:type="firstRow"><w:tcPr>' +
        BDR(S('bottom', 'single', 4, 'FF0000')) + '</w:tcPr>' +
        '</w:tblStylePr></w:style>';
      const tblPr = '<w:tblStyle w:val="T"/><w:tblLook w:val="0020" ' +
        'w:firstRow="1" w:lastRow="0" w:firstColumn="0" ' +
        'w:lastColumn="0" w:noHBand="1" w:noVBand="1"/>';
      const rows = [0, 1, 2].map((i) => tr([cell(`a${i}`), cell(`b${i}`)]));
      const {E, it, map} = await table(tbl(rows, {tblPr}),
        TABLE_NORMAL + style);
      assert.equal(sidesOf(it, 0, 0, map).bottom.color, 'FF0000');
      assert.equal(sidesOf(it, 1, 0, map).top.color, '0000FF');
      // same weight, style; red (255) vs blue (255): the cell above
      assert.equal(E.h[1][0].side.color, 'FF0000');
      assert.equal(E.h[2][0].side.color, '0000FF', 'below: insideH');
      assert.equal(E.h[0].length, 0, 'no top border anywhere');
    });
  it('Grid Table 4 (Word\'s, themed): the header row\'s region has ' +
    'no inside vertical (insideV nil), the body rows have; the ' +
    'literal colours', async () => {
    const tblPr = '<w:tblStyle w:val="GridTable4"/><w:tblW w:w="0" ' +
      'w:type="auto"/><w:tblLook w:val="04A0" w:firstRow="1" ' +
      'w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" ' +
      'w:noVBand="1"/>';
    const rows = [0, 1, 2].map((i) => tr([0, 1, 2].map((j) =>
      cell(`r${i}c${j}`))));
    const {E, it, map} = await table(tbl(rows, {tblPr}),
      TABLE_NORMAL + GRID_TABLE_4);
    assert.equal(vAt(E, 0, COL), undefined, 'header: no inner line');
    assert.equal(vAt(E, 0, 2 * COL), undefined);
    assert.equal(vAt(E, 0, 0).side.color, '000000', 'header left: text1');
    assert.equal(vAt(E, 1, COL).side.color, '666666', 'body insideV');
    assert.equal(sidesOf(it, 0, 1, map).left.val, 'nil');
    // the header's bottom (black, text1) against the body's insideH
    assert.equal(E.h[1][0].side.color, '000000');
    assert.equal(E.h[2][0].side.color, '666666');
    // nothing written changed: the style keeps its raw XML
    assert.ok(it.key.view.tblPr.extra.length > 0);
  });
  it('a themed side of the cell\'s own is shown by its literal ' +
    'colour, and stays raw in the model', async () => {
    const side = S('right', 'single', 12, 'FF0000',
      ' w:themeColor="accent2" w:themeShade="BF"');
    const {E, it, map, doc} = await table(tbl([tr([cell('a', BDR(side)),
      cell('b')])]));
    assert.equal(vAt(E, 0, COL).side.color, 'FF0000');
    assert.equal(sidesOf(it, 0, 0, map).right.sz, 12);
    const tcPr = doc.sections[0].blocks[0].rows[0].cells[0].tcPr;
    assert.equal(tcPr.tcBorders, undefined, 'the model keeps it raw');
    assert.equal(tcPr.extra.length, 1);
    // a direct table side themed: the same
    const tb = '<w:tblBorders>' + S('top', 'double', 4, '00FF00',
      ' w:themeColor="accent6"') + '</w:tblBorders>';
    const {E: F} = await table(tbl([tr([cell('a')])], {tblPr: tb}));
    assert.equal(F.h[0][0].side.val, 'double');
    assert.equal(F.h[0][0].side.color, '00FF00');
  });
  it('diagonals: tl2br / tr2bl of the cell, else its layer', async () => {
    const {E} = await table(tbl([tr([cell('a', BDR(S('tl2br', 'single', 8,
      'FF0000'), S('tr2bl', 'nil'))), cell('b')])]));
    assert.equal(E.diag[0].length, 1);
    assert.equal(E.diag[0][0].k, 0);
    assert.equal(E.diag[0][0].tl2br.color, 'FF0000');
    assert.equal(E.diag[0][0].tr2bl, null);
  });
});

describe('merges, spacing, memo', () => {
  it('a merged cell spans: no edge inside it', async () => {
    const tblPr = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right',
      'insideH', 'insideV'].map((s) => S(s, 'single', 4)).join('') +
      '</w:tblBorders>';
    const {E} = await table(tbl([
      tr([cell('wide', '<w:gridSpan w:val="2"/>'), cell('c')]),
      tr([cell('tall', '<w:vMerge w:val="restart"/>'), cell('x'),
        cell('y')]),
      tr([cell('', '<w:vMerge/>'), cell('z'), cell('w')])], {tblPr}));
    assert.equal(vAt(E, 0, COL), undefined, 'gridSpan: none inside');
    assert.ok(vAt(E, 0, 2 * COL));
    assert.ok(vAt(E, 1, COL));
    // between rows 1 and 2: not under the vertical merge
    assert.equal(E.h[2].length, 1);
    assert.ok(Math.abs(E.h[2][0].x0 - COL) < 1e-6);
    assert.ok(Math.abs(E.h[2][0].x1 - 3 * COL) < 1e-6);
    assert.equal(E.h[1].length, 1, 'one segment, all single');
  });
  it('cell spacing 20: four sides per cell plus the outer box',
    async () => {
      const tblPr = '<w:tblCellSpacing w:w="20" w:type="dxa"/>' +
        '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH',
        'insideV'].map((s) => S(s, 'single', 4, s === 'top' ? 'FF0000'
          : s === 'insideV' ? '00FF00' : '000000')).join('') +
        '</w:tblBorders>';
      const {E} = await table(tbl([tr([cell('a'), cell('b')]),
        tr([cell('c'), cell('d')])], {tblPr}));
      for (let r0 = 0; r0 < 2; r0++) {
        assert.equal(E.own[r0].length, 2);
        assert.deepEqual(E.v[r0], []);
        for (const o of E.own[r0]) {
          for (const s of ['top', 'left', 'bottom', 'right']) {
            assert.equal(o[s].val, 'single', `${r0} ${o.k} ${s}`);
          }
          assert.equal(o.left.color, '00FF00', 'inside: insideV');
        }
      }
      for (let r0 = 0; r0 <= 2; r0++) assert.deepEqual(E.h[r0], []);
      assert.equal(E.box.top.color, 'FF0000');
      assert.equal(E.box.left.val, 'single');
      assert.equal(E.box.bottom.val, 'single');
      assert.equal(E.box.right.val, 'single');
      const {E: F} = await table(tbl([tr([cell('a')])]));
      assert.equal(F.box, null, 'no spacing: no outer box');
    });
  it('memoised with the row geometry: the same rows\' edges are the ' +
    'same arrays after a re-layout; a range gives only its rows',
  async () => {
    const tblPr = '<w:tblBorders>' + S('insideH', 'single', 4) +
      S('insideV', 'single', 4) + '</w:tblBorders>';
    const {L, it, map} = await table(bigTable(50, 3).replace(
      '<w:tblPr></w:tblPr>', `<w:tblPr>${tblPr}</w:tblPr>`));
    const a = edgesOf(it, map, 10, 20);
    assert.equal(a.v[9], undefined);
    assert.equal(a.v[21], undefined);
    assert.equal(a.h[22], undefined);
    assert.ok(a.v[10].length && a.h[21].length);
    const M = new DocLayout(L.doc, L.metrics, L);
    M.layout(800);
    const it2 = M.items.find((x) => x.kind === 'tbl');
    assert.notEqual(it2, it);
    assert.equal(it2.rows[15].geo, it.rows[15].geo);
    const b = edgesOf(it2, map, 10, 20);
    assert.equal(b.v[15], a.v[15]);
    assert.equal(b.h[15], a.h[15]);
    const all = edgesOf(it2, map);
    assert.equal(all.v.length, 50);
    assert.equal(all.h.length, 51);
  });
  it('a 1000 x 5 table\'s edges: < 100 ms the first time, the second ' +
    'from the memo', async () => {
    const {it, map} = await table(bigTable(1000, 5));
    const t0 = performance.now();
    edgesOf(it, map);
    const t1 = performance.now();
    edgesOf(it, map);
    const t2 = performance.now();
    assert.ok(t1 - t0 < 100, `${t1 - t0} ms`);
    assert.ok(t2 - t1 < t1 - t0 + 5, `${t2 - t1} ms`);
  });
});
