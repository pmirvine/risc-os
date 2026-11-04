// doc-corpus (.doc import, task 16): the corpus walkers and the
// measures the .doc hostile, corpus, cross-check and round-trip
// tests share (as ./odt-corpus.mjs is for the ODT ones). The corpus
// is optional and git-ignored (tests/moreapps/corpus: the POI .doc
// files and the LibreOffice-made twins in converted/doc, see
// tools/moreapps-corpus.mjs and tools/moreapps-convert.mjs), and so
// are the Word-saved files in tests/moreapps/word-check-out/
// doc-from-word (tools/doc-word-fixtures.mjs): a test using these
// skips when they are absent.
//
//   DOC_DIRS                 the three directories, absolute
//   docFiles() -> [path]     every .doc under them (sorted)
//   docName(path)            the path relative to tests/moreapps
//                            ('corpus/poi-doc/x.doc',
//                            'word-check-out/doc-from-word/x.doc')
//   wordMade(path) -> bool   saved by real Word (doc-from-word)
//   docTwins() -> [{doc, docx, name, who}]  each .doc with the .docx
//       it was made from: converted/doc/<rel>.doc and the corpus's
//       <rel>.docx (who 'LibreOffice'); a Word-saved fix-X.doc and
//       its fix-X.docx, or a Word-saved X.doc and the corpus .docx
//       of that name (who 'Word')
//   docStats(doc) -> ./odt-corpus.mjs statsOf plus footnotes and
//       endnotes (the normal ones: not separators)
//   readTimed(bytes, read, opts) -> {r, err, ms}  read(bytes, opts)
//       timed; err the error thrown (r null)
//   mulberry32(seed) -> () => [0, 1)   the seeded generator the
//       fuzz tests use
//   mutateDoc(built, r) -> {bytes, how}  a mutated copy of a .doc
//       built by ./doc-helpers.mjs (formattedDoc / ./doc-review-
//       helpers.mjs reviewDoc: {streams, pn}): 1 to 4 of: a byte
//       flipped at a structure offset (the FIB, the start of a table
//       stream blob, an FKP page, the Data stream's PICF), a byte set
//       at a random offset of a stream, a stream cut short, a 4-byte
//       value of a structure zeroed, set to 2^32 - 1 or 10^9 or
//       copied from the one before (counts, CPs, offsets), two of the
//       FIB's fc/lcb pairs swapped; or (one in ten) bytes of the
//       packed container itself changed. how says what was done
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CORPUS, statsOf} from './odt-corpus.mjs';
import {packDoc} from './doc-helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const DOC_DIRS = ['corpus/poi-doc', 'corpus/converted/doc',
  'word-check-out/doc-from-word'].map((d) => path.join(HERE, d));

function find(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const q = path.join(dir, e.name);
    if (e.isDirectory()) find(q, ext, out);
    else if (e.name.toLowerCase().endsWith(ext)) out.push(q);
  }
  return out;
}

export const docFiles = () => DOC_DIRS.flatMap((d) => find(d, '.doc'))
  .sort();

export const docName = (f) => path.relative(HERE, f).split(path.sep)
  .join('/');

export const wordMade = (f) => docName(f)
  .startsWith('word-check-out/doc-from-word/');

export function docTwins() {
  const out = [];
  const conv = path.join(CORPUS, 'converted', 'doc');
  for (const f of find(conv, '.doc').sort()) {
    const rel = path.relative(conv, f).replace(/\.doc$/i, '.docx');
    const x = path.join(CORPUS, rel);
    if (fs.existsSync(x)) {
      out.push({doc: f, docx: x, name: rel.split(path.sep).join('/'),
        who: 'LibreOffice'});
    }
  }
  const word = DOC_DIRS[2];
  const all = find(word, '.doc').sort();
  const docx = all.length ? find(CORPUS, '.docx') : [];
  for (const f of all) {
    const own = f.replace(/\.doc$/i, '.docx');
    const base = path.basename(own);
    const x = fs.existsSync(own) ? own
      : docx.find((p) => path.basename(p) === base);
    if (x) out.push({doc: f, docx: x, name: docName(f), who: 'Word'});
  }
  return out;
}

const normal = (m) => [...(m || new Map()).values()].filter((n) =>
  n.type === 'normal' || n.type === undefined).length;

export function docStats(doc) {
  const st = statsOf(doc);
  st.footnotes = normal(doc.notes && doc.notes.footnotes);
  st.endnotes = normal(doc.notes && doc.notes.endnotes);
  return st;
}

export function readTimed(bytes, read, opts = {}) {
  const t0 = performance.now();
  let r = null, err = null;
  try {
    r = read(bytes, opts);
  } catch (e) {
    err = e;
  }
  return {r, err, ms: performance.now() - t0};
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, a) => a[Math.floor(r() * a.length)];
const int = (r, n) => Math.floor(r() * n);

export function mutateDoc(built, r) {
  const s0 = built.streams;
  const L = s0.layout;
  const s = {...s0, word: s0.word.slice(), table: s0.table.slice(),
    streams: Object.fromEntries(Object.entries(s0.streams || {})
      .map(([k, v]) => [k, v.slice()]))};
  const how = [];
  if (r() < 0.1) {
    const b = packDoc(s);
    for (let k = 1 + int(r, 8); k; k--) {
      const at = int(r, b.length);
      b[at] = int(r, 256);
      how.push('container ' + at);
    }
    return {bytes: b, how: how.join(', ')};
  }
  const names = () => ['word', 'table', ...Object.keys(s.streams)];
  const get = (n) => (n === 'word' || n === 'table' ? s[n]
    : s.streams[n]);
  const set = (n, v) => {
    if (n === 'word' || n === 'table') s[n] = v;
    else s.streams[n] = v;
  };
  // structure offsets: [stream, offset]
  const fibEnd = L.fib.blob + 8 * 0x5D;
  const spots = () => {
    const out = [];
    for (let i = 0; i < Math.min(fibEnd, s.word.length); i += 2) {
      out.push(['word', i]);
    }
    for (const at of Object.values(L.tableAt)) {
      for (let i = 0; i < 24; i++) out.push(['table', at + i]);
    }
    if (built.pn) {
      for (let i = built.pn * 512; i < s.word.length; i += 7) {
        out.push(['word', i]);
      }
    }
    if (s.streams.Data) {
      for (let i = 0; i < 96; i++) out.push(['Data', i]);
    }
    return out.filter(([n, i]) => i < get(n).length);
  };
  const pairs = Object.keys(L.tableAt).map((n) => L.fib.pair(n))
    .filter((o) => o >= 0);
  for (let k = 1 + int(r, 4); k; k--) {
    const kind = int(r, 6);
    if (kind === 0) {
      const sp = spots();
      if (!sp.length) continue;
      const [n, at] = pick(r, sp);
      get(n)[at] ^= 1 << int(r, 8);
      how.push(`flip ${n} ${at}`);
    } else if (kind === 1) {
      const n = pick(r, names()), b = get(n);
      if (!b.length) continue;
      const at = int(r, b.length);
      b[at] = int(r, 256);
      how.push(`byte ${n} ${at}`);
    } else if (kind === 2) {
      const n = pick(r, names()), b = get(n);
      const len = int(r, b.length + 1);
      set(n, b.slice(0, len));
      how.push(`cut ${n} ${len}`);
    } else if (kind === 3) {
      const sp = spots();
      if (!sp.length) continue;
      const [n, at0] = pick(r, sp);
      const b = get(n), at = at0 & ~1;
      if (at + 4 > b.length) continue;
      const dv = new DataView(b.buffer, b.byteOffset, b.length);
      const v = pick(r, ['zero', 'max', 'big', 'dup']);
      if (v === 'zero') dv.setUint32(at, 0, true);
      else if (v === 'max') dv.setUint32(at, 0xFFFFFFFF, true);
      else if (v === 'big') dv.setUint32(at, 1e9, true);
      else if (at >= 4) dv.setUint32(at, dv.getUint32(at - 4, true), true);
      how.push(`${v} ${n} ${at}`);
    } else if (kind === 4 && pairs.length > 1) {
      const a = pick(r, pairs), b = pick(r, pairs);
      const w = s.word;
      if (a + 8 > w.length || b + 8 > w.length) continue;
      const t = w.slice(a, a + 8);
      w.copyWithin(a, b, b + 8);
      w.set(t, b);
      how.push(`swap pairs ${a} ${b}`);
    } else {
      // a pair's fc or lcb set to point elsewhere in the table
      if (!pairs.length) continue;
      const a = pick(r, pairs) + 4 * int(r, 2);
      if (a + 4 > s.word.length) continue;
      new DataView(s.word.buffer).setUint32(a, int(r, s.table.length +
        64), true);
      how.push(`pair ${a}`);
    }
  }
  return {bytes: packDoc(s), how: how.join(', ')};
}

export {CORPUS};
