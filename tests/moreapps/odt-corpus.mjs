// odt-corpus (ODT import, task 9): the corpus walkers and the
// measures the ODT corpus, cross-check and round-trip tests share.
// The corpus is optional and git-ignored (tests/moreapps/corpus,
// see tools/moreapps-corpus.mjs and tools/moreapps-convert.mjs): a
// test using these skips when it is absent.
//
//   CORPUS                  tests/moreapps/corpus
//   odtFiles() -> [path]    every .odt under it (sorted), the
//       LibreOffice-made twins in converted/odt included
//   twins() -> [{odt, docx, name}]  each converted/odt/<rel>.odt whose
//       source <rel>.docx exists
//   nameOf(path)            the path relative to CORPUS
//   statsOf(doc) -> {text, paras, tables, lists, comments, pictures}
//       of the body: text the visible text of paragraphs and table
//       cells in reading order (a field's code left out, a text
//       box's text where it is anchored, a block kept whole (a
//       content control) read through), one space for each run of
//       white space and no marks; paras the paragraphs (in cells
//       and blocks kept whole too, not in text boxes), tables the
//       tables (nested too),
//       lists the numbered paragraphs (a numPr
//       of their own or their style's), comments the Doc's
//       comments; symbol-font (private use) characters, zero-width
//       spaces and soft hyphens left out of text
//   ratio(a, b) -> 0..1      the Dice coefficient of the two texts'
//       words (as multisets): 1 when they have the same words
//   hasText(bytes) -> bool   whether content.xml's office:text holds
//       any character that is not white space (a cheap look, for
//       "a document with text reads with text")
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {OBJ} from '../../tools/moreapps/!Letters/Model';
import {readZip} from '../../tools/moreapps/!WimpLib/Zip';

export const CORPUS = fileURLToPath(new URL('./corpus/', import.meta.url));

function find(dir, ext, out = []) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const q = path.join(dir, e.name);
    if (e.isDirectory()) find(q, ext, out);
    else if (e.name.toLowerCase().endsWith(ext)) out.push(q);
  }
  return out;
}

export const nameOf = (f) => path.relative(CORPUS, f).split(path.sep)
  .join('/');

export const odtFiles = () => (fs.existsSync(CORPUS)
  ? find(CORPUS, '.odt').sort() : []);

export function twins() {
  const dir = path.join(CORPUS, 'converted', 'odt');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const odt of find(dir, '.odt').sort()) {
    const rel = path.relative(dir, odt).replace(/\.odt$/i, '.docx');
    const docx = path.join(CORPUS, rel);
    if (fs.existsSync(docx)) out.push({odt, docx, name: rel});
  }
  return out;
}

const fldType = (x) => {
  const t = (x.node.attrs || []).find((a) => a[0] === 'w:fldCharType');
  return t && t[1];
};

const HIDDEN = new Set(['w:instrText', 'w:delInstrText', 'w:rPr',
  'w:pPr', 'w:object', 'w:footnoteReference', 'w:endnoteReference',
  'w:commentReference', 'w:annotationRef', 'w:fldChar', 'm:oMath',
  'm:oMathPara', 'w:sdtPr', 'w:sdtEndPr', 'mc:Fallback', 'wp:docPr',
  'v:textpath']);

/** The text a kept-whole node shows: w:t, tabs, a text box's text
 *  (mc:AlternateContent's choice only), a space after a paragraph. */
function nodeText(n, out) {
  if (!n || typeof n !== 'object' || HIDDEN.has(n.name)) return;
  if (n.name === 'w:t' || n.name === 'w:delText') {
    for (const c of n.children || []) {
      if (typeof c === 'string') out.push(c);
    }
    return;
  }
  if (n.name === 'w:tab' || n.name === 'w:br' || n.name === 'w:cr') {
    return void out.push(' ');
  }
  for (const c of n.children || []) nodeText(c, out);
  if (n.name === 'w:p') out.push(' ');
}

/** Paragraphs and tables in a kept-whole block (text boxes' left
 *  out). */
function countIn(n, st) {
  if (!n || typeof n !== 'object' || n.name === 'w:txbxContent' ||
    HIDDEN.has(n.name)) return;
  if (n.name === 'w:p') st.paras++;
  if (n.name === 'w:tbl') st.tables++;
  for (const c of n.children || []) countIn(c, st);
}

/** A paragraph's visible text (field codes left out). */
function paraText(p) {
  let s = '';
  const open = [];
  for (let i = 0; i < p.text.length; i++) {
    const c = p.text[i];
    const inCode = open.includes(true);
    if (c !== OBJ) {
      if (!inCode) s += c;
      continue;
    }
    const x = p.inlines[String(i)];
    if (!x) continue;
    if (x.kind === 'raw' && x.node && x.node.name === 'w:fldChar') {
      const v = fldType(x);
      if (v === 'begin') open.push(true);
      else if (v === 'separate' && open.length) open[open.length - 1] = false;
      else if (v === 'end') open.pop();
      continue;
    }
    if (inCode) continue;
    if (x.kind === 'raw' && x.node) {
      const o = [];
      nodeText(x.node, o);
      s += o.join('');
    } else if (typeof x.text === 'string') s += x.text;
  }
  return s;
}

// (symbol-font characters (a w:sym reads as none, its ODT as U+F0xx),
// zero-width spaces and soft hyphens are not compared)
const squash = (s) => s.replace(/[\u200b\u00ad\ue000-\uf8ff]/g, '')
  .replace(/\s+/g, ' ').trim();

/** Whether paragraph p is numbered: by its numPr or its style's
 *  (basedOn followed); numId 0 is none. */
function numbered(doc, p) {
  const on = (pPr) => pPr && pPr.numPr && pPr.numPr.numId !== undefined
    ? Number(pPr.numPr.numId) !== 0 : undefined;
  const own = on(p.pPr);
  if (own !== undefined) return own;
  const styles = doc.styles && doc.styles.styles;
  let id = p.pStyle;
  for (let i = 0; i < 16 && id && styles instanceof Map; i++) {
    const s = styles.get(id);
    if (!s) break;
    const v = on(s.pPr);
    if (v !== undefined) return v;
    id = s.basedOn;
  }
  return false;
}

/** See the header. */
export function statsOf(doc) {
  const st = {text: [], paras: 0, tables: 0, lists: 0, pictures: 0,
    comments: doc.comments && doc.comments.map ? doc.comments.map.size
      : 0};
  const stack = doc.sections.flatMap((s) => s.blocks).reverse();
  while (stack.length) {
    const b = stack.pop();
    if (b.type === 'tbl') {
      st.tables++;
      const inner = [];
      for (const r of b.rows) for (const c of r.cells) inner.push(...c.blocks);
      stack.push(...inner.reverse());
    } else if (b.type !== 'p') {
      if (b.node) {
        countIn(b.node, st);
        const o = [];
        nodeText(b.node, o);
        st.text.push(o.join(''));
      }
    } else {
      st.paras++;
      if (numbered(doc, b)) st.lists++;
      for (const x of Object.values(b.inlines || {})) {
        if (x.kind === 'raw' && x.node && x.node.name === 'w:drawing') {
          st.pictures++;
        }
      }
      st.text.push(paraText(b));
    }
  }
  st.text = squash(st.text.join(' ').replaceAll(OBJ, ' '));
  return st;
}

/** See the header. */
export function ratio(a, b) {
  const words = (s) => s.split(' ').filter(Boolean);
  const wa = words(a), wb = words(b);
  if (!wa.length && !wb.length) return 1;
  const bag = new Map();
  for (const w of wa) bag.set(w, (bag.get(w) || 0) + 1);
  let common = 0;
  for (const w of wb) {
    const n = bag.get(w);
    if (n) {
      common++;
      bag.set(w, n - 1);
    }
  }
  return 2 * common / (wa.length + wb.length);
}

/** See the header. */
export async function hasText(bytes) {
  let files;
  try {
    files = await readZip(bytes);
  } catch {
    return false;
  }
  const c = files.get('content.xml');
  if (!c) return false;
  const s = new TextDecoder().decode(c);
  const at = s.indexOf('<office:text');
  if (at < 0) return false;
  // (the characters between tags, declarations' and tracked changes'
  // left out)
  const body = s.slice(at).replace(/<text:tracked-changes[\s\S]*?<\/text:tracked-changes>/g, '')
    .replace(/<text:(sequence|variable|user-field)-decls[\s\S]*?<\/text:\1-decls>/g, '')
    .replace(/<office:annotation[\s\S]*?<\/office:annotation>/g, '')
    .replace(/<svg:(desc|title)>[\s\S]*?<\/svg:\1>/g, '');
  return /<\/?[^>]*>\s*[^<\s]/.test(body.replace(/^<office:text[^>]*>/, ''));
}
