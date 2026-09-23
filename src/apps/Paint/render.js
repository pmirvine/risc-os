// Sprite -> canvas rendering for Paint (browser only).
//
// Each sprite gets a cached canvas at its native pixel size (mask -> alpha 0), rebuilt when its
// data/palette version changes; painting tools update rectangles of it in place.

import { spritePalette, deepRGB } from './colours.js';

const LE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
const pack = ([r, g, b]) => (LE ? ((255 << 24) | (b << 16) | (g << 8) | r) : ((r << 24) | (g << 16) | (b << 8) | 255)) >>> 0;

function lutFor(s, desktop) {
  if (s.bpp > 8) return null;
  return Uint32Array.from(spritePalette(s, desktop).map(pack));
}

/** Get the sprite's canvas (native resolution), creating / refreshing it as necessary. */
export function spriteCanvas(s, desktop = true) {
  const ver = s._ver ?? 0, pv = s._palVer ?? 0;
  if (s._cv && s._cv.width === s.w && s._cv.height === s.h && s._cvVer === ver && s._cvPal === pv && s._cvDesk === desktop && s._cvBpp === s.bpp) return s._cv;
  if (!s._cv || s._cv.width !== s.w || s._cv.height !== s.h) {
    s._cv = document.createElement('canvas');
    s._cv.width = Math.max(1, s.w); s._cv.height = Math.max(1, s.h);
  }
  s._lut = lutFor(s, desktop);
  s._cvDesk = desktop; s._cvPal = pv; s._cvBpp = s.bpp;
  paintRect(s, 0, 0, s.w, s.h);
  s._cvVer = ver;
  return s._cv;
}

/** Re-render pixels [x0,x1) x [y0,y1) (top-down rows) into the cached canvas. */
export function paintRect(s, x0, y0, x1, y1) {
  const cv = s._cv;
  if (!cv) return;
  x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
  x1 = Math.min(s.w, Math.ceil(x1)); y1 = Math.min(s.h, Math.ceil(y1));
  if (x1 <= x0 || y1 <= y0) return;
  const w = x1 - x0, h = y1 - y0;
  const ctx = cv.getContext('2d');
  const id = ctx.createImageData(w, h);
  const out = new Uint32Array(id.data.buffer);
  const lut = s._lut, px = s.px, mask = s.mask, sw = s.w;
  for (let y = 0; y < h; y++) {
    const row = (y0 + y) * sw + x0, o = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      if (mask && !mask[i]) { out[o + x] = 0; continue; }
      out[o + x] = lut ? lut[px[i]] : pack(deepRGB(s.bpp, px[i]));
    }
  }
  ctx.putImageData(id, x0, y0);
}

/**
 * After an edit of sprite pixels in the box (pixel coords, y from the bottom, exclusive upper
 * bounds), update the cached canvas without a full rebuild. box null = everything.
 */
export function spriteEdited(s, box) {
  const old = s._ver ?? 0;
  s._ver = old + 1;
  if (!box || !s._cv || s._cvVer !== old || s._cv.width !== s.w || s._cv.height !== s.h || s._cvPal !== (s._palVer ?? 0)) return;
  paintRect(s, box.x0, s.h - box.y1, box.x1, s.h - box.y0);
  s._cvVer = s._ver;
}

/** A 1x2 pattern of white/black rows: Paint's "transparent" stipple (the mask ECF). */
let stipple = null;
export function maskPattern(ctx) {
  if (!stipple) {
    stipple = document.createElement('canvas');
    stipple.width = 1; stipple.height = 2;
    const c = stipple.getContext('2d');
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 1, 1);
    c.fillStyle = '#000000'; c.fillRect(0, 1, 1, 1);
  }
  return ctx.createPattern(stipple, 'repeat');
}

/** Canvas for an 8x8 ECF pattern of colour numbers for sprite s. */
export function ecfCanvas(s, pat, desktop = true) {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 8;
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(8, 8);
  const out = new Uint32Array(id.data.buffer);
  const lut = lutFor(s, desktop);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = pat[(7 - y) * 8 + x];   // pat row 0 = bottom
    out[y * 8 + x] = lut ? lut[v] : pack(deepRGB(s.bpp, v));
  }
  ctx.putImageData(id, 0, 0);
  return c;
}
