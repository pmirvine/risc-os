// Comments round trip (Batch F1): the comment commands proved on
// generated documents and on every corpus file holding a comments
// part (git-ignored, optional).
//
//   - the pipeline: a file opened, laid out and paginated in Print
//     layout (the Doc deep-frozen first: drawing comments never
//     changes the model), then saved with no edit, writes every
//     comment part (comments, commentsExtended, commentsIds,
//     commentsExtensible, people) with the very XML tree it was read
//     with, and every comment mark element of the main part as read;
//   - the commands (add a range and a point comment, reply, resolve,
//     edit, delete) through roundtrip-lib's roundTrip: the model read
//     back equals the changed one, the package linter and xmllint/
//     wml.xsd (main part, and here the comments part too) add no
//     error, undo of everything gives the opened model and its
//     bytes;
//   - the consolidated ORACLE: the comment facts of the files read
//     from their XML alone (./comment-oracle.mjs factsOf) against
//     what !Letters reads (comments, replies, resolved), every
//     comment rewritten from its blocks and read back the same; the
//     values of the first measured run (WORD_EDIT_CORPUS=1,
//     2026-10-30) pinned;
//   - seeded 40-command bursts (add, reply, resolve and reopen,
//     edit, delete, delete the comments in a selection, type, delete
//     across marks, copy and paste, cut and paste, undo and redo)
//     over the generated documents and the corpus sample: ModelCheck
//     and the comment census at every step (no mark comes to name a
//     missing comment, no mark is doubled, no parent cycle), linter
//     and xsd at the end, undo of everything gives the opened bytes;
//   - hostile files (the spec's list) never throw or hang; 10,000
//     comments linear (load-robust ratio; an absolute ceiling only
//     under WORD_PERF=1); the pages-corpus pin is unchanged.
//
// The corpus is gated as the other round trips: one file in ten by a
// hash of its name, every file with WORD_EDIT_CORPUS=1 (which needs
// NODE_OPTIONS=--max-old-space-size=2048). The hand-off files
// (corpus/handoff, ./handoff-comments.mjs cm-*) are not corpus files
// here: ./comment-oracle.mjs commentFiles leaves them out.
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
import * as S from '../../tools/moreapps/!Letters/Selection';
import {addComment, editComment, replyTo, setResolved, deleteComment,
  deleteAllIn, commandWhy, whyNot}
  from '../../tools/moreapps/!Letters/CommentCmd';
import {paraMarks} from '../../tools/moreapps/!Letters/CommentMarks';
import {parentsOf} from '../../tools/moreapps/!Letters/CommentRead';
import {slice} from '../../tools/moreapps/!Letters/ClipSlice';
import {cutSelection, pasteBlocks}
  from '../../tools/moreapps/!Letters/ClipPaste';
import {deleteSelection} from '../../tools/moreapps/!Letters/EditDel';
import {checkBlock, checkNotes, checkComments}
  from '../../tools/moreapps/!Letters/ModelCheck';
import {scan} from '../../tools/moreapps/!Letters/Walk';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {buildDocx, documentXml, p, r, REL, W_NS, R_NS}
  from './build-docx.mjs';
import {commentBytes, range, cs, ce, cr} from './comment-fixtures.mjs';
import {tbl, tr, tc} from './tbl-fixtures.mjs';
import {freeze} from './story-fixtures.mjs';
import {lintPackage} from './lint-package.mjs';
import {roundTrip, schema, hash, corpusFiles, corpusRun, nameOf, ALL,
  SKIP_CORPUS, write, extKey} from './roundtrip-lib.mjs';
import {sameTree} from './docx-compare.mjs';
import {commentFiles, factsOf, sumFacts} from './comment-oracle.mjs';
import {rng, tm, loadStyles} from './word-docs.mjs';

before(loadStyles);
export const STEPS = 40;
const BURST_MS = 4000;
const pick = (rd, a) => a[Math.floor(rd() * a.length)];
const dec = new TextDecoder();
const {xsd, note: xsdNote} = schema();
const WHEN = new Date(2026, 9, 30, 9, 0);
const ANN = {author: 'Ann Example', initials: 'AE', date: WHEN};
const BOB = {author: 'Bob', initials: 'B', date: WHEN};
const PEOPLE = [ANN, BOB, {author: 'Zo\u00eb \u4e2d',
  initials: 'Z\u00d6', date: WHEN}];

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

/** The comment marks of the body in order: [{b, kind, id, off}]. */
function bodyMarks(doc) {
  const out = [];
  for (const b of paras(doc)) {
    for (const m of paraMarks(b)) out.push({b, ...m});
  }
  return out;
}

/** The comment ids of the Doc ([] with no comments). */
const idsOf = (doc) => (doc.comments && doc.comments.map instanceof Map
  ? [...doc.comments.map.keys()] : []);

/**
 * The comment census of the body: dangling (ids a mark names with
 * no comment), doubled (ids with two marks of one kind), noRef (ids
 * with a range but no reference), cycle (a parent cycle: boolean).
 */
function census(doc) {
  const ids = new Set(idsOf(doc));
  const seen = new Map();
  const dangling = new Set(), doubled = new Set(), noRef = new Set();
  for (const m of bodyMarks(doc)) {
    if (!ids.has(m.id)) dangling.add(m.id);
    if (!seen.has(m.id)) seen.set(m.id, new Set());
    const ks = seen.get(m.id);
    if (ks.has(m.kind)) doubled.add(m.id);
    ks.add(m.kind);
  }
  for (const [id, ks] of seen) if (!ks.has('cmtRef')) noRef.add(id);
  let cycle = false;
  if (doc.comments) {
    const ps = parentsOf(doc);
    for (const id of ps.keys()) {
      let x = id;
      for (let k = 0; k <= ps.size + 1 && ps.has(x); k++) x = ps.get(x);
      if (ps.has(x)) cycle = true;
    }
  }
  return {dangling, doubled, noRef, cycle};
}

/** Every id of a in b (new ones listed). */
const added = (now, was) => [...now].filter((x) => !was.has(x));

/** The census of doc no worse than c0 (see census). */
function sameCensus(doc, c0, what) {
  const c = census(doc);
  assert.deepEqual(added(c.dangling, c0.dangling), [], what +
    ': a mark names a missing comment');
  assert.deepEqual(added(c.doubled, c0.doubled), [], what +
    ': a mark doubled');
  assert.ok(!c.cycle || c0.cycle, what + ': a parent cycle');
  return c;
}

/** doc laid out and paginated as Print layout does. */
function paginate(doc) {
  const L = new DocLayout(doc, tm());
  L.layout(800);
  return new Pages(printGalley(L)).finish();
}

/** The package lint's errors. */
const errsOf = (z) => lintPackage(z).problems
  .filter((q) => q.level === 'error')
  .map((q) => q.rule + ' ' + q.part + ' ' + q.detail);

/** xmllint's messages for a comments part, the Microsoft extension
 *  attributes and markup compatibility passed over. */
const cmXsd = (bytes) => new Set([...xsd.errors(bytes)].filter((m) =>
  !extKey(m) && !m.includes('markup-compatibility')));

/** The comments part's schema errors in doc's write the opened
 *  write (was: its zip) did not have ([] when not checked). */
async function commentSchema(doc, was) {
  const n = doc.meta && doc.meta.commentParts &&
    doc.meta.commentParts.comments;
  if (!xsd || !n || doc.meta.conformance === 'strict') return [];
  const z = await readZip(await write(doc));
  if (!z.get(n)) return [];
  const had = was.get(n) ? cmXsd(was.get(n)) : new Set();
  return [...cmXsd(z.get(n))].filter((e) => !had.has(e))
    .map((e) => n + ': ' + e);
}

/** Every comment mark element of an XML part, in order, as text. */
function markEls(bytes) {
  if (!bytes) return [];
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    const name = String(n.name || '');
    if (/(^|:)(commentRangeStart|commentRangeEnd|commentReference)$/
      .test(name)) out.push(JSON.stringify([name, n.attrs]));
    for (const c of n.children || []) walk(c);
  };
  walk(parseXml(dec.decode(bytes).replace(/^\ufeff/, '')).root);
  return out;
}
const xmlOf = (b) => parseXml(dec.decode(b).replace(/^\ufeff/, ''));

/** pasteBlocks' options for slice s. */
const optsOf = (s, sameDoc) => ({sameDoc, styleNames: s.styleNames,
  styles: s.styles, lists: s.lists, pics: s.pics,
  picScope: s.picScope, notes: s.notes, comments: s.comments});

// ----------------------------------------------------------- documents

const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const W15 = 'http://schemas.microsoft.com/office/word/2012/wordml';
const EXT_REL = 'http://schemas.microsoft.com/office/2011/' +
  'relationships/commentsExtended';
const DECL = '<?xml version="1.0" encoding="UTF-8" ' +
  'standalone="yes"?>\n';
const LOREM = 'The quick brown fox jumps over the lazy dog. ';

/** A comments.xml of the given w:comment elements. */
const cmXml = (inner) => DECL + `<w:comments xmlns:w="${W_NS}" ` +
  `xmlns:r="${R_NS}" xmlns:w14="${W14}">${inner}</w:comments>`;
/** A commentsExtended.xml of the given w15:commentEx elements. */
const exXml = (inner) => DECL + `<w15:commentsEx xmlns:w15="${W15}">` +
  `${inner}</w15:commentsEx>`;
const cEx = (para, parent, done = 0) => `<w15:commentEx ` +
  `w15:paraId="${para}"${parent ? ` w15:paraIdParent="${parent}"`
    : ''} w15:done="${done}"/>`;
/** A w:comment of id, its one paragraph's w14:paraId and runs. */
const cmt = (id, para, inner, author = 'Ann') => `<w:comment ` +
  `w:id="${id}" w:author="${author}" w:initials="A">` +
  `<w:p w14:paraId="${para}">${inner}</w:p></w:comment>`;

/** A .docx of body with comments.xml (and commentsExtended) given as
 *  text. */
function raw(body, comments, extended = null, more = {}) {
  const parts = {'word/document.xml': documentXml(body),
    'word/comments.xml': comments, ...more};
  const docRels = [['rIdC1', REL('comments'), 'comments.xml']];
  if (extended !== null) {
    parts['word/commentsExtended.xml'] = extended;
    docRels.push(['rIdC2', EXT_REL, 'commentsExtended.xml']);
  }
  return buildDocx(parts, {docRels});
}

/** A thread (a comment and a reply), a resolved one, a point one. */
const threads = () => commentBytes(
  p(r('One ') + cs(0) + cs(1) + r('two three') + ce(1) + ce(0) + cr(0) +
    cr(1) + r(' four.')) +
  p(r('Five ') + range(2, r('six')) + r(' seven.')) +
  p(r('A point') + cs(3) + ce(3) + cr(3) + r(' here.')) +
  p(r(LOREM + LOREM)),
  {0: 'zero', 1: {text: 'a reply', author: 'Bob', parent: 0},
    2: {text: 'done', done: true}, 3: 'point'});

/** Ranges across paragraphs, inside a cell, round a whole table. */
const spans = () => commentBytes(
  p(r('Alpha ') + cs(0) + r('beta')) + p(r('gamma') + ce(0) + cr(0)) +
  tbl([tr([tc(p(r('in ') + range(1, r('a cell')))),
    tc(p(cs(2) + r('from a cell')))]), tr([tc(p(r('down') + ce(2) +
    cr(2))), tc(p(r('x')))])]) +
  p(cs(3) + r('Before the table.')) +
  tbl([tr([tc(p(r('one'))), tc(p(r('two')))])]) +
  p(r('After it.') + ce(3) + cr(3)) + p(r(LOREM)),
  {0: 'across', 1: 'cell', 2: 'rows', 3: 'table'});

/** A plain document: no comments part at all. */
const plainDoc = () => buildDocx({'word/document.xml': documentXml(
  p(r('Plain text, ' + LOREM)) + p(r('Another paragraph.')) +
  tbl([tr([tc(p(r('cell'))), tc(p(r('more')))])]) + p(r('End.')))});

/** A formatted comment (bold, a link) and a two-paragraph one. */
const formatted = () => raw(
  p(r('Some ') + range(0, r('bold')) + r(' and ') +
    range(1, r('two lines')) + r('.')) + p(r(LOREM)),
  cmXml(cmt(0, '00000001', '<w:r><w:rPr><w:b/></w:rPr><w:t>bold ' +
    'note</w:t></w:r><w:hyperlink w:anchor="x"><w:r><w:t>link</w:t>' +
    '</w:r></w:hyperlink>') +
    '<w:comment w:id="1" w:author="Bob" w:initials="B"><w:p ' +
    'w14:paraId="00000002"><w:r><w:t>line one</w:t></w:r></w:p><w:p ' +
    'w14:paraId="00000003"><w:r><w:t>line two</w:t></w:r></w:p>' +
    '</w:comment>'),
  exXml(cEx('00000001', null) + cEx('00000003', null, 1)));

/** Every generated document: [name, () => Promise<bytes>]. */
export const DOCS = [
  ['a thread, a resolved comment, a point comment', threads],
  ['ranges across paragraphs, rows and a table', spans],
  ['a plain document (no comments part)', plainDoc],
  ['a formatted and a two-paragraph comment', formatted],
];

// ------------------------------------------------------------ pipeline

/**
 * Open bytes, freeze the Doc, lay it out and paginate it, save it:
 * every comment part with the XML tree it was read with (and its
 * bytes), every comment mark element of the main part as read.
 * Returns {parts, marks}.
 */
async function pipeline(bytes, what) {
  const doc = await readDocx(bytes);
  freeze(doc);
  const P = paginate(doc);
  assert.ok(P.done && P.count >= 1, what + ': paginated');
  const out = await write(doc);
  const z = await readZip(out), zin = await readZip(bytes);
  let parts = 0;
  for (const n of Object.values(doc.meta.commentParts || {})) {
    if (typeof n !== 'string' || !zin.get(n)) continue;
    assert.ok(z.get(n), what + ': ' + n + ' written');
    sameTree(xmlOf(z.get(n)), xmlOf(zin.get(n)), what + ': ' + n +
      ' tree');
    assert.ok(Buffer.from(z.get(n)).equals(Buffer.from(zin.get(n))),
      what + ': ' + n + ' bytes');
    parts++;
  }
  const main = doc.meta.mainPart;
  const a = markEls(zin.get(main));
  assert.deepEqual(markEls(z.get(main)), a, what + ': the marks');
  return {parts, marks: a.length};
}

describe('comments round trip: the pipeline (open, lay out, ' +
  'paginate, save, no edit)', () => {
  for (const [name, make] of DOCS) {
    it(name, async () => {
      const res = await pipeline(await make(), name);
      assert.ok(res.parts > 0 || name.startsWith('a plain'));
    });
  }
});

// ------------------------------------------------------------ story

/** The first commentable stretch: a caret-free range of a word in
 *  the first body paragraph with text, or null. */
function wordSel(d) {
  for (const b of paras(d.doc)) {
    const m = /[A-Za-z]{2,}/.exec(b.text);
    if (!m) continue;
    const sel = S.select({id: b.id, off: m.index}, {id: b.id,
      off: m.index + m[0].length});
    if (!whyNot(d, sel)) return sel;
  }
  return null;
}

/**
 * The commands once each, in a set order, on d: add a range comment
 * and a point comment, reply to the first comment that takes one,
 * resolve it, edit ours and a read one, delete ours and a read one.
 * counts: the commands that changed the document, and the refusals
 * by reason (./CommentCmd commandWhy).
 */
export async function commentStory(d) {
  const was = await readZip(await write(d.doc));
  const t = new Typing(d, {now: () => 0});
  const counts = {};
  const did = (k, ok) => {
    counts[ok ? k : k + ' refused'] = (counts[ok ? k : k + ' refused']
      || 0) + 1;
    checkAll(d.doc);
  };
  const why = (id, cmd) => {
    const w = commandWhy(d, id, cmd);
    if (w) counts['why: ' + w] = (counts['why: ' + w] || 0) + 1;
  };
  const read = idsOf(d.doc);
  const sel = wordSel(d);
  const a = sel ? addComment(d, t, sel, {text: 'Ours', ...ANN}) : null;
  did('add', !!(a && a.id !== undefined));
  const ps = paras(d.doc).filter((b) => b.text.length);
  const last = ps[ps.length - 1];
  const pt = last ? addComment(d, t, S.caret({id: last.id,
    off: last.text.length}), {text: 'A point', ...BOB}) : null;
  did('add point', !!(pt && pt.id !== undefined));
  const target = read.find((id) => !commandWhy(d, id, 'reply'));
  if (target === undefined) for (const id of read) why(id, 'reply');
  const rp = target !== undefined ? replyTo(d, t, target,
    {text: 'A reply', ...BOB}) : null;
  did('reply', !!(rp && rp.id !== undefined));
  did('resolve', target !== undefined && !!setResolved(d, t, target,
    true));
  if (a && a.id !== undefined) {
    did('edit ours', editComment(d, t, a.id, {text: 'Ours\nedited'}) ===
      true);
  }
  const ed = read.find((id) => !commandWhy(d, id, 'edit'));
  if (ed !== undefined) {
    const res = editComment(d, t, ed, {text: 'Read, edited'});
    if (res && res.lossy) counts.lossy = (counts.lossy || 0) + 1;
    did('edit read', editComment(d, t, ed, {text: 'Read, edited',
      confirmed: true}) === true);
  }
  if (pt && pt.id !== undefined) {
    did('delete ours', deleteComment(d, t, pt.id) === true);
  }
  const del = read.filter((id) => id !== target && id !== ed &&
    d.doc.comments.map.has(id)).find((id) => !commandWhy(d, id,
    'delete'));
  if (del !== undefined) {
    did('delete read', deleteComment(d, t, del) === true);
  }
  const extra = await commentSchema(d.doc, was);
  assert.deepEqual(extra.slice(0, 5), [], 'comments part: schema ' +
    'errors added');
  return {counts};
}

describe('comments round trip: the commands (generated)', () => {
  for (const [name, make] of DOCS) {
    it(name + ': added, answered, resolved, edited, deleted; saved, ' +
      'read back, linted, undone', async () => {
      const res = await roundTrip(await make(), name, hash(name),
        commentStory, {xsd});
      assert.ok(!res.refused);
      assert.ok(res.counts.add && res.counts['add point'],
        JSON.stringify(res.counts));
      if (!name.startsWith('a plain')) {
        assert.ok(res.counts.reply && res.counts.resolve &&
          res.counts['edit read'], JSON.stringify(res.counts));
      }
    });
  }

  it('the formatted comment asks first (lossy), then is edited',
    async () => {
      const doc = await readDocx(await formatted());
      const d = new Document(doc);
      const t = new Typing(d);
      const depth = d.undoDepth;
      assert.deepEqual(editComment(d, t, 0, {text: 'plain'}),
        {lossy: true});
      assert.equal(d.undoDepth, depth);
      assert.equal(editComment(d, t, 0, {text: 'plain',
        confirmed: true}), true);
      const back = await readDocx(await write(d.doc));
      assert.equal(back.comments.map.get(0).blocks[0].text
        .replace(/\ufffc/g, ''), 'plain');
    });
});

// ------------------------------------------------------------ corpus

const files = corpusFiles();
const HAVE = files.length > 0;

let cmList = null;
/** The corpus files (of the sample) with a comments part. */
const cmFiles = async () => cmList || (cmList = (await commentFiles())
  .map((f) => f.path));

describe('comments round trip: the corpus', {
  skip: HAVE ? false : SKIP_CORPUS,
}, () => {
  it('the corpus has files with comments (not a pass on nothing)',
    async () => {
      assert.ok((await cmFiles()).length > 0, 'no comment files');
    });

  it('open, lay out, paginate, save (no edit): every comment part ' +
    'tree-identical, every mark as read', async () => {
    const list = await cmFiles();
    let n = 0, parts = 0, ms = 0;
    const fails = [];
    for (const f of list) {
      const name = nameOf(f);
      try {
        const res = await pipeline(readFileSync(f), name);
        n++;
        parts += res.parts;
        ms += res.marks;
      } catch (e) {
        if (!(e instanceof DocxError)) fails.push(name + ': ' +
          String(e.message).split('\n').slice(0, 3).join(' | ')
            .slice(0, 300));
      }
    }
    console.log(`# comments pipeline${ALL ? '' : ' (sample)'}: ` +
      `${list.length} files with comments, ${n} compared (${parts} ` +
      `comment parts as read, ${ms} marks as read), ${fails.length} ` +
      'failures');
    for (const x of fails) console.log('# FAIL ' + x);
    assert.deepEqual(fails, []);
    if (ALL) assert.equal(n, 92);
  });

  it('the commands on every file with comments: saved, read back, ' +
    'linted, undone', async () => {
    const list = await cmFiles();
    await corpusRun(list, commentStory, xsd, xsdNote,
      'comment commands (files with comments)');
  });

  it(`${STEPS} comment commands in the files with comments and one ` +
    'in ten of the others; undo restores', async () => {
    const list = await cmFiles();
    const sample = files.filter((f) => hash(nameOf(f) + ' cm') % 10 ===
      0 && !list.includes(f) && !/^handoff\//.test(nameOf(f)));
    await corpusRun([...list, ...sample], commentsAll, xsd, xsdNote,
      'comment bursts (corpus)');
  });
});

// ------------------------------------------------------------ oracle

// (WORD_EDIT_CORPUS=1, 2026-10-30; the hand-off files left out:
// comment-oracle commentFiles). oracle: read from the XML alone;
// read: what !Letters models (Comment040 holds two comments with id 0:
// the second kept raw, its reply read as top level)
const MEASURED = {
  oracle: {files: 92, comments: 1107, replies: 415, resolved: 82,
    multiPara: 29, inTable: 62, opaque: 0, orphans: 9, dangling: 2},
  read: {files: 92, comments: 1106, replies: 414, resolved: 82,
    rewritten: 1106, errors: 0},
};

describe('comments: the consolidated oracle (the XML against what ' +
  '!Letters reads)', {skip: HAVE ? false : SKIP_CORPUS}, () => {
  it('files, comments, replies, resolved, rewritten, errors',
    async () => {
      const list = await commentFiles();
      const facts = [];
      const got = {files: 0, comments: 0, replies: 0, resolved: 0,
        rewritten: 0, errors: 0};
      const errs = [];
      for (const {file, path} of list) {
        const bytes = readFileSync(path);
        facts.push(await factsOf(bytes));
        let doc;
        try {
          doc = await readDocx(bytes);
        } catch (e) {
          got.errors++;
          errs.push(file + ': ' + e.message.slice(0, 200));
          continue;
        }
        got.files++;
        const cs = doc.comments;
        for (const c of cs.map.values()) {
          got.comments++;
          if (c.parent !== null) got.replies++;
          if (c.done) got.resolved++;
        }
        // every comment rewritten from its blocks reads back the same
        const map = new Map([...cs.map].map(([id, c]) =>
          [id, {...c, node: null}]));
        let back;
        try {
          back = (await readDocx(await write({...doc, comments: {...cs,
            map}}))).comments;
        } catch (e) {
          got.errors++;
          errs.push(file + ': rewritten: ' + e.message.slice(0, 200));
          continue;
        }
        const text = (c) => c.blocks.map((b) => b.text).join('\n');
        for (const [id, c] of cs.map) {
          const b = back.map.get(id);
          if (b && text(b) === text(c) && b.author === c.author &&
            b.initials === c.initials && b.date === c.date &&
            b.paraId === c.paraId && b.parent === c.parent &&
            b.done === c.done) got.rewritten++;
          else {
            errs.push(file + ': comment ' + id + ' rewritten differs');
          }
        }
      }
      got.errors += errs.filter((x) => /differs/.test(x)).length;
      const o = sumFacts(facts);
      const oracle = {files: o.files, comments: o.comments || 0,
        replies: o.replies || 0, resolved: o.resolved || 0,
        multiPara: o.multiPara || 0, inTable: o.inTable || 0,
        opaque: o.opaque || 0, orphans: o.orphans || 0,
        dangling: o.dangling || 0};
      console.log('# ORACLE' + (ALL ? '' : ' (sample; ' +
        'WORD_EDIT_CORPUS=1 for all)') + ': files | comments | ' +
        'replies | resolved | multi-paragraph | in tables | opaque | ' +
        'orphans | dangling');
      console.log('# ORACLE xml | ' +
        Object.values(oracle).join(' | '));
      console.log('# ORACLE read: files | comments | replies | ' +
        'resolved | rewritten | errors');
      console.log('# ORACLE read | ' + Object.values(got).join(' | '));
      for (const x of errs) console.log('# ERROR ' + x);
      assert.deepEqual(errs, []);
      // (the model may hold one fewer only where the XML has a
      // duplicate id: never more)
      assert.ok(got.comments <= oracle.comments);
      assert.equal(got.rewritten, got.comments);
      assert.equal(got.resolved, oracle.resolved);
      if (!ALL) return;
      assert.deepEqual(oracle, MEASURED.oracle);
      assert.deepEqual(got, MEASURED.read);
    });
});

describe('comments: the pages-corpus pin', () => {
  it('is unchanged (328 of 1387)', () => {
    const pin = JSON.parse(readFileSync(new URL(
      './corpus-expected.json', import.meta.url), 'utf8')).pageStarts;
    // (325 -> 328 in Batch F1 Task 3: a comment reference draws
    // nothing)
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

/** A selection round comment id's marks (its first to just after its
 *  last), or null. */
function aroundSel(doc, id) {
  const ms = bodyMarks(doc).filter((m) => m.id === id);
  if (!ms.length) return null;
  const a = ms[0], z = ms[ms.length - 1];
  return S.select({id: a.b.id, off: a.off}, {id: z.b.id,
    off: z.off + 1});
}

/** A selection from a little before a random mark to a little after
 *  it (delete across marks), or null. */
function acrossSel(rd, doc) {
  const ms = bodyMarks(doc);
  if (!ms.length) return null;
  const m = pick(rd, ms);
  const lo = Math.max(0, m.off - Math.floor(rd() * 4));
  const hi = Math.min(m.b.text.length, m.off + 1 +
    Math.floor(rd() * 4));
  return S.select({id: m.b.id, off: lo}, {id: m.b.id, off: hi});
}

const TEXTS = ['Note', 'A longer remark\nover two lines', 'tab\there',
  '<&>"\'', 'Zo\u00eb \ud83d\ude00'];

/** One random command: its name ('... refused' when nothing
 *  changed). */
function command(rd, d, t, k) {
  const x = rd();
  const did = (name, ok) => (ok ? name : name + ' refused');
  const ids = idsOf(d.doc);
  const who = pick(rd, PEOPLE);
  if (x < 0.1) {
    let n = 1 + Math.floor(rd() * 6);
    while (n-- > 0 && d.undo());
    let m = Math.floor(rd() * 4);
    while (m-- > 0 && d.redo());
    return 'undo/redo';
  }
  if (x < 0.24) {
    const sel = randSel(rd, d.doc);
    if (!sel) return 'none';
    const res = addComment(d, t, sel, {text: pick(rd, TEXTS) + ' ' + k,
      ...who});
    return did('add', !!(res && res.id !== undefined));
  }
  if (!ids.length && x < 0.6) return 'none';
  if (x < 0.34) {
    const res = replyTo(d, t, pick(rd, ids), {text: 'reply ' + k,
      ...who});
    return did('reply', !!(res && res.id !== undefined));
  }
  if (x < 0.42) {
    const had = d.undoDepth;
    const ok = setResolved(d, t, pick(rd, ids), rd() < 0.6);
    return did('resolve/reopen', !!ok && d.undoDepth > had);
  }
  if (x < 0.5) {
    const had = d.undoDepth;
    const res = editComment(d, t, pick(rd, ids), {text:
      pick(rd, TEXTS) + ' edited ' + k, confirmed: rd() < 0.7});
    return did('edit', res === true && d.undoDepth > had);
  }
  if (x < 0.56) {
    return did('delete', deleteComment(d, t, pick(rd, ids)) === true);
  }
  if (x < 0.6) {
    const sel = rd() < 0.5 ? aroundSel(d.doc, pick(rd, ids))
      : randSel(rd, d.doc);
    return did('delete all in', !!sel && deleteAllIn(d, t, sel) > 0);
  }
  if (x < 0.7) {
    const sel = acrossSel(rd, d.doc);
    if (!sel) return 'none';
    const had = d.undoDepth;
    deleteSelection(d, sel);
    return did('delete across marks', d.undoDepth > had);
  }
  if (x < 0.82) {
    const sel = ids.length && rd() < 0.6 ? aroundSel(d.doc,
      pick(rd, ids)) : randSel(rd, d.doc);
    if (!sel || S.collapsed(sel)) return 'none';
    const had = d.undoDepth;
    const cut = rd() < 0.5;
    const s = cut ? cutSelection(d, sel).slice : slice(d.doc, sel);
    if (!s) return 'none';
    const to = randSel(rd, d.doc);
    if (to) pasteBlocks(d, to, s.blocks, optsOf(s, true));
    return did(cut ? 'cut/paste' : 'copy/paste', d.undoDepth > had);
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
export async function commentsAll(d, seed, {every = false} = {}) {
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
        sameCensus(d.doc, c0, kind);
      }
    } catch (e) {
      e.message = `seed ${seed} step ${k} (${kind}): ${e.message}`;
      throw e;
    }
    counts[kind] = (counts[kind] || 0) + 1;
  }
  checkAll(d.doc);
  sameCensus(d.doc, c0, 'the end');
  const extra = await commentSchema(d.doc, was);
  assert.deepEqual(extra.slice(0, 5), [], 'comments part: schema ' +
    'errors added (seed ' + seed + ')');
  return {steps: k, capped: k < STEPS, counts};
}

export const KINDS = ['add', 'reply', 'resolve/reopen', 'edit',
  'delete', 'delete all in', 'delete across marks', 'copy/paste',
  'cut/paste', 'type', 'undo/redo'];

describe('comments round trip: seeded bursts (generated documents)',
  () => {
    const total = {};
    for (const [name, make] of DOCS) {
      it(name, async () => {
        const bytes = await make();
        for (let k = 0; k < 4; k++) {
          const res = await roundTrip(bytes, name, hash(name) + k,
            commentsAll, {xsd: k === 0 ? xsd : null, every: true});
          for (const [c, n] of Object.entries(res.counts))
            total[c] = (total[c] || 0) + n;
        }
      });
    }
    it('every command ran and changed documents', () => {
      console.log('# comment commands (generated): ' +
        JSON.stringify(total));
      for (const k of KINDS) assert.ok(total[k] > 0, k + ' ran');
    });
    it('schema check available', {skip: xsdNote || false}, () => {});
  });

// ----------------------------------------------- what the bursts found

describe('comments round trip: found by the bursts (pinned)', () => {
  // a step that took a parent's every mark but left a reply's
  // reference removed the reply (a reply goes with its parent,
  // ./CommentKeep) and left that reference naming no comment: now
  // the reply's marks go in the same step
  it('a deletion taking a parent\'s marks but not its reply\'s ' +
    'reference: the reply and that reference go too; undo brings ' +
    'all back', async () => {
    // a0 s0@1 s1@2 b3 c4 e1@5 e0@6 r0@7 r1@8 d9
    const bytes = await commentBytes(p(r('a') + cs(0) + cs(1) +
      r('bc') + ce(1) + ce(0) + cr(0) + cr(1) + r('d')),
    {0: 'one', 1: {text: 'two', author: 'Bob', parent: 0}});
    for (const how of ['delete', 'cut']) {
      const d = new Document(await readDocx(bytes));
      const b = paras(d.doc)[0];
      const sel = S.select({id: b.id, off: 1}, {id: b.id, off: 8});
      if (how === 'cut') cutSelection(d, sel);
      else deleteSelection(d, sel);
      assert.deepEqual(idsOf(d.doc), [], how + ': both gone');
      assert.deepEqual(bodyMarks(d.doc), [], how + ': no mark left');
      assert.equal(paras(d.doc)[0].text, 'ad');
      assert.equal(d.undoDepth, 1, how + ': one step');
      checkAll(d.doc);
      const back = await readDocx(await write(d.doc));
      assert.deepEqual(bodyMarks(back), []);
      d.undo();
      assert.deepEqual(idsOf(d.doc), [0, 1], how + ': undone');
      assert.deepEqual(bodyMarks(d.doc).map((m) => [m.kind, m.id]),
        [['cmtStart', 0], ['cmtStart', 1], ['cmtEnd', 1],
          ['cmtEnd', 0], ['cmtRef', 0], ['cmtRef', 1]]);
      d.redo();
      assert.deepEqual(bodyMarks(d.doc), [], how + ': redone');
    }
  });
});

// ------------------------------------------------------------ hostile

/**
 * Open bytes, lay out and paginate, then every command on every
 * comment (reply, resolve, edit, delete), a comment added, the
 * comments of the whole body deleted and undone, a copy and a cut
 * pasted; save, read back and paginate again, undo everything:
 * nothing thrown, ModelCheck clean, no package error added, the
 * opened bytes back. Returns the times (ms) and what was done.
 */
async function abuse(bytes, what, {all = true} = {}) {
  const t0 = performance.now();
  const doc = await readDocx(bytes);
  const out0 = await write(doc);
  const t1 = performance.now();
  paginate(doc);
  const t2 = performance.now();
  const d = new Document(doc);
  d.clearHistory();
  const t = new Typing(d, {now: () => 0});
  const done = {};
  const note = (k, ok) => {
    done[ok ? k : k + ' refused'] = (done[ok ? k : k + ' refused'] ||
      0) + 1;
  };
  const ids = idsOf(d.doc);
  for (const id of all ? ids : ids.slice(0, 3)) {
    const rp = replyTo(d, t, id, {text: 'reply', ...BOB});
    note('reply', !!(rp && rp.id !== undefined));
    note('resolve', !!setResolved(d, t, id, true));
    note('reopen', !!setResolved(d, t, id, false));
    note('edit', editComment(d, t, id, {text: 'edited',
      confirmed: true}) === true);
  }
  const ps = paras(d.doc);
  const first = ps.find((b) => b.text.length);
  if (first) {
    const a = addComment(d, t, S.select({id: first.id, off: 0},
      {id: first.id, off: first.text.length}), {text: 'new', ...ANN});
    note('add', !!(a && a.id !== undefined));
  }
  const all0 = paras(d.doc);
  if (all0.length) {
    const z = all0[all0.length - 1];
    const sel = S.select({id: all0[0].id, off: 0}, {id: z.id,
      off: z.text.length});
    const s = slice(d.doc, sel);
    if (s) {
      const had = d.undoDepth;
      pasteBlocks(d, S.caret({id: z.id, off: z.text.length}), s.blocks,
        optsOf(s, true));
      note('copy/paste', d.undoDepth > had);
    }
    const n = deleteAllIn(d, t, sel);
    note('delete all in', n > 0);
    if (n > 0) d.undo();
  }
  for (const id of (all ? ids : ids.slice(0, 3)).slice(0, 50)) {
    if (d.doc.comments && d.doc.comments.map.has(id)) {
      note('delete', deleteComment(d, t, id) === true);
    }
  }
  const all1 = paras(d.doc).filter((b) => b.text.length);
  if (all1.length > 1) {
    const b = all1[0];
    const cut = cutSelection(d, S.select({id: b.id, off: 0},
      {id: b.id, off: b.text.length}));
    if (cut.slice) {
      const z = paras(d.doc).pop();
      pasteBlocks(d, S.caret({id: z.id, off: z.text.length}),
        cut.slice.blocks, optsOf(cut.slice, true));
      note('cut/paste', true);
    }
  }
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

const MB = 'x'.repeat(1 << 20);
const plainCm = (ids) => cmXml(ids.map((id) => cmt(id,
  (Number(id) + 1).toString(16).toUpperCase().padStart(8, '0'),
  `<w:r><w:t>c${id}</w:t></w:r>`)).join(''));

const HOSTILE = [
  ['a reference with no comment; a comment with no marks', () => raw(
    p(r('a') + range(5, r('dangling')) + r('b')) + p(range(0, r('ok'))),
    plainCm([0, 9]))],
  ['two comments with one id', () => raw(
    p(range(0, r('one')) + r(' ') + range(1, r('two'))),
    cmXml(cmt(0, '00000001', r('first')) + cmt(0, '00000002',
      r('second')) + cmt(1, '00000003', r('third'))),
    exXml(cEx('00000001', null) + cEx('00000002', '00000001') +
      cEx('00000003', '00000002')))],
  ['a reply naming a missing parent, one naming itself, a cycle',
    () => raw(p(range(0, r('a')) + range(1, r('b')) + range(2, r('c')) +
      range(3, r('d'))), plainCm([0, 1, 2, 3]),
    exXml(cEx('00000001', 'ABCDEF01') + cEx('00000002', '00000002') +
      cEx('00000003', '00000004') + cEx('00000004', '00000003')))],
  ['commentsExtended entries with no comment', () => raw(
    p(range(0, r('only'))), plainCm([0]),
    exXml(cEx('00000001', null) + cEx('0000FFFF', '00000001', 1) +
      cEx('0000FFFE', null, 1)))],
  ['ranges across paragraphs, rows and a table', spans],
  ['an end before its start', () => raw(
    p(r('a') + ce(0) + r('b') + cr(0) + r('c') + cs(0) + r('d')) +
    p(ce(1) + r('e')) + p(cs(1) + r('f') + cr(1)), plainCm([0, 1]))],
  ['a 1 MB comment', () => raw(p(range(0, r('big'))),
    cmXml(cmt(0, '00000001', `<w:r><w:t>${MB}</w:t></w:r>`)))],
  ['comment XML with unknown children', () => raw(
    p(range(0, r('odd')) + range(1, r('odder'))),
    cmXml('<w:comment w:id="0" w:author="A" w:initials="A" ' +
      'w:foo="bar"><w:bogus><w:p><w:r><w:t>in bogus</w:t></w:r></w:p>' +
      '</w:bogus><w:p w14:paraId="00000001"><w:r><w:t>text</w:t>' +
      '</w:r><w:weird/></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>cell' +
      '</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:comment>' +
      '<w:unknown w:id="7"/>' +
      cmt(1, '00000002', '<w:r><w:t>plain</w:t></w:r>')))],
  ['marks with odd ids (negative, huge, not numbers)', () => raw(
    p(r('a') + '<w:commentRangeStart w:id="-1"/>' + r('b') +
      '<w:commentRangeEnd w:id="-1"/><w:r><w:commentReference ' +
      'w:id="-1"/></w:r>' + range(2147483647, r('c')) +
      '<w:commentRangeStart w:id="x"/>' + r('d') +
      '<w:commentRangeEnd w:id="x"/>') + p(range(0, r('e'))),
    plainCm([0, 2147483647]))],
];

/** A document of n comments, each on a word of its own paragraph;
 *  every other one a reply to the one before. */
function many(n) {
  let body = '', inner = '', ext = '';
  const hex = (k) => (k + 1).toString(16).toUpperCase()
    .padStart(8, '0');
  for (let k = 0; k < n; k++) {
    body += p(r('Paragraph ') + range(k, r('word' + k)) + r(' end.'));
    inner += cmt(k, hex(k), `<w:r><w:t>comment ${k}</w:t></w:r>`);
    ext += cEx(hex(k), k % 2 ? hex(k - 1) : null, k % 7 === 0 ? 1 : 0);
  }
  return raw(body, cmXml(inner), exXml(ext));
}

/** Open bytes, paginate, add a comment and reply, resolve and delete
 *  one, save, read back: the times (ms) and the document read
 *  back. */
async function timed(bytes) {
  const t0 = performance.now();
  const doc = await readDocx(bytes);
  const t1 = performance.now();
  paginate(doc);
  const t2 = performance.now();
  const d = new Document(doc);
  const t = new Typing(d);
  const b = paras(d.doc)[0];
  const a = addComment(d, t, S.select({id: b.id, off: 0}, {id: b.id,
    off: 4}), {text: 'new', ...ANN});
  assert.ok(a && a.id !== undefined);
  assert.ok(replyTo(d, t, a.id, {text: 'reply', ...BOB}));
  assert.ok(setResolved(d, t, 2, true));
  assert.ok(deleteComment(d, t, 5));
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

describe('comments round trip: hostile files never throw or hang',
  () => {
    for (const [name, make] of HOSTILE) {
      it(name, async () => {
        const res = await abuse(await make(), name);
        console.log('# hostile ' + name + ': ' + JSON.stringify(
          res.done));
      });
    }

    it('10,000 comments: every command still works (the first 3)',
      async () => {
        const res = await abuse(await many(10000), '10,000 comments',
          {all: false});
        assert.ok(res.back.comments.map.size > 10000,
          JSON.stringify(res.done));
      });

    it('10,000 comments: linear (load-robust ratio; ceiling only ' +
      'under WORD_PERF=1)', async () => {
      const small = await many(1000);
      const big = await many(10000);
      // (a slower big run only raises the ratio: one run of it)
      const a = await bestOf(() => timed(small));
      const b = await bestOf(() => timed(big), 1);
      const fmt = (x) => ['read', 'pages', 'edit', 'save'].map((f) =>
        f + ' ' + x[f].toFixed(0)).join(', ');
      console.log('# 1,000 comments: ' + fmt(a) + ' ms; 10,000: ' +
        fmt(b) + ' ms');
      if (process.env.WORD_PERF) {
        assert.ok(totalMs(b) < 60000, 'took ' + totalMs(b));
      } else {
        assert.ok(totalMs(b) < Math.max(totalMs(a), 10) * 30,
          'not linear: ' + (totalMs(b) / totalMs(a)).toFixed(1));
      }
      assert.equal(b.back.comments.map.size, 10000 + 2 - 1);
    });
  });
