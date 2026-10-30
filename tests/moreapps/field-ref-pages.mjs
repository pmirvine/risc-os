// Test-only: the pages of a document with the body paragraphs on
// each (Batch E3), for STYLEREF in headers and footers.
//
//   pagesOf(doc) -> [{i, num, s, header, footer, span}]  the pages
//     of doc laid out with the fake measurer (1000 px) and
//     paginated as Print layout has them; span {first, last}: the
//     ids of the first and last body paragraph shown on the page
//     (a paragraph continued from the page before counts); null for
//     a page with none (./FieldShow pageOn's, what a layout shows a
//     header's STYLEREF with). header, footer: the part names shown
import {DocLayout} from '../../tools/moreapps/!Letters/DocLayout';
import {printGalley} from '../../tools/moreapps/!Letters/PageHF';
import {Pages} from '../../tools/moreapps/!Letters/Pages';
import {pageOn} from '../../tools/moreapps/!Letters/FieldShow';
import {tm} from './word-docs.mjs';

/** See the header. */
export function pagesOf(doc) {
  const L = new DocLayout(doc, tm());
  L.layout(1000);
  const P = new Pages(printGalley(L)).finish();
  return P.list.map((pg, i) => ({i, num: pg.num, s: pg.s, fmt: pg.fmt,
    header: pg.header && pg.header.part || null,
    footer: pg.footer && pg.footer.part || null,
    span: pageOn(pg).span}));
}
