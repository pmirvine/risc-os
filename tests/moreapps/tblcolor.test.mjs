// TblColor: themed colours shown by the literal colour Word writes
// beside the theme attributes (display only; the model keeps the
// element raw), Batch C2.2 fix.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {rootScope, strictScope} from '../../tools/moreapps/!Word/Ns';
import {readTblPr, readTcPr} from '../../tools/moreapps/!Word/TblProps';
import {readRPr, readPPr} from '../../tools/moreapps/!Word/ReadProps';
import {showThemed} from '../../tools/moreapps/!Word/TblColor';
import {W_NS} from './build-docx.mjs';
import {freeze} from './tbl-fixtures.mjs';

function parse(name, inner, strict) {
  const root = parseXml(`<w:${name} xmlns:w="${W_NS}">${inner}` +
    `</w:${name}>`).root;
  const m = rootScope(root);
  return {node: root, map: strict ? strictScope(m) : m};
}
const READ = {tblPr: readTblPr, tcPr: readTcPr,
  rPr: (n, m) => readRPr(n, m, false).rPr,
  pPr: (n, m) => readPPr(n, m, false).pPr};
/** The part read as the model has it, and its display form. */
function shown(kind, inner, strict) {
  const {node, map} = parse(kind, inner, strict);
  const part = freeze(READ[kind](node, map));
  return {part, out: showThemed(part, kind, map)};
}
const T = ' w:themeColor="accent1" w:themeTint="99"';
const side = (n, color = '45B0E1', more = T) =>
  `<w:${n} w:val="single" w:sz="4" w:space="0" w:color="${color}"` +
  `${more}/>`;
const S = (color = '45B0E1') => ({val: 'single', sz: 4, space: 0,
  color});

describe('TblColor: showThemed', () => {
  it('table borders and shading: the literal colours', () => {
    const {part, out} = shown('tblPr', '<w:tblBorders>' + side('top') +
      side('insideH', '666666', ' w:themeColor="text1" ' +
      'w:themeShade="BF"') + '</w:tblBorders><w:shd w:val="clear" ' +
      'w:color="auto" w:fill="C1E4F5" w:themeFill="accent1" ' +
      'w:themeFillTint="33"/>');
    assert.equal(part.tblBorders, undefined);
    assert.equal(part.extra.length, 2);
    assert.deepEqual(out.tblBorders, {top: S(), insideH: S('666666')});
    assert.deepEqual(out.shd, {val: 'clear', color: 'auto',
      fill: 'C1E4F5'});
    assert.equal(out.extra, part.extra); // kept as the model has it
  });
  it('cell borders (tl2br too), shading', () => {
    const {out} = shown('tcPr', '<w:tcBorders>' + side('tl2br') +
      '<w:insideV w:val="nil"/></w:tcBorders>');
    assert.deepEqual(out.tcBorders, {tl2br: S(),
      insideV: {val: 'nil'}});
  });
  it('run colour and paragraph borders', () => {
    const r = shown('rPr', '<w:b/><w:color w:val="FFFFFF" ' +
      'w:themeColor="background1"/>').out;
    assert.equal(r.color, 'FFFFFF');
    assert.equal(r.b, true);
    const p = shown('pPr', '<w:pBdr>' + side('bottom') +
      '</w:pBdr>').out;
    assert.deepEqual(p.pBdr, {bottom: S()});
  });
  it('auto or no colour: as before', () => {
    const {out} = shown('tblPr', '<w:tblBorders>' +
      side('top', 'auto', ' w:themeColor="text1"') +
      '<w:left w:val="single" w:sz="4" w:themeColor="text1"/>' +
      '</w:tblBorders>');
    assert.deepEqual(out.tblBorders, {top: S('auto'),
      left: {val: 'single', sz: 4}});
  });
  it('Strict: w:start / w:end', () => {
    const {out} = shown('tblPr', '<w:tblBorders>' + side('start') +
      side('end') + '</w:tblBorders>', true);
    assert.deepEqual(out.tblBorders, {left: S(), right: S()});
    const t = shown('tblPr', '<w:tblBorders>' + side('left') +
      '</w:tblBorders>', true).out;
    assert.equal(t.tblBorders, undefined);
  });
  it('nothing themed: the very same object', () => {
    const {part, out} = shown('tblPr', '<w:tblBorders>' +
      side('top', 'auto', '') + '</w:tblBorders><w:tblCaption ' +
      'w:val="x"/>');
    assert.equal(out, part);
    assert.equal(showThemed(null, 'tblPr', new Map()), null);
    assert.equal(showThemed(part, 'nope', new Map()), part);
  });
  it('hostile: unknown attributes, bad theme values, repeats', () => {
    const none = (inner) => {
      const {part, out} = shown('tblPr', inner);
      assert.equal(out, part, inner);
    };
    none('<w:shd w:val="clear" w:fill="123456" w:themeFill="a1" ' +
      'w:foo="1"/>');
    none('<w:shd w:val="clear" w:fill="123456" w:themeFill="a 1"/>');
    none('<w:shd w:val="clear" w:fill="123456" w:themeFillTint="zz"/>');
    none('<w:shd w:val="clear" w:fill="12345G" w:themeFill="a1"/>');
    none('<w:shd w:val="clear" w:fill="123456" w:themeFill="a1">x' +
      '</w:shd>');
    none('<w:shd w:val="clear" w:themeFill="a1"/><w:shd w:val="clear"' +
      ' w:themeFill="a1"/>');
    none('<w:tblBorders>' + side('top') + side('top') +
      '</w:tblBorders>');
    none('<w:tblBorders>' + side('between') + '</w:tblBorders>');
    none('<w:tblBorders>' + side('__proto__') + '</w:tblBorders>');
    none('<w:tblBorders><w:top w:val="single" w:sz="-1" ' +
      'w:themeColor="text1"/></w:tblBorders>');
  });
  it('a field the reader gave is not replaced', () => {
    const {node, map} = parse('tblPr', '<w:shd w:val="clear" ' +
      'w:fill="111111" w:themeFill="text1"/>');
    const part = {...readTblPr(node, map), shd: {val: 'solid'}};
    assert.deepEqual(showThemed(part, 'tblPr', map).shd,
      {val: 'solid'});
  });
});
