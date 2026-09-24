// RISC OS outline font (Outlines / Outlines0, "FONT" bpp=0, versions 6-8) and IntMetrics parsers.
// Plain JS on Uint8Array (node Buffers too): used by tools/fonts.mjs (via tools/lib/riscosfont.mjs) and in the
// browser by the font registry (fontreg.js).
// Format reference: vendor/ro371/Sources/OS_Core/Video/Render/Fonts/Manager/Doc/Formats

/**
 * Parse an Outlines file.
 * Returns { version, designSize, bbox:{x0,y0,x1,y1}, nonZero, glyphs: Map<code, glyph> }
 * glyph = { contours: [[{t:'M'|'L'|'C', pts:[[x,y],...]}...]], strokes: [...], includes: [{code,dx,dy}], bbox }
 */
export function parseOutlines(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const u32 = (o) => dv.getUint32(o, true), u16 = (o) => dv.getUint16(o, true), i16 = (o) => dv.getInt16(o, true);
  if (String.fromCharCode(...buf.subarray(0, 4)) !== 'FONT') throw new Error('not a FONT file');
  const bpp = buf[4], version = buf[5];
  if (bpp !== 0) throw new Error('not an outline font (bpp=' + bpp + ')');
  const designSize = u16(6);
  const bx0 = i16(8), by0 = i16(10);
  const bbox = { x0: bx0, y0: by0, x1: bx0 + i16(12), y1: by0 + i16(14) };
  let chunkOffs = [], nonZero = false, sflags = 0;
  if (version < 8) {
    for (let k = 0; k <= 8; k++) chunkOffs.push(u32(16 + k * 4));
  } else {
    const area = u32(16), nchunks = u32(20);
    sflags = u32(28);
    nonZero = !!(sflags & 4);
    for (let k = 0; k <= nchunks; k++) chunkOffs.push(u32(area + k * 4));
  }
  const glyphs = new Map();
  for (let k = 0; k + 1 < chunkOffs.length; k++) {
    const start = chunkOffs[k];
    if (!start || chunkOffs[k + 1] === start) continue;
    let index = start, perChar = 1;
    if (version >= 7) {
      const fw = u32(start);
      index = start + 4;
      perChar = (fw & 1 ? 4 : 1) * (fw & 2 ? 4 : 1);
    }
    for (let i = 0; i < 32; i++) {
      const off = u32(index + i * perChar * 4);
      if (!off) continue;
      const code = k * 32 + i;
      try { glyphs.set(code, parseChar(buf, index + off)); }
      catch (e) { /* skip malformed glyph */ }
    }
  }
  return { version, designSize, bbox, nonZero, scaffoldFlags: sflags, glyphs };
}

function parseChar(buf, p) {
  const flags = buf[p++];
  const is12 = flags & 1, wide = flags & 64;
  if (!(flags & 8)) return { bitmap: true, contours: [], strokes: [], includes: [] };
  const code = () => { const c = wide ? buf[p] | (buf[p + 1] << 8) : buf[p]; p += wide ? 2 : 1; return c; };
  const xy = () => {
    if (is12) {
      const b0 = buf[p], b1 = buf[p + 1], b2 = buf[p + 2]; p += 3;
      let x = b0 | ((b1 & 15) << 8), y = (b1 >> 4) | (b2 << 4);
      if (x & 0x800) x -= 0x1000; if (y & 0x800) y -= 0x1000;
      return [x, y];
    }
    let x = buf[p], y = buf[p + 1]; p += 2;
    if (x & 0x80) x -= 256; if (y & 0x80) y -= 256;
    return [x, y];
  };
  if (flags & 16) {
    // composite: base char (+ accent at offset)
    const includes = [{ code: code(), dx: 0, dy: 0 }];
    if (flags & 32) { const a = code(); const [dx, dy] = xy(); includes.push({ code: a, dx, dy }); }
    return { contours: [], strokes: [], includes };
  }
  const [x0, y0] = xy(); const [xs, ys] = xy();
  const readPaths = () => {
    const contours = []; let cur = null;
    for (;;) {
      const t = buf[p++];
      const type = t & 3;
      if (type === 0) return { contours, term: t };
      if (type === 1) { cur = [{ t: 'M', pts: [xy()] }]; contours.push(cur); }
      else if (type === 2) { if (!cur) { cur = []; contours.push(cur); } cur.push({ t: 'L', pts: [xy()] }); }
      else { if (!cur) { cur = []; contours.push(cur); } cur.push({ t: 'C', pts: [xy(), xy(), xy()] }); }
      if (p > buf.length) throw new Error('overrun');
    }
  };
  const main = readPaths();
  let term = main.term, strokes = [];
  if (term & 4) { const s = readPaths(); strokes = s.contours; term |= s.term; }
  const includes = [];
  if (term & 8) {
    for (;;) { const c = code(); if (!c) break; const [dx, dy] = xy(); includes.push({ code: c, dx, dy }); }
  }
  return { bbox: { x0, y0, x1: x0 + xs, y1: y0 + ys }, contours: main.contours, strokes, includes };
}

/** Parse IntMetrics. Returns { name, n, map (array|null), xoff: Int16 array|null, bboxes, misc, kerns } */
export function parseIntMetrics(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const i16 = (o) => dv.getInt16(o, true), u16 = (o) => dv.getUint16(o, true);
  let name = '';
  for (let i = 0; i < 40 && buf[i] >= 32; i++) name += String.fromCharCode(buf[i]);
  const nlo = buf[48], version = buf[49], flags = buf[50], nhi = buf[51];
  // NB: doc says "byte 49 = flags" in the offset recipe but the table lists version then flags; version-0 files have flags=0.
  const n = nlo + 256 * (version >= 2 ? nhi : 0);
  let p = 52, m = 256;
  if (flags & 32) { m = u16(52); p += 2; }
  const map = m ? Array.from(buf.subarray(p, p + m)) : null;
  p += m;
  const arr = () => { const a = []; for (let i = 0; i < n; i++) a.push(i16(p + i * 2)); p += 2 * n; return a; };
  let bboxes = null;
  if (!(flags & 1)) { const x0 = arr(), y0 = arr(), x1 = arr(), y1 = arr(); bboxes = { x0, y0, x1, y1 }; }
  const xoff = !(flags & 2) ? arr() : null;
  const yoff = !(flags & 4) ? arr() : null;
  let misc = null;
  if (flags & 8) {
    const t = p, o0 = u16(t);
    const q = t + o0;
    misc = { bbox: [i16(q), i16(q + 2), i16(q + 4), i16(q + 6)], defaultX: i16(q + 8), defaultY: i16(q + 10), italicH: i16(q + 12),
      underlinePos: dv.getInt8(q + 14), underlineThick: buf[q + 15], capHeight: i16(q + 16), xHeight: i16(q + 18), descender: i16(q + 20), ascender: i16(q + 22) };
  }
  const widthOf = (code) => {
    const idx = map ? map[code] : code;
    if (map && idx === 0 && code !== 0 && !(map[0] === 0 && code === 0)) { /* index 0 may be valid */ }
    if (idx === undefined || idx >= n) return misc ? misc.defaultX : null;
    return xoff ? xoff[idx] : misc ? misc.defaultX : null;
  };
  return { name, n, flags, map, xoff, yoff, bboxes, misc, widthOf };
}

/** Parse a RISC OS encoding file into an array of glyph names. */
export function parseEncoding(text) {
  const names = [];
  for (const line of text.split(/\r?\n/)) {
    const l = line.replace(/%.*$/, '');
    for (const m of l.matchAll(/\/([^\s/]+)/g)) names.push(m[1]);
  }
  return names;
}
