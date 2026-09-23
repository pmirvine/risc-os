// Whole-sprite editing operations (c.PSprite / c.Menus), host-agnostic.
//
// Sprites are the PSprite objects of spritefile.js: s.px (row 0 = top), s.mask (1 = solid) or
// null, s.pal (palette words, pairs) or null. Row numbers passed to these functions follow the
// RISC OS convention: row 0 is the BOTTOM row (OS_SpriteOp insert/delete row, read pixel).

import { touch } from './spritefile.js';
import { ENTRIES, log2bpp, stdPaletteWords } from './colours.js';

const newPx = (s, n) => (s.bpp <= 8 ? new Uint8Array(n) : new Uint32Array(n));

/** Mark the sprite changed (drops the original bytes on save; keeps them as an encoding base). */
export function changed(s) {
  touch(s);
  s._ver = (s._ver ?? 0) + 1;
}

/** Geometry change: remove left-hand wastage (sprwindow_remove_wastage) and mark changed. */
function regeom(s, w, h, px, mask) {
  s.w = w; s.h = h; s.px = px; s.mask = mask; s.lbit = 0;
  changed(s);
}

// ------------------------------------------------------------------ pixel access (y from bottom)
export const pix = (s, x, y) => s.px[(s.h - 1 - y) * s.w + x];
export const setPix = (s, x, y, v) => { s.px[(s.h - 1 - y) * s.w + x] = v; };
export const maskAt = (s, x, y) => (s.mask ? s.mask[(s.h - 1 - y) * s.w + x] : 1);
export const setMask = (s, x, y, v) => { if (s.mask) s.mask[(s.h - 1 - y) * s.w + x] = v ? 1 : 0; };
export const inside = (s, x, y) => x >= 0 && y >= 0 && x < s.w && y < s.h;

// ------------------------------------------------------------------ flips
/** "Flip vertically" (OS_SpriteOp 33, flip about the x axis). */
export function flipV(s) {
  const { w, h } = s;
  const flip = (a) => { const t = a.slice(); for (let y = 0; y < h; y++) a.set(t.subarray((h - 1 - y) * w, (h - y) * w), y * w); };
  flip(s.px); if (s.mask) flip(s.mask);
  changed(s);
}
/** "Flip horizontally" (OS_SpriteOp 47, flip about the y axis). */
export function flipH(s) {
  const { w, h } = s;
  const flip = (a) => { for (let y = 0; y < h; y++) a.subarray(y * w, (y + 1) * w).reverse(); };
  flip(s.px); if (s.mask) flip(s.mask);
  if (s.lbit) s.lbit = 0;
  changed(s);
}

// ------------------------------------------------------------------ insert / delete rows & columns
/**
 * sprite_change_size: insert (n > 0) or delete (n < 0) rows (rows = true) or columns at `at`
 * (rows counted from the bottom, columns from the left). New pixels are 0 and transparent.
 */
export function changeSize(s, rows, at, n) {
  const { w, h } = s;
  if (!n) return;
  if (rows) {
    at = Math.max(0, Math.min(h, at));
    if (n < 0) n = -Math.min(-n, h - at);
    const nh = h + n;
    if (nh < 1) return;
    const map = (a, fresh) => {
      const out = fresh(nh * w);
      // bottom-up row r of the new sprite: r < at -> old r; at <= r < at+n -> new (insert);
      for (let r = 0; r < nh; r++) {
        let src;
        if (n > 0) src = r < at ? r : r < at + n ? -1 : r - n;
        else src = r < at ? r : r - n;
        if (src >= 0) out.set(a.subarray((h - 1 - src) * w, (h - src) * w), (nh - 1 - r) * w);
      }
      return out;
    };
    regeom(s, w, nh, map(s.px, (k) => newPx(s, k)), s.mask ? map(s.mask, (k) => new Uint8Array(k)) : null);
  } else {
    at = Math.max(0, Math.min(w, at));
    if (n < 0) n = -Math.min(-n, w - at);
    const nw = w + n;
    if (nw < 1) return;
    const map = (a, fresh) => {
      const out = fresh(nw * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < nw; x++) {
          let src;
          if (n > 0) src = x < at ? x : x < at + n ? -1 : x - n;
          else src = x < at ? x : x - n;
          if (src >= 0) out[y * nw + x] = a[y * w + src];
        }
      }
      return out;
    };
    regeom(s, nw, h, map(s.px, (k) => newPx(s, k)), s.mask ? map(s.mask, (k) => new Uint8Array(k)) : null);
  }
}

/** "Adjust size": change to columns x rows, adding/removing at the top and right (c.Menus). */
export function adjustSize(s, columns, rows) {
  const hBy = rows - s.h, wBy = columns - s.w;
  const doRows = () => { if (hBy) changeSize(s, true, hBy > 0 ? s.h : rows, hBy); };
  const doCols = () => { if (wBy) changeSize(s, false, wBy > 0 ? s.w : columns, wBy); };
  if (hBy < wBy) { doRows(); doCols(); } else { doCols(); doRows(); }
}

// ------------------------------------------------------------------ transformations
/**
 * Plot the old sprite through matrix m (OS units, [a, b, c, d, e, f]: x' = a x + c y + e,
 * y' = b x + d y + f) into a new nw x nh sprite, like sprite_put_trans after clearing the output
 * to colour 0 (and the mask to transparent). Each destination pixel centre is mapped back.
 */
function transform(s, m, nw, nh) {
  const dx = 1 << s.xeig, dy = 1 << s.yeig;
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  const px = newPx(s, nw * nh), mask = s.mask ? new Uint8Array(nw * nh) : null;
  if (det) {
    for (let J = 0; J < nh; J++) {
      const Y = (J + 0.5) * dy - f;
      for (let I = 0; I < nw; I++) {
        const X = (I + 0.5) * dx - e;
        const x = (d * X - c * Y) / det, y = (-b * X + a * Y) / det;
        const i = Math.floor(x / dx), j = Math.floor(y / dy);
        if (i < 0 || j < 0 || i >= s.w || j >= s.h) continue;
        const so = (s.h - 1 - j) * s.w + i, dO = (nh - 1 - J) * nw + I;
        px[dO] = s.px[so];
        if (mask) mask[dO] = s.mask[so];
      }
    }
  }
  regeom(s, nw, nh, px, mask);
}

/** psprite_rotate: rotate anticlockwise by `degrees`. Returns an error token or null. */
export function rotate(s, degrees) {
  degrees %= 360;
  if (!degrees) return null;
  const rads = degrees / 360 * 2 * Math.PI;
  const c = Math.cos(rads), sn = Math.sin(rads);
  const dx = 1 << s.xeig, dy = 1 << s.yeig;
  const W = s.w * dx, H = s.h * dy;
  let xmax = 0, ymax = 0, xmin = 0, ymin = 0;
  for (const [x, y] of [[W * c, W * sn], [-(H * sn), H * c], [W * c - H * sn, W * sn + H * c]]) {
    xmax = Math.max(xmax, x); xmin = Math.min(xmin, x); ymax = Math.max(ymax, y); ymin = Math.min(ymin, y);
  }
  const nw = Math.trunc((xmax - xmin) / dx + 0.5), nh = Math.trunc((ymax - ymin) / dy + 0.5);
  if (nw === 0 || nh === 0) return 'PntEA';
  // integer transformation matrix, as passed to OS_SpriteOp 56
  const ci = Math.trunc(c * 0x10000) / 0x10000, si = Math.trunc(sn * 0x10000) / 0x10000;
  transform(s, [ci, si, -si, ci, -Math.trunc(0x100 * xmin) / 0x100, -Math.trunc(0x100 * ymin) / 0x100], nw, nh);
  return null;
}

/** psprite_scale */
export function scale(s, fx, fy) {
  const dx = 1 << s.xeig, dy = 1 << s.yeig;
  const nw = Math.trunc(s.w * dx * fx / dx + 0.5), nh = Math.trunc(s.h * dy * fy / dy + 0.5);
  if (nw === 0 || nh === 0) return 'PntEA';
  transform(s, [Math.trunc(fx * 0x10000) / 0x10000, 0, 0, Math.trunc(fy * 0x10000) / 0x10000, 0, 0], nw, nh);
  return null;
}

/** psprite_shear: x' = x + factor * y */
export function shear(s, factor) {
  const dx = 1 << s.xeig, dy = 1 << s.yeig;
  const W = s.w * dx, H = s.h * dy;
  const nwf = Math.ceil((W + Math.abs(H * factor)) / dx);
  if (!(nwf < 0x7FFFFFFF) || nwf * s.h > 64e6) return 'PntEM';
  const nw = nwf, nh = Math.ceil(H / dy);
  const shift = Math.trunc((factor * dy / dx) * s.h);
  const e = ((shift < 0 ? -shift : 0) << s.xeig) * 0x100 / 0x100;
  transform(s, [1, 0, Math.trunc(factor * 0x10000) / 0x10000, 1, e, 0], nw, nh);
  return null;
}

// ------------------------------------------------------------------ mask & palette
/** Create (all solid) or remove the mask. */
export function setHasMask(s, on) {
  s.mask = on ? new Uint8Array(s.w * s.h).fill(1) : null;
  changed(s);
}

/** Replace the palette with `words` (one word per entry; stored as flash pairs) or remove it. */
export function setPalette(s, words) {
  if (!words) s.pal = null;
  else {
    s.pal = new Uint32Array(words.length * 2);
    words.forEach((w, i) => { s.pal[2 * i] = s.pal[2 * i + 1] = w >>> 0; });
  }
  s._palVer = (s._palVer ?? 0) + 1;
  changed(s);
}

/** "Palette" toggle in the Edit menu: add the standard palette (ENTRIES) or remove it. */
export function togglePalette(s, desktop) {
  if (s.pal && s.pal.length) { setPalette(s, null); return; }
  const lb = log2bpp(s.bpp);
  if (lb > 3) return;
  const std = stdPaletteWords(lb, desktop);
  setPalette(s, Array.from({ length: ENTRIES(lb) }, (_, i) => std[i]));
}

/** Set one palette entry (both flash colours). */
export function setPaletteEntry(s, i, word) {
  if (!s.pal || 2 * i + 1 >= s.pal.length) return;
  s.pal[2 * i] = s.pal[2 * i + 1] = word >>> 0;
  s._palVer = (s._palVer ?? 0) + 1;
  changed(s);
}

// ------------------------------------------------------------------ snapshots (undo)
/** Copy of the editable state of a sprite. */
export function snapshot(s) {
  return { name: s.name, mode: s.mode, bpp: s.bpp, lb: s.lb, xeig: s.xeig, yeig: s.yeig, newFormat: s.newFormat, w: s.w, h: s.h, lbit: s.lbit,
    px: s.px.slice(), mask: s.mask ? s.mask.slice() : null, pal: s.pal ? s.pal.slice() : null, raw: s.raw, orig: s.orig };
}
/** Restore a snapshot into a sprite object (keeping its identity and app state). */
export function restore(s, snap) {
  Object.assign(s, snap, { px: snap.px.slice(), mask: snap.mask ? snap.mask.slice() : null, pal: snap.pal ? snap.pal.slice() : null });
  s._ver = (s._ver ?? 0) + 1;
  s._palVer = (s._palVer ?? 0) + 1;
}
