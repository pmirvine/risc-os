// TextArea: a box of several lines of editable text inside a window (the Wimp's writable icons hold one line),
// for notes, addresses and the like. It draws itself (a canvas placed in the window's work area), takes
// clicks inside it and keys while it has the caret, wraps words, and scrolls when the text is longer than
// the box. Programs get it as TextArea (src/core/jsrun.js).
//
//   const notes = new TextArea(w, { x: 8, y: 40, w: 300, h: 120, text: 'Hello' })
//   notes.text                      the text (lines separated by '\n'); setting it redraws
//   notes.on('change', () => ...)   after every edit
//   notes.focus()                   give it the caret
//   notes.readOnly = true
// Keys: arrows, Home / Copy (start / end of the line), Ctrl-Up / Ctrl-Down (start / end of the text),
// Backspace / Delete, Copy (delete right), Return, Ctrl-U (delete the line); pasted text. Tab / Shift-Tab move to the
// next / previous field (writable icon or text area) in the window, as in a dialogue box (Tab types two spaces
// if there is nothing else to move to).

import { wimp } from './wimp.js';
import { Emitter } from './util.js';
import { fonts } from './fonts.js';

const PAD = 4;

export class TextArea extends Emitter {
  constructor(win, { x = 0, y = 0, w = 200, h = 80, text = '', font = null, readOnly = false } = {}) {
    super();
    this.win = win;
    this.x = x; this.y = y; this.w = w; this.h = h;
    this._text = String(text);
    this.caret = this._text.length;
    this.readOnly = readOnly;
    this.font = font ?? fonts.css;
    this.scroll = 0;
    this.focused = false;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'textarea';
    Object.assign(this.canvas.style, { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, pointerEvents: 'none' });
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.g = this.canvas.getContext('2d');
    this.g.scale(dpr, dpr);
    win.work.appendChild(this.canvas);
    (win._textAreas ??= new Set()).add(this);
    this._measure();
    // the window's events: clicks inside the box, and keys / pastes while it has the caret. Its handlers go first,
    // so the program's own click and key handlers only see what the text area doesn't use.
    win.on('click', (ev) => this.click(ev), { first: true });
    win.on('key', (ev) => this.key(ev), { first: true });
    win.on('paste', (ev) => (this.focused ? (this.insert(ev.text.replace(/\r\n?/g, '\n')), true) : undefined), { first: true });
    win.on('losecaret', () => this._blur());
    win.on('caretmove', () => this._blur());
    this.draw();
  }

  get text() { return this._text; }
  set text(t) { this._text = String(t ?? ''); this.caret = Math.min(this.caret, this._text.length); this._layout(); this.draw(); }
  contains(x, y) { return x >= this.x && x < this.x + this.w && y >= this.y && y < this.y + this.h; }

  // ------------------------------------------------------------------ layout: wrapped lines
  _measure() {
    this.g.font = this.font;
    const m = this.g.measureText('Mg');
    this.lh = Math.ceil((m.fontBoundingBoxAscent ?? 12) + (m.fontBoundingBoxDescent ?? 4)) + 2;
    this.base = Math.ceil(m.fontBoundingBoxAscent ?? 12) + 1;
    this._layout();
  }
  /** Rows: [{s, e}] text indexes of each displayed line (wrapped at spaces to the box's width). */
  _layout() {
    const t = this._text, W = this.w - 2 * PAD, g = this.g;
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
  }
  _rowOf(i) {
    let r = 0;
    for (let k = 0; k < this.rows.length; k++) if (this.rows[k].s <= i) r = k;
    // a wrap point belongs to the next row, except at the very end of a row that ends the text
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
    g.strokeStyle = '#777777'; g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, this.w - 1, this.h - 1);
    g.save();
    g.beginPath(); g.rect(1, 1, this.w - 2, this.h - 2); g.clip();
    g.font = this.font; g.fillStyle = '#000000'; g.textBaseline = 'alphabetic';
    this.rows.forEach((row, k) => {
      const y = PAD + k * this.lh - this.scroll;
      if (y + this.lh < 0 || y > this.h) return;
      g.fillText(this._text.slice(row.s, row.e), PAD, y + this.base);
    });
    g.restore();
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
    if (y - this.scroll < PAD) this.scroll = Math.max(0, y - PAD);
    else if (y + this.lh - this.scroll > this.h - PAD) this.scroll = y + this.lh - this.h + PAD;
  }

  // ------------------------------------------------------------------ focus and input
  focus() {
    for (const o of this.win._textAreas ?? []) if (o !== this) o.focused = false;   // one text area has the caret
    this.focused = true; this._ensureVisible(); this.draw();
  }
  _blur() { if (this._settingCaret) return; this.focused = false; }
  click(ev) {
    if (!this.contains(ev.x, ev.y)) { this.focused = false; return undefined; }
    if (ev.button === 'menu') return undefined;
    this.caret = this._indexAt(ev.x - this.x, ev.y - this.y);
    this.focus();
    return true;
  }
  _moveTo(i) { this.caret = Math.max(0, Math.min(this._text.length, i)); this._ensureVisible(); this.draw(); }
  _vertical(d) {
    const r = this._rowOf(this.caret), x = this._xOf(this.caret, r);
    const nr = Math.max(0, Math.min(this.rows.length - 1, r + d));
    this._moveTo(this._indexAt(x, PAD + nr * this.lh - this.scroll + 1));
  }
  /** Replace [a, b) with s and put the caret after it. */
  replace(a, b, s) {
    if (this.readOnly) return;
    this._text = this._text.slice(0, a) + s + this._text.slice(b);
    this.caret = a + s.length;
    this._layout();
    this._ensureVisible(); this.draw();
    this.emit('change', { text: this._text });
  }
  insert(s) { this.replace(this.caret, this.caret, s); }
  key(ev) {
    if (!this.focused) return undefined;
    const t = this._text, i = this.caret, row = this.rows[this._rowOf(i)];
    switch (ev.code) {
      case 0x18C: this._moveTo(i - 1); return true;                           // left
      case 0x18D: this._moveTo(i + 1); return true;                           // right
      case 0x18F: this._vertical(-1); return true;                            // up
      case 0x18E: this._vertical(1); return true;                             // down
      case 30: case 0x1AC: this._moveTo(row.s); return true;                  // Home, Ctrl-left: start of the line
      case 0x18B: if (ev.shift || ev.ctrl) { this._moveTo(row.e); return true; } if (i < t.length) this.replace(i, i + 1, ''); return true;  // Copy
      case 0x1AD: this._moveTo(row.e); return true;                           // Ctrl-right: end of the line
      case 0x1AF: this._moveTo(0); return true;                               // Ctrl-up
      case 0x1AE: this._moveTo(t.length); return true;                        // Ctrl-down
      case 8: case 127: if (i > 0) this.replace(i - 1, i, ''); return true;  // Backspace / Delete
      case 13: this.insert('\n'); return true;
      case 0x18A: if (!wimp.focusNext(this.win, this, 1)) this.insert('  '); return true;   // Tab: the next field (else 2 spaces)
      case 0x19A: wimp.focusNext(this.win, this, -1); return true;           // Shift-Tab: the previous field
      case 21: { const a = t.lastIndexOf('\n', i - 1) + 1; let b = t.indexOf('\n', i); b = b < 0 ? t.length : b + 1; this.replace(a, b, ''); return true; }   // Ctrl-U
      case 27: return undefined;
      default:
        if (ev.code >= 32 && ev.code < 256 && ev.code !== 127 && !ev.ctrl) { this.insert(String.fromCharCode(ev.code)); return true; }
        return undefined;
    }
  }
  /** Remove it from the window. */
  remove() { this.canvas.remove(); this.focused = false; this.win._textAreas?.delete(this); }
}
