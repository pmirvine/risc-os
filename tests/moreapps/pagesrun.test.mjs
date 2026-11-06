// PagesRun and RangeBox (Print batch, task 2): the Print layout pages
// of a window built apart from it and visited one by one, in slices
// (what Export as PDF and Print share), and the boxes' shared
// helpers. exportPdf's output is proved unchanged by the move: the
// pdf-golden documents' digests (their objects, streams inflated)
// are those the code before it wrote.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {eachPage, paginate, sizeOf, SLICE_MS}
  from '../../tools/moreapps/!Letters/PagesRun';
import * as PdfExport from '../../tools/moreapps/!Letters/PdfExport';
import {rangeOf, markupLine, raf, countOf, progressLine}
  from '../../tools/moreapps/!Letters/RangeBox';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {loadStyles, tm} from './word-docs.mjs';
import {mk} from './edit-docs.mjs';
import {goldenCases, digestOf} from './pdf-golden.mjs';
import * as ViewPass from '../../tools/moreapps/!Letters/ViewPass';

const tick = (cb) => setImmediate(cb);
const TEXTS = ['Alpha first page', 'Bravo second page',
  'Charlie third page'];

/** A window as the page runs read one (as pdfexport.test's). */
function windowOf(d, {view = 'print', markup = 'final'} = {}) {
  const print = view === 'print';
  const L = new DocLayout(d.doc, tm(), null, {floats: print, markup,
    pics: {get: () => ({state: 'pending'})}});
  L.layout(800);
  let pages = null;
  if (print) {
    pages = new Pages(printGalley(L));
    L.place = PlacePrint(L, pages);
    L.layout(800);
    pages.finish();
  }
  d.markup = markup;
  return {d, doc: d.doc, L, pages, viewName: view,
    get markup() { return d.markup; },
    fields: {now: new Date(Date.UTC(2026, 0, 1)),
      shade: {mode: 'always'}}};
}

const pagesDoc = (texts) => mk(texts.map((t, i) => (i
  ? [t, {pPr: {pageBreakBefore: true}}] : t)));

/** What a test can see of a window, by reference and by value. */
function seen(dw) {
  const h = dw.d._h, L = dw.L, P = dw.pages;
  return {L, pages: P, place: L.place, pics: L.pics, fields: L.fields,
    width: L.width, height: L.height, items: L.items,
    shape: JSON.stringify(L.items.map((it) => [it.kind, it.x, it.y,
      it.h])),
    count: P && P.count, list: P && P.list.slice(),
    undo: h.undo.slice(), redo: h.redo.slice(), dirty: dw.d.dirty,
    stateId: dw.d.stateId, winFields: structuredClone(dw.fields),
    doc: structuredClone(dw.d.doc)};
}

/** The pages a run visits: [i], and each call's arguments. */
async function visit(dw, opts = {}) {
  const calls = [];
  const res = await eachPage(dw, {raf: tick, ...opts},
    (P, i, place, size) => { calls.push({P, i, place, size}); });
  return {res, calls, is: calls.map((c) => c.i)};
}

describe('PagesRun eachPage', () => {
  before(loadStyles);

  it('a three-page document: each page once, in order', async () => {
    const dw = windowOf(pagesDoc(TEXTS));
    const {res, calls, is} = await visit(dw);
    assert.deepEqual(res, {pages: 3});
    assert.deepEqual(is, [0, 1, 2]);
    const {P, place} = calls[0];
    assert.equal(P.count, 3);
    assert.notEqual(P, dw.pages);           // (its own, not the window's)
    assert.equal(place.pages, P);
    for (const c of calls) {
      assert.equal(c.P, P);
      assert.equal(c.place, place);
      assert.deepEqual(c.size, sizeOf(P.at(c.i)));
    }
  });

  it('from / to clamped as exportPdf clamps them', async () => {
    const dw = windowOf(pagesDoc(TEXTS));
    assert.deepEqual((await visit(dw, {from: 2, to: 2})).is, [1]);
    assert.deepEqual((await visit(dw, {from: -4, to: 99})).is,
      [0, 1, 2]);
    assert.deepEqual((await visit(dw, {from: 3})).is, [2]);
    assert.deepEqual((await visit(dw, {from: 1.5, to: 2.5})).is, [1]);
    const ra = rangeOf({pages: 'range', from: 0, to: 99}, 3);
    assert.deepEqual((await visit(dw, ra)).is, [0, 1, 2]);
  });

  it('no pages left: exportPdf\'s error, or the verb given',
    async () => {
      const dw = windowOf(pagesDoc(TEXTS));
      for (const [from, to] of [[3, 2], [4, 9], [2, 0], [NaN, 2],
        [1, NaN]]) {
        await assert.rejects(visit(dw, {from, to}),
          {message: 'No pages to export'}, from + '..' + to);
        await assert.rejects(visit(dw, {from, to, verb: 'print'}),
          {message: 'No pages to print'}, from + '..' + to);
      }
    });

  it('progress: preparing, then once per page up to (n, n)',
    async () => {
      const calls = [];
      await visit(windowOf(pagesDoc(TEXTS)), {from: 2,
        onProgress: (...a) => calls.push(a)});
      assert.deepEqual(calls, [[0, 0, 'preparing'], [0, 2, 'pages'],
        [1, 2, 'pages'], [2, 2, 'pages']]);
    });

  it('onPages: the layout and the range, before the first page',
    async () => {
      const dw = windowOf(pagesDoc(TEXTS));
      const order = [];
      let got = null;
      await eachPage(dw, {raf: tick, from: 2,
        onProgress: (k, n, ph) => order.push(ph + k),
        onPages: (o) => { got = o; order.push('onPages'); }},
      (P, i) => order.push('paint' + i));
      assert.deepEqual(order, ['preparing0', 'onPages', 'pages0',
        'paint1', 'pages1', 'paint2', 'pages2']);
      assert.equal(got.doc, dw.doc);
      assert.equal(got.P.count, 3);
      assert.equal(got.L.place.pages, got.P);
      assert.deepEqual([got.from, got.to, got.total], [2, 3, 2]);
    });

  it('an asynchronous paint is awaited before the next page',
    async () => {
      const log = [];
      await eachPage(windowOf(pagesDoc(TEXTS)), {raf: tick},
        async (P, i) => {
          log.push('in' + i);
          await new Promise((res) => setImmediate(res));
          log.push('out' + i);
        });
      assert.deepEqual(log, ['in0', 'out0', 'in1', 'out1', 'in2',
        'out2']);
    });

  it('aborted between pages: AbortError, no page painted after',
    async () => {
      const dw = windowOf(pagesDoc(TEXTS));
      const ctrl = new AbortController();
      const is = [];
      await assert.rejects(eachPage(dw, {raf: tick,
        signal: ctrl.signal}, (P, i) => {
        is.push(i);
        if (i === 0) ctrl.abort();
      }), (e) => e.name === 'AbortError' &&
        e instanceof DOMException);
      assert.deepEqual(is, [0]);
      // aborted before: nothing laid out, nothing painted
      await assert.rejects(eachPage(dw, {raf: tick,
        signal: ctrl.signal}, () => is.push('x')),
      {name: 'AbortError'});
      assert.deepEqual(is, [0]);
    });

  it('aborted while the first frame is awaited: no layout',
    async () => {
      const dw = windowOf(pagesDoc(TEXTS));
      const ctrl = new AbortController();
      let pages = 0;
      await assert.rejects(eachPage(dw, {signal: ctrl.signal,
        raf: (cb) => { ctrl.abort(); setImmediate(cb); },
        onPages: () => pages++}, () => pages++),
      {name: 'AbortError', message: 'The pages were stopped'});
      assert.equal(pages, 0);
      await assert.rejects(eachPage(dw, {signal: ctrl.signal,
        raf: tick, stopped: 'The printing was stopped'}, () => {}),
      {message: 'The printing was stopped'});
    });

  it('yields to raf once the slice has had sliceMs', async () => {
    assert.equal(SLICE_MS, 30);
    assert.equal(PdfExport.SLICE_MS, SLICE_MS);
    const dw = windowOf(pagesDoc(TEXTS));
    let t = 0, frames = 0;
    const clock = () => t;
    const counting = (cb) => { frames++; setImmediate(cb); };
    // every page takes 31 ms: a frame after each but the last (and
    // the one before the layout)
    await eachPage(dw, {raf: counting, clock}, () => { t += 31; });
    assert.equal(frames, 3);
    frames = 0;
    await eachPage(dw, {raf: counting, clock, sliceMs: 100},
      () => { t += 31; });
    assert.equal(frames, 1);
  });

  it('the window\'s layout, pages, undo and saved state untouched',
    async () => {
      for (const view of ['print', 'draft']) {
        const dw = windowOf(pagesDoc(TEXTS), {view});
        const was = seen(dw);
        const {res} = await visit(dw);
        assert.equal(res.pages, 3, view);
        const now = seen(dw);
        for (const k of ['L', 'pages', 'place', 'pics', 'fields',
          'items']) assert.equal(now[k], was[k], view + ' ' + k);
        assert.deepEqual(now, was, view);
      }
    });

  it('paginate and sizeOf are PdfExport\'s', () => {
    assert.equal(PdfExport.paginate, paginate);
    assert.equal(PdfExport.sizeOf, sizeOf);
  });
});

// Preparing in steps (the layout and ViewPass's passes with a frame
// between them once a slice has had sliceMs), so that a long
// document's 'Preparing pages' neither holds up the desktop nor
// Cancel: unequal columns make several passes.
const LEFT = {num: 2, space: 720, equalWidth: false,
  col: [{w: 2640, space: 720}, {w: 6000}]};

/** n paragraphs in unequal columns (5 passes for 60). */
function colsDoc(n) {
  const d = mk(Array.from({length: n}, (_, i) => `${i} words and ` +
    'more words to fill a line and then some'));
  const s = d.doc.sections[0];
  s.props = {...s.props, cols: LEFT};
  return d;
}

/** The pages as a fingerprint: each page's start, end and columns. */
const starts = (P) => JSON.stringify(P.list.map((pg) => [pg.start,
  pg.end, pg.cols]));

/** A clock a slice of sliceMs passes on at each reading. */
const slow = () => {
  let t = 0;
  return () => (t += SLICE_MS);
};

describe('PagesRun: preparing in steps', () => {
  before(loadStyles);

  it('ViewPass settleSteps: a step per layout, settle\'s result',
    () => {
      const d = colsDoc(60);
      const base = () => {
        const B = new DocLayout(d.doc, tm(), null, {floats: true});
        B.layout(800);
        return {L: B};
      };
      const want = ViewPass.settle(d.doc, base());
      assert.ok(want.n >= 3, 'passes: ' + want.n);
      const it = ViewPass.settleSteps(d.doc, base());
      let steps = 0, r;
      while (!(r = it.next()).done) steps++;
      assert.equal(steps, want.n + 1, 'the first layout and each pass');
      assert.equal(r.value.n, want.n);
      assert.equal(starts(r.value.P), starts(want.P));
    });

  it('preparing yields between settle passes, progress shown',
    async () => {
      const dw = windowOf(colsDoc(60));
      let frames = 0, atPages = -1;
      const prog = [];
      await eachPage(dw, {clock: slow(),
        raf: (cb) => { frames++; setImmediate(cb); },
        onProgress: (...a) => prog.push(a),
        onPages: () => { atPages = frames; }}, () => {});
      // the frame before the layout, then one after each layout
      assert.ok(atPages > 3, 'frames while preparing: ' + atPages);
      const prep = prog.filter((a) => a[2] === 'preparing');
      assert.ok(prep.length > 2, 'preparing calls: ' + prep.length);
      assert.deepEqual(prep[0], [0, 0, 'preparing']);
      assert.ok(prep.every((a) => a[1] === 0));
    });

  it('cancel during preparing: AbortError, no page, no onPages',
    async () => {
      const dw = windowOf(colsDoc(60));
      const ctrl = new AbortController();
      let frames = 0, painted = 0, pages = 0;
      await assert.rejects(eachPage(dw, {clock: slow(),
        signal: ctrl.signal, onPages: () => pages++,
        raf: (cb) => {
          if (++frames === 3) ctrl.abort();   // (mid-settle)
          setImmediate(cb);
        }}, () => painted++),
      {name: 'AbortError', message: 'The pages were stopped'});
      assert.equal(frames, 3, 'no frame after the abort');
      assert.deepEqual([painted, pages], [0, 0]);
    });

  it('stepwise preparing: the same page starts as paginate',
    async () => {
      for (const d of [pagesDoc(TEXTS), colsDoc(60), colsDoc(200)]) {
        const dw = windowOf(d);
        let got = null;
        await eachPage(dw, {clock: slow(), raf: tick,
          onPages: ({P}) => { got = P; }}, () => {});
        const want = paginate(dw).P;
        assert.equal(got.count, want.count);
        assert.equal(starts(got), starts(want));
      }
    });
});

describe('RangeBox', () => {
  it('rangeOf: Export as PDF\'s words by default, the verb given',
    () => {
      const bad = {pages: 'range', from: 3, to: 2};
      assert.equal(rangeOf(bad, 5).bad,
        'From is after To: no pages to export.');
      assert.equal(rangeOf(bad, 5, 'print').bad,
        'From is after To: no pages to print.');
      assert.deepEqual(rangeOf({pages: 'range', from: 0, to: 99}, 3,
        'print'), {from: 1, to: 3});
      assert.deepEqual(rangeOf({pages: 'all'}, 3, 'print'),
        {from: 1, to: Infinity});
      assert.equal(rangeOf({pages: 'range', from: null}, 3, 'print')
        .bad, 'From is not a page number.');
    });

  it('markupLine', () => {
    assert.equal(markupLine('all'), 'Markup: all markup shown');
    assert.equal(markupLine('nonsense'), 'Markup: final text');
  });

  it('countOf: the count only when Print layout has them all', () => {
    assert.equal(countOf({viewName: 'print', pages: {done: true,
      count: 4}}), 4);
    assert.equal(countOf({viewName: 'print', pages: {done: false,
      count: 4}}), null);
    assert.equal(countOf({viewName: 'draft', pages: null}), null);
  });

  it('raf: called once, by the timer when there are no frames',
    async () => {
      let n = 0;
      await new Promise((res) => raf(() => { n++; res(); }));
      await new Promise((res) => setTimeout(res, 150));
      assert.equal(n, 1);
    });

  it('progressLine: the box\'s words for each phase', () => {
    assert.equal(progressLine(0, 0, 'preparing'),
      'Preparing pages...');
    assert.equal(progressLine(0, 3, 'pages'), 'Page 1 of 3');
    assert.equal(progressLine(2, 3, 'pages'), 'Page 3 of 3');
    assert.equal(progressLine(3, 3, 'pages'), null);
    assert.equal(progressLine(3, 3, 'writing'), 'Writing...');
  });
});

// The digests of pdf-golden's documents as the PDF export wrote them
// before its page loop moved here (c65e0428): objects and inflated
// streams, so the same with any zlib. 'links' since its bookmark
// link goes to the line (/XYZ, ./BookmarkSpot), its only change; and
// again since a link is drawn by its runs (./LinkRuns): these links'
// runs carry no Hyperlink style, so they are black, as Word draws
// them (with the old link drawing the old digest still comes out).
const GOLDEN = {
  'three pages':
    '76dee4bf2d209102a0c1914e60bc8cc1e8772a853760f8357936161d265218e7',
  'pages 2 to 3':
    'cf608ec0fc632fa09dbbc4dfacbfa64c8aae6297e9f594c618f7b66eb1e731cc',
  'PNG header picture':
    '70496239f8e817391386a8218a263d2fea7d39914c0643e7eb4b30e496652207',
  'JPEG header picture':
    'e4070b407c44ee1a6f969243e0a39a5264f16e208264047f32e5da452263b00f',
  'links':
    '17b45475344071a95e58a2d5119f909bb85360ff3737dbbac8a38a5f30c0e1fa',
  'real advances':
    'c6719c50cd8b3d72e41548dffb30c4104c9f6b9d81f4dfe7c0ea6a2e48dc32d4',
};

describe('exportPdf unchanged by PagesRun', () => {
  it('the golden documents export as before', async () => {
    const cases = await goldenCases();
    assert.deepEqual(cases.map((c) => c.name), Object.keys(GOLDEN));
    for (const c of cases) {
      assert.equal(digestOf(await c.run()), GOLDEN[c.name], c.name);
    }
  });

  it('the same, prepared in steps (a frame after each layout)',
    async () => {
      for (const c of await goldenCases()) {
        assert.equal(digestOf(await c.run({clock: slow()})),
          GOLDEN[c.name], c.name);
      }
    });
});
