// Hand-off files of tables across pages and Page setup (see
// handoff-pages.mjs): pg-7 (a keep-with-next table), pg-8 (split
// rows: vAlign centre cells, the borders at the cut, an atLeast row
// whose box does not fit, a vertical merge across a page end), pg-10
// (repeated header rows, nested tables at a page end and taller than
// a page) and pg-setup (every Page setup and Layout control, made by
// !Letters' commands on a new document).
import {insertSection} from '../../tools/moreapps/!Letters/SectBreak';
import {setupCmd, layoutCmd} from '../../tools/moreapps/!Letters/SectSetup';
import {mk} from './edit-docs.mjs';
import {car, end, must, LOOK} from './handoff-tables-lib.mjs';
import {p, r, tbl, tr, tc, fixture, save, EXACT, line, lines, say,
  breakLine, PAGE_LINES, NOW} from './handoff-pages-lib.mjs';

const TG = '<w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" ' +
  'w:type="auto"/>' + LOOK;
const W = (w) => `<w:tcW w:w="${w}" w:type="dxa"/>`;
/** A cell of exact lines (texts), tcPr extra after tcW. */
const cellOf = (texts, w = 4513, extra = '', pPr = '') => tc(texts.map(
  (t) => p(r(t), pPr + EXACT())).join(''), {tcPr: W(w) + extra});
const nums = (label, n, from = 1) => Array.from({length: n}, (_, i) =>
  `${label} ${i + from}`);
const grid2 = {tblPr: TG, grid: [4513, 4513]};
/** n rows of two one-line cells `label r.c`. */
const rows = (label, n, pPr = '', from = 1) => Array.from({length: n},
  (_, i) => tr([1, 2].map((c) => cellOf([`${label} ${i + from}.${c}`],
    4513, '', pPr))));

// ------------------------------------------------------ pg-7
async function keepTable() {
  const KN = '<w:keepNext/>';
  const body = [
    say('Table 0: 8 rows, every paragraph keep with next; room for 6'),
    lines('Filler line', PAGE_LINES - 7),
    tbl(rows('Kept row', 8, KN), grid2),
    line('The paragraph after table 0'),
    breakLine('(page break)'),
    say('Table 1: the same 8 rows WITHOUT keep with next; room for 6'),
    lines('Filler line', PAGE_LINES - 7, 100),
    tbl(rows('Plain row', 8), grid2),
    line('The paragraph after table 1'),
  ];
  const d = await fixture(body.join(''));
  await save('pg-7-keeptable.docx', d, {note: 'rows of one exact 12 pt ' +
    'line a cell'});
}

// ------------------------------------------------------ pg-8
const bd = (n, color) => `<w:${n} w:val="single" w:sz="18" w:space="0" ` +
  `w:color="${color}"/>`;
const RED_BLUE = '<w:tcBorders>' + bd('top', 'C00000') +
  bd('bottom', '0070C0') + '</w:tcBorders>';
async function splitRow() {
  const body = [
    say('Table 0 (PG8, PG9, PG35): row 2 is cut by the page end'),
    lines('Filler line', PAGE_LINES - 13),
    tbl([tr([cellOf(['Row 1, column 1']), cellOf(['Row 1, column 2'])]),
      tr([cellOf(nums('Column 1 (top) line', 30), 4513, RED_BLUE),
        cellOf(nums('Column 2 (vAlign centre) line', 3), 4513, RED_BLUE +
          '<w:vAlign w:val="center"/>')]),
      tr([cellOf(['Row 3, column 1']), cellOf(['Row 3, column 2'])])],
    grid2),
    breakLine('After table 0 (page break)'),
    say('Table 1 (PGX3): row 2 is at least 2 in high, one line of text; ' +
      'room for 6 lines'),
    lines('Filler line', PAGE_LINES - 8, 100),
    tbl([tr([cellOf(['Row 1']), cellOf(['Row 1'])]),
      tr([cellOf(['Row 2: the text fits, the box does not']),
        cellOf(['Row 2'])], {trPr: '<w:trHeight w:val="2880" ' +
        'w:hRule="atLeast"/>'}),
      tr([cellOf(['Row 3']), cellOf(['Row 3'])])], grid2),
    breakLine('After table 1 (page break)'),
    say('Table 2 (PGX3): row 2 is at least 10.5 in high: taller than ' +
      'the page\'s text'),
    lines('Filler line', 20, 200),
    tbl([tr([cellOf(['Row 1']), cellOf(['Row 1'])]),
      tr([cellOf(['Row 2: one line in a row 10.5 in high']),
        cellOf(['Row 2'])], {trPr: '<w:trHeight w:val="15120" ' +
        'w:hRule="atLeast"/>'}),
      tr([cellOf(['Row 3']), cellOf(['Row 3'])])], grid2),
    breakLine('After table 2 (page break)'),
    say('Table 3 (PGX4): column 1 is merged down rows 1 to 3 and holds ' +
      '30 lines'),
    lines('Filler line', 40, 300),
    tbl([0, 1, 2].map((i) => tr([i === 0 ? cellOf(nums('Merged line', 30),
      4513, '<w:vMerge w:val="restart"/>') : cellOf([''], 4513,
      '<w:vMerge/>'), cellOf(nums(`Row ${i + 1}, line`, 4))])), grid2),
    line('After table 3'),
  ];
  const d = await fixture(body.join(''));
  await save('pg-8-splitrow.docx', d, {note: 'Table 0 row 2: a red top ' +
    'and a blue bottom border (2.25 pt) on both cells'});
}

// ------------------------------------------------------ pg-10
const HDR = '<w:tblHeader/>';
const SHADE = '<w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/>';
async function headers() {
  const head = (i) => tr([1, 2].map((c) => cellOf([`Header row ${i}, ` +
    `column ${c}`], 4513, SHADE)), {trPr: HDR});
  const nested = (label, n) => tbl(rows(label, n), {tblPr: TG,
    grid: [2000, 2000]});
  const body = [
    say('Table 0 (PG10): two header rows (Repeat as header row), 90 rows'),
    tbl([head(1), head(2), ...rows('Body row', 90)], grid2),
    breakLine('After table 0 (page break)'),
    say('Table 1 (PG11): column 1 holds 10 lines, a nested table of 12 ' +
      'rows and 2 lines; room for 17 lines'),
    lines('Filler line', PAGE_LINES - 18),
    tbl([tr([tc(nums('Outer line', 10).map((t) => p(r(t), EXACT()))
      .join('') + nested('Nested row', 12) + p(r('Outer line 11'),
      EXACT()) + p(r('Outer line 12'), EXACT()), {tcPr: W(4513)}),
    cellOf(nums('Column 2 line', 25))])], grid2),
    breakLine('After table 1 (page break)'),
    say('Table 2 (PG11a): one cell holds a nested table of 80 rows, ' +
      'taller than a page'),
    tbl([tr([tc(p(r('Before the nested table'), EXACT()) +
      nested('Tall nested row', 80) + p(r('After the nested table'),
      EXACT()), {tcPr: W(9026)})])], {tblPr: TG, grid: [9026]}),
    line('After table 2'),
  ];
  const d = await fixture(body.join(''));
  await save('pg-10-headers.docx', d, {note: 'header rows shaded blue; ' +
    'nested tables are Table Grid, 2 x 1 in'});
}

// ------------------------------------------------------ pg-setup
async function setup() {
  const S = [
    'Section 1: Page setup, Whole document: Letter, left and right 1.25 ' +
    'in; then This section: Gutter 0.5 in, Gutter position Top.',
    'Section 2 (Insert > Section break > Next page): This section ' +
    'Landscape, top and bottom 0.75 in.',
    'Section 3 (Odd page break): A5 portrait, Layout: Different first ' +
    'page, header 0.6 in, footer 0.4 in from the edge.',
    'Section 4 (Even page break): B5 (JIS), Layout: vertical alignment ' +
    'Centre.',
    'Section 5 (Continuous break, then Layout: Section start Even page)' +
    ': A4, an EXACT top margin of 1.5 in (-2160).',
    'Section 6: This point forward from the middle of this paragraph: ' +
    'Legal, every margin 1 in, vertical alignment Bottom; the document ' +
    'gets Different odd and even.',
  ];
  const d = mk(S);
  const t = (i) => S[i - 1];
  const at = (i) => car(d, t(i));
  const set = (i, v, scope = 'section') => must(`setup ${i}`,
    setupCmd(d, at(i), v, scope));
  const lay = (i, v) => must(`layout ${i}`, layoutCmd(d, at(i), v));
  set(1, {w: 12240, h: 15840, left: 1800, right: 1800}, 'all');
  [[1, 'nextPage'], [2, 'oddPage'], [3, 'evenPage'], [4, 'continuous']]
    .forEach(([i, type]) => must('break', insertSection(d, NOW, end(d,
      t(i)), type)));
  set(1, {gutter: 720, gutterTop: true});
  set(2, {orient: 'landscape', top: 1080, bottom: 1080});
  set(3, {w: 8391, h: 11906});
  lay(3, {titlePg: true, header: 864, footer: 576});
  set(4, {w: 10319, h: 14571});
  lay(4, {vAlign: 'center'});
  set(5, {w: 11906, h: 16838, top: -2160});
  lay(5, {type: 'evenPage'});
  const cut = t(6).indexOf('from the middle') + 9;
  must('forward', setupCmd(d, car(d, t(6), cut), {w: 12240, h: 20160,
    top: 1440, bottom: 1440, left: 1440, right: 1440}, 'forward'));
  must('layout 6', layoutCmd(d, car(d, t(6).slice(cut)),
    {vAlign: 'bottom', evenOdd: true}));
  await save('pg-setup.docx', d, {note: 'a new !Letters document; every ' +
    'change made by Format > Page setup... (setupCmd), Format > ' +
    'Layout... (layoutCmd) and Insert > Section break'});
}

export async function makeB() {
  await keepTable();
  await splitRow();
  await headers();
  await setup();
}
