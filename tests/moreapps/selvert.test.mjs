// The caret, clicks and selections across pages (Batch D P3.5, D33,
// D34): Up and Down go from a frame's last line to the next frame's
// first line in flow order, x the goal x relative to the line it
// lands on; Ctrl+PageDown / Ctrl+PageUp (nextPage, prevPage) go to
// the next / previous page's first line; a click in a page's margin
// hits that page's nearest line, in the desk between pages the
// nearer page's edge line, in the header or footer area nothing
// (./PlacePrint area); a selection band on screen is culled through
// L.place band (./DocRects); the ruler shows the caret's page.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {placeOf, PlaceDraft} from '../../tools/moreapps/!Letters/Place';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {galleyOf} from '../../tools/moreapps/!Letters/PageGalley';
import {lineOf} from '../../tools/moreapps/!Letters/PositionMap';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {command} from '../../tools/moreapps/!Letters/Keys';
import {scaleOf} from '../../tools/moreapps/!Letters/RulerInd';
import {tm} from './word-docs.mjs';
import {mk} from './edit-docs.mjs';
import {docLayout} from './page-fixtures.mjs';
import {splitTable} from './tblpage-fixture.mjs';
import {p as para, r as run} from './build-docx.mjs';
import {pageCmd} from '../../tools/moreapps/!Letters/SelMove';

const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'
  .split(' ');
const long = (i) => Array.from({length: 20 + (i % 7) * 9},
  (_, j) => WORDS[(i + j) % 10]).join(' ');

/** doc laid out at w in Print layout: {L, P, Pl}. */
function printed(doc, w = 800) {
  const L = new DocLayout(doc, tm());
  L.layout(w);
  const P = new Pages(galleyOf(L));
  L.place = placeOf('print', L, P);
  L.layout(w);
  return {L, P, Pl: L.place};
}

/** Where pos is: {it, k (its line), page}. */
function where(L, pos, aff = 'down') {
  const it = L.byId.get(pos.id);
  const k = it.kind === 'p' ? lineOf(it, pos.off, aff) : 0;
  return {it, k, page: L.place.pageOf(it, k)};
}

/** The first caret place of page i: {id, off}. */
function pageStart(L, P, i) {
  const f = P.at(i).frames[0].frags[0], it = L.byId.get(f.id);
  return {id: it.id, off: it.lines[f.l0].from};
}

describe('Up and Down across pages (D33)', () => {
  let doc;
  before(() => {
    doc = mk(Array.from({length: 120}, (_, i) => long(i))).doc;
  });

  it('Down from page 1\'s last line lands on page 2\'s first line at ' +
    'the same x; Up comes back', () => {
    const {L, P} = printed(doc);
    const f0 = P.at(0).frames[0].frags.at(-1), f1 = P.at(1)
      .frames[0].frags[0];
    const it = L.byId.get(f0.id), ln = it.lines[f0.l1 - 1];
    const p0 = {id: it.id, off: ln.from + 7};
    const c0 = L.caretRect(p0, 'down');
    const s1 = S.move(S.caret(p0), L, 'down');
    const w1 = where(L, s1.head, s1.affinity);
    assert.equal(w1.page, 1);
    assert.equal(w1.it.id, f1.id);
    assert.equal(w1.k, f1.l0);
    const c1 = L.caretRect(s1.head, s1.affinity);
    assert.ok(Math.abs(c1.x - c0.x) < 12, `${c1.x} ${c0.x}`);
    assert.ok(c1.y > c0.y + 16, 'below, on the next page');
    const s2 = S.move(s1, L, 'up');
    assert.deepEqual(s2.head, p0);
  });

  it('from a frame\'s last line in a paragraph split across pages',
    () => {
      const {L, P} = printed(doc);
      P.finish();
      let n = 0;
      for (let i = 1; i < P.count && n < 4; i++) {
        const st = P.at(i).start;
        if (!(st.line > 0)) continue;
        const it = L.items[st.k], ln = it.lines[st.line - 1];
        const p0 = {id: it.id, off: ln.from + 3};
        assert.equal(where(L, p0).page, i - 1);
        const s1 = S.move(S.caret(p0), L, 'down');
        const w1 = where(L, s1.head, s1.affinity);
        assert.equal(w1.it, it);
        assert.equal(w1.k, st.line, `page ${i}`);
        assert.equal(w1.page, i);
        const s2 = S.move(s1, L, 'up');
        assert.deepEqual(s2.head, p0);
        n++;
      }
      assert.ok(n > 0, 'a split paragraph');
    });

  it('the goal x is relative to the line it lands on (a frame ' +
    'further left)', () => {
    const d = mk([long(3)]).doc;
    const L = new DocLayout(d, tm());
    L.layout(400);
    const D = PlaceDraft(L), it = L.items[0];
    assert.ok(it.lines.length >= 4);
    const DX = -40;
    // (lines 2 on of the paragraph in a frame 40 px further left)
    const dx = (j) => (j >= 2 ? DX : 0);
    L.place = {...D,
      lineAt: (x, k) => {
        const p = D.lineAt(x, k);
        return {...p, x: p.x + (x === it ? dx(k) : 0)};
      },
      rects: (x, l0, l1) => (x === it && l1 - l0 === 1
        ? D.rects(x, l0, l1).map((r) => ({...r, x: r.x + dx(l0)}))
        : D.rects(x, l0, l1))};
    const p0 = {id: it.id, off: it.lines[1].from + 6};
    const c0 = L.caretRect(p0, 'down');
    const s1 = S.move(S.caret(p0), L, 'down');
    assert.equal(lineOf(it, s1.head.off, s1.affinity), 2);
    const c1 = L.caretRect(s1.head, s1.affinity);
    assert.ok(Math.abs(c1.x - c0.x) < 12, `${c1.x} ${c0.x}`);
    const s2 = S.move(s1, L, 'up');
    assert.deepEqual(s2.head, p0);
  });
});

describe('Ctrl+PageDown and Ctrl+PageUp: the next and previous page',
  () => {
    let doc;
    before(() => {
      doc = mk(Array.from({length: 120}, (_, i) => long(i))).doc;
    });
    const PGDN = 0x19E, PGUP = 0x19F, C = 0x20;

    it('the keys: nextPage and prevPage (with Shift: extend)', () => {
      assert.deepEqual(command(PGDN + C, {ctrl: true, key: 'PageDown'}),
        {cmd: 'nextPage', extend: false});
      assert.deepEqual(command(PGUP + C,
        {ctrl: true, shift: true, key: 'PageUp'}),
      {cmd: 'prevPage', extend: true});
      assert.deepEqual(command(PGDN + C), {cmd: 'nextPage',
        extend: false});
      assert.deepEqual(command(PGDN, {key: 'PageDown'}),
        {cmd: 'pageDown', extend: false});
    });

    it('nextPage twice: page 3\'s first line; prevPage: page 2\'s; ' +
      'Shift extends', () => {
      const {L, P} = printed(doc);
      const p0 = {id: L.items[1].id, off: 5};
      const s1 = S.move(S.caret(p0), L, 'nextPage');
      assert.deepEqual(s1.head, pageStart(L, P, 1));
      const s2 = S.move(s1, L, 'nextPage');
      assert.deepEqual(s2.head, pageStart(L, P, 2));
      assert.equal(where(L, s2.head).page, 2);
      const s3 = S.move(s2, L, 'prevPage');
      assert.deepEqual(s3.head, pageStart(L, P, 1));
      const s4 = S.move(S.caret(p0), L, 'nextPage', true);
      assert.deepEqual(s4.anchor, p0);
      assert.deepEqual(s4.head, pageStart(L, P, 1));
    });

    it('prevPage on page 1: its first line; nextPage on the last ' +
      'page: nothing', () => {
      const {L, P} = printed(doc);
      const p0 = {id: L.items[1].id, off: 5};
      assert.deepEqual(S.move(S.caret(p0), L, 'prevPage').head,
        pageStart(L, P, 0));
      P.finish();
      const n = P.count - 1, f = P.at(n).frames[0].frags.at(-1);
      const last = {id: f.id, off: 2};
      const s = S.caret(last);
      assert.equal(where(L, last).page, n);
      assert.equal(S.move(s, L, 'nextPage'), s);
    });

    it('a table continued onto later pages (Consumer Confidence ' +
      'Report): every press moves on, to the last page and back',
    async () => {
      const rows = Array.from({length: 150}, (_, i) =>
        `<w:tr><w:tc>${para(run('row ' + i))}</w:tc></w:tr>`).join('');
      const text = (n, t) => Array.from({length: n}, (_, i) =>
        para(run(t + ' ' + long(i)))).join('');
      const {L, doc: d} = await docLayout(text(40, 'before') +
        '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="3000"/>' +
        '</w:tblGrid>' + rows + '</w:tbl>' + text(60, 'after'));
      assert.ok(d);
      const P = new Pages(galleyOf(L));
      L.place = placeOf('print', L, P);
      L.layout(1000);
      P.finish();
      const n = P.count;
      // (the table runs over at least two page tops)
      const cont = P.list.filter((pg) => pg.start.line > 0 &&
        L.items[pg.start.k].kind === 'tbl').length;
      assert.ok(cont >= 2 && n >= 9, `${cont} ${n}`);
      let s = S.caret({id: L.items[0].id, off: 0}), last = 0;
      for (let i = 0; i < n + 2; i++) {
        const t = S.move(s, L, 'nextPage');
        if (t === s) break;
        const pg = where(L, t.head).page;
        assert.ok(pg > last, `press ${i + 1}: page ${pg} after ${last}`);
        last = pg;
        s = t;
      }
      assert.equal(last, n - 1, 'the last page reached');
      for (let i = 0; i < n + 2; i++) {
        const t = S.move(s, L, 'prevPage');
        const pg = where(L, t.head).page;
        if (pg === last) break;
        assert.ok(pg < last, `back ${i + 1}: page ${pg} after ${last}`);
        last = pg;
        s = t;
      }
      assert.equal(last, 0, 'the first page reached');
    });

    it('pages holding only the rest of a table are reached, each at ' +
      'its first row\'s cell (P4.2)', async () => {
      const T = await splitTable({rows: 30, tall: 200, heads: 0,
        tallRow: 0});
      const {L, P} = T, n = P.count;
      // (page 2 starts in row 0, cut: its frag is not the table's head)
      const f1 = T.Pl.pageFrags(1).find((f) => f.it === T.t);
      assert.ok(f1 && f1.from && f1.head === false, 'cut at a page top');
      let s = S.caret({id: L.items[0].id, off: 0});
      for (let i = 1; i < n; i++) {
        const t = S.move(s, L, 'nextPage');
        assert.equal(where(L, t.head).page, i, `press ${i}`);
        s = t;
      }
      const s1 = S.move(S.caret({id: L.items[0].id, off: 0}), L,
        'nextPage');
      const it = L.locate(s1.head).item;
      assert.equal(it.para.text, 't' + f1.from[0]);
    });

    it('one rule where there are no pages (pageCmd)', () => {
      const L = new DocLayout(doc, tm());
      L.layout(800);
      assert.equal(pageCmd(L, 'nextPage'), 'pageDown');
      assert.equal(pageCmd(L, 'prevPage'), 'pageUp');
      assert.equal(pageCmd(L, 'down'), 'down');
      const {L: L2} = printed(doc);
      assert.equal(pageCmd(L2, 'nextPage'), 'nextPage');
      assert.equal(pageCmd(L2, 'prevPage'), 'prevPage');
    });

    it('Draft: no pages, they are Page Down and Page Up', () => {
      const L = new DocLayout(doc, tm());
      L.layout(800);
      const p0 = {id: L.items[1].id, off: 5};
      for (const [a, b] of [['nextPage', 'pageDown'],
        ['prevPage', 'pageUp']]) {
        assert.deepEqual(S.move(S.caret(p0), L, a, false, 300),
          S.move(S.caret(p0), L, b, false, 300));
      }
    });
  });

describe('clicks on pages (D33)', () => {
  let doc;
  before(() => {
    doc = mk(Array.from({length: 120}, (_, i) => long(i))).doc;
  });
  const lineId = (L, h) => {
    const w = where(L, h.pos, h.affinity);
    return [w.it.id, w.k, w.page];
  };

  it('page 2\'s top margin: its first line; the bottom margin of ' +
    'page 1: its last line; left of a line: its start', () => {
    const {L, P, Pl} = printed(doc);
    const r0 = Pl.sheet.rect(P.at(0)), r1 = Pl.sheet.rect(P.at(1));
    const f0 = P.at(0).frames[0].frags.at(-1);
    const f1 = P.at(1).frames[0].frags[0];
    const x = r1.x + 200;
    assert.deepEqual(lineId(L, L.hitTest(x, r1.y + 20)),
      [f1.id, f1.l0, 1]);
    assert.deepEqual(lineId(L, L.hitTest(x, r1.y + P.at(1).bodyTop -
      2)), [f1.id, f1.l0, 1]);
    assert.deepEqual(lineId(L, L.hitTest(x, r0.y + r0.h - 20)),
      [f0.id, f0.l1 - 1, 0]);
    const h = L.hitTest(r1.x + 5, r1.y + 20);
    assert.deepEqual(h.pos, pageStart(L, P, 1));
  });

  it('the desk between pages: the nearer page\'s edge line', () => {
    const {L, P, Pl} = printed(doc);
    const r0 = Pl.sheet.rect(P.at(0)), r1 = Pl.sheet.rect(P.at(1));
    const f0 = P.at(0).frames[0].frags.at(-1);
    const f1 = P.at(1).frames[0].frags[0];
    const x = r1.x + 200, gap = r1.y - (r0.y + r0.h);
    assert.ok(gap > 4);
    assert.deepEqual(lineId(L, L.hitTest(x, r0.y + r0.h + 2)),
      [f0.id, f0.l1 - 1, 0]);
    assert.deepEqual(lineId(L, L.hitTest(x, r1.y - 2)),
      [f1.id, f1.l0, 1]);
  });

  it('above the document\'s first line: its start; below its last ' +
    '(the last page\'s margin, the desk under it): its end', () => {
    const {L, P, Pl} = printed(doc);
    const r0 = Pl.sheet.rect(P.at(0));
    assert.deepEqual(L.hitTest(r0.x + 300, r0.y + 20).pos, L.docStart());
    assert.deepEqual(L.hitTest(r0.x + 300, r0.y - 6).pos, L.docStart());
    P.finish();
    const rl = Pl.sheet.rect(P.at(P.count - 1));
    for (const y of [rl.y + rl.h - 20, rl.y + rl.h + 6]) {
      assert.deepEqual(L.hitTest(rl.x + 100, y).pos, L.docEnd());
    }
  });

  it('every line\'s middle on page 2 hits that line', () => {
    const {L, P, Pl} = printed(doc);
    for (const f of P.at(1).frames[0].frags) {
      const it = L.byId.get(f.id);
      for (let j = f.l0; j < f.l1; j++) {
        const a = Pl.lineAt(it, j);
        const h = L.hitTest(a.x + 30, a.y + it.lines[j].h / 2);
        assert.deepEqual(lineId(L, h), [it.id, j, 1]);
      }
    }
  });

  it('area: the header and footer bands, the body, the desk', () => {
    const {P, Pl} = printed(doc);
    const pg = P.at(1), r = Pl.sheet.rect(pg), x = r.x + 300;
    const hd = Math.round(pg.mar.header / 15);
    const fb = pg.h - Math.round(pg.mar.footer / 15);
    assert.equal(Pl.area(x, r.y + hd + 4), 'header');
    assert.equal(Pl.area(x, r.y + pg.bodyTop - 2), 'header');
    assert.equal(Pl.area(x, r.y + hd - 4), 'margin');
    assert.equal(Pl.area(x, r.y + pg.bodyTop + 4), 'body');
    assert.equal(Pl.area(x, r.y + pg.bodyTop + pg.frameH + 4),
      'footer');
    assert.equal(Pl.area(x, r.y + fb + 4), 'margin');
    assert.equal(Pl.area(x, r.y - 4), 'desk');
    assert.equal(Pl.area(r.x - 4, r.y + 300), 'desk');
    assert.equal(Pl.area(NaN, 3), null);
    assert.equal(PlaceDraft(new DocLayout(doc, tm())).area, undefined);
  });
});

describe('selections and the ruler on pages', () => {
  let doc;
  before(() => {
    doc = mk(Array.from({length: 120}, (_, i) => long(i))).doc;
  });

  it('a screen band is culled through L.place band: page 2\'s band ' +
    'lights page 2 (and at most a line beyond), none in the gap',
  () => {
    const {L, P, Pl} = printed(doc);
    const r = [0, 1, 2].map((i) => Pl.sheet.rect(P.at(i)));
    const a = pageStart(L, P, 0), b = pageStart(L, P, 2);
    const sel = S.select(a, {id: b.id, off: b.off + 4});
    const in2 = L.selectionRects(sel, r[1].y, r[1].y + r[1].h);
    const on = (q, x) => q.y >= x.y && q.y + q.h <= x.y + x.h;
    const two = in2.filter((q) => on(q, r[1]));
    assert.ok(two.length > 10, `${two.length}`);
    // (a long paragraph's culling takes a line either side, as Draft)
    assert.ok(in2.length - two.length <= 2, `${in2.length}`);
    for (const q of in2) {
      assert.ok(r.some((x) => on(q, x)), JSON.stringify(q));
    }
    const all = L.selectionRects(sel, r[0].y, r[2].y + r[2].h);
    for (let i = 0; i < 3; i++) {
      assert.ok(all.some((q) => q.y >= r[i].y && q.y < r[i].y +
        r[i].h), `page ${i}`);
    }
    for (const q of all) {
      assert.ok(r.some((x) => q.y >= x.y && q.y + q.h <= x.y + x.h),
        `in the desk ${JSON.stringify(q)}`);
    }
    assert.deepEqual(L.selectionRects(sel, r[0].y - 12, r[0].y - 4),
      []);
  });

  it('a landscape section\'s page: the ruler\'s page is that page',
    async () => {
      const W = 'w:pgMar w:top="1440" w:right="1440" w:bottom="1440" ' +
        'w:left="1440" w:header="720" w:footer="720" w:gutter="0"';
      const par = (t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
      const body = par('Portrait.') + '<w:p><w:pPr><w:sectPr>' +
        `<w:pgSz w:w="12240" w:h="15840"/><${W}/></w:sectPr></w:pPr>` +
        '<w:r><w:t>End one.</w:t></w:r></w:p>' + par('Landscape.') +
        '<w:sectPr><w:pgSz w:w="15840" w:h="12240" ' +
        `w:orient="landscape"/><${W}/></w:sectPr>`;
      const {L} = await docLayout(body);
      const P = new Pages(galleyOf(L));
      L.place = placeOf('print', L, P);
      L.layout(1400);
      const Pl = L.place, it = L.items[2];
      const pg = Pl.lineAt(it, 0).page, r = Pl.sheet.rect(P.at(pg));
      assert.equal(pg, 1);
      assert.equal(r.w, 1056);
      const sc = scaleOf(L, 0, 1, {id: it.id, off: 0});
      assert.deepEqual(sc.page, [r.x, r.x + r.w]);
      assert.equal(sc.text[1] - sc.text[0], 1056 - 192);
      const s0 = scaleOf(L, 0, 2, {id: L.items[0].id, off: 0});
      const r0 = Pl.sheet.rect(P.at(0));
      assert.deepEqual(s0.page, [r0.x * 2, (r0.x + r0.w) * 2]);
    });
});
