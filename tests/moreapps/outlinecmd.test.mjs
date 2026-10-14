// Outline commands (Batch D P13.3, D32): Promote and Demote (Heading
// N -/+ 1, body text to Heading 1 and Heading 9 to body text: PG33,
// the heading style added once from StylesBuiltin when missing),
// Move up and Move down (the paragraph with its collapsed children,
// top level only, refused across a section break: PG34); each one
// undo step that undo restores deep-equal; refusals change nothing
// (null: a beep); the keys (Tab / Shift-Tab at a heading's start,
// Ctrl-Shift-Up / Down) only in Outline view.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {promoteCmd, demoteCmd, moveCmd, outlineId}
  from '../../tools/moreapps/!Letters/OutlineCmd';
import {levelOf, BODY} from '../../tools/moreapps/!Letters/OutlineLayout';
import {run} from '../../tools/moreapps/!Letters/EditApply';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {keymap} from '../../tools/moreapps/!Letters/Keymap';
import {toggleList} from '../../tools/moreapps/!Letters/ListMake';
import {builtinStyle} from '../../tools/moreapps/!Letters/StylesBuiltin';
import {deepEqual} from '../../tools/moreapps/!Letters/Model';
import {mk, P, C, SEL, S, texts, undoable, snap}
  from './edit-docs.mjs';

const H = (n, text) => [text, {pStyle: 'Heading' + n}];
const lv = (d, k) => levelOf(d.doc.styles, P(d, k));
const secTexts = (d) => d.doc.sections.map((s) => s.blocks.map((b) =>
  (b.type === 'p' ? b.text : '#')));

/** cmd as one undo step (undo and redo exact, styles too). */
function step(d, cmd) {
  const n = d.undoDepth, st = d.doc.styles;
  const out = undoable(d, cmd);
  assert.equal(d.undoDepth, n + 1, 'one undo step');
  const now = d.doc.styles;
  d.undo();
  assert.equal(d.doc.styles, st, 'undo restores the styles');
  d.redo();
  assert.equal(d.doc.styles, now, 'redo the styles');
  return out;
}

/** cmd refused: null, nothing changed, no undo step. */
function refused(d, cmd) {
  const before = snap(d), st = d.doc.styles, n = d.undoDepth;
  assert.equal(cmd(), null);
  assert.ok(deepEqual(d.doc.sections, before), 'nothing changed');
  assert.equal(d.doc.styles, st);
  assert.equal(d.undoDepth, n, 'no undo step');
}

describe('OutlineCmd: Promote and Demote (D32, PG33)', () => {
  it('Heading 2 promoted is Heading 1; demoted is Heading 3', () => {
    const d = mk([H(2, 'a'), H(2, 'b')]);
    const sel = C(d, 0, 0);
    assert.equal(step(d, () => promoteCmd(d, sel)), sel);
    assert.equal(P(d, 0).pStyle, 'Heading1');
    assert.equal(lv(d, 0), 0);
    step(d, () => demoteCmd(d, C(d, 1, 1)));
    assert.equal(P(d, 1).pStyle, 'Heading3');
    assert.equal(lv(d, 1), 2);
  });

  it('body text promoted is Heading 1; Heading 9 demoted is body text',
    () => {
      const d = mk(['body', ['nine', {pPr: {outlineLvl: 8}}]]);
      step(d, () => promoteCmd(d, C(d, 0, 2)));
      assert.equal(P(d, 0).pStyle, 'Heading1');
      assert.equal(lv(d, 0), 0);
      step(d, () => demoteCmd(d, C(d, 1, 0)));
      assert.equal(P(d, 1).pStyle, undefined);
      assert.equal(P(d, 1).pPr.outlineLvl, undefined);
      assert.equal(lv(d, 1), BODY);
    });

  it('a direct outline level goes: the heading style gives it', () => {
    const d = mk([['x', {pPr: {outlineLvl: 2}}]]);
    step(d, () => promoteCmd(d, C(d, 0, 0)));
    assert.equal(P(d, 0).pStyle, 'Heading2');
    assert.equal(P(d, 0).pPr.outlineLvl, undefined);
    assert.equal(lv(d, 0), 1);
  });

  it('Heading 7 added once from StylesBuiltin, based on Normal', () => {
    const d = mk([H(6, 'a'), H(6, 'b')]);
    assert.equal(d.doc.styles.styles.has('Heading7'), false);
    step(d, () => demoteCmd(d, C(d, 0, 0)));
    const s = d.doc.styles.styles.get('Heading7');
    assert.equal(s.name, 'heading 7');
    assert.equal(s.type, 'paragraph');
    assert.equal(s.basedOn, 'Normal');
    assert.equal(s.pPr.outlineLvl, 6);
    assert.equal(lv(d, 0), 6);
    const st = d.doc.styles;
    step(d, () => demoteCmd(d, C(d, 1, 0)));
    assert.equal(d.doc.styles, st, 'not added again');
    assert.equal(lv(d, 1), 6);
  });

  it('Heading 8 and 9 come from StylesBuiltin too', () => {
    for (const n of [7, 8, 9]) {
      const s = builtinStyle('Heading' + n);
      assert.equal(s.name, 'heading ' + n);
      assert.equal(s.pPr.outlineLvl, n - 1);
    }
    const d = mk([['x', {pPr: {outlineLvl: 6}}]]);
    step(d, () => demoteCmd(d, C(d, 0, 0)));
    step(d, () => demoteCmd(d, C(d, 0, 0)));
    assert.equal(P(d, 0).pStyle, 'Heading9');
    assert.equal(lv(d, 0), 8);
  });

  it('the document\'s own heading style (by name) is used', () => {
    const d = mk([H(1, 'a')]);
    const own = {...builtinStyle('Heading2'), id: 'berschrift2',
      name: 'Heading 2'};
    d.doc.styles.styles.delete('Heading2');
    d.doc.styles.styles.set(own.id, own);
    const st = d.doc.styles;
    step(d, () => demoteCmd(d, C(d, 0, 0)));
    assert.equal(P(d, 0).pStyle, 'berschrift2');
    assert.equal(d.doc.styles, st);
  });

  it('a selection: every top-level paragraph it touches, one step',
    () => {
      const d = mk([H(1, 'a'), H(2, 'b'), 'c', H(3, 'd')]);
      step(d, () => promoteCmd(d, SEL(d, 0, 0, 3, 1)));
      assert.deepEqual([0, 1, 2, 3].map((k) => lv(d, k)),
        [0, 0, 0, 1]);
    });

  it('refused: Heading 1 promoted, body text demoted', () => {
    const d = mk([H(1, 'a'), 'b']);
    refused(d, () => promoteCmd(d, C(d, 0, 0)));
    refused(d, () => demoteCmd(d, C(d, 1, 0)));
    refused(d, () => promoteCmd(d, S.caret({id: 99999, off: 0})));
  });

  it('a document without a style table refuses', () => {
    const d = mk([H(2, 'a')], {styles: false});
    refused(d, () => promoteCmd(d, C(d, 0, 0)));
  });
});

describe('OutlineCmd: Move up and Move down (D32, PG34)', () => {
  it('a paragraph moves past the one above or below', () => {
    const d = mk(['a', 'b', 'c']);
    const sel = C(d, 2, 1);
    const out = step(d, () => moveCmd(d, sel, -1, null));
    assert.deepEqual(texts(d), ['a', 'c', 'b']);
    assert.notEqual(out, sel);
    assert.deepEqual([out.anchor, out.head], [sel.anchor, sel.head]);
    step(d, () => moveCmd(d, C(d, 0, 0), 1, new Set()));
    assert.deepEqual(texts(d), ['c', 'a', 'b']);
  });

  it('refused at the top and at the bottom', () => {
    const d = mk(['a', 'b']);
    refused(d, () => moveCmd(d, C(d, 0, 0), -1, null));
    refused(d, () => moveCmd(d, C(d, 1, 0), 1, null));
    refused(d, () => moveCmd(d, C(d, 0, 0), 0, null));
  });

  it('a collapsed heading moves with its hidden children', () => {
    const d = mk([H(1, 'A'), 'a1', H(2, 'A2'), 'a2', H(1, 'B'), 'b1']);
    const shut = new Set([P(d, 0).id]);
    step(d, () => moveCmd(d, C(d, 0, 0), 1, shut));
    assert.deepEqual(texts(d), ['B', 'A', 'a1', 'A2', 'a2', 'b1']);
    // b1 is under the collapsed A now (hidden): B passes all of it
    step(d, () => moveCmd(d, C(d, 0, 0), 1, shut));
    assert.deepEqual(texts(d), ['A', 'a1', 'A2', 'a2', 'b1', 'B']);
    // moving B up passes the whole collapsed A
    step(d, () => moveCmd(d, C(d, 5, 0), -1, shut));
    assert.deepEqual(texts(d), ['B', 'A', 'a1', 'A2', 'a2', 'b1']);
  });

  it('expanded, a heading moves alone', () => {
    const d = mk([H(1, 'A'), 'a1', H(1, 'B')]);
    step(d, () => moveCmd(d, C(d, 0, 0), 1, new Set()));
    assert.deepEqual(texts(d), ['a1', 'A', 'B']);
  });

  it('a selection over paragraphs moves them together', () => {
    const d = mk(['a', 'b', 'c', 'd']);
    step(d, () => moveCmd(d, SEL(d, 2, 1, 1, 0), -1, null));
    assert.deepEqual(texts(d), ['b', 'c', 'a', 'd']);
  });

  it('refused across a section break (PG34)', () => {
    const d = mk(['x', 'y', 'z', 'w']);
    run('sectionNext', d, new Typing(d), C(d, 1, 1));
    d.clearHistory();
    assert.deepEqual(secTexts(d), [['x', 'y'], ['', 'z', 'w']]);
    refused(d, () => moveCmd(d, C(d, 2, 0), -1, null));
    refused(d, () => moveCmd(d, C(d, 1, 0), 1, null));
    refused(d, () => moveCmd(d, SEL(d, 1, 0, 2, 0), -1, null));
    step(d, () => moveCmd(d, C(d, 3, 0), -1, null));
    assert.deepEqual(secTexts(d), [['x', 'y'], ['z', '', 'w']]);
  });
});

describe('OutlineCmd: keys only in Outline view', () => {
  const d = mk([H(1, 'Head'), 'body', H(9, 'x')]);
  const ol = new Set();

  it('Tab / Shift-Tab at a heading\'s start', () => {
    const at = C(d, 0, 0);
    assert.equal(outlineId(d.doc, at, ol, 'tab'), 'outlineDemote');
    assert.equal(outlineId(d.doc, at, ol, 'shiftTab'), 'outlinePromote');
    assert.equal(outlineId(d.doc, C(d, 0, 1), ol, 'tab'), null);
    assert.equal(outlineId(d.doc, SEL(d, 0, 0, 0, 2), ol, 'tab'), null);
    assert.equal(outlineId(d.doc, at, null, 'tab'), null, 'not Outline');
    assert.equal(outlineId(d.doc, at, ol, 'enter'), null);
  });

  it('body text: Shift-Tab promotes; Tab goes on', () => {
    assert.equal(outlineId(d.doc, C(d, 1, 0), ol, 'shiftTab'),
      'outlinePromote');
    assert.equal(outlineId(d.doc, C(d, 1, 0), ol, 'tab'), null);
    const e = mk(['item', 'x']);
    toggleList(e, new Typing(e), C(e, 0, 0), {kind: 'bullet'}, null);
    assert.equal(outlineId(e.doc, C(e, 0, 0), ol, 'shiftTab'), null,
      'a list item keeps its Shift-Tab');
  });

  it('Ctrl-Shift-Up / Down: Keymap rows, Outline only', () => {
    const k = (key) => keymap.lookup({code: 0, key, ctrl: true,
      shift: true});
    assert.equal(k('ArrowUp'), 'outlineUp');
    assert.equal(k('ArrowDown'), 'outlineDown');
    assert.equal(keymap.lookup({code: 0, key: 'ArrowUp'}), null);
    assert.equal(keymap.row('outlineUp').menu, 'Outline');
    assert.equal(keymap.row('outlinePromote').label, 'Promote');
    assert.equal(outlineId(d.doc, C(d, 1, 2), ol, 'outlineUp'),
      'outlineUp');
    assert.equal(outlineId(d.doc, C(d, 1, 2), null, 'outlineDown'),
      null);
  });

  it('EditApply runs them with the layout\'s collapse set', () => {
    const e = mk([H(1, 'A'), 'a1', H(1, 'B')]);
    const L = {outline: new Set([P(e, 0).id])};
    const t = new Typing(e);
    step(e, () => run('outlineDown', e, t, C(e, 0, 0), {arg: {L}}));
    assert.deepEqual(texts(e), ['B', 'A', 'a1']);
    step(e, () => run('outlineDemote', e, t, C(e, 0, 0), {arg: {L}}));
    assert.equal(P(e, 0).pStyle, 'Heading2');
    step(e, () => run('outlinePromote', e, t, C(e, 0, 0), {arg: {L}}));
    assert.equal(run('outlineUp', e, t, C(e, 0, 0), {arg: {L}}), null);
  });
});
