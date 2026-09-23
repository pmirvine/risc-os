// MODE 7 teletext emulation, following vendor/ro371/Sources/OS_Core/Kernel/s/vdu/vduttx.
//
// The kernel keeps a 25x41 word "map" of characters+attributes and repaints characters into a
// 320x250 4bpp screen (8x10 pixel cells) with two banks: bank 0 shows everything, bank 1 shows
// flashing characters as background; the display alternates between banks (TeletextFlashTest in
// vducursoft: 48 vsyncs on / 16 off). We keep a map of character codes only and re-derive the
// attributes by scanning each row from the left (as TTXScanZap does), which gives identical output.

// TTXHardFont: 10 rows per char for &20..&7F (bit 7 = leftmost pixel). Note the kernel swaps
// '#', '_' and '`' on input (TTXDoChar) so &23 shows as the pound sign glyph etc.
const HARD_HEX = '000000000000000000000008080808080008000000141414000000000000000c12103810103e0000001c2a281c0a2a1c00000030320408102606000000102828102a241a000000080808000000000000000408101010080400000010080404040810000000082a1c081c2a080000000008083e080800000000000000000008081000000000001c0000000000000000000000000800000000020408102000000000081422222214080000000818080808081c0000001c22020c10203e0000003e02040c02221c000000040c14243e04040000003e203c0202221c0000000c10203c22221c0000003e0204081010100000001c22221c22221c0000001c22221e02041800000000000800000800000000000008000008081000000408102010080400000000003e003e0000000000100804020408100000001c2204080800080000001c222e2a2e201c000000081422223e22220000003c22223c22223c0000001c22202020221c0000003c22222222223c0000003e20203c20203e0000003e20203c2020200000001c22202026221e0000002222223e2222220000001c08080808081c0000000202020202221c000000222428302824220000002020202020203e00000022362a222222220000002222322a2622220000001c22222222221c0000003c22223c2020200000001c2222222a241a0000003c22223c2824220000001c22201c02221c0000003e0808080808080000002222222222221c000000222222141408080000002222222a2a2a1400000022221408142222000000222214080808080000003e02040810203e0000000008103e100800000000202020202c0204080e000008043e04080000000000081c2a08080000000014143e143e14140000000000003e00000000000000001c021e221e00000020203c2222223c00000000001e2020201e00000002021e2222221e00000000001c223e201c0000000408081c08080800000000001e2222221e021c0020203c222222220000000800180808081c00000008000808080808081000101012141814120000001808080808081c0000000000342a2a2a2a00000000003c2222222200000000001c2222221c00000000003c2222223c20200000001e2222221e0202000000161810101000000000001e201c023c00000008081c080808040000000000222222221e00000000002222141408000000000022222a2a14000000000022140814220000000000222222221e021c0000003e0408103e0000001010101012060a0e0200141414141414140000003008300832060a0e02000008003e0008000000003e3e3e3e3e3e3e0000';

export const TTX_HARD = new Uint8Array(96 * 10);
for (let i = 0; i < TTX_HARD.length; i++) TTX_HARD[i] = parseInt(HARD_HEX.substr(i * 2, 2), 16);

// Soft (mosaic) fonts, built as TeletextInit does. Indexed by "held" index 0..127:
//   0x00-0x1F contiguous &20-&3F, 0x20-0x3F separated &20-&3F,
//   0x40-0x5F contiguous &60-&7F, 0x60-0x7F separated &60-&7F.
export const TTX_SOFT = new Uint8Array(128 * 10);
(function initSoft() {
  for (const base of [0x20, 0x60]) {
    for (let c = base; c < base + 32; c++) {
      const bands = [[c & 1, c & 2, 3], [c & 4, c & 8, 4], [c & 0x10, c & 0x40, 3]];
      const ci = c & ~0x20, si = c; // contiguous / separated indices
      let rc = 0, rs = 0;
      for (const [l, r, n] of bands) {
        const v = (l ? 0xF0 : 0) | (r ? 0x0F : 0);
        for (let k = 0; k < n; k++) {
          TTX_SOFT[ci * 10 + rc++] = v;
          TTX_SOFT[si * 10 + rs++] = k === n - 1 ? 0 : v & 0x77;
        }
      }
    }
  }
})();

/** Swap applied to characters on the way into the map (TTXDoChar) - and back out (TTXReadCharacter). */
export function ttxSwapIn(c) { return c === 0x23 ? 0x5F : c === 0x5F ? 0x60 : c === 0x60 ? 0x23 : c; }
export function ttxSwapOut(c) { return c === 0x23 ? 0x60 : c === 0x60 ? 0x5F : c === 0x5F ? 0x23 : c; }

const rowsBuf = new Uint8Array(10);

/** Apply PrintDoubleHeight to a 10-row glyph in place. */
function doubleHeight(g, bottom) {
  const s = rowsBuf; for (let i = 0; i < 10; i++) s[i] = g[i];
  if (!bottom) {
    g[0] = s[0]; g[1] = s[0] | s[1]; g[2] = s[1]; g[3] = s[1] | s[2]; g[4] = s[2];
    g[5] = s[2] | s[3]; g[6] = s[3]; g[7] = s[3] | s[4]; g[8] = s[4]; g[9] = s[4] | s[5];
  } else {
    g[0] = s[5]; g[1] = s[5] | s[6]; g[2] = s[6]; g[3] = s[6] | s[7]; g[4] = s[7];
    g[5] = s[7] | s[8]; g[6] = s[8]; g[7] = s[8] | s[9]; g[8] = s[9]; g[9] = s[9];
  }
}

const glyph = new Uint8Array(10);

// Attribute state packing (the kernel keeps these bits in each map word):
// fore 0-2, back 3-5, graph 6, sep 7, flash 8, hold 9, conceal 10, dbl 11, held 12-18
const INITIAL_STATE = 7;

/**
 * Repaint text row r (0..24) of the teletext screen from the map into both banks.
 * v.ttxMap: Uint8Array(25*40) char codes; v.ttxBottom: Uint8Array(25); banks v.ttxBank0/1 (320x250);
 * v.ttxState: Int32Array(25*41) attribute state *before* each cell as last painted.
 * With early=true painting starts at column fromCol and stops as soon as the attribute state
 * before a later cell matches the state it had when last painted (as TTXScanZap stops when the
 * attributes no longer differ). Returns the number of double height control codes on the row.
 */
export function ttxRenderRow(v, r, fromCol = 0, early = false) {
  const map = v.ttxMap, b0 = v.ttxBank0, b1 = v.ttxBank1, W = 320, st = v.ttxState, sb = r * 41;
  const bottom = v.ttxBottom[r];
  let doubles = 0;
  for (let c = 0; c < 40; c++) if ((map[r * 40 + c] & 0x7F) === 0x0D) doubles++;
  if (!early) fromCol = 0;
  let s = fromCol === 0 ? INITIAL_STATE : st[sb + fromCol];
  let fore = s & 7, back = (s >> 3) & 7, graph = !!(s & 64), sep = !!(s & 128), flash = !!(s & 256);
  let hold = !!(s & 512), conceal = !!(s & 1024), dbl = !!(s & 2048), held = (s >> 12) & 127;
  for (let col = fromCol; col < 40; col++) {
    s = fore | (back << 3) | (graph ? 64 : 0) | (sep ? 128 : 0) | (flash ? 256 : 0) | (hold ? 512 : 0) |
      (conceal ? 1024 : 0) | (dbl ? 2048 : 0) | (held << 12);
    if (early && col > fromCol && st[sb + col] === s) break;
    st[sb + col] = s;
    const ch = map[r * 40 + col], c7 = ch & 0x7F;
    // "pre" actions of control codes (DoPreControl)
    if (c7 < 0x20) {
      switch (c7) {
        case 0x09: flash = false; break;
        case 0x0C: if (dbl) held = 0; dbl = false; break;
        case 0x0D: if (!dbl) held = 0; dbl = true; break;
        case 0x18: conceal = true; break;
        case 0x1C: back = 0; break;
        case 0x1D: back = fore; break;
        case 0x1E: hold = true; break;
      }
    }
    // choose glyph (TTXPaintChar)
    let src = TTX_HARD, idx = 0; // space
    if (c7 < 0x20) {
      if (!hold) held = 0; else { src = TTX_SOFT; idx = held; }
    } else if ((c7 & 0x20) && graph) {
      idx = sep ? c7 : (c7 & ~0x20);
      held = idx; src = TTX_SOFT;
    } else {
      idx = c7 - 32;
    }
    if (conceal) { src = TTX_HARD; idx = 0; }
    for (let i = 0; i < 10; i++) glyph[i] = src[idx * 10 + i];
    if (bottom || dbl) {
      if (!dbl) glyph.fill(0); // single height char on the lower row of a double: invisible
      else doubleHeight(glyph, bottom);
    }
    // paint 8x10 cell into both banks
    let p = r * 10 * W + col * 8;
    for (let y = 0; y < 10; y++, p += W) {
      const bits = glyph[y];
      for (let x = 0; x < 8; x++) {
        const c = (bits & (0x80 >> x)) ? fore : back;
        b0[p + x] = c;
        b1[p + x] = flash ? back : c;
      }
    }
    // "post" actions (DoPostControl)
    if (c7 < 0x20) {
      if (c7 >= 0x01 && c7 <= 0x07) { held = 0; fore = c7; conceal = false; graph = false; }
      else if (c7 === 0x08) flash = true;
      else if (c7 >= 0x11 && c7 <= 0x17) { fore = c7 & 7; conceal = false; graph = true; }
      else if (c7 === 0x19) sep = false;
      else if (c7 === 0x1A) sep = true;
      else if (c7 === 0x1F) hold = false;
    }
  }
  return doubles;
}

/** Store a character in the map and repaint what it affects (TTXDoChar). */
export function ttxPutChar(v, r, c, ch) {
  v.ttxMap[r * 40 + c] = ch;
  const had = v.ttxDoubles[r];
  v.ttxDoubles[r] = ttxRenderRow(v, r, c, true);
  v._dirtyRows(r * 10, r * 10 + 9);
  if ((had > 0) !== (v.ttxDoubles[r] > 0)) ttxRefresh(v, r + 1, r, true);
}

/**
 * Repaint rows from..to (inclusive) and then propagate the "bottom half of double height" row flags
 * downwards (TTXScanZap / CountDoubles): a row is a bottom row iff the row above contains double
 * height codes and is itself a top row. Rows whose flag changes are repainted too.
 */
export function ttxRefresh(v, from, to, lazy = false) {
  if (from < 0) from = 0;
  if (to > 24) to = 24;
  let last = from - 1;
  for (let r = from; r <= 24; r++) {
    let changed = false;
    const nb = r > 0 && v.ttxDoubles[r - 1] ? (v.ttxBottom[r - 1] ^ 1) : 0;
    if (nb !== v.ttxBottom[r]) { v.ttxBottom[r] = nb; changed = true; }
    if (r > to && !changed) break;
    if (changed || !lazy || r > to) {
      v.ttxDoubles[r] = ttxRenderRow(v, r);
      last = r;
    }
  }
  if (last >= from) v._dirtyRows(from * 10, last * 10 + 9);
}
