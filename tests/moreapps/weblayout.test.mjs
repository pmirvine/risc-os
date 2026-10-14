// Web layout (Batch D P13.1, D31, OD8): the galley at the window's
// width minus 0.25 in each side, no pages; a resize re-breaks the
// lines; on a 50,000-paragraph document the visible part is laid out
// in under 100 ms and the rest in slices that end with the layout a
// full one gives; the file's w:view web opens in Web layout; saving
// is byte-identical (the view never touches the model).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {webWidth, stepWeb, bandOf, WEB_SIDE, WEB_PAD, THROTTLE_MS}
  from '../../tools/moreapps/!Letters/WebLayout';
import {registerHooks} from 'node:module';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {W} from '../../tools/moreapps/!Letters/Ns';
import {loadStyles, tm} from './word-docs.mjs';
import {mk} from './edit-docs.mjs';

const STUB = 'data:text/javascript,' + encodeURIComponent(
  'export const vfs = {exists: () => false}, choices = {write() {}},' +
  ' wimp = {}, Menu = class {};');
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'riscos') return {url: STUB, shortCircuit: true};
    return next(spec, ctx);
  },
});
const {openingView, VIEWS} = await import(
  '../../tools/moreapps/!Letters/ViewMode');

before(loadStyles);
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'
  .split(' ');
const para = (i, n = 12) => `${i} ` + Array.from({length: n},
  (_, k) => WORDS[(i + k) % 10]).join(' ');
const doc = (n, words) => mk(Array.from({length: n}, (_, i) =>
  para(i, words)));
/** A line's right edge (a trailing space may overhang: 9 px). */
const right = (ln) => ln.items.reduce((m, i) => Math.max(m, i.x + i.w), 0);
const nLines = (L) => L.items.reduce((n, it) => n + it.lines.length, 0);

describe('Web layout width (D31)', () => {
  it('the window width minus 0.25 in (24 px) each side and the ' +
    '8 px inset inside the white area (final fix B, review 2 M5)', () => {
    assert.equal(WEB_SIDE, 24);
    assert.equal(WEB_PAD, 8);
    assert.equal(webWidth(800), 736);
    assert.equal(webWidth(300), 236);
  });

  it('never below 80 px, never above 4000, whatever it is given', () => {
    for (const v of [0, -1, 40, NaN, undefined, 'x', Infinity])
      assert.equal(webWidth(v), 80, String(v));
    assert.equal(webWidth(1e9), 4000);
  });

  it('the resize throttle is 200 ms', () => {
    assert.equal(THROTTLE_MS, 200);
  });
});

describe('Web layout: the galley at the window width', () => {
  it('items are the window width wide, 8 px inside the white area ' +
    'that starts 24 px in from the left (final fix B, M5)', () => {
    const d = doc(10);
    const L = new DocLayout(d.doc, tm(), null, {web: webWidth(500)});
    L.layout(500);
    assert.equal(L.web, 436);
    assert.equal(L.pageLeft, 24);
    assert.equal(L.pageW, 452, 'the white area: 24 px clear each side');
    assert.equal(L.left, 32, 'the text 8 px inside it');
    for (const it of L.items) {
      assert.equal(it.w, 436);
      assert.equal(it.x, 32);
    }
  });

  it('lines re-break to a narrower window, and back', () => {
    const d = doc(20, 40);
    const metrics = tm();
    const wide = new DocLayout(d.doc, metrics, null, {web: 1000});
    wide.layout(1048);
    const narrow = new DocLayout(d.doc, metrics, wide, {web: 300});
    narrow.layout(348);
    assert.ok(nLines(narrow) > nLines(wide) * 2, 'more lines');
    for (const it of narrow.items) {
      assert.equal(it.w, 300);
      for (const ln of it.lines) {
        assert.ok(right(ln) <= 300 + 9, `line ${right(ln)} fits`);
      }
    }
    const back = new DocLayout(d.doc, metrics, narrow, {web: 1000});
    back.layout(1048);
    assert.equal(nLines(back), nLines(wide));
  });

  it('has no pages, headers or footers: the identity placement', () => {
    const d = doc(5);
    const L = new DocLayout(d.doc, tm(), null, {web: 400});
    L.layout(448);
    assert.equal(L.place.pageOf(), null);
    assert.equal(L.place.pages, undefined);
    assert.equal(L.floats, false);
  });

  it('an edit at the same width keeps the other lines (reuse)', () => {
    const d = doc(50);
    const metrics = tm();
    const a = new DocLayout(d.doc, metrics, null, {web: 400});
    a.layout(448);
    const lines = a.items[7].lines;
    d.apply({op: 'replaceText', block: [0, 3], at: 0, del: 0,
      ins: 'x'});
    const b = new DocLayout(d.doc, metrics, a, {web: 400});
    b.layout(448);
    assert.equal(b.items[7].lines, lines);
    assert.equal(b.stale || 0, 0);
  });

  it('a table is a share of the window (pct of the window)', () => {
    const d = doc(2);
    const L = new DocLayout(d.doc, tm(), null, {web: 600});
    L.layout(648);
    assert.equal(L.root.w, 600);
  });

  it('a section\'s page size does not narrow it (one column)', () => {
    const d = doc(3);
    d.doc.sections[0].props = {...d.doc.sections[0].props};
    const L = new DocLayout(d.doc, tm(), null, {web: 700});
    L.layout(748);
    assert.equal(L.geom(0).cols.length, 1);
    assert.equal(L.geom(0).cols[0].w, 700);
    assert.equal(L.geom(0).textW, 700);
  });
});

describe('Web layout: the lazy resize of a long document (OD8)', () => {
  const N = 50000;
  let d, metrics, L0, vis;
  before(() => {
    d = doc(N, 14);
    metrics = tm();
    L0 = new DocLayout(d.doc, metrics, null, {web: 1000});
    L0.layout(1048);
    vis = bandOf(L0, 0, 800, null);
  });

  it('the visible part in under 100 ms, the rest in slices', () => {
    const t0 = performance.now();
    const L = new DocLayout(d.doc, metrics, L0,
      {web: 400, lazy: vis});
    L.layout(448);
    const ms = performance.now() - t0;
    assert.ok(ms < 100, `visible part ${ms.toFixed(1)} ms`);
    assert.ok(L.stale > N / 2, 'most paragraphs wait');
    // the visible ones are broken at the new width
    for (let i = vis.c0; i <= Math.min(vis.c1, 10); i++) {
      assert.equal(L.items[i].lines.every((l) => right(l) <= 400 + 9),
        true);
      assert.ok(!L.items[i].stale);
    }
    // slices of 2 ms
    let worst = 0, steps = 0, done = false;
    while (!done) {
      const s = performance.now();
      done = stepWeb(L, 2);
      worst = Math.max(worst, performance.now() - s);
      steps++;
      assert.ok(steps < 100000, 'ends');
    }
    assert.ok(steps > 3, `in slices (${steps})`);
    assert.equal(L.stale, 0);
    // ... and it is the layout a full one gives
    const F = new DocLayout(d.doc, metrics, null, {web: 400});
    F.layout(448);
    assert.equal(L.height, F.height);
    for (const i of [0, 1, 777, 25000, N - 1]) {
      assert.equal(L.items[i].y, F.items[i].y, `y of ${i}`);
      assert.equal(L.items[i].lines.length, F.items[i].lines.length);
    }
    console.log(`# web resize: ${ms.toFixed(1)} ms, ${steps} slices,` +
      ` worst ${worst.toFixed(1)} ms`);
  });

  it('a slice stays near its budget (the last one finishes)', () => {
    const L = new DocLayout(d.doc, metrics, L0,
      {web: 500, lazy: vis});
    L.layout(548);
    const s = performance.now();
    stepWeb(L, 2);
    assert.ok(performance.now() - s < 40, 'one slice is short');
  });

  it('an edit between slices keeps the lines already broken', () => {
    const L = new DocLayout(d.doc, metrics, L0,
      {web: 450, lazy: vis});
    L.layout(498);
    stepWeb(L, 2);
    const before = L.stale;
    d.apply({op: 'replaceText', block: [0, 5], at: 0, del: 0,
      ins: 'x'});
    const M = new DocLayout(d.doc, metrics, L, {web: 450, lazy: vis});
    M.layout(498);
    assert.ok(M.stale > 0 && M.stale <= before, 'still waiting');
    while (!stepWeb(M, 5));
    const F = new DocLayout(d.doc, metrics, null, {web: 450});
    F.layout(498);
    assert.equal(M.height, F.height);
  });
});

describe('Web layout: typing while the slices run (P13 fix I3)', () => {
  const N = 50000;
  it('an edit re-breaks its paragraph and neighbours only, <= 30 ms; the rest stays for the slices', () => {
    const d = doc(N, 14), metrics = tm();
    const L0 = new DocLayout(d.doc, metrics, null, {web: 1000});
    L0.layout(1048);
    let L = new DocLayout(d.doc, metrics, L0,
      {web: 420, lazy: bandOf(L0, 0, 800, null)});
    L.layout(468);
    stepWeb(L, 2);
    stepWeb(L, 2);
    const waiting = L.stale;
    assert.ok(waiting > N / 2);
    const ms = [];
    for (let i = 0; i < 23; i++) {
      const k = 30000 + (i % 3);
      d.apply({op: 'replaceText', block: [0, k], at: 0, del: 0,
        ins: 'x'});
      const t0 = performance.now();
      // (as the window makes it: no lazy band, ./WebView webOpts)
      const M = new DocLayout(d.doc, metrics, L, {web: 420});
      M.layout(468);
      if (i >= 3) ms.push(performance.now() - t0);
      for (const j of [k - 1, k, k + 1]) {
        const it = M.items[j];
        assert.ok(!it.stale && it.lines.every((l) => right(l) <= 420 + 9),
          `item ${j} broken at the new width`);
      }
      assert.ok(M.stale > waiting - 100, `the rest waits (${M.stale})`);
      L = M;
    }
    ms.sort((a, b) => a - b);
    console.log(`# web edit while slicing: median ${ms[10].toFixed(1)} ms`);
    assert.ok(ms[10] <= 30, `median ${ms[10].toFixed(1)} ms`);
    while (!stepWeb(L, 5));
    const F = new DocLayout(d.doc, metrics, null, {web: 420});
    F.layout(468);
    assert.equal(L.height, F.height);
    for (const i of [0, 29999, 30000, 30002, N - 1])
      assert.equal(L.items[i].y, F.items[i].y, `y of ${i}`);
  });
});

describe('Web layout: bandOf', () => {
  it('the items around a band, widened, and the caret\'s', () => {
    const d = doc(500);
    const L = new DocLayout(d.doc, tm(), null, {web: 400});
    L.layout(448);
    const b = bandOf(L, 0, 300, L.items[400].id);
    assert.equal(b.c0, 0);
    assert.ok(b.c1 > 5 && b.c1 < 100);
    assert.ok(b.also.includes(400));
  });
});

describe('Web layout is a view of a window', () => {
  it('is among the views, and the file\'s w:view web opens in it', () => {
    assert.ok(VIEWS.includes('web'));
    const d = doc(1);
    d.doc.rawSettings = parseXml(`<w:settings xmlns:w="${W}">` +
      '<w:view w:val="web"/></w:settings>').root;
    assert.equal(openingView({}, d.doc), 'web');
  });
});

describe('Web layout never changes what is saved', () => {
  it('saving after a Web layout is byte-identical', async () => {
    const d = doc(40, 30);
    const before = await writeDocx(d.doc, {date: new Date(0)});
    const L = new DocLayout(d.doc, tm(), null, {web: 300});
    L.layout(348);
    const M = new DocLayout(d.doc, tm(), L, {web: 200,
      lazy: {c0: 0, c1: 3, also: []}});
    M.layout(248);
    while (!stepWeb(M, 5));
    const after = await writeDocx(d.doc, {date: new Date(0)});
    assert.deepEqual(Buffer.from(after), Buffer.from(before));
  });
});
