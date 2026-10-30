// Page fields keep no earlier layouts alive (Batch D final fix A,
// F2-C1): the fields context of a Print layout's body (L.fields,
// ./FieldPass passOf) holds each paragraph's page as plain values
// ({num, s, fmt}) and the counts as {list: [{s}]}, never a Page or a
// Pages: a Page reaches its Pages, galley and DocLayout, whose own
// fields reached the Page before, a chain of every layout made.
// 3,000 paragraphs each holding PAGE, NUMPAGES and DATE, 5,000
// keystrokes in the middle one (a paragraph with fields: a word
// typed each time, the 39 words deleted at the 40th, so the
// paragraphs after it move between pages and back while the
// document does not grow), settled as
// the window does (the real ./ViewMode on a stub window, a frame
// every fourth key): at most a few layouts stay alive (the window's
// and the one or two it was made from) and the heap stays flat (the
// least of ten samples at the start and at the end: a sample may
// catch one layout more alive).
// Real DocLayout and Pages, the fake measurer; gc through v8 flags.
// KEYS=n sets the number of keystrokes (by hand).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import v8 from 'node:v8';
import {runInNewContext} from 'node:vm';
import {registerHooks} from 'node:module';
import {loadStyles, tm} from './word-docs.mjs';
import {p, r} from './build-docx.mjs';
import {fld, docWithFields} from './field-fixtures.mjs';

const STUB = 'data:text/javascript,' + encodeURIComponent(
  'export const vfs = {exists: () => false}, choices = {write() {}},' +
  ' wimp = {}, Menu = class {};');
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'riscos') return {url: STUB, shortCircuit: true};
    return next(spec, ctx);
  },
});
const L_ = '../../tools/moreapps/!Letters/';
const {placeView} = await import(L_ + 'ViewMode');
const {DocLayout} = await import(L_ + 'DocLayout');
const {Pages} = await import(L_ + 'Pages');
const {printGalley} = await import(L_ + 'PageHF');
const {PlacePrint} = await import(L_ + 'PlacePrint');
const {passOf} = await import(L_ + 'FieldPass');
const {Document} = await import(L_ + 'Document');
const {blockId} = await import(L_ + 'DocPos');

let frameQ = new Map(), nextId = 1;
globalThis.requestAnimationFrame = (f) => {
  frameQ.set(nextId, f);
  return nextId++;
};
globalThis.cancelAnimationFrame = (id) => { frameQ.delete(id); };
/** Run animation frames until none is asked for (at most n). */
function frames(n) {
  for (let k = 0; k < n && frameQ.size; k++) {
    const q = [...frameQ.values()];
    frameQ = new Map();
    for (const f of q) f();
  }
}

before(loadStyles);
v8.setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc');
const heap = () => {
  gc();
  gc();
  return process.memoryUsage().heapUsed / 1e6;
};
const KEYS = Math.ceil((Number(process.env.KEYS) || 5000) / 40) * 40;
const FX = Object.freeze({now: new Date(2026, 9, 11, 14, 5)});

/** doc laid out (from prev) and paginated to the end: {L, P}. */
function printed(doc, prev, fields, P0) {
  const L = new DocLayout(doc, prev ? prev.metrics : tm(), prev,
    fields ? {fields} : prev ? {} : {fields: FX});
  L.layout(800);
  const P = new Pages(printGalley(L), P0);
  L.place = PlacePrint(L, P);
  P.finish();
  return {L, P};
}

/** Layouts as the window makes them until no pass is due. */
function settle(doc, s) {
  let n = 0;
  for (let fx = passOf(s.L, s.P); fx && n < 10; fx = passOf(s.L, s.P)) {
    s = printed(doc, s.L, fx, s.P);
    n++;
  }
  return s;
}

const made = [];                       // every layout, weakly
/** The layouts still alive (after a gc; a tick first: a WeakRef
 *  keeps its target to the end of the job). */
async function alive() {
  await new Promise((res) => setImmediate(res));
  heap();
  return made.filter((w) => w.deref()).length;
}

/** A stub window on Document d in Print layout, caret at block k. */
function windowOf(d, k) {
  const dw = {app: {}, doc: d.doc, closed: false, viewName: 'print',
    pages: null, pagesL: null, raf: 0, bar2: null, fitN: -1,
    win: {invalidate() {}}, fitExtent() {}, colW: null};
  dw.newLayout = (metrics, prev, fields) => {
    dw.L = new DocLayout(d.doc, metrics, prev, {fields: fields ||
      (prev ? undefined : FX), colW: dw.colW || null, floats: true,
      wrap: dw.wrap || null});
    dw.L.layout(1000);
    made.push(new WeakRef(dw.L));
    placeView(dw);
  };
  const id = blockId(d.doc.sections[0].blocks[k]);
  dw.view = {hdr: null, ensure() {},
    sel: {head: {id, off: 0}, affinity: 'down'}};
  dw.newLayout(tm(), null);
  return dw;
}

const para = (i) => p(r(i + ' alpha page ') + fld(' PAGE ', '1') +
  r(' of ') + fld(' NUMPAGES ', '1') + r(' on ') +
  fld(' DATE ', '1/1/2026'));

/** Every Page or Pages reachable from L.fields (none: plain). */
function pagesIn(fx) {
  const out = [];
  const look = (v) => {
    if (v instanceof Pages || (v && v.start && v.end && v.num !== undefined
      && v.top !== undefined)) out.push(v);
  };
  if (!fx) return out;
  look(fx.pages);
  if (fx.pageOf instanceof Map) for (const v of fx.pageOf.values()) look(v);
  return out;
}

describe('Page fields keep no earlier layouts (final fix A C1)', () => {
  it('L.fields holds plain page values and counts', async () => {
    const body = Array.from({length: 300}, (_, i) => para(i)).join('');
    const d = new Document(await docWithFields(body));
    let s = settle(d.doc, printed(d.doc));
    for (let k = 0; k < 5; k++) {
      d.apply({op: 'replaceText', block: [0, 150], at: 0, del: 0,
        ins: 'word '.repeat(30)});
      s = settle(d.doc, printed(d.doc, s.L, null, s.P));
    }
    assert.ok(s.L.fields.pageOf instanceof Map, 'a pass was made');
    assert.equal(pagesIn(s.L.fields).length, 0, 'a Page or Pages');
    for (const v of s.L.fields.pageOf.values()) {
      assert.deepEqual(Object.keys(v).sort(), ['fmt', 'num', 's',
        'span']);
      // (the span: two paragraph ids, never a Page or a block)
      assert.ok(v.span === null || Object.keys(v.span).every((k) =>
        typeof v.span[k] !== 'object'), JSON.stringify(v.span));
    }
  });

  it('3,000 field paragraphs, 5,000 keystrokes in one: the heap ' +
    'stays flat (<= +10 MB)', async () => {
    const body = Array.from({length: 3000}, (_, i) => para(i))
      .join('');
    const d = new Document(await docWithFields(body));
    const dw = windowOf(d, 1500);
    frames(1e6);
    const key = async (k) => {
      if (k % 8 === 0) await new Promise((res) => setImmediate(res));
      const cut = k % 40 === 39;
      d.apply({op: 'replaceText', block: [0, 1500], at: 0,
        del: cut ? 195 : 0, ins: cut ? '' : 'abcd '});
      dw.newLayout(dw.L.metrics, dw.L);
      if (k % 4 === 3) frames(1);
    };
    /** The least heap of ten samples, 40 keys apart. */
    const sample = async (k0) => {
      let h = Infinity;
      for (let k = k0; k < k0 + 400; k++) {
        await key(k);
        if (k % 40 === 39) {
          frames(1e6);
          d.clearHistory();
          await new Promise((res) => setImmediate(res));
          h = Math.min(h, heap());
        }
      }
      return h;
    };
    for (let k = 0; k < 120; k++) await key(k);
    frames(1e6);
    const P0 = new WeakRef(dw.pages);
    const h0 = await sample(120);
    for (let k = 520; k < KEYS - 400; k++) await key(k);
    const h1 = await sample(KEYS - 400);
    const n = await alive();
    assert.ok(P0.deref() === undefined, 'the first Pages is kept');
    assert.ok(n <= 4, `${n} layouts alive`);
    assert.ok(h1 - h0 <= 10, `heap grew ${(h1 - h0).toFixed(1)} MB ` +
      `(${h0.toFixed(1)} -> ${h1.toFixed(1)})`);
  });
});
