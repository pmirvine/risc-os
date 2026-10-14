// A vertically merged cell across pages (review P4 I3): the merged
// cell's content belongs, unit by unit (./PageCells: a line each),
// to the row of its span its top lies in; a continue cell carries
// those units, so pagination cuts the merged column at row
// boundaries and inside a row as any cell, and each page shows the
// part of it beside its own rows. Every line of a merged cell is
// shown once, inside a frame, where the caret and a click put it.
// Real documents laid out with the fake measurer.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {loadStyles, rng} from './word-docs.mjs';
import {X, printDoc, tableFrags, shownOnce}
  from './tblpage-fixture.mjs';
import {unitsAt} from '../../tools/moreapps/!Letters/PageCells';

before(loadStyles);

const RS = '<w:vMerge w:val="restart"/>', CT = '<w:vMerge/>';
const tableOf = (S) => S.L.items.find((x) => x.kind === 'tbl');

/** A table of n rows, a merge over every `every` rows in column 0
 *  holding `paras` paragraphs; column 1 one line a row. */
const merged = (n, every, paras, short = 1) => X.tbl(Array.from(
  {length: n}, (_, i) => X.tr([X.tc(i % every === 0
    ? X.uparas(paras, `m${i}_`) : X.P(''), i % every === 0 ? RS : CT),
  X.tc(X.uparas(short, `r${i}_`, 3))])), 2);

describe('a vertically merged cell across pages (I3)', () => {
  it('merges of 40 rows, 30 paragraphs each: every line shown once',
    async () => {
      const S = await printDoc(X.P('x') + merged(120, 40, 30));
      assert.ok(S.P.count >= 4, `${S.P.count} pages`);
      assert.deepEqual(shownOnce(S), []);
    });

  it('the units of a merge: each row of its span holds those whose ' +
    'top lies in it; all of them once', async () => {
    const S = await printDoc(X.P('x') + merged(40, 40, 30));
    const t = tableOf(S), c = t.rows[0].cells[0];
    let n = 0, prev = -Infinity;
    for (let r = 0; r < 40; r++) {
      const u = unitsAt(t, r, 0);
      n += u.tops.length;
      for (let j = 0; j < u.tops.length; j++) {
        const y = u.y0 + u.tops[j];
        assert.ok(y >= prev - 1e-6, `row ${r} unit ${j} in order`);
        prev = y;
        if (r > 0) assert.ok(y >= t.rows[r].y - 1e-6);
        if (r < 39) assert.ok(y < t.rows[r + 1].y + 1e-6);
      }
    }
    const lines = c.col.items.reduce((s, x) => s + x.lines.length, 0);
    assert.equal(n, lines);
  });

  it('a merge whose start row is cut, the rows beside it short',
    async () => {
      const rows = [X.tr([X.tc(X.uparas(70, 'big'), RS),
        X.tc(X.uparas(1, 'b0_', 3))]),
      X.tr([X.tc(X.P(''), CT), X.tc(X.uparas(1, 'b1_', 3))]),
      ...Array.from({length: 20}, (_, i) => X.tr([
        X.tc(X.uparas(1, `a${i}_`, 3)), X.tc(X.uparas(1, `c${i}_`, 3))]))];
      const S = await printDoc(X.P('x') + X.tbl(rows, 2));
      assert.ok(tableFrags(S.Pl, tableOf(S)).some(({f}) => f.cuts));
      assert.deepEqual(shownOnce(S), []);
    });

  it('random merges (12 seeds): every line shown once', async () => {
    for (let seed = 1; seed <= 12; seed++) {
      const R = rng(seed * 13), pick = (n) => Math.floor(R() * n);
      const rows = [];
      for (let i = 0; i < 30;) {
        const span = 1 + pick(8);
        for (let j = 0; j < span && i < 30; j++, i++) {
          rows.push(X.tr([X.tc(j === 0 ? X.uparas(1 + pick(25),
            `s${seed}m${i}_`) : X.P(''), span > 1 ? (j ? CT : RS) : ''),
          X.tc(X.uparas(1 + pick(4), `s${seed}r${i}_`, 3))]));
        }
      }
      const S = await printDoc(X.uparas(pick(20), 'top') +
        X.tbl(rows, 2));
      assert.deepEqual(shownOnce(S), [], `seed ${seed}`);
    }
  });
});
