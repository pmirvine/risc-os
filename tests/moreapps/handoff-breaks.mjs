// Generates the real-Word hand-off files for !Word's page and section
// breaks (local only, never committed: tests/moreapps/corpus/ is
// git-ignored). Not a test:
//
//   node tests/moreapps/handoff-breaks.mjs
//
// Writes into tests/moreapps/corpus/handoff/ (made if missing):
//   brk-1-pagebreaks.docx   Ctrl-Enter in every place: mid-paragraph,
//                           at an end, at a start, in an empty
//                           paragraph, in a numbered item, at a
//                           heading's start, over a selection
//   brk-2-sections.docx     Next page and Continuous section breaks in
//                           a document whose original section is
//                           landscape with a header and a page number
//                           start (pgSz, headers and pgNumType copied)
//   brk-3-deleted.docx      the same breaks, some removed again with
//                           Delete / Backspace (the merged sections),
//                           a page break removed
//   brk-4-flow.docx         page break before, keep with next chains,
//                           keep lines, widow control off
//   brk-README.txt          what Word should show, the open questions
// Everything is done with !Word's own commands (EditApply ids, what
// Ctrl-Enter, the Insert menu and Backspace / Delete run; FormatApply
// for the flags) on a Document, as the window makes them. A file is
// written only when its bytes change, so a file open in Word is left
// alone; nothing else in the folder is touched or removed. Each file
// is read back and every paragraph and section listed in the README,
// so the list is what was really written.
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
import {labels} from '../../tools/moreapps/!Word/ListNumbers';
import * as S from '../../tools/moreapps/!Word/Selection';
import * as E from '../../tools/moreapps/!Word/Edit';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {buildDocx, documentXml, p, r, REL} from './build-docx.mjs';
import {lintPackage} from './lint-package.mjs';
import {rng} from './word-docs.mjs';

// (NumWrite gives each new list a random nsid: seeded, so a re-run
// writes the same bytes)
Math.random = rng(20261009);

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
    /** An EditApply command id (Ctrl-Enter, a section break, a key). */
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
const O = '\uFFFC';

// ------------------------------------------------------------ read back

/** An element as compact text: name, attributes, children. */
function show(n) {
  if (!n || typeof n !== 'object') return '';
  const a = (n.attrs || []).map(([k, v]) => ` ${k.replace(/^w:/, '')}=${v}`)
    .join('');
  const kids = (n.children || []).filter((c) => c.name).map(show);
  return n.name.replace(/^w:/, '') + a + (kids.length
    ? '(' + kids.join(', ') + ')' : '');
}

/** What a written file holds: every paragraph and every sectPr. */
async function describe(bytes) {
  const doc = await readDocx(bytes);
  const m = labels(doc);
  const out = [];
  let k = 0;
  doc.sections.forEach((sec, i) => {
    out.push(`  Section ${i + 1}: ${show(sec.raw)}`);
    for (const b of sec.blocks) {
      k++;
      if (b.type !== 'p') { out.push(`  ${String(k).padStart(2)}. (kept block)`); continue; }
      const lab = m.get(b.id);
      const flags = [];
      for (const f of ['pageBreakBefore', 'keepNext', 'keepLines']) {
        if (b.pPr[f]) flags.push(f);
      }
      if (b.pPr.widowControl === false) flags.push('widowControl off');
      const text = b.text.split(O).join('[BREAK]');
      out.push(`  ${String(k).padStart(2)}. ${lab ? lab.text + ' ' : ''}` +
        `${text.slice(0, 50)}${b.pStyle ? '   [' + b.pStyle + ']' : ''}` +
        `${flags.length ? '   {' + flags.join(', ') + '}' : ''}`);
    }
  });
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
    'What !Word wrote (read back from the saved file: each section\'s',
    'sectPr, then its paragraphs, [BREAK] a page break):',
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

// ------------------------------------------------------------ 1: page breaks

{
  const s = session(newDoc({date: DATE}));
  typeParas(s, [
    'Page break in the middle of a paragraph: before-the-break and after-the-break text.',
    'Page break at the end of this paragraph.',
    'Page break at the START of this paragraph.',
    '',
    'Page break in the empty paragraph above.',
    'Numbered item one (page break in the middle of this item)',
    'Numbered item two (page break at its start)',
    'Numbered item three',
    'Heading with a page break at its start',
    'Text after the heading.',
    'Selection start: this goes, and so does the next.',
    'Selection end: gone. remainder stays.',
    'Last paragraph.']);
  const mid = s.para('Page break in the middle');
  s.key('pageBreak', S.caret({id: mid.id, off: mid.text.indexOf(' and after')}));
  s.key('pageBreak', s.caret('Page break at the end', 'end'));
  s.key('pageBreak', s.caret('Page break at the START', 0));
  s.key('pageBreak', S.caret({id: s.all().find((b) => b.type === 'p' && b.text === '').id, off: 0}));
  s.fmt('numbering', s.over('Numbered item one', 'Numbered item three'), '1.');
  const one = s.para('Numbered item one');
  s.key('pageBreak', S.caret({id: one.id, off: one.text.indexOf(' (page break') + 1}));
  s.key('pageBreak', s.caret('Numbered item two', 0));
  s.fmt('style', s.caret('Heading with'), 'Heading1');
  s.key('pageBreak', s.caret('Heading with', 0));
  const a = s.para('Selection start'), b = s.para('Selection end');
  s.key('pageBreak', S.select({id: a.id, off: a.text.indexOf(' this goes')},
    {id: b.id, off: b.text.indexOf(' remainder')}));
  await save('brk-1-pagebreaks.docx', s.d.doc, [
    'A new document with Ctrl-Enter pressed in every place (PB1, PB2):',
    'mid-paragraph, at a paragraph\'s end, at its start, in an empty',
    'paragraph, mid-item and at the start of an item of a numbered',
    'list, at the start of a Heading 1, and over a selection across',
    'two paragraphs. Each break is <w:br w:type="page"/> in a run at',
    'the END of its paragraph (Word 2013 and later\'s form), the text',
    'after it in a new paragraph with the same properties. Word should',
    'open it with no repair prompt and show each break at the end of',
    'its line with the text after it at the top of the next page',
    '(PB1): is there an EMPTY paragraph at the top of the page after',
    'the break at the end of a paragraph? Is the paragraph that holds',
    'only the break (after "at the START", and in the numbered list',
    'and the heading) shown with its own number / heading style (PB2)?',
    'Is the whole document the number of pages you expect?',
  ]);
}

// ------------------------------------------------------------ 2: sections

const HDR = '<w:hdr xmlns:w="http://schemas.openxmlformats.org/' +
  'wordprocessingml/2006/main"><w:p><w:r><w:t>Header of the first ' +
  'section</w:t></w:r></w:p></w:hdr>';
const LAND = '<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>' +
  '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" ' +
  'w:header="567" w:footer="567" w:gutter="0"/>';
const orig = () => buildDocx({'word/document.xml': documentXml(
  p(r('Landscape section with a header and page numbers starting at 5.')) +
  p(r('Second paragraph of the original section.')) +
  p(r('Third paragraph: the Next page break goes after "Third".')) +
  p(r('Fourth paragraph: the Continuous break goes here, mid-paragraph.')) +
  p(r('Fifth paragraph.')) + p(r('Sixth paragraph.')) +
  '<w:sectPr w:rsidR="00A1B2C3"><w:headerReference w:type="default" ' +
  'r:id="rId9"/><w:pgNumType w:start="5"/>' + LAND + '<w:cols ' +
  'w:space="708"/></w:sectPr>'), 'word/header1.xml': HDR},
{docRels: [['rId9', REL('header'), 'header1.xml']]});

/** The sections document with its breaks. */
async function sectionsSession() {
  const s = session(await readDocx(await orig()));
  s.key('sectionNext', s.caret('Third paragraph', 'end'));
  s.key('sectionContinuous', s.caret('Fourth paragraph', 20));
  s.key('sectionNext', s.caret('Fifth paragraph', 0));
  return s;
}

{
  const s = await sectionsSession();
  await save('brk-2-sections.docx', s.d.doc, [
    'A document made in the style of Word\'s (built here: one LANDSCAPE',
    'section, a header part, w:pgNumType w:start="5", rsids), opened',
    'by !Word, with three section breaks inserted: Next page after',
    '"Third paragraph", Continuous in the middle of "Fourth", and Next',
    'page at the start of "Fifth" (an empty paragraph before it ends',
    'that section; a Next page break at the end of a paragraph or',
    'mid-paragraph leaves an empty paragraph or the second half at',
    'the start of the new section, as Enter does). The section BEFORE',
    'each break is a copy of the',
    'section it was cut from (landscape pgSz, pgMar, the header',
    'reference r:id="rId9", pgNumType start 5: SB1, SB2); the section',
    'after keeps the original sectPr (rsids) with w:type set. The',
    'last section is the original, w:type nextPage. Word should open',
    'it with no repair prompt and show: 4 sections, all landscape',
    'with the same header ("Link to Previous" on?), section 2 on a new',
    'page, section 3 continuing on the same page, section 4 on a new',
    'page; the break at the end of each section labelled with the',
    'FOLLOWING section\'s type (SB6): "Section Break (Next Page)",',
    '"(Continuous)", "(Next Page)". Do the page numbers restart at 5',
    'in each section (SB2)?',
  ]);
}

// ------------------------------------------------------------ 3: deleted

{
  const s = await sectionsSession();
  // the break after "Third": Delete at the end of its paragraph
  s.key('delete', s.caret('Third paragraph', 'end'));
  // the break before "Fifth": Backspace at the start of its paragraph
  s.key('backspace', s.caret('Fifth paragraph', 0));
  // a page break added at the end of "Sixth" and taken out again:
  // the first Backspace joins the empty paragraph after the break,
  // the second removes the break
  let c = s.key('pageBreak', s.caret('Sixth paragraph', 'end'));
  c = s.key('backspace', c);
  c = s.key('backspace', c);
  if (s.para('Sixth paragraph').text.includes(O))
    throw new Error('the page break is still there');
  await save('brk-3-deleted.docx', s.d.doc, [
    'The sections of brk-2, then three breaks taken out again with',
    'the keys: Delete at the end of "Third paragraph" (the break',
    'between sections 1 and 2), Backspace at the start of "Fifth',
    'paragraph" (the break before it: the empty paragraph that ended',
    'the section stays), and a page break put at the end of "Sixth',
    'paragraph" and removed by two Backspaces (the first joins the',
    'empty paragraph after it, the second takes the break out). Word',
    'should open it with no repair prompt and show the merged',
    'sections (SB3): the merged section has the FOLLOWING section\'s',
    'properties (here the same landscape pgSz, header and page number',
    'start, so the page looks the same) with the EARLIER section\'s',
    'w:type. What does Word give it? Only the Continuous break is',
    'left between sections, and the empty paragraph before "Fifth".',
    'Select "Third paragraph" to "Fifth paragraph" in Word and press',
    'Delete in a copy of brk-2 (SB4): is the break removed? (!Word',
    'keeps the sections when a range is deleted across a break.)',
  ]);
}

// ------------------------------------------------------------ 4: flow

{
  const s = session(newDoc({date: DATE}));
  typeParas(s, [
    'Page break before is on for this paragraph.',
    'Ordinary paragraph after it.',
    'Keep with next chain, paragraph 1 (keep with next).',
    'Keep with next chain, paragraph 2 (keep with next).',
    'Keep with next chain, paragraph 3 (keep with next).',
    'End of the chain (no flag).',
    'Keep lines together is on for this paragraph. ' +
      'It is long enough to take several lines in a page of text, so ' +
      'that Word has something to keep together when the page is full.',
    'Widow control is OFF for this paragraph. It is also long enough ' +
      'to take several lines and so have a first or last line alone ' +
      'at a page boundary.',
    'All four flags: page break before, keep with next, keep lines.',
    'Page break before in a numbered item (and the next item has it too)',
    'Numbered item with page break before',
    'Numbered item without it',
    'Last paragraph.']);
  s.fmt('paraBox', s.caret('Page break before is on'), {pageBreakBefore: true});
  s.fmt('paraBox', s.over('Keep with next chain, paragraph 1',
    'Keep with next chain, paragraph 3'), {keepNext: true});
  s.fmt('paraBox', s.caret('Keep lines together'), {keepLines: true});
  s.fmt('paraBox', s.caret('Widow control is OFF'), {widowControl: false});
  s.fmt('paraBox', s.caret('All four flags'), {pageBreakBefore: true,
    keepNext: true, keepLines: true});
  s.fmt('numbering', s.over('Numbered item with', 'Numbered item without'), '1.');
  s.fmt('paraBox', s.caret('Numbered item with page'), {pageBreakBefore: true});
  await save('brk-4-flow.docx', s.d.doc, [
    'Flow options set with the Paragraph box (Format > Paragraph...):',
    'Page break before (first paragraph, in a numbered item, and with',
    'two other flags), a chain of three Keep with next paragraphs,',
    'Keep lines together, and Widow control turned off. !Word shows',
    'only Page break before (a dotted rule in a 12 px gap above the',
    'paragraph); the others have no effect on its screen until pages',
    'arrive. Word should open it with no repair prompt, show the same',
    'checkboxes in Format > Paragraph > Line and Page Breaks for each',
    'paragraph, break the page before each flagged paragraph (B1), and',
    'keep the chain on one page (B2). Widow control: written as',
    '<w:widowControl w:val="0"/> (S4).',
  ]);
}

// ------------------------------------------------------------ README

const README = [
  'Hand-off files for !Word\'s page and section breaks (Batch A,',
  'task A3). Made by node tests/moreapps/handoff-breaks.mjs with',
  '!Word\'s own commands; nothing here is committed. Open each file',
  'in real Word and answer the questions below; the lists under',
  'each file name are what !Word really wrote.',
  '',
  'Keys in !Word: Ctrl-Enter is the page break (Ctrl on a Mac too);',
  'Insert > Section break > Next page / Continuous (no keys);',
  'Delete at the end of a section\'s last paragraph and Backspace at',
  'the start of the next section\'s first paragraph remove the break.',
  'On screen: a dotted rule labelled "Page break"; a band under the',
  'last paragraph of a section labelled "Section break (Next page)"',
  'or "(Continuous)" (the FOLLOWING section\'s type); a dotted rule',
  'above a paragraph with "Page break before".',
  '',
  'Questions',
  '---------',
  'PB1 Ctrl-Enter mid-paragraph, at an end, at a start, in an empty',
  '    paragraph (brk-1). !Word writes the break at the END of its',
  '    paragraph and the text after it in a new paragraph (Word',
  '    2013\'s form). Does Word show no empty paragraph at the top of',
  '    the next page?',
  'PB2 Ctrl-Enter at the start of a numbered item or a heading',
  '    (brk-1). The paragraph left with only the break keeps its',
  '    number / heading style (Enter\'s rules). What does Word do?',
  'PB3 A page break pasted into another document stays a page break',
  '    (no file: copy brk-1\'s first lines into another !Word',
  '    document and save it).',
  'SB1 Section break in a document with headers (brk-2). The section',
  '    before the break gets a copy of the sectPr with the same',
  '    header reference. Does Word open it with no repair prompt',
  '    and show the same header in every section?',
  'SB2 w:pgNumType w:start="5" and a tracked w:sectPrChange (brk-2:',
  '    the first has start 5 in both sections; no tracked change in',
  '    the file). Do the page numbers restart at 5 in each section?',
  'SB3 Delete at a break (brk-3): the merged section takes the',
  '    FOLLOWING section\'s properties with the EARLIER section\'s',
  '    w:type. Does Word do the same?',
  'SB4 Deleting a range across a break keeps every section in !Word',
  '    (brk-2, select Third..Fifth and press Delete). Does Word?',
  'SB5 Backspace at the start of a list item that begins a section:',
  '    the break goes first (no file: make one in Word).',
  'SB6 The label of a break: the FOLLOWING section\'s w:type (brk-2).',
  '    Does Word label the end of section 1 "Section Break (Next',
  '    Page)" and the end of section 2 "(Continuous)" the same way?',
  'B1  Page break before (brk-4): a paragraph with the flag starts a',
  '    new page. Does Word also start a page for the flag on the',
  '    FIRST paragraph of the document (!Word shows the rule there',
  '    too), and for a numbered item?',
  'B2  Keep with next / keep lines / widow control (brk-4): written',
  '    as w:keepNext, w:keepLines, w:widowControl w:val="0". Does the',
  '    Paragraph box show the same boxes ticked?',
  'B3  A Continuous break between sections of different page size or',
  '    orientation. !Word keeps the type it was given (and draws it',
  '    "(Continuous)"); Word is believed to start a new page there',
  '    whatever w:type says. No file: change a section\'s page',
  '    setup in Word to landscape and see.',
  'B4  Insert > Section break in the last EMPTY paragraph of a section',
  '    adds an empty paragraph after it (the section\'s last block is',
  '    then the new break paragraph). Word\'s own break does the same?',
  ...lines,
  '',
];
const how = put('brk-README.txt', Buffer.from(README.join('\n'), 'utf8'));
made.push(`brk-README.txt (${how})`);
console.log('hand-off files in ' + OUT + ':\n  ' + made.join('\n  '));
