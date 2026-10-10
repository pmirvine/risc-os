// Writes INDEX.txt: one list of every Batch A and Batch B (pictures)
// real-Word hand-off file
// (local only, never committed: tests/moreapps/corpus/ is git-ignored).
// Not a test:
//
//   node tests/moreapps/handoff-index.mjs
//
// Run the generators first (handoff-spacing, handoff-newlists,
// handoff-breaks, handoff-tabs, handoff-borders, handoff-links,
// handoff-pictures, each `node tests/moreapps/<name>.mjs`); this reads what they wrote in
// tests/moreapps/corpus/handoff/ and says, by deliverable, which file
// to open, which README has its questions, and what to try, in the
// order for one session in real Word. For every file that exists it
// gives the size and the word count !Word shows (Edit > Word count,
// whole document) to compare with Word's, and for the pictures the
// number of pictures !Word reads in it. A file that is listed but
// missing is reported (and left out of the counts); nothing else in
// the folder is touched. INDEX.txt is written only when its bytes
// change.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {count} from '../../tools/moreapps/!Word/WordCount';
import {pictureOf, docMap} from '../../tools/moreapps/!Word/PicRead';

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
  {id: 'B', title: 'Pictures', readme: 'pic-README.txt', extra: 'PI*',
    expect: ['!Word expects: no repair prompt for any of these files; each',
      'picture at the size, docPr id and alt text pic-README.txt lists',
      'under "What !Word wrote"; 16 questions (PI1..PI9, PI*, P1..P6),',
      'of which PI9, PI* and P1..P5 have no file. Order: steps 1 to 8',
      'of pic-README.txt, the files in the order below.'],
    pics: true,
    files: [
      ['pic-1-inserted.docx', 'PNG, JPEG and GIF from Insert > Picture...: sizes in Size and Position (PI1)'],
      ['pic-2-resized.docx', 'a corner and an edge resize, alt text: Word shows 3 x 1.5 in and 2 x 2 in (PI2)'],
      ['pic-2b-real.docx', 'a Word-made picture resized and given alt text in !Word (PI2)'],
      ['pic-3-strict.docx', 'a Strict document with a picture: opens and stays Strict (PI3)'],
      ['pic-4-dpi.docx', 'Size > Reset equals !Word\'s natural sizes for 300, 72 dpi and dpcm (PI4)'],
      ['pic-5-floating.docx', 'a floating picture keeps its place and wrap; alt text set (PI5)'],
      ['pic-6-source.docx', 'where the pasted picture came from (PI8)'],
      ['pic-6-pasted.docx', 'duplicate docPr ids kept, pasted pictures with fresh ids, crop and alt text (PI6, PI8, P6)'],
      ['pic-7-deleted.docx', 'a deleted picture\'s media part and relationship left: no repair (PI7)']]},
];

/** The pictures !Word reads in doc (every paragraph, any kind). */
function picCount(doc) {
  const map = docMap(doc);
  let k = 0;
  for (const s of doc.sections) {
    for (const b of s.blocks) {
      if (b.type !== 'p') continue;
      for (const x of Object.values(b.inlines)) {
        if (x && x.kind === 'raw' && pictureOf(x.node, map)) k++;
      }
    }
  }
  return k;
}

/** The question ids a README holds, in ranges (BD1..BD10, SY1..SY5). */
function questions(text) {
  const by = new Map();
  for (const m of text.matchAll(/^(?:  )?([A-Z]{1,3})(\d+)\s/gm)) {
    if (!by.has(m[1])) by.set(m[1], []);
    by.get(m[1]).push(Number(m[2]));
  }
  return [...by].map(([p, ns]) => {
    ns.sort((a, b) => a - b);
    return ns.length === 1 ? p + ns[0] : `${p}${ns[0]}..${p}${ns[ns.length - 1]}`;
  }).join(' ');
}

const out = [
  'Batch A and B hand-off for real Word: every file, by deliverable',
  '=================================================================',
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
  '2. Then go deliverable by deliverable (A1 to A6, then B, the',
  '   pictures), reading the',
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
  if (fs.existsSync(rp)) {
    qs = questions(fs.readFileSync(rp, 'utf8')) +
      (set.extra ? ' ' + set.extra : '');
  } else missing.push(set.readme);
  out.push(`README: ${set.readme}   questions: ${qs}`, '');
  if (set.expect) out.push(...set.expect.map((l) => '  ' + l), '');
  for (const [name, what] of set.files) {
    const f = path.join(DIR, name);
    if (!fs.existsSync(f)) {
      missing.push(name);
      out.push(`  ${String(++n).padStart(2)}. ${name}   (MISSING: run its generator)`);
      continue;
    }
    const bytes = fs.readFileSync(f);
    const doc = await readDocx(new Uint8Array(bytes));
    const c = count(doc);
    out.push(`  ${String(++n).padStart(2)}. ${name}   (${bytes.length} bytes)`,
      `      try: ${what}`,
      `      !Word counts: ${c.words} words, ${c.charsNoSpaces} characters ` +
      `without spaces, ${c.chars} with, ${c.paras} paragraphs` +
      (set.pics ? `, ${picCount(doc)} pictures` : ''));
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
