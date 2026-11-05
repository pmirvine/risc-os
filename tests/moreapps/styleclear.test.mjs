// StyleClear: Clear all formatting (characters and character style,
// as Ctrl+Space, plus the paragraph back to the default paragraph
// style with no direct paragraph formatting, numbering too) and
// Normal (Ctrl+Shift+N: the default paragraph style, direct
// formatting kept); each one undo step. Ctrl+Space stays characters
// only.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as SC from '../../tools/moreapps/!Letters/StyleClear';
import * as FA from '../../tools/moreapps/!Letters/FormatApply';
import {keymap} from '../../tools/moreapps/!Letters/Keymap';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {mk, P, C, SEL, undoable, plain} from './edit-docs.mjs';

const T = (d) => new Typing(d);
const state = (d) => structuredClone({s: d.doc.sections,
  t: d.doc.styles});
/** fn(typing) is one undo step, undone and redone exactly. */
function stepped(d, fn) {
  const before = state(d), n = d.undoDepth;
  const out = undoable(d, () => fn(T(d)));
  assert.equal(d.undoDepth, n + 1, 'one undo step');
  const after = state(d);
  d.undo();
  assert.deepEqual(state(d), before);
  d.redo();
  assert.deepEqual(state(d), after);
  return out;
}

const LOUD = {b: true, i: true, sz: 28, color: 'FF0000', extra: []};
/** Two formatted list paragraphs in Heading 2, styled runs. */
const rich = () => mk([
  ['abcd', {pStyle: 'Heading2', pPr: {jc: 'center', ind: {left: 720},
    spacing: {before: 120}, keepNext: true, numPr: {numId: 1, ilvl: 0},
    extra: []}, runs: [{start: 0, end: 2, rPr: LOUD, rStyle: 'Strong'},
    {start: 2, end: 4, rPr: plain}]}],
  ['efgh', {pStyle: 'Heading1', pPr: {jc: 'right', extra: []},
    runs: [{start: 0, end: 4, rPr: LOUD}]}],
  ['ijkl', {pStyle: 'Heading1', pPr: {jc: 'right', extra: []}}],
]);

describe('StyleClear.clearAll', () => {
  it('removes the style, direct paragraph formatting, numbering, ' +
    'character formatting and character styles: one step', () => {
    const d = rich();
    const out = stepped(d, (t) => SC.clearAll(d, t,
      SEL(d, 0, 0, 1, 4)));
    for (const k of [0, 1]) {
      const p = P(d, k);
      assert.equal(p.pStyle, undefined, k);
      assert.deepEqual(p.pPr, {extra: []}, k);
      assert.deepEqual(p.runs.map((x) => [x.rPr, x.rStyle]),
        [[plain, undefined]], k);
    }
    // the third paragraph is not selected
    assert.equal(P(d, 2).pStyle, 'Heading1');
    assert.equal(P(d, 2).pPr.jc, 'right');
    assert.deepEqual(out.pending, {});
  });
  it('at a caret: the paragraph reset, the caret format cleared', () => {
    const d = rich();
    const out = stepped(d, (t) => SC.clearAll(d, t, C(d, 0, 1),
      {b: true}));
    assert.equal(P(d, 0).pStyle, undefined);
    assert.deepEqual(P(d, 0).pPr, {extra: []});
    // the text stays as it was: a caret's character clearing is the
    // format of the text typed next
    assert.equal(P(d, 0).runs[0].rStyle, 'Strong');
    assert.equal(out.pending.b, null);
    assert.equal(out.pending.rStyle, null);
  });
  it('nothing to clear: no step', () => {
    const d = mk(['abcd']);
    SC.clearAll(d, T(d), SEL(d, 0, 0, 0, 4));
    assert.equal(d.undoDepth, 0);
  });
  it('a raw paragraph property of a known name goes too, unknown ' +
    'ones stay', () => {
    const w = (n) => ({name: 'w:' + n, attrs: [], children: []});
    const d = mk([['ab', {pPr: {extra: [w('spacing'), w('framePr')]}}]]);
    stepped(d, (t) => SC.clearAll(d, t, C(d, 0, 0)));
    assert.deepEqual(P(d, 0).pPr.extra.map((n) => n.name),
      ['w:framePr']);
  });
  it('FormatApply id clearAll', () => {
    const d = rich();
    assert.ok(FA.isFormat('clearAll'));
    FA.apply('clearAll', d, T(d), SEL(d, 0, 0, 0, 4));
    assert.equal(P(d, 0).pStyle, undefined);
    assert.deepEqual(P(d, 0).pPr, {extra: []});
    assert.equal(d.undoDepth, 1);
  });
});

describe('StyleClear.applyNormal', () => {
  it('the default paragraph style, direct formatting kept: one step',
    () => {
      const d = rich();
      const was = structuredClone([P(d, 0), P(d, 1)]);
      stepped(d, (t) => SC.applyNormal(d, t, SEL(d, 0, 1, 1, 2)));
      for (const k of [0, 1]) {
        assert.equal(P(d, k).pStyle, undefined, k);
        assert.deepEqual(P(d, k).pPr, was[k].pPr, k);
        assert.deepEqual(P(d, k).runs, was[k].runs, k);
      }
      assert.equal(P(d, 2).pStyle, 'Heading1');
    });
  it('at a caret: that paragraph; already Normal: no step', () => {
    const d = rich();
    stepped(d, (t) => SC.applyNormal(d, t, C(d, 1, 0)));
    assert.equal(P(d, 1).pStyle, undefined);
    assert.equal(P(d, 0).pStyle, 'Heading2');
    const e = mk(['ab']);
    SC.applyNormal(e, T(e), C(e, 0, 0));
    assert.equal(e.undoDepth, 0);
  });
  it('FormatApply id styleNormal', () => {
    const d = rich();
    assert.ok(FA.isFormat('styleNormal'));
    FA.apply('styleNormal', d, T(d), C(d, 0, 0));
    assert.equal(P(d, 0).pStyle, undefined);
  });
});

describe('the keys', () => {
  const ev = (key, o = {}) => ({key, ctrl: true, shift: !!o.shift,
    code: o.code ?? key.toUpperCase().charCodeAt(0) - 64});
  it('Ctrl+Shift+N is Normal; Ctrl+N stays New', () => {
    assert.equal(keymap.lookup(ev('N', {shift: true})), 'styleNormal');
    assert.equal(keymap.lookup(ev('n', {shift: true})), 'styleNormal');
    assert.equal(keymap.lookup({code: 14, ctrl: true, shift: true}),
      'styleNormal');
    assert.equal(keymap.lookup(ev('n')), 'new');
    assert.equal(keymap.labelFor('styleNormal'), 'Ctrl+Shift+N');
    assert.equal(keymap.row('styleNormal').menu, 'Format');
  });
  it('Ctrl+Space is still Clear formatting, characters only', () => {
    assert.equal(keymap.lookup({key: ' ', code: 32, ctrl: true}),
      'clearFormat');
    assert.equal(keymap.labelFor('clearAll'), '');
    const d = rich();
    FA.apply('clearFormat', d, T(d), SEL(d, 0, 0, 0, 4));
    const p = P(d, 0);
    assert.equal(p.pStyle, 'Heading2');
    assert.equal(p.pPr.jc, 'center');
    assert.deepEqual(p.pPr.numPr, {numId: 1, ilvl: 0});
    assert.deepEqual(p.runs.map((x) => [x.rPr, x.rStyle]),
      [[plain, undefined]]);
  });
});
