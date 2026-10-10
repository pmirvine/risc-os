// PicIds (Batch B, B4.1): the wp:docPr ids a document uses, over
// the main part's inlines and blocks (tables, AlternateContent) and,
// by a text scan, its headers, footers, notes and comments; a fresh
// id is one more than the largest below 2^31 (plan R8).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {usedDocPrIds, freshDocPrId}
  from '../../tools/moreapps/!Word/PicIds';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {p} from './build-docx.mjs';
import {drawingXml, picDocx} from './pic-fixtures.mjs';

const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const run = (o) => '<w:r>' + drawingXml({decl: false, ...o}) + '</w:r>';
const enc = (s) => new TextEncoder().encode(s);
const HDR = (ids) => enc('<?xml version="1.0"?><w:hdr xmlns:w="x" ' +
  'xmlns:wp="y">' + ids.map((n) => `<w:p><wp:docPr id="${n}" ` +
  `name="P"/><docPr\tid="${n + 1}"/></w:p>`).join('') + '</w:hdr>');

async function load(body = '') {
  return readDocx(await picDocx({pics: [{id: 3}], body}));
}

const withParts = (doc, add) => {
  doc.parts = new Map(doc.parts);
  for (const [k, v] of Object.entries(add)) doc.parts.set(k, v);
  return doc;
};

describe('PicIds', () => {
  it('ids from the body, a table and AlternateContent', async () => {
    const tbl = '<w:tbl><w:tr><w:tc>' + p(run({id: 40})) +
      '</w:tc></w:tr></w:tbl>';
    const alt = p(`<w:r><mc:AlternateContent xmlns:mc="${MC}">` +
      '<mc:Choice Requires="wps">' + drawingXml({id: 77, decl: false}) +
      '</mc:Choice><mc:Fallback>' + drawingXml({id: 78, decl: false}) +
      '</mc:Fallback></mc:AlternateContent></w:r>');
    const doc = await load(p(run({id: 12})) + tbl + alt);
    const u = usedDocPrIds(doc);
    for (const n of [3, 12, 40, 77, 78]) assert.ok(u.ids.has(n), n);
    assert.equal(u.max, 78);
    assert.equal(freshDocPrId(u), 79);
  });

  it('single-quoted ids in a header are seen', async () => {
    const doc = withParts(await load(), {'word/header1.xml': enc(
      "<w:hdr xmlns:wp='y'><wp:docPr id='91' name='x'/></w:hdr>")});
    assert.equal(usedDocPrIds(doc).max, 91);
  });

  it('a document without pictures: 1', async () => {
    const doc = await readDocx(await picDocx({pics: []}));
    const u = usedDocPrIds(doc);
    assert.equal(u.max, 0);
    assert.equal(freshDocPrId(u), 1);
  });

  it('header, footer, notes and comments parts are scanned',
    async () => {
      const doc = withParts(await load(), {
        'word/header1.xml': HDR([100]),
        'word/footer2.xml': HDR([5]),
        'word/comments.xml': HDR([300]),
        'word/footnotes.xml': HDR([20]),
        'word/media/x.xml': HDR([9000]),
      });
      const u = usedDocPrIds(doc);
      for (const n of [3, 100, 101, 5, 300, 301, 20])
        assert.ok(u.ids.has(n), n);
      assert.ok(!u.ids.has(9000), 'not a header');
      assert.equal(freshDocPrId(u), 302);
    });

  it('a part reached by a header relationship is scanned', async () => {
    const doc = withParts(await load(), {'word/top.xml': HDR([500])});
    doc.rels = [...doc.rels, {id: 'rId99', type: 'http://schemas.' +
      'openxmlformats.org/officeDocument/2006/relationships/header',
    target: 'top.xml'}];
    assert.equal(freshDocPrId(usedDocPrIds(doc)), 502);
  });

  it('duplicates are counted once; ids are kept as they are',
    async () => {
      const doc = await load(p(run({id: 3})) + p(run({id: 3})));
      const u = usedDocPrIds(doc);
      assert.deepEqual([...u.ids], [3]);
      assert.equal(freshDocPrId(u), 4);
    });

  it('2147483647 present: no fresh id (RangeError ids)', async () => {
    const doc = await load(p(run({id: 2147483647})));
    assert.throws(() => freshDocPrId(usedDocPrIds(doc)),
      (e) => e instanceof RangeError && e.message === 'ids');
  });

  it('ids of 2^31 and above are ignored for the largest', async () => {
    const doc = withParts(await load(p(run({id: 2147483648})) +
      p(run({id: 4294967295}))), {'word/header1.xml':
      HDR([9999999999])});
    const u = usedDocPrIds(doc);
    assert.ok(u.ids.has(2147483648));
    assert.equal(u.max, 3);
    assert.equal(freshDocPrId(u), 4);
  });

  it('odd ids (not decimal) are not ids', async () => {
    const doc = await load(p(run({id: '-5'})) + p(run({id: '1e3'})) +
      p(run({id: ' 9'})));
    assert.equal(usedDocPrIds(doc).max, 3);
  });

  it('a 5 MB header is decoded once (cached per bytes)', async () => {
    const big = enc('<w:hdr xmlns:wp="y"><wp:docPr id="61" name="x"/>' +
      '<w:p>' + 'x'.repeat(5 << 20) + '</w:p></w:hdr>');
    const doc = withParts(await load(), {'word/header1.xml': big});
    const Real = globalThis.TextDecoder;
    let made = 0;
    globalThis.TextDecoder = class extends Real {
      decode(b) { made++; return super.decode(b); }
    };
    try {
      assert.equal(usedDocPrIds(doc).max, 61);
      assert.equal(usedDocPrIds(doc).max, 61);
      const doc2 = withParts(doc, {'word/footer1.xml': HDR([2])});
      assert.equal(usedDocPrIds(doc2).max, 61);
    } finally {
      globalThis.TextDecoder = Real;
    }
    assert.equal(made, 2, 'each part decoded once');
  });
  it('A2: 128,000 unclosed docPr starts scan in linear time',
    async () => {
      const s = '<w:hdr xmlns:wp="y"><wp:docPr id="17" name="x"/>' +
        '<docPr '.repeat(128000) + '</w:hdr>';
      const doc = withParts(await load(), {'word/header1.xml': enc(s)});
      const t = performance.now();
      const u = usedDocPrIds(doc);
      const ms = performance.now() - t;
      assert.equal(u.max, 17);
      assert.ok(ms < 200, 'took ' + ms.toFixed(1) + ' ms');
    });

  it('A2/M3: an id inside another attribute\'s value is not an id',
    async () => {
      const doc = withParts(await load(), {'word/header1.xml': enc(
        '<w:hdr xmlns:wp="y"><wp:docPr descr="x id=\'2147483647\'" ' +
        'id="5" name="a"/><wp:docPr title=\' id="900"\' id=\'6\'/>' +
        '<wp:docPr name="b"\n id="8"/></w:hdr>')});
      const u = usedDocPrIds(doc);
      assert.deepEqual([...u.ids].sort((a, b) => a - b), [3, 5, 6, 8]);
      assert.equal(freshDocPrId(u), 9);
    });
});
