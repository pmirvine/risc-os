// .doc import, task 12 (fix round 1): the source .docx files that real
// Word saves as Word 97-2003 .doc (tools/doc-word-fixtures.mjs), so
// that docword.test.mjs can compare our reading of Word's .doc with
// our reading of the .docx Word made it from. Written by hand from
// ECMA-376 (WordprocessingML), with build-docx.mjs; not the output
// of any office program.
//
//   fixtures() -> Promise<{name: Uint8Array}>  the .docx of each:
//     runs     a run sampler: every underline kind, strike / double
//              strike, caps / small caps, hidden, super / sub,
//              raised / lowered, sizes, an RGB and a palette colour,
//              highlight, a second font, character shading, emboss...
//     paras    a paragraph sampler: alignments, indents, spacing,
//              line spacing, keeps, page break before, tab stops
//              (decimal, leader, one cleared from the style),
//              borders, shading
//     styles   style interplay: Strong inside Heading 1, a character
//              style of 10 pt and one of bold off inside a heading, a
//              custom style based on a custom style, direct bold in
//              a bold style
//     lists    (task 13) bulleted (Symbol, Wingdings, Courier 'o')
//              and numbered lists of several levels and formats,
//              a restart (startOverride), a list that starts at 5, a
//              nested list, a level with its own font and bold, a
//              list paragraph with its own indent
//     tables   (task 13) a table with merged cells (gridSpan,
//              vMerge), borders, shading, a header row, row heights
//              (exact / at least), vertical alignment, centred; a
//              nested table; a list inside a cell; an indented table
//              with rows of different widths
//     parts    (task 14) pictures and sections: an inline PNG and
//              JPEG at sizes of their own, a cropped and scaled
//              one; three sections (A4 portrait with a title page,
//              Letter landscape in 2 columns, A5 with 3 unequal
//              columns, roman page numbers from 5, centred); first
//              page, odd and even headers and footers (the settings'
//              evenAndOddHeaders), one holding a table, formatted
//              text and a picture
//     review   (task 15) notes, comments, tracked changes, links,
//              bookmarks and fields: docword-review.mjs
import {buildDocx, documentXml, stylesXml, numberingXml, settingsXml,
  relsXml, p, r, REL, W_NS, R_NS} from './build-docx.mjs';
import {pngBytes, jpegGray, drawingXml, URIS} from './pic-fixtures.mjs';
import {review} from './docword-review.mjs';

const SECT = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
  '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" ' +
  'w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>' +
  '</w:sectPr>';

const DEFAULTS = '<w:docDefaults><w:rPrDefault><w:rPr>' +
  '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" ' +
  'w:eastAsia="Times New Roman" w:cs="Times New Roman"/>' +
  '<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" ' +
  'w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>';

const style = (type, id, name, inner, attrs = '') =>
  `<w:style w:type="${type}" w:styleId="${id}"${attrs}>` +
  `<w:name w:val="${name}"/>${inner}</w:style>`;

const BASE_STYLES = style('paragraph', 'Normal', 'Normal',
  '<w:qFormat/>', ' w:default="1"') +
  style('character', 'DefaultParagraphFont', 'Default Paragraph Font',
    '<w:uiPriority w:val="1"/><w:semiHidden/>', ' w:default="1"');

const doc = (body, styles = '', numbering = '') => buildDocx({
  'word/document.xml': documentXml(body + SECT),
  'word/styles.xml': stylesXml(DEFAULTS + BASE_STYLES + styles),
  ...(numbering ? {'word/numbering.xml': numberingXml(numbering)}
    : {})});

const UNDERLINES = ['single', 'words', 'double', 'thick', 'dotted',
  'dottedHeavy', 'dash', 'dashedHeavy', 'dashLong', 'dashLongHeavy',
  'dotDash', 'dashDotHeavy', 'dotDotDash', 'dashDotDotHeavy', 'wave',
  'wavyHeavy', 'wavyDouble'];

/** One paragraph per sample: 'name: sample text'. */
const sample = (name, rPr) => p(r(name + ': ') + r('sample ' + name,
  rPr));

function runs() {
  const out = [];
  for (const u of UNDERLINES) out.push(sample('u-' + u, `<w:u w:val="${u}"/>`));
  out.push(sample('u-colour', '<w:u w:val="single" w:color="FF0000"/>'));
  const kinds = [['bold', '<w:b/>'], ['italic', '<w:i/>'],
    ['strike', '<w:strike/>'], ['dstrike', '<w:dstrike/>'],
    ['caps', '<w:caps/>'], ['smallcaps', '<w:smallCaps/>'],
    ['hidden', '<w:vanish/>'], ['super', '<w:vertAlign w:val="superscript"/>'],
    ['sub', '<w:vertAlign w:val="subscript"/>'],
    ['raised', '<w:position w:val="6"/>'],
    ['lowered', '<w:position w:val="-4"/>'],
    ['size8', '<w:sz w:val="16"/><w:szCs w:val="16"/>'],
    ['size13', '<w:sz w:val="26"/><w:szCs w:val="26"/>'],
    ['size36', '<w:sz w:val="72"/><w:szCs w:val="72"/>'],
    ['rgb', '<w:color w:val="123456"/>'],
    ['red', '<w:color w:val="FF0000"/>'],
    ['highlight', '<w:highlight w:val="yellow"/>'],
    ['highlight2', '<w:highlight w:val="darkCyan"/>'],
    ['arial', '<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>'],
    ['shading', '<w:shd w:val="clear" w:color="auto" w:fill="FFCC00"/>'],
    ['spaced', '<w:spacing w:val="40"/>'],
    ['scaled', '<w:w w:val="150"/>'],
    ['emboss', '<w:emboss/>'], ['outline', '<w:outline/>'],
    ['shadow', '<w:shadow/>'], ['imprint', '<w:imprint/>'],
    ['mixed', '<w:b/><w:i/><w:u w:val="double"/><w:sz w:val="32"/>' +
      '<w:color w:val="0000FF"/>']];
  for (const [n, x] of kinds) out.push(sample(n, x));
  return doc(out.join(''));
}

function paras() {
  const t = (s, pPr) => p(r(s), pPr);
  const body = [
    t('align left', '<w:jc w:val="left"/>'),
    t('align centre', '<w:jc w:val="center"/>'),
    t('align right', '<w:jc w:val="right"/>'),
    t('align justified both sides of the line', '<w:jc w:val="both"/>'),
    t('align distributed', '<w:jc w:val="distribute"/>'),
    t('indent left 720 right 360',
      '<w:ind w:left="720" w:right="360"/>'),
    t('indent hanging 360', '<w:ind w:left="1080" w:hanging="360"/>'),
    t('indent first line 360', '<w:ind w:firstLine="360"/>'),
    t('space before 240 after 120',
      '<w:spacing w:before="240" w:after="120"/>'),
    t('line 1.5', '<w:spacing w:line="360" w:lineRule="auto"/>'),
    t('line exactly 15 pt', '<w:spacing w:line="300" w:lineRule="exact"/>'),
    t('line at least 14 pt',
      '<w:spacing w:line="280" w:lineRule="atLeast"/>'),
    t('keep with next', '<w:keepNext/>'),
    t('keep lines together', '<w:keepLines/>'),
    t('page break before', '<w:pageBreakBefore/>'),
    t('no widow control', '<w:widowControl w:val="0"/>'),
    t('no line numbers', '<w:suppressLineNumbers/>'),
    t('contextual spacing', '<w:contextualSpacing/>'),
    t('tabs\tdecimal 2880\tright dot 8000', '<w:tabs>' +
      '<w:tab w:val="decimal" w:pos="2880"/>' +
      '<w:tab w:val="right" w:leader="dot" w:pos="8000"/></w:tabs>'),
    t('tabs\tcentre hyphen\tbar', '<w:tabs>' +
      '<w:tab w:val="center" w:leader="hyphen" w:pos="3000"/>' +
      '<w:tab w:val="bar" w:pos="5000"/></w:tabs>'),
    t('style tabs', '<w:pStyle w:val="Tabbed"/>'),
    t('style tab cleared', '<w:pStyle w:val="Tabbed"/><w:tabs>' +
      '<w:tab w:val="clear" w:pos="1440"/></w:tabs>'),
    t('borders all round', '<w:pBdr>' +
      '<w:top w:val="single" w:sz="8" w:space="1" w:color="FF0000"/>' +
      '<w:left w:val="double" w:sz="4" w:space="4" w:color="auto"/>' +
      '<w:bottom w:val="dotted" w:sz="12" w:space="1" w:color="0000FF"/>' +
      '<w:right w:val="dashed" w:sz="6" w:space="4" w:color="00FF00"/>' +
      '</w:pBdr>'),
    t('thick bottom border', '<w:pBdr><w:bottom w:val="thick" ' +
      'w:sz="18" w:space="1" w:color="auto"/></w:pBdr>'),
    t('shading', '<w:shd w:val="clear" w:color="auto" w:fill="DDEEFF"/>'),
    t('outline level 2', '<w:outlineLvl w:val="1"/>'),
  ];
  const tabbed = style('paragraph', 'Tabbed', 'Tabbed',
    '<w:basedOn w:val="Normal"/><w:pPr><w:tabs>' +
    '<w:tab w:val="left" w:pos="1440"/><w:tab w:val="left" ' +
    'w:pos="4320"/></w:tabs></w:pPr>');
  return doc(body.join(''), tabbed);
}

function styles() {
  const st =
    style('paragraph', 'Heading1', 'heading 1',
      '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>' +
      '<w:pPr><w:keepNext/><w:spacing w:before="240"/>' +
      '<w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/>' +
      '<w:sz w:val="32"/></w:rPr>') +
    style('character', 'Strong', 'Strong',
      '<w:basedOn w:val="DefaultParagraphFont"/><w:qFormat/>' +
      '<w:rPr><w:b/></w:rPr>') +
    style('character', 'Emphasis', 'Emphasis',
      '<w:basedOn w:val="DefaultParagraphFont"/><w:qFormat/>' +
      '<w:rPr><w:i/></w:rPr>') +
    style('character', 'Small', 'Small',
      '<w:basedOn w:val="DefaultParagraphFont"/>' +
      '<w:rPr><w:sz w:val="20"/></w:rPr>', ' w:customStyle="1"') +
    style('character', 'NotBold', 'Not Bold',
      '<w:basedOn w:val="DefaultParagraphFont"/>' +
      '<w:rPr><w:b w:val="0"/></w:rPr>', ' w:customStyle="1"') +
    style('character', 'Loud', 'Loud',
      '<w:basedOn w:val="DefaultParagraphFont"/>' +
      '<w:rPr><w:caps/><w:color w:val="C00000"/></w:rPr>',
      ' w:customStyle="1"') +
    style('paragraph', 'BaseA', 'Base A',
      '<w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/>' +
      '<w:spacing w:after="120"/></w:pPr><w:rPr><w:i/></w:rPr>',
      ' w:customStyle="1"') +
    style('paragraph', 'DerivedB', 'Derived B',
      '<w:basedOn w:val="BaseA"/><w:pPr><w:ind w:left="360"/></w:pPr>' +
      '<w:rPr><w:sz w:val="28"/><w:i w:val="0"/></w:rPr>',
      ' w:customStyle="1"') +
    style('paragraph', 'BoldPara', 'Bold Para',
      '<w:basedOn w:val="Normal"/><w:rPr><w:b/></w:rPr>',
      ' w:customStyle="1"');
  const ps = (id) => `<w:pStyle w:val="${id}"/>`;
  const cs = (id) => `<w:rStyle w:val="${id}"/>`;
  const body = [
    p(r('Heading plain ') + r('strong in heading', cs('Strong')) +
      r(' small in heading', cs('Small')) +
      r(' not bold in heading', cs('NotBold')), ps('Heading1')),
    p(r('Normal plain ') + r('strong in normal', cs('Strong')) +
      r(' small in normal', cs('Small')) +
      r(' not bold in normal', cs('NotBold')) +
      r(' loud in normal', cs('Loud'))),
    p(r('Base A text ') + r('emphasis in italic', cs('Emphasis')),
      ps('BaseA')),
    p(r('Derived B text ') + r('emphasis in derived', cs('Emphasis')),
      ps('DerivedB')),
    p(r('Bold para ') + r('direct bold', '<w:b/>') +
      r(' direct not bold', '<w:b w:val="0"/>') +
      r(' strong in bold para', cs('Strong')), ps('BoldPara')),
    p(r('Heading two') + r(' direct italic', '<w:i/>'), ps('Heading1')),
  ];
  return doc(body.join(''), st);
}

// -- lists (task 13) ---------------------------------------------------

/** A w:lvl. */
const lvl = (k, fmt, text, {start = 1, left, hanging = 360, font,
  rPr = '', suff} = {}) =>
  `<w:lvl w:ilvl="${k}"><w:start w:val="${start}"/>` +
  `<w:numFmt w:val="${fmt}"/>` +
  (suff ? `<w:suff w:val="${suff}"/>` : '') +
  `<w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/>` +
  `<w:pPr><w:ind w:left="${left ?? 720 * (k + 1)}" ` +
  `w:hanging="${hanging}"/></w:pPr>` +
  (font || rPr ? '<w:rPr>' + (font ? `<w:rFonts w:ascii="${font}" ` +
    `w:hAnsi="${font}" w:hint="default"/>` : '') + rPr + '</w:rPr>'
    : '') + '</w:lvl>';

const abstract = (id, lvls) =>
  `<w:abstractNum w:abstractNumId="${id}">` +
  '<w:multiLevelType w:val="hybridMultilevel"/>' + lvls +
  '</w:abstractNum>';

const BULLETS = abstract(0,
  lvl(0, 'bullet', '', {font: 'Symbol'}) +
  lvl(1, 'bullet', 'o', {font: 'Courier New'}) +
  lvl(2, 'bullet', '', {font: 'Wingdings'}) +
  [3, 4, 5, 6, 7, 8].map((k) => lvl(k, 'bullet', '',
    {font: 'Symbol'})).join(''));
const NUMBERS = abstract(1,
  lvl(0, 'decimal', '%1.') + lvl(1, 'lowerLetter', '%2)') +
  lvl(2, 'lowerRoman', '%1.%2.%3', {hanging: 720}) +
  lvl(3, 'upperRoman', '(%4)') + lvl(4, 'upperLetter', '%5.') +
  lvl(5, 'decimalZero', '%6.', {suff: 'space'}) +
  lvl(6, 'decimal', '%7.', {rPr: '<w:b/><w:color w:val="C00000"/>'}) +
  lvl(7, 'ordinal', '%8') + lvl(8, 'none', ''));
const FROM5 = abstract(2, lvl(0, 'decimal', '%1.', {start: 5}) +
  lvl(1, 'decimal', '%1.%2.'));

const NUMBERING = BULLETS + NUMBERS + FROM5 +
  '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' +
  '<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>' +
  '<w:num w:numId="3"><w:abstractNumId w:val="1"/>' +
  '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/>' +
  '</w:lvlOverride></w:num>' +
  '<w:num w:numId="4"><w:abstractNumId w:val="2"/></w:num>';

const li = (text, numId, ilvl, pPr = '') => p(r(text),
  `<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/>` +
  `</w:numPr>${pPr}`);

function lists() {
  const body = [
    p(r('Bullets:')),
    li('bullet one', 1, 0), li('bullet two', 1, 0),
    li('circle under two', 1, 1), li('square under circle', 1, 2),
    li('bullet three', 1, 0),
    p(r('Numbers:')),
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => li('level ' + (k + 1),
      2, k)),
    li('back to one', 2, 0), li('then two', 2, 1),
    p(r('Restarted:')),
    li('restart one', 3, 0), li('restart two', 3, 0),
    p(r('From five:')),
    li('five', 4, 0), li('five one', 4, 1), li('six', 4, 0),
    li('own indent', 4, 0, '<w:ind w:left="2000" w:hanging="500"/>'),
    p(r('Nested bullets in numbers:')),
    li('number', 2, 0), li('bullet under it', 1, 1),
    li('number again', 2, 0),
  ];
  return doc(body.join(''), '', NUMBERING);
}

// -- tables (task 13) --------------------------------------------------

const B = (side, val = 'single', sz = 4, color = 'auto') =>
  `<w:${side} w:val="${val}" w:sz="${sz}" w:space="0" ` +
  `w:color="${color}"/>`;
const ALL = (val, sz, color) => ['top', 'left', 'bottom', 'right',
  'insideH', 'insideV'].map((s) => B(s, val, sz, color)).join('');
const tc = (w, content, tcPr = '') =>
  `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${tcPr}</w:tcPr>` +
  (content || p()) + '</w:tc>';
const tr = (cells, trPr = '') =>
  `<w:tr>${trPr ? '<w:trPr>' + trPr + '</w:trPr>' : ''}${cells}</w:tr>`;
const tbl = (grid, rows, tblPr = '') =>
  `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${tblPr}` +
  '<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>' +
  grid.map((g) => `<w:gridCol w:w="${g}"/>`).join('') +
  `</w:tblGrid>${rows}</w:tbl>`;
const shd = (fill) =>
  `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`;

function tables() {
  const g = [2000, 2000, 2000];
  const t1 = tbl(g, [
    tr(tc(2000, p(r('Head A'))) + tc(2000, p(r('Head B'))) +
      tc(2000, p(r('Head C'))), '<w:tblHeader/>'),
    tr(tc(4000, p(r('wide AB')), '<w:gridSpan w:val="2"/>' +
      shd('FFCC00')) + tc(2000, p(r('tall C')),
      '<w:vMerge w:val="restart"/><w:vAlign w:val="center"/>'),
    '<w:trHeight w:val="600" w:hRule="exact"/>'),
    tr(tc(2000, p(r('A3'))) + tc(2000, p(r('B3')), shd('DDEEFF')) +
      tc(2000, p(), '<w:vMerge/>'),
    '<w:trHeight w:val="400" w:hRule="atLeast"/>'),
    tr(tc(2000, p(r('A4')), '<w:tcBorders>' + B('top', 'double', 6,
      'FF0000') + B('bottom', 'dotted', 8, '0000FF') +
      '</w:tcBorders>') + tc(4000, p(r('wide BC')),
      '<w:gridSpan w:val="2"/><w:vAlign w:val="bottom"/>')),
  ].join(''), '<w:jc w:val="center"/><w:tblBorders>' +
    ALL('single', 4, 'auto') + '</w:tblBorders>');
  const inner = tbl([1000, 1000], tr(tc(1000, p(r('in 1'))) +
    tc(1000, p(r('in 2')))) + tr(tc(1000, p(r('in 3'))) +
    tc(1000, p(r('in 4')))), '<w:tblBorders>' +
    ALL('single', 4, '00AA00') + '</w:tblBorders>');
  const t2 = tbl([2500, 2500], tr(tc(2500, p(r('outer 1')) + inner +
    p(r('after inner'))) + tc(2500, p(r('outer 2')))) +
    tr(tc(2500, li('listed in cell', 2, 0) + li('second item', 2, 1)) +
      tc(2500, p(r('outer 4')))), '<w:tblBorders>' +
    ALL('single', 4, 'auto') + '</w:tblBorders>');
  const t3 = tbl([1000, 1500, 1500, 1000],
    tr(tc(1000, p(r('r1 a'))) + tc(3000, p(r('r1 b')),
      '<w:gridSpan w:val="2"/>') + tc(1000, p(r('r1 c')))) +
    tr(tc(2500, p(r('r2 a')), '<w:gridSpan w:val="2"/>') +
      tc(2500, p(r('r2 b')), '<w:gridSpan w:val="2"/>')),
    '<w:tblInd w:w="720" w:type="dxa"/>');
  const body = [p(r('Table one:')), t1, p(r('Table two:')), t2,
    p(r('Table three:')), t3, p(r('End.'))];
  return doc(body.join(''), '', NUMBERING);
}

const HF_NS = ` xmlns:w="${W_NS}" xmlns:r="${R_NS}" xmlns:wp="${URIS.wp}"` +
  ` xmlns:a="${URIS.a}" xmlns:pic="${URIS.pic}"`;
const hf = (kind, body) => '<?xml version="1.0" encoding="UTF-8" ' +
  `standalone="yes"?>\n<w:${kind}${HF_NS}>${body}</w:${kind}>`;
const pic = (o) => r('') .replace('<w:t xml:space="preserve"></w:t>',
  drawingXml({decl: false, ...o}));
const ref = (kind, type, id) => `<w:${kind}Reference w:type="${type}" ` +
  `r:id="${id}"/>`;

async function parts() {
  const PNG = pngBytes(40, 20, {rgb: [200, 30, 30]});
  const JPG = jpegGray(32, 16);
  const cell = (text, w) => tc(w, p(r(text)));
  const hdrTable = tbl([2000, 2000], [tr([cell('h-cell 1', 2000),
    cell('h-cell 2', 2000)])], '<w:tblBorders>' + ALL('single', 4,
    '000000') + '</w:tblBorders>');
  const P = {
    'word/header1.xml': hf('hdr', p(r('First page header', '<w:b/>'))),
    'word/footer1.xml': hf('ftr', p(r('First page footer'))),
    'word/header2.xml': hf('hdr', p(r('Odd header ', '<w:i/>') +
      r('red', '<w:color w:val="FF0000"/>'), '<w:jc w:val="right"/>') +
      hdrTable + p(pic({id: 9, embed: 'rIdH1', cx: 381000, cy: 190500}))),
    'word/_rels/header2.xml.rels': relsXml([['rIdH1', REL('image'),
      'media/image1.png']]),
    'word/footer2.xml': hf('ftr', p(r('Odd footer'))),
    'word/header3.xml': hf('hdr', p(r('Even header'))),
    'word/footer3.xml': hf('ftr', p(r('Even footer'))),
    'word/header4.xml': hf('hdr', p(r('Section three header'))),
    'word/media/image1.png': PNG,
    'word/media/image2.jpeg': JPG,
    'word/settings.xml': settingsXml('<w:evenAndOddHeaders/>'),
  };
  const docRels = [['rIdP', REL('image'), 'media/image1.png'],
    ['rIdJ', REL('image'), 'media/image2.jpeg']];
  const hfs = [['header', 1], ['footer', 1], ['header', 2],
    ['footer', 2], ['header', 3], ['footer', 3], ['header', 4]];
  for (const [k, n] of hfs) docRels.push([`rId${k[0]}${n}`, REL(k), `${k}${n}.xml`]);
  const s1 = '<w:sectPr>' + ref('header', 'first', 'rIdh1') +
    ref('footer', 'first', 'rIdf1') + ref('header', 'default', 'rIdh2') +
    ref('footer', 'default', 'rIdf2') + ref('header', 'even', 'rIdh3') +
    ref('footer', 'even', 'rIdf3') +
    '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1200" ' +
    'w:right="1300" w:bottom="1400" w:left="1500" w:header="600" ' +
    'w:footer="650" w:gutter="100"/><w:cols w:space="708"/><w:titlePg/>' +
    '</w:sectPr>';
  const s2 = '<w:sectPr><w:pgSz w:w="15840" w:h="12240" ' +
    'w:orient="landscape"/><w:pgMar w:top="1000" w:right="1000" ' +
    'w:bottom="1000" w:left="1000" w:header="500" w:footer="500" ' +
    'w:gutter="0"/><w:cols w:num="2" w:space="567" w:sep="1"/>' +
    '</w:sectPr>';
  const s3 = '<w:sectPr>' + ref('header', 'default', 'rIdh4') +
    '<w:type w:val="oddPage"/><w:pgSz w:w="8391" w:h="11906"/>' +
    '<w:pgMar w:top="900" w:right="800" w:bottom="900" w:left="800" ' +
    'w:header="400" w:footer="400" w:gutter="0"/>' +
    '<w:pgNumType w:fmt="lowerRoman" w:start="5"/>' +
    '<w:cols w:num="3" w:space="300" w:equalWidth="0">' +
    '<w:col w:w="2000" w:space="300"/><w:col w:w="2500" w:space="300"/>' +
    '<w:col w:w="1391"/></w:cols><w:vAlign w:val="center"/></w:sectPr>';
  const body = [
    p(r('Pictures: ') + pic({id: 1, embed: 'rIdP', cx: 762000,
      cy: 381000}) + r(' then ') + pic({id: 2, embed: 'rIdJ',
      cx: 1219200, cy: 609600})),
    p(r('Cropped: ') + pic({id: 3, embed: 'rIdP', cx: 571500,
      cy: 381000, srcRect: {l: 12500, r: 12500}}) + r(' scaled: ') +
      pic({id: 4, embed: 'rIdJ', cx: 304800, cy: 457200})),
    p(r('End of section one.'), s1),
    p(r('Section two, landscape, two columns.')),
    p(r('More of section two.'), s2),
    p(r('Section three: A5, three columns, centred.')),
  ].join('') + s3;
  return buildDocx({
    'word/document.xml': documentXml(body, {rootAttrs:
      ` xmlns:wp="${URIS.wp}" xmlns:a="${URIS.a}" xmlns:pic="${URIS.pic}"`}),
    'word/styles.xml': stylesXml(DEFAULTS + BASE_STYLES), ...P},
  {docRels, extDefaults: [['jpeg', 'image/jpeg']]});
}

/** See the header. */
export async function fixtures() {
  return {runs: await runs(), paras: await paras(),
    styles: await styles(), lists: await lists(),
    tables: await tables(), parts: await parts(),
    review: await review()};
}
