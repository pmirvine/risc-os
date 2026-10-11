// Table-free documents keep their layout speed (Batch C, D20, C7.1):
// the relayout after a one-paragraph edit in a 50,000-paragraph
// document (the keystroke's work: a new layout from the previous
// one). Measured at the main branch before Batch C (C2.1 report,
// median of 25, three runs each): 9.7-10.2 ms; after C2 10.8-11.2 ms;
// after the C7 fix wave (A3) 9.7-10.5 ms against main's 9.2-9.8.
// The +5 ms budget is checked by hand against the main branch (the
// numbers are in docs/apps/Word.md); this test fails on a gross
// regression only (a fixed ceiling would flake under load), and on
// the ratio to the same relayout of a 5,000-paragraph document of
// the same run, which must stay near linear (table-free documents
// take none of the table paths).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {loadStyles, tm} from './word-docs.mjs';
import {mk} from './edit-docs.mjs';
import {modelTable} from './tbl-fixtures.mjs';

before(loadStyles);
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'
  .split(' ');

/** Median ms of a relayout after replacing one paragraph, n runs. */
function relayout(paras, n = 25) {
  const d = mk(Array.from({length: paras}, (_, i) => `${i} ` +
    WORDS[i % 10] + ' words'));
  const metrics = tm();
  let L = new DocLayout(d.doc, metrics);
  L.layout(800);
  const ms = [];
  for (let k = 0; k < n + 3; k++) {
    d.apply({op: 'replaceText', block: [0, paras >> 1], at: 0, del: 0,
      ins: 'x'});
    const t0 = performance.now();
    const N = new DocLayout(d.doc, metrics, L);
    N.layout(800);
    if (k >= 3) ms.push(performance.now() - t0);
    L = N;
  }
  ms.sort((a, b) => a - b);
  return ms[ms.length >> 1];
}

describe('a table-free layout takes no table path (C7 fix A3)', () => {
  /** A layout of blocks whose every L.flow assignment is recorded. */
  function laid(blocks) {
    const d = mk(blocks);
    const set = [], flows = new WeakMap(), P = DocLayout.prototype;
    Object.defineProperty(P, 'flow', {configurable: true,
      get() { return flows.get(this); },
      set(v) { set.push(v); flows.set(this, v); }});
    try {
      const L = new DocLayout(d.doc, tm());
      L.layout(800);
      const flow = L.flow;
      delete P.flow;
      L.flow = flow;
      return {L, set};
    } finally {
      delete P.flow;
    }
  }

  it('no second array: L.flow is L.items; the items get no ry', () => {
    const {L, set} = laid(['a', 'b', 'c']);
    assert.equal(L.flow, L.items);
    assert.ok(set.every((v) => v === null || v === L.items),
      'L.flow was never another array');
    assert.ok(L.items.every((it) => !Object.hasOwn(it, 'ry')));
  });

  it('with a table: L.flow made at the table, places as before', () => {
    const t = modelTable([['x', 'y']]);
    const {L} = laid(['a', 'b', t, 'c']);
    assert.notEqual(L.flow, L.items);
    assert.deepEqual(L.flow.map((it) => it.index === undefined ? -1
      : L.flow.indexOf(it)), [0, 1, 2, 3, 4, 2, 6]);
    const T = L.items[2];
    assert.deepEqual([T.index, T.endIndex], [2, 5]);
    assert.deepEqual(L.items.map((it) => it.index), [0, 1, 2, 6]);
    assert.deepEqual(L.items.map((it) => it.ci), [0, 1, 2, 3]);
  });
});

describe('table-free relayout speed (C7.1)', () => {
  it('50,000 paragraphs: one edit relayouts in about the time it ' +
    'took before tables (10-11 ms): < 25 ms; linear in the size', () => {
    const small = relayout(5000), big = relayout(50000);
    console.log(`# relayout after one edit: 5,000 paragraphs ` +
      `${small.toFixed(2)} ms, 50,000 ${big.toFixed(2)} ms`);
    assert.ok(big < 25, `median ${big.toFixed(2)} ms`);
    assert.ok(big < small * 40 + 5, `${big.toFixed(2)} ms against ` +
      `${small.toFixed(2)} ms at a tenth of the size`);
  });
});
