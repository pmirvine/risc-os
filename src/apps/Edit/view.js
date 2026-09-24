// EditView: one Edit text window on an EditDocument (RISC_OSLib txtar + the mouse/keyboard parts of
// txtedit). Renders with a redraw-driven canvas in the system font (default, drawn from the kernel
// 8x8 bitmap at 8x16 pixels) or an outline font, with the Wimp caret, the global selection, Edit's
// keyboard shortcuts, display options, and hooks so other code (e.g. task windows) can reuse it.
//
//   const v = new EditView(task, doc, { options, handlers, x, y, w, h })
//   v.open(); v.setCaret(i); v.select(a, b); v.options = {...}; v.applyOptions()
//   v.keyFilter = (ev) => bool     // called before Edit's key handling; return true to consume
//   v.handlers = { menu(view, ev), save(view), find(view), gotoLine(view), close(view, ev),
//                  newFile(view), insertFile(view), indent(view), dataLoad(view, ev), dataSave(view, ev) }
//   v.titleSuffix / v.titleOverride     // title customisation (task windows)

import { wimp } from '../../core/wimp.js';
import { wimpColour } from '../../core/palette.js';
import { fonts as desktopFonts } from '../../core/fonts.js';
import { startPointerDrag, input } from '../../core/input.js';
import { EditDocument } from './document.js';
import { normalisePara } from './misc.js';

// ---------------------------------------------------------------------------------- the selection
/** The one desktop-wide Edit selection (txtscrap): {doc, start, end} or doc = null. */
export const scrap = { doc: null, start: 0, end: 0 };

export function setSelection(doc, a, b) {
  const old = scrap.doc;
  if (a > b) [a, b] = [b, a];
  if (!doc || a === b) { scrap.doc = null; scrap.start = scrap.end = 0; }
  else { scrap.doc = doc; scrap.start = a; scrap.end = b; }
  if (old && old !== scrap.doc) for (const v of old.views) v.invalidate();
  if (scrap.doc) for (const v of scrap.doc.views) v.invalidate();
}
export const clearSelection = () => setSelection(null, 0, 0);
export const hasSelection = (doc) => scrap.doc != null && (doc == null || scrap.doc === doc);

// ---------------------------------------------------------------------------------- system font
let sysFont = null;           // Uint8Array(256*8) rows
const atlases = new Map();    // css colour -> canvas (256 glyphs of 8x16)
export async function loadSystemFont() {
  if (sysFont) return sysFont;
  const r = await fetch('assets/fonts/system8x8.json');
  const j = await r.json();
  sysFont = new Uint8Array(256 * 8);
  j.chars.forEach((rows, c) => rows.forEach((b, y) => { sysFont[c * 8 + y] = b; }));
  return sysFont;
}
function atlas(colour) {
  let a = atlases.get(colour);
  if (a) return a;
  a = document.createElement('canvas');
  a.width = 256 * 8; a.height = 16;
  const g = a.getContext('2d');
  const img = g.createImageData(a.width, a.height);
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(colour) ?? [0, '00', '00', '00'];
  const [R, G, B] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  for (let c = 0; c < 256; c++) {
    for (let y = 0; y < 8; y++) {
      const bits = sysFont ? sysFont[c * 8 + y] : 0;
      for (let x = 0; x < 8; x++) {
        if (!(bits & (0x80 >> x))) continue;
        for (const yy of [y * 2, y * 2 + 1]) {
          const o = (yy * a.width + c * 8 + x) * 4;
          img.data[o] = R; img.data[o + 1] = G; img.data[o + 2] = B; img.data[o + 3] = 255;
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
  atlases.set(colour, a);
  return a;
}

// RISC OS Latin-1 0x80-0x9F -> Unicode for outline fonts
const HIGH = ['€', 'Ŵ', 'ŵ', '◰', '▢', 'Ŷ', 'ŷ', '▣', '⇦', '⇨', '⇩', '⇧', '…', '™', '‰', '•', '‘', '’', '‹', '›', '“', '”', '„', '–', '—', '−', 'Œ', 'œ', '†', '‡', 'ﬁ', 'ﬂ'];
const hex2 = (c) => c.toString(16).padStart(2, '0');
const isCtl = (c) => c < 32 || c === 127;

// ---------------------------------------------------------------------------------- options
/** txtar_options defaults (txtar__defaultoptions) + txtedit's misc options. */
export function defaultOptions() {
  return {
    fixfont: true, fontname: 'Homerton.Medium', fontwidth: 12, fontheight: 12,
    fore: 7, back: 0, margin: 2, leading: 0, wraptowindow: false,
    bigWindows: false, bigSize: 0,
    overwrite: false, wordtab: true, wordwrap: false, undosize: 5000,
  };
}
/** Parse Edit$Options (e.g. "f7 b0 l0 m2 h12 w12 r a80 O T D u5000 nTrinity.Medium"). */
export function parseOptions(str, o = defaultOptions()) {
  const s = String(str ?? '');
  let i = 0;
  const num = () => { let neg = false; if (s[i] === '-') { neg = true; i++; } let n = 0, any = false; while (i < s.length && s[i] >= '0' && s[i] <= '9') { n = n * 10 + (+s[i]); i++; any = true; } return any ? (neg ? -n : n) : 0; };
  while (i < s.length) {
    const c = s[i++];
    switch (c) {
      case 'f': case 'F': o.fore = num() & 15; break;
      case 'b': case 'B': o.back = num() & 15; break;
      case 'l': case 'L': o.leading = num(); break;
      case 'm': case 'M': o.margin = num(); break;
      case 'h': case 'H': o.fontheight = num(); break;
      case 'w': case 'W': o.fontwidth = num(); break;
      case 'r': case 'R': o.wraptowindow = true; break;
      case 'a': case 'A': o.bigWindows = true; o.bigSize = num(); break;
      case 'O': case 'o': o.overwrite = true; break;
      case 'T': case 't': o.wordtab = false; break;
      case 'D': case 'd': o.wordwrap = true; break;
      case 'U': case 'u': o.undosize = Math.max(100, num()); break;
      case 'n': case 'N': o.fontname = s.slice(i).trim(); o.fixfont = false; i = s.length; break;
      default: break;
    }
  }
  return o;
}
export function formatOptions(o) {
  let a = `f${o.fore} b${o.back} l${o.leading} m${o.margin} h${o.fontheight} w${o.fontwidth}${o.wraptowindow ? ' r' : ''}`;
  if (o.overwrite) a += ' O';
  if (!o.wordtab) a += ' T';
  if (o.wordwrap) a += ' D';
  if (o.undosize !== 5000) a += ` u${o.undosize}`;
  if (o.bigWindows) a += ` a${o.bigSize}`;
  if (!o.fixfont) a += ` n${o.fontname}`;
  return a;
}

// ---------------------------------------------------------------------------------- the view
let startY = 0;                  // txtar__starty: new windows are staggered 48 OS units (24px) down, 5 positions
/** Geometry of the Edit "text" template window (OS units, screen origin bottom-left). */
export const TEXT_TEMPLATE = { x0: 198, y0: 384, x1: 1038, y1: 856 };

export class EditView {
  constructor(task, doc, opts = {}) {
    this.task = task;
    this.doc = doc;
    this.options = { ...defaultOptions(), ...(opts.options ?? {}) };
    this.handlers = opts.handlers ?? {};
    this.keyFilter = null;
    this.titleOverride = null;
    this.caret = 0;
    this.vpad = 0;               // virtual spaces to the right of a line end (column tab)
    this.wantX = null;           // goal x for vertical movement
    this.rows = null;            // [{s, e}]
    this.selType = 'char';       // char | word | line (multi-click)
    this.selectRecent = false;
    this.pivot = 0;
    this._lastDouble = 0;

    const T = TEXT_TEMPLATE;
    const def = {
      title: '<untitled>',
      flags: { back: true, close: true, title: true, toggle: true, vscroll: true, hscroll: true, size: true, moveable: true, scrollRepeat: false },
      colours: { titleFg: 7, titleBg: 2, workFg: 7, workBg: this.options.back, scrollOuter: 3, scrollInner: 1, titleFocus: 12 },
      extent: { w: wimp.width, h: wimp.height },
      x: opts.x ?? T.x0 / 2, y: opts.y ?? Math.max(24, wimp.height - T.y1 / 2) + startY,
      w: opts.w ?? (T.x1 - T.x0) / 2, h: opts.h ?? (T.y1 - T.y0) / 2,
      workButton: 'clickdragdouble',
      minW: 1, minH: 1,
    };
    if (opts.x == null && opts.y == null) { startY += 24; if (startY > 96) startY = 0; }
    this.win = task.createWindow(def);
    this.win.pointer = 'ptr_write';
    this.win.userData = this;
    this.win.useCanvas((g, r) => this.render(g, r), { fill: true, hiDPI: true });
    this._wire();
    doc.views.add(this);
    this._onChange = (ev) => this._docChanged(ev);
    this._onModified = () => this.updateTitles();
    doc.on('change', this._onChange);
    doc.on('modified', this._onModified);
    // Message_ModeChange: txtar__setmode re-reads the screen width, so the wrap width and the work-area
    // extent (screen width - scroll bar, txtar__settextlimits / setextent) follow the new screen size.
    this._offMode = wimp.on('modechange', () => { this.modeChanged(); });
    this.applyOptions(false);
    this.updateTitles();
  }

  // ------------------------------------------------------------------ metrics
  get fixed() { return this.options.fixfont; }
  get fontCss() {
    const o = this.options;
    return desktopFonts.cssFor(o.fontname, o.fontheight);
  }
  _metrics() {
    const o = this.options;
    if (o.fixfont) { this.cw = 8; this.fh = 16; this.base = 13; }
    else {
      const px = Math.max(4, o.fontheight * 1.25);
      this.fh = Math.ceil(px * 1.2);
      this.base = Math.ceil(px * 0.95);
      this.xscale = o.fontwidth / o.fontheight;
      const c = document.createElement('canvas').getContext('2d');
      c.font = this.fontCss;
      this._mctx = c;
      this._wcache = new Map();
    }
    this.lh = Math.max(4, this.fh + o.leading);
  }
  /** Display string for a character code. */
  static glyph(c) { return isCtl(c) ? `[${hex2(c)}]` : c >= 0x80 && c < 0xA0 ? HIGH[c - 0x80] : String.fromCharCode(c); }
  cwidth(c) {
    if (this.options.fixfont) return isCtl(c) ? 32 : 8;
    let w = this._wcache.get(c);
    if (w == null) { w = this._mctx.measureText(EditView.glyph(c)).width * this.xscale; this._wcache.set(c, w); }
    return w;
  }
  get wrapWidth() {
    const o = this.options;
    if (o.wraptowindow) return Math.max(24, this.win.w);
    if (o.bigWindows && o.bigSize > 0) return o.bigSize * 8 + 1;
    return wimp.width - 20;
  }

  // ------------------------------------------------------------------ layout
  layout() {
    if (this.rows) return this.rows;
    const t = this.doc.text, n = t.length;
    const W = this.wrapWidth, m = this.options.margin;
    const rows = [];
    let s = 0, x = m;
    for (let i = 0; i < n; i++) {
      const c = t.charCodeAt(i);
      if (c === 10) { rows.push({ s, e: i }); s = i + 1; x = m; continue; }
      const w = this.cwidth(c);
      if (x + w > W && i > s) { rows.push({ s, e: i, wrap: true }); s = i; x = m; }
      x += w;
    }
    rows.push({ s, e: n });
    this.rows = rows;
    this._syncExtent();
    return rows;
  }
  relayout() { this.rows = null; this.layout(); this.invalidate(); }
  /** The screen size changed: re-wrap and re-sync the extent (before the Wimp re-opens the window). */
  modeChanged() {
    this.relayout();
    if (this.hasFocus) this.showCaret();
  }
  _syncExtent() {
    const rows = this.rows;
    const h = Math.max(rows.length * this.lh + 4, wimp.height);
    // txtar__setextent: x1 = screen width - scroll bar width (the window outline minus its visible
    // area), or the big-window width; wrap-to-window windows keep the extent at the window's width.
    const o = this.options, f = this.win._frame ?? { left: 1, rightW: 20 };
    const w = o.wraptowindow ? Math.max(this.win.w, 64)
      : o.bigWindows && o.bigSize > 0 ? Math.max(this.wrapWidth, 64)
      : Math.max(wimp.width - f.left - f.rightW, 64);
    const e = this.win.extent;
    if (e.x1 !== w || e.y1 !== h) this.win.setExtent({ w, h });
  }
  /** Row index containing text index i (caret convention: a wrap point belongs to the next row). */
  rowOf(i) {
    const rows = this.layout();
    let lo = 0, hi = rows.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (rows[mid].s <= i) lo = mid; else hi = mid - 1;
    }
    return lo;
  }
  xOf(i, r = this.rowOf(i)) {
    const row = this.layout()[r];
    let x = this.options.margin;
    for (let k = row.s; k < i && k < row.e; k++) x += this.cwidth(this.doc.charAt(k));
    return x;
  }
  /** Text index nearest to work-area point (x, y). */
  indexAt(x, y) {
    const rows = this.layout();
    const r = Math.max(0, Math.min(rows.length - 1, Math.floor(y / this.lh)));
    return this.indexInRow(r, x);
  }
  indexInRow(r, x) {
    const row = this.layout()[r];
    let cx = this.options.margin;
    for (let k = row.s; k < row.e; k++) {
      const w = this.cwidth(this.doc.charAt(k));
      if (x < cx + w / 2) return k;
      cx += w;
    }
    return row.e;
  }

  // ------------------------------------------------------------------ rendering
  invalidate() { if (this.win.isOpen) this.win.invalidate(); }
  render(g, rect) {
    const rows = this.layout();
    const o = this.options, lh = this.lh;
    const fg = wimpColour(o.fore), bg = wimpColour(o.back);
    g.fillStyle = bg;
    g.fillRect(rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0);
    const r0 = Math.max(0, Math.floor(rect.y0 / lh)), r1 = Math.min(rows.length - 1, Math.floor(rect.y1 / lh));
    const sel = scrap.doc === this.doc ? scrap : null;
    const t = this.doc.text;
    const yoff = Math.floor(o.leading / 2);
    if (!o.fixfont) { g.font = this.fontCss; g.textBaseline = 'alphabetic'; }
    const atlFg = o.fixfont ? atlas(fg) : null, atlBg = o.fixfont ? atlas(bg) : null;
    for (let r = r0; r <= r1; r++) {
      const row = rows[r];
      let x = o.margin;
      const y = r * lh;
      for (let k = row.s; k < row.e; k++) {
        const c = t.charCodeAt(k);
        const w = this.cwidth(c);
        if (x > rect.x1) break;
        const hl = sel && k >= sel.start && k < sel.end;
        if (x + w >= rect.x0) {
          if (hl) { g.fillStyle = fg; g.fillRect(Math.floor(x), y, Math.ceil(w), lh); }
          if (o.fixfont) {
            const A = hl ? atlBg : atlFg;
            if (isCtl(c)) {
              const s = EditView.glyph(c);
              for (let q = 0; q < 4; q++) g.drawImage(A, s.charCodeAt(q) * 8, 0, 8, 16, x + q * 8, y + yoff, 8, 16);
            } else if (c !== 32) g.drawImage(A, c * 8, 0, 8, 16, x, y + yoff, 8, 16);
          } else {
            const s = EditView.glyph(c);
            if (c !== 32) {
              g.fillStyle = hl ? bg : fg;
              if (this.xscale !== 1) { g.save(); g.translate(x, y + yoff + this.base); g.scale(this.xscale, 1); g.fillText(s, 0, 0); g.restore(); }
              else g.fillText(s, x, y + yoff + this.base);
            }
          }
        }
        x += w;
      }
      // a selected newline shows as one highlighted space at the end of the line
      if (sel && !row.wrap && row.e < t.length && row.e >= sel.start && row.e < sel.end && x <= rect.x1) {
        g.fillStyle = fg;
        g.fillRect(Math.floor(x), y, Math.ceil(this.cwidth(32)), lh);
      }
    }
  }

  // ------------------------------------------------------------------ title
  get displayName() { return this.doc.filename || '<untitled>'; }
  updateTitles() { for (const v of this.doc.views) v._title(); }
  _title() {
    if (this.titleOverride) { this.win.setTitle(typeof this.titleOverride === 'function' ? this.titleOverride(this) : this.titleOverride); return; }
    let a = this.displayName;
    if (this.doc.modified) a += ' *';
    const n = this.doc.views.size;
    if (n > 1) a += ' ' + n;
    const o = this.options;
    if (!o.wordtab) a += ' ColTab';
    if (o.overwrite) a += ' Overwrite';
    if (o.wordwrap) a += ' Wordwrap';
    this.win.setTitle(a);
  }

  // ------------------------------------------------------------------ open / close
  open(state = {}) { this.win.open({ behind: 'top', ...state }); this.showCaret(); return this; }
  get hasFocus() { return wimp.caret?.window === this.win; }
  showCaret(take = true) {
    if (!this.win.isOpen) return;
    if (!take && !this.hasFocus) return;
    const r = this.rowOf(this.caret);
    let x = this.xOf(this.caret, r) + this.vpad * (this.fixed ? 8 : this.cwidth(32));
    wimp.setCaret(this.win, null, -1, { x: Math.round(x), y: r * this.lh, h: this.lh });   // 1 px Font_Caret-style caret at the character boundary
  }
  dispose() {
    this._offMode?.();
    this.doc.views.delete(this);
    this.doc.off?.('change', this._onChange);
    this.doc.off?.('modified', this._onModified);
    this.win.delete();
    this.updateTitles();
    if (scrap.doc === this.doc && this.doc.views.size === 0) clearSelection();
  }

  applyOptions(persist = true) {
    this._metrics();
    this.win.colours.workBg = this.options.back;
    this.doc.undoLimit = this.options.undosize;
    this.rows = null;
    this.layout();
    this.win._layout();
    this.invalidate();
    this._title();
    if (this.hasFocus) this.showCaret();
    if (persist) this.handlers.optionsChanged?.(this);
  }

  // ------------------------------------------------------------------ caret & scrolling
  /** Move the caret (txt_setdot). The input focus is only taken with {take: true}. */
  setCaret(i, { keepWant = false, scroll = true, take = false } = {}) {
    this.caret = Math.max(0, Math.min(i, this.doc.length));
    this.vpad = 0;
    if (!keepWant) this.wantX = null;
    if (scroll) this.ensureVisible(this.caret);
    this.showCaret(take);
  }
  ensureVisible(i) {
    const w = this.win;
    const r = this.rowOf(i);
    const y0 = r * this.lh, y1 = y0 + this.lh;
    const x = this.xOf(i, r);
    let sx = w.scrollX, sy = w.scrollY;
    if (y0 < sy) sy = y0;
    else if (y1 > sy + w.h) sy = y1 - w.h;
    if (x < sx + 8) sx = Math.max(0, x - w.w / 2);
    else if (x > sx + w.w - 16) sx = x - w.w / 2;
    if (sx !== w.scrollX || sy !== w.scrollY) w.scrollTo(Math.round(sx), Math.round(sy));
  }
  moveVertical(dRows) {
    const r = this.rowOf(this.caret);
    if (this.wantX == null) this.wantX = this.xOf(this.caret, r);
    const rows = this.layout();
    const nr = Math.max(0, Math.min(rows.length - 1, r + dRows));
    const i = this.indexInRow(nr, this.wantX + 0.01);
    this.setCaret(i, { keepWant: true });
  }
  get visibleRows() { return Math.max(1, Math.floor(this.win.h / this.lh)); }
  scrollRows(d) { this.win.scrollTo(this.win.scrollX, this.win.scrollY + d * this.lh); }

  _docChanged({ pos, delLen, insLen }) {
    this.rows = null;
    const adj = (i) => (i >= pos + delLen ? i - delLen + insLen : i > pos ? pos : i);
    this.caret = adj(this.caret);
    this.pivot = adj(this.pivot);
    if (scrap.doc === this.doc && this === [...this.doc.views][0]) {
      const a = scrap.start >= pos + delLen ? scrap.start - delLen + insLen : Math.min(scrap.start, pos);
      let b = scrap.end >= pos + delLen ? scrap.end - delLen + insLen : Math.min(scrap.end, pos + insLen);
      scrap.start = a; scrap.end = Math.max(a, b);
      if (scrap.start === scrap.end) scrap.doc = null;
    }
    this.layout();
    this.invalidate();
    if (this.hasFocus) this.showCaret();
  }

  // ------------------------------------------------------------------ input wiring
  _wire() {
    const w = this.win;
    w.on('click', (ev) => this._click(ev));
    w.on('doubleclick', (ev) => this._double(ev));
    w.on('drag', (ev) => this._drag(ev));
    w.on('key', (ev) => this.key(ev));
    w.on('paste', (ev) => { if (!this.doc.readOnly) { this.typeText(ev.text.replace(/\r\n?/g, '\n')); } return true; });
    w.on('close', (ev) => { ev.preventDefault(); if (this.handlers.close) this.handlers.close(this, ev); else this.dispose(); });
    w.on('open', (ev) => {
      if (this.options.wraptowindow && ev.w !== w.w) { ev.preventDefault(); w.open(ev); this.relayout(); if (this.hasFocus) this.showCaret(); }
    });
    w.on('gaincaret', () => this.handlers.focus?.(this));
    w.on('helprequest', (ev) => { ev.text = this.handlers.help?.(this, ev) ?? null; });
    w.on('dataload', (ev) => { this.handlers.dataLoad?.(this, ev); return true; });
    w.on('datasave', (ev) => { this.handlers.dataSave?.(this, ev); return true; });
  }

  _click(ev) {
    if (ev.button === 'menu') { this.handlers.menu?.(this, ev); return true; }
    const at = this.indexAt(ev.x, ev.y);
    const now = performance.now();
    if (ev.button === 'select') {
      if (now - this._lastDouble < input.config.doubleClickMs) {
        // third click: select the line
        this.selType = 'line';
        const a = this.doc.bol(at), b = Math.min(this.doc.length, this.doc.eol(at) + 1);
        this.pivot = a;
        setSelection(this.doc, a, b);
        this._lastDouble = 0;
        return true;
      }
      this.selType = 'char';
      this.selectRecent = true;
      this.pivot = at;
      if (ev.ctrl) { this.selectRecent = false; setSelection(this.doc, at, at + 1); if (!this.hasFocus) this.showCaret(true); }
      else this.setCaret(at, { scroll: false, take: true });
    } else if (ev.button === 'adjust') {
      this.adjustTo(at);
      if (!this.hasFocus) this.showCaret(true);
    }
    return true;
  }
  _double(ev) {
    if (ev.button !== 'select') return this._click(ev);
    const at = this.indexAt(ev.x, ev.y);
    this.selType = 'word';
    const [a, b] = this.doc.wordAt(at);
    this.pivot = a;
    setSelection(this.doc, a, b);
    this._lastDouble = performance.now();
    return true;
  }
  /** Adjust-click: extend the selection (or make one from the caret). */
  adjustTo(at) {
    if (scrap.doc === this.doc) {
      const mid = (scrap.start + scrap.end) / 2;
      this.pivot = at <= mid ? scrap.end : scrap.start;
    } else this.pivot = this.caret;
    this._selectTo(at);
  }
  _selectTo(at) {
    let a = this.pivot, b = at;
    if (this.selType === 'word') {
      const [wa, wb] = this.doc.wordAt(at);
      const [pa, pb] = this.doc.wordAt(this.pivot);
      a = Math.min(pa, wa); b = Math.max(pb, wb);
    } else if (this.selType === 'line') {
      a = Math.min(this.doc.bol(this.pivot), this.doc.bol(at));
      b = Math.min(this.doc.length, Math.max(this.doc.eol(this.pivot), this.doc.eol(at)) + 1);
    }
    setSelection(this.doc, a, b);
  }
  _drag(ev) {
    if (ev.button === 'menu') return;
    const w = this.win;
    if (ev.button === 'select' && this.selectRecent) {
      this.selectRecent = false;
      clearSelection();
      this.pivot = this.indexAt(w.screenToWork(ev.startSX, ev.startSY).x, w.screenToWork(ev.startSX, ev.startSY).y);
    } else if (ev.button === 'adjust' || scrap.doc !== this.doc) {
      const at0 = this.indexAt(ev.x, ev.y);
      if (scrap.doc === this.doc) this.pivot = at0 <= (scrap.start + scrap.end) / 2 ? scrap.end : scrap.start;
      else if (ev.button === 'adjust') this.pivot = this.caret;
    }
    let last = { x: input.mouseX, y: input.mouseY };
    const update = () => {
      const p = w.screenToWork(last.x, last.y);
      this._selectTo(this.indexAt(p.x, p.y));
    };
    const timer = setInterval(() => {
      // auto-scroll while the pointer is outside the visible area
      let dx = 0, dy = 0;
      if (last.y < w.y) dy = -this.lh; else if (last.y > w.y + w.h) dy = this.lh;
      if (last.x < w.x) dx = -16; else if (last.x > w.x + w.w) dx = 16;
      if (dx || dy) { w.scrollTo(w.scrollX + dx, w.scrollY + dy); update(); }
    }, 60);
    startPointerDrag(ev.pointerEvent ?? {}, {
      onMove: (q) => { last = q; update(); },
      onEnd: () => { clearInterval(timer); },
    });
    update();
    return true;
  }

  // ------------------------------------------------------------------ editing helpers
  get ro() { return this.doc.readOnly; }
  /** Insert typed text at the caret (honours overwrite, virtual padding and wordwrap). */
  typeText(s) {
    if (this.ro || !s) return;
    const d = this.doc;
    let at = this.caret;
    if (this.vpad) { d.insert(at, ' '.repeat(this.vpad)); at += this.vpad; this.vpad = 0; }
    let del = 0;
    if (this.options.overwrite && s[0] !== '\n') {
      while (del < s.length && at + del < d.length && d.charAt(at + del) !== 10) del++;
    }
    d.replace(at, del, s);
    if (s !== '\n') this.normalisePara(at);
    this.setCaret(at + s.length);
  }
  /** Wordwrap (txtedit_normalisepara): reformat from the line containing i, if wordwrap is on. */
  normalisePara(i = this.caret) {
    if (!this.options.wordwrap) return;
    normalisePara(this.doc, i, this.handlers.formatWidth?.() ?? 76);
  }
  deleteLeft(n = 1) {
    if (this.ro) return;
    if (this.vpad) { this.vpad = Math.max(0, this.vpad - n); this.showCaret(); return; }
    const d = this.doc, at = this.caret;
    const k = Math.min(n, at);
    if (!k) return;
    const ateof = at === d.length, atnl = d.charAt(at) === 10;
    if (this.options.overwrite && !ateof && !atnl && !d.slice(at - k, at).includes('\n')) d.replace(at - k, k, ' '.repeat(k));
    else d.replace(at - k, k, '');
    this.normalisePara(at - k);
    this.setCaret(at - k);
  }

  // ------------------------------------------------------------------ keys (txtedit_obeyeventcode)
  key(ev) {
    if (this.keyFilter && this.keyFilter(ev)) return true;
    const code = ev.code;
    const d = this.doc;
    const H = this.handlers;
    const sep = () => d.separate();
    let used = true;
    switch (code) {
      // --- function keys
      case 0x191: this.options.overwrite = !this.options.overwrite; wimp.menus.close(); this.updateTitles(); H.optionsChanged?.(this); break;   // Shift-F1
      case 0x1B1: H.expandTabs?.(this); break;                         // Shift-Ctrl-F1
      case 0x182: H.newFile?.(this); break;                            // F2
      case 0x192: H.insertFile?.(this); break;                         // Shift-F2
      case 0x183: H.save?.(this); break;                               // F3
      case 0x193: this.options.wordtab = !this.options.wordtab; wimp.menus.close(); this.updateTitles(); H.optionsChanged?.(this); break; // Shift-F3
      case 0x184: H.find?.(this); break;                               // F4
      case 0x1A4: H.indent?.(this); break;                             // Ctrl-F4
      case 0x185: H.gotoLine?.(this); break;                           // F5
      case 0x1A5: this.options.wordwrap = !this.options.wordwrap; wimp.menus.close(); this.updateTitles(); H.optionsChanged?.(this); break; // Ctrl-F5
      case 0x186: {                                                    // F6: extend selection by a character
        const at = this.caret;
        if (scrap.doc === d) setSelection(d, at, at <= (scrap.start + scrap.end) / 2 ? scrap.end : scrap.start);
        else if (at === d.length) setSelection(d, at - 1, at);
        else setSelection(d, at, at + 1);
        break;
      }
      case 0x196: clearSelection(); break;                            // Shift-F6
      case 0x1A6: H.formatText?.(this); break;                         // Ctrl-F6
      case 0x187: this.copySelection(); break;                         // F7
      case 0x197: this.moveSelection(); break;                         // Shift-F7
      case 0x1A7: this.exchangeCaretAndSelection(); break;             // Ctrl-F7
      case 0x188: this.undo(); return true;                            // F8
      case 0x1A8: H.swapCRLF?.(this); break;                           // Ctrl-F8
      case 0x189: this.redo(); return true;                            // F9
      case 0x1EA: this.win.sendToBack(); break;                        // Ctrl-F10
      case 0x1A2: this.win.requestClose({ button: 'select' }); return true;  // Ctrl-F2
      case 27: break;                                                  // Escape: nothing
      case 0x1CD: if (!this.ro) { d.insert(this.caret, ' '); this.showCaret(); } break;   // Insert
      case 8: case 127: this.deleteLeft(1); break;
      // selection keys
      case 3: this.copySelection(); break;                            // ^C
      case 24: this.deleteSelection(); break;                          // ^X
      case 22: this.moveSelection(); break;                            // ^V
      case 26: clearSelection(); break;                                // ^Z
      // cursor keys
      case 0x18C: this.setCaret(this.vpad ? this.caret : this.caret - 1); break;
      case 0x18D: this.setCaret(this.caret + 1); break;
      case 0x18F: this.moveVertical(-1); break;
      case 0x18E: this.moveVertical(1); break;
      case 0x19C: this.setCaret(d.bow(this.caret)); break;            // Shift-left: word
      case 0x19D: this.setCaret(d.eow(this.caret)); break;            // Shift-right
      case 0x19F: this.moveVertical(-this.visibleRows); this.scrollRows(-this.visibleRows); break; // Shift-up = page
      case 0x19E: this.moveVertical(this.visibleRows); this.scrollRows(this.visibleRows); break;
      case 0x1AC: this.setCaret(d.bol(this.caret)); break;            // Ctrl-left: line start
      case 0x1AD: this.setCaret(d.eol(this.caret)); break;            // Ctrl-right: line end
      case 0x1AF: case 30: this.setCaret(0); break;                    // Ctrl-up / Home
      case 0x1AE: this.setCaret(d.length); break;                      // Ctrl-down
      case 0x1BF: case 0x1BC: this.scrollRows(-1); break;              // Shift-Ctrl-up: scroll
      case 0x1BE: case 0x1BD: this.scrollRows(1); break;
      case 0x18B: if (!this.ro) { d.delete(this.caret, 1); this.normalisePara(); this.showCaret(); } break;  // Copy: delete right
      case 0x19B: if (!this.ro) { d.delete(this.caret, d.eow(this.caret) - this.caret); this.normalisePara(); this.showCaret(); } break; // Shift-Copy: word
      case 0x1AB: if (!this.ro) { const a = d.bol(this.caret), b = Math.min(d.length, d.eol(this.caret) + 1); d.delete(a, b - a); this.setCaret(a); this.normalisePara(); } break; // Ctrl-Copy: line
      case 0x180: H.print?.(this); break;                              // Print
      case 0x18A: this.tab(); break;                                   // Tab
      case 13: this.typeText('\n'); break;
      default:
        if (code < 256 && !(code >= 0x80 && code < 0xA0 && ev.char == null)) this.typeText(String.fromCharCode(code));
        else used = false;
    }
    if (used && code !== 0x188 && code !== 0x189) sep();
    this.selectRecent = false;
    this.selType = 'char';
    return used;
  }

  tab() {
    if (this.ro) return;
    const d = this.doc;
    if (this.options.wordtab) {
      // txtmisc_tab: move to below the next word start in the line above
      const r = this.rowOf(this.caret);
      if (r === 0) return;
      const x = this.xOf(this.caret, r);
      let to = this.indexInRow(r - 1, x + 0.01);
      const rowAbove = this.layout()[r - 1];
      while (to < rowAbove.e && ![32, 10, 0].includes(d.charAt(to))) to++;
      const eolAbove = to >= rowAbove.e;
      while (to < rowAbove.e && d.charAt(to) === 32) to++;
      if (eolAbove) { this.setCaret(d.bol(this.caret)); return; }
      const tx = this.xOf(to, r - 1);
      const i = this.indexInRow(r, tx + 0.01);
      const rowx = this.xOf(i, r);
      const pad = Math.round((tx - rowx) / this.cwidth(32));
      if (pad > 0 && (i === this.layout()[r].e)) { this.caret = i; this.vpad = pad; this.showCaret(); return; }
      this.setCaret(i);
    } else {
      // txtmisc_tabcol: to the next multiple of 8 columns
      const at = this.caret;
      const col = at - d.bol(at) + this.vpad;
      const n = 8 - (col % 8);
      const atnl = at === d.length || d.charAt(at) === 10;
      if (atnl) { this.vpad += n; this.showCaret(); }
      else { d.insert(at, ' '.repeat(n)); this.setCaret(at + n); }
    }
  }

  // ------------------------------------------------------------------ selection operations
  /** Copy the selection (from any Edit window) to the caret. */
  copySelection() {
    if (!scrap.doc || this.ro) return false;
    const s = scrap.doc.slice(scrap.start, scrap.end);
    const at = this.caret;
    this.doc.insert(at, s);            // a copy leaves the selection where it was (txtmisc)
    this.setCaret(at + s.length);
    return true;
  }
  moveSelection() {
    if (!scrap.doc || this.ro) return false;
    const src = scrap.doc, a = scrap.start, b = scrap.end;
    const s = src.slice(a, b);
    let at = this.caret;
    if (src === this.doc && at >= a && at < b) { this.setCaret(b); return false; }
    src.delete(a, b - a);
    if (src === this.doc && at >= b) at -= (b - a);
    this.doc.insert(at, s);
    setSelection(this.doc, at, at + s.length);
    this.setCaret(at + s.length);
    return true;
  }
  deleteSelection() {
    if (!scrap.doc || scrap.doc.readOnly) return false;
    const src = scrap.doc, a = scrap.start, b = scrap.end;
    clearSelection();
    src.delete(a, b - a);
    return true;
  }
  exchangeCaretAndSelection() {
    if (!scrap.doc) return;
    const owner = scrap.doc, at = scrap.start;
    let dot = this.caret;
    if (dot === this.doc.length && dot) dot--;
    setSelection(this.doc, dot, dot + 1);
    for (const v of owner.views) { v.setCaret(at); break; }
  }
  select(a, b) { setSelection(this.doc, a, b); }
  undo() {
    const i = this.doc.undo();
    if (i < 0) { wimp.beep?.(); return false; }
    this.setCaret(i); return true;
  }
  redo() {
    const i = this.doc.redo();
    if (i < 0) { wimp.beep?.(); return false; }
    this.setCaret(i); return true;
  }
}

export { EditDocument };
