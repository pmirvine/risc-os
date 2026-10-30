// Test-only: the comment facts of the corpus (Batch F1). Read from
// the zip and the XML alone (no document model), so the numbers do
// not depend on the code that reads comments.
//
//   await commentFiles() -> [{file, path}]  the corpus files with a
//     word/comments.xml (file: the name as nameOf gives it), without
//     the hand-off files (corpus/handoff/: made by !Letters, so they
//     say nothing about Word's); [] when the corpus is absent.
//     Files over CAPS.bytes or that do not open are left out (the
//     reasons are in commentFiles.skipped)
//   await factsOf(file) -> facts  file: a path or the bytes of a
//     .docx. Facts:
//       comments       w:comment elements of word/comments.xml
//       replies        commentsExtended entries with paraIdParent
//       resolved       commentsExtended entries with done 1 / true
//       multiPara      comments whose start and end marks are in
//                      different paragraphs (body)
//       inTable        comments with a mark inside a w:tbl
//       emptyRange     comments whose end follows its start at once
//       extendedPart, idsPart, extensiblePart, peoplePart
//                      whether word/commentsExtended.xml,
//                      commentsIds.xml, commentsExtensible.xml and
//                      people.xml exist
//       opaque         comments whose marks are in a header, footer,
//                      note, text box or content control (F1 does
//                      not edit these)
//       orphans        comments with no mark anywhere
//       dangling       distinct mark ids with no comment
//   sumFacts(list) -> the totals (booleans counted as files)
import {readFileSync, statSync} from 'node:fs';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {oracleFiles} from './field-oracle.mjs';
import {nameOf} from './roundtrip-lib.mjs';

export const CAPS = {bytes: 30e6};
const OPAQUE = new Set(['sdt', 'txbxContent']);
const STORY =
  /^word\/(header|footer)\d*\.xml$|^word\/(footnotes|endnotes)\.xml$/;
const MARKS = {commentRangeStart: 's', commentRangeEnd: 'e',
  commentReference: 'r'};

const local = (n) => String(n.name).split(':').pop();
const attrOf = (n, name) => {
  for (const [k, v] of n.attrs || [])
    if (k.split(':').pop() === name) return v;
  return null;
};
const isNode = (c) => c && typeof c === 'object' && c.name;
const blank = (c) => typeof c === 'string' && c.trim() === '';

/** commentFiles' reasons for leaving a file out. */
export async function commentFiles() {
  const out = [], skipped = [];
  for (const path of oracleFiles()) {
    const file = nameOf(path);
    if (/^handoff\//.test(file)) continue;
    try {
      if (statSync(path).size > CAPS.bytes) {
        skipped.push({file, reason: 'over cap'});
        continue;
      }
      const zip = await readZip(readFileSync(path));
      if (zip.has('word/comments.xml')) out.push({file, path});
    } catch (e) {
      skipped.push({file, reason: 'unreadable'});
    }
  }
  commentFiles.skipped = skipped;
  return out;
}

/** Marks of one part: [{id, type, para, table, opaque, part, next}]. */
function marksOf(root, part, out) {
  let paras = 0;
  const walk = (n, ctx) => {
    const name = local(n);
    const c = {...ctx};
    if (name === 'p') c.para = ++paras;
    else if (name === 'tbl') c.table = true;
    else if (OPAQUE.has(name)) c.opaque = true;
    const kids = n.children || [];
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      if (!isNode(k)) continue;
      const type = MARKS[local(k)];
      if (type) {
        let j = i + 1;
        while (j < kids.length && blank(kids[j])) j++;
        const nx = isNode(kids[j]) ? kids[j] : null;
        out.push({id: attrOf(k, 'id'), type, para: c.para || 0,
          table: !!c.table, opaque: !!c.opaque ||
            part !== 'word/document.xml',
          next: nx && MARKS[local(nx)] === 'e' ? attrOf(nx, 'id') : null});
      } else walk(k, c);
    }
  };
  walk(root, {});
}

const parse = async (zip, name) => {
  const b = zip.get(name);
  if (!b) return null;
  try { return parseXml(new TextDecoder().decode(b)).root; }
  catch (e) { return null; }
};
const all = (n, name, out = []) => {
  if (!isNode(n)) return out;
  if (local(n) === name) out.push(n);
  for (const k of n.children || []) all(k, name, out);
  return out;
};

/** See the header. */
export async function factsOf(file) {
  const bytes = typeof file === 'string' ? readFileSync(file) : file;
  const zip = await readZip(bytes);
  const f = {comments: 0, replies: 0, resolved: 0, multiPara: 0,
    inTable: 0, emptyRange: 0, extendedPart: zip.has(
      'word/commentsExtended.xml'), idsPart: zip.has(
      'word/commentsIds.xml'), extensiblePart: zip.has(
      'word/commentsExtensible.xml'), peoplePart: zip.has(
      'word/people.xml'), opaque: 0, orphans: 0, dangling: 0};
  const cm = await parse(zip, 'word/comments.xml');
  const ids = new Set();
  if (cm) for (const c of all(cm, 'comment')) {
    f.comments++;
    ids.add(String(attrOf(c, 'id')));
  }
  const ex = await parse(zip, 'word/commentsExtended.xml');
  if (ex) for (const e of all(ex, 'commentEx')) {
    if (attrOf(e, 'paraIdParent')) f.replies++;
    if (/^(1|true)$/.test(attrOf(e, 'done') || '')) f.resolved++;
  }
  const marks = [];
  for (const name of zip.keys()) {
    if (name !== 'word/document.xml' && !STORY.test(name)) continue;
    const root = await parse(zip, name);
    if (root) marksOf(root, name, marks);
  }
  const by = new Map();
  for (const m of marks) {
    const k = String(m.id);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(m);
  }
  for (const id of ids) {
    const ms = by.get(id) || [];
    if (!ms.length) { f.orphans++; continue; }
    const s = ms.find((m) => m.type === 's');
    const e = ms.find((m) => m.type === 'e');
    if (s && e && !s.opaque && !e.opaque && s.para !== e.para)
      f.multiPara++;
    if (ms.some((m) => m.table)) f.inTable++;
    if (s && s.next === id) f.emptyRange++;
    if (ms.some((m) => m.opaque)) f.opaque++;
  }
  for (const id of by.keys()) if (!ids.has(id)) f.dangling++;
  return f;
}

/** See the header. */
export function sumFacts(list) {
  const t = {files: list.length};
  for (const f of list) for (const [k, v] of Object.entries(f))
    t[k] = (t[k] || 0) + Number(v);
  return t;
}
