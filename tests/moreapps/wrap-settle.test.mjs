// Text wrap settles (Batch D P12a fix wave, C1): a band that only
// touches an exclusion does not meet it and each line is tried at its
// own height (a); the passes settle a page at a time from the same
// start whatever the edits before (passes counted per page, started
// again only when the page's content changes), so k floats on a page
// need not k passes over the document (b); a page that does not
// settle is laid out ignoring wrap (c). Edited == fresh.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {p, r} from './build-docx.mjs';
import {loadStyles, tm} from './word-docs.mjs';
import {M, off, al, anchorRun, inlineRun, docOf, settle, sigOf,
  overlaps, windowOf, text, pathOf, rng as rngOf} from './wrap-fixtures.mjs';

before(loadStyles);

const {exclusionsOf, shapeFor} = M;
const SZ = (hp) => `<w:sz w:val="${hp}"/>`;

describe('C1(a): band edges and line heights', () => {
  it('a band that only touches an exclusion does not meet it ' +
    '(0.01 px)', () => {
    const e = exclusionsOf([{x: 0, y: 100, w: 96, h: 48,
      wrap: {kind: 'square', text: 'bothSides',
        dist: {t: 0, b: 0, l: 0, r: 0}}}]);
    const s = shapeFor(e, 0, 0);
    assert.deepEqual(s(80, 20, 0, 600), [0, 600]);       // touches top
    assert.deepEqual(s(80, 20.005, 0, 600), [0, 600]);   // within 0.01
    assert.deepEqual(s(80, 20.02, 0, 600), [96, 600]);
    assert.deepEqual(s(148, 10, 0, 600), [0, 600]);      // its bottom
    assert.deepEqual(s(147.98, 10, 0, 600), [96, 600]);
    assert.ok(Number.isNaN(s.next(80, 20)));
    assert.equal(s.next(80, 30), 148);
  });

  it('a line taller than the first font (an inline picture) is tried ' +
    'at its own height: it does not reach under the float', async () => {
    // line 0 "intro" (y 0..18), line 1 a 60 px picture; the float's
    // band starts at paragraph y 40: only the tall line meets it
    const {L} = settle(await docOf(p(anchorRun({v: ['paragraph',
      off(40)]}) + r('intro') + '<w:r><w:br/></w:r>' +
      inlineRun(60, 60) + r(' after ' + text(2)))));
    const ls = L.items[0].lines;
    const tall = ls.find((ln) => ln.items.some((x) => x.kind === 'pic'));
    assert.ok(tall.h > 50, `h ${tall.h}`);
    assert.ok(tall.y < 40, `y ${tall.y}`);
    assert.equal(tall.x, 96 + 12, `x ${tall.x}`);
    assert.equal(ls[0].x, 0);
  });

  it('a line shorter than the first font is tried at its own height: ' +
    'a band below it does not move or narrow it', async () => {
    // a 72 pt first line, then two small lines; the float's band
    // starts 4 px below the small second line's bottom: only the
    // third line meets it
    const BR = '<w:r><w:br/></w:r>';
    const runs = (more) => r('BIG', SZ(144)) + BR +
      r('small') + BR + r('more ' + text(1)) + more;
    const L0 = settle(await docOf(p(runs('')))).L;
    const l1 = L0.items[0].lines[1], below = l1.y + l1.h + 4;
    const {L} = settle(await docOf(p(runs(anchorRun({v: ['paragraph',
      off(below)]})))));
    const ls = L.items[0].lines;
    assert.equal(ls[1].x, 0);
    assert.equal(Math.round(ls[1].y), Math.round(l1.y));
    assert.equal(ls[2].x, 96 + 12);
  });
});

/** k alternating 200 px wide floats (ht high) a page: one at the top
 *  of each paragraph, margin left / right in turn. */
const grid = (k, ht, para, pages = 3) => {
  let body = '';
  for (let i = 0; i < k * pages; i++) {
    body += p(anchorRun({id: i + 1, ht, w: 200,
      h: ['margin', al(i % 2 ? 'right' : 'left')]}) + r(text(para)));
  }
  return docOf(body);
};

describe('C1(b): pages settle', () => {
  for (const [k, ht, para] of [[3, 150, 3], [6, 150, 3], [6, 100, 2],
    [8, 80, 2], [10, 60, 1]]) {
    it(`${k} alternating floats ${ht} px high a page: no line under ` +
      'a float, settled, edited == fresh', async () => {
      const doc = await grid(k, ht, para);
      const {L, P, n} = settle(doc);
      assert.deepEqual(overlaps(L, P), []);
      assert.equal(M.wrapPass(L, P), null);
      assert.ok(n <= 4 * P.count, `${n} passes, ${P.count} pages`);
      const d = new M.Document(doc);
      d.apply({op: 'replaceText', block: [0, 0], at: 0, del: 0,
        ins: 'hello world '});
      const ed = settle(d.doc, {L, P});
      const fr = settle(d.doc);
      assert.deepEqual(sigOf(ed.L, ed.P), sigOf(fr.L, fr.P));
      assert.deepEqual(overlaps(ed.L, ed.P), []);
    });
  }

  it('6 alternating floats and two plain paragraphs each: edited == ' +
    'fresh (review zz-e2)', async () => {
    let body = '';
    for (let k = 0; k < 6; k++) {
      body += p(anchorRun({id: k + 1, ht: 150, w: 200,
        h: ['margin', al(k % 2 ? 'right' : 'left')]}) + r(text(3))) +
        p(r(text(4))) + p(r(text(4)));
    }
    const d = new M.Document(await docOf(body));
    let {L, P} = settle(d.doc);
    d.apply({op: 'replaceText', block: [0, 0], at: 0, del: 0,
      ins: 'hello world '});
    ({L, P} = settle(d.doc, {L, P}));
    const fr = settle(d.doc);
    assert.deepEqual(sigOf(L, P), sigOf(fr.L, fr.P));
    assert.deepEqual(overlaps(L, P), []);
  });

  it('2,000 paragraphs each with a float settle in under 1 s ' +
    '(WORD_PERF=1) with no line under a float', async (t) => {
    let body = '';
    for (let i = 0; i < 2000; i++) {
      body += p(anchorRun({id: i + 1, w: 150, ht: 100,
        h: ['margin', al(i % 2 ? 'right' : 'left')]}) + r(text(2)));
    }
    const doc = await docOf(body);
    settle(await grid(3, 150, 3));     // (warm up)
    // the passes counted, which no load changes: the same in every
    // run, at most 4 a page (final fix B, review 3 M32); the time is
    // the best of five, stopping at the first under 1 s, printed
    // always and asserted with WORD_PERF=1 (a quiet machine: under
    // six parallel copies of the timing files it took 1.7-1.9 s)
    let ms = Infinity, L, P, n;
    const ns = [];
    for (let k = 0; k < 5 && ms >= 1000; k++) {
      const t0 = performance.now();
      ({L, P, n} = settle(doc));
      ms = Math.min(ms, performance.now() - t0);
      ns.push(n);
    }
    t.diagnostic(`${n} passes, ${P.count} pages, ${ms.toFixed(0)} ms`);
    assert.deepEqual(overlaps(L, P), []);
    assert.ok(ns.every((x) => x === ns[0]), `passes ${ns}`);
    assert.ok(n <= 4 * P.count, `${n} passes for ${P.count} pages`);
    if (process.env.WORD_PERF) assert.ok(ms < 1000, `${ms.toFixed(0)} ms`);
  });
});

const CORPUS = 'tests/moreapps/corpus/open-xml-sdk/v2FxTestFiles/' +
  'wordprocessing/hyperlink/632399964516872542 1.docx';

describe('C1: the corpus file with 16 top-and-bottom charts', () => {
  const skip = !fs.existsSync(CORPUS) && 'no corpus';

  it('settles with no line under a chart', {skip}, async () => {
    const doc = await M.readDocx(new Uint8Array(fs.readFileSync(CORPUS)));
    const {L, P} = settle(doc);
    assert.deepEqual(overlaps(L, P).map((o) => [o.page, o.id]), []);
    assert.equal(M.wrapPass(L, P), null);
  });

  it('a keystroke on page 18 takes at most 15 ms (median of 20), ' +
    'and the window ends with no line under a chart', {skip},
  async (t) => {
    const d = new M.Document(await M.readDocx(new Uint8Array(
      fs.readFileSync(CORPUS))));
    const {L, P} = settle(d.doc);
    const it0 = L.items.find((x) => x.kind === 'p' &&
      P.ofPos({id: x.id, off: 0}) === 18);
    const dw = windowOf(d, {id: it0.id, off: 0});
    dw.frames(1e6);
    const at = pathOf(d.doc, it0.id);
    // the least of up to three medians (final fix B, review 3 M32:
    // robust under the parallel unit run), stopping at one <= 15 ms
    let med = Infinity;
    for (let a = 0; a < 3 && med > 15; a++) {
      const times = [];
      for (let n = 0; n < 23; n++) {
        const t0 = performance.now();
        d.apply({op: 'replaceText', block: at, at: 0, del: 0,
          ins: 'x'});
        dw.newLayout(dw.L.metrics, dw.L);
        times.push(performance.now() - t0);
        dw.frames(1e6);
        assert.deepEqual(overlaps(dw.L, dw.pages).map((o) => o.page),
          [], `keystroke ${n}`);
      }
      const m = times.slice(3).sort((x, y) => x - y)[10];
      t.diagnostic(`keystroke median ${m.toFixed(2)} ms (attempt ` +
        `${a + 1})`);
      med = Math.min(med, m);
    }
    assert.ok(med <= 15, `median ${med.toFixed(2)} ms`);
  });
});

describe('C1(c): a page that does not settle', () => {
  // (lineshape.test's fixture: the last paragraph fits on page 1
  // unwrapped; beside the wide float at the page bottom it does not,
  // and on page 2 it is unwrapped again: the page's end moves back
  // and forth)
  const pg32 = () => p(anchorRun({w: 500, ht: 40, h: ['margin',
    al('left')], v: ['page', off(960 - 40)]}) + r('anchor')) +
    Array.from({length: 43}, () => p(r('line'))).join('') +
    p(r(text(2)), '<w:keepLines/>');

  it('whose end moves keeps the end it settled with (the paragraph on ' +
    'the next page, as Word keeps a page), the same from any start',
  async () => {
    const d = new M.Document(await docOf(pg32()));
    let {L, P} = settle(d.doc);
    const x = L.items[L.items.length - 1];
    assert.equal(P.ofPos({id: x.id, off: 0}), 1);
    assert.deepEqual(overlaps(L, P), []);
    assert.equal(M.wrapPass(L, P), null);
    for (let k = 0; k < 4; k++) {
      d.apply({op: 'replaceText', block: [0, 0], at: 1, del: 0,
        ins: 'x'});
      ({L, P} = settle(d.doc, {L, P}));
      const fr = settle(d.doc);
      assert.deepEqual(sigOf(L, P), sigOf(fr.L, fr.P), `edit ${k}`);
      assert.deepEqual(overlaps(L, P), []);
    }
  });

  it('that never settles is laid out ignoring wrap after MAX_PASSES ' +
    'passes, the same from any start', async () => {
    // the float of the second paragraph, 30 px up into the first,
    // leaves no room beside it: the first one's line moves below it,
    // which moves the second paragraph and its float down as far
    const body = p(r('short')) + p(anchorRun({w: 600, ht: 40,
      v: ['paragraph', off(-30)]}) + r('next')) + p(r(text(1)));
    const d = new M.Document(await docOf(body));
    let {L, P, n} = settle(d.doc);
    assert.ok(n <= M.MAX_PASSES + 4, `${n} passes`);
    assert.equal(M.wrapPass(L, P), null);
    assert.ok(!L.wrap.keys.has(L.items[0].id));
    assert.equal(L.items[0].lines[0].y, 0);
    for (let k = 0; k < 3; k++) {
      d.apply({op: 'replaceText', block: [0, 2], at: 0, del: 0,
        ins: 'more '});
      ({L, P} = settle(d.doc, {L, P}));
      const fr = settle(d.doc);
      assert.deepEqual(sigOf(L, P), sigOf(fr.L, fr.P), `edit ${k}`);
    }
  });
});

const WRAPS = [
  '<wp:wrapSquare wrapText="bothSides"/>',
  '<wp:wrapSquare wrapText="left"/>',
  '<wp:wrapSquare wrapText="right"/>',
  '<wp:wrapSquare wrapText="largest"/>',
  '<wp:wrapTopAndBottom/>',
  '<wp:wrapTight wrapText="bothSides"><wp:wrapPolygon edited="0">' +
    '<wp:start x="0" y="0"/><wp:lineTo x="21600" y="0"/>' +
    '<wp:lineTo x="0" y="21600"/><wp:lineTo x="0" y="0"/>' +
    '</wp:wrapPolygon></wp:wrapTight>',
  '<wp:wrapNone/>'];
const pick = (R, xs) => xs[Math.floor(R() * xs.length)];
const words = (R, n) => text(1).split(' ').concat(text(1).split(' '))
  .slice(0, n).join(' ');

/** A seeded document of floats (hostile places and sizes too). */
function fuzzBody(R) {
  const n = 10 + Math.floor(R() * 24);
  let body = '', id = 1;
  for (let i = 0; i < n; i++) {
    let runs = '';
    const nf = R() < 0.45 ? 1 + Math.floor(R() * 2) : 0;
    for (let f = 0; f < nf; f++) {
      runs += anchorRun({id: id++, w: 20 + R() * 460, ht: 10 + R() *
        (R() < 0.05 ? 1400 : 380), wrap: pick(R, WRAPS),
      behind: R() < 0.1,
      h: pick(R, [['margin', al(pick(R, ['left', 'right', 'center']))],
        ['column', off(R() * 560)], ['page', off(R() * 760 - 40)]]),
      v: pick(R, [['paragraph', off(R() * 240 - 40)],
        ['page', off(R() * 1150 - 40)], ['line', off(R() * 30)],
        ['margin', al(pick(R, ['top', 'bottom', 'center']))]])});
    }
    const pPr = R() < 0.08 ? '<w:keepLines/>' : R() < 0.04
      ? '<w:pageBreakBefore/>' : '';
    body += p(runs + r(text(Math.floor(R() * 4)) + ' ' +
      words(R, Math.floor(R() * 18))), pPr);
  }
  return body;
}

describe('C1: seeded hostile fuzz (edited == fresh)', () => {
  for (let seed = 1; seed <= 10; seed++) {
    it(`seed ${seed}`, async () => {
      const R = rngOf(seed * 7919);
      const d = new M.Document(await docOf(fuzzBody(R)));
      let {L, P} = settle(d.doc);
      assert.equal(M.wrapPass(L, P), null);
      for (let e = 0; e < 5; e++) {
        const ps = L.items.filter((x) => x.kind === 'p');
        const it = pick(R, ps), at = pathOf(d.doc, it.id);
        const end = it.lines[it.lines.length - 1].to;
        const del = R() < 0.4 ? Math.min(end, 1 + Math.floor(R() * 30))
          : 0;
        d.apply({op: 'replaceText', block: at, at: 0, del,
          ins: del ? '' : words(R, 1 + Math.floor(R() * 16)) + ' '});
        let n;
        ({L, P, n} = settle(d.doc, {L, P}));
        const fr = settle(d.doc);
        assert.deepEqual(sigOf(L, P), sigOf(fr.L, fr.P),
          `seed ${seed} edit ${e}`);
        assert.ok(n <= 64 * (P.count + 1), `${n} passes`);
      }
    });
  }
});

describe('I1: the PG32 page is the same after any keystroke', () => {
  it('20 keystrokes elsewhere leave the same layout (no paragraph ' +
    'moving between pages, no line under the float)', async () => {
    const body = p(anchorRun({w: 500, ht: 40, h: ['margin',
      al('left')], v: ['page', off(960 - 40)]}) + r('anchor')) +
      Array.from({length: 43}, () => p(r('line'))).join('') +
      p(r(text(2)), '<w:keepLines/>');
    const d = new M.Document(await docOf(body));
    let {L, P} = settle(d.doc);
    const rest = (X, Q) => sigOf(X, Q).slice(1);
    const first = rest(L, P), count = P.count;
    assert.deepEqual(overlaps(L, P), []);
    for (let k = 0; k < 20; k++) {
      d.apply({op: 'replaceText', block: [0, 0], at: 1, del: 0,
        ins: 'x'});
      ({L, P} = settle(d.doc, {L, P}));
      assert.deepEqual(rest(L, P), first, `keystroke ${k}`);
      assert.equal(P.count, count);
      assert.deepEqual(overlaps(L, P), [], `keystroke ${k}`);
    }
  });
});

describe('M1, M2: tall floats and what a key holds', () => {
  it('M1: a top-and-bottom float taller than the page: a few passes ' +
    'and pages, only its anchor\'s own line under it', async () => {
    const body = p(r('intro')) + p(anchorRun({w: 400, ht: 2000,
      wrap: '<wp:wrapTopAndBottom/>'}) + r(text(3))) +
      Array.from({length: 20}, () => p(r(text(2)))).join('');
    const {L, P, n} = settle(await docOf(body));
    assert.ok(n <= 8, `${n} passes`);
    assert.ok(P.count <= 3, `${P.count} pages`);
    const under = overlaps(L, P);
    assert.ok(under.every((o) => o.id === L.items[1].id && o.j === 0),
      JSON.stringify(under));
  });

  it('M2: a paragraph\'s parts hold only the exclusions that meet ' +
    'its lines: a float elsewhere on the page is not in its key',
  async () => {
    const body = p(anchorRun({id: 1, ht: 60}) + r(text(3))) +
      Array.from({length: 12}, () => p(r('plain line'))).join('') +
      p(anchorRun({id: 2, ht: 60, h: ['column', off(400)]}) +
        r(text(3)));
    const {L} = settle(await docOf(body));
    const ps = L.wrap.parts.get(L.items[0].id);
    assert.equal(ps.length, 1);
    assert.equal(ps[0].excls.length, 1);
    assert.ok(L.items[0].lines.some((ln) => ln.x === 108));
  });
});

describe('the wrap passes settle with a slow clock (final fix A F3-I2)',
  () => {
    it('opened and edited in the window: when the slices stop, no ' +
      'wrap pass is due', async () => {
      const {clock} = await import('../../tools/moreapps/!Letters/' +
        'ViewPass');
      const real = performance.now, was = clock.now;
      let t = real.call(performance);
      performance.now = () => (t += 3);
      clock.now = () => performance.now();
      try {
        const d = new M.Document(await grid(6, 150, 3));
        const at = {id: M.blockId(d.doc.sections[0].blocks[2]), off: 0};
        const dw = windowOf(d, at);
        const still = () => {
          dw.frames(1e6);
          assert.ok(dw.pages.done, 'done');
          assert.ok(M.wrapPass(dw.L, dw.pages) === null, 'settled');
        };
        still();
        for (const [k, s] of [[2, 'hello world '], [0, text(2)],
          [9, 'more words in here ']]) {
          d.apply({op: 'replaceText', block: [0, k], at: 0, del: 0,
            ins: s});
          dw.newLayout(dw.L.metrics, dw.L);
          still();
        }
      } finally {
        performance.now = real;
        clock.now = was;
      }
    });
  });
