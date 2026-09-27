// Where a desktop BASIC program's screen is shown: the whole screen (single tasking, as RISC OS 3.71 runs
// a BASIC file) or a desktop window (a "graphics task window", multitasking). A BasicProcess (runner.js)
// has one display at a time and can switch between them while the program runs: the program keeps its
// own VDU (mode, palette, windows, banks, what is on the screen); only the canvas it is rendered into, and
// where keys and the mouse come from, change.
//
//   display.attach()   start showing proc.vdu and taking input      display.detach()   stop
//   display.rebind()   proc.vdu was replaced (Restart)              display.attached
//
// FullScreenDisplay: a canvas over the whole screen (os.cli.acquireScreen), the program's mode scaled to
// fill it. Several programs may want the screen at once (one full-screen program *Runs another, or a
// program is started while another has the screen): the newest is shown and gets the keys, and the
// others get the screen back, in turn, when it lets go (a stack, `screens` below).
//
// WindowDisplay: a Wimp window (proc.window, owned by proc.task) whose work area holds the canvas at the
// mode's natural desktop size (displayWidth x displayHeight: pixels x eigen / 2, e.g. MODE 12 640x512)
// times the scale (1, 2 or 'fit' the window). Keys (and INKEY(-n) scanning) reach the program only while
// the window has the input focus; the mouse is mapped to the program's own OS units.

import { os } from '../os.js';
import { wimp } from '../wimp.js';
import { input } from '../input.js';
import { WF } from '../templates.js';
import { internalKey, keyCode } from '../../basic/keymap.js';

const BUT_MENU = 2;

/** Alt-Return: switch a program between its window and the whole screen. */
export const isSwitchKey = (e) => !!e && e.altKey && !e.ctrlKey && (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter');

/** A key press for the program: BASIC's own key codes (copy-key editing, *FX 4, Escape as *FX 229 says). */
function keyToProgram(proc, e) {
  const m = proc.machine;
  proc.sound?.resume?.();
  const c = keyCode(e, m.fx4);
  if (c <= -2) { proc.vdu.cursorEdit?.(c); return true; }
  if (c >= 0) { m.keyPress(c); return true; }
  return false;
}

/** Pointer position over the program's canvas in its own OS units (0,0 = bottom left), kept on its screen. */
function mouseOS(e, canvas, vdu) {
  const r = canvas.getBoundingClientRect();
  const ox = vdu.W << vdu.xEig, oy = vdu.H << vdu.yEig;
  const x = Math.floor((e.clientX - r.left) / (r.width || 1) * ox), y = Math.floor((1 - (e.clientY - r.top) / (r.height || 1)) * oy);
  return [Math.max(0, Math.min(ox - 1, x)), Math.max(0, Math.min(oy - 1, y))];
}

/** Release every key the program thinks is held (focus lost, display switched); keep the mouse buttons. */
function releaseKeys(m) {
  if (!m) return;
  for (const k of [...m.keysDown]) if (k < 9 || k > 11) m.keysDown.delete(k);
}

function newCanvas() {
  const c = document.createElement('canvas');
  c.className = 'basic-screen';
  c.style.cssText = 'position:absolute;left:0;top:0;image-rendering:pixelated';
  return c;
}

// ============================================================================================ full screen
const screens = [];          // FullScreenDisplays wanting the screen; the last one has it
let screen = null;           // os.cli.acquireScreen() while any does

function topScreen() { return screens[screens.length - 1] ?? null; }
function pushScreen(d) {
  if (!screen) {
    screen = os.cli.acquireScreen({ onKey: (e, k) => topScreen()?.onKey(e, k) });
    const el = screen.el;
    el.addEventListener('pointermove', (e) => topScreen()?.onPointer(e, 'move'));
    el.addEventListener('pointerdown', (e) => topScreen()?.onPointer(e, 'down'));
    el.addEventListener('pointerup', (e) => topScreen()?.onPointer(e, 'up'));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  screens.push(d);
  screen.el.appendChild(d.canvas);
  restack();
}
function popScreen(d) {
  const i = screens.indexOf(d);
  if (i >= 0) screens.splice(i, 1);
  d.canvas.remove();
  if (!screens.length) { screen?.release(); screen = null; return; }
  restack();
}
function restack() {
  const top = topScreen();
  for (const d of screens) {
    d.canvas.style.display = d === top ? '' : 'none';
    if (d.proc.job) d.proc.job.foreground = d === top;
  }
}

export class FullScreenDisplay {
  constructor(proc) {
    this.proc = proc;
    this.kind = 'full';
    this.attached = false;
    this.keyHandler = null;       // the "Press SPACE" wait
    this.canvas = null;
  }

  get width() { return screen?.width ?? wimp.width; }
  get height() { return screen?.height ?? wimp.height; }

  attach() {
    if (this.attached) return;
    this.attached = true;
    this.canvas = newCanvas();
    this.proc.vdu.attachCanvas(this.canvas);
    pushScreen(this);
    this.buttons = 0;
    this._keyup = (e) => { const ik = internalKey(e); if (ik !== undefined) this.proc.machine?.keyUp(ik); };
    window.addEventListener('keyup', this._keyup, true);
    let dims = '';
    const frame = () => {
      if (!this.attached) return;
      const vdu = this.proc.vdu;
      vdu.render();
      const d = vdu.displayWidth + 'x' + vdu.displayHeight;
      if (d !== dims) { dims = d; this.fit(); }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** The program's screen mode fills the monitor (aspect kept), like a mode change on real hardware. */
  fit() {
    const vdu = this.proc.vdu, cv = this.canvas;
    const dw = vdu.displayWidth, dh = vdu.displayHeight;
    const s = Math.min(this.width / dw, this.height / dh);
    cv.style.width = dw * s + 'px'; cv.style.height = dh * s + 'px';
    cv.style.left = Math.floor((this.width - dw * s) / 2) + 'px';
    cv.style.top = Math.floor((this.height - dh * s) / 2) + 'px';
  }

  rebind() { if (this.attached) { this.proc.vdu.attachCanvas(this.canvas); this.fit(); } }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keyup', this._keyup, true);
    popScreen(this);
    if (this.proc.job) this.proc.job.foreground = false;
    releaseKeys(this.proc.machine);
    this.proc.vdu.attachCanvas(null);
  }

  onKey(e, k) {
    if (this.keyHandler) { this.keyHandler(e, k); return; }
    const proc = this.proc, m = proc.machine;
    if (!m) return;
    // (a program from a window that has ended: any key goes back to the window)
    if ((isSwitchKey(e) || proc.ended) && proc.canWindow) { proc.fullScreen(false); return; }
    const ik = internalKey(e);
    if (ik !== undefined) m.keyDown(ik);
    keyToProgram(proc, e);
  }

  onPointer(e, what) {
    const m = this.proc.machine;
    if (what === 'down' && this.keyHandler) { this.keyHandler(null, { code: -1 }); return; }
    if (what === 'down' && this.proc.ended && this.proc.canWindow) { this.proc.fullScreen(false); return; }
    if (!m) return;
    if (what !== 'move') this.buttons = input.buttonBits(e);
    const [x, y] = mouseOS(e, this.canvas, this.proc.vdu);
    m.setMouse(x, y, this.buttons);
    if (what !== 'move') input.syncButtonKeys(m, this.buttons);
  }

  /** "Press SPACE or click mouse to continue" at the end of a single-tasking program (the Wimp's prompt). */
  async pressSpace() {
    const m = this.proc.machine;
    m.writeC(4);
    if (m.pos()) m.newLine();
    m.writeStr('Press SPACE or click mouse to continue');
    await new Promise((resolve) => {
      this.keyHandler = (e, k) => { if (k.code === 32 || k.code === -1 || k.code === 13) resolve(); };
    });
    this.keyHandler = null;
  }
}

// ============================================================================================ window
let opened = 0;              // staggers new windows

export class WindowDisplay {
  /** opts.scale: 1 | 2 | 'fit' */
  constructor(proc, opts = {}) {
    this.proc = proc;
    this.kind = 'window';
    this.attached = false;
    this.scale = opts.scale === 'fit' ? 'fit' : (+opts.scale || 1);
    this.canvas = null;
    this.buttons = 0;
    this.pressed = false;     // a button went down over the window (its release is reported wherever it happens)
    this.dims = '';
  }

  get window() { return this.proc.window; }

  /** Natural size of the program's screen on the desktop, in desktop pixels (= OS units / 2). */
  natural() { const v = this.proc.vdu; return { w: v.displayWidth, h: v.displayHeight }; }

  _makeWindow() {
    const proc = this.proc;
    const { w: dw, h: dh } = this.natural();
    const s = this.scale === 'fit' ? 1 : this.scale;
    const w = Math.round(dw * s), h = Math.round(dh * s);
    const n = opened++ % 8;
    const win = proc.task.createWindow({
      title: proc.title,
      flags: { back: true, close: true, title: true, toggle: true, vscroll: true, hscroll: true, size: true, moveable: true },
      colours: { workBg: 7 },
      workButton: 'click',
      extent: { w, h }, w, h,
      x: Math.max(8, Math.round((wimp.width - w) / 2) - 60 + n * 24), y: Math.max(40, Math.round((wimp.height - h) / 2) - 60 + n * 24),
      minW: 64, minH: 48,
    });
    win._basicProcess = proc;
    win.on('click', (ev) => this._click(ev));
    win.on('key', (ev) => this._key(ev));
    win.on('close', (ev) => { ev.preventDefault(); proc.closeRequest(ev); });
    win.on('losecaret', () => releaseKeys(proc.machine));
    win.on('moved', () => { if (this.scale === 'fit' && this.attached) this.layout(); });
    return win;
  }

  attach({ focus = true } = {}) {
    if (this.attached) return;
    const proc = this.proc;
    proc.ensureTask();
    const win = proc.window ?? (proc.window = this._makeWindow());
    this.attached = true;
    this.canvas = newCanvas();
    win.work.insertBefore(this.canvas, win.work.firstChild);
    proc.vdu.attachCanvas(this.canvas);
    this.dims = '';
    this.layout(true);
    win.setTitle(proc.title);
    win.open({ behind: 'top' });
    if (focus) wimp.setCaret(win);
    // held keys for INKEY(-n) (the Wimp's key events carry no key releases, nor Shift/Ctrl/Alt on their own)
    this._kd = (e) => {
      if (!win.hasFocus || wimp.fullscreenHandler || wimp.menus?.isOpen || e.repeat) return;
      const ik = internalKey(e);
      if (ik !== undefined) proc.machine?.keyDown(ik);
    };
    this._ku = (e) => { const ik = internalKey(e); if (ik !== undefined) proc.machine?.keyUp(ik); };
    this._pm = (e) => this._pointer(e, 'move');
    this._pu = (e) => this._pointer(e, 'up');
    this._pd = (e) => this._pointer(e, 'down');
    window.addEventListener('keydown', this._kd, true);
    window.addEventListener('keyup', this._ku, true);
    window.addEventListener('pointermove', this._pm, true);
    window.addEventListener('pointerup', this._pu, true);
    win.view.addEventListener('pointerdown', this._pd);
    this.stop = proc.task.animate(() => this.frame());
  }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    this.stop?.();
    window.removeEventListener('keydown', this._kd, true);
    window.removeEventListener('keyup', this._ku, true);
    window.removeEventListener('pointermove', this._pm, true);
    window.removeEventListener('pointerup', this._pu, true);
    this.window?.view.removeEventListener('pointerdown', this._pd);
    this.canvas?.remove();
    this.canvas = null;
    releaseKeys(this.proc.machine);
    this.proc.vdu.attachCanvas(null);
    this.window?.close();
  }

  rebind() { if (this.attached) { this.proc.vdu.attachCanvas(this.canvas); this.dims = ''; this.layout(true); } }

  /** Each animation frame: send the changed rows to the canvas; follow MODE changes. */
  frame() {
    const win = this.window;
    if (!win?.isOpen) return;
    const vdu = this.proc.vdu;
    vdu.render();
    if (vdu.displayWidth + 'x' + vdu.displayHeight !== this.dims) this.layout(true);
  }

  setScale(s) {
    this.scale = s === 'fit' ? 'fit' : (+s || 1);
    if (this.attached) this.layout(true, true);
  }

  /**
   * Size the canvas and the work area. After a MODE change (or a new scale) a window that was showing its
   * whole work area is resized to show the whole of the new one; one the user has made smaller keeps its
   * size. With 'fit' the work area is the window, and the screen is scaled to fit it (aspect kept).
   */
  layout(modeChanged = false, rescaled = false) {
    const win = this.window, cv = this.canvas;
    if (!win || !cv) return;
    const { w: dw, h: dh } = this.natural();
    this.dims = dw + 'x' + dh;
    const fitBits = WF.ignoreRight | WF.ignoreBottom;
    if (this.scale === 'fit') {
      win.flags |= fitBits;
      if (rescaled && win.isOpen) win.open({ w: Math.max(win.w, 64), h: Math.max(win.h, 48) });
      if (win.extent.x1 - win.extent.x0 !== win.w || win.extent.y1 - win.extent.y0 !== win.h) win.setExtent({ w: win.w, h: win.h });
      const s = Math.min(win.w / dw, win.h / dh);
      const cw = dw * s, ch = dh * s;
      Object.assign(cv.style, { width: cw + 'px', height: ch + 'px', left: Math.floor((win.w - cw) / 2) + 'px', top: Math.floor((win.h - ch) / 2) + 'px' });
      return;
    }
    const s = this.scale, cw = Math.round(dw * s), ch = Math.round(dh * s);
    Object.assign(cv.style, { width: cw + 'px', height: ch + 'px', left: '0px', top: '0px' });
    const wasFit = !!(win.flags & fitBits);
    win.flags &= ~fitBits;
    const e = win.extent, ew = e.x1 - e.x0, eh = e.y1 - e.y0;
    if (ew === cw && eh === ch && !wasFit) return;
    const whole = !win.isOpen || wasFit || (win.w >= ew && win.h >= eh);
    if (!modeChanged) return;
    win.setExtent({ w: cw, h: ch });
    if (whole) {
      if (win.isOpen) win.open({ w: cw, h: ch });
      else { win.w = cw; win.h = ch; }
    }
  }

  // ------------------------------------------------------------------ input
  _click(ev) {
    const proc = this.proc, win = this.window;
    // (in Menu button mode Shift-Menu still opens the window menu, so the mode can be turned off again)
    if (ev.button === 'menu' && (!proc.menuButton || ev.shift)) { proc.menuClick(ev); return true; }
    // a click in a window without the input focus gives it the focus (and is not passed to the program)
    if (!win.hasFocus) wimp.setCaret(win);
    return true;
  }

  _key(ev) {
    const e = ev.domEvent;
    if (!e) return false;
    if (isSwitchKey(e)) { this.proc.fullScreen(true); return true; }
    return keyToProgram(this.proc, e);
  }

  _pointer(e, what) {
    const m = this.proc.machine;
    if (!m || !this.canvas || !this.window?.isOpen) return;
    const [x, y] = mouseOS(e, this.canvas, this.proc.vdu);
    if (what === 'down') {
      // (called before the Wimp's click: a window that doesn't have the focus yet only takes it)
      if (!this.window.hasFocus || wimp.menus?.isOpen) return;
      this.proc.sound?.resume?.();
      this.pressed = true;
      this.buttons = this._bits(e);
    } else if (what === 'up' && this.pressed) {
      this.buttons = this._bits(e);
      if (!this.buttons) this.pressed = false;
    } else if (what === 'up') return;
    m.setMouse(x, y, this.buttons);
    if (what !== 'move') input.syncButtonKeys(m, this.buttons);
  }

  _bits(e) {
    const b = input.buttonBits(e);
    return this.proc.menuButton ? b : b & ~BUT_MENU;
  }
}
