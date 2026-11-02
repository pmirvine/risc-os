// A small PDF reader for the export tests (Batch G1): the objects
// of a file PdfWriter wrote (the streams inflated), and each page's
// text, each Tj's hex decoded through its font's ToUnicode CMap; and
// poppler's pdftotext for one page, where it is installed (an
// independent reader). Test-only: it reads what PdfWriter writes,
// not every PDF.
//
//   readPdf(bytes) -> {pages: [{text, content, fonts, xobjects,
//       gstates, box}], info, objects}  (asserts the header, the
//       %%EOF and that /Kids has /Count pages)
//   objectsOf(bytes) -> Map id -> {dict, data}
//   latin1(bytes) the bytes as a string, one char a byte
//   squash(s)   s without its white space
//   PDFTOTEXT, HAVE_PDFTOTEXT, popplerPage(file, n) -> text  (the
//       tools found by tools/lib/poppler.mjs, as pdf-check finds them)
//   popplerPages(file, {all, raw}) -> [text]  pdftotext's text of
//       every page (one run; it ends each page with a form feed); all:
//       also what is drawn off the page (a crop area far past it);
//       raw: -raw, in the order the content stream draws it (and
//       without the reading order's changes: no end-of-line hyphen
//       taken away, no text drawn twice in one place dropped)
//   charsOf(text, sets) -> the characters of text but white space,
//       U+FFFD and the code points in sets (the export's missing),
//       sorted: a page's text as a multiset of characters
//   popplerMismatches(file, pages, sets) -> [message]  pdftotext's
//       pages (all, raw) against pages (the text drawn on each, in
//       order), white space, U+FFFD and sets' code points left out:
//       [] when every page's text is equal and the counts agree; a
//       message says which characters differ (charsOf), or that the
//       same ones come in another order
//   withCmapEntry(bytes, from, to) -> bytes  the file rebuilt (every
//       stream deflated again, the xref worked out afresh) with each
//       ToUnicode bfchar entry that maps to <from> (4 hex digits) now
//       mapping to <to>: a mutation, for proving a check fails
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {popplerTool} from '../../tools/lib/poppler.mjs';

export const PDFTOTEXT = popplerTool('pdftotext');
export const HAVE_PDFTOTEXT = !!PDFTOTEXT;

export const latin1 = (b) => Buffer.from(b).toString('latin1');

/** The objects of a PDF: Map id -> {dict, data} (data inflated). */
export function objectsOf(bytes) {
  const s = latin1(bytes);
  const out = new Map();
  let at = 0;
  for (;;) {
    const m = /(\d+) 0 obj\n/g;
    m.lastIndex = at;
    const hit = m.exec(s);
    if (!hit) break;
    const start = hit.index + hit[0].length;
    const end = s.indexOf('\nendobj', start);
    const st = s.indexOf('\nstream\n', start);
    if (st >= 0 && st < end) {
      const dict = s.slice(start, st);
      const len = Number(/\/Length (\d+)/.exec(dict)[1]);
      let data = Buffer.from(bytes.subarray(st + 8, st + 8 + len));
      if (dict.includes('/FlateDecode')) data = zlib.inflateSync(data);
      out.set(Number(hit[1]), {dict, data});
      at = st + 8 + len;
    } else {
      out.set(Number(hit[1]), {dict: s.slice(start, end), data: null});
      at = end;
    }
  }
  return out;
}

/** A ToUnicode CMap's map: cid -> text. */
function cmapOf(text) {
  const map = new Map();
  const u16 = (h) => {
    const cs = [];
    for (let i = 0; i < h.length; i += 4) {
      cs.push(parseInt(h.slice(i, i + 4), 16));
    }
    return String.fromCharCode(...cs);
  };
  for (const blk of text.split('beginbfchar').slice(1)) {
    const body = blk.slice(0, blk.indexOf('endbfchar'));
    const pairs = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    for (const m of body.matchAll(pairs)) {
      map.set(parseInt(m[1], 16), u16(m[2]));
    }
  }
  for (const blk of text.split('beginbfrange').slice(1)) {
    const body = blk.slice(0, blk.indexOf('endbfrange'));
    for (const m of body.matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const a = parseInt(m[1], 16), b = parseInt(m[2], 16);
      const first = u16(m[3]);
      for (let c = a; c <= b; c++) {
        map.set(c, first.slice(0, -1) + String.fromCharCode(
          first.charCodeAt(first.length - 1) + c - a));
      }
    }
  }
  return map;
}

const ref = (dict, key) => {
  const m = new RegExp('/' + key + ' (\\d+) 0 R').exec(dict);
  return m ? Number(m[1]) : null;
};

/** The file read back: {pages: [{text, content, fonts, xobjects,
 *  gstates, box}], info, objects}. */
export function readPdf(bytes) {
  const objs = objectsOf(bytes);
  assert.equal(latin1(bytes.subarray(0, 8)), '%PDF-1.7');
  assert.ok(latin1(bytes.subarray(bytes.length - 6)).includes('%%EOF'));
  const tree = objs.get(2).dict;
  const kids = [...tree.slice(tree.indexOf('/Kids')).matchAll(
    /(\d+) 0 R/g)].map((m) => Number(m[1]));
  const count = Number(/\/Count (\d+)/.exec(tree)[1]);
  assert.equal(kids.length, count);
  const cmaps = new Map();
  const pages = kids.map((id) => {
    const pd = objs.get(id).dict;
    const box = /\/MediaBox \[([^\]]*)\]/.exec(pd)[1].split(' ')
      .map(Number);
    const content = latin1(objs.get(ref(pd, 'Contents')).data);
    const res = (key) => {
      const m = new RegExp('/' + key + ' <<([^>]*)>>').exec(pd);
      return new Map(m ? [...m[1].matchAll(/\/(\w+) (\d+) 0 R/g)]
        .map((x) => [x[1], Number(x[2])]) : []);
    };
    const fonts = res('Font');
    let text = '', font = null;
    for (const m of content.matchAll(
      /\/(F\d+) [-\d.]+ Tf|<([0-9A-F]*)> Tj/g)) {
      if (m[1]) {
        const fid = fonts.get(m[1]);
        assert.ok(fid, 'font ' + m[1] + ' in the page resources');
        if (!cmaps.has(fid)) {
          const tu = ref(objs.get(fid).dict, 'ToUnicode');
          cmaps.set(fid, cmapOf(latin1(objs.get(tu).data)));
        }
        font = cmaps.get(fid);
        continue;
      }
      for (let i = 0; i < m[2].length; i += 4) {
        const cid = parseInt(m[2].slice(i, i + 4), 16);
        text += font.get(cid) ?? '\uFFFD';
      }
    }
    return {text, content, fonts, xobjects: res('XObject'),
      gstates: res('ExtGState'), box};
  });
  return {pages, info: objs.get(3).dict, objects: objs};
}

export const squash = (s) => s.replace(/\s+/g, '');

/** pdftotext's text of page n (1-based) of the file at f. */
export function popplerPage(f, n) {
  return execFileSync(PDFTOTEXT, ['-f', String(n), '-l', String(n),
    '-enc', 'UTF-8', f, '-'], {encoding: 'utf8'});
}

export function popplerPages(file, {all = false, raw = false} = {}) {
  // (all: a crop area far past the page, so text drawn off it counts)
  const area = all ? ['-x', '-5000', '-y', '-5000', '-W', '20000',
    '-H', '20000'] : [];
  const out = execFileSync(PDFTOTEXT, ['-enc', 'UTF-8',
    ...(raw ? ['-raw'] : []), ...area, file, '-'],
  {encoding: 'utf8', maxBuffer: 1 << 28});
  const pages = out.split('\f');
  pages.pop();                        // (after the last form feed)
  return pages;
}

export function charsOf(text, sets = []) {
  const cs = [];
  for (const c of text) {
    const cp = c.codePointAt(0);
    if (cp === 0xfffd || c.trim() === '') continue;
    if (!sets.some((s) => s.has(cp))) cs.push(c);
  }
  return cs.sort().join('');
}

/** What a has that b lacks, as text (both sorted). */
function less(a, b) {
  const n = new Map();
  for (const c of b) n.set(c, (n.get(c) || 0) + 1);
  let out = '';
  for (const c of a) {
    if (n.get(c) > 0) n.set(c, n.get(c) - 1);
    else out += c;
  }
  return out;
}

export function popplerMismatches(file, pages, sets = []) {
  const got = popplerPages(file, {all: true, raw: true});
  const bad = [];
  if (got.length !== pages.length) {
    bad.push(`pdftotext read ${got.length} pages, not ${pages.length}`);
  }
  const plain = (t) => [...squash(t)].filter((c) => c !== '\ufffd' &&
    !sets.some((x) => x.has(c.codePointAt(0)))).join('');
  pages.forEach((want, i) => {
    const w = plain(want), g = plain(got[i] || '');
    if (w === g) return;
    const cw = charsOf(w), cg = charsOf(g);
    const cut = (t) => JSON.stringify([...t].slice(0, 20).join(''));
    bad.push(cw === cg ? `page ${i + 1}: the same characters, in ` +
      `another order: ${cut(g)}...`
      : `page ${i + 1}: pdftotext lacks ${cut(less(cw, cg))}, has ` +
      `more ${cut(less(cg, cw))}`);
  });
  return bad;
}

export function withCmapEntry(bytes, from, to) {
  const s = latin1(bytes), objs = objectsOf(bytes);
  const head = s.slice(0, s.search(/\d+ 0 obj\n/));
  const trailer = s.slice(s.lastIndexOf('trailer\n'),
    s.lastIndexOf('startxref'));
  const parts = [Buffer.from(head, 'latin1')];
  let at = parts[0].length;
  const offsets = new Map();
  for (const [id, {dict, data}] of objs) {
    offsets.set(id, at);
    let body;
    if (data) {
      let d = data;
      if (latin1(d).includes('begincmap')) {
        d = Buffer.from(latin1(d).split('> <' + from + '>')
          .join('> <' + to + '>'), 'latin1');
      }
      const z = dict.includes('/FlateDecode') ? zlib.deflateSync(d) : d;
      body = Buffer.concat([Buffer.from(id + ' 0 obj\n' +
        dict.replace(/\/Length \d+/, '/Length ' + z.length) +
        '\nstream\n', 'latin1'), z,
      Buffer.from('\nendstream\nendobj\n', 'latin1')]);
    } else {
      body = Buffer.from(id + ' 0 obj\n' + dict + '\nendobj\n',
        'latin1');
    }
    parts.push(body);
    at += body.length;
  }
  const size = Math.max(...objs.keys()) + 1;
  let xref = 'xref\n0 ' + size + '\n0000000000 65535 f \n';
  for (let id = 1; id < size; id++) {
    const o = offsets.get(id);
    xref += o === undefined ? '0000000000 65535 f \n'
      : String(o).padStart(10, '0') + ' 00000 n \n';
  }
  parts.push(Buffer.from(xref + trailer + 'startxref\n' + at +
    '\n%%EOF\n', 'latin1'));
  return new Uint8Array(Buffer.concat(parts));
}
