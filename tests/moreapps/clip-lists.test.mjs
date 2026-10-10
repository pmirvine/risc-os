// L6 parts: ./ClipNums (the definitions a slice carries), ./NumClean
// (XML of one document made fit for another), ./NumCopy (the new
// definitions in the target), and hostile numbering: a numId the
// source lacks, a num without its abstract, a target with no free
// id, ids past 2^31 - 1, linked list styles, oversized definitions,
// what must never travel (picture bullets, style ids, r:id, w:id,
// other namespaces).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {numsOf, MAX_NODES} from '../../tools/moreapps/!Word/ClipNums';
import {cleanEl} from '../../tools/moreapps/!Word/NumClean';
import {copyNums} from '../../tools/moreapps/!Word/NumCopy';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {rootScope} from '../../tools/moreapps/!Word/Ns';
import {mk, C, SEL, blocks, texts} from './edit-docs.mjs';
import {p, r, numberingXml, stylesXml} from './build-docx.mjs';
import {item, lvl} from './list-fixtures.mjs';
import {sourceDocx, open, copyPaste, labelTexts, state}
  from './clip-lists-docs.mjs';
import {write, schema} from './roundtrip-lib.mjs';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const xml = (s) => parseXml(s).root;
const numIds = (d) => blocks(d).map((b) => (b.type === 'p' &&
  b.pPr.numPr ? b.pPr.numPr.numId : null));
const {xsd} = schema();
const dec = new TextDecoder();

const abs = (id, inner, attrs = '') => `<w:abstractNum ` +
  `w:abstractNumId="${id}"${attrs}>${inner}</w:abstractNum>`;
const num = (id, a, over = '') => `<w:num w:numId="${id}">` +
  `<w:abstractNumId w:val="${a}"/>${over}</w:num>`;
/** A source whose paragraphs are items of `ids` (numbering xml). */
const srcOf = (numbering, ids, styles) => sourceDocx({numbering,
  paras: [...ids.map((id, k) => item('i' + k, id)), p(r('end'))],
  ...(styles ? {styles} : {})});

describe('ClipNums.numsOf', () => {
  it('the num and abstract nodes of each list used, shared', async () => {
    const src = await open(await sourceDocx());
    const m = numsOf(src.doc, blocks(src));
    assert.deepEqual([...m.keys()], [2, 3, 1]);
    const raw = src.doc.numbering.raw.children;
    assert.ok(raw.includes(m.get(2).num) && raw.includes(m.get(2).abs));
    assert.equal(m.get(2).abs, m.get(3).abs, 'one abstract, two nums');
  });
  it('missing num, missing abstract, junk ids: left out', () => {
    const d = mk([['a', {pPr: {numPr: {numId: 9}, extra: []}}],
      ['b', {pPr: {numPr: {numId: 2 ** 31}, extra: []}}],
      ['c', {pPr: {numPr: {numId: -1}, extra: []}}],
      ['d', {pPr: {numPr: {numId: 4}, extra: []}}]]);
    d.doc.numbering = {raw: xml(numberingXml(num(4, 77) + num(9, 0) +
      abs(0, lvl(0)))), nums: new Map()};
    const m = numsOf(d.doc, blocks(d));
    assert.deepEqual([...m.keys()], [9]);
    d.doc.numbering = {raw: null, nums: new Map()};
    assert.equal(numsOf(d.doc, blocks(d)).size, 0);
    d.doc.numbering = null;
    assert.equal(numsOf(d.doc, blocks(d)).size, 0);
  });
  it('a numStyleLink is followed one step', async () => {
    const N = numberingXml(
      abs(0, '<w:multiLevelType w:val="multilevel"/>' +
        '<w:numStyleLink w:val="MyList"/>') +
      abs(1, '<w:multiLevelType w:val="multilevel"/>' +
        '<w:styleLink w:val="MyList"/>' + lvl(0, {fmt: 'upperRoman'}) +
        lvl(1, {fmt: 'upperLetter', text: '%2)'})) +
      abs(2, '<w:numStyleLink w:val="Loop"/>') +
      num(1, 0) + num(2, 1) + num(3, 2));
    const S = stylesXml('<w:style w:type="numbering" w:styleId=' +
      '"MyList"><w:name w:val="My list"/><w:pPr><w:numPr><w:numId ' +
      'w:val="2"/></w:numPr></w:pPr></w:style><w:style w:type=' +
      '"numbering" w:styleId="Loop"><w:name w:val="Loop"/><w:pPr>' +
      '<w:numPr><w:numId w:val="3"/></w:numPr></w:pPr></w:style>');
    const src = await open(await srcOf(N, [1, 1, 3], S));
    const m = numsOf(src.doc, blocks(src));
    assert.deepEqual([...m.keys()], [1]);
    const dst = mk(['']);
    copyPaste(src, SEL(src, 0, 0, 3, 0), dst, C(dst, 0, 0));
    assert.deepEqual(labelTexts(dst), ['I.', 'II.', null, null]);
    const s = JSON.stringify(dst.doc.numbering.raw);
    assert.ok(!/styleLink|numStyleLink|MyList/.test(s), s);
  });
  it('a definition of more than MAX_NODES elements: left out', () => {
    const big = '<w:lvl w:ilvl="0">' + '<w:pPr/>'.repeat(MAX_NODES) +
      '</w:lvl>';
    const d = mk([['a', {pPr: {numPr: {numId: 1}, extra: []}}],
      ['b', {pPr: {numPr: {numId: 2}, extra: []}}]]);
    d.doc.numbering = {raw: xml(numberingXml(abs(0, big) + abs(1,
      lvl(0)) + num(1, 0) + num(2, 1))), nums: new Map()};
    assert.deepEqual([...numsOf(d.doc, blocks(d)).keys()], [2]);
  });
});

describe('ClipNums: very wide definitions (review 1)', () => {
  it('300,000 lvlOverride children: left out, Copy never throws',
    async () => {
      const wide = '<w:lvlOverride w:ilvl="9"/>'.repeat(300000);
      const src = await open(await srcOf(numberingXml(abs(0, lvl(0)) +
        num(1, 0) + num(2, 0, wide)), [2, 1]));
      const {slice} = await import(
        '../../tools/moreapps/!Word/ClipSlice');
      const s = slice(src.doc, SEL(src, 0, 0, 2, 0));
      assert.ok(s, 'copied');
      assert.deepEqual([...s.lists.keys()], [1]);
      const dst = mk(['']);
      copyPaste(src, SEL(src, 0, 0, 2, 0), dst, C(dst, 0, 0));
      assert.deepEqual(numIds(dst), [null, 1, null]);
    });
});

describe('NumClean.cleanEl', () => {
  const HOSTILE = numberingXml(abs(0, '<w:nsid w:val="11112222"/>' +
    '<w:multiLevelType w:val="hybridMultilevel"/>' +
    '<w:tmpl w:val="AB12CD34"/>' +
    '<w:lvl w:ilvl="0" w:tplc="04090001" w15:tentative="1">' +
    '<w:start w:val="1"/>' +
    '<mc:AlternateContent><mc:Choice Requires="w14"><w:numFmt ' +
    'w:val="custom" w:format="001, 002, 003, ..."/></mc:Choice>' +
    '<mc:Fallback><w:numFmt w:val="decimal"/></mc:Fallback>' +
    '</mc:AlternateContent><w:pStyle w:val="Heading1"/>' +
    '<w:lvlPicBulletId w:val="3"/><w:lvlText w:val="%1."/>' +
    '<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging=' +
    '"360"/><w:pPrChange w:id="5" w:author="x"><w:pPr/></w:pPrChange>' +
    '</w:pPr><w:rPr><w:rStyle w:val="Src"/><w:b/><w14:glow/>' +
    '<w:rFonts r:id="rId4"/></w:rPr></w:lvl>',
  ' w15:restartNumberingAfterBreak="0"'))
    .replace('<w:numbering ', '<w:numbering xmlns:w15="http://schemas.' +
      'microsoft.com/office/word/2012/wordml" xmlns:w14="http://' +
      'schemas.microsoft.com/office/word/2010/wordml" xmlns:mc="http://' +
      'schemas.openxmlformats.org/markup-compatibility/2006" xmlns:r=' +
      '"http://schemas.openxmlformats.org/officeDocument/2006/' +
      'relationships" ');
  it('keeps WML only, drops what names the source', () => {
    const root = xml(HOSTILE);
    const a = root.children.find((c) => typeof c === 'object');
    const got = cleanEl(a, rootScope(root), false);
    const want = xml(numberingXml(abs(0, '<w:nsid w:val="11112222"/>' +
      '<w:multiLevelType w:val="hybridMultilevel"/>' +
      '<w:tmpl w:val="AB12CD34"/>' +
      '<w:lvl w:ilvl="0" w:tplc="04090001"><w:start w:val="1"/>' +
      '<w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/>' +
      '<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging=' +
      '"360"/></w:pPr><w:rPr><w:b/></w:rPr></w:lvl>')))
      .children.find((c) => typeof c === 'object');
    assert.deepEqual(got, want);
    const s = cleanEl(a, rootScope(root), true);
    const lv = s.children.find((c) => c.name === 'w:lvl');
    assert.deepEqual(lv.children.find((c) => c.name === 'w:lvlJc').attrs,
      [['w:val', 'start']]);
  });
  it('another prefix for WML comes out as w:', () => {
    const root = xml(`<x:numbering xmlns:x="${W}"><x:abstractNum ` +
      'x:abstractNumId="0"><x:lvl x:ilvl="0"><x:start x:val="3"/>' +
      '</x:lvl></x:abstractNum></x:numbering>');
    const got = cleanEl(root.children[0], rootScope(root), false);
    assert.equal(got.name, 'w:abstractNum');
    assert.deepEqual(got.children[0].children[0], {name: 'w:start',
      attrs: [['w:val', '3']], children: []});
  });
  it('null for an element of another namespace, an r:id, a w:id', () => {
    const m = new Map([['w', W], ['r', 'http://schemas.openxmlformats.' +
      'org/officeDocument/2006/relationships']]);
    const X = (name, attrs = []) => ({name, attrs, children: []});
    assert.equal(cleanEl(X('q:x'), m, false), null);
    assert.equal(cleanEl(X('w:b', [['r:id', '1']]), m, false), null);
    assert.equal(cleanEl(X('w:b', [['w:id', '1']]), m, false), null);
    assert.equal(cleanEl(X('w:pStyle', [['w:val', 'A']]), m, false), null);
    let deep = X('w:b');
    for (let k = 0; k < 100; k++) deep = {...X('w:x'), children: [deep]};
    assert.equal(JSON.stringify(cleanEl(deep, m, false)).includes('w:b'),
      false, 'depth cap');
  });
});

describe('NumCopy.copyNums', () => {
  it('ids after the largest, numIds named anywhere avoided', async () => {
    const src = await open(await sourceDocx());
    const lists = numsOf(src.doc, blocks(src));
    const d = mk([['x', {pPr: {numPr: {numId: 40}, extra: []}}]]);
    d.doc.numbering = {raw: xml(numberingXml(abs(6, lvl(0)) +
      num(3, 6))), nums: new Map()};
    d.doc.meta.numberingPart = 'word/numbering.xml';
    const {ops, map} = copyNums(d.doc, lists, [3, 2, 1, 99],
      {rand: () => 0x11112222});
    assert.deepEqual([...map], [[3, 41], [2, 42], [1, 43]]);
    assert.deepEqual(ops.map((o) => o.key), ['numbering']);
    const kids = ops[0].value.raw.children;
    assert.deepEqual(kids.map((c) => c.name), ['w:abstractNum',
      'w:abstractNum', 'w:abstractNum', 'w:num', 'w:num', 'w:num',
      'w:num']);
    assert.deepEqual(kids.slice(1, 3).map((c) => c.attrs[0][1]),
      ['7', '8']);
    assert.deepEqual(kids.slice(1, 3).map((c) => c.children[0].attrs),
      [[['w:val', '11112222']], [['w:val', '11112223']]]);
    assert.equal(kids[0], d.doc.numbering.raw.children[0], 'old kept');
  });
  it('no free id: RangeError, nothing changed', () => {
    const d = mk(['x']);
    d.doc.numbering = {raw: xml(numberingXml(abs(0, lvl(0)) +
      num(2147483647, 0))), nums: new Map()};
    const lists = new Map([[1, {num: d.doc.numbering.raw.children[1],
      abs: d.doc.numbering.raw.children[0], m: new Map([['w', W]])}]]);
    assert.throws(() => copyNums(d.doc, lists, [1]), RangeError);
    assert.deepEqual(copyNums(d.doc, lists, []), {ops: [],
      map: new Map()});
  });
});

describe('L6 hostile pastes', () => {
  it('a numId the source lacks: a plain paragraph, no part made',
    async () => {
      const src = await open(await srcOf(numberingXml(abs(0, lvl(0)) +
        num(1, 0) + num(2, 55)), [9, 2]));
      const dst = mk(['']);
      copyPaste(src, SEL(src, 0, 0, 2, 0), dst, C(dst, 0, 0));
      assert.deepEqual(texts(dst), ['i0', 'i1', '']);
      assert.deepEqual(numIds(dst), [null, null, null]);
      assert.equal(dst.doc.numbering, null);
      assert.equal(dst.undoDepth, 1);
    });
  it('a target with no free numId: pasted, lists dropped, one step',
    async () => {
      const src = await open(await sourceDocx());
      const dst = await open(await srcOf(numberingXml(abs(0, lvl(0)) +
        num(2147483647, 0)), [2147483647]));
      const before = state(dst);
      copyPaste(src, SEL(src, 0, 0, 3, 0), dst, C(dst, 1, 0));
      assert.deepEqual(texts(dst), ['i0', 'One', 'One a', 'Two', 'end']);
      assert.deepEqual(numIds(dst).slice(1, 4), [null, null, null]);
      assert.equal(dst.doc.numbering, before.numbering === null ? null
        : dst.doc.numbering);
      assert.deepEqual(state(dst).numbering, before.numbering);
      assert.equal(dst.undoDepth, 1);
      dst.undo();
      assert.deepEqual(state(dst), before);
    });
  it('hostile definitions: cleaned, the result valid', async () => {
    const N = numberingXml(abs(0, '<w:nsid w:val="ABCDEF01"/>' +
      '<w:lvl w:ilvl="0" w15:tentative="1"><w:start w:val="1"/>' +
      '<w:numFmt w:val="decimal"/><w:pStyle w:val="Heading1"/>' +
      '<w:lvlPicBulletId w:val="0"/><w:lvlText w:val="%1)"/>' +
      '<w:lvlJc w:val="left"/><w:rPr><w:rStyle w:val="Strong"/>' +
      '<w:b/></w:rPr></w:lvl>', ' w15:restartNumberingAfterBreak="0"') +
      '<w:num w:numId="1" w15:durableId="99"><w:abstractNumId ' +
      'w:val="0"/><w:lvlOverride w:ilvl="0"><w:startOverride ' +
      'w:val="4"/></w:lvlOverride><w:lvlOverride w:ilvl="0">' +
      '<w:startOverride w:val="9"/></w:lvlOverride><w:lvlOverride ' +
      'w:ilvl="12"/></w:num>')
      .replace('<w:numbering ', '<w:numbering xmlns:w15="http://' +
        'schemas.microsoft.com/office/word/2012/wordml" ');
    const src = await open(await srcOf(N, [1, 1]));
    const dst = mk(['']);
    copyPaste(src, SEL(src, 0, 0, 2, 0), dst, C(dst, 0, 0));
    assert.deepEqual(labelTexts(dst), ['4)', '5)', null]);
    const z = await readZip(await write(dst.doc));
    const s = dec.decode(z.get(dst.doc.meta.numberingPart));
    assert.ok(!/w15|pStyle|rStyle|PicBullet|w:val="9"|ilvl="12"/
      .test(s), s);
    if (xsd) {
      assert.deepEqual([...xsd.errors(z.get(dst.doc.meta
        .numberingPart))], []);
    }
  });
  it('slice blocks naming ids past 2^31 - 1 make no list', () => {
    const d = mk(['']);
    const b = {type: 'p', text: 'x', inlines: {}, runs: [{start: 0,
      end: 1, rPr: {extra: []}}], pPr: {numPr: {numId: 2 ** 31},
      extra: []}};
    assert.equal(numsOf(d.doc, [b]).size, 0);
  });
});
