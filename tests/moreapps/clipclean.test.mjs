// ClipClean: blocks made fit for the target document (cross-document
// sanitising; the same document passes everything).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {clean} from '../../tools/moreapps/!Word/ClipClean';
import {checkContent} from '../../tools/moreapps/!Word/ModelCheck';
import {addStyle} from '../../tools/moreapps/!Word/Styles';
import {mk, raw, O, el} from './edit-docs.mjs';

const R = (o = {}) => ({...o, extra: []});
const P = (text, o = {}) => ({type: 'p', text, inlines: {},
  runs: text ? [{start: 0, end: text.length, rPr: R()}] : [],
  pPr: R(), ...o});
const rel = (name, attr) => ({name, attrs: [[attr, 'rId7']],
  children: []});

describe('ClipClean: across documents', () => {
  it('a hyperlink becomes its text, drawings and fields go', () => {
    const link = {kind: 'raw', level: 'p', text: 'click me',
      node: rel('w:hyperlink', 'r:id')};
    const draw = {kind: 'raw', level: 'r', node: {name: 'w:drawing',
      attrs: [], children: [rel('a:blip', 'r:embed')]}};
    const fld = raw('fldChar', 'r');
    const b = P('a' + O + 'b' + O + O + 'c', {inlines: {1: link, 3: draw,
      4: fld}, runs: [{start: 0, end: 2, rPr: R({b: true})},
      {start: 2, end: 6, rPr: R()}]});
    const [q] = clean([b], mk(['']).doc, {});
    assert.equal(q.text, 'aclick mebc');
    assert.deepEqual(q.inlines, {});
    assert.deepEqual(q.runs, [{start: 0, end: 9, rPr: R({b: true})},
      {start: 9, end: 11, rPr: R()}]);
    checkContent(q, true);
  });
  it('tab and br inlines become characters; w:t raw keeps its text', () => {
    const t = {kind: 'raw', level: 'r', node: {name: 'w:t', attrs: [],
      children: ['\t']}};
    const b = P(O + O + O + O, {inlines: {0: {kind: 'tab'},
      1: {kind: 'br', level: 'r', node: el('br')}, 2: t,
      3: {kind: 'raw', level: 'p', text: '\u0001x￼',
        node: el('sdt')}}});
    const [q] = clean([b], mk(['']).doc, {});
    assert.equal(q.text, '\t\n\tx');
  });
  it('page and column breaks stay breaks (new inlines, no node)', () => {
    const br = (brType) => ({kind: 'br', level: 'r', brType,
      node: {name: 'w:br', attrs: [['w:type', brType],
        ['x:odd', '1']], children: []}});
    const b = P('a' + O + 'b' + O + O, {inlines: {1: br('page'),
      3: br('column'), 4: br('textWrapping')}});
    const [q] = clean([b], mk(['']).doc, {});
    assert.equal(q.text, 'a' + O + 'b' + O + '\n');
    assert.deepEqual(q.inlines, {1: {kind: 'br', level: 'r',
      brType: 'page'}, 3: {kind: 'br', level: 'r', brType: 'column'}});
    checkContent(q, true);
    // a br inline with a page brType but not a br kind stays text
    const odd = P('a' + O, {inlines: {1: {kind: 'raw', level: 'r',
      brType: 'page', node: el('sym')}}});
    const [o] = clean([odd], mk(['']).doc, {});
    assert.equal(o.text, 'a');
    assert.deepEqual(o.inlines, {});
  });
  it('styles are mapped by name or dropped; numPr dropped', () => {
    const d = mk(['']);
    addStyle(d.doc.styles, {id: 'MyQuote', type: 'paragraph',
      name: 'Quote'});
    addStyle(d.doc.styles, {id: 'Strong2', type: 'character',
      name: 'Strong'});
    const names = new Map([['Q', {name: 'Quote', type: 'paragraph'}],
      ['H', {name: 'Heading 1', type: 'paragraph'}],
      ['X', {name: 'Nowhere', type: 'paragraph'}],
      ['S', {name: 'strong', type: 'character'}],
      ['Z', {name: 'Quote', type: 'character'}]]);
    const run = (rStyle) => [{start: 0, end: 1, rPr: R(), rStyle}];
    const bs = [P('a', {pStyle: 'Q', runs: run('S')}),
      P('b', {pStyle: 'H', runs: run('Z')}),
      P('c', {pStyle: 'X', pPr: R({numPr: {numId: 1, ilvl: 0},
        jc: 'center'})}),
      P('d', {pStyle: 'Unnamed'})];
    const out = clean(bs, d.doc, {styleNames: names});
    assert.equal(out[0].pStyle, 'MyQuote');
    assert.equal(out[0].runs[0].rStyle, 'Strong2');
    assert.equal(out[1].pStyle, 'Heading1');
    assert.equal(out[1].runs[0].rStyle, undefined);
    assert.equal(out[2].pStyle, undefined);
    assert.deepEqual(out[2].pPr, R({jc: 'center'}));
    assert.equal(out[3].pStyle, undefined);
    const none = clean(bs, mk([''], {styles: false}).doc,
      {styleNames: names});
    assert.ok(none.every((b) => b.pStyle === undefined));
  });
  it('modelled run and paragraph fields kept, raw extras dropped', () => {
    const rPr = {b: true, i: true, u: 'double', strike: true,
      color: 'FF0000', sz: 30, szCs: 30, highlight: 'yellow',
      vertAlign: 'subscript', rFonts: {ascii: 'Arial', hAnsi: 'Arial'},
      extra: [el('caps')]};
    const pPr = {jc: 'right', ind: {left: 720}, spacing: {after: 0},
      keepNext: true, keepLines: true, pageBreakBefore: true,
      outlineLvl: 2, extra: [el('shd')]};
    const [q] = clean([P('x', {pPr, runs: [{start: 0, end: 1, rPr}],
      extraP: [['w14:paraId', '1']]})], mk(['']).doc, {});
    assert.deepEqual(q.runs[0].rPr, {...rPr, extra: []});
    assert.deepEqual(q.pPr, {...pPr, extra: []});
    assert.equal(q.extraP, undefined);
    assert.equal(q.id, undefined);
  });
  it('run shading kept; tabs, borders, shading, flow flags of the ' +
    'paragraph dropped', () => {
    const shd = {val: 'clear', color: 'auto', fill: 'FFFF00'};
    const pPr = {jc: 'right', tabs: [{val: 'left', pos: 720}],
      pBdr: {top: {val: 'single'}}, shd, widowControl: false,
      contextualSpacing: true, extra: []};
    const [q] = clean([P('x', {pPr, runs: [{start: 0, end: 1,
      rPr: {shd, extra: []}}]})], mk(['']).doc, {});
    assert.deepEqual(q.runs[0].rPr, {shd, extra: []});
    assert.deepEqual(q.pPr, {jc: 'right', extra: []});
  });
  it('opaque blocks are skipped; junk ignored', () => {
    const out = clean([{type: 'opaque', node: el('tbl')}, null, 5,
      {type: 'x'}, P('k')], mk(['']).doc, {});
    assert.deepEqual(out.map((b) => b.text), ['k']);
  });
});

describe('ClipClean: the same document', () => {
  it('passes everything (raw inlines, styles, numPr, tables)', () => {
    const link = raw('hyperlink', 'p', 'l');
    const pPr = R({numPr: {numId: 3, ilvl: 1}});
    const bs = [P('a' + O, {inlines: {1: link}, pStyle: 'Whatever',
      pPr, runs: [{start: 0, end: 2, rPr: R({b: true}), rStyle: 'S'}]}),
    {type: 'opaque', node: el('tbl')}];
    const out = clean(bs, mk(['']).doc, {sameDoc: true});
    assert.equal(out.length, 2);
    assert.equal(out[0].inlines[1], link);
    assert.equal(out[0].pStyle, 'Whatever');
    assert.equal(out[0].pPr, pPr);
    assert.equal(out[0].runs[0].rStyle, 'S');
    assert.equal(out[1].node, bs[1].node);
  });
  it('inlines holding ids that must stay unique become text', () => {
    const doc = mk(['']).doc;
    const node = (name, kids = []) => ({name, attrs: [['w:id', '1']],
      children: kids});
    const kinds = ['bookmarkStart', 'bookmarkEnd', 'commentRangeStart',
      'commentRangeEnd', 'commentReference', 'ins', 'del', 'moveFrom',
      'moveTo', 'footnoteReference', 'endnoteReference', 'permStart',
      'permEnd', 'moveFromRangeStart', 'moveFromRangeEnd',
      'moveToRangeStart', 'moveToRangeEnd', 'customXmlInsRangeStart',
      'customXmlInsRangeEnd', 'customXmlDelRangeStart',
      'customXmlDelRangeEnd', 'customXmlMoveFromRangeStart',
      'customXmlMoveFromRangeEnd', 'customXmlMoveToRangeStart',
      'customXmlMoveToRangeEnd'];
    for (const k of kinds) {
      for (const level of ['p', 'r']) {
        const x = {kind: 'raw', level, node: node('w:' + k)};
        if (level === 'p') x.text = 'T';
        const [q] = clean([P('a' + O + 'b', {inlines: {1: x}})], doc,
          {sameDoc: true});
        assert.equal(q.text, level === 'p' ? 'aTb' : 'ab', k);
        assert.deepEqual(q.inlines, {}, k);
        checkContent(q, true);
      }
    }
    // nested: a hyperlink holding a bookmark
    const link = {kind: 'raw', level: 'p', text: 'here',
      node: node('w:hyperlink', [node('w:r', [node('w:bookmarkStart')])])};
    const [q] = clean([P(O + 'x' + O, {inlines: {0: link,
      2: raw('hyperlink', 'p', 'kept')}})], doc, {sameDoc: true});
    assert.equal(q.text, 'herex' + O);
    assert.equal(q.inlines[5].text, 'kept');
  });
  it('a node with 200,000 children is searched without a stack error',
    () => {
      const doc = mk(['']).doc;
      const kids = Array.from({length: 200000}, () => ({name: 'w:r',
        attrs: [], children: []}));
      kids.push({name: 'w:bookmarkStart', attrs: [], children: []});
      const link = {kind: 'raw', level: 'p', text: 'wide',
        node: {name: 'w:hyperlink', attrs: [], children: kids}};
      const [q] = clean([P(O, {inlines: {0: link}})], doc,
        {sameDoc: true});
      assert.equal(q.text, 'wide');
    });
  it('links, fields, symbols, tabs, breaks and pictures are kept', () => {
    const doc = mk(['']).doc;
    const draw = {kind: 'raw', level: 'r', node: {name: 'w:drawing',
      attrs: [], children: [{name: 'wp:docPr', attrs: [['id', '3']],
        children: []}]}};
    const inl = {0: raw('hyperlink', 'p', 'l'), 1: raw('fldSimple', 'p',
      'f'), 2: raw('sym', 'r'), 3: {kind: 'tab'}, 4: {kind: 'br',
      level: 'r', brType: 'page'}, 5: draw, 6: raw('fldChar', 'r')};
    const b = P(O.repeat(7), {inlines: inl});
    const [q] = clean([b], doc, {sameDoc: true});
    assert.equal(q.text, O.repeat(7));
    assert.equal(q.inlines, b.inlines, 'shared: nothing to change');
  });
  it('refuses invalid content', () => {
    assert.throws(() => clean([P('ab', {runs: []})], mk(['']).doc,
      {sameDoc: true}), RangeError);
  });
});

// ------------------------------------------------------------ unique ids
// (final review: a same-document paste must not put an id that has to
// stay unique into the document twice)

const X = (name, attrs = [], children = []) => ({name, attrs, children});
const T = (s) => X('w:r', [], [X('w:t', [], [s])]);
const cellP = (...kids) => X('w:tc', [], [X('w:p', [], kids)]);
const tbl = (...rows) => X('w:tbl', [], [X('w:tblPr'),
  ...rows.map((cells) => X('w:tr', [], cells))]);

describe('ClipClean: ids that must stay unique (same document)', () => {
  const d = mk(['']).doc;
  it('a table with no such id is kept as it is (the same node)', () => {
    const node = tbl([cellP(T('a')), cellP(T('b'))]);
    const [q] = clean([{type: 'opaque', node}], d, {sameDoc: true});
    assert.equal(q.type, 'opaque');
    assert.equal(q.node, node);
  });
  for (const [what, inner] of [
    ['a bookmark', X('w:bookmarkStart', [['w:id', '3'], ['w:name', 'b']])],
    ['a comment reference', X('w:r', [], [X('w:commentReference',
      [['w:id', '1']])])],
    ['a tracked insertion', X('w:ins', [['w:id', '9']], [T('i')])],
    ['a picture (wp:docPr)', X('w:r', [], [X('w:drawing', [], [
      X('wp:inline', [], [X('wp:docPr', [['id', '4'], ['name', 'P']])])])])],
    ['a formatting change record (w:id)', X('w:pPr', [], [
      X('w:pPrChange', [['w:id', '5'], ['w:author', 'A']])])],
    ['a content control id', X('w:sdt', [], [X('w:sdtPr', [], [
      X('w:id', [['w:val', '77']])])])],
  ]) {
    it(`a table holding ${what} becomes text: a paragraph per row, ` +
      'cells joined by tabs', () => {
      const node = tbl([cellP(T('a'), inner), cellP(T('b'))],
        [cellP(T('c')), cellP()]);
      const out = clean([{type: 'opaque', node}], d, {sameDoc: true});
      assert.ok(out.every((b) => b.type === 'p'), JSON.stringify(out));
      const texts = out.map((b) => b.text);
      assert.equal(texts.length, 2);
      assert.match(texts[0], /^a(i)?\tb$/);
      assert.equal(texts[1], 'c\t');
      for (const b of out) {
        checkContent(b, true);
        assert.deepEqual(b.inlines, {});
        assert.deepEqual(b.pPr, {extra: []});
      }
    });
  }
  it('w14:paraId and w14:textId are taken off a kept table (a copy)', () => {
    const p = X('w:p', [['w14:paraId', '1A2B3C4D'], ['w14:textId',
      '77777777'], ['w:rsidR', '00AA']], [T('a')]);
    const node = tbl([X('w:tc', [], [p])]);
    const [q] = clean([{type: 'opaque', node}], d, {sameDoc: true});
    assert.equal(q.type, 'opaque');
    assert.notEqual(q.node, node);
    const qp = q.node.children[1].children[0].children[0];
    assert.deepEqual(qp.attrs, [['w:rsidR', '00AA']]);
    assert.equal(p.attrs.length, 3, 'the source is not changed');
  });
  it('change records with ids are dropped from pPr.extra and rPr.extra; ' +
    'other extras kept', () => {
    const caps = X('w:caps'), keepP = X('w:suppressAutoHyphens');
    const pch = X('w:pPrChange', [['w:id', '1']], [X('w:pPr')]);
    const rch = X('w:rPrChange', [['w:id', '2']], [X('w:rPr')]);
    const b = P('ab', {pPr: {jc: 'center', extra: [pch, keepP]},
      runs: [{start: 0, end: 2, rPr: {b: true, extra: [caps, rch]}}]});
    const [q] = clean([b], d, {sameDoc: true});
    assert.deepEqual(q.pPr, {jc: 'center', extra: [keepP]});
    assert.deepEqual(q.runs[0].rPr, {b: true, extra: [caps]});
    assert.equal(b.pPr.extra.length, 2, 'the source is not changed');
    const plain = P('x', {pPr: {extra: [keepP]}});
    const [q2] = clean([plain], d, {sameDoc: true});
    assert.equal(q2.pPr, plain.pPr, 'nothing to drop: the same object');
  });
  it('across documents tables are still left out', () => {
    const node = tbl([cellP(T('a'))]);
    assert.deepEqual(clean([{type: 'opaque', node}], d, {}), []);
  });
});

describe('ClipIds.flatten: only text in runs (final review 2)', () => {
  const d = mk(['']).doc;
  const stops = X('w:pPr', [], [X('w:tabs', [], [X('w:tab',
    [['w:val', 'left'], ['w:pos', '720']])]), X('w:pPrChange',
    [['w:id', '8']], [X('w:pPr', [], [X('w:tabs', [], [X('w:tab')])])])]);
  const runTab = X('w:r', [], [X('w:rPr', [], [X('w:rPrChange',
    [['w:id', '9']], [X('w:rPr')])]), X('w:tab')]);
  it('tab stops in pPr (and its change record) are not tabs; a run\'s tab is', () => {
    const node = tbl([X('w:tc', [], [X('w:p', [], [stops, T('a'), runTab,
      T('b')])]), cellP(T('c'))]);
    const out = clean([{type: 'opaque', node}], d, {sameDoc: true});
    assert.deepEqual(out.map((b) => b.text), ['a b\tc']);
  });
});
