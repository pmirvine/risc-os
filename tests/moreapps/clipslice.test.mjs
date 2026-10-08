// ClipSlice: a selection as clipboard blocks and plain text, without
// changing the document.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {slice, plainOf} from '../../tools/moreapps/!Word/ClipSlice';
import {mk, C, SEL, snap, box, raw, O, bold, plain}
  from './edit-docs.mjs';
import {deepEqual} from '../../tools/moreapps/!Word/Model';

const two = ['abcdef', {runs: [{start: 0, end: 3, rPr: plain},
  {start: 3, end: 6, rPr: bold}]}];

describe('ClipSlice.slice', () => {
  it('a collapsed selection is no slice', () => {
    const d = mk(['abc']);
    assert.equal(slice(d.doc, C(d, 0, 1)), null);
  });
  it('within one paragraph: runs cut at the edges', () => {
    const d = mk([two]);
    const s = slice(d.doc, SEL(d, 0, 5, 0, 2));
    assert.equal(s.blocks.length, 1);
    const b = s.blocks[0];
    assert.equal(b.type, 'p');
    assert.equal(b.text, 'cde');
    assert.deepEqual(b.runs, [{start: 0, end: 1, rPr: plain},
      {start: 1, end: 3, rPr: bold}]);
    assert.deepEqual(b.inlines, {});
    assert.equal(b.id, undefined);
    assert.equal(s.plain, 'cde');
  });
  it('across 3 paragraphs keeps pPr and pStyle', () => {
    const d = mk(['abc', ['mid', {pStyle: 'Heading1',
      pPr: {jc: 'center', extra: []}}], 'xyz']);
    const s = slice(d.doc, SEL(d, 0, 1, 2, 2));
    assert.deepEqual(s.blocks.map((b) => b.text), ['bc', 'mid', 'xy']);
    assert.equal(s.blocks[1].pStyle, 'Heading1');
    assert.deepEqual(s.blocks[1].pPr, {jc: 'center', extra: []});
    assert.equal(s.plain, 'bc\nmid\nxy');
    assert.deepEqual(s.styleNames.get('Heading1'),
      {name: 'heading 1', type: 'paragraph'});
  });
  it('a table in the middle is an opaque block, an empty line', () => {
    const d = mk(['ab', box(), 'cd']);
    const s = slice(d.doc, SEL(d, 0, 1, 2, 1));
    assert.deepEqual(s.blocks.map((b) => b.type), ['p', 'opaque', 'p']);
    assert.equal(s.blocks[1].node, d.doc.sections[0].blocks[1].node);
    assert.equal(s.plain, 'b\n\nc');
    assert.deepEqual(s.ids.slice(1, 2), [null]);
  });
  it('a table at an end is in only when covered', () => {
    const d = mk([box(), 'cd', box()]);
    const id0 = SEL(d, 0, 1, 1, 1);
    assert.deepEqual(slice(d.doc, id0).blocks.map((b) => b.type), ['p']);
    const all = slice(d.doc, SEL(d, 0, 0, 2, 1));
    assert.deepEqual(all.blocks.map((b) => b.type),
      ['opaque', 'p', 'opaque']);
    const end = slice(d.doc, SEL(d, 1, 0, 2, 0));
    assert.deepEqual(end.blocks.map((b) => b.type), ['p']);
  });
  it('the whole document, backwards selection too', () => {
    const d = mk(['one', 'two', '']);
    const s = slice(d.doc, SEL(d, 2, 0, 0, 0));
    assert.deepEqual(s.blocks.map((b) => b.text), ['one', 'two', '']);
    assert.equal(s.plain, 'one\ntwo\n');
  });
  it('inlines (a hyperlink) and tab characters are kept', () => {
    const link = raw('hyperlink', 'p', 'link');
    const d = mk([['a\tb' + O + 'c', {inlines: {3: link}}]]);
    const s = slice(d.doc, SEL(d, 0, 0, 0, 5));
    assert.equal(s.blocks[0].text, 'a\tb' + O + 'c');
    assert.equal(s.blocks[0].inlines[3], d.doc.sections[0].blocks[0]
      .inlines[3]);
    assert.equal(s.plain, 'a\tblinkc');
    const t = slice(d.doc, SEL(d, 0, 4, 0, 5));
    assert.deepEqual(t.blocks[0].inlines, {});
  });
  it('character style names come along', () => {
    const d = mk([['ab', {runs: [{start: 0, end: 2, rPr: plain,
      rStyle: 'DefaultParagraphFont'}]}]]);
    const s = slice(d.doc, SEL(d, 0, 0, 0, 2));
    assert.deepEqual(s.styleNames.get('DefaultParagraphFont'),
      {name: 'Default Paragraph Font', type: 'character'});
  });
  it('the document is untouched', () => {
    const d = mk([two, box(), ['x' + O, {inlines: {1: raw('fldChar',
      'r')}}]]);
    const before = snap(d);
    slice(d.doc, SEL(d, 0, 2, 2, 2));
    assert.ok(deepEqual(snap(d), before));
    assert.equal(d.undoDepth, 0);
  });
  it('an invalid position is no slice', () => {
    const d = mk(['abc']);
    assert.equal(slice(d.doc, {anchor: {id: 999, off: 0},
      head: {id: 999, off: 1}}), null);
  });
  it('plainOf: br and tab inlines, other inlines as nothing', () => {
    const b = {type: 'p', text: O + O + O + 'x', runs: [], inlines: {
      0: {kind: 'tab'}, 1: {kind: 'br', level: 'r', brType: 'page'},
      2: raw('drawing', 'r')}};
    assert.equal(plainOf([b, {type: 'opaque', node: {}}]), '\t\nx\n');
  });
});
