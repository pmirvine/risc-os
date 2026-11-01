// Edits recorded as tracked changes (Batch F2, ./RevTrack): typing
// is an insertion by the current author (going on the author's own
// insertion), Delete and Backspace remove the author's own insertion
// and tag other text deleted, paragraph joins and deletions across
// paragraphs are refused, paste, cut and Replace record a deletion
// and an insertion, formatting stays untracked with one notice, each
// command is one undo step, and the switch is w:trackRevisions in
// settings.xml. Headers, footers and notes are never recorded.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {checkBlock} from '../../tools/moreapps/!Letters/ModelCheck';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {typeText, splitPara} from '../../tools/moreapps/!Letters/Edit';
import {deleteBack, deleteForward, deleteWordBack, deleteSelection}
  from '../../tools/moreapps/!Letters/EditDel';
import {pasteBlocks, pastePlain, cutSelection}
  from '../../tools/moreapps/!Letters/ClipPaste';
import {slice} from '../../tools/moreapps/!Letters/ClipSlice';
import {search, replaceOne, replaceAll}
  from '../../tools/moreapps/!Letters/Find';
import {scan} from '../../tools/moreapps/!Letters/Walk';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {newDoc} from '../../tools/moreapps/!Letters/NewDoc';
import {nextId} from '../../tools/moreapps/!Letters/RevMarks';
import {Refused} from '../../tools/moreapps/!Letters/RevCmd';
import {MARKS} from '../../tools/moreapps/!Letters/OpsRevs';
import * as RT from '../../tools/moreapps/!Letters/RevTrack';
import {putIn, pageBreak}
  from '../../tools/moreapps/!Letters/InsertApply';
import {insertTable} from '../../tools/moreapps/!Letters/TblInsert';
import {insertFieldCmd} from '../../tools/moreapps/!Letters/FieldCmd';
import {changeCase} from '../../tools/moreapps/!Letters/ChangeCase';
import {acceptAll} from '../../tools/moreapps/!Letters/RevCmd';
import {apply as applyOp} from '../../tools/moreapps/!Letters/Ops';
import {buildDocx, documentXml, settingsXml, stylesXml}
  from './build-docx.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {assertSameDoc, expectedBack} from './docx-compare.mjs';
import {noteDoc, mark} from './note-fixtures.mjs';

const DATE = new Date(2024, 4, 6, 7, 8, 10);
// (the local clock time, written with a Z as Word writes w:date)
const NOW = new Date(2025, 0, 2, 3, 4, 5);
const STAMP = '2025-01-02T03:04:05Z';
const D = '2024-01-02T03:04:00Z';
const sp = (t) => (/^ | $/.test(t) ? ' xml:space="preserve"' : '');
const run = (t, tag = 'w:t') => `<w:r><${tag}${sp(t)}>${t}</${tag}>` +
  '</w:r>';
const att = (id, au) => `w:id="${id}" w:author="${au}" w:date="${D}"`;
const ins = (id, t, au = 'Bo') => `<w:ins ${att(id, au)}>${run(t)}` +
  '</w:ins>';
const del = (id, t, au = 'Bo') => `<w:del ${att(id, au)}>` +
  `${run(t, 'w:delText')}</w:del>`;
const para = (inner) => `<w:p>${inner}</w:p>`;
const bmS = (id) => `<w:bookmarkStart w:id="${id}" w:name="b${id}"/>`;
const bmE = (id) => `<w:bookmarkEnd w:id="${id}"/>`;
const field = '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
  '<w:r><w:instrText> PAGE </w:instrText></w:r>' +
  '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' + run('1') +
  '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
const TRACK = '<w:zoom w:percent="100"/><w:trackRevisions/>' +
  '<w:defaultTabStop w:val="720"/>';
const TBL = '<w:tbl><w:tr><w:tc>' + para(run('cell')) +
  '</w:tc></w:tr></w:tbl>';

/** The package of body, with settings.xml holding `settings`. */
const pkg = (body, settings = TRACK, more = {}) => buildDocx({
  'word/document.xml': documentXml(body),
  'word/settings.xml': settingsXml(settings), ...more});
/** A Document of body (tracking on unless settings say otherwise),
 *  recorded by Ann at NOW, shown in view `markup`. */
async function docOn(body, {settings = TRACK, markup = 'final',
  name = 'Ann', more} = {}) {
  const d = new Document(await readDocx(await pkg(body, settings,
    more)));
  d.markup = markup;
  d.reviewer = () => ({name, now: NOW});
  return d;
}
const blocks = (doc) => doc.sections.flatMap((s) => s.blocks);
const P = (d, i = 0) => blocks(d.doc)[i];
const write = (doc) => writeDocx(doc, {date: DATE});
/** The text of p, U+FFFC left out, tagged stretches in brackets with
 *  their kind, id and author: [ins5Ann:new]. */
function shown(p) {
  let out = '';
  for (const r of p.runs) {
    const t = p.text.slice(r.start, r.end).replaceAll('\ufffc', '');
    if (!t) continue;
    out += r.rev ? `[${r.rev.kind}${r.rev.id}${r.rev.author}:${t}]` : t;
  }
  return out;
}
const pos = (p, off) => ({id: p.id, off});
const sel = (p, a, b, q = p) => S.select(pos(p, a), pos(q, b));
const car = (p, off) => S.caret(pos(p, off));
const valid = (doc) => scan(doc, (b) => checkBlock(b));
const refused = (fn, re) => assert.throws(fn, (e) =>
  e instanceof Refused && (!re || re.test(e.message)));
async function part(doc, name) {
  return new TextDecoder().decode((await readZip(await write(doc)))
    .get(name));
}
/** Every part of the written doc as text, by name. */
async function parts(doc) {
  const z = await readZip(await write(doc));
  const out = {};
  for (const [k, v] of z) out[k] = new TextDecoder().decode(v);
  return out;
}
/** d's Doc written and read again, checked to be the same model
 *  (tags made by editing included). */
async function backOf(d) {
  const back = await readDocx(await write(d.doc));
  assertSameDoc(back, expectedBack(d.doc));
  return back;
}
/** fn's step undone leaves every part as written before it. */
async function undoesToBytes(d, fn) {
  const before = await parts(d.doc);
  const n0 = d.undoDepth;
  fn();
  assert.equal(d.undoDepth, n0 + 1, 'one undo step');
  d.undo();
  assert.deepEqual(await parts(d.doc), before);
}

describe('RevTrack: the switch', () => {
  it('the setting round trips through settings.xml', async () => {
    const SET = '<w:zoom w:percent="90"/><w:proofState ' +
      'w:spelling="clean"/><w:defaultTabStop w:val="720"/>' +
      '<w:compat><w:compatSetting w:name="compatibilityMode" ' +
      'w:uri="http://schemas.microsoft.com/office/word" ' +
      'w:val="15"/></w:compat><w:rsids><w:rsidRoot ' +
      'w:val="00A1"/></w:rsids>';
    const d = await docOn(para(run('a')), {settings: SET});
    const t = new Typing(d);
    const xml0 = await part(d.doc, 'word/settings.xml');
    assert.equal(RT.on(d), false);
    assert.equal(RT.setTracking(d, t, false), false, 'off already');
    assert.equal(d.undoDepth, 0);
    assert.equal(RT.setTracking(d, t, true), true);
    assert.equal(RT.on(d), true);
    assert.equal(d.undoDepth, 1, 'one undo step');
    const xml1 = await part(d.doc, 'word/settings.xml');
    assert.equal(xml1, xml0.replace('<w:defaultTabStop',
      '<w:trackRevisions/><w:defaultTabStop'), 'in schema order, ' +
      'nothing else changed');
    const back = new Document(await backOf(d));
    assert.equal(RT.on(back), true, 'reads back on');
    assert.equal(RT.setTracking(back, null, false), true);
    assert.equal(await part(back.doc, 'word/settings.xml'), xml0);
    d.undo();
    assert.equal(RT.on(d), false);
    assert.equal(await part(d.doc, 'word/settings.xml'), xml0);
  });

  it('untouched, settings.xml is written as read; w:val="0" is off ' +
    'and loses its value when turned on; no settings part refuses; ' +
    'a new document is off', async () => {
    const odd = '<w:trackRevisions w:val="0" w:foo="1"/>' +
      '<w:zoom w:percent="100"/>';
    const d = await docOn(para(run('a')), {settings: odd});
    const src = new TextDecoder().decode((await readZip(await pkg(
      para(run('a')), odd))).get('word/settings.xml'));
    assert.equal(await part(d.doc, 'word/settings.xml'), src);
    assert.equal(RT.on(d), false);
    RT.setTracking(d, null, true);
    assert.match(await part(d.doc, 'word/settings.xml'),
      /<w:trackRevisions w:foo="1"\/>/);
    const bare = new Document(await readDocx(await buildDocx(
      {'word/document.xml': documentXml(para(run('a')))})));
    assert.equal(RT.on(bare), false);
    refused(() => RT.setTracking(bare, null, true),
      /no settings part/);
    assert.equal(bare.undoDepth, 0);
    assert.throws(() => RT.setTracking(d, null, 'yes'), RangeError);
    const nd = new Document(newDoc());
    assert.equal(RT.on(nd), false);
    assert.doesNotMatch(await part(nd.doc, 'word/settings.xml'),
      /trackRevisions/);
  });

  it('author: the name trimmed, else Author; the date now as the ' +
    'local clock time with a Z',
    () => {
      assert.deepEqual(RT.author({name: ' Ann '}, NOW),
        {author: 'Ann', date: STAMP});
      assert.equal(RT.author({name: ''}, NOW).author, 'Author');
      assert.equal(RT.author({name: 7}, NOW).author, 'Author');
      assert.equal(RT.author(null, NOW).author, 'Author');
      assert.equal(RT.author({now: NOW}).date, STAMP);
      assert.match(RT.author({}).date,
        /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
      assert.match(RT.author({now: new Date(NaN)}).date, /Z$/);
    });
});

describe('RevTrack: typing', () => {
  it('typing records an insertion and extends it', async () => {
    const d = await docOn(para(run('ab') + ins(4, 'zz')));
    const t = new Typing(d, {now: () => 0});
    const id = nextId(d.doc);
    assert.equal(id, 5);
    let s = t.type(car(P(d), 2), 'x');
    s = t.type(s, 'y');
    assert.equal(shown(P(d)), `ab[ins${id}Ann:xy][ins4Bo:zz]`);
    assert.equal(d.undoDepth, 1, 'one undo step, as untracked');
    t.reset();
    s = t.type(s, 'w');            // (a new step: still the same one)
    t.type(car(P(d), 2), 'v');     // (before it: the same one too)
    assert.equal(shown(P(d)), `ab[ins${id}Ann:vxyw][ins4Bo:zz]`);
    const r = P(d).runs.find((x) => x.rev && x.rev.id === id).rev;
    assert.deepEqual([r.author, r.date], ['Ann', STAMP]);
    t.type(car(P(d), 0), 'Q');     // a new place: a new revision
    assert.equal(shown(P(d)),
      `[ins${id + 1}Ann:Q]ab[ins${id}Ann:vxyw][ins4Bo:zz]`);
    valid(d.doc);
    const xml = await part(d.doc, 'word/document.xml');
    assert.match(xml, new RegExp(`<w:ins w:id="${id}" ` +
      `w:author="Ann" w:date="${STAMP}"><w:r><w:t>vxyw</w:t>`));
    assert.equal(shown(blocks(await backOf(d))[0]), shown(P(d)));
  });

  it('typing inside someone else\'s insertion splits it into three ' +
    'and tags the new text with the current author', async () => {
    const d = await docOn(para(run('a') + ins(1, 'bcde') + run('f')));
    typeText(d, car(P(d), 3), 'X');
    assert.equal(shown(P(d)), 'a[ins1Bo:bc][ins2Ann:X][ins3Bo:de]f');
    const tail = P(d).runs.find((x) => x.rev && x.rev.id === 3).rev;
    assert.deepEqual([tail.kind, tail.author, tail.date],
      ['ins', 'Bo', D]);
    const back = await backOf(d);
    assert.equal(shown(blocks(back)[0]), shown(P(d)));
    const xml = await part(d.doc, 'word/document.xml');
    assert.equal(xml.match(/<w:ins /g).length, 3, 'three elements');
    // inside a deletion (All Markup shows it): the same
    const e = await docOn(para(del(1, 'gone')), {markup: 'all'});
    typeText(e, car(P(e), 2), 'Y');
    assert.equal(shown(P(e)), '[del1Bo:go][ins2Ann:Y][del3Bo:ne]');
  });

  it('typing over a selection is a deletion and an insertion; ' +
    'overwrite the same; Enter splits untracked, text tagged; a ' +
    'name not given is Author', async () => {
    const d = await docOn(para(run('hello world')), {name: ''});
    typeText(d, sel(P(d), 0, 5), 'Hi');
    assert.equal(shown(P(d)),
      '[del0Author:hello][ins1Author:Hi] world');
    assert.equal(d.undoDepth, 1);
    const o = await docOn(para(run('abcd')));
    typeText(o, car(P(o), 1), 'XY', {overwrite: true});
    assert.equal(shown(P(o)), 'a[del0Ann:bc][ins1Ann:XY]d');
    const e = await docOn(para(run('ab')));
    typeText(e, car(P(e), 1), 'x\ny');
    assert.deepEqual(blocks(e.doc).map(shown),
      ['a[ins0Ann:x]', '[ins0Ann:y]b']);
    splitPara(e, car(P(e, 1), 1));
    assert.equal(blocks(e.doc).length, 3);
    valid(e.doc);
  });
});

describe('RevTrack: overwrite next to hidden text', () => {
  const over = (d, off, t = 'Q') => typeText(d, car(P(d), off), t,
    {overwrite: true});
  const OFF = '<w:zoom w:percent="100"/>';

  it('Final, tracking off: the next shown letter is replaced, the ' +
    'hidden deletion kept whole', async () => {
    const d = await docOn(para(run('ab') + del(1, 'XYZ') +
      run('cd')), {settings: OFF});
    const s = over(d, 2);
    assert.equal(shown(P(d)), 'ab[del1Bo:XYZ]Qd');
    assert.equal(s.head.off, 6);
    // more letters than shown before the next hidden text: stops
    const e = await docOn(para(run('ab') + del(1, 'X') + run('c') +
      del(2, 'Y') + run('d')), {settings: OFF});
    over(e, 2, 'QR');
    assert.equal(shown(P(e)), 'ab[del1Bo:X]QR[del2Bo:Y]d');
    valid(d.doc);
  });

  it('Final, tracking on: a deletion of the shown letter and an ' +
    'insertion, the hidden deletion untouched', async () => {
    const d = await docOn(para(run('ab') + del(1, 'XYZ') +
      run('cd')));
    over(d, 2);
    assert.equal(shown(P(d)), 'ab[del1Bo:XYZ][del2Ann:c][ins3Ann:Q]d');
    valid(d.doc);
  });

  it('Original: hidden inserted text is stepped over, tracking off ' +
    'and on', async () => {
    const d = await docOn(para(run('ab') + ins(1, 'XYZ') + run('cd')),
      {settings: OFF, markup: 'original'});
    over(d, 2);
    assert.equal(shown(P(d)), 'ab[ins1Bo:XYZ]Qd');
    const e = await docOn(para(run('ab') + ins(1, 'XYZ') + run('cd')),
      {markup: 'original'});
    over(e, 2);
    assert.equal(shown(P(e)),
      'ab[ins1Bo:XYZ][del2Ann:c][ins3Ann:Q]d');
  });

  it('All Markup: tracking off replaces shown deleted text as ' +
    'Delete does; tracking on steps over it as Backspace does',
  async () => {
    const d = await docOn(para(run('ab') + del(1, 'XYZ') +
      run('cd')), {settings: OFF, markup: 'all'});
    over(d, 2);
    assert.equal(shown(P(d)), 'abQ[del1Bo:YZ]cd');
    const e = await docOn(para(run('ab') + del(1, 'XYZ') +
      run('cd')), {markup: 'all'});
    over(e, 2);
    assert.equal(shown(P(e)), 'ab[del1Bo:XYZ][del2Ann:c][ins3Ann:Q]d');
  });

  it('hidden text and nothing shown after it: the text goes in at ' +
    'the caret; no revisions: as before', async () => {
    const d = await docOn(para(run('ab') + del(1, 'XYZ')),
      {settings: OFF});
    over(d, 2);
    assert.equal(shown(P(d)), 'abQ[del1Bo:XYZ]');
    const e = await docOn(para(run('abcd')), {settings: OFF});
    over(e, 1, 'XY');
    assert.equal(shown(P(e)), 'aXYd');
  });
});

describe('RevTrack: Delete and Backspace', () => {
  it('delete of own insertion removes text; delete of other text ' +
    'becomes a deletion and the caret steps over it; backspace ' +
    'likewise', async () => {
    const d = await docOn(para(run('abcd') + ins(9, 'mine', 'Ann') +
      run('ef')));
    // Backspace in Ann's own insertion: gone for real
    let s = deleteBack(d, car(P(d), 8));
    assert.equal(shown(P(d)), 'abcd[ins9Ann:min]ef');
    assert.deepEqual(s.head.off, 7);
    // Backspace over plain text: tagged, the caret before it
    s = deleteBack(d, car(P(d), 4));
    assert.equal(shown(P(d)), 'abc[del10Ann:d][ins9Ann:min]ef');
    assert.equal(s.head.off, 3);
    s = deleteBack(d, s);          // the same deletion goes on
    assert.equal(shown(P(d)), 'ab[del10Ann:cd][ins9Ann:min]ef');
    assert.equal(s.head.off, 2);
    // Delete: the caret after what it deleted, stepping over it
    s = deleteForward(d, car(P(d), 0));
    assert.equal(shown(P(d)),
      '[del11Ann:a]b[del10Ann:cd][ins9Ann:min]ef');
    assert.equal(s.head.off, 1);
    s = deleteForward(d, s);       // b: the same deletion goes on
    assert.equal(shown(P(d)),
      '[del11Ann:ab][del10Ann:cd][ins9Ann:min]ef');
    s = deleteForward(d, s);       // over cd, then m (own): gone
    assert.equal(shown(P(d)),
      '[del11Ann:ab][del10Ann:cd][ins9Ann:in]ef');
    assert.equal(s.head.off, 4, 'the caret stays before own text');
    valid(d.doc);
    assert.equal(shown(blocks(await backOf(d))[0]), shown(P(d)));
  });

  it('deleted text is stepped over in every view, never deleted ' +
    'again; a word key the same', async () => {
    for (const markup of ['final', 'all']) {
      const d = await docOn(para(run('ab') + del(1, 'XY') + run('cd')),
        {markup});
      const s = deleteBack(d, car(P(d), 4));
      assert.equal(shown(P(d)), 'a[del2Ann:b][del1Bo:XY]cd', markup);
      assert.equal(s.head.off, 1);
      deleteForward(d, car(P(d), 2));
      assert.equal(shown(P(d)), 'a[del2Ann:b][del1Bo:XY][del3Ann:c]d');
    }
    const w = await docOn(para(run('one two')));
    deleteWordBack(w, car(P(w), 7));
    assert.equal(shown(P(w)), 'one [del0Ann:two]');
  });

  it('another author\'s insertion, moved text and objects are ' +
    'refused, nothing changed', async () => {
    const d = await docOn(para(run('a') + ins(1, 'bo') + run('c')));
    const n0 = d.undoDepth, p0 = P(d);
    refused(() => deleteBack(d, car(P(d), 3)), /another author/);
    refused(() => deleteSelection(d, sel(P(d), 0, 4)),
      /another author/);
    assert.equal(P(d), p0);
    assert.equal(d.undoDepth, n0);
    const f = await docOn(para(run('a') + field + run('b')));
    const p = P(f), at = p.text.indexOf('b');
    refused(() => deleteSelection(f, sel(p, 0, at + 1)), /objects/);
    assert.equal(P(f), p);
    const x = await docOn(para(run('a') + '<w:foo/>' + run('b')));
    refused(() => deleteSelection(x, sel(P(x), 0, 3)), /objects/);
  });

  it('a deleted range keeps its bookmarks and comment ranges ' +
    '(tagged with it)', async () => {
    const d = await docOn(para(run('ab') + bmS(3) + run('cd') + bmE(3) +
      '<w:commentRangeStart w:id="0"/>' + run('ef') +
      '<w:commentRangeEnd w:id="0"/>' + run('g')));
    const p = P(d), n = p.text.length;
    deleteSelection(d, sel(p, 1, n - 1));
    const q = P(d);
    assert.equal(q.text, p.text, 'nothing removed');
    assert.equal(shown(q), 'a[del0Ann:bcdef]g');
    assert.equal(Object.keys(q.inlines).length, 4);
    const back = blocks(await backOf(d))[0];
    assert.equal(shown(back), shown(q));
    assert.ok(MARKS.has('bookmarkStart'));
  });

  it('paragraph join is refused while tracking', async () => {
    const d = await docOn(para(run('ab')) + para(run('cd')) + TBL +
      para(run('ef')));
    const n0 = d.undoDepth;
    refused(() => deleteBack(d, car(P(d, 1), 0)), /joined/);
    refused(() => deleteForward(d, car(P(d, 0), 2)), /joined/);
    refused(() => deleteSelection(d, sel(P(d, 0), 1, 1, P(d, 1))),
      /one paragraph/);
    refused(() => typeText(d, sel(P(d, 0), 1, 1, P(d, 1)), 'x'),
      /one paragraph/);
    assert.equal(d.undoDepth, n0);
    assert.deepEqual(blocks(d.doc).map((b) => b.text ?? null),
      ['ab', 'cd', null, 'ef']);
    // the start of the document: nothing, no refusal
    assert.equal(S.collapsed(deleteBack(d, car(P(d, 0), 0))), true);
    // by a table the first press still selects it
    const s = deleteBack(d, car(P(d, 3), 0));
    assert.equal(S.collapsed(s), false);
    refused(() => deleteBack(d, s), /one paragraph/);
    assert.equal(d.undoDepth, n0);
  });
});

describe('RevTrack: paste, cut and Replace', () => {
  it('paste is an insertion; cut is a deletion plus a copy; replace ' +
    'is deletion plus insertion', async () => {
    const d = await docOn(para(run('one two')) + para(run('three')));
    pastePlain(d, car(P(d), 0), 'X');
    assert.equal(shown(P(d)), '[ins0Ann:X]one two');
    const src = slice(d.doc, sel(P(d, 1), 0, 3));
    pasteBlocks(d, car(P(d, 1), 5), src.blocks, {sameDoc: true});
    assert.equal(shown(P(d, 1)), 'three[ins1Ann:thr]');
    // two paragraphs: both tagged, the break untracked
    const two = slice(d.doc, sel(P(d, 0), 5, 2, P(d, 1)));
    pasteBlocks(d, car(P(d, 0), 1), two.blocks, {sameDoc: true});
    assert.deepEqual(blocks(d.doc).map(shown).slice(0, 2),
      ['[ins0Ann:X][ins2Ann:two]', '[ins2Ann:th]one two']);
    const c = await docOn(para(run('cut me')));
    const got = cutSelection(c, sel(P(c), 0, 4));
    assert.equal(got.slice.plain, 'cut ');
    assert.equal(shown(P(c)), '[del0Ann:cut ]me');
    assert.equal(got.sel.head.off, 4);
    const r = await docOn(para(run('a cat') + ins(5, 'cat', 'Ann')));
    const m = search(r.doc, null, 'cat', {});
    const out = replaceOne(r, m, 'dog');
    // (going on Ann's own insertion next to it)
    assert.equal(shown(P(r)), 'a [del6Ann:cat][ins5Ann:dogcat]');
    assert.deepEqual([out.from, out.to], [5, 8]);
    // Replace All: the match in Ann's own insertion goes for real
    const a = await docOn(para(run('cat ') + ins(5, 'cat', 'Ann') +
      run(' ') + ins(6, 'cat') + run(' cat')));
    const all = replaceAll(a, 'cat', 'dog', {});
    assert.deepEqual([all.count, all.refused], [3, 1]);
    assert.equal(shown(P(a)), '[del7Ann:cat][ins8Ann:dog] ' +
      '[ins9Ann:dog] [ins6Bo:cat] [del10Ann:cat][ins11Ann:dog]');
    valid(a.doc);
    assert.equal(shown(blocks(await backOf(a))[0]), shown(P(a)));
  });

  it('a table, a field, a picture or a link is not pasted; cut and ' +
    'replace refusals change nothing', async () => {
    const d = await docOn(para(run('ab')) + TBL + para(run('x')) +
      para(run('c') + field));
    const n0 = d.undoDepth;
    const t = slice(d.doc, sel(P(d, 0), 1, 1, P(d, 2)));
    refused(() => pasteBlocks(d, car(P(d, 0), 0), t.blocks,
      {sameDoc: true}), /pasted/);
    const p3 = P(d, 3);
    const f = slice(d.doc, sel(p3, 0, p3.text.length));
    refused(() => pasteBlocks(d, car(P(d, 0), 0), f.blocks,
      {sameDoc: true}), /pasted/);
    assert.equal(d.undoDepth, n0);
    // a link is refused too, and the message names it
    const l = await docOn(para(run('a') + '<w:hyperlink w:anchor="x">' +
      run('link') + '</w:hyperlink>'));
    const ls = slice(l.doc, sel(P(l), 0, P(l).text.length));
    refused(() => pasteBlocks(l, car(P(l), 0), ls.blocks,
      {sameDoc: true}), /^Tables, fields, pictures, links and notes /);
    assert.equal(l.undoDepth, 0);
    const r = await docOn(para(ins(1, 'cat')));
    refused(() => replaceOne(r, search(r.doc, null, 'cat', {}), 'x'),
      /another author/);
    assert.equal(r.undoDepth, 0);
  });
});

describe('RevTrack: the Insert menu over a selection', () => {
  it('a special character is an insertion; a break, a symbol or a ' +
    'table over a selection deletes it as tracked first', async () => {
    const d = await docOn(para(run('one two')));
    putIn(d, car(P(d), 3), '\xa0');
    assert.equal(shown(P(d)), 'one[ins0Ann:\xa0] two');
    putIn(d, sel(P(d), 5, 8), '\xa0');
    assert.equal(shown(P(d)), 'one[ins0Ann:\xa0] [del1Ann:two]' +
      '[ins2Ann:\xa0]');
    const b = await docOn(para(run('one two')));
    pageBreak(b, sel(P(b), 0, 3));
    assert.equal(shown(P(b)), '[del0Ann:one]');
    valid(b.doc);
    const r = await docOn(para(run('ab')) + para(run('cd')));
    refused(() => pageBreak(r, sel(P(r), 1, 1, P(r, 1))),
      /one paragraph/);
    assert.equal(r.undoDepth, 0);
  });
});

describe('RevTrack: what a revision can hold', () => {
  it('a revision holding an unknown empty element or custom XML ' +
    'range marks stays raw: Accept All then undo gives the bytes ' +
    'back', async () => {
    const att2 = (id) => `w:id="${id}" w:author="Bo" w:date="${D}"`;
    const cx = (k, id) => `<w:customXmlIns${k} ${att2(id)}/>`;
    for (const inner of [run('ab') + '<w:foo/>' + run('cd'),
      run('ab') + cx('RangeStart', 7) + run('cd') +
        cx('RangeEnd', 7)]) {
      const body = para(run('x') + `<w:ins ${att2(1)}>${inner}` +
        '</w:ins>' + ins(2, 'ok'));
      const d = await docOn(body, {settings: ''});
      assert.equal(shown(P(d)), 'x[ins2Bo:ok]', 'the first one raw');
      const before = await parts(d.doc);
      const got = acceptAll(d, null);
      assert.deepEqual([got.resolved, got.skipped], [1, 1]);
      assert.equal(d.undo(), true);
      assert.deepEqual(await parts(d.doc), before);
      assert.equal(d.canUndo, false, 'no step left behind');
      await backOf(d);
    }
  });

  it('setRev: a new tag is refused over an unknown element; an ' +
    'inverse (revs) putting old tags back never is', async () => {
    const d = await docOn(para(run('ab') + '<w:foo/>' + run('cd')),
      {settings: ''});
    const p = P(d), n = p.text.length;
    const tag = {id: 3, kind: 'ins', author: 'Bo', attrs: [],
      extra: []};
    assert.throws(() => applyOp(d.doc, {op: 'setRev', at: [0, 0],
      from: 0, to: n, rev: tag}), /cannot hold/);
    const inv = applyOp(d.doc, {op: 'setRev', at: [0, 0], from: 0,
      to: n, revs: [{from: 0, to: n, rev: tag}]});
    assert.ok(P(d).runs.every((r) => r.rev && r.rev.id === 3));
    applyOp(d.doc, inv);
    assert.deepEqual(P(d).runs, p.runs);
  });
});

describe('RevTrack: commands outside the keys refused, not untracked',
  () => {
    it('Insert Table and a field over a selection across paragraphs ' +
      'are refused, nothing changed', async () => {
      const d = await docOn(para(run('ab')) + para(run('cd')));
      const p0 = structuredClone(d.doc.sections);
      const s = sel(P(d), 1, 1, P(d, 1));
      refused(() => insertTable(d, s, {cols: 2, rows: 2}),
        /one paragraph/);
      refused(() => insertFieldCmd(d, s, 'PAGE', {}), /one paragraph/);
      assert.equal(d.undoDepth, 0);
      assert.deepEqual(d.doc.sections, p0);
      // in one paragraph: the selection a tracked deletion first
      insertTable(d, sel(P(d), 0, 1), {cols: 1, rows: 1});
      assert.equal(shown(P(d)), '[del0Ann:a]');
      assert.equal(blocks(d.doc)[1].type, 'tbl');
    });

    it('Change case gives the notice (untracked text)', async () => {
      const d = await docOn(para(run('abc')));
      const said = [];
      d.on('change', (ev) => said.push(RT.noticeFor(d, ev)));
      changeCase(d, null, sel(P(d), 0, 3), 'upper');
      assert.equal(P(d).text, 'ABC');
      assert.ok(P(d).runs.every((r) => !r.rev));
      assert.deepEqual(said, [RT.MSG.notice]);
    });
  });

describe('RevTrack: untracked formatting and undo', () => {
  it('formatting stays untracked and the notice is given once',
    async () => {
      const d = await docOn(para(run('abc')));
      const said = [];
      d.on('change', (ev) => said.push(RT.noticeFor(d, ev)));
      typeText(d, car(P(d), 3), 'd');
      d.apply({op: 'setProps', block: [0, 0],
        range: {start: 0, end: 2}, rPr: {b: true}});
      d.apply({op: 'setProps', block: [0, 0], pPr: {jc: 'center'}});
      d.undo();
      assert.deepEqual(said, [null, RT.MSG.notice, null, null]);
      assert.match(RT.MSG.notice, /formatting changes are not tracked/);
      assert.equal(shown(P(d)), 'abc[ins0Ann:d]', 'no tag for it');
      // off: never; another document: its own first time
      const e = await docOn(para(run('a')), {settings: ''});
      const s2 = [];
      e.on('change', (ev) => s2.push(RT.noticeFor(e, ev)));
      e.apply({op: 'setProps', block: [0, 0], pPr: {jc: 'center'}});
      RT.setTracking(e, null, true);
      e.apply({op: 'setProps', block: [0, 0], pPr: {jc: 'right'}});
      assert.deepEqual(s2, [null, null, RT.MSG.notice]);
    });

  it('undo of any tracked command removes its tags and leaves the ' +
    'opened bytes', async () => {
    const body = para(run('one two') + ins(4, 'mine', 'Ann') +
      ins(5, 'his')) + para(run('three'));
    const cmds = [
      ['type', (d) => typeText(d, car(P(d), 1), 'x')],
      ['type into his', (d) => typeText(d, car(P(d), 13), 'x')],
      ['backspace', (d) => deleteBack(d, car(P(d), 3))],
      ['backspace own', (d) => deleteBack(d, car(P(d), 10))],
      ['delete', (d) => deleteForward(d, car(P(d), 0))],
      ['select', (d) => deleteSelection(d, sel(P(d), 2, 9))],
      ['over', (d) => typeText(d, sel(P(d), 0, 3), 'Z')],
      ['paste', (d) => pastePlain(d, car(P(d, 1), 2), 'p\nq')],
      ['cut', (d) => cutSelection(d, sel(P(d, 1), 0, 2))],
      ['replace', (d) => replaceOne(d, search(d.doc, null, 'two', {}),
        'TWO')],
      ['all', (d) => replaceAll(d, 'e', 'E', {})],
      ['switch', (d) => RT.setTracking(d, null, false)],
    ];
    for (const [name, fn] of cmds) {
      const d = await docOn(body);
      await undoesToBytes(d, () => fn(d), name);
    }
  });

  it('an id is never given twice in a session, even after an undo',
    async () => {
      const d = await docOn(para(run('ab')));
      typeText(d, car(P(d), 1), 'x');
      assert.equal(shown(P(d)), 'a[ins0Ann:x]b');
      d.undo();
      typeText(d, car(P(d), 1), 'y');
      assert.equal(shown(P(d)), 'a[ins1Ann:y]b');
    });
});

describe('RevTrack: where nothing is recorded', () => {
  it('a header, a footer and a note are edited plain', async () => {
    const doc = await readDocx(await withHeaders(para(run('body')),
      {default: {hdr: para(run('head')), ftr: para(run('foot'))}},
      {parts: {'word/settings.xml': settingsXml(TRACK)}}));
    const d = new Document(doc);
    d.reviewer = () => ({name: 'Ann'});
    assert.equal(RT.on(d), true);
    for (const key of doc.stories.keys()) {
      const h = facadeOf(d, key);
      assert.equal(RT.on(h), false);
      const hb = h.doc.sections[0].blocks[0];
      typeText(h, car(hb, 1), 'X');
      deleteBack(h, car(h.doc.sections[0].blocks[0], 3));
      const q = h.doc.sections[0].blocks[0];
      assert.ok(q.runs.every((r) => !r.rev), key);
    }
    const n = new Document(await noteDoc(para(run('x') + mark(2)),
      {2: para(run('note'))}));
    n.doc.rawSettings = d.doc.rawSettings;   // (tracking on)
    assert.equal(RT.on(n), true);
    const f = facadeOf(n, {note: {kind: 'footnote', id: 2}});
    typeText(f, car(f.doc.sections[0].blocks[0], 1), 'X');
    assert.ok(f.doc.sections[0].blocks[0].runs.every((r) => !r.rev));
  });

  it('tracking off costs nothing and changes nothing', async () => {
    const body = para(run('one two') + ins(4, 'his'));
    const on = await docOn(body, {settings: ''});
    const ref = await docOn(body, {settings: ''});
    assert.equal(RT.session(on), null);
    typeText(on, car(P(on), 1), 'x');
    deleteBack(on, car(P(on), 5));
    deleteSelection(on, sel(P(on), 7, 9));
    typeText(ref, car(P(ref), 1), 'x');
    deleteBack(ref, car(P(ref), 5));
    deleteSelection(ref, sel(P(ref), 7, 9));
    assert.deepEqual(P(on).runs, P(ref).runs);
    assert.equal(P(on).text, P(ref).text);
    assert.ok(P(on).runs.every((r) => !r.rev || r.rev.id === 4));
  });
});

describe('RevTrack: ids and hostile input', () => {
  it('no id can be known free: refused, nothing changed, never ' +
    'untracked', async () => {
    const bad = '<w:ins w:id="12x" w:author="Bo" w:date="' + D + '">' +
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r></w:ins>';
    const d = await docOn(para(run('ab') + bad + run('cd')));
    assert.equal(nextId(d.doc), null);
    const p0 = P(d);
    refused(() => typeText(d, car(P(d), 1), 'x'),
      /revision numbers cannot be chosen safely/);
    refused(() => deleteBack(d, car(P(d), 2)),
      /revision numbers cannot be chosen safely/);
    assert.deepEqual(P(d), p0);
    assert.equal(d.undoDepth, 0);
  });

  it('nextId counts style and numbering changes and single-quoted ' +
    'ids in parts kept as bytes', async () => {
    const st = stylesXml('<w:style w:type="paragraph" ' +
      'w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:b/>' +
      '<w:rPrChange w:id="77" w:author="Bo" w:date="' + D + '">' +
      '<w:rPr/></w:rPrChange></w:rPr></w:style>');
    const d = await docOn(para(run('a')), {more: {'word/styles.xml':
      st}});
    assert.ok(nextId(d.doc) >= 78, String(nextId(d.doc)));
    const enc = (s) => new TextEncoder().encode(s);
    const base = {...d.doc, parts: new Map([...(d.doc.parts || []),
      ['word/x.xml',
        enc('<a><w:ins w:id=\'300\' w:author="B"/></a>')]])};
    assert.equal(nextId(base), 301);
    const sp2 = {...d.doc, parts: new Map([['word/y.xml',
      enc('<w:del w:id = "400"/>')]])};
    assert.equal(nextId(sp2), 401);
    const odd = {...d.doc, parts: new Map([['word/z.xml',
      enc('<w:del w:id=400/>')]])};
    assert.equal(nextId(odd), null, 'unquoted: fail closed');
    typeText(d, car(P(d), 1), 'x');
    assert.ok(P(d).runs.some((r) => r.rev && r.rev.id >= 78));
  });

  it('a reviewer that throws or gives nonsense is Author; odd ' +
    'positions do not throw', async () => {
    const d = await docOn(para(run('ab')));
    d.reviewer = () => { throw new Error('x'); };
    typeText(d, car(P(d), 1), 'x');
    assert.equal(shown(P(d)), 'a[ins0Author:x]b');
    d.reviewer = 5;
    typeText(d, car(P(d), 0), 'y');
    assert.equal(shown(P(d)), '[ins1Author:y]a[ins0Author:x]b');
    const s = S.caret({id: 'nope', off: 0});
    assert.equal(typeText(d, s, 'z'), s);
    assert.equal(deleteBack(d, s), s);
    assert.equal(RT.noticeFor(d, null), null);
    assert.equal(RT.noticeFor(d, {kind: 'apply', ops: [null, 5]}),
      null);
    assert.equal(RT.on(null), false);
    assert.equal(RT.on({}), false);
  });

  it('10,000 revisions: typing goes on within the load-robust ratio',
    async () => {
      const many = (n) => {
        let b = '';
        for (let i = 0; i < n / 10; i++) {
          let x = '';
          for (let k = 0; k < 10; k++) x += ins(i * 10 + k + 1, 'w ');
          b += para(x);
        }
        return b;
      };
      const time = async (n) => {
        const d = await docOn(many(n) + para(run('end')));
        const t = new Typing(d, {now: () => 0});
        const last = blocks(d.doc).length - 1;
        let s = t.type(car(P(d, last), 3), 'a');   // (the id: one scan)
        let best = Infinity;
        for (let rep = 0; rep < 3; rep++) {
          const t0 = performance.now();
          for (let k = 0; k < 30; k++) s = t.type(s, 'b');
          s = deleteBack(d, s);
          best = Math.min(best, performance.now() - t0);
        }
        assert.match(shown(P(d, last)), /^end\[ins\d+Ann:ab+\]$/);
        return best;
      };
      const small = await time(100), big = await time(10000);
      assert.ok(big < small * 40 + 20, `typing slowed: ` +
        `${small.toFixed(1)} ms, ${big.toFixed(1)} ms`);
    });
});
