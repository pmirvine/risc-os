// RISC OS sprite file parser (sprite area as stored on disc, i.e. without the leading size word).
import { WIMP_DEFAULT } from './palette.mjs';

// Old screen modes: [bpp log2, xeig, yeig]
export const MODES = {
  0: [0, 1, 2], 1: [1, 2, 2], 2: [2, 3, 2], 3: [0, 1, 2], 4: [0, 2, 2], 5: [1, 3, 2], 6: [0, 2, 2], 7: [2, 2, 2],
  8: [1, 1, 2], 9: [2, 2, 2], 10: [3, 3, 2], 11: [1, 1, 2], 12: [2, 1, 2], 13: [3, 2, 2], 14: [2, 1, 2], 15: [3, 1, 2],
  16: [2, 1, 2], 17: [2, 1, 2], 18: [0, 1, 1], 19: [1, 1, 1], 20: [2, 1, 1], 21: [3, 1, 1], 22: [2, 0, 1], 23: [0, 1, 1],
  24: [3, 1, 2], 25: [0, 1, 1], 26: [1, 1, 1], 27: [2, 1, 1], 28: [3, 1, 1], 29: [0, 1, 1], 30: [1, 1, 1], 31: [2, 1, 1],
  32: [3, 1, 1], 33: [0, 1, 2], 34: [1, 1, 2], 35: [2, 1, 2], 36: [3, 1, 2], 37: [0, 1, 2], 38: [1, 1, 2], 39: [2, 1, 2],
  40: [3, 1, 2], 41: [0, 1, 2], 42: [1, 1, 2], 43: [2, 1, 2], 44: [0, 1, 2], 45: [1, 1, 2], 46: [2, 1, 2], 47: [3, 2, 1],
  48: [2, 2, 1], 49: [3, 2, 1],
};
const TYPE_BPP = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16, 6: 32 };
const dpi2eig = (d) => (d >= 180 ? 0 : d >= 90 ? 1 : d >= 45 ? 2 : 3);

export function decodeMode(mode) {
  if (mode < 256) {
    const m = MODES[mode & 127] || MODES[12];
    return { bpp: 1 << m[0], xeig: m[1], yeig: m[2], newFormat: false, known: !!MODES[mode & 127] };
  }
  const type = mode >>> 27;
  const xdpi = (mode >>> 1) & 0x1fff, ydpi = (mode >>> 14) & 0x1fff;
  return { bpp: TYPE_BPP[type] || 0, type, xdpi, ydpi, xeig: dpi2eig(xdpi), yeig: dpi2eig(ydpi), newFormat: true, known: !!TYPE_BPP[type] };
}

/** Parse a sprite file. Returns [{name, w, h, bpp, xeig, yeig, hasMask, hasPalette, mode, rgba}]. */
export function parseSpriteFile(buf, { palettes = WIMP_DEFAULT } = {}) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const u32 = (o) => dv.getUint32(o, true);
  const count = u32(0);
  let off = u32(4) - 4;
  const out = [];
  for (let i = 0; i < count && off + 44 <= buf.length; i++) {
    const next = u32(off);
    if (next < 44) break;
    let name = '';
    for (let j = 0; j < 12; j++) { const c = buf[off + 4 + j]; if (c < 32 || c === 32) break; name += String.fromCharCode(c); }
    const wWords = u32(off + 16) + 1, hRows = u32(off + 20) + 1;
    const lbit = u32(off + 24), rbit = u32(off + 28);
    const imgOff = u32(off + 32), maskOff = u32(off + 36), mode = u32(off + 40);
    const m = decodeMode(mode);
    const bpp = m.bpp;
    if (!bpp) { out.push({ name, error: `unsupported mode word 0x${mode.toString(16)}` }); off += next; continue; }
    const rowBits = wWords * 32 - lbit - (31 - rbit);
    const w = Math.max(0, Math.floor(rowBits / bpp)), h = hRows;
    const rowBytes = wWords * 4;
    // palette
    let pal = palettes[bpp];
    const palEntries = (Math.min(imgOff, maskOff) - 44) / 8;
    const hasPalette = palEntries > 0 && bpp <= 8;
    if (hasPalette) {
      const p = [];
      for (let k = 0; k < palEntries; k++) { const v = u32(off + 44 + k * 8); p.push([(v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]); }
      if (bpp === 8 && p.length < 256) {
        // VIDC1-style 16-entry palette for 256 colours: low 4 bits from palette, top bits fixed.
        pal = Array.from({ length: 256 }, (_, n) => {
          const [r, g, b] = p[n & 15] || [0, 0, 0];
          return [(r & 0x7f) | (n & 0x10 ? 0x80 : 0), (g & 0x3f) | (n & 0x20 ? 0x40 : 0) | (n & 0x40 ? 0x80 : 0), (b & 0x7f) | (n & 0x80 ? 0x80 : 0)];
        });
      } else pal = p;
    }
    // Pointer shapes: colour 0 is transparent; default pointer palette from the Wimp (!Palette entries 17-19).
    const isPointer = /^ptr_/i.test(name) && bpp === 2;
    if (isPointer && !hasPalette) pal = [[0, 0, 0], [0, 255, 255], [0, 0, 0x99], [255, 0, 0]];
    const hasMask = maskOff !== imgOff;
    const img = off + imgOff, msk = off + maskOff;
    const maskBpp = hasMask ? (m.newFormat ? 1 : bpp) : 0;
    const maskRowBytes = hasMask ? (m.newFormat ? Math.ceil(w / 32) * 4 : rowBytes) : 0;
    const maskLbit = m.newFormat ? 0 : lbit;
    const rgba = new Uint8Array(w * h * 4);
    const bits = (base, bitpos, n) => {
      const byte = buf[base + (bitpos >> 3)] | 0;
      return (byte >> (bitpos & 7)) & ((1 << n) - 1);
    };
    for (let y = 0; y < h; y++) {
      const row = img + y * rowBytes;
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        let r, g, b;
        if (bpp <= 8) {
          const v = bits(row, lbit + x * bpp, bpp);
          const c = pal[v] || [0, 0, 0];
          [r, g, b] = c;
        } else if (bpp === 16) {
          const p0 = row + ((lbit >> 3) + x * 2);
          const v = buf[p0] | (buf[p0 + 1] << 8);
          const e = (q) => (q << 3) | (q >> 2);
          r = e(v & 31); g = e((v >> 5) & 31); b = e((v >> 10) & 31);
        } else {
          const p0 = row + x * 4;
          r = buf[p0]; g = buf[p0 + 1]; b = buf[p0 + 2];
        }
        let a = 255;
        if (isPointer && bits(row, lbit + x * bpp, bpp) === 0) a = 0;
        if (hasMask) {
          const mrow = msk + y * maskRowBytes;
          if (maskBpp <= 8) a = bits(mrow, maskLbit + x * maskBpp, maskBpp) ? 255 : 0;
          else a = 255;
        }
        rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a;
      }
    }
    out.push({ name, w, h, bpp, xeig: m.xeig, yeig: m.yeig, hasMask, hasPalette, mode, newFormat: m.newFormat, rgba });
    off += next;
  }
  return out;
}
