// The property fields of task A1.3: pPr tabs, pBdr, shd, widowControl,
// contextualSpacing; rPr shd; sectPr type. Each is read into the model
// only when understood completely (else kept raw in extra, written back
// byte-equal) and written back as the same XML.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {parseXml, serialize} from '../../tools/moreapps/!WimpLib/Xml';
import {rootScope} from '../../tools/moreapps/!Word/Ns';
import {readPPr, readRPr} from '../../tools/moreapps/!Word/ReadProps';
import {readSect} from '../../tools/moreapps/!Word/ReadSect';
import {pPrNode, rPrNode, sectPrNode}
  from '../../tools/moreapps/!Word/WriteProps';
import {PPR_FIELDS, RPR_FIELDS, SECT_FIELDS}
  from '../../tools/moreapps/!Word/PropNames';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {apply} from '../../tools/moreapps/!Word/Ops';
import {paraLayers} from '../../tools/moreapps/!Word/Styles';
import {DocxError} from '../../tools/moreapps/!Word/DocxError';
import {buildDocx, documentXml, stylesXml, p, r, W_NS, STRICT_W_NS,
  STRICT_R_NS}
  from './build-docx.mjs';
import {entries, entryText} from './docx-compare.mjs';
import {Document} from '../../tools/moreapps/!Word/Document';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {apply as fmt} from '../../tools/moreapps/!Word/FormatApply';
import {C} from './edit-docs.mjs';

const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const NSA = `xmlns:w="${W_NS}" xmlns:w14="${W14}"`;

/** Parse <w:NAME>inner</w:NAME> with the namespaces; {node, map}. */
function parse(name, inner) {
  const root = parseXml(`<w:${name} ${NSA}>${inner}</w:${name}>`).root;
  return {node: root, map: rootScope(root)};
}
const pPrOf = (inner, inPara = true) => {
  const {node, map} = parse('pPr', inner);
  return {...readPPr(node, map, inPara), map};
};
/** The children of a written pPr/rPr/sectPr, serialised. */
const kidsXml = (node) => node ? node.children.map((c) => serialize(c))
  .join('') : '';
const writeP = (pPr, map) => kidsXml(pPrNode(pPr, undefined, null, map));

/** read inner -> model; write -> the same XML; read again -> equal. */
function same(inner, want) {
  const a = pPrOf(inner);
  for (const [k, v] of Object.entries(want)) {
    assert.deepEqual(a.pPr[k], v, k);
  }
  assert.deepEqual(a.pPr.extra, [], 'nothing raw');
  const out = writeP(a.pPr, a.map);
  assert.equal(out, inner);
  assert.deepEqual(pPrOf(out).pPr, a.pPr);
}

/** inner stays raw: the whole element kept, written byte-equal. */
function raw(inner, field) {
  const a = pPrOf(inner);
  assert.equal(a.pPr[field], undefined, field + ' not modelled');
  assert.equal(a.pPr.extra.length, 1, 'kept raw: ' + inner);
  assert.equal(writeP(a.pPr, a.map), inner);
}

describe('PropNames: the new fields', () => {
  it('lists them', () => {
    for (const f of ['tabs', 'pBdr', 'shd', 'widowControl',
      'contextualSpacing']) assert.equal(PPR_FIELDS.get(f), f);
    assert.equal(RPR_FIELDS.get('shd'), 'shd');
    assert.equal(SECT_FIELDS.get('type'), 'type');
  });
});

describe('tabs', () => {
  it('reads and writes stops in file order', () => {
    same('<w:tabs><w:tab w:val="right" w:pos="9000"/>' +
      '<w:tab w:val="decimal" w:leader="dot" w:pos="4320"/>' +
      '<w:tab w:val="clear" w:pos="-100"/></w:tabs>', {tabs: [
      {val: 'right', pos: 9000},
      {val: 'decimal', pos: 4320, leader: 'dot'},
      {val: 'clear', pos: -100}]});
  });
  it('every kind and leader (Strict start/end kept as written)', () => {
    for (const val of ['left', 'center', 'right', 'decimal', 'bar',
      'clear', 'num', 'start', 'end']) {
      same(`<w:tabs><w:tab w:val="${val}" w:pos="0"/></w:tabs>`,
        {tabs: [{val, pos: 0}]});
    }
    for (const leader of ['none', 'dot', 'hyphen', 'underscore', 'heavy',
      'middleDot']) {
      same(`<w:tabs><w:tab w:val="left" w:leader="${leader}" ` +
        'w:pos="31680"/></w:tabs>',
      {tabs: [{val: 'left', pos: 31680, leader}]});
    }
  });
  it('an empty w:tabs and 256 stops are modelled', () => {
    same('<w:tabs/>', {tabs: []});
    const many = Array.from({length: 256}, (_, i) =>
      `<w:tab w:val="left" w:pos="${i}"/>`).join('');
    const a = pPrOf('<w:tabs>' + many + '</w:tabs>');
    assert.equal(a.pPr.tabs.length, 256);
  });
  it('white space between the stops is allowed', () => {
    const a = pPrOf('<w:tabs>\n <w:tab w:val="left" w:pos="1"/>\n' +
      '</w:tabs>');
    assert.deepEqual(a.pPr.tabs, [{val: 'left', pos: 1}]);
  });
  it('anything not understood keeps the whole w:tabs raw', () => {
    const t = (x) => `<w:tabs>${x}</w:tabs>`;
    const cases = [
      t('<w:tab w:val="left" w:pos="1" w14:x="1"/>'),
      t('<!-- note --><w:tab w:val="left" w:pos="1"/>'),
      t('<w:tab w:val="middle" w:pos="1"/>'),
      t('<w:tab w:val="left" w:pos="1.5"/>'),
      t('<w:tab w:val="left" w:pos="1in"/>'),
      t('<w:tab w:val="left" w:pos="01"/>'),
      t('<w:tab w:val="left" w:pos="99999999999999999999"/>'),
      t('<w:tab w:val="left"/>'),
      t('<w:tab w:pos="1"/>'),
      t('<w:tab w:val="left" w:pos="1" w:leader="stars"/>'),
      t('<w:tab w:val="left" w:pos="1" w:foo="1"/>'),
      t('<w:tab w:val="left" w:pos="1" w:__proto__="x"/>'),
      t('<w:tab w:val="left" w:pos="1"><w:x/></w:tab>'),
      t('<w:tab w:val="left" w:pos="1">x</w:tab>'),
      t('<w:jc w:val="left"/>'),
      t('text'),
      t('<w14:tab w:val="left" w:pos="1"/>'),
      '<w:tabs w:foo="1"><w:tab w:val="left" w:pos="1"/></w:tabs>',
      t(Array.from({length: 257}, (_, i) =>
        `<w:tab w:val="left" w:pos="${i}"/>`).join('')),
      // a position the commands cannot keep (beyond +-22") or one
      // given twice: editing would drop or merge stops
      t('<w:tab w:val="left" w:pos="31681"/>'),
      t('<w:tab w:val="left" w:pos="-31681"/>'),
      t('<w:tab w:val="left" w:pos="40000"/>' +
        '<w:tab w:val="right" w:pos="720"/>'),
      t('<w:tab w:val="right" w:pos="720"/>' +
        '<w:tab w:val="left" w:pos="720"/>'),
      t('<w:tab w:val="clear" w:pos="720"/>' +
        '<w:tab w:val="left" w:pos="720"/>'),
    ];
    for (const c of cases) raw(c, 'tabs');
  });
  it('__proto__ as a tab attribute is inert', () => {
    const a = pPrOf('<w:tabs><w:tab w:val="left" w:pos="1" ' +
      'w:__proto__="x"/></w:tabs>');
    assert.equal(a.pPr.tabs, undefined);
    assert.equal(Object.getPrototypeOf(a.pPr), Object.prototype);
    assert.equal({}.x, undefined);
  });
  it('a repeated w:tabs stays raw (both)', () => {
    const one = '<w:tabs><w:tab w:val="left" w:pos="1"/></w:tabs>';
    const a = pPrOf(one + one);
    assert.equal(a.pPr.tabs, undefined);
    assert.equal(a.pPr.extra.length, 2);
    assert.equal(writeP(a.pPr, a.map), one + one);
  });
});

describe('pBdr', () => {
  it('reads and writes every side', () => {
    same('<w:pBdr><w:top w:val="single" w:sz="4" w:space="1" ' +
      'w:color="auto"/><w:left w:val="double" w:sz="0"/>' +
      '<w:bottom w:val="nil"/><w:right w:val="thick" w:sz="96" ' +
      'w:color="FF0000" w:shadow="1" w:frame="0"/>' +
      '<w:between w:val="dotted" w:space="31"/><w:bar w:val="none"/>' +
      '</w:pBdr>', {pBdr: {
      top: {val: 'single', sz: 4, space: 1, color: 'auto'},
      left: {val: 'double', sz: 0}, bottom: {val: 'nil'},
      right: {val: 'thick', sz: 96, color: 'FF0000', shadow: true,
        frame: false},
      between: {val: 'dotted', space: 31}, bar: {val: 'none'}}});
  });
  it('sides are written in schema order', () => {
    const a = pPrOf('<w:pBdr><w:bottom w:val="single"/>' +
      '<w:top w:val="single"/></w:pBdr>');
    assert.deepEqual(Object.keys(a.pPr.pBdr), ['bottom', 'top']);
    assert.equal(writeP(a.pPr, a.map), '<w:pBdr><w:top w:val="single"/>' +
      '<w:bottom w:val="single"/></w:pBdr>');
  });
  it('shadow and frame on/off spellings read as booleans', () => {
    const a = pPrOf('<w:pBdr><w:top w:val="single" w:shadow="true" ' +
      'w:frame="off"/></w:pBdr>');
    assert.deepEqual(a.pPr.pBdr.top,
      {val: 'single', shadow: true, frame: false});
    assert.equal(writeP(a.pPr, a.map), '<w:pBdr><w:top w:val="single" ' +
      'w:shadow="1" w:frame="0"/></w:pBdr>');
  });
  it('anything not understood keeps the whole w:pBdr raw', () => {
    const b = (x) => `<w:pBdr>${x}</w:pBdr>`;
    const cases = [
      b('<w:top w:val="single" w:themeColor="accent1"/>'),
      b('<w:top w:val="single" w:themeShade="BF"/>'),
      b('<w:top w:val="single" w14:x="1"/>'),
      b('<w:top w:sz="4"/>'),
      b('<w:top w:val="single" w:sz="-1"/>'),
      b('<w:top w:val="single" w:sz="x"/>'),
      b('<w:top w:val="single" w:space="1.5"/>'),
      b('<w:top w:val="single" w:color="red"/>'),
      b('<w:top w:val="single" w:shadow="maybe"/>'),
      b('<w:top w:val="sin gle"/>'),
      b('<w:top w:val="single"/><w:top w:val="double"/>'),
      b('<w:start w:val="single"/>'),
      b('<w:top w:val="single"><w:x/></w:top>'),
      b('<!-- c --><w:top w:val="single"/>'),
      b('<w:top w:val="single" w:__proto__="x"/>'),
      '<w:pBdr w:foo="1"><w:top w:val="single"/></w:pBdr>',
    ];
    for (const c of cases) raw(c, 'pBdr');
  });
});

describe('shd', () => {
  it('paragraph shading', () => {
    same('<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>',
      {shd: {val: 'clear', color: 'auto', fill: 'D9D9D9'}});
    same('<w:shd w:val="pct25"/>', {shd: {val: 'pct25'}});
  });
  it('raw when not understood', () => {
    for (const c of [
      '<w:shd w:val="clear" w:color="auto" w:fill="FFFFFF" ' +
        'w:themeFill="background1"/>',
      '<w:shd w:val="clear" w:themeColor="text1"/>',
      '<w:shd w:fill="FFFFFF"/>',
      '<w:shd w:val="clear" w:fill="FFFFF"/>',
      '<w:shd w:val="clear" w:fill="FFFFFF"><w:x/></w:shd>',
      '<w:shd w:val="clear" w:fill="FFFFFF" w14:x="1"/>',
    ]) raw(c, 'shd');
  });
  it('run shading in rPr', () => {
    const {node, map} = parse('rPr', '<w:b/><w:shd w:val="clear" ' +
      'w:color="auto" w:fill="FFFF00"/>');
    const {rPr} = readRPr(node, map, true);
    assert.deepEqual(rPr.shd, {val: 'clear', color: 'auto',
      fill: 'FFFF00'});
    assert.deepEqual(rPr.extra, []);
    assert.equal(kidsXml(rPrNode(rPr, undefined, map)), '<w:b/>' +
      '<w:shd w:val="clear" w:color="auto" w:fill="FFFF00"/>');
    const {node: n2, map: m2} = parse('rPr', '<w:shd w:val="clear" ' +
      'w:themeFill="accent1"/>');
    const k = readRPr(n2, m2, true).rPr;
    assert.equal(k.shd, undefined);
    assert.equal(k.extra.length, 1);
  });
});

describe('widowControl and contextualSpacing', () => {
  it('on and off', () => {
    same('<w:widowControl/>', {widowControl: true});
    same('<w:widowControl w:val="0"/>', {widowControl: false});
    same('<w:contextualSpacing/>', {contextualSpacing: true});
    const a = pPrOf('<w:contextualSpacing w:val="false"/>');
    assert.equal(a.pPr.contextualSpacing, false);
    raw('<w:widowControl w:val="maybe"/>', 'widowControl');
    raw('<w:contextualSpacing w14:x="1"/>', 'contextualSpacing');
  });
});

describe('written order', () => {
  it('every new field in its schema place', () => {
    const inner = '<w:keepNext/><w:widowControl w:val="0"/>' +
      '<w:pBdr><w:top w:val="single"/></w:pBdr>' +
      '<w:shd w:val="clear" w:fill="EEEEEE"/>' +
      '<w:tabs><w:tab w:val="left" w:pos="1"/></w:tabs>' +
      '<w:spacing w:after="0"/><w:contextualSpacing/>' +
      '<w:jc w:val="center"/>';
    const a = pPrOf(inner);
    const shuffled = {...a.pPr};
    const order = ['jc', 'contextualSpacing', 'tabs', 'shd', 'spacing',
      'pBdr', 'widowControl', 'keepNext', 'extra'];
    const pPr = Object.fromEntries(order.map((k) => [k, shuffled[k]]));
    assert.equal(writeP(pPr, a.map), inner);
  });
  it('a raw field keeps its place among modelled ones', () => {
    const inner = '<w:keepNext/><w:pBdr><w:top w:val="single" ' +
      'w:themeColor="accent1"/></w:pBdr><w:tabs><w:tab w:val="left" ' +
      'w:pos="1"/></w:tabs><w:jc w:val="center"/>';
    const a = pPrOf(inner);
    assert.equal(a.pPr.extra.length, 1);
    assert.equal(writeP(a.pPr, a.map), inner);
  });
});

describe('the writer refuses a bad model', () => {
  const bad = (pPr) => assert.throws(() => pPrNode({extra: [], ...pPr},
    undefined, null, rootScope(parse('pPr', '').node)),
  (e) => e instanceof DocxError && e.code === 'bad-model');
  it('tabs', () => {
    bad({tabs: {}});
    bad({tabs: [{val: 'middle', pos: 1}]});
    bad({tabs: [{val: 'left', pos: 1.5}]});
    bad({tabs: [{val: 'left'}]});
    bad({tabs: [{val: 'left', pos: 1, leader: 'stars'}]});
    bad({tabs: [{val: 'left', pos: 1, x: 1}]});
    bad({tabs: [null]});
    bad({tabs: Array.from({length: 257}, () => ({val: 'left', pos: 1}))});
  });
  it('pBdr and shd', () => {
    bad({pBdr: []});
    bad({pBdr: {start: {val: 'single'}}});
    bad({pBdr: {top: {sz: 4}}});
    bad({pBdr: {top: {val: 'single', sz: -1}}});
    bad({pBdr: {top: {val: 'single', color: 'red'}}});
    bad({pBdr: {top: {val: 'single', shadow: 1}}});
    bad({pBdr: {top: {val: 'single', themeColor: 'accent1'}}});
    bad({pBdr: JSON.parse('{"__proto__": {"val": "single"}}')});
    bad({shd: {fill: 'FFFFFF'}});
    bad({shd: {val: 'clear', fill: 'FFF'}});
    bad({shd: 'clear'});
    bad({widowControl: 1});
    bad({contextualSpacing: 'yes'});
  });
});

describe('a style pPr gets the same fields', () => {
  it('readPPr outside a paragraph', () => {
    const a = pPrOf('<w:widowControl w:val="0"/><w:tabs><w:tab ' +
      'w:val="center" w:pos="4680"/></w:tabs><w:contextualSpacing/>',
    false);
    assert.deepEqual(a.pPr.tabs, [{val: 'center', pos: 4680}]);
    assert.equal(a.pPr.widowControl, false);
    assert.equal(a.pPr.contextualSpacing, true);
  });
  it('in a styles part, and paraLayers gives the layers', async () => {
    const doc = await readDocx(await buildDocx({
      'word/document.xml': documentXml(p(r('x'),
        '<w:pStyle w:val="L"/><w:tabs><w:tab w:val="left" w:pos="2"/>' +
        '</w:tabs>')),
      'word/styles.xml': stylesXml('<w:style w:type="paragraph" ' +
        'w:styleId="L"><w:name w:val="L"/><w:pPr><w:pBdr><w:bottom ' +
        'w:val="single" w:sz="6"/></w:pBdr><w:tabs><w:tab w:val="right" ' +
        'w:pos="9360"/></w:tabs></w:pPr></w:style>'),
    }));
    const st = doc.styles.styles.get('L');
    assert.deepEqual(st.pPr.pBdr, {bottom: {val: 'single', sz: 6}});
    assert.deepEqual(st.pPr.tabs, [{val: 'right', pos: 9360}]);
    const para = doc.sections[0].blocks[0];
    const layers = paraLayers(doc.styles, para);
    assert.equal(layers[layers.length - 1], para.pPr);
    assert.ok(layers.includes(st.pPr));
  });
});

describe('sectPr type', () => {
  const sect = (inner) => {
    const {node, map} = parse('sectPr', inner);
    return {props: readSect(node, map), node, map};
  };
  it('each section start', () => {
    for (const v of ['nextPage', 'continuous', 'evenPage', 'oddPage',
      'nextColumn']) {
      const s = sect(`<w:type w:val="${v}"/><w:pgSz w:w="1" w:h="2"/>`);
      assert.equal(s.props.type, v);
      assert.deepEqual(s.props.extra, []);
      const built = sectPrNode({props: s.props, raw: null}, s.map);
      assert.equal(kidsXml(built), `<w:type w:val="${v}"/>` +
        '<w:pgSz w:w="1" w:h="2"/>');
    }
  });
  it('raw when not understood', () => {
    for (const x of ['<w:type w:val="sideways"/>', '<w:type/>',
      '<w:type w:val="continuous" w14:x="1"/>']) {
      const s = sect(x);
      assert.equal(s.props.type, undefined);
      assert.equal(s.props.extra.length, 1);
    }
  });
  it('an edited type is written in place', () => {
    const s = sect('<w:headerReference w:type="default" r:id="x" ' +
      'xmlns:r="urn:r"/><w:type w:val="continuous"/>' +
      '<w:pgSz w:w="1" w:h="2"/>');
    const props = {...s.props, type: 'oddPage'};
    const out = kidsXml(sectPrNode({props, raw: s.node}, s.map));
    assert.match(out, /^<w:headerReference[^>]*\/><w:type w:val="oddPage"/);
  });
});

describe('documents: read, edit, write', () => {
  const body = p(r('a'), '<w:widowControl w:val="0"/><w:pBdr><w:top ' +
    'w:val="single" w:sz="4" w:space="1" w:color="auto"/></w:pBdr>' +
    '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:tabs>' +
    '<w:tab w:val="left" w:leader="dot" w:pos="720"/></w:tabs>' +
    '<w:contextualSpacing/>') +
    p(r('b', '<w:shd w:val="clear" w:color="auto" w:fill="FFFF00"/>'),
      '<w:pBdr><w:top w:val="single" w:themeColor="accent1"/></w:pBdr>' +
      '<w:shd w:val="clear" w:themeFill="accent2"/><w:tabs><w:tab ' +
      'w:val="left" w:pos="1" w14:x="1"/></w:tabs>') +
    '<w:sectPr><w:type w:val="continuous"/><w:pgSz w:w="12240" ' +
    'w:h="15840"/></w:sectPr>';
  const make = (ns) => buildDocx({'word/document.xml':
    documentXml(body, {ns, rootAttrs: ` xmlns:w14="${W14}"`})});

  it('modelled fields read; raw ones written byte-equal', async () => {
    const doc = await readDocx(await make(W_NS));
    const [a, b] = doc.sections[0].blocks;
    assert.deepEqual(a.pPr.tabs, [{val: 'left', pos: 720, leader: 'dot'}]);
    assert.equal(a.pPr.widowControl, false);
    assert.deepEqual(a.pPr.extra, []);
    assert.deepEqual(b.runs[0].rPr.shd,
      {val: 'clear', color: 'auto', fill: 'FFFF00'});
    assert.equal(b.pPr.extra.length, 3);
    assert.equal(doc.sections[0].props.type, 'continuous');
    const out = await writeDocx(doc);
    const xml = new TextDecoder().decode(
      (await entries(out)).get('word/document.xml'));
    for (const s of ['<w:pBdr><w:top w:val="single" ' +
      'w:themeColor="accent1"/></w:pBdr>', '<w:shd w:val="clear" ' +
      'w:themeFill="accent2"/>', '<w:tab w:val="left" w:pos="1" ' +
      'w14:x="1"/>', '<w:tab w:val="left" w:leader="dot" w:pos="720"/>',
    '<w:type w:val="continuous"/>']) assert.ok(xml.includes(s), s);
    const back = await readDocx(out);
    assert.deepEqual(back.sections[0].blocks.map((x) => x.pPr),
      doc.sections[0].blocks.map((x) => x.pPr));
  });

  it('an edit of a field replaces its raw element', async () => {
    const doc = await readDocx(await make(W_NS));
    apply(doc, {op: 'setProps', block: [0, 1], pPr: {
      tabs: [{val: 'center', pos: 100}], pBdr: {bottom: {val: 'single'}},
      shd: null}});
    const b = doc.sections[0].blocks[1];
    assert.deepEqual(b.pPr.extra, []);
    assert.deepEqual(b.pPr.tabs, [{val: 'center', pos: 100}]);
    assert.deepEqual(b.pPr.pBdr, {bottom: {val: 'single'}});
    assert.equal(b.pPr.shd, undefined);
    const back = await readDocx(await writeDocx(doc));
    assert.deepEqual(back.sections[0].blocks[1].pPr, b.pPr);
  });

  it('a Strict document keeps start/end tab stops', async () => {
    const strict = await buildDocx({'word/document.xml': documentXml(
      p(r('s'), '<w:tabs><w:tab w:val="start" w:pos="10"/>' +
        '<w:tab w:val="end" w:pos="20"/></w:tabs>'), {ns: STRICT_W_NS,
        rNs: STRICT_R_NS, rootAttrs: ' w:conformance="strict"'})},
    {strict: true});
    assert.equal((await readDocx(strict)).meta.conformance, 'strict');
    const doc = await readDocx(strict);
    assert.deepEqual(doc.sections[0].blocks[0].pPr.tabs,
      [{val: 'start', pos: 10}, {val: 'end', pos: 20}]);
    const back = await readDocx(await writeDocx(doc));
    assert.deepEqual(back.sections[0].blocks[0].pPr.tabs,
      doc.sections[0].blocks[0].pPr.tabs);
  });
});

describe('Strict names: w:ind start / end, w:pBdr start / end', () => {
  const strictOf = (pPr) => buildDocx({'word/document.xml': documentXml(
    p(r('s'), pPr) + p(r('t')), {ns: STRICT_W_NS, rNs: STRICT_R_NS,
      rootAttrs: ' w:conformance="strict"'})}, {strict: true});
  const transOf = (pPr) => buildDocx({'word/document.xml': documentXml(
    p(r('s'), pPr) + p(r('t')))});
  const docXml = async (doc) => entryText(await writeDocx(doc),
    'word/document.xml');
  const side = (n) => `<w:${n} w:val="single" w:sz="4" w:space="4" ` +
    'w:color="auto"/>';
  it('a Strict w:ind start / end is the field, written back so',
    async () => {
      const ind = '<w:ind w:start="720" w:end="360" w:hanging="360"/>';
      const doc = await readDocx(await strictOf(ind));
      const a = doc.sections[0].blocks[0];
      assert.deepEqual(a.pPr.ind, {left: 720, right: 360, hanging: 360});
      assert.deepEqual(a.pPr.extra, []);
      const xml = await docXml(doc);
      assert.ok(xml.includes(ind), xml);
      assert.deepEqual((await readDocx(await writeDocx(doc)))
        .sections[0].blocks[0].pPr, a.pPr);
    });
  it('Transitional names in Strict (and Strict in Transitional) stay raw',
    async () => {
      for (const [make, x] of [[strictOf, '<w:ind w:left="720"/>'],
        [strictOf, '<w:ind w:start="720" w:left="720"/>'],
        [strictOf, `<w:pBdr>${side('left')}</w:pBdr>`],
        [strictOf, `<w:pBdr>${side('start')}${side('left')}</w:pBdr>`],
        [transOf, '<w:ind w:start="720"/>'],
        [transOf, `<w:pBdr>${side('start')}</w:pBdr>`]]) {
        const doc = await readDocx(await make(x));
        const a = doc.sections[0].blocks[0];
        assert.equal(a.pPr.ind, undefined, x);
        assert.equal(a.pPr.pBdr, undefined, x);
        assert.equal(a.pPr.extra.length, 1, x);
        assert.ok((await docXml(doc)).includes(x), x);
      }
    });
  it('a Strict w:pBdr start / end is the field, written back so',
    async () => {
      const bdr = `<w:pBdr>${side('top')}${side('start')}` +
        `${side('end')}</w:pBdr>`;
      const doc = await readDocx(await strictOf(bdr));
      const a = doc.sections[0].blocks[0];
      assert.deepEqual(Object.keys(a.pPr.pBdr), ['top', 'left', 'right']);
      assert.ok((await docXml(doc)).includes(bdr));
    });
  it('commands write Strict names in a Strict document', async () => {
    const S = {val: 'single', sz: 4, space: 4, color: 'auto'};
    for (const [make, l, rr] of [[strictOf, 'start', 'end'],
      [transOf, 'left', 'right']]) {
      const d = new Document(await readDocx(await make('')));
      const t = new Typing(d);
      fmt('borders', d, t, C(d, 1, 0), {pBdr: {left: S, right: S}});
      fmt('indentMore', d, t, C(d, 1, 0));
      const xml = await docXml(d.doc);
      assert.ok(xml.includes(`<w:pBdr>${side(l)}${side(rr)}</w:pBdr>`),
        xml);
      assert.match(xml, new RegExp(`<w:ind w:${l}="\\d+"/>`));
      const back = (await readDocx(await writeDocx(d.doc)))
        .sections[0].blocks[1];
      assert.deepEqual(back.pPr, d.doc.sections[0].blocks[1].pPr);
    }
  });
});
