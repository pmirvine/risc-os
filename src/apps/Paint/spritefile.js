// RISC OS sprite file codec for Paint: reads a sprite file into *editable* sprites (pixel
// values, mask, palette) and writes it back byte-compatibly. Host-agnostic (node + browser).
//
//   const f = readSpriteFile(bytes)       -> { ext: Uint8Array, sprites: [PSprite] }
//   writeSpriteFile(f)                    -> Uint8Array   (unmodified sprites keep their raw bytes)
//   newSprite({name, w, h, mode, mask, palette})
//
// PSprite fields:
//   name, mode (mode word), bpp, xeig, yeig, newFormat, w, h, lbit
//   pal: null | Uint32Array(2*n) palette words (first/second flash colour, 0xBBGGRR00)
//   px: Uint8Array (bpp <= 8, pixel values) | Uint32Array (16/32 bpp: raw pixel value), row 0 = top
//   mask: null | Uint8Array (1 = solid, 0 = transparent)
//   raw: Uint8Array | null - original bytes (dropped by touch())
// Sprite files on disc are sprite areas without the first (size) word.

// Old screen modes: [log2bpp, xeig, yeig, width, height]
export const MODES = {
  0: [0, 1, 2, 640, 256], 1: [1, 2, 2, 320, 256], 2: [2, 3, 2, 160, 256], 3: [0, 1, 2, 640, 250], 4: [0, 2, 2, 320, 256],
  5: [1, 3, 2, 160, 256], 6: [0, 2, 2, 320, 250], 7: [2, 2, 2, 320, 225], 8: [1, 1, 2, 640, 256], 9: [2, 2, 2, 320, 256],
  10: [3, 3, 2, 160, 256], 11: [1, 1, 2, 640, 250], 12: [2, 1, 2, 640, 256], 13: [3, 2, 2, 320, 256], 14: [2, 1, 2, 640, 250],
  15: [3, 1, 2, 640, 256], 16: [2, 1, 2, 1056, 256], 17: [2, 1, 2, 1056, 250], 18: [0, 1, 1, 640, 512], 19: [1, 1, 1, 640, 512],
  20: [2, 1, 1, 640, 512], 21: [3, 1, 1, 640, 512], 22: [2, 0, 1, 768, 288], 23: [0, 1, 1, 1152, 896], 24: [3, 1, 2, 1056, 256],
  25: [0, 1, 1, 640, 480], 26: [1, 1, 1, 640, 480], 27: [2, 1, 1, 640, 480], 28: [3, 1, 1, 640, 480], 29: [0, 1, 1, 800, 600],
  30: [1, 1, 1, 800, 600], 31: [2, 1, 1, 800, 600], 32: [3, 1, 1, 800, 600], 33: [0, 1, 2, 768, 288], 34: [1, 1, 2, 768, 288],
  35: [2, 1, 2, 768, 288], 36: [3, 1, 2, 768, 288], 37: [0, 1, 2, 896, 352], 38: [1, 1, 2, 896, 352], 39: [2, 1, 2, 896, 352],
  40: [3, 1, 2, 896, 352], 41: [0, 1, 2, 640, 352], 42: [1, 1, 2, 640, 352], 43: [2, 1, 2, 640, 352], 44: [0, 1, 2, 640, 200],
  45: [1, 1, 2, 640, 200], 46: [2, 1, 2, 640, 200], 47: [3, 2, 1, 360, 480], 48: [2, 2, 1, 320, 480], 49: [3, 2, 1, 320, 480],
};
const TYPE_LB = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 };
const dpiToEig = (d) => (d >= 180 ? 0 : d >= 90 ? 1 : d >= 45 ? 2 : 3);

/** Decode a sprite mode word. Returns null for an unknown mode. */
export function modeInfo(mode) {
  mode >>>= 0;
  if (mode < 256) {
    const m = MODES[mode & 127];
    if (!m) return null;
    return { lb: m[0], bpp: 1 << m[0], xeig: m[1], yeig: m[2], newFormat: false, mode };
  }
  if (!(mode & 1)) return null;
  const type = mode >>> 27, lb = TYPE_LB[type];
  if (lb == null) return null;
  const xdpi = (mode >>> 1) & 0x1FFF, ydpi = (mode >>> 14) & 0x1FFF;
  return { lb, bpp: 1 << lb, xeig: dpiToEig(xdpi), yeig: dpiToEig(ydpi), xdpi, ydpi, newFormat: true, mode };
}

/** Mode word for lb_bpp + eigs, as Paint's Create box does (old numbered mode when one exists). */
export function modeFor(lb, xeig, yeig) {
  const m12 = [0, 8, 12, 15], m22 = [-1, 1, 9, 13], m11 = [25, 26, 27, 28];
  if (lb <= 3) {
    if (xeig === 1 && yeig === 1) return m11[lb];
    if (xeig === 1 && yeig === 2) return m12[lb];
    if (xeig === 2 && yeig === 2 && m22[lb] >= 0) return m22[lb];
  }
  return ((((lb + 1) << 27) | ((180 >> yeig) << 14) | ((180 >> xeig) << 1) | 1) >>> 0);
}

const nameOf = (buf, off) => {
  let s = '';
  for (let j = 0; j < 12; j++) { const c = buf[off + j]; if (c <= 32) break; s += String.fromCharCode(c); }
  return s;
};

export function readSpriteFile(buf) {
  if (!(buf instanceof Uint8Array)) buf = new Uint8Array(buf);
  if (buf.length < 12) throw new Error('Not a sprite file');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const u32 = (o) => dv.getUint32(o, true);
  const count = u32(0), first = u32(4);
  if (first < 16 || first - 4 > buf.length) throw new Error('Bad sprite area');
  const ext = buf.slice(12, first - 4);
  const sprites = [];
  let off = first - 4;
  for (let i = 0; i < count && off + 44 <= buf.length; i++) {
    const next = u32(off);
    if (next < 44 || off + next > buf.length) break;
    sprites.push(decodeSprite(buf.subarray(off, off + next)));
    off += next;
  }
  return { ext, sprites };
}

export function decodeSprite(raw) {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const u32 = (o) => dv.getUint32(o, true);
  const s = { name: nameOf(raw, 4), raw: raw.slice() };
  const wWords = u32(16) + 1, h = u32(20) + 1, lbit = u32(24), rbit = u32(28);
  const imgOff = u32(32), maskOff = u32(36), mode = u32(40);
  const mi = modeInfo(mode);
  s.mode = mode; s.lbit = lbit;
  if (!mi) { s.bad = true; s.w = -1; s.h = -1; s.bpp = 0; s.xeig = 1; s.yeig = 1; s.pal = null; s.mask = null; return s; }
  const bpp = mi.bpp;
  Object.assign(s, { bpp, lb: mi.lb, xeig: mi.xeig, yeig: mi.yeig, newFormat: mi.newFormat });
  const rowBits = wWords * 32 - lbit - (31 - rbit);
  const w = Math.max(1, Math.floor(rowBits / bpp));
  s.w = w; s.h = h;
  const palBytes = Math.min(imgOff, maskOff) - 44;
  s.pal = null;
  if (palBytes > 0) {
    const n = palBytes >> 2;
    s.pal = new Uint32Array(n);
    for (let k = 0; k < n; k++) s.pal[k] = u32(44 + k * 4);
  }
  const rowBytes = wWords * 4;
  const px = bpp <= 8 ? new Uint8Array(w * h) : new Uint32Array(w * h);
  const pm = bpp >= 32 ? 0xFFFFFFFF : (1 << bpp) - 1;
  for (let y = 0; y < h; y++) {
    const row = imgOff + y * rowBytes;
    for (let x = 0; x < w; x++) {
      const b = lbit + x * bpp;
      let v;
      if (bpp <= 8) v = (raw[row + (b >> 3)] >> (b & 7)) & pm;
      else if (bpp === 16) { const o = row + (b >> 3); v = raw[o] | (raw[o + 1] << 8); }
      else { const o = row + (b >> 3); v = (raw[o] | (raw[o + 1] << 8) | (raw[o + 2] << 16) | (raw[o + 3] << 24)) >>> 0; }
      px[y * w + x] = v;
    }
  }
  s.px = px;
  s.mask = null;
  if (maskOff !== imgOff) {
    const mask = new Uint8Array(w * h);
    const mBpp = mi.newFormat ? 1 : bpp;
    const mRow = mi.newFormat ? Math.ceil(w / 32) * 4 : rowBytes;
    const mL = mi.newFormat ? 0 : lbit;
    for (let y = 0; y < h; y++) {
      const row = maskOff + y * mRow;
      for (let x = 0; x < w; x++) {
        const b = mL + x * mBpp;
        const o = row + (b >> 3);
        let v;
        if (mBpp <= 8) v = (raw[o] >> (b & 7)) & ((1 << mBpp) - 1);
        else v = raw[o] | raw[o + 1];
        mask[y * w + x] = v ? 1 : 0;
      }
    }
    s.mask = mask;
  }
  return s;
}

/** Mark a sprite as modified (its raw bytes are regenerated on save). */
export function touch(s) { if (s.raw) s.orig = s.raw; s.raw = null; }

/** Encode one sprite (or return its original bytes if untouched). When the geometry is unchanged
 *  the original bytes are used as the base, so wastage bits etc. survive like on RISC OS. */
export function encodeSprite(s) {
  if (s.raw) return s.raw;
  const { w, h, bpp } = s;
  const palBytes = s.pal ? s.pal.length * 4 : 0;
  let out, lbit, rowBytes, imgOff, maskOff, maskRow = 0;
  const o = s.orig;
  const odv = o ? new DataView(o.buffer, o.byteOffset, o.byteLength) : null;
  const same = o && odv.getUint32(40, true) === (s.mode >>> 0) && odv.getUint32(20, true) + 1 === h &&
    odv.getUint32(24, true) === (s.lbit | 0) && Math.min(odv.getUint32(32, true), odv.getUint32(36, true)) - 44 === palBytes &&
    (odv.getUint32(32, true) !== odv.getUint32(36, true)) === !!s.mask &&
    Math.floor(((odv.getUint32(16, true) + 1) * 32 - odv.getUint32(24, true) - (31 - odv.getUint32(28, true))) / bpp) === w;
  if (same) {
    out = o.slice();
    lbit = s.lbit | 0;
    rowBytes = (odv.getUint32(16, true) + 1) * 4;
    imgOff = odv.getUint32(32, true); maskOff = odv.getUint32(36, true);
    if (s.mask) maskRow = s.newFormat ? Math.ceil(w / 32) * 4 : rowBytes;
  } else {
    lbit = s.newFormat ? 0 : (s.lbit | 0);
    const bits = lbit + w * bpp;
    const wWords = Math.ceil(bits / 32);
    rowBytes = wWords * 4;
    imgOff = 44 + palBytes;
    const imgSize = rowBytes * h;
    if (s.mask) maskRow = s.newFormat ? Math.ceil(w / 32) * 4 : rowBytes;
    maskOff = s.mask ? imgOff + imgSize : imgOff;
    const size = imgOff + imgSize + maskRow * h;
    out = new Uint8Array(size);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, size, true);
    dv.setUint32(16, wWords - 1, true);
    dv.setUint32(20, h - 1, true);
    dv.setUint32(24, lbit, true);
    dv.setUint32(28, (bits - 1) & 31, true);
    dv.setUint32(32, imgOff, true);
    dv.setUint32(36, maskOff, true);
    dv.setUint32(40, s.mode >>> 0, true);
  }
  const dv = new DataView(out.buffer);
  out.fill(0, 4, 16);
  const nm = s.name.toLowerCase().slice(0, 12);
  for (let j = 0; j < nm.length; j++) out[4 + j] = nm.charCodeAt(j) & 255;
  if (s.pal) for (let k = 0; k < s.pal.length; k++) dv.setUint32(44 + k * 4, s.pal[k] >>> 0, true);
  const px = s.px;
  const pm = bpp >= 8 ? 255 : (1 << bpp) - 1;
  for (let y = 0; y < h; y++) {
    const row = imgOff + y * rowBytes;
    for (let x = 0; x < w; x++) {
      const b = lbit + x * bpp, v = px[y * w + x];
      const q = row + (b >> 3);
      if (bpp < 8) out[q] = (out[q] & ~(pm << (b & 7))) | ((v & pm) << (b & 7));
      else if (bpp === 8) out[q] = v;
      else if (bpp === 16) { out[q] = v & 255; out[q + 1] = (v >> 8) & 255; }
      else { out[q] = v & 255; out[q + 1] = (v >>> 8) & 255; out[q + 2] = (v >>> 16) & 255; out[q + 3] = (v >>> 24) & 255; }
    }
  }
  if (s.mask) {
    const mBpp = s.newFormat ? 1 : bpp, mL = s.newFormat ? 0 : lbit;
    const mm = mBpp >= 8 ? 255 : (1 << mBpp) - 1;
    for (let y = 0; y < h; y++) {
      const row = maskOff + y * maskRow;
      for (let x = 0; x < w; x++) {
        const on = s.mask[y * w + x];
        const b = mL + x * mBpp, q = row + (b >> 3);
        if (mBpp < 8) out[q] = (out[q] & ~(mm << (b & 7))) | (on ? mm << (b & 7) : 0);
        else out.fill(on ? 255 : 0, q, q + (mBpp >> 3));
      }
    }
  }
  return out;
}

/** Size in bytes a sprite occupies in the file. */
export const spriteSize = (s) => encodeSprite(s).length;

export function writeSpriteFile(f) {
  const parts = f.sprites.map(encodeSprite);
  const ext = f.ext ?? new Uint8Array(0);
  const total = 12 + ext.length + parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, parts.length, true);
  dv.setUint32(4, 16 + ext.length, true);
  dv.setUint32(8, total + 4, true);
  out.set(ext, 12);
  let o = 12 + ext.length;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Create a blank sprite (pixels 0, mask solid). */
export function newSprite({ name, w, h, mode, mask = false, pal = null }) {
  const mi = modeInfo(mode);
  const s = {
    name: name.toLowerCase().slice(0, 12), mode: mode >>> 0, bpp: mi.bpp, lb: mi.lb, xeig: mi.xeig, yeig: mi.yeig,
    newFormat: mi.newFormat, w, h, lbit: 0, pal, raw: null,
    px: mi.bpp <= 8 ? new Uint8Array(w * h) : new Uint32Array(w * h),
    mask: mask ? new Uint8Array(w * h).fill(1) : null,
  };
  return s;
}

/** Deep copy of a sprite (optionally renamed). */
export function cloneSprite(s, name = s.name) {
  return { ...s, name, raw: s.raw && name === s.name ? s.raw.slice() : null, orig: s.orig ?? s.raw, px: s.px.slice(), mask: s.mask ? s.mask.slice() : null, pal: s.pal ? s.pal.slice() : null };
}

export function isSpriteFile(buf) {
  if (!buf || buf.length < 12) return false;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const first = dv.getUint32(4, true);
  return first >= 16 && first - 4 <= buf.length;
}
