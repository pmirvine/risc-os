// Generates the real-Word hand-off files for !Letters' starter
// templates. Local only, never committed: tests/moreapps/corpus/ is
// git-ignored. Not a test:
//
//   node tests/moreapps/handoff-starters.mjs
//
// Writes into tests/moreapps/corpus/handoff/ (made if missing):
//   st5-<id>.docx   each of the 16 starters as File > New from
//                   template makes it, saved as a Word document
//   st5-cv-simple.dotx, st5-invoice.dotx   two as Word templates
//   st5-README.txt  what to look at in Word and in !Letters
// A file is written only when its bytes change, so a file open in
// Word is left alone.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {asTemplate} from '../../tools/moreapps/!Letters/Template';
import {STARTERS} from '../../tools/moreapps/!Letters/StarterList';

import {PAGES, rangeText} from './starter-pages.mjs';

const OUT = fileURLToPath(new URL('./corpus/handoff/', import.meta.url));
const DATE = new Date(Date.UTC(2026, 10, 5, 12));
fs.mkdirSync(OUT, {recursive: true});

function put(name, bytes) {
  const f = path.join(OUT, name);
  const b = Buffer.from(bytes);
  if (fs.existsSync(f) && fs.readFileSync(f).equals(b)) return 'same';
  fs.writeFileSync(f, b);
  return 'written';
}

const TEMPLATES = ['cv-simple', 'invoice'];
const done = [];
for (const s of STARTERS) {
  const doc = s.build();
  done.push([`st5-${s.id}.docx`, put(`st5-${s.id}.docx`,
    await writeDocx(doc, {date: DATE}))]);
  if (TEMPLATES.includes(s.id)) {
    const n = `st5-${s.id}.dotx`;
    done.push([n, put(n, await writeDocx(asTemplate(s.build()),
      {date: DATE}))]);
  }
}

const README = [
  'Starter template hand-off files (st5-*.docx, st5-*.dotx)',
  '',
  'The 16 starters of File > New from template in !Letters, each',
  'saved as a Word document, plus two as Word templates (.dotx):',
  ...STARTERS.map((s) => `  st5-${s.id}.docx  ${s.group}: ${s.title}`),
  '  st5-cv-simple.dotx, st5-invoice.dotx',
  '',
  'In Word, for each file, look at:',
  '  1. Does it open without a repair message (the .dotx: does it',
  '     open as a new untitled document)?',
  '  2. Layout and spacing: A4, even margins, nothing cut off or',
  '     running onto an extra page. Expected pages:',
  ...STARTERS.map((s) => `       ${s.title}: ${rangeText(PAGES[s.id])}`),
  '  3. The invoice: the totals line up on the right-aligned tab',
  '     and the table columns fit between the margins.',
  '  4. The report: the cover page has NO header or footer, the',
  '     contents field says to update it (press F9 / Update field),',
  '     and the pages after it carry the "Page x of y" footer.',
  '  5. The newsletter: two columns below the masthead, balanced',
  '     on the page.',
  '  6. Fonts and colours come from the theme: Design > Themes /',
  '     Colours / Fonts should restyle headings and the title.',
  '  7. Every placeholder is in [square brackets] and reads as',
  '     plain prose; spelling is British (colour, organisation).',
  '  8. Whether anything just looks wrong or ugly.',
  '',
  'In !Letters, open the same files (or choose them from File >',
  'New from template) and compare: the same layout, the tab and',
  'right-aligned totals, the report cover without header/footer,',
  'two newsletter columns. Say which, if any, look wrong.',
  '',
];
done.push(['st5-README.txt', put('st5-README.txt', README.join('\n'))]);
for (const [n, r] of done) console.log(r.padEnd(8), n);
