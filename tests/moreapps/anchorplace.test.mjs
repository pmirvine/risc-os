// AnchorPlace: floating pictures placed on their pages (Batch D
// P12.2, D26). In Print layout (DocLayout opts.floats) an understood
// anchor is a zero-width item in its paragraph and the picture is
// placed on the page of its line: horizontal from its relativeFrom
// box (column, margin, page, inside/outside by parity...) with an
// align or offset, vertical from paragraph, line, margin, page...;
// kept on the page (PG30); a layoutInCell float in a cell in the
// cell; z by relativeHeight, behindDoc drawn under the text. Draft
// (no floats) and anchors not understood: inline, dashed, as today.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {galleyOf} from '../../tools/moreapps/!Letters/PageGalley';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {placeFloats} from '../../tools/moreapps/!Letters/AnchorPlace';
import {exclusionsOf} from '../../tools/moreapps/!Letters/LineShape';
import {paintPage} from '../../tools/moreapps/!Letters/PagePaint';
import {picAt, selectedPic} from '../../tools/moreapps/!Letters/PicFind';
import {select} from '../../tools/moreapps/!Letters/Selection';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {drawingXml, URIS} from './pic-fixtures.mjs';
import {loadStyles, tm} from './word-docs.mjs';
import {tbl, tr, tc} from './tbl-fixtures.mjs';

before(loadStyles);

const EMU = 9525;                      // per px
const off = (px) => `<wp:posOffset>${Math.round(px * EMU)}` +
  '</wp:posOffset>';
const al = (s) => `<wp:align>${s}</wp:align>`;

/** A run holding a floating picture (96 x 48 px unless cx, cy):
 *  h, v: [relativeFrom, inner]; behind, rh, cell (layoutInCell),
 *  simple (simplePos="1": not understood), descr, wrap. */
function anchorRun({h = ['column', off(0)], v = ['paragraph', off(0)],
  behind = false, rh = 251659264, cell = true, simple = false,
  descr, cx = 96 * EMU, cy = 48 * EMU, id = 1,
  wrap = '<wp:wrapSquare wrapText="bothSides"/>'} = {}) {
  let s = drawingXml({kind: 'anchor', cx, cy, id, descr});
  s = s.replace(/<wp:positionH[^]*<\/wp:positionV>/,
    `<wp:positionH relativeFrom="${h[0]}">${h[1]}</wp:positionH>` +
    `<wp:positionV relativeFrom="${v[0]}">${v[1]}</wp:positionV>`)
    .replace('behindDoc="0"', `behindDoc="${behind ? 1 : 0}"`)
    .replace('relativeHeight="251659264"', `relativeHeight="${rh}"`)
    .replace('layoutInCell="1"', `layoutInCell="${cell ? 1 : 0}"`)
    .replace('<wp:wrapSquare wrapText="bothSides"/>', wrap);
  if (simple) s = s.replace('simplePos="0"', 'simplePos="1"');
  return `<w:r>${s}</w:r>`;
}

// Letter, 1 in margins: page 816 x 1056 px, text 96..720 x 96..960
const SECT = (cols = '') => '<w:sectPr><w:pgSz w:w="12240" ' +
  'w:h="15840"/><w:pgMar w:top="1440" w:right="1440" ' +
  'w:bottom="1440" w:left="1440" w:header="720" w:footer="720" ' +
  `w:gutter="0"/>${cols}</w:sectPr>`;
const PAGE = '<w:r><w:br w:type="page"/></w:r>';
const ROOT = ` xmlns:wp="${URIS.wp}" xmlns:a="${URIS.a}" ` +
  `xmlns:pic="${URIS.pic}"`;
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota';
const text = (n) => Array.from({length: n}, () => WORDS).join(' ');

async function docOf(body, cols) {
  return readDocx(await buildDocx({'word/document.xml':
    documentXml(body + SECT(cols), {rootAttrs: ROOT})}));
}

/** body laid out (floats: Print layout's galley) and paginated. */
async function laid(body, {floats = true, cols} = {}) {
  const doc = await docOf(body, cols);
  const L = new DocLayout(doc, tm(), null, {floats});
  L.layout(1000);
  const P = new Pages(galleyOf(L)).finish();
  return {doc, L, P};
}

/** The one float of page i. */
function one(P, i = 0) {
  const fs = placeFloats(P, i);
  assert.equal(fs.length, 1, JSON.stringify(fs));
  return fs[0];
}

/** The page y of the top of root paragraph k's line j on page 0. */
function lineY(P, L, k, j = 0) {
  const fr = P.at(0).frames[0], f = fr.frags[k - fr.start.k];
  return f.y + L.items[k].lines[j].y;
}

describe('AnchorPlace: horizontal (D26)', () => {
  it('column, margin and page offsets', async () => {
    for (const [from, x] of [['column', 96 + 30], ['margin', 96 + 30],
      ['page', 30], ['leftMargin', 30], ['rightMargin', 720 + 30]]) {
      const {P} = await laid(p(anchorRun({h: [from, off(30)]}) +
        r('text')));
      const f = one(P);
      assert.equal(f.x, x, from);
      assert.equal(f.w, 96);
      assert.equal(f.h, 48);
    }
  });

  it('aligns: left, center, right of the box', async () => {
    const want = {margin: {left: 96, center: 96 + (624 - 96) / 2,
      right: 720 - 96}, page: {left: 0, center: (816 - 96) / 2,
      right: 816 - 96}, rightMargin: {left: 720, center: 720,
      right: 720}};
    for (const from of Object.keys(want)) {
      for (const a of ['left', 'center', 'right']) {
        const {P} = await laid(p(anchorRun({h: [from, al(a)]})));
        assert.equal(one(P).x, want[from][a], `${from} ${a}`);
      }
    }
  });

  it('a negative offset and the int32 caps stay finite', async () => {
    const {P} = await laid(p(anchorRun({h: ['page',
      '<wp:posOffset>-2147483648</wp:posOffset>']})));
    const f = one(P);
    assert.ok(Number.isFinite(f.x) && f.x < -200000);
    const b = await laid(p(anchorRun({h: ['page',
      '<wp:posOffset>2147483647</wp:posOffset>']})));
    assert.ok(Number.isFinite(one(b.P).x));
  });

  it('character: from the anchor\'s place in its line', async () => {
    const {P, L} = await laid(p(r('abcd') + anchorRun({h: ['character',
      off(10)]}) + r('efgh')));
    const it = L.items[0].lines[0].items.find((x) => x.kind ===
      'anchor');
    assert.equal(one(P).x, 96 + it.x + 10);
    assert.equal(it.x, 32);            // (fake: 8 px a character)
  });

  it('inside / outside by the page\'s parity', async () => {
    const body = (h) => p(anchorRun({h})) + p(PAGE) +
      p(anchorRun({h}));
    const cases = [[['margin', al('inside')], 96, 720 - 96],
      [['margin', al('outside')], 720 - 96, 96],
      [['insideMargin', al('left')], 0, 720],
      [['outsideMargin', al('left')], 720, 0],
      [['page', al('inside')], 0, 816 - 96]];
    for (const [h, odd, even] of cases) {
      const {P} = await laid(body(h));
      assert.equal(P.at(0).parity, 'odd');
      assert.equal(P.at(1).parity, 'even');
      assert.equal(one(P, 0).x, odd, `${h} odd`);
      assert.equal(one(P, 1).x, even, `${h} even`);
    }
  });

  it('column: the frame of the column the anchor is in', async () => {
    const cols = '<w:cols w:num="2" w:space="720"/>';
    const body = p(r(text(2))) + '<w:p><w:r><w:br w:type="column"/>' +
      '</w:r></w:p>' + p(anchorRun({h: ['column', off(5)]}) + r('x'));
    const {P} = await laid(body, {cols});
    const fr = P.at(0).frames;
    assert.equal(fr.length, 2);
    assert.equal(one(P).x, fr[1].x + 5);
  });
});

describe('AnchorPlace: vertical (D26)', () => {
  it('paragraph: the anchor paragraph\'s top on the page', async () => {
    const {P, L} = await laid(p(r(text(3))) + p(r('two')) +
      p(anchorRun({v: ['paragraph', off(20)]}) + r('three')));
    const fr = P.at(0).frames[0];
    assert.equal(one(P).y, fr.frags[2].y + 20);
    assert.ok(fr.frags[2].y > fr.frags[0].y + 30);
    assert.equal(L.items[2].kind, 'p');
  });

  it('line: the top of the anchor\'s line', async () => {
    const {P, L} = await laid(p(r(text(4)) + anchorRun({v: ['line',
      off(3)]}) + r(' tail')));
    const it = L.items[0];
    const j = it.lines.findIndex((ln) => ln.items.some((x) =>
      x.kind === 'anchor'));
    assert.ok(j > 0, 'on a later line');
    assert.equal(one(P).y, lineY(P, L, 0, j) + 3);
  });

  it('margin, page, top and bottom margin', async () => {
    const cases = [[['margin', off(10)], 96 + 10],
      [['margin', al('top')], 96], [['margin', al('bottom')], 960 - 48],
      [['margin', al('center')], 96 + (864 - 48) / 2],
      [['page', off(10)], 10], [['page', al('bottom')], 1056 - 48],
      [['topMargin', al('bottom')], 96 - 48],
      [['topMargin', off(4)], 4],
      [['bottomMargin', al('top')], 960],
      [['bottomMargin', off(0)], 960]];
    for (const [v, y] of cases) {
      const {P} = await laid(p(anchorRun({v})));
      assert.equal(one(P).y, y, JSON.stringify(v));
    }
  });

  it('a float below the page bottom is moved up (PG30)', async () => {
    const {P} = await laid(p(anchorRun({v: ['page', off(1040)]})));
    assert.equal(one(P).y, 1056 - 48);
    const b = await laid(p(anchorRun({v: ['paragraph', off(5000)]})));
    assert.equal(one(b.P).y, 1056 - 48);
    const c = await laid(p(anchorRun({v: ['page', off(-300)]})));
    assert.equal(one(c.P).y, 0, 'above the top: moved down');
    const tall = await laid(p(anchorRun({v: ['page', off(50)],
      cy: 2000 * EMU})));
    assert.equal(one(tall.P).y, 0, 'taller than the page: its top');
  });

  it('the float is on the page of its line', async () => {
    const body = Array.from({length: 40}, (_, i) => p(r(text(2) +
      ' ' + i))).join('') + p(r('here') + anchorRun({v: ['paragraph',
      off(0)]}));
    const {P, L} = await laid(body);
    const k = L.items.length - 1;
    const i = P.ofPos({id: L.items[k].id, off: 0});
    assert.ok(i > 0);
    for (let j = 0; j < P.count; j++) {
      assert.equal(placeFloats(P, j).length, j === i ? 1 : 0, `page ${j}`);
    }
  });
});

describe('AnchorPlace: z-order, cells, laziness', () => {
  it('behind ones first, then by relativeHeight', async () => {
    const {P} = await laid(p(anchorRun({rh: 9, id: 1, descr: 'a'}) +
      anchorRun({rh: 3, id: 2, behind: true, descr: 'b'}) +
      anchorRun({rh: 5, id: 3, descr: 'c'}) +
      anchorRun({rh: 1, id: 4, behind: true, descr: 'd'})));
    const fs = placeFloats(P, 0);
    assert.deepEqual(fs.map((f) => [f.pic.alt, f.behind, f.z]),
      [['d', true, 1], ['b', true, 3], ['c', false, 5],
        ['a', false, 9]]);
    assert.ok(Object.isFrozen(fs) && Object.isFrozen(fs[0]));
  });

  it('Page.floats: lazy, cached, not an own field', async () => {
    const {P} = await laid(p(anchorRun()) + p(PAGE) + p(r('none')));
    const pg = P.at(0);
    assert.ok(!Object.keys(pg).includes('floats'));
    assert.equal(pg.floats, pg.floats);
    assert.equal(pg.floats.length, 1);
    assert.deepEqual(P.at(1).floats, []);
    assert.deepEqual({...pg.floats[0]}, {...placeFloats(P, 0)[0]});
  });

  it('layoutInCell: placed in its cell', async () => {
    const tc = (inner) => '<w:tc><w:tcPr><w:tcW w:w="3000" ' +
      'w:type="dxa"/></w:tcPr>' + inner + '</w:tc>';
    const tbl = (cell) => p(r('above')) + '<w:tbl><w:tblPr>' +
      '<w:tblW w:w="6000" w:type="dxa"/></w:tblPr><w:tblGrid>' +
      '<w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>' +
      '<w:tr>' + tc(p(r('left'))) + tc(p(r('in') + anchorRun({cell,
        h: ['column', off(7)], v: ['paragraph', off(2)]}))) +
      '</w:tr></w:tbl>' + p(r('below'));
    const {P, L} = await laid(tbl(true));
    const t = L.items[1], c = t.rows[0].cells[1];
    const x0 = Number.isFinite(c.tx) ? c.tx : c.x;
    const fr = P.at(0).frames[0], f = fr.frags[1];
    const para = c.col.items[0];
    const fl = one(P);
    assert.equal(fl.x, x0 + (f.x - t.x) + 7);
    assert.equal(fl.y, para.y + (f.y - t.y) + 2);
    assert.equal(fl.cell, true);
    const b = await laid(tbl(false));
    assert.equal(one(b.P).x, 96 + 7, 'not in cell: the column');
  });

  it('a page with no anchors builds no float work', async () => {
    const {P} = await laid(p(r('plain')));
    assert.deepEqual(placeFloats(P, 0), []);
    assert.deepEqual(placeFloats(P, 5), []);
    assert.deepEqual(placeFloats(P, -1), []);
    assert.deepEqual(placeFloats(P, NaN), []);
  });
});

describe('AnchorPlace: the galley (Print layout only)', () => {
  const lineOf = (L) => L.items[0].lines[0].items.map((x) =>
    [x.kind, x.x, x.w, x.from, x.to]);

  it('Draft unchanged: the picture inline, dashed (snapshot)',
    async () => {
      const {L, P} = await laid(p(r('ab') + anchorRun() + r('cd')),
        {floats: false});
      assert.deepEqual(lineOf(L), [['text', 0, 16, 0, 2],
        ['pic', 16, 96, 2, 3], ['text', 112, 16, 3, 5]]);
      assert.equal(L.items[0].lines[0].items[1].pic.floating, true);
      assert.deepEqual(placeFloats(P, 0), []);
    });

  it('Print layout: the anchor is zero width', async () => {
    const {L} = await laid(p(r('ab') + anchorRun() + r('cd')));
    assert.deepEqual(lineOf(L), [['text', 0, 16, 0, 2],
      ['anchor', 16, 0, 2, 3], ['text', 16, 16, 3, 5]]);
  });

  it('unknown anchors: inline, dashed, as today, not placed',
    async () => {
      const {L, P} = await laid(p(r('ab') + anchorRun({simple: true}) +
        r('cd')));
      assert.deepEqual(lineOf(L)[1], ['pic', 16, 96, 2, 3]);
      assert.deepEqual(placeFloats(P, 0), []);
      const Pl = PlacePrint(L, P), calls = [];
      const g = new Proxy({}, {get: (t, k) => (k in t ? t[k]
        : (...a) => calls.push([k, ...a])), set: (t, k, v) => {
        t[k] = v;
        return true;
      }});
      paintPage(P, 0, g, {place: Pl});
      assert.ok(calls.some((c) => c[0] === 'setLineDash' &&
        c[1].length === 2), 'dashed');
    });

  it('a view switch re-breaks only the paragraphs with anchors',
    async () => {
      const doc = await docOf(p(r('one')) + p(anchorRun()) +
        p(r('three')));
      const m = tm();
      const a = new DocLayout(doc, m, null, {floats: false});
      a.layout(1000);
      const lines = a.items.map((it) => it.lines);
      const b = new DocLayout(doc, m, a, {floats: true});
      b.layout(1000);
      assert.equal(b.floats, true);
      assert.equal(b.items[0].lines, lines[0]);
      assert.notEqual(b.items[1].lines, lines[1]);
      assert.equal(b.items[2].lines, lines[2]);
      assert.equal(b.items[1].lines[0].items[0].kind, 'anchor');
      const c = new DocLayout(doc, m, b);       // (prev's: floats)
      c.layout(1000);
      assert.equal(c.floats, true);
      assert.equal(c.items[1].lines, b.items[1].lines);
      const d = new DocLayout(doc, m, c, {floats: false});
      d.layout(1000);
      assert.equal(d.items[1].lines[0].items[0].kind, 'pic');
    });
});

describe('AnchorPlace: painted (D26)', () => {
  it('behindDoc under the text, the others over it', async () => {
    const {L, P} = await laid(p(anchorRun({behind: true, id: 1,
      descr: 'BEHIND'}) + anchorRun({id: 2, descr: 'FRONT'}) +
      r('words')));
    const Pl = PlacePrint(L, P), order = [];
    const g = new Proxy({}, {get: (t, k) => (k in t ? t[k]
      : k === 'fillText' ? (s) => order.push(s) : () => {}),
    set: (t, k, v) => {
      t[k] = v;
      return true;
    }});
    paintPage(P, 0, g, {place: Pl});
    const at = (s) => order.indexOf(s);
    assert.ok(at('BEHIND') >= 0 && at('FRONT') >= 0, order.join());
    assert.ok(at('BEHIND') < at('words'), order.join());
    assert.ok(at('words') < at('FRONT'), order.join());
  });
});

describe('AnchorPlace: found where drawn (PicFind)', () => {
  it('a click on a placed float finds it; its selection too',
    async () => {
      const {L, P} = await laid(p(r('ab') + anchorRun({h: ['page',
        off(300)], v: ['page', off(500)]}) + r('cd')) +
        p(anchorRun({behind: true, id: 2, h: ['page', off(300)],
          v: ['page', off(700)]})));
      L.place = PlacePrint(L, P);
      L.layout(1000);
      const o = L.place.sheet.rect(P.at(0));
      const hit = picAt(L, o.x + 340, o.y + 520);
      assert.ok(hit, 'found');
      assert.deepEqual(hit.rect, {x: o.x + 300, y: o.y + 500, w: 96,
        h: 48});
      assert.equal(hit.item.kind, 'pic');
      assert.equal(hit.item.pic.floating, true);
      assert.deepEqual(hit.pos, {id: L.items[0].id, off: 2});
      const b = picAt(L, o.x + 340, o.y + 720);
      assert.ok(b && b.pos.id === L.items[1].id, 'behind text, no ' +
        'text over it: found');
      assert.equal(picAt(L, o.x + 290, o.y + 520), null);
      const sel = select({id: L.items[0].id, off: 2},
        {id: L.items[0].id, off: 3});
      assert.deepEqual(selectedPic(L, sel).rect, hit.rect);
    });
});

// ------------------------------------------------ floating tables (R5)

/** A floating table (2 columns of 2000 twips, n rows): attrs the
 *  w:tblpPr's attributes, never: tblOverlap never; t its first text. */
function ftbl(attrs, {never = false, n = 2, t = 'T'} = {}) {
  const pr = `<w:tblpPr ${attrs}/>` + (never
    ? '<w:tblOverlap w:val="never"/>' : '');
  return tbl(Array.from({length: n}, (x, i) => tr([tc(p(r(t + i))),
    tc(p(r('c')))])), {tblPr: pr});
}
const tbls = (P, i = 0) => placeFloats(P, i).filter((f) =>
  f.tbl !== undefined);
const tblOf = (P, i = 0) => {
  const fs = tbls(P, i);
  assert.equal(fs.length, 1, JSON.stringify(fs));
  return fs[0];
};
const itemOf = (L, id) => L.items.find((x) => x.id === id);
/** The g of a fake 2D context recording every call in calls. */
function rec(calls) {
  return new Proxy({}, {get: (t, k) => (k in t ? t[k]
    : (...a) => calls.push([k, ...a])), set: (t, k, v) => {
    t[k] = v;
    return true;
  }});
}
const dashed = (calls) => calls.some((c) => c[0] === 'setLineDash' &&
  c[1].length === 2 && c[1][0] === 4);

describe('AnchorPlace: floating tables (P12.6, R5)', () => {
  it('page anchored, tblpX 2880 / tblpY 1440: 2 in / 1 in from the ' +
    'page corner; drawn there; no height in the flow', async () => {
      const {L, P} = await laid(p(r('a')) + ftbl('w:horzAnchor="page" ' +
        'w:vertAnchor="page" w:tblpX="2880" w:tblpY="1440"') +
        p(r('b')));
      const f = tblOf(P), it = itemOf(L, f.tbl);
      assert.equal(it.kind, 'tbl');
      assert.deepEqual([f.x, f.y, f.w, f.h, f.behind],
        [192, 96, it.width, it.h, false]);
      assert.ok(f.z < 0);
      const Pl = PlacePrint(L, P);
      const fr = Pl.pageFrags(0).find((x) => x.it === it);
      assert.equal(fr.clip, null);
      // (dx, dy whole px: PrintFrags)
      assert.ok(Math.abs(it.x + it.left + fr.dx - 192) <= 0.5);
      assert.ok(Math.abs(it.y + fr.dy - 96) <= 0.5);
      // 'b' where it would be without the table
      const {L: L2, P: P2} = await laid(p(r('a')) + p(r('b')));
      const yb = (Q) => {
        const fs = Q.at(0).frames[0].frags;
        return fs[fs.length - 1].y;
      };
      assert.ok(Math.abs(yb(P) - yb(P2)) < 1e-6, yb(P) + ' ' + yb(P2));
      // painted at its float, no dashed outline
      const calls = [];
      paintPage(P, 0, rec(calls), {place: Pl});
      assert.equal(dashed(calls), false);
      assert.ok(calls.some((c) => c[0] === 'fillText' && c[1] === 'T0'));
    });

  it('margin + xSpec right: flush with the right margin; xSpec wins ' +
    'over tblpX', async () => {
      const {P} = await laid(p(r('a')) + ftbl('w:horzAnchor="margin" ' +
        'w:tblpXSpec="right" w:tblpX="500"'));
      const f = tblOf(P);
      assert.equal(f.x + f.w, 720);
      const c = await laid(p(r('a')) + ftbl('w:horzAnchor="margin" ' +
        'w:tblpXSpec="center"'));
      const g = tblOf(c.P);
      assert.equal(g.x, 96 + (624 - g.w) / 2);
      const t = await laid(p(r('a')) + ftbl('w:horzAnchor="text" ' +
        'w:tblpX="300"'));
      assert.equal(tblOf(t.P).x, 96 + 20);
    });

  it('vertical text follows its flow place when a paragraph above ' +
    'grows; margin and page as pictures', async () => {
      const at = async (n, y = '') => {
        const {L, P} = await laid(p(r(text(n))) + ftbl('w:vertAnchor=' +
          `"text" w:horzAnchor="page"${y}`));
        return {f: tblOf(P), h: L.items[0].h, L, P};
      };
      const a = await at(1), b = await at(4), c = await at(1,
        ' w:tblpY="300"');
      assert.ok(b.h > a.h);
      const near = (u, v) => assert.ok(Math.abs(u - v) < 1e-6, u + ' ' +
        v);
      near(b.f.y - a.f.y, b.h - a.h);
      near(c.f.y - a.f.y, 20);
      // its place: the flow place (a table holding no height there)
      const fr = a.P.at(0).frames[0];
      assert.equal(a.f.y, fr.frags[1].y);
      const m = await laid(p(r('a')) + ftbl('w:vertAnchor="margin" ' +
        'w:tblpYSpec="bottom"'));
      const fm = tblOf(m.P);
      near(fm.y + fm.h, 960);
      const pg = await laid(p(r('a')) + ftbl('w:vertAnchor="page" ' +
        'w:tblpYSpec="center"'));
      const fp = tblOf(pg.P);
      near(fp.y, (1056 - fp.h) / 2);
    });

  it('inside / outside by the page\'s parity', async () => {
    for (const [spec, odd, even] of [['inside', 'l', 'r'],
      ['outside', 'r', 'l']]) {
      const t = ftbl(`w:horzAnchor="margin" w:tblpXSpec="${spec}"`);
      const {P} = await laid(p(r('a')) + t + p(PAGE) + t + p(r('b')));
      const x = (f, s) => (s === 'l' ? 96 : 720 - f.w);
      const f0 = tblOf(P, 0), f1 = tblOf(P, 1);
      assert.equal(f0.x, x(f0, odd), spec + ' odd');
      assert.equal(f1.x, x(f1, even), spec + ' even');
    }
  });

  it('tblOverlap never moves the second table below the first; ' +
    'overlap allowed and the same place: stacked too (P12b I4)',
  async () => {
      const at = 'w:horzAnchor="page" w:vertAnchor="page" ' +
        'w:tblpX="1440" w:tblpY="1440"';
      const a = await laid(p(r('a')) + ftbl(at) + p(r('b')) +
        ftbl(at, {never: true}) + p(r('c')));
      const [f, g] = tbls(a.P);
      assert.equal(g.y, f.y + f.h);
      assert.equal(g.x, f.x);
      const b = await laid(p(r('a')) + ftbl(at) + p(r('b')) +
        ftbl(at) + p(r('c')));
      const [h, k] = tbls(b.P);
      // (at the very same place it would be hidden: stacked, P12b
      // fix I4; at other places allowed: tblfloat-place.test.mjs)
      assert.equal(k.y, h.y + h.h);
    });

  it('kept on the page (PG30); the exclusion its box and fromText',
    async () => {
      const {P} = await laid(p(r('a')) + ftbl('w:horzAnchor="page" ' +
        'w:vertAnchor="page" w:tblpY="16000" w:leftFromText="150" ' +
        'w:rightFromText="300" w:topFromText="15" ' +
        'w:bottomFromText="30"'));
      const f = tblOf(P);
      assert.equal(f.y + f.h, 1056);
      // (the exclusion: ./LineShape's, the one rule, P12.7)
      assert.equal(f.exclusion, undefined);
      const [e] = exclusionsOf([f]);
      assert.deepEqual([e.x0, e.x1, e.y0, e.y1], [f.x - 10,
        f.x + f.w + 20, f.y - 1, f.y + f.h + 2]);
    });

  it('taller than its frame: in the flow, split, dashed', async () => {
    const {L, P} = await laid(p(r('a')) + ftbl('w:horzAnchor="page"',
      {n: 80}));
    assert.ok(P.count > 1);
    assert.deepEqual(tbls(P, 0), []);
    const Pl = PlacePrint(L, P);
    const fr = Pl.pageFrags(1).find((x) => x.it.kind === 'tbl');
    assert.ok(fr.r0 > 0, 'split');
    const calls = [];
    paintPage(P, 0, rec(calls), {place: Pl});
    assert.ok(dashed(calls), 'dashed in the flow');
  });

  it('a floating table in a cell stays in the flow', async () => {
    const inner = ftbl('w:horzAnchor="page" w:tblpX="2880"');
    const {P} = await laid(p(r('a')) + tbl([tr([tc(p(r('x')) + inner +
      p(r('y')))])]));
    assert.deepEqual(tbls(P), []);
  });

  it('not understood: in the flow, dashed', async () => {
    const {L, P} = await laid(p(r('a')) + ftbl('w:horzAnchor="page" ' +
      'w:tblpX="1e9"') + p(r('b')));
    assert.deepEqual(tbls(P), []);
    const calls = [];
    paintPage(P, 0, rec(calls), {place: PlacePrint(L, P)});
    assert.ok(dashed(calls));
  });

  it('Draft unchanged (snapshot): the galley is the same as without ' +
    'tblpPr; no floats', async () => {
      const body = (t) => p(r(text(3))) + t + p(r(text(2)));
      const a = await laid(body(ftbl('w:horzAnchor="page" ' +
        'w:vertAnchor="page" w:tblpX="2880" w:tblpY="1440"')),
      {floats: false});
      const b = await laid(body(tbl([tr([tc(p(r('T0'))), tc(p(r('c')))]),
        tr([tc(p(r('T1'))), tc(p(r('c')))])])), {floats: false});
      const snap = (L) => L.items.map((x) => [x.kind, x.x, x.y, x.h]);
      assert.deepEqual(snap(a.L), snap(b.L));
      assert.deepEqual(tbls(a.P), []);
    });

  it('caret, hit and selection boxes in a placed table are where it ' +
    'is drawn', async () => {
      const {L, P} = await laid(p(r('a')) + ftbl('w:horzAnchor="page" ' +
        'w:vertAnchor="page" w:tblpX="2880" w:tblpY="7200"') +
        p(r('b')));
      const Pl = PlacePrint(L, P), f = tblOf(P), it = itemOf(L, f.tbl);
      const o = Pl.sheet.rect(P.at(0));
      const cellP = it.rows[0].cells[0].col.items[0];
      const at = Pl.lineAt(cellP, 0);
      assert.equal(at.page, 0);
      assert.ok(at.x >= o.x + f.x && at.x < o.x + f.x + f.w, 'x');
      assert.ok(at.y >= o.y + f.y && at.y < o.y + f.y + f.h, 'y');
      const h = Pl.hit(o.x + f.x + 10, o.y + f.y + 5);
      assert.equal(h.it, it);
      assert.equal(h.edge, false);
      // galley point of the hit: in row 0, cell 0
      const gx = o.x + f.x + 10 - h.dx, gy = o.y + f.y + 5 - h.dy;
      assert.ok(gy >= it.rows[0].y && gy < it.rows[0].y + it.rows[0].h);
      assert.ok(gx >= it.rows[0].cells[0].x);
      const rs = Pl.rects(it, 0, 0);
      assert.equal(rs.length, 1);
      assert.ok(Math.abs(rs[0].y - o.y - f.y) <= 0.5);
      assert.ok(Math.abs(rs[0].h - f.h) < 1e-6);
      // a point on 'b' still finds 'b'
      const fb = Pl.pageFrags(0).find((x) => x.it ===
        L.items[L.items.length - 1]);
      const hb = Pl.hit(o.x + 100, o.y + fb.dy + fb.it.y + 2);
      assert.equal(hb.it, fb.it);
    });
});
