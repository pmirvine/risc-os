// ParaInd: the indents a paragraph is drawn with (style < numbering
// level < direct), and everything that shows or changes indents using
// them: Format.query, the ruler's markers (RulerInd), Ctrl-M and
// Ctrl-Shift-M (indentBy), a ruler drag (dragIndents).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {effective, levelInd, listOf}
  from '../../tools/moreapps/!Word/ParaInd';
import {labels} from '../../tools/moreapps/!Word/ListNumbers';
import {query} from '../../tools/moreapps/!Word/Format';
import {firstIndents} from '../../tools/moreapps/!Word/RulerInd';
import {indentBy, dragIndents} from '../../tools/moreapps/!Word/FormatPara';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {newPara} from '../../tools/moreapps/!Word/Model';
import {P, C, SEL, undoable, blocks} from './edit-docs.mjs';
import {tm} from './word-docs.mjs';
import {listDoc, li, lv, N} from './list-docs.mjs';

const T = (d) => new Typing(d);
/** The first line of paragraph k laid out: text x and label x (px). */
function drawn(d, k) {
  const L = new DocLayout(d.doc, tm());
  L.layout(900);
  const ln = L.items[k].lines[0];
  return {text: ln.x, label: ln.label ? ln.label.x : null};
}

describe('ParaInd.effective', () => {
  it('a list paragraph: the level\'s left and hanging', () => {
    const d = listDoc([li('a'), li('b', 1), 'plain']);
    assert.deepEqual(effective(d.doc, P(d, 0)),
      {left: 720, first: -360, right: 0});
    assert.deepEqual(effective(d.doc, P(d, 1)),
      {left: 1440, first: -360, right: 0});
    assert.deepEqual(effective(d.doc, P(d, 2)),
      {left: 0, first: 0, right: 0});
  });
  it('direct ind wins attribute by attribute; the style is under ' +
    'the level', () => {
    const d = listDoc([li('a', 0, {pPr: {ind: {left: 2000}}}),
      li('b', 0, {pPr: {ind: {firstLine: 100, right: 50}}}),
      ['c', {pStyle: 'Indented', pPr: {numPr: {numId: 1, ilvl: 1}}}],
      ['d', {pStyle: 'Indented'}]]);
    assert.deepEqual(effective(d.doc, P(d, 0)),
      {left: 2000, first: -360, right: 0});
    assert.deepEqual(effective(d.doc, P(d, 1)),
      {left: 720, first: 100, right: 50});
    assert.deepEqual(effective(d.doc, P(d, 2)),
      {left: 1440, first: -360, right: 0});
    assert.deepEqual(effective(d.doc, P(d, 3)),
      {left: 2880, first: 0, right: 0});
  });
  it('the labels\' indents may be given (the layout\'s map)', () => {
    const d = listDoc([li('a', 2)]);
    const m = labels(d.doc);
    assert.deepEqual(effective(d.doc, P(d, 0), m),
      effective(d.doc, P(d, 0)));
  });
  it('style numbering, numId 0, unknown numIds, no numbering', () => {
    const d = listDoc([['h', {pStyle: 'ListHead'}],
      ['n', {pStyle: 'ListHead', pPr: {numPr: {numId: 0}}}],
      ['u', {pPr: {numPr: {numId: 5, ilvl: 0}}}]]);
    assert.deepEqual(listOf(d.doc, P(d, 0)),
      {numId: 1, ilvl: 0, fromStyle: true});
    assert.equal(listOf(d.doc, P(d, 1)), null);
    assert.equal(listOf(d.doc, P(d, 2)), null);
    assert.deepEqual(effective(d.doc, P(d, 0)).left, 720);
    assert.deepEqual(effective(d.doc, P(d, 1)).left, 0);
    const bare = listDoc([li('a')]);
    bare.doc.numbering = null;
    assert.equal(listOf(bare.doc, P(bare, 0)), null);
    assert.deepEqual(effective(bare.doc, P(bare, 0)),
      {left: 0, first: 0, right: 0});
  });
  it('levelInd agrees with the labels\' indent (random documents)',
    () => {
      let seed = 7;
      const rnd = (n) => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed % n;
      };
      for (let t = 0; t < 200; t++) {
        const levels = Array.from({length: 9}, (_, k) => (rnd(3) ? lv(k,
          rnd(4) ? {} : {pPr: rnd(2) ? {} : {ind: {firstLine: 99,
            hanging: 7}}, pStyle: rnd(2) ? 'ListHead' : undefined})
          : undefined));
        const nums = new Map([[1, N(levels)], [2, N([lv(0)], 2)]]);
        const paras = Array.from({length: 12}, (_, i) => {
          const r = rnd(5);
          if (r === 0) return 'p' + i;
          if (r === 1) return ['h' + i, {pStyle: 'ListHead'}];
          return ['l' + i, {pPr: {numPr: {numId: 1 + rnd(3),
            ilvl: rnd(9)}}}];
        });
        const d = listDoc(paras, nums);
        const m = labels(d.doc);
        for (const b of blocks(d)) {
          const l = m.get(b.id);
          assert.deepEqual(levelInd(d.doc, b), l ? l.indent : undefined);
          assert.equal(!!listOf(d.doc, b), !!l);
        }
      }
    });
});

describe('list-aware indents: query, ruler, Ctrl-M, drags', () => {
  it('Format.query gives the drawn indents of a list paragraph', () => {
    const d = listDoc([li('ab'), li('cd', 1)]);
    const q = query(d.doc, C(d, 0, 1));
    assert.deepEqual([q.indentLeft, q.indentFirst], [720, -360]);
    const q2 = query(d.doc, SEL(d, 0, 0, 1, 1));
    assert.equal(q2.indentLeft, null, 'mixed');
    assert.equal(q2.indentFirst, -360);
  });
  it('the ruler\'s markers are where the text and label are drawn',
    () => {
      // (labels that fit their hanging space: the text starts at
      // the left indent)
      const d = listDoc([li('ab'), li('cd', 0, {pPr: {ind:
        {left: 3000}}}), ['h', {pStyle: 'ListHead'}]]);
      for (const k of [0, 1, 2]) {
        const r = firstIndents(d.doc, C(d, k, 0));
        const w = drawn(d, k);
        assert.equal(r.left / 15, w.text, `left ${k}`);
        assert.equal((r.left + r.first) / 15, w.label, `first ${k}`);
      }
    });
  it('Ctrl-M moves a list paragraph\'s text and label by 720 twips',
    () => {
      const d = listDoc([li('ab'), li('cd')]);
      const w0 = drawn(d, 0);
      undoable(d, () => indentBy(d, T(d), C(d, 0, 1), 720));
      assert.deepEqual(P(d, 0).pPr.ind, {left: 1440});
      const w1 = drawn(d, 0);
      assert.equal(w1.text - w0.text, 48);
      assert.equal(w1.label - w0.label, 48);
      assert.deepEqual(effective(d.doc, P(d, 0)),
        {left: 1440, first: -360, right: 0});
      // back: the level's own value again, so the direct one goes
      undoable(d, () => indentBy(d, T(d), C(d, 0, 1), -720));
      assert.equal(P(d, 0).pPr.ind, undefined);
      assert.deepEqual(drawn(d, 0), w0);
      // less from the level's 720: 0, written (the level gives 720)
      undoable(d, () => indentBy(d, T(d), C(d, 0, 1), -720));
      assert.deepEqual(P(d, 0).pPr.ind, {left: 0});
      assert.equal(effective(d.doc, P(d, 0)).left, 0);
    });
  it('a ruler drag of a list paragraph starts from its drawn indents',
    () => {
      const d = listDoc([li('ab'), li('cd')]);
      const arg = (marker, at) => ({marker, at, textW: 9026});
      // the left box: the first line moves with it (hanging kept)
      undoable(d, () => dragIndents(d, T(d), C(d, 0, 0),
        arg('left', 1440)));
      assert.deepEqual(P(d, 0).pPr.ind, {left: 1440});
      assert.deepEqual(effective(d.doc, P(d, 0)),
        {left: 1440, first: -360, right: 0});
      // the hanging triangle: left only, the first line stays at 360
      undoable(d, () => dragIndents(d, T(d), C(d, 1, 0),
        arg('hanging', 1080)));
      assert.deepEqual(effective(d.doc, P(d, 1)),
        {left: 1080, first: -720, right: 0});
      assert.deepEqual(P(d, 1).pPr.ind, {left: 1080, hanging: 720});
      // the first-line triangle onto the left indent: firstLine 0
      undoable(d, () => dragIndents(d, T(d), C(d, 0, 0),
        arg('first', 1440)));
      assert.deepEqual(effective(d.doc, P(d, 0)),
        {left: 1440, first: 0, right: 0});
      assert.deepEqual(P(d, 0).pPr.ind, {left: 1440, firstLine: 0});
    });
});

describe('LineLabel.sameLabel: a level indent absent or 0', () => {
  it('relays out: absent and {left: 0} lay out differently under a ' +
    'style indent', async () => {
    const {sameLabel} = await import('../../tools/moreapps/!Word/LineLabel');
    const {layoutPara} = await import('../../tools/moreapps/!Word/LineLayout');
    const d = listDoc([]);
    const p = newPara('text', {pStyle: 'Indented'});
    const base = {text: '1.', level: 0, numId: 1, suff: 'tab',
      jc: 'left', rPr: null, bullet: false, fmt: 'decimal'};
    const a = base, b = {...base, indent: {left: 0}};
    assert.equal(sameLabel(a, b), false);
    const la = layoutPara(p, d.doc.styles, 600, tm(), new Map(), a);
    const lb = layoutPara(p, d.doc.styles, 600, tm(), new Map(), b);
    assert.notEqual(la.lines[0].x, lb.lines[0].x);
    assert.equal(sameLabel(b, {...base, indent: {left: 0}}), true);
  });
});
