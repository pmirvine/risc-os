// Footnotes and endnotes on the clipboard (Batch E2): a copy or cut
// carries the notes of its marks by value (./ClipSlice notes); a
// paste makes a NEW note for every mark it puts in, with a fresh id
// from nextNoteId taken at paste time (./ClipNotes carry), in the
// same undo step as the marks; across documents the same, the notes
// part made when the target has none; a kind kept as bytes, a paste
// into a note or a header, HTML and plain text: no marks.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {OBJ} from '../../tools/moreapps/!Letters/Model';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {numbers, noteState, marks}
  from '../../tools/moreapps/!Letters/NoteNumbers';
import {insertNote} from '../../tools/moreapps/!Letters/NoteCmd';
import {slice} from '../../tools/moreapps/!Letters/ClipSlice';
import {toHtml} from '../../tools/moreapps/!Letters/ClipHtml';
import {ClipStore, MARK} from '../../tools/moreapps/!Letters/ClipStore';
import {pick} from '../../tools/moreapps/!Letters/ClipPick';
import {cutSelection, pasteBlocks, pastePlain}
  from '../../tools/moreapps/!Letters/ClipPaste';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {checkNotes, checkBlock}
  from '../../tools/moreapps/!Letters/ModelCheck';
import {scan} from '../../tools/moreapps/!Letters/Walk';
import {pictureOf} from '../../tools/moreapps/!Letters/PicRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {buildDocx, documentXml, stylesXml, p, r, REL, W_NS}
  from './build-docx.mjs';
import {noteDoc, noteP, mark, emark, enoteP} from './note-fixtures.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {drawingXml} from './pic-fixtures.mjs';
import {parseHtml} from './html-fake.mjs';

const F = 'footnote', E = 'endnote';
const fmap = (d) => d.doc.notes.footnotes;
const para = (d, i = 0) => d.doc.sections[0].blocks[i];
const nums = (d, kind = 'footnotes') => Object.fromEntries(
  numbers(d.doc)[kind]);
const at = (b, off) => ({id: b.id, off});
const span = (a, b) => S.select(a, b);
const normal = (m) => [...m.values()].filter((n) => n.type ===
  'normal');
/** The text of note id (its blocks' text joined). */
const noteText = (d, id, kind = 'footnotes') => d.doc.notes[kind]
  .get(id).blocks.map((b) => b.text).join('|');
/** The body's marks, in order: [kind, id]. */
const bodyMarks = (d) => {
  const out = [];
  scan(d.doc, (b) => {
    if (b.type !== 'p') return;
    for (const {x} of marks(b)) out.push([x.note, x.id]);
  });
  return out;
};
/** pasteBlocks' options for slice s. */
const optsOf = (s, sameDoc, extra = {}) => ({sameDoc,
  styleNames: s.styleNames, styles: s.styles, lists: s.lists,
  pics: s.pics, picScope: s.picScope, notes: s.notes, ...extra});

/** "a[1]b[2]c" / "d[3]e[4]" with notes 1..4. */
const four = () => noteDoc(p(r('a') + mark(1) + r('b') + mark(2) +
  r('c')) + p(r('d') + mark(3) + r('e') + mark(4)),
{1: noteP('one'), 2: noteP('two'), 3: noteP('three'),
  4: noteP('four')});

const setup = async (doc) => {
  const d = new Document(await doc);
  return {d, t: new Typing(d)};
};

/** Each mark names a note of its own; every normal note is marked
 *  once. */
function oneToOne(d) {
  const ms = bodyMarks(d), seen = new Set();
  for (const [k, id] of ms) {
    const key = k + ':' + id;
    assert.ok(!seen.has(key), 'two marks for ' + key);
    seen.add(key);
    assert.ok(d.doc.notes[k + 's'].has(id), 'no note for ' + key);
  }
  for (const k of ['footnote', 'endnote']) {
    const m = d.doc.notes[k + 's'];
    if (!(m instanceof Map)) continue;
    for (const n of normal(m))
      assert.ok(seen.has(k + ':' + n.id), 'unmarked ' + k + n.id);
  }
  checkNotes(d.doc.notes);
}

describe('the slice carries notes', () => {
  it('a range with no marks: the slice is as before (no notes key)',
    async () => {
      const {d} = await setup(noteDoc(p(r('plain text')) +
        p(r('x') + mark(1)), {1: noteP('one')}));
      const s = slice(d.doc, span(at(para(d), 0), at(para(d), 5)));
      assert.deepEqual(Object.keys(s), ['blocks', 'ids', 'styleNames',
        'styles', 'lists', 'pics', 'picScope', 'plain']);
      assert.ok(!('notes' in s));
    });

  it('marks: each note once, by value, in mark order', async () => {
    const {d} = await setup(four());
    const s = slice(d.doc, span(at(para(d), 0), at(para(d, 1), 4)));
    assert.deepEqual(s.notes.map((n) => [n.kind, n.id]),
      [[F, 1], [F, 2], [F, 3], [F, 4]]);
    assert.equal(s.notes[0].note, fmap(d).get(1));
    assert.ok(!s.plain.includes(OBJ));
  });
});

describe('copy and paste in the same document', () => {
  it('two marks: two NEW notes, numbers in mark order, one step',
    async () => {
      const {d} = await setup(four());
      const s = slice(d.doc, span(at(para(d), 0), at(para(d), 4)));
      const before = d.doc, depth = d.undoDepth;
      const b1 = para(d, 1);
      pasteBlocks(d, S.caret(at(b1, b1.text.length)), s.blocks,
        optsOf(s, true));
      assert.equal(d.undoDepth, depth + 1, 'one step');
      assert.equal(para(d, 1).text, 'd' + OBJ + 'e' + OBJ + 'a' + OBJ +
        'b' + OBJ);
      assert.deepEqual(bodyMarks(d).map(([, id]) => id),
        [1, 2, 3, 4, 5, 6]);
      assert.equal(noteText(d, 5), OBJ + ' one');
      assert.equal(noteText(d, 6), OBJ + ' two');
      assert.notEqual(fmap(d).get(5), fmap(d).get(1));
      assert.notEqual(fmap(d).get(5).blocks[0].id,
        fmap(d).get(1).blocks[0].id);
      assert.equal(fmap(d).get(5).blocks[0].inlines[0].self, true);
      assert.deepEqual(nums(d), {1: '1', 2: '2', 3: '3', 4: '4',
        5: '5', 6: '6'});
      oneToOne(d);
      d.undo();
      assert.equal(d.doc.sections, before.sections);
      assert.deepEqual([...fmap(d).keys()], [-1, 0, 1, 2, 3, 4]);
      d.redo();
      assert.deepEqual([...fmap(d).keys()], [-1, 0, 1, 2, 3, 4, 5, 6]);
      oneToOne(d);
    });

  it('the mark keeps its node (other attributes), its id new',
    async () => {
      const {d} = await setup(four());
      const s = slice(d.doc, span(at(para(d), 1), at(para(d), 2)));
      pasteBlocks(d, S.caret(at(para(d), 0)), s.blocks,
        optsOf(s, true));
      const x = para(d).inlines[0];
      assert.equal(x.kind, 'noteRef');
      assert.equal(x.id, 5);
      assert.equal(x.node.name, 'w:footnoteReference');
      assert.deepEqual(x.node.attrs, [['w:id', '5']]);
      checkBlock(para(d));
    });

  it('paste twice: distinct notes each time', async () => {
    const {d} = await setup(four());
    const s = slice(d.doc, span(at(para(d), 1), at(para(d), 2)));
    pasteBlocks(d, S.caret(at(para(d), 0)), s.blocks, optsOf(s, true));
    pasteBlocks(d, S.caret(at(para(d), 0)), s.blocks, optsOf(s, true));
    assert.deepEqual(bodyMarks(d).map(([, id]) => id).slice(0, 4),
      [6, 5, 1, 2]);
    assert.equal(noteText(d, 5), OBJ + ' one');
    assert.equal(noteText(d, 6), OBJ + ' one');
    assert.notEqual(fmap(d).get(5), fmap(d).get(6));
    oneToOne(d);
  });

  it('an endnote stays an endnote', async () => {
    const {d} = await setup(noteDoc(p(r('a') + emark(1) + r('b')), {},
      {endnotes: {1: enoteP('e')}}));
    const s = slice(d.doc, span(at(para(d), 0), at(para(d), 2)));
    pasteBlocks(d, S.caret(at(para(d), 3)), s.blocks, optsOf(s, true));
    assert.deepEqual(bodyMarks(d), [[E, 1], [E, 2]]);
    assert.equal(noteText(d, 2, 'endnotes'), OBJ + ' e');
    assert.equal(d.doc.notes.endnotes.get(2).blocks[0].inlines[0]
      .node.name, 'w:endnoteRef');
    oneToOne(d);
  });

  it('a mark in a table cell is carried too', async () => {
    const tbl = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' +
      '</w:tblPr><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr>' +
      '<w:tc>' + p(r('c') + mark(1)) + '</w:tc></w:tr></w:tbl>';
    const {d} = await setup(noteDoc(p(r('x')) + tbl + p(r('z')),
      {1: noteP('cell')}));
    const s = slice(d.doc, span(at(para(d), 0), at(para(d, 2), 1)));
    assert.deepEqual(s.notes.map((n) => n.id), [1]);
    pasteBlocks(d, S.caret(at(para(d, 2), 1)), s.blocks,
      optsOf(s, true));
    assert.equal(bodyMarks(d).length, 2);
    assert.equal(noteText(d, 2), OBJ + ' cell');
    oneToOne(d);
  });
});

describe('cut and paste', () => {
  it('cut takes the note; paste puts a note and the mark back in ' +
    'one step; undo', async () => {
    const {d} = await setup(four());
    const got = cutSelection(d, span(at(para(d), 1), at(para(d), 2)));
    assert.ok(!fmap(d).has(1));
    assert.deepEqual(got.slice.notes.map((n) => n.id), [1]);
    const depth = d.undoDepth, mid = d.doc;
    pasteBlocks(d, S.caret(at(para(d, 1), 0)), got.slice.blocks,
      optsOf(got.slice, true));
    assert.equal(d.undoDepth, depth + 1);
    assert.equal(para(d, 1).text, OBJ + 'd' + OBJ + 'e' + OBJ);
    assert.deepEqual(bodyMarks(d).map(([, id]) => id), [2, 5, 3, 4]);
    assert.equal(noteText(d, 5), OBJ + ' one');
    assert.deepEqual(nums(d), {2: '1', 5: '2', 3: '3', 4: '4'});
    oneToOne(d);
    d.undo();
    assert.equal(d.doc.sections, mid.sections);
    assert.equal(d.doc.notes, mid.notes);
    d.undo();
    assert.ok(fmap(d).has(1));
    oneToOne(d);
  });

  it('the id a cut note had is never shared (cut 4, insert, paste)',
    async () => {
      const {d, t} = await setup(four());
      const got = cutSelection(d, span(at(para(d, 1), 3),
        at(para(d, 1), 4)));
      assert.ok(!fmap(d).has(4));
      const ins = insertNote(d, t, S.caret(at(para(d), 0)), F);
      assert.equal(ins.note.id, 4, 'nextNoteId gives 4 again');
      const b1 = para(d, 1);
      pasteBlocks(d, S.caret(at(b1, b1.text.length)), got.slice.blocks,
        optsOf(got.slice, true));
      assert.deepEqual(bodyMarks(d).map(([, id]) => id),
        [4, 1, 2, 3, 5]);
      assert.equal(noteText(d, 4), OBJ + ' ');
      assert.equal(noteText(d, 5), OBJ + ' four');
      oneToOne(d);
    });

  it('a cut over a selection with marks: old notes go, new come, one ' +
    'step', async () => {
    const {d} = await setup(four());
    const s = slice(d.doc, span(at(para(d), 0), at(para(d), 2)));
    const depth = d.undoDepth;
    // over "[2]c" (offsets 3..5)
    pasteBlocks(d, span(at(para(d), 3), at(para(d), 5)), s.blocks,
      optsOf(s, true));
    assert.equal(d.undoDepth, depth + 1);
    assert.equal(para(d).text, 'a' + OBJ + 'ba' + OBJ);
    assert.ok(!fmap(d).has(2), 'the note of the mark pasted over');
    assert.equal(noteText(d, 5), OBJ + ' one');
    oneToOne(d);
    d.undo();
    assert.ok(fmap(d).has(2));
    assert.ok(!fmap(d).has(5));
    oneToOne(d);
  });
});

describe('the marks that are not pasted', () => {
  it('a mark whose note is missing is dropped (the text kept)',
    async () => {
      const {d} = await setup(noteDoc(p(r('a') + mark(7) + r('b')),
        {1: noteP('one')}));
      const s = slice(d.doc, span(at(para(d), 0), at(para(d), 3)));
      assert.equal(s.notes, undefined);
      pasteBlocks(d, S.caret(at(para(d), 3)), s.blocks,
        optsOf(s, true));
      assert.equal(para(d).text, 'a' + OBJ + 'ba' + 'b');
      assert.deepEqual(bodyMarks(d), [[F, 7]]);
    });

  it('two marks of one note: each pasted mark its own copy',
    async () => {
      const {d} = await setup(noteDoc(p(r('a') + mark(1) + r('b') +
        mark(1)), {1: noteP('one')}));
      const s = slice(d.doc, span(at(para(d), 0), at(para(d), 4)));
      assert.equal(s.notes.length, 1);
      pasteBlocks(d, S.caret(at(para(d), 4)), s.blocks,
        optsOf(s, true));
      assert.deepEqual(bodyMarks(d).map(([, id]) => id), [1, 1, 2, 3]);
      assert.equal(noteText(d, 2), OBJ + ' one');
      assert.equal(noteText(d, 3), OBJ + ' one');
      assert.notEqual(fmap(d).get(2), fmap(d).get(3));
    });

  it('hostile notes entries are ignored, never throw', async () => {
    const {d} = await setup(four());
    const s = slice(d.doc, span(at(para(d), 0), at(para(d), 2)));
    const n = s.notes[0].note;
    const bad = [null, 5, 'x', {}, {kind: '__proto__', id: 1, note: n},
      {kind: F, id: '__proto__', note: n}, {kind: F, id: 1, note: null},
      {kind: F, id: 1.5, note: n},
      {kind: 'constructor', id: 1, note: n},
      {kind: F, id: 1, note: {blocks: 'no'}}];
    pasteBlocks(d, S.caret(at(para(d), 0)), s.blocks,
      optsOf(s, true, {notes: bad}));
    assert.equal(para(d).text, 'aa' + OBJ + 'b' + OBJ + 'c');
    assert.deepEqual(bodyMarks(d).map(([, id]) => id), [1, 2, 3, 4]);
    pasteBlocks(d, S.caret(at(para(d), 0)), s.blocks,
      optsOf(s, true, {notes: {__proto__: null, length: 1}}));
    assert.equal(bodyMarks(d).length, 4);
    oneToOne(d);
  });

  it('into a note: no marks (a beep), the text pasted', async () => {
    const {d} = await setup(four());
    const s = slice(d.doc, span(at(para(d), 0), at(para(d), 3)));
    const f = facadeOf(d, {note: {kind: F, id: 2}});
    const nb = f.doc.sections[0].blocks[0];
    const report = {}, keys = [...fmap(d).keys()];
    pasteBlocks(f, S.caret(at(nb, nb.text.length)), s.blocks,
      optsOf(s, true, {report}));
    assert.equal(report.marks, 'note');
    assert.equal(noteText(d, 2), OBJ + ' twoab');
    assert.deepEqual([...fmap(d).keys()], keys);
    oneToOne(d);
  });

  it('into a header: no marks (a beep), the text pasted', async () => {
    const {d: src} = await setup(four());
    const s = slice(src.doc, span(at(para(src), 0),
      at(para(src), 3)));
    const doc = await readDocx(await withHeaders(p(r('body')),
      {default: p(r('Head'))}));
    const d = new Document(doc);
    const h = facadeOf(d, [...doc.stories.keys()][0]);
    const hb = h.doc.sections[0].blocks[0];
    const report = {};
    pasteBlocks(h, S.caret(at(hb, 4)), s.blocks,
      optsOf(s, false, {report}));
    assert.equal(report.marks, 'note');
    const hb2 = h.doc.sections[0].blocks[0];
    assert.equal(hb2.text, 'Headab');
    assert.equal(noteState(d.doc, 'footnotes'), 'missing');
  });

  it('a kind kept as bytes: marks dropped, a notice', async () => {
    const {d: src} = await setup(four());
    const s = slice(src.doc, span(at(para(src), 0),
      at(para(src), 3)));
    const parts = {'word/document.xml': documentXml(p(r('t') +
      mark(1))), 'word/footnotes.xml': '<w:footnotes xmlns:w="' +
      W_NS + '"><w:footnote w:id="1"><broken'};
    const d = new Document(await readDocx(await buildDocx(parts,
      {docRels: [['rIdN1', REL('footnotes'), 'footnotes.xml']]})));
    assert.equal(noteState(d.doc, 'footnotes'), 'unknown');
    const report = {};
    pasteBlocks(d, S.caret(at(para(d), 1)), s.blocks,
      optsOf(s, false, {report}));
    assert.equal(report.marks, 'unknown');
    assert.equal(para(d).text, 'tab' + OBJ);
    assert.deepEqual(bodyMarks(d), [[F, 1]]);
    assert.equal(noteState(d.doc, 'footnotes'), 'unknown');
  });

  it('HTML and plain text make no marks', async () => {
    const {d} = await setup(four());
    const s = slice(d.doc, span(at(para(d), 0), at(para(d), 5)));
    const html = toHtml(d.doc, s);
    const r1 = pick({text: s.plain, html}, {parseHtml});
    assert.equal(r1.route, 'html');
    pasteBlocks(d, S.caret(at(para(d, 1), 0)), r1.blocks, r1.opts);
    pastePlain(d, S.caret(at(para(d, 1), 0)), s.plain);
    assert.deepEqual(bodyMarks(d).map(([, id]) => id), [1, 2, 3, 4]);
    assert.equal(para(d, 1).text.slice(0, 6), 'abcabc');
    oneToOne(d);
  });
});

describe('across documents', () => {
  it('through the store: new ids and numbers in the target',
    async () => {
      const {d: src} = await setup(four());
      const s = slice(src.doc, span(at(para(src), 0),
        at(para(src), 4)));
      const store = new ClipStore();
      const token = store.put(s, 1);
      const got = pick({text: s.plain, html: MARK + token + '-->'},
        {store, docKey: 2});
      assert.equal(got.route, 'exact');
      assert.equal(got.opts.sameDoc, false);
      assert.equal(got.opts.notes, s.notes);
      const {d} = await setup(noteDoc(p(r('x') + mark(1) + r('y')),
        {1: noteP('mine')}));
      const depth = d.undoDepth;
      pasteBlocks(d, S.caret(at(para(d), 0)), got.blocks, got.opts);
      assert.equal(d.undoDepth, depth + 1);
      assert.deepEqual(bodyMarks(d).map(([, id]) => id), [2, 3, 1]);
      assert.equal(noteText(d, 2), OBJ + ' one');
      assert.equal(noteText(d, 3), OBJ + ' two');
      assert.equal(noteText(d, 1), OBJ + ' mine');
      assert.deepEqual(nums(d), {2: '1', 3: '2', 1: '3'});
      for (const id of [2, 3]) {
        const x = fmap(d).get(id).blocks[0].inlines[0];
        assert.equal(x.self, true);
        assert.equal(x.node.name, 'w:footnoteRef');
      }
      // the source untouched
      assert.deepEqual([...fmap(src).keys()], [-1, 0, 1, 2, 3, 4]);
      oneToOne(d);
      d.undo();
      assert.deepEqual([...fmap(d).keys()], [-1, 0, 1]);
    });

  it('a target with no notes part: made in the same step, the ' +
    'styles too (by name); written and read back', async () => {
    const st = stylesXml('<w:style w:type="character" ' +
      'w:styleId="FNR"><w:name w:val="footnote reference"/><w:rPr>' +
      '<w:vertAlign w:val="superscript"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="FNT"><w:name ' +
      'w:val="footnote text"/></w:style>');
    const {d: src} = await setup(noteDoc(p(r('a') + '<w:r><w:rPr>' +
      '<w:rStyle w:val="FNR"/></w:rPr><w:footnoteReference w:id="1"/>' +
      '</w:r>'), {1: p('<w:r><w:footnoteRef/></w:r>' + r(' one'),
      '<w:pStyle w:val="FNT"/>')}, {styles: st}));
    const s = slice(src.doc, span(at(para(src), 0),
      at(para(src), 2)));
    const styles = stylesXml('<w:style w:type="paragraph" ' +
      'w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
      '</w:style>');
    const {d} = await setup(readDocx(await buildDocx({
      'word/document.xml': documentXml(p(r('plain'))),
      'word/styles.xml': styles})));
    assert.equal(noteState(d.doc, 'footnotes'), 'missing');
    const depth = d.undoDepth, styles0 = d.doc.styles;
    pasteBlocks(d, S.caret(at(para(d), 5)), s.blocks,
      optsOf(s, false));
    assert.equal(d.undoDepth, depth + 1);
    assert.equal(noteState(d.doc, 'footnotes'), 'known');
    assert.deepEqual(bodyMarks(d), [[F, 1]]);
    assert.equal(noteText(d, 1), OBJ + ' one');
    assert.deepEqual(nums(d), {1: '1'});
    // the mark's and the note's styles: Word's, added
    const run = para(d).runs.find((u) => u.start === 6);
    assert.equal(run.rStyle, 'FootnoteReference');
    assert.equal(fmap(d).get(1).blocks[0].pStyle, 'FootnoteText');
    oneToOne(d);
    const back = await readDocx(await writeDocx(d.doc));
    assert.equal(back.notes.footnotes.get(1).blocks[0].text,
      OBJ + ' one');
    d.undo();
    assert.equal(noteState(d.doc, 'footnotes'), 'missing');
    assert.equal(d.doc.styles, styles0);
    assert.equal(para(d).text, 'plain');
  });
});

describe('what a note holds', () => {
  it('a picture in a note: kept, its docPr id fresh', async () => {
    const pic = '<w:r>' + drawingXml({id: 7}) + '</w:r>';
    const {d} = await setup(noteDoc(p(r('a') + mark(1)),
      {1: p('<w:r><w:footnoteRef/></w:r>' + r(' see') + pic)}));
    const s = slice(d.doc, span(at(para(d), 0), at(para(d), 2)));
    pasteBlocks(d, S.caret(at(para(d), 2)), s.blocks, optsOf(s, true));
    const old = fmap(d).get(1).blocks[0].inlines;
    const neu = fmap(d).get(2).blocks[0].inlines;
    const key = (o) => Object.keys(o).find((k) => o[k].kind === 'raw');
    const a = pictureOf(old[key(old)].node);
    const b = pictureOf(neu[key(neu)].node);
    assert.ok(a && b, 'both read as pictures');
    assert.equal(a.docPrId, 7);
    assert.notEqual(b.docPrId, 7);
    oneToOne(d);
  });

  it('a picture in a note pasted in another document: not carried, ' +
    'the text kept', async () => {
    const pic = '<w:r>' + drawingXml({id: 7}) + '</w:r>';
    const {d: src} = await setup(noteDoc(p(r('a') + mark(1)),
      {1: p('<w:r><w:footnoteRef/></w:r>' + r(' see') + pic)}));
    const s = slice(src.doc, span(at(para(src), 0), at(para(src), 2)));
    const {d} = await setup(noteDoc(p(r('x')), {}));
    const report = {};
    pasteBlocks(d, S.caret(at(para(d), 1)), s.blocks,
      optsOf(s, false, {report}));
    const n = fmap(d).get(1).blocks[0];
    assert.equal(n.text, OBJ + ' see');
    assert.equal(n.inlines[0].self, true);
    assert.equal(report.lost, true, 'the paste says so');
    oneToOne(d);
    // a note with no picture or link: nothing said; the same
    // document: nothing lost
    const {d: plain} = await setup(four());
    const s2 = slice(plain.doc, span(at(para(plain), 0),
      at(para(plain), 2)));
    const r2 = {}, r3 = {};
    pasteBlocks(d, S.caret(at(para(d), 0)), s2.blocks,
      optsOf(s2, false, {report: r2}));
    assert.equal(r2.lost, undefined);
    pasteBlocks(src, S.caret(at(para(src), 0)), s.blocks,
      optsOf(s, true, {report: r3}));
    assert.equal(r3.lost, undefined);
  });

  it('only the kinds whose marks are pasted get a notes part',
    async () => {
      const {d: src} = await setup(noteDoc(p(r('a') + mark(1) +
        r('b') + emark(1)), {1: noteP('one')},
      {endnotes: {1: enoteP('end')}}));
      const s = slice(src.doc, span(at(para(src), 0),
        at(para(src), 2)));
      const en = src.doc.notes.endnotes.get(1);
      const {d} = await setup(readDocx(await buildDocx({
        'word/document.xml': documentXml(p(r('plain')))})));
      assert.equal(noteState(d.doc, 'endnotes'), 'missing');
      const notes = [...s.notes, {kind: E, id: 1, note: en}];
      pasteBlocks(d, S.caret(at(para(d), 5)), s.blocks,
        optsOf(s, false, {notes}));
      assert.deepEqual(bodyMarks(d), [[F, 1]]);
      assert.equal(noteState(d.doc, 'footnotes'), 'known');
      assert.equal(noteState(d.doc, 'endnotes'), 'missing',
        'no empty endnotes part');
    });

  it('a bookmark in a note is not copied (its id stays unique)',
    async () => {
      const bm = '<w:bookmarkStart w:id="0" w:name="here"/>' +
        '<w:bookmarkEnd w:id="0"/>';
      const {d} = await setup(noteDoc(p(r('a') + mark(1)),
        {1: p('<w:r><w:footnoteRef/></w:r>' + bm + r(' x'))}));
      const s = slice(d.doc, span(at(para(d), 0), at(para(d), 2)));
      pasteBlocks(d, S.caret(at(para(d), 2)), s.blocks,
        optsOf(s, true));
      const n2 = fmap(d).get(2).blocks[0];
      assert.equal(n2.text, OBJ + ' x');
      assert.ok(!JSON.stringify(n2).includes('bookmark'));
      assert.ok(JSON.stringify(fmap(d).get(1).blocks[0])
        .includes('bookmarkStart'));
    });

  it('a mark inside a note is not copied with it', async () => {
    const {d} = await setup(noteDoc(p(r('a') + mark(1)) +
      p(r('b') + mark(2)), {1: p('<w:r><w:footnoteRef/></w:r>' +
        r(' x') + mark(2)), 2: noteP('two')}));
    const s = slice(d.doc, span(at(para(d), 0), at(para(d), 2)));
    pasteBlocks(d, S.caret(at(para(d), 2)), s.blocks, optsOf(s, true));
    const n3 = fmap(d).get(3).blocks[0];
    assert.equal(n3.text, OBJ + ' x');
    assert.equal(n3.inlines[0].self, true);
  });
});

describe("a note's own number (its self mark) copied", () => {
  /** A note's whole text, its number too, copied in the notes mode. */
  const ownCopy = (d, id = 1) => {
    const f = facadeOf(d, {note: {kind: F, id}});
    const nb = f.doc.sections[0].blocks[0];
    return {f, s: slice(f.doc, span(at(nb, 0),
      at(nb, nb.text.length)))};
  };
  const selfs = (b) => Object.values(b.inlines || {}).filter((x) =>
    x.kind === 'noteRef' && x.self === true).length;

  it('pasted in the body of the same document: dropped (Word never ' +
    'writes one there), the text kept', async () => {
    const {d} = await setup(noteDoc(p(r('ab') + mark(1) + r('cd')),
      {1: noteP('one')}));
    const {s} = ownCopy(d);
    pasteBlocks(d, S.caret(at(para(d), 4)), s.blocks, optsOf(s, true));
    assert.equal(para(d).text, 'ab' + OBJ + 'c one' + 'd');
    assert.equal(selfs(para(d)), 0);
    const xml = new TextDecoder().decode((await readZip(
      await writeDocx(d.doc, {date: new Date(0)})))
      .get('word/document.xml'));
    assert.ok(!xml.includes('footnoteRef/'), 'no footnoteRef there');
  });

  it('pasted into a note of the same document: kept', async () => {
    const {d} = await setup(noteDoc(p(r('ab') + mark(1) + mark(2)),
      {1: noteP('one'), 2: noteP('two')}));
    const {s} = ownCopy(d);
    const g = facadeOf(d, {note: {kind: F, id: 2}});
    const nb = g.doc.sections[0].blocks[0];
    pasteBlocks(g, S.caret(at(nb, nb.text.length)), s.blocks,
      optsOf(s, true));
    const n2 = fmap(d).get(2).blocks[0];
    assert.equal(n2.text, OBJ + ' two' + OBJ + ' one');
    assert.equal(selfs(n2), 2);
  });

  it('pasted in a header, or in another document: dropped',
    async () => {
      const {d: src} = await setup(noteDoc(p(r('ab') + mark(1)),
        {1: noteP('one')}));
      const {s} = ownCopy(src);
      const doc = await readDocx(await withHeaders(p(r('body')),
        {default: p(r('Head'))}));
      const d = new Document(doc);
      const h = facadeOf(d, [...doc.stories.keys()][0]);
      pasteBlocks(h, S.caret(at(h.doc.sections[0].blocks[0], 4)),
        s.blocks, optsOf(s, true));
      const hb = h.doc.sections[0].blocks[0];
      assert.equal(hb.text, 'Head one');
      assert.equal(selfs(hb), 0);
      const {d: other} = await setup(noteDoc(p(r('xy')), {}));
      pasteBlocks(other, S.caret(at(para(other), 1)), s.blocks,
        optsOf(s, false));
      assert.equal(para(other).text, 'x oney');
      assert.equal(selfs(para(other)), 0);
    });
});

describe('cost', () => {
  const big = (n, marked) => {
    let body = '';
    const notes = {};
    for (let i = 1; i <= n; i++) {
      body += p(r('line ' + i) + (marked ? mark(i) : r('.')));
      if (marked) notes[i] = noteP('note ' + i);
    }
    return noteDoc(body, notes);
  };
  const time = async (marked, n) => {
    let best = Infinity;
    for (let k = 0; k < 3; k++) {
      const {d} = await setup(big(n, marked));
      const bs = d.doc.sections[0].blocks;
      const last = bs[bs.length - 1];
      const t0 = performance.now();
      const s = slice(d.doc, span(at(bs[0], 0),
        at(last, last.text.length)));
      pasteBlocks(d, S.caret(at(last, last.text.length)), s.blocks,
        optsOf(s, true));
      best = Math.min(best, performance.now() - t0);
      if (marked) assert.equal(normal(fmap(d)).length, 2 * n);
    }
    return best;
  };

  it('1,000 marks: copy and paste near the cost of plain text ' +
    '(WORD_PERF=1 for the time)', async () => {
    const plain = await time(false, 1000);
    const marked = await time(true, 1000);
    const ratio = marked / plain;
    console.log(`# 1,000 marks: ${marked.toFixed(1)} ms, plain ` +
      `${plain.toFixed(1)} ms, ratio ${ratio.toFixed(2)}`);
    assert.ok(ratio < 20, 'ratio ' + ratio.toFixed(2));
    if (process.env.WORD_PERF) assert.ok(marked < 500, marked + ' ms');
  });
});
