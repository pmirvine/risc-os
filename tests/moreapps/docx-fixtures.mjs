// Test-only: the documents docx-read.test.mjs reads, as a list, so
// the writer tests can round-trip every one of them.
//
//   FIXTURES: [[name, async () => bytes]]
import {buildDocx, documentXml, stylesXml, numberingXml, settingsXml,
  p, r, REL, STRICT_W_NS, STRICT_R_NS, W_NS} from './build-docx.mjs';

const doc = (body, parts = {}, opts = {}) => () => buildDocx(
  {'word/document.xml': documentXml(body), ...parts}, opts);

const sect = (inner, a = '') => `<w:sectPr${a}>${inner}</w:sectPr>`;

export const STYLES = stylesXml(
  '<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/>' +
  '<w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault>' +
  '<w:pPr><w:spacing w:after="160"/></w:pPr></w:pPrDefault>' +
  '</w:docDefaults><w:latentStyles w:count="1"/>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
  '<w:name w:val="Normal"/><w:qFormat/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading1">' +
  '<w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>' +
  '<w:next w:val="Normal"/><w:link w:val="H1Char"/>' +
  '<w:uiPriority w:val="9"/><w:qFormat/><w:rsid w:val="00AA"/>' +
  '<w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr>' +
  '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="H2x">' +
  '<w:basedOn w:val="Heading1"/><w:rPr><w:i/></w:rPr></w:style>' +
  '<w:style w:type="character" w:default="1" w:customStyle="1" ' +
  'w:styleId="DPF"><w:semiHidden/><w:unhideWhenUsed/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="dup"/>' +
  '</w:style>' +
  '<w:style w:type="table" w:styleId="TT"><w:tblPr/></w:style>');

const NUMBERING = numberingXml(
  '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0">' +
  '<w:start w:val="1"/><w:numFmt w:val="decimal"/>' +
  '<w:lvlText w:val="%1."/></w:lvl><w:lvl w:ilvl="1">' +
  '<w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl>' +
  '</w:abstractNum><w:num w:numId="5"><w:abstractNumId w:val="0"/>' +
  '</w:num>');

const S = 'http://purl.oclc.org/ooxml/';

const DRAWING = '<w:drawing><wp:inline xmlns:wp="' + S +
  'drawingml/wordprocessingDrawing"><a:graphic xmlns:a="' + S +
  'drawingml/main"><a:graphicData uri="' + S + 'drawingml/picture">' +
  '<pic:pic xmlns:pic="' + S + 'drawingml/picture"/></a:graphicData>' +
  '</a:graphic></wp:inline></w:drawing>';
const SDT = '<w:sdt><w:sdtPr><w:dataBinding w:prefixMappings="' +
  "xmlns:ns0='" + S + "officeDocument/extendedProperties' " +
  "xmlns:ns1='urn:x'\" w:xpath=\"/ns0:P\"/></w:sdtPr>" +
  '<w:sdtContent>' + p(r('in')) + '</w:sdtContent></w:sdt>';

/** The Strict document of the reader tests. */
export const strictDocx = () => buildDocx({
  'word/document.xml': documentXml(p('<w:r>' + DRAWING + '</w:r>') +
    p(r('strict', '<w:b/>'), '<w:jc w:val="center"/>') + SDT,
  {ns: STRICT_W_NS, rNs: STRICT_R_NS, rootAttrs: ' xmlns:m="' + S +
    'officeDocument/math" xmlns:c="' + S + 'drawingml/chart" ' +
    'w:conformance="strict"'}).replace('?>\n', '?>\n<!--pre-->\n'),
  'word/styles.xml': stylesXml('<w:style w:type="paragraph" ' +
    'w:styleId="S"><w:name w:val="S"/><w:rPr><w:i/></w:rPr>' +
    '</w:style>', {ns: STRICT_W_NS}),
  'word/settings.xml': settingsXml('<w:zoom w:percent="90"/>',
    {ns: STRICT_W_NS}),
}, {strict: true});

export const FIXTURES = [
  ['minimal', doc(p(r('Hello')))],
  ['root extras', () => buildDocx({'word/document.xml':
    documentXml(p(r('a')), {before: '<w:background w:color="FF0000"/>',
      rootAttrs: ' xmlns:mc="x" mc:Ignorable="w14"'})})],
  ['other main name', () => buildDocx({'word/document2.xml':
    documentXml(p(r('Two')))}, {main: 'word/document2.xml'})],
  ['unknown parts', doc(p(r('x')), {
    'customXml/item1.xml': '<?xml version="1.0"?><x a="1">é</x>',
    'word/media/image1.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47,
      0, 1, 2, 255]),
    'word/header1.xml': '<w:hdr xmlns:w="' + W_NS + '"/>',
    'word/footnotes.xml': '<w:footnotes xmlns:w="' + W_NS + '"/>',
    'docProps/core.xml': '<cp:coreProperties xmlns:cp="c"/>',
    'word/_rels/header1.xml.rels': '<Relationships/>',
  })],
  ['relationships', doc(p(r('x')), {}, {docRels: [
    ['rId7', REL('hyperlink'), 'http://example.invalid/a?b&c',
      'External'],
    ['rId8', REL('image'), 'media/none.png']]})],
  ['styles numbering settings', doc(p(r('x'), '<w:pStyle w:val="H2x"/>'),
    {'word/styles.xml': STYLES, 'word/numbering.xml': NUMBERING,
      'word/settings.xml': settingsXml('<w:zoom w:percent="100"/>')})],
  ['runs', doc(p(r('Plain ') + r('bold', '<w:b/>') +
    r(' both', '<w:b/><w:i/>') + r('!')))],
  ['merged runs', doc(p(r('a', '<w:b/>') + r('b', '<w:b/>') +
    '<w:r w:rsidR="00AB"><w:rPr><w:b/></w:rPr><w:t>c</w:t></w:r>'))],
  ['spaces', doc(p(r('  two  ') +
    '<w:r><w:t xml:space="preserve"> x </w:t></w:r>'))],
  ['emoji', doc(p(r('A\u{1F600}中文\u{20BB7}z') +
    r('\u{1F44D}', '<w:i/>')))],
  ['tab and br', doc(p('<w:r><w:t>a</w:t><w:tab/><w:t>b</w:t>' +
    '<w:br/><w:t>c</w:t></w:r>'))],
  ['breaks', doc(p('<w:r><w:t>a</w:t><w:br w:type="page"/>' +
    '<w:br w:type="column"/><w:br w:clear="all"/></w:r>'))],
  ['run-level raw', doc(p('<w:r><w:rPr><w:b/></w:rPr><w:t>a</w:t>' +
    '<w:drawing><wp:inline xmlns:wp="x"/></w:drawing><w:t>b</w:t>' +
    '<w:fldChar w:fldCharType="begin"/><w:sym w:char="F04A"/></w:r>'))],
  ['hyperlink', doc(p(r('See ') +
    '<w:hyperlink r:id="rId9"><w:r><w:t>the </w:t></w:r>' +
    '<w:r><w:rPr><w:b/></w:rPr><w:t>link</w:t></w:r></w:hyperlink>' +
    r('.')))],
  ['fldSimple bookmarks', doc(p('<w:bookmarkStart w:id="0" ' +
    'w:name="bm"/><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t>' +
    '</w:r></w:fldSimple><w:bookmarkEnd w:id="0"/>'))],
  ['extraP', doc('<w:p w14:paraId="1A" xmlns:w14="x">' + r('a') +
    '</w:p>')],
  ['empty paragraphs', doc(p() + '<w:p/>')],
  ['literal U+FFFC', doc(p(r('a￼b')))],
  ['awkward run', doc(p('<w:r w:foo="1"><w:t>hi</w:t></w:r>'))],
  ['run properties', doc(p(r('x', '<w:rStyle w:val="Em"/>' +
    '<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b w:val="0"/>' +
    '<w:i w:val="true"/><w:strike w:val="off"/>' +
    '<w:color w:val="FF0000"/><w:sz w:val="24"/><w:szCs w:val="24"/>' +
    '<w:highlight w:val="yellow"/><w:u w:val="single"/>' +
    '<w:vertAlign w:val="superscript"/>')))],
  ['lossless rule', doc(p(r('x',
    '<w:rFonts w:asciiTheme="minorHAnsi" w:ascii="Arial"/>' +
    '<w:b/><w:b/><w:color w:val="auto" w:themeColor="accent1"/>' +
    '<w:sz w:val="1.5"/><w:i w:val="maybe"/><w:lang w:val="en-GB"/>' +
    '<w14:glow xmlns:w14="z"/>')))],
  ['paragraph properties', doc(p(r('x'),
    '<w:pStyle w:val="Heading1"/>' +
    '<w:keepNext/><w:keepLines w:val="1"/><w:pageBreakBefore/>' +
    '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="3"/></w:numPr>' +
    '<w:spacing w:before="120" w:after="0" w:line="276" ' +
    'w:lineRule="auto"/><w:ind w:left="720" w:hanging="360"/>' +
    '<w:jc w:val="center"/><w:outlineLvl w:val="0"/>' +
    '<w:tabs><w:tab w:val="left" w:pos="1440"/></w:tabs>' +
    '<w:rPr><w:b/></w:rPr>'))],
  ['numPr raw', doc(p(r('x'), '<w:numPr><w:ilvl w:val="0"/>' +
    '<w:ins w:id="1"/></w:numPr><w:ind w:start="5"/>'))],
  ['prototype names', doc(p(r('x',
    '<w:rFonts w:__proto__="x" w:ascii="A"/>' +
    '<w:color w:constructor="y" w:val="1"/><w:__proto__ w:val="1"/>' +
    '<w:constructor/><w:toString w:val="2"/><w:hasOwnProperty/>'),
  '<w:__proto__ w:polluted="1"/><w:spacing w:__proto__="1" ' +
    'w:polluted="1"/><w:ind w:toString="1"/>') +
    '<w:p w:__proto__="1" w:polluted="yes">' + r('y') + '</w:p>')],
  ['sections', doc(p(r('one')) +
    p(r('two'), sect('<w:pgSz w:w="12240" w:h="15840"/>' +
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" ' +
      'w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>' +
      '<w:cols w:space="720"/>')) +
    p(r('three')) +
    sect('<w:headerReference w:type="default" r:id="rId3"/>' +
      '<w:type w:val="continuous"/>' +
      '<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>' +
      '<w:cols w:num="2" w:space="708"/><w:titlePg/>' +
      '<w:docGrid w:linePitch="360"/>', ' w:rsidR="00A1"'))],
  ['no final sectPr', doc(p(r('a'), sect('')) + p(r('b')))],
  ['opaque blocks', doc(p(r('a')) +
    '<w:tbl><w:tr><w:tc>' + p(r('cell')) + '</w:tc></w:tr></w:tbl>' +
    p(r('b')) + '<w:sdt><w:sdtContent>' + p(r('c')) +
    '</w:sdtContent></w:sdt><w:bookmarkEnd w:id="1"/>')],
  ['pPr with attributes', doc(p(r('a'), '').replace('<w:p>',
    '<w:p><w:pPr w:odd="1"><w:jc w:val="left"/></w:pPr>') + p(r('b')))],
  ['second pPr', doc('<w:p>' + r('a') + '<w:pPr/></w:p>')],
  ['body sectPr not last', doc('<w:sectPr/>' + p(r('a')))],
  ['last paragraph sectPr', doc(p(r('a')) + p(r('b'), '<w:sectPr/>'))],
  ['no body', () => buildDocx({'word/document.xml':
    '<w:document xmlns:w="' + W_NS + '"/>'})],
  ['every inline', doc(p(r('a') + '<w:hyperlink/>' + r('b', '<w:b/>') +
    '<w:r><w:br w:type="page"/></w:r>') + '<w:p/>')],
  ['styles', doc(p(r('x'), '<w:pStyle w:val="H2x"/>'),
    {'word/styles.xml': STYLES})],
  ['numbering', doc(p(r('x')), {'word/numbering.xml': NUMBERING})],
  ['strict', strictDocx],
  ['transitional ns', () => buildDocx({'word/document.xml':
    documentXml(p(r('t')), {rootAttrs: ' xmlns:a="http://schemas.' +
      'openxmlformats.org/drawingml/2006/main"'})})],
  ['other prefix', () => buildDocx({'word/document.xml': documentXml(
    '<x:p><x:pPr><x:jc x:val="right"/></x:pPr><x:r><x:rPr>' +
    '<x:b/></x:rPr><x:t>other</x:t><x:tab/></x:r></x:p>',
    {prefix: 'x'})})],
  ['w is not WML in a paragraph', doc('<w:p xmlns:w="urn:other">' +
    '<w:r><w:t>z</w:t></w:r></w:p>')],
  ['levels', doc(p(r('a') +
    '<w:hyperlink r:id="x"><w:r><w:t>h</w:t></w:r></w:hyperlink>' +
    '<w:r><w:drawing/><w:br w:type="page"/><w:instrText>I' +
    '</w:instrText><w:t>￼</w:t></w:r><w:r w:odd="1"><w:t>w' +
    '</w:t></w:r><w:fldSimple w:instr="X"/>stray'))],
  ['__proto__ part', () => buildDocx({['__proto__']:
    documentXml(p(r('x')))}, {main: '__proto__'})],
  ['determinism', doc(p(r('a') +
    '<w:hyperlink><w:r><w:t>h</w:t></w:r></w:hyperlink>') +
    '<w:tbl/>' + p(r('b', '<w:b/>')))],
];
