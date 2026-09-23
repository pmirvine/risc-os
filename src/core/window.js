// Window: RISC OS 3.71 window with 3D Tools-sprite furniture, rendered to DOM.
//
// Geometry (all desktop pixels, y down):
//   x, y, w, h        visible work area on screen (furniture lies outside it)
//   scrollX, scrollY  work-area coordinate shown at the visible area's top-left
//   extent            {x0, y0, x1, y1} work-area extent (y0 = top, usually 0; y1 = bottom)
// Work-area coordinates are y-down pixels; a RISC OS work area (OS units, y up, negative
// downwards) converts as px = os/2, y = -os_y/2.

import { Emitter, el, clamp } from './util.js';
import { WF, IF } from './templates.js';
import { Icon, templateIconToSpec, BUTTON_NAMES } from './icons.js';
import { sprites } from './sprites.js';
import { wimpColour } from './palette.js';
import { fonts, textWidth } from './fonts.js';

const T = 20;            // tool sprite size (px), including its 1px black border
const TOOLS = ['back', 'close', 'title', 'toggle', 'vscroll', 'hscroll', 'size'];
const FLAG_BITS = { back: WF.back, close: WF.close, title: WF.title, toggle: WF.toggle, vscroll: WF.vscroll, hscroll: WF.hscroll, size: WF.size, moveable: WF.moveable, pane: WF.pane, noBounds: WF.noBounds, backWindow: WF.backWindow, hotKeys: WF.hotKeys, scrollRepeat: WF.scrollRepeat, scrollDebounce: WF.scrollDebounce, forceOnScreen: WF.forceOnScreen, autoRedraw: WF.autoRedraw };

let nextHandle = 0x1000;

export function flagsFromObject(o) {
  let f = WF.newFormat;
  for (const [k, bit] of Object.entries(FLAG_BITS)) if (o[k]) f |= bit;
  return f >>> 0;
}

/** Convert a template window (OS units) to a window definition (px). */
export function templateToDef(t) {
  const v = t.visible, e = t.extent;
  const scrH = globalThis.__wimpScreenH ?? 768;
  return {
    name: t.name,
    title: t.title?.text ?? '',
    titleSprite: !(t.titleFlags & IF.text) && (t.titleFlags & IF.sprite) ? t.title?.sprite : undefined,
    titleFlags: t.titleFlags,
    titleValidation: t.title?.validation,
    titleBufLen: t.title?.bufLen,
    flags: t.flags >>> 0,
    colours: { ...t.colours },
    extent: { x0: e.x0 / 2, y0: -e.y1 / 2, x1: e.x1 / 2, y1: -e.y0 / 2 },
    x: v.x0 / 2, y: scrH - v.y1 / 2, w: (v.x1 - v.x0) / 2, h: (v.y1 - v.y0) / 2,
    scrollX: (t.scroll?.x ?? 0) / 2, scrollY: -(t.scroll?.y ?? 0) / 2,
    minW: (t.minWidth ?? 0) / 2, minH: (t.minHeight ?? 0) / 2,
    workButton: (t.workFlags >>> 12) & 15,
    icons: (t.icons ?? []).map(templateIconToSpec),
  };
}

export class Window extends Emitter {
  /**
   * def: {title, flags (number or object), colours, extent, x,y,w,h, scrollX, scrollY, minW, minH,
   *       workButton, icons, spriteArea, workBg, name}
   */
  constructor(wimp, task, def = {}) {
    super();
    this.wimp = wimp;
    this.task = task;
    this.handle = nextHandle++;
    this.name = def.name ?? '';
    this.flags = typeof def.flags === 'object' && def.flags ? flagsFromObject(def.flags) : (def.flags ?? flagsFromObject({ back: true, close: true, title: true, toggle: true, vscroll: true, hscroll: true, size: true, moveable: true })) >>> 0;
    this.colours = { titleFg: 7, titleBg: 2, workFg: 7, workBg: 1, scrollOuter: 3, scrollInner: 1, titleFocus: 12, ...(def.colours ?? {}) };
    if (def.workBg != null) this.colours.workBg = def.workBg === 'none' ? 255 : def.workBg;
    this.title = def.title ?? '';
    this.titleFlags = def.titleFlags ?? (IF.text | IF.border | IF.hcentre | IF.vcentre | IF.filled);
    this.extent = def.extent ? normExtent(def.extent) : { x0: 0, y0: 0, x1: def.w ?? 400, y1: def.h ?? 300 };
    this.x = def.x ?? 100; this.y = def.y ?? 100;
    this.w = def.w ?? 400; this.h = def.h ?? 300;
    this.scrollX = def.scrollX ?? this.extent.x0; this.scrollY = def.scrollY ?? this.extent.y0;
    this.minW = def.minW || 0; this.minH = def.minH || 0;
    this.workButton = typeof def.workButton === 'string' ? (BUTTON_NAMES[def.workButton.toLowerCase().replace(/[^a-z]/g, '')] ?? 0) : (def.workButton ?? 0);
    this.spriteArea = def.spriteArea ?? null;
    this.isOpen = false;
    this.fullSize = false;
    this._prevState = null;
    this.icons = [];
    this.menu = def.menu ?? null;      // convenience: Menu (or fn) opened on Menu click
    this.helpText = def.help;
    this.userData = def.data;

    this._build();
    for (const ic of def.icons ?? []) this.addIcon(ic);
    this._layout();
  }

  hasFlag(bit) { return (this.flags & bit) !== 0; }
  get hasFrame() { return this.colours.titleFg !== 255; }
  tool(name) { return this.hasFrame && this.hasFlag(FLAG_BITS[name]); }
  get isPane() { return this.hasFlag(WF.pane); }
  get isBackWindow() { return this.hasFlag(WF.backWindow); }
  get hasFocus() { return this.wimp.caret?.window === this; }

  // ------------------------------------------------------------------ DOM
  _build() {
    const e = this.el = el('div', 'win');
    e._win = this;
    e.style.display = 'none';
    this.view = el('div', 'win-view', e);
    this.view.dataset.part = 'work';
    this.work = el('div', 'win-work', this.view);
    this.iconLayer = el('div', 'win-icons', this.work);
    this.tools = {};
    const mk = (name, cls = 'tool') => { const d = el('div', cls, e); d.dataset.part = name; this.tools[name] = d; return d; };
    mk('back'); mk('close'); mk('toggle'); mk('size');
    const t = mk('title', 'win-title');
    this.titleFill = el('div', 'tfill', t);
    this.titleL = el('div', 'tcap l', t);
    this.titleMT = el('div', 'tmid t', t);
    this.titleMB = el('div', 'tmid b', t);
    this.titleR = el('div', 'tcap r', t);
    this.titleText = el('span', 'ttext', t);
    // scroll bars
    const vs = mk('vscroll', 'sbar v');
    this.v = this._mkScroll(vs, 'v');
    const hs = mk('hscroll', 'sbar h');
    this.hb = this._mkScroll(hs, 'h');
  }

  _mkScroll(root, dir) {
    const o = { root };
    const up = dir === 'v' ? 'up' : 'left', down = dir === 'v' ? 'down' : 'right';
    o.a1 = el('div', 'tool', root); o.a1.dataset.part = up;
    o.a2 = el('div', 'tool', root); o.a2.dataset.part = down;
    o.well = el('div', 'well', root); o.well.dataset.part = dir + 'well';
    o.cap1 = el('div', 'wcap1', o.well);
    o.fill1 = el('div', 'wfill1', o.well);
    o.fill2 = el('div', 'wfill2', o.well);
    o.cap2 = el('div', 'wcap2', o.well);
    o.bar = el('div', 'bar', o.well); o.bar.dataset.part = dir + 'bar';
    o.b1 = el('div', 'b1', o.bar); o.bm = el('div', 'bm', o.bar); o.b2 = el('div', 'b2', o.bar);
    return o;
  }

  setToolSprite(elm, name) {
    const s = sprites.tool(name);
    if (!s) { elm.style.backgroundImage = ''; return; }
    elm.style.backgroundImage = `url("${s.url}")`;
    elm.style.backgroundSize = `${s.cssW}px ${s.cssH}px`;
  }

  /** Recompute furniture layout for the current state. */
  _layout() {
    const e = this.el;
    const frame = this.hasFrame;
    const hasT = this.tool('title'), hasV = this.tool('vscroll'), hasH = this.tool('hscroll');
    const topH = frame ? (hasT ? T : 1) : 0;
    const left = frame ? 1 : 0;
    const rightW = frame ? (hasV ? T : 1) : 0;
    const botH = frame ? (hasH ? T : 1) : 0;
    const W = this.w, H = this.h;
    this._frame = { topH, left, rightW, botH };
    e.style.left = this.x - left + 'px';
    e.style.top = this.y - topH + 'px';
    e.style.width = W + left + rightW + 'px';
    e.style.height = H + topH + botH + 'px';
    e.classList.toggle('framed', frame);
    const v = this.view.style;
    v.left = left + 'px'; v.top = topH + 'px'; v.width = W + 'px'; v.height = H + 'px';
    // background
    const bg = this.colours.workBg;
    if (this.customBackground) { /* owner paints the background (e.g. the Pinboard) */ }
    else if (bg === 255) { v.background = 'transparent'; }
    else if ((bg & 15) === 1 && this.wimp.config.textured && sprites.get('tile_1')) {
      const tile = sprites.get('tile_1');
      v.background = `${wimpColour(1)} url("${tile.url}")`;
      v.backgroundSize = `${tile.cssW}px ${tile.cssH}px`;
      v.backgroundPosition = `${-this.scrollX}px ${-this.scrollY}px`;
    } else v.background = wimpColour(bg);
    this.work.style.transform = `translate(${-this.scrollX}px, ${-this.scrollY}px)`;

    const outerW = W + left + rightW;
    const show = (d, on) => { d.style.display = on ? '' : 'none'; };
    // title row
    let tx0 = 0, tx1 = outerW;
    show(this.tools.back, this.tool('back') && hasT);
    show(this.tools.close, this.tool('close') && hasT);
    show(this.tools.toggle, this.tool('toggle') && hasT);
    show(this.tools.title, hasT);
    if (hasT) {
      const place = (d, x, y, spr) => { d.style.left = x + 'px'; d.style.top = y + 'px'; this.setToolSprite(d, spr); };
      if (this.tool('back')) { place(this.tools.back, tx0, 0, this._pressed === 'back' ? 'pbicon' : 'bicon'); tx0 += T - 1; }
      if (this.tool('close')) { place(this.tools.close, tx0, 0, 'cicon'); tx0 += T - 1; }
      if (this.tool('toggle')) { place(this.tools.toggle, outerW - T, 0, this.fullSize ? 'ticon1' : 'ticon'); tx1 = outerW - T + 1; }
      const t = this.tools.title.style;
      t.left = tx0 + 'px'; t.width = Math.max(0, tx1 - tx0) + 'px'; t.top = '0px'; t.height = T + 'px';
      const focus = this.hasFocus && !this.isPane;
      this.titleFill.style.background = wimpColour(focus ? this.colours.titleFocus : this.colours.titleBg);
      this.setToolSprite(this.titleL, 'tbarlcap');
      this.setToolSprite(this.titleR, 'tbarrcap');
      const mt = sprites.tool('tbarmidt'), mb = sprites.tool('tbarmidb');
      if (mt) { this.titleMT.style.backgroundImage = `url("${mt.url}")`; this.titleMT.style.backgroundSize = `${mt.cssW}px ${mt.cssH}px`; this.titleMT.style.height = mt.cssH + 'px'; }
      if (mb) { this.titleMB.style.backgroundImage = `url("${mb.url}")`; this.titleMB.style.backgroundSize = `${mb.cssW}px ${mb.cssH}px`; this.titleMB.style.height = mb.cssH + 'px'; }
      this.titleText.textContent = this.title;
      this.titleText.style.color = wimpColour(this.colours.titleFg);
      this.titleText.style.font = fonts.css;
      // like findtextorigin: centred text that doesn't fit is right-justified (shows the end of long paths)
      const avail = tx1 - tx0 - 8;
      const tooLong = this.titleFlags & IF.hcentre && textWidth(this.title, fonts.css) > avail;
      this.titleText.style.justifyContent = tooLong ? 'flex-end' : this.titleFlags & IF.hcentre ? 'center' : (this.titleFlags & IF.rjustify ? 'flex-end' : 'flex-start');
    }
    // vertical scroll bar
    show(this.tools.vscroll, hasV);
    const sizeAtV = this.tool('size') && !hasH;
    if (hasV) {
      const top = hasT ? topH - 1 : 0;
      const bottom = hasH ? topH + H + 1 : topH + H + 1;   // row of the bottom separator/outline
      let len = bottom - top;
      if (sizeAtV) len -= T - 1;
      const s = this.tools.vscroll.style;
      s.left = left + W + 'px'; s.top = top + 'px'; s.width = T + 'px'; s.height = len + 'px';
      this._layoutScroll(this.v, 'v', len);
    }
    show(this.tools.hscroll, hasH);
    if (hasH) {
      let len = left + W + 1;
      if (!hasV && this.tool('size')) len -= T - 1;
      const s = this.tools.hscroll.style;
      s.left = '0px'; s.top = topH + H + 'px'; s.height = T + 'px'; s.width = len + 'px';
      this._layoutScroll(this.hb, 'h', len);
    }
    // size / blank corner
    const sz = this.tools.size;
    if (this.tool('size') || (hasV && hasH)) {
      sz.style.display = '';
      const x = hasV ? left + W : outerW - T;
      if (!hasV && !hasH) { sz.style.display = 'none'; }
      const y = hasH ? topH + H : topH + H + botH - T;
      sz.style.left = x + 'px'; sz.style.top = y + 'px';
      this.setToolSprite(sz, this.tool('size') ? (this._pressed === 'size' ? 'psicon' : 'sicon') : 'blicon');
      sz.dataset.part = this.tool('size') ? 'size' : 'blank';
    } else sz.style.display = 'none';
    e.classList.toggle('focus', this.hasFocus);
    if (this._canvas) this._syncCanvas();
  }

  _layoutScroll(o, dir, len) {
    const vert = dir === 'v';
    const pre = vert ? 'v' : 'h';
    const a1 = vert ? 'uicon' : 'licon', a2 = vert ? 'dicon' : 'ricon';
    const pr = this._pressed;
    this.setToolSprite(o.a1, pr === (vert ? 'up' : 'left') ? 'p' + a1 : a1);
    this.setToolSprite(o.a2, pr === (vert ? 'down' : 'right') ? 'p' + a2 : a2);
    const pos = (d, a, b) => { if (vert) { d.style.top = a + 'px'; d.style.height = b + 'px'; d.style.left = '0px'; d.style.width = T + 'px'; } else { d.style.left = a + 'px'; d.style.width = b + 'px'; d.style.top = '0px'; d.style.height = T + 'px'; } };
    pos(o.a1, 0, T); pos(o.a2, len - T, T);
    const wellStart = T - 1, wellLen = len - 2 * (T - 1);
    pos(o.well, wellStart, Math.max(0, wellLen));
    const cap = 3;
    const inner = Math.max(0, wellLen - 2 * cap);
    // slider geometry
    const ext = vert ? this.extent.y1 - this.extent.y0 : this.extent.x1 - this.extent.x0;
    const vis = vert ? this.h : this.w;
    const sc = vert ? this.scrollY - this.extent.y0 : this.scrollX - this.extent.x0;
    let blen = ext > 0 ? Math.round(inner * Math.min(1, vis / ext)) : inner;
    const minLen = 3 + 4 + 2;
    blen = clamp(blen, Math.min(minLen, inner), inner);
    let boff = ext > vis ? Math.round((inner - blen) * sc / (ext - vis)) : 0;
    boff = clamp(boff, 0, inner - blen);
    o.geom = { inner, blen, boff, cap, ext, vis };
    const sp = (n) => sprites.tool(n);
    const bg = (d, n, align) => {
      const s = sp(n);
      if (!s) { d.style.background = wimpColour(vert ? 3 : 3); return; }
      d.style.backgroundImage = `url("${s.url}")`;
      d.style.backgroundSize = `${s.cssW}px ${s.cssH}px`;
      d.style.backgroundRepeat = vert ? 'repeat-y' : 'repeat-x';
      d.style.backgroundPosition = align === 'end' ? (vert ? 'left bottom' : 'right top') : 'left top';
    };
    const cap1 = vert ? 'vwelltcap' : 'hwelllcap', cap2 = vert ? 'vwellbcap' : 'hwellrcap';
    const f1 = vert ? 'vwellt' : 'hwelll', f2 = vert ? 'vwellb' : 'hwellr';
    const dragging = pr === pre + 'bar';
    const b1 = (dragging ? 'p' : '') + (vert ? 'vbart' : 'hbarl'), bm = (dragging ? 'p' : '') + (vert ? 'vbarmid' : 'hbarmid'), b2 = (dragging ? 'p' : '') + (vert ? 'vbarb' : 'hbarr');
    pos(o.cap1, 0, cap); bg(o.cap1, cap1);
    pos(o.fill1, cap, boff); bg(o.fill1, f1);
    pos(o.fill2, cap + boff + blen, inner - boff - blen); bg(o.fill2, f2, 'end');
    pos(o.cap2, cap + inner, cap); bg(o.cap2, cap2);
    pos(o.bar, cap + boff, blen);
    const c1 = vert ? 3 : 3, c2 = vert ? 4 : 3;
    pos(o.b1, 0, Math.min(c1, blen)); bg(o.b1, b1);
    pos(o.bm, c1, Math.max(0, blen - c1 - c2)); bg(o.bm, bm);
    pos(o.b2, Math.max(0, blen - c2), c2); bg(o.b2, b2);
  }

  // ------------------------------------------------------------------ state
  getState() {
    return { x: this.x, y: this.y, w: this.w, h: this.h, scrollX: this.scrollX, scrollY: this.scrollY, open: this.isOpen, fullSize: this.fullSize, handle: this.handle };
  }

  /** Outline box (screen) including furniture. */
  outline() {
    const f = this._frame;
    return { x0: this.x - f.left, y0: this.y - f.topH, x1: this.x + this.w + f.rightW, y1: this.y + this.h + f.botH };
  }

  /**
   * Open (or re-open) the window: Wimp_OpenWindow. state fields optional:
   * {x, y, w, h, scrollX, scrollY, behind} behind: 'top' (default when opening) | 'bottom' | 'keep' | Window.
   */
  open(state = {}) {
    const wasOpen = this.isOpen;
    let { x = this.x, y = this.y, w = this.w, h = this.h, scrollX = this.scrollX, scrollY = this.scrollY } = state;
    const behind = state.behind ?? (wasOpen ? 'keep' : 'top');
    const ext = this.extent;
    const extW = ext.x1 - ext.x0, extH = ext.y1 - ext.y0;
    w = Math.round(clamp(w, Math.min(this._minW(), extW), extW));
    h = Math.round(clamp(h, Math.min(this._minH(), extH), extH));
    scrollX = Math.round(clamp(scrollX, ext.x0, ext.x1 - w));
    scrollY = Math.round(clamp(scrollY, ext.y0, ext.y1 - h));
    const pos = this.wimp.constrainWindow(this, { x: Math.round(x), y: Math.round(y), w, h });
    const moved = pos.x !== this.x || pos.y !== this.y || pos.w !== this.w || pos.h !== this.h;
    const scrolled = scrollX !== this.scrollX || scrollY !== this.scrollY;
    Object.assign(this, pos, { scrollX, scrollY });
    this.isOpen = true;
    this.el.style.display = '';
    if (!this._menuWindow) this.wimp._stackPlace(this, behind);
    this._layout();
    if (!wasOpen) this.emit('opened', {});
    if (moved || scrolled || !wasOpen) this.emit('moved', { moved, scrolled });
    if (this._canvas && (moved || scrolled || !wasOpen)) this.invalidate();
    return this;
  }

  _minW() {
    if (this.minW) return this.minW;
    let m = 0;
    if (this.tool('back')) m += T;
    if (this.tool('close')) m += T;
    if (this.tool('toggle')) m += T;
    return Math.max(m + 16, this.tool('hscroll') ? 3 * T : 16);
  }
  _minH() { return this.minH || (this.tool('vscroll') ? 2 * T + 8 : 8); }

  /** Called for user actions: emits 'open' (Open_Window_Request); default opens. */
  requestOpen(state) {
    const full = { ...this.getState(), ...state };
    const ev = this.emit('open', full);
    if (!ev.defaultPrevented) this.open(full);
  }

  /** Wimp_CloseWindow */
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.style.display = 'none';
    this.wimp._stackRemove(this);
    if (this.wimp.caret?.window === this) this.wimp.setCaret(null);
    this.emit('closed', {});
  }

  /** User clicked close: emits 'close' (Close_Window_Request); default closes. */
  requestClose(ev = {}) {
    const r = this.emit('close', ev);
    if (!r.defaultPrevented) this.close();
  }

  /** Delete the window altogether. */
  delete() {
    this.close();
    this.el.remove();
    this.wimp._windowDeleted(this);
    this.emit('deleted', {});
  }

  /**
   * Attach a pane window: it is kept at (x+dx, y+dy) relative to this window's visible area,
   * directly in front of it in the stack, and opened/closed with it. opts: {dx, dy, w, h,
   * fitWidth (pane width follows this window's width), fitHeight}
   */
  attachPane(pane, opts = {}) {
    const p = { pane, dx: 0, dy: 0, ...opts };
    (this._panes ??= []).push(p);
    pane._paneParent = this;
    const sync = () => {
      if (!this.isOpen) { if (pane.isOpen) pane.close(); return; }
      pane.open({
        x: this.x + p.dx, y: this.y + p.dy,
        w: p.fitWidth ? this.w - (p.dx > 0 ? p.dx : 0) : (p.w ?? pane.w), h: p.fitHeight ? this.h - (p.dy > 0 ? p.dy : 0) : (p.h ?? pane.h),
        behind: 'keep',
      });
      this.wimp._stackAbove(pane, this);
    };
    this.on('opened', sync);
    this.on('moved', sync);
    this.on('closed', () => pane.close());
    this.on('deleted', () => pane.delete());
    if (this.isOpen) sync();
    return pane;
  }

  bringToFront() { if (this.isOpen) this.open({ behind: 'top' }); }
  sendToBack() { if (this.isOpen) this.open({ behind: 'bottom' }); }

  setTitle(t) { this.title = String(t); this.titleText.textContent = this.title; }
  get titleString() { return this.title; }

  setExtent(e) {
    this.extent = normExtent(e);
    if (this.isOpen) this.open({});
    else this._layout();
  }

  scrollTo(x, y) {
    if (this.isOpen) this.open({ scrollX: x ?? this.scrollX, scrollY: y ?? this.scrollY });
    else { this.scrollX = x ?? this.scrollX; this.scrollY = y ?? this.scrollY; this._layout(); }
  }

  /** Toggle between full size and the previous size (toggle-size icon). */
  toggleSize(front = true) {
    if (this.fullSize && this._prevState) {
      const p = this._prevState;
      this.fullSize = false;
      this.requestOpen({ ...p, behind: front ? 'top' : 'keep' });
    } else {
      this._prevState = this.getState();
      const scr = this.wimp.screenRect(true);
      const f = this._frame;
      const ext = this.extent;
      const w = Math.min(ext.x1 - ext.x0, scr.w - f.left - f.rightW);
      const h = Math.min(ext.y1 - ext.y0, scr.h - f.topH - f.botH);
      let x = this.x, y = this.y;
      if (x + w + f.rightW > scr.w) x = scr.w - w - f.rightW;
      if (y + h + f.botH > scr.h) y = scr.h - h - f.botH;
      x = Math.max(f.left, x); y = Math.max(f.topH, y);
      this.fullSize = true;
      this.requestOpen({ x, y, w, h, behind: front ? 'top' : 'keep' });
    }
  }

  // ------------------------------------------------------------------ icons
  addIcon(spec) {
    const ic = new Icon(this, spec, this.icons.length);
    this.icons.push(ic);
    this.iconLayer.appendChild(ic.el);
    return ic;
  }
  /** Wimp_DeleteIcon (marks deleted, keeps handles stable). */
  deleteIcon(i) {
    const ic = this.icons[i];
    if (!ic) return;
    ic.el.remove();
    this.icons[i] = null;
    while (this.icons.length && this.icons[this.icons.length - 1] == null) this.icons.pop();
  }
  icon(i) { return this.icons[i] ?? null; }
  setIconText(i, t) { this.icons[i]?.setText(t); }
  getIconText(i) { return this.icons[i]?.text ?? ''; }
  setIconState(i, st, clear) { this.icons[i]?.setState(st, clear); }
  /** Topmost non-deleted icon at work-area point. */
  iconAt(wx, wy) {
    for (let i = this.icons.length - 1; i >= 0; i--) {
      const ic = this.icons[i];
      if (ic && !ic.deleted && ic.contains(wx, wy)) return ic;
    }
    return null;
  }
  /** Icons in an ESG group. */
  esgIcons(esg) { return this.icons.filter((ic) => ic && ic.esg === esg); }
  /** Selected icons (Wimp_WhichIcon with selected bit). */
  selectedIcons() { return this.icons.filter((ic) => ic && ic.selected); }
  /** Icon by name: templates don't have names, but apps may set icon.name. */
  iconByName(n) { return this.icons.find((ic) => ic && ic.name === n) ?? null; }

  // ------------------------------------------------------------------ coords
  screenToWork(sx, sy) { return { x: sx - this.x + this.scrollX, y: sy - this.y + this.scrollY }; }
  workToScreen(wx, wy) { return { x: wx - this.scrollX + this.x, y: wy - this.scrollY + this.y }; }
  /** Visible work-area rectangle. */
  visibleWork() { return { x0: this.scrollX, y0: this.scrollY, x1: this.scrollX + this.w, y1: this.scrollY + this.h }; }

  // ------------------------------------------------------------------ canvas redraw
  /**
   * Use a redraw-driven canvas covering the visible area. onRedraw(ctx, rect) is called with
   * ctx transformed so that drawing uses work-area coordinates; rect is the visible work area.
   * Returns the canvas. Call invalidate() / invalidate(rect) to request a redraw.
   */
  useCanvas(onRedraw, opts = {}) {
    const c = this._canvas = el('canvas', 'win-canvas', this.view);
    this.view.insertBefore(c, this.work);
    this._onRedraw = onRedraw;
    this._canvasOpts = opts;
    this._syncCanvas();
    return c;
  }
  _syncCanvas() {
    const c = this._canvas;
    const dpr = this._canvasOpts?.hiDPI ? (window.devicePixelRatio || 1) * this.wimp.scale : 1;
    const W = Math.max(1, Math.round(this.w * dpr)), H = Math.max(1, Math.round(this.h * dpr));
    if (c.width !== W || c.height !== H) {
      c.width = W; c.height = H;
      c.style.width = this.w + 'px'; c.style.height = this.h + 'px';
      this._dpr = dpr;
      this.invalidate();
    }
  }
  invalidate(rect) {
    if (!this._canvas) { this.emit('redraw', { rect: rect ?? this.visibleWork() }); return; }
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      if (!this.isOpen && !this._canvasOpts?.drawClosed) return;
      const ctx = this._canvas.getContext('2d');
      const d = this._dpr || 1;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.imageSmoothingEnabled = false;
      const bg = this.colours.workBg;
      ctx.clearRect(0, 0, this.w, this.h);
      if (bg !== 255 && this._canvasOpts?.fill !== false) { ctx.fillStyle = wimpColour(bg); ctx.fillRect(0, 0, this.w, this.h); }
      ctx.translate(-this.scrollX, -this.scrollY);
      try { this._onRedraw?.(ctx, this.visibleWork()); } catch (e) { console.error(e); }
    });
  }
}

export function normExtent(e) {
  if ('w' in e || 'h' in e) return { x0: 0, y0: 0, x1: e.w ?? 0, y1: e.h ?? 0 };
  return { x0: e.x0 ?? 0, y0: e.y0 ?? 0, x1: e.x1, y1: e.y1 };
}

export { TOOLS };
