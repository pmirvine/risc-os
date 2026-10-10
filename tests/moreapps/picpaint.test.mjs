// PicPaint (Batch B, B2.2): a picture item drawn on a fake 2D context
// that records its calls: the bitmap when the cache has it, else a
// labelled box; a floating picture outlined dashed; nothing decoded
// that PicMedia's decodable refuses.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {docMap, pictureOf, EMU_PX}
  from '../../tools/moreapps/!Word/PicRead';
import {paintPic, LABEL} from '../../tools/moreapps/!Word/PicPaint';
import {paint} from '../../tools/moreapps/!Word/DocPaint';
import {DocLayout} from '../../tools/moreapps/!Word/DocLayout';
import {TextMetrics} from '../../tools/moreapps/!WimpLib/TextMetrics';
import {picDocx, pngBytes, gifBytes} from './pic-fixtures.mjs';

/** A fake 2D context: every call and property set, in order. */
function fakeG() {
  const calls = [];
  const rec = (name) => (...a) => { calls.push([name, ...a]); };
  const g = {calls};
  for (const k of ['drawImage', 'strokeRect', 'fillRect', 'fillText',
    'setLineDash', 'save', 'restore', 'beginPath', 'rect', 'clip',
    'measureText']) g[k] = rec(k);
  g.measureText = (t) => ({width: 6 * t.length});
  for (const k of ['strokeStyle', 'fillStyle', 'font', 'lineWidth']) {
    let v;
    Object.defineProperty(g, k, {get: () => v,
      set: (x) => { v = x; calls.push(['set ' + k, x]); }});
  }
  return g;
}
const named = (g, n) => g.calls.filter((c) => c[0] === n);

/** A fake cache view: always answers `answer`, records gets. */
function fakePics(answer) {
  const gets = [];
  return {gets, get: (bytes, mime, info, want) => {
    gets.push({bytes, mime, info, want});
    return answer;
  }};
}

/**
 * The doc of picDocx(opts) and its first picture's item; part: bytes
 * put in place of the media part after reading (a 50 MB part is
 * refused by the package reader's ratio check).
 */
async function picItem(opts, part) {
  const doc = await readDocx(await picDocx(opts));
  if (part) doc.parts.set('word/media/image1.png', part);
  const map = docMap(doc);
  const b = doc.sections[0].blocks[0];
  const x = Object.values(b.inlines).find((i) => i.kind === 'raw');
  const info = pictureOf(x.node, map);
  const w = info.cx / EMU_PX, h = info.cy / EMU_PX;
  return {doc, item: {kind: 'pic', text: '', x: 0, w,
    pic: {...info, w, h}}};
}

describe('PicPaint', () => {
  it('ready draws the bitmap', async () => {
    const {doc, item} = await picItem({pics: [{cx: 1905000,
      cy: 952500, srcRect: {l: 10000}}]});
    const bm = {width: 40, height: 20};
    const pics = fakePics({state: 'ready', bitmap: bm});
    const g = fakeG();
    paintPic({doc, pics}, g, item, 30, 300);
    const d = named(g, 'drawImage');
    assert.equal(d.length, 1);
    assert.deepEqual(d[0], ['drawImage', bm, 0.1 * 40, 0, 0.9 * 40, 20,
      30, 200, 200, 100]);
    assert.equal(pics.gets.length, 1);
    assert.equal(pics.gets[0].mime, 'image/png');
    assert.deepEqual([pics.gets[0].info.w, pics.gets[0].info.h], [4, 2]);
    assert.equal(named(g, 'setLineDash').length, 0);
  });

  it('srcRect: negative edges as 0', async () => {
    const {doc, item} = await picItem({pics: [{srcRect: {l: -5000,
      t: 25000, r: 0, b: -20000}}]});
    const bm = {width: 100, height: 80};
    const g = fakeG();
    paintPic({doc, pics: fakePics({state: 'ready', bitmap: bm})}, g,
      item, 0, 100);
    const d = named(g, 'drawImage')[0];
    assert.deepEqual(d.slice(2, 6), [0, 20, 100, 60]);
  });

  it('a srcRect leaving no width or height: drawn uncropped', async () => {
    for (const srcRect of [{l: -50000, r: 100000}, {t: -50000,
      b: 100000}]) {
      const {doc, item} = await picItem({pics: [{srcRect}]});
      assert.ok(item.pic.srcRect, 'PicRead accepts it');
      const bm = {width: 100, height: 80};
      const g = fakeG();
      paintPic({doc, pics: fakePics({state: 'ready', bitmap: bm})}, g,
        item, 0, 100);
      assert.deepEqual(named(g, 'drawImage')[0].slice(2, 6),
        [0, 0, 100, 80]);
    }
  });

  it('asks for the size it is shown at (zoom, pixel ratio)', async () => {
    const {doc, item} = await picItem({pics: [{cx: 1905000,
      cy: 952500, srcRect: {l: 50000}}]});
    const pics = fakePics({state: 'pending'});
    const g = fakeG();
    g.getTransform = () => ({a: 3, b: 0, c: 0, d: 3});
    paintPic({doc, pics}, g, item, 0, 200);
    // 200 x 100 shown, half the source: 400 wide in all, x 3
    assert.equal(pics.gets[0].want, 1200);
    const g1 = fakeG();
    paintPic({doc, pics}, g1, item, 0, 200);
    assert.equal(pics.gets[1].want, 400, 'no transform: 1');
  });

  it('deferred (no room yet): a label, not a blank box', async () => {
    const {doc, item} = await picItem({});
    const g = fakeG();
    paintPic({doc, pics: fakePics({state: 'deferred'})}, g, item, 0, 50);
    assert.equal(named(g, 'fillText')[0][1], LABEL.waiting);
    assert.equal(LABEL.waiting, 'Loading picture...');
    const a = await picItem({pics: [{descr: 'Alt'}]});
    const g2 = fakeG();
    paintPic({doc: a.doc, pics: fakePics({state: 'deferred'})}, g2,
      a.item, 0, 50);
    assert.equal(named(g2, 'fillText')[0][1], 'Alt');
  });

  it('missing label', async () => {
    const {doc, item} = await picItem({pics: [{bytes: null}]});
    const pics = fakePics({state: 'ready', bitmap: {}});
    const g = fakeG();
    paintPic({doc, pics}, g, item, 10, 200);
    assert.equal(pics.gets.length, 0);
    assert.equal(named(g, 'drawImage').length, 0);
    const t = named(g, 'fillText');
    assert.equal(t.length, 1);
    assert.equal(t[0][1], LABEL.missing);
    assert.equal(LABEL.missing, 'Picture missing');
    const box = named(g, 'strokeRect');
    assert.equal(box.length, 1);
    assert.ok(g.calls.some((c) => c[0] === 'set strokeStyle' &&
      c[1] === '#a0a0a0'));
    assert.ok(g.calls.some((c) => c[0] === 'set font' &&
      /11px/.test(c[1]) && /sans-serif/.test(c[1])));
    assert.equal(named(g, 'clip').length, 1, 'label clipped to box');
  });

  it('unsupported EMF label', async () => {
    const {doc, item} = await picItem({pics: [{ext: 'emf',
      bytes: new Uint8Array([1, 0, 0, 0, 0x6c, 0, 0, 0, 0, 0])}]});
    const pics = fakePics({state: 'pending'});
    const g = fakeG();
    paintPic({doc, pics}, g, item, 10, 200);
    assert.equal(pics.gets.length, 0);
    assert.equal(named(g, 'fillText')[0][1], 'Picture not shown: EMF');
  });

  it('too large label, get never called', async () => {
    const huge = new Uint8Array(50 * 1048576);
    huge.set(pngBytes(4, 2));
    for (const bytes of [huge, pngBytes(100000, 100000),
      gifBytes(10, 10, {frameW: 20000, frameH: 10})]) {
      const {doc, item} = await picItem({}, bytes);
      const pics = fakePics({state: 'pending'});
      const g = fakeG();
      paintPic({doc, pics}, g, item, 10, 200);
      assert.equal(pics.gets.length, 0, 'piccache never decodes over ' +
        'caps');
      assert.equal(named(g, 'fillText')[0][1],
        'Picture too large to show');
    }
  });

  it('a broken PNG header: not shown, no decode', async () => {
    const b = pngBytes(4, 2);
    b[12] = 0x58;                       // IHDR -> XHDR
    const {doc, item} = await picItem({pics: [{bytes: b}]});
    const pics = fakePics({state: 'pending'});
    const g = fakeG();
    paintPic({doc, pics}, g, item, 10, 200);
    assert.equal(pics.gets.length, 0);
    assert.equal(named(g, 'fillText')[0][1], 'Picture not shown: PNG');
  });

  it('floating dashed', async () => {
    const {doc, item} = await picItem({pics: [{kind: 'anchor'}]});
    for (const answer of [{state: 'ready', bitmap: {width: 4,
      height: 2}}, {state: 'pending'}]) {
      const g = fakeG();
      paintPic({doc, pics: fakePics(answer)}, g, item, 10, 200);
      const dash = named(g, 'setLineDash');
      assert.deepEqual(dash.map((c) => c[1]), [[4, 3], []]);
      assert.ok(g.calls.some((c) => c[0] === 'set strokeStyle' &&
        c[1] === '#606060'));
    }
  });

  it('alt text in the box while loading', async () => {
    const {doc, item} = await picItem({pics: [{descr: 'A red box'}]});
    const g = fakeG();
    paintPic({doc, pics: fakePics({state: 'pending'})}, g, item, 10,
      200);
    assert.equal(named(g, 'drawImage').length, 0);
    const t = named(g, 'fillText');
    assert.equal(t[0][1], 'A red box');
    const r = named(g, 'rect')[0];
    // the clip is the box: {left, base - h, w, h}
    assert.deepEqual(r.slice(1), [10, 200 - item.pic.h, item.pic.w,
      item.pic.h]);
  });

  it('loading with no alt text: an empty box', async () => {
    const {doc, item} = await picItem({});
    const g = fakeG();
    paintPic({doc, pics: fakePics({state: 'pending'})}, g, item, 0, 50);
    assert.equal(named(g, 'fillText').length, 0);
    assert.equal(named(g, 'strokeRect').length, 1);
    assert.equal(LABEL.loading, '');
  });

  it('a failed decode: not shown, with its type', async () => {
    const {doc, item} = await picItem({});
    const g = fakeG();
    paintPic({doc, pics: fakePics({state: 'failed'})}, g, item, 0, 50);
    assert.equal(named(g, 'fillText')[0][1], 'Picture not shown: PNG');
  });

  it('no cache (L.pics absent): a box, nothing decoded', async () => {
    const {doc, item} = await picItem({});
    const g = fakeG();
    paintPic({doc}, g, item, 0, 50);
    assert.equal(named(g, 'drawImage').length, 0);
    assert.equal(named(g, 'strokeRect').length, 1);
  });

  it('DocPaint paints a pic item through PicPaint', async () => {
    const doc = await readDocx(await picDocx({pics: [{cx: 1905000,
      cy: 952500}]}));
    const pics = fakePics({state: 'ready', bitmap: {width: 4,
      height: 2}});
    const L = new DocLayout(doc, new TextMetrics((t) => 8 * t.length),
      null, {pics});
    L.layout(900);
    assert.equal(L.pics, pics);
    const L2 = new DocLayout(doc, L.metrics, L);
    assert.equal(L2.pics, pics, 'inherited from prev');
    const g = fakeG();
    paint(L, g, {x0: 0, y0: 0, x1: 2000, y1: 4000});
    const d = named(g, 'drawImage');
    assert.equal(d.length, 1);
    const ln = L.items[0].lines[0];
    const it = ln.items.find((x) => x.kind === 'pic');
    const base = L.items[0].y + ln.y + ln.base;
    assert.deepEqual(d[0].slice(6), [L.left + it.x, base - 100, 200,
      100]);
  });
});
