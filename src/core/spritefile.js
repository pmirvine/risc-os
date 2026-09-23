// RISC OS sprite file decoder (host-agnostic: works in node and browsers).
//
// decodeSpriteFile(bytes, {area:false}) -> [Sprite]
//   Sprite = { name, width, height, xeig, yeig, bpp, hasMask, hasPalette,
//              rgba: Uint8ClampedArray(width*height*4), osWidth, osHeight }
// The bytes are a sprite *file* (area without its first size word) unless opts.area.

import { decodeLatin1 } from './charset.js';

const W16 = [0xFFFFFF, 0xDDDDDD, 0xBBBBBB, 0x999999, 0x777777, 0x555555, 0x333333, 0x000000,
  0x004499, 0xEEEE00, 0x00CC00, 0xDD0000, 0xEEEEBB, 0x558800, 0xFFBB00, 0x00BBFF];
export const WIMP_RGB = W16.map((c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255]);
export const VIDC256 = Array.from({ length: 256 }, (_, n) => {
  const t = (n & 3) * 0x11;
  let r = t, g = t, b = t;
  if (n & 0x04) r += 0x44;
  if (n & 0x08) b += 0x44;
  if (n & 0x10) r += 0x88;
  if (n & 0x20) g += 0x44;
  if (n & 0x40) g += 0x88;
  if (n & 0x80) b += 0x88;
  return [r, g, b];
});
const DEFAULT_PAL = {
  1: [WIMP_RGB[0], WIMP_RGB[7]],
  2: [WIMP_RGB[0], WIMP_RGB[2], WIMP_RGB[4], WIMP_RGB[7]],
  4: WIMP_RGB,
  8: VIDC256,
};

// old screen mode -> [log2bpp, xeig, yeig]
const MODES = {
  0: [0, 1, 2], 1: [1, 2, 2], 2: [2, 3, 2], 3: [1, 1, 2], 4: [0, 2, 2], 5: [1, 3, 2], 6: [1, 2, 2], 7: [2, 2, 2],
  8: [1, 1, 2], 9: [2, 2, 2], 10: [3, 3, 2], 11: [1, 1, 2], 12: [2, 1, 2], 13: [3, 2, 2], 14: [2, 1, 2],
  15: [3, 1, 2], 16: [2, 1, 2], 17: [2, 1, 2], 18: [0, 1, 1], 19: [1, 1, 1], 20: [2, 1, 1], 21: [3, 1, 1],
  22: [2, 0, 1], 23: [0, 1, 1], 24: [3, 1, 2], 25: [0, 1, 1], 26: [1, 1, 1], 27: [2, 1, 1], 28: [3, 1, 1],
  29: [0, 1, 1], 30: [1, 1, 1], 31: [2, 1, 1], 32: [3, 1, 1], 33: [0, 1, 2], 34: [1, 1, 2], 35: [2, 1, 2],
  36: [3, 1, 2], 37: [0, 1, 1], 38: [1, 1, 1], 39: [2, 1, 1], 40: [3, 1, 1], 41: [0, 1, 2], 42: [1, 1, 2],
  43: [2, 1, 2], 44: [0, 1, 2], 45: [1, 1, 2], 46: [2, 1, 2], 47: [3, 2, 2], 48: [2, 2, 1], 49: [3, 2, 1],
};
const dpiToEig = (d) => (d >= 180 ? 0 : d >= 90 ? 1 : d >= 45 ? 2 : 3);

export function modeInfo(mode) {
  if (mode < 256) {
    const m = MODES[mode] ?? [2, 1, 1];
    return { bpp: 1 << m[0], xeig: m[1], yeig: m[2], newFormat: false };
  }
  if (mode & 1) {
    const type = mode >>> 27;
    const bpp = [0, 1, 2, 4, 8, 16, 32, 32][type] || 8;
    return { bpp, xeig: dpiToEig((mode >>> 1) & 0x1FFF), yeig: dpiToEig((mode >>> 14) & 0x1FFF), newFormat: true };
  }
  // pointer to a mode selector block -> assume 8bpp square
  return { bpp: 8, xeig: 1, yeig: 1, newFormat: false };
}

function decodeOne(bytes, v, off) {
  const name = decodeLatin1(bytes, off + 4, off + 16).replace(/\0.*$/s, '').replace(/[\x00-\x1f].*$/s, '');
  const wWords = v.getUint32(off + 16, true) + 1;
  const h = v.getUint32(off + 20, true) + 1;
  const fb = v.getUint32(off + 24, true);
  const lb = v.getUint32(off + 28, true);
  const imgOff = v.getUint32(off + 32, true);
  const maskOff = v.getUint32(off + 36, true);
  const mode = v.getUint32(off + 40, true);
  const mi = modeInfo(mode);
  const bpp = mi.bpp;
  const width = Math.max(1, Math.floor((wWords * 32 - fb - (31 - lb)) / bpp));
  const hasMask = maskOff !== imgOff;
  let pal = null;
  if (imgOff > 44 && bpp <= 8) {
    const n = (Math.min(imgOff, hasMask ? Math.min(maskOff, imgOff) : imgOff) - 44) >> 3;
    pal = [];
    for (let i = 0; i < n; i++) {
      const w = v.getUint32(off + 44 + i * 8, true);
      pal.push([(w >>> 8) & 255, (w >>> 16) & 255, (w >>> 24) & 255]);
    }
    if (bpp === 8 && pal.length === 16) {
      // 16-entry palette in 8bpp: VIDC1-style tint scheme; approximate with default
      const p = VIDC256.map((c) => c.slice());
      for (let i = 0; i < 256; i++) {
        const base = pal[i & 15];
        const tint = (i >> 4) & 0; // palette-based tint not modelled
        p[i] = [base[0] | tint, base[1], base[2]];
      }
      pal = p;
    }
  }
  const palette = pal && pal.length >= (1 << Math.min(bpp, 8)) ? pal : (pal && bpp <= 8 ? [...pal, ...DEFAULT_PAL[bpp].slice(pal.length)] : DEFAULT_PAL[bpp]);
  const rgba = new Uint8ClampedArray(width * h * 4);
  const rowBytes = wWords * 4;
  const img = off + imgOff;
  // mask geometry
  let mBpp = bpp, mRowBytes = rowBytes, mFb = fb;
  if (hasMask && mi.newFormat) {
    mBpp = 1; mFb = 0;
    mRowBytes = Math.ceil(width / 32) * 4;
  }
  const msk = off + maskOff;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < width; x++) {
      const bit = fb + x * bpp;
      const byte = img + y * rowBytes + (bit >> 3);
      let r = 0, g = 0, b = 0;
      if (byte + (bpp >> 3) > bytes.length) continue;
      if (bpp <= 8) {
        const val = (bytes[byte] >> (bit & 7)) & ((1 << bpp) - 1);
        const c = palette[val] || [0, 0, 0];
        r = c[0]; g = c[1]; b = c[2];
      } else if (bpp === 16) {
        const val = bytes[byte] | (bytes[byte + 1] << 8);
        r = ((val & 31) * 255 / 31) | 0; g = (((val >> 5) & 31) * 255 / 31) | 0; b = (((val >> 10) & 31) * 255 / 31) | 0;
      } else {
        r = bytes[byte]; g = bytes[byte + 1]; b = bytes[byte + 2];
      }
      let a = 255;
      if (hasMask) {
        const mbit = mFb + x * mBpp;
        const mbyte = msk + y * mRowBytes + (mbit >> 3);
        const mv = (bytes[mbyte] >> (mbit & 7)) & ((1 << mBpp) - 1);
        if (mv === 0) a = 0;
      }
      const o = (y * width + x) * 4;
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a;
    }
  }
  return {
    name, width, height: h, bpp, xeig: mi.xeig, yeig: mi.yeig, mode, hasMask, hasPalette: !!pal, rgba,
    osWidth: width << mi.xeig, osHeight: h << mi.yeig,
  };
}

/** Decode a sprite file (or sprite area if opts.area) into an array of sprites. */
export function decodeSpriteFile(input, opts = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const base = opts.area ? 4 : 0; // sprite area has leading size word
  if (bytes.length < base + 12) return [];
  const n = v.getUint32(base, true);
  let off = base + v.getUint32(base + 4, true) - 4;
  const out = [];
  for (let i = 0; i < n && off + 44 <= bytes.length; i++) {
    const next = v.getUint32(off, true);
    try { out.push(decodeOne(bytes, v, off)); } catch (e) { /* skip bad sprite */ }
    if (next <= 0) break;
    off += next;
  }
  return out;
}

/** True if the bytes look like a sprite file. */
export function isSpriteFile(bytes) {
  if (!bytes || bytes.length < 16) return false;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = v.getUint32(0, true), first = v.getUint32(4, true), free = v.getUint32(8, true);
  return n < 10000 && first === 16 && free <= bytes.length + 4 + 16;
}
