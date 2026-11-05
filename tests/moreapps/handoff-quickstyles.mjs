// Generates the real-Word hand-off files for !Letters' quick styles
// (Subtitle, Quote, Emphasis... and the Word 2013+ look of Heading
// 1-6 and Title: ./StylesBuiltinMore). Local only, never committed:
// tests/moreapps/corpus/ is git-ignored. Not a test:
//
//   node tests/moreapps/handoff-quickstyles.mjs
//
// Writes into tests/moreapps/corpus/handoff/ (made if missing):
//   st2-1.docx      a new document, every quick style applied with
//                   !Letters' own command (./StyleApply applyStyle:
//                   the style and its linked half added on first use)
//   st2-2.docx      a Word-made document (open-xml-sdk Plain.docx
//                   from the corpus, Word 2013, Office theme) whose
//                   styles part lacks Title and Heading 1-3: its own
//                   paragraph, then the same text in Title, Heading 1,
//                   Heading 2 and Heading 3, added by !Letters
//   st2-README.txt  what Word should show, the questions (Q1..)
// A file is written only when its bytes change, so a file open in
// Word is left alone; nothing else in the folder is touched.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {newDoc} from '../../tools/moreapps/!Letters/NewDoc';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import {applyStyle} from '../../tools/moreapps/!Letters/StyleApply';
import {display} from '../../tools/moreapps/!Letters/StyleName';
import * as S from '../../tools/moreapps/!Letters/Selection';
import * as E from '../../tools/moreapps/!Letters/Edit';

const HERE = fileURLToPath(new URL('./', import.meta.url));
const OUT = path.join(HERE, 'corpus', 'handoff');
const REF = path.join(HERE, 'corpus', 'open-xml-sdk', 'test',
  'DocumentFormat.OpenXml.Tests.Assets', 'assets', 'TestFiles',
  'Plain.docx');
const DATE = new Date(Date.UTC(2026, 10, 4, 12));
fs.mkdirSync(OUT, {recursive: true});

function put(name, bytes) {
  const f = path.join(OUT, name);
  const b = Buffer.from(bytes);
  if (fs.existsSync(f) && fs.readFileSync(f).equals(b)) return 'same';
  fs.writeFileSync(f, b);
  return 'written';
}

/** A session: type lines, apply styles, each as the user would. */
function session(doc) {
  const d = new Document(doc);
  d.clearHistory();
  let now = 0;
  const t = new Typing(d, {now: () => now});
  const all = () => d.doc.sections.flatMap((s) => s.blocks)
    .filter((b) => b.type === 'p');
  return {
    d, all,
    lines(texts, after) {
      const last = after || all()[all().length - 1];
      let c = S.caret({id: last.id, off: last.text.length});
      texts.forEach((x, k) => {
        if (k || after || last.text) {
          now += 2000;
          c = t.command(() => E.splitPara(d, c));
        }
        for (const ch of x) { now += 50; c = t.type(c, ch); }
      });
    },
    apply(k, id, from, to) {
      now += 2000;
      const p = all()[k];
      const sel = from === undefined
        ? S.caret({id: p.id, off: 0})
        : S.select({id: p.id, off: from}, {id: p.id, off: to});
      applyStyle(d, t, sel, id);
    },
  };
}

const say = [];
async function save(name, doc) {
  const bytes = await writeDocx(doc, {date: DATE});
  const back = await readDocx(bytes);
  const out = [`${name} (${bytes.length} bytes, ${put(name, bytes)})`];
  for (const p of back.sections.flatMap((s) => s.blocks)) {
    if (p.type !== 'p') continue;
    const st = back.styles.styles.get(p.pStyle || 'Normal');
    const runs = (p.runs || []).filter((r) => r.rStyle).map((r) =>
      `[${display(back.styles.styles.get(r.rStyle))}: ` +
      `${p.text.slice(r.start, r.end)}]`);
    out.push(`  ${(st ? display(st) : '?').padEnd(14)} ` +
      `${p.text.slice(0, 48)}${runs.length ? '  ' + runs.join(' ')
        : ''}`);
  }
  say.push(...out, '');
}

// -------------------------------------------- st2-1: every quick style
{
  const s = session(newDoc({date: DATE}));
  const paras = [['Title', 'Title: The quick styles'],
    ['Subtitle', 'Subtitle: as Word 2013-2021 makes them'],
    ['Heading1', 'Heading 1: a chapter'],
    ['Heading2', 'Heading 2: a section'],
    ['Heading3', 'Heading 3: a subsection'],
    ['Heading4', 'Heading 4: a smaller heading'],
    ['Heading5', 'Heading 5: a smaller heading'],
    ['Heading6', 'Heading 6: the smallest heading'],
    ['Normal', 'Normal: plain text between the headings.'],
    ['Quote', 'Quote: a quotation, centred and indented.'],
    ['IntenseQuote', 'Intense Quote: with lines above and below.'],
    ['NoSpacing', 'No Spacing: line one of an address'],
    ['NoSpacing', 'No Spacing: line two of an address'],
    ['BodyText', 'Body Text: a paragraph with 6 pt after.']];
  const chars = ['Emphasis', 'Strong', 'Subtle Emphasis',
    'Intense Emphasis', 'Subtle Reference', 'Intense Reference',
    'Book Title'];
  const runLine = 'Character styles: ' + chars.join(', ') + '.';
  s.lines([...paras.map(([, x]) => x), runLine]);
  paras.forEach(([id], k) => { if (id !== 'Normal') s.apply(k, id); });
  const k = paras.length, text = s.all()[k].text;
  for (const name of chars) {
    const at = text.indexOf(' ' + name) + 1;
    s.apply(k, name.replace(/ /g, ''), at, at + name.length);
  }
  await save('st2-1.docx', s.d.doc);
}

// ---------------------------------- st2-2: new headings in a Word file
if (fs.existsSync(REF)) {
  const doc = await readDocx(new Uint8Array(fs.readFileSync(REF)));
  for (const n of ['title', 'heading 1', 'heading 2', 'heading 3']) {
    if ([...doc.styles.styles.values()].some((x) =>
      String(x.name).toLowerCase() === n))
      throw new Error('Plain.docx has ' + n);
  }
  const s = session(doc);
  const first = s.all()[0];
  const same = first.text.replace(/\uFFFC/g, '').split('. ')[0] + '.';
  s.lines([same, same, same, same], first);
  ['Title', 'Heading1', 'Heading2', 'Heading3'].forEach((id, k) =>
    s.apply(k + 1, id));
  await save('st2-2.docx', s.d.doc);
} else {
  say.push('st2-2.docx not written: the corpus file Plain.docx is ' +
    'missing (node tools/moreapps-corpus.mjs)', '');
}

const README = `st2 hand-off: Word's quick styles in !Letters
=============================================

Written by node tests/moreapps/handoff-quickstyles.mjs. New documents
carry the Office theme (Calibri Light / Calibri, blue accent 4472C4);
the definitions are Word 2013-2021's for that theme, as found in
Word-made files (not the larger Aptos look of Microsoft 365 since
2023). Close both files before running the script again.

st2-1.docx: a new !Letters document, every quick style applied with
!Letters' own commands (the style, and its "... Char" half for
Subtitle, Quote, Intense Quote and Body Text, added on first use).
st2-2.docx: the Word-made Plain.docx (Word 2013, no Title or
Heading 1-3 in its styles; one paragraph in Normal, kept as Word
wrote it), then the first sentence of it again in Title, Heading 1,
Heading 2 and Heading 3, the styles added by !Letters.

What was written (read back from the files):

${say.join('\n')}
Questions (answer Q1.. with yes / no and what differs):

Q1  st2-1: open the Styles gallery (Home). Does each paragraph and
    each marked word look as the same style's thumbnail in the
    gallery, and as you know it from Word 2016-2021? (Title 28 pt
    Calibri Light, tight letters; Subtitle grey 11 pt with wider
    letters; Heading 1 16 pt blue, 2 13 pt blue, 3 12 pt dark blue,
    4 italic blue, 5 blue, 6 dark blue, all Calibri Light; Quote
    grey italic, centred, indented 0.6" each side; Intense Quote
    blue italic between two blue lines; Emphasis italic; Strong
    bold; Subtle Emphasis grey italic; Intense Emphasis blue italic;
    Subtle Reference grey small capitals; Intense Reference blue bold
    small capitals; Book Title bold italic; No Spacing lines with no
    space between them; Body Text 6 pt after.)
Q2  st2-1: Home > Styles pane (Alt+Ctrl+Shift+S): is each one shown
    under Word's own name (Quote, not "Quote 1" or a second Quote),
    and does Word treat it as its built-in (no "Delete" for Quote;
    "Modify" shows it based on Normal / Default Paragraph Font)?
Q3  st2-1: in the Styles pane with "Show Preview", are Quote Char,
    Subtitle Char, Intense Quote Char and Body Text Char hidden
    behind their paragraph styles (linked), as in a Word document?
Q4  st2-1: does the Subtitle paragraph show a number or a bullet?
    (It should not: Word's Subtitle sits at list level 2 without a
    list.) Apply a numbered list to it: does it go to level 2, as
    with Word's own Subtitle?
Q5  st2-2: are the four added paragraphs (Title, Heading 1-3) shown
    as Word 2013-2021's Title and Heading 1-3 (compare with a
    document from Word 2016-2021 or with Bug64561.docx in the
    corpus, poi folder)? Does the Navigation pane list Heading 1-3?
Q6  st2-1 and st2-2: save in Word, close, reopen: any message?
`;
put('st2-README.txt', README);
console.log(say.join('\n'));
