// ImpBuild structure (ODT and .doc import, task 3): styles, lists,
// headers and footers, notes, comments, pictures, tracked changes,
// fields, links and bookmarks, built through the neutral builder.
// Every Doc made must pass the Model checks, write as .docx and read
// back equal (docx-compare's assertSameDoc after expectedBack and
// withNewReview), as the RTF reader's do. Inputs are small
// spec-derived calls, not files; the PNG is made by pic-fixtures.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {ImpBuild} from '../../tools/moreapps/!Letters/ImpBuild';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkBlock, OBJ} from '../../tools/moreapps/!Letters/Model';
import {checkNotes, checkComments}
  from '../../tools/moreapps/!Letters/ModelCheck';
import {refsOf, storyOfRef}
  from '../../tools/moreapps/!Letters/SectRefs';
import {docScope} from '../../tools/moreapps/!Letters/WriteBody';
import {resolvePara, resolveRun}
  from '../../tools/moreapps/!Letters/Styles';
import {levelOf} from '../../tools/moreapps/!Letters/ReadNumbering';
import {settingsOf} from '../../tools/moreapps/!Letters/SettingsRead';
import {maxParagraphs} from '../../tools/moreapps/!Letters/ReadBody';
import {MAX_AUTHORS} from '../../tools/moreapps/!Letters/RtfRevs';
import {el} from '../../tools/moreapps/!WimpLib/Xml';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {assertSameDoc, expectedBack, withNewParts, withNewStories,
  withNewReview} from './docx-compare.mjs';
import {lintPackage} from './lint-package.mjs';
import {pngBytes} from './pic-fixtures.mjs';
import {emit} from './word-emit.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const make = (o = {}) => new ImpBuild({date: DATE, ...o});
const blocks = (doc) => doc.sections.flatMap((s) => s.blocks);
const P = {pPr: {extra: []}};
const plain = {rPr: {extra: []}};
const sup = {rPr: {vertAlign: 'superscript', extra: []}};
const attr = (n, k) => (n.attrs.find(([a]) => a === k) || [])[1];
const kinds = (p) => Object.entries(p.inlines).map(([k, x]) =>
  [Number(k), x.node && x.kind === 'raw' ? x.node.name.slice(2)
    : x.kind]);

function valid(doc) {
  for (const b of blocks(doc)) checkBlock(b);
  for (const st of doc.stories.values()) {
    for (const b of st.blocks) checkBlock(b);
  }
  checkNotes(doc.notes);
  checkComments(doc.comments);
}

async function roundTrips(doc, what) {
  valid(doc);
  const bytes = await writeDocx(doc, {date: DATE});
  emit('imp-structure-' + what.replaceAll(' ', '-'), bytes);
  const errors = lintPackage(await readZip(bytes)).problems
    .filter((q) => q.level === 'error');
  assert.deepEqual(errors, [], what);
  const back = await readDocx(bytes);
  assertSameDoc(back, withNewReview(withNewStories(withNewParts(
    expectedBack(doc), back), back), back), what);
  return back;
}

/** A story of one paragraph s; its blocks. */
function storyOf(b, s, fmt = plain) {
  const st = b.story();
  st.text(s, fmt);
  st.endPara(P);
  return st.end();
}

describe('ImpBuild: styles and lists', () => {
  it('a style table with basedOn resolves and round-trips',
    async () => {
      const b = make();
      // (a child given before its parent: basedOn is resolved at the
      // end; 'Heading 1' is the built-in's, replaced under its id)
      const quote = b.addStyle({id: 'P2', name: 'Quote Text',
        type: 'paragraph', basedOn: 'P1', next: 'P1',
        pPr: {jc: 'center', extra: []}});
      const body = b.addStyle({id: 'P1', name: 'Body Text Imp',
        type: 'paragraph', rPr: {i: true, extra: []}});
      const h1 = b.addStyle({id: 'H', name: 'heading 1',
        type: 'paragraph', rPr: {b: true, sz: 32, extra: []}});
      const em = b.addStyle({id: 'C1', name: 'Strong Imp',
        type: 'character', rPr: {b: true, extra: []}});
      assert.equal(b.styleId('P2'), quote);
      assert.equal(b.addStyle({id: 'X', type: 'nonsense'}), null);
      b.docDefaults({rPr: {sz: 22, extra: []}});
      b.text('quoted ', plain);
      b.text('strong', {rPr: {extra: []}, rStyle: em});
      b.endPara({pPr: {extra: []}, pStyle: quote});
      b.text('head', plain);
      b.endPara({pPr: {extra: []}, pStyle: h1});
      const {doc} = b.finish();
      const st = doc.styles.styles;
      assert.equal(st.get(quote).basedOn, body);
      assert.equal(st.get(quote).next, body);
      assert.equal(st.get(h1).name, 'heading 1');
      assert.equal(st.get(h1).rPr.b, true);
      assert.equal(st.get(em).type, 'character');
      assert.equal(doc.styles.docDefaults.rPr.sz, 22);
      const [p] = blocks(doc);
      assert.equal(resolvePara(doc.styles, p).jc, 'center');
      assert.equal(resolveRun(doc.styles, p, p.runs[0]).i, true);
      const back = await roundTrips(doc, 'styles');
      assert.equal(back.styles.styles.get(quote).basedOn, body);
    });

  it('a bulleted two-level list gives numbering and numPr',
    async () => {
      const b = make();
      const id = b.list([
        {fmt: 'bullet', text: '\u2022', start: 1,
          indent: {left: 720, hanging: 360},
          rPr: {rFonts: {ascii: 'Symbol', hAnsi: 'Symbol'}}},
        {fmt: 'lowerLetter', text: '%2.', start: 3,
          indent: {left: 1440, hanging: 360}}]);
      assert.equal(id, 1);
      for (const [s, ilvl] of [['one', 0], ['two', 1]]) {
        b.text(s, plain);
        b.endPara({pPr: {numPr: {numId: id, ilvl}, extra: []}});
      }
      const again = b.listOverride(id, {1: 7});
      assert.equal(again, 2);
      assert.equal(b.list([]), null);
      const {doc} = b.finish();
      const num = doc.numbering.nums.get(id);
      const l0 = levelOf(num, 0), l1 = levelOf(num, 1);
      assert.deepEqual([l0.numFmt, l0.lvlText, l0.start],
        ['bullet', '\u2022', 1]);
      assert.deepEqual(l0.pPr.ind, {left: 720, hanging: 360});
      assert.equal(l0.rPr.rFonts.ascii, 'Symbol');
      assert.deepEqual([l1.numFmt, l1.lvlText, l1.start],
        ['lowerLetter', '%2.', 3]);
      assert.equal(doc.numbering.nums.get(again).overrides.get(1).start,
        7);
      assert.deepEqual(blocks(doc).map((p) => p.pPr.numPr),
        [{numId: 1, ilvl: 0}, {numId: 1, ilvl: 1}]);
      const back = await roundTrips(doc, 'list');
      assert.equal(levelOf(back.numbering.nums.get(id), 1).lvlText,
        '%2.');
    });
});

describe('ImpBuild: headers, footers and notes', () => {
  it('a header and footer attach to their section', async () => {
    const b = make();
    b.header('default', storyOf(b, 'Head one'));
    b.footer('even', storyOf(b, 'Foot even'));
    b.text('first section', plain);
    b.endPara(P);
    b.sectionEnd({});
    b.header('first', storyOf(b, 'Head first'));
    b.text('second section', plain);
    b.endPara(P);
    const {doc, notes} = b.finish();
    assert.deepEqual(notes, []);
    const map = docScope(doc).map;
    const text = (rId) => doc.stories.get(storyOfRef(doc, rId))
      .blocks.map((p) => p.text);
    const r0 = refsOf(doc.sections[0], map);
    const r1 = refsOf(doc.sections[1], map);
    assert.deepEqual(text(r0.hdr.default), ['Head one']);
    assert.deepEqual(text(r0.ftr.even), ['Foot even']);
    assert.deepEqual(Object.keys(r1.hdr), ['first']);
    assert.deepEqual(text(r1.hdr.first), ['Head first']);
    assert.equal(settingsOf(doc).evenAndOddHeaders, true);
    await roundTrips(doc, 'headers');
  });

  it('a footnote reference and body round-trip', async () => {
    const b = make();
    b.text('Text', plain);
    const ref = b.footnote(storyOf(b, ' The note.'));
    b.obj(ref, sup);
    const en = b.endnote(storyOf(b, ' End.'));
    b.obj(en, sup);
    b.endPara(P);
    const {doc, notes} = b.finish();
    assert.deepEqual(notes, []);
    assert.deepEqual([ref.kind, ref.note, ref.id], ['noteRef',
      'footnote', 1]);
    const [p] = blocks(doc);
    assert.equal(p.text, 'Text' + OBJ + OBJ);
    const fn = doc.notes.footnotes.get(1);
    assert.equal(fn.blocks[0].text, OBJ + ' The note.');
    assert.equal(fn.blocks[0].inlines[0].self, true);
    assert.equal(doc.notes.endnotes.get(1).blocks[0].text,
      OBJ + ' End.');
    const back = await roundTrips(doc, 'notes');
    assert.equal(back.notes.footnotes.get(1).blocks[0].text,
      OBJ + ' The note.');
  });

  it('a note mark never placed leaves its note out; a note in a ' +
    'story is refused', () => {
    const b = make();
    b.footnote(storyOf(b, 'lost'));
    const s = b.story();
    assert.equal(b.footnote(storyOf(b, 'inner')), null);
    s.end();
    b.text('x', plain);
    b.endPara(P);
    const {doc, notes} = b.finish();
    assert.equal([...doc.notes.footnotes.values()]
      .filter((n) => n.type === 'normal').length, 0);
    assert.ok(notes.some((n) => /notes in headers/.test(n)));
    assert.ok(notes.some((n) => /mark is not in the text/.test(n)));
  });
});

describe('ImpBuild: comments', () => {
  it('a comment with replies keeps author and date', async () => {
    const b = make();
    const c = b.comment({author: 'Alice  Author', initials: 'AA',
      date: '2024-05-06T07:08:00', story: storyOf(b, 'Look here')});
    const r = b.comment({author: 'Bob', initials: 'B',
      date: 3, story: storyOf(b, 'Agreed'), parent: c});
    const r2 = b.comment({author: 'Cy', date: new Date(Date.UTC(
      2024, 0, 2, 3, 4, 5)), story: storyOf(b, 'Me too'),
    parent: r.id});
    b.text('A ', plain);
    b.obj(c.start);
    b.text('commented', plain);
    b.obj(c.end);
    b.obj(c.ref);
    b.obj(r.ref);
    b.obj(r2.ref);
    b.endPara(P);
    const {doc, notes} = b.finish();
    assert.deepEqual(notes, []);
    const m = doc.comments.map;
    assert.deepEqual([m.get(c.id).author, m.get(c.id).initials,
      m.get(c.id).date], ['Alice Author', 'AA',
      '2024-05-06T07:08:00Z']);
    // (a bad date is none, never made up)
    assert.equal(m.get(r.id).date, null);
    assert.equal(m.get(r2.id).date, '2024-01-02T03:04:05Z');
    assert.equal(m.get(r.id).parent, c.id);
    // (a reply to a reply has the thread's first as its parent)
    assert.equal(m.get(r2.id).parent, c.id);
    assert.equal(m.get(c.id).blocks[0].text, OBJ + 'Look here');
    const back = await roundTrips(doc, 'comments');
    assert.equal(back.comments.map.get(r2.id).parent, c.id);
  });

  it('a comment whose mark is never placed is left out with its ' +
    'range; a range left open ends at the mark', async () => {
    const b = make();
    const lost = b.comment({author: 'A', story: storyOf(b, 'x')});
    const kept = b.comment({author: 'B', story: storyOf(b, 'y')});
    b.obj(lost.start);
    b.obj(kept.start);
    b.text('text', plain);
    b.obj(kept.ref);
    b.endPara(P);
    const {doc} = b.finish();
    assert.deepEqual([...doc.comments.map.keys()], [kept.id]);
    const [p] = blocks(doc);
    assert.deepEqual(kinds(p).map((k) => k[1]),
      ['cmtStart', 'cmtEnd', 'cmtRef']);
    await roundTrips(doc, 'comment range');
  });
});

describe('ImpBuild: pictures', () => {
  it('a PNG picture round-trips and an unknown type notes and ' +
    'returns null', async () => {
    const b = make();
    const png = pngBytes(4, 2);
    const x = b.picture(png, {cx: 914400, cy: 457200,
      name: 'Logo', alt: 'A grey box'});
    assert.equal(x.kind, 'raw');
    b.obj(x, plain);
    b.endPara(P);
    assert.equal(b.picture(new Uint8Array([1, 2, 3, 4, 5]), {}), null);
    assert.equal(b.picture('not bytes', {}), null);
    // (a header's picture is related from the header's own rels)
    const s = b.story();
    s.obj(b.picture(png, {}), plain);
    s.endPara(P);
    b.header('default', s.end());
    const {doc, notes} = b.finish();
    assert.ok(notes.some((n) => /format !Letters does not keep/
      .test(n)));
    const media = [...doc.parts.keys()].filter((k) => /media/.test(k));
    assert.equal(media.length, 2);
    const docPr = x.node.children[0].children
      .find((n) => /docPr$/.test(n.name));
    assert.deepEqual([attr(docPr, 'name'), attr(docPr, 'descr')],
      ['Logo', 'A grey box']);
    const story = [...doc.stories.values()][0];
    assert.equal(story.rels.length, 1);
    await roundTrips(doc, 'pictures');
  });
});

describe('ImpBuild: tracked changes', () => {
  it('a deleted run in the body is a w:del, in a story it is dropped',
    async () => {
      const b = make();
      const del = b.rev({kind: 'del', author: 'Alice',
        date: '2024-05-06T07:08:09Z'});
      const ins = b.rev({kind: 'ins', author: 'Bob'});
      assert.equal(b.rev({kind: 'del', author: 'Alice',
        date: '2024-05-06T07:08:09Z'}), del);
      assert.equal(b.rev({kind: 'moved'}), null);
      b.text('kept ', plain);
      b.text('gone', {rPr: {extra: []}, rev: del});
      b.text(' new', {rPr: {extra: []}, rev: ins});
      // (a picture: untagged in an insertion, left out of a deletion)
      b.obj(b.picture(pngBytes(2, 2), {}), {rPr: {extra: []},
        rev: ins});
      b.obj(b.picture(pngBytes(2, 2), {}), {rPr: {extra: []},
        rev: del});
      b.endPara(P);
      const s = b.story();
      s.text('head ', plain);
      s.text('cut', {rPr: {extra: []}, rev: del});
      s.text('added', {rPr: {extra: []}, rev: ins});
      s.endPara(P);
      b.header('default', s.end());
      const {doc, notes} = b.finish();
      const [p] = blocks(doc);
      assert.equal(p.text, 'kept gone new' + OBJ);
      const tagOf = (k) => p.runs.find((r) => r.start <= k &&
        k < r.end).rev;
      assert.equal(tagOf(5).kind, 'del');
      assert.equal(tagOf(5).author, 'Alice');
      assert.equal(tagOf(5).date, '2024-05-06T07:08:09Z');
      assert.equal(tagOf(10).kind, 'ins');
      assert.equal(tagOf(13), undefined);
      const story = [...doc.stories.values()][0];
      assert.equal(story.blocks[0].text, 'head added');
      assert.ok(story.blocks[0].runs.every((r) => !r.rev));
      assert.ok(notes.some((n) => /tracked changes in headers/
        .test(n)));
      assert.ok(notes.some((n) => /deleted pictures/.test(n)));
      const back = await roundTrips(doc, 'revisions');
      const q = blocks(back)[0];
      assert.equal(q.runs.find((r) => r.start === 5).rev.kind, 'del');
    });

  it('the paragraph mark takes a revision in the body only',
    async () => {
      const b = make();
      const ins = b.rev({kind: 'ins'});
      const del = b.rev({kind: 'del', author: 'A'});
      b.text('a', plain);
      const p = b.endPara({pPr: {extra: []}, rev: ins});
      assert.equal(p.pPr.extra.at(-1).name, 'w:rPr');
      assert.equal(p.pPr.extra.at(-1).children[0].name, 'w:ins');
      // (a w:rPr the caller gave takes the mark first: one w:rPr)
      b.text('b', plain);
      const q = b.endPara({pPr: {extra: [el('w:rPr', [],
        el('w:ins', [['w:id', '99']]), el('w:b'))]}, rev: del});
      const rPrs = q.pPr.extra.filter((n) => n.name === 'w:rPr');
      assert.equal(rPrs.length, 1);
      assert.deepEqual(rPrs[0].children.map((n) => n.name),
        ['w:del', 'w:b']);
      const s = b.story();
      s.text('c', plain);
      assert.equal(s.endPara({pPr: {extra: []}, rev: ins}).pPr.extra
        .length, 0);
      s.end();
      const {doc} = b.finish();
      await roundTrips(doc, 'paragraph mark revision');
    });

  it(`past ${MAX_AUTHORS} authors, the rest are unknown`, () => {
    const b = make();
    const keys = [];
    for (let i = 0; i < MAX_AUTHORS + 5; i++) {
      keys.push(b.rev({kind: 'ins', author: 'Author ' + i}));
    }
    assert.equal(keys[MAX_AUTHORS - 1].author,
      'Author ' + (MAX_AUTHORS - 1));
    assert.equal(keys[MAX_AUTHORS].author, undefined);
    // (one already known stays known)
    assert.equal(b.rev({kind: 'del', author: 'Author 3'}).author,
      'Author 3');
    assert.ok(b.finish().notes.some((n) => /authors of changes/
      .test(n)));
  });
});

describe('ImpBuild: hostile strings', () => {
  const HOSTILE = ['a\x01b', '\x00', 'x\x1fy', '\ud800', 'p\udc00q',
    'z'.repeat(10000), '__proto__', 't\tn\nr\r'];
  const bad = /[\x00-\x08\x0b-\x1f]/;

  for (const [k, h] of HOSTILE.entries()) {
    it('string ' + k + ' (' + JSON.stringify(h.slice(0, 12)) +
      ') in every name, code, target and property writes and reads ' +
      'back', async () => {
      const b = make();
      const sid = b.addStyle({id: h, name: h, type: 'paragraph',
        rPr: {rFonts: {ascii: h, hAnsi: h}, extra: []}});
      assert.ok(sid);
      b.addStyle({id: h + '2', name: h, type: 'character'});
      b.docDefaults({rPr: {rFonts: {ascii: h}, extra: []}});
      const numId = b.list([{fmt: 'bullet', text: h, start: 1,
        indent: {left: 720, hanging: 360},
        rPr: {rFonts: {ascii: h.slice(0, 60), hAnsi: h}}}]);
      const rev = b.rev({kind: 'ins', author: h, date: h});
      b.text(h, {rPr: {rFonts: {ascii: h}, extra: []}, rStyle: h,
        rev});
      b.obj(b.picture(pngBytes(2, 2), {name: h, alt: h}), plain);
      b.link({url: 'https://example.com/', tip: h}, h, plain);
      b.link(h, h, plain);
      b.link('#' + h, h, plain);
      b.bookmark(h, 'start');
      b.bookmark(h, 'end');
      b.field({code: 'PAGE ' + h, result: h});
      b.field({code: h, result: h});
      const c = b.comment({author: h, initials: h, date: h,
        story: storyOf(b, h)});
      b.obj(c.ref);
      b.endPara({pPr: {numPr: {numId, ilvl: 0}, extra: []},
        pStyle: sid});
      b.text('second', plain);
      b.endPara({pPr: {extra: []}, pStyle: h});
      b.sectionEnd({extra: [el('w:x' + h)]});
      const {doc} = b.finish();
      const author = doc.comments.map.get(c.id).author;
      assert.ok(!bad.test(author) && author.isWellFormed());
      assert.ok([...author].length <= 255);
      assert.ok(!bad.test(doc.styles.styles.get(sid).name));
      await roundTrips(doc, 'hostile ' + k);
    });
  }

  it('an inline whose node holds a control character is left out',
    () => {
      const b = make();
      b.obj({kind: 'raw', level: 'r', node: el('w:t', [], 'a\x01')});
      b.obj({kind: 'raw', level: 'r', node: el('w:x', [['w:v',
        '\ud800']])});
      b.text('ok', plain);
      b.endPara(P);
      const {doc, notes} = b.finish();
      assert.equal(blocks(doc)[0].text, 'ok');
      assert.equal(notes.length, 1);
    });
});

describe('ImpBuild: marks in paragraphs left out', () => {
  it('a note and a comment whose paragraph is refused are left out',
    async () => {
      const b = make();
      const fn = b.footnote(storyOf(b, 'n'));
      const c = b.comment({author: 'A', story: storyOf(b, 'c')});
      b.obj(c.start);
      b.text('text', plain);
      b.obj(c.end);
      b.obj(c.ref);
      b.obj(fn, sup);
      b.obj({kind: 'weird', level: 'r'});
      assert.equal(b.endPara(P), null);
      b.text('kept', plain);
      b.endPara(P);
      const {doc, notes} = b.finish();
      assert.equal([...doc.notes.footnotes.values()]
        .filter((n) => n.type === 'normal').length, 0);
      assert.equal(doc.comments.map.size, 0);
      assert.ok(notes.some((n) => /mark is not in the text/.test(n)));
      await roundTrips(doc, 'marks refused');
    });

  it('and when the paragraph cap drops their paragraph', () => {
    const b = make({max: 1});
    b.text('one', plain);
    b.endPara(P);
    const fn = b.footnote(storyOf(b, 'n'));
    const c = b.comment({author: 'A', story: storyOf(b, 'c')});
    // (the stories' paragraphs reach the cap first: no story, no note)
    assert.equal(fn === null || c === null || b.stopped, true);
    const {doc} = b.finish();
    assert.equal(doc.comments.map.size, 0);
    assert.equal([...doc.notes.footnotes.values()]
      .filter((n) => n.type === 'normal').length, 0);
  });

  it('a range whose start was in a paragraph left out is taken out ' +
    'but the comment kept', async () => {
    const b = make({max: 3});
    const fn = b.footnote(storyOf(b, 'n'));
    const c = b.comment({author: 'A', story: storyOf(b, 'c')});
    b.obj(c.start);
    b.obj({kind: 'weird', level: 'r'});
    b.endPara(P);
    b.text('x', plain);
    b.obj(c.end);
    b.obj(c.ref);
    b.endPara(P);
    b.text('y', plain);
    b.obj(fn, sup);
    // (the cap: this paragraph is the fourth)
    assert.equal(b.endPara(P), null);
    const {doc} = b.finish();
    assert.deepEqual([...doc.comments.map.keys()], [c.id]);
    assert.deepEqual(kinds(blocks(doc)[0]).map((x) => x[1]),
      ['cmtRef']);
    assert.equal([...doc.notes.footnotes.values()]
      .filter((n) => n.type === 'normal').length, 0);
    await roundTrips(doc, 'range left out');
  });

  it('a note mark in a link ends the link and keeps the note',
    async () => {
      const b = make();
      const fn = b.footnote(storyOf(b, 'n'));
      b.fieldStart({code: 'HYPERLINK "https://example.com/"'});
      b.text('before', plain);
      b.obj(fn, sup);
      b.text('after', plain);
      b.fieldEnd();
      b.endPara(P);
      const {doc} = b.finish();
      const [p] = blocks(doc);
      assert.deepEqual(kinds(p).map((x) => x[1]),
        ['hyperlink', 'noteRef', 'hyperlink']);
      assert.ok(doc.notes.footnotes.get(1));
      await roundTrips(doc, 'note in link');
    });
});

describe('ImpBuild: fields, links and bookmarks', () => {
  it('a PAGE field is kept, an INCLUDETEXT field becomes its result ' +
    'text', async () => {
    const b = make();
    b.text('Page ', plain);
    b.field({code: 'PAGE', result: '1', dirty: true});
    b.text(' ', plain);
    b.field({code: 'INCLUDETEXT "c:\\\\secret.txt"', result: 'old'});
    b.text(' ', plain);
    b.field({code: 'NOTAFIELD!', result: 'r'});
    b.endPara(P);
    const {doc, notes} = b.finish();
    const [p] = blocks(doc);
    assert.equal(p.text, 'Page ' + OBJ + OBJ + OBJ + '1' + OBJ +
      ' old r');
    assert.deepEqual(kinds(p).map((k) => k[1]),
      ['fldChar', 'instrText', 'fldChar', 'fldChar']);
    assert.equal(attr(p.inlines[5].node, 'w:dirty'), '1');
    assert.deepEqual(p.inlines[6].node.children, [' PAGE ']);
    assert.ok(notes.some((n) => /fields of a kind/.test(n)));
    await roundTrips(doc, 'fields');
  });

  it('a link with an external target is kept as a link, never ' +
    'fetched', async () => {
    const b = make();
    b.text('See ', plain);
    assert.equal(b.link('https://example.com/a?b=1', 'the site',
      plain), true);
    b.text(' and ', plain);
    b.link('#Intro', 'intro', plain);
    b.bookmark('Intro', 'start');
    b.text('here', plain);
    b.bookmark('Intro', 'end');
    assert.equal(b.bookmark('Intro', 'start'), false);
    b.endPara(P);
    // a HYPERLINK field is a link too; one in a footnote is related
    // from the notes part
    const s = b.story();
    s.fieldStart({code: 'HYPERLINK "http://example.org/"'});
    s.text('note link', plain);
    s.fieldEnd();
    s.endPara(P);
    b.obj(b.footnote(s.end()), sup);
    b.endPara(P);
    // a refused address keeps its text
    assert.equal(b.link('javascript:alert(1)', 'bad', plain), false);
    b.endPara(P);
    const {doc, notes} = b.finish();
    const [p] = blocks(doc);
    const links = Object.values(p.inlines).filter((x) => x.node &&
      x.node.name === 'w:hyperlink');
    assert.equal(links.length, 2);
    const rid = attr(links[0].node, 'r:id');
    const rel = doc.rels.find((r) => r.id === rid);
    assert.deepEqual([rel.target, rel.mode],
      ['https://example.com/a?b=1', 'External']);
    assert.equal(attr(links[1].node, 'w:anchor'), 'Intro');
    assert.equal(blocks(doc)[2].text, 'bad');
    assert.ok(notes.some((n) => /address that is not allowed/.test(n)));
    const fnRels = doc.notes.footnotes.get(1).rels;
    assert.equal(fnRels.length, 1);
    assert.equal(fnRels[0].target, 'http://example.org/');
    // (the builder's rel ids are unique over the parts it makes)
    assert.notEqual(fnRels[0].id, rid);
    await roundTrips(doc, 'links');
  });
});

describe('ImpBuild: hostile callers (task 2 minors)', () => {
  it('max NaN is the default cap, not none', () => {
    assert.equal(make({max: NaN}).max, maxParagraphs({}));
    assert.equal(make({max: Infinity}).max, maxParagraphs({}));
    assert.equal(make({max: 3}).max, 3);
  });

  it('obj(null) is noted and ignored', () => {
    const b = make();
    b.obj(null);
    b.obj(undefined, plain);
    b.text('x', plain);
    b.endPara(P);
    const {doc, notes} = b.finish();
    assert.equal(blocks(doc)[0].text, 'x');
    assert.equal(notes.length, 1);
  });

  it('property values that are not objects are ignored, with a note',
    async () => {
      const b = make();
      b.tableStart({tblPr: 'abc'});
      b.rowStart(42);
      b.cellStart(['x']);
      b.text('c', plain);
      b.endPara({pPr: 'bad'});
      b.tableEnd();
      b.text('y', {rPr: 'no'});
      b.endPara(P);
      const {doc, notes} = b.finish();
      const [t] = blocks(doc);
      assert.deepEqual(t.tblPr, {extra: []});
      assert.deepEqual(blocks(doc).map((x) => x.type),
        ['tbl', 'p']);
      assert.ok(notes.length >= 1);
      await roundTrips(doc, 'bad props');
    });

  it('a table the Model refuses for its properties is read without ' +
    'them; tableStart(null) is a table', () => {
    const b = make();
    b.tableStart(null);
    b.cellStart({shd: {extra: 'no'}, extra: []});
    b.text('c', plain);
    b.tableEnd();
    const {doc, notes} = b.finish();
    const [t] = blocks(doc);
    assert.equal(t.type, 'tbl');
    assert.deepEqual(t.rows[0].cells[0].tcPr, {extra: []});
    assert.ok(notes.some((n) => /formatting cannot be kept/.test(n)));
    valid(doc);
  });

  it('a paragraph the Model refuses is dropped with a note and not ' +
    'counted', () => {
    const b = make({max: 2});
    b.text('bad', plain);
    assert.equal(b.endPara({pPr: {ind: {extra: 'no'}, extra: []}}),
      null);
    b.obj({kind: 'weird', level: 'r'});
    assert.equal(b.endPara(P), null);
    b.text('one', plain);
    b.endPara(P);
    b.text('two', plain);
    b.endPara(P);
    const {doc, notes} = b.finish();
    assert.deepEqual(blocks(doc).map((p) => p.text), ['one', 'two']);
    assert.equal(b.stopped, false);
    assert.equal(notes.length, 1);
  });

  it('a story ended out of order, or open at the end, is noted', () => {
    const b = make();
    const outer = b.story();
    outer.text('o', plain);
    b.story().text('inner', plain);
    assert.deepEqual(outer.end().map((p) => p.text), ['o']);
    assert.equal(b.flow, b.body);
    b.story().text('never ended', plain);
    const {notes} = b.finish();
    assert.equal(notes.length, 2);
  });

  it('a sectionEnd inside an open table notes once', () => {
    const b = make();
    b.tableStart({tblPr: {extra: []}});
    b.cellStart({extra: []});
    b.text('c', plain);
    b.sectionEnd({});
    b.tableStart({tblPr: {extra: []}});
    b.cellStart({extra: []});
    b.sectionEnd({});
    const {doc, notes} = b.finish();
    assert.equal(doc.sections.length, 2);
    assert.equal(notes.length, 1);
  });
});
