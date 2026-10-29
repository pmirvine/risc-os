// Notes (Batch E2): the footnotes and endnotes parts read as notes
// (NoteRead), written back (NoteWrite): an untouched part as its
// bytes, a changed note rewritten from its blocks, a part that
// cannot be modelled left as bytes, odd ids never throwing.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readNotes, readAllNotes} from
  '../../tools/moreapps/!Letters/NoteRead';
import {notesTree, notesOut, readNotesOf} from
  '../../tools/moreapps/!Letters/NoteWrite';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkNotes} from '../../tools/moreapps/!Letters/ModelCheck';
import {emptyDoc, newPara, emptyNotes} from
  '../../tools/moreapps/!Letters/Model';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {serialize} from '../../tools/moreapps/!WimpLib/Xml';
import {buildDocx, documentXml, p, r, REL, W_NS, R_NS, STRICT_W_NS,
  STRICT_R_NS, STRICT_REL} from './build-docx.mjs';
import {freeze} from './story-fixtures.mjs';
import {corpusFiles, nameOf, ALL, SKIP_CORPUS, hash}
  from './roundtrip-lib.mjs';

const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder().decode(b);
const DATE = new Date(2024, 4, 6, 7, 8, 10);
const NOMAP = new Map();

const fn = (attrs, body) => `<w:footnote ${attrs}>${body}</w:footnote>`;
const SEPS =
  fn('w:type="separator" w:id="-1"', p('<w:r><w:separator/></w:r>')) +
  fn('w:type="continuationSeparator" w:id="0"',
    p('<w:r><w:continuationSeparator/></w:r>'));
const notesXml = (inner, root = 'footnotes', ns = W_NS) => DECL +
  `<w:${root} xmlns:w="${ns}" xmlns:r="${R_NS}">${inner}</w:${root}>`;
const FN = notesXml(SEPS + fn('w:id="1"', p(r('one'))) +
  fn('w:id="2" w:rsid="00AB"', p(r('two')) + p(r('more'))));
const BODY = p(r('text'));

/** A .docx with the given notes parts. */
function docx(foot, end, extra = {}, opts = {}) {
  const parts = {'word/document.xml': documentXml(BODY, opts.ns),
    ...extra};
  const rel = opts.strict ? STRICT_REL : REL;
  const docRels = [];
  if (foot !== null && foot !== undefined) {
    parts['word/footnotes.xml'] = foot;
    docRels.push(['rIdN1', rel('footnotes'), 'footnotes.xml']);
  }
  if (end !== null && end !== undefined) {
    parts['word/endnotes.xml'] = end;
    docRels.push(['rIdN2', rel('endnotes'), 'endnotes.xml']);
  }
  return buildDocx(parts, {docRels, strict: opts.strict});
}

const save = (doc) => writeDocx(doc, {date: DATE});
const part = async (bytes, n) => (await readZip(bytes)).get(n);

describe('readNotes', () => {
  it('reads separators and normal notes with their types', () => {
    const bytes = enc(FN);
    const res = readNotes('word/footnotes.xml', bytes, NOMAP, null);
    assert.ok(res);
    assert.equal(res.kind, 'footnote');
    assert.deepEqual(res.order, [-1, 0, 1, 2]);
    assert.deepEqual([...res.notes.values()].map((n) => n.type),
      ['separator', 'continuationSeparator', 'normal', 'normal']);
    const two = res.notes.get(2);
    assert.equal(two.kind, 'footnote');
    assert.equal(two.id, 2);
    assert.equal(two.blocks.length, 2);
    assert.equal(two.blocks[0].text, 'two');
    assert.equal(two.node.name, 'w:footnote');
    assert.equal(two.rels, null);
    two.orig.forEach((b, i) => assert.equal(b, two.blocks[i]));
    assert.notEqual(two.orig, two.blocks);
    assert.equal(res.bytes, bytes);
    assert.deepEqual(res.raw, []);
    assert.equal(res.root.name, 'w:footnotes');
  });

  it('an unknown or missing type is normal; endnotes read', () => {
    const e = notesXml(fn('w:id="3" w:type="weird"', p()) +
      fn('w:id="4"', p()), 'endnotes').replace(/w:footnote/g,
      'w:endnote');
    const res = readNotes('word/endnotes.xml', enc(e), NOMAP, null);
    assert.equal(res.kind, 'endnote');
    assert.equal(res.notes.get(3).type, 'normal');
    assert.equal(res.notes.get(4).kind, 'endnote');
  });

  it('a note holds the .rels of its part', () => {
    const rel = enc(DECL + '<Relationships xmlns="http://schemas.' +
      'openxmlformats.org/package/2006/relationships"><Relationship ' +
      'Id="rId1" Type="x" Target="y"/></Relationships>');
    const res = readNotes('word/footnotes.xml', enc(FN), NOMAP, rel,
      {relsPart: 'word/_rels/footnotes.xml.rels'});
    assert.equal(res.rels.length, 1);
    assert.equal(res.notes.get(1).rels, res.rels);
    assert.equal(res.notes.get(1).relsPart,
      'word/_rels/footnotes.xml.rels');
  });
});

describe('a part the reader cannot model stays bytes', () => {
  const read = (xml, opts) =>
    readNotes('word/footnotes.xml', typeof xml === 'string'
      ? enc(xml) : xml, NOMAP, null, opts);
  it('is null, never a throw', () => {
    assert.equal(read('<w:footnotes'), null);
    assert.equal(read(new Uint8Array(0)), null);
    assert.equal(read('not xml at all'), null);
    assert.equal(read(notesXml(fn('w:id="1"', p()), 'hdr')), null);
    assert.equal(read(notesXml(fn('w:id="1"', p() +
      '<w:sectPr/>'))), null);
    assert.equal(readNotes('word/footnotes.xml', 'text', NOMAP, null),
      null);
    assert.equal(read(notesXml(fn('w:id="1"', p()), 'footnotes',
      'http://example.com/other')), null);
    assert.equal(read(FN, {maxXmlBytes: 20}), null);
    assert.equal(read(FN, {maxElements: 5}), null);
    assert.equal(read(FN, {maxParagraphs: 2}), null);
  });
  it('keeps the part in doc.parts and the marks opaque', async () => {
    const bad = notesXml(fn('w:id="1"', p() + '<w:sectPr/>'));
    const mark = '<w:r><w:footnoteReference w:id="1"/></w:r>';
    const bytes = await buildDocx({
      'word/document.xml': documentXml(p(mark)),
      'word/footnotes.xml': bad},
    {docRels: [['rIdN1', REL('footnotes'), 'footnotes.xml']]});
    const doc = await readDocx(bytes);
    assert.equal(doc.notes.footnotes.size, 0);
    assert.deepEqual(doc.meta.noteParts, {});
    assert.ok(doc.parts.has('word/footnotes.xml'));
    assert.equal(doc.sections[0].blocks[0].inlines.p, undefined);
    const out = await save(doc);
    assert.equal(dec(await part(out, 'word/footnotes.xml')), bad);
  });
});

describe('writing notes', () => {
  it('untouched notes parts are written as read (tree, string)',
    async () => {
      const bytes = await docx(FN, FN.replace(/footnote/g, 'endnote')
        .replace(/endnotes xmlns/, 'endnotes xmlns'));
      const doc = await readDocx(bytes);
      assert.deepEqual(doc.meta.noteParts, {footnotes:
        'word/footnotes.xml', endnotes: 'word/endnotes.xml'});
      assert.equal(doc.notes.footnotes.size, 4);
      assert.equal(doc.notes.endnotes.size, 4);
      const out = await save(doc);
      assert.deepEqual(await part(out, 'word/footnotes.xml'),
        await part(bytes, 'word/footnotes.xml'));
      // the tree itself writes the same text, note by note
      const tree = notesTree(doc, 'footnotes');
      const text = serialize(tree, {decl: null, before: [], after: []});
      const per = [...doc.notes.footnotes.values()]
        .map((n) => serialize(n.node, {decl: null, before: [],
          after: []})).join('');
      assert.ok(text.includes(per));
      assert.equal(tree.children.length, 4);
      assert.equal(notesTree(doc, 'endnotes').name, 'w:endnotes');
    });

  it('a copy of the Doc with untouched notes writes the bytes',
    async () => {
      const doc = await readDocx(await docx(FN, null));
      const copy = {...doc, notes: {...doc.notes,
        footnotes: new Map(doc.notes.footnotes)}};
      const out = await save(copy);
      assert.deepEqual(await part(out, 'word/footnotes.xml'),
        enc(FN));
    });

  it('a changed note is rewritten and keeps unknown attributes ' +
    'and children', async () => {
    const odd = notesXml(SEPS + fn('w:id="1" w:rsid="00AB" ' +
      'x:flag="y" xmlns:x="urn:x"', p(r('keep')) +
      '<w:sdt><w:sdtContent/></w:sdt>') +
      fn('w:id="2"', p(r('other'))));
    const doc = await readDocx(await docx(odd, null));
    const note = doc.notes.footnotes.get(1);
    assert.equal(note.blocks[1].type, 'opaque');
    const blocks = [newPara('changed'), note.blocks[1]];
    const notes = {...doc.notes, footnotes: new Map(
      doc.notes.footnotes).set(1, {...note, blocks})};
    const out = await save({...doc, notes});
    const text = dec(await part(out, 'word/footnotes.xml'));
    assert.match(text, /<w:footnote [^>]*w:rsid="00AB"/);
    assert.match(text, /x:flag="y"/);
    assert.match(text, /<w:sdt>/);
    assert.match(text, /changed/);
    assert.ok(!text.includes('keep'));
    // the other notes are their nodes, the part is read again whole
    const back = await readDocx(out);
    assert.deepEqual([...back.notes.footnotes.keys()], [-1, 0, 1, 2]);
    assert.equal(back.notes.footnotes.get(1).blocks[0].text, 'changed');
    assert.equal(back.notes.footnotes.get(2).blocks[0].text, 'other');
    assert.equal(back.notes.footnotes.get(0).type,
      'continuationSeparator');
  });

  it('a changed type is written; a note with no node is made',
    async () => {
      const doc = await readDocx(await docx(FN, null));
      const m = new Map(doc.notes.footnotes);
      m.set(2, {...m.get(2), type: 'continuationNotice'});
      m.set(7, {kind: 'footnote', id: 7, type: 'normal',
        blocks: [newPara('new')], rels: null, relsPart: null,
        orig: [], node: null});
      const notes = {...doc.notes, footnotes: m,
        order: {...doc.notes.order, footnotes: [...doc.notes.order
          .footnotes, 7]}};
      checkNotes(notes);
      const back = await readDocx(await save({...doc, notes}));
      assert.equal(back.notes.footnotes.get(2).type,
        'continuationNotice');
      assert.equal(back.notes.footnotes.get(7).blocks[0].text, 'new');
      assert.deepEqual(back.notes.footnotes.get(7).type, 'normal');
    });

  it('an empty note gets one empty paragraph', async () => {
    const doc = await readDocx(await docx(FN, null));
    const m = new Map(doc.notes.footnotes);
    m.set(1, {...m.get(1), blocks: []});
    const out = await save({...doc, notes: {...doc.notes,
      footnotes: m}});
    const back = await readDocx(out);
    assert.equal(back.notes.footnotes.get(1).blocks.length, 1);
  });

  it('never mutates a live Doc', async () => {
    const doc = freeze(await readDocx(await docx(FN, null)));
    const m = new Map(doc.notes.footnotes);
    m.set(1, {...m.get(1), blocks: [newPara('z')]});
    await save({...doc, notes: {...doc.notes, footnotes: m}});
    await save(doc);
  });

  it('a Doc made elsewhere may omit notes', async () => {
    const d = emptyDoc();
    assert.deepEqual(readNotesOf({}).footnotes, new Map());
    delete d.notes;
    const out = await save(d);
    assert.ok(out.length > 0);
    checkNotes(undefined);
    assert.equal(notesOut({meta: {}, notes: undefined}).parts.size, 0);
  });
});

describe('odd ids', () => {
  it('duplicate ids: first wins, the others kept raw', async () => {
    const x = notesXml(SEPS + fn('w:id="1"', p(r('first'))) +
      fn('w:id="1"', p(r('second'))) + fn('w:id="2"', p(r('c'))));
    const doc = await readDocx(await docx(x, null));
    assert.equal(doc.notes.footnotes.get(1).blocks[0].text, 'first');
    assert.deepEqual(doc.notes.order.footnotes, [-1, 0, 1, 2]);
    assert.equal(doc.notes.raw.footnotes.length, 1);
    assert.equal(doc.notes.raw.footnotes[0].at, 3);
    const m = new Map(doc.notes.footnotes);
    m.set(2, {...m.get(2), blocks: [newPara('edit')]});
    const out = await save({...doc, notes: {...doc.notes,
      footnotes: m}});
    const text = dec(await part(out, 'word/footnotes.xml'));
    assert.ok(text.indexOf('second') < text.indexOf('edit'));
    assert.ok(text.indexOf('first') < text.indexOf('second'));
    assert.deepEqual(await part(await save(doc), 'word/footnotes.xml'),
      enc(x));
  });

  it('non-integer, missing, huge and __proto__ ids do not throw',
    async () => {
      const bad = ['w:id="x"', '', 'w:id="__proto__"',
        'w:id="99999999999999999999"', 'w:id="1.5"', 'w:id=""',
        'w:id="-"', 'w:id=" 3"'];
      const x = notesXml(bad.map((a) => fn(a, p(r('t')))).join('') +
        fn('w:id="5"', p(r('ok'))) + '<w:other/>');
      const doc = await readDocx(await docx(x, null));
      assert.deepEqual([...doc.notes.footnotes.keys()], [5]);
      assert.equal(doc.notes.raw.footnotes.length, bad.length + 1);
      assert.equal(Object.getPrototypeOf(doc.notes.footnotes), Map.prototype);
      assert.deepEqual(await part(await save(doc), 'word/footnotes.xml'),
        enc(x));
      const m = new Map(doc.notes.footnotes);
      m.set(5, {...m.get(5), blocks: [newPara('e')]});
      const out = await save({...doc, notes: {...doc.notes,
        footnotes: m}});
      const text = dec(await part(out, 'word/footnotes.xml'));
      assert.match(text, /w:id="__proto__"/);
      assert.match(text, /<w:other\/>/);
      assert.equal((text.match(/<w:footnote[ >]/g) || []).length,
        bad.length + 1);
    });

  it('-0 and 007 are the ids 0 and 7', () => {
    const res = readNotes('word/footnotes.xml', enc(notesXml(
      fn('w:id="-0"', p()) + fn('w:id="007"', p()) +
      fn('w:id="0"', p()))), NOMAP, null);
    assert.deepEqual(res.order, [0, 7]);
    assert.equal(res.raw.length, 1);
    assert.ok(Object.is(res.order[0], 0));
  });
});

describe('Strict document notes', () => {
  it('reads Strict notes and writes an untouched one as read, a ' +
    'changed one Strict', async () => {
    const x = notesXml(SEPS + fn('w:id="1"', p(r('s'))), 'footnotes',
      STRICT_W_NS).replace(R_NS, STRICT_R_NS);
    const bytes = await docx(x, null, {}, {strict: true,
      ns: {ns: STRICT_W_NS, rNs: STRICT_R_NS}});
    const doc = await readDocx(bytes);
    assert.equal(doc.meta.conformance, 'strict');
    assert.equal(doc.notes.footnotes.get(1).blocks[0].text, 's');
    assert.deepEqual(await part(await save(doc), 'word/footnotes.xml'),
      enc(x));
    const m = new Map(doc.notes.footnotes);
    m.set(1, {...m.get(1), blocks: [newPara('ch')]});
    const out = await save({...doc, notes: {...doc.notes,
      footnotes: m}});
    const text = dec(await part(out, 'word/footnotes.xml'));
    assert.ok(text.includes(STRICT_W_NS));
    assert.ok(!text.includes(W_NS));
  });
});

describe('checkNotes', () => {
  it('refuses a malformed notes object', () => {
    checkNotes(emptyNotes());
    assert.throws(() => checkNotes({footnotes: new Map(),
      endnotes: 3}));
    assert.throws(() => checkNotes(5));
    const n = emptyNotes();
    n.footnotes.set(1, {kind: 'endnote', id: 1, type: 'normal',
      blocks: [], orig: []});
    assert.throws(() => checkNotes(n));
  });
});

describe('the corpus', {skip: corpusFiles().length ? false
  : SKIP_CORPUS}, () => {
  it('open/save leaves the notes parts unchanged', async () => {
    let docs = 0, modelled = 0, stayed = 0, notes = 0;
    const fails = [];
    for (const f of corpusFiles()) {
      const name = nameOf(f);
      const bytes = readFileSync(f);
      let doc;
      try {
        doc = await readDocx(bytes);
      } catch (e) {
        continue;
      }
      docs++;
      try {
        const out = await save(doc);
        const was = await readZip(bytes);
        const now = await readZip(out);
        for (const [slot, n] of Object.entries(doc.meta.noteParts)) {
          modelled++;
          notes += doc.notes[slot].size;
          const a = was.get(n);
          const b = now.get(n);
          if (!b || Buffer.compare(Buffer.from(a), Buffer.from(b)))
            fails.push(name + ': ' + n + ' changed');
        }
        for (const n of was.keys()) {
          if (/(^|\/)(footnotes|endnotes)\d*\.xml$/.test(n) &&
            !Object.values(doc.meta.noteParts).includes(n)) stayed++;
        }
      } catch (e) {
        fails.push(name + ': ' + e.message.slice(0, 200));
      }
    }
    console.log(`# notes corpus${ALL ? '' : ' (sample)'}: ${docs} read, ` +
      `${modelled} notes parts modelled (${notes} notes) and written ` +
      `unchanged, ${stayed} left as bytes, ${fails.length} failures`);
    for (const x of fails) console.log('# FAIL ' + x);
    assert.deepEqual(fails, []);
  });
});
