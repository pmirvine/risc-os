// Sprite windows (c.SprWindow), colour windows (c.Colours), the sprite menu and its operations
// (c.Menus menus_sprite_maker / menus_sprite_handler), graphical insert/delete of rows/columns.

import { wimp } from '../../core/wimp.js';
import { Menu, colourMenu } from '../../core/menu.js';
import { fonts } from '../../core/fonts.js';
import { wimpColour } from '../../core/palette.js';
import { input } from '../../core/input.js';
import { spriteCanvas, maskPattern, ecfCanvas } from './render.js';
import { rasterise, coverageBox } from './raster.js';
import { nColours, hasTrueColPal, spritePalette, colourRGB, cssRGB, isLight, translation, palWord } from './colours.js';
import * as ops from './ops.js';
import { BLEFT, BRIGHT, BDRAGLEFT, BDRAGRIGHT } from './tools.js';

const MIN_GRID = 4;      // sprwindow_MIN_GRID (screen pixels)

export class SpriteWindows {
  constructor(A) {
    this.A = A;
    this.insdel = null;
    this.lastCell = null;   // menu position (Column, Row)
  }

  /** All sprite windows. */
  all() { return this.A.files.flatMap((f) => f.sprites.flatMap((s) => s.st.windows)); }

  // ------------------------------------------------------------------ geometry helpers
  extent(sw) {
    const s = sw.sprite, z = sw.zoom;
    const w = Math.max(1, Math.floor(((s.w << s.xeig) * z.mul / z.div) / 2));
    const h = Math.max(1, Math.floor(((s.h << s.yeig) * z.mul / z.div) / 2));
    return { w, h };
  }
  /** Screen point -> sprite OS units from the bottom-left (tools_mouse_to_extent_coords). */
  toSprite(sw, sx, sy) {
    const w = sw.win, z = sw.zoom;
    const wx = Math.floor(sx - w.x + w.scrollX), wy = Math.floor(sy - w.y + w.scrollY);
    const eh = w.extent.y1;
    return { x: Math.trunc(wx * 2 * z.div / z.mul), y: Math.trunc((eh - 1 - wy) * 2 * z.div / z.mul) };
  }
  /** Sprite pixel under a screen point, clamped (tools_mouse_to_pixelpos). */
  toPixel(sw, sx, sy) {
    const s = sw.sprite, p = this.toSprite(sw, sx, sy);
    const x = Math.max(0, Math.min(s.w - 1, Math.trunc(p.x / (1 << s.xeig))));
    const y = Math.max(0, Math.min(s.h - 1, Math.trunc(p.y / (1 << s.yeig))));
    return { x, y };
  }

  // ------------------------------------------------------------------ creating / closing
  /** sprwindow_new */
  open(s) {
    const A = this.A;
    const w = A.task.createWindowFromTemplate(A.tpl, 'Sprite', { title: s.name });
    w.flags |= 1 << 12;                 // hot keys (undo)
    w.colours.workBg = 255;
    const sw = { win: w, sprite: s, zoom: { ...A.options.zoom }, gridcol: A.options.grid.show ? A.options.grid.colour : 255, held: null };
    w._paintSW = sw;
    s.st.windows.push(sw);
    const ext = this.extent(sw);
    w.extent = { x0: 0, y0: 0, x1: ext.w, y1: ext.h };
    w.useCanvas((g, r) => this.paint(sw, g, r), { fill: false });
    w.on('click', (ev) => this.click(sw, ev));
    w.on('drag', (ev) => this.drag(sw, ev));
    w.on('pointermove', (ev) => this.move(sw, ev));
    w.on('close', (ev) => { ev.preventDefault(); this.close(sw); });
    w.on('hotkey', (ev) => this.hotkey(ev));
    w.on('key', (ev) => this.hotkey(ev));
    w.on('dataload', (ev) => { this.loadPalette(sw, ev); return true; });
    w.on('datasave', (ev) => { this.receivePalette(sw, ev); return true; });
    w.on('helprequest', (ev) => { ev.text = A.msgs.PntH2; });
    const pos = A.allocatePosition(Math.min(w.h, ext.h));
    w.open({ x: pos.x, y: pos.y, w: Math.min(w.w, ext.w), h: Math.min(w.h, ext.h), behind: 'top', scrollX: 0, scrollY: 0 });
    this.titles(s);
    if (A.options.showColours) this.showColours(s);
    if (A.options.showTools) A.toolWin.display(false);
    return sw;
  }

  /** sprwindow_set_window_titles: "name" or "name n" when there are several views. */
  titles(s) {
    const n = s.st.windows.length;
    for (const sw of s.st.windows) sw.win.setTitle(s.name.slice(0, 12) + (n !== 1 ? ` ${n}` : ''));
    const cw = s.st.colourWin;
    if (cw?.win) { cw.win.setTitle(this.A.msg('PntW7', s.name)); }
  }

  close(sw) {
    const s = sw.sprite, A = this.A;
    this.A.tools.tools[A.currentTool]?.stop?.(s);
    if (this.insdel?.s === s) this.stopInsdel();
    s.st.windows = s.st.windows.filter((q) => q !== sw);
    sw.win.delete();
    if (!s.st.windows.length) this.closeColours(s);
    this.titles(s);
  }

  closeAll(s) { for (const sw of s.st.windows.slice()) this.close(sw); this.closeColours(s); }

  // ------------------------------------------------------------------ redraw
  redisplay(s) { for (const sw of s.st?.windows ?? []) sw.win.invalidate(); }
  redisplayAll() { for (const sw of this.all()) sw.win.invalidate(); }

  /** The sprite's size/palette/mask changed: new extents, colours windows. */
  reshaped(s) {
    for (const sw of s.st.windows) {
      const ext = this.extent(sw);
      sw.win.setExtent({ x0: 0, y0: 0, x1: ext.w, y1: ext.h });
      sw.win.invalidate();
    }
    this.colourExtent(s);
  }

  paint(sw, g, r) {
    const s = sw.sprite, A = this.A, z = sw.zoom;
    const eh = sw.win.extent.y1;
    // background in the grid colour (G-RO-9612); white with no grid
    g.fillStyle = wimpColour(sw.gridcol === 255 ? 0 : sw.gridcol);
    g.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    if (s.bad) return;
    const Ws = ((s.w << s.xeig) * z.mul / z.div) / 2, Hs = ((s.h << s.yeig) * z.mul / z.div) / 2;
    const top = eh - Hs;
    if (s.mask) {
      const pat = maskPattern(g);
      pat.setTransform(new DOMMatrix([1, 0, 0, 1, 0, sw.win.y % 2]));
      g.fillStyle = pat;
      g.fillRect(0, top, Ws, Hs);
    }
    g.imageSmoothingEnabled = false;
    g.drawImage(spriteCanvas(s, A.desktop(s)), 0, top, Ws, Hs);
    // grid
    const pxW = (1 << s.xeig) * z.mul / z.div / 2, pxH = (1 << s.yeig) * z.mul / z.div / 2;
    if (sw.gridcol !== 255 && pxW >= MIN_GRID && pxH >= MIN_GRID) {
      g.fillStyle = wimpColour(sw.gridcol);
      const n0 = Math.max(0, Math.floor(r.x0 / pxW)), n1 = Math.ceil(r.x1 / pxW);
      for (let n = n0; n <= n1; n++) g.fillRect(Math.floor(n * pxW), r.y0, 1, r.y1 - r.y0);
      const m0 = Math.max(0, Math.floor((eh - r.y1) / pxH)), m1 = Math.ceil((eh - r.y0) / pxH);
      for (let m = m0; m <= m1; m++) g.fillRect(r.x0, eh - 1 - Math.floor(m * pxH), r.x1 - r.x0, 1);
    }
    // tool outlines (EORed)
    const eor = this.eor(sw, g);
    if (this.insdel && this.insdel.s === s) this.insdelRedraw(sw, eor);
    else A.tools.tools[A.currentTool]?.redraw(sw, eor);
  }

  /** EOR plotting into the visible area: fn(v, P) plots with the VDU in screen OS units. */
  eor(sw, g) {
    const win = sw.win, z = sw.zoom;
    const W = win.w, H = win.h, eh = win.extent.y1;
    const P = ([x, y]) => [(0 - win.scrollX) * 2 + Math.trunc(x * z.mul / z.div), (win.scrollY + H - eh) * 2 + Math.trunc(y * z.mul / z.div)];
    const invert = (cov) => {
      const b = coverageBox(cov, W, H);
      if (!b) return;
      const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
      const id = g.getImageData(b.x0, b.y0, bw, bh);
      const d = id.data;
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        if (!cov[(b.y0 + y) * W + b.x0 + x]) continue;
        const i = (y * bw + x) * 4;
        d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; d[i + 3] = 255;
      }
      g.putImageData(id, b.x0, b.y0);
    };
    return {
      P,
      plot: (fn) => invert(rasterise(W, H, 1, 1, (v) => fn(v, P))),
      pixels: (fn) => {
        const cov = new Uint8Array(W * H);
        fn((x, y) => { const row = H - 1 - y; if (x >= 0 && x < W && row >= 0 && row < H) cov[row * W + x] = 1; }, P);
        invert(cov);
      },
    };
  }

  // ------------------------------------------------------------------ mouse
  mouse(sw, sx, sy, bbits) { const p = this.toSprite(sw, sx, sy); return { x: p.x, y: p.y, bbits }; }

  click(sw, ev) {
    const A = this.A;
    if (ev.button === 'menu') { this.openMenu(sw, ev); return true; }
    if (this.insdel) { this.insdelClick(sw, ev); return true; }
    const bits = ev.button === 'adjust' ? BRIGHT : BLEFT;
    const tool = A.tools.tools[A.currentTool];
    tool.click(sw, this.mouse(sw, ev.sx, ev.sy, bits));
    this.startHeld(sw, bits);
    return true;
  }

  drag(sw, ev) {
    if (this.insdel) return true;
    const A = this.A;
    const bits = ev.button === 'adjust' ? BDRAGRIGHT : BDRAGLEFT;
    A.tools.tools[A.currentTool].click(sw, this.mouse(sw, ev.startSX ?? ev.sx, ev.startSY ?? ev.sy, bits));
    return true;
  }

  /** Track the pointer while a button is held ("null events" with the button state). */
  startHeld(sw, bits) {
    const A = this.A;
    this.stopHeld();
    const held = this.held = { sw, bits };
    const over = () => { const h = wimp.hitTest(input.mouseX, input.mouseY); return h.window === sw.win && (!h.icon); };
    const tick = () => {
      if (this.held !== held) return;
      if (over()) A.tools.tools[A.currentTool]?.tick?.(sw, this.mouse(sw, input.mouseX, input.mouseY, bits));
      held.raf = requestAnimationFrame(tick);
    };
    held.move = (e) => {
      const p = input.pos(e);
      if (this.held !== held) return;
      const h = wimp.hitTest(p.x, p.y, e);
      if (h.window !== sw.win) return;
      if (this.insdel) return;
      A.tools.tools[A.currentTool]?.null(sw, this.mouse(sw, p.x, p.y, bits));
    };
    held.up = (e) => {
      if (this.held !== held) return;
      this.stopHeld();
      const p = input.pos(e);
      if (!sw.win.isOpen) return;
      A.tools.tools[A.currentTool]?.null(sw, this.mouse(sw, p.x, p.y, 0));
    };
    window.addEventListener('pointermove', held.move, true);
    window.addEventListener('pointerup', held.up, true);
    held.raf = requestAnimationFrame(tick);
  }
  stopHeld() {
    const h = this.held;
    if (!h) return;
    this.held = null;
    window.removeEventListener('pointermove', h.move, true);
    window.removeEventListener('pointerup', h.up, true);
    cancelAnimationFrame(h.raf);
  }

  move(sw, ev) {
    if (this.held) return;
    if (this.insdel) { if (this.insdel.s === sw.sprite) this.insdelNull(sw, ev); return; }
    if (wimp.menus.isOpen && !wimp.menus.levels.some((l) => l.isDbox)) return;
    const A = this.A;
    A.tools.tools[A.currentTool]?.null(sw, this.mouse(sw, ev.sx, ev.sy, 0));
  }

  hotkey(ev) {
    if (ev.code === 26) { this.A.undo(); return true; }
    if (ev.code === 25) { this.A.redo(); return true; }
    return false;
  }

  /** Stop the current tool in every sprite (toolwindow_stop_all_tools). */
  stopAllTools() {
    const A = this.A, t = A.tools.tools[A.currentTool];
    for (const f of A.files) for (const s of f.sprites) t?.stop?.(s);
  }

  // ------------------------------------------------------------------ palette files
  paletteFromBytes(sw, bytes) {
    const A = this.A, s = sw.sprite;
    let entries = 0, old = false;
    switch (bytes.length) {
      case 12: entries = 2; break;
      case 24: entries = 4; break;
      case 60: old = true; entries = 16; break;
      case 96: case 120: entries = 16; break;
      case 1536: entries = 256; break;
      default: A.error('PntE1'); return;
    }
    if (s.mode >>> 0 >= 256 || entries !== 1 << s.bpp) { A.error('PntE1'); return; }
    const words = [];
    for (let i = 0; i < entries; i++) {
      const o = old ? i * 3 : i * 6 + 3;
      words.push(palWord([bytes[o], bytes[o + 1], bytes[o + 2]]));
    }
    A.pushUndo(s);
    ops.setPalette(s, words);
    A.reshaped(s);
  }
  async loadPalette(sw, ev) {
    const A = this.A;
    const f = ev.files?.[0] ?? { path: ev.path, filetype: ev.filetype };
    if (f.filetype !== 0xFED && f.filetype !== -1) { A.error('PntE3', A.task.wimp ? f.path : f.path); return; }
    const bytes = await (await import('../../core/os.js')).os.vfs.readFile(f.path);
    if (bytes.length > 6 * 256) { A.error('PntE1'); return; }
    this.paletteFromBytes(sw, bytes);
  }
  async receivePalette(sw, ev) {
    if (ev.filetype !== 0xFED) { this.A.error('PntE2'); return; }
    const d = await ev.receive();
    this.paletteFromBytes(sw, typeof d === 'string' ? new TextEncoder().encode(d) : new Uint8Array(d));
  }

  // ------------------------------------------------------------------ colour windows (c.Colours)
  cellSize(s) { return s.st.coloursize; }

  entries(s) {
    const nc = nColours(s);
    const ecfs = s.st.ecfs.map((e, i) => (e ? i : -1)).filter((i) => i >= 0);
    return { nc, mask: !!s.mask, ecfs, lim: nc + (s.mask ? 1 : 0) + ecfs.length };
  }

  colourExtentBox(s, title) {
    const { lim } = this.entries(s);
    const cs = this.cellSize(s);
    const across = lim >= 256 ? 16 : 4;
    const down = Math.floor((lim - 1) / across) + 1;
    let w = cs * across;
    const tw = (title.length + 5) * 8;
    if (w < tw) w = tw;
    return { x0: 0, y0: 0, x1: w, y1: cs * down };
  }

  /** colours_create_window */
  showColours(s) {
    const A = this.A;
    const cw = s.st.colourWin;
    if (cw) { cw.win.isOpen ? cw.win.bringToFront() : cw.win.open({ behind: 'top' }); return; }
    if (!s.st.windows.length) return;
    if (nColours(s) > 256) { this.showPicker(s); return; }
    const title = A.msg('PntW7', s.name);
    const win = A.task.createWindowFromTemplate(A.tpl, 'Sprite', { title });
    win.workButton = 3;
    win.minW = 1; win.minH = 1;
    win.colours.workBg = 0;
    const ext = this.colourExtentBox(s, title);
    win.extent = ext;
    const c = s.st.colourWin = { win, s };
    win.useCanvas((g, r) => this.paintColours(s, g, r));
    win.on('click', (ev) => this.clickColours(s, ev));
    win.on('close', (ev) => { ev.preventDefault(); this.closeColours(s); A.options.showColours = false; });
    win.on('helprequest', (ev) => { ev.text = A.msgs.PntH6; });
    // to the right of the sprite window, tops aligned
    const sww = s.st.windows[0].win, o = sww.outline();
    win.open({ x: o.x1 + 1, y: sww.y, w: ext.x1, h: ext.y1, behind: 'top' });
    return c;
  }

  closeColours(s) {
    const c = s.st.colourWin;
    if (!c) return;
    s.st.colourWin = null;
    c.picker ? c.picker.close() : c.win.delete();
  }

  colourExtent(s) {
    const c = s.st.colourWin;
    if (!c) return;
    if (c.picker) { if (nColours(s) <= 256) { this.closeColours(s); this.showColours(s); } else c.picker.update?.(); return; }
    if (nColours(s) > 256) { this.closeColours(s); this.showColours(s); return; }
    const ext = this.colourExtentBox(s, c.win.title);
    c.win.setExtent(ext);
    c.win.invalidate();
  }

  redrawColours(s) { s.st.colourWin?.win?.invalidate?.(); }

  paintColours(s, g, r) {
    const A = this.A;
    const { nc, mask, ecfs, lim } = this.entries(s);
    const cs = this.cellSize(s);
    const across = lim > 21 ? 16 : 4;
    const pal = s.bpp <= 8 ? spritePalette(s, A.desktop(s)) : null;
    g.font = fonts.css;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    for (let i = 0; i < lim; i++) {
      const x = (i % across) * cs, y = Math.floor(i / across) * cs;
      if (x > r.x1 || x + cs < r.x0 || y > r.y1 || y + cs < r.y0) continue;
      let ecf = 0, rgb = null;
      if (i === nc && mask) { g.fillStyle = maskPattern(g); }
      else if (i >= nc) {
        ecf = ecfs[i - nc - (mask ? 1 : 0)] + 1;
        const pat = g.createPattern(ecfCanvas(s, s.st.ecfs[ecf - 1].pat, A.desktop(s)), 'repeat');
        pat.setTransform(new DOMMatrix([1, 0, 0, 1, x, y + cs]));
        g.fillStyle = pat;
      } else { rgb = colourRGB(s, i, A.desktop(s), pal); g.fillStyle = cssRGB(rgb); }
      g.fillRect(x, y, cs, cs);
      const me = ecf ? -ecf : i;
      const sel = s.st.gcol === me;
      g.fillStyle = sel ? '#ffffff' : '#000000';
      g.fillRect(x, y, cs, 1); g.fillRect(x, y + cs - 1, cs, 1); g.fillRect(x, y, 1, cs); g.fillRect(x + cs - 1, y, 1, cs);
      if (sel && cs === 30) {
        const light = rgb ? isLight(rgb) : true;
        g.fillStyle = light ? '#000000' : '#ffffff';
        const label = i < nc ? String(i) : !ecf ? 'T' : `E${ecf}`;
        g.fillText(label, x + cs / 2, y + cs / 2 + 1);
      }
    }
    g.textAlign = 'left';
  }

  clickColours(s, ev) {
    const A = this.A;
    if (ev.button === 'menu') return false;
    const { nc, mask, ecfs } = this.entries(s);
    const cs = this.cellSize(s);
    const ncs = mask ? nc : nc - 1;
    const ncols = ncs + ecfs.length;
    const per = ncols > 20 ? 16 : 4;
    const x = Math.floor(ev.x / cs), y = Math.floor(ev.y / cs);
    if (x >= per) return true;
    let n = y * per + x;
    if (n > ncols) return true;
    if (n > ncs) n = -(ecfs[n - ncs - 1] + 1);
    if (ev.button === 'adjust') s.st.gcol2 = n; else s.st.gcol = n;
    c_redraw(this, s);
    return true;
  }

  // ------------------------------------------------------------------ deep sprites: colour picker
  showPicker(s) {
    const A = this.A;
    const sww = s.st.windows[0]?.win;
    const nc = nColours(s);
    const cur = s.st.gcol === nc ? null : colourRGB(s, s.st.gcol, true);
    const picker = A.dialogs.picker({
      title: A.msg('PntW7', s.name), rgb: cur ?? [0, 0, 0], transparent: s.st.gcol === nc, offerTransparent: !!s.mask,
      toolbox: true, x: sww ? sww.outline().x1 + 1 : 200, y: sww?.y ?? 200,
      onChange: (rgb, trans) => { s.st.gcol = trans ? nColours(s) : A.nearestColourFor(s, rgb); },
      onClose: () => { if (s.st.colourWin?.picker === picker) { s.st.colourWin = null; A.options.showColours = false; } },
    });
    s.st.colourWin = { picker, win: picker.win, s };
  }

  // ------------------------------------------------------------------ the sprite menu
  openMenu(sw, ev) {
    const cell = this.toPixel(sw, ev.sx, ev.sy);
    this.lastCell = { sw, ...cell };
    wimp.menus.openAt(this.menu(sw), ev, { task: this.A.task });
  }

  menu(sw) {
    const A = this.A, s = sw.sprite, H = (k) => A.msgs[k];
    const nc = nColours(s);
    const rotateBuf = A._rotateBuf ??= { value: '0', maxLen: 12, validation: 'A0-9\\-' };
    const scaleBuf = A._scaleBuf ??= { value: '1', maxLen: 12, validation: 'A0-9.eE' };
    const shearBuf = A._shearBuf ??= { value: '0', maxLen: 12, validation: 'A0-9\\-.eE' };
    const factorMenu = (buf, fn) => new Menu(A.msg('PntMJ'), [{ text: '', writable: buf, action: () => fn(buf.value) }]);
    const misc = new Menu(A.msg('PntMK'), [
      { text: 'Info', submenu: () => A.dialogs.progInfo(), help: H('EDIT00') },
      { text: 'Sprite', dotted: true, submenu: () => A.dialogs.spriteInfo(s), help: H('EDIT01') },
      { text: 'Print', submenu: () => A.dialogs.printBox(s), action: () => A.error('PntE9'), help: H('EDIT02') },
    ]);
    const save = new Menu(A.msg('PntMB'), [
      { text: 'Sprite', submenu: () => (s.st.file.sprites.length === 1 ? A.dialogs.saveFileBox(s.st.file) : A.dialogs.saveSpriteBox(s)), help: H('EDIT10') },
      { text: 'Palette', shaded: () => !(s.pal && s.pal.length), submenu: () => A.dialogs.savePaletteBox(s), help: H('EDIT11') },
    ]);
    const paint = new Menu(A.msg('Pnt00'), [
      { text: 'Select ECF', shaded: nc > 256, submenu: () => A.dialogs.selectECF(s), help: H('EDIT20') },
      { text: 'Select colour', dotted: true, action: () => this.selectColourAt(s), help: H('EDIT21') },
      { text: 'Show colours', action: () => { this.showColours(s); A.options.showColours = true; }, help: H('EDIT22') },
      { text: 'Show tools', dotted: true, action: () => { A.toolWin.display(true); A.options.showTools = true; }, help: H('EDIT23') },
      { text: 'Small colours', ticked: () => s.st.coloursize === 15, shaded: nc > 256, action: () => this.toggleSmall(s), help: H('EDIT24') },
      { text: 'Edit palette', shaded: () => !(hasTrueColPal(s) && s.st.gcol >= 0 && s.st.gcol < nc), submenu: () => this.editPalette(s), help: H('EDIT25') },
    ]);
    const edit = new Menu(A.msg('PntME'), [
      { text: 'Flip vertically', action: () => this.op(s, () => ops.flipV(s), false), help: H('EDIT30') },
      { text: 'Flip horizontally', action: () => this.op(s, () => ops.flipH(s), false), help: H('EDIT31') },
      { text: 'Rotate', submenu: new Menu(A.msg('PntMG'), [{ text: '', writable: rotateBuf, action: () => { const n = /^-?\d+$/.test(rotateBuf.value) ? parseInt(rotateBuf.value, 10) : NaN; if (!isNaN(n)) this.op(s, () => ops.rotate(s, n), true); } }]), help: H('EDIT32') },
      { text: 'Scale x', submenu: factorMenu(scaleBuf, (v) => { const f = parseFloatC(v); if (f > 0) this.op(s, () => ops.scale(s, f, 1), true); }), help: H('EDIT33') },
      { text: 'Scale y', submenu: factorMenu(scaleBuf, (v) => { const f = parseFloatC(v); if (f > 0) this.op(s, () => ops.scale(s, 1, f), true); }), help: H('EDIT34') },
      { text: 'Shear', submenu: factorMenu(shearBuf, (v) => { const f = parseFloatC(v); if (!isNaN(f)) this.op(s, () => ops.shear(s, f), true); }), help: H('EDIT35') },
      { text: 'Adjust size', dotted: true, submenu: () => A.dialogs.spriteSize(s), help: H('EDIT36') },
      { text: 'Insert columns', submenu: () => this.insdelBox(sw, false, true), help: H('EDIT37') },
      { text: 'Insert rows', submenu: () => this.insdelBox(sw, true, true), help: H('EDIT38') },
      { text: 'Delete columns', submenu: () => this.insdelBox(sw, false, false), help: H('EDIT39') },
      { text: 'Delete rows', dotted: true, submenu: () => this.insdelBox(sw, true, false), help: H('EDIT3a') },
      { text: 'Mask', ticked: () => !!s.mask, action: () => this.toggleMask(s), help: H('EDIT3b') },
      { text: 'Palette', ticked: () => !!(s.pal && s.pal.length), shaded: nc > 256, action: () => this.op(s, () => ops.togglePalette(s, A.desktop(s)), true), help: H('EDIT3c') },
    ]);
    return new Menu(A.msg('Pnt00'), [
      { text: 'Misc', submenu: misc, help: H('EDIT0') },
      { text: 'Save', submenu: save, help: H('EDIT1') },
      { text: 'Paint', submenu: paint, help: H('EDIT2') },
      { text: 'Edit', submenu: edit, help: H('EDIT3') },
      { text: 'Zoom', submenu: () => A.dialogs.zoomBox(sw), help: H('EDIT4') },
      { text: 'Grid', ticked: () => sw.gridcol !== 255, action: () => this.toggleGrid(sw),
        submenu: colourMenu(A.msg('PntMH'), () => sw.gridcol, (n) => { sw.gridcol = n; A.options.grid = { show: true, colour: n }; sw.win.invalidate(); }), help: H('EDIT5') },
    ]);
  }

  /** Run a whole-sprite operation with undo; reshape = geometry may have changed. */
  op(s, fn, reshape) {
    const A = this.A;
    this.stopAllTools();
    A.pushUndo(s);
    const err = fn();
    if (err) { A.undoStack.pop(); A.error(err); return; }
    if (A.toolOpts.brush.sprite === s) A.toolWin.brushChanged?.();
    if (reshape) A.reshaped(s); else A.edited(s, null);
  }

  toggleGrid(sw) {
    const A = this.A;
    sw.gridcol = sw.gridcol === 255 ? A.options.grid.colour : 255;
    A.options.grid.show = sw.gridcol !== 255;
    sw.win.invalidate();
  }

  toggleSmall(s) {
    s.st.coloursize = s.st.coloursize === 30 ? 15 : 30;
    this.A.options.smallColours = s.st.coloursize !== 30;
    this.colourExtent(s);
  }

  toggleMask(s) {
    const A = this.A;
    const create = !s.mask;
    this.op(s, () => ops.setHasMask(s, create), true);
    if (!create) {
      const nc = nColours(s);
      if (s.st.gcol === nc) s.st.gcol--;
      if (s.st.gcol2 === nc) s.st.gcol2--;
    }
    const c = s.st.colourWin;
    if (c?.picker) c.picker.setOffersTransparent?.(create);
  }

  /** Paint > Select colour: the colour under the pointer when the menu was opened. */
  selectColourAt(s) {
    const c = this.lastCell;
    if (!c || c.sw.sprite !== s) return;
    const nc = nColours(s);
    s.st.gcol = s.mask && !ops.maskAt(s, c.x, c.y) ? nc : ops.pix(s, c.x, c.y);
    c_redraw(this, s);
    const cw = s.st.colourWin;
    if (cw?.picker) cw.picker.set(s.st.gcol === nc ? null : colourRGB(s, s.st.gcol, true), s.st.gcol === nc);
  }

  /** Paint > Edit palette: a colour picker editing palette entry gcol (dboxtcol). */
  editPalette(s) {
    const A = this.A;
    const i = s.st.gcol;
    const w = s.pal[2 * i];
    return A.dialogs.picker({
      title: A.msg('PntW8'), rgb: [(w >>> 8) & 255, (w >>> 16) & 255, (w >>> 24) & 255], menu: true,
      onChoose: (rgb) => {
        A.pushUndo(s);
        ops.setPaletteEntry(s, i, palWord(rgb));
        A.reshaped(s);
      },
    }).win;
  }

  // ------------------------------------------------------------------ insert / delete rows & columns
  /** The "How many?" box, with the graphical insert/delete display in the sprite window. */
  insdelBox(sw, rows, insert) {
    const A = this.A, s = sw.sprite;
    const cell = this.lastCell?.sw === sw ? this.lastCell : { x: 0, y: 0 };
    const w = A.dialogs.numberBox();
    const I = w.icons;
    I[0].setText('1');
    const st = this.insdel = { s, sw, rows, insert, Row: cell.y, Column: cell.x, row: cell.y + 1, col: cell.x + 1, box: w, pending: false };
    this.stopAllTools();
    this.redisplay(s);
    const perform = (count) => {
      if (this.insdel !== st) return;
      this.stopInsdel();
      const n = Math.max(0, parseInt(count, 10) || 0);
      if (!n) return;
      const at = rows ? Math.min(st.Row, st.row) : Math.min(st.Column, st.col);
      this.op(s, () => ops.changeSize(s, rows, at, insert ? n : -n), true);
    };
    st.perform = perform;
    w.on('key', (ev) => { if (ev.code === 13) { perform(I[0].text); wimp.menus.close(); return true; } return false; });
    w.on('menuclosed', () => {
      if (this.insdel !== st) return;
      st.pending = true;
      // the graphics stay until the next mouse click (menus_insdel_frig)
      const once = () => { window.removeEventListener('pointerdown', once, true); setTimeout(() => { if (this.insdel === st) this.stopInsdel(); }, 0); };
      window.addEventListener('pointerdown', once, true);
    });
    return w;
  }

  stopInsdel() {
    const st = this.insdel;
    if (!st) return;
    this.insdel = null;
    this.redisplay(st.s);
  }

  insdelNull(sw, ev) {
    const st = this.insdel, s = sw.sprite;
    const p = this.toSprite(sw, ev.sx, ev.sy);
    let x = Math.trunc(p.x / (1 << s.xeig)), y = Math.trunc(p.y / (1 << s.yeig));
    if (x === st.Column) x = st.Column + 1;
    if (y === st.Row) y = st.Row + 1;
    if (x !== st.col || y !== st.row) {
      st.col = x; st.row = y;
      st.box.icons[0].setText(String(st.rows ? Math.abs(st.row - st.Row) : Math.abs(st.col - st.Column)));
      this.redisplay(s);
    }
  }

  insdelClick(sw, ev) {
    const st = this.insdel;
    if (ev.button !== 'select' || sw.sprite !== st.s) return;
    st.perform(st.rows ? Math.abs(st.row - st.Row) : Math.abs(st.col - st.Column));
  }

  insdelRedraw(sw, eor) {
    const st = this.insdel, s = sw.sprite;
    const dx = 1 << s.xeig, dy = 1 << s.yeig;
    eor.plot((v, P) => {
      if (st.rows) {
        const a = P([0, st.Row * dy]), b = P([0, st.row * dy]);
        const y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
        v.plot(4, 0, y0); v.plot(101, 0x1FFF, y1 - 1);
      } else {
        const a = P([st.Column * dx, 0]), b = P([st.col * dx, 0]);
        const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
        v.plot(4, x0, 0); v.plot(101, x1 - 1, 0x1FFF);
      }
    });
  }
}

function c_redraw(SW, s) { SW.redrawColours(s); }

/** sscanf "%lg%n" with the whole string consumed. */
function parseFloatC(v) {
  const t = String(v).trim();
  return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t) ? parseFloat(t) : NaN;
}
