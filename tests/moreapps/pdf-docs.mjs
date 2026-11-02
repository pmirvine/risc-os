// Test-only helpers for exporting real documents as PDF in Node
// (Batch G1, task 9: tests/moreapps/pdfcorpus.test.mjs and the
// hand-off generator handoff-pdf.mjs).
//
//   bundled() -> loader  PdfFiles fileLoader over the real fonts:
//       the bundled faces from tools/moreapps/!Letters/Fonts, the
//       RISC OS ones from assets/fonts (as the desktop fetches them)
//   fontPath(css) -> the file the face of a canvas font string is
//       drawn in (PdfFiles keyOf's family), or null
//   metrics() -> a TextMetrics measuring with the real fonts'
//       advances and their kerning as opentype.js reads it (no
//       canvas in Node; near the browser's, not equal to it)
//   covers(css, text) -> true when the face of css has a glyph for
//       every character of text (its cmap, as opentype.js reads it)
//   windowOf(doc, L metrics) -> a window as exportPdf reads one: the
//       Document laid out in Print layout at 800 px and settled as
//       the window settles it (./ViewPass settle: the passes for
//       page fields, columns and wrap made; dw.pages its pages)
//   raster  a stand-in rasterise: one grey pixel per picture
//   recorder() -> {pages, stop()}  while on, every PdfSink page
//       that ends ready is kept as [{css, text, natural, tc, n, width,
//       at}] for each fillText that wrote a Tj: natural the hmtx
//       advances of its n glyphs (code points, tabs as spaces), tc
//       the Tc it wrote (0 for none), width what the PDF draws:
//       natural + tc * (n - 1) (PdfSink's Fitting), at its start in
//       page px (through the transform); the pages painted again (a
//       face loaded late) are not kept. stop() puts PdfSink back as
//       it was
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {fileLoader, keyOf}
  from '../../tools/moreapps/!Letters/PdfFiles';
import {fontFile} from '../../tools/moreapps/!Letters/FontMap';
import {PdfSink} from '../../tools/moreapps/!Letters/PdfSink';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {settle} from '../../tools/moreapps/!Letters/ViewPass';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {TextMetrics} from '../../tools/moreapps/!WimpLib/TextMetrics';

export const ROOT = path.resolve(path.dirname(
  fileURLToPath(import.meta.url)), '../..');
const FONTS = path.join(ROOT, 'tools/moreapps/!Letters/Fonts');
const RISCOS = path.join(ROOT, 'assets/fonts');
const ot = createRequire(new URL('../../tools/', import.meta.url))(
  'opentype.js');

const bytesOf = (f) => new Uint8Array(fs.readFileSync(f));

export function bundled() {
  return fileLoader({dir: 'F', base: 'R',
    readBytes: async (name) => bytesOf(path.join(FONTS,
      name.slice(2))),
    fetchBytes: async (url) => bytesOf(path.join(RISCOS,
      url.slice(2)))});
}

export function fontPath(css) {
  const k = keyOf(css);
  if (!k) return null;
  const leaf = fontFile(k.family, k.bold, k.italic);
  if (leaf) return path.join(FONTS, leaf);
  const style = k.bold ? (k.italic ? 'BoldItalic' : 'Bold')
    : (k.italic ? 'MediumItalic' : 'Medium');
  const f = path.join(RISCOS, `${k.family}-${style}.otf`);
  return fs.existsSync(f) ? f : null;
}

const parsed = new Map();
function faceOf(file) {
  if (!parsed.has(file)) {
    const b = fs.readFileSync(file);
    parsed.set(file, ot.parse(b.buffer.slice(b.byteOffset,
      b.byteOffset + b.length)));
  }
  return parsed.get(file);
}

export function metrics() {
  return new TextMetrics((text, css) => {
    const f = fontPath(css), k = keyOf(css);
    if (!f || !k || !(k.px > 0)) return 8 * text.length;
    return faceOf(f).getAdvanceWidth(text, k.px, {kerning: true});
  });
}

export function covers(css, text) {
  const f = fontPath(css);
  if (!f) return false;
  const face = faceOf(f);
  for (const c of text) {
    if (!(face.charToGlyphIndex(c) > 0)) return false;
  }
  return true;
}

export function windowOf(doc, tm = metrics()) {
  const base = new DocLayout(doc, tm, null, {floats: true,
    markup: 'final', pics: {get: () => ({state: 'pending'})}});
  base.layout(800);
  const {L, P: pages} = settle(doc, {L: base});
  L.place = PlacePrint(L, pages);
  L.layout(L.width);
  return {doc, L, pages, viewName: 'print', markup: 'final',
    fields: {now: new Date(Date.UTC(2026, 0, 1)),
      shade: {mode: 'always'}}};
}

export const raster = async () => ({width: 1, height: 1,
  rgba: new Uint8Array([128, 128, 128, 255])});

export function recorder() {
  const P = PdfSink.prototype;
  const {begin, end, fillText} = P;
  const pages = [];
  let cur = [];
  P.begin = function (...a) {
    cur = [];
    return begin.apply(this, a);
  };
  P.fillText = function (text, ...a) {
    const n = this.out.length;
    const r = fillText.call(this, text, ...a);
    const t = String(text);
    const last = this.out[this.out.length - 1];
    if (this.out.length > n && last.startsWith('BT ')) {  // (a Tj)
      const m = this.st.m, [x, y] = a;
      const drawn = [...t].map((c) => ('\t\n\r\f\v'.includes(c)
        ? ' ' : c)).join('');
      const natural = this.face('').widthOf(drawn, this.st.key.px);
      const ops = last.split(' '), i = ops.indexOf('Tc');
      const tc = i < 0 ? 0 : Number(ops[i - 1]);
      const k = [...drawn].length;
      cur.push({css: this.font, text: t, natural, tc, n: k,
        width: natural + tc * (k - 1),
        at: [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]});
    }
    return r;
  };
  P.end = function (...a) {
    const out = end.apply(this, a);
    if (out.ready) pages.push(cur);
    cur = [];
    return out;
  };
  return {pages, stop() {
    Object.assign(P, {begin, end, fillText});
  }};
}
