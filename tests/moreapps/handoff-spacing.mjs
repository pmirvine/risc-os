// Generates the real-Word hand-off files for !Word's paragraph
// spacing (local only, never committed: tests/moreapps/corpus/ is
// git-ignored). Not a test:
//
//   node tests/moreapps/handoff-spacing.mjs
//
// Writes into tests/moreapps/corpus/handoff/ (made if missing):
//   sp-1-linespacing.docx   line spacing 1.0, 1.15, 1.5, 2, 3, exact
//                           12 pt with 18 pt text, at least 30 pt
//   sp-2-before-after.docx  space before and after, Ctrl-0, the
//                           contextual spacing of List Paragraph,
//                           raw autospacing
//   sp-3-flow.docx          keep with next, keep lines together,
//                           widow control off, page break before
//   sp-README.txt           what Word should show, the open questions
// Everything is done with !Word's own commands (FormatApply's ids:
// what the keys Ctrl-1 / 2 / 5 / 0, the Format menu and the
// Paragraph box run) on a Document, as the window makes them. A file
// is written only when its bytes change, so a file open in Word is
// left alone; nothing else in the folder is touched or removed. Each
// file is read back and every paragraph listed in the README with
// the spacing and flow written, so the list is what was really
// written.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx, newDoc} from '../../tools/moreapps/!Word/DocxWrite';
import {Document} from '../../tools/moreapps/!Word/Document';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {apply} from '../../tools/moreapps/!Word/FormatApply';
import {setPara} from '../../tools/moreapps/!Word/FormatSet';
import * as S from '../../tools/moreapps/!Word/Selection';
import * as E from '../../tools/moreapps/!Word/Edit';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {p, r} from './build-docx.mjs';
import {item, listDocx} from './list-fixtures.mjs';
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
  const s = {
    d, para,
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
    para_(sel, patch) { now += 2000; setPara(d, t, sel, patch); },
    fmt(id, sel, arg) { now += 2000; return apply(id, d, t, sel, arg).sel; },
  };
  return s;
}

const lines = [];
const say = (...x) => lines.push(...x);
const twips = (v) => (v === undefined ? '-' : v);

/** What a written file holds: each paragraph's spacing and flow. */
async function describe(bytes) {
  const doc = await readDocx(bytes);
  const out = [];
  let k = 0;
  for (const b of doc.sections.flatMap((x) => x.blocks)) {
    if (b.type !== 'p') { out.push('    [table]'); continue; }
    k++;
    const pp = b.pPr, sp = pp.spacing || {};
    const bits = [`line ${twips(sp.line)}${sp.lineRule ? ' ' +
      sp.lineRule : ''}`, `before ${twips(sp.before)}`,
    `after ${twips(sp.after)}`];
    for (const f of ['keepNext', 'keepLines', 'pageBreakBefore',
      'widowControl', 'contextualSpacing']) {
      if (pp[f] !== undefined) bits.push(`${f} ${pp[f]}`);
    }
    for (const x of pp.extra || []) {
      if (x.name === 'w:spacing') {
        bits.push('raw w:spacing ' + x.attrs.map(([n, v]) =>
          n.replace('w:', '') + '=' + v).join(' '));
      }
    }
    const sz = b.runs.map((x) => x.rPr.sz).find((z) => z);
    if (sz) bits.push(`text ${sz / 2} pt`);
    out.push(`  ${String(k).padStart(2)}. ${b.text.slice(0, 44)}`);
    out.push(`      ${b.pStyle ? 'style ' + b.pStyle + '; ' : ''}` +
      bits.join(', '));
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
    'What !Word wrote (read back from the saved file: each paragraph,',
    'its style, and the values in twips (20 per point, 240 = one',
    'line when the rule is auto); "-" = not written, the style or',
    'Word\'s default applies):', ...await describe(bytes));
}

/** Type paragraphs (the first into the empty one) into a session. */
function typeParas(s, texts) {
  let c = s.caret('', 0);
  texts.forEach((t, k) => {
    if (k) c = s.enter(c);
    c = s.type(c, t);
  });
}

const LONG = ' text long enough to wrap onto a second and a third ' +
  'line, so that the distance between the lines shows clearly on the ' +
  'page in Word as in !Word; the quick brown fox jumps over the lazy dog.';

// ------------------------------------------------------------ 1: lines

{
  const s = session(newDoc({date: DATE}));
  const names = ['Single (Ctrl-1)', 'One and a quarter (1.15: Format > ' +
    'Line spacing)', 'One and a half (Ctrl-5)', 'Double (Ctrl-2)',
  'Triple (Format > Line spacing > 3.0)', 'Exactly 12 pt with 18 pt ' +
    'text (Paragraph box: Exactly)', 'At least 30 pt (Paragraph box)',
  'Not touched: the document default'];
  typeParas(s, names.map((n) => n + ':' + LONG));
  s.fmt('lineSingle', s.caret(names[0]));
  s.fmt('lineSpacing', s.caret(names[1]), 1.15);
  s.fmt('line15', s.caret(names[2]));
  s.fmt('lineDouble', s.caret(names[3]));
  s.fmt('lineSpacing', s.caret(names[4]), 3);
  s.fmt('paraBox', s.caret(names[5]), {spacing: {line: 240,
    lineRule: 'exact'}});
  s.fmt('size', s.over(names[5], names[5]), 18);
  s.fmt('paraBox', s.caret(names[6]), {spacing: {line: 600,
    lineRule: 'atLeast'}});
  await save('sp-1-linespacing.docx', s.d.doc, [
    'A new document (as !Word makes one: Calibri 11, 8 pt after,',
    '1.08 lines), eight wrapped paragraphs. Word should show, by the',
    'distance from one line to the next:',
    ' 1. single (240); 2. 1.15 (276); 3. one and a half (360);',
    ' 4. double (480); 5. triple (720): the lines should be about',
    '    1.0, 1.15, 1.5, 2.0 and 3.0 times as far apart as in 1;',
    ' 6. exactly 12 pt (240 exact) with the text at 18 pt: the lines',
    '    are 12 pt apart whatever the text size and the tops of the',
    '    letters are cut off (S5: where is the baseline, how much',
    '    is cut, and does !Word draw the same?);',
    ' 7. at least 30 pt (600 atLeast): lines 30 pt apart;',
    ' 8. the document default, which !Word shows as 1.08 lines (a',
    '    259 line? see S6).',
  ]);
}

// ------------------------------------------------------------ 2: before/after

{
  const bytes = await listDocx([
    p(r('Before and after, the paragraphs of this file:')),
    p(r('Plain one')), p(r('Plain two')), p(r('Plain three')),
    p(r('Mixed one')), p(r('Mixed two')),
    p(r('Add space after')),
    item('List item A', 2), item('List item B', 2), item('List item C', 2),
    p(r('Below the list')),
    p(r('Auto spacing before and after (a document made from HTML)'),
      '<w:spacing w:beforeAutospacing="1" w:afterAutospacing="1"/>'),
    p(r('Auto spacing after, then line spacing changed'),
      '<w:spacing w:afterAutospacing="1" w:line="240" ' +
      'w:lineRule="auto"/>'),
    p(r('Last paragraph')),
  ]);
  const s = session(await readDocx(bytes));
  // Ctrl-0 on plain one: 12 pt before; a second time takes it off
  s.fmt('spaceBefore12', s.caret('Plain one'));
  s.fmt('spaceBefore12', s.caret('Plain two'));
  s.fmt('spaceBefore12', s.caret('Plain two'));
  s.fmt('spaceBefore', s.caret('Plain three'), 480);
  s.fmt('spaceAfter', s.caret('Plain three'), 480);
  // mixed: one has 12 pt before, the other none, Ctrl-0 on both
  s.fmt('spaceBefore12', s.caret('Mixed one'));
  s.fmt('spaceBefore12', s.over('Mixed one', 'Mixed two'));
  s.fmt('spaceAfter', s.caret('Add space after'), 240);
  // the autospacing paragraphs: the line changes, then a before is set
  s.fmt('lineDouble', s.caret('Auto spacing before'));
  s.fmt('spaceBefore', s.caret('Auto spacing after,'), 240);
  await save('sp-2-before-after.docx', s.d.doc, [
    'A document with the List Paragraph style (contextual spacing:',
    'no space between two list items), opened and saved by !Word,',
    'then spaced with !Word\'s commands. Word should show:',
    ' - "Plain one": 12 pt before (Ctrl-0); "Plain two": none (Ctrl-0',
    '   twice: on, then off); "Plain three": 24 pt before and after;',
    ' - "Mixed one" got 12 pt before (Ctrl-0), "Mixed two" none; then',
    '   Ctrl-0 on both: S1. !Word makes it 0 for both (one had',
    '   space); is the same true in Word?;',
    ' - "Add space after": 12 pt after (S2: is Word\'s amount 12 pt?);',
    ' - the three list items: no space between them, the usual space',
    '   (8 pt) above the first and below the last (contextual',
    '   spacing);',
    ' - the two autospacing paragraphs came from HTML-made files. S3:',
    '   !Word draws autospacing as 14 pt and keeps the flags when',
    '   only the line changes (the first, made double: the file shows',
    '   the raw w:spacing with line 480); setting a space before on',
    '   the second (240) removes beforeAutospacing and keeps',
    '   afterAutospacing. What does Word show and what does it do?',
  ]);
}

// ------------------------------------------------------------ 3: flow

{
  const s = session(newDoc({date: DATE}));
  const names = ['Keep with next', 'Follows the keep with next',
    'Keep lines together', 'Widow control switched off',
    'Widow control as the document has it', 'Page break before',
    'Several together', 'All options off again'];
  typeParas(s, names.map((n) => n + ':' + LONG));
  s.fmt('paraBox', s.caret(names[0]), {keepNext: true});
  s.fmt('paraBox', s.caret(names[2]), {keepLines: true});
  s.fmt('paraBox', s.caret(names[3]), {widowControl: false});
  s.fmt('paraBox', s.caret(names[5]), {pageBreakBefore: true});
  s.fmt('paraBox', s.caret(names[6]), {keepNext: true, keepLines: true,
    pageBreakBefore: true, widowControl: false});
  s.fmt('paraBox', s.caret(names[7]), {keepNext: true, keepLines: true,
    pageBreakBefore: true, widowControl: false});
  s.fmt('paraBox', s.caret(names[7]), {keepNext: false, keepLines: false,
    pageBreakBefore: false, widowControl: true});
  await save('sp-3-flow.docx', s.d.doc, [
    'A new document with eight paragraphs and the flow options of',
    'the Paragraph box. !Word stores them and shows nothing yet (they',
    'matter when pages arrive). In Word\'s Paragraph dialogue box,',
    'Line and Page Breaks tab, the checkboxes should be:',
    ' 1. Keep with next on;  2. none;  3. Keep lines together on;',
    ' 4. Widow/Orphan control OFF (w:widowControl val 0);',
    ' 5. as the document has it: S4, !Word treats a missing',
    '    widowControl as ON. Is Widow/Orphan control ticked in Word',
    '    for paragraphs 1, 2 and 5 (nothing written)?',
    ' 6. Page break before on;  7. keep with next, keep lines,',
    '    page break before on and widow control off;',
    ' 8. all options off again: !Word writes false for the first',
    '    three (w:val 0) and removes widowControl (back to the',
    '    default). Word: all as in 2?',
    'The page breaks (6, 7) should start new pages in Word.',
  ]);
}

// ------------------------------------------------------------ README

const README = [
  '!Word paragraph spacing hand-off (local only, not committed)',
  '============================================================',
  '',
  'Made by: node tests/moreapps/handoff-spacing.mjs (re-run it after',
  'changing !Word; files whose bytes are the same are not rewritten;',
  'no other file here is touched). Every file is a document spaced',
  'with !Word\'s own commands (the ones Ctrl-1, Ctrl-2, Ctrl-5,',
  'Ctrl-0, the Format menu and the Paragraph box run) and saved by',
  '!Word. Open each in real Word: note any repair prompt or error,',
  'and whether what you see matches the description. Then the open',
  'questions: there !Word does what Word is believed to do,',
  'unverified.',
  '',
  'Open questions (please try each in real Word and note what it does):',
  '',
  'S1 Ctrl-0 on a selection of paragraphs with different space',
  '   before (sp-2 "Mixed"). !Word: sets 0 unless every paragraph',
  '   has none, then 12 pt. Word?',
  'S2 Format > Line spacing > Add space after. !Word writes 12 pt',
  '   (240 twips) after, as for before. Word\'s "Add Space After"',
  '   amount? (sp-2 "Add space after")',
  'S3 beforeAutospacing / afterAutospacing (HTML-made documents).',
  '   !Word draws Auto as 14 pt, keeps the flags when only the line',
  '   spacing changes and removes the flag when a space is set',
  '   (sp-2 last two paragraphs). Word\'s amount and behaviour?',
  'S4 widowControl absent everywhere. !Word treats it as on (Word\'s',
  '   default); turning it off writes w:widowControl w:val="0", on',
  '   again removes it (sp-3 paragraphs 4, 5, 8).',
  'S5 Exact line spacing. !Word puts the baseline at 0.8 of the',
  '   line and clips the text to the line (sp-1 paragraph 6, 18 pt',
  '   text in 12 pt lines). Where does Word put the baseline and what',
  '   does it cut off? Is "at least 30 pt" (paragraph 7) the same?',
  'S6 The default line spacing. !Word shows Normal\'s 259 (1.08',
  '   lines) as "Multiple 1.08" and draws it at that pitch; compare',
  '   sp-1 paragraph 8 with paragraph 1 (single) on the page.',
  ...lines,
  '',
];
const how = put('sp-README.txt', Buffer.from(README.join('\n'), 'utf8'));
made.push(`sp-README.txt (${how})`);
console.log('hand-off files in ' + OUT + ':\n  ' + made.join('\n  '));
