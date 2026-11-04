// PDF bookmark links to the line: ./BookmarkSpot spotOf, the page
// and the top (layout px from the page's top) of the line holding a
// bookmark's start, and destOf, the destination ./PdfExport writes
// for a link to it: /XYZ 0 top null (top in points from the page's
// bottom), /Fit where the line cannot be found (a table cell, a
// note, a broken place). Real DocLayout, Pages and PlacePrint, the
// fake measurer; exportPdf with the bundled fonts, the file read
// back with the test reader (and poppler's pdfinfo where installed).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {exportPdf, sizeOf}
  from '../../tools/moreapps/!Letters/PdfExport';
import {spotOf, destOf}
  from '../../tools/moreapps/!Letters/BookmarkSpot';
import {fileLoader} from '../../tools/moreapps/!Letters/PdfFiles';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {loadStyles, tm} from './word-docs.mjs';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {tbl, tr, tc} from './tbl-fixtures.mjs';
import {noteDoc, mark as noteMark} from './note-fixtures.mjs';
import {readPdf} from './pdf-read.mjs';
import {popplerTool} from '../../tools/lib/poppler.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../..');
const FONTS = path.join(ROOT, 'tools/moreapps/!Letters/Fonts');
const OUT = path.join(ROOT, 'tests/moreapps/word-check-out/pdflinks');
const PDFINFO = popplerTool('pdfinfo');
const tick = (cb) => setImmediate(cb);
const PB = '<w:r><w:br w:type="page"/></w:r>';

const loader = fileLoader({dir: 'F', base: 'none',
  readBytes: async (name) => new Uint8Array(fs.readFileSync(
    path.join(FONTS, name.slice(2)))),
  fetchBytes: async () => null});

const link = (text, name) => '<w:hyperlink w:anchor="' + name +
  '"><w:r><w:t xml:space="preserve">' + text + '</w:t></w:r>' +
  '</w:hyperlink>';
let ids = 10;
const bm = (name, text) => {
  const id = ids++;
  return '<w:bookmarkStart w:id="' + id + '" w:name="' + name +
    '"/>' + r(text) + '<w:bookmarkEnd w:id="' + id + '"/>';
};
const words = (n, w = 'word') => Array.from({length: n},
  (_, k) => w + k).join(' ');

/** A window as exportPdf reads one (Print layout at 800 px). */
function windowOf(doc) {
  const d = new Document(doc);
  const L = new DocLayout(d.doc, tm(), null, {floats: true,
    markup: 'final', pics: {get: () => ({state: 'pending'})}});
  L.layout(800);
  const pages = new Pages(printGalley(L));
  L.place = PlacePrint(L, pages);
  L.layout(800);
  pages.finish();
  return {d, doc: d.doc, L, pages, viewName: 'print',
    markup: 'final', fields: {now: new Date(Date.UTC(2026, 0, 1)),
      shade: {mode: 'always'}}};
}

const bodyDoc = async (body) => readDocx(await buildDocx({
  'word/document.xml': documentXml(body)}));
const ctxOf = (dw) => ({doc: dw.doc, pages: dw.pages,
  place: dw.L.place});

/** Each page's link annotations: [[{rect, dest, page, fit, top}]],
 *  dest the index of the page the /Dest names. */
function destsOf(pdf) {
  const tree = pdf.objects.get(2).dict;
  const kids = [...tree.slice(tree.indexOf('/Kids')).matchAll(
    /(\d+) 0 R/g)].map((m) => Number(m[1]));
  return kids.map((id) => {
    const m = /\/Annots \[([^\]]*)\]/.exec(pdf.objects.get(id).dict);
    if (!m) return [];
    return [...m[1].matchAll(/(\d+) 0 R/g)].map((x) => {
      const dict = pdf.objects.get(Number(x[1])).dict;
      const rect = /\/Rect \[([^\]]*)\]/.exec(dict)[1].split(' ')
        .map(Number);
      const d = /\/Dest \[(\d+) 0 R (\/Fit|\/XYZ 0 (\S+) null)\]/
        .exec(dict);
      assert.ok(d, 'a /Dest of the two forms: ' + dict);
      return {rect, dest: kids.indexOf(Number(d[1])),
        fit: d[2] === '/Fit', top: d[3] === undefined ? null
          : Number(d[3])};
    });
  });
}

async function exported(dw, opts = {}) {
  const res = await exportPdf(dw, {loader, raf: tick, ...opts});
  return {res, pdf: readPdf(res.bytes)};
}

function save(name, bytes) {
  fs.mkdirSync(OUT, {recursive: true});
  const f = path.join(OUT, name);
  fs.writeFileSync(f, bytes);
  return f;
}

before(loadStyles);

describe('BookmarkSpot: PDF bookmark links to the line', () => {
  it('a bookmark on a later line gets /XYZ with a top below the ' +
    'page top', async () => {
    // page 1: a long paragraph, then the bookmark's line, which also
    // links to itself (its own annotation shows where it is drawn)
    const dw = windowOf(await bodyDoc(p(link('to low', 'Low')) +
      p(r(words(300))) + p(bm('Low', 'low') + r(' ') +
        link('here', 'Low'))));
    const pg = dw.pages.list[0], hPt = sizeOf(pg).pt[1];
    const s = spotOf(ctxOf(dw), 'Low');
    assert.ok(s, 'a spot');
    assert.equal(s.page, 0);
    assert.ok(s.top > pg.bodyTop + 100 && s.top < pg.h, String(s.top));
    const {pdf} = await exported(dw);
    const an = destsOf(pdf)[0];
    assert.equal(an.length, 2);
    for (const a of an) {
      assert.equal(a.fit, false);
      assert.equal(a.dest, 0);
      assert.ok(Math.abs(a.top - (hPt - s.top * 0.75)) < 0.01,
        a.top + ' vs ' + (hPt - s.top * 0.75));
    }
    // clearly lower than the page's top margin (72 pt)
    assert.ok(an[0].top < hPt - 72 - 60, String(an[0].top));
    // the self-link is on the bookmark's line: the destination's top
    // at (or just above) the top of that line's link box
    const self = an[1];
    assert.ok(self.top >= self.rect[3] - 0.5 &&
      self.top - self.rect[3] < 20, self.top + ' ' + self.rect);
    if (PDFINFO) {
      const out = execFileSync(PDFINFO, [save('later.pdf',
        (await exported(dw)).res.bytes)], {encoding: 'utf8'});
      assert.match(out, /^Pages:\s+1$/m);
    }
  });

  it('a bookmark at the first line is near the page top', async () => {
    const dw = windowOf(await bodyDoc(p(link('to two', 'Two')) +
      p(r('one')) + p(PB + bm('Two', 'two')) + p(r('more'))));
    assert.equal(dw.pages.list.length, 2);
    const pg = dw.pages.list[1], hPt = sizeOf(pg).pt[1];
    const s = spotOf(ctxOf(dw), 'Two');
    assert.equal(s.page, 1);
    assert.ok(s.top >= pg.bodyTop - 1 && s.top < pg.bodyTop + 30,
      s.top + ' bodyTop ' + pg.bodyTop);
    const {pdf, res} = await exported(dw);
    const [a] = destsOf(pdf)[0];
    assert.equal(a.dest, 1);
    assert.equal(a.fit, false);
    // the top margin is 72 pt: the line's top just below it
    assert.ok(a.top <= hPt - 72 + 1 && a.top > hPt - 72 - 25,
      String(a.top));
    if (PDFINFO) {
      const out = execFileSync(PDFINFO, [save('first.pdf', res.bytes)],
        {encoding: 'utf8'});
      assert.match(out, /^Pages:\s+2$/m);
    }
  });

  it('a bookmark in a table cell or a note keeps /Fit', async () => {
    const cell = windowOf(await bodyDoc(p(link('to cell', 'Cell')) +
      p(r('x') + PB) + tbl([tr([tc(p(r('a'))),
        tc(p(bm('Cell', 'b')))])]) + p(r('after'))));
    assert.equal(spotOf(ctxOf(cell), 'Cell'), null);
    let [a] = destsOf((await exported(cell)).pdf)[0];
    assert.equal(a.dest, 1, 'the page of its row, as before');
    assert.equal(a.fit, true);

    const note = windowOf(await noteDoc(p(link('to note', 'Fn')) +
      p(r('b') + PB) + p(r('see') + noteMark(2)), {2: p(
      '<w:r><w:footnoteRef/></w:r>' + bm('Fn', ' note text'))}));
    assert.equal(spotOf(ctxOf(note), 'Fn'), null);
    [a] = destsOf((await exported(note)).pdf)[0];
    assert.equal(a.dest, 1, 'the page of its foot, as before');
    assert.equal(a.fit, true);
  });

  it('an unknown or deleted bookmark keeps the old behaviour ' +
    'without throwing', async () => {
    const dw = windowOf(await bodyDoc(p(link('nowhere', 'Gone')) +
      p(bm('Here', 'here'))));
    assert.equal(spotOf(ctxOf(dw), 'Gone'), null);
    const {pdf} = await exported(dw);
    assert.deepEqual(destsOf(pdf), [[]], 'the link left out');
    // broken inputs: null, never a throw; destOf then /Fit
    const ctx = ctxOf(dw);
    const bad = [null, undefined, {}, {doc: dw.doc},
      {doc: dw.doc, pages: dw.pages},
      {doc: dw.doc, pages: dw.pages, place: {}},
      {doc: dw.doc, pages: dw.pages, place: {...ctx.place,
        lineAt() { throw new Error('boom'); }}}];
    for (const c of bad) {
      assert.equal(spotOf(c, 'Here'), null);
      assert.equal(destOf(c, 'Here', 0, 841.9), '/Fit');
    }
    assert.equal(spotOf(ctx, 42), null);
    assert.equal(destOf(ctx, 'Here', 1, 841.9), '/Fit',
      'not the page asked about');
    assert.equal(destOf(ctx, 'Here', 0, NaN), '/Fit');
    assert.match(destOf(ctx, 'Here', 0, 841.9),
      /^\/XYZ 0 \d+(\.\d+)? null$/);
  });
});
