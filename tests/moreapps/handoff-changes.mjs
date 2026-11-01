// Generates the real-Word hand-off files for !Letters' tracked
// changes (Batch F2: Tools > Track Changes, typing and deleting
// recorded, Accept and Reject, the Changes pane, Show Markup). Local
// only, never committed: tests/moreapps/corpus/ is git-ignored. Not a
// test:
//
//   node tests/moreapps/handoff-changes.mjs
//
// Writes into tests/moreapps/corpus/handoff/ (made if missing):
//   tc-1-from-scratch.docx   a new document: Track Changes switched on
//                            in !Letters, an insertion, a deletion,
//                            and a second author typing inside the
//                            first author's insertion (split): all
//                            made by !Letters (the most important)
//   tc-2-move.docx           a Word-shaped document with three moves:
//                            one untouched, one accepted in !Letters,
//                            one whose new place was deleted (its old
//                            place becomes a plain deletion)
//   tc-2a-move-untouched.docx  that document as built, never opened
//                            by !Letters (a control for tc-2)
//   tc-2b-move-no-empty-ranges.docx  tc-2 with its move ranges that
//                            hold no moved text taken out of the
//                            saved XML by this script (the next
//                            bisect step)
//   tc-3-many-authors.docx   six authors (odd names among them), each
//                            inserting and deleting
//   tc-4-table-cell.docx     tracked typing and deleting in table
//                            cells (Insert > Table)
//   tc-5-fifty.docx          50 tracked changes, two authors
//   tc-6-tracking-on.docx    Track Changes switched on, nothing typed
//                            after it (no revision in the file)
//   tc-7-no-author-date.docx  a Word-shaped document whose revisions
//                            lack w:author, w:date or both; our own
//                            insertion added elsewhere
//   tc-8-two-paragraphs.docx  one insertion typed across a paragraph
//                            break (one revision in two paragraphs)
//   tc-9-deleted-marks.docx  a tracked deletion of text holding a
//                            bookmark and a comment's range
//   tc-10-formatting.docx    a Word-shaped document with formatting,
//                            paragraph-mark and row changes (which
//                            !Letters keeps but does not show); our
//                            insertion added elsewhere
//   tc-README.txt            the questions (TC1..), a PRIORITY list
//                            first
// Everything is done with !Letters' own commands (./RevTrack
// setTracking, typing through ./Typing, ./EditDel, ./RevCmd,
// ./CommentCmd, ./Bookmarks, ./TblInsert) on a Document. Each file
// is checked by the package lint (and xmllint with wml.xsd where
// available) and for range marks without their partner
// (./range-pairs.mjs) and for text in an element Word does not
// write there (./text-context.mjs: w:delText outside a w:del, w:t
// inside one): the generator stops on either; read back, and
// its revisions listed in the README as !Letters reads them, so the
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
import {deleteSelection} from '../../tools/moreapps/!Letters/EditDel';
import {setTracking} from '../../tools/moreapps/!Letters/RevTrack';
import {accept} from '../../tools/moreapps/!Letters/RevCmd';
import {list} from '../../tools/moreapps/!Letters/RevMarks';
import {settingsOf} from '../../tools/moreapps/!Letters/SettingsRead';
import {addComment} from '../../tools/moreapps/!Letters/CommentCmd';
import {addBookmark} from '../../tools/moreapps/!Letters/Bookmarks';
import {insertTable} from '../../tools/moreapps/!Letters/TblInsert';
import {scan, at as walkAt} from '../../tools/moreapps/!Letters/Walk';
import {OBJ} from '../../tools/moreapps/!Letters/Model';
import {readZip, writeZip} from '../../tools/moreapps/!WimpLib/Zip';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {buildDocx, documentXml, settingsXml, p, r}
  from './build-docx.mjs';
import {lintPackage} from './lint-package.mjs';
import {partsUnpaired} from './range-pairs.mjs';
import {partsMisplaced} from './text-context.mjs';
import {schemaChecker, extKey} from './roundtrip-lib.mjs';

const OUT = fileURLToPath(new URL('./corpus/handoff/',
  import.meta.url));
const DATE = new Date(Date.UTC(2026, 9, 30, 12));
// (local time: w:date is written as the local clock time with a Z,
// as Word writes it, ./RevTrack author)
const WHEN = new Date(2026, 9, 30, 14, 5, 30);
const TZ = -WHEN.getTimezoneOffset();
const ANN = 'Ann Example', BOB = 'Bob Sample';
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

/** A session on a Document, with a clock for Typing and the author
 *  of the recorded changes (as Tools > User name and initials). */
function session(doc) {
  const d = new Document(doc);
  d.clearHistory();
  let who = ANN;
  d.reviewer = () => ({name: who, now: WHEN});
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
   *  start. */
  const words = (start, word) => {
    const a = para(start);
    const i = plain(a).indexOf(word);
    if (i < 0) throw new Error('no ' + word);
    return S.select({id: a.id, off: offOf(a, i)}, {id: a.id,
      off: offOf(a, i + word.length)});
  };
  /** A caret after word (plain text) in the paragraph starting
   *  start. */
  const after = (start, word) => {
    const a = para(start);
    const i = plain(a).indexOf(word);
    if (i < 0) throw new Error('no ' + word);
    return S.caret({id: a.id, off: offOf(a, i + word.length)});
  };
  const s = {
    d, t, paras, para, words, after, offOf,
    as(name) { who = name; t.reset(); },
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
    track(on) {
      setTracking(d, t, on);
    },
    type(sel, text) { return t.type(sel, text); },
    del(sel) { return t.command(() => deleteSelection(d, sel)); },
  };
  return s;
}

/** A new document of the given lines (typed with tracking off). */
function fresh(text) {
  const s = session(newDoc({date: DATE}));
  s.write(text);
  return s;
}

const lines = [];
const say = (...x) => lines.push(...x);

// ----------------------------------------------------------- read back

const short = (s, n = 50) => (s.length > n ? s.slice(0, n) + '...'
  : s);
const dec = new TextDecoder();

/** The ids of the w:ins / w:del / w:moveFrom / w:moveTo elements of
 *  the main part that are used by more than one element. */
function sharedIds(bytes) {
  const n = new Map();
  const walk = (x) => {
    if (!x || typeof x !== 'object' || !x.name) return;
    const l = String(x.name).split(':').pop();
    if (/^(ins|del|moveFrom|moveTo)$/.test(l)) {
      const id = (x.attrs.find(([k]) => k === 'w:id') || [])[1];
      if (id !== undefined) n.set(id, (n.get(id) || 0) + 1);
    }
    for (const c of x.children || []) walk(c);
  };
  walk(parseXml(dec.decode(bytes).replace(/^﻿/, '')).root);
  return [...n].filter(([, k]) => k > 1).map(([id, k]) => id + ' (' +
    k + ' elements)');
}

/** What a written file holds: each revision as !Letters reads it. */
async function describe(bytes) {
  const doc = await readDocx(bytes);
  const out = [];
  const tr = settingsOf(doc).trackRevisions === true;
  out.push('  Track Changes (w:trackRevisions) in settings.xml: ' +
    (tr ? 'ON' : 'off'));
  const pnum = new Map();
  let k = 0;
  scan(doc, (b) => { if (b.type === 'p') pnum.set(b, ++k); });
  const es = list(doc);
  if (!es.length) {
    out.push('  (no tracked changes)');
    return out;
  }
  const KIND = {ins: 'inserted', del: 'deleted', mvFrom: 'moved from',
    mvTo: 'moved to'};
  out.push('  tracked changes in document order: paragraph, what,',
    '  w:id, author, w:date as written, text (kept: kept as read, not',
    '  changeable in !Letters):');
  for (const e of es) {
    const b = e.where.story ? null : walkAt(doc, e.where.block);
    const where = e.where.story ? 'in a header, footer or note'
      : pnum.has(b) ? 'p' + pnum.get(b) : 'in a table row';
    out.push(`    ${where}: ${KIND[e.kind]}, id ${e.id}, ` +
      `${e.author}, ${e.date === null ? 'NO DATE' : e.date}: ` +
      JSON.stringify(short(e.text)) + (e.move !== undefined
      ? ' (paired with id ' + e.move + ')' : '') +
      (e.editable ? '' : ' (kept)'));
  }
  const z = await readZip(bytes);
  const shared = sharedIds(z.get(doc.meta.mainPart));
  if (shared.length) {
    out.push('  w:id values used by more than one element: ' +
      shared.join(', '));
  }
  return out;
}

const made = [];
async function save(name, doc, about) {
  await saveBytes(name, await writeDocx(doc, {date: DATE}), about);
}

/** Check, write and describe the bytes of a .docx (see the header). */
async function saveBytes(name, bytes, about) {
  const z = await readZip(bytes);
  const problems = lintPackage(z).problems
    .filter((q) => q.level === 'error');
  if (problems.length) throw new Error(name + ': ' +
    JSON.stringify(problems));
  // (a range mark without its partner: Word's "unreadable content")
  const half = partsUnpaired(z);
  if (half.length) throw new Error(name + ': range marks unpaired: ' +
    half.join(', '));
  // (w:delText outside a w:del, w:t inside one: Word will not open a
  // w:moveFrom holding w:delText)
  const odd = partsMisplaced(z);
  if (odd.length) throw new Error(name + ': text elements out of ' +
    'place: ' + odd.join(', '));
  let schema = 'schema check skipped';
  if (typeof xsd !== 'string') {
    const main = (await readDocx(bytes)).meta.mainPart;
    schema = 'xmllint/wml.xsd: document.xml ' + [...xsd.errors(
      z.get(main))].filter((m) => !extKey(m) &&
      !m.includes('markup-compatibility')).length + ' messages';
  }
  made.push(`${name} (${bytes.length} bytes, ${put(name, bytes)}; ` +
    `lint clean; ${schema})`);
  say('', name, '-'.repeat(name.length), ...about, '',
    'What !Letters wrote (read back from the saved file):',
    ...await describe(bytes));
}

// ------------------------------------------------- Word-shaped parts

const D = '2026-10-01T09:00:00Z';
const att = (id, au = 'Word User', d = D) => `w:id="${id}"` +
  (au === null ? '' : ` w:author="${au}"`) +
  (d === null ? '' : ` w:date="${d}"`);
const run = (t, tag = 'w:t') => `<w:r><${tag} xml:space="preserve">` +
  `${t}</${tag}></w:r>`;
const ins = (id, t, au, d) => `<w:ins ${att(id, au, d)}>${run(t)}` +
  '</w:ins>';
const del = (id, t, au, d) => `<w:del ${att(id, au, d)}>` +
  `${run(t, 'w:delText')}</w:del>`;
const range = (side, id, name, inner) =>
  `<w:move${side}RangeStart ${att(id)} w:name="${name}"/>${inner}` +
  `<w:move${side}RangeEnd w:id="${id}"/>`;
const mvFrom = (id, t, name, rid) => range('From', rid, name,
  `<w:moveFrom ${att(id)}>${run(t)}</w:moveFrom>`);
const mvTo = (id, t, name, rid) => range('To', rid, name,
  `<w:moveTo ${att(id)}>${run(t)}</w:moveTo>`);
const TRACK = '<w:zoom w:percent="100"/><w:trackRevisions/>' +
  '<w:defaultTabStop w:val="720"/>';

/**
 * The main part's XML text x without the move ranges that hold no
 * moved text: each w:moveFromRangeStart / End (w:moveToRangeStart /
 * End) pair, matched by w:id, with no w:moveFrom (w:moveTo) element
 * between its marks, both marks removed (nothing else touched):
 * {xml, gone: ['moveFromRange 102', ...]}.
 */
function withoutEmptyMoves(x) {
  const gone = [];
  for (const [kind, el] of [['moveFromRange', 'moveFrom'],
    ['moveToRange', 'moveTo']]) {
    const starts = [...x.matchAll(new RegExp(`<w:${kind}Start ` +
      '[^>]*?w:id="(\\d+)"[^>]*/>', 'g'))];
    for (const m of starts) {
      const end = `<w:${kind}End w:id="${m[1]}"/>`;
      const a = x.indexOf(m[0]), z = x.indexOf(end, a);
      if (a < 0 || z < 0) continue;
      const inner = x.slice(a + m[0].length, z);
      if (new RegExp(`<w:${el}[\\s>]`).test(inner)) continue;
      x = x.slice(0, a) + inner + x.slice(z + end.length);
      gone.push(kind + ' ' + m[1]);
    }
  }
  return {xml: x, gone};
}

/** A Word-shaped .docx of body (Track Changes on): its bytes. */
const shapedBytes = (body) => buildDocx({
  'word/document.xml': documentXml(body),
  'word/settings.xml': settingsXml(TRACK)});

/** The same, opened in a session. */
async function shaped(body) {
  return session(await readDocx(await shapedBytes(body)));
}

// ----------------------------------------------------------- the files

// tc-1: made from scratch with our commands
{
  const s = fresh('Made by !Letters\n' +
    'This document was made new in !Letters, then Track Changes was ' +
    'switched on (Tools > Track Changes) and the changes below were ' +
    'typed and deleted.\n' +
    'Ann inserted words here and deleted some others.\n' +
    'Bob typed inside Ann\'s insertion in this paragraph.\n' + LOREM);
  s.track(true);
  s.type(s.after('Ann inserted words here', 'here'),
    ' (an insertion by Ann)');
  s.del(s.words('Ann inserted', ' some others'));
  s.type(s.after('Bob typed', 'paragraph.'),
    ' Ann wrote this sentence.');
  s.as(BOB);
  s.type(s.after('Bob typed', 'Ann wrote'), ' (Bob)');
  s.del(s.words('The quick', ' lazy'));
  await save('tc-1-from-scratch.docx', s.d.doc, [
    'A new document (File > New), text typed, then Tools > Track',
    'Changes switched on. As Ann Example (Tools > User name and',
    'initials): " (an insertion by Ann)" typed after "here", and',
    '" some others" selected and deleted. Ann then typed " Ann wrote',
    'this sentence." at the end of the fourth paragraph. As Bob',
    'Sample: " (Bob)" typed in the MIDDLE of Ann\'s insertion (so',
    'Ann\'s insertion is split: its second part gets a new id), and',
    '" lazy" deleted in the last paragraph.',
    `Dates: 2026-10-30 14:05:30 local time (this machine: UTC${TZ >= 0
      ? '+' : '-'}${Math.abs(TZ / 60)}), written as w:date ` +
    '"2026-10-30T14:05:30Z" (local clock time with a Z, no ' +
    'w16du:dateUtc).']);
}

// tc-2: moves (tc-2a: the same moves as made, not opened; tc-2b:
// tc-2 without its move ranges that hold no moved text)
{
  // (labels: the paragraphs' leading words, A, B and C)
  const moves = (a, b, c) =>
    p(r(a) + mvFrom(1, 'alpha words', 'moveA', 101) + r(' end.')) +
    p(r(b) + mvFrom(2, 'beta words', 'moveB', 102) + r(' end.')) +
    p(r(c) + mvFrom(3, 'gamma words', 'moveC', 103) + r(' end.')) +
    p(r(LOREM)) +
    p(r('New places: ') + mvTo(4, 'alpha words', 'moveA', 104) +
      r(' / ') + mvTo(5, 'beta words', 'moveB', 105) + r(' / ') +
      mvTo(6, 'gamma words', 'moveC', 106) + r(' end.'));
  const body = moves('Move A, untouched, old place: ',
    'Move B, accepted in !Letters, old place: ',
    'Move C, its new place deleted, old place: ');
  await saveBytes('tc-2a-move-untouched.docx', await shapedBytes(
    moves('Move A, old place: ', 'Move B, old place: ',
      'Move C, old place: ')),
  [
    'The Word-shaped document tc-2-move.docx starts from, exactly as',
    'the test builds it: never opened or saved by !Letters. Three',
    'moves by "Word User" (moveA, moveB, moveC), each a moveFrom and',
    'a moveTo inside named move ranges. A control: if tc-2-move.docx',
    'does not open in Word, does this one? (If not, the problem is in',
    'the made-up input, not in !Letters\' edits.)']);
  const s = await shaped(body);
  s.d.markup = 'all';
  s.t.command(() => accept(s.d, s.t, s.after('New places', 'beta')));
  s.track(false);
  s.del(s.words('New places', 'gamma words'));
  s.track(true);
  await save('tc-2-move.docx', s.d.doc, [
    'A Word-shaped document (made by the test, not by Word) with three',
    'moves by "Word User", each a moveFrom and a moveTo inside named',
    'move ranges (moveA, moveB, moveC). Opened in !Letters (All',
    'Markup): move B accepted with Tools > Accept at its new place',
    '(the old text removed, the new text kept untagged, as a pair).',
    'Then, with Track Changes switched OFF, the new place of move C',
    '("gamma words") deleted: !Letters turns the old place, which has',
    'lost its partner, into a plain tracked deletion (same id, author',
    'and date). Track Changes switched on again. The move range marks',
    'of B are left where they were; move C\'s range start, deleted',
    'with the text, is put back where the text was (an empty range:',
    'a range is never left with one mark, TC5).']);
  const bytes = await writeDocx(s.d.doc, {date: DATE});
  const z = await readZip(bytes);
  const main = s.d.doc.meta.mainPart;
  const {xml, gone} = withoutEmptyMoves(dec.decode(z.get(main)));
  z.set(main, new TextEncoder().encode(xml));
  await saveBytes('tc-2b-move-no-empty-ranges.docx', await writeZip(z,
    {date: DATE}), [
    'tc-2-move.docx as saved by !Letters, then its document.xml',
    'changed by the test (not by !Letters): every move range whose',
    'marks hold no moved text (no w:moveFrom or w:moveTo between',
    'them) taken out, its start and end together:',
    '  ' + gone.join(', '),
    'A bisect step: if tc-2-move.docx does not open in Word but this',
    'one does, those empty or dangling move ranges are the cause',
    '(TC5).']);
}

// tc-3: many authors
{
  const s = fresh('Six authors\n' + Array.from({length: 6}, (_, k) =>
    `Sentence ${k + 1}: alpha beta gamma delta.`).join('\n'));
  s.track(true);
  const who = [ANN, BOB, 'Zoë Ünal', 'Chen 中文',
    'O\'Brien & <Co>', 'A reviewer with a rather long name, ' +
    'Department of Examples'];
  who.forEach((w, k) => {
    s.as(w);
    s.type(s.after(`Sentence ${k + 1}:`, 'beta'), ' inserted by ' +
      (k + 1));
    s.del(s.words(`Sentence ${k + 1}:`, ' gamma'));
  });
  await save('tc-3-many-authors.docx', s.d.doc, [
    'Six authors in turn (Tools > User name and initials), each',
    'inserting words after "beta" and deleting " gamma" in their own',
    'sentence. Names: Ann Example, Bob Sample, a name with accents',
    '(U+00EB, U+00DC), one with Chinese characters, "O\'Brien & <Co>"',
    '(XML special characters), and a long one.']);
}

// tc-4: in table cells
{
  const s = fresh('Changes in a table\nThe table follows.\n' +
    'After the table.');
  const t0 = s.para('The table follows');
  if (!insertTable(s.d, S.caret({id: t0.id, off: t0.text.length}),
    {cols: 2, rows: 2})) throw new Error('insertTable');
  const cells = s.paras().filter((b) => b.text === '');
  const texts = ['Top left cell text', 'Top right', 'Bottom left',
    'Bottom right cell'];
  cells.slice(0, 4).forEach((b, k) => s.t.type(S.caret({id: b.id,
    off: 0}), texts[k]));
  s.track(true);
  s.type(s.after('Top left', 'left'), ' (inserted in a cell)');
  s.as(BOB);
  s.del(s.words('Bottom right', ' cell'));
  s.type(s.after('Bottom left', 'left'), ' and more');
  await save('tc-4-table-cell.docx', s.d.doc, [
    'Insert > Table 2 x 2 and the cells typed with Track Changes off;',
    'then switched on: Ann inserted words in the top left cell, Bob',
    'deleted " cell" in the bottom right cell and inserted " and',
    'more" in the bottom left one.']);
}

// tc-5: fifty
{
  let text = '50 tracked changes';
  for (let k = 1; k <= 10; k++) {
    text += `\nParagraph ${k}: alpha beta gamma delta epsilon end.`;
  }
  const s = fresh(text);
  s.track(true);
  const W = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
  let n = 0;
  for (let k = 1; k <= 10; k++) {
    for (const w of W) {
      n++;
      s.as(n % 2 ? ANN : BOB);
      if (n % 3) s.type(s.after(`Paragraph ${k}:`, w), ' +' + n);
      else s.del(s.words(`Paragraph ${k}:`, w));
    }
  }
  await save('tc-5-fifty.docx', s.d.doc, [
    'Ten paragraphs, a change at each of five words of each (50, Ann',
    'and Bob in turn): every third word deleted, " +n" typed after',
    'the others.']);
}

// tc-6: tracking on, nothing changed
{
  const s = fresh('Track Changes on, nothing tracked\nThis text was ' +
    'typed with Track Changes off; then Tools > Track Changes was ' +
    'switched on and the file saved.');
  s.track(true);
  await save('tc-6-tracking-on.docx', s.d.doc, [
    'A new document, typed with Track Changes off, then Track Changes',
    'switched on and saved with no change made: settings.xml has',
    'w:trackRevisions and the body no revision.']);
}

// tc-7: no author, no date
{
  const s = await shaped(
    p(r('No author: ') + ins(1, 'inserted text', null) + r(' end.')) +
    p(r('No date: ') + del(2, 'deleted text', 'Word User', null) +
      r(' end.')) +
    p(r('Neither: ') + ins(3, 'inserted text', null, null) +
      r(' end.')) +
    p(r('Ours: typed here.')));
  s.type(s.after('Ours:', 'typed'), ' (Ann, tracked)');
  await save('tc-7-no-author-date.docx', s.d.doc, [
    'A Word-shaped document (made by the test): an insertion with no',
    'w:author, a deletion with no w:date, an insertion with neither.',
    'Opened in !Letters (which shows them as "Unknown author" with no',
    'date and writes them back as read), and our own tracked',
    'insertion typed in the last paragraph. (wml.xsd requires',
    'w:author: xmllint\'s one message here is about the revisions',
    'without one, as the file was made.)']);
}

// tc-8: one insertion across two paragraphs
{
  const s = fresh('One insertion in two paragraphs\nThe insertion ' +
    'starts at the end of this paragraph.');
  s.track(true);
  s.type(s.after('The insertion', 'paragraph.'),
    ' First part of the insertion,\nand its second part after Enter.');
  await save('tc-8-two-paragraphs.docx', s.d.doc, [
    'With Track Changes on, text typed (pasted as one piece) at the',
    'end of a paragraph, holding a paragraph break: !Letters splits',
    'the paragraph (the break itself is not tracked) and the text on',
    'both sides is ONE insertion: one w:id in two w:ins elements, one',
    'in each paragraph (TC4).']);
}

// tc-9: a deletion holding a bookmark and a comment's range
{
  const s = fresh('Deleted marks\nThe words in this sentence hold a ' +
    'bookmark and a comment, and are deleted.\n' + LOREM);
  const bm = addBookmark(s.d, s.t, s.words('The words', 'bookmark'),
    'Kept');
  if (!bm || bm.error) throw new Error('bookmark');
  const c = addComment(s.d, s.t, s.words('The words', 'comment'),
    {text: 'A comment on deleted text.', author: ANN, initials: 'AE',
      date: WHEN});
  if (!c || c.id === undefined) throw new Error('comment');
  s.track(true);
  s.del(s.words('The words', 'hold a bookmark and a comment,'));
  await save('tc-9-deleted-marks.docx', s.d.doc, [
    'A bookmark "Kept" on the word "bookmark" and a comment on the',
    'word "comment" (Insert > Bookmark, Insert > Comment), then, with',
    'Track Changes on, "hold a bookmark and a comment," selected and',
    'deleted: one tracked deletion whose element holds the',
    'bookmarkStart/End and commentRangeStart/End marks and the run',
    'of the comment\'s reference.']);
}

// tc-10: Word's formatting, paragraph-mark and row changes kept
{
  const s = await shaped(
    p(r('Bold, a tracked formatting change.', '<w:b/><w:rPrChange ' +
      att(11) + '><w:rPr/></w:rPrChange>'), '<w:jc w:val="center"/>' +
      `<w:pPrChange ${att(12)}><w:pPr/></w:pPrChange>`) +
    p(r('This paragraph mark was inserted (Enter tracked).'),
      `<w:rPr><w:ins ${att(13)}/></w:rPr>`) +
    p(r('Next paragraph.')) +
    '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>' +
    '<w:tblGrid><w:gridCol w:w="4000"/></w:tblGrid><w:tr><w:trPr>' +
    `<w:ins ${att(14)}/></w:trPr><w:tc><w:tcPr><w:tcW w:w="4000" ` +
    'w:type="dxa"/></w:tcPr>' + p(ins(15, 'An inserted row.')) +
    '</w:tc></w:tr></w:tbl>' +
    p(r('Ours: typed here.')));
  s.type(s.after('Ours:', 'typed'), ' (Ann, tracked)');
  await save('tc-10-formatting.docx', s.d.doc, [
    'A Word-shaped document (made by the test): a formatting change',
    '(bold, w:rPrChange), a paragraph property change (centred,',
    'w:pPrChange), an inserted paragraph mark (w:ins in the mark\'s',
    'w:rPr) and an inserted table row (w:ins in w:trPr) holding an',
    'inserted text. !Letters lists the row and its text (kept: such',
    'a table is kept whole, as read); the formatting, paragraph and',
    'paragraph-mark changes are kept as read but not listed. Our own',
    'tracked insertion typed in the last paragraph.']);
}

// ------------------------------------------------------------ README

const README = [
  'Tracked changes (!Letters Batch F2: Tools > Track Changes',
  '(Ctrl+Shift+E), typing and deleting recorded, Tools > Accept,',
  'Reject, Accept All, Reject All, Show Markup (All Markup, Final,',
  'Original), the Changes pane, Previous / Next Change',
  '(Alt+Shift+Up / Alt+Shift+Down)): the real-Word hand-off (made by',
  'node tests/moreapps/handoff-changes.mjs; local only, this folder',
  'is never committed)',
  '',
  'Every file was made, or opened and changed, with !Letters\' own',
  'commands. Each was written, checked by the package lint, read',
  'back by !Letters, and its tracked changes are listed below under',
  'the file (paragraph, kind, w:id, author, date, text), so the list',
  'is what was really written. Look at each in Word with Review >',
  'Track Changes > All Markup, and the Reviewing Pane (Review >',
  'Reviewing Pane).',
  '',
  'Note for the owner: the keys. Track Changes is Ctrl+Shift+E, as in',
  'Word. Word has no default keys for Next / Previous Change;',
  '!Letters uses Alt+Shift+Down / Alt+Shift+Up (Alt+Down / Alt+Up',
  'are the footnote keys in !Letters, and Alt+Shift with an arrow',
  'types no character on any keyboard). Accept and Reject have no',
  'key, as in Word. Say if you want other keys (TC14).',
  '',
  'tc-2-move failed to open in Word because the old place of each',
  'move (w:moveFrom) held its text in w:delText instead of w:t. Word',
  'writes w:t in both places of a move (w:delText only in a',
  'deletion) and will not open a w:moveFrom holding w:delText: the',
  'tc-2d / tc-2f bisect showed it (tc-2f, with w:delText, did not',
  'open; tc-2d, the same with w:t, did). Fixed: !Letters now reads',
  'and writes w:t there, and tc-2, tc-2a and tc-2b were made again',
  'with it; all three are now expected to open. (An orphan move',
  'range end, found before, was fixed too.) The bisect files tc-2c,',
  'tc-2d, tc-2e and tc-2f are left as they were.',
  '',
  'PRIORITY: the questions may be too many for one session. Take',
  'these first, in this order: the files Word could refuse or',
  'repair, then the guesses about Word that !Letters writes into',
  'every file with tracked changes. Everything else is "if time',
  'allows".',
  '',
  '  1. tc-1-from-scratch: TC1, TC2 (the most important file: every',
  '     change in it was made by !Letters. Does Word open it without',
  '     a repair prompt? Are the authors and the times right?)',
  '  2. Smoke test: open EVERY tc-*.docx once. Note any repair',
  '     prompt or "unreadable content" message and which file. TC3.',
  '  3. TC2 (dates: local clock time with a Z, no dateUtc).',
  '  4. TC4 (our w:id values: from 0, one id in two paragraphs, a',
  '     split insertion renumbered).',
  '  5. TC5 (moves shown as moves; range marks left after one was',
  '     resolved).',
  '  6. TC6 (the Track Changes switch kept), TC7 (w: prefix).',
  '  7. TC8 (deleted text holding a bookmark and a comment), TC9',
  '     (no author or date), TC10 (formatting changes kept).',
  '',
  'The guesses about Word that !Letters makes (none could be checked',
  'without Word; each is asked below):',
  '  - w:date is the LOCAL clock time with a Z, to the second, as',
  '    Word was seen to write comment dates; no w16du:dateUtc is',
  '    written: TC2',
  '  - the first w:id in a document with no revisions is 0; later',
  '    ones count up from the largest revision-family id in the',
  '    file: TC4',
  '  - one insertion typed across a paragraph break is written as two',
  '    w:ins elements with ONE w:id (one in each paragraph): TC4',
  '  - typing inside another author\'s insertion splits it; the part',
  '    after the new text gets a NEW id (same author and date): TC4',
  '  - typing inside a moved text (not made by the files here, but',
  '    possible) leaves two w:moveTo elements with one id: TC4',
  '  - a move resolved, or one whose partner was deleted, leaves its',
  '    w:moveFromRangeStart/End or w:moveToRangeStart/End marks in',
  '    place (a mark deleted with the text is put back where the text',
  '    was, so a range keeps both marks, maybe with nothing between',
  '    them); a half that lost its partner becomes a plain w:del or',
  '    w:ins inside the old move range: TC5',
  '  - new elements (w:ins, w:del and their w:id, w:author, w:date)',
  '    are written with the literal prefix w:, the prefix the',
  '    document element binds in every file Word writes: TC7',
  '  - w:trackRevisions is written (or removed) in settings.xml as',
  '    Word writes it, the rest of the part left as it was: TC6',
  '  - a tracked deletion of text holding bookmark and comment marks',
  '    puts those marks INSIDE the w:del element (between its runs):',
  '    TC8',
  '  - a revision with no w:author or no w:date is kept so, never',
  '    given a made-up one: TC9',
  '  - formatting, paragraph-mark and table changes are kept exactly',
  '    as read but neither shown nor recorded: TC10',
  '  - a move resolves as a pair, whole, from either half: TC11',
  '',
  'Questions',
  '---------',
  'TC1 tc-1: does Word open it with no message? Review > All Markup:',
  '    are there an insertion " (an insertion by Ann)" and a',
  '    deletion " some others" by Ann Example, Ann\'s insertion "',
  '    Ann wrote this sentence." with Bob Sample\'s " (Bob)" inside',
  '    it, and Bob\'s deletion " lazy"? Does the Reviewing Pane list',
  '    them with those authors? Accept All and Reject All in Word: is',
  '    the text then what !Letters\' Final and Original views show?',
  '    Save a copy in Word and, if you can, send it back.',
  'TC2 Dates: tc-1\'s changes say 2026-10-30 14:05:30 (written',
  '    w:date="2026-10-30T14:05:30Z": the local clock time of the',
  '    machine that made them, with a Z). What time does Word show',
  '    in the balloon or the Reviewing Pane: 14:05, or shifted by the',
  '    time zone? After a save in Word, does Word add a',
  '    w16du:dateUtc to them (unzip word/document.xml)?',
  'TC3 Any tc-*.docx with a repair prompt, a lost change, a change on',
  '    the wrong text, or a change shown by the wrong author? (Which',
  '    file, which change.)',
  'TC4 Our ids (unzip word/document.xml if you can): in tc-1 the ids',
  '    start at 0. In tc-8 one insertion is two w:ins elements with',
  '    the same w:id, one in each paragraph: does Word show it as one',
  '    change or two, and does it open cleanly? In tc-1 Ann\'s',
  '    insertion was split by Bob\'s text: its two parts have',
  '    DIFFERENT ids (the second one new). Does Word show them as',
  '    one insertion or two? In Word, type inside someone else\'s',
  '    insertion and save: what ids does Word write?',
  'TC5 tc-2: is move A shown as a move (Word\'s green double',
  '    strikethrough and double underline, "Moved" in the pane), not',
  '    as a deletion and an insertion? Move B was accepted in',
  '    !Letters: is "beta words" now plain text at the new place',
  '    only, with nothing left at the old place? Move C\'s new place',
  '    was deleted: is "gamma words" at the old place shown as a',
  '    plain deletion? !Letters left the move range marks of B and C',
  '    in the file (B\'s from-range now empty, C\'s to-range empty',
  '    where "gamma words" was): does Word show anything for them (an',
  '    empty move, a balloon), repair the file, or ignore them? Does',
  '    tc-2a-move-untouched (the input, never opened by !Letters)',
  '    open cleanly and show the three moves? Does',
  '    tc-2b-move-no-empty-ranges (tc-2 without those ranges) open',
  '    cleanly? (All three now hold the moved-away text in w:t, as',
  '    Word writes it; before, w:delText there made Word refuse',
  '    tc-2 and tc-2a. If one still does not open, which?)',
  'TC6 Track Changes state: tc-6 was saved with Track Changes on and',
  '    no change. Does Word open it with Track Changes on (the',
  '    Review > Track Changes button highlighted, typing tracked)?',
  '    Is it still on after a save in Word? tc-1, tc-3, tc-4, tc-5,',
  '    tc-8 and tc-9 also have it on.',
  'TC7 The w: prefix: !Letters writes new w:ins and w:del elements',
  '    and their attributes with the prefix w:, as Word does. Every',
  '    tc file uses w: for the WordprocessingML namespace, so this',
  '    only matters for files that bind it to another prefix (none',
  '    seen from Word). Nothing to check in Word unless one of the',
  '    files above fails to open.',
  'TC8 tc-9: the deleted text holds the bookmark "Kept" and the',
  '    comment\'s range: does Word show the deletion, the comment',
  '    (on deleted text) and the bookmark (Insert > Bookmark, Show',
  '    hidden bookmarks)? Accept the deletion in Word: are the',
  '    bookmark and the comment then removed, kept at the deletion\'s',
  '    place, or kept with no range?',
  'TC9 tc-7: three changes have no author or no date (as some other',
  '    tools write them). How does Word show them ("Unknown",',
  '    "Author", no date)? Does Word keep them after a save, or give',
  '    them an author or a date?',
  'TC10 tc-10: !Letters kept the bold formatting change, the',
  '    paragraph change, the inserted paragraph mark and the inserted',
  '    row exactly as read. Does Word still show all four (Review >',
  '    All Markup: "Formatted", the change bar, the row marked',
  '    inserted)? Is our own insertion "(Ann, tracked)" there too?',
  'TC11 Moves in !Letters resolve as a PAIR, whole: accepting or',
  '    rejecting either half resolves both. In Word, accept only the',
  '    moved-from half of a move (right-click it): does Word resolve',
  '    just that half, or both?',
  'TC12 tc-3: are the six authors shown with their names as listed',
  '    (accents, Chinese characters, "O\'Brien & <Co>", the long',
  '    name), each in a colour of its own?',
  'TC13 tc-4 and tc-5: are the changes in the table cells and the 50',
  '    changes where the README says? Anything slow or odd with 50?',
  'TC14 The keys: Ctrl+Shift+E switches Track Changes in Word and in',
  '    !Letters. !Letters uses Alt+Shift+Down / Alt+Shift+Up for',
  '    Next / Previous Change (Word has no default key for them).',
  '    Owner: keep these, or choose others?',
  'TC15 Display: !Letters shows inserted text underlined and deleted',
  '    text struck through in the author\'s colour, moves with double',
  '    lines, a change bar left of the text, and no balloons in the',
  '    margin (Show Markup > All Markup). Look at tc-5 in Word: is',
  '    anything about Word\'s display worth copying?',
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
const how = put('tc-README.txt', Buffer.from(
  README.map(ascii).flatMap(wrap).join('\n'), 'ascii'));
made.push(`tc-README.txt (${how})`);
console.log('hand-off files in ' + OUT + ':\n  ' + made.join('\n  '));
if (typeof xsd !== 'string') xsd.done();
