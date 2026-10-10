// PicLine and LineLayout (Batch B, B2.1): a picture is one token and
// one line item of kind 'pic', as wide as its extent (fitted to the
// column, plan R3), standing on the baseline and raising its line.
// Measured with a fake: 8 px per UTF-16 unit.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readDocx, DocxError} from '../../tools/moreapps/!Word/DocxRead';
import {layoutPara} from '../../tools/moreapps/!Word/LineLayout';
import {tokens} from '../../tools/moreapps/!Word/LineTokens';
import {picToken, fitPic} from '../../tools/moreapps/!Word/PicLine';
import {docMap, pictureOf, EMU_PX}
  from '../../tools/moreapps/!Word/PicRead';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {TextMetrics} from '../../tools/moreapps/!WimpLib/TextMetrics';
import {picDocx, pngBytes} from './pic-fixtures.mjs';
import {nopicDocx, plain, WIDTH} from './nopic-fixture.mjs';
import {corpusFiles, SKIP_CORPUS} from './roundtrip-lib.mjs';

const O = '￼';
const tm = () => new TextMetrics((t) => 8 * t.length);
const PLAIN = {extra: []};
const W = 600;

let doc, styles, map;
/** The raw inline of a picture cx x cy EMU (read from a .docx). */
const inl = {};
async function picInline(cx, cy) {
  const k = cx + 'x' + cy;
  if (!inl[k]) {
    const d = await readDocx(await picDocx({pics: [{cx, cy}]}));
    const b = d.sections[0].blocks[0];
    inl[k] = Object.values(b.inlines).find((x) => x.kind === 'raw');
  }
  return inl[k];
}

before(async () => {
  doc = await readDocx(await picDocx({pics: [{cx: 1905000,
    cy: 952500}]}));
  styles = doc.styles;
  map = docMap(doc);
});

function para(text, inlines = {}, pPr = {extra: []}) {
  return {type: 'p', id: 1, text, inlines, pPr, extraP: [],
    runs: text ? [{start: 0, end: text.length, rPr: PLAIN}] : []};
}
const lay = (pa, w = W, m = map) =>
  layoutPara(pa, styles, w, tm(), new Map(), undefined, 48, m);
const pics = (l) => l.lines.flatMap((ln) => ln.items
  .filter((i) => i.kind === 'pic'));
const emu = (px) => Math.round(px * EMU_PX);

describe('PicLine', () => {
  it('fitPic: as it is, fitted, capped, at least 1 px', () => {
    assert.deepEqual(fitPic({w: 200, h: 100}, 600), {w: 200, h: 100});
    assert.deepEqual(fitPic({w: 1200, h: 400}, 600), {w: 600, h: 200});
    const t = fitPic({w: 1, h: 2147483647 / EMU_PX}, 600);
    assert.equal(t.h, 2112);
    assert.ok(t.w >= 1);
    const f = fitPic({w: 2147483647 / EMU_PX, h: 1 / EMU_PX}, 600);
    assert.deepEqual(f, {w: 600, h: 1});
  });
  it('picToken: a picture is one shown token, else null', async () => {
    const x = await picInline(1905000, 952500);
    const tk = picToken(x, 3, {px: 10}, map);
    assert.deepEqual([tk.t, tk.text, tk.kind, tk.from, tk.to, tk.shown],
      ['w', '', 'pic', 3, 4, true]);
    assert.equal(tk.pic.info, pictureOf(x.node, map));
    assert.deepEqual([tk.pic.w, tk.pic.h], [200, 100]);
    assert.equal(picToken({kind: 'raw', level: 'r', node: {name: 'w:pict',
      attrs: [], children: []}}, 0, {}, map), null);
    assert.equal(picToken({kind: 'br'}, 0, {}, map), null);
  });
});

describe('pictures in the layout', () => {
  it('inline size', async () => {
    const pa = para(O, {0: await picInline(1905000, 952500)});
    const l = lay(pa);
    const [it] = pics(l), ln = l.lines[0];
    assert.deepEqual([it.w, it.pic.w, it.pic.h], [200, 200, 100]);
    assert.deepEqual([it.from, it.to, it.text, it.shown], [0, 1, '', true]);
    for (const k of ['embed', 'cx', 'cy', 'alt', 'floating',
      'supported', 'docPrId']) assert.ok(k in it.pic, k);
    const plain = lay(para('a')).lines[0];
    assert.ok(ln.base >= 100);
    assert.ok(Math.abs((ln.h - ln.base) - (plain.h - plain.base)) < 1e-9);
    assert.ok(Math.abs(l.h - ln.h - (lay(para('a')).h - plain.h)) < 1e-9);
  });
  it('bottom on baseline', async () => {
    const pa = para('ab' + O, {2: await picInline(1905000, 952500)});
    const ln = lay(pa).lines[0];
    const [it] = ln.items.filter((i) => i.kind === 'pic');
    assert.equal(it.dy, 0);
    assert.ok(Math.abs(ln.base - it.pic.h) < 1e-9, 'top at the line top');
    assert.ok(ln.base - it.pic.h >= 0);
  });
  it('fits the column', async () => {
    const pa = para(O, {0: await picInline(emu(1200), emu(300))});
    const [it] = pics(lay(pa));
    assert.ok(Math.abs(it.w - 600) < 1e-9);
    assert.ok(Math.abs(it.pic.h - 150) < 1e-6);
  });
  it('fits what the first line leaves (first-line indent)', async () => {
    const pPr = {extra: [], ind: {firstLine: 720}};
    const pa = para(O, {0: await picInline(emu(1200), emu(300))}, pPr);
    const l = lay(pa);
    const [it] = pics(l);
    assert.equal(it.x, 48);
    assert.ok(Math.abs(it.w - 552) < 1e-9, String(it.w));
    assert.ok(it.x + it.w <= W + 1e-9, 'within the right margin');
    // after a word it wraps to a line of the full column
    const pb = para('a ' + O, {2: await picInline(emu(1200),
      emu(300))}, pPr);
    const [jt] = pics(lay(pb));
    assert.ok(Math.abs(jt.w - 600) < 1e-9, String(jt.w));
  });
  it('picline caps', async () => {
    const t = pics(lay(para(O, {0: await picInline(9525,
      2147483647)})))[0];
    assert.equal(t.pic.h, 2112);
    assert.ok(t.w >= 1);
    const ln = lay(para(O, {0: await picInline(9525, 2147483647)}))
      .lines[0];
    assert.ok(ln.h < 2200, 'never a 225,000 px line');
    const f = pics(lay(para(O, {0: await picInline(2147483647, 1)})))[0];
    assert.deepEqual([f.w, f.pic.h], [W, 1]);
  });
  it('exact spacing clips', async () => {
    const pa = para(O, {0: await picInline(1905000, 952500)},
      {spacing: {line: 240, lineRule: 'exact'}, extra: []});
    const ln = lay(pa).lines[0];
    assert.equal(ln.clip, true);
    assert.equal(ln.h, 16);
  });
  it('two on a line: the tallest decides', async () => {
    const a = await picInline(emu(50), emu(40));
    const b = await picInline(emu(50), emu(120));
    const ln = lay(para(O + ' ' + O, {0: a, 2: b})).lines[0];
    assert.equal(pics({lines: [ln]}).length, 2);
    assert.ok(Math.abs(ln.base - 120) < 1e-9);
    const ln2 = lay(para(O + ' ' + O, {0: b, 2: a})).lines[0];
    assert.ok(Math.abs(ln2.base - 120) < 1e-9);
  });
  it('wraps as a word', async () => {
    const x = await picInline(emu(300), emu(20));
    const l = lay(para('aaaa ' + O, {5: x}), 200);
    assert.equal(l.lines.length, 2);
    assert.equal(l.lines[0].wrapped, true);
    const [it] = l.lines[1].items;
    assert.deepEqual([it.kind, it.from, it.w], ['pic', 5, 200]);
  });
  it('B1: two 4 in pictures in adjacent runs wrap, not overflow',
    async () => {
      const x = await picInline(4 * 914400, 2 * 914400);
      const l = lay(para(O + O, {0: x, 1: x}), W);
      assert.equal(l.lines.length, 2);
      assert.deepEqual(l.lines.map((ln) => pics(ln && {lines: [ln]})
        .map((i) => [i.from, i.x, i.w])), [[[0, 0, 384]],
        [[1, 0, 384]]]);
      assert.equal(l.lines[0].wrapped, true);
    });
  it('B1: a word then a column-wide picture: the picture wraps',
    async () => {
      const x = await picInline(7 * 914400, 914400);
      const l = lay(para('abcdefghij' + O, {10: x}), W);
      assert.equal(l.lines.length, 2);
      for (const ln of l.lines) {
        for (const i of ln.items) assert.ok(i.x + i.w <= W + 1e-9, i);
      }
      const [it] = l.lines[1].items;
      assert.deepEqual([it.kind, it.from, it.x, it.w], ['pic', 10, 0,
        600]);
      const back = lay(para(O + 'abcdefghij', {0: x}), W);
      assert.equal(back.lines.length, 2, 'and a word after one');
      assert.deepEqual(back.lines[1].items.map((i) => [i.kind, i.x]),
        [['text', 0]]);
    });
  it('offsets', async () => {
    const pa = para('a' + O + 'b', {1: await picInline(1905000, 952500)});
    const ln = lay(pa).lines[0];
    assert.deepEqual(ln.items.map((i) => [i.kind, i.from, i.to, i.x,
      i.w]), [['text', 0, 1, 0, 8], ['pic', 1, 2, 8, 200],
      ['text', 2, 3, 208, 8]]);
    assert.deepEqual([ln.from, ln.to], [0, 3]);
  });
  it('unmodelled stays a box', async () => {
    const x = {kind: 'raw', level: 'r', node: {name: 'w:pict',
      attrs: [], children: []}};
    const it = lay(para('a' + O, {1: x})).lines[0].items[1];
    assert.deepEqual([it.kind, it.text], ['box', '[...]']);
    const tk = tokens(para('a' + O, {1: x}), styles, new Map(), map)[1];
    assert.equal(tk.kind, 'box');
  });
  it('a picture counts as ink: a page break after it', async () => {
    const pa = para(O + O, {0: await picInline(emu(80), emu(10)),
      1: {kind: 'br', level: 'r', brType: 'page'}});
    const its = lay(pa).lines[0].items;
    assert.deepEqual(its.map((i) => i.kind), ['pic', 'pagebreak']);
    assert.equal(its[1].x, 80);
  });
  it('DocLayout gives the document scope to its paragraphs', () => {
    const L = new DocLayout(doc, tm());
    L.layout(800);
    assert.equal(L.ns, map);
    const it = L.items[0];
    assert.equal(pics(it).length, 1);
    assert.equal(pics(it)[0].w, 200);
  });
  it('lines are kept only in the same scope (L.ns)', () => {
    const L = new DocLayout(doc, tm());
    L.layout(800);
    const L2 = new DocLayout(doc, L.metrics, L);
    L2.layout(800);
    assert.equal(L2.items[0].lines, L.items[0].lines);
    L2.ns = new Map();                 // (as if the root had changed)
    const L3 = new DocLayout(doc, L.metrics, L2);
    L3.layout(800);
    assert.notEqual(L3.items[0].lines, L2.items[0].lines);
  });
  it('a picture without its media is laid out all the same', async () => {
    const d = await readDocx(await picDocx({pics: [{cx: 952500,
      cy: 952500, bytes: null}, {bytes: pngBytes(2, 2)}]}));
    const L = new DocLayout(d, tm());
    L.layout(800);
    assert.deepEqual(L.items.map((it) => pics(it)[0].w), [100, 96]);
  });
});

describe('no pictures, same lines', () => {
  // nopic-lines.json: these paragraphs as the pre-batch LineLayout
  // (e7c33d7) laid them out (nopic-fixture.mjs makes it again)
  it('as LineLayout laid them out before Batch B', async () => {
    const want = JSON.parse(readFileSync(new URL('./nopic-lines.json',
      import.meta.url), 'utf8'));
    const d = await readDocx(await nopicDocx());
    const bs = d.sections[0].blocks;
    assert.equal(bs.length, want.length);
    bs.forEach((b, i) => {
      // the last holds a drawing: laid out where nothing is a picture
      const m = i === bs.length - 1 ? new Map() : docMap(d);
      const got = plain(layoutPara(b, d.styles, WIDTH, tm(), new Map(),
        undefined, 48, m));
      assert.deepEqual(got, want[i], 'paragraph ' + i);
    });
  });
});

const files = corpusFiles().slice(0, 25);
describe('without pictures the scope does not matter', {skip:
  files.length ? false : SKIP_CORPUS}, () => {
  // before: a scope in which nothing is a picture (the layout as it
  // was, every drawing a box); after: the document's own
  it('a corpus sample laid out before and after', async () => {
    const none = new Map();
    let n = 0;
    for (const f of files) {
      let d;
      try {
        d = await readDocx(readFileSync(f));
      } catch (e) {
        if (e instanceof DocxError) continue;
        throw e;
      }
      const m = docMap(d);
      for (const s of d.sections) {
        for (const b of s.blocks) {
          if (!b.inlines) continue;
          const has = Object.values(b.inlines).some((x) =>
            x && x.kind === 'raw' && pictureOf(x.node, m));
          if (has) continue;
          const a = layoutPara(b, d.styles, 500, tm(), new Map(),
            undefined, 48, none);
          const z = layoutPara(b, d.styles, 500, tm(), new Map(),
            undefined, 48, m);
          const old = layoutPara(b, d.styles, 500, tm(), new Map());
          assert.deepEqual(z, a);
          assert.deepEqual(old, a);
          n++;
        }
      }
    }
    assert.ok(n > 0);
  });
});
