// PrintPages over the corpus and at hostile sizes (Print batch,
// task 6). No canvas in Node: a recording 2D context (rec below)
// stands in for one, and counts the canvases alive.
//
// 1. The corpus (optional, git-ignored: tests/moreapps/corpus; the
//    block is skipped without it): a sample (one file in SAMPLE by a
//    hash of its name) laid out as pdf-docs windowOf lays it out.
//    For each of a few ranges, renderPages prints as many pages as
//    exportPdf exports (a range past the end refused by both), and
//    the one-painter claim: each printed page's fillText strings,
//    in order, are those PdfSink wrote as Tj on the same PDF page
//    (pdf-docs recorder), each at the same place (page px, after
//    the canvas's scale is taken away) within POS px. Runs a PDF
//    sink drops (empty text, a place not finite, a maxWidth not
//    above 0, nothing visible) are dropped from the canvas's too.
//    Then the time: the largest file of the sample printed, the
//    least of 3 runs after one to warm up, under EACH_MS; totals
//    printed (files, pages, canvases, pages at a reduced dpi).
// 2. Hostile sizes: a section with a 1 x 1 pt page and one of
//    14400 x 14400 pt, a 200-page document, both fit on and off:
//    every canvas within MAX_SIDE and MAX_AREA, at most one alive
//    at a time (released after each page), the heap not grown past
//    HEAP_MB (process.memoryUsage; not asserted without it),
//    progress never going back, Cancel answered (null) within
//    ABORT_MS of the signal, also while a picture's decode or a
//    face's load never ends.
// 3. fitPlacement over random sizes (seeded): finite, inside the
//    paper with fit on, centred.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {readDocx, DocxError}
  from '../../tools/moreapps/!Letters/DocxRead';
import {exportPdf} from '../../tools/moreapps/!Letters/PdfExport';
import {renderPages, fitPlacement, dpiFor, MAX_SIDE, MAX_AREA}
  from '../../tools/moreapps/!Letters/PrintPages';
import {CORPUS, nameOf, SKIP_CORPUS, hash} from './roundtrip-lib.mjs';
import {bundled, windowOf, raster, recorder} from './pdf-docs.mjs';
import {loadStyles, tm} from './word-docs.mjs';
import {mk} from './edit-docs.mjs';
import {p, r} from './build-docx.mjs';
import {wordHf, picRun} from './hf-fixtures.mjs';
import {pngBytes} from './pic-fixtures.mjs';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {eachPage, paginate, SLICE_MS}
  from '../../tools/moreapps/!Letters/PagesRun';

const tick = (cb) => setImmediate(cb);
const A4 = {width: 209.90277777777777, height: 297.0388888888889,
  landscape: false};
const SAMPLE = 10;                     // (one file in SAMPLE)
const POS = 0.01;                      // (px: a run's place)
const EACH_MS = 20000;
const HEAP_MB = 64;
const ABORT_MS = 1000;               // (generous: a loaded machine)

// ------------------------------------------------- recording canvas

/** A 2D context recording each paint's fillText as {text, x, y} in
 *  device px (a paint begins at an identity setTransform), measuring
 *  with measure(css, text). */
function rec(paints, canvas, measure) {
  const st = {font: '10px sans-serif', fillStyle: '#000000',
    strokeStyle: '#000000', globalAlpha: 1, lineWidth: 1,
    textAlign: 'start', textBaseline: 'alphabetic', canvas};
  let m = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]];
  const fin = (...v) => v.every(Number.isFinite);
  const fns = {
    save: () => stack.push([m, {...st}]),
    restore: () => {
      const s = stack.pop();
      if (s) { m = s[0]; Object.assign(st, s[1]); }
    },
    setTransform: (a, b, c, d, e, f) => {
      m = [a, b, c, d, e, f];
      if (a === 1 && b === 0 && c === 0 && d === 1 && !e && !f) {
        paints.push([]);
      }
    },
    transform: (...t) => { m = mul(m, t); },
    scale: (x, y) => { m = mul(m, [x, 0, 0, y, 0, 0]); },
    translate: (x, y) => { m = mul(m, [1, 0, 0, 1, x, y]); },
    rotate: (a) => { m = mul(m, [Math.cos(a), Math.sin(a),
      -Math.sin(a), Math.cos(a), 0, 0]); },
    getTransform: () => ({a: m[0], b: m[1], c: m[2], d: m[3],
      e: m[4], f: m[5]}),
    measureText: (t) => ({width: measure(st.font, String(t)),
      actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2}),
    getLineDash: () => [],
    createLinearGradient: () => ({addColorStop() {}}),
    createPattern: () => ({}),
    fillText: (text, x, y, maxWidth) => {
      const t = String(text);
      if (!t || !fin(x, y) || !(st.globalAlpha > 0)) return;
      if (maxWidth !== undefined && !(maxWidth > 0)) return;
      if (!paints.length) paints.push([]);
      paints.at(-1).push({text: t, x: m[0] * x + m[2] * y + m[4],
        y: m[1] * x + m[3] * y + m[5], style: st.fillStyle});
    },
  };
  return new Proxy({}, {
    get: (o, k) => (k in fns ? fns[k] : k in st ? st[k]
      : k === 'link' || typeof k === 'symbol' ? undefined
        : () => {}),
    set: (o, k, v) => { st[k] = v; return true; },
  });
}

/** canvasFactory: made [{w, h, paints}], live the canvases not yet
 *  released (both sides set to 0), most the most live at once. */
function factory(measure = (css, t) => 6 * t.length, hook) {
  const out = {made: [], live: 0, most: 0};
  out.make = (w, h) => {
    const paints = [];
    let cw = w, ch = h, alive = true;
    const canvas = {
      get width() { return cw; },
      set width(v) { cw = v; gone(); },
      get height() { return ch; },
      set height(v) { ch = v; gone(); },
      getContext: () => rec(paints, canvas, measure),
      toDataURL: () => 'data:image/jpeg;base64,' + out.made.length,
    };
    function gone() {
      if (alive && cw === 0 && ch === 0) { alive = false; out.live--; }
    }
    out.live++;
    out.most = Math.max(out.most, out.live);
    const r = {w, h, paints, canvas};
    out.made.push(r);
    if (hook) hook(r, out.made.length);
    return canvas;
  };
  return out;
}

/** A canvas's last paint as the PDF sees it: fillText in page px. */
const lastPaint = (c, px) => (c.paints.at(-1) || []).map((e) => ({
  text: e.text, x: e.x / (c.w / px[0]), y: e.y / (c.h / px[1]),
  style: e.style}));

// ------------------------------------------------------- the corpus

/** Every .docx under dir, sorted. */
function find(dir, out = []) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const q = path.join(dir, e.name);
    if (e.isDirectory()) find(q, out);
    else if (e.name.toLowerCase().endsWith('.docx') &&
      !e.name.startsWith('~$')) out.push(q);
  }
  return out.sort();
}

const files = fs.existsSync(CORPUS) ? find(CORPUS)
  .filter((f) => hash(nameOf(f)) % SAMPLE === 0) : [];

/** The PDF's pages (from..to) as recorded: [[{text, at}]], or the
 *  error's message. */
async function pdfPages(dw, range) {
  const rc = recorder();
  try {
    const res = await exportPdf(dw, {loader: bundled(), raf: tick,
      rasterise: raster, now: () => new Date(Date.UTC(2026, 0, 1)),
      ...range});
    assert.equal(rc.pages.length, res.pages);
    return rc.pages;
  } catch (e) {
    return e.message;
  } finally {
    rc.stop();
  }
}

/** The printed pages (from..to): {f (the factory), res} or the
 *  error's message. */
async function printed(dw, range) {
  const m = dw.L.metrics;
  const f = factory((css, t) => m.width(t, css));
  const decode = (bytes, mime, info) => Promise.resolve({
    width: info && info.w || 1, height: info && info.h || 1,
    close() {}});
  try {
    const res = await renderPages(dw, {paper: A4, fit: true,
      raf: tick, canvasFactory: f.make, decode, fonts: null,
      ...range});
    return {f, res};
  } catch (e) {
    return e.message;
  }
}

const sizes = (dw) => {
  const {pages} = dw;
  return (i) => {
    const pg = pages.at(i), s = pg.size;
    const tw = s && s.w > 0 && s.h > 0 ? s
      : {w: pg.w * 15, h: pg.h * 15};
    return [tw.w, tw.h].map((v) => Math.min(14400, Math.max(3,
      Number.isFinite(v / 20) ? v / 20 : 3)) * 4 / 3);
  };
};

describe('PrintPages over the corpus', {
  skip: files.length ? false : SKIP_CORPUS,
  timeout: 30 * 60 * 1000}, () => {
  const docs = [];
  let totals = null;
  before(loadStyles);

  it('the pages printed are the pages exported, the same text in ' +
    'the same places (one painter)', async () => {
    let pages = 0, canvases = 0, reduced = 0, runs = 0;
    const bad = [];
    for (const file of files) {
      const name = nameOf(file);
      let doc;
      try {
        doc = await readDocx(fs.readFileSync(file));
      } catch (e) {
        if (e instanceof DocxError) continue;
        throw e;
      }
      const dw = windowOf(doc);
      const n = dw.pages.count;
      docs.push({name, file, pages: n});
      const pxOf = sizes(dw);
      const ranges = [{}, {from: 1, to: 1}, {from: 2, to: 3},
        {from: n, to: n + 5}, {from: n + 1, to: n + 2}];
      for (const range of ranges) {
        const what = `${name} ${JSON.stringify(range)}`;
        const want = await pdfPages(dw, range);
        const got = await printed(dw, range);
        if (typeof want === 'string' || typeof got === 'string') {
          assert.equal(typeof got === 'string' ? got
            : 'printed ' + got.res.count, typeof want === 'string'
            ? (want === 'No pages to export' ? 'No pages to print.'
              : want) : 'exported ' + want.length, what);
          continue;
        }
        const {f, res} = got;
        assert.equal(res.count, want.length, what + ': pages');
        assert.equal(f.made.length, res.count, what + ': canvases');
        assert.ok(f.most <= 1, what + ': ' + f.most + ' alive');
        const a = Math.max(1, range.from || 1);
        if (!range.from) {
          pages += res.count;
          canvases += f.made.length;
        }
        want.forEach((pg, k) => {
          const c = f.made[k], px = pxOf(a - 1 + k);
          const mine = lastPaint(c, px);
          if (!range.from) {
            runs += pg.length;
            const full = res.pages[k].w / 25.4 * dpiFor(res.count);
            if (c.w < full - 1) reduced++;
          }
          const ta = pg.map((x) => x.text), tb = mine.map((x) =>
            x.text);
          if (ta.join('\0') !== tb.join('\0')) {
            bad.push(`${what} page ${a + k}: ${JSON.stringify(
              diffOf(ta, tb))}`);
            return;
          }
          pg.forEach((x, j) => {
            const dx = Math.abs(x.at[0] - mine[j].x);
            const dy = Math.abs(x.at[1] - mine[j].y);
            if (!(dx <= POS && dy <= POS)) {
              bad.push(`${what} page ${a + k} run ${j} ` +
                `${JSON.stringify(x.text)}: ${dx}, ${dy} px`);
            }
          });
        });
      }
    }
    totals = {files: docs.length, pages, canvases, reduced, runs};
    console.log(`# printed ${docs.length} files (one in ${SAMPLE}): ` +
      `${pages} pages, ${canvases} canvases, ${reduced} pages at a ` +
      `reduced dpi, ${runs} runs compared with the PDF's; ` +
      `${bad.length} differences`);
    for (const l of bad.slice(0, 10)) console.log('#   ' + l);
    assert.deepEqual(bad, []);
    assert.ok(docs.length > 10, 'a sample');
  });

  it('prepared in steps (a frame after each layout): the same pages ' +
    'as paginate at once', async () => {
    let n = 0, frames = 0;
    for (const file of files) {
      let doc;
      try {
        doc = await readDocx(fs.readFileSync(file));
      } catch (e) {
        if (e instanceof DocxError) continue;
        throw e;
      }
      const dw = windowOf(doc);
      let t = 0, got = null;
      await eachPage(dw, {clock: () => (t += SLICE_MS),
        raf: (cb) => { frames++; setImmediate(cb); },
        onPages: ({P}) => { got = P; }}, () => {});
      const want = paginate(dw).P;
      const fp = (P) => JSON.stringify(P.list.map((pg) => [pg.start,
        pg.end, pg.cols]));
      assert.equal(fp(got), fp(want), nameOf(file));
      n++;
    }
    console.log(`# prepared in steps: ${n} files, ${frames} frames`);
    assert.ok(n > 10, 'a sample');
  });

  it('the largest of the sample: under 20 s (least of 3 after a ' +
    'warm-up)', async (t) => {
    if (!totals) return t.skip('no sample');
    const big = docs.reduce((a, d) => (d.pages > a.pages ? d : a),
      {pages: 0});
    const dw = windowOf(await readDocx(fs.readFileSync(big.file)));
    const times = [];
    for (let k = 0; k < 4; k++) {
      const t0 = performance.now();
      const got = await printed(dw, {});
      times.push(performance.now() - t0);
      assert.equal(got.res.count, big.pages);
    }
    const best = Math.min(...times.slice(1));
    console.log(`# largest of the sample: ${big.name}, ${big.pages} ` +
      `pages: ${Math.round(best)} ms (runs ${times.map(Math.round)
        .join(', ')}; a fake canvas: the layout and the painting, ` +
      `no pixels)`);
    assert.ok(best < EACH_MS, `${big.name}: ${best} ms`);
  });
});

/** The first place two string lists part, with a little of each. */
function diffOf(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return {at: i, pdf: a.slice(i, i + 3), canvas: b.slice(i, i + 3),
    lengths: [a.length, b.length]};
}

// ---------------------------------------------------- hostile sizes

/** A window as a page run reads one (PagesRun paginate). */
const winOf = (d) => ({d, doc: d.doc, L: {metrics: tm(),
  width: 800}, markup: 'final', viewName: 'draft'});

/** A document of sections, each [w, h] twips with its text. */
function sectionsDoc(list) {
  const d = mk(list.map(([, , t]) => t));
  const [s0] = d.doc.sections;
  const all = s0.blocks;
  d.doc.sections = list.map(([w, h], k) => ({...s0, blocks: [all[k]],
    props: {...s0.props, pgSz: {w, h}}}));
  return d;
}

const pagesDoc = (n) => mk(Array.from({length: n}, (_, i) => (i
  ? [`Page ${i + 1}`, {pPr: {pageBreakBefore: true}}] : 'Page 1')));

const heapMb = () => (typeof process === 'object' &&
  typeof process.memoryUsage === 'function'
  ? process.memoryUsage().heapUsed / 1048576 : null);

/** Every canvas bounded, one alive at most, all released. */
function bounded(f, what) {
  for (const c of f.made) {
    assert.ok(c.w >= 1 && c.h >= 1 && c.w <= MAX_SIDE &&
      c.h <= MAX_SIDE && c.w * c.h <= MAX_AREA,
    `${what}: ${c.w} x ${c.h}`);
    assert.equal(c.canvas.width, 0, what + ': released');
  }
  assert.ok(f.most <= 1, `${what}: ${f.most} alive at once`);
  assert.equal(f.live, 0, what + ': left alive');
}

/** The progress calls never go back (done, then total, in order). */
function monotonic(prog, what) {
  for (let i = 1; i < prog.length; i++) {
    const [k0, n0] = prog[i - 1], [k, n] = prog[i];
    assert.ok(k >= k0 && (n0 === 0 || n === n0) && k <= n,
      `${what}: ${JSON.stringify(prog[i - 1])} then ` +
      JSON.stringify(prog[i]));
  }
}

describe('PrintPages at hostile sizes', () => {
  before(loadStyles);

  it('a 1 x 1 pt page and a 14400 x 14400 pt one: bounded canvases',
    async () => {
      for (const fit of [true, false]) {
        const d = sectionsDoc([[20, 20, 'tiny'],
          [288000, 288000, 'huge'], [11906, 16838, 'A4']]);
        const f = factory();
        const prog = [];
        const res = await renderPages(winOf(d), {paper: A4, fit,
          raf: tick, canvasFactory: f.make,
          onProgress: (...a) => prog.push(a)});
        const what = 'fit ' + fit;
        assert.ok(res.count >= 3, what + ': ' + res.count);
        bounded(f, what);
        monotonic(prog, what);
        for (const b of res.pages) {
          for (const k of ['x', 'y', 'w', 'h']) {
            assert.ok(Number.isFinite(b[k]), `${what} ${k}`);
          }
          if (fit) {
            assert.ok(b.x >= -1e-9 && b.y >= -1e-9 &&
              b.x + b.w <= 209.9 + 1e-9 && b.y + b.h <= 297 + 1e-9,
            JSON.stringify(b));
          }
        }
        const text = f.made.map((c) => lastPaint(c, [1, 1])
          .map((e) => e.text).join(' ')).join(' | ');
        for (const t of ['tiny', 'huge', 'A4']) {
          assert.ok(text.includes(t), `${what}: ${t} in ${text}`);
        }
      }
    });

  it('200 pages: 150 dpi, one canvas alive at a time, the heap ' +
    'sane, progress forward', async (t) => {
    const dw = winOf(pagesDoc(200));
    const f = factory();
    const prog = [];
    if (typeof global.gc === 'function') global.gc();
    const h0 = heapMb();
    const res = await renderPages(dw, {paper: A4, fit: true,
      raf: tick, canvasFactory: f.make,
      onProgress: (...a) => prog.push(a)});
    if (typeof global.gc === 'function') global.gc();
    const h1 = heapMb();
    assert.equal(res.count, 200);
    bounded(f, '200 pages');
    monotonic(prog, '200 pages');
    assert.deepEqual(prog.at(-1), [200, 200, 'pages']);
    // 150 dpi across the A4 paper's 209.9 mm
    assert.ok(Math.abs(f.made[0].w - 209.9 / 25.4 * 150) < 2,
      f.made[0].w);
    if (h0 === null) return t.diagnostic('no process.memoryUsage');
    console.log(`# 200 pages: heap ${h0.toFixed(1)} -> ` +
      `${h1.toFixed(1)} MB`);
    assert.ok(h1 - h0 < HEAP_MB, `heap grew ${h1 - h0} MB`);
  });

  /** ms from ctrl.abort() to the result, which must be null. */
  async function stopIn(dw, opts, at = 20) {
    const ctrl = new AbortController();
    // (each page 1 ms of work, as a real one takes 10 or more)
    const f = factory(undefined, () => {
      const t = performance.now();
      while (performance.now() - t < 1);
    });
    const prog = [];
    let t0 = 0;
    const run = renderPages(dw, {paper: A4, raf: tick,
      canvasFactory: f.make, signal: ctrl.signal,
      onProgress: (...a) => prog.push(a), ...opts});
    setTimeout(() => { t0 = performance.now(); ctrl.abort(); }, at);
    const res = await run;
    const ms = performance.now() - t0;
    assert.equal(res, null);
    assert.ok(t0 > 0, 'stopped before the end');
    monotonic(prog, 'stopped');
    for (const c of f.made) assert.equal(c.canvas.width, 0);
    assert.ok(f.most <= 1);
    return ms;
  }

  it('Cancel during 200 pages: answered at once', async () => {
    const ms = await stopIn(winOf(pagesDoc(200)), {}, 15);
    console.log(`# stopped during 200 pages: null ${ms.toFixed(1)} ms ` +
      'after the signal');
    assert.ok(ms < ABORT_MS, `${ms} ms`);
  });

  it('Cancel while a picture is being decoded (a decode that never ' +
    'ends): answered at once', async () => {
    const doc = await readDocx(await wordHf({pic: pngBytes(4, 2),
      body: p(r('one')),
      default: {hdr: p(picRun('rIdP1') + r('Logo'))}}));
    const decode = () => new Promise(() => {});
    const ms = await stopIn(winOf(new Document(doc)), {decode});
    console.log(`# stopped while decoding: null ${ms.toFixed(1)} ms ` +
      'after the signal');
    assert.ok(ms < ABORT_MS, `${ms} ms`);
  });

  it('Cancel while the faces load (never): answered at once',
    async () => {
      const fonts = {status: 'loading', ready: new Promise(() => {}),
        load: () => new Promise(() => {})};
      const ms = await stopIn(winOf(pagesDoc(2)), {fonts});
      assert.ok(ms < ABORT_MS, `${ms} ms`);
    });
});

// ---------------------------------------------- fitPlacement, random

/** A seeded generator (mulberry32) -> [0, 1). */
function seeded(s) {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('PrintPages fitPlacement, random sizes', () => {
  it('finite, within the paper with fit on, centred', () => {
    const rnd = seeded(20261103);
    // sizes from 0.01 mm to 10 m, and a few that are not sizes
    const size = () => {
      const u = rnd();
      if (u < 0.03) return [0, -1, NaN, Infinity, 1e300][
        Math.floor(rnd() * 5)];
      return 10 ** (rnd() * 6 - 2);
    };
    for (let i = 0; i < 20000; i++) {
      const o = {pageW: size(), pageH: size(), paperW: size(),
        paperH: size(), fit: rnd() < 0.5};
      const b = fitPlacement(o);
      const what = JSON.stringify(o);
      for (const k of ['x', 'y', 'w', 'h']) {
        assert.ok(Number.isFinite(b[k]), `${what}: ${k} ${b[k]}`);
      }
      assert.ok(b.w > 0 && b.h > 0, what);
      // the paper as fitPlacement takes it: centred on it
      const pw = b.x * 2 + b.w, ph = b.y * 2 + b.h;
      const ok = (v) => (v > 0 && Number.isFinite(v) ? Math.min(v,
        5080) : null);
      if (ok(o.paperW)) {
        assert.ok(Math.abs(pw - ok(o.paperW)) <= 1e-9 * pw, what);
      }
      if (ok(o.paperH)) {
        assert.ok(Math.abs(ph - ok(o.paperH)) <= 1e-9 * ph, what);
      }
      if (o.fit) {
        const e = 1e-9 * Math.max(pw, ph);
        assert.ok(b.x >= -e && b.y >= -e && b.w <= pw + e &&
          b.h <= ph + e, what);
        // one side touches the paper
        assert.ok(Math.abs(b.w - pw) <= e || Math.abs(b.h - ph) <= e,
          what);
      }
    }
  });
});
