// Generates the real-Word hand-off files for !Letters' footnotes and
// endnotes (Batch E2: Insert > Footnote / Endnote, the notes mode,
// the Footnote and Endnote box, Convert, custom marks, the notes on
// the pages). Local only, never committed: tests/moreapps/corpus/ is
// git-ignored. Not a test:
//
//   node tests/moreapps/handoff-notes.mjs
//
// Writes into tests/moreapps/corpus/handoff/ (made if missing):
//   en-1-new-commands.docx   a new document; 3 footnotes and 2
//                            endnotes put in with the commands (the
//                            notes parts made by !Letters)
//   en-2-one-footnote.docx   one footnote
//   en-3-many-restart-page.docx  footnotes on several pages,
//                            numbering restarted on each page
//   en-4-long-footnote.docx  a footnote longer than a page
//   en-5-endnotes-doc-end.docx   endnotes at the end of the document
//   en-6-endnotes-sect-end.docx  endnotes at the end of each section,
//                            restarting in each section
//   en-7-formats.docx        a section for each number format (a, A,
//                            i, I, symbols)
//   en-8-start-5.docx        numbering starting at 5
//   en-9-restart-section.docx  footnotes restarting each section
//   en-10-formatted-note.docx  a note with bold, a bulleted list and
//                            a table
//   en-11-custom-marks.docx  custom marks (* and a dagger)
//   en-12-converted.docx     notes converted by !Letters (swap)
//   en-13-below-text.docx    footnotes Below text
//   en-14-table-cell.docx    notes marked in table cells
//   en-15-added-one.docx     a Word-shaped document with notes and
//                            one footnote added
//   en-16-deleted-mark.docx  a Word-shaped document with a mark
//                            deleted (its note goes with it)
//   en-README.txt            what Word should show, the questions
//                            (EN1..), a PRIORITY list first
// Everything is done with !Letters' own commands (./NoteCmd
// insertNote, convertNote, customMark; ./NotePatch run, the box's;
// typing through a note's ./StoryFacade, as the notes mode does) on
// a Document. Each file is checked by the package lint, read back,
// and its notes listed in the README (number, kind, text) as
// !Letters reads them, so the list is what was really written. A
// file is written only when its bytes change, so a file open in Word
// is left alone; nothing else in the folder is touched.
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
import {insertNote, convertNote, customMark}
  from '../../tools/moreapps/!Letters/NoteCmd';
import * as NP from '../../tools/moreapps/!Letters/NotePatch';
import {numbers, marks}
  from '../../tools/moreapps/!Letters/NoteNumbers';
import {facadeOf} from '../../tools/moreapps/!Letters/StoryFacade';
import {apply} from '../../tools/moreapps/!Letters/FormatApply';
import {insertTable} from '../../tools/moreapps/!Letters/TblInsert';
import {deleteSelection} from '../../tools/moreapps/!Letters/EditDel';
import {insertSection} from '../../tools/moreapps/!Letters/SectBreak';
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {scan} from '../../tools/moreapps/!Letters/Walk';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {buildDocx, documentXml, settingsXml, stylesXml, p, r, REL,
  W_NS, R_NS} from './build-docx.mjs';
import {lintPackage} from './lint-package.mjs';
import {schemaChecker} from './roundtrip-lib.mjs';
import {tm} from './word-docs.mjs';

const OUT = fileURLToPath(new URL('./corpus/handoff/',
  import.meta.url));
const DATE = new Date(Date.UTC(2026, 9, 29, 12));
fs.mkdirSync(OUT, {recursive: true});
const xsd = schemaChecker();
const F = 'footnote', E_ = 'endnote';

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
    const b = paras().find((x) => x.text.startsWith(start));
    if (!b) throw new Error('no paragraph starting ' +
      JSON.stringify(start));
    return b;
  };
  const end = (b) => S.caret({id: b.id, off: b.text.length});
  const s = {
    d, t, paras, para, end,
    /** Type text at the end of the last paragraph (\n: Enter). */
    write(text) {
      const ps = paras();
      let sel = end(ps[ps.length - 1]);
      for (const [i, line] of text.split('\n').entries()) {
        if (i) sel = t.command(() => E.splitPara(d, sel));
        if (line) sel = t.type(sel, line);
      }
      return sel;
    },
    /** A note of kind after the text `after` in the paragraph
     *  starting `start`, its text typed in the notes mode. */
    note(start, after, kind, text) {
      const b = para(start);
      const at = b.text.indexOf(after);
      if (at < 0) throw new Error('no ' + after + ' in ' + start);
      const res = insertNote(d, t, S.caret({id: b.id,
        off: at + after.length}), kind);
      if (!res) throw new Error('insertNote refused at ' + after);
      if (text) s.inNote(res.note, text);
      return res.note;
    },
    /** Type text at the end of a note's last paragraph (\n: Enter):
     *  the notes mode's facade. */
    inNote(key, text) {
      const f = facadeOf(d, {note: key});
      const ft = new Typing(f, {now: () => (now += 2000)});
      const bs = f.doc.sections[0].blocks.filter((x) => x.type === 'p');
      let sel = end(bs[bs.length - 1]);
      for (const [i, line] of text.split('\n').entries()) {
        if (i) sel = ft.command(() => E.splitPara(f, sel));
        if (line) sel = ft.type(sel, line);
      }
      return {f, t: ft, sel};
    },
    /** A section break (Insert > Section break) at the end of the
     *  last paragraph: the text written next is the new section's. */
    section(type = 'nextPage') {
      const ps = paras();
      const res = insertSection(d, t, end(ps[ps.length - 1]), type);
      if (!res) throw new Error('no section break');
    },
    /** The Footnote and Endnote box's Apply, at the paragraph
     *  starting `start`. */
    options(start, values) {
      const sel = S.caret({id: para(start).id, off: 0});
      const res = t.command(() => NP.run(d, sel, values));
      if (res.error) throw new Error(res.error);
      return res;
    },
  };
  return s;
}

/** A new document of the given paragraphs (\n between). */
function fresh(text) {
  const s = session(newDoc({date: DATE}));
  s.write(text);
  return s;
}

const lines = [];
const say = (...x) => lines.push(...x);

// ----------------------------------------------------------- read back

/** What a written file holds: its pages (as !Letters lays them out),
 *  then each note with the number its mark shows. */
async function describe(bytes) {
  const doc = await readDocx(bytes);
  const L = new DocLayout(doc, tm());
  L.layout(1000);
  const P = new Pages(printGalley(L)).finish();
  const out = [`  ${P.count} page(s) in !Letters' Print layout (its ` +
    'own fonts: Word\'s pages will differ in detail)'];
  const nums = numbers(doc);
  const seen = new Set();
  const list = [];
  doc.sections.forEach((sec, si) => {
    scan({sections: [sec]}, (b) => {
      if (b.type !== 'p') return;
      for (const {x} of marks(b)) {
        const key = x.note + ':' + x.id;
        if (seen.has(key)) continue;
        seen.add(key);
        const slot = x.note + 's';
        const n = doc.notes[slot].get(x.id);
        const label = typeof x.custom === 'string' ? x.custom
          : nums[slot].get(x.id) || '?';
        const text = n ? n.blocks.map((q) => q.type === 'p'
          ? q.text.replace(/￼/g, '').trim() : '(table)')
          .filter(Boolean).join(' / ') : '(missing)';
        list.push(`    section ${si + 1}, ${x.note} ${label}: ` +
          `${text.slice(0, 60)}${text.length > 60 ? '...' : ''}`);
      }
    });
  });
  out.push('  notes, in the order of their marks (the mark shows the ' +
    'number or text given):', ...list);
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
    const parts = [doc.meta.mainPart, ...Object.values(
      doc.meta.noteParts || {}), doc.meta.settingsPart]
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

// ----------------------------------------------------------- the files

// en-1: the most important file: every notes part is OURS
{
  const s = fresh('Footnotes and endnotes made by !Letters\n' +
    'This document was made new in !Letters. Each note below was ' +
    'put in with Insert > Footnote or Insert > Endnote, and its ' +
    'text typed in the notes mode.\n' +
    'The first footnote is here and the second here. ' + LOREM + '\n' +
    'An endnote goes here, and another one here.\n' +
    'A third footnote ends this paragraph.');
  s.note('The first', 'here', F, 'The first footnote.');
  s.note('The first', 'second here', F, 'The second footnote, a ' +
    'little longer so that it takes more than one line at the foot ' +
    'of the page in most fonts.');
  s.note('An endnote', 'goes here', E_, 'The first endnote.');
  s.note('An endnote', 'another one here', E_, 'The second endnote.');
  s.note('A third', 'paragraph', F, 'The third footnote.');
  await save('en-1-new-commands.docx', s.d.doc, [
    'A new document (File > New) with 3 footnotes and 2 endnotes put',
    'in with the commands. !Letters made word/footnotes.xml and',
    'word/endnotes.xml (with Word\'s separator and continuation',
    'separator notes), their relationships, content types, the',
    'separator references in settings.xml and the four note styles',
    '(Footnote Text, Footnote Reference, Endnote Text, Endnote',
    'Reference) on first use.']);
}

// en-2: one footnote
{
  const s = fresh('One footnote\n' + LOREM);
  s.note('The quick', 'lazy dog', F, 'A single footnote.');
  await save('en-2-one-footnote.docx', s.d.doc, [
    'One footnote after "lazy dog".']);
}

// en-3: many footnotes, numbering restarted on each page
{
  let text = 'Footnotes restarting on each page';
  for (let i = 1; i <= 40; i++) {
    text += '\nParagraph ' + i + '. ' + LOREM;
  }
  const s = fresh(text);
  for (let i = 1; i <= 40; i += 2) {
    s.note('Paragraph ' + i + '.', 'fox', F, 'Footnote of paragraph ' +
      i + '.');
  }
  s.options('Paragraph 1.', {scope: 'all',
    footnote: {numRestart: 'eachPage'}});
  await save('en-3-many-restart-page.docx', s.d.doc, [
    '20 footnotes over several pages (one every other paragraph),',
    'Footnote and Endnote box: Numbering Restart each page, Whole',
    'document. The numbers listed below are !Letters\' continuous ones',
    '(the restart shows on its pages): in Word each page should start',
    'again at 1.']);
}

// en-4: a footnote longer than a page
{
  const s = fresh('A long footnote\nThe mark of a very long footnote ' +
    'is here. ' + LOREM + '\nMore text after it. ' + LOREM);
  const key = s.note('The mark', 'here', F, 'This footnote is long.');
  let more = '';
  for (let i = 1; i <= 45; i++) more += '\nNote paragraph ' + i + '. ' +
    LOREM;
  s.inNote(key, more);
  await save('en-4-long-footnote.docx', s.d.doc, [
    'One footnote of 46 paragraphs: longer than a page. Word should',
    'cut it at the foot of the first page and go on, under the',
    'continuation separator (a rule across the text width), on the',
    'next page(s), with the text of the body going on above it.']);
}

// en-5: endnotes at the end of the document (two sections)
{
  const s = fresh('Endnotes at the end of the document\n' +
    'Section one has an endnote here. ' + LOREM);
  s.note('Section one', 'here', E_, 'Endnote of section one.');
  s.section();
  s.write('Section two starts on a new page and has an endnote ' +
    'here. ' + LOREM);
  s.note('Section two', 'here', E_, 'Endnote of section two.');
  await save('en-5-endnotes-doc-end.docx', s.d.doc, [
    'Two sections (a next-page break), an endnote in each, End of',
    'document (Word\'s default): both endnotes after the last',
    'paragraph of section two, under a short rule. No number format',
    'is written: !Letters shows 1 and 2 (see EN16).']);
}

// en-6: endnotes at the end of each section, restarting
{
  const s = fresh('Endnotes at the end of each section\n' +
    'Section one, endnote here and here. ' + LOREM);
  s.note('Section one', 'endnote here', E_, 'One of section one.');
  s.note('Section one', 'and here', E_, 'Two of section one.');
  s.section();
  s.write('Section two, endnote here. ' + LOREM);
  s.note('Section two', 'here', E_, 'One of section two.');
  s.section();
  s.write('Section three, endnote here. ' + LOREM);
  s.note('Section three', 'here', E_, 'One of section three.');
  s.options('Section one', {scope: 'all', endnote: {pos: 'sectEnd',
    numRestart: 'eachSect', numFmt: 'decimal'}});
  await save('en-6-endnotes-sect-end.docx', s.d.doc, [
    'Three sections; the box set for the Whole document: Endnotes,',
    'End of section, 1, 2, 3, Restart each section. Each section\'s',
    'endnotes after its own text: 1, 2 / 1 / 1. (1, 2, 3 is',
    '!Letters\' default for endnotes, so no w:numFmt is written: see',
    'EN16.)']);
}

// en-7: the number formats, one section each
{
  const fmts = [['lowerLetter', 'a, b, c'], ['upperLetter', 'A, B, C'],
    ['lowerRoman', 'i, ii, iii'], ['upperRoman', 'I, II, III'],
    ['chicago', 'symbols']];
  const s = fresh('Number formats');
  fmts.forEach(([, label], i) => {
    if (i) s.section();
    s.write((i ? '' : '\n') + 'Format ' + label + ': one here, two ' +
      'here, three here.');
  });
  fmts.forEach(([id, label]) => {
    const at = 'Format ' + label;
    s.note(at, 'one here', F, 'One (' + label + ').');
    s.note(at, 'two here', F, 'Two (' + label + ').');
    s.note(at, 'three here', F, 'Three (' + label + ').');
    s.options(at, {scope: 'section', footnote: {numFmt: id,
      numRestart: 'eachSect'}});
  });
  await save('en-7-formats.docx', s.d.doc, [
    'Five sections, three footnotes each; each section set by the box',
    '(This section) to its own number format and Restart each',
    'section: a b c / A B C / i ii iii / I II III / * dagger',
    'double dagger.']);
}

// en-8: start at 5
{
  const s = fresh('Starting at 5\nFirst here, second here, third ' +
    'here. ' + LOREM);
  s.note('First', 'First here', F, 'Shows 5.');
  s.note('First', 'second here', F, 'Shows 6.');
  s.note('First', 'third here', F, 'Shows 7.');
  s.options('First', {scope: 'all', footnote: {numStart: 5}});
  await save('en-8-start-5.docx', s.d.doc, [
    'Three footnotes, Start at 5 (Whole document): 5, 6, 7.']);
}

// en-9: restart each section
{
  const s = fresh('Restart each section\nSection one: a here, b here.');
  s.note('Section one', 'a here', F, 'First of section one.');
  s.note('Section one', 'b here', F, 'Second of section one.');
  s.section();
  s.write('Section two: c here, d here.');
  s.note('Section two', 'c here', F, 'First of section two.');
  s.note('Section two', 'd here', F, 'Second of section two.');
  s.options('Section one', {scope: 'all',
    footnote: {numRestart: 'eachSect'}});
  await save('en-9-restart-section.docx', s.d.doc, [
    'Two sections, two footnotes each, Restart each section (Whole',
    'document): 1, 2 / 1, 2.']);
}

// en-10: a note with formatting
{
  const s = fresh('A note with formatting\nThe formatted note is ' +
    'here. ' + LOREM);
  const key = s.note('The formatted', 'here', F, 'Bold words here.');
  let f = facadeOf(s.d, {note: key});
  let ft = new Typing(f, {now: () => 0});
  const nb = () => f.doc.sections[0].blocks.filter((x) =>
    x.type === 'p');
  const b0 = nb()[0], k = b0.text.indexOf('Bold words');
  apply('bold', f, ft, S.select({id: b0.id, off: k},
    {id: b0.id, off: k + 'Bold words'.length}));
  s.inNote(key, '\nFirst item\nSecond item');
  f = facadeOf(s.d, {note: key});
  ft = new Typing(f, {now: () => 0});
  const items = nb().slice(-2);
  const got = apply('bullets', f, ft, S.select({id: items[0].id,
    off: 0}, {id: items[1].id, off: items[1].text.length}));
  if (!got) throw new Error('no bullets in the note');
  s.inNote(key, '\nA table follows.');
  f = facadeOf(s.d, {note: key});
  // (Enter after a list item goes on with the list, as in Word: the
  // line before the table taken out of it)
  const line = nb()[nb().length - 1];
  apply('listOff', f, new Typing(f, {now: () => 0}),
    S.caret({id: line.id, off: 0}));
  f = facadeOf(s.d, {note: key});
  const last = nb()[nb().length - 1];
  const sel = insertTable(f, S.caret({id: last.id,
    off: last.text.length}), {cols: 2, rows: 2});
  if (!sel) throw new Error('no table in the note');
  new Typing(f, {now: () => 0}).type(sel, 'cell one');
  await save('en-10-formatted-note.docx', s.d.doc, [
    'One footnote holding "Bold words" in bold, a two-item bulleted',
    'list, a line, then a 2 x 2 table (Insert > Table in the notes',
    'mode; "cell one" in its first cell). The list made in the note',
    'is in the document\'s numbering part.']);
}

// en-11: custom marks
{
  const s = fresh('Custom marks\nA star here, a dagger here, a ' +
    'number here.');
  const a = s.note('A star', 'star here', F, 'The star note.');
  const b = s.note('A star', 'dagger here', F, 'The dagger note.');
  s.note('A star', 'number here', F, 'Numbered 1: the custom marks ' +
    'take no number.');
  for (const [key, text] of [[a, '*'], [b, '†']]) {
    const res = customMark(s.d, s.t, F, key.id, text);
    if (!res.changed) throw new Error('custom mark ' + res.error);
  }
  await save('en-11-custom-marks.docx', s.d.doc, [
    'Three footnotes; the first two given a custom mark in the box',
    '(Custom mark: * and a dagger, U+2020), the third numbered 1.',
    'The note\'s own mark shows the same text.']);
}

// en-12: converted by !Letters
{
  const s = fresh('Converted notes\nFootnote here, footnote there, ' +
    'endnote here, endnote there.');
  s.note('Footnote', 'Footnote here', F, 'Was footnote 1.');
  s.note('Footnote', 'footnote there', F, 'Was footnote 2.');
  s.note('Footnote', 'endnote here', E_, 'Was endnote 1.');
  s.note('Footnote', 'endnote there', E_, 'Was endnote 2.');
  const res = convertNote(s.d, s.t, null, 'swap');
  if (res.changed !== 4) {
    throw new Error('swap: ' + JSON.stringify(res));
  }
  await save('en-12-converted.docx', s.d.doc, [
    'Two footnotes and two endnotes, then Convert... > Swap',
    'footnotes and endnotes: the first two are now endnotes, the last',
    'two footnotes (1, 2), their styles switched (Endnote Text /',
    'Footnote Text).']);
}

// en-13: below text
{
  const s = fresh('Footnotes below the text\nA short page with a ' +
    'footnote here.\nThe page has room left below.');
  s.note('A short', 'here', F, 'Shown right below the last line, ' +
    'not at the foot of the page.');
  s.options('A short', {scope: 'all', footnote: {pos: 'beneathText'}});
  await save('en-13-below-text.docx', s.d.doc, [
    'One footnote, Location: Below text: it should sit right under',
    '"The page has room left below.", not at the page\'s foot.']);
}

// en-14: marks in table cells
{
  const s = fresh('Notes in a table\nThe table follows.');
  const b = s.para('The table');
  const sel = insertTable(s.d, S.caret({id: b.id, off: b.text.length}),
    {cols: 2, rows: 2});
  s.t.type(sel, 'Cell with a footnote');
  s.note('Cell with', 'footnote', F, 'Footnote from a cell.');
  // (the second cell of the first row)
  const all = s.paras();
  const c2 = all[all.indexOf(s.para('Cell with')) + 1];
  s.t.type(S.caret({id: c2.id, off: 0}), 'And an endnote');
  s.note('And an endnote', 'endnote', E_, 'Endnote from a cell.');
  await save('en-14-table-cell.docx', s.d.doc, [
    'A 2 x 2 table (Insert > Table); a footnote in the first cell, an',
    'endnote in the second.']);
}

// en-15 and en-16: Word-shaped documents with notes
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '\r\n';
const WSEP = (el) => `<w:${el} w:type="separator" w:id="-1"><w:p>` +
  '<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>' +
  `</w:pPr><w:r><w:separator/></w:r></w:p></w:${el}><w:${el} ` +
  'w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:spacing ' +
  'w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r>' +
  `<w:continuationSeparator/></w:r></w:p></w:${el}>`;
const WNOTE = (el, id, text) => `<w:${el} w:id="${id}"><w:p><w:pPr>` +
  `<w:pStyle w:val="${el === 'footnote' ? 'Footnote' : 'Endnote'}` +
  `Text"/></w:pPr><w:r><w:rPr><w:rStyle w:val="${el === 'footnote'
    ? 'Footnote' : 'Endnote'}Reference"/></w:rPr><w:${el}Ref/></w:r>` +
  `<w:r><w:t xml:space="preserve"> ${text}</w:t></w:r></w:p></w:${el}>`;
const WMARK = (el, id) => `<w:r><w:rPr><w:rStyle w:val="${el ===
  'footnote' ? 'Footnote' : 'Endnote'}Reference"/></w:rPr>` +
  `<w:${el}Reference w:id="${id}"/></w:r>`;
const WSTY = (id, name, type, more) => `<w:style w:type="${type}" ` +
  `w:styleId="${id}"><w:name w:val="${name}"/>${more}</w:style>`;
const STYLES = stylesXml('<w:style w:type="paragraph" w:default="1" ' +
  'w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
  '<w:style w:type="character" w:default="1" w:styleId=' +
  '"DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/>' +
  '<w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/>' +
  '</w:style>' +
  WSTY('FootnoteText', 'footnote text', 'paragraph', '<w:basedOn ' +
    'w:val="Normal"/><w:link w:val="FootnoteTextChar"/><w:uiPriority ' +
    'w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:pPr><w:spacing ' +
    'w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr>' +
    '<w:sz ' +
    'w:val="20"/><w:szCs w:val="20"/></w:rPr>') +
  WSTY('FootnoteReference', 'footnote reference', 'character',
    '<w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority ' +
    'w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:rPr>' +
    '<w:vertAlign ' +
    'w:val="superscript"/></w:rPr>') +
  WSTY('EndnoteText', 'endnote text', 'paragraph', '<w:basedOn ' +
    'w:val="Normal"/><w:uiPriority w:val="99"/><w:semiHidden/>' +
    '<w:unhideWhenUsed/><w:pPr><w:spacing w:after="0" w:line="240" ' +
    'w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/><w:szCs ' +
    'w:val="20"/></w:rPr>') +
  WSTY('EndnoteReference', 'endnote reference', 'character',
    '<w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority ' +
    'w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:rPr>' +
    '<w:vertAlign ' +
    'w:val="superscript"/></w:rPr>'));
const wordShaped = () => buildDocx({
  'word/document.xml': documentXml(
    p(r('A document with notes, as Word writes them')) +
    p(r('Footnote one') + WMARK('footnote', 1) + r(', footnote two') +
      WMARK('footnote', 2) + r(' and an endnote') +
      WMARK('endnote', 1) + r('.')) +
    p(r('A last paragraph with footnote three') +
      WMARK('footnote', 3) + r('.'))),
  'word/footnotes.xml': DECL + `<w:footnotes xmlns:w="${W_NS}" ` +
    `xmlns:r="${R_NS}">` + WSEP('footnote') +
    WNOTE('footnote', 1, 'Footnote one, from Word.') +
    WNOTE('footnote', 2, 'Footnote two, from Word.') +
    WNOTE('footnote', 3, 'Footnote three, from Word.') +
    '</w:footnotes>',
  'word/endnotes.xml': DECL + `<w:endnotes xmlns:w="${W_NS}" ` +
    `xmlns:r="${R_NS}">` + WSEP('endnote') +
    WNOTE('endnote', 1, 'The endnote, from Word.') + '</w:endnotes>',
  'word/styles.xml': STYLES,
  'word/settings.xml': settingsXml('<w:footnotePr><w:footnote ' +
    'w:id="-1"/><w:footnote w:id="0"/></w:footnotePr><w:endnotePr>' +
    '<w:endnote w:id="-1"/><w:endnote w:id="0"/></w:endnotePr>')},
{docRels: [['rIdF', REL('footnotes'), 'footnotes.xml'],
  ['rIdE', REL('endnotes'), 'endnotes.xml']]});

{
  const s = session(await readDocx(await wordShaped()));
  s.note('Footnote one', 'footnote two', F, 'Added by !Letters ' +
    'between two and the endnote.');
  await save('en-15-added-one.docx', s.d.doc, [
    'A document shaped as Word writes one (3 footnotes, 1 endnote,',
    'Word\'s note styles and separators), opened in !Letters, one',
    'footnote added after "footnote two": now 1, 2, 3 (new), 4. The',
    'notes from the file are written back as they were read.']);
}
{
  const s = session(await readDocx(await wordShaped()));
  const b = s.para('Footnote one');
  const k = b.text.indexOf(', footnote two') + ', footnote two'.length;
  deleteSelection(s.d, S.select({id: b.id, off: k},
    {id: b.id, off: k + 1}));
  await save('en-16-deleted-mark.docx', s.d.doc, [
    'The same Word-shaped document, the mark of footnote two deleted',
    '(selected and deleted): its note went with it; footnote three',
    'is now numbered 2.']);
}

// ------------------------------------------------------------ README

const README = [
  'Footnotes and endnotes (!Letters Batch E2: Insert > Footnote and',
  'Endnote, the notes mode, the Footnote and Endnote box, Convert,',
  'custom marks, the notes on the pages): the real-Word hand-off',
  '(made by node tests/moreapps/handoff-notes.mjs; local only, this',
  'folder is never committed)',
  '',
  'Every file was made, or opened and changed, with !Letters\' own',
  'commands. Each was written, checked by the package lint, read',
  'back by !Letters, and its notes are listed below under the file',
  '(in the order of their marks, with the number or text the mark',
  'shows), so the list is what was really written. !Letters\' page',
  'count uses its own fonts: Word\'s pages differ in detail. Open each',
  'in !Letters too (Print layout) and compare.',
  '',
  'PRIORITY: the questions may be too many for one session. Take',
  'these 7 first, in this order: the files that could show a repair',
  'prompt (notes parts made by !Letters for the first time, notes',
  'rewritten, notes moved by Convert). Everything else is "if time',
  'allows".',
  '',
  '  1. en-1-new-commands: EN1, EN2, EN3 (the most important file:',
  '     every notes part in it was made by !Letters. Does Word open',
  '     it without a repair prompt? Are the notes there, with the',
  '     right numbers, on the right pages, under the right rule?)',
  '  2. Smoke test: open EVERY en-*.docx once. Note any repair',
  '     prompt or "unreadable content" message and which file. EN4.',
  '  3. en-12-converted: EN11 (notes moved between the parts).',
  '  4. en-10-formatted-note: EN9 (a list and a table in a note).',
  '  5. en-15-added-one and en-16-deleted-mark: EN14 (Word\'s',
  '     own notes kept; one added; one taken with its mark).',
  '  6. en-4-long-footnote: EN6 (a note longer than a page).',
  '  7. en-1, en-5, en-6: EN16 (the endnotes\' default number format:',
  '     1, 2, 3 or i, ii, iii).',
  '',
  'Questions',
  '---------',
  'EN1 en-1: does Word open it with no message? In Print Layout, are',
  '    footnotes 1, 2 and 3 at the foot of the page of their marks,',
  '    under a short rule (about 2 inches), and endnotes 1 and 2',
  '    (or i and ii: EN16) after the last paragraph, under a short',
  '    rule?',
  'EN2 en-1: double-click a footnote number in the text: does Word',
  '    go to the note, and from the note\'s number back to the mark?',
  '    Type in a note: does it behave as Word\'s own (Footnote Text',
  '    style, about 10 pt; the number superscript)? Insert a new',
  '    footnote in Word before the first: are the others renumbered?',
  'EN3 en-1: save it in Word (as a copy), and if you can, send it',
  '    back: what does Word write differently in footnotes.xml,',
  '    endnotes.xml and settings.xml (namespaces, w:rsid, the',
  '    separator paragraphs, the note styles)?',
  'EN4 Any en-*.docx with a repair prompt, a lost note, a number',
  '    that differs from the list below the file, or a note on the',
  '    wrong page? (Which file, which note.)',
  'EN5 en-3: with Restart each page, does each page\'s first footnote',
  '    show 1? Does Word\'s Footnote and Endnote box show "Restart',
  '    each page" and Apply changes to "Whole document"?',
  'EN6 en-4: where does Word cut the long footnote? Does the body',
  '    text go on above the rest of the note on the next pages (how',
  '    many lines of body per page)? Is the continuation separator a',
  '    rule across the whole text width? (!Letters keeps at least one',
  '    line of body on each page the note goes on over: is that what',
  '    Word does?)',
  'EN7 en-5 and en-6: are the endnotes after the last paragraph of',
  '    the document (en-5), and after each section\'s own text with',
  '    numbers restarting (en-6: 1, 2 / 1 / 1)? Does a section after',
  '    its endnotes start on a new page?',
  'EN8 en-7, en-8, en-9: do the numbers read a b c, A B C, i ii iii,',
  '    I II III, then * dagger double dagger; 5 6 7; 1 2 / 1 2? What',
  '    does Word show after the third symbol (for the fourth and',
  '    fifth note, !Letters shows the section sign, then doubled',
  '    symbols ** ...)? Add two footnotes to the symbols section in',
  '    Word to see.',
  'EN9 en-10: is "Bold words" bold in the note, the two items',
  '    bulleted, and the table there with "cell one"? Any repair',
  '    prompt (the list in a note uses the document\'s numbering',
  '    part)?',
  'EN10 en-11: do the marks show * and a dagger (in the text and',
  '    in the note), and is the third note numbered 1? In Word\'s',
  '    box, does the first note show Custom mark *?',
  'EN11 en-12: after the swap, are the first two notes endnotes (1,',
  '    2, or i, ii: see EN16) at the end and the last two footnotes',
  '    (1, 2) at the foot?',
  '    Are their styles Endnote Text / Footnote Text (Home > Styles',
  '    pane)? Any repair prompt?',
  'EN12 en-13: with Below text, is the footnote right under the last',
  '    line of text, not at the foot of the page?',
  'EN13 en-14: is the footnote from the first cell at the foot of',
  '    the page, the endnote from the second cell at the end?',
  'EN14 en-15, en-16: in en-15 are the footnotes 1, 2, 3 (the added',
  '    one: "Added by !Letters...") and 4? In en-16 is footnote two',
  '    gone and three now numbered 2? Do the notes look exactly as',
  '    Word made them (10 pt, superscript numbers)?',
  'EN15 Word\'s own behaviour to compare (no file): in Word, put a',
  '    footnote in a new document and save: does Word declare more',
  '    namespaces in footnotes.xml, and does it add a',
  '    w:continuationNotice note? Delete the last footnote: does',
  '    Word remove footnotes.xml? (!Letters keeps the part.)',
  'EN16 The endnotes\' default number format. Open en-1, en-5 and',
  '    en-6 in Word, go to the end of each document (en-6: the end',
  '    of each section) and read the endnote numbers: are they 1, 2,',
  '    3 or i, ii, iii? !Letters shows 1, 2, 3 when the file names no',
  '    format, and en-1, en-5, en-6, en-12 and en-14 name none.',
  '    Why we ask: in the test corpus, 2 files made by Word write',
  '    w:numFmt decimal for their endnotes explicitly (in settings',
  '    and in the section properties: "endnote.docx" and "endnote at',
  '    end of section and restart for each section.docx"), while 12',
  '    other Word files with endnotes write no endnote format at all.',
  '    Word writes a value only when it is not its default, so its',
  '    default is probably i, ii, iii. If Word shows i, ii, iii here,',
  '    !Letters\' default is wrong, and choosing 1, 2, 3 in its box',
  '    must write w:numFmt decimal.',
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
// (ASCII only, as the other READMEs: the symbols in words)
const WORDS = {'\u2020': 'dagger', '\u2021': 'double dagger',
  '\u00a7': 'section sign'};
const ascii = (t) => t.replace(/[^\x00-\x7e]/gu, (c) => WORDS[c] ||
  'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
const how = put('en-README.txt', Buffer.from(
  ascii(README.flatMap(wrap).join('\n')), 'ascii'));
made.push(`en-README.txt (${how})`);
console.log('hand-off files in ' + OUT + ':\n  ' + made.join('\n  '));
if (typeof xsd !== 'string') xsd.done();
