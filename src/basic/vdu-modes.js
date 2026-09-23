// RISC OS 3.71 screen mode table.
// Transcribed from vendor/ro371/Sources/OS_Core/Kernel/s/vdu/vdumodes (VW_0 .. VW_49, macro VWSTAB).
// Column order of VWSTAB: BaseMode, ScreenSize, LineLength, XWindLimit, YWindLimit, YShftFactor,
//                         XEigFactor, YEigFactor, NColour, ScrRCol, ScrBRow, Log2BPC, Log2BPP,
//                         PalIndex, ECFIndex, ModeFlags

export const Flag_NonGraphic = 1;
export const Flag_Teletext = 2;
export const Flag_GapMode = 4;
export const Flag_BBCGapMode = 8;
export const Flag_HiResMono = 16;
export const Flag_DoubleVertical = 32;

const K = 1024;
const M23S = 1152 * 896 / 8, M25S = 640 * 480 / 8, M31S = 800 * 600 / 8, M37S = 896 * 352 / 8;
const M41S = 640 * 352 / 8, M44S = 640 * 200 / 8, M47S = 360 * 480 / 8;
const NG = Flag_NonGraphic, GAP = Flag_GapMode, BBC = Flag_BBCGapMode, TTX = Flag_Teletext;

// [ScreenSize, LineLength, XWindLimit, YWindLimit, YShftFactor, XEig, YEig, NColour, ScrRCol, ScrBRow,
//  Log2BPC, Log2BPP, PalIndex, ECFIndex, ModeFlags]
const T = [
  /* 0*/ [20 * K, 80, 639, 255, 4, 1, 2, 1, 79, 31, 0, 0, 0, 1, 0],
  /* 1*/ [20 * K, 80, 319, 255, 4, 2, 2, 3, 39, 31, 1, 1, 1, 2, 0],
  /* 2*/ [40 * K, 160, 159, 255, 5, 3, 2, 15, 19, 31, 3, 2, 2, 3, 0],
  /* 3*/ [40 * K, 160, 639, 249, 5, 1, 2, 1, 79, 24, 1, 1, 0, 0, NG + GAP + BBC],
  /* 4*/ [20 * K, 80, 319, 255, 4, 2, 2, 1, 39, 31, 1, 0, 0, 4, 0],
  /* 5*/ [20 * K, 80, 159, 255, 4, 3, 2, 3, 19, 31, 2, 1, 1, 2, 0],
  /* 6*/ [20 * K, 80, 319, 249, 4, 2, 2, 1, 39, 24, 1, 1, 0, 0, NG + GAP + BBC],
  /* 7*/ [80 * K, 160, 319, 249, 5, 2, 2, 15, 39, 24, 2, 2, 4, 0, NG + GAP + TTX],
  /* 8*/ [40 * K, 160, 639, 255, 5, 1, 2, 3, 79, 31, 1, 1, 1, 2, 0],
  /* 9*/ [40 * K, 160, 319, 255, 5, 2, 2, 15, 39, 31, 2, 2, 2, 3, 0],
  /*10*/ [80 * K, 320, 159, 255, 6, 3, 2, 63, 19, 31, 4, 3, 3, 5, 0],
  /*11*/ [40 * K, 160, 639, 249, 5, 1, 2, 3, 79, 24, 1, 1, 1, 2, GAP],
  /*12*/ [80 * K, 320, 639, 255, 6, 1, 2, 15, 79, 31, 2, 2, 2, 3, 0],
  /*13*/ [80 * K, 320, 319, 255, 6, 2, 2, 63, 39, 31, 3, 3, 3, 5, 0],
  /*14*/ [80 * K, 320, 639, 249, 6, 1, 2, 15, 79, 24, 2, 2, 2, 3, GAP],
  /*15*/ [160 * K, 640, 639, 255, 7, 1, 2, 63, 79, 31, 3, 3, 3, 5, 0],
  /*16*/ [132 * K, 528, 1055, 255, 0, 1, 2, 15, 131, 31, 2, 2, 2, 3, 0],
  /*17*/ [132 * K, 528, 1055, 249, 0, 1, 2, 15, 131, 24, 2, 2, 2, 3, GAP],
  /*18*/ [40 * K, 80, 639, 511, 4, 1, 1, 1, 79, 63, 0, 0, 0, 4, 0],
  /*19*/ [80 * K, 160, 639, 511, 5, 1, 1, 3, 79, 63, 1, 1, 1, 2, 0],
  /*20*/ [160 * K, 320, 639, 511, 6, 1, 1, 15, 79, 63, 2, 2, 2, 3, 0],
  /*21*/ [320 * K, 640, 639, 511, 7, 1, 1, 63, 79, 63, 3, 3, 3, 5, 0],
  /*22*/ [108 * K, 384, 767, 287, 0, 0, 1, 15, 95, 35, 2, 2, 2, 3, 0],
  /*23*/ [M23S, 144, 1151, 895, 0, 1, 1, 1, 143, 55, 0, 0, 5, 4, Flag_HiResMono + Flag_DoubleVertical],
  /*24*/ [264 * K, 1056, 1055, 255, 0, 1, 2, 63, 131, 31, 3, 3, 3, 5, 0],
  /*25*/ [M25S, 80, 639, 479, 4, 1, 1, 1, 79, 59, 0, 0, 0, 4, 0],
  /*26*/ [M25S * 2, 160, 639, 479, 5, 1, 1, 3, 79, 59, 1, 1, 1, 2, 0],
  /*27*/ [M25S * 4, 320, 639, 479, 6, 1, 1, 15, 79, 59, 2, 2, 2, 3, 0],
  /*28*/ [M25S * 8, 640, 639, 479, 7, 1, 1, 63, 79, 59, 3, 3, 3, 5, 0],
  /*29*/ [M31S, 100, 799, 599, 0, 1, 1, 1, 99, 74, 0, 0, 0, 4, 0],
  /*30*/ [M31S * 2, 200, 799, 599, 0, 1, 1, 3, 99, 74, 1, 1, 1, 2, 0],
  /*31*/ [M31S * 4, 400, 799, 599, 0, 1, 1, 15, 99, 74, 2, 2, 2, 3, 0],
  /*32*/ [M31S * 8, 800, 799, 599, 0, 1, 1, 63, 99, 74, 3, 3, 3, 5, 0],
  /*33*/ [27 * K, 96, 767, 287, 0, 1, 2, 1, 95, 35, 0, 0, 0, 4, 0],
  /*34*/ [54 * K, 192, 767, 287, 0, 1, 2, 3, 95, 35, 1, 1, 1, 2, 0],
  /*35*/ [108 * K, 384, 767, 287, 0, 1, 2, 15, 95, 35, 2, 2, 2, 3, 0],
  /*36*/ [216 * K, 768, 767, 287, 0, 1, 2, 63, 95, 35, 3, 3, 3, 5, 0],
  /*37*/ [M37S, 112, 895, 351, 0, 1, 2, 1, 111, 43, 0, 0, 0, 4, 0],
  /*38*/ [M37S * 2, 224, 895, 351, 0, 1, 2, 3, 111, 43, 1, 1, 1, 2, 0],
  /*39*/ [M37S * 4, 448, 895, 351, 0, 1, 2, 15, 111, 43, 2, 2, 2, 3, 0],
  /*40*/ [M37S * 8, 896, 895, 351, 0, 1, 2, 63, 111, 43, 3, 3, 3, 5, 0],
  /*41*/ [M41S, 80, 639, 351, 0, 1, 2, 1, 79, 43, 0, 0, 0, 4, 0],
  /*42*/ [M41S * 2, 160, 639, 351, 0, 1, 2, 3, 79, 43, 1, 1, 1, 2, 0],
  /*43*/ [M41S * 4, 320, 639, 351, 0, 1, 2, 15, 79, 43, 2, 2, 2, 3, 0],
  /*44*/ [M44S, 80, 639, 199, 0, 1, 2, 1, 79, 24, 0, 0, 0, 4, 0],
  /*45*/ [M44S * 2, 160, 639, 199, 0, 1, 2, 3, 79, 24, 1, 1, 1, 2, 0],
  /*46*/ [M44S * 4, 320, 639, 199, 0, 1, 2, 15, 79, 24, 2, 2, 2, 3, 0],
  /*47*/ [M47S * 8, 360, 359, 479, 0, 2, 2, 63, 89, 59, 3, 3, 3, 5, 0],
  /*48*/ [75 * K, 160, 319, 479, 0, 2, 1, 15, 39, 59, 2, 2, 2, 3, 0],
  /*49*/ [150 * K, 320, 319, 479, 0, 2, 1, 63, 39, 59, 3, 3, 3, 5, 0],
];

export const NUM_MODES = 50;
export const MAX_MODE = NUM_MODES - 1;

/** Mode descriptor for mode number n (0..49, shadow bit ignored), or undefined. */
export function modeInfo(n) {
  n = n & 0x7F;
  const t = T[n];
  if (!t) return undefined;
  return {
    num: n,
    screenSize: t[0], lineLength: t[1], xWindLimit: t[2], yWindLimit: t[3], yShftFactor: t[4],
    xEig: t[5], yEig: t[6], nColour: t[7], scrRCol: t[8], scrBRow: t[9],
    log2bpc: t[10], log2bpp: t[11], palIndex: t[12], ecfIndex: t[13], flags: t[14],
  };
}

/**
 * OS_ReadModeVariable variables 0..12 for a descriptor.
 * 0 ModeFlags, 1 ScrRCol, 2 ScrBRow, 3 NColour, 4 XEigFactor, 5 YEigFactor, 6 LineLength,
 * 7 ScreenSize, 8 YShftFactor, 9 Log2BPP, 10 Log2BPC, 11 XWindLimit, 12 YWindLimit
 */
export function modeVariable(m, v) {
  switch (v) {
    case 0: return m.flags;
    case 1: return m.scrRCol;
    case 2: return m.scrBRow;
    case 3: return m.nColour;
    case 4: return m.xEig;
    case 5: return m.yEig;
    case 6: return m.lineLength;
    case 7: return m.screenSize;
    case 8: return m.yShftFactor;
    case 9: return m.log2bpp;
    case 10: return m.log2bpc;
    case 11: return m.xWindLimit;
    case 12: return m.yWindLimit;
  }
  return undefined;
}

/**
 * Mode actually selected by MODE n on a multisync monitor (MonitorType 1), as FindOKMode does
 * (vduswis): BigVIDCTable for monitor type 1 knows every mode 0..49 except 23; unknown modes are
 * substituted by bpp from SubstType01 (0, 8, 12, 15). Returns -1 for modes that don't exist.
 */
export function selectableMode(n) {
  n = n & 0x7F;
  const m = modeInfo(n);
  if (!m) return -1;
  if (n === 23) return [0, 8, 12, 15][m.log2bpp] ?? 0;
  return n;
}
