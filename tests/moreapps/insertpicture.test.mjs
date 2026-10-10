// InsertPicture (Batch B, B4.1): a picture put in at the selection as
// ONE undo step: its media part (setDocPart parts), its relationship
// (rels) and its w:drawing (replaceText); sized from its pixels and
// dpi, fitted to the section; refused (nothing changed) for what
// cannot be shown or when no docPr id is free.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {insert, pictureXml}
  from '../../tools/moreapps/!Word/InsertPicture';
import {pictureOf, docMap} from '../../tools/moreapps/!Word/PicRead';
import {mediaOf} from '../../tools/moreapps/!Word/PicMedia';
import {Document} from '../../tools/moreapps/!Word/Document';
import {OBJ} from '../../tools/moreapps/!Word/Model';
import {select, caret} from '../../tools/moreapps/!Word/Selection';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx, newDoc} from '../../tools/moreapps/!Word/DocxWrite';
import {relKind} from '../../tools/moreapps/!Word/Rels';
import {blockId} from '../../tools/moreapps/!Word/DocPos';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {buildDocx, documentXml, p, r, STRICT_W_NS, STRICT_R_NS}
  from './build-docx.mjs';
import {drawingXml, picDocx, pngBytes, jpegBytes, gifBytes}
  from './pic-fixtures.mjs';
import {lintPackage} from './lint-package.mjs';
import {schemaChecker} from './roundtrip-lib.mjs';

const DATE = new Date(Date.UTC(2026, 0, 1));
const write = (doc) => writeDocx(doc, {date: DATE});
const IN = 914400;
const blocks = (d) => d.doc.sections[0].blocks;
const text = (zip, n) => new TextDecoder().decode(zip.get(n));
const errors = (zip) => lintPackage(zip).problems
  .filter((q) => q.level === 'error');
const at = (d, k = 0, off = 0) => caret({id: blockId(blocks(d)[k]),
  off});
const sect = (w, l = 1440, rt = 1440) => '<w:sectPr><w:pgSz w:w="' +
  w + '" w:h="15840"/><w:pgMar w:top="1440" w:right="' + rt +
  '" w:bottom="1440" w:left="' + l + '" w:header="708" ' +
  'w:footer="708" w:gutter="0"/></w:sectPr>';

const open = async (body = p(r('hello world')), o = {}) =>
  new Document(await readDocx(await picDocx({pics: [], body, ...o})));

/** The picture at block k, offset off: {x, info}. */
function picAt(d, k = 0, off = 0) {
  const x = blocks(d)[k].inlines[off];
  return {x, info: pictureOf(x.node, docMap(d.doc))};
}

describe('InsertPicture', () => {
  it('inserts PNG: one step, a media part, a relationship, the ' +
    'picture at its natural size', async () => {
    const d = new Document(newDoc({date: DATE}));
    const bytes = pngBytes(96, 48);
    const rels = d.doc.rels;
    const sel = insert(d, at(d), {bytes});
    assert.equal(d.undoDepth, 1);
    const id = blocks(d)[0].id;
    assert.deepEqual([sel.anchor, sel.head], [{id, off: 0},
      {id, off: 1}]);
    assert.equal(blocks(d)[0].text, OBJ);
    assert.equal(d.doc.parts.get('word/media/image1.png'), bytes);
    assert.equal(d.doc.rels.length, rels.length + 1);
    const rel = d.doc.rels.at(-1);
    assert.equal(relKind(rel.type).kind, 'image');
    assert.equal(rel.target, 'media/image1.png');
    const {info} = picAt(d);
    assert.equal(info.cx, IN);
    assert.equal(info.cy, IN / 2);
    assert.equal(info.embed, rel.id);
    assert.equal(info.supported, true);
    assert.equal(info.floating, false);
    assert.equal(mediaOf(d.doc, info.embed).bytes, bytes);
    const zip = await readZip(await write(d.doc));
    assert.match(text(zip, '[Content_Types].xml'),
      /<Default Extension="png" ContentType="image\/png"\/>/);
    assert.deepEqual(errors(zip), []);
    const x = schemaChecker();
    if (typeof x !== 'string') {
      try {
        assert.deepEqual([...x.errors(zip.get('word/document.xml'))],
          []);
      } finally { x.done(); }
    }
  });

  it('pictureXml is Word\'s form', () => {
    const n = pictureXml({cx: 5, cy: 6, id: 7, rid: 'rId9',
      file: 'image2.png'});
    assert.equal(n.name, 'w:drawing');
    const info = pictureOf(n);
    assert.deepEqual({...info}, {embed: 'rId9', cx: 5, cy: 6, alt: '',
      name: 'Picture 7', docPrId: 7, floating: false,
      supported: true});
  });

  it('insertpicture undo: the Doc, parts Map and rels array back; ' +
    'the same bytes written', async () => {
    const d = await open();
    const before = structuredClone(d.doc);
    const {parts, rels} = d.doc;
    const first = await write(d.doc);
    insert(d, at(d, 0, 5), {bytes: pngBytes(4, 2)});
    assert.notEqual(d.doc.parts, parts);
    d.undo();
    assert.equal(d.doc.parts, parts, 'the same Map object');
    assert.equal(d.doc.rels, rels, 'the same array');
    assert.deepStrictEqual(d.doc, before);
    assert.deepEqual(await write(d.doc), first);
    d.redo();
    assert.equal(picAt(d, 0, 5).info.cx, 4 * 9525);
  });

  it('first free name, case ignored', async () => {
    const d = await open();
    d.doc.parts = new Map(d.doc.parts)
      .set('word/media/image1.png', pngBytes(1, 1))
      .set('word/media/IMAGE2.PNG', pngBytes(1, 1));
    insert(d, at(d), {bytes: pngBytes(2, 2)});
    assert.ok(d.doc.parts.has('word/media/image3.png'));
    assert.equal(d.doc.rels.at(-1).target, 'media/image3.png');
  });

  it('jpeg and gif: Word\'s extensions; content types', async () => {
    const d = await open();
    insert(d, at(d), {bytes: jpegBytes(1, 1)});
    insert(d, at(d), {bytes: gifBytes(3, 3)});
    assert.ok(d.doc.parts.has('word/media/image1.jpeg'));
    assert.ok(d.doc.parts.has('word/media/image2.gif'));
    const zip = await readZip(await write(d.doc));
    const ct = text(zip, '[Content_Types].xml');
    assert.match(ct, /Extension="jpeg" ContentType="image\/jpeg"/);
    assert.match(ct, /Extension="gif" ContentType="image\/gif"/);
    assert.deepEqual(errors(zip), []);
  });

  it('dpi: a 300 dpi PNG 600 px wide is 2 in', async () => {
    const d = await open();
    insert(d, at(d), {bytes: pngBytes(600, 300, {dpi: 300})});
    const {info} = picAt(d);
    assert.equal(info.cx, 2 * IN);
    assert.equal(info.cy, IN);
  });

  it('a tiny dpi (natural size out of range): the 96 dpi size',
    async () => {
      const d = await open();
      // 1 dpi: 16000 in, over 2^31 EMU; 96 dpi gives 16000 px
      insert(d, at(d), {bytes: pngBytes(16000, 2, {dpi: 1})});
      const {info} = picAt(d);
      const w = (11906 - 2880) * 635;      // the default A4 column
      assert.equal(info.cx, w);
      assert.equal(info.cy, Math.round(2 * 9525 * w / (16000 * 9525)));
    });

  it('fits: a 4000 px PNG in a 6 in column is 6 in wide', async () => {
    const d = await open(p(r('x')) + sect(11520));
    insert(d, at(d), {bytes: pngBytes(4000, 1000)});
    const {info} = picAt(d);
    assert.equal(info.cx, 6 * IN);
    assert.equal(info.cy, 1.5 * IN);
  });

  it('6.5 in cap: an 8 in wide section', async () => {
    const d = await open(p(r('x')) + sect(14400));
    insert(d, at(d), {bytes: pngBytes(4000, 2000)});
    const {info} = picAt(d);
    assert.equal(info.cx, 6.5 * IN);
    assert.equal(info.cy, 3.25 * IN);
  });

  it('columns: two columns of a 6.5 in text width are 3.1 in',
    async () => {
      const cols = '<w:cols w:num="2" w:space="720"/>';
      const d = await open(p(r('x')) + sect(11520)
        .replace('</w:sectPr>', cols + '</w:sectPr>'));
      insert(d, at(d), {bytes: pngBytes(4000, 1000)});
      const {info} = picAt(d);
      assert.equal(info.cx, Math.round((11520 - 2880 - 720) / 2 * 635));
    });

  it('at most 9 in tall: both sides shrink together', async () => {
    const d = await open();
    insert(d, at(d), {bytes: pngBytes(960, 2400)});
    const {info} = picAt(d);
    assert.equal(info.cy, 9 * IN);
    assert.equal(info.cx, 3.6 * IN);
  });

  it('a 1 x 16384 px picture would be under 15 twips wide: refused',
    async () => {
      const d = await open();
      const s = structuredClone(d.doc);
      assert.throws(() => insert(d, at(d), {bytes: pngBytes(1, 16384)}),
        (e) => e instanceof RangeError && e.message === 'too-large');
      assert.deepStrictEqual(d.doc, s);
      assert.equal(d.undoDepth, 0);
    });

  it('a main part in a 245-character folder: refused with \'name\', ' +
    'at once (no endless search)', async () => {
    const d = await open();
    d.doc.meta = {...d.doc.meta,
      mainPart: 'x'.repeat(245) + '/document.xml'};
    assert.throws(() => insert(d, at(d), {bytes: pngBytes(2, 2)}),
      (e) => e instanceof RangeError && e.message === 'name');
    assert.equal(d.undoDepth, 0);
  });

  it('the caret\'s own section decides', async () => {
    const d = await open(p(r('a'), sect(14400)) + p(r('b')) +
      sect(11520));
    const b = d.doc.sections[1].blocks[0];
    insert(d, caret({id: b.id, off: 0}), {bytes: pngBytes(4000, 1000)});
    const x = d.doc.sections[1].blocks[0].inlines[0];
    assert.equal(pictureOf(x.node, docMap(d.doc)).cx, 6 * IN);
    insert(d, at(d), {bytes: pngBytes(4000, 1000)});
    assert.equal(picAt(d).info.cx, 6.5 * IN);
  });

  it('insertpicture strict: Strict relationship and namespaces',
    async () => {
      const d = await open(p(r('x')), {strict: true});
      const bytes = pngBytes(8, 8);
      insert(d, at(d), {bytes});
      const rel = d.doc.rels.at(-1);
      assert.equal(rel.type, 'http://purl.oclc.org/ooxml/' +
        'officeDocument/relationships/image');
      const zip = await readZip(await write(d.doc));
      const main = text(zip, 'word/document.xml');
      assert.doesNotMatch(main, /schemas\.openxmlformats\.org\/drawingml/);
      assert.doesNotMatch(main, /schemas\.openxmlformats\.org/);
      assert.match(main, /purl\.oclc\.org\/ooxml\/drawingml\/picture/);
      assert.deepEqual(errors(zip), []);
      const back = new Document(await readDocx(await write(d.doc)));
      const {info} = picAt(back);
      assert.equal(info.cx, 8 * 9525);
      assert.equal(mediaOf(back.doc, info.embed).bytes.length,
        bytes.length);
      // a Strict root binding none of wp, a, pic: declared on the
      // node, written with Strict URIs
      const e = new Document(await readDocx(await buildDocx({
        'word/document.xml': documentXml(p(r('x')), {ns: STRICT_W_NS,
          rNs: STRICT_R_NS, rootAttrs: ' w:conformance="strict"'})},
      {strict: true})));
      insert(e, at(e), {bytes});
      const m2 = text(await readZip(await write(e.doc)),
        'word/document.xml');
      assert.match(m2, /<wp:inline [^>]*xmlns:wp="http:\/\/purl/);
      assert.doesNotMatch(m2, /schemas\.openxmlformats\.org/);
      const back2 = new Document(await readDocx(await write(e.doc)));
      assert.equal(picAt(back2).info.cx, 8 * 9525);
    });

  it('refusals change nothing', async () => {
    const big = new Uint8Array(21 << 20);
    big.set(pngBytes(10, 10));
    const bmp = new Uint8Array([66, 77, 0, 0, 0, 0, 0, 0, 0, 0]);
    const cases = [
      ['not-image', bmp], ['not-image', 'x'], ['not-image', [1, 2]],
      ['not-image', new Uint8Array(0)],
      ['too-big', big], ['too-large', pngBytes(20000, 10)],
      ['too-large', jpegBytes(9000, 9000)],
    ];
    for (const [code, bytes] of cases) {
      const d = await open();
      const s = structuredClone(d.doc), {parts, rels} = d.doc;
      assert.throws(() => insert(d, at(d), {bytes}),
        (e) => e instanceof RangeError && e.message === code, code);
      assert.equal(d.undoDepth, 0);
      assert.deepStrictEqual(d.doc, s);
      assert.equal(d.doc.parts, parts);
      assert.equal(d.doc.rels, rels);
    }
    const d = await open(p('<w:r>' + drawingXml({id: 2147483647,
      decl: false, embed: 'rIdX'}) + '</w:r>'));
    const s = structuredClone(d.doc);
    assert.throws(() => insert(d, at(d), {bytes: pngBytes(2, 2)}),
      (e) => e instanceof RangeError && e.message === 'ids');
    assert.equal(d.undoDepth, 0);
    assert.deepStrictEqual(d.doc, s);
  });

  it('a fresh docPr id: one more than the largest', async () => {
    const d = await open(p('<w:r>' + drawingXml({id: 41,
      decl: false}) + '</w:r>'));
    insert(d, at(d), {bytes: pngBytes(2, 2)});
    insert(d, at(d), {bytes: pngBytes(2, 2)});
    assert.equal(picAt(d).info.docPrId, 43);
    assert.equal(picAt(d).info.name, 'Picture 43');
    assert.equal(picAt(d, 0, 1).info.docPrId, 42);
  });

  it('over a selection: the text replaced, one step', async () => {
    const d = await open();
    const id = blocks(d)[0].id;
    const sel = insert(d, select({id, off: 5}, {id, off: 0}),
      {bytes: pngBytes(2, 2)});
    assert.equal(d.undoDepth, 1);
    assert.equal(blocks(d)[0].text, OBJ + ' world');
    assert.deepEqual([sel.anchor, sel.head], [{id, off: 0},
      {id, off: 1}]);
    d.undo();
    assert.equal(blocks(d)[0].text, 'hello world');
  });

  it('a position not in the document: nothing', async () => {
    const d = await open();
    const sel = caret({id: 'nope', off: 0});
    assert.equal(insert(d, sel, {bytes: pngBytes(2, 2)}), sel);
    assert.equal(insert(d, null, {bytes: pngBytes(2, 2)}), null);
    assert.equal(d.undoDepth, 0);
  });

  it('at a table edge: a new paragraph, as putIn', async () => {
    const tbl = '<w:tbl><w:tr><w:tc>' + p(r('c')) +
      '</w:tc></w:tr></w:tbl>';
    const d = await open(tbl);
    const t = blocks(d)[0];
    assert.equal(t.type, 'opaque');
    const sel = insert(d, at(d, 0, 1), {bytes: pngBytes(2, 2)});
    assert.equal(d.undoDepth, 1);
    assert.equal(blocks(d)[0], t);
    assert.equal(blocks(d)[1].text, OBJ);
    assert.equal(sel.head.id, blocks(d)[1].id);
    assert.ok(picAt(d, 1).info);
  });

  it('no root prefix: the node declares wp, a, pic, r', async () => {
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/' +
      '2006/main';
    const xml = '<?xml version="1.0" encoding="UTF-8" ' +
      `standalone="yes"?><w:document xmlns:w="${W}" xmlns:a="urn:x">` +
      '<w:body>' + p(r('x')) + '</w:body></w:document>';
    const d = new Document(await readDocx(await buildDocx({
      'word/document.xml': xml})));
    const first = await write(d.doc);
    insert(d, at(d), {bytes: pngBytes(4, 4)});
    const {info, x} = picAt(d);
    assert.equal(info.cx, 4 * 9525);
    const s = JSON.stringify(x.node);
    assert.ok(s.includes('"xmlns:wp"'));
    assert.ok(s.includes('"xmlns:a1"'), 'a is taken at the root');
    const zip = await readZip(await write(d.doc));
    assert.deepEqual(errors(zip), []);
    const back = await readDocx(await write(d.doc));
    const y = back.sections[0].blocks[0].inlines[0];
    assert.equal(pictureOf(y.node, docMap(back)).cx, 4 * 9525);
    const c = schemaChecker();
    if (typeof c !== 'string') {
      try {
        const was = c.errors((await readZip(first))
          .get('word/document.xml'));
        const now = c.errors(zip.get('word/document.xml'));
        assert.deepEqual([...now].filter((e) => !was.has(e)), []);
      } finally { c.done(); }
    }
  });
});

describe('InsertPicture: final review fixes (A3)', () => {
  const IMG = 'http://schemas.openxmlformats.org/officeDocument/2006/' +
    'relationships/image';

  it('two stale content-type Overrides: names go past them, as ' +
    'a paste does', async () => {
    const d = await open();
    const ct = d.doc.meta.contentTypes;
    d.doc.meta = {...d.doc.meta, contentTypes: {...ct, overrides: [
      ...ct.overrides, ['/word/media/image1.png', 'image/png'],
      ['/word/media/image2.png', 'image/png']]}};
    insert(d, at(d), {bytes: pngBytes(4, 4)});
    assert.ok(d.doc.parts.has('word/media/image3.png'));
    const zip = await readZip(await write(d.doc));
    // the file's own stale Overrides stay (kept as they were)
    assert.deepEqual(errors(zip).filter((q) => q.rule !== 'ct-orphan'),
      []);
  });

  it('a relationship whose part is missing keeps its name and id',
    async () => {
      const d = await open();
      d.doc.rels = [...d.doc.rels, {id: 'rId77', type: IMG,
        target: 'media/image1.png', attrs: [['Id', 'rId77'],
          ['Type', IMG], ['Target', 'media/image1.png']]}];
      insert(d, at(d), {bytes: pngBytes(4, 4)});
      assert.ok(!d.doc.parts.has('word/media/image1.png'));
      assert.ok(d.doc.parts.has('word/media/image2.png'));
      const {info} = picAt(d);
      assert.notEqual(info.embed, 'rId77');
      const ids = d.doc.rels.map((x) => x.id);
      assert.equal(new Set(ids).size, ids.length, 'rIds unique');
      const rel = d.doc.rels.find((x) => x.id === info.embed);
      assert.equal(rel.target, 'media/image2.png');
    });
});
