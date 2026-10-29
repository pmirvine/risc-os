// Test-only: documents with footnotes for the notes layout tests
// (Batch E2).
//
//   noteDoc(body, notes?, opts?) -> Doc  a .docx built and read:
//     body   the inside of w:body
//     notes  {id: inner XML of the w:footnote} (normal notes)
//     opts   {seps: false (no separator notes), notice: inner XML of
//            a continuationNotice note, settings: inside of
//            w:settings, styles: a styles.xml, endnotes: {id: inner
//            XML of the w:endnote} (an endnotes part, its separators
//            too, enSeps: false none)}
//   mark(id)       a run holding a w:footnoteReference to note id
//   noteP(text)    a note's paragraph: its own mark, then text
//   emark(id), enoteP(text)  the same for endnotes
//   words(n, w?)   n words of w letters (w 5)
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {buildDocx, documentXml, p, r, REL, W_NS, R_NS, settingsXml}
  from './build-docx.mjs';

const DECL = '<?xml version="1.0" encoding="UTF-8" ' +
  'standalone="yes"?>\n';
const fn = (attrs, body) => `<w:footnote ${attrs}>${body}</w:footnote>`;
export const SEPS =
  fn('w:type="separator" w:id="-1"', p('<w:r><w:separator/></w:r>')) +
  fn('w:type="continuationSeparator" w:id="0"',
    p('<w:r><w:continuationSeparator/></w:r>'));

/** See the header. */
export const mark = (id) => '<w:r><w:footnoteReference w:id="' + id +
  '"/></w:r>';

/** See the header. */
export const noteP = (text) => p('<w:r><w:footnoteRef/></w:r>' +
  r(' ' + text));

/** See the header. */
export const emark = (id) => '<w:r><w:endnoteReference w:id="' + id +
  '"/></w:r>';

/** See the header. */
export const enoteP = (text) => p('<w:r><w:endnoteRef/></w:r>' +
  r(' ' + text));

const en = (attrs, body) => `<w:endnote ${attrs}>${body}</w:endnote>`;
const EN_SEPS =
  en('w:type="separator" w:id="-1"', p('<w:r><w:separator/></w:r>')) +
  en('w:type="continuationSeparator" w:id="0"',
    p('<w:r><w:continuationSeparator/></w:r>'));

/** See the header. */
export const words = (n, w = 5) => Array.from({length: n},
  () => 'x'.repeat(w)).join(' ');

/** See the header. */
export async function noteDoc(body, notes = {}, opts = {}) {
  let inner = opts.seps === false ? '' : SEPS;
  if (opts.notice !== undefined) {
    inner += fn('w:type="continuationNotice" w:id="1000"', opts.notice);
  }
  for (const [id, xml] of Object.entries(notes)) {
    inner += fn(`w:id="${id}"`, xml);
  }
  const parts = {'word/document.xml': documentXml(body),
    'word/footnotes.xml': DECL + `<w:footnotes xmlns:w="${W_NS}" ` +
      `xmlns:r="${R_NS}">${inner}</w:footnotes>`};
  const docRels = [['rIdN1', REL('footnotes'), 'footnotes.xml']];
  if (opts.endnotes) {
    let e = opts.enSeps === false ? '' : EN_SEPS;
    for (const [id, xml] of Object.entries(opts.endnotes)) {
      e += en(`w:id="${id}"`, xml);
    }
    parts['word/endnotes.xml'] = DECL + `<w:endnotes xmlns:w=` +
      `"${W_NS}" xmlns:r="${R_NS}">${e}</w:endnotes>`;
    docRels.push(['rIdN2', REL('endnotes'), 'endnotes.xml']);
  }
  if (opts.settings !== undefined) {
    parts['word/settings.xml'] = settingsXml(opts.settings);
  }
  if (opts.styles) parts['word/styles.xml'] = opts.styles;
  return readDocx(await buildDocx(parts, {docRels}));
}
