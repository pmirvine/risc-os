// !Bookworm - page formatter and redraw: a port of Merlyn Kline's Reformat.c / Redraw.c (1995).
// All geometry is kept in RISC OS OS units with y up (line y = bottom of the line, negative downwards
// from the work-area origin), exactly as the original, and converted to pixels (/2) when drawing.
//
//  * fonts (redraw_token_font_info): body "serif", headings & ADDRESS "sans", PRE/TT "fixed"; base size
//    Params FontSize (16ths of a point); H1 bold x2, H2 bold x3/2, H3 italic x4/3, H4 bold, H5 italic,
//    H6 x2/3; B/DT bold, I/BLOCKQUOTE italic. Typefaces come from the Params "Font" lines.
//  * lines grow to the font bounding box (+4 leading unless bold/italic), P +16 on top, heading gaps,
//    everything rounded up to multiples of 4; left margins from redraw_margin; bullets b0-b5;
//    HR = two 2-pixel lines (#999999 over #eeeeee); links in the link colour, underlined 5 OS units
//    below the baseline; linked images get a BORDER*2 OS unit frame in the link colour.
//  * line breaking: each token is fitted with Font_StrWidth-like splitting at spaces (fm_get_string_width).

import { fonts } from '../../core/fonts.js';

export const LEADING = 4;
const BULLET_GAP = 12;
export const FACES = ['serif', 'sans', 'fixed'];

let mctx = null;
const wcache = new Map();          // css -> Map(word -> px)
function wordPx(css, w) {
  let m = wcache.get(css);
  if (!m) { m = new Map(); wcache.set(css, m); }
  let v = m.get(w);
  if (v == null) {
    mctx ??= document.createElement('canvas').getContext('2d');
    if (mctx.font !== css) mctx.font = css;
    v = mctx.measureText(w).width;
    m.set(w, v);
  }
  return v;
}
/** Width in OS units of a string in a CSS font. */
export function widthOS(css, s) {
  if (!s) return 0;
  if (s.length < 24 && !s.includes(' ')) return wordPx(css, s) * 2;
  let t = 0;
  const parts = s.split(' ');
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) t += wordPx(css, parts[i]);
    if (i < parts.length - 1) t += wordPx(css, ' ');
  }
  return t * 2;
}

/**
 * Formatter context. opts: { params {fontsize, faces}, metrics (fonts.json fonts), bullets (array of
 * {w,h} OS sizes for b0..), imageSize(tok) -> {w,h} OS (or null) }
 */
export class Formatter {
  constructor(opts) {
    this.o = opts;
    this.fontCache = new Map();
  }

  /** redraw_token_font_info + fm_find_font: {css, name, top, bot} for a token. */
  font(t) {
    const key = `${t.bold ? 1 : 0}${t.italic ? 1 : 0}${t.tt || t.pre ? 1 : 0}${t.h | 0}${t.address ? 1 : 0}${t.dt ? 1 : 0}`;
    let f = this.fontCache.get(key);
    if (f) return f;
    let face = 0, size = this.o.params.fontsize, italic = !!(t.italic), bold = !!(t.bold || t.dt);
    if (t.h || t.address) face = 1;
    if (t.pre || t.tt) face = 2;
    switch (t.h) {
      case 1: bold = true; size *= 2; break;
      case 2: bold = true; size = Math.trunc(size * 3 / 2); break;
      case 3: italic = true; size = Math.trunc(size * 4 / 3); break;
      case 4: bold = true; break;
      case 5: italic = true; break;
      case 6: size = Math.trunc(size * 2 / 3); break;
    }
    const name = this.fontName(FACES[face], italic, bold);
    const pt = size / 16;
    const m = this.o.metrics?.[name] ?? this.o.metrics?.['Trinity.Medium'] ?? { ascender: 900, descender: -300 };
    const em = pt * 180 / 72;                              // OS units per em
    f = { css: fonts.cssFor(name, pt), name, pt, top: Math.ceil(m.ascender * em / 1000), bot: Math.ceil(-m.descender * em / 1000) };
    this.fontCache.set(key, f);
    return f;
  }

  fontName(face, italic, bold) {
    let tf = this.o.params.faces[face];
    for (let guard = 0; guard < 4 && tf; guard++) {
      let n = (italic ? 1 : 0) | (bold ? 2 : 0);
      if (!tf.names[n]) n &= 2;
      if (!tf.names[n]) n = 0;
      if (tf.names[n]) return tf.names[n];
      tf = this.o.params.faces[tf.alt];
    }
    return 'Trinity.Medium';
  }

  bulletW(indent) {
    const b = this.o.bullets, n = b.length || 1;
    const s = b[(indent + n - 1) % n];
    return (s ? s.w : 32) + BULLET_GAP;
  }
  bulletH(indent) {
    const b = this.o.bullets, n = b.length || 1;
    const s = b[indent % n];
    return s ? s.h : 32;
  }

  /** redraw_margin: left margin in OS units. */
  margin(t) {
    let i = (t.indent | 0) * 32;
    if (t.h === 1 || t.h === 2) return i + 4;
    if (t.h === 3) return i + 16 + 4;
    if (t.h === 4 || t.h === 5) return i + 32 + 4;
    if (t.indent && t.kind !== 'bullet') i += this.bulletW(t.indent);
    if (t.blockquote || t.address) return i + 96 + 4;
    return i + 48 + 4;
  }

  /** reformat_get_image_size: box relative to the base line (OS units). */
  imageBox(t) {
    const sz = this.o.imageSize(t);
    const box = { x0: 0, y0: 0, x1: sz.w, y1: sz.h };
    if (t.img.align === 'middle') { box.y0 -= Math.trunc(box.y1 / 2); box.y1 = Math.trunc(box.y1 / 2); }
    if (t.img.align === 'top') { box.y0 = -box.y1; box.y1 = 0; }
    if (t.href) {
      const b = t.img.border * 2;
      box.x0 -= b; box.y0 -= b; box.x1 += b; box.y1 += b;
    }
    return box;
  }

  static dataSize(t) { return t.kind === 'text' ? t.text.length : 0; }

  /** fm_get_string_width equivalent for token text from offset. */
  tokenWidth(t, offset, maxwid) {
    if (t.kind === 'img') { const b = this.imageBox(t); return { bytes: 0, width: b.x1 - b.x0 }; }
    if (t.kind === 'hr') return { bytes: 0, width: maxwid };
    if (t.kind === 'bullet') return { bytes: 0, width: this.bulletW(t.indent) };
    const f = this.font(t), s = t.text;
    let end = offset;
    while (end < s.length && s[end] !== '\n') end++;
    let bytes = 0, width = 0;
    if (end > offset) {
      const seg = s.slice(offset, end);
      const full = widthOS(f.css, seg);
      if (t.pre || full <= maxwid) { bytes = seg.length; width = full; }
      else {
        // last split point (space) whose prefix fits
        let best = -1, bestW = 0, pos = seg.indexOf(' ');
        while (pos >= 0) {
          const w = widthOS(f.css, seg.slice(0, pos));
          if (w > maxwid) break;
          best = pos; bestW = w;
          pos = seg.indexOf(' ', pos + 1);
        }
        if (best < 0 || bestW < 10) { bytes = seg.length; width = full; }
        else {
          bytes = best; width = bestW;
          while (bytes < seg.length && seg[bytes] === ' ') bytes++;
        }
      }
    }
    if (offset + bytes < s.length && s[offset + bytes] === '\n' && offset + bytes === end) bytes++;
    return { bytes, width };
  }

  /** reformat_sub_newline */
  static newline(t, l, offset) {
    if (t.kind === 'hr' || (offset === 0 && l && l.kind === 'hr')) return true;
    if (offset === 0 && (t.p || t.br || t.li)) return true;
    if (offset === 0 && l) {
      if ((t.indent | 0) !== (l.indent | 0)) return true;
      if ((t.h | 0) !== (l.h | 0) && !l.li) return true;
      if (!!t.pre !== !!l.pre || !!t.blockquote !== !!l.blockquote) return true;
      if (!!t.center !== !!l.center) return true;
      if ((t.dt || t.address) && !(l.dt || l.address)) return true;
      if (!(t.h || t.address) && (l.h || l.address)) return true;
    }
    return false;
  }

  /** reformat_check_height */
  checkHeight(lp, t, last, offset) {
    let top = 0, bot = 0;
    if (t.kind === 'img') { const b = this.imageBox(t); top = b.y1; bot = -b.y0; }
    else if (t.kind === 'hr') top = 48;
    else if (t.kind === 'bullet') top = this.bulletH(t.indent);
    else if (t.text && t.text !== ' ') {
      const f = this.font(t);
      top = f.top; bot = f.bot;
      if (!(t.italic || t.bold)) bot += LEADING;
      if (bot < 0) bot = 0;
      if (t.p && offset < 1) top += 16;
      switch (t.h | 0) {
        case 1: bot += 16; break;
        case 2: case 3: case 4: bot += 16; if (!offset) top += 32; break;
        case 5: if (!offset) top += 32; break;
        case 6: if (!offset) top += 8; break;
        default: if (last && !!t.blockquote !== !!last.blockquote && !offset) top += top;
      }
    }
    if (top % 4) top += 4 - (top % 4);
    if (bot < 0) bot = 0;
    if (bot % 4) bot += 4 - (bot % 4);
    if (top > lp.h - lp.b) { const d = top - (lp.h - lp.b); lp.h += d; lp.y -= d; }
    if (bot > lp.b) { const d = bot - lp.b; lp.h += d; lp.b += d; lp.y -= d; }
  }

  /**
   * reformat_reformatter: format tokens to displayWidth (OS units) starting at y = top (OS, <= 0).
   * Returns {lines:[{y,h,b,chunks:[{t,o,l,w}]}], bottom, maxWidth}.
   */
  format(tokens, displayWidth, top) {
    const lines = [];
    let lp = null, last = null, newline = true, linewidth = 0, maxWidth = 0;
    for (let tn = 0; tn < tokens.length; tn++) {
      const t = tokens[tn];
      const size = Formatter.dataSize(t);
      let offset = 0, guard = 0, done = false;
      while (!done) {
        if (++guard > 100000) break;
        if (!t.pre && !newline && linewidth > displayWidth) newline = true;
        if (!newline && Formatter.newline(t, last, offset)) newline = true;
        if (newline) {
          newline = false;
          const y = lp ? lp.y : top;
          lp = { y: y - 3, h: 3, b: 1, chunks: [] };
          lines.push(lp);
          linewidth = this.margin(t);
        }
        let maxwid = t.pre && t.kind === 'text' ? 1e9 : displayWidth - linewidth;
        if (t.blockquote) maxwid -= 48;
        const wd = this.tokenWidth(t, offset, maxwid);
        if (t.kind === 'text' && wd.bytes && t.text[offset + wd.bytes - 1] === '\n') newline = true;
        if (wd.width <= maxwid || lp.chunks.length === 0 || t.pre) {
          lp.chunks.push({ t: tn, o: offset, l: wd.bytes, w: wd.width });
          this.checkHeight(lp, t, last, offset);
          offset += wd.bytes;
          if (wd.bytes <= 0) offset = size + 1;
          last = t;
          linewidth += wd.width;
          if (linewidth > maxWidth) maxWidth = linewidth;
          if (offset < size) newline = true; else done = true;
        } else newline = true;
      }
    }
    return { lines, bottom: lp ? lp.y : top, maxWidth };
  }

  /** redraw_start_x */
  startX(line, tokens, displayWidth) {
    const t = tokens[line.chunks[0].t];
    if (t.center) {
      let x = displayWidth;
      for (const c of line.chunks) x -= c.w;
      x /= 2;
      return Math.max(0, x);
    }
    return this.margin(t);
  }
}
