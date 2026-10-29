// NotePatch (Batch E2): the Footnote and Endnote box's values and
// the ops they make: fill at the section and document levels, only
// what changed written, This section vs Whole document (which clears
// the sections' own copies of what it changes), unknown children
// kept, Start at limits, one undo step, the numbers and the pages
// following the options, the saved XML read back, endnotes never
// restarting on each page, hostile stored values, the refusal while
// a header, footer or note is being edited.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as NP from '../../tools/moreapps/!Letters/NotePatch';
import * as NO from '../../tools/moreapps/!Letters/NoteOpts';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {numbers, labelFor}
  from '../../tools/moreapps/!Letters/NoteNumbers';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {p, r} from './build-docx.mjs';
import {lintPackage} from './lint-package.mjs';
import {noteDoc, noteP, mark, emark, enoteP}
  from './note-fixtures.mjs';
import {tm} from './word-docs.mjs';

const FPR = '<w:footnotePr><w:pos w:val="beneathText"/>' +
  '<w:numFmt w:val="lowerRoman"/><w:numStart w:val="3"/>' +
  '<w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>';
const EPR = '<w:endnotePr><w:numFmt w:val="upperLetter"/>' +
  '</w:endnotePr>';
const SECT = (inner = '') => '<w:p><w:pPr><w:sectPr>' + inner +
  '</w:sectPr></w:pPr><w:r><w:t>end one</w:t></w:r></w:p>';
const F = 'footnote', E = 'endnote';

/** A Document of two sections; section 0 holds a mark. */
async function two({settings = '', own = ''} = {}) {
  const doc = await noteDoc(p(r('a') + mark(1)) + SECT(own) +
    p(r('b') + mark(2)) + '<w:sectPr/>',
  {1: noteP('one'), 2: noteP('two')}, {settings});
  const d = new Document(doc);
  return {d, t: new Typing(d)};
}
const caretIn = (d, s) => S.caret({id: d.doc.sections[s].blocks[0].id,
  off: 1});
const fill = (d, s, kind, scope) => NP.fill(d.doc, caretIn(d, s), kind,
  scope);
const patch = (d, s, v) => NP.patch(d.doc, caretIn(d, s), v);
const ownKids = (d, s, kind) => {
  const x = d.doc.sections[s].props.extra.find((c) => c.name ===
    'w:' + kind + 'Pr');
  return x ? x.children.map((c) => c.name + '=' +
    (c.attrs.find(([k]) => k === 'w:val') || [])[1]) : [];
};
const dec = (b) => new TextDecoder().decode(b);

describe('NotePatch', () => {
  it('fill from a document with options at both levels', async () => {
    const {d} = await two({settings: FPR + EPR,
      own: '<w:footnotePr><w:numStart w:val="7"/></w:footnotePr>'});
    assert.deepEqual(fill(d, 0, F, 'all'), {pos: 'beneathText',
      numFmt: 'lowerRoman', numStart: 3, numRestart: 'continuous'});
    assert.deepEqual(fill(d, 0, F, 'section'), {pos: 'beneathText',
      numFmt: 'lowerRoman', numStart: 7, numRestart: 'continuous'});
    assert.deepEqual(fill(d, 1, F, 'section'), fill(d, 1, F, 'all'));
    assert.deepEqual(fill(d, 0, E, 'section'), {pos: 'docEnd',
      numFmt: 'upperLetter', numStart: 1, numRestart: 'continuous'});
  });

  it('changing number format only writes numFmt', async () => {
    const {d} = await two({settings: FPR});
    const now = fill(d, 0, F, 'all');
    const r = patch(d, 0, {scope: 'all', footnote: {...now,
      numFmt: 'lowerLetter'}, endnote: {...fill(d, 0, E, 'all')}});
    assert.deepEqual(r.ops, [{op: 'setNoteOpts', level: 'doc',
      kind: F, value: {numFmt: 'lowerLetter'}}]);
    assert.deepEqual(patch(d, 0, {scope: 'all', footnote: now}).ops,
      []);
  });

  it('Apply to this section writes the section\'s footnotePr and ' +
    'not settings', async () => {
    const {d, t} = await two({settings: FPR});
    const was = d.doc.rawSettings;
    const out = NP.run(d, caretIn(d, 1), {scope: 'section',
      footnote: {numFmt: 'upperRoman', numStart: 2}});
    assert.deepEqual(out, {changed: true});
    assert.equal(d.doc.rawSettings, was);
    assert.deepEqual(ownKids(d, 1, F), ['w:numFmt=upperRoman',
      'w:numStart=2']);
    assert.deepEqual(ownKids(d, 0, F), []);
    assert.equal(fill(d, 1, F, 'section').numFmt, 'upperRoman');
    assert.equal(fill(d, 0, F, 'section').numFmt, 'lowerRoman');
    assert.ok(t);
  });

  it('Whole document writes settings and clears section ' +
    'overrides of the changed property', async () => {
    const {d} = await two({settings: FPR, own:
      '<w:footnotePr><w:numFmt w:val="upperLetter"/>' +
      '<w:numStart w:val="9"/></w:footnotePr>'});
    NP.run(d, caretIn(d, 1), {scope: 'all',
      footnote: {numFmt: 'decimal'}});
    assert.equal(NO.read(d.doc).footnotes.numFmt, 'decimal');
    // the section's numFmt is gone, its numStart (not changed) stays
    assert.deepEqual(ownKids(d, 0, F), ['w:numStart=9']);
    assert.equal(fill(d, 0, F, 'section').numFmt, 'decimal');
    assert.equal(fill(d, 0, F, 'section').numStart, 9);
  });

  it('a section with nothing left loses its footnotePr',
    async () => {
      const {d} = await two({own:
        '<w:footnotePr><w:numFmt w:val="upperLetter"/>' +
        '</w:footnotePr>'});
      NP.run(d, caretIn(d, 0), {scope: 'all',
        footnote: {numFmt: 'lowerLetter'}});
      assert.deepEqual(ownKids(d, 0, F), []);
      assert.ok(!d.doc.sections[0].props.extra.some((c) =>
        c.name === 'w:footnotePr'));
    });

  it('unknown children kept', async () => {
    const {d} = await two({settings: FPR});
    NP.run(d, caretIn(d, 0), {scope: 'all',
      footnote: {numFmt: 'upperLetter', pos: 'pageBottom'}});
    const bytes = await writeDocx(d.doc, {date: new Date(2024, 1, 1)});
    const x = dec((await readZip(bytes)).get('word/settings.xml'));
    assert.ok(x.includes('<w:footnote w:id="-1"/><w:footnote ' +
      'w:id="0"/>'), x);
  });

  it('Start at limits (1..16383) refused with a message',
    async () => {
      const {d} = await two({settings: FPR});
      for (const n of [0, -1, 16384, 1.5, NaN, '3', null]) {
        const r = patch(d, 0, {scope: 'all', footnote: {numStart: n}});
        assert.match(r.error, /1 to 16383/, String(n));
      }
      assert.deepEqual(patch(d, 0, {scope: 'all',
        footnote: {numStart: 16383}}).ops.length, 1);
      assert.deepEqual(patch(d, 0, {scope: 'all',
        footnote: {numStart: 1}}).ops.length, 1);
    });

  it('undo is one step, and nothing changed is none', async () => {
    const {d, t} = await two({settings: FPR + EPR});
    const before = d.undoDepth, s0 = structuredClone(
      d.doc.sections.map((s) => s.props));
    const raw = d.doc.rawSettings;
    const sel = caretIn(d, 0);
    t.command(() => NP.run(d, sel, {scope: 'all',
      footnote: {numFmt: 'decimal', numStart: 4, pos: 'pageBottom'},
      endnote: {numFmt: 'lowerRoman', numRestart: 'eachSect'}}));
    assert.equal(d.undoDepth, before + 1);
    d.undo();
    assert.equal(d.undoDepth, before);
    assert.equal(d.doc.rawSettings, raw);
    assert.deepEqual(d.doc.sections.map((s) => s.props), s0);
    const n = d.undoDepth;
    t.command(() => NP.run(d, sel, {scope: 'all',
      footnote: fill(d, 0, F, 'all')}));
    assert.equal(d.undoDepth, n);
  });

  it('numbers and layout change after Apply', async () => {
    const {d} = await two({settings: ''});
    const num = () => [...numbers(d.doc).footnotes.values()];
    assert.deepEqual(num(), [1, 2].map(String));
    NP.run(d, caretIn(d, 0), {scope: 'all',
      footnote: {numFmt: 'lowerLetter', numStart: 5}});
    assert.deepEqual(num(), ['e', 'f']);
    NP.run(d, caretIn(d, 0), {scope: 'section',
      footnote: {numRestart: 'eachSect'}});
    assert.deepEqual(num(), ['e', 'f']);
    NP.run(d, caretIn(d, 1), {scope: 'section',
      footnote: {numRestart: 'eachSect'}});
    assert.deepEqual(num(), ['e', 'e']);
    // below the text: the notes move up the page
    const body = Array.from({length: 40}, (_, i) => p(r('para ' + i) +
      (i === 1 ? mark(1) : ''))).join('');
    const doc = await noteDoc(body, {1: noteP('n')},
      {settings: ''});
    const e = new Document(doc);
    const noteY = () => {
      const L = new DocLayout(e.doc, tm());
      L.layout(1000);
      const P = new Pages(printGalley(L)).finish();
      return P.at(0).notes.y;
    };
    const foot = noteY();
    NP.run(e, S.caret({id: e.doc.sections[0].blocks[0].id, off: 0}),
      {scope: 'all', footnote: {pos: 'beneathText'}});
    assert.ok(noteY() < foot - 50, `${noteY()} vs ${foot}`);
  });

  it('round trip of the saved XML', async () => {
    const {d} = await two({settings: FPR + EPR});
    NP.run(d, caretIn(d, 0), {scope: 'all',
      footnote: {numFmt: 'chicago', numStart: 6, numRestart:
        'eachPage', pos: 'pageBottom'},
      endnote: {pos: 'sectEnd', numRestart: 'eachSect'}});
    NP.run(d, caretIn(d, 1), {scope: 'section',
      endnote: {numStart: 12}});
    const bytes = await writeDocx(d.doc, {date: new Date(2024, 1, 1)});
    const back = await readDocx(bytes);
    assert.deepEqual(NO.read(back), NO.read(d.doc));
    for (const s of [0, 1]) assert.deepEqual(
      NO.forSection(back, back.sections[s]),
      NO.forSection(d.doc, d.doc.sections[s]));
    assert.equal(NO.forSection(back, back.sections[1]).endnotes
      .numStart, 12);
  });

  it('endnotes restart each page is not offered, and counts as ' +
    'continuous', async () => {
    assert.deepEqual(NP.RESTARTS.endnote.map((x) => x.id),
      ['continuous', 'eachSect']);
    assert.equal(NP.RESTARTS.footnote.length, 3);
    const {d} = await two({settings: '<w:endnotePr>' +
      '<w:numRestart w:val="eachPage"/></w:endnotePr>'});
    assert.equal(fill(d, 0, E, 'all').numRestart, 'continuous');
    // shown, not changed: nothing written (the file keeps it)
    assert.deepEqual(patch(d, 0, {scope: 'all',
      endnote: fill(d, 0, E, 'all')}).ops, []);
    assert.match(patch(d, 0, {scope: 'all',
      endnote: {numRestart: 'eachPage'}}).error, /Endnotes/);
  });

  it('the choices: Word\'s lists', () => {
    assert.deepEqual(NP.POS.footnote.map((x) => x.id),
      ['pageBottom', 'beneathText']);
    assert.deepEqual(NP.POS.endnote.map((x) => x.id),
      ['sectEnd', 'docEnd']);
    assert.deepEqual(NP.NUM_FMTS.map((x) => x.id), ['decimal',
      'lowerLetter', 'upperLetter', 'lowerRoman', 'upperRoman',
      'chicago']);
  });

  it('hostile existing values show Word\'s defaults and are not ' +
    'rewritten unless changed', async () => {
    const {d} = await two({settings: '<w:footnotePr>' +
      '<w:pos w:val="sideways"/><w:numFmt w:val="bogus"/>' +
      '<w:numStart w:val="99999999999"/></w:footnotePr>'});
    const now = fill(d, 0, F, 'all');
    assert.deepEqual(now, NO.DEFAULTS.footnotes);
    const raw = d.doc.rawSettings;
    assert.deepEqual(patch(d, 0, {scope: 'all', footnote: now}).ops,
      []);
    NP.run(d, caretIn(d, 0), {scope: 'all',
      footnote: {numFmt: 'lowerRoman'}});
    assert.notEqual(d.doc.rawSettings, raw);
    assert.equal(NO.read(d.doc).footnotes.numFmt, 'lowerRoman');
    assert.equal(NO.read(d.doc).footnotes.pos, 'pageBottom');
    assert.match(patch(d, 0, {scope: 'all', footnote:
      {pos: 'sectEnd'}}).error, /not an option/i);
  });

  it('Whole document in a document with no settings part is ' +
    'refused; This section is not', async () => {
    const doc = await noteDoc(p(r('a') + mark(1)), {1: noteP('x')});
    const d = new Document(doc);
    if (d.doc.rawSettings) return;      // (the fixture has one)
    const sel = S.caret({id: d.doc.sections[0].blocks[0].id, off: 0});
    assert.match(NP.patch(d.doc, sel, {scope: 'all',
      footnote: {numStart: 3}}).error, /settings/);
    assert.equal(NP.patch(d.doc, sel, {scope: 'section',
      footnote: {numStart: 3}}).ops.length, 1);
  });

  it('no caret and a bad scope are refused', async () => {
    const {d} = await two();
    assert.ok(NP.patch(d.doc, null, {scope: 'all'}).error);
    assert.match(patch(d, 0, {scope: 'forward'}).error, /Apply/);
  });

  it('header, footer and note mode refuse', () => {
    assert.equal(NP.modeWhy(null), null);
    assert.equal(NP.modeWhy(undefined), null);
    assert.match(NP.modeWhy({}), /Leave the header or footer/);
  });

  it('endnote kind uses endnote choices', async () => {
    const {d} = await two();
    assert.match(patch(d, 0, {scope: 'all', endnote:
      {pos: 'pageBottom'}}).error, /not an option/i);
    assert.equal(patch(d, 0, {scope: 'all', endnote:
      {pos: 'sectEnd'}}).ops.length, 1);
    assert.ok(emark && enoteP);
  });
});

describe('Insert with the Custom mark field (insertRun)', () => {
  const vals = {scope: 'section', footnote: {numFmt: 'lowerRoman'}};
  const fns = (d) => [...d.doc.notes.footnotes.keys()];

  it('with * : a custom-marked note, the options and the note one ' +
    'undo step; the numbering unaffected', async () => {
    const {d, t} = await two();
    const depth = d.undoDepth, sel = caretIn(d, 0);
    const out = t.command(() => NP.insertRun(d, sel, vals, F, '*'));
    assert.ok(out && out.note, 'a note');
    assert.equal(d.undoDepth, depth + 1, 'one step');
    const id = out.note.id;
    assert.equal(labelFor(d.doc, F, id), '*');
    const x = d.doc.sections[0].blocks[0].inlines[1];
    assert.equal(x.id, id, 'the mark at the caret');
    assert.equal(x.custom, '*');
    assert.equal(d.doc.notes.footnotes.get(id).blocks[0].text
      .slice(0, 2), '* ');
    assert.deepEqual(ownKids(d, 0, F), ['w:numFmt=lowerRoman']);
    assert.deepEqual(Object.fromEntries(numbers(d.doc).footnotes),
      {1: 'i', 2: '2'}, 'the custom note takes no number');
    d.undo();
    assert.equal(d.undoDepth, depth);
    assert.deepEqual(fns(d), [-1, 0, 1, 2]);
    assert.deepEqual(ownKids(d, 0, F), []);
  });

  it('an invalid mark is refused, nothing changed', async () => {
    const {d, t} = await two();
    const depth = d.undoDepth, doc = d.doc, sel = caretIn(d, 0);
    for (const bad of ['   ', 'a<b', 'x'.repeat(11), '\u0007']) {
      const out = t.command(() => NP.insertRun(d, sel, vals, F, bad));
      assert.ok(out && typeof out.error === 'string', bad);
      assert.equal(d.undoDepth, depth);
      assert.equal(d.doc, doc, 'nothing changed');
    }
  });

  it('an empty field: a numbered note, as before', async () => {
    const {d, t} = await two();
    const depth = d.undoDepth, sel = caretIn(d, 0);
    const out = t.command(() => NP.insertRun(d, sel, vals, F, ''));
    assert.equal(d.undoDepth, depth + 1);
    const x = d.doc.sections[0].blocks[0].inlines[1];
    assert.equal(x.id, out.note.id);
    assert.equal(x.custom, undefined);
    assert.equal(labelFor(d.doc, F, out.note.id), 'i');
    assert.equal(labelFor(d.doc, F, 1), 'ii');
  });
});

describe('the written options: Word\'s child order', () => {
  const ORDER = ['pos', 'numFmt', 'numStart', 'numRestart'];
  const kids = (xml) => [...xml.matchAll(/<w:(\w+)[\s/>]/g)]
    .map((m) => m[1]);
  /** The local names of el's children in xml, each element once. */
  const childrenOf = (xml, el) => {
    const m = xml.match(new RegExp('<w:' + el + '>(.*?)</w:' + el +
      '>'));
    return m ? kids(m[1]) : null;
  };
  const inOrder = (got, want) => {
    const at = got.map((k) => want.indexOf(k));
    return at.every((x, i) => x >= 0 && (i === 0 || x >= at[i - 1]));
  };

  it('both kinds at both levels: lint clean, children and places ' +
    'as the schema has them', async () => {
    const sect = '<w:type w:val="nextPage"/><w:pgSz w:w="11906" ' +
      'w:h="16838"/>';
    const {d} = await two({settings: '<w:defaultTabStop ' +
      'w:val="720"/><w:compat/>', own: sect});
    const all = {footnote: {numRestart: 'eachSect', numStart: 2,
      numFmt: 'lowerRoman', pos: 'beneathText'},
    endnote: {numRestart: 'eachSect', numStart: 3,
      numFmt: 'upperLetter', pos: 'sectEnd'}};
    assert.equal(NP.run(d, caretIn(d, 0), {scope: 'all', ...all})
      .changed, true);
    const own = {footnote: {numRestart: 'continuous', numStart: 5,
      numFmt: 'upperRoman', pos: 'pageBottom'},
    endnote: {numRestart: 'continuous', numStart: 7,
      numFmt: 'lowerLetter', pos: 'docEnd'}};
    assert.equal(NP.run(d, caretIn(d, 0), {scope: 'section', ...own})
      .changed, true);
    const zip = await readZip(await writeDocx(d.doc,
      {date: new Date(0)}));
    assert.deepEqual(lintPackage(zip).problems.filter((q) =>
      q.level === 'error'), []);
    const st = dec(zip.get('word/settings.xml'));
    const doc = dec(zip.get('word/document.xml'));
    for (const k of ['footnote', 'endnote']) {
      const sk = childrenOf(st, k + 'Pr');
      assert.deepEqual(sk.filter((x) => x !== k), ORDER, 'settings');
      assert.ok(inOrder(sk, [...ORDER, k]), 'references last: ' + sk);
      const sec = doc.match(/<w:sectPr>(.*?)<\/w:sectPr>/)[1];
      assert.deepEqual(childrenOf(sec, k + 'Pr'), ORDER, 'sectPr');
    }
    const PR = /<w:(footnote|endnote)Pr>.*?<\/w:\1Pr>/g;
    const top = kids(st.replace(PR, '<w:$1Pr/>')).filter((x) =>
      x !== 'settings');
    assert.ok(inOrder(top, ['defaultTabStop', 'footnotePr',
      'endnotePr', 'compat']), 'settings: ' + top);
    const sec = kids(doc.match(/<w:sectPr>(.*?)<\/w:sectPr>/)[1]
      .replace(PR, '<w:$1Pr/>'));
    assert.ok(inOrder(sec, ['footnotePr', 'endnotePr', 'type',
      'pgSz']), 'sectPr: ' + sec);
  });
});
