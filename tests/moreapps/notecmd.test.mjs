// Footnotes and endnotes put in and taken out (Batch E2): NoteCmd
// insertNote (the mark at the caret, a new note with its own mark,
// the styles on first use, one undo step), whyNot (the refusals),
// and every deleting command taking the notes of the marks it
// deletes in the same step (./NoteKeep through ./Document), undo
// bringing marks, notes and numbers back.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {OBJ} from '../../tools/moreapps/!Letters/Model';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {numbers, noteState}
  from '../../tools/moreapps/!Letters/NoteNumbers';
import {insertNote, whyNot}
  from '../../tools/moreapps/!Letters/NoteCmd';
import {run} from '../../tools/moreapps/!Letters/EditApply';
import {deleteSelection} from '../../tools/moreapps/!Letters/EditDel';
import {cutSelection, pasteBlocks}
  from '../../tools/moreapps/!Letters/ClipPaste';
import {replaceOne, replaceAll}
  from '../../tools/moreapps/!Letters/Find';
import {TABLE} from '../../tools/moreapps/!Letters/TblCmdCols';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {stepTo} from '../../tools/moreapps/!Letters/EditStep';
import {checkNotes} from '../../tools/moreapps/!Letters/ModelCheck';
import {stats as refStats}
  from '../../tools/moreapps/!Letters/NoteRefs';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {lintPackage} from './lint-package.mjs';
import {buildDocx, documentXml, p, r, REL, W_NS, R_NS}
  from './build-docx.mjs';
import {noteDoc, noteP, mark, emark, enoteP, SEPS}
  from './note-fixtures.mjs';
import {withHeaders} from './story-fixtures.mjs';

const F = 'footnote', E = 'endnote';
const fmap = (d) => d.doc.notes.footnotes;
const para = (d, i = 0) => d.doc.sections[0].blocks[i];
const nums = (d, kind = 'footnotes') => Object.fromEntries(
  numbers(d.doc)[kind]);
const at = (b, off) => ({id: b.id, off});
const span = (a, b) => S.select(a, b);
const TBL = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' +
  '</w:tblPr><w:tblGrid>';

/** "a[1]b[2]c" / "d[3]e[4]" with notes 1..4. */
const four = () => noteDoc(p(r('a') + mark(1) + r('b') + mark(2) +
  r('c')) + p(r('d') + mark(3) + r('e') + mark(4)),
{1: noteP('one'), 2: noteP('two'), 3: noteP('three'),
  4: noteP('four')});

const setup = async (doc) => {
  const d = new Document(await doc);
  return {d, t: new Typing(d)};
};

describe('insertNote', () => {
  it('adds the mark and a note with its own mark; renumbers',
    async () => {
      const {d, t} = await setup(noteDoc(p(r('ab') + mark(1) +
        r('c')), {1: noteP('one')}));
      const b = para(d), depth = d.undoDepth;
      const out = insertNote(d, t, S.caret(at(b, 1)), F);
      assert.deepEqual(out.note, {kind: F, id: 2});
      assert.equal(d.undoDepth, depth + 1, 'one step');
      const b2 = para(d);
      assert.equal(b2.text, 'a' + OBJ + 'b' + OBJ + 'c');
      assert.deepEqual(out.sel, S.caret(at(b2, 2)));
      const x = b2.inlines[1];
      assert.equal(x.kind, 'noteRef');
      assert.equal(x.note, F);
      assert.equal(x.id, 2);
      assert.equal(x.node.name, 'w:footnoteReference');
      assert.deepEqual(x.node.attrs, [['w:id', '2']]);
      const run1 = b2.runs.find((u) => u.start === 1);
      assert.equal(run1.rStyle, 'FootnoteReference');
      assert.deepEqual(nums(d), {2: '1', 1: '2'});
      const n = fmap(d).get(2);
      assert.equal(n.type, 'normal');
      const np = n.blocks[0];
      assert.equal(np.text, OBJ + ' ');
      assert.equal(np.pStyle, 'FootnoteText');
      assert.equal(np.inlines[0].self, true);
      assert.equal(np.inlines[0].node.name, 'w:footnoteRef');
      assert.equal(np.runs[0].rStyle, 'FootnoteReference');
      for (const s of ['FootnoteText', 'FootnoteReference'])
        assert.ok(d.doc.styles.styles.has(s), s);
      checkNotes(d.doc.notes);
    });

  it('a range: the mark goes after it, the text kept (Word)',
    async () => {
      const {d, t} = await setup(noteDoc(p(r('abcd')), {}));
      const b = para(d);
      const out = insertNote(d, t, span(at(b, 3), at(b, 1)), F);
      assert.equal(para(d).text, 'abc' + OBJ + 'd');
      assert.deepEqual(out.sel, S.caret(at(b, 4)));
    });

  it('undo removes the mark, the note and the styles; redo',
    async () => {
      const {d, t} = await setup(noteDoc(p(r('ab') + mark(1)),
        {1: noteP('one')}));
      const styles = d.doc.styles, b = para(d);
      insertNote(d, t, S.caret(at(b, 0)), F);
      d.undo();
      assert.equal(para(d).text, 'ab' + OBJ);
      assert.deepEqual([...fmap(d).keys()], [-1, 0, 1]);
      assert.equal(d.doc.styles, styles);
      assert.deepEqual(nums(d), {1: '1'});
      d.redo();
      assert.deepEqual(nums(d), {2: '1', 1: '2'});
    });

  it('an endnote, its styles and part', async () => {
    const {d, t} = await setup(noteDoc(p(r('ab') + emark(1)), {},
      {endnotes: {1: enoteP('e')}}));
    const was = nums(d, 'endnotes')[1];
    const out = insertNote(d, t, S.caret(at(para(d), 0)), E);
    assert.deepEqual(out.note, {kind: E, id: 2});
    const n = d.doc.notes.endnotes.get(2);
    assert.equal(n.blocks[0].pStyle, 'EndnoteText');
    assert.equal(n.blocks[0].inlines[0].node.name, 'w:endnoteRef');
    assert.equal(para(d).inlines[0].node.name, 'w:endnoteReference');
    assert.equal(nums(d, 'endnotes')[2], was, 'the new one first');
  });

  it('a document with no notes part gets one in the same step',
    async () => {
      const doc = readDocx(await buildDocx({'word/document.xml':
        documentXml(p(r('plain')))}));
      const {d, t} = await setup(doc);
      assert.equal(noteState(d.doc, 'footnotes'), 'missing');
      const depth = d.undoDepth;
      const out = insertNote(d, t, S.caret(at(para(d), 5)), F);
      assert.equal(d.undoDepth, depth + 1);
      assert.equal(out.note.id, 1);
      assert.equal(noteState(d.doc, 'footnotes'), 'known');
      assert.deepEqual(nums(d), {1: '1'});
      d.undo();
      assert.equal(noteState(d.doc, 'footnotes'), 'missing');
      assert.equal(para(d).text, 'plain');
    });

  it('the style the document has (by name) is used, none added',
    async () => {
      const styles = '<?xml version="1.0" encoding="UTF-8"?>' +
        `<w:styles xmlns:w="${W_NS}"><w:style w:type="character" ` +
        'w:styleId="FNRef"><w:name w:val="footnote reference"/>' +
        '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>' +
        '</w:style></w:styles>';
      const {d, t} = await setup(noteDoc(p(r('ab')), {}, {styles}));
      insertNote(d, t, S.caret(at(para(d), 1)), F);
      const run1 = para(d).runs.find((u) => u.start === 1);
      assert.equal(run1.rStyle, 'FNRef');
      assert.ok(!d.doc.styles.styles.has('FootnoteReference'));
    });
});

describe('insertNote refused (whyNot says why; nothing changed)',
  () => {
  const refused = (d, t, sel, kind, re) => {
    const v = d.doc, depth = d.undoDepth;
    assert.match(String(whyNot(d, sel, kind)), re);
    assert.equal(insertNote(d, t, sel, kind), null);
    assert.equal(d.doc, v);
    assert.equal(d.undoDepth, depth);
  };

  it('in a note (no note in a note)', async () => {
    const {d} = await setup(noteDoc(p(r('a') + mark(1)),
      {1: noteP('one')}));
    const f = facadeOf(d, {note: {kind: F, id: 1}});
    const nb = f.doc.sections[0].blocks[0];
    refused(f, new Typing(f), S.caret(at(nb, 2)), F, /note/);
    refused(f, new Typing(f), S.caret(at(nb, 2)), E, /note/);
  });

  it('in a header', async () => {
    const doc = await readDocx(await withHeaders(p(r('body')),
      {default: p(r('Head'))}));
    const d = new Document(doc);
    const part = [...doc.stories.keys()][0];
    const f = facadeOf(d, part);
    const hb = f.doc.sections[0].blocks[0];
    refused(f, new Typing(f), S.caret(at(hb, 1)), F,
      /header or footer/);
  });

  it('on a table edge or a kept block (a text box, raw content)',
    async () => {
      const tbl = TBL + '<w:gridCol w:w="2000"/>' +
        '</w:tblGrid><w:tr><w:tc>' + p(r('cell')) +
        '</w:tc></w:tr></w:tbl>';
      const {d, t} = await setup(noteDoc(tbl + p(r('after')), {}));
      const tb = para(d, 0);
      assert.equal(tb.type, 'tbl');
      refused(d, t, S.caret({id: tb.id, off: 0}), F, /text/);
    });

  it('a kind kept as bytes (its part could not be read)', async () => {
    const parts = {'word/document.xml': documentXml(p(r('a') +
      mark(1))), 'word/footnotes.xml': '<w:footnotes xmlns:w="' +
      W_NS + '"><w:footnote w:id="1"><broken'};
    const doc = readDocx(await buildDocx(parts, {docRels:
      [['rIdN1', REL('footnotes'), 'footnotes.xml']]}));
    const {d, t} = await setup(doc);
    assert.equal(noteState(d.doc, 'footnotes'), 'unknown');
    refused(d, t, S.caret(at(para(d), 0)), F, /could not be read/);
  });

  it('no selection, a bad kind', async () => {
    const {d, t} = await setup(noteDoc(p(r('a')), {}));
    refused(d, t, null, F, /caret/);
    refused(d, t, S.caret(at(para(d), 0)), 'comment', /kind/);
  });
});

describe('deleting marks takes their notes in the same step', () => {
  it('a selection over three marks: three notes, one step; undo ' +
    'gives marks, notes and numbers back', async () => {
    const {d} = await setup(four());
    const n0 = new Map(fmap(d)), depth = d.undoDepth;
    const out = deleteSelection(d, span(at(para(d, 0), 1),
      at(para(d, 1), 3)));
    assert.ok(out);
    assert.equal(d.undoDepth, depth + 1, 'one step');
    assert.deepEqual([...fmap(d).keys()], [-1, 0, 4]);
    assert.deepEqual(nums(d), {4: '1'});
    checkNotes(d.doc.notes);
    d.undo();
    assert.deepEqual(nums(d), {1: '1', 2: '2', 3: '3', 4: '4'});
    for (const [id, n] of n0) assert.equal(fmap(d).get(id), n, 'id ' +
      id + ' the very note');
    assert.deepEqual(d.doc.notes.order.footnotes, [-1, 0, 1, 2, 3, 4]);
    d.redo();
    assert.deepEqual([...fmap(d).keys()], [-1, 0, 4]);
  });

  it('Backspace and Delete over a mark take its note', async () => {
    const {d, t} = await setup(four());
    run('backspace', d, t, S.caret(at(para(d), 2)));
    assert.equal(para(d).text, 'ab' + OBJ + 'c');
    assert.ok(!fmap(d).has(1));
    assert.deepEqual(nums(d), {2: '1', 3: '2', 4: '3'});
    run('delete', d, t, S.caret(at(para(d), 2)));
    assert.ok(!fmap(d).has(2));
    d.undo();
    d.undo();
    assert.deepEqual(nums(d), {1: '1', 2: '2', 3: '3', 4: '4'});
  });

  it('typing over a selection with a mark, and Enter over one',
    async () => {
      const {d, t} = await setup(four());
      t.type(span(at(para(d), 0), at(para(d), 3)), 'x');
      assert.equal(para(d).text, 'x' + OBJ + 'c');
      assert.ok(!fmap(d).has(1));
      assert.ok(fmap(d).has(2));
      run('enter', d, t, span(at(para(d), 0), at(para(d), 2)));
      assert.ok(!fmap(d).has(2));
      d.undo();
      d.undo();
      assert.ok(fmap(d).has(1) && fmap(d).has(2));
    });

  it('cut takes the note (the clipboard carries it: pasted back as ' +
    'a new note)', async () => {
      const {d} = await setup(four());
      const d0 = d.undoDepth;
      const got = cutSelection(d, span(at(para(d), 1), at(para(d), 2)));
      assert.ok(got.slice);
      assert.equal(d.undoDepth, d0 + 1, 'the cut: one step');
      assert.ok(!fmap(d).has(1));
      // pasted back: a new note (fresh id) with the mark, one step
      // (clipnotes.test.mjs has the rest)
      pasteBlocks(d, S.caret(at(para(d), 0)), got.slice.blocks,
        {sameDoc: true, notes: got.slice.notes});
      assert.equal(para(d).text, OBJ + 'ab' + OBJ + 'c');
      assert.equal(para(d).inlines[0].id, 5);
      assert.deepEqual(nums(d), {5: '1', 2: '2', 3: '3', 4: '4'});
      // without the notes (a stash of blocks): the mark is not pasted
      assert.equal(d.undoDepth, d0 + 2, 'the paste: one step');
      pasteBlocks(d, S.caret(at(para(d), 0)), got.slice.blocks,
        {sameDoc: true});
      assert.equal(para(d).text, OBJ + 'ab' + OBJ + 'c');
      // (the paste still records its step, which changes nothing)
      assert.equal(d.undoDepth, d0 + 3, 'the second paste: one step');
      d.undo();
      assert.equal(para(d).text, OBJ + 'ab' + OBJ + 'c');
      d.undo();
      assert.ok(!fmap(d).has(5) && !fmap(d).has(1));
      d.undo();
      assert.equal(d.undoDepth, d0);
      assert.ok(fmap(d).has(1));
    });

  it('a table and a row deleted with marks in their cells',
    async () => {
      const cell = (x) => '<w:tc>' + p(r(x[0]) + x.slice(1)) +
        '</w:tc>';
      const tbl = TBL + '<w:gridCol w:w="2000"/>' +
        '<w:gridCol w:w="2000"/></w:tblGrid><w:tr>' +
        cell('a' + mark(1)) + cell('b') + '</w:tr><w:tr>' +
        cell('c' + mark(2)) + cell('d' + mark(3)) + '</w:tr></w:tbl>';
      const {d} = await setup(noteDoc(tbl + p(r('z')), {1: noteP('1'),
        2: noteP('2'), 3: noteP('3')}));
      const tb = para(d), c = tb.rows[1].cells[0].blocks[0];
      TABLE.deleteRows(d, S.caret(at(c, 0)));
      assert.deepEqual([...fmap(d).keys()], [-1, 0, 1]);
      d.undo();
      assert.deepEqual([...fmap(d).keys()], [-1, 0, 1, 2, 3]);
      const c0 = para(d).rows[0].cells[0].blocks[0];
      TABLE.deleteTable(d, S.caret(at(c0, 0)));
      assert.deepEqual([...fmap(d).keys()], [-1, 0]);
      d.undo();
      assert.deepEqual(nums(d), {1: '1', 2: '2', 3: '3'});
    });

  it('Find and Replace never replaces across a mark: notes kept',
    async () => {
      const {d} = await setup(four());
      const m = {at: [0, 0], from: 0, to: 3};
      assert.equal(replaceOne(d, m, 'x'), null);
      replaceAll(d, 'b', 'B');
      assert.equal(para(d).text, 'a' + OBJ + 'B' + OBJ + 'c');
      assert.equal(fmap(d).size, 6);
    });

  it('a mark moved in one step keeps its note; a reformatted ' +
    'paragraph too', async () => {
    const {d} = await setup(four());
    const b = para(d);
    // (the mark taken out and put back at the end, one step)
    d.atomic(() => {
      const x = b.inlines[1];
      d.apply({op: 'replaceText', block: [0, 0], at: 1, del: 1,
        ins: ''});
      d.apply({op: 'replaceText', block: [0, 0], at: 3, del: 0,
        ins: OBJ, inlines: {0: x}});
    });
    assert.ok(fmap(d).has(1));
    d.apply({op: 'setProps', block: [0, 0], pPr: {jc: 'center',
      extra: []}});
    assert.equal(fmap(d).size, 6);
  });

  it('a second mark of the same note keeps it; orphans untouched; ' +
    'a mark naming no note is nothing', async () => {
    const {d, t} = await setup(noteDoc(p(r('a') + mark(1) + r('b') +
      mark(1) + r('c') + mark(9)), {1: noteP('one'),
      5: noteP('orphan')}));
    run('backspace', d, t, S.caret(at(para(d), 2)));
    assert.ok(fmap(d).has(1), 'still marked');
    assert.ok(fmap(d).has(5), 'the orphan');
    const b = para(d);
    deleteSelection(d, span(at(b, 0), at(b, b.text.length)));
    assert.ok(!fmap(d).has(1));
    assert.ok(fmap(d).has(5), 'the orphan stays');
  });

  it('a mark naming a separator does not remove it', async () => {
    const {d, t} = await setup(noteDoc(p(r('a') + mark(0)), {}));
    run('backspace', d, t, S.caret(at(para(d), 2)));
    assert.ok(fmap(d).has(0));
  });

  it('deleting 10,000 marks: linear in the marks', async () => {
    const time = async (n) => {
      let body = '';
      const notes = {};
      for (let k = 1; k <= n; k++) {
        body += r('x') + mark(k);
        notes[k] = noteP('n' + k);
      }
      const {d} = await setup(noteDoc(p(body) + p(r('end')), notes));
      const b = para(d);
      const t0 = performance.now();
      deleteSelection(d, span(at(b, 0), at(b, b.text.length)));
      const ms = performance.now() - t0;
      assert.equal(fmap(d).size, 2);
      d.undo();
      assert.equal(fmap(d).size, n + 2);
      return ms;
    };
    await time(200);
    const a = await time(1000), b = await time(10000);
    assert.ok(b / Math.max(a, 1) < 40, 'ratio ' + (b / a).toFixed(1));
  });
});

describe('a mark kept as read still names its note (NoteKeep)', () => {
  const lintErrors = async (doc) => lintPackage(await readZip(
    await writeDocx(doc, {date: new Date(0)}))).problems.filter((q) =>
    q.level === 'error').map((q) => q.rule + ' ' + q.detail);
  const WRAPS = {
    hyperlink: (m) => p(r('see ') + '<w:hyperlink w:anchor="x">' + m +
      '</w:hyperlink>'),
    'tracked insertion': (m) => p(r('see ') + '<w:ins w:id="9" ' +
      'w:author="a" w:date="2020-01-01T00:00:00Z">' + m + '</w:ins>'),
    'content control': (m) => p(r('see ') + '<w:sdt><w:sdtPr/>' +
      '<w:sdtContent>' + m + '</w:sdtContent></w:sdt>'),
    'text box': (m) => p(r('see ') + '<w:r><w:pict><w:txbxContent>' +
      p(m) + '</w:txbxContent></w:pict></w:r>'),
    'raw table': (m) => '<w:tbl><w:tr><w:tc>' + p(m) +
      '</w:tc></w:tr></w:tbl>' + p(r('z')),
  };
  /** Note 1 marked in the body and again inside wrap; note 2 too. */
  const wrapped = (wrap) => noteDoc(p(r('ab') + mark(1) + r('cd')) +
    wrap(mark(1)) + p(r('e') + mark(2)), {1: noteP('one'),
    2: noteP('two')});
  /** The same with the second mark of note 1 in a header. */
  const inHeader = async () => {
    const DECL = '<?xml version="1.0" encoding="UTF-8" ' +
      'standalone="yes"?>\n';
    const fns = DECL + `<w:footnotes xmlns:w="${W_NS}" ` +
      `xmlns:r="${R_NS}">` + SEPS + '<w:footnote w:id="1">' +
      noteP('one') + '</w:footnote><w:footnote w:id="2">' +
      noteP('two') + '</w:footnote></w:footnotes>';
    return readDocx(await withHeaders(p(r('ab') + mark(1) + r('cd')) +
      p(r('e') + mark(2)), {default: p(r('H') + mark(1))},
    {parts: {'word/footnotes.xml': fns},
      docRels: [['rIdN1', REL('footnotes'), 'footnotes.xml']]}));
  };
  const cases = Object.entries(WRAPS).map(([k, w]) =>
    [k, () => wrapped(w)]).concat([['header', inHeader]]);

  for (const [name, make] of cases) {
    it('in a ' + name + ': the body mark deleted, the note kept; ' +
      'it lints clean; undo and redo', async () => {
      const {d} = await setup(make());
      assert.deepEqual(await lintErrors(d.doc), []);
      const n0 = d.doc.notes, depth = d.undoDepth;
      const b = para(d);
      deleteSelection(d, span(at(b, 2), at(b, 3)));
      assert.equal(d.undoDepth, depth + 1);
      assert.equal(para(d).text, 'abcd');
      assert.ok(fmap(d).has(1), 'still named');
      assert.ok(fmap(d).has(2));
      checkNotes(d.doc.notes);
      assert.deepEqual(await lintErrors(d.doc), []);
      d.undo();
      assert.equal(d.doc.notes.footnotes.get(1),
        n0.footnotes.get(1), 'the very note');
      assert.equal(para(d).text, 'ab' + OBJ + 'cd');
      d.redo();
      assert.ok(fmap(d).has(1));
      assert.equal(para(d).text, 'abcd');
    });
  }

  it('the container deleted too: the note stays (an orphan); a ' +
    'note marked only in the body still goes', async () => {
    const {d} = await setup(wrapped(WRAPS.hyperlink));
    deleteSelection(d, span(at(para(d), 2), at(para(d), 3)));
    const h = para(d, 1);
    deleteSelection(d, span(at(h, 0), at(h, h.text.length)));
    assert.ok(!para(d, 1).text.includes(OBJ));
    assert.ok(fmap(d).has(1), 'an orphan: never removed');
    const e = para(d, 2);
    deleteSelection(d, span(at(e, 1), at(e, 2)));
    assert.ok(!fmap(d).has(2), 'no other mark: removed');
    assert.deepEqual(await lintErrors(d.doc), []);
  });

  it('cost: the opaque walk runs only when a note would go',
    async () => {
      let body = '';
      const notes = {};
      for (let k = 1; k <= 5000; k++) {
        body += r('x') + mark(k);
        notes[k] = noteP('n' + k);
      }
      const {d, t} = await setup(noteDoc(p(body) + p(r('end')),
        notes));
      const w0 = refStats.walks;
      const e = para(d, 1);
      for (let k = 0; k < 1000; k++) {
        t.type(S.caret(at(e, k)), 'q');
      }
      for (let k = 0; k < 50; k++) {
        run('backspace', d, t, S.caret(at(para(d, 1), 1000 - k)));
      }
      assert.equal(refStats.walks, w0, 'typing: no walk');
      run('backspace', d, t, S.caret(at(para(d), 2)));
      assert.ok(!fmap(d).has(1));
      assert.equal(refStats.walks, w0 + 1, 'one walk for the note');
    });
});

describe('undo and redo of a note edit name the note', () => {
  it('stepTo gives the note key and its caret', async () => {
    const {d} = await setup(four());
    const f = facadeOf(d, {note: {kind: F, id: 2}});
    const nb = f.doc.sections[0].blocks[0];
    const t = new Typing(f);
    t.type(S.caret(at(nb, nb.text.length)), 'zz');
    let ev = null;
    d.on('change', (e) => { ev = e; });
    d.undo();
    const to = stepTo(d.doc, ev.ops, null);
    assert.deepEqual(to.story, {note: {kind: F, id: 2}});
    assert.equal(to.gone, false);
    assert.deepEqual(to.sel.head, at(nb, nb.text.length));
  });

  it('the undo of an insert decides by the mark: the body',
    async () => {
      const {d, t} = await setup(four());
      insertNote(d, t, S.caret(at(para(d), 0)), F);
      let ev = null;
      d.on('change', (e) => { ev = e; });
      d.undo();
      const to = stepTo(d.doc, ev.ops, null);
      assert.equal(to.story, null);
      assert.deepEqual(to.sel.head, at(para(d), 0));
    });
});

describe('hostile', () => {
  it('marks whose notes are missing, and a header with marks: ' +
    'nothing thrown', async () => {
    const {d, t} = await setup(noteDoc(p(r('a') + mark(7) + mark(8)),
      {}));
    const b = para(d);
    deleteSelection(d, span(at(b, 0), at(b, 3)));
    assert.equal(para(d).text, '');
    const out = insertNote(d, t, S.caret(at(para(d), 0)), F);
    assert.equal(out.note.id, 1);
  });
});
