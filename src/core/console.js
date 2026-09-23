// A simple VDU-like text console drawn with the RISC OS system font (assets/fonts/system8x8.json)
// on a canvas. Used by the F12 command line and the "*Command" output window.

let FONT = null;
export async function loadSystemFont() {
  if (FONT) return FONT;
  try {
    const r = await fetch('assets/fonts/system8x8.json');
    FONT = (await r.json()).chars;
  } catch { FONT = []; }
  return FONT;
}

export class TextConsole {
  /** opts: {cols, rows, charW=8, charH=8, fg='#fff', bg='#000'} */
  constructor(opts = {}) {
    this.cols = opts.cols ?? 80;
    this.rows = opts.rows ?? 25;
    this.cw = opts.charW ?? 8;
    this.ch = opts.charH ?? 8;
    this.fg = opts.fg ?? '#ffffff';
    this.bg = opts.bg ?? '#000000';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'textconsole';
    this.canvas.width = this.cols * this.cw;
    this.canvas.height = this.rows * this.ch;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.x = 0; this.y = 0;
    this.cursorOn = true;
    this.lines = 0;           // number of lines used so far (for the F12 scroll-up effect)
    this.clear();
    this._blink = setInterval(() => { this._cur = !this._cur; this._drawCursor(); }, 400);
  }
  destroy() { clearInterval(this._blink); this.canvas.remove(); }
  resize(cols, rows) {
    const old = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    this.cols = cols; this.rows = rows;
    this.canvas.width = cols * this.cw; this.canvas.height = rows * this.ch;
    this.ctx.fillStyle = this.bg; this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.putImageData(old, 0, this.canvas.height - old.height);
  }
  clear() {
    this.ctx.fillStyle = this.bg;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.x = 0; this.y = 0;
  }
  _glyph(c, x, y, fg = this.fg, bg = this.bg) {
    const ctx = this.ctx;
    ctx.fillStyle = bg;
    ctx.fillRect(x * this.cw, y * this.ch, this.cw, this.ch);
    const g = FONT?.[c & 255];
    if (!g) return;
    ctx.fillStyle = fg;
    const sy = this.ch / 8;
    for (let r = 0; r < 8; r++) {
      const bits = g[r];
      if (!bits) continue;
      for (let b = 0; b < 8; b++) if (bits & (0x80 >> b)) ctx.fillRect(x * this.cw + b, y * this.ch + r * sy, 1, sy);
    }
  }
  _drawCursor() {
    if (!this.cursorOn) return;
    const ctx = this.ctx;
    const ch = this._under ?? 32;
    this._glyph(ch, this.x, this.y);
    if (this._cur) { ctx.fillStyle = this.fg; ctx.fillRect(this.x * this.cw, this.y * this.ch + this.ch - Math.max(1, this.ch / 8), this.cw, Math.max(1, this.ch / 8)); }
  }
  _hideCursor() { this._glyph(this._under ?? 32, this.x, this.y); }
  scroll() {
    const ctx = this.ctx;
    const img = ctx.getImageData(0, this.ch, this.canvas.width, this.canvas.height - this.ch);
    ctx.putImageData(img, 0, 0);
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, this.canvas.height - this.ch, this.canvas.width, this.ch);
  }
  newline() {
    this.x = 0;
    this.lines++;
    if (this.y < this.rows - 1) this.y++; else this.scroll();
    this.onNewline?.();
  }
  write(s) {
    this._hideCursor();
    for (const chr of String(s)) {
      const c = chr.charCodeAt(0);
      if (c === 10) { this.newline(); continue; }
      if (c === 13) { this.x = 0; continue; }
      if (c === 8 || c === 127) { if (this.x > 0) { this.x--; this._glyph(32, this.x, this.y); } continue; }
      if (c === 12) { this.clear(); continue; }
      if (c === 7) continue;
      if (c < 32) continue;
      this._glyph(c > 255 ? 63 : c, this.x, this.y);
      this.x++;
      if (this.x >= this.cols) this.newline();
    }
    this._under = 32;
    this._drawCursor();
  }
  writeln(s = '') { this.write(s + '\n'); }
}
