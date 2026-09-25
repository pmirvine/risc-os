// CodeView: a !JsEdit window. It is Edit's EditView (src/apps/Edit/view.js: the document, caret, selection,
// mouse, the keys Edit has) with a programmer's additions:
//   * syntax colouring from the text's mode (./modes.js), tokenised a line at a time and cached, so only the
//     lines from an edit onwards are looked at again;
//   * a gutter of line numbers, with error marks from throwback / the syntax check;
//   * the matching bracket highlighted, the caret's line shaded;
//   * smart indentation: Return keeps the line's indent (and indents after { ( [), } outdents, Tab and
//     Shift-Tab indent and outdent by the mode's step (or the selected lines);
//   * a toolbar strip (a pane) across the top of the window: the text starts below it (this.inset);
//   * completion: a list of names from the mode and the text as you type (./complete.js).

import { wimp } from '../../core/wimp.js';
import { wimpColour } from '../../core/palette.js';
import { EditView, scrap, setSelection, systemFontAtlas as atlas } from '../Edit/view.js';
import { C } from './modes.js';

const OPEN = '([{', CLOSE = ')]}';
const CLASS_NAMES = ['text', 'comment', 'string', 'number', 'keyword', 'constant', 'api', 'regex', 'punct', 'lineno', 'command', 'variable'];
const css = (c) => (typeof c === 'string' ? c : wimpColour(c));
// the window's own colours in each theme (the text colours come from the mode)
const THEMES = {
  light: { selBg: null, caretLine: '#f2f2e6', errorLine: '#ffdddd', bracket: '#bbddbb', gutterBg: 1, gutterEdge: 3, lineNo: 5, lineNoCaret: 7, errorMark: 11, errorNo: 0 },
  dark: { bg: '#1e1e1e', selBg: '#264f78', caretLine: '#2a2d2e', errorLine: '#4b1818', bracket: '#3f5f3f', gutterBg: '#252526', gutterEdge: '#3c3c3c', lineNo: '#858585', lineNoCaret: '#c6c6c6', errorMark: '#c72e2e', errorNo: '#ffffff' },
};
const MATCH_LIMIT = 20000;

export class CodeView extends EditView {
  constructor(task, doc, opts = {}) {
    super(task, doc, opts);         // (which lays the text out already: the fields below are made there if needed)
    this.inset ??= 0;               // toolbar height: the text starts this far down the work area
    this.lines ??= [];              // per source line: {start, end (lexer states), cls} - cleared from an edit on
    this.marks ??= new Map();       // line number (1-based) -> message (errors)
  }

  // ------------------------------------------------------------------ mode & colours
  get mode() { return this.state?.mode; }
  get showNumbers() { return this.options.lineNumbers !== false; }
  get dark() { return !!this.options.dark; }
  get theme() { return this.dark ? THEMES.dark : THEMES.light; }
  _colour(cls) { const c = (this.dark ? this.mode?.dark : this.mode?.colours)?.[CLASS_NAMES[cls]]; return c ?? { colour: this.dark ? '#d4d4d4' : this.options.fore, bold: false }; }
  modeChanged() { this.lines = []; this.invalidate(); }

  /** Tokens for source line L (0-based): {cls: Uint8Array, state}, tokenising from the last cached line. */
  tokens(L) {
    const mode = this.mode;
    if (!mode) return null;
    this.lines ??= [];
    let k = Math.min(this.lines.length, L);
    while (k > 0 && !this.lines[k - 1]) k--;
    let st = k === 0 ? '' : this.lines[k - 1].end;
    for (; k <= L; k++) {
      const a = this.lineStarts[k], b = k + 1 < this.lineStarts.length ? this.lineStarts[k + 1] - 1 : this.doc.length;
      const text = this.doc.slice(a, b);
      const r = mode.lex(mode, text, st);
      this.lines[k] = { start: st, end: r.state, cls: r.cls };
      st = r.state;
    }
    return this.lines[L];
  }
  lineOf(i) {
    const s = this.lineStarts;
    let lo = 0, hi = s.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s[mid] <= i) lo = mid; else hi = mid - 1; }
    return lo;
  }
  /** Token class of the character at text index i. */
  clsAt(i) { const L = this.lineOf(i); return this.tokens(L)?.cls[i - this.lineStarts[L]] ?? C.text; }

  // ------------------------------------------------------------------ layout (with line starts and the gutter)
  layout() {
    if (this.rows) return this.rows;
    const t = this.doc.text;
    const starts = [0];
    for (let i = t.indexOf('\n'); i >= 0; i = t.indexOf('\n', i + 1)) starts.push(i + 1);
    this.lineStarts = starts;
    // the gutter: room for the line numbers (with two spare columns), then a gap
    const digits = Math.max(3, String(starts.length).length);
    const cw = this.options.fixfont ? 8 : Math.ceil(this.cwidth(48));
    this.gutter = this.showNumbers ? (digits + 1) * cw + 6 : 0;
    this.options.margin = this.gutter + 4;
    const rows = super.layout();
    // number the rows: a row starts a new source line unless the previous one wrapped into it
    let line = 0;
    for (let k = 0; k < rows.length; k++) { if (k > 0 && !rows[k].wrap) line++; rows[k].line = line; rows[k].first = k === 0 || !rows[k].wrap; }
    return rows;
  }
  _syncExtent() {
    const h = Math.max(this.inset + (this.rows?.length ?? 1) * this.lh + 4, wimp.height);
    const f = this.win._frame ?? { left: 1, rightW: 20 };
    const w = Math.max(wimp.width - f.left - f.rightW, 64);
    const e = this.win.extent;
    if (e.x1 !== w || e.y1 !== h) this.win.setExtent({ w, h });
  }
  _docChanged(ev) {
    // cached tokens from the edited line on are out of date
    const L = this.lineOf(ev.pos);
    this.lines.length = Math.min(this.lines.length, L);
    this.state?.textChanged?.(this);
    super._docChanged(ev);
  }

  // ------------------------------------------------------------------ the text starts below the toolbar
  indexAt(x, y) { return super.indexAt(x, y - this.inset); }
  showCaret(take = true) {
    if (!this.win.isOpen) return;
    if (!take && !this.hasFocus) return;
    const r = this.rowOf(this.caret);
    const x = this.xOf(this.caret, r) + this.vpad * (this.fixed ? 8 : this.cwidth(32));
    wimp.setCaret(this.win, null, -1, { x: Math.round(x), y: this.inset + r * this.lh, h: this.lh });
    this._caretMoved();
  }
  ensureVisible(i) {
    const w = this.win, r = this.rowOf(i);
    const y0 = this.inset + r * this.lh, y1 = y0 + this.lh;
    const x = this.xOf(i, r);
    let sx = w.scrollX, sy = w.scrollY;
    if (y0 < sy + this.inset) sy = y0 - this.inset;
    else if (y1 > sy + w.h) sy = y1 - w.h;
    if (x < sx + this.gutter + 8) sx = Math.max(0, x - w.w / 2);
    else if (x > sx + w.w - 16) sx = x - w.w / 2;
    sy = Math.max(0, sy);
    if (sx !== w.scrollX || sy !== w.scrollY) w.scrollTo(Math.round(sx), Math.round(sy));
  }
  get visibleRows() { return Math.max(1, Math.floor((this.win.h - this.inset) / this.lh)); }

  // ------------------------------------------------------------------ rendering
  render(g, rect) {
    const rows = this.layout();
    const o = this.options, lh = this.lh, top = this.inset;
    const th = this.theme;
    const bg = th.bg ?? wimpColour(o.back);
    g.fillStyle = bg;
    g.fillRect(rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0);
    const r0 = Math.max(0, Math.floor((rect.y0 - top) / lh)), r1 = Math.min(rows.length - 1, Math.floor((rect.y1 - top) / lh));
    const sel = scrap.doc === this.doc ? scrap : null;
    const t = this.doc.text;
    const yoff = Math.floor(o.leading / 2);
    const caretLine = this.lineOf(this.caret);
    const brackets = this._brackets ?? [];
    if (!o.fixfont) { g.font = this.fontCss; g.textBaseline = 'alphabetic'; }
    const selFg = th.selBg ?? wimpColour(o.fore);         // light: Edit's inverse selection; dark: a blue band
    // each token class's colour (and its glyph strip), worked out once per redraw
    const table = [];
    for (let k = 0; k < 12; k++) { const c = this._colour(k); const col = css(c.colour); table.push({ css: col, bold: c.bold, atlas: o.fixfont ? atlas(col) : null }); }
    const atlBg = o.fixfont ? atlas(bg) : null;
    const boldCss = o.fixfont ? null : this.fontCss.replace(/^(italic )?(\d+ |bold )?/, '$1700 ');
    for (let r = r0; r <= r1; r++) {
      const row = rows[r];
      const y = top + r * lh;
      const L = row.line;
      const lineStart = this.lineStarts[L] ?? 0;
      const tok = this.tokens(L);
      const mark = this.marks.get(L + 1);
      // the caret's line and error lines are shaded
      if (mark) { g.fillStyle = th.errorLine; g.fillRect(this.gutter, y, rect.x1 - this.gutter, lh); }
      else if (L === caretLine && this.options.currentLine !== false && this.hasFocus) { g.fillStyle = th.caretLine; g.fillRect(this.gutter, y, rect.x1 - this.gutter, lh); }
      let x = o.margin;
      for (let k = row.s; k < row.e; k++) {
        const c = t.charCodeAt(k);
        const w = this.cwidth(c);
        if (x > rect.x1) break;
        if (x + w >= rect.x0) {
          const hl = sel && k >= sel.start && k < sel.end;
          const col = table[tok ? tok.cls[k - lineStart] : C.text];
          const fg = hl && !th.selBg ? bg : col.css;
          if (hl) { g.fillStyle = selFg; g.fillRect(Math.floor(x), y, Math.ceil(w), lh); }
          else if (brackets.includes(k)) { g.fillStyle = th.bracket; g.fillRect(Math.floor(x), y, Math.ceil(w), lh); }
          if (c !== 32) {
            if (o.fixfont) {
              const A = hl && !th.selBg ? atlBg : col.atlas;
              const s = c < 32 || c === 127 ? EditView.glyph(c) : null;
              if (s) { for (let q = 0; q < 4; q++) g.drawImage(A, s.charCodeAt(q) * 8, 0, 8, 16, x + q * 8, y + yoff, 8, 16); }
              else {
                g.drawImage(A, c * 8, 0, 8, 16, x, y + yoff, 8, 16);
                if (col.bold && this.options.boldKeywords !== false) g.drawImage(A, c * 8, 0, 7, 16, x + 1, y + yoff, 7, 16);   // overstrike, as bitmap fonts were emboldened
              }
            } else {
              g.fillStyle = fg;
              g.font = col.bold && this.options.boldKeywords !== false ? boldCss : this.fontCss;
              const s = EditView.glyph(c);
              if (this.xscale !== 1) { g.save(); g.translate(x, y + yoff + this.base); g.scale(this.xscale, 1); g.fillText(s, 0, 0); g.restore(); }
              else g.fillText(s, x, y + yoff + this.base);
            }
          }
        }
        x += w;
      }
      if (sel && !row.wrap && row.e < t.length && row.e >= sel.start && row.e < sel.end && x <= rect.x1) {
        g.fillStyle = selFg; g.fillRect(Math.floor(x), y, Math.ceil(this.cwidth(32)), lh);
      }
    }
    this._drawGutter(g, rect, rows, r0, r1, caretLine);
  }

  _drawGutter(g, rect, rows, r0, r1, caretLine) {
    if (!this.gutter || rect.x0 > this.gutter) return;
    const top = this.inset, lh = this.lh, th = this.theme;
    g.fillStyle = css(th.gutterBg);
    g.fillRect(0, rect.y0, this.gutter, rect.y1 - rect.y0);
    g.fillStyle = css(th.gutterEdge);
    g.fillRect(this.gutter - 1, rect.y0, 1, rect.y1 - rect.y0);
    const cw = this.options.fixfont ? 8 : Math.ceil(this.cwidth(48));
    for (let r = r0; r <= r1; r++) {
      const row = rows[r];
      if (!row.first) continue;
      const y = top + r * lh;
      const n = String(row.line + 1);
      const mark = this.marks.has(row.line + 1);
      if (mark) { g.fillStyle = css(th.errorMark); g.fillRect(0, y, this.gutter - 1, lh); }
      const colour = css(mark ? th.errorNo : row.line === caretLine ? th.lineNoCaret : th.lineNo);
      const x = this.gutter - 6 - n.length * cw;
      if (this.options.fixfont) {
        const A = atlas(colour);
        for (let q = 0; q < n.length; q++) g.drawImage(A, n.charCodeAt(q) * 8, 0, 8, 16, x + q * 8, y, 8, 16);
      } else { g.fillStyle = colour; g.font = this.fontCss; g.fillText(n, x, y + this.base); }
    }
  }

  // ------------------------------------------------------------------ brackets
  _caretMoved() {
    const old = this._brackets;
    this._brackets = this.matchBrackets();
    if (String(old) !== String(this._brackets) || this.options.currentLine !== false) this.invalidate();
    this.state?.caretMoved?.(this);
  }
  /** The bracket next to the caret and its partner (text indexes), or []. Brackets in strings/comments don't count. */
  matchBrackets() {
    const d = this.doc, i = this.caret;
    const code = (k) => this.clsAt(k) === C.punct;
    let at = -1;
    if (i > 0 && (OPEN + CLOSE).includes(d.slice(i - 1, i)) && code(i - 1)) at = i - 1;
    else if ((OPEN + CLOSE).includes(d.slice(i, i + 1)) && code(i)) at = i;
    if (at < 0) return [];
    const ch = d.slice(at, at + 1);
    const open = OPEN.includes(ch);
    const mine = open ? ch : OPEN[CLOSE.indexOf(ch)], other = open ? CLOSE[OPEN.indexOf(ch)] : ch;
    let depth = 0;
    for (let k = at, n = 0; k >= 0 && k < d.length && n < MATCH_LIMIT; k += open ? 1 : -1, n++) {
      const c = d.slice(k, k + 1);
      if (c !== mine && c !== other) continue;
      if (!code(k)) continue;
      depth += (c === (open ? mine : other)) ? 1 : -1;
      if (depth === 0) return [at, k];
    }
    return [at];
  }

  // ------------------------------------------------------------------ keys
  key(ev) {
    if (this.keyFilter && this.keyFilter(ev)) return true;
    if (this.completion?.key(ev)) return true;
    const code = ev.code, ro = this.ro;
    if (code === 32 && ev.ctrl) { this.state?.complete?.(this, true); return true; }       // Ctrl-Space: complete
    if (code === 18) { this.state?.run?.(this); return true; }                           // Ctrl-R: run
    if (code === 0x18A && !ro) { this.indent(1); this.doc.separate(); return true; }    // Tab
    if (code === 0x19A && !ro) { this.indent(-1); this.doc.separate(); return true; }   // Shift-Tab
    if (code === 13 && !ro) { this.newline(); this.doc.separate(); return true; }
    const used = super.key(ev);
    if (used && !ro && code >= 32 && code < 256) {
      const ch = String.fromCharCode(code);
      if (CLOSE.includes(ch)) this.outdentCloser();
      this.state?.typed?.(this, ch);
    }
    return used;
  }

  get step() { return this.mode?.indent ?? 2; }
  /** Return: a new line with the same indentation (one more after an opening bracket). */
  newline() {
    const d = this.doc, at = this.caret;
    const a = d.bol(at);
    const before = d.slice(a, at);
    let ind = /^[ ]*/.exec(before)[0];
    const last = before.trimEnd().slice(-1);
    const next = d.slice(at, at + 1);
    if (OPEN.includes(last) && this.clsAt(a + before.trimEnd().length - 1) === C.punct) {
      const inner = ind + ' '.repeat(this.step);
      if (next && CLOSE[OPEN.indexOf(last)] === next) {       // between a pair of brackets: the closer on its own line
        d.replace(at, 0, '\n' + inner + '\n' + ind);
        this.setCaret(at + 1 + inner.length);
        return;
      }
      ind = inner;
    }
    if (this.mode?.lexer === 'basic') ind = '';                   // (BASIC line numbers: no indentation)
    this.typeText('\n' + ind);
  }
  /** A closing bracket typed at the start of a line (after spaces) goes back one step. */
  outdentCloser() {
    const d = this.doc, at = this.caret;
    const a = d.bol(at);
    const before = d.slice(a, at - 1);
    if (!/^ +$/.test(before)) return;
    const n = Math.min(this.step, before.length);
    d.replace(a, n, '');
    this.setCaret(at - n);
  }
  /** Tab / Shift-Tab: the selected lines (in this text), or spaces to the next step at the caret. */
  indent(dir) {
    const d = this.doc, st = this.step;
    if (scrap.doc === d && d.slice(scrap.start, scrap.end).includes('\n')) {
      let a = d.bol(scrap.start), b = scrap.end;
      if (b > a && d.slice(b - 1, b) === '\n') b--;
      const text = d.slice(a, b);
      const out = text.split('\n').map((l) => (dir > 0 ? (l ? ' '.repeat(st) + l : l) : l.replace(new RegExp(`^ {1,${st}}`), ''))).join('\n');
      d.replace(a, b - a, out);
      setSelection(d, a, a + out.length + (scrap.end > b ? 1 : 0));
      this.setCaret(Math.min(this.caret, d.length));
      return;
    }
    const at = this.caret, col = at - d.bol(at);
    if (dir > 0) { const n = st - (col % st); d.insert(at, ' '.repeat(n)); this.setCaret(at + n); return; }
    const a = d.bol(at);
    const lead = /^ */.exec(d.slice(a, d.eol(at)))[0].length;
    const n = Math.min(lead, (lead % st) || st);
    if (n) { d.replace(a, n, ''); this.setCaret(Math.max(a, at - n)); }
  }
}
