// Writes INDEX.txt: one list of every Batch A real-Word hand-off file
// (local only, never committed: tests/moreapps/corpus/ is git-ignored).
// Not a test:
//
//   node tests/moreapps/handoff-index.mjs
//
// Run the generators first (handoff-spacing, handoff-newlists,
// handoff-breaks, handoff-tabs, handoff-borders, handoff-links, each
// `node tests/moreapps/<name>.mjs`); this reads what they wrote in
// tests/moreapps/corpus/handoff/ and says, by deliverable, which file
// to open, which README has its questions, and what to try, in the
// order for one session in real Word. For every file that exists it
// gives the size and the word count !Word shows (Edit > Word count,
// whole document) to compare with Word's. A file that is listed but
// missing is reported (and left out of the counts); nothing else in
// the folder is touched. INDEX.txt is written only when its bytes
// change.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {count} from '../../tools/moreapps/!Word/WordCount';

const DIR = fileURLToPath(new URL('./corpus/handoff/', import.meta.url));

const SETS = [
  {id: 'A1', title: 'Paragraph spacing', readme: 'sp-README.txt',
    files: [
      ['sp-1-linespacing.docx', 'line spacing 1.0 to 3, exact and at least: same look in Word?'],
      ['sp-2-before-after.docx', 'space before / after, Ctrl-0, contextual spacing, autospacing'],
      ['sp-3-flow.docx', 'keep with next / lines together, widow control off, page break before']]},
  {id: 'A2', title: 'New bulleted and numbered lists', readme: 'nl-README.txt',
    files: [
      ['nl-1-new-bullets.docx', 'the six gallery bullets, three levels: glyphs, indents'],
      ['nl-2-new-numbers.docx', 'the six numberings, four levels: labels'],
      ['nl-3-restart-continue.docx', 'Restart at 1, Start at 5, Continue across a gap'],
      ['nl-4-existing-part.docx', 'a Word document\'s numbering part extended by two new lists'],
      ['nl-5-autoformat.docx', 'lists made by typing * or 1. and a space']]},
  {id: 'A3', title: 'Page and section breaks', readme: 'brk-README.txt',
    files: [
      ['brk-1-pagebreaks.docx', 'Ctrl-Enter in every place: where does Word start the pages?'],
      ['brk-2-sections.docx', 'Next page and Continuous breaks in a landscape section with header'],
      ['brk-3-deleted.docx', 'breaks put in and taken out again: the merged sections'],
      ['brk-4-flow.docx', 'page break before, keep with next chains, keep lines, widow control']]},
  {id: 'A4', title: 'Tab stops', readme: 'tab-README.txt',
    files: [
      ['tab-1-kinds.docx', 'left, centre, right, decimal and bar stops with each leader'],
      ['tab-2-decimal.docx', 'price list on a decimal stop, contents with dot leaders, hanging indent'],
      ['tab-3-ruler.docx', 'stops as the ruler and Tabs box make them, moved, removed, a style stop cleared'],
      ['tab-4-default.docx', 'default tab stop changed to 1 inch (and a Strict value)']]},
  {id: 'A5', title: 'Borders, shading, symbols, change case', readme: 'bdr-README.txt',
    files: [
      ['bdr-1-boxes.docx', 'a box in each style and width, groups with a between line, different indents'],
      ['bdr-2-shading.docx', 'paragraph and character shading, a highlight over shading, a pattern'],
      ['sym-1-symbols.docx', 'the Symbol sets, no-break space, non-breaking and optional hyphen'],
      ['case-1.docx', 'each Change case mode and the Shift-F3 cycle on one text']]},
  {id: 'A6', title: 'Hyperlinks, bookmarks, format painter, word count', readme: 'lnk-README.txt',
    files: [
      ['lnk-1-links.docx', 'web, mail, ftp, www., ScreenTip, formatted, anchor links; one edited, one removed'],
      ['bm-1-bookmarks.docx', 'bookmarks over words, paragraphs, a caret, nested, overlapping, moved; hidden ones'],
      ['paint-1.docx', 'the format painter: a drag, a replaced format, a paragraph format, a list item']]},
];

/** The question ids a README holds, in ranges (BD1..BD10, SY1..SY5). */
function questions(text) {
  const by = new Map();
  for (const m of text.matchAll(/^([A-Z]{1,3})(\d+)\s/gm)) {
    if (!by.has(m[1])) by.set(m[1], []);
    by.get(m[1]).push(Number(m[2]));
  }
  return [...by].map(([p, ns]) => {
    ns.sort((a, b) => a - b);
    return ns.length === 1 ? p + ns[0] : `${p}${ns[0]}..${p}${ns[ns.length - 1]}`;
  }).join(' ');
}

const out = [
  'Batch A hand-off for real Word: every file, by deliverable',
  '===========================================================',
  '',
  'All of these are made by !Word\'s own commands (the generators are',
  'tests/moreapps/handoff-*.mjs; this list by handoff-index.mjs) and',
  'live only here: this folder is never committed. Open each file in',
  'real Word, note any repair prompt, compare what you see with the',
  'description in its README, and answer the README\'s questions. The',
  'READMEs also list, paragraph by paragraph, what !Word really wrote.',
  '',
  'Suggested order for one session',
  '-------------------------------',
  '1. Smoke test: open EVERY file below in Word once and note only',
  '   whether Word complains (a repair prompt, "unreadable content").',
  '   Any complaint is the most valuable finding: write down the file.',
  '2. Then go deliverable by deliverable (A1 to A6), reading the',
  '   README first and answering its questions with the files open.',
  '   Questions with "(No file)" are done by making the thing in Word',
  '   and opening the result in !Word, or the reverse.',
  '3. Word counts: for each file Word\'s Review > Word Count should',
  '   match the figures below (words, characters with and without',
  '   spaces, paragraphs). A difference is question W1..W4 of',
  '   lnk-README.txt; note the file and the figures.',
  '',
];
const missing = [];
let n = 0;
for (const set of SETS) {
  const head = `${set.id}  ${set.title}`;
  out.push(head, '-'.repeat(head.length));
  const rp = path.join(DIR, set.readme);
  let qs = '(README missing)';
  if (fs.existsSync(rp)) qs = questions(fs.readFileSync(rp, 'utf8'));
  else missing.push(set.readme);
  out.push(`README: ${set.readme}   questions: ${qs}`, '');
  for (const [name, what] of set.files) {
    const f = path.join(DIR, name);
    if (!fs.existsSync(f)) {
      missing.push(name);
      out.push(`  ${String(++n).padStart(2)}. ${name}   (MISSING: run its generator)`);
      continue;
    }
    const bytes = fs.readFileSync(f);
    const c = count(await readDocx(new Uint8Array(bytes)));
    out.push(`  ${String(++n).padStart(2)}. ${name}   (${bytes.length} bytes)`,
      `      try: ${what}`,
      `      !Word counts: ${c.words} words, ${c.charsNoSpaces} characters ` +
      `without spaces, ${c.chars} with, ${c.paras} paragraphs`);
  }
  out.push('');
}
out.push('Not covered by any file: the questions marked "(No file)" in the',
  'READMEs, and everything Word does with a link\'s address when you',
  'click it (!Word never opens links).', '');
const text = Buffer.from(out.join('\n'), 'utf8');
const f = path.join(DIR, 'INDEX.txt');
const how = fs.existsSync(f) && fs.readFileSync(f).equals(text) ? 'same' : 'written';
if (how === 'written') fs.writeFileSync(f, text);
console.log(`INDEX.txt (${how}): ${n} files listed` +
  (missing.length ? '; MISSING: ' + missing.join(', ') : ''));
