// Generates the real-Word hand-off files for !Letters' tables of
// contents, captions and cross-references (Batch E3: Insert > Table
// of Contents, Table of Figures, Caption, Cross-reference; Edit >
// Update field and Update all fields). Local only, never committed:
// tests/moreapps/corpus/ is git-ignored. Not a test:
//
//   node tests/moreapps/handoff-toc.mjs
//
// Writes into tests/moreapps/corpus/handoff/ (made if missing):
//   en3-1-from-scratch.docx   a new document: headings, a table of
//                            contents, a caption, cross-references
//                            to a heading, the caption and a
//                            footnote, then Update all fields: all
//                            made by !Letters (the most important)
//   en3-2-levels.docx        tables showing 1, 2 and 9 levels
//   en3-3-no-page-numbers.docx  no page numbers; page numbers not
//                            right aligned
//   en3-4-leaders.docx       the four tab leaders (dots, dashes,
//                            line, none)
//   en3-5-no-hyperlinks.docx  Use hyperlinks off
//   en3-6-figures.docx       captions (Figure, Table, a label with
//                            a space) and tables of figures (with
//                            label, captions only, no page numbers)
//   en3-7-numbered-headings.docx  a Word-shaped document whose
//                            headings are numbered (1., 1.1), a
//                            table of contents put in by !Letters
//   en3-8-chapter-captions.docx  captions with chapter numbers
//                            (1-1, 1-2, 2-1)
//   en3-9-xref-kinds.docx    cross-references of every kind
//   en3-10-extra-styles.docx  Options: an extra style as level 2,
//                            outline levels
//   en3-11-updated-toc.docx  a Word-shaped document with a stale
//                            table of contents (and caption numbers),
//                            opened and updated by !Letters
//   en3-12-stale-reference.docx  cross-references made, then the
//                            heading edited and a target deleted,
//                            NOT updated: Word's F9 should refresh
//   en3-README.txt           the questions (TOC1..), a PRIORITY list
//                            first
// Everything is done with !Letters' own commands (./TocCmd insertToc,
// ./CaptionCmd insertCaption, ./XrefCmd insertXref, ./FieldPasses
// run as Update all fields, ./StyleApply applyStyle, typing) on a
// Document. Each file is checked by the package lint (and xmllint
// with wml.xsd where available), read back, and its tables and
// fields listed in the README as !Letters reads them, so the list is
// what was really written. A file is written only when its bytes
// change, so a file open in Word is left alone; nothing else in the
// folder is touched.
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
import {applyStyle} from '../../tools/moreapps/!Letters/StyleApply';
import {insertToc} from '../../tools/moreapps/!Letters/TocCmd';
import {tocFields, entriesOf}
  from '../../tools/moreapps/!Letters/TocUpdate';
import {insertCaption} from '../../tools/moreapps/!Letters/CaptionCmd';
import {insertXref} from '../../tools/moreapps/!Letters/XrefCmd';
import {list as targets}
  from '../../tools/moreapps/!Letters/XrefTargets';
import {insertNote} from '../../tools/moreapps/!Letters/NoteCmd';
import {addBookmark, deleteBookmark}
  from '../../tools/moreapps/!Letters/Bookmarks';
import {run as passes} from '../../tools/moreapps/!Letters/FieldPasses';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {settle} from '../../tools/moreapps/!Letters/ViewPass';
import {scan} from '../../tools/moreapps/!Letters/Walk';
import {OBJ} from '../../tools/moreapps/!Letters/Model';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {buildDocx, documentXml, stylesXml, numberingXml, p, r}
  from './build-docx.mjs';
import {fld} from './field-fixtures.mjs';
import {resultsOf} from './field-oracle.mjs';
import {lintPackage} from './lint-package.mjs';
import {schemaChecker} from './roundtrip-lib.mjs';
import {tm, loadStyles} from './word-docs.mjs';

const OUT = fileURLToPath(new URL('./corpus/handoff/',
  import.meta.url));
const DATE = new Date(Date.UTC(2026, 9, 30, 12));
fs.mkdirSync(OUT, {recursive: true});
const xsd = schemaChecker();
await loadStyles();

/** Write bytes to name unless the file already holds them. */
function put(name, bytes) {
  const f = path.join(OUT, name);
  const b = Buffer.from(bytes);
  if (fs.existsSync(f) && fs.readFileSync(f).equals(b)) return 'same';
  fs.writeFileSync(f, b);
  return 'written';
}

const LOREM = 'The quick brown fox jumps over the lazy dog while the ' +
  'committee reviews the minutes of the previous meeting and agrees ' +
  'the budget for the coming year in some detail.';
const plain = (b) => b.text.split(OBJ).join('');

/** doc laid out and paginated as Print layout does: {L, P}. */
function paginate(doc) {
  const L = new DocLayout(doc, tm(), null, {fields: {now: DATE}});
  L.layout(800);
  return {L, P: new Pages(printGalley(L)).finish()};
}

/** The window's ctx (./FieldUpdate's, Print layout) for d. */
function ctxOf(d) {
  let base = null, last = null;
  const first = () => base || (base = paginate(d.doc));
  return {now: DATE, pages: {finish: () => first().P},
    relayout(doc) {
      last = settle(doc, last || first());
      return last.P;
    }};
}

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
  const end = (b) => S.caret({id: b.id, off: b.text.length});
  const ok = (x, what) => {
    if (!x) throw new Error(what + ' refused');
    return x;
  };
  const s = {
    d, t, paras, para, end,
    /** Type lines at the end of the document (\n: Enter); a line
     *  '#n text' becomes a Heading n. */
    write(text) {
      for (const line of text.split('\n')) {
        const ps = paras();
        let sel = end(ps[ps.length - 1]);
        if (plain(ps[ps.length - 1]).length || ps.length > 1) {
          sel = t.command(() => E.splitPara(d, sel));
        }
        const m = /^#(\d) (.*)$/.exec(line);
        const words = m ? m[2] : line;
        if (words) sel = t.type(sel, words);
        now += 2000;
        if (m) applyStyle(d, t, sel, 'Heading' + m[1]);
        else applyStyle(d, t, sel, 'Normal');
      }
    },
    /** Insert > Table of Contents (or of Figures) at the start of
     *  the paragraph starting `start`. */
    toc(start, opts = {}) {
      const b = para(start);
      return ok(insertToc(d, t, S.caret({id: b.id, off: 0}), opts,
        ctxOf(d)), 'insertToc');
    },
    /** Insert > Caption on the paragraph starting `start`. */
    caption(start, opts) {
      const b = para(start);
      const why = {};
      return ok(insertCaption(d, t, end(b), opts, why),
        'insertCaption ' + JSON.stringify(why));
    },
    /** Insert > Cross-reference at the end of the paragraph starting
     *  `start` (after typing `lead`), to the target of type whose
     *  text starts `text`. */
    xref(start, lead, type, text, what, more = {}) {
      let b = para(start);
      if (lead) {
        t.type(end(b), lead);
        b = para(start);
      }
      const tg = targets(d.doc, type).find((x) =>
        String(x.text).startsWith(text) ||
        String(x.label).startsWith(text));
      if (!tg) throw new Error('no target ' + type + ' ' + text);
      const why = {};
      return ok(insertXref(d, t, end(b), {type, target: tg.id, what,
        ...more}, ctxOf(d), why), 'insertXref ' + type + ' ' + what +
        ' ' + JSON.stringify(why));
    },
    /** A footnote after `after` in the paragraph starting `start`. */
    note(start, after, kind = 'footnote') {
      const b = para(start);
      const at = plain(b).indexOf(after);
      if (at < 0) throw new Error('no ' + after);
      // (offsets in b.text: the marks before count)
      let k = 0, n = 0;
      for (; k < b.text.length && n < at + after.length; k++) {
        if (b.text[k] !== OBJ) n++;
      }
      return ok(insertNote(d, t, S.caret({id: b.id, off: k}), kind),
        'insertNote');
    },
    /** Edit > Update all fields. */
    updateAll() {
      const ctx = ctxOf(d);
      return t.command(() => passes(d, ctx, null));
    },
  };
  return s;
}

/** A new document of the given lines (see write). */
function fresh(text) {
  const s = session(newDoc({date: DATE}));
  s.write(text);
  return s;
}

const lines = [];
const say = (...x) => lines.push(...x);

// ----------------------------------------------------------- read back

const KIND = /^\s*(REF|PAGEREF|NOTEREF|SEQ|STYLEREF)\b/i;
const short = (s, n = 60) => (s.length > n ? s.slice(0, n) + '...'
  : s);

/** What a written file holds: its pages (as !Letters lays them out),
 *  each table of contents' entries, the other fields with results. */
async function describe(bytes) {
  const doc = await readDocx(bytes);
  const {P} = paginate(doc);
  const out = [`  ${P.count} page(s) in !Letters' Print layout (its ` +
    'own fonts: Word\'s pages will differ in detail)'];
  for (const [k, f] of tocFields(doc).entries()) {
    out.push(`  table ${k + 1}: { ${f.instr.trim()} }`);
    const es = entriesOf(doc, f);
    if (!es.length) out.push('    (no entries)');
    for (const e of es) {
      out.push(`    level ${e.level}: ${short(e.text.replace(/\s+/g,
        ' '))}${e.page === null ? '' : '  .... ' + e.page}`);
    }
  }
  const fs = resultsOf(doc).filter((x) => KIND.test(x.instr) &&
    !/^\s*PAGEREF\s+_Toc/i.test(x.instr));
  if (fs.length) out.push('  fields (code: result):');
  for (const x of fs) {
    out.push(`    { ${x.instr.trim()} }: ${JSON.stringify(
      short(String(x.stored)))}`);
  }
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
    const parts = [doc.meta.mainPart, doc.meta.stylesPart,
      ...Object.values(doc.meta.noteParts || {})]
      .filter((n) => n && z.get(n));
    schema = 'xmllint/wml.xsd: ' + parts.map((n) => n.replace(/^word\//,
      '') + ' ' + xsd.errors(z.get(n)).size).join(', ') + ' messages';
  }
  made.push(`${name} (${bytes.length} bytes, ${put(name, bytes)}; ` +
    `lint clean; ${schema})`);
  say('', name, '-'.repeat(name.length), ...about, '',
    'What !Letters wrote (read back from the saved file):',
    ...await describe(bytes));
}

/** A body of headings and text for the table variants. */
const OUTLINE = '#1 Introduction\n' + LOREM + '\n' +
  '#2 Background\n' + LOREM + '\n#3 Earlier work\n' + LOREM + '\n' +
  '#2 Aims\n' + LOREM + '\n#1 Method\n' + LOREM + '\n' +
  '#2 Materials\n' + LOREM + '\n#3 Samples\n' + LOREM + '\n' +
  '#4 Storage\n' + LOREM + '\n#1 Results\n' + LOREM;

/** A new document of the lines marks, then OUTLINE (with long
 *  chapters); each table goes in at the start of its mark line
 *  (the mark's text then follows the table). */
function outlined(marks) {
  const s = fresh(marks.join('\n') + '\n' + OUTLINE);
  for (const h of ['Method', 'Results']) {
    const b = s.para(h);
    const prev = s.paras()[s.paras().indexOf(b) - 1];
    s.t.type(s.end(prev), ' ' + LOREM + ' ' + LOREM);
  }
  return s;
}

// ----------------------------------------------------------- the files

// en3-1: made from scratch with our commands, then Update all fields
{
  const s = fresh('Made by !Letters\n' +
    'This document was made new in !Letters. The table of contents, ' +
    'the caption and the cross-references below were put in with ' +
    'its Insert menu, then Edit > Update all fields was chosen.\n' +
    '#1 Introduction\n' + LOREM + '\n' +
    'A paragraph standing for a picture.\n' +
    '#2 Details\nThe details are in a footnote here.\n' + LOREM + '\n' +
    '#1 Cross-references\nThe heading:\nIts page:\nThe caption:\n' +
    'The caption\'s page:\nThe footnote:');
  s.note('The details', 'footnote here');
  s.caption('A paragraph standing', {label: 'Figure',
    text: ': A picture of something'});
  s.xref('The heading:', ' ', 'heading', 'Details', 'text');
  s.xref('Its page:', ' ', 'heading', 'Details', 'page');
  s.xref('The caption:', ' ', 'seq:Figure', 'Figure 1', 'labelNumber');
  s.xref('The caption\'s page:', ' ', 'seq:Figure', 'Figure 1',
    'page');
  s.xref('The footnote:', ' ', 'footnote', '1', 'noteNumber');
  s.toc('This document', {});
  s.updateAll();
  await save('en3-1-from-scratch.docx', s.d.doc, [
    'A new document (File > New): headings typed and given Heading 1',
    'and 2 (the styles added from Word\'s built-ins on first use), a',
    'footnote, Insert > Caption (Figure, below the paragraph),',
    'Insert > Cross-reference (heading text, heading page, caption',
    'label and number, caption page, footnote number; Insert as',
    'hyperlink on), Insert > Table of Contents (Word\'s defaults: 3',
    'levels, page numbers right aligned, dots, hyperlinks), then Edit',
    '> Update all fields. Every field, the hidden _Toc and _Ref',
    'bookmarks, the TOC 1..3, Caption and Hyperlink styles were made',
    'by !Letters.']);
}

// en3-2: levels
{
  const s = outlined(['(above: 1 level)', '(above: 2 levels)',
    '(above: 9 levels)']);
  s.toc('(above: 1', {levels: 1});
  s.toc('(above: 2', {levels: 2});
  s.toc('(above: 9', {levels: 9});
  await save('en3-2-levels.docx', s.d.doc, [
    'One document, three tables at the top, each followed by a line',
    'saying what it is: Show levels 1, then 2, then 9 (TOC \\o "1-1",',
    '"1-2", "1-9").',
    'The headings go down to level 4 (Storage).']);
}

// en3-3: page numbers off, not right aligned
{
  const s = outlined(['(above: not right aligned)',
    '(above: no page numbers)']);
  s.toc('(above: not', {rightAlign: false});
  s.toc('(above: no page', {pageNumbers: false});
  await save('en3-3-no-page-numbers.docx', s.d.doc, [
    'Two tables: first "Right align page numbers" off (the number',
    'after a space: TOC ... \\p " "), then "Show page numbers" off',
    '(TOC ... \\n "1-3": no numbers, no tab).']);
}

// en3-4: leaders
{
  const LEAD = {dot: 'dots', hyphen: 'dashes', underscore: 'a line',
    none: 'none'};
  const s = outlined(Object.values(LEAD).map((x) => '(above: ' + x +
    ')'));
  for (const [leader, x] of Object.entries(LEAD)) {
    s.toc('(above: ' + x, {leader});
  }
  await save('en3-4-leaders.docx', s.d.doc, [
    'Four tables, the tab leader of each: dots, dashes, a line',
    '(underscores), none (in that order from the top). The leader is',
    'not in the field code: it is the entry paragraphs\' right tab.']);
}

// en3-5: hyperlinks off
{
  const s = outlined(['(above: no hyperlinks)']);
  s.toc('(above: no', {hyperlinks: false});
  await save('en3-5-no-hyperlinks.docx', s.d.doc, [
    'Use hyperlinks off: TOC \\o "1-3" \\u (no \\h \\z). The entries',
    'carry no w:hyperlink, but their page numbers are still PAGEREF',
    '_Toc... \\h fields (as bookmark.docx in the corpus has them).']);
}

// en3-6: captions and tables of figures
{
  const s = fresh('Figures\nTables\nPlates\n#1 Pictures\n' +
    'Picture one.\nPicture two.\nA table goes here.\n' +
    'Plate one.\n' + LOREM + ' ' + LOREM + '\n#1 More pictures\n' +
    'Picture three.\n' + LOREM);
  s.caption('Picture one.', {label: 'Figure', text: ' The first'});
  s.caption('Picture two.', {label: 'Figure', text: ': The second'});
  s.caption('Picture three.', {label: 'Figure', text: ' The third'});
  s.caption('A table goes', {label: 'Table', text: ' Numbers',
    position: 'above'});
  s.caption('Plate one.', {label: 'My Plate', text: ' A plate'});
  s.caption('Picture three.', {label: 'Figure', text: ' Excluded',
    excludeLabel: true, position: 'above'});
  s.toc('Figures', {seqId: 'Figure'});
  s.toc('Tables', {seqId: 'Table', includeLabel: false});
  s.toc('Plates', {seqId: 'My_Plate', pageNumbers: false});
  await save('en3-6-figures.docx', s.d.doc, [
    'Insert > Caption: three Figures below their paragraphs, one put',
    'in last ABOVE "Picture three" with Exclude label (number only),',
    'a Table above its paragraph, and a label typed in New label...:',
    '"My Plate" (written SEQ My_Plate). Then Insert > Table of',
    'Figures: of Figure (TOC \\h \\z \\c "Figure"), of Table with',
    '"Include label and number" off (\\a "Table"), of My Plate with no',
    'page numbers (\\n). The figure put in last above Picture three',
    'renumbers the third figure to 4.']);
}

// en3-7: numbered headings (a Word-shaped document)
const sty = (id, name, inner = '', based = '', def = '') =>
  `<w:style w:type="paragraph"${def} w:styleId="${id}"><w:name ` +
  `w:val="${name}"/>` + (based ? `<w:basedOn w:val="${based}"/>`
    : '') + `<w:pPr>${inner}</w:pPr><w:rPr>` +
  (id.startsWith('Heading') ? '<w:b/><w:sz w:val="28"/>' : '') +
  '</w:rPr></w:style>';
const NUMPR = (l) => `<w:numPr><w:ilvl w:val="${l}"/><w:numId ` +
  'w:val="1"/></w:numPr>';
const WSTYLES = stylesXml(sty('Normal', 'Normal', '', '',
  ' w:default="1"') + sty('Heading1', 'heading 1', NUMPR(0) +
  '<w:outlineLvl w:val="0"/>', 'Normal') + sty('Heading2', 'heading 2',
  NUMPR(1) + '<w:outlineLvl w:val="1"/>', 'Normal') +
  sty('Caption', 'caption', '', 'Normal'));
const lvl = (n, text) => `<w:lvl w:ilvl="${n}"><w:start w:val="1"/>` +
  `<w:numFmt w:val="decimal"/><w:pStyle w:val="Heading${n + 1}"/>` +
  `<w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/></w:lvl>`;
const WNUM = numberingXml('<w:abstractNum w:abstractNumId="0">' +
  '<w:multiLevelType w:val="multilevel"/>' + lvl(0, '%1.') +
  lvl(1, '%1.%2') + '</w:abstractNum><w:num w:numId="1">' +
  '<w:abstractNumId w:val="0"/></w:num>');
const WH = (n, t) => p(r(t), `<w:pStyle w:val="Heading${n}"/>`);
const shaped = (body) => buildDocx({
  'word/document.xml': documentXml(body),
  'word/styles.xml': WSTYLES, 'word/numbering.xml': WNUM});
const PB = p('<w:r><w:br w:type="page"/></w:r>');

{
  const s = session(await readDocx(await shaped(p(r('Contents')) +
    WH(1, 'Scope') + p(r(LOREM)) + WH(2, 'Terms') + p(r(LOREM)) + PB +
    WH(1, 'Design') + p(r(LOREM)) + WH(2, 'Parts') + WH(2, 'Joins') +
    PB + WH(1, 'Testing') + p(r('Figure source.')) + p(r(LOREM)))));
  s.toc('Contents', {levels: 2});
  await save('en3-7-numbered-headings.docx', s.d.doc, [
    'A document shaped as Word writes one: Heading 1 and 2 numbered',
    'by a multilevel list in their styles (1., 1.1), opened in',
    '!Letters, Insert > Table of Contents with 2 levels. Each entry',
    'is the number, a tab, the text (the number at its own tab',
    'stop).']);
}

// en3-8: captions with chapter numbers
{
  const s = session(await readDocx(await shaped(WH(1, 'First') +
    p(r('Picture A.')) + p(r('Picture B.')) + PB + WH(1, 'Second') +
    p(r('Picture C.')) + p(r('Table of figures:')))));
  for (const x of ['Picture A.', 'Picture B.', 'Picture C.']) {
    s.caption(x, {label: 'Figure', text: ' ' + x.slice(8, 9),
      chapter: {level: 1, separator: '-'}});
  }
  s.toc('Table of figures:', {seqId: 'Figure'});
  await save('en3-8-chapter-captions.docx', s.d.doc, [
    'The numbered headings of en3-7 (1., 2.); Insert > Caption with',
    'Numbering... "Include chapter number", chapter starts with',
    'Heading 1, separator hyphen: Figure 1-1, 1-2 (under 1.) and 2-1',
    '(under 2.), as {STYLEREF 1 \\s}-{SEQ Figure \\* ARABIC \\s 1}.',
    'A table of figures of them at the end.']);
}

// en3-9: cross-references of every kind
{
  const s = session(await readDocx(await shaped(WH(1, 'Scope') +
    p(r('Some marked words here.')) + p(r('A note goes here.')) +
    WH(2, 'Terms') + p(r('Picture.')) + PB + WH(1, 'References') +
    p(r('Heading text:')) + p(r('Heading number:')) +
    p(r('Heading number (no context):')) +
    p(r('Heading number (full context):')) + p(r('Heading page:')) +
    p(r('Heading above/below:')) + p(r('Page, above/below:')) +
    p(r('Bookmark text:')) + p(r('Bookmark page:')) +
    p(r('Caption:')) + p(r('Caption label and number:')) +
    p(r('Caption text:')) + p(r('Caption page:')) +
    p(r('Footnote number:')) + p(r('Footnote number formatted:')) +
    p(r('Footnote page:')) + p(r('Endnote number:')) +
    p(r('Not a hyperlink:')))));
  s.note('A note goes', 'goes');
  s.note('A note goes', 'here', 'endnote');
  s.caption('Picture.', {label: 'Figure', text: ': A view'});
  {
    const b = s.para('Some marked');
    const at = plain(b).indexOf('marked words');
    const res = addBookmark(s.d, s.t, S.select({id: b.id, off: at},
      {id: b.id, off: at + 'marked words'.length}), 'Marked');
    if (res.error) throw new Error(res.error);
  }
  const X = (start, type, text, what, more) => s.xref(start, ' ', type,
    text, what, more);
  X('Heading text:', 'heading', 'Terms', 'text');
  X('Heading number:', 'heading', 'Terms', 'number');
  X('Heading number (no', 'heading', 'Terms', 'numberNoContext');
  X('Heading number (full', 'heading', 'Terms', 'numberFullContext');
  X('Heading page:', 'heading', 'Terms', 'page');
  X('Heading above/below:', 'heading', 'Terms', 'above');
  X('Page, above/below:', 'heading', 'Terms', 'page', {above: true});
  X('Bookmark text:', 'bookmark', 'Marked', 'text');
  X('Bookmark page:', 'bookmark', 'Marked', 'page');
  X('Caption:', 'seq:Figure', 'Figure 1', 'caption');
  X('Caption label', 'seq:Figure', 'Figure 1', 'labelNumber');
  X('Caption text:', 'seq:Figure', 'Figure 1', 'captionText');
  X('Caption page:', 'seq:Figure', 'Figure 1', 'page');
  X('Footnote number:', 'footnote', '1', 'noteNumber');
  X('Footnote number formatted', 'footnote', '1',
    'noteNumberFormatted');
  X('Footnote page:', 'footnote', '1', 'page');
  X('Endnote number:', 'endnote', '1', 'noteNumber');
  X('Not a hyperlink:', 'heading', 'Scope', 'text', {hyperlink: false});
  await save('en3-9-xref-kinds.docx', s.d.doc, [
    'Numbered headings (en3-7\'s), a bookmark "Marked" on "marked',
    'words", a footnote, an endnote and a Figure caption, then one',
    'Insert > Cross-reference of each kind on its own line (the line',
    'says which). All hyperlinks but the last.']);
}

// en3-10: extra styles and outline levels
{
  const s = fresh('Contents\n#1 Chapter\n' + LOREM + '\nA Title ' +
    'style paragraph\n' + LOREM + '\nAn outline level paragraph\n' +
    LOREM + '\n#2 Section\n' + LOREM);
  applyStyle(s.d, s.t, S.caret({id: s.para('A Title').id, off: 0}),
    'Title');
  s.toc('Contents', {extraStyles: [{style: 'Title', level: 2}],
    outline: false});
  await save('en3-10-extra-styles.docx', s.d.doc, [
    'Table of Contents > Options...: the Title style at level 2',
    '(TOC \\o "1-3" \\h \\z \\t "Title,2"), Use outline levels off',
    '(no \\u). The "A Title style paragraph" is an entry at level 2,',
    'between "Chapter" and "Section".']);
}

// en3-11: a Word-shaped document with a stale table, updated
{
  const toc = p(fld(' TOC \\o "1-3" \\h \\z \\u ', 'Old entry\t1'),
    '<w:pStyle w:val="TOC1"/>');
  const bm = (id, name, x) => `<w:bookmarkStart w:id="${id}" ` +
    `w:name="${name}"/>${x}<w:bookmarkEnd w:id="${id}"/>`;
  const cap = (n) => p(r('Figure ') + fld(' SEQ Figure \\* ARABIC ',
    String(n)) + r(' stale ' + n), '<w:pStyle w:val="Caption"/>');
  const s = session(await readDocx(await shaped(toc +
    WH(1, 'Renamed chapter') + p(r(LOREM)) + cap(7) + WH(2, 'New') +
    p(bm(1, '_Ref123', r('Figure ') + fld(' SEQ Figure \\* ARABIC ',
      '9'))) + p(r('See ') + fld(' REF _Ref123 \\h ', 'Figure 9'))
    + PB + WH(1, 'Last') + p(r('end')))));
  const res = s.updateAll();
  await save('en3-11-updated-toc.docx', s.d.doc, [
    'A document shaped as Word writes one, with a table of contents',
    'that is out of date (one entry "Old entry"), captions numbered',
    '7 and 9, and a REF to the second reading "Figure 9"; opened in',
    '!Letters and Edit > Update all fields chosen once. !Letters\'',
    `summary: ${res.updated} fields worked out, ` +
    `${res.messages.length} kept as stored.`]);
}

// en3-12: stale references (not updated)
{
  const s = fresh('#1 Original heading\n' + LOREM + '\n' +
    '#1 Going away\n' + LOREM + '\nText heading: \nGone heading: \n');
  s.xref('Text heading:', '', 'heading', 'Original', 'text');
  s.xref('Gone heading:', '', 'heading', 'Going away', 'text');
  // the first heading edited, the second's bookmark deleted (as if
  // the heading had been cut): neither updated
  const h = s.para('Original heading');
  s.t.type(S.caret({id: h.id, off: h.text.length}), ' (edited)');
  const name = /_Ref\d+/.exec(resultsOf(s.d.doc).filter((x) =>
    /^\s*REF/.test(x.instr))[1].instr)[0];
  const res = deleteBookmark(s.d, s.t, name);
  if (res.error) throw new Error(res.error);
  await save('en3-12-stale-reference.docx', s.d.doc, [
    'Two cross-references to headings (REF _Ref... \\h), made, then',
    'NOT updated: the first heading was edited after ("(edited)"',
    'added), and the hidden bookmark of the second (round "Going',
    'away") deleted. The results still read as when they were',
    'made. In Word, Ctrl+A then F9 should make the first "Original',
    'heading (edited)" and the second "Error! Reference source not',
    'found." (!Letters\' own Update all fields keeps that one as it',
    'is and says "source not found").']);
}

// ------------------------------------------------------------ README

const README = [
  'Tables of contents, captions and cross-references (!Letters Batch',
  'E3: Insert > Table of Contents..., Table of Figures..., Caption...,',
  'Cross-reference...; Edit > Update field and Update all fields):',
  'the real-Word hand-off (made by node',
  'tests/moreapps/handoff-toc.mjs; local only, this folder is never',
  'committed)',
  '',
  'Every file was made, or opened and changed, with !Letters\' own',
  'commands. Each was written, checked by the package lint, read',
  'back by !Letters, and its tables of contents and fields are',
  'listed below under the file (entries with level and page; each',
  'field\'s code and the result stored in the file), so the list is',
  'what was really written. !Letters\' pages use its own fonts:',
  'Word\'s page numbers will differ by a page here and there. When',
  'Word updates a field (F9), compare with the list: a different',
  'page number is expected, a different TEXT is a finding.',
  'How to update in Word: click in the table and press F9 ("Update',
  'entire table"), or Ctrl+A then F9 for every field of the text.',
  '',
  'PRIORITY: the questions may be too many for one session. Take',
  'these 9 first, in this order: the files Word could refuse or',
  'repair, then the guesses about Word that !Letters writes into',
  'every file. Everything else is "if time allows".',
  '',
  '  1. en3-1-from-scratch: TOC1, TOC2, TOC3 (the most important',
  '     file: every field, bookmark and style in it was made by',
  '     !Letters. Does Word open it without a repair prompt? Does',
  '     F9 in the table give the same entries? Do the',
  '     cross-references update and jump?)',
  '  2. Smoke test: open EVERY en3-*.docx once. Note any repair',
  '     prompt or "unreadable content" message and which file. TOC4.',
  '  3. en3-11-updated-toc and en3-12-stale-reference: TOC14, TOC15',
  '     (Word\'s own table updated by !Letters; references left',
  '     stale).',
  '  4. The field codes !Letters writes (Alt+F9 shows them): TOC5',
  '     (switch order, \\n "1-n", \\p " ", \\a, \\t).',
  '  5. en3-6-figures: TOC9 (captions: SEQ My_Plate for a label with',
  '     a space, numbering of all captions on insert).',
  '  6. en3-9-xref-kinds: TOC12 (each kind of cross-reference: the',
  '     result Word shows after F9, _Ref names, NOTEREF \\p).',
  '  7. en3-8-chapter-captions: TOC11 (chapter numbers).',
  '  8. en3-2, en3-4, en3-7: TOC6, TOC8, TOC10 (indents of levels 4',
  '     to 9, the leaders, numbered entries).',
  '  9. TOC16 (Word\'s own behaviour, no file: hidden text, update',
  '     messages, a caret in a table cell).',

  'The guesses about Word that !Letters makes (none of them could',
  'be checked without Word; each is asked below):',
  '  - the order of the switches it writes (TOC \\o "1-3" \\h \\z \\u;',
  '    REF _Ref... \\r \\p \\h; NOTEREF _Ref... \\f \\h): TOC5, TOC12',
  '  - page numbers off written \\n "1-n", not right aligned \\p " ",',
  '    captions only (table of figures) \\a "id": TOC5, TOC9',
  '  - a caption label with a space written SEQ My_Plate: TOC9',
  '  - a caret in a table cell captions the whole table: TOC16 (c)',
  '  - putting a caption in renumbers every SEQ of the document: TOC9',
  '  - STYLEREF \\s of a heading numbered "Chapter 1": TOC11',
  '  - hidden bookmarks named _Ref / _Toc + 9 digits, and reused:',
  '    TOC3, TOC12',
  '  - NOTEREF \\p (above/below of a note) against the number and',
  '    "above": TOC12',
  '  - a REF\'s result keeps its own formatting, not the bookmark\'s:',
  '    TOC16 (e)',
  '  - a table with no \\h still has PAGEREF ... \\h page numbers:',
  '    en3-5, TOC16 (b)',
  '  - hidden text left out of the entries: TOC16 (a)',
  '  - TOC 4..9 indents, the Table of Figures style\'s spacing, the',
  '    numbered entries\' tab: TOC6, TOC9, TOC10',
  '  - the update message after every Update all fields: TOC16 (d)',
  '  - "No table of contents entries found." and keep with next on a',
  '    caption above: TOC16 (f), (g)',
  '',
  'Questions',
  '---------',
  'TOC1 en3-1: does Word open it with no message? Is the table of',
  '    contents at the top with Introduction, Details (indented) and',
  '    Cross-references, each with a dotted leader to a page',
  '    number at the right margin? Ctrl+click an entry: does it go',
  '    to the heading?',
  'TOC2 en3-1: click in the table, press F9, choose "Update entire',
  '    table": are the entries the same text and levels (pages may',
  '    move)? Is the look the same (Word\'s TOC 1, TOC 2 styles)? Then',
  '    Ctrl+A, F9: does the caption stay "Figure 1", do the cross-',
  '    references read "Details", its page, "Figure 1", its page and',
  '    "1"? Ctrl+click each: does it jump?',
  'TOC3 en3-1: save it in Word (as a copy), and if you can, send it',
  '    back: what does Word write differently for the table (the',
  '    w:sdt content control round it? w:fldChar w:dirty? the',
  '    entries\' tabs and w:hyperlink w:history), the hidden _Toc and',
  '    _Ref bookmarks (their numbers), and the styles TOC 1..3,',
  '    Hyperlink and Caption?',
  'TOC4 Any en3-*.docx with a repair prompt, a lost entry or field,',
  '    or a result that changes TEXT (not page) on F9? (Which file,',
  '    which field.)',
  'TOC5 Field codes (Alt+F9 in each file; then make the same table in',
  '    Word with References > Table of Contents > Custom and compare',
  '    its code): !Letters writes TOC \\o "1-3" \\h \\z \\u; with page',
  '    numbers off \\n "1-3" (en3-3, second table); not right',
  '    aligned \\p " " (en3-3, first table); an extra style \\t',
  '    "Title,2" (en3-10); a table of figures \\h \\z \\c "Figure",',
  '    with "Include label and number" off \\a "Table" (en3-6). Does',
  '    Word write the switches in this order? The same \\n and \\p',
  '    values? Does Word\'s Custom box read each one back (levels,',
  '    page numbers, alignment, leader, hyperlinks)?',
  'TOC6 en3-2: in the 9-level table, are the levels 1 to 4 indented',
  '    as Word\'s own (TOC 4 is about 0.46 inch, each level 0.15 inch',
  '    more)? !Letters gives TOC 4..9 left indents of 660, 880, 1100,',
  '    1320, 1540, 1760 twips (from Word 2013 as remembered, not',
  '    seen in a file): what are Word\'s (Home > Styles, TOC 4,',
  '    Modify > Format > Paragraph)?',
  'TOC7 en3-3: with "Show page numbers" off, are the entries plain',
  '    (no tab, no number)? With "Right align" off, is each number',
  '    right after the text with a space between? Does F9 keep that?',
  'TOC8 en3-4: are the leaders dots, dashes, a solid line and none',
  '    (top to bottom)? After F9 do they stay (the leader is the',
  '    entries\' tab, not in the code: does Word keep it or go back to',
  '    dots)?',
  'TOC9 en3-6: do the captions read Figure 1 The first, Figure 2:',
  '    The second, 3 (above Picture three, the label excluded),',
  '    Figure 4 The third, Table 1 Numbers (above its paragraph),',
  '    My Plate 1 A plate? Alt+F9: is the plate\'s code SEQ My_Plate',
  '    (Word\'s own for a label with a space: make one in Word with',
  '    New Label... to see)? In Word, insert a caption above Picture',
  '    one: are ALL the later figures renumbered at once, or only on',
  '    F9? (!Letters numbers every caption of the document, of every',
  '    label, when one is put in.) Are the three tables of figures',
  '    right: Figure (with label), Table (text only, \\a: "Numbers"',
  '    with no "Table 1"), My Plate (no page numbers)? Is the Table',
  '    of Figures style\'s spacing Word\'s (!Letters: no space after)?',
  'TOC10 en3-7: are the entries "1.<tab>Scope", "1.1<tab>Terms" and',
  '    so on, the text at a tab stop (!Letters puts the text 440',
  '    twips a level in: is that Word\'s)? After F9 the same?',
  'TOC11 en3-8: do the captions read Figure 1-1 A, Figure 1-2 B and',
  '    Figure 2-1 C? Alt+F9: {STYLEREF 1 \\s}-{SEQ Figure \\* ARABIC',
  '    \\s 1}: is that what Word writes with "Include chapter',
  '    number"? Now change Heading 1\'s numbering in Word to "Chapter',
  '    1" (Define New Multilevel List, number format "Chapter %1")',
  '    and press F9: does STYLEREF 1 \\s give "1" or "Chapter 1"?',
  '    (!Letters refuses such a chapter number rather than guess.)',
  'TOC12 en3-9: press Ctrl+A, F9. For each line, does the result',
  '    stay what the list below shows? Heading number "1.1", no',
  '    context "1.1" or "1", full context "1.1"; above/below "below"',
  '    or "above"; page with Include above/below ("on page 1"?);',
  '    the bookmark text "marked words"; caption entire "Figure 1:',
  '    A view", label and number "Figure 1", text only "A view";',
  '    footnote number formatted (superscript?); the endnote number',
  '    (i?). Is the last one plain text, not a link? Alt+F9: are the',
  '    switches in Word\'s order (REF _Ref... \\r \\p \\h; NOTEREF',
  '    _Ref... \\f \\h)? Make the same references in Word: does Word',
  '    name its bookmarks _Ref + 9 digits too, and does it reuse one',
  '    for a second reference to the same heading (as !Letters does)?',
  '    For a footnote with "Include above/below": NOTEREF \\p (the',
  '    word only) or the number and "above"?',
  'TOC13 en3-10: is "A Title style paragraph" in the table at level',
  '    2? With outline levels off, is nothing else added? Does Word\'s',
  '    Options box show Title at level 2?',
  'TOC14 en3-11: is the table now Renamed chapter, New (level 2),',
  '    Last, the captions 1 and 2, the REF "Figure 2"? Press F9 in',
  '    the table and Ctrl+A F9: does anything change but page',
  '    numbers?',
  'TOC15 en3-12: press Ctrl+A, F9. Does the first reference become',
  '    "Original heading (edited)" and the second "Error! Reference',
  '    source not found."? (!Letters keeps the stored text of the',
  '    second and names it in its update message.)',
  'TOC16 Word\'s own behaviour to compare (no file, in a new Word',
  '    document): (a) make a heading with a word in hidden text',
  '    (Font > Hidden) and insert a table of contents: is the hidden',
  '    word in the entry? (!Letters leaves it out.) (b) Remove the',
  '    \\h from a table\'s code (Alt+F9, edit, F9): are the page',
  '    numbers still PAGEREF ... \\h fields (Alt+F9 in the table)?',
  '    (c) Put the caret in a table cell (no selection) and Insert',
  '    Caption: does the caption go to the whole table (above it) or',
  '    to the paragraph in the cell? (d) Ctrl+A, F9 in a document',
  '    where every field is up to date: does Word say anything?',
  '    (!Letters shows one summary message after every Update all',
  '    fields: "N fields updated" and the ones kept as stored.)',
  '    (e) Make a REF to a bold bookmarked word, unbold the REF\'s',
  '    result, press F9: is the result bold again (Word copies the',
  '    bookmark\'s formatting; !Letters keeps the result\'s own)?',
  '    (f) Insert a table of contents in a document with no headings:',
  '    what does the table say? (!Letters writes "No table of',
  '    contents entries found.") (g) Insert a caption ABOVE a',
  '    paragraph: is the caption paragraph set to "Keep with next"',
  '    (Format > Paragraph > Line and Page Breaks)? (!Letters sets',
  '    it; en3-6\'s Table 1 and the excluded figure are above.)',
  'TOC17 If you update a table of contents while View > Field codes',
  '    (Alt+F9) is on, does Word compute the page numbers from the',
  '    normal layout or from the collapsed code layout? (!Letters\'',
  '    update copies the window\'s codes option when it lays the',
  '    pages out again.)',
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
const how = put('en3-README.txt', Buffer.from(
  ascii(README.flatMap(wrap).join('\n')), 'ascii'));
made.push(`en3-README.txt (${how})`);
console.log('hand-off files in ' + OUT + ':\n  ' + made.join('\n  '));
if (typeof xsd !== 'string') xsd.done();
