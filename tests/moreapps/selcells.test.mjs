// SelCells.cellsShape's growth (C3 fix wave, review C3a I2): the
// rectangle grows until no merged cell crosses its edge by a
// worklist that scans only the rows and columns newly added, so a
// hostile staircase of offset vertical merges costs O(cells), not
// O(rows x passes). Equivalent to the old fixpoint (kept here as the
// reference) on random merged grids.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {cellsShape} from '../../tools/moreapps/!Letters/SelCells';
import {gridOf, spanOf} from '../../tools/moreapps/!Letters/TblGrid';
import {modelTable} from './tbl-fixtures.mjs';
import {rng} from './word-docs.mjs';

/** The C3.2 fixpoint: every pass rescans rows R0..R1 (reference). */
function oldGrow(g, R0, R1, C0, C1) {
  const lim = g.rows.length + g.cols + 1;
  for (let step = 0, more = true; more && step <= lim; step++) {
    more = false;
    for (let r = R0; r <= R1; r++) {
      const cells = g.rows[r].cells;
      for (let k = 0; k < cells.length; k++) {
        const c = cells[k];
        if (c.c0 > C1) break;
        if (c.c1 - 1 < C0) continue;
        const s = spanOf(g, r, k);
        if (s.r0 < R0) { R0 = s.r0; more = true; }
        if (s.r1 - 1 > R1) { R1 = s.r1 - 1; more = true; }
        if (s.c0 < C0) { C0 = s.c0; more = true; }
        if (s.c1 - 1 > C1) { C1 = s.c1 - 1; more = true; }
      }
    }
  }
  return [R0, R1, C0, C1];
}

/** The old shape's rectangle for ends [[r, k]...]. */
function oldRect(t, ends) {
  const g = gridOf(t);
  let R0 = Infinity, R1 = -1, C0 = Infinity, C1 = -1;
  for (const [r, k] of ends) {
    const s = spanOf(g, r, k);
    R0 = Math.min(R0, s.r0); R1 = Math.max(R1, s.r1 - 1);
    C0 = Math.min(C0, s.c0); C1 = Math.max(C1, s.c1 - 1);
  }
  return oldGrow(g, R0, R1, C0, C1);
}

const vm = (v, t) => ({tcPr: {vMerge: v, extra: []}, blocks: [t]});

/** rows x cols: column 0 merged in pairs (0-1, 2-3...), column 1 in
 *  pairs offset by one (1-2, 3-4...): selecting across the last row
 *  grows one row per old pass. */
function staircase(rows, cols) {
  return modelTable(Array.from({length: rows}, (_, r) =>
    Array.from({length: cols}, (_, c) => {
      if (c === 0) return vm(r % 2 ? 'continue' : 'restart', 'x');
      if (c === 1) {
        return vm(r % 2 && r < rows - 1 ? 'restart' : r ? 'continue'
          : 'restart', 'y');
      }
      return 'z';
    })));
}

describe('cellsShape grows by a worklist (review C3a I2)', () => {
  it('a staircase grows to the whole table, as the old fixpoint',
    () => {
      const t = staircase(40, 4);
      const n = t.rows.length - 1, k = t.rows[n].cells.length - 1;
      const sh = cellsShape([0, 0], t, [[n, k], [n, 0]], false);
      assert.deepEqual([sh.r0, sh.r1, sh.c0, sh.c1],
        oldRect(t, [[n, k], [n, 0]]));
      assert.deepEqual([sh.r0, sh.r1, sh.c0, sh.c1], [0, n, 0, 3]);
    });

  it('hostile: a 1000 x 63 staircase\'s shape in < 50 ms (median of ' +
    '20 after 3 warm-ups)', () => {
    const t = staircase(1000, 63);
    gridOf(t);
    const ts = [];
    for (let n = 0; n < 23; n++) {
      const t0 = performance.now();
      const sh = cellsShape([0, 0], t, [[999, 62], [999, 0]], false);
      ts.push(performance.now() - t0);
      assert.equal(sh.r0, 0);
    }
    const med = ts.slice(3).sort((a, b) => a - b)[10];
    assert.ok(med < 50, `median ${med.toFixed(2)} ms`);
  });

  it('equals the old fixpoint on 3000 random merged grids', () => {
    const r = rng(77);
    const int = (n) => Math.floor(r() * n);
    for (let n = 0; n < 3000; n++) {
      const rows = 1 + int(8), cols = 1 + int(7);
      const spec = Array.from({length: rows}, () => {
        const row = [];
        for (let c = 0; c < cols;) {
          const span = Math.min(cols - c, 1 + int(3));
          const v = [null, 'restart', 'continue'][int(3)];
          const tcPr = {extra: []};
          if (span > 1) tcPr.gridSpan = span;
          if (v) tcPr.vMerge = v;
          row.push({tcPr, blocks: ['t']});
          c += span;
        }
        return row;
      });
      const t = modelTable(spec, {grid: Array(cols).fill(1000)});
      const e1 = [int(rows), 0], e2 = [int(rows), 0];
      e1[1] = int(t.rows[e1[0]].cells.length);
      e2[1] = int(t.rows[e2[0]].cells.length);
      const sh = cellsShape([0, 0], t, [e1, e2], false);
      assert.deepEqual([sh.r0, sh.r1, sh.c0, sh.c1],
        oldRect(t, [e1, e2]), `grid ${n}`);
    }
  });
});
