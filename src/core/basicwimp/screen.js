// The "screen" a BASIC Wimp task draws on, and the per-window canvases its redraws end up in.
//
// On RISC OS a task's redraw loop (Wimp_RedrawWindow / Wimp_GetRectangle) draws with ordinary
// VDU calls straight onto the screen, clipped by the Wimp's graphics window. Here each BASIC
// process owns a DesktopVDU: a VDU (src/basic/vdu.js) in a 256-colour mode exactly the size of
// the desktop (1 px = 2 OS units, origin bottom-left), so screen coordinates are the real ones.
// For each redraw rectangle the Wimp bridge sets the VDU graphics window to the rectangle,
// lets the program draw, then copies the pixels into the window's backing store (logical
// pixel values, per window, work-area sized) and paints them on a canvas inside the window's
// work area (behind the icons, which the core draws as DOM). Pixels equal to the "key" (the
// window's background colour, filled by the Wimp before the program draws) stay transparent,
// so the core's window background (e.g. the textured grey) shows through.

import { VDU } from '../../basic/vdu.js';

/** A VDU whose startup mode is a desktop-sized 256-colour mode (like MODE 28 but W x H). */
export class DesktopVDU extends VDU {
  constructor(opts = {}) {
    super({ ...opts, mode: 28 });
    this.desktop = { width: opts.width, height: opts.height };
    this._setMode(this.desktop);
  }
  _setMode(n) {
    if (!(n && typeof n === 'object')) return super._setMode(n);
    // start from MODE 28 (640x480, 256 colours, eig 1,1) and resize it
    super._setMode(28);
    const W = Math.max(8, n.width | 0), H = Math.max(8, n.height | 0);
    this.modeNo = n;
    this.m = { ...this.m, num: -1, xWindLimit: W - 1, yWindLimit: H - 1, scrRCol: (W >> 3) - 1, scrBRow: (H >> 3) - 1, lineLength: W, screenSize: W * H };
    this.W = W; this.H = H; this.xWL = W - 1; this.yWL = H - 1;
    this.banks = [new Uint8Array(W * H), new Uint8Array(W * H)];
    this.fb = this.banks[0];
    this.driverBank = 0; this.displayBank = 0;
    this.ecfYOffset = (this.yWL + 1) & 7;
    this._defaultWindows();
    this._ff();
    this._setupCanvas();
    this._dirtyAll();
    return true;
  }
  get mode() { return typeof this.modeNo === 'object' ? 28 : this.modeNo; }
  get isDesktopMode() { return typeof this.modeNo === 'object'; }
  /** Pixel value in the current palette nearest to rgb (0xRRGGBB). */
  nearest(rgb) {
    const r = (rgb >> 16) & 255, g = (rgb >> 8) & 255, b = rgb & 255;
    this._near ??= new Map();
    const hit = this._near.get(rgb);
    if (hit !== undefined && !this._palDirtyNear) return hit;
    let best = 0, bd = Infinity;
    const n = this.nColour >= 63 ? 256 : this.nColour + 1;
    for (let i = 0; i < n; i++) {
      const c = this.pal1[i];
      const dr = ((c >> 16) & 255) - r, dg = ((c >> 8) & 255) - g, db = (c & 255) - b;
      const d = dr * dr * 3 + dg * dg * 4 + db * db * 2;
      if (d < bd) { bd = d; best = i; if (!d) break; }
    }
    this._near.set(rgb, best);
    return best;
  }
}

const WIMP_RGB = [0xFFFFFF, 0xDDDDDD, 0xBBBBBB, 0x999999, 0x777777, 0x555555, 0x333333, 0x000000,
  0x004499, 0xEEEE00, 0x00CC00, 0xDD0000, 0xEEEEBB, 0x558800, 0xFFBB00, 0x00BBFF];
export const wimpRGB = (n) => WIMP_RGB[n & 15];

/**
 * Backing store + canvas for one window's program-drawn content, in work-area pixels
 * (x from extent.x0, y from extent.y0 downwards).
 */
export class WindowCanvas {
  constructor(win) {
    this.win = win;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'bw-canvas';
    this.canvas.style.cssText = 'position:absolute;image-rendering:pixelated;pointer-events:none';
    win.work.insertBefore(this.canvas, win.work.firstChild);
    this.W = 0; this.H = 0; this.x0 = 0; this.y0 = 0;
    this.pix = null;           // Uint8Array logical pixels
    this.mask = null;          // Uint8Array 1 = drawn (opaque)
    this.resize();
  }
  resize() {
    const e = this.win.extent;
    const W = Math.max(1, Math.min(8192, e.x1 - e.x0)), H = Math.max(1, Math.min(8192, e.y1 - e.y0));
    if (W === this.W && H === this.H && e.x0 === this.x0 && e.y0 === this.y0) return;
    const old = this.pix, oldM = this.mask, oW = this.W, oH = this.H, ox = this.x0, oy = this.y0;
    this.W = W; this.H = H; this.x0 = e.x0; this.y0 = e.y0;
    this.pix = new Uint8Array(W * H);
    this.mask = new Uint8Array(W * H);
    if (old) {
      for (let y = 0; y < oH; y++) {
        const ny = y + oy - this.y0;
        if (ny < 0 || ny >= H) continue;
        for (let x = 0; x < oW; x++) {
          const nx = x + ox - this.x0;
          if (nx < 0 || nx >= W) continue;
          this.pix[ny * W + nx] = old[y * oW + x]; this.mask[ny * W + nx] = oldM[y * oW + x];
        }
      }
    }
    this.canvas.width = W; this.canvas.height = H;
    this.canvas.style.left = this.x0 + 'px'; this.canvas.style.top = this.y0 + 'px';
    this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(W, H);
    this.img32 = new Uint32Array(this.img.data.buffer);
    this.paint(0, 0, W, H, null);
  }

  /** Copy the backing store rectangle (work px) into the VDU framebuffer at screen pixel (sx, sy). */
  toScreen(vdu, wx0, wy0, w, h, sx, sy) {
    const fb = vdu.fb, SW = vdu.W, SH = vdu.H, W = this.W;
    for (let y = 0; y < h; y++) {
      const py = sy + y, ry = wy0 - this.y0 + y;
      if (py < 0 || py >= SH || ry < 0 || ry >= this.H) continue;
      for (let x = 0; x < w; x++) {
        const px = sx + x, rx = wx0 - this.x0 + x;
        if (px < 0 || px >= SW || rx < 0 || rx >= W) continue;
        const i = ry * W + rx;
        fb[py * SW + px] = this.mask[i] ? this.pix[i] : vdu._bwKey;
      }
    }
  }

  /** Copy the screen rectangle back into the backing store; `key` pixels become transparent. */
  fromScreen(vdu, wx0, wy0, w, h, sx, sy, key) {
    const fb = vdu.fb, SW = vdu.W, SH = vdu.H, W = this.W;
    for (let y = 0; y < h; y++) {
      const py = sy + y, ry = wy0 - this.y0 + y;
      if (py < 0 || py >= SH || ry < 0 || ry >= this.H) continue;
      for (let x = 0; x < w; x++) {
        const px = sx + x, rx = wx0 - this.x0 + x;
        if (px < 0 || px >= SW || rx < 0 || rx >= W) continue;
        const v = fb[py * SW + px], i = ry * W + rx;
        this.pix[i] = v; this.mask[i] = v === key ? 0 : 1;
      }
    }
    this.paint(wx0 - this.x0, wy0 - this.y0, w, h, vdu);
  }

  /** Paint a backing-store rectangle (store coords) onto the canvas. */
  paint(x0, y0, w, h, vdu) {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    const x1 = Math.min(this.W, x0 + w), y1 = Math.min(this.H, y0 + h);
    if (x1 <= x0 || y1 <= y0) return;
    const pal = vdu?.pal1, W = this.W, out = this.img32;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * W + x;
        if (!this.mask[i] || !pal) { out[i] = 0; continue; }
        const c = pal[this.pix[i]];
        out[i] = (0xFF000000 | ((c & 0xFF) << 16) | (c & 0xFF00) | ((c >> 16) & 0xFF)) >>> 0;
      }
    }
    this.ctx.putImageData(this.img, 0, 0, x0, y0, x1 - x0, y1 - y0);
  }

  clear() { this.mask.fill(0); this.paint(0, 0, this.W, this.H, null); }
  remove() { this.canvas.remove(); }
}

// ------------------------------------------------------------------ rectangle lists
export const rectEmpty = (r) => r.x1 <= r.x0 || r.y1 <= r.y0;
export const rectAnd = (a, b) => ({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });
/** a minus b -> up to 4 rectangles */
export function rectSub(a, b) {
  const i = rectAnd(a, b);
  if (rectEmpty(i)) return [a];
  const out = [];
  if (a.y0 < i.y0) out.push({ x0: a.x0, y0: a.y0, x1: a.x1, y1: i.y0 });
  if (i.y1 < a.y1) out.push({ x0: a.x0, y0: i.y1, x1: a.x1, y1: a.y1 });
  if (a.x0 < i.x0) out.push({ x0: a.x0, y0: i.y0, x1: i.x0, y1: i.y1 });
  if (i.x1 < a.x1) out.push({ x0: i.x1, y0: i.y0, x1: a.x1, y1: i.y1 });
  return out;
}
/** Add r to a list of disjoint rects (keeps them disjoint; merges when the list grows large). */
export function rectListAdd(list, r) {
  if (rectEmpty(r)) return list;
  let pieces = [r];
  for (const e of list) pieces = pieces.flatMap((p) => rectSub(p, e));
  const out = list.concat(pieces);
  if (out.length > 24) {
    const u = out.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }));
    return [u];
  }
  return out;
}
export function rectListSub(list, r) { return list.flatMap((e) => rectSub(e, r)); }
