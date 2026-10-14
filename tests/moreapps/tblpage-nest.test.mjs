// A nested table taller than a frame in a cell cut across pages
// (review P4 M2): its rows are the cell's units (./PageCells), kept
// together (PG11) unless the nested table is taller than a frame;
// then it is cut between its rows where the cell reaches it, so no
// page shows the cell empty while it has lines left, every line of
// it is shown once, and Edit > Next page / Previous page (nextPage,
// prevPage) visit every page in turn, neither skipping nor sticking.
// Real documents laid out with the fake measurer.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import * as Sel from '../../tools/moreapps/!Letters/Selection';
import {lineOf} from '../../tools/moreapps/!Letters/PositionMap';
import {unitsAt} from '../../tools/moreapps/!Letters/PageCells';
import {loadStyles} from './word-docs.mjs';
import {X, printDoc, tableFrags, shownOnce}
  from './tblpage-fixture.mjs';

before(loadStyles);

/** Rows of cell 0: paragraphs, a nested table of `rows` rows, more
 *  paragraphs; cell 1: 25 paragraphs. */
const nested = (n, rows) => X.tbl(Array.from({length: n}, (_, k) =>
  X.tr([X.tc(X.uparas(8, `p${k}_`) + X.tbl(Array.from({length: rows},
    (_, i) => X.tr([X.tc(X.uparas(1, `n${k}_${i}_`, 6), '', 2000)])), 1,
  2000) + X.uparas(8, `q${k}_`)), X.tc(X.uparas(25, `s${k}_`))])), 2);

const tableOf = (S) => S.L.items.find((x) => x.kind === 'tbl');

/** The page of the caret's place in S. */
function pageOf(S, pos, aff) {
  const it = S.L.byId.get(pos.id);
  const k = it.kind === 'p' ? lineOf(it, pos.off, aff) : 0;
  return S.Pl.pageOf(it, k);
}

describe('a nested table taller than a frame (M2)', () => {
  let S;
  before(async () => {
    S = await printDoc(X.P('x') + nested(4, 90));
  });

  it('every line shown once, inside a frame, hit back', () => {
    assert.ok(S.P.count > 8, `${S.P.count} pages`);
    assert.deepEqual(shownOnce(S), []);
  });

  it('no page shows a cell empty while it has lines left', () => {
    const t = tableOf(S), empty = [];
    for (const {i, f} of tableFrags(S.Pl, t)) {
      for (let r = f.r0; r < f.r1; r++) {
        t.rows[r].cells.forEach((c, ci) => {
          const n = unitsAt(t, r, ci).tops.length;
          const lo = f.from && r === f.r0 ? f.from[ci] : 0;
          const hi = f.cuts && r === f.r1 - 1 ? f.cuts[ci] : n;
          if (lo < n && !(hi > lo)) empty.push(`page ${i} row ${r} ` +
            `cell ${ci}: ${lo}..${hi} of ${n}`);
        });
      }
    }
    assert.deepEqual(empty, []);
  });

  it('Next page visits every page in turn; Previous page comes back',
    () => {
      const first = S.L.items[0];
      let sel = Sel.caret({id: first.id, off: 0}), seen = [0];
      for (let n = 0; n < 200; n++) {
        const s = Sel.move(sel, S.L, 'nextPage');
        if (!s || JSON.stringify(s.head) === JSON.stringify(sel.head)) {
          break;
        }
        sel = s;
        seen.push(pageOf(S, sel.head, sel.affinity));
      }
      const all = [...Array(S.P.count).keys()];
      assert.deepEqual(seen, all);
      const back = [seen[seen.length - 1]];
      for (let n = 0; n < 200; n++) {
        const s = Sel.move(sel, S.L, 'prevPage');
        const pg = pageOf(S, s.head, s.affinity);
        if (pg === back[back.length - 1]) break;
        sel = s;
        back.push(pg);
      }
      assert.deepEqual(back, all.slice().reverse());
    });

  it('a nested table no taller than a frame stays whole (PG11)',
    async () => {
      const T = await printDoc(X.P('x') + nested(6, 6));
      const t = tableOf(T);
      for (const {f} of tableFrags(T.Pl, t)) {
        for (const cuts of [f.from, f.cuts]) {
          if (!cuts) continue;
          // (cell 0's units: 8 paragraphs' lines, then 6 rows)
          const r = cuts === f.from ? f.r0 : f.r1 - 1;
          const u = unitsAt(t, r, 0), at = u.ends.findIndex((e) => e);
          assert.ok(!(cuts[0] > at && cuts[0] < u.ends[at]),
            `cut inside the nested table: ${cuts[0]}`);
        }
      }
      assert.deepEqual(shownOnce(T), []);
    });
});
