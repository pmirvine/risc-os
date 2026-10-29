// Footnotes and endnotes round trip (Batch E2): the whole pipeline
// (open, lay out, paginate, save) and the note commands proved on
// generated documents and the corpus (git-ignored, optional).
//
//   - the pipeline: a file opened, laid out and paginated in Print
//     layout (the Doc deep-frozen first, so layout code cannot
//     change the model), then saved, writes every part as without
//     the layout, its notes parts as read and every mark element as
//     it was in the file;
//   - a story of note commands (insert a footnote and an endnote,
//     type in a note through its facade, delete a mark, a custom
//     mark, convert this / all / swap, the options at section and
//     document level, a marked slice copied and pasted) and a seeded
//     40-command burst of them with cut, paste, undo and redo,
//     through roundtrip-lib's roundTrip: the model read back equals
//     the changed one, ModelCheck clean at every step, the package
//     linter and xmllint/wml.xsd (main part, and here the notes and
//     settings parts too) add no error, undo of everything gives
//     back the opened model and its bytes;
//   - the census of the marks and notes of real files (a mark whose
//     note is missing, notes with no mark or more than one, the
//     numbers recounted from the options): printed, for they are
//     data; the numbers must agree;
//   - hostile files never throw or hang (timing by ratios; absolute
//     ceilings only under WORD_PERF=1);
//   - layout: page starts of the corpus files with notes scored
//     against Word's with and without the notes on the pages (never
//     worse), and oracle documents whose pages are worked out by
//     hand from the measured heights (the fake measurer).
//
// The corpus is gated as the other round trips: one file in ten by a
// hash of its name, every file with WORD_EDIT_CORPUS=1 (which needs
// NODE_OPTIONS=--max-old-space-size=2048).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readDocx, DocxError}
  from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {printGalley, hfHooks}
  from '../../tools/moreapps/!Letters/PageHF';
import {galleyOf} from '../../tools/moreapps/!Letters/PageGalley';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {numbers, noteState, marks}
  from '../../tools/moreapps/!Letters/NoteNumbers';
import {insertNote, convertNote, customMark, SCOPES}
  from '../../tools/moreapps/!Letters/NoteCmd';
import * as NP from '../../tools/moreapps/!Letters/NotePatch';
import {forSection} from '../../tools/moreapps/!Letters/NoteOpts';
import {formatNumber, chicago}
  from '../../tools/moreapps/!Letters/NumFormat';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {slice} from '../../tools/moreapps/!Letters/ClipSlice';
import {cutSelection, pasteBlocks}
  from '../../tools/moreapps/!Letters/ClipPaste';
import {deleteSelection} from '../../tools/moreapps/!Letters/EditDel';
import {run} from '../../tools/moreapps/!Letters/EditApply';
import {checkBlock, checkNotes}
  from '../../tools/moreapps/!Letters/ModelCheck';
import {scan} from '../../tools/moreapps/!Letters/Walk';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {buildDocx, documentXml, settingsXml, stylesXml, p, r, REL,
  W_NS, R_NS} from './build-docx.mjs';
import {noteDoc, noteP, mark, emark, enoteP, words, SEPS}
  from './note-fixtures.mjs';
import {freeze, hdrXml, ftrXml} from './story-fixtures.mjs';
import {drawingXml, pngBytes} from './pic-fixtures.mjs';
import {lintPackage} from './lint-package.mjs';
import {roundTrip, schema, hash, corpusFiles, corpusRun, nameOf, ALL,
  SKIP_CORPUS, write} from './roundtrip-lib.mjs';
import {rng, tm} from './word-docs.mjs';
import {wordStarts, lineBase, ourStarts, placesOf, scoreStarts,
  madeByWord} from './pagestarts.mjs';

export const STEPS = 40;
const BURST_MS = 4000;
const F = 'footnote', E = 'endnote';
const SLOT = {footnote: 'footnotes', endnote: 'endnotes'};
const pick = (rd, a) => a[Math.floor(rd() * a.length)];
const dec = new TextDecoder();
const DECL = '<?xml version="1.0" encoding="UTF-8" ' +
  'standalone="yes"?>\n';
const isNotesPart = (n) => /(^|\/)(footnotes|endnotes)\d*\.xml$/
  .test(n);
const {xsd, note: xsdNote} = schema();

// ------------------------------------------------------------ helpers

/** The body's paragraphs, tables included, in order. */
function paras(doc) {
  const out = [];
  scan(doc, (b) => { if (b.type === 'p') out.push(b); });
  return out;
}

/** The body's marks in order: {x, off, b, s} (no self marks). */
function bodyMarks(doc) {
  const out = [];
  (doc.sections || []).forEach((sec, s) => {
    scan({sections: [sec]}, (b) => {
      if (b.type !== 'p') return;
      for (const {x, off} of marks(b)) out.push({x, off, b, s});
    });
  });
  return out;
}

/** The normal notes of a kind ([] for none). */
const normalNotes = (doc, kind) => {
  const m = doc.notes && doc.notes[SLOT[kind]];
  return m instanceof Map ? [...m.values()].filter((n) =>
    n.type === 'normal') : [];
};

/** ModelCheck over the body, the stories and every note. */
function checkAll(doc) {
  scan(doc, (b) => checkBlock(b));
  checkNotes(doc.notes);
  for (const k of ['footnotes', 'endnotes']) {
    const m = doc.notes && doc.notes[k];
    for (const n of m instanceof Map ? m.values() : []) {
      for (const b of n.blocks) checkBlock(b);
    }
  }
}

const REF = {footnote: 'FootnoteReference',
  endnote: 'EndnoteReference'};
const REFS = new Set(Object.values(REF));

/** The body marks whose run is in a note reference style of the
 *  other kind (a footnote mark in Endnote Reference, or back). */
function wrongStyle(doc) {
  let n = 0;
  for (const {x, off, b} of bodyMarks(doc)) {
    const u = b.runs.find((v) => v.start <= off && off < v.end);
    if (u && REFS.has(u.rStyle) && u.rStyle !== REF[x.note]) n++;
  }
  return n;
}

/** The text a recount gives count n in format fmt. */
function shown(n, fmt) {
  if (fmt === 'chicago') return chicago(n);
  if (fmt === 'numberInDash') return '- ' + n + ' -';
  return formatNumber(n, fmt);
}

/**
 * The census of doc's marks and notes, per kind: marks, missing (a
 * mark whose note is not there), orphans (a normal note no mark
 * names), twice (a note named by more than one mark), numbers (the
 * numbers recounted here from the marks and the options: how many
 * differ from ./NoteNumbers'), gaps (a decimal run of numbers in a
 * section not counting on by one).
 */
function census(doc) {
  const out = {};
  const nums = numbers(doc);
  for (const kind of [F, E]) {
    const slot = SLOT[kind], state = noteState(doc, slot);
    const m = doc.notes && doc.notes[slot];
    const has = (id) => state === 'unknown' || (m instanceof Map &&
      m.has(id));
    const c = {marks: 0, missing: 0, orphans: 0, twice: 0,
      numbers: 0, gaps: 0};
    const seen = new Map();
    let n = 0, on = false, last = -1, prev = null;
    for (const {x, s} of bodyMarks(doc)) {
      if (x.note !== kind) continue;
      c.marks++;
      seen.set(x.id, (seen.get(x.id) || 0) + 1);
      if (typeof x.custom === 'string') continue;
      if (!has(x.id)) {
        c.missing++;
        continue;
      }
      if (seen.get(x.id) > 1) continue;
      const o = forSection(doc, doc.sections[s])[slot];
      const restart = !on || (o.numRestart === 'eachSect' && s !==
        last);
      n = restart ? o.numStart : n + 1;
      on = true;
      last = s;
      if (nums[slot].get(x.id) !== shown(n, o.numFmt)) c.numbers++;
      if (o.numFmt === 'decimal' && !restart && prev !== null &&
        Number(nums[slot].get(x.id)) !== prev + 1) c.gaps++;
      prev = Number(nums[slot].get(x.id));
    }
    for (const note of normalNotes(doc, kind)) {
      if (!seen.has(note.id)) c.orphans++;
    }
    for (const v of seen.values()) if (v > 1) c.twice++;
    out[kind] = c;
  }
  return out;
}

const sumCensus = (a, b) => {
  for (const k of [F, E]) {
    for (const [f, v] of Object.entries(b[k])) a[k][f] =
      (a[k][f] || 0) + v;
  }
  return a;
};
const zeroCensus = () => ({[F]: {}, [E]: {}});

/** Every mark element (w:footnoteReference, w:endnoteReference) of
 *  an XML part, as text, in order. */
function markEls(bytes) {
  if (!bytes) return [];
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (/(^|:)(footnote|endnote)Reference$/.test(n.name)) {
      out.push(JSON.stringify([n.name, n.attrs]));
    }
    for (const c of n.children || []) walk(c);
  };
  walk(parseXml(dec.decode(bytes).replace(/^﻿/, '')).root);
  return out;
}

/** Lay out and paginate doc as Print layout does. */
function paginate(doc) {
  const L = new DocLayout(doc, tm());
  L.layout(1000);
  const G = printGalley(L);
  const P = new Pages(G).finish();
  return {L, G, P};
}

/** The package lint's errors. */
const errsOf = (z) => lintPackage(z).problems
  .filter((q) => q.level === 'error')
  .map((q) => q.rule + ' ' + q.part + ' ' + q.detail);

/** Whether a file (zip) has a footnotes or endnotes part. */
async function hasNotesPart(bytes) {
  try {
    return [...(await readZip(bytes)).keys()].some(isNotesPart);
  } catch (e) {
    return false;
  }
}

// ----------------------------------------------------------- documents

const TBL = (rows) => '<w:tbl><w:tblPr><w:tblW w:w="0" ' +
  'w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="3000"/>' +
  '<w:gridCol w:w="3000"/>' +
  '</w:tblGrid>' + rows + '</w:tbl>';
const TR = (a, b) => `<w:tr><w:tc>${a}</w:tc><w:tc>${b}</w:tc></w:tr>`;

/** "a[1]b[2]c" / "d[3]e" / a table with a mark / endnotes 1, 2. */
const mixed = () => noteDoc(
  p(r('Alpha ') + mark(1) + r(' beta ') + mark(2) + r(' gamma')) +
  p(r('Delta ') + emark(1) + r(' epsilon ') + mark(3)) +
  TBL(TR(p(r('cell ') + mark(4)), p(r('other ') + emark(2)))) +
  p(r('Zeta eta theta')),
  {1: noteP('one'), 2: noteP('two') + p(r('second para')),
    3: noteP('three'), 4: noteP('four')},
  {endnotes: {1: enoteP('end one'), 2: enoteP('end two')},
    settings: '<w:footnotePr><w:footnote w:id="-1"/><w:footnote ' +
      'w:id="0"/></w:footnotePr><w:endnotePr><w:endnote w:id="-1"/>' +
      '<w:endnote w:id="0"/></w:endnotePr>'});

/** Two sections, footnotes restarting in each, a custom mark. */
const sections = () => noteDoc(
  p(r('One ') + mark(1) + r(' two ') + mark(2),
    '<w:sectPr><w:footnotePr><w:numFmt w:val="lowerRoman"/>' +
    '<w:numRestart w:val="eachSect"/></w:footnotePr>' +
    '<w:type w:val="nextPage"/></w:sectPr>') +
  p(r('Three ') + '<w:r><w:footnoteReference w:customMarkFollows=' +
    '"1" w:id="3"/><w:t>*</w:t></w:r>' + r(' four ') + mark(4)) +
  '<w:sectPr><w:footnotePr><w:numRestart w:val="eachSect"/>' +
  '</w:footnotePr></w:sectPr>',
  {1: noteP('i'), 2: noteP('ii'), 3: p(r('* custom')),
    4: noteP('restart')},
  {settings: '<w:footnotePr><w:footnote w:id="-1"/><w:footnote ' +
    'w:id="0"/></w:footnotePr>'});

const SMARK = (el, id) => '<w:r><w:rPr><w:rStyle w:val="' +
  REF[el] + '"/></w:rPr><w:' + el + 'Reference w:id="' + id +
  '"/></w:r>';
const REF_STYLES = stylesXml('<w:style w:type="paragraph" ' +
  'w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
  '</w:style><w:style w:type="character" w:styleId=' +
  '"FootnoteReference"><w:name w:val="footnote reference"/><w:rPr>' +
  '<w:vertAlign w:val="superscript"/></w:rPr></w:style><w:style ' +
  'w:type="character" w:styleId="EndnoteReference"><w:name ' +
  'w:val="endnote reference"/><w:rPr><w:vertAlign ' +
  'w:val="superscript"/></w:rPr></w:style>');

/** Marks of both kinds side by side, in their reference styles. */
const adjacent = () => noteDoc(
  p(r('Pair ') + SMARK('footnote', 1) + SMARK('endnote', 1) +
    SMARK('endnote', 2) + SMARK('footnote', 2) + r(' then ') +
    SMARK('footnote', 3) + SMARK('footnote', 4) + r(' end')) +
  p(r('More ') + SMARK('endnote', 3) + SMARK('footnote', 5) +
    r(' text')),
  {1: noteP('f1'), 2: noteP('f2'), 3: noteP('f3'), 4: noteP('f4'),
    5: noteP('f5')},
  {endnotes: {1: enoteP('e1'), 2: enoteP('e2'), 3: enoteP('e3')},
    styles: REF_STYLES});

/** A plain document with no notes part at all. */
const plain = async () => readDocx(await buildDocx({
  'word/document.xml': documentXml(p(r('First paragraph here')) +
    p(r('Second paragraph, a little longer')) + p(r('Third')))}));

/** Endnotes only, at each section's end. */
const endOnly = () => noteDoc(
  p(r('Body ') + emark(1)) + p(r('More ') + emark(2)),
  {}, {endnotes: {1: enoteP('first'), 2: enoteP('second') +
    p(r('more of it'))}, settings: '<w:endnotePr><w:pos ' +
    'w:val="sectEnd"/><w:numFmt w:val="upperLetter"/></w:endnotePr>'});

/** Every generated document: [name, () => Promise<bytes>]. */
const asBytes = (mk) => async () => write(await mk());
const DOCS = [
  ['footnotes, endnotes, a table', asBytes(mixed)],
  ['two sections restarting, a custom mark', asBytes(sections)],
  ['no notes part', asBytes(plain)],
  ['endnotes at section end', asBytes(endOnly)],
  ['marks of both kinds side by side', asBytes(adjacent)],
];

// ------------------------------------------------------------ pipeline

/**
 * Open bytes, freeze the Doc, lay it out and paginate it, save it:
 * every part as the save of a fresh read, the notes parts as the
 * file's, the marks as the file's. Returns {notes, marks, pages}.
 */
async function pipeline(bytes, what) {
  const doc = await readDocx(bytes);
  const want = await readZip(await write(await readDocx(bytes)));
  freeze(doc);
  const before = new Map(['footnotes', 'endnotes'].map((k) =>
    [k, doc.notes[k] instanceof Map ? [...doc.notes[k]] : []]));
  const {P} = paginate(doc);
  assert.ok(P.done && P.count >= 1, what + ': paginated');
  for (const [k, list] of before) {
    const now = doc.notes[k] instanceof Map ? [...doc.notes[k]] : [];
    assert.equal(now.length, list.length, what + ': ' + k + ' Map');
    now.forEach(([id, n], i) => assert.ok(id === list[i][0] &&
      n === list[i][1], what + ': ' + k + ' ' + id + ' kept'));
  }
  const z = await readZip(await write(doc));
  assert.deepEqual([...z.keys()].sort(), [...want.keys()].sort(),
    what + ': the same parts');
  for (const [n, b] of want) {
    assert.ok(Buffer.from(z.get(n)).equals(Buffer.from(b)), what +
      ': ' + n + ' as without the layout');
  }
  const zin = await readZip(bytes);
  let notes = 0, ms = 0;
  for (const n of Object.values(doc.meta.noteParts || {})) {
    assert.ok(Buffer.from(z.get(n)).equals(Buffer.from(zin.get(n))),
      what + ': ' + n + ' as read');
    notes++;
  }
  for (const n of zin.keys()) {
    if (!/\.xml$/.test(n) || isNotesPart(n) || !z.get(n)) continue;
    const a = markEls(zin.get(n));
    if (!a.length) continue;
    assert.deepEqual(markEls(z.get(n)), a, what + ': marks of ' + n);
    ms += a.length;
  }
  return {notes, marks: ms, pages: P.count};
}

describe('notes round trip: the pipeline (open, lay out, ' +
  'paginate, save)', () => {
  for (const [name, make] of DOCS) {
    it(name, async () => {
      await pipeline(await make(), name);
    });
  }
});

// ------------------------------------------------------------ commands

/** The selection after the mark m ({off, b}). */
const after = (m) => S.caret({id: m.b.id, off: m.off + 1});

/** The part schema errors of the notes and settings parts of doc's
 *  save that the save of `was` (a zip) did not have. (A Strict
 *  document's parts are not checked: wml.xsd is Transitional.) */
async function partSchema(doc, was) {
  if (!xsd || doc.meta.conformance === 'strict') return [];
  const z = await readZip(await write(doc));
  const names = [...Object.values(doc.meta.noteParts || {}),
    doc.meta.settingsPart].filter((n) => n && z.get(n));
  const out = [];
  for (const n of names) {
    const had = was.get(n) ? xsd.errors(was.get(n)) : new Set();
    for (const e of xsd.errors(z.get(n))) {
      if (!had.has(e)) out.push(n + ': ' + e);
    }
  }
  return out;
}

/** Insert a note of kind at the end of paragraph b (or its start). */
function insertAt(d, t, b, kind, end = true) {
  const off = end ? b.text.length : 0;
  return insertNote(d, t, S.caret({id: b.id, off}), kind);
}

/** Type text at the end of note {kind, id}'s first paragraph. */
function typeInNote(d, kind, id, text) {
  const f = facadeOf(d, {note: {kind, id}});
  const nb = f.doc.sections[0].blocks.find((b) => b.type === 'p');
  if (!nb) return false;
  new Typing(f, {now: () => 0}).type(S.caret({id: nb.id,
    off: nb.text.length}), text);
  return true;
}

/** pasteBlocks' options for slice s. */
const optsOf = (s, sameDoc) => ({sameDoc, styleNames: s.styleNames,
  styles: s.styles, lists: s.lists, pics: s.pics,
  picScope: s.picScope, notes: s.notes});

/**
 * The story: every note command once, in a set order, each checked.
 * counts: the commands that changed the document.
 */
export async function noteStory(d, seed) {
  const was = await readZip(await write(d.doc));
  const t = new Typing(d, {now: () => 0});
  const counts = {};
  const did = (k, ok) => {
    const key = k + (ok ? '' : ' refused');
    counts[key] = (counts[key] || 0) + 1;
    checkAll(d.doc);
  };
  const ps = () => paras(d.doc).filter((b) => b.text.length);
  const first = () => ps()[0] || paras(d.doc)[0];
  const last = () => {
    const a = ps();
    return a[a.length - 1] || paras(d.doc)[0];
  };
  // a footnote and an endnote put in, text typed in each
  let fn = null, en = null;
  if (first()) {
    const x = insertAt(d, t, first(), F);
    did('insert footnote', !!x);
    if (x) fn = x.note;
    const y = insertAt(d, t, last(), E, false);
    did('insert endnote', !!y);
    if (y) en = y.note;
  }
  if (fn) did('type in a footnote', typeInNote(d, F, fn.id,
    ' typed in the note'));
  if (en) {
    did('type in an endnote', typeInNote(d, E, en.id, ' and here'));
  }
  // a mark of the file deleted (its note goes with it), else ours
  const ms = bodyMarks(d.doc);
  const mine = (m) => (fn && m.x.note === F && m.x.id === fn.id) ||
    (en && m.x.note === E && m.x.id === en.id);
  const del = ms.find((m) => !mine(m)) || ms.find((m) => en &&
    m.x.note === E && m.x.id === en.id);
  if (del) {
    const at = S.select({id: del.b.id, off: del.off},
      {id: del.b.id, off: del.off + 1});
    const had = d.undoDepth;
    deleteSelection(d, at);
    did('delete a mark', d.undoDepth > had);
  }
  // a custom mark on the first footnote mark left
  const fm = bodyMarks(d.doc).find((m) => m.x.note === F);
  if (fm) {
    const res = customMark(d, t, F, fm.x.id, '*');
    did('custom mark', res.changed);
  }
  // convert: this, all footnotes, swap
  const cm = bodyMarks(d.doc).find((m) => typeof m.x.custom !==
    'string');
  if (cm) {
    const res = convertNote(d, t, after(cm), 'this');
    did('convert this', res.changed > 0);
  }
  for (const scope of ['allFootnotes', 'swap']) {
    const b = first();
    if (!b) break;
    const res = convertNote(d, t, S.caret({id: b.id, off: 0}), scope);
    did('convert ' + scope, res.changed > 0);
  }
  // the options: this section, then the whole document
  const b = first();
  if (b) {
    const sel = S.caret({id: b.id, off: 0});
    const a = t.command(() => NP.run(d, sel, {scope: 'section',
      footnote: {numFmt: 'lowerRoman', numStart: 3},
      endnote: {numRestart: 'eachSect'}}));
    did('options (section)', !!a.changed);
    const c = t.command(() => NP.run(d, sel, {scope: 'all',
      footnote: {numFmt: 'upperLetter', numRestart: 'eachSect'},
      endnote: {pos: 'sectEnd', numFmt: 'chicago'}}));
    did('options (document)', !!c.changed);
  }
  // a slice holding a mark copied, pasted at the end of the last
  // paragraph
  const pm = bodyMarks(d.doc)[0];
  if (pm) {
    const s = slice(d.doc, S.select({id: pm.b.id, off: 0},
      {id: pm.b.id, off: pm.off + 1}));
    const end = last();
    const had = d.undoDepth;
    if (s && end) {
      pasteBlocks(d, S.caret({id: end.id, off: end.text.length}),
        s.blocks, optsOf(s, true));
    }
    did('paste a marked slice', d.undoDepth > had);
  }
  const extra = await partSchema(d.doc, was);
  assert.deepEqual(extra.slice(0, 5), [], 'notes parts: schema ' +
    'errors added (seed ' + seed + ')');
  return {counts};
}

// ----------------------------------------------------------- the burst

/** A random caret or range in the body. */
function randSel(rd, doc) {
  const ps = paras(doc);
  if (!ps.length) return null;
  const at = (b) => ({id: b.id, off: Math.floor(rd() *
    (b.text.length + 1))});
  const a = pick(rd, ps);
  if (rd() < 0.5) return S.caret(at(a));
  return S.select(at(a), rd() < 0.7 ? at(a) : at(pick(rd, ps)));
}

const TEXTS = ['*', '**', '†', 'a', 'note', null];
const FMTS = NP.NUM_FMTS.map((x) => x.id);

/** One random command: its name. */
function command(rd, d, t, k) {
  const x = rd();
  if (x < 0.1) {
    let n = 1 + Math.floor(rd() * 6);
    while (n-- > 0 && d.undo());
    let m = Math.floor(rd() * 4);
    while (m-- > 0 && d.redo());
    return 'undo/redo';
  }
  const ms = bodyMarks(d.doc);
  const kind = rd() < 0.6 ? F : E;
  if (x < 0.26) {
    // (often right before or after a mark: marks of both kinds side
    // by side)
    const m = ms.length && rd() < 0.4 ? pick(rd, ms) : null;
    const sel = m ? S.caret({id: m.b.id, off: m.off + (rd() < 0.5 ?
      0 : 1)}) : randSel(rd, d.doc);
    if (!sel) return 'none';
    return insertNote(d, t, sel, kind) ? 'insert' : 'insert refused';
  }
  if (x < 0.38) {
    if (!ms.length) return 'none';
    const m = pick(rd, ms);
    const had = d.undoDepth;
    if (rd() < 0.5) {
      run(rd() < 0.5 ? 'delete' : 'backspace', d, t, rd() < 0.5 ?
        S.caret({id: m.b.id, off: m.off}) : after(m));
    } else {
      deleteSelection(d, S.select({id: m.b.id, off: Math.max(0,
        m.off - 2)}, {id: m.b.id, off: m.off + 1}));
    }
    return d.undoDepth > had ? 'delete mark' : 'delete mark refused';
  }
  if (x < 0.5) {
    const ns = normalNotes(d.doc, kind);
    if (!ns.length) return 'none';
    const n = pick(rd, ns);
    const had = d.undoDepth;
    typeInNote(d, kind, n.id, rd() < 0.2 ? '\n' : ' w' + k);
    return d.undoDepth > had ? 'type in note' : 'type in note refused';
  }
  if (x < 0.6) {
    const scope = pick(rd, SCOPES);
    const sel = scope === 'this' && ms.length ? after(pick(rd, ms))
      : randSel(rd, d.doc);
    if (!sel) return 'none';
    const was = wrongStyle(d.doc);
    const res = convertNote(d, t, sel, scope);
    // (each moved mark takes its new kind's reference style: none
    // left in the other kind's, a neighbour's switch not taking it)
    assert.ok(wrongStyle(d.doc) <= was, scope + ': a mark in the ' +
      'other kind\'s reference style');
    return res.changed ? 'convert' : 'convert refused';
  }
  if (x < 0.7) {
    const sel = randSel(rd, d.doc);
    if (!sel) return 'none';
    const v = {scope: rd() < 0.5 ? 'section' : 'all'};
    for (const kk of [F, E]) {
      if (rd() < 0.4) continue;
      const o = {};
      if (rd() < 0.5) o.numFmt = pick(rd, FMTS);
      if (rd() < 0.3) o.numStart = 1 + Math.floor(rd() * 9);
      if (rd() < 0.4) o.numRestart = pick(rd, NP.RESTARTS[kk]).id;
      if (rd() < 0.3) o.pos = pick(rd, NP.POS[kk]).id;
      v[kk] = o;
    }
    const res = t.command(() => NP.run(d, sel, v));
    return res.changed ? 'options' : 'options refused';
  }
  if (x < 0.78) {
    if (!ms.length) return 'none';
    const m = pick(rd, ms);
    const res = customMark(d, t, m.x.note, m.x.id, pick(rd, TEXTS));
    return res.changed ? 'custom mark' : 'custom mark refused';
  }
  if (x < 0.9) {
    const sel = rd() < 0.6 && ms.length ? (() => {
      const m = pick(rd, ms);
      return S.select({id: m.b.id, off: 0}, {id: m.b.id,
        off: m.b.text.length});
    })() : randSel(rd, d.doc);
    if (!sel || S.collapsed(sel)) return 'none';
    const had = d.undoDepth;
    const cut = rd() < 0.5;
    const s = cut ? cutSelection(d, sel).slice : slice(d.doc, sel);
    if (!s) return 'none';
    const to = randSel(rd, d.doc);
    if (to) pasteBlocks(d, to, s.blocks, optsOf(s, true));
    return d.undoDepth > had ? (cut ? 'cut/paste' : 'copy/paste')
      : 'paste refused';
  }
  const sel = randSel(rd, d.doc);
  if (!sel) return 'none';
  t.type(sel, rd() < 0.2 ? '\n' : 'typed ');
  return 'type';
}

/** STEPS commands on d. */
export async function notesAll(d, seed, {every = false} = {}) {
  const was = await readZip(await write(d.doc));
  const rd = rng(seed);
  let now = 0;
  const t = new Typing(d, {now: () => (now += 2000)});
  const counts = {};
  const c0 = census(d.doc);
  const t0 = Date.now();
  let k = 0;
  for (; k < STEPS; k++) {
    if (Date.now() - t0 > BURST_MS) break;
    let kind = '?';
    const depth = d.undoDepth;
    try {
      kind = command(rd, d, t, k);
      if (kind.endsWith(' refused')) {
        assert.equal(d.undoDepth, depth, kind + ': no undo step');
      }
      if (every || k === STEPS - 1) {
        checkAll(d.doc);
        const c = census(d.doc);
        for (const kk of [F, E]) {
          assert.equal(c[kk].numbers, 0, kk + ': numbers recounted');
          assert.ok(c[kk].orphans <= c0[kk].orphans, kk +
            ': a note left with no mark ' + JSON.stringify(c[kk]));
          assert.ok(c[kk].missing <= c0[kk].missing, kk +
            ': a mark left with no note ' + JSON.stringify(c[kk]));
        }
      }
    } catch (e) {
      e.message = `seed ${seed} step ${k} (${kind}): ${e.message}`;
      throw e;
    }
    counts[kind] = (counts[kind] || 0) + 1;
  }
  checkAll(d.doc);
  const extra = await partSchema(d.doc, was);
  assert.deepEqual(extra.slice(0, 5), [], 'notes parts: schema ' +
    'errors added (seed ' + seed + ')');
  return {steps: k, capped: k < STEPS, counts};
}

export const KINDS = ['insert', 'delete mark', 'type in note',
  'convert', 'options', 'custom mark', 'cut/paste', 'copy/paste',
  'undo/redo'];

describe('notes round trip: the commands (generated documents)', () => {
  const total = {};
  for (const [name, make] of DOCS) {
    it(name + ': the story', async () => {
      const res = await roundTrip(await make(), name, hash(name),
        noteStory, {xsd, stories: true, notes: true});
      assert.ok(!res.refused);
      for (const [c, n] of Object.entries(res.counts))
        total[c] = (total[c] || 0) + n;
    });
    it(name + ': seeded bursts', async () => {
      const bytes = await make();
      for (let k = 0; k < 4; k++) {
        const res = await roundTrip(bytes, name, hash(name) + k,
          notesAll, {xsd: k === 0 ? xsd : null, every: true,
            stories: true, notes: true});
        for (const [c, n] of Object.entries(res.counts))
          total[c] = (total[c] || 0) + n;
      }
    });
  }
  it('every command ran and changed documents', () => {
    console.log('# note commands (generated): ' +
      JSON.stringify(total));
    for (const k of KINDS) assert.ok(total[k] > 0, k + ' ran');
    for (const k of ['insert footnote', 'insert endnote',
      'type in a footnote', 'delete a mark', 'custom mark',
      'convert this', 'convert allFootnotes', 'convert swap',
      'options (section)', 'options (document)',
      'paste a marked slice']) {
      assert.ok(total[k] > 0, k + ' changed a document');
    }
  });
  it('schema check available', {skip: xsdNote || false}, () => {});
});

// ------------------------------------------------------------ corpus

const files = corpusFiles();

/** The corpus files (of the sample) with a notes part. */
async function noteFiles() {
  const out = [];
  for (const f of files) {
    if (await hasNotesPart(readFileSync(f))) out.push(f);
  }
  return out;
}

describe('notes round trip: the corpus', {
  skip: files.length ? false : SKIP_CORPUS,
}, () => {
  it('open, lay out, paginate, save: the notes parts and every ' +
    'mark unchanged; the census', async () => {
    const list = await noteFiles();
    let n = 0, parts = 0, ms = 0, pages = 0;
    const skips = [], fails = [];
    const total = zeroCensus();
    const odd = [];
    for (const f of list) {
      const name = nameOf(f), bytes = readFileSync(f);
      try {
        const res = await pipeline(bytes, name);
        n++;
        parts += res.notes;
        ms += res.marks;
        pages += res.pages;
        const c = census(await readDocx(bytes));
        sumCensus(total, c);
        const bad = [F, E].filter((k) => c[k].missing ||
          c[k].orphans || c[k].twice || c[k].numbers || c[k].gaps);
        if (bad.length) odd.push(name + ' ' + JSON.stringify(c));
        for (const k of [F, E]) {
          if (c[k].numbers) fails.push(name + ': ' + k + ' numbers ' +
            'differ from the recount: ' + JSON.stringify(c[k]));
        }
      } catch (e) {
        if (e instanceof DocxError) skips.push(name + ': refused (' +
          e.code + ')');
        else fails.push(name + ': ' + String(e.message).split('\n')
          .slice(0, 3).join(' | ').slice(0, 300));
      }
    }
    console.log(`# notes pipeline${ALL ? '' : ' (sample)'}: ` +
      `${list.length} files with a notes part, ${n} compared ` +
      `(${parts} notes parts as read, ${ms} marks as read, ${pages} ` +
      `pages), ${skips.length} skipped, ${fails.length} failures`);
    for (const x of skips) console.log('# skipped ' + x);
    console.log('# census (marks, a mark whose note is missing, ' +
      'notes ' +
      'with no mark, notes marked twice, numbers differing, gaps): ' +
      JSON.stringify(total));
    for (const x of odd) console.log('# census ' + x);
    for (const x of fails) console.log('# FAIL ' + x);
    assert.deepEqual(fails, []);
    assert.ok(n >= Math.floor(list.length * 0.8), `only ${n} of ` +
      `${list.length} files were compared`);
    if (ALL) {
      assert.ok(n >= 150 && ms >= 150, `${n} files, ${ms} marks`);
    }
  });

  it('the story of note commands on every file with a notes part ' +
    'round-trips; undo restores', async () => {
    const list = await noteFiles();
    assert.ok(list.length > 0 || !ALL, 'files with notes');
    await corpusRun(list, noteStory, xsd, xsdNote,
      'note story (files with notes)', {stories: true, notes: true});
  });

  it(`${STEPS} note commands in ${ALL ? 'every' : 'one in ten'} ` +
    'corpus file round-trip; undo restores', () =>
    corpusRun(files, notesAll, xsd, xsdNote, 'notes-edited corpus',
      {stories: true, notes: true}));
});

// ------------------------------------------------------------ hostile

const fnX = (attrs, body) => `<w:footnote${attrs ? ' ' + attrs : ''}>` +
  `${body}</w:footnote>`;
const enX = (attrs, body) => `<w:endnote${attrs ? ' ' + attrs : ''}>` +
  `${body}</w:endnote>`;
const notesRoot = (root, inner) => DECL + `<w:${root} xmlns:w=` +
  `"${W_NS}" xmlns:r="${R_NS}">${inner}</w:${root}>`;
const EN_SEPS = SEPS.replace(/w:footnote/g, 'w:endnote');
const rawMark = (id) => '<w:r><w:footnoteReference w:id="' + id +
  '"/></w:r>';

/** A .docx from a body, the inside of w:footnotes (and w:endnotes)
 *  and more parts {name: xml} with their main relationships. */
function hostile(body, foot, {end, parts = {}, docRels = [],
  settings} = {}) {
  const all = {'word/document.xml': documentXml(body),
    'word/footnotes.xml': notesRoot('footnotes', foot), ...parts};
  const rels = [['rIdN1', REL('footnotes'), 'footnotes.xml'],
    ...docRels];
  if (end !== undefined) {
    all['word/endnotes.xml'] = notesRoot('endnotes', end);
    rels.push(['rIdN2', REL('endnotes'), 'endnotes.xml']);
  }
  if (settings !== undefined) {
    all['word/settings.xml'] = settingsXml(settings);
  }
  return buildDocx(all, {docRels: rels});
}

/**
 * Open bytes, lay out and paginate, put in a footnote and an
 * endnote, delete the first mark, convert all and swap, set a
 * custom mark and the options, save, read back and paginate again,
 * undo everything: nothing thrown, no package error added, the
 * opened bytes back. Returns the times (ms) and counts.
 */
async function abuse(bytes, what) {
  const t0 = performance.now();
  const doc = await readDocx(bytes);
  const out0 = await write(doc);
  const t1 = performance.now();
  paginate(doc);
  const t2 = performance.now();
  const d = new Document(doc);
  d.clearHistory();
  const t = new Typing(d, {now: () => 0});
  const ps = paras(d.doc);
  const done = [];
  if (ps.length) {
    if (insertAt(d, t, ps[0], F)) done.push('footnote');
    const end = ps[ps.length - 1];
    if (insertAt(d, t, end, E, false)) done.push('endnote');
  }
  const ms = bodyMarks(d.doc);
  if (ms.length) {
    deleteSelection(d, S.select({id: ms[0].b.id, off: ms[0].off},
      {id: ms[0].b.id, off: ms[0].off + 1}));
    done.push('delete');
  }
  for (const scope of ['allFootnotes', 'swap']) {
    if (convertNote(d, t, null, scope).changed) done.push(scope);
  }
  const m = bodyMarks(d.doc)[0];
  if (m && customMark(d, t, m.x.note, m.x.id, '#').changed) {
    done.push('custom');
  }
  const b = paras(d.doc)[0];
  if (b && NP.run(d, S.caret({id: b.id, off: 0}), {scope: 'section',
    footnote: {numFmt: 'upperRoman', numRestart: 'eachPage'}})
    .changed) done.push('options');
  checkAll(d.doc);
  // (the separators are never taken by an edit)
  for (const k of ['footnotes', 'endnotes']) {
    const was = doc.notes[k], now = d.doc.notes[k];
    for (const [id, n] of was instanceof Map ? was : []) {
      if (n.type === 'normal') continue;
      assert.equal(now.get(id), n, what + ': ' + k + ' ' + id +
        ' (' + n.type + ') kept');
    }
  }
  const t3 = performance.now();
  const out = await write(d.doc);
  const back = await readDocx(out);
  paginate(back);
  const t4 = performance.now();
  const had = new Set(errsOf(await readZip(bytes)));
  assert.deepEqual(errsOf(await readZip(out)).filter((e) =>
    !had.has(e)), [], what + ': package errors added');
  while (d.undo());
  assert.ok(Buffer.from(await write(d.doc)).equals(Buffer.from(out0)),
    what + ': undone, the opened bytes');
  return {read: t1 - t0, pages: t2 - t1, edit: t3 - t2,
    save: t4 - t3, done, state: ['footnotes', 'endnotes'].map((k) =>
      noteState(doc, k)).join('/')};
}

const PIC_RELS = DECL + '<Relationships xmlns="http://schemas.' +
  'openxmlformats.org/package/2006/relationships"><Relationship ' +
  'Id="rId5" Type="' + REL('image') + '" Target="media/image1.png"/>' +
  '<Relationship Id="rId6" Type="' + REL('hyperlink') + '" Target=' +
  '"http://example.com/" TargetMode="External"/></Relationships>';
const TXBX = (inner) => '<w:r><w:pict><v:shape xmlns:v="urn:schemas-' +
  'microsoft-com:vml" style="width:100pt;height:50pt"><v:textbox>' +
  `<w:txbxContent>${inner}</w:txbxContent></v:textbox></v:shape>` +
  '</w:pict></w:r>';

const HOSTILE = [
  ['duplicate ids', () => hostile(p(r('a') + mark(1) + r('b') +
    mark(1) + mark(2)), SEPS + fnX('w:id="1"', noteP('first')) +
    fnX('w:id="1"', noteP('second')) + fnX('w:id="2"', noteP('c')))],
  ['ids 0 and -1 used by normal notes', () => hostile(p(r('a') +
    mark(0) + rawMark(-1) + mark(1)), fnX('w:id="0"', noteP('zero')) +
    fnX('w:id="-1"', noteP('minus')) + fnX('w:id="1"', noteP('one')))],
  ['a mark naming a separator', () => hostile(p(r('a') + mark(0) +
    rawMark(-1) + mark(1)), SEPS + fnX('w:id="1"', noteP('one')),
  {settings: '<w:footnotePr><w:footnote w:id="-1"/><w:footnote ' +
    'w:id="0"/></w:footnotePr>'})],
  ['unknown note types', () => hostile(p(r('a') + mark(1) + mark(2) +
    mark(3)), SEPS + fnX('w:id="1" w:type="weird"', noteP('w')) +
    fnX('w:id="2" w:type=""', noteP('e')) +
    fnX('w:id="3" w:type="continuationNotice"', noteP('n')))],
  ['w:footnote without id, ids that are not integers', () => hostile(
    p(r('a') + rawMark('x') + rawMark('1.5') + mark(7) +
      rawMark('99999999999')), SEPS + fnX('', noteP('no id')) +
    fnX('w:id="x"', noteP('x')) + fnX('w:id="1.5"', noteP('f')) +
    fnX('w:id="__proto__"', noteP('p')) + fnX('w:id="99999999999"',
    noteP('big')) + fnX('w:id="7"', noteP('seven')))],
  ['a note with a table, a picture, a link and a nested mark',
    () => hostile(p(r('a') + mark(1) + mark(2) + mark(3) + mark(4)),
      SEPS + fnX('w:id="1"', noteP('table') + TBL(TR(p(r('c1')),
        p(r('c2')))) + p('')) +
      fnX('w:id="2"', p('<w:r><w:footnoteRef/></w:r>' +
        '<w:r>' + drawingXml({embed: 'rId5'}) + '</w:r>')) +
      fnX('w:id="3"', p('<w:r><w:footnoteRef/></w:r><w:hyperlink ' +
        'r:id="rId6">' + r('link') + '</w:hyperlink>')) +
      fnX('w:id="4"', noteP('nested') + p(mark(1) + rawMark(4))),
    {parts: {'word/_rels/footnotes.xml.rels': PIC_RELS,
      'word/media/image1.png': pngBytes(2, 2)}})],
  ['marks in a header, a text box and a tracked insertion',
    () => hostile(p(r('a') + mark(1) + TXBX(p(r('in box') +
      mark(2)))) + p('<w:ins w:id="90" w:author="x" w:date=' +
      '"2024-01-01T00:00:00Z">' + mark(3) + r('ins') + '</w:ins>') +
      '<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/>' +
      '<w:footerReference w:type="default" r:id="rIdF"/></w:sectPr>',
    SEPS + fnX('w:id="1"', noteP('one')) + fnX('w:id="2"',
      noteP('box')) + fnX('w:id="3"', noteP('ins')) +
      fnX('w:id="4"', noteP('head')),
    {end: EN_SEPS + enX('w:id="1"', enoteP('end')),
      parts: {'word/header1.xml': hdrXml(p(r('h') + mark(4) +
        '<w:r><w:endnoteReference w:id="1"/></w:r>')),
      'word/footer1.xml': ftrXml(p(r('f') + mark(4)))},
      docRels: [['rIdH', REL('header'), 'header1.xml'],
        ['rIdF', REL('footer'), 'footer1.xml']]})],
  ['an endnotes part only, no separators, settings naming none',
    () => hostile(p(r('a') + '<w:r><w:endnoteReference w:id="5"/>' +
      '</w:r>'), '', {end: enX('w:id="5"', enoteP('lone')),
      settings: '<w:endnotePr><w:numFmt w:val="bogus"/><w:numStart ' +
        'w:val="-4"/><w:pos w:val="nowhere"/></w:endnotePr>' +
        '<w:footnotePr><w:numRestart w:val="sometimes"/>' +
        '</w:footnotePr>'})],
];

/** A document of n paragraphs each with a footnote of `per`
 *  paragraphs. */
function many(n, per = 1) {
  let body = '', foot = SEPS;
  for (let k = 1; k <= n; k++) {
    body += p(r('para ' + k) + mark(k));
    let note = noteP('n' + k);
    for (let j = 1; j < per; j++) note += p(r('x'));
    foot += fnX(`w:id="${k}"`, note);
  }
  return hostile(body, foot);
}

/** Best of three runs of the async fn, in ms (each field). */
async function bestOf(fn) {
  let b = null;
  for (let k = 0; k < 3; k++) {
    const x = await fn();
    if (!b) b = x;
    else for (const f of ['read', 'pages', 'edit', 'save'])
      b[f] = Math.min(b[f], x[f]);
  }
  return b;
}
const totalMs = (x) => x.read + x.pages + x.edit + x.save;

describe('notes round trip: hostile files never throw or hang', () => {
  for (const [name, make] of HOSTILE) {
    it(name, async () => {
      const res = await abuse(await make(), name);
      console.log('# hostile ' + name + ' (' + res.state + '): ' +
        res.done.join(', '));
    });
  }

  it('10,000 notes: linear (load-robust ratio; ceilings only under ' +
    'WORD_PERF=1)', async () => {
    const small = await many(1000), big = await many(10000);
    const a = await bestOf(() => abuse(small, '1,000 notes'));
    const b = await bestOf(() => abuse(big, '10,000 notes'));
    const fmt = (x) => ['read', 'pages', 'edit', 'save'].map((f) =>
      f + ' ' + x[f].toFixed(0)).join(', ');
    console.log('# 1,000 notes: ' + fmt(a) + ' ms; 10,000: ' + fmt(b) +
      ' ms');
    if (process.env.WORD_PERF) {
      assert.ok(totalMs(b) < 20000, 'took ' + totalMs(b));
    } else {
      assert.ok(totalMs(b) < Math.max(totalMs(a), 10) * 30,
        'not linear: ' + (totalMs(b) / totalMs(a)).toFixed(1));
    }
  });

  it('a notes part of 50,000 paragraphs', async () => {
    const a = await bestOf(async () => abuse(await many(10, 500),
      '5,000 paragraphs'));
    const b = await bestOf(async () => abuse(await many(10, 5000),
      '50,000 paragraphs'));
    console.log('# notes of 5,000 paragraphs (' + a.state + '): ' +
      totalMs(a).toFixed(0) + ' ms; of 50,000 (' + b.state + '): ' +
      totalMs(b).toFixed(0) + ' ms');
    if (process.env.WORD_PERF) {
      assert.ok(totalMs(b) < 30000, 'took ' + totalMs(b));
    } else {
      assert.ok(totalMs(b) < Math.max(totalMs(a), 10) * 30,
        'not linear: ' + (totalMs(b) / totalMs(a)).toFixed(1));
    }
  });
});

// ------------------------------------------------------------ layout

const EPS = 1e-6;
/** n paragraphs 'para i' (one line each); fm {i: id} footnote marks,
 *  em {i: id} endnote marks; sects {i: sectPr inner} a section ends
 *  with paragraph i. */
function bodyOf(n, fm = {}, em = {}, sects = {}) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const pPr = sects[i] !== undefined ? '<w:sectPr>' + sects[i] +
      '</w:sectPr>' : '';
    out += p(r('para ' + i) + (fm[i] !== undefined ? mark(fm[i]) : '') +
      (em[i] !== undefined ? emark(em[i]) : ''), pPr);
  }
  return out;
}
/** The galley items from k0 whose bottom is within h of y0: how many
 *  fit in a frame of h px (the hand rule for one-line paragraphs). */
function fit(items, k0, y0, h) {
  let k = k0;
  while (k < items.length && items[k].y + items[k].h - y0 <=
    h + EPS) k++;
  return k - k0;
}
/** The note pieces of a page: [id, from, to]. */
const pieces = (pg) => (pg.notes ? pg.notes.pieces.map((x) =>
  [x.id, x.from, x.to]) : []);

describe('notes round trip: layout oracle (pages worked out by hand ' +
  'from the measured heights)', () => {
  it('the hand rule gives the pages of a document without notes',
    async () => {
      const {L, P} = paginate(await noteDoc(bodyOf(130), {}));
      const F = P.at(0).frameH;
      let k = 0;
      for (const pg of P.list) {
        assert.equal(pg.start.k, k);
        k += fit(L.items, k, L.items[k].y, F);
        assert.equal(Math.min(pg.end.k, 130), Math.min(k, 130));
      }
    });

  it('one note: the body is shorter by the separator and the note',
    async () => {
      const {L, G, P} = paginate(await noteDoc(bodyOf(130, {3: 1}),
        {1: noteP('one')}));
      const pg = P.at(0), F = pg.frameH;
      const sep = G.notes.sep('separator', 0).h;
      const lay = G.notes.note(1, 0);
      const foot = sep + lay.h;
      assert.equal(pg.end.k, fit(L.items, 0, pg.y0, F - foot));
      assert.ok(Math.abs(pg.notes.h - foot) < EPS);
      assert.ok(Math.abs(pg.notes.y - (F - foot)) < EPS);
      assert.deepEqual(pieces(pg), [[1, 0, lay.lines.length]]);
      assert.equal(P.at(1).notes, undefined);
    });

  it('many notes: each mark\'s note on its page, the body shorter ' +
    'by all of them', async () => {
      const fm = {}, notes = {};
      for (let i = 0; i < 60; i += 3) {
        fm[i] = i + 1;
        notes[i + 1] = noteP('note ' + i);
      }
      const {L, G, P} = paginate(await noteDoc(bodyOf(130, fm), notes));
      const sep = G.notes.sep('separator', 0).h;
      let k = 0;
      for (const pg of P.list.slice(0, 3)) {
        const F = pg.frameH, y0 = L.items[k].y;
        // the most items whose own notes fit with them
        let n = 0;
        for (let m = 1; k + m <= L.items.length; m++) {
          const ids = Object.keys(fm).map(Number).filter((i) =>
            i >= k && i < k + m).map((i) => fm[i]);
          const room = ids.length ? sep + ids.reduce((s, id) => s +
            G.notes.note(id, 0).h, 0) : 0;
          if (L.items[k + m - 1].y + L.items[k + m - 1].h - y0 >
            F - room + EPS) break;
          n = m;
        }
        assert.equal(pg.start.k, k);
        assert.equal(pg.end.k, k + n, 'page ending at ' + (k + n));
        const want = Object.keys(fm).map(Number).filter((i) => i >= k &&
          i < k + n).map((i) => [fm[i], 0, 1]);
        assert.deepEqual(pieces(pg), want);
        k += n;
      }
    });

  it('a note longer than a page: cut where the foot ends, the notice ' +
    'on the cut page, the rest under the continuation separator',
    async () => {
      const doc = await noteDoc(bodyOf(130, {0: 1}),
        {1: noteP(words(3000))}, {notice: p(r('(continued)'))});
      const {G, P} = paginate(doc);
      const lay = G.notes.note(1, 0);
      const a = P.at(0), b = P.at(1), F = a.frameH;
      const sep = G.notes.sep('separator', 0).h;
      const cont = G.notes.sep('continuationSeparator', 0).h;
      const notice = G.notes.sep('continuationNotice', 0).h;
      assert.ok(lay.h > 2 * F, 'longer than two pages');
      assert.ok(notice > 0, 'a notice with text');
      // the mark's line alone on its page, the note to the foot
      assert.equal(a.end.k, 1);
      const item0 = P.G.items[0];
      const room = F - (item0.y + item0.h - a.y0) - sep - notice;
      let x = 0;
      while (x < lay.lines.length && lay.lines[x] <= room + EPS) x++;
      assert.deepEqual(pieces(a), [[1, 0, x]]);
      assert.ok(Math.abs(a.notes.notice - notice) < EPS);
      assert.equal(a.notes.sep, 'separator');
      // the next page: the continuation separator, then on
      assert.equal(b.notes.sep, 'continuationSeparator');
      assert.equal(b.notes.pieces[0].from, x);
      assert.ok(Math.abs(b.notes.sepH - cont) < EPS);
      // (found here: a frame worked out as F - cap came out a hair
      // short of the first line by rounding, which cut that line at
      // its very foot; the page after then started in it, its first
      // line of no height, and the body got no room at all on the
      // pages the note went on over)
      for (const pg of P.list) {
        assert.ok(!pg.end.dy && !pg.start.dy, 'no line cut');
        if (pg.start.k < 130) {
          assert.ok(pg.end.k > pg.start.k, 'the body keeps its ' +
            'first line on page ' + P.list.indexOf(pg));
        }
      }
      // every line once, in order, over the pages
      const all = P.list.flatMap(pieces);
      for (let i = 1; i < all.length; i++)
        assert.equal(all[i][1], all[i - 1][2]);
      assert.equal(all[all.length - 1][2], lay.lines.length);
    });

  it('a mark on the last line of a page: the line goes with its note ' +
    'to the next page, or the note is cut there (by the room left)',
    async () => {
      const plainP = paginate(await noteDoc(bodyOf(130), {})).P;
      const last = plainP.at(0).end.k - 1;
      for (const lines of [1, 6]) {
        const doc = await noteDoc(bodyOf(130, {[last]: 1}),
          {1: noteP(words(lines === 1 ? 2 : 60))});
        const {G, P} = paginate(doc);
        const pg = P.at(0), F = pg.frameH;
        const lay = G.notes.note(1, 0);
        const sep = G.notes.sep('separator', 0).h;
        const it = P.G.items[last];
        const below = F - (it.y + it.h - pg.y0);
        const lineFits = below + EPS >= sep + lay.lines[0];
        if (lay.h + sep <= below + EPS) {
          assert.equal(pg.end.k, last + 1, 'all fits');
          assert.deepEqual(pieces(pg), [[1, 0, lay.lines.length]]);
        } else if (lineFits && lay.lines.length > 1) {
          // Word cuts the note at the foot: its first lines here
          assert.equal(pg.end.k, last + 1, 'kept, cut');
          assert.ok(pg.notes.left.length === 1);
        } else {
          assert.equal(pg.end.k, last, 'pushed with its note');
          assert.deepEqual(pieces(pg), []);
          assert.equal(P.at(1).start.k, last);
          assert.deepEqual(pieces(P.at(1))[0].slice(0, 2), [1, 0]);
        }
      }
    });

  it('two columns: the notes below both, across the text width; ' +
    'each column shorter by them', async () => {
      const cols = '<w:sectPr><w:cols w:num="2" w:space="720"/>' +
        '</w:sectPr>';
      const plainP = paginate(await noteDoc(bodyOf(150) + cols, {})).P;
      const doc = await noteDoc(bodyOf(150, {5: 1}) + cols,
        {1: noteP(words(40))});
      const {L, G, P} = paginate(doc);
      const pg = P.at(0), F = pg.frameH, lay = G.notes.note(1, 0);
      const foot = G.notes.sep('separator', 0).h + lay.h;
      assert.equal(lay.L.items[0].w, L.geom(0).textW);
      assert.ok(Math.abs(pg.notes.bodyH - (F - foot)) < EPS);
      assert.ok(pg.cols.every((c) => Math.abs(c.h - (F - foot)) < EPS));
      // each column holds what fits its shorter frame
      const per = fit(L.items, 0, pg.y0, F - foot);
      assert.equal(pg.end.k, 2 * per);
      assert.equal(plainP.at(0).end.k, 2 * fit(L.items, 0, pg.y0, F));
    });

  it('Below text: the notes right under the last line of the page',
    async () => {
      const doc = await noteDoc(bodyOf(5, {1: 1}), {1: noteP('n')},
        {settings: '<w:footnotePr><w:pos w:val="beneathText"/>' +
          '</w:footnotePr>'});
      const {G, P} = paginate(doc);
      const pg = P.at(0), it = P.G.items[4];
      assert.ok(Math.abs(pg.notes.y - (it.y + it.h - pg.y0)) < EPS,
        `${pg.notes.y}`);
      assert.ok(Math.abs(pg.notes.h - (G.notes.sep('separator', 0).h +
        G.notes.note(1, 0).h)) < EPS);
    });

  /** The run's items of galley G: [k, it.en]. */
  const runOf = (G) => G.items.map((it, k) => [k, it.en])
    .filter(([, x]) => x);

  it('endnotes at the end of the document: after the last line, ' +
    'under the endnote separator, stacked', async () => {
      const doc = await noteDoc(bodyOf(10, {}, {2: 1, 7: 2}), {},
        {endnotes: {1: enoteP('first'), 2: enoteP('second')}});
      const {G, P} = paginate(doc);
      const run = runOf(G);
      assert.deepEqual(run.map(([k, x]) => x.sep ? 'sep' : x.first ?
        x.id : '+'), ['sep', 1, 2]);
      assert.equal(run[0][0], 10, 'after the last body item');
      let y = G.items[9].y + G.items[9].h;
      for (const [k] of run) {
        assert.ok(Math.abs(G.items[k].y - y) < EPS, 'item ' + k);
        y = G.items[k].y + G.items[k].h;
      }
      // all on one page: it fits
      assert.ok(y - P.at(0).y0 <= P.at(0).frameH);
      assert.equal(P.count, 1);
      assert.equal(P.at(0).notes, undefined, 'no foot');
    });

  it('endnotes at the end of each section; footnotes placed at ' +
    'the section end flow there too', async () => {
      const SE = '<w:endnotePr><w:pos w:val="sectEnd"/></w:endnotePr>' +
        '<w:footnotePr><w:pos w:val="sectEnd"/></w:footnotePr>';
      const doc = await noteDoc(bodyOf(10, {1: 1, 6: 2}, {2: 1, 7: 2},
        {4: '<w:type w:val="nextPage"/>'}), {1: noteP('f one'),
        2: noteP('f two')}, {endnotes: {1: enoteP('e one'),
        2: enoteP('e two')}, settings: SE});
      const {G, P} = paginate(doc);
      const run = runOf(G).map(([k, x]) => [k, x.sep ? 'sep:' + x.kind
        : x.first ? x.kind + ':' + x.id : '+']);
      assert.deepEqual(run.map((x) => x[1]), ['sep:footnote',
        'footnote:1', 'sep:endnote', 'endnote:1', 'sep:footnote',
        'footnote:2', 'sep:endnote', 'endnote:2']);
      // the first run right after section 0's last paragraph (4)
      assert.equal(run[0][0], 5);
      assert.equal(G.items[run[3][0] + 1].s, 1, 'then section 1');
      assert.equal(P.count, 2, 'one page a section');
      assert.ok(P.list.every((pg) => !pg.notes || !pg.notes.pieces
        .length), 'nothing at the foot');
    });

  it('a table over several pages: each row\'s note on that row\'s ' +
    'page, every note once', async () => {
      const marked = {10: 1, 45: 2, 46: 3, 90: 4};
      let rows = '';
      for (let i = 0; i < 120; i++) {
        rows += TR(p(r('r' + i) + (marked[i] ? mark(marked[i]) : '')),
          p(r('x')));
      }
      const notes = {1: noteP('a'), 2: noteP('b'), 3: noteP(words(30)),
        4: noteP('d')};
      const {P} = paginate(await noteDoc(TBL(rows) + p(r('end')),
        notes));
      assert.ok(P.count >= 3);
      const pageOfRow = (row) => P.list.findIndex((pg) =>
        pg.start.k === 0 && pg.start.line <= row &&
        (pg.end.k > 0 || pg.end.line > row));
      const seen = [];
      for (const [row, id] of Object.entries(marked)) {
        const i = pageOfRow(Number(row));
        assert.ok(i >= 0, 'row ' + row);
        assert.ok(pieces(P.at(i)).some((x) => x[0] === id), 'note ' +
          id + ' on page ' + i);
        seen.push(id);
      }
      const all = P.list.flatMap(pieces).map((x) => x[0]);
      assert.deepEqual([...new Set(all)].sort(), seen.sort());
      assert.equal(all.length, new Set(all).size, 'each once');
      // the body above the foot on every page
      for (const pg of P.list) {
        if (pg.notes) {
          assert.ok(Math.abs(pg.notes.y + pg.notes.h - pg.frameH) <
            EPS);
        }
      }
    });

  it('a different first page header: the foot at each page\'s own ' +
    'frame foot', async () => {
      const tall = p(r('Head')) + p(r('second line')) +
        p(r('third line')) + p(r('fourth'));
      const body = bodyOf(130, {2: 1, 60: 2}) + '<w:sectPr>' +
        '<w:headerReference w:type="first" r:id="rIdH1"/>' +
        '<w:headerReference w:type="default" r:id="rIdH2"/>' +
        '<w:titlePg/></w:sectPr>';
      const bytes = await buildDocx({
        'word/document.xml': documentXml(body),
        'word/footnotes.xml': notesRoot('footnotes', SEPS +
          fnX('w:id="1"', noteP('first page')) +
          fnX('w:id="2"', noteP('later'))),
        'word/header1.xml': hdrXml(tall),
        'word/header2.xml': hdrXml(p(r('h')))},
      {docRels: [['rIdN1', REL('footnotes'), 'footnotes.xml'],
        ['rIdH1', REL('header'), 'header1.xml'],
        ['rIdH2', REL('header'), 'header2.xml']]});
      const {L, G, P} = paginate(await readDocx(bytes));
      const a = P.at(0);
      const j = P.list.findIndex((pg) => pieces(pg).some((x) =>
        x[0] === 2));
      const b = P.at(j);
      assert.ok(j > 0);
      console.log('# first page frame ' + a.frameH + ', later ' +
        b.frameH);
      assert.ok(a.frameH < b.frameH, 'the tall first header takes ' +
        'room');
      for (const pg of [a, b]) {
        assert.ok(Math.abs(pg.notes.y + pg.notes.h - pg.frameH) < EPS);
        const id = pieces(pg)[0][0];
        const foot = G.notes.sep('separator', 0).h +
          G.notes.note(id, 0).h;
        assert.equal(pg.end.k - pg.start.k, fit(L.items, pg.start.k,
          L.items[pg.start.k].y, pg.frameH - foot));
      }
    });
});

describe('notes round trip: the corpus pages with notes', {
  skip: files.length ? false : SKIP_CORPUS,
}, () => {
  it('page starts against Word\'s: no worse with the notes on the ' +
    'pages (printed before / after)', async () => {
    let withNotes = 0, scored = 0, skipped = 0;
    const was = [0, 0], now = [0, 0], pages = [0, 0];
    const changed = [], unseen = [];
    for (const f of await noteFiles()) {
      let doc;
      try {
        doc = await readDocx(readFileSync(f));
      } catch (e) {
        if (!(e instanceof DocxError)) throw e;
        skipped++;
        continue;
      }
      const L = new DocLayout(doc, tm());
      L.layout(1000);
      const G = printGalley(L);
      if (!G.notes && !G.runs) continue;
      withNotes++;
      const old = galleyOf(L, hfHooks(L));
      const P0 = new Pages(old).finish(), P = new Pages(G).finish();
      pages[0] += P0.count;
      pages[1] += P.count;
      // (a page that passes notes on shows a line of them, unless it
      // is a blank page: none is carried on unseen)
      for (const pg of P.list) {
        if (pg.blank || !pg.notes || !pg.notes.left.length) continue;
        if (!pg.notes.pieces.length) unseen.push(nameOf(f) + ' page ' +
          P.list.indexOf(pg));
      }
      const ws = madeByWord(f) ? wordStarts(doc) : [];
      if (!ws.length) continue;
      scored++;
      const base = lineBase(L.items);
      const a = scoreStarts(ourStarts(P0, L.items, base),
        placesOf(old, base, ws));
      const b = scoreStarts(ourStarts(P, G.items, lineBase(G.items)),
        placesOf(G, lineBase(G.items), ws));
      was[0] += a.matched;
      was[1] += a.total;
      now[0] += b.matched;
      now[1] += b.total;
      if (a.matched !== b.matched) changed.push(`${nameOf(f)} ` +
        `${a.matched} -> ${b.matched} of ${b.total}`);
    }
    console.log(`# notes on the pages${ALL ? '' : ' (sample)'}: ` +
      `${withNotes} files with notes laid out, ${skipped} refused; ` +
      `pages ${pages[0]} without the notes, ${pages[1]} with; ` +
      `${scored} with Word's page starts: before ${was[0]} of ` +
      `${was[1]} matched, after ${now[0]} of ${now[1]}`);
    for (const x of changed) console.log('# changed ' + x);
    assert.deepEqual(unseen, [], 'notes passed on and not shown');
    assert.ok(now[0] >= was[0], `${now[0]} < ${was[0]}`);
    if (ALL) assert.ok(withNotes >= 30, String(withNotes));
    else assert.ok(withNotes >= 1, 'sample too small: no file with ' +
      'notes laid out');
  });
});
