// Generates the real-Word hand-off files for !Word's formatting (local
// only, never committed: tests/moreapps/corpus/ is git-ignored). Not a
// test:
//
//   node tests/moreapps/handoff-format.mjs
//
// Writes into tests/moreapps/corpus/handoff/ (made if missing):
//   fmt-1-character.docx  character formatting in a new document
//   fmt-2-paragraph.docx  alignment, indents, spacing
//   fmt-3-rich.docx       formatting edits in a rich document
//   fmt-4-undo.docx       formats, some of them undone
//   fmt-README.txt        what Word should show, the open questions
// Every format is made with !Word's own commands (FormatApply's ids:
// what the keys, the Format menu, the toolbar and the ruler run) on
// a Document, as the window makes them. A file is written only when
// its bytes change (the output is the same every run), so a file open
// in Word is left alone; nothing else in the folder is touched or
// removed (the typed-* files of handoff-typing.mjs among them). Each
// file is read back and its paragraphs and formats listed in the
// README, so the list is what was really written.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx, newDoc} from '../../tools/moreapps/!Word/DocxWrite';
import {Document} from '../../tools/moreapps/!Word/Document';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {apply} from '../../tools/moreapps/!Word/FormatApply';
import {setPara} from '../../tools/moreapps/!Word/FormatSet';
import {forTyping, styleFor} from '../../tools/moreapps/!Word/Pending';
import * as S from '../../tools/moreapps/!Word/Selection';
import * as E from '../../tools/moreapps/!Word/Edit';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {richDocx} from './edit-rich.mjs';
import {lintPackage} from './lint-package.mjs';

const OUT = fileURLToPath(new URL('./corpus/handoff/', import.meta.url));
const DATE = new Date(Date.UTC(2026, 9, 6, 12));
fs.mkdirSync(OUT, {recursive: true});

/** Write bytes to name unless the file already holds them. */
function put(name, bytes) {
  const f = path.join(OUT, name);
  const b = Buffer.from(bytes);
  if (fs.existsSync(f) && fs.readFileSync(f).equals(b)) return 'same';
  fs.writeFileSync(f, b);
  return 'written';
}

// ------------------------------------------------------------ helpers

/** A formatting session on a Document, with a clock for Typing. */
function session(doc) {
  const d = new Document(doc);
  d.clearHistory();
  let now = 0;
  const t = new Typing(d, {now: () => now});
  let pending = null;
  const all = () => d.doc.sections.flatMap((s) => s.blocks);
  const para = (start) => {
    const b = all().find((x) => x.type === 'p' && x.text.startsWith(start));
    if (!b) throw new Error('no paragraph starting ' + JSON.stringify(start));
    return b;
  };
  /** {id, off}: at a number, before (or after: end) a string, 'end'. */
  const pos = (start, at = 0, end = false) => {
    const b = para(start);
    let off = at;
    if (at === 'end') off = b.text.length;
    else if (typeof at === 'string') {
      const k = b.text.indexOf(at);
      if (k < 0) throw new Error(`no ${JSON.stringify(at)} in ${b.text}`);
      off = k + (end ? at.length : 0);
    }
    return {id: b.id, off};
  };
  const s = {
    d, all, para, pos,
    caret: (start, at) => S.caret(pos(start, at)),
    /** The words `what` of the paragraph starting `start`. */
    word: (start, what) => S.select(pos(start, what), pos(start, what,
      true)),
    select: (a, b) => S.select(a, b),
    /** Type text keystroke by keystroke, with the pending format. */
    type(sel, text) {
      for (const ch of text) {
        now += 50;
        sel = t.type(sel, ch, {rPr: forTyping(pending),
          rStyle: styleFor(pending)});
        pending = null;
      }
      return sel;
    },
    enter(sel) { return t.command(() => E.splitPara(d, sel)); },
    /** FormatSet.setPara (paragraph values with no key of their own). */
    para(sel, patch) {
      now += 2000;
      pending = setPara(d, t, sel, patch, pending).pending;
    },
    /** A FormatApply command (as a key, menu or toolbar runs it). */
    fmt(id, sel, arg) {
      now += 2000;
      const r = apply(id, d, t, sel, arg, pending);
      pending = r.pending;
      return r.sel;
    },
  };
  return s;
}

const lines = [];
const say = (...x) => lines.push(...x);

const SHOW = [['b', (v) => (v ? 'bold' : 'NOT bold')],
  ['i', (v) => (v ? 'italic' : 'not italic')],
  ['u', (v) => 'underline ' + v], ['strike', (v) => (v ? 'struck' : '')],
  ['vertAlign', (v) => v], ['color', (v) => 'colour ' + v],
  ['highlight', (v) => 'highlight ' + v], ['sz', (v) => v / 2 + ' pt'],
  ['rFonts', (v) => 'font ' + (v.ascii || v.hAnsi)]];

/** What a written file holds: its paragraphs and their formats. */
async function describe(bytes) {
  const doc = await readDocx(bytes);
  const out = [];
  for (const b of doc.sections.flatMap((x) => x.blocks)) {
    if (b.type !== 'p') { out.push('    [table]'); continue; }
    const pp = [b.pStyle];
    const {jc, ind, spacing} = b.pPr;
    if (jc) pp.push('jc ' + jc);
    if (ind) pp.push('ind ' + JSON.stringify(ind).replace(/"/g, ''));
    if (spacing) {
      pp.push('spacing ' + JSON.stringify(spacing).replace(/"/g, ''));
    }
    if (b.pPr.numPr) pp.push('list');
    const show = (t) => JSON.stringify(t.replace(/\ufffc/g, '<obj>')
      .replace(/\t/g, '<tab>').replace(/\n/g, '<br>')).slice(1, -1);
    out.push('    ' + (pp.filter(Boolean).length ? '(' +
      pp.filter(Boolean).join('; ') + ') ' : '') + show(b.text));
    for (const r of b.runs) {
      const f = SHOW.filter(([k]) => r.rPr[k] !== undefined)
        .map(([k, fn]) => fn(r.rPr[k])).filter(Boolean);
      if (r.rStyle) f.push('style ' + r.rStyle);
      if (f.length) {
        out.push('      "' + show(b.text.slice(r.start, r.end)) + '": ' +
          f.join(', '));
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
  const how = put(name, bytes);
  made.push(`${name} (${bytes.length} bytes, ${how})`);
  say('', name, '-'.repeat(name.length), ...about, '',
    'What !Word wrote (read back: each paragraph, its style and',
    'paragraph formatting, then each run with direct formatting;',
    '<obj> is a hyperlink or another object):', ...await describe(bytes));
}

/** Type paragraphs (the first into the empty one) into a session. */
function typeParas(s, texts) {
  let c = s.caret('', 0);
  texts.forEach((t, k) => {
    if (k) c = s.enter(c);
    c = s.type(c, t);
  });
}

// ------------------------------------------------------------ 1: character

{
  const s = session(newDoc({date: DATE}));
  typeParas(s, [
    'Bold, italic, underlined and struck words.',
    'E = mc2 and H2O: a superscript and a subscript.',
    'Red, desktop red, green, automatic colour.',
    'Yellow, bright green and dark blue highlight.',
    'Sizes: eight, fourteen, twenty-four, seventy-two.',
    'Fonts: Arial, Times New Roman, Courier New.',
    'Bigger twice, smaller once.',
    'Mixed: half bold, half plain; then all made bold.',
    'At a caret: ',
  ]);
  s.fmt('bold', s.word('Bold,', 'Bold'));
  s.fmt('italic', s.word('Bold,', 'italic'));
  s.fmt('underline', s.word('Bold,', 'underlined'));
  s.fmt('strike', s.word('Bold,', 'struck'));
  s.fmt('superscript', s.select(s.pos('E = mc2', 6), s.pos('E = mc2', 7)));
  s.fmt('subscript', s.select(s.pos('E = mc2', 13), s.pos('E = mc2', 14)));
  s.fmt('color', s.word('Red,', 'Red'), 'FF0000');
  s.fmt('color', s.word('Red,', 'desktop red'), 11);
  s.fmt('color', s.word('Red,', 'green'), '00B050');
  s.fmt('color', s.word('Red,', 'automatic'), 'FF0000');
  s.fmt('color', s.word('Red,', 'automatic'), 'auto');
  s.fmt('highlight', s.word('Yellow,', 'Yellow'), 'yellow');
  s.fmt('highlight', s.word('Yellow,', 'bright green'), 'green');
  s.fmt('highlight', s.word('Yellow,', 'dark blue'), 'darkBlue');
  s.fmt('size', s.word('Sizes:', 'eight'), 8);
  s.fmt('size', s.word('Sizes:', 'fourteen'), 14);
  s.fmt('size', s.word('Sizes:', 'twenty-four'), 24);
  s.fmt('size', s.word('Sizes:', 'seventy-two'), 72);
  s.fmt('font', s.word('Fonts:', 'Arial'), 'Arial');
  s.fmt('font', s.word('Fonts:', 'Times New Roman'), 'Times New Roman');
  s.fmt('font', s.word('Fonts:', 'Courier New'), 'Courier New');
  s.fmt('fontBigger', s.word('Bigger', 'Bigger twice'));
  s.fmt('fontBigger', s.word('Bigger', 'Bigger twice'));
  s.fmt('fontSmaller', s.word('Bigger', 'smaller once'));
  s.fmt('bold', s.word('Mixed:', 'half bold'));
  s.fmt('bold', s.select(s.pos('Mixed:', 0), s.pos('Mixed:', 'end')));
  // Ctrl-B at a caret, typed, Ctrl-B again, typed
  let c = s.caret('At a caret', 'end');
  s.fmt('bold', c);
  c = s.type(c, 'bold typed');
  s.fmt('bold', c);
  s.type(c, ', plain typed.');
  await save('fmt-1-character.docx', s.d.doc, [
    'A new document (as !Word makes one): nine paragraphs typed, then',
    'formatted with !Word\'s commands (Ctrl-B / I / U, the toolbar\'s',
    'S, x2 and x2 buttons, Format > Colour, the colour swatches, the',
    'highlight menu, the size field, the font menu, Ctrl-Shift-> / <).',
    'Word should show, paragraph by paragraph:',
    ' 1. "Bold" bold, "italic" italic, "underlined" underlined (single),',
    '    "struck" struck through;',
    ' 2. the 2 of mc2 raised and smaller, the 2 of H2O lowered and',
    '    smaller;',
    ' 3. "Red" pure red (FF0000: the toolbar\'s swatch), "desktop red"',
    '    a slightly darker red (DD0000: Format > Colour, the RISC OS',
    '    desktop palette), "green" green (00B050), "automatic" black',
    '    (made red, then Automatic: no colour is written, as the style',
    '    gives none);',
    ' 4. three highlights: yellow, bright green, dark blue (the text',
    '    on dark blue stays black: Word does not invert it);',
    ' 5. "eight" 8 pt, "fourteen" 14 pt, "twenty-four" 24 pt,',
    '    "seventy-two" 72 pt (the rest Calibri 11);',
    ' 6. "Arial" in Arial, "Times New Roman" in Times New Roman,',
    '    "Courier New" in Courier New;',
    ' 7. "Bigger twice" 14 pt (11 -> 12 -> 14 along Word\'s list),',
    '    "smaller once" 10 pt;',
    ' 8. the whole paragraph bold: "half bold" was made bold first,',
    '    then Ctrl-B on the whole (mixed) paragraph made all of it',
    '    bold (Word\'s rule: not all bold -> all bold);',
    ' 9. "At a caret: " plain, "bold typed" bold (Ctrl-B with nothing',
    '    selected, then typing), ", plain typed." plain (Ctrl-B again).',
  ]);
}

// ------------------------------------------------------------ 2: paragraph

const LONG = ' text that is long enough to wrap onto a second and a ' +
  'third line, so that the alignment, the indents and the spacing ' +
  'show clearly on the page in Word as in !Word.';
{
  const s = session(newDoc({date: DATE}));
  const names = ['Left aligned', 'Centred', 'Right aligned', 'Justified',
    'Left indent one inch', 'Right indent one inch',
    'First line indent half an inch', 'Hanging indent half an inch',
    'Spacing: 12 pt before, 24 pt after', 'Line spacing 1.5 lines',
    'Exactly 20 pt lines', 'Ruler: left box dragged to 1.5 inches',
    'Ruler: first line dragged to 0.25 inch', 'Indent more twice, less once'];
  typeParas(s, names.map((n) => n + LONG));
  const C = (n) => s.caret(n, 0);
  s.fmt('alignLeft', C('Left aligned'));
  s.fmt('alignCenter', C('Centred'));
  s.fmt('alignRight', C('Right aligned'));
  s.fmt('alignJustify', C('Justified'));
  s.fmt('indentMore', C('Left indent'));
  s.fmt('indentMore', C('Left indent'));
  const setPara = (n, patch) => s.para(C(n), patch);
  setPara('Right indent', {ind: {right: 1440}});
  setPara('First line', {ind: {firstLine: 720}});
  setPara('Hanging', {ind: {left: 720, hanging: 720}});
  setPara('Spacing:', {spacing: {before: 240, after: 480}});
  setPara('Line spacing', {spacing: {line: 360, lineRule: 'auto'}});
  setPara('Exactly', {spacing: {line: 400, lineRule: 'exact'}});
  s.fmt('indentDrag', C('Ruler: left'), {marker: 'left', at: 2160,
    textW: 9026, free: false});
  s.fmt('indentDrag', C('Ruler: first'), {marker: 'first', at: 360,
    textW: 9026, free: false});
  s.fmt('indentMore', C('Indent more'));
  s.fmt('indentMore', C('Indent more'));
  s.fmt('indentLess', C('Indent more'));
  await save('fmt-2-paragraph.docx', s.d.doc, [
    'A new document: fourteen paragraphs, each long enough to wrap,',
    'each formatted as its first words say (Ctrl-L / E / R / J, Ctrl-M',
    'and Ctrl-Shift-M, the paragraph commands, the ruler\'s markers).',
    'Word should show: left, centred, right and justified paragraphs',
    '(justified: every line but the last reaching the right margin);',
    'a left indent of 1 inch; a right indent of 1 inch; a first line',
    'indented 0.5 inch; a hanging indent (the first line at the margin,',
    'the others 0.5 inch in); 12 pt before and 24 pt after; 1.5 line',
    'spacing; lines exactly 20 pt apart; a left indent of 1.5 inches',
    '(the ruler\'s left box: the first line moves with it); a first',
    'line at 0.25 inch; a left indent of 0.5 inch (more, more, less).',
  ]);
}

// ------------------------------------------------------------ 3: rich

{
  const s = session(await readDocx(await richDocx()));
  // the Heading 1 un-bolded (b:false: bold by its style)
  s.fmt('bold', s.select(s.pos('Typing test', 0), s.pos('Typing test',
    'end')));
  // the list items italic
  s.fmt('italic', s.select(s.pos('First numbered', 0),
    s.pos('Another bullet', 'end')));
  // a hyperlink inside a bold selection
  s.fmt('bold', s.select(s.pos('A link:', 0), s.pos('A link:', 'end')));
  // a selection across the table: underlined and centred
  const across = s.select(s.pos('The paragraph before', 'before'),
    s.pos('The paragraph after', 'after', true));
  s.fmt('underline', across);
  s.fmt('alignCenter', across);
  // the second heading made a Heading 1; "The end." made a Title
  s.fmt('style', s.caret('A second heading', 0), 'Heading1');
  s.fmt('style', s.caret('The end.', 0), 'Title');
  // the bold words cleared; the accented line coloured and highlighted
  s.fmt('clearFormat', s.word('Plain, bold', 'bold words'));
  s.fmt('color', s.word('Caf', 'na\u00efve'), 'C00000');
  s.fmt('highlight', s.word('Caf', 'Caf\u00e9'), 'cyan');
  await save('fmt-3-rich.docx', s.d.doc, [
    'The rich document of typed-2 (a heading, bold and italic words, a',
    'hyperlink, a numbered and a bulleted list, a table, two sections),',
    'formatted with !Word\'s commands, in this order:',
    ' a. Ctrl-B on the whole Heading 1 "Typing test": it is bold by',
    '    its style, so this UN-bolds it (an explicit b:false);',
    ' b. the four list items made italic (numbers and bullets stay);',
    ' c. the whole "A link: ... and text after it." made bold: the',
    '    words around the link are bold; the LINK\'s own text is left',
    '    as it was (!Word keeps a hyperlink\'s XML untouched), so in',
    '    Word it stays blue, underlined and NOT bold;',
    ' d. from "before the table." to "The paragraph after" (across',
    '    the table) underlined and centred: the two paragraphs change,',
    '    the table\'s cells do not (tables are kept as they are);',
    ' e. "A second heading" made Heading 1; "The end." made Title;',
    ' f. Ctrl-Space (clear formatting) on "bold words": plain again;',
    ' g. "na\u00efve" coloured dark red (C00000), "Caf\u00e9"',
    '    highlighted cyan (turquoise in Word).',
    'Check: no repair prompt; the list numbers and bullets as before.',
  ]);
}

// ------------------------------------------------------------ 4: undo

{
  const s = session(newDoc({date: DATE}));
  typeParas(s, ['One: bold then undone.', 'Two: italic kept.',
    'Three: centred, then undone, then redone.']);
  s.fmt('bold', s.word('One:', 'One'));
  s.fmt('italic', s.word('Two:', 'Two'));
  s.fmt('alignCenter', s.caret('Three:', 0));
  s.fmt('size', s.word('Two:', 'italic kept'), 16);
  s.fmt('underline', s.word('Three:', 'Three'));
  const steps = s.d.undoDepth;
  // undo the underline, the size and the centring, redo the centring
  s.d.undo();
  s.d.undo();
  s.d.undo();
  s.d.redo();
  // (undo is a stack: One's bold is taken off with Ctrl-B again)
  s.fmt('bold', s.word('One:', 'One'));
  await save('fmt-4-undo.docx', s.d.doc, [
    'A new document: three paragraphs typed, then five formats (One',
    'bold, Two italic, Three centred, "italic kept" 16 pt, Three',
    'underlined): ' + steps + ' undo steps in all with the typing. Then',
    'three undos (the underline, the 16 pt, the centring), one redo',
    '(the centring back), and Ctrl-B on "One" again (bold off).',
    'Word should show: "One: bold then undone." all plain; "Two" italic,',
    'the rest of that line plain 11 pt; "Three: centred, then undone,',
    'then redone." centred and NOT underlined.',
  ]);
}

// ------------------------------------------------------------ README

const README = [
  '!Word formatting hand-off (local only, not committed)',
  '=====================================================',
  '',
  'Made by: node tests/moreapps/handoff-format.mjs (re-run it after',
  'changing !Word; files whose bytes are the same are not rewritten;',
  'no other file here is touched). Every file is a document formatted',
  'with !Word\'s own commands (the ones its keys, Format menu, toolbar',
  'and ruler run) and saved by !Word. Open each in real Word: note any',
  'repair prompt or error, and whether what you see matches the',
  'description. Then the open questions: there !Word copies what Word',
  'is believed to do, unverified. (handoff.mjs, the older generator in',
  'this folder, no longer removes files it did not make.)',
  '',
  'Open questions (please try each in real Word and note what it does):',
  '',
  'F1 Toggle rule on a mixed selection. !Word: Ctrl-B (B, I, U, S,',
  '   x2) on a selection that is partly bold makes ALL of it bold; only',
  '   when every character is bold does it clear (fmt-1 line 8). Word?',
  'F2 Un-bolding a heading. A Heading 1 is bold by its style; Ctrl-B',
  '   on it writes an explicit "not bold" (w:b w:val="0") (fmt-3 a).',
  '   Does Word show it plain, and its Styles pane say "Heading 1 +',
  '   Not Bold"? Ctrl-B again in Word: bold back, w:b removed?',
  'F3 Clear formatting reach. !Word\'s Ctrl-Space removes the direct',
  '   font, bold, italic, underline, strike, colour, size, highlight,',
  '   super/subscript and character style of the selection; it keeps',
  '   paragraph formatting (alignment, indents) and other run',
  '   properties (caps, spacing). Word\'s Clear All Formatting also',
  '   resets the paragraph to Normal. Which does Word\'s Ctrl-Space',
  '   do (fmt-3 f), and its Clear All Formatting button?',
  'F4 Superscript size and offset. !Word draws x2 at 0.65 of the size,',
  '   raised by 0.35 of it (subscript lowered by 0.15). Compare fmt-1',
  '   line 2 on screen with Word\'s.',
  'F5 Highlight colours. !Word maps Word\'s 16 names to fixed colours',
  '   (green is bright 00FF00, darkBlue 000080...). Are fmt-1 line 4\'s',
  '   three colours the same in Word? Does Word turn text on a dark',
  '   highlight white?',
  'F6 Justified line breaks. !Word breaks lines first, then spreads',
  '   the space; Word may break differently (its own metrics). Do the',
  '   justified paragraph\'s lines (fmt-2 line 4) end at the same',
  '   words? Is the last line left aligned?',
  'F7 Hanging vs first-line indent. OOXML has one of w:firstLine or',
  '   w:hanging; !Word writes the one given and removes the other',
  '   (fmt-2 lines 7, 8, 13). Same in Word after dragging its ruler\'s',
  '   markers? Does Word keep a 0 first line written over a style\'s',
  '   hanging indent?',
  'F8 Style application. !Word: a paragraph style replaces the',
  '   paragraph style and keeps the direct formatting; a character',
  '   style replaces the run style (fmt-3 e). Word keeps direct',
  '   formatting too, except where it covers most of the paragraph?',
  'F9 \'auto\' colour. Automatic where the style gives no colour:',
  '   !Word removes the run\'s w:color (fmt-1 line 3, "automatic");',
  '   over a style that sets a colour it writes w:color w:val="auto"',
  '   (shown black). Does Word\'s Automatic do the same, and show',
  '   black text on a dark highlight?',
  'F10 A first-line drag across paragraphs with different left',
  '   indents. !Word gives each selected paragraph the SAME first-line',
  '   position on the ruler (each its own left indent kept). In Word:',
  '   select two paragraphs indented 0.5 and 1 inch, drag the',
  '   first-line triangle: what does each paragraph get?',
  'F11 Format > Colour uses the RISC OS desktop palette (its Red is',
  '   DD0000, "desktop red" in fmt-1 line 3); the toolbar\'s swatches',
  '   use Word\'s standard colours (Red FF0000). Should the menu offer',
  '   Word\'s standard colours instead?',
  'F12 Ruler snapping. !Word snaps indent markers to 1/16 inch (90',
  '   twips; Shift: free). Word snaps to 1/16 inch too (Alt: free)?',
  '   fmt-2 lines 12 and 13 were dragged to 1.5 and 0.25 inch.',
  'F13 A hyperlink in a bold selection (fmt-3 c): !Word leaves the',
  '   link\'s own text as it is (not bold). Word makes the link\'s text',
  '   bold too. Acceptable for now?',
  'F14 A document with no default size (no w:sz anywhere in its',
  '   styles): what size does Word show for text with no size? !Word',
  '   assumes 11 pt (Word is believed to show 10 pt). A size chosen',
  '   there is always written, so 11 pt is saved as w:sz 22.',
  'F15 Bold as a toggle property: a run with a direct w:b, a bold',
  '   character style, inside a bold paragraph style. OOXML says the',
  '   two style bolds cancel (XOR) and the direct w:b decides; !Word',
  '   treats any b:true as bold and, on a size change, removes a',
  '   direct b that the styles seem to give. Does Word show such a',
  '   run bold, and after a size change?',
  ...lines,
  '',
];
const how = put('fmt-README.txt', Buffer.from(README.join('\n'), 'utf8'));
made.push(`fmt-README.txt (${how})`);
console.log('hand-off files in ' + OUT + ':\n  ' + made.join('\n  '));
