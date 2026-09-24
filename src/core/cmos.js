// The CMOS RAM (OS_Byte 161 / 162): a 240-byte image (locations &00-&EF, &EF = checksum) laid out as
// RISC OS 3.71 has it (Sources/HdrSrc/hdr/CMOS), persisted in localStorage like the other settings.
//
// Locations the emulated desktop honours are views of os.config (src/core/config.js): reading one
// returns the current setting, writing one changes the setting (saved and applied, as the Wimp,
// SoundDMA, the Font manager... read their CMOS). Everything else is plain storage, initialised as
// the kernel's "Delete-power-on" table (s/NewReset DefaultCMOSTable) does.
//
//   import { cmos } from './cmos.js';
//   cmos.read(0xC5)          // WimpFlags
//   cmos.write(0x8C, v)      // DesktopFeatures: 3D bit, desktop font, textured windows off (bit 7)
//   cmos.image()             // Uint8Array(240) with the checksum filled in
//   cmos.reset()             // factory settings (the config keys mapped here, and the image)
//
// *ResetCMOS (reset.js) clears every 'riscos371.*' key, so it resets this image too.

import { config } from './config.js';

const KEY = 'riscos371.cmos';
export const CMOS_SIZE = 240;
export const CHECKSUM = 0xEF;

// DefaultCMOSTable (Kernel s/NewReset, RISC OS 3.71): the non-zero bytes after a Delete-power-on.
const DEFAULTS = [
  [0x0C, 32], [0x05, 8], [0x86, 16], [0x0E, 10], [0x0D, 8], [0x0A, 0x10], [0x01, 254], [0x03, 235],
  [0x0F, (3 << 2) | (1 << 5)], [0x10, (1 << 4) | (4 << 5)], [0x0B, 4 | (2 << 3) | (1 << 6)], [0x89, 1],
  [0x94, 0xF0], [0xB9, 10], [0x80, 97], [0x81, 19], [0x84, 0b0100], [0x11, 1 << 1], [0xC6, 0b01000000],
  [0xC5, 0b01101111], [0xC1, 0b01110110], [0xC2, 2], [0x1C, 3], [0x8C, 1 | (8 << 1)],
  [0xC3, (1 << 2) | (1 << 4) | (1 << 6)], [0xC8, 64], [0xCA, 0x28], [0xCB, 0x3C], [0xDC, 0b00010000],
  [0xEE, 0xEA], [0x8A, 0x60],
  // WimpDoubleClickMove/AutoMenuDelay, drag time/move, double-click time as the Wimp defaults them
  [0x16, 32], [0x17, 0], [0xDD, 5], [0xDE, 16], [0xDF, 10],
];

// ---------------------------------------------------------------------------------- config views
const pages = (k) => ({ get: (v) => (v[k] == null ? null : Math.min(255, Math.round(v[k] / 4))), set: (b, v) => { v[k] = b * 4; } });
const byteKey = (k, signed = false) => ({ get: (v) => (v[k] == null ? null : v[k] & 255), set: (b, v) => { v[k] = signed && b > 127 ? b - 256 : b; } });
const ROM_APPS = ['Alarm', 'Calc', 'Chars', 'Configure', 'Draw', 'Edit', 'Help', 'Paint', 'BatMgr'];
const VIEWS = {
  0x0C: byteKey('keyDelay'),
  0x0D: byteKey('keyRepeat'),
  0x0E: byteKey('printerIgnoreChar'),
  0x16: byteKey('doubleClickMove'),
  0x1D: byteKey('mouseType'),
  0xC2: byteKey('mouseStep', true),
  0xC5: byteKey('wimpFlags'),
  0xDD: byteKey('dragDelay'),
  0xDE: byteKey('dragMove'),
  0xDF: byteKey('doubleClickDelay'),
  0x86: pages('memFontCache'),
  0xC8: pages('memFontMax'),
  0x8F: pages('memScreen'),
  0x90: pages('memRAMDisc'),
  0x91: pages('memHeap'),
  0x92: pages('memRMA'),
  0x93: pages('memSprites'),
  // DBTBCMOS bit 1: loud beep
  0x10: { get: (v, b) => (v.beepLoud == null ? null : (b & ~2) | (v.beepLoud ? 2 : 0)), set: (b, v) => { v.beepLoud = !!(b & 2); } },
  // SoundCMOS: bits 0-3 channel 1 voice - 1, bits 4-6 volume, bit 7 speaker
  0x94: {
    get: (v, b) => ((((v.voice ?? ((b & 15) + 1)) - 1) & 15) | (((v.volume ?? ((b >> 4) & 7)) & 7) << 4) | ((v.speaker ?? !!(b & 128)) ? 128 : 0)),
    set: (b, v) => { v.voice = (b & 15) + 1; v.volume = (b >> 4) & 7; v.speaker = !!(b & 128); },
  },
  // DesktopFeaturesCMOS: bit 0 3D look, bits 1-4 desktop font (1 = system font, 8 = Homerton.Medium), bit 7 plain (untextured) windows
  0x8C: {
    get: (v, b) => {
      let x = b;
      if (v.textured != null) x = (x & ~0x80) | (v.textured ? 0 : 0x80);
      if (v.wimpFont != null) { const f = v.wimpFont === 'system' ? 1 : v.wimpFont === 'homerton' ? 8 : ((b >> 1) & 15) || 8; x = (x & ~0x1E) | (f << 1); }
      return x;
    },
    set: (b, v) => {
      v.textured = !(b & 0x80);
      const f = (b >> 1) & 15;
      if (f === 1) v.wimpFont = 'system';
      else if (f === 8 || !/^[a-z]+\.[a-z.]+$/i.test(v.wimpFont ?? '')) v.wimpFont = 'homerton';
    },
  },
  // DeskbootCMOS / Deskboot2CMOS: ROM applications started with the desktop
  0xD7: { get: (v, b) => (v.romApps ? ROM_APPS.slice(0, 8).reduce((x, n, i) => x | (v.romApps[n] ? 1 << i : 0), 0) : null), set: (b, v) => { v.romApps = { ...(v.romApps ?? {}) }; ROM_APPS.slice(0, 8).forEach((n, i) => { v.romApps[n] = !!(b & (1 << i)); }); } },
  0xD8: { get: (v, b) => (v.romApps ? (b & ~1) | (v.romApps.BatMgr ? 1 : 0) : null), set: (b, v) => { v.romApps = { ...(v.romApps ?? {}), BatMgr: !!(b & 1) }; } },
};

// ---------------------------------------------------------------------------------- the image
function factoryImage() {
  const img = new Uint8Array(CMOS_SIZE);
  for (const [a, v] of DEFAULTS) img[a] = v & 255;
  return img;
}

let store = null;
function load() {
  if (store) return store;
  store = factoryImage();
  try {
    const hex = localStorage.getItem(KEY);
    if (hex && /^[0-9a-f]+$/i.test(hex)) for (let i = 0; i < Math.min(CMOS_SIZE, hex.length >> 1); i++) store[i] = parseInt(hex.substr(i * 2, 2), 16);
  } catch { /* storage blocked */ }
  return store;
}
function save() {
  try { localStorage.setItem(KEY, [...load()].map((b) => b.toString(16).padStart(2, '0')).join('')); } catch { /* */ }
}

let applyQueued = false;
function queueApply() {
  if (applyQueued) return;
  applyQueued = true;
  setTimeout(() => { applyQueued = false; config.save(); try { config.apply(); } catch (e) { console.warn('CMOS: config.apply', e); } }, 0);
}

function checksum(img) {
  let s = 1;                                           // CMOSxseed
  for (let i = 0; i < CHECKSUM; i++) s += img[i];
  return s & 255;
}

export const cmos = {
  /** OS_Byte 161: read a location (0-255; locations above &EF are the clock chip's: 0). */
  read(addr) {
    addr &= 255;
    const img = load();
    if (addr === CHECKSUM) return checksum(this.image());
    if (addr >= CMOS_SIZE) return 0;
    const view = VIEWS[addr];
    if (view) { const v = view.get(config.values, img[addr]); if (v != null) return v & 255; }
    return img[addr];
  },
  /** OS_Byte 162: write a location. The checksum is maintained by the "kernel" (writes to &EF are ignored). */
  write(addr, value) {
    addr &= 255; value &= 255;
    if (addr >= CHECKSUM) return;
    const img = load();
    img[addr] = value;
    save();
    const view = VIEWS[addr];
    if (view) { view.set(value, config.values); queueApply(); }
  },
  /** A snapshot of the whole CMOS (as OS_Byte 161 reads it), checksum included. */
  image() {
    const img = new Uint8Array(load());
    for (const a of Object.keys(VIEWS)) img[+a] = this.readNoSum(+a);
    img[CHECKSUM] = checksum(img);
    return img;
  },
  readNoSum(addr) { const view = VIEWS[addr]; const b = load()[addr]; if (view) { const v = view.get(config.values, b); if (v != null) return v & 255; } return b; },
  /** Load a whole image (e.g. a file saved by !SaveCMOS), as OS_Byte 162 for locations 1-&EE would. */
  loadImage(bytes) { for (let a = 1; a < Math.min(CHECKSUM, bytes.length); a++) this.write(a, bytes[a]); },
  /** Factory settings: the Delete-power-on image, and the config keys it covers. */
  reset() {
    store = factoryImage(); save();
    for (const [a, view] of Object.entries(VIEWS)) view.set(store[+a], config.values);
    queueApply();
  },
  get mapped() { return Object.keys(VIEWS).map(Number); },
};
