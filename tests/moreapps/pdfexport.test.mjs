// PdfExport (Batch G1, task 7): a window's document written as a PDF
// of its Print layout pages, laid out apart from the window. The
// pages' text is read back from the file by a small reader here (the
// content streams inflated, each Tj's hex decoded through its font's
// ToUnicode CMap) and, where poppler's pdftotext is installed, by it
// too (an independent oracle; skipped when absent). The window's
// layout, pages, undo stack and saved state are compared before and
// after. Pictures go through a fake rasterise; slices through a fake
// raf and clock. Layouts use the fake text metrics (tm): nothing
// here asserts the spacing of the glyphs, but that the runs are
// fitted (a Tc) to the measure (by default the layout's metrics).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {exportPdf, picsOf, uriOf, measureOf, SLICE_MS, sizeOf}
  from '../../tools/moreapps/!Letters/PdfExport';
import {fileLoader} from '../../tools/moreapps/!Letters/PdfFiles';
import {PdfSink} from '../../tools/moreapps/!Letters/PdfSink';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {loadStyles, tm} from './word-docs.mjs';
import {mk} from './edit-docs.mjs';
import {buildDocx, documentXml, p, r, REL, R_NS}
  from './build-docx.mjs';
import {wordHf, picRun} from './hf-fixtures.mjs';
import {pngBytes, jpegGray, drawingXml, URIS}
  from './pic-fixtures.mjs';
import {readPdf, objectsOf, latin1, squash, popplerPage,
  HAVE_PDFTOTEXT} from './pdf-read.mjs';
import {popplerTool} from '../../tools/lib/poppler.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../..');
const FONTS = path.join(ROOT, 'tools/moreapps/!Letters/Fonts');
const OUT = path.join(ROOT, 'tests/moreapps/word-check-out/pdfexport');

/** The real bundled fonts, as the disc's Fonts directory has them;
 *  reads counts each file read. */
function bundled() {
  const reads = [];
  const loader = fileLoader({dir: 'F', base: 'none',
    readBytes: async (name) => {
      reads.push(name);
      return new Uint8Array(fs.readFileSync(path.join(FONTS,
        name.slice(2))));
    },
    fetchBytes: async () => null});
  return {loader, reads};
}

const NOW = () => new Date(Date.UTC(2026, 10, 2, 12, 0, 0));
const tick = (cb) => setImmediate(cb);

/** A window as exportPdf reads one: its Document, layout (laid out
 *  for its view at 800 px), pages in Print layout, markup view. */
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

/** Paragraphs, one a page (a page break before each but the first). */
function pagesDoc(texts) {
  return mk(texts.map((t, i) => (i ? [t, {pPr: {pageBreakBefore:
    true}}] : t)));
}

/** bytes written to OUT/name (for pdftotext, and to look at). */
function save(name, bytes) {
  fs.mkdirSync(OUT, {recursive: true});
  const f = path.join(OUT, name);
  fs.writeFileSync(f, bytes);
  return f;
}

/** What a test can see of a window: references, and copies of the
 *  values inside them (a change in place shows too). */
function seen(dw) {
  const h = dw.d._h, L = dw.L, P = dw.pages;
  return {L, pages: P, place: L.place, metrics: L.metrics,
    pics: L.pics, fields: L.fields, width: L.width, floats: L.floats,
    markup: L.markup, height: L.height, itemsRef: L.items,
    items: L.items.map((it) => ({kind: it.kind, x: it.x, y: it.y,
      h: it.h, lines: it.lines ? it.lines.map((ln) => ({y: ln.y,
        h: ln.h, n: ln.items.length})) : null})),
    pagesDone: P && P.done, count: P && P.count,
    list: P && P.list.slice(),
    pageVals: P && P.list.map((pg) => JSON.stringify({start: pg.start,
      w: pg.w, h: pg.h, blank: pg.blank, num: pg.num})),
    undo: h.undo.slice(), redo: h.redo.slice(), dirty: dw.d.dirty,
    stateId: dw.d.stateId, canUndo: dw.d.canUndo,
    canRedo: dw.d.canRedo, markupView: dw.d.markup,
    winFields: structuredClone(dw.fields),
    doc: structuredClone(dw.d.doc)};
}

// ------------------------------------------------------------- tests

const TEXTS = ['Alpha first page', 'Bravo second page',
  'Charlie third page'];

describe('PdfExport: pages and text', () => {
  before(loadStyles);

  it('a three-page document gives three pages with their text',
    async () => {
      const {loader, reads} = bundled();
      const dw = windowOf(pagesDoc(TEXTS));
      const res = await exportPdf(dw, {loader, raf: tick, now: NOW});
      assert.equal(res.pages, 3);
      assert.deepEqual(res.notes, []);
      assert.equal(res.missing.size, 0);
      const pdf = readPdf(res.bytes);
      assert.deepEqual(pdf.pages.map((pg) => squash(pg.text)),
        TEXTS.map(squash));
      // A4 by default: 11906 x 16838 twips, in points
      for (const pg of pdf.pages) {
        assert.deepEqual(pg.box, [0, 0, 595.3, 841.9]);
      }
      assert.match(pdf.info, /\/Producer \(!Letters\)/);
      assert.match(pdf.info, /\/CreationDate \(D:20261102120000Z\)/);
      assert.doesNotMatch(pdf.info, /\/Title/);    // (empty: left out)
      // each face read once, and embedded once for all pages
      assert.equal(new Set(reads).size, reads.length);
      const fids = new Set(pdf.pages.flatMap((pg) =>
        [...pg.fonts.values()]));
      assert.equal(fids.size, 1);
    });

  it('pdftotext reads the same text on each page', {skip:
    !HAVE_PDFTOTEXT && 'pdftotext not installed'}, async () => {
    const {loader} = bundled();
    const texts = [...TEXTS, 'Delta: caf\u00e9 \u00e0 la cr\u00e8me'];
    const res = await exportPdf(windowOf(pagesDoc(texts)), {loader,
      raf: tick});
    const f = save('pages.pdf', res.bytes);
    texts.forEach((t, i) => {
      assert.equal(squash(popplerPage(f, i + 1)), squash(t),
        'page ' + (i + 1));
    });
  });

  it('a range: 2..2 one page; out-of-range ends clamped', async () => {
    const {loader} = bundled();
    const dw = windowOf(pagesDoc(TEXTS));
    let res = await exportPdf(dw, {from: 2, to: 2, loader, raf: tick});
    assert.equal(res.pages, 1);
    assert.deepEqual(readPdf(res.bytes).pages.map((pg) =>
      squash(pg.text)), [squash(TEXTS[1])]);
    res = await exportPdf(dw, {from: -4, to: 99, loader, raf: tick});
    assert.equal(res.pages, 3);
    res = await exportPdf(dw, {from: 3, loader, raf: tick});
    assert.deepEqual(readPdf(res.bytes).pages.map((pg) =>
      squash(pg.text)), [squash(TEXTS[2])]);
  });

  it('an empty or invalid range throws', async () => {
    const {loader} = bundled();
    const dw = windowOf(pagesDoc(TEXTS));
    for (const [from, to] of [[3, 2], [4, 9], [2, 0], [NaN, 2],
      [1, NaN]]) {
      await assert.rejects(exportPdf(dw, {from, to, loader, raf: tick}),
        {message: 'No pages to export'}, from + '..' + to);
    }
  });

  it('an empty document gives one blank page', async () => {
    const {loader} = bundled();
    const res = await exportPdf(windowOf(mk([''])), {loader,
      raf: tick});
    assert.equal(res.pages, 1);
    const pdf = readPdf(res.bytes);
    assert.equal(pdf.pages.length, 1);
    assert.equal(pdf.pages[0].text, '');
    assert.doesNotMatch(pdf.pages[0].content, /Tj/);
    if (HAVE_PDFTOTEXT) {
      assert.equal(squash(popplerPage(save('empty.pdf', res.bytes),
        1)), '');
    }
  });

  it('a character no font has: missing and a note, not an error',
    async () => {
      const {loader} = bundled();
      const res = await exportPdf(windowOf(mk(['Smile \u{1F600} ok'])),
        {loader, raf: tick});
      assert.equal(res.pages, 1);
      const set = res.missing.get('Carlito');      // (Normal's face)
      assert.ok(set && set.has(0x1F600),
        [...res.missing.keys()].join());
      assert.equal(set.size, 1);
      assert.deepEqual(res.notes, ['Carlito: 1 character not in the ' +
        'font (shown as an empty box)']);
      assert.match(readPdf(res.bytes).pages[0].text, /Smile.*ok/);
    });

  it('a font that could not be loaded: its own note, not "not in the font"',
    async () => {
      const {loader} = bundled();
      const bad = async (key) => (key.family === 'Carlito' ? null
        : loader(key));
      const res = await exportPdf(windowOf(mk(['Hello there'])),
        {loader: bad, raf: tick});
      assert.deepEqual(res.notes, ['The font Carlito could not be ' +
        'loaded: its 8 characters will not show']);
    });

  it('title and author from the core properties', async () => {
    const d = mk(['Body']);
    d.doc.parts.set('docProps/core.xml', new TextEncoder().encode(
      '<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties ' +
      'xmlns:cp="http://schemas.openxmlformats.org/package/2006/' +
      'metadata/core-properties" xmlns:dc="http://purl.org/dc/' +
      'elements/1.1/"><dc:title>Annual report</dc:title>' +
      '<dc:creator>Ann Smith</dc:creator></cp:coreProperties>'));
    const {loader} = bundled();
    const res = await exportPdf(windowOf(d), {loader, raf: tick});
    const info = readPdf(res.bytes).info;
    assert.match(info, /\/Title \(Annual report\)/);
    assert.match(info, /\/Author \(Ann Smith\)/);
  });
});

describe('PdfExport: progress, slices and cancel', () => {
  before(loadStyles);

  it('progress: preparing, then once per page up to (n, n)',
    async () => {
      const {loader} = bundled();
      const calls = [];
      await exportPdf(windowOf(pagesDoc(TEXTS)), {loader, raf: tick,
        onProgress: (...a) => calls.push(a)});
      assert.deepEqual(calls, [[0, 0, 'preparing'], [0, 3, 'pages'],
        [1, 3, 'pages'], [2, 3, 'pages'], [3, 3, 'pages'],
        [3, 3, 'writing']]);
    });

  it('yields to raf once the slice has had its 30 ms', async () => {
    const {loader} = bundled();
    assert.equal(SLICE_MS, 30);
    const texts = Array.from({length: 6}, (_, i) => 'Page ' + i);
    // a clock 10 ms on at each reading: a frame every few pages
    let t = 0, frames = 0;
    const clock = () => (t += 10);
    const raf = (cb) => { frames++; setImmediate(cb); };
    const res = await exportPdf(windowOf(pagesDoc(texts)), {loader,
      raf, clock});
    assert.equal(res.pages, 6);
    // (one frame is the Preparing pages one)
    assert.ok(frames >= 2 && frames < 7, String(frames));
    // a still clock: only the Preparing frame
    frames = 0;
    await exportPdf(windowOf(pagesDoc(texts)), {loader, raf,
      clock: () => 0});
    assert.equal(frames, 1);
  });

  it('aborted after the first slice: AbortError, no result',
    async () => {
      const {loader} = bundled();
      const ac = new AbortController();
      let t = 0, frames = 0;
      const done = [];
      const raf = (cb) => {
        frames++;
        if (frames > 1) ac.abort();   // (the first: Preparing pages)
        setImmediate(cb);
      };
      await assert.rejects(exportPdf(windowOf(pagesDoc(TEXTS)), {loader,
        raf, clock: () => (t += 100), signal: ac.signal,
        onProgress: (d, n, phase) => done.push(phase + d)}),
      (e) => e.name === 'AbortError');
      assert.equal(frames, 2);
      assert.deepEqual(done, ['preparing0', 'pages0', 'pages1']);
    });

  it('Preparing pages is shown (a frame yielded) before the layout',
    async () => {
      const {loader} = bundled();
      const log = [];
      const dw = windowOf(pagesDoc(TEXTS));
      // the layout starts when the window's metrics are first read
      const metrics = dw.L.metrics;
      Object.defineProperty(dw.L, 'metrics', {configurable: true,
        get() { log.push('layout'); return metrics; }});
      const raf = (cb) => { log.push('raf'); setImmediate(cb); };
      await exportPdf(dw, {loader, raf, clock: () => 0,
        onProgress: (k, n, phase) => {
          if (phase === 'preparing') log.push('preparing');
        }});
      assert.equal(log[0], 'preparing');
      assert.equal(log[1], 'raf');
      assert.ok(log.indexOf('layout') > 1, log.join());
    });

  it('aborted while Preparing yields: AbortError, nothing laid out',
    async () => {
      const {loader} = bundled();
      const ac = new AbortController();
      const done = [];
      const raf = (cb) => { ac.abort(); setImmediate(cb); };
      await assert.rejects(exportPdf(windowOf(pagesDoc(TEXTS)), {loader,
        raf, signal: ac.signal,
        onProgress: (d, n, phase) => done.push(phase)}),
      (e) => e.name === 'AbortError');
      assert.deepEqual(done, ['preparing']);
    });

  it('aborted before it starts: AbortError', async () => {
    const {loader} = bundled();
    const ac = new AbortController();
    ac.abort();
    await assert.rejects(exportPdf(windowOf(pagesDoc(TEXTS)), {loader,
      raf: tick, signal: ac.signal}), (e) => e.name === 'AbortError');
  });
});

describe('PdfExport: page sizes kept to the PDF limits', () => {
  before(loadStyles);

  it('sizeOf clamps each side to 3..14400 pt, px to match', () => {
    const big = sizeOf({size: {w: 1e9, h: 5e5}});
    assert.deepEqual(big.pt, [14400, 14400]);
    assert.deepEqual(big.px, [19200, 19200]);
    const tiny = sizeOf({size: {w: 20, h: 40}});
    assert.deepEqual(tiny.pt, [3, 3]);
    assert.deepEqual(tiny.px, [4, 4]);
    assert.deepEqual(sizeOf({size: {w: 11906, h: 16838}}).pt,
      [595.3, 841.9]);
  });

  for (const [name, w, h, box] of [['huge', 1e9, 1e9, [14400, 14400]],
    ['tiny', 20, 20, [3, 3]]]) {
    it(`a ${name} page gives a MediaBox within the limits`, async () => {
      const {loader} = bundled();
      const d = pagesDoc(['x']);
      const sec = d.doc.sections[0];
      sec.props = {...sec.props, pgSz: {w, h}};
      const res = await exportPdf(windowOf(d), {loader, raf: tick});
      assert.deepEqual(readPdf(res.bytes).pages[0].box,
        [0, 0, ...box]);
    });
  }
});

describe('PdfExport: the window left alone', () => {
  before(loadStyles);

  for (const view of ['print', 'draft']) {
    it('layout, pages, undo and saved state the same (' + view + ')',
      async () => {
        const d = pagesDoc(TEXTS);
        d.apply({op: 'replaceText', block: [0, 0], at: 0, del: 0,
          ins: 'X'});
        const dw = windowOf(d, {view});
        assert.ok(dw.d.canUndo && dw.d.dirty);
        const was = seen(dw);
        const {loader} = bundled();
        const res = await exportPdf(dw, {loader, raf: tick});
        assert.deepEqual(seen(dw), was);
        assert.equal(dw.L, was.L);
        assert.equal(dw.pages, was.pages);
        // the Print layout's pages, whatever the window shows
        assert.equal(res.pages, 3);
        assert.equal(squash(readPdf(res.bytes).pages[0].text),
          squash('X' + TEXTS[0]));
      });
  }

  it('the markup view: All Markup and Original as Final is not',
    async () => {
      const doc = await readDocx(await buildDocx({'word/document.xml':
        documentXml(p(r('kept ') + '<w:ins w:id="1" w:author="A" ' +
          'w:date="2026-01-01T00:00:00Z"><w:r><w:t>added</w:t></w:r>' +
          '</w:ins>' + '<w:del w:id="2" w:author="A" ' +
          'w:date="2026-01-01T00:00:00Z"><w:r><w:delText>gone' +
          '</w:delText></w:r></w:del>'))}));
      const d = new Document(doc);
      const {loader} = bundled();
      const text = async (markup) => squash(readPdf((await exportPdf(
        windowOf(d, {markup}), {loader, raf: tick})).bytes).pages[0]
        .text);
      assert.equal(await text('final'), 'keptadded');
      assert.equal(await text('original'), 'keptgone');
      assert.equal(await text('all'), 'keptaddedgone');
    });
});

describe('PdfExport: pictures', () => {
  before(loadStyles);

  it('the layout\'s pictures: one bitmap object per bytes', () => {
    const pics = picsOf();
    const a = new Uint8Array([1]), b = new Uint8Array([1]);
    const info = {w: 4, h: 2, mime: 'image/png'};
    const x = pics.get(a, 'image/png', info, 10);
    assert.equal(x.state, 'ready');
    assert.deepEqual({...x.bitmap, info: null}, {width: 4, height: 2,
      bytes: a, mime: 'image/png', info: null});
    assert.equal(pics.get(a, 'image/png', info, 400).bitmap, x.bitmap);
    assert.notEqual(pics.get(b, 'image/png', info, 10).bitmap,
      x.bitmap);
  });

  it('a header picture on every page is one XObject; PNG through ' +
    'rasterise, JPEG as it is', async () => {
    const body = p(r('one')) + p('<w:r><w:br w:type="page"/></w:r>' +
      r('two')) + p('<w:r><w:br w:type="page"/></w:r>' + r('three'));
    const doc = await readDocx(await wordHf({pic: pngBytes(4, 2), body,
      default: {hdr: p(picRun('rIdP1') + r('Logo')),
        ftr: p(r('Foot'))}}));
    const d = new Document(doc);
    const rasters = [];
    const rasterise = async (bm) => {
      rasters.push(bm);
      return {width: bm.width, height: bm.height,
        rgba: new Uint8ClampedArray(4 * bm.width * bm.height)
          .fill(200)};
    };
    const {loader} = bundled();
    const res = await exportPdf(windowOf(d), {loader, raf: tick,
      rasterise});
    assert.equal(res.pages, 3);
    assert.equal(rasters.length, 1);
    assert.equal(rasters[0].mime, 'image/png');
    const pdf = readPdf(res.bytes);
    const ims = new Set(pdf.pages.flatMap((pg) =>
      [...pg.xobjects.values()]));
    assert.equal(ims.size, 1);
    for (const pg of pdf.pages) {
      assert.match(pg.content, /\/Im1 Do/);
      assert.match(squash(pg.text), /Logo.*Foot/);
    }
    const im = pdf.objects.get([...ims][0]).dict;
    assert.match(im, /\/Subtype \/Image/);
    assert.match(im, /\/Width 4/);
    if (HAVE_PDFTOTEXT) {
      const f = save('header-picture.pdf', res.bytes);
      assert.equal(squash(popplerPage(f, 2)), 'LogotwoFoot');
    }

    // a JPEG: DCTDecode, never rasterised
    rasters.length = 0;
    const jdoc = await readDocx(await wordHf({pic: jpegGray(8, 8),
      body: p(r('one')),
      default: {hdr: p(picRun('rIdP1') + r('Logo'))}}));
    const jres = await exportPdf(windowOf(new Document(jdoc)), {loader,
      raf: tick, rasterise});
    assert.equal(rasters.length, 0);
    const jpdf = readPdf(jres.bytes);
    const jid = [...jpdf.pages[0].xobjects.values()][0];
    assert.match(jpdf.objects.get(jid).dict, /\/DCTDecode/);
  });

  it('a picture rasterise cannot read: left out, with a note',
    async () => {
      const doc = await readDocx(await wordHf({pic: pngBytes(4, 2),
        body: p(r('one')),
        default: {hdr: p(picRun('rIdP1') + r('Logo'))}}));
      const {loader} = bundled();
      const res = await exportPdf(windowOf(new Document(doc)), {loader,
        raf: tick, rasterise: async () => {
          throw new Error('cannot decode');
        }});
      assert.equal(res.pages, 1);
      assert.doesNotMatch(readPdf(res.bytes).pages[0].content, /Do/);
      assert.ok(res.notes.some((n) => /picture/i.test(n) &&
        /cannot decode/.test(n)), res.notes.join('|'));
    });
});

describe('PdfExport: the floating picture outline', () => {
  before(loadStyles);
  it('a floating picture shown in its paragraph: no dashed outline',
    async () => {
      // simplePos="1": an anchor not understood, so not placed: shown
      // in its paragraph, where the screen outlines it dashed
      const run = '<w:r>' + drawingXml({kind: 'anchor', embed: 'rId11',
        decl: false}).replace('simplePos="0"', 'simplePos="1"') +
        '</w:r>';
      const doc = await readDocx(await buildDocx({
        'word/document.xml': documentXml(p(r('before') + run +
          r('after')), {rNs: R_NS, rootAttrs:
          ` xmlns:wp="${URIS.wp}" xmlns:a="${URIS.a}" ` +
          `xmlns:pic="${URIS.pic}"`}),
        'word/media/image1.png': pngBytes(4, 2)},
      {docRels: [['rId11', REL('image'), 'media/image1.png']]}));
      const dw = windowOf(new Document(doc));
      assert.deepEqual(dw.pages.at(0).floats || [], []);
      const {loader} = bundled();
      const res = await exportPdf(dw, {loader, raf: tick,
        rasterise: async (bm) => ({width: bm.width, height: bm.height,
          rgba: new Uint8Array(4 * bm.width * bm.height)})});
      const pg = readPdf(res.bytes).pages[0];
      assert.match(pg.content, /\/Im1 Do/);
      assert.doesNotMatch(pg.content, /\] [-\d.]+ d/);
      assert.doesNotMatch(pg.content, /0\.376 0\.376 0\.376 RG/);
    });
});

// ------------------------------------------------------------- links

const PDFINFO = popplerTool('pdfinfo');
const HAVE_PDFINFO = !!PDFINFO;
const PDFTOHTML = popplerTool('pdftohtml');
const HAVE_PDFTOHTML = !!PDFTOHTML;
const PB = '<w:r><w:br w:type="page"/></w:r>';

/** A link run: to rel rIdL<n> (n a number) or to anchor n. */
const link = (text, n) => '<w:hyperlink ' + (typeof n === 'number'
  ? 'r:id="rIdL' + n + '"' : 'w:anchor="' + n + '"') + '><w:r><w:rPr>' +
  '<w:rStyle w:val="Hyperlink"/></w:rPr><w:t xml:space="preserve">' +
  text + '</w:t></w:r></w:hyperlink>';
const mark = (name, text) => '<w:bookmarkStart w:id="7" w:name="' +
  name + '"/>' + r(text) + '<w:bookmarkEnd w:id="7"/>';

/** A window of body, its links' targets urls[k] at rIdL<k + 1>. */
async function linkWindow(body, urls = []) {
  const doc = await readDocx(await buildDocx({'word/document.xml':
    documentXml(body, {rNs: R_NS})}, {docRels: urls.map((u, k) =>
    ['rIdL' + (k + 1), REL('hyperlink'), u, 'External'])}));
  return windowOf(new Document(doc));
}

/** The annotations of each page: [[{dict, rect, uri, dest}]]. */
function annotsOf(pdf) {
  const tree = pdf.objects.get(2).dict;
  const kids = [...tree.slice(tree.indexOf('/Kids')).matchAll(
    /(\d+) 0 R/g)].map((m) => Number(m[1]));
  return kids.map((id) => {
    const pd = pdf.objects.get(id).dict;
    const m = /\/Annots \[([^\]]*)\]/.exec(pd);
    if (!m) return [];
    return [...m[1].matchAll(/(\d+) 0 R/g)].map((x) => {
      const dict = pdf.objects.get(Number(x[1])).dict;
      const rect = /\/Rect \[([^\]]*)\]/.exec(dict)[1].split(' ')
        .map(Number);
      const u = /\/URI (\((?:[^()\\]|\\.)*\))/.exec(dict);
      const d = /\/Dest \[(\d+) 0 R \/Fit\]/.exec(dict);
      return {dict, rect, uri: u ? u[1] : null,
        dest: d ? kids.indexOf(Number(d[1])) : null,
        page: Number((/\/P (\d+) 0 R/.exec(dict) || [])[1])};
    });
  });
}

const inside = (rect, box) => rect[0] >= box[0] && rect[1] >= box[1] &&
  rect[2] <= box[2] && rect[3] <= box[3] && rect[2] > rect[0] &&
  rect[3] > rect[1];

describe('PdfExport: links (G1)', () => {
  before(loadStyles);

  it('a web link: a /Link annotation over it, /URI exact',
    async () => {
      const url = 'https://example.com/a?b=1&c=2#top';
      const dw = await linkWindow(p(r('Go to ') +
        link('the example site', 1) + r(' now.')), [url]);
      const {loader} = bundled();
      const res = await exportPdf(dw, {loader, raf: tick});
      const pdf = readPdf(res.bytes);
      const [an] = annotsOf(pdf);
      assert.equal(an.length, 1);
      const a = an[0];
      assert.match(a.dict, /^<< \/Type \/Annot \/Subtype \/Link /);
      assert.match(a.dict, /\/Border \[0 0 0\]/);
      assert.match(a.dict, /\/A << \/S \/URI \/URI \(https:/);
      assert.equal(a.uri, '(' + url + ')');
      assert.ok(inside(a.rect, pdf.pages[0].box), String(a.rect));
      // its own page; near the top margin (72 pt), a line high
      const kid = /\/Kids \[(\d+) 0 R/.exec(pdf.objects.get(2).dict);
      assert.equal(a.page, Number(kid[1]));
      assert.ok(a.rect[3] <= 841.9 - 60 && a.rect[3] > 700,
        String(a.rect));
      assert.ok(a.rect[3] - a.rect[1] < 30);
      assert.equal(squash(pdf.pages[0].text),
        squash('Go to the example site now.'));
      if (HAVE_PDFINFO) {
        const f = save('link.pdf', res.bytes);
        const out = execFileSync(PDFINFO, ['-url', f],
          {encoding: 'utf8'});
        assert.match(out, new RegExp('^\\s*1\\s+Annotation\\s+' +
          url.replace(/[?.]/g, '\\$&') + '$', 'm'));
      }
      if (HAVE_PDFTOTEXT) {
        assert.equal(squash(popplerPage(save('link.pdf', res.bytes),
          1)), squash('Go to the example site now.'));
      }
    });

  it('a link wrapped over lines: one annotation per line', async () => {
    const words = Array.from({length: 60}, (_, i) => 'word' + i)
      .join(' ');
    const dw = await linkWindow(p(link(words, 1)),
      ['https://example.com/long']);
    const {loader} = bundled();
    const pdf = readPdf((await exportPdf(dw, {loader, raf: tick}))
      .bytes);
    const an = annotsOf(pdf)[0];
    assert.ok(an.length >= 2, String(an.length));
    for (const a of an) {
      assert.equal(a.uri, '(https://example.com/long)');
      assert.ok(inside(a.rect, pdf.pages[0].box));
    }
    for (let k = 1; k < an.length; k++) {
      assert.ok(an[k].rect[3] <= an[k - 1].rect[1] + 1e-6,
        'line ' + k + ' below line ' + (k - 1));
    }
  });

  it('hostile addresses: other schemes dropped, the rest escaped',
    async () => {
      const urls = ['javascript:alert(1)', 'file:///etc/passwd',
        ' JavaScript:alert(1)',
        'data:text/html,<b>', 'https://a.example/(p)\\q',
        'https://例え.jp/café x', 'mailto:ann@example.com',
        'FTP://f.example/', 'HTTP://b.example/', 'vbscript:x',
        'relative/page.html', ''];
      const body = urls.map((u, k) => p(link('L' + k, k + 1))).join('');
      const dw = await linkWindow(body, urls);
      const {loader} = bundled();
      const res = await exportPdf(dw, {loader, raf: tick});
      const pdf = readPdf(res.bytes);
      assert.deepEqual(annotsOf(pdf)[0].map((a) => a.uri), [
        '(https://a.example/\\(p\\)%5Cq)',
        '(https://%E4%BE%8B%E3%81%88.jp/caf%C3%A9%20x)',
        '(mailto:ann@example.com)', '(ftp://f.example/)',
        '(http://b.example/)']);
      // the file's own text: nothing hostile in it
      const all = latin1(res.bytes);
      assert.doesNotMatch(all, /javascript|JavaScript|vbscript|\/JS/);
      assert.doesNotMatch(all, /\/Launch|file:|data:/);
      // every link's text still drawn
      assert.equal(squash(pdf.pages[0].text), urls.map((u, k) =>
        'L' + k).join(''));
    });

  it('uriOf: the address as a /URI takes it, or null', () => {
    const ok = [['https://a.example/', 'https://a.example/'],
      ['  http://a.example/  ', 'http://a.example/'],
      ['mailto:a@b.example', 'mailto:a@b.example'],
      ['ftp://f.example/x', 'ftp://f.example/x'],
      ['https://a.example/\u00e9', 'https://a.example/%C3%A9'],
      ['https://a.example/\u{1F600}', 'https://a.example/%F0%9F%98%80'],
      ['https://a.example/a b', 'https://a.example/a%20b'],
      ['https://a.example/(x)', 'https://a.example/(x)'],
      ['HTTPS://a.example/\\', 'https://a.example/%5C'],
      ['www.a.example', 'http://www.a.example']];
    for (const [u, want] of ok) assert.equal(uriOf(u), want, u);
    for (const u of ['javascript:alert(1)', 'JAVASCRIPT:x', 'file:///x',
      'data:,x', 'https://a.example/x\u0001y', 'https://a.example/a\tb',
      'https://a.example/a\nb', 'https://a.example/\u007f',
      'https://a.example/\u0085', 'https://a.example/\ud800',
      'java\u0000script:x', 'https:', 'mailto:', 'x', '', null, 7,
      'httpsx://a', ' javascript:x', 'https//a.example']) {
      assert.equal(uriOf(u), null, JSON.stringify(u));
    }
  });

  it('a bookmark link: /Dest its page, later or earlier', async () => {
    const body = p(r('See ') + link('part three', 'Three') +
      r(' and ') + link('nothing', 'NoSuchMark')) +
      p(PB + r('two')) + p(PB + mark('Three', 'three') + r(' ') +
      link('back to the top', 'Top')) + p(PB + r('four'));
    const dw = await linkWindow(p(mark('Top', 'Title')) + p(r('x')) +
      body);
    const {loader} = bundled();
    const all = await exportPdf(dw, {loader, raf: tick});
    let pdf = readPdf(all.bytes);
    // (the first p: the Title bookmark's paragraph)
    assert.equal(pdf.pages.length, 4);
    let an = annotsOf(pdf);
    assert.deepEqual(an.map((x) => x.map((a) => a.dest)),
      [[2], [], [0], []]);
    for (const a of an.flat()) {
      assert.equal(a.uri, null);
      assert.doesNotMatch(a.dict, /\/A /);
    }
    if (HAVE_PDFTOHTML) {
      // poppler's reading of the links: to page 3, and to page 1
      const out = execFileSync(PDFTOHTML, ['-xml', '-stdout', '-i',
        save('bookmarks.pdf', all.bytes)], {encoding: 'utf8'});
      const hrefs = [...out.matchAll(/<a href="[^"#]*#(\d+)"/g)]
        .map((m) => Number(m[1]));
      assert.deepEqual(hrefs, [3, 1]);
    }
    // a range without the bookmark's page: that link dropped
    pdf = readPdf((await exportPdf(dw, {from: 1, to: 2, loader,
      raf: tick})).bytes);
    assert.deepEqual(annotsOf(pdf).map((x) => x.length), [0, 0]);
    pdf = readPdf((await exportPdf(dw, {from: 3, to: 4, loader,
      raf: tick})).bytes);
    assert.deepEqual(annotsOf(pdf).map((x) => x.length), [0, 0]);
    pdf = readPdf((await exportPdf(dw, {from: 1, to: 3, loader,
      raf: tick})).bytes);
    an = annotsOf(pdf);
    assert.deepEqual(an.map((x) => x.map((a) => a.dest)),
      [[2], [], [0]]);
  });

  it('no links: no annotations', async () => {
    const {loader} = bundled();
    const res = await exportPdf(windowOf(pagesDoc(TEXTS)), {loader,
      raf: tick});
    assert.doesNotMatch(latin1(res.bytes), /\/Annot/);
  });

  it('the pages painted the same as without links', async () => {
    const dw = await linkWindow(p(r('Go to ') + link('the site', 1) +
      r(' or ') + link('there', 'M')) + p(mark('M', 'here')),
    ['https://example.com/']);
    const {loader} = bundled();
    const a = readPdf((await exportPdf(dw, {loader, raf: tick,
      now: NOW})).bytes);
    const was = Object.getOwnPropertyDescriptor(PdfSink.prototype,
      'link');
    delete PdfSink.prototype.link;
    let b;
    try {
      b = readPdf((await exportPdf(dw, {loader, raf: tick, now: NOW}))
        .bytes);
    } finally {
      Object.defineProperty(PdfSink.prototype, 'link', was);
    }
    assert.equal(annotsOf(a)[0].length, 2);
    assert.equal(annotsOf(b)[0].length, 0);
    assert.deepEqual(a.pages.map((pg) => pg.content),
      b.pages.map((pg) => pg.content));
    assert.deepEqual(a.pages.map((pg) => pg.text),
      b.pages.map((pg) => pg.text));
  });
});

describe('PdfExport: runs fitted to the screen\'s widths (9b-2)',
  () => {
  before(loadStyles);

  /** The BT lines of every page. */
  const bts = (res) => readPdf(res.bytes).pages.flatMap((pg) =>
    pg.content.split('\n').filter((l) => l.startsWith('BT ')));

  it('by default the window\'s text metrics measure each run',
    async () => {
      const {loader} = bundled();
      const dw = windowOf(pagesDoc(TEXTS));
      const asked = [], width = dw.L.metrics.width;
      dw.L.metrics.width = function (t, css) {
        asked.push([css, t]);
        return width.call(this, t, css);
      };
      let res;
      try {
        res = await exportPdf(dw, {loader, raf: tick, now: NOW});
      } finally {
        delete dw.L.metrics.width;
      }
      assert.equal(typeof measureOf(dw), 'function');
      // the painted runs: each measured in the font it was drawn in
      for (const t of TEXTS) {
        assert.ok(asked.some(([css, x]) => x === t &&
          css.includes('px')), t);
      }
      // (the fake metrics are not the fonts' advances: fitted)
      assert.ok(bts(res).some((l) => l.endsWith(' Tj 0 Tc ET')));
    });

  it('an injected measure: Tc in the page; null: none', async () => {
    const {loader} = bundled();
    const dw = windowOf(pagesDoc(TEXTS));
    const asked = [];
    const res = await exportPdf(dw, {loader, raf: tick, now: NOW,
      measure: (css, t) => {
        asked.push(t);
        return dw.L.metrics.width(t, css) * 1.01;
      }});
    assert.ok(asked.includes(TEXTS[0]));
    const a = bts(res).filter((l) => l.includes(' Tc '));
    assert.ok(a.length >= TEXTS.length, a.join('\n'));
    const none = await exportPdf(dw, {loader, raf: tick, now: NOW,
      measure: null});
    assert.deepEqual(bts(none).filter((l) => l.includes(' Tc ')), []);
    assert.deepEqual(readPdf(none.bytes).pages.map((pg) => pg.text),
      readPdf(res.bytes).pages.map((pg) => pg.text));
  });

  it('measureOf: without metrics, an OffscreenCanvas, cached',
    () => {
      const was = globalThis.OffscreenCanvas;
      const fonts = [];
      let n = 0;
      globalThis.OffscreenCanvas = class {
        getContext() {
          return {set font(v) { fonts.push(v); },
            measureText: (t) => ({width: (n++, t.length * 7)})};
        }
      };
      try {
        const m = measureOf({L: {}});
        assert.equal(m('12px x', 'abc'), 21);
        assert.equal(m('12px x', 'abc'), 21);
        assert.equal(m('13px x', 'abc'), 21);
        assert.equal(n, 2);
        assert.deepEqual(fonts, ['12px x', '13px x']);
        delete globalThis.OffscreenCanvas;
        assert.equal(measureOf({}), null);
      } finally {
        globalThis.OffscreenCanvas = was;
        if (was === undefined) delete globalThis.OffscreenCanvas;
      }
    });
});
