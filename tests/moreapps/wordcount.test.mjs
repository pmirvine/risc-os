// WordCount: Edit > Word count... Words are runs of non-white-space
// (a no-break space and a no-break hyphen join), each East Asian
// character a word of its own; characters with and without spaces
// (code points); paragraphs that have any character; lines from the
// layout; of the selection or the whole document; tables' text
// included (an XML walk capped at 1,000,000 nodes), field codes and
// deleted text left out, a link's text and a field's result in.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {count, countView, NODE_LIMIT}
  from '../../tools/moreapps/!Letters/WordCount';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {blockId} from '../../tools/moreapps/!Letters/DocPos';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {mk, C, SEL, blocks as blocksOf, O} from './edit-docs.mjs';
import {loadStyles, tm, mkDoc, raw, box} from './word-docs.mjs';
import {modelTable} from './tbl-fixtures.mjs';
import {noteDoc, noteP, mark, emark, enoteP} from './note-fixtures.mjs';
import {p, r} from './build-docx.mjs';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {customMark, convertNote}
  from '../../tools/moreapps/!Letters/NoteCmd';

before(loadStyles);

const n = (name, ...kids) => ({name: 'w:' + name, attrs: [],
  children: kids});
const wp = (...runs) => n('p', ...runs);
const wr = (...kids) => n('r', ...kids);
const wt = (s) => n('t', s);
const tbl = (...paras) => ({type: 'opaque', node: n('tbl',
  n('tr', n('tc', ...paras)))});
/** A level-p inline (a link...) whose XML holds the text. */
const inl = (name, text) => ({kind: 'raw', level: 'p', text,
  node: n(name, wr(wt(text)))});
const xin = (node) => ({kind: 'raw', level: 'p', text: '', node});
const doc = (...x) => mk(x).doc;
const nums = (c) => [c.words, c.chars, c.charsNoSpaces, c.paras];

describe('WordCount: words and characters', () => {
  it('an empty document: nothing', () => {
    const c = count(doc(''));
    assert.deepEqual(nums(c), [0, 0, 0, 0]);
    assert.equal(c.scope, 'document');
    assert.equal(c.lines, null);
  });
  it('punctuation stays in its word; a lone mark is a word', () => {
    assert.deepEqual(nums(count(doc('Hello, world!'))), [2, 13, 12, 1]);
    assert.equal(count(doc('a - b')).words, 3);
    assert.equal(count(doc('well-known "quoted" (x) e.g. 3.14')).words,
      5);
    assert.equal(count(doc('...')).words, 1);
  });
  it('spaces, tabs and line breaks end a word and are characters', () => {
    const c = count(doc('a  b\tc\nd \u3000e'));
    assert.deepEqual(nums(c), [5, 11, 5, 1]);
    assert.equal(count(doc('   ')).paras, 1);
  });
  it('the no-break space joins words and is not counted without ' +
    'spaces', () => {
    const c = count(doc('a\u00a0b c'));
    assert.deepEqual(nums(c), [2, 5, 3, 1]);
    // the other no-break spaces join too
    assert.equal(count(doc('a\u202fb\u2007c')).words, 1);
    // ... and, like it, are not counted without spaces
    assert.deepEqual(nums(count(doc('a\u202fb\u2007c\u00a0d'))),
      [1, 7, 4, 1]);
  });
  it('emoji count once, as a code point; a run of them is a word',
    () => {
      assert.deepEqual(nums(count(doc('\u{1F600} \u{1F600}\u{1F600}'))),
        [2, 4, 3, 1]);
    });
  it('East Asian characters are a word each and end the word beside ' +
    'them (W1)', () => {
    assert.equal(count(doc('\u6f22\u5b57')).words, 2);
    assert.equal(count(doc('abc\u6f22\u5b57def')).words, 4);
    assert.equal(count(doc('\u3053\u3093\u306b\u3061\u306f')).words, 5);
    assert.equal(count(doc('\ud55c\uae00 \u30ab\u30bf')).words, 4);
    assert.equal(count(doc('\u{20000}')).words, 1);
    assert.equal(count(doc('\u6f22\u5b57')).charsNoSpaces, 2);
  });
  it('paragraphs: those with any character; empty ones are not', () => {
    const c = count(doc('one', '', 'two', ''));
    assert.deepEqual(nums(c), [2, 6, 6, 2]);
  });
  it('inline tabs and breaks are characters and end a word', () => {
    const d = mk([['a' + O + 'b' + O + 'c', {inlines: {
      1: {kind: 'tab', level: 'r'},
      3: {kind: 'br', level: 'r', brType: 'page', node: {name: 'w:br',
        attrs: [['w:type', 'page']], children: []}}}}]]).doc;
    assert.deepEqual(nums(count(d)), [3, 5, 3, 1]);
  });
  it('no-break hyphen is a hyphen inside the word; the optional ' +
    'hyphen nothing', () => {
    const d = mk([['ab' + O + 'cd' + O + 'ef', {inlines: {
      2: raw('noBreakHyphen', 'r'), 5: raw('softHyphen', 'r')}}]]).doc;
    assert.deepEqual(nums(count(d)), [1, 7, 7, 1]);
  });
  it('unseen inlines (bookmarks, proofing marks) cost nothing and ' +
    'do not split a word', () => {
    const d = mk([['ab' + O + 'cd', {inlines: {
      2: raw('bookmarkStart')}}]]).doc;
    assert.deepEqual(nums(count(d)), [1, 4, 4, 1]);
  });
});

describe('WordCount: links, fields, deleted text', () => {
  it('a link\'s text counts; so does a field\'s result', () => {
    const d = mk([['see ' + O + ' and ' + O + ' now', {inlines: {
      4: inl('hyperlink', 'the site'),
      10: inl('fldSimple', '42')}}]]).doc;
    assert.deepEqual(nums(count(d)), [6, 23, 18, 1]);
  });
  it('a link right after a word joins it', () => {
    const d = mk([['foo' + O, {inlines: {
      3: inl('hyperlink', 'bar')}}]]).doc;
    assert.equal(count(d).words, 1);
  });
  it('field codes (fldChar, instrText) and deleted text are left ' +
    'out', () => {
    const d = mk([['a ' + O + O + 'b' + O + O + ' c ' + O, {inlines: {
      2: raw('fldChar', 'r'), 3: raw('instrText', 'r', 'PAGE'),
      5: raw('fldChar', 'r'), 6: raw('fldChar', 'r'),
      10: {kind: 'raw', level: 'p', text: 'gone words', node: n('del', wr(n('delText', 'gone words')))}}}]]).doc;
    assert.deepEqual(nums(count(d)), [3, 6, 3, 1]);
  });
});

describe('WordCount: inline XML and properties', () => {
  const para1 = (...kids) => mk([['x ' + O, {inlines: {
    2: xin(kids.length === 1 ? kids[0] : n('smartTag', ...kids))}}]]).doc;
  it('insertions, content controls, smart tags: their text; tabs and ' +
    'breaks inside a link are characters', () => {
    const c = count(para1(n('ins', wr(wt('new words')))));
    assert.deepEqual(nums(c), [3, 11, 9, 1]);
    assert.equal(count(para1(n('sdt', n('sdtContent',
      wr(wt('boxed words')))))).words, 3);
    const l = count(para1(n('hyperlink', wr(wt('a'), n('tab'), wt('b'),
      n('br'), wt('c')))));
    assert.deepEqual(nums(l), [4, 7, 4, 1]);
  });
  it('moved-away text, ruby text and formulas are not counted', () => {
    assert.equal(count(para1(n('moveFrom', wr(wt('away'))))).words, 1);
    assert.equal(count(para1(n('ruby', n('rubyBase', wr(wt('base'))),
      n('rt', wr(wt('guide')))))).words, 2);
    const m = {name: 'm:t', attrs: [], children: ['formula']};
    assert.equal(count(para1(n('r', {name: 'm:oMath', attrs: [],
      children: [{name: 'm:r', attrs: [], children: [m]}]}))).words, 1);
  });
  it('mc:AlternateContent: the Choice only, else the Fallback', () => {
    const ac = (...k) => ({name: 'mc:AlternateContent', attrs: [],
      children: k});
    const mc = (name, ...k) => ({name: 'mc:' + name, attrs: [],
      children: k});
    const both = ac(mc('Choice', wr(wt('shown'))),
      mc('Fallback', wr(wt('shown'))));
    assert.equal(count(para1(wr(both))).words, 2);
    assert.equal(count(para1(wr(ac(mc('Fallback', wr(wt('only'))))))
    ).words, 2);
  });
  it('properties hold no text: tab stops are not characters', () => {
    const pPr = n('pPr', n('tabs', n('tab')), n('rPr', n('b')));
    const d = mk([tbl(wp(pPr, wr(n('rPr', n('tab')), wt('hi'))))]).doc;
    assert.deepEqual(nums(count(d)), [1, 2, 2, 1]);
    const tc = {type: 'opaque', node: n('tbl', n('tblPr', n('tab')),
      n('tr', n('trPr', n('tab')), n('tc', n('tcPr', n('tab')),
        wp(wr(wt('x'))))))};
    assert.equal(count(mk([tc]).doc).chars, 1);
  });
});

describe('WordCount: tables and kept blocks', () => {
  it('a table\'s text is counted: its cells\' paragraphs', () => {
    const d = mk(['before', tbl(wp(wr(wt('cell one'))),
      wp(wr(wt('two')), wr(wt('parts')))), 'after']).doc;
    // "twoparts" is one word (two runs of one paragraph)
    assert.deepEqual(nums(count(d)), [5, 6 + 8 + 8 + 5, 6 + 7 + 8 + 5, 4]);
  });
  it('tabs, breaks and no-break hyphens in a table; fields\' codes ' +
    'and deleted text not', () => {
    const d = mk([tbl(wp(wr(wt('a'), n('tab'), wt('b'), n('br'),
      wt('c')), wr(n('noBreakHyphen'), wt('d')),
    n('del', wr(n('delText', 'gone words'))),
    wr(n('instrText', 'PAGE'), wt('x'))))]).doc;
    // (the line break ends "b"; "c", the hyphen, "d" and the
    // result "x" are one word)
    assert.deepEqual(nums(count(d)), [3, 8, 6, 1]);
  });
  it('a text box or drawing in a table is not walked', () => {
    const d = mk([tbl(wp(wr(wt('in'), n('drawing', n('txbxContent',
      wp(wr(wt('hidden text')))))), wr(wt(' side'))))]).doc;
    assert.equal(count(d).words, 2);
  });
  it('another kept block counts too, and an empty table adds nothing',
    () => {
      const d = mk([{type: 'opaque', node: n('sdt', n('sdtContent',
        wp(wr(wt('boxed words')))))}, tbl(wp(), wp(wr(wt(''))))]).doc;
      assert.deepEqual(nums(count(d)), [2, 11, 10, 1]);
    });
  it('a very deep table does not overflow the stack', () => {
    let node = wp(wr(wt('deep')));
    for (let i = 0; i < 200000; i++) node = n('tc', node);
    const d = mk([{type: 'opaque', node}]).doc;
    const c = count(d);
    assert.equal(c.words, 1);
  });
  it('past 1,000,000 nodes the rest is left out: partial', () => {
    const kids = Array.from({length: 400000}, () => wp(wr(wt('w'))));
    const big = () => ({type: 'opaque', node: {name: 'w:tbl',
      attrs: [], children: kids}});
    const d = mk([big(), big(), 'after']).doc;
    const c = count(d);
    assert.equal(c.partial, true);
    assert.ok(c.words > 0 && c.words < 800000, c.words);
    assert.equal(NODE_LIMIT, 1e6);
    assert.equal(count(mk(['x']).doc).partial, undefined);
  });
});

describe('WordCount: a selection', () => {
  it('across paragraphs: the selected parts only', () => {
    const d = mk(['hello world', 'second line', 'third one']);
    const c = count(d.doc, SEL(d, 0, 6, 2, 5));
    // "world", "second line", "third"
    assert.deepEqual(nums(c), [4, 5 + 11 + 5, 5 + 10 + 5, 3]);
    assert.equal(c.scope, 'selection');
  });
  it('inside a word counts the part as a word', () => {
    const d = mk(['hello world']);
    assert.equal(count(d.doc, SEL(d, 0, 2, 0, 8)).words, 2);
    assert.equal(count(d.doc, SEL(d, 0, 2, 0, 4)).words, 1);
    // backwards is the same
    assert.deepEqual(count(d.doc, SEL(d, 0, 8, 0, 2)),
      count(d.doc, SEL(d, 0, 2, 0, 8)));
  });
  it('a caret counts the whole document', () => {
    const d = mk(['a b', 'c']);
    const c = count(d.doc, C(d, 0, 1));
    assert.equal(c.scope, 'document');
    assert.equal(c.words, 3);
  });
  it('an inline cut by the selection is counted only when inside', () => {
    const d = mk([['x' + O + 'y', {inlines: {
      1: inl('hyperlink', 'link')}}]]);
    assert.equal(count(d.doc, SEL(d, 0, 0, 0, 1)).words, 1);
    assert.equal(count(d.doc, SEL(d, 0, 2, 0, 3)).words, 1);
    assert.equal(count(d.doc, SEL(d, 0, 0, 0, 2)).chars, 5);
  });
  it('a table between the ends counts; at an end only if held', () => {
    const t = tbl(wp(wr(wt('cell words'))));
    const d = mk(['one', t, 'two']);
    assert.equal(count(d.doc, SEL(d, 0, 0, 2, 3)).words, 4);
    assert.equal(count(d.doc, SEL(d, 0, 1, 2, 0)).words, 3);
    const id = blockId(blocksOf(d)[1]);
    const whole = S.select({id, off: 0}, {id, off: 1});
    assert.equal(count(d.doc, whole).words, 2);
    const after = S.select({id, off: 1}, {id: blockId(blocksOf(d)[2]),
      off: 3});
    assert.equal(count(d.doc, after).words, 1);
    const before = S.select({id: blockId(blocksOf(d)[0]), off: 0},
      {id, off: 0});
    assert.equal(count(d.doc, before).words, 1);
  });
  it('a bad selection falls back to the document', () => {
    const d = mk(['a b']);
    const bad = S.select({id: -77, off: 0}, {id: -78, off: 1});
    assert.equal(count(d.doc, bad).words, 2);
  });
});

describe('WordCount: lines', () => {
  const laid = (blocks, w = 1000) => {
    const dc = mkDoc(blocks);
    const L = new DocLayout(dc, tm());
    L.layout(w);
    return {dc, L};
  };
  const at = (dc, i, off) => ({id: blockId(blocksOf({doc: dc})[i]),
    off});
  it('the layout\'s lines of every paragraph; a table has none', () => {
    const long = 'word '.repeat(300).trim();
    const {dc, L} = laid(['short', long, box(), '', 'end']);
    const want = L.items.reduce((a, it) => a + (it.lines
      ? it.lines.length : 0), 0);
    const c = count(dc, null, L);
    assert.equal(c.lines, want);
    assert.ok(c.lines > 5, c.lines);
    assert.equal(L.items[0].lines.length, 1);
  });
  it('a selection counts the lines it touches', () => {
    const long = 'word '.repeat(300).trim();
    const {dc, L} = laid([long, 'tail']);
    const all = L.items[0].lines.length;
    assert.ok(all > 3);
    const first = L.items[0].lines[0];
    const one = S.select(at(dc, 0, 0), at(dc, 0, first.to - 1));
    assert.equal(count(dc, one, L).lines, 1);
    const two = S.select(at(dc, 0, 0), at(dc, 1, 2));
    assert.equal(count(dc, two, L).lines, all + 1);
    assert.equal(countView({d: {doc: dc}, sel: two, L}).lines, all + 1);
  });
});

describe('WordCount: size', () => {
  it('1,000,000 words in well under a second', () => {
    const d = mk([...Array.from({length: 1000}, () =>
      'alpha beta gamma delta '.repeat(250))]).doc;
    const t0 = Date.now();
    const c = count(d);
    assert.equal(c.words, 1000000);
    assert.ok(Date.now() - t0 < 1000, Date.now() - t0 + ' ms');
    assert.equal(c.paras, 1000);
  });
  it('one 5 MB paragraph', () => {
    const d = mk(['ab cd '.repeat(900000)]).doc;
    const t0 = Date.now();
    assert.equal(count(d).words, 1800000);
    assert.ok(Date.now() - t0 < 1000);
  });
});

describe('WordCount: a selection in a typed table (C3.5)', () => {
  const T = () => modelTable([['one two', 'three'], ['four', 'five six']]);
  const cell = (d, r, c) => d.doc.sections[0].blocks[1].rows[r].cells[c]
    .blocks[0];
  it('an end in a cell counts the selection, not the document', () => {
    const d = mk(['a b', T(), 'c']);
    const p0 = blocksOf(d)[0];
    // from the paragraph before into cell (0,1): row 0 whole (Word)
    const x = count(d.doc, S.select({id: p0.id, off: 0},
      {id: cell(d, 0, 1).id, off: 1}));
    assert.deepEqual([x.scope, x.words, x.paras], ['selection', 5, 3]);
    // inside one cell: its text only
    const y = count(d.doc, S.select({id: cell(d, 1, 1).id, off: 0},
      {id: cell(d, 1, 1).id, off: 4}));
    assert.deepEqual([y.scope, y.words, y.paras], ['selection', 1, 1]);
    // a column of cells: (0,0) and (1,0)
    const z = count(d.doc, S.select({id: cell(d, 0, 0).id, off: 1},
      {id: cell(d, 1, 0).id, off: 1}));
    assert.deepEqual([z.words, z.paras], [3, 2]);
    assert.equal(count(d.doc).words, 9);
  });
  it('lines: the lines of a typed table\'s cells count, in the ' +
    'document and in a selection over the table (C3 fix wave)', () => {
    const long = 'word '.repeat(40).trim();
    const d = mk(['a b', modelTable([[long, 'x'], ['y', 'z']]), 'c']);
    const L = new DocLayout(d.doc, tm());
    L.layout(800);
    const want = [...L.byId.values()].reduce((a, it) => a +
      (it.kind === 'p' ? it.lines.length : 0), 0);
    assert.ok(want > 6, 'the long cell wraps: ' + want);
    assert.equal(count(d.doc, null, L).lines, want);
    const p0 = blocksOf(d)[0], p2 = blocksOf(d)[2];
    const all = S.select({id: p0.id, off: 0}, {id: p2.id, off: 1});
    assert.equal(count(d.doc, all, L).lines, want);
    assert.equal(count(d.doc, null, L).words, 3 + 40 + 3);
  });
});

describe('WordCount: footnotes and endnotes', () => {
  const X = {notes: true};
  const bp = (d, i) => d.sections[0].blocks[i];
  /** body: "one two" + footnote 1 (3 words), "three" + endnote 1
   *  (2 words), "four". */
  const base = () => noteDoc(
    p(r('one two') + mark(1)) + p(r('three') + emark(1)) +
    p(r('four')),
    {1: noteP('alpha beta gamma')},
    {endnotes: {1: enoteP('delta epsilon')}});
  it('off: the numbers of a document without notes', async () => {
    const d = await base();
    assert.deepEqual(nums(count(d)), [4, 16, 15, 3]);
    assert.deepEqual(count(d, null, null, {notes: false}), count(d));
    assert.deepEqual(count(d, null, null, {}), count(d));
  });
  it('on: the footnote and the endnote text too', async () => {
    const d = await base();
    // ' alpha beta gamma' = 17 (14 without spaces), ' delta
    // epsilon' = 14 (12): the space after the mark is text
    const c = count(d, null, null, X);
    assert.deepEqual(nums(c), [9, 16 + 17 + 14, 15 + 14 + 12, 5]);
    assert.equal(c.scope, 'document');
    assert.equal(c.lines, null);
  });
  it('the notes\' own marks are no words or characters', async () => {
    const d = await noteDoc(p(r('a') + mark(1)), {1: noteP('b')});
    // "a" + " b": the mark gives nothing, the space is a character
    assert.deepEqual(nums(count(d, null, null, X)), [2, 3, 2, 2]);
  });
  it('a custom mark\'s text is not counted', async () => {
    const cm = '<w:r><w:footnoteReference w:customMarkFollows="1" ' +
      'w:id="1"/><w:t>***</w:t></w:r>';
    const d = await noteDoc(p(r('a') + cm), {1: noteP('b')});
    assert.equal(Object.values(bp(d, 0).inlines)[0].custom, '***');
    assert.deepEqual(nums(count(d, null, null, X)), [2, 3, 2, 2]);
  });
  it('a selection counts the notes whose marks it holds', async () => {
    const d = await noteDoc(
      p(r('one') + mark(1) + r(' two') + mark(2)),
      {1: noteP('aa bb'), 2: noteP('cc dd ee')});
    const id = bp(d, 0).id;
    const sel = (a, e) => S.select({id, off: a}, {id, off: e});
    // "one" + mark 1 only
    assert.equal(count(d, sel(0, 2), null, X).words, 1);
    assert.equal(count(d, sel(0, 4), null, X).words, 3);
    assert.equal(count(d, sel(1, 4), null, X).words, 3);
    // " two" and mark 2
    assert.equal(count(d, sel(4, 9), null, X).words, 1 + 3);
    assert.equal(count(d, sel(4, 9)).words, 1);
    // all
    assert.equal(count(d, sel(0, 9), null, X).words, 1 + 1 + 2 + 3);
    assert.equal(count(d, null, null, X).words, 7);
    // three different marks, three note paragraphs
    assert.equal(count(d, sel(0, 9), null, X).paras, 3);
  });
  it('two marks to one note in a selection count it once',
    async () => {
      const d = await noteDoc(p(r('x') + mark(1) + r('y') + mark(1)),
        {1: noteP('aa bb')});
      const id = bp(d, 0).id;
      const c = count(d, S.select({id, off: 0}, {id, off: 4}), null, X);
      assert.deepEqual([c.words, c.paras], [3, 2]);
      assert.equal(count(d, null, null, X).words, 3);
    });
  it('an orphan note, a missing note and the separators count ' +
    'nothing', async () => {
    const d = await noteDoc(p(r('a') + mark(1) + mark(9)),
      {1: noteP('b'), 2: noteP('orphan words here')});
    assert.equal(count(d, null, null, X).words, 2);
    const f = await noteDoc(p(r('a') + mark(1)), {});
    assert.deepEqual(count(f, null, null, X), count(f));
  });
  it('a table in a note counts its paragraphs', async () => {
    const t = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/>' +
      '</w:tblGrid><w:tr><w:tc>' + p(r('c1 c2')) +
      '</w:tc></w:tr></w:tbl>';
    const d = await noteDoc(p(r('a') + mark(1)),
      {1: noteP('b') + t});
    const c = count(d, null, null, X);
    assert.deepEqual([c.words, c.paras], [4, 3]);
  });
  it('a notes mode (a story) counts its own text only', async () => {
    const d = await noteDoc(p(r('a') + mark(1)), {1: noteP('b c')});
    const story = {...d, sections: [{...d.sections[0],
      blocks: d.notes.footnotes.get(1).blocks}]};
    assert.equal(count(story, null, null, X).words, 2);
    const v = {d: {doc: story}, hdr: {}, sel: null, L: null};
    assert.equal(countView(v, X).words, 2);
    assert.equal(countView({d: {doc: d}, sel: null, L: null}, X)
      .words, 3);
  });
  it('the 1,000,000 node cap holds in a note too', async () => {
    const d = await noteDoc(p(r('a') + mark(1)), {1: noteP('b')});
    const kids = Array.from({length: NODE_LIMIT + 10}, () =>
      wr(wt('w')));
    d.notes.footnotes.get(1).blocks.push({type: 'opaque',
      node: {name: 'w:p', attrs: [], children: kids}});
    const c = count(d, null, null, X);
    assert.equal(c.partial, true);
    assert.equal(count(d).partial, undefined);
  });
  it('10,000 notes: near the cost of the body alone (WORD_PERF=1 ' +
    'for the time)', async () => {
    const N = 10000;
    const notes = {};
    let body = '';
    for (let i = 1; i <= N; i++) {
      body += p(r('w ') + mark(i));
      notes[i] = noteP('some note words');
    }
    const d = await noteDoc(body, notes);
    const best = (o) => {
      let b = Infinity;
      for (let k = 0; k < 5; k++) {
        const t0 = performance.now();
        count(d, null, null, o);
        b = Math.min(b, performance.now() - t0);
      }
      return b;
    };
    const off = best({}), on = best(X);
    assert.equal(count(d, null, null, X).words, N * 4);
    console.log(`# 10,000 notes: ${on.toFixed(1)} ms, without ` +
      `${off.toFixed(1)} ms`);
    assert.ok(on / off < 30, 'ratio ' + (on / off).toFixed(1));
    if (process.env.WORD_PERF) assert.ok(on < 1000, on + ' ms');
  });
});

describe('WordCount: a custom mark in the note', () => {
  const X = {notes: true};
  const setup = async (doc) => {
    const d = new Document(await doc);
    return {d, t: new Typing(d)};
  };
  const EM = '\u{1F600}'.repeat(10);       // 10 code points, 20 units
  const fixture = () => noteDoc(p(r('a') + mark(1) + emark(1)),
    {1: noteP('b')}, {endnotes: {1: enoteP('c')}});
  it('footnote and endnote: the mark text is not counted, the ' +
    'space after it is, as after the automatic mark', async () => {
    const {d, t} = await setup(fixture());
    const auto = count(d.doc, null, null, X);
    assert.deepEqual(nums(auto), [3, 5, 3, 3]);
    for (const kind of ['footnote', 'endnote']) {
      for (const m of ['***', EM, '\u2020']) {
        assert.equal(customMark(d, t, kind, 1, m).changed, true);
        assert.deepEqual(count(d.doc, null, null, X), auto, kind + m);
        const a = bodyBlock(d);
        const sel = S.select({id: a.id, off: 0},
          {id: a.id, off: a.text.length});
        assert.deepEqual(nums(count(d.doc, sel, null, X)),
          nums(auto), 'selection ' + kind + m);
        customMark(d, t, kind, 1, null);
        assert.deepEqual(count(d.doc, null, null, X), auto);
      }
    }
  });
  const bodyBlock = (d) => d.doc.sections[0].blocks[0];
  it('both notes custom at once, then cleared', async () => {
    const {d, t} = await setup(fixture());
    const auto = count(d.doc, null, null, X);
    customMark(d, t, 'footnote', 1, EM);
    customMark(d, t, 'endnote', 1, '*');
    assert.deepEqual(count(d.doc, null, null, X), auto);
    customMark(d, t, 'footnote', 1, null);
    customMark(d, t, 'endnote', 1, null);
    assert.deepEqual(count(d.doc, null, null, X), auto);
  });
  it('converting the note keeps the numbers', async () => {
    const {d, t} = await setup(fixture());
    const auto = count(d.doc, null, null, X);
    customMark(d, t, 'footnote', 1, '***');
    const out = convertNote(d, t, null, 'allFootnotes');
    assert.ok(out.changed !== false, JSON.stringify(out));
    assert.deepEqual(count(d.doc, null, null, X), auto);
  });
  it('the body-side custom mark stays out too', async () => {
    const cm = '<w:r><w:footnoteReference w:customMarkFollows="1" ' +
      'w:id="1"/><w:t>***</w:t></w:r>';
    const d = await noteDoc(p(r('a') + cm), {1: noteP('b')});
    assert.deepEqual(nums(count(d, null, null, X)), [2, 3, 2, 2]);
  });
  it('a note-free document is not scanned', async () => {
    const d = await noteDoc(p(r('a b')) + p(r('c')), {});
    let reads = 0;
    const blocks = d.sections[0].blocks.map((b) => {
      const o = Object.create(b);
      Object.defineProperty(o, 'text', {get() { reads++; return b.text; }});
      return o;
    });
    const dd = {...d, sections: [{...d.sections[0], blocks}]};
    dd.notes = {...d.notes, footnotes: new Map(), endnotes: new Map()};
    count(dd, null, null, {});
    const off = reads;
    reads = 0;
    count(dd, null, null, X);
    assert.equal(reads, off);
    assert.deepEqual(count(dd, null, null, X), count(dd));
  });
  it('custom-mark notes: linear in their number (WORD_PERF=1 for ' +
    'the time)', async () => {
    const build = (N) => {
      const notes = {};
      let body = '';
      for (let i = 1; i <= N; i++) {
        body += p(r('w ') + '<w:r><w:footnoteReference ' +
          'w:customMarkFollows="1" w:id="' + i + '"/><w:t>***</w:t>' +
          '</w:r>');
        notes[i] = p(r('*** some note words'));
      }
      return noteDoc(body, notes);
    };
    const best = (d) => {
      let b = Infinity;
      for (let k = 0; k < 3; k++) {
        const t0 = performance.now();
        count(d, null, null, X);
        b = Math.min(b, performance.now() - t0);
      }
      return b;
    };
    const small = await build(1000), big = await build(4000);
    assert.equal(count(small, null, null, X).words, 1000 * 4);
    const a = best(small), b = best(big);
    console.log(`# custom notes: 1,000 ${a.toFixed(1)} ms, 4,000 ` +
      `${b.toFixed(1)} ms, ratio ${(b / a).toFixed(1)}`);
    // (4 times the notes: about 4 times the time; quadratic is 16)
    assert.ok(b / a < 9, 'ratio ' + (b / a).toFixed(1));
    const ten = await build(10000);
    assert.equal(count(ten, null, null, X).words, 40000);
    const c = best(ten);
    console.log(`# custom notes: 10,000 ${c.toFixed(1)} ms`);
    if (process.env.WORD_PERF) assert.ok(c < 1000, c + ' ms');
  });
});
