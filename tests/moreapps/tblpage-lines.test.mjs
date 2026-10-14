// Every line of every cell of a table across pages (Batch D P4 fix
// wave): each is placed (./PlacePrint lineAt, ./Pages ofPos) on the
// page whose fragment shows its unit (from..cuts), inside that
// page's frame. I1: a line at a cut was put on the page before when
// its galley y, summed in another order, came out an ulp above its
// unit's top (line heights that are not dyadic: the fake measurer's,
// line spacing 1.15); the cell line is now found by its item and
// line index. I2: the first part of a cut row is measured from the
// cell's column top (its first paragraph's space before counted), so
// no line of it runs past the frame and its bottom border (PG9) is
// drawn at the cut. Real documents laid out with the fake measurer.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {loadStyles, rng} from './word-docs.mjs';
import {X, printDoc, tableFrags, misplaced, painted, bars, near}
  from './tblpage-fixture.mjs';
import {pieceOf} from '../../tools/moreapps/!Letters/TblPieces';

before(loadStyles);

const tableOf = (S) => S.L.items.find((x) => x.kind === 'tbl');
const SP115 = '<w:spacing w:line="276" w:lineRule="auto"/>';

describe('every cell line on the page that shows it (I1)', () => {
  it('multi-line cells, a header row: every line of every cell item',
    async () => {
      const rows = Array.from({length: 30}, (_, i) => X.tr([
        X.tc(X.paras(3 + i % 7, 'a' + i)), X.tc(X.paras(2, 'b' + i))],
      i === 0 ? '<w:tblHeader/>' : ''));
      const S = await printDoc(X.P('x') + X.tbl(rows, 2));
      const t = tableOf(S);
      assert.ok(tableFrags(S.Pl, t).length > 20);
      assert.ok(tableFrags(S.Pl, t).filter(({f}) => f.from).length > 10);
      assert.deepEqual(misplaced(S, t), []);
    });

  it('line spacing 1.15 (heights not dyadic): every line', async () => {
    const rows = Array.from({length: 20}, (_, i) => X.tr([
      X.tc(X.paras(4 + i % 9, 'c' + i, SP115)),
      X.tc(X.paras(1 + i % 3, 'd' + i, SP115))]));
    const S = await printDoc(X.P('x') + X.tbl(rows, 2));
    assert.deepEqual(misplaced(S, tableOf(S)), []);
  });

  it('random tables (30 seeds): every line on its page', async () => {
    let cuts = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const R = rng(seed), pick = (n) => Math.floor(R() * n);
      const cols = 1 + pick(3);
      const rows = Array.from({length: 4 + pick(20)}, (_, i) => X.tr(
        Array.from({length: cols}, (_, c) => X.tc(X.paras(1 + pick(14),
          `s${seed}r${i}c${c}_`, R() < 0.5 ? SP115 : ''), '',
        Math.floor(9000 / cols)))));
      const S = await printDoc(X.paras(pick(30), 'top') +
        X.tbl(rows, cols, Math.floor(9000 / cols)));
      const t = tableOf(S);
      cuts += tableFrags(S.Pl, t).filter(({f}) => f.cuts).length;
      assert.deepEqual(misplaced(S, t), [], `seed ${seed}`);
    }
    assert.ok(cuts > 20, `${cuts} cuts`);
  });
});

/** The cut rows' first parts: [{i, f, p}] whose box ends past the
 *  frame of page i, and the pages with no border bar at a part's
 *  bottom. */
function cutParts(S, t) {
  const over = [], bare = [];
  for (const {i, f} of tableFrags(S.Pl, t)) {
    if (!f.cuts) continue;
    const p = pieceOf(t, f, f.r1 - 1), fr = S.P.at(i).frames[0];
    const bot = f.dy + p.y + p.h;
    if (bot > fr.y + fr.h + 0.5) over.push([i, bot - fr.y - fr.h]);
    if (!near(bars(painted(S, i)), bot)) bare.push(i);
  }
  return {over, bare};
}

describe('space before in a cut cell (I2)', () => {
  for (const tw of [240, 480]) {
    it(`${tw / 20} pt before each cell paragraph: no line clipped, ` +
      'the cut edge drawn inside the frame', async () => {
      const SB = `<w:spacing w:before="${tw}"/>`;
      const rows = Array.from({length: 30}, (_, i) => X.tr([
        X.tc(X.paras(3, 'a' + i, SB)), X.tc(X.paras(1, 'b' + i, SB))]));
      const S = await printDoc(X.P('x') + X.tbl(rows, 2));
      const t = tableOf(S);
      assert.ok(tableFrags(S.Pl, t).filter(({f}) => f.cuts).length > 3);
      assert.deepEqual(misplaced(S, t), []);
      assert.deepEqual(cutParts(S, t), {over: [], bare: []});
    });
  }

  it('random tables with space before (20 seeds)', async () => {
    let cuts = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const R = rng(seed * 7), pick = (n) => Math.floor(R() * n);
      const sb = () => `<w:spacing w:before="${pick(4) * 120}"/>`;
      const rows = Array.from({length: 4 + pick(16)}, (_, i) => X.tr([
        X.tc(X.paras(1 + pick(12), `q${seed}r${i}a`, sb())),
        X.tc(X.paras(1 + pick(5), `q${seed}r${i}b`, sb()))]));
      const S = await printDoc(X.paras(pick(20), 'top') +
        X.tbl(rows, 2));
      const t = tableOf(S);
      cuts += tableFrags(S.Pl, t).filter(({f}) => f.cuts).length;
      assert.deepEqual(misplaced(S, t), [], `seed ${seed}`);
      assert.deepEqual(cutParts(S, t).over, [], `seed ${seed}`);
    }
    assert.ok(cuts > 10, `${cuts} cuts`);
  });
});
