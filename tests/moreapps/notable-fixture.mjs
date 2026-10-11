// Test-only: six documents without typed tables (plain, lists,
// borders, breaks, pictures, an Opaque table) laid out by DocLayout,
// and what that layout gave BEFORE Batch C2 made it columns of items
// (commit 8eae01a, the tree after C1 and its fixes), in
// notable-layout.json: every item's {id, kind, y, h, gapAbove,
// gapBelow}, 40 caretRect samples, 40 hitTest samples and the
// selectionRects of 5 selections per document.
// notable-layout.test.mjs lays them out with today's modules and
// compares. To make the snapshot again (only from the pre-C2 code):
//   git archive 8eae01a tools/moreapps | tar -x -C <dir>
//   node tests/moreapps/notable-fixture.mjs <dir>/tools/moreapps
// (writes notable-layout.json next to this file).
import {writeFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {buildDocx, documentXml, stylesXml, numberingXml, settingsXml,
  p, r} from './build-docx.mjs';
import {picDocx, pngBytes} from './pic-fixtures.mjs';

export const VIEW_W = 1000;
const LONG = 'The quick brown fox jumps over the lazy dog, and then ' +
  'runs on through the long grass until the line has to wrap twice.';

const STYLES = stylesXml(
  '<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr>' +
  '</w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160"/>' +
  '</w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
  '<w:name w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name ' +
  'w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/>' +
  '<w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/>' +
  '<w:sz w:val="32"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name ' +
  'w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr>' +
  '<w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>');

const LVL = (i, fmt, text) => `<w:lvl w:ilvl="${i}"><w:start ` +
  `w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/>` +
  `<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (i + 1)}" ` +
  'w:hanging="360"/></w:pPr></w:lvl>';
const NUMBERING = numberingXml(
  '<w:abstractNum w:abstractNumId="0">' + LVL(0, 'decimal', '%1.') +
  LVL(1, 'lowerLetter', '%2)') + '</w:abstractNum>' +
  '<w:abstractNum w:abstractNumId="1">' + LVL(0, 'bullet', '•') +
  '</w:abstractNum>' +
  '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' +
  '<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>');
const li = (text, num, lvl = 0) => p(r(text), '<w:pStyle ' +
  'w:val="ListParagraph"/><w:numPr><w:ilvl w:val="' + lvl + '"/>' +
  '<w:numId w:val="' + num + '"/></w:numPr>');
const BOX = '<w:pBdr><w:top w:val="single" w:sz="8" w:space="4" ' +
  'w:color="FF0000"/><w:left w:val="double" w:sz="4" w:space="4"/>' +
  '<w:bottom w:val="single" w:sz="12" w:space="2"/><w:right ' +
  'w:val="single" w:sz="4" w:space="4"/><w:between w:val="dashed" ' +
  'w:sz="4" w:space="1"/></w:pBdr><w:shd w:val="clear" ' +
  'w:fill="FFFF99"/>';
const SECT = '<w:sectPr><w:type w:val="nextPage"/><w:pgSz ' +
  'w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" ' +
  'w:bottom="1440" w:left="1440"/></w:sectPr>';
// (no w:tblGrid: the reader keeps it Opaque, reason 'grid')
const OPAQUE = '<w:tbl><w:tr><w:tc>' + p(r('cell')) + '</w:tc>' +
  '</w:tr></w:tbl>';
const doc = (body, more = {}) => buildDocx({
  'word/document.xml': documentXml(body),
  'word/styles.xml': STYLES, ...more});

/** The six documents: [[name, Promise<Uint8Array>]]. */
export function notableDocs() {
  return [
    ['plain', doc([
      p(r('A heading'), '<w:pStyle w:val="Heading1"/>'),
      p(r('Bold ', '<w:b/>') + r(LONG) + r(' italic', '<w:i/>')),
      p(''),
      p(r(LONG + ' ' + LONG), '<w:jc w:val="both"/><w:ind ' +
        'w:firstLine="720"/><w:spacing w:line="360" ' +
        'w:lineRule="auto"/>'),
      p(r('Centred and right'), '<w:jc w:val="center"/>'),
      p(r('Exact lines ' + LONG), '<w:spacing w:line="180" ' +
        'w:lineRule="exact"/><w:ind w:left="1440" w:right="720"/>'),
      p(r('Last.') + '<w:r><w:tab/></w:r>' + r('9.50')),
    ].join(''))],
    ['lists', doc([
      p(r('Before the list')),
      li('One ' + LONG, 1), li('Two', 1), li('Two a', 1, 1),
      li('Two b ' + LONG, 1, 1), li('Three', 1),
      p(r('Between')),
      li('A bullet', 2), li('Another bullet', 2),
      p(r('After'), '<w:pStyle w:val="ListParagraph"/>'),
    ].join(''), {'word/numbering.xml': NUMBERING})],
    ['borders', doc([
      p(r('Above the box')),
      p(r('In the box ' + LONG), BOX),
      p(r('Still in it'), BOX),
      p(r('Outside')),
      p(r('Shaded only'), '<w:shd w:val="clear" w:fill="CCCCFF"/>'),
      p(r('Bottom rule ' + LONG), '<w:pBdr><w:bottom w:val="single"' +
        ' w:sz="18" w:space="8"/></w:pBdr>'),
      p(r('The end')),
    ].join(''))],
    ['breaks', doc([
      p(r('Before a page break') + '<w:r><w:br w:type="page"/></w:r>' +
        r('after it')),
      p(r('Ends the first section'), SECT),
      p(r('Page break before'), '<w:pageBreakBefore/>'),
      p(r('Column') + '<w:r><w:br w:type="column"/></w:r>'),
      p('<w:r><w:br w:type="page"/></w:r>'),
      p(r('Line') + '<w:r><w:br/></w:r>' + r('break ' + LONG)),
    ].join(''), {'word/settings.xml': settingsXml(
      '<w:defaultTabStop w:val="720"/>')})],
    ['pictures', picDocx({pics: [{}, {cx: 2743200, cy: 1828800,
      bytes: pngBytes(8, 6)}], body: [
      p(r('Text around ') + '<w:r><w:tab/></w:r>' + r(LONG)),
      p(r('More text')),
    ].join('')})],
    ['opaque', doc([
      p(r('Before the table ' + LONG)),
      OPAQUE,
      p(r('Between two')),
      OPAQUE,
      OPAQUE,
      p(r('After')),
    ].join(''))],
  ];
}

/** 8 px per UTF-16 unit, 9 when bold (as ./word-docs fake). */
const fake = (t, css) => (css.includes('bold') ? 9 : 8) * t.length;
const end = (it) => (it.kind === 'p' ? it.block.text.length : 1);

/** What a layout L gives (plain data: what JSON keeps). */
export function sample(L) {
  const {items} = L;
  const n = items.length;
  const out = {items: items.map((it) => ({id: it.id, kind: it.kind,
    y: it.y, h: it.h, gapAbove: it.gapAbove, gapBelow: it.gapBelow}))};
  out.carets = [];
  for (let k = 0; k < 40; k++) {
    const it = items[(k * 7) % n];
    const off = Math.floor(end(it) * ((k * 13) % 11) / 10);
    const aff = k % 2 ? 'up' : 'down';
    const pos = {id: it.id, off};
    out.carets.push({pos, aff, rect: L.caretRect(pos, aff)});
  }
  out.hits = [];
  const x0 = L.left - 30, xw = L.textW + 60;
  for (let k = 0; k < 40; k++) {
    const x = x0 + xw * ((k * 17) % 40) / 39;
    const y = L.height * k / 39 - 10;
    out.hits.push({x, y, hit: L.hitTest(x, y)});
  }
  const first = items[0], last = items[n - 1];
  const mid = items[n >> 1];
  const S = (a, h) => ({anchor: a, head: h});
  const sels = [
    [S({id: first.id, off: 0}, {id: last.id, off: end(last)})],
    [S({id: mid.id, off: 0}, {id: mid.id, off: end(mid)})],
    [S({id: last.id, off: end(last)}, {id: items[1].id, off: 1})],
    [S({id: first.id, off: 1}, {id: last.id, off: 0}),
      mid.y, mid.y + mid.h],
    [S({id: items[1].id, off: 0}, {id: items[n - 2].id, off: 2})],
  ];
  out.rects = sels.map(([sel, y0, y1]) => L.selectionRects(sel,
    y0 ?? -Infinity, y1 ?? Infinity));
  return JSON.parse(JSON.stringify(out));
}

/** Lay every document out with the modules in `dir` (old or new). */
export async function sampleAll(dir) {
  const u = (m) => pathToFileURL(dir + '/' + m).href;
  const {readDocx} = await import(u('!Word/DocxRead'));
  const {DocLayout} = await import(u('!Word/DocLayout'));
  const {TextMetrics} = await import(u('!WimpLib/TextMetrics'));
  const out = {};
  for (const [name, bytes] of notableDocs()) {
    const d = await readDocx(await bytes);
    const L = new DocLayout(d, new TextMetrics(fake));
    L.layout(VIEW_W);
    out[name] = sample(L);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = fileURLToPath(new URL('./notable-layout.json',
    import.meta.url));
  writeFileSync(out, JSON.stringify(await sampleAll(process.argv[2]),
    null, 1) + '\n');
  console.log('wrote', out);
}
