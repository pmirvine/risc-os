// !Letters typed section fields (Batch D P1.2, spec D20): w:pgNumType,
// w:lnNumType, w:vAlign and w:cols (with its w:col children) typed
// when understood completely, else kept raw in extra as before;
// w:pgSz / w:pgMar values with units read as twips, the written
// string kept in props.units so an untouched value is written back as
// read. 20 hand-written sectPrs round-trip byte for byte, through the
// raw node (as today) and through the typed fields alone; hostile
// values stay raw. With WORD_EDIT_CORPUS=1, every corpus sectPr is
// also written from its typed fields alone and must read back equal.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readSect, MAX_COLS} from '../../tools/moreapps/!Letters/ReadSect';
import {sectPrNode} from '../../tools/moreapps/!Letters/WriteProps';
import {setSection} from '../../tools/moreapps/!Letters/OpsSect';
import {parseXml, serialize} from '../../tools/moreapps/!WimpLib/Xml';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {rootScope, scope, wName, isEl, W}
  from '../../tools/moreapps/!Letters/Ns';
import {readFileSync} from 'node:fs';
import {ALL, corpusFiles, SKIP_CORPUS} from './roundtrip-lib.mjs';

const MAP = new Map([['w', W]]);
const OPEN = `<w:sectPr xmlns:w="${W}">`;
const node = (inner) => parseXml(OPEN + inner + '</w:sectPr>').root;
const read = (inner) => readSect(node(inner), MAP);
const out = (props, raw = null) =>
  serialize(sectPrNode({props, raw}, MAP));
const inner = (s) => s.slice(s.indexOf('>') + 1, s.lastIndexOf('<'));
const raws = (props) => props.extra.map((n) => n.name);

describe('typed section fields', () => {
  it('pgNumType: fmt and start typed', () => {
    const p = read('<w:pgNumType w:fmt="lowerRoman" w:start="3"/>');
    assert.deepEqual(p.pgNumType, {fmt: 'lowerRoman', start: 3});
    assert.deepEqual(p.extra, []);
    assert.deepEqual(read('<w:pgNumType w:chapStyle="1" ' +
      'w:chapSep="emDash"/>').pgNumType, {chapStyle: 1,
      chapSep: 'emDash'});
    assert.deepEqual(read('<w:pgNumType/>').pgNumType, {});
  });

  it('pgNumType with an attribute not understood stays raw', () => {
    for (const x of ['<w:pgNumType w:fmt="decimal" w:foo="1"/>',
      `<w:pgNumType xmlns:x="urn:x" w:start="1" x:y="2"/>`,
      '<w:pgNumType w:fmt="notAFormat"/>',
      '<w:pgNumType w:fmt="__proto__"/>',
      '<w:pgNumType w:chapSep="tilde"/>',
      '<w:pgNumType w:start="1"><w:x/></w:pgNumType>']) {
      const p = read(x);
      assert.equal(p.pgNumType, undefined, x);
      assert.deepEqual(raws(p), ['w:pgNumType'], x);
    }
  });

  it('lnNumType: countBy, start, distance, restart', () => {
    assert.deepEqual(read('<w:lnNumType w:countBy="5" ' +
      'w:restart="newSection"/>').lnNumType,
    {countBy: 5, restart: 'newSection'});
    assert.deepEqual(read('<w:lnNumType w:countBy="1" w:start="0" ' +
      'w:distance="360" w:restart="continuous"/>').lnNumType,
    {countBy: 1, start: 0, distance: 360, restart: 'continuous'});
  });

  it('cols: num, space, sep, equalWidth and the w:col widths', () => {
    const p = read('<w:cols w:num="2" w:sep="1" w:space="720" ' +
      'w:equalWidth="0"><w:col w:w="4000" w:space="720"/>' +
      '<w:col w:w="4640"/></w:cols>');
    assert.deepEqual(p.cols, {num: 2, sep: true, space: 720,
      equalWidth: false, col: [{w: 4000, space: 720}, {w: 4640}]});
    assert.deepEqual(p.extra, []);
    // white space between the w:col children is no content
    assert.deepEqual(read('<w:cols w:num="2">\n  <w:col w:w="1"/>\n' +
      '  <w:col w:w="2"/>\n</w:cols>').cols,
    {num: 2, col: [{w: 1}, {w: 2}]});
    assert.deepEqual(read('<w:cols w:space="708"/>').cols, {space: 708});
  });

  it('vAlign', () => {
    for (const v of ['top', 'center', 'both', 'bottom']) {
      assert.equal(read(`<w:vAlign w:val="${v}"/>`).vAlign, v);
    }
    const p = read('<w:vAlign w:val="middle"/>');
    assert.equal(p.vAlign, undefined);
    assert.deepEqual(raws(p), ['w:vAlign']);
  });

  it('pgSz in points: twips, written back as read', () => {
    const p = read('<w:pgSz w:w="612pt" w:h="792pt"/>');
    assert.deepEqual(p.pgSz, {w: 12240, h: 15840});
    assert.deepEqual(p.units, {pgSz: {w: '612pt', h: '792pt'}});
    assert.equal(inner(out(p)), '<w:pgSz w:w="612pt" w:h="792pt"/>');
    // a command changed w: w written in twips, h as read
    const q = {...p, pgSz: {...p.pgSz, w: 15840}};
    assert.equal(inner(out(q)), '<w:pgSz w:w="15840" w:h="792pt"/>');
    // the raw node no longer says what props say: built from props
    assert.equal(inner(out(q, node('<w:pgSz w:w="612pt" ' +
      'w:h="792pt"/>'))), '<w:pgSz w:w="15840" w:h="792pt"/>');
  });

  it('every unit; pgMar top and bottom may be negative', () => {
    const p = read('<w:pgSz w:w="8.5in" w:h="21cm"/>' +
      '<w:pgMar w:top="-1in" w:right="2.5mm" w:bottom="12pc" ' +
      'w:left="1pi" w:header="720" w:footer="0.5in" w:gutter="0"/>');
    assert.deepEqual(p.pgSz, {w: 12240, h: 11906});
    assert.deepEqual(p.pgMar, {top: -1440, right: 142, bottom: 2880,
      left: 240, header: 720, footer: 720, gutter: 0});
    assert.deepEqual(p.units, {pgSz: {w: '8.5in', h: '21cm'},
      pgMar: {top: '-1in', right: '2.5mm', bottom: '12pc',
        left: '1pi', footer: '0.5in'}});
    assert.equal(read('<w:pgSz w:w="12240" w:h="15840"/>').units,
      undefined);
    // an unsigned measure with a sign is not understood
    for (const x of ['<w:pgMar w:top="0" w:right="0" w:bottom="0" ' +
      'w:left="-1in" w:header="0" w:footer="0" w:gutter="0"/>',
    '<w:pgSz w:w="-612pt" w:h="792pt"/>',
    '<w:pgSz w:w="612 pt" w:h="792pt"/>',
    '<w:pgSz w:w="612PT" w:h="792pt"/>',
    '<w:pgSz w:w=".5in" w:h="792pt"/>']) {
      const q = read(x);
      assert.equal(q.units, undefined, x);
      assert.equal(raws(q).length, 1, x);
    }
  });

  it('cols with units (P10 fix I3): w:space and each w:col\'s w and ' +
    'w:space in pt, in, cm, mm, pc, pi typed, the strings kept', () => {
    const p = read('<w:cols w:num="2" w:space="18pt"/>');
    assert.deepEqual(p.cols, {num: 2, space: 360});
    assert.deepEqual(p.units, {cols: {space: '18pt'}});
    assert.deepEqual(read('<w:cols w:num="2" w:space="0.25in"/>').cols,
      {num: 2, space: 360});
    const q = read('<w:cols w:num="3" w:space="1cm" w:equalWidth="0">' +
      '<w:col w:w="2in" w:space="5mm"/><w:col w:w="12pc" ' +
      'w:space="300"/><w:col w:w="10pi"/></w:cols>');
    assert.deepEqual(q.cols, {num: 3, space: 567, equalWidth: false,
      col: [{w: 2880, space: 283}, {w: 2880, space: 300},
        {w: 2400}]});
    assert.deepEqual(q.units, {cols: {space: '1cm', col: [{w: '2in',
      space: '5mm'}, {w: '12pc'}, {w: '10pi'}]}});
    assert.equal(read('<w:cols w:num="2" w:space="720"/>').units,
      undefined);
  });

  it('hostile values stay raw', () => {
    const bad = ['<w:pgNumType w:start="-1"/>',
      '<w:pgNumType w:start="1e9"/>',
      '<w:pgNumType w:start="2147483648"/>',
      '<w:pgNumType w:start="NaN"/>',
      '<w:pgNumType w:chapStyle="0"/>',
      '<w:pgNumType w:chapStyle="10"/>',
      '<w:lnNumType w:countBy="0"/>',
      '<w:lnNumType w:countBy="-5"/>',
      '<w:lnNumType w:countBy="2147483648"/>',
      '<w:lnNumType w:start="-1"/>',
      '<w:lnNumType w:distance="-1"/>',
      '<w:lnNumType w:distance="-0.25in"/>',
      '<w:lnNumType w:distance="1e30in"/>',
      '<w:lnNumType w:distance="0.25xx"/>',
      '<w:lnNumType w:restart="newPage" w:__proto__="1"/>',
      '<w:lnNumType w:restart="never"/>',
      `<w:cols w:num="${MAX_COLS + 1}"/>`,
      '<w:cols w:num="0"/>',
      '<w:cols w:num="2" w:sep="maybe"/>',
      '<w:cols w:space="-0.5in"/>',
      '<w:cols w:space="1e30in"/>',
      '<w:cols w:space="0.5xx"/>',
      '<w:cols><w:col w:w="-1in"/></w:cols>',
      '<w:cols><w:col w:w="2in" w:space="-1pt"/></w:cols>',
      '<w:cols><w:col w:w="1" w:x="2"/></w:cols>',
      '<w:cols><w:col w:w="abc"/></w:cols>',
      '<w:cols><w:col w:w="-1"/></w:cols>',
      '<w:cols><w:foo/></w:cols>',
      '<w:cols>text</w:cols>',
      '<w:cols>' + '<w:col w:w="1"/>'.repeat(MAX_COLS + 1) +
        '</w:cols>',
      '<w:pgSz w:w="abc" w:h="15840"/>',
      '<w:pgSz w:w="1e9" w:h="15840"/>',
      '<w:pgSz w:w="99999999999999999999pt" w:h="15840"/>',
      '<w:vAlign w:val="__proto__"/>'];
    for (const x of bad) {
      const p = read(x);
      assert.equal(p.extra.length, 1, x);
      assert.deepEqual(Object.keys(p), ['extra'], x);
    }
    assert.equal(read(`<w:cols w:num="${MAX_COLS}"/>`).cols.num,
      MAX_COLS);
    assert.equal(read('<w:cols>' + '<w:col w:w="1"/>'.repeat(MAX_COLS) +
      '</w:cols>').cols.col.length, MAX_COLS);
    assert.equal(read('<w:pgNumType w:start="2147483647"/>')
      .pgNumType.start, 2147483647);
    assert.equal(read('<w:lnNumType w:countBy="100"/>')
      .lnNumType.countBy, 100);
    // above Word's 100: typed and drawn like any value (P11 fix M1)
    assert.equal(read('<w:lnNumType w:countBy="101"/>')
      .lnNumType.countBy, 101);
    assert.equal(read('<w:lnNumType w:countBy="2147483647"/>')
      .lnNumType.countBy, 2147483647);
  });

  it('a negative unsigned measure without a unit stays raw too ' +
    '(P1 fix M6): gutter, left, right, header, footer, pgSz', () => {
    const MAR0 = {top: '0', right: '0', bottom: '0', left: '0',
      header: '0', footer: '0', gutter: '0'};
    const mar = (k, v) => '<w:pgMar ' + Object.entries({...MAR0,
      [k]: v}).map(([a, b]) => `w:${a}="${b}"`).join(' ') + '/>';
    for (const k of ['gutter', 'left', 'right', 'header', 'footer']) {
      const q = read(mar(k, '-720'));
      assert.equal(q.pgMar, undefined, k);
      assert.deepEqual(raws(q), ['w:pgMar'], k);
      // (and it is written back as read)
      assert.equal(inner(out(q)), mar(k, '-720'), k);
      assert.equal(read(mar(k, '720')).pgMar[k], 720, k);
    }
    for (const x of ['<w:pgSz w:w="-12000" w:h="15840"/>',
      '<w:pgSz w:w="12240" w:h="-1"/>',
      '<w:pgSz w:w="12240" w:h="15840" w:code="-9"/>']) {
      assert.deepEqual(raws(read(x)), ['w:pgSz'], x);
    }
    // top and bottom are signed: typed
    assert.equal(read(mar('top', '-720')).pgMar.top, -720);
    assert.equal(read(mar('bottom', '-720')).pgMar.bottom, -720);
    assert.equal(read(mar('gutter', '0')).pgMar.gutter, 0);
  });

  it('a repeated element stays raw, both copies', () => {
    const p = read('<w:vAlign w:val="top"/><w:vAlign w:val="top"/>');
    assert.equal(p.vAlign, undefined);
    assert.equal(p.extra.length, 2);
  });
});

// written as Word writes them: children in schema order, attributes
// in the writer's order, so the typed fields alone give the same bytes
const SECTS = [
  '<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" ' +
    'w:right="1440" w:bottom="1440" w:left="1440" w:header="720" ' +
    'w:footer="720" w:gutter="0"/><w:cols w:space="720"/>',
  '<w:pgSz w:w="612pt" w:h="792pt"/>',
  '<w:pgSz w:w="11906" w:h="16838" w:code="9"/>',
  '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>',
  '<w:pgMar w:top="1in" w:right="1in" w:bottom="1in" w:left="1in" ' +
    'w:header="0.5in" w:footer="0.5in" w:gutter="0"/>',
  '<w:pgMar w:top="-2.54cm" w:right="25.4mm" w:bottom="-1440" ' +
    'w:left="6pc" w:header="3pi" w:footer="36pt" w:gutter="0.25in"/>',
  '<w:type w:val="continuous"/><w:pgNumType w:fmt="lowerRoman" ' +
    'w:start="3"/>',
  '<w:pgNumType w:start="1"/>',
  '<w:pgNumType w:fmt="thaiNumbers"/>',
  '<w:pgNumType w:fmt="decimal" w:start="0" w:chapStyle="2" ' +
    'w:chapSep="colon"/>',
  '<w:lnNumType w:countBy="5" w:restart="newSection"/>',
  '<w:lnNumType w:countBy="1" w:start="0" w:distance="360" ' +
    'w:restart="continuous"/>',
  '<w:cols w:num="2" w:sep="1" w:space="720"/>',
  '<w:cols w:num="2" w:sep="1" w:space="720" w:equalWidth="0">' +
    '<w:col w:w="4000" w:space="720"/><w:col w:w="4640"/></w:cols>',
  '<w:cols w:num="3" w:space="425" w:equalWidth="0"><w:col ' +
    'w:w="2000" w:space="425"/><w:col w:w="3000" w:space="425"/>' +
    '<w:col w:w="2500"/></w:cols>',
  '<w:vAlign w:val="center"/>',
  '<w:vAlign w:val="both"/><w:titlePg/>',
  '<w:type w:val="oddPage"/><w:pgSz w:w="8.5in" w:h="11in"/>' +
    '<w:pgMar w:top="1440" w:right="1800" w:bottom="1440" ' +
    'w:left="1800" w:header="708" w:footer="708" w:gutter="0"/>' +
    '<w:lnNumType w:countBy="10"/><w:pgNumType w:fmt="upperLetter"/>' +
    '<w:cols w:num="2" w:space="708"/><w:vAlign w:val="bottom"/>' +
    '<w:titlePg/>',
  '<w:pgSz w:w="21cm" w:h="29.7cm"/><w:cols w:space="708"/>' +
    '<w:vAlign w:val="top"/>',
  '<w:pgNumType/><w:cols/>',
  '<w:cols w:num="2" w:space="18pt"/>',
  '<w:cols w:num="2" w:sep="1" w:space="0.25in" w:equalWidth="0">' +
    '<w:col w:w="2in" w:space="0.25in"/><w:col w:w="4320"/></w:cols>',
];

describe('round trip of hand-written sectPrs', () => {
  it('has 22', () => assert.equal(SECTS.length, 22));
  for (const [i, s] of SECTS.entries()) {
    it(`sectPr ${i}: raw and typed both byte-equal`, () => {
      const n = node(s), p = readSect(n, MAP);
      assert.deepEqual(p.extra, [], 'all typed');
      assert.equal(out(p, n), OPEN + s + '</w:sectPr>');
      assert.equal(inner(out(p)), s);
      assert.deepEqual(readSect(node(inner(out(p))), MAP), p);
    });
  }
});

describe('typed fields, the writer and the ops', () => {
  it('a field of the wrong type is a bad model', () => {
    const bad = [{pgNumType: {start: '3'}}, {pgNumType: {x: 1}},
      {lnNumType: {countBy: 1.5}}, {vAlign: 3},
      {cols: {col: [{w: 'a'}]}}, {cols: {col: {w: 1}}},
      {cols: {sep: 1}}, {pgSz: {w: 1, h: 2}, units: {pgSz: {w: 7}}},
      {units: {cols: {space: 1}}}, {units: {cols: {col: 'x'}}},
      {units: {cols: {col: [{w: 2}]}}}, {units: {vAlign: {}}},
      {units: 'x'}];
    for (const b of bad) {
      assert.throws(() => out({...b, extra: []}),
        (e) => e.code === 'bad-model', JSON.stringify(b));
    }
  });

  it('setSection takes the typed fields and units', () => {
    const p = read(SECTS[17].replace('11in', '792pt'));
    const doc = {sections: [{props: {extra: []}, blocks: []}]};
    setSection(doc, {at: 0, props: p, raw: null});
    assert.equal(doc.sections[0].props, p);
    assert.throws(() => setSection(doc, {at: 0,
      props: {foo: 1, extra: []}, raw: null}), RangeError);
  });
});

/** Every w:sectPr below root (scope map), with its scope. */
function sectPrs(root, map, outList = []) {
  const stack = [[root, map]];
  while (stack.length) {
    const [n, m] = stack.pop();
    const sm = n.attrs.length ? scope(m, n) : m;
    if (wName(n, m) === 'sectPr') outList.push([n, m]);
    for (const c of n.children) if (isEl(c)) stack.push([c, sm]);
  }
  return outList;
}

describe('corpus sectPrs, written from the typed fields alone', {
  skip: !ALL ? 'set WORD_EDIT_CORPUS=1' :
    corpusFiles().length ? false : SKIP_CORPUS}, () => {
  it('read back equal', async () => {
    const seen = {sects: 0, pgNumType: 0, lnNumType: 0, cols: 0,
      col: 0, vAlign: 0, units: 0};
    for (const f of corpusFiles()) {
      let xml;
      try {
        const zip = await readZip(readFileSync(f));
        const b = zip.get('word/document.xml');
        if (!b) continue;
        // (a Strict part: its WordprocessingML namespace as the
        // reader maps it, ./NsMap)
        xml = parseXml(new TextDecoder().decode(b).replaceAll(
          'http://purl.oclc.org/ooxml/wordprocessingml/main', W)).root;
      } catch {
        continue;
      }
      for (const [n, m] of sectPrs(xml, rootScope(xml))) {
        const p = readSect(n, m);
        const again = readSect(sectPrNode({props: p, raw: null}, m),
          m);
        // (extra comes back in schema order: compared as a set)
        const ex = (q) => q.extra.map((x) => serialize(x)).sort();
        assert.deepEqual({...again, extra: ex(again)},
          {...p, extra: ex(p)}, f);
        seen.sects++;
        for (const k of ['pgNumType', 'lnNumType', 'cols', 'vAlign',
          'units']) if (p[k]) seen[k]++;
        if (p.cols && p.cols.col) seen.col++;
      }
    }
    console.log('# corpus sectPrs', JSON.stringify(seen));
    assert.ok(seen.sects > 0);
  });
});
