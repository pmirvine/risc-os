// The noteRef inline (Batch E2): footnote and endnote marks in
// body paragraphs, tables and notes read as modelled inlines,
// written back as they were, one object character like the raw
// inline they replace.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {slice} from '../../tools/moreapps/!Letters/ClipSlice';
import {toHtml} from '../../tools/moreapps/!Letters/ClipHtml';
import {pasteBlocks} from '../../tools/moreapps/!Letters/ClipPaste';
import {checkBlock, checkInlines} from
  '../../tools/moreapps/!Letters/ModelCheck';
import {count} from '../../tools/moreapps/!Letters/WordCount';
import {facts} from '../../tools/moreapps/!Letters/Info';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {buildDocx, documentXml, p, r, REL, R_NS, W_NS}
  from './build-docx.mjs';
import {blocks, SEL, C, P} from './edit-docs.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const dec = (b) => new TextDecoder().decode(b);
const REF = '<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/>' +
  '</w:rPr><w:footnoteReference w:id="2"/></w:r>';
const FOOT = (id, body) => `<w:footnote w:id="${id}">${body}</w:footnote>`;
const NOTES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  `\n<w:footnotes xmlns:w="${W_NS}" xmlns:r="${R_NS}">` +
  FOOT(2, p('<w:r><w:footnoteRef/></w:r>' + r(' the note'))) +
  '</w:footnotes>';

async function load(body, extra = {}) {
  const parts = {'word/document.xml': documentXml(body), ...extra};
  const docRels = [];
  if (parts['word/footnotes.xml']) docRels.push(['rIdN1',
    REL('footnotes'), 'footnotes.xml']);
  const bytes = await buildDocx(parts, {docRels});
  return {bytes, doc: await readDocx(bytes)};
}
const body0 = (doc) => doc.sections[0].blocks;

describe('noteRef read', () => {
  it('a footnote reference in a run becomes a noteRef with its id ' +
    'and the run formatting', async () => {
    const {doc} = await load(p(r('a') + REF + r('b')));
    const para = body0(doc)[0];
    assert.equal(para.text, 'a￼b');
    const x = para.inlines[1];
    assert.equal(x.kind, 'noteRef');
    assert.equal(x.note, 'footnote');
    assert.equal(x.id, 2);
    assert.equal(x.level, 'r');
    assert.equal(x.node.name, 'w:footnoteReference');
    assert.equal(para.runs[1].rStyle, 'FootnoteReference');
    checkBlock(para);
  });
  it('an endnote reference likewise', async () => {
    const {doc} = await load(p('<w:r><w:endnoteReference w:id="7"/>' +
      '</w:r>'));
    const x = body0(doc)[0].inlines[0];
    assert.equal(x.kind, 'noteRef');
    assert.equal(x.note, 'endnote');
    assert.equal(x.id, 7);
  });
  it('the note own mark (w:footnoteRef) becomes noteRef self:true',
    async () => {
      const {doc} = await load(p(r('x')), {
        'word/footnotes.xml': NOTES});
      const n = doc.notes.footnotes.get(2);
      const x = n.blocks[0].inlines[0];
      assert.equal(x.kind, 'noteRef');
      assert.equal(x.note, 'footnote');
      assert.equal(x.self, true);
      assert.equal(x.id, null);
      checkBlock(n.blocks[0]);
    });
  it('custom mark text is kept (customMarkFollows)', async () => {
    const {doc, bytes} = await load(p('<w:r><w:footnoteReference ' +
      'w:customMarkFollows="1" w:id="3"/><w:t>*</w:t></w:r>'));
    const para = body0(doc)[0];
    assert.equal(para.text, '￼');
    assert.equal(para.inlines[0].kind, 'noteRef');
    assert.equal(para.inlines[0].custom, '*');
    const out = await writeDocx(doc, {date: DATE});
    const x = dec((await readZip(out)).get('word/document.xml'));
    assert.ok(x.includes('<w:footnoteReference w:customMarkFollows=' +
      '"1" w:id="3"/><w:t>*</w:t>'));
    assert.ok(bytes);
  });
  it('a custom mark whose text cannot be tied stays opaque',
    async () => {
      const {doc} = await load(p('<w:r><w:footnoteReference ' +
        'w:customMarkFollows="1" w:id="3"/></w:r>'));
      assert.equal(body0(doc)[0].inlines[0].kind, 'raw');
    });
  it('a reference in a header or text box stays opaque', async () => {
    const tb = '<w:r><w:pict><w:txbxContent>' + p(REF) +
      '</w:txbxContent></w:pict></w:r>';
    const {doc} = await load(p(tb));
    const x = body0(doc)[0].inlines[0];
    assert.equal(x.kind, 'raw');
    const hdr = `<?xml version="1.0"?><w:hdr xmlns:w="${W_NS}">` +
      p(REF) + '</w:hdr>';
    const bytes = await buildDocx({'word/document.xml':
      documentXml(p(r('a'))), 'word/header1.xml': hdr}, {docRels: [[
      'rIdH1', REL('header'), 'header1.xml']]});
    const d2 = await readDocx(bytes);
    const st = [...d2.stories.values()][0];
    assert.equal(st.blocks[0].inlines[0].kind, 'raw');
  });
  it('a reference in a table cell is modelled', async () => {
    const tbl = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="100"/>' +
      '</w:tblGrid><w:tr><w:tc>' + p(REF) + '</w:tc></w:tr></w:tbl>';
    const {doc} = await load(tbl + p(''));
    const c = body0(doc)[0].rows[0].cells[0].blocks[0];
    assert.equal(c.inlines[0].kind, 'noteRef');
  });
  it('a non-integer id keeps the opaque inline', async () => {
    for (const id of ['x', '', '1.5', '-1', '99999999999']) {
      const {doc} = await load(p('<w:r><w:footnoteReference w:id="' +
        id + '"/></w:r>'));
      assert.equal(body0(doc)[0].inlines[0].kind, 'raw', id);
    }
  });
  it('the paragraph writes back byte-identical', async () => {
    const t = (x) => `<w:r><w:t>${x}</w:t></w:r>`;
    const body = p(t('a') + REF + t('b') + '<w:r><w:rPr><w:b/></w:rPr>' +
      '<w:endnoteReference w:id="1"/></w:r>');
    const {doc} = await load(body);
    const out = await writeDocx(doc, {date: DATE});
    const x = dec((await readZip(out)).get('word/document.xml'));
    assert.ok(x.includes(body), x);
  });
});

describe('noteRef in editing', () => {
  const make = async () => {
    const {doc} = await load(p(r('ab') + REF + r('cd')));
    return new Document(doc);
  };
  it('splitting and merging runs around a noteRef keep it',
    async () => {
      const d = await make();
      d.apply({op: 'splitBlock', block: [0, 0], at: 3});
      assert.equal(blocks(d)[0].inlines[2].kind, 'noteRef');
      d.apply({op: 'mergeBlock', block: [0, 0]});
      const para = blocks(d)[0];
      assert.equal(para.inlines[2].kind, 'noteRef');
      assert.equal(para.text, 'ab￼cd');
      checkBlock(para);
      d.apply({op: 'splitBlock', block: [0, 0], at: 2});
      assert.equal(blocks(d)[1].inlines[0].kind, 'noteRef');
    });
  it('copy/paste of a slice with a noteRef whose note is not there: ' +
    'the mark is not pasted (clipnotes.test.mjs: notes carried)',
  async () => {
    const d = await make();
    const s = slice(d.doc, SEL(d, 0, 1, 0, 4));
    assert.equal(s.plain.includes('￼'), false);
    assert.equal(s.blocks[0].inlines[1].kind, 'noteRef');
    assert.equal(s.blocks[0].inlines[1].id, 2);
    assert.ok(!toHtml(d.doc, s).includes('\ufffc'));
    pasteBlocks(d, C(d, 0, 5), s.blocks, {sameDoc: true,
      styleNames: s.styleNames, styles: s.styles, lists: s.lists,
      pics: s.pics, picScope: s.picScope});
    assert.equal(s.notes, undefined);
    const para = P(d, 0);
    const refs = Object.values(para.inlines);
    assert.equal(refs.length, 1);
    assert.equal(para.text, 'ab\ufffccdbc');
    checkBlock(para);
  });
  it('counts as one object character, not a word, and in Info',
    async () => {
      const d = await make();
      const para = P(d, 0);
      assert.equal(para.text.length, 5);
      // the same count as with a raw inline in its place
      const raw = structuredClone(d.doc);
      const q = raw.sections[0].blocks[0];
      q.inlines[2] = {...q.inlines[2], kind: 'raw'};
      for (const k of ['words', 'chars', 'charsNoSpaces'])
        assert.equal(count(d.doc, null)[k], count(raw, null)[k]);
      const f = facts(d.doc);
      assert.ok(JSON.stringify([...f.kinds]).includes('footnote'));
    });
});

describe('ModelCheck noteRef', () => {
  const ok = (extra) => ({kind: 'noteRef', note: 'footnote', id: 1,
    level: 'r', node: {name: 'w:footnoteReference', attrs: [],
      children: []}, ...extra});
  it('accepts and rejects', () => {
    checkInlines('￼', {0: ok()});
    checkInlines('￼', {0: ok({note: 'endnote', id: 9})});
    checkInlines('￼', {0: ok({self: true, id: null})});
    checkInlines('￼', {0: ok({custom: '*'})});
    for (const bad of [{note: 'x'}, {id: 1.5}, {id: '1'}, {id: null},
      {level: 'p'}, {node: null}, {custom: 5}, {self: false},
      {id: 2147483648},
      {custom: 'a', customNode: {name: 'w:t', attrs: [],
        children: ['b']}}]) {
      assert.throws(() => checkInlines('￼', {0: ok(bad)}),
        RangeError, JSON.stringify(bad));
    }
  });
});
