// SpellJobs: a small map of the long-paragraph checks begun.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
const {SpellJobs, MAX} = await import(
  '../../tools/moreapps/!Letters/SpellJobs');

describe('SpellJobs', () => {
  it('a job is dropped on a new generation and the map never ' +
    'exceeds 4', () => {
    const m = new SpellJobs(), ps = [];
    for (let i = 0; i < 9; i++) {
      const p = {i};
      ps.push(p);
      m.set(p, {p, gen: 1});
      assert.ok(m.size <= 4);
    }
    assert.equal(MAX, 4);
    assert.equal(m.size, 4);
    assert.equal(m.get(ps[0], 1), undefined);   // (oldest went)
    assert.ok(m.get(ps[8], 1));
    assert.equal(m.get(ps[8], 2), undefined);   // (other generation)
    m.set(ps[0], {p: ps[0], gen: 2});
    assert.equal(m.size, 1);
    m.delete(ps[0]);
    assert.equal(m.size, 0);
  });
});
