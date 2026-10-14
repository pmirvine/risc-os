// Place (Batch D P3.1, D4): one answer to "where on screen". The
// Draft placement (PlaceDraft) is the identity: a line at it.x,
// it.y + ln.y, page null; hit gives the galley item and line at a
// point; visible gives the items and lines today's painting culls to
// a band; extent is L.layout's. The layout's caret, hits, selection
// rects, kept-block boxes, Up / Down into an item and the ruler's
// column all ask L.place: a shifted placement (a test Place that
// moves everything by dx, dy) moves every answer by exactly that.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {PlaceDraft, placeOf, shiftOf}
  from '../../tools/moreapps/!Letters/Place';
import {enter} from '../../tools/moreapps/!Letters/SelVert';
import {vertical} from '../../tools/moreapps/!Letters/SelTable';
import * as RI from '../../tools/moreapps/!Letters/RulerInd';
import {select} from '../../tools/moreapps/!Letters/Selection';
import {draftDocs, VIEW_W} from './draft-fixture.mjs';
import {tm, rng} from './word-docs.mjs';
import {shifted} from './place-fixture.mjs';
import {picAt, selectedPic, handleRects, handleAt}
  from '../../tools/moreapps/!Letters/PicFind';
import {zoneAt} from '../../tools/moreapps/!Letters/SelTable';
import {edgeAt} from '../../tools/moreapps/!Letters/TblEdge';
import {linkUnder} from '../../tools/moreapps/!Letters/LinkFind';
import {mk, O} from './edit-docs.mjs';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {galleyOf} from '../../tools/moreapps/!Letters/PageGalley';
import {PAGE_GAP} from '../../tools/moreapps/!Letters/Paginate';
import {PAGE_TOP} from '../../tools/moreapps/!Letters/DocLayout';
import {MARGIN} from '../../tools/moreapps/!Letters/DocStack';
import {docLayout} from './page-fixtures.mjs';
import {splitTable, tableFrags, cellItem} from './tblpage-fixture.mjs';
import {loadStyles} from './word-docs.mjs';
import * as PFind from '../../tools/moreapps/!Letters/PageFind';
import {existsSync, readFileSync} from 'node:fs';

const docs = {};
before(async () => {
  for (const [name, bytes] of draftDocs()) {
    docs[name] = await readDocx(await bytes);
  }
});

const laid = (doc, w = VIEW_W) => {
  const L = new DocLayout(doc, tm());
  L.layout(w);
  return L;
};

/** Today's painting cull (./DocPaint paint, ./ItemPaint paintPara):
 *  the items i0..i1 - 1 and the lines of each painted. */
function cullToday(L, y0, y1) {
  const first = L.itemAtY(y0);
  if (!first) return [];
  const {items} = L;
  const bottom = (it) => it.y + it.h + it.gapBelow;
  const top = (it) => it.y - Math.max(0, it.gapAbove);
  let i0 = first.ci, i1 = i0;
  while (i0 > 0 && bottom(items[i0 - 1]) > y0) i0--;
  while (i1 < items.length && top(items[i1]) < y1) i1++;
  const out = [];
  for (let i = i0; i < i1; i++) {
    const it = items[i], ls = [];
    if (it.kind === 'p' && it.y < y1 && it.y + it.h > y0) {
      it.lines.forEach((ln, j) => {
        const t = it.y + ln.y;
        if (t < y1 && t + ln.h > y0) ls.push(j);
      });
    }
    out.push({it, ls});
  }
  return out;
}

describe('PlaceDraft: the identity (D4)', () => {
  it('lineAt is it.x, it.y + ln.y, page null (100 random lines)',
    () => {
      const r = rng(7);
      for (const name of Object.keys(docs)) {
        const L = laid(docs[name]), Pl = PlaceDraft(L);
        const ps = L.flow.filter((n) => n.lines && n.lines.length);
        for (let n = 0; n < 100; n++) {
          const it = ps[Math.floor(r() * ps.length)];
          const k = Math.floor(r() * it.lines.length);
          assert.deepEqual(Pl.lineAt(it, k),
            {x: it.x, y: it.y + it.lines[k].y, page: null});
        }
        for (const it of L.flow) {
          assert.equal(Pl.itemTop(it), it.y);
          assert.equal(Pl.pageOf(it, 0), null);
          if (!it.lines) {
            assert.deepEqual(Pl.lineAt(it, 0),
              {x: it.x, y: it.y, page: null});
          }
        }
      }
    });
  it('rects: one box over lines l0..l1 - 1; a block its box', () => {
    const L = laid(docs.tables), Pl = PlaceDraft(L);
    const it = L.flow.find((n) => n.lines && n.lines.length > 1);
    const a = it.lines[0], b = it.lines[1];
    assert.deepEqual(Pl.rects(it, 0, 2), [{x: it.x, y: it.y + a.y,
      w: it.w, h: it.y + b.y + b.h - (it.y + a.y)}]);
    assert.deepEqual(Pl.rects(it, 1, 1), []);
    const t = L.items.find((n) => n.kind === 'tbl');
    assert.deepEqual(Pl.rects(t, 0, 0),
      [{x: t.x, y: t.y, w: t.w, h: t.h}]);
  });
  it('hit: the item at y (L.itemAtY) and its line there', () => {
    for (const name of Object.keys(docs)) {
      const L = laid(docs[name]), Pl = PlaceDraft(L);
      for (let k = 0; k < 60; k++) {
        const y = L.height * k / 59 - 10;
        const h = Pl.hit(100, y), it = L.itemAtY(y);
        assert.equal(h.it, it, `${name} ${y}`);
        if (!it.lines) { assert.equal(h.k, 0); continue; }
        const ln = it.lines[h.k];
        const last = h.k === it.lines.length - 1;
        assert.ok(last || it.y + ln.y + ln.h > y, `${name} ${y}`);
        assert.ok(h.k === 0 || it.y + it.lines[h.k - 1].y +
          it.lines[h.k - 1].h <= y, `${name} ${y}`);
      }
    }
  });
  it('visible equals today\'s culling; dx = dy = 0', () => {
    const r = rng(11);
    for (const name of Object.keys(docs)) {
      const L = laid(docs[name]), Pl = PlaceDraft(L);
      for (let n = 0; n < 40; n++) {
        const y0 = r() * L.height - 20, y1 = y0 + 5 + r() * 500;
        const got = Pl.visible(y0, y1), want = cullToday(L, y0, y1);
        assert.deepEqual(got.map((v) => v.it), want.map((w) => w.it));
        got.forEach((v, i) => {
          const ls = want[i].ls;
          assert.equal(v.dx, 0);
          assert.equal(v.dy, 0);
          assert.deepEqual([v.l0, v.l1], ls.length
            ? [ls[0], ls[ls.length - 1] + 1] : [0, 0], name);
        });
      }
    }
  });
  it('extent is what L.layout gives; an empty layout hits null',
    () => {
      for (const name of Object.keys(docs)) {
        const L = new DocLayout(docs[name], tm());
        const e = L.layout(VIEW_W);
        assert.deepEqual(PlaceDraft(L).extent(), e);
        assert.deepEqual(L.place.extent(), e);
      }
      const E = {items: [], itemAtY: () => null};
      assert.equal(PlaceDraft(E).hit(10, 10), null);
    });
  it('placeOf: draft and web are the identity; others refused', () => {
    const L = laid(docs.plain);
    for (const v of ['draft', 'web']) {
      const Pl = placeOf(v, L, null), it = L.items[0];
      assert.deepEqual(Pl.lineAt(it, 0), PlaceDraft(L).lineAt(it, 0));
    }
    assert.throws(() => placeOf('nonsense', L, null), RangeError);
    assert.deepEqual(shiftOf(PlaceDraft(L), L.items[0], 0),
      {dx: 0, dy: 0});
  });
  it('a layout\'s place is the Draft one by default', () => {
    const L = laid(docs.plain), it = L.items[1];
    assert.deepEqual(L.place.lineAt(it, 0), PlaceDraft(L)
      .lineAt(it, 0));
  });
});

describe('the consumers ask L.place', () => {
  const DX = 64, DY = 1000;
  const pair = (name) => {
    const A = laid(docs[name]), B = laid(docs[name]);
    B.place = shifted(B, DX, DY);
    return [A, B];
  };
  it('caretRect and boxRect move by (dx, dy)', () => {
    for (const name of Object.keys(docs)) {
      const [A, B] = pair(name);
      for (const it of A.flow) {
        for (const off of [0, 1]) {
          const pos = {id: it.id, off}, a = A.caretRect(pos);
          assert.deepEqual(B.caretRect(pos),
            {...a, x: a.x + DX, y: a.y + DY}, `${name} ${it.id}`);
        }
        if (it.kind === 'p') continue;
        const a = A.boxRect(it), b = B.boxRect(B.byId.get(it.id));
        assert.deepEqual(b, {...a, x: a.x + DX, y: a.y + DY});
      }
    }
  });
  it('hitTest of a moved point is the same position', () => {
    for (const name of Object.keys(docs)) {
      const [A, B] = pair(name);
      for (let k = 0; k < 40; k++) {
        const x = A.left - 30 + (A.textW + 60) * ((k * 17) % 40) / 39;
        const y = A.height * k / 39 - 10;
        assert.deepEqual(B.hitTest(x + DX, y + DY), A.hitTest(x, y),
          `${name} ${x} ${y}`);
      }
    }
  });
  it('selectionRects move by (dx, dy)', () => {
    for (const name of Object.keys(docs)) {
      const [A, B] = pair(name);
      const f = A.flow[0], t = A.flow[A.flow.length - 1];
      const sel = select({id: f.id, off: 1},
        {id: t.id, off: 0});
      const a = A.selectionRects(sel), b = B.selectionRects(sel);
      assert.ok(a.length > 0, name);
      assert.deepEqual(b, a.map((r) =>
        ({...r, x: r.x + DX, y: r.y + DY})), name);
    }
  });
  it('Up / Down into an item: goal x from the line\'s place', () => {
    const [A, B] = pair('plain');
    const n = A.items.find((it) => it.lines && it.lines.length > 1);
    for (const dir of [1, -1]) {
      assert.deepEqual(enter(B, B.byId.get(n.id), dir, 150 + DX),
        enter(A, n, dir, 150));
    }
    const p = {id: n.id, off: 0};
    assert.deepEqual(vertical(B, B.byId.get(n.id), p, 'down',
      150 + DX, 1), vertical(A, n, p, 'down', 150, 1));
  });
  it('the ruler\'s column is the caret line\'s place', () => {
    const [A, B] = pair('plain');
    const pos = {id: A.items[1].id, off: 0};
    const a = RI.scaleOf(A, 0, 1, pos), b = RI.scaleOf(B, 0, 1, pos);
    assert.equal(b.origin, a.origin + DX);
    assert.deepEqual(b.text, a.text.map((x) => x + DX));
  });
});

describe('the pointer\'s finders ask L.place (P3.2)', () => {
  const DX = 64, DY = 1000;
  const pair = (doc) => {
    const A = laid(doc), B = laid(doc);
    B.place = shifted(B, DX, DY);
    return [A, B];
  };
  const mv = (r) => r && {...r, x: r.x + DX, y: r.y + DY};
  /** 2,000 points over the layout (x, y in A's galley). */
  function* points(A) {
    for (let i = 0; i < 2000; i++) {
      yield [A.left - 40 + (A.textW + 80) * ((i * 37) % 200) / 199,
        A.height * i / 1999 - 5];
    }
  }
  it('picAt and selectedPic: the picture, its box moved', () => {
    const [A, B] = pair(docs.pictures);
    let found = 0;
    for (const [x, y] of points(A)) {
      const a = picAt(A, x, y), b = picAt(B, x + DX, y + DY);
      assert.equal(!!b, !!a, `${x} ${y}`);
      if (!a) continue;
      found++;
      assert.deepEqual([b.pos, b.rect], [a.pos, mv(a.rect)]);
      const s = select(a.pos, {id: a.pos.id, off: a.pos.off + 1});
      assert.deepEqual(selectedPic(B, s).rect, mv(selectedPic(A, s)
        .rect));
      const hs = handleRects(b.rect, 1);
      assert.deepEqual(hs, handleRects(a.rect, 1).map(mv));
      for (const h of hs) {
        assert.equal(handleAt(b.rect, h.x + 3, h.y + 3, 1), h.name);
      }
    }
    assert.ok(found > 0);
  });
  it('zoneAt and edgeAt: the same zone and border', () => {
    const [A, B] = pair(docs.tables);
    const key = (z) => z && [z.kind, z.table.id, z.r, z.k, z.c,
      z.index];
    let zones = 0, edges = 0;
    for (const [x, y] of points(A)) {
      const za = zoneAt(A, x, y);
      zones += za ? 1 : 0;
      assert.deepEqual(key(zoneAt(B, x + DX, y + DY)), key(za));
      const ea = edgeAt(A, x, y, 1);
      edges += ea ? 1 : 0;
      assert.deepEqual(key(edgeAt(B, x + DX, y + DY, 1)), key(ea));
    }
    assert.ok(zones > 0 && edges > 0, `${zones} ${edges}`);
  });
  it('linkUnder: the same link', () => {
    const lk = (t) => ({kind: 'raw', level: 'p', text: t, node: {name:
      'w:hyperlink', attrs: [['w:anchor', t]], children: []}});
    const d = mk([['x' + O + O + 'y', {inlines: {1: lk('aaaa'),
      2: lk('bbbb')}}], 'after']);
    const [A, B] = pair(d.doc);
    let n = 0;
    for (const [x, y] of points(A)) {
      const a = linkUnder(A, x, y);
      n += a ? 1 : 0;
      assert.deepEqual(linkUnder(B, x + DX, y + DY), a);
    }
    assert.ok(n > 0);
  });
});

// Print layout (P3.3, D4, D30, D33): PlacePrint maps a galley line
// to its fragment on its page; pages stacked from PAGE_TOP below
// L.top with PAGE_GAP between them, each centred in the view.
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
const inRect = (a, r) => a.y >= r.y && a.y + a.h <= r.y + r.h;
const meetsGap = (a, r0, r1) => a.y < r1.y && a.y + a.h > r0.y + r0.h;

describe('PlacePrint (P3.3)', () => {
  let doc;
  before(() => {
    doc = mk(Array.from({length: 120}, (_, i) => long(i))).doc;
  });

  it('placeOf print: pages, a page for every line', () => {
    const {L, P, Pl} = printed(doc);
    assert.equal(Pl.pages, P);
    assert.equal(Pl.pageOf(L.items[0], 0), 0);
    assert.equal(PlacePrint(L, P).pages, P);
  });

  it('a line on page 3 is at page.top + frame.y + (its galley ' +
    'top - the frame\'s); whole-pixel shifts', () => {
    const {L, P, Pl} = printed(doc);
    P.finish();
    assert.ok(P.count >= 4, `${P.count} pages`);
    const top0 = L.top + PAGE_TOP;
    let n = 0;
    for (const i of [0, 1, 2, 3]) {
      const pg = P.at(i), [fr] = pg.frames, r = Pl.sheet.rect(pg);
      for (const f of fr.frags) {
        const it = L.byId.get(f.id);
        for (let j = f.l0; j < f.l1; j++) {
          const at = Pl.lineAt(it, j);
          const want = top0 + pg.top + fr.y + pg.vShift +
            (it.y + it.lines[j].y - pg.y0);
          assert.equal(at.page, i);
          assert.ok(Math.abs(at.y - want) <= 1, `${at.y} ${want}`);
          assert.ok(Math.abs(at.x - (r.x + f.x)) <= 0.5);
          const s = shiftOf(Pl, it, j);
          const whole = (v) => Math.abs(v - Math.round(v)) < 1e-9;
          assert.ok(whole(s.dx) && whole(s.dy), `${s.dx} ${s.dy}`);
          assert.equal(Pl.pageOf(it, j), i);
          n++;
        }
      }
    }
    assert.ok(n > 40);
  });

  it('pages stacked with PAGE_GAP between, centred in the view', () => {
    const {L, P, Pl} = printed(doc, 1400);
    const r0 = Pl.sheet.rect(P.at(0)), r1 = Pl.sheet.rect(P.at(1));
    assert.equal(r0.y, L.top + PAGE_TOP);
    assert.ok(Math.abs(r1.y - (r0.y + r0.h) - PAGE_GAP) <= 1);
    assert.equal(r0.x, Math.round((1400 - P.at(0).w) / 2));
    assert.equal(r0.w, Math.round(P.at(0).w));
  });

  it('hit: a page\'s nearest line; in a gap the nearer page\'s ' +
    'edge line (D33)', () => {
    const {L, P, Pl} = printed(doc);
    const fs = (i) => P.at(i).frames[0].frags;
    const r0 = Pl.sheet.rect(P.at(0)), r1 = Pl.sheet.rect(P.at(1));
    const last0 = fs(0).at(-1), first1 = fs(1)[0];
    const key = (h) => h && [h.it.id, h.k];
    const x = r0.x + 100;
    assert.deepEqual(key(Pl.hit(x, r0.y + r0.h + 2)),
      [last0.id, last0.l1 - 1]);
    assert.deepEqual(key(Pl.hit(x, r1.y - 2)), [first1.id, first1.l0]);
    assert.deepEqual(key(Pl.hit(x, r1.y + 3)), [first1.id, first1.l0]);
    assert.deepEqual(key(Pl.hit(x, 0)), [L.items[0].id, 0]);
    P.finish();
    const lp = P.at(P.count - 1), lf = lp.frames[0].frags.at(-1);
    const rl = Pl.sheet.rect(lp);
    assert.deepEqual(key(Pl.hit(x, rl.y + rl.h + 500)),
      [lf.id, lf.l1 - 1]);
    for (const bad of [NaN, Infinity]) {
      assert.equal(Pl.hit(x, bad), null);
      assert.equal(Pl.hit(bad, 10), null);
    }
    // every line's middle hits that line
    for (const f of fs(1)) {
      const it = L.byId.get(f.id);
      for (let j = f.l0; j < f.l1; j++) {
        const a = Pl.lineAt(it, j);
        assert.deepEqual(key(Pl.hit(a.x + 5,
          a.y + it.lines[j].h / 2)), [it.id, j]);
      }
    }
  });

  it('rects of lines crossing a page break: a box on each page, ' +
    'none in the gap', () => {
    const {L, P, Pl} = printed(doc);
    P.finish();
    let split = 0;
    for (let i = 1; i < P.count; i++) {
      const pg = P.at(i);
      if (!(pg.start.line > 0)) continue;
      split++;
      const it = L.items[pg.start.k];
      const rs = Pl.rects(it, 0, it.lines.length);
      const ra = Pl.sheet.rect(P.at(i - 1)), rb = Pl.sheet.rect(pg);
      assert.equal(rs.length, 2, `page ${i}`);
      assert.ok(inRect(rs[0], ra) && inRect(rs[1], rb));
      assert.ok(!rs.some((a) => meetsGap(a, ra, rb)));
      for (let k = 0; k < it.lines.length; k++) {
        assert.equal(Pl.rects(it, k, k + 1).length, 1);
      }
      const sel = select({id: it.id, off: 0},
        {id: it.id, off: it.para.text.length});
      const sr = L.selectionRects(sel);
      assert.ok(sr.length >= it.lines.length);
      assert.ok(sr.every((a) => inRect(a, ra) || inRect(a, rb)));
      assert.ok(sr.some((a) => inRect(a, ra)) &&
        sr.some((a) => inRect(a, rb)));
    }
    assert.ok(split > 0);
  });

  it('extent: the pages\' heights and gaps; the widest page',
    async () => {
      const {L, P, Pl} = printed(doc);
      P.finish();
      const ps = P.list.filter((x) => !x.blank);
      const sum = ps.reduce((a, x) => a + x.h, 0);
      const e = Pl.extent();
      const want = L.top + 2 * PAGE_TOP + sum +
        (ps.length - 1) * PAGE_GAP;
      assert.ok(Math.abs(e.h - want) <= 1, `${e.h} ${want}`);
      assert.deepEqual(L.layout(800), e);
      const land = '<w:p><w:pPr><w:sectPr><w:pgSz w:w="11906" ' +
        'w:h="16838"/></w:sectPr></w:pPr><w:r><w:t>a</w:t></w:r>' +
        '</w:p><w:p><w:r><w:t>b</w:t></w:r></w:p><w:sectPr>' +
        '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>' +
        '</w:sectPr>';
      const {L: M} = await docLayout(land);
      const Q = new Pages(galleyOf(M)).finish();
      M.place = PlacePrint(M, Q);
      const wide = Q.at(1).w;
      assert.ok(wide > 1100 && wide > Q.at(0).w);
      M.layout(800);
      const w = M.place.extent().w;
      assert.ok(w >= 2 * MARGIN + wide && w <= 2 * MARGIN + wide + 1,
        `${w} ${wide}`);
    });

  it('a cell\'s lines move with their table', async () => {
    const tbl = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="3000"/>' +
      '</w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>cell</w:t></w:r></w:p>' +
      '</w:tc></w:tr></w:tbl>';
    const {L} = await docLayout('<w:p><w:r><w:t>one</w:t></w:r>' +
      '<w:r><w:br w:type="page"/></w:r></w:p>' + tbl);
    const P = new Pages(galleyOf(L));
    L.place = PlacePrint(L, P);
    const cell = [...L.byId.values()].find((x) => x.kind === 'p' &&
      x.para.text === 'cell');
    const t = L.items.find((x) => x.kind === 'tbl');
    assert.deepEqual(shiftOf(L.place, cell, 0), shiftOf(L.place, t, 0));
    assert.equal(L.place.lineAt(cell, 0).page, 1);
    assert.equal(L.place.rects(cell, 0, 1).length, 1);
    const c = L.caretRect({id: cell.id, off: 1});
    assert.ok(inRect({y: c.y, h: c.h}, L.place.sheet.rect(P.at(1))));
  });

  it('a line taller than the frame: cut, a clipped part on each ' +
    'page', async () => {
    const {L} = await docLayout('<w:p><w:r><w:t>a</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:spacing w:line="20000" w:lineRule="exact"/>' +
      '</w:pPr><w:r><w:t>tall</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>b</w:t></w:r></w:p>');
    const P = new Pages(galleyOf(L));
    const Pl = PlacePrint(L, P);
    const it = L.items[1];
    assert.ok(it.lines[0].h > P.at(0).frameH);
    // (it does not fit under 'a': page 2 starts with it, page 3 has
    // the rest)
    const a = Pl.pageFrags(1)[0], b = Pl.pageFrags(2)[0];
    assert.ok(a.it === it && b.it === it);
    for (const [f, pg] of [[a, P.at(1)], [b, P.at(2)]]) {
      const [fr] = pg.frames;
      assert.deepEqual(f.clip, {y0: fr.y, y1: fr.y + fr.h});
    }
    assert.equal(a.tail, false);
    assert.equal(b.head, false);
    const rs = Pl.rects(it, 0, 1);
    assert.equal(rs.length, 2);
    rs.forEach((x, j) => {
      const i = j + 1;
      const rc = Pl.sheet.rect(P.at(i)), fr = P.at(i).frames[0];
      assert.ok(x.y >= rc.y + fr.y - 1 && x.y + x.h <= rc.y + fr.y +
        fr.h + 1, `${i}`);
    });
    assert.equal(Pl.pageOf(it, 0), 1);
    assert.equal(Pl.pageFrags(0)[0].clip, null);
  });

  it('visible: the fragments of the pages in the band only, ' +
    'whole-pixel shifts; band() their galley span', () => {
    const {L, P, Pl} = printed(doc);
    const r1 = Pl.sheet.rect(P.at(1));
    const vs = Pl.visible(r1.y + 10, r1.y + 50);
    const ids = P.at(1).frames[0].frags.map((f) => f.id);
    assert.deepEqual(vs.map((v) => v.it.id), ids);
    for (const v of vs) {
      assert.ok(Number.isInteger(v.dx) && Number.isInteger(v.dy));
    }
    assert.deepEqual(Pl.visible(r1.y - 10, r1.y - 2), []);
    const b = Pl.band(r1.y, r1.y + r1.h);
    const f0 = P.at(1).frames[0].frags[0];
    const it0 = L.byId.get(f0.id);
    assert.equal(b.y0, it0.y + it0.lines[f0.l0].y);
    assert.equal(Pl.band(r1.y - 10, r1.y - 2), null);
  });

  it('caret rects of every page\'s first character are on that page',
    () => {
      const {L, P, Pl} = printed(doc);
      P.finish();
      for (let i = 0; i < P.count; i++) {
        const c = P.at(i).start, it = L.items[c.k];
        const off = it.lines[c.line].from;
        const cr = L.caretRect({id: it.id, off});
        assert.ok(inRect(cr, Pl.sheet.rect(P.at(i))), `page ${i}`);
      }
    });
});

// Tables across pages (P4.2, D8, D33, PG10; review P3 I1): a cell's
// line is placed, hit and lit on the page whose fragment shows its
// row (the rest of a cut row at the frame's top, under the repeated
// header rows), never by the table's first page; a click in a
// repeated header row is the original header row's cell.
describe('PlacePrint: tables across pages (P4.2)', () => {
  let S;
  before(async () => {
    await loadStyles();
    S = await splitTable({rows: 40, tall: 120});
  });
  const frameOf = (i) => {
    const r = S.Pl.sheet.rect(S.P.at(i)), fr = S.P.at(i).frames[0];
    return {y0: r.y + fr.y, y1: r.y + fr.y + fr.h, x: r.x};
  };
  const mid = (it, k = 0) => {
    const p = S.Pl.lineAt(it, k);
    return {x: p.x + 5, y: p.y + it.lines[k].h / 2};
  };
  const hitId = (x, y) => {
    const h = S.L.hitTest(x, y);
    const it = h && S.L.locate(h.pos).item;
    return it && it.para ? it.para.text : it && it.id;
  };
  const T = (it) => it.para.text;

  it('a cell line in the rest of a cut row: its page, at the frame\'s ' +
    'top under the heads; hit there is it', () => {
    const fs = tableFrags(S.Pl, S.t), {i, f} = fs[1];
    const it = cellItem(S.L, 't' + f.from[0]), p = S.Pl.lineAt(it, 0);
    const fr = frameOf(i), heads = S.t.rows[1].ry;
    assert.equal(p.page, i);
    assert.ok(Math.abs(p.y - (fr.y0 + heads)) <= 0.5 + 1e-9,
      `${p.y} ${fr.y0}`);
    const m = mid(it);
    assert.equal(hitId(m.x, m.y), T(it));
    assert.equal(S.Pl.pageOf(it, 0), i);
    const c = S.L.caretRect({id: it.id, off: 1});
    assert.ok(c.y >= fr.y0 && c.y + c.h <= fr.y1);
  });

  it('every cell line of the table: on its page\'s frame, hit back',
    () => {
      for (let i = 0; i < S.P.count; i++) {
        const fr = frameOf(i);
        for (const it of S.L.byId.values()) {
          if (it.kind !== 'p' || it.col === S.L.root) continue;
          const p = S.Pl.lineAt(it, 0);
          if (p.page !== i) continue;
          assert.ok(p.y >= fr.y0 - 0.5 && p.y + it.lines[0].h <=
            fr.y1 + 0.5, `${it.para.text} on page ${i}`);
          const m = mid(it);
          assert.equal(hitId(m.x, m.y), T(it));
        }
      }
    });

  it('rows after the cut row, on the page of its rest', () => {
    const fs = tableFrags(S.Pl, S.t), {i} = fs[2];
    const it = cellItem(S.L, 'r4a'), p = S.Pl.lineAt(it, 0);
    assert.equal(p.page, i);
    const m = mid(it);
    assert.equal(hitId(m.x, m.y), T(it));
    assert.deepEqual(S.Pl.rects(it, 0, 1).map((r) => r.y), [p.y]);
  });

  it('a click in a repeated header row: the original row\'s cell ' +
    '(PG10)', () => {
    const fs = tableFrags(S.Pl, S.t), h0 = cellItem(S.L, 'H0');
    for (const {i} of fs.slice(1)) {
      const fr = frameOf(i), x = S.Pl.lineAt(h0, 0).x + 5;
      const it = hitId(x, fr.y0 + 4);
      assert.equal(it, 'H0', `page ${i}`);
    }
    assert.equal(S.Pl.lineAt(h0, 0).page, fs[0].i);
  });

  it('a cells selection over rows on two pages: boxes on each, none ' +
    'in the gap', () => {
    const fs = tableFrags(S.Pl, S.t), a = cellItem(S.L, 'r4a');
    const b = cellItem(S.L, 'r30b');
    const sel = select({id: a.id, off: 0}, {id: b.id, off: 1});
    const rs = S.L.selectionRects(sel, -Infinity, Infinity);
    assert.ok(rs.length > 2);
    const pages = new Set();
    for (const r of rs) {
      const i = [...Array(S.P.count).keys()].find((j) => {
        const fr = frameOf(j);
        return r.y >= fr.y0 - 1 && r.y + r.h <= fr.y1 + 1;
      });
      assert.ok(i !== undefined, JSON.stringify(r));
      pages.add(i);
    }
    assert.ok(pages.size >= 2 || fs.length < 3, [...pages].join());
  });

  it('the Consumer Confidence Report (corpus): every cell line hit ' +
    'back on its page', async (t) => {
    const f = new URL('./corpus/open-xml-sdk/v2FxTestFiles/' +
      'wordprocessing/table/2003 Consumer Confidence Report.docx',
    import.meta.url);
    if (!existsSync(f)) return t.skip('corpus absent');
    const doc = await readDocx(readFileSync(f));
    const {L, P, Pl} = printed(doc, 1000);
    P.finish();
    let n = 0, cont = 0;
    for (const it of L.byId.values()) {
      if (it.kind !== 'p' || it.col === L.root || !it.lines.length) {
        continue;
      }
      const p = Pl.lineAt(it, 0);
      if (p.page === null) continue;
      const r = Pl.sheet.rect(P.at(p.page)), fr = P.at(p.page).frames[0];
      assert.ok(p.y >= r.y + fr.y - 1 && p.y <= r.y + fr.y + fr.h,
        `${it.id} page ${p.page}`);
      const h = L.hitTest(p.x + 2, p.y + it.lines[0].h / 2);
      const got = h && L.locate(h.pos).item;
      if (got !== it) {
        // (an empty or zero-width line: the item at its place)
        assert.ok(got && got.y === it.y, `${it.id}: ${got && got.id}`);
      }
      assert.ok(true);
      n++;
      if (P.at(p.page).start.k === PFind.rootOf(galleyOf(L), it) &&
        P.at(p.page).start.line > 0) cont++;
    }
    assert.ok(n > 100 && cont > 10, `${n} ${cont}`);
  });
});
