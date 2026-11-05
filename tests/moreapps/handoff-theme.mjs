// Generates the real-Word hand-off files for !Letters' theme editing
// (theme fonts and colours, the Design menu, theme swatches). Local
// only, never committed: tests/moreapps/corpus/ is git-ignored. Not a
// test:
//
//   node tests/moreapps/handoff-theme.mjs
//
// Writes into tests/moreapps/corpus/handoff/ (made if missing):
//   st3-1.docx    colour scheme Paper, font pair Garamond; headings
//                 and one line of text per theme swatch (60), each
//                 coloured with its theme reference
//   st3-2.docx    a custom colour scheme with a non-ASCII name and
//                 the font pair Arial Black / Arial, the same text
//   st3-README.txt what to look at in Word and what is unconfirmed
// Made with !Letters' own commands (./ThemeDoc, FormatApply
// themeColor) on a Document. A file is written only when its bytes
// change, so a file open in Word is left alone.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeDocx} from '../../tools/moreapps/!Letters/DocxWrite';
import {newDoc} from '../../tools/moreapps/!Letters/NewDoc';
import {newPara} from '../../tools/moreapps/!Letters/Model';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {Typing} from '../../tools/moreapps/!Letters/Typing';
import * as FA from '../../tools/moreapps/!Letters/FormatApply';
import * as S from '../../tools/moreapps/!Letters/Selection';
import * as TD from '../../tools/moreapps/!Letters/ThemeDoc';
import {grid} from '../../tools/moreapps/!Letters/ThemeSwatches';
import {COLOR_SCHEMES, FONT_PAIRS}
  from '../../tools/moreapps/!Letters/ThemePresets';
import {parse} from '../../tools/moreapps/!Letters/ThemeRead';
import {THEME_PART} from '../../tools/moreapps/!Letters/OpsTheme';

const OUT = fileURLToPath(new URL('./corpus/handoff/', import.meta.url));
const DATE = new Date(Date.UTC(2026, 10, 5, 12));
fs.mkdirSync(OUT, {recursive: true});

/** Write bytes to name unless the file already holds them. */
function put(name, bytes) {
  const f = path.join(OUT, name);
  const b = Buffer.from(bytes);
  if (fs.existsSync(f) && fs.readFileSync(f).equals(b)) return 'same';
  fs.writeFileSync(f, b);
  return 'written';
}
const scheme = (n) => COLOR_SCHEMES.find((s) => s.name === n);
const pair = (n) => FONT_PAIRS.find((s) => s.name === n);

/** A document with the headings and one coloured line per swatch. */
function build(title, colours, fonts) {
  const doc = newDoc({date: DATE});
  const d = new Document(doc);
  const lines = [];
  if (TD.setColors(d, colours).refused) throw new Error('colours');
  if (TD.setFonts(d, fonts).refused) throw new Error('fonts');
  const theme = parse(d.doc.parts.get(THEME_PART));
  const cells = grid(theme).flat();
  const blocks = [newPara(title, {pStyle: 'Title'}),
    newPara('Heading 1 in the theme heading font', {pStyle: 'Heading1'}),
    newPara('Body text in the theme body font: the quick brown fox ' +
      'jumps over the lazy dog.'),
    newPara('Heading 2 in the theme heading font',
      {pStyle: 'Heading2'}),
    newPara('Each line below is coloured with a theme swatch (Font ' +
      'Color > Theme Colors); the hex is what Letters computes.')];
  cells.forEach((c, i) => {
    const row = Math.floor(i / 10), col = i % 10;
    const r = c.ref;
    const how = [r.themeColor, r.themeTint ? 'tint ' + r.themeTint
      : '', r.themeShade ? 'shade ' + r.themeShade : '']
      .filter(Boolean).join(' ');
    blocks.push(newPara(`r${row + 1}c${col + 1} ${c.name}: ` +
      `${how} = ${c.rgb}`));
    lines.push([blocks.length - 1, r]);
  });
  d.doc.sections[0].blocks = blocks;
  d.clearHistory();
  const t = new Typing(d);
  for (const [k, ref] of lines) {
    const p = d.doc.sections[0].blocks[k];
    FA.apply('themeColor', d, t, S.select({id: p.id, off: 0},
      {id: p.id, off: p.text.length}), ref);
  }
  return d;
}

const files = [
  ['st3-1.docx', 'Paper', 'Garamond', 'Theme hand-off 1: Paper, Garamond'],
  ['st3-2.docx', null, 'Arial Black-Arial',
    'Theme hand-off 2: custom colours, Arial Black / Arial'],
];
const made = [], facts = [];
for (const [name, sc, fp, title] of files) {
  let colours = scheme(sc);
  if (!colours) {
    const o = scheme('Office 2013 - 2022');
    colours = {name: 'Café à la crème',
      slots: {...o.slots, accent1: '1F7A5C', accent2: 'C0392B',
        dk2: '3B2F2F', lt2: 'F4ECE1'}};
  }
  const d = build(title, colours, pair(fp));
  const bytes = await writeDocx(d.doc, {date: DATE});
  made.push(`${name} (${put(name, bytes)})`);
  const th = parse(d.doc.parts.get(THEME_PART));
  facts.push(`${name}: scheme "${colours.name}", fonts ` +
    `${th.major} / ${th.minor}; accent1 ${th.colors.get('accent1')}`);
}

const README = [
  'Theme editing hand-off files (st3-1.docx, st3-2.docx)',
  '=====================================================',
  '',
  'Made by !Letters with Design > Colours / Fonts (or the Customize',
  'boxes) and text coloured with the theme swatches. Open each in',
  'Word. Nothing here has been seen in Word yet beyond "it opens".',
  '',
  ...facts.map((f) => '  ' + f),
  '',
  'What to look at',
  '---------------',
  '1. Both files open with no repair message.',
  '2. Design > Colors and Design > Fonts show the scheme and the',
  '   font pair named above as the current choice (st3-2 shows a',
  '   custom set; its colour set is named Cafe a la creme with',
  '   accents). Word\'s own names are the check that !Letters wrote',
  '   Word\'s presets exactly.',
  '3. The Title, Heading 1 and Heading 2 lines use the theme',
  '   heading font; the body text the theme body font.',
  '4. Each coloured line: click it and open Font Color. The theme',
  '   cell Word marks should be the one named in the line (accent',
  '   and shade or tint). The hex in the line is what !Letters',
  '   computes; hover the cell in Word and compare the colour.',
  '5. Switch scheme in Design > Colors (try Office 2013 - 2022, Blue Warm and',
  '   Paper): every coloured line follows the new scheme; none stays',
  '   the old colour. Switch back with Edit > Undo.',
  '6. Switch the font pair in Design > Fonts (try Office, Georgia and',
  '   Cambria-Calibri): the headings and the body follow.',
  '',
  'Unconfirmed against Word (please check and say)',
  '-----------------------------------------------',
  'The steps of the swatch grid are from Word\'s own tint/shade',
  'values but the exact cells below are not yet compared with the',
  'ones Word shows:',
  '  - Background 1, darker rows (shade F2, D9, BF, A6, 7F), column',
  '    1: do the hex values match Word\'s Font Color cells?',
  '  - Text 1, lighter rows (tint 7F, A6, BF, D9, F2), column 2.',
  '  - Background 2, darker rows (E6, BF, 7F, 3F, 1A), column 3.',
  '  - Text 2, tints 33 and 66 and shade 7F, column 4.',
  'In particular: the Background 1 F2, BF and A6 rows, the Text 1',
  'F2 row, the Background 2 shades and the Text 2 tints 33 / 66 with',
  'shade 7F. If Word shows a different cell for a line (or a',
  'different colour), note the line (r1c1 to r6c10) and what Word',
  'shows.',
  '',
];
const wrap = (line) => {
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
};
made.push(`st3-README.txt (${put('st3-README.txt', Buffer.from(
  README.flatMap(wrap).join('\n'), 'latin1'))})`);
console.log('hand-off files in ' + OUT + ':\n  ' + made.join('\n  '));
