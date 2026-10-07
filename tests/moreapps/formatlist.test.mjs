// FormatList: a list paragraph's level changed (Tab / Shift-Tab, the
// Format menu's Demote / Promote) or its numbering removed (Remove
// from list, Backspace at its start), one undo step, nothing for
// paragraphs not in a list.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {setList, listParas, hasList}
  from '../../tools/moreapps/!Word/FormatList';
import * as FS from '../../tools/moreapps/!Word/FormatSet';
import {apply, isFormat} from '../../tools/moreapps/!Word/FormatApply';
import {labels} from '../../tools/moreapps/!Word/ListNumbers';
import {paraNumPr} from '../../tools/moreapps/!Word/Styles';
import {paraFmt} from '../../tools/moreapps/!Word/Fmt';
import {effective} from '../../tools/moreapps/!Word/ParaInd';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {P, C, SEL, texts, undoable, blocks} from './edit-docs.mjs';
import {listDoc, li, lv, N} from './list-docs.mjs';

const T = (d) => new Typing(d);
const run = (d, sel, patch) => undoable(d, () =>
  setList(d, T(d), sel, patch));
/** The label text of each paragraph (null: none). */
const shown = (d) => {
  const m = labels(d.doc);
  return blocks(d).map((b) => (m.has(b.id) ? m.get(b.id).text : null));
};
const numPr = (d, k) => P(d, k).pPr.numPr;

describe('FormatList.setList: levels', () => {
  it('by +1 demotes: ilvl 1, the labels renumber, one undo step',
    () => {
      const d = listDoc([li('a'), li('b'), li('c')]);
      assert.deepEqual(shown(d), ['1.', '2.', '3.']);
      const sel = C(d, 1, 0);
      const out = run(d, sel, {by: 1});
      assert.equal(out.sel, sel);
      assert.deepEqual(out.pending, {});
      assert.deepEqual(numPr(d, 1), {numId: 1, ilvl: 1});
      assert.deepEqual(shown(d), ['1.', '1.1.', '2.']);
      assert.deepEqual(texts(d), ['a', 'b', 'c']);
      assert.equal(d.undoDepth, 1);
      assert.ok(d.dirty);
      d.undo();
      assert.deepEqual(shown(d), ['1.', '2.', '3.']);
      d.redo();
      assert.deepEqual(shown(d), ['1.', '1.1.', '2.']);
    });
  it('by -1 promotes; at level 0 nothing: no undo step, not dirty',
    () => {
      const d = listDoc([li('a'), li('b', 2)]);
      run(d, C(d, 1, 1), {by: -1});
      assert.deepEqual(numPr(d, 1), {numId: 1, ilvl: 1});
      const d2 = listDoc([li('a')]);
      const out = run(d2, C(d2, 0, 0), {by: -1});
      assert.deepEqual(numPr(d2, 0), {numId: 1, ilvl: 0});
      assert.equal(d2.undoDepth, 0);
      assert.equal(d2.dirty, false);
      assert.deepEqual(out.pending, {});
    });
  it('stops at the last level defined (2 of 0..2), and at 8', () => {
    const d = listDoc([li('a', 2)]);
    run(d, C(d, 0, 0), {by: 1});
    assert.deepEqual(numPr(d, 0), {numId: 1, ilvl: 2});
    assert.equal(d.undoDepth, 0);
    const nine = new Map([[1, N(Array.from({length: 9},
      (_, k) => lv(k)))]]);
    const d9 = listDoc([li('a', 8)], nine);
    run(d9, C(d9, 0, 0), {by: 1});
    assert.deepEqual(numPr(d9, 0), {numId: 1, ilvl: 8});
    assert.equal(d9.undoDepth, 0);
  });
  it('a level given outright is clamped to the defined levels', () => {
    const d = listDoc([li('a'), li('b')]);
    run(d, SEL(d, 0, 0, 1, 1), {level: 8});
    assert.deepEqual([numPr(d, 0).ilvl, numPr(d, 1).ilvl], [2, 2]);
    run(d, C(d, 0, 0), {level: 1});
    assert.deepEqual(numPr(d, 0).ilvl, 1);
    run(d, C(d, 0, 0), {level: 0});
    assert.deepEqual(numPr(d, 0).ilvl, 0);
  });
  it('a level beyond the defined ones (shown as the last) promotes',
    () => {
      const d = listDoc([li('a', 6)]);
      run(d, C(d, 0, 0), {by: 1});
      assert.equal(numPr(d, 0).ilvl, 6, 'no demotion past them');
      run(d, C(d, 0, 0), {by: -1});
      assert.equal(numPr(d, 0).ilvl, 2);
    });
  it('a step goes to the next DEFINED level (sparse levels 0, 2, 5)',
    () => {
      const sparse = () => new Map([[1, N([lv(0), undefined, lv(2),
        undefined, undefined, lv(5)])]]);
      const d = listDoc([li('a'), li('b')], sparse());
      run(d, C(d, 1, 0), {by: 1});
      assert.equal(numPr(d, 1).ilvl, 2, 'Tab on 0: 2, not 1');
      run(d, C(d, 1, 0), {by: 1});
      assert.equal(numPr(d, 1).ilvl, 5);
      run(d, C(d, 1, 0), {by: 1});
      assert.equal(numPr(d, 1).ilvl, 5, 'deepest: nothing');
      run(d, C(d, 1, 0), {by: -1});
      assert.equal(numPr(d, 1).ilvl, 2);
      run(d, C(d, 1, 0), {by: -1});
      assert.equal(numPr(d, 1).ilvl, 0);
      assert.equal(d.undoDepth, 4);
      // shown at an undefined level (3 = as 2): up to 2, down to 5
      const d2 = listDoc([li('a', 3)], sparse());
      run(d2, C(d2, 0, 0), {by: -1});
      assert.equal(numPr(d2, 0).ilvl, 2);
      const d3 = listDoc([li('a', 3)], sparse());
      run(d3, C(d3, 0, 0), {by: 1});
      assert.equal(numPr(d3, 0).ilvl, 5);
      // a lowest defined level above 0 (only 1, 2): 1 is the top
      const d4 = listDoc([li('a', 2)], new Map([[1, N([undefined,
        lv(1), lv(2)])]]));
      run(d4, C(d4, 0, 0), {by: -1});
      assert.equal(numPr(d4, 0).ilvl, 1);
      run(d4, C(d4, 0, 0), {by: -1});
      assert.equal(numPr(d4, 0).ilvl, 1);
    });
  it('every selected list paragraph, plain ones skipped, one step',
    () => {
      const d = listDoc([li('a'), 'plain', li('b', 1), li('c', 2)]);
      const n0 = d.undoDepth;
      run(d, SEL(d, 0, 1, 3, 1), {by: 1});
      assert.equal(d.undoDepth, n0 + 1);
      assert.deepEqual([numPr(d, 0).ilvl, numPr(d, 2).ilvl,
        numPr(d, 3).ilvl], [1, 2, 2]);
      assert.equal(P(d, 1).pPr.numPr, undefined);
      run(d, SEL(d, 0, 1, 3, 1), {by: -1});
      assert.deepEqual([numPr(d, 0).ilvl, numPr(d, 2).ilvl,
        numPr(d, 3).ilvl], [0, 1, 1]);
    });
  it('a last paragraph the selection only reaches the start of is ' +
    'left alone (as paragraph formatting)', () => {
    const d = listDoc([li('a'), li('b')]);
    run(d, SEL(d, 0, 0, 1, 0), {by: 1});
    assert.deepEqual([numPr(d, 0).ilvl, numPr(d, 1).ilvl], [1, 0]);
  });
  it('a style-numbered paragraph gets its level as direct numPr',
    () => {
      const d = listDoc([['head', {pStyle: 'ListHead'}]]);
      assert.deepEqual(shown(d), ['1.']);
      run(d, C(d, 0, 0), {by: 1});
      assert.deepEqual(numPr(d, 0), {numId: 1, ilvl: 1});
      assert.deepEqual(shown(d), ['1.1.']);
    });
});

describe('FormatList.setList: off', () => {
  it('removes a direct numPr: no label, followers renumber', () => {
    const d = listDoc([li('a'), li('b'), li('c')]);
    run(d, C(d, 1, 0), {off: true});
    assert.equal(numPr(d, 1), undefined);
    assert.deepEqual(shown(d), ['1.', null, '2.']);
    assert.equal(paraNumPr(d.doc.styles, P(d, 1)), null);
  });
  it('a style-numbered paragraph gets numId 0 (style overridden)',
    () => {
      const d = listDoc([['h', {pStyle: 'ListHead'}],
        ['g', {pStyle: 'ListHead', pPr: {numPr: {ilvl: 1}}}]]);
      run(d, SEL(d, 0, 0, 1, 1), {off: true});
      assert.deepEqual(numPr(d, 0), {numId: 0});
      assert.deepEqual(numPr(d, 1), {numId: 0});
      assert.deepEqual(shown(d), [null, null]);
      assert.equal(P(d, 0).pStyle, 'ListHead');
    });
  it('off without keep: the text goes back to the style\'s indent',
    () => {
      const d = listDoc([li('a')]);
      run(d, C(d, 0, 0), {off: true});
      assert.equal(P(d, 0).pPr.ind, undefined);
      assert.deepEqual(effective(d.doc, P(d, 0)),
        {left: 0, first: 0, right: 0});
    });
  it('off with keep: the text stays where it was (direct left, ' +
    'first line at it)', () => {
    const d = listDoc([li('a', 1), li('b', 0, {pPr: {ind: {left: 3000,
      firstLine: 200}}}), ['c', {pStyle: 'Indented',
      pPr: {numPr: {numId: 1, ilvl: 0}}}]]);
    const before = [0, 1, 2].map((k) => effective(d.doc, P(d, k)));
    assert.deepEqual(before[0], {left: 1440, first: -360, right: 0});
    run(d, SEL(d, 0, 0, 2, 1), {off: true, keep: true});
    assert.deepEqual(shown(d), [null, null, null]);
    assert.deepEqual(P(d, 0).pPr.ind, {left: 1440});
    assert.deepEqual(effective(d.doc, P(d, 0)),
      {left: 1440, first: 0, right: 0});
    // a first line (not hanging) is kept as it was
    assert.deepEqual(P(d, 1).pPr.ind, {left: 3000, firstLine: 200});
    // the level's 720 over the style's 2880: written
    assert.deepEqual(P(d, 2).pPr.ind, {left: 720});
    const pf = paraFmt(d.doc.styles, P(d, 0));
    assert.deepEqual([pf.left, pf.first], [96, 0]);
  });
  it('nothing in a list: no change, no undo step, not dirty', () => {
    const d = listDoc(['plain', ['h', {pStyle: 'ListHead',
      pPr: {numPr: {numId: 0}}}], ['x', {pPr: {numPr: {numId: 9,
      ilvl: 0}}}]]);
    for (const patch of [{off: true}, {by: 1}, {by: -1},
      {level: 2}, {off: true, keep: true}]) {
      const sel = SEL(d, 0, 0, 2, 1);
      const out = run(d, sel, patch);
      assert.equal(out.sel, sel);
    }
    assert.equal(d.undoDepth, 0);
    assert.equal(d.dirty, false);
  });
  it('the pending format at a caret is kept', () => {
    const d = listDoc([li('a')]);
    const pend = {b: true};
    const out = setList(d, T(d), C(d, 0, 1), {by: 1}, pend);
    assert.equal(out.pending, pend);
  });
  it('bad patches throw RangeError and change nothing', () => {
    const d = listDoc([li('a')]);
    for (const p of [undefined, null, {}, {by: 2}, {by: 0},
      {level: 1.5}, {level: 'x'}, {off: false}, {by: 1, off: true},
      {off: true, keep: 1}]) {
      assert.throws(() => setList(d, T(d), C(d, 0, 0), p), RangeError,
        JSON.stringify(p));
    }
    assert.equal(d.undoDepth, 0);
  });
  it('FormatSet exports it; FormatApply ids listIn listOut listOff',
    () => {
      assert.equal(FS.setList, setList);
      const d = listDoc([li('a'), li('b')]);
      for (const id of ['listIn', 'listOut', 'listOff'])
        assert.ok(isFormat(id), id);
      const t = T(d);
      apply('listIn', d, t, C(d, 1, 0));
      assert.deepEqual(shown(d), ['1.', '1.1.']);
      apply('listOut', d, t, C(d, 1, 0));
      assert.deepEqual(shown(d), ['1.', '2.']);
      apply('listOff', d, t, C(d, 1, 0));
      assert.deepEqual(shown(d), ['1.', null]);
      assert.equal(P(d, 1).pPr.ind, undefined, 'no keep from the menu');
      assert.equal(d.undoDepth, 3);
    });
});

describe('FormatList.listParas', () => {
  it('counts the list paragraphs paragraph formatting reaches', () => {
    const d = listDoc([li('a'), 'plain', li('b'),
      ['h', {pStyle: 'ListHead'}], ['z', {pPr: {numPr: {numId: 7}}}]]);
    assert.equal(listParas(d.doc, C(d, 0, 1)), 1);
    assert.equal(listParas(d.doc, C(d, 1, 0)), 0);
    assert.equal(listParas(d.doc, SEL(d, 0, 0, 4, 1)), 3);
    assert.equal(listParas(d.doc, SEL(d, 1, 0, 2, 0)), 0);
    assert.equal(listParas(d.doc, C(d, 4, 0)), 0, 'unknown numId');
    assert.equal(listParas(d.doc, {anchor: {id: 999, off: 0},
      head: {id: 999, off: 0}}), 0);
  });
});

describe('FormatList.hasList (the Format > List shading)', () => {
  it('agrees with listParas > 0', () => {
    const d = listDoc([li('a'), 'plain', li('b'),
      ['h', {pStyle: 'ListHead'}], ['z', {pPr: {numPr: {numId: 7}}}]]);
    const sels = [C(d, 0, 1), C(d, 1, 0), SEL(d, 0, 0, 4, 1),
      SEL(d, 1, 0, 2, 0), C(d, 4, 0), SEL(d, 4, 1, 1, 0),
      {anchor: {id: 999, off: 0}, head: {id: 999, off: 0}}];
    for (const sel of sels)
      assert.equal(hasList(d.doc, sel), listParas(d.doc, sel) > 0);
  });
  it('a select-all of 50k paragraphs is cheap: stops at the first ' +
    'list item; no numbering returns at once', () => {
    const many = Array.from({length: 50000}, (_, i) => (i === 0
      ? li('a') : 'plain ' + i));
    const d = listDoc(many);
    const all = SEL(d, 0, 0, 49999, 1);
    hasList(d.doc, all);
    let t0 = performance.now();
    assert.equal(hasList(d.doc, all), true);
    const first = performance.now() - t0;
    const plain = listDoc(many.slice(1));
    plain.doc.numbering = {raw: null, nums: new Map()};
    const all2 = SEL(plain, 0, 0, 49998, 1);
    t0 = performance.now();
    assert.equal(hasList(plain.doc, all2), false);
    const none = performance.now() - t0;
    t0 = performance.now();
    listParas(d.doc, all);
    const count = performance.now() - t0;
    console.log(`# hasList 50k: first item ${first.toFixed(1)} ms, ` +
      `no numbering ${none.toFixed(1)} ms; listParas ` +
      `${count.toFixed(1)} ms`);
    assert.ok(none < 5, 'no numbering: ' + none);
    assert.ok(first < 200, 'first item: ' + first);
  });
});
