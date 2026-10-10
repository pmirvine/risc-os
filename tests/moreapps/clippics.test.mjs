// ClipPics (Batch B, B7): pictures pasted between !Word documents
// carry their media (a new part per source embed, the source's
// extension, one relationship each, the target's Strict or
// Transitional type), their r:embed and wp:docPr ids made afresh;
// a paste within one document gives docPr ids afresh and shares the
// media; what cannot travel (VML, linked pictures, a missing part,
// past the caps) is dropped as before. One undo step each.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {picsOf, copyPics, freshDocPrs, MAX_PICS, MAX_PIC_BYTES}
  from '../../tools/moreapps/!Word/ClipPics';
import {slice} from '../../tools/moreapps/!Word/ClipSlice';
import {toHtml} from '../../tools/moreapps/!Word/ClipHtml';
import {ClipStore} from '../../tools/moreapps/!Word/ClipStore';
import {pick} from '../../tools/moreapps/!Word/ClipPick';
import {pasteBlocks} from '../../tools/moreapps/!Word/ClipPaste';
import {pictureOf, docMap} from '../../tools/moreapps/!Word/PicRead';
import {mediaOf} from '../../tools/moreapps/!Word/PicMedia';
import {Document} from '../../tools/moreapps/!Word/Document';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {relKind} from '../../tools/moreapps/!Word/Rels';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {buildDocx, documentXml, p, r, STRICT_W_NS, STRICT_R_NS}
  from './build-docx.mjs';
import {picDocx, pngBytes, jpegBytes, drawingXml}
  from './pic-fixtures.mjs';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync}
  from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const CACHE = fileURLToPath(new URL('../../tools/moreapps/.cache/',
  import.meta.url));
import {blocks, SEL, C} from './edit-docs.mjs';
import {lintPackage} from './lint-package.mjs';
import {write, schema} from './roundtrip-lib.mjs';

const {xsd} = schema();
const dec = new TextDecoder();
const open = async (bytes) => new Document(await readDocx(bytes));
const all = (d) => SEL(d, 0, 0, blocks(d).length - 1,
  blocks(d).at(-1).text.length);
const end = (d) => C(d, blocks(d).length - 1,
  blocks(d).at(-1).text.length);
const media = (d) => [...d.doc.parts.keys()].filter((k) =>
  /media\//.test(k)).sort();

/** Copy sel in src, paste at `at` in dst as ./EditClip does. */
function copyPaste(src, sel, dst, at, sameDoc = false) {
  const store = new ClipStore();
  const s = slice(src.doc, sel);
  const token = store.put(s, 1);
  const html = toHtml(src.doc, s, {token});
  const x = pick({text: s.plain, html}, {store,
    docKey: sameDoc ? 1 : 2, parseHtml: null});
  assert.equal(x.route, 'exact');
  return pasteBlocks(dst, at, x.blocks, x.opts);
}

/** Every picture inline of d: [{x, info}] in order. */
function pics(d) {
  const m = docMap(d.doc), out = [];
  for (const b of blocks(d)) {
    if (b.type !== 'p') continue;
    for (const k of Object.keys(b.inlines)) {
      const x = b.inlines[k];
      const info = x && x.node ? pictureOf(x.node, m) : null;
      if (info) out.push({x, info});
    }
  }
  return out;
}

/** Written, linted (and schema-checked), read back. */
async function written(d) {
  const bytes = await write(d.doc);
  const z = await readZip(bytes);
  const errs = lintPackage(z).problems.filter((q) => q.level ===
    'error');
  assert.deepEqual(errs, [], 'package errors');
  const main = d.doc.meta.mainPart;
  if (xsd && d.doc.meta.conformance !== 'strict') {
    assert.deepEqual([...xsd.errors(z.get(main))], [], 'schema');
  }
  return {back: await open(bytes), z, main: dec.decode(z.get(main))};
}

// two pictures on one embed (rId11, image1.png), one on another
// (rId13, image3.jpeg)
const SRC = () => picDocx({pics: [{descr: 'first', srcRect: {l: 1000}},
  {embed: 'rId11', rel: false, bytes: null, cx: 200000, cy: 100000,
    descr: 'second'},
  {ext: 'jpeg', bytes: jpegBytes(1, 1), cx: 123456, cy: 654321}]});

describe('ClipPics', () => {
  it('across documents: new parts, relationships, embeds and ids; ' +
    'one undo step restores parts and rels', async () => {
    const src = await open(await SRC());
    const dst = await open(await picDocx());
    const {parts, rels} = dst.doc;
    const before = structuredClone(dst.doc);
    const was = pics(src);
    assert.equal(was.length, 3);
    copyPaste(src, all(src), dst, end(dst));
    assert.equal(dst.undoDepth, 1, 'one undo step');
    assert.deepEqual(media(dst), ['word/media/image1.png',
      'word/media/image2.png', 'word/media/image3.jpeg']);
    const sp = src.doc.parts;
    assert.equal(dst.doc.parts.get('word/media/image2.png'),
      sp.get('word/media/image1.png'), 'the same bytes object');
    assert.equal(dst.doc.parts.get('word/media/image3.jpeg'),
      sp.get('word/media/image3.jpeg'));
    assert.equal(dst.doc.rels.length, rels.length + 2);
    const added = dst.doc.rels.slice(rels.length);
    assert.deepEqual(added.map((x) => x.target), ['media/image2.png',
      'media/image3.jpeg']);
    for (const x of added) {
      assert.deepEqual(relKind(x.type), {kind: 'image', strict: false});
      assert.ok(!rels.some((o) => o.id === x.id), 'a fresh id');
    }
    const now = pics(dst);
    assert.equal(now.length, 4);
    const got = now.slice(1).map((q) => q.info);
    assert.deepEqual(got.map((i) => i.embed), [added[0].id,
      added[0].id, added[1].id]);
    const ids = now.map((q) => q.info.docPrId);
    assert.deepEqual(ids, [1, 2, 3, 4], 'fresh and distinct');
    for (let k = 0; k < 3; k++) {
      const a = was[k].info, b = got[k];
      assert.deepEqual([b.cx, b.cy, b.alt, b.srcRect],
        [a.cx, a.cy, a.alt, a.srcRect]);
      assert.equal(b.name, 'Picture ' + (k + 1), 'name kept');
    }
    for (const q of now.slice(1)) {
      assert.ok(mediaOf(dst.doc, q.info.embed).bytes instanceof
        Uint8Array);
    }
    const after = structuredClone(dst.doc);
    const {back} = await written(dst);
    assert.equal(pics(back).length, 4);
    assert.equal(mediaOf(back.doc, pics(back)[3].info.embed).mime,
      'image/jpeg');
    dst.undo();
    assert.equal(dst.doc.parts, parts, 'the same Map');
    assert.equal(dst.doc.rels, rels, 'the same array');
    assert.deepStrictEqual(dst.doc, before);
    dst.redo();
    assert.deepStrictEqual(structuredClone(dst.doc), after);
  });

  it('copyPics alone: ops setDocPart parts then rels; none without ' +
    'a picture', async () => {
    const src = await open(await SRC());
    const dst = await open(await picDocx());
    const s = slice(src.doc, all(src));
    const c = copyPics(dst.doc, s.blocks, s.pics, s.picScope);
    assert.deepEqual(c.ops.map((o) => o.op + ':' + o.key),
      ['setDocPart:parts', 'setDocPart:rels']);
    assert.equal(c.blocks.length, s.blocks.length);
    const none = copyPics(dst.doc, [{type: 'p', text: 'x', runs: [{
      start: 0, end: 1, rPr: {extra: []}}], inlines: {},
    pPr: {extra: []}}], s.pics, s.picScope);
    assert.deepEqual(none.ops, []);
  });

  it('strict target: Strict relationship type and namespaces',
    async () => {
      const src = await open(await SRC());
      const targets = [await picDocx({strict: true}),
        await buildDocx({'word/document.xml': documentXml(p(r('x')),
          {ns: STRICT_W_NS, rNs: STRICT_R_NS,
            rootAttrs: ' w:conformance="strict"'})}, {strict: true})];
      for (const bytes of targets) {
        const dst = await open(bytes);
        assert.equal(dst.doc.meta.conformance, 'strict');
        const n = dst.doc.rels.length;
        copyPaste(src, all(src), dst, end(dst));
        for (const x of dst.doc.rels.slice(n)) {
          assert.deepEqual(relKind(x.type), {kind: 'image',
            strict: true});
        }
        const {back, main} = await written(dst);
        assert.doesNotMatch(main, /schemas\.openxmlformats\.org\/drawingml/);
        assert.match(main, /purl\.oclc\.org\/ooxml\/drawingml\/main/);
        assert.equal(pics(back).length, pics(dst).length);
        assert.ok(pics(back).length >= 3);
      }
    });

  it('a target that binds no or other drawing prefixes at its root',
    async () => {
      const src = await open(await SRC());
      for (const rootAttrs of ['', ' xmlns:wp="urn:other" ' +
        'xmlns:a="urn:a2"']) {
        const dst = await open(await buildDocx({'word/document.xml':
          documentXml(p(r('x')), {rootAttrs})}));
        copyPaste(src, all(src), dst, end(dst));
        assert.equal(pics(dst).length, 3);
        const {back, main} = await written(dst);
        assert.equal(pics(back).length, 3, main.slice(0, 400));
        assert.deepEqual(pics(back).map((q) => q.info.alt),
          ['first', 'second', '']);
      }
    });

  it('same document: a fresh docPr id, the media and relationship ' +
    'shared, no new part', async () => {
    const d = await open(await picDocx({body: p(r('after'))}));
    const {parts, rels} = d.doc;
    const before = structuredClone(d.doc);
    copyPaste(d, SEL(d, 0, 0, 0, 1), d, end(d), true);
    assert.equal(d.undoDepth, 1);
    assert.equal(d.doc.parts, parts, 'no new part');
    assert.equal(d.doc.rels, rels, 'no new relationship');
    const now = pics(d);
    assert.equal(now.length, 2);
    assert.equal(now[1].info.embed, now[0].info.embed);
    assert.deepEqual(now.map((q) => q.info.docPrId), [1, 2]);
    await written(d);
    d.undo();
    assert.deepStrictEqual(d.doc, before);
  });

  it('same document: an AlternateContent\'s branches get one new id',
    async () => {
      const MC = 'http://schemas.openxmlformats.org/' +
        'markup-compatibility/2006';
      const WP = 'http://schemas.openxmlformats.org/drawingml/2006/' +
        'wordprocessingDrawing';
      const dr = '<w:drawing><wp:inline xmlns:wp="' + WP + '">' +
        '<wp:extent cx="1" cy="1"/><wp:docPr id="7" name="S"/>' +
        '</wp:inline></w:drawing>';
      const alt = '<w:r><mc:AlternateContent xmlns:mc="' + MC + '">' +
        '<mc:Choice Requires="wps">' + dr + '</mc:Choice>' +
        '<mc:Fallback>' + dr + '</mc:Fallback></mc:AlternateContent>' +
        '</w:r>';
      const d = await open(await picDocx({body: '<w:p>' + alt +
        '</w:p>' + p(r('end'))}));
      const blk = blocks(d)[1];
      const x = blk.inlines[0];
      const out = freshDocPrs(d.doc, [blk]);
      const s = JSON.stringify(out[0].inlines[0].node);
      assert.notEqual(out[0].inlines[0].node, x.node);
      assert.equal((s.match(/\["id","8"\]/g) || []).length, 2, s);
      assert.doesNotMatch(s, /\["id","7"\]/);
    });

  it('dropped: VML, a linked picture, a missing part, an extension ' +
    'not carried: nothing, as today', async () => {
    const vml = '<w:p><w:r><w:pict><v:rect xmlns:v="urn:schemas-' +
      'microsoft-com:vml"/></w:pict></w:r></w:p>';
    const src = await open(await picDocx({pics: [
      {embed: null, link: 'rId40'}, {bytes: null}, {ext: 'xyz'}],
    body: vml}));
    assert.equal(pics(src).length, 2, 'the linked one is not one');
    const dst = await open(await picDocx({pics: [], body: p(r('x'))}));
    const {parts, rels} = dst.doc;
    copyPaste(src, all(src), dst, end(dst));
    assert.equal(pics(dst).length, 0);
    assert.equal(dst.doc.parts, parts);
    assert.equal(dst.doc.rels, rels);
    assert.ok(blocks(dst).every((b) => !Object.keys(b.inlines).length));
  });

  it('caps: 1000 pictures, 200 MB, 20 MB each', async () => {
    assert.equal(MAX_PICS, 1000);
    assert.equal(MAX_PIC_BYTES, 209715200);
    const many = await open(await picDocx({pics: Array.from(
      {length: 1001}, () => ({}))}));
    const s = slice(many.doc, all(many));
    assert.equal(s.pics.size, 1000);
    assert.ok(!s.pics.has('rId1011'), 'the last one dropped');
    const dst = await open(await picDocx({pics: [], body: p(r('x'))}));
    copyPaste(many, all(many), dst, end(dst));
    assert.equal(pics(dst).length, 1000);
    assert.equal(media(dst).length, 1000);
    // 15 of 20 MB (300 MB), and one of 20 MB + 1
    const big = await open(await picDocx({pics: Array.from(
      {length: 16}, () => ({}))}));
    const ps = new Map(big.doc.parts);
    for (let k = 1; k <= 16; k++) {
      ps.set(`word/media/image${k}.png`,
        new Uint8Array(20971520 + (k === 1 ? 1 : 0)));
    }
    big.doc.parts = ps;
    const got = picsOf(big.doc, blocks(big));
    assert.equal(got.size, 10);
    assert.ok(!got.has('rId11'), 'over 20 MB');
    assert.deepEqual([...got.keys()], Array.from({length: 10},
      (_, i) => 'rId' + (12 + i)));
  });

  it('hostile: an embed __proto__, a part name with ..', async () => {
    const src = await open(await picDocx({pics: [
      {embed: '__proto__'}, {target: 'media/../media/x.y.PNG'}]}));
    src.doc.parts = new Map(src.doc.parts).set('word/media/x.y.PNG',
      pngBytes(2, 2));
    assert.equal(pics(src).length, 2);
    const got = picsOf(src.doc, blocks(src));
    assert.deepEqual([...got.keys()], ['__proto__', 'rId12']);
    assert.equal(got.get('rId12').ext, 'png');
    const dst = await open(await picDocx());
    copyPaste(src, all(src), dst, end(dst));
    assert.deepEqual(media(dst), ['word/media/image1.png',
      'word/media/image2.png', 'word/media/image3.png']);
    assert.equal(({}).bytes, undefined);
    assert.ok(dst.doc.rels.every((x) => /^rId\d+$/.test(x.id)));
    const {back} = await written(dst);
    assert.equal(pics(back).length, 3);
  });

  it('a jpg keeps its extension; names skip any extension taken',
    async () => {
      const src = await open(await picDocx({pics: [
        {target: 'media/photo.JPG'}]}));
      src.doc.parts = new Map(src.doc.parts).set('word/media/photo.JPG',
        jpegBytes(1, 1));
      const dst = await open(await picDocx({pics: [{},
        {ext: 'gif', target: 'media/image2.gif'}]}));
      dst.doc.parts = new Map(dst.doc.parts).set('word/media/image2.gif',
        pngBytes(1, 1));
      copyPaste(src, all(src), dst, end(dst));
      assert.ok(dst.doc.parts.has('word/media/image3.jpg'),
        media(dst).join());
      await written(dst);
    });
});

// ------------------------------------------------ review B7, round 1

const A14 = 'http://schemas.microsoft.com/office/drawing/2010/main';
const ASVG = 'http://schemas.microsoft.com/office/drawing/2016/SVG/main';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const HL = `<a:hlinkClick xmlns:a="${A_NS}" r:id="rId11"/>`;
const BLIP = '<a:blip r:embed="rId11"/>';
/** [name, edit of the picture's XML] for each other r: reference. */
const REFS = [
  ['svgBlip', (s) => s.replace(BLIP, '<a:blip r:embed="rId11">' +
    '<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}">' +
    `<asvg:svgBlip xmlns:asvg="${ASVG}" r:embed="rId11"/></a:ext>` +
    '</a:extLst></a:blip>')],
  ['imgLayer', (s) => s.replace(BLIP, '<a:blip r:embed="rId11">' +
    '<a:extLst><a:ext uri="{BEBA8EAE-BF5A-486C-A8C5-ECC9F3942E4B}">' +
    `<a14:imgProps xmlns:a14="${A14}"><a14:imgLayer r:embed="rId11"/>` +
    '</a14:imgProps></a:ext></a:extLst></a:blip>')],
  ['docPr hlinkClick', (s) => s.replace(/(<wp:docPr [^>]*)\/>/,
    `$1>${HL}</wp:docPr>`)],
  ['cNvPr hlinkClick', (s) => s.replace(/(<pic:cNvPr [^>]*)\/>/,
    `$1>${HL}</pic:cNvPr>`)],
  ['cNvPr hlinkHover', (s) => s.replace(/(<pic:cNvPr [^>]*)\/>/,
    `$1>${HL.replace('hlinkClick', 'hlinkHover')}</pic:cNvPr>`)],
  ['r:link beside r:embed', (s) => s.replace(BLIP,
    '<a:blip r:embed="rId11" r:link="rId11"/>')],
];
/** A source: picture 1 plain, then one picture edited by `edit`. */
const refDocx = (edit, o = {}) => picDocx({...o, body: p('<w:r>' +
  edit(drawingXml({id: 5, embed: 'rId11', decl: false,
    strict: o.strict})) + '</w:r>') + p(r('end'))});

describe('ClipPics: review B7 fixes', () => {
  for (const [name, edit] of REFS) {
    it('C1: a picture with another relationship reference (' + name +
      ') does not go to another document', async () => {
      const src = await open(await refDocx(edit));
      const dst = await open(await picDocx({pics: [],
        body: p(r('x'))}));
      copyPaste(src, all(src), dst, end(dst));
      const got = pics(dst);
      assert.equal(got.length, 1, 'only the plain picture');
      assert.equal(got[0].info.docPrId, 1);
      assert.doesNotMatch(JSON.stringify(dst.doc.sections),
        /hlink|svgBlip|imgLayer|r:link/);
      await written(dst);
    });
  }

  it('C1: within one document such a picture is pasted as it is',
    async () => {
      const d = await open(await refDocx(REFS[0][1]));
      const node = blocks(d)[1].inlines[0].node;
      copyPaste(d, SEL(d, 1, 0, 1, 1), d, end(d), true);
      const last = blocks(d).at(-1);
      const x = last.inlines[last.text.length - 1];
      const s = JSON.stringify(x.node);
      assert.match(s, /svgBlip/);
      assert.equal(s, JSON.stringify(node).replace('["id","5"]',
        '["id","6"]'));
    });

  /** The a:srcRect attributes of the last picture pasted into dst. */
  const rectOf = (main) => {
    const all = [...main.matchAll(/<[\w]*:?srcRect\b[^>]*>/g)];
    return all.length ? all.at(-1)[0] : null;
  };

  it('I1: a crop into a Strict document is written in percent and ' +
    'passes the Strict schema type', async () => {
    const src = await open(await picDocx({pics: [{srcRect: {l: 12500,
      t: 1000, r: -500}}]}));
    const dst = await open(await picDocx({strict: true, pics: [],
      body: p(r('x'))}));
    copyPaste(src, all(src), dst, end(dst));
    assert.deepEqual({...pics(dst)[0].info.srcRect}, {l: 12500,
      t: 1000, r: -500, b: 0});
    const {back, main} = await written(dst);
    const rect = rectOf(main);
    assert.match(rect, /l="12.5%" t="1%" r="-0.5%"/);
    assert.deepEqual({...pics(back)[0].info.srcRect}, {l: 12500,
      t: 1000, r: -500, b: 0});
    strictRectValid(rect);
  });

  it('I1: a Strict percent crop into a Transitional document is ' +
    'written as integers', async () => {
    const src = await open(await picDocx({strict: true, pics: [
      {srcRect: {l: '12.5%', b: '0.125%'}}]}));
    assert.deepEqual({...pics(src)[0].info.srcRect}, {l: 12500, t: 0,
      r: 0, b: 125});
    const dst = await open(await picDocx({pics: [], body: p(r('x'))}));
    copyPaste(src, all(src), dst, end(dst));
    assert.deepEqual({...pics(dst)[0].info.srcRect}, {l: 12500, t: 0,
      r: 0, b: 125});
    const {back, main} = await written(dst);
    assert.match(rectOf(main), /l="12500" b="125"/);
    assert.equal(pics(back)[0].info.srcRect.l, 12500);
  });

  it('I1: a crop that is not valid is dropped when converted',
    async () => {
      for (const rect of [{l: 'abc'}, {l: 60000, r: 60000},
        {l: 200000}]) {
        const src = await open(await picDocx({pics: [{srcRect: rect}]}));
        const dst = await open(await picDocx({strict: true, pics: [],
      body: p(r('x'))}));
        copyPaste(src, all(src), dst, end(dst));
        assert.equal(pics(dst).length, 1);
        const {main} = await written(dst);
        assert.equal(rectOf(main), null, JSON.stringify(rect));
      }
    });

  it('I2: stale content-type entries and relationship targets are ' +
    'names in use; the search goes past them', async () => {
    const src = await open(await picDocx());
    const dst = await open(await picDocx({pics: [], body: p(r('x'))}));
    const ct = dst.doc.meta.contentTypes;
    const ov = [...ct.overrides];
    for (let k = 1; k <= 1100; k++) {
      ov.push([`/word/media/image${k}.png`, 'image/png']);
    }
    dst.doc.meta = {...dst.doc.meta, contentTypes: {...ct,
      overrides: ov}};
    dst.doc.rels = [...dst.doc.rels, {id: 'rId900', type:
      'http://schemas.openxmlformats.org/officeDocument/2006/' +
      'relationships/image', target: 'media/image1101.gif',
      attrs: []}];
    copyPaste(src, all(src), dst, end(dst));
    assert.deepEqual(media(dst), ['word/media/image1102.png']);
  });

  /** A paste as ./EditClip runs it: a RangeError pastes the text. */
  function pasteOrText(src, sel, dst, at, same = false) {
    try {
      return ['blocks', copyPaste(src, sel, dst, at, same)];
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      return ['text', e.message];
    }
  }

  it('M1: no docPr id left, no media name free: the paste is ' +
    'refused whole (text instead), nothing changed', async () => {
    const big = picDocx({pics: [{id: 2147483647}], body: p(r('x'))});
    const cases = [
      ['ids, another document', await open(await picDocx()),
        await open(await big), false, 'ids'],
      ['ids, the same document', null, await open(await big), true,
        'ids'],
    ];
    const odd = await open(await picDocx({pics: [], body: p(r('x'))}));
    odd.doc.parts = new Map(odd.doc.parts).set('word/media',
      new Uint8Array(1));
    cases.push(['no name', await open(await picDocx()), odd, false,
      'name']);
    for (const [what, s, dst, same, why] of cases) {
      const src = s || dst;
      const {parts, rels} = dst.doc;
      const before = structuredClone(dst.doc);
      const sel = same ? SEL(dst, 0, 0, 0, 1) : all(src);
      const [route, msg] = pasteOrText(src, sel, dst, end(dst), same);
      assert.deepEqual([route, msg], ['text', why], what);
      assert.equal(dst.undoDepth, 0, what + ': no undo step');
      assert.equal(dst.doc.parts, parts, what);
      assert.equal(dst.doc.rels, rels, what);
      assert.deepStrictEqual(dst.doc, before, what);
    }
  });

  it('M2: the store keeps at most 256 MB of pictures, dropping the ' +
    'oldest copies whole', () => {
    const store = new ClipStore();
    const MB = 1024 * 1024;
    const slice = (n, text) => ({blocks: [{type: 'p', text, runs: [],
      inlines: {}, pPr: {extra: []}}], plain: text,
    pics: new Map([['rId1', {bytes: new Uint8Array(n * MB),
      ext: 'png'}]])});
    const a = store.put(slice(150, 'a'), 1);
    const t = store.put({blocks: [{type: 'p', text: 't', runs: [],
      inlines: {}, pPr: {extra: []}}], plain: 't'}, 1);
    assert.ok(store.get(a) && store.get(t));
    const b = store.put(slice(100, 'b'), 1);
    assert.ok(!!store.get(a) && !!store.get(b), '250 MB: both kept');
    const c = store.put(slice(10, 'c'), 1);
    assert.equal(store.get(a) === null, true, 'the oldest dropped');
    assert.ok(store.get(t) && store.get(b) && store.get(c));
  });
});

/** The Strict schema type of a:srcRect's values (ST_Percentage). */
function strictRectValid(rect) {
  let ok;
  try {
    execFileSync('xmllint', ['--version'], {stdio: 'ignore'});
    ok = existsSync(join(CACHE, 'shared-commonSimpleTypes.xsd'));
  } catch {
    ok = false;
  }
  if (!ok) return;
  const S = 'http://schemas.openxmlformats.org/officeDocument/2006/' +
    'sharedTypes';
  const D = 'http://purl.oclc.org/ooxml/drawingml/main';
  const dir = mkdtempSync(join(tmpdir(), 'clippics-xsd-'));
  try {
    writeFileSync(join(dir, 's.xsd'), readFileSync(join(CACHE,
      'shared-commonSimpleTypes.xsd')));
    const at = ['l', 't', 'r', 'b'].map((k) => '<xs:attribute name="' +
      k + '" type="s:ST_Percentage"/>').join('');
    writeFileSync(join(dir, 'x.xsd'), '<xs:schema xmlns:xs="http://' +
      `www.w3.org/2001/XMLSchema" xmlns:s="${S}" targetNamespace=` +
      `"${D}" elementFormDefault="qualified"><xs:import namespace=` +
      `"${S}" schemaLocation="s.xsd"/><xs:element name="srcRect">` +
      `<xs:complexType>${at}</xs:complexType></xs:element></xs:schema>`);
    const el = rect.replace(/^<([\w]*:)?srcRect/, '<srcRect xmlns="' +
      D + '"').replace(/\s[\w]+:[\w]+="[^"]*"/g, '');
    writeFileSync(join(dir, 'p.xml'), el);
    execFileSync('xmllint', ['--noout', '--nonet', '--schema',
      join(dir, 'x.xsd'), join(dir, 'p.xml')], {stdio: 'pipe'});
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
}

describe('ClipPics: final review fixes', () => {
  /** Insert a picture, copy it (store entry), undo the insert. */
  async function insertCopyUndo(bytes) {
    const {insert} = await import(
      '../../tools/moreapps/!Word/InsertPicture');
    const d = await open(await picDocx({pics: [], body: p(r('hello'))}));
    const sel = insert(d, C(d, 0, 5), {bytes});
    const store = new ClipStore();
    const s = slice(d.doc, sel);
    const token = store.put(s, 1);
    const html = toHtml(d.doc, s, {token});
    d.undo();
    assert.equal(media(d).length, 0, 'the undo took the media back');
    return {d, insert, x: pick({text: s.plain, html}, {store,
      docKey: 1, parseHtml: null})};
  }

  it('A1: insert, copy, undo, paste in the same document: the ' +
    'picture carries its bytes, one undo step, a clean package',
  async () => {
    const bytes = pngBytes(4, 2);
    const {d, insert, x} = await insertCopyUndo(bytes);
    assert.equal(x.route, 'exact');
    assert.equal(x.opts.sameDoc, true);
    assert.equal(d.undoDepth, 0);
    const before = structuredClone(d.doc);
    pasteBlocks(d, end(d), x.blocks, x.opts);
    assert.equal(d.undoDepth, 1, 'one undo step');
    const [q] = pics(d);
    const m = mediaOf(d.doc, q.info.embed);
    assert.ok(m, 'the pasted picture resolves');
    assert.equal(m.bytes, bytes, 'its own bytes');
    await written(d);
    insert(d, end(d), {bytes: pngBytes(8, 8)});
    const now = pics(d);
    assert.equal(now.length, 2);
    assert.equal(mediaOf(d.doc, now[0].info.embed).bytes, bytes,
      'a later insert does not take its place');
    assert.notEqual(now[0].info.embed, now[1].info.embed);
    assert.notEqual(now[0].info.docPrId, now[1].info.docPrId);
    await written(d);
    d.undo();
    d.undo();
    assert.deepStrictEqual(d.doc, before);
  });

  it('A1: the same document with the media still there: shared, ' +
    'as before', async () => {
    const {insert} = await import(
      '../../tools/moreapps/!Word/InsertPicture');
    const d = await open(await picDocx({pics: [], body: p(r('hello'))}));
    const sel = insert(d, C(d, 0, 5), {bytes: pngBytes(4, 2)});
    const {parts, rels} = d.doc;
    copyPaste(d, sel, d, end(d), true);
    assert.equal(d.doc.parts, parts, 'no new part');
    assert.equal(d.doc.rels, rels, 'no new relationship');
    const now = pics(d);
    assert.equal(now[0].info.embed, now[1].info.embed);
    assert.notEqual(now[0].info.docPrId, now[1].info.docPrId);
  });
});
