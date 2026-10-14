// Fixtures for the text wrap tests (Batch D P12a fix wave): documents
// with floating pictures, the wrap passes run until none is due, and
// the lines found under a float. Letter page, 1 in margins: page
// 816 x 1056 px, text 96..720 x 96..960.
import {registerHooks} from 'node:module';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {drawingXml, URIS} from './pic-fixtures.mjs';
import {tm} from './word-docs.mjs';

const STUB = 'data:text/javascript,' + encodeURIComponent(
  'export const vfs = {exists: () => false}, choices = {write() {}},' +
  ' wimp = {beep() { globalThis.BEEPS = (globalThis.BEEPS || 0) +' +
  ' 1; }}, Menu = class {}, os = {};');
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'riscos') return {url: STUB, shortCircuit: true};
    return next(spec, ctx);
  },
});
const L_ = '../../tools/moreapps/!Letters/';
export const M = {
  ...(await import(L_ + 'ViewMode')),
  ...(await import(L_ + 'DocLayout')),
  ...(await import(L_ + 'Pages')),
  ...(await import(L_ + 'PageHF')),
  ...(await import(L_ + 'DocxRead')),
  ...(await import(L_ + 'Document')),
  ...(await import(L_ + 'DocPos')),
  ...(await import(L_ + 'WrapPass')),
  ...(await import(L_ + 'LineShape')),
  ...(await import(L_ + 'PlacePrint')),
  ...(await import(L_ + 'PicFind')),
  ...(await import(L_ + 'Selection')),
  ...(await import(L_ + 'AnchorMove')),
};

export const EMU = 9525;
export const off = (px) => `<wp:posOffset>${Math.round(px * EMU)}` +
  '</wp:posOffset>';
export const al = (s) => `<wp:align>${s}</wp:align>`;
export const SQUARE = '<wp:wrapSquare wrapText="bothSides"/>';

/** A run holding a floating picture (96 x 48 px unless w, ht): h, v
 *  [relativeFrom, inner], wrap the wrap element; layoutInCell on). */
export function anchorRun({h = ['column', off(0)], v = ['paragraph',
  off(0)], w = 96, ht = 48, id = 1, wrap = SQUARE, behind = false,
  inCell = false} = {}) {
  let s = drawingXml({kind: 'anchor', cx: Math.round(w * EMU),
    cy: Math.round(ht * EMU), id});
  s = s.replace(/<wp:positionH[^]*<\/wp:positionV>/,
    `<wp:positionH relativeFrom="${h[0]}">${h[1]}</wp:positionH>` +
    `<wp:positionV relativeFrom="${v[0]}">${v[1]}</wp:positionV>`)
    .replace('behindDoc="0"', `behindDoc="${behind ? 1 : 0}"`)
    .replace(SQUARE, wrap);
  return `<w:r>${s}</w:r>`;
}

/** A run holding an inline picture w x ht px. */
export const inlineRun = (w, ht, id = 50) => '<w:r>' + drawingXml({
  kind: 'inline', cx: Math.round(w * EMU), cy: Math.round(ht * EMU),
  id}) + '</w:r>';

export const SECT = '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>' +
  '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" ' +
  'w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>' +
  '</w:sectPr>';
export const COLS2 = SECT.replace('</w:sectPr>',
  '<w:cols w:num="2" w:space="720"/></w:sectPr>');
const ROOT = ` xmlns:wp="${URIS.wp}" xmlns:a="${URIS.a}" ` +
  `xmlns:pic="${URIS.pic}"`;
export const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota';
export const text = (n) => Array.from({length: n}, () => WORDS)
  .join(' ');
export const PAGE = '<w:r><w:br w:type="page"/></w:r>';

/** The model of a document of body (and sectPr sect). */
export async function docOf(body, sect = SECT) {
  return M.readDocx(await buildDocx({'word/document.xml':
    documentXml(body + sect, {rootAttrs: ROOT})}));
}

/** One more layout of doc (from L; wrap w when given) paginated. */
function relay(doc, m, L, P, w) {
  const N = new M.DocLayout(doc, m, L, L ? (w ? {wrap: w} : {})
    : {floats: true});
  N.layout(1000);
  return {L: N, P: new M.Pages(M.printGalley(N), P).finish()};
}

/** doc laid out in Print layout and wrapped, pass after pass until
 *  none is due (at most max): fresh, or from {L, P} (an edit). */
export function settle(doc, {L, P, m = tm(), max = 5000} = {}) {
  ({L, P} = relay(doc, L ? L.metrics : m, L || null, L ? P : null));
  let n = 0;
  for (; n < max; n++) {
    const w = M.wrapPass(L, P);
    if (!w) break;
    ({L, P} = relay(doc, L.metrics, L, P, w));
  }
  return {L, P, n};
}

/** Each root paragraph: its page and its lines (from, to, x, y). */
export function sigOf(L, P) {
  return L.items.filter((it) => it.kind === 'p').map((it) =>
    [P.ofPos({id: it.id, off: 0}), it.lines.map((l) =>
      [l.from, l.to, Math.round(l.x), Math.round(l.y)].join(':'))
      .join(' ')].join('|'));
}

/** The lines shown on page i as page px boxes of their ink. */
export function pageLines(L, P, i) {
  const out = [];
  for (const fr of P.framesOf(P.at(i))) {
    for (const f of fr.frags) {
      const it = L.byId.get(f.id);
      if (!it || !it.lines) continue;
      for (let j = f.l0; j < f.l1; j++) {
        const ln = it.lines[j], xs = ln.items.filter((x) => x.w > 0);
        if (!xs.length) continue;
        out.push({id: it.id, j,
          x0: fr.x + Math.min(...xs.map((x) => x.x)),
          x1: fr.x + Math.max(...xs.map((x) => x.x + x.w)),
          y0: f.y + ln.y, y1: f.y + ln.y + ln.h});
      }
    }
  }
  return out;
}

/** The lines drawn under a float that wraps text (square or top and
 *  bottom: its box), each {page, id, j, x0, x1, y0, y1, f}. */
export function overlaps(L, P, kinds = ['square', 'topAndBottom']) {
  const bad = [];
  for (let i = 0; i < P.count; i++) {
    const fl = P.floatsOf(P.at(i)).filter((f) => f.wrap &&
      kinds.includes(f.wrap.kind) && !f.cell);
    if (!fl.length) continue;
    for (const ln of pageLines(L, P, i)) {
      for (const f of fl) {
        if (ln.x1 > f.x + 0.5 && ln.x0 < f.x + f.w - 0.5 &&
          ln.y1 > f.y + 0.5 && ln.y0 < f.y + f.h - 0.5) {
          bad.push({page: i, ...ln, f: [f.x, f.y, f.w, f.h]});
        }
      }
    }
  }
  return bad;
}

/** A stub window on Document d in Print layout: ./ViewMode drives
 *  the passes (as in colpass-settle); dw.frames(n) runs n frames. */
export function windowOf(d, pos) {
  let frameQ = new Map(), nextId = 1;
  globalThis.requestAnimationFrame = (f) => {
    frameQ.set(nextId, f);
    return nextId++;
  };
  globalThis.cancelAnimationFrame = (id) => { frameQ.delete(id); };
  const dw = {app: {}, doc: d.doc, closed: false, viewName: 'print',
    pages: null, pagesL: null, raf: 0, bar2: null, fitN: -1,
    win: {invalidate() {}}, fitExtent() {}, laidOut: 0, colW: null,
    wrap: null};
  dw.newLayout = (metrics, prev, fields) => {
    dw.L = new M.DocLayout(d.doc, metrics, prev, {fields,
      colW: dw.colW || null, wrap: dw.wrap || null, floats: true});
    dw.L.layout(1000);
    dw.laidOut++;
    M.placeView(dw);
  };
  dw.frames = (n) => {
    let j = 0;
    for (; j < n && frameQ.size; j++) {
      const q = [...frameQ.values()];
      frameQ = new Map();
      for (const f of q) f();
    }
    return j;
  };
  dw.view = {hdr: null, ensure() {}, sel: {head: pos,
    affinity: 'down'}};
  dw.newLayout(tm(), null);
  return dw;
}

/** A seeded random number generator (mulberry32): () -> [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where block id is: [section, index] in doc. */
export function pathOf(doc, id) {
  for (let s = 0; s < doc.sections.length; s++) {
    const i = doc.sections[s].blocks.findIndex((b) => M.blockId(b) ===
      id);
    if (i >= 0) return [s, i];
  }
  return null;
}

// Floating tables (Batch D P12b fix wave).

/** A floating table (tblpPr attrs a) of n rows of one cell w twips
 *  wide; more: elements after tblpPr (tblOverlap). */
export function ftbl(a, {w = 2000, n = 1, t = 'cell', more = ''} = {}) {
  const at = Object.entries(a).map(([k, v]) => ` w:${k}="${v}"`)
    .join('');
  const row = (k) => `<w:tr><w:tc><w:tcPr><w:tcW w:w="${w}" ` +
    `w:type="dxa"/></w:tcPr>${p(r(typeof t === 'function' ? t(k)
      : t))}</w:tc></w:tr>`;
  return `<w:tbl><w:tblPr><w:tblpPr${at}/>${more}<w:tblW w:w="${w}" ` +
    `w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="${w}"/>` +
    `</w:tblGrid>${Array.from({length: n}, (_, k) => row(k))
      .join('')}</w:tbl>`;
}

/** The lines drawn under a placed table: overlapping its box more
 *  than 9 px across (a trailing space is up to 8 px in tm()) and
 *  0.5 px down. */
export function tblUnder(L, P) {
  const bad = [];
  for (let i = 0; i < P.count; i++) {
    const fl = P.floatsOf(P.at(i)).filter((f) => f.tbl !== undefined);
    if (!fl.length) continue;
    for (const ln of pageLines(L, P, i)) {
      for (const f of fl) {
        if (Math.min(ln.x1, f.x + f.w) - Math.max(ln.x0, f.x) > 9 &&
          ln.y1 > f.y + 0.5 && ln.y0 < f.y + f.h - 0.5) {
          bad.push({page: i, id: ln.id, j: ln.j, y: ln.y0});
        }
      }
    }
  }
  return bad;
}

/** The page records that fell back to no wrap. */
export const falls = (L) => L.wrap ? [...L.wrap.known.values()]
  .filter((x) => x.st === 'fall').length : 0;
