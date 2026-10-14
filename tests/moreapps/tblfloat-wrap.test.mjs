// Floating tables and the wrap settle (Batch D P12b fix wave): a
// text-anchored table whose place depends on the lines above it
// settles without the page falling back to no wrap (C1); tables and
// pictures together: edited == fresh (I1). Letter page, 1 in
// margins: text 96..720 x 96..960 px.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {p, r} from './build-docx.mjs';
import {loadStyles} from './word-docs.mjs';
import {M, docOf, settle, pageLines, text, sigOf, pathOf, anchorRun,
  off, al, rng as rngOf, ftbl, tblUnder, falls} from './wrap-fixtures.mjs';

before(loadStyles);

describe('C1: a text-anchored table above its flow place', () => {
  const body = (y) => p(r(text(6))) + ftbl({horzAnchor: 'margin',
    vertAnchor: 'text', tblpXSpec: 'left', tblpY: y,
    rightFromText: 180}, {n: 3, w: 3000}) + p(r(text(6)));

  it('tblpY -150: the page keeps its wrap, both paragraphs\' lines ' +
    'beside the table are right of it', async () => {
    const {L, P} = settle(await docOf(body(-150)));
    const [F] = P.floatsOf(P.at(0)).filter((f) => f.tbl);
    assert.ok(F, 'placed');
    assert.equal(falls(L), 0, 'no page falls');
    assert.deepEqual(tblUnder(L, P), []);
    const beside = pageLines(L, P, 0).filter((l) => l.y1 > F.y + 0.5 &&
      l.y0 < F.y + F.h - 0.5);
    assert.ok(beside.length >= 2, `${beside.length} beside`);
    for (const l of beside) {
      assert.ok(l.x0 >= F.x + F.w + 12 - 0.01, `x ${l.x0}`);
    }
    assert.ok(new Set(beside.map((l) => l.id)).size === 2,
      'lines of both paragraphs beside it');
    assert.equal(M.wrapPass(L, P), null);
  });

  it('sweep tblpY -3000..3000 step 30: no page loses its wrap, no ' +
    'line under the table', async () => {
    const bad = [];
    for (let y = -3000; y <= 3000; y += 30) {
      const {L, P} = settle(await docOf(body(y)));
      const u = tblUnder(L, P).length, f = falls(L);
      if (u || f) bad.push(`${y}: ${f} fall, ${u} under`);
    }
    assert.deepEqual(bad, []);
  });
});

// I1: a seeded fuzz of floating tables and pictures (the reviewer's
// zz-fuzz): 10 to 40 paragraphs, 30% with a floating table before
// them (random anchors, specs, offsets, fromText, never, 1 to 6
// rows), 30% with a square picture; 6 edits a seed (typing in a cell,
// typing or deleting in a paragraph), each settled from the layout
// before and compared with a fresh settle.
const pick = (R, xs) => xs[Math.floor(R() * xs.length)];
const MAX_SETTLE = 64;
const words = (n) => text(2).split(' ').slice(0, n).join(' ');

function fuzzTbl(R) {
  const a = {};
  a.horzAnchor = pick(R, ['text', 'margin', 'page', undefined]);
  a.vertAnchor = pick(R, ['text', 'margin', 'page', undefined]);
  if (R() < 0.5) {
    a.tblpXSpec = pick(R, ['left', 'center', 'right', 'inside',
      'outside']);
  } else a.tblpX = Math.round(R() * 12000 - 1500);
  if (R() < 0.3) {
    a.tblpYSpec = pick(R, ['inline', 'top', 'center', 'bottom',
      'inside', 'outside']);
  } else a.tblpY = Math.round(R() * 8000 - 500);
  for (const k of ['leftFromText', 'rightFromText', 'topFromText',
    'bottomFromText']) {
    if (R() < 0.6) a[k] = Math.round(R() * 400);
  }
  for (const k of Object.keys(a)) if (a[k] === undefined) delete a[k];
  const w = Math.round(1000 + R() * 7000), n = 1 + Math.floor(R() * 6);
  const more = R() < 0.3 ? '<w:tblOverlap w:val="never"/>' : '';
  return ftbl(a, {w, n, more, t: () => words(1 + Math.floor(R() * 12))});
}

/** A seeded body (tables: false leaves the tables out, drawing the
 *  same numbers, so the pictures are those of the body with them). */
function fuzzBody(R, tables = true) {
  let b = '', id = 1;
  const n = 10 + Math.floor(R() * 30);
  for (let i = 0; i < n; i++) {
    if (R() < 0.3) {
      const t = fuzzTbl(R);
      if (tables) b += t;
    }
    let runs = '';
    if (R() < 0.3) {
      runs += anchorRun({id: id++, w: 20 + R() * 300, ht: 10 + R() * 300,
        h: pick(R, [['margin', al(pick(R, ['left', 'right']))],
          ['column', off(R() * 500)]]),
        v: pick(R, [['paragraph', off(R() * 200)],
          ['page', off(R() * 1000)]])});
    }
    b += p(runs + r(text(Math.floor(R() * 4)) + ' ' +
      words(Math.floor(R() * 14))));
  }
  return b;
}

/** Every float on every page: id, x, y. */
const fsig = (P) => Array.from({length: P.count}, (_, i) =>
  P.floatsOf(P.at(i)).map((f) => [f.tbl || f.id, Math.round(f.x),
    Math.round(f.y)].join(':')).join(' '));

/** Seeds a..b: {bad: edited != fresh, fell: pages laid out ignoring
 *  wrap, slow: settles of MAX_SETTLE passes or more (the wrap's
 *  guard, 64 a page and one, is never reached)} as text. */
async function fuzz(a, b, tables = true) {
  const bad = [], fell = [], slow = [];
  for (let seed = a; seed <= b; seed++) {
    const R = rngOf(seed * 104729);
    const d = new M.Document(await docOf(fuzzBody(R, tables)));
    let {L, P, n} = settle(d.doc);
    if (falls(L)) fell.push(`${seed} open`);
    if (n >= MAX_SETTLE) slow.push(`${seed} open: ${n}`);
    for (let e = 0; e < 6; e++) {
      const blocks = d.doc.sections[0].blocks;
      const ti = blocks.map((x, i) => [x, i]).filter(([x]) =>
        x.type === 'tbl');
      let at, del = 0, ins = words(1 + Math.floor(R() * 16)) + ' ';
      if (ti.length && R() < 0.5) {
        const [x, i] = pick(R, ti);
        at = [0, i, Math.floor(R() * x.rows.length), 0, 0];
      } else {
        const ps = L.items.filter((x) => x.kind === 'p');
        at = pathOf(d.doc, pick(R, ps).id);
        if (R() < 0.3) {
          del = 1;
          ins = '';
        }
      }
      d.apply({op: 'replaceText', block: at, at: 0, del, ins});
      ({L, P, n} = settle(d.doc, {L, P}));
      if (n >= MAX_SETTLE) slow.push(`${seed} edit ${e}: ${n}`);
      const fr = settle(d.doc);
      if (JSON.stringify([sigOf(L, P), fsig(P)]) !==
        JSON.stringify([sigOf(fr.L, fr.P), fsig(fr.P)])) {
        bad.push(`${seed} edit ${e}`);
        break;
      }
      if (falls(L)) fell.push(`${seed} edit ${e}`);
    }
  }
  return {bad, fell, slow};
}

describe('I1: floating tables and pictures, edited == fresh', () => {
  for (let s = 1; s <= 200; s += 50) {
    it(`seeds ${s}..${s + 49}: edited == fresh, no page falls, ` +
    'every settle under 64 passes',
      async () => {
        const {bad, fell, slow} = await fuzz(s, s + 49);
        assert.deepEqual(bad, [], 'edited != fresh');
        assert.deepEqual(fell, [], 'pages laid out ignoring wrap');
        assert.deepEqual(slow, [], 'settles of 64 passes or more');
      });
  }

  it('pictures only (the same seeds without the tables): seed 20 ' +
    '(edited != fresh), 58 (a page fell: a paragraph cut at the page ' +
    'end in some passes, whole in others, is kept whole)', async () => {
    for (const seed of [20, 58]) {
      const {bad, fell} = await fuzz(seed, seed, false);
      assert.deepEqual(bad, [], `${seed}`);
      assert.deepEqual(fell, [], `${seed}`);
    }
  });
});
