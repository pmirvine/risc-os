// A ColourPicker dialogue (the RISC OS 3.5+ ColourPicker module, RGB model), built from the
// module's own templates (Picker: the dialogue; Picker-RGB: the RGB model pane, whose icons are
// merged into the dialogue at the same work-area coordinates). Paint uses it for the colours of
// 32K / 16M colour sprites (a "toolbox" picker next to the sprite window) and for Edit palette.

import { wimp } from '../../core/wimp.js';
import { startPointerDrag, input } from '../../core/input.js';
import { WIMP_RGB, cssRGB } from './colours.js';

// icon numbers in Picker-RGB
const R = { zwell: 0, xywell: 2, xtrack: 6, xknob: 7, ytrack: 8, yknob: 9, ztrack: 11, zknob: 12,
  redPc: 14, redUp: 15, redSlice: 16, redDown: 17, greenSlice: 18, greenPc: 19, greenUp: 20, greenDown: 21,
  bluePc: 22, blueUp: 23, blueDown: 24, blueSlice: 45 };
const SWATCHES = [13, 26, 27, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43];
const SKIP = new Set([1, 3, 5, 25, 44, 10]);
// icon numbers in Picker
const P = { patch: 0, rgb: 1, none: 2, place: 3, cmyk: 5, hsv: 6, cancel: 8, ok: 9 };

export class Picker {
  /**
   * opts: {title, rgb:[r,g,b], transparent, offerTransparent, toolbox, menu, x, y,
   *        onChange(rgb, transparent), onChoose(rgb, transparent), onClose()}
   */
  constructor(A, opts) {
    this.A = A;
    this.o = opts;
    this.rgb = (opts.rgb ?? [0, 0, 0]).slice();
    this.trans = !!opts.transparent;
    this.slice = 0;          // 0 red, 1 green, 2 blue is the Z axis
    const [pt, rt] = A.pickerTpl;
    const w = this.win = A.task.createWindowFromTemplate(pt, 'Picker', { title: opts.title ?? 'Colour picker' });
    this.pi = w.icons.slice();
    // the RGB pane's icons, at the same work area coordinates
    const pane = rt.windows.rgb;
    this.ri = [];
    pane.icons.forEach((ic, i) => {
      if (SKIP.has(i) || ic.bbox.y0 < -1000) { this.ri[i] = null; return; }
      const b = ic.bbox;
      this.ri[i] = w.addIcon({ bbox: { x0: b.x0 / 2, y0: -b.y1 / 2, x1: b.x1 / 2, y1: -b.y0 / 2 }, flags: ic.flags >>> 0, text: ic.text, validation: (ic.validation ?? '').replace(/(^|;)N[^;]*/g, '').replace(/^;/, '') || undefined, sprite: ic.sprite, bufLen: ic.bufLen ?? 8 });
    });
    this.pi[P.cmyk]?.setState({ shaded: true });
    this.pi[P.hsv]?.setState({ shaded: true });
    this.pi[P.rgb]?.setState({ selected: true });
    this.pi[P.none]?.setState({ selected: this.trans, shaded: !opts.offerTransparent });
    this.ri[R.redSlice]?.setState({ selected: true });
    for (const i of SWATCHES) this.ri[i]?.setText('');
    w.useCanvas((g) => this.paint(g), { fill: false });
    w.on('click', (ev) => this.click(ev));
    w.on('drag', (ev) => this.drag(ev));
    w.on('key', (ev) => this.key(ev));
    w.on('close', (ev) => { ev.preventDefault(); this.close(); });
    w.helpText = A.msgs.DBOXTCOL;
    this.update();
    if (opts.menu) {
      w.on('menuclosed', () => setTimeout(() => { if (!w._menuDbox) this.close(); }, 0));
    } else {
      w.open({ x: opts.x ?? w.x, y: opts.y ?? w.y, behind: 'top' });
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.win.delete();
    this.o.onClose?.();
  }

  set(rgb, trans) {
    if (rgb) this.rgb = rgb.slice();
    this.trans = !!trans;
    this.pi[P.none]?.setState({ selected: this.trans });
    this.update();
  }
  setOffersTransparent(on) {
    this.o.offerTransparent = on;
    if (!on) this.trans = false;
    this.pi[P.none]?.setState({ shaded: !on, selected: this.trans });
  }

  // ------------------------------------------------------------------ display
  axes() {
    // [x, y, z] channel indices: Z is the slice; X/Y follow the ColourPicker's RGB layout
    return [[2, 1, 0], [2, 0, 1], [1, 0, 2]][this.slice];
  }
  bb(i) { return this.ri[i]?.bbox; }

  update() {
    const I = this.ri;
    const pc = (v) => (v * 100 / 255).toFixed(1);
    I[R.redPc]?.setText(pc(this.rgb[0])); I[R.greenPc]?.setText(pc(this.rgb[1])); I[R.bluePc]?.setText(pc(this.rgb[2]));
    const [ax, ay, az] = this.axes();
    const knobColour = [11, 10, 8];
    // X knob grows from the left of its track, Y and Z knobs up from the bottom
    const xt = this.bb(R.xtrack), yt = this.bb(R.ytrack), zt = this.bb(R.ztrack);
    if (xt) { I[R.xknob].moveTo({ ...xt, x1: xt.x0 + Math.max(1, Math.round((xt.x1 - xt.x0) * this.rgb[ax] / 255)) }); setBg(I[R.xknob], knobColour[ax]); }
    if (yt) { I[R.yknob].moveTo({ ...yt, y0: yt.y1 - Math.max(1, Math.round((yt.y1 - yt.y0) * this.rgb[ay] / 255)) }); setBg(I[R.yknob], knobColour[ay]); }
    if (zt) { I[R.zknob].moveTo({ ...zt, y0: zt.y1 - Math.max(1, Math.round((zt.y1 - zt.y0) * this.rgb[az] / 255)) }); setBg(I[R.zknob], knobColour[az]); }
    this.win.invalidate();
  }

  paint(g) {
    const [ax, ay, az] = this.axes();
    // XY well: X and Y channels at the current Z value
    const xy = this.bb(R.xywell);
    if (xy) {
      const x0 = xy.x0 + 2, y0 = xy.y0 + 2, W = xy.x1 - xy.x0 - 4, H = xy.y1 - xy.y0 - 4;
      const id = g.createImageData(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = [0, 0, 0];
        c[ax] = Math.round(x * 255 / (W - 1)); c[ay] = Math.round((H - 1 - y) * 255 / (H - 1)); c[az] = this.rgb[az];
        const i = (y * W + x) * 4;
        id.data[i] = c[0]; id.data[i + 1] = c[1]; id.data[i + 2] = c[2]; id.data[i + 3] = 255;
      }
      g.putImageData(id, x0 - this.win.scrollX, y0 - this.win.scrollY);
      // cross-hair at the current colour
      const cx = x0 + this.rgb[ax] * (W - 1) / 255, cy = y0 + (255 - this.rgb[ay]) * (H - 1) / 255;
      g.fillStyle = this.rgb[ax] + this.rgb[ay] > 300 ? '#000' : '#fff';
      g.fillRect(Math.round(cx) - 4, Math.round(cy), 9, 1); g.fillRect(Math.round(cx), Math.round(cy) - 4, 1, 9);
    }
    const zw = this.bb(R.zwell);
    if (zw) {
      const x0 = zw.x0 + 2, y0 = zw.y0 + 2, W = zw.x1 - zw.x0 - 4, H = zw.y1 - zw.y0 - 4;
      for (let y = 0; y < H; y++) {
        const c = this.rgb.slice();
        c[az] = Math.round((H - 1 - y) * 255 / (H - 1));
        g.fillStyle = cssRGB(c);
        g.fillRect(x0, y0 + y, W, 1);
      }
    }
    for (let k = 0; k < 16; k++) { const b = this.bb(SWATCHES[k]); if (b) { g.fillStyle = cssRGB(WIMP_RGB[k]); g.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); } }
    const p = this.pi[P.patch]?.bbox;
    if (p) {
      if (this.trans) { g.fillStyle = '#ffffff'; g.fillRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0); g.fillStyle = '#000'; for (let y = p.y0; y < p.y1; y += 2) g.fillRect(p.x0, y, p.x1 - p.x0, 1); }
      else { g.fillStyle = cssRGB(this.rgb); g.fillRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0); }
    }
  }

  changed() {
    this.update();
    this.o.onChange?.(this.rgb.slice(), this.trans);
  }

  // ------------------------------------------------------------------ input
  hitWell(ev) {
    const [ax, ay, az] = this.axes();
    const xy = this.bb(R.xywell), zw = this.bb(R.zwell), zt = this.bb(R.ztrack), xt = this.bb(R.xtrack), yt = this.bb(R.ytrack);
    const inb = (b, x, y) => b && x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1;
    const f = (v, a, b) => Math.max(0, Math.min(255, Math.round((v - a) * 255 / Math.max(1, b - a - 1))));
    if (inb(xy, ev.x, ev.y)) return (x, y) => { this.rgb[ax] = f(x, xy.x0 + 2, xy.x1 - 2); this.rgb[ay] = 255 - f(y, xy.y0 + 2, xy.y1 - 2); };
    if (inb(zw, ev.x, ev.y) || inb(zt, ev.x, ev.y)) { const b = inb(zw, ev.x, ev.y) ? zw : zt; return (x, y) => { this.rgb[az] = 255 - f(y, b.y0 + 2, b.y1 - 2); }; }
    if (inb(xt, ev.x, ev.y)) return (x) => { this.rgb[ax] = f(x, xt.x0, xt.x1); };
    if (inb(yt, ev.x, ev.y)) return (x, y) => { this.rgb[ay] = 255 - f(y, yt.y0, yt.y1); };
    return null;
  }

  click(ev) {
    if (ev.button === 'menu') return true;
    const i = this.ri.indexOf(ev.icon), j = this.pi.indexOf(ev.icon);
    const set = this.hitWell(ev);
    if (set) { set(ev.x, ev.y); this.trans = false; this.pi[P.none]?.setState({ selected: false }); this.changed(); return true; }
    const k = SWATCHES.indexOf(i);
    if (k >= 0) { this.rgb = WIMP_RGB[k].slice(); this.trans = false; this.pi[P.none]?.setState({ selected: false }); this.changed(); return true; }
    const adj = ev.button === 'adjust';
    const step = (c, up) => { this.rgb[c] = Math.max(0, Math.min(255, this.rgb[c] + ((up !== adj) ? 3 : -3))); this.changed(); };
    if (i === R.redUp) step(0, true); else if (i === R.redDown) step(0, false);
    else if (i === R.greenUp) step(1, true); else if (i === R.greenDown) step(1, false);
    else if (i === R.blueUp) step(2, true); else if (i === R.blueDown) step(2, false);
    else if (i === R.redSlice || i === R.greenSlice || i === R.blueSlice) {
      this.slice = i === R.redSlice ? 0 : i === R.greenSlice ? 1 : 2;
      for (const s of [R.redSlice, R.greenSlice, R.blueSlice]) this.ri[s]?.setState({ selected: s === i });
      this.update();
    }
    if (j === P.none) { this.trans = this.pi[P.none].selected; this.changed(); }
    else if (j === P.ok) { this.o.onChoose?.(this.rgb.slice(), this.trans); if (!adj && !this.o.toolbox) { if (this.o.menu) wimp.menus.close(); else this.close(); } }
    else if (j === P.cancel) { if (this.o.menu) wimp.menus.close(); else this.close(); }
    else if (j === P.rgb) this.pi[P.rgb].setState({ selected: true });
    return true;
  }

  drag(ev) {
    const set = this.hitWell(ev);
    if (!set) return false;
    const w = this.win;
    startPointerDrag(ev.pointerEvent ?? {}, {
      onMove: (q) => { const p = w.screenToWork(q.x, q.y); set(p.x, p.y); this.trans = false; this.changed(); },
    });
    void input;
    return true;
  }

  key(ev) {
    const I = this.ri;
    const rd = (ic) => Math.max(0, Math.min(255, Math.round(parseFloat(ic?.text ?? '0') * 255 / 100) || 0));
    this.rgb = [rd(I[R.redPc]), rd(I[R.greenPc]), rd(I[R.bluePc])];
    if (ev.code === 13) {
      this.changed();
      this.o.onChoose?.(this.rgb.slice(), this.trans);
      if (!this.o.toolbox) { if (this.o.menu) wimp.menus.close(); else this.close(); }
      return true;
    }
    if (ev.code === 27) { if (this.o.menu) wimp.menus.close(); else this.close(); return true; }
    return false;
  }
}

function setBg(icon, c) {
  if (!icon) return;
  icon.flags = ((icon.flags & 0x0FFFFFFF) | ((c & 15) << 28)) >>> 0;
  icon.render();
}
