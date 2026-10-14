// Hand-off files of paragraphs and sections (see handoff-pages.mjs):
// pg-1 (30 pages, five fonts), pg-1b (widow control), pg-3 (odd and
// even page breaks), pg-4 (continuous sections of another size),
// pg-5a / pg-5b (space before at a page's top, compatibility 14 and
// 15), pg-6 (vertical alignment), pg-14 (mirror margins), pg-24
// (page borders), pg-36 (line heights of the fonts), pg-38 (border
// boxes split by a page), pg-39 (document grid), pg-40a..c (a page
// break as the last thing), pg-x1 / pg-x2 (margins over the page, a
// page size of 0). Each is read by !Letters and written by it; sections,
// breaks, vertical alignment and page setup are made with !Letters' own
// commands where the question is about them.
import {insertSection} from '../../tools/moreapps/!Letters/SectBreak';
import {setupCmd, layoutCmd} from '../../tools/moreapps/!Letters/SectSetup';
import {car, end, must} from './handoff-tables-lib.mjs';
import {p, r, compat, fixture, save, font, EXACT, line, lines, tall, say,
  breakLine, sectEnd, sect, PAGE_BREAK, PAGE_LINES, NOW}
  from './handoff-pages-lib.mjs';

// ------------------------------------------------------ text
const WORDS = ('the a of and to in is was for on that with as by it at ' +
  'from this which be or an are have were not but had his they ' +
  'page line paragraph section break widow orphan heading table ' +
  'printer column margin gutter number footer header figure ' +
  'document library harbour meadow lantern copper northern quietly ' +
  'gathered measured compared river window garden evening morning ' +
  'station letters seventeen thousand careful simple ordinary').split(' ');
/** n words of deterministic text (seed s), as one sentence or more. */
function text(n, s) {
  let x = s * 2654435761 % 4294967296, out = [];
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    let w = WORDS[x % WORDS.length];
    if (i === 0 || out[out.length - 1].endsWith('.')) {
      w = w[0].toUpperCase() + w.slice(1);
    }
    out.push(w + ((x >> 8) % 11 === 0 && i < n - 1 ? '.' : ''));
  }
  return out.join(' ') + '.';
}
const NORMAL_SINGLE = '<w:spacing w:before="0" w:after="0" ' +
  'w:line="240" w:lineRule="auto"/>';
const H = (n, t) => p(r(t), `<w:pStyle w:val="Heading${n}"/>`);

// ------------------------------------------------------ pg-1
const FONTS = [['Calibri', 11], ['Cambria', 12], ['Arial', 10],
  ['Times New Roman', 12], ['Courier New', 10]];
async function breaks() {
  let k = 0, seed = 1;
  const body = [];
  FONTS.forEach(([f, pt], part) => {
    body.push(H(1, `Part ${part + 1}: ${f} ${pt}`));
    let words = 0, sub = 0;
    while (words < 2400) {
      if (k % 7 === 0) body.push(H(2, `Heading ${part + 1}.${++sub} ` +
        `(keep with next, before P${String(k + 1).padStart(3, '0')})`));
      const n = [8, 25, 60, 140, 12, 95, 40, 180, 30, 70][seed % 10];
      const label = `[P${String(++k).padStart(3, '0')}] `;
      body.push(p(r(label, font(f, pt)) + r(text(n, seed++), font(f, pt))));
      words += n;
    }
    if (part < FONTS.length - 1) body.push(p(PAGE_BREAK));
  });
  const d = await fixture(body.join(''));
  await save('pg-1-breaks.docx', d, {note: `${k} numbered paragraphs ` +
    '[P001].. in five parts (about 30 pages)'});
}

// ------------------------------------------------------ pg-1b
// Each case: a caption and filler fill the page but for `room` exact
// lines, then the paragraph asked about.
const WID = {unset: '', on: '<w:widowControl/>',
  off: '<w:widowControl w:val="0"/>'};
function widowCase(id, what, wc, n, room, last) {
  const fill = PAGE_LINES - room - 1;
  return say(`${id}: ${what}`) + lines(`${id} filler line`, fill) +
    tall(`${id} paragraph of ${n} lines`, n, wc) +
    (last ? line(`${id}: end`) : breakLine(`${id}: end of the case`));
}
async function widows() {
  const body = [
    widowCase('Case A', 'widowControl set nowhere; 3 lines, room for 2',
      WID.unset, 3, 2),
    widowCase('Case B', 'widowControl on; 3 lines, room for 2', WID.on,
      3, 2),
    widowCase('Case C', 'widowControl off; 3 lines, room for 2', WID.off,
      3, 2),
    widowCase('Case D', 'widowControl set nowhere; 5 lines, room for 4',
      WID.unset, 5, 4),
    widowCase('Case E', 'widowControl off; 5 lines, room for 4', WID.off,
      5, 4, true),
  ];
  const d = await fixture(body.join(''));
  await save('pg-1b-widows.docx', d, {note: 'every line exactly 12 pt; ' +
    `a page holds ${PAGE_LINES} lines`});
}

// ------------------------------------------------------ pg-3
async function oddPage() {
  const S = ['Section 1 (page 1).', 'Section 2: after an ODD page break ' +
    'from page 1.', 'Section 3: after an EVEN page break from page 3.',
  'Section 4: after an EVEN page break from page 4.', 'Section 5: ' +
    'after an ODD page break from page 6.'];
  const body = S.map((s, i) => say(s) + lines(`Section ${i + 1} line`, 5))
    .join('');
  const d = await fixture(body);
  const types = ['oddPage', 'evenPage', 'evenPage', 'oddPage'];
  types.forEach((t, i) => must(t, insertSection(d, NOW,
    end(d, `Section ${i + 1} line 5`), t)));
  await save('pg-3-oddpage.docx', d, {note: 'made with Insert > Section ' +
    'break > Odd page / Even page; the footer shows Word\'s page number'});
}

// ------------------------------------------------------ pg-4
async function sizes() {
  const S = ['Section 1: A4 portrait.', 'Section 2: continuous break, ' +
    'A4 LANDSCAPE.', 'Section 3: continuous break, A4 landscape (same ' +
    'size).', 'Section 4: continuous break, A4 portrait again.',
  'Section 5: continuous break, LETTER portrait.', 'Section 6: ' +
    'continuous break, Letter, left margin 2 in (same size).'];
  const body = S.map((s, i) => say(s) + lines(`Section ${i + 1} line`, 4))
    .join('');
  const d = await fixture(body);
  for (let i = 0; i < S.length - 1; i++) {
    must('continuous', insertSection(d, NOW, end(d,
      `Section ${i + 1} line 4`), 'continuous'));
  }
  const set = (i, v) => must('setup ' + i, setupCmd(d, car(d, S[i - 1]),
    v, 'section'));
  set(2, {orient: 'landscape'});
  set(3, {orient: 'landscape'});
  set(5, {w: 12240, h: 15840});
  set(6, {w: 12240, h: 15840, left: 2880});
  await save('pg-4-sizes.docx', d, {note: 'made with Insert > Section ' +
    'break > Continuous and Page setup (This section)'});
}

// ------------------------------------------------------ pg-5
async function spaceBefore(name, mode) {
  const sb = (t, pPr = '') => p(r(t, '<w:b/>'), pPr + EXACT(24));
  const body = [
    sb('Case 1: space before 24 pt, the first line of the document'),
    lines('Filler line', PAGE_LINES - 3),
    sb('Case 2: space before 24 pt after a NATURAL page break'),
    lines('Filler after case 2', 3),
    breakLine('This line ends in a page break (Ctrl+Enter)'),
    sb('Case 3: space before 24 pt after a PAGE BREAK'),
    lines('Filler after case 3', 3),
    sb('Case 4: space before 24 pt, PAGE BREAK BEFORE on',
      '<w:pageBreakBefore/>'),
    lines('Filler after case 4', 3),
    p(r('The section ends here (next page)'), EXACT() +
      sect({type: 'nextPage'})),
    sb('Case 5: space before 24 pt, the first line of a new SECTION'),
    lines('Filler after case 5', 3),
  ];
  const d = await fixture(body.join(''), {settings: compat(mode)});
  await save(name, d, {note: `compatibilityMode ${mode}; case 1 takes ` +
    `3 lines with its space, so the ${PAGE_LINES - 3} filler lines ` +
    'fill page 1 and case 2 is pushed to page 2'});
}

// ------------------------------------------------------ pg-6
async function vAlign() {
  const S = ['Section 1: vertical alignment CENTRE (page 1).',
    'Section 2: vertical alignment BOTTOM (page 2).',
    'Section 3: vertical alignment JUSTIFIED (both; page 3).',
    'Section 4: vertical alignment CENTRE, a cover page ended by a page ' +
    'break (page 4) and a short page 5.',
    'Section 5: top (no vertical alignment; page 6).'];
  const body = S.map((s, i) => say(s) + lines(`Section ${i + 1} ` +
    'line', 4) + (i === 3 ? breakLine('End of the cover page') +
    lines('Section 4, page 2, line', 4) : '')).join('');
  const d = await fixture(body);
  for (let i = 0; i < S.length - 1; i++) {
    must('nextPage', insertSection(d, NOW, end(d, i === 3 ?
      'Section 4, page 2, line 4' : `Section ${i + 1} line 4`),
    'nextPage'));
  }
  ['center', 'bottom', 'both', 'center'].forEach((v, i) => must('valign',
    layoutCmd(d, car(d, S[i]), {vAlign: v})));
  await save('pg-6-valign.docx', d, {note: 'made with Insert > Section ' +
    'break > Next page and Format > Layout... Vertical alignment'});
}

// ------------------------------------------------------ pg-14, 24
const page = (t, i) => say(t) + [0, 1, 2, 3].map((j) => p(r(
  text(90, i * 10 + j)))).join('');
async function mirror() {
  const body = [1, 2, 3, 4].map((i) => page(`Page ${i}: the 2 in margin ` +
    'is the INSIDE one (left on odd pages, right on even)', i) +
    (i < 4 ? p(PAGE_BREAK) : '')).join('');
  const d = await fixture(body, {settings: '<w:mirrorMargins/>' +
    compat(15), lastSect: sect({mar: {left: 2880, right: 720}})});
  await save('pg-14-mirror.docx', d, {note: 'settings mirrorMargins; ' +
    'inside (w:left) 2 in, outside (w:right) 0.5 in'});
}
const side = (n, v, sz, space, color) => `<w:${n} w:val="${v}" ` +
  `w:sz="${sz}" w:space="${space}" w:color="${color}"/>`;
const pgb = (from, v, sz, space, color) => `<w:pgBorders w:offsetFrom=` +
  `"${from}">` + ['top', 'left', 'bottom', 'right'].map((n) => side(n,
  v, sz, space, color)).join('') + '</w:pgBorders>';
async function pageBorders() {
  const body = page('Section 1: a red single 3 pt page border, 24 pt ' +
    'from the page edge', 1) + p(r('End of section 1'), EXACT() +
    sect({more: pgb('page', 'single', 24, 24, 'C00000')})) +
    page('Section 2: a blue double page border, 4 pt from the text', 2);
  const d = await fixture(body, {lastSect: sect({more: pgb('text',
    'double', 6, 4, '1F3864')})});
  await save('pg-24-borders.docx', d, {note: 'sectPr w:pgBorders in ' +
    'both sections'});
}

// ------------------------------------------------------ pg-36
const MFONTS = [['Calibri', 11], ['Calibri Light', 11], ['Cambria', 11],
  ['Arial', 11], ['Times New Roman', 12], ['Courier New', 10]];
async function metrics() {
  const body = MFONTS.map(([f, pt], i) => say(`Page ${i + 1}: ${f} ${pt}` +
    ' pt, single spacing, no space after: which line is last?') +
    Array.from({length: 64}, (_, j) => p(r(`${f} ${pt}, line ${j + 1}`,
      font(f, pt)), NORMAL_SINGLE)).join('') + p(PAGE_BREAK)).join('') +
    ['Calibri Light', 'Calibri'].map((f) => say(`${f} 11: one long ` +
      'paragraph; compare the last word of each line') + p(r(text(400,
      77), font(f, 11)), NORMAL_SINGLE)).join('');
  const d = await fixture(body);
  await save('pg-36-metrics.docx', d, {note: 'six pages of 64 one-line ' +
    'paragraphs, then the same long paragraph in Calibri Light and ' +
    'Calibri'});
}

// ------------------------------------------------------ pg-38, 39
const BOX = '<w:pBdr>' + ['top', 'left', 'bottom', 'right'].map((n) =>
  side(n, 'single', 12, n === 'top' || n === 'bottom' ? 1 : 4, '1F3864'))
  .join('') + side('between', 'single', 4, 1, '1F3864') + '</w:pBdr>';
async function borderGroup() {
  const body = [
    say('A group of three boxed paragraphs (4 lines each) starts with ' +
      'room for 7 lines'),
    lines('Filler line', PAGE_LINES - 8),
    ...[1, 2, 3].map((i) => tall(`Boxed paragraph ${i} of 3`, 4, BOX)),
    lines('After the group, line', 3),
    breakLine('Next: one boxed paragraph of 8 lines, room for 3'),
    lines('Filler line', PAGE_LINES - 3, 100),
    tall('One boxed paragraph', 8, BOX),
    lines('After the paragraph, line', 3),
  ];
  const d = await fixture(body.join(''));
  await save('pg-38-bordergroup.docx', d, {note: 'boxes: single 1.5 pt ' +
    'sides, a 0.5 pt line between the paragraphs of the group'});
}
async function docGrid() {
  const body = say('docGrid type lines, pitch 18 pt, in a Latin ' +
    'document: Calibri 11, single spacing') + Array.from({length: 80},
    (_, j) => p(r(`Grid line ${j + 1}`), NORMAL_SINGLE)).join('');
  const d = await fixture(body, {lastSect: sect({grid: '<w:docGrid ' +
    'w:type="lines" w:linePitch="360"/>'})});
  await save('pg-39-docgrid.docx', d, {note: 'sectPr w:docGrid w:type=' +
    '"lines" w:linePitch="360"'});
}

// ------------------------------------------------------ pg-40, x
async function lastBreak() {
  const body = (m) => say(`Compatibility mode ${m}: the last paragraph ` +
    'ends in a page break') + lines('Line', 3) +
    p(r('The last paragraph: a page break follows') + PAGE_BREAK, EXACT());
  for (const [name, m] of [['pg-40a-lastbreak-12.docx', 12],
    ['pg-40b-lastbreak-15.docx', 15]]) {
    const d = await fixture(body(m), {settings: compat(m)});
    await save(name, d, {note: `compatibilityMode ${m}; nothing after ` +
      'the break but the section\'s end'});
  }
  const d = await fixture(say('Section 1 ends in a page break, then a ' +
    'next-page section') + lines('Line', 3) + p(r('Last paragraph of ' +
    'section 1: a page break follows') + PAGE_BREAK, EXACT() +
    sect({type: 'nextPage'})) + say('Section 2'));
  await save('pg-40c-break-section.docx', d, {note: 'compatibilityMode ' +
    '15; a page break then a next-page section break'});
}
async function hostile() {
  const t = (s) => say(s) + lines('Line', 20);
  let d = await fixture(t('Top and bottom margins of 6.25 in each on A4 ' +
    '(11.7 in): more than the page'), {lastSect: sect({mar: {top: 9000,
    bottom: 9000}})});
  await save('pg-x1-margins.docx', d, {note: 'pgMar top 9000, bottom ' +
    '9000 on an A4 page 16838 high'});
  d = await fixture(t('A page size of 0 x 0'), {lastSect: sect({w: 0,
    h: 0})});
  await save('pg-x2-size0.docx', d, {note: 'pgSz w 0, h 0'});
}

export async function makeA() {
  await breaks();
  await widows();
  await oddPage();
  await sizes();
  await spaceBefore('pg-5a-spacebefore-14.docx', 14);
  await spaceBefore('pg-5b-spacebefore-15.docx', 15);
  await vAlign();
  await mirror();
  await pageBorders();
  await metrics();
  await borderGroup();
  await docGrid();
  await lastBreak();
  await hostile();
}
