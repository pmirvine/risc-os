// A table split across pages, painted (Batch D P4.2, D8): the rows
// of a page's table fragment (./TblPagePaint, ./TblPieces), the
// repeated header rows at the frame's top (drawn from the same row
// layout), a row cut across pages drawn in parts: shading and
// borders on each, the cut edge drawn as the row's bottom border on
// the first part and its top border on the next (PG9), each cell's
// content top-aligned (PG8: a vAlign center cell too) and shown
// once; the rest of a cut row at the frame's top under the heads.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {loadStyles} from './word-docs.mjs';
import {splitTable, tableFrags, cellItem, painted, bars, near}
  from './tblpage-fixture.mjs';
import {piecesOf, pieceOf} from '../../tools/moreapps/!Letters/TblPieces';

before(loadStyles);

describe('TblPagePaint (P4.2, D8)', () => {
  let S;
  before(async () => {
    S = await splitTable({rows: 40, tall: 120, centre: true});
  });

  it('the fixture: a row cut over three pages, heads on the rest',
    () => {
      const fs = tableFrags(S.Pl, S.t);
      assert.ok(fs.length >= 3, `${fs.length} frags`);
      assert.ok(fs[0].f.cuts && !fs[0].f.from);
      assert.ok(fs[1].f.from && fs[1].f.cuts && fs[1].f.heads === 1);
      assert.ok(fs[2].f.from && !fs[2].f.cuts && fs[2].f.heads === 1);
    });

  it('the cut row\'s bottom edge on part 1, its top edge on part 2 ' +
    '(PG9)', () => {
    const fs = tableFrags(S.Pl, S.t), r = S.tallRow;
    const [a, b] = fs, pa = pieceOf(S.t, a.f, r), pb = pieceOf(S.t, b.f, r);
    const fr = S.P.at(a.i).frames[0];
    const ya = a.f.dy + pa.y + pa.h, yb = b.f.dy + pb.y;
    assert.ok(ya <= fr.y + fr.h + 1, `${ya} in the frame`);
    assert.ok(near(bars(painted(S, a.i)), ya), `part 1 bottom ${ya}`);
    const gb = painted(S, b.i);
    assert.ok(near(bars(gb), yb), `part 2 top ${yb}`);
    assert.ok(near(bars(gb), b.f.dy + pb.y + pb.h), 'part 2 bottom');
    const c = fs[2], pc = pieceOf(S.t, c.f, r);
    assert.ok(near(bars(painted(S, c.i)), c.f.dy + pc.y), 'part 3 top');
  });

  it('heads at the frame\'s top of every continuation page; the ' +
    'rest of the cut row under them', () => {
    const fs = tableFrags(S.Pl, S.t), row0 = S.t.rows[0];
    for (const {i, f} of fs.slice(1)) {
      const fr = S.P.at(i).frames[0], g = painted(S, i);
      const h = g.texts.filter((x) => x[0] === 'H0');
      assert.equal(h.length, 1, `page ${i}: ${JSON.stringify(h)}`);
      assert.ok(h[0][2] > fr.y && h[0][2] < fr.y + row0.h + 1,
        `page ${i} H0 at ${h[0][2]}`);
      const [p0] = piecesOf(S.t, f);
      // (dy whole px: the galley's fraction stays)
      assert.ok(p0.rep && Math.abs(f.dy + p0.y - fr.y) <= 0.5 + 1e-9);
    }
    const {i, f} = fs[1], fr = S.P.at(i).frames[0];
    const first = 't' + f.from[0];
    const g = painted(S, i), t = g.texts.find((x) => x[0] === first);
    assert.ok(t && t[2] > fr.y + row0.h && t[2] < fr.y + 2 * row0.h + 1,
      `${first} under the heads: ${t && t[2]}`);
  });

  it('every line of the cut cell is drawn once, on one page', () => {
    const seen = new Map();
    for (let i = 0; i < S.P.count; i++) {
      for (const [s] of painted(S, i).texts) {
        if (/^t\d+$/.test(s)) seen.set(s, (seen.get(s) || 0) + 1);
      }
    }
    for (let j = 0; j < 120; j++) assert.equal(seen.get('t' + j), 1, 't' + j);
  });

  it('a vAlign center cell is drawn top-aligned on a split page (PG8)',
    () => {
      const [{i, f}] = tableFrags(S.Pl, S.t), r = S.tallRow;
      const p = pieceOf(S.t, f, r), mid = cellItem(S.L, 'mid');
      const c = S.t.rows[r].cells[1];
      assert.ok(c.dy > 100, `centred in the galley: ${c.dy}`);
      const t = painted(S, i).texts.find((x) => x[0] === 'mid');
      const top = f.dy + p.y;
      assert.ok(t && t[2] > top && t[2] < top + mid.lines[0].h + 1,
        `mid at ${t && t[2]}, the part's top ${top}`);
    });

  it('the rows after the cut row follow its rest', () => {
    const fs = tableFrags(S.Pl, S.t), {i, f} = fs[2], r = S.tallRow;
    const p = pieceOf(S.t, f, r), q = pieceOf(S.t, f, r + 1);
    assert.ok(Math.abs(q.y - (p.y + p.h)) < 1e-6);
    assert.equal(q.sh, 0);
    const name = 'r' + (r + 1 - 1) + 'a';
    const t = painted(S, i).texts.find((x) => x[0] === name);
    assert.ok(t && t[2] > f.dy + q.y && t[2] < f.dy + q.y + q.h + 1,
      `${name}: ${t && t[2]}`);
  });

  it('hostile frags: no rows, rows past the end, NaN', () => {
    for (const f of [{r0: 0, r1: 0}, {r0: 5, r1: 2}, {r0: NaN, r1: NaN},
      {r0: -3, r1: 1e9, heads: 1e9}, {r0: 1, r1: 3, from: [1e9, -1],
        cuts: [NaN]}]) {
      const ps = piecesOf(S.t, f);
      assert.ok(Array.isArray(ps));
      for (const p of ps) assert.ok(Number.isFinite(p.y + p.h), JSON.stringify(f));
    }
  });
});
