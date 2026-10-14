// StoryWrite: header and footer stories written back (Batch D P6.2,
// D10), through DocxWrite: untouched stories as their very bytes,
// changed ones from the model, new ones at a free name with their
// content type, removed ones dropped with their rel and .rels.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {writeStory, freeName, storiesOut}
  from '../../tools/moreapps/!Letters/StoryWrite';
import {readStory} from '../../tools/moreapps/!Letters/StoryRead';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx, newDoc, DocxError}
  from '../../tools/moreapps/!Letters/DocxWrite';
import {newPara} from '../../tools/moreapps/!Letters/Model';
import {addRel} from '../../tools/moreapps/!Letters/DocParts';
import {strictScope} from '../../tools/moreapps/!Letters/Ns';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {p, r, relsXml, REL, W_NS, STRICT_W_NS}
  from './build-docx.mjs';
import {hdrXml, withHeaders, freeze} from './story-fixtures.mjs';
import {lintPackage} from './lint-package.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const write = (doc) => writeDocx(doc, {date: DATE});
const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder().decode(b);
const NOMAP = new Map();
const H = 'word/header1.xml';
const HR = 'word/_rels/header1.xml.rels';
const RELS = relsXml([['rId1', REL('image'), 'media/image1.png']]);
// a header with a comment before its root, extra declarations and
// an attribute, so that the prolog and the root's attributes show
const ODD = '<?xml version="1.0" encoding="UTF-8"?>\n<!-- kept -->\n' +
  `<w:hdr xmlns:w="${W_NS}" xmlns:mc="http://schemas.openxmlformats.` +
  'org/markup-compatibility/2006" xmlns:x="urn:x" mc:Ignorable="x">' +
  p(r('one')) + p(r('two')) + '<w:sdt><w:sdtContent>' + p(r('in')) +
  '</w:sdtContent></w:sdt></w:hdr>';

const errors = (zip) => lintPackage(zip).problems
  .filter((q) => q.level === 'error')
  .map((q) => q.rule + ' ' + q.part + ' ' + q.detail);

async function opened(hdrs = {default: p(r('head'))}, opts = {}) {
  return freeze(await readDocx(await withHeaders(p(r('body')), hdrs,
    opts)));
}

/** `doc` with story `name` replaced by fn(story). */
function edit(doc, name, fn) {
  const stories = new Map(doc.stories);
  stories.set(name, fn(doc.stories.get(name)));
  return {...doc, stories};
}

const changed = (s, text = 'changed') =>
  ({...s, blocks: [newPara(text), ...s.blocks.slice(1)]});

describe('writeStory', () => {
  it('untouched: the very bytes object', () => {
    const s = readStory(H, enc(ODD), NOMAP, null);
    assert.equal(writeStory(s, NOMAP), s.bytes);
    // a new blocks array holding the same objects is still untouched
    assert.equal(writeStory({...s, blocks: s.blocks.slice()}, NOMAP),
      s.bytes);
  });

  it('one paragraph changed: from the model, root and prolog kept',
    () => {
      const s = readStory(H, enc(ODD), NOMAP, null);
      const out = writeStory(changed(s), NOMAP);
      assert.notEqual(out, s.bytes);
      const text = dec(out);
      assert.ok(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>'),
        text.slice(0, 60));
      assert.ok(text.includes('<!-- kept -->'));
      const x = parseXml(text);
      assert.equal(x.root.name, 'w:hdr');
      assert.deepEqual(x.root.attrs, s.root.attrs);
      const back = readStory(H, out, NOMAP, null);
      assert.deepEqual(back.blocks.map((b) => b.type),
        ['p', 'p', 'opaque']);
      assert.equal(back.blocks[0].text, 'changed');
      assert.equal(back.blocks[1].text, 'two');
      assert.equal(back.blocks[2].node.name, 'w:sdt');
    });

  it('a changed table and an emptied story are written', () => {
    const tbl = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/>' +
      '</w:tblGrid><w:tr><w:tc>' + p(r('c')) + '</w:tc></w:tr>' +
      '</w:tbl>';
    const s = readStory(H, enc(hdrXml(tbl)), NOMAP, null);
    assert.equal(s.blocks[0].type, 'tbl');
    const out = writeStory({...s, blocks: [newPara('x'), s.blocks[0]]},
      NOMAP);
    const back = readStory(H, out, NOMAP, null);
    assert.deepEqual(back.blocks.map((b) => b.type), ['p', 'tbl']);
    // emptied: one empty w:p (CT_HdrFtr needs a block; P6 fix I3)
    const none = writeStory({...s, blocks: []}, NOMAP);
    const e = readStory(H, none, NOMAP, null).blocks;
    assert.deepEqual(e.map((b) => [b.type, b.text]), [['p', '']]);
  });

  it('forced (no bytes): written from the model', () => {
    const s = readStory(H, enc(ODD), NOMAP, null);
    const out = writeStory({...s, bytes: null}, NOMAP);
    assert.notEqual(out, s.bytes);
    assert.equal(readStory(H, out, NOMAP, null).blocks.length, 3);
  });

  it('a new story (no prolog, no root w): the standard declaration, ' +
    'xmlns:w added', () => {
    const s = {part: H, kind: 'ftr', root: {name: 'w:ftr', attrs: []},
      blocks: [newPara('f')], orig: [], rels: null, relsPart: null};
    const text = dec(writeStory(s, NOMAP));
    assert.ok(text.startsWith('<?xml version="1.0" encoding="UTF-8" ' +
      'standalone="yes"?>'), text.slice(0, 60));
    assert.ok(text.includes(`xmlns:w="${W_NS}"`));
    assert.equal(readStory(H, enc(text), NOMAP, null).kind, 'ftr');
  });

  it('Strict: a changed story is written Strict', () => {
    const xml = hdrXml(p(r('s')), {ns: STRICT_W_NS});
    const m = strictScope(NOMAP);
    const s = readStory(H, enc(xml), m, null);
    const text = dec(writeStory(changed(s), m));
    assert.ok(text.includes(STRICT_W_NS));
    assert.ok(!text.includes(W_NS));
    assert.equal(readStory(H, enc(text), m, null).blocks[0].text,
      'changed');
  });

  it('w bound to another namespace: refused (unsupported)', () => {
    const s = {part: H, kind: 'hdr', root: {name: 'w:hdr',
      attrs: [['xmlns:w', 'urn:other']]}, blocks: [newPara('x')],
    orig: [], rels: null, relsPart: null};
    assert.throws(() => writeStory(s, NOMAP),
      (e) => e instanceof DocxError && e.code === 'unsupported');
  });

  it('readStory refuses a root that binds w elsewhere (stays bytes)',
    () => {
      const xml = '<x:hdr xmlns:x="' + W_NS + '" xmlns:w="urn:o">' +
        '<x:p/></x:hdr>';
      assert.equal(readStory(H, enc(xml), NOMAP, null), null);
    });
});

describe('freeName', () => {
  const doc = (names, extra = {}) => ({parts: new Map(names.map((n) =>
    [n, new Uint8Array(1)])), stories: new Map(),
  meta: {mainPart: 'word/document.xml', ...extra}});

  it('N past every existing part of that kind', () => {
    assert.equal(freeName(doc([]), 'hdr'), 'word/header1.xml');
    assert.equal(freeName(doc(['word/header1.xml', 'word/header7.xml',
      'word/footer9.xml']), 'hdr'), 'word/header8.xml');
    assert.equal(freeName(doc(['word/header1.xml', 'word/footer2.xml']),
      'ftr'), 'word/footer3.xml');
    assert.equal(freeName(doc(['word/Header4.XML']), 'header'),
      'word/header5.xml');
  });

  it('stories, zipOrder and storyParts count; the main part folder',
    () => {
      const d = doc([], {zipOrder: ['word/header3.xml'],
        storyParts: ['word/header5.xml']});
      d.stories = new Map([['word/header4.xml', {}]]);
      assert.equal(freeName(d, 'hdr'), 'word/header6.xml');
      const o = doc(['x/header2.xml'], {mainPart: 'x/main.xml'});
      assert.equal(freeName(o, 'hdr'), 'x/header3.xml');
    });

  it('absurd names and numbers', () => {
    const big = 'word/header' + '9'.repeat(40) + '.xml';
    const n = freeName(doc([big, 'word/header2.xml', 'word/header-1.xml',
      'word/header.xml', 'word/header1e9.xml', 'word/__proto__']), 'hdr');
    assert.equal(n, 'word/header3.xml');
    assert.equal(freeName(doc(['word/header999999999.xml']), 'hdr'),
      'word/header1000000000.xml');
    for (const k of ['', 'odd', '__proto__', null, 1]) {
      assert.throws(() => freeName(doc([]), k), RangeError);
    }
  });
});

describe('DocxWrite with stories', () => {
  it('untouched: every header and footer and its .rels byte-identical',
    async () => {
      const src = await withHeaders(p(r('b')), {default: {hdr: p(r('h')),
        ftr: p(r('f'))}, first: p(r('1'))}, {parts: {[HR]: RELS,
        'word/media/image1.png': new Uint8Array([137, 80, 78, 71])}});
      const z0 = await readZip(src);
      const doc = freeze(await readDocx(src));
      assert.equal(doc.stories.size, 3);
      const z = await readZip(await write(doc));
      for (const n of ['word/header1.xml', 'word/header2.xml',
        'word/footer1.xml', HR]) {
        assert.equal(Buffer.compare(z.get(n), z0.get(n)), 0, n);
      }
    });

  it('one paragraph changed: that part from the model, the rest bytes',
    async () => {
      const doc = await opened({default: {hdr: p(r('h')),
        ftr: p(r('f'))}});
      const src = await write(doc);
      const z0 = await readZip(src);
      const out = await write(edit(doc, H, (s) => changed(s, 'new')));
      const z = await readZip(out);
      assert.notEqual(Buffer.compare(z.get(H), z0.get(H)), 0);
      assert.equal(Buffer.compare(z.get('word/footer1.xml'),
        z0.get('word/footer1.xml')), 0);
      const back = await readDocx(out);
      assert.equal(back.stories.get(H).blocks[0].text, 'new');
      assert.deepEqual(errors(z), []);
    });

  it('.rels: bytes unless rels changed', async () => {
    const doc = await opened({default: p(r('h'))}, {parts: {[HR]: RELS,
      'word/media/image1.png': new Uint8Array([1])}});
    const src = await readZip(await withHeaders(p(r('body')),
      {default: p(r('h'))}, {parts: {[HR]: RELS}}));
    // a changed story with rels as read: .rels bytes kept
    let z = await readZip(await write(edit(doc, H, (s) => changed(s))));
    assert.equal(Buffer.compare(z.get(HR), src.get(HR)), 0);
    // a new relationship: .rels written from the model
    z = await readZip(await write(edit(doc, H, (s) => ({...s,
      rels: addRel(s.rels, {kind: 'hyperlink', target: 'http://x/',
        external: true}).rels}))));
    const x = parseXml(dec(z.get(HR)));
    assert.deepEqual(x.root.children.map((c) => c.attrs.find(
      ([k]) => k === 'Id')[1]), ['rId1', 'rId2']);
    assert.equal((await readDocx(await write(edit(doc, H, (s) => ({...s,
      rels: addRel(s.rels, {kind: 'image', target: 'media/image1.png'})
        .rels}))))).stories.get(H).rels.length, 2);
  });

  it('a new story: free name, rel, content type by PartTypes.repairs',
    async () => {
      const base = newDoc({date: DATE});
      const name = freeName(base, 'hdr');
      assert.equal(name, 'word/header1.xml');
      const {rels, id} = addRel(base.rels, {kind: 'header',
        target: 'header1.xml'});
      const story = {part: name, kind: 'hdr',
        root: {name: 'w:hdr', attrs: []}, blocks: [newPara('new hdr')],
        orig: [], rels: [], relsPart: null};
      const doc = freeze({...base, rels,
        stories: new Map([[name, story]])});
      const z = await readZip(await write(doc));
      assert.ok(z.has(name));
      // no relationships: no .rels part
      assert.ok(!z.has('word/_rels/header1.xml.rels'));
      const ct = dec(z.get('[Content_Types].xml'));
      assert.match(ct, new RegExp('<Override PartName="/word/header1' +
        '\\.xml" ContentType="application/vnd\\.openxmlformats-' +
        'officedocument\\.wordprocessingml\\.header\\+xml"/>'));
      assert.deepEqual(errors(z), []);
      const back = await readDocx(await write(doc));
      assert.ok(back.rels.some((x) => x.id === id));
      assert.equal(back.stories.get(name).blocks[0].text, 'new hdr');
    });

  it('a new story with relationships gets its .rels', async () => {
    const base = newDoc({date: DATE});
    const name = freeName(base, 'ftr');
    const {rels} = addRel(base.rels, {kind: 'footer',
      target: 'footer1.xml'});
    const own = addRel([], {kind: 'hyperlink', target: 'http://x/',
      external: true}).rels;
    const story = {part: name, kind: 'ftr',
      root: {name: 'w:ftr', attrs: []}, blocks: [newPara('f')],
      orig: [], rels: own, relsPart: null};
    const z = await readZip(await write({...base, rels,
      stories: new Map([[name, story]])}));
    assert.ok(z.has('word/_rels/footer1.xml.rels'));
    assert.deepEqual(errors(z), []);
  });

  it('a removed story: part, rel, .rels and Override gone; lint clean',
    async () => {
      const doc = await opened({default: {hdr: p(r('h')),
        ftr: p(r('f'))}}, {parts: {[HR]: RELS,
        'word/media/image1.png': new Uint8Array([137, 80, 78, 71])}});
      assert.deepEqual(doc.meta.storyParts,
        ['word/header1.xml', 'word/footer1.xml']);
      const stories = new Map(doc.stories);
      stories.delete(H);
      // the command (D14) removes the section's reference; the writer
      // drops the part, its relationship and its .rels
      const s0 = doc.sections[0];
      const extra = s0.props.extra.filter((n) =>
        !/headerReference$/.test(n.name));
      const sections = [{...s0, props: {...s0.props, extra}}];
      const out = await write({...doc, stories, sections});
      const z = await readZip(out);
      assert.ok(!z.has(H));
      assert.ok(!z.has(HR));
      assert.ok(z.has('word/footer1.xml'));
      // media it used are kept (D10)
      assert.ok(z.has('word/media/image1.png'));
      const rels = dec(z.get('word/_rels/document.xml.rels'));
      assert.ok(!rels.includes('header1.xml'), rels);
      assert.ok(rels.includes('footer1.xml'));
      assert.ok(!dec(z.get('[Content_Types].xml')).includes('header1'));
      assert.deepEqual(errors(z), []);
      const back = await readDocx(out);
      assert.deepEqual([...back.stories.keys()], ['word/footer1.xml']);
      assert.deepEqual(back.meta.storyParts, ['word/footer1.xml']);
    });

  it('storiesOut: nothing to drop leaves the rels array as given',
    async () => {
      const doc = await opened();
      const rels = doc.rels.slice();
      const o = storiesOut(doc, rels, NOMAP);
      assert.equal(o.rels, rels);
      assert.equal(o.drop.size, 0);
      assert.equal(o.parts.get(H), doc.stories.get(H).bytes);
    });

  it('a bad story is refused as bad-model', async () => {
    const doc = await opened();
    const bad = edit(doc, H, (s) => ({...s, blocks: [{type: 'p'}]}));
    await assert.rejects(write(bad),
      (e) => e instanceof DocxError && e.code === 'bad-model');
    const odd = edit(doc, H, (s) => ({...s, kind: 'note'}));
    await assert.rejects(write(odd),
      (e) => e instanceof DocxError && e.code === 'bad-model');
  });

  it('Strict document: untouched bytes; a changed story Strict',
    async () => {
      const doc = await opened({default: p(r('h'))}, {strict: true});
      const z0 = await readZip(await write(doc));
      const src = await readZip(await withHeaders(p(r('body')),
        {default: p(r('h'))}, {strict: true}));
      assert.equal(Buffer.compare(z0.get(H), src.get(H)), 0);
      const z = await readZip(await write(edit(doc, H, (s) =>
        changed(s))));
      const t = dec(z.get(H));
      assert.ok(t.includes(STRICT_W_NS) && !t.includes(W_NS), t);
    });
});
