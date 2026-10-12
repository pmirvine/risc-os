// Movement and the mouse in tables (Batch C3.3, D10, SelTable): Up /
// Down keep goalX geometrically (from a cell's first / last line to
// the cell above / below that spans goalX, a merge's restart cell,
// then out of the table to the paragraph above / below; a table last
// in its column gives its end edge); Home / End the line in the
// cell; Tab / Shift-Tab: the next / previous cell in flow order with
// its whole content selected ('last' past the table's last / first
// cell, null outside a table; vMerge continue cells skipped); the
// mouse's zones: the first 4 px inside a cell's left edge (its
// content), 0.25 in (24 px) left of a row (the row), 4 px above the
// table's top border (the column under it), at their exact limits.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import * as T from '../../tools/moreapps/!Letters/SelTable';
import {make} from '../../tools/moreapps/!Letters/SelMove';
import {shapeOf} from '../../tools/moreapps/!Letters/SelShape';
import {loadStyles, tm} from './word-docs.mjs';
import {mk, S} from './edit-docs.mjs';
import {modelTable, freeze} from './tbl-fixtures.mjs';

before(loadStyles);

const lay = (doc, w = 800) => {
  const L = new DocLayout(doc, tm());
  L.layout(w);
  return L;
};

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
const name = (L, pos) => {
  const it = L.byId.get(pos.id);
  return it.kind === 'p' ? `${it.block.text}:${pos.off}`
    : `tbl:${pos.off}`;
};
const grid3 = (f = (r, c) => `a${r}${c}`) => modelTable([0, 1, 2]
  .map((r) => [0, 1, 2].map((c) => f(r, c))));
const cont = (t) => ({blocks: [t], tcPr: {vMerge: 'continue',
  extra: []}});
const restart = (t) => ({blocks: [t], tcPr: {vMerge: 'restart',
  extra: []}});
/** 3x3 with (1,1) merged down over rows 1..2 ('m'). */
const merged = () => modelTable([['a00', 'a01', 'a02'],
  ['a10', restart('m'), 'a12'], ['a20', cont('c21'), 'a22']]);

/** Before, t, After; its layout; caret helpers. */
function setup(t, before = ['Before'], after = ['After']) {
  const d = mk([...before, freeze(t), ...after]);
  const L = lay(d.doc);
  const pos = (s, off = 0) => ({id: idOf(d.doc, s), off});
  const go = (sel, cmd, extend) => S.move(sel, L, cmd, extend);
  const tbl = L.byId.get(t.id);
  /** The middle x of cell (r, k)'s box. */
  const midX = (r, k) => {
    const c = tbl.rows[r].cells[k];
    return c.x + c.w / 2;
  };
  return {d, L, pos, go, tbl, midX};
}

describe('Up and Down in a table (D10)', () => {
  it('Down from cell (0,1) goes to cell (1,1) at goalX; Up back',
    () => {
      const {L, pos, go} = setup(grid3());
      let s = S.caret(pos('a01', 2));
      s = go(s, 'down');
      assert.equal(name(L, s.head), 'a11:2');
      s = go(s, 'down');
      assert.equal(name(L, s.head), 'a21:2');
      s = go(s, 'up');
      s = go(s, 'up');
      assert.equal(name(L, s.head), 'a01:2');
    });

  it('from a cell\'s first line to its next line first, then the ' +
    'cell below', () => {
    const t = modelTable([['a00', {blocks: ['x01', 'y01']}],
      ['a10', 'a11']]);
    const {L, pos, go} = setup(t);
    let s = S.caret(pos('x01', 1));
    s = go(s, 'down');
    assert.equal(name(L, s.head), 'y01:1');
    s = go(s, 'down');
    assert.equal(name(L, s.head), 'a11:1');
    s = go(s, 'up');
    assert.equal(name(L, s.head), 'y01:1');
  });

  it('Down from the last row goes to the paragraph after the table; ' +
    'Up from the first row to the one before', () => {
    const {L, pos, go} = setup(grid3());
    // (at goalX: the cell's text is inset by its margin)
    assert.match(name(L, go(S.caret(pos('a20', 1)), 'down').head),
      /^After:[12]$/);
    assert.match(name(L, go(S.caret(pos('a00', 1)), 'up').head),
      /^Before:[12]$/);
    // (goalX past the paragraph's text: its end)
    assert.equal(name(L, go(S.caret(pos('a22', 1)), 'down').head),
      'After:5');
  });

  it('into the table from the paragraphs beside it, at goalX', () => {
    const {L, pos, go, midX} = setup(grid3());
    const down = go(make(pos('Before', 0), pos('Before', 0), 'down',
      midX(0, 2)), 'down');
    assert.match(name(L, down.head), /^a02:/);
    const up = go(make(pos('After', 0), pos('After', 0), 'down',
      midX(2, 1)), 'up');
    assert.match(name(L, up.head), /^a21:/);
  });

  it('through a merged cell spanning goalX: its restart cell', () => {
    const {L, pos, go, midX} = setup(merged());
    let s = go(S.caret(pos('a01', 1)), 'down');
    assert.equal(name(L, s.head), 'm:1');
    s = go(s, 'down');
    assert.equal(name(L, s.head), 'After:5', 'past the merge');
    s = go(s, 'up');
    assert.equal(name(L, s.head), 'm:1', 'up into the restart cell');
    s = go(s, 'up');
    assert.equal(name(L, s.head), 'a01:1');
    // from beside the merge with goalX in it
    s = go(make(pos('a00', 0), pos('a00', 0), 'down', midX(1, 1)),
      'down');
    assert.match(name(L, s.head), /^m:/);
    s = go(S.caret(pos('a20', 1)), 'up');
    assert.equal(name(L, s.head), 'a10:1');
    s = go(S.caret(pos('a10', 1)), 'down');
    assert.equal(name(L, s.head), 'a20:1');
  });

  it('goalX in a merge that spans the caret\'s own row: past it', () => {
    const {L, pos, go, midX} = setup(merged());
    // in (1,0) with goalX over the merge (rows 1..2): down to the row
    // after the merge, i.e. out of the table
    const s = go(make(pos('a10', 0), pos('a10', 0), 'down',
      midX(1, 1)), 'down');
    assert.match(name(L, s.head), /^After:/);
  });

  it('a table last in the document: its end edge, then it stays', () => {
    const {L, pos, go} = setup(grid3(), ['Before'], []);
    let s = go(S.caret(pos('a21', 1)), 'down');
    assert.equal(name(L, s.head), 'tbl:1');
    s = go(s, 'down');
    assert.equal(name(L, s.head), 'tbl:1');
    s = go(s, 'up');
    assert.match(name(L, s.head), /^a2\d:/, 'up from the end edge: in');
  });

  it('a nested table: in at goalX, out to the next block of its cell',
    () => {
      const N = modelTable([['n1', 'n2']]);
      const t = modelTable([['a', ['b1', N, 'b2']], ['c', 'd']]);
      const {L, pos, go} = setup(t, ['p0'], ['p2']);
      const seen = [];
      let s = S.caret(pos('b1', 0));
      for (let k = 0; k < 5; k++) {
        s = go(s, 'down');
        seen.push(name(L, s.head).split(':')[0]);
      }
      assert.deepEqual(seen, ['n1', 'b2', 'd', 'p2', 'p2']);
      const back = [];
      for (let k = 0; k < 5; k++) {
        s = go(s, 'up');
        back.push(name(L, s.head).split(':')[0]);
      }
      assert.deepEqual(back, ['d', 'b2', 'n1', 'b1', 'p0']);
    });

  it('Up / Down never loop at a table (20 presses reach the ends)',
    () => {
      const {L, pos, go} = setup(merged());
      let s = S.caret(pos('Before', 0));
      for (let k = 0; k < 20; k++) s = go(s, 'down');
      assert.equal(name(L, s.head), 'After:5');
      for (let k = 0; k < 20; k++) s = go(s, 'up');
      assert.equal(name(L, s.head), 'Before:0');
    });

  it('SelTable.vertical is the step itself', () => {
    const {L, pos} = setup(grid3());
    const it = L.byId.get(idOf(L.doc, 'a01'));
    const p = pos('a01', 2), gx = L.caretRect(p).x;
    const r = T.vertical(L, it, p, 'down', gx, 1);
    assert.equal(name(L, r.pos), 'a11:2');
  });
});

describe('Home and End in a cell', () => {
  it('stay in the cell\'s line', () => {
    const {L, pos, go} = setup(grid3());
    assert.equal(name(L, go(S.caret(pos('a11', 1)), 'home').head),
      'a11:0');
    assert.equal(name(L, go(S.caret(pos('a11', 1)), 'end').head),
      'a11:3');
  });
});

describe('cellTabTarget (Tab / Shift-Tab, D10)', () => {
  const content = (L, sel) => [name(L, sel.anchor), name(L, sel.head)];

  it('Tab from (0,2): all of (1,0) selected; Shift-Tab back', () => {
    const {d, L, pos} = setup(grid3());
    const s = T.cellTabTarget(d.doc, S.caret(pos('a02', 1)), 1);
    assert.deepEqual(content(L, s), ['a10:0', 'a10:3']);
    assert.ok(Object.isFrozen(s));
    const b = T.cellTabTarget(d.doc, s, -1);
    assert.deepEqual(content(L, b), ['a02:0', 'a02:3']);
  });

  it('Shift-Tab from (0,0) and Tab from (2,2): \'last\' (nothing)',
    () => {
      const {d, pos} = setup(grid3());
      assert.equal(T.cellTabTarget(d.doc, S.caret(pos('a00', 0)), -1),
        'last');
      assert.equal(T.cellTabTarget(d.doc, S.caret(pos('a22', 3)), 1),
        'last');
    });

  it('outside a table: null', () => {
    const {d, pos} = setup(grid3());
    assert.equal(T.cellTabTarget(d.doc, S.caret(pos('Before', 0)), 1),
      null);
    assert.equal(T.cellTabTarget(d.doc, null, 1), null);
    assert.equal(T.cellTabTarget(d.doc, S.caret({id: 9e9, off: 0}), 1),
      null);
  });

  it('vMerge continue cells are skipped', () => {
    const {d, L, pos} = setup(merged());
    const s = T.cellTabTarget(d.doc, S.caret(pos('a20', 0)), 1);
    assert.deepEqual(content(L, s), ['a22:0', 'a22:3']);
    const b = T.cellTabTarget(d.doc, S.caret(pos('a22', 0)), -1);
    assert.deepEqual(content(L, b), ['a20:0', 'a20:3']);
  });

  it('a cell of several blocks: from its first to its last; nested ' +
    'tables Tab within themselves', () => {
    const N = modelTable([['n1', 'n2']]);
    const t = modelTable([['a', ['b1', N, 'b2']], ['c', 'd']]);
    const {d, L, pos} = setup(t, ['p0'], ['p2']);
    const s = T.cellTabTarget(d.doc, S.caret(pos('a', 0)), 1);
    assert.deepEqual(content(L, s), ['b1:0', 'b2:2']);
    const n = T.cellTabTarget(d.doc, S.caret(pos('n1', 0)), 1);
    assert.deepEqual(content(L, n), ['n2:0', 'n2:2']);
    assert.equal(T.cellTabTarget(d.doc, S.caret(pos('n2', 0)), 1),
      'last');
    // at the nested table's edge: the outer cell
    const e = T.cellTabTarget(d.doc, S.caret({id: N.id, off: 0}), 1);
    assert.deepEqual(content(L, e), ['c:0', 'c:1']);
  });

  it('from a selection across cells: from its head\'s cell', () => {
    const {d, L, pos} = setup(grid3());
    const s = T.cellTabTarget(d.doc, S.select(pos('a00', 0),
      pos('a11', 1)), 1);
    assert.deepEqual(content(L, s), ['a12:0', 'a12:3']);
  });

  it('inCell', () => {
    const {d, pos} = setup(grid3());
    assert.equal(T.inCell(d.doc, pos('a11', 0)), true);
    assert.equal(T.inCell(d.doc, pos('Before', 0)), false);
    assert.equal(T.inCell(d.doc, {id: 9e9, off: 0}), false);
    assert.equal(T.inCell(d.doc, null), false);
  });
});

describe('zoneAt: the mouse\'s cell, row and column zones', () => {
  it('the first 4 px inside a cell\'s left edge: 3.9 px a cell, ' +
    '4.1 px text', () => {
    const {L, tbl} = setup(grid3());
    const row = tbl.rows[1], c = row.cells[1], y = row.y + row.h / 2;
    const z = T.zoneAt(L, c.x + 3.9, y);
    assert.deepEqual([z.kind, z.table, z.r, z.k], ['cell', tbl, 1, 1]);
    assert.equal(T.zoneAt(L, c.x + 4.1, y), null);
    assert.equal(T.zoneAt(L, c.x, y).kind, 'cell');
  });

  it('within 0.25 in (24 px) left of a row: the row', () => {
    const {L, tbl} = setup(grid3());
    const x0 = tbl.x + tbl.left, row = tbl.rows[2];
    const y = row.y + row.h / 2;
    const z = T.zoneAt(L, x0 - 24, y);
    assert.deepEqual([z.kind, z.table, z.r], ['row', tbl, 2]);
    assert.equal(T.zoneAt(L, x0 - 0.1, y).kind, 'row');
    assert.equal(T.zoneAt(L, x0 - 24.1, y), null);
    assert.equal(T.zoneAt(L, x0 - 10, tbl.y + tbl.h + 1), null,
      'below the table');
  });

  it('within 4 px above the top border: the column under it', () => {
    const {L, tbl, midX} = setup(grid3());
    const x = midX(0, 1);
    const z = T.zoneAt(L, x, tbl.y - 3.9);
    assert.deepEqual([z.kind, z.table, z.c], ['column', tbl, 1]);
    assert.equal(T.zoneAt(L, x, tbl.y - 4).kind, 'column');
    assert.equal(T.zoneAt(L, x, tbl.y - 4.1), null);
    assert.equal(T.zoneAt(L, tbl.x + tbl.left + tbl.width + 1,
      tbl.y - 2), null, 'not over the table');
  });

  it('a table first in the document: its column zone too', () => {
    const {L, tbl, midX} = setup(grid3(), []);
    const z = T.zoneAt(L, midX(0, 2), tbl.y - 2);
    assert.deepEqual([z && z.kind, z && z.c], ['column', 2]);
  });

  it('a nested table\'s zones are its own', () => {
    const N = modelTable([['n1', 'n2']]);
    const t = modelTable([['a', ['b1', N, 'b2']], ['c', 'd']]);
    const {L} = setup(t, ['p0'], ['p2']);
    const n = L.byId.get(N.id), c = n.rows[0].cells[0];
    const z = T.zoneAt(L, c.x + 1, n.rows[0].y + 2);
    assert.deepEqual([z.kind, z.table, z.r, z.k], ['cell', n, 0, 0]);
  });

  it('no zone in text, outside tables, or without a table', () => {
    const {L, midX, tbl} = setup(grid3());
    assert.equal(T.zoneAt(L, midX(1, 1), tbl.rows[1].y + 3), null);
    const d = mk(['one', 'two']);
    const L2 = lay(d.doc);
    assert.equal(T.zoneAt(L2, L2.left - 5, L2.items[0].y + 3), null);
    for (const v of [NaN, Infinity, -1e9, 1e9]) {
      assert.equal(T.zoneAt(L, v, tbl.y + 3), null);
    }
  });

  it('zoneSel: a cell\'s content, a row, a column as cell shapes',
    () => {
      const {d, L, tbl} = setup(grid3());
      const cell = T.zoneSel(L, {kind: 'cell', table: tbl, r: 1, k: 2});
      assert.deepEqual([name(L, cell.anchor), name(L, cell.head)],
        ['a12:0', 'a12:3']);
      const row = shapeOf(d.doc, T.zoneSel(L, {kind: 'row', table: tbl,
        r: 1}));
      assert.deepEqual([row.kind, row.r0, row.r1, row.c0, row.c1],
        ['cells', 1, 1, 0, 2]);
      const col = shapeOf(d.doc, T.zoneSel(L, {kind: 'column',
        table: tbl, c: 1}));
      assert.deepEqual([col.kind, col.r0, col.r1, col.c0, col.c1],
        ['cells', 0, 2, 1, 1]);
    });

  it('zoneSel of a column through a merge grows to it', () => {
    const {d, L, tbl} = setup(merged());
    const col = shapeOf(d.doc, T.zoneSel(L, {kind: 'column',
      table: tbl, c: 1}));
    assert.deepEqual([col.kind, col.r0, col.r1, col.c0, col.c1],
      ['cells', 0, 2, 1, 1]);
  });
});

describe('EditKeys: Ctrl-Tab outside a cell (review C3a m3)', () => {
  /** A view stub: what keyFor reads, and what it ran. */
  const view = (d, sel) => {
    const v = {d, sel, ran: [], typed: [], mac: false,
      run(id) { v.ran.push(id); return true; },
      input(t) { v.typed.push(t); }};
    return v;
  };
  const ctrlTab = {code: 0x1AA, key: 'Tab', ctrl: true, shift: false,
    alt: false};
  it('goes on (undefined) without running a command: the pending ' +
    'format is not dropped', async () => {
    const {keyFor} = await import('../../tools/moreapps/!Letters/EditKeys');
    const {d, pos} = setup(grid3());
    const v = view(d, S.caret(pos('Before', 2)));
    assert.equal(keyFor(v, ctrlTab), undefined);
    assert.deepEqual(v.ran, []);
    assert.deepEqual(v.typed, []);
    const w = view(d, S.caret(pos('a11', 1)));
    assert.equal(keyFor(w, ctrlTab), true);
    assert.deepEqual(w.typed, ['\t']);
  });
});
