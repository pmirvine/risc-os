// RISC OS default palettes. Colours are [r,g,b] 0-255.

// Wimp 16-colour desktop palette (Sources/OS_Core/Desktop/Wimp/s/!Palette, &BBGGRR00 words)
export const WIMP_PALETTE_WORDS = [
  0xFFFFFF00, 0xDDDDDD00, 0xBBBBBB00, 0x99999900,
  0x77777700, 0x55555500, 0x33333300, 0x00000000,
  0x99440000, 0x00EEEE00, 0x00CC0000, 0x0000DD00,
  0xBBEEEE00, 0x00885500, 0x00BBFF00, 0xFFBB0000,
];
export const WIMP_EXTRA_WORDS = { border: 0x00000000, pointer1: 0xFFFF0000, pointer2: 0x99000000, pointer3: 0x0000FF00 };

export const word2rgb = (w) => [(w >>> 8) & 255, (w >>> 16) & 255, (w >>> 24) & 255];
export const WIMP16 = WIMP_PALETTE_WORDS.map(word2rgb);
export const WIMP_NAMES = ['white', 'grey1', 'grey2', 'grey3', 'grey4', 'grey5', 'grey6', 'black',
  'dark blue', 'yellow', 'light green', 'red', 'cream', 'dark green', 'orange', 'light blue'];

// Default 256-colour (VIDC10-compatible) palette, Kernel/s/vdu/vdupal20 paldat8
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

// Palettes used when a sprite without its own palette is plotted by the Wimp
// (Wimp_ReadPixTrans semantics: 1bpp → Wimp 0/7, 2bpp → Wimp 0/2/4/7, 4bpp → Wimp 0-15).
export const WIMP_DEFAULT = {
  1: [WIMP16[0], WIMP16[7]],
  2: [WIMP16[0], WIMP16[2], WIMP16[4], WIMP16[7]],
  4: WIMP16,
  8: VIDC256,
};

// Kernel (non-Wimp) default palettes, for reference.
const k = (v) => [((v) & 15) * 17, ((v >> 4) & 15) * 17, ((v >> 8) & 15) * 17];
export const KERNEL_DEFAULT = {
  1: [0x000, 0xFFF].map(k),
  2: [0x000, 0x00F, 0x0FF, 0xFFF].map(k),
  4: [0x000, 0x00F, 0x0F0, 0x0FF, 0xF00, 0xF0F, 0xFF0, 0xFFF, 0x000, 0x00F, 0x0F0, 0x0FF, 0xF00, 0xF0F, 0xFF0, 0xFFF].map(k),
  8: VIDC256,
};

export const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
