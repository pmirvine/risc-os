// RISC OS Drawfile (filetype &AFF) reader, writer, geometry and canvas renderer.
//
// Reusable by any app (Draw, Help, Filer thumbnails, ChangeFSI ...). No DOM needed for
// parse/serialise/geometry, so it also works under node for tests.
//
//   import { parseDrawfile, serialiseDrawfile, renderDrawfile, prepareDrawfile } from '../Draw/drawfile.js';
//
//   const doc = parseDrawfile(bytes);                // Uint8Array -> document model (throws DrawfileError)
//   await prepareDrawfile(doc);                      // optional: wait for outline fonts / sprites / JPEGs
//   renderDrawfile(ctx, doc or bytes, opts)          // paint on a CanvasRenderingContext2D, returns doc
//       opts: { scale: 1,          // 1 = Draw's 1:1 zoom (1 CSS px = 2 OS units = 512 draw units)
//               fit: false,        // true: scale+centre the drawing's bbox into ctx.canvas (or opts.width/height)
//               x: 0, y: 0,        // canvas px where draw point (originX, originY) is placed
//               originX, originY,  // draw units; default: bbox left / top (so the drawing starts at x,y)
//               background: null,  // CSS colour to clear with first (null = don't clear)
//               onReady: fn }      // called once late-loading resources (fonts, JPEGs) are ready: re-render then
//   serialiseDrawfile(doc, { options }) -> Uint8Array   // byte-compatible with Draw 3.71 output
//
// Units: draw units (1/640 point, 1/46080 inch); 256 draw units = 1 OS unit; y increases upwards.
// Colours are 0xBBGGRR00 words; 0xFFFFFFFF = transparent.

export const DU_PER_OS = 256, DU_PER_INCH = 46080, DU_PER_POINT = 640, DU_PER_CM = 18144;
export const TRANSPARENT = 0xFFFFFFFF;
export const OBJ = {
  FONTTABLE: 0, TEXT: 1, PATH: 2, SPRITE: 5, GROUP: 6, TAGGED: 7, TEXTAREA: 9, TEXTCOL: 10,
  OPTIONS: 11, TRFMTEXT: 12, TRFMSPRITE: 13, JPEG: 16,
};
export const PATH = { END: 0, MOVE: 2, CLOSEGAP: 4, CLOSE: 5, CURVE: 6, LINE: 8 };
export const JOIN = { MITRE: 0, ROUND: 1, BEVEL: 2 };
export const CAP = { BUTT: 0, ROUND: 1, SQUARE: 2, TRIANGLE: 3 };

export class DrawfileError extends Error {}

// ------------------------------------------------------------------------------------ helpers
const latin1 = (b, s, e) => { let r = ''; for (let i = s; i < e; i++) r += String.fromCharCode(b[i]); return r; };
const cstr = (b, s, e) => { let i = s; while (i < e && b[i] !== 0) i++; return latin1(b, s, i); };
export const colourCss = (c) => {
  if (c == null || (c >>> 0) === TRANSPARENT) return null;
  return `rgb(${(c >>> 8) & 255},${(c >>> 16) & 255},${(c >>> 24) & 255})`;
};
export const rgbToColour = (r, g, b) => (((b & 255) << 24) | ((g & 255) << 16) | ((r & 255) << 8)) >>> 0;
export const colourRgb = (c) => [(c >>> 8) & 255, (c >>> 16) & 255, (c >>> 24) & 255];
const emptyBox = () => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
export const boxUnion = (a, b) => (b ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : a);
const boxValid = (b) => b && b.x1 >= b.x0 && b.y1 >= b.y0 && isFinite(b.x0);
const intBox = (b) => ({ x0: Math.floor(b.x0), y0: Math.floor(b.y0), x1: Math.ceil(b.x1), y1: Math.ceil(b.y1) });

// FPA doubles are stored as two little-endian words, most significant word first
function readFPA(v, o) {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setUint32(0, v.getUint32(o, true)); dv.setUint32(4, v.getUint32(o + 4, true));
  return dv.getFloat64(0);
}
function writeFPA(v, o, x) {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  v.setUint32(o, dv.getUint32(0), true); v.setUint32(o + 4, dv.getUint32(4), true);
}

// ------------------------------------------------------------------------------------ parsing
/** Parse a Drawfile. Returns {major, minor, creator, bbox, fonts: Map, objects, options, warnings}. */
export function parseDrawfile(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (b.length < 40 || latin1(b, 0, 4) !== 'Draw') throw new DrawfileError('This is not a Draw file');
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const doc = {
    major: v.getInt32(4, true), minor: v.getInt32(8, true), creator: latin1(b, 12, 24),
    bbox: { x0: v.getInt32(24, true), y0: v.getInt32(28, true), x1: v.getInt32(32, true), y1: v.getInt32(36, true) },
    fonts: new Map(), objects: [], options: null, warnings: [],
  };
  if (doc.major > 201) throw new DrawfileError('File version number is too high');
  doc.objects = parseObjects(b, v, 40, b.length, doc, 0);
  return doc;
}

function parseObjects(b, v, start, end, doc, depth) {
  const out = [];
  let o = start;
  while (o + 8 <= end) {
    const tagWord = v.getUint32(o, true), size = v.getUint32(o + 4, true);
    if (size < 8 || o + size > end) { doc.warnings.push(`Bad object size ${size} at ${o}`); break; }
    const obj = parseObject(b, v, o, size, tagWord, doc, depth);
    if (obj) out.push(obj);
    o += size;
  }
  return out;
}

const readBox = (v, o) => ({ x0: v.getInt32(o, true), y0: v.getInt32(o + 4, true), x1: v.getInt32(o + 8, true), y1: v.getInt32(o + 12, true) });
const readMatrix = (v, o) => [0, 1, 2, 3, 4, 5].map((i) => v.getInt32(o + 4 * i, true));

function parseObject(b, v, o, size, tagWord, doc, depth) {
  const type = tagWord & 0xFF, end = o + size;
  switch (type) {
    case OBJ.FONTTABLE: {
      let p = o + 8;
      while (p < end) {
        const n = b[p];
        if (n === 0) break;
        const name = cstr(b, p + 1, end);
        doc.fonts.set(n, name);
        p += 2 + name.length;
      }
      return null;
    }
    case OBJ.OPTIONS: {
      if (size < 88) return null;
      if (!doc.options) {
        doc.options = {
          paperSize: v.getInt32(o + 24, true), paperOptions: v.getInt32(o + 28, true),
          gridSpacing: readFPA(v, o + 32), gridDivision: v.getInt32(o + 40, true),
          gridIso: v.getInt32(o + 44, true), gridAuto: v.getInt32(o + 48, true), gridShow: v.getInt32(o + 52, true),
          gridLock: v.getInt32(o + 56, true), gridCm: v.getInt32(o + 60, true),
          zoomMul: v.getInt32(o + 64, true), zoomDiv: v.getInt32(o + 68, true), zoomLock: v.getInt32(o + 72, true),
          toolbox: v.getInt32(o + 76, true), mode: v.getInt32(o + 80, true), undoSize: v.getInt32(o + 84, true),
        };
      }
      return null;
    }
    case OBJ.TEXT: case OBJ.TRFMTEXT: {
      const t = type === OBJ.TRFMTEXT;
      let p = o + 24;
      const obj = { type: t ? 'trfmtext' : 'text', tag: tagWord, bbox: readBox(v, o + 8) };
      if (t) { obj.matrix = readMatrix(v, p); p += 24; obj.flags = v.getUint32(p, true); p += 4; }
      obj.colour = v.getUint32(p, true); obj.bg = v.getUint32(p + 4, true);
      obj.style = v.getUint32(p + 8, true);
      obj.xsize = v.getInt32(p + 12, true); obj.ysize = v.getInt32(p + 16, true);
      obj.x = v.getInt32(p + 20, true); obj.y = v.getInt32(p + 24, true);
      obj.text = cstr(b, p + 28, end);
      return obj;
    }
    case OBJ.PATH: {
      const obj = { type: 'path', tag: tagWord, bbox: readBox(v, o + 8), fill: v.getUint32(o + 24, true), stroke: v.getUint32(o + 28, true), width: v.getInt32(o + 32, true), style: v.getUint32(o + 36, true), dash: null, elements: [] };
      let p = o + 40;
      if (obj.style & 0x80) {
        const off = v.getInt32(p, true), n = v.getUint32(p + 4, true);
        const el = [];
        for (let i = 0; i < n && p + 8 + 4 * i + 4 <= end; i++) el.push(v.getInt32(p + 8 + 4 * i, true));
        obj.dash = { offset: off, elements: el };
        p += 8 + 4 * n;
      }
      while (p + 4 <= end) {
        const tw = v.getUint32(p, true), t = tw & 0xFF;
        const e = { t };
        if (tw !== t) e.raw = tw;
        if (t === PATH.END) { p += 4; break; }
        if (t === PATH.MOVE || t === PATH.LINE || t === 3 || t === 7) { e.x = v.getInt32(p + 4, true); e.y = v.getInt32(p + 8, true); p += 12; }
        else if (t === PATH.CURVE) {
          e.x1 = v.getInt32(p + 4, true); e.y1 = v.getInt32(p + 8, true); e.x2 = v.getInt32(p + 12, true); e.y2 = v.getInt32(p + 16, true);
          e.x = v.getInt32(p + 20, true); e.y = v.getInt32(p + 24, true); p += 28;
        } else if (t === PATH.CLOSE || t === PATH.CLOSEGAP) p += 4;
        else { doc.warnings.push('Path contains an invalid tag'); break; }
        obj.elements.push(e);
      }
      if (p < end) obj.trailing = b.slice(p, end);
      return obj;
    }
    case OBJ.SPRITE: case OBJ.TRFMSPRITE: {
      const t = type === OBJ.TRFMSPRITE;
      const obj = { type: t ? 'trfmsprite' : 'sprite', tag: tagWord, bbox: readBox(v, o + 8) };
      let p = o + 24;
      if (t) { obj.matrix = readMatrix(v, p); p += 24; }
      obj.data = b.slice(p, end);
      return obj;
    }
    case OBJ.GROUP: {
      const obj = { type: 'group', tag: tagWord, bbox: readBox(v, o + 8), name: b.slice(o + 24, o + 36) };
      obj.objects = parseObjects(b, v, o + 36, end, doc, depth + 1);
      return obj;
    }
    case OBJ.TAGGED: {
      const obj = { type: 'tagged', tag: tagWord, bbox: readBox(v, o + 8), id: v.getUint32(o + 24, true), object: null, extra: new Uint8Array(0) };
      const p = o + 28;
      if (p + 8 <= end) {
        const isz = v.getUint32(p + 4, true);
        if (isz >= 8 && p + isz <= end) {
          obj.object = parseObject(b, v, p, isz, v.getUint32(p, true), doc, depth + 1);
          obj.extra = b.slice(p + isz, end);
        }
      }
      return obj;
    }
    case OBJ.TEXTAREA: {
      const obj = { type: 'textarea', tag: tagWord, bbox: readBox(v, o + 8), columns: [] };
      let p = o + 24;
      while (p + 4 <= end && v.getUint32(p, true) !== 0) {
        const csz = v.getUint32(p + 4, true);
        obj.columns.push({ tag: v.getUint32(p, true), bbox: readBox(v, p + 8) });
        p += Math.max(24, csz);
      }
      p += 4;       // end mark
      obj.reserved = [v.getUint32(p, true), v.getUint32(p + 4, true)];
      obj.colour = v.getUint32(p + 8, true); obj.bg = v.getUint32(p + 12, true);
      obj.text = cstr(b, p + 16, end);
      return obj;
    }
    case OBJ.JPEG: {
      const obj = { type: 'jpeg', tag: tagWord, bbox: readBox(v, o + 8), width: v.getInt32(o + 24, true), height: v.getInt32(o + 28, true), xdpi: v.getInt32(o + 32, true), ydpi: v.getInt32(o + 36, true), matrix: readMatrix(v, o + 40) };
      const len = v.getUint32(o + 64, true);
      obj.data = b.slice(o + 68, Math.min(end, o + 68 + len));
      return obj;
    }
    default:
      if (type === OBJ.TEXTCOL) return null;
      return { type: 'unknown', tag: tagWord, bbox: size >= 24 ? readBox(v, o + 8) : null, raw: b.slice(o, end) };
  }
}

// ------------------------------------------------------------------------------------ writing
class Writer {
  constructor() { this.buf = new Uint8Array(4096); this.n = 0; }
  ensure(k) { if (this.n + k > this.buf.length) { const nb = new Uint8Array(Math.max(this.buf.length * 2, this.n + k + 1024)); nb.set(this.buf.subarray(0, this.n)); this.buf = nb; } }
  u32(x) { this.ensure(4); new DataView(this.buf.buffer).setUint32(this.n, x >>> 0, true); this.n += 4; }
  i32(x) { this.ensure(4); new DataView(this.buf.buffer).setInt32(this.n, Math.round(x) | 0, true); this.n += 4; }
  bytes(a) { this.ensure(a.length); this.buf.set(a, this.n); this.n += a.length; }
  str(s) { this.ensure(s.length); for (let i = 0; i < s.length; i++) this.buf[this.n++] = s.charCodeAt(i) & 255; }
  pad() { while (this.n & 3) { this.ensure(1); this.buf[this.n++] = 0; } }
  box(b) { const q = b ?? { x0: 0, y0: 0, x1: 0, y1: 0 }; this.i32(q.x0); this.i32(q.y0); this.i32(q.x1); this.i32(q.y1); }
  patch(at, x) { new DataView(this.buf.buffer).setUint32(at, x >>> 0, true); }
  result() { return this.buf.slice(0, this.n); }
}

function writeObject(w, obj) {
  const start = w.n;
  const hdr = () => { w.u32(obj.tag ?? 0); w.u32(0); };
  switch (obj.type) {
    case 'text': case 'trfmtext':
      hdr(); w.box(obj.bbox);
      if (obj.type === 'trfmtext') { obj.matrix.forEach((m) => w.i32(m)); w.u32(obj.flags ?? 0); }
      w.u32(obj.colour); w.u32(obj.bg); w.u32(obj.style); w.i32(obj.xsize); w.i32(obj.ysize); w.i32(obj.x); w.i32(obj.y);
      w.str(obj.text); w.bytes([0]); w.pad();
      break;
    case 'path':
      hdr(); w.box(obj.bbox); w.u32(obj.fill); w.u32(obj.stroke); w.i32(obj.width);
      w.u32(obj.dash ? (obj.style | 0x80) : (obj.style & ~0x80));
      if (obj.dash) { w.i32(obj.dash.offset); w.u32(obj.dash.elements.length); obj.dash.elements.forEach((e) => w.i32(e)); }
      for (const e of obj.elements) {
        w.u32(e.raw ?? e.t);
        if (e.t === PATH.CURVE) { w.i32(e.x1); w.i32(e.y1); w.i32(e.x2); w.i32(e.y2); w.i32(e.x); w.i32(e.y); }
        else if (e.t === PATH.MOVE || e.t === PATH.LINE || e.t === 3 || e.t === 7) { w.i32(e.x); w.i32(e.y); }
      }
      w.u32(0);
      if (obj.trailing) w.bytes(obj.trailing);
      break;
    case 'sprite': case 'trfmsprite':
      hdr(); w.box(obj.bbox);
      if (obj.type === 'trfmsprite') obj.matrix.forEach((m) => w.i32(m));
      w.bytes(obj.data); w.pad();
      break;
    case 'group': {
      hdr(); w.box(obj.bbox);
      const nm = obj.name instanceof Uint8Array ? obj.name : new TextEncoder().encode(String(obj.name ?? '').padEnd(12, ' ').slice(0, 12));
      const n12 = new Uint8Array(12); n12.set(nm.subarray(0, 12)); if (nm.length < 12) n12.fill(32, nm.length);
      w.bytes(n12);
      for (const c of obj.objects) writeObject(w, c);
      break;
    }
    case 'tagged':
      hdr(); w.box(obj.bbox); w.u32(obj.id);
      if (obj.object) writeObject(w, obj.object);
      if (obj.extra?.length) { w.bytes(obj.extra); w.pad(); }
      break;
    case 'textarea':
      hdr(); w.box(obj.bbox);
      for (const c of obj.columns) { w.u32(c.tag ?? OBJ.TEXTCOL); w.u32(24); w.box(c.bbox); }
      w.u32(0); w.u32(obj.reserved?.[0] ?? 0); w.u32(obj.reserved?.[1] ?? 0); w.u32(obj.colour); w.u32(obj.bg);
      w.str(obj.text); w.bytes([0]); w.pad();
      break;
    case 'jpeg':
      hdr(); w.box(obj.bbox); w.i32(obj.width); w.i32(obj.height); w.i32(obj.xdpi); w.i32(obj.ydpi);
      obj.matrix.forEach((m) => w.i32(m)); w.u32(obj.data.length); w.bytes(obj.data); w.pad();
      break;
    case 'unknown':
      w.bytes(obj.raw); w.pad();
      return;
    default: return;
  }
  w.patch(start + 4, w.n - start);
}

/** Collect font numbers used by objects (text lines; recursing into groups). */
export function fontsUsed(objects, set = new Set()) {
  for (const o of objects) {
    if ((o.type === 'text' || o.type === 'trfmtext') && (o.style & 0xFF)) set.add(o.style & 0xFF);
    else if (o.type === 'group') fontsUsed(o.objects, set);
    else if (o.type === 'tagged' && o.object) fontsUsed([o.object], set);
  }
  return set;
}

/**
 * Serialise a document: file header, font table (fonts used, ascending), options object
 * (if doc.options or opts.options), then the objects - the order Draw 3.71 writes.
 * opts.objects overrides doc.objects (e.g. to save a selection); opts.bbox the header bbox.
 */
export function serialiseDrawfile(doc, opts = {}) {
  const objects = opts.objects ?? doc.objects;
  const w = new Writer();
  w.str('Draw'); w.u32(doc.major ?? 201); w.u32(doc.minor ?? 0);
  w.str(((doc.creator ?? 'Draw') + '            ').slice(0, 12));
  let bb = opts.bbox;
  if (!bb) { bb = emptyBox(); for (const o of objects) if (o.bbox && boxValid(o.bbox)) bb = boxUnion(bb, o.bbox); if (!boxValid(bb)) bb = { x0: 0, y0: 0, x1: 0, y1: 0 }; }
  w.box(bb);
  const used = [...fontsUsed(objects)].sort((a, b) => a - b);
  if (used.length) {
    const st = w.n;
    w.u32(OBJ.FONTTABLE); w.u32(0);
    for (const n of used) { w.bytes([n]); w.str(doc.fonts.get(n) ?? 'Trinity.Medium'); w.bytes([0]); }
    w.pad();
    w.patch(st + 4, w.n - st);
  }
  const op = opts.options === false ? null : (opts.options ?? doc.options);
  if (op) {
    w.u32(OBJ.OPTIONS); w.u32(88); w.box({ x0: 0, y0: 0, x1: 0, y1: 0 });
    w.u32(op.paperSize ?? 0x500); w.u32(op.paperOptions ?? 0);
    w.ensure(8); writeFPA(new DataView(w.buf.buffer), w.n, op.gridSpacing ?? 1); w.n += 8;
    w.u32(op.gridDivision ?? 2); w.u32(op.gridIso ?? 0); w.u32(op.gridAuto ?? 0); w.u32(op.gridShow ?? 0); w.u32(op.gridLock ?? 0); w.u32(op.gridCm ?? 1);
    w.u32(op.zoomMul ?? 1); w.u32(op.zoomDiv ?? 1); w.u32(op.zoomLock ?? 0); w.u32(op.toolbox ?? 1); w.u32(op.mode ?? 2); w.u32(op.undoSize ?? 5000);
  }
  for (const o of objects) writeObject(w, o);
  return w.result();
}

/** A new empty document. */
export function newDrawDoc() {
  return { major: 201, minor: 0, creator: 'Draw', bbox: { x0: 0, y0: 0, x1: 0, y1: 0 }, fonts: new Map(), objects: [], options: null, warnings: [] };
}

export function cloneObject(o) {
  const c = { ...o };
  for (const k of Object.keys(c)) if (k.startsWith('_')) delete c[k];
  if (o.bbox) c.bbox = { ...o.bbox };
  if (o.elements) c.elements = o.elements.map((e) => ({ ...e }));
  if (o.dash) c.dash = { offset: o.dash.offset, elements: o.dash.elements.slice() };
  if (o.matrix) c.matrix = o.matrix.slice();
  if (o.objects) c.objects = o.objects.map(cloneObject);
  if (o.object) c.object = cloneObject(o.object);
  if (o.columns) c.columns = o.columns.map((k) => ({ ...k, bbox: { ...k.bbox } }));
  // share immutable binary data (sprite/jpeg data, group names) - keep the decoded image caches
  if (o._img) Object.defineProperty(c, '_img', { value: o._img, writable: true, configurable: true, enumerable: false });
  return c;
}

// ------------------------------------------------------------------------------------ geometry
/** Path style word accessors. */
export const pathStyle = {
  join: (s) => s & 3, endcap: (s) => (s >> 2) & 3, startcap: (s) => (s >> 4) & 3, winding: (s) => (s >> 6) & 1,
  tricapW: (s) => (s >>> 16) & 255, tricapH: (s) => (s >>> 24) & 255,
  make: ({ join = 2, endcap = 0, startcap = 0, winding = 1, tricapW = 0x10, tricapH = 0x20 } = {}) =>
    ((join & 3) | ((endcap & 3) << 2) | ((startcap & 3) << 4) | ((winding & 1) << 6) | ((tricapW & 255) << 16) | ((tricapH & 255) << 24)) >>> 0,
};

function bezierExtrema(p0, p1, p2, p3, cb) {
  // roots of derivative of cubic bezier (1-D)
  const a = -p0 + 3 * p1 - 3 * p2 + p3, b2 = 2 * (p0 - 2 * p1 + p2), c = p1 - p0;
  const ts = [];
  if (Math.abs(a) < 1e-9) { if (Math.abs(b2) > 1e-9) ts.push(-c / b2); }
  else {
    const d = b2 * b2 - 4 * a * c;
    if (d >= 0) { const s = Math.sqrt(d); ts.push((-b2 + s) / (2 * a), (-b2 - s) / (2 * a)); }
  }
  for (const t of ts) if (t > 0 && t < 1) { const u = 1 - t; cb(u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3); }
}

/** Tight bounding box of the path's geometry (no line width). */
export function pathGeomBox(elements) {
  const bb = emptyBox();
  let cx = 0, cy = 0;
  const add = (x, y) => { if (x < bb.x0) bb.x0 = x; if (x > bb.x1) bb.x1 = x; if (y < bb.y0) bb.y0 = y; if (y > bb.y1) bb.y1 = y; };
  for (const e of elements) {
    if (e.t === PATH.MOVE || e.t === PATH.LINE) { if (e.t === PATH.LINE) add(cx, cy); add(e.x, e.y); cx = e.x; cy = e.y; }
    else if (e.t === PATH.CURVE) {
      add(cx, cy); add(e.x, e.y);
      bezierExtrema(cx, e.x1, e.x2, e.x, (x) => add(x, e.y));
      bezierExtrema(cy, e.y1, e.y2, e.y, (y) => add(e.x, y));
      // (the extrema functions add with a matching other coordinate inside the box)
      cx = e.x; cy = e.y;
    }
  }
  return bb;
}

/** Bounding box of a path object as Draw computes it (geometry widened by the stroke). */
export function pathBBox(obj) {
  const g = pathGeomBox(obj.elements);
  if (!boxValid(g)) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  let wd = 0;
  if ((obj.stroke >>> 0) !== TRANSPARENT && obj.width > 0) {
    wd = obj.width / 2;
    const s = obj.style;
    if (pathStyle.join(s) === JOIN.MITRE) wd *= 1.5;
    if (pathStyle.startcap(s) === CAP.TRIANGLE || pathStyle.endcap(s) === CAP.TRIANGLE)
      wd = Math.max(wd, obj.width * Math.max(pathStyle.tricapW(s), pathStyle.tricapH(s)) / 16);
    if (pathStyle.startcap(s) === CAP.SQUARE || pathStyle.endcap(s) === CAP.SQUARE) wd = Math.max(wd, obj.width * 0.7072);
  }
  return intBox({ x0: g.x0 - wd, y0: g.y0 - wd, x1: g.x1 + wd, y1: g.y1 + wd });
}

const mApply = (m, x, y) => [m[0] / 65536 * x + m[2] / 65536 * y + m[4], m[1] / 65536 * x + m[3] / 65536 * y + m[5]];
function transformedBox(m, x0, y0, x1, y1, dx = 0, dy = 0) {
  const bb = emptyBox();
  for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) {
    const [tx, ty] = mApply(m, x, y);
    bb.x0 = Math.min(bb.x0, tx + dx); bb.y0 = Math.min(bb.y0, ty + dy); bb.x1 = Math.max(bb.x1, tx + dx); bb.y1 = Math.max(bb.y1, ty + dy);
  }
  return intBox(bb);
}

/** Sprite natural size in OS units (from its header). */
export function spriteOSSize(data) {
  if (!data || data.length < 44) return { w: 0, h: 0, xeig: 1, yeig: 1 };
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const wWords = v.getUint32(16, true) + 1, h = v.getUint32(20, true) + 1, fb = v.getUint32(24, true), lb = v.getUint32(28, true), mode = v.getUint32(40, true);
  const mi = modeInfo(mode);
  const pw = Math.max(1, Math.floor((wWords * 32 - fb - (31 - lb)) / mi.bpp));
  return { w: pw << mi.xeig, h: h << mi.yeig, pw, ph: h, xeig: mi.xeig, yeig: mi.yeig, bpp: mi.bpp };
}

/** Recompute an object's bounding box (as Draw does on load and after edits). measure: optional text measurer. */
export function boundObject(obj, fonts, measure = defaultMeasure) {
  switch (obj.type) {
    case 'path': obj.bbox = pathBBox(obj); break;
    case 'text': { const b = measure?.(obj, fonts); if (b) obj.bbox = b; break; }
    case 'trfmtext': { const b = measure?.({ ...obj, x: 0, y: 0 }, fonts); if (b) obj.bbox = transformedBox(obj.matrix, b.x0, b.y0, b.x1, b.y1, obj.x, obj.y); break; }
    case 'trfmsprite': { const s = spriteOSSize(obj.data); obj.bbox = transformedBox(obj.matrix.map((m, i) => (i < 4 ? m * 256 : m)), 0, 0, s.w, s.h); break; }
    case 'jpeg': obj.bbox = transformedBox(obj.matrix, 0, 0, obj.width, obj.height); break;
    case 'group': { let bb = emptyBox(); for (const c of obj.objects) { boundObject(c, fonts, measure); if (c.bbox && boxValid(c.bbox)) bb = boxUnion(bb, c.bbox); } if (boxValid(bb)) obj.bbox = bb; break; }
    case 'tagged': if (obj.object) { boundObject(obj.object, fonts, measure); obj.bbox = { ...obj.object.bbox }; } break;
    case 'textarea': { let bb = emptyBox(); for (const c of obj.columns) bb = boxUnion(bb, c.bbox); if (boxValid(bb)) obj.bbox = bb; break; }
    default: break;
  }
  return obj.bbox;
}

// ------------------------------------------------------------------------------------ fonts
let FONTINFO = null, FONTINFO_P = null, SYSFONT = null, SYSFONT_P = null;
const assetUrl = (p) => new URL('../../../' + p, import.meta.url).href;
export function loadFontInfo() {
  if (FONTINFO) return Promise.resolve(FONTINFO);
  if (typeof fetch === 'undefined') return Promise.resolve(null);
  FONTINFO_P ??= fetch(assetUrl('assets/fonts/fonts.json')).then((r) => r.json()).then((j) => {
    FONTINFO = { fonts: {}, latin1: j.latin1ToUnicode ?? {} };
    for (const [k, v] of Object.entries(j.fonts)) FONTINFO.fonts[k.toLowerCase()] = { name: k, ...v };
    return FONTINFO;
  }).catch(() => null);
  return FONTINFO_P;
}
export function loadSystemFont() {
  if (SYSFONT) return Promise.resolve(SYSFONT);
  if (typeof fetch === 'undefined') return Promise.resolve(null);
  SYSFONT_P ??= fetch(assetUrl('assets/fonts/system8x8.json')).then((r) => r.json()).then((j) => (SYSFONT = j.chars)).catch(() => null);
  return SYSFONT_P;
}
/** Font info for a RISC OS font name (case-insensitive), or null if the font is not available. */
export function fontInfo(name) {
  if (!FONTINFO || !name) return null;
  const l = name.toLowerCase();
  return FONTINFO.fonts[l] ?? null;
}
/** List of available RISC OS font names (for font menus). */
export function availableFonts() { return FONTINFO ? Object.values(FONTINFO.fonts).map((f) => f.name) : []; }

/** RISC OS Latin-1 string -> string for canvas in a given font. */
export function textForFont(text, fi) {
  if (fi && /selwyn|sidney/i.test(fi.family)) return text;   // symbol fonts: code = glyph
  const map = FONTINFO?.latin1 ?? {};
  let s = '';
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); s += map[c] ? String.fromCharCode(map[c]) : text[i]; }
  return s;
}
export function cssFont(fi, px) {
  const fam = fi.family.includes(' ') ? `"${fi.family}"` : `"${fi.family}"`;
  return `${fi.style === 'italic' ? 'italic ' : ''}${fi.weight} ${px}px ${fam}, ${fi.fallback}`;
}

let measureCtx = null;
function getMeasureCtx() {
  if (measureCtx) return measureCtx;
  if (typeof OffscreenCanvas !== 'undefined') measureCtx = new OffscreenCanvas(4, 4).getContext('2d');
  else if (typeof document !== 'undefined') measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}
/** Width (draw units) of a text line and its bbox. */
export function defaultMeasure(obj, fonts) {
  const name = (obj.style & 0xFF) ? fonts?.get(obj.style & 0xFF) : null;
  const fi = name ? fontInfo(name) : null;
  const n = obj.text.length;
  if (!fi) {
    // system font: cells of xsize x ysize, baseline at row 7 of 8
    return { x0: obj.x, y0: obj.y - Math.round(obj.ysize / 8), x1: obj.x + n * obj.xsize, y1: obj.y + Math.round(obj.ysize * 7 / 8) };
  }
  const ctx = getMeasureCtx();
  if (!ctx) return null;
  ctx.font = cssFont(fi, 100);
  const m = ctx.measureText(textForFont(obj.text, fi));
  const sx = obj.xsize / 100, sy = obj.ysize / 100;
  const left = -(m.actualBoundingBoxLeft ?? 0), right = m.actualBoundingBoxRight ?? m.width;
  const asc = m.actualBoundingBoxAscent ?? fi.ascender / 10, desc = m.actualBoundingBoxDescent ?? -fi.descender / 10;
  if (!n) return { x0: obj.x, y0: obj.y, x1: obj.x, y1: obj.y };
  return intBox({ x0: obj.x + Math.min(0, left) * sx, x1: obj.x + Math.max(right, m.width * 0.5) * sx, y0: obj.y - desc * sy, y1: obj.y + asc * sy });
}
/** Advance width in draw units of text in an object's font (for the text caret). */
export function textAdvance(obj, fonts, text = obj.text) {
  const name = (obj.style & 0xFF) ? fonts?.get(obj.style & 0xFF) : null;
  const fi = name ? fontInfo(name) : null;
  if (!fi) return text.length * obj.xsize;
  const ctx = getMeasureCtx();
  if (!ctx) return 0;
  ctx.font = cssFont(fi, 100);
  return ctx.measureText(textForFont(text, fi)).width * obj.xsize / 100;
}

// ------------------------------------------------------------------------------------ sprites
import { decodeSpriteFile, modeInfo } from '../../core/spritefile.js';
/** Decode a sprite object's data (a single sprite, as in a sprite file) to a canvas. */
export function spriteCanvas(obj) {
  if (obj._img !== undefined) return obj._img;
  let img = null;
  try {
    const d = obj.data;
    const f = new Uint8Array(12 + d.length);
    const v = new DataView(f.buffer);
    v.setUint32(0, 1, true); v.setUint32(4, 16, true); v.setUint32(8, 16 + d.length, true);
    f.set(d, 12);
    const s = decodeSpriteFile(f)[0];
    if (s && typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = s.width; c.height = s.height;
      c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(s.rgba), s.width, s.height), 0, 0);
      c._sprite = s;
      img = c;
    }
  } catch { img = null; }
  Object.defineProperty(obj, '_img', { value: img, writable: true, configurable: true, enumerable: false });
  return img;
}

function jpegImage(obj, onReady) {
  if (obj._img !== undefined) return obj._img;
  Object.defineProperty(obj, '_img', { value: null, writable: true, configurable: true, enumerable: false });
  if (typeof createImageBitmap !== 'undefined') {
    const p = createImageBitmap(new Blob([obj.data], { type: 'image/jpeg' })).then((bm) => { obj._img = bm; onReady?.(); }).catch(() => {});
    Object.defineProperty(obj, '_imgP', { value: p, writable: true, configurable: true, enumerable: false });
  }
  return null;
}

// ------------------------------------------------------------------------------------ rendering
/**
 * Paint objects on a canvas. view: { k (px per draw unit), ox, oy (canvas px of draw origin, y up),
 * fonts (Map fontnum -> name), clip (draw-unit box, optional), onReady }
 */
export function renderObjects(ctx, objects, view) {
  for (const o of objects) renderObject(ctx, o, view);
}

function visible(o, view) {
  const c = view.clip;
  if (!c || !o.bbox) return true;
  return !(o.bbox.x1 < c.x0 || o.bbox.x0 > c.x1 || o.bbox.y1 < c.y0 || o.bbox.y0 > c.y1);
}

export function renderObject(ctx, o, view) {
  if (!visible(o, view)) return;
  try {
    switch (o.type) {
      case 'path': renderPath(ctx, o, view); break;
      case 'text': renderText(ctx, o, view); break;
      case 'trfmtext': renderText(ctx, o, view, o.matrix); break;
      case 'sprite': case 'trfmsprite': renderSprite(ctx, o, view); break;
      case 'group': renderObjects(ctx, o.objects, view); break;
      case 'tagged': if (o.object) renderObject(ctx, o.object, view); break;
      case 'textarea': renderTextArea(ctx, o, view); break;
      case 'jpeg': renderJpeg(ctx, o, view); break;
      default: break;
    }
  } catch (e) { console.warn('drawfile render', o.type, e); }
}

/** Build a canvas path (px) for path elements. */
export function buildPath(ctx, elements, view) {
  const { k, ox, oy } = view;
  ctx.beginPath();
  let started = false;
  for (const e of elements) {
    switch (e.t) {
      case PATH.MOVE: ctx.moveTo(ox + e.x * k, oy - e.y * k); started = true; break;
      case PATH.LINE: if (started) ctx.lineTo(ox + e.x * k, oy - e.y * k); break;
      case PATH.CURVE: if (started) ctx.bezierCurveTo(ox + e.x1 * k, oy - e.y1 * k, ox + e.x2 * k, oy - e.y2 * k, ox + e.x * k, oy - e.y * k); break;
      case PATH.CLOSE: case PATH.CLOSEGAP: ctx.closePath(); break;
      default: break;
    }
  }
}

/** Subpaths of a path with open/closed flag and start/end tangents (for caps). */
function subpaths(elements) {
  const res = [];
  let cur = null, px = 0, py = 0;
  for (const e of elements) {
    if (e.t === PATH.MOVE) { cur = { pts: [[e.x, e.y]], closed: false, startDir: null, endDir: null }; res.push(cur); px = e.x; py = e.y; }
    else if (!cur) continue;
    else if (e.t === PATH.LINE) {
      if (e.x !== px || e.y !== py) { const d = [e.x - px, e.y - py]; cur.startDir ??= d; cur.endDir = d; }
      cur.pts.push([e.x, e.y]); px = e.x; py = e.y;
    } else if (e.t === PATH.CURVE) {
      let d0 = [e.x1 - px, e.y1 - py]; if (!d0[0] && !d0[1]) d0 = [e.x2 - px, e.y2 - py]; if (!d0[0] && !d0[1]) d0 = [e.x - px, e.y - py];
      let d1 = [e.x - e.x2, e.y - e.y2]; if (!d1[0] && !d1[1]) d1 = [e.x - e.x1, e.y - e.y1]; if (!d1[0] && !d1[1]) d1 = [e.x - px, e.y - py];
      if (d0[0] || d0[1]) cur.startDir ??= d0;
      if (d1[0] || d1[1]) cur.endDir = d1;
      cur.pts.push([e.x, e.y]); px = e.x; py = e.y;
    } else if (e.t === PATH.CLOSE || e.t === PATH.CLOSEGAP) cur.closed = true;
  }
  return res;
}

function drawCap(ctx, type, x, y, dir, lw, obj) {
  // x,y: end point (px); dir: unit vector pointing outwards (px, y down); lw: line width (px)
  const h = lw / 2, nx = -dir[1], ny = dir[0];
  ctx.beginPath();
  if (type === CAP.ROUND) { ctx.arc(x, y, h, 0, Math.PI * 2); }
  else if (type === CAP.SQUARE) {
    ctx.moveTo(x + nx * h, y + ny * h); ctx.lineTo(x + nx * h + dir[0] * h, y + ny * h + dir[1] * h);
    ctx.lineTo(x - nx * h + dir[0] * h, y - ny * h + dir[1] * h); ctx.lineTo(x - nx * h, y - ny * h);
  } else if (type === CAP.TRIANGLE) {
    const wv = pathStyle.tricapW(obj.style) / 16 * lw, hv = pathStyle.tricapH(obj.style) / 16 * lw;
    ctx.moveTo(x + nx * h, y + ny * h); ctx.lineTo(x + nx * wv, y + ny * wv);
    ctx.lineTo(x + dir[0] * hv, y + dir[1] * hv);
    ctx.lineTo(x - nx * wv, y - ny * wv); ctx.lineTo(x - nx * h, y - ny * h);
  } else return;
  ctx.closePath();
  ctx.fill();
}

const CANVAS_JOIN = ['miter', 'round', 'bevel'];
const CANVAS_CAP = ['butt', 'round', 'square', 'butt'];
function renderPath(ctx, o, view) {
  const k = view.k;
  const fill = colourCss(o.fill), stroke = colourCss(o.stroke);
  if (!fill && !stroke) return;
  buildPath(ctx, o.elements, view);
  if (fill) { ctx.fillStyle = fill; ctx.fill(pathStyle.winding(o.style) ? 'evenodd' : 'nonzero'); }
  if (!stroke) return;
  const s = o.style;
  const lw = o.width * k;
  const thin = o.width <= 0 || lw < 1;
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = thin ? (view.thinWidth ?? 1) : lw;
  ctx.lineJoin = CANVAS_JOIN[pathStyle.join(s)] ?? 'bevel';
  ctx.miterLimit = 10;
  const sc = pathStyle.startcap(s), ec = pathStyle.endcap(s);
  const uniform = !thin && sc === ec && sc !== CAP.TRIANGLE;
  ctx.lineCap = uniform ? CANVAS_CAP[sc] : 'butt';
  if (o.dash && o.dash.elements.length) {
    let el = o.dash.elements.map((d) => Math.max(0.5, d * k));
    if (el.length % 2) el = el.concat(el);
    ctx.setLineDash(el);
    ctx.lineDashOffset = o.dash.offset * k;
  }
  ctx.stroke();
  if (!thin && !uniform) {
    ctx.setLineDash([]);
    ctx.fillStyle = stroke;
    for (const sp of subpaths(o.elements)) {
      if (sp.closed || !sp.startDir) continue;
      const [x0, y0] = sp.pts[0], [x1, y1] = sp.pts[sp.pts.length - 1];
      const norm = (d) => { const l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, -d[1] / l]; };
      const sd = norm(sp.startDir), ed = norm(sp.endDir);
      drawCap(ctx, sc, view.ox + x0 * k, view.oy - y0 * k, [-sd[0], -sd[1]], lw, o);
      drawCap(ctx, ec, view.ox + x1 * k, view.oy - y1 * k, ed, lw, o);
    }
  }
  ctx.restore();
}

function renderSystemText(ctx, o, view) {
  const chars = SYSFONT;
  const colour = colourCss(o.colour);
  if (!colour || !o.text) return;
  const k = view.k;
  const cw = Math.max(1, Math.round(o.xsize * k)), ch = Math.max(1, Math.round(o.ysize * k));
  let x = Math.round(view.ox + o.x * k);
  const top = Math.round(view.oy - (o.y + o.ysize * 7 / 8) * k);
  ctx.save();
  ctx.fillStyle = colour;
  if (!chars) {
    ctx.font = `${ch}px "RISCOS System Fixed", monospace`;
    ctx.textBaseline = 'top';
    for (const c of o.text) { ctx.fillText(c, x, top); x += cw; }
    ctx.restore();
    return;
  }
  for (let i = 0; i < o.text.length; i++) {
    const rows = chars[o.text.charCodeAt(i)] ?? [];
    for (let r = 0; r < 8; r++) {
      const bits = rows[r] | 0;
      if (!bits) continue;
      const y0 = top + Math.floor(r * ch / 8), y1 = top + Math.floor((r + 1) * ch / 8);
      for (let c = 0; c < 8; c++) {
        if (bits & (0x80 >> c)) {
          const x0 = x + Math.floor(c * cw / 8), x1 = x + Math.floor((c + 1) * cw / 8);
          ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
        }
      }
    }
    x += cw;
  }
  ctx.restore();
}

function renderText(ctx, o, view, matrix) {
  const colour = colourCss(o.colour);
  if (!colour) return;
  const fname = (o.style & 0xFF) ? view.fonts?.get(o.style & 0xFF) : null;
  const fi = fname ? fontInfo(fname) : null;
  if (!fi) {
    if (!matrix) renderSystemText(ctx, o, view);
    else renderSystemText(ctx, { ...o }, view);
    return;
  }
  const k = view.k;
  const px = o.ysize * k;
  if (px < 0.5 || !o.text) return;
  const rx = o.ysize ? o.xsize / o.ysize : 1;
  ctx.save();
  // keep canvas font sizes sane: draw at a nominal size and scale
  const nominal = Math.min(Math.max(px, 4), 400);
  const f = px / nominal;
  const x = view.ox + o.x * k, y = view.oy - o.y * k;
  if (matrix) {
    const [a, b, c, d, e, g] = matrix;
    const A = a / 65536, B = b / 65536, C = c / 65536, D = d / 65536;
    ctx.transform(A * rx * f, -B * rx * f, -C * f, D * f, x + e * k, y - g * k);
  } else {
    ctx.transform(rx * f, 0, 0, f, x, y);
  }
  ctx.font = cssFont(fi, nominal);
  ctx.fillStyle = colour;
  ctx.textBaseline = 'alphabetic';
  const s = textForFont(o.text, fi);
  ctx.fillText(s, 0, 0);
  if (matrix && (o.flags & 4)) {   // underline
    const w = ctx.measureText(s).width;
    ctx.fillRect(0, nominal * 0.1, w, Math.max(nominal * 0.06, 1 / f));
  }
  ctx.restore();
}

function renderSprite(ctx, o, view) {
  const img = spriteCanvas(o);
  if (!img) return;
  const k = view.k;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (o.type === 'sprite') {
    const b = o.bbox;
    const x = view.ox + b.x0 * k, y = view.oy - b.y1 * k;
    ctx.drawImage(img, x, y, (b.x1 - b.x0) * k, (b.y1 - b.y0) * k);
  } else {
    const s = img._sprite;
    const ex = 1 << s.xeig, ey = 1 << s.yeig, H = s.height;
    const [a, b, c, d, e, f] = o.matrix.map((m, i) => (i < 4 ? m / 65536 : m));
    ctx.transform(k * 256 * a * ex, -k * 256 * b * ex, -k * 256 * c * ey, k * 256 * d * ey,
      view.ox + k * (256 * c * H * ey + e), view.oy - k * (256 * d * H * ey + f));
    ctx.drawImage(img, 0, 0);
  }
  ctx.restore();
}

function renderJpeg(ctx, o, view) {
  const img = jpegImage(o, view.onReady);
  if (!img) {
    // placeholder: grey box until decoded
    return;
  }
  const k = view.k, W = img.width, H = img.height;
  const [a, b, c, d, e, f] = o.matrix.map((m, i) => (i < 4 ? m / 65536 : m));
  const sx = o.width / W, sy = o.height / H;
  ctx.save();
  ctx.transform(k * a * sx, -k * b * sx, -k * c * sy, k * d * sy, view.ox + k * (c * o.height + e), view.oy - k * (d * o.height + f));
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

// ------------------------------------------------------------------------------------ text areas
/** Parse text-area source into font definitions and a token stream. */
function parseTextArea(src) {
  const fonts = {};
  const toks = [];
  let i = 0;
  const n = src.length;
  // skip \! <version> line
  if (src.startsWith('\\!')) { i = src.indexOf('\n'); i = i < 0 ? n : i + 1; }
  const readTo = () => { let j = i; while (j < n && src[j] !== '\n' && src[j] !== '/') j++; const s = src.slice(i, j); i = j < n ? j + 1 : n; return s; };
  let started = false;
  while (i < n) {
    const ch = src[i];
    if (ch === '\\') {
      const c = src[i + 1]; i += 2;
      if (c === '\\') { toks.push({ t: 'ch', c: '\\' }); started = true; if (src[i] === '/') i++; }
      else if (c === ';') { while (i < n && src[i] !== '\n') i++; i++; }
      else if (c === '-') { toks.push({ t: 'soft' }); if (src[i] === '/') i++; }
      else if (c === '\n') { toks.push({ t: 'br' }); if (src[i] === '/') i++; }
      else if (c === 'A') { toks.push({ t: 'align', v: src[i] }); i++; if (src[i] === '/') i++; }
      else if (c === 'B' || c === 'C') { const [r, g, b2] = readTo().trim().split(/\s+/).map(Number); toks.push({ t: c === 'C' ? 'fg' : 'bg', v: rgbToColour(r | 0, g | 0, b2 | 0) }); }
      else if (c === 'D') readTo();
      else if (c === 'F') {
        const m = /^\s*(\d{1,2})\s*(\S+)\s+([\d.]+)(?:\s+([\d.]+))?/.exec(readTo());
        if (m) fonts[+m[1]] = { name: m[2], size: +m[3], width: m[4] ? +m[4] : +m[3] };
      } else if (c === 'L') toks.push({ t: 'lead', v: parseFloat(readTo()) || 10 });
      else if (c === 'P') toks.push({ t: 'para', v: parseFloat(readTo()) || 10 });
      else if (c === 'M') { const [l, r] = readTo().trim().split(/\s+/).map(Number); toks.push({ t: 'margin', l: l || 0, r: r || 0 }); }
      else if (c === 'U') { if (src[i] === '.') { i++; if (src[i] === '/') i++; toks.push({ t: 'ul', v: 0 }); } else { const [, th] = readTo().trim().split(/\s+/).map(Number); toks.push({ t: 'ul', v: th | 0 }); } }
      else if (c === 'V') { let j = i; if (src[j] === '-') j++; while (j < n && /\d/.test(src[j])) j++; toks.push({ t: 'vmove', v: parseInt(src.slice(i, j), 10) || 0 }); i = j; if (src[i] === '/') i++; }
      else if (/\d/.test(c)) { let num = c; if (/\d/.test(src[i])) num += src[i++]; if (src[i] === '/') i++; toks.push({ t: 'font', v: +num }); }
    } else if (ch === '\n') {
      i++;
      let nl = 1;
      if (src[i] === '\n' || src[i] === ' ' || src[i] === '\t') {
        // paragraph break; count extra blank lines
        while (src[i] === '\n') { nl++; i++; }
        if (started) toks.push({ t: 'par', n: Math.max(1, nl - 1) });
      } else if (started) toks.push({ t: 'ch', c: ' ', nl: true });
    } else if (ch < ' ') { if (ch === '\t') toks.push({ t: 'ch', c: ' ' }); i++; }
    else { toks.push({ t: 'ch', c: ch }); started = true; i++; }
  }
  return { fonts, toks };
}

function renderTextArea(ctx, o, view) {
  const { fonts, toks } = o._ta ??= parseTextArea(o.text);
  const k = view.k;
  const PT = DU_PER_POINT;
  const cols = o.columns.map((c) => c.bbox);
  if (!cols.length) return;
  let st = { font: null, fg: o.colour, bg: o.bg, lead: 10, para: 10, ml: 1, mr: 1, align: 'L', ul: 0 };
  // words: sequence of runs [{text, font, fg}]
  const lines = [];   // {runs:[{text,st}], align, lead, para, ml, mr, brk}
  let line = { runs: [], st: { ...st } }, word = [];
  const ctxM = ctx;
  const fontOf = (s) => { const f = fonts[s.font]; if (!f) return null; const fi = fontInfo(f.name); return { f, fi }; };
  const widthOf = (text, s) => {
    const fo = fontOf(s);
    if (!fo) return text.length * 8 * PT;
    if (!fo.fi) return text.length * fo.f.width * PT * 0.5;
    ctxM.font = cssFont(fo.fi, 100);
    return ctxM.measureText(textForFont(text, fo.fi)).width / 100 * fo.f.width * PT;
  };
  // flatten tokens into paragraphs of styled chars
  const paras = [];
  let cur = { chars: [], st: { ...st }, spaceBefore: 0 };
  paras.push(cur);
  for (const t of toks) {
    switch (t.t) {
      case 'ch': cur.chars.push({ c: t.c, st: { ...st } }); break;
      case 'font': st.font = t.v; break;
      case 'fg': st.fg = t.v; break;
      case 'bg': st.bg = t.v; break;
      case 'ul': st.ul = t.v; break;
      case 'lead': st.lead = t.v; if (!cur.chars.length) cur.st.lead = t.v; break;
      case 'para': st.para = t.v; if (!cur.chars.length) cur.st.para = t.v; break;
      case 'margin': st.ml = t.l; st.mr = t.r; if (!cur.chars.length) { cur.st.ml = t.l; cur.st.mr = t.r; } break;
      case 'align': st.align = t.v; if (!cur.chars.length) cur.st.align = t.v; break;
      case 'br': cur.chars.push({ br: true }); break;
      case 'par': cur = { chars: [], st: { ...st }, spaceBefore: t.n }; paras.push(cur); break;
      default: break;
    }
  }
  // layout into columns
  let ci = 0, col = cols[0];
  let y = col.y1;
  const place = [];
  const newCol = () => { ci++; if (ci >= cols.length) return false; col = cols[ci]; y = col.y1; return true; };
  outer: for (const p of paras) {
    if (!p.chars.length) { y -= (p.spaceBefore) * p.st.para * PT; continue; }
    if (place.length) y -= p.spaceBefore * p.st.para * PT;
    // split into words (keep spaces as separate items)
    const items = [];
    let w = null;
    for (const ch of p.chars) {
      if (ch.br) { if (w) items.push(w); w = null; items.push({ br: true }); continue; }
      const sp = ch.c === ' ';
      if (!w || w.space !== sp) { if (w) items.push(w); w = { space: sp, chars: [] }; }
      w.chars.push(ch);
    }
    if (w) items.push(w);
    const runsOf = (it) => { const runs = []; for (const ch of it.chars) { const last = runs[runs.length - 1]; if (last && last.st.font === ch.st.font && last.st.fg === ch.st.fg && last.st.ul === ch.st.ul) last.text += ch.c; else runs.push({ text: ch.c, st: ch.st }); } return runs; };
    let lineItems = [];
    let lineW = 0;
    const lineHeight = () => p.st.lead * PT;
    const flush = (last) => {
      const left = col.x0 + p.st.ml * PT, right = col.x1 - p.st.mr * PT, avail = right - left;
      while (lineItems.length && lineItems[lineItems.length - 1].space) { lineW -= lineItems.pop().w; }
      y -= lineHeight();
      if (y < col.y0) { if (!newCol()) return false; y -= lineHeight(); }
      let x = left, gap = 0;
      if (p.st.align === 'R') x = right - lineW;
      else if (p.st.align === 'C') x = left + (avail - lineW) / 2;
      else if (p.st.align === 'D' && !last) { const nsp = lineItems.filter((q) => q.space).length; if (nsp) gap = (avail - lineW) / nsp; }
      for (const it of lineItems) {
        if (it.space) { x += it.w + gap; continue; }
        for (const r of it.runs) { const rw = widthOf(r.text, r.st); place.push({ text: r.text, st: r.st, x, y }); x += rw; }
      }
      lineItems = []; lineW = 0;
      return true;
    };
    for (const it of items) {
      if (it.br) { if (!flush(true)) break outer; continue; }
      const runs = runsOf(it);
      const wd = runs.reduce((s, r) => s + widthOf(r.text, r.st), 0);
      const left = col.x0 + p.st.ml * PT, right = col.x1 - p.st.mr * PT;
      if (!it.space && lineW + wd > right - left && lineItems.some((q) => !q.space)) { if (!flush(false)) break outer; }
      if (it.space && !lineItems.length) continue;
      lineItems.push({ space: it.space, runs, w: wd });
      lineW += wd;
    }
    if (lineItems.length && !flush(true)) break;
  }
  // paint
  for (const q of place) {
    const fo = fontOf(q.st);
    const colour = colourCss(q.st.fg);
    if (!colour) continue;
    if (!fo || !fo.fi) {
      renderSystemText(ctx, { text: q.text, x: q.x, y: q.y, xsize: (fo?.f.width ?? 8) * PT * 0.5, ysize: (fo?.f.size ?? 12) * PT, colour: q.st.fg }, view);
      continue;
    }
    const px = fo.f.size * PT * k;
    if (px < 0.5) continue;
    ctx.save();
    const nominal = Math.min(Math.max(px, 4), 400), f = px / nominal, rx = fo.f.width / fo.f.size;
    ctx.transform(rx * f, 0, 0, f, view.ox + q.x * k, view.oy - q.y * k);
    ctx.font = cssFont(fo.fi, nominal);
    ctx.fillStyle = colour;
    const s = textForFont(q.text, fo.fi);
    ctx.fillText(s, 0, 0);
    if (q.st.ul) ctx.fillRect(0, nominal * 0.12, ctx.measureText(s).width, Math.max(nominal * q.st.ul / 256, 1 / f));
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------ high level
/** Load fonts used by a document (outline fonts via the CSS font loader, the system font bitmap). */
export async function prepareDrawfile(doc) {
  await Promise.all([loadFontInfo(), loadSystemFont()]);
  if (typeof document === 'undefined' || !document.fonts) return doc;
  const wanted = new Set();
  const walk = (objs) => {
    for (const o of objs) {
      if (o.type === 'text' || o.type === 'trfmtext') { const n = doc.fonts.get(o.style & 0xFF); if (n) wanted.add(n); }
      else if (o.type === 'group') walk(o.objects);
      else if (o.type === 'tagged' && o.object) walk([o.object]);
      else if (o.type === 'textarea') { for (const f of Object.values((o._ta ??= parseTextArea(o.text)).fonts)) wanted.add(f.name); }
      else if (o.type === 'jpeg') { jpegImage(o); }
    }
  };
  walk(doc.objects);
  const loads = [];
  for (const n of wanted) { const fi = fontInfo(n); if (fi) loads.push(document.fonts.load(cssFont(fi, 20)).catch(() => {})); }
  const jp = [];
  const walkJ = (objs) => { for (const o of objs) { if (o.type === 'jpeg' && o._imgP) jp.push(o._imgP); else if (o.type === 'group') walkJ(o.objects); } };
  walkJ(doc.objects);
  await Promise.all([...loads, ...jp]);
  return doc;
}

/** The overall bounding box of a document's objects (or the header bbox). */
export function docBBox(doc) {
  let bb = emptyBox();
  for (const o of doc.objects) if (o.bbox && boxValid(o.bbox)) bb = boxUnion(bb, o.bbox);
  return boxValid(bb) ? bb : doc.bbox;
}

/**
 * Render a Drawfile (bytes or parsed doc) on a 2D canvas context. See the header comment for
 * opts. Returns the parsed document. Late resources (fonts/JPEGs) trigger opts.onReady.
 */
export function renderDrawfile(ctx, input, opts = {}) {
  const doc = input && input.objects ? input : parseDrawfile(input);
  const bb = docBBox(doc);
  let k = (opts.scale ?? 1) / 512;
  let ox, oy;
  if (opts.fit) {
    const W = opts.width ?? ctx.canvas.width, H = opts.height ?? ctx.canvas.height;
    const bw = Math.max(1, bb.x1 - bb.x0), bh = Math.max(1, bb.y1 - bb.y0);
    k = Math.min(W / bw, H / bh) * (opts.margin ?? 0.95);
    ox = (opts.x ?? 0) + (W - bw * k) / 2 - bb.x0 * k;
    oy = (opts.y ?? 0) + (H - bh * k) / 2 + bb.y1 * k;
  } else {
    const orgX = opts.originX ?? bb.x0, orgY = opts.originY ?? bb.y1;
    ox = (opts.x ?? 0) - orgX * k;
    oy = (opts.y ?? 0) + orgY * k;
  }
  if (opts.background) { ctx.save(); ctx.fillStyle = opts.background; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore(); }
  const ready = !FONTINFO || !SYSFONT;
  const view = { k, ox, oy, fonts: doc.fonts, onReady: opts.onReady };
  if (ready && typeof fetch !== 'undefined') prepareDrawfile(doc).then(() => opts.onReady?.(doc));
  renderObjects(ctx, doc.objects, view);
  return doc;
}
