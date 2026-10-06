// Test-only: a rich, Word-like .docx to edit (the editing round trip,
// edit-roundtrip.test.mjs, and the real-Word hand-off generator,
// handoff-typing.mjs). Styles, settings and document properties are
// those of a new !Word document (newDoc, which real Word opens), plus
// a numbering part (a numbered and a bulleted list), a hyperlink, a
// table, bold and italic runs, a tab, a line break, an emoji and
// accents, and two sections (a section break in a paragraph).
//
//   await richDocx() -> Uint8Array
//   RICH: the paragraph texts, by name, to find them after reading
import {newDoc, writeDocx} from '../../tools/moreapps/!Word/DocxWrite';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {buildDocx, documentXml, numberingXml, p, r, REL}
  from './build-docx.mjs';

const DATE = new Date(Date.UTC(2026, 9, 6, 12));
const B = '<w:b/><w:bCs/>', I = '<w:i/><w:iCs/>';
const num = (id, lvl = 0) => '<w:pStyle w:val="ListParagraph"/>' +
  `<w:numPr><w:ilvl w:val="${lvl}"/><w:numId w:val="${id}"/></w:numPr>`;
const LVL = (ilvl, fmt, text, left) => `<w:lvl w:ilvl="${ilvl}">` +
  `<w:start w:val="1"/><w:numFmt w:val="${fmt}"/>` +
  `<w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/>` +
  `<w:pPr><w:ind w:left="${left}" w:hanging="360"/></w:pPr></w:lvl>`;
const NUMBERING = numberingXml(
  '<w:abstractNum w:abstractNumId="0">' +
  '<w:multiLevelType w:val="hybridMultilevel"/>' +
  LVL(0, 'decimal', '%1.', 720) + LVL(1, 'lowerLetter', '%2.', 1440) +
  '</w:abstractNum><w:abstractNum w:abstractNumId="1">' +
  '<w:multiLevelType w:val="hybridMultilevel"/>' +
  LVL(0, 'bullet', '\u2022', 720) + '</w:abstractNum>' +
  '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' +
  '<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>');

const BORDER = (s) => `<w:${s} w:val="single" w:sz="4" w:space="0" ` +
  'w:color="auto"/>';
const cell = (t) => '<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/>' +
  `</w:tcPr>${p(r(t))}</w:tc>`;
const TABLE = '<w:tbl><w:tblPr><w:tblW w:w="4800" w:type="dxa"/>' +
  '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH',
  'insideV'].map(BORDER).join('') + '</w:tblBorders><w:tblLook ' +
  'w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" ' +
  'w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>' +
  '<w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="2400"/>' +
  '</w:tblGrid><w:tr>' + cell('Cell one') + cell('Cell two') +
  '</w:tr></w:tbl>';
const SECT = (type = '') => '<w:sectPr>' + type +
  '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" ' +
  'w:right="1440" w:bottom="1440" w:left="1440" w:header="708" ' +
  'w:footer="708" w:gutter="0"/><w:cols w:space="708"/></w:sectPr>';

/** The paragraphs' texts (a link is U+FFFC; the reader gives a
 * tab and a line break as \t and \n). */
export const RICH = {
  title: 'Typing test',
  styled: 'Plain, bold words, italic words, and plain again.',
  link: 'A link: \ufffc and text after it.',
  n1: 'First numbered item',
  n2: 'Second numbered item',
  b1: 'A bullet point',
  b2: 'Another bullet point',
  before: 'The paragraph before the table.',
  after: 'The paragraph after the table.',
  heading2: 'A second heading',
  tab: 'Name:\tvalue',
  br: 'One line\nand the next',
  intl: 'Caf\u00e9, na\u00efve, \u{1F600} smile.',
  end1: 'The last paragraph of section one.',
  start2: 'The first paragraph of section two.',
  last: 'The end.',
};

/** See the header. */
export async function richDocx() {
  const z = await readZip(await writeDocx(newDoc({date: DATE}),
    {date: DATE}));
  const s = (n) => new TextDecoder().decode(z.get(n));
  const body = [
    p(r(RICH.title), '<w:pStyle w:val="Heading1"/>'),
    p(r('Plain, ') + r('bold words', B) + r(', ') +
      r('italic words', I) + r(', and plain again.')),
    p(r('A link: ') + '<w:hyperlink r:id="rIdL" w:history="1">' +
      r('example.com', '<w:color w:val="0563C1"/><w:u w:val="single"/>') +
      '</w:hyperlink>' + r(' and text after it.')),
    p(r(RICH.n1), num(1)), p(r(RICH.n2), num(1)),
    p(r(RICH.b1), num(2)), p(r(RICH.b2), num(2)),
    p(r(RICH.before)), TABLE, p(r(RICH.after)),
    p(r(RICH.heading2), '<w:pStyle w:val="Heading2"/>'),
    p(r('Name:') + '<w:r><w:tab/></w:r>' + r('value')),
    p(r('One line') + '<w:r><w:br/></w:r>' + r('and the next')),
    p(r(RICH.intl)),
    p(r(RICH.end1), SECT()),
    p(r(RICH.start2)),
    p(r(RICH.last)),
  ].join('');
  return buildDocx({
    'word/document.xml': documentXml(body + SECT(
      '<w:type w:val="nextPage"/>')),
    'word/styles.xml': s('word/styles.xml'),
    'word/settings.xml': s('word/settings.xml'),
    'word/numbering.xml': NUMBERING,
    'docProps/core.xml': s('docProps/core.xml'),
    'docProps/app.xml': s('docProps/app.xml'),
  }, {
    docRels: [['rIdL', REL('hyperlink'), 'http://example.com/',
      'External']],
    pkgRels: [['rId1', REL('officeDocument'), 'word/document.xml'],
      ['rId2', 'http://schemas.openxmlformats.org/package/2006/' +
        'relationships/metadata/core-properties', 'docProps/core.xml'],
      ['rId3', REL('extended-properties'), 'docProps/app.xml']],
  });
}
