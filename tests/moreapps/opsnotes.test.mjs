// The ops for footnotes and endnotes (Batch E2): addNote, removeNote,
// setNote, setNoteRels, setNoteOpts and setNotesPart, each with its
// inverse, applied through a Document (undo, redo, atomic). Every op
// is copy-on-write: doc.notes is a new object, a new Map for the kind
// that changes, the Note objects and the read snapshot as they were;
// order and the odd nodes (raw) kept in step. A kind whose part could
// not be modelled (bytes only) takes no new note; a document with no
// notes part gets one (NoteParts ensure) that Word can open.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkNotes, deepEqual}
  from '../../tools/moreapps/!Letters/ModelCheck';
import {newPara, OBJ} from '../../tools/moreapps/!Letters/Model';
import {versionOf} from '../../tools/moreapps/!Letters/DocVersion';
import {numbers, noteState}
  from '../../tools/moreapps/!Letters/NoteNumbers';
import {nextNoteId, newNote, noteOf, partRels}
  from '../../tools/moreapps/!Letters/OpsNotes';
import {ensure} from '../../tools/moreapps/!Letters/NoteParts';
import {read as readOpts, forSection, patchPr}
  from '../../tools/moreapps/!Letters/NoteOpts';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {serialize} from '../../tools/moreapps/!WimpLib/Xml';
import {buildDocx, documentXml, settingsXml, p, r, REL, W_NS, R_NS}
  from './build-docx.mjs';
import {noteDoc, noteP, mark, emark, enoteP} from './note-fixtures.mjs';
import {lintAfter} from './lint-after.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const save = (doc) => writeDocx(doc, {date: DATE});
const dec = (b) => new TextDecoder().decode(b);
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const fn = (attrs, body) => `<w:footnote ${attrs}>${body}</w:footnote>`;
const SEPS =
  fn('w:type="separator" w:id="-1"', p('<w:r><w:separator/></w:r>')) +
  fn('w:type="continuationSeparator" w:id="0"',
    p('<w:r><w:continuationSeparator/></w:r>'));

/** Three marked notes, a duplicate of note 2 (a raw node) between
 *  notes 2 and 3, settings and a section with its own footnotePr. */
async function rich() {
  const foot = DECL + `<w:footnotes xmlns:w="${W_NS}" ` +
    `xmlns:r="${R_NS}">` + SEPS + fn('w:id="1"', noteP('one')) +
    fn('w:id="2"', noteP('two')) + fn('w:id="2"', noteP('dup')) +
    fn('w:id="3"', noteP('three')) + '</w:footnotes>';
  const sect = '<w:sectPr><w:footnotePr><w:numFmt w:val="decimal"/>' +
    '<w:x14 w:val="keep"/></w:footnotePr></w:sectPr>';
  const body = p(r('a') + mark(1) + r('b') + mark(2)) +
    p(r('c') + mark(3)) + sect;
  const parts = {'word/document.xml': documentXml(body),
    'word/footnotes.xml': foot,
    'word/settings.xml': settingsXml('<w:footnotePr>' +
      '<w:pos w:val="pageBottom"/><w:footnote w:id="-1"/>' +
      '<w:footnote w:id="0"/></w:footnotePr>')};
  return readDocx(await buildDocx(parts, {docRels:
    [['rIdN1', REL('footnotes'), 'footnotes.xml']]}));
}

const F = 'footnote';
const fmap = (d) => d.doc.notes.footnotes;
const order = (d) => d.doc.notes.order.footnotes;
const rawAt = (d) => d.doc.notes.raw.footnotes.map((x) => x.at);
const para = (text) => newPara(text);
/** A paragraph op putting a footnote mark for id at the start of the
 *  body's first paragraph. */
const markOp = (id, note = 'footnote') => ({op: 'replaceText',
  block: [0, 0], at: 0, del: 0, ins: OBJ, inlines: {0: {kind:
    'noteRef', level: 'r', note, id, node: {name: 'w:' + note +
      'Reference', attrs: [['w:id', String(id)]], children: []}}}});
/** The state the tests compare: Maps, order, raw. */
const snap = (d) => ({notes: d.doc.notes,
  foot: new Map(fmap(d)), order: order(d).slice(),
  raw: d.doc.notes.raw.footnotes.slice()});
function sameAs(d, s) {
  assert.ok(deepEqual(fmap(d), s.foot), 'the Map');
  for (const [id, n] of s.foot) assert.equal(fmap(d).get(id), n,
    'note ' + id + ' the very object');
  assert.deepEqual(order(d), s.order, 'order');
  assert.equal(d.doc.notes.raw.footnotes.length, s.raw.length);
  d.doc.notes.raw.footnotes.forEach((x, k) => {
    assert.equal(x.node, s.raw[k].node);
    assert.equal(x.at, s.raw[k].at);
  });
  checkNotes(d.doc.notes);
}
/** Nothing changed and no step was made by fn (it throws). */
function refused(d, fn, what) {
  const s = snap(d), depth = d.undoDepth, v = versionOf(d.doc);
  assert.throws(fn, RangeError, what);
  assert.equal(d.doc.notes, s.notes, what + ': the same notes');
  assert.equal(d.undoDepth, depth, what + ': no step');
  assert.equal(versionOf(d.doc), v, what + ': no new version');
}

describe('addNote, removeNote', () => {
  it('add: a new Map, order, raw; undo and redo restore them',
    async () => {
      const d = new Document(await rich());
      const s0 = snap(d), read = d.doc.notes.read;
      const readMap = read.footnotes.notes;
      assert.deepEqual(order(d), [-1, 0, 1, 2, 3]);
      assert.deepEqual(rawAt(d), [4]);
      const id = nextNoteId(d.doc, F);
      assert.equal(id, 4);
      const n = newNote(d.doc, F, id, [para('new')]);
      const v0 = versionOf(d.doc);
      d.apply({op: 'addNote', kind: F, id, note: n, at: 3});
      assert.ok(versionOf(d.doc) > v0, 'a new version');
      assert.notEqual(d.doc.notes, s0.notes, 'a new notes object');
      assert.notEqual(fmap(d), s0.foot);
      assert.equal(s0.notes.footnotes.size, 5, 'the old Map unchanged');
      assert.equal(d.doc.notes.endnotes, s0.notes.endnotes,
        'the other kind shared');
      assert.equal(fmap(d).get(id), n, 'the note kept by reference');
      assert.deepEqual(order(d), [-1, 0, 1, 4, 2, 3]);
      assert.deepEqual(rawAt(d), [5], 'the odd node stays before 3');
      assert.equal(d.doc.notes.read, read, 'the snapshot untouched');
      assert.equal(read.footnotes.notes, readMap);
      checkNotes(d.doc.notes);
      const v1 = versionOf(d.doc);
      d.undo();
      assert.ok(versionOf(d.doc) > v1, 'undo bumps');
      sameAs(d, s0);
      const v2 = versionOf(d.doc);
      d.redo();
      assert.ok(versionOf(d.doc) > v2, 'redo bumps');
      assert.equal(fmap(d).get(id), n);
      assert.deepEqual(order(d), [-1, 0, 1, 4, 2, 3]);
      assert.deepEqual(rawAt(d), [5]);
    });

  it('remove: order and the odd node in step; undo puts the note ' +
    'back in its place, the file as read', async () => {
    const doc = await rich(), d = new Document(doc);
    const bytes0 = await save(doc);
    const s0 = snap(d), two = fmap(d).get(2);
    d.apply({op: 'removeNote', kind: F, id: 2});
    assert.ok(!fmap(d).has(2));
    assert.deepEqual(order(d), [-1, 0, 1, 3]);
    assert.deepEqual(rawAt(d), [3], 'the odd node stays before 3');
    assert.equal(s0.foot.get(2), two);
    checkNotes(d.doc.notes);
    d.undo();
    sameAs(d, s0);
    assert.deepEqual(await save(d.doc), bytes0, 'bytes as read');
    d.redo();
    assert.deepEqual(order(d), [-1, 0, 1, 3]);
    d.undo();
    sameAs(d, s0);
  });

  it('remove then add in other places: undo and redo every step',
    async () => {
      const d = new Document(await rich());
      const s0 = snap(d);
      d.apply({op: 'removeNote', kind: F, id: 1});
      d.apply({op: 'addNote', kind: F, id: 9, at: 0,
        note: newNote(d.doc, F, 9, [para('nine')])});
      d.apply({op: 'removeNote', kind: F, id: 3});
      d.apply({op: 'addNote', kind: F, id: 10,
        note: newNote(d.doc, F, 10, [para('ten')])});
      const s1 = snap(d);
      assert.deepEqual(order(d), [9, -1, 0, 2, 10]);
      checkNotes(d.doc.notes);
      while (d.canUndo) d.undo();
      sameAs(d, s0);
      while (d.canRedo) d.redo();
      sameAs(d, s1);
    });

  it('addNote and the mark in one d.atomic: one step, numbered; ' +
    'undo takes both away', async () => {
    const d = new Document(await rich());
    const s0 = snap(d), body0 = d.doc.sections[0].blocks[0];
    const id = nextNoteId(d.doc, F);
    d.atomic(() => {
      d.apply({op: 'addNote', kind: F, id,
        note: newNote(d.doc, F, id, [para('first now')])});
      d.apply(markOp(id));
    });
    assert.equal(d.undoDepth, 1);
    assert.equal(numbers(d.doc).footnotes.get(id), '1');
    assert.equal(numbers(d.doc).footnotes.get(1), '2', 'renumbered');
    d.undo();
    sameAs(d, s0);
    assert.ok(deepEqual(d.doc.sections[0].blocks[0], body0));
    assert.equal(numbers(d.doc).footnotes.get(id), undefined);
    assert.equal(numbers(d.doc).footnotes.get(1), '1');
  });

  it('a failing atomic leaves notes as they were, no step', async () => {
    const d = new Document(await rich());
    const s0 = snap(d);
    assert.throws(() => d.atomic(() => {
      d.apply({op: 'addNote', kind: F, id: 7,
        note: newNote(d.doc, F, 7, [para('x')])});
      d.apply({op: 'removeNote', kind: F, id: 99});
    }), RangeError);
    sameAs(d, s0);
    assert.equal(d.undoDepth, 0);
  });

  it('refused: a missing note, a duplicate id, bad ops; no step',
    async () => {
      const d = new Document(await rich());
      const n = (id) => newNote(d.doc, F, id, [para('x')]);
      refused(d, () => d.apply({op: 'removeNote', kind: F, id: 99}),
        'remove missing');
      refused(d, () => d.apply({op: 'setNote', kind: F, id: 99,
        patch: {type: 'normal'}}), 'set missing');
      refused(d, () => d.apply({op: 'addNote', kind: F, id: 2,
        note: n(2)}), 'duplicate');
      refused(d, () => d.apply({op: 'addNote', kind: F, id: 5,
        note: n(6)}), 'the note is another id');
      refused(d, () => d.apply({op: 'addNote', kind: 'endnote', id: 5,
        note: n(5)}), 'another kind');
      refused(d, () => d.apply({op: 'addNote', kind: F, id: 5,
        note: n(5), at: 99}), 'bad at');
      refused(d, () => d.apply({op: 'addNote', kind: F, id: 5,
        note: {...n(5), blocks: [{type: 'p'}]}}), 'bad block');
      const dupId = d.doc.sections[0].blocks[0].id;
      refused(d, () => d.apply({op: 'addNote', kind: F, id: 5,
        note: {...n(5), blocks: [{...para('x'), id: dupId}]}}),
      'a block id used in the body');
      refused(d, () => d.apply({op: 'addNote', kind: F, id: 5,
        note: {...n(5), rels: []}}), 'rels not the part\'s');
      refused(d, () => d.apply({op: 'setNote', kind: F, id: 1,
        patch: {}}), 'an empty patch');
      refused(d, () => d.apply({op: 'setNote', kind: F, id: 1,
        patch: {id: 4}}), 'a patch of the id');
      refused(d, () => d.apply({op: 'setNote', kind: F, id: 1,
        patch: {type: 'odd'}}), 'a bad type');
    });

  it('hostile kinds, ids and story keys are refused', async () => {
    const d = new Document(await rich());
    const n = newNote(d.doc, F, 5, [para('x')]);
    for (const kind of ['__proto__', 'constructor', 'footnotes', '',
      null, 1]) {
      refused(d, () => d.apply({op: 'addNote', kind, id: 5, note: n}),
        'kind ' + String(kind));
      refused(d, () => d.apply({op: 'removeNote', kind, id: 1}),
        'remove kind ' + String(kind));
    }
    for (const id of ['1', 1.5, NaN, Infinity, -Infinity, null,
      2 ** 53, '__proto__', 1e10]) {
      refused(d, () => d.apply({op: 'removeNote', kind: F, id}),
        'id ' + String(id));
      refused(d, () => d.apply({op: 'addNote', kind: F, id,
        note: {...n, id}}), 'add id ' + String(id));
    }
    const ins = (story) => () => d.apply({op: 'replaceText',
      block: [0, 0], at: 0, del: 0, ins: 'x', story});
    for (const story of [{note: {kind: '__proto__', id: 1}},
      {note: {kind: F, id: '1'}}, {note: {kind: F, id: 99}},
      {note: null}, {note: {kind: F}}, {}, [], 3,
      JSON.parse('{"__proto__": {"kind": "footnote", "id": 1}}')])
      refused(d, ins(story), 'story ' + JSON.stringify(story));
    assert.ok(!Object.prototype.kind, 'no prototype polluted');
  });
});

describe('removeNotes, addNotes: many notes in one op', () => {
  it('remove 1 and 3: order, raw, Map; undo gives the very notes, ' +
    'order and raw back; redo', async () => {
    const d = new Document(await rich());
    const s0 = snap(d), one = fmap(d).get(1), three = fmap(d).get(3);
    d.apply({op: 'removeNotes', kind: F, ids: [3, 1]});
    assert.deepEqual(order(d), [-1, 0, 2]);
    assert.deepEqual([...fmap(d).keys()], [-1, 0, 2]);
    assert.deepEqual(rawAt(d), [3], 'the odd node after note 2');
    assert.equal(s0.foot.size, 5, 'the old Map unchanged');
    checkNotes(d.doc.notes);
    d.undo();
    sameAs(d, s0);
    assert.equal(fmap(d).get(1), one);
    assert.equal(fmap(d).get(3), three);
    d.redo();
    assert.deepEqual(order(d), [-1, 0, 2]);
    assert.deepEqual(rawAt(d), [3]);
  });

  it('addNotes without raw: an odd node stays after the note before ' +
    'it, as addNote leaves it', async () => {
    const d = new Document(await rich());
    const a = newNote(d.doc, F, 7, [para('seven')]);
    const b = newNote(d.doc, F, 8, [para('eight')]);
    d.apply({op: 'addNotes', kind: F, notes: [a, b],
      order: [-1, 0, 1, 2, 7, 3, 8]});
    assert.deepEqual(order(d), [-1, 0, 1, 2, 7, 3, 8]);
    assert.deepEqual(rawAt(d), [4], 'after note 2, before the new 7');
    assert.equal(fmap(d).get(7), a);
    checkNotes(d.doc.notes);
    d.undo();
    assert.deepEqual(order(d), [-1, 0, 1, 2, 3]);
    assert.deepEqual(rawAt(d), [4]);
  });

  it('refused: a missing or repeated id, an order that is not the ' +
    'notes with the new ones, a note there already', async () => {
    const d = new Document(await rich());
    refused(d, () => d.apply({op: 'removeNotes', kind: F,
      ids: [1, 9]}), 'missing');
    refused(d, () => d.apply({op: 'removeNotes', kind: F,
      ids: [1, 1]}), 'repeated');
    refused(d, () => d.apply({op: 'removeNotes', kind: F,
      ids: '1'}), 'not an array');
    const a = newNote(d.doc, F, 7, [para('seven')]);
    refused(d, () => d.apply({op: 'addNotes', kind: F, notes: [a],
      order: [-1, 0, 1, 2, 3]}), 'order lacks 7');
    refused(d, () => d.apply({op: 'addNotes', kind: F, notes: [a],
      order: [-1, 0, 2, 1, 7, 3]}), 'order moves 1');
    refused(d, () => d.apply({op: 'addNotes', kind: F,
      notes: [fmap(d).get(1)], order: [-1, 0, 1, 1, 2, 3]}),
    'there already');
  });

  it('10,000 notes removed in one op: linear, not quadratic',
    async () => {
      const time = async (n) => {
        const d = new Document(await rich());
        const ids = [], notes = [], order = [-1, 0, 1, 2, 3];
        for (let k = 0; k < n; k++) {
          const id = 10 + k;
          ids.push(id);
          notes.push(newNote(d.doc, F, id, [para('n')]));
          order.push(id);
        }
        d.apply({op: 'addNotes', kind: F, notes, order});
        const t0 = performance.now();
        d.apply({op: 'removeNotes', kind: F, ids});
        d.undo();
        return performance.now() - t0;
      };
      await time(1000);
      const a = await time(1000), b = await time(10000);
      assert.ok(b / Math.max(a, 0.5) < 40, 'ratio ' + b / a);
    });
});

describe('nextNoteId', () => {
  it('max + 1 over the notes, the odd nodes and the marks, at least 1',
    async () => {
      const d = new Document(await rich());
      assert.equal(nextNoteId(d.doc, F), 4);
      assert.equal(nextNoteId(d.doc, 'endnote'), 1);
      d.apply(markOp(40));
      assert.equal(nextNoteId(d.doc, F), 41, 'a broken mark\'s id');
      d.undo();
      const odd = await noteDoc(p(r('x')), {}, {seps: false});
      assert.equal(nextNoteId(odd, F), 1, 'no notes: 1');
      assert.throws(() => nextNoteId(odd, '__proto__'), RangeError);
    });

  it('after an add is undone the id is taken again (the note is gone)',
    async () => {
      const d = new Document(await rich());
      const id = nextNoteId(d.doc, F);
      d.apply({op: 'addNote', kind: F, id,
        note: newNote(d.doc, F, id, [para('x')])});
      assert.equal(nextNoteId(d.doc, F), id + 1);
      d.undo();
      assert.equal(nextNoteId(d.doc, F), id);
    });
});

describe('setNote', () => {
  it('copy-on-write: a new Note; the old one, the snapshot as they ' +
    'were; the edited note rewritten, the others as read', async () => {
    const doc = await rich(), d = new Document(doc);
    const before = dec((await readZip(await save(doc)))
      .get('word/footnotes.xml'));
    const old = fmap(d).get(2), oldBlocks = old.blocks;
    const read = d.doc.notes.read.footnotes.notes.get(2);
    const q = {...oldBlocks[0], text: 'TWO', runs: [{start: 0, end: 3,
      rPr: {extra: []}}], inlines: {}};
    d.apply({op: 'setNote', kind: F, id: 2, patch: {blocks: [q]}});
    const now = fmap(d).get(2);
    assert.notEqual(now, old);
    assert.equal(old.blocks, oldBlocks, 'the old Note unchanged');
    assert.equal(now.node, old.node);
    assert.equal(now.orig, old.orig);
    assert.equal(fmap(d).get(1), d.doc.notes.read.footnotes.notes.get(1));
    assert.equal(d.doc.notes.read.footnotes.notes.get(2), read);
    assert.deepEqual(order(d), [-1, 0, 1, 2, 3]);
    const xml = dec((await readZip(await save(d.doc)))
      .get('word/footnotes.xml'));
    assert.match(xml, /TWO/);
    assert.doesNotMatch(xml, />two</);
    for (const id of [1, 3]) {
      const node = serialize(d.doc.notes.read.footnotes.notes.get(id)
        .node);
      assert.ok(xml.includes(node), 'note ' + id + ' as read');
    }
    assert.match(xml, / dup</, 'the odd node kept');
    d.undo();
    assert.equal(fmap(d).get(2), old, 'undo: the very Note back');
    const again = dec((await readZip(await save(d.doc)))
      .get('word/footnotes.xml'));
    assert.equal(again, before);
    d.redo();
    assert.equal(fmap(d).get(2).blocks[0].text, 'TWO');
  });

  it('type: changed and undone', async () => {
    const d = new Document(await rich());
    d.apply({op: 'setNote', kind: F, id: 3,
      patch: {type: 'continuationNotice'}});
    assert.equal(fmap(d).get(3).type, 'continuationNotice');
    d.undo();
    assert.equal(fmap(d).get(3).type, 'normal');
  });
});

describe('setNoteRels: one rels array for the whole part', () => {
  it('every note of the kind takes it; undo gives the old one back',
    async () => {
      const d = new Document(await rich());
      const was = partRels(d.doc, F);
      const rels = [{id: 'rId9', type: REL('hyperlink'),
        target: 'http://example.invalid/', mode: 'External',
        attrs: [['Id', 'rId9'], ['Type', REL('hyperlink')],
          ['Target', 'http://example.invalid/'],
          ['TargetMode', 'External']]}];
      d.apply({op: 'setNoteRels', kind: F, rels});
      for (const n of fmap(d).values()) assert.equal(n.rels, rels);
      assert.equal(partRels(d.doc, F), rels);
      const z = await readZip(await save(d.doc));
      assert.match(dec(z.get('word/_rels/footnotes.xml.rels')),
        /example\.invalid/);
      const id = nextNoteId(d.doc, F);
      d.apply({op: 'addNote', kind: F, id,
        note: newNote(d.doc, F, id, [para('x')])});
      assert.equal(fmap(d).get(id).rels, rels, 'a new note shares it');
      d.undo();
      d.undo();
      for (const n of fmap(d).values()) assert.equal(n.rels, was);
      assert.throws(() => d.apply({op: 'setNoteRels', kind: F,
        rels: 'x'}), RangeError);
    });
});

describe('bytes only and no part', () => {
  it('a kind whose part could not be read takes no note', async () => {
    const bad = DECL + `<w:footnotes xmlns:w="${W_NS}">` +
      '<w:footnote w:id="1"><w:p><w:sectPr/></w:p></w:footnote>' +
      '</w:footnotes>';
    const doc = await readDocx(await buildDocx({'word/document.xml':
      documentXml(p(r('a') + mark(1))), 'word/footnotes.xml': bad},
    {docRels: [['rIdN1', REL('footnotes'), 'footnotes.xml']]}));
    assert.equal(noteState(doc, 'footnotes'), 'unknown');
    const d = new Document(doc);
    const n = newNote(d.doc, F, 2, [para('x')]);
    refused(d, () => d.apply({op: 'addNote', kind: F, id: 2, note: n}),
      'bytes-only');
    assert.throws(() => ensure(d, F), RangeError);
    assert.equal(d.undoDepth, 0);
    assert.equal(noteState(d.doc, 'footnotes'), 'unknown');
    assert.equal(numbers(d.doc).footnotes.get(1), '1', 'still counted');
  });

  it('no notes part: addNote alone is refused (nothing would write ' +
    'it)', async () => {
    const d = new Document(await noteDocNone());
    refused(d, () => d.apply({op: 'addNote', kind: F, id: 1,
      note: newNote(d.doc, F, 1, [para('x')])}), 'no part');
  });

  for (const [kind, settings] of [['footnote', true], ['endnote', true],
    ['footnote', false]]) {
    it(`the first ${kind} (settings ${settings}): the part made, ` +
      'Word\'s separators, its type and relationship; undo: none',
    async () => {
      const doc = await noteDocNone(settings);
      const bytes0 = await save(doc);
      const d = new Document(doc);
      const slot = kind + 's';
      assert.equal(noteState(doc, slot), 'missing');
      d.atomic(() => {
        assert.equal(ensure(d, kind), true);
        assert.equal(ensure(d, kind), false, 'made once');
        const id = nextNoteId(d.doc, kind);
        assert.equal(id, 1);
        d.apply({op: 'addNote', kind, id,
          note: newNote(d.doc, kind, id, [para('the note')])});
        d.apply(markOp(id, kind));
      });
      assert.equal(d.undoDepth, 1);
      assert.equal(noteState(d.doc, slot), 'known');
      assert.equal(numbers(d.doc)[slot].get(1), '1');
      const {zip} = await lintAfter(d.doc, 'a new notes part');
      const name = 'word/' + slot + '.xml';
      const xml = dec(zip.get(name));
      assert.match(xml, new RegExp(`<w:${kind} w:type="separator" ` +
        `w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" ` +
        `w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p>` +
        `</w:${kind}>`));
      assert.match(xml, new RegExp('w:type="continuationSeparator" ' +
        'w:id="0">.*<w:continuationSeparator/>', 's'));
      assert.match(dec(zip.get('[Content_Types].xml')), new RegExp(
        `PartName="/${name}" ContentType="application/vnd\\.` +
        `openxmlformats-officedocument\\.wordprocessingml\\.${slot}` +
        '\\+xml"'));
      assert.match(dec(zip.get('word/_rels/document.xml.rels')),
        new RegExp(`relationships/${slot}" Target="${slot}\\.xml"`));
      const set = zip.get('word/settings.xml');
      if (settings) {
        assert.match(dec(set), new RegExp(`<w:${kind}Pr><w:${kind} ` +
          `w:id="-1"/><w:${kind} w:id="0"/></w:${kind}Pr>`));
      } else assert.equal(set, undefined);
      const back = await readDocx(await save(d.doc));
      const m = back.notes[slot];
      assert.deepEqual([...m.keys()], [-1, 0, 1]);
      assert.equal(m.get(-1).type, 'separator');
      assert.equal(m.get(0).type, 'continuationSeparator');
      assert.equal(m.get(1).blocks[0].text, 'the note');
      assert.equal(numbers(back)[slot].get(1), '1');
      d.undo();
      assert.equal(noteState(d.doc, slot), 'missing');
      assert.deepEqual(await save(d.doc), bytes0, 'as before');
      d.redo();
      assert.equal(noteState(d.doc, slot), 'known');
    });
  }
});

/** A document with no notes part (settings: with a settings part). */
async function noteDocNone(settings = true) {
  const parts = {'word/document.xml': documentXml(p(r('body text')) +
    p(r('more')))};
  if (settings) parts['word/settings.xml'] = settingsXml(
    '<w:defaultTabStop w:val="720"/><w:compat/>');
  return readDocx(await buildDocx(parts));
}

describe('setNoteOpts', () => {
  it('document level: the fields set, the separator references kept; ' +
    'undo gives the very settings back', async () => {
    const doc = await rich(), d = new Document(doc);
    const set0 = d.doc.rawSettings;
    d.apply({op: 'setNoteOpts', level: 'doc', kind: F,
      value: {numFmt: 'lowerRoman', numStart: 3, pos: null}});
    const o = readOpts(d.doc).footnotes;
    assert.equal(o.numFmt, 'lowerRoman');
    assert.equal(o.numStart, 3);
    assert.equal(o.pos, 'pageBottom', 'pos removed: the default');
    const xml = dec((await readZip(await save(d.doc)))
      .get('word/settings.xml'));
    assert.match(xml, /<w:footnotePr><w:numFmt w:val="lowerRoman"\/>/);
    assert.match(xml, /<w:numStart w:val="3"\/><w:footnote w:id="-1"\/>/);
    assert.doesNotMatch(xml, /w:pos/);
    // (the section's own numFmt, decimal, wins over the document's)
    assert.equal(numbers(d.doc).footnotes.get(1), '3');
    d.undo();
    assert.equal(d.doc.rawSettings, set0);
    d.redo();
    assert.equal(readOpts(d.doc).footnotes.numStart, 3);
  });

  it('a document with no footnotePr gets one in schema order',
    async () => {
      const d = new Document(await noteDocNone());
      d.apply({op: 'setNoteOpts', level: 'doc', kind: 'endnote',
        value: {pos: 'sectEnd'}});
      const xml = dec((await readZip(await save(d.doc)))
        .get('word/settings.xml'));
      assert.match(xml, /<w:defaultTabStop w:val="720"\/><w:endnotePr>/
      );
      assert.match(xml, /<\/w:endnotePr><w:compat\/>/);
      assert.equal(readOpts(d.doc).endnotes.pos, 'sectEnd');
    });

  it('section level: its own footnotePr, unknown children kept; ' +
    'undo gives the section\'s props back', async () => {
    const doc = await rich(), d = new Document(doc);
    const sec0 = d.doc.sections[0];
    d.apply({op: 'setNoteOpts', level: 0, kind: F,
      value: {numFmt: 'upperLetter', numRestart: 'eachSect'}});
    const o = forSection(d.doc, d.doc.sections[0]).footnotes;
    assert.equal(o.numFmt, 'upperLetter');
    assert.equal(o.numRestart, 'eachSect');
    assert.equal(d.doc.sections[0].blocks, sec0.blocks);
    const back = await readDocx(await save(d.doc));
    assert.deepEqual(forSection(back, back.sections[0]).footnotes, o);
    const xml = dec((await readZip(await save(d.doc)))
      .get('word/document.xml'));
    assert.match(xml, /<w:x14 w:val="keep"\/>/);
    d.undo();
    assert.ok(deepEqual(d.doc.sections[0], sec0));
    assert.equal(d.doc.sections[0].props, sec0.props, 'its props');
    d.apply({op: 'setNoteOpts', level: 0, kind: 'endnote',
      value: {numFmt: 'upperRoman'}});
    assert.equal(forSection(d.doc, d.doc.sections[0]).endnotes.numFmt,
      'upperRoman');
  });

  it('refused: bad values, levels, kinds; no settings part',
    async () => {
      const d = new Document(await rich());
      for (const op of [
        {level: 'doc', kind: F, value: {numFmt: 'nope'}},
        {level: 'doc', kind: F, value: {numStart: 0}},
        {level: 'doc', kind: F, value: {numStart: 16384}},
        {level: 'doc', kind: F, value: {pos: 'docStart'}},
        {level: 'doc', kind: 'endnote', value: {pos: 'pageBottom'}},
        {level: 'doc', kind: F, value: {numRestart: 'often'}},
        {level: 'doc', kind: F, value: {bogus: 1}},
        {level: 'doc', kind: F, value: JSON.parse(
          '{"__proto__": {"numStart": 2}}')},
        {level: 'doc', kind: F, value: null},
        {level: 1, kind: F, value: {numStart: 2}},
        {level: -1, kind: F, value: {numStart: 2}},
        {level: 'x', kind: F, value: {numStart: 2}},
        {level: 'doc', kind: '__proto__', value: {numStart: 2}},
      ]) refused(d, () => d.apply({op: 'setNoteOpts', ...op}),
        JSON.stringify(op));
      const none = new Document(await noteDocNone(false));
      assert.throws(() => none.apply({op: 'setNoteOpts', level: 'doc',
        kind: F, value: {numStart: 2}}), RangeError);
    });

  it('patchPr keeps unknown children and attributes', () => {
    const node = {name: 'w:footnotePr', attrs: [['w:rsid', '1']],
      children: [{name: 'w:numFmt', attrs: [['w:val', 'decimal'],
        ['w:x', 'y']], children: []}, {name: 'w:footnote', attrs:
        [['w:id', '-1']], children: []}]};
    const out = patchPr(node, F, {numFmt: 'upperRoman', numStart: 2});
    assert.deepEqual(out.attrs, [['w:rsid', '1']]);
    assert.deepEqual(out.children.map((c) => c.name), ['w:numFmt',
      'w:numStart', 'w:footnote']);
    assert.deepEqual(out.children[0].attrs, [['w:val', 'upperRoman'],
      ['w:x', 'y']]);
    assert.equal(node.children.length, 2, 'the old node unchanged');
    assert.equal(patchPr(null, F, {numFmt: null}), null);
  });
});

describe('ModelCheck checkNotes: order and the Maps agree', () => {
  it('a missing, extra or repeated id in order is refused', async () => {
    const doc = await rich();
    const n = doc.notes;
    const with_ = (o) => ({...n, order: {...n.order, footnotes: o}});
    checkNotes(n);
    assert.throws(() => checkNotes(with_([-1, 0, 1, 2])), RangeError);
    assert.throws(() => checkNotes(with_([-1, 0, 1, 2, 3, 4])),
      RangeError);
    assert.throws(() => checkNotes(with_([-1, 0, 1, 2, 3, 3])),
      RangeError);
    assert.throws(() => checkNotes(with_([-1, 0, 1, 3, 3])), RangeError);
  });
});

describe('10,000 notes', () => {
  it('a note added and typed in: linear in the notes, not worse ' +
    '(10,000 against 1,000: load-robust ratio)', async () => {
    const E = 'endnote';
    const make = async (N) => {
      const notes = {};
      let body = '';
      for (let i = 1; i <= N; i++) {
        notes[i] = enoteP('n' + i);
        body += p(r('x') + emark(i));
      }
      return new Document(await noteDoc(body, {}, {endnotes: notes}));
    };
    const K = 50;
    const time = (d) => {
      const pair = () => {
        const id = nextNoteId(d.doc, E);
        d.apply({op: 'addNote', kind: E, id,
          note: newNote(d.doc, E, id, [para('x')])});
        d.apply({op: 'replaceText', block: [0, 0], at: 0, del: 0,
          ins: 'y', story: {note: {kind: E, id: 1}}});
      };
      let best = Infinity;
      for (let rep = 0; rep < 3; rep++) {
        const t0 = performance.now();
        for (let k = 0; k < K; k++) pair();
        best = Math.min(best, performance.now() - t0);
        while (d.canUndo) d.undo();
      }
      return best / K;
    };
    const big = await make(10000), small = await make(1000);
    const a = time(big), b = time(small);
    const ratio = a / b;
    console.log(`# 10,000 notes: ${a.toFixed(3)} ms a note op pair ` +
      `against ${b.toFixed(3)} ms with 1,000 (ratio ` +
      `${ratio.toFixed(2)}: 10 is linear, 100 quadratic)`);
    // (each note op copies the kind's Map and checks the ids: linear
    // in the document, as a body insertBlock's id check is)
    assert.ok(ratio < 30, `ratio ${ratio}`);
    assert.equal(big.doc.notes.endnotes.size, 10002);
    assert.ok(noteOf(big.doc, E, 1));
  });
});
