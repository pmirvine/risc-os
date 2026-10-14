// Outline, the P13 fix wave's minor findings (Batch D, D32):
// M1 Show first line only: a caret in a paragraph's hidden rest goes
//   to the end of its first line (shownSel, as for collapsed text);
//   moving right from that end goes on to the next paragraph.
// M2 Promote and Demote under Show level take the subheadings the
//   level hides, as they do for a heading collapsed by hand.
// M3 no quadratic paths: Demote and Expand with every heading of a
//   100,000-block document collapsed and everything selected.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {levelOf} from '../../tools/moreapps/!Letters/OutlineLayout';
import {Fold, showFirst, showLevel, shownSel, expandCmd, collapseCmd}
  from '../../tools/moreapps/!Letters/OutlineFold';
import {promoteCmd, demoteCmd} from '../../tools/moreapps/!Letters/OutlineCmd';
import {newPara} from '../../tools/moreapps/!Letters/Model';
import {tm} from './word-docs.mjs';
import {mk, P, C, SEL, S, ids} from './edit-docs.mjs';

const H = (n, text) => [text, {pStyle: 'Heading' + n}];
const LONG = 'word '.repeat(120).trim();
const lv = (d, k) => levelOf(d.doc.styles, P(d, k));

describe('M1: Show first line only keeps the caret on the first line', () => {
  const d = mk([H(1, 'A'), LONG, 'next']);
  const L = new DocLayout(d.doc, tm(), null, {outline: showFirst(new Fold(), true)});
  L.layout(600);
  const item = L.byId.get(ids(d)[1]), end = item.lines[0].to;

  it('the paragraph shows one line, its end before the text\'s', () => {
    assert.equal(item.lines.length, 1);
    assert.ok(end < LONG.length);
  });

  it('a caret in the hidden rest goes to the end of the first line', () => {
    const s = shownSel(L, C(d, 1, 400));
    assert.deepEqual([s.head.id, s.head.off], [ids(d)[1], end]);
    const t = shownSel(L, SEL(d, 0, 0, 1, LONG.length));
    assert.deepEqual([t.anchor.off, t.head.off], [0, end]);
  });

  it('Right from the end of the first line goes to the next paragraph', () => {
    const from = C(d, 1, end), to = C(d, 1, end + 1);
    const s = shownSel(L, to, from);
    assert.deepEqual([s.head.id, s.head.off], [ids(d)[2], 0]);
  });

  it('a jump from that end far into the rest (Go to, a click) is not Right: to the end', () => {
    const s = shownSel(L, C(d, 1, 400), C(d, 1, end));
    assert.deepEqual([s.head.id, s.head.off], [ids(d)[1], end]);
  });

  it('a caret on the first line, and first line only off: as they are', () => {
    const sel = C(d, 1, 3);
    assert.equal(shownSel(L, sel), sel);
    const M = new DocLayout(d.doc, tm(), null, {outline: new Fold()});
    M.layout(600);
    const far = C(d, 1, 400);
    assert.equal(shownSel(M, far), far);
  });
});

describe('M2: Promote and Demote under Show level take the hidden subheadings', () => {
  it('Demote of a Heading 2 at Show level 2 takes its Heading 3 too', () => {
    const d = mk([H(1, 'A'), H(2, 'A1'), H(3, 'A11'), 'body', H(1, 'B')]);
    const f = showLevel(d.doc, new Fold(), 2);
    demoteCmd(d, C(d, 1, 0), f);
    assert.deepEqual([lv(d, 1), lv(d, 2), lv(d, 3)], [2, 3, 9]);
  });

  it('Promote of it takes it back', () => {
    const d = mk([H(1, 'A'), H(3, 'A1'), H(4, 'A11'), H(1, 'B')]);
    const f = showLevel(d.doc, new Fold(), 3);
    promoteCmd(d, C(d, 1, 0), f);
    assert.deepEqual([lv(d, 1), lv(d, 2)], [1, 2]);
  });
});

describe('M3: no quadratic paths on 100,000 blocks, every heading collapsed', () => {
  const N = 100000;
  const big = (n = N) => {
    const d = mk([H(1, 'h')]);
    const h = P(d, 0);
    d.doc.sections[0].blocks = Array.from({length: n}, (_, i) => (i % 2
      ? newPara('b' + i) : newPara('h' + i, {pStyle: h.pStyle})));
    d.clearHistory();
    return d;
  };
  const all = (d, n = N) => SEL(d, 0, 0, n - 1, 1);
  const median = (run, after) => {
    const ms = [];
    for (let i = 0; i < 23; i++) {
      const t0 = performance.now();
      run();
      if (i >= 3) ms.push(performance.now() - t0);
      if (after) after();
    }
    ms.sort((a, b) => a - b);
    return ms[10];
  };

  // Robust under the parallel unit run (final fix B, review 3 M32):
  // the document of N blocks and one of N / 4 are timed in turn (paired
  // samples, so a busy spell slows both), the least of 20 each after
  // 3 warm-ups. Linear: N takes about 4 times N / 4 (quadratic: 16;
  // under heavy load up to about 8.5 was seen), asserted always; the
  // 200 ms ceiling on the least sample is printed always and asserted
  // with WORD_PERF=1 (a quiet machine: six parallel copies of the
  // timing files took 190-260 ms).
  it('Demote all <= 200 ms (WORD_PERF=1), linear in the blocks', () => {
    const q = N / 4, folds = (d) => new Fold(ids(d)
      .filter((_, i) => i % 2 === 0));
    const dB = big(), fB = folds(dB), dQ = big(q), fQ = folds(dQ);
    const one = (d, f, n) => {
      const t0 = performance.now();
      assert.ok(demoteCmd(d, all(d, n), f));
      const ms = performance.now() - t0;
      d.undo();
      return ms;
    };
    let lb = Infinity, lq = Infinity;
    for (let i = 0; i < 23; i++) {
      const b = one(dB, fB, N), x = one(dQ, fQ, q);
      if (i >= 3) {
        lb = Math.min(lb, b);
        lq = Math.min(lq, x);
      }
    }
    console.log(`# demote all, 100,000 blocks collapsed: ` +
      `${lb.toFixed(1)} ms (25,000: ${lq.toFixed(1)} ms; least of 20)`);
    if (process.env.WORD_PERF) assert.ok(lb <= 200, `${lb.toFixed(1)} ms`);
    assert.ok(lb < lq * 10 + 5, `${lb.toFixed(1)} ms against ` +
      `${lq.toFixed(1)} ms at a quarter of the size`);
  });

  it('Expand and Collapse all quick (<= 200 ms)', () => {
    const d = big(), f = new Fold(ids(d).filter((_, i) => i % 2 === 0));
    const ms = median(() => assert.equal(expandCmd(d.doc, f, all(d)).size, 0));
    const mc = median(() => assert.equal(collapseCmd(d.doc, new Fold(), all(d)).size, N / 2));
    console.log(`# expand all ${ms.toFixed(1)} ms, collapse all ${mc.toFixed(1)} ms`);
    assert.ok(ms <= 200 && mc <= 200, `${ms.toFixed(1)} / ${mc.toFixed(1)} ms`);
  });

  it('Collapse with a long run of body text under one heading is linear', () => {
    const d = mk([H(1, 'h')]);
    d.doc.sections[0].blocks.push(...Array.from({length: 50000}, (_, i) => newPara('b' + i)));
    const t0 = performance.now();
    const f = collapseCmd(d.doc, new Fold(), SEL(d, 0, 0, 50000, 1));
    assert.equal(f.size, 1);
    assert.ok(performance.now() - t0 < 500, 'linear');
  });
});
