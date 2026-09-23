// Wimp icons: flags model compatible with Wimp_CreateIcon, rendered to DOM.
//
// Geometry is in work-area pixels, y downwards: bbox {x0,y0,x1,y1} with y0 the top edge.
// (A RISC OS template icon (OS units, y up) converts as x0=bx0/2, y0=-by1/2, x1=bx1/2, y1=-by0/2.)

import { IF, BTYPE, iconButtonType, iconESG } from './templates.js';
import { wimpColour } from './palette.js';
import { sprites, setImgVariant } from './sprites.js';
import { fonts, textWidth } from './fonts.js';
import { el, parseValidation } from './util.js';

export { IF, BTYPE };

export const BUTTON_NAMES = {
  never: 0, always: 1, autorepeat: 2, click: 3, release: 4, double: 5, doubleclick: 5, clickdrag: 6,
  releasedrag: 7, doubledrag: 8, menu: 9, clickdragdouble: 10, radio: 11, writabledrag: 14, writable: 15,
};

/**
 * Normalise a friendly icon spec into {bbox, flags, text, validation, sprite, bufLen, font}.
 * Friendly fields: x,y,w,h | bbox, text, sprite, border, filled, hcentre, vcentre, rjustify,
 * halfSize, fg, bg, button ('click', 'radio', 'writable', ... or number), esg, selected, shaded,
 * validation, maxLen, font ({name, size}) , indirected.
 */
export function normaliseIconSpec(s) {
  if (s.flags != null && s.bbox && !('x' in s)) {
    return { ...s };
  }
  let flags = 0;
  const bbox = s.bbox ?? { x0: s.x ?? 0, y0: s.y ?? 0, x1: (s.x ?? 0) + (s.w ?? 0), y1: (s.y ?? 0) + (s.h ?? 0) };
  if (s.text != null) flags |= IF.text;
  if (s.sprite != null) flags |= IF.sprite;
  if (s.border) flags |= IF.border;
  if (s.filled) flags |= IF.filled;
  if (s.hcentre ?? s.centre) flags |= IF.hcentre;
  if (s.vcentre ?? true) flags |= IF.vcentre;
  if (s.rjustify) flags |= IF.rjustify;
  if (s.halfSize) flags |= IF.halfSize;
  if (s.allowAdjust) flags |= IF.adjustNoCancel;
  if (s.selected) flags |= IF.selected;
  if (s.shaded) flags |= IF.shaded;
  if (s.text != null) flags |= IF.indirected;
  let bt = s.button ?? 0;
  if (typeof bt === 'string') bt = BUTTON_NAMES[bt.toLowerCase().replace(/[^a-z]/g, '')] ?? 0;
  flags |= (bt & 15) << 12;
  flags |= ((s.esg ?? 0) & 31) << 16;
  flags |= ((s.fg ?? 7) & 15) << 24;
  flags |= ((s.bg ?? 1) & 15) << 28;
  flags >>>= 0;
  let validation = s.validation ?? '';
  if (s.sprite != null && s.text != null && !/(^|;)s/i.test(validation)) validation = (validation ? validation + ';' : '') + 'S' + s.sprite;
  return {
    bbox, flags, text: s.text, sprite: s.sprite, validation: validation || undefined,
    bufLen: s.maxLen != null ? s.maxLen + 1 : (s.bufLen ?? 256), font: s.font, area: s.area,
  };
}

/** Convert a template icon (OS units) to our pixel bbox. */
export function templateIconToSpec(ic) {
  const b = ic.bbox;
  return {
    bbox: { x0: b.x0 / 2, y0: -b.y1 / 2, x1: b.x1 / 2, y1: -b.y0 / 2 },
    flags: ic.flags >>> 0, text: ic.text, validation: ic.validation, sprite: ic.sprite,
    bufLen: ic.bufLen ?? (ic.text != null ? ic.text.length + 1 : 12), font: ic.font,
  };
}

// Border rings: [bottom, right, top, left] Wimp colours (Wimp10 ct_* tables)
const CT = {
  in: [0, 0, 4, 4], out: [4, 4, 0, 0], inshallow: [0, 0, 2, 2], outshallow: [2, 2, 0, 0],
  cream: [12, 12, 12, 12], grey: [1, 1, 1, 1],
};
// Box shadows for a ring at depth d (1-based) with a colour table.
function ring(d, ct) {
  const [b, r, t, l] = ct.map(wimpColour);
  // top/left first so they win the mixed corners (as the Wimp's plot order does)
  const s = [];
  s.push(`inset 0 ${d}px 0 0 ${t}`);
  s.push(`inset ${d}px 0 0 0 ${l}`);
  s.push(`inset 0 -${d}px 0 0 ${b}`);
  s.push(`inset -${d}px 0 0 0 ${r}`);
  return s;
}
// Build box-shadow CSS for a border type. Returns {shadow, inset}.
export function borderStyle(type, { selected = false, shaded = false, fg = 7 } = {}) {
  const rings = [];
  const slab = (ct) => { rings.push(ct, ct); };
  let inset = 0;
  switch (type) {
    case 1: slab(selected ? CT.in : CT.out); inset = 2; break;              // slab out
    case 2: slab(CT.in); inset = 2; break;                                   // slab in
    case 3: slab(CT.outshallow); slab(CT.inshallow); inset = 4; break;       // ridge
    case 4: slab(CT.inshallow); slab(CT.outshallow); inset = 4; break;       // channel
    case 5: slab(selected ? CT.in : CT.out); inset = 2; break;               // action
    case 6: slab(CT.in); slab(CT.cream); slab(selected ? CT.in : CT.out); inset = 6; break; // default action
    case 7: slab(CT.in); slab(CT.grey); inset = 5; break;                    // editable (+black line)
    default: {
      const c = wimpColour(shaded ? (fg & 4) : fg);
      return { shadow: `inset 0 0 0 1px ${c}`, inset: 1 };
    }
  }
  // Each ring is 1px; later rings are further in. Draw inner first in the list? CSS paints the
  // first shadow on top, so list outer rings first (they are thinner offsets, so no overlap issue).
  const parts = [];
  // Build from innermost to outermost so that outer (smaller offset) ones are on top.
  const all = [];
  rings.forEach((ct, i) => all.push(ring(i + 1, ct)));
  if (type === 7) {
    all.push([`inset 0 0 0 ${rings.length + 1}px ${shaded ? wimpColour(1) : '#000'}`]);
  }
  for (const r of all) parts.push(...r);
  return { shadow: parts.join(','), inset };
}

export class Icon {
  constructor(win, spec, handle) {
    this.win = win;
    this.handle = handle;
    const s = normaliseIconSpec(spec);
    this.bbox = { ...s.bbox };
    this.flags = s.flags >>> 0;
    this._text = s.text ?? '';
    this.validation = s.validation;
    this.v = parseValidation(s.validation);
    this.spriteName = s.sprite;
    this.bufLen = s.bufLen ?? 256;
    this.font = s.font;
    this.area = s.area ?? win?.spriteArea ?? null;
    this.data = spec.data;      // free for app use
    this.scrollX = 0;           // writable text scroll
    this.el = el('div', 'icon');
    this.el._icon = this;
    this.render();
  }

  get buttonType() { return iconButtonType(this.flags); }
  get esg() { return iconESG(this.flags); }
  get selected() { return !!(this.flags & IF.selected); }
  get shaded() { return !!(this.flags & IF.shaded); }
  get deleted() { return !!(this.flags & IF.deleted); }
  get writable() { const b = this.buttonType; return (b === 14 || b === 15) && !!(this.flags & IF.text); }
  get text() { return this._text; }
  get fg() { return (this.flags >>> 24) & 15; }
  get bg() { return (this.flags >>> 28) & 15; }
  get borderType() {
    if (!(this.flags & IF.border)) return -1;
    const r = this.v.R?.[0];
    if (r == null) return 0;
    return parseInt(r, 10) || 0;
  }
  get highlight() {
    const r = this.v.R?.[0];
    if (r && r.includes(',')) return parseInt(r.split(',')[1], 10);
    return 14;
  }
  get maxLen() { return Math.max(0, (this.bufLen ?? 256) - 1); }

  /** Set/clear flags: setState({selected, shaded, deleted}) or (eor, clear) like Wimp_SetIconState. */
  setState(a, clear) {
    if (typeof a === 'number') {
      this.flags = ((this.flags & ~clear) ^ a) >>> 0;
    } else {
      const f = (bit, v) => { if (v === true) this.flags |= bit; else if (v === false) this.flags &= ~bit; };
      f(IF.selected, a.selected); f(IF.shaded, a.shaded); f(IF.deleted, a.deleted);
      if (a.fg != null) this.flags = (this.flags & ~(15 << 24)) | ((a.fg & 15) << 24);
      if (a.bg != null) this.flags = (this.flags & ~(15 << 28)) | ((a.bg & 15) << 28);
      this.flags >>>= 0;
    }
    this.render();
  }
  setText(t) {
    t = String(t ?? '');
    if (this.writable && t.length > this.maxLen) t = t.slice(0, this.maxLen);
    this._text = t;
    if (this.win?.caret?.icon === this) {
      this.win.wimp?.caretIndexClamp?.();
    }
    this.render();
  }
  setSprite(name) {
    this.spriteName = name;
    if (this.flags & IF.text) {
      this.validation = (this.validation ?? '').split(';').filter((c) => c && c[0].toUpperCase() !== 'S').concat(['S' + name]).join(';');
      this.v = parseValidation(this.validation);
    }
    this.render();
  }
  setValidation(v) { this.validation = v; this.v = parseValidation(v); this.render(); }
  moveTo(bbox) { this.bbox = { ...bbox }; this.render(); }

  cssFont() {
    if (this.flags & IF.font && this.font) return fonts.cssFor(this.font.name, this.font.ysize ?? this.font.size ?? 12);
    return fonts.css;
  }

  /** Sprite name to show, taking the S validation's selected alternative into account. */
  currentSprite() {
    if (!(this.flags & IF.sprite)) return null;
    let name = this.spriteName;
    const s = this.v.S?.[0];
    if (this.flags & IF.text && s) {
      const parts = s.split(',');
      name = this.selected && parts[1] ? parts[1] : parts[0];
      return { name, alt: this.selected && !!parts[1] };
    }
    return { name, alt: false };
  }

  displayText() {
    let t = this._text ?? '';
    if (this.v.D) t = (this.v.D[0] || '*')[0].repeat(t.length);
    return t;
  }

  render() {
    const e = this.el;
    const f = this.flags;
    const { x0, y0, x1, y1 } = this.bbox;
    const w = x1 - x0, h = y1 - y0;
    e.style.left = x0 + 'px'; e.style.top = y0 + 'px';
    e.style.width = w + 'px'; e.style.height = h + 'px';
    e.style.display = f & IF.deleted ? 'none' : '';
    e.textContent = '';
    const shaded = this.shaded;
    // an 'S' validation with two sprite names shows the second when selected, and then the
    // icon is not inverted at all (Wimp04 seticonptrs)
    const spr = this.currentSprite();
    const selected = this.selected && !(spr && spr.alt);
    let fg = this.fg, bg = this.bg;
    let fontFg = fg, fontBg = bg;
    const bt = this.borderType;
    const isAction = bt === 5 || bt === 6;
    // Anti-aliased font icons: F validation gives colours
    if (f & IF.font) {
      const F = this.v.F?.[0];
      if (F && F.length >= 2) { fontBg = parseInt(F[0], 16); fontFg = parseInt(F[1], 16); } else { fontBg = 0; fontFg = 7; }
      fg = fontFg; bg = fontBg;
    }
    let fill = f & IF.filled ? wimpColour(bg) : 'transparent';
    let textColour = wimpColour(fg);
    let invertText = false;
    if (selected && isAction) {
      fill = wimpColour(this.highlight);
    } else if (selected && !(f & IF.sprite)) {
      // plain inversion
      fill = wimpColour(fg);
      textColour = wimpColour(f & IF.filled ? bg : (this.win ? this.win.colours.workBg & 15 : 0));
    } else if (selected && f & IF.sprite && f & IF.text) {
      invertText = true;
    }
    if (shaded) textColour = wimpColour(selected && !(f & IF.sprite) && !isAction ? 0 : (fg & 4));
    e.style.background = fill;
    // border
    if (f & IF.border) {
      const st = borderStyle(bt, { selected, shaded, fg });
      e.style.boxShadow = st.shadow;
      this._inset = st.inset;
    } else { e.style.boxShadow = ''; this._inset = 0; }

    // sprite
    let sprInfo = null, sprW = 0, sprH = 0;
    if (spr && spr.name) {
      sprInfo = (this.area?.get?.(spr.name.toLowerCase())) ?? sprites.get(spr.name);
      if (sprInfo) {
        const k = f & IF.halfSize ? 0.5 : 1;
        sprW = sprInfo.cssW * k; sprH = sprInfo.cssH * k;
      }
    }
    const hasText = !!(f & IF.text);
    const H = !!(f & IF.hcentre), V = !!(f & IF.vcentre), R = !!(f & IF.rjustify);
    let sx = 0, sy = 0;
    if (sprInfo) {
      if (!hasText) {
        sx = H ? (w - sprW) / 2 : R ? w - sprW : 0;
        sy = V ? (h - sprH) / 2 : h - sprH;
      } else if (V) {
        sy = (h - sprH) / 2;
        if (H && !R) sx = (w - sprW) / 2;
        else if (!H && R) sx = w - sprW;
        else sx = 0;
      } else {
        // ~V: text at bottom, sprite at top (or H+R: text top, sprite bottom)
        sy = H && R ? h - sprH : 0;
        sx = H ? (w - sprW) / 2 : R ? w - sprW : 0;
      }
      const im = sprites.img(sprInfo, { half: !!(f & IF.halfSize) });
      im.style.position = 'absolute';
      im.style.left = Math.round(sx) + 'px';
      im.style.top = Math.round(sy) + 'px';
      const variant = shaded ? (selected && !spr.alt ? 'selshaded' : 'shaded') : (selected && !spr.alt && !isAction ? 'selected' : null);
      if (variant) setImgVariant(im, sprInfo, variant);
      e.appendChild(im);
    }

    if (hasText) {
      const font = this.cssFont();
      const txt = this.displayText();
      const multi = this.v.L != null;
      const span = el('span', 'itext', e);
      span.style.font = font;
      span.style.color = textColour;
      if (multi) {
        span.classList.add('multi');
        span.style.left = '6px'; span.style.right = '6px';
        span.textContent = txt;
        span.style.textAlign = H ? 'center' : 'left';
        if (V) { span.style.top = '50%'; span.style.transform = 'translateY(-50%)'; } else span.style.top = '4px';
      } else {
        span.textContent = txt;
        const tw = textWidth(txt, font);
        this._textW = tw;
        const m = 3; // 3*dx margin (6 OS units)
        let tx;
        let mode;
        if (sprInfo) {
          if (V) mode = !H && !R ? 'X' : H && !R ? 'H' : !H && R ? 'L' : 'R';
          else mode = H ? 'H' : R ? 'R' : 'L';
        } else {
          mode = H ? 'H' : R ? 'R' : 'L';
          if (H && tw > w) mode = 'R';
        }
        if (mode === 'X') tx = sprW + m;
        else if (mode === 'L') tx = m;
        else if (mode === 'H') tx = (w - tw) / 2;
        else tx = w - tw - m;
        if (this.writable) tx = this._writableOrigin(tx, tw, w);
        this._textX = tx;
        span.style.left = Math.round(tx) + 'px';
        // vertical
        const lh = Math.round((fonts.system ? 16 : fonts.size) * 1.25);
        span.style.lineHeight = lh + 'px';
        let ty;
        if (!sprInfo || V) ty = (h - lh) / 2;
        else if (H && R) ty = 0;            // text at top
        else ty = h - lh;                   // text at bottom
        span.style.top = Math.round(ty) + 'px';
        this._textY = Math.round(ty); this._lineH = lh;
        if (invertText) {
          span.style.background = wimpColour(fg);
          span.style.color = shaded ? wimpColour(4) : wimpColour(bg === fg ? 0 : bg);
          span.style.padding = '0 2px';
          span.style.marginLeft = '-2px';
        }
      }
    }
    // pointer shape from P validation
    const P = this.v.P?.[0];
    e.dataset.ptr = P ? P.split(',')[0].toLowerCase() : '';
  }

  // keep the caret visible inside a writable icon (Wimp caretscrollx logic, simplified)
  _writableOrigin(tx, tw, w) {
    const c = this.win?.wimp?.caret;
    if (!c || c.icon !== this) { this.scrollX = 0; return tx; }
    const font = this.cssFont();
    const cx = textWidth(this.displayText().slice(0, c.index), font);
    const m = 3;
    let origin = tx;
    if (tw > w - 2 * m) origin = Math.min(m, w - m - tw);
    const caretAbs = origin + cx;
    if (caretAbs < m) origin += m - caretAbs;
    else if (caretAbs > w - m) origin -= caretAbs - (w - m);
    return origin;
  }

  /** Caret geometry (work-area coords) for character index i. */
  caretPos(i) {
    const font = this.cssFont();
    const x = this.bbox.x0 + (this._textX ?? 3) + textWidth(this.displayText().slice(0, i), font);
    const lh = this._lineH ?? 19;
    const y = this.bbox.y0 + (this._textY ?? 0);
    return { x, y: y - 1, h: lh + 2 };
  }

  /** Character index nearest to work-area x. */
  indexAt(wx) {
    const font = this.cssFont();
    const t = this.displayText();
    const rel = wx - this.bbox.x0 - (this._textX ?? 3);
    let best = 0, bestd = Infinity;
    for (let i = 0; i <= t.length; i++) {
      const d = Math.abs(textWidth(t.slice(0, i), font) - rel);
      if (d < bestd) { bestd = d; best = i; }
    }
    return best;
  }

  contains(x, y) {
    const b = this.bbox;
    return x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1;
  }
}
