// PrintPages (Print batch, task 3): where a page goes on the paper
// (fitPlacement), the paper as the printer reports it (paperOf), the
// resolution (dpiFor, canvasSize) and the pages painted onto canvases
// and turned into JPEG data URLs (renderPages). No canvas in Node: a
// fake context records what is drawn; the browser tests (word-
// printbox) paint real ones.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {fitPlacement, paperOf, dpiFor, canvasSize, renderPages,
  MAX_SIDE, MAX_AREA, QUALITY}
  from '../../tools/moreapps/!Letters/PrintPages';
import {paginate, sizeOf} from '../../tools/moreapps/!Letters/PagesRun';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {loadStyles, tm} from './word-docs.mjs';
import {mk} from './edit-docs.mjs';
import {p, r} from './build-docx.mjs';
import {wordHf, picRun} from './hf-fixtures.mjs';
import {pngBytes} from './pic-fixtures.mjs';

const tick = (cb) => setImmediate(cb);
const A4 = {width: 209.90277777777777, height: 297.0388888888889,
  landscape: false};
const LETTER = {width: 215.9, height: 279.4, landscape: false};
const TEXTS = ['Alpha first page', 'Bravo second page',
  'Charlie third page'];

/** A window as a page run reads one (PagesRun paginate). */
const windowOf = (d) => ({d, doc: d.doc, L: {metrics: tm(),
  width: 800}, markup: 'final', viewName: 'draft'});

const pagesDoc = (texts) => mk(texts.map((t, i) => (i
  ? [t, {pPr: {pageBreakBefore: true}}] : t)));

/** A 2D context that records what is drawn into log. */
function fakeContext(log, canvas) {
  const st = {font: '10px sans-serif', fillStyle: '#000000',
    strokeStyle: '#000000', globalAlpha: 1, lineWidth: 1,
    textAlign: 'start', textBaseline: 'alphabetic', canvas};
  let m = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const fns = {
    save: () => stack.push([m, {...st}]),
    restore: () => {
      const s = stack.pop();
      if (s) { m = s[0]; Object.assign(st, s[1]); }
    },
    setTransform: (a, b, c, d, e, f) => { m = [a, b, c, d, e, f]; },
    scale: (x, y) => { m = [m[0] * x, m[1] * x, m[2] * y, m[3] * y,
      m[4], m[5]]; log.push({op: 'scale', x, y}); },
    translate: (x, y) => { m = [m[0], m[1], m[2], m[3],
      m[4] + m[0] * x + m[2] * y, m[5] + m[1] * x + m[3] * y]; },
    getTransform: () => ({a: m[0], b: m[1], c: m[2], d: m[3],
      e: m[4], f: m[5]}),
    measureText: (t) => ({width: String(t).length * 6,
      actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2}),
    getLineDash: () => [],
    createLinearGradient: () => ({addColorStop() {}}),
    createPattern: () => ({}),
    fillText: (text) => log.push({op: 'fillText', text: String(text)}),
    fillRect: (x, y, w, h) => log.push({op: 'fillRect',
      style: st.fillStyle, x, y, w, h}),
    drawImage: (bm) => log.push({op: 'drawImage', bm}),
  };
  return new Proxy({}, {
    get: (t, k) => (k in fns ? fns[k] : k in st ? st[k]
      : k === 'link' || typeof k === 'symbol' ? undefined
        : () => {}),
    set: (t, k, v) => { st[k] = v; return true; },
  });
}

/** canvasFactory recording each canvas: {w, h, log, canvas}. */
function factory(hook) {
  const made = [];
  const make = (w, h) => {
    const log = [];
    const canvas = {width: w, height: h};
    canvas.getContext = () => fakeContext(log, canvas);
    canvas.toDataURL = (type, q) => {
      log.push({op: 'toDataURL', type, q});
      return 'data:image/jpeg;base64,' + made.length;
    };
    const rec = {w, h, log, canvas};
    made.push(rec);
    if (hook) hook(rec, made.length);
    return canvas;
  };
  return {made, make};
}

const textOf = (rec) => rec.log.filter((e) => e.op === 'fillText')
  .map((e) => e.text).join(' ');
const close = (a, b) => Math.abs(a - b) < 1e-9;
const boxClose = (got, want) => {
  for (const k of ['x', 'y', 'w', 'h']) {
    assert.ok(Math.abs(got[k] - want[k]) < 1e-6,
      `${k}: ${got[k]} not ${want[k]}`);
  }
};

describe('PrintPages fitPlacement', () => {
  const page = {pageW: 210, pageH: 297};

  it('A4 on A4, fit on: exactly the paper', () => {
    assert.deepEqual(fitPlacement({...page, paperW: 210, paperH: 297,
      fit: true}), {x: 0, y: 0, w: 210, h: 297});
  });

  it('A4 on Letter, fit on: the height ratio, centred across', () => {
    const k = 279.4 / 297;
    boxClose(fitPlacement({...page, paperW: 215.9, paperH: 279.4,
      fit: true}), {x: (215.9 - 210 * k) / 2, y: 0, w: 210 * k,
      h: 279.4});
  });

  it('A4 on A3, fit on: larger, centred', () => {
    const k = 420 / 297;                  // (less than 297 / 210)
    const b = fitPlacement({...page, paperW: 297, paperH: 420,
      fit: true});
    boxClose(b, {x: (297 - 210 * k) / 2, y: 0, w: 210 * k, h: 420});
    assert.ok(b.w > 210 && b.w <= 297);
  });

  it('a landscape page on portrait paper, fit on: fits the width',
    () => {
      const b = fitPlacement({pageW: 297, pageH: 210, paperW: 210,
        paperH: 297, fit: true});
      boxClose(b, {x: 0, y: (297 - 210 * 210 / 297) / 2, w: 210,
        h: 210 * 210 / 297});
    });

  it('fit off, A4 on Letter: full size, centred, cut at the edges',
    () => {
      boxClose(fitPlacement({...page, paperW: 215.9, paperH: 279.4,
        fit: false}), {x: (215.9 - 210) / 2, y: (279.4 - 297) / 2,
        w: 210, h: 297});
    });

  it('fit off, a smaller page: full size, centred', () => {
    boxClose(fitPlacement({pageW: 100, pageH: 100, paperW: 210,
      paperH: 297, fit: false}), {x: 55, y: 98.5, w: 100, h: 100});
  });

  it('zero, NaN, Infinity, negative and huge sizes: a finite box',
    () => {
      const bad = [0, NaN, Infinity, -Infinity, -5, 1e300, undefined,
        null, '12'];
      for (const pageW of bad) {
        for (const paperW of bad) {
          for (const fit of [true, false]) {
            const b = fitPlacement({pageW, pageH: pageW, paperW,
              paperH: 297, fit});
            for (const k of ['x', 'y', 'w', 'h']) {
              assert.ok(Number.isFinite(b[k]),
                `${k} ${pageW} ${paperW} ${fit}: ${b[k]}`);
            }
            assert.ok(b.w > 0 && b.h > 0);
          }
        }
      }
      // a bad page is the paper; no arguments at all, A4
      boxClose(fitPlacement({pageW: NaN, pageH: 0, paperW: 215.9,
        paperH: 279.4, fit: true}), {x: 0, y: 0, w: 215.9, h: 279.4});
      boxClose(fitPlacement({}), {x: 0, y: 0, w: 210, h: 297});
      assert.doesNotThrow(() => fitPlacement());
    });
});

describe('PrintPages paperOf, dpiFor, canvasSize', () => {
  it('the paper as printed: 0.1 mm, landscape swapped', () => {
    assert.deepEqual(paperOf(A4), {w: 209.9, h: 297});
    assert.deepEqual(paperOf({...A4, landscape: true}),
      {w: 297, h: 209.9});
    assert.deepEqual(paperOf(LETTER), {w: 215.9, h: 279.4});
    assert.deepEqual(paperOf({...LETTER, landscape: true}),
      {w: 279.4, h: 215.9});
    assert.deepEqual(paperOf(undefined), {w: 210, h: 297});
    assert.deepEqual(paperOf({width: NaN, height: -1}),
      {w: 210, h: 297});
  });

  it('the resolution by the pages printed', () => {
    assert.deepEqual([1, 100, 101, 250, 251, 5000].map(dpiFor),
      [200, 200, 150, 150, 100, 100]);
  });

  it('a canvas at dpi, its sides and area bounded', () => {
    const a4 = sizeOf({size: {w: 11906, h: 16838}}).px;
    const c = canvasSize(a4, 200);
    assert.equal(c.dpi, 200);
    assert.deepEqual([c.w, c.h], [Math.floor(a4[0] * 200 / 96),
      Math.floor(a4[1] * 200 / 96)]);
    // A2 at 200 dpi: its long side 4677 px, brought to 4096
    const a2 = canvasSize([420 / 25.4 * 96, 594 / 25.4 * 96], 200);
    assert.ok(a2.h <= MAX_SIDE && a2.h >= MAX_SIDE - 1, a2.h);
    assert.ok(a2.dpi < 200 && a2.dpi > 170, a2.dpi);
    // a square page of 200 in: the area is the bound
    const sq = canvasSize([19200, 19200], 200);
    assert.ok(sq.w * sq.h <= MAX_AREA && sq.w <= MAX_SIDE, sq.w);
    for (const bad of [[NaN, 1], [0, 0], [-3, 5], [Infinity, 1]]) {
      const b = canvasSize(bad, 200);
      assert.ok(b.w >= 1 && b.h >= 1 && Number.isFinite(b.dpi));
    }
  });
});

describe('PrintPages renderPages', () => {
  before(loadStyles);

  it('each page in order, one canvas each, white first, released',
    async () => {
      const dw = windowOf(pagesDoc(TEXTS));
      const f = factory();
      const prog = [];
      const res = await renderPages(dw, {paper: A4, fit: true,
        raf: tick, canvasFactory: f.make,
        onProgress: (k, n, ph) => prog.push([k, n, ph])});
      assert.equal(res.count, 3);
      assert.equal(res.pages.length, 3);
      assert.equal(f.made.length, 3);
      f.made.forEach((rec, k) => {
        assert.match(textOf(rec), new RegExp(TEXTS[k].split(' ')[0]));
        const first = rec.log[0];
        assert.deepEqual(first, {op: 'fillRect', style: '#ffffff',
          x: 0, y: 0, w: rec.w, h: rec.h});
        assert.deepEqual(rec.log.at(-1), {op: 'toDataURL',
          type: 'image/jpeg', q: QUALITY});
        assert.equal(rec.canvas.width, 0);    // released
        assert.equal(rec.canvas.height, 0);
        assert.equal(res.pages[k].url, 'data:image/jpeg;base64,' +
          (k + 1));
      });
      assert.equal(QUALITY, 0.9);
      // A4 page on A4 paper: the paper, to 0.1 mm
      const want = fitPlacement({pageW: 595.3 * 25.4 / 72,
        pageH: 841.9 * 25.4 / 72, paperW: 209.9, paperH: 297,
        fit: true});
      const {P} = paginate(dw);
      const mm = sizeOf(P.at(0)).pt.map((v) => v * 25.4 / 72);
      boxClose(res.pages[0], fitPlacement({pageW: mm[0],
        pageH: mm[1], paperW: 209.9, paperH: 297, fit: true}));
      assert.ok(Math.abs(res.pages[0].w - want.w) < 0.1);
      assert.deepEqual(prog[0], [0, 0, 'preparing']);
      assert.deepEqual(prog.at(-1), [3, 3, 'pages']);
    });

  it('a range: those pages only', async () => {
    const f = factory();
    const res = await renderPages(windowOf(pagesDoc(TEXTS)), {from: 2,
      to: 2, paper: A4, raf: tick, canvasFactory: f.make});
    assert.equal(res.count, 1);
    assert.match(textOf(f.made[0]), /Bravo/);
  });

  it('no pages in the range: the print wording', async () => {
    await assert.rejects(renderPages(windowOf(pagesDoc(TEXTS)),
      {from: 5, to: 9, paper: A4, raf: tick,
        canvasFactory: factory().make}), {message:
        'No pages to print.'});
  });

  it('200 dpi for a few pages; a given dpi is used', async () => {
    const dw = windowOf(pagesDoc(TEXTS));
    const px = sizeOf(paginate(dw).P.at(0)).px;
    for (const [dpi, want] of [[undefined, 200], [100, 100]]) {
      const f = factory();
      await renderPages(dw, {paper: A4, fit: false, dpi, raf: tick,
        canvasFactory: f.make});
      const c = canvasSize(px, want);
      assert.deepEqual([f.made[0].w, f.made[0].h], [c.w, c.h]);
      const s = f.made[0].log.find((e) => e.op === 'scale');
      assert.ok(close(s.x, c.w / px[0]) && close(s.y, c.h / px[1]));
    }
  });

  it('landscape paper: the page fitted to it as the printer has it',
    async () => {
      const dw = windowOf(pagesDoc(['x']));
      const f = factory();
      const res = await renderPages(dw, {paper: {...A4,
        landscape: true}, fit: true, raf: tick,
      canvasFactory: f.make});
      const mm = sizeOf(paginate(dw).P.at(0)).pt.map((v) =>
        v * 25.4 / 72);
      boxClose(res.pages[0], fitPlacement({pageW: mm[0],
        pageH: mm[1], paperW: 297, paperH: 209.9, fit: true}));
      assert.ok(close(res.pages[0].h, 209.9));
      // drawn at the size it is printed: 200 dpi of its box
      assert.ok(Math.abs(f.made[0].h - 209.9 / 25.4 * 200) < 2,
        f.made[0].h);
    });

  it('stopped by the signal: the current page finished, then null',
    async () => {
      const ctrl = new AbortController();
      const f = factory((rec, n) => { if (n === 1) ctrl.abort(); });
      const res = await renderPages(windowOf(pagesDoc(TEXTS)),
        {paper: A4, signal: ctrl.signal, raf: tick,
          canvasFactory: f.make});
      assert.equal(res, null);
      assert.equal(f.made.length, 1);
      assert.equal(f.made[0].canvas.width, 0);
    });

  it('a huge page: drawn at a lower dpi, never skipped', async () => {
    const d = pagesDoc(['big']);
    const sec = d.doc.sections[0];
    sec.props = {...sec.props, pgSz: {w: 1e9, h: 1e9}};
    const f = factory();
    const res = await renderPages(windowOf(d), {paper: A4, fit: false,
      raf: tick, canvasFactory: f.make});
    assert.equal(res.count, 1);
    const {w, h} = f.made[0];
    assert.ok(w <= MAX_SIDE && h <= MAX_SIDE && w * h <= MAX_AREA,
      `${w} x ${h}`);
    assert.ok(w > 1000);
    assert.match(textOf(f.made[0]), /big/);
  });

  it('a picture is decoded and the page painted again before it is ' +
    'read', async () => {
    const doc = await readDocx(await wordHf({pic: pngBytes(4, 2),
      body: p(r('one')),
      default: {hdr: p(picRun('rIdP1') + r('Logo'))}}));
    const decoded = [];
    const decode = (bytes, mime) => new Promise((res) => setTimeout(
      () => {
        const bm = {width: 4, height: 2, mime, closed: false,
          close() { this.closed = true; }};
        decoded.push(bm);
        res(bm);
      }, 5));
    const f = factory();
    const res = await renderPages(windowOf(new Document(doc)),
      {paper: A4, raf: tick, canvasFactory: f.make, decode});
    assert.equal(res.count, 1);
    assert.equal(decoded.length, 1);
    const log = f.made[0].log;
    const ops = log.map((e) => e.op);
    const drawn = ops.indexOf('drawImage');
    assert.ok(drawn >= 0, 'the picture drawn');
    assert.equal(log[drawn].bm, decoded[0]);
    assert.ok(drawn < ops.indexOf('toDataURL'));
    // painted twice: white, its placeholder; white again, the bitmap
    const whites = log.filter((e) => e.op === 'fillRect' &&
      e.style === '#ffffff' && e.x === 0 && e.w === f.made[0].w);
    assert.equal(whites.length, 2);
    assert.ok(decoded[0].closed, 'the bitmap closed after the run');
  });

  it('a face still loading: waited for, the page painted again',
    async () => {
      let done;
      const fonts = {status: 'loading', ready: new Promise((res) => {
        done = res;
      })};
      setTimeout(() => { fonts.status = 'loaded'; done(); }, 5);
      const f = factory();
      await renderPages(windowOf(pagesDoc(['x'])), {paper: A4,
        raf: tick, canvasFactory: f.make, fonts});
      const scales = f.made[0].log.filter((e) => e.op === 'scale');
      assert.equal(scales.length, 2);
    });
});

describe('PrintPages renderPages: the slices\' yield (final fixes)',
  () => {
    before(loadStyles);
    const PAGES = ['a', 'b', 'c', 'd'];
    /** A run yielding after every page; what it yielded to. */
    async function yields(document, hide) {
      const seen = [];
      const raf = (cb) => { seen.push('frame'); setImmediate(cb); };
      const post = (cb) => { seen.push('post'); setImmediate(cb); };
      const res = await renderPages(windowOf(pagesDoc(PAGES)),
        {paper: A4, raf, post, document, sliceMs: 0,
          canvasFactory: factory(hide).make});
      assert.equal(res.count, PAGES.length);
      return seen;
    }

    it('page seen: frames, never the message', async () => {
      const seen = await yields({hidden: false});
      assert.ok(seen.length >= PAGES.length, seen.join());
      assert.ok(seen.every((y) => y === 'frame'), seen.join());
    });

    it('page hidden (output window in front, another tab): the ' +
      'un-throttled message, never a frame', async () => {
      const seen = await yields({hidden: true});
      assert.ok(seen.length >= PAGES.length, seen.join());
      assert.ok(seen.every((y) => y === 'post'), seen.join());
    });

    it('hidden part way through: from then on the message',
      async () => {
        const doc = {hidden: false};
        const seen = await yields(doc, (rec, n) => {
          if (n === 2) doc.hidden = true;
        });
        const k = seen.indexOf('post');
        assert.ok(k > 0, seen.join());
        assert.ok(seen.slice(0, k).every((y) => y === 'frame'));
        assert.ok(seen.slice(k).every((y) => y === 'post'));
      });

    it('no post given: a MessageChannel, the run ends (its ports ' +
      'closed)', async () => {
      const res = await renderPages(windowOf(pagesDoc(PAGES)),
        {paper: A4, raf: () => assert.fail('a frame while hidden'),
          document: {hidden: true}, sliceMs: 0,
          canvasFactory: factory().make});
      assert.equal(res.count, PAGES.length);
    });
  });
