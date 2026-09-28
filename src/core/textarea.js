// TextArea: a box of several lines of editable text inside a window (the Wimp's writable icons hold one line),
// for notes, addresses, journal entries and the like. It draws itself (a canvas placed in the window's work area),
// takes clicks inside it and keys while it has the caret, wraps words, and scrolls when the text is longer than
// the box. Programs get it as TextArea (src/core/jsrun.js).
//
//   const notes = new TextArea(w, { x: 8, y: 40, w: 300, h: 120, text: 'Hello' })
//   notes.text                      the text (lines separated by '\n'); setting it redraws (and forgets undo)
//   notes.on('change', () => ...)   after every edit
//   notes.focus()                   give it the caret
//   notes.readOnly = true
//   notes.selection                 {start, end} (equal when nothing is selected); notes.select(a, b)
//   notes.selectedText, notes.insert(s) (replaces the selection), notes.undo() / notes.redo()
//   notes.resize(w, h)              a new size (e.g. to fill a window that was resized)
//   notes.setFont(css)              another font ('16px "Trinity"')
//   notes.scrollBy(rows)
// Options: grow: true makes the box as tall as its text (at least h) instead of scrolling inside it, so it can
// fill a window whose own scroll bars move it: it emits 'resize' {h} when its height changes (set the window's
// extent), and scrolls the window to keep the caret in view. border: false leaves out the box's outline.
//
// Keys: arrows, Home / Copy (start / end of the line), Ctrl-Up / Ctrl-Down (start / end of the text),
// Shift-Up / Shift-Down or Page Up / Page Down (a box full), Shift-Left / Shift-Right (select), Backspace /
// Delete, Copy (delete right), Return, Ctrl-U (delete the line), F8 / F9 (undo / redo), Ctrl-C / Ctrl-X / Ctrl-V
// (copy / cut / paste, with the computer's clipboard); pasted text. Tab / Shift-Tab move to the next / previous
// field (writable icon or text area) in the window, as in a dialogue box (Tab types two spaces if there is
// nothing else to move to). Mouse: Select places the caret (drag to select, double-click selects a word), Adjust
// or Shift-Select extends the selection; the wheel scrolls a box that doesn't grow. Keys a text area doesn't use
// (other Ctrl-keys, function keys) go on to the program's own key handler.

import { wimp } from './wimp.js';
import { Emitter } from './util.js';
import { fonts } from './fonts.js';
import { startPointerDrag, input } from './input.js';

const PAD = 4;
const BAR = 6;                     // the scroll indicator's width (a box that scrolls inside itself)
const MAX_CANVAS = 32000;          // device pixels: browsers refuse taller canvases
const UNDO_MAX = 500;
const isWordChar = (c) => /[\p{L}\p{N}_'\-]/u.test(c ?? '');

export class TextArea extends Emitter {
  constructor(win, { x = 0, y = 0, w = 200, h = 80, text = '', font = null, readOnly = false, grow = false, border = true } = {}) {
    super();
    this.win = win;
    this.x = x; this.y = y; this.w = w;
    this.minH = h; this.h = h;
    this.grow = grow; this.border = border;
    this._text = String(text);
    this.caret = this._text.length;
    this.anchor = this.caret;               // the other end of the selection (== caret: nothing selected)
    this.readOnly = readOnly;
    this.font = font ?? fonts.css;
    this.scroll = 0;
    this.focused = false;
    this._undo = []; this._redo = [];
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'textarea';
    Object.assign(this.canvas.style, { position: 'absolute', left: `${x}px`, top: `${y}px`, pointerEvents: 'none' });
    this.g = this.canvas.getContext('2d');
    win.work.appendChild(this.canvas);
    (win._textAreas ??= new Set()).add(this);
    this._size();
    this._measure();
    // the window's events: clicks inside the box, and keys / pastes while it has the caret. Its handlers go first,
    // so the program's own click and key handlers only see what the text area doesn't use.
    this._offs = [
      win.on('click', (ev) => this.click(ev), { first: true }),
      win.on('doubleclick', (ev) => this._double(ev), { first: true }),
      win.on('drag', (ev) => this._drag(ev), { first: true }),
      win.on('key', (ev) => this.key(ev), { first: true }),
      win.on('wheel', (ev) => this._wheel(ev), { first: true }),
      win.on('paste', (ev) => (this.focused ? (this.insert(ev.text.replace(/\r\n?/g, '\n')), true) : undefined), { first: true }),
      win.on('losecaret', () => this._blur()),
      win.on('caretmove', () => this._blur()),
    ];
    this.draw();
  }

  get text() { return this._text; }
  set text(t) {
    this._text = String(t ?? '');
    this.caret = this.anchor = Math.min(this.caret, this._text.length);
    this._undo = []; this._redo = [];
    this._layout(); this.draw();
  }
  contains(x, y) { return x >= this.x && x < this.x + this.w && y >= this.y && y < this.y + this.h; }

  get selection() { return { start: Math.min(this.caret, this.anchor), end: Math.max(this.caret, this.anchor) }; }
  get selectedText() { const s = this.selection; return this._text.slice(s.start, s.end); }
  /** Select [a, b) (the caret goes to b). */
  select(a, b = a) {
    const n = this._text.length;
    this.anchor = Math.max(0, Math.min(n, a));
    this.caret = Math.max(0, Math.min(n, b));
    this._ensureVisible(); this.draw();
  }

  // ------------------------------------------------------------------ size and layout: wrapped lines
  /** The canvas's size in the page (and its pixels). */
  _size() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_CANVAS / Math.max(1, this.h));
    Object.assign(this.canvas.style, { left: `${this.x}px`, top: `${this.y}px`, width: `${this.w}px`, height: `${this.h}px` });
    this.canvas.width = Math.round(this.w * dpr); this.canvas.height = Math.round(this.h * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  /** A new size (e.g. the window was resized); h is the least height of a box that grows. */
  resize(w, h = this.minH) {
    this.w = w; this.minH = h;
    if (!this.grow) this.h = h;
    this._layout(true);
    if (!this.grow) this._size();
    this.scroll = Math.max(0, Math.min(this.scroll, this._maxScroll));
    this.draw();
  }
  /** Show the text in another font (a CSS font, e.g. '16px "Trinity"'). */
  setFont(css) { this.font = css; this._measure(); this._ensureVisible(); this.draw(); }
  _measure() {
    this.g.font = this.font;
    const m = this.g.measureText('Mg');
    this.lh = Math.ceil((m.fontBoundingBoxAscent ?? 12) + (m.fontBoundingBoxDescent ?? 4)) + 2;
    this.base = Math.ceil(m.fontBoundingBoxAscent ?? 12) + 1;
    this._layout();
  }
  get _textW() { return this.w - 2 * PAD - (this.grow ? 0 : BAR); }
  get _contentH() { return this.rows.length * this.lh + 2 * PAD; }
  get _maxScroll() { return Math.max(0, this._contentH - this.h); }
  /** Rows: [{s, e}] text indexes of each displayed line (wrapped at spaces to the box's width). */
  _layout(resized = false) {
    const t = this._text, W = this._textW, g = this.g;
    g.font = this.font;
    const rows = [];
    let s = 0;
    while (s <= t.length) {
      let nl = t.indexOf('\n', s);
      if (nl < 0) nl = t.length;
      let a = s;
      while (true) {
        if (g.measureText(t.slice(a, nl)).width <= W) { rows.push({ s: a, e: nl }); break; }
        // the longest part that fits, broken after a space if there is one
        let e = a + 1;
        while (e < nl && g.measureText(t.slice(a, e + 1)).width <= W) e++;
        const sp = t.lastIndexOf(' ', e - 1);
        if (sp > a) e = sp + 1;
        rows.push({ s: a, e, wrap: true });
        a = e;
      }
      if (nl >= t.length) break;
      s = nl + 1;
    }
    if (!rows.length) rows.push({ s: 0, e: 0 });
    this.rows = rows;
    if (this.grow) {
      const h = Math.max(this.minH, this._contentH);
      if (h !== this.h || resized) {
        this.h = h;
        this._size();
        this.emit('resize', { h });
      }
    }
  }
  _rowOf(i) {
    let r = 0;
    for (let k = 0; k < this.rows.length; k++) if (this.rows[k].s <= i) r = k; else break;
    return r;
  }
  _xOf(i, r = this._rowOf(i)) { this.g.font = this.font; return PAD + this.g.measureText(this._text.slice(this.rows[r].s, i)).width; }
  _indexAt(x, y) {
    const r = Math.max(0, Math.min(this.rows.length - 1, Math.floor((y + this.scroll - PAD) / this.lh)));
    const row = this.rows[r];
    this.g.font = this.font;
    for (let k = row.s; k < row.e; k++) {
      const a = this.g.measureText(this._text.slice(row.s, k)).width, b = this.g.measureText(this._text.slice(row.s, k + 1)).width;
      if (x - PAD < (a + b) / 2) return k;
    }
    return row.wrap && row.e > row.s && this._text[row.e - 1] === ' ' ? row.e - 1 : row.e;
  }

  // ------------------------------------------------------------------ drawing
  draw() {
    const g = this.g;
    g.clearRect(0, 0, this.w, this.h);
    g.fillStyle = this.readOnly ? '#eeeeee' : '#ffffff';
    g.fillRect(0, 0, this.w, this.h);
    if (this.border) { g.strokeStyle = '#777777'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, this.w - 1, this.h - 1); }
    g.save();
    g.beginPath(); g.rect(1, 1, this.w - 2, this.h - 2); g.clip();
    g.font = this.font; g.textBaseline = 'alphabetic';
    const { start, end } = this.selection;
    this.rows.forEach((row, k) => {
      const y = PAD + k * this.lh - this.scroll;
      if (y + this.lh < 0 || y > this.h) return;
      if (end > start && start <= row.e && end >= row.s) {
        // the selected part of this row (and the line end, when the selection goes on past it)
        const a = Math.max(start, row.s), b = Math.min(end, row.e);
        const x0 = this._xOf(a, k), x1 = this._xOf(b, k) + (end > row.e ? 6 : 0);
        g.fillStyle = this.focused ? '#bbbbbb' : '#dddddd';
        g.fillRect(x0, y, Math.max(0, x1 - x0), this.lh);
      }
      g.fillStyle = '#000000';
      g.fillText(this._text.slice(row.s, row.e), PAD, y + this.base);
    });
    g.restore();
    // a box that scrolls inside itself shows where it is, when there is more text than fits
    if (!this.grow && this._maxScroll > 0) {
      const track = this.h - 4, len = Math.max(12, track * this.h / this._contentH);
      const top = 2 + (track - len) * (this.scroll / this._maxScroll);
      g.fillStyle = '#dddddd'; g.fillRect(this.w - BAR - 2, 2, BAR, track);
      g.fillStyle = '#888888'; g.fillRect(this.w - BAR - 2, top, BAR, len);
    }
    if (this.focused) this._showCaret();
  }
  _showCaret() {
    const r = this._rowOf(this.caret);
    const y = PAD + r * this.lh - this.scroll;
    const pos = y < 0 || y + this.lh > this.h ? { x: -100, y: -100, h: 0 } : { x: Math.round(this.x + this._xOf(this.caret, r)), y: this.y + y, h: this.lh };
    this._settingCaret = true;                  // (our own caret move doesn't take the focus away from us)
    wimp.setCaret(this.win, null, -1, pos);
    this._settingCaret = false;
  }
  _ensureVisible() {
    const y = PAD + this._rowOf(this.caret) * this.lh;
    if (this.grow) {
      // the window scrolls: keep the caret's line inside its visible area
      const w = this.win, top = this.y + y, bottom = top + this.lh;
      const visH = w.h ?? 0;
      if (!visH || !w.isOpen) return;
      if (top < w.scrollY) w.scrollTo(w.scrollX, Math.max(0, top - PAD));
      else if (bottom > w.scrollY + visH) w.scrollTo(w.scrollX, bottom - visH + PAD);
      return;
    }
    if (y - this.scroll < PAD) this.scroll = Math.max(0, y - PAD);
    else if (y + this.lh - this.scroll > this.h - PAD) this.scroll = y + this.lh - this.h + PAD;
  }
  scrollBy(rows) {
    if (this.grow) { const w = this.win; w.scrollTo(w.scrollX, Math.max(0, w.scrollY + rows * this.lh)); return; }
    this.scroll = Math.max(0, Math.min(this._maxScroll, this.scroll + rows * this.lh));
    this.draw();
  }

  // ------------------------------------------------------------------ focus and the mouse
  focus() {
    for (const o of this.win._textAreas ?? []) if (o !== this) { o.focused = false; o.draw(); }   // one text area has the caret
    this.focused = true; this._ensureVisible(); this.draw();
  }
  _blur() { if (this._settingCaret) return; if (this.focused) { this.focused = false; this.draw(); } }
  click(ev) {
    if (!this.contains(ev.x, ev.y)) { if (this.focused) { this.focused = false; this.draw(); } return undefined; }
    if (ev.button === 'menu') return undefined;
    const i = this._indexAt(ev.x - this.x, ev.y - this.y);
    if (ev.button === 'adjust' || (ev.shift && !ev.shiftAdjust)) this.caret = i;     // extend the selection
    else this.caret = this.anchor = i;
    this.focus();
    return true;
  }
  _double(ev) {
    if (!this.contains(ev.x, ev.y) || ev.button !== 'select') return undefined;
    const t = this._text, i = this._indexAt(ev.x - this.x, ev.y - this.y);
    let a = i, b = i;
    while (a > 0 && isWordChar(t[a - 1])) a--;
    while (b < t.length && isWordChar(t[b])) b++;
    this.select(a, b);
    this.focus();
    return true;
  }
  _drag(ev) {
    if (!this.contains(ev.x, ev.y) || ev.button === 'menu') return undefined;
    const w = this.win;
    const at = (sx, sy) => { const p = w.screenToWork(sx, sy); return this._indexAt(p.x - this.x, p.y - this.y); };
    if (ev.button === 'select' && !ev.shift) this.anchor = at(ev.startSX ?? ev.sx, ev.startSY ?? ev.sy);
    let last = { x: input.mouseX, y: input.mouseY };
    const update = () => { this.caret = at(last.x, last.y); this._ensureVisible(); this.draw(); };
    // scroll while the pointer is above or below the box (a growing box: the window's visible area)
    const timer = setInterval(() => {
      const top = this.grow ? w.y : w.workToScreen(0, this.y).y, bottom = this.grow ? w.y + w.h : top + this.h;
      if (last.y < top) { this.scrollBy(-1); update(); } else if (last.y > bottom) { this.scrollBy(1); update(); }
    }, 80);
    startPointerDrag(ev.pointerEvent ?? {}, { onMove: (q) => { last = q; update(); }, onEnd: () => clearInterval(timer) });
    this.focus();
    update();
    return true;
  }
  _wheel(ev) {
    if (this.grow) return undefined;
    const p = this.win.screenToWork(input.mouseX, input.mouseY);
    if (!this.contains(p.x, p.y) || this._maxScroll <= 0) return undefined;
    this.scrollBy(Math.sign(ev.dy) * 3);
    return true;
  }

  // ------------------------------------------------------------------ editing
  _moveTo(i, extend = false) {
    this.caret = Math.max(0, Math.min(this._text.length, i));
    if (!extend) this.anchor = this.caret;
    this._ensureVisible(); this.draw();
  }
  _vertical(d, extend = false) {
    const r = this._rowOf(this.caret), x = this._xOf(this.caret, r);
    const nr = Math.max(0, Math.min(this.rows.length - 1, r + d));
    this._moveTo(this._indexAt(x, PAD + nr * this.lh - this.scroll + 1), extend);
  }
  get _pageRows() { return Math.max(1, Math.floor(((this.grow ? this.win.h : this.h) - 2 * PAD) / this.lh) - 1); }
  /** Replace [a, b) with s and put the caret after it (undoable). */
  replace(a, b, s, { typing = false } = {}) {
    if (this.readOnly) return;
    const removed = this._text.slice(a, b);
    const last = this._undo[this._undo.length - 1];
    // typing a word (and the space after it) is one step to undo, not one per character
    if (typing && last?.typing && !removed && last.a + last.inserted.length === a && !(/\s$/.test(last.inserted) && !/\s/.test(s))) last.inserted += s;
    else {
      this._undo.push({ a, removed, inserted: s, typing: typing && !removed, before: { caret: this.caret, anchor: this.anchor } });
      if (this._undo.length > UNDO_MAX) this._undo.shift();
    }
    this._redo = [];
    this._apply(a, b, s);
  }
  _apply(a, b, s) {
    this._text = this._text.slice(0, a) + s + this._text.slice(b);
    this.caret = this.anchor = a + s.length;
    this._layout();
    this._ensureVisible(); this.draw();
    this.emit('change', { text: this._text });
  }
  /** Type s where the caret is, in place of the selection. */
  insert(s, opts) { const { start, end } = this.selection; this.replace(start, end, s, opts); }
  undo() {
    const u = this._undo.pop();
    if (!u || this.readOnly) return false;
    this._redo.push(u);
    this._apply(u.a, u.a + u.inserted.length, u.removed);
    this.caret = u.before.caret; this.anchor = u.before.anchor;
    this._ensureVisible(); this.draw();
    return true;
  }
  redo() {
    const u = this._redo.pop();
    if (!u || this.readOnly) return false;
    this._undo.push(u);
    this._apply(u.a, u.a + u.removed.length, u.inserted);
    return true;
  }
  get canUndo() { return this._undo.length > 0; }
  get canRedo() { return this._redo.length > 0; }
  copy() {
    const s = this.selectedText;
    if (s) navigator.clipboard?.writeText(s).catch(() => {});
    return s;
  }
  /** Delete the selection, or the character before (d = -1) or after (d = 1) the caret. */
  _delete(d) {
    const { start, end } = this.selection;
    if (end > start) this.replace(start, end, '');
    else if (d < 0 && start > 0) this.replace(start - 1, start, '');
    else if (d > 0 && start < this._text.length) this.replace(start, start + 1, '');
  }
  key(ev) {
    if (!this.focused) return undefined;
    const t = this._text, i = this.caret, row = this.rows[this._rowOf(i)];
    switch (ev.code) {
      case 0x18C: this._moveTo(i - 1); return true;                           // left
      case 0x18D: this._moveTo(i + 1); return true;                           // right
      case 0x19C: this._moveTo(i - 1, true); return true;                     // Shift-left: select
      case 0x19D: this._moveTo(i + 1, true); return true;                     // Shift-right: select
      case 0x18F: this._vertical(-1); return true;                            // up
      case 0x18E: this._vertical(1); return true;                             // down
      case 0x19F: this._vertical(-this._pageRows); return true;               // Shift-up / Page Up
      case 0x19E: this._vertical(this._pageRows); return true;                // Shift-down / Page Down
      case 30: case 0x1AC: this._moveTo(row.s); return true;                  // Home, Ctrl-left: start of the line
      case 0x18B: if (ev.shift || ev.ctrl) { this._moveTo(row.e); return true; } this._delete(1); return true;  // Copy
      case 0x1AD: this._moveTo(row.e); return true;                           // Ctrl-right: end of the line
      case 0x1AF: this._moveTo(0); return true;                               // Ctrl-up
      case 0x1AE: this._moveTo(t.length); return true;                        // Ctrl-down
      case 8: case 127: this._delete(-1); return true;                        // Backspace / Delete
      case 13: this.insert('\n'); return true;
      case 0x188: this.undo(); return true;                                   // F8
      case 0x189: this.redo(); return true;                                   // F9
      case 3: this.copy(); return true;                                       // Ctrl-C
      case 24: if (this.copy()) this._delete(0); return true;                 // Ctrl-X
      case 22: ev.allowDefault = true; return true;                           // Ctrl-V: the browser pastes (a paste event)
      case 0x18A: if (!wimp.focusNext(this.win, this, 1)) this.insert('  '); return true;   // Tab: the next field (else 2 spaces)
      case 0x19A: wimp.focusNext(this.win, this, -1); return true;           // Shift-Tab: the previous field
      case 21: { const a = t.lastIndexOf('\n', i - 1) + 1; let b = t.indexOf('\n', i); b = b < 0 ? t.length : b + 1; this.replace(a, b, ''); return true; }   // Ctrl-U
      case 27: return undefined;
      default:
        if (ev.code >= 32 && ev.code < 256 && ev.code !== 127 && !ev.ctrl) { this.insert(String.fromCharCode(ev.code), { typing: true }); return true; }
        return undefined;
    }
  }
  /** Remove it from the window. */
  remove() {
    for (const off of this._offs) off();       // (so it no longer takes the window's clicks and keys)
    this.canvas.remove(); this.focused = false; this.win._textAreas?.delete(this);
  }
}
