// PdfFont (Batch G1, task 3): reads, subsets and embeds the bundled
// TrueType fonts and the RISC OS OpenType (CFF) fonts. The facts the
// tests compare against are read here by a small reader of their own
// (table directory, cmap format 4, hmtx, loca and glyf), not through
// PdfFont. When poppler's pdftotext and pdffonts are installed, a PDF
// made with FontSet is also checked by them.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseSfnt, subsetTtf, FontSet, toUnicodeCmap}
  from '../../tools/moreapps/!WimpLib/PdfFont';
import {PdfWriter} from '../../tools/moreapps/!WimpLib/PdfWrite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../..');
const ttfPath = (leaf) =>
  path.join(ROOT, 'tools/moreapps/!Letters/Fonts', leaf);
const readFont = (p) => new Uint8Array(fs.readFileSync(p));
const LIB = readFont(ttfPath('LiberationSans-Regular'));
const CARLITO = readFont(ttfPath('Carlito-Regular'));
const HOMERTON = readFont(path.join(ROOT,
  'assets/fonts/Homerton-Medium.otf'));

// ---- the test's own font reader ----

const dv = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const tagAt = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2],
  b[o + 3]);

/** Map tag -> {off, len, sum} from the table directory. */
function tables(b) {
  const v = dv(b), t = new Map();
  for (let i = 0; i < v.getUint16(4); i++) {
    const r = 12 + 16 * i;
    t.set(tagAt(b, r), {sum: v.getUint32(r + 4),
      off: v.getUint32(r + 8), len: v.getUint32(r + 12)});
  }
  return t;
}

/** The 32-bit sum of the big-endian words of b[off, off + len). */
function sum32(b, off, len) {
  const v = dv(b);
  let s = 0;
  for (let i = 0; i < len; i += 4) {
    let w = 0;
    for (let k = 0; k < 4; k++) {
      w = w * 256 + (i + k < len ? b[off + i + k] : 0);
    }
    s = (s + w) >>> 0;
  }
  void v;
  return s;
}

/** The glyph of cp by the (3,1) format 4 cmap, read plainly. */
function cmap4(b, cp) {
  const v = dv(b), c = tables(b).get('cmap');
  let sub = -1;
  for (let i = 0; i < v.getUint16(c.off + 2); i++) {
    const r = c.off + 4 + 8 * i;
    if (v.getUint16(r) === 3 && v.getUint16(r + 2) === 1) {
      sub = c.off + v.getUint32(r + 4);
    }
  }
  assert.equal(v.getUint16(sub), 4);
  const n2 = v.getUint16(sub + 6);
  for (let i = 0; i < n2 / 2; i++) {
    const end = v.getUint16(sub + 14 + 2 * i);
    const start = v.getUint16(sub + 16 + n2 + 2 * i);
    if (cp < start || cp > end) continue;
    const delta = v.getUint16(sub + 16 + 2 * n2 + 2 * i);
    const roAt = sub + 16 + 3 * n2 + 2 * i;
    const ro = v.getUint16(roAt);
    if (!ro) return (cp + delta) & 0xffff;
    const g = v.getUint16(roAt + ro + 2 * (cp - start));
    return g ? (g + delta) & 0xffff : 0;
  }
  return 0;
}

/** hmtx advance of gid. */
function hmtxAdvance(b, gid) {
  const v = dv(b), t = tables(b);
  const nhm = v.getUint16(t.get('hhea').off + 34);
  return v.getUint16(t.get('hmtx').off + 4 * Math.min(gid, nhm - 1));
}

/** The bytes of glyph gid (from loca and glyf). */
function glyph(b, gid) {
  const v = dv(b), t = tables(b);
  const long = v.getInt16(t.get('head').off + 50) === 1;
  const loca = t.get('loca').off, glyf = t.get('glyf').off;
  const at = (i) => long ? v.getUint32(loca + 4 * i)
    : 2 * v.getUint16(loca + 2 * i);
  return b.slice(glyf + at(gid), glyf + at(gid + 1));
}

/** Component glyph ids of a composite glyph (none for a simple one). */
function components(g) {
  if (g.length < 10 || dv(g).getInt16(0) >= 0) return [];
  const v = dv(g), out = [];
  let p = 10, flags;
  do {
    flags = v.getUint16(p);
    out.push(v.getUint16(p + 2));
    p += 4 + (flags & 1 ? 4 : 2);
    if (flags & 8) p += 2;
    else if (flags & 0x40) p += 4;
    else if (flags & 0x80) p += 8;
  } while (flags & 0x20);
  return out;
}

/** Bytes a and b equal, b possibly padded with zeros after a. */
function samePadded(a, b) {
  assert.ok(b.length >= a.length && b.length - a.length < 4);
  assert.deepEqual([...b.slice(0, a.length)], [...a]);
  for (let i = a.length; i < b.length; i++) assert.equal(b[i], 0);
}

// ---- PDF pieces read back from the writer ----

const text = (bytes) => Buffer.from(bytes).toString('latin1');

/** Object id from `... /Key n 0 R` in a body. */
function ref(body, key) {
  const at = body.indexOf(key + ' ');
  assert.ok(at >= 0, key + ' in ' + body);
  return Number(body.slice(at + key.length + 1).split(' ')[0]);
}

/** The objects of a font: type0, cid, fd, file, tounicode bodies. */
function fontObjects(w, id) {
  const type0 = w.objs[id].body;
  const lb = type0.indexOf('/DescendantFonts [');
  const cidId = Number(type0.slice(lb + 18).split(' ')[0]);
  const cid = w.objs[cidId].body;
  const fd = w.objs[ref(cid, '/FontDescriptor')].body;
  const fileKey = fd.indexOf('/FontFile2') >= 0 ? '/FontFile2'
    : '/FontFile3';
  const file = fd.indexOf('/FontFile') >= 0
    ? w.objs[ref(fd, fileKey)] : null;
  const tu = w.objs[ref(type0, '/ToUnicode')];
  return {type0, cid, fd, file, cmap: text(tu.bytes)};
}

/** cid -> string from a ToUnicode CMap (bfchar and bfrange). */
function parseCmap(t) {
  const map = new Map();
  const words = t.split(/\s+/);
  const hexOf = (w) => w.slice(1, -1);
  const utf16 = (h) => {
    const u = [];
    for (let i = 0; i < h.length; i += 4) {
      u.push(parseInt(h.slice(i, i + 4), 16));
    }
    return String.fromCharCode(...u);
  };
  for (let i = 0; i < words.length; i++) {
    if (words[i] === 'beginbfchar') {
      for (i++; words[i] !== 'endbfchar'; i += 2) {
        map.set(parseInt(hexOf(words[i]), 16),
          utf16(hexOf(words[i + 1])));
      }
    } else if (words[i] === 'beginbfrange') {
      for (i++; words[i] !== 'endbfrange'; i += 3) {
        const lo = parseInt(hexOf(words[i]), 16);
        const hi = parseInt(hexOf(words[i + 1]), 16);
        const d = utf16(hexOf(words[i + 2]));
        const last = d.charCodeAt(d.length - 1);
        for (let c = lo; c <= hi; c++) {
          map.set(c, d.slice(0, -1) +
            String.fromCharCode(last + c - lo));
        }
      }
    }
  }
  return map;
}

/** cids from an encode() hex string. */
function cids(h) {
  assert.equal(h[0], '<');
  const out = [];
  for (let i = 1; i < h.length - 1; i += 4) {
    out.push(parseInt(h.slice(i, i + 4), 16));
  }
  return out;
}

/** The /W array of a CIDFont as Map cid -> width. */
function widths(cid) {
  const at = cid.indexOf('/W [');
  const toks = [];
  let depth = 0, cur = '';
  for (let i = at + 3; i < cid.length; i++) {
    const c = cid[i];
    if (c === '[' || c === ']') {
      if (cur) toks.push(cur);
      cur = '';
      toks.push(c);
      depth += c === '[' ? 1 : -1;
      if (!depth) break;
    } else if (c === ' ') {
      if (cur) toks.push(cur);
      cur = '';
    } else cur += c;
  }
  const map = new Map();
  for (let i = 1; i < toks.length - 1;) {
    const first = Number(toks[i]);
    assert.equal(toks[i + 1], '[');
    let k = i + 2;
    for (let c = first; toks[k] !== ']'; k++, c++) {
      map.set(c, Number(toks[k]));
    }
    i = k + 1;
  }
  return map;
}

const loaderOf = (fonts) => async (key) => fonts[key.family] || null;
const KEY = {family: 'Liberation Sans', bold: false, italic: false};
const OTF_KEY = {family: 'Homerton', bold: false, italic: false};
const loader = loaderOf({
  'Liberation Sans': {bytes: LIB, kind: 'ttf'},
  'Carlito': {bytes: CARLITO, kind: 'ttf'},
  'Homerton': {bytes: HOMERTON, kind: 'otf'},
});

describe('parseSfnt', () => {
  it('reads Liberation Sans', () => {
    const f = parseSfnt(LIB);
    assert.equal(f.kind, 'ttf');
    assert.equal(f.unitsPerEm, 2048);
    const gA = f.glyphFor(0x41);
    assert.equal(gA, cmap4(LIB, 0x41));
    assert.ok(gA > 0);
    assert.equal(f.advance(gA), hmtxAdvance(LIB, gA));
    assert.equal(f.glyphFor(0x1f600), 0);
    assert.equal(f.glyphFor(-1), 0);
    assert.equal(f.name, 'LiberationSans');
    assert.ok(f.ascent > 0 && f.descent < 0 && f.capHeight > 0);
    assert.equal(f.bbox.length, 4);
    assert.equal(f.italicAngle, 0);
    assert.equal(typeof f.flags, 'number');
    assert.equal(f.numGlyphs, dv(LIB).getUint16(
      tables(LIB).get('maxp').off + 4));
  });

  it('reads an OpenType CFF font', () => {
    const f = parseSfnt(HOMERTON);
    assert.equal(f.kind, 'otf');
    const g = f.glyphFor(0x41);
    assert.ok(g > 0);
    assert.equal(f.advance(g), hmtxAdvance(HOMERTON, g));
    assert.equal(f.name, 'HomertonRegular');
  });

  it('gives null for bytes that are not a font', () => {
    assert.equal(parseSfnt(new TextEncoder().encode('hello world!!')),
      null);
    assert.equal(parseSfnt(new Uint8Array(0)), null);
    assert.equal(parseSfnt(null), null);
    assert.equal(parseSfnt('font'), null);
  });
});

describe('subsetTtf', () => {
  const f = parseSfnt(LIB);
  const gA = f.glyphFor(0x41), gB = f.glyphFor(0x42);

  it('keeps gid 0 and the glyphs asked for', () => {
    assert.deepEqual(components(glyph(LIB, gA)), []);
    assert.deepEqual(components(glyph(LIB, gB)), []);
    const {bytes, newGid} = subsetTtf(LIB, new Set([gA, gB]));
    assert.deepEqual([...newGid], [[0, 0], [gA, 1], [gB, 2]]);
    const s = parseSfnt(bytes);
    assert.equal(s.kind, 'ttf');
    assert.equal(s.numGlyphs, 3);
    assert.equal(s.unitsPerEm, 2048);
    for (const [old, nw] of newGid) {
      assert.equal(s.advance(nw), f.advance(old));
      samePadded(glyph(LIB, old), glyph(bytes, nw));
    }
    const t = tables(bytes);
    assert.ok(!t.has('cmap'));
    for (const tag of ['head', 'hhea', 'maxp', 'hmtx', 'loca',
      'glyf']) assert.ok(t.has(tag), tag);
    for (const [tag, e] of t) {
      assert.equal(e.off % 4, 0, tag + ' aligned');
      if (tag !== 'head') {
        assert.equal(sum32(bytes, e.off, e.len), e.sum, tag + ' sum');
      }
    }
    assert.equal(bytes.length % 4, 0);
    assert.equal(sum32(bytes, 0, bytes.length), 0xb1b0afba);
  });

  it('pulls in the components of a composite glyph', () => {
    const c = parseSfnt(CARLITO);
    const gE = c.glyphFor(0xe9);
    const parts = components(glyph(CARLITO, gE));
    assert.ok(parts.length >= 2, 'é is a composite in Carlito');
    const {bytes, newGid} = subsetTtf(CARLITO, new Set([gE]));
    const closure = new Set([0, gE, ...parts]);
    for (const p of parts) {
      for (const q of components(glyph(CARLITO, p))) closure.add(q);
    }
    assert.equal(parseSfnt(bytes).numGlyphs, closure.size);
    assert.deepEqual(new Set(newGid.keys()), closure);
    assert.equal(newGid.get(gE), 1);
    assert.deepEqual(components(glyph(bytes, 1)),
      parts.map((p) => newGid.get(p)));
    for (const p of parts) {
      samePadded(glyph(CARLITO, p), glyph(bytes, newGid.get(p)));
    }
  });

  it('ignores glyph ids the font does not have', () => {
    const {newGid} = subsetTtf(LIB, new Set([gA, 1e6, -3, 1.5]));
    assert.deepEqual([...newGid.keys()], [0, gA]);
  });

  it('refuses an OpenType CFF font', () => {
    assert.throws(() => subsetTtf(HOMERTON, new Set([1])),
      /PdfFont: /);
  });
});

describe('FontSet', () => {
  it('embeds a TrueType subset as a Type0 CID font', async () => {
    const w = new PdfWriter();
    const fs1 = new FontSet(w, loader);
    assert.equal(await fs1.load(KEY), true);
    const h = fs1.use(KEY, 'Hello, World');
    assert.equal(h.ready, true);
    const again = fs1.use(KEY, 'Hello, World');
    assert.equal(again.name, h.name);
    const e1 = h.encode('Hello');
    const e2 = h.encode('Hello');
    assert.equal(e1, e2);
    const f = parseSfnt(LIB);
    const want = [...'Hello'].reduce((s, ch) =>
      s + f.advance(f.glyphFor(ch.codePointAt(0))), 0) * 12 / 2048;
    assert.ok(Math.abs(h.widthOf('Hello', 12) - want) < 1e-9);
    const ids = await fs1.embed();
    assert.ok(ids.get(h.name) >= 4);
    const o = fontObjects(w, ids.get(h.name));
    assert.ok(o.type0.indexOf('/Subtype /Type0') >= 0);
    assert.ok(o.type0.indexOf('/Encoding /Identity-H') >= 0);
    assert.ok(o.cid.indexOf('/Subtype /CIDFontType2') >= 0);
    assert.ok(o.cid.indexOf('/CIDToGIDMap /Identity') >= 0);
    assert.ok(o.fd.indexOf('/FontFile2') >= 0);
    assert.ok(o.file.flate);
    const plus = o.type0.indexOf('+LiberationSans');
    // a six-letter subset tag before the name
    assert.equal(plus, o.type0.indexOf('/BaseFont /') + 11 + 6);
    // the subset: 'Helo, Wrd' and .notdef, no glyph twice
    const sub = parseSfnt(o.file.bytes);
    assert.equal(sub.numGlyphs, 1 + new Set('Hello, World').size);
    const cmap = parseCmap(o.cmap);
    const cs = cids(e1);
    assert.equal([...cs].map((c) => cmap.get(c)).join(''), 'Hello');
    for (const [cid, s] of cmap) {
      const old = f.glyphFor(s.codePointAt(0));
      assert.equal(sub.advance(cid), f.advance(old));
    }
    assert.equal(cmap.size, sub.numGlyphs - 1);
    const W = widths(o.cid);
    for (let c = 0; c < sub.numGlyphs; c++) {
      assert.ok(Math.abs(W.get(c) - sub.advance(c) * 1000 / 2048) <
        0.001, 'width of ' + c);
    }
    await assert.rejects(fs1.embed(), /PdfFont: /);
    // after embed(): characters already drawn still encode, new ones
    // (not in the subset, /W or ToUnicode) are refused
    assert.equal(h.encode('Hello'), e1);
    assert.throws(() => h.encode('xyz'),
      /PdfFont: encode\(\) after embed\(\)/);
    assert.equal(sub.numGlyphs, 1 + new Set('Hello, World').size);
  });

  it('records a missing code point and draws it as gid 0', async () => {
    const w = new PdfWriter();
    const set = new FontSet(w, loader);
    await set.load(KEY);
    const h = set.use(KEY, 'a\u{1F600}b');
    const cs = cids(h.encode('a\u{1F600}b'));
    assert.equal(cs.length, 3);
    assert.equal(cs[1], 0);
    assert.deepEqual([...set.missing.get('Liberation Sans')],
      [0x1f600]);
    const ids = await set.embed();
    const cmap = parseCmap(fontObjects(w, ids.get(h.name)).cmap);
    assert.equal(cmap.get(cs[0]), 'a');
    assert.equal(cmap.get(cs[2]), 'b');
    assert.ok(!cmap.has(0));
  });

  it('maps astral and composite characters', async () => {
    const w = new PdfWriter();
    const set = new FontSet(w, loader);
    const key = {family: 'Carlito', bold: false, italic: false};
    await set.load(key);
    const h = set.use(key, 'café');
    const ids = await set.embed();
    const o = fontObjects(w, ids.get(h.name));
    const cmap = parseCmap(o.cmap);
    assert.equal(cids(h.encode('café')).map((c) => cmap.get(c))
      .join(''), 'café');
    const sub = parseSfnt(o.file.bytes);
    // the components of é come after the glyphs drawn
    assert.ok(sub.numGlyphs > 5);
  });

  it('writes ToUnicode ranges and surrogate pairs', async () => {
    const w = new PdfWriter();
    const set = new FontSet(w, loader);
    await set.load(KEY);
    const run = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const h = set.use(KEY, run);
    const ids = await set.embed();
    const o = fontObjects(w, ids.get(h.name));
    assert.ok(o.cmap.indexOf('beginbfrange') >= 0);
    const cmap = parseCmap(o.cmap);
    assert.equal(cids(h.encode(run)).map((c) => cmap.get(c)).join(''),
      run);
    // no bundled font has an astral glyph: the CMap writer directly
    const many = new Map();
    for (let c = 1; c <= 250; c++) many.set(c, 0x4e00 + c);
    many.set(300, 0x1f600);
    many.set(301, 0x10ffff);
    many.set(302, 0x41);
    many.set(303, 0x43);
    many.set(0x1fe, 0xfe);              // a range would cross the
    many.set(0x1ff, 0xff);              // CID's last byte here and
    many.set(0x200, 0x100);             // the code's there
    const t = toUnicodeCmap(many);
    assert.ok(t.indexOf('<D83DDE00>') >= 0);
    assert.ok(t.indexOf('<DBFFDFFF>') >= 0);
    const back = parseCmap(t);
    assert.equal(back.size, many.size);
    for (const [c, cp] of many) {
      assert.equal(back.get(c), String.fromCodePoint(cp), 'cid ' + c);
    }
    const counts = t.split('\n').filter((l) =>
      l.endsWith('beginbfchar') || l.endsWith('beginbfrange'))
      .map((l) => Number(l.split(' ')[0]));
    assert.ok(counts.every((n) => n >= 1 && n <= 100), counts);
  });

  it('a font that does not load: valid objects, all missing',
    async () => {
      const w = new PdfWriter();
      const set = new FontSet(w, loader);
      const key = {family: 'Nope', bold: true, italic: true};
      assert.equal(await set.load(key), false);
      const h = set.use(key, 'ab');
      assert.equal(h.ready, true);
      assert.deepEqual(cids(h.encode('ab')), [0, 0]);
      assert.deepEqual([...set.missing.get('Nope Bold Italic')],
        [0x61, 0x62]);
      assert.ok(h.widthOf('ab', 10) > 0);
      const ids = await set.embed();
      const o = fontObjects(w, ids.get(h.name));
      const empty = parseSfnt(o.file.bytes);
      assert.equal(empty.kind, 'ttf');
      assert.equal(empty.numGlyphs, 1);
      assert.equal(widths(o.cid).get(0), 500);
      assert.equal(h.widthOf('ab', 10), 10);
    });

  it('use before load asks for the font', async () => {
    let calls = 0;
    const w = new PdfWriter();
    const set = new FontSet(w, async (k) => {
      calls++;
      return loader(k);
    });
    const h = set.use(KEY, 'x');
    assert.equal(h.ready, false);
    assert.equal(set.pending.length, 1);
    assert.equal(set.missing.size, 0);
    assert.equal(await set.loadPending(), 1);
    assert.equal(set.pending.length, 0);
    const h2 = set.use(KEY, 'x');
    assert.equal(h2.ready, true);
    assert.equal(h2.name, h.name);
    await set.load(KEY);
    assert.equal(calls, 1);
    const ids = await set.embed();
    assert.equal(ids.size, 1);
  });

  it('embeds an OpenType CFF font whole', async () => {
    const w = new PdfWriter();
    const set = new FontSet(w, loader);
    await set.load(OTF_KEY);
    const h = set.use(OTF_KEY, 'Homerton');
    const enc = h.encode('Homerton');
    const f = parseSfnt(HOMERTON);
    assert.deepEqual(cids(enc),
      [...'Homerton'].map((c) => f.glyphFor(c.codePointAt(0))));
    const ids = await set.embed();
    const o = fontObjects(w, ids.get(h.name));
    assert.ok(o.cid.indexOf('/Subtype /CIDFontType0') >= 0);
    assert.ok(o.cid.indexOf('/CIDToGIDMap') < 0);
    assert.ok(o.fd.indexOf('/FontFile3') >= 0);
    assert.equal(o.file.dict.Subtype, '/OpenType');
    assert.deepEqual([...o.file.bytes], [...HOMERTON]);
    const cmap = parseCmap(o.cmap);
    assert.equal(cids(enc).map((c) => cmap.get(c)).join(''),
      'Homerton');
    const W = widths(o.cid);
    for (const c of cids(enc)) {
      assert.ok(Math.abs(W.get(c) - f.advance(c) * 1000 /
        f.unitsPerEm) < 0.001);
    }
  });
});

describe('hostile font bytes', () => {
  const touch = (f) => {
    if (!f) return;
    for (let cp = 0; cp < 0x300; cp += 7) f.advance(f.glyphFor(cp));
    f.glyphFor(0x10ffff);
  };
  const subsetOrError = (b) => {
    try {
      const r = subsetTtf(b, new Set([1, 2, 3, 40, 100]));
      assert.ok(r.bytes instanceof Uint8Array);
    } catch (e) {
      assert.ok(e instanceof Error && e.message.startsWith('PdfFont: '),
        String(e));
    }
  };

  it('truncated fonts give null or a clean error', () => {
    const t0 = Date.now();
    for (const src of [LIB, CARLITO, HOMERTON]) {
      for (let n = 0; n < 2000; n += 13) {
        const b = src.slice(0, n);
        touch(parseSfnt(b));
        subsetOrError(b);
      }
      for (let k = 1; k <= 40; k++) {
        const b = src.slice(0, Math.floor(src.length * k / 41));
        touch(parseSfnt(b));
        subsetOrError(b);
      }
    }
    assert.ok(Date.now() - t0 < 20000);
  });

  it('zero tables and offsets past the end', () => {
    const z = LIB.slice(0, 12);
    dv(z).setUint16(4, 0);
    assert.equal(parseSfnt(z), null);
    assert.throws(() => subsetTtf(z, new Set()), /PdfFont: /);
    const far = LIB.slice();
    const t = tables(far);
    const r = [...t.keys()].indexOf('glyf');
    dv(far).setUint32(12 + 16 * r + 8, far.length - 2);
    assert.equal(parseSfnt(far), null);
    assert.throws(() => subsetTtf(far, new Set([5])),
      /PdfFont: table glyf lies outside the file/);
    const huge = LIB.slice();
    dv(huge).setUint16(4, 0xffff);
    assert.equal(parseSfnt(huge), null);
  });

  it('random corruption never throws from parseSfnt or hangs', () => {
    let seed = 12345;
    const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345)
      >>> 0) / 2 ** 32;
    const t0 = Date.now();
    for (let round = 0; round < 60; round++) {
      const b = (round % 2 ? CARLITO : LIB).slice();
      const t = [...tables(b).values()];
      for (let k = 0; k < 40; k++) {
        const e = t[Math.floor(rnd() * t.length)];
        const at = e.off + Math.floor(rnd() * Math.min(e.len, 4096));
        b[at] = Math.floor(rnd() * 256);
      }
      touch(parseSfnt(b));
      subsetOrError(b);
    }
    assert.ok(Date.now() - t0 < 20000);
  });

  it('a composite whose components run past its end', () => {
    const c = parseSfnt(CARLITO);
    const gE = c.glyphFor(0xe9);
    const b = CARLITO.slice();
    const v = dv(b), t = tables(b);
    const long = v.getInt16(t.get('head').off + 50) === 1;
    const loca = t.get('loca').off, glyf = t.get('glyf').off;
    const at = long ? v.getUint32(loca + 4 * gE)
      : 2 * v.getUint16(loca + 2 * gE);
    const end = long ? v.getUint32(loca + 4 * gE + 4)
      : 2 * v.getUint16(loca + 2 * gE + 2);
    for (let p = glyf + at + 10; p + 1 < glyf + end; p += 2) {
      v.setUint16(p, 0x0021);         // MORE_COMPONENTS, word args
    }
    assert.throws(() => subsetTtf(b, new Set([gE])),
      /PdfFont: composite glyph/);
  });

  it('a composite that names itself', () => {
    const c = parseSfnt(CARLITO);
    const gE = c.glyphFor(0xe9);
    const b = CARLITO.slice();
    const v = dv(b), t = tables(b);
    const long = v.getInt16(t.get('head').off + 50) === 1;
    const loca = t.get('loca').off, glyf = t.get('glyf').off;
    const at = long ? v.getUint32(loca + 4 * gE)
      : 2 * v.getUint16(loca + 2 * gE);
    v.setUint16(glyf + at + 12, gE);
    const {newGid} = subsetTtf(b, new Set([gE]));
    assert.ok(newGid.has(gE));
  });
});

const POPPLER = '/opt/homebrew/bin';
const havePoppler = fs.existsSync(path.join(POPPLER, 'pdftotext')) &&
  fs.existsSync(path.join(POPPLER, 'pdffonts'));

describe('poppler reads a PDF made with FontSet', () => {
  it('pdftotext and pdffonts', {skip: havePoppler ? false
    : 'poppler not installed'}, async () => {
    const w = new PdfWriter({now: () => new Date(0)});
    const set = new FontSet(w, loader);
    const carlito = {family: 'Carlito', bold: false, italic: false};
    for (const k of [KEY, OTF_KEY, carlito]) await set.load(k);
    const lines = [[KEY, 'Hello from Liberation Sans'],
      [OTF_KEY, 'Homerton says hello'],
      [carlito, 'Café crème à la carte']];
    let content = '';
    const used = new Set();
    lines.forEach(([k, s], i) => {
      const h = set.use(k, s);
      used.add(h.name);
      content += 'BT /' + h.name + ' 14 Tf 72 ' + (700 - 30 * i) +
        ' Td ' + h.encode(s) + ' Tj ET\n';
    });
    const ids = await set.embed();
    w.page({w: 595, h: 842, content,
      fonts: new Map([...used].map((n) => [n, ids.get(n)]))});
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdffont-'));
    const file = path.join(dir, 'f.pdf');
    fs.writeFileSync(file, await w.finish());
    const got = execFileSync(path.join(POPPLER, 'pdftotext'),
      ['-layout', file, '-'], {encoding: 'utf8'});
    for (const [, s] of lines) assert.ok(got.indexOf(s) >= 0, got);
    const fonts = execFileSync(path.join(POPPLER, 'pdffonts'), [file],
      {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
    assert.ok(fonts.indexOf('CID TrueType') >= 0, fonts);
    assert.ok(fonts.indexOf('HomertonRegular') >= 0, fonts);
    for (const row of fonts.split('\n').slice(2)) {
      if (row.trim()) assert.ok(row.indexOf(' yes ') >= 0, row);
    }
    fs.rmSync(dir, {recursive: true, force: true});
  });
});
