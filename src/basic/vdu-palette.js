// Default palettes, from vendor/ro371/Sources/OS_Core/Kernel/s/vdu/vdupal20 (PV_SetDefaultPalette).
// Palette entries are 0xRRGGBB. Two flash states are kept (state 1 = first, state 2 = second).

const x17 = (n) => n * 17; // 4-bit gun -> 8-bit

// 12-bit &FBGR words (bit 15 = flashing: second state has R,G,B inverted)
const paldat1 = [0x0000, 0x0FFF];
const paldat2 = [0x0000, 0x000F, 0x00FF, 0x0FFF];
const paldat4 = [0x0000, 0x000F, 0x00F0, 0x00FF, 0x0F00, 0x0F0F, 0x0FF0, 0x0FFF,
  0x8000, 0x800F, 0x80F0, 0x80FF, 0x8F00, 0x8F0F, 0x8FF0, 0x8FFF];
const paldatT = [0x0000, 0x000F, 0x00F0, 0x00FF, 0x0F00, 0x0F0F, 0x0FF0, 0x0FFF,
  0x1000, 0x100F, 0x10F0, 0x10FF, 0x1F00, 0x1F0F, 0x1FF0, 0x1FFF];
const paldatHR = [0x0000, 0x0111, 0x0222, 0x0333, 0x0444, 0x0555, 0x0666, 0x0777,
  0x0888, 0x0999, 0x0AAA, 0x0BBB, 0x0CCC, 0x0DDD, 0x0EEE, 0x0FFF];

function bgr12ToRGB(w) {
  const r = w & 15, g = (w >> 4) & 15, b = (w >> 8) & 15;
  return (x17(r) << 16) | (x17(g) << 8) | x17(b);
}

/** Colour of entry i in the VIDC10-compatible 256 colour palette (paldat8). */
export function paldat8(i) {
  const t = (i & 3) * 0x11;
  let r = t, g = t, b = t;
  if (i & 0x04) r |= 0x44;
  if (i & 0x08) b |= 0x44;
  if (i & 0x10) r |= 0x88;
  if (i & 0x20) g |= 0x44;
  if (i & 0x40) g |= 0x88;
  if (i & 0x80) b |= 0x88;
  return (r << 16) | (g << 8) | b;
}

/**
 * Fill pal1/pal2 (Uint32Array(256)) with the default palette for PalIndex.
 * Also returns the border colour (black). BBC gap modes (3, 6) additionally get colour 2 = border
 * and colour 3 = inverse border (BorderColour in vdupal20).
 */
export function defaultPalette(palIndex, pal1, pal2, bbcGap) {
  pal1.fill(0); pal2.fill(0);
  let tab = null;
  switch (palIndex) {
    case 0: tab = paldat1; break;
    case 1: tab = paldat2; break;
    case 2: tab = paldat4; break;
    case 3: for (let i = 0; i < 256; i++) pal1[i] = pal2[i] = paldat8(i); break;
    case 4: tab = paldatT; break;
    case 5: tab = paldatHR; break;
    default: for (let i = 0; i < 256; i++) pal1[i] = pal2[i] = (i << 16) | (i << 8) | i; break;
  }
  if (tab) {
    for (let i = 0; i < tab.length; i++) {
      const w = tab[i];
      pal1[i] = bgr12ToRGB(w);
      pal2[i] = (w & 0x8000) ? bgr12ToRGB(w ^ 0xFFF) : pal1[i];
    }
  }
  if (bbcGap) {
    pal1[2] = pal2[2] = 0x000000;
    pal1[3] = pal2[3] = 0xFFFFFF;
  }
}
