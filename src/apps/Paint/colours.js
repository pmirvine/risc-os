// Paint colour handling: palettes, colour numbers ("GCOLs"), sprite -> RGBA conversion.
//
// A sprite's painting colour (Paint's sprite->gcol) is:
//   0 .. nc-1   a colour number (for 256-colour sprites without a full palette, a GCOL
//               colour*4+tint in Paint's ordering, see colours_gcol_ttab in c.Colours)
//   nc          transparent (only if the sprite has a mask)
//   -1 .. -4    ECF pattern n (-gcol - 1)
// Deep sprites (32K / 16M colours) use the raw pixel value as the colour number.

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

// "Standard" (non-desktop) palettes: the default palettes of the screen modes (kernel vdupal20)
const x17 = (w) => [(w & 15) * 17, ((w >> 4) & 15) * 17, ((w >> 8) & 15) * 17];
const STD = {
  1: [0x000, 0xFFF].map(x17),
  2: [0x000, 0x00F, 0x0FF, 0xFFF].map(x17),
  4: [0x000, 0x00F, 0x0F0, 0x0FF, 0xF00, 0xF0F, 0xFF0, 0xFFF, 0x000, 0x00F, 0x0F0, 0x0FF, 0xF00, 0xF0F, 0xFF0, 0xFFF].map(x17),
  8: VIDC256,
};
const DESK = {
  1: [WIMP_RGB[0], WIMP_RGB[7]],
  2: [WIMP_RGB[0], WIMP_RGB[2], WIMP_RGB[4], WIMP_RGB[7]],
  4: WIMP_RGB,
  8: VIDC256,
};

/** Default palette (no palette in the sprite), as RGB triples. */
export const stdPalette = (bpp, desktop) => (desktop ? DESK : STD)[bpp];

/** Palette word (0xBBGGRR00) from [r,g,b]. */
export const palWord = ([r, g, b]) => ((b << 24) | (g << 16) | (r << 8)) >>> 0;
export const wordRGB = (w) => [(w >>> 8) & 255, (w >>> 16) & 255, (w >>> 24) & 255];

/** Number of colours (Paint's colours_count). */
export const nColours = (s) => (s.bpp <= 8 ? 1 << s.bpp : s.bpp === 16 ? 32768 : 16777216);
/** 256-colour sprite with a full 256-entry palette ("true colour palette"). */
export const hasTrueColPal = (s) => s.bpp === 8 && !!s.pal && s.pal.length >= 512;

// colours_gcol_ttab from c.Colours (octal string)
export const GCOL_TTAB = [0o0, 0o1, 0o20, 0o21, 0o2, 0o3, 0o22, 0o23, 0o4, 0o5, 0o24, 0o25, 0o6, 0o7, 0o26, 0o27, 0o10,
  0o11, 0o30, 0o31, 0o12, 0o13, 0o32, 0o33, 0o14, 0o15, 0o34, 0o35, 0o16, 0o17, 0o36, 0o37, 0o40, 0o41,
  0o60, 0o61, 0o42, 0o43, 0o62, 0o63, 0o44, 0o45, 0o64, 0o65, 0o46, 0o47, 0o66, 0o67, 0o50, 0o51, 0o70,
  0o71, 0o52, 0o53, 0o72, 0o73, 0o54, 0o55, 0o74, 0o75, 0o56, 0o57, 0o76, 0o77];

/** ConvertGCOLToColourNumber: GCOL colour (0-63) + tint (0/64/128/192) -> 8bpp pixel. */
export const gcolTintToPixel = (c) => ((c >> 6) & 3) | ((c & 1) << 2) | ((c & 0x20) << 2) | ((c & 0x10) >> 1) | ((c & 0x0E) << 3);

const GCOL2PIX = Array.from({ length: 256 }, (_, i) => gcolTintToPixel(GCOL_TTAB[i >> 2] | ((i & 3) << 6)));
const PIX2GCOL = new Uint8Array(256);
GCOL2PIX.forEach((p, i) => { PIX2GCOL[p] = i; });

/** Paint colour number -> pixel value to store. */
export function colourToPixel(s, g) {
  if (s.bpp === 8 && !hasTrueColPal(s)) return GCOL2PIX[g & 255];
  return g;
}
/** Pixel value -> Paint colour number. */
export function pixelToColour(s, p) {
  if (s.bpp === 8 && !hasTrueColPal(s)) return PIX2GCOL[p & 255];
  return p;
}

/** RGB triples for every pixel value of a <= 8bpp sprite. */
export function spritePalette(s, desktop = true) {
  const n = 1 << s.bpp;
  if (s.pal && s.pal.length >= 2) {
    const entries = s.pal.length >> 1;
    if (s.bpp === 8 && entries < 256) {
      // VIDC1-style 16 entry palette: low bits from the palette, top bits from the pixel
      return Array.from({ length: 256 }, (_, i) => {
        const [r, g, b] = wordRGB(s.pal[2 * (i & 15)] ?? 0);
        return [(r & 0x7F) | (i & 16 ? 0x80 : 0), (g & 0x3F) | ((i & 96) << 1), (b & 0x7F) | (i & 128 ? 0x80 : 0)];
      });
    }
    return Array.from({ length: n }, (_, i) => wordRGB(s.pal[2 * (i % entries)]));
  }
  return stdPalette(s.bpp, desktop);
}

/** RGB of a raw deep-colour pixel. */
export function deepRGB(s, v) {
  if (s.bpp === 16) { const e = (q) => (q << 3) | (q >> 2); return [e(v & 31), e((v >> 5) & 31), e((v >> 10) & 31)]; }
  return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255];
}
/** Raw deep-colour pixel for an RGB triple. */
export function deepPixel(s, [r, g, b]) {
  if (s.bpp === 16) return (r >> 3) | ((g >> 3) << 5) | ((b >> 3) << 10);
  return (r | (g << 8) | (b << 16)) >>> 0;
}

/** RGB shown for a Paint colour number (not transparent / ECF). */
export function colourRGB(s, g, desktop = true) {
  if (s.bpp > 8) return deepRGB(s, g);
  const pal = spritePalette(s, desktop);
  return pal[colourToPixel(s, g)] ?? [0, 0, 0];
}

export const cssRGB = ([r, g, b]) => `rgb(${r},${g},${b})`;
export const luminance = ([r, g, b]) => (r * 77 + g * 150 + b * 29) >> 8;

/** Nearest palette index to an RGB colour. */
export function nearest(pal, [r, g, b]) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < pal.length; i++) {
    const p = pal[i], d = (p[0] - r) ** 2 * 3 + (p[1] - g) ** 2 * 4 + (p[2] - b) ** 2 * 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
