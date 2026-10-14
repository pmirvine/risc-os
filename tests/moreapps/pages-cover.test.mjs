// Coverage of the frame fill (Batch D P2 fix wave, review I1): every
// line of every galley is shown on exactly one page, whole and inside
// its frame, unless it is taller than the frame (then it is cut, and
// the pieces shown cover it). Seeded random fake galleys with space
// before taller than the frame, space before plus a line just over
// it, tall lines and blocks, keep flags, breaks and sections; and the
// review's two cases as plain tests.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {rng} from './word-docs.mjs';
import {galley} from './page-fixtures.mjs';

const EPS = 1e-6;
const TYPES = ['nextPage', 'continuous', 'oddPage', 'evenPage'];

/** A random fake galley spec (seed). */
function specOf(seed) {
  const R = rng(seed), pick = (n) => Math.floor(R() * n);
  const items = Array.from({length: 10 + pick(60)}, () => {
    const x = pick(12);
    if (x === 0) return {kind: 'box', h: 30 + pick(300)};
    if (x === 1) return 0;
    const lines = Array.from({length: 1 + pick(8)},
      () => (pick(20) ? 10 : 10 + pick(150)));
    const o = {lines, before: pick(4) ? 0 : pick(200),
      after: pick(3) ? 0 : pick(20), keepNext: R() < 0.2,
      keepLines: R() < 0.1, widow: R() < 0.85,
      breakBefore: R() < 0.04};
    if (R() < 0.05) o.brPage = [pick(lines.length)];
    if (R() < 0.05) o.sectStart = TYPES[pick(4)];
    return o;
  });
  return {items, frame: 60 + pick(100),
    sections: [{}, {vAlign: 'center'}, {}, {vAlign: 'bottom'}]};
}

/** Where every line (or block) of G is shown on the pages of P:
 *  [{k, j, h, frame, whole: [page], parts: px shown}]. */
function shownOf(G, P) {
  const ix = new Map(G.items.map((it, k) => [it.id, k]));
  const rows = new Map();
  const row = (k, j, h, frame) => {
    const key = k + ':' + j;
    if (!rows.has(key)) {
      rows.set(key, {k, j, h, frame, whole: [], listed: [],
        parts: 0});
    }
    return rows.get(key);
  };
  for (const pg of P.list) {
    for (const fr of pg.frames) {
      const lo = fr.y, hi = fr.y + fr.h;
      for (const f of fr.frags) {
        const k = ix.get(f.id), it = G.items[k];
        const spans = it.lines.length ? [] : [[0, it.h]];
        for (let j = f.l0; j < f.l1; j++) {
          spans.push([it.lines[j].y, it.lines[j].h, j]);
        }
        for (const [y, h, j = -1] of spans) {
          const top = f.y + y, bot = top + h;
          const o = row(k, j, h, fr.h);
          o.listed.push(pg.i);
          o.parts += Math.max(0, Math.min(bot, hi) - Math.max(top, lo));
          if (top >= lo - EPS && bot <= hi + EPS) o.whole.push(pg.i);
        }
      }
    }
  }
  return rows;
}

/** The lines of G not shown as the header says (messages). */
function missing(G, P) {
  const rows = shownOf(G, P), bad = [];
  const frame = P.list.find((pg) => !pg.blank).frameH;
  G.items.forEach((it, k) => {
    const all = it.lines.length ? it.lines.map((l, j) => [j, l.h])
      : [[-1, it.h]];
    for (const [j, h] of all) {
      const o = rows.get(k + ':' + j);
      const f = o ? o.frame : frame;
      if (h <= f) {
        if (!o || o.whole.length !== 1 || o.listed.length !== 1) {
          bad.push(`item ${k} line ${j} h ${h}: whole on ` +
            `${o ? o.whole : '-'}, listed on ${o ? o.listed : '-'}`);
        }
      } else if (!o || o.parts < h - EPS) {
        bad.push(`item ${k} line ${j} h ${h} (tall): ` +
          `${o ? o.parts : 0} px shown`);
      }
    }
  });
  return bad;
}

describe('every line on exactly one page (review I1)', () => {
  it('space before taller than the frame after a page break: ' +
    'dropped, and every line shown', () => {
    const G = galley({frame: 100, items: [{lines: [10], brPage: [0]},
      {lines: [10, 10, 10], before: 150}, 10]});
    const P = new Pages(G).finish();
    assert.deepEqual(missing(G, P), []);
    const pg = P.at(1);
    assert.equal(pg.y0, G.items[1].y + 150);
    assert.deepEqual(pg.start, {k: 1, line: 0});
    assert.equal(pg.why, 'end');
    assert.equal(P.count, 2);
  });

  it('space before plus the first line just over the frame: the ' +
    'space is dropped, the line is not sliced', () => {
    const G = galley({frame: 100, items: [{lines: [10], brPage: [0]},
      {lines: [10, 10], before: 93}, 10]});
    const P = new Pages(G).finish();
    assert.deepEqual(missing(G, P), []);
    assert.equal(P.at(1).why, 'end');
    assert.equal(P.at(1).y0, G.items[1].y + 93);
    assert.ok(P.list.every((pg) => !pg.end.dy), 'no cut');
  });

  it('a line taller than the frame after a tall space before is ' +
    'cut from its own top', () => {
    const G = galley({frame: 100, items: [{lines: [250], before: 120}]});
    const P = new Pages(G).finish();
    assert.deepEqual(missing(G, P), []);
    assert.equal(P.at(0).y0, G.items[0].y + 120);
    assert.deepEqual(P.at(0).end, {k: 0, line: 0, dy: 100});
    assert.deepEqual(P.at(1).end, {k: 0, line: 0, dy: 200});
    assert.equal(P.count, 3);
  });

  it('3000 random galleys: nothing lost, nothing shown twice', () => {
    let lines = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      const G = galley(specOf(seed));
      const P = new Pages(G).finish();
      const bad = missing(G, P);
      assert.deepEqual(bad.slice(0, 3), [], 'seed ' + seed);
      lines += G.items.reduce((a, it) => a + it.lines.length, 0);
    }
    assert.ok(lines > 300000, 'lines ' + lines);
  });
});
