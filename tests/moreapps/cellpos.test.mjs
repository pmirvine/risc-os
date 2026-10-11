// Carets in cells (Batch C3.1, D8, D9): L.flow holds every caret-
// holding item in flow order (a table at its start, its cells' items
// row by row, cell by cell, the table AGAIN at its end: index and
// endIndex), the same ranks as EditPos; compare by flow place (a
// table's off 1 by endIndex); hitTest into a cell's column (the
// nearest cell outside every cell, a merge's restart cell); Left /
// Right in flow order with D8's reachable table edges; Enter at a
// table's edge or at the start of the first cell of a table first in
// its container puts an empty paragraph before the table (nested
// too), elsewhere in a cell it splits the cell's paragraph;
// Selection.clamp finds positions at every depth. And the two layout
// rules of the C2 re-review: a previous layout is used up once a
// layout is built from it (offered again: no reuse), and a kept
// cell item's flow index is refreshed (DocRects' band clip mapped).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {compare} from '../../tools/moreapps/!Word/DocPos';
import {findBlock, orderedPos} from '../../tools/moreapps/!Word/EditPos';
import {apply} from '../../tools/moreapps/!Word/Ops';
import {newPara} from '../../tools/moreapps/!Word/Model';
import {at as walkAt} from '../../tools/moreapps/!Word/Walk';
import * as E from '../../tools/moreapps/!Word/Edit';
import {loadStyles, tm, rng} from './word-docs.mjs';
import {mk, undoable, S} from './edit-docs.mjs';
import {modelTable, freeze} from './tbl-fixtures.mjs';

before(loadStyles);

const lay = (doc, m = tm(), prev, w = 800) => {
  const L = new DocLayout(doc, m, prev);
  L.layout(w);
  return L;
};

/** p0, T (2x2: (0,0) a; (0,1) b1, N (1x2: n1 n2), b2; (1,0) c;
 *  (1,1) d), p2: the flow p0 T a b1 N n1 n2 N b2 c d T p2. */
function fixture(before = ['p0'], after = ['p2']) {
  const N = modelTable([['n1', 'n2']]);
  const T = modelTable([['a', ['b1', N, 'b2']], ['c', 'd']]);
  const d = mk([...before, freeze(T), ...after]);
  return {d, T, N};
}

/** The block whose text is t (any depth). */
function byText(doc, t) {
  let out = null;
  const look = (list) => list.forEach((b) => {
    if (b.type === 'p' && b.text === t && !out) out = b;
    if (b.type === 'tbl') {
      b.rows.forEach((r) => r.cells.forEach((c) => look(c.blocks)));
    }
  });
  doc.sections.forEach((s) => look(s.blocks));
  return out;
}
const idOf = (doc, t) => byText(doc, t).id;
const name = (doc, L, pos) => {
  const it = L.byId.get(pos.id);
  return it.kind === 'p' ? `${it.block.text}:${pos.off}`
    : `${it.kind}${it.block.rows.length}:${pos.off}`;
};
/** 2x2, column 0 merged down: top / cont; x, y. */
const merged = () => modelTable([
  [{blocks: ['top'], tcPr: {vMerge: 'restart', extra: []}}, 'x'],
  [{blocks: ['cont'], tcPr: {vMerge: 'continue', extra: []}}, 'y']]);
const cellRect = (L, T, r, c) => L.byId.get(T.id).rows[r].cells[c];

describe('L.flow: cells in flow order (D9)', () => {
  it('p, T (2x2 + nested), p: the order, index and endIndex', () => {
    const {d, T, N} = fixture();
    const L = lay(d.doc);
    const names = L.flow.map((x) => (x.kind === 'p' ? x.block.text
      : x.id === T.id ? 'T' : 'N'));
    assert.deepEqual(names, ['p0', 'T', 'a', 'b1', 'N', 'n1', 'n2', 'N',
      'b2', 'c', 'd', 'T', 'p2']);
    assert.deepEqual(L.items.map((x) => x.kind), ['p', 'tbl', 'p'],
      'the root column is unchanged');
    assert.notEqual(L.flow, L.items);
    for (const [i, x] of L.flow.entries()) {
      assert.ok(x.index === i || x.endIndex === i, `place ${i}`);
    }
    assert.equal(L.byId.get(T.id).index, 1);
    assert.equal(L.byId.get(T.id).endIndex, 11);
    assert.equal(L.byId.get(N.id).index, 4);
    assert.equal(L.byId.get(N.id).endIndex, 7);
  });

  it('the same ranks as EditPos (D9: L.flow agrees with rankOf)', () => {
    const {d} = fixture(['p0', 'q0'], ['p2', 'q2']);
    const L = lay(d.doc);
    for (const x of L.byId.values()) {
      const loc = findBlock(d.doc, x.id);
      assert.equal(x.index, loc.rank, `rank of ${x.id}`);
      if (x.kind === 'tbl') assert.equal(x.endIndex, loc.endRank);
    }
  });

  it('a vMerge continue cell\'s own paragraph is in the flow', () => {
    const T = merged();
    const d = mk([T, 'after']);
    const L = lay(d.doc);
    assert.deepEqual(L.flow.map((x) => (x.kind === 'p' ? x.block.text
      : 'T')), ['T', 'top', 'x', 'cont', 'y', 'T', 'after']);
  });

  it('compare: positions in cells (0,1) and (1,0) by rank', () => {
    const {d, T} = fixture();
    const L = lay(d.doc);
    const b1 = {id: idOf(d.doc, 'b1'), off: 1};
    const c = {id: idOf(d.doc, 'c'), off: 0};
    const n2 = {id: idOf(d.doc, 'n2'), off: 2};
    assert.ok(compare(L, b1, c) < 0);
    assert.ok(compare(L, c, b1) > 0);
    assert.ok(compare(L, n2, {id: idOf(d.doc, 'b2'), off: 0}) < 0);
    const t0 = {id: T.id, off: 0}, t1 = {id: T.id, off: 1};
    assert.ok(compare(L, t0, {id: idOf(d.doc, 'a'), off: 0}) < 0);
    assert.ok(compare(L, t1, {id: idOf(d.doc, 'd'), off: 1}) > 0);
    assert.ok(compare(L, t1, {id: idOf(d.doc, 'p2'), off: 0}) < 0);
    assert.ok(compare(L, t0, t1) < 0);
    // the order orderedPos gives (EditPos), for every pair
    const all = [];
    for (const x of L.flow) {
      for (const off of x.kind === 'p' ? [0, x.block.text.length]
        : [0, 1]) all.push({id: x.id, off});
    }
    for (const a of all) {
      for (const b of all) {
        const o = orderedPos(d.doc, S.select(a, b));
        const want = compare(L, a, b) > 0 ? b : a;
        assert.deepEqual(o.from, want);
      }
    }
  });

  it('locate gives a table\'s place: its endIndex at off 1', () => {
    const {d, T} = fixture();
    const L = lay(d.doc);
    assert.equal(L.locate({id: T.id, off: 0}).index, 1);
    assert.equal(L.locate({id: T.id, off: 1}).index, 11);
  });
});

describe('hitTest and caretRect in cells', () => {
  it('the middle of cell (1,1) gives its paragraph', () => {
    const {d, T} = fixture();
    const L = lay(d.doc);
    const c = cellRect(L, T, 1, 1);
    const row = L.byId.get(T.id).rows[1];
    const h = L.hitTest(c.x + c.w / 2, row.y + row.h / 2);
    assert.equal(h.pos.id, idOf(d.doc, 'd'));
  });

  it('50 random points in cells: caretRect(hitTest) in that cell, ' +
    'and back', () => {
    const {d, T} = fixture();
    const L = lay(d.doc);
    const it = L.byId.get(T.id), rnd = rng(31);
    for (let k = 0; k < 50; k++) {
      const r = rnd() < 0.5 ? 0 : 1, c = rnd() < 0.5 ? 0 : 1;
      const cell = it.rows[r].cells[c], row = it.rows[r];
      const x = cell.x + 1 + rnd() * (cell.w - 2);
      const y = row.y + 1 + rnd() * (row.h - 2);
      const h = L.hitTest(x, y);
      const item = L.byId.get(h.pos.id);
      assert.ok(item.x >= cell.x - 1e-6 && item.x + item.w <=
        cell.x + cell.w + 1e-6, `item in cell (${r}, ${c})`);
      const cr = L.caretRect(h.pos, h.affinity);
      assert.ok(cr.x >= cell.x - 1e-6 && cr.x <= cell.x + cell.w + 1e-6,
        `caret x in cell (${r}, ${c}): ${cr.x}`);
      assert.ok(cr.y >= row.y - 1e-6 && cr.y + cr.h <= row.y + row.h +
        1e-6, `caret y in row ${r}`);
      const back = L.hitTest(cr.x, cr.y + cr.h / 2);
      assert.deepEqual(back.pos, h.pos, 'round trip');
    }
  });

  it('outside every cell but in the table\'s rows: the nearest cell',
    () => {
      const {d, T} = fixture();
      const L = lay(d.doc);
      const it = L.byId.get(T.id), row = it.rows[1];
      const y = row.y + row.h / 2;
      assert.equal(L.hitTest(it.x + it.left - 30, y).pos.id,
        idOf(d.doc, 'c'));
      assert.equal(L.hitTest(it.x + it.left + it.width + 30, y).pos.id,
        idOf(d.doc, 'd'));
    });

  it('a click in a lower row of a vertical merge: the merged cell', () => {
    const T = merged();
    const d = mk([T, 'after']);
    const L = lay(d.doc);
    const it = L.byId.get(T.id), row = it.rows[1];
    const c = row.cells[0];
    const h = L.hitTest(c.x + 4, row.y + row.h / 2);
    assert.equal(h.pos.id, idOf(d.doc, 'top'));
  });

  it('the nested table: a hit in its cell gives its paragraph', () => {
    const {d, N} = fixture();
    const L = lay(d.doc);
    const it = L.byId.get(N.id), c = it.rows[0].cells[1];
    const h = L.hitTest(c.x + c.w / 2, it.rows[0].y + 2);
    assert.equal(h.pos.id, idOf(d.doc, 'n2'));
  });
});

/** Right (dir 1) or Left from pos: the names visited, n steps. */
function walk(d, L, pos, cmd, n) {
  let sel = S.caret(pos);
  const out = [];
  for (let k = 0; k < n; k++) {
    sel = S.move(sel, L, cmd);
    out.push(name(d.doc, L, sel.head));
  }
  return out;
}

describe('Left / Right in flow order (D8)', () => {
  it('Right from the end of the paragraph before: cell (0,0)\'s start; ' +
    'at the end of the last cell: the paragraph after; Left mirrors',
  () => {
    const {d} = fixture();
    const L = lay(d.doc);
    const p0 = {id: idOf(d.doc, 'p0'), off: 2};
    assert.deepEqual(walk(d, L, p0, 'right', 1), ['a:0']);
    const dd = {id: idOf(d.doc, 'd'), off: 1};
    assert.deepEqual(walk(d, L, dd, 'right', 1), ['p2:0']);
    assert.deepEqual(walk(d, L, {id: idOf(d.doc, 'p2'), off: 0}, 'left',
      1), ['d:1']);
    assert.deepEqual(walk(d, L, {id: idOf(d.doc, 'a'), off: 0}, 'left',
      1), ['p0:2']);
  });

  it('Right through the whole table visits every cell in order, ' +
    'into the nested table and out; Left back the same way', () => {
    const {d} = fixture();
    const L = lay(d.doc);
    const fw = walk(d, L, {id: idOf(d.doc, 'p0'), off: 2}, 'right', 16);
    assert.deepEqual(fw, ['a:0', 'a:1', 'b1:0', 'b1:1', 'b1:2', 'n1:0',
      'n1:1', 'n1:2', 'n2:0', 'n2:1', 'n2:2', 'b2:0', 'b2:1', 'b2:2',
      'c:0', 'c:1']);
    const bw = walk(d, L, {id: idOf(d.doc, 'c'), off: 1}, 'left', 15);
    assert.deepEqual(bw, ['c:0', 'b2:2', 'b2:1', 'b2:0', 'n2:2', 'n2:1',
      'n2:0', 'n1:2', 'n1:1', 'n1:0', 'b1:2', 'b1:1', 'b1:0', 'a:1',
      'a:0']);
  });

  it('a table first in the document: Left from cell (0,0)\'s start ' +
    'reaches {t, 0}; Right from there goes back in', () => {
    const T = modelTable([['a', 'b'], ['c', 'd']]);
    const d = mk([T, 'after']);
    const L = lay(d.doc);
    assert.deepEqual(walk(d, L, {id: idOf(d.doc, 'a'), off: 0}, 'left',
      2), ['tbl2:0', 'tbl2:0']);
    assert.deepEqual(walk(d, L, {id: T.id, off: 0}, 'right', 1),
      ['a:0']);
    assert.deepEqual(L.docStart(), {id: T.id, off: 0});
  });

  it('a table last in the document: Right from the last cell reaches ' +
    '{t, 1}; Left from there goes back in', () => {
    const T = modelTable([['a', 'b']]);
    const d = mk(['before', T]);
    const L = lay(d.doc);
    assert.deepEqual(walk(d, L, {id: idOf(d.doc, 'b'), off: 1}, 'right',
      2), ['tbl1:1', 'tbl1:1']);
    assert.deepEqual(walk(d, L, {id: T.id, off: 1}, 'left', 1),
      ['b:1']);
    assert.deepEqual(L.docEnd(), {id: T.id, off: 1});
  });

  it('a table first in a cell: its start edge reachable (a cell ends ' +
    'with a paragraph, so its end edge has one beside it)', () => {
    const N = modelTable([['n']]);
    const T = modelTable([[[N, ''], 'x']]);
    const d = mk(['p', T, 'q']);
    const L = lay(d.doc);
    assert.deepEqual(walk(d, L, {id: idOf(d.doc, 'p'), off: 1}, 'right',
      5), ['tbl1:0', 'n:0', 'n:1', ':0', 'x:0']);
    assert.deepEqual(walk(d, L, {id: idOf(d.doc, 'n'), off: 0}, 'left',
      2), ['tbl1:0', 'p:1']);
  });

  it('two tables one after the other: the edges between them reachable',
    () => {
      const A = modelTable([['a']]), B = modelTable([['b']]);
      const d = mk(['p', A, B, 'q']);
      const L = lay(d.doc);
      assert.deepEqual(walk(d, L, {id: idOf(d.doc, 'a'), off: 1},
        'right', 4), ['tbl1:1', 'tbl1:0', 'b:0', 'b:1']);
    });

  it('Down and Up do not loop at a table (they pass its edges)', () => {
    const {d} = fixture();
    const L = lay(d.doc);
    let sel = S.caret({id: idOf(d.doc, 'p0'), off: 0});
    const seen = [];
    for (let k = 0; k < 20; k++) {
      sel = S.move(sel, L, 'down');
      seen.push(name(d.doc, L, sel.head).split(':')[0]);
    }
    assert.equal(seen[seen.length - 1], 'p2');
    assert.ok(!seen.includes('tbl2'), seen.join(' '));
    for (let k = 0; k < 20; k++) sel = S.move(sel, L, 'up');
    assert.equal(name(d.doc, L, sel.head).split(':')[0], 'p0');
  });
});

describe('Enter by a table (D8)', () => {
  it('Enter at {t, 0} puts an empty paragraph before the table, one ' +
    'undo step', () => {
    const T = modelTable([['a', 'b']]);
    const d = mk([freeze(T), 'after']);
    const sel = undoable(d, () => E.splitPara(d, S.caret({id: T.id,
      off: 0})));
    const bs = d.doc.sections[0].blocks;
    assert.deepEqual(bs.map((b) => b.type), ['p', 'tbl', 'p']);
    assert.equal(bs[0].text, '');
    assert.equal(bs[1], T);
    assert.deepEqual(sel.head, {id: T.id, off: 0});
  });

  it('Enter at the start of cell (0,0) of a table first in the ' +
    'document: the same, the caret stays in the cell', () => {
    const T = modelTable([['a', 'b']]);
    const d = mk([freeze(T), 'after']);
    const a = idOf(d.doc, 'a');
    const sel = undoable(d, () => E.splitPara(d, S.caret({id: a,
      off: 0})));
    const bs = d.doc.sections[0].blocks;
    assert.deepEqual(bs.map((b) => b.type), ['p', 'tbl', 'p']);
    assert.equal(bs[0].text, '');
    assert.equal(bs[1], T, 'the table untouched');
    assert.deepEqual(sel.head, {id: a, off: 0});
  });

  it('Enter at the start of cell (0,0) of a table first in a cell: ' +
    'the paragraph goes before it inside that cell (paraBy nested)',
  () => {
    const N = modelTable([['n1', 'n2']]);
    const T = modelTable([[[N, 'x'], 'y']]);
    const d = mk(['p', freeze(T), 'q']);
    const n1 = idOf(d.doc, 'n1');
    const sel = undoable(d, () => E.splitPara(d, S.caret({id: n1,
      off: 0})));
    const cell = d.doc.sections[0].blocks[1].rows[0].cells[0];
    assert.deepEqual(cell.blocks.map((b) => (b.type === 'p' ? b.text
      : 'N')), ['', 'N', 'x']);
    assert.equal(cell.blocks[1], N, 'the nested table untouched');
    assert.deepEqual(sel.head, {id: n1, off: 0});
    assert.equal(d.doc.sections[0].blocks.length, 3, 'nothing at top');
  });

  it('Enter elsewhere in a cell splits the cell\'s paragraph', () => {
    const {d} = fixture();
    // a: the table is not first (p0 before it)
    const a = idOf(d.doc, 'a');
    undoable(d, () => E.splitPara(d, S.caret({id: a, off: 0})));
    let cell = d.doc.sections[0].blocks[1].rows[0].cells[0];
    assert.deepEqual(cell.blocks.map((b) => b.text), ['', 'a']);
    assert.equal(d.doc.sections[0].blocks.length, 3);
    const c = idOf(d.doc, 'c');
    const sel = undoable(d, () => E.splitPara(d, S.caret({id: c,
      off: 1})));
    cell = d.doc.sections[0].blocks[1].rows[1].cells[0];
    assert.deepEqual(cell.blocks.map((b) => b.text), ['c', '']);
    assert.equal(sel.head.id, cell.blocks[1].id);
  });

  it('a table first in the document: Enter at the start of cell (0,1)' +
    ' or of cell (0,0)\'s second paragraph splits in the cell', () => {
    const T = modelTable([[['a', 'a2'], 'b']]);
    const d = mk([T, 'after']);
    for (const t of ['b', 'a2']) {
      E.splitPara(d, S.caret({id: idOf(d.doc, t), off: 0}));
    }
    const bs = d.doc.sections[0].blocks;
    assert.equal(bs.length, 2);
    const row = bs[0].rows[0];
    assert.deepEqual(row.cells[0].blocks.map((b) => b.text),
      ['a', '', 'a2']);
    assert.deepEqual(row.cells[1].blocks.map((b) => b.text), ['', 'b']);
  });
});

describe('Selection.clamp at every depth', () => {
  it('keeps a caret in a cell after an unrelated edit', () => {
    const {d} = fixture();
    const L1 = lay(d.doc);
    const pos = {id: idOf(d.doc, 'n2'), off: 1};
    E.typeText(d, S.caret({id: idOf(d.doc, 'p0'), off: 0}), 'x');
    const L2 = lay(d.doc, tm(), L1);
    const sel = S.clamp(S.caret(pos), d.doc, L1);
    assert.deepEqual(sel.head, pos);
    assert.ok(L2.locate(sel.head));
  });

  it('a caret in a cell paragraph removed: the next block in the old ' +
    'flow', () => {
    const T = modelTable([['a', ['b1', 'b2']], ['c', 'd']]);
    const d = mk(['p0', freeze(T), 'p2']);
    const L1 = lay(d.doc);
    const b2 = idOf(d.doc, 'b2');
    const at = findBlock(d.doc, b2).at;
    apply(d.doc, {op: 'removeBlock', at});
    const sel = S.clamp(S.caret({id: b2, off: 1}), d.doc, L1);
    assert.deepEqual(sel.head, {id: idOf(d.doc, 'c'), off: 0});
  });

  it('the last paragraph of the last cell removed: the end of the ' +
    'last one left in the table, never its start edge (C3a m1)', () => {
    const T = modelTable([['a', 'b'], ['c', ['d', 'e']]]);
    const d = mk(['p0', freeze(T), 'p2']);
    const L1 = lay(d.doc);
    const e = idOf(d.doc, 'e');
    apply(d.doc, {op: 'removeBlock', at: findBlock(d.doc, e).at});
    const sel = S.clamp(S.caret({id: e, off: 1}), d.doc, L1);
    assert.deepEqual(sel.head, {id: idOf(d.doc, 'd'), off: 1});
    // the table last in the document: the same
    const U = modelTable([['a', ['d', 'e']]]);
    const d2 = mk([freeze(U)]);
    const L2 = lay(d2.doc);
    const e2 = idOf(d2.doc, 'e');
    apply(d2.doc, {op: 'removeBlock', at: findBlock(d2.doc, e2).at});
    const s2 = S.clamp(S.caret({id: e2, off: 0}), d2.doc, L2);
    assert.deepEqual(s2.head, {id: idOf(d2.doc, 'd'), off: 1});
  });

  it('a whole last row removed (a new table, ids kept): the end of the ' +
    'row before; a paragraph before a table removed: its start edge',
  () => {
    const T = modelTable([['a', 'b'], ['c', 'd']]);
    const d = mk(['p0', freeze(T), 'p2']);
    const L1 = lay(d.doc);
    const t = d.doc.sections[0].blocks[1];
    const dId = idOf(d.doc, 'd');
    apply(d.doc, {op: 'restoreBlock', block: [0, 1],
      snapshot: {...t, rows: [t.rows[0]]}});
    const sel = S.clamp(S.caret({id: dId, off: 0}), d.doc, L1);
    assert.deepEqual(sel.head, {id: idOf(d.doc, 'b'), off: 1});
    const p0 = idOf(d.doc, 'p0');
    const L2 = lay(d.doc);
    apply(d.doc, {op: 'removeBlock', at: [0, 0]});
    const s2 = S.clamp(S.caret({id: p0, off: 0}), d.doc, L2);
    assert.deepEqual(s2.head, {id: t.id, off: 0});
  });
});

describe('the C2 re-review rules', () => {
  /** Every item's place, every depth. */
  const places = (L) => [...L.byId.values()].map((x) => [x.id, x.index,
    x.endIndex ?? null, x.x, x.y]).sort((a, b) => a[0] - b[0]);

  it('(1) a previous layout is used up: offered again, no reuse ' +
    '(the layout made from it first stays as laid out)', () => {
    const {d} = fixture();
    const m = tm();
    const L1 = lay(d.doc, m);
    const L2 = lay(d.doc, m, L1, 800);
    assert.equal(L1.spent, true);
    const before = places(L2);
    const L3 = lay(d.doc, m, L1, 1400);
    assert.deepEqual(places(L2), before, 'L2 not moved by L3');
    const full = lay(d.doc, m, null, 1400);
    assert.deepEqual(places(L3), places(full));
    // no item shared between L3 and L2
    for (const x of L3.byId.values()) {
      assert.notEqual(L2.byId.get(x.id), x);
    }
  });

  it('(2) a kept cell item gets its own flow index in the new layout',
    () => {
      const {d, T} = fixture();
      const m = tm();
      const L1 = lay(d.doc, m);
      const a1 = L1.byId.get(idOf(d.doc, 'a'));
      apply(d.doc, {op: 'insertBlock', at: [0, 0], block: newPara('new')});
      const L2 = lay(d.doc, m, L1);
      assert.equal(L2.byId.get(idOf(d.doc, 'a')), a1, 'kept (shared)');
      L2.flow.forEach((x, i) => assert.ok(x.index === i ||
        x.endIndex === i, `place ${i}`));
      const full = lay(d.doc, m);
      for (const x of full.byId.values()) {
        const y = L2.byId.get(x.id);
        assert.equal(y.index, x.index, `index of ${x.id}`);
        assert.equal(y.endIndex, x.endIndex);
      }
      assert.equal(L2.byId.get(T.id).index, 2);
      assert.equal(a1.index, 3);
    });

  it('(2) selectionRects clipped to a band inside a table lights the ' +
    'cells in that band', () => {
    const {d, T} = fixture();
    const L = lay(d.doc);
    const it = L.byId.get(T.id), row = it.rows[1];
    const sel = S.select({id: idOf(d.doc, 'a'), off: 0},
      {id: idOf(d.doc, 'd'), off: 1});
    const rs = L.selectionRects(sel, row.y + 1, row.y + row.h - 1);
    const want = [row.cells[0], row.cells[1]];
    for (const c of want) {
      // (C3.2: a..d is the whole table, lit as one box: overlap)
      assert.ok(rs.some((q) => q.x < c.x + c.w && q.x + q.w > c.x &&
        q.y + q.h > row.y && q.y < row.y + row.h), 'cell lit');
    }
    const whole = L.selectionRects(sel);
    assert.ok(whole.length >= rs.length);
    assert.ok(rs.every((q) => q.y + q.h > row.y - 1e-6), 'only the band');
  });

  it('a table whose edges are both selected is lit once, whole', () => {
    const {d, T} = fixture();
    const L = lay(d.doc);
    const sel = S.select({id: T.id, off: 0}, {id: T.id, off: 1});
    const box = L.boxRect(L.byId.get(T.id));
    const rs = L.selectionRects(sel);
    assert.equal(rs.filter((q) => q.x === box.x && q.y === box.y &&
      q.w === box.w && q.h === box.h).length, 1);
  });
});

describe('positions in cells valid everywhere', () => {
  it('checkPos / caretRect / text of a range in a cell', () => {
    const {d} = fixture();
    const L = lay(d.doc);
    const n1 = idOf(d.doc, 'n1');
    assert.ok(L.caretRect({id: n1, off: 2}));
    assert.equal(S.text(S.select({id: idOf(d.doc, 'b1'), off: 1},
      {id: idOf(d.doc, 'b2'), off: 1}), L), '1\nn1\nn2\nb');
    assert.equal(walkAt(d.doc, findBlock(d.doc, n1).at).id, n1);
  });
});
