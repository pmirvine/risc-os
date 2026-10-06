// Generates the real-Word hand-off files for !Word's typing (local only,
// never committed: tests/moreapps/corpus/ is git-ignored). Not a test:
//
//   node tests/moreapps/handoff-typing.mjs
//
// Writes into tests/moreapps/corpus/handoff/ (made if missing):
//   typed-1-basic.docx     text typed into a new document
//   typed-2-rich.docx      edits in a rich document (edit-rich.mjs)
//   typed-3-undo.docx      edits, then some of them undone
//   typed-4-sections.docx  deletions across section breaks
//   typed-README.txt       what Word should show, the open questions
// Every edit is made with !Word's own commands (Edit, EditDel, Typing)
// on a Document, as the window makes them. A file is written only
// when its bytes change (the output is the same every run), so a
// file open in Word is left alone; nothing else in the folder is
// touched. Each file is read back and its paragraphs listed in the
// README, so the list is what was really written.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {writeDocx, newDoc} from '../../tools/moreapps/!Word/DocxWrite';
import {Document} from '../../tools/moreapps/!Word/Document';
import {Typing} from '../../tools/moreapps/!Word/Typing';
import {blockId} from '../../tools/moreapps/!Word/DocPos';
import * as S from '../../tools/moreapps/!Word/Selection';
import * as E from '../../tools/moreapps/!Word/Edit';
import * as X from '../../tools/moreapps/!Word/EditDel';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {richDocx} from './edit-rich.mjs';
import {lintPackage} from './lint-package.mjs';
import {buildDocx, documentXml, p, r, REL} from './build-docx.mjs';

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

/** An editing session on a Document, with a clock for Typing. */
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
  /** {id, off}: at a number, after a string, or 'end'. */
  const pos = (start, at = 0) => {
    const b = para(start);
    let off = at;
    if (at === 'end') off = b.text.length;
    else if (typeof at === 'string') {
      const k = b.text.indexOf(at);
      if (k < 0) throw new Error(`no ${JSON.stringify(at)} in ${b.text}`);
      off = k + at.length;
    }
    return {id: b.id, off};
  };
  const s = {
    d, all, para, pos,
    caret: (start, at) => S.caret(pos(start, at)),
    select: (a, b) => S.select(a, b),
    /** Type text keystroke by keystroke (one 'word' per undo step). */
    type(sel, text) {
      for (const ch of text) { now += 50; sel = t.type(sel, ch); }
      return sel;
    },
    pause() { now += 5000; },
    cmd: (fn) => t.command(fn),
    boxAfter(start) {
      const bs = all(), k = bs.indexOf(para(start));
      return blockId(bs[k + 1]);
    },
  };
  return s;
}

const lines = [];
const say = (...x) => lines.push(...x);

/** What a written file holds: its paragraphs, by section. */
async function describe(bytes) {
  const doc = await readDocx(bytes);
  const out = [];
  doc.sections.forEach((sec, k) => {
    const pg = sec.props.pgSz;
    out.push(`  Section ${k + 1}` + (pg && pg.orient ? ` (${pg.orient})`
      : ''));
    for (const b of sec.blocks) {
      if (b.type !== 'p') { out.push('    [table]'); continue; }
      const show = [...b.text].map((c, i) => {
        if (c === '\t') return '<tab>';
        if (c === '\n') return '<line break>';
        if (c === '\ufffc') {
          const x = b.inlines[i];
          return x && x.node ? `<${x.node.name.replace(/^w:/, '')}>` : '<obj>';
        }
        return c;
      }).join('');
      const how = [b.pStyle, b.pPr.numPr ? 'list' : ''].filter(Boolean);
      out.push(`    ${how.length ? '(' + how.join(', ') + ') ' : ''}` +
        JSON.stringify(show).slice(1, -1).replace(/\\"/g, '"'));
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
  const how = put(name, bytes);
  made.push(`${name} (${bytes.length} bytes, ${how})`);
  say('', name, '-'.repeat(name.length), ...about, '',
    'What !Word wrote (read back; <tab>, <line break>, <hyperlink> as',
    'markers; (Heading1) and so on: the paragraph style, list: numbered',
    'or bulleted):', ...await describe(bytes));
}


// ------------------------------------------------------------ 1: basic

{
  const s = session(newDoc({date: DATE}));
  let c = s.caret('', 0);
  c = s.type(c, 'Typed in !Word: caf\u00e9, na\u00efve, \u00fcber, ' +
    'Stra\u00dfe, d\u00e9compos\u00e9 (written with e and a combining ' +
    'accent: de\u0301compose\u0301), an emoji \u{1F600}, and a ' +
    'ZWJ sequence \u{1F469}\u200d\u{1F4BB}.');
  c = s.cmd(() => E.splitPara(s.d, c));
  c = s.type(c, 'A second paragraph, made with Enter.');
  c = s.cmd(() => E.lineBreak(s.d, c));
  c = s.type(c, 'After a line break (Shift-Enter), same paragraph.');
  c = s.cmd(() => E.splitPara(s.d, c));
  c = s.type(c, 'Name:');
  c = s.cmd(() => E.insertTab(s.d, c));
  s.type(c, 'a value after a tab.');
  await save('typed-1-basic.docx', s.d.doc, [
    'A new document (as !Word makes one) with text typed into it:',
    'accents, accents written as e + U+0301 (combining acute), an emoji',
    'and a ZWJ emoji sequence (woman + technologist), Enter, Shift-Enter',
    '(a line break) and Tab. Word should show three Normal paragraphs',
    '(Calibri 11 pt):',
    '1. the typed line, every character as typed (the two "decompose"',
    '   words look exactly like "d\u00e9compos\u00e9"; the ZWJ sequence',
    '   is ONE emoji, a woman at a laptop);',
    '2. "A second paragraph, made with Enter." and, on the next line of',
    '   the SAME paragraph (no space before it), "After a line break',
    '   (Shift-Enter), same paragraph.";',
    '3. "Name:", a tab, "a value after a tab.".',
    'Check: no repair prompt; Show/Hide (the \u00b6 button) shows a',
    'line-break arrow in paragraph 2 and a tab arrow in paragraph 3;',
    'Backspace once after the family emoji in Word deletes it whole.',
  ]);
}

// ------------------------------------------------------------ 2: rich

{
  const s = session(await readDocx(await richDocx()));
  const {d} = s;
  // typing inside a bold run and inside an italic run
  let c = s.caret('Plain, bold', 'Plain, bold');
  c = s.type(c, ' and strong');
  s.pause();
  c = s.caret('Plain, bold', 'italic');
  c = s.type(c, ' and slanted');
  // Ctrl-Backspace at the end of the paragraph, twice
  c = s.caret('Plain, bold', 'end');
  c = s.cmd(() => X.deleteWordBack(d, c));
  c = s.cmd(() => X.deleteWordBack(d, c));
  // typing right after the hyperlink
  c = s.caret('A link: ', 'A link: \ufffc');
  c = s.type(c, ' (typed after the link)');
  // Enter at the end of the heading, then typing
  c = s.caret('Typing test', 'end');
  c = s.cmd(() => E.splitPara(d, c));
  c = s.type(c, 'Typed after Enter at the end of the heading.');
  // Enter in the middle of a list item
  c = s.caret('First numbered', 'First numbered');
  c = s.cmd(() => E.splitPara(d, c));
  // Enter twice at the end of the list: the second leaves the list
  c = s.caret('Second numbered', 'end');
  c = s.cmd(() => E.splitPara(d, c));
  c = s.cmd(() => E.splitPara(d, c));
  c = s.type(c, 'Typed after Enter twice at the end of the list.');
  // Shift-Enter in a bulleted item
  c = s.caret('A bullet point', 'end');
  c = s.cmd(() => E.lineBreak(d, c));
  c = s.type(c, 'continued after Shift-Enter');
  // Backspace joining two non-empty paragraphs (two bullets)
  c = s.caret('Another bullet', 0);
  c = s.cmd(() => X.deleteBack(d, c));
  // a selection across a table, deleted
  c = s.select(s.pos('The paragraph before', 'The paragraph'),
    s.pos('The paragraph after', 'The paragraph after'));
  c = s.cmd(() => X.deleteSelection(d, c));
  // the second heading emptied, then Backspace at the start of the
  // (non-empty) paragraph after it
  c = s.select(s.pos('A second heading', 0),
    s.pos('A second heading', 'end'));
  c = s.cmd(() => X.deleteSelection(d, c));
  c = s.caret('Name:', 0);
  c = s.cmd(() => X.deleteBack(d, c));
  // a selection across two paragraphs replaced by typing; a tab at
  // the start of a paragraph
  c = s.select(s.pos('One line', 'One'), s.pos('Caf', 'na\u00efve,'));
  c = s.type(c, ' REPLACED');
  c = s.caret('The end.', 0);
  c = s.cmd(() => E.insertTab(d, c));
  // Shift-Enter in the last paragraph of section one
  c = s.caret('The last paragraph', 'The last');
  s.cmd(() => E.lineBreak(d, c));
  await save('typed-2-rich.docx', d.doc, [
    'A rich document (a heading, bold and italic words, a hyperlink, a',
    'numbered and a bulleted list, a table, a tab, a line break, two',
    'sections) edited with !Word\'s commands, in this order:',
    ' a. " and strong" typed after "bold" (inside the bold run) and',
    '    " and slanted" after "italic": both should be bold / italic;',
    ' b. Ctrl-Backspace twice at the end of "...and plain again.";',
    ' c. " (typed after the link)" typed right after the hyperlink:',
    '    plain text, NOT part of the link (not blue, not clickable);',
    ' d. Enter at the end of the Heading 1 "Typing test", then a line',
    '    typed: the new paragraph is Normal (Heading 1\'s next style);',
    ' e. Enter in the middle of "First numbered item": two numbered',
    '    items, "First numbered" (1.) and " item" (2.);',
    ' f. Enter at the end of "Second numbered item", and Enter again in',
    '    the empty item: the empty item leaves the list (no number),',
    '    then a line is typed in it;',
    ' g. Shift-Enter at the end of "A bullet point", then text: one',
    '    bullet with two lines;',
    ' h. Backspace at the start of "Another bullet point": joined to',
    '    the bullet before (one bullet, its properties);',
    ' i. "The paragraph [before the table. TABLE The paragraph after]',
    '    the table." deleted: the table goes, "The paragraph the',
    '    table." is left;',
    ' j. the Heading 2 "A second heading" emptied, then Backspace at',
    '    the start of the paragraph after it ("Name:" Normal): the',
    '    EMPTY heading goes, "Name:..." stays Normal;',
    ' k. from after "One" (in "One line<br>and the next") to after',
    '    "na\u00efve," (the next paragraph) selected and replaced by',
    '    " REPLACED": the two paragraphs become one; a tab at the start',
    '    of "The end." (section two);',
    ' l. Shift-Enter after "The last" in "The last paragraph of',
    '    section one.": the paragraph that carries the section break.',
    'Check: the document opens with no repair prompt; the list numbers',
    'are 1., 2., 3. for the three numbered items before the un-numbered',
    'line; the section break after "The last paragraph..." is kept',
    '(section two starts a new page).',
  ]);
}

// ------------------------------------------------------------ 3: undo

{
  const s = session(newDoc({date: DATE}));
  const {d} = s;
  let c = s.caret('', 0);
  c = s.type(c, 'First words typed. ');
  s.pause();
  c = s.type(c, 'More words.');
  c = s.cmd(() => E.splitPara(d, c));
  c = s.type(c, 'A second paragraph that will be undone.');
  for (let k = 0; k < 5; k++) c = s.cmd(() => X.deleteBack(d, c));
  const steps = d.undoDepth;
  for (let k = 0; k < 6; k++) d.undo();
  d.redo();
  c = s.caret('A second', 'end');
  s.type(c, ' (typed after the undos)');
  await save('typed-3-undo.docx', d.doc, [
    'A new document: "First words typed. " typed, a pause, "More',
    'words.", Enter, "A second paragraph that will be undone.", then',
    'five Backspaces ("done." gone). That made ' + steps + ' undo steps in',
    '!Word: one per typed word with the spaces after it, one for the',
    'pause, one for Enter, one per Backspace. Then six undos (the five',
    'Backspaces and the word "undone.") and one redo ("undone." back),',
    'then " (typed after the undos)" typed at the end.',
    'Word should show two Normal paragraphs: "First words typed. More',
    'words." and "A second paragraph that will be undone. (typed after',
    'the undos)". (The undo history is not in the file.)',
  ]);
}

// ------------------------------------------------------------ 4: sections

{
  const z = await readZip(await writeDocx(newDoc({date: DATE}),
    {date: DATE}));
  const part = (n) => new TextDecoder().decode(z.get(n));
  const sect = (land) => '<w:sectPr>' + (land
      ? '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>'
      : '<w:pgSz w:w="11906" w:h="16838"/>') + '<w:pgMar w:top="1440" ' +
      'w:right="1440" w:bottom="1440" w:left="1440" w:header="708" ' +
      'w:footer="708" w:gutter="0"/><w:cols w:space="708"/></w:sectPr>';
  const TBL = '<w:tbl><w:tblPr><w:tblW w:w="4000" w:type="dxa"/>' +
    '<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" ' +
    'w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" ' +
    'w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" ' +
    'w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" ' +
    'w:color="auto"/></w:tblBorders></w:tblPr><w:tblGrid>' +
    '<w:gridCol w:w="4000"/></w:tblGrid><w:tr><w:tc><w:tcPr>' +
    '<w:tcW w:w="4000" w:type="dxa"/></w:tcPr>' + p(r('A table in ' +
    'section three')) + '</w:tc></w:tr></w:tbl>';
  const body = [
    p(r('Section one: the first paragraph.')),
    p(r('Section one: the second paragraph, cut here. DELETED'),
      sect(false)),
    p(r('Section two (landscape): DELETED, all of it.'), sect(true)),
    p(r('Section three: DELETED up to here, this half stays.')),
    p(r('Section three: the paragraph before the table.')),
    TBL,
    p(r('Section three: after the table, DELETED.'), sect(false)),
    p(r('Section four: DELETED words, the rest stays.')),
    p(r('The end.')),
  ].join('') + sect(false);
  const bytes = await buildDocx({
    'word/document.xml': documentXml(body),
    'word/styles.xml': part('word/styles.xml'),
    'word/settings.xml': part('word/settings.xml'),
    'docProps/core.xml': part('docProps/core.xml'),
    'docProps/app.xml': part('docProps/app.xml'),
  }, {pkgRels: [['rId1', REL('officeDocument'), 'word/document.xml'],
    ['rId2', 'http://schemas.openxmlformats.org/package/2006/' +
      'relationships/metadata/core-properties', 'docProps/core.xml'],
    ['rId3', REL('extended-properties'), 'docProps/app.xml']]});
  const s = session(await readDocx(bytes));
  const {d} = s;
  let c = s.select(s.pos('Section one: the second', 'cut here.'),
    s.pos('Section three: DELETED', 'up to here,'));
  c = s.cmd(() => X.deleteSelection(d, c));
  const box = s.boxAfter('Section three: the paragraph before');
  c = s.select({id: box, off: 1},
    s.pos('Section four', 'DELETED words,'));
  s.cmd(() => X.deleteSelection(d, c));
  await save('typed-4-sections.docx', d.doc, [
    'Four sections (one portrait page each, section two landscape).',
    'Two selections were deleted, each across a section break; !Word',
    'cannot delete a section break yet, so it keeps them all:',
    ' 1. from "cut here." in section one to "up to here," in section',
    '    three: the text joins in section one ("...cut here. this',
    '    half stays."); section two, left with nothing, keeps ONE',
    '    EMPTY paragraph (the "ghost section" rule: every section',
    '    keeps a paragraph); section three loses its first paragraph;',
    ' 2. from just after the table in section three to "DELETED',
    '    words," in section four: the paragraph after the table goes,',
    '    and section three ends with a NEW empty paragraph after the',
    '    table (it carries the section break, as Word requires).',
    'Word should show: page 1 portrait (two paragraphs), page 2',
    'landscape with one empty paragraph, page 3 portrait ("the',
    'paragraph before the table", the table, an empty paragraph), page',
    '4 portrait (" the rest stays." and "The end.").',
  ]);
}

// ------------------------------------------------------------ README

const README = [
  '!Word typing hand-off (local only, not committed)',
  '=================================================',
  '',
  'Made by: node tests/moreapps/handoff-typing.mjs (re-run it after',
  'changing !Word; files whose bytes are the same are not rewritten).',
  'Every file is a document edited with !Word\'s own editing commands',
  '(typing, Enter, Shift-Enter, Tab, Backspace, Delete, Ctrl-Backspace,',
  'deleting a selection, undo and redo) and saved by !Word. Open each',
  'in real Word: note any repair prompt or error, and whether what you',
  'see matches the description. Then the open questions below: they',
  'are where !Word copies what Word is believed to do, unverified.',
  '(handoff.mjs, the older generator in this folder, no longer',
  'removes files it did not make.)',
  '',
  'Open questions (please try each in real Word and write down what',
  'Word does):',
  '',
  'Q1 Merge rule. Backspace at the start of a paragraph joins it to',
  '   the one before. !Word: the FIRST paragraph keeps its style and',
  '   properties (typed-2 h: the bullet before survives), except when',
  '   the first is EMPTY and the second is not: then the empty one is',
  '   removed and the second keeps its own (typed-2 j: the empty',
  '   Heading 2 goes, "Name:" stays Normal). In Word: type two',
  '   paragraphs, a Heading 1 then a Normal one, put the caret at the',
  '   start of the Normal one, Backspace: Heading 1 or Normal? Then',
  '   empty the heading and Backspace again from the Normal one.',
  'Q2 Next style after a heading. Enter at the END of a heading:',
  '   !Word makes the new paragraph the heading\'s "next" style',
  '   (Normal: typed-2 d); in the MIDDLE both halves stay headings.',
  '   Is that Word\'s behaviour (also for Title, Heading 2..6)?',
  'Q3 Ctrl-Backspace reach. !Word deletes back to the start of the',
  '   word before the caret, a run of punctuation counting as a word',
  '   (typed-2 b: what the paragraph is left with is listed below).',
  '   In Word: at the end of "and plain again." press Ctrl-Backspace',
  '   twice: what is left?',
  'Q4 Deleting across a section break. Word deletes the section',
  '   break with the selection (the sections merge); !Word cannot yet',
  '   and keeps every break, leaving an empty paragraph in an emptied',
  '   section and after a table that ended a section (typed-4). Do',
  '   the pages of typed-4 look as described, with no repair prompt?',
  'Q5 Undo granularity. !Word: one undo step per typed word with the',
  '   spaces after it; a pause of more than a second, moving the',
  '   caret, Enter, Tab or any other command starts a new step; each',
  '   Backspace is one step. In Word: type "First words typed. ",',
  '   wait, "More words.", Enter, "A second paragraph that will be',
  '   undone.", 5 Backspaces, then press Ctrl-Z once at a time: what',
  '   does each Ctrl-Z take away? (compare typed-3)',
  'Q6 Typing after a hyperlink. !Word: text typed right after a',
  '   hyperlink is plain text after it (typed-2 c). In Word: click',
  '   just after a link and type: does the text join the link?',
  'Q7 Enter in an empty list item ends the list (typed-2 f: the',
  '   number goes, the style stays List Paragraph), and Shift-Enter',
  '   in a list item stays in the item (typed-2 g): as in Word?',
  ...lines,
  '',
];
const how = put('typed-README.txt', Buffer.from(README.join('\n'),
  'utf8'));
made.push(`typed-README.txt (${how})`);
console.log('hand-off files in ' + OUT + ':\n  ' + made.join('\n  '));
