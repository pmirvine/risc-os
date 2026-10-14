// A row whose content fits a frame but whose box does not (review P4
// M1): the box is taller than the content because of a trHeight
// atLeast or the cells' bottom margin. The rule: a cut part keeps
// the cell's bottom margin inside the frame (a line goes to the next
// frame when it and the bottom margin do not fit); a row whose
// content fits but whose box does not moves whole to the next frame
// when it is not the first row there and its box fits a frame; else
// (first in its frame, or taller than a frame) it ends the frame cut
// to its content: drawn to its content and bottom margin, its bottom
// border inside the frame, the rest of its height dropped. No row
// box runs past its frame (exact rows aside: clipped, as in Draft).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {rowFit} from '../../tools/moreapps/!Letters/PageRows';
import {piecesOf} from '../../tools/moreapps/!Letters/TblPieces';
import {loadStyles} from './word-docs.mjs';
import {galley} from './page-fixtures.mjs';
import {X, printDoc, tableFrags, misplaced, painted, bars, near}
  from './tblpage-fixture.mjs';

before(loadStyles);

const lines = (n, h = 10) => Array(n).fill(h);
const para = (n) => ({lines: lines(n)});
const tbl = (rows) => ({kind: 'tbl', rows});
const run = (spec) => new Pages(galley(spec)).finish();
const starts = (P) => P.list.map((pg) => ({...pg.start}));

/** The row pieces of table t's fragments whose box ends past their
 *  frame (exact rows aside): [[page, row, px past]]. */
function overflow(S, t) {
  const out = [];
  for (const {i, f} of tableFrags(S.Pl, t)) {
    const fr = S.P.at(i).frames[0];
    for (const p of piecesOf(t, f)) {
      const tr = t.rows[p.r].geo.trH;
      if (tr && tr.rule === 'exact') continue;
      const d = f.dy + p.y + p.h - (fr.y + fr.h);
      if (d > 0.5) out.push([i, p.r, d]);
    }
  }
  return out;
}

describe('a row whose box does not fit (M1)', () => {
  it('not first in its frame, its box fits a frame: moved whole',
    () => {
      const P = run({items: [para(1), tbl([...Array(5).fill([[10]]),
        {cells: [[10]], min: 60}, [[10]]])]});
      assert.deepEqual(starts(P), [{k: 0, line: 0}, {k: 1, line: 5}]);
    });

  it('taller than a frame: cut to its content where it starts', () => {
    const P = run({items: [para(1), tbl([[[10]],
      {cells: [[10, 10]], min: 150}, [[10]]])]});
    assert.deepEqual(starts(P), [{k: 0, line: 0},
      {k: 1, line: 1, cuts: [2]}]);
    const f = P.at(0).frames[0].frags[1];
    assert.deepEqual([f.r0, f.r1, f.cuts], [0, 2, [2]]);
    // (the next page: the empty rest, then row 2 at the frame top)
    const g = P.at(1).frames[0].frags[0];
    assert.deepEqual([g.r0, g.r1, g.from], [1, 3, [2]]);
    assert.equal(g.y + P.G.items[1].rows[2].ry, P.at(1).bodyTop);
  });

  it('first in its frame, its box taller than the frame: cut to its ' +
    'content', () => {
    const P = run({items: [{lines: lines(10), id: 'p'}, tbl([
      {cells: [[10]], min: 150}, [[10]]])]});
    assert.deepEqual(starts(P), [{k: 0, line: 0}, {k: 1, line: 0},
      {k: 1, line: 0, cuts: [1]}]);
  });

  it('the bottom margin kept inside the frame on a cut part', () => {
    const G = galley({items: [para(6), tbl([{cells: [lines(5)],
      mar: {top: 0, bottom: 15}}])]});
    const it = G.items[1];
    // (room 40: two lines and the margin; three lines and it: 45)
    assert.deepEqual(rowFit(it, 0, 40).cuts, [2]);
    assert.deepEqual(rowFit(it, 0, 65), {whole: true});
  });

  it('min-height rows in a real table: every box inside its frame, ' +
    'its bottom border drawn there', async () => {
    const rows = Array.from({length: 40}, (_, i) => X.tr(
      [X.tc(X.paras(1 + i % 3, 'm' + i)), X.tc(X.P('n' + i))],
      `<w:trHeight w:val="${1200 + (i % 5) * 900}"/>`));
    const S = await printDoc(X.P('x') + X.tbl(rows, 2));
    const t = S.L.items.find((x) => x.kind === 'tbl');
    assert.ok(tableFrags(S.Pl, t).length > 4);
    assert.deepEqual(overflow(S, t), []);
    assert.deepEqual(misplaced(S, t), []);
    for (const {i, f} of tableFrags(S.Pl, t)) {
      const ps = piecesOf(t, f), p = ps[ps.length - 1];
      assert.ok(near(bars(painted(S, i)), f.dy + p.y + p.h),
        `page ${i}: the last row's bottom border`);
    }
  });

  it('a min height taller than a frame: cut to its content', async () => {
    const rows = [X.tr([X.tc(X.P('a')), X.tc(X.P('b'))]),
      X.tr([X.tc(X.paras(2, 'big')), X.tc(X.P('c'))],
        '<w:trHeight w:val="20000"/>'),
      X.tr([X.tc(X.P('d')), X.tc(X.P('e'))])];
    const S = await printDoc(X.P('x') + X.tbl(rows, 2));
    const t = S.L.items.find((x) => x.kind === 'tbl');
    assert.deepEqual(overflow(S, t), []);
    assert.deepEqual(misplaced(S, t), []);
  });
});
