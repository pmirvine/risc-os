// TblCond: the conditional formatting of D16 and the cell layer as a
// derived style table (R6), Batch C2.2.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {rootScope} from '../../tools/moreapps/!Word/Ns';
import {readStyles} from '../../tools/moreapps/!Word/ReadStyles';
import {resolveRun, resolvePara}
  from '../../tools/moreapps/!Word/Styles';
import {newPara} from '../../tools/moreapps/!Word/Model';
import {viewOf} from '../../tools/moreapps/!Word/TblStyle';
import {lookOf, condsOf, bandsOf, layerOf, compatOf, stylesFor,
  MAX_BAND} from '../../tools/moreapps/!Word/TblCond';
import {stylesXml, settingsXml} from './build-docx.mjs';
import {TABLE_NORMAL, GRID_TABLE_4, LIST_TABLE_3}
  from './tbl-fixtures.mjs';

function stylesOf(xml) {
  const root = parseXml(stylesXml(xml)).root;
  return readStyles(root, rootScope(root));
}
const settings = (inner) => parseXml(settingsXml(inner)).root;
const DEFAULTS = '<w:docDefaults><w:rPrDefault><w:rPr>' +
  '<w:sz w:val="24"/><w:i/></w:rPr></w:rPrDefault><w:pPrDefault>' +
  '<w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/>' +
  '</w:pPr></w:pPrDefault></w:docDefaults>';
const normal = (rPr = '', pPr = '') => '<w:style w:type="paragraph" ' +
  'w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
  (pPr ? `<w:pPr>${pPr}</w:pPr>` : '') +
  (rPr ? `<w:rPr>${rPr}</w:rPr>` : '') + '</w:style>';
const BIG = '<w:style w:type="paragraph" w:styleId="Big">' +
  '<w:name w:val="Big"/><w:basedOn w:val="Normal"/><w:rPr>' +
  '<w:sz w:val="40"/></w:rPr></w:style>';
const ALL = {firstRow: false, lastRow: false, firstColumn: false,
  lastColumn: false, noHBand: false, noVBand: false};
const look = (o) => ({...ALL, ...o});
const B1 = {rows: 1, cols: 1};

describe('TblCond: lookOf', () => {
  it('absent: all false', () => {
    assert.deepEqual(lookOf({extra: []}), ALL);
    assert.deepEqual(lookOf(undefined), ALL);
    assert.deepEqual(lookOf({tblLook: {}}), ALL);
  });
  it('the hex alone is decoded', () => {
    assert.deepEqual(lookOf({tblLook: {val: '04A0'}}), look({
      firstRow: true, firstColumn: true, noVBand: true}));
    assert.deepEqual(lookOf({tblLook: {val: '07E0'}}), look({
      firstRow: true, lastRow: true, firstColumn: true,
      lastColumn: true, noHBand: true, noVBand: true}));
    assert.deepEqual(lookOf({tblLook: {val: '0000'}}), ALL);
    assert.deepEqual(lookOf({tblLook: {val: 'zz'}}), ALL);
  });
  it('booleans win over a disagreeing hex (TB5)', () => {
    assert.deepEqual(lookOf({tblLook: {val: '04A0', firstRow: false,
      lastRow: true}}), look({lastRow: true, firstColumn: true,
      noVBand: true}));
  });
});

describe('TblCond: condsOf', () => {
  const L = look({firstRow: true, firstColumn: true});
  it('a 4x4 with firstRow, firstColumn and bands', () => {
    assert.deepEqual(condsOf(L, 0, 0, 4, 4, B1),
      ['wholeTable', 'firstCol', 'firstRow', 'nwCell']);
    assert.deepEqual(condsOf(L, 1, 1, 4, 4, B1),
      ['wholeTable', 'band1Vert', 'band1Horz']);
    assert.deepEqual(condsOf(L, 2, 1, 4, 4, B1),
      ['wholeTable', 'band1Vert', 'band2Horz']);
    assert.deepEqual(condsOf(L, 1, 2, 4, 4, B1),
      ['wholeTable', 'band2Vert', 'band1Horz']);
    assert.deepEqual(condsOf(L, 0, 2, 4, 4, B1),
      ['wholeTable', 'band2Vert', 'firstRow']);
    assert.deepEqual(condsOf(L, 3, 0, 4, 4, B1),
      ['wholeTable', 'band1Horz', 'firstCol']);
  });
  it('band size 2 groups rows 1-2 / 3-4', () => {
    const b = {rows: 2, cols: 1};
    const h = (r) => condsOf(L, r, 0, 6, 4, b).find((x) =>
      /Horz/.test(x));
    assert.deepEqual([1, 2, 3, 4, 5].map(h), ['band1Horz', 'band1Horz',
      'band2Horz', 'band2Horz', 'band1Horz']);
    const noFirst = (r) => condsOf(ALL, r, 1, 4, 4, b).find((x) =>
      /Horz/.test(x));
    assert.deepEqual([0, 1, 2, 3].map(noFirst), ['band1Horz',
      'band1Horz', 'band2Horz', 'band2Horz']);
  });
  it('noHBand / noVBand remove the bands', () => {
    assert.deepEqual(condsOf(look({noHBand: true}), 1, 1, 4, 4, B1),
      ['wholeTable', 'band2Vert']);
    assert.deepEqual(condsOf(look({noHBand: true, noVBand: true}), 1,
      1, 4, 4, B1), ['wholeTable']);
  });
  it('last row and column, the corners', () => {
    const all = look({firstRow: true, lastRow: true, firstColumn: true,
      lastColumn: true, noHBand: true, noVBand: true});
    assert.deepEqual(condsOf(all, 3, 3, 4, 4, B1),
      ['wholeTable', 'lastCol', 'lastRow', 'seCell']);
    assert.deepEqual(condsOf(all, 0, 3, 4, 4, B1),
      ['wholeTable', 'lastCol', 'firstRow', 'neCell']);
    assert.deepEqual(condsOf(all, 3, 0, 4, 4, B1),
      ['wholeTable', 'firstCol', 'lastRow', 'swCell']);
    // a corner needs both of its flags
    assert.deepEqual(condsOf(look({firstRow: true, noHBand: true,
      noVBand: true}), 0, 0, 4, 4, B1), ['wholeTable', 'firstRow']);
    // a 1x1 table: every corner
    assert.deepEqual(condsOf(all, 0, 0, 1, 1, B1), ['wholeTable',
      'firstCol', 'lastCol', 'firstRow', 'lastRow', 'nwCell', 'neCell',
      'swCell', 'seCell']);
  });
  it('bands default to 1; bandsOf: the table over the style', () => {
    assert.deepEqual(condsOf(ALL, 1, 1, 4, 4),
      ['wholeTable', 'band2Vert', 'band2Horz']);
    const view = {tblPr: {tblStyleRowBandSize: 3,
      tblStyleColBandSize: 2, extra: []}};
    assert.deepEqual(bandsOf({extra: []}, view), {rows: 3, cols: 2});
    assert.deepEqual(bandsOf({tblStyleRowBandSize: 5, extra: []}, view),
      {rows: 5, cols: 2});
    assert.deepEqual(bandsOf({extra: []}, null), {rows: 1, cols: 1});
    for (const bad of [0, -1, MAX_BAND + 1, 1e9, NaN, 1.5, '2', null]) {
      assert.deepEqual(bandsOf({tblStyleRowBandSize: bad, extra: []},
        null), {rows: 1, cols: 1}, String(bad));
    }
    assert.deepEqual(bandsOf({tblStyleRowBandSize: MAX_BAND,
      extra: []}, null), {rows: MAX_BAND, cols: 1});
  });
});

describe('TblCond: layerOf', () => {
  const st = stylesOf(TABLE_NORMAL + GRID_TABLE_4 + LIST_TABLE_3);
  const view = viewOf(st, 'GridTable4');
  const L = look({firstRow: true, firstColumn: true});
  it('merged in D16\'s order', () => {
    const h = layerOf(view, L, 0, 1, 4, 4, B1);
    assert.equal(h.rPr.b, true);
    assert.equal(h.rPr.color, 'FFFFFF');
    assert.equal(h.tcPr.shd.fill, '000000'); // firstRow over band
    assert.deepEqual(h.pPr.spacing, {after: 0, line: 240,
      lineRule: 'auto'});
    const b = layerOf(view, L, 1, 1, 4, 4, B1);
    assert.equal(b.tcPr.shd.fill, 'CCCCCC');
    assert.equal(b.rPr.b, undefined);
    const plain = layerOf(view, L, 2, 2, 4, 4, B1);
    assert.equal(plain.tcPr.shd, undefined);
    // list table: the corner's border side over the row's
    const lv = viewOf(st, 'ListTable3');
    const nw = layerOf(lv, L, 0, 0, 4, 4, B1);
    assert.deepEqual(nw.tcPr.tcBorders.right, {val: 'nil'});
    assert.equal(nw.tcPr.shd.fill, '000000');
  });
  it('the SAME object for the same conditions', () => {
    const a = layerOf(view, L, 1, 1, 4, 4, B1);
    assert.equal(layerOf(view, L, 3, 3, 4, 4, B1), a);
    assert.notEqual(layerOf(view, L, 2, 1, 4, 4, B1), a);
    assert.ok(Object.isFrozen(a) && Object.isFrozen(a.rPr));
  });
  it('no view: one empty layer', () => {
    const e = layerOf(null, L, 0, 0, 4, 4, B1);
    assert.equal(layerOf(null, ALL, 2, 2, 3, 3, B1), e);
    assert.deepEqual(e.tcPr, {extra: []});
  });
});

describe('TblCond: compatOf', () => {
  it('reads w:compat (element or compatSetting); absent off', () => {
    assert.equal(compatOf({rawSettings: null}), false);
    assert.equal(compatOf(null), false);
    assert.equal(compatOf({rawSettings: settings('')}), false);
    assert.equal(compatOf({rawSettings: settings('<w:compat>' +
      '<w:overrideTableStyleFontSizeAndJustification/></w:compat>')}),
    true);
    assert.equal(compatOf({rawSettings: settings('<w:compat>' +
      '<w:overrideTableStyleFontSizeAndJustification w:val="0"/>' +
      '</w:compat>')}), false);
    const set = (v) => settings('<w:compat><w:compatSetting ' +
      'w:name="compatibilityMode" w:uri="http://schemas.microsoft.com' +
      '/office/word" w:val="15"/><w:compatSetting w:name="override' +
      'TableStyleFontSizeAndJustification" w:uri="http://schemas.' +
      `microsoft.com/office/word" w:val="${v}"/></w:compat>`);
    assert.equal(compatOf({rawSettings: set('1')}), true);
    assert.equal(compatOf({rawSettings: set('0')}), false);
    assert.equal(compatOf({rawSettings: set('x')}), false);
    // elsewhere than in w:compat: not the switch
    assert.equal(compatOf({rawSettings: settings(
      '<w:overrideTableStyleFontSizeAndJustification/>')}), false);
  });
  it('cached per settings root; hostile nodes', () => {
    const root = settings('<w:compat><w:overrideTableStyleFontSize' +
      'AndJustification/></w:compat>');
    assert.equal(compatOf({rawSettings: root}), true);
    root.children.length = 0; // never done to a live root
    assert.equal(compatOf({rawSettings: root}), true);
    assert.equal(compatOf({rawSettings: {}}), false);
    assert.equal(compatOf({rawSettings: {name: 'w:settings', attrs: [],
      children: [null, 7, 'x', {name: 'w:compat'}]}}), false);
  });
});

describe('TblCond: stylesFor (R6)', () => {
  const layerSz = (sz, jc) => Object.freeze({tcPr: {extra: []},
    pPr: jc ? {jc, extra: []} : {extra: []},
    rPr: {sz, extra: []}});
  const st = stylesOf(DEFAULTS + normal('<w:sz w:val="22"/>',
    '<w:jc w:val="left"/>') + BIG);
  const para = newPara('x');
  const run = para.runs ? para.runs[0] || {} : {};
  it('compat ON: the table style\'s sz / jc over Normal\'s', () => {
    const d = stylesFor(st, layerSz(18, 'center'), true);
    assert.equal(resolveRun(d, para, run).sz, 18);
    assert.equal(resolvePara(d, para).jc, 'center');
  });
  it('compat OFF: Normal\'s win', () => {
    const d = stylesFor(st, layerSz(18, 'center'), false);
    assert.equal(resolveRun(d, para, run).sz, 22);
    assert.equal(resolvePara(d, para).jc, 'left');
  });
  it('a paragraph style with its own sz wins either way', () => {
    const big = {...para, pStyle: 'Big'};
    for (const c of [true, false]) {
      assert.equal(resolveRun(stylesFor(st, layerSz(18), c), big, run)
        .sz, 40);
    }
  });
  it('docDefaults merged, not replaced; the table unchanged', () => {
    const d = stylesFor(st, layerSz(18), true);
    assert.equal(d.docDefaults.rPr.sz, 18);
    assert.equal(d.docDefaults.rPr.i, true);
    assert.deepEqual(d.docDefaults.pPr.spacing, {after: 160, line: 259,
      lineRule: 'auto'});
    assert.equal(st.docDefaults.rPr.sz, 24);
    assert.equal(st.styles.get('Normal').rPr.sz, 22);
    assert.equal(d.styles.get('Big'), st.styles.get('Big'));
    // the layer's spacing over the defaults'
    const sp = stylesFor(st, Object.freeze({tcPr: {extra: []},
      pPr: {spacing: {after: 0}, extra: []}, rPr: {extra: []}}), false);
    assert.deepEqual(resolvePara(sp, para).spacing, {after: 0,
      line: 259, lineRule: 'auto'});
  });
  it('compat ON leaves Normal\'s other fields and sides alone', () => {
    const d = stylesFor(st, layerSz(18), true);
    assert.equal(resolvePara(d, para).jc, 'left'); // layer has no jc
  });
  it('memoised per (styles, layer, compat)', () => {
    const l = layerSz(18, 'center');
    const on = stylesFor(st, l, true);
    assert.equal(stylesFor(st, l, true), on);
    const off = stylesFor(st, l, false);
    assert.equal(stylesFor(st, l, false), off);
    assert.notEqual(on, off);
    assert.notEqual(stylesFor(st, layerSz(18, 'center'), true), on);
  });
  it('an empty layer gives the table itself', () => {
    const e = layerOf(null, ALL, 0, 0, 1, 1, B1);
    assert.equal(stylesFor(st, e, true), st);
    assert.equal(stylesFor(st, e, false), st);
  });
  it('a real cell: GridTable4 header under compat', () => {
    const s2 = stylesOf(DEFAULTS + normal('<w:sz w:val="22"/>') +
      TABLE_NORMAL + GRID_TABLE_4);
    const v = viewOf(s2, 'GridTable4');
    const layer = layerOf(v, look({firstRow: true}), 0, 0, 2, 2, B1);
    const d = stylesFor(s2, layer, true);
    const f = resolveRun(d, para, run);
    assert.equal(f.b, true);
    assert.equal(f.color, 'FFFFFF');
    assert.equal(f.sz, 22); // the style gives no sz: Normal's
    assert.equal(resolvePara(d, para).spacing.after, 0);
  });
});
