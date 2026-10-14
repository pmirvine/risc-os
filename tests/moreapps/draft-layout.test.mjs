// The Draft galley with per-section geometry (Batch D P1.3, D3, R12):
// documents of one page geometry lay out exactly as before P1.3
// (draft-layout.json, made by draft-fixture.mjs from the P1.2 tree);
// each root item carries its section (it.s) and is as wide as its
// section's first column (a landscape section's items: the landscape
// width, re-broken); L.geom(s) is the section's px geometry
// (SectGeom), once per section object.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {pageRect} from '../../tools/moreapps/!Letters/EditPaint';
import {MARGIN} from '../../tools/moreapps/!Letters/DocStack';
import {geomOf, pxOf} from '../../tools/moreapps/!Letters/SectGeom';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {tbl, tr, tc} from './tbl-fixtures.mjs';
import {draftDocs, sample, VIEW_W} from './draft-fixture.mjs';
import {tm} from './word-docs.mjs';

const SNAP = JSON.parse(readFileSync(new URL('./draft-layout.json',
  import.meta.url), 'utf8'));
const docs = {};
const ONE = ['plain', 'lists', 'borders', 'breaks', 'pictures',
  'tables', 'twosect'];
const PORTRAIT = (11906 - 2880) / 15, LAND = (16838 - 2880) / 15;

before(async () => {
  for (const [name, bytes] of draftDocs()) {
    docs[name] = await readDocx(await bytes);
  }
});

const laid = (doc, w = VIEW_W, prev) => {
  const L = new DocLayout(doc, prev ? prev.metrics : tm(), prev);
  L.layout(w);
  return L;
};

/** Each root item's section index, from the model. */
function sections(doc) {
  const out = [];
  doc.sections.forEach((s, i) => s.blocks.forEach(() => out.push(i)));
  return out;
}

describe('draft layout: one page geometry as before P1.3', () => {
  for (const name of ONE) {
    it(`${name}: items, carets and hits`, () => {
      assert.deepEqual(sample(laid(docs[name])), SNAP[name]);
    });
  }
  it('the snapshot covers the eight documents', () => {
    assert.deepEqual(Object.keys(SNAP), draftDocs().map((d) => d[0]));
  });
  it('a layout made from an older one (lines kept) gives the same',
    () => {
      for (const name of ONE) {
        const L = laid(docs[name], VIEW_W, laid(docs[name], 700));
        assert.deepEqual(sample(L), SNAP[name], name);
      }
    });
});

describe('draft layout: each section at its own width', () => {
  it('every root item carries its section index (it.s)', () => {
    for (const name of Object.keys(SNAP)) {
      const L = laid(docs[name]);
      assert.deepEqual(L.items.map((x) => x.s), sections(docs[name]),
        name);
    }
  });
  it('landscape: the first section as before, the second wider', () => {
    const L = laid(docs.landscape);
    const snap = SNAP.landscape.items;
    const got = sample(L).items;
    assert.deepEqual(got.slice(0, 2), snap.slice(0, 2));
    for (const k of [2, 3]) {
      const x = L.items[k];
      assert.equal(x.s, 1);
      assert.ok(Math.abs(x.w - LAND) < 1e-9, `w ${x.w}`);
      assert.equal(x.x, L.left);
    }
    // (re-broken at the wider width: fewer lines, less high)
    assert.ok(L.items[2].h < snap[2].h, `${L.items[2].h}`);
    // (the page's own fields stay the first section's)
    assert.ok(Math.abs(L.textW - PORTRAIT) < 1e-9);
    assert.equal(L.root.w, L.textW);
  });
  it('L.geom(s): the section\'s px geometry, once per section', () => {
    const L = laid(docs.landscape);
    const g0 = L.geom(0), g1 = L.geom(1);
    assert.equal(L.geom(0), g0);
    assert.equal(L.geom(1), g1);
    assert.ok(g1.size.w > g1.size.h);
    assert.ok(g0.size.w < g0.size.h);
    const secs = docs.landscape.sections;
    assert.deepEqual(g1, pxOf(geomOf(secs[1], {gutterAtTop: false},
      secs[0])));
    assert.ok(Math.abs(L.pageH - g0.size.h) < 1e-9);
    assert.equal(L.textW, g0.textW);
    assert.equal(L.geom(5), null);
    assert.equal(L.geom(-1), null);
  });
  it('a later layout of the same document: lines kept by width', () => {
    const a = laid(docs.landscape);
    const b = laid(docs.landscape, VIEW_W, a);
    b.items.forEach((x, k) => assert.equal(x.lines, a.items[k].lines));
  });
  it('a table in a landscape section takes the landscape width',
    async () => {
      const MAR = '<w:pgMar w:top="1440" w:right="1440" ' +
        'w:bottom="1440" w:left="1440"/>';
      const body = p(r('portrait'), '<w:sectPr><w:pgSz w:w="11906" ' +
        `w:h="16838"/>${MAR}</w:sectPr>`) +
        tbl([tr([tc(p(r('a'))), tc(p(r('b')))])], {tblPr:
          '<w:tblW w:w="5000" w:type="pct"/>', grid: [100, 100]}) +
        p(r('after')) + '<w:sectPr><w:pgSz w:w="16838" w:h="11906" ' +
        `w:orient="landscape"/>${MAR}</w:sectPr>`;
      const doc = await readDocx(await buildDocx({'word/document.xml':
        documentXml(body)}));
      const L = laid(doc);
      const t = L.items[1];
      assert.equal(t.kind, 'tbl');
      assert.equal(t.s, 1);
      assert.ok(Math.abs(t.w - LAND) < 1e-9);
      assert.ok(t.width > PORTRAIT + 1, `width ${t.width}`);
    });
  it('a two-column section: its items as wide as its first column',
    async () => {
      const body = p(r('one ' + 'word '.repeat(40))) +
        '<w:sectPr><w:cols w:num="2" w:space="720"/></w:sectPr>';
      const doc = await readDocx(await buildDocx({'word/document.xml':
        documentXml(body)}));
      const L = laid(doc);
      const w = (9026 - 720) / 2 / 15;
      assert.ok(Math.abs(L.items[0].w - w) < 1e-9);
      assert.ok(Math.abs(L.textW - PORTRAIT) < 1e-9);
    });
});

describe('draft layout: the page and extent hold every section',
  () => {
    // (P1 fix C1: a wider later section was drawn off the white page
    // and past the extent, where it could not be scrolled to)
    const holds = (name, L, vw) => {
      const ext = L.layout(vw);
      const p = pageRect(L);
      for (const x of L.items) {
        const right = x.kind === 'tbl'
          ? Math.max(x.x + x.w, x.x + x.left + x.width)
          : x.x + x.w;
        const at = `${name} @${vw} item ${x.id}`;
        assert.ok(x.x >= p.x, `${at}: x ${x.x} < page ${p.x}`);
        assert.ok(x.x + x.w <= p.x + p.w + 1e-9,
          `${at}: right ${x.x + x.w} > page ${p.x + p.w}`);
        assert.ok(right <= ext.w - MARGIN + 1e-9,
          `${at}: right ${right} > extent ${ext.w}`);
      }
    };
    it('every document at view widths 800 and 1000', () => {
      for (const name of Object.keys(SNAP)) {
        for (const vw of [800, VIEW_W]) holds(name, laid(docs[name]),
          vw);
      }
    });
    it('landscape at 800: the page as wide as the landscape page',
      () => {
        const L = laid(docs.landscape, 800);
        const p = pageRect(L);
        const g1 = L.geom(1);
        assert.ok(p.w >= Math.round(g1.size.w), `page w ${p.w}`);
        assert.ok(L.wide >= LAND - 1e-9, `wide ${L.wide}`);
      });
    it('one geometry: page and extent as before', () => {
      for (const name of ONE) {
        const L = laid(docs[name], 800);
        const g = L.geom(0);
        assert.equal(pageRect(L).w, Math.round(Math.max(g.size.w,
          g.mar.left + g.textW)), name);
      }
    });
  });
