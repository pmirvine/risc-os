// Ops on nested paths (Batch C1.4, D4 / D5): every op at a path in a
// cell of a typed table, copy-on-write along the path (deep-frozen
// fixtures), locate's refusals, mergeBlock inside one cell, section
// ops refusing paths, ids at every depth, a 1000-row restoreBlock,
// and EditApply.stepEnd after a split in a cell.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {newPara, emptyDoc, deepEqual, checkBlock, nextId}
  from '../../tools/moreapps/!Word/Model';
import {apply, applyOwn} from '../../tools/moreapps/!Word/Ops';
import {locate, own, paraAt}
  from '../../tools/moreapps/!Word/OpsPath';
import * as U from '../../tools/moreapps/!Word/OpsUtil';
import {at as walkAt, forEachBlock}
  from '../../tools/moreapps/!Word/Walk';
import {stepEnd} from '../../tools/moreapps/!Word/EditApply';
import {modelTable, freeze} from './tbl-fixtures.mjs';

const P = (t) => newPara(t);

/** p0, T (3x3; cell (1,1) holds e1, e2, N (2x2), e3), p2. */
function fixture() {
  const N = modelTable([['n1', 'n2'], ['n3', 'n4']]);
  const T = modelTable([['a', 'b', 'c'],
    ['d', ['e1', 'e2', N, 'e3'], 'f'], ['g', 'h', 'i']]);
  const d = emptyDoc();
  d.sections[0].blocks = [P('p0'), freeze(T), P('p2')];
  freeze(d.sections[0].blocks[0]);
  freeze(d.sections[0].blocks[2]);
  return d;
}

const E1 = [0, 1, 1, 1, 0], E2 = [0, 1, 1, 1, 1], NP = [0, 1, 1, 1, 2];
const E3 = [0, 1, 1, 1, 3], N1 = [0, 1, 1, 1, 2, 0, 0, 0];
const T0 = (d) => d.sections[0].blocks[1];

/** Every table, row and cell object of t (at every depth). */
function parts(t) {
  const out = [];
  forEachBlock({sections: [{blocks: [t]}]}, (b) => {
    if (b.type !== 'tbl') return;
    out.push(b);
    for (const row of b.rows) {
      out.push(row);
      for (const cell of row.cells) out.push(cell);
    }
  });
  return out;
}

function valid(d) {
  for (const s of d.sections) for (const b of s.blocks) checkBlock(b);
  const seen = new Set();
  forEachBlock(d, (b) => {
    if (b.type !== 'p' && b.type !== 'tbl') return;
    assert.ok(!seen.has(b.id), 'duplicate id ' + b.id);
    seen.add(b.id);
  });
}

/**
 * Apply op to a deep-frozen fixture: no TypeError, every old table /
 * row / cell unchanged, rows off the path (`row` of the top table)
 * shared; the inverse restores deep-equal; its inverse redoes.
 */
function roundOp(mkOp, {row = 1, check} = {}) {
  const d = fixture();
  const op = typeof mkOp === 'function' ? mkOp(d) : mkOp;
  const before = structuredClone(d);
  const old = T0(d);
  const olds = parts(old).map((x) => [x, structuredClone(x)]);
  const inv = apply(d, op);
  valid(d);
  assert.ok(!deepEqual(d, before), op.op + ' changed nothing');
  for (const [x, c] of olds) assert.ok(deepEqual(x, c), 'old changed');
  const now = T0(d);
  if (now !== old && row !== null) {
    old.rows.forEach((r, k) => {
      if (k !== row) assert.equal(now.rows[k], r, 'row ' + k + ' shared');
    });
  }
  if (check) check(d);
  const after = structuredClone(d);
  const redo = apply(d, inv);
  assert.ok(deepEqual(d, before), op.op + ': inverse restores');
  apply(d, redo);
  assert.ok(deepEqual(d, after), op.op + ': redo');
  return {d, inv};
}

describe('ops at nested paths', () => {
  it('replaceText and spliceText in a cell and a nested cell', () => {
    roundOp({op: 'replaceText', block: E1, at: 1, del: 0, ins: 'XY'},
      {check: (d) => assert.equal(walkAt(d, E1).text, 'eXY1')});
    roundOp({op: 'replaceText', block: N1, at: 0, del: 2, ins: 'z'},
      {check: (d) => assert.equal(walkAt(d, N1).text, 'z')});
    roundOp({op: 'spliceText', block: E2, at: 2, del: 0,
      content: {text: '!', runs: [{start: 0, end: 1,
        rPr: {b: true, extra: []}}], inlines: {}}});
  });
  it('setProps: pPr, and rPr on a range', () => {
    roundOp({op: 'setProps', block: E1, pPr: {jc: 'center'}});
    roundOp({op: 'setProps', block: N1, range: {start: 0, end: 1},
      rPr: {i: true}}, {check: (d) =>
      assert.equal(walkAt(d, N1).runs.length, 2)});
  });
  it('splitBlock: the new paragraph in the same cell', () => {
    roundOp({op: 'splitBlock', block: E1, at: 1}, {check: (d) => {
      assert.equal(walkAt(d, E1).text, 'e');
      assert.equal(walkAt(d, E2).text, '1');
      assert.equal(walkAt(d, E3).type, 'tbl');
    }});
    roundOp({op: 'splitBlock', block: N1, at: 2});
  });
  it('mergeBlock: two paragraphs of one cell', () => {
    roundOp({op: 'mergeBlock', block: E1}, {check: (d) => {
      assert.equal(walkAt(d, E1).text, 'e1e2');
      assert.equal(walkAt(d, E2).type, 'tbl');
    }});
  });
  it('insertBlock / removeBlock: a paragraph and a table', () => {
    roundOp({op: 'insertBlock', at: E2, block: P('new')},
      {check: (d) => assert.equal(walkAt(d, E2).text, 'new')});
    roundOp({op: 'insertBlock', at: [0, 1, 0, 0, 0],
      block: modelTable([['q']])}, {row: 0});
    roundOp({op: 'removeBlock', at: E2});
    roundOp({op: 'removeBlock', at: NP}, {check: (d) =>
      assert.equal(walkAt(d, NP).text, 'e3')});
    roundOp({op: 'insertBlock', at: [0, 1, 1, 1, 4], block: P('end')});
  });
  it('insertBlocks / removeBlocks', () => {
    roundOp({op: 'insertBlocks', at: E1, blocks: [P('x'),
      modelTable([['y']]), P('z')]});
    roundOp({op: 'removeBlocks', at: E2, count: 2});
    roundOp({op: 'insertBlocks', at: [0, 1, 1, 1, 2, 1, 1, 1],
      blocks: [P('deep')]});
  });
  it('restoreBlock: a paragraph; the table with one row changed', () => {
    roundOp((d) => ({op: 'restoreBlock', block: [0, 1, 1, 0, 0],
      snapshot: {...walkAt(d, [0, 1, 1, 0, 0]), text: 'D',
        runs: [{start: 0, end: 1, rPr: {extra: []}}]}}), {row: 1});
    const {inv} = roundOp((d) => {
      const t = T0(d);
      const rows = t.rows.slice();
      rows[2] = {...rows[2], trPr: {cantSplit: true, extra: []}};
      return {op: 'restoreBlock', block: [0, 1], snapshot: {...t, rows}};
    }, {row: 2});
    assert.equal(inv.op, 'restoreBlock');
  });
  it('the inverse of a table restore is the very old object', () => {
    const d = fixture();
    const t = T0(d);
    const rows = t.rows.slice();
    rows[0] = {...rows[0], attrs: [['w:rsidR', '00AB']]};
    const nt = {...t, rows};
    const inv = applyOwn(d, {op: 'restoreBlock', block: [0, 1],
      snapshot: nt});
    assert.equal(T0(d), nt);
    assert.equal(inv.snapshot, t);
    applyOwn(d, inv);
    assert.equal(T0(d), t);
  });
  it('a table restore through apply keeps the new table shared', () => {
    const d = fixture();
    const t = T0(d);
    const rows = t.rows.slice();
    rows[0] = {...rows[0], attrs: [['w:rsidR', '00AB']]};
    const nt = {...t, rows};
    apply(d, {op: 'restoreBlock', block: [0, 1], snapshot: nt});
    assert.equal(T0(d).rows[1], t.rows[1], 'unchanged rows shared');
  });
  it('compound at nested paths rolls back all or nothing', () => {
    const d = fixture();
    const before = structuredClone(d);
    assert.throws(() => apply(d, {op: 'compound', ops: [
      {op: 'replaceText', block: E1, at: 0, del: 0, ins: 'k'},
      {op: 'mergeBlock', block: E3}]}), RangeError);
    assert.ok(deepEqual(d, before));
  });
});

describe('locate, own, paraAt', () => {
  it('locate gives the container and the path', () => {
    const d = fixture();
    const x = locate(d, N1);
    assert.equal(x.s, 0);
    assert.equal(x.i, 0);
    assert.deepEqual(x.at, N1);
    assert.equal(x.depth, 2);
    assert.equal(x.nested, true);
    assert.equal(x.blocks, walkAt(d, NP).rows[0].cells[0].blocks);
    const top = locate(d, [0, 2]);
    assert.equal(top.blocks, d.sections[0].blocks);
    assert.equal(top.depth, 0);
    assert.equal(top.nested, false);
    assert.equal(locate(d, [0, 1, 1, 1, 4], true).i, 4);
    assert.throws(() => locate(d, [0, 1, 1, 1, 4]), RangeError);
    assert.equal(U.locate, locate, 'OpsUtil re-exports locate');
    assert.equal(paraAt(d, E2).p.text, 'e2');
  });
  it('own copies along the path only', () => {
    const d = fixture();
    const t = T0(d);
    const bl = own(d, N1);
    const nt = T0(d);
    assert.notEqual(nt, t);
    assert.notEqual(nt.rows, t.rows);
    assert.equal(nt.rows[0], t.rows[0]);
    assert.equal(nt.rows[2], t.rows[2]);
    assert.equal(nt.rows[1].cells[0], t.rows[1].cells[0]);
    const nn = nt.rows[1].cells[1].blocks[2];
    assert.notEqual(nn, t.rows[1].cells[1].blocks[2]);
    assert.equal(nn.rows[1], t.rows[1].cells[1].blocks[2].rows[1]);
    assert.equal(bl, nn.rows[0].cells[0].blocks);
    assert.ok(!Object.isFrozen(bl));
    assert.equal(own(d, [0, 2]), d.sections[0].blocks);
  });
});

describe('locate refuses', () => {
  const BAD = [
    [[0, 1, 0], 'bad position'], [[0, 1, 0, 0], 'bad position'],
    [[0, 1, 9, 0, 0], 'no row 9'], [[0, 1, 0, 9, 0], 'no cell 9'],
    [[0, 1, 0, 0, 9], 'no block 9'], [[0, 0, 0, 0, 0], 'not a table'],
    [[0, 1, undefined], 'bad position'], [[0, undefined], 'bad position'],
    [Array(29).fill(0), 'bad position'], [[1, 0], 'no section 1'],
    [[0, 4], 'no block 4'], [[0, 1, -1, 0, 0], 'bad position'],
    [[0, 1, 0.5, 0, 0], 'bad position'], ['0,1', 'bad position'],
    [[0, 1, 1, 1, 1, 0, 0, 0], 'not a table'],
    [[0, 1, 1, 1, 2, 2, 0, 0], 'no row 2'],
  ];
  it('each bad path: RangeError naming the rule', () => {
    const d = fixture();
    for (const [p, msg] of BAD) {
      assert.throws(() => locate(d, p), (e) => e instanceof RangeError &&
        e.message.includes(msg), JSON.stringify(p) + ' ' + msg);
    }
  });
  it('every op at a bad path changes nothing (no own)', () => {
    const ops = (p) => [
      {op: 'replaceText', block: p, at: 0, del: 0, ins: 'x'},
      {op: 'spliceText', block: p, at: 0, del: 0,
        content: {text: '', runs: [], inlines: {}}},
      {op: 'setProps', block: p, pPr: {jc: 'right'}},
      {op: 'splitBlock', block: p, at: 0}, {op: 'mergeBlock', block: p},
      {op: 'insertBlock', at: p, block: P('x')},
      {op: 'removeBlock', at: p}, {op: 'removeBlocks', at: p, count: 1},
      {op: 'insertBlocks', at: p, blocks: [P('x')]},
      {op: 'restoreBlock', block: p, snapshot: P('x')}];
    for (const [p] of BAD) {
      for (const op of ops(p)) {
        const d = fixture();
        const t = T0(d), before = structuredClone(d);
        assert.throws(() => apply(d, op), RangeError,
          op.op + ' ' + JSON.stringify(p));
        assert.ok(deepEqual(d, before));
        assert.equal(T0(d), t, op.op + ': table not copied');
      }
    }
  });
  it('refusals after locate do not copy the table either', () => {
    const cases = [
      {op: 'replaceText', block: E1, at: 9, del: 0, ins: 'x'},
      {op: 'setProps', block: E1, range: {start: 0, end: 9}, rPr: {}},
      {op: 'splitBlock', block: NP, at: 0},
      {op: 'insertBlock', at: E1, block: {type: 'p'}},
      {op: 'removeBlock', at: [0, 1, 0, 0, 0]},
      {op: 'removeBlocks', at: E1, count: 4},
      {op: 'removeBlocks', at: E1, count: 9},
      {op: 'insertBlocks', at: E1, blocks: []}];
    for (const op of cases) {
      const d = fixture();
      const t = T0(d), before = structuredClone(d);
      assert.throws(() => apply(d, op), RangeError, op.op);
      assert.ok(deepEqual(d, before));
      assert.equal(T0(d), t);
    }
  });
});

describe('cells keep their rules', () => {
  it('mergeBlock stays in its cell', () => {
    const d = fixture();
    const t = T0(d), before = structuredClone(d);
    for (const b of [E3, [0, 1, 0, 0, 0], N1]) {
      assert.throws(() => apply(d, {op: 'mergeBlock', block: b}),
        RangeError);
    }
    assert.throws(() => apply(d, {op: 'mergeBlock', block: E2}),
      RangeError, 'the next block is a table');
    assert.ok(deepEqual(d, before));
    assert.equal(T0(d), t);
  });
  it('a cell keeps at least one block', () => {
    const d = fixture();
    assert.throws(() => apply(d, {op: 'removeBlock',
      at: [0, 1, 0, 0, 0]}), /at least one block/);
    assert.throws(() => apply(d, {op: 'removeBlocks', at: E1,
      count: 4}), /at least one block/);
  });
  it('no sectPr in a cell paragraph', () => {
    const sect = {name: 'w:sectPr', attrs: [], children: []};
    const q = newPara('s', {pPr: {extra: [sect]}});
    const d = fixture();
    const before = structuredClone(d);
    assert.throws(() => apply(d, {op: 'insertBlock', at: E1, block: q}),
      /sectPr/);
    assert.throws(() => apply(d, {op: 'setProps', block: E1,
      pPr: {extra: [sect]}}), /sectPr/);
    assert.throws(() => apply(d, {op: 'restoreBlock', block: E1,
      snapshot: {...walkAt(d, E1), pPr: {extra: [sect]}}}), /sectPr/);
    assert.ok(deepEqual(d, before));
    apply(d, {op: 'insertBlock', at: [0, 3], block: q});
  });
  it('section ops refuse paths', () => {
    const d = fixture();
    const before = structuredClone(d);
    assert.throws(() => apply(d, {op: 'splitSection', at: N1.slice(0, 5),
      props: {extra: []}}), RangeError);
    assert.throws(() => apply(d, {op: 'splitSection', at: E1,
      props: {extra: []}}), RangeError);
    assert.ok(deepEqual(d, before));
  });
});

describe('ids at every depth', () => {
  it('insertBlock of a table holding an id used elsewhere', () => {
    const d = fixture();
    const used = walkAt(d, N1).id;
    const t = modelTable([['x']]);
    const bad = {...t, rows: [{...t.rows[0], cells: [{...t.rows[0]
      .cells[0], blocks: [{...t.rows[0].cells[0].blocks[0], id: used}]}]}]};
    assert.throws(() => apply(d, {op: 'insertBlock', at: [0, 0],
      block: bad}), /already in use/);
    assert.throws(() => apply(d, {op: 'insertBlock', at: E1,
      block: {...t, id: T0(d).id}}), /already in use/);
    assert.throws(() => apply(d, {op: 'insertBlocks', at: E1,
      blocks: [t, P('x'), {...t}]}), /already in use/);
    assert.throws(() => apply(d, {op: 'insertBlock', at: E1,
      block: {...walkAt(d, E2)}}), /already in use/);
    apply(d, {op: 'insertBlock', at: E1, block: t});
    valid(d);
  });
  it('restoreBlock of the table with a new row', () => {
    const d = fixture();
    const t = T0(d);
    const row = (id) => ({...t.rows[0], attrs: [], cells: t.rows[0].cells
      .map((c, k) => ({...c, blocks: [{...c.blocks[0],
        id: k === 1 && id !== undefined ? id : nextId()}]}))});
    const used = walkAt(d, [0, 0]).id;
    const before = structuredClone(d);
    assert.throws(() => apply(d, {op: 'restoreBlock', block: [0, 1],
      snapshot: {...t, rows: [...t.rows, row(used)]}}), /already in use/);
    assert.throws(() => apply(d, {op: 'restoreBlock', block: [0, 1],
      snapshot: {...t, rows: [...t.rows, row(walkAt(d, E1).id)]}}),
    /duplicate id/);
    assert.ok(deepEqual(d, before));
    assert.equal(T0(d), t);
    apply(d, {op: 'restoreBlock', block: [0, 1],
      snapshot: {...t, rows: [...t.rows, row()]}});
    valid(d);
    assert.equal(T0(d).rows.length, 4);
  });
  it('a table with another id replacing the old one', () => {
    const d = fixture();
    const t = T0(d);
    apply(d, {op: 'restoreBlock', block: [0, 1], snapshot: {...t,
      id: nextId()}});
    valid(d);
    assert.throws(() => apply(d, {op: 'restoreBlock', block: [0, 1],
      snapshot: {...t, id: walkAt(d, [0, 0]).id}}), /already in use/);
    assert.throws(() => apply(d, {op: 'restoreBlock', block: [0, 0],
      snapshot: modelTable([[[walkAt(d, E1)]]])}), /already in use/);
  });
  it('depth: path depth + the table\'s own <= 8', () => {
    let t = modelTable([['in']]);
    for (let k = 1; k < 8; k++) t = modelTable([[[t, 'z']]]);
    const d = fixture();
    const before = structuredClone(d);
    assert.throws(() => apply(d, {op: 'insertBlock', at: E1, block: t}),
      /too deep/);
    assert.throws(() => apply(d, {op: 'insertBlocks', at: E1,
      blocks: [t]}), /too deep/);
    assert.throws(() => apply(d, {op: 'restoreBlock', block: E1,
      snapshot: t}), /too deep/);
    assert.ok(deepEqual(d, before));
    apply(d, {op: 'insertBlock', at: [0, 0], block: t});
    valid(d);
    let t7 = modelTable([['in7']]);
    for (let k = 1; k < 7; k++) t7 = modelTable([[[t7, 'z']]]);
    apply(d, {op: 'insertBlock', at: [0, 2, 0, 0, 0], block: t7});
    valid(d);
  });
});

describe('big tables', () => {
  it('restoreBlock of a 1000-row table, one row changed', () => {
    const big = modelTable(Array.from({length: 1000}, (_, r) =>
      Array.from({length: 5}, (_, c) => r + '/' + c)));
    const d = emptyDoc();
    d.sections[0].blocks = [P('x'), big];
    const times = [];
    for (let k = 0; k < 23; k++) {
      const t = d.sections[0].blocks[1];
      const rows = t.rows.slice();
      rows[500] = {...rows[500], trPr: {cantSplit: k % 2 === 0,
        extra: []}};
      const nt = {...t, rows};
      const t0 = performance.now();
      const inv = apply(d, {op: 'restoreBlock', block: [0, 1],
        snapshot: nt});
      times.push(performance.now() - t0);
      assert.equal(inv.snapshot, t);
      if (k === 22) {
        applyOwn(d, inv);
        assert.equal(d.sections[0].blocks[1], t, 'the very old object');
      }
    }
    const med = times.slice(3).sort((a, b) => a - b)[10];
    assert.ok(med < 20, 'median ' + med.toFixed(2) + ' ms');
  });
});

describe('EditApply.stepEnd', () => {
  it('after a splitBlock in a cell: the new paragraph\'s start', () => {
    const d = fixture();
    apply(d, {op: 'splitBlock', block: E1, at: 1});
    const q = walkAt(d, E2);
    assert.deepEqual(stepEnd(d, [{op: 'splitBlock', block: E1, at: 1}],
      null), {id: q.id, off: 0});
  });
  it('after removeBlock in a cell and insertBlock in a nested cell', () => {
    const d = fixture();
    apply(d, {op: 'removeBlock', at: E2});
    assert.deepEqual(stepEnd(d, [{op: 'removeBlock', at: E2}], null),
      {id: walkAt(d, E1).id, off: 2});
    assert.deepEqual(stepEnd(d, [{op: 'removeBlock',
      at: [0, 1, 0, 0, 0]}], null), {id: walkAt(d, [0, 1, 0, 0, 0]).id,
      off: 0});
    const n1 = [0, 1, 1, 1, 1, 0, 0, 0];
    assert.equal(walkAt(d, n1).text, 'n1');
    assert.deepEqual(stepEnd(d, [{op: 'setProps', block: n1}], null),
      {id: walkAt(d, n1).id, off: 0});
    assert.equal(stepEnd(d, [{op: 'removeBlock', at: [0, 9, 9]}], null),
      null);
  });
});
