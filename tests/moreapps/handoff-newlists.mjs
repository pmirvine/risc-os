// Generates the real-Word hand-off files for !Word's new lists
// (local only, never committed: tests/moreapps/corpus/ is
// git-ignored). Not a test:
//
//   node tests/moreapps/handoff-newlists.mjs
//
// Writes into tests/moreapps/corpus/handoff/ (made if missing):
//   nl-1-new-bullets.docx     a new document: the six bullets of the
//                             gallery, three levels each
//   nl-2-new-numbers.docx     the six numberings, levels 0 to 3
//   nl-3-restart-continue.docx  Restart at 1, Start at 5, Continue
//                             across a gap, Continue after a Restart
//   nl-4-existing-part.docx   a corpus document with a Word numbering
//                             part, extended by two new lists
//   nl-5-autoformat.docx      AutoFormat as you type: the markers
//   nl-README.txt             what Word should show, the open questions
// Everything is done with !Word's own commands (FormatApply's ids: what
// the Bullets and Numbering buttons, the gallery, the list menu and
// Ctrl-Shift-L run; ./AutoList for the typed markers) on a Document,
// as the window makes them. A file is written only when its bytes
// change, so a file open in Word is left alone; nothing else in the
// folder is touched or removed. Each file is read back and every
// paragraph listed in the README with the label !Word shows and the
// list it is in, so the list is what was really written.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {newDoc} from '../../tools/moreapps/!Word/NewDoc';
import {Document} from '../../tools/moreapps/!Word/Document';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {apply} from '../../tools/moreapps/!Word/FormatApply';
import {afterSpace} from '../../tools/moreapps/!Word/AutoList';
import {run} from '../../tools/moreapps/!Word/EditApply';
import {labels} from '../../tools/moreapps/!Word/ListNumbers';
import {BULLETS, NUMBERS} from '../../tools/moreapps/!Word/ListGallery';
import * as S from '../../tools/moreapps/!Word/Selection';
import * as E from '../../tools/moreapps/!Word/Edit';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {listDocx, item} from './list-fixtures.mjs';
import {p, r} from './build-docx.mjs';
import {lintPackage} from './lint-package.mjs';
import {rng} from './word-docs.mjs';

// (NumWrite gives each new list a random nsid: seeded, so a re-run
// writes the same bytes)
Math.random = rng(20261009);

const OUT = fileURLToPath(new URL('./corpus/handoff/', import.meta.url));
const CORPUS = fileURLToPath(new URL('./corpus/', import.meta.url));
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
    const b = all().find((x) => x.type === 'p' && x.text.startsWith(start));
    if (!b) throw new Error('no paragraph starting ' + JSON.stringify(start));
    return b;
  };
  const at = (k, off = 0) => S.caret({id: all()[k].id,
    off: off === 'end' ? all()[k].text.length : off});
  return {
    d, para, all, at,
    caret: (start, off = 0) => S.caret({id: para(start).id,
      off: off === 'end' ? para(start).text.length : off}),
    /** A selection over the paragraphs from `a` to `b`. */
    over: (a, b) => S.select({id: para(a).id, off: 0},
      {id: para(b).id, off: para(b).text.length}),
    type(sel, text) {
      for (const ch of text) { now += 50; sel = t.type(sel, ch); }
      return sel;
    },
    enter(sel) { return t.command(() => E.splitPara(d, sel)); },
    fmt(id, sel, arg) { now += 2000; return apply(id, d, t, sel, arg).sel; },
    /** Type `marker` + the converting space at paragraph k's start. */
    marker(k, marker, text, {tab = false} = {}) {
      let sel = at(k);
      for (const ch of marker) { now += 50; sel = t.type(sel, ch); }
      now += 50;
      if (tab) {
        sel = run('tab', d, t, sel, {autoList: true});
      } else {
        sel = t.type(sel, ' ');
        sel = afterSpace(d, t, sel, {typed: ' '}) || sel;
      }
      return this.type(sel, text);
    },
  };
}

const lines = [];
const say = (...x) => lines.push(...x);

/** The definition of list numId in doc, in a few words. */
function defOf(doc, numId) {
  const n = doc.numbering && doc.numbering.nums.get(numId);
  if (!n) return '(no definition)';
  const at = (k) => n.levels.find((l) => l && l.ilvl === k);
  const show = (l) => !l ? '-' : l.numFmt === 'bullet'
    ? 'bullet U+' + (l.lvlText || '').codePointAt(0).toString(16)
      .toUpperCase().padStart(4, '0') + ' ' + ((l.rPr && l.rPr.rFonts &&
        l.rPr.rFonts.ascii) || '')
    : l.numFmt + ' "' + l.lvlText + '"' + (l.start !== 1 ? ' start ' +
      l.start : '');
  const ov = n.overrides && n.overrides.size ? '; ' + [...n.overrides]
    .map(([k, o]) => `level ${k} override (start ${o.start})`)
    .join(', ') : '';
  return `abstract ${n.abstractNumId}: ${[0, 1, 2, 3].map((k) => show(at(k)))
    .join(' | ')}${ov}`;
}

/** What a written file holds: each paragraph's label and list. */
async function describe(bytes, from = 0) {
  const doc = await readDocx(bytes);
  const m = labels(doc);
  const out = [];
  const seen = new Set();
  let k = 0;
  for (const b of doc.sections.flatMap((x) => x.blocks)) {
    k++;
    if (b.type !== 'p' || k <= from) continue;
    const lab = m.get(b.id);
    const np = b.pPr.numPr;
    out.push(`  ${String(k).padStart(2)}. ${lab ? (lab.text + '  ')
      .padEnd(8) : '        '}${'  '.repeat(lab ? lab.level : 0)}` +
      `${b.text.slice(0, 46)}` + (np ? `   [numId ${np.numId} level ` +
      `${np.ilvl || 0}${b.pStyle ? ', ' + b.pStyle : ''}]` : ''));
    if (np && !seen.has(np.numId)) seen.add(np.numId);
  }
  out.push('  Definitions:');
  for (const id of seen) out.push(`    numId ${id}: ${defOf(doc, id)}`);
  return out;
}

const made = [];
async function save(name, doc, about, from = 0) {
  const bytes = await writeDocx(doc, {date: DATE});
  const problems = lintPackage(await readZip(bytes)).problems
    .filter((q) => q.level === 'error');
  if (problems.length) throw new Error(name + ': ' + JSON.stringify(problems));
  made.push(`${name} (${bytes.length} bytes, ${put(name, bytes)})`);
  say('', name, '-'.repeat(name.length), ...about, '',
    'What !Word wrote (read back from the saved file: each paragraph,',
    'the label !Word shows, its numId and level, and the definitions',
    'of the lists):', ...await describe(bytes, from));
}

/** Type paragraphs (the first into the empty one) into a session. */
function typeParas(s, texts) {
  let c = s.at(0);
  texts.forEach((t, k) => {
    if (k) c = s.enter(c);
    c = s.type(c, t);
  });
}

// ------------------------------------------------------------ 1: bullets

{
  const s = session(newDoc({date: DATE}));
  const texts = [];
  for (const e of BULLETS) {
    texts.push(`Bullet "${e.name}":`);
    for (let k = 0; k < 3; k++) texts.push(`${e.name} item, level ${k}`);
  }
  typeParas(s, texts);
  for (const e of BULLETS) {
    s.fmt('bullets', s.over(`${e.name} item, level 0`,
      `${e.name} item, level 2`), e.id);
    s.fmt('listIn', s.caret(`${e.name} item, level 1`));
    s.fmt('listIn', s.caret(`${e.name} item, level 2`));
    s.fmt('listIn', s.caret(`${e.name} item, level 2`));
  }
  await save('nl-1-new-bullets.docx', s.d.doc, [
    'A new document (as !Word makes one) with six bullet lists made',
    'from the gallery (the Bullets button\'s drop-down), three items',
    'each, at levels 0, 1 and 2 (the second and third made deeper',
    'with the list buttons). It has no numbering part to start with:',
    '!Word makes numbering.xml, the relationship and the content',
    'type, and the List Paragraph style. Word should open it with no',
    'repair prompt, and show per list (L1, L4):',
    ' - Disc: the Symbol dot at level 0, Courier New "o" at level 1,',
    '   the Wingdings square at level 2 (Word\'s own cycle);',
    ' - Circle: "o", "o", then the square;',
    ' - Square, Diamond, Arrow, Check mark: that glyph at level 0',
    '   (Wingdings), then "o" and the square as for the others;',
    ' - each level 360 twips hanging, 720 further in per level;',
    ' - in Word\'s Bullets gallery each list is "the current list" of',
    '   its kind: is the right entry highlighted for the disc and the',
    '   others (Word picks by the definition)?',
  ]);
}

// ------------------------------------------------------------ 2: numbers

{
  const s = session(newDoc({date: DATE}));
  const texts = [];
  for (const e of NUMBERS) {
    texts.push(`Numbering "${e.name}":`);
    for (let k = 0; k < 4; k++) texts.push(`${e.id} item, level ${k}`);
  }
  typeParas(s, texts);
  for (const e of NUMBERS) {
    s.fmt('numbering', s.over(`${e.id} item, level 0`,
      `${e.id} item, level 3`), e.id);
    for (let k = 1; k < 4; k++) {
      for (let j = 0; j < k; j++) {
        s.fmt('listIn', s.caret(`${e.id} item, level ${k}`));
      }
    }
  }
  await save('nl-2-new-numbers.docx', s.d.doc, [
    'A new document with the six numberings of the gallery (1. 1) I.',
    'A. a) i.), four items each at levels 0 to 3. Word should show,',
    'for "1.": 1. / a. / i. / 1. ; for "1)": 1) a) i) 1) ; for "I.":',
    'I. / A. / 1. / I. ; for "A.": A. / a. / i. / A. ; for "a)": a) /',
    'i) / 1) / a) ; for "i.": i. / a. / 1. / i. . The roman numbers',
    'are right-aligned in their tab space (lvlJc right, as Word\'s own',
    'gallery has them). Levels three deep use the same cycle again.',
    'Each list is its own list: the numbering starts again at 1 / A /',
    'I in every one (L1).',
  ]);
}

// ------------------------------------------------------------ 3: restart

{
  const s = session(newDoc({date: DATE}));
  const texts = [
    'Restart at 1 (Numbering 1.):',
    'Restart A1', 'Restart A2', 'Restart A3', 'Restart A4',
    'Restart A5',
    'Start at 5 (Numbering I.):', 'Start B1', 'Start B2', 'Start B3',
    'Continue across a gap (Numbering A.):', 'Gap C1', 'Gap C2',
    'A paragraph that is not in a list', 'Gap C3', 'Gap C4',
    'Continue after a Restart (Numbering 1):', 'Run D1', 'Run D2',
    'Run D3', 'Run D4', 'Run D5'];
  typeParas(s, texts);
  s.fmt('numbering', s.over('Restart A1', 'Restart A5'), '1.');
  s.fmt('listRestart', s.caret('Restart A3'), 1);
  s.fmt('numbering', s.over('Start B1', 'Start B3'), 'I.');
  s.fmt('listRestart', s.caret('Start B1'), 5);
  s.fmt('numbering', s.over('Gap C1', 'Gap C2'), 'A.');
  s.fmt('numbering', s.over('Gap C3', 'Gap C4'), 'A.');
  s.fmt('numbering', s.over('Run D1', 'Run D5'), '1)');
  s.fmt('listRestart', s.caret('Run D3'), 1);
  s.fmt('listContinue', s.caret('Run D4'));
  await save('nl-3-restart-continue.docx', s.d.doc, [
    'Four lists made and then changed with Format > List (Restart',
    'at 1, Continue numbering). Word should show:',
    ' 1. "Restart A1..A5": 1. 2. then Restart at 1 on A3: 1. 2. 3.',
    '    for A3, A4, A5. !Word writes a new w:num on the same abstract',
    '    with a startOverride 1 for level 0 (L3). Does Word show the',
    '    same, and does its own Restart at 1 do the same on this',
    '    list (try it on A4)?',
    ' 2. "Start B1..B3" (Roman): Start at 5 on B1 gives V. VI. VII.',
    '    (L3). In Word: right click the item, Set Numbering Value,',
    '    5: the same?',
    ' 3. "Gap C1..C4": C1 C2 are A. B.; after a plain paragraph C3 C4',
    '    were made a numbered list with the same format: !Word',
    '    continues the list, C. D. (L2: the owner\'s ruling, any gap',
    '    in the section). What does Word do for the same clicks?',
    ' 4. "Run D1..D5" (1)): D3 was restarted (D3 = 1)), and then',
    '    Continue numbering was used on D4: !Word joins the whole run',
    '    of the restarted list to the one before, so D1..D5 are',
    '    1) 2) 3) 4) 5) again (L7; two w:nums on one abstract share',
    '    one count). Word\'s Continue Numbering on D4 of a list',
    '    restarted at D3?',
    'List Paragraph (L5) is given to the paragraphs made into list',
    'items and was not there before.',
  ], 0);
}

// ------------------------------------------------------------ 4: existing part

{
  const WANT = 'open-xml-sdk/v2FxTestFiles/wordprocessing/bullet/' +
    'bullet-simple1.docx';
  const hasNumbering = async (f) => {
    try {
      const d = await readDocx(fs.readFileSync(f));
      return d.meta.numberingPart && d.numbering && d.numbering.nums.size
        ? d : null;
    } catch (e) {
      return null;
    }
  };
  let src = path.join(CORPUS, WANT), why = '';
  let doc = fs.existsSync(src) ? await hasNumbering(src) : null;
  if (!doc) {
    src = null;
    doc = await readDocx(await listDocx([p(r('Before the list')),
      item('One', 2), item('Two', 2), p(r('After'))]));
    why = 'The corpus file was not found: the generated list document ' +
      '(list-fixtures.mjs) stands in.';
  }
  const before = await writeDocx(doc, {date: DATE});
  const zBefore = await readZip(before);
  const nBefore = doc.numbering.raw.children.length;
  const s = session(doc);
  const lastP = s.all().filter((b) => b.type === 'p').at(-1);
  let c = S.caret({id: lastP.id, off: lastP.text.length});
  const texts = ['Added by !Word: a bullet list (Check mark):',
    'Added bullet one', 'Added bullet two',
    'Added by !Word: a numbered list (A.):', 'Added number one',
    'Added number two'];
  texts.forEach((t) => { c = s.enter(c); c = s.type(c, t); });
  const first = s.all().findIndex((b) => b.text === texts[0]);
  // (Enter at the end of a list item makes a list item: the two
  // headings are taken out of the list)
  s.fmt('listOff', s.caret(texts[0]));
  s.fmt('listOff', s.caret(texts[3]));
  s.fmt('bullets', s.over('Added bullet one', 'Added bullet two'),
    'check');
  s.fmt('numbering', s.over('Added number one', 'Added number two'),
    'A.');
  const bytes = await writeDocx(s.d.doc, {date: DATE});
  const zAfter = await readZip(bytes);
  const name = s.d.doc.meta.numberingPart;
  const rootOf = (z) => parseXml(new TextDecoder().decode(z.get(name))
    .replace(/^﻿/, '')).root;
  const kinds = (root) => {
    const k = {};
    for (const ch of root.children) {
      const n = String(ch.name).replace(/^.*:/, '');
      k[n] = (k[n] || 0) + 1;
    }
    return JSON.stringify(k);
  };
  await save('nl-4-existing-part.docx', s.d.doc, [
    src ? 'The corpus document ' + WANT + ' (made by Word, with a'
      : 'A stand-in document with a',
    'numbering part of its own), opened and saved by !Word, with two',
    'new lists added at its end: a bullet list (Check mark) and a',
    'numbered list (A.). ' + why,
    'The numbering part ' + name + ' before: ' +
      kinds(rootOf(zBefore)) + ';',
    'after: ' + kinds(rootOf(zAfter)) + '. The new w:abstractNum are',
    'put after the last old w:abstractNum and before the first w:num,',
    'the new w:num after the last w:num (before w:numIdMacAtCleanup',
    'if there is one); every old node is as it was (L4). Word should',
    'open it with no repair prompt; the old lists show as they did',
    'in the original; the two new ones as in nl-1 and nl-2.',
  ], first);
}

// ------------------------------------------------------------ 5: AutoFormat

{
  const s = session(newDoc({date: DATE}));
  const marks = [
    ['AF1: * - > make a bullet list each', null],
    ['*', 'disc'], ['-', 'dash'], ['>', 'arrow'],
    ['AF2: 3. with no list before, then 1. 2. 3. and 7.', null],
    ['3.', 'three'], ['plain paragraph, not a list', null],
    ['1.', 'one'], ['2.', 'two'], ['3.', 'three again'], ['7.', 'seven'],
    ['AF3: other markers', null],
    ['(1)', 'paren number'], ['(2)', 'second'], ['1)', 'bracket'],
    ['2)', 'second bracket'], ['a.', 'letter'], ['b.', 'second letter'],
    ['A.', 'capital letter'], ['i.', 'roman one'], ['ii.', 'roman two'],
    ['iii.', 'roman three'], ['iv.', 'roman four'], ['v.', 'roman five'],
    ['I.', 'capital roman'], ['a)', 'letter bracket'],
    ['AF4: Tab instead of the space', null],
    ['1.\t', 'numbered by Tab'], ['*\t', 'bullet by Tab']];
  typeParas(s, marks.map(([a, b]) => (b === null ? a : '')));
  marks.forEach(([m, text], k) => {
    if (text === null) return;
    s.marker(k, m.replace(/\t$/, ''), text, {tab: m.endsWith('\t')});
  });
  await save('nl-5-autoformat.docx', s.d.doc, [
    'AutoFormat as you type, as the markers were typed into empty',
    'paragraphs (each marker, then the space or the Tab):',
    ' AF1: "* " the disc, "- " a dash (an en dash U+2013 in Calibri',
    '      at level 0), "> " the arrow (Wingdings U+F0D8);',
    ' AF2: "3. " typed first: a list whose level 0 starts at 3;',
    '      "1. " "2. " "3. " after a plain paragraph: a new list',
    '      (the first), then continued; "7. " a new list at 7;',
    ' AF3: (1) (2) 1) 2) a. b. A. i. ii. iii. iv. v. I. a): the',
    '      the roman "v." after i..iv is roman 5, "i." after the',
    '      letters a. b. A. is roman 1, "a)" after "I." starts a',
    '      lettered list of its own;',
    ' AF4: "1." + Tab and "*" + Tab convert too (the Tab goes).',
    'For Word: type the same markers in a blank document with',
    'AutoFormat As You Type > Automatic numbered / bulleted lists on,',
    'and compare the lists Word makes (the bullet characters and',
    'fonts of AF1, w:start or startOverride in AF2, the abstract',
    'Word picks in AF3).',
  ]);
}

// ------------------------------------------------------------ README

const README = [
  '!Word new lists hand-off (local only, not committed)',
  '====================================================',
  '',
  'Made by: node tests/moreapps/handoff-newlists.mjs (re-run it after',
  'changing !Word; files whose bytes are the same are not rewritten;',
  'no other file here is touched). Every file is a document made with',
  '!Word\'s own list commands (the ones the Bullets and Numbering',
  'buttons and their galleries, Format > List, Ctrl-Shift-L and',
  'AutoFormat as you type run) and saved by !Word. Open each in real',
  'Word: note any repair prompt or error, and whether what you see',
  'matches the description. Then the open questions: there !Word',
  'does what Word is believed to do, unverified.',
  '',
  'Open questions (please try each in real Word and note what it does):',
  '',
  'L1 The gallery\'s definitions (nl-1, nl-2): do the six bullets',
  '   and six numberings look like Word\'s own (glyphs and fonts,',
  '   indents 720 + 360 hanging per level, the cycle of formats,',
  '   roman numbers right-aligned)? Is the matching gallery entry',
  '   shown as the current one in Word\'s galleries?',
  'L2 Bullets / Numbering after a gap of plain paragraphs (nl-3 C3).',
  '   !Word continues the nearest earlier list of the same format in',
  '   the section (the owner\'s ruling); another kind or format',
  '   nearer starts a new list. Word?',
  'L3 Restart at / Start at (nl-3 A and B). !Word writes a new w:num',
  '   on the same abstract with one startOverride for the level, and',
  '   moves the item and every later item of its list to it; of the',
  '   old num\'s other overrides only level replacements are copied.',
  '   Start at 5 on an item, then a sublevel restarted: the next',
  '   top-level item shows 6. Word?',
  'L4 A document with no numbering part (nl-1, nl-2, nl-3, nl-5) and',
  '   one with a Word numbering part extended (nl-4): numbering.xml,',
  '   the relationship and the content type are made; or the new',
  '   abstractNum / num put after the last of their kind. Does Word',
  '   open them without a repair prompt and keep the old lists?',
  'L5 List Paragraph. Given to default-style paragraphs turned into',
  '   a list, back to the default style when turned off. Does Word',
  '   do the same (also when the list is turned off with the button',
  '   twice)?',
  'L6 Pasting list items between !Word documents. The numbering is',
  '   dropped (the items arrive as plain paragraphs); within one',
  '   document they stay in their list. DECISION FOR THE OWNER:',
  '   should a paste across documents make a list in the target? (Word',
  '   keeps the list.) Try copying nl-3\'s lists into another file.',
  'L7 Continue numbering on any item of a restarted list (nl-3 D).',
  '   The whole run of that list joins the previous list: five',
  '   items, Restart on the third, Continue on the fourth gives',
  '   1) 2) 3) 4) 5). Two w:nums on one abstract share one count.',
  '   Word?',
  'L8 A bullet sublevel of a numbered list, Numbering or Bullets',
  '   clicked: !Word counts level 0 as the list\'s kind. Numbering',
  '   takes it out of the list, Bullets gives it a bullet list of',
  '   its own at its level. (No file: make a numbered list with a',
  '   bullet at level 1 in Word and click both.)',
  'L9 A paragraph with a direct indent put into a list or taken out:',
  '   !Word keeps the direct w:ind both ways (it overrides the',
  '   level\'s indent while in the list). Word? (No file.)',
  'AF1 "- " typed at a paragraph\'s start: a bullet list whose level',
  '   0 is an en dash U+2013 in Calibri; "* " the disc, "> " the',
  '   Wingdings arrow U+F0D8 (nl-5). What does Word write for each?',
  'AF2 "3. " with no list before: a new list whose abstract\'s level',
  '   0 has w:start 3 (Word may use a startOverride instead). After',
  '   "1." "2." the typed "3." continues the list; any other number',
  '   starts a new list (nl-5).',
  'AF3 Which markers convert: * - >; N. N) (N) (0..32767, no leading',
  '   zero); one letter a. a) A. (A) not); roman i. I. and longer',
  '   canonical romans up to 39 with a full stop only. A single',
  '   letter that can be roman (i v x l c d m) is read as whichever',
  '   continues the nearer earlier list; else i. I. are roman 1 and',
  '   the others letters (nl-5).',
  'AF4 Ctrl-Z right after the conversion gives back the typed marker',
  '   and space (the caret after it); a second Ctrl-Z the typing.',
  '   Tab after a marker converts too (nl-5, the last two). Try both',
  '   in Word.',
  'AF5 A marker after invisible marks (Word\'s _GoBack bookmark, a',
  '   proofing mark, a comment range) converts and the marks stay',
  '   before the item\'s text (the owner\'s ruling); after a link, a',
  '   field, a drawing or a tab: no conversion. (No file: type a',
  '   marker in a paragraph Word has just saved and reopened.)',
  '',
  'Keys: Ctrl-Shift-L is the bullets toggle, as in Word; Format >',
  'AutoFormat lists turns AutoFormat as you type off and on (the',
  'choice is kept in Choices:Word).',
  ...lines,
  '',
];
const how = put('nl-README.txt', Buffer.from(README.join('\n'), 'utf8'));
made.push(`nl-README.txt (${how})`);
console.log('hand-off files in ' + OUT + ':\n  ' + made.join('\n  '));
