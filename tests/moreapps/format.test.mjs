// Format.query (the formatting of a selection), Pending (the format
// for the next typed text) and typing with a pending format.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../../tools/moreapps/!Word/Format';
import * as Pd from '../../tools/moreapps/!Word/Pending';
import * as E from '../../tools/moreapps/!Word/Edit';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {mk, P, C, SEL, texts, undoable, valid, box, bold, plain}
  from './edit-docs.mjs';

/** [text1 + text2, opts]: text2 formatted with r2. */
const two = (t1, t2, r2 = bold) => [t1 + t2, {runs: [
  {start: 0, end: t1.length, rPr: plain},
  {start: t1.length, end: t1.length + t2.length, rPr: r2}]}];

describe('Format.query', () => {
  it('plain text: every value', () => {
    const d = mk(['hello']);
    assert.deepEqual(F.query(d.doc, SEL(d, 0, 0, 0, 5)), {
      bold: false, italic: false, underline: false, strike: false,
      size: 11, family: 'Calibri', color: 'auto', highlight: 'none',
      vert: 'baseline', align: 'left', indentLeft: 0, indentFirst: 0,
      indentRight: 0, spaceBefore: 0, spaceAfter: 160,
      lineSpacing: {line: 259, rule: 'auto'}, style: 'Normal'});
  });
  it('a bold run, and mixed across runs (null)', () => {
    const d = mk([two('ab', 'cd')]);
    assert.equal(F.query(d.doc, SEL(d, 0, 2, 0, 4)).bold, true);
    assert.equal(F.query(d.doc, SEL(d, 0, 0, 0, 2)).bold, false);
    const q = F.query(d.doc, SEL(d, 0, 1, 0, 3));
    assert.equal(q.bold, null);
    assert.equal(q.italic, false);
    // backwards selection: the same
    assert.equal(F.query(d.doc, SEL(d, 0, 3, 0, 1)).bold, null);
  });
  it('mixed across paragraphs (character and paragraph values)', () => {
    const d = mk(['ab', ['cd', {rPr: bold, pPr: {jc: 'center',
      extra: []}}]]);
    const q = F.query(d.doc, SEL(d, 0, 0, 1, 2));
    assert.equal(q.bold, null);
    assert.equal(q.align, null);
    assert.equal(q.size, 11);
    const r = F.query(d.doc, SEL(d, 1, 0, 1, 2));
    assert.equal(r.bold, true);
    assert.equal(r.align, 'center');
  });
  it('a heading is bold from its style', () => {
    const d = mk([['Title', {pStyle: 'Heading1'}]]);
    const q = F.query(d.doc, SEL(d, 0, 0, 0, 5));
    assert.equal(q.bold, true);
    assert.equal(q.size, 16);
    assert.equal(q.style, 'Heading1');
    assert.equal(q.spaceBefore, 240);
  });
  it('a caret: the character before it, at 0 the first', () => {
    const d = mk([two('ab', 'cd')]);
    assert.equal(F.query(d.doc, C(d, 0, 3)).bold, true);
    assert.equal(F.query(d.doc, C(d, 0, 2)).bold, false);
    assert.equal(F.query(d.doc, C(d, 0, 4)).bold, true);
    assert.equal(F.query(d.doc, C(d, 0, 0)).bold, false);
    const e = mk([two('', 'cd')]);
    assert.equal(F.query(e.doc, C(e, 0, 0)).bold, true);
  });
  it('an empty paragraph: its style and the defaults', () => {
    const d = mk(['', ['', {pStyle: 'Heading2'}]]);
    const q = F.query(d.doc, C(d, 0, 0));
    assert.equal(q.bold, false);
    assert.equal(q.size, 11);
    assert.equal(F.query(d.doc, C(d, 1, 0)).bold, true);
    assert.equal(F.query(d.doc, C(d, 1, 0)).size, 13);
  });
  it('a selection with no characters: as a caret at its start', () => {
    const d = mk([['', {rPr: bold}], '']);
    const q = F.query(d.doc, SEL(d, 0, 0, 1, 0));
    assert.equal(q.bold, false);
    assert.equal(q.align, 'left');
  });
  it('kept blocks are skipped', () => {
    const d = mk([['ab', {rPr: bold}], box(), ['cd', {rPr: bold}]]);
    assert.equal(F.query(d.doc, SEL(d, 0, 0, 2, 2)).bold, true);
    const k = F.query(d.doc, SEL(d, 1, 0, 1, 1));
    assert.equal(k.bold, null);
    assert.equal(k.align, null);
  });
  it('size, family, colour, highlight, vert, indents', () => {
    const rPr = {sz: 29, rFonts: {ascii: 'Arial', hAnsi: 'Arial'},
      color: 'ff0000', highlight: 'yellow', vertAlign: 'superscript',
      u: 'double', strike: true, i: true, extra: []};
    const pPr = {jc: 'both', ind: {left: 720, hanging: 360,
      right: 100}, spacing: {before: 120, line: 480, lineRule: 'auto'},
    extra: []};
    const d = mk([['x', {rPr, pPr}]]);
    const q = F.query(d.doc, SEL(d, 0, 0, 0, 1));
    assert.equal(q.size, 14.5);
    assert.equal(q.family, 'Arial');
    assert.equal(q.color, 'FF0000');
    assert.equal(q.highlight, 'yellow');
    assert.equal(q.vert, 'superscript');
    assert.equal(q.underline, true);
    assert.equal(q.strike, true);
    assert.equal(q.italic, true);
    assert.equal(q.align, 'both');
    assert.equal(q.indentLeft, 720);
    assert.equal(q.indentFirst, -360);
    assert.equal(q.indentRight, 100);
    assert.equal(q.spaceBefore, 120);
    assert.deepEqual(q.lineSpacing, {line: 480, rule: 'auto'});
    const e = mk([['x', {rPr: {color: 'auto', u: 'none', extra: []}}]]);
    const r = F.query(e.doc, C(e, 0, 1));
    assert.equal(r.color, 'auto');
    assert.equal(r.underline, false);
  });
  it('pending overrides the caret, not a selection', () => {
    const d = mk([two('ab', 'cd')]);
    const pend = {b: true, i: true, sz: 40};
    const q = F.query(d.doc, C(d, 0, 1), pend);
    assert.equal(q.bold, true);
    assert.equal(q.italic, true);
    assert.equal(q.size, 20);
    assert.equal(F.query(d.doc, C(d, 0, 3), {b: null}).bold, false);
    assert.equal(F.query(d.doc, SEL(d, 0, 0, 0, 1), pend).bold, false);
  });
  it('a bad position gives all null', () => {
    const d = mk(['ab']);
    const q = F.query(d.doc, C(d, 0, 9));
    assert.equal(q.bold, null);
    assert.equal(q.style, null);
  });
  it('a document without styles', () => {
    const d = mk([['ab', {rPr: bold}]], {styles: false});
    const q = F.query(d.doc, C(d, 0, 1));
    assert.equal(q.bold, true);
    assert.equal(q.size, 11);
  });
});

describe('Pending', () => {
  it('merge, isEmpty, forTyping', () => {
    assert.ok(Pd.isEmpty(Pd.EMPTY));
    assert.ok(Pd.isEmpty(undefined));
    const p = Pd.merge(Pd.EMPTY, {b: true});
    assert.deepEqual(p, {b: true});
    assert.ok(!Pd.isEmpty(p));
    assert.deepEqual(Pd.merge(p, {i: true}), {b: true, i: true});
    assert.deepEqual(Pd.forTyping(p), {b: true});
    assert.equal(Pd.forTyping(Pd.EMPTY), undefined);
    assert.equal(Pd.styleFor(p), undefined);
    assert.equal(Pd.styleFor({rStyle: 'Strong'}), 'Strong');
    assert.equal(Pd.forTyping({rStyle: 'Strong'}), undefined);
  });
  it('merge with a base drops what changes nothing', () => {
    const base = {rPr: {b: true, extra: []}};
    assert.deepEqual(Pd.merge({}, {b: true}, base), {});
    assert.deepEqual(Pd.merge({b: null}, {b: true}, base), {});
    assert.deepEqual(Pd.merge({}, {i: null}, base), {});
    assert.deepEqual(Pd.merge({}, {b: null}, base), {b: null});
    assert.deepEqual(Pd.merge({}, {rStyle: null}, base), {});
    assert.deepEqual(Pd.merge({}, {rStyle: 'X'},
      {rPr: plain, rStyle: 'X'}), {});
  });
  it('applyTo merges and drops raw elements it replaces', () => {
    const rawB = {name: 'w:b', attrs: [], children: []};
    const rPr = {i: true, extra: [rawB]};
    assert.deepEqual(Pd.applyTo(rPr, {b: true}),
      {i: true, b: true, extra: []});
    assert.deepEqual(rPr, {i: true, extra: [rawB]});
    assert.deepEqual(Pd.applyTo(rPr, {i: null}), {extra: [rawB]});
    assert.equal(Pd.applyTo(rPr, undefined), rPr);
  });
});

describe('typeText with a format (pending)', () => {
  it('{rPr} formats only the new text', () => {
    const d = mk(['abcd']);
    const s = undoable(d, () => E.typeText(d, C(d, 0, 2), 'XY',
      {rPr: {b: true}}));
    assert.deepEqual(texts(d), ['abXYcd']);
    assert.deepEqual(P(d, 0).runs, [
      {start: 0, end: 2, rPr: plain},
      {start: 2, end: 4, rPr: bold},
      {start: 4, end: 6, rPr: plain}]);
    assert.equal(s.head.off, 4);
    valid(d);
  });
  it('merges into the format the text would have had', () => {
    const d = mk([['ab', {rPr: {i: true, extra: []}, rStyle: 'S'}]]);
    E.typeText(d, C(d, 0, 2), 'X', {rPr: {b: true}});
    assert.deepEqual(P(d, 0).runs[1], {start: 2, end: 3,
      rPr: {i: true, b: true, extra: []}, rStyle: 'S'});
    E.typeText(d, C(d, 0, 3), 'Y', {rPr: {i: null}, rStyle: null});
    assert.deepEqual(P(d, 0).runs[2], {start: 3, end: 4,
      rPr: {b: true, extra: []}});
  });
  it('over a selection, and with \\n', () => {
    const d = mk([['abc', {rPr: {i: true, extra: []}}]]);
    E.typeText(d, SEL(d, 0, 1, 0, 2), 'X\nY', {rPr: {b: true}});
    assert.deepEqual(texts(d), ['aX', 'Yc']);
    assert.deepEqual(P(d, 0).runs[1].rPr, {i: true, b: true,
      extra: []});
    assert.deepEqual(P(d, 1).runs[0], {start: 0, end: 1,
      rPr: {i: true, b: true, extra: []}});
    valid(d);
  });
  it('in an empty paragraph and by a kept block', () => {
    const d = mk(['', box()]);
    E.typeText(d, C(d, 0, 0), 'a', {rPr: {b: true}});
    assert.deepEqual(P(d, 0).runs, [{start: 0, end: 1, rPr: bold}]);
    E.typeText(d, C(d, 1, 1), 'b', {rPr: {b: true}});
    assert.deepEqual(texts(d), ['a', '#', 'b']);
    assert.deepEqual(P(d, 2).runs, [{start: 0, end: 1, rPr: bold}]);
  });
  it('Typing.type passes the format; plain typing then continues',
    () => {
      const d = mk(['ab']);
      const t = new Typing(d, {now: () => 0});
      let s = t.type(C(d, 0, 2), 'X', {rPr: {b: true}});
      s = t.type(s, 'Y');
      assert.deepEqual(texts(d), ['abXY']);
      assert.deepEqual(P(d, 0).runs[1], {start: 2, end: 4, rPr: bold});
      assert.equal(d.undoDepth, 1);
      d.undo();
      assert.deepEqual(texts(d), ['ab']);
    });
});
