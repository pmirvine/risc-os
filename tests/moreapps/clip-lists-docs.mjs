// Test-only documents and helpers for lists, borders, shading and
// tab stops pasted from one !Word document into another (question
// L6: clip-lists.test.mjs, clip-lists-paste.test.mjs and the real-Word
// hand-off handoff-cliplists.mjs).
//
//   SOURCE_PARAS   the source's paragraphs (list-fixtures numIds: 2
//                  multilevel, 3 its restarted twin at 5, 1 bullets;
//                  a bordered, shaded paragraph with tab stops)
//   sourceDocx(opts) -> Promise<bytes>  them in a document (opts:
//                  paras, numbering, styles; strict:
//                  every part Strict, ind w:start, lvlJc start)
//   strictDocx(body) -> Promise<bytes>  a Strict document
//   open(bytes) -> Promise<Document>
//   copyPaste(src, sel, dst, at) -> sel  copy in src, paste in dst as
//                  ./EditClip does (store, HTML marker, pick)
//   labelTexts(d) -> [label text or null] per block
//   state(d)       a deep copy of what a paste can change
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {Document} from '../../tools/moreapps/!Word/Document';
import {slice} from '../../tools/moreapps/!Word/ClipSlice';
import {toHtml} from '../../tools/moreapps/!Word/ClipHtml';
import {ClipStore} from '../../tools/moreapps/!Word/ClipStore';
import {pick} from '../../tools/moreapps/!Word/ClipPick';
import {pasteBlocks} from '../../tools/moreapps/!Word/ClipPaste';
import {labels} from '../../tools/moreapps/!Word/ListNumbers';
import {buildDocx, documentXml, p, r, STRICT_W_NS, STRICT_R_NS}
  from './build-docx.mjs';
import {NUMBERING, STYLES_LIST, item} from './list-fixtures.mjs';
import {parseHtml} from './html-fake.mjs';

export const BOX = '<w:pBdr><w:top w:val="single" w:sz="4" ' +
  'w:space="1" w:color="auto"/><w:left w:val="double" w:sz="6" ' +
  'w:space="4" w:color="FF0000"/></w:pBdr><w:shd w:val="clear" ' +
  'w:color="auto" w:fill="FFFF00"/><w:tabs><w:tab w:val="left" ' +
  'w:pos="2880"/><w:tab w:val="right" w:leader="dot" w:pos="8640"/>' +
  '</w:tabs><w:ind w:left="360" w:right="360"/><w:jc w:val="right"/>';

export const SOURCE_PARAS = [
  item('One', 2), item('One a', 2, 1), item('Two', 2),
  item('Five (a restart at 5)', 3), item('Six', 3),
  p(r('Boxed\tshaded\tparagraph'), BOX),
  item('A bullet', 1), item('A sub-bullet', 1, 1),
  p(r('After the lists'))];

/** Every left / right of the list parts spelled start / end. */
const toStrict = (s) => s.replace(/w:left=/g, 'w:start=')
  .replace(/w:right=/g, 'w:end=')
  .replace(/(w:(?:lvlJc|jc|tab) w:val=")left"/g, '$1start"')
  .replace(/(w:(?:lvlJc|jc|tab) w:val=")right"/g, '$1end"')
  .replace(/<w:left /g, '<w:start ').replace(/<w:right /g, '<w:end ')
  .split('http://schemas.openxmlformats.org/wordprocessingml/2006/' +
    'main').join(STRICT_W_NS);

/** See the header. */
export function sourceDocx({strict = false, paras = SOURCE_PARAS,
  numbering = NUMBERING, styles = STYLES_LIST} = {}) {
  const fix = strict ? toStrict : (s) => s;
  return buildDocx({'word/document.xml': fix(documentXml(paras.join(''),
    strict ? {ns: STRICT_W_NS, rNs: STRICT_R_NS} : {})),
  'word/styles.xml': fix(styles),
  'word/numbering.xml': fix(numbering)}, {strict});
}

/** See the header. */
export const strictDocx = (body) => buildDocx({'word/document.xml':
  documentXml(body, {ns: STRICT_W_NS, rNs: STRICT_R_NS})},
{strict: true});

/** See the header. */
export const open = async (bytes) => new Document(await readDocx(bytes));

/** See the header. */
export function copyPaste(src, sel, dst, at) {
  const store = new ClipStore();
  const s = slice(src.doc, sel);
  const token = store.put(s, 1);
  const html = toHtml(src.doc, s, {token});
  const x = pick({text: s.plain, html}, {store, docKey: 2, parseHtml});
  if (!x || x.route !== 'exact') throw new Error('not exact');
  return pasteBlocks(dst, at, x.blocks, x.opts);
}

/** See the header. */
export function labelTexts(d) {
  const m = labels(d.doc);
  return d.doc.sections.flatMap((s) => s.blocks).map((b) =>
    (b.type === 'p' && m.has(b.id) ? m.get(b.id).text : null));
}

/** See the header. */
export const state = (d) => structuredClone({sections: d.doc.sections,
  numbering: d.doc.numbering, rels: d.doc.rels, styles: d.doc.styles,
  meta: d.doc.meta});
