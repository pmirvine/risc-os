// Outline: the caret never in hidden text (Batch D P13 fix I1, D32).
// revealCmd expands the headings over a position Find or Go to puts
// the selection at (Word does); shownSel moves an end left in hidden
// text by an edit, an undo or a view switch to the heading above
// (the one rule the window applies after every layout); Enter at the
// end of a collapsed heading puts a heading of its level after the
// hidden block; Backspace (Delete) next to hidden text is refused.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {outlineOf, levelOf} from '../../tools/moreapps/!Letters/OutlineLayout';
import {Fold, collapseCmd, showLevel, revealCmd, shownSel}
  from '../../tools/moreapps/!Letters/OutlineFold';
import {demoteCmd, moveCmd, outlineId, OUTLINE}
  from '../../tools/moreapps/!Letters/OutlineCmd';
import {enterCmd} from '../../tools/moreapps/!Letters/OutlineEdit';
import {run} from '../../tools/moreapps/!Letters/EditApply';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {tm} from './word-docs.mjs';
import {mk, P, C, SEL, S, ids, texts, undoable, snap} from './edit-docs.mjs';
import {deepEqual} from '../../tools/moreapps/!Letters/Model';

const H = (n, text) => [text, {pStyle: 'Heading' + n}];
// 0 A(H1) 1 a(body) 2 A1(H2) 3 a1(body) 4 A11(H3) 5 B(H1) 6 b(body)
const DOC = () => mk([H(1, 'A'), 'a', H(2, 'A1'), 'a1', H(3, 'A11'),
  H(1, 'B'), 'b']);
const hid = (d, f) => outlineOf(d.doc, f).rows.map((r) => (r.hidden ? 1 : 0)).join('');
const lay = (d, f) => {
  const L = new DocLayout(d.doc, tm(), null, {outline: f});
  L.layout(900);
  return L;
};
const where = (d, p) => [ids(d).indexOf(p.id), p.off];

describe('revealCmd: Find and Go to show the heading over the match', () => {
  it('a match under a collapsed heading expands it', () => {
    const d = DOC();
    const f = new Fold([ids(d)[0]]);
    assert.equal(hid(d, f), '0111100');
    const g = revealCmd(d.doc, f, SEL(d, 3, 0, 3, 2));
    assert.ok(g instanceof Fold);
    assert.equal(g.has(ids(d)[0]), false);
    assert.equal(hid(d, g), '0000000');
  });

  it('every collapsed heading above it at any depth opens, others stay', () => {
    const d = DOC();
    const f = new Fold([ids(d)[0], ids(d)[2], ids(d)[5]], 0, true);
    const g = revealCmd(d.doc, f, C(d, 4, 1));
    assert.deepEqual([g.has(ids(d)[0]), g.has(ids(d)[2]), g.has(ids(d)[5])], [false, false, true]);
    assert.equal(g.first, true);
    assert.equal(hid(d, g)[4], '0');
  });

  it('under Show level: body text shows All, a deeper heading one level more', () => {
    const d = DOC();
    const one = showLevel(d.doc, new Fold(), 1);
    assert.equal(revealCmd(d.doc, one, C(d, 1, 0)).cap, 0);
    const g = revealCmd(d.doc, one, C(d, 4, 0));
    assert.equal(g.cap, 3);
    assert.equal(hid(d, g)[4], '0');
  });

  it('a selection that is shown: null (nothing to do); bad positions too', () => {
    const d = DOC();
    const f = new Fold([ids(d)[0]]);
    assert.equal(revealCmd(d.doc, f, C(d, 5, 0)), null);
    assert.equal(revealCmd(d.doc, f, S.caret({id: 99999, off: 0})), null);
    assert.equal(revealCmd(d.doc, f, null), null);
  });
});

describe('shownSel: an end left in hidden text goes to the heading above', () => {
  it('after Demote puts the caret\'s paragraph under a collapsed heading', () => {
    const d = mk([H(1, 'A'), 'a', H(1, 'B'), 'b']);
    const f = new Fold([ids(d)[0]]);
    const sel = C(d, 2, 0);
    assert.equal(demoteCmd(d, sel, f), sel);
    const L = lay(d, f);
    assert.equal(L.byId.has(sel.head.id), false);   // B is hidden now
    const s = shownSel(L, sel);
    assert.deepEqual(where(d, s.head), [0, 1]);
    assert.ok(L.caretRect(s.head));
  });

  it('after an undo puts the caret back in a collapsed heading\'s child', () => {
    const d = DOC();
    const f = collapseCmd(d.doc, new Fold(), C(d, 0, 0));
    const L = lay(d, f);
    const s = shownSel(L, C(d, 3, 2));
    assert.deepEqual(where(d, s.head), [0, 1]);
  });

  it('a shown selection, a layout not in Outline, no selection: as they are', () => {
    const d = DOC();
    const L = lay(d, new Fold([ids(d)[0]])), sel = C(d, 6, 0);
    assert.equal(shownSel(L, sel), sel);
    const D = new DocLayout(d.doc, tm(), null, {});
    D.layout(900);
    const h = C(d, 3, 0);
    assert.equal(shownSel(D, h), h);
    assert.equal(shownSel(L, null), null);
  });

  it('Move below a collapsed heading\'s children keeps a caret it hides shown', () => {
    const d = mk([H(1, 'A'), 'a', H(2, 'B'), H(1, 'C')]);
    const f = new Fold([ids(d)[0]]);
    const sel = C(d, 3, 0);
    moveCmd(d, sel, -1, f);
    const L = lay(d, f);
    const s = shownSel(L, sel);
    assert.ok(L.byId.has(s.head.id));
  });
});

describe('Enter at the end of a collapsed heading (D32)', () => {
  it('a heading of its level after the hidden block, the caret in it, one undo step', () => {
    const d = DOC();
    const f = new Fold([ids(d)[0]]);
    const out = undoable(d, () => enterCmd(d, C(d, 0, 1), f));
    assert.deepEqual(texts(d), ['A', 'a', 'A1', 'a1', 'A11', '', 'B', 'b']);
    assert.equal(P(d, 5).pStyle, 'Heading1');
    assert.deepEqual(where(d, out.head), [5, 0]);
    assert.equal(hid(d, f), '01111000');
  });

  it('not at the end, not collapsed, a selection: null (Enter as everywhere)', () => {
    const d = DOC();
    const f = new Fold([ids(d)[0]]);
    const before = snap(d);
    assert.equal(enterCmd(d, C(d, 0, 0), f), null);
    assert.equal(enterCmd(d, C(d, 5, 1), f), null);
    assert.equal(enterCmd(d, SEL(d, 0, 0, 0, 1), f), null);
    assert.ok(deepEqual(d.doc.sections, before));
  });

  it('the + a Show level makes counts too', () => {
    const d = DOC();
    const f = showLevel(d.doc, new Fold(), 1);
    enterCmd(d, C(d, 0, 1), f);
    assert.deepEqual(texts(d), ['A', 'a', 'A1', 'a1', 'A11', '', 'B', 'b']);
    assert.equal(levelOf(d.doc.styles, P(d, 5)), 0);
  });

  it('at the end of the document', () => {
    const d = mk([H(1, 'A'), 'a', 'z']);
    enterCmd(d, C(d, 0, 1), new Fold([ids(d)[0]]));
    assert.deepEqual(texts(d), ['A', 'a', 'z', '']);
  });
});

describe('outlineId: Enter, Backspace and Delete next to hidden text', () => {
  const d = DOC();
  const f = new Fold([ids(d)[0]]);
  it('Enter at the end of a + heading: outlineEnter; elsewhere null', () => {
    assert.equal(outlineId(d.doc, C(d, 0, 1), f, 'enter'), 'outlineEnter');
    assert.equal(outlineId(d.doc, C(d, 5, 1), f, 'enter'), null);
    assert.equal(outlineId(d.doc, C(d, 0, 1), null, 'enter'), null);
  });
  it('Backspace at the start of the block after hidden text: refused', () => {
    for (const id of ['backspace', 'ctrlBackspace'])
      assert.equal(outlineId(d.doc, C(d, 5, 0), f, id), 'outlineStop');
    assert.equal(outlineId(d.doc, C(d, 5, 1), f, 'backspace'), null);
    assert.equal(outlineId(d.doc, C(d, 6, 0), f, 'backspace'), null);
  });
  it('Delete at the end of a + heading: refused', () => {
    for (const id of ['delete', 'ctrlDelete'])
      assert.equal(outlineId(d.doc, C(d, 0, 1), f, id), 'outlineStop');
    assert.equal(outlineId(d.doc, C(d, 5, 1), f, 'delete'), null);
  });
  it('the commands run through EditApply: Stop is a beep (null) with no undo step', () => {
    const e = DOC(), L = lay(e, new Fold([ids(e)[0]])), t = new Typing(e);
    const n = e.undoDepth;
    assert.equal(run('outlineStop', e, t, C(e, 5, 0), {arg: {L}}), null);
    assert.equal(e.undoDepth, n);
    const s = run('outlineEnter', e, t, C(e, 0, 1), {arg: {L}});
    assert.deepEqual(where(e, s.head), [5, 0]);
    assert.ok(OUTLINE.outlineEnter && OUTLINE.outlineStop);
  });
});
