// Tables across pages (Batch D P4.1, D8): row boundaries are break
// candidates; a row that does not fit is split, each cell column cut
// at its own last line that fits (cuts), unless it is cantSplit (moved
// whole, split when taller than a frame) or exact (never split); the
// leading tblHeader rows repeat at the top of each continuation frame
// (heads) unless they and one row do not fit; a nested table is kept
// whole on one side of a cut (PG11); a keepNext table (PG7) moves
// whole unless taller than a frame. Fake galleys (page-fixtures
// rowTable) and real documents (fake measurer).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {rowFit, headsOf, restH, tableEnd, adjOf, MOVE}
  from '../../tools/moreapps/!Letters/PageRows';
import {cutOrder} from '../../tools/moreapps/!Letters/PageCursor';
import {unitsOf} from '../../tools/moreapps/!Letters/PageCells';
import {loadStyles, rng} from './word-docs.mjs';
import {galley, docLayout} from './page-fixtures.mjs';
import {p, r} from './build-docx.mjs';

before(loadStyles);

const lines = (n, h = 10) => Array(n).fill(h);
const para = (n) => ({lines: lines(n)});
const tbl = (rows, o = {}) => ({kind: 'tbl', rows, ...o});
const run = (spec) => new Pages(galley(spec)).finish();
const starts = (P) => P.list.map((pg) => ({...pg.start}));
const tfrag = (P, i) => P.at(i).frames[0].frags
  .find((f) => f.r0 !== undefined);

/** All pages of G, each starting strictly past the one before. */
function moving(G, cap = 20000) {
  const P = new Pages(G);
  let last = null;
  while (P.more()) {
    const pg = P.list[P.count - 1];
    if (last && !pg.blank && !last.blank) {
      const a = last.start, b = pg.start;
      assert.ok(b.k > a.k || (b.k === a.k && (b.line > a.line ||
        (b.line === a.line && cutOrder(b, a) > 0))),
      `page ${pg.i} moves on: ${JSON.stringify([a, b])}`);
    }
    last = pg;
    assert.ok(P.count <= cap, 'runaway');
  }
  return P;
}

describe('rows across pages', () => {
  it('a 40-row table over 3 pages: pages start at rows', () => {
    const P = run({items: [para(1), tbl(Array(40).fill([[7]]))]});
    assert.equal(P.count, 3);
    assert.deepEqual(starts(P), [{k: 0, line: 0}, {k: 1, line: 12},
      {k: 1, line: 26}]);
    assert.deepEqual(P.at(1).end, {k: 1, line: 26});
    const f = tfrag(P, 1), it = P.G.items[1];
    assert.deepEqual([f.r0, f.r1, f.cuts, f.from, f.heads],
      [12, 26, undefined, undefined, undefined]);
    // (row 12 at the frame's top)
    assert.equal(f.y + it.rows[12].ry, P.at(1).bodyTop);
    assert.deepEqual([tfrag(P, 0).r0, tfrag(P, 0).r1], [0, 12]);
    assert.deepEqual([tfrag(P, 2).r0, tfrag(P, 2).r1], [26, 40]);
  });

  it('a tall row split with per-cell cuts: cell 0 cut at line 7, ' +
    'cell 1 fits whole', () => {
    const G = galley({items: [para(3),
      tbl([[lines(12), lines(3)], [[10]]])]});
    const it = G.items[1];
    assert.deepEqual(rowFit(it, 0, 70), {whole: false, cuts: [7, 3]});
    assert.deepEqual(rowFit(it, 0, 120), {whole: true});
    assert.equal(restH(it, 0, [7, 3]), 50);
    assert.equal(restH(it, 0, [12, 3]), 0);
    const P = new Pages(G).finish();
    assert.equal(P.count, 2);
    assert.deepEqual(P.at(0).end, {k: 1, line: 0, cuts: [7, 3]});
    assert.ok(Object.isFrozen(P.at(0).end.cuts));
    const a = tfrag(P, 0), b = tfrag(P, 1);
    assert.deepEqual([a.r0, a.r1, a.cuts, a.from], [0, 1, [7, 3],
      undefined]);
    assert.deepEqual([b.r0, b.r1, b.from, b.cuts], [0, 2, [7, 3],
      undefined]);
    // (the rest of row 0 is 50 px: row 1 just under it)
    assert.equal(b.y + it.rows[1].ry, P.at(1).bodyTop + 50);
    assert.equal(adjOf(it, P.at(1).start, 100), 50 - 120);
  });

  it('a cell with margins: the top margin again on the rest', () => {
    const G = galley({items: [para(3),
      tbl([{cells: [lines(12), lines(3)], mar: {top: 5, bottom: 4}}])]});
    const it = G.items[1];
    assert.deepEqual(rowFit(it, 0, 70).cuts, [6, 3]);
    assert.equal(restH(it, 0, [6, 3]), 5 + 60 + 4);
  });

  it('a cantSplit row moves whole', () => {
    const rows = (o) => [[[10]], {cells: [lines(8)], ...o}, [[10]]];
    let P = run({items: [para(3), tbl(rows({cantSplit: true}))]});
    assert.deepEqual(P.at(1).start, {k: 1, line: 1});
    P = run({items: [para(3), tbl(rows({}))]});
    assert.deepEqual(P.at(1).start, {k: 1, line: 1, cuts: [6]});
  });

  it('a cantSplit row taller than a frame splits', () => {
    const P = run({items: [para(3), tbl([[[10]],
      {cells: [lines(12)], cantSplit: true}, [[10]]])]});
    assert.deepEqual(P.at(1).start, {k: 1, line: 1, cuts: [6]});
    assert.equal(P.count, 2);
  });

  it('an exact row is moved whole, never split; taller than a ' +
    'frame: placed whole (clipped) and the next row goes on', () => {
    const rows = (o) => [[[10]], {cells: [lines(8)], ...o}, [[10]]];
    let P = run({items: [para(5), tbl(rows({exact: 50}))]});
    assert.deepEqual(P.at(1).start, {k: 1, line: 1});
    P = run({items: [para(5), tbl(rows({}))]});
    assert.deepEqual(P.at(1).start, {k: 1, line: 1, cuts: [4]});
    P = run({items: [para(5), tbl(rows({exact: 150}))]});
    assert.deepEqual(starts(P), [{k: 0, line: 0}, {k: 1, line: 1},
      {k: 1, line: 2}]);
  });

  it('2 header rows repeated on each continuation frame', () => {
    const hd = {cells: [[10]], header: true};
    const it0 = tbl([hd, hd, ...Array(40).fill([[10]])]);
    const P = run({items: [it0]});
    assert.equal(headsOf(P.G.items[0], 100), 2);
    assert.deepEqual(starts(P).map((c) => c.line), [0, 10, 18, 26, 34]);
    assert.equal(tfrag(P, 0).heads, undefined);
    for (let i = 1; i < P.count; i++) {
      const f = tfrag(P, i), it = P.G.items[0];
      assert.equal(f.heads, 2, `page ${i}`);
      // (the first body row under the 20 px of header rows)
      assert.equal(f.y + it.rows[f.r0].ry, P.at(i).bodyTop + 20);
    }
  });

  it('header rows and one row taller than a frame: no repeat', () => {
    const hd = {cells: [[30]], header: true};
    const P = run({items: [tbl([hd, hd, ...Array(6).fill([[50]])])]});
    const it = P.G.items[0];
    assert.equal(headsOf(it, 100), 0);
    assert.equal(headsOf(it, 110), 2);
    assert.deepEqual(starts(P).map((c) => c.line), [0, 2, 4, 6]);
    for (let i = 0; i < P.count; i++) {
      assert.equal(tfrag(P, i).heads, undefined);
    }
  });

  it('every row a header row, or none: no repeat', () => {
    const hd = {cells: [[10]], header: true};
    const P = run({items: [tbl(Array(30).fill(hd))]});
    assert.equal(headsOf(P.G.items[0], 100), 0);
    assert.equal(P.count, 3);
  });

  it('a nested table in a split cell is kept whole on one side ' +
    '(PG11)', () => {
    const G = galley({items: [para(4), tbl([[{items: [lines(3),
      {h: 50}, lines(2)]}, [10]]])]});
    const it = G.items[1];
    assert.deepEqual(rowFit(it, 0, 60).cuts, [3, 1]);
    const P = new Pages(G).finish();
    assert.deepEqual(P.at(0).end, {k: 1, line: 0, cuts: [3, 1]});
    assert.equal(restH(it, 0, [3, 1]), 70);
  });

  it('a nested table in a real document: whole on one page', async () => {
    const nested = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/>' +
      '</w:tblGrid>' + Array.from({length: 4}, (_, i) =>
      `<w:tr><w:tc>${p(r('n' + i))}</w:tc></w:tr>`).join('') +
      '</w:tbl>';
    let straddled = 0;
    for (let before = 30; before < 60; before += 3) {
      const cell = Array.from({length: before}, (_, i) =>
        p(r('x' + i))).join('') + nested + p(r('after'));
      const {G} = await docLayout('<w:tbl><w:tblPr/><w:tblGrid>' +
        '<w:gridCol w:w="4000"/></w:tblGrid><w:tr><w:tc>' + cell +
        '</w:tc></w:tr></w:tbl>' + p(r('end')));
      const P = new Pages(G).finish(), it = G.items[0];
      const c = it.rows[0].cells[0], u = unitsOf(c);
      const nt = c.col.items.findIndex((x) => x.kind === 'tbl');
      const ui = nt;                   // (one line per paragraph)
      let on = 0;
      for (const pg of P.list) {
        const f = pg.frames[0].frags.find((x) => x.r0 !== undefined);
        if (!f) continue;
        const lo = f.from ? f.from[0] : 0;
        const hi = f.cuts ? f.cuts[0] : u.tops.length;
        if (lo <= ui && ui < hi) on++;
      }
      assert.equal(on, 1, `before ${before}`);
      const pg0 = P.at(0), top = it.y + c.ry;
      const lim = pg0.y0 + pg0.frameH;
      // (its rows are units: ui..ends[ui] - 1, M2)
      const last = (u.ends[ui] || ui + 1) - 1;
      if (top + u.tops[ui] < lim && top + u.bots[last] > lim) straddled++;
    }
    assert.ok(straddled > 0, 'a case where the nested table crosses');
  });

  it('keepNext table (PG7): kept with the next paragraph; moved ' +
    'whole when it crosses; split when taller than a frame', () => {
    const t = (n, keepNext) => tbl(Array(n).fill([[10]]), {keepNext});
    let P = run({items: [para(5), t(3, true), para(3)]});
    assert.deepEqual(P.at(1).start, {k: 1, line: 0});
    P = run({items: [para(5), t(3, false), para(3)]});
    assert.deepEqual(P.at(1).start, {k: 2, line: 0});
    P = run({items: [para(6), t(6, true), para(1)]});
    assert.deepEqual(P.at(1).start, {k: 1, line: 0});
    P = run({items: [para(6), t(6, false), para(1)]});
    assert.deepEqual(P.at(1).start, {k: 1, line: 4});
    P = run({items: [para(6), t(15, true), para(1)]});
    assert.deepEqual(P.at(1).start, {k: 1, line: 4});
  });

  it('tableEnd: null when the rest fits, MOVE, a row start', () => {
    const G = galley({items: [tbl(Array(5).fill([[10]]))]});
    const it = G.items[0];
    assert.equal(tableEnd(it, 0, null, it.y + 50, 100, false), null);
    assert.deepEqual(tableEnd(it, 0, null, it.y + 25, 100, false),
      {end: {k: 0, line: 2}, bot: it.rows[2].y});
    assert.equal(tableEnd(it, 0, null, it.y + 5, 100, false), MOVE);
    assert.equal(tableEnd(it, 0, null, it.y + 25, 100, true), MOVE);
  });
});

describe('positions in a split table (ofPos)', () => {
  it('a cell paragraph on a later page; a cell line after a cut',
    async () => {
      const rows = Array.from({length: 120}, (_, i) =>
        `<w:tr><w:tc>${p(r('row ' + i))}</w:tc></w:tr>`).join('');
      const long = Array(400).fill('word').join(' ');
      const {L, G} = await docLayout('<w:tbl><w:tblPr/><w:tblGrid>' +
        '<w:gridCol w:w="3000"/></w:tblGrid>' + rows + '<w:tr><w:tc>' +
        p(r(long)) + '</w:tc></w:tr></w:tbl>');
      const P = new Pages(G).finish();
      assert.ok(P.count >= 3, `${P.count}`);
      const byText = (t) => [...L.byId.values()].find((x) =>
        x.kind === 'p' && x.para.text === t);
      for (const i of [0, 40, 80, 119]) {
        const pi = P.ofPos({id: byText('row ' + i).id, off: 0});
        const f = P.at(pi).frames[0].frags[0];
        assert.ok(f.r0 <= i && i < f.r1, `row ${i} on page ${pi}`);
      }
      const big = byText(long), n = big.lines.length;
      const a = P.ofPos({id: big.id, off: 0});
      const b = P.ofPos({id: big.id, off: big.lines[n - 1].from});
      assert.ok(b > a, `${a} ${b}`);
      const end = P.at(b).start;
      assert.equal(end.line, 120);
      assert.ok(end.cuts && end.cuts[0] <= n - 1);
    });
});

/** A random fake table (R). */
function randTable(R) {
  const pick = (n) => Math.floor(R() * n);
  const cols = 1 + pick(4), nh = R() < 0.3 ? 1 + pick(3) : 0;
  const rows = Array.from({length: 1 + pick(30)}, (_, i) => {
    const cells = Array.from({length: cols}, () => (R() < 0.15
      ? {items: [lines(pick(4)), {h: 5 + pick(90)}, lines(pick(3))]}
      : lines(pick(R() < 0.2 ? 25 : 4), 8 + pick(6))));
    const o = {cells, header: i < nh};
    if (R() < 0.1) o.cantSplit = true;
    if (R() < 0.07) o.exact = 5 + pick(160);
    if (R() < 0.05) o.min = 30 + pick(150);
    if (R() < 0.1) o.mar = {top: pick(6), bottom: pick(6)};
    return o;
  });
  return tbl(rows, {keepNext: R() < 0.2});
}

describe('random tables: every cell line on exactly one page', () => {
  it('2000 seeds', () => {
    let cut = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      const R = rng(seed), pick = (n) => Math.floor(R() * n);
      const items = Array.from({length: 1 + pick(8)}, () => (R() < 0.5
        ? randTable(R) : {lines: lines(1 + pick(6)),
          keepNext: R() < 0.2}));
      const G = galley({items, frame: 80 + pick(5) * 20});
      const P = moving(G);
      const shown = new Map();
      for (const pg of P.list) {
        for (const fr of pg.frames) {
          for (const f of fr.frags) {
            if (f.r0 === undefined) continue;
            const it = G.items.find((x) => x.id === f.id);
            for (let rr = f.r0; rr < f.r1; rr++) {
              const row = it.rows[rr];
              const exact = row.geo.trH && row.geo.trH.rule === 'exact';
              if ((f.cuts && rr === f.r1 - 1) || (f.from && rr === f.r0)) {
                assert.ok(!exact, `seed ${seed}: exact row cut`);
                cut++;
              }
              row.cells.forEach((c, ci) => {
                const n = unitsOf(c).tops.length;
                const lo = f.from && rr === f.r0 ? f.from[ci] : 0;
                const hi = f.cuts && rr === f.r1 - 1 ? f.cuts[ci] : n;
                for (let u = lo; u < hi; u++) {
                  const key = `${f.id}/${rr}/${ci}/${u}`;
                  shown.set(key, (shown.get(key) || 0) + 1);
                }
              });
            }
          }
        }
      }
      for (const it of G.items) {
        if (!it.rows) continue;
        it.rows.forEach((row, rr) => row.cells.forEach((c, ci) => {
          for (let u = 0; u < unitsOf(c).tops.length; u++) {
            assert.equal(shown.get(`${it.id}/${rr}/${ci}/${u}`), 1,
              `seed ${seed}: ${it.id} row ${rr} cell ${ci} line ${u}`);
          }
        }));
      }
    }
    assert.ok(cut > 500, `${cut}`);
  });
});

describe('hostile tables', () => {
  it('NaN, Infinity and negative heights, no cells, empty cells: ' +
    'every page moves on', () => {
    for (const bad of [NaN, Infinity, -Infinity, -50, 0, 1e9]) {
      const G = galley({items: [para(2), tbl([[lines(30)],
        [[bad, 10, bad]], {cells: []}, [[]], [lines(3), [bad]],
        {cells: [lines(40)], cantSplit: true}, {cells: [[bad]],
          exact: bad}]), para(2)]});
      const it = G.items[1];
      it.rows[3].h = bad;
      const P = moving(G);
      // (a value not finite: a line a page at worst, never a stall)
      let bound = 6;
      for (const row of it.rows) {
        bound += 1 + row.cells.reduce((n, c) =>
          n + unitsOf(c).tops.length, 0);
      }
      assert.ok(P.done && P.count <= bound, `${bad}: ${P.count}`);
      for (const pg of P.list) {
        assert.ok(Number.isFinite(pg.vShift));
      }
    }
  });
});

describe('63 columns x 500 rows', () => {
  it('paginates in under 100 ms (median of 20)', () => {
    const R = rng(63);
    const rows = Array.from({length: 500}, (_, i) =>
      Array.from({length: 63}, (_, c) => lines(i % 10 === 0 &&
        c % 7 === 0 ? 20 + Math.floor(R() * 60) : 1 + (c % 3), 16)));
    const G = galley({items: [para(3), tbl(rows), para(3)],
      frame: 930});
    const t = [];
    let P;
    for (let k = 0; k < 23; k++) {
      const t0 = performance.now();
      P = new Pages(G).finish();
      for (const pg of P.list) void pg.frames;
      if (k >= 3) t.push(performance.now() - t0);
    }
    t.sort((a, b) => a - b);
    const med = t[t.length >> 1];
    assert.ok(P.count > 20, `${P.count} pages`);
    assert.ok(P.list.some((pg) => pg.start.cuts), 'a row split');
    assert.ok(med < 100, `median ${med.toFixed(1)} ms`);
  });
});

describe('a placed floating table (P12.6, R5)', () => {
  const TF = Object.freeze({horz: 'text', vert: 'text', dist: {t: 0,
    b: 0, l: 0, r: 0}, overlap: true, unknown: false});
  it('never split: placed whole on the page its place falls on, ' +
    'taking no height in the flow (from its flow place: whole on the ' +
    'next page when it would end past the frame)', () => {
    const rows = Array(6).fill([[7]]);
    const P = run({items: [para(1), tbl(rows, {tfloat: TF}), para(1)]});
    assert.equal(P.count, 1, JSON.stringify(starts(P)));
    const f = tfrag(P, 0);
    assert.deepEqual([f.r0, f.r1, f.cuts, f.from, f.float],
      [0, 6, undefined, undefined, true]);
    const fs = P.at(0).frames[0].frags;
    // (the paragraph after it at the table's own place)
    assert.equal(fs[2].y, fs[1].y);
    // placed from its flow place (vertAnchor text) where it would
    // end past the frame: the next page, whole (P12b fix, review
    // M3); placed from the page: on the page its place falls on
    const T = run({items: [para(9), tbl(rows, {tfloat: TF}), para(1)]});
    assert.deepEqual(starts(T).map((c) => c.k), [0, 1]);
    assert.deepEqual([tfrag(T, 1).r0, tfrag(T, 1).r1, tfrag(T, 1).float],
      [0, 6, true]);
    const pg = run({items: [para(9), tbl(rows, {tfloat: {...TF,
      vert: 'page'}}), para(1)]});
    assert.equal(pg.count, 1);
    // in the flow the same table is split
    const Q = run({items: [para(9), tbl(rows), para(1)]});
    assert.ok(Q.count > 1);
    assert.ok(Q.list.some((pg) => pg.start.k === 1 && pg.start.line));
  });
  it('taller than its frame: in the flow, split as before', () => {
    const rows = Array(40).fill([[7]]);
    const a = run({items: [para(1), tbl(rows, {tfloat: TF})]});
    const b = run({items: [para(1), tbl(rows)]});
    assert.deepEqual(starts(a), starts(b));
    assert.equal(tfrag(a, 0).float, undefined);
  });
  it('unknown: in the flow', () => {
    const rows = Array(6).fill([[7]]);
    const a = run({items: [para(9), tbl(rows, {tfloat: {...TF,
      unknown: true}})]});
    const b = run({items: [para(9), tbl(rows)]});
    assert.deepEqual(starts(a), starts(b));
  });
});
