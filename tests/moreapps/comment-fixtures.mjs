// Test-only: documents with comments and their marks in the body
// (Batch F1).
//
//   commentParts(comments) -> {parts, docRels}  word/comments.xml
//     (and word/commentsExtended.xml when a comment has a parent or
//     is done) for buildDocx, with their relationships. comments:
//     {id: text | {text, author?, parent?, done?}}: each comment one
//     paragraph of text, w14:paraId the id + 1 in 8 hex digits
//   commentDoc(body, comments?, opts?) -> Promise<Doc>  a .docx built
//     (body the inside of w:body) and read; opts {parts, docRels:
//     more of them, read: readDocx's opts}
//   commentBytes(body, comments?, opts?) -> Promise<Uint8Array>  the
//     same, not read
//   cs(id), ce(id)   a w:commentRangeStart / End (directly in a w:p)
//   cr(id)           a run holding a w:commentReference
//   range(id, inner) cs + inner + ce + cr, as Word writes a comment
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {buildDocx, documentXml, REL, W_NS, R_NS}
  from './build-docx.mjs';

const DECL = '<?xml version="1.0" encoding="UTF-8" ' +
  'standalone="yes"?>\n';
const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const W15 = 'http://schemas.microsoft.com/office/word/2012/wordml';
const EXT_REL = 'http://schemas.microsoft.com/office/2011/' +
  'relationships/commentsExtended';
const esc = (s) => String(s).replace(/&/g, '&amp;')
  .replace(/</g, '&lt;').replace(/"/g, '&quot;');
const hex = (id) => (Number(id) + 1).toString(16).toUpperCase()
  .padStart(8, '0');

/** See the header. */
export const cs = (id) => `<w:commentRangeStart w:id="${id}"/>`;
/** See the header. */
export const ce = (id) => `<w:commentRangeEnd w:id="${id}"/>`;
/** See the header. */
export const cr = (id) => '<w:r><w:rPr><w:rStyle ' +
  `w:val="CommentReference"/></w:rPr><w:commentReference w:id="${id}"` +
  '/></w:r>';
/** See the header. */
export const range = (id, inner) => cs(id) + inner + ce(id) + cr(id);

/** See the header. */
export function commentParts(comments = {}) {
  let inner = '', ext = '', needExt = false;
  for (const [id, v] of Object.entries(comments)) {
    const c = typeof v === 'string' ? {text: v} : v;
    const author = c.author ?? 'Ann';
    inner += `<w:comment w:id="${id}" w:author="${esc(author)}" ` +
      `w:initials="${esc(author.slice(0, 1))}">` +
      `<w:p w14:paraId="${hex(id)}"><w:r><w:t xml:space="preserve">` +
      `${esc(c.text ?? '')}</w:t></w:r></w:p></w:comment>`;
    if (c.parent !== undefined || c.done) needExt = true;
    ext += `<w15:commentEx w15:paraId="${hex(id)}"` +
      (c.parent !== undefined ? ` w15:paraIdParent="${hex(c.parent)}"`
        : '') + ` w15:done="${c.done ? 1 : 0}"/>`;
  }
  const parts = {'word/comments.xml': DECL + `<w:comments xmlns:w=` +
    `"${W_NS}" xmlns:r="${R_NS}" xmlns:w14="${W14}">${inner}` +
    '</w:comments>'};
  const docRels = [['rIdC1', REL('comments'), 'comments.xml']];
  if (needExt) {
    parts['word/commentsExtended.xml'] = DECL + `<w15:commentsEx ` +
      `xmlns:w15="${W15}">${ext}</w15:commentsEx>`;
    docRels.push(['rIdC2', EXT_REL, 'commentsExtended.xml']);
  }
  return {parts, docRels};
}

/** See the header. */
export function commentBytes(body, comments = {}, opts = {}) {
  const c = commentParts(comments);
  return buildDocx({'word/document.xml': documentXml(body), ...c.parts,
    ...(opts.parts || {})}, {docRels: [...c.docRels,
    ...(opts.docRels || [])]});
}

/** See the header. */
export const commentDoc = async (body, comments = {}, opts = {}) =>
  readDocx(await commentBytes(body, comments, opts), opts.read || {});
