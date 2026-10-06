// Ops: removeBlocks and insertBlocks (many blocks in one op, linear).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {newPara, emptyDoc, deepEqual}
  from '../../tools/moreapps/!Word/Model';
import {apply, applyOwn} from '../../tools/moreapps/!Word/Ops';

const docOf = (...blocks) => {
  const d = emptyDoc();
  d.sections[0].blocks = blocks;
  return d;
};
const T = (d) => d.sections[0].blocks.map((b) => b.text ?? '#');
const box = () => ({type: 'opaque', node: {name: 'w:tbl', attrs: [],
  children: []}});

describe('removeBlocks / insertBlocks', () => {
  it('invert each other exactly', () => {
    const d = docOf(newPara('a'), newPara('b'), box(), newPara('c'));
    const before = structuredClone(d);
    const inv = apply(d, {op: 'removeBlocks', at: [0, 1], count: 2});
    assert.deepEqual(T(d), ['a', 'c']);
    assert.equal(inv.op, 'insertBlocks');
    const back = applyOwn(d, inv);
    assert.ok(deepEqual(d, before));
    assert.deepEqual(back, {op: 'removeBlocks', at: [0, 1], count: 2});
  });
  it('insertBlocks at the end, and refusals', () => {
    const d = docOf(newPara('a'));
    const before = structuredClone(d);
    const n = [newPara('x'), newPara('y')];
    apply(d, {op: 'insertBlocks', at: [0, 1], blocks: n});
    assert.deepEqual(T(d), ['a', 'x', 'y']);
    const bad = [
      {op: 'insertBlocks', at: [0, 0], blocks: [n[0]]},
      {op: 'insertBlocks', at: [0, 0], blocks: []},
      {op: 'insertBlocks', at: [0, 0], blocks: [{type: 'p'}]},
      {op: 'insertBlocks', at: [0, 9], blocks: [newPara('z')]},
      {op: 'insertBlocks', at: [0, 0], blocks: 'x'},
      {op: 'removeBlocks', at: [0, 2], count: 2},
      {op: 'removeBlocks', at: [0, 0], count: 0},
      {op: 'removeBlocks', at: [0, 0], count: 1.5},
    ];
    const z = newPara('z');
    bad.push({op: 'insertBlocks', at: [0, 0], blocks: [z, z]});
    const now = structuredClone(d);
    for (const op of bad) {
      assert.throws(() => apply(d, op), RangeError, JSON.stringify(op));
      assert.ok(deepEqual(d, now));
    }
    apply(d, {op: 'removeBlocks', at: [0, 1], count: 2});
    assert.ok(deepEqual(d, before));
  });
  it('linear: 100k blocks out and back in well under a second', () => {
    const list = [];
    for (let k = 0; k < 100000; k++) list.push(newPara('p' + k));
    const d = docOf(...list);
    const t0 = performance.now();
    const inv = apply(d, {op: 'removeBlocks', at: [0, 10], count: 90000});
    applyOwn(d, inv);
    assert.ok(performance.now() - t0 < 1000);
    assert.equal(d.sections[0].blocks.length, 100000);
  });
});
