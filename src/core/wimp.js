// The Window Manager: screen, window stack, tasks, input focus & caret, pointer and keyboard
// dispatch, drags, and inter-task messages.

import { Emitter, el, clamp, allowedChar } from './util.js';
import { Window, templateToDef } from './window.js';
import { loadTemplates } from './templates.js';
import { input, keyCode, startPointerDrag, autoRepeat, BUT } from './input.js';
import { sprites } from './sprites.js';
import { fonts } from './fonts.js';
import { IF } from './templates.js';

// ---------------------------------------------------------------------------- Task

let nextTask = 1;

export class Task extends Emitter {
  constructor(wimp, name, opts = {}) {
    super();
    this.wimp = wimp;
    this.handle = (nextTask++ << 16) | 0x4000;
    this.name = name;
    this.kind = opts.kind ?? 'app';        // 'app' (application memory) | 'module'
    this.memory = opts.memory ?? 64;       // K of application memory shown by Task Manager
    this.app = opts.app ?? null;           // app descriptor if started from the registry
    this.windows = new Set();
    this.iconbarIcons = new Set();
    this.timers = new Set();
    this.alive = true;
  }

  /** Create a window owned by this task. See Window for def fields. */
  createWindow(def) { return this.wimp.createWindow(this, def); }
  /** Create a window from a template object/URL. */
  createWindowFromTemplate(tpl, name, overrides) { return this.wimp.createWindowFromTemplate(tpl, name, overrides, this); }

  /** Register a message handler: fn(msg) -> true to claim. Returns an unsubscribe fn. */
  onMessage(type, fn) { return this.on('message:' + type, fn); }
  /** Periodic "null event" callback (Wimp_Poll with null events enabled). */
  every(ms, fn) { const t = setInterval(() => { if (this.alive) fn(); }, ms); this.timers.add(() => clearInterval(t)); return () => clearInterval(t); }
  after(ms, fn) { const t = setTimeout(() => { if (this.alive) fn(); }, ms); this.timers.add(() => clearTimeout(t)); return () => clearTimeout(t); }
  /** requestAnimationFrame loop until the returned stop fn is called or the task quits. */
  animate(fn) {
    let on = true;
    const loop = (t) => { if (!on || !this.alive) return; fn(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    const stop = () => { on = false; };
    this.timers.add(stop);
    return stop;
  }

  /** Show the application's !Help file (like the Filer's Help menu item). */
  openHelp() {
    const dir = this.app?.appDir;
    if (!dir) return;
    globalThis.os?.filer?.run(dir + '.!Help');
  }

  /** Put an icon on the icon bar owned by this task. spec: see IconBar.add. */
  addIconbarIcon(spec) { return this.wimp.iconbar.add({ ...spec, task: this }); }

  /** Wimp_ReportError on behalf of this task (title "Message from <name>"). */
  reportError(message, opts = {}) { return this.wimp.reportError(message, { appName: this.name, sprite: this.app?.sprite, ...opts }); }

  /** Send a message to other tasks (broadcast) — see Wimp.sendMessage. */
  broadcast(type, data) { return this.wimp.sendMessage(type, data, { from: this }); }

  /** Quit the task: close its windows, remove icon bar icons, stop timers. */
  quit() {
    if (!this.alive) return;
    this.emit('quit', {});
    this.alive = false;
    for (const t of this.timers) t();
    for (const w of [...this.windows]) w.delete();
    for (const i of [...this.iconbarIcons]) this.wimp.iconbar?.remove(i);
    if (this.wimp.menus?.owner === this) this.wimp.menus.close();
    this.wimp._taskGone(this);
  }
}

// ---------------------------------------------------------------------------- Wimp

export class Wimp extends Emitter {
  constructor() {
    super();
    this.config = { textured: true, offScreen: 'all', solidDrags: true };
    this.tasks = [];
    this.windows = new Set();
    this.stack = [];          // open windows bottom -> top
    this.caret = null;        // {window, icon, index} | {window, x, y, h}
    this.scale = 1;
    this.iconbarFront = false;
    this.modal = null;
    this.version = '3.71';
  }

  // ------------------------------------------------------------------ setup
  init(root) {
    const scr = this.screen = el('div', 'screen', root);
    input.screenEl = scr;
    this.layers = {
      windows: el('div', 'layer-windows', scr),
      menus: el('div', 'layer-menus', scr),
      drag: el('div', 'layer-drag', scr),
      modal: el('div', 'layer-modal', scr),
    };
    this.caretEl = el('div', 'caret');
    this._ptr = null;
    setTimeout(() => this.setPointer(''), 0);
    this.systemTask = new Task(this, 'Window Manager', { kind: 'module', memory: 0 });
    this._resize();
    window.addEventListener('resize', () => this._resize());
    scr.addEventListener('pointerdown', (e) => this._pointerDown(e));
    scr.addEventListener('pointermove', (e) => this._pointerMove(e));
    scr.addEventListener('contextmenu', (e) => e.preventDefault());
    scr.addEventListener('wheel', (e) => this._wheel(e), { passive: false });
    scr.addEventListener('auxclick', (e) => e.preventDefault());
    scr.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    scr.addEventListener('dblclick', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this._keyDown(e), true);
    window.addEventListener('paste', (e) => this._paste(e));
  }

  setScale(s) { this.zoom = s; this._resize(); }

  /** Change "screen mode": fixed desktop size (scaled to fit the browser), or null for window size. */
  setMode(m, opts = {}) {
    this._fixedMode = m ?? null;
    this.mode = m ? [m.width, m.height] : null;
    this.screen.style.filter = opts.greys ? 'grayscale(1)' : '';
    this._resize();
  }

  _resize() {
    const z = this.zoom ?? 1;
    let s = z, w, h;
    if (this._fixedMode) {
      w = this._fixedMode.width; h = this._fixedMode.height;
      s = Math.min(window.innerWidth / w, window.innerHeight / h);
    } else {
      w = Math.floor(window.innerWidth / s); h = Math.floor(window.innerHeight / s);
    }
    this.scale = s; input.scale = s;
    const old = { w: this.width, h: this.height };
    this.width = w; this.height = h;
    globalThis.__wimpScreenH = h;
    const st = this.screen.style;
    st.width = w + 'px'; st.height = h + 'px';
    st.transform = s !== 1 ? `scale(${s})` : '';
    if (this._ptrKey != null) this.setPointer(this._ptr);   // re-scale the pointer
    if (old.w != null && (old.w !== w || old.h !== h)) {
      this.emit('modechange', { width: w, height: h });
      this.sendMessage('ModeChange', { width: w, height: h });
      // Wimp03 (mode change): re-open every window back to front with an Open_Window_Request,
      // except panes (their parents re-open them); constrainWindow keeps each one reachable.
      for (const win of [...this.stack]) {
        if (win.isBackWindow || win.isPane || win._paneParent || !win.isOpen) continue;
        if (win.task && !win._menuWindow && !win._isIconbar) win.requestOpen({ behind: 'keep' });
        else win.open({});
      }
    }
  }

  /** Screen rectangle; if excludeIconBar, the area above the icon bar. */
  screenRect(excludeIconBar = false) {
    const ib = excludeIconBar && this.iconbar ? this.iconbar.height : 0;
    return { x: 0, y: 0, w: this.width, h: this.height - ib };
  }

  // ------------------------------------------------------------------ tasks
  createTask(name, opts) {
    const t = new Task(this, name, opts);
    this.tasks.push(t);
    this.emit('taskschanged', {});
    this.sendMessage('TaskInitialise', { task: t, name }, { from: t });
    return t;
  }
  _taskGone(t) {
    this.tasks = this.tasks.filter((x) => x !== t);
    this.emit('taskschanged', {});
    this.sendMessage('TaskCloseDown', { task: t, name: t.name }, { from: t });
  }
  findTask(name) { return this.tasks.find((t) => t.name.toLowerCase() === String(name).toLowerCase()) ?? null; }

  /**
   * Send a message. to: a Task, a Window (its task), or omitted for a broadcast.
   * Handlers registered with task.onMessage(type, fn) receive {type, data, from}; returning
   * true claims the message (stops a broadcast). Resolves to the claiming task (or null).
   */
  sendMessage(type, data = {}, { to = null, from = null } = {}) {
    const msg = { type, data, from, ...data };
    const targets = to ? [to instanceof Window ? to.task : to] : this.tasks.filter((t) => t !== from);
    for (const t of targets) {
      if (!t?.alive) continue;
      const ev = t.emit('message:' + type, msg);
      const ev2 = t.emit('message', msg);
      if (ev.handled || ev2.handled) return t;
    }
    return null;
  }

  // ------------------------------------------------------------------ windows
  createWindow(task, def) {
    const w = new Window(this, task ?? this.systemTask, def);
    this.windows.add(w);
    (task ?? this.systemTask).windows.add(w);
    this.layers.windows.appendChild(w.el);
    return w;
  }

  /**
   * Create a window from a Wimp template. tpl may be: a template window object, a whole
   * template file object {windows}, or a URL string (then async: returns a Promise).
   * overrides: fields of the window def to replace (e.g. {title, x, y}).
   */
  createWindowFromTemplate(tpl, name, overrides = {}, task = null) {
    if (typeof tpl === 'string') return loadTemplates(tpl).then((t) => this.createWindowFromTemplate(t, name, overrides, task));
    let t = tpl;
    if (tpl.windows) {
      t = tpl.windows[String(name).toLowerCase()];
      if (!t) throw new Error(`Template entry not found: ${name}`);
    }
    const def = { ...templateToDef(t), ...overrides };
    return this.createWindow(task, def);
  }

  _windowDeleted(w) {
    this.windows.delete(w);
    w.task?.windows.delete(w);
    if (this.caret?.window === w) this.setCaret(null);
  }

  /** Constrain a window's visible area position according to the off-screen rules. */
  constrainWindow(win, p) {
    if (win.isBackWindow || win.hasFlag(1 << 6) || win._isIconbar) return p;
    const f = win._frame ?? { left: 1, topH: 20, rightW: 20, botH: 20 };
    const W = this.width, H = this.height;
    let { x, y, w, h } = p;
    if (this.config.offScreen === 'none' || win.hasFlag(1 << 13) || win._menuWindow) {
      w = Math.min(w, W - f.left - f.rightW);
      h = Math.min(h, H - f.topH - f.botH);
      x = clamp(x, f.left, W - w - f.rightW);
      y = clamp(y, f.topH, H - h - f.botH);
    } else {
      // partly off screen allowed; keep the title bar reachable
      x = clamp(x, -w - f.rightW + 48, W - 48);
      y = clamp(y, f.topH, H - 24);
    }
    return { x, y, w, h };
  }

  _stackPlace(win, behind) {
    const s = this.stack;
    const idx = s.indexOf(win);
    if (behind === 'keep' && idx >= 0) { this._restack(); return; }
    if (idx >= 0) s.splice(idx, 1);
    if (win.isBackWindow) { s.unshift(win); }
    else if (behind === 'bottom') {
      // just above back windows (and the icon bar, which lives at the back)
      let i = 0;
      while (i < s.length && (s[i].isBackWindow || (s[i]._isIconbar && !this.iconbarFront))) i++;
      s.splice(i, 0, win);
    } else if (behind instanceof Window) {
      const j = s.indexOf(behind);
      s.splice(j < 0 ? s.length : j, 0, win);
    } else if (behind === 'keep') {
      s.push(win);
    } else {
      s.push(win);
    }
    this._restack();
  }
  /** Put `win` directly in front of `other` (used for panes). */
  _stackAbove(win, other) {
    const s = this.stack;
    const i = s.indexOf(win);
    if (i >= 0) s.splice(i, 1);
    const j = s.indexOf(other);
    s.splice(j < 0 ? s.length : j + 1, 0, win);
    this._restack();
  }
  _stackRemove(win) {
    const i = this.stack.indexOf(win);
    if (i >= 0) this.stack.splice(i, 1);
    this._restack();
  }
  _restack() {
    // panes stay directly in front of their parent windows
    const panes = this.stack.filter((w) => w._paneParent?.isOpen && this.stack.includes(w._paneParent));
    if (panes.length) {
      const rest = this.stack.filter((w) => !panes.includes(w));
      const out = [];
      for (const w of rest) { out.push(w); for (const p of panes) if (p._paneParent === w) out.push(p); }
      this.stack.splice(0, this.stack.length, ...out);
    }
    this.stack.forEach((w, i) => { w.el.style.zIndex = String(10 + i); });
    this.emit('restack', {});
  }
  /** Topmost open non-back window, or null. */
  topWindow() { for (let i = this.stack.length - 1; i >= 0; i--) if (!this.stack[i].isBackWindow && !this.stack[i]._isIconbar) return this.stack[i]; return null; }

  // ------------------------------------------------------------------ caret / input focus
  /**
   * Wimp_SetCaretPosition.
   *   setCaret(null)                         remove the caret
   *   setCaret(win)                          give win the input focus, invisible caret
   *   setCaret(win, icon, index)             caret in a writable icon
   *   setCaret(win, null, -1, {x, y, h})     caret drawn at work-area x,y (height h)
   */
  setCaret(win, icon = null, index = -1, pos = null) {
    const old = this.caret;
    const oldWin = old?.window ?? null;
    if (typeof icon === 'number') icon = win?.icons[icon] ?? null;
    if (win && icon && index < 0) index = icon.text.length;
    this.caret = win ? { window: win, icon, index: icon ? clamp(index, 0, icon.text.length) : index, pos } : null;
    if (oldWin && oldWin !== win) { oldWin._layout(); oldWin.emit('losecaret', {}); if (old.icon) old.icon.render(); }
    if (win) {
      win._layout();
      if (oldWin !== win) win.emit('gaincaret', {});
    }
    if (old?.icon && old.icon !== icon) old.icon.render();
    this._drawCaret();
  }
  caretIndexClamp() { if (this.caret?.icon) this.caret.index = clamp(this.caret.index, 0, this.caret.icon.text.length); }
  _drawCaret() {
    const c = this.caret, ce = this.caretEl;
    if (!c || !c.window?.isOpen || (!c.icon && !c.pos)) { ce.remove(); return; }
    let p;
    if (c.icon) { c.icon.render(); p = c.icon.caretPos(c.index); }
    else p = c.pos;
    c.window.work.appendChild(ce);
    ce.style.left = Math.round(p.x) + 'px';
    ce.style.top = Math.round(p.y) + 'px';
    ce.style.height = Math.round(p.h ?? 20) + 'px';
  }

  // ------------------------------------------------------------------ pointer
  _pointerDown(e) {
    const p = input.pos(e);
    input.mouseX = p.x; input.mouseY = p.y;
    const button = input.button(e);
    if (!button) return;
    e.preventDefault();
    this._doublePtrOff();
    if (this.modal) { this.modal.onPointerDown?.(e, button); return; }
    const target = e.target;
    // menus
    if (this.menus?.isOpen) {
      if (target.closest('.menu')) { this.menus.pointerDown(e, button, target); return; }
      const inMenuDbox = target.closest('.win')?._win?._menuDbox;
      // a click outside the menu tree closes it; the click is then processed normally
      if (!inMenuDbox) this.menus.close();
    }
    const winEl = target.closest('.win');
    const win = winEl?._win;
    if (!win) return;
    const partEl = target.closest('[data-part]');
    const part = partEl?.dataset.part ?? 'work';
    if (part === 'work' || part === 'blank') this._workPointerDown(win, e, button, p);
    else this._furniturePointerDown(win, part, e, button, p, partEl);
  }

  _pointerMove(e) {
    const p = input.pos(e);
    input.mouseX = p.x; input.mouseY = p.y;
    if (this.menus?.isOpen) this.menus.pointerMove(e, p);
    // pointer shape / enter-leave
    // As in the Wimp, Pointer_Entering/Leaving_Window (and so an application's pointer shape)
    // apply to a window's visible work area only: over the furniture (title bar, scroll bars,
    // tools, border) the pointer is the default arrow.
    const winEl = e.target.closest?.('.win');
    const inWork = winEl && e.target.closest('[data-part]')?.dataset.part === 'work';
    const win = inWork ? winEl._win ?? null : null;
    if (win !== this._ptrWin) {
      this._ptrWin?.emit('pointerleave', {});
      this._ptrWin = win;
      win?.emit('pointerenter', {});
    }
    // P validation pointer shapes
    const icEl = e.target.closest?.('.icon');
    const ptr = icEl?.dataset.ptr || win?.pointer || '';
    this._ptrWant = ptr;
    if (this._dblPtr && Math.abs(p.x - this._dblPtr.x) + Math.abs(p.y - this._dblPtr.y) > input.config.doubleClickMove) this._doublePtrOff();
    if (!this._dblPtr) this.setPointer(ptr);
    if (win && win.hasListeners('pointermove')) {
      const wp = win.screenToWork(p.x, p.y);
      win.emit('pointermove', { x: wp.x, y: wp.y, sx: p.x, sy: p.y, buttons: e.buttons });
    }
  }

  /** Set the pointer shape to a sprite from the Wimp pool ('' = the default RISC OS arrow). */
  /**
   * name may carry an active point like a P validation command: 'ptr_write,4,9'. As in the Wimp
   * (setptr_shape / Wimp03 P validation), the active point defaults to the top-left pixel (0,0);
   * a SpriteInfo may give its own `hot: [x, y]` (CSS px). When the desktop is zoomed the pointer is
   * scaled with it (CSS cursors are not affected by the screen's transform).
   */
  setPointer(name) {
    const scale = this.scale ?? 1;
    const obj = name && typeof name === 'object';   // a SpriteInfo
    const key = (obj ? name.url : (name ?? '')) + '@' + scale;
    if (key === this._ptrKey) return;
    this._ptrKey = key;
    this._ptr = name;
    const [spr, hx, hy] = obj ? ['', 0, 0] : String(name || 'ptr_default').split(',');
    const s = obj ? name : sprites.get(spr.trim() || 'ptr_default');
    if (!s) { this.screen.style.cursor = ''; return; }
    const hot = s.hot ?? [+hx || 0, +hy || 0];
    const set = (url, k) => { this.screen.style.cursor = `url("${url}") ${Math.round(hot[0] * k)} ${Math.round(hot[1] * k)}, auto`; };
    if (scale === 1 || !s.canvas) { set(s.url, 1); return; }
    const cache = (this._ptrCache ??= new Map());
    const ck = s.url + '@' + scale;
    if (cache.has(ck)) { set(cache.get(ck), scale); return; }
    set(s.url, 1);
    Promise.resolve(s.canvas()).then((src) => {
      const c = document.createElement('canvas');
      c.width = Math.round(s.cssW * scale); c.height = Math.round(s.cssH * scale);
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(src, 0, 0, c.width, c.height);
      cache.set(ck, c.toDataURL());
      if (this._ptrKey === key) set(cache.get(ck), scale);
    }).catch(() => {});
  }

  // Wimp03 doubleptr_on/off: after the first click on something that waits for a double click the
  // pointer changes to ptr_double until the double-click time runs out, the pointer moves away, or
  // the second click arrives.
  _doublePtrOn(p) {
    clearTimeout(this._dblT);
    this._dblPtr = { x: p.x, y: p.y };
    this.setPointer('ptr_double');
    this._dblT = setTimeout(() => this._doublePtrOff(), input.config.doubleClickMs);
  }
  _doublePtrOff() {
    if (!this._dblPtr) return;
    this._dblPtr = null;
    clearTimeout(this._dblT);
    this.setPointer(this._ptrWant ?? '');
  }

  _furniturePointerDown(win, part, e, button, p, partEl) {
    const front = button === 'select';
    if (button === 'menu') {
      // menu clicks over furniture are reported like work-area clicks
      this._reportMenuClick(win, e, p, null);
      return;
    }
    const press = (name, action) => {
      win._pressed = name; win._layout();
      const up = (ev) => {
        window.removeEventListener('pointerup', up, true);
        win._pressed = null; win._layout();
        const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-part]');
        if (over === partEl) action();
      };
      window.addEventListener('pointerup', up, true);
    };
    switch (part) {
      case 'back':
        press('back', () => win.requestOpen({ behind: button === 'adjust' ? 'top' : 'bottom' }));
        break;
      case 'close':
        press('close', () => {
          // Shift-Select (or Alt-click) on the close icon iconises the window onto the pinboard
          const iconise = e.altKey || (e.shiftKey && button === 'select');
          if (iconise && this.iconiser && !win.isPane) { this.iconiser(win); return; }
          win.requestClose({ button, shift: e.shiftKey });
        });
        break;
      case 'toggle':
        press('toggle', () => win.toggleSize(front));
        break;
      case 'title': {
        if (front && !win.isPane) win.requestOpen({ behind: 'top' });
        if (!win.hasFlag(1 << 1)) { this._reportTitleClick(win, e, button, p); break; }
        const sx = win.x, sy = win.y, ox = p.x, oy = p.y;
        let moved = false;
        startPointerDrag(e, {
          onMove: (q) => {
            if (!moved && Math.abs(q.x - ox) + Math.abs(q.y - oy) < 2) return;
            moved = true;
            win.requestOpen({ x: sx + q.x - ox, y: sy + q.y - oy, behind: 'keep' });
          },
          onEnd: () => { if (!moved) this._reportTitleClick(win, e, button, p); },
        });
        break;
      }
      case 'size': {
        if (front) win.requestOpen({ behind: 'top' });
        win._pressed = 'size'; win._layout();
        const sw = win.w, sh = win.h, ox = p.x, oy = p.y;
        startPointerDrag(e, {
          onMove: (q) => win.requestOpen({ w: sw + q.x - ox, h: sh + q.y - oy, behind: 'keep', scrollX: win.scrollX, scrollY: win.scrollY }),
          onEnd: () => { win._pressed = null; win._layout(); },
        });
        break;
      }
      case 'up': case 'down': case 'left': case 'right': {
        const rev = button === 'adjust' ? -1 : 1;
        const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[part];
        win._pressed = part; win._layout();
        autoRepeat(() => this._scrollBy(win, d[0] * rev, d[1] * rev, 'line'), 400, 50);
        const up = () => { window.removeEventListener('pointerup', up, true); win._pressed = null; win._layout(); };
        window.addEventListener('pointerup', up, true);
        break;
      }
      case 'vwell': case 'hwell': {
        const vert = part === 'vwell';
        const o = vert ? win.v : win.hb;
        const r = o.bar.getBoundingClientRect();
        const pos = vert ? e.clientY : e.clientX;
        const before = pos < (vert ? r.top : r.left);
        const rev = button === 'adjust' ? -1 : 1;
        const dir = (before ? -1 : 1) * rev;
        autoRepeat(() => this._scrollBy(win, vert ? 0 : dir, vert ? dir : 0, 'page'), 400, 120);
        break;
      }
      case 'vbar': case 'hbar': {
        const vert = part === 'vbar';
        const both = button === 'adjust';
        win._pressed = part; win._layout();
        const s0x = win.scrollX, s0y = win.scrollY, ox = p.x, oy = p.y;
        const gv = win.v.geom, gh = win.hb.geom;
        const ratio = (g) => (g && g.inner - g.blen > 0 ? (g.ext - g.vis) / (g.inner - g.blen) : 0);
        const rv = ratio(gv), rh = ratio(gh);
        startPointerDrag(e, {
          onMove: (q) => {
            let nx = s0x, ny = s0y;
            if (vert || both) ny = s0y + (q.y - oy) * (vert ? rv : rv);
            if (!vert || both) nx = s0x + (q.x - ox) * rh;
            if (both && vert) nx = s0x + (q.x - ox) * rh;
            if (both && !vert) ny = s0y + (q.y - oy) * rv;
            this._scrollTo(win, nx, ny);
          },
          onEnd: () => { win._pressed = null; win._layout(); },
        });
        break;
      }
      default: break;
    }
  }

  /** Mouse wheel: scroll the window under the pointer (a later-RISC OS convenience). */
  _wheel(e) {
    if (this.modal || this.cli?.active) return;
    const win = e.target.closest?.('.win')?._win;
    if (!win || win._isIconbar || win.isBackWindow) return;
    e.preventDefault();
    const ev = win.emit('wheel', { dx: e.deltaX, dy: e.deltaY, shift: e.shiftKey });
    if (ev.handled || ev.defaultPrevented) return;
    const k = e.deltaMode === 1 ? 16 : 1;
    let dx = e.deltaX * k, dy = e.deltaY * k;
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    if (win.hasFlag(1 << 8) || win.hasFlag(1 << 9)) {
      const r = win.emit('scrollrequest', { dx: Math.sign(dx), dy: Math.sign(dy), wheel: true });
      if (r.handled || r.defaultPrevented) return;
    }
    this._scrollTo(win, win.scrollX + dx, win.scrollY + dy);
  }

  _reportTitleClick(win, e, button, p) {
    // not reported in RISC OS (the Wimp handles title clicks) - but Menu clicks are.
  }

  _scrollBy(win, dx, dy, unit) {
    const req = win.hasFlag(1 << 8) || win.hasFlag(1 << 9);
    if (req) {
      // Scroll_Request: app decides. dx/dy: +-1 line, +-2 page
      const m = unit === 'page' ? 2 : 1;
      const ev = win.emit('scrollrequest', { dx: dx * m, dy: dy * m });
      if (ev.handled || ev.defaultPrevented) return;
    }
    const stepX = unit === 'page' ? win.w : 16, stepY = unit === 'page' ? win.h : 16;
    this._scrollTo(win, win.scrollX + dx * stepX, win.scrollY + dy * stepY);
  }
  _scrollTo(win, x, y) {
    win.requestOpen({ scrollX: x, scrollY: y, behind: 'keep' });
  }

  _reportMenuClick(win, e, p, icon) {
    const wp = win.screenToWork(p.x, p.y);
    const ev = { button: 'menu', buttons: BUT.menu, x: wp.x, y: wp.y, sx: p.x, sy: p.y, icon, iconIndex: icon?.handle ?? -1, shift: e.shiftKey, ctrl: e.ctrlKey, window: win, kind: 'click' };
    const r = win.emit('click', ev);
    if (!r.handled && !r.defaultPrevented) {
      const m = typeof win.menu === 'function' ? win.menu(ev) : win.menu;
      if (m) this.menus.open(m, p.x - 32, p.y, { task: win.task, window: win, event: ev });
    }
  }

  _workPointerDown(win, e, button, p) {
    const wp = win.screenToWork(p.x, p.y);
    let icon = win.iconAt(wp.x, wp.y);
    let btype = icon && icon.buttonType !== 0 ? icon.buttonType : win.workButton;
    if (icon && icon.buttonType === 0) icon = icon; // reported with icon but work-area button type
    if (icon?.shaded) return;
    const base = { button, buttons: BUT[button], x: wp.x, y: wp.y, sx: p.x, sy: p.y, icon, iconIndex: icon?.handle ?? -1, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, window: win };
    if (button === 'menu') {
      if (btype === 0 && !win.menu && !win.hasListeners('click')) return;
      this._reportMenuClick(win, e, p, icon);
      return;
    }
    if (btype === 0) return;
    const emit = (kind, extra = {}) => win.emit(kind === 'double' ? 'doubleclick' : kind === 'drag' ? 'drag' : 'click', { ...base, kind, ...extra });
    // double-click tracking
    const now = performance.now();
    const last = this._lastClick;
    const isDouble = last && last.win === win && last.icon === icon && last.button === button && now - last.t < input.config.doubleClickMs && Math.abs(last.x - p.x) + Math.abs(last.y - p.y) < input.config.doubleClickMove;
    this._lastClick = isDouble ? null : { win, icon, button, t: now, x: p.x, y: p.y };
    if ([5, 8, 10].includes(btype) && !isDouble) this._doublePtrOn(p); else this._doublePtrOff();

    const selects = [4, 5, 7, 8, 11].includes(btype);
    const doSelect = () => { if (icon && selects) this._selectIcon(win, icon, button); };
    const withDrag = [6, 7, 8, 10, 11, 14].includes(btype);
    const trackDrag = (onDrag, onRelease) => {
      let dragged = false;
      const ox = p.x, oy = p.y, t0 = performance.now();
      startPointerDrag(e, {
        onMove: (q, ev) => {
          if (dragged) return;
          if (Math.abs(q.x - ox) + Math.abs(q.y - oy) >= input.config.dragMove) {
            dragged = true;
            onDrag?.(q, ev);
          }
        },
        onEnd: (q, ev) => { if (!dragged) onRelease?.(q, ev); },
      });
    };
    const dragEvent = (q) => emit('drag', { startSX: p.x, startSY: p.y, pointerEvent: e });

    switch (btype) {
      case 1: case 3:
        emit('click');
        break;
      case 2:
        autoRepeat(() => emit('click'), 400, 60);
        break;
      case 4:
        doSelect();
        trackDrag(null, (q, ev) => {
          const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.icon')?._icon;
          if (icon) this._selectIcon(win, icon, button, false);
          if (over === icon) emit('click');
        });
        break;
      case 5:
        if (isDouble) emit('double'); else doSelect();
        break;
      case 6:
        emit('click');
        trackDrag(dragEvent);
        break;
      case 7:
        doSelect();
        trackDrag(dragEvent, () => emit('click'));
        break;
      case 8:
        if (isDouble) { emit('double'); break; }
        doSelect();
        trackDrag(dragEvent);
        break;
      case 9:
        emit('click');
        break;
      case 10:
        if (isDouble) { emit('double'); break; }
        emit('click');
        trackDrag(dragEvent);
        break;
      case 11:
        doSelect();
        emit('click');
        trackDrag(dragEvent);
        break;
      case 14: case 15:
        if (icon && icon.writable) {
          this.setCaret(win, icon, icon.indexAt(wp.x));
          if (btype === 14) trackDrag(dragEvent);
        } else emit('click');
        break;
      default:
        emit('click');
    }
  }

  /** Implicit icon selection with ESG rules (Wimp03 selecticon). */
  _selectIcon(win, icon, button, on = null) {
    if (on === false) { icon.setState({ selected: false }); return; }
    const esg = icon.esg;
    const adjust = button === 'adjust';
    if (esg === 0) { icon.setState({ selected: !icon.selected }); return; }
    if (!(icon.flags & IF.adjustNoCancel && adjust)) {
      for (const o of win.esgIcons(esg)) if (o !== icon && o.selected) o.setState({ selected: false });
    }
    if (adjust) icon.setState({ selected: !icon.selected });
    else if (!icon.selected) icon.setState({ selected: true });
  }

  // ------------------------------------------------------------------ keyboard
  _keyDown(e) {
    if (e.target?.closest?.('input,textarea,[contenteditable]') && !e.target.closest('.screen')) return;
    const k = keyCode(e);
    if (!k) return;
    // Global hot keys (Wimp_ProcessKey fall-backs)
    if (this.fullscreenHandler) { if (this.fullscreenHandler(e, k) !== false) { e.preventDefault(); return; } }
    if (this.cli?.active) { this.cli.key(e, k); e.preventDefault(); return; }
    if (k.code === 0x1CC) { e.preventDefault(); this.emit('hotkey:F12', {}); return; }             // F12
    if (k.code === 0x1EC) { e.preventDefault(); this.emit('hotkey:CtrlF12', {}); return; }         // Ctrl-F12
    if (k.code === 0x1DC) { e.preventDefault(); this.toggleIconbarFront(); return; }                // Shift-F12
    if (k.code === 0x1FC) { e.preventDefault(); this.emit('hotkey:CtrlShiftF12', {}); return; }    // Ctrl-Shift-F12
    if (this.modal) { if (this.modal.onKey?.(e, k)) e.preventDefault(); return; }
    if (this.menus?.isOpen && this.menus.key(e, k)) { e.preventDefault(); return; }
    const c = this.caret;
    let handled = false;
    if (c?.window?.isOpen) {
      if (c.icon && c.icon.writable) handled = this._editKey(c, k, e);
      if (!handled) {
        const ev = c.window.emit('key', { code: k.code, char: k.char, key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, icon: c.icon, window: c.window, domEvent: e });
        handled = ev.handled || ev.defaultPrevented;
      }
    }
    if (!handled) {
      // hot keys: windows with the hot-keys flag, top first
      for (let i = this.stack.length - 1; i >= 0 && !handled; i--) {
        const w = this.stack[i];
        if (w.hasFlag(1 << 12) && w !== c?.window) {
          const ev = w.emit('hotkey', { code: k.code, char: k.char, key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey });
          handled = ev.handled || ev.defaultPrevented;
        }
      }
    }
    if (!handled) {
      const ev = this.emit('key', { code: k.code, char: k.char, key: e.key });
      handled = ev.handled;
    }
    // stop browser defaults for keys the desktop owns
    if (handled || c || /^F\d+$/.test(e.key) || ['Tab', 'Backspace', ' '].includes(e.key)) {
      if (!(e.metaKey && ['c', 'v', 'x', 'r', 'l'].includes(e.key.toLowerCase()))) e.preventDefault();
    }
  }

  /**
   * Wimp_ProcessKey: deliver a key code (as if typed) to the input focus owner (writable icon
   * editing first, then the window's 'key' handler, then hot-key windows). Returns true if used.
   */
  processKey(code, char = code >= 32 && code < 256 && code !== 127 ? String.fromCharCode(code) : '') {
    const k = { code, char };
    const c = this.caret;
    let handled = false;
    if (c?.window?.isOpen) {
      if (c.icon && c.icon.writable) handled = this._editKey(c, k, null);
      if (!handled) {
        const ev = c.window.emit('key', { code, char, key: char, shift: false, ctrl: false, alt: false, icon: c.icon, window: c.window });
        handled = ev.handled || ev.defaultPrevented;
      }
    }
    for (let i = this.stack.length - 1; i >= 0 && !handled; i--) {
      const w = this.stack[i];
      if (w.hasFlag(1 << 12) && w !== c?.window) { const ev = w.emit('hotkey', { code, char, key: char }); handled = ev.handled || ev.defaultPrevented; }
    }
    return handled;
  }

  _paste(e) {
    const c = this.caret;
    const text = e.clipboardData?.getData('text');
    if (!text || !c?.window) return;
    if (c.icon?.writable) {
      for (const ch of text.replace(/[\r\n].*$/s, '')) this._editKey(c, { code: ch.charCodeAt(0), char: ch }, null);
    } else {
      c.window.emit('paste', { text });
    }
  }

  /** Writable icon editing (Wimp's built-in behaviour). Returns true if handled. */
  _editKey(c, k, e) {
    const ic = c.icon, win = c.window;
    const t = ic.text;
    let i = c.index;
    const set = (text, idx) => { ic._text = text; c.index = idx; ic.render(); this._drawCaret(); win.emit('iconchanged', { icon: ic }); };
    const moveTo = (idx) => { c.index = clamp(idx, 0, ic.text.length); ic.render(); this._drawCaret(); };
    const writables = win.icons.filter((x) => x && x.writable && !x.deleted && !x.shaded);
    const next = (d) => {
      const j = writables.indexOf(ic);
      const n = writables[(j + d + writables.length) % writables.length];
      if (n && n !== ic) this.setCaret(win, n, n.text.length);
    };
    switch (k.code) {
      case 0x18C: moveTo(i - 1); return true;                        // left
      case 0x18D: moveTo(i + 1); return true;                        // right
      case 0x19C: case 0x1AC: moveTo(0); return true;                // shift/ctrl left
      case 0x19D: case 0x1AD: moveTo(t.length); return true;         // shift/ctrl right
      case 30: moveTo(0); return true;                               // Home
      case 8: case 127:                                              // Backspace / Delete (left)
        if (i > 0) set(t.slice(0, i - 1) + t.slice(i), i - 1);
        return true;
      case 0x18B:                                                    // Copy: delete right
        if (i < t.length) set(t.slice(0, i) + t.slice(i + 1), i);
        return true;
      case 0x19B: set(t.slice(0, i), i); return true;               // shift-copy: delete to end
      case 21: set('', 0); return true;                              // Ctrl-U: clear
      case 0x18E: case 0x18A: if (writables.length > 1) { next(1); return true; } return false;  // down / tab
      case 0x18F: case 0x19A: if (writables.length > 1) { next(-1); return true; } return false; // up / shift-tab
      case 13:
        // Return: move to next writable icon unless it's the last one; always report to app
        return false;
      default:
        if (k.char && k.code >= 32 && k.code !== 127 && !e?.ctrlKey && !e?.metaKey) {
          const A = ic.v.A?.[0];
          if (A != null && !allowedChar(A, k.char)) return false;   // not allowed: passed on to the task (Key_Pressed), as the Wimp does
          if (t.length >= ic.maxLen) { this.beep(); return true; }
          set(t.slice(0, i) + k.char + t.slice(i), i + 1);
          return true;
        }
    }
    return false;
  }

  beep() {
    const gain = this.config.beepGain ?? 0.08;     // *Configure Volume / loud-quiet beep / speaker (config.js)
    if (!gain) return;
    try {
      const ac = this._ac ??= new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'square'; o.frequency.value = 880;
      g.gain.setValueAtTime(gain, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25);
      o.connect(g).connect(ac.destination);
      o.start(); o.stop(ac.currentTime + 0.25);
    } catch { /* no audio */ }
  }

  toggleIconbarFront() {
    if (!this.iconbar) return;
    this.iconbarFront = !this.iconbarFront;
    this.iconbar.window.open({ behind: this.iconbarFront ? 'top' : 'bottom' });
  }

  // ------------------------------------------------------------------ drags
  /**
   * Drag a box (Wimp_DragBox). opts:
   *  type: 'fixed' (box moves with pointer) | 'rubber' (one corner fixed) | 'point' (no box)
   *  box: {x0,y0,x1,y1} screen coords, bounds: {x0,y0,x1,y1} (optional)
   *  sprite: SpriteInfo|name (DragASprite: sprite follows the pointer instead of a box)
   *  event: the originating pointer event (drag must start while a button is held)
   *  onMove(state), onEnd(drop) where drop = {sx, sy, box, window, icon, x, y, target}
   * Returns a Promise resolving to the drop info.
   */
  drag(opts) {
    return new Promise((resolve) => {
      const L = this.layers.drag;
      const start = { x: input.mouseX, y: input.mouseY };
      const box0 = opts.box ?? { x0: start.x, y0: start.y, x1: start.x, y1: start.y };
      let box = { ...box0 };
      let node = null;
      if (opts.sprite || opts.sprites) {
        node = el('div', 'drag-sprite', L);
        const list = opts.sprites ?? [{ sprite: opts.sprite, dx: 0, dy: 0 }];
        let nw = 0, nh = 0;
        for (const s of list) {
          const im = sprites.img(s.sprite, { area: opts.area });
          im.style.position = 'absolute';
          im.style.left = (s.dx ?? 0) + 'px'; im.style.top = (s.dy ?? 0) + 'px';
          node.appendChild(im);
          nw = Math.max(nw, (s.dx ?? 0) + (im._sprite?.cssW ?? 34)); nh = Math.max(nh, (s.dy ?? 0) + (im._sprite?.cssH ?? 34));
        }
        // size the node (its hatching mask covers only its box), plus the drop shadow
        node.style.width = nw + 4 + 'px'; node.style.height = nh + 4 + 'px';
      } else if (opts.type !== 'point') {
        node = el('div', 'drag-box', L);
      }
      const place = () => {
        if (!node) return;
        const x0 = Math.min(box.x0, box.x1), y0 = Math.min(box.y0, box.y1);
        node.style.left = x0 + 'px'; node.style.top = y0 + 'px';
        if (!opts.sprite && !opts.sprites) { node.style.width = Math.abs(box.x1 - box.x0) + 'px'; node.style.height = Math.abs(box.y1 - box.y0) + 'px'; }
      };
      const bounds = opts.bounds;
      const upd = (q) => {
        let dx = q.x - start.x, dy = q.y - start.y;
        if (opts.type === 'rubber') {
          box = { x0: box0.x0, y0: box0.y0, x1: box0.x1 + dx, y1: box0.y1 + dy };
          if (bounds) { box.x1 = clamp(box.x1, bounds.x0, bounds.x1); box.y1 = clamp(box.y1, bounds.y0, bounds.y1); }
        } else {
          if (bounds) {
            dx = clamp(dx, bounds.x0 - box0.x0, bounds.x1 - box0.x1);
            dy = clamp(dy, bounds.y0 - box0.y0, bounds.y1 - box0.y1);
          }
          box = { x0: box0.x0 + dx, y0: box0.y0 + dy, x1: box0.x1 + dx, y1: box0.y1 + dy };
        }
        place();
        opts.onMove?.({ box, sx: q.x, sy: q.y });
      };
      place();
      this.dragging = true;
      const finish = (q, ev) => {
        node?.remove();
        this.dragging = false;
        const drop = this.hitTest(q.x, q.y, ev);
        const info = { ...drop, box, sx: q.x, sy: q.y, shift: ev?.shiftKey, ctrl: ev?.ctrlKey };
        opts.onEnd?.(info);
        resolve(info);
      };
      startPointerDrag(opts.event ?? {}, { onMove: upd, onEnd: finish });
    });
  }

  /**
   * Interactive help (Message_HelpRequest): the help text for whatever is at screen point (sx, sy),
   * or null. Asks, in order: an open menu item's `help`, the window's 'helprequest' handlers
   * (set ev.text), icon.help, window.helpText. Text uses the RISC OS !Help conventions
   * (\S = "Click SELECT to", \A ADJUST, \R "Move the pointer right to", |M = new line).
   */
  helpAt(sx, sy) {
    const hit = this.hitTest(sx, sy);
    const menuEl = hit.element?.closest?.('.menu');
    if (menuEl) {
      const lv = this.menus?.levels.find((l) => l.win.el === menuEl);
      if (lv && !lv.isDbox) {
        const i = this.menus._rowAt(lv, sy);
        const it = lv.menu.items[i];
        const h = typeof it?.help === 'function' ? it.help() : it?.help;
        return h ?? lv.menu.opts?.help ?? null;
      }
    }
    const w = hit.window;
    if (!w) return null;
    const ev = w.emit('helprequest', { x: hit.x, y: hit.y, icon: hit.icon, sx, sy, text: null });
    if (ev.text) return ev.text;
    if (hit.icon?._ib?.help) return typeof hit.icon._ib.help === 'function' ? hit.icon._ib.help() : hit.icon._ib.help;
    if (hit.icon?.help) return hit.icon.help;
    return typeof w.helpText === 'function' ? w.helpText(hit) : (w.helpText ?? null);
  }

  /** Wimp_DragBox type 1/2: move (or resize) a window from a work-area drag. ev = the 'drag' event. */
  dragWindow(win, ev, { resize = false } = {}) {
    const sx = win.x, sy = win.y, sw = win.w, sh = win.h, ox = ev.sx, oy = ev.sy;
    startPointerDrag(ev.pointerEvent ?? {}, {
      onMove: (q) => win.requestOpen(resize ? { w: sw + q.x - ox, h: sh + q.y - oy, behind: 'keep' } : { x: sx + q.x - ox, y: sy + q.y - oy, behind: 'keep' }),
    });
  }

  /** What is at screen point (sx, sy)? Returns {window, icon, x, y, element}. */
  hitTest(sx, sy, ev) {
    const r = this.screen.getBoundingClientRect();
    const cx = ev?.clientX ?? r.left + sx * this.scale, cy = ev?.clientY ?? r.top + sy * this.scale;
    const L = this.layers.drag;
    L.style.display = 'none';
    const elx = document.elementFromPoint(cx, cy);
    L.style.display = '';
    const win = elx?.closest?.('.win')?._win ?? null;
    if (!win) return { window: null, icon: null, element: elx };
    const wp = win.screenToWork(sx, sy);
    const iconEl = elx.closest('.icon');
    const icon = iconEl?._icon ?? win.iconAt(wp.x, wp.y);
    return { window: win, icon, x: wp.x, y: wp.y, element: elx, part: elx.closest('[data-part]')?.dataset.part };
  }

  // ------------------------------------------------------------------ data transfer
  /**
   * Deliver files (DataLoad) to whatever is at a drop point. files: [{path, filetype, size}]
   * drop: result of hitTest/drag. from: sending task (e.g. Filer).
   * The receiving window gets a 'dataload' event {files, x, y, icon, window}; its task also gets
   * a 'DataLoad' message. Returns true if someone accepted.
   */
  dataLoad(drop, files, from = null) {
    const win = drop.window;
    if (!win) return false;
    const ev = { files, path: files[0]?.path, filetype: files[0]?.filetype, x: drop.x, y: drop.y, sx: drop.sx, sy: drop.sy, icon: drop.icon, window: win, from, shift: drop.shift };
    const r = win.emit('dataload', ev);
    if (r.handled || r.defaultPrevented) return true;
    const t = this.sendMessage('DataLoad', ev, { to: win.task, from });
    return !!t;
  }

  /**
   * Save protocol (DataSave -> DataSaveAck -> write -> DataLoad), used by save boxes.
   * The target window receives 'datasave' {leafname, filetype, size, x, y, icon, getData, accept}
   * A Filer window accepts by calling ev.accept(fullPath); an application window can instead
   * call ev.receive() to obtain the data directly (RAM transfer). Returns {path} | {data} | null.
   */
  async dataSave(drop, { leafname, filetype, size = 0, getData }, from = null) {
    const win = drop.window;
    if (!win) return null;
    let result = null, pending = null;
    const ev = {
      leafname, filetype, size, x: drop.x, y: drop.y, icon: drop.icon, window: win, from,
      accept: (path) => { result = { path }; },
      receive: () => (pending ??= (async () => { const data = await getData(); result = { data }; return data; })()),
    };
    const r = win.emit('datasave', ev);
    const claimed = !result && !r.handled ? this.sendMessage('DataSave', ev, { to: win.task, from }) : null;
    if (!result && pending) { try { await pending; } catch { return null; } }
    // a receiver that claimed the save but fetches the data later (after opening a window) still counts
    return result ?? (r.handled || claimed ? { handled: true } : null);
  }

  // ------------------------------------------------------------------ misc services
  /** Wimp_ReportError: implemented in dialogs.js (installed at boot). */
  reportError(message, opts = {}) {
    if (this._reportError) return this._reportError(message, opts);
    console.error(message);
    return Promise.resolve(1);
  }

  /** Read the current time in centiseconds (like OS_ReadMonotonicTime). */
  get monotonicTime() { return Math.floor(performance.now() / 10); }
  get fonts() { return fonts; }
  get sprites() { return sprites; }
}

export const wimp = new Wimp();
globalThis.wimp = wimp;
