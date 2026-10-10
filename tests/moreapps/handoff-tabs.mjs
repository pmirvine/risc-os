// Generates the real-Word hand-off files for !Word's tab stops (local
// only, never committed: tests/moreapps/corpus/ is git-ignored). Not a
// test:
//
//   node tests/moreapps/handoff-tabs.mjs
//
// Writes into tests/moreapps/corpus/handoff/ (made if missing):
//   tab-1-kinds.docx    left, centre, right, decimal and bar stops,
//                       each with the four leaders, text with Tabs
//   tab-2-decimal.docx  a price list on a decimal stop (no point, two
//                       points, wide numbers), a contents page with a
//                       right stop and dot leaders, a hanging indent
//   tab-3-ruler.docx    stops made like the ruler and the Tabs dialog
//                       make them, moved and removed again, a style's
//                       stop cleared in one paragraph (w:clear)
//   tab-4-default.docx  the default tab stop changed to 1" (an
//                       existing w:defaultTabStop rewritten), and a
//                       Strict-style value in points
//   tab-README.txt      what Word should show, the open questions
// Everything is done with !Word's own commands (FormatApply 'tabs' and
// 'tabsBox', the ids the ruler and the Tabs dialog run, and typing
// with Tab) on a Document, as the window makes them. A file is
// written only when its bytes change, so a file open in Word is left
// alone; nothing else in the folder is touched or removed. Each file
// is read back and every paragraph, its stops and the default tab stop
// listed in the README, so the list is what was really written.
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
import {defaultStop, resolveTabs} from '../../tools/moreapps/!Word/TabStops';
import * as S from '../../tools/moreapps/!Word/Selection';
import * as E from '../../tools/moreapps/!Word/Edit';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {buildDocx, documentXml, settingsXml, p, r} from './build-docx.mjs';
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
    type(sel, text) {
      for (const ch of text) { now += 50; sel = t.type(sel, ch); }
      return sel;
    },
    enter(sel) { return t.command(() => E.splitPara(d, sel)); },
    fmt(id, sel, arg) { now += 2000; return apply(id, d, t, sel, arg).sel; },
    /** The ruler: a stop added, moved or removed. */
    ruler(sel, arg) { return this.fmt('tabs', sel, arg); },
    /** OK in the Tabs dialog. */
    dialog(sel, arg) { return this.fmt('tabsBox', sel, arg); },
    key(id, sel) {
      now += 2000;
      const res = run(id, d, t, sel);
      if (!res) throw new Error(id + ' did nothing');
      return res;
    },
  };
}

const lines = [];
const say = (...x) => lines.push(...x);

// ------------------------------------------------------------ read back

const inch = (tw) => (tw / 1440).toFixed(2).replace(/\.?0+$/, '') + '"';

/** What a written file holds: the default stop, each paragraph. */
async function describe(bytes) {
  const doc = await readDocx(bytes);
  const out = [`  default tab stop: ${defaultStop(doc)} twips (${inch(defaultStop(doc))})` +
    (doc.rawSettings ? '' : ' (no settings part)')];
  let k = 0;
  for (const sec of doc.sections) {
    for (const b of sec.blocks) {
      k++;
      if (b.type !== 'p') { out.push(`  ${String(k).padStart(2)}. (kept block)`); continue; }
      const own = (b.pPr.tabs || []).map((x) => `${x.val}${x.leader ? '/' + x.leader : ''}@${x.pos}`);
      const res = resolveTabs(doc.styles, b).map((x) => `${x.val}${x.leader ? '/' + x.leader : ''}@${x.pos}`);
      const ind = b.pPr.ind ? ` ind ${JSON.stringify(b.pPr.ind)}` : '';
      out.push(`  ${String(k).padStart(2)}. ${b.text.split('\t').join('>').slice(0, 56)}` +
        `${b.pStyle ? '   [' + b.pStyle + ']' : ''}${ind}`);
      if (own.length) out.push(`      own stops: ${own.join(', ')}`);
      if (res.join() !== own.join()) out.push(`      in force:  ${res.join(', ') || '(none)'}`);
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
    'What !Word wrote (read back from the saved file: the default tab',
    'stop, then each paragraph with > for a Tab, its own stops and',
    'the stops in force when they differ):',
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

// ------------------------------------------------------------ 1: kinds

{
  const s = session(newDoc({date: DATE}));
  const kinds = [['left', 2160], ['center', 4320], ['right', 6480],
    ['decimal', 8640]];
  const texts = ['Each line: a Tab, then text, at stops 1.5", 3", 4.5" and 6"'];
  for (const leader of ['none', 'dot', 'hyphen', 'underscore', 'heavy',
    'middleDot']) {
    texts.push(`${leader}\tleft\tcentre\tright\t12.34`);
  }
  texts.push('A bar stop at 5" (a vertical line)\tafter\tthe\tbar');
  texts.push('No stops: default stops every 0.5"\ta\tb\tc\td');
  typeParas(s, texts);
  for (const leader of ['none', 'dot', 'hyphen', 'underscore', 'heavy',
    'middleDot']) {
    const c = s.caret(leader + '\t');
    s.dialog(c, {tabs: {edits: kinds.map(([val, pos]) => ({add: {val, pos,
      ...(leader === 'none' ? {} : {leader})}}))}});
  }
  s.ruler(s.caret('A bar stop'), {add: {val: 'bar', pos: 7200}});
  s.ruler(s.caret('A bar stop'), {add: {val: 'left', pos: 2160}});
  s.ruler(s.caret('A bar stop'), {add: {val: 'right', pos: 6480}});
  await save('tab-1-kinds.docx', s.d.doc, [
    'A new document. Lines 2..7 each have a left stop at 1.5", a',
    'centre stop at 3", a right stop at 4.5" and a decimal stop at 6",',
    'with the leader named at the start of the line (T1). Line 8 has a',
    'bar stop at 5" and left / right stops. The last line has no',
    'stops. Word should open it with no repair prompt and show the',
    'text at each stop: "left" starting at 1.5", "centre" centred on',
    '3", "right" ending at 4.5", "12.34" with its point at 6"; the',
    'leaders (dots, dashes, line, thick line, middle dots) filling the',
    'space before the stop. In !Word the heavy leader is drawn twice',
    'as thick and the others as repeated characters (T9).',
  ]);
}

// ------------------------------------------------------------ 2: decimal

{
  const s = session(newDoc({date: DATE}));
  typeParas(s, [
    'Price list (decimal stop at 3.5")',
    'Coffee\t2.50',
    'Tea\t1.75',
    'Cake\t12.5',
    'Soup of the day\t3',
    'Sandwich\t6.25.5',
    'Large pot of tea for two\t10.00',
    'A very long dish name that needs most of the line itself\t99.99',
    '',
    'Contents (right stop at the margin, dot leader)',
    'Introduction\t1',
    'A rather long chapter title that wraps onto the next line because it is long\t23',
    'Appendix\t101',
    '',
    'Glossary (hanging indent 1.5"; the Tab goes to the hanging indent, T4)',
    'Cat\tA small domestic animal.',
    'Elephant\tA large animal with a trunk.',
    'Pneumonoultramicroscopic\tA word wider than the hanging indent.',
  ]);
  s.dialog(s.over('Coffee', 'A very long dish'), {tabs: {edits: [
    {add: {val: 'decimal', pos: 5040}}]}});
  s.dialog(s.over('Introduction', 'Appendix'), {tabs: {edits: [
    {add: {val: 'right', pos: 9360, leader: 'dot'}}]}});
  const g = s.over('Cat', 'Pneumonoultramicroscopic');
  s.fmt('paraBox', g, {ind: {left: 2160, hanging: 2160}});
  await save('tab-2-decimal.docx', s.d.doc, [
    'A price list on a decimal stop at 3.5" (T5: spaces typed after',
    'right-aligned text are not counted; T1: a number wider than the',
    'room before the stop), a contents list on a right stop at 6.5"',
    'with dot leaders (a title long enough to wrap, T3) and a glossary',
    'with a hanging indent of 1.5" (the Tab goes to the hanging',
    'indent, T4; "Pneumonoultramicroscopic" is wider than it, so the',
    'Tab goes to the next default stop). Word should open it with no',
    'repair prompt and line the prices up on their points (no point:',
    'ends at the stop; two points: the first counts), and put the',
    'page numbers at the right margin.',
  ]);
}

// ------------------------------------------------------------ 3: ruler

const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/' +
  'wordprocessingml/2006/main"><w:style w:type="paragraph" ' +
  'w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="PriceList"><w:name ' +
  'w:val="Price List"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs>' +
  '<w:tab w:val="left" w:pos="1440"/><w:tab w:val="right" ' +
  'w:leader="dot" w:pos="7200"/></w:tabs></w:pPr></w:style></w:styles>';
const tabbed = (...parts) => '<w:r>' + parts.map((t, i) => (i ? '<w:tab/>' : '') +
  `<w:t>${t}</w:t>`).join('') + '</w:r>';

{
  const bytes = await buildDocx({'word/document.xml': documentXml(
    p(tabbed('Style', 'left 1"', 'right 5" dots'), '<w:pStyle w:val="PriceList"/>') +
    p(tabbed('Style', 'with its 1" stop cleared', 'right 5" dots'), '<w:pStyle w:val="PriceList"/>') +
    p(tabbed('Style', 'stops plus one of mine', 'right 5" dots'), '<w:pStyle w:val="PriceList"/>') +
    p(tabbed('Ruler', 'click adds', 'a left stop')) +
    p(tabbed('Ruler', 'dragged', 'to a new place')) +
    p(tabbed('Ruler', 'dragged', 'off the ruler')) +
    p(tabbed('Dialog', 'Set', 'and Clear all')) +
    p(tabbed('Dialog', 'two paragraphs', 'one selection')) +
    p(tabbed('Dialog', 'two paragraphs', 'one selection'))),
  'word/styles.xml': STYLES, 'word/settings.xml': settingsXml(
    '<w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/>' +
    '<w:characterSpacingControl w:val="doNotCompress"/>')});
  const s = session(await readDocx(bytes));
  // the style's 1" stop cleared by dragging it off the ruler (w:clear)
  s.ruler(s.caret('Style\twith its'), {remove: 1440});
  s.ruler(s.caret('Style\tstops plus'), {add: {val: 'center', pos: 4320}});
  s.ruler(s.caret('Ruler\tclick'), {add: {val: 'left', pos: 2880}});
  s.ruler(s.caret('Ruler\tdragged\tto'), {add: {val: 'left', pos: 2160}});
  s.ruler(s.caret('Ruler\tdragged\tto'), {move: {from: 2160, to: 3600}});
  s.ruler(s.caret('Ruler\tdragged\toff'), {add: {val: 'right', pos: 4320}});
  s.ruler(s.caret('Ruler\tdragged\toff'), {remove: 4320});
  s.dialog(s.caret('Dialog\tSet'), {tabs: {edits: [
    {add: {val: 'decimal', pos: 2160, leader: 'hyphen'}},
    {add: {val: 'bar', pos: 5040}}]}});
  s.dialog(s.caret('Dialog\tSet'), {tabs: {edits: [{set: []}]}});
  s.dialog(s.caret('Dialog\tSet'), {tabs: {edits: [
    {add: {val: 'left', pos: 3600}}]}});
  const two = S.select({id: s.all().at(-2).id, off: 0},
    {id: s.all().at(-1).id, off: 3});
  s.dialog(two, {tabs: {edits: [{add: {val: 'right', pos: 6480,
    leader: 'underscore'}}]}});
  await save('tab-3-ruler.docx', s.d.doc, [
    'A document with a "Price List" style that has a left stop at 1" and a',
    'right stop with dots at 5". Paragraph 2 had the style\'s 1" stop',
    'removed (dragged off the ruler): !Word writes a clear stop',
    '(<w:tab w:val="clear" w:pos="1440"/>) in the paragraph\'s own stops,',
    'and the right stop stays (T10). Paragraph 3 added a centre stop at',
    '3" to the style\'s. Paragraphs 4..6 were made with the ruler (a',
    'click at 2", a drag from 1.5" to 2.5", a stop added and removed).',
    'Paragraph 7 was made with the Tabs dialog: a decimal stop with',
    'dashes and a bar, then Clear all, then a left stop at 2.5". The last',
    'two were set in one selection with a right stop with underscores.',
    'Word should open it with no repair prompt and show the same stops',
    'in Format > Tabs: the style stop cleared in paragraph 2 listed as',
    'cleared / missing, the others as listed below.',
  ]);
}

// ------------------------------------------------------------ 4: default

{
  const mk = (settings) => buildDocx({'word/document.xml': documentXml(
    p(tabbed('Default', 'stops', 'every', 'inch')) +
    p(tabbed('Second', 'line', 'two', 'tabs')) +
    p(tabbed('One custom stop', 'at 2.25"', 'then defaults'),
      '<w:tabs><w:tab w:val="left" w:pos="3240"/></w:tabs>') +
    p(tabbed('Hanging', 'term', 'after'), '<w:ind w:left="2880" ' +
      'w:hanging="2160"/>')), 'word/settings.xml': settingsXml(settings)});
  const s = session(await readDocx(await mk('<w:zoom w:percent="100"/>' +
    '<w:defaultTabStop w:val="720"/><w:characterSpacingControl ' +
    'w:val="doNotCompress"/>')));
  s.dialog(s.caret('Default'), {defaultTab: 1440});
  await save('tab-4-default.docx', s.d.doc, [
    'The default tab stop changed from 0.5" to 1" with the Tabs',
    'dialog (Default tab stops: 1"): the existing',
    '<w:defaultTabStop w:val="720"/> in settings.xml was rewritten to',
    '1440 and nothing else in the settings part changed (T7). Word',
    'should open it with no repair prompt, show Default tab stops 1"',
    'in Format > Tabs, and put the Tabs of the first lines at 1", 2",',
    '3"... The third line has a stop at 2.25"; the fourth has a',
    'hanging indent (T4).',
  ]);
}

// ------------------------------------------------------------ README

const README = [
  'Hand-off files for !Word\'s tab stops (Batch A, task A4). Made by',
  'node tests/moreapps/handoff-tabs.mjs with !Word\'s own commands;',
  'nothing here is committed. Open each file in real Word and answer',
  'the questions below; the lists under each file name are what',
  '!Word really wrote.',
  '',
  'Tab positions are counted from the LEFT MARGIN (Word). Default',
  'stops come every <w:defaultTabStop> (0.5" if absent). On screen:',
  'the ruler\'s selector at its left end picks the kind (left, centre,',
  'right, decimal); a click on the ruler adds a stop of that kind;',
  'a drag moves it, a drag off the ruler removes it; a stop from the',
  'paragraph\'s style is grey. Format > Tabs... opens the dialog.',
  '',
  'Questions',
  '---------',
  'T1  Text after a right / centre / decimal tab that is wider than',
  '    the room between the text before it and the stop (tab-1, tab-2:',
  '    "99.99" after a very long dish name). !Word: the tab takes no',
  '    width and the text follows the text before it. Word?',
  'T2  A list label that ends exactly at its indent puts the text at',
  '    the indent; a tab in the text that ends exactly at a stop goes',
  '    to the NEXT stop (no file: make a list with a 0.25" indent).',
  'T3  A tab with no stop before the right indent goes to the right',
  '    indent and the text after it wraps (tab-2 contents: the long',
  '    title). Does Word do the same?',
  'T4  Default stops before a hanging indent on the first line are',
  '    not used: the tab goes to the hanging indent unless a custom',
  '    stop comes first (tab-2 glossary, tab-4 last line).',
  'T5  Spaces typed after right-aligned or centred text are not',
  '    counted: the text itself ends at (or is centred on) the stop',
  '    (no file: type "12   " before a tab in tab-2\'s price list).',
  'T6  The Tabs dialog on a selection of paragraphs with different',
  '    stops shows the first paragraph\'s stops and Set / Clear /',
  '    Clear all apply to each paragraph\'s own stops (tab-3, the',
  '    last two paragraphs). Word?',
  'T7  A new w:defaultTabStop inserted into settings.xml when there',
  '    was none, and one written 72pt where the file had 0.5in (no',
  '    file: !Word writes the first only when the settings part has',
  '    none; tab-4 rewrites an existing one).',
  'T8  The Paragraph box\'s Tabs... button: !Word opens the Tabs box',
  '    and LEAVES the Paragraph box open with its own pending values;',
  '    Word applies the Paragraph box first and closes it. (No file.)',
  'T9  Leaders: dots, dashes (hyphen), underscore line, heavy line',
  '    and middle dots (tab-1). Does each look like Word\'s? !Word',
  '    draws dots, hyphens and middle dots as repeated characters on',
  '    a grid counted from the margin, the line leaders as a line',
  '    (heavy twice as thick).',
  'T10 Removing a stop that the paragraph\'s STYLE gives writes a',
  '    clear stop in the paragraph (tab-3, paragraph 2). Does Word',
  '    show the stop gone, and does Word write the same?',
  'T11 A bar stop (tab-1): a vertical line at its place on every',
  '    line of the paragraph (even where there is no text). Word?',
  'T12 The Tabs dialog\'s position field shows hundredths of an inch:',
  '    a stop at 20 twips reads "0.01\"". Word shows the same?',
  ...lines,
  '',
];
const how = put('tab-README.txt', Buffer.from(README.join('\n'), 'utf8'));
made.push(`tab-README.txt (${how})`);
console.log('hand-off files in ' + OUT + ':\n  ' + made.join('\n  '));
