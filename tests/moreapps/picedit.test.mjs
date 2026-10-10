// PicEdit and PicSize (Batch B, B3.1): copies of a picture's node
// with a new size, alt text, docPr ids or r:embed (only those
// attributes change; everything else, attribute order included, is
// kept and shared); the drag size rules.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {withSize, withDescr, withDocPrIds, withEmbed}
  from '../../tools/moreapps/!Word/PicEdit';
import {dragSize, pxToEmu, MIN_EMU, MAX_EMU}
  from '../../tools/moreapps/!Word/PicSize';
import {pictureOf, PIC_SCOPE, docMap}
  from '../../tools/moreapps/!Word/PicRead';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {parseXml, serialize} from '../../tools/moreapps/!WimpLib/Xml';
import {drawingXml, picDocx} from './pic-fixtures.mjs';

const node = (xml) => parseXml(xml).root;
const M = PIC_SCOPE;
const kid = (n, name) => n.children.find((c) => c.name === name);
/** The element at a path of names below n. */
const dig = (n, ...names) => names.reduce((x, s) => x && kid(x, s), n);
const attrs = (n) => n.attrs.map(([k]) => k);
const EXT_LST = '<a:extLst><a:ext uri="{28A0092B-C50C-407E-A947-' +
  '70E740481C1C}"><a14:useLocalDpi xmlns:a14="http://schemas.' +
  'microsoft.com/office/drawing/2010/main" val="0"/></a:ext>' +
  '</a:extLst>';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const WP14 = 'http://schemas.microsoft.com/office/word/2010/' +
  'wordprocessingDrawing';

/** A picture with extLst in its blip and spPr, unknown attributes. */
function busy(opts = {}) {
  return drawingXml(opts)
    .replace('<w:drawing>', `<w:drawing xmlns:mc="${MC}" ` +
      'mc:Ignorable="wp14">')
    .replace(/<wp:(inline|anchor) distT="0"/, '<wp:$1 distT="0" ' +
      `wp14:anchorId="1A2B3C4D" xmlns:wp14="${WP14}"`)
    .replace(/<a:blip ([^/]*)\/>/, '<a:blip $1>' + EXT_LST + '</a:blip>')
    .replace('</a:prstGeom>', '</a:prstGeom>' + EXT_LST);
}

describe('PicEdit', () => {
  it('withSize: the four attributes and nothing else', () => {
    const n = node(busy());
    const before = structuredClone(n);
    const m = withSize(n, M, 1905000, 952500);
    assert.notEqual(m, n);
    const want = serialize(n).replaceAll('cx="914400" cy="457200"',
      'cx="1905000" cy="952500"');
    assert.notEqual(want, serialize(n));
    assert.equal(serialize(m), want);
    assert.deepEqual(n, before, 'old node never changed');
    const x = pictureOf(m, M);
    assert.equal(x.cx, 1905000);
    assert.equal(x.cy, 952500);
  });

  it('picedit extLst untouched', () => {
    const n = node(busy());
    const m = withSize(n, M, 95250, 95250);
    const blip = (k) => dig(k, 'wp:inline', 'a:graphic',
      'a:graphicData', 'pic:pic', 'pic:blipFill', 'a:blip');
    const spPr = (k) => dig(k, 'wp:inline', 'a:graphic',
      'a:graphicData', 'pic:pic', 'pic:spPr');
    assert.equal(blip(m), blip(n), 'blip and its extLst shared');
    assert.equal(kid(spPr(m), 'a:extLst'), kid(spPr(n), 'a:extLst'));
    assert.deepEqual(kid(kid(spPr(m), 'a:extLst'), 'a:ext').attrs,
      [['uri', '{28A0092B-C50C-407E-A947-70E740481C1C}']]);
    const eff = (k) => dig(k, 'wp:inline', 'wp:effectExtent');
    assert.equal(eff(m), eff(n));
    assert.deepEqual(eff(m).attrs, [['l', '0'], ['t', '0'], ['r', '0'],
      ['b', '0']]);
  });

  it('attribute order and unknown attributes kept', () => {
    const n = node(busy());
    const m = withSize(n, M, 19050, 28575);
    assert.deepEqual(m.attrs, n.attrs, 'mc:Ignorable kept');
    const inl = (k) => kid(k, 'wp:inline');
    assert.deepEqual(attrs(inl(m)), attrs(inl(n)));
    assert.ok(attrs(inl(m)).includes('wp14:anchorId'));
    const ext = dig(m, 'wp:inline', 'wp:extent');
    assert.deepEqual(ext.attrs, [['cx', '19050'], ['cy', '28575']]);
    const ax = dig(m, 'wp:inline', 'a:graphic', 'a:graphicData',
      'pic:pic', 'pic:spPr', 'a:xfrm', 'a:ext');
    assert.deepEqual(ax.attrs, [['cx', '19050'], ['cy', '28575']]);
  });

  it('untouched subtrees are the old ones; same node for no change',
    () => {
      const n = node(busy());
      const m = withSize(n, M, 100, 200);
      const inl = (k) => kid(k, 'wp:inline');
      assert.equal(kid(inl(m), 'wp:docPr'), kid(inl(n), 'wp:docPr'));
      assert.equal(kid(inl(m), 'wp:cNvGraphicFramePr'),
        kid(inl(n), 'wp:cNvGraphicFramePr'));
      const pic = (k) => dig(k, 'wp:inline', 'a:graphic',
        'a:graphicData', 'pic:pic');
      assert.equal(kid(pic(m), 'pic:nvPicPr'), kid(pic(n), 'pic:nvPicPr'));
      assert.equal(withSize(n, M, 914400, 457200), n);
      assert.equal(withDescr(n, M, ''), n);
      assert.equal(withEmbed(n, M, 'rId5'), n);
    });

  it('withSize on a floating picture and with prefixes of its own',
    () => {
      const a = node(drawingXml({kind: 'anchor'}));
      const m = withSize(a, M, 9525, 19050);
      assert.equal(pictureOf(m, M).cx, 9525);
      const q = node(drawingXml({wp: 'wpd', picDefault: true}));
      const k = withSize(q, M, 9525, 19050);
      assert.equal(pictureOf(k, M).cy, 19050);
      assert.match(serialize(k), /<a:ext cx="9525" cy="19050"\/>/);
    });

  it('withSize: not a picture or a bad size', () => {
    const v = node('<w:pict><v:shape xmlns:v="urn:v"/></w:pict>');
    assert.equal(withSize(v, M, 9525, 9525), v);
    const n = node(drawingXml());
    assert.throws(() => withSize(n, M, 0, 9525), RangeError);
    assert.throws(() => withSize(n, M, 12.5, 9525), RangeError);
    assert.throws(() => withSize(n, M, 9525, 2147483648), RangeError);
  });

  it('withSize without a:xfrm: the extent only', () => {
    const n = node(drawingXml({xfrm: false}));
    const m = withSize(n, M, 9525, 9525);
    assert.equal(pictureOf(m, M).cx, 9525);
  });

  it('withDescr: appended last, replaced in place, removed', () => {
    const n = node(drawingXml({id: 3}));
    const doc = (k) => dig(k, 'wp:inline', 'wp:docPr');
    const a = withDescr(n, M, 'A cat & "dog"');
    assert.deepEqual(doc(a).attrs, [['id', '3'], ['name', 'Picture 3'],
      ['descr', 'A cat & "dog"']]);
    assert.equal(pictureOf(a, M).alt, 'A cat & "dog"');
    const t = node(drawingXml({id: 3, descr: 'old'})
      .replace('descr="old"', 'descr="old" title="T"'));
    const b = withDescr(t, M, 'new');
    assert.deepEqual(doc(b).attrs, [['id', '3'], ['name', 'Picture 3'],
      ['descr', 'new'], ['title', 'T']]);
    const c = withDescr(t, M, '');
    assert.deepEqual(doc(c).attrs, [['id', '3'], ['name', 'Picture 3'],
      ['title', 'T']]);
    assert.equal(pictureOf(c, M).alt, '');
    const f = withDescr(node(drawingXml({kind: 'anchor'})), M, 'x');
    assert.equal(pictureOf(f, M).alt, 'x');
  });

  it('withDocPrIds: one old id, one new id, at any depth', () => {
    const d = (id) => drawingXml({id});
    const n = node(`<mc:AlternateContent xmlns:mc="${MC}">` +
      `<mc:Choice Requires="wps">${d(5)}</mc:Choice>` +
      `<mc:Fallback>${d(5)}${d(9)}</mc:Fallback>` +
      '</mc:AlternateContent>');
    const before = structuredClone(n);
    let k = 100;
    const calls = [];
    const m = withDocPrIds(n, M, () => (calls.push(k), k++));
    assert.deepEqual(calls, [100, 101]);
    const ids = [...serialize(m).matchAll(/<wp:docPr id="(\d+)"/g)]
      .map((x) => x[1]);
    assert.deepEqual(ids, ['100', '100', '101']);
    assert.deepEqual(n, before);
    assert.equal(serialize(m), serialize(n)
      .replaceAll('docPr id="5"', 'docPr id="100"')
      .replace('docPr id="9"', 'docPr id="101"'));
    const plain = node('<w:r><w:t>x</w:t></w:r>');
    assert.equal(withDocPrIds(plain, M, () => 1), plain);
  });

  it('withEmbed: the blip only', () => {
    const n = node(busy());
    const m = withEmbed(n, M, 'rId77');
    assert.equal(pictureOf(m, M).embed, 'rId77');
    assert.equal(serialize(m), serialize(n)
      .replace('r:embed="rId5"', 'r:embed="rId77"'));
    const fill = (k) => dig(k, 'wp:inline', 'a:graphic',
      'a:graphicData', 'pic:pic', 'pic:blipFill');
    assert.equal(kid(fill(m), 'a:stretch'), kid(fill(n), 'a:stretch'));
  });

  it('a Strict document: read and edited by URI', async () => {
    const doc = await readDocx(await picDocx({strict: true,
      pics: [{cx: 9525, cy: 9525}]}));
    const map = docMap(doc);
    const x = doc.sections[0].blocks[0].inlines[0];
    const m = withSize(x.node, map, 19050, 28575);
    const info = pictureOf(m, map);
    assert.equal(info.cx, 19050);
    assert.equal(info.cy, 28575);
  });
});

describe('PicSize', () => {
  it('constants and pxToEmu', () => {
    assert.equal(MIN_EMU, 9525);
    assert.equal(MAX_EMU, 20116800);
    assert.equal(pxToEmu(1), 9525);
    assert.equal(pxToEmu(100.5), 957263);
  });

  it('edges change one side', () => {
    const s = {w: 200, h: 100};
    assert.deepEqual(dragSize(s, 'e', 50, 30), {w: 250, h: 100});
    assert.deepEqual(dragSize(s, 'w', 50, 30), {w: 150, h: 100});
    assert.deepEqual(dragSize(s, 's', 50, 30), {w: 200, h: 130});
    assert.deepEqual(dragSize(s, 'n', 50, 30), {w: 200, h: 70});
  });

  it('corners keep the aspect ratio unless free', () => {
    const s = {w: 200, h: 100};
    const a = dragSize(s, 'se', 100, 50);
    assert.deepEqual(a, {w: 300, h: 150});
    const b = dragSize(s, 'nw', 100, 0);
    assert.ok(Math.abs(b.w / b.h - 2) < 1e-9);
    assert.ok(b.w < 200);
    const c = dragSize(s, 'ne', 40, -10);
    assert.ok(Math.abs(c.w / c.h - 2) < 1e-9);
    assert.ok(c.w > 200);
    assert.deepEqual(dragSize(s, 'sw', 30, 20, {free: true}),
      {w: 170, h: 120});
    assert.deepEqual(dragSize(s, 'se', 0, 0), {w: 200, h: 100});
  });

  it('corners: the larger relative change leads (the corner on the '
    + 'pointer along that axis)', () => {
    const s = {w: 200, h: 100};
    assert.deepEqual(dragSize(s, 'se', 50, 50), {w: 300, h: 150});
    assert.deepEqual(dragSize(s, 'se', 100, 10), {w: 300, h: 150});
    assert.deepEqual(dragSize(s, 'nw', 100, 0), {w: 100, h: 50});
    assert.deepEqual(dragSize(s, 'ne', 40, -10), {w: 240, h: 120});
    assert.deepEqual(dragSize(s, 'se', -50, 30), {w: 260, h: 130});
    assert.deepEqual(dragSize(s, 'sw', 20, 0), {w: 180, h: 90});
  });

  it('at least 1 px; nonsense handled', () => {
    const s = {w: 200, h: 100};
    assert.deepEqual(dragSize(s, 'e', -500, 0), {w: 1, h: 100});
    assert.deepEqual(dragSize(s, 'n', 0, 500), {w: 200, h: 1});
    const c = dragSize(s, 'se', -1000, -1000);
    assert.ok(c.w >= 1 && c.h >= 1);
    assert.ok(Math.abs(c.w / c.h - 2) < 1e-9);
    assert.deepEqual(dragSize(s, 'x', 5, 5), s);
    assert.deepEqual(dragSize(s, 'e', NaN, 5), s);
  });
});
