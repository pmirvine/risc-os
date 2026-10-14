// ViewMode's column-width pass (Batch D P10.1, D23): in Print layout a
// paragraph that lands in a column of another width is laid out again
// at it (./ColPass, dw.colW, one more layout as the page-field pass
// makes), the passes stop by themselves; Draft lays the document out
// again with one column ('riscos' and requestAnimationFrame replaced
// by stand-ins; the window is a stub with the parts ViewMode uses, its
// newLayout passing dw.colW as ./WinFit does).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {loadStyles, tm} from './word-docs.mjs';

const STUB = 'data:text/javascript,' + encodeURIComponent(
  'export const vfs = {exists: () => false}, choices = {write() {}},' +
  ' wimp = {}, Menu = class {};');
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'riscos') return {url: STUB, shortCircuit: true};
    return next(spec, ctx);
  },
});
const {placeView} = await import('../../tools/moreapps/!Letters/ViewMode');
const {DocLayout} = await import('../../tools/moreapps/!Letters/DocLayout');
const {readDocx} = await import('../../tools/moreapps/!Letters/DocxRead');

let frameQ = new Map(), nextId = 1;
globalThis.requestAnimationFrame = (f) => {
  frameQ.set(nextId, f);
  return nextId++;
};
globalThis.cancelAnimationFrame = (id) => { frameQ.delete(id); };
function frames(n) {
  for (let k = 0; k < n && frameQ.size; k++) {
    const q = [...frameQ.values()];
    frameQ = new Map();
    for (const f of q) f();
  }
}

const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'
  .split(' ');
const text = (i, n) => Array.from({length: n},
  (_, j) => WORDS[(i + j) % 10]).join(' ');
const COLS3 = '<w:cols w:num="3" w:space="300" w:equalWidth="0">' +
  '<w:col w:w="1500" w:space="300"/><w:col w:w="3000" ' +
  'w:space="300"/><w:col w:w="3926"/></w:cols>';
let doc = null;

function windowOf(d, view) {
  const m = tm();
  const dw = {app: {}, doc: d, closed: false, viewName: view,
    pages: null, pagesL: null, raf: 0, bar2: null, fitN: -1,
    win: {invalidate() {}}, fitExtent() {}, laidOut: 0, colW: null};
  dw.newLayout = (metrics, prev, fields) => {
    dw.L = new DocLayout(d, metrics, prev, {fields,
      colW: dw.colW || null});
    dw.L.layout(1000);
    dw.laidOut++;
    placeView(dw);
  };
  dw.view = {hdr: null, ensure() {}};
  dw.newLayout(m, null);
  return dw;
}

before(async () => {
  loadStyles();
  doc = await readDocx(await buildDocx({'word/document.xml':
    documentXml(Array.from({length: 60}, (_, i) =>
      p(r(text(i, 6 + (i % 4))))).join('') + '<w:sectPr>' + COLS3 +
      '</w:sectPr>')}));
});

describe('ViewMode: paragraphs at the width of their column', () => {
  it('Print layout: laid out again until each lands at its width; ' +
    'Draft: one column again', () => {
    const dw = windowOf(doc, 'print');
    frames(1000);
    assert.ok(dw.pages.done);
    const L = dw.L, w0 = L.geom(0).cols[0].w;
    assert.ok(dw.laidOut > 1 && dw.laidOut < 12, `${dw.laidOut}`);
    assert.ok(L.colW && L.colW.w.size > 0);
    assert.ok(L.items.some((it) => it.w > w0), 'wider paragraphs');
    const pg = dw.pages.at(0), c1 = pg.cols[1];
    const k = c1.start.line ? c1.start.k + 1 : c1.start.k;
    assert.ok(L.items[k + 1].w === c1.w);
    // Draft: the same window laid out with one column
    dw.viewName = 'draft';
    placeView(dw);
    assert.equal(dw.L.colW, null);
    assert.ok(dw.L.items.every((it) => it.w === w0));
    assert.equal(dw.pages, null);
  });
});
