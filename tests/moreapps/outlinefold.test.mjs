// Outline's folding (Batch D P13.4, D32): the collapse set a Fold
// (ids, plus a level limit and first-line-only), Expand and Collapse
// on the headings the selection is in (body text: the heading above
// it), Show level 1..9 / All hiding body text and deeper headings,
// the caret moved out of hidden text, a marker found by its place
// (double-click), Show first line only keeping one line a paragraph,
// and Promote / Demote taking a collapsed heading's hidden
// subheadings with it. None of it changes the document.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {outlineOf, BODY} from '../../tools/moreapps/!Letters/OutlineLayout';
import {Fold, expandCmd, collapseCmd, showLevel, showFirst, keepVisible,
  markerAt, toggleId} from '../../tools/moreapps/!Letters/OutlineFold';
import {promoteCmd, demoteCmd, OUTLINE} from '../../tools/moreapps/!Letters/OutlineCmd';
import {levelOf} from '../../tools/moreapps/!Letters/OutlineLayout';
import {tm} from './word-docs.mjs';
import {mk, P, C, SEL, snap, ids, undoable} from './edit-docs.mjs';
import {deepEqual} from '../../tools/moreapps/!Letters/Model';

const H = (n, text) => [text, {pStyle: 'Heading' + n}];
// 0 A(H1) 1 a(body) 2 A1(H2) 3 a1(body) 4 A11(H3) 5 B(H1) 6 b(body)
const DOC = () => mk([H(1, 'A'), 'a', H(2, 'A1'), 'a1', H(3, 'A11'),
  H(1, 'B'), 'b']);
const hid = (d, f) => outlineOf(d.doc, f).rows.map((r) => r.hidden ? 1 : 0).join('');
const names = (d, f) => {
  const L = new DocLayout(d.doc, tm(), null, {outline: f});
  L.layout(900);
  return L;
};

describe('Fold', () => {
  it('is a Set of ids with a level limit and a first-line flag', () => {
    const f = new Fold(['x'], 2, true);
    assert.ok(f instanceof Set);
    assert.deepEqual([f.has('x'), f.cap, f.first], [true, 2, true]);
    const g = new Fold();
    assert.deepEqual([g.size, g.cap, g.first], [0, 0, false]);
    assert.equal(new Fold(['q'], 99).cap, 0);
    assert.equal(new Fold([], 1.5).cap, 0);
  });
});

describe('Show level (D32)', () => {
  it('level 1: only the Heading 1s; 2: headings 1-2, no body text', () => {
    const d = DOC();
    assert.equal(hid(d, showLevel(d.doc, new Fold(), 1)), '0111101');
    assert.equal(hid(d, showLevel(d.doc, new Fold(), 2)), '0101101');
    assert.equal(hid(d, showLevel(d.doc, new Fold(), 9)), '0101001');
  });

  it('All (0) shows everything again; the first-line flag is kept', () => {
    const d = DOC();
    const f = showLevel(d.doc, showFirst(new Fold(), true), 1);
    assert.equal(f.first, true);
    const all = showLevel(d.doc, f, 0);
    assert.equal(hid(d, all), '0000000');
    assert.equal(all.cap, 0);
    assert.equal(all.first, true);
  });

  it('keeps the headings collapsed by id', () => {
    const d = DOC();
    const f = showLevel(d.doc, new Fold([ids(d)[2]]), 3);
    assert.ok(f.has(ids(d)[2]));
    assert.equal(hid(d, f), '0101101');
  });

  it('a bad level changes nothing: null', () => {
    const d = DOC();
    for (const n of [-1, 10, 1.5, '2', NaN]) assert.equal(showLevel(d.doc, new Fold(), n), null);
  });

  it('markers: a heading whose children are hidden is +', () => {
    const d = DOC();
    const m = (f) => outlineOf(d.doc, f).rows.map((r) => r.marker).join('');
    assert.equal(m(showLevel(d.doc, new Fold(), 1))[0], '+');
    assert.equal(m(showLevel(d.doc, new Fold(), 1))[5], '+');
  });

  it('the layout has no items for hidden rows', () => {
    const d = DOC();
    const L = names(d, showLevel(d.doc, new Fold(), 2));
    assert.deepEqual(L.items.map((i) => i.block.text), ['A', 'A1', 'B']);
  });
});

describe('Expand and Collapse (D32)', () => {
  it('Collapse: the heading the caret is in; Expand opens it', () => {
    const d = DOC();
    const c = collapseCmd(d.doc, new Fold(), C(d, 0, 1));
    assert.ok(c instanceof Fold);
    assert.deepEqual([...c], [ids(d)[0]]);
    assert.equal(hid(d, c), '0111100');
    const e = expandCmd(d.doc, c, C(d, 0, 0));
    assert.equal(e.size, 0);
  });

  it('body text: the heading above it', () => {
    const d = DOC();
    assert.deepEqual([...collapseCmd(d.doc, new Fold(), C(d, 3, 0))], [ids(d)[2]]);
  });

  it('a selection over several headings collapses each', () => {
    const d = DOC();
    const c = collapseCmd(d.doc, new Fold(), SEL(d, 0, 0, 5, 1));
    assert.deepEqual([...c].sort(),
      [ids(d)[0], ids(d)[2], ids(d)[5]].sort());
  });

  it('a heading with no children: null (nothing to collapse)', () => {
    const d = DOC();
    assert.equal(collapseCmd(d.doc, new Fold(), C(d, 4, 0)), null);
  });

  it('Expand where nothing is collapsed: null', () => {
    const d = DOC();
    assert.equal(expandCmd(d.doc, new Fold(), C(d, 0, 0)), null);
  });

  it('body text before any heading has none: null', () => {
    const d = mk(['x', H(1, 'h'), 'y']);
    assert.equal(collapseCmd(d.doc, new Fold(), C(d, 0, 0)), null);
  });

  it('with a level limit they change the limit by one level', () => {
    const d = DOC();
    const f = showLevel(d.doc, new Fold(), 2);
    assert.equal(expandCmd(d.doc, f, C(d, 0, 0)).cap, 3);
    assert.equal(collapseCmd(d.doc, f, C(d, 0, 0)).cap, 1);
    assert.equal(collapseCmd(d.doc, showLevel(d.doc, new Fold(), 1), C(d, 0, 0)), null);
    assert.equal(expandCmd(d.doc, showLevel(d.doc, new Fold(), 9), C(d, 0, 0)).cap, 0);
  });

  it('no selection: null; the set is never changed in place', () => {
    const d = DOC();
    const f = new Fold();
    assert.equal(collapseCmd(d.doc, f, null), null);
    collapseCmd(d.doc, f, C(d, 0, 0));
    assert.equal(f.size, 0);
  });
});

describe('keepVisible: the caret out of hidden text', () => {
  it('a caret in hidden text goes to the end of the heading above', () => {
    const d = DOC();
    const f = collapseCmd(d.doc, new Fold(), C(d, 0, 0));
    const s = keepVisible(d.doc, f, C(d, 3, 1));
    assert.equal(s.head.id, ids(d)[0]);
    assert.equal(s.head.off, 1);
    assert.equal(s.anchor.id, ids(d)[0]);
  });

  it('a visible selection is returned as it is', () => {
    const d = DOC();
    const sel = C(d, 5, 0);
    assert.equal(keepVisible(d.doc, collapseCmd(d.doc, new Fold(), C(d, 0, 0)), sel), sel);
  });

  it('only the hidden end moves', () => {
    const d = DOC();
    const f = showLevel(d.doc, new Fold(), 1);
    const s = keepVisible(d.doc, f, SEL(d, 0, 0, 3, 1));
    assert.deepEqual([s.anchor.id, s.anchor.off], [ids(d)[0], 0]);
    assert.deepEqual([s.head.id, s.head.off], [ids(d)[0], 1]);
  });

  it('a selection in a hidden body before any heading: unchanged', () => {
    const d = mk(['x']);
    const sel = C(d, 0, 0);
    assert.equal(keepVisible(d.doc, new Fold(), sel), sel);
  });
});

describe('markerAt: a marker found by its place (double-click)', () => {
  it('on a marker of a heading with children: its id; elsewhere null', () => {
    const d = DOC();
    const L = names(d, new Fold());
    const it0 = L.items[0], ln = it0.lines[0];
    const y = it0.y + ln.y + ln.h / 2;
    assert.equal(markerAt(L, it0.x - 12, y), ids(d)[0]);
    assert.equal(markerAt(L, it0.x - 12, y + 5000), null);
    assert.equal(markerAt(L, it0.x + 10, y), null);
    assert.equal(markerAt(L, it0.x - 40, y), null);
    // body text: marker o, nothing to toggle
    const b = L.items[1];
    assert.equal(markerAt(L, b.x - 12, b.y + b.lines[0].y + 3), null);
  });

  it('not in a layout without outline', () => {
    const d = DOC();
    const L = new DocLayout(d.doc, tm(), null, {});
    L.layout(900);
    assert.equal(markerAt(L, 0, 20), null);
  });
});

describe('toggleId', () => {
  it('a collapsed heading is expanded, an expanded one collapsed', () => {
    const d = DOC();
    const a = toggleId(d.doc, new Fold(), ids(d)[0]);
    assert.deepEqual([...a], [ids(d)[0]]);
    assert.equal(toggleId(d.doc, a, ids(d)[0]).size, 0);
    assert.equal(toggleId(d.doc, new Fold(), ids(d)[1]), null);
    assert.equal(toggleId(d.doc, new Fold(), 'nope'), null);
  });
});

describe('Show first line only', () => {
  const LONG = 'word '.repeat(80);
  it('a paragraph keeps one line; the lines of others are not shared', () => {
    const d = mk([H(1, 'A'), LONG]);
    const full = names(d, new Fold());
    assert.ok(full.items[1].lines.length > 1);
    const L = new DocLayout(d.doc, tm(), full, {outline: showFirst(new Fold(), true)});
    L.layout(900);
    assert.equal(L.items[1].lines.length, 1);
    assert.ok(L.items[1].h < full.items[1].h);
    // back again
    const L2 = new DocLayout(d.doc, tm(), L, {outline: showFirst(new Fold(), false)});
    L2.layout(900);
    assert.equal(L2.items[1].lines.length, full.items[1].lines.length);
  });

  it('a caret in the hidden rest still has a rect, on the first line', () => {
    const d = mk([LONG]);
    const L = new DocLayout(d.doc, tm(), null, {outline: showFirst(new Fold(), true)});
    L.layout(900);
    const r = L.caretRect({id: ids(d)[0], off: 300});
    assert.ok(r);
    assert.ok(r.y <= L.items[0].y + L.items[0].h);
    assert.ok(L.caretRect({id: ids(d)[0], off: 0}));
  });

  it('showFirst keeps the ids and the limit', () => {
    const d = DOC();
    const f = showFirst(showLevel(d.doc, new Fold([ids(d)[0]]), 2), true);
    assert.deepEqual([f.has(ids(d)[0]), f.cap, f.first], [true, 2, true]);
  });
});

describe('Promote and Demote take a collapsed heading\'s hidden subheadings', () => {
  const lv = (d, k) => levelOf(d.doc.styles, P(d, k));
  it('Demote: H1 collapsed over A1 (H2) and A11 (H3): all one level down', () => {
    const d = DOC();
    const f = new Fold([ids(d)[0]]);
    undoable(d, () => demoteCmd(d, C(d, 0, 0), f));
    assert.deepEqual([0, 2, 4].map((k) => lv(d, k)), [1, 2, 3]);
    assert.equal(lv(d, 1), BODY, 'body text untouched');
    assert.equal(lv(d, 3), BODY);
    assert.equal(lv(d, 5), 0, 'the next Heading 1 untouched');
  });

  it('Promote likewise; one undo step', () => {
    const d = mk([H(2, 'x'), H(3, 'y'), 'z', H(2, 'w')]);
    const f = new Fold([ids(d)[0]]);
    const n = d.undoDepth;
    undoable(d, () => promoteCmd(d, C(d, 0, 0), f));
    assert.deepEqual([0, 1].map((k) => lv(d, k)), [0, 1]);
    assert.equal(lv(d, 3), 1);
    assert.equal(d.undoDepth, n + 1);
    d.undo();
    assert.deepEqual([0, 1, 3].map((k) => lv(d, k)), [1, 2, 1]);
  });

  it('an expanded heading takes only itself', () => {
    const d = DOC();
    undoable(d, () => demoteCmd(d, C(d, 0, 0), new Fold()));
    assert.deepEqual([0, 2, 4].map((k) => lv(d, k)), [1, 1, 2]);
  });

  it('Heading 1 promoted is still refused, collapsed or not', () => {
    const d = DOC();
    const before = snap(d);
    assert.equal(promoteCmd(d, C(d, 0, 0), new Fold([ids(d)[0]])), null);
    assert.ok(deepEqual(d.doc.sections, before));
  });

  it('OUTLINE gives the collapse set from {L}', () => {
    const d = DOC();
    const L = names(d, new Fold([ids(d)[0]]));
    undoable(d, () => OUTLINE.outlineDemote(d, C(d, 0, 0), {L}));
    assert.deepEqual([0, 2, 4].map((k) => lv(d, k)), [1, 2, 3]);
  });
});

describe('Folding never changes the document', () => {
  it('the commands do not touch d.doc', () => {
    const d = DOC();
    const before = snap(d);
    const f = collapseCmd(d.doc, new Fold(), C(d, 0, 0));
    expandCmd(d.doc, f, C(d, 0, 0));
    showLevel(d.doc, f, 2);
    keepVisible(d.doc, f, C(d, 3, 0));
    assert.ok(deepEqual(d.doc.sections, before));
  });
});
