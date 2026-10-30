// Generates the real-Word hand-off files for !Letters' comments
// (Batch F1: Insert > Comment, the Comments pane's Reply, Resolve,
// Edit and Delete; comments carried by Copy, Cut and Paste). Local
// only, never committed: tests/moreapps/corpus/ is git-ignored. Not a
// test:
//
//   node tests/moreapps/handoff-comments.mjs
//
// Writes into tests/moreapps/corpus/handoff/ (made if missing):
//   cm-1-from-scratch.docx   a new document: comments, replies (two
//                            on one comment), a resolved one: all
//                            made by !Letters (the most important)
//   cm-2-point.docx          point comments (at a caret: no text in
//                            the range)
//   cm-3-multi-paragraph.docx  a range across three paragraphs
//   cm-4-table-cell.docx     comments in table cells (Insert > Table)
//   cm-5-fifty.docx          50 comments, replies, resolved ones
//   cm-6-real-untouched.docx  a document Word made with a comment and
//                            every companion part (commentsExtended,
//                            commentsIds, commentsExtensible, people):
//                            Word's comment untouched, one of ours
//                            added (needs the corpus)
//   cm-7-real-thread.docx    a document Word made with a thread: our
//                            reply in Word's thread, our own new
//                            comment (needs the corpus)
//   cm-8-pasted.docx         comments copied and pasted (a copy), cut
//                            and pasted (a move), and a cut that took
//                            only a comment's reference
//   cm-9-reply-elsewhere.docx  a Word-shaped document whose reply is
//                            anchored outside its parent's range,
//                            then the parent's paragraph cut and
//                            pasted in !Letters
//   cm-10-lossy-edit.docx    Word-shaped comments with bold, a link
//                            and a field: one edited in !Letters' pane
//                            (plain text, the formatting lost), one
//                            untouched
//   cm-11-no-w14.docx        a comments part with no w14 namespace
//                            declared: !Letters' new comment declares
//                            it on its own paragraph
//   cm-README.txt            the questions (CM1..), a PRIORITY list
//                            first
// Everything is done with !Letters' own commands (./CommentCmd,
// ./ClipSlice and ./ClipPaste, ./TblInsert, typing) on a Document.
// Each file is checked by the package lint (and xmllint with wml.xsd
// where available: the main part and comments.xml), read back, and
// its comments listed in the README as !Letters reads them, so the
// list is what was really written. A file is written only when its
// bytes change, so a file open in Word is left alone; nothing else
// in the folder is touched.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {newDoc} from '../../tools/moreapps/!Letters/NewDoc';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import * as S from '../../tools/moreapps/!Letters/Selection';
import * as E from '../../tools/moreapps/!Letters/Edit';
import {addComment, editComment, replyTo, setResolved, textOf}
  from '../../tools/moreapps/!Letters/CommentCmd';
import {paraMarks} from '../../tools/moreapps/!Letters/CommentMarks';
import {insertTable} from '../../tools/moreapps/!Letters/TblInsert';
import {slice} from '../../tools/moreapps/!Letters/ClipSlice';
import {cutSelection, pasteBlocks}
  from '../../tools/moreapps/!Letters/ClipPaste';
import {scan} from '../../tools/moreapps/!Letters/Walk';
import {OBJ} from '../../tools/moreapps/!Letters/Model';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {buildDocx, documentXml, p, r, REL, W_NS, R_NS}
  from './build-docx.mjs';
import {fldSimple} from './field-fixtures.mjs';
import {lintPackage} from './lint-package.mjs';
import {schemaChecker, extKey, CORPUS} from './roundtrip-lib.mjs';

const OUT = fileURLToPath(new URL('./corpus/handoff/',
  import.meta.url));
const DATE = new Date(Date.UTC(2026, 9, 30, 12));
// (local time: w:date is written as the local time with a Z, as
// Word writes it; commentsExtensible's dateUtc, where that part is,
// the real UTC)
const WHEN = new Date(2026, 9, 30, 14, 5);
const TZ = -WHEN.getTimezoneOffset();
const ANN = {author: 'Ann Example', initials: 'AE', date: WHEN};
const BOB = {author: 'Bob Sample', initials: 'BS', date: WHEN};
fs.mkdirSync(OUT, {recursive: true});
const xsd = schemaChecker();

/** Write bytes to name unless the file already holds them. */
function put(name, bytes) {
  const f = path.join(OUT, name);
  const b = Buffer.from(bytes);
  if (fs.existsSync(f) && fs.readFileSync(f).equals(b)) return 'same';
  fs.writeFileSync(f, b);
  return 'written';
}

const LOREM = 'The quick brown fox jumps over the lazy dog while the ' +
  'committee reviews the minutes of the previous meeting.';
const plain = (b) => b.text.split(OBJ).join('');

/** A session on a Document, with a clock for Typing. */
function session(doc) {
  const d = new Document(doc);
  d.clearHistory();
  let now = 0;
  const t = new Typing(d, {now: () => (now += 2000)});
  const paras = () => {
    const out = [];
    scan(d.doc, (b) => { if (b.type === 'p') out.push(b); });
    return out;
  };
  const para = (start) => {
    const b = paras().find((x) => plain(x).startsWith(start));
    if (!b) throw new Error('no paragraph starting ' +
      JSON.stringify(start));
    return b;
  };
  /** The offset in b.text of the plain-text offset n. */
  const offOf = (b, n) => {
    let k = 0, m = 0;
    for (; k < b.text.length && m < n; k++) if (b.text[k] !== OBJ) m++;
    return k;
  };
  /** The selection of word (plain text) in the paragraph starting
   *  start (end: the paragraph starting end, a range across). */
  const words = (start, word, endStart, endWord) => {
    const a = para(start);
    const i = plain(a).indexOf(word);
    if (i < 0) throw new Error('no ' + word);
    const z = endStart ? para(endStart) : a;
    const w = endStart ? endWord : word;
    const j = endStart ? plain(z).indexOf(w) : i;
    if (j < 0) throw new Error('no ' + w);
    return S.select({id: a.id, off: offOf(a, i)}, {id: z.id,
      off: offOf(z, j + w.length)});
  };
  const ok = (x, what) => {
    if (!x || x.needsAuthor) throw new Error(what + ' refused');
    return x;
  };
  const s = {
    d, t, paras, para, words, offOf,
    /** Type lines at the end of the document (\n: Enter). */
    write(text) {
      for (const line of text.split('\n')) {
        const ps = paras();
        const last = ps[ps.length - 1];
        let sel = S.caret({id: last.id, off: last.text.length});
        if (plain(last).length || ps.length > 1) {
          sel = t.command(() => E.splitPara(d, sel));
        }
        if (line) t.type(sel, line);
      }
    },
    /** Insert > Comment on sel. */
    comment(sel, text, who = ANN) {
      return ok(addComment(d, t, sel, {text, ...who}), 'comment').id;
    },
    /** Reply in the pane. */
    reply(id, text, who = BOB) {
      return ok(replyTo(d, t, id, {text, ...who}), 'reply').id;
    },
    resolve(id) { return ok(setResolved(d, t, id, true), 'resolve'); },
    edit(id, text, confirmed) {
      return editComment(d, t, id, {text, confirmed});
    },
  };
  return s;
}

/** A new document of the given lines. */
function fresh(text) {
  const s = session(newDoc({date: DATE}));
  s.write(text);
  return s;
}

/** A corpus file's bytes, or null when the corpus is absent. */
const corpus = (name) => {
  const f = path.join(CORPUS, name);
  return fs.existsSync(f) ? new Uint8Array(fs.readFileSync(f)) : null;
};

const lines = [];
const say = (...x) => lines.push(...x);

// ----------------------------------------------------------- read back

const short = (s, n = 60) => (s.length > n ? s.slice(0, n) + '...'
  : s);

/** What a written file holds: each comment as !Letters reads it, with
 *  the text its range covers and where its marks are. */
async function describe(bytes) {
  const doc = await readDocx(bytes);
  const out = [];
  const cm = doc.comments;
  if (!cm || !cm.map.size) return ['  (no comments)'];
  const marks = new Map();
  let pi = 0;
  scan(doc, (b) => {
    if (b.type !== 'p') return;
    pi++;
    for (const m of paraMarks(b)) {
      if (!marks.has(m.id)) marks.set(m.id, []);
      marks.get(m.id).push({b, pi, ...m});
    }
  });
  out.push('  comments in comments.xml order: id, author, date, the',
    '  comment it answers, resolved, text; its marks (paragraph',
    '  numbers) and the text between its range marks:');
  for (const id of cm.order) {
    const c = cm.map.get(id);
    const ms = marks.get(id) || [];
    const s = ms.find((m) => m.kind === 'cmtStart');
    const e = ms.find((m) => m.kind === 'cmtEnd');
    const rf = ms.find((m) => m.kind === 'cmtRef');
    let covers = '';
    if (s && e && s.b === e.b) covers = plain({text: s.b.text.slice(
      s.off + 1, e.off)});
    else if (s && e) covers = plain({text: s.b.text.slice(s.off + 1)}) +
      ' ... ' + plain({text: e.b.text.slice(0, e.off)});
    out.push(`    ${id}: ${c.author} (${c.initials}), ${c.date}` +
      (c.parent !== null ? `, reply to ${c.parent}` : '') +
      (c.done ? ', RESOLVED' : '') + ': ' +
      JSON.stringify(short(textOf(c).replace(/\n/g, ' / ')))
        .replace(/\\t/g, '<tab>'));
    out.push('       marks: ' + (s ? 'start p' + s.pi : 'no start') +
      ', ' + (e ? 'end p' + e.pi : 'no end') + ', ' + (rf
      ? 'reference p' + rf.pi : 'NO REFERENCE') + (s && e
      ? '; covers ' + JSON.stringify(short(covers)) : ''));
  }
  const parts = Object.entries(doc.meta.commentParts || {})
    .filter(([, n]) => typeof n === 'string').map(([, n]) =>
      n.replace(/^word\//, ''));
  out.push('  comment parts: ' + parts.join(', '));
  return out;
}

const made = [];
async function save(name, doc, about) {
  const bytes = await writeDocx(doc, {date: DATE});
  const z = await readZip(bytes);
  const problems = lintPackage(z).problems
    .filter((q) => q.level === 'error');
  if (problems.length) throw new Error(name + ': ' +
    JSON.stringify(problems));
  let schema = 'schema check skipped';
  if (typeof xsd !== 'string') {
    const cp = doc.meta.commentParts && doc.meta.commentParts.comments;
    const parts = [doc.meta.mainPart, cp].filter((n) => n && z.get(n));
    // (the Microsoft extension attributes, w14:paraId..., are not in
    // wml.xsd: passed over)
    schema = 'xmllint/wml.xsd: ' + parts.map((n) => n.replace(/^word\//,
      '') + ' ' + [...xsd.errors(z.get(n))].filter((m) => !extKey(m) &&
      !m.includes('markup-compatibility')).length).join(', ') +
      ' messages';
  }
  made.push(`${name} (${bytes.length} bytes, ${put(name, bytes)}; ` +
    `lint clean; ${schema})`);
  say('', name, '-'.repeat(name.length), ...about, '',
    'What !Letters wrote (read back from the saved file):',
    ...await describe(bytes));
}
const skip = (name, why) => {
  made.push(`${name} (skipped: ${why})`);
  say('', name, '-'.repeat(name.length), '(not made: ' + why + ')');
};

// ------------------------------------------------- Word-shaped parts

const DECL = '<?xml version="1.0" encoding="UTF-8" ' +
  'standalone="yes"?>\n';
const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const W15 = 'http://schemas.microsoft.com/office/word/2012/wordml';
const MC = 'http://schemas.openxmlformats.org/' +
  'markup-compatibility/2006';
const EXT_REL = 'http://schemas.microsoft.com/office/2011/' +
  'relationships/commentsExtended';
const cs = (id) => `<w:commentRangeStart w:id="${id}"/>`;
const ce = (id) => `<w:commentRangeEnd w:id="${id}"/>`;
const cr = (id) => '<w:r><w:rPr><w:rStyle w:val="CommentReference"/>' +
  `</w:rPr><w:commentReference w:id="${id}"/></w:r>`;
const ANNOT = '<w:r><w:rPr><w:rStyle w:val="CommentReference"/>' +
  '</w:rPr><w:annotationRef/></w:r>';
const PPR = '<w:pPr><w:pStyle w:val="CommentText"/></w:pPr>';
const comment = (id, para, inner, author = 'Word User', w14 = true) =>
  `<w:comment w:id="${id}" w:author="${author}" ` +
  `w:date="2026-10-01T09:00:00Z" w:initials="WU"><w:p` +
  (w14 ? ` w14:paraId="${para}" w14:textId="77777777"` : '') +
  `>${PPR}${ANNOT}${inner}</w:p></w:comment>`;
const comments = (inner, w14 = true) => DECL + `<w:comments ` +
  `xmlns:w="${W_NS}" xmlns:r="${R_NS}"` + (w14 ? ` xmlns:mc="${MC}" ` +
  `xmlns:w14="${W14}" mc:Ignorable="w14"` : '') + `>${inner}` +
  '</w:comments>';
const extended = (inner) => DECL + `<w15:commentsEx xmlns:mc="${MC}" ` +
  `xmlns:w15="${W15}" mc:Ignorable="w15">${inner}</w15:commentsEx>`;
const cEx = (para, parent, done = 0) => `<w15:commentEx ` +
  `w15:paraId="${para}"${parent ? ` w15:paraIdParent="${parent}"`
    : ''} w15:done="${done}"/>`;

/** A Word-shaped .docx of body, comments.xml and (optional)
 *  commentsExtended.xml, opened in a session. */
async function shaped(body, cm, ex = null) {
  const parts = {'word/document.xml': documentXml(body),
    'word/comments.xml': cm};
  const docRels = [['rIdC1', REL('comments'), 'comments.xml']];
  if (ex) {
    parts['word/commentsExtended.xml'] = ex;
    docRels.push(['rIdC2', EXT_REL, 'commentsExtended.xml']);
  }
  return session(await readDocx(await buildDocx(parts, {docRels})));
}

// ----------------------------------------------------------- the files

// cm-1: made from scratch with our commands
{
  const s = fresh('Made by !Letters\n' +
    'This document was made new in !Letters and every comment in it ' +
    'was put in with Insert > Comment and the Comments pane.\n' +
    'The first commented words are here, with two replies.\n' +
    'This sentence has a comment that was resolved.\n' +
    'A comment of two lines with a tab is on this sentence.\n' +
    LOREM);
  const a = s.comment(s.words('The first', 'first commented words'),
    'Ann\'s comment on the first words.');
  s.reply(a, 'Bob\'s reply (the first reply).');
  s.reply(a, 'Ann answers (the second reply).', ANN);
  const b = s.comment(s.words('This sentence has', 'resolved'),
    'Please check this.', BOB);
  s.reply(b, 'Checked: resolving.', ANN);
  s.resolve(b);
  s.comment(s.words('A comment of two', 'two lines'),
    'Line one\nLine two with a\ttab');
  await save('cm-1-from-scratch.docx', s.d.doc, [
    'A new document (File > New), text typed, then Insert > Comment',
    'on three stretches of text: the first with two replies (Bob,',
    'then Ann; the Comments pane\'s Reply), the second with a reply',
    'and Resolve (so the comment and its reply are resolved), the',
    'third with two lines and a tab in its text. Authors and',
    'initials as set in Tools > User name and initials.',
    `Dates: 2026-10-30 14:05 local time (this machine: UTC${TZ >= 0
      ? '+' : '-'}${Math.abs(TZ / 60)}), written as w:date ` +
    '"2026-10-30T14:05:00Z".']);
}

// cm-2: point comments
{
  const s = fresh('Point comments\nA comment at a caret is here in ' +
    'the middle of this sentence.\nAnd one at the very end of this ' +
    'paragraph.');
  const b = s.para('A comment at');
  s.comment(S.caret({id: b.id, off: s.offOf(b, plain(b).indexOf(
    ' in the middle'))}), 'A point comment after "here".');
  const e = s.para('And one');
  s.comment(S.caret({id: e.id, off: e.text.length}),
    'A point comment at the end of the paragraph.', BOB);
  await save('cm-2-point.docx', s.d.doc, [
    'Insert > Comment with no selection (a caret): !Letters writes',
    'the range start, its end and the reference together at the',
    'caret (a range with no text). One after the word "here", one',
    'at the end of the last paragraph.']);
}

// cm-3: a range across paragraphs
{
  const s = fresh('A range across paragraphs\nThe range starts in ' +
    'this first paragraph.\nIt covers all of this second one.\nAnd ' +
    'ends in the middle of this third paragraph, here.\n' + LOREM);
  s.comment(s.words('The range starts', 'this first', 'And ends',
    'middle'), 'From "this first" to "middle".');
  await save('cm-3-multi-paragraph.docx', s.d.doc, [
    'One comment whose range starts in one paragraph and ends two',
    'paragraphs later (selected with the mouse, then Insert >',
    'Comment).']);
}

// cm-4: comments in table cells
{
  const s = fresh('Comments in a table\nThe table follows.\n' +
    'After the table.');
  const t0 = s.para('The table follows');
  if (!insertTable(s.d, S.caret({id: t0.id, off: t0.text.length}),
    {cols: 2, rows: 2})) throw new Error('insertTable');
  const cells = s.paras().filter((b) => b.text === '');
  const texts = ['Top left cell text', 'Top right', 'Bottom left',
    'Bottom right cell'];
  cells.slice(0, 4).forEach((b, k) => s.t.type(S.caret({id: b.id,
    off: 0}), texts[k]));
  s.comment(s.words('Top left', 'left cell'), 'On words in a cell.');
  const br = s.para('Bottom right');
  s.comment(S.select({id: br.id, off: 0}, {id: br.id,
    off: br.text.length}), 'On the whole text of a cell.', BOB);
  s.comment(s.words('Top right', 'right', 'Bottom left', 'Bottom'),
    'From one cell to the next row.');
  await save('cm-4-table-cell.docx', s.d.doc, [
    'Insert > Table 2 x 2, text typed in the cells, then comments on',
    'words in the top left cell, on the whole text of the bottom',
    'right cell, and one from the top right cell to the bottom left',
    'one (a range across a row).']);
}

// cm-5: fifty comments
{
  let text = '50 comments';
  for (let k = 1; k <= 10; k++) {
    text += `\nParagraph ${k}: alpha beta gamma delta epsilon end.`;
  }
  const s = fresh(text);
  const W = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
  let n = 0;
  for (let k = 1; k <= 10; k++) {
    for (const w of W) {
      n++;
      const id = s.comment(s.words(`Paragraph ${k}:`, w),
        `Comment ${n} on ${w} of paragraph ${k}.`, n % 2 ? ANN : BOB);
      if (n % 5 === 0) s.reply(id, `Reply to comment ${n}.`);
      if (n % 7 === 0) s.resolve(id);
    }
  }
  await save('cm-5-fifty.docx', s.d.doc, [
    'Ten paragraphs, a comment on each of five words of each (50,',
    'Ann and Bob in turn); every fifth answered by a reply, every',
    'seventh resolved.']);
}

// cm-6: a real document, Word's comment untouched, ours added
{
  const name = 'libreoffice/tiledrendering/data/comments-on-load.docx';
  const bytes = corpus(name);
  if (!bytes) skip('cm-6-real-untouched.docx', 'the corpus is absent');
  else {
    const s = session(await readDocx(bytes));
    s.comment(s.words('end of the line', 'pressing himself'),
      'Our comment, added by !Letters.');
    await save('cm-6-real-untouched.docx', s.d.doc, [
      'The corpus file ' + name + ' (made by Word,',
      'with comments.xml, commentsExtended, commentsIds,',
      'commentsExtensible and people.xml) opened in !Letters; Word\'s',
      'comment left as it is (its XML is written back byte for byte),',
      'and one comment of ours added on "pressing himself": its',
      'entries appended to each companion part (commentsExtended,',
      'commentsIds with a new durableId, commentsExtensible with',
      'dateUtc in UTC, people.xml with a new person).']);
  }
}

// cm-7: a real thread, our reply in it
{
  const name = 'open-xml-sdk/O15Conformance/WD/CommentExTest/' +
    'Comments-Sample-15-12-01/Comment053.docx';
  const bytes = corpus(name);
  if (!bytes) skip('cm-7-real-thread.docx', 'the corpus is absent');
  else {
    const s = session(await readDocx(bytes));
    const cm = s.d.doc.comments;
    const top = cm.order.find((id) => cm.map.get(id).parent === null &&
      cm.order.some((k) => cm.map.get(k).parent === id));
    s.reply(top, 'Our reply in Word\'s thread, added by !Letters.');
    // (its only paragraph holds marks and no text: words typed)
    s.write(' Words typed in !Letters.');
    s.comment(s.words(' Words typed', 'typed'),
      'Our own new comment.', ANN);
    await save('cm-7-real-thread.docx', s.d.doc, [
      'The corpus file Comment053.docx (made by Word: comment 1 with',
      'a reply 2, and comment 0; commentsExtended and people.xml),',
      `opened in !Letters; our reply added to Word's thread (comment`,
      `${top}), text typed at the end of the file's one paragraph (it`,
      'held only marks), and a new comment of ours on its word',
      '"typed". Note: in this file Word wrote comment 1 and its reply',
      '2 with NO range of their own, their references in runs of',
      'their own inside comment 0\'s range (start 0, reference 1,',
      'reference 2, end 0, reference 0). !Letters gives a reply a',
      'range inside its parent\'s when the parent has one, and its',
      'reference right after the parent\'s (CM7).']);
  }
}

// cm-8: pasted comments, a reference cut alone
{
  const s = fresh('Pasted comments\nCopied: this paragraph has a ' +
    'comment on "copied words".\nMoved: this paragraph is cut and ' +
    'pasted at the end.\nCut reference: a comment whose reference ' +
    'was cut away.\nThe end of the document.');
  s.comment(s.words('Copied:', 'copied words'), 'A copied comment.');
  s.comment(s.words('Moved:', 'cut and pasted'), 'A moved comment.',
    BOB);
  const cid = s.comment(s.words('Cut reference:', 'reference'),
    'This comment lost its reference mark.');
  // a copy of the first paragraph pasted at the end: a new comment
  const end = () => {
    const b = s.para('The end');
    return S.caret({id: b.id, off: b.text.length});
  };
  const whole = (start) => {
    const b = s.para(start);
    return S.select({id: b.id, off: 0}, {id: b.id,
      off: b.text.length});
  };
  const opts = (x) => ({sameDoc: true, styleNames: x.styleNames,
    styles: x.styles, lists: x.lists, pics: x.pics,
    picScope: x.picScope, notes: x.notes, comments: x.comments});
  const c1 = slice(s.d.doc, whole('Copied:'));
  pasteBlocks(s.d, end(), c1.blocks, opts(c1));
  const c2 = cutSelection(s.d, whole('Moved:')).slice;
  pasteBlocks(s.d, end(), c2.blocks, opts(c2));
  // the reference alone cut (its range marks stay)
  const b = s.para('Cut reference:');
  const k = paraMarks(b).find((m) => m.id === cid &&
    m.kind === 'cmtRef');
  cutSelection(s.d, S.select({id: b.id, off: k.off}, {id: b.id,
    off: k.off + 1}));
  await save('cm-8-pasted.docx', s.d.doc, [
    'Three comments made, then: the "Copied:" paragraph copied and',
    'pasted at the end of "The end of the document." (a second',
    'comment, a copy of the first, with a new id), the "Moved:"',
    'paragraph cut and pasted there too (its comment comes back',
    'under a new id), and, in "Cut reference:", only the comment\'s',
    'reference mark selected and cut (its range marks stay: a',
    'comment with a range and no reference). !Letters appends a',
    'pasted comment at the END of comments.xml, not in the order of',
    'the document.']);
}

// cm-9: a reply anchored outside its parent's range
{
  const s = await shaped(
    p(r('Parent paragraph: ') + cs(0) + r('alpha words') + ce(0) +
      cr(0) + r('.')) +
    p(r('Another paragraph where the reply is anchored: ') + cs(1) +
      r('omega') + ce(1) + cr(1) + r('.')) +
    p(r('Last paragraph.')),
    comments(comment(0, '00000010', r('The parent comment.')) +
      comment(1, '00000011', r('A reply anchored elsewhere.'),
        'Second User')),
    extended(cEx('00000010', null) + cEx('00000011', '00000010')));
  const pp = s.para('Parent paragraph');
  const cut = cutSelection(s.d, S.select({id: pp.id, off: 0},
    {id: pp.id, off: pp.text.length})).slice;
  const last = s.para('Last paragraph');
  pasteBlocks(s.d, S.caret({id: last.id, off: last.text.length}),
    cut.blocks, {sameDoc: true, styleNames: cut.styleNames,
      styles: cut.styles, lists: cut.lists, pics: cut.pics,
      picScope: cut.picScope, notes: cut.notes,
      comments: cut.comments});
  await save('cm-9-reply-elsewhere.docx', s.d.doc, [
    'A Word-shaped document (made by the test, not by Word): comment',
    '0 on "alpha words", and its reply 1 anchored on "omega" in the',
    'next paragraph (outside the parent\'s range). Opened in',
    '!Letters, the parent\'s whole paragraph was cut and pasted at',
    'the end of "Last paragraph.": !Letters moves the parent under a',
    'new id and, as a reply goes with its parent, removes the reply',
    'and its "omega" marks in the cut.']);
}

// cm-10: a lossy edit
{
  const rich = '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">' +
    'Bold words, </w:t></w:r><w:hyperlink w:anchor="_top"><w:r>' +
    '<w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>a link</w:t>' +
    '</w:r></w:hyperlink>' + r(' and page ') +
    fldSimple('PAGE', '1') + r('.');
  const s = await shaped(
    p(r('Edited: ') + cs(0) + r('this comment was edited') + ce(0) +
      cr(0) + r(' in !Letters.')) +
    p(r('Untouched: ') + cs(1) + r('this one was not') + ce(1) + cr(1) +
      r('.')),
    comments(comment(0, '00000020', rich) +
      comment(1, '00000021', rich)),
    extended(cEx('00000020', null) + cEx('00000021', null)));
  const res = s.edit(0, 'The text after the edit in !Letters.');
  if (!res || !res.lossy) throw new Error('not lossy');
  if (s.edit(0, 'The text after the edit in !Letters.', true) !== true)
    throw new Error('edit');
  await save('cm-10-lossy-edit.docx', s.d.doc, [
    'A Word-shaped document (made by the test): two comments whose',
    'text has bold words, a hyperlink and a PAGE field. Comment 0',
    'was edited in the Comments pane: !Letters warned that the',
    'formatting would be lost, and on OK wrote plain text (one run,',
    'its CommentText paragraph and annotationRef kept). Comment 1',
    'untouched (written back as it was read).']);
}

// cm-11: no w14 namespace in comments.xml
{
  const s = await shaped(
    p(r('Old comment: ') + cs(0) + r('marked here') + ce(0) + cr(0)) +
    p(r('New comment on these words, added by !Letters.')),
    comments(comment(0, null, r('A comment written without w14.'),
      'Other Tool', false), false));
  s.comment(s.words('New comment', 'these words'),
    'Our comment: its paragraph declares xmlns:w14 itself.');
  await save('cm-11-no-w14.docx', s.d.doc, [
    'A Word-shaped document (made by the test, as some other tools',
    'write): comments.xml declares only w and r, so its comments',
    'have no w14:paraId. !Letters\' new comment\'s paragraph carries',
    'w14:paraId with its own xmlns:w14 (and mc:Ignorable) declared',
    'on that w:p.']);
}

// ------------------------------------------------------------ README

const README = [
  'Comments (!Letters Batch F1: Insert > Comment (Ctrl+Alt+M), the',
  'Comments pane (Tools > Comments): Reply, Resolve, Edit, Delete;',
  'comments carried by Copy, Cut and Paste): the real-Word hand-off',
  '(made by node tests/moreapps/handoff-comments.mjs; local only,',
  'this folder is never committed)',
  '',
  'Every file was made, or opened and changed, with !Letters\' own',
  'commands. Each was written, checked by the package lint, read',
  'back by !Letters, and its comments are listed below under the',
  'file (id, author, date, the comment it answers, resolved, text,',
  'and where its marks are), so the list is what was really',
  'written. Look at each in Word with Review > Show Comments (and',
  'the Comments pane: Review > Comments > Show Comments, or the',
  'Comments button at the top right).',
  '',
  'Note for the owner: the key for Insert > Comment in !Letters is',
  'Ctrl+Alt+M, Word\'s own key. The design said Ctrl+Alt+C "as in',
  'Word", but in Word Ctrl+Alt+C types the copyright sign (and',
  'AltGr+C is a letter on Polish and Czech keyboards), so !Letters',
  'uses Ctrl+Alt+M. Say if you want Ctrl+Alt+C as well (CM15).',
  '',
  'PRIORITY: the questions may be too many for one session. Take',
  'these first, in this order: the files Word could refuse or',
  'repair, then the guesses about Word that !Letters writes into',
  'every file with comments. Everything else is "if time allows".',
  '',
  '  1. cm-1-from-scratch: CM1, CM2 (the most important file: every',
  '     comment, reply and part in it was made by !Letters. Does',
  '     Word open it without a repair prompt? Are the replies shown',
  '     threaded under their comment, the resolved one resolved?)',
  '  2. Smoke test: open EVERY cm-*.docx once. Note any repair',
  '     prompt or "unreadable content" message and which file. CM3.',
  '  3. CM4 (our w14:paraId; w14 declared on a w:p: cm-11).',
  '  4. CM5 (resolved kept after a save in Word).',
  '  5. CM6 (dates and time zone).',
  '  6. CM7 (reply references sharing one w:r, their order, a second',
  '     reply before the first).',
  '  7. CM8, CM9 (the parts !Letters makes or adds to: cm-1, cm-6,',
  '     cm-7).',
  '  8. CM10, CM11 (pasted comments; a comment with no reference:',
  '     cm-8).',
  '',
  'The guesses about Word that !Letters makes (none could be checked',
  'without Word; each is asked below):',
  '  - a reply\'s marks: its range start right after its parent\'s',
  '    start, its end right before the parent\'s end, its reference',
  '    right after the parent\'s reference, in the SAME w:r as the',
  '    parent\'s reference (Word writes a run per reference); a',
  '    second reply goes outside the first, so the references read',
  '    0, 2, 1: CM7',
  '  - our fresh w14:paraId (8 hex digits below 80000000, never one',
  '    in use) on the LAST paragraph of a comment only (Word writes',
  '    one on every paragraph, with w14:textId); xmlns:w14 declared',
  '    on the w:p when comments.xml does not declare it: CM4',
  '  - a reply to a comment read without a paraId gives it one: CM4',
  '  - w15:done="1" in commentsExtended for resolved; resolving a',
  '    comment resolves its replies; reopening reopens only that',
  '    one: CM5',
  '  - w:date the LOCAL time with a Z and :00 seconds (as Word',
  '    writes it), commentsExtensible dateUtc the real UTC: CM6',
  '  - the parts made for a new document: comments.xml (mc, r, w,',
  '    w14 declared, mc:Ignorable="w14"), commentsExtended.xml only',
  '    for a reply or a resolve (mc, w15, mc:Ignorable="w15"); never',
  '    people.xml, commentsIds.xml or commentsExtensible.xml (entries',
  '    are added to those only when the file has them): CM8',
  '  - a new person in people.xml: w15:providerId "None", w15:userId',
  '    the author\'s name: CM9',
  '  - the comment styles made on first use (CommentText 10 pt,',
  '    CommentReference 8 pt, CommentTextChar): CM8',
  '  - a pasted comment is appended at the end of comments.xml, not',
  '    in the order of the document: CM10',
  '  - a comment whose range marks remain with no commentReference',
  '    (a cut that took only the reference): CM11',
  '  - a reply anchored outside its parent\'s range is removed with',
  '    its parent when the parent is cut: CM12',
  '  - editing a comment with formatting, links, fields or pictures',
  '    in the pane writes plain text (after a warning): CM13',
  '  - a point comment (no selection) is an empty range at the',
  '    caret: Word usually comments the word at the caret: CM14',
  '  - Insert > Comment on Ctrl+Alt+M: CM15',
  '  - !Letters shows no balloons in the margin: comments are in',
  '    the pane, their text highlighted: CM16',
  '',
  'Questions',
  '---------',
  'CM1 cm-1: does Word open it with no message? Are the three',
  '    comments on "first commented words", "resolved" and "two',
  '    lines", by Ann Example, Bob Sample and Ann Example, with the',
  '    dates listed below? Is the third comment two lines, with a',
  '    tab in the second?',
  'CM2 cm-1: are the two replies (Bob\'s, then Ann\'s) shown under',
  '    Ann\'s first comment as a thread, in that order (Bob first)?',
  '    Is the second comment shown resolved (greyed, or under',
  '    "Resolved"), its reply too? Reply to the first comment in',
  '    Word and save (as a copy): if you can, send the file back.',
  'CM3 Any cm-*.docx with a repair prompt, a lost comment, a comment',
  '    on the wrong text, or a reply shown as a separate comment?',
  '    (Which file, which comment.)',
  'CM4 Our paragraph ids: in cm-1 and cm-5 every comment\'s',
  '    w14:paraId was made by !Letters. Does Word keep the threads',
  '    after a save (it matches replies by w15:paraIdParent against',
  '    these ids)? cm-11: comments.xml declares no w14, so the',
  '    paragraph of our new comment declares xmlns:w14 (and',
  '    mc:Ignorable) on the w:p itself: does Word open it, and does',
  '    it show both comments? After a save in Word, does the old',
  '    comment get a w14:paraId too?',
  'CM5 cm-1: resolve state: after Word opens and saves cm-1, is the',
  '    second comment still resolved? In Word, reopen it: is its',
  '    reply reopened too, or only the comment? (!Letters reopens',
  '    only the comment and resolves the replies with their parent.)',
  'CM6 Dates: cm-1\'s comments say 2026-10-30 14:05 (written',
  '    w:date="2026-10-30T14:05:00Z": the local time with a Z, as',
  '    Word was seen to write it). What time does Word show (14:05,',
  '    or shifted by the time zone)? cm-6 also has',
  '    commentsExtensible: our comment\'s dateUtc there is the real',
  '    UTC; does Word show the same time for it as for the others?',
  'CM7 Reply marks (Alt+F9 does not show them; unzip and look at',
  '    word/document.xml if you can): !Letters puts a reply\'s',
  '    reference in the same w:r as its parent\'s (Word writes one',
  '    run per reference), and a second reply\'s marks outside the',
  '    first\'s, so the references read 0, 2, 1. Does Word show the',
  '    replies in the order they were made (cm-1: Bob, then Ann)?',
  '    After a save in Word, what order and runs does Word write?',
  'CM8 Parts: cm-1 is a new document; !Letters made only',
  '    comments.xml and commentsExtended.xml (no people.xml,',
  '    commentsIds.xml, commentsExtensible.xml). Does Word need the',
  '    others (any warning, any lost thread)? Are the comments',
  '    written in Word\'s comment text style (Home > Styles:',
  '    "Comment Text", "Comment Reference")?',
  'CM9 People: cm-6 and cm-7 have people.xml; !Letters adds a',
  '    person for a new author (providerId "None", userId the name).',
  '    Does Word show our author\'s name (and initials, picture',
  '    placeholder) like the others?',
  'CM10 cm-8: is the copied comment on "copied words" there twice',
  '    (the original and the pasted copy at the end), and the moved',
  '    one only once, at the end? Are they listed in Word\'s pane in',
  '    the order of the document even though comments.xml has the',
  '    pasted ones last? After a save, does Word reorder them?',
  'CM11 cm-8: the third comment ("This comment lost its reference',
  '    mark.") has its range but no reference: does Word show it at',
  '    all? Does it keep it, drop it, or repair the file?',
  'CM12 cm-9: Word itself: can a reply have its own range somewhere',
  '    else (make a reply in Word to a comment: where does Word put',
  '    its marks)? In the file !Letters cut the parent\'s paragraph',
  '    and pasted it at the end: the parent moved and the reply on',
  '    "omega" was removed with it. In Word, do the same (cut the',
  '    parent\'s paragraph of a comment with a reply, paste it): does',
  '    the reply stay, move, or go?',
  'CM13 cm-10: comment 0 was edited in !Letters\' pane: is it now',
  '    plain text "The text after the edit in !Letters." (the bold,',
  '    the link and the page field gone, as !Letters warned)? Is',
  '    comment 1 still bold, with a working link and a page number?',
  'CM14 cm-2: are the two point comments shown, at "here" and at',
  '    the end of the paragraph? In Word, put the caret in a word',
  '    and Review > New Comment with no selection: does Word comment',
  '    the whole word, or the caret point?',
  'CM15 The key: Ctrl+Alt+M is Insert > Comment in Word (and in',
  '    !Letters). Owner: keep Ctrl+Alt+M only, or add Ctrl+Alt+C as',
  '    the design first said?',
  'CM16 Display: Word shows comments in balloons in the right',
  '    margin (Print Layout, Simple Markup or All Markup); !Letters',
  '    shows none: the commented text is highlighted and the',
  '    comments are in its Comments pane. Look at cm-5 in Word: is',
  '    anything about where Word puts its balloons, or the colour',
  '    per author, worth copying?',
  'CM17 cm-3, cm-4 and cm-5: is each comment on the text listed (a',
  '    range over three paragraphs; in table cells, and from the top',
  '    right cell to the bottom left one; 50 comments, ten replies,',
  '    seven resolved)? Anything slow or odd with 50?',
  ...lines,
  '',
];
/** A line of at most 72 characters, or its pieces (indented). */
function wrap(line) {
  if (line.length <= 72) return [line];
  const ind = line.match(/^ */)[0] + '    ';
  const out = [];
  let cur = line;
  while (cur.length > 72) {
    let at = cur.lastIndexOf(' ', 72);
    if (at <= ind.length) at = cur.indexOf(' ', ind.length + 1);
    if (at < 0) break;
    out.push(cur.slice(0, at));
    cur = ind + cur.slice(at + 1);
  }
  out.push(cur);
  return out;
}
// (ASCII only, as the other READMEs; a tab shown as <tab>)
const ascii = (t) => t.replace(/\t/g, '<tab>').replace(/[^\x00-\x7e]/gu,
  (c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase()
    .padStart(4, '0'));
const how = put('cm-README.txt', Buffer.from(
  ascii(README.flatMap(wrap).join('\n')), 'ascii'));
made.push(`cm-README.txt (${how})`);
console.log('hand-off files in ' + OUT + ':\n  ' + made.join('\n  '));
if (typeof xsd !== 'string') xsd.done();
