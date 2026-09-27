// Sprites for BASIC programs, on any VDU (full screen, in a window, headless): OS_SpriteOp on the
// system sprite area and on user sprite areas in the program's memory, PLOT &E8-&EF and VDU 23,27,
// the SpriteUtils *commands (*SLoad, *SSave, *SChoose, *SGet, *SList ...), *ScreenSave and
// *ScreenLoad, and output redirected to a sprite (OS_SpriteOp 60/61). Host-agnostic: files go
// through the machine's filing system (machine.fs), pixels straight into the VDU's framebuffer.
//
// Follows the 3.71 kernel sprite code (vendor/ro371/Sources/OS_Core/Kernel/s/vdu/vdugrafg etc.)
// and SpriteExtend's behaviour for plotting sprites of another depth: a sprite of the screen's
// depth is plotted with its pixel values unchanged (as RISC OS does, so GCOL actions work on the
// real values); a sprite of another depth is translated through its palette (or its mode's
// default palette) to the nearest colours of the current palette, unless a translation table is
// given. PutSprite is pixel for pixel; PutSpriteScaled scales by the eigen factors and the scale
// block; PutSpriteTransformed takes a matrix or a destination parallelogram.
//
//   new SpriteSystem(machine)          - machine.sprites (created by BasicMachine on first use)
//   screenToSpriteFile(vdu, opts)      - the screen as a sprite file (for "Save screen")
//   screenSprite(vdu, opts)            - the screen (or part) as a sprite (Paint's sprite object)
//
// The system sprite area is kept outside the program's memory and grows as needed (like the
// RISC OS 3.5 dynamic area). User sprite areas are the usual blocks in the program's memory.

import { BasicError } from './errors.js';
import { VDU, gcolToPixel, pixelToGcol } from './vdu.js';
import { defaultPalette } from './vdu-palette.js';
import {
  decodeSprite, encodeSprite, newSprite, touch, writeSpriteFile, readSpriteFile, modeFor,
  modeInfo as spriteModeInfo,
} from '../apps/Paint/spritefile.js';

const u32 = (x) => x >>> 0;
const err = (n, s) => new BasicError(n, s);
const E = {
  noMem: () => err(0x80, 'No sprite memory'),
  notGraphics: () => err(0x81, 'Not a graphics mode'),
  noRoom: () => err(0x82, 'No room to get sprite'),
  notEnough: () => err(0x85, 'Not enough room'),
  noSprite: (n) => err(0x86, n ? `Sprite '${n}' doesn't exist` : "Sprite doesn't exist"),
  badFile: () => err(0x700, 'Bad sprite file'),
  noRoomMerge: () => err(0x701, 'Not enough room to add sprite'),
  rowCol: () => err(0x703, 'Invalid row or column'),
  height: () => err(0x704, 'Invalid height'),
  width: () => err(0x705, 'Invalid width'),
  exists: () => err(0x707, 'Sprite already exists'),
  badMode: () => err(0x708, 'Invalid sprite mode'),
  badReason: () => err(0x709, 'Bad sprite reason code'),
  teletext: () => err(0x70F, "Can't switch output in teletext mode"),
};

/** SpriteUtils *commands handled by SpriteSystem.command (upper case) */
export const SPRITE_COMMANDS = new Set(['SCHOOSE', 'SGET', 'SFLIPX', 'SFLIPY', 'SDELETE', 'SLIST', 'SLOAD', 'SMERGE',
  'SNEW', 'SSAVE', 'SINFO', 'SRENAME', 'SCOPY', 'SCREENSAVE', 'SCREENLOAD']);

const nameKey = (s) => String(s).slice(0, 12).toLowerCase();

// ============================================================================ sprite areas
/** A sprite area in the program's memory (address a: size, count, first, free, sprites...) */
class MemArea {
  constructor(m, a) { this.m = m; this.base = a; }
  get size() { return this.m.mem.rd32(this.base); }
  rd32(o) { return this.m.mem.rd32(this.base + o) >>> 0; }
  wr32(o, v) { this.m.mem.wr32(this.base + o, v | 0); }
  read(o, n) { return this.m.mem.rdBytes(this.base + o, n); }
  write(o, b) { this.m.mem.wrBytes(this.base + o, b); }
  ensure(n) { return n <= this.size; }
}

/** The system sprite area (outside the program's memory; grows as needed) */
class SysArea {
  constructor() { this.buf = new Uint8Array(0); this.base = -1; this.clear(64 * 1024); }
  clear(n) { this.buf = new Uint8Array(n); this.wr32(0, n); this.wr32(4, 0); this.wr32(8, 16); this.wr32(12, 16); }
  get size() { return this.buf.length; }
  rd32(o) { const b = this.buf; return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  wr32(o, v) { const b = this.buf; b[o] = v & 255; b[o + 1] = (v >> 8) & 255; b[o + 2] = (v >> 16) & 255; b[o + 3] = (v >>> 24) & 255; }
  read(o, n) { return this.buf.slice(o, o + n); }
  write(o, b) { this.buf.set(b, o); }
  ensure(n) {
    if (n <= this.buf.length) return true;
    const nb = new Uint8Array(Math.max(n, this.buf.length * 2));
    nb.set(this.buf); this.buf = nb; this.wr32(0, nb.length);
    return true;
  }
}

function areaInfo(A) { return { size: A.rd32(0), count: A.rd32(4), first: A.rd32(8), free: A.rd32(12) }; }

/** [{off, size, name}] of the sprites in an area */
function listArea(A) {
  const i = areaInfo(A), out = [];
  if (i.first < 16 || i.free > A.size) return out;
  let off = i.first;
  for (let n = 0; n < i.count && off + 44 <= i.free; n++) {
    const size = A.rd32(off);
    if (size < 44 || off + size > i.free) break;
    out.push({ off, size, name: blockName(A.read(off + 4, 12)) });
    off += size;
  }
  return out;
}
function blockName(b) { let s = ''; for (let i = 0; i < 12 && b[i] > 32; i++) s += String.fromCharCode(b[i]); return s.toLowerCase(); }

/** Rewrite an area's sprites (blocks of bytes, in order) */
function setBlocks(A, blocks, errFn = E.noRoom) {
  const first = Math.max(16, A.rd32(8));
  const total = first + blocks.reduce((n, b) => n + b.length, 0);
  if (!A.ensure(total)) throw errFn();
  let p = first;
  for (const b of blocks) { A.write(p, b); p += b.length; }
  A.wr32(4, blocks.length); A.wr32(8, first); A.wr32(12, p);
}
const blocksOf = (A) => listArea(A).map((e) => A.read(e.off, e.size));

// ============================================================================ colours
const palWord = (c) => (((c & 0xFF) << 24) | (((c >> 8) & 0xFF) << 16) | (((c >> 16) & 0xFF) << 8)) >>> 0;
const wordRGB = (w) => ((((w >>> 8) & 255) << 16) | (((w >>> 16) & 255) << 8) | ((w >>> 24) & 255)) >>> 0;

/** 0xRRGGBB for each pixel value of a sprite of 8bpp or less: its palette, else its mode's default */
export function spriteColours(s) {
  const out = new Uint32Array(256), p2 = new Uint32Array(256);
  const n = s.pal ? s.pal.length >> 1 : 0;
  if (!n) { defaultPalette(Math.min(3, s.lb), out, p2, false); return out; }
  if (s.bpp === 8 && n < 256) {   // an old 16 entry palette: tints as VDU 19 in a 256 colour mode
    defaultPalette(3, out, p2, false);
    for (let l = 0; l < 16 && l < n; l++) {
      const rgb = wordRGB(s.pal[l * 2]);
      for (let k = 0; k < 16; k++) {
        const i = l + 16 * k;
        let r = (rgb >> 16) & 0x77, g = (rgb >> 8) & 0x33, b = rgb & 0x77;
        if (i & 0x10) r |= 0x88;
        if (i & 0x20) g |= 0x44;
        if (i & 0x40) g |= 0x88;
        if (i & 0x80) b |= 0x88;
        out[i] = (r << 16) | (g << 8) | b;
      }
    }
    return out;
  }
  defaultPalette(Math.min(3, s.lb), out, p2, false);
  for (let i = 0; i < n && i < 256; i++) out[i] = wordRGB(s.pal[i * 2]);
  return out;
}

/** pixel value of the sprite -> screen pixel value (function) */
function converter(v, s, ttab) {
  const pm = v.pixMask;
  if (s.bpp <= 8) {
    const lut = new Uint8Array(256);
    if (ttab) for (let i = 0; i < 256; i++) lut[i] = ttab[i] & pm;
    else if (s.lb === v.log2bpp) for (let i = 0; i < 256; i++) lut[i] = i & pm;
    else { const cols = spriteColours(s), n = 1 << s.bpp; for (let i = 0; i < n; i++) lut[i] = v.nearest(cols[i]); }
    return (p) => lut[p];
  }
  const cache = new Map();
  return (p) => {
    let c = cache.get(p);
    if (c === undefined) {
      const rgb = s.bpp === 16
        ? ((Math.round((p & 31) * 255 / 31) << 16) | (Math.round(((p >> 5) & 31) * 255 / 31) << 8) | Math.round(((p >> 10) & 31) * 255 / 31))
        : (((p & 255) << 16) | (p & 0xFF00) | ((p >> 16) & 255));
      c = v.nearest(rgb); cache.set(p, c);
    }
    return c;
  };
}

function applyAction(act, old, c, pm) {
  switch (act) {
    case 0: return c;
    case 1: return old | c;
    case 2: return old & c;
    case 3: return old ^ c;
    case 4: return ~old & pm;
    case 5: return old;
    case 6: return old & ~c & pm;
    default: return (old | ~c) & pm;
  }
}

// ============================================================================ plotting
/** a VDU with pixels (not the text-only VDU of a task window, not a teletext mode) */
const isGraphics = (v) => !!v.fb && !v.nonGraphic;

/**
 * Plot a sprite (Paint's decoded sprite object) on a VDU with its bottom-left at internal pixel
 * (X, Y). action = GCOL action (+8 = use the mask). o.dw/o.dh = size on screen in pixels (default
 * the sprite's, pixel for pixel), o.ttab = translation table (pixel values), o.maskPlot = plot the
 * mask in the background colour and action (PlotMask). Clipped to the graphics window.
 */
export function plotSprite(v, s, X, Y, action = 0, o = {}) {
  if (!isGraphics(v) || !s || s.bad) return;
  const dw = o.dw ?? s.w, dh = o.dh ?? s.h;
  if (dw <= 0 || dh <= 0) return;
  const maskPlot = !!o.maskPlot;
  const useMask = !!s.mask && (maskPlot || (action & 8));
  const act = action & 7;
  if (!maskPlot && act === 5) return;
  const conv = maskPlot ? null : converter(v, s, o.ttab);
  const x0 = Math.max(X, v.gwl), x1 = Math.min(X + dw - 1, v.gwr);
  const y0 = Math.max(Y, v.gwb), y1 = Math.min(Y + dh - 1, v.gwt);
  if (x0 > x1 || y0 > y1) return;
  const sxs = new Int32Array(x1 - x0 + 1);
  for (let i = 0; i < sxs.length; i++) sxs[i] = Math.floor((x0 + i - X) * s.w / dw);
  const fb = v.fb, W = v.W, pm = v.pixMask, px = s.px, mask = s.mask;
  for (let y = y0; y <= y1; y++) {
    const sy = s.h - 1 - Math.floor((y - Y) * s.h / dh);
    const srow = sy * s.w, drow = (v.yWL - y) * W;
    for (let i = 0; i < sxs.length; i++) {
      const si = srow + sxs[i];
      if (useMask && !mask[si]) continue;
      if (maskPlot) { v._pixOE(x0 + i, y, v.bgOE); continue; }
      const d = drow + x0 + i;
      fb[d] = applyAction(act, fb[d], conv(px[si]), pm);
    }
  }
  v._dirtyRows(v.yWL - y1, v.yWL - y0);
}

/**
 * Plot a sprite through an affine transformation: source point (u, v) in the sprite's OS units
 * (pixels << eig, from the bottom-left of the source rectangle) goes to external coordinates
 * (a*u + c*v + e, b*u + d*v + f). src = {x0, y0, x1, y1} source rectangle in pixels (y up).
 */
export function plotSpriteTransformed(v, s, t, action = 0, o = {}) {
  if (!isGraphics(v) || !s || s.bad) return;
  const src = o.src ?? { x0: 0, y0: 0, x1: s.w, y1: s.h };
  const su = 1 << s.xeig, sv = 1 << s.yeig;
  const U = (src.x1 - src.x0) * su, V = (src.y1 - src.y0) * sv;
  const { a, b, c, d, e, f } = t;
  const det = a * d - b * c;
  if (!det || U <= 0 || V <= 0) return;
  const corners = [[0, 0], [U, 0], [0, V], [U, V]].map(([uu, vv]) => [a * uu + c * vv + e, b * uu + d * vv + f]);
  const ex = (X) => (X + v.orgX) >> v.xEig, ey = (Y) => (Y + v.orgY) >> v.yEig;
  const x0 = Math.max(v.gwl, ex(Math.min(...corners.map((p) => p[0])))), x1 = Math.min(v.gwr, ex(Math.max(...corners.map((p) => p[0]))));
  const y0 = Math.max(v.gwb, ey(Math.min(...corners.map((p) => p[1])))), y1 = Math.min(v.gwt, ey(Math.max(...corners.map((p) => p[1]))));
  if (x0 > x1 || y0 > y1) return;
  const maskPlot = !!o.maskPlot, useMask = !!s.mask && (maskPlot || (action & 8)), act = action & 7;
  if (!maskPlot && act === 5) return;
  const conv = maskPlot ? null : converter(v, s, o.ttab);
  const fb = v.fb, W = v.W, pm = v.pixMask, hx = (1 << v.xEig) / 2, hy = (1 << v.yEig) / 2;
  for (let y = y0; y <= y1; y++) {
    const Y = (y << v.yEig) + hy - v.orgY - f;
    for (let x = x0; x <= x1; x++) {
      const X = (x << v.xEig) + hx - v.orgX - e;
      const uu = (d * X - c * Y) / det, vv = (a * Y - b * X) / det;
      if (uu < 0 || vv < 0 || uu >= U || vv >= V) continue;
      const sx = src.x0 + Math.floor(uu / su), syUp = src.y0 + Math.floor(vv / sv);
      if (sx < 0 || sx >= s.w || syUp < 0 || syUp >= s.h) continue;
      const si = (s.h - 1 - syUp) * s.w + sx;
      if (useMask && !s.mask[si]) continue;
      if (maskPlot) { v._pixOE(x, y, v.bgOE); continue; }
      const i = (v.yWL - y) * W + x;
      fb[i] = applyAction(act, fb[i], conv(s.px[si]), pm);
    }
  }
  v._dirtyRows(v.yWL - y1, v.yWL - y0);
}

// ============================================================================ screen -> sprite
/** Sprite mode word for the VDU's current mode (the mode number, or a new-format mode word) */
export function screenModeWord(v) {
  if (v.teletext) return 9;                      // teletext: saved as its 16 colour 320 x 250 image
  if (typeof v.modeNo === 'number' && spriteModeInfo(v.modeNo & 127)) return v.modeNo & 127;
  return modeFor(v.log2bpp, v.xEig, v.yEig);
}

/**
 * The screen (or a rectangle of it) as a sprite (Paint's sprite object: {name, w, h, px, pal, ...}).
 * opts: name ('screen'), palette (true: the current palette, both flash states), rect {x0, y0, x1, y1}
 * in internal pixels (y up, inclusive; default the whole screen), bank ('display' = what is shown,
 * the default; 'driver' = where the VDU draws). MODE 7 gives the teletext page as shown.
 */
export function screenSprite(v, opts = {}) {
  const r = opts.rect ?? { x0: 0, y0: 0, x1: v.W - 1, y1: v.H - 1 };
  const x0 = Math.max(0, Math.min(r.x0, r.x1)), x1 = Math.min(v.W - 1, Math.max(r.x0, r.x1));
  const y0 = Math.max(0, Math.min(r.y0, r.y1)), y1 = Math.min(v.H - 1, Math.max(r.y0, r.y1));
  const w = Math.max(1, x1 - x0 + 1), h = Math.max(1, y1 - y0 + 1);
  const mode = screenModeWord(v);
  const s = newSprite({ name: opts.name ?? 'screen', w, h, mode });
  let fb;
  if (v.teletext) fb = v._displayFb(v.clock());
  else fb = opts.bank === 'driver' ? v.fb : (v.banks[v.displayBank] ?? v.fb);
  for (let j = 0; j < h; j++) {
    const row = (v.yWL - (y1 - j)) * v.W;
    if (row < 0) continue;
    s.px.set(fb.subarray(row + x0, row + x0 + w), j * w);
  }
  if (opts.palette !== false) {
    const n = Math.min(256, 1 << s.bpp);
    s.pal = new Uint32Array(n * 2);
    for (let i = 0; i < n; i++) { s.pal[i * 2] = palWord(v.pal1[i]); s.pal[i * 2 + 1] = palWord(v.pal2[i]); }
  }
  return s;
}

/**
 * The VDU's screen as a RISC OS sprite file (bytes of a file of type &FF9: one sprite in the
 * screen's mode, with its palette). opts as screenSprite (name defaults to 'screen').
 */
export function screenToSpriteFile(v, opts = {}) {
  return writeSpriteFile({ sprites: [screenSprite(v, opts)] });
}

/** Set the VDU's palette from a sprite's palette (ScreenLoad), when the sprite has the screen's depth */
function paletteFromSprite(v, s) {
  if (!s.pal || v.teletext || s.lb !== v.log2bpp) return;
  const n = s.pal.length >> 1;
  if (s.bpp === 8 && n < 256) {
    for (let l = 0; l < n && l < 16; l++) {
      const w = s.pal[l * 2]; v._vdu19(l, 16, (w >>> 8) & 255, (w >>> 16) & 255, w >>> 24);
    }
    return;
  }
  for (let i = 0; i < n && i < 256; i++) { v.pal1[i] = wordRGB(s.pal[i * 2]); v.pal2[i] = wordRGB(s.pal[i * 2 + 1]); }
  v._palChanged();
}

// ============================================================================ the sprite system
export class SpriteSystem {
  constructor(m) {
    this.m = m;
    this.sys = new SysArea();
    this.chosen = '';          // *SChoose / VDU 23,27,0 / OS_SpriteOp 24: the sprite for PLOT &E8-&EF
    this.dest = null;          // output switched to a sprite: {area, name, mask, vdu}
    this.screenVdu = null;     // the machine's own VDU while output goes to a sprite
    this.onChange = null;      // () => void after a user area changed (hosts that cache decoded sprites)
  }

  get vdu() { return this.m.vdu; }
  _changed() { if (this.onChange) this.onChange(); }
  _name(p) { return this.m.mem.rdStrCtrl(u32(p), 12).replace(/^\s+|\s.*$/gs, '').slice(0, 12); }
  _area(r) { return (r[0] & 0x300) === 0 ? this.sys : new MemArea(this.m, u32(r[1])); }
  /** the sprite named/pointed to by the SWI registers: {A, off, size, name} */
  _find(A, r, need = true) {
    let e = null, nm = '';
    if ((r[0] & 0x300) === 0x200 && A !== this.sys) {
      const off = u32(r[2]) - A.base;
      const found = listArea(A).find((x) => x.off === off);
      e = found ?? null; nm = found?.name ?? '';
    } else { nm = this._name(r[2]); e = listArea(A).find((x) => x.name === nameKey(nm)) ?? null; }
    if (!e && need) throw E.noSprite(nm);
    return e && { A, ...e };
  }
  _decode(e) { return decodeSprite(e.A.read(e.off, e.size)); }
  _replace(A, name, bytes, add = true) {
    const blocks = [], key = nameKey(name);
    let done = false;
    for (const e of listArea(A)) {
      if (e.name === key) { if (!done) blocks.push(bytes); done = true; } else blocks.push(A.read(e.off, e.size));
    }
    if (!done && add) blocks.push(bytes);
    setBlocks(A, blocks);
    if (A !== this.sys) this._changed();
  }
  _store(A, s) { touch(s); this._replace(A, s.name, encodeSprite(s)); }
  _modify(e, fn) { const s = this._decode(e); fn(s); this._store(e.A, s); }

  /** Find a sprite in the system area by name (decoded), or null */
  systemSprite(name) {
    const e = listArea(this.sys).find((x) => x.name === nameKey(name));
    return e ? this._decode({ A: this.sys, ...e }) : null;
  }
  /** names of the sprites in the system area */
  systemNames() { return listArea(this.sys).map((e) => e.name); }

  // ------------------------------------------------------------------ VDU hooks
  /** PLOT &E8-&EF (SpritePlot in vdugrafg): the chosen system sprite at the new point */
  spritePlot(k, v) {
    if (!this.chosen) return;
    const s = this.systemSprite(this.chosen);
    if (!s) return;
    const c = k & 3;
    if (c === 3) { plotSprite(v, s, v.newX, v.newY, 8, { maskPlot: true }); return; }
    const action = c === 0 ? 5 : c === 1 ? v.gplfmd & 15 : 4;
    plotSprite(v, s, v.newX, v.newY, action);
  }
  /** VDU 23,27,0,n selects sprite STR$(n); VDU 23,27,1,n gets sprite STR$(n) from the screen */
  vdu23_27(a, n, v) {
    try {
      if (a === 0) this.chosen = String(n);
      else if (a === 1) this._getFromScreen(this.sys, String(n), false, v.oldX, v.oldY, v.gcsIX, v.gcsIY, v);
    } catch { /* errors ignored, as the kernel */ }
  }

  _getFromScreen(A, name, pal, xa, ya, xb, yb, v = this.vdu) {
    if (!isGraphics(v)) throw E.notGraphics();
    const s = screenSprite(v, { name: nameKey(name), palette: !!pal, bank: 'driver', rect: { x0: xa, y0: ya, x1: xb, y1: yb } });
    touch(s);
    this._replace(A, s.name, encodeSprite(s));
  }

  // ------------------------------------------------------------------ output to a sprite
  _flushDest() {
    const d = this.dest;
    if (!d || d.vdu.dMax < d.vdu.dMin) return;
    d.vdu.dMin = 1e9; d.vdu.dMax = -1;
    const e = listArea(d.A).find((x) => x.name === d.name);
    if (!e) return;
    const s = this._decode({ A: d.A, ...e });
    if (d.mask) s.mask = Uint8Array.from(d.vdu.fb, (p) => (p ? 1 : 0));
    else s.px.set(d.vdu.fb.subarray(0, s.px.length));
    this._store(d.A, s);
  }
  _switchOutput(r, toMask) {
    this._flushDest();
    const prev = this.dest;
    const ret = [0x200 + (prev?.mask ? 61 : 60), prev && prev.A !== this.sys ? prev.A.base : 0, 0, 0];
    if (prev && prev.A !== this.sys) ret[2] = prev.A.base + (listArea(prev.A).find((x) => x.name === prev.name)?.off ?? 0);
    const screen = this.screenVdu ?? this.m.vdu;
    const toScreen = (r[0] & 0x300) !== 0 && u32(r[2]) === 0;
    if (toScreen) {
      this.dest = null;
      if (this.screenVdu) { this.m.vdu = this.screenVdu; this.screenVdu = null; }
    } else {
      if (screen.teletext || !screen.fb) throw E.teletext();
      const A = this._area(r), e = this._find(A, r);
      let s = this._decode(e);
      if (s.bad || s.bpp > 8) throw E.badMode();
      if (toMask && !s.mask) { s.mask = new Uint8Array(s.w * s.h).fill(1); this._store(A, s); }
      const sel = toMask ? { x: s.w, y: s.h, log2bpp: 0, xEig: s.xeig, yEig: s.yeig, exact: true }
        : { x: s.w, y: s.h, log2bpp: s.lb, xEig: s.xeig, yEig: s.yeig, exact: true };
      const sv = new VDU({ mode: sel, onBell: screen.onBell, clock: screen.clock });
      sv.onError = screen.onError; sv.spriteHost = screen.spriteHost;
      if (toMask) { sv.pal1[0] = sv.pal2[0] = 0; sv.pal1[1] = sv.pal2[1] = 0xFFFFFF; sv._palChanged(); sv.fb.set(s.mask.subarray(0, sv.fb.length)); }
      else {
        if (s.pal) { const cols = spriteColours(s); sv.pal1.set(cols); sv.pal2.set(cols); sv._palChanged(); }
        sv.fb.set(s.px.subarray(0, sv.fb.length));
      }
      sv.dMin = 1e9; sv.dMax = -1;
      this.dest = { A, name: e.name, mask: toMask, vdu: sv };
      if (!this.screenVdu) this.screenVdu = screen;
      this.m.vdu = sv;
    }
    r[0] = ret[0]; r[1] = ret[1]; r[2] = ret[2]; r[3] = ret[3];
  }

  // ------------------------------------------------------------------ files
  async _readFile(name) {
    const f = await this.m.readFileBytes(name);
    return f.data;
  }
  async _writeFile(name, bytes) {
    if (!this.m.fs || !this.m.fs.writeFile) throw new BasicError(0xD6, 'No filing system');
    await this.m.fs.writeFile(this.m.gstrans(name), bytes, 0xFF9);
  }
  _loadInto(A, data, merge) {
    let f;
    try { f = readSpriteFile(data); } catch { throw E.badFile(); }
    const raw = f.sprites.map((s) => s.raw ?? encodeSprite(s));
    if (!merge) { setBlocks(A, raw, E.notEnough); if (A !== this.sys) this._changed(); return; }
    const blocks = blocksOf(A), names = listArea(A).map((e) => e.name);
    for (const b of raw) {
      const nm = blockName(b.subarray(4, 16)), i = names.indexOf(nm);
      if (i >= 0) blocks[i] = b; else { blocks.push(b); names.push(nm); }
    }
    setBlocks(A, blocks, E.noRoomMerge);
    if (A !== this.sys) this._changed();
  }
  _areaFile(A) { const i = areaInfo(A); return A.read(4, Math.max(12, i.free - 4)); }

  async screenSave(name, pal = true) {
    const v = this.vdu;
    if (!v.fb) throw E.notGraphics();
    const s = screenSprite(v, { name: 'screendump', palette: pal, bank: 'driver', rect: v.teletext ? undefined : { x0: v.gwl, y0: v.gwb, x1: v.gwr, y1: v.gwt } });
    await this._writeFile(name, writeSpriteFile({ sprites: [s] }));
  }
  async screenLoad(name) {
    const v = this.vdu;
    if (!isGraphics(v)) throw E.notGraphics();
    let f;
    try { f = readSpriteFile(await this._readFile(name)); } catch (e) { if (e instanceof BasicError) throw e; throw E.badFile(); }
    const s = f.sprites[0];
    if (!s || s.bad) throw E.badFile();
    paletteFromSprite(v, s);
    plotSprite(v, s, v.gwl, v.gwb, 0);
  }

  // ------------------------------------------------------------------ OS_SpriteOp
  /** OS_SpriteOp (registers r[0..7] updated); a Promise for the file operations */
  swi(r) {
    if (this.dest) this._flushDest();
    const reason = r[0] & 0x3FF, op = reason & 0xFF;
    const v = this.vdu;
    const scaleOf = (p) => { p = u32(p); if (!p) return { xm: 1, ym: 1, xd: 1, yd: 1 }; const M = this.m.mem; return { xm: M.rd32(p), ym: M.rd32(p + 4), xd: M.rd32(p + 8) || 1, yd: M.rd32(p + 12) || 1 }; };
    const ttabOf = (p) => { p = u32(p); return p ? this.m.mem.rdBytes(p, 256) : null; };
    const ix = (x) => (x + v.orgX) >> v.xEig, iy = (y) => (y + v.orgY) >> v.yEig;
    const scaled = (s, sc) => ({ dw: Math.round(((s.w << s.xeig) * sc.xm / sc.xd) / (1 << v.xEig)), dh: Math.round(((s.h << s.yeig) * sc.ym / sc.yd) / (1 << v.yEig)) });
    switch (op) {
      case 0: case 1: case 4: case 5: case 6: case 7: return;
      case 2: return this.screenSave(this._fileName(r[2]), !!r[3]);
      case 3: return this.screenLoad(this._fileName(r[2]));
      case 8: { const i = areaInfo(this._area(r)); r[2] = i.size; r[3] = i.count; r[4] = i.first; r[5] = i.free; return; }
      case 9: { const A = this._area(r); A.wr32(4, 0); A.wr32(12, A.rd32(8)); if (A === this.sys) this.chosen = ''; else this._changed(); return; }
      case 10: case 11: { const A = this._area(r); return this._readFile(this._fileName(r[2])).then((d) => this._loadInto(A, d, op === 11)); }
      case 12: { const A = this._area(r); return this._writeFile(this._fileName(r[2]), this._areaFile(A)); }
      case 13: {
        const A = this._area(r), e = listArea(A)[r[4] - 1];
        if (!e) throw E.noSprite();
        const n = e.name.slice(0, Math.max(0, r[3] - 1));
        this.m.mem.wrStr0(u32(r[2]), n); r[3] = n.length; return;
      }
      case 14: return this._getFromScreen(this._area(r), this._name(r[2]), r[3], v.oldX, v.oldY, v.gcsIX, v.gcsIY);
      case 16: return this._getFromScreen(this._area(r), this._name(r[2]), r[3], ix(r[4]), iy(r[5]), ix(r[6]), iy(r[7]));
      case 15: {
        const A = this._area(r), nm = nameKey(this._name(r[2]));
        const mode = this._modeWord(r[6]);
        if (r[4] <= 0) throw E.width();
        if (r[5] <= 0) throw E.height();
        const s = newSprite({ name: nm, w: r[4], h: r[5], mode });
        if (r[3] & 1 && s.bpp <= 8) {
          const n = 1 << s.bpp; s.pal = new Uint32Array(n * 2);
          const cols = s.lb === v.log2bpp ? v.pal1 : spriteColours({ ...s, pal: null });
          const cols2 = s.lb === v.log2bpp ? v.pal2 : cols;
          for (let i = 0; i < n; i++) { s.pal[i * 2] = palWord(cols[i]); s.pal[i * 2 + 1] = palWord(cols2[i]); }
        }
        this._replace(A, nm, encodeSprite(s));
        return;
      }
      case 24: {
        const A = this._area(r), e = this._find(A, r);
        if (A === this.sys) this.chosen = e.name; else r[2] = A.base + e.off;
        return;
      }
      case 25: { const e = this._find(this._area(r), r); setBlocks(e.A, listArea(e.A).filter((x) => x.off !== e.off).map((x) => e.A.read(x.off, x.size))); if (e.A !== this.sys) this._changed(); return; }
      case 26: case 27: {
        const e = this._find(this._area(r), r), nn = nameKey(this._name(r[3]));
        if (listArea(e.A).some((x) => x.name === nn && x.off !== e.off)) throw E.exists();
        const b = e.A.read(e.off, e.size);
        b.fill(0, 4, 16); for (let i = 0; i < nn.length; i++) b[4 + i] = nn.charCodeAt(i);
        if (op === 26) { const blocks = listArea(e.A).map((x) => (x.off === e.off ? b : e.A.read(x.off, x.size))); setBlocks(e.A, blocks); }
        else setBlocks(e.A, [...blocksOf(e.A), b]);
        if (e.A !== this.sys) this._changed();
        return;
      }
      case 29: return this._modify(this._find(this._area(r), r), (s) => { s.mask = new Uint8Array(s.w * s.h).fill(1); });
      case 30: return this._modify(this._find(this._area(r), r), (s) => { s.mask = null; });
      case 31: case 32: return this._modify(this._find(this._area(r), r), (s) => rowOp(s, r[3], op === 31));
      case 45: case 46: return this._modify(this._find(this._area(r), r), (s) => colOp(s, r[3], op === 45));
      case 33: return this._modify(this._find(this._area(r), r), (s) => flip(s, true));
      case 47: return this._modify(this._find(this._area(r), r), (s) => flip(s, false));
      case 54: return;                                          // RemoveLeftHandWastage: none kept
      case 40: {
        const s = this._decode(this._find(this._area(r), r));
        r[3] = s.w; r[4] = s.h; r[5] = s.mask ? 1 : 0; r[6] = s.mode; return;
      }
      case 41: case 42: case 43: case 44: {
        const e = this._find(this._area(r), r), s = this._decode(e);
        const x = r[3], y = r[4];
        if (x < 0 || y < 0 || x >= s.w || y >= s.h) throw E.rowCol();
        const i = (s.h - 1 - y) * s.w + x;
        const c256 = s.bpp === 8 && (!s.pal || s.pal.length < 512);
        if (op === 41) { const p = s.px[i]; if (c256) { const g = pixelToGcol(p); r[5] = g.colour; r[6] = g.tint; } else { r[5] = p; r[6] = 0; } return; }
        if (op === 43) { r[5] = s.mask ? s.mask[i] : 1; return; }
        if (op === 42) s.px[i] = c256 ? gcolToPixel((r[5] & 63) | (r[6] & 0xC0)) : (s.bpp >= 32 ? u32(r[5]) : r[5] & ((1 << s.bpp) - 1));
        else { if (!s.mask) return; s.mask[i] = r[5] ? 1 : 0; }
        this._store(e.A, s);
        return;
      }
      case 28: case 34: {
        const s = this._decode(this._find(this._area(r), r));
        if (op === 28) plotSprite(v, s, v.newX, v.newY, r[5]);
        else plotSprite(v, s, ix(r[3]), iy(r[4]), r[5]);
        return;
      }
      case 48: case 49: case 50: {
        const s = this._decode(this._find(this._area(r), r));
        if (op === 48) plotSprite(v, s, v.newX, v.newY, 8, { maskPlot: true });
        else plotSprite(v, s, ix(r[3]), iy(r[4]), 8, { maskPlot: true, ...(op === 50 ? scaled(s, scaleOf(r[6])) : {}) });
        return;
      }
      case 52: case 53: {
        const s = this._decode(this._find(this._area(r), r));
        plotSprite(v, s, ix(r[3]), iy(r[4]), op === 53 ? 0 : r[5], { ...scaled(s, scaleOf(r[6])), ttab: op === 52 ? ttabOf(r[7]) : null });
        return;
      }
      case 55: case 56: {
        const s = this._decode(this._find(this._area(r), r));
        const M = this.m.mem, flags = r[3];
        let src;
        if ((flags & 2) && u32(r[4])) { const p = u32(r[4]); const xs = [M.rd32(p), M.rd32(p + 8)], ys = [M.rd32(p + 4), M.rd32(p + 12)]; src = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; }
        const p = u32(r[6]);
        let t;
        if (flags & 1) {    // destination parallelogram: 4 points (1/256 OS units), bottom-left, bottom-right, top-right, top-left
          const pt = (i) => [M.rd32(p + i * 8) / 256, M.rd32(p + i * 8 + 4) / 256];
          const [p0, p1, p2] = [pt(0), pt(1), pt(2)];
          const U = ((src ? src.x1 - src.x0 : s.w) << s.xeig), V = ((src ? src.y1 - src.y0 : s.h) << s.yeig);
          t = { a: (p1[0] - p0[0]) / U, b: (p1[1] - p0[1]) / U, c: (p2[0] - p1[0]) / V, d: (p2[1] - p1[1]) / V, e: p0[0], f: p0[1] };
        } else {           // matrix: a..d in 16.16 fixed point, e, f in 1/256 OS units
          t = { a: M.rd32(p) / 65536, b: M.rd32(p + 4) / 65536, c: M.rd32(p + 8) / 65536, d: M.rd32(p + 12) / 65536, e: M.rd32(p + 16) / 256, f: M.rd32(p + 20) / 256 };
        }
        plotSpriteTransformed(v, s, t, op === 55 ? 8 : r[5], { src, maskPlot: op === 55, ttab: op === 56 ? ttabOf(r[7]) : null });
        return;
      }
      case 60: case 61: return this._switchOutput(r, op === 61);
      case 62: r[3] = 64; return;                               // ReadSaveAreaSize
      default:
        if (op < 62) return;                                    // unused reason codes do nothing
        throw E.badReason();
    }
  }
  _fileName(p) { return this.m.mem.rdStrCtrl(u32(p), 256); }
  /** a sprite mode: number, mode word, or pointer to a mode selector block */
  _modeWord(w) {
    w = u32(w);
    if (w < 256) { if (!spriteModeInfo(w & 127)) throw E.badMode(); return w & 127; }
    if (w & 1) { if (!spriteModeInfo(w)) throw E.badMode(); return w; }
    const sel = this.m.readSelector(w);
    return modeFor(sel.log2bpp, sel.xEig ?? 1, sel.yEig ?? 1);
  }

  // ------------------------------------------------------------------ *commands
  /** SpriteUtils *commands on the system area (un = upper-case name, rest = arguments) */
  async command(un, rest) {
    const m = this.m, args = rest.split(/\s+/).filter(Boolean);
    const one = (syntax) => { if (!args[0]) throw new BasicError(0xDC, `Syntax: *${syntax}`); return args[0]; };
    const r = (op, ...a) => { const regs = [op, 0, ...a]; return this.swi(regs.concat(new Array(10 - regs.length).fill(0))); };
    const str = (s) => m.sysString(s);
    switch (un) {
      case 'SCHOOSE': { const n = one('SChoose <name>'); r(24, str(n)); return true; }
      case 'SGET': { const n = one('SGet <name>'); r(14, str(n), 0); return true; }
      case 'SFLIPX': { r(33, str(one('SFlipX <name>'))); return true; }
      case 'SFLIPY': { r(47, str(one('SFlipY <name>'))); return true; }
      case 'SDELETE': { one('SDelete <name> [<name>]'); for (const n of args) r(25, str(n)); return true; }
      case 'SRENAME': case 'SCOPY': {
        if (args.length < 2) throw new BasicError(0xDC, `Syntax: *${un === 'SRENAME' ? 'SRename' : 'SCopy'} <old name> <new name>`);
        r(un === 'SRENAME' ? 26 : 27, str(args[0]), str(args[1])); return true;
      }
      case 'SNEW': r(9); this.chosen = ''; return true;
      case 'SLOAD': await r(10, str(one('SLoad <filename>'))); return true;
      case 'SMERGE': await r(11, str(one('SMerge <filename>'))); return true;
      case 'SSAVE': await r(12, str(one('SSave <filename>'))); return true;
      case 'SCREENSAVE': await this.screenSave(one('ScreenSave <filename>'), true); return true;
      case 'SCREENLOAD': await this.screenLoad(one('ScreenLoad <filename>')); return true;
      case 'SLIST': {
        const names = this.systemNames();
        if (!names.length) { m.writeStr('No system sprites defined'); m.newLine(); return true; }
        for (const n of names) { m.writeStr(n); m.newLine(); }
        return true;
      }
      case 'SINFO': {
        const i = areaInfo(this.sys);
        m.writeStr('System sprites status:'); m.newLine();
        m.writeStr(`  ${(i.size + 16) >> 10} Kbytes system sprites workspace`); m.newLine();
        m.writeStr(`  ${i.size - i.free} byte(s) free`); m.newLine();
        m.writeStr(`  ${i.count} system sprite(s) defined`); m.newLine();
        return true;
      }
    }
    return false;
  }
}

// ============================================================================ sprite edits
// (rows and columns are numbered from the bottom-left, as OS_SpriteOp)
function rowOp(s, y, insert) {
  if (y < 0 || y > s.h || (!insert && (y >= s.h || s.h <= 1))) throw E.rowCol();
  const at = s.h - (insert ? y : y + 1);       // index of the row (from the top)
  const w = s.w, px = s.px, nh = s.h + (insert ? 1 : -1);
  const np = new px.constructor(w * nh), nm = s.mask ? new Uint8Array(w * nh) : null;
  if (insert) {
    np.set(px.subarray(0, at * w)); np.set(px.subarray(at * w), (at + 1) * w);
    if (nm) { nm.set(s.mask.subarray(0, at * w)); nm.set(s.mask.subarray(at * w), (at + 1) * w); nm.fill(1, at * w, (at + 1) * w); }
  } else {
    np.set(px.subarray(0, at * w)); np.set(px.subarray((at + 1) * w), at * w);
    if (nm) { nm.set(s.mask.subarray(0, at * w)); nm.set(s.mask.subarray((at + 1) * w), at * w); }
  }
  s.px = np; s.mask = nm; s.h = nh;
}
function colOp(s, x, insert) {
  if (x < 0 || x > s.w || (!insert && (x >= s.w || s.w <= 1))) throw E.rowCol();
  const nw = s.w + (insert ? 1 : -1), np = new s.px.constructor(nw * s.h), nm = s.mask ? new Uint8Array(nw * s.h) : null;
  for (let y = 0; y < s.h; y++) {
    for (let i = 0, j = 0; i < nw; i++) {
      if (insert && i === x) { if (nm) nm[y * nw + i] = 1; continue; }
      if (!insert && j === x) j++;
      np[y * nw + i] = s.px[y * s.w + j];
      if (nm) nm[y * nw + i] = s.mask[y * s.w + j];
      j++;
    }
  }
  s.px = np; s.mask = nm; s.w = nw;
}
function flip(s, vertical) {
  const w = s.w, h = s.h;
  for (const a of [s.px, s.mask]) {
    if (!a) continue;
    const c = a.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = vertical ? c[(h - 1 - y) * w + x] : c[y * w + (w - 1 - x)];
  }
}
