// ViewMode's slices against an edit not yet laid out (the regression
// word-breaks-hostile found: 08686935 made the header and footer hooks
// read the live document's sections). An edit that merges sections
// changes the document at once, but the window lays it out again only
// at the next frame (EditView flush); a slice of the lazy pagination
// that ran first stepped the old layout's Pages, whose galley asked
// HdrPick for a section no longer there: RangeError 'no section N'
// out of an animation frame, an error box, and keys stopped. A slice
// now lays the edit out first (view.ensure) and steps the new Pages.
// 500 sections ('riscos' and requestAnimationFrame replaced by
// stand-ins; the window is a stub with the parts ViewMode uses).
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
const {Document} = await import('../../tools/moreapps/!Letters/Document');
const {DocLayout} = await import('../../tools/moreapps/!Letters/DocLayout');
const {readDocx} = await import('../../tools/moreapps/!Letters/DocxRead');
const {Pages} = await import('../../tools/moreapps/!Letters/Pages');
const {printGalley} = await import('../../tools/moreapps/!Letters/PageHF');

// requestAnimationFrame: callbacks queued, run by frames()
let frameQ = new Map(), nextId = 1;
globalThis.requestAnimationFrame = (f) => {
  frameQ.set(nextId, f);
  return nextId++;
};
globalThis.cancelAnimationFrame = (id) => { frameQ.delete(id); };
/** Run up to n frames (each runs the callbacks queued before it). */
function frames(n) {
  for (let k = 0; k < n && frameQ.size; k++) {
    const q = [...frameQ.values()];
    frameQ = new Map();
    for (const f of q) f();
  }
}

const W = 800;
const SECT = (i) => '<w:sectPr><w:type w:val="' +
  ['nextPage', 'continuous'][i % 2] + '"/><w:pgSz w:w="' +
  (i % 7 === 3 ? 16838 : 11906) + '" w:h="' +
  (i % 7 === 3 ? 11906 : 16838) + '"/></w:sectPr>';
const SECTIONS = (n) => Array.from({length: n}, (_, i) =>
  p(r(`Section ${i} text`), SECT(i))).join('') + p(r('Last'));
let bytes = null;

/** A window stub over Document d: an edit marks the view stale, laid
 *  out again by view.ensure (EditView's), or at its flush frame. */
function windowOf(d) {
  const m = tm();
  const dw = {app: {}, doc: d.doc, closed: false, viewName: 'print',
    pages: null, pagesL: null, raf: 0, bar2: null, fitN: -1,
    win: {invalidate() {}}, fitExtent() {}, laidOut: 0};
  dw.newLayout = (metrics, prev, fields) => {
    dw.L = new DocLayout(d.doc, metrics, prev, {fields});
    dw.L.layout(W);
    dw.laidOut++;
    placeView(dw);
  };
  const view = dw.view = {hdr: null, stale: false, flushId: 0,
    ensure() {
      if (!view.stale) return;
      view.stale = false;
      dw.newLayout(m, dw.L);
    }};
  d.on('change', () => {
    view.stale = true;
    if (!view.flushId) {
      view.flushId = requestAnimationFrame(() => {
        view.flushId = 0;
        view.ensure();
      });
    }
  });
  dw.newLayout(m, null);
  return dw;
}

before(async () => {
  loadStyles();
  bytes = await buildDocx({'word/document.xml':
    documentXml(SECTIONS(500))});
});

describe('ViewMode slices after an edit not yet laid out', () => {
  it('sections merged at the end while pages are worked out: no '
    + 'error, the slices go on over the new layout', async () => {
    const d = new Document(await readDocx(bytes));
    d.clearHistory();
    assert.equal(d.doc.sections.length, 501);
    const dw = windowOf(d);
    assert.ok(!dw.pages.done, 'the pages are worked out in slices');
    const P0 = dw.pages;               // (worked out to section 478)
    while (P0.more() && P0.last.s < 478);
    assert.ok(!P0.done);
    // the last 20 sections merged (as Backspace at their starts),
    // the frame queue as it is: the slice before the flush
    for (let k = 0; k < 20; k++) {
      d.apply({op: 'mergeSection', at: d.doc.sections.length - 2});
    }
    assert.equal(d.doc.sections.length, 481);
    assert.doesNotThrow(() => frames(100000));
    assert.ok(dw.pages.done, 'every page worked out');
    assert.equal(dw.pagesL, dw.L, 'the pages are of the new layout');
    const n = d.doc.sections.length;
    assert.ok(dw.pages.list.every((pg) => pg.s < n));
    const fresh = new Pages(printGalley(dw.L)).finish();
    assert.deepEqual(dw.pages.list.map((pg) => [pg.s, pg.num]),
      fresh.list.map((pg) => [pg.s, pg.num]));
  });

  it('a slice that finds the view stale lays it out first', async () => {
    const d = new Document(await readDocx(bytes));
    d.clearHistory();
    const dw = windowOf(d), L0 = dw.L;
    frames(3);
    while (dw.pages.more() && dw.pages.last.s < 498);
    d.apply({op: 'mergeSection', at: 499});
    // the slice runs first (queued before the flush)
    frames(1);
    assert.notEqual(dw.L, L0, 'laid out again by the slice');
    assert.equal(dw.view.stale, false);
    assert.equal(dw.pagesL, dw.L);
  });
});
