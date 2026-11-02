// PdfExport over the corpus (Batch G1, task 9; the files are
// optional and git-ignored: tests/moreapps/corpus, see
// tools/moreapps-corpus.mjs). Every file (about 850 take some 80 s
// in all, the drift's second export included). Each file the reader
// opens is laid out in Print layout with the real fonts' advances
// (pdf-docs metrics) and exported with the real fonts (pdf-docs
// bundled), its runs fitted to those metrics (the default measure):
//
// 1. It exports without throwing, each in under 20 s; the PDF has as
//    many pages as the window's Print layout (settled); each
//    page's text, read back from the file (pdf-read readPdf: each
//    Tj through its font's ToUnicode), is the text the painters drew
//    on that page (pdf-docs recorder: every fillText that wrote a
//    Tj), white space ignored and the characters no font has (the
//    export's missing) left out.
//    An independent reader on a sample (one file in ten by a hash
//    of its name, the largest, and FEATURED: tables, columns,
//    headers, footnotes, links): pdftotext's text of each page is
//    the text the painters drew there (white space and the missing
//    left out); a character dropped, added or read as another fails
//    (pdfcheck.test proves it on a ToUnicode entry changed).
//    pdftotext reads with -raw (the content stream's order, so the
//    text is compared in order, as a string: no reading order, no
//    end-of-line hyphens taken away, no text drawn twice in one
//    place dropped) and a crop area far past the page, since the
//    layout draws some text past the page's edge (a row taller than
//    the page, a long line of code). Printed, as findings of the
//    layout: how many runs the painters drew twice in one place
//    (the same text within half a px: copied or searched in a
//    reader it comes twice) and how many start off the page.
//    poppler (tools/pdf-check.mjs: pdfinfo and pdftotext, skipped
//    when not installed) reads every file with nothing on stderr
//    and the same page count (the files are left in
//    tests/moreapps/word-check-out/pdfcorpus, numbered in order).
// 2. Text width drift: on the desktop a run's place in its line was
//    measured by the browser (canvas measureText, kerning on), and
//    PdfSink fits each run to the width the screen measured it at
//    (its Fitting: a Tc). The browser is Chromium (Playwright,
//    tests/core/pw.mjs; skipped when it cannot start), the bundled
//    and RISC OS faces loaded as FontFaces, each run measured in the
//    face PdfFiles keyOf chose (so only advances and kerning differ,
//    not the face). Every file is exported again with those widths
//    as its measure, and each run's width in the PDF (pdf-docs
//    recorder: its advances + Tc x (glyphs - 1), the Tc as written)
//    is set against the browser's: every run within PX px or REL
//    of it. Runs with a character the face lacks are counted apart
//    and not bounded: the PDF draws no glyph for it (the export's
//    notes say so) and the browser one from another font. Printed,
//    before (the fonts' advances) and fitted: the maximum and the
//    worst files, the maximum over runs of 20 characters or more (a
//    short run kerned once, "To", moves by a large fraction of a
//    small width), the largest drift in px; and the maximum with
//    the browser's kerning off (what is left is its ligatures).
//    Then pdftotext must read the fitted runs as the same words: the
//    sample laid out with the browser's widths (as the desktop lays
//    out and fits with one measure), exported fitted and at the
//    advances; see the test.
// 3. The largest file (the most pages) exports in under 20 s: the
//    least of three runs after one to warm up; and fitted in under
//    twice the time it takes at the fonts' advances (measure null).
import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readDocx, DocxError}
  from '../../tools/moreapps/!Letters/DocxRead';
import {exportPdf} from '../../tools/moreapps/!Letters/PdfExport';
import {keyOf} from '../../tools/moreapps/!Letters/PdfFiles';
import {CORPUS, nameOf, SKIP_CORPUS, hash}
  from './roundtrip-lib.mjs';
import {bundled, metrics, windowOf, raster, recorder, fontPath,
  covers, ROOT} from './pdf-docs.mjs';
import {TextMetrics} from '../../tools/moreapps/!WimpLib/TextMetrics';
import {readPdf, squash, HAVE_PDFTOTEXT, popplerMismatches,
  popplerPages} from './pdf-read.mjs';

const OUT = path.join(ROOT, 'tests/moreapps/word-check-out/pdfcorpus');
const EACH_MS = 20000;
const PX = 0.1, REL = 0.005;         // (a fitted run's drift: either)
const LONG = 20;                      // (characters: a long run)
const tick = (cb) => setImmediate(cb);
// pdftotext's sample (besides one file in ten and the largest):
// tables, columns, headers and footers, footnotes, links
const FEATURED = ['/complex0.docx', '/bug57031.docx',
  'BackgroundReport - THE WORKING GROUP ON INTERNET GOVERNANCE.docx',
  '2003 Consumer Confidence Report.docx', '/form_footnotes.docx',
  'Hyperlink - internal.docx', 'table/2007.docx'];

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

const files = fs.existsSync(CORPUS) ? find(CORPUS) : [];

/** text without the code points in sets (the export's missing). */
function without(text, sets) {
  let out = '';
  for (const c of text) {
    const cp = c.codePointAt(0);
    if (cp === 0xfffd) continue;
    if (!sets.some((s) => s.has(cp))) out += c;
  }
  return out;
}

/** Export one document; checks 1. -> {ms, pages, runs}. */
async function exportOne(doc, name, opts = {}, tm = metrics()) {
  const dw = windowOf(doc, tm);
  const rec = recorder();
  let res, ms;
  try {
    const t0 = performance.now();
    res = await exportPdf(dw, {loader: bundled(), raf: tick,
      rasterise: raster, ...opts});
    ms = performance.now() - t0;
  } finally {
    rec.stop();
  }
  assert.ok(ms < EACH_MS, `${name}: ${Math.round(ms)} ms`);
  assert.equal(res.pages, dw.pages.count, `${name}: page count`);
  assert.equal(rec.pages.length, res.pages, `${name}: pages painted`);
  const pdf = readPdf(res.bytes);
  assert.equal(pdf.pages.length, res.pages, name);
  const sets = [...res.missing.values()];
  pdf.pages.forEach((pg, i) => {
    const want = squash(rec.pages[i].map((r) => r.text).join(''));
    assert.equal(without(squash(pg.text), sets), without(want, sets),
      `${name}: the text of page ${i + 1}`);
  });
  // (findings: a run drawn again where the same text was drawn; a
  // run starting off its page)
  let twice = 0, off = 0;
  rec.pages.forEach((pg, i) => {
    const [, , w, h] = pdf.pages[i].box.map((v) => v / 0.75);
    const seen = new Set();
    for (const r of pg) {
      const [x, y] = r.at;
      if (x < 0 || y < 0 || x > w || y > h) off++;
      const k = r.text + '@' + Math.round(x * 2) + ',' +
        Math.round(y * 2);
      if (r.text.trim() && seen.has(k)) twice++;
      seen.add(k);
    }
  });
  return {ms, pages: res.pages, runs: rec.pages.flat(), twice, off,
    bytes: res.bytes, sets,
    texts: rec.pages.map((pg) => pg.map((r) => r.text).join('')),
    pageRuns: rec.pages};
}

/** pdftotext's sample: one file in ten by a hash of its name, the
 *  largest, and FEATURED. */
function sampleOf(docs) {
  const big = docs.reduce((a, d) => (d.pages > a.pages ? d : a),
    {pages: 0});
  return docs.filter((d) => hash(d.name) % 10 === 0 || d === big ||
    FEATURED.some((x) => d.name.endsWith(x)));
}

/** The words of a text (white space and the missing left out). */
const wordsOf = (t, sets) => without(t, sets).split(/\s+/)
  .filter((w) => w);

// ------------------------------------------------------- the browser

/** Chromium with the faces runs is drawn in, or null. */
async function browserFor(faces) {
  let pw;
  try {
    pw = await import('../core/pw.mjs');
    const {browser, page} = await pw.launch();
    await page.setContent('<!doctype html><canvas></canvas>');
    const list = [...faces].map(([file, k]) => ({family: k.family,
      bold: k.bold, italic: k.italic,
      bytes: fs.readFileSync(file).toString('base64')}));
    await page.evaluate(async (fs) => {
      for (const f of fs) {
        const b = Uint8Array.from(atob(f.bytes), (c) =>
          c.charCodeAt(0));
        const face = new FontFace(f.family, b, {
          weight: f.bold ? 'bold' : 'normal',
          style: f.italic ? 'italic' : 'normal'});
        await face.load();
        document.fonts.add(face);
      }
      window.g = document.querySelector('canvas').getContext('2d');
    }, list);
    return {browser, page};
  } catch (e) {
    return {why: 'Chromium could not start: ' + e.message};
  }
}

/** The face's own font string: what keyOf chose, at its size. */
const plainCss = (k) => `${k.italic ? 'italic ' : ''}` +
  `${k.bold ? 'bold ' : ''}${k.px}px "${k.family}"`;

/** Browser widths of [[css, text]...], in chunks; kerning 'auto'
 *  (a canvas's default, as the desktop measures) or 'none'. */
async function widthsOf(page, list, kerning = 'auto') {
  const out = [];
  for (let i = 0; i < list.length; i += 5000) {
    out.push(...await page.evaluate(([xs, k]) => xs.map(([c, t]) => {
      window.g.font = c;
      window.g.fontKerning = k;
      return window.g.measureText(t).width;
    }), [list.slice(i, i + 5000), kerning]));
  }
  return out;
}

// ------------------------------------------------------------- tests

describe('PdfExport over the corpus', {
  skip: files.length ? false : SKIP_CORPUS,
}, () => {
  const runs = new Map();       // css \0 text -> {css, text, width,
                                //   name}
  const docs = [];                    // [{name, pages, ms, file}]

  it('every file exports: pages, text, under 20 s each',
    async () => {
      let refused = 0, slowest = [0, ''];
      fs.rmSync(OUT, {recursive: true, force: true});
      fs.mkdirSync(OUT, {recursive: true});
      for (const f of files) {
        let doc;
        try {
          doc = await readDocx(fs.readFileSync(f));
        } catch (e) {
          if (!(e instanceof DocxError)) throw e;
          refused++;
          continue;
        }
        const name = nameOf(f);
        const r = await exportOne(doc, name);
        const pdf = path.join(OUT, `${docs.length + 1}.pdf`);
        fs.writeFileSync(pdf, r.bytes);
        docs.push({name, pages: r.pages, ms: r.ms, file: f, pdf,
          texts: r.texts, sets: r.sets, twice: r.twice, off: r.off});
        if (r.ms > slowest[0]) slowest = [r.ms, name];
        for (const x of r.runs) {
          const key = x.css + '\0' + x.text;
          if (!runs.has(key)) runs.set(key, {...x, name});
        }
      }
      const pages = docs.reduce((n, d) => n + d.pages, 0);
      console.log(`# ${files.length} files, ` +
        `${docs.length} exported, ${refused} refused by the reader, ` +
        `${pages} pages, ${runs.size} different runs; slowest ` +
        `${Math.round(slowest[0])} ms (${slowest[1]})`);
    });

  it('poppler\'s text of each page: the characters drawn there', {
    skip: !HAVE_PDFTOTEXT && 'pdftotext not installed'}, () => {
    const sample = sampleOf(docs);
    const t0 = performance.now();
    let pages = 0;
    const bad = [];
    for (const d of sample) {
      pages += d.pages;
      for (const m of popplerMismatches(d.pdf, d.texts, d.sets)) {
        bad.push(`${d.name}: ${m}`);
      }
    }
    console.log(`# pdftotext against the text drawn: ${sample.length}` +
      ` files, ${pages} pages, ${bad.length} pages differ ` +
      `(${Math.round(performance.now() - t0)} ms)`);
    const top = (k) => docs.filter((d) => d[k]).sort((a, b) =>
      b[k] - a[k]).slice(0, 4).map((d) => `${d.name} ${d[k]}`)
      .join('; ');
    const sum = (k) => docs.reduce((n, d) => n + d[k], 0);
    console.log(`# runs drawn twice in one place: ${sum('twice')} ` +
      `(${top('twice')}); runs starting off the page: ` +
      `${sum('off')} (${top('off')})`);
    assert.deepEqual(bad, []);
  });

  it('poppler reads every file: no problem, the same page count', {
    skip: !HAVE_PDFTOTEXT && 'pdftotext not installed'}, () => {
    const r = spawnSync(process.execPath, [path.join(ROOT,
      'tools/pdf-check.mjs'), OUT], {encoding: 'utf8',
      maxBuffer: 1 << 28});
    const said = new Map();
    for (const l of r.stdout.split('\n')) {
      if (!l.startsWith('OK ') && !l.startsWith('PROBLEM ')) continue;
      const at = l.lastIndexOf(': ');
      said.set(l.slice(l.indexOf(' ') + 1, at), l);
    }
    const bad = docs.filter((d) => said.get(d.pdf) !== `OK ${d.pdf}: ` +
      `${d.pages} page${d.pages === 1 ? '' : 's'}`).map((d) =>
      `${d.name}: ${said.get(d.pdf)}`);
    console.log('# pdf-check (poppler): ' +
      `${docs.length - bad.length} of ` +
      `${docs.length} files read with nothing reported`);
    assert.deepEqual(bad, []);
    assert.equal(r.status, 0, r.stdout.slice(-2000));
  });

  describe('drift: the PDF\'s run widths against the browser\'s',
    () => {
    let br = null;
    const faces = new Map();
    const auto = new Map(), flat = new Map();  // css \0 text -> px
    let fit = null;                     // the fitted export's findings
    before(async () => {
      for (const x of runs.values()) {
        const k = keyOf(x.css), file = fontPath(x.css);
        if (k && file && !faces.has(file)) faces.set(file, k);
      }
      br = await browserFor(faces);
      if (br.why) return;
      const list = [...runs.values()].filter((x) => fontPath(x.css) &&
        covers(x.css, x.text));
      const asked = list.map((x) => [plainCss(keyOf(x.css)), x.text]);
      const ws = await widthsOf(br.page, asked);
      const fs0 = await widthsOf(br.page, asked, 'none');
      list.forEach((x, i) => {
        if (!Number.isFinite(ws[i])) return;
        auto.set(x.css + '\0' + x.text, ws[i]);
        flat.set(x.css + '\0' + x.text, fs0[i]);
      });
    });
    after(async () => {
      if (br && br.browser) await br.browser.close();
    });

    const show = (e) => `${(e.d * 100).toFixed(2)}% ` +
      `(${e.px.toFixed(3)} px: ${e.pdf.toFixed(3)} against ` +
      `${e.browser.toFixed(3)}) ${JSON.stringify(e.text.slice(0,
      40))} in ${e.css}, ${e.name}`;

    /** The drift of runs [{key, pdf, run}] against widths: the
     *  maximum, over long runs, in px, and the files. */
    function driftOf(list, widths) {
      let max = {d: 0}, maxLong = {d: 0}, maxPx = {px: 0}, over = 0;
      const byDoc = new Map();
      for (const {key, pdf, x} of list) {
        const b = widths.get(key);
        if (!(b > 0)) continue;           // (a soft hyphen: none)
        const px = Math.abs(pdf - b), d = px / b;
        const e = {d, px, text: x.text, css: x.css, name: x.name,
          pdf, browser: b};
        if (!(px <= PX || d <= REL)) over++;
        if (d > max.d) max = e;
        if ([...x.text].length >= LONG && d > maxLong.d) maxLong = e;
        if (px > maxPx.px) maxPx = e;
        byDoc.set(x.name, Math.max(byDoc.get(x.name) || 0, d));
      }
      const worst = [...byDoc].sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([k, v]) => `${k} ${(v * 100).toFixed(2)}%`);
      return {max, maxLong, maxPx, over, worst};
    }

    const print = (what, r) => {
      console.log(`# ${what}: max ${show(r.max)}`);
      console.log(`# ${what}, runs of ${LONG}+ characters: max ` +
        (r.maxLong.text ? show(r.maxLong) : 'none'));
      console.log(`# ${what}, most px: ${show(r.maxPx)}`);
      console.log(`# ${what}: ${r.over} runs over ${PX} px and ` +
        `${REL * 100}%; worst files: ${r.worst.join('; ')}`);
    };

    // Each file exported again with the browser's widths as the
    // desktop's measure (PdfSink fits each run to it); a run the
    // browser did not measure (one the first export did not draw)
    // would be drawn at its advances (there are none). The sample
    // is also laid out with the browser's widths (as on
    // the desktop the layout and the fit measure alike) and
    // exported fitted and at the fonts' advances, for pdftotext.
    it(`every run fitted: within ${PX} px or ${REL * 100}%`,
      async (t) => {
        if (!br || br.why) return t.skip(br ? br.why : 'no runs');
        const measure = (css, text) => auto.get(css + '\0' + text);
        // The sample's layout metrics: the browser's widths of every
        // text the layout or the sink asks for. A round lays out and
        // exports with what is known (opentype.js's width for the
        // rest), then has the browser measure what was missing,
        // until nothing is.
        const more = new Map(), ot = metrics();
        const browserMeasured = async (doc, name) => {
          for (let round = 1; ; round++) {
            const miss = new Map();
            const tm = () => new TextMetrics((text, css) => {
              const k = css + '\0' + text;
              const w = auto.has(k) ? auto.get(k) : more.get(k);
              if (w !== undefined) return w;
              miss.set(k, [css, text]);
              return ot.measure(text, css);
            });
            const rf = await exportOne(doc, name, {}, tm());
            const rn = await exportOne(doc, name, {measure: null},
              tm());
            if (!miss.size) return {rf, rn, round};
            assert.ok(round < 8, `${name}: ${miss.size} not measured`);
            const ws = await widthsOf(br.page, [...miss.values()].map(
              ([css, text]) => [keyOf(css) ? plainCss(keyOf(css))
                : css, text]));
            [...miss.keys()].forEach((k, i) => more.set(k, ws[i]));
          }
        };
        let rounds = 0;
        const sample = new Set(sampleOf(docs));
        const seen = new Map();           // key -> {x, pdf}
        let ms = 0;
        const unmeasured = [];
        fs.mkdirSync(path.join(OUT, 'fitted'), {recursive: true});
        fs.mkdirSync(path.join(OUT, 'natural'), {recursive: true});
        fit = [];
        for (const [i, d] of docs.entries()) {
          const doc = await readDocx(fs.readFileSync(d.file));
          const r = await exportOne(doc, d.name, {measure});
          ms += r.ms;
          for (const x of r.runs) {
            const key = x.css + '\0' + x.text;
            if (!auto.has(key)) {
              if (fontPath(x.css) && covers(x.css, x.text)) {
                unmeasured.push(`${JSON.stringify(x.text)} in ` +
                  `${x.css}, ${d.name}`);
              }
              continue;
            }
            if (!seen.has(key)) seen.set(key, {x: {...x, name: d.name},
              key, pdf: x.width});
          }
          if (!sample.has(d)) continue;
          const f = path.join(OUT, 'fitted', `${i + 1}.pdf`);
          const n = path.join(OUT, 'natural', `${i + 1}.pdf`);
          const {rf, rn, round} = await browserMeasured(doc, d.name);
          rounds = Math.max(rounds, round);
          fs.writeFileSync(f, rf.bytes);
          fs.writeFileSync(n, rn.bytes);
          assert.deepEqual(rf.texts, rn.texts, d.name);
          fit.push({d, f, n, texts: rf.texts, sets: rf.sets,
            runs: rf.pageRuns});
        }
        const list = [...seen.values()];
        const before = driftOf(list.map((e) => ({...e,
          pdf: e.x.natural})), auto);
        const after = driftOf(list, auto);
        const kernOff = driftOf(list.map((e) => ({...e,
          pdf: e.x.natural})), flat);
        const tc = list.filter((e) => e.x.tc).length;
        console.log(`# ${list.length} runs measured in Chromium ` +
          `(${tc} fitted with Tc; ${unmeasured.length} drawn ones ` +
          `it did not measure); the sample laid out with the ` +
          `browser's widths (` +
          `${more.size} more measured, ${rounds} rounds at most)` +
          `; the fitted export ${Math.round(ms)} ms in ` +
          `all, against ${Math.round(docs.reduce((a, d) => a + d.ms,
            0))} ms the first time`);
        print('before (the fonts\' advances)', before);
        print('the browser\'s kerning off (its ligatures)', kernOff);
        print('fitted (advances + Tc)', after);
        assert.deepEqual(unmeasured, []);
        assert.equal(after.over, 0, show(after.maxPx));
      });

    // Tc must not make a reader split a word (a gap read as a
    // space) or join two. On the desktop a run is fitted to the
    // width the layout measured it at, so it ends where the layout
    // put the next item. The sample, laid out with the browser's
    // widths and fitted to them by its default measure (the
    // layout's metrics), is that case. (A layout by opentype.js
    // fitted to Chromium's widths is not: its runs end short of or
    // past where it put the next run, a gap a reader takes as a
    // space: runs of 'Text' read as "Text Text".) pdftotext (its
    // reading order, not -raw) reads each page of it and of the
    // same layout at the fonts' advances; a word it gives is right
    // when the page drew it: a word of a run, or of the runs' text
    // joined (a word in two formats; a space where a run starts a
    // line). Pages with a character their font lacks are set apart
    // (as in the drift). No fitted page may have a
    // wrong word its page at the advances lacks; and pdftotext's
    // -raw text of each is the text drawn (as the oracle above).
    it('pdftotext: the fitted runs read as the same words', {
      skip: !HAVE_PDFTOTEXT && 'pdftotext not installed'}, (t) => {
      if (!fit) return t.skip('not fitted');
      let pages = 0, words = 0, same = 0, tcs = 0, order = 0;
      let wrongF = 0, wrongN = 0, lacking = 0;
      const bad = [], raw = [];
      for (const {d, f, n, texts, sets, runs} of fit) {
        const a = popplerPages(f, {all: true});
        const b = popplerPages(n, {all: true});
        tcs += readPdf(fs.readFileSync(f)).pages.reduce((k, pg) =>
          k + pg.content.split(' Tc ').length - 1, 0);
        for (const m of popplerMismatches(f, texts, sets)) {
          raw.push(`${d.name}: ${m}`);
        }
        assert.equal(a.length, b.length, d.name);
        a.forEach((pg, i) => {
          pages++;
          const wa = wordsOf(pg, sets), wb = wordsOf(b[i], sets);
          words += wa.length;
          if (wa.join(' ') === wb.join(' ')) {
            same++;
            return;
          }
          // (a page with a run its face cannot draw: set apart, as
          // in the drift: the PDF draws no glyph there, the screen
          // another font's, maybe right to left)
          if (runs[i].some((r) => !covers(r.css, r.text.replace(
            /\s/g, '')))) {
            lacking++;
            return;
          }
          // (the runs' text joined, a space where the next run
          // starts on another line or to the left)
          let joined = '', was = null;
          for (const r of runs[i]) {
            const [x, y] = r.at;
            if (was && (Math.abs(y - was[1]) > 1 || x < was[0])) {
              joined += ' ';
            }
            joined += r.text;
            was = r.at;
          }
          const drawn = new Set(wordsOf(joined, sets));
          for (const r of runs[i]) {
            for (const w of wordsOf(r.text, sets)) drawn.add(w);
          }
          const left = (ws) => {
            const n = new Map();
            for (const w of ws) {
              if (!drawn.has(w)) n.set(w, (n.get(w) || 0) + 1);
            }
            return n;
          };
          const fa = left(wa), fb = left(wb);
          let k = 0;
          for (const v of fa.values()) k += v;
          wrongF += k;
          for (const v of fb.values()) wrongN += v;
          const only = [...fa].filter(([w, v]) => v > (fb.get(w) || 0))
            .map(([w]) => w);
          if (only.length) {
            bad.push(`${d.name} page ${i + 1}: ` +
              JSON.stringify(only.slice(0, 6)));
          } else if (!k && !fb.size) order++;
        });
      }
      console.log(`# pdftotext's words, fitted (${tcs} Tc) against ` +
        `the advances: ${fit.length} files, ${pages} pages, ` +
        `${words} words; ${same} pages the same, ${order} in ` +
        `another order, ${lacking} not the same with a character ` +
        `the font lacks (not compared); words the page did not ` +
        `draw on the rest: ${wrongF} ` +
        `fitted, ${wrongN} at the advances; ${bad.length} pages ` +
        `with one only the fitted page has`);
      for (const l of bad.slice(0, 10)) console.log('#   ' + l);
      assert.deepEqual(raw, []);
      assert.deepEqual(bad, []);
    });
  });

  it('the largest file: under 20 s (least of 3 after a warm-up)',
    async () => {
      const big = docs.reduce((a, d) => (d.pages > a.pages ? d : a),
        {pages: 0});
      const doc = await readDocx(fs.readFileSync(big.file));
      const timed = async (opts) => {
        const times = [];
        for (let k = 0; k < 4; k++) {
          times.push((await exportOne(doc, big.name, opts)).ms);
        }
        return {best: Math.min(...times.slice(1)), times};
      };
      const a = await timed({}), b = await timed({measure: null});
      console.log(`# largest: ${big.name}, ${big.pages} pages: ` +
        `${Math.round(a.best)} ms fitted (runs ${a.times.map(
          Math.round).join(', ')}), ${Math.round(b.best)} ms at the ` +
        `advances (runs ${b.times.map(Math.round).join(', ')})`);
      assert.ok(a.best < EACH_MS, `${big.name}: ${a.best} ms`);
      // fitting each run (a measure, a Tc) costs under 2x
      assert.ok(a.best < 2 * b.best, `${a.best} against ${b.best}`);
    });
});
