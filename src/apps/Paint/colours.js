// Paint colour model (host-agnostic: no DOM).
//
// Paint's "colour number" for a sprite (main_sprite.gcol) is:
//   0 .. nc-1   a pixel value. (For 256-colour sprites without a full palette Paint keeps a
//               GCOL colour*4+tint number, but colours_gcol_ttab makes that the identity on
//               pixel values, so we simply use pixel values everywhere.)
//   nc          "transparent" (only offered when the sprite has a mask)
//   -1 .. -4    ECF pattern 1..4
// Deep sprites (32K / 16M colours) use the raw pixel value as the colour number.
//
// Palettes follow c.PSprite: psprite_std_palettes[desktop ? 0 : 1][log2bpp].

// The Wimp's 16 desktop colours (3.71 default palette, Wimp/s/!Palette)
const W16 = [0xFFFFFF, 0xDDDDDD, 0xBBBBBB, 0x999999, 0x777777, 0x555555, 0x333333, 0x000000,
  0x004499, 0xEEEE00, 0x00CC00, 0xDD0000, 0xEEEEBB, 0x558800, 0xFFBB00, 0x00BBFF];
export const WIMP_RGB = W16.map((c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255]);

/** Palette word (&BBGGRR00) <-> [r,g,b] */
export const palWord = ([r, g, b]) => ((b << 24) | (g << 16) | (r << 8)) >>> 0;
export const wordRGB = (w) => [(w >>> 8) & 255, (w >>> 16) & 255, (w >>> 24) & 255];

// Standard palettes as palette words (c.PSprite)
const wimpWords = WIMP_RGB.map(palWord);
const hardmode_defpal = [0x00000000, 0x10101000, 0x20202000, 0x30303000, 0x00004000, 0x10105000, 0x20206000, 0x30307000,
  0x40000000, 0x50101000, 0x60202000, 0x70303000, 0x40004000, 0x50105000, 0x60206000, 0x70307000];
const STD_WORDS = [
  [[wimpWords[0], wimpWords[7]], [wimpWords[0], wimpWords[2], wimpWords[4], wimpWords[7]], wimpWords, hardmode_defpal],
  [[0, 0xFFFFFF00], [0, 0xFF00, 0xFFFF00, 0xFFFFFF00],
    [0, 0xFF00, 0xFF0000, 0xFFFF00, 0xFF000000, 0xFF00FF00, 0xFFFF0000, 0xFFFFFF00,
      0, 0xFF00, 0xFF0000, 0xFFFF00, 0xFF000000, 0xFF00FF00, 0xFFFF0000, 0xFFFFFF00], hardmode_defpal],
].map((a) => a.map((p) => p.map((w) => w >>> 0)));

/** Palette words of the standard palette (psprite_std_palettes) for log2bpp 0..3. */
export const stdPaletteWords = (lb, desktop) => STD_WORDS[desktop ? 0 : 1][lb];

/** ENTRIES(n) from main.h: palette entries Paint gives a sprite of log2bpp n. */
export const ENTRIES = (lb) => (lb < 3 ? 1 << (1 << lb) : lb === 3 ? 16 : 0);
export const log2bpp = (bpp) => ({ 1: 0, 2: 1, 4: 2, 8: 3, 16: 4, 32: 5 })[bpp];

/** Number of colours (colours_count). */
export const nColours = (s) => (s.bpp <= 8 ? 1 << s.bpp : s.bpp === 16 ? 32768 : 16777216);
export const hasPal = (s) => !!(s.pal && s.pal.length);
/** psprite_hastruecolpal: a palette entry for every colour. */
export const hasTrueColPal = (s) => s.bpp <= 8 && hasPal(s) && s.pal.length >= 2 * (1 << s.bpp);

/** Expand a 16-entry palette to 256 colours the VIDC1 way (c.Colours "brain-damaged palette"). */
function fold256(words, copyNybbles) {
  return Array.from({ length: 256 }, (_, i) => {
    let w = (words[i & 15] | ((i & 16) << 11) | ((i & 96) << 17) | ((i & 128) << 24)) >>> 0;
    if (copyNybbles) w = (w | (w >>> 4)) >>> 0;
    return wordRGB(w);
  });
}

/** RGB triples for every pixel value of a <= 8bpp sprite, as Paint displays it. */
export function spritePalette(s, desktop = true) {
  const n = 1 << s.bpp;
  if (hasPal(s)) {
    const entries = s.pal.length >> 1;
    const words = Array.from({ length: entries }, (_, i) => s.pal[2 * i]);
    if (s.bpp === 8 && entries < 256) return fold256(words, false);
    return Array.from({ length: n }, (_, i) => wordRGB(words[i % entries]));
  }
  const lb = log2bpp(s.bpp);
  const words = stdPaletteWords(lb, desktop);
  if (lb === 3) return fold256(words, true);
  return Array.from({ length: n }, (_, i) => wordRGB(words[i % words.length]));
}

/** RGB of a raw deep-colour pixel. */
export function deepRGB(bpp, v) {
  if (bpp === 16) { const e = (q) => (q << 3) | (q >> 2); return [e(v & 31), e((v >> 5) & 31), e((v >> 10) & 31)]; }
  return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255];
}
/** Raw deep-colour pixel for an RGB triple. */
export function deepPixel(bpp, [r, g, b]) {
  if (bpp === 16) return (r >> 3) | ((g >> 3) << 5) | ((b >> 3) << 10);
  return (r | (g << 8) | (b << 16)) >>> 0;
}

/** colours_entry: palette word for a deep colour number. */
export function colourEntry(nc, c) {
  if (nc === 32768) {
    const r = c & 0x1F, g = (c >> 5) & 0x1F, b = (c >> 10) & 0x1F;
    return ((((0xFF * r / 0x1F) | 0) << 8) | (((0xFF * g / 0x1F) | 0) << 16) | (((0xFF * b / 0x1F) | 0) << 24)) >>> 0;
  }
  return (c << 8) >>> 0;
}

/** RGB shown for a Paint colour number (not transparent / ECF). */
export function colourRGB(s, c, desktop = true, pal = null) {
  if (s.bpp > 8) return deepRGB(s.bpp, c);
  return (pal ?? spritePalette(s, desktop))[c] ?? [0, 0, 0];
}

export const cssRGB = ([r, g, b]) => `rgb(${r},${g},${b})`;
/** Is a colour light (so black text reads on it)? */
export const isLight = ([r, g, b]) => r * 77 + g * 150 + b * 29 >= 128 * 256;

/** Nearest palette index to an RGB colour (ColourTrans-style weighted distance). */
export function nearest(pal, [r, g, b]) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < pal.length; i++) {
    const p = pal[i], d = (p[0] - r) ** 2 * 2 + (p[1] - g) ** 2 * 4 + (p[2] - b) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** Colour number of a sprite nearest to an RGB colour (ColourTrans_ReturnColourNumberForMode). */
export function nearestColour(s, rgb, desktop = true) {
  if (s.bpp > 8) return deepPixel(s.bpp, rgb);
  return nearest(spritePalette(s, desktop), rgb);
}

/**
 * Colour translation table from sprite `src` (its own palette) to sprite `dst`: an array mapping
 * each src pixel value to the nearest dst colour number (used for brushes and ECFs).
 */
export function translation(src, dst, desktop = true) {
  const dpal = dst.bpp <= 8 ? spritePalette(dst, desktop) : null;
  const map = (rgb) => (dpal ? nearest(dpal, rgb) : deepPixel(dst.bpp, rgb));
  if (src.bpp <= 8) {
    const t = spritePalette(src, desktop).map(map);
    return (v) => t[v] ?? 0;
  }
  const cache = new Map();
  return (v) => {
    let r = cache.get(v);
    if (r === undefined) { r = map(deepRGB(src.bpp, v)); cache.set(v, r); }
    return r;
  };
}

/** GCOL action (Set, OR, AND, EOR) applied to a pixel. */
export function applyAction(mode, there, c) {
  switch (mode) {
    case 1: return there | c;
    case 2: return there & c;
    case 3: return there ^ c;
    default: return c;
  }
}
