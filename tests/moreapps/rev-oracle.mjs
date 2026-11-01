// Test-only: the tracked-change facts of the corpus (Batch F2). Read
// from the zip and the XML alone (no document model), so the numbers
// do not depend on the code that reads revisions.
//
//   await revFiles() -> [{file, path}]  the corpus files whose
//     word/document.xml, headers, footers or notes have a w:ins,
//     w:del, w:moveFrom or w:moveTo, without the hand-off files
//     made by !Letters (corpus/handoff/tc-*); [] when the corpus is
//     absent. Files over CAPS.bytes or that do not open are left
//     out (the reasons are in revFiles.skipped)
//   await factsOf(file) -> facts  file: a path or the bytes of a
//     .docx. Facts (revisions are the run-level elements; a w:ins
//     or w:del inside w:rPr or w:trPr marks a paragraph mark or a
//     row and is counted as markRev instead):
//       ins, del, moveFrom, moveTo   elements of that name
//       authors        distinct w:author values
//       insideField    revisions holding a field character, an
//                      instruction or a w:fldSimple (or inside one)
//       insidePicture  revisions holding a drawing, pict or object
//       insideTable    revisions inside a w:tbl
//       inHeaderFooter, inNotes   revisions in those parts
//       nested         revisions inside another revision
//       noAuthorOrDate   revisions lacking w:author or w:date
//       otherChange    rPrChange, pPrChange, tblPrChange, trPrChange,
//                      tcPrChange, tblGridChange, sectPrChange,
//                      numberingChange, cellIns, cellDel, cellMerge
//       markRev        paragraph-mark and row ins/del
//       moveMarks      moveFromRangeStart/End, moveToRangeStart/End
//   sumFacts(list) -> the totals
import {readFileSync, statSync} from 'node:fs';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {oracleFiles} from './field-oracle.mjs';
import {nameOf} from './roundtrip-lib.mjs';

export const CAPS = {bytes: 30e6};
const REVS = new Set(['ins', 'del', 'moveFrom', 'moveTo']);
const OTHER = new Set(['rPrChange', 'pPrChange', 'tblPrChange',
  'trPrChange', 'tcPrChange', 'tblGridChange', 'sectPrChange',
  'numberingChange', 'cellIns', 'cellDel', 'cellMerge']);
const MOVE_MARKS = new Set(['moveFromRangeStart', 'moveFromRangeEnd',
  'moveToRangeStart', 'moveToRangeEnd']);
const MARK_PARENTS = new Set(['rPr', 'trPr']);
const FIELD = new Set(['fldChar', 'instrText', 'fldSimple']);
const PICTURE = new Set(['drawing', 'pict', 'object']);
const PART =
  /^word\/(header|footer)\d*\.xml$|^word\/(footnotes|endnotes)\.xml$/;

const local = (n) => String(n.name).split(':').pop();
const attrOf = (n, name) => {
  for (const [k, v] of n.attrs || [])
    if (k.split(':').pop() === name) return v;
  return null;
};
const isNode = (c) => c && typeof c === 'object' && c.name;

/** The names of every element below n. */
function below(n, out = new Set()) {
  for (const k of n.children || []) if (isNode(k)) {
    out.add(local(k));
    below(k, out);
  }
  return out;
}

function scanPart(root, part, f, authors) {
  const inHF = /^word\/(header|footer)/.test(part);
  const inNote = /^word\/(footnotes|endnotes)/.test(part);
  const walk = (n, ctx) => {
    const name = local(n);
    const parent = ctx.parent;
    let c = ctx;
    if (REVS.has(name) && MARK_PARENTS.has(parent)) f.markRev++;
    else if (REVS.has(name)) {
      f[name]++;
      const au = attrOf(n, 'author');
      if (au) authors.add(au);
      if (!au || !attrOf(n, 'date')) f.noAuthorOrDate++;
      if (ctx.rev) f.nested++;
      if (ctx.table) f.insideTable++;
      if (inHF) f.inHeaderFooter++;
      if (inNote) f.inNotes++;
      const names = below(n);
      if (ctx.field || [...FIELD].some((x) => names.has(x)))
        f.insideField++;
      if ([...PICTURE].some((x) => names.has(x))) f.insidePicture++;
      c = {...ctx, rev: true};
    } else if (OTHER.has(name)) f.otherChange++;
    else if (MOVE_MARKS.has(name)) f.moveMarks++;
    else if (name === 'tbl') c = {...ctx, table: true};
    else if (name === 'fldSimple') c = {...ctx, field: true};
    c = {...c, parent: name};
    for (const k of n.children || []) if (isNode(k)) walk(k, c);
  };
  walk(root, {});
}

const zeroes = () => ({ins: 0, del: 0, moveFrom: 0, moveTo: 0,
  authors: 0, insideField: 0, insidePicture: 0, insideTable: 0,
  inHeaderFooter: 0, inNotes: 0, nested: 0, noAuthorOrDate: 0,
  otherChange: 0, markRev: 0, moveMarks: 0});

/** See the header. */
export async function factsOf(file) {
  const bytes = typeof file === 'string' ? readFileSync(file) : file;
  const zip = await readZip(bytes);
  const f = zeroes(), authors = new Set();
  for (const name of zip.keys()) {
    if (name !== 'word/document.xml' && !PART.test(name)) continue;
    let root;
    try { root = parseXml(new TextDecoder().decode(zip.get(name))).root; }
    catch (e) { continue; }
    if (root) scanPart(root, name, f, authors);
  }
  f.authors = authors.size;
  return f;
}

/** See the header. */
export function sumFacts(list) {
  const t = {files: list.length};
  for (const f of list) for (const [k, v] of Object.entries(f))
    t[k] = (t[k] || 0) + Number(v);
  return t;
}

const has = (f) => f.ins + f.del + f.moveFrom + f.moveTo > 0;

/** See the header. */
export async function revFiles() {
  const out = [], skipped = [];
  for (const path of oracleFiles()) {
    const file = nameOf(path);
    if (/^handoff\/tc-/.test(file)) continue;
    try {
      if (statSync(path).size > CAPS.bytes) {
        skipped.push({file, reason: 'over cap'});
        continue;
      }
      if (has(await factsOf(path))) out.push({file, path});
    } catch (e) {
      skipped.push({file, reason: 'unreadable'});
    }
  }
  revFiles.skipped = skipped;
  return out;
}
