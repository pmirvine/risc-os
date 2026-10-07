// List documents for the list round trip (list-roundtrip.test.mjs),
// the hostile browser test (word-lists-hostile.mjs) and the real-Word
// hand-off (handoff-lists.mjs): a numbering part with bullets
// (Symbol, Courier New 'o', Wingdings), a nine-level multilevel list,
// legal numbering (isLgl), headings tied to a list by their styles,
// a level that never restarts (lvlRestart 0), sparse levels, and two
// numIds sharing one abstractNum (one with a startOverride).
//
//   numIds: 1 bullets, 2 multilevel (1. a. i. ...), 3 the same
//   abstractNum as 2 with a startOverride of 5 on level 0, 4 legal,
//   5 headings (Heading1..3 styles), 6 sparse (levels 0 and 2),
//   7 lvlRestart 0 on level 1
//
//   lvl(k, opts)            one <w:lvl> (schema order)
//   NUMBERING               the numbering part (text)
//   STYLES_LIST             styles: Normal, Heading1..3 (numId 5),
//                           ListParagraph
//   LI(numId, ilvl)         a paragraph's <w:numPr>
//   item(text, numId, ilvl, more)  a list paragraph
//   listDocx(paras, {numbering, styles})  -> Promise<bytes>
//   LIST_DOCS               [name, () => bytes] fixtures for tests
import {buildDocx, documentXml, numberingXml, stylesXml, p, r}
  from './build-docx.mjs';

/** One level; opts: fmt, text, start (null: none), left (null: no
 * w:ind), hanging (null: none), firstLine, suff, restart, isLgl, jc,
 * font, pStyle, bold. */
export function lvl(k, o = {}) {
  const fmt = o.fmt || 'decimal';
  const ind = o.left === null ? '' : `<w:pPr><w:ind w:left="${
    o.left ?? 720 * (k + 1)}"${o.firstLine !== undefined
    ? ` w:firstLine="${o.firstLine}"` : o.hanging === null ? ''
      : ` w:hanging="${o.hanging ?? 360}"`}/></w:pPr>`;
  const rPr = o.font || o.bold ? '<w:rPr>' + (o.font
    ? `<w:rFonts w:ascii="${o.font}" w:hAnsi="${o.font}" ` +
      'w:hint="default"/>' : '') + (o.bold ? '<w:b/>' : '') +
    '</w:rPr>' : '';
  return `<w:lvl w:ilvl="${k}">` +
    (o.start === null ? '' : `<w:start w:val="${o.start ?? 1}"/>`) +
    `<w:numFmt w:val="${fmt}"/>` +
    (o.restart !== undefined ? `<w:lvlRestart w:val="${o.restart}"/>`
      : '') +
    (o.pStyle ? `<w:pStyle w:val="${o.pStyle}"/>` : '') +
    (o.isLgl ? '<w:isLgl/>' : '') +
    (o.suff ? `<w:suff w:val="${o.suff}"/>` : '') +
    `<w:lvlText w:val="${o.text ?? `%${k + 1}.`}"/>` +
    `<w:lvlJc w:val="${o.jc || 'left'}"/>` + ind + rPr + '</w:lvl>';
}

const abs = (id, levels, type = 'hybridMultilevel') =>
  `<w:abstractNum w:abstractNumId="${id}">` +
  `<w:multiLevelType w:val="${type}"/>${levels}</w:abstractNum>`;
const num = (id, a, over = '') => `<w:num w:numId="${id}">` +
  `<w:abstractNumId w:val="${a}"/>${over}</w:num>`;

const FMTS = ['decimal', 'lowerLetter', 'lowerRoman'];
const BULLETS = [['', 'Symbol'], ['o', 'Courier New'],
  ['', 'Wingdings']];

export const NUMBERING = numberingXml(
  abs(0, BULLETS.map(([t, f], k) => lvl(k, {fmt: 'bullet', text: t,
    font: f})).join('')) +
  abs(1, Array.from({length: 9}, (_, k) => lvl(k, {fmt: FMTS[k % 3],
    text: `%${k + 1}.`})).join('')) +
  abs(2, lvl(0, {fmt: 'upperRoman', text: 'Article %1.'}) +
    lvl(1, {isLgl: true, text: '%1.%2'}) +
    lvl(2, {isLgl: true, text: '%1.%2.%3', suff: 'space'})) +
  abs(3, lvl(0, {pStyle: 'Heading1', text: '%1', left: 432,
    hanging: 432}) + lvl(1, {pStyle: 'Heading2', text: '%1.%2',
    left: 576, hanging: 576}) + lvl(2, {pStyle: 'Heading3',
    text: '%1.%2.%3', left: 720, hanging: 720}), 'multilevel') +
  abs(4, lvl(0) + lvl(2, {fmt: 'lowerLetter', text: '(%3)'})) +
  abs(5, lvl(0) + lvl(1, {fmt: 'lowerLetter', text: '%2)',
    restart: 0})) +
  num(1, 0) + num(2, 1) +
  num(3, 1, '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="5"/>' +
    '</w:lvlOverride>') +
  num(4, 2) + num(5, 3) + num(6, 4) + num(7, 5));

const head = (k) => `<w:style w:type="paragraph" w:styleId="Heading${
  k}"><w:name w:val="heading ${k}"/><w:basedOn w:val="Normal"/>` +
  '<w:next w:val="Normal"/><w:pPr><w:keepNext/><w:numPr><w:ilvl ' +
  `w:val="${k - 1}"/><w:numId w:val="5"/></w:numPr>` +
  `<w:outlineLvl w:val="${k - 1}"/></w:pPr><w:rPr><w:b/><w:sz ` +
  `w:val="${36 - 4 * k}"/></w:rPr></w:style>`;
export const STYLES_LIST = stylesXml(
  '<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr>' +
  '</w:rPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
  '<w:name w:val="Normal"/></w:style>' + head(1) + head(2) + head(3) +
  '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name ' +
  'w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind ' +
  'w:left="720"/></w:pPr></w:style>');

/** A paragraph's numPr. */
export const LI = (id, k = 0) => `<w:numPr><w:ilvl w:val="${k}"/>` +
  `<w:numId w:val="${id}"/></w:numPr>`;
/** A list paragraph; more: extra pPr after the numPr (e.g. ind). */
export const item = (text, id, k = 0, more = '') =>
  p(r(text), '<w:pStyle w:val="ListParagraph"/>' + LI(id, k) + more);
/** A heading (its style gives it numId 5). */
export const heading = (text, k = 1) =>
  p(r(text), `<w:pStyle w:val="Heading${k}"/>`);

/** A .docx of paragraphs with the list numbering and styles. */
export const listDocx = (paras, {numbering = NUMBERING,
  styles = STYLES_LIST} = {}) => buildDocx({
  'word/document.xml': documentXml(paras.join('')),
  'word/styles.xml': styles, 'word/numbering.xml': numbering});

const SECT = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>';
const TBL = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/>' +
  '</w:tblGrid><w:tr><w:tc>' + item('in a cell', 2) + '</w:tc></w:tr>' +
  '</w:tbl>';

export const LIST_DOCS = [
  ['bullets, three levels', () => listDocx(['a', 'b', 'c', 'd']
    .map((t, i) => item('Bullet ' + t, 1, i % 3)))],
  ['multilevel 1. a. i.', () => listDocx([p(r('Before')),
    ...Array.from({length: 14}, (_, i) => item('Item ' + i, 2,
      [0, 1, 2, 2, 1, 0, 1, 3, 4, 0, 8, 2, 0, 1][i])), p(r('After'))])],
  ['two numIds, one abstractNum, startOverride', () => listDocx([
    item('one', 2), item('two', 2), p(r('between')), item('five', 3),
    item('six', 3), item('three', 2)])],
  ['legal and headings', () => listDocx([heading('Intro'),
    item('Art', 4), item('Sec', 4, 1), item('Sub', 4, 2),
    heading('Scope', 2), heading('Detail', 3), heading('Next'),
    item('Art 2', 4), item('Sec 2', 4, 1)])],
  ['sparse levels, no-restart level, ind direct', () => listDocx([
    item('top', 6), item('deep', 6, 2), item('top 2', 6),
    item('again', 6, 2), item('x', 7), item('x.a', 7, 1),
    item('y', 7), item('y.b', 7, 1),
    item('direct', 2, 0, '<w:ind w:left="2880" w:hanging="720"/>')])],
  ['lists in sections and a table', () => listDocx([item('one', 1),
    p(r('end of section'), SECT), item('two', 2), TBL, item('three', 2),
    p(''), item('', 2), SECT])],
];
