// !Browse's windows: Browse 2's look (the button bar, URL bar and status bar panes from its Templates, with
// the spinning globe), a tab bar when there's more than one page, and the page itself: pictures from the
// engine drawn on a canvas, with the mouse and keys sent back (./engine.js), or, with no engine, the page in
// a frame ("embedded").
import { wimp } from '../../core/wimp.js';
import { Menu } from '../../core/menu.js';
import { input } from '../../core/input.js';
import { sprites } from '../../core/sprites.js';
import { fonts } from '../../core/fonts.js';
import { keyEvents, isShortcut, modifiers } from './keys.js';
import { Engine } from './engine.js';

const BUTTONBAR_H = 40, URLBAR_H = 36, TABBAR_H = 26, STATUS_H = 48, GAP = 2;
// button bar icons (Bookworm's Templates, as Browse's: Button.c button_icons[])
export const B = { HOME: 0, FWD: 1, EXPORT: 2, RELOAD: 3, RESOURCES: 4, HOTLIST: 5, STOP: 6, BACK: 7, ADDHOT: 8, IMAGES: 9 };
const ZOOMS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const FRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-pointer-lock allow-presentation';

let frameFocusWatch = false;

export class BrowserWindow {
  /** app: the application (./main.js): {task, engine, mode, tpl, spr, prefs, windows, ...} */
  constructor(app, opts = {}) {
    this.app = app;
    const { task } = app;
    this.tabs = [];
    this.current = null;
    this.bars = { tool: app.prefs.toolbar, url: app.prefs.urlbar, status: app.prefs.statusbar };
    this.anim = 0;
    this.statusNote = '';
    app.windows.add(this);

    const r = wimp.screenRect(false);
    const n = app.windows.size - 1;
    const W = opts.w ?? Math.min(900, r.w - 80), H = opts.h ?? Math.min(700, wimp.height - 140);
    const x = opts.x ?? Math.round((wimp.width - W) / 2 - 20 + n * 24), y = opts.y ?? Math.round(Math.max(40, (wimp.height - H) / 2 - 20 + n * 24));
    const w = this.win = task.createWindow({
      title: 'Browse', x, y, w: W, h: H, extent: { w: 4096, h: 3072 }, minW: 320, minH: 200,
      // scroll bars that follow the page's; the window may be made bigger than the page (which fits it)
      flags: { back: true, close: true, title: true, toggle: true, size: true, moveable: true, vscroll: true, hscroll: true, ignoreRight: true, ignoreBottom: true },
      colours: { workBg: 1 }, workButton: 'click',
    });
    w.titleBufLen = 256;
    w.menu = () => this.menu();
    w.helpText = 'This is a !Browse window, showing a web page.|MClick MENU for the page\'s menu: saving, the hotlist, tabs, zoom and more.';
    w.on('click', () => true);
    w.on('key', (ev) => this.key(ev));
    w.on('paste', (ev) => { this.current?.send?.({ op: 'text', text: ev.text }); return true; });
    w.on('dataload', (ev) => this.dataLoad(ev));
    w.on('close', (ev) => { ev.preventDefault(); if (ev.button === 'adjust' || ev.shift) { this.closeTab(this.current); } else this.destroy(); });
    for (const e of ['opened', 'moved']) w.on(e, () => this.layout());
    // the scroll bars moved by the user: scroll the page to match
    w.on('open', (ev) => {
      const s = this.current?.scroll;
      if (this._syncing || !s || !s.vw || !s.vh) return;
      if (ev.scrollX !== w.scrollX || ev.scrollY !== w.scrollY) {
        const x = Math.max(0, Math.round((ev.scrollX ?? 0) * s.vw / w.w)), y = Math.max(0, Math.round((ev.scrollY ?? 0) * s.vh / w.h));
        Object.assign(s, { x, y });
        this.current.send({ op: 'scrollTo', x, y });
      }
    });
    w.on('closed', () => this.syncPanes());
    w.on('gaincaret', () => this.current?.focus?.(true));
    w.on('losecaret', () => this.current?.focus?.(false));

    // panes: the button bar, the URL bar, the tab bar and the status bar
    const { tpl, spr } = app;
    this.bbar = task.createWindowFromTemplate(tpl, 'buttonbar', { spriteArea: spr });
    this.urlbar = task.createWindowFromTemplate(tpl, 'URLbar', { spriteArea: spr });
    this.status = task.createWindowFromTemplate(tpl, 'InfoBar', { spriteArea: spr });
    this.tabbar = task.createWindow({ title: '', x: 0, y: 0, w: 200, h: TABBAR_H, extent: { w: 4096, h: TABBAR_H }, flags: { pane: true }, colours: { workBg: 1 }, workButton: 'click' });
    for (const p of [this.bbar, this.urlbar, this.status, this.tabbar]) {
      p._paneParent = w;
      p.menu = () => this.menu();
    }
    for (const i of [B.EXPORT, B.RESOURCES, B.IMAGES]) this.bbar.icons[i].setState({ deleted: true });
    const help = {
      [B.HOME]: 'Click SELECT to show your home page.', [B.BACK]: 'Click SELECT to go back to the page before this one.',
      [B.FWD]: 'Click SELECT to go forward again.', [B.RELOAD]: 'Click SELECT to fetch this page again.|MClick ADJUST to fetch it again without using anything kept from before.',
      [B.STOP]: 'Click SELECT to stop fetching this page.', [B.ADDHOT]: 'Click SELECT to add this page to your hotlist.',
      [B.HOTLIST]: 'Click SELECT to choose a page from your hotlist.',
    };
    this.bbar.icons.forEach((ic, i) => { ic.help = help[i]; });
    this.bbar.helpText = 'This is the button bar.';
    this.bbar.on('click', (ev) => { if (ev.iconIndex >= 0 && ev.button !== 'menu') { this.button(ev.iconIndex, ev); return true; } });
    const U = this.urlbar.icons;
    U[2].bufLen = 2048;
    U[1].help = 'Click SELECT to choose from the pages you have visited.';
    U[2].help = 'This is the address of the page.|MType an address, or words to search for, and press Return.';
    this.urlbar.helpText = 'This is the URL bar.';
    this.urlbar.on('click', (ev) => { if (ev.iconIndex === 1 && ev.button !== 'menu') { this.app.listWindow('history', this).openAt(ev); return true; } });
    this.urlbar.on('key', (ev) => {
      if (ev.code === 13) { const t = U[2].text.trim(); if (t) { this.go(this.app.fixURL(t)); this.focusPage(); } return true; }
      if (ev.code === 27) { U[2].setText(this.current?.url ?? ''); this.focusPage(); return true; }
      return this.hotKey(ev);
    });
    this.status.helpText = 'This is the status bar.|MIt shows what !Browse is doing, and where a link goes when the pointer is over it.';
    this.status.icons[0].bufLen = 2048;
    this.status.icons[3].bufLen = 16;
    this.status.icons[3].help = 'This is the page\'s zoom.|MChange it from the Display menu.';
    this.tabbar.helpText = 'This is the tab bar.|MClick SELECT on a tab to show its page, ADJUST to close it.|MClick SELECT on + for a new tab.';
    this.tabbar.on('click', (ev) => this.tabClick(ev));

    // the page area
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'browse-page';
    Object.assign(this.canvas.style, { position: 'absolute', left: '0', top: '0', display: 'none', touchAction: 'none' });
    w.view.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d');
    this.note = document.createElement('div');
    this.note.className = 'browse-note';
    Object.assign(this.note.style, { position: 'absolute', left: '0', top: '0', display: 'none', boxSizing: 'border-box', padding: '32px', background: '#fff', color: '#000', font: fonts.cssFor('Homerton.Medium', 12), overflow: 'auto', userSelect: 'text' });
    w.view.appendChild(this.note);
    this.pointerInput();

    this.setButtons();
    w.open({ x, y, w: W, h: H, behind: 'top' });
    this.layout();
    if (!frameFocusWatch) {
      frameFocusWatch = true;
      // a click in an embedded page takes the keyboard away from the desktop: bring its window forward
      window.addEventListener('blur', () => setTimeout(() => {
        const f = document.activeElement;
        if (f?.tagName === 'IFRAME' && f._browse) f._browse.frameFocused();
      }, 0));
    }
  }

  get task() { return this.app.task; }

  // ---------------------------------------------------------------- geometry
  pageRect() {
    let top = 0;
    if (this.bars.tool) top += BUTTONBAR_H + GAP;
    if (this.bars.url) top += URLBAR_H + GAP;
    if (this.showTabs()) top += TABBAR_H + GAP;
    const bottom = this.bars.status ? STATUS_H + GAP : 0;
    return { x: 0, y: top, w: this.win.w, h: Math.max(16, this.win.h - top - bottom) };
  }
  showTabs() { return this.app.prefs.alwaysTabs || this.tabs.length > 1; }

  layout() {
    this.syncPanes();
    const r = this.pageRect();
    for (const el of [this.canvas, this.note]) Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    if (this.canvas.width !== r.w || this.canvas.height !== r.h) {
      this.canvas.width = r.w; this.canvas.height = r.h;
      this.current?.paint?.();
    }
    for (const t of this.tabs) t.resize?.(r);
    this.syncScroll();
  }

  /** Scroll bars as the page's: the extent is to the window as the page is to its view. */
  syncScroll() {
    const w = this.win, s = this.current?.scroll;
    if (!w.isOpen || this._syncing) return;
    const W = w.w, H = w.h;
    let ext = { x1: W, y1: H }, sx = 0, sy = 0;
    if (s && s.vw > 0 && s.vh > 0) {
      const kx = W / s.vw, ky = H / s.vh;
      ext = { x1: Math.max(W, Math.round(s.w * kx)), y1: Math.max(H, Math.round(s.h * ky)) };
      sx = Math.min(Math.round(s.x * kx), ext.x1 - W); sy = Math.min(Math.round(s.y * ky), ext.y1 - H);
    }
    this._syncing = true;
    try {
      const e = w.extent;
      if (e.x1 !== ext.x1 || e.y1 !== ext.y1 || e.x0 || e.y0) w.setExtent({ x0: 0, y0: 0, x1: ext.x1, y1: ext.y1 });
      if (w.scrollX !== sx || w.scrollY !== sy) w.open({ scrollX: sx, scrollY: sy, behind: 'keep' });
    } finally { this._syncing = false; }
  }

  syncPanes() {
    const w = this.win;
    let y = 0;
    const place = (p, on, h, dy = null) => {
      if (!w.isOpen || !on) { if (p.isOpen) p.close(); return; }
      p.open({ x: w.x, y: w.y + (dy ?? y), w: w.w, h, scrollX: 0, scrollY: 0, behind: 'keep' });
      if (dy == null) y += h + GAP;
    };
    place(this.bbar, this.bars.tool, BUTTONBAR_H);
    place(this.urlbar, this.bars.url, URLBAR_H);
    place(this.tabbar, this.showTabs(), TABBAR_H);
    place(this.status, this.bars.status, STATUS_H, w.h - STATUS_H);
    for (const p of [this.bbar, this.urlbar, this.tabbar, this.status]) if (p.isOpen) wimp._stackAbove(p, w);
    // stretch the URL field and the status line with the window
    const U = this.urlbar.icons, S = this.status.icons, W = w.w;
    const fit = (ic, x0, x1) => { const b = ic.bbox; if (b.x0 !== x0 || b.x1 !== x1) ic.moveTo({ x0, y0: b.y0, x1, y1: b.y1 }); };
    fit(U[1], W - 30, W - 8);
    fit(U[2], U[2].bbox.x0, W - 34);
    fit(S[3], W - 76, W - 8);
    fit(S[0], S[0].bbox.x0, W - 84);
  }

  toggleBar(which) {
    this.bars[which] = !this.bars[which];
    this.layout();
  }

  // ---------------------------------------------------------------- tabs
  async newTab(url, opts = {}) {
    const tab = this.app.engine ? new PageTab(this) : new FrameTab(this);
    this.tabs.splice(opts.after != null ? this.tabs.indexOf(opts.after) + 1 : this.tabs.length, 0, tab);
    if (!opts.background || !this.current) this.select(tab);
    this.drawTabs();
    this.layout();
    try {
      await tab.start(url, opts);
    } catch (e) {
      this.task.reportError(e.message);
    }
    this.drawTabs();
    return tab;
  }

  select(tab) {
    if (this.current === tab) return;
    this.current?.show(false);
    this.current = tab;
    tab.show(true);
    this.update();
    this.drawTabs();
  }

  closeTab(tab) {
    if (!tab) return;
    if (this.tabs.length <= 1) { this.destroy(); return; }
    const i = this.tabs.indexOf(tab);
    this.tabs.splice(i, 1);
    tab.close();
    if (this.current === tab) { this.current = null; this.select(this.tabs[Math.min(i, this.tabs.length - 1)]); }
    this.drawTabs();
    this.layout();
  }

  /** The engine closed a tab (the page closed itself, or the engine stopped). */
  tabGone(tab) {
    if (!this.tabs.includes(tab)) return;
    if (this.tabs.length <= 1) { this.destroy(); return; }
    this.closeTab(tab);
  }

  drawTabs() {
    const p = this.tabbar;
    const W = this.win.w - 40;
    const tw = Math.max(60, Math.min(200, Math.floor(W / Math.max(1, this.tabs.length))));
    const fit = (s) => { const max = Math.floor((tw - 12) / 7); return s.length > max ? s.slice(0, Math.max(1, max - 1)) + '\u2026' : s; };
    // rebuild: there are few enough icons that this is simplest
    for (let i = p.icons.length - 1; i >= 0; i--) p.deleteIcon(i);
    this.tabs.forEach((t, i) => {
      const cur = t === this.current;
      const ic = p.addIcon({ x: 2 + i * tw, y: 2, w: tw - 4, h: TABBAR_H - 4, text: fit(t.title || t.url || 'New tab'), border: true, filled: true, bg: cur ? 0 : 1, fg: 7, hcentre: false, validation: cur ? 'R2' : 'R1', button: 'click' });
      ic.help = `${t.title || 'A new tab'}|MClick SELECT to show this page, ADJUST to close it.`;
      ic._tab = t;
    });
    const plus = p.addIcon({ x: 2 + this.tabs.length * tw, y: 2, w: 26, h: TABBAR_H - 4, text: '+', border: true, filled: true, bg: 1, validation: 'R5', button: 'click' });
    plus.help = 'Click SELECT for a new tab.';
    plus._plus = true;
    if (this.tabbar.isOpen !== this.showTabs()) this.layout();
  }

  tabClick(ev) {
    if (ev.button === 'menu') return;
    const ic = ev.icon;
    if (!ic) return true;
    if (ic._plus) { this.newTab(this.app.prefs.home); this.focusURL(); return true; }
    if (ev.button === 'adjust') this.closeTab(ic._tab); else { this.select(ic._tab); this.focusPage(); }
    return true;
  }

  // ---------------------------------------------------------------- the current page's state
  update() {
    const t = this.current;
    if (!t) return;
    this.win.setTitle(t.title || t.url || 'Browse');
    const U = this.urlbar.icons[2];
    if (!(wimp.caret?.window === this.urlbar && wimp.caret.icon === U) || U._shown !== t.url) {
      if (!(wimp.caret?.window === this.urlbar && wimp.caret.icon === U)) { U.setText(t.url ?? ''); U._shown = t.url; }
    }
    this.status.icons[3].setText(`${Math.round((t.zoom ?? 1) * 100)}%`);
    this.setStatus();
    this.setButtons();
    this.spin(!!t.loading);
    this.syncScroll();
    this.canvas.style.cursor = this.cursorFor(t.cursor);
  }

  tabChanged(t) {
    if (t === this.current) this.update();
    if (t._shownTitle !== t.title) { t._shownTitle = t.title; this.drawTabs(); }
  }

  setStatus() {
    const t = this.current;
    let s;
    if (t?.link) s = t.link;
    else if (this.statusNote) s = this.statusNote;
    else if (t?.error) s = t.error;
    else if (t?.loading) s = `Fetching '${t.url}'...`;
    else if (t?.notice) s = t.notice;
    else s = 'Ready';
    if (s !== this.statusText) { this.statusText = s; this.status.icons[0].setText(s); }
  }
  note_(s, ms = 4000) {
    this.statusNote = s;
    this.setStatus();
    clearTimeout(this._noteTimer);
    if (ms) this._noteTimer = setTimeout(() => { this.statusNote = ''; this.setStatus(); }, ms);
  }

  spin(on) {
    if (on && !this.animStop) {
      const n = this.app.animLength;
      this.animStop = this.task.every(60, () => {
        this.anim = this.anim + 1 >= n ? 1 : this.anim + 1;
        this.status.icons[2]?.setValidation('Sa' + this.anim);
      });
    } else if (!on && this.animStop) {
      this.animStop(); this.animStop = null;
      this.anim = 0;
      this.status.icons[2]?.setValidation('Sa0');
    }
  }

  grey(b) {
    const t = this.current;
    switch (b) {
      case B.BACK: return !t?.canBack;
      case B.FWD: return !t?.canForward;
      case B.STOP: return !t?.loading;
      case B.RELOAD: return !t?.url;
      case B.ADDHOT: return !t?.url;
      case B.HOTLIST: return this.app.hotlist.length === 0;
    }
    return false;
  }
  setButtons() {
    this.bbar.icons.forEach((ic, i) => { if (![B.EXPORT, B.RESOURCES, B.IMAGES].includes(i)) ic.setState({ shaded: this.grey(i) }); });
  }
  button(i, ev) {
    if (this.grey(i)) return;
    const t = this.current;
    switch (i) {
      case B.HOME: this.go(this.app.prefs.home); break;
      case B.BACK: t.back(); break;
      case B.FWD: t.forward(); break;
      case B.RELOAD: t.reload(ev.button === 'adjust'); break;
      case B.STOP: t.stop(); break;
      case B.ADDHOT: this.app.addHot(t); break;
      case B.HOTLIST: this.app.listWindow('hot', this).openAt(ev); return;
    }
    this.focusPage();
  }

  go(url) {
    if (!url) return;
    if (!this.current) { this.newTab(url); return; }
    this.current.go(url);
  }

  focusPage() { if (this.win.isOpen) wimp.setCaret(this.win); }
  focusURL() {
    if (!this.bars.url) this.toggleBar('url');
    const ic = this.urlbar.icons[2];
    wimp.setCaret(this.urlbar, ic, ic.text.length);
  }
  frameFocused() {
    // an embedded page took the keyboard (a click in it): as the Wimp would, bring its window to the front
    if (!this.win.isOpen) return;
    this.win.bringToFront();
    this.syncPanes();
  }

  // ---------------------------------------------------------------- pointer and keys (engine pages)
  pointerInput() {
    const c = this.canvas;
    let down = null, lastClick = { t: 0, x: 0, y: 0, n: 0, button: '' };
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height };
    };
    const tab = () => this.current instanceof PageTab ? this.current : null;
    c.addEventListener('pointerdown', (e) => {
      const t = tab();
      const b = input.button(e);
      this.app.engine?.wake();
      if (!t || !b || b === 'menu') return;          // Menu: the Wimp opens the window's menu
      const p = pos(e);
      const button = b === 'adjust' ? 'middle' : 'left';
      const now = performance.now();
      const same = now - lastClick.t < 500 && Math.abs(p.x - lastClick.x) < 5 && Math.abs(p.y - lastClick.y) < 5 && lastClick.button === button;
      lastClick = { t: now, x: p.x, y: p.y, n: same ? lastClick.n + 1 : 1, button };
      down = { button, pointerId: e.pointerId };
      if (b === 'adjust') this.app.adjustAt = now;
      try { c.setPointerCapture(e.pointerId); } catch { /* ok */ }
      t.send({ op: 'mouse', type: 'mousePressed', x: p.x, y: p.y, button, buttons: button === 'left' ? 1 : 4, clickCount: lastClick.n, modifiers: modifiers(e) });
      setTimeout(() => this.focusPage(), 0);
    });
    let pending = null;
    c.addEventListener('pointermove', (e) => {
      const t = tab();
      if (!t) return;
      const p = pos(e);
      const first = !pending;
      pending = { x: p.x, y: p.y, buttons: down ? (down.button === 'left' ? 1 : 4) : 0, modifiers: modifiers(e) };
      if (first) requestAnimationFrame(() => { const q = pending; pending = null; if (q) t.send({ op: 'mouse', type: 'mouseMoved', ...q }); });
    });
    const up = (e) => {
      const t = tab();
      if (!t || !down) return;
      const p = pos(e);
      t.send({ op: 'mouse', type: 'mouseReleased', x: p.x, y: p.y, button: down.button, buttons: 0, clickCount: lastClick.n, modifiers: modifiers(e) });
      down = null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => { const t = tab(); if (t && t.link) { t.link = ''; this.setStatus(); } });
    c.addEventListener('wheel', (e) => {
      const t = tab();
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      const p = pos(e), k = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? c.height : 1;
      t.send({ op: 'wheel', x: p.x, y: p.y, dx: e.deltaX * k, dy: e.deltaY * k, modifiers: modifiers(e) });
    }, { passive: false });
  }

  cursorFor(c) {
    if (!c || c === 'default' || c === 'auto') return '';
    const img = (name, hx, hy, fallback) => {
      const s = (name === 'ptr_link' ? this.app.spr.get(name) : null) ?? sprites.get(name);
      return s?.url ? `url("${s.url.replace(/\.png$/, '.sq.png')}") ${hx} ${hy}, ${fallback}` : fallback;
    };
    if (c === 'pointer') return img('ptr_link', 2, 10, 'pointer');
    if (c === 'text') return img('ptr_write', 4, 9, 'text');
    return c;               // the rest (resizing, crosshair...) as the host draws them
  }

  hotKey(ev) {
    const d = ev.domEvent;
    switch (ev.code) {
      case 0x183: this.app.saveMenu(this).openCentred?.(); return true;                    // F3
      case 0x184: this.app.findWindow(this).openAt({ sx: input.mouseX, sy: input.mouseY }); return true;   // F4
      case 0x185: this.current?.reload(false); return true;                                // F5
    }
    if (d && isShortcut(d)) {
      const k = d.key.toLowerCase();
      if (k === 'l') { this.focusURL(); return true; }
      if (k === 't') { this.newTab(this.app.prefs.home); this.focusURL(); return true; }
      if (k === 'w') { this.closeTab(this.current); return true; }
      if (k === 'f') { this.app.findWindow(this).openAt({ sx: input.mouseX, sy: input.mouseY }); return true; }
      if (k === 'n') { this.app.newWindow(this.app.prefs.home); return true; }
    }
    return false;
  }

  key(ev) {
    if (this.hotKey(ev)) return true;
    const t = this.current;
    const d = ev.domEvent;
    if (!(t instanceof PageTab) || !d) return false;
    if (isShortcut(d)) {
      const k = d.key.toLowerCase();
      if (k === 'v') { ev.allowDefault = true; return true; }        // becomes a paste event (w.on('paste'))
      if (k === 'c' || k === 'x') {
        t.copy().then((text) => { if (text) navigator.clipboard?.writeText(text).catch(() => {}); });
        if (k === 'c') return true;
      }
    }
    if (d.altKey && !d.ctrlKey && !d.metaKey && (d.key === 'ArrowLeft' || d.key === 'ArrowRight')) {
      if (d.key === 'ArrowLeft') t.back(); else t.forward();
      return true;
    }
    const k = keyEvents(d);
    if (!k) return false;
    for (const e of k) t.send({ op: 'key', ...e });
    return true;
  }

  async dataLoad(ev) {
    const files = (ev.files ?? []).filter((f) => f.filetype !== 0x1000 && f.filetype !== 0x2000);
    if (!files.length) return false;
    // an address file: go there
    const f = files[0];
    if (f.filetype === 0xF91 || f.filetype === 0xB28) {
      const url = await this.app.readURLFile(f.path).catch(() => null);
      if (url) this.go(url);
      return true;
    }
    const t = this.current;
    if (!(t instanceof PageTab)) { this.task.reportError('Files can only be dropped on pages shown by !Browse\'s engine'); return true; }
    const r = this.canvas.getBoundingClientRect(), sr = wimp.screen.getBoundingClientRect?.() ?? { left: 0, top: 0 };
    const scale = wimp.scale ?? 1;
    const x = (ev.sx * scale + sr.left - r.left) * this.canvas.width / r.width, y = (ev.sy * scale + sr.top - r.top) * this.canvas.height / r.height;
    const ids = await this.app.uploadFiles(files, this).catch((e) => { this.task.reportError(e.message); return []; });
    if (ids.length) t.send({ op: 'drop', files: ids, x, y });
    return true;
  }

  // ---------------------------------------------------------------- the window's menu
  menu() {
    const t = this.current, app = this.app;
    const zoomMenu = () => new Menu('Zoom', ZOOMS.map((z) => ({ text: `${Math.round(z * 100)}%`, ticked: () => Math.abs((t?.zoom ?? 1) - z) < 0.01, action: () => t?.setZoom(z) })));
    const tabsMenu = () => new Menu('Tabs', [
      { text: 'New tab', key: '^T', action: () => { this.newTab(app.prefs.home); this.focusURL(); } },
      { text: 'Close tab', key: '^W', action: () => this.closeTab(t), dotted: true },
      ...this.tabs.map((x) => ({ text: (x.title || x.url || 'New tab').slice(0, 40), ticked: () => x === this.current, action: () => this.select(x) })),
    ]);
    return new Menu('Browse', [
      { text: 'File', submenu: () => new Menu('File', [
        { text: 'Save', key: 'F3', submenu: () => app.saveMenu(this), shaded: () => !(t instanceof PageTab && t.url), help: 'Move the pointer right to save the page\'s HTML.' },
        { text: 'Save location', submenu: () => app.saveLocation(this), shaded: () => !t?.url, help: 'Move the pointer right to save the page\'s address as a URI file.' },
        { text: 'Print to PDF', submenu: () => app.pdfBox(this), shaded: () => !(t instanceof PageTab && t.url), help: 'Move the pointer right to save the page as a PDF file.' },
      ]) },
      { text: 'Navigate', submenu: () => new Menu('Navigate', [
        { text: 'Open URL', key: '^L', action: () => this.focusURL() },
        { text: 'Home page', action: () => this.go(app.prefs.home) },
        { text: 'Back one page', action: () => t?.back(), shaded: () => this.grey(B.BACK) },
        { text: 'Forward one page', action: () => t?.forward(), shaded: () => this.grey(B.FWD) },
        { text: 'Reload this page', key: 'F5', action: () => t?.reload(false), shaded: () => this.grey(B.RELOAD) },
        { text: 'Stop', action: () => t?.stop(), shaded: () => this.grey(B.STOP), dotted: true },
        { text: 'History', submenu: () => app.listWindow('history', this) },
      ]) },
      { text: 'Hotlist', submenu: () => new Menu('Hotlist', [
        { text: 'Go to page', submenu: () => app.listWindow('hot', this), shaded: () => !app.hotlist.length },
        { text: 'Add this page', action: () => app.addHot(t), shaded: () => !t?.url },
        { text: 'Remove page', submenu: () => app.listWindow('del', this), shaded: () => !app.hotlist.length },
      ]) },
      { text: 'Tabs', submenu: tabsMenu },
      { text: 'Display', submenu: () => new Menu('Display', [
        { text: 'Zoom', submenu: zoomMenu, shaded: () => !t, dotted: true },
        { text: 'Toolbar', ticked: () => this.bars.tool, action: () => this.toggleBar('tool') },
        { text: 'URL bar', ticked: () => this.bars.url, action: () => this.toggleBar('url') },
        { text: 'Status bar', ticked: () => this.bars.status, action: () => this.toggleBar('status'), dotted: true },
        { text: 'Sound', ticked: () => app.prefs.sound, shaded: () => !app.engine, action: () => app.setSound(!app.prefs.sound) },
      ]) },
      { text: 'Utilities', submenu: () => new Menu('Utilities', [
        { text: 'Find text', key: 'F4', submenu: () => app.findWindow(this), shaded: () => !t?.url },
        { text: 'Copy address', action: () => { navigator.clipboard?.writeText(t?.url ?? '').catch(() => {}); this.note_('The address is on the clipboard'); }, shaded: () => !t?.url },
        { text: 'Open in your own browser', action: () => window.open(t.url, '_blank', 'noopener'), shaded: () => !/^https?:/.test(t?.url ?? '') },
      ]) },
    ]);
  }

  destroy() {
    this.app.windows.delete(this);
    this.spin(false);
    for (const t of this.tabs) t.close();
    this.tabs.length = 0;
    for (const p of [this.bbar, this.urlbar, this.status, this.tabbar]) p.delete();
    this.win.delete();
    this._extra?.forEach((w) => w.delete());
    this.app.windowGone?.(this);
  }
}

// ------------------------------------------------------------------ a page shown by the engine
export class PageTab {
  constructor(bw) {
    this.bw = bw;
    this.engine = bw.app.engine;
    this.id = null;
    this.url = ''; this.title = ''; this.loading = false; this.canBack = false; this.canForward = false;
    this.link = ''; this.cursor = ''; this.zoom = bw.app.prefs.zoom ?? 1;
    this.shown = false;
    this.bmp = null;
    this.seq = 0; this.drawn = 0;
  }

  async start(url, opts = {}) {
    const r = this.bw.pageRect();
    if (opts.serverTab != null) {
      this.id = opts.serverTab;
      this.url = opts.url ?? '';
      this.bw.app.tabs.set(this.id, this);
      this.engine.frames.set(this.id, (m, b) => this.frame(m, b));
      this.send({ op: 'size', w: r.w, h: r.h });
      if (this.zoom !== 1) this.send({ op: 'zoom', zoom: this.zoom });
    } else {
      await this.engine.connect();
      const rep = await this.engine.request({ op: 'open', url: 'about:blank', w: r.w, h: r.h, zoom: this.zoom });
      this.id = rep.tab;
      this.bw.app.tabs.set(this.id, this);
      this.engine.frames.set(this.id, (m, b) => this.frame(m, b));
      if (url) this.go(url);
    }
    if (this.shown) this.send({ op: 'show', on: true });
  }

  send(o) { if (this.id != null) this.engine.send({ ...o, tab: this.id }); }
  request(o) { return this.engine.request({ ...o, tab: this.id }); }

  go(url) {
    this.url = url;
    this.error = '';
    this.loading = true;
    this.bw.tabChanged(this);
    this.request({ op: 'navigate', url }).catch((e) => { this.loading = false; this.error = e.message; this.bw.tabChanged(this); this.bw.task.reportError(e.message); });
  }
  back() { this.send({ op: 'back' }); }
  forward() { this.send({ op: 'forward' }); }
  reload(hard) { this.send({ op: 'reload', hard }); }
  stop() { this.send({ op: 'stop' }); }
  setZoom(z) { this.zoom = z; this.send({ op: 'zoom', zoom: z }); this.bw.tabChanged(this); }
  copy() { return this.request({ op: 'copy' }).then((r) => r.text).catch(() => ''); }
  focus() { /* the engine's pages always think they have the focus */ }

  show(on) {
    this.shown = on;
    const bw = this.bw;
    if (on) {
      bw.canvas.style.display = '';
      bw.note.style.display = 'none';
      this.paint();
    }
    this.send({ op: 'show', on });
  }

  resize(r) {
    if (this.w === r.w && this.h === r.h) return;
    this.w = r.w; this.h = r.h;
    clearTimeout(this._rt);
    this._rt = setTimeout(() => this.send({ op: 'size', w: r.w, h: r.h }), 80);
  }

  /** A frame: meta = [page w, page h, frame shows w, h]; frames decode in order, older ones are dropped. */
  frame(meta, bytes) {
    const seq = ++this.seq;
    createImageBitmap(new Blob([bytes], { type: 'image/jpeg' })).then((bmp) => {
      if (seq < this.drawn) { bmp.close(); return; }
      this.drawn = seq;
      this.bmp?.close();
      this.bmp = bmp;
      this.meta = meta;
      if (this.shown) this.paint();
    }, () => {});
  }

  paint() {
    const { g, canvas } = this.bw;
    if (!this.shown) return;
    if (!this.bmp) { g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height); return; }
    const [pw, ph, vw, vh] = this.meta;
    const sw = this.bmp.width * Math.min(1, pw / vw), sh = this.bmp.height * Math.min(1, ph / vh);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.bmp, 0, 0, sw, sh, 0, 0, pw, ph);
    if (pw < canvas.width || ph < canvas.height) {
      // until a frame of the new size comes
      g.fillStyle = '#fff';
      g.fillRect(pw, 0, canvas.width - pw, canvas.height);
      g.fillRect(0, ph, canvas.width, canvas.height - ph);
    }
  }

  /** Engine events for this tab (from ./main.js). */
  state(e) {
    for (const k of ['url', 'title', 'loading', 'canBack', 'canForward', 'link', 'cursor', 'scroll']) if (e[k] !== undefined) this[k] = e[k];
    if (e.scroll && Object.keys(e).length === 3) { if (this.bw.current === this) this.bw.syncScroll(); return; }
    if (e.error) this.error = errorText(e.error);
    else if (e.url !== undefined) this.error = '';
    if (e.crashed) this.error = 'The page stopped working: reload it to try again';
    if (e.title !== undefined || e.url !== undefined) this.bw.app.visited(this);
    this.bw.tabChanged(this);
  }

  close() {
    if (this.id == null) return;
    this.send({ op: 'close' });
    this.engine.frames.delete(this.id);
    this.bw.app.tabs.delete(this.id);
    this.bmp?.close();
    this.id = null;
  }
}

const errorText = (e) => ({
  'net::ERR_NAME_NOT_RESOLVED': 'That site couldn\'t be found',
  'net::ERR_INTERNET_DISCONNECTED': 'This computer isn\'t connected to the Internet',
  'net::ERR_CONNECTION_REFUSED': 'The site refused the connection',
  'net::ERR_CONNECTION_TIMED_OUT': 'The site didn\'t answer',
  'net::ERR_CERT_AUTHORITY_INVALID': 'The site\'s certificate isn\'t trusted',
}[e] ?? `The page couldn't be fetched (${e})`);

// ------------------------------------------------------------------ a page in a frame (no engine)
export class FrameTab {
  constructor(bw) {
    this.bw = bw;
    this.url = ''; this.title = ''; this.loading = false;
    this.hist = []; this.pos = -1;
    this.zoom = 1;
    this.iframe = null;
    this.shown = false;
    const why = { off: 'start the server with node serve.mjs --browser', nochrome: 'no Chrome was found for serve.mjs --browser', remote: 'the full browser only works on the computer running the server', server: 'this web server has no browser engine: use node serve.mjs --browser' }[bw.app.probe?.reason];
    this.notice = `Some sites won't show here: for the full browser, ${why ?? 'use node serve.mjs --browser'}`;
  }
  get canBack() { return this.pos > 0; }
  get canForward() { return this.pos < this.hist.length - 1; }

  async start(url) { if (url) this.go(url); }
  send() {}

  go(url, push = true) {
    if (push) { this.hist.splice(this.pos + 1); this.hist.push(url); this.pos = this.hist.length - 1; }
    this.url = url;
    this.title = '';
    try { this.title = new URL(url).host || url; } catch { this.title = url; }
    this.load(url);
    this.bw.app.visited(this);
    this.bw.tabChanged(this);
  }

  async load(url) {
    const gen = this.gen = (this.gen ?? 0) + 1;
    this.loading = true;
    this.bw.tabChanged(this);
    const ok = /^https?:/i.test(url) ? await Engine.frameable(this.bw.app.probe?.info, url) : true;
    if (gen !== this.gen) return;
    if (ok === false) {
      this.loading = false;
      this.blocked = true;
      this.removeFrame();
      this.showNote();
      this.bw.tabChanged(this);
      return;
    }
    this.blocked = false;
    if (!this.iframe) {
      const f = this.iframe = document.createElement('iframe');
      f._browse = this.bw;
      f.className = 'browse-embed';
      f.setAttribute('sandbox', FRAME_SANDBOX);
      f.setAttribute('allow', 'autoplay; fullscreen; clipboard-write; encrypted-media; picture-in-picture');
      f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      Object.assign(f.style, { position: 'absolute', border: '0', background: '#fff', display: this.shown ? '' : 'none' });
      f.addEventListener('load', () => { if (this.iframe === f) { this.loading = false; this.bw.tabChanged(this); } });
      this.bw.win.view.appendChild(f);
      this.resize(this.bw.pageRect());
    }
    this.iframe.src = url;
    if (this.shown) this.bw.note.style.display = 'none';
  }

  showNote() {
    const n = this.bw.note;
    if (!this.shown) return;
    n.replaceChildren();
    const p = document.createElement('p');
    let host = this.url;
    try { host = new URL(this.url).host; } catch { /* as it is */ }
    p.textContent = `${host} doesn't let itself be shown inside another page, so !Browse can't show it here.`;
    const p2 = document.createElement('p');
    p2.textContent = 'You can open it in your own browser instead. (For !Browse to show every page, start the server with node serve.mjs --browser.)';
    const b = document.createElement('button');
    b.textContent = 'Open in your own browser';
    b.onclick = () => window.open(this.url, '_blank', 'noopener');
    n.append(p, p2, b);
    n.style.display = '';
  }

  removeFrame() { this.iframe?.remove(); this.iframe = null; }

  back() { if (this.canBack) this.go(this.hist[--this.pos], false); }
  forward() { if (this.canForward) this.go(this.hist[++this.pos], false); }
  reload() { if (this.url) this.load(this.url); }
  stop() { this.gen++; this.loading = false; if (this.iframe) this.iframe.src = 'about:blank'; this.bw.tabChanged(this); }
  setZoom() {}
  copy() { return Promise.resolve(''); }
  focus() {}

  show(on) {
    this.shown = on;
    if (this.iframe) this.iframe.style.display = on ? '' : 'none';
    if (on) {
      this.bw.canvas.style.display = 'none';
      if (this.blocked) this.showNote(); else this.bw.note.style.display = 'none';
    }
  }
  resize(r) { if (this.iframe) Object.assign(this.iframe.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); }
  paint() {}
  close() { this.gen = (this.gen ?? 0) + 1; this.removeFrame(); }
}
