// Test-only: a few documents exported as PDF with a fixed clock, and
// a digest of each file that does not depend on the zlib that
// deflated its streams (for pagesrun.test.mjs: exportPdf's output is
// the same before and after its page loop moved to PagesRun).
//
//   goldenCases() -> Promise<[{name, run() -> Promise<bytes>}]>  the
//       documents (loadStyles done first): three pages, a range of
//       them, a PNG and a JPEG picture in a header, web and bookmark
//       links, real font advances (runs fitted, a Tc)
//   digestOf(bytes) -> hex  sha256 over the objects in id order: the
//       id, the dictionary without its /Length value and the stream
//       inflated (pdf-read objectsOf); the xref offsets and lengths
//       follow from those and the deflater, so are left out
//   rawOf(bytes) -> hex  sha256 of the bytes as they are
import crypto from 'node:crypto';
import {exportPdf} from '../../tools/moreapps/!Letters/PdfExport';
import {Document} from '../../tools/moreapps/!Letters/Document';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {bundled, windowOf, raster, metrics} from './pdf-docs.mjs';
import {loadStyles, tm} from './word-docs.mjs';
import {mk} from './edit-docs.mjs';
import {buildDocx, documentXml, p, r, REL, R_NS}
  from './build-docx.mjs';
import {wordHf, picRun, BODY} from './hf-fixtures.mjs';
import {pngBytes, jpegGray} from './pic-fixtures.mjs';
import {objectsOf} from './pdf-read.mjs';

const NOW = () => new Date(Date.UTC(2026, 10, 2, 12, 0, 0));
const tick = (cb) => setImmediate(cb);
const PB = '<w:r><w:br w:type="page"/></w:r>';
const TEXTS = ['Alpha first page', 'Bravo second page',
  'Charlie third page'];

const pagesDoc = (texts) => mk(texts.map((t, i) => (i
  ? [t, {pPr: {pageBreakBefore: true}}] : t)));

const link = (text, n) => '<w:hyperlink ' + (typeof n === 'number'
  ? 'r:id="rIdL' + n + '"' : 'w:anchor="' + n + '"') + '><w:r><w:rPr>' +
  '<w:rStyle w:val="Hyperlink"/></w:rPr><w:t xml:space="preserve">' +
  text + '</w:t></w:r></w:hyperlink>';
const mark = (name, text) => '<w:bookmarkStart w:id="7" w:name="' +
  name + '"/>' + r(text) + '<w:bookmarkEnd w:id="7"/>';

/** The PDF of doc (a Document's doc) laid out with metrics m. */
const pdfOf = (doc, m, opts = {}) => exportPdf(windowOf(doc, m),
  {loader: bundled(), raf: tick, rasterise: raster, now: NOW, ...opts})
  .then((res) => res.bytes);

/** See the header. */
export async function goldenCases() {
  await loadStyles();
  const three = () => pagesDoc(TEXTS).doc;
  const hf = async (pic) => new Document(await readDocx(await wordHf({
    pic, body: p(r('one')) + p(PB + r('two')) + p(PB + r('three')),
    default: {hdr: p(picRun('rIdP1') + r('Logo')),
      ftr: p(r('Foot'))}}))).doc;
  const links = async () => new Document(await readDocx(
    await buildDocx({'word/document.xml': documentXml(
      p(r('Go to ') + link('the site', 1) + r(' or ') +
        link('the end', 'end')) + p(PB + mark('end', 'The end')),
      {rNs: R_NS})}, {docRels: [['rIdL1', REL('hyperlink'),
      'https://example.com/a?b=1', 'External']]}))).doc;
  const words = async () => new Document(await readDocx(await wordHf({
    body: BODY(30), default: {hdr: p(r('Header text')),
      ftr: p(r('Footer text'))}}))).doc;
  return [
    {name: 'three pages', run: () => pdfOf(three(), tm())},
    {name: 'pages 2 to 3', run: () => pdfOf(three(), tm(),
      {from: 2, to: 3})},
    {name: 'PNG header picture', run: async () =>
      pdfOf(await hf(pngBytes(4, 2)), tm())},
    {name: 'JPEG header picture', run: async () =>
      pdfOf(await hf(jpegGray(8, 8)), tm())},
    {name: 'links', run: async () => pdfOf(await links(), tm())},
    {name: 'real advances', run: async () =>
      pdfOf(await words(), metrics())},
  ];
}

const sha = (data) => crypto.createHash('sha256').update(data)
  .digest('hex');

/** dict without the value of its /Length (not /Length1...). */
function unlengthed(dict) {
  const key = '/Length ';
  const i = dict.indexOf(key);
  if (i < 0) return dict;
  let j = i + key.length;
  while (j < dict.length && dict[j] >= '0' && dict[j] <= '9') j++;
  return dict.slice(0, i) + key + dict.slice(j);
}

/** See the header. */
export function digestOf(bytes) {
  const h = crypto.createHash('sha256');
  const objs = objectsOf(bytes);
  for (const id of [...objs.keys()].sort((a, b) => a - b)) {
    const {dict, data} = objs.get(id);
    h.update(id + '\n' + unlengthed(dict) + '\n');
    if (data) h.update(data);
    h.update('\nendobj\n');
  }
  return h.digest('hex');
}

/** See the header. */
export const rawOf = (bytes) => sha(bytes);
