// The editing keys in lists (EditApply.run with EditList): Tab at the
// start of a list item demotes it, elsewhere types a tab; Shift-Tab
// in a list item promotes it, elsewhere is not used (the key goes
// on); Backspace at the start of a list item removes its number
// first (the text staying where it was), then joins as before; Enter
// continues the list; deleting an item renumbers the rest; undo and
// redo bring the labels back.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {run, stepEnd} from '../../tools/moreapps/!Word/EditApply';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {labels} from '../../tools/moreapps/!Word/ListNumbers';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {P, C, SEL, texts, ids, blocks, at, undoable}
  from './edit-docs.mjs';
import {tm} from './word-docs.mjs';
import {listDoc, li} from './list-docs.mjs';

const shown = (d) => {
  const m = labels(d.doc);
  return blocks(d).map((b) => (m.has(b.id) ? m.get(b.id).text : null));
};
const ilvl = (d, k) => P(d, k).pPr.numPr?.ilvl;
const key = (d, id, sel) => undoable(d, () =>
  run(id, d, new Typing(d), sel));
/** The first line of paragraph k: text x and label x (px). */
function drawn(d, k) {
  const L = new DocLayout(d.doc, tm());
  L.layout(900);
  const ln = L.items[k].lines[0];
  return {text: ln.x, label: ln.label ? ln.label.x : null};
}

describe('Tab and Shift-Tab in lists', () => {
  it('Tab at the start of an item demotes it; the labels renumber',
    () => {
      const d = listDoc([li('one'), li('two'), li('three')]);
      const sel = C(d, 1, 0);
      const out = key(d, 'tab', sel);
      assert.equal(out, sel);
      assert.deepEqual(texts(d), ['one', 'two', 'three']);
      assert.equal(ilvl(d, 1), 1);
      assert.deepEqual(shown(d), ['1.', '1.1.', '2.']);
      assert.equal(d.undoDepth, 1);
    });
  it('Tab in the middle of an item, or in a plain paragraph, types ' +
    'a tab', () => {
    const d = listDoc([li('one'), 'plain']);
    assert.deepEqual(at(d, key(d, 'tab', C(d, 0, 2))), [0, 3]);
    assert.deepEqual(texts(d), ['on\te', 'plain']);
    assert.equal(ilvl(d, 0), 0);
    key(d, 'tab', C(d, 1, 0));
    assert.equal(texts(d)[1], '\tplain');
  });
  it('Tab with a selection over list items demotes them (text kept)',
    () => {
      const d = listDoc([li('one'), li('two'), 'plain']);
      key(d, 'tab', SEL(d, 0, 1, 2, 2));
      assert.deepEqual(texts(d), ['one', 'two', 'plain']);
      assert.deepEqual([ilvl(d, 0), ilvl(d, 1)], [1, 1]);
      // a selection inside one item, not from its start: a tab
      key(d, 'tab', SEL(d, 0, 1, 0, 2));
      assert.deepEqual(texts(d)[0], 'o\te');
      // from its start: the level
      key(d, 'tab', SEL(d, 1, 0, 1, 2));
      assert.deepEqual([texts(d)[1], ilvl(d, 1)], ['two', 2]);
    });
  it('Tab on the last level: nothing changes, no tab typed', () => {
    const d = listDoc([li('one', 2)]);
    const sel = C(d, 0, 0);
    assert.equal(key(d, 'tab', sel), sel);
    assert.deepEqual(texts(d), ['one']);
    assert.equal(d.undoDepth, 0);
  });
  it('Shift-Tab anywhere in an item promotes it', () => {
    const d = listDoc([li('one'), li('two', 1), li('three', 2)]);
    key(d, 'shiftTab', C(d, 1, 2));
    key(d, 'shiftTab', SEL(d, 2, 1, 2, 3));
    assert.deepEqual([ilvl(d, 1), ilvl(d, 2)], [0, 1]);
    assert.deepEqual(shown(d), ['1.', '2.', '2.1.']);
    assert.deepEqual(texts(d), ['one', 'two', 'three']);
  });
  it('Shift-Tab outside a list is not used: undefined, nothing done',
    () => {
      const d = listDoc(['plain', li('one')]);
      const t = new Typing(d);
      assert.equal(run('shiftTab', d, t, C(d, 0, 2)), undefined);
      assert.equal(run('shiftTab', d, t, SEL(d, 0, 0, 0, 3)),
        undefined);
      assert.equal(d.undoDepth, 0);
      // level 0 already: used (nothing to do), not passed on
      const sel = C(d, 1, 0);
      assert.equal(run('shiftTab', d, t, sel), sel);
      assert.equal(d.undoDepth, 0);
    });
});

describe('Backspace at the start of a list item', () => {
  it('first press: the number goes, the text stays put; second: ' +
    'the join', () => {
    const d = listDoc([li('one'), li('two'), li('three')]);
    const w0 = drawn(d, 1);
    const sel = C(d, 1, 0);
    assert.equal(key(d, 'backspace', sel), sel);
    assert.deepEqual(texts(d), ['one', 'two', 'three']);
    assert.equal(P(d, 1).pPr.numPr, undefined);
    assert.deepEqual(shown(d), ['1.', null, '2.']);
    assert.equal(drawn(d, 1).text, w0.text, 'the text did not move');
    assert.equal(drawn(d, 1).label, null);
    assert.equal(d.undoDepth, 1);
    assert.deepEqual(at(d, key(d, 'backspace', C(d, 1, 0))), [0, 3]);
    assert.deepEqual(texts(d), ['onetwo', 'three']);
    assert.deepEqual(shown(d), ['1.', '2.']);
  });
  it('the first paragraph of the document: the number goes', () => {
    const d = listDoc([li('one')]);
    key(d, 'backspace', C(d, 0, 0));
    assert.deepEqual(shown(d), [null]);
    assert.deepEqual(texts(d), ['one']);
  });
  it('a plain paragraph, the middle of an item, a selection: as ' +
    'before', () => {
    const d = listDoc([li('one'), 'plain', li('two'), li('three')]);
    key(d, 'backspace', C(d, 1, 0));
    assert.deepEqual(texts(d), ['oneplain', 'two', 'three']);
    key(d, 'backspace', C(d, 1, 2));
    assert.deepEqual(texts(d), ['oneplain', 'to', 'three']);
    assert.deepEqual(shown(d), ['1.', '2.', '3.']);
    key(d, 'backspace', SEL(d, 1, 0, 1, 2));
    assert.deepEqual(texts(d), ['oneplain', '', 'three']);
    assert.deepEqual(shown(d), ['1.', '2.', '3.']);
  });
  it('undo brings the number back; the caret at the item\'s start',
    () => {
      const d = listDoc([li('one'), li('two')]);
      let ops = null;
      d.on('change', (ev) => { ops = ev.ops; });
      key(d, 'backspace', C(d, 1, 0));
      d.undo();
      assert.deepEqual(shown(d), ['1.', '2.']);
      const p = stepEnd(d.doc, ops, null);
      assert.deepEqual([ids(d).indexOf(p.id), p.off], [1, 0]);
      d.redo();
      assert.deepEqual(shown(d), ['1.', null]);
    });
});

describe('Enter and deleting in lists', () => {
  it('Enter in an item continues the list; in an empty item ends it',
    () => {
      const d = listDoc([li('one'), li('two')]);
      key(d, 'enter', C(d, 0, 2));
      assert.deepEqual(texts(d), ['on', 'e', 'two']);
      assert.deepEqual(shown(d), ['1.', '2.', '3.']);
      key(d, 'enter', C(d, 2, 3));
      assert.deepEqual(shown(d), ['1.', '2.', '3.', '4.']);
      key(d, 'enter', C(d, 3, 0));
      assert.deepEqual(shown(d), ['1.', '2.', '3.', null]);
    });
  it('Enter in an empty item numbered by its STYLE ends the list ' +
    '(numId 0); a second Enter splits; undo restores', () => {
      const d = listDoc([li('one'), ['', {pStyle: 'ListHead'}]]);
      assert.deepEqual(shown(d), ['1.', '2.']);
      const s = key(d, 'enter', C(d, 1, 0));
      assert.deepEqual(texts(d), ['one', '']);
      assert.deepEqual(shown(d), ['1.', null]);
      assert.deepEqual(P(d, 1).pPr.numPr, {numId: 0});
      assert.equal(P(d, 1).pStyle, 'ListHead');
      assert.deepEqual(at(d, s), [1, 0]);
      key(d, 'enter', C(d, 1, 0));
      assert.deepEqual(texts(d), ['one', '', '']);
      assert.deepEqual(shown(d), ['1.', null, null]);
      d.undo();
      d.undo();
      assert.deepEqual(texts(d), ['one', '']);
      assert.deepEqual(shown(d), ['1.', '2.']);
    });
  it('Enter in an empty item with direct AND style numbering: no ' +
    'number after one Enter (numId 0)', () => {
    const d = listDoc([li('one'), ['', {pStyle: 'ListHead',
      pPr: {numPr: {numId: 1, ilvl: 1}}}]]);
    assert.deepEqual(shown(d), ['1.', '1.1.']);
    key(d, 'enter', C(d, 1, 0));
    assert.deepEqual(texts(d), ['one', '']);
    assert.deepEqual(shown(d), ['1.', null]);
    assert.deepEqual(P(d, 1).pPr.numPr, {numId: 0});
  });
  it('after Backspace wrote numId 0 on a style-numbered item, Enter ' +
    'on it splits and the number stays off', () => {
    const d = listDoc([li('one'), ['', {pStyle: 'ListHead'}]]);
    key(d, 'backspace', C(d, 1, 0));
    assert.deepEqual(shown(d), ['1.', null]);
    key(d, 'enter', C(d, 1, 0));
    assert.deepEqual(texts(d), ['one', '', '']);
    assert.deepEqual(shown(d), ['1.', null, null]);
    assert.equal(P(d, 1).pPr.numPr.numId, 0);
    assert.equal(P(d, 2).pPr.numPr.numId, 0);
  });
  it('Enter in an empty item with direct numbering removes it', () => {
    const d = listDoc([li('one'), li('')]);
    key(d, 'enter', C(d, 1, 0));
    assert.deepEqual(texts(d), ['one', '']);
    assert.equal(P(d, 1).pPr.numPr, undefined);
    assert.deepEqual(shown(d), ['1.', null]);
  });
  it('deleting a whole item renumbers the followers; undo back', () => {
    const d = listDoc([li('one'), li('two'), li('three'), li('four')]);
    key(d, 'delete', SEL(d, 0, 3, 1, 3));
    assert.deepEqual(texts(d), ['one', 'three', 'four']);
    assert.deepEqual(shown(d), ['1.', '2.', '3.']);
    d.undo();
    assert.deepEqual(shown(d), ['1.', '2.', '3.', '4.']);
  });
});
