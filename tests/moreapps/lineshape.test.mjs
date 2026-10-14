// LineShape: text wrapped round floating pictures (Batch D P12.3,
// D27). Each placed float with Square, Tight, Through or TopAndBottom
// wrap is an EXCLUSION on its page (./LineShape exclusionsOf); a
// paragraph whose lines on a page meet one is broken again with a
// shape (LineLayout's shape(y, h): one interval a line, the larger
// side for bothSides and largest, the named side for left / right; a
// band with less than half an inch free skipped: the line moves
// below it); ./WrapPass finds those paragraphs page by page (P12a
// fix C1: wrap-settle.test.mjs), one more layout a pass, the lines
// kept by a key of the exclusions and the page-relative top.
// wrapNone never excludes; a header's float does not wrap the body
// (D13); Draft has no wrap.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {drawingXml, URIS} from './pic-fixtures.mjs';
import {withHeaders} from './story-fixtures.mjs';
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
const L_ = '../../tools/moreapps/!Letters/';
const {placeView} = await import(L_ + 'ViewMode');
const {DocLayout} = await import(L_ + 'DocLayout');
const {Pages} = await import(L_ + 'Pages');
const {printGalley} = await import(L_ + 'PageHF');
const {readDocx} = await import(L_ + 'DocxRead');
const {Document} = await import(L_ + 'Document');
const {blockId} = await import(L_ + 'DocPos');
const {layoutPara} = await import(L_ + 'LineLayout');
const {exclusionsOf, shapeFor, spanAt, MIN_FREE, MAX_POINTS,
  MAX_SKIP} = await import(L_ + 'LineShape');
const {wrapPass, MAX_PASSES} = await import(L_ + 'WrapPass');

before(loadStyles);

const EMU = 9525;                      // per px
const off = (px) => `<wp:posOffset>${Math.round(px * EMU)}` +
  '</wp:posOffset>';
const al = (s) => `<wp:align>${s}</wp:align>`;
const SQUARE = '<wp:wrapSquare wrapText="bothSides"/>';

/** A run holding a floating picture (96 x 48 px unless w, h): h, v
 *  [relativeFrom, inner], wrap (the wrap element). */
function anchorRun({h = ['column', off(0)], v = ['paragraph', off(0)],
  w = 96, ht = 48, id = 1, wrap = SQUARE, behind = false} = {}) {
  let s = drawingXml({kind: 'anchor', cx: w * EMU, cy: ht * EMU, id});
  s = s.replace(/<wp:positionH[^]*<\/wp:positionV>/,
    `<wp:positionH relativeFrom="${h[0]}">${h[1]}</wp:positionH>` +
    `<wp:positionV relativeFrom="${v[0]}">${v[1]}</wp:positionV>`)
    .replace('behindDoc="0"', `behindDoc="${behind ? 1 : 0}"`)
    .replace(SQUARE, wrap);
  return `<w:r>${s}</w:r>`;
}

// Letter, 1 in margins: page 816 x 1056 px, text 96..720 x 96..960
const SECT = '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar ' +
  'w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" ' +
  'w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
const ROOT = ` xmlns:wp="${URIS.wp}" xmlns:a="${URIS.a}" ` +
  `xmlns:pic="${URIS.pic}"`;
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota';
const text = (n) => Array.from({length: n}, () => WORDS).join(' ');
const PAGE = '<w:r><w:br w:type="page"/></w:r>';

async function docOf(body) {
  return readDocx(await buildDocx({'word/document.xml':
    documentXml(body + SECT, {rootAttrs: ROOT})}));
}

/** doc laid out in Print layout and wrapped: pass after pass until
 *  none is due (at most 50). */
function wrapAll(doc, {floats = true, m = tm()} = {}) {
  let L = new DocLayout(doc, m, null, {floats});
  L.layout(1000);
  let P = new Pages(printGalley(L)).finish();
  let n = 0;
  for (; n < 50; n++) {
    const w = wrapPass(L, P);
    if (!w) break;
    L = new DocLayout(doc, m, L, {wrap: w});
    L.layout(1000);
    P = new Pages(printGalley(L), P).finish();
  }
  return {L, P, n};
}

const wrapped = async (body, o) => ({...wrapAll(await docOf(body), o)});
const ink = (ln) => {
  const e = ln.items[ln.items.length - 1];
  return e ? e.x + e.w : ln.x;
};

describe('LineShape: exclusions (D27)', () => {
  const f = (wrap, o = {}) => Object.freeze({x: 100, y: 200, w: 96,
    h: 48, wrap, ...o});
  const dist = {t: 0, b: 0, l: 12 * EMU, r: 12 * EMU};

  it('Square: the box plus its distances', () => {
    const [e] = exclusionsOf([f({kind: 'square', text: 'bothSides',
      dist: {...dist, t: 3 * EMU, b: 6 * EMU}})]);
    assert.deepEqual([e.x0, e.x1, e.y0, e.y1, e.side],
      [88, 208, 197, 254, 'both']);
    assert.ok(Object.isFrozen(e));
  });

  it('wrapNone, behind or in front, never excludes; unknown kinds ' +
    'and absurd boxes neither', () => {
    assert.deepEqual(exclusionsOf([f({kind: 'none', text: null, dist}),
      f({kind: 'none', text: null, dist}, {behind: true}),
      f({kind: 'odd', text: null, dist}),
      f({kind: 'square', text: 'bothSides', dist}, {x: NaN}),
      f({kind: 'square', text: 'bothSides', dist}, {h: Infinity}),
      null, 7, {}]), []);
    assert.deepEqual(exclusionsOf(null), []);
    assert.deepEqual(exclusionsOf('x'), []);
  });

  it('TopAndBottom: no text beside it; left / right / largest', () => {
    const tb = exclusionsOf([f({kind: 'topAndBottom', text: null,
      dist: {t: 0, b: 0, l: 0, r: 0}})])[0];
    assert.equal(tb.side, 'none');
    const sides = ['left', 'right', 'largest', 'bothSides', null].map(
      (t) => exclusionsOf([f({kind: 'square', text: t, dist})])[0].side);
    assert.deepEqual(sides, ['left', 'right', 'both', 'both', 'both']);
  });

  it('Tight and Through: the polygon scaled from 21600 units', () => {
    const poly = {edited: false, points: [[0, 0], [21600, 0],
      [0, 21600]]};
    for (const kind of ['tight', 'through']) {
      const [e] = exclusionsOf([f({kind, text: 'bothSides', dist,
        polygon: poly})]);
      assert.deepEqual(e.poly, [[100, 200], [196, 200], [100, 248]]);
      assert.deepEqual([e.x0, e.x1, e.y0, e.y1], [88, 208, 200, 248]);
    }
    // (a polygon past its caps, or of too few points: the box)
    const [e] = exclusionsOf([f({kind: 'tight', text: 'bothSides',
      dist, polygon: {points: [[0, 0], [1, 1]]}})]);
    assert.equal(e.poly, null);
  });

  it('shapeFor: one interval a line, the larger side, the named ' +
    'side, a band under half an inch skipped', () => {
    assert.equal(MIN_FREE, 48);
    const e = exclusionsOf([f({kind: 'square', text: 'bothSides',
      dist: {t: 0, b: 0, l: 0, r: 0}})]);
    // fragment top 180, column left 50: x 0..600 local = 50..650 page
    const s = shapeFor(e, 180, 50);
    assert.deepEqual(s(0, 10, 0, 600), [0, 600]);   // above it
    assert.deepEqual(s(20, 10, 0, 600), [146, 600]); // right larger
    assert.deepEqual(s(20, 10, 0, 150), [0, 50]);    // left larger
    assert.equal(s(20, 10, 5, 140), null);           // 45 < 48
    assert.equal(s.next(20, 10), 68);                // its bottom
    assert.deepEqual(s(68, 10, 0, 600), [0, 600]);
    const left = shapeFor(exclusionsOf([f({kind: 'square', text: 'left',
      dist: {t: 0, b: 0, l: 0, r: 0}})]), 180, 50);
    assert.deepEqual(left(20, 10, 0, 600), [0, 50]);
    const right = shapeFor(exclusionsOf([f({kind: 'square',
      text: 'right', dist: {t: 0, b: 0, l: 0, r: 0}})]), 180, 50);
    assert.equal(right(20, 10, 0, 150), null);      // 4 px free
    assert.deepEqual(right(20, 10, 0, 600), [146, 600]);
    const none = shapeFor([], 0, 0);
    assert.deepEqual(none(5, 5, 3, 9), [3, 9]);
    assert.ok(!(none.next(5, 5) > 5));
  });

  it('a polygon gives the band its own x-interval', () => {
    const e = exclusionsOf([f({kind: 'tight', text: 'bothSides',
      dist: {t: 0, b: 0, l: 0, r: 0}, polygon: {points: [[0, 0],
        [21600, 0], [0, 21600]]}}, {x: 0, y: 0, w: 192, h: 192})]);
    const s = shapeFor(e, 0, 0);
    assert.deepEqual(s(0, 10, 0, 600), [192, 600]);
    assert.deepEqual(s(100, 10, 0, 600), [92, 600]);
    assert.deepEqual(s(200, 10, 0, 600), [0, 600]);
  });
});

describe('LineShape: hostile values', () => {
  const sq = {kind: 'square', text: 'bothSides', dist: {t: 0, b: 0,
    l: 0, r: 0}};
  it('a polygon at MAX_POINTS is used, one past it is the box', () => {
    const pts = (n) => Array.from({length: n}, (_, i) => [i % 2 ?
      21600 : 0, Math.round(i * 21600 / n)]);
    const f = (n) => ({x: 0, y: 0, w: 96, h: 96, wrap: {...sq,
      kind: 'tight', polygon: {points: pts(n)}}});
    assert.equal(exclusionsOf([f(MAX_POINTS)])[0].poly.length,
      MAX_POINTS);
    assert.equal(exclusionsOf([f(MAX_POINTS + 1)])[0].poly, null);
    const bad = {x: 0, y: 0, w: 96, h: 96, wrap: {...sq, kind: 'tight',
      polygon: {points: [[0, 0], [NaN, 1], [5, 5]]}}};
    assert.equal(exclusionsOf([bad])[0].poly, null);
  });

  it('absurd tops, lefts and distances; __proto__ keys', () => {
    const e = exclusionsOf([{x: 0, y: 0, w: 10, h: 10, wrap: {...sq,
      dist: {t: -5, b: NaN, l: 1e9 * EMU, r: '__proto__'}}}]);
    assert.equal(e[0].x0, -1e9);
    assert.deepEqual([e[0].y0, e[0].y1, e[0].x1], [0, 10, 10]);
    const s = shapeFor(e, NaN, Infinity);   // (as 0, 0)
    assert.deepEqual(s(0, 5, 0, 600), [10, 600]);
    assert.deepEqual(shapeFor(JSON.parse('{"__proto__": 1}'), 0)(0, 1,
      0, 9), [0, 9]);
    assert.equal(exclusionsOf([{x: 0, y: 0, w: -1, h: 5,
      wrap: sq}]).length, 0);
  });

  it('spanAt: at most MAX_SKIP moves, then the whole width', () => {
    let asked = 0;
    const s = () => { asked++; return null; };
    s.next = (y) => y + 1;
    assert.deepEqual(spanAt(s, 0, 10, 5, 50), {y: MAX_SKIP, x0: 5,
      x1: 50});
    assert.equal(asked, MAX_SKIP);
    const stuck = () => null;
    stuck.next = () => NaN;
    assert.deepEqual(spanAt(stuck, 7, 0, 0, 9), {y: 7, x0: 0, x1: 9});
  });
});

describe('LineLayout: the shape argument', () => {
  it('without a shape, or a shape with no exclusion: the lines of ' +
    'today', async () => {
    const doc = await docOf(p(r(text(8))));
    const m = tm(), para = doc.sections[0].blocks[0];
    const run = (...more) => JSON.stringify(layoutPara(para,
      doc.styles, 300, m, new Map(), undefined, undefined, undefined,
      undefined, undefined, ...more));
    assert.equal(run(undefined), run());
    assert.equal(run(shapeFor([], 0, 0)), run());
  });
});

describe('WrapPass: text wrapped round floats (D27)', () => {
  it('Square: lines beside the picture shortened by its width ' +
    'and distance; lines below it the full width', async () => {
    const {L, n} = await wrapped(p(anchorRun() + r(text(12))));
    assert.ok(n >= 1 && n <= MAX_PASSES, `${n} passes`);
    const ls = L.items[0].lines;
    const beside = ls.filter((ln) => ln.y < 48);
    assert.ok(beside.length >= 2);
    for (const ln of beside) assert.equal(ln.x, 96 + 12, `y ${ln.y}`);
    assert.ok(ls.some((ln) => ln.y >= 48 && ln.x === 0));
    // the named side: text on the left of a picture at the right
    const R = await wrapped(p(anchorRun({h: ['column', off(624 - 96)],
      wrap: '<wp:wrapSquare wrapText="left"/>'}) + r(text(12))));
    for (const ln of R.L.items[0].lines.filter((x) => x.y < 48)) {
      assert.ok(ink(ln) <= 624 - 96 - 12 + 0.01, `ink ${ink(ln)}`);
    }
    const flat = (await wrapped(p(r(text(12))))).L.items[0].lines;
    assert.ok(flat.some((ln) => ink(ln) > 624 - 96 - 12));
  });

  it('largest: the larger side of a picture off centre', async () => {
    const {L} = await wrapped(p(anchorRun({h: ['column', off(150)],
      wrap: '<wp:wrapSquare wrapText="largest"/>'}) + r(text(12))));
    for (const ln of L.items[0].lines.filter((x) => x.y < 48)) {
      assert.equal(ln.x, 150 + 96 + 12);
    }
  });

  it('TopAndBottom: the lines move below it', async () => {
    const {L} = await wrapped(p(anchorRun({wrap:
      '<wp:wrapTopAndBottom/>'}) + r(text(12))));
    const ls = L.items[0].lines;
    assert.ok(ls[0].y >= 48, `first line at ${ls[0].y}`);
    for (const ln of ls) assert.equal(ln.x, 0);
  });

  it('Tight with a polygon: each line beside its own edge', async () => {
    const tight = (k) => `<wp:wrap${k} wrapText="bothSides">` +
      '<wp:wrapPolygon edited="0"><wp:start x="0" y="0"/>' +
      '<wp:lineTo x="21600" y="0"/><wp:lineTo x="0" y="21600"/>' +
      `<wp:lineTo x="0" y="0"/></wp:wrapPolygon></wp:wrap${k}>`;
    for (const k of ['Tight', 'Through']) {
      const {L} = await wrapped(p(anchorRun({w: 192, ht: 192,
        wrap: tight(k)}) + r(text(16))));
      const ls = L.items[0].lines.filter((ln) => ln.y + ln.h < 192);
      assert.ok(ls.length >= 3, k);
      for (const ln of ls) {
        // the polygon's right edge at the line's top, plus distR
        assert.ok(Math.abs(ln.x - (192 - ln.y + 12)) < 0.5,
          `${k} y ${ln.y} x ${ln.x}`);
      }
      assert.ok(ls[0].x > ls[ls.length - 1].x);
    }
  });

  it('wrapNone (in front, behind) never wraps', async () => {
    for (const behind of [false, true]) {
      const {L, n} = await wrapped(p(anchorRun({behind,
        wrap: '<wp:wrapNone/>'}) + r(text(12))));
      assert.equal(n, 0);
      for (const ln of L.items[0].lines) assert.equal(ln.x, 0);
    }
  });

  it('a header\'s float does not wrap the body (D13)', async () => {
    const hdr = p(anchorRun({v: ['page', off(96)]}) + r('Head'));
    const doc = await readDocx(await withHeaders(p(r(text(12))) +
      p(r(text(12))), {default: hdr}, {}));
    const {L, n} = wrapAll(doc);
    assert.equal(n, 0);
    for (const it of L.items) {
      for (const ln of it.lines) assert.equal(ln.x, 0);
    }
  });

  it('Draft: no wrap (no floats, no pass)', async () => {
    const {L, n} = await wrapped(p(anchorRun() + r(text(12))),
      {floats: false});
    assert.equal(n, 0);
    assert.equal(L.wrap, null);
  });

  it('a paragraph after the float\'s wraps too; one far below ' +
    'does not', async () => {
    const {L} = await wrapped(p(anchorRun({ht: 96}) + r('short')) +
      p(r(text(6))) + p(r(text(6))) + p(r(text(30))) + p(r(text(6))));
    const it1 = L.items[1];
    assert.ok(it1.lines.some((ln) => ln.x === 96 + 12));
    assert.ok(L.items[4].lines.every((ln) => ln.x === 0));
    assert.ok(L.wrap.keys.has(it1.id));
    assert.ok(!L.wrap.keys.has(L.items[4].id));
  });

  it('a paragraph that moves between pages with a float (PG32): the ' +
    'page keeps the end it settled with, the paragraph on the next ' +
    'page, unwrapped (P12a fix C1)', async () => {
    assert.equal(MAX_PASSES, 16);
    // page 1 full to just above the bottom; the last paragraph (keep
    // lines) fits there unwrapped, beside a wide float at the page
    // bottom it does not, and on page 2 it is unwrapped again
    const fill = Array.from({length: 43}, () => p(r('line'))).join('');
    const body = p(anchorRun({w: 500, ht: 40, h: ['margin', al('left')],
      v: ['page', off(960 - 40)]}) + r('anchor')) + fill +
      p(r(text(2)), '<w:keepLines/>');
    const doc = await docOf(body);
    const {L, P, n} = wrapAll(doc);
    assert.ok(n <= 8, `${n} passes`);
    assert.equal(wrapPass(L, P), null);
    const x = L.items[L.items.length - 1];
    assert.ok(!L.wrap.keys.has(x.id));
    assert.equal(P.ofPos({id: x.id, off: 0}), 1);
    assert.ok(x.lines.every((ln) => ln.x === 0));
  });
});

/** A stub window on Document d in Print layout (./ViewMode drives
 *  the passes, as in colpass-settle). */
function windowOf(d, k = 0) {
  let frameQ = new Map(), nextId = 1;
  globalThis.requestAnimationFrame = (f) => {
    frameQ.set(nextId, f);
    return nextId++;
  };
  globalThis.cancelAnimationFrame = (id) => { frameQ.delete(id); };
  const m = tm();
  const dw = {app: {}, doc: d.doc, closed: false, viewName: 'print',
    pages: null, pagesL: null, raf: 0, bar2: null, fitN: -1,
    win: {invalidate() {}}, fitExtent() {}, laidOut: 0, colW: null,
    wrap: null};
  dw.newLayout = (metrics, prev, fields) => {
    dw.L = new DocLayout(d.doc, metrics, prev, {fields,
      colW: dw.colW || null, wrap: dw.wrap || null, floats: true});
    dw.L.layout(1000);
    dw.laidOut++;
    placeView(dw);
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
  dw.at = (k2) => {
    const id = blockId(d.doc.sections[0].blocks[k2]);
    dw.view = {hdr: null, ensure() {},
      sel: {head: {id, off: 0}, affinity: 'down'}};
  };
  dw.at(k);
  dw.newLayout(m, null);
  return dw;
}

describe('WrapPass: the wrap key', () => {
  it('a paragraph and its float moved down the page together keep ' +
    'their lines (the key is relative; the page started again settles ' +
    'with the same key and the very lines, ./ItemReuse swapAlt); one ' +
    'moved past the float is broken again', async () => {
    const d = new Document(await docOf(p(r('intro')) +
      p(anchorRun({ht: 192}) + r(text(2))) + p(r(text(4)))));
    let {L, P} = wrapAll(d.doc);
    const m = L.metrics, ls = L.items[2].lines;
    assert.ok(ls.some((ln) => ln.x === 108));
    d.apply({op: 'replaceText', block: [0, 0], at: 0, del: 0,
      ins: text(2) + ' '});
    L = new DocLayout(d.doc, m, L);
    L.layout(1000);
    P = new Pages(printGalley(L), P).finish();
    assert.equal(L.items[2].lines, ls);
    for (let n = 0; n < 50; n++) {
      const w = wrapPass(L, P);
      if (!w) break;
      L = new DocLayout(d.doc, m, L, {wrap: w});
      L.layout(1000);
      P = new Pages(printGalley(L), P).finish();
    }
    assert.equal(L.items[2].lines, ls);
    // (more text in the float's paragraph: the next one moves)
    d.apply({op: 'replaceText', block: [0, 1], at: 0, del: 0,
      ins: text(1) + ' '});
    L = new DocLayout(d.doc, m, L);
    L.layout(1000);
    P = new Pages(printGalley(L), P).finish();
    assert.ok(wrapPass(L, P));
  });
});

describe('WrapPass: 100 pages with a float on every page', () => {
  it('a keystroke beside a float < 30 ms (median of 20), re-breaking ' +
    'only the dirty page\'s paragraphs', async (t) => {
    let body = '';
    for (let pg = 0; pg < 100; pg++) {
      body += p(anchorRun({id: pg + 1, ht: 192}) + r(text(3))) +
        p(r(text(6))) + p(r(text(6))) + (pg < 99 ? p(PAGE) : p(r('end')));
    }
    const d = new Document(await docOf(body));
    const K = 50 * 4;                  // page 51's float paragraph
    const dw = windowOf(d, K);
    dw.frames(1e6);
    assert.ok(dw.pages.done);
    assert.equal(dw.pages.count, 100);
    assert.equal(wrapPass(dw.L, dw.pages), null, 'settled');
    const L0 = dw.L;
    assert.ok(L0.items[4].lines.some((ln) => ln.x === 108));
    const times = [];
    let spy = [];
    const LINE = WORDS + ' ';
    for (let n = 0; n < 23; n++) {
      const before = new Map(dw.L.items.map((it) => [it.id, it.lines]));
      const t0 = performance.now();
      // (a line's worth typed, then taken away: the paragraphs
      // below it move beside the float)
      d.apply({op: 'replaceText', block: [0, K], at: 0,
        del: n % 2 ? LINE.length : 0, ins: n % 2 ? '' : LINE});
      dw.newLayout(dw.L.metrics, dw.L);
      times.push(performance.now() - t0);
      dw.frames(1e6);
      const redone = dw.L.items.filter((it) => it.kind === 'p' &&
        before.get(it.id) !== it.lines).map((it) => it.ci);
      if (redone.length > spy.length) spy = redone;
      for (const k of redone) {
        assert.ok(k >= K && k < K + 4, `item ${k} re-broken`);
      }
    }
    const med = times.slice(3).sort((a, b) => a - b)[10];
    assert.ok(med < 30, `median ${med.toFixed(2)} ms`);
    t.diagnostic(`keystroke median ${med.toFixed(2)} ms, ` +
      `${spy.length} paragraphs re-broken, ${dw.laidOut} layouts`);
    assert.ok(spy.length >= 2, `re-broken: ${spy}`);
    assert.equal(wrapPass(dw.L, dw.pages), null, 'settled');
  });
});

// ---------------------------------------------------------------
// Floating tables (P12.7, owner ruling R5): a placed floating table
// is a Square exclusion, its box widened by the fromText distances
// (twips / 15), one interval a line (the larger side, OD9).

/** A floating table (tblpPr attrs a: horzAnchor, vertAnchor,
 *  tblpX... as given) of n rows of one cell w twips wide, the cell's
 *  text t (a string or a function of the row). */
function ftbl(a, {w = 2000, n = 1, t = 'cell'} = {}) {
  const at = Object.entries(a).map(([k, v]) => ` w:${k}="${v}"`)
    .join('');
  const row = (k) => `<w:tr><w:tc><w:tcPr><w:tcW w:w="${w}" ` +
    `w:type="dxa"/></w:tcPr>${p(r(typeof t === 'function' ? t(k)
      : t))}</w:tc></w:tr>`;
  return `<w:tbl><w:tblPr><w:tblpPr${at}/><w:tblW w:w="${w}" ` +
    `w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="${w}"/>` +
    `</w:tblGrid>${Array.from({length: n}, (_, k) => row(k))
      .join('')}</w:tbl>`;
}

/** The table Floats of page i of P. */
const tfloats = (P, i = 0) => P.floatsOf(P.list[i])
  .filter((f) => f.tbl !== undefined);

/** The page ys and frame xs of item it's lines on page 0. */
function linesOn(P, it) {
  const out = [];
  for (const fr of P.framesOf(P.list[0])) {
    for (const f of fr.frags) {
      if (f.id !== it.id || f.l0 === undefined) continue;
      for (const ln of it.lines.slice(f.l0, f.l1)) {
        out.push({y: f.y + ln.y, h: ln.h, x: fr.x + ln.x,
          x1: fr.x + ink(ln), fr});
      }
    }
  }
  return out;
}

describe('LineShape: floating tables (P12.7, R5)', () => {
  it('exclusionsOf: a placed table is Square, its box widened by ' +
    'the fromText distances (twips / 15), text on both sides', () => {
    const tf = Object.freeze({horz: 'page', vert: 'page',
      dist: Object.freeze({t: 150, b: 300, l: 75, r: 180})});
    const [e] = exclusionsOf([{tbl: 'T', x: 200, y: 300, w: 133,
      h: 40, behind: false, z: -1, cell: false, tfloat: tf}]);
    assert.deepEqual({...e}, {x0: 195, x1: 345, y0: 290, y1: 360,
      dl: 5, dr: 12, poly: null, side: 'both'});
    // no fromText: the box itself; absurd values: none
    const z = Object.freeze({...tf, dist: {t: 0, b: 0, l: 0, r: 0}});
    const [b] = exclusionsOf([{tbl: 'T', x: 1, y: 2, w: 3, h: 4,
      tfloat: z}]);
    assert.deepEqual([b.x0, b.x1, b.y0, b.y1], [1, 4, 2, 6]);
    for (const bad of [NaN, -1, Infinity, '7']) {
      assert.deepEqual(exclusionsOf([{tbl: 'T', x: 1, y: 2, w: bad,
        h: 4, tfloat: z}]), []);
    }
    const [n] = exclusionsOf([{tbl: 'T', x: 1, y: 2, w: 3, h: 4,
      tfloat: {...tf, dist: {t: NaN, b: -5, l: '9', r: 1e9}}}]);
    assert.deepEqual([n.x0, n.y0, n.y1], [1, 2, 6]);
    // a table Float with no tfloat (not one AnchorTbl makes): none
    assert.deepEqual(exclusionsOf([{tbl: 'T', x: 1, y: 2, w: 3,
      h: 4}]), []);
  });

  it('a table at the left margin: the lines beside it start right ' +
    'of it plus rightFromText; those below the full width',
  async () => {
    const {L, P} = await wrapped(p(r('intro')) + ftbl({horzAnchor:
      'margin', vertAnchor: 'text', tblpXSpec: 'left',
    rightFromText: 180, bottomFromText: 0}, {n: 3}) +
      p(r(text(14))));
    const [F] = tfloats(P);
    assert.ok(F, 'placed');
    const ls = linesOn(P, L.items[2]);
    const beside = ls.filter((l) => l.y < F.y + F.h);
    assert.ok(beside.length >= 2, `${beside.length} beside`);
    for (const l of beside) {
      assert.ok(Math.abs(l.x - (F.x + F.w + 12)) < 0.01,
        `x ${l.x} for ${F.x + F.w + 12}`);
    }
    const below = ls.filter((l) => l.y >= F.y + F.h);
    assert.ok(below.length >= 1 && below.every((l) => l.x === 96));
    // nothing on the table's left (no room there)
    assert.ok(ls.every((l) => l.x >= 96));
  });

  it('a table at the right: text on its left, kept leftFromText ' +
    'from it', async () => {
    const {L, P} = await wrapped(ftbl({horzAnchor: 'margin',
      vertAnchor: 'text', tblpXSpec: 'right', leftFromText: 360},
    {n: 3}) + p(r(text(14))));
    const [F] = tfloats(P);
    const beside = linesOn(P, L.items[1]).filter((l) =>
      l.y < F.y + F.h);
    assert.ok(beside.length >= 2);
    for (const l of beside) {
      assert.ok(l.x === 96 && l.x1 <= F.x - 24 + 0.01, `ink ${l.x1}`);
    }
  });

  it('topFromText and bottomFromText keep text off above and below ' +
    'the table', async () => {
    const at = (d) => wrapped(p(r(text(40))) + ftbl({horzAnchor:
      'margin', vertAnchor: 'page', tblpXSpec: 'left', tblpY: 3600,
    topFromText: d, bottomFromText: d, rightFromText: 0}, {n: 2}) +
      p(r('end')));
    const A = await at(0), B = await at(720);
    const [FA] = tfloats(A.P), [FB] = tfloats(B.P);
    assert.equal(FA.y, FB.y);
    // the lines wholly in lo..hi: [all, narrowed]
    const nar = (X, lo, hi) => {
      const ls = linesOn(X.P, X.L.items[0]).filter((l) =>
        l.y >= lo && l.y + l.h <= hi);
      return [ls.length, ls.filter((l) => l.x > 96).length];
    };
    // with 0: nothing narrowed in the 48 px above or below it
    const a0 = nar(A, FA.y - 48, FA.y), a1 = nar(A, FA.y + FA.h,
      FA.y + FA.h + 48);
    assert.ok(a0[0] >= 1 && a0[1] === 0 && a1[0] >= 1 && a1[1] === 0,
      `${a0} ${a1}`);
    // with 720 twips (48 px): the lines there are beside it
    const b0 = nar(B, FB.y - 48, FB.y), b1 = nar(B, FB.y + FB.h,
      FB.y + FB.h + 48);
    assert.ok(b0[0] >= 1 && b0[1] === b0[0] && b1[0] >= 1 &&
      b1[1] === b1[0], `${b0} ${b1}`);
    for (const l of linesOn(B.P, B.L.items[0])) {
      const meets = l.y + l.h > FB.y - 48 + 0.01 &&
        l.y < FB.y + FB.h + 48 - 0.01;
      assert.equal(l.x > 96, meets, `y ${l.y}`);
    }
  });

  it('less than half an inch free beside it: the lines move below ' +
    'it', async () => {
    const {L, P} = await wrapped(ftbl({horzAnchor: 'margin',
      vertAnchor: 'text', tblpXSpec: 'left', rightFromText: 0},
    {w: 8800, n: 2}) + p(r(text(10))));
    const [F] = tfloats(P);
    assert.ok(624 - F.w < 48, `${624 - F.w} px free`);
    const ls = linesOn(P, L.items[1]);
    assert.ok(ls[0].y >= F.y + F.h - 0.01, `first at ${ls[0].y}`);
    assert.ok(ls.every((l) => l.x === 96));
  });

  it('two floating tables on one page: each wraps the text beside ' +
    'it', async () => {
    const {L, P} = await wrapped(ftbl({horzAnchor: 'margin',
      vertAnchor: 'page', tblpXSpec: 'left', tblpY: 1440,
      rightFromText: 180}, {n: 2}) + ftbl({horzAnchor: 'margin',
      vertAnchor: 'page', tblpXSpec: 'right', tblpY: 5760,
      leftFromText: 180}, {n: 2}) + p(r(text(80))));
    const fs = tfloats(P);
    assert.equal(fs.length, 2);
    const [A, B] = fs.sort((a, b) => a.y - b.y);
    const ls = linesOn(P, L.items[2]);
    const by = (F) => ls.filter((l) => l.y + l.h > F.y + 0.01 &&
      l.y < F.y + F.h - 0.01);
    assert.ok(by(A).length >= 1 && by(B).length >= 1);
    for (const l of by(A)) assert.ok(l.x >= A.x + A.w + 12 - 0.01);
    for (const l of by(B)) assert.ok(l.x1 <= B.x - 12 + 0.01);
    assert.equal(wrapPass(L, P), null, 'settled');
  });

  it('a floating table in a header does not wrap the body (D13)',
    async () => {
      const hdr = ftbl({horzAnchor: 'margin', vertAnchor: 'page',
        tblpXSpec: 'left', tblpY: 1440}, {n: 4});
      const doc = await readDocx(await withHeaders(p(r(text(12))) +
        p(r(text(12))), {default: hdr + p(r('Head'))}, {}));
      const {L, n} = wrapAll(doc);
      assert.equal(n, 0);
      for (const it of L.items) {
        for (const ln of it.lines) assert.equal(ln.x, 0);
      }
    });

  it('Draft: the table in the flow, no wrap', async () => {
    const {L, n} = await wrapped(ftbl({horzAnchor: 'margin',
      vertAnchor: 'text', tblpXSpec: 'left'}) + p(r(text(14))),
    {floats: false});
    assert.equal(n, 0);
    assert.ok(L.items[1].lines.every((ln) => ln.x === 0));
  });

  it('from Draft to Print layout (the Draft layout\'s lines kept): ' +
    'the text beside it wrapped as when opened in Print layout',
  async () => {
    const doc = await docOf(p(r('intro')) + ftbl({horzAnchor:
      'margin', vertAnchor: 'text', tblpXSpec: 'left',
    rightFromText: 180}, {n: 3}) + p(r(text(14))));
    const m = tm(), D = new DocLayout(doc, m, null, {floats: false});
    D.layout(1000);
    let L = new DocLayout(doc, m, D, {floats: true});
    L.layout(1000);
    let P = new Pages(printGalley(L)).finish();
    for (let n = 0; n < 50; n++) {
      const w = wrapPass(L, P);
      if (!w) break;
      L = new DocLayout(doc, m, L, {wrap: w});
      L.layout(1000);
      P = new Pages(printGalley(L), P).finish();
    }
    const fresh = wrapAll(doc);
    const xs = (X) => X.items[2].lines.map((ln) => [ln.x, ln.y]);
    assert.ok(xs(fresh.L).some(([x]) => x > 0));
    assert.deepEqual(xs(L), xs(fresh.L));
  });

  it('typing in a cell grows the table and re-breaks the ' +
    'paragraphs beside it; edited == fresh; undone, the earlier ' +
    'lines', async () => {
    const d = new Document(await docOf(p(r('intro')) +
      ftbl({horzAnchor: 'margin', vertAnchor: 'text',
        tblpXSpec: 'left', rightFromText: 180}) +
      p(r(text(6))) + p(r(text(6))) + p(r(text(6)))));
    const dw = windowOf(d, 0);
    dw.frames(1e6);
    const lines = () => dw.L.items.filter((it) => it.kind === 'p')
      .map((it) => it.lines.map((ln) => [ln.x, ln.y]));
    const l0 = lines(), h0 = tfloats(dw.pages)[0].h;
    const before = JSON.stringify(d.doc);
    d.apply({op: 'replaceText', block: [0, 1, 0, 0, 0], at: 4,
      del: 0, ins: ' ' + text(3)});
    dw.newLayout(dw.L.metrics, dw.L);
    dw.frames(1e6);
    const F = tfloats(dw.pages)[0];
    assert.ok(F.h > h0, `grew ${h0} -> ${F.h}`);
    const l1 = lines();
    assert.notDeepEqual(l1, l0);
    // the paragraph after the table: more of it beside the table
    const it2 = dw.L.items[2];
    assert.ok(it2.lines.filter((ln) => ln.x > 0).length >
      l0[1].filter(([x]) => x > 0).length);
    const fresh = wrapAll(d.doc);
    assert.deepEqual(fresh.L.items.filter((it) => it.kind === 'p')
      .map((it) => it.lines.map((ln) => [ln.x, ln.y])), l1);
    d.undo();
    assert.equal(JSON.stringify(d.doc), before);
    dw.newLayout(dw.L.metrics, dw.L);
    dw.frames(1e6);
    assert.deepEqual(lines(), l0);
  });
});


describe('WrapPass: 100 pages with a floating table on every page',
  () => {
    it('a keystroke in a cell < 30 ms (median of 20), re-breaking ' +
      'only that page\'s paragraphs', async (t) => {
      let body = '';
      for (let pg = 0; pg < 100; pg++) {
        body += ftbl({horzAnchor: 'margin', vertAnchor: 'text',
          tblpXSpec: 'left', rightFromText: 180}, {n: 2}) +
          p(r(text(3))) + p(r(text(6))) + p(r(text(6))) +
          (pg < 99 ? p(PAGE) : p(r('end')));
      }
      const d = new Document(await docOf(body));
      const K = 50 * 5;                // page 51's table
      const dw = windowOf(d, K + 1);
      dw.frames(1e6);
      assert.ok(dw.pages.done);
      assert.equal(dw.pages.count, 100);
      assert.equal(wrapPass(dw.L, dw.pages), null, 'settled');
      assert.equal(tfloats(dw.pages, 50).length, 1);
      assert.ok(dw.L.items[K + 1].lines.some((ln) => ln.x > 0));
      const times = [];
      let spy = [];
      const LINE = WORDS + ' ';
      for (let n = 0; n < 23; n++) {
        const before = new Map(dw.L.items.map((it) => [it.id,
          it.lines]));
        const t0 = performance.now();
        // (a line's worth typed in the cell, then taken away: the
        // table grows and shrinks beside the paragraphs)
        d.apply({op: 'replaceText', block: [0, K, 0, 0, 0], at: 0,
          del: n % 2 ? LINE.length : 0, ins: n % 2 ? '' : LINE});
        dw.newLayout(dw.L.metrics, dw.L);
        times.push(performance.now() - t0);
        dw.frames(1e6);
        const redone = dw.L.items.filter((it) => it.kind === 'p' &&
          before.get(it.id) !== it.lines).map((it) => it.ci);
        if (redone.length > spy.length) spy = redone;
        for (const k of redone) {
          assert.ok(k > K && k < K + 5, `item ${k} re-broken`);
        }
      }
      const med = times.slice(3).sort((a, b) => a - b)[10];
      assert.ok(med < 30, `median ${med.toFixed(2)} ms`);
      t.diagnostic(`keystroke median ${med.toFixed(2)} ms, ` +
        `${spy.length} paragraphs re-broken, ${dw.laidOut} layouts`);
      assert.ok(spy.length >= 1, `re-broken: ${spy}`);
      assert.equal(wrapPass(dw.L, dw.pages), null, 'settled');
    });
  });

describe('Floating tables over the corpus (P12.7)', () => {
  it('every file with a placed floating table settles; no line ' +
    'under a table', async (t) => {
    const {corpusFiles, SKIP_CORPUS, nameOf} =
      await import('./roundtrip-lib.mjs');
    const {isFloating} = await import(L_ + 'TblFloat');
    const {docMap} = await import(L_ + 'PicRead');
    const files = corpusFiles();
    if (!files.length) return t.skip(SKIP_CORPUS);
    const {readFileSync} = await import('node:fs');
    let docs = 0, placed = 0, under = 0, most = 0;
    for (const f of files) {
      let doc;
      try {
        doc = await readDocx(readFileSync(f));
      } catch {
        continue;                      // (a refused file: not ours)
      }
      const map = docMap(doc);
      if (!doc.sections.some((s) => s.blocks.some((b) =>
        b.type === 'tbl' && isFloating(b.tblPr, map)))) continue;
      docs++;
      const t0 = performance.now();
      const {L, P, n} = wrapAll(doc);
      most = Math.max(most, n);
      assert.ok(n < 50, `${nameOf(f)}: ${n} layouts`);
      assert.ok(performance.now() - t0 < 5000, nameOf(f));
      for (let i = 0; i < P.count; i++) {
        const fs = tfloats(P, i);
        placed += fs.length;
        for (const fr of fs.length ? P.framesOf(P.list[i]) : []) {
          for (const g of fr.frags) {
            const it = L.byId.get(g.id);
            if (!it || it.kind !== 'p' || g.l0 === undefined) continue;
            for (const ln of it.lines.slice(g.l0, g.l1)) {
              const y = g.y + ln.y, x = fr.x + ln.x;
              const x1 = fr.x + ink(ln);
              if (x1 > x && fs.some((F) => y < F.y + F.h - 0.5 &&
                y + ln.h > F.y + 0.5 && x < F.x + F.w - 0.5 &&
                x1 > F.x + 0.5)) under++;
            }
          }
        }
      }
    }
    t.diagnostic(`${docs} files with floating tables, ${placed} ` +
      `placed, ${under} lines under a table, at most ${most} layouts`);
    assert.equal(under, 0);
  });
});
