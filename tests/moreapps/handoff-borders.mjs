// Generates the real-Word hand-off files for !Word's borders,
// shading, symbols, special characters and change case (local only,
// never committed: tests/moreapps/corpus/ is git-ignored). Not a test:
//
//   node tests/moreapps/handoff-borders.mjs
//
// Writes into tests/moreapps/corpus/handoff/ (made if missing):
//   bdr-1-boxes.docx     a box in each style and width, a group of
//                        paragraphs with the same borders and a
//                        between line (one box), paragraphs with
//                        different indents (not one box), sides
//                        turned off again, a style's border cancelled
//   bdr-2-shading.docx   paragraph shading (a colour, shading with
//                        and without borders, a group), character
//                        shading, and highlight over shading
//   sym-1-symbols.docx   one character of each set of the Symbol box,
//                        a no-break space, a non-breaking hyphen and
//                        an optional hyphen
//   case-1.docx          text for each Change case mode, already
//                        changed by !Word, and the Shift-F3 cycle
//   bdr-README.txt       what Word should show, the open questions
//                        (BD1.., SY1.., CS1..)
// Everything is done with !Word's own commands (FormatApply 'borders',
// 'paraShade', 'charShade', 'changeCase', 'caseCycle', 'paraBox',
// InsertApply's nbsp / nbHyphen / softHyphen through EditApply, and
// typing for symbols) on a Document, as the window makes them. A file
// is written only when its bytes change, so a file open in Word is
// left alone; nothing else in the folder is touched or removed. Each
// file is read back and every paragraph, its sides and shading listed
// in the README, so the list is what was really written.
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
import {SETS} from '../../tools/moreapps/!WimpLib/CharSets';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {buildDocx, documentXml, stylesXml, p, r} from './build-docx.mjs';
import {lintPackage} from './lint-package.mjs';

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
    const b = all().find((x) => x.type === 'p' && x.text.startsWith(start));
    if (!b) throw new Error('no paragraph starting ' + JSON.stringify(start));
    return b;
  };
  return {
    d, para, all,
    caret: (start, off = 0) => S.caret({id: para(start).id,
      off: off === 'end' ? para(start).text.length : off}),
    over: (a, b) => S.select({id: para(a).id, off: 0},
      {id: para(b).id, off: para(b).text.length}),
    /** Characters from..to of the paragraph starting with start. */
    part: (start, from, to) => S.select({id: para(start).id, off: from},
      {id: para(start).id, off: to}),
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
  };
}

const lines = [];
const say = (...x) => lines.push(...x);

// ------------------------------------------------------------ read back

const edge = (s) => s ? `${s.val}/${s.sz ?? '-'}/${s.space ?? '-'}/` +
  `${s.color ?? '-'}${s.shadow ? '/shadow' : ''}` : null;
const shd = (x) => x ? `${x.val}${x.color ? '/' + x.color : ''}` +
  `${x.fill ? '/fill ' + x.fill : ''}` : null;

/** What a written file holds: each paragraph, sides, shading. */
async function describe(bytes) {
  const doc = await readDocx(bytes);
  const out = [];
  let k = 0;
  for (const sec of doc.sections) {
    for (const b of sec.blocks) {
      k++;
      if (b.type !== 'p') { out.push(`  ${String(k).padStart(2)}. (kept block)`); continue; }
      const text = b.text.replace(/[￼ ]/g, (c) =>
        c === ' ' ? '[nbsp]' : '[inline]').slice(0, 130);
      const ind = b.pPr.ind ? ` ind ${JSON.stringify(b.pPr.ind)}` : '';
      out.push(`  ${String(k).padStart(2)}. ${text}${b.pStyle ? '   [' + b.pStyle + ']' : ''}${ind}`);
      const bd = b.pPr.pBdr;
      if (bd) {
        const sides = Object.keys(bd).map((n) => `${n} ${edge(bd[n])}`);
        if (sides.length) out.push(`      sides (val/sz/space/color): ${sides.join('; ')}`);
      }
      if (b.pPr.shd) out.push(`      shading: ${shd(b.pPr.shd)}`);
      const rs = (b.runs || []).filter((x) => x.rPr && (x.rPr.shd || x.rPr.highlight));
      for (const x of rs) {
        out.push(`      chars ${x.start}-${x.end}: ` + [x.rPr.shd && `shading ${shd(x.rPr.shd)}`,
          x.rPr.highlight && `highlight ${x.rPr.highlight}`].filter(Boolean).join(', '));
      }
    }
  }
  return out;
}

const made = [];
async function save(name, doc, about) {
  const bytes = await writeDocx(doc, {date: DATE});
  const problems = lintPackage(await readZip(bytes)).problems
    .filter((q) => q.level === 'error');
  if (problems.length) throw new Error(name + ': ' + JSON.stringify(problems));
  made.push(`${name} (${bytes.length} bytes, ${put(name, bytes)})`);
  say('', name, '-'.repeat(name.length), ...about, '',
    'What !Word wrote (read back from the saved file: each paragraph',
    'with its sides, shading and shaded characters):',
    ...await describe(bytes));
}

/** Type paragraphs (the first into the empty one) into a session. */
function typeParas(s, texts) {
  let c = S.caret({id: s.all()[0].id, off: 0});
  texts.forEach((t, k) => {
    if (k) c = s.enter(c);
    c = s.type(c, t);
  });
}

const side = (val, sz = 12, color = '000000', space) => ({val, sz, color,
  ...(space === undefined ? {} : {space})});
// as the Borders and shading box's Box makes it: Word's spaces
const BOX = (val, sz, color) => ({top: side(val, sz, color, 1),
  left: side(val, sz, color, 4), bottom: side(val, sz, color, 1),
  right: side(val, sz, color, 4)});
const SHD = (fill) => ({val: 'clear', color: 'auto', fill});

// ------------------------------------------------------------ 1: boxes

{
  const s = session(newDoc({date: DATE}));
  const stylesList = ['single', 'double', 'dotted', 'dashed', 'thick'];
  const widths = [[2, '1/4'], [4, '1/2'], [6, '3/4'], [8, '1'],
    [12, '1 1/2'], [18, '2 1/4'], [24, '3'], [48, '6'], [96, '12']];
  const texts = ['Each box: a style and a width (Word draws a different line for each)'];
  for (const v of stylesList) texts.push(`Style ${v}, width 1 1/2 pt`);
  for (const [, label] of widths) texts.push(`Single, width ${label} pt.`);
  texts.push('Group A one: three paragraphs, same borders, a between line',
    'Group A two', 'Group A three',
    'Between the groups: a plain paragraph',
    'Group B one: left indent 0.5"', 'Group B two: left indent 1" (not one box with B one)',
    'Group B three: left indent 1"',
    'Side off: a box with the bottom side turned off again',
    'Colours: top red, left green, bottom blue, right orange',
    'End: no borders');
  typeParas(s, texts);
  const colour = {top: 'FF0000', left: '00B050', bottom: '0070C0', right: 'ED7D31'};
  stylesList.forEach((v) => s.fmt('borders', s.caret(`Style ${v}`),
    {pBdr: BOX(v, 12)}));
  widths.forEach(([sz, label]) => s.fmt('borders', s.caret(`Single, width ${label} pt.`),
    {pBdr: BOX('single', sz)}));
  const g = {...BOX('single', 8, '7030A0'), between: side('single', 8, '7030A0', 1)};
  s.fmt('borders', s.over('Group A one', 'Group A three'), {pBdr: g});
  s.fmt('borders', s.over('Group B one', 'Group B three'), {pBdr: g});
  s.fmt('paraBox', s.caret('Group B one'), {ind: {left: 720}});
  s.fmt('paraBox', s.over('Group B two', 'Group B three'), {ind: {left: 1440}});
  s.fmt('borders', s.caret('Side off'), {pBdr: BOX('single', 8)});
  s.fmt('borders', s.caret('Side off'), {pBdr: {bottom: null}});
  s.fmt('borders', s.caret('Colours'), {pBdr: {
    top: side('single', 12, colour.top), left: side('single', 12, colour.left),
    bottom: side('single', 12, colour.bottom), right: side('single', 12, colour.right)}});
  await save('bdr-1-boxes.docx', s.d.doc, [
    'A new document. Lines 2..6 are boxes (Format > Borders and',
    'shading > Box) in each style at 1 1/2 pt; the next nine are',
    'single boxes from 1/4 pt to 12 pt (!Word accepts up to 12 pt =',
    'sz 96; Word offers up to 6 pt in its box: BD2). "Group A" is',
    'three paragraphs with the same borders and a between line: one',
    'box with a line between them (BD3). "Group B" has the same',
    'borders but a different left indent: !Word draws a box for B',
    'one, then one for B two and three (BD4). "Side off" has a box',
    'with the bottom side turned off. "Colours" has a different',
    'colour on each side. Word should open it with no repair prompt',
    'and show the same boxes; the line styles are drawn by Word, in',
    '!Word as solid, double, dotted, dashed and thick lines (BD5).',
  ]);
}

// ------------------------------------------------------------ 2: shading

{
  const s = session(newDoc({date: DATE}));
  typeParas(s, [
    'Paragraph shading: a light grey fill, no borders',
    'Shaded paragraph with space before and after (BD6)',
    'Shaded group one, with a box',
    'Shaded group two, with the same box',
    'Shading only, group one: yellow',
    'Shading only, group two: yellow too (BD1)',
    'Shading only, group three: green (not the same box)',
    'Plain paragraph between',
    'Character shading: some words are cyan, and some are cyan with a green highlight on top',
    'Highlight only, for comparison: a yellow highlight',
    'Shading in a pattern: 25 percent',
    'End',
  ]);
  s.fmt('paraShade', s.caret('Paragraph shading'), SHD('D9D9D9'));
  s.fmt('paraBox', s.caret('Shaded paragraph with'), {spacing: {before: 240, after: 240}});
  s.fmt('paraShade', s.caret('Shaded paragraph with'), SHD('FFFF99'));
  s.fmt('borders', s.over('Shaded group one', 'Shaded group two'),
    {pBdr: BOX('single', 8, 'C00000'), shd: SHD('FCE4D6')});
  s.fmt('paraShade', s.over('Shading only, group one', 'Shading only, group two'), SHD('FFFF00'));
  s.fmt('paraShade', s.caret('Shading only, group three'), SHD('92D050'));
  const cs = s.para('Character shading');
  const i = cs.text.indexOf('some words'), j = cs.text.indexOf('and some');
  s.fmt('charShade', s.part('Character shading', i, i + 10), SHD('00FFFF'));
  s.fmt('charShade', s.part('Character shading', j, j + 8), SHD('00FFFF'));
  s.fmt('highlight', s.part('Character shading', j, j + 8), 'green');
  const h = s.para('Highlight only').text.indexOf('a yellow');
  s.fmt('highlight', s.part('Highlight only', h, h + 8), 'yellow');
  s.fmt('paraShade', s.caret('Shading in a pattern'), {val: 'pct25', color: 'FF0000', fill: 'FFFFFF'});
  await save('bdr-2-shading.docx', s.d.doc, [
    'A new document. Line 1: a grey fill. Line 2: a fill with 12 pt',
    'space before and after (BD6: is the space before / after',
    'shaded?). Lines 3-4: a red box with a pink fill, one box. Lines',
    '5-7: shading only; the first two have the same yellow, the third',
    'is green (BD1). Line 9: character shading (cyan) with a green',
    'highlight over part of it (BD7: which is on top?). Line 10: a',
    'highlight with no shading. Line 11: a pattern (25 percent',
    'red on white), made with the paraShade command (the box offers',
    'only a colour). Word should open it with no repair prompt.',
  ]);
}

// ------------------------------------------------------------ 3: symbols

{
  const s = session(newDoc({date: DATE}));
  const rows = SETS.map((set) => `${set.name}: ${set.chars.slice(0, 6)}`);
  const texts = ['One character from each set of the Symbol box (the first six of each)', ...rows,
    'No-break space: a', 'Non-breaking hyphen: a', 'Optional hyphen: a',
    'Long line for the hyphens: aaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbbbbbbb ccccccccccccccccccc',
    'Symbol in bold and italic: ',
    'End'];
  typeParas(s, texts);
  let c = s.caret('No-break space: a', 'end');
  c = s.key('nbsp', c);
  s.type(c, 'b');
  c = s.caret('Non-breaking hyphen: a', 'end');
  c = s.key('nbHyphen', c);
  s.type(c, 'b');
  c = s.caret('Optional hyphen: a', 'end');
  c = s.key('softHyphen', c);
  s.type(c, 'b');
  c = s.caret('Long line for the hyphens: aaaa', 'end');
  c = s.key('nbHyphen', c);
  c = s.type(c, ' x');
  c = s.key('softHyphen', c);
  s.type(c, 'y');
  c = s.caret('Symbol in bold', 'end');
  c = s.fmt('bold', c);
  c = s.type(c, '©é');
  c = s.fmt('italic', c);
  s.type(c, '→');
  await save('sym-1-symbols.docx', s.d.doc, [
    'A new document. Each set of the Symbol box has a line with its',
    'first six characters (typed as plain text, in the current font:',
    'no w:sym, SY1). Then "a", a no-break space, "b" (Ctrl+Shift+',
    'Space), a non-breaking hyphen (<w:noBreakHyphen/>, Ctrl+Shift+-)',
    'and an optional hyphen (<w:softHyphen/>) between a and b (SY2).',
    'Word should open it with no repair prompt, show all the',
    'characters in Calibri (a few may come from another font: SY3),',
    'and treat the hyphens as Word\'s own (the optional hyphen',
    'invisible unless the line breaks there). The last line has a',
    'bold symbol and an italic one.',
  ]);
}

// ------------------------------------------------------------ 4: case

{
  const s = session(newDoc({date: DATE}));
  const T = 'the quick brown fox jumps over the lazy dog. it is 3rd of june! O\'Neil\'s well-known ﬁne straße';
  const names = ['Sentence case', 'lowercase', 'UPPERCASE',
    'Capitalize Each Word', 'tOGGLE cASE'];
  const texts = ['Change case on the same text (the mode named first):'];
  names.forEach((n) => texts.push(`${n}: ${T}`));
  texts.push('Shift-F3 once: ' + T, 'Shift-F3 twice: ' + T, 'Shift-F3 three times: ' + T,
    'Greek final sigma: ΟΔΥΣΣΕΥΣ ΣΟΦΟΣ', 'Caret in a word: hello world',
    'Bold run keeps bold: ' + 'plain bold plain', 'End');
  typeParas(s, texts);
  const modes = ['sentence', 'lower', 'upper', 'title', 'toggle'];
  names.forEach((n, k) => {
    const text = s.para(n + ':').text;
    const from = n.length + 2;
    s.fmt('changeCase', S.select({id: s.para(n + ':').id, off: from},
      {id: s.para(n + ':').id, off: text.length}), modes[k]);
  });
  for (const [label, times] of [['Shift-F3 once', 1], ['Shift-F3 twice', 2], ['Shift-F3 three times', 3]]) {
    const b = s.para(label);
    const sel = S.select({id: b.id, off: label.length + 2}, {id: b.id, off: b.text.length});
    for (let k = 0; k < times; k++) s.fmt('caseCycle', sel);
  }
  const g = s.para('Greek');
  s.fmt('changeCase', S.select({id: g.id, off: 19}, {id: g.id, off: g.text.length}), 'lower');
  const cw = s.para('Caret in a word');
  s.fmt('changeCase', S.caret({id: cw.id, off: cw.text.indexOf('hello') + 2}), 'upper');
  const bo = s.para('Bold run keeps');
  const k0 = bo.text.indexOf('bold');
  s.fmt('bold', s.part('Bold run keeps', k0, k0 + 4));
  s.fmt('changeCase', s.part('Bold run keeps', 'Bold run keeps bold: '.length, bo.text.length), 'upper');
  await save('case-1.docx', s.d.doc, [
    'A new document. Lines 2..6 each had one Format > Change case',
    'mode applied to the text after the colon: Sentence case,',
    'lowercase, UPPERCASE, Capitalize Each Word, tOGGLE cASE (CS2,',
    'CS3: "straße" and the "fi" ligature keep their length; the',
    'apostrophe words; "3rd"). Lines 7..9 had Shift-F3 once, twice',
    'and three times on a selection (CS1: Word cycles Sentence case,',
    'lowercase, UPPERCASE, or the other way?). Line 10 is Greek in',
    'capitals made small (CS4: final sigma). Line 11 had a caret in',
    'a word and UPPERCASE (the whole word changes). Line 12 has a',
    'bold word kept bold. Word should open it with no repair prompt.',
  ]);
}

// ------------------------------------------------------------ README

const README = [
  'Hand-off files for !Word\'s borders, shading, symbols and change',
  'case (Batch A, task A5). Made by',
  'node tests/moreapps/handoff-borders.mjs with !Word\'s own commands;',
  'nothing here is committed. Open each file in real Word and answer',
  'the questions below; the lists under each file name are what',
  '!Word really wrote.',
  '',
  'On screen: Format > Borders and shading... (Paragraph or Text;',
  'None, Box, Custom; the sides; Style, Width, Colour; Fill),',
  'Insert > Symbol... and Special character >, Format > Change case >',
  'and Shift-F3.',
  '',
  'Questions',
  '---------',
  'BD1 Paragraphs with shading but no borders: !Word joins them into',
  '    one block only when the fill is the same (bdr-2, lines 5-7).',
  '    Word: one block whenever the shading is equal, or a separate',
  '    band for each paragraph? What when the fills differ?',
  'BD2 Widths: !Word offers 1/4, 1/2, 3/4, 1, 1 1/2, 2 1/4 and 3 pt',
  '    and draws what a file has up to 12 pt (sz 96); wider is drawn',
  '    as 12 pt. Word\'s box offers up to 6 pt: does Word draw bdr-1\'s',
  '    6 pt and 12 pt boxes, or complain? Does the 3 pt and 6 pt line',
  '    look as thick as !Word\'s?',
  'BD3 A group with a between line (bdr-1 Group A): one box with',
  '    the between line drawn between the paragraphs, the left and',
  '    right sides unbroken. !Word draws the top side on the first',
  '    paragraph and the bottom on the last. Word?',
  'BD4 The same borders with different LEFT indents (bdr-1 Group B)',
  '    are not one box. What does Word do when only the right indent',
  '    or only the first-line indent differs? (!Word: right indent',
  '    differing separates, first line does not.)',
  'BD5 Line styles: !Word draws single and thick as solid lines',
  '    (thick is the width as given), double as two lines with a gap',
  '    of one line, dotted and dashed as dots and dashes, all other',
  '    names (wave, triple, 3D...) as single. Word draws each as its',
  '    own style: nothing to fix, but the file must keep them (the',
  '    box shows the name that was there).',
  'BD6 Shading and the space before / after (bdr-2 line 2): !Word',
  '    does not shade the space before the first paragraph or after',
  '    the last of a box, only between paragraphs of one box. Word?',
  'BD7 Character shading (w:shd in rPr) and a highlight on the same',
  '    text (bdr-2 line 9): !Word draws the highlight over the',
  '    shading. Word?',
  'BD8 Borders from a style or a theme colour (w:themeColor): the',
  '    box refuses to change them with a beep ("raw" borders). In',
  '    Word they change. (No file: make a paragraph with a themed',
  '    border in Word, save, open in !Word, try Format > Borders.)',
  'BD9 Apply to Text at a caret: !Word sets the shading for the next',
  '    text typed; Word may shade the current word. Text with a',
  '    border (w:bdr) is not offered in !Word. (No file.)',
  'BD10 A box on the first paragraph of a list item: the box takes',
  '    in the label (hanging indent). Word draws the left side at',
  '    the left of the label? (Make it in Word, open in !Word.)',
  'SY1 Symbols are plain Unicode text in the current font (sym-1).',
  '    Word\'s Symbol box offers "(normal text)" and a font; a',
  '    character from another font is typed as w:sym there. Does',
  '    sym-1 open and show every character, in Calibri or a',
  '    fallback? Which characters need another font?',
  'SY2 <w:noBreakHyphen/> and <w:softHyphen/> inside a run (sym-1,',
  '    lines 12-14): open without a repair prompt; the non-breaking',
  '    hyphen never breaks the line; the optional hyphen only shows',
  '    at a line end (the long line, with the window narrowed).',
  'SY3 The Symbol box: Latin-1, Latin Extended-A, Greek, Cyrillic,',
  '    Punctuation, Currency, Letterlike and fractions, Arrows,',
  '    Maths, Geometric shapes (the characters in all of Carlito,',
  '    Liberation Sans and Liberation Serif). Does Word show all as',
  '    Calibri? (Greek, Cyrillic and shapes are the likely',
  '    fallbacks.)',
  'SY4 Ctrl+Shift+Space in !Word is a no-break space (U+00A0), and a',
  '    no-break space after "1." does NOT start a list. Word?',
  'SY5 Ctrl+Shift+- in Word is the non-breaking hyphen. In a',
  '    browser it may zoom out: does !Word get the key in Chrome,',
  '    Firefox and Safari? A symbol typed in overwrite mode',
  '    (Insert key) replaces the next character in !Word; Word?',
  'CS1 Shift-F3 order: !Word cycles CAPITALS -> small -> Title Case',
  '    from any text (a sentence or any mixture goes to capitals',
  '    first; a step that changes nothing is skipped). Word cycles',
  '    Sentence case -> lowercase -> UPPERCASE (or Title Case first',
  '    when the selection is lowercase?). case-1 lines 7-9.',
  'CS2 Capitalize Each Word: !Word makes the rest of each word small',
  '    ("O\'NEIL" -> "O\'neil"?). Word leaves the other letters alone?',
  '    Apostrophes and hyphens (well-known, O\'Neil\'s): case-1 line 5.',
  'CS3 Lengths never change: "straße" -> "STRAßE" (not "STRASSE"),',
  '    and the fi ligature is left as it is. Word makes "STRASSE".',
  '    (The layout cannot change the length of the text.)',
  'CS4 Final sigma: lowercase of "ΟΔΥΣΣΕΥΣ" gives "οδυσσευς" with a',
  '    final sigma (case-1 line 10). Word?',
  'CS5 A caret in a word changes that word (Word does); a caret',
  '    between spaces changes nothing (Word may change the next',
  '    word).',
  'CS6 Shift-F3 on a selection: !Word keeps the selection, one undo',
  '    step per press. Word?',
  ...lines,
  '',
];
const how = put('bdr-README.txt', Buffer.from(README.join('\n'), 'utf8'));
made.push(`bdr-README.txt (${how})`);
console.log('hand-off files in ' + OUT + ':\n  ' + made.join('\n  '));
