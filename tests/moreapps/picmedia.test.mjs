// PicMedia: a picture's bytes, type, size and dpi (Batch B, B1.2).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {mediaOf, imageInfo, decodable, naturalEmu, MAX_BYTES,
  MAX_SIDE, MAX_PIXELS} from '../../tools/moreapps/!Word/PicMedia';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {picDocx, pngBytes, jpegBytes, gifBytes}
  from './pic-fixtures.mjs';

const near = (a, b) => assert.ok(Math.abs(a - b) < 0.5, a + ' vs ' + b);
const open = async (o) => readDocx(await picDocx(o));

describe('PicMedia', () => {
  it('constants', () => {
    assert.equal(MAX_BYTES, 20971520);
    assert.equal(MAX_SIDE, 16384);
    assert.equal(MAX_PIXELS, 64000000, '64 million, as the text says');
  });

  it('png info', () => {
    const i = imageInfo(pngBytes(300, 200, {dpi: 300}));
    assert.equal(i.mime, 'image/png');
    assert.equal(i.ext, 'png');
    assert.equal(i.w, 300);
    assert.equal(i.h, 200);
    near(i.dpiX, 300);
    near(i.dpiY, 300);
    const n = imageInfo(pngBytes(5, 6));
    assert.deepEqual([n.dpiX, n.dpiY], [96, 96]);
    const x = imageInfo(pngBytes(5, 6, {dpi: [72, 144]}));
    near(x.dpiX, 72);
    near(x.dpiY, 144);
    // px per metre is whole: a whole dpi is read back exactly
    // (11811 is 300 dpi, 2835 is 72); others are left as they are
    assert.deepEqual([i.dpiX, x.dpiX, x.dpiY], [300, 72, 144]);
    const odd = imageInfo(pngBytes(5, 6, {dpi: 100.5}));
    near(odd.dpiX, 100.5);
    assert.notEqual(odd.dpiX, 100);
  });

  it('jpeg density', () => {
    let i = imageInfo(jpegBytes(40, 30, {density: 72, units: 1}));
    assert.deepEqual([i.mime, i.ext, i.w, i.h, i.dpiX], ['image/jpeg',
      'jpeg', 40, 30, 72]);
    i = imageInfo(jpegBytes(40, 30, {density: 118, units: 2}));
    near(i.dpiX, 299.7);
    near(i.dpiY, 299.7);
    i = imageInfo(jpegBytes(40, 30, {density: 72, units: 0}));
    assert.deepEqual([i.dpiX, i.dpiY], [96, 96]);
    i = imageInfo(jpegBytes(40, 30, {density: 0, units: 1}));
    assert.deepEqual([i.dpiX, i.dpiY], [96, 96]);
    i = imageInfo(jpegBytes(40, 30, {density: 20000, units: 1}));
    assert.deepEqual([i.dpiX, i.dpiY], [96, 96]);
  });

  it('jpeg SOF kinds', () => {
    for (const m of [0xc1, 0xc2, 0xc3, 0xc5, 0xc9, 0xcf]) {
      const b = jpegBytes(40, 30);
      b[b.indexOf(0xc0, 20)] = m;
      assert.equal(imageInfo(b).w, 40, m.toString(16));
    }
    const b = jpegBytes(40, 30);
    b[b.indexOf(0xc0, 20)] = 0xc4;
    assert.equal(imageInfo(b), null);
  });

  it('gif frame larger', () => {
    const i = imageInfo(gifBytes(10, 10, {frameW: 20000, frameH: 5}));
    assert.deepEqual([i.mime, i.ext, i.w, i.h, i.dpiX, i.dpiY],
      ['image/gif', 'gif', 20000, 10, 96, 96]);
    assert.equal(imageInfo(gifBytes(7, 9)).h, 9);
  });

  it('gif frame offset counts', () => {
    const b = gifBytes(10, 10, {frameW: 300, frameH: 300});
    const at = b.indexOf(0x2c, 19);
    assert.equal(at, 19);
    b[20] = 16000 & 255; b[21] = 16000 >> 8;
    b[22] = 16000 & 255; b[23] = 16000 >> 8;
    const i = imageInfo(b);
    assert.deepEqual([i.w, i.h], [16300, 16300]);
    assert.equal(decodable(i, b), 'too-large');
    const c = gifBytes(10, 10);
    assert.deepEqual([imageInfo(c).w, imageInfo(c).h], [10, 10]);
  });

  // a JPEG with `n` APP1 segments of `size` data bytes before its SOF
  const padded = (n, size) => {
    const b = jpegBytes(40, 30);
    const seg = new Uint8Array(4 + size);
    seg.set([0xff, 0xe1, (size + 2) >> 8, (size + 2) & 255]);
    const out = [b.slice(0, 20)];
    for (let k = 0; k < n; k++) out.push(seg);
    out.push(b.slice(20));
    return new Uint8Array(Buffer.concat(out));
  };

  it('long jpeg metadata (a phone photo)', () => {
    const b = padded(2, 65533);
    assert.ok(b.indexOf(0xc0, 20) > 131000);
    const i = imageInfo(b);
    assert.deepEqual([i.w, i.h], [40, 30]);
    assert.equal(imageInfo(padded(1, 52000)).w, 40);
  });

  it('jpeg with too many segments', () => {
    assert.equal(imageInfo(padded(500, 0)).w, 40);
    assert.equal(imageInfo(padded(600, 0)), null);
  });

  it('png IHDR must be 13 bytes', () => {
    const b = pngBytes(3, 3);
    b[11] = 12;
    assert.equal(imageInfo(b), null);
  });

  it('not an image', () => {
    const enc = (s) => new Uint8Array(Buffer.from(s, 'latin1'));
    for (const b of [enc('BM6\0\0\0\0\0\0\0'), enc('%PDF-1.4 ...'),
      enc('<svg xmlns="x"/>'), new Uint8Array(0),
      pngBytes(3, 3).slice(0, 7)]) {
      assert.equal(imageInfo(b), null);
    }
  });

  it('truncated headers', () => {
    for (const b of [pngBytes(30, 20, {dpi: 96}), jpegBytes(30, 20),
      gifBytes(30, 20)]) {
      for (let n = 0; n < b.length && n < 70; n++) {
        const i = imageInfo(b.slice(0, n));
        assert.ok(i === null || i.w > 0, 'cut at ' + n);
      }
    }
    assert.equal(imageInfo(pngBytes(30, 20).slice(0, 20)), null);
    assert.equal(imageInfo(jpegBytes(30, 20).slice(0, 20)), null);
    assert.equal(imageInfo(gifBytes(30, 20).slice(0, 20)), null);
    assert.equal(imageInfo(null), null);
  });

  it('zero size is not an image', () => {
    assert.equal(imageInfo(pngBytes(0, 5)), null);
    assert.equal(imageInfo(gifBytes(0, 0)), null);
  });

  it('mediaOf', async () => {
    const png = pngBytes(4, 2);
    const doc = await open({pics: [{embed: 'rId5', bytes: png}]});
    const m = mediaOf(doc, 'rId5');
    assert.equal(m.name, 'word/media/image1.png');
    assert.equal(m.mime, 'image/png');
    assert.equal(m.bytes, doc.parts.get('word/media/image1.png'));
    assert.equal(mediaOf(doc, 'rId99'), null);
    assert.equal(mediaOf(doc, 'rId5').bytes, m.bytes);
    const s = await open({strict: true, pics: [{embed: 'rId5'}]});
    assert.equal(mediaOf(s, 'rId5').name, 'word/media/image1.png');
  });

  it('mediaOf refuses', async () => {
    const ext = await open({pics: [{embed: 'rId5',
      mode: 'External'}]});
    assert.equal(mediaOf(ext, 'rId5'), null);
    const up = await open({pics: [{embed: 'rId5',
      target: '../../x.png', bytes: null}]});
    for (const n of ['x.png', 'word/x.png', '../x.png']) {
      up.parts.set(n, pngBytes(2, 2));
    }
    assert.equal(mediaOf(up, 'rId5'), null);
    const self = await open({pics: [{embed: 'rId5',
      target: 'document.xml', bytes: null}]});
    assert.equal(mediaOf(self, 'rId5'), null);
    const none = await open({pics: [{embed: 'rId5', bytes: null}]});
    assert.equal(mediaOf(none, 'rId5'), null);
    const doc = await open({pics: [{embed: 'rId5'}]});
    doc.rels = doc.rels.map((r) => r.id === 'rId5'
      ? {...r, type: r.type.replace(/image$/, 'hyperlink')} : r);
    assert.equal(mediaOf(doc, 'rId5'), null);
  });

  it('mediaOf mime of other types', async () => {
    const doc = await open({pics: [{embed: 'rId5', ext: 'emf',
      bytes: new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0])}]});
    const m = mediaOf(doc, 'rId5');
    assert.equal(m.mime, null);
    assert.equal(m.name, 'word/media/image1.emf');
  });

  it('mediaOf cache follows doc.rels', async () => {
    const doc = await open({pics: [{embed: 'rId5'}]});
    assert.ok(mediaOf(doc, 'rId5'));
    doc.rels = doc.rels.filter((r) => r.id !== 'rId5');
    assert.equal(mediaOf(doc, 'rId5'), null);
  });

  it('hostile', () => {
    const big = new Uint8Array(50 * 1024 * 1024);
    assert.equal(decodable(null, big), 'too-big');
    assert.equal(decodable(null, new Uint8Array(3)), 'not-image');
    assert.equal(decodable({w: 5, h: 5}, big), 'too-big');
    const small = new Uint8Array(10);
    const png = pngBytes(100000, 100000);
    assert.equal(decodable(imageInfo(png), png), 'too-large');
    const j = jpegBytes(65535, 65535);
    assert.equal(decodable(imageInfo(j), j), 'too-large');
    const q = pngBytes(9000, 9000);
    assert.equal(decodable(imageInfo(q), q), 'too-large');
    assert.equal(decodable({w: 16385, h: 1}, small), 'too-large');
    assert.equal(decodable({w: 16000, h: 4000}, small), null);
    // 64 million exactly: in; 8100 x 8100 (65.6 million): out
    assert.equal(decodable({w: 16000, h: 4001}, small), 'too-large');
    assert.equal(decodable({w: 8100, h: 8100}, small), 'too-large');
    assert.equal(decodable({w: 16384, h: 3906}, small), null);
    assert.equal(decodable({w: 300, h: 200}, small), null);
  });

  it('naturalEmu', () => {
    assert.deepEqual(naturalEmu({w: 96, h: 96, dpiX: 96, dpiY: 96}),
      {cx: 914400, cy: 914400});
    assert.deepEqual(naturalEmu({w: 300, h: 150, dpiX: 300, dpiY: 150}),
      {cx: 914400, cy: 914400});
  });

  it('naturalEmu out of range is null', () => {
    assert.equal(naturalEmu({w: 16000, h: 5, dpiX: 0.03, dpiY: 96}),
      null);
    assert.equal(naturalEmu(null), null);
    assert.ok(naturalEmu({w: 2000, h: 5, dpiX: 1, dpiY: 96}));
  });
});
