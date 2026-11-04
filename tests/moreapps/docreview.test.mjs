// .doc import, task 15: footnotes and endnotes (DocNotes), comments
// (DocComments), fields (DocFields, DocFldKind), bookmarks (DocBkmk,
// DocMarks) and tracked changes (DocRevs). Inputs are spec-derived
// fixtures (doc-review-helpers.mjs reviewDoc: written from [MS-DOC]),
// not files from an office program. Every Doc read passes the Model
// checks, writes as .docx and reads back equal; emit() hands each
// .docx to the real-Word check.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {readDoc} from '../../tools/moreapps/!Letters/DocRead';
import {OPS as C} from '../../tools/moreapps/!Letters/DocSprm';
import {MAX_DEPTH} from '../../tools/moreapps/!Letters/DocFields';
import {kindOf, shownText} from '../../tools/moreapps/!Letters/DocFldKind';
import {MAX_NOTES} from '../../tools/moreapps/!Letters/RtfNotes';
import {MAX_COMMENTS} from '../../tools/moreapps/!Letters/RtfComments';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {checkBlock} from '../../tools/moreapps/!Letters/Model';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {assertSameDoc, expectedBack, withNewParts, withNewStories,
  withNewReview} from './docx-compare.mjs';
import {lintPackage} from './lint-package.mjs';
import {emit} from './word-emit.mjs';
import {prl, u16le, u32le, sectionDoc} from './doc-helpers.mjs';
import {reviewDoc, sttb} from './doc-review-helpers.mjs';
import {reviewLook, reviewCounts, REVIEW_KEYS} from './docword-review.mjs';
import {CORPUS} from './odt-corpus.mjs';
import {refsOf, storyOfRef} from '../../tools/moreapps/!Letters/SectRefs';
import {docScope} from '../../tools/moreapps/!Letters/WriteBody';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
const blocks = (doc) => doc.sections.flatMap((s) => s.blocks);
const paras = (doc) => blocks(doc).filter((b) => b.type === 'p');
const texts = (doc) => paras(doc).map((p) => p.text);
const P = (text, o = {}) => ({text, ...o});
/** A DTTM ([MS-DOC] 2.9.75). */
const dttm = (y, mo, d, h, mi) => (mi | (h << 6) | (d << 11) |
  (mo << 16) | ((y - 1900) << 20)) >>> 0;

async function roundTrips(doc, what) {
  for (const b of blocks(doc)) checkBlock(b);
  const bytes = await writeDocx(doc, {date: DATE});
  emit('doc-review-' + what.replaceAll(' ', '-'), bytes);
  const errors = lintPackage(await readZip(bytes)).problems
    .filter((q) => q.level === 'error');
  assert.deepEqual(errors, [], what);
  const back = await readDocx(bytes);
  assertSameDoc(back, withNewReview(withNewStories(withNewParts(
    expectedBack(doc), back), back), back), what);
  return back;
}

const read = (o) => readDoc(reviewDoc(o).bytes, {date: DATE});
const go = async (o, what) => {
  const r = read(o);
  return {...r, back: await roundTrips(r.doc, what)};
};

/** The inline nodes of the paragraphs: {name, attrs, node, kind}. */
function nodes(bs) {
  const out = [];
  for (const p of bs.filter((b) => b.type === 'p')) {
    for (const x of Object.values(p.inlines || {})) {
      if (x.node) out.push({...x, name: x.node.name,
        attrs: Object.fromEntries(x.node.attrs)});
    }
  }
  return out;
}
const names = (doc) => nodes(blocks(doc)).map((n) => n.name);
const instr = (bs) => nodes(bs).filter((n) => n.name === 'w:instrText')
  .map((n) => n.node.children.join(''));
const fnotes = (doc, kind = 'footnotes') => [...doc.notes[kind].values()]
  .filter((n) => n.type === 'normal');
const cmts = (doc) => [...doc.comments.map.values()];
const relTarget = (doc, id) => doc.rels.find((r) => r.id === id).target;
/** [text, kind, author, date] of each tagged run. */
function tracked(doc) {
  const out = [];
  for (const p of paras(doc)) {
    for (const r of p.runs) {
      if (r.rev) out.push([p.text.slice(r.start, r.end), r.rev.kind,
        r.rev.author, r.rev.date]);
    }
  }
  return out;
}
const time = (fn) => {
  const t = performance.now();
  const r = fn();
  return [r, performance.now() - t];
};

describe('.doc notes', () => {
  it('a footnote reference and text', async () => {
    const {doc, notes, back} = await go({main: [P('See\x02 here and' +
      '\x02 there.')], footnotes: [[P('\x02 The note.')]],
    endnotes: [[P('\x02 An end'), P('in two paragraphs.')]],
    runs: [{from: 3, to: 4, prls: [prl(C.CFSpec, 1)]}]}, 'notes');
    assert.deepEqual(notes, []);
    const [f] = fnotes(doc), [e] = fnotes(doc, 'endnotes');
    assert.equal(f.blocks[0].text, '\uFFFC The note.');
    assert.equal(nodes(f.blocks)[0].name, 'w:footnoteRef');
    assert.deepEqual(e.blocks.map((b) => b.text), ['\uFFFC An end',
      'in two paragraphs.']);
    assert.deepEqual(texts(doc), ['See\uFFFC here and\uFFFC there.']);
    const refs = nodes(blocks(doc)).map((n) => n.name);
    assert.deepEqual(refs, ['w:footnoteReference', 'w:endnoteReference']);
    assert.equal(fnotes(back).length, 1);
    assert.equal(fnotes(back, 'endnotes').length, 1);
  });

  it('a note ref CP outside the notes story is dropped with a note',
    async () => {
      const {doc, notes} = await go({main: [P('a\x02b\x02c')],
        footnotes: [[P('\x02 one')], [P('\x02 two')]],
        table: {PlcffndTxt: Uint8Array.from([0, 0, 0, 0, 0x40, 0x42, 0x0F,
          0, 0x50, 0x42, 0x0F, 0])}}, 'note outside');
      assert.equal(fnotes(doc).length, 0);
      assert.deepEqual(texts(doc), ['abc']);
      assert.equal(notes.filter((n) => /outside the notes/.test(n))
        .length, 1);
    });

  it('a 0x02 no list names, a note mark read twice, backwards CPs',
    async () => {
      const {doc, notes} = await go({main: [P('a\x02b'), P('c\x02')],
        footnotes: [[P('\x02 x')]],
        table: {PlcffndRef: Uint8Array.from([...u32le(1), ...u32le(1),
          ...u32le(9), 1, 0, 1, 0])}}, 'note twice');
      assert.equal(fnotes(doc).length, 1);
      assert.deepEqual(texts(doc), ['a\uFFFCb', 'c']);
      assert.ok(notes.some((n) => /note mark the file does not list/
        .test(n)), notes);
    });

  it('a note holding a field, a table and a deletion', async () => {
    const note = [P('\x02 Page \x13 PAGE \x14 7\x15 x' + 'gone' + ' y')];
    const start = 5 + note[0].text.indexOf('gone');
    const {doc, notes} = await go({main: [P('ab\x02c')],
      footnotes: [note], rmarks: ['Ann'],
      runs: [{from: start, to: start + 4, prls: [prl(C.CFRMarkDel, 1)]}]},
    'note field');
    const [f] = fnotes(doc);
    assert.equal(f.blocks[0].text.replaceAll('\uFFFC', ''),
      ' Page  7 x y');
    assert.deepEqual(instr(f.blocks), [' PAGE ']);
    assert.ok(notes.some((n) => /tracked changes in headers/.test(n)));
  });

  it('more than MAX_NOTES notes: one note, bounded time', () => {
    const n = MAX_NOTES + 5;
    const [r, ms] = time(() => read({plain: true,
      main: [P('\x02'.repeat(n))],
      footnotes: Array.from({length: n}, () => [P('\x02n')])}));
    assert.equal(fnotes(r.doc).length, MAX_NOTES);
    assert.equal(r.notes.filter((x) => /more than 10000 footnotes/
      .test(x)).length, 1);
    assert.ok(ms < 20000, ms);
  });

  it('PlcffndTxt CPs overlapping: read at most twice the notes', () => {
    const n = 3000;
    const txt = Array.from({length: n + 2}, (_, i) => (i % 2 ? 5002 : 0));
    const [r, ms] = time(() => read({plain: true,
      main: [P('\x02'.repeat(n))],
      footnotes: [[P('\x02' + 'x'.repeat(5000))], ...Array.from(
        {length: n - 1}, () => [P('\x02')])],
      table: {PlcffndTxt: Uint8Array.from(txt.flatMap((c) => u32le(c)))}}));
    assert.ok(r.notes.some((x) => /more note text/.test(x)),
      String(r.notes));
    assert.ok(fnotes(r.doc).length <= 5, fnotes(r.doc).length);
    assert.ok(ms < 5000, ms);
  });
});

describe('.doc comments', () => {
  const A = dttm(2024, 5, 6, 7, 8);

  it('a comment with author initials and date', async () => {
    const {doc, notes, back} = await go({main: [P('Some marked\x05 text' +
      ' and a point\x05.')], owners: ['Ann Lee', 'Bob Ray'],
    comments: [{paras: [P('\x05Check this')], initials: 'AL', ibst: 0,
      dttm: A, range: [5, 11]}, {paras: [P('\x05Point'), P('two')],
      initials: 'BR', ibst: 1, dttm: A}]}, 'comments');
    assert.deepEqual(notes, []);
    const [c1, c2] = cmts(doc);
    assert.deepEqual([c1.author, c1.initials, c1.date],
      ['Ann Lee', 'AL', '2024-05-06T07:08:00Z']);
    assert.ok(c1.blocks[0].text.endsWith('Check this'));
    assert.deepEqual([c2.author, c2.initials], ['Bob Ray', 'BR']);
    assert.deepEqual(c2.blocks.map((b) => b.text.replace('\uFFFC', '')),
      ['Point', 'two']);
    const k = names(doc);
    assert.deepEqual(k, ['w:commentRangeStart', 'w:commentRangeEnd',
      'w:commentReference', 'w:commentReference']);
    const p = paras(doc)[0];
    const at = Object.entries(p.inlines).map(([i, x]) => [Number(i),
      x.node.name]);
    assert.equal(p.text.slice(at[0][0] + 1, at[1][0]), 'marked');
    assert.equal(cmts(back).length, 2);
  });

  it('a reply, a range with no bookmark, a range after its mark',
    async () => {
      const {doc, notes} = await go({main: [P('ab\x05cd\x05ef\x05')],
        owners: ['A'], comments: [{paras: [P('\x05first')], dttm: A},
          {paras: [P('\x05reply')], dttm: A, parent: 0},
          {paras: [P('\x05late')], range: [9, 9]}],
        table: {}}, 'reply');
      const [c1, c2, c3] = cmts(doc);
      assert.equal(c2.parent, c1.id);
      assert.ok(c3);
      assert.ok(!names(doc).includes('w:commentRangeStart'));
      assert.equal(notes.filter((n) => /range that does not fit/.test(n))
        .length, 1);
    });

  it('ATRD ibst out of range, DTTM garbage, a short story', async () => {
    const {doc, notes} = await go({main: [P('a\x05b\x05c\x05')],
      owners: ['A'], comments: [
        {paras: [P('\x05x')], ibst: 7, dttm: dttm(2024, 15, 3, 1, 1)},
        {paras: [P('\x05y')], ibst: -3, dttm: dttm(2024, 2, 0, 1, 1)},
        {paras: [P('\x05z')], dttm: (511 << 20) | (1 << 16) | (1 << 11)}],
      table: {PlcfandTxt: Uint8Array.from([0, 3, 6, 900, 901].flatMap(
        (c) => u32le(c)))}}, 'comment garbage');
    const all = cmts(doc);
    assert.equal(all.length, 2);
    for (const c of all) {
      assert.equal(c.author, '');
      assert.equal(c.date, null);
    }
    assert.ok(notes.some((n) => /author that is not in the file/
      .test(n)));
    assert.ok(notes.some((n) => /outside the comments/.test(n)));
  });

  it('more than MAX_COMMENTS comments: one note, bounded time', () => {
    const n = MAX_COMMENTS + 3;
    const [r, ms] = time(() => read({plain: true,
      main: [P('\x05'.repeat(n))], owners: ['A'],
      comments: Array.from({length: n}, () => ({paras: [P('\x05c')]}))}));
    assert.equal(cmts(r.doc).length, MAX_COMMENTS);
    assert.equal(r.notes.filter((x) => /more than 10000 comments/
      .test(x)).length, 1);
    assert.ok(ms < 20000, ms);
  });
});

describe('.doc fields', () => {
  it('a nested field (IF inside REF) keeps outer result text',
    async () => {
      const {doc, notes} = await go({main: [P('x\x13 IF \x13 REF bk ' +
        '\x14yes\x15 = "yes" "A" "B" \x14A\x15y'), P('\x13 REF outer ' +
        '\x14r1 \x13 PAGE \x14 3\x15 r2\x15!')]}, 'nested');
      assert.deepEqual(notes, []);
      const t = texts(doc).map((s) => s.replaceAll('\uFFFC', ''));
      assert.deepEqual(t, ['xAy', 'r1  3 r2!']);
      assert.deepEqual(instr(blocks(doc)), [' IF yes = "yes" "A" "B" ',
        ' REF outer ', ' PAGE ']);
    });

  it('a HYPERLINK to http is a link, INCLUDETEXT is result text only',
    async () => {
      const {doc, notes} = await go({main: [P('a\x13 HYPERLINK ' +
        '"http://e.org/x" \x14site\x15 b\x13 HYPERLINK "mailto:p@e.org"' +
        ' \x14mail\x15 c\x13 HYPERLINK \\l "mark" \x14in\x15'),
      P('\x13 INCLUDETEXT "c:\\\\x.doc" \x14included\x15 \x13 ' +
        'INCLUDEPICTURE "http://e.org/p.png" \\d \x14pic\x15 \x13 LINK ' +
        'Excel.Sheet "c:\\\\a.xls" \x14linked\x15')],
      bookmarks: [{name: 'mark', start: 0, end: 1}]}, 'links');
      const ls = nodes(blocks(doc)).filter((n) => n.name ===
        'w:hyperlink');
      assert.equal(ls.length, 3);
      assert.equal(relTarget(doc, ls[0].attrs['r:id']), 'http://e.org/x');
      assert.equal(relTarget(doc, ls[1].attrs['r:id']), 'mailto:p@e.org');
      assert.equal(ls[2].attrs['w:anchor'], 'mark');
      assert.equal(texts(doc)[1], 'included pic linked');
      assert.deepEqual(instr(blocks(doc)), []);
      assert.equal(notes.filter((n) => /nothing is fetched/.test(n))
        .length, 1);
      assert.equal(notes.length, 1);
    });

  it('a field with no end mark is closed at paragraph end with a note',
    async () => {
      const {doc, notes} = await go({main: [P('\x13 PAGE \x14 3 more'),
        P('next'), P('\x13 PAGE never'), P('after')],
      fld: {drop: 'end'}}, 'no end');
      assert.deepEqual(texts(doc).map((s) => s.replaceAll('\uFFFC', '')),
        [' 3 more', 'next', '', 'after']);
      assert.equal(paras(doc)[1].inlines && Object.keys(paras(doc)[1]
        .inlines).length, 0);
      assert.ok(notes.some((n) => /field without its end/.test(n)));
      assert.ok(notes.some((n) => /field code without its end/.test(n)));
    });

  it('kinds kept as text: forms, EQ ruby, buttons, index entries, ' +
    'unknown', async () => {
      const {doc, notes} = await go({main: [
        P('\x13 FORMTEXT \x14typed\x15|\x13 FORMCHECKBOX \x15|'),
        P('\x13 EQ \\* jc2 \\* "Font:MS Mincho" \\* hps11 \\o\\ad(\\s' +
          '\\up 10(\u3068\u3046\u304D\u3087\u3046),\u6771\u4EAC)\x15'),
        P('\x13 MACROBUTTON NoMacro Click here \x15|\x13 XE "entry" \x15|'),
        P('\x13 WIDGET a b \x15|\x13 MERGEFIELD Name \x14\u00ABName' +
          '\u00BB\x15')]}, 'kinds');
      assert.deepEqual(texts(doc).map((s) => s.replaceAll('\uFFFC', '')),
        ['typed||', '\u6771\u4EAC', 'Click here||', 'WIDGET a b|\u00ABName' +
        '\u00BB']);
      assert.deepEqual(instr(blocks(doc)), [' XE "entry" ']);
      for (const re of [/form fields/, /EQ fields/, /MACROBUTTON/,
        /kind WIDGET/, /kind MERGEFIELD/]) {
        assert.equal(notes.filter((n) => re.test(n)).length, 1, re);
      }
    });

  it('EMBED and SHAPE keep their result quietly (task 16)', async () => {
    const {doc, notes} = await go({main: [
      P('a\x13 EMBED Equation.3 \x14r\x15b\x13 SHAPE \\* MERGEFORMAT ' +
        '\x14s\x15c'), P('\x13 EMBED Word.Picture.8 \x15d')]},
    'embed shape');
    assert.deepEqual(texts(doc), ['arbsc', 'd']);
    assert.deepEqual(notes, []);
    assert.equal(kindOf(' EMBED x').kind, 'quiet');
    assert.equal(kindOf(' SHAPE ').kind, 'quiet');
    assert.equal(shownText(' EMBED x', 'quiet'), '');
    // (form fields are 'form', never 'silent')
    assert.equal(kindOf(' FORMCHECKBOX ').kind, 'form');
    assert.equal(kindOf(' FORMDROPDOWN ').kind, 'form');
  });

  it('a bookmark and a comment range inside a field code are placed ' +
    'where the code closes (task 16)', async () => {
    // (they used to be placed before the field's begin mark: the code
    // is not placed until its separator)
    const seq = (p) => Object.keys(p.inlines).map(Number)
      .sort((x, y) => x - y).map((i) => {
        const x = p.inlines[i];
        const n = x.node && x.node.name;
        return n === 'w:fldChar' ? x.node.attrs[0][1] : n || x.kind;
      });
    const main = [P('ab\x13 PAGE \x14 7\x15 cd'),
      P('ef\x13 HYPERLINK "http://x.org/" \x14link\x15 gh\x05')];
    const at = (k, s) => main.slice(0, k).reduce((n, q) =>
      n + q.text.length + 1, 0) + main[k].text.indexOf(s);
    const {doc, notes} = await go({main, owners: ['Ann'],
      comments: [{paras: [P('\x05 note')], range: [at(1, 'x.org'),
        at(1, ' gh')]}],
      bookmarks: [{name: 'inside', start: at(0, 'AGE'),
        end: at(0, ' cd')}]}, 'marks in code');
    assert.deepEqual(notes, []);
    const [p1, p2] = paras(doc);
    assert.deepEqual(seq(p1), ['begin', 'w:instrText', 'separate',
      'w:bookmarkStart', 'end', 'w:bookmarkEnd']);
    assert.deepEqual(seq(p2), ['w:commentRangeStart', 'w:hyperlink',
      'w:commentRangeEnd', 'w:commentReference']);
    assert.equal(p1.text.replaceAll('\uFFFC', ''), 'ab 7 cd');
  });

  it('the depth cap note says where the deeper fields go (task 16)',
    () => {
      const r = read({plain: true, fld: false, main: [P('\x13'.repeat(
        MAX_DEPTH + 5) + ' PAGE \x14x' + '\x15'.repeat(5)), P('after')]});
      assert.ok(r.notes.includes('fields nested more than ' + MAX_DEPTH +
        ' deep: the deeper fields are read as part of the innermost ' +
        'open code'), r.notes.join('; '));
    });

  it('kindOf and shownText', () => {
    assert.deepEqual(kindOf(' PAGE \\* MERGEFORMAT '),
      {name: 'PAGE', kind: 'safe'});
    assert.equal(kindOf(' INCLUDETEXT x').kind, 'external');
    assert.equal(kindOf('\\nothing').kind, 'other');
    assert.equal(shownText(' EQ \\f(1,2)', 'eq'), 'EQ \\f(1,2)');
    assert.equal(shownText(' EQ \\o\\ad(\\s\\up 9(r\\,b),b\\(a\\))',
      'eq'), 'b(a)');
    assert.equal(shownText(' EQ \\o(\\s\\up 9(r),b', 'eq'),
      'EQ \\o(\\s\\up 9(r),b');
    assert.equal(shownText(' GOTOBUTTON here  Go  there', 'button'),
      'Go  there');
    assert.equal(shownText(' TC "x"', 'silent'), '');
  });

  it('field marks out of place; 100,000 begins with no end', () => {
    const r1 = read({main: [P('a\x14b\x15c')]});
    assert.deepEqual(texts(r1.doc), ['abc']);
    assert.equal(r1.notes.filter((n) => /out of place/.test(n)).length,
      1);
    const [r, ms] = time(() => read({plain: true, fld: false,
      main: [P('\x13'.repeat(100000) + ' PAGE \x14x' +
        '\x15'.repeat(5)), P('after')]}));
    assert.deepEqual(texts(r.doc), ['', 'after']);
    assert.ok(r.notes.some((n) => n.includes(MAX_DEPTH + ' deep')));
    assert.ok(ms < 3000, ms);
    const [r2, ms2] = time(() => read({plain: true, fld: false,
      main: [P(' \x13 A \x14'.repeat(50000) + 'z' + '\x15'.repeat(50000))]}));
    assert.ok(texts(r2.doc)[0].endsWith('z'));
    assert.ok(ms2 < 5000, ms2);
  });

  it('PlcFld with a million entries; backwards CPs', () => {
    const n = 1000000;
    const plc = new Uint8Array(4 * (n + 1) + 2 * n);
    const dv = new DataView(plc.buffer);
    for (let i = 0; i <= n; i++) dv.setInt32(4 * i, i, true);
    for (let i = 0; i < n; i++) plc[4 * (n + 1) + 2 * i] = 0x13 + i % 3;
    const [r, ms] = time(() => read({plain: true,
      main: [P('\x13 PAGE \x14 1\x15 ok')], table: {PlcfFldMom: plc}}));
    assert.equal(texts(r.doc)[0].replaceAll('\uFFFC', ''), ' 1 ok');
    assert.ok(ms < 3000, ms);
    const back = Uint8Array.from([...u32le(5), ...u32le(1), ...u32le(9),
      0x13, 0, 0x14, 0]);
    const r2 = read({main: [P('\x13 PAGE \x14 1\x15 ok')],
      table: {PlcfFldMom: back}});
    assert.equal(texts(r2.doc)[0].replaceAll('\uFFFC', ''), ' 1 ok');
  });

  it('a PAGE field in a footer is a field', async () => {
    const {bytes} = sectionDoc({main: [{text: 'Body'}],
      sections: [null], stories: [null, null, null, null, null, null,
        null, null, null, [{text: 'Page \x13 PAGE \x14 1\x15'}], null,
        null]});
    const {doc} = readDoc(bytes, {date: DATE});
    const refs = refsOf(doc.sections[0], docScope(doc).map);
    const foot = doc.stories.get(storyOfRef(doc, refs.ftr.default));
    assert.deepEqual(instr(foot.blocks), [' PAGE ']);
    await roundTrips(doc, 'footer field');
  });
});

describe('.doc bookmarks', () => {
  it('bookmarks, one spanning into a note, mismatched lists',
    async () => {
      const {doc, notes} = await go({main: [P('one two\x02 three')],
        footnotes: [[P('\x02 in note')]],
        bookmarks: [{name: 'b1', start: 0, end: 3},
          {name: 'empty', start: 4, end: 4},
          {name: 'span', start: 4, end: 18}]}, 'bookmarks');
      const k = nodes(blocks(doc)).map((n) => [n.name, n.attrs['w:name']
        ?? n.attrs['w:id']]);
      assert.deepEqual(k.filter(([n]) => /bookmark/.test(n)), [
        ['w:bookmarkStart', 'b1'], ['w:bookmarkEnd', '0'],
        ['w:bookmarkStart', 'empty'], ['w:bookmarkStart', 'span'],
        ['w:bookmarkEnd', '1'], ['w:bookmarkEnd', '2']]);
      assert.deepEqual(notes, []);
      const r = read({main: [P('abc')], bookmarks: [{name: 'x',
        start: 0, end: 1}, {name: 'y', start: 1, end: 2}],
      table: {SttbfBkmk: sttb(['x'])}});
      assert.equal(nodes(blocks(r.doc)).length, 2);
      assert.ok(r.notes.some((n) => /bookmark lists/.test(n)));
      const r2 = read({main: [P('abc')], bookmarks: [{name: 'x',
        start: 2, end: 1}]});
      assert.equal(nodes(blocks(r2.doc)).length, 0);
      assert.ok(r2.notes.some((n) => /end does not fit/.test(n)));
    });

  it('100,005 bookmarks (fewer names, as cData holds): one note, ' +
    'bounded time', () => {
    const n = 100005;
    const [r, ms] = time(() => read({plain: true,
      main: [P('x'.repeat(1000))], bookmarks: Array.from({length: n},
        (_, i) => ({name: 'b' + i, start: i % 1000, end: i % 1000}))}));
    // (cData is 2 bytes: the count written is n & 0xFFFF)
    assert.equal(nodes(blocks(r.doc)).length, 2 * (n & 0xFFFF));
    assert.equal(r.notes.filter((x) => /bookmark lists/.test(x)).length,
      1);
    assert.ok(ms < 10000, ms);
  });
});

describe('.doc tracked changes', () => {
  const D1 = dttm(2024, 5, 6, 7, 8), D2 = dttm(2023, 12, 31, 23, 59);
  const ins = (ibst, d) => [prl(C.CFRMarkIns, 1),
    prl(C.CIbstRMark, u16le(ibst)), prl(C.CDttmRMark, u32le(d))];
  const del = (ibst, d) => [prl(C.CFRMarkDel, 1),
    prl(C.CIbstRMarkDel, u16le(ibst)), prl(C.CDttmRMarkDel, u32le(d))];

  it('an inserted and a deleted run by two authors', async () => {
    // 'keep new old  end' / 'gone' / 'last'
    const {doc, notes} = await go({main: [P('keep new old  end'),
      P('gone'), P('last')], rmarks: ['Unknown', 'Ann', 'Bob'],
    runs: [{from: 5, to: 9, prls: ins(1, D1)},
      {from: 9, to: 13, prls: del(2, D2)},
      {from: 17, to: 23, prls: del(2, D2)}]}, 'changes');
    assert.deepEqual(notes, []);
    assert.deepEqual(tracked(doc), [
      ['new ', 'ins', 'Ann', '2024-05-06T07:08:00Z'],
      ['old ', 'del', 'Bob', '2023-12-31T23:59:00Z'],
      ['gone', 'del', 'Bob', '2023-12-31T23:59:00Z']]);
    assert.equal(texts(doc)[0], 'keep new old  end');
    const marked = paras(doc).filter((p) => p.pPr.extra.some((x) =>
      x.name === 'w:rPr' && x.children.some((c) => c.name === 'w:del')));
    assert.equal(marked.length, 2);
  });

  it('authors out of range, DTTM garbage, 65535 authors past the ' +
    'stream', async () => {
      const big = Uint8Array.from([0xFF, 0xFF, 0xFF, 0xFF, 0, 0,
        ...u16le(3), 65, 0, 66, 0, 67, 0, ...u16le(60000), 68, 0]);
      const [r, ms] = time(() => read({main: [P('aa bb cc')],
        table: {SttbfRMark: big},
        runs: [{from: 0, to: 2, prls: ins(1, dttm(2024, 15, 1, 1, 1))},
          {from: 3, to: 5, prls: ins(0, dttm(2024, 1, 0, 1, 1))},
          {from: 6, to: 8, prls: ins(9, (511 << 20) | (1 << 16) |
            (1 << 11))}]}));
      assert.ok(ms < 2000, ms);
      assert.deepEqual(tracked(r.doc).map((x) => x.slice(1)), [
        ['ins', undefined, undefined], ['ins', 'ABC', undefined],
        ['ins', undefined, undefined]]);
      assert.ok(r.notes.some((n) => /change's author/.test(n)));
      await roundTrips(r.doc, 'change garbage');
    });

  it('a deletion spanning two paragraphs keeps the spaces round it',
    async () => {
      const {doc} = await go({main: [P('a x'), P('y b')],
        rmarks: ['A'], runs: [{from: 2, to: 6, prls: del(0, D1)}]},
      'deletion over marks');
      assert.deepEqual(texts(doc), ['a x', 'y b']);
      assert.deepEqual(tracked(doc).map((x) => x[0]), ['x', 'y ']);
    });
});

// ---------------------------------------------------------------------
// real Word's .doc of docword-review.mjs's sampler, and the corpus
// (both uncommitted: skipped when absent)

const HERE = path.dirname(new URL(import.meta.url).pathname);
const WORD = path.join(HERE, 'word-check-out', 'doc-from-word');
const FIX = path.join(WORD, 'fix-review');
const haveFix = fs.existsSync(FIX + '.doc') && fs.existsSync(FIX +
  '.docx');

/**
 * Documented exclusions of the comparison: comments are compared as
 * a set (the .doc lists them by their marks' CPs, the .docx by id);
 * a DATE field's result is Word's when it saved the .doc (Word
 * updates DATE fields on saving); the fields !Letters keeps as text
 * (FORMTEXT, INCLUDETEXT: DocFldKind) are fields in the .docx and
 * their results text in ours.
 */
function comparable(L, asText = false) {
  const out = structuredClone(L);
  out.comments.sort((a, b) => JSON.stringify(a).localeCompare(
    JSON.stringify(b)));
  out.fields = out.fields.filter(([n]) => !asText ||
    !['FORMTEXT', 'INCLUDETEXT'].includes(n)).map(([n, r]) =>
    [n, n === 'DATE' ? '(Word\'s)' : r]);
  return out;
}

describe('.doc review sampler saved by real Word against the .docx',
  {skip: haveFix ? false : 'no fix-review.doc (tools/doc-word-' +
    'fixtures.mjs review)'}, () => {
    it('fix-review: notes, comments, changes, fields, links and ' +
      'bookmarks are Word\'s', async () => {
      const {doc, notes} = readDoc(new Uint8Array(fs.readFileSync(FIX +
        '.doc')));
      const src = await readDocx(new Uint8Array(fs.readFileSync(FIX +
        '.docx')));
      assert.deepEqual(notes, ['form fields are kept as their text ' +
        '(check boxes and drop-down lists are left out)', 'fields that ' +
        'would bring in files, pictures or data (INCLUDETEXT, ' +
        'INCLUDEPICTURE, LINK, DDE...) are kept as their results: ' +
        'nothing is fetched']);
      const want = comparable(reviewLook(src), true);
      assert.deepEqual(comparable(reviewLook(doc)), want);
      assert.equal(want.notes.length, 2);
      assert.equal(want.comments.length, 3);
      assert.ok(want.changes.length >= 6);
      assert.equal(want.links.length, 3);
      assert.equal(want.fields.length, 6);
      assert.deepEqual(want.footer, [['PAGE', '1']]);
      assert.deepEqual(want.bookmarks, ['target', 'second']);
      // the kinds kept as text: their results are in the text
      const last = texts(doc).find((t) => t.startsWith('Form: '));
      assert.equal(last, 'Form: typed include: included text');
      const back = await roundTrips(doc, 'word review');
      assert.deepEqual(comparable(reviewLook(back)), want);
    });
  });

const FILES = ['corpus/poi-doc', 'corpus/converted/doc',
  'word-check-out/doc-from-word'].flatMap((d) =>
  find(path.join(HERE, d), '.doc')).sort();
function find(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const q = path.join(dir, e.name);
    if (e.isDirectory()) find(q, ext, out);
    else if (e.name.toLowerCase().endsWith(ext)) out.push(q);
  }
  return out;
}

describe('.doc corpus: notes, comments, fields, changes', {skip:
  FILES.length ? false : 'no .doc corpus (optional, git-ignored)'}, () => {
  it('every .doc reads or is refused with an ImportError in 5 s', () => {
    const counts = {};
    let slow = [0, ''];
    for (const f of FILES) {
      const t = performance.now();
      let got = 'ok';
      try {
        readDoc(new Uint8Array(fs.readFileSync(f)));
      } catch (e) {
        assert.equal(e.name, 'ImportError', f + ': ' + e.stack);
        got = e.code;
      }
      const ms = performance.now() - t;
      assert.ok(ms < 5000, f);
      if (ms > slow[0]) slow = [ms, path.basename(f)];
      counts[got] = (counts[got] || 0) + 1;
    }
    console.log('# doc corpus (review): ' + JSON.stringify(counts) +
      `, slowest ${Math.round(slow[0])} ms (${slow[1]})`);
  });

  it('the ruby EQ file (61470) keeps its text', {skip: fs.existsSync(
    path.join(HERE, 'corpus/converted/doc/poi/61470.doc')) ? false
    : 'absent'}, () => {
    const {doc} = readDoc(new Uint8Array(fs.readFileSync(path.join(HERE,
      'corpus/converted/doc/poi/61470.doc'))));
    // (its _GoBack bookmark is two U+FFFC)
    assert.equal(texts(doc)[0].replaceAll('\uFFFC', ''), '\u6771\u4EAC');
  });

  it('counts against the .docx twins', async () => {
    const docx = find(CORPUS, '.docx');
    const conv = path.join(CORPUS, 'converted', 'doc');
    const pairs = [];
    for (const f of find(conv, '.doc')) {
      const x = path.join(CORPUS, path.relative(conv, f)
        .replace(/\.doc$/i, '.docx'));
      if (fs.existsSync(x)) pairs.push([f, x, 'LibreOffice']);
    }
    for (const f of FILES.filter((p) => p.includes('doc-from-word'))) {
      const own = f.replace(/\.doc$/i, '.docx');
      const base = path.basename(own);
      const x = fs.existsSync(own) ? own
        : docx.find((p) => path.basename(p) === base);
      if (x) pairs.push([f, x, 'Word']);
    }
    const by = {};
    for (const [f, x, who] of pairs) {
      let a, b;
      try {
        a = reviewCounts(readDoc(new Uint8Array(fs.readFileSync(f))).doc);
      } catch (e) {
        if (e.name !== 'ImportError') throw e;
        continue;
      }
      try {
        b = reviewCounts(await readDocx(new Uint8Array(
          fs.readFileSync(x))));
      } catch (e) {
        continue;     // (a twin the .docx reader refuses)
      }
      const t = by[who] ||= {n: 0, same: 0,
        ...Object.fromEntries(REVIEW_KEYS.map((k) => [k, [0, 0]]))};
      t.n++;
      if (REVIEW_KEYS.every((k) => a[k] === b[k])) t.same++;
      for (const k of REVIEW_KEYS) {
        t[k][0] += a[k];
        t[k][1] += b[k];
      }
    }
    for (const [who, t] of Object.entries(by)) {
      console.log(`# doc review (${who}): ${t.n} compared, ${t.same} ` +
        'the same, ' + REVIEW_KEYS.map((k) => `${k} ${t[k][0]}/${t[k][1]}`)
        .join(', '));
      // (the rest: text boxes not read, fields kept as text, links
      // to schemes not allowed, LibreOffice's conversion: findings);
      // the files real Word saved read exactly as their .docx
      if (who === 'Word') assert.equal(t.same, t.n, who);
      else assert.ok(t.same / t.n > 0.85, who);
    }
    assert.ok(Object.keys(by).length > 0);
  });
});
