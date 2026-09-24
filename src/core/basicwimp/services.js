// OS services a BASIC desktop program needs besides the Wimp itself:
// MessageTrans_*, Territory_*, OS_SpriteOp (sprite areas in the program's memory, plotting onto
// the VDU), Font_* (outline fonts painted onto the VDU), ColourTrans font colours, Hourglass.
// installServices(machine, proc) registers them on one BasicMachine.

import { vfs } from '../vfs.js';
import { sysvars } from '../sysvars.js';
import { fonts as desktopFonts } from '../fonts.js';
import { decodeSpriteFile } from '../spritefile.js';
import { sprites as wimpSprites, spritesFromFile } from '../sprites.js';
import { parseMessagesText } from '../messages.js';
import { decodeLatin1 } from '../charset.js';
import { BasicError } from '../../basic/errors.js';
import { pixelToGcol } from '../../basic/vdu.js';
import { noteWimpSlot } from './runner.js';

const u32 = (x) => x >>> 0;
export const WIMP_POOL_ROM = 0x2F0000;   // fake sprite area pointers for Wimp_BaseOfSprites
export const WIMP_POOL_RAM = 0x2F0100;

// ============================================================================ memory helpers
export function rdCtrl(m, a, max = 256) { return m.mem.rdStrCtrl(u32(a), max); }
export function wrStr0(m, a, s) { m.mem.wrStr0(u32(a), s); }
export function wrBytes(m, a, bytes) { for (let i = 0; i < bytes.length; i++) m.mem.wr8(u32(a) + i, bytes[i]); }
export function rdBytes(m, a, n) { const out = new Uint8Array(n); for (let i = 0; i < n; i++) out[i] = m.mem.rd8(u32(a) + i); return out; }
const enc = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255);

// ============================================================================ sprite areas
/** Sprite area helpers for areas that live in a BASIC program's memory. */
export class SpriteAreas {
  constructor(m) { this.m = m; this.cache = new Map(); this.version = 0; }
  info(a) { const M = this.m.mem; return { size: M.rd32(a), count: M.rd32(a + 4), first: M.rd32(a + 8), free: M.rd32(a + 12) }; }
  /** [{ptr, name}] */
  list(a) {
    const M = this.m.mem, i = this.info(a), out = [];
    let p = a + i.first;
    for (let n = 0; n < i.count && p < a + i.free; n++) {
      const next = M.rd32(p);
      out.push({ ptr: p, name: M.rdStrCtrl(p + 4, 12).replace(/\0.*$/, '').toLowerCase(), next });
      if (next <= 0) break;
      p += next;
    }
    return out;
  }
  find(a, name) { const n = String(name).toLowerCase(); return this.list(a).find((s) => s.name === n) ?? null; }
  nameAt(ptr) { return this.m.mem.rdStrCtrl(ptr + 4, 12).replace(/\0.*$/, '').toLowerCase(); }
  sig(a) { const i = this.info(a); let h = i.count * 31 + i.free; for (let k = 0; k < Math.min(64, i.free); k += 4) h = (h * 33 + this.m.mem.rd32(a + k)) | 0; return `${h}:${this.version}`; }
  bytes(a) { const i = this.info(a); return rdBytes(this.m, a, Math.max(16, i.free)); }
  /** Map name -> SpriteInfo (for icons) */
  map(a) {
    if (a === 1 || a === 0 || a === WIMP_POOL_ROM || a === WIMP_POOL_RAM) return null;
    const key = 'map:' + a, s = this.sig(a), c = this.cache.get(key);
    if (c && c.sig === s) return c.value;
    let value = new Map();
    try { value = spritesFromFile(this.bytes(a).slice(4)); } catch (e) { console.warn('sprite area', e); }
    this.cache.set(key, { sig: s, value });
    return value;
  }
  /** decoded sprite {name,width,height,xeig,yeig,rgba,...} */
  decoded(a, name) {
    const key = 'dec:' + a, s = this.sig(a);
    let c = this.cache.get(key);
    if (!c || c.sig !== s) {
      const list = new Map();
      try { for (const sp of decodeSpriteFile(this.bytes(a), { area: true })) list.set(sp.name.toLowerCase(), sp); } catch (e) { console.warn(e); }
      c = { sig: s, value: list };
      this.cache.set(key, c);
    }
    return c.value.get(String(name).toLowerCase()) ?? null;
  }
  touch() { this.version++; }
}

/** Resolve a decoded sprite for OS_SpriteOp-style (reason, area, name/ptr); may be a Wimp pool sprite (async). */
export async function resolveSprite(m, areas, reason, area, nameOrPtr) {
  const type = reason & 0xF00;
  if (type === 0 || area === WIMP_POOL_ROM || area === WIMP_POOL_RAM || area === 1) {
    const name = type === 0x200 ? areas.nameAt(nameOrPtr) : rdCtrl(m, nameOrPtr, 12);
    return wimpPoolSprite(name);
  }
  const name = type === 0x200 ? areas.nameAt(nameOrPtr) : rdCtrl(m, nameOrPtr, 12);
  return areas.decoded(area, name);
}

const poolCache = new Map();
/** A Wimp pool sprite as {width, height, xeig, yeig, rgba} (from its PNG). */
export async function wimpPoolSprite(name) {
  const info = wimpSprites.get(name);
  if (!info) return null;
  if (poolCache.has(info)) return poolCache.get(info);
  const c = await info.canvas();
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height);
  const xeig = Math.round(Math.log2(info.osW / info.w)), yeig = Math.round(Math.log2(info.osH / info.h));
  const sp = { name: info.name, width: info.w, height: info.h, xeig, yeig, rgba: d.data, hasMask: true };
  poolCache.set(info, sp);
  return sp;
}

/**
 * Plot a decoded sprite on the VDU with its bottom-left at OS (x, y) (relative to the graphics
 * origin). scale = {xm, ym, xd, yd} or null. Honours the graphics window; mask if action & 8
 * (or always for sprites plotted by the Wimp: opts.mask).
 */
export function plotSprite(vdu, sp, x, y, action = 8, scale = null, opts = {}) {
  if (!sp) return;
  const osW = sp.width << sp.xeig, osH = sp.height << sp.yeig;
  let dw = osW, dh = osH;
  if (scale) { dw = Math.round(osW * scale.xm / (scale.xd || 1)); dh = Math.round(osH * scale.ym / (scale.yd || 1)); }
  const X = (x + vdu.orgX) >> vdu.xEig, Y = (y + vdu.orgY) >> vdu.yEig;
  const pw = Math.max(1, dw >> vdu.xEig), ph = Math.max(1, dh >> vdu.yEig);
  const useMask = (action & 8) || opts.mask;
  const act = action & 7;
  const fb = vdu.fb, W = vdu.W, H = vdu.H;
  const gl = vdu.gwl, gr = vdu.gwr, gb = vdu.gwb, gt = vdu.gwt;
  const rgba = sp.rgba;
  sp._pix ??= new Map();
  let lut = sp._pix.get(vdu);
  if (!lut) {
    lut = new Int16Array(sp.width * sp.height);
    for (let i = 0; i < lut.length; i++) {
      const a = rgba[i * 4 + 3];
      lut[i] = a < 128 ? -1 : vdu.nearest((rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2]);
      if (a < 128 && !useMask) lut[i] = -2;
    }
    sp._pix.set(vdu, lut);
  }
  for (let j = 0; j < ph; j++) {
    const py = Y + j;                                   // internal y (up)
    if (py < gb || py > gt || py < 0 || py >= H) continue;
    const sy = sp.height - 1 - Math.floor(j * sp.height / ph);
    const row = (H - 1 - py) * W;
    for (let i = 0; i < pw; i++) {
      const px = X + i;
      if (px < gl || px > gr || px < 0 || px >= W) continue;
      const sx = Math.floor(i * sp.width / pw);
      let v = lut[sy * sp.width + sx];
      if (v === -1) { if (useMask) continue; v = 0; }
      if (v === -2) { if (useMask) continue; v = 0; }
      const o = row + px;
      if (act === 0 || act === 5) fb[o] = v; else if (act === 1) fb[o] |= v; else if (act === 2) fb[o] &= v; else if (act === 3) fb[o] ^= v; else if (act === 4) fb[o] = ~fb[o] & 255;
    }
  }
  vdu._dirtyAll();
}

// ============================================================================ fonts
export class FontManager {
  constructor() { this.handles = new Map(); this.next = 1; this.current = 0; this.bg = 0xFFFFFF; this.fg = 0; this.ctx = null; }
  find(name, xs, ys) {
    for (const [h, f] of this.handles) if (f.name.toLowerCase() === name.toLowerCase() && f.xs === xs && f.ys === ys) { f.uses++; return h; }
    const h = this.next++;
    this.handles.set(h, { name, xs, ys, uses: 1, css: desktopFonts.cssFor(name.replace(/\\F/, '').split('\\')[0], ys / 16) });
    return h;
  }
  get(h) { return this.handles.get(h || this.current) ?? null; }
  lose(h) { const f = this.handles.get(h); if (f && --f.uses <= 0) this.handles.delete(h); }
  measure(css, s) {
    this.ctx ??= document.createElement('canvas').getContext('2d');
    this.ctx.font = css;
    return this.ctx.measureText(s);
  }
}

/** Paint text with a CSS font onto the VDU at OS (x, y) = baseline start (relative to origin). */
export function paintText(vdu, css, text, x, y, fgRGB, bgRGB, opts = {}) {
  if (!text) return 0;
  const cv = document.createElement('canvas');
  const c = cv.getContext('2d');
  c.font = css;
  const mt = c.measureText(text);
  const asc = Math.ceil(mt.actualBoundingBoxAscent ?? 12) + 2, desc = Math.ceil(mt.actualBoundingBoxDescent ?? 4) + 2;
  const w = Math.ceil(mt.width) + 4, h = asc + desc;
  cv.width = w; cv.height = h;
  c.font = css;
  c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#fff'; c.textBaseline = 'alphabetic';
  c.fillText(text, 1, asc);
  const d = c.getImageData(0, 0, w, h).data;
  const X = ((x + vdu.orgX) >> vdu.xEig) - 1, B = (y + vdu.orgY) >> vdu.yEig;   // baseline (internal y up)
  const fb = vdu.fb, W = vdu.W, H = vdu.H;
  const [fr, fg, fbb] = [(fgRGB >> 16) & 255, (fgRGB >> 8) & 255, fgRGB & 255];
  const [br, bgc, bb] = [(bgRGB >> 16) & 255, (bgRGB >> 8) & 255, bgRGB & 255];
  const cache = new Map();
  for (let j = 0; j < h; j++) {
    const py = B + asc - j;
    if (py < vdu.gwb || py > vdu.gwt || py < 0 || py >= H) continue;
    for (let i = 0; i < w; i++) {
      const px = X + i;
      if (px < vdu.gwl || px > vdu.gwr || px < 0 || px >= W) continue;
      const a = d[(j * w + i) * 4];
      if (a < 40) continue;
      let v;
      if (opts.solid || a > 215) v = cache.get(255) ?? cache.set(255, vdu.nearest(fgRGB)).get(255);
      else {
        const q = a >> 5;
        v = cache.get(q);
        if (v === undefined) {
          const t = (q * 32 + 16) / 255;
          v = vdu.nearest((Math.round(br + (fr - br) * t) << 16) | (Math.round(bgc + (fg - bgc) * t) << 8) | Math.round(bb + (fbb - bb) * t));
          cache.set(q, v);
        }
      }
      fb[(H - 1 - py) * W + px] = v;
    }
  }
  vdu._dirtyAll();
  return mt.width;
}

// ============================================================================ MessageTrans
async function readMessagesFile(path) {
  const p = sysvars.gstrans ? sysvars.gstrans(path) : path;
  const st = vfs.stat(p);
  if (!st || st.type !== 'file') throw new BasicError(0x108D6, `File '${path}' not found`);
  const text = decodeLatin1(await vfs.readFile(st.path));
  return { dict: parseMessagesText(text), size: text.length, path: st.path };
}

function lookupToken(dict, tok) {
  let def = null;
  const i = tok.indexOf(':');
  if (i >= 0) { def = tok.slice(i + 1); tok = tok.slice(0, i); }
  if (tok in dict) return dict[tok];
  // wildcard tokens in the file ('?' matches any character)
  for (const k of Object.keys(dict)) {
    if (k.length === tok.length && k.includes('?') && [...k].every((ch, j) => ch === '?' || ch === tok[j])) return dict[k];
  }
  if (def != null) return def;
  return null;
}

function substitute(m, s, regs) {
  return s.replace(/%([0-3%])/g, (all, n) => {
    if (n === '%') return '%';
    const p = regs[+n];
    return p ? rdCtrl(m, p, 256) : '';
  });
}

// ============================================================================ install
export function installServices(m, proc) {
  const S = (name, fn) => m.registerSwi(name, fn);
  const areas = proc.spriteAreas = new SpriteAreas(m);
  const fontMgr = proc.fonts = new FontManager();
  const msgFiles = proc.msgFiles = new Map();     // descriptor ptr -> {dict, cache: Map token->ptr}
  const vdu = () => m.vdu;

  // ---------------------------------------------------------------- MessageTrans
  S('MessageTrans_FileInfo', async (r) => { const f = await readMessagesFile(rdCtrl(m, r[1])); r[0] = 0; r[2] = f.size + 4; });
  S('MessageTrans_OpenFile', async (r) => {
    const f = await readMessagesFile(rdCtrl(m, r[1]));
    msgFiles.set(u32(r[0]), { dict: f.dict, cache: new Map(), name: rdCtrl(m, r[1]) });
    m.mem.wr32(u32(r[0]), 0x4D534754);
  });
  S('MessageTrans_CloseFile', (r) => { msgFiles.delete(u32(r[0])); });
  const lookup = (r, gs) => {
    const desc = u32(r[0]);
    const tok = rdCtrl(m, r[1], 256);
    const file = msgFiles.get(desc) ?? (desc === 0 ? proc.globalMessages : null);
    let v = file ? lookupToken(file.dict, tok) : null;
    if (v == null) throw new BasicError(0xAC2, `Message token ${tok.split(':')[0]} not found`);
    if (u32(r[2])) {
      v = substitute(m, v, [r[4], r[5], r[6], r[7]]);
      if (gs) v = sysvars.gstrans(v);
      const buf = u32(r[2]), size = r[3];
      const s = v.slice(0, Math.max(0, size - 1));
      wrStr0(m, buf, s);
      r[3] = s.length;
    } else {
      // pointer to the (read-only) message, terminated by a control character
      let p = file?.cache.get(v);
      if (!p) { p = m.sysAlloc(v.length + 1); wrBytes(m, p, enc(v)); m.mem.wr8(p + v.length, 10); file?.cache.set(v, p); }
      r[2] = p; r[3] = v.length;
    }
    r[1] = u32(r[1]) + tok.length;
  };
  S('MessageTrans_Lookup', (r) => lookup(r, false));
  S('MessageTrans_GSLookup', (r) => lookup(r, true));
  S('MessageTrans_ErrorLookup', (r) => {
    const e = u32(r[0]);
    const num = m.mem.rd32(e);
    const tok = rdCtrl(m, e + 4, 252);
    const file = msgFiles.get(u32(r[1]));
    let v = file ? lookupToken(file.dict, tok) : null;
    if (v == null) v = tok;
    v = substitute(m, v, [r[4], r[5], r[6], r[7]]);
    throw new BasicError(num, v);
  });
  S('MessageTrans_CopyError', (r) => { const e = u32(r[0]); throw new BasicError(m.mem.rd32(e), rdCtrl(m, e + 4, 252)); });
  S('MessageTrans_MakeMenus', () => { throw new BasicError(0, 'MessageTrans_MakeMenus is not supported'); });
  S('MessageTrans_EnumerateTokens', (r) => { r[2] = 0; });

  // ---------------------------------------------------------------- Territory
  const symbols = new Map();
  const symPtr = (s) => { if (!symbols.has(s)) { const p = m.sysAlloc(s.length + 1); wrStr0(m, p, s); symbols.set(s, p); } return symbols.get(s); };
  S('Territory_ReadSymbols', (r) => {
    const tab = { 0: '.', 1: ',', 3: '£', 4: '£', 5: '.', 6: ',', 8: '-', 9: '', 10: '', 11: '', 12: '', 13: '' };
    const n = r[1];
    if (n === 2 || n === 7) { const p = m.sysAlloc(8); m.mem.wr8(p, 3); m.mem.wr8(p + 1, 0); r[0] = p; return; }
    if ([14, 15, 16, 17, 18, 19].includes(n)) { r[0] = { 14: 3, 15: 1, 16: 1, 17: 3, 18: 1, 19: 1 }[n]; return; }
    r[0] = symPtr(tab[n] ?? '');
  });
  S('Territory_Collate', (r, mm, ctx) => {
    let a = rdCtrl(m, r[1], 1024), b = rdCtrl(m, r[2], 1024);
    if (r[3] & 1) { a = a.toLowerCase(); b = b.toLowerCase(); }
    const c = a < b ? -1 : a > b ? 1 : 0;
    r[0] = c;
    ctx.flags = (ctx.flags & ~(8 | 4 | 2)) | (c < 0 ? 8 : 0) | (c === 0 ? 4 : 0) | (c >= 0 ? 2 : 0);
  });
  S('Territory_ConvertDateAndTime', (r) => {
    const regs = [r[1], r[2], r[3], r[4], 0, 0, 0, 0, 0, 0];
    const res = m.callSwiByName('OS_ConvertDateAndTime', regs);
    r[0] = res.r[0]; r[1] = res.r[1]; r[2] = res.r[2];
  });
  S('Territory_ConvertStandardDateAndTime', (r) => {
    const regs = [r[1], r[2], r[3], 0, 0, 0, 0, 0, 0, 0];
    const res = m.callSwiByName('OS_ConvertStandardDateAndTime', regs);
    r[0] = res.r[0]; r[1] = res.r[1]; r[2] = res.r[2];
  });
  S('Territory_UpperCaseTable', (r) => { if (!proc._uct) { proc._uct = m.sysAlloc(256); for (let i = 0; i < 256; i++) m.mem.wr8(proc._uct + i, String.fromCharCode(i).toUpperCase().charCodeAt(0) & 255); } r[0] = proc._uct; });
  S('Territory_LowerCaseTable', (r) => { if (!proc._lct) { proc._lct = m.sysAlloc(256); for (let i = 0; i < 256; i++) m.mem.wr8(proc._lct + i, String.fromCharCode(i).toLowerCase().charCodeAt(0) & 255); } r[0] = proc._lct; });
  S('Territory_Exists', (r, mm, ctx) => { ctx.flags |= 4; });
  S('Territory_NumberToName', (r) => { wrStr0(m, r[1], 'UK'); });

  // ---------------------------------------------------------------- OS_SpriteOp
  const noArea = () => new BasicError(0x80, 'No sprite area');
  S('OS_SpriteOp', (r) => spriteOp(r));
  async function spriteOp(r) {
    const reason = r[0] & 0x3FF, op = reason & 0xFF, type = reason & 0x300;
    const a = u32(r[1]);
    const isPool = type === 0 || a === WIMP_POOL_ROM || a === WIMP_POOL_RAM;
    const M = m.mem;
    const name = () => (type === 0x200 ? areas.nameAt(u32(r[2])) : rdCtrl(m, r[2], 12)).toLowerCase();
    const need = () => {
      if (isPool) return null;
      const s = type === 0x200 ? { ptr: u32(r[2]), name: areas.nameAt(u32(r[2])) } : areas.find(a, name());
      if (!s) throw new BasicError(0x86, `Sprite '${name()}' doesn't exist`);
      return s;
    };
    switch (op) {
      case 8: { if (isPool) { r[2] = 0; r[3] = 0; r[4] = 16; r[5] = 16; return; } const i = areas.info(a); r[2] = i.size; r[3] = i.count; r[4] = i.first; r[5] = i.free; return; }
      case 9: if (isPool) return; M.wr32(a + 4, 0); M.wr32(a + 8, 16); M.wr32(a + 12, 16); areas.touch(); return;
      case 10: case 11: {
        if (isPool) return;
        const path = rdCtrl(m, r[2], 256);
        const st = vfs.stat(path);
        if (!st || st.type !== 'file') throw new BasicError(0x108D6, `File '${path}' not found`);
        const data = await vfs.readFile(st.path);
        if (op === 10) {
          const size = M.rd32(a);
          if (data.length + 4 > size) throw new BasicError(0x82, 'No room to get sprite');
          wrBytes(m, a + 4, data);
        } else mergeSprites(a, data);
        areas.touch();
        return;
      }
      case 12: {
        if (isPool) return;
        const i = areas.info(a);
        vfs.writeFile(rdCtrl(m, r[2], 256), rdBytes(m, a + 4, i.free - 4), { filetype: 0xFF9 });
        return;
      }
      case 13: {
        if (isPool) throw noArea();
        const list = areas.list(a); const s = list[r[4] - 1];
        if (!s) throw new BasicError(0x86, 'Sprite doesn\'t exist');
        const n = s.name.slice(0, Math.max(0, r[3] - 1)); wrStr0(m, r[2], n); r[3] = n.length; return;
      }
      case 24: { const s = need(); if (s) r[2] = s.ptr; return; }
      case 25: { const s = need(); if (!s) return; deleteSprite(a, s.ptr); areas.touch(); return; }
      case 26: { const s = need(); if (!s) return; const nn = rdCtrl(m, r[3], 12).padEnd(12, '\0'); wrBytes(m, s.ptr + 4, enc(nn.toLowerCase())); areas.touch(); return; }
      case 27: { const s = need(); if (!s) return; copySprite(a, s.ptr, rdCtrl(m, r[3], 12)); areas.touch(); return; }
      case 15: { if (isPool) throw noArea(); createSprite(a, rdCtrl(m, r[2], 12), r[3], r[4], r[5], r[6]); areas.touch(); return; }
      case 40: {
        const sp = await resolveSprite(m, areas, reason, a, u32(r[2]));
        if (!sp) throw new BasicError(0x86, `Sprite '${name()}' doesn't exist`);
        r[3] = sp.width; r[4] = sp.height; r[5] = sp.hasMask ? 1 : 0; r[6] = sp.mode ?? (sp.xeig === 1 && sp.yeig === 2 ? 12 : 28);
        return;
      }
      case 28: case 34: case 52: {
        const sp = await resolveSprite(m, areas, reason, a, u32(r[2]));
        if (!sp) throw new BasicError(0x86, `Sprite '${name()}' doesn't exist`);
        const v = vdu();
        let x = r[3], y = r[4], act = r[5];
        if (op === 28) { x = v.gcsX; y = v.gcsY; act = r[3]; }
        let scale = null;
        if (op === 52 && u32(r[6])) { const p = u32(r[6]); scale = { xm: M.rd32(p), ym: M.rd32(p + 4), xd: M.rd32(p + 8), yd: M.rd32(p + 12) }; }
        plotSprite(v, sp, x, y, act, scale);
        return;
      }
      case 14: case 16: {                             // get sprite from the screen (this program's VDU)
        if (isPool) throw noArea();
        const v = vdu();
        let x0, y0, x1, y1;
        if (op === 16) { x0 = r[4]; y0 = r[5]; x1 = r[6]; y1 = r[7]; } else { x0 = v.oldX; y0 = v.oldY; x1 = v.gcsX; y1 = v.gcsY; }
        const px0 = Math.max(0, (Math.min(x0, x1) + v.orgX) >> v.xEig), px1 = Math.min(v.W - 1, (Math.max(x0, x1) + v.orgX) >> v.xEig);
        const py0 = Math.max(0, (Math.min(y0, y1) + v.orgY) >> v.yEig), py1 = Math.min(v.H - 1, (Math.max(y0, y1) + v.orgY) >> v.yEig);
        const w = Math.max(1, px1 - px0 + 1), h = Math.max(1, py1 - py0 + 1);
        const nm = rdCtrl(m, r[2], 12);
        createSprite(a, nm, 0, w, h, 28);
        const s = areas.find(a, nm);
        const img = s.ptr + M.rd32(s.ptr + 32), rowBytes = (M.rd32(s.ptr + 16) + 1) * 4;
        for (let j = 0; j < h; j++) {
          const row = (v.H - 1 - (py1 - j)) * v.W;
          for (let i = 0; i < w; i++) M.wr8(img + j * rowBytes + i, v.fb[row + px0 + i]);
        }
        areas.touch();
        return;
      }
      case 41: case 42: return;                       // read/write pixel: not supported (no sprite output)
      case 60: case 61: r[0] = 0; r[1] = 0; r[2] = 0; r[3] = 0; return; // switch output: stays on screen
      case 62: r[3] = 0; return;
      case 29: case 30: case 31: case 32: case 33: case 35: case 36: case 37: case 38: case 39: case 44: case 45: case 46: case 47: case 48: case 49: case 50: case 51: case 53: case 54: case 55: case 56: case 57: case 58: case 59: return;
      default: return;
    }
  }
  function spriteBlocks(a) { return areas.list(a).map((s) => rdBytes(m, s.ptr, s.next)); }
  function rebuild(a, blocks) {
    const size = m.mem.rd32(a);
    let p = 16;
    for (const b of blocks) {
      if (a + p + b.length > a + size) throw new BasicError(0x82, 'No room to get sprite');
      wrBytes(m, a + p, b); p += b.length;
    }
    m.mem.wr32(a + 4, blocks.length); m.mem.wr32(a + 8, 16); m.mem.wr32(a + 12, p);
  }
  function mergeSprites(a, fileBytes) {
    const v = new DataView(fileBytes.buffer, fileBytes.byteOffset, fileBytes.byteLength);
    const n = v.getUint32(0, true); let off = v.getUint32(4, true) - 4;
    const cur = spriteBlocks(a);
    for (let i = 0; i < n; i++) {
      const next = v.getUint32(off, true);
      const b = fileBytes.slice(off, off + next);
      const nm = decodeLatin1(b.slice(4, 16)).replace(/\0.*$/, '').toLowerCase();
      const j = cur.findIndex((c) => decodeLatin1(c.slice(4, 16)).replace(/\0.*$/, '').toLowerCase() === nm);
      if (j >= 0) cur[j] = b; else cur.push(b);
      off += next;
    }
    rebuild(a, cur);
  }
  function deleteSprite(a, ptr) { rebuild(a, areas.list(a).filter((s) => s.ptr !== ptr).map((s) => rdBytes(m, s.ptr, s.next))); }
  function copySprite(a, ptr, newName) {
    const blocks = spriteBlocks(a);
    const src = areas.list(a).find((s) => s.ptr === ptr);
    const b = rdBytes(m, ptr, src.next);
    b.set(enc(newName.toLowerCase().padEnd(12, '\0').slice(0, 12)), 4);
    blocks.push(b); rebuild(a, blocks);
  }
  function createSprite(a, nm, pal, w, h, mode) {
    const l2 = { 12: 2, 15: 3, 20: 2, 21: 3, 27: 2, 28: 3, 25: 0, 26: 1, 18: 0, 19: 1 }[mode] ?? 3;
    const bpp = 1 << l2;
    const words = Math.ceil(w * bpp / 32);
    const img = words * 4 * h;
    const size = 44 + img;
    const b = new Uint8Array(size);
    const dv = new DataView(b.buffer);
    dv.setUint32(0, size, true); b.set(enc(nm.toLowerCase().padEnd(12, '\0').slice(0, 12)), 4);
    dv.setUint32(16, words - 1, true); dv.setUint32(20, h - 1, true); dv.setUint32(24, 0, true);
    dv.setUint32(28, (w * bpp - 1) % 32, true); dv.setUint32(32, 44, true); dv.setUint32(36, 44, true); dv.setUint32(40, mode, true);
    const blocks = spriteBlocks(a).filter((x) => decodeLatin1(x.slice(4, 16)).replace(/\0.*$/, '').toLowerCase() !== nm.toLowerCase());
    blocks.push(b); rebuild(a, blocks);
  }

  // ---------------------------------------------------------------- Font manager
  const fontErr = () => new BasicError(0x209, 'Undefined font handle');
  S('Font_FindFont', (r) => {
    const name = rdCtrl(m, r[1], 128).replace(/^\\F/, '').split(/\\/)[0].trim();
    r[0] = fontMgr.find(name, r[2], r[3]);
    r[4] = 90; r[5] = 90;
  });
  S('Font_LoseFont', (r) => { fontMgr.lose(r[0]); });
  S('Font_SetFont', (r) => { if (!fontMgr.get(r[0])) throw fontErr(); fontMgr.current = r[0]; });
  S('Font_CurrentFont', (r) => { r[0] = fontMgr.current; r[1] = fontMgr.bg; r[2] = fontMgr.fg; r[3] = 14; });
  S('Font_ReadDefn', (r) => {
    const f = fontMgr.get(r[0]); if (!f) throw fontErr();
    if (u32(r[1])) wrStr0(m, r[1], f.name);
    r[2] = f.xs; r[3] = f.ys; r[4] = 90; r[5] = 90; r[6] = f.uses; r[7] = 0;
  });
  S('Font_ReadInfo', (r) => {
    const f = fontMgr.get(r[0]); if (!f) throw fontErr();
    const px = f.ys / 16 * 90 / 72;
    r[1] = 0; r[2] = -Math.round(px * 0.3 * 2); r[3] = Math.round(px * 2); r[4] = Math.round(px * 1.2 * 2);
  });
  const strOf = (p, len) => { let s = ''; const M = m.mem; for (let i = 0; i < len; i++) { const c = M.rd8(u32(p) + i); if (c < 32 && c !== 9 && !(c >= 17 && c <= 27)) break; s += String.fromCharCode(c); } return s; };
  const plainText = (s) => s.replace(/[\x11\x12]./gs, '').replace(/\x13.{7}/gs, '').replace(/\x1a./gs, '').replace(/[\x09\x0b].{3}/gs, '').replace(/[\x15].{3}/gs, '').replace(/[\x19].{2}/gs, '').replace(/[\x00-\x1f]/g, '');
  const toOS = (v, flags) => (flags & 16 ? v : Math.round(v / 400));
  S('Font_Paint', (r) => {
    const flags = r[2];
    const h = (flags & 256) ? r[0] : fontMgr.current;
    const f = fontMgr.get(h) ?? fontMgr.get(fontMgr.current);
    const len = (flags & 128) ? r[7] : 1024;
    const raw = strOf(r[1], len);
    const css = f?.css ?? desktopFonts.cssFor('Homerton.Medium', 12);
    let x = toOS(r[3], flags), y = toOS(r[4], flags);
    if (flags & 512 && !(flags & 16)) { /* justification ignored */ }
    const v = vdu();
    if (proc.bridge?.inRedraw || !proc.bridge) paintText(v, css, plainText(raw), x - (flags & 16 ? 0 : 0), y, fontMgr.fg, fontMgr.bg);
  });
  const measure = (h, s) => { const f = fontMgr.get(h) ?? fontMgr.get(fontMgr.current); return fontMgr.measure(f?.css ?? desktopFonts.css, plainText(s)).width * 2; };
  S('Font_StringWidth', (r) => {
    const s = strOf(r[1], r[5] > 0 ? r[5] : 1024);
    const maxX = r[2] / 400;
    let n = s.length, w = measure(0, s);
    while (n > 0 && w > maxX) { n--; w = measure(0, s.slice(0, n)); }
    r[2] = Math.round(w * 400); r[3] = 0; r[4] = 0; r[5] = n;
    r[1] = u32(r[1]) + n;
  });
  S('Font_ScanString', (r) => {
    const flags = r[2];
    const s = strOf(r[1], (flags & 128) ? r[7] : 1024);
    const h = (flags & 256) ? r[0] : 0;
    const w = measure(h, s);
    r[3] = Math.round(w * 400); r[4] = 0; r[1] = u32(r[1]) + s.length;
  });
  S('Font_StringBBox', (r) => {
    const s = strOf(r[1], 1024); const w = measure(0, s);
    const b = u32(r[2]); m.mem.wr32(b, 0); m.mem.wr32(b + 4, -2000); m.mem.wr32(b + 8, Math.round(w * 400)); m.mem.wr32(b + 12, 8000);
  });
  S('Font_ConverttoOS', (r) => { r[1] = Math.round(r[1] / 400); r[2] = Math.round(r[2] / 400); });
  S('Font_Converttopoints', (r) => { r[1] = r[1] * 400; r[2] = r[2] * 400; });
  S('Font_SetFontColours', (r) => {
    if (r[0]) fontMgr.current = r[0];
    const v = vdu();
    const rgb = (g) => { const p = v.pal1[gcolPixel(v, g)]; return p; };
    fontMgr.bg = rgb(r[1]); fontMgr.fg = rgb(r[2]);
  });
  S('Font_CharBBox', (r) => { r[1] = 0; r[2] = -4; r[3] = 16; r[4] = 24; });
  S('Font_ReadScaleFactor', (r) => { r[1] = 400; r[2] = 400; });
  S('Font_SetScaleFactor', () => {});
  S('Font_ReadThresholds', () => {});
  S('Font_SetThresholds', () => {});
  S('Font_SetPalette', (r) => { if (r[0]) fontMgr.current = r[0]; fontMgr.bg = (r[5] >>> 8) & 0xFFFFFF; fontMgr.fg = (r[6] >>> 8) & 0xFFFFFF; fontMgr.bg = bgrToRgb(r[5]); fontMgr.fg = bgrToRgb(r[6]); });
  S('Font_CacheAddr', (r) => { r[0] = 337; r[2] = 0; r[3] = 64 * 1024; });
  S('Font_ListFonts', (r) => { r[2] = -1; });
  S('ColourTrans_SetFontColours', (r) => { if (r[0]) fontMgr.current = r[0]; fontMgr.bg = bgrToRgb(r[1]); fontMgr.fg = bgrToRgb(r[2]); r[1] = 0; r[2] = 7; r[3] = 14; });
  S('ColourTrans_ReturnFontColours', (r) => { r[3] = 14; });
  proc.setFontColoursRGB = (bg, fg) => { fontMgr.bg = bg; fontMgr.fg = fg; };

  // ---------------------------------------------------------------- sound voices (the 3.71 defaults)
  const VOICES = ['WaveSynth-Beep', 'StringLib-Soft', 'StringLib-Pluck', 'StringLib-Steel', 'StringLib-Hard', 'Percussion-Soft', 'Percussion-Medium', 'Percussion-Snare', 'Percussion-Noise'];
  const voicePtr = (n) => symPtr(VOICES[n - 1] ?? '');
  S('Sound_InstallVoice', (r) => {
    if (r[0] === 0) { const slot = r[1]; r[0] = slot > 0 && slot <= VOICES.length ? voicePtr(slot) : 0; r[1] = slot === 0 ? VOICES.length + 1 : slot; return; }
    if (r[0] === 2) { const v = r[1]; r[2] = v >= 1 && v <= VOICES.length ? voicePtr(v) : 0; r[3] = r[2]; return; }
    if (r[0] === 1 || r[0] === 3) return;
    r[1] = 0;
  });
  S('Sound_AttachNamedVoice', (r) => { const n = rdCtrl(m, r[1], 40); const i = VOICES.findIndex((v) => v.toLowerCase() === n.toLowerCase()); r[0] = i >= 0 ? 0 : r[0]; });
  S('Sound_AttachVoice', (r) => { const old = proc._voices?.[r[0]] ?? 1; (proc._voices ??= [])[r[0]] = r[1]; r[1] = old; });

  // ---------------------------------------------------------------- misc
  for (const n of ['Hourglass_On', 'Hourglass_Off', 'Hourglass_Smash', 'Hourglass_Start', 'Hourglass_Percentage', 'Hourglass_LEDs', 'Hourglass_Colours']) S(n, () => {});
  S('OS_ReadMemMapInfo', (r) => { r[0] = 4096; r[1] = 1024; });
  S('OS_ReadDynamicArea', (r) => {
    // a RiscPC with 16MB: system heap, RMA, screen, system sprites, font cache, RAM disc, free pool
    const sizes = { 0: 32 << 10, 1: 1 << 20, 2: 2 << 20, 3: 64 << 10, 4: 256 << 10, 5: 0, 6: 8 << 20 };
    const n = r[0] & 0x7F;
    r[0] = 0x1800000 + n * 0x100000; r[1] = sizes[n] ?? 0; r[2] = 16 << 20;
  });
}

/** &BBGGRRxx palette entry -> 0xRRGGBB */
export function bgrToRgb(w) { w >>>= 0; return (((w >>> 8) & 255) << 16) | (((w >>> 16) & 255) << 8) | ((w >>> 24) & 255); }
/** GCOL colour (0-255 with tint in bits 6-7? old style) -> pixel for 256-colour modes */
export function gcolPixel(v, g) { return v.nColour >= 63 ? ((g & 63) << 2 | (g >> 6)) & 255 : g & v.nColour; }
export { pixelToGcol };

/** WimpSlot tracking: the core's *WimpSlot is a no-op; remember -min for the next BASIC program's HIMEM. */
export function hookWimpSlot(cli) {
  const prev = cli.find('wimpslot');
  cli.register('WimpSlot', {
    ...(prev ?? {}), name: 'WimpSlot', syntax: 'Syntax: *WimpSlot [-min] <size>[K] [-max <size>[K]] [-next <size>[K]]',
    run: async (argv) => {
      let min = null;
      for (let i = 0; i < argv.length; i++) {
        const a = argv[i].toLowerCase();
        if (a === '-min' || (!a.startsWith('-') && min == null)) { const v = a === '-min' ? argv[++i] : argv[i]; min = parseInt(v, 10) * (/k$/i.test(v) ? 1 : /m$/i.test(v) ? 1024 : 1 / 1024); }
      }
      if (min) noteWimpSlot(Math.round(min));
    },
  });
}
