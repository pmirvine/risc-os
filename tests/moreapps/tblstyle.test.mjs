// TblStyle: table styles read into views (D15, R7), Batch C2.2.
// Read only: a view of a style's w:tblPr / w:trPr / w:tcPr / pPr /
// rPr and its w:tblStylePr conditions, basedOn merged child over
// parent, memoised per Style object.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {rootScope, wName}
  from '../../tools/moreapps/!Word/Ns';
import {readStyles} from '../../tools/moreapps/!Word/ReadStyles';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {withStyle} from '../../tools/moreapps/!Word/DocParts';
import {viewOf, tableStyleId, COND_TYPES, MAX_LINKS}
  from '../../tools/moreapps/!Word/TblStyle';
import {stylesXml, p} from './build-docx.mjs';
import {TABLE_NORMAL, TABLE_GRID, GRID_TABLE_4, LIST_TABLE_3,
  styleFromCorpus, modelTable, tblDocx, tbl, tr, tc}
  from './tbl-fixtures.mjs';

/** A StyleTable read from w:style XML strings. */
function stylesOf(xml) {
  const root = parseXml(stylesXml(xml)).root;
  return readStyles(root, rootScope(root));
}
const table = (id, inner, basedOn) =>
  `<w:style w:type="table" w:styleId="${id}"><w:name w:val="${id}"/>` +
  (basedOn ? `<w:basedOn w:val="${basedOn}"/>` : '') + inner +
  '</w:style>';
const shdXml = (fill, more = '') =>
  `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"${more}/>`;
const cond = (type, inner) =>
  `<w:tblStylePr w:type="${type}">${inner}</w:tblStylePr>`;
const NORMAL = '<w:style w:type="paragraph" w:default="1" ' +
  'w:styleId="Normal"><w:name w:val="Normal"/></w:style>';
const side = (color) => ({val: 'single', sz: 4, space: 0, color});

describe('TblStyle: reading a table style', () => {
  it('ReadStyles keeps tblPr / tblStylePr in extra (R7)', async () => {
    const st = stylesOf(TABLE_NORMAL + GRID_TABLE_4);
    const s = st.styles.get('GridTable4');
    const m = rootScope(parseXml(stylesXml('')).root);
    const names = s.extra.map((n) => wName(n, m));
    assert.ok(names.includes('tblPr'));
    assert.equal(names.filter((n) => n === 'tblStylePr').length, 6);
    // and through readDocx, as the layout sees it
    const doc = await readDocx(await tblDocx(p(), {styles:
      TABLE_NORMAL + GRID_TABLE_4}));
    assert.ok(viewOf(doc.styles, 'GridTable4'));
  });

  it('GRID_TABLE_4: borders, firstRow bold and shading, bands', () => {
    const st = stylesOf(TABLE_NORMAL + GRID_TABLE_4);
    const v = viewOf(st, 'GridTable4');
    const b = v.tblPr.tblBorders;
    for (const k of ['top', 'left', 'bottom', 'right', 'insideH',
      'insideV']) assert.deepEqual(b[k], side('666666'), k);
    assert.equal(v.tblPr.tblStyleRowBandSize, 1);
    assert.equal(v.tblPr.tblStyleColBandSize, 1);
    // TableNormal's margins and indent come through basedOn
    assert.deepEqual(v.tblPr.tblCellMar.left, {w: 108, type: 'dxa'});
    assert.deepEqual(v.tblPr.tblInd, {w: 0, type: 'dxa'});
    assert.deepEqual(v.pPr.spacing, {after: 0, line: 240,
      lineRule: 'auto'});
    const fr = v.cond.get('firstRow');
    assert.equal(fr.rPr.b, true);
    assert.equal(fr.rPr.color, 'FFFFFF');
    assert.deepEqual(fr.tcPr.shd, {val: 'clear', color: 'auto',
      fill: '000000'});
    assert.deepEqual(fr.tcPr.tcBorders.insideH, {val: 'nil'});
    assert.equal(v.cond.get('band1Horz').tcPr.shd.fill, 'CCCCCC');
    assert.equal(v.cond.get('band1Vert').tcPr.shd.fill, 'CCCCCC');
    assert.equal(v.cond.get('lastRow').tcPr.tcBorders.top.val,
      'double');
    assert.equal(v.cond.has('band2Horz'), false);
    for (const k of ['tblPr', 'trPr', 'tcPr', 'pPr', 'rPr']) {
      assert.ok(fr[k] && Array.isArray(fr[k].extra), k);
      assert.ok(v[k] && Array.isArray(v[k].extra), k);
    }
  });

  it('LIST_TABLE_3 and TABLE_GRID read', () => {
    const st = stylesOf(TABLE_NORMAL + TABLE_GRID + LIST_TABLE_3);
    const g = viewOf(st, 'TableGrid');
    assert.deepEqual(g.tblPr.tblBorders.insideV, side('auto'));
    assert.equal(g.cond.size, 0);
    const l = viewOf(st, 'ListTable3');
    assert.equal(l.tblPr.tblBorders.insideH, undefined);
    assert.equal(l.cond.get('firstRow').tcPr.shd.fill, '000000');
    assert.deepEqual(l.cond.get('nwCell').tcPr.tcBorders,
      {right: {val: 'nil'}});
    assert.deepEqual(l.cond.get('band1Horz').tcPr.tcBorders.top,
      side('000000'));
  });

  it('basedOn: the child over the parent, by type then field', () => {
    const child = table('Child', cond('firstRow', '<w:tcPr>' +
      shdXml('FF0000') + '</w:tcPr>') + cond('lastCol',
      '<w:rPr><w:i/></w:rPr>'), 'GridTable4');
    const v = viewOf(stylesOf(TABLE_NORMAL + GRID_TABLE_4 + child),
      'Child');
    const fr = v.cond.get('firstRow');
    assert.equal(fr.tcPr.shd.fill, 'FF0000');
    assert.equal(fr.rPr.b, true); // the parent's
    assert.deepEqual(fr.tcPr.tcBorders.top, side('000000'));
    const lc = v.cond.get('lastCol');
    assert.equal(lc.rPr.b, true);
    assert.equal(lc.rPr.i, true);
    assert.deepEqual(v.tblPr.tblBorders.top, side('666666'));
  });

  it('borders and margins merge side by side', () => {
    const parent = table('P', '<w:tblPr><w:tblBorders>' +
      '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
      '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
      '</w:tblBorders></w:tblPr>');
    const child = table('C', '<w:tblPr><w:tblBorders>' +
      '<w:top w:val="double" w:sz="6" w:space="0" w:color="auto"/>' +
      '</w:tblBorders></w:tblPr>', 'P');
    const v = viewOf(stylesOf(parent + child), 'C');
    assert.equal(v.tblPr.tblBorders.top.val, 'double');
    assert.equal(v.tblPr.tblBorders.left.val, 'single');
  });

  it('a basedOn cycle terminates; a missing basedOn', () => {
    const a = table('A', '<w:tblPr><w:tblStyleRowBandSize w:val="2"/>' +
      '</w:tblPr>', 'B');
    const b = table('B', '<w:tblPr><w:tblStyleRowBandSize w:val="3"/>' +
      '<w:tblStyleColBandSize w:val="4"/></w:tblPr>', 'A');
    const st = stylesOf(a + b);
    const v = viewOf(st, 'A');
    assert.equal(v.tblPr.tblStyleRowBandSize, 2);
    assert.equal(v.tblPr.tblStyleColBandSize, 4);
    assert.equal(viewOf(st, 'B').tblPr.tblStyleRowBandSize, 3);
    const lone = table('L', '<w:tblPr><w:tblStyleRowBandSize ' +
      'w:val="5"/></w:tblPr>', 'Nope');
    assert.equal(viewOf(stylesOf(lone), 'L').tblPr.tblStyleRowBandSize,
      5);
    // a self cycle
    const self = table('S', '', 'S');
    assert.ok(viewOf(stylesOf(self), 'S'));
  });

  it('a chain longer than MAX_LINKS stops there', () => {
    let xml = '';
    const n = MAX_LINKS + 10;
    for (let k = 0; k < n; k++) {
      xml += table('T' + k, k === n - 1 ? '<w:tblPr>' +
        '<w:tblStyleRowBandSize w:val="9"/></w:tblPr>' : '',
      k ? 'T' + (k - 1) : undefined);
    }
    // T(n-1) holds the field; its 64-link chain never reaches T0
    const st = stylesOf(xml);
    assert.equal(viewOf(st, 'T' + (n - 1)).tblPr
      .tblStyleRowBandSize, 9);
    xml = '';
    for (let k = 0; k < n; k++) {
      xml += table('T' + k, k === 0 ? '<w:tblPr>' +
        '<w:tblStyleRowBandSize w:val="9"/></w:tblPr>' : '',
      k ? 'T' + (k - 1) : undefined);
    }
    const st2 = stylesOf(xml);
    assert.equal(viewOf(st2, 'T' + (MAX_LINKS - 1)).tblPr
      .tblStyleRowBandSize, 9);
    assert.equal(viewOf(st2, 'T' + MAX_LINKS).tblPr
      .tblStyleRowBandSize, undefined);
  });

  it('not a table style -> null', () => {
    const st = stylesOf(NORMAL + TABLE_NORMAL);
    assert.equal(viewOf(st, 'Normal'), null);
    assert.equal(viewOf(st, 'Missing'), null);
    assert.equal(viewOf(st, null), null);
    assert.equal(viewOf(st, undefined), null);
    assert.equal(viewOf(st, '__proto__'), null);
    assert.equal(viewOf(null, 'TableNormal'), null);
    // a table style based on a paragraph style: the chain stops
    const t = table('T', '<w:tblPr><w:tblStyleRowBandSize w:val="2"/>' +
      '</w:tblPr>', 'Normal');
    assert.equal(viewOf(stylesOf(NORMAL + t), 'T').tblPr
      .tblStyleRowBandSize, 2);
  });

  it('memoised per Style object and its chain', () => {
    const st = stylesOf(TABLE_NORMAL + GRID_TABLE_4);
    const v = viewOf(st, 'GridTable4');
    assert.equal(viewOf(st, 'GridTable4'), v);
    // a new table holding the same Style objects: the same view
    const st2 = withStyle(st, {id: 'Other', type: 'paragraph'});
    assert.notEqual(st2, st);
    assert.equal(viewOf(st2, 'GridTable4'), v);
    // the parent replaced: a new view
    const tn = st.styles.get('TableNormal');
    const st3 = withStyle(st, {...tn, raw: null, extra: []},
      {replace: true});
    const v3 = viewOf(st3, 'GridTable4');
    assert.notEqual(v3, v);
    assert.equal(v3.tblPr.tblCellMar, undefined);
    assert.equal(viewOf(st, 'GridTable4'), v);
    assert.equal(viewOf(st3, 'GridTable4'), v3);
  });

  it('a themed colour is shown by its literal colour', () => {
    const t = table('T', '<w:tblPr><w:tblBorders><w:top ' +
      'w:val="single" w:sz="4" w:space="0" w:color="45B0E1" ' +
      'w:themeColor="accent1" w:themeTint="99"/>' +
      '</w:tblBorders></w:tblPr>' + cond('firstRow', '<w:rPr>' +
      '<w:color w:val="FFFFFF" w:themeColor="background1"/></w:rPr>' +
      '<w:tcPr>' + shdXml('156082', ' w:themeFill="accent1" ' +
      'w:themeFillShade="BF"') + '</w:tcPr>'));
    const st = stylesOf(t);
    const v = viewOf(st, 'T');
    assert.deepEqual(v.tblPr.tblBorders, {top: side('45B0E1')});
    const fr = v.cond.get('firstRow');
    assert.deepEqual(fr.tcPr.shd, {val: 'clear', color: 'auto',
      fill: '156082'});
    assert.equal(fr.rPr.color, 'FFFFFF');
    // the model keeps the elements raw, as read: nothing written
    const m = rootScope(parseXml(stylesXml('')).root);
    const s = st.styles.get('T');
    const tblPr = s.extra.find((n) => wName(n, m) === 'tblPr');
    assert.equal(tblPr.children[0].children[0].attrs.length, 6);
    assert.ok(s.raw);
  });

  it('a themed colour not understood is not shown', () => {
    const bad = (more) => viewOf(stylesOf(table('T', '<w:tblPr>' +
      '<w:shd w:val="clear" w:color="auto" w:fill="123456"' + more +
      '/></w:tblPr>')), 'T').tblPr.shd;
    assert.equal(bad(' w:themeFill="accent1" w:foo="1"'), undefined);
    assert.equal(bad(' w:themeFill="accent 1"'), undefined);
    assert.equal(bad(' w:themeFillTint="zz"'), undefined);
    assert.deepEqual(bad(' w:themeFill="accent1"'), {val: 'clear',
      color: 'auto', fill: '123456'});
  });

  it('hostile: unknown or repeated conditions, repeated tblPr', () => {
    const t = table('T', cond('__proto__', '<w:rPr><w:b/></w:rPr>') +
      cond('constructor', '<w:rPr><w:b/></w:rPr>') +
      cond('firstRow', '<w:rPr><w:i/></w:rPr>') +
      cond('firstRow', '<w:rPr><w:b/></w:rPr>') +
      '<w:tblStylePr><w:rPr><w:b/></w:rPr></w:tblStylePr>' +
      '<w:tblPr><w:tblStyleRowBandSize w:val="2"/></w:tblPr>' +
      '<w:tblPr><w:tblStyleRowBandSize w:val="3"/></w:tblPr>');
    const v = viewOf(stylesOf(t), 'T');
    assert.deepEqual([...v.cond.keys()], ['firstRow']);
    assert.equal(v.cond.get('firstRow').rPr.i, true);
    assert.equal(v.cond.get('firstRow').rPr.b, undefined);
    assert.equal(v.tblPr.tblStyleRowBandSize, undefined);
    assert.equal(Object.getPrototypeOf(v.tblPr), Object.prototype);
    assert.equal(COND_TYPES.length, 13);
  });

  it('Strict: the w:start / w:end sides when asked', async () => {
    const t = table('T', '<w:tblPr><w:tblBorders>' +
      '<w:start w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
      '</w:tblBorders></w:tblPr>');
    const doc = await readDocx(await tblDocx(p(), {styles: t,
      strict: true}));
    assert.equal(doc.meta.conformance, 'strict');
    const st = doc.styles;
    assert.deepEqual(viewOf(st, 'T', true).tblPr.tblBorders.left,
      side('auto'));
    assert.equal(viewOf(st, 'T').tblPr.tblBorders, undefined);
  });

  it('a built-in style (raw null) is read from its extra', () => {
    const st = stylesOf(TABLE_NORMAL + TABLE_GRID);
    const g = st.styles.get('TableGrid');
    const st2 = withStyle(st, {...g, raw: null}, {replace: true});
    assert.deepEqual(viewOf(st2, 'TableGrid').tblPr.tblBorders.top,
      side('auto'));
  });

  it('tableStyleId: tblStyle, else the default table style', () => {
    const st = stylesOf(NORMAL + TABLE_NORMAL + TABLE_GRID);
    const t = (tblPr) => modelTable([['a']], {tblPr});
    assert.equal(tableStyleId(st, t({tblStyle: 'TableGrid',
      extra: []})),
      'TableGrid');
    assert.equal(tableStyleId(st, t({extra: []})), 'TableNormal');
    assert.equal(tableStyleId(st, t({tblStyle: 'Nope', extra: []})),
      'TableNormal');
    assert.equal(tableStyleId(st, t({tblStyle: 'Normal', extra: []})),
      'TableNormal');
    const none = stylesOf(NORMAL);
    assert.equal(tableStyleId(none, t({extra: []})), null);
    assert.equal(tableStyleId(null, t({extra: []})), null);
  });

  it('a table read from a file names its style', async () => {
    const doc = await readDocx(await tblDocx(tbl([tr([tc()])],
      {tblPr: '<w:tblStyle w:val="GridTable4"/>'}), {styles: NORMAL +
      TABLE_NORMAL + GRID_TABLE_4}));
    const t = doc.sections[0].blocks[0];
    assert.equal(t.type, 'tbl');
    const v = viewOf(doc.styles, tableStyleId(doc.styles, t));
    assert.equal(v.cond.get('firstRow').rPr.b, true);
  });

  it('Word\'s own Grid Table 4 (corpus): themed colours shown',
    async (t) => {
      const xml = await styleFromCorpus('GridTable4-Accent1');
      if (!xml) return t.skip('corpus missing');
      const tn = await styleFromCorpus('TableNormal');
      const v = viewOf(stylesOf(tn + xml), 'GridTable4-Accent1');
      assert.equal(v.cond.get('firstRow').rPr.b, true);
      assert.equal(v.tblPr.tblStyleRowBandSize, 1);
      assert.deepEqual(v.tblPr.tblCellMar.left, {w: 108, type: 'dxa'});
      // Word writes theme attributes on every colour: the literal
      // colour beside them is shown
      assert.deepEqual(v.tblPr.tblBorders.insideV, side('45B0E1'));
      assert.equal(v.cond.get('band1Horz').tcPr.shd.fill, 'C1E4F5');
      assert.equal(v.cond.get('firstRow').rPr.color, 'FFFFFF');
    });
});
