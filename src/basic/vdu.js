// RISC OS 3.71 VDU driver (text + graphics), a faithful port of the kernel VDU code in
// vendor/ro371/Sources/OS_Core/Kernel/s/vdu/. Host-agnostic: works headless (node tests) or
// renders into an HTMLCanvasElement / OffscreenCanvas.
//
// Main kernel files followed:
//   vdudriver  - byte stream / queue (Vdu, VduJTb, VduQTb), MODE change, GCOL/SetColour, VDU 24/26/29
//   vduwrch    - text output, cursor movement, scrolling, CLS, colours, ReadCharacter
//   vdu23      - VDU 23 sub-functions, cursor movement specials, 23,7 scroll, 23,8 clear block
//   vdu5       - VDU 5 text at the graphics cursor
//   vduplot    - PLOT dispatch, EIG/IEG coordinate conversion, circles, HLine, ReadPoint
//   vdugraf*   - graphics primitives (see vdu-graphics.js)
//   vdupal*    - palettes (see vdu-palette.js); vduttx - teletext (see vdu-teletext.js)
//   vducursoft - text cursor shape / flash
//
// Internal representation: one Uint8Array of *logical* pixels per screen bank, width XWindLimit+1,
// height YWindLimit+1, row 0 = top. Each byte holds the pixel value (0..NColour, or 0..255 in
// 256-colour modes). Modes with double-width pixels (Log2BPC > Log2BPP, e.g. MODE 2) store one byte
// per logical pixel; displayWidth/displayHeight give the aspect-correct CSS size.

import { SYSTEM_FONT } from './font8x8.js';
import {
  modeInfo, modeVariable, selectableMode, MAX_MODE,
  Flag_NonGraphic, Flag_Teletext, Flag_GapMode, Flag_BBCGapMode, Flag_DoubleVertical,
} from './vdu-modes.js';
import { defaultPalette } from './vdu-palette.js';
import { graphicsMethods } from './vdu-graphics.js';
import { ttxRefresh, ttxPutChar, ttxSwapIn, ttxSwapOut } from './vdu-teletext.js';

// VduQTb: number of parameter bytes following each control code
const QLEN = new Uint8Array(32);
QLEN[1] = 1; QLEN[17] = 1; QLEN[18] = 2; QLEN[19] = 5; QLEN[22] = 1; QLEN[23] = 9;
QLEN[24] = 8; QLEN[25] = 5; QLEN[28] = 4; QLEN[29] = 4; QLEN[31] = 2;

// DefEcfTb (vduplot): default ECF patterns indexed by the ECFIndex mode variable
const DefEcfTb = [
  [0, 0, 0, 0],
  [0x00330033, 0xCC33CC33, 0xCCFFCCFF, 0x030C30C0],
  [0x55665566, 0x99669966, 0x99AA99AA, 0xBBEEBBEE],
  [0x31133113, 0x51155115, 0x32233223, 0x37733773],
  [0x00550055, 0xAA55AA55, 0xAAFFAAFF, 0x11224488],
  [0xFFFEFDFC, 0x00010203, 0x20212223, 0xDFDEDDDC],
];
const SimpEcfTb = [0x00, 0x33, 0x33, 0x0F, 0x55, 0xFF];
// TBFullCol (vdudriver), accessed as TBFullCol[NColour + (colour AND NColour)]
const TBFullCol = [0xFF, 0x00, 0xFF, 0x00, 0x55, 0xAA, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF];
// InterleaveTB (vduplot): unpacking BBC-style interleaved ECF bytes, by Log2BPP
const InterleaveTB = [
  [0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01],
  [0x08, 0x80, 0x04, 0x40, 0x02, 0x20, 0x01, 0x10],
  [0x02, 0x08, 0x20, 0x80, 0x01, 0x04, 0x10, 0x40],
  [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80],
];
// GCOL action -> (zgoo, zgeo, zgoe, zgee) (TBscrmasks in vduplot)
const ZG = [
  [1, 0, 0, 1], [0, 0, 1, 1], [0, 1, 0, 1], [1, 1, 0, 0],
  [1, 1, 1, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 1, 1, 1],
];

const SCREEN_END = 0x2000000;          // fake logical address of the end of screen memory
const MIN_BANKS = 2;                   // screen banks always available for OS_Byte 112/113 (more if they fit)
const DEFAULT_SCREEN_MEM = 0x100000;   // configured screen memory (1MB of VRAM, as a Risc PC)

const s16 = (lo, hi) => ((lo | (hi << 8)) << 16) >> 16;
const ror32 = (x, s) => { s &= 31; return s ? ((x >>> s) | (x << (32 - s))) >>> 0 : x >>> 0; };
const nowMs = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

/** Convert a GCOL colour+tint byte (t t b b g g r r) to a 256-colour mode pixel (B3 G3 G2 R3 B2 R2 T1 T0).
 *  ConvertGCOLToColourNumber in vduwrch. */
export function gcolToPixel(c) {
  return ((c >> 6) & 3) | ((c & 1) << 2) | ((c & 0x20) << 2) | ((c & 0x10) >> 1) | ((c & 0x0E) << 3);
}
/** Inverse: pixel -> {colour (0..63), tint (0/64/128/192)}. ExtractTintAndColour in vduplot. */
export function pixelToGcol(p) {
  const tint = (p << 6) & 0xC0;
  let r2 = p & 0x84;
  if (p & 8) r2 |= 0x40;
  r2 |= (p & 0x70) >> 1;
  return { colour: r2 >> 2, tint };
}

export class VDU {
  constructor(opts = {}) {
    this.onBell = opts.onBell || null;
    this.onError = opts.onError || null;
    this.lastError = null;
    this.font = new Uint8Array(SYSTEM_FONT);   // soft font (VDU 23 redefinable), survives MODE
    this._glyphMap = null;
    this._canvas = opts.canvas || null;
    this.screenMemory = opts.screenMemory || DEFAULT_SCREEN_MEM;  // bytes; sets the number of screen banks
    this._ctx = null; this._img = null; this._img32 = null;
    // state that survives mode changes
    this.cursorFlags = 0;      // CursorFlags bits 0..7 (VDU 23,16)
    this.c81 = false;          // pending CRLF ("81st column")
    this.disabled = false;     // VDU 21
    this.vdu2 = false;         // printer enabled
    this.pageMode = false;
    this.flashMark = 25; this.flashSpace = 25; // OS_Byte 9/10, in 1/50 s
    this._flashT0 = nowMs(); this._ttxT0 = nowMs(); this._cursorT0 = nowMs();
    this.q = new Uint8Array(9); this.qCode = 0; this.qNeed = 0; this.qPos = 0;
    this.pal1 = new Uint32Array(256); this.pal2 = new Uint32Array(256);
    this.border = [0, 0]; this.pointerPal = [[0, 0], [0, 0], [0, 0], [0, 0]];
    this._lut1 = new Uint32Array(256); this._lut2 = new Uint32Array(256); this._palDirty = true;
    this.dMin = 1e9; this.dMax = -1;
    this._shown = { flash: 0, bank: -1, cursor: '' };
    this.driverBank = 0; this.displayBank = 0;
    this.lineDot = { cnt: 0, lsw: 0, msw: 0 };
    this._setMode(opts.mode ?? 12);
    if (opts.autoRender) this._startAutoRender();
  }

  // =============================================================================================
  // Mode change (ModeChangeSub in vdudriver, SwitchOutputToSprite in vdugrafl)

  _setMode(n) {
    const sel = selectableMode(n);
    if (sel < 0) {
      this.lastError = { errnum: 25, errmess: 'Bad MODE' };
      if (this.onError) this.onError(this.lastError);
      return false;
    }
    const m = modeInfo(sel);
    this.m = m; this.modeNo = sel;
    this.W = m.xWindLimit + 1; this.H = m.yWindLimit + 1;
    this.xWL = m.xWindLimit; this.yWL = m.yWindLimit;
    this.xEig = m.xEig; this.yEig = m.yEig; this.nColour = m.nColour;
    this.log2bpp = m.log2bpp; this.log2bpc = m.log2bpc;
    this.bpp = 1 << m.log2bpp; this.bpc = 1 << m.log2bpc;
    this.pixMask = this.bpp >= 8 ? 255 : (1 << this.bpp) - 1;
    this.ppwShift = 5 - m.log2bpc; this.ppwMask = (1 << this.ppwShift) - 1;
    this.teletext = !!(m.flags & Flag_Teletext);
    this.nonGraphic = !!(m.flags & Flag_NonGraphic);
    this.bbcGap = !!(m.flags & Flag_BBCGapMode);
    this.gapMode = !!(m.flags & Flag_GapMode);
    this.dblVert = !!(m.flags & Flag_DoubleVertical);
    this.tCharSizeY = this.dblVert ? 16 : 8;
    this.rowMult = this.gapMode ? this.tCharSizeY + (this.tCharSizeY >> 2) : this.tCharSizeY;
    const ed = m.xEig - m.yEig; this.aspect = ed < 0 ? 2 : ed > 0 ? 1 : 0;
    this.cursorFill = this.bbcGap ? 1 : this.bpp === 4 ? 7 : this.pixMask;
    // screen memory
    const size = this.W * this.H;
    this.maxBanks = Math.max(MIN_BANKS, Math.floor(this.screenMemory / m.screenSize));
    this.banks = [new Uint8Array(size), new Uint8Array(size)];   // further banks are allocated when selected
    this.driverBank = 0; this.displayBank = 0;
    this.fb = this.banks[0];
    if (this.teletext) {
      this.ttxBank0 = this.banks[0]; this.ttxBank1 = this.banks[1];
      this.ttxMap = new Uint8Array(25 * 40).fill(32);
      this.ttxBottom = new Uint8Array(25); this.ttxDoubles = new Uint8Array(25);
      this.ttxState = new Int32Array(25 * 41).fill(7);
      this._ttxT0 = nowMs();
    }
    // constant plot tables for this mode
    const nt = 8 << this.ppwShift;
    this.NOEFFECT = { ora: new Uint8Array(nt), eor: new Uint8Array(nt), nop: true, fill: -1 };
    this.INVERT = { ora: new Uint8Array(nt), eor: new Uint8Array(nt).fill(this.pixMask), nop: false, fill: -1 };
    // SwitchOutputToSprite defaults
    this.ecfYOffset = (this.yWL + 1) & 7; this.ecfShift = 0;
    this.qNeed = 0;
    this.gCharSizeX = 8; this.gCharSizeY = 8; this.gCharSpaceX = 8; this.gCharSpaceY = 8;
    this.vdu5 = false; this.split = false; this.pageMode = false; this.ix = 0; this.iy = 0;
    this.ecf = new Uint8Array(32);
    this.dotStyle = new Uint8Array(8);
    // InitCursor
    this.reg10Copy = this.teletext ? 0x72 : 0x67;
    this._progReg10(this.reg10Copy);
    this.cursorEnd = this.rowMult;
    this._defaultColours();
    this._defaultEcfPattern();
    this._defaultLineStyle();
    this._defaultWindows();
    // ModeChangeSub: palette, CLS
    this._palInit();
    this._ff();
    this._setupCanvas();
    this._dirtyAll();
    return true;
  }

  // =============================================================================================
  // Colours (DefaultColours / SetColour / SetCol10 / SetCol60 / CompileTextFg etc.)

  _defaultColours() {
    this.gplfmd = 0; this.gplbmd = 0;
    this.gfcol = (this.nColour & 0xF0) ? this.nColour : this.nColour & 7;
    this.gbcol = 0;
    this.tfTint = 0xFF; this.tbTint = 0; this.gfTint = 0xFF; this.gbTint = 0;
    this._setColour();
    let fore = this.nColour;
    if (fore === 63) fore = 255; else if (fore === 15) fore = 7;
    this.tForeCol = fore; this.tBackCol = 0;
    this.textFg = fore; this.textBg = 0;
  }

  _compileTextFg() {
    this.textFg = this.nColour >= 63 ? gcolToPixel((this.tForeCol & 63) | (this.tfTint & 0xC0)) : this.tForeCol;
  }
  _compileTextBg() {
    this.textBg = this.nColour >= 63 ? gcolToPixel((this.tBackCol & 63) | (this.tbTint & 0xC0)) : this.tBackCol;
  }

  /** Build the 8 row words of a colour/ECF (SetCol10/SetCol30/SetCol52) */
  _buildEcf(action, colour, tint) {
    const out = new Uint32Array(8);
    const a = action & 0xF0;
    if (a === 0 || a >= 96) { // solid colour (96+ = OS_SetColour pattern, not supported: use colour)
      let c = colour & this.nColour & 63;
      if (this.nColour & 0xF0) c = gcolToPixel(c | (tint & 0xC0));
      let w = c;
      for (let s = this.bpp; s < 32; s <<= 1) w = (w | (w << s)) >>> 0;
      out.fill(w >>> 0);
      return out;
    }
    const e = this.ecf;
    if (a >= 80) { // giant ECF: all four patterns side by side
      for (let r = 0; r < 8; r++) out[r] = (e[r] | (e[8 + r] << 8) | (e[16 + r] << 16) | (e[24 + r] << 24)) >>> 0;
      return out;
    }
    const n = (a >> 4) - 1;
    if (this.bpp === this.bpc) {
      for (let r = 0; r < 8; r++) { const b = e[n * 8 + r]; out[r] = (b * 0x01010101) >>> 0; }
    } else { // SetCol52: double up the pixels (MODE 2 etc.)
      const mask = (this.nColour & 0xF0) ? 0xFF : this.nColour, bpp = this.bpp;
      for (let r = 7; r >= 0; r--) {
        const b = e[n * 8 + r];
        let r8 = 8 - bpp, r9 = 32 - bpp, w = 0;
        while (r9 >= 0) {
          const px = mask & ror32(b, r8);
          w |= px << r9; r9 -= bpp;
          w |= px << r9;
          r8 = (r8 - bpp) & 7;
          r9 -= bpp;
        }
        out[r] = w >>> 0;
      }
    }
    return out;
  }

  /** SetCol60: build the OraEor plot table from colour words, the 'other' colour (for transparency) and action */
  _buildOE(src, other, action) {
    const ppw = 1 << this.ppwShift, nt = 8 * ppw;
    const ora = new Uint8Array(nt), eor = new Uint8Array(nt);
    const act = action & 0xF, z = ZG[act & 7], bpc = this.bpc, pm = this.pixMask;
    const slotMask = bpc >= 32 ? 0xFFFFFFFF : (2 ** bpc) - 1;
    for (let r = 0; r < 8; r++) {
      const w = src[r];
      let mask = 0xFFFFFFFF;
      if (act & 8) { // transparency: pixels equal to the 'other' colour are not plotted
        const diff = (w ^ other[r]) >>> 0;
        mask = 0;
        for (let i = 0; i < ppw; i++) {
          const sm = (slotMask * 2 ** (i * bpc)) >>> 0;
          if (((diff & sm) >>> 0) !== 0) mask = (mask | sm) >>> 0;
        }
      }
      let o = ((w | (z[0] ? 0xFFFFFFFF : 0)) ^ (z[1] ? 0xFFFFFFFF : 0)) & mask;
      let x = ((w | (z[2] ? 0xFFFFFFFF : 0)) ^ (z[3] ? 0xFFFFFFFF : 0)) & mask;
      o = ror32(o >>> 0, this.ecfShift); x = ror32(x >>> 0, this.ecfShift);
      const row = ((this.ecfYOffset + r) & 7) * ppw;
      for (let i = 0; i < ppw; i++) {
        ora[row + i] = Math.floor(o / 2 ** (i * bpc)) & pm;
        eor[row + i] = Math.floor(x / 2 ** (i * bpc)) & pm;
      }
    }
    let nop = true, uniform = true;
    for (let i = 0; i < nt; i++) {
      if (ora[i] || eor[i]) nop = false;
      if (ora[i] !== pm || eor[i] !== eor[0]) uniform = false;
    }
    return { ora, eor, nop, fill: uniform ? (~eor[0] & pm) : -1 };
  }

  /** delimiter pixel table (for fills) from colour words: unrotated, row = screen row & 7 */
  _delimTable(words) {
    const ppw = 1 << this.ppwShift, t = new Uint8Array(8 * ppw), bpc = this.bpc, pm = this.pixMask;
    for (let r = 0; r < 8; r++) for (let i = 0; i < ppw; i++) t[r * ppw + i] = Math.floor(words[r] / 2 ** (i * bpc)) & pm;
    return t;
  }

  // SetColour
  _setColour() {
    const fg = this._buildEcf(this.gplfmd, this.gfcol, this.gfTint);
    const bg = this._buildEcf(this.gplbmd, this.gbcol, this.gbTint);
    this.fgEcf = fg; this.bgEcf = bg;
    this.fgOE = this._buildOE(fg, bg, this.gplfmd);
    this.bgOE = this._buildOE(bg, fg, this.gplbmd);
    this.bgStore = this._buildOE(bg, fg, 0);
    this.fgDelim = this._delimTable(fg);
    this.bgDelim = this._delimTable(bg);
  }

  // DefaultEcfPattern
  _defaultEcfPattern() {
    this.bbcCompatECF = 0;
    const t = DefEcfTb[this.m.ecfIndex] || DefEcfTb[0];
    for (let n = 0; n < 4; n++) {
      const w = t[n];
      for (let i = 0; i < 4; i++) this.ecf[n * 8 + i] = this.ecf[n * 8 + 4 + i] = (w >>> (8 * i)) & 0xFF;
    }
    this._setColour();
  }

  // DefaultLineStyle
  _defaultLineStyle() {
    this.dotLineLength = 8;
    this.dotStyle.fill(0xAA);
    this.lineDot.cnt = 0;
  }
  _dotLSW() { const d = this.dotStyle; return (d[0] | (d[1] << 8) | (d[2] << 16) | (d[3] << 24)) >>> 0; }
  _dotMSW() { const d = this.dotStyle; return (d[4] | (d[5] << 8) | (d[6] << 16) | (d[7] << 24)) >>> 0; }

  // =============================================================================================
  // Palette (vdupalette / vdupal20)

  _palInit() {
    if (this.teletext) { defaultPalette(4, this.pal1, this.pal2, false); }
    else defaultPalette(this.m.palIndex, this.pal1, this.pal2, this.bbcGap);
    this.border = [0, 0];
    this._palDirty = true; this._dirtyAll();
  }

  _setNormalColour(l, rgb, states) {
    const set = (i, c) => { if (states & 1) this.pal1[i] = c; if (states & 2) this.pal2[i] = c; };
    if (this.nColour === 63) { // UpdateNormalColour for VIDC10-compatible 256 colour modes
      l &= 15;
      for (let k = 0; k < 16; k++) {
        const i = l + 16 * k;
        let r = (rgb >> 16) & 0x77, g = (rgb >> 8) & 0x33, b = rgb & 0x77;
        if (i & 0x10) r |= 0x88;
        if (i & 0x20) g |= 0x44;
        if (i & 0x40) g |= 0x88;
        if (i & 0x80) b |= 0x88;
        set(i, (r << 16) | (g << 8) | b);
      }
    } else set(l & this.nColour & 255, rgb);
    this._palDirty = true; this._dirtyAll();
  }

  _setBorder(rgb) {
    this.border = [rgb, rgb];
    if (this.bbcGap) { // colour 2 = border, colour 3 = inverse (BorderColour)
      this.pal1[2] = this.pal2[2] = rgb;
      this.pal1[3] = this.pal2[3] = rgb ^ 0xFFFFFF;
      this._palDirty = true; this._dirtyAll();
    }
  }

  // DC3 / SetPal: VDU 19,l,p,r,g,b
  _vdu19(l, p, r, g, b) {
    if (this.teletext) return;
    p &= 0x7F;
    if (p < 16) {
      const rgb = ((p & 1) ? 0xFF0000 : 0) | ((p & 2) ? 0xFF00 : 0) | ((p & 4) ? 0xFF : 0);
      if (this.m.palIndex >= 3) p &= ~8;
      if (p & 8) { this._setNormalColour(l, rgb, 1); this._setNormalColour(l, rgb ^ 0xFFFFFF, 2); }
      else this._setNormalColour(l, rgb, 3);
      return;
    }
    const rgb = ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
    switch (p) {
      case 16: this._setNormalColour(l, rgb, 3); break;
      case 17: this._setNormalColour(l, rgb, 1); break;
      case 18: this._setNormalColour(l, rgb, 2); break;
      case 24: this._setBorder(rgb); break;
      case 25: { const i = l & 3; if (i) this.pointerPal[i] = [rgb, rgb]; break; }
    }
  }

  /** helper used by VDU 19,l,16,r,g,b */
  setPalette(logical, r, g, b) { this._vdu19(logical, 16, r, g, b); }

  /** OS_ReadPalette: {first, second} as BBGGRRPP words (PP = 16, or 17/18 if flashing), plus r,g,b */
  readPalette(logical, type = 16) {
    let c1, c2;
    if (type === 24) { [c1, c2] = this.border; }
    else if (type === 25) { const i = logical & 3; if (!i) return { first: 0, second: 0, r: 0, g: 0, b: 0 }; [c1, c2] = this.pointerPal[i]; }
    else { const i = logical & (this.nColour === 63 ? 255 : this.nColour); c1 = this.pal1[i]; c2 = this.pal2[i]; }
    const word = (c) => (((c & 0xFF) << 24) | (((c >> 8) & 0xFF) << 16) | (((c >> 16) & 0xFF) << 8)) >>> 0;
    let first = (word(c1) | (type & 0x7F)) >>> 0, second = (word(c2) | (type & 0x7F)) >>> 0;
    if (type === 16 && c1 !== c2) { first = (first | 1) >>> 0; second = (second | 2) >>> 0; }
    return { first, second, r: (c1 >> 16) & 255, g: (c1 >> 8) & 255, b: c1 & 255 };
  }

  // =============================================================================================
  // Windows & cursors

  // DefaultWindows (VDU 26)
  _defaultWindows() {
    this.gwl = 0; this.gwb = 0; this.gwr = this.xWL; this.gwt = this.yWL;
    this.twl = 0; this.twb = this.m.scrBRow; this.twr = this.m.scrRCol; this.twt = 0;
    this.orgX = 0; this.orgY = 0; this.gcsX = 0; this.gcsY = 0;
    this.olderX = 0; this.olderY = 0; this.oldX = 0; this.oldY = 0;
    this.gcsIX = 0; this.gcsIY = 0; this.newX = 0; this.newY = 0;
    this.windowing = false;
    this.cx = 0; this.cy = 0;
    this._homeVdu4();
  }

  // IEG: update external graphics cursor from internal one
  _ieg() { this._iegb(this.gcsIX, this.gcsIY); }
  _iegb(x, y) { this.gcsX = (x << this.xEig) - this.orgX; this.gcsY = (y << this.yEig) - this.orgY; }

  // CursorMove: returns true if the cursor moved (C=0)
  _cursorMove(dir, input = false) {
    const kx = input ? 'ix' : 'cx', ky = input ? 'iy' : 'cy';
    switch (dir & 0xE) {
      case 0: case 4: if (this[kx] >= this.twr) return false; this[kx]++; return true;
      case 2: case 6: if (this.twl >= this[kx]) return false; this[kx]--; return true;
      case 8: case 10: if (this[ky] >= this.twb) return false; this[ky]++; return true;
      default: if (this.twt >= this[ky]) return false; this[ky]--; return true;
    }
  }
  // CursorBdy: move to boundary indicated by dir + n characters in
  _cursorBdy(dir, n, input = false) {
    const kx = input ? 'ix' : 'cx', ky = input ? 'iy' : 'cy';
    switch (dir & 0xE) {
      case 0: case 4: this[kx] = this.twl + n; break;
      case 2: case 6: this[kx] = this.twr - n; break;
      case 8: case 10: this[ky] = this.twt + n; break;
      default: this[ky] = this.twb - n; break;
    }
  }
  get _dir() { return this.cursorFlags & 0xE; }

  // TabR0R1 (VDU 31 / 30)
  _tab(x, y) {
    if (this.vdu5) { this._vdu5Tab(x, y); return; }
    this._tabNotVdu5(x, y);
  }
  _tabNotVdu5(x, y) {
    const d = this._dir, ox = this.cx, oy = this.cy;
    this._cursorBdy(d ^ 8, y);
    this._cursorBdy(d, x);
    const inside = () => (this.cx >>> 0) <= this.twr && (this.cy >>> 0) <= this.twb;
    let ok = inside(), c81 = false;
    if (!ok && (this.cursorFlags & 1)) {
      this._cursorBdy(d, x - 1);
      ok = inside();
      if (ok) c81 = true;
    }
    if (ok) this.c81 = c81; else { this.cx = ox; this.cy = oy; }
  }
  _home() { this._tab(0, 0); }
  _homeVdu4() { this._tabNotVdu5(0, 0); }

  // HT / CHT / BS / LF / VT / CR (with the "special" direction-aware versions of vdu23)
  _ht() {
    if (this.vdu5) { this._vdu5HT(this._dir); return; }
    this._rcrlf();
    const d = this._dir;
    if (this._cursorMove(d)) return;
    this._cursorB0(d);
    this._lf();
  }
  _cht() {
    if (this.vdu5) { this._vdu5HT(this._dir); return; }
    const d = this._dir;
    if (this._cursorMove(d)) return;
    if (this.cursorFlags & 1) { this.c81 = true; return; }
    this._cursorB0(d);
    this._lf();
  }
  _cursorB0(d) { this._cursorBdy(d, 0); }
  _bs() {
    if (this.vdu5) { this._vdu5HT(this._dir ^ 6); return; }
    if (this.c81) { this.c81 = false; return; }
    const d = this._dir ^ 6;
    if (this._cursorMove(d)) return;
    this._cursorB0(d);
    this._vt();
  }
  _lf() {
    if (this.vdu5) { this._vdu5LF(this._dir ^ 8); return; }
    const d = this._dir ^ 8;
    if (this._cursorMove(d)) return;
    if (this._canScroll(d)) this._scroll012(0, 7, 0);
  }
  _vt() {
    if (this.vdu5) { this._vdu5LF(this._dir ^ 14); return; }
    const d = this._dir ^ 14;
    if (this._cursorMove(d)) return;
    if (this._canScroll(d)) this._scroll012(0, 6, 0);
  }
  _cr() {
    if (this.vdu5) { this._gB0(this._dir); this._ieg(); return; }
    this.c81 = false;
    this._cursorB0(this._dir);
  }
  _rcrlf() { if (this.c81) { this._cr(); this._lf(); } }
  // CanScroll
  _canScroll(d) {
    if (this.cursorFlags & 0x10) { this._cursorB0(d); return false; }
    if (this.split) this._cursorMove(d ^ 6, true);
    return true;
  }

  // =============================================================================================
  // Text painting, clearing and scrolling

  _dirtyRows(a, b) { if (a < this.dMin) this.dMin = a; if (b > this.dMax) this.dMax = b; }
  _dirtyAll() { this.dMin = 0; this.dMax = this.H - 1; }

  /** paint glyph (8 bytes at font[off]) at text cell (col,row) in text colours (WrchNbit) */
  _paintCell(col, row, glyph, off) {
    const W = this.W, fb = this.fb, fg = this.textFg, bg = this.textBg;
    const y0 = row * this.rowMult;
    let p = y0 * W + col * 8;
    const rep = this.dblVert ? 2 : 1;
    for (let r = 0; r < 8; r++) {
      const bits = glyph[off + r];
      for (let k = 0; k < rep; k++, p += W) {
        fb[p] = bits & 0x80 ? fg : bg; fb[p + 1] = bits & 0x40 ? fg : bg;
        fb[p + 2] = bits & 0x20 ? fg : bg; fb[p + 3] = bits & 0x10 ? fg : bg;
        fb[p + 4] = bits & 0x08 ? fg : bg; fb[p + 5] = bits & 0x04 ? fg : bg;
        fb[p + 6] = bits & 0x02 ? fg : bg; fb[p + 7] = bits & 0x01 ? fg : bg;
      }
    }
    let rows = 8 * rep;
    if (this.gapMode && !this.bbcGap && !this.teletext) { // non-BBC gap modes: 2 extra rows of background
      for (let k = rows; k < this.rowMult; k++, p += W) fb.fill(bg, p, p + 8);
      rows = this.rowMult;
    }
    this._dirtyRows(y0, y0 + rows - 1);
  }

  /** ClearThisBox for a pixel column range x0..x1 (exclusive) and char rows top..bot */
  _clearPix(x0, x1, top, bot) {
    const W = this.W, fb = this.fb, RM = this.rowMult, bg = this.textBg;
    for (let row = top; row <= bot; row++) {
      for (let k = 0; k < RM; k++) {
        const y = row * RM + k;
        const v = (this.bbcGap && k >= 8) ? 2 : bg;
        fb.fill(v, y * W + x0, y * W + x1);
      }
    }
    this._dirtyRows(top * RM, (bot + 1) * RM - 1);
  }

  // ClearBox (left, bottom, right, top in character cells)
  _clearBox(l, b, r, t) {
    if (this.teletext) {
      for (let y = t; y <= b; y++) for (let x = l; x <= r; x++) this.ttxMap[y * 40 + x] = 32;
      ttxRefresh(this, t, b);
      return;
    }
    this._clearPix(l * 8, (r + 1) * 8, t, b);
  }

  // FF - CLS
  _ff() {
    if (this.vdu5) { this._home(); this._clg(); return; }
    if (!this.windowing) {
      this._home();
      if (this.teletext) { // TTXFastCLS
        this.ttxMap.fill(32); this.ttxBottom.fill(0); this.ttxDoubles.fill(0); this.ttxState.fill(7);
        this.ttxBank0.fill(0); this.ttxBank1.fill(0);
        this._dirtyAll();
        return;
      }
      if (!this.bbcGap) { this.fb.fill(this.textBg); this._dirtyAll(); return; }
    }
    this._home();
    this._clearBox(this.twl, this.twb, this.twr, this.twt);
  }

  _screenBox() { return [0, this.m.scrBRow, this.m.scrRCol, 0]; }
  _windowBox() { return [this.twl, this.twb, this.twr, this.twt]; }

  // Scroll a box of text cells up by one character row, clearing the bottom row
  _scrollUpBox(l, b, r, t) {
    if (this.teletext) return this._ttxScrollV(l, b, r, t, true);
    const W = this.W, RM = this.rowMult, fb = this.fb;
    if (b > t) {
      if (l === 0 && r === this.m.scrRCol) fb.copyWithin(t * RM * W, (t + 1) * RM * W, (b + 1) * RM * W);
      else {
        const x0 = l * 8, x1 = (r + 1) * 8;
        for (let y = t * RM; y < b * RM; y++) fb.copyWithin(y * W + x0, (y + RM) * W + x0, (y + RM) * W + x1);
      }
      this._dirtyRows(t * RM, b * RM - 1);
    }
    this._clearBox(l, b, r, b);
  }
  _scrollDownBox(l, b, r, t) {
    if (this.teletext) return this._ttxScrollV(l, b, r, t, false);
    const W = this.W, RM = this.rowMult, fb = this.fb;
    if (b > t) {
      if (l === 0 && r === this.m.scrRCol) fb.copyWithin((t + 1) * RM * W, t * RM * W, b * RM * W);
      else {
        const x0 = l * 8, x1 = (r + 1) * 8;
        for (let y = (b + 1) * RM - 1; y >= (t + 1) * RM; y--) fb.copyWithin(y * W + x0, (y - RM) * W + x0, (y - RM) * W + x1);
      }
      this._dirtyRows((t + 1) * RM, (b + 1) * RM - 1);
    }
    this._clearBox(l, t, r, t);
  }
  // scroll left/right by one char (byByte=false) or one "byte" (8 >> Log2BPP pixels)
  _scrollHBox(l, b, r, t, left, byByte) {
    if (this.teletext) return this._ttxScrollH(l, b, r, t, left);
    let n = 8;
    if (byByte) n = 8 >> (this.bbcGap ? this.log2bpp - 1 : this.log2bpp);
    const W = this.W, RM = this.rowMult, fb = this.fb, x0 = l * 8, x1 = (r + 1) * 8;
    if (x1 - x0 > n) {
      for (let y = t * RM; y < (b + 1) * RM; y++) {
        if (left) fb.copyWithin(y * W + x0, y * W + x0 + n, y * W + x1);
        else fb.copyWithin(y * W + x0 + n, y * W + x0, y * W + x1 - n);
      }
    }
    if (left) this._clearPix(x1 - n, x1, t, b); else this._clearPix(x0, x0 + n, t, b);
  }

  _ttxScrollV(l, b, r, t, up) {
    const map = this.ttxMap;
    const full = l === 0 && r === 39;
    if (up) {
      for (let y = t; y < b; y++) for (let x = l; x <= r; x++) map[y * 40 + x] = map[(y + 1) * 40 + x];
      for (let x = l; x <= r; x++) map[b * 40 + x] = 32;
    } else {
      for (let y = b; y > t; y--) for (let x = l; x <= r; x++) map[y * 40 + x] = map[(y - 1) * 40 + x];
      for (let x = l; x <= r; x++) map[t * 40 + x] = 32;
    }
    if (full && b > t) { // move the rendered rows too, then only repaint where needed
      const W = this.W, RM = 10;
      for (const bank of [this.ttxBank0, this.ttxBank1]) {
        if (up) bank.copyWithin(t * RM * W, (t + 1) * RM * W, (b + 1) * RM * W);
        else bank.copyWithin((t + 1) * RM * W, t * RM * W, b * RM * W);
      }
      const D = this.ttxDoubles, B = this.ttxBottom, S = this.ttxState;
      if (up) { D.copyWithin(t, t + 1, b + 1); B.copyWithin(t, t + 1, b + 1); S.copyWithin(t * 41, (t + 1) * 41, (b + 1) * 41); D[b] = 0; }
      else { D.copyWithin(t + 1, t, b); B.copyWithin(t + 1, t, b); S.copyWithin((t + 1) * 41, t * 41, b * 41); D[t] = 0; }
      this._dirtyRows(t * RM, (b + 1) * RM - 1);
      if (up) { ttxRefresh(this, t, b - 1, true); ttxRefresh(this, b, b); }
      else { ttxRefresh(this, t, t); ttxRefresh(this, t + 1, b, true); }
    } else ttxRefresh(this, t, b);
  }
  _ttxScrollH(l, b, r, t, left) {
    const map = this.ttxMap;
    for (let y = t; y <= b; y++) {
      if (left) { for (let x = l; x < r; x++) map[y * 40 + x] = map[y * 40 + x + 1]; map[y * 40 + r] = 32; }
      else { for (let x = r; x > l; x--) map[y * 40 + x] = map[y * 40 + x - 1]; map[y * 40 + l] = 32; }
    }
    ttxRefresh(this, t, b);
  }

  // ScrollUp / ScrollDown: soft scroll of the window if windowing, else hard scroll of the screen
  _scrollUp() { this._scrollUpBox(...(this.windowing ? this._windowBox() : this._screenBox())); }
  _scrollDown() { this._scrollDownBox(...(this.windowing ? this._windowBox() : this._screenBox())); }

  // Scroll012 (VDU 23,7,m,d,z)
  _scroll012(m, dir, z) {
    dir &= 7;
    if (dir >= 4) {
      let w = dir >= 6 ? 0x10103322 : 0x33221010;
      w >>>= (this.cursorFlags & 0xE) * 2;
      dir = (w & 0xF) ^ (dir & 1);
    }
    const box = m ? this._screenBox() : this._windowBox();
    switch (dir) {
      case 0: this._scrollHBox(...box, false, !!z); break;
      case 1: this._scrollHBox(...box, true, !!z); break;
      case 2: if (m) this._scrollDownBox(...box); else this._scrollDown(); break;
      case 3: if (m) this._scrollUpBox(...box); else this._scrollUp(); break;
    }
  }

  // =============================================================================================
  // Character output

  _printChar(c) {
    if (this.vdu5) {
      this._vdu5Char(this.font, c * 8, this.fgOE);
      if (!(this.cursorFlags & 32)) this._vdu5HT(this._dir);
      return;
    }
    if (this.c81) this._rcrlf();
    if (this.teletext) {
      ttxPutChar(this, this.cy, this.cx, ttxSwapIn(c));
    } else this._paintCell(this.cx, this.cy, this.font, c * 8);
    if (!(this.cursorFlags & 32)) this._cht();
  }

  // Delete (VDU 127)
  _delete() {
    if (!(this.cursorFlags & 32)) this._bs();
    if (this.vdu5) { this._vdu5Char(this.font, 127 * 8, this.bgStore, true); return; }
    if (this.teletext) { ttxPutChar(this, this.cy, this.cx, 32); return; }
    this._paintCell(this.cx, this.cy, ZERO8, 0);
  }

  // =============================================================================================
  // VDU 5 (vdu5): characters at the graphics cursor

  _vdu5Char(glyph, off, oe, hard = false) {
    if (hard) { glyph = SYSTEM_FONT; off = 127 * 8; }
    if (oe.nop) return;
    const sx = this.gCharSizeX, sy = this.gCharSizeY, left = this.gcsIX, top = this.gcsIY;
    for (let j = 0; j < sy; j++) {
      const y = top - j;
      if (y > this.gwt || y < this.gwb) continue;
      const fr = sy === 8 ? j : sy === 16 ? j >> 1 : Math.floor(j * 8 / sy);
      const bits = glyph[off + fr];
      if (!bits) continue;
      for (let i = 0; i < sx; i++) {
        const x = left + i;
        if (x < this.gwl || x > this.gwr) continue;
        const fc = sx === 8 ? i : Math.floor(i * 8 / sx);
        if (bits & (0x80 >> fc)) this._pixOE(x, y, oe);
      }
    }
  }

  // GCursorMove: returns true if OK (C=0)
  _gMove(dir) {
    const was = this._inWindow(this.gcsIX, this.gcsIY);
    switch (dir & 0xE) {
      case 0: case 4: this.gcsIX += this.gCharSpaceX; break;
      case 2: case 6: this.gcsIX -= this.gCharSpaceX; break;
      case 8: case 10: this.gcsIY -= this.gCharSpaceY; break;
      default: this.gcsIY += this.gCharSpaceY; break;
    }
    if (!was) return true;
    if (this.cursorFlags & 0x40) return true;
    return this._inWindow(this.gcsIX, this.gcsIY);
  }
  // GCursorBdy
  _gBdy(dir, n) {
    switch (dir & 0xE) {
      case 0: case 4: this.gcsIX = this.gwl + n * this.gCharSpaceX; break;
      case 2: case 6: this.gcsIX = this.gwr - n * this.gCharSpaceX - (this.gCharSizeX - 1); break;
      case 8: case 10: this.gcsIY = this.gwt - n * this.gCharSpaceY; break;
      default: this.gcsIY = this.gwb + n * this.gCharSpaceY + (this.gCharSizeY - 1); break;
    }
  }
  _gB0(dir) { this._gBdy(dir, 0); }
  // Vdu5HT (dir = direction to move in)
  _vdu5HT(dir) {
    if (!this._gMove(dir)) { this._gB0(dir); this._vdu5LF(dir ^ 8, true); return; }
    this._ieg();
  }
  // Vdu5HT10: dir = the "down" direction
  _vdu5LF(dir) {
    if (!this._gMove(dir)) this._gB0(dir);
    this._ieg();
  }
  _vdu5Tab(x, y) {
    const d = this._dir;
    this._gBdy(d, x);
    this._gBdy(d ^ 8, y);
    this._ieg();
  }

  // CLG (VDU 16)
  _clg() {
    if (this.nonGraphic) return;
    this.gcolAdr = this.bgOE;
    this.rectFill(this.gwl, this.gwb, this.gwr, this.gwt);
  }

  // =============================================================================================
  // Text cursor shape (vducursoft)

  _progReg10(v) {
    this.reg10 = v;
    const b = v & 0x60;
    if (b < 0x40) { this.curFlashing = false; this.curOn = !(b & 0x20); }
    else { this.curFlashing = true; this.curOn = true; this.curSpeed = (b & 0x20) ? 320 : 160; }
    let start = v & 0x1F;
    if (this.teletext) start >>= 1;
    if (this.dblVert) start <<= 1;
    if (start > this.rowMult) start = this.rowMult;
    this.cursorStart = start;
  }
  _reg11(v) {
    let e = (this.teletext ? v >> 1 : v) + 1;
    if (this.dblVert) e <<= 1;
    if (e > this.rowMult) e = this.rowMult;
    this.cursorEnd = e;
  }
  // CursorOnOff (VDU 23,1,n)
  _cursorOnOff(n) {
    if (n < 1) { this._progReg10(0x20); return; }
    if (n === 1) { this._progReg10(this.reg10Copy); return; }
    let r = this.reg10Copy;
    if (n === 2) r &= ~0x60; else r |= 0x60;
    this.reg10Copy = r;
    this._progReg10(r);
  }

  // =============================================================================================
  // The VDU byte stream

  /** OS_WriteC: send one byte to the VDU drivers */
  writeC(b) {
    b &= 255;
    this._cursorT0 = nowMs(); // cursor forced to its "mark" state after output
    if (this.qNeed > 0) {
      this.q[this.qPos++] = b;
      if (--this.qNeed > 0) return;
      if (this.disabled) return; // VDU 1 would still print; printing not emulated
      this._exec(this.qCode);
      return;
    }
    if (b >= 32 && b !== 127) {
      if (!this.disabled) this._printChar(b);
      return;
    }
    if (b < 32 && QLEN[b]) { this.qCode = b; this.qNeed = QLEN[b]; this.qPos = 0; return; }
    if (this.split && b === 13) { this.split = false; this._cursorOnOff(1); }
    if (this.disabled) { if (b === 6) this.disabled = false; return; }
    this._exec(b);
  }

  /** write a string (char codes 0-255) or array of bytes */
  write(data) {
    if (typeof data === 'string') for (let i = 0; i < data.length; i++) this.writeC(data.charCodeAt(i));
    else for (let i = 0; i < data.length; i++) this.writeC(data[i]);
  }
  newLine() { this.writeC(10); this.writeC(13); }

  _exec(code) {
    const q = this.q;
    switch (code) {
      case 0: case 1: case 6: case 27: break;
      case 2: this.vdu2 = true; break;
      case 3: this.vdu2 = false; break;
      case 4: // EOT
        if (this.nonGraphic) break;
        this._cursorOnOff(1); this.vdu5 = false; break;
      case 5: // ENQ
        if (this.nonGraphic) break;
        this._progReg10(0x20); this.vdu5 = true; break;
      case 7: if (this.onBell) this.onBell(); break;
      case 8: this._bs(); break;
      case 9: this._ht(); break;
      case 10: this._lf(); break;
      case 11: this._vt(); break;
      case 12: this._ff(); break;
      case 13: this._cr(); break;
      case 14: this.pageMode = true; break;
      case 15: this.pageMode = false; break;
      case 16: this._clg(); break;
      case 17: this._tcol(q[0]); break;
      case 18: this._gcol(q[0], q[1]); break;
      case 19: this._vdu19(q[0], q[1], q[2], q[3], q[4]); break;
      case 20: // VDU20
        if (!this.teletext) { this._palInit(); this._defaultColours(); }
        break;
      case 21: this.disabled = true; break;
      case 22: this._setMode(q[0]); break;
      case 23: this._vdu23(); break;
      case 24: this._can(s16(q[0], q[1]), s16(q[2], q[3]), s16(q[4], q[5]), s16(q[6], q[7])); break;
      case 25: this.plot(q[0], s16(q[1], q[2]), s16(q[3], q[4])); break;
      case 26: this._defaultWindows(); break;
      case 28: this._fs(q[0], q[1], q[2], q[3]); break;
      case 29: this.orgX = s16(q[0], q[1]); this.orgY = s16(q[2], q[3]); this._ieg(); break;
      case 30: this._home(); break;
      case 31: this._tab(q[0], q[1]); break;
      case 127: this._delete(); break;
    }
  }

  // DC1 / TCOL: COLOUR c
  _tcol(c) {
    if (this.teletext) return;
    const v = c & this.nColour & 63;
    if (c >= 128) { if (v !== this.tBackCol) { this.tBackCol = v; this._compileTextBg(); } }
    else if (v !== this.tForeCol) { this.tForeCol = v; this._compileTextFg(); }
  }

  // DC2 / GCol: GCOL a,c
  _gcol(a, c) {
    const col = c & this.nColour;
    if (c & 0x80) { this.gplbmd = a; this.gbcol = col; } else { this.gplfmd = a; this.gfcol = col; }
    this._setColour();
  }

  // CAN: VDU 24 graphics window
  _can(l, b, r, t) {
    const L = (l + this.orgX) >> this.xEig, B = (b + this.orgY) >> this.yEig;
    const R = (r + this.orgX) >> this.xEig, T = (t + this.orgY) >> this.yEig;
    if (R >= L && T >= B && L >= 0 && B >= 0 && this.yWL >= T && this.xWL >= R) {
      this.gwl = L; this.gwb = B; this.gwr = R; this.gwt = T;
    }
  }

  // FS: VDU 28 text window
  _fs(l, b, r, t) {
    this.windowing = true;
    if (!(r >= l && this.m.scrRCol >= r && b >= t && this.m.scrBRow >= b)) return;
    this.twl = l; this.twb = b; this.twr = r; this.twt = t;
    if (this.split && !(this.ix >= l && this.ix <= r && this.iy >= t && this.iy <= b)) {
      const sx = this.cx, sy = this.cy;
      this._homeVdu4(); this.ix = this.cx; this.iy = this.cy;
      this.cx = sx; this.cy = sy;
    }
    if (!(this.cx >= l && this.cx <= r && this.cy >= t && this.cy <= b)) this._homeVdu4();
  }

  // =============================================================================================
  // PLOT (EM / PLOT in vduplot)

  /** PLOT k,x,y (also the OS_Plot SWI) */
  plot(k, x, y) {
    k &= 255;
    if (this.nonGraphic) return;
    if (!(k & 4)) { x += this.gcsX; y += this.gcsY; }
    this.gcsX = x | 0; this.gcsY = y | 0;
    this.newX = (x + this.orgX) >> this.xEig;
    this.newY = (y + this.orgY) >> this.yEig;
    this.gcolAdr = [this.NOEFFECT, this.fgOE, this.INVERT, this.bgOE][k & 3];
    switch (k >> 3) {
      case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7: this.lineDraw(k); break;
      case 8: this.plotPoint(this.newX, this.newY); break;
      case 9: this.fillLR(this.bgDelim, true); break;              // 72  L&R non-background
      case 10: this.triangleFill(); break;                           // 80
      case 11: this.fillRightOnly(this.bgDelim, false); break;      // 88  right to background
      case 12: this.rectFill(this.gcsIX, this.gcsIY, this.newX, this.newY); break; // 96
      case 13: this.fillLR(this.fgDelim, false); break;             // 104 L&R to foreground
      case 14: this.parallelogramFill(); break;                      // 112
      case 15: this.fillRightOnly(this.fgDelim, true); break;       // 120 right to non-foreground
      case 16: this.floodFill(this.bgDelim, true); break;            // 128 flood non-background
      case 17: this.floodFill(this.fgDelim, false); break;           // 136 flood to foreground
      case 18: this.circleOutline(); break;                          // 144
      case 19: this.circleFill(); break;                             // 152
      case 20: this.circleArc(); break;                              // 160
      case 21: this.segmentFill(); break;                            // 168
      case 22: this.sectorFill(); break;                             // 176
      case 23: this.blockCopyMove(k); break;                         // 184
      case 24: this.ellipseOutline(); break;                         // 192
      case 25: this.ellipseFill(); break;                            // 200
      default: break;                                                // 208-255: fonts/sprites/reserved
    }
    // CTidy: NewPt -> ICursor -> OldCs -> OlderCs
    this.olderX = this.oldX; this.olderY = this.oldY;
    this.oldX = this.gcsIX; this.oldY = this.gcsIY;
    this.gcsIX = this.newX; this.gcsIY = this.newY;
  }

  // =============================================================================================
  // VDU 23

  _vdu23() {
    const q = this.q, c = q[0];
    if (c >= 32) { // DefineChar
      for (let i = 0; i < 8; i++) this.font[c * 8 + i] = q[1 + i];
      this._glyphMap = null;
      return;
    }
    switch (c) {
      case 0: { // program "6845"
        const reg = q[1] & 31;
        if (reg < 8 || reg === 8) break;
        if (reg === 10) { this.reg10Copy = q[2]; this._progReg10(q[2]); }
        else if (reg < 12) this._reg11(q[2]);
        break;
      }
      case 1: if (!this.vdu5) this._cursorOnOff(q[1]); break;
      case 2: case 3: case 4: case 5: { // ComplexEcfPattern
        const n = c - 2;
        for (let r = 0; r < 8; r++) {
          const src = q[1 + r];
          let v = src;
          if (this.bbcCompatECF === 0) {
            const tb = InterleaveTB[Math.min(this.log2bpp, 3)];
            v = 0;
            for (let bit = 0; bit < 8; bit++) if (src & tb[bit]) v |= 1 << bit;
          }
          this.ecf[n * 8 + r] = v;
        }
        this._setColour();
        break;
      }
      case 6: for (let i = 0; i < 8; i++) this.dotStyle[i] = q[8 - i]; break;
      case 7: this._scroll012(q[1], q[2], q[3]); break;
      case 8: this._vdu23_8(); break;
      case 9: this.flashMark = q[1]; this._flashT0 = nowMs(); break;
      case 10: this.flashSpace = q[1]; this._flashT0 = nowMs(); break;
      case 11: this._defaultEcfPattern(); break;
      case 12: case 13: case 14: case 15: this._simpleEcf(c - 12); break;
      case 16:
        this.cursorFlags = ((this.cursorFlags & q[2]) ^ q[1]) & 0xFF;
        if (!(this.cursorFlags & 1)) this._rcrlf();
        break;
      case 17: this._vdu23_17(); break;
      default: break; // 18..31: UKVDU23V - ignored
    }
  }

  // SimpleEcfPattern (VDU 23,12..15)
  _simpleEcf(n) {
    const q = this.q, mask = SimpEcfTb[this.m.ecfIndex] ?? 0;
    if (mask === 0xFF) {
      for (let i = 0; i < 8; i++) { const b = q[1 + i]; this.ecf[n * 8 + i] = gcolToPixel((b & 0x3F) | (b & 0xC0)); }
    } else {
      const nc = this.nColour;
      for (let i = 0; i < 4; i++) {
        const a = TBFullCol[nc + (q[1 + 2 * i] & nc)] & mask;
        const b = TBFullCol[nc + (q[2 + 2 * i] & nc)] & ~mask & 0xFF;
        this.ecf[n * 8 + i] = this.ecf[n * 8 + 4 + i] = a | b;
      }
    }
    this._setColour();
  }

  // VDU 23,17,...
  _vdu23_17() {
    const q = this.q, c = q[1];
    if (c > 7) return;
    if (c === 7) { // SetCharSizes
      const x = q[3] | (q[4] << 8), y = q[5] | (q[6] << 8);
      if (q[2] & 2) { this.gCharSizeX = x; this.gCharSizeY = y; }
      if (q[2] & 4) { this.gCharSpaceX = x; this.gCharSpaceY = y; }
      return;
    }
    if (c === 6) { // SetECFOrigin
      const ix = (s16(q[2], q[3]) + this.orgX) >> this.xEig, iy = (s16(q[4], q[5]) + this.orgY) >> this.yEig;
      this.ecfShift = 32 - ((ix & this.ppwMask) << this.log2bpc);
      this.ecfYOffset = (this.yWL + 1 - iy) & 7;
      this._setColour();
      return;
    }
    if (c === 5) { // SwapColours
      let t = this.tForeCol; this.tForeCol = this.tBackCol; this.tBackCol = t;
      t = this.textFg; this.textFg = this.textBg; this.textBg = t;
      if (this.bpp >= 8) { t = this.tfTint; this.tfTint = this.tbTint; this.tbTint = t; }
      return;
    }
    if (c === 4) { this.bbcCompatECF = q[2]; return; }
    const keys = ['tfTint', 'tbTint', 'gfTint', 'gbTint'];
    const old = this[keys[c]];
    this[keys[c]] = q[2];
    if (c >= 2) { this._setColour(); return; }
    if (((old ^ q[2]) & 0xC0) === 0 || this.bpp < 8) return;
    if (c === 0) this._compileTextFg(); else this._compileTextBg();
  }

  // CP80: cursor position in "user" coordinates (taking CursorFlags into account)
  _cp80(x, y) {
    const f = this.cursorFlags;
    const X = (f & 2) ? this.twr - x : x - this.twl;
    const Y = (f & 4) ? this.twb - y : y - this.twt;
    return (f & 8) ? [Y, X] : [X, Y];
  }

  // VDU 23,8,t1,t2,x1,y1,x2,y2: clear a block of text
  _vdu23_8() {
    const q = this.q, f = this.cursorFlags;
    const [cpx, cpy] = this._cp80(this.cx, this.cy);
    // WBotRig
    const wx = this.twr - this.twl, wy = (f & 4) ? 0 : this.twb - this.twt;
    const [bx, by] = (f & 8) ? [wy, wx] : [wx, wy];
    const cbws = [0, 0, cpx + (this.c81 ? 1 : 0), cpy, (bx + 1) & 255, by & 255];
    const start = [0, 0], end = [0, 0];
    const calc = (t, dx, dy, out) => {
      let x = (cbws[(t & 3) << 1] + ((dx << 24) >> 24));
      if (x < 0) x = 0; if (x > cbws[4]) x = cbws[4];
      let y = (cbws[(t >> 1) | 1] + ((dy << 24) >> 24));
      if (y < 0) y = 0; if (y > cbws[5]) y = cbws[5];
      out[0] = x & 255; out[1] = y & 255;
    };
    calc(q[1], q[3], q[4], start);
    calc(q[2], q[5], q[6], end);
    if (end[1] < start[1] || (end[1] === start[1] && end[0] <= start[0])) return;
    const sx = this.cx, sy = this.cy;
    const rowClear = (row, left, endx) => {
      const right = endx - 1;
      if (left > right) return;
      let l, b, r, t;
      if (!(f & 8)) { l = left; b = row; r = right; t = row; } else { l = row; b = right; r = row; t = left; }
      let x0, x1, y0, y1;
      if (!(f & 2)) { x0 = this.twl + l; x1 = this.twl + r; } else { x0 = this.twr - r; x1 = this.twr - l; }
      if (!(f & 4)) { y0 = this.twt + b; y1 = this.twt + t; } else { y0 = this.twb - t; y1 = this.twb - b; }
      this._clearBox(x0, y0, x1, y1);
    };
    let row = start[1], left = start[0];
    while (row !== end[1]) { rowClear(row, left, cbws[4]); row = (row + 1) & 255; left = 0; }
    rowClear(row, left, end[0]);
    this.cx = sx; this.cy = sy;
  }

  // =============================================================================================
  // Queries

  get mode() { return this.modeNo; }

  /** OS_ReadModeVariable (mode defaults to current); undefined for invalid mode/variable */
  modeVar(varNo, mode) {
    const m = (mode === undefined || mode === -1) ? this.m : modeInfo(mode);
    if (!m) return undefined;
    return modeVariable(m, varNo);
  }

  get screenStart() { return SCREEN_END - this.totalScreenSize + this.driverBank * this.m.screenSize; }
  get displayStart() { return SCREEN_END - this.totalScreenSize + this.displayBank * this.m.screenSize; }
  get totalScreenSize() { return this.m.screenSize * this.maxBanks; }

  /**
   * Memory-mapped screen (for Memory.io): {lo, hi, rd8, wr8} over the logical screen addresses
   * (ScreenEndAdr - TotalScreenSize .. ScreenEndAdr), so programs that poke the address returned
   * by OS_ReadVduVariables 148/149 draw on screen. Bytes are packed from the logical pixel arrays
   * with the mode's Log2BPC / Log2BPP (double pixels replicate their value). Teletext reads as 0.
   */
  get screenIO() {
    if (this._screenIO) return this._screenIO;
    const v = this;
    this._screenIO = {
      get lo() { return SCREEN_END - v.totalScreenSize; },
      get hi() { return SCREEN_END; },
      rd8(a) { return v._scrByte(a, -1); },
      wr8(a, b) { v._scrByte(a, b & 255); },
    };
    return this._screenIO;
  }
  /** read (val < 0) or write one byte of screen memory at logical address a */
  _scrByte(a, val) {
    if (this.teletext) return 0;
    const m = this.m, o = a - (SCREEN_END - this.totalScreenSize);
    const bank = Math.floor(o / m.screenSize), bo = o - bank * m.screenSize;
    const row = Math.floor(bo / m.lineLength), col = bo - row * m.lineLength;
    if (row >= this.H || bank >= this.maxBanks) return 0;
    const fb = bank < this.banks.length ? this.banks[bank] : (val < 0 ? null : this._bank(bank));
    if (!fb) return 0;
    const bpc = this.bpc, bpp = this.bpp, pm = this.pixMask, base = row * this.W;
    if (bpc <= 8) {
      const ppb = 8 / bpc, x0 = col * ppb;
      if (x0 >= this.W) return 0;
      if (val < 0) {
        let b = 0;
        for (let i = 0; i < ppb; i++) { const p0 = fb[base + x0 + i]; let p = p0; for (let k = bpp; k < bpc; k += bpp) p |= p0 << k; b |= (p & ((1 << bpc) - 1)) << (i * bpc); }
        return b & 255;
      }
      for (let i = 0; i < ppb; i++) fb[base + x0 + i] = (val >> (i * bpc)) & pm;
    } else {
      // a logical pixel spans several bytes (e.g. MODE 10: 8bpp pixels doubled into 16 bits)
      const bit = col * 8, x = Math.floor(bit / bpc), off = bit % bpc;
      if (x >= this.W) return 0;
      if (val < 0) { const p0 = fb[base + x]; let p = p0; for (let k = bpp; k < bpc; k += bpp) p |= p0 << k; return (p >>> off) & 255; }
      if (off < bpp) fb[base + x] = ((fb[base + x] & ~(255 << off)) | (val << off)) & pm;
    }
    if (bank === this.displayBank) this._dirtyRows(row, row);
    return 0;
  }

  /** OS_ReadVduVariables */
  vduVar(v) {
    if (v >= 0 && v <= 12) return modeVariable(this.m, v);
    if (v === 256 || v === 257) { // WindowWidth / WindowHeight
      let w, h;
      if (!this.vdu5) { w = this.twr - this.twl; h = this.twb - this.twt; }
      else {
        const f = this.cursorFlags;
        w = Math.floor((this.gwr - this.gwl - ((f & 2) ? this.gCharSizeX - 1 : 0)) / this.gCharSpaceX);
        h = Math.floor((this.gwt - this.gwb - ((f & 4) ? this.gCharSizeY - 1 : 0)) / this.gCharSpaceY);
      }
      if (this.cursorFlags & 8) { const t = w; w = h; h = t; }
      if (!this.vdu5 && (this.cursorFlags & 1)) w++;
      return v === 256 ? w : h;
    }
    const tab = [
      this.gwl, this.gwb, this.gwr, this.gwt, this.twl, this.twb, this.twr, this.twt,
      this.orgX, this.orgY, this.gcsX, this.gcsY, this.olderX, this.olderY, this.oldX, this.oldY,
      this.gcsIX, this.gcsIY, this.newX, this.newY, this.screenStart, this.displayStart, this.totalScreenSize,
      this.gplfmd, this.gplbmd, this.gfcol, this.gbcol, this.tForeCol, this.tBackCol,
      this.gfTint, this.gbTint, this.tfTint, this.tbTint, MAX_MODE,
      this.gCharSizeX, this.gCharSizeY, this.gCharSpaceX, this.gCharSpaceY, 0,
      8, this.tCharSizeY, 8, this.rowMult, 0, 24000,
    ];
    if (v >= 128 && v < 128 + tab.length) return tab[v - 128];
    return 0;
  }

  /** text cursor column relative to the text window (POS, OS_Byte 134) */
  get pos() { return this._cp80(this.cx, this.cy)[0] + (this.c81 ? 1 : 0); }
  /** text cursor row relative to the text window (VPOS) */
  get vpos() { return this._cp80(this.cx, this.cy)[1]; }

  /** input cursor position if cursors are split (OS_Byte 134 reads the input cursor then) */
  inputCursorPos() {
    if (!this.split) return { x: this.pos, y: this.vpos };
    const [x, y] = this._cp80(this.ix, this.iy);
    return { x, y };
  }

  _glyphKey(g, off) {
    return (((g[off] << 24) | (g[off + 1] << 16) | (g[off + 2] << 8) | g[off + 3]) >>> 0) * 4294967296 +
      (((g[off + 4] << 24) | (g[off + 5] << 16) | (g[off + 6] << 8) | g[off + 7]) >>> 0);
  }
  _glyphs() {
    if (!this._glyphMap) {
      const map = new Map();
      for (let c = 255; c >= 32; c--) if (c !== 127) map.set(this._glyphKey(this.font, c * 8), c);
      this._glyphMap = map;
    }
    return this._glyphMap;
  }
  /** read the 8 glyph rows of a text cell, with 'bg' as background */
  _cellBits(col, row, bg, out) {
    const W = this.W, fb = this.fb, rep = this.dblVert ? 2 : 1;
    let p = row * this.rowMult * W + col * 8;
    for (let r = 0; r < 8; r++, p += W * rep) {
      let b = 0;
      for (let x = 0; x < 8; x++) if (fb[p + x] !== bg) b |= 0x80 >> x;
      out[r] = b;
    }
    return out;
  }

  /** OS_Byte 135: character at the text cursor (0 if unrecognised) and the screen mode */
  readCharAtCursor() {
    const col = this.split ? this.ix : this.cx, row = this.split ? this.iy : this.cy;
    let ch = 0;
    if (this.teletext) ch = ttxSwapOut(this.ttxMap[row * 40 + col]);
    else ch = this._glyphs().get(this._glyphKey(this._cellBits(col, row, this.textBg, CELL8), 0)) ?? 0;
    return { char: ch, mode: this.modeNo };
  }

  /** screen scrape: one string per text row, recognising glyphs (unrecognised cells -> '?') */
  textLines() {
    const lines = [];
    const rows = this.m.scrBRow + 1, cols = this.m.scrRCol + 1;
    if (this.teletext) {
      for (let r = 0; r < 25; r++) {
        let s = '';
        for (let c = 0; c < 40; c++) {
          const c7 = this.ttxMap[r * 40 + c] & 0x7F; // top-bit set chars display as 7-bit ones
          s += c7 < 32 ? ' ' : String.fromCharCode(ttxSwapOut(c7));
        }
        lines.push(s);
      }
      return lines;
    }
    const map = this._glyphs(), W = this.W, fb = this.fb;
    for (let r = 0; r < rows; r++) {
      let s = '';
      for (let c = 0; c < cols; c++) {
        // candidate backgrounds: current text background, then values present in the cell
        const p0 = r * this.rowMult * W + c * 8;
        const counts = new Map();
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const v = fb[p0 + y * W * (this.dblVert ? 2 : 1) + x];
          counts.set(v, (counts.get(v) || 0) + 1);
        }
        if (counts.size === 1) { s += ' '; continue; }
        const cands = [this.textBg, ...[...counts.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0])];
        let ch = -1;
        for (const bg of cands) {
          if (!counts.has(bg)) continue;
          const k = this._glyphKey(this._cellBits(c, r, bg, CELL8), 0);
          const m = map.get(k);
          if (m !== undefined) { ch = m; break; }
        }
        s += ch < 0 ? '?' : String.fromCharCode(ch);
      }
      lines.push(s);
    }
    return lines;
  }

  /** OS_ReadPoint: x,y in external coords -> {colour, tint, offScreen} */
  readPoint(x, y) {
    if (this.nonGraphic) return { colour: -1, tint: 0, offScreen: true };
    const ix = (x + this.orgX) >> this.xEig, iy = (y + this.orgY) >> this.yEig;
    if (!this._inWindow(ix, iy)) return { colour: -1, tint: 0, offScreen: true };
    const p = this.fb[(this.yWL - iy) * this.W + ix];
    if (this.nColour === 63) { const { colour, tint } = pixelToGcol(p); return { colour, tint, offScreen: false }; }
    return { colour: p & (this.nColour === 255 ? 255 : this.nColour), tint: 0, offScreen: false };
  }

  /** OS_Word 10: read character definition (2..5 = ECF patterns, 6 = dot pattern) */
  osWordReadCharDef(c) {
    c &= 255;
    if (c >= 32) return this.font.slice(c * 8, c * 8 + 8);
    if (c >= 2 && c <= 5) return this.ecf.slice((c - 2) * 8, (c - 2) * 8 + 8);
    if (c === 6) return this.dotStyle.slice();
    return new Uint8Array(8);
  }

  /** OS_Word 13: graphics cursors in external coordinates */
  graphicsCursors() {
    const w = (v) => (v << 16) >> 16;
    return {
      oldX: w((this.oldX << this.xEig) - this.orgX), oldY: w((this.oldY << this.yEig) - this.orgY),
      curX: w(this.gcsX), curY: w(this.gcsY),
    };
  }

  /** OS_Byte 117 */
  vduStatus() {
    return (this.vdu2 ? 1 : 0) | (this.pageMode ? 4 : 0) | (this.windowing ? 8 : 0) |
      (this.vdu5 ? 0x20 : 0) | (this.split ? 0x40 : 0) | (this.disabled ? 0x80 : 0);
  }

  /** abandon any partial VDU sequence (e.g. when BASIC reports an error) */
  flushQueue() { this.qNeed = 0; }

  /** OS_Byte 218: number of bytes still expected by the VDU queue (0 = not queueing) */
  get queueLength() { return this.qNeed; }
  /** the raw OS_Byte 218 value (negative count as a byte, 0 when empty) */
  get queueByte() { return (256 - this.qNeed) & 255; }

  /** OS_Byte 9/10 */
  setFlashPeriods(mark, space) {
    if (mark !== undefined) this.flashMark = mark & 255;
    if (space !== undefined) this.flashSpace = space & 255;
    this._flashT0 = nowMs();
  }

  /** OS_Byte 112: select VDU driver screen bank (1..n, 0 = default) */
  setDriverBank(n) {
    if (n === 0) n = 1;
    if (n < 1 || n > this.maxBanks || this.teletext) return;
    this.driverBank = n - 1; this.fb = this._bank(n - 1);
  }
  /** OS_Byte 113: select displayed screen bank */
  setDisplayBank(n) {
    if (n === 0) n = 1;
    if (n < 1 || n > this.maxBanks || this.teletext) return;
    this._bank(n - 1);
    this.displayBank = n - 1; this._dirtyAll();
  }
  _bank(i) {
    while (this.banks.length <= i) this.banks.push(new Uint8Array(this.W * this.H));
    return this.banks[i];
  }

  /**
   * Cursor editing (OS_Byte 4 cursor keys): code &87 = COPY, &88 left, &89 right, &8A down, &8B up.
   * Returns the character copied for COPY (or -1 if nothing / invalid), else -1.
   */
  cursorEdit(code) {
    if (code === 0x87) {
      if (!this.split || this.vdu5) { if (this.onBell) this.onBell(); return -1; }
      const ch = this.readCharAtCursor().char;
      if (!ch) { if (this.onBell) this.onBell(); return -1; }
      if (this.qNeed === 0) { if (!this._cursorMove(this._dir, true)) { this._cursorB0Input(); } }
      return ch;
    }
    if (this.qNeed || this.vdu5) return -1;
    if (!this.split) {
      this._progReg10(this.reg10Copy & 0xDF);
      this.ix = this.cx; this.iy = this.cy; this.split = true;
    }
    switch (code) {
      case 0x88: if (--this.ix < this.twl) { this.ix = this.twr; if (--this.iy < this.twt) this.iy = this.twb; } break;
      case 0x89: if (++this.ix > this.twr) { this.ix = this.twl; if (++this.iy > this.twb) this.iy = this.twt; } break;
      case 0x8A: if (++this.iy > this.twb) this.iy = this.twt; break;
      case 0x8B: if (--this.iy < this.twt) this.iy = this.twb; break;
    }
    return -1;
  }
  _cursorB0Input() {
    this._cursorBdy(this._dir, 0, true);
    if (!this._cursorMove(this._dir ^ 8, true)) this._cursorBdy(this._dir ^ 8, 0, true);
  }

  /** OS_Byte 20 / 25: reset the soft font from the ROM font. group 0 = chars 32..255, n = n*32..n*32+31 */
  resetFont(group = 0) {
    const [a, b] = group === 0 ? [32, 256] : [group * 32, group * 32 + 32];
    this.font.set(SYSTEM_FONT.subarray(a * 8, b * 8), a * 8);
    this._glyphMap = null;
  }

  /** OS_Byte 163,242,n: dot-dash line pattern length (0 = default pattern and length 8) */
  setDotPatternLength(n) {
    if (n === 0) this._defaultLineStyle();
    else { this.dotLineLength = Math.min(64, n); this.lineDot.cnt = 0; }
  }

  /** OS_SetECFOrigin (external coordinates) */
  setEcfOrigin(x, y) {
    const q = this.q.slice();
    this.q.set([17, 6, ...[x & 255, (x >> 8) & 255, y & 255, (y >> 8) & 255]]);
    this._vdu23_17();
    this.q.set(q);
  }

  /** reset: like a soft reset - MODE to current mode with default cursor flags */
  reset() {
    this.qNeed = 0; this.disabled = false; this.cursorFlags = 0; this.c81 = false; this.vdu2 = false;
    this._setMode(this.modeNo);
  }

  // =============================================================================================
  // Pixels & rendering

  get width() { return this.W; }
  get height() { return this.H; }
  get displayWidth() { return ((this.xWL + 1) << this.xEig) / 2; }
  get displayHeight() { return ((this.yWL + 1) << this.yEig) / 2; }
  get canvas() { return this._canvas; }

  _displayFb(now) {
    if (this.teletext) return this._ttxPhase(now) ? this.ttxBank1 : this.ttxBank0;
    return this.banks[this.displayBank];
  }

  /** physical pixel (0,0 = top-left) -> pixel value (logical colour) */
  getPixel(px, py) {
    if (px < 0 || py < 0 || px >= this.W || py >= this.H) return -1;
    return (this.teletext ? this.ttxBank0 : this.banks[this.displayBank])[py * this.W + px];
  }
  /** physical pixel -> [r,g,b] using the current palette (flash state 1) */
  getPixelRGB(px, py) {
    const v = this.getPixel(px, py);
    if (v < 0) return [0, 0, 0];
    const c = this.pal1[v];
    return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  }

  _flashState(now) {
    const mark = this.flashMark * 20, space = this.flashSpace * 20;
    if (!mark && !space) return 1;
    if (!mark) return 2;
    if (!space) return 1;
    return ((now - this._flashT0) % (mark + space)) < mark ? 1 : 2;
  }
  _ttxPhase(now) { return ((now - this._ttxT0) % 1280) < 320 ? 1 : 0; }

  /** list of cursor rectangles currently visible: [x, y, w, h] in pixels */
  _cursorRects(now) {
    const out = [];
    if (this.split) { // solid output cursor
      const RM = this.rowMult;
      out.push([this.cx * 8, this.cy * RM, 8, this.tCharSizeY]);
    }
    if (this.vdu5 && !this.split) return out;
    let on = this.curOn;
    if (this.curFlashing) on = Math.floor((now - this._cursorT0) / this.curSpeed) % 2 === 0;
    if (!on || this.cursorStart >= this.cursorEnd) return out;
    const x = this.split ? this.ix : this.cx, y = this.split ? this.iy : this.cy;
    if (x < 0 || x > this.m.scrRCol || y < 0 || y > this.m.scrBRow) return out;
    out.push([x * 8, y * this.rowMult + this.cursorStart, 8, this.cursorEnd - this.cursorStart]);
    return out;
  }

  _setupCanvas() {
    const cv = this._canvas;
    if (!cv) return;
    cv.width = this.W; cv.height = this.H;
    if (cv.style) {
      cv.style.width = this.displayWidth + 'px';
      cv.style.height = this.displayHeight + 'px';
      cv.style.imageRendering = 'pixelated';
    }
    this._ctx = cv.getContext('2d');
    this._img = this._ctx.createImageData(this.W, this.H);
    this._img32 = new Uint32Array(this._img.data.buffer);
    this._shown.cursor = '';
  }

  _buildLuts() {
    const mk = (pal, lut) => {
      for (let i = 0; i < 256; i++) {
        const c = pal[i];
        lut[i] = (0xFF000000 | ((c & 0xFF) << 16) | (c & 0xFF00) | ((c >> 16) & 0xFF)) >>> 0;
      }
    };
    mk(this.pal1, this._lut1); mk(this.pal2, this._lut2);
    let diff = false;
    for (let i = 0; i < 256; i++) if (this.pal1[i] !== this.pal2[i]) { diff = true; break; }
    this._palFlashes = diff;
    this._palDirty = false;
  }

  /** Push the framebuffer to the canvas (cheap when nothing changed). Draws the text cursor. */
  render() {
    const now = nowMs();
    if (this._palDirty) this._buildLuts();
    const fs = this._palFlashes ? this._flashState(now) : 1;
    if (fs !== this._shown.flash) { this._shown.flash = fs; this._dirtyAll(); }
    const bank = this.teletext ? this._ttxPhase(now) : -1;
    if (bank !== this._shown.bank) { this._shown.bank = bank; this._dirtyAll(); }
    const rects = this._cursorRects(now);
    const key = rects.map((r) => r.join(',')).join(';');
    if (key !== this._shown.cursor) {
      for (const s of [this._shown.cursor, key]) {
        if (!s) continue;
        for (const r of s.split(';')) { const [, y, , h] = r.split(',').map(Number); this._dirtyRows(y, y + h - 1); }
      }
      this._shown.cursor = key;
    }
    if (this.dMax < this.dMin) return;
    let y0 = Math.max(0, this.dMin), y1 = Math.min(this.H - 1, this.dMax);
    this.dMin = 1e9; this.dMax = -1;
    if (!this._ctx) return;
    const src = this._displayFb(now), out = this._img32, W = this.W;
    const lut = fs === 1 ? this._lut1 : this._lut2;
    for (let i = y0 * W, e = (y1 + 1) * W; i < e; i++) out[i] = lut[src[i]];
    for (const [x, y, w, h] of rects) {
      const fill = this.cursorFill;
      for (let yy = Math.max(y, y0); yy < Math.min(y + h, y1 + 1); yy++) {
        for (let xx = x; xx < x + w && xx < W; xx++) out[yy * W + xx] = lut[src[yy * W + xx] ^ fill];
      }
    }
    this._ctx.putImageData(this._img, 0, 0, 0, y0, W, y1 - y0 + 1);
  }

  _startAutoRender() {
    const tick = () => { this.render(); schedule(); };
    const schedule = typeof requestAnimationFrame !== 'undefined'
      ? () => requestAnimationFrame(tick) : () => setTimeout(tick, 20);
    schedule();
  }
}

const ZERO8 = new Uint8Array(8);
const CELL8 = new Uint8Array(8);

Object.assign(VDU.prototype, graphicsMethods);
