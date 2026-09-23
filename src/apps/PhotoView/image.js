// PhotoView image engine: decode a JPEG, build the displayed bitmap for the "Opening an Image Pac"
// parameters (resolution, orientation, palette, dither) and encode it as a RISC OS sprite file.
//
// Mapping of the PhotoCD parameters onto a JPEG (see docs/apps/PhotoView.md):
//  * resolution 1..5 (Base/16, Base/4, Base, 4Base, 16Base) = linear scale 1/4, 1/2, 1, 2, 4 of the
//    JPEG's own size (the seed disc's Corel pictures are 768 x 512, exactly a PhotoCD "Base" image);
//  * orientation 0..7 = PCDsetTransform: (n % 4) * 90 degrees anticlockwise, n >= 4 mirrored first;
//  * palette 1 = default (the desktop's full colour), 2..6 = the c.palettes grey ramps (white first),
//    with optional Floyd-Steinberg error diffusion (the PhotoCD library's "dither" flag).

import { encodeSprite } from '../ChangeFSI/fsi.js';

export const RES_SCALE = [1 / 8, 1 / 4, 1 / 2, 1, 2, 4];     // index = resolution (0 = Base/64)

// palette number -> {levels, bpp, mode} (mode numbers are the 90 x 90 dpi modes of that depth)
const GREY_PALETTES = { 2: { n: 2, bpp: 1, mode: 25 }, 3: { n: 4, bpp: 2, mode: 26 }, 4: { n: 8, bpp: 4, mode: 27 }, 5: { n: 16, bpp: 4, mode: 27 }, 6: { n: 256, bpp: 8, mode: 28 } };
const MODE_32BPP_90DPI = ((6 << 27) | (90 << 14) | (90 << 1) | 1) >>> 0;

/** Decode JPEG bytes into an ImageBitmap (throws on bad data). */
export async function decodeJPEG(bytes, opts) {
  const blob = new Blob([bytes], { type: 'image/jpeg' });
  return opts ? createImageBitmap(blob, opts) : createImageBitmap(blob);
}

/** Thumbnail (fits in maxW x maxH desktop pixels) as a canvas. */
export async function thumbnail(bytes, maxW, maxH) {
  const full = await decodeJPEG(bytes);
  const s = Math.min(maxW / full.width, maxH / full.height, 1);
  const w = Math.max(1, Math.round(full.width * s)), h = Math.max(1, Math.round(full.height * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(full, 0, 0, w, h);
  const info = { w: full.width, h: full.height };
  full.close?.();
  return { canvas: c, ...info };
}

/**
 * Build the image as PhotoView would generate its sprite.
 * src: ImageBitmap / canvas; p: {resolution, orientation, palette, dither}.
 * Returns {canvas, w, h, indices?, greys?} (indices = palette indices for grey palettes).
 */
export function render(src, p) {
  const scale = RES_SCALE[p.resolution] ?? 1;
  const w0 = Math.max(1, Math.round(src.width * scale)), h0 = Math.max(1, Math.round(src.height * scale));
  const rot = p.orientation % 4, mirror = p.orientation >= 4;
  const w = rot % 2 ? h0 : w0, h = rot % 2 ? w0 : h0;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: p.palette > 1 });
  g.imageSmoothingQuality = 'high';
  g.translate(w / 2, h / 2);
  g.rotate(-rot * Math.PI / 2);          // anticlockwise on screen
  if (mirror) g.scale(-1, 1);            // mirror first, then rotate
  g.drawImage(src, -w0 / 2, -h0 / 2, w0, h0);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const out = { canvas: c, w, h };
  const gp = GREY_PALETTES[p.palette];
  if (gp) Object.assign(out, quantiseGreys(g, w, h, gp.n, p.dither), { pal: gp });
  return out;
}

// Grey palettes as in c.palettes: entry 0 = white ... last = black.
export function greyRamp(n) { return Array.from({ length: n }, (_, i) => { const v = Math.round(255 - i * 255 / (n - 1)); return [v, v, v]; }); }

function quantiseGreys(g, w, h, n, dither) {
  const id = g.getImageData(0, 0, w, h), d = id.data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  const idx = new Uint8Array(w * h);
  const step = 255 / (n - 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = Math.max(0, Math.min(255, lum[i]));
      const q = Math.round(v / step);            // 0 = black .. n-1 = white
      idx[i] = n - 1 - q;
      const e = v - q * step;
      const val = Math.round(q * step);
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = val;
      if (dither && e) {
        if (x + 1 < w) lum[i + 1] += e * 7 / 16;
        if (y + 1 < h) {
          if (x > 0) lum[i + w - 1] += e * 3 / 16;
          lum[i + w] += e * 5 / 16;
          if (x + 1 < w) lum[i + w + 1] += e / 16;
        }
      }
    }
  }
  g.putImageData(id, 0, 0);
  return { indices: idx };
}

/** Encode the rendered image as a one-sprite RISC OS sprite file (type &FF9). */
export function spriteFile(img, name) {
  const nm = (name || 'photo').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 12);
  if (img.pal) {
    const palette = greyRamp(img.pal.n);
    const full = 1 << img.pal.bpp;
    while (palette.length < full) palette.push([0, 0, 0]);
    return encodeSprite({ name: nm, w: img.w, h: img.h, spec: { bpp: img.pal.bpp, mode: img.pal.mode }, indices: img.indices, palette });
  }
  const d = img.canvas.getContext('2d').getImageData(0, 0, img.w, img.h).data;
  const direct = new Uint8Array(img.w * img.h * 3);
  for (let i = 0, o = 0; i < d.length; i += 4, o += 3) { direct[o] = d[i]; direct[o + 1] = d[i + 1]; direct[o + 2] = d[i + 2]; }
  return encodeSprite({ name: nm, w: img.w, h: img.h, spec: { bpp: 32, mode: MODE_32BPP_90DPI }, direct });
}
