// The notes mode without the desktop (Batch E2): ./NoteEdit enterNote
// puts the window's mode (v.hdr) on a footnote or endnote, its own
// layout placed where its page shows it (./NoteView spotOf: the foot
// of the page, a run after the text); typing goes into the note;
// leaving puts the caret after the mark; an undo of a note edit from
// the body enters that note (./HdrStep, ./NoteEdit goNote); a note
// removed while edited ends the mode. ./NotePick order and steps.
// Real DocLayout, Pages and Document, the fake measurer.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {PlacePrint} from '../../tools/moreapps/!Letters/PlacePrint';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {leaveMode} from '../../tools/moreapps/!Letters/HdrEdit';
import {afterChange} from '../../tools/moreapps/!Letters/HdrStep';
import {enterNote, atStart, isNote}
  from '../../tools/moreapps/!Letters/NoteEdit';
import {spotOf, noteAt, bandsOf}
  from '../../tools/moreapps/!Letters/NoteView';
import {noteList, stepFrom, markOf, markAt}
  from '../../tools/moreapps/!Letters/NotePick';
import {insertNote, customMark}
  from '../../tools/moreapps/!Letters/NoteCmd';
import {deleteSelection} from '../../tools/moreapps/!Letters/EditDel';
import {OBJ} from '../../tools/moreapps/!Letters/Model';
import {toLayout} from '../../tools/moreapps/!Letters/Zoom';
import {p, r} from './build-docx.mjs';
import {noteDoc, noteP, mark, emark, enoteP, words}
  from './note-fixtures.mjs';
import {tm} from './word-docs.mjs';

const F = 'footnote', E = 'endnote';

/** A window's view (./EditView's fields the modes use) over d in
 *  Print layout (draft: no pages). */
function viewOf(d, {draft = false} = {}) {
  const v = {real: d, hdr: null, pending: null, selRev: 0,
    formatListeners: [], typing: new Typing(d), zoom: 1,
    settling() { return false; },
    get d() { return this.hdr ? this.hdr.facade : this.real; },
    get bodyL() { this.ensure(); return this._L; },
    get L() {
      this.ensure();
      const L = this.hdr && this.hdr.layout();
      if (!L && this.hdr) leaveMode(this);
      return L || this._L;
    },
    ensure() {
      if (!this._stale) return;
      this._stale = false;
      this.relaid();
    },
    relaid() {
      const L = new DocLayout(d.doc, tm(), this._L, {top: 40});
      L.layout(900);
      if (!draft) {
        L.place = PlacePrint(L, new Pages(printGalley(L)).finish());
        L.layout(900);
      }
      this._L = L;
    },
    edited(sel) { this.sel = sel; }};
  v.relaid();
  v.sel = S.caret(v._L.docStart());
  d.on('change', (ev) => {
    v._stale = true;
    afterChange(v, ev);
  });
  return v;
}

const body = (d, i = 0) => d.doc.sections[0].blocks[i];
const at = (b, off) => ({id: b.id, off});

/** Two pages of text, marks for footnotes 1 and 2 on the first and
 *  endnote 1 on the second. */
const doc = () => noteDoc(p(r('one') + mark(1) + r(' two') + mark(2)) +
  p(r(words(1500))) + p(r('end') + emark(1)),
{1: noteP('first note'), 2: noteP('second note')},
{endnotes: {1: enoteP('the endnote')}});

const setup = async (opts) => {
  const d = new Document(await doc());
  return {d, v: viewOf(d, opts)};
};

/** The page rectangle of page i in v's body layout. */
const pageRect = (v, i) => {
  const Pl = v.bodyL.place;
  return Pl.sheet.rect(Pl.pages.at(i));
};

describe('NoteView: where notes are', () => {
  it('a footnote at its page foot; an endnote in its run; hits ' +
    'and bands', async () => {
    const {v} = await setup();
    const B = v.bodyL, P = B.place.pages;
    const s1 = spotOf(B, {kind: F, id: 1});
    assert.equal(s1.i, 0);
    const pg = P.at(0);
    assert.ok(s1.y >= pg.bodyTop + pg.notes.y, 'in the foot');
    const s2 = spotOf(B, {kind: F, id: 2});
    assert.ok(s2.y > s1.y, 'note 2 under note 1');
    const e1 = spotOf(B, {kind: E, id: 1});
    assert.ok(e1 && e1.i >= 1, 'the endnote after the text');
    const r0 = pageRect(v, 0);
    const hit = noteAt(B, r0.x + s1.x + 5, r0.y + s1.y + 3);
    assert.deepEqual(hit, {kind: F, id: 1, i: 0});
    const re = pageRect(v, e1.i);
    assert.deepEqual(noteAt(B, re.x + e1.x + 5, re.y + e1.y + 3),
      {kind: E, id: 1, i: e1.i});
    assert.equal(noteAt(B, r0.x + 100, r0.y + pg.bodyTop + 5), null,
      'the body');
    assert.equal(bandsOf(B, 0).length, 1);
    assert.ok(bandsOf(B, e1.i).length >= 1);
    assert.equal(spotOf(B, {kind: F, id: 9}), null, 'no such note');
  });
});

describe('NotePick', () => {
  it('the notes in mark order, steps stop at the ends; the mark ' +
    'under a point', async () => {
    const {d, v} = await setup();
    assert.deepEqual(noteList(d.doc).map((x) => x.kind + x.id),
      ['footnote1', 'footnote2', 'endnote1']);
    assert.deepEqual(stepFrom(d.doc, {kind: F, id: 2}, 1),
      {kind: E, id: 1});
    assert.equal(stepFrom(d.doc, {kind: E, id: 1}, 1), null);
    assert.equal(stepFrom(d.doc, {kind: F, id: 1}, -1), null);
    assert.deepEqual(markOf(d.doc, {kind: F, id: 2}),
      {id: body(d).id, off: 8});
    const B = v.bodyL;
    const c = B.caretRect(at(body(d), 3), 'down');
    const c2 = B.caretRect(at(body(d), 4), 'up');
    const x = (c.x + c2.x) / 2;
    assert.deepEqual(markAt(B, at(body(d), 3), x), {kind: F, id: 1});
    assert.deepEqual(markAt(B, at(body(d), 4), x), {kind: F, id: 1});
    assert.equal(markAt(B, at(body(d), 2), c.x - 10), null);
  });

  it('noteList follows a custom mark set and cleared in a table ' +
    'cell (the memo\'s version key: the sections and notes stay the ' +
    'same objects)', async () => {
    const tbl = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' +
      '</w:tblPr><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid>' +
      '<w:tr><w:tc>' + p(r('c') + mark(1)) + '</w:tc></w:tr></w:tbl>';
    // (the note has no own mark: customMark changes the body only)
    const d = new Document(await noteDoc(tbl + p(r('z')),
      {1: p(r('one'))}));
    const secs = d.doc.sections, sec0 = secs[0], notes = d.doc.notes;
    assert.equal(noteList(d.doc)[0].custom, null);
    assert.equal(customMark(d, null, F, 1, '*').changed, true);
    assert.equal(d.doc.sections, secs, 'the same sections array');
    assert.equal(d.doc.sections[0], sec0, 'the same section');
    assert.equal(d.doc.notes, notes, 'the same notes');
    assert.equal(noteList(d.doc)[0].custom, '*');
    customMark(d, null, F, 1, null);
    assert.equal(noteList(d.doc)[0].custom, null);
  });
});

describe('enterNote: the mode on a note', () => {
  it('the caret in the note at its page foot; typing goes in the ' +
    'note; leaving puts the caret after the mark', async () => {
    const {d, v} = await setup();
    const m = enterNote(v, {kind: F, id: 2});
    assert.ok(isNote(m));
    assert.equal(v.hdr, m);
    v.sel = atStart(v);
    const nb = v.d.doc.sections[0].blocks[0];
    assert.equal(v.sel.head.off, 2, 'after its mark and the space');
    assert.equal(v.sel.head.id, nb.id);
    const pg = v.bodyL.place.pages.at(0), r0 = pageRect(v, 0);
    const c = v.L.caretRect(v.sel.head, 'down');
    assert.ok(c.y >= r0.y + pg.bodyTop + pg.notes.y && c.y <
      r0.y + pg.bodyTop + pg.notes.y + pg.notes.h, 'in the foot');
    v.sel = v.typing.type(v.sel, 'new ');
    const n2 = d.doc.notes.footnotes.get(2).blocks[0];
    assert.equal(n2.text, OBJ + ' new second note');
    assert.equal(body(d).text, 'one' + OBJ + ' two' + OBJ);
    const c2 = v.L.caretRect(v.sel.head, 'down');
    assert.ok(c2.x > c.x && Math.abs(c2.y - c.y) < 2, 'after it');
    assert.match(m.info(), /^Page 1 of \d+ - Footnote 2$/);
    leaveMode(v);
    assert.equal(v.hdr, null);
    assert.deepEqual(v.sel.head, at(body(d), 9));
  });

  it('an endnote: the caret where the run shows it', async () => {
    const {v} = await setup();
    const m = enterNote(v, {kind: E, id: 1});
    assert.ok(m);
    v.sel = atStart(v);
    const e1 = spotOf(v.bodyL, {kind: E, id: 1});
    const r = pageRect(v, e1.i), c = v.L.caretRect(v.sel.head, 'down');
    assert.ok(c.y >= r.y + e1.y - 2 && c.y < r.y + e1.y + 40,
      'at the run');
    assert.match(m.info(), /Endnote/);
  });

  it('refused: no such note, a separator, no pages (Draft)',
    async () => {
      const {v} = await setup();
      assert.equal(enterNote(v, {kind: F, id: 99}), null);
      assert.equal(enterNote(v, {kind: F, id: 0}), null);
      assert.equal(enterNote(v, null), null);
      assert.equal(v.hdr, null);
      const {v: dv} = await setup({draft: true});
      assert.equal(enterNote(dv, {kind: F, id: 1}), null);
    });

  it('the hit test in the mode: a click in the note lands in it',
    async () => {
      const {v} = await setup();
      enterNote(v, {kind: F, id: 1});
      v.sel = atStart(v);
      const c = v.L.caretRect(v.sel.head, 'down');
      const p0 = toLayout(c.x + 20, c.y + 3, 1, v.L.top);
      const h = v.L.hitTest(p0.x, p0.y);
      assert.equal(h.pos.id, v.d.doc.sections[0].blocks[0].id);
      assert.ok(h.pos.off > 2);
    });
});

describe('undo, redo and the mode', () => {
  it('an undo in the body of a note edit enters that note, the ' +
    'caret at the change', async () => {
    const {d, v} = await setup();
    enterNote(v, {kind: F, id: 1});
    v.sel = atStart(v);
    v.sel = v.typing.type(v.sel, 'abc');
    leaveMode(v);
    assert.equal(v.hdr, null);
    v.typing.command(() => d.undo());
    assert.ok(isNote(v.hdr), 'in the note');
    assert.deepEqual(v.hdr.note, {kind: F, id: 1});
    const nb = d.doc.notes.footnotes.get(1).blocks[0];
    assert.deepEqual(v.sel.head, at(nb, 2));
    // and from another note: the redo goes back to note 1
    enterNote(v, {kind: F, id: 2});
    v.typing.command(() => d.redo());
    assert.deepEqual(v.hdr.note, {kind: F, id: 1});
  });

  it('the undo of the insert while in the new note: the mode ends, ' +
    'the caret in the body where the mark was', async () => {
    const {d, v} = await setup();
    const out = insertNote(d, v.typing, S.caret(at(body(d), 3)), F);
    v.sel = out.sel;
    assert.ok(enterNote(v, out.note));
    v.sel = atStart(v);
    v.typing.command(() => d.undo());
    assert.equal(v.hdr, null);
    assert.deepEqual(v.sel.head, at(body(d), 3));
    assert.equal(body(d).text, 'one' + OBJ + ' two' + OBJ);
  });

  it('the note removed by another path: the mode ends, nothing ' +
    'thrown', async () => {
    const {d, v} = await setup();
    enterNote(v, {kind: F, id: 1});
    v.sel = atStart(v);
    const b = body(d);
    deleteSelection(d, S.select(at(b, 0), at(b, 5)));
    assert.equal(v.hdr, null);
    assert.ok(!d.doc.notes.footnotes.has(1));
    assert.ok(v.L, 'the body laid out');
  });
});
