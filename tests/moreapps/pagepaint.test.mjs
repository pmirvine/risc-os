// Pages painted (Batch D P3.3, D30, D36): Print layout draws each
// page in the band as a white sheet with a 1 px border and the
// shadow, PAGE_GAP of desk between pages, grey corner marks at the
// text area's corners, and the fragments of the page where
// ./PlacePrint puts them; paintPage(P, i, g, opts) draws page i at
// the page's origin (D36). Breaks draw no rule unless the marks are
// on (D5, D22). Painting a screen builds the frames of the pages it
// shows only (D37).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {galleyOf} from '../../tools/moreapps/!Letters/PageGalley';
import {PAGE_GAP} from '../../tools/moreapps/!Letters/Paginate';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {paintPages, paintPage, MARK, MARK_COLOUR}
  from '../../tools/moreapps/!Letters/PagePaint';
import {paintView, SEL} from '../../tools/moreapps/!Letters/EditPaint';
import {select} from '../../tools/moreapps/!Letters/Selection';
import {loadStyles, tm} from './word-docs.mjs';
import {mk} from './edit-docs.mjs';
import {docLayout} from './page-fixtures.mjs';
import {p, r} from './build-docx.mjs';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {printGalley, BAND_H, BAND_TEXT}
  from '../../tools/moreapps/!Letters/PageHF';
import {wordHf, picRun} from './hf-fixtures.mjs';
import {pngBytes} from './pic-fixtures.mjs';

before(loadStyles);
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'
  .split(' ');
const long = (i) => Array.from({length: 20 + (i % 7) * 9},
  (_, j) => WORDS[(i + j) % 10]).join(' ');

/** L laid out at w in Print layout: {L, P, Pl}. */
function printed(L, w = 800) {
  L.layout(w);
  const P = new Pages(galleyOf(L));
  L.place = PlacePrint(L, P);
  L.layout(w);
  return {L, P, Pl: L.place};
}
const lay = (doc) => new DocLayout(doc, tm());

const POINTS = {fillRect: 0, strokeRect: 0, rect: 0, moveTo: 0,
  lineTo: 0, fillText: 1, strokeText: 1};
const QUIET = new Set(['save', 'restore', 'translate']);

/** A 2D context recording calls in device space, and fill styles
 *  ('fill' entries: [style, x, y, w, h] of each fillRect). */
function deviceG() {
  const calls = [], fills = [], stack = [];
  let tx = 0, ty = 0;
  const props = {};
  const target = {calls, fills,
    save: () => stack.push([tx, ty, props.fillStyle,
      props.globalCompositeOperation]),
    restore: () => {
      [tx, ty, props.fillStyle, props.globalCompositeOperation] =
        stack.pop();
    },
    translate: (x, y) => { tx += x; ty += y; },
    measureText: (t) => ({width: 6 * t.length}),
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k in props) return props[k];
      return (...a) => {
        const at = POINTS[k];
        if (at !== undefined) {
          a = a.slice();
          a[at] += tx;
          a[at + 1] += ty;
        }
        if (k === 'fillRect') {
          fills.push([props.fillStyle, ...a,
            props.globalCompositeOperation || '']);
        }
        if (!QUIET.has(k)) calls.push([k, ...a]);
      };
    },
    set(t, k, v) {
      props[k] = v;
      return true;
    },
  });
}

const texts = (g) => g.calls.filter((c) => c[0] === 'fillText');

describe('the pages painted (D30)', () => {
  let doc;
  before(() => {
    doc = mk(Array.from({length: 120}, (_, i) => long(i))).doc;
  });

  it('two pages drawn with the gap: white, border, shadow', () => {
    const {P, Pl} = printed(lay(doc));
    const r0 = Pl.sheet.rect(P.at(0)), r1 = Pl.sheet.rect(P.at(1));
    const g = deviceG();
    paintPages(Pl.L, g, {x0: 0, y0: 0, x1: 2000, y1: r1.y + 200});
    const white = g.fills.filter((f) => f[0] === '#ffffff');
    assert.deepEqual(white.slice(0, 2).map((f) => f.slice(1, 5)),
      [[r0.x, r0.y, r0.w, r0.h], [r1.x, r1.y, r1.w, r1.h]]);
    assert.ok(Math.abs(r1.y - (r0.y + r0.h) - PAGE_GAP) <= 1);
    const shade = g.fills.filter((f) => f[0] === '#555555');
    assert.deepEqual(shade[0].slice(1, 5),
      [r0.x + 3, r0.y + 3, r0.w, r0.h]);
    assert.ok(g.calls.some((c) => c[0] === 'strokeRect' &&
      c[1] === r1.x - 0.5 && c[2] === r1.y - 0.5));
    // the text of page 1 is on page 1, none in the gap
    const ts = texts(g).filter((c) => c[3] > r0.y + r0.h);
    assert.ok(ts.length > 0);
    assert.ok(ts.every((c) => c[3] > r1.y && c[3] < r1.y + r1.h));
  });

  it('grey corner marks at the text area\'s corners', () => {
    const {L, P, Pl} = printed(lay(doc));
    const pg = P.at(0), rc = Pl.sheet.rect(pg), geo = L.geom(pg.s);
    const g = deviceG();
    paintPages(L, g, {x0: 0, y0: 0, x1: 2000, y1: rc.y + 30});
    const x0 = Math.round(rc.x + geo.mar.left);
    const x1 = Math.round(rc.x + geo.mar.left + geo.textW);
    const y0 = Math.round(rc.y + pg.bodyTop);
    const y1 = Math.round(rc.y + pg.bodyTop + pg.frameH);
    const M = MARK;
    const want = [
      [x0 - M, y0 - 1, M, 1], [x0 - 1, y0 - M, 1, M],
      [x1, y0 - 1, M, 1], [x1, y0 - M, 1, M],
      [x0 - M, y1, M, 1], [x0 - 1, y1, 1, M],
      [x1, y1, M, 1], [x1, y1, 1, M]];
    const got = g.fills.filter((f) => f[0] === MARK_COLOUR)
      .map((f) => f.slice(1, 5));
    assert.deepEqual(got, want);
  });

  it('1,500 pages: a 600 px band builds the frames of 2 pages at ' +
    'most', () => {
    const d = mk(Array.from({length: 50000}, (_, i) =>
      `${i} ${WORDS[i % 10]} words`));
    const {L, P, Pl} = printed(lay(d.doc));
    const y0 = Pl.sheet.rect(P.at(700)).y + 300;
    assert.ok(P.count >= 700);
    const g = deviceG();
    paintPages(L, g, {x0: 0, y0, x1: 2000, y1: y0 + 600});
    assert.ok(P.fragsBuilt >= 1 && P.fragsBuilt <= 2,
      `${P.fragsBuilt}`);
    assert.ok(!P.done);
    assert.ok(texts(g).length > 10);
  });

  it('page and section break rules only with the marks on', async () => {
    const {L} = await docLayout(p(r('one') +
      '<w:r><w:br w:type="page"/></w:r>') +
      '<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>two' +
      '</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:sectPr/></w:pPr><w:r><w:t>three</w:t></w:r>' +
      '</w:p>' + p(r('four')));
    const {P, Pl} = printed(L);
    P.finish();
    const last = Pl.sheet.rect(P.at(P.count - 1));
    const all = {x0: 0, y0: 0, x1: 2000, y1: last.y + last.h};
    const labels = (marks) => {
      const g = deviceG();
      paintPages(L, g, all, {marks});
      return texts(g).map((c) => c[1]).filter((t) => /break/i.test(t));
    };
    assert.deepEqual(labels(false), []);
    const on = labels(true);
    assert.equal(on.filter((t) => t === 'Page break').length, 1);
    assert.equal(on.filter((t) => t === 'Page break before').length, 1);
    assert.equal(on.filter((t) => /^Section break/.test(t)).length, 1);
  });

  it('paintPage draws a page at its origin (D36)', () => {
    const {P, Pl} = printed(lay(doc));
    const pg = P.at(1), rc = Pl.sheet.rect(pg);
    const a = deviceG(), b = deviceG();
    paintPages(Pl.L, a, {x0: 0, y0: rc.y, x1: 2000, y1: rc.y + rc.h});
    paintPage(P, 1, b, {place: Pl});
    const tb = texts(b);
    assert.ok(tb.length > 10);
    assert.ok(tb.every((c) => c[3] > 0 && c[3] < pg.h));
    assert.deepEqual(texts(a), tb.map(([k, t, x, y, ...m]) =>
      [k, t, x + rc.x, y + rc.y, ...m]));
  });

  it('paintView in Print layout: a selection across a page break ' +
    'lit on both pages, never in the gap', () => {
    const {L, P, Pl} = printed(lay(doc));
    P.finish();
    const pg = P.list.find((x) => x.i > 0 && x.start.line > 0);
    const it = L.items[pg.start.k];
    const ra = Pl.sheet.rect(P.at(pg.i - 1)), rb = Pl.sheet.rect(pg);
    const g = deviceG();
    const sel = select({id: it.id, off: 0},
      {id: it.id, off: it.para.text.length});
    paintView(L, g, {x0: 0, y0: ra.y, x1: 2000, y1: rb.y + rb.h},
      sel, true);
    const lit = g.fills.filter((f) => f[0] === SEL &&
      f[5] === 'multiply');
    const inside = (f, rc) => f[2] >= rc.y && f[2] + f[4] <= rc.y +
      rc.h;
    assert.ok(lit.some((f) => inside(f, ra)) &&
      lit.some((f) => inside(f, rb)));
    assert.ok(lit.every((f) => inside(f, ra) || inside(f, rb)));
    assert.equal(g.fills[0][0], '#888888');
  });
});

/** A Word-shaped document with headers (wordHf opts) in Print
 *  layout with its headers and footers: {L, P, Pl, doc}. */
async function hfPrinted(opts, pics) {
  const doc = await readDocx(await wordHf(opts));
  const L = new DocLayout(doc, tm(), null, pics ? {pics} : {});
  L.layout(800);
  const P = new Pages(printGalley(L)).finish();
  L.place = PlacePrint(L, P);
  L.layout(800);
  return {L, P, Pl: L.place, doc};
}
/** Everything of Print layout painted: g. */
function paintAll(L, P, Pl) {
  const last = Pl.sheet.rect(P.at(P.count - 1));
  const g = deviceG();
  paintPages(L, g, {x0: 0, y0: 0, x1: 2000, y1: last.y + last.h});
  return g;
}

describe('headers and footers painted (P7.2, D13, PG2)', () => {
  it('the header and footer text on every page, in full colour, ' +
    'at mar.header from the top and mar.footer from the bottom',
  async () => {
    const {L, P, Pl} = await hfPrinted({default: {
      hdr: p(r('Running head')), ftr: p(r('Running foot'))}});
    assert.ok(P.count >= 3);
    const g = paintAll(L, P, Pl), G = P.G, geo = L.geom(0);
    const hh = G.hdrH(0, 'default'), fh = G.ftrH(0, 'default');
    assert.ok(hh > 10 && fh > 10);
    for (const pg of P.list) {
      const rc = Pl.sheet.rect(pg);
      const on = (re, y0, y1) => texts(g).filter((c) => re.test(c[1]) &&
        c[3] > y0 && c[3] <= y1 && c[2] >= rc.x + geo.mar.left - 1);
      const top = rc.y + geo.mar.header;
      const bot = rc.y + pg.h - geo.mar.footer;
      assert.ok(on(/head/, top, top + hh).length >= 1, 'head ' + pg.i);
      assert.ok(on(/foot/, bot - fh, bot).length >= 1, 'foot ' + pg.i);
    }
    const heads = texts(g).filter((c) => /head/.test(c[1]));
    assert.equal(heads.length, P.count);
  });

  it('paintPage draws the header at the page\'s origin (D36)',
    async () => {
      const {L, P, Pl} = await hfPrinted({default: {
        hdr: p(r('Running head'))}});
      const b = deviceG();
      paintPage(P, 1, b, {place: Pl});
      const h = texts(b).filter((c) => /head/.test(c[1]));
      assert.equal(h.length, 1);
      const y = L.geom(0).mar.header;
      assert.ok(h[0][3] > y && h[0][3] < y + P.G.hdrH(0, 'default'));
    });

  it('a part that is no story: the grey preserved band on every ' +
    'page', async () => {
    const bad = '<w:hdr xmlns:w="http://schemas.openxmlformats.org/' +
      'wordprocessingml/2006/main"><w:p><w:pPr><w:sectPr/></w:pPr>' +
      '</w:p></w:hdr>';
    const {L, P, Pl} = await hfPrinted({default: {hdr: p(r('x')),
      ftr: p(r('Running foot'))}, bad: {default: bad}});
    const g = paintAll(L, P, Pl), geo = L.geom(0);
    const band = texts(g).filter((c) => c[1] === BAND_TEXT.hdr);
    assert.equal(BAND_TEXT.hdr, '[header - preserved, not shown]');
    assert.equal(band.length, P.count);
    P.list.forEach((pg, i) => {
      const rc = Pl.sheet.rect(pg);
      assert.ok(band[i][3] > rc.y + geo.mar.header &&
        band[i][3] < rc.y + geo.mar.header + BAND_H);
      assert.ok(g.fills.some((f) => f[1] === rc.x +
        Math.round(geo.mar.left) &&
        f[2] === rc.y + Math.round(geo.mar.header) &&
        f[4] === BAND_H));
    });
    assert.equal(texts(g).filter((c) => /foot/.test(c[1])).length,
      P.count);
  });

  it('a header picture through the story\'s own relationships, ' +
    'its target relative to the story part', async () => {
    const png = pngBytes(4, 2), asked = [];
    const bitmap = {width: 4, height: 2};
    const pics = {get(bytes) {
      asked.push(bytes);
      return {state: 'ready', bitmap};
    }};
    for (const dir of ['', 'hf/']) {
      asked.length = 0;
      const {L, P, Pl, doc} = await hfPrinted({dir, pic: png,
        default: {hdr: p(picRun('rIdP1') + r('Logo'))}}, pics);
      const g = paintAll(L, P, Pl);
      const drawn = g.calls.filter((c) => c[0] === 'drawImage' &&
        c[1] === bitmap);
      assert.equal(drawn.length, P.count, dir);
      assert.ok(asked.length >= P.count);
      assert.ok(asked.every((b) => b === doc.parts.get(
        'word/media/image1.png')), dir);
      assert.ok(!texts(g).some((c) => /Picture missing/.test(c[1])));
    }
  });
});

describe('the line between columns (P10.2, D23, PG25)', () => {
  const paras = (n) => Array.from({length: n},
    (_, i) => p(r(long(i)))).join('');
  const SEP = '<w:sectPr><w:cols w:num="2" w:space="720" w:sep="1"/>' +
    '</w:sectPr>';
  const seps = (g) => g.fills.filter((f) => f[0] === '#000000' &&
    f[3] === 1);

  it('0.75 pt (1 px) black, between the columns, the tallest ' +
    'column high, on every page', async () => {
    const {L} = await docLayout(paras(40) + SEP);
    const {P, Pl} = printed(L);
    P.finish();
    assert.ok(P.count >= 2, `${P.count}`);
    for (let i = 0; i < P.count; i++) {
      const pg = P.at(i), g = deviceG();
      paintPage(P, i, g, {place: Pl});
      const [a, b] = pg.cols;
      if (!b) {
        assert.equal(seps(g).length, 0, `page ${i}: one column`);
        continue;
      }
      const x = Math.round((a.x + a.w + b.x) / 2);
      const h = Math.max(a.used, b.used);
      assert.deepEqual(seps(g).map((f) => f.slice(1, 5)),
        [[x, Math.round(pg.bodyTop + pg.vShift), 1, Math.round(h)]],
        `page ${i}`);
    }
  });

  it('balanced columns: the line as long as the taller of them; ' +
    'none without w:sep', async () => {
    const one = '<w:p><w:pPr>' + SEP + '</w:pPr></w:p>';
    const cont = '<w:sectPr><w:type w:val="continuous"/></w:sectPr>';
    const {L} = await docLayout(paras(6) + one + paras(2) + cont);
    const {P, Pl} = printed(L);
    P.finish();
    const pg = P.at(0), g = deviceG();
    paintPage(P, 0, g, {place: Pl});
    const [a, b, c] = pg.cols;
    assert.ok(c && c.top > 0, 'a section below the columns');
    assert.deepEqual(seps(g).map((f) => f[4]),
      [Math.round(Math.max(a.used, b.used))]);
    assert.ok(Math.max(a.used, b.used) < a.h + 0.01);
    const {L: L2} = await docLayout(paras(40) +
      '<w:sectPr><w:cols w:num="2" w:space="720"/></w:sectPr>');
    const Q = printed(L2), g2 = deviceG();
    paintPage(Q.P, 0, g2, {place: Q.Pl});
    assert.equal(seps(g2).length, 0);
  });
});
