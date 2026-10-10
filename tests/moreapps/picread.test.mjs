// PicRead: what a picture's w:drawing says (Batch B, B1.1).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {pictureOf, docMap, PIC_SCOPE, EMU_PX, MAX_EXT}
  from '../../tools/moreapps/!Word/PicRead';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {drawingXml, picDocx, URIS} from './pic-fixtures.mjs';

const node = (xml) => parseXml(xml).root;
const pic = (opts, map) => pictureOf(node(drawingXml(opts)), map);
const W_NS =
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

describe('PicRead', () => {
  it('constants', () => {
    assert.equal(EMU_PX, 9525);
    assert.equal(MAX_EXT, 2147483647);
    for (const k of ['w', 'wp', 'a', 'pic', 'r']) {
      assert.ok(PIC_SCOPE.get(k), k);
    }
    assert.equal(PIC_SCOPE.get('wp'), URIS.wp);
  });

  it('inline picture', () => {
    assert.deepEqual(pic({cx: 914400, cy: 457200, embed: 'rId5',
      id: 7, descr: 'A cat'}), {embed: 'rId5', cx: 914400, cy: 457200,
      alt: 'A cat', name: 'Picture 7', docPrId: 7, floating: false,
      supported: true});
  });

  it('anchor picture', () => {
    const x = pic({kind: 'anchor', id: 3});
    assert.equal(x.floating, true);
    assert.equal(x.alt, '');
    assert.equal(x.docPrId, 3);
    assert.equal(x.supported, true);
  });

  it('docPr id that is not an integer: null, still a picture', () => {
    assert.equal(pic({id: 'x'}).docPrId, null);
    assert.equal(pic({id: '-1'}).docPrId, null);
    assert.equal(pic({id: null, name: ''}).name, '');
  });

  it('strict document', async () => {
    const doc = await readDocx(await picDocx({strict: true,
      pics: [{id: 4, descr: 'S', cx: 9525, cy: 19050}]}));
    const para = doc.sections[0].blocks[0];
    const x = pictureOf(para.inlines[0].node, docMap(doc));
    assert.deepEqual(x, {embed: 'rId11', cx: 9525, cy: 19050,
      alt: 'S', name: 'Picture 4', docPrId: 4, floating: false,
      supported: true});
    assert.equal(docMap(doc), docMap(doc));
  });

  it('transitional document, prefixes on the root', async () => {
    const doc = await readDocx(await picDocx({pics: [{id: 2},
      {id: 9, kind: 'anchor'}]}));
    const [a, b] = doc.sections[0].blocks;
    const m = docMap(doc);
    assert.equal(pictureOf(a.inlines[0].node, m).docPrId, 2);
    assert.equal(pictureOf(b.inlines[0].node, m).floating, true);
  });

  it('docMap without a root is PIC_SCOPE', () => {
    assert.equal(docMap({meta: {}}), PIC_SCOPE);
  });

  it('unusual prefixes', () => {
    const x = pic({wp: 'ns9', picDefault: true, id: 5});
    assert.ok(x);
    assert.equal(x.docPrId, 5);
    assert.equal(x.supported, true);
    // a prefix bound to another URI is not wp
    const xml = drawingXml({}).replace('xmlns:wp="' + URIS.wp,
      'xmlns:wp="urn:other');
    assert.equal(pictureOf(node(xml)), null);
  });

  it('w:drawing found by namespace, not prefix', () => {
    const xml = drawingXml({}).replace(/w:drawing/g, 'x:drawing')
      .replace('<x:drawing>', `<x:drawing xmlns:x="${W_NS}">`);
    assert.ok(pictureOf(node(xml)));
    const m = new Map(PIC_SCOPE).set('w', 'urn:not-w');
    assert.equal(pic({}, m), null);
  });

  describe('not pictures', () => {
    const cases = {
      'w:pict': '<w:pict><v:shape xmlns:v="urn:schemas-microsoft-' +
        'com:vml"/></w:pict>',
      'mc:AlternateContent': '<mc:AlternateContent xmlns:mc="http://' +
        'schemas.openxmlformats.org/markup-compatibility/2006">' +
        '<mc:Choice Requires="wps">' + drawingXml({}) + '</mc:Choice>' +
        '</mc:AlternateContent>',
      'chart graphicData': drawingXml({}).replace(
        'graphicData uri="' + URIS.pic, 'graphicData uri="http://' +
        'schemas.openxmlformats.org/drawingml/2006/chart'),
      'wps:wsp': drawingXml({}).replace(/<pic:pic [^]*<\/pic:pic>/,
        '<wps:wsp xmlns:wps="http://schemas.microsoft.com/office/' +
        'word/2010/wordprocessingShape"><wps:bodyPr/></wps:wsp>')
        .replace('graphicData uri="' + URIS.pic, 'graphicData uri=' +
        '"http://schemas.microsoft.com/office/word/2010/' +
        'wordprocessingShape'),
      'r:link only': drawingXml({embed: null, link: 'rId9'}),
      'r:embed and r:link': drawingXml({link: 'rId9'}),
      'no a:blip': drawingXml({blip: false}),
      'a:blip without r:embed': drawingXml({embed: null}),
      'empty r:embed': drawingXml({embed: ''}),
      'two children in w:drawing': drawingXml({extra: '<wp:inline ' +
        `xmlns:wp="${URIS.wp}"/>`}),
      'text in w:drawing': drawingXml({extra: 'x'}),
      'two pic:blipFill': drawingXml({}).replace('<pic:spPr>',
        '<pic:blipFill><a:blip r:embed="rId2"/></pic:blipFill>' +
        '<pic:spPr>'),
      'two a:graphic': drawingXml({}).replace('</a:graphic>',
        '</a:graphic><a:graphic/>'),
      'graphicData holding two pictures': drawingXml({}).replace(
        '</a:graphicData>', '<pic:pic/></a:graphicData>'),
      'other wp child': drawingXml({}).replace('wp:inline',
        'wp:other').replace('/wp:inline', '/wp:other'),
    };
    for (const [name, xml] of Object.entries(cases)) {
      it(name, () => assert.equal(pictureOf(node(xml)), null));
    }
    it('a w:r, a string, nothing', () => {
      assert.equal(pictureOf(node('<w:r/>')), null);
      assert.equal(pictureOf('text'), null);
      assert.equal(pictureOf(null), null);
    });
  });

  describe('hostile extents', () => {
    for (const v of ['0', '-5', '12.5', '1e9', '2147483648', '',
      ' 5', '0x10', '99999999999']) {
      it(`cx "${v}"`, () => {
        assert.equal(pic({cx: v}), null);
        assert.equal(pic({cy: v}), null);
      });
    }
    it('missing extent, missing cx, missing docPr', () => {
      assert.equal(pic({extent: false}), null);
      assert.equal(pic({cx: null}), null);
      assert.equal(pic({docPr: false}), null);
    });
    it('two extents', () => {
      const xml = drawingXml({}).replace('<wp:effectExtent',
        '<wp:extent cx="1" cy="1"/><wp:effectExtent');
      assert.equal(pictureOf(node(xml)), null);
    });
    it('the limits themselves', () => {
      const x = pic({cx: 1, cy: MAX_EXT});
      assert.equal(x.cx, 1);
      assert.equal(x.cy, MAX_EXT);
    });
  });

  describe('srcRect', () => {
    it('kept when valid', () => {
      assert.deepEqual(pic({srcRect: {l: 10000, r: 20000, t: -5000}})
        .srcRect, {l: 10000, t: -5000, r: 20000, b: 0});
      assert.deepEqual(pic({srcRect: {l: 100000, r: -100000}})
        .srcRect, {l: 100000, t: 0, r: -100000, b: 0});
    });
    it('absent when not', () => {
      for (const s of [{l: 60000, r: 50000}, {l: 'abc'},
        {t: 50000, b: 50000}, {l: 100001}, {b: -100001},
        {l: '1.5'}, {t: '12%'}]) {
        const x = pic({srcRect: s});
        assert.ok(x, JSON.stringify(s));
        assert.equal('srcRect' in x, false, JSON.stringify(s));
      }
    });
  });

  it('strict percent srcRect', async () => {
    const doc = await readDocx(await picDocx({strict: true, pics: [
      {srcRect: {l: '12.5%', t: '-5%', r: '0.001%'}},
      {srcRect: {l: '60%', r: '50%'}}, {srcRect: {l: '12.5'}},
      {srcRect: {l: '1e2%'}}]}));
    const m = docMap(doc);
    const [a, b, c, d] = doc.sections[0].blocks.map((x) =>
      pictureOf(x.inlines[0].node, m));
    assert.deepEqual(a.srcRect, {l: 12500, t: -5000, r: 1, b: 0});
    for (const x of [b, c, d]) assert.equal('srcRect' in x, false);
  });

  it('cache follows the map', () => {
    const n = node(drawingXml({decl: false, wp: 'ns9'}));
    assert.equal(pictureOf(n), null);
    const m = new Map(PIC_SCOPE).set('ns9', URIS.wp);
    assert.ok(pictureOf(n, m));
    assert.equal(pictureOf(n, m), pictureOf(n, m));
    assert.equal(pictureOf(n), null);
  });

  it('supported false without a:xfrm', () => {
    const x = pic({xfrm: false});
    assert.equal(x.supported, false);
    assert.equal(x.cx, 914400);
  });

  it('cached: the same object twice, frozen', () => {
    const n = node(drawingXml({}));
    const x = pictureOf(n);
    assert.equal(pictureOf(n), x);
    assert.ok(Object.isFrozen(x));
    const bad = node(drawingXml({cx: '0'}));
    assert.equal(pictureOf(bad), null);
    assert.equal(pictureOf(bad), null);
  });

  it('__proto__ as an attribute name is inert', () => {
    const xml = drawingXml({id: 7}).replace('<wp:docPr',
      '<wp:docPr __proto__="x" constructor="y"').replace(
      '<a:blip', '<a:blip __proto__="z"').replace('<wp:extent',
      '<wp:extent __proto__="1"');
    const x = pictureOf(node(xml));
    assert.equal(x.docPrId, 7);
    assert.equal(x.cx, 914400);
    assert.equal(Object.getPrototypeOf(x), Object.prototype);
    assert.equal({}.x, undefined);
  });
});
