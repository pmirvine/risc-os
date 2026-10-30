// Tables of contents, captions and cross-references round trip
// (Batch E3): the field commands and Update all fields proved on
// generated documents and on every corpus file holding a TOC, REF,
// PAGEREF, SEQ, STYLEREF or NOTEREF field (git-ignored, optional).
//
//   - the pipeline: a file opened, laid out and paginated in Print
//     layout (the Doc deep-frozen first: drawing a field's value
//     never changes the model), then saved without an update, writes
//     every part as a save without the layout does, and every
//     field's code and stored result, and every field element
//     (w:fldChar, w:instrText, w:fldSimple) of each part, as read;
//   - Update all fields (./FieldPasses run, as Edit > Update all
//     fields: the window's ctx, pages laid out again) through
//     roundtrip-lib's roundTrip: the model read back equals the
//     updated one, the package linter and xmllint/wml.xsd add no
//     error, undo gives back the opened model and its bytes; the
//     field codes are never changed by an update; a second update
//     changes nothing (generated documents; the corpus files where
//     it does are counted);
//   - the consolidated ORACLE: every corpus field of these kinds
//     worked out as Update does (./Fields evaluate on the document
//     and its pages; tables of contents through ./TocBuild entries)
//     against what Word stored: per kind fields, evaluated, matched,
//     mismatched (reasons), not evaluated, skipped. The exact kinds
//     (SEQ, REF, STYLEREF, TOC entry text) pinned exact, the page
//     ones (PAGEREF, TOC page numbers) as floors: the values of the
//     first measured run (WORD_EDIT_CORPUS=1, 2026-10-30);
//   - seeded 40-command bursts (insert a table of contents, a table
//     of figures, a caption, a cross-reference; edit a heading;
//     delete a bookmark, hidden ones too; update a field, update a
//     table's page numbers, update all fields; remove a table; type;
//     undo and redo) over the generated documents and the corpus
//     sample: ModelCheck at every step, linter and xsd at the end,
//     undo of everything gives the opened bytes;
//   - hostile files (the spec's list) never throw or hang; 10,000
//     headings and 10,000 fields linear (load-robust ratios; absolute
//     ceilings only under WORD_PERF=1); the pages-corpus pin is
//     unchanged.
//
// The corpus is gated as the other round trips: one file in ten by a
// hash of its name, every file with WORD_EDIT_CORPUS=1 (which needs
// NODE_OPTIONS=--max-old-space-size=2048).
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readDocx, DocxError}
  from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {settle} from '../../tools/moreapps/!Letters/ViewPass';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {scan as fieldScan}
  from '../../tools/moreapps/!Letters/FieldScan';
import {run as passes} from '../../tools/moreapps/!Letters/FieldPasses';
import {updateCmd} from '../../tools/moreapps/!Letters/FieldCmd';
import {evaluate} from '../../tools/moreapps/!Letters/Fields';
import {insertToc, updateToc, removeToc}
  from '../../tools/moreapps/!Letters/TocCmd';
import {tocFields, entriesOf}
  from '../../tools/moreapps/!Letters/TocUpdate';
import {parse as tocParse, canRebuild}
  from '../../tools/moreapps/!Letters/TocSwitches';
import {entries as tocEntries}
  from '../../tools/moreapps/!Letters/TocBuild';
import {insertCaption} from '../../tools/moreapps/!Letters/CaptionCmd';
import {insertXref} from '../../tools/moreapps/!Letters/XrefCmd';
import {list as targets, typesOf, whatsOf}
  from '../../tools/moreapps/!Letters/XrefTargets';
import {list as bookmarkList, deleteBookmark}
  from '../../tools/moreapps/!Letters/Bookmarks';
import {of as headings}
  from '../../tools/moreapps/!Letters/HeadingOutline';
import {findBlock} from '../../tools/moreapps/!Letters/EditPos';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {deleteSelection} from '../../tools/moreapps/!Letters/EditDel';
import {checkBlock, checkNotes}
  from '../../tools/moreapps/!Letters/ModelCheck';
import {scan} from '../../tools/moreapps/!Letters/Walk';
import {OBJ} from '../../tools/moreapps/!Letters/Model';
import {cmpPath} from '../../tools/moreapps/!Letters/Path';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {buildDocx, documentXml, stylesXml, numberingXml, p, r, REL,
  W_NS, R_NS} from './build-docx.mjs';
import {fld} from './field-fixtures.mjs';
import {SEPS, mark, noteP} from './note-fixtures.mjs';
import {tbl, tr, tc} from './tbl-fixtures.mjs';
import {freeze, hdrXml} from './story-fixtures.mjs';
import {lintPackage} from './lint-package.mjs';
import {roundTrip, schema, hash, corpusFiles, corpusRun, nameOf, ALL,
  SKIP_CORPUS, write} from './roundtrip-lib.mjs';
import {fieldOracle, oracleFiles, resultsOf, same}
  from './field-oracle.mjs';
import {pagesOf as refPages} from './field-ref-pages.mjs';
import {rng, tm, loadStyles} from './word-docs.mjs';

before(loadStyles);
export const STEPS = 40;
const BURST_MS = 4000;
const NOW = new Date(2026, 9, 30, 9, 0);
const KIND = /^\s*(TOC|REF|PAGEREF|SEQ|STYLEREF|NOTEREF)(?=[\s\\"]|$)/i;
const pick = (rd, a) => a[Math.floor(rd() * a.length)];
const dec = new TextDecoder();
const {xsd, note: xsdNote} = schema();

// ------------------------------------------------------------ helpers

/** The body's paragraphs, tables included, in order. */
function paras(doc) {
  const out = [];
  scan(doc, (b) => { if (b.type === 'p') out.push(b); });
  return out;
}

/** ModelCheck over the body, the stories and every note. */
function checkAll(doc) {
  scan(doc, (b) => checkBlock(b));
  for (const st of doc.stories instanceof Map ? doc.stories.values()
    : []) {
    for (const b of st.blocks || []) checkBlock(b);
  }
  checkNotes(doc.notes);
  for (const k of ['footnotes', 'endnotes']) {
    const m = doc.notes && doc.notes[k];
    for (const n of m instanceof Map ? m.values() : []) {
      for (const b of n.blocks) checkBlock(b);
    }
  }
}

/** doc laid out and paginated as Print layout does: {L, P}. */
function paginate(doc) {
  const L = new DocLayout(doc, tm(), null, {fields: {now: NOW}});
  L.layout(800);
  return {L, P: new Pages(printGalley(L)).finish()};
}

/** The window's ctx for a command on d (./FieldUpdate updateCtx in
 *  Print layout): the pages of d.doc made when first asked for, and
 *  relayout(doc) the document laid out again and settled. */
function ctxOf(d) {
  let base = null, last = null;
  const first = () => base || (base = paginate(d.doc));
  return {now: NOW, pages: {finish: () => first().P},
    relayout(doc) {
      last = settle(doc, last || first());
      return last.P;
    }};
}

/** The parts of doc (null: the body, then each story). */
const partsOf = (doc) => [null, ...(doc.stories instanceof Map
  ? doc.stories.keys() : [])];

/** Every field of the kinds (body and stories): [part, instr,
 *  stored]. */
function kindFields(doc) {
  const out = [];
  for (const part of partsOf(doc)) {
    for (const x of resultsOf(doc, part)) {
      if (KIND.test(x.instr)) out.push([part, x.instr, x.stored]);
    }
  }
  return out;
}

/** The kind (upper case) of an instruction, or null. */
const kindOf = (instr) => {
  const m = KIND.exec(instr);
  return m ? m[1].toUpperCase() : null;
};

/** Every field element of an XML part as text, in order. */
function fieldEls(bytes) {
  if (!bytes) return [];
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    const name = String(n.name || '');
    if (/(^|:)(fldChar|fldSimple)$/.test(name)) {
      out.push(JSON.stringify([name, n.attrs]));
    } else if (/(^|:)instrText$/.test(name)) {
      out.push(JSON.stringify([name, (n.children || []).map((c) =>
        typeof c === 'string' ? c : c.text || '').join('')]));
    }
    for (const c of n.children || []) walk(c);
  };
  walk(parseXml(dec.decode(bytes).replace(/^\uFEFF/, '')).root);
  return out;
}

/** The package lint's errors. */
const errsOf = (z) => lintPackage(z).problems
  .filter((q) => q.level === 'error')
  .map((q) => q.rule + ' ' + q.part + ' ' + q.detail);

/** Update all fields on d as one command: FieldPasses' result. */
function updateAll(d, t) {
  const ctx = ctxOf(d);
  return t.command(() => passes(d, ctx, null));
}

// ----------------------------------------------------------- documents

const sty = (id, name, inner = '', based = '', def = '') =>
  `<w:style w:type="paragraph"${def} w:styleId="${id}"><w:name ` +
  `w:val="${name}"/>` + (based ? `<w:basedOn w:val="${based}"/>`
    : '') + `<w:pPr>${inner}</w:pPr></w:style>`;
const OL = (n) => `<w:outlineLvl w:val="${n}"/>`;
const STYLES = stylesXml(sty('Normal', 'Normal', '', '',
  ' w:default="1"') + sty('Heading1', 'heading 1', OL(0), 'Normal') +
  sty('Heading2', 'heading 2', OL(1), 'Normal') +
  sty('Heading3', 'heading 3', OL(2), 'Normal') +
  sty('Caption', 'caption', '', 'Normal'));
const lvl = (n, text) => `<w:lvl w:ilvl="${n}"><w:start w:val="1"/>` +
  `<w:numFmt w:val="decimal"/><w:lvlText w:val="${text}"/></w:lvl>`;
const NUMBERING = numberingXml('<w:abstractNum w:abstractNumId="0">' +
  lvl(0, '%1.') + lvl(1, '%1.%2') + '</w:abstractNum>' +
  '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>');
const NUM = (l) => `<w:numPr><w:ilvl w:val="${l}"/><w:numId ` +
  'w:val="1"/></w:numPr>';
const H = (n, t, extra = '') => p(r(t),
  `<w:pStyle w:val="Heading${n}"/>${extra}`);
const CAP = (inner) => p(inner, '<w:pStyle w:val="Caption"/>');
const BS = (id, name) => `<w:bookmarkStart w:id="${id}" ` +
  `w:name="${name}"/>`;
const BE = (id) => `<w:bookmarkEnd w:id="${id}"/>`;
const BR = '<w:r><w:br w:type="page"/></w:r>';
const DECL = '<?xml version="1.0" encoding="UTF-8" ' +
  'standalone="yes"?>\n';
const FOOT = (notes) => DECL + `<w:footnotes xmlns:w="${W_NS}" ` +
  `xmlns:r="${R_NS}">${SEPS}` + Object.entries(notes).map(([id, x]) =>
  `<w:footnote w:id="${id}">${x}</w:footnote>`).join('') +
  '</w:footnotes>';

/** A .docx of body with the styles, the numbering and footnotes. */
function docx(body, {notes = {}, parts = {}, docRels = []} = {}) {
  return buildDocx({'word/document.xml': documentXml(body),
    'word/styles.xml': STYLES, 'word/numbering.xml': NUMBERING,
    'word/footnotes.xml': FOOT(notes), ...parts},
  {docRels: [['rIdN1', REL('footnotes'), 'footnotes.xml'],
    ...docRels]});
}

/** A stale table, numbered headings, captions, every reference. */
const everything = () => docx(
  p(fld(' TOC \\o "1-3" \\h \\z \\u ', 'old table')) +
  H(1, 'Introduction', NUM(0)) +
  p(r('Body text with a note') + BS(10, '_Ref900000001') + mark(1) +
    BE(10) + r('.')) +
  CAP(BS(11, '_Ref900000002') + r('Figure ') +
    fld(' SEQ Figure \\* ARABIC ', '9') + BE(11) + r(': A cat')) +
  p(r('See ') + fld(' REF _Ref900000002 \\h ', 'Figure 9') +
    r(' on page ') + fld(' PAGEREF _Ref900000002 \\h ', '7') +
    r(' and note ') + fld(' NOTEREF _Ref900000001 \\h ', '5')) +
  H(2, 'Methods', NUM(1)) +
  p(r('In ') + fld(' STYLEREF 1 \\s ', '0') + r(' under ') +
    fld(' STYLEREF "Heading 1" ', 'old')) +
  p(r('x') + BR) +
  H(1, 'Results', NUM(0)) +
  tbl([tr([tc(p(r('cell one'))), tc(p(r('cell two')))])]) +
  CAP(r('Table ') + fld(' SEQ Table \\* ARABIC ', '4') + r(' Sums')) +
  p(r('end')), {notes: {1: noteP('the note')}});

/** Headings and body text, no fields at all. */
const headingsOnly = () => docx(p('') + H(1, 'Alpha') +
  p(r('Some text about alpha.')) + H(2, 'Beta') + p(r('Beta text.')) +
  H(3, 'Gamma') + p(r('x') + BR) + H(1, 'Delta') +
  p(r('A last paragraph.')));

/** A table of figures and captions numbered by chapter. */
const figures = () => docx(
  p(fld(' TOC \\h \\z \\c "Figure" ', 'old figures')) +
  H(1, 'One', NUM(0)) +
  CAP(r('Figure ') + fld(' STYLEREF 1 \\s ', '1') + r('-') +
    fld(' SEQ Figure \\* ARABIC \\s 1 ', '1') + r(' first')) +
  CAP(r('Figure ') + fld(' STYLEREF 1 \\s ', '1') + r('-') +
    fld(' SEQ Figure \\* ARABIC \\s 1 ', '5') + r(' second')) +
  H(1, 'Two', NUM(0)) +
  CAP(r('Figure ') + fld(' STYLEREF 1 \\s ', '1') + r('-') +
    fld(' SEQ Figure \\* ARABIC \\s 1 ', '3') + r(' third')) +
  p(r('end')));

/** A table of contents inside a table's cell. */
const inCell = () => docx(
  tbl([tr([tc(p(fld(' TOC \\o "1-2" ', 'old in cell'))),
    tc(p(r('beside')))])]) +
  H(1, 'First') + H(2, 'Second') + p(r('end')));

/** Every generated document: [name, () => Promise<bytes>]. */
export const DOCS = [
  ['a stale table, captions and every reference', everything],
  ['headings, no fields', headingsOnly],
  ['a table of figures, chapter numbers', figures],
  ['a table of contents in a table cell', inCell],
];

// ------------------------------------------------------------ pipeline

/**
 * Open bytes, freeze the Doc, lay it out and paginate it, save it:
 * every part as the save of a fresh read; every field (code and
 * stored result) and every field element of each part as read.
 * Returns {fields, els}.
 */
async function pipeline(bytes, what) {
  const doc = await readDocx(bytes);
  const want = await readZip(await write(await readDocx(bytes)));
  const fs0 = kindFields(doc);
  freeze(doc);
  const {P} = paginate(doc);
  assert.ok(P.done && P.count >= 1, what + ': paginated');
  const out = await write(doc);
  const z = await readZip(out);
  assert.deepEqual([...z.keys()].sort(), [...want.keys()].sort(),
    what + ': the same parts');
  for (const [n, b] of want) {
    assert.ok(Buffer.from(z.get(n)).equals(Buffer.from(b)), what +
      ': ' + n + ' as without the layout');
  }
  const back = await readDocx(out);
  assert.deepEqual(kindFields(back), fs0, what + ': fields as read');
  const zin = await readZip(bytes);
  let els = 0;
  for (const n of zin.keys()) {
    if (!/\.xml$/.test(n) || !z.get(n)) continue;
    const a = fieldEls(zin.get(n));
    if (!a.length) continue;
    assert.deepEqual(fieldEls(z.get(n)), a, what + ': fields of ' + n);
    els += a.length;
  }
  return {fields: fs0.length, els};
}

describe('fields round trip: the pipeline (open, lay out, ' +
  'paginate, save, no update)', () => {
  for (const [name, make] of DOCS) {
    it(name, async () => {
      const res = await pipeline(await make(), name);
      assert.ok(res.fields > 0 || name === 'headings, no fields');
    });
  }
});

// -------------------------------------------------------- update all

/** The codes of doc's fields of the kinds, the TOC entries' own
 *  PAGEREFs left out (an update makes them). */
const codesOf = (doc) => kindFields(doc).filter(([, i]) =>
  !/^\s*PAGEREF\s+_Toc/i.test(i)).map(([part, i]) => part + ' ' +
  i.trim());

/** Update all fields once, then again: the change of roundTrip. */
async function updateStory(d) {
  const t = new Typing(d, {now: () => 0});
  const codes = codesOf(d.doc);
  const r1 = updateAll(d, t);
  checkAll(d.doc);
  assert.deepEqual(codesOf(d.doc), codes, 'codes kept');
  const depth = d.undoDepth;
  const r2 = updateAll(d, t);
  checkAll(d.doc);
  const kinds = {};
  for (const m of r1.messages) {
    const k = (kindOf(m.instr) || 'other') + ': ' + m.reason;
    kinds[k] = (kinds[k] || 0) + 1;
  }
  return {counts: {updated: r1.updated, changed: r1.changed ? 1 : 0,
    'changed again': r2.changed ? 1 : 0, passes: r1.passes},
  again: r2.changed, steps: d.undoDepth - depth, kept: kinds};
}

describe('fields round trip: Update all fields (generated)', () => {
  for (const [name, make] of DOCS) {
    it(name + ': updated, saved, read back, undone', async () => {
      const res = await roundTrip(await make(), name, hash(name),
        updateStory, {xsd});
      assert.ok(!res.refused);
      assert.equal(res.again, false, 'a second update changes nothing');
      assert.equal(res.steps, 0, 'and makes no step');
    });
  }

  it('the stale document comes out as Word would make it',
    async () => {
      const doc = await readDocx(await everything());
      const d = new Document(doc);
      const res = updateAll(d, new Typing(d));
      assert.ok(res.changed);
      const got = Object.fromEntries(kindFields(d.doc).filter(([, i]) =>
        !/^\s*(TOC|PAGEREF\s+_Toc)/.test(i)).map(([, i, s]) =>
        [i.trim(), s]));
      assert.equal(got['SEQ Figure \\* ARABIC'], '1');
      assert.equal(got['SEQ Table \\* ARABIC'], '1');
      assert.equal(got['REF _Ref900000002 \\h'], 'Figure 1');
      assert.equal(got['NOTEREF _Ref900000001 \\h'], '1');
      assert.equal(got['STYLEREF "Heading 1"'], 'Introduction');
      const [toc] = tocFields(d.doc);
      assert.deepEqual(entriesOf(d.doc, toc).map((e) => e.level + '|' +
        e.text.replace(/\s+/g, ' ')), ['1|1. Introduction',
        '2|1.1 Methods', '1|2. Results']);
      assert.ok(entriesOf(d.doc, toc).every((e) =>
        /^\d+$/.test(e.page)));
    });
});

// ------------------------------------------------------------ corpus

const files = corpusFiles();

/** The corpus files (of the sample) with a field of the kinds. */
async function kindFiles(list = files) {
  const out = [];
  for (const f of list) {
    let doc;
    try {
      doc = await readDocx(readFileSync(f));
    } catch (e) {
      continue;
    }
    try {
      if (kindFields(doc).length) out.push(f);
    } catch (e) {
      out.push(f);                     // (the pipeline says why)
    }
  }
  return out;
}

let fieldList = null;
const fieldFiles = async () => fieldList || (fieldList =
  await kindFiles());

describe('fields round trip: the corpus', {
  skip: files.length ? false : SKIP_CORPUS,
}, () => {
  it('the corpus has files with these fields (not a pass on nothing)',
    async () => {
      assert.ok((await fieldFiles()).length > 0, 'no field files');
    });

  it('open, lay out, paginate, save (no update): every part as ' +
    'without the layout, every field as read', async () => {
    const list = await fieldFiles();
    let n = 0, fs = 0, els = 0;
    const fails = [];
    for (const f of list) {
      const name = nameOf(f);
      try {
        const res = await pipeline(readFileSync(f), name);
        n++;
        fs += res.fields;
        els += res.els;
      } catch (e) {
        if (!(e instanceof DocxError)) fails.push(name + ': ' +
          String(e.message).split('\n').slice(0, 3).join(' | ')
            .slice(0, 300));
      }
    }
    console.log(`# fields pipeline${ALL ? '' : ' (sample)'}: ` +
      `${list.length} files with these fields, ${n} compared (${fs} ` +
      `fields and ${els} field elements as read), ${fails.length} ` +
      'failures');
    for (const x of fails) console.log('# FAIL ' + x);
    assert.deepEqual(fails, []);
    if (ALL) assert.ok(n >= 20, n + ' files');
  });

  it('Update all fields on every file with these fields: saved, ' +
    'read back, linted, undone', async () => {
    const list = await fieldFiles();
    // (counts: 'changed again' the files a second update changed)
    await corpusRun(list, updateStory, xsd, xsdNote,
      'fields updated (files with these fields)');
  });

  it(`${STEPS} field commands in the files with these fields and ` +
    'one in ten of the others; undo restores', async () => {
    const list = await fieldFiles();
    const sample = files.filter((f) => hash(nameOf(f)) % 10 === 0 &&
      !list.includes(f));
    await corpusRun([...list, ...sample], fieldsAll, xsd, xsdNote,
      'field commands (corpus)');
  });
});

// ------------------------------------------------------------ oracle

// (WORD_EDIT_CORPUS=1, 2026-10-30, the hand-off files of E3 left out:
// field-oracle oracleFiles) per kind: fields, evaluated, matched;
// PAGEREF and the TOC page numbers are floors
const MEASURED = {
  SEQ: {fields: 29, evaluated: 23, matched: 23},
  REF: {fields: 13, evaluated: 12, matched: 12},
  NOTEREF: {fields: 0, evaluated: 0, matched: 0},
  STYLEREF: {fields: 26, evaluated: 3, matched: 3},
  TOC: {fields: 16, evaluated: 10, matched: 6},
};
const FLOORS = {PAGEREF: 4, 'TOC pages': 23};

/** Whether f lies in the code of a field of doc (all of a field
 *  with no separate is code): a SEQ in a TC field's text. */
function inCode(doc, f) {
  for (const g of fieldScan(doc)) {
    if (!g.children.includes(f)) continue;
    if (!g.sep) return true;
    const c = cmpPath(f.begin.at, g.sep.at);
    if (c < 0 || (c === 0 && f.begin.off < g.sep.off)) return true;
  }
  return false;
}

const paged = new WeakMap();
/** A field worked out as Update does: on the pages for the page
 *  kinds; a header's or footer's on each page showing it (Word
 *  stored the value of one of them). */
function worked(doc, f, ctx) {
  let o = paged.get(doc);
  if (!o) {
    const L = new DocLayout(doc, tm());
    L.layout(1000);
    o = {P: new Pages(printGalley(L)).finish(), pages: null};
    paged.set(doc, o);
  }
  if (ctx.story === null) {
    const i = o.P.ofPos({id: f.begin.id, off: f.begin.off});
    return evaluate({doc, pages: o.P, page: i >= 0 ? o.P.list[i]
      : undefined}, f);
  }
  o.pages = o.pages || refPages(doc);
  const vals = [];
  for (const pg of o.pages) {
    if (pg.header !== ctx.story && pg.footer !== ctx.story) continue;
    vals.push(evaluate({doc, pages: o.P, page: {num: pg.num, s: pg.s,
      fmt: pg.fmt, span: pg.span}}, f));
  }
  return vals.find((v) => v !== null && same(v, ctx.stored)) ??
    vals.find((v) => v !== null) ?? null;
}

/** The tables of contents of the files: rows per TOC, page counts. */
async function tocOracle(list) {
  const INSTR = /<w:instrText[^>]*>\s*TOC\b|w:instr="\s*TOC\b/g;
  const out = {fields: 0, unreachable: 0, skipped: [], rows: [],
    pages: {compared: 0, equal: 0}};
  for (const f of list) {
    const bytes = readFileSync(f), file = nameOf(f);
    let raw = 0;
    try {
      const x = (await readZip(bytes)).get('word/document.xml');
      raw = x ? (dec.decode(x).match(INSTR) || []).length : 0;
    } catch (e) {
      continue;
    }
    if (!raw) continue;
    out.fields += raw;
    let doc;
    try {
      doc = await readDocx(bytes);
    } catch (e) {
      out.unreachable += raw;
      continue;
    }
    const ts = tocFields(doc);
    out.unreachable += Math.max(0, raw - ts.length);
    let P = null;
    for (const t of ts) {
      const sw = tocParse(t.instr);
      if (!canRebuild(sw)) {
        out.skipped.push(file + ': ' + t.instr.trim());
        continue;
      }
      const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
      const stored = entriesOf(doc, t), es = tocEntries(doc, sw, {});
      const a = stored.map((e) => e.level + '|' + norm(e.text));
      const b = (es || []).map((e) => e.level + '|' + norm((e.label
        ? e.label + ' ' : '') + e.text));
      const equal = JSON.stringify(a) === JSON.stringify(b);
      out.rows.push({file, equal, first: a.find((x, k) => x !== b[k])});
      if (!equal) continue;
      P = P || paginate1000(doc);
      tocEntries(doc, sw, {pages: P}).forEach((e, k) => {
        if (stored[k].page === null || e.page === null) return;
        out.pages.compared++;
        if (norm(stored[k].page) === norm(e.page)) out.pages.equal++;
      });
    }
  }
  return out;
}
const paginate1000 = (doc) => {
  const L = new DocLayout(doc, tm());
  L.layout(1000);
  return new Pages(printGalley(L)).finish();
};

describe('fields: the consolidated oracle (Word\'s stored results)',
  () => {
    it('per kind: fields, evaluated, matched, mismatched, skipped',
      async () => {
        const res = await fieldOracle({names: ['SEQ', 'REF', 'NOTEREF',
          'STYLEREF', 'PAGEREF'], stories: true,
        // (a SEQ in another field's code shows no result: not
        // counted, as the SEQ oracle; the mixed-case ones are)
        filter: (f, doc) => !/^\s*SEQ\b/i.test(f.instr) ||
          !inCode(doc, f) || /\\\*\s*Alphabetic/.test(f.instr),
        evaluate: worked});
        const rows = res.rows;
        const toc = await tocOracle(oracleFiles());
        const table = {};
        const at = (k) => table[k] || (table[k] = {fields: 0,
          evaluated: 0, matched: 0, mismatched: 0, none: 0, skipped: 0,
          reasons: {}});
        for (const x of rows) {
          const c = at(x.name);
          c.fields++;
          if (x.match === null) c.none++;
          else {
            c.evaluated++;
            if (x.match) c.matched++;
            else {
              c.mismatched++;
              const why = x.name === 'PAGEREF' ? 'page ' +
                (Number(x.computed) > Number(x.stored) ? 'later'
                  : 'earlier') + ' (stand-in fonts)' : x.reason;
              c.reasons[why] = (c.reasons[why] || 0) + 1;
            }
          }
        }
        for (const s of res.skipped) {
          if (!s.name) continue;
          at(s.name).fields++;
          at(s.name).skipped++;
        }
        for (const k of ['NOTEREF', 'SEQ', 'REF', 'STYLEREF',
          'PAGEREF']) at(k);
        const t = at('TOC');
        t.fields = toc.fields;
        t.skipped = toc.unreachable + toc.skipped.length;
        t.evaluated = toc.rows.length;
        t.matched = toc.rows.filter((x) => x.equal).length;
        t.mismatched = t.evaluated - t.matched;
        if (t.mismatched) t.reasons['stale stored entries'] =
          t.mismatched;
        if (toc.unreachable) t.reasons['in a content control ' +
          '(skipped)'] = toc.unreachable;
        if (toc.skipped.length) t.reasons['switches not rebuilt ' +
          '(skipped)'] = toc.skipped.length;
        const tp = at('TOC pages');
        tp.fields = tp.evaluated = toc.pages.compared;
        tp.matched = toc.pages.equal;
        tp.mismatched = tp.evaluated - tp.matched;
        if (tp.mismatched) tp.reasons['stand-in fonts'] = tp.mismatched;
        console.log('# ORACLE' + (ALL ? '' : ' (sample; ' +
          'WORD_EDIT_CORPUS=1 for all)') + ': kind | fields | ' +
          'evaluated | matched | mismatched | not evaluated | skipped');
        for (const [k, c] of Object.entries(table)) {
          console.log(`# ORACLE ${k} | ${c.fields} | ` +
            `${c.evaluated} | ${c.matched} | ${c.mismatched} | ` +
            `${c.none} | ${c.skipped}` +
            (Object.keys(c.reasons).length ? ' (' + Object.entries(
              c.reasons).map(([w, n]) => w + ' x' + n).join(', ') + ')'
              : ''));
        }
        // the exact kinds: every evaluated field matches
        for (const k of ['SEQ', 'REF', 'NOTEREF', 'STYLEREF']) {
          assert.equal(table[k].mismatched, 0, k + ' mismatched');
        }
        if (!ALL) return;
        for (const [k, want] of Object.entries(MEASURED)) {
          const c = table[k];
          assert.deepEqual({fields: c.fields, evaluated: c.evaluated,
            matched: c.matched}, want, k);
        }
        for (const [k, n] of Object.entries(FLOORS)) {
          assert.ok(table[k].matched >= n, `${k}: ` +
            `${table[k].matched} < floor ${n}`);
        }
      });

    it('the pages-corpus pin is unchanged (328 of 1387)', () => {
      const pin = JSON.parse(readFileSync(new URL(
        './corpus-expected.json', import.meta.url), 'utf8')).pageStarts;
      // (325 -> 328 in Batch F1: a comment reference draws nothing)
      assert.equal(pin.matched, 328);
      assert.equal(pin.ourCount, 1387);
    });
  });

// ----------------------------------------------------------- the burst

/** A random caret or range in the body. */
function randSel(rd, doc) {
  const ps = paras(doc);
  if (!ps.length) return null;
  const at = (b) => ({id: b.id, off: Math.floor(rd() *
    (b.text.length + 1))});
  const a = pick(rd, ps);
  if (rd() < 0.6) return S.caret(at(a));
  return S.select(at(a), rd() < 0.7 ? at(a) : at(pick(rd, ps)));
}

/** A caret at the end of a random paragraph with text. */
function endSel(rd, doc) {
  const ps = paras(doc).filter((b) => b.text.length);
  if (!ps.length) return randSel(rd, doc);
  const b = pick(rd, ps);
  return S.caret({id: b.id, off: b.text.length});
}

const LABELS = ['Figure', 'Table', 'Equation', 'My Plate'];
const LEADERS = ['dot', 'hyphen', 'underscore', 'none'];

/** One random command: its name ('... refused' when nothing
 *  changed). */
function command(rd, d, t, k) {
  const x = rd();
  const did = (name, ok) => (ok ? name : name + ' refused');
  if (x < 0.1) {
    let n = 1 + Math.floor(rd() * 6);
    while (n-- > 0 && d.undo());
    let m = Math.floor(rd() * 4);
    while (m-- > 0 && d.redo());
    return 'undo/redo';
  }
  if (x < 0.2) {
    const sel = randSel(rd, d.doc);
    if (!sel) return 'none';
    const opts = rd() < 0.25 ? {seqId: pick(rd, ['Figure', 'Table'])}
      : {levels: 1 + Math.floor(rd() * 9), hyperlinks: rd() < 0.7,
        pageNumbers: rd() < 0.8, rightAlign: rd() < 0.8,
        leader: pick(rd, LEADERS), outline: rd() < 0.5};
    return did('insert table', !!insertToc(d, t, sel, opts,
      ctxOf(d)));
  }
  if (x < 0.32) {
    const sel = rd() < 0.7 ? endSel(rd, d.doc) : randSel(rd, d.doc);
    if (!sel) return 'none';
    const opts = {label: pick(rd, LABELS), text: ' caption ' + k,
      position: pick(rd, ['above', 'below', undefined])};
    if (rd() < 0.2) opts.chapter = {level: 1, separator: '-'};
    if (rd() < 0.2) opts.excludeLabel = true;
    return did('caption', !!insertCaption(d, t, sel, opts, {}));
  }
  if (x < 0.44) {
    const sel = randSel(rd, d.doc);
    if (!sel) return 'none';
    const types = typesOf(d.doc).filter((y) =>
      targets(d.doc, y.id).length);
    if (!types.length) return 'none';
    const type = pick(rd, types).id;
    const tg = pick(rd, targets(d.doc, type));
    const what = pick(rd, whatsOf(type)).id;
    return did('cross-reference', !!insertXref(d, t, sel, {type,
      target: tg.id, what, hyperlink: rd() < 0.7}, ctxOf(d), {}));
  }
  if (x < 0.54) {
    const hs = headings(d.doc);
    if (!hs.length) return 'none';
    const h = pick(rd, hs);
    const loc = findBlock(d.doc, h.para);
    if (!loc) return 'none';
    const b = loc.b;
    const had = d.undoDepth;
    if (rd() < 0.6 || b.text.length < 2) {
      t.type(S.caret({id: b.id, off: b.text.length}), ' edited ' + k);
    } else {
      const off = Math.floor(rd() * (b.text.length - 1));
      deleteSelection(d, S.select({id: b.id, off}, {id: b.id,
        off: off + 1}));
    }
    return did('edit heading', d.undoDepth > had);
  }
  if (x < 0.62) {
    const bs = bookmarkList(d.doc, {hidden: true}).filter((y) => y.at);
    if (!bs.length) return 'none';
    const res = deleteBookmark(d, t, pick(rd, bs).name);
    return did('delete bookmark', !!res && !res.error);
  }
  if (x < 0.7) {
    const fs = fieldScan(d.doc);
    if (!fs.length) return 'none';
    const f = pick(rd, fs);
    const sel = S.caret({id: f.begin.id, off: f.begin.off});
    const ctx = ctxOf(d);
    return did('update field', !!t.command(() => updateCmd(d, sel,
      ctx)));
  }
  if (x < 0.76) {
    const ts = tocFields(d.doc);
    if (!ts.length) return 'none';
    const f = pick(rd, ts);
    if (rd() < 0.25) return did('remove table', !!removeToc(d, t, f));
    const res = updateToc(d, t, f, rd() < 0.5 ? 'pages' : 'entire',
      ctxOf(d));
    return did('update table', !!res && res.changed);
  }
  if (x < 0.86) {
    return did('update all', updateAll(d, t).changed);
  }
  const sel = randSel(rd, d.doc);
  if (!sel) return 'none';
  if (rd() < 0.3 && !S.collapsed(sel)) {
    const had = d.undoDepth;
    deleteSelection(d, sel);
    return did('delete', d.undoDepth > had);
  }
  t.type(sel, rd() < 0.2 ? '\n' : 'typed ');
  return 'type';
}

/** STEPS commands on d. */
export async function fieldsAll(d, seed, {every = false} = {}) {
  const rd = rng(seed);
  let now = 0;
  const t = new Typing(d, {now: () => (now += 2000)});
  const counts = {};
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
      if (every || k === STEPS - 1) checkAll(d.doc);
    } catch (e) {
      e.message = `seed ${seed} step ${k} (${kind}): ${e.message}`;
      throw e;
    }
    counts[kind] = (counts[kind] || 0) + 1;
  }
  checkAll(d.doc);
  return {steps: k, capped: k < STEPS, counts};
}

export const KINDS = ['insert table', 'caption', 'cross-reference',
  'edit heading', 'delete bookmark', 'update field', 'update table',
  'update all', 'undo/redo'];

describe('fields round trip: seeded bursts (generated documents)',
  () => {
    const total = {};
    for (const [name, make] of DOCS) {
      it(name, async () => {
        const bytes = await make();
        for (let k = 0; k < 4; k++) {
          const res = await roundTrip(bytes, name, hash(name) + k,
            fieldsAll, {xsd: k === 0 ? xsd : null, every: true});
          for (const [c, n] of Object.entries(res.counts))
            total[c] = (total[c] || 0) + n;
        }
      });
    }
    it('every command ran and changed documents', () => {
      console.log('# field commands (generated): ' +
        JSON.stringify(total));
      for (const k of KINDS) assert.ok(total[k] > 0, k + ' ran');
      for (const k of ['remove table', 'delete']) {
        assert.ok(total[k] > 0, k + ' ran');
      }
    });
    it('schema check available', {skip: xsdNote || false}, () => {});
  });

// ------------------------------------------------------------ hostile

/**
 * Open bytes, lay out and paginate, update all fields, put in a
 * table of contents, a caption and a cross-reference, update all
 * again, save, read back and paginate again, undo everything:
 * nothing thrown, no package error added, the opened bytes back.
 * Returns the times (ms) and what was done.
 */
async function abuse(bytes, what, more) {
  const t0 = performance.now();
  const doc = await readDocx(bytes);
  const out0 = await write(doc);
  const t1 = performance.now();
  paginate(doc);
  const t2 = performance.now();
  const d = new Document(doc);
  d.clearHistory();
  const t = new Typing(d, {now: () => 0});
  const done = [];
  const r1 = updateAll(d, t);
  if (r1.changed) done.push('update all');
  done.push(...r1.messages.slice(0, 3).map((m) => 'kept: ' +
    m.reason));
  const ps = paras(d.doc);
  if (ps.length && insertToc(d, t, S.caret({id: ps[0].id, off: 0}),
    {}, ctxOf(d))) done.push('toc');
  const last = paras(d.doc).filter((b) => b.text.length).pop();
  if (last && insertCaption(d, t, S.caret({id: last.id,
    off: last.text.length}), {label: 'Figure', text: ' x'}, {})) {
    done.push('caption');
  }
  const hs = targets(d.doc, 'heading');
  const end = paras(d.doc).pop();
  if (hs.length && end && insertXref(d, t, S.caret({id: end.id,
    off: end.text.length}), {type: 'heading', target: hs[0].id,
    what: 'text'}, ctxOf(d), {})) done.push('xref');
  if (more) done.push(...more(d, t));
  if (updateAll(d, t).changed) done.push('update all again');
  checkAll(d.doc);
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
    save: t4 - t3, done, d, back};
}

const HUGE = 'x'.repeat(100000);
const nest = (n) => {
  let x = fld(' REF deep ', 'v');
  for (let k = 0; k < n; k++) x = fld(' IF 1 = 1 "{}" "b" ', 'v',
    {nested: x});
  return x;
};

const HOSTILE = [
  ['a REF inside its own bookmark; two that point at each other',
    () => docx(H(1, 'Head') + p(BS(1, 'loop') + r('a ') +
      fld(' REF loop ', 'x') + BE(1)) + p(BS(2, 'one') +
      fld(' REF two ', 'y') + BE(2) + BS(3, 'two') +
      fld(' REF one ', 'z') + BE(3)))],
  ['a REF to a bookmark in a note, the note then deleted',
    () => docx(H(1, 'Head') + p(r('Mark ') + mark(1) + r(' end')) +
      p(r('See ') + fld(' REF inNote ', 'old')), {notes: {1: p(
      '<w:r><w:footnoteRef/></w:r>' + BS(5, 'inNote') + r(' noted') +
      BE(5))}}),
  (d) => {
    const b = paras(d.doc).find((x) => x.text.startsWith('Mark'));
    const off = b.text.indexOf(OBJ);
    deleteSelection(d, S.select({id: b.id, off}, {id: b.id,
      off: off + 1}));
    return [d.doc.notes.footnotes.has(1) ? 'note kept' :
      'note deleted'];
  }],
  ['fields nested 60 deep', () => docx(H(1, 'Head') +
    p(BS(1, 'deep') + r('d') + BE(1)) + p(nest(60)))],
  ['a table of contents with no headings', () => docx(
    p(fld(' TOC \\o "1-3" \\h \\z \\u ', 'old')) + p(r('text')))],
  ['a table of contents in a header (left as it is)', () => docx(
    H(1, 'Head') + p(r('body')) + '<w:sectPr><w:headerReference ' +
    'w:type="default" r:id="rIdH"/></w:sectPr>', {parts: {
    'word/header1.xml': hdrXml(p(fld(' TOC \\o "1-3" ', 'hdr toc')))},
  docRels: [['rIdH', REL('header'), 'header1.xml']]}), (d, t) => {
    const part = [...d.doc.stories.keys()][0];
    const f = facadeOf(d, part, 0);
    const hp = f.doc.sections[0].blocks[0];
    const res = insertToc(f, t, S.caret({id: hp.id, off: 0}), {});
    assert.equal(res, null, 'refused in a header');
    return ['header insert refused'];
  }],
  ['huge instructions', () => docx(H(1, 'Head') +
    p(fld(' TOC \\t "' + HUGE + ',1" ', 'old')) +
    p(fld(' REF ' + HUGE + ' ', 'old')) +
    p(fld(' SEQ ' + HUGE + ' ', '1')))],
  ['unknown switches', () => docx(H(1, 'Head') +
    p(fld(' TOC \\o "1-3" \\y \\q "zz" ', 'old')) +
    p(BS(1, 'b') + r('t') + BE(1)) + p(fld(' REF b \\k \\j ', 'old')) +
    p(fld(' SEQ Figure \\v ', '7')) + p(fld(' PAGEREF b \\y ', '9')))],
  ['\\b naming a missing bookmark; odd levels', () => docx(
    H(1, 'Head') + H(2, 'Sub') +
    p(fld(' TOC \\b nothere \\o "1-3" ', 'kept')) +
    p(fld(' TOC \\o "9-1" ', 'odd')) +
    p(fld(' TOC \\o "0-99" ', 'wide')))],
  ['duplicate names, huge ids, a SEQ reset far away', () => docx(
    H(1, 'Head') + p(BS(2147483647, 'dup') + r('one') +
    BE(2147483647)) + p(BS(7, 'DUP') + r('two') + BE(7)) +
    p(fld(' REF dup ', 'x') + fld(' PAGEREF DUP ', '1')) +
    p(fld(' SEQ Figure \\r 99999999999 ', '1')) +
    p(fld(' STYLEREF "No such style" ', 'x')))],
];

/** A document of n headings (with a table of contents, stale) or n
 *  SEQ fields. */
function many(n, kind) {
  let body = kind === 'headings' ? p(fld(' TOC \\o "1-3" \\h \\z \\u ',
    'old')) : '';
  for (let k = 1; k <= n; k++) {
    body += kind === 'headings' ? H(1 + (k % 3), 'Heading ' + k)
      : CAP(r('Figure ') + fld(' SEQ Figure \\* ARABIC ', '0'));
  }
  return docx(body);
}

/** Open bytes, paginate, Update all fields, save, read back: the
 *  times (ms) and the document read back. */
async function timed(bytes) {
  const t0 = performance.now();
  const doc = await readDocx(bytes);
  const t1 = performance.now();
  paginate(doc);
  const t2 = performance.now();
  const d = new Document(doc);
  assert.ok(updateAll(d, new Typing(d)).changed);
  const t3 = performance.now();
  const back = await readDocx(await write(d.doc));
  const t4 = performance.now();
  return {read: t1 - t0, pages: t2 - t1, edit: t3 - t2,
    save: t4 - t3, back};
}

/** The best of n runs of the async fn, in ms (each field). */
async function bestOf(fn, n = 3) {
  let b = null;
  for (let k = 0; k < n; k++) {
    const x = await fn();
    if (!b) b = x;
    else for (const f of ['read', 'pages', 'edit', 'save'])
      b[f] = Math.min(b[f], x[f]);
  }
  return b;
}
const totalMs = (x) => x.read + x.pages + x.edit + x.save;

describe('fields round trip: hostile files never throw or hang', () => {
  for (const [name, make, more] of HOSTILE) {
    it(name, async () => {
      const res = await abuse(await make(), name, more);
      console.log('# hostile ' + name + ': ' + res.done.join(', '));
    });
  }

  it('a table of contents with no headings says so (Word\'s text)',
    async () => {
      const doc = await readDocx(await docx(p(fld(' TOC \\o "1-3" ',
        'old')) + p(r('text'))));
      const d = new Document(doc);
      updateAll(d, new Typing(d));
      const [toc] = tocFields(d.doc);
      const [x] = resultsOf(d.doc).filter((y) => /TOC/.test(y.instr));
      assert.ok(toc);
      assert.equal(x.stored.trim(),
        'No table of contents entries found.');
    });

  it('a table of contents in a header is left as it is by Update ' +
    'all fields', async () => {
      const [, make] = HOSTILE[4];
      const doc = await readDocx(await make());
      const d = new Document(doc);
      const part = [...d.doc.stories.keys()][0];
      const was = resultsOf(d.doc, part);
      // (no field in the body: nothing to do, the header's left)
      assert.equal(updateAll(d, new Typing(d)).ok, false);
      assert.deepEqual(resultsOf(d.doc, part), was);
      assert.equal(was[0].stored, 'hdr toc');
    });

  it('a cross-reference whose note went keeps its result, and says ' +
    'so', async () => {
      const [, make, more] = HOSTILE[1];
      const doc = await readDocx(await make());
      const d = new Document(doc);
      const t = new Typing(d);
      more(d, t);
      const res = updateAll(d, t);
      const [ref] = resultsOf(d.doc).filter((y) => /REF inNote/.test(
        y.instr));
      assert.equal(ref.stored, 'old');
      assert.ok(res.messages.some((m) => /REF inNote/.test(m.instr) &&
        m.reason === 'missing bookmark'), JSON.stringify(res.messages));
    });

  for (const kind of ['headings', 'fields']) {
    it(`10,000 ${kind}: linear (load-robust ratio; ceilings only ` +
      'under WORD_PERF=1)', async () => {
      const what = kind === 'headings' ? kind : 'seq';
      const small = await many(1000, what);
      const big = await many(10000, what);
      // (a slower big run only raises the ratio: one run of it)
      const a = await bestOf(() => timed(small));
      const b = await bestOf(() => timed(big), 1);
      const fmt = (x) => ['read', 'pages', 'edit', 'save'].map((f) =>
        f + ' ' + x[f].toFixed(0)).join(', ');
      console.log(`# 1,000 ${kind}: ` + fmt(a) + ' ms; 10,000: ' +
        fmt(b) + ' ms');
      if (process.env.WORD_PERF) {
        assert.ok(totalMs(b) < 60000, 'took ' + totalMs(b));
      } else {
        assert.ok(totalMs(b) < Math.max(totalMs(a), 10) * 30,
          'not linear: ' + (totalMs(b) / totalMs(a)).toFixed(1));
      }
      // (the table holds every heading; the captions are numbered)
      const fs = resultsOf(b.back);
      if (kind === 'headings') {
        const [toc] = tocFields(b.back);
        assert.equal(entriesOf(b.back, toc).length, 10000);
      } else {
        const seq = fs.filter((x) => /^\s*SEQ/.test(x.instr));
        assert.equal(seq.length, 10000);
        assert.equal(seq[seq.length - 1].stored, '10000');
      }
    });
  }
});
