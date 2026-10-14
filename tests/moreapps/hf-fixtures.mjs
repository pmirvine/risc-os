// Test-only: documents with headers and footers on their pages (Batch
// D P7.2, D13), shaped as Word writes them.
//
//   wordHf(opts) -> Promise<Uint8Array>  a .docx:
//     body       the inside of w:body before its sectPr (default 40
//                paragraphs of text: three or four A4 pages)
//     default, first, even  {hdr?, ftr?}: the inside XML of that
//                type's header / footer part (word/header1.xml,
//                header2.xml... in the order default, first, even;
//                footers likewise; relationships rIdH1.., rIdF1..)
//     titlePg, evenAndOdd  w:titlePg in the sectPr; settings
//                w:evenAndOddHeaders
//     pgMar      {top, bottom, header, footer} twips (Word's 1440,
//                1440, 708, 708 by default; a negative top is exact)
//     pic        PNG bytes: the DEFAULT header's own relationship
//                rIdP1 (word/<dir>_rels/header1.xml.rels, Target
//                relative to the header part) names them, as
//                media/image1.png in the header's folder's parent
//                (Word: word/media/image1.png); picRun('rIdP1') puts
//                one in
//     dir        the folder of the header and footer parts inside
//                word/ ('' as Word; 'hf/' proves targets resolve
//                against the story's part, not the main one)
//     bad        {type: xml}: that type's header part replaced by
//                this XML (one that is no story: kept as bytes)
//   The header and footer roots declare w, r, wp, a and pic as Word
//   does; the document's root w and r only, so a picture in a header
//   is read in the header's own scope.
//   picRun(embed) -> a run holding an inline picture (1 x 0.5 inch)
//     with no namespace declarations of its own
//   BODY(n) -> n paragraphs of words
import {buildDocx, documentXml, settingsXml, relsXml, REL, W_NS,
  R_NS, p, r} from './build-docx.mjs';
import {drawingXml, URIS} from './pic-fixtures.mjs';

const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'
  .split(' ');
const TYPES = ['default', 'first', 'even'];

/** See the header. */
export const BODY = (n) => Array.from({length: n}, (_, i) => p(r(
  Array.from({length: 40}, (_, j) => WORDS[(i + j) % 10]).join(' '))))
  .join('');

/** See the header. */
export const picRun = (embed) => '<w:r>' + drawingXml({embed,
  decl: false}) + '</w:r>';

const root = (name, body) => DECL + `<w:${name} xmlns:w="${W_NS}" ` +
  `xmlns:r="${R_NS}" xmlns:wp="${URIS.wp}" xmlns:a="${URIS.a}" ` +
  `xmlns:pic="${URIS.pic}">${body}</w:${name}>`;

/** See the header. */
export function wordHf(o = {}) {
  const dir = o.dir || '';
  const parts = {}, docRels = [];
  let hrefs = '', frefs = '', nh = 0, nf = 0;
  for (const type of TYPES) {
    const v = o[type];
    if (!v) continue;
    if (v.hdr !== undefined) {
      const name = `header${++nh}.xml`, id = 'rIdH' + nh;
      parts['word/' + dir + name] = (o.bad || {})[type] ??
        root('hdr', v.hdr);
      docRels.push([id, REL('header'), dir + name]);
      hrefs += `<w:headerReference w:type="${type}" r:id="${id}"/>`;
      if (type === 'default' && o.pic) {
        const up = dir ? '../'.repeat(dir.split('/').length - 1) : '';
        parts[`word/${dir}_rels/${name}.rels`] = relsXml([['rIdP1',
          REL('image'), up + 'media/image1.png']]);
        parts['word/media/image1.png'] = o.pic;
      }
    }
    if (v.ftr !== undefined) {
      const name = `footer${++nf}.xml`, id = 'rIdF' + nf;
      parts['word/' + dir + name] = root('ftr', v.ftr);
      docRels.push([id, REL('footer'), dir + name]);
      frefs += `<w:footerReference w:type="${type}" r:id="${id}"/>`;
    }
  }
  const m = {top: 1440, bottom: 1440, header: 708, footer: 708,
    ...(o.pgMar || {})};
  const sect = '<w:sectPr>' + hrefs + frefs +
    '<w:pgSz w:w="11906" w:h="16838"/>' +
    `<w:pgMar w:top="${m.top}" w:right="1440" w:bottom="${m.bottom}" ` +
    `w:left="1440" w:header="${m.header}" w:footer="${m.footer}" ` +
    'w:gutter="0"/>' + (o.titlePg ? '<w:titlePg/>' : '') +
    '</w:sectPr>';
  parts['word/document.xml'] = documentXml((o.body ?? BODY(40)) +
    sect);
  if (o.evenAndOdd) {
    parts['word/settings.xml'] = settingsXml('<w:evenAndOddHeaders/>');
  }
  return buildDocx(parts, {docRels});
}
