// Tracked changes round trip (Batch F2): the revision commands proved
// on generated documents and on every corpus file holding a revision
// (git-ignored, optional).
//
//   - the pipeline: a file opened, laid out and paginated in every
//     markup view (the Doc deep-frozen first: drawing changes never
//     changes the model), then saved with no edit, writes
//       * every revision element of the main part (insertions,
//         deletions, moves and their range marks, paragraph-mark
//         and row revisions, the *PrChange elements) as read, in the
//         same order: the same tree once the run normalisation the
//         writer applies to every run is applied to both (canonRev:
//         a w:r's rsid attributes dropped, attributes in name order,
//         neighbouring text runs of one format joined),
//       * every header, footer and notes part with its very bytes,
//       * settings.xml with the very XML tree it was read with,
//     and reads back to the same model. ("Tree-identical" for the
//     main part means apart from rsid attributes and same-format run
//     joins: run rsids are never kept, ./ReadPara, and revision runs
//     follow that rule like every other run);
//   - the commands, through roundtrip-lib's roundTrip: Accept All,
//     Reject All, and typing and deleting with Track Changes on,
//     each saved, read back the same, linted (and the main part
//     checked by xmllint/wml.xsd where available), undone to the
//     opened model and bytes;
//   - the consolidated ORACLE: the revision facts of the files read
//     from their XML alone (./rev-oracle.mjs factsOf) against what
//     !Letters lists (./RevMarks list) and rewrites; the values of
//     the first measured run (WORD_EDIT_CORPUS=1, 2026-10-30)
//     pinned;
//   - seeded 40-command bursts (typing, Backspace and Delete,
//     deleting a selection, accept and reject, Accept All, Reject
//     All and by author, comments added, answered and deleted, copy
//     and cut and paste, view switches, Track Changes switched, next
//     and previous, undo and redo) over the generated documents and
//     the corpus sample: ModelCheck at every step, every refusal
//     leaves the document and its undo depth as they were; linter
//     and xsd at the end, undo of everything gives the opened bytes;
//   - hostile files (the design's list) never throw or hang, and the
//     untouched ones round-trip; the pages-corpus pin is unchanged.
//
// The corpus is gated as the other round trips: one file in ten by a
// hash of its name, every file with WORD_EDIT_CORPUS=1 (which needs
// NODE_OPTIONS=--max-old-space-size=2048). The hand-off files made by
// !Letters (corpus/handoff/tc-*, ./handoff-changes.mjs) are not
// corpus files here: ./rev-oracle.mjs revFiles leaves them out.
import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {readDocx, DocxError}
  from '../../tools/moreapps/!Letters/DocxRead';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import * as S from '../../tools/moreapps/!Letters/Selection';
import {accept, reject, acceptAll, rejectAll, resolveAuthor, next,
  prev, commandWhy, Refused}
  from '../../tools/moreapps/!Letters/RevCmd';
import {list, nextId} from '../../tools/moreapps/!Letters/RevMarks';
import * as RT from '../../tools/moreapps/!Letters/RevTrack';
import {rows, authors}
  from '../../tools/moreapps/!Letters/ChangesPatch';
import {MODES} from '../../tools/moreapps/!Letters/RevView';
import {addComment, replyTo, deleteComment}
  from '../../tools/moreapps/!Letters/CommentCmd';
import {slice} from '../../tools/moreapps/!Letters/ClipSlice';
import {cutSelection, pasteBlocks}
  from '../../tools/moreapps/!Letters/ClipPaste';
import {deleteBack, deleteForward, deleteWordBack, deleteSelection}
  from '../../tools/moreapps/!Letters/EditDel';
import {checkBlock, checkNotes, checkComments}
  from '../../tools/moreapps/!Letters/ModelCheck';
import {scan, at as walkAt} from '../../tools/moreapps/!Letters/Walk';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {buildDocx, documentXml, settingsXml, p, r}
  from './build-docx.mjs';
import {commentParts, range} from './comment-fixtures.mjs';
import {tbl, tr, tc} from './tbl-fixtures.mjs';
import {withHeaders} from './story-fixtures.mjs';
import {SEPS, mark, noteP} from './note-fixtures.mjs';
import {freeze} from './story-fixtures.mjs';
import {lintPackage} from './lint-package.mjs';
import {roundTrip, schema, hash, corpusFiles, corpusRun, nameOf, ALL,
  SKIP_CORPUS, write} from './roundtrip-lib.mjs';
import {assertSameDoc, expectedBack} from './docx-compare.mjs';
import {revFiles, factsOf, sumFacts} from './rev-oracle.mjs';
import {canonRev, revEls} from './rev-canon.mjs';
import {partsMisplaced} from './text-context.mjs';
import {rng, tm, loadStyles} from './word-docs.mjs';
import {markBroken} from './word-emit.mjs';

before(loadStyles);
export const STEPS = 40;
const BURST_MS = 6000;
const pick = (rd, a) => a[Math.floor(rd() * a.length)];
const dec = new TextDecoder();
const {xsd, note: xsdNote} = schema();
const NOW = new Date(2026, 9, 30, 9, 0, 0);
const PEOPLE = ['Ann Example', 'Bob', 'Zoë 中'];
const CM = {initials: 'AE', date: NOW};

// ------------------------------------------------------------ helpers

/** The body's paragraphs, tables included, in order. */
function paras(doc) {
  const out = [];
  scan(doc, (b) => { if (b.type === 'p') out.push(b); });
  return out;
}

/** ModelCheck over the body, the stories, the notes and comments. */
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
  checkComments(doc.comments);
}

/** doc laid out (in markup view `mode`) and paginated as Print layout
 *  does. */
function paginate(doc, mode = 'final') {
  const L = new DocLayout(doc, tm(), null, {markup: mode});
  L.layout(800);
  return new Pages(printGalley(L)).finish();
}

/** The package lint's errors. */
const errsOf = (z) => lintPackage(z).problems
  .filter((q) => q.level === 'error')
  .map((q) => q.rule + ' ' + q.part + ' ' + q.detail);

const xmlOf = (b) => parseXml(dec.decode(b).replace(/^﻿/, ''));

const STORY = /^word\/(header\d*|footer\d*|footnotes|endnotes)\.xml$/;

/** The XML root of settings compared: for a Strict file the root's
 *  namespace declarations are left out (the writer maps a
 *  transitional URI a Strict file declares to its Strict one, as
 *  before this work). */
function settingsRoot(bytes, strict) {
  const root = xmlOf(bytes).root;
  if (!strict) return root;
  return {...root, attrs: root.attrs.filter(([k]) =>
    !k.startsWith('xmlns'))};
}

/**
 * Open bytes, freeze the Doc, lay it out in every view and paginate
 * it, save it: see the header. Returns {revs, stories, settings}:
 * the revision elements compared and the parts kept.
 */
async function pipeline(bytes, what) {
  const doc = await readDocx(bytes);
  freeze(doc);
  for (const m of MODES) {
    const P = paginate(doc, m);
    assert.ok(P.done && P.count >= 1, what + ': paginated ' + m);
  }
  const out = await write(doc);
  const z = await readZip(out), zin = await readZip(bytes);
  const main = doc.meta.mainPart;
  const a = revEls(zin.get(main));
  assert.deepEqual(revEls(z.get(main)), a, what + ': the revisions');
  assert.deepEqual(partsMisplaced(z, zin), [], what +
    ': text elements out of place');
  let stories = 0, settings = 0;
  for (const n of zin.keys()) {
    if (!STORY.test(n)) continue;
    assert.ok(z.get(n) && Buffer.from(z.get(n)).equals(
      Buffer.from(zin.get(n))), what + ': ' + n + ' bytes');
    stories++;
  }
  const sp = doc.meta.settingsPart;
  if (sp && zin.get(sp)) {
    const strict = doc.meta.conformance === 'strict';
    assert.ok(isDeepStrictEqual(settingsRoot(z.get(sp), strict),
      settingsRoot(zin.get(sp), strict)), what + ': settings tree');
    settings++;
  }
  assertSameDoc(await readDocx(out), expectedBack(doc), what +
    ': read back');
  return {revs: a.length, stories, settings};
}

/** pasteBlocks' options for slice s. */
const optsOf = (s, sameDoc) => ({sameDoc, styleNames: s.styleNames,
  styles: s.styles, lists: s.lists, pics: s.pics,
  picScope: s.picScope, notes: s.notes, comments: s.comments});

/** The paragraph a RevMarks entry is in (the body only), or null. */
const paraOf = (doc, e) => (e && !e.where.story
  ? walkAt(doc, e.where.block) : null);

/** The body's editable entries. */
const editable = (doc) => list(doc).filter((e) => e.editable);

// ----------------------------------------------------------- documents

const D = '2024-01-02T03:04:00Z';
const att = (id, au = 'Ann', d = D) => `w:id="${id}"` +
  (au === null ? '' : ` w:author="${au}"`) +
  (d === null ? '' : ` w:date="${d}"`);
const sp = (t) => (/^ | $/.test(t) ? ' xml:space="preserve"' : '');
const run = (t, tag = 'w:t', rPr = '') => `<w:r>${rPr ? '<w:rPr>' +
  rPr + '</w:rPr>' : ''}<${tag}${sp(t)}>${t}</${tag}></w:r>`;
const dRun = (t, rPr) => run(t, 'w:delText', rPr);
const el = (name, id, inner, au, d) => `<w:${name} ${att(id, au, d)}>` +
  `${inner}</w:${name}>`;
const ins = (id, t, au, d) => el('ins', id, run(t), au, d);
const del = (id, t, au, d) => el('del', id, dRun(t), au, d);
const mvRange = (side, id, name, inner) =>
  `<w:move${side}RangeStart w:id="${id}" w:name="${name}" ` +
  `w:author="Bob" w:date="${D}"/>${inner}` +
  `<w:move${side}RangeEnd w:id="${id}"/>`;
const mvFrom = (id, t, name = 'move1', rid = 90) => mvRange('From', rid,
  name, el('moveFrom', id, run(t), 'Bob'));
const mvTo = (id, t, name = 'move1', rid = 91) => mvRange('To', rid,
  name, el('moveTo', id, run(t), 'Bob'));
const bmS = (id) => `<w:bookmarkStart w:id="${id}" w:name="b${id}"/>`;
const bmE = (id) => `<w:bookmarkEnd w:id="${id}"/>`;
const TRACK = '<w:zoom w:percent="100"/><w:trackRevisions/>' +
  '<w:defaultTabStop w:val="720"/>';
const PLAIN = '<w:zoom w:percent="100"/><w:defaultTabStop ' +
  'w:val="720"/>';
const LOREM = 'The quick brown fox jumps over the lazy dog. ';

/** A package of body with settings (and comments as
 *  ./comment-fixtures takes them). */
function pkg(body, {settings = TRACK, comments = null,
  more = {}} = {}) {
  const c = comments ? commentParts(comments) : {parts: {},
    docRels: []};
  return buildDocx({'word/document.xml': documentXml(body),
    'word/settings.xml': settingsXml(settings), ...c.parts, ...more},
  {docRels: c.docRels});
}

/** Two authors' insertions and deletions, a split insertion, a
 *  deletion holding a comment range and a bookmark; tracking on. */
const authorsDoc = () => pkg(
  p(r('Plain start, ') + ins(1, 'inserted by Ann') + r(' and ') +
    del(2, 'deleted by Bob', 'Bob') + r(' then text.')) +
  p(ins(3, 'Bob one ', 'Bob') + r('between') + ins(3, ' Bob two',
    'Bob') + r(' end.')) +
  p(r('A deletion holding marks: ') + el('del', 4, dRun('gone ') +
    '<w:commentRangeStart w:id="0"/>' + bmS(5) + dRun('words') +
    bmE(5) + '<w:commentRangeEnd w:id="0"/>', 'Bob') +
    '<w:r><w:commentReference w:id="0"/></w:r>' + r(' after.')) +
  p(r(LOREM + LOREM)),
  {comments: {0: 'on deleted words'}});

/** A move with its range marks (old place first), tracking off. */
const moveDoc = () => pkg(
  p(r('Old place: ') + mvFrom(10, 'moved words') + r(' left.')) +
  p(r(LOREM)) +
  p(r('New place: ') + mvTo(11, 'moved words') + r(' arrived.')) +
  p(r('A lone half: ') + mvFrom(12, 'no partner', 'move2', 92)),
  {settings: PLAIN});

/** Revisions in table cells, one insertion across two paragraphs
 *  (one id), a paragraph-mark insertion and formatting changes. */
const tableDoc = () => pkg(
  p(r('Before the table.')) +
  tbl([tr([tc(p(r('cell ') + ins(20, 'new in a cell'))),
    tc(p(del(21, 'old in a cell', 'Bob') + r(' kept')))]),
  tr([tc(p(r('plain'))), tc(p(ins(22, 'x', 'Zoë')))])]) +
  p(r('Across: ') + ins(23, 'first half'),
    `<w:rPr><w:ins ${att(24)}/></w:rPr>`) +
  p(ins(23, 'second half') + r(' and on.')) +
  p(r('Bold now', '<w:b/><w:rPrChange ' + att(25) +
    '><w:rPr/></w:rPrChange>'), '<w:jc w:val="center"/><w:pPrChange ' +
    att(26) + '><w:pPr/></w:pPrChange>'));

/** No revision at all; tracking on (so typing records). */
const plainDoc = () => pkg(p(r('Plain text, ' + LOREM)) +
  p(r('Another paragraph.')) +
  tbl([tr([tc(p(r('cell'))), tc(p(r('more')))])]) + p(r('End.')));

/** Every generated document: [name, () => Promise<bytes>]. */
export const DOCS = [
  ['two authors, a split insertion, a deletion holding marks',
    authorsDoc],
  ['a move with its range marks and a lone half', moveDoc],
  ['table cells, an insertion across paragraphs, formatting changes',
    tableDoc],
  ['no revisions, tracking on', plainDoc],
];

// ------------------------------------------------------------ pipeline

describe('tracked changes round trip: the pipeline (open, lay out ' +
  'in every view, paginate, save, no edit)', () => {
  for (const [name, make] of DOCS) {
    it(name, async () => {
      const res = await pipeline(await make(), name);
      assert.ok(res.revs > 0 || name.startsWith('no revisions'));
      assert.equal(res.settings, 1);
    });
  }
});

// ------------------------------------------------------------ stories

/** A Typing whose clock moves on 2 s a call; d's reviewer `who`. */
function typingOf(d, who = PEOPLE[0]) {
  let now = 0;
  d.reviewer = () => ({name: who, now: NOW});
  return new Typing(d, {now: () => (now += 2000)});
}

/** Accept All (or Reject All): something resolved where the body has
 *  an editable revision. */
const allStory = (accepting) => async (d) => {
  const t = typingOf(d);
  const cmd = accepting ? 'accept' : 'reject';
  // (a move with a half kept raw is left whole: ./RevCmd)
  const can = (doc) => editable(doc).filter((e) => !commandWhy(d,
    {kind: e.kind, id: e.id}, cmd));
  const n = can(d.doc).length;
  const depth = d.undoDepth;
  const res = (accepting ? acceptAll : rejectAll)(d, t);
  checkAll(d.doc);
  assert.equal(res.resolved > 0, n > 0, 'resolved ' + res.resolved +
    ' of ' + n);
  assert.equal(d.undoDepth, depth + (n > 0 ? 1 : 0), 'one step');
  assert.deepEqual(can(d.doc), [], 'none left');
  // (undone here once: the opened model, before roundTrip's own
  // undo of everything is checked)
  const counts = {[accepting ? 'accepted' : 'rejected']: res.resolved,
    skipped: res.skipped};
  if (n > 0) {
    const was = await write(d.doc);
    d.undo();
    assert.equal(can(d.doc).length, n, 'undone');
    d.redo();
    assert.ok(Buffer.from(await write(d.doc)).equals(Buffer.from(was)),
      'redone, the same bytes');
  }
  return {counts};
};

/**
 * Track Changes switched on (when it is off and there is a settings
 * part), then typing at the start of the first editable revisions'
 * paragraphs and in the first plain paragraph, a Backspace and a
 * deleted word: each recorded (or refused, nothing changed).
 */
async function trackedStory(d) {
  const t = typingOf(d);
  const counts = {};
  const did = (k) => { counts[k] = (counts[k] || 0) + 1; };
  const tryDo = (k, fn) => {
    const depth = d.undoDepth, sid = d.stateId;
    try {
      fn();
      did(k);
    } catch (e) {
      if (!(e instanceof Refused)) throw e;
      assert.equal(d.undoDepth, depth, k + ' refused: no step');
      assert.equal(d.stateId, sid, k + ' refused: unchanged');
      did(k + ' refused');
    }
    checkAll(d.doc);
  };
  if (!RT.on(d)) {
    if (d.doc.meta.settingsPart) {
      tryDo('switched on', () => RT.setTracking(d, t, true));
    } else did('no settings part');
  }
  if (!RT.on(d)) return {counts};
  if (nextId(d.doc) === null) did('ids unreadable');
  const es = editable(d.doc).slice(0, 3);
  for (const e of es) {
    const b = paraOf(d.doc, e);
    if (b) tryDo('typed at a revision', () => t.type(S.caret({id: b.id,
      off: e.where.from}), 'typed '));
  }
  const b = paras(d.doc).find((x) => /[A-Za-z]{3}/.test(x.text));
  if (b) {
    const m = /[A-Za-z]{3,}/.exec(b.text);
    tryDo('typed', () => t.type(S.caret({id: b.id, off: m.index}),
      'new '));
    const b2 = paras(d.doc).find((x) => x.id === b.id);
    const m2 = /[A-Za-z]{3,}/.exec(b2.text.slice(4)) || m;
    const at = m2 === m ? m.index : m2.index + 4;
    tryDo('backspace', () => t.command(() => deleteBack(d,
      S.caret({id: b.id, off: at + 2}))));
    tryDo('deleted a word', () => t.command(() => deleteSelection(d,
      S.select({id: b.id, off: at}, {id: b.id, off: at + 2}))));
  }
  if (counts.typed && nextId(d.doc) !== null) {
    assert.ok(list(d.doc).some((e) => e.author === PEOPLE[0] &&
      e.kind === 'ins'), 'an insertion by ' + PEOPLE[0]);
  }
  return {counts};
}

describe('tracked changes round trip: the commands (generated)', () => {
  for (const [name, make] of DOCS) {
    for (const [what, story] of [['Accept All', allStory(true)],
      ['Reject All', allStory(false)], ['tracked typing and deleting',
        trackedStory]]) {
      it(name + ': ' + what + '; saved, read back, linted, undone',
        async () => {
          const res = await roundTrip(await make(), name, hash(name),
            story, {xsd});
          assert.ok(!res.refused);
          if (what.startsWith('tracked')) {
            assert.ok(res.counts.typed, JSON.stringify(res.counts));
          }
        });
    }
  }
});

// ------------------------------------------------------------ corpus

const files = corpusFiles();
const HAVE = files.length > 0;

let rvList = null;
/** The corpus files (of the sample) with a revision. */
const rvFiles = async () => {
  if (!rvList) {
    const want = new Set(files);
    rvList = (await revFiles()).map((f) => f.path)
      .filter((f) => want.has(f));
  }
  return rvList;
};

describe('tracked changes round trip: the corpus', {
  skip: HAVE ? false : SKIP_CORPUS,
}, () => {
  it('the corpus has files with revisions (not a pass on nothing)',
    {skip: ALL ? false : 'WORD_EDIT_CORPUS=1 (the sample may hold ' +
      'none)'}, async () => {
      assert.ok((await rvFiles()).length > 0, 'no revision files');
    });

  it('open, lay out in every view, paginate, save (no edit): every ' +
    'revision as read, every story part and settings.xml as read',
  async () => {
    const list = await rvFiles();
    let n = 0, revs = 0, stories = 0, settings = 0;
    const fails = [];
    for (const f of list) {
      const name = nameOf(f);
      try {
        const res = await pipeline(readFileSync(f), name);
        n++;
        revs += res.revs;
        stories += res.stories;
        settings += res.settings;
      } catch (e) {
        if (!(e instanceof DocxError)) fails.push(name + ': ' +
          String(e.message).split('\n').slice(0, 3).join(' | ')
            .slice(0, 300));
      }
    }
    console.log(`# revisions pipeline${ALL ? '' : ' (sample)'}: ` +
      `${list.length} files with revisions, ${n} compared (${revs} ` +
      `revision elements, ${stories} story parts and ${settings} ` +
      `settings parts as read), ${fails.length} failures`);
    for (const x of fails) console.log('# FAIL ' + x);
    assert.deepEqual(fails, []);
    if (ALL) assert.equal(n, MEASURED.read.files + MEASURED.handoff);
  });

  for (const [what, story] of [['Accept All', allStory(true)],
    ['Reject All', allStory(false)], ['tracked typing and deleting',
      trackedStory]]) {
    it(what + ' on every file with revisions: saved, read back, ' +
      'linted, undone to the opened bytes', async () => {
      await corpusRun(await rvFiles(), story, xsd, xsdNote,
        what + ' (files with revisions)');
    });
  }

  it(`${STEPS} commands with Track Changes on in the files with ` +
    'revisions and one in ten of the others; undo restores',
  async () => {
    const list = await rvFiles();
    const sample = files.filter((f) => hash(nameOf(f) + ' rv') % 10 ===
      0 && !list.includes(f) && !/^handoff\//.test(nameOf(f)));
    await corpusRun([...list, ...sample], revBurst, xsd, xsdNote,
      'tracked-change bursts (corpus)');
  });
});

// ------------------------------------------------------------ oracle

// (WORD_EDIT_CORPUS=1, 2026-10-30.) The files Word or another tool
// made: the hand-off files of earlier work (corpus/handoff, five of
// them hold revisions: copies of corpus files saved by !Letters, one
// of them the very Comment020) are left out of these numbers, so a
// copy does not count a revision twice; `handoff` is how many there
// were. oracle: read from the XML alone (./rev-oracle factsOf, the
// run-level elements; authors summed per file). read: what !Letters
// lists (./RevMarks list: a revision across paragraphs is an entry
// in each; tagged the ones it models, raw the ones it keeps as read),
// moves the move halves listed, paired those with a partner,
// rewritten the main part's revision elements written back as read
// (canonRev), errors files it could not read or write. (2026-11-01:
// tagged 60 -> 64, raw 59 -> 55: the four w:moveFrom of
// TC-table-DnD-move.docx, their text in w:t as Word writes it, are
// modelled since the old place of a move is read in w:t; the
// XML-only oracle is unchanged.)
const MEASURED = {
  handoff: 5,
  oracle: {files: 19, ins: 62, del: 49, moves: 12, authors: 22},
  read: {files: 19, listed: 119, tagged: 64, raw: 55, moves: 10,
    paired: 10, authors: 21, rewritten: 203, errors: 0},
};

describe('tracked changes: the consolidated oracle (the XML against ' +
  'what !Letters reads)', {skip: HAVE ? false : SKIP_CORPUS}, () => {
  it('files, ins, del, moves, authors, rewrites, errors', async () => {
    const want = new Set(files);
    const all = (await revFiles()).filter((f) => want.has(f.path));
    const real = all.filter((f) => !/^handoff\//.test(f.file));
    const facts = [];
    const got = {files: 0, listed: 0, tagged: 0, raw: 0, moves: 0,
      paired: 0, authors: 0, rewritten: 0, errors: 0};
    const errs = [];
    let elements = 0;
    for (const {file, path} of real) {
      const bytes = readFileSync(path);
      facts.push(await factsOf(bytes));
      let doc, out;
      try {
        doc = await readDocx(bytes);
        out = await write(doc);
      } catch (e) {
        got.errors++;
        errs.push(file + ': ' + String(e.message).slice(0, 200));
        continue;
      }
      got.files++;
      const es = list(doc);
      got.listed += es.length;
      got.tagged += es.filter((e) => e.rev).length;
      got.raw += es.filter((e) => !e.rev).length;
      const mv = es.filter((e) => e.kind === 'mvFrom' ||
        e.kind === 'mvTo');
      got.moves += mv.length;
      got.paired += mv.filter((e) => e.move !== undefined).length;
      got.authors += new Set(es.map((e) => e.author)).size;
      const main = doc.meta.mainPart;
      const a = revEls((await readZip(bytes)).get(main));
      const b = revEls((await readZip(out)).get(main));
      elements += a.length;
      const same = a.filter((x, i) => b[i] === x).length;
      got.rewritten += same;
      if (same !== a.length || b.length !== a.length) {
        got.errors++;
        errs.push(file + ': ' + (a.length - same) + ' revision ' +
          'elements differ');
      }
    }
    const o = sumFacts(facts);
    const oracle = {files: o.files, ins: o.ins || 0, del: o.del || 0,
      moves: (o.moveFrom || 0) + (o.moveTo || 0),
      authors: o.authors || 0};
    console.log('# ORACLE' + (ALL ? '' : ' (sample; ' +
      'WORD_EDIT_CORPUS=1 for all)') + `: ${all.length} files with ` +
      `revisions, ${all.length - real.length} hand-off copies left ` +
      'out');
    console.log('# ORACLE xml: files | ins | del | moves | authors');
    console.log('# ORACLE xml | ' + Object.values(oracle).join(' | '));
    console.log('# ORACLE read: files | listed | tagged | raw | ' +
      'moves | paired | authors | rewritten | errors');
    console.log('# ORACLE read | ' + Object.values(got).join(' | '));
    console.log(`# ORACLE revision-family elements in the main ` +
      `parts: ${elements}`);
    for (const x of errs) console.log('# ERROR ' + x);
    assert.deepEqual(errs, []);
    assert.equal(got.rewritten, elements);
    // (a listed move half is at most a w:moveFrom / w:moveTo; one in
    // two paragraphs is two entries)
    assert.ok(got.tagged + got.raw === got.listed);
    if (!ALL) return;
    assert.equal(all.length - real.length, MEASURED.handoff);
    assert.deepEqual(oracle, MEASURED.oracle);
    assert.deepEqual(got, MEASURED.read);
  });
});

describe('tracked changes: the pages-corpus pin', () => {
  it('is unchanged (323 of 1387)', () => {
    const pin = JSON.parse(readFileSync(new URL(
      './corpus-expected.json', import.meta.url), 'utf8')).pageStarts;
    // (328 -> 327: a TOC in a content control laid out, ./TocSdt;
    // 327 -> 323: links drawn in their runs' own size, reviewed,
    // pages-corpus.test.mjs)
    assert.equal(pin.matched, 323);
    assert.equal(pin.ourCount, 1387);
  });
});

// ----------------------------------------------------------- the burst

/** A random caret or range in the body; half the time at a revision
 *  (its start, its end or inside it). */
function randSel(rd, doc) {
  const ps = paras(doc);
  if (!ps.length) return null;
  const es = rd() < 0.5 ? editable(doc) : [];
  if (es.length) {
    const e = pick(rd, es);
    const b = paraOf(doc, e);
    if (b) {
      const span = e.where.to - e.where.from;
      const a = e.where.from + Math.floor(rd() * (span + 1));
      if (rd() < 0.6) return S.caret({id: b.id, off: a});
      const z = Math.min(b.text.length, a + Math.floor(rd() * 6));
      return S.select({id: b.id, off: Math.max(0, a - 2)},
        {id: b.id, off: z});
    }
  }
  const at = (b) => ({id: b.id, off: Math.floor(rd() *
    (b.text.length + 1))});
  const a = pick(rd, ps);
  if (rd() < 0.6) return S.caret(at(a));
  return S.select(at(a), rd() < 0.8 ? at(a) : at(pick(rd, ps)));
}

const TEXTS = ['typed ', 'x', 'Zoë 😀 ', '<&>"\' ',
  'two\nlines', 'tab\there'];

/** One random command: its name ('... refused' when nothing
 *  changed: no undo step). */
function command(rd, d, t, k, cur) {
  const x = rd();
  const did = (name, ok) => (ok ? name : name + ' refused');
  const had = d.undoDepth;
  const grew = () => d.undoDepth > had;
  if (x < 0.08) {
    let n = 1 + Math.floor(rd() * 6);
    while (n-- > 0 && d.undo());
    let m = Math.floor(rd() * 4);
    while (m-- > 0 && d.redo());
    return 'undo/redo';
  }
  const sel = randSel(rd, d.doc);
  if (!sel) return 'none';
  if (x < 0.26) {
    cur.name = 'type';
    t.type(sel, pick(rd, TEXTS) + (rd() < 0.3 ? k : ''));
    return did('type', grew());
  }
  if (x < 0.36) {
    cur.name = 'backspace/delete';
    const c = S.caret(sel.head);
    const fn = pick(rd, [deleteBack, deleteForward, deleteWordBack]);
    t.command(() => fn(d, c));
    return did('backspace/delete', grew());
  }
  if (x < 0.42) {
    cur.name = 'delete selection';
    if (S.collapsed(sel)) return 'none';
    t.command(() => deleteSelection(d, sel));
    return did('delete selection', grew());
  }
  if (x < 0.52) {
    cur.name = 'accept/reject';
    const ok = rd() < 0.5;
    (ok ? accept : reject)(d, t, sel);
    return did(ok ? 'accept' : 'reject', grew());
  }
  if (x < 0.555) {
    cur.name = 'all / by author';
    const y = rd();
    if (y < 0.35) acceptAll(d, t);
    else if (y < 0.7) rejectAll(d, t);
    else {
      const as = authors(d.doc);
      if (!as.length) return 'none';
      resolveAuthor(d, t, pick(rd, as), rd() < 0.5);
    }
    return did('all / by author', grew());
  }
  if (x < 0.63) {
    cur.name = 'comment';
    const ids = d.doc.comments && d.doc.comments.map instanceof Map
      ? [...d.doc.comments.map.keys()] : [];
    const y = rd();
    const who = {author: pick(rd, PEOPLE), ...CM};
    if (y < 0.5 || !ids.length) {
      const res = addComment(d, t, sel, {text: 'Note ' + k, ...who});
      return did('comment add', !!(res && res.id !== undefined));
    }
    if (y < 0.8) {
      const res = replyTo(d, t, pick(rd, ids), {text: 'reply ' + k,
        ...who});
      return did('comment reply', !!(res && res.id !== undefined));
    }
    return did('comment delete', deleteComment(d, t, pick(rd, ids)) ===
      true);
  }
  if (x < 0.73) {
    cur.name = 'copy or cut/paste';
    if (S.collapsed(sel)) return 'none';
    const cut = rd() < 0.5;
    const s = cut ? cutSelection(d, sel).slice : slice(d.doc, sel);
    if (!s) return did(cut ? 'cut/paste' : 'copy/paste', grew());
    const to = randSel(rd, d.doc);
    // (the paste is a command of its own, after the cut: refused, it
    // leaves the cut as it was)
    const mid = d.undoDepth, sid = d.stateId;
    try {
      if (to) pasteBlocks(d, to, s.blocks, optsOf(s, true));
    } catch (e) {
      if (!(e instanceof Refused)) throw e;
      assert.equal(d.undoDepth, mid, 'paste refused: no step');
      assert.equal(d.stateId, sid, 'paste refused: unchanged');
      return cut ? 'cut, paste refused after it' : 'copy/paste refused';
    }
    return did(cut ? 'cut/paste' : 'copy/paste', grew());
  }
  if (x < 0.8) {
    cur.name = 'view';
    d.markup = pick(rd, MODES);
    return 'view';
  }
  if (x < 0.85) {
    cur.name = 'tracking switched';
    RT.setTracking(d, t, !RT.on(d));
    return did('tracking switched', grew());
  }
  if (x < 0.9) {
    cur.name = 'next/previous';
    const go = rd() < 0.5 ? next : prev;
    const s = go(d, sel, {view: d.markup});
    assert.ok(!s || (s.head && s.anchor), 'a selection or null');
    return 'next/previous';
  }
  cur.name = 'type';
  t.type(sel, rd() < 0.15 ? '\n' : 'more ');
  return did('type', grew());
}

/** STEPS commands on d, Track Changes on first (where it can be). */
export async function revBurst(d, seed, {every = true} = {}) {
  const rd = rng(seed);
  let now = 0;
  const t = new Typing(d, {now: () => (now += 2000)});
  let who = PEOPLE[0];
  d.reviewer = () => ({name: who, now: NOW});
  const counts = {};
  const note = (k) => { counts[k] = (counts[k] || 0) + 1; };
  if (!RT.on(d) && d.doc.meta.settingsPart) {
    try {
      RT.setTracking(d, t, true);
      note('switched on');
    } catch (e) {
      if (!(e instanceof Refused)) throw e;
      note('switch refused');
    }
  }
  const t0 = Date.now();
  let k = 0;
  for (; k < STEPS; k++) {
    if (Date.now() - t0 > BURST_MS) break;
    who = pick(rd, PEOPLE);
    let kind = '?';
    const cur = {name: '?'};
    const depth = d.undoDepth;
    const sid = d.stateId;
    const secs = d.doc.sections;
    try {
      kind = command(rd, d, t, k, cur);
      if (kind.endsWith(' refused')) {
        const at = `seed ${seed} step ${k} (${kind}): `;
        assert.equal(d.undoDepth, depth, at + 'no undo step');
        assert.equal(d.stateId, sid, at + 'unchanged');
        assert.ok(d.doc.sections === secs || isDeepStrictEqual(
          d.doc.sections, secs), at + 'the same text');
      }
      if (every || k === STEPS - 1) {
        checkAll(d.doc);
        rows(d.doc);
      }
    } catch (e) {
      const at = `seed ${seed} step ${k} (${cur.name}): `;
      if (e instanceof Refused) {   // (nothing done)
        assert.equal(d.undoDepth, depth, at + 'refused: no step');
        assert.equal(d.stateId, sid, at + 'refused: unchanged');
        assert.ok(d.doc.sections === secs || isDeepStrictEqual(
          d.doc.sections, secs), at + 'refused: the same text');
        note('Refused');
        continue;
      }
      e.message = at + e.message;
      throw e;
    }
    note(kind);
  }
  d.markup = 'final';
  checkAll(d.doc);
  return {steps: k, capped: k < STEPS, counts};
}

export const KINDS = ['type', 'backspace/delete', 'delete selection',
  'accept', 'reject', 'all / by author', 'comment add',
  'comment reply', 'comment delete', 'copy/paste', 'cut/paste',
  'view',
  'tracking switched', 'next/previous', 'undo/redo', 'Refused'];

describe('tracked changes round trip: seeded bursts (generated ' +
  'documents)', () => {
  const total = {};
  // (a burst stops at BURST_MS: reported, not asserted, so a loaded
  // machine does not fail it; the corpus runs list theirs under
  // '# capped')
  const capped = [];
  let runs = 0;
  for (const [name, make] of DOCS) {
    it(name, async () => {
      const bytes = await make();
      for (let k = 0; k < 6; k++) {
        const res = await roundTrip(bytes, name, hash(name) + k,
          revBurst, {xsd: k === 0 ? xsd : null, every: true});
        runs++;
        if (res.capped) capped.push(`${name} seed ${hash(name) + k} ` +
          `(${res.steps} steps)`);
        for (const [c, n] of Object.entries(res.counts))
          total[c] = (total[c] || 0) + n;
      }
    });
  }
  it('every command ran and changed documents', () => {
    console.log('# tracked-change commands (generated): ' +
      JSON.stringify(total));
    console.log(`# bursts: ${runs} run, ${capped.length} cut short ` +
      `of ${STEPS} steps by the ${BURST_MS} ms cap` +
      (capped.length ? ': ' + capped.join('; ') : ''));
    for (const k of KINDS) assert.ok(total[k] > 0, k + ' ran');
  });
  it('schema check available', {skip: xsdNote || false}, () => {});
});

// --------------------------------------------- what the runs found

describe('tracked changes round trip: found by the runs (pinned)',
  () => {
    // a tracked deletion over text holding a comment's end and its
    // reference (the hand-off's tc-9) left the marks between two
    // pieces untagged: two w:del elements of one id around them. Marks
    // between deleted text are now deleted with it: one element
    it('a tracked deletion across a comment\'s end and reference is ' +
      'one deletion, the marks inside it; undo restores', async () => {
      const bytes = await pkg(p(r('Keep ') + range(0, r('the word')) +
        r(', and more.')), {comments: {0: 'on the word'}});
      const doc = await readDocx(bytes);
      const out0 = await write(doc);
      const d = new Document(doc);
      const t = typingOf(d);
      const b = paras(d.doc)[0];
      const a = b.text.indexOf('the'), z = b.text.indexOf(' and');
      t.command(() => deleteSelection(d, S.select({id: b.id, off: a},
        {id: b.id, off: z})));
      checkAll(d.doc);
      const es = list(d.doc);
      assert.deepEqual(es.map((e) => [e.kind, e.text]),
        [['del', 'the word,']]);
      const z1 = await readZip(await write(d.doc));
      const main = dec.decode(z1.get('word/document.xml'));
      assert.equal(main.split('<w:del ').length - 1, 1, 'one w:del');
      const inside = main.slice(main.indexOf('<w:del '),
        main.indexOf('</w:del>'));
      assert.ok(inside.includes('commentRangeEnd') &&
        inside.includes('commentReference'), 'the marks inside it');
      const back = await readDocx(await write(d.doc));
      assertSameDoc(back, expectedBack(d.doc), 'read back');
      d.undo();
      assert.ok(Buffer.from(await write(d.doc)).equals(Buffer.from(
        out0)), 'undone');
    });

    // marks alone at the edge of a deletion stay untagged, as before
    it('marks at the edge of a tracked deletion stay outside it',
      async () => {
        const bytes = await pkg(p(r('Keep ') + range(0, r('word')) +
          r(' more.')), {comments: {0: 'c'}});
        const d = new Document(await readDocx(bytes));
        const t = typingOf(d);
        const b = paras(d.doc)[0];
        const a = b.text.indexOf('word');
        const z = b.text.indexOf(' more');
        t.command(() => deleteSelection(d, S.select({id: b.id, off: a},
          {id: b.id, off: z})));
        const p0 = paras(d.doc)[0];
        const tagged = p0.runs.filter((u) => u.rev);
        assert.equal(tagged.length, 1);
        assert.equal(p0.text.slice(tagged[0].start, tagged[0].end)
          .replaceAll('￼', ''), 'word');
      });
  });

// ------------------------------------------------------------ hostile

/**
 * back (out read again) the same model as doc (true). Only with
 * dupIds (the hostile file of one id on several revisions, and no
 * other) is one difference allowed (false): a revision element doc
 * keeps raw because another revision has its id with other
 * attributes is read as a tagged revision once that other one is
 * gone (./RevRead's rule for duplicate ids reads the file as it is
 * now). Then every raw revision element of doc's body must be in
 * out as doc holds it (canonRev, in order), one fewer must be raw
 * in back, and saving back again writes the same revisions and
 * reads back the same.
 */
async function sameBack(back, doc, out, what, dupIds = false) {
  try {
    assertSameDoc(back, expectedBack(doc), what + ': read back');
    return true;
  } catch (e) {
    if (!dupIds) throw e;
    const out2 = await write(back);
    const main = doc.meta.mainPart;
    const a = revEls((await readZip(out)).get(main));
    let at = 0;
    for (const e of list(doc)) {
      if (e.rev || !e.node || e.where.story !== undefined) continue;
      const want = canonRev(e.node);
      while (at < a.length && a[at] !== want) at++;
      assert.ok(at < a.length, what + ': a raw revision not written ' +
        'as held: ' + want.slice(0, 200));
      at++;
    }
    assert.deepEqual(revEls((await readZip(out2)).get(main)), a,
      what + ': saved again, the revisions differ (' + e.message
        .split('\n')[0] + ')');
    assertSameDoc(await readDocx(out2), expectedBack(back), what +
      ': saved again, read back');
    const raw = (x) => list(x).filter((q) => !q.rev).length;
    assert.ok(raw(back) < raw(doc), what + ': ' + e.message);
    return false;
  }
}

/**
 * Open bytes, check the untouched round trip (pipeline), then every
 * command: Accept All and Reject All (each undone), next and
 * previous to the end in every view, the pane's rows, typing and
 * deleting with tracking on at each revision; save, read back and
 * paginate again, undo everything: nothing thrown, ModelCheck clean,
 * no package error added, the opened bytes back. Returns the times
 * (ms) and what was done.
 */
async function abuse(bytes, what, {all = true, untouched = true,
  dupIds = false} = {}) {
  const t0 = performance.now();
  if (untouched) await pipeline(bytes, what);
  const doc = await readDocx(bytes);
  const out0 = await write(doc);
  const t1 = performance.now();
  paginate(doc, 'all');
  const t2 = performance.now();
  const d = new Document(doc);
  d.clearHistory();
  const t = typingOf(d);
  const done = {};
  const note = (k) => { done[k] = (done[k] || 0) + 1; };
  const tryDo = (k, fn) => {
    const depth = d.undoDepth, sid = d.stateId;
    try {
      const res = fn();
      note(d.undoDepth > depth ? k : k + ' (nothing)');
      return res;
    } catch (e) {
      if (!(e instanceof Refused)) throw e;
      assert.equal(d.undoDepth, depth, what + ': ' + k + ' refused');
      assert.equal(d.stateId, sid, what + ': ' + k + ' refused');
      note(k + ' refused');
      return null;
    }
  };
  for (const fn of [acceptAll, rejectAll]) {
    const depth = d.undoDepth;
    tryDo(fn.name, () => fn(d, t));
    checkAll(d.doc);
    if (d.undoDepth > depth) d.undo();
  }
  for (const view of MODES) {
    let s = null, n = 0;
    for (const go of [next, prev]) {
      s = null;
      do {
        s = go(d, s || undefined, {view});
        n++;
      } while (s && n < 50000);
    }
    assert.ok(n < 50000, what + ': next/previous ends');
  }
  rows(d.doc);
  if (!RT.on(d) && d.doc.meta.settingsPart) {
    tryDo('switched on', () => RT.setTracking(d, t, true));
  }
  const es = editable(d.doc);
  for (const e of all ? es.slice(0, 50) : es.slice(0, 3)) {
    const live = list(d.doc).find((x) => x.id === e.id &&
      x.kind === e.kind && x.editable);
    const b = paraOf(d.doc, live);
    if (!b) continue;
    const mid = live.where.from + ((live.where.to - live.where.from) >>
      1);
    tryDo('typed', () => t.type(S.caret({id: b.id, off: mid}), 'x'));
    tryDo('backspace', () => t.command(() => deleteBack(d,
      S.caret({id: b.id, off: Math.min(mid + 1, b.text.length)}))));
    tryDo('accept', () => accept(d, t, S.caret({id: b.id,
      off: live.where.from})));
  }
  const ps = paras(d.doc).filter((b) => b.text.length);
  if (ps.length) {
    const b = ps[ps.length - 1];
    tryDo('typed at the end', () => t.type(S.caret({id: b.id,
      off: b.text.length}), ' end'));
    tryDo('deleted', () => t.command(() => deleteSelection(d,
      S.select({id: b.id, off: 0}, {id: b.id, off: Math.min(4,
        b.text.length)}))));
  }
  checkAll(d.doc);
  const t3 = performance.now();
  const out = await write(d.doc);
  const back = await readDocx(out);
  paginate(back);
  if (!await sameBack(back, d.doc, out, what, dupIds)) {
    note('re-read tagged');
  }
  const t4 = performance.now();
  const had = new Set(errsOf(await readZip(bytes)));
  assert.deepEqual(errsOf(await readZip(out)).filter((e) =>
    !had.has(e)), [], what + ': package errors added');
  assert.deepEqual(partsMisplaced(await readZip(out),
    await readZip(bytes)), [], what + ': text elements out of place');
  while (d.undo());
  assert.ok(Buffer.from(await write(d.doc)).equals(Buffer.from(out0)),
    what + ': undone, the opened bytes');
  return {read: t1 - t0, pages: t2 - t1, edit: t3 - t2,
    save: t4 - t3, done, d, back};
}

const MB = 'y'.repeat(1 << 20);
const FIELD = '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
  '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
  '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' + dRun('1') +
  '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
const PIC = '<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.' +
  'openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
  '<wp:extent cx="10" cy="10"/><wp:docPr w:id="1" name="p" ' +
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/' +
  'main"/></wp:inline></w:drawing></w:r>';

/** A package with footnotes (notes: {id: inner XML}). */
function withNotes(body, notes) {
  let inner = SEPS;
  for (const [id, x] of Object.entries(notes)) {
    inner += `<w:footnote w:id="${id}">${x}</w:footnote>`;
  }
  return buildDocx({'word/document.xml': documentXml(body),
    'word/settings.xml': settingsXml(TRACK),
    'word/footnotes.xml': '<?xml version="1.0" encoding="UTF-8" ' +
      'standalone="yes"?>\n<w:footnotes xmlns:w="http://schemas.' +
      'openxmlformats.org/wordprocessingml/2006/main">' + inner +
      '</w:footnotes>'},
  {docRels: [['rIdN1', 'http://schemas.openxmlformats.org/' +
    'officeDocument/2006/relationships/footnotes', 'footnotes.xml']]});
}

const HOSTILE = [
  ['an insertion inside a deletion, a deletion inside an insertion',
    () => pkg(p(r('a ') + el('del', 1, dRun('x ') + ins(2, 'nested'),
      'Bob') + r(' b ') + el('ins', 3, run('y ') + del(4, 'inner'))) +
    p(r('plain')))],
  ['a deletion holding a field, a footnote mark and a picture',
    () => withNotes(p(r('a ') + el('del', 1, FIELD) + r(' b ') +
      el('del', 2, '<w:r><w:footnoteReference w:id="1"/></w:r>') +
      r(' c ') + el('del', 3, PIC) + r(' d')) + p(r('after') +
      mark(2)), {1: noteP('one'), 2: noteP('two') +
      p(ins(9, 'in a note'))})],
  // (dupIds: a raw element of a clashing id is read tagged once the
  // clash is gone, ./RevRead; sameBack allows that and only that)
  ['one id on several revisions (same and different attributes)',
    () => pkg(p(ins(1, 'one') + r(' ') + ins(1, 'again') + r(' ') +
      del(1, 'del one', 'Bob') + r(' ') + ins(1, 'other date', 'Ann',
      '2020-01-01T00:00:00Z')) + p(del(5, 'x') + del(5, 'y'))),
    {dupIds: true}],
  ['no author, no date, neither', () => pkg(p(ins(1, 'no author',
    null) + r(' ') + del(2, 'no date', 'Ann', null) + r(' ') +
    ins(3, 'neither', null, null) + r(' end')))],
  ['malformed dates', () => pkg(p(ins(1, 'a', 'Ann', 'yesterday') +
    del(2, 'b', 'Ann', '2024-13-45T99:99:99Z') + ins(3, 'c', 'Ann',
      '') + ins(4, 'd', 'Ann', '2024-01-02')) + p(r('x')))],
  ['a revision across paragraphs and across table cells', () => pkg(
    p(r('a ') + ins(1, 'starts here')) + p(ins(1, 'goes on') +
      r(' b')) +
    tbl([tr([tc(p(ins(2, 'cell one'))), tc(p(ins(2, 'cell two')))]),
      tr([tc(p(del(3, 'row two'))), tc(p(del(3, 'row two b')))])]) +
    p(ins(2, 'after the table')))],
  ['moveFrom with no moveTo; moveTo with no range; crossed ranges',
    () => pkg(p(r('a ') + mvFrom(1, 'gone away')) +
      p(el('moveTo', 2, run('arrived'), 'Bob')) +
      p('<w:moveFromRangeStart w:id="7" w:name="m"/>' +
        el('moveFrom', 3, run('crossed'), 'Bob') +
        '<w:moveToRangeStart w:id="8" w:name="m"/>' +
        '<w:moveFromRangeEnd w:id="7"/>' +
        el('moveTo', 4, run('crossed'), 'Bob') +
        '<w:moveToRangeEnd w:id="8"/>'))],
  ['a 1 MB inserted text and a 1 MB deleted one', () => pkg(
    p(r('a ') + ins(1, MB)) + p(del(2, MB, 'Bob') + r(' b')))],
  ['unknown children and attributes on revisions', () => pkg(
    p(r('a ') + '<w:ins w:id="1" w:author="Ann" w:date="' + D +
      '" w:foo="bar" xmlns:x="urn:x" x:odd="1">' + run('odd attrs') +
      '</w:ins>' + r(' ') + '<w:del ' + att(2) + '><w:bogus/>' +
      dRun('with bogus') + '</w:del>' + r(' ') + '<w:ins ' + att(3) +
      '><w:r><w:rPr><w:b/></w:rPr><w:weird/><w:t>weird run</w:t>' +
      '</w:r></w:ins>' + r(' ') + '<w:ins ' + att(4) + '>' +
      '<x:thing xmlns:x="urn:x"><w:r><w:t>foreign</w:t></w:r>' +
      '</x:thing></w:ins>') + p(r('end')))],
  ['odd ids (negative, huge, not numbers, missing)', () => pkg(
    p(ins(-1, 'neg') + r(' ') + ins(2147483647, 'huge') + r(' ') +
      ins('x', 'nan') + r(' ') + '<w:del w:author="A" w:date="' + D +
      '">' + dRun('no id') + '</w:del>'))],
  ['revisions in a header and a footer, tracking on', () => withHeaders(
    p(r('Body ') + ins(1, 'body ins')), {default: {hdr: p(r('h ') +
      ins(2, 'hdr ins')), ftr: p(del(3, 'ftr del', 'Bob'))}})],
];

/** A document of n revisions, insertions and deletions in turn, ten a
 *  paragraph; authors in turn. */
function many(n) {
  let body = '', cur = '';
  for (let k = 0; k < n; k++) {
    const au = PEOPLE[k % 3];
    cur += r(' w' + k + ' ') + (k % 2 ? del(k, 'del' + k, au)
      : ins(k, 'ins' + k, au));
    if (k % 10 === 9) {
      body += p(cur);
      cur = '';
    }
  }
  return pkg(body + p(cur + r(' end.')));
}

/** Open bytes, paginate, Accept All and undo, type at a revision with
 *  tracking on, save, read back: the times (ms) and the document read
 *  back. */
async function timed(bytes) {
  const t0 = performance.now();
  const doc = await readDocx(bytes);
  const t1 = performance.now();
  paginate(doc);
  const t2 = performance.now();
  const d = new Document(doc);
  const t = typingOf(d);
  assert.ok(acceptAll(d, t).resolved > 0);
  d.undo();
  const e = editable(d.doc)[0];
  const b = paraOf(d.doc, e);
  t.type(S.caret({id: b.id, off: e.where.to}), 'typed');
  rows(d.doc);
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

describe('tracked changes round trip: hostile files never throw or ' +
  'hang, and round-trip untouched', () => {
  for (const [name, make, opts] of HOSTILE) {
    it(name, async () => {
      const res = await abuse(markBroken(await make(), 'hostile: ' + name), name, opts);
      console.log('# hostile ' + name + ': ' + JSON.stringify(
        res.done));
    });
  }

  it('the comparison catches a lost unknown child (strict unless ' +
    'dupIds; dupIds still asks for one raw element fewer)',
  async () => {
    const body = (kid) => p(r('a ') + '<w:del ' + att(2) + '>' + kid +
      dRun('with bogus') + '</w:del>' + r(' end'));
    const doc = await readDocx(await pkg(body('<w:bogus/>')));
    const lost = await pkg(body(''));
    const back = await readDocx(lost);
    await assert.rejects(sameBack(back, doc, lost, 'lost'),
      /read back/);
    await assert.rejects(sameBack(back, doc, lost, 'lost', true),
      /lost: a raw revision not written as held: .*w:bogus/);
    const same = await write(doc);
    assert.equal(await sameBack(await readDocx(same), doc, same,
      'kept'), true);
  });

  it('10,000 revisions: every command still works (the first 3)',
    async () => {
      const res = await abuse(await many(10000), '10,000 revisions',
        {all: false});
      assert.ok(list(res.back).length >= 10000, JSON.stringify(
        res.done));
    });

  it('10,000 revisions: linear (load-robust ratio; ceiling only ' +
    'under WORD_PERF=1)', async () => {
    const small = await many(1000);
    const big = await many(10000);
    // (a slower big run only raises the ratio: one run of it)
    const a = await bestOf(() => timed(small));
    const b = await bestOf(() => timed(big), 1);
    const fmt = (x) => ['read', 'pages', 'edit', 'save'].map((f) =>
      f + ' ' + x[f].toFixed(0)).join(', ');
    console.log('# 1,000 revisions: ' + fmt(a) + ' ms; 10,000: ' +
      fmt(b) + ' ms');
    if (process.env.WORD_PERF) {
      assert.ok(totalMs(b) < 60000, 'took ' + totalMs(b));
    } else {
      assert.ok(totalMs(b) < Math.max(totalMs(a), 10) * 30,
        'not linear: ' + (totalMs(b) / totalMs(a)).toFixed(1));
    }
  });
});
