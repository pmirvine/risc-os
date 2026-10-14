// Test-only: fields as Word writes them (Batch D P8.1, D15).
//
//   fld(instr, result, {lock, dirty, nested, rPr}?) -> the runs of a
//     complex field: begin, the instruction as instrText runs,
//     separate, the result as a text run (no separate and no result
//     when result is null), end. `nested` (XML, e.g. another fld())
//     goes where instr holds '{}' (else after instr), so
//     fld('IF {} = 1 "a" "b"', 'b', {nested: fld('PAGE', '1')}) is
//     Word's IF { PAGE } = 1 "a" "b". lock: w:fldLock="1" on the
//     begin; dirty: w:dirty="true"; rPr: the inside of every run's
//     w:rPr
//   begin(o?), sep(), end() -> one fldChar run each (for fields
//     split across paragraphs and cells by hand)
//   instr(text) -> one instrText run (xml:space preserved)
//   fldSimple(instr, result) -> a w:fldSimple holding a result run
//   docWithFields(body, hdrs?, opts?) -> Promise<Doc>: readDocx of a
//     .docx whose body is `body` (./story-fixtures withHeaders: hdrs
//     {default: {hdr?, ftr?}, ...})
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';
import {r} from './build-docx.mjs';
import {withHeaders} from './story-fixtures.mjs';

const esc = (s) => String(s).replace(/&/g, '&amp;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const run = (inner, rPr = '') =>
  `<w:r>${rPr ? '<w:rPr>' + rPr + '</w:rPr>' : ''}${inner}</w:r>`;

/** See the header. */
export function begin(o = {}) {
  const a = (o.lock ? ' w:fldLock="1"' : '') +
    (o.dirty ? ' w:dirty="true"' : '');
  return run(`<w:fldChar w:fldCharType="begin"${a}/>`, o.rPr);
}
/** See the header. */
export const sep = (rPr) =>
  run('<w:fldChar w:fldCharType="separate"/>', rPr);
/** See the header. */
export const end = (rPr) => run('<w:fldChar w:fldCharType="end"/>', rPr);
/** See the header. */
export const instr = (text, rPr) =>
  text ? run(`<w:instrText xml:space="preserve">${esc(text)}` +
    '</w:instrText>', rPr) : '';

/** See the header. */
export function fld(code, result, o = {}) {
  const k = code.indexOf('{}');
  const nested = o.nested || '';
  const codes = k < 0 ? instr(code, o.rPr) + nested
    : instr(code.slice(0, k), o.rPr) + nested +
      instr(code.slice(k + 2), o.rPr);
  const res = result === null ? '' : sep(o.rPr) +
    (result ? r(esc(result), o.rPr) : '');
  return begin(o) + codes + res + end(o.rPr);
}

/** See the header. */
export const fldSimple = (code, result) =>
  `<w:fldSimple w:instr="${esc(code)}">${r(esc(result))}</w:fldSimple>`;

/** See the header. */
export const docWithFields = async (body, hdrs = {}, opts = {}) =>
  readDocx(await withHeaders(body, hdrs, opts));
