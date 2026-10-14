// StoryRead: header and footer parts read as stories (Batch D P6.1,
// D9), and DocxRead's doc.stories.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readStory, readStories, notStory, MAX_STORIES}
  from '../../tools/moreapps/!Letters/StoryRead';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {checkStory, emptyDoc, newPara}
  from '../../tools/moreapps/!Letters/Model';
import {strictScope} from '../../tools/moreapps/!Letters/Ns';
import {ids} from '../../tools/moreapps/!Letters/Walk';
import {buildDocx, documentXml, relsXml, p, r, REL, W_NS}
  from './build-docx.mjs';
import {hdrXml, ftrXml, withHeaders, freeze} from './story-fixtures.mjs';

const enc = (s) => new TextEncoder().encode(s);
const NOMAP = new Map();
const TBL = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/>' +
  '</w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>c</w:t></w:r></w:p></w:tc>' +
  '</w:tr></w:tbl>';
const SDT = '<w:sdt><w:sdtPr/><w:sdtContent>' + p(r('in')) +
  '</w:sdtContent></w:sdt>';
const HDR = hdrXml(p(r('one')) + p(r('two'), '<w:jc w:val="center"/>') +
  TBL + SDT);
const RELS = relsXml([['rId1', REL('image'), 'media/image1.png']]);
const story = (xml, opts) =>
  readStory('word/header1.xml', enc(xml), NOMAP, null, opts);

describe('readStory', () => {
  it('reads paragraphs, a table and an sdt as the body does', () => {
    const bytes = enc(HDR);
    const s = readStory('word/header1.xml', bytes, NOMAP, null);
    assert.ok(s);
    assert.deepEqual(s.blocks.map((b) => b.type),
      ['p', 'p', 'tbl', 'opaque']);
    assert.equal(s.blocks[0].text, 'one');
    assert.equal(s.blocks[1].pPr.jc, 'center');
    assert.equal(s.blocks[2].rows[0].cells[0].blocks[0].text, 'c');
    assert.equal(s.blocks[3].node.name, 'w:sdt');
    assert.equal(s.part, 'word/header1.xml');
    assert.equal(s.kind, 'hdr');
    assert.equal(s.root.name, 'w:hdr');
    assert.deepEqual(s.root.attrs, [['xmlns:w', W_NS],
      ['xmlns:r', REL('').slice(0, -1)]]);
    assert.match(s.prolog.decl, /version="1.0"/);
    assert.equal(s.bytes, bytes, 'the very bytes object');
    assert.notEqual(s.orig, s.blocks, 'orig is its own array');
    assert.equal(s.orig.length, s.blocks.length);
    s.orig.forEach((b, i) => assert.equal(b, s.blocks[i]));
    assert.equal(s.rels, null);
    assert.equal(s.relsPart, null);
    checkStory(s);
  });

  it('a footer is kind ftr; an empty one has no blocks', () => {
    const s = readStory('word/footer1.xml', enc(ftrXml(p(r('f')))),
      NOMAP, null);
    assert.equal(s.kind, 'ftr');
    assert.equal(s.root.name, 'w:ftr');
    assert.deepEqual(story(hdrXml('')).blocks, []);
  });

  it('parses its own .rels', () => {
    const s = readStory('word/header1.xml', enc(HDR), NOMAP,
      enc(RELS));
    assert.equal(s.rels.length, 1);
    assert.equal(s.rels[0].id, 'rId1');
    assert.equal(s.rels[0].target, 'media/image1.png');
    assert.equal(s.relsPart, 'word/_rels/header1.xml.rels');
    const t = readStory('x/h.xml', enc(HDR), NOMAP, enc(RELS),
      {relsPart: 'x/_rels/H.XML.rels'});
    assert.equal(t.relsPart, 'x/_rels/H.XML.rels');
  });

  it('a Strict scope reads Strict property names', () => {
    const s = readStory('word/header1.xml',
      enc(hdrXml(p('', '<w:ind w:start="720"/>'))),
      strictScope(NOMAP), null);
    assert.equal(s.blocks[0].pPr.ind.left, 720);
    const t = story(hdrXml(p('', '<w:ind w:start="720"/>')));
    assert.equal(t.blocks[0].pPr.ind, undefined, 'kept raw');
  });

  it('is null for bad XML, bad rels, bad bytes', () => {
    assert.equal(story('<w:hdr xmlns:w="' + W_NS + '"><w:p>'), null);
    assert.equal(story(''), null);
    assert.equal(readStory('word/header1.xml', enc(HDR), NOMAP,
      enc('<Relationships')), null);
    for (const b of [null, undefined, 'text', 42, {}, new Uint8Array()])
      assert.equal(readStory('word/header1.xml', b, NOMAP, null), null);
    assert.equal(readStory('word/header1.xml', new Uint8Array([0xff,
      0xfe, 0x3c]), NOMAP, null), null, 'odd UTF-16');
  });

  it('is null with a w:sectPr inside, at any depth', () => {
    const sp = '<w:sectPr><w:pgSz w:w="100" w:h="100"/></w:sectPr>';
    assert.equal(story(hdrXml(p(r('a')) + sp)), null, 'last child');
    assert.equal(story(hdrXml(sp + p(r('a')))), null, 'first child');
    assert.equal(story(hdrXml(p(r('a'), sp))), null, 'in a pPr');
    assert.equal(story(hdrXml(TBL.replace('<w:p>',
      '<w:p><w:pPr>' + sp + '</w:pPr>'))), null, 'in a cell');
    assert.equal(story(hdrXml(SDT.replace('<w:sdtContent>',
      '<w:sdtContent>' + sp))), null, 'in an sdt');
    // another namespace's sectPr is not one
    assert.ok(story(hdrXml('<x:sectPr xmlns:x="urn:x"/>')));
  });

  it('is null for an unknown root', () => {
    const doc = documentXml(p(r('a')));
    assert.equal(story(doc), null, 'w:document');
    assert.equal(story(hdrXml('').replace(/hdr/g, 'footnotes')), null);
    assert.equal(story(hdrXml('', {ns: 'urn:not-wml'})), null);
    assert.equal(story('<hdr/>'), null, 'no namespace');
    for (const n of ['__proto__', 'constructor', 'toString'])
      assert.equal(story(hdrXml('').replace(/hdr/g, n)), null, n);
  });

  it('caps: paragraphs, elements, bytes as the body', () => {
    const three = hdrXml(p(r('a')) + p(r('b')) + TBL);
    assert.ok(story(three, {maxParagraphs: 3}), 'at the cap');
    assert.equal(story(three, {maxParagraphs: 2}), null, 'one past');
    assert.equal(story(three, {maxParagraphs: 0}), null);
    assert.equal(story(three, {maxParagraphs: -1}), null);
    const n = (three.match(/<[^/!?]/g) || []).length;
    assert.ok(story(three, {maxElements: n}), 'elements at the cap');
    assert.equal(story(three, {maxElements: n - 1}), null);
    const b = enc(three).length;
    assert.ok(story(three, {maxXmlBytes: b}), 'bytes at the cap');
    assert.equal(story(three, {maxXmlBytes: b - 1}), null);
    assert.ok(story(three, {maxParagraphs: 1e9, maxElements: 1e9}));
  });

  it('absurd part names are only keys', () => {
    for (const n of ['__proto__', 'constructor', '', '../../x']) {
      const s = readStory(n, enc(HDR), NOMAP, enc(RELS));
      assert.equal(s.part, n);
    }
  });

  it('block ids come from nextId', () => {
    const before = newPara('x').id;
    const s = story(HDR);
    const after = newPara('y').id;
    const got = ids({sections: [{blocks: s.blocks}]});
    assert.equal(got.length, 4, 'two paragraphs, a table, a cell para');
    for (const id of got) assert.ok(id > before && id < after, id);
    assert.equal(new Set(got).size, got.length);
  });
});

describe('DocxRead: doc.stories', () => {
  it('an empty Map without headers; emptyDoc too', async () => {
    const doc = await readDocx(await buildDocx(
      {'word/document.xml': documentXml(p(r('a')))}));
    assert.ok(doc.stories instanceof Map);
    assert.equal(doc.stories.size, 0);
    assert.ok(emptyDoc().stories instanceof Map);
    assert.equal(emptyDoc().stories.size, 0);
  });

  it('every header and footer of the main rels is a story', async () => {
    const doc = await readDocx(await withHeaders(p(r('body')), {
      default: {hdr: p(r('dh')), ftr: p(r('df'))},
      first: {hdr: p(r('fh')), ftr: p(r('ff'))},
      even: {hdr: p(r('eh')), ftr: TBL}}, {titlePg: true}));
    assert.deepEqual([...doc.stories.keys()].sort(), [
      'word/footer1.xml', 'word/footer2.xml', 'word/footer3.xml',
      'word/header1.xml', 'word/header2.xml', 'word/header3.xml']);
    const h2 = doc.stories.get('word/header2.xml');
    assert.equal(h2.kind, 'hdr');
    assert.equal(h2.blocks[0].text, 'fh');
    assert.equal(doc.stories.get('word/footer3.xml').blocks[0].type,
      'tbl');
    for (const s of doc.stories.values()) {
      checkStory(s);
      assert.equal(doc.parts.get(s.part), s.bytes, 'bytes stay');
    }
    const body = ids({sections: doc.sections});
    const all = [...doc.stories.values()].flatMap((s) =>
      ids({sections: [{blocks: s.blocks}]}));
    assert.equal(new Set([...body, ...all]).size,
      body.length + all.length, 'ids unique against the body');
    assert.deepEqual(ids(doc), [...body, ...all],
      'ids(doc) covers the stories after the body (P6.3)');
  });

  it('reads a story\'s .rels; Strict parts', async () => {
    const z = await withHeaders(p(r('b')), {default: p(r('h',
      '<w:b/>'), '<w:ind w:start="360"/>')}, {strict: true, parts: {
      'word/_rels/header1.xml.rels': RELS}});
    const doc = await readDocx(z);
    const s = doc.stories.get('word/header1.xml');
    assert.equal(doc.meta.conformance, 'strict');
    assert.equal(s.blocks[0].pPr.ind.left, 360);
    assert.equal(s.blocks[0].runs[0].rPr.b, true);
    assert.equal(s.root.attrs[0][1], W_NS, 'mapped to transitional');
    assert.equal(s.rels[0].id, 'rId1');
    assert.equal(s.relsPart, 'word/_rels/header1.xml.rels');
    assert.ok(doc.parts.has(s.relsPart), '.rels bytes stay');
  });

  it('a part that is no story stays in parts only', async () => {
    const sp = '<w:sectPr/>';
    const doc = await readDocx(await withHeaders(p(r('b')), {
      default: {hdr: p(r('bad'), sp), ftr: p(r('good'))}}));
    assert.ok(doc.parts.has('word/header1.xml'));
    assert.equal(notStory(doc, 'word/header1.xml'), true);
    assert.equal(notStory(doc, 'word/footer1.xml'), false);
    assert.equal(notStory(doc, 'word/nothing.xml'), true);
    assert.equal(notStory({}, 'word/footer1.xml'), true);
  });

  it('skips external, missing, other-kind and repeated targets',
    async () => {
      const z = await buildDocx({
        'word/document.xml': documentXml(p(r('b'))),
        'word/header1.xml': hdrXml(p(r('h'))),
        'word/footnotes.xml': hdrXml('').replace(/hdr/g, 'footnotes'),
      }, {docRels: [
        ['rA', REL('header'), 'header1.xml'],
        ['rB', REL('header'), '/word/header1.xml'],
        ['rC', REL('header'), 'http://x/h.xml', 'External'],
        ['rD', REL('footer'), 'missing.xml'],
        ['rE', REL('footnotes'), 'footnotes.xml'],
        ['rF', REL('header'), '../../../x.xml'],
        ['rG', REL('footer'), 'document.xml'],
      ]});
      const doc = await readDocx(z);
      assert.deepEqual([...doc.stories.keys()], ['word/header1.xml']);
    });

  it('a frozen Doc with stories reads the same', async () => {
    const doc = freeze(await readDocx(await withHeaders(p(r('b')),
      {default: p(r('h'))})));
    assert.ok(Object.isFrozen(doc.stories.get('word/header1.xml')));
    assert.equal(doc.stories.get('word/header1.xml').blocks[0].text,
      'h');
  });

  it('at most MAX_STORIES parts are read', () => {
    const parts = new Map();
    const rels = [];
    for (let k = 0; k <= MAX_STORIES; k++) {
      parts.set('word/h' + k + '.xml', enc(hdrXml(p(r('x')))));
      rels.push({id: 'r' + k, type: REL('header'),
        target: 'h' + k + '.xml', attrs: []});
    }
    const got = readStories(parts, rels, 'word/document.xml', NOMAP);
    assert.equal(got.size, MAX_STORIES);
  });

  it('271 header and footer parts read in under 200 ms', async () => {
    const parts = {'word/document.xml': documentXml(p(r('b')))};
    const docRels = [];
    for (let k = 1; k <= 271; k++) {
      const h = k % 2 ? 'header' : 'footer';
      const xml = (k % 2 ? hdrXml : ftrXml)(p(r('Page ' + k)) +
        p(r('x'), '<w:pStyle w:val="Header"/>') + TBL);
      parts['word/' + h + k + '.xml'] = xml;
      docRels.push(['rId' + (100 + k), REL(h), h + k + '.xml']);
    }
    const z = await buildDocx(parts, {docRels});
    const times = [];
    for (let k = 0; k < 23; k++) {
      const t0 = performance.now();
      const doc = await readDocx(z);
      times.push(performance.now() - t0);
      assert.equal(doc.stories.size, 271);
    }
    const ms = times.slice(3).sort((a, b) => a - b)[10];
    assert.ok(ms < 200, 'median ' + ms.toFixed(1) + ' ms');
  });
});

describe('ModelCheck.checkStory', () => {
  it('refuses a malformed story', () => {
    const s = story(HDR);
    checkStory(s);
    for (const bad of [null, {...s, kind: 'x'},
      {...s, blocks: 'no'}, {...s, blocks: [{type: 'p'}]},
      {...s, root: null}, {...s, part: 3}, {...s, rels: 'x'},
      {...s, orig: null}]) {
      assert.throws(() => checkStory(bad), RangeError);
    }
  });
});
