// TblCmd's row commands (Batch C4.1, D23, D25, R16, R18, R21): insert
// rows above / below the shape's rows, delete them (every row: the
// table removed, the caret in the block after, a paragraph made when
// there is none), Tab in the last cell (a row below the last one, the
// caret in its first cell), split table (an empty paragraph between,
// the caret in it; at row 0 a paragraph before the table). Each is ONE
// undo step that undoes deep-equal and gives back the very old table
// object (===), with R18's caret (EditApply.stepEnd); a refused command
// makes no step. The keys: Ctrl+Shift+Enter is splitTable (menu
// 'Table'); Tab in the last cell runs tabRow, Shift-Tab at the first
// cell nothing. Ids stay unique over 100 random row commands; insert
// row in a 1000 x 5 table and its undo < 50 ms each (D20).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {insertRowsCmd, deleteRowsCmd, tabRowCmd, splitTableCmd}
  from '../../tools/moreapps/!Word/TblCmd';
import {run, stepEnd} from '../../tools/moreapps/!Word/EditApply';
import {keymap} from '../../tools/moreapps/!Word/Keymap';
import {keyFor} from '../../tools/moreapps/!Word/EditKeys';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {at as walkAt, ids as allIds, forEachBlock}
  from '../../tools/moreapps/!Word/Walk';
import {checkBlock} from '../../tools/moreapps/!Word/Model';
import {MAX_ROWS} from '../../tools/moreapps/!Word/TblCheck';
import {findBlock} from '../../tools/moreapps/!Word/EditPos';
import {lastPos} from '../../tools/moreapps/!Word/TblPos';
import {mk, undoable, S} from './edit-docs.mjs';
import {tm, rng} from './word-docs.mjs';
import {modelTable, freeze} from './tbl-fixtures.mjs';

/** The paragraph whose text is t (any depth). */
function byText(doc, t) {
  let out = null;
  forEachBlock(doc, (b) => {
    if (b.type === 'p' && b.text === t) {
      out = b;
      return false;
    }
    return true;
  });
  return out;
}
const pos = (d, t, off = 0) => ({id: byText(d.doc, t).id, off});
const car = (d, t, off) => S.caret(pos(d, t, off));
const sel = (d, a, ao, h, ho) => S.select(pos(d, a, ao), pos(d, h, ho));
function show(list) {
  return list.map((b) => (b.type === 'p' ? b.text : b.type !== 'tbl'
    ? '#' : b.rows.map((r) => r.cells.map((c) => show(c.blocks)))));
}
const body = (d) => show(d.doc.sections[0].blocks);
/** 'text:off' of a position, or 'tbl:off'. */
function name(d, p) {
  let out = null;
  forEachBlock(d.doc, (b) => {
    if (b.id === p.id) out = b.type === 'p' ? `${b.text}:${p.off}`
      : `tbl:${p.off}`;
    return out === null;
  });
  return out;
}
const T3 = () => modelTable([0, 1, 2].map((i) => [0, 1, 2]
  .map((j) => `r${i}c${j}`)));
/** before..., a deep-frozen table, after...: {d, T}. */
function doc(T = T3(), before = ['p0'], after = ['p2']) {
  return {d: mk([...before, freeze(T), ...after]), T};
}

/**
 * Run cmd as one step (undoable), then undo it with a layout of the
 * state after it: {out, back (the table at `at` after the undo), caret
 * (stepEnd after the undo), again (stepEnd after the redo)}.
 */
function steps(d, at, cmd) {
  const m = tm();
  let ops = null;
  d.on('change', (ev) => { ops = ev.ops; });
  const out = undoable(d, cmd);
  let L = new DocLayout(d.doc, m);
  L.layout(800);
  d.undo();
  const back = walkAt(d.doc, at);
  const caret = stepEnd(d.doc, ops, L);
  const was = caret && name(d, caret);
  L = new DocLayout(d.doc, m, L);
  L.layout(800);
  d.redo();
  const again = stepEnd(d.doc, ops, L);
  return {out, back, caret: was, again: again && name(d, again)};
}

describe('insert rows', () => {
  it('below the caret\'s row: one step; undo gives the very old ' +
    'table and the caret in the row after (R18)', () => {
    const {d, T} = doc();
    const s = steps(d, [0, 1], () => insertRowsCmd(d, car(d, 'r1c1', 2),
      true));
    assert.equal(s.back, T);
    assert.equal(s.caret, 'r2c0:0');
    assert.equal(s.again, ':0', 'redo: the new row');
    assert.deepEqual(body(d)[1].map((r) => r.map((c) => c[0])),
      [['r0c0', 'r0c1', 'r0c2'], ['r1c0', 'r1c1', 'r1c2'], ['', '', ''],
        ['r2c0', 'r2c1', 'r2c2']]);
    assert.equal(name(d, s.out.head), 'r1c1:2', 'the caret stays');
  });
  it('above a cells shape over two rows: two rows above', () => {
    const {d} = doc();
    undoable(d, () => insertRowsCmd(d, sel(d, 'r1c0', 0, 'r2c1', 1),
      false));
    assert.deepEqual(body(d)[1].map((r) => r[0][0]),
      ['r0c0', '', '', 'r1c0', 'r2c0']);
  });
  it('in a nested table: its rows', () => {
    const N = modelTable([['n0'], ['n1']]);
    const {d} = doc(modelTable([[['a', N, 'z']]]));
    undoable(d, () => insertRowsCmd(d, car(d, 'n0', 1), true));
    assert.deepEqual(body(d)[1][0][0][1].map((r) => r[0][0]),
      ['n0', '', 'n1']);
  });
});

describe('delete rows', () => {
  it('the caret\'s row: the caret in the row after; undo: the very ' +
    'old table, the caret in that row (R18)', () => {
    const {d, T} = doc();
    const s = steps(d, [0, 1], () => deleteRowsCmd(d, car(d, 'r1c1', 1)));
    assert.equal(name(d, s.out.head), 'r2c0:0');
    assert.equal(s.back, T);
    assert.equal(s.caret, 'r1c0:0');
  });
  it('the last row: the caret in the row before', () => {
    const {d} = doc();
    const out = undoable(d, () => deleteRowsCmd(d, car(d, 'r2c2', 1)));
    assert.equal(name(d, out.head), 'r1c0:0');
  });
  it('every row: the table removed, the caret in the block after; ' +
    'undo: the very old table, the caret in its first cell', () => {
    const {d, T} = doc();
    const s = steps(d, [0, 1], () => deleteRowsCmd(d,
      sel(d, 'r0c0', 0, 'r2c2', 1)));
    assert.equal(name(d, s.out.head), 'p2:0');
    assert.equal(s.back, T);
    assert.equal(s.caret, 'r0c0:0');
  });
  it('every row, nothing after: an empty paragraph made, the caret ' +
    'in it', () => {
    const {d, T} = doc(T3(), ['p0'], []);
    const s = steps(d, [0, 1], () => deleteRowsCmd(d,
      sel(d, 'r0c0', 0, 'r2c2', 1)));
    assert.equal(name(d, s.out.head), ':0');
    assert.equal(s.back, T);
    assert.equal(s.caret, 'r0c0:0');
  });
  it('every row of a nested table: it goes, the cell keeps its ' +
    'paragraph', () => {
    const N = modelTable([['n0']]);
    const {d} = doc(modelTable([[['a', N, 'z']]]));
    const out = undoable(d, () => deleteRowsCmd(d, car(d, 'n0', 0)));
    assert.deepEqual(body(d)[1], [[['a', 'z']]]);
    assert.equal(name(d, out.head), 'z:0');
  });
  it('a bookmark start in the row, its end after the table: kept ' +
    '(moved to the next row\'s lead)', () => {
    const O = '￼';
    const mark = (n) => ({kind: 'raw', level: 'p', text: '', node: {
      name: 'w:' + n, attrs: [['w:id', '3'], ['w:name', 'b']],
      children: []}});
    const T = modelTable([['r0'], ['r1'], ['r2']]);
    const p1 = {...T.rows[1].cells[0].blocks[0], text: O + 'r1',
      inlines: {0: mark('bookmarkStart')}, runs: [{start: 0, end: 3,
        rPr: {extra: []}}]};
    const T1 = {...T, rows: T.rows.map((r, i) => (i === 1 ? {...r,
      cells: [{...r.cells[0], blocks: [p1]}]} : r))};
    const d = mk(['p0', freeze(T1), ['p2', {}]]);
    const last = d.doc.sections[0].blocks[2];
    d.atomic(() => d.apply({op: 'restoreBlock', block: [0, 2], snapshot:
      {...last, text: 'p2' + O, inlines: {2: mark('bookmarkEnd')},
        runs: [{start: 0, end: 3, rPr: {extra: []}}]}}));
    d.clearHistory();
    undoable(d, () => deleteRowsCmd(d, {anchor: {id: p1.id, off: 1},
      head: {id: p1.id, off: 1}}));
    const t = walkAt(d.doc, [0, 1]);
    assert.equal(t.rows.length, 2);
    assert.deepEqual(t.rows[1].lead.map((n) => n.name),
      ['w:bookmarkStart']);
  });
});

describe('Tab in the last cell', () => {
  it('a row below, the caret in its first cell; one step; undo: the ' +
    'very old table, the caret back in the last cell', () => {
    const {d, T} = doc();
    const s = steps(d, [0, 1], () => tabRowCmd(d, car(d, 'r2c2', 2)));
    assert.equal(walkAt(d.doc, [0, 1]).rows.length, 4);
    assert.equal(name(d, s.out.head), ':0');
    assert.equal(s.out.head.id,
      walkAt(d.doc, [0, 1]).rows[3].cells[0].blocks[0].id);
    assert.equal(s.back, T);
    assert.equal(s.caret, 'r2c2:4');
    assert.equal(s.again, ':0');
  });
  it('through the keys: Tab in the last cell runs tabRow; Shift-Tab ' +
    'at the first cell nothing; Tab elsewhere the next cell', () => {
    const {d} = doc();
    const view = (s) => {
      const v = {d, sel: s, ran: [], set: [], mac: false,
        run(id) { v.ran.push(id); return true; },
        setSelection(x) { v.set.push(x); },
        input() { throw new Error('typed'); }};
      return v;
    };
    const TAB = {code: 0x18A, key: 'Tab', shift: false, ctrl: false};
    const STAB = {code: 0x19A, key: 'Tab', shift: true, ctrl: false};
    const v1 = view(car(d, 'r2c2', 1));
    assert.equal(keyFor(v1, TAB), true);
    assert.deepEqual(v1.ran, ['tabRow']);
    const v2 = view(car(d, 'r0c0', 1));
    assert.equal(keyFor(v2, STAB), true);
    assert.deepEqual([v2.ran, v2.set], [[], []]);
    const v3 = view(car(d, 'r0c0', 1));
    assert.equal(keyFor(v3, TAB), true);
    assert.deepEqual([v3.ran, v3.set.length], [[], 1]);
    assert.equal(d.undoDepth, 0);
  });
  it('EditApply runs tabRow and splitTable as one step each; outside ' +
    'a table: null (a beep), no step', () => {
    const {d} = doc();
    const t = new Typing(d);
    const a = run('tabRow', d, t, car(d, 'r2c2', 0));
    assert.equal(d.undoDepth, 1);
    assert.equal(name(d, a.head), ':0');
    run('splitTable', d, t, car(d, 'r1c0', 0));
    assert.equal(d.undoDepth, 2);
    assert.equal(run('splitTable', d, t, car(d, 'p0', 0)), null);
    assert.equal(run('tabRow', d, t, car(d, 'p2', 0)), null);
    assert.equal(run('rowsBelow', d, t, car(d, 'p2', 0)), null);
    assert.equal(d.undoDepth, 2);
  });
});

describe('split table', () => {
  it('at the caret\'s row: an empty paragraph between, the caret in ' +
    'it; undo: the very old table, the caret in that row', () => {
    const {d, T} = doc();
    const s = steps(d, [0, 1], () => splitTableCmd(d, car(d, 'r1c2', 1)));
    assert.equal(name(d, s.out.head), ':0');
    const bs = d.doc.sections[0].blocks;
    assert.deepEqual(bs.map((b) => b.type), ['p', 'tbl', 'p', 'tbl', 'p']);
    assert.equal(bs[1].id, T.id);
    assert.notEqual(bs[3].id, T.id);
    assert.deepEqual(body(d)[3].map((r) => r[0][0]), ['r1c0', 'r2c0']);
    assert.equal(bs[2].text, '');
    assert.equal(s.out.head.id, bs[2].id);
    assert.equal(s.back, T);
    assert.equal(s.caret, 'r1c0:0');
    assert.equal(s.again, ':0');
  });
  it('at row 0: an empty paragraph before the table', () => {
    const {d} = doc();
    const out = undoable(d, () => splitTableCmd(d, car(d, 'r0c1', 1)));
    assert.deepEqual(d.doc.sections[0].blocks.map((b) => b.type),
      ['p', 'p', 'tbl', 'p']);
    assert.equal(name(d, out.head), ':0');
  });
  it('Ctrl+Shift+Enter is splitTable, in the Table menu (R21)', () => {
    const ev = {code: 13, key: 'Enter', shift: true, ctrl: true};
    assert.equal(keymap.lookup(ev), 'splitTable');
    assert.equal(keymap.lookup({code: 13, shift: true, ctrl: true}),
      'splitTable');
    assert.equal(keymap.labelFor('splitTable'), 'Ctrl+Shift+Enter');
    assert.equal(keymap.row('splitTable').menu, 'Table');
    assert.equal(keymap.lookup({...ev, shift: false}), 'pageBreak');
  });
});

describe('refused commands make no step', () => {
  it('not in a table, a mixed selection, past MAX_ROWS', () => {
    const {d} = doc();
    const c = car(d, 'p0', 1), m = sel(d, 'p0', 1, 'r1c1', 1);
    for (const fn of [(s) => insertRowsCmd(d, s, true),
      (s) => deleteRowsCmd(d, s), (s) => tabRowCmd(d, s),
      (s) => splitTableCmd(d, s)]) {
      assert.equal(fn(c), null);
      assert.equal(fn(m), null);
      assert.equal(fn(null), null);
    }
    assert.equal(d.undoDepth, 0);
    const R = modelTable([['x']]);
    const big = freeze({...R, rows: Array(MAX_ROWS).fill(R.rows[0])});
    const e = mk(['p0', big, 'p2']);
    const id = R.rows[0].cells[0].blocks[0].id;
    assert.equal(tabRowCmd(e, S.caret({id, off: 0})), null);
    assert.equal(insertRowsCmd(e, S.caret({id, off: 0}), true), null);
    assert.equal(e.undoDepth, 0);
  });
});

describe('ids (tblids)', () => {
  it('100 random row inserts, deletes and splits: no id twice, every ' +
    'block valid, each one step', () => {
    const N = modelTable([['n0', 'n1'], ['n2', 'n3']]);
    const d = mk(['p0', freeze(modelTable([['a', 'b'], [['c', N, 'e'],
      'f'], ['g', 'h']])), 'p1', freeze(T3()), 'p2']);
    const rand = rng(41);
    let done = 0;
    for (let k = 0; k < 100; k++) {
      const paras = [];
      forEachBlock(d.doc, (b, at) => {
        if (b.type === 'p' && at.length > 2) paras.push(b);
      });
      if (!paras.length) break;
      const p = paras[Math.floor(rand() * paras.length)];
      const s = S.caret({id: p.id, off: 0});
      // (Tab: from the end of that table's last cell)
      const t = walkAt(d.doc, findBlock(d.doc, p.id).cell.table);
      const cmd = [() => insertRowsCmd(d, s, rand() < 0.5),
        () => deleteRowsCmd(d, s),
        () => tabRowCmd(d, S.caret(lastPos(t))),
        () => splitTableCmd(d, s)][Math.floor(rand() * 4)];
      const n = d.undoDepth;
      if (cmd()) done++;
      assert.ok(d.undoDepth <= n + 1, 'at most one step');
      const all = allIds(d.doc);
      assert.equal(new Set(all).size, all.length, 'ids unique');
      for (const b of d.doc.sections[0].blocks) checkBlock(b);
    }
    assert.ok(done > 80, 'commands applied: ' + done);
  });
});

describe('D20: insert row in a 1000 x 5 table', () => {
  it('the command and its undo < 50 ms each (median of 20)', () => {
    const T = modelTable(Array.from({length: 1000}, (_, i) =>
      Array.from({length: 5}, (__, j) => `c${i}.${j}`)));
    const d = mk(['p0', freeze(T), 'p2']);
    const s = car(d, 'c500.2', 1);
    const med = (xs) => xs.sort((a, b) => a - b)[xs.length >> 1];
    const a = [], u = [];
    for (let k = 0; k < 23; k++) {
      const t0 = performance.now();
      insertRowsCmd(d, s, true);
      const t1 = performance.now();
      d.undo();
      const t2 = performance.now();
      if (k >= 3) {
        a.push(t1 - t0);
        u.push(t2 - t1);
      }
    }
    assert.equal(walkAt(d.doc, [0, 1]), T);
    const [ma, mu] = [med(a), med(u)];
    console.log(`insert row ${ma.toFixed(2)} ms, undo ${mu.toFixed(2)} ms`);
    assert.ok(ma < 50 && mu < 50, `${ma} ${mu}`);
  });
});
