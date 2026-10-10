// Generates the real-Word hand-off files for !Word's hyperlinks,
// bookmarks and format painter (local only, never committed:
// tests/moreapps/corpus/ is git-ignored). Not a test:
//
//   node tests/moreapps/handoff-links.mjs
//
// Writes into tests/moreapps/corpus/handoff/ (made if missing):
//   lnk-1-links.docx   a link of each kind (web, mailto, ftp, a short
//                      address, a ScreenTip, formatted text, a link to
//                      a bookmark), one edited and one removed again
//   bm-1-bookmarks.docx  bookmarks over one word, over three
//                      paragraphs, at a caret, nested, overlapping,
//                      one moved by adding its name again, one
//                      deleted; two hidden ones that came with the file
//   paint-1.docx       the format painter: a word painted over,
//                      replacing a format, a paragraph format, a list
//                      item and a character style
//   lnk-README.txt     what Word should show, the open questions
//                      (H.., BM.., FP.., W..) and the word counts
//                      !Word shows for each file
// Everything is done with !Word's own commands (LinkOps, Bookmarks,
// FormatPaint through FormatApply for the formats, typing) on a
// Document, as the window makes them. A file is written only when its
// bytes change, so a file open in Word is left alone; nothing else in
// the folder is touched or removed. Each file is read back and its
// links, bookmarks and formats listed in the README, so the list is
// what was really written.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {newDoc} from '../../tools/moreapps/!Word/NewDoc';
import {Document} from '../../tools/moreapps/!Word/Document';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {apply} from '../../tools/moreapps/!Word/FormatApply';
import {run} from '../../tools/moreapps/!Word/EditApply';
import * as S from '../../tools/moreapps/!Word/Selection';
import * as E from '../../tools/moreapps/!Word/Edit';
import * as LO from '../../tools/moreapps/!Word/LinkOps';
import * as BM from '../../tools/moreapps/!Word/Bookmarks';
import * as FP from '../../tools/moreapps/!Word/FormatPaint';
import {count} from '../../tools/moreapps/!Word/WordCount';
import {BULLETS} from '../../tools/moreapps/!Word/ListGallery';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {buildDocx, documentXml, p, r}
  from './build-docx.mjs';
import {lintPackage} from './lint-package.mjs';
import {rng} from './word-docs.mjs';

// (a new list definition gets a random nsid: seeded, so a re-run
// writes the same bytes)
Math.random = rng(20261010);

const OUT = fileURLToPath(new URL('./corpus/handoff/', import.meta.url));
const DATE = new Date(Date.UTC(2026, 9, 9, 12));
fs.mkdirSync(OUT, {recursive: true});

/** Write bytes to name unless the file already holds them. */
function put(name, bytes) {
  const f = path.join(OUT, name);
  const b = Buffer.from(bytes);
  if (fs.existsSync(f) && fs.readFileSync(f).equals(b)) return 'same';
  fs.writeFileSync(f, b);
  return 'written';
}

/** A session on a Document, with a clock for Typing. */
function session(doc) {
  const d = new Document(doc);
  d.clearHistory();
  let now = 0;
  const t = new Typing(d, {now: () => now});
  const all = () => d.doc.sections.flatMap((s) => s.blocks);
  const para = (start) => {
    const b = all().find((x) => x.type === 'p' &&
      x.text.replace(/\uFFFC/g, '').startsWith(start));
    if (!b) throw new Error('no paragraph starting ' + JSON.stringify(start));
    return b;
  };
  const S1 = {
    d, t, para, all,
    caret: (start, off = 0) => S.caret({id: para(start).id,
      off: off === 'end' ? para(start).text.length : off}),
    over: (a, b) => S.select({id: para(a).id, off: 0},
      {id: para(b).id, off: para(b).text.length}),
    /** The text `what` inside the paragraph starting with start. */
    word: (start, what) => {
      const t = para(start).text;
      const raw = [];          // raw offset of each visible character
      for (let k = 0; k < t.length; k++) if (t[k] !== '\uFFFC') raw.push(k);
      const plain = raw.map((k) => t[k]).join('');
      const k = plain.indexOf(what);
      if (k < 0) throw new Error(`no ${what} in ${start}`);
      return S.select({id: para(start).id, off: raw[k]},
        {id: para(start).id, off: raw[k + what.length - 1] + 1});
    },
    type(sel, text) {
      for (const ch of text) { now += 50; sel = t.type(sel, ch); }
      return sel;
    },
    enter(sel) { return t.command(() => E.splitPara(d, sel)); },
    fmt(id, sel, arg) { now += 2000; return apply(id, d, t, sel, arg).sel; },
    key(id, sel) {
      now += 2000;
      const res = run(id, d, t, sel);
      if (!res) throw new Error(id + ' did nothing');
      return res.sel || res;
    },
    link(sel, o) {
      now += 2000;
      const res = LO.insertLink(d, t, sel, o);
      if (res.error) throw new Error('insertLink: ' + res.error);
      return res.sel;
    },
    editLink(sel, o) {
      now += 2000;
      const res = LO.editLink(d, t, sel, o);
      if (res.error) throw new Error('editLink: ' + res.error);
      return res.sel;
    },
    unlink(sel) {
      now += 2000;
      const res = LO.removeLink(d, t, sel);
      if (res.error) throw new Error('removeLink: ' + res.error);
      return res.sel;
    },
    mark(sel, name) {
      now += 2000;
      const res = BM.addBookmark(d, t, sel, name);
      if (res.error) throw new Error('addBookmark: ' + res.error);
      return res.sel;
    },
    unmark(name) {
      now += 2000;
      const res = BM.deleteBookmark(d, t, name);
      if (res.error) throw new Error('deleteBookmark: ' + res.error);
    },
    paint(from, to) {
      now += 2000;
      const picked = FP.pick(d.doc, from);
      if (!picked) throw new Error('nothing to pick');
      return FP.paint(d, t, to, picked);
    },
  };
  return S1;
}

const lines = [];
const say = (...x) => lines.push(...x);

// ------------------------------------------------------------ read back

const O = '￼';
const fmtRun = (x) => [x.rPr.b && 'bold', x.rPr.i && 'italic',
  x.rPr.u && 'underline', x.rPr.color && 'colour ' + x.rPr.color,
  x.rPr.sz && 'size ' + x.rPr.sz / 2 + ' pt', x.rStyle && 'style ' +
  x.rStyle].filter(Boolean).join(', ');

/** What a written file holds: links, bookmarks, formats, per paragraph. */
async function describe(bytes) {
  const doc = await readDocx(bytes);
  const rels = new Map(doc.rels.map((x) => [x.id, x]));
  const out = [];
  let k = 0;
  for (const sec of doc.sections) {
    for (const b of sec.blocks) {
      k++;
      if (b.type !== 'p') { out.push(`  ${String(k).padStart(2)}. (kept block)`); continue; }
      const shown = b.text.replace(/￼/g, '[item]').slice(0, 100);
      out.push(`  ${String(k).padStart(2)}. ${shown}${b.pStyle ? '   [' + b.pStyle + ']' : ''}`);
      for (const [off, x] of Object.entries(b.inlines || {})) {
        const n = x.node;
        if (!n) continue;
        const at = Object.fromEntries(n.attrs || []);
        if (n.name === 'w:hyperlink') {
          const rel = at['r:id'] ? rels.get(at['r:id']) : null;
          out.push(`      link at ${off}: "${x.text || ''}" -> ` +
            (at['w:anchor'] ? `bookmark ${at['w:anchor']}` :
              `${rel ? rel.target : '(no relationship ' + at['r:id'] + ')'}`) +
            (at['w:tooltip'] ? `, ScreenTip "${at['w:tooltip']}"` : ''));
        } else if (n.name === 'w:bookmarkStart') {
          out.push(`      bookmark ${at['w:name']} (id ${at['w:id']}) starts at ${off}`);
        } else if (n.name === 'w:bookmarkEnd') {
          out.push(`      bookmark id ${at['w:id']} ends at ${off}`);
        }
      }
      const pf = [b.pPr.jc && 'align ' + b.pPr.jc, b.pPr.numPr && 'list',
        b.pPr.spacing && 'spacing ' + JSON.stringify(b.pPr.spacing),
        b.pPr.ind && 'ind ' + JSON.stringify(b.pPr.ind)].filter(Boolean);
      if (pf.length) out.push('      paragraph: ' + pf.join(', '));
      for (const x of b.runs || []) {
        const f = fmtRun(x);
        if (f) out.push(`      chars ${x.start}-${x.end}: ${f}`);
      }
    }
  }
  const c = count(doc);
  return {out, count: c, doc};
}

const made = [];
const counts = [];
async function save(name, doc, about) {
  const bytes = await writeDocx(doc, {date: DATE});
  const problems = lintPackage(await readZip(bytes)).problems
    .filter((q) => q.level === 'error');
  if (problems.length) throw new Error(name + ': ' + JSON.stringify(problems));
  made.push(`${name} (${bytes.length} bytes, ${put(name, bytes)})`);
  const got = await describe(bytes);
  const c = got.count;
  counts.push(`  ${name.padEnd(22)} words ${String(c.words).padStart(4)}   ` +
    `characters (no spaces) ${String(c.charsNoSpaces).padStart(5)}   ` +
    `characters (with spaces) ${String(c.chars).padStart(5)}   ` +
    `paragraphs ${String(c.paras).padStart(3)}`);
  say('', name, '-'.repeat(name.length), ...about, '',
    'What !Word wrote (read back from the saved file: each paragraph',
    'with its links, bookmarks and formats):', ...got.out);
}

/** Type paragraphs (the first into the empty one) into a session. */
function typeParas(s, texts) {
  let c = S.caret({id: s.all()[0].id, off: 0});
  texts.forEach((t, k) => {
    if (k) c = s.enter(c);
    c = s.type(c, t);
  });
}

// ------------------------------------------------------------ 1: links

{
  const s = session(newDoc({date: DATE}));
  typeParas(s, [
    'Links in !Word: each line has one, made with Ctrl-K',
    'Web link: visit the example site for details',
    'Mail link: write to someone at the example domain',
    'FTP link: download the readme file',
    'Short address: go to www.example.org without typing http',
    'ScreenTip: hover over this link to see its tip',
    'Formatted text: this bold italic phrase is the link',
    'Address with a space and an ampersand: look here',
    'Link to a bookmark: jump to the target below',
    'Edited link: its text and address were changed afterwards',
    'Removed link: this link was made and removed again',
    'Bookmark target: this is where the bookmark link goes',
    'End: plain text',
  ]);
  s.link(s.word('Web link', 'the example site'), {address: 'https://example.org/'});
  s.link(s.word('Mail link', 'someone at the example domain'),
    {address: 'mailto:someone@example.org'});
  s.link(s.word('FTP link', 'the readme file'),
    {address: 'ftp://files.example.org/pub/readme.txt'});
  s.link(s.word('Short address', 'www.example.org'), {address: 'www.example.org'});
  s.link(s.word('ScreenTip', 'this link'),
    {address: 'https://example.org/tip', tip: 'This is a ScreenTip'});
  const f = s.word('Formatted text', 'bold italic phrase');
  s.fmt('bold', f);
  s.fmt('italic', f);
  s.link(f, {address: 'https://example.org/formatted'});
  s.link(s.word('Address with', 'look here'),
    {address: 'https://example.org/a b/c?x=1&y=2'});
  s.mark(s.word('Bookmark target', 'where the bookmark link goes'), 'Target1');
  s.link(s.word('Link to a bookmark', 'the target below'), {anchor: 'Target1'});
  s.link(s.word('Edited link', 'its text and address'), {address: 'https://example.org/old'});
  const ed = s.para('Edited link');
  s.editLink(S.select({id: ed.id, off: ed.text.indexOf(O)},
    {id: ed.id, off: ed.text.indexOf(O) + 1}),
  {text: 'its NEW text and address', address: 'https://example.org/new',
    tip: 'edited'});
  s.link(s.word('Removed link', 'this link'), {address: 'https://example.org/removed'});
  const rm = s.para('Removed link');
  s.unlink(S.select({id: rm.id, off: rm.text.indexOf(O)},
    {id: rm.id, off: rm.text.indexOf(O) + 1}));
  await save('lnk-1-links.docx', s.d.doc, [
    'A new document. Lines 2..4 hold a web, a mail and an FTP link.',
    'Line 5 was typed as www.example.org: !Word writes http:// in',
    'front. Line 6 has a ScreenTip (w:tooltip). Line 7 is a bold',
    'italic phrase made a link (each run keeps its own formatting;',
    'the Hyperlink character style is added). Line 8 has a space and',
    '& in its address (written as %20 and &amp;). Line 9 links to a',
    'bookmark of line 12 (w:anchor, no relationship). Line 10 was',
    'edited: new text, a new address, a tip (the old relationship',
    'stays in the file, unused: H2). Line 11 had its link removed',
    '(the relationship stays too). Word should open it with no',
    'repair prompt, show the links blue and underlined (the',
    'Hyperlink style: H3), open the right addresses with',
    'Ctrl+click (no link is ever opened by !Word) and go to the',
    'bookmark on line 12 from line 9.',
  ]);
}

// ------------------------------------------------------------ 2: bookmarks

{
  const hidden = '<w:bookmarkStart w:id="0" w:name="_Toc100000001"/>' +
    '<w:bookmarkEnd w:id="0"/>';
  const start = await buildDocx({'word/document.xml': documentXml(
    p(hidden + r('Heading from the file (a hidden _Toc bookmark)')) +
    p(r('Paragraph two of the file')) +
    p(r('Paragraph three of the file')) +
    p(r('Paragraph four, with a bookmark of the file ') +
      '<w:bookmarkStart w:id="1" w:name="_GoBack"/>' +
      '<w:bookmarkEnd w:id="1"/>' + r('(a hidden _GoBack)')) +
    p(r('Caret: a bookmark with no text goes here: ')) +
    p(r('Nested and overlapping: alpha beta gamma delta')) +
    p(r('Moved: this bookmark is added here first')) +
    p(r('Moved target: and moved to this paragraph')) +
    p(r('Deleted: this bookmark is added and deleted')) +
    p(r('End')))});
  const s = session(await readDocx(start));
  s.mark(s.word('Heading from', 'Heading from the file'), 'Word1');
  s.mark(S.select({id: s.para('Paragraph two').id, off: 10},
    {id: s.para('Paragraph four').id, off: 14}), 'Span3');
  s.mark(s.caret('Caret', 'end'), 'AtCaret');
  s.mark(s.word('Nested', 'alpha beta gamma delta'), 'Outer');
  s.mark(s.word('Nested', 'beta gamma'), 'Inner');
  s.mark(s.word('Nested', 'gamma delta'), 'Overlap');
  s.mark(s.word('Moved:', 'this bookmark'), 'Moved');
  s.mark(s.word('Moved target', 'moved to this'), 'moved');
  s.mark(s.word('Deleted', 'added and deleted'), 'Gone');
  s.unmark('Gone');
  await save('bm-1-bookmarks.docx', s.d.doc, [
    'A file made with two hidden bookmarks that came with it (_Toc',
    'and _GoBack: Word makes both), then bookmarks added by !Word.',
    'Word1 covers some words of line 1. Span3 runs from line 2 to',
    'line 4 (across paragraphs). AtCaret is a bookmark with no text',
    'at the end of line 5. Outer holds Inner (nested) and Overlap',
    'crosses the end of Outer (overlapping). Moved was added on line',
    '7 and then added again with the name "moved" on line 8: one',
    'bookmark, moved (names ignore case; the stored name is the new',
    'one). Gone was added and deleted: no trace. Word should open it',
    'with no repair prompt; Insert > Bookmark (Ctrl+Shift+F5 in',
    '!Word) lists Word1, Span3, AtCaret, Outer, Inner, Overlap and',
    'moved (hidden ones with "Hidden bookmarks" ticked); Go to',
    'selects the same text as !Word.',
  ]);
}

// ------------------------------------------------------------ 3: painter

{
  const s = session(newDoc({date: DATE}));
  typeParas(s, [
    'Sources: the format painter copies from these',
    'Source A: bold red centred paragraph with an italic big word',
    'Source B: plain left paragraph with an underlined word',
    'Source C: a bullet item',
    'Target one: paint a single word from source A here',
    'Target two: a bold word to be replaced by plain text',
    'Target three: a paragraph painted from source A (centred)',
    'Target four: a plain paragraph to become a bullet item',
    'Target five: a bullet item that becomes plain',
    'End: plain text',
  ]);
  // sources
  s.fmt('alignCenter', s.caret('Source A'));
  s.fmt('bold', s.word('Source A', 'bold red centred paragraph'));
  s.fmt('color', s.word('Source A', 'bold red centred paragraph'), 'FF0000');
  s.fmt('italic', s.word('Source A', 'big word'));
  s.fmt('size', s.word('Source A', 'big word'), 20);
  s.fmt('underline', s.word('Source B', 'underlined word'));
  s.fmt('bullets', s.caret('Source C'), BULLETS[0].id);
  // painting
  s.paint(s.word('Source A', 'bold'), s.word('Target one', 'single word'));
  s.fmt('bold', s.word('Target two', 'bold word'));
  s.paint(s.word('Source B', 'plain left'), s.word('Target two', 'bold word'));
  const sa = s.para('Source A');
  const ta = s.para('Target three');
  s.paint(S.select({id: sa.id, off: sa.text.indexOf('bold')},
    {id: sa.id, off: sa.text.length}),
  S.select({id: ta.id, off: 14}, {id: ta.id, off: ta.text.length}));
  s.paint(s.caret('Source C', 3), s.caret('Target four', 3));
  s.fmt('bullets', s.caret('Target five'), BULLETS[0].id);
  s.paint(s.caret('Source B', 3), s.caret('Target five', 3));
  await save('paint-1.docx', s.d.doc, [
    'A new document. Source A (line 2) is centred; its first words',
    'are bold and red, "big word" is italic and 10 pt. Source B',
    '(line 3) is plain with an underlined word. Source C (line 4) is',
    'a bullet item. Then, with the painter (Select on its button:',
    'once): line 5 got the bold red of "bold" painted over the words',
    '"single word" by a drag (characters only: the paragraph is not',
    'touched, FP1). Line 6 had a bold word painted with the plain',
    'format of source B (FP2: replaced, no bold left). Line 7 got',
    'the bold red and the centring of Source A from a selection',
    'that reached its paragraph end, over the text after "Target',
    'three:" (a drag to the paragraph end). Line 8 became a bullet',
    'item by painting source C from a caret (FP3). Line 9 was a',
    'bullet item and became plain by painting source B from a caret',
    '(FP3). Word should open it with no repair prompt and show the',
    'same formats.',
  ]);
}

// ------------------------------------------------------------ README

const README = [
  'Hand-off files for !Word\'s hyperlinks, bookmarks, format painter',
  'and word count (Batch A, task A6). Made by',
  'node tests/moreapps/handoff-links.mjs with !Word\'s own commands;',
  'nothing here is committed. Open each file in real Word and answer',
  'the questions below; the lists under each file name are what',
  '!Word really wrote.',
  '',
  'On screen: Insert > Hyperlink... (Ctrl-K; Ctrl-click on a link to',
  'a bookmark moves the caret there; no link is ever opened),',
  'Insert > Bookmark... (Ctrl+Shift+F5), the Format painter button',
  '(row 2 of the toolbar; Select = once, Adjust = stays on until',
  'Escape) and Edit > Word count...',
  '',
  'Word counts !Word shows (Edit > Word count..., the whole document;',
  'Lines depends on the window width and is not listed). Compare',
  'with Word\'s Review > Word Count (W1..W4):',
  ...counts,
  '',
  'Questions',
  '---------',
  'H1  Remove link after Insert hyperlink over a run with its own',
  '    character style (an Emphasis word): !Word gives the link\'s',
  '    runs the Hyperlink style (one character style per run), so',
  '    Remove link leaves that word with no character style (its',
  '    direct formatting is kept). Word does? (No file: make it in',
  '    !Word.)',
  'H2  Edit hyperlink with a new address, and Remove link, leave the',
  '    old relationship in the file, unused (lnk-1 lines 10 and 11).',
  '    Word opens it without complaint and does not show it?',
  'H3  The Hyperlink style !Word adds on first use is Word\'s own',
  '    definition (colour 0563C1, single underline, uiPriority 99,',
  '    unhideWhenUsed). Does Word show the links blue and',
  '    underlined, and the style in its Styles pane as usual?',
  'H4  A link made from www.example.org gets http:// in front; an',
  '    address with a space is written %20 and & as &amp; (lnk-1',
  '    lines 5 and 8). Does Word open the right addresses with',
  '    Ctrl+click, and show the ScreenTip of line 6 and line 10?',
  'BM1 A bookmark added by !Word: w:bookmarkStart / w:bookmarkEnd as',
  '    direct children of the paragraph, ids from one more than the',
  '    largest. Opens without a repair prompt; Insert > Bookmark',
  '    lists it; Go To selects the same text (bm-1).',
  'BM2 A bookmark across paragraphs (Span3), and one at a caret',
  '    (AtCaret: start and end together). Word keeps both; the caret',
  '    one is an empty bookmark at that place.',
  'BM3 Deleting the paragraph that holds a bookmark\'s start (its end',
  '    in a later paragraph): !Word moves the start to where the',
  '    deletion was (the bookmark shrinks). Word the same? (No file:',
  '    try on Span3 in both programs.)',
  'BM4 Left / Right next to a bookmark: one press per visible',
  '    character in !Word (the marks never take a press). Word?',
  'BM5 Typed text right after a bookmark\'s end or before its start:',
  '    !Word types inside only at a caret between the marks. Word',
  '    extends a bookmark only when typing inside it? (No file.)',
  'BM6 A name Word itself refuses (from a file: 1st, has space,',
  '    longer than 40 characters): !Word lists, goes to and deletes',
  '    it, but never makes one. (No file: rename one in the XML.)',
  'BM7 Typing or pasting over a selection that holds a bookmark\'s',
  '    start whose end is outside it: !Word puts the start back where',
  '    the selection was and the new text goes BEFORE it, so the',
  '    typed text lands outside the bookmark. Word keeps it inside?',
  'FP1 A click with the painter on paints the word there and the',
  '    paragraph; a drag paints the selection (paint-1 lines 5 and',
  '    7). Word paints the clicked word and, when a paragraph mark',
  '    was picked, the paragraph.',
  'FP2 The picked run properties REPLACE the target\'s (a bold word',
  '    painted from plain text becomes plain: paint-1 line 6). Word?',
  'FP3 A list item picked with its paragraph mark and painted over a',
  '    plain paragraph joins the list (same numId and level), and a',
  '    plain paragraph painted over an item takes it out of its list',
  '    (paint-1 lines 8 and 9). Word?',
  'FP4 The character style (w:rStyle) of the pick is copied; a pick',
  '    without one removes the target\'s style. Word?',
  'FP5 Raw paragraph children !Word does not model (w:bidi,',
  '    w:framePr, w:suppressAutoHyphens, w:textAlignment,',
  '    w:textDirection) stay on the target and are not carried from',
  '    the pick; change records and w:id elements are never carried.',
  '    Word copies them? (No file.)',
  'FP6 A sticky pick after an undo removed its list or character',
  '    style: the part is dropped when painting, the target\'s list is',
  '    left alone, no error. (No file.)',
  'W1  Each East Asian character counts as a word (and ends the word',
  '    beside it). Word\'s box gives "Asian characters" and',
  '    "Non-Asian words": the sum is what !Word shows. Kana and',
  '    Hangul the same? (No file: type some in both.)',
  'W2  Characters are code points (an emoji is 1; Word counts UTF-16',
  '    units?). Compare Characters for a line with an emoji and with',
  '    combining marks.',
  'W3  The no-break spaces (U+00A0, U+2007, U+202F) are left out of',
  '    "no spaces" and join words. Word\'s Characters (no spaces) for',
  '    a<nbsp>b; words 1.',
  'W4  Tables\' text, links\' text and field results count; field codes',
  '    and tracked deletions do not; text boxes, footnotes and',
  '    headers are not counted. Compare the Word Count box with',
  '    "Include textboxes, footnotes and endnotes" off, on a',
  '    document with each. (The counts above: the three files here',
  '    have only paragraphs and links: compare them first.)',
  ...lines,
  '',
];
const how = put('lnk-README.txt', Buffer.from(README.join('\n'), 'utf8'));
made.push(`lnk-README.txt (${how})`);
console.log('hand-off files in ' + OUT + ':\n  ' + made.join('\n  '));
console.log(counts.join('\n'));
