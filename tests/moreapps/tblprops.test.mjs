// TblProps: the readers of w:tblPr, w:trPr and w:tcPr (D1, D12, R2,
// R22), Batch C1.2. A field only when understood completely; anything
// else kept raw in `extra`, in document order.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {parseXml, serialize} from '../../tools/moreapps/!WimpLib/Xml';
import {rootScope, strictScope} from '../../tools/moreapps/!Letters/Ns';
import {readTblPr, readTrPr, readTcPr}
  from '../../tools/moreapps/!Letters/TblProps';
import {sides, pBdr} from '../../tools/moreapps/!Letters/ReadPropsMore';
import {W_NS} from './build-docx.mjs';

const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const NSA = `xmlns:w="${W_NS}" xmlns:w14="${W14}"`;

/** Parse <w:NAME>inner</w:NAME>; {node, map} (Strict scope if asked). */
function parse(name, inner, strict) {
  const root = parseXml(`<w:${name} ${NSA}>${inner}</w:${name}>`).root;
  const m = rootScope(root);
  return {node: root, map: strict ? strictScope(m) : m};
}
const READ = {tblPr: readTblPr, trPr: readTrPr, tcPr: readTcPr};
const read = (name, inner, strict) => {
  const {node, map} = parse(name, inner, strict);
  return READ[name](node, map);
};
const extraXml = (o) => o.extra.map((n) => serialize(n));
const side = (n, more = '') =>
  `<w:${n} w:val="single" w:sz="4" w:space="0" w:color="auto"${more}/>`;
const S = {val: 'single', sz: 4, space: 0, color: 'auto'};

describe('TblProps fields', () => {
  it('widths: dxa, auto, nil, pct 2500, pct "50%"', () => {
    const t = read('tblPr', '<w:tblW w:w="9350" w:type="dxa"/>' +
      '<w:tblInd w:w="-108" w:type="dxa"/>' +
      '<w:tblCellSpacing w:w="0" w:type="nil"/>');
    assert.deepEqual(t, {extra: [], tblW: {w: 9350, type: 'dxa'},
      tblInd: {w: -108, type: 'dxa'},
      tblCellSpacing: {w: 0, type: 'nil'}});
    assert.deepEqual(read('tcPr', '<w:tcW w:w="0" w:type="auto"/>').tcW,
      {w: 0, type: 'auto'});
    assert.deepEqual(read('tcPr', '<w:tcW w:w="2500" w:type="pct"/>')
      .tcW, {w: 2500, type: 'pct'});
    assert.deepEqual(read('tcPr', '<w:tcW w:w="50%" w:type="pct"/>')
      .tcW, {w: '50%', type: 'pct'});
    assert.deepEqual(read('tcPr', '<w:tcW w:w="12.5%" w:type="pct"/>')
      .tcW, {w: '12.5%', type: 'pct'});
    const r = read('trPr', '<w:wBefore w:w="100" w:type="dxa"/>' +
      '<w:wAfter w:w="0" w:type="auto"/>');
    assert.deepEqual(r.wBefore, {w: 100, type: 'dxa'});
    assert.deepEqual(r.wAfter, {w: 0, type: 'auto'});
  });

  it('widths not understood stay raw', () => {
    for (const x of ['<w:tblW w:w="50%" w:type="dxa"/>',
      '<w:tblW w:w="1234%" w:type="pct"/>', '<w:tblW w:w="1.5"' +
      ' w:type="dxa"/>', '<w:tblW w:type="dxa"/>', '<w:tblW w:w="5"/>',
      '<w:tblW w:w="155.85pt" w:type="dxa"/>',
      '<w:tblW w:w="5" w:type="bogus"/>',
      '<w:tblW w:w="5" w:type="dxa" w:x="1"/>',
      '<w:tblW w:w="5" w:type="dxa"><w:x/></w:tblW>']) {
      const t = read('tblPr', x);
      assert.equal(t.tblW, undefined, x);
      assert.equal(t.extra.length, 1, x);
    }
  });

  it('tblBorders with all six sides; tcBorders with tl2br', () => {
    const six = ['top', 'left', 'bottom', 'right', 'insideH',
      'insideV'];
    const t = read('tblPr', '<w:tblBorders>' + six.map((n) => side(n))
      .join('') + '</w:tblBorders>');
    assert.deepEqual(t.tblBorders, Object.fromEntries(six.map((n) =>
      [n, S])));
    const c = read('tcPr', '<w:tcBorders>' + side('top') +
      side('tl2br') + side('tr2bl', ' w:shadow="1"') + '</w:tcBorders>');
    assert.deepEqual(c.tcBorders, {top: S, tl2br: S,
      tr2bl: {...S, shadow: true}});
    // tl2br is not a tblBorders side
    assert.equal(read('tblPr', '<w:tblBorders>' + side('tl2br') +
      '</w:tblBorders>').tblBorders, undefined);
  });

  it('tblCellMar and tcMar', () => {
    const t = read('tblPr', '<w:tblCellMar><w:top w:w="0" w:type="dxa"/>' +
      '<w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/>' +
      '<w:right w:w="108" w:type="dxa"/></w:tblCellMar>');
    assert.deepEqual(t.tblCellMar, {top: {w: 0, type: 'dxa'},
      left: {w: 108, type: 'dxa'}, bottom: {w: 0, type: 'dxa'},
      right: {w: 108, type: 'dxa'}});
    const c = read('tcPr', '<w:tcMar><w:left w:w="0" w:type="dxa"/>' +
      '</w:tcMar>');
    assert.deepEqual(c.tcMar, {left: {w: 0, type: 'dxa'}});
    for (const x of ['<w:tcMar><w:left w:w="0" w:type="dxa"/>' +
      '<w:left w:w="0" w:type="dxa"/></w:tcMar>',
    '<w:tcMar><w:left w:w="x" w:type="dxa"/></w:tcMar>',
    '<w:tcMar><w:insideH w:w="0" w:type="dxa"/></w:tcMar>',
    '<w:tcMar w:x="1"/>']) {
      assert.equal(read('tcPr', x).tcMar, undefined, x);
    }
  });

  it('tblLook: hex only, booleans only, both', () => {
    assert.deepEqual(read('tblPr', '<w:tblLook w:val="04A0"/>').tblLook,
      {val: '04A0'});
    const b = '<w:tblLook w:firstRow="1" w:lastRow="0" ' +
      'w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>';
    const flags = {firstRow: true, lastRow: false, firstColumn: true,
      lastColumn: false, noHBand: false, noVBand: true};
    assert.deepEqual(read('tblPr', b).tblLook, flags);
    assert.deepEqual(read('tblPr', b.replace('<w:tblLook',
      '<w:tblLook w:val="04A0"')).tblLook, {val: '04A0', ...flags});
    for (const x of ['<w:tblLook w:val="4A0"/>',
      '<w:tblLook w:val="04A0" w:firstRow="2"/>',
      '<w:tblLook w:other="1"/>']) {
      assert.equal(read('tblPr', x).tblLook, undefined, x);
    }
  });

  it('trHeight with and without hRule; the other row fields', () => {
    assert.deepEqual(read('trPr', '<w:trHeight w:val="397"/>').trHeight,
      {val: 397});
    assert.deepEqual(read('trPr', '<w:trHeight w:val="397" ' +
      'w:hRule="exact"/>').trHeight, {val: 397, hRule: 'exact'});
    for (const x of ['<w:trHeight w:val="31681"/>',
      '<w:trHeight w:val="-1"/>', '<w:trHeight w:hRule="exact"/>',
      '<w:trHeight w:val="5" w:hRule="most"/>']) {
      assert.equal(read('trPr', x).trHeight, undefined, x);
    }
    const r = read('trPr', '<w:cantSplit/><w:tblHeader w:val="0"/>' +
      '<w:hidden/><w:jc w:val="center"/><w:gridBefore w:val="1"/>' +
      '<w:gridAfter w:val="2"/><w:tblCellSpacing w:w="10" ' +
      'w:type="dxa"/>');
    assert.deepEqual(r, {extra: [], cantSplit: true, tblHeader: false,
      hidden: true, jc: 'center', gridBefore: 1, gridAfter: 2,
      tblCellSpacing: {w: 10, type: 'dxa'}});
  });

  it('cell fields; vMerge with no val = continue', () => {
    const c = read('tcPr', '<w:gridSpan w:val="2"/><w:vMerge/>' +
      '<w:noWrap/><w:textDirection w:val="btLr"/><w:tcFitText/>' +
      '<w:vAlign w:val="center"/><w:hideMark/>' +
      '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>');
    assert.deepEqual(c, {extra: [], gridSpan: 2, vMerge: 'continue',
      noWrap: true, textDirection: 'btLr', tcFitText: true,
      vAlign: 'center', hideMark: true,
      shd: {val: 'clear', color: 'auto', fill: 'D9D9D9'}});
    assert.equal(read('tcPr', '<w:vMerge w:val="restart"/>').vMerge,
      'restart');
    assert.equal(read('tcPr', '<w:vMerge w:val="continue"/>').vMerge,
      'continue');
    const bad = read('tcPr', '<w:vMerge w:val="both"/>');
    assert.equal(bad.vMerge, undefined);
    assert.equal(bad.extra.length, 1);
    // integers as written: the ranges are TblRead's (R2)
    assert.equal(read('tcPr', '<w:gridSpan w:val="0"/>').gridSpan, 0);
    assert.equal(read('tcPr', '<w:gridSpan w:val="x"/>').gridSpan,
      undefined);
  });

  it('table fields', () => {
    const t = read('tblPr', '<w:tblStyle w:val="TableGrid"/>' +
      '<w:jc w:val="center"/><w:tblLayout w:type="fixed"/>' +
      '<w:tblStyleRowBandSize w:val="1"/>' +
      '<w:tblStyleColBandSize w:val="2"/><w:bidiVisual/>' +
      '<w:shd w:val="clear" w:color="auto" w:fill="FFFFFF"/>');
    assert.deepEqual(t, {extra: [], tblStyle: 'TableGrid', jc: 'center',
      tblLayout: 'fixed', tblStyleRowBandSize: 1,
      tblStyleColBandSize: 2, bidiVisual: true,
      shd: {val: 'clear', color: 'auto', fill: 'FFFFFF'}});
    assert.equal(read('tblPr', '<w:tblLayout w:type="autofit"/>')
      .tblLayout, 'autofit');
    for (const x of ['<w:tblLayout w:type="x"/>',
      '<w:tblLayout w:val="fixed"/>', '<w:tblStyle w:val=""/>',
      `<w:tblStyle w:val="${'a'.repeat(254)}"/>`,
      '<w:tblStyle w:val="a&#9;b"/>', '<w:jc w:val=""/>']) {
      assert.equal(read('tblPr', x).extra.length, 1, x);
    }
    assert.equal(read('tblPr', `<w:tblStyle w:val="${'a'.repeat(253)}"/>`)
      .tblStyle.length, 253);
  });
});

describe('TblProps: not understood -> extra, in order', () => {
  it('a themed shd, a themed side, a bogus tblW, a repeated tblInd, ' +
    'w14 children', () => {
    const kids = ['<w:tblW w:w="5" w:type="bogus"/>',
      '<w:tblInd w:w="1" w:type="dxa"/>',
      '<w:tblBorders>' + side('top', ' w:themeColor="text1"') +
        '</w:tblBorders>',
      '<w:shd w:val="clear" w:color="auto" w:themeFill="accent1"/>',
      '<w:tblInd w:w="2" w:type="dxa"/>',
      '<w:tblCaption w:val="c"/>', '<w14:foo w14:val="1"/>',
      '<w:tblpPr w:leftFromText="180"/>', '<w:cnfStyle w:val="1"/>'];
    const t = read('tblPr', kids.join(''));
    assert.deepEqual(Object.keys(t), ['extra']);
    // the very nodes, in document order, written back as they were
    assert.deepEqual(extraXml(t), kids);
  });

  it('unknown and w14 cell children kept; the fields still read', () => {
    const c = read('tcPr', '<w:cnfStyle w:val="100000000000"/>' +
      '<w:tcW w:w="10" w:type="dxa"/><w:hMerge/><w14:x/>' +
      '<w:headers/>');
    assert.deepEqual(c.tcW, {w: 10, type: 'dxa'});
    assert.deepEqual(c.extra.map((n) => n.name), ['w:cnfStyle',
      'w:hMerge', 'w14:x', 'w:headers']);
  });
});

describe('TblProps: Strict names (R22)', () => {
  const mar = (a, b) => `<w:tblCellMar><w:${a} w:w="1" w:type="dxa"/>` +
    `<w:${b} w:w="2" w:type="dxa"/></w:tblCellMar>`;
  const bdr = (a, b) => `<w:tblBorders>${side(a)}${side(b)}</w:tblBorders>`;
  it('Strict: start / end are left / right; left / right stay raw', () => {
    assert.deepEqual(read('tblPr', mar('start', 'end'), true).tblCellMar,
      {left: {w: 1, type: 'dxa'}, right: {w: 2, type: 'dxa'}});
    assert.deepEqual(read('tblPr', bdr('start', 'end'), true).tblBorders,
      {left: S, right: S});
    assert.deepEqual(read('tcPr', '<w:tcBorders>' + side('end') +
      side('tl2br') + '</w:tcBorders>', true).tcBorders,
    {right: S, tl2br: S});
    for (const x of [mar('left', 'end'), bdr('start', 'right')]) {
      const t = read('tblPr', x, true);
      assert.equal(t.extra.length, 1, x);
    }
  });
  it('Transitional: left / right are read; start / end stay raw', () => {
    assert.deepEqual(read('tblPr', mar('left', 'right')).tblCellMar,
      {left: {w: 1, type: 'dxa'}, right: {w: 2, type: 'dxa'}});
    for (const x of [mar('start', 'right'), bdr('left', 'end')]) {
      assert.equal(read('tblPr', x).extra.length, 1, x);
    }
    const c = read('tcPr', '<w:tcMar><w:start w:w="1" w:type="dxa"/>' +
      '</w:tcMar>');
    assert.equal(c.tcMar, undefined);
  });
});

describe('ReadPropsMore.sides', () => {
  it('pBdr is sides of its six names, Strict-aware', () => {
    const {node, map} = parse('pBdr', side('top') + side('between'));
    assert.deepEqual(pBdr(new Map(), node, map), {top: S, between: S});
    const f = sides(['top', 'left']);
    assert.deepEqual(f(new Map(), node, map), undefined);
    const s = parse('x', side('start'), true);
    assert.deepEqual(f(new Map(), s.node, s.map), {left: S});
    const t = parse('x', side('start'));
    assert.equal(f(new Map(), t.node, t.map), undefined);
  });
});

describe('TblProps: hostile names', () => {
  it('__proto__ / constructor elements and attributes are inert', () => {
    const t = read('tblPr', '<w:__proto__ w:val="x"/>' +
      '<w:constructor/><w:tblW w:w="1" w:type="dxa" w:__proto__="1"/>' +
      '<w:tblLook w:constructor="1"/><w:toString/>' +
      '<w:tblBorders><w:__proto__ w:val="single"/></w:tblBorders>');
    assert.deepEqual(Object.keys(t), ['extra']);
    assert.equal(t.extra.length, 6);
    assert.equal(Object.getPrototypeOf(t), Object.prototype);
    assert.equal(({}).x, undefined);
    assert.equal(Object.prototype.val, undefined);
    const c = read('tcPr', '<w:tcBorders>' + side('__proto__') +
      '</w:tcBorders><w:hasOwnProperty/>');
    assert.deepEqual(Object.keys(c), ['extra']);
    assert.equal(c.extra.length, 2);
  });
});
