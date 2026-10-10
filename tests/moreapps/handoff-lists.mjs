// Generates the real-Word hand-off files for !Word's lists (local
// only, never committed: tests/moreapps/corpus/ is git-ignored). Not a
// test:
//
//   node tests/moreapps/handoff-lists.mjs
//
// Writes into tests/moreapps/corpus/handoff/ (made if missing):
//   list-1-bullets.docx    bullets: Symbol, Courier New, Wingdings
//   list-2-numbered.docx   number formats, counters, indents, labels
//   list-3-multilevel.docx multilevel, legal, headings tied to a list
//   list-4-edits.docx      a list edited with !Word's keys and menus
//   list-README.txt        what Word should show, the open questions
// !Word cannot make numbering definitions, so files 1 to 3 are made
// here as .docx (list-fixtures.mjs builders), opened by !Word's
// reader and saved by its writer; file 4 is edited with !Word's own
// commands (./EditApply.run for Tab, Shift-Tab, Backspace and Enter,
// ./FormatApply for Format > List and Ctrl-M) as the window runs
// them. A file is written only when its bytes change, so a file open
// in Word is left alone; nothing else in the folder is touched or
// removed. Each saved file is read back and every paragraph listed
// in the README with the label and indents !Word draws, so the list
// is what was really written.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {Document} from '../../tools/moreapps/!Word/Document';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {run} from '../../tools/moreapps/!Word/EditApply';
import {apply} from '../../tools/moreapps/!Word/FormatApply';
import {labels} from '../../tools/moreapps/!Word/ListNumbers';
import {effective} from '../../tools/moreapps/!Word/ParaInd';
import * as S from '../../tools/moreapps/!Word/Selection';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {numberingXml, p, r} from './build-docx.mjs';
import {lvl, item, heading, listDocx, NUMBERING, LI} from './list-fixtures.mjs';
import {lintPackage} from './lint-package.mjs';

const OUT = fileURLToPath(new URL('./corpus/handoff/', import.meta.url));
const DATE = new Date(Date.UTC(2026, 9, 7, 12));
fs.mkdirSync(OUT, {recursive: true});

/** Write bytes to name unless the file already holds them. */
function put(name, bytes) {
  const f = path.join(OUT, name);
  const b = Buffer.from(bytes);
  if (fs.existsSync(f) && fs.readFileSync(f).equals(b)) return 'same';
  fs.writeFileSync(f, b);
  return 'written';
}

const abs = (id, levels) => `<w:abstractNum w:abstractNumId="${id}">` +
  `<w:multiLevelType w:val="hybridMultilevel"/>${levels}</w:abstractNum>`;
const num = (id, a, over = '') => `<w:num w:numId="${id}">` +
  `<w:abstractNumId w:val="${a}"/>${over}</w:num>`;
const inch = (tw) => +(tw / 1440).toFixed(3);
const show = (t) => t.replace(/\t/g, '<tab>').replace(/\n/g, '<br>');
const hex = (t) => [...t].map((c) => (c.charCodeAt(0) < 128 ? c
  : 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')))
  .join(' ');

/** What a written file shows: per paragraph its label and indents. */
async function describe(bytes) {
  const doc = await readDocx(bytes);
  const m = labels(doc);
  const out = [];
  let k = 0;
  for (const b of doc.sections.flatMap((x) => x.blocks)) {
    if (b.type !== 'p') { out.push('    [table]'); continue; }
    k++;
    const l = m.get(b.id);
    const e = effective(doc, b, m);
    const np = b.pPr.numPr;
    const lab = l ? (l.bullet ? 'bullet ' + hex(l.text) : '"' + l.text +
      '"') : 'no label';
    out.push(`  ${String(k).padStart(2)}. ${show(b.text)}`);
    out.push(`      ${lab}; ` + (np ? `numId ${np.numId ?? '-'} ilvl ` +
      `${np.ilvl ?? '-'}` : b.pStyle ? 'style ' + b.pStyle : 'no numPr') +
      (l && l.suff && l.suff !== 'tab' ? '; suffix ' + l.suff : '') +
      `; text at ${inch(e.left)}", first line ${inch(e.left + e.first)}"`);
  }
  return out;
}

const lines = [];
const say = (...x) => lines.push(...x);
const made = [];
async function save(name, doc, about) {
  const bytes = await writeDocx(doc, {date: DATE});
  const problems = lintPackage(await readZip(bytes)).problems
    .filter((q) => q.level === 'error');
  if (problems.length) throw new Error(name + ': ' + JSON.stringify(problems));
  made.push(`${name} (${bytes.length} bytes, ${put(name, bytes)})`);
  say('', name, '-'.repeat(name.length), ...about, '',
    'What !Word shows (read back from the saved file: each paragraph,',
    'its label, its numbering and where its text and first line start,',
    'in inches from the left margin):', ...await describe(bytes));
}
/** A .docx made here, opened and saved by !Word. */
const roundTrip = async (name, bytes, about) =>
  save(name, (await readDocx(bytes)), about);

// ------------------------------------------------------------ 1 bullets

const BUL = [['', 'Symbol'], ['o', 'Courier New'],
  ['', 'Wingdings'], ['', 'Wingdings'],
  ['', 'Wingdings'], ['', 'Wingdings'], ['–', ''],
  ['•', ''], ['', 'Wingdings']];
{
  const NUM = numberingXml(abs(0, BUL.map(([t, f], k) => lvl(k,
    {fmt: 'bullet', text: t, font: f || undefined})).join('')) +
    abs(1, BUL.map(([t, f]) => lvl(0, {fmt: 'bullet', text: t,
      font: f || undefined})).slice(0, 1).join('')) + num(1, 0) +
    num(2, 1));
  const paras = [p(r('Bullets, one per level (levels 0 to 8):')),
    ...BUL.map(([t, f], k) => item(`Level ${k}: ${f || 'no font'} ` +
      hex(t), 1, k)),
    p(r('A second bullet list, then text wrapping onto a second line ' +
      'under the first line\'s text, not under the bullet:')),
    item('Wrapped bullet item: ' + 'the quick brown fox jumps over ' +
      'the lazy dog. '.repeat(3), 2),
    item('', 2), item('The empty item above still shows its bullet.', 2)];
  await roundTrip('list-1-bullets.docx', await listDocx(paras,
    {numbering: NUM}), [
    'Bullets as Word\'s own lists use them: Symbol U+F0B7, Courier New',
    '"o", Wingdings U+F0A7 (square), and some other Wingdings and',
    'plain characters, one per level, each level 0.5" deeper (left',
    '0.5" per level, hanging 0.25"). !Word maps the Symbol and',
    'Wingdings private-use characters to Unicode glyphs (G5).',
  ]);
}

// ------------------------------------------------------------ 2 numbered

{
  const NUM = numberingXml(
    abs(0, lvl(0)) +
    abs(1, lvl(0, {fmt: 'lowerLetter', start: 24, text: '%1)'})) +
    abs(2, lvl(0, {fmt: 'upperRoman', text: '%1.', jc: 'right'})) +
    abs(3, lvl(0, {fmt: 'ordinal', text: '%1'})) +
    abs(4, lvl(0, {fmt: 'decimalZero', text: '(%1)', suff: 'space'})) +
    abs(5, lvl(0, {start: 98, text: '%1.', jc: 'right'})) +
    abs(6, lvl(0, {start: 99998, text: 'Item %1:'})) +
    abs(7, lvl(0, {text: '%1.', suff: 'nothing'})) +
    abs(8, lvl(0, {left: 1440, hanging: null, text: '%1.'})) +
    abs(9, lvl(0, {text: '%1.', left: null})) +
    num(1, 0) + num(2, 0) +
    num(3, 0, '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/>' +
      '</w:lvlOverride>') +
    num(4, 1) + num(5, 2) + num(6, 3) + num(7, 4) + num(8, 5) +
    num(9, 6) + num(10, 7) + num(11, 8) + num(12, 9));
  const n = (t, id, more) => item(t, id, 0, more);
  const paras = [
    p(r('a. One list (numId 1), interrupted by a plain paragraph:')),
    n('one', 1), n('two', 1), p(r('plain paragraph')), n('three', 1),
    p(r('b. numId 2: the SAME abstractNum, no override (G4):')),
    n('continues? (four)', 2), n('five?', 2),
    p(r('c. numId 3: the same abstractNum, startOverride 1:')),
    n('restarts at one', 3), n('two', 3),
    p(r('d. numId 1 again after numId 3:')), n('six? or three?', 1),
    p(r('e. Letters from x: x) y) z) then (G1) aa) bb)?')),
    ...['x', 'y', 'z', 'aa?', 'bb?', 'cc?'].map((t) => n(t, 4)),
    p(r('f. Roman numerals, right aligned (lvlJc right, G9):')),
    ...['I', 'II', 'III', 'IV', 'V'].map((t) => n(t, 5)),
    p(r('g. Ordinal, then decimalZero with a space after the label:')),
    n('1st', 6), n('2nd', 6), n('3rd', 6), n('01', 7), n('02', 7),
    p(r('h. Right-aligned 98. to 101. (does 100. stick out left?):')),
    ...['98', '99', '100', '101'].map((t) => n(t, 8)),
    p(r('i. A label wider than its hanging space (G6):')),
    n('Item 99998: the text goes to the next tab stop', 9),
    n('Item 99999', 9),
    p(r('j. No suffix (the text right after the label):')),
    n('nothing between', 10),
    p(r('k. Indent precedence (G7): style left 0.5", level only ' +
      'left 1":')), n('level gives only left (no hanging)', 11),
    n('a level with no indent at all (style 0.5" applies)', 12),
    n('direct indent 2", hanging 0.5" over the level\'s', 1,
      '<w:ind w:left="2880" w:hanging="720"/>'),
  ];
  await roundTrip('list-2-numbered.docx', await listDocx(paras,
    {numbering: NUM}), [
    'Number formats and counters, opened and saved by !Word. The',
    'paragraphs in the list use the List Paragraph style (left 0.5").',
    'The headings a. to k. say what each group tests; the item texts',
    'are what !Word expects, a "?" where Word is unknown (G1..G9).',
  ]);
}

// ------------------------------------------------------------ 3 multilevel

{
  const paras = [
    p(r('a. Nine levels (numId 2: 1. a. i. 1. a. i. ...):')),
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 1, 0, 1].map((k, i) =>
      item(`level ${k} (item ${i + 1})`, 2, k)),
    p(r('b. Restart after a higher level; level 1 never restarts ' +
      '(numId 7, lvlRestart 0, G3):')),
    item('one', 7), item('a)', 7, 1), item('b)', 7, 1), item('two', 7),
    item('c) (not a) again)', 7, 1),
    p(r('c. Legal numbering (numId 4: Article I., then isLgl 1.1, ' +
      '1.1.1 with a space after):')),
    item('Article I.', 4), item('1.1 (I shown as 1)', 4, 1),
    item('1.1.1', 4, 2), item('Article II.', 4), item('2.1', 4, 1),
    p(r('d. Headings tied to a list by their styles (Heading 1..3 ' +
      'give numId 5):')),
    heading('Heading one (1)'), heading('Heading two (1.1)', 2),
    heading('Heading three (1.1.1)', 3), heading('Heading two (1.2)', 2),
    heading('Heading one (2)'),
    p(r('e. Sparse levels (numId 6 defines levels 0 and 2 only):')),
    item('top (1.)', 6), item('level 2 ((a))', 6, 2),
    item('level 1, not defined: shown as level 0?', 6, 1),
    p(r('f. ilvl without numId (List Paragraph; then a heading):')),
    p(r('ilvl 1, no numId: no number?'),
      '<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="1"/>' +
      '</w:numPr>'),
    p(r('Heading 1 style with ilvl 1 and no numId: 2.1? (G15)'),
      '<w:pStyle w:val="Heading1"/><w:numPr><w:ilvl w:val="1"/>' +
      '</w:numPr>'),
    p(r('g. A numbering added as a tracked change (G16):')),
    p(r('numbered by a tracked change'), '<w:pStyle w:val=' +
      '"ListParagraph"/>' + LI(2).replace('</w:numPr>', '<w:ins ' +
      'w:id="1" w:author="Hand-off" w:date="2026-10-07T12:00:00Z"/>' +
      '</w:numPr>')),
    p(r('numbering whose earlier state (none) is tracked'),
      '<w:pStyle w:val="ListParagraph"/>' + LI(2) + '<w:pPrChange ' +
      'w:id="2" w:author="Hand-off" w:date="2026-10-07T12:00:00Z">' +
      '<w:pPr><w:pStyle w:val="ListParagraph"/></w:pPr></w:pPrChange>'),
  ];
  await roundTrip('list-3-multilevel.docx', await listDocx(paras,
    {numbering: NUMBERING}), [
    'Multilevel lists, legal numbering and numbered headings (the',
    'numbering of list-fixtures.mjs), opened and saved by !Word.',
  ]);
}

// ------------------------------------------------------------ 4 edits

{
  const bytes = await listDocx([
    p(r('Edited with !Word\'s keys and menus (see the README).')),
    ...['Alpha', 'Bravo', 'Charlie', 'Delta'].map((t) => item(t, 2)),
    // (no style: Remove from list takes Foxtrot back to the margin,
    // Backspace keeps Echo's text at the level's 0.5")
    p(r('Echo'), LI(2)), p(r('Foxtrot'), LI(2)),
    ...['Golf', 'Hotel'].map((t) => item(t, 2)),
    p(r('Sparse levels:')), item('Top', 6), item('Tab: to level 2', 6),
    heading('Numbered heading'), heading('Heading two, Tab', 2),
    p('', '<w:pStyle w:val="Heading1"/>'),
    p(r('Plain and list mixed:')), p(r('plain one')), item('India', 2),
    p(r('plain two')), item('Juliet', 2),
  ]);
  const d = new Document(await readDocx(bytes));
  d.clearHistory();
  let now = 0;
  const t = new Typing(d, {now: () => (now += 2000)});
  const all = () => d.doc.sections.flatMap((s) => s.blocks);
  const para = (s) => all().find((b) => b.type === 'p' &&
    b.text.startsWith(s));
  const at = (s, off = 0) => S.caret({id: para(s).id, off});
  const key = (id, sel) => run(id, d, t, sel);
  key('tab', at('Bravo'));
  key('tab', at('Charlie'));
  key('tab', at('Charlie'));
  key('tab', at('Delta'));
  key('shiftTab', at('Delta', 3));
  key('backspace', at('Echo'));
  apply('listOff', d, t, at('Foxtrot', 2));
  let c = key('enter', at('Golf', 4));
  c = t.type(c, 'Golf continued');
  key('tab', at('Hotel'));
  apply('indentMore', d, t, at('Hotel', 1));
  key('tab', at('Tab: to level 2'));
  key('tab', at('Heading two, Tab'));
  const empty = all().find((b) => b.type === 'p' && !b.text &&
    b.pStyle === 'Heading1');
  key('enter', S.caret({id: empty.id, off: 0}));
  key('tab', S.select({id: para('plain one').id, off: 0},
    {id: para('Juliet').id, off: 3}));
  await save('list-4-edits.docx', d.doc, [
    'A list (numId 2: 1. a. i.) edited with !Word, one command each:',
    ' - Tab at the start of "Bravo" (a.), twice at "Charlie" (i.);',
    ' - Tab then Shift-Tab (in the middle of the text) on "Delta":',
    '   back at a.;',
    ' - Backspace at the start of "Echo" (no paragraph style): its',
    '   number goes, its text stays where it was, 0.5" (a direct',
    '   indent written; G10);',
    ' - Format > List > Remove from list on "Foxtrot" (no paragraph',
    '   style): its number goes and it returns to its style\'s',
    '   indent, the margin (G11);',
    ' - Enter after "Golf", typing "Golf continued": a new item;',
    ' - Tab at "Hotel", then Ctrl-M (indent more) in it: a direct',
    '   indent 0.5" more than its level\'s;',
    ' - Tab at "Tab: to level 2" (numId 6 defines levels 0 and 2: it',
    '   goes to level 2; G12);',
    ' - Tab at the start of "Heading two, Tab": a direct numPr ilvl 2',
    '   is written, the style stays Heading 2 (G13);',
    ' - Enter in the empty Heading 1 after it (numbered by its style):',
    '   the list ends there, numId 0 is written and no paragraph is',
    '   added; it shows no number (G18);',
    ' - Tab over "plain one" .. "Juliet": only the list items',
    '   (India, Juliet) go one level deeper; the plain ones get no',
    '   tab and no number.',
  ]);
}

// ------------------------------------------------------------ README

const README = [
  '!Word lists hand-off (local only, not committed)',
  '================================================',
  '',
  'Made by: node tests/moreapps/handoff-lists.mjs (re-run it after',
  'changing !Word; files whose bytes are the same are not rewritten;',
  'no other file here is touched). Files 1 to 3 are made by the',
  'generator (!Word cannot make numbering definitions), opened and',
  'saved by !Word; file 4 is edited with !Word\'s own commands. Open',
  'each in real Word: note any repair prompt or error, and whether',
  'every paragraph shows the label listed below for it, with its',
  'text and first line where listed (Word: the ruler, or Paragraph',
  'dialogue). Then the open questions: there !Word copies what Word',
  'is believed to do, unverified.',
  '',
  'Open questions (please try each in real Word and note what it does):',
  '',
  'G1 Letters after z. !Word: a b .. z, then aa bb .. zz, then aaa',
  '   (the letter repeated), list-2 e. Word?',
  'G2 Restart after a higher level. !Word: a deeper level restarts',
  '   when any higher level appears (list-3 a. and b.). Word?',
  'G3 lvlRestart 0 (never restart): !Word keeps counting level 1',
  '   across level-0 items (list-3 b.: "c)"). Word?',
  'G4 Two numIds sharing one abstractNum. !Word: they share one',
  '   counter (list-2 b.: four, five); a startOverride restarts the',
  '   count once for that numId (list-2 c.); numId 1 after numId 3',
  '   (list-2 d.): !Word shows 3. (the shared counter goes on from',
  '   numId 3\'s count). What does Word show in b., c. and d.?',
  'G5 Bullet glyphs. !Word maps Symbol U+F0B7 to a bullet, Courier',
  '   New "o" to a white bullet U+25E6, Wingdings U+F0A7 to a small',
  '   square, U+F0D8 an arrow, U+F0FC a check mark, U+F076 a diamond,',
  '   other private-use characters to a bullet (list-1). Do the shapes',
  '   match Word\'s closely enough?',
  'G6 A label wider than its hanging space (list-2 i.). !Word moves',
  '   the text to the next default tab stop, counted from the MARGIN',
  '   (0.5" stops), while tabs typed in text count from the',
  '   paragraph\'s left indent. Where does Word put the text?',
  'G7 Indent precedence: style < numbering level < direct, attribute',
  '   by attribute (list-2 k.): a level giving only "left" keeps the',
  '   style\'s first-line/hanging; a level with no indent leaves the',
  '   style\'s; a direct indent wins. Same in Word?',
  'G8 Paragraph indents of headings tied to a list (list-3 d.):',
  '   !Word uses the level\'s indent (left 0.3", 0.4", 0.5", hanging',
  '   as much). Word?',
  'G9 Right-aligned labels (lvlJc right, list-2 f. and h.). !Word',
  '   keeps the label inside the hanging space (right-aligned to the',
  '   text indent); a label wider than that starts at the first-line',
  '   position. Word right-aligns the number AT the indent and may',
  '   let 100. stick out to the left. Which?',
  'G10 Backspace at the start of an item (list-4 Echo). !Word: the',
  '   number goes, the paragraph stays, and its text stays where it',
  '   was drawn (the level\'s indent written as a direct one, the',
  '   hanging first line made 0) - when the label fitted its space.',
  '   A second Backspace joins it to the paragraph above. Word?',
  'G11 Remove from list (list-4 Foxtrot): !Word returns the text to',
  '   its style\'s indent (as Word\'s Numbering button is believed',
  '   to). Word: does the text go back to the margin/style indent?',
  'G12 Tab and Shift-Tab. !Word: at the start of an item (or on a',
  '   selection of items) Tab goes one level deeper - to the next',
  '   level the list DEFINES (list-4 "Tab: to level 2", sparse',
  '   levels); Shift-Tab anywhere in an item goes one level up;',
  '   Shift-Tab on level 1 (the top) does nothing; Tab on level 9',
  '   (the last) does nothing and types no tab. Word?',
  'G13 Tab on a heading numbered by its style (list-4 "Heading two,',
  '   Tab"). !Word writes a direct level and keeps Heading 2; Word is',
  '   believed to switch the style to Heading 3 (the level\'s',
  '   pStyle). What does Word do?',
  'G14 isLgl (legal numbering, list-3 c.): !Word shows every number',
  '   of a legal level as decimal (Article I. then 1.1). Word?',
  'G15 ilvl without numId (list-3 f.): !Word shows no number for',
  '   the List Paragraph one, and for the Heading 1 one takes numId',
  '   5 from the style with ilvl 1 (2.1-like). Word?',
  'G16 numPr in a tracked change (list-3 g.): !Word shows the number',
  '   (as if the change were accepted) and writes the change back as',
  '   it was. Word: the number shown with the change marked?',
  'G17 A start value of 2^31 or a negative start: !Word shows them',
  '   as given (2147483648., -5). Word repairs or refuses such a',
  '   file? (not in these files: the hostile tests make them)',
  'G18 Enter in an empty item of a list numbered by its style',
  '   (list-4: the empty Heading 1). !Word ends the list: it writes',
  '   numId 0 (the style stays) and adds no paragraph. Word: does it',
  '   end the list so, or remove the style, or add an item?',
  'G19 Shift-Tab in the middle of an item. !Word promotes the item',
  '   (anywhere in it). Word: only at the start, or anywhere?',
  'G20 Tab at the start of an item of a single-level list, or on the',
  '   deepest level. !Word does nothing (no tab typed). Word: does it',
  '   indent the paragraph, or type a tab?',
  'G21 <w:numPr><w:numId w:val="0"/></w:numPr> with no ilvl, as',
  '   !Word writes when it takes a style-numbered paragraph out of',
  '   its list (Enter as in G18, Backspace or Remove from list; the',
  '   empty Heading 1 of list-4). Does Word open it without repair',
  '   and show no number?',
  'G22 The label\'s font. !Word draws the number in the format of the',
  '   paragraph\'s first run (the paragraph mark is not modelled) with',
  '   the level\'s own formatting over it. Word uses the paragraph',
  '   mark\'s: compare a list whose first word is bold or large.',
  'G23 Tab with a selection inside one item that starts at its first',
  '   character. !Word demotes the item. Word: does it replace the',
  '   selection with a tab instead?',
  ...lines,
  '',
];
const how = put('list-README.txt', Buffer.from(README.join('\n'), 'utf8'));
made.push(`list-README.txt (${how})`);
console.log('hand-off files in ' + OUT + ':\n  ' + made.join('\n  '));
