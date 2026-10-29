// NoteLayout (Batch E2): a footnote laid out at a width by the galley
// code, its lines' bottoms for cutting it between pages, memoised per
// note object, width and the number its own mark shows; the
// separator notes.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {layoutNote, sepOf, pieceH, RULE_W}
  from '../../tools/moreapps/!Letters/NoteLayout';
import {OBJ} from '../../tools/moreapps/!Letters/Model';
import {p, r} from './build-docx.mjs';
import {noteDoc, mark, noteP, words} from './note-fixtures.mjs';
import {tm} from './word-docs.mjs';

let doc, metrics;
before(async () => {
  doc = await noteDoc(p(r('a') + mark(5)) + p(r('b') + mark(2)),
    {2: noteP('two') + p(r('more')), 5: noteP(words(40))});
  metrics = tm();
});
const fnote = (id) => doc.notes.footnotes.get(id);

describe('NoteLayout: a note laid out', () => {
  it('its lines\' bottoms go down; h holds them all', () => {
    const a = layoutNote(doc, fnote(2), 400, metrics);
    assert.equal(a.lines.length, 2);
    assert.ok(a.lines[0] > 0 && a.lines[1] > a.lines[0]);
    assert.ok(a.h >= a.lines[1]);
    const b = layoutNote(doc, fnote(5), 200, metrics);
    assert.ok(b.lines.length > 3, `${b.lines.length}`);
    for (let i = 1; i < b.lines.length; i++) {
      assert.ok(b.lines[i] > b.lines[i - 1]);
    }
  });

  it('pieceH: the px of lines from..to-1 (to the end: h)', () => {
    const a = layoutNote(doc, fnote(5), 200, metrics);
    const n = a.lines.length;
    assert.equal(pieceH(a, 0, n), a.h);
    assert.equal(pieceH(a, 0, 1), a.lines[0]);
    assert.equal(pieceH(a, 1, 3), a.lines[2] - a.lines[0]);
    assert.equal(pieceH(a, 2, n), a.h - a.lines[1]);
    assert.equal(pieceH(a, 2, 2), 0);
  });

  it('memoised per note object and width', () => {
    const a = layoutNote(doc, fnote(2), 400, metrics);
    assert.equal(layoutNote(doc, fnote(2), 400, metrics), a);
    assert.notEqual(layoutNote(doc, fnote(2), 300, metrics), a);
    const edited = {...fnote(2), blocks: [...fnote(2).blocks]};
    assert.notEqual(layoutNote(doc, edited, 400, metrics), a);
  });

  it('self marks show the note\'s number', () => {
    for (const [id, want] of [[5, '1'], [2, '2']]) {
      const a = layoutNote(doc, fnote(id), 400, metrics);
      const it = a.L.items[0], para = it.block;
      const at = para.text.indexOf(OBJ);
      assert.equal(a.L.fieldText(para, at).text, want);
      assert.equal(a.L.noteId, id);
    }
    const nums = {footnotes: new Map([[5, '7'], [2, '1']]),
      endnotes: new Map()};
    const a = layoutNote(doc, fnote(5), 400, metrics,
      {fields: {noteNums: nums}});
    const para = a.L.items[0].block;
    assert.equal(a.L.fieldText(para, para.text.indexOf(OBJ)).text, '7');
  });

  it('a note with no blocks: no lines, no height', () => {
    const a = layoutNote(doc, {...fnote(2), blocks: []}, 400, metrics);
    assert.deepEqual([...a.lines], []);
    assert.equal(a.h, 0);
  });
});

describe('NoteLayout: separators', () => {
  it('the separator is a rule 2 inches long, the continuation ' +
    'separator the width; a missing notice is nothing', () => {
    const s = sepOf(doc, 'footnote', 'separator', 400, metrics);
    assert.equal(s.rule, RULE_W);
    assert.ok(s.h > 0);
    const c = sepOf(doc, 'footnote', 'continuationSeparator', 400,
      metrics);
    assert.equal(c.rule, 400);
    assert.equal(sepOf(doc, 'footnote', 'continuationNotice', 400,
      metrics), null);
  });

  it('no separator notes in the file: a default rule', async () => {
    const d = await noteDoc(p(r('a') + mark(1)), {1: noteP('x')},
      {seps: false});
    const s = sepOf(d, 'footnote', 'separator', 400, metrics);
    assert.equal(s.rule, RULE_W);
    assert.ok(s.h > 0);
    assert.equal(s.lay, null);
  });

  it('a notice with text is laid out as a note', async () => {
    const d = await noteDoc(p(r('a') + mark(1)), {1: noteP('x')},
      {notice: p(r('continued'))});
    const s = sepOf(d, 'footnote', 'continuationNotice', 400, metrics);
    assert.equal(s.rule, 0);
    assert.ok(s.h > 0 && s.lay);
  });
});
