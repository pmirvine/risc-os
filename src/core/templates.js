// Wimp Template file support.
//
// parseTemplateFile(bytes) turns a binary RISC OS Templates file (,fec) into the
// normalised JSON "template" format used by wimp.createWindowFromTemplate():
//
//  { fonts: [{name, xsize, ysize}],            // sizes in points
//    windows: { <name>: WindowTemplate } }
//
//  WindowTemplate = {
//    name, visible:{x0,y0,x1,y1}, scroll:{x,y}, behind, flags,
//    colours:{titleFg,titleBg,workFg,workBg,scrollOuter,scrollInner,titleFocus},
//    extraFlags, extent:{x0,y0,x1,y1}, titleFlags, workFlags, minWidth, minHeight,
//    title:{text, validation, bufLen}  |  title:{sprite}
//    icons:[{bbox:{x0,y0,x1,y1}, flags, text, validation, sprite, bufLen}]
//  }
// All coordinates are RISC OS OS units exactly as in the file (y up, work area y<=0).
// loadTemplates(url) accepts either a binary Templates file or JSON already in this
// form (or the assets agent's JSON, normalised by normaliseTemplates()).

import { ctrlString } from './charset.js';

export const WF = {
  moveable: 1 << 1, autoRedraw: 1 << 4, pane: 1 << 5, noBounds: 1 << 6,
  scrollRepeat: 1 << 8, scrollDebounce: 1 << 9, realColours: 1 << 10, backWindow: 1 << 11,
  hotKeys: 1 << 12, forceOnScreen: 1 << 13, ignoreRight: 1 << 14, ignoreBottom: 1 << 15,
  open: 1 << 16, top: 1 << 17, fullSize: 1 << 18, toggledShift: 1 << 19, focus: 1 << 20,
  back: 1 << 24, close: 1 << 25, title: 1 << 26, toggle: 1 << 27, vscroll: 1 << 28,
  size: 1 << 29, hscroll: 1 << 30, newFormat: 1 << 31,
};

export const IF = {
  text: 1, sprite: 2, border: 4, hcentre: 8, vcentre: 16, filled: 32, font: 64,
  needsHelp: 128, indirected: 256, rjustify: 512, adjustNoCancel: 1024, halfSize: 2048,
  selected: 1 << 21, shaded: 1 << 22, deleted: 1 << 23,
};
export const BTYPE = {
  never: 0, always: 1, autoRepeat: 2, click: 3, release: 4, doubleClick: 5, clickDrag: 6,
  releaseDrag: 7, doubleDrag: 8, menu: 9, clickDragDouble: 10, radio: 11, writableDrag: 14, writable: 15,
};
export const iconButtonType = (flags) => (flags >>> 12) & 15;
export const iconESG = (flags) => (flags >>> 16) & 31;
export const iconFg = (flags) => (flags >>> 24) & 15;
export const iconBg = (flags) => (flags >>> 28) & 15;

function dv(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }

function parseIconData(bytes, v, base, dataOff, flags) {
  const out = {};
  if (flags & IF.indirected) {
    const p0 = v.getInt32(dataOff, true), p1 = v.getInt32(dataOff + 4, true), len = v.getInt32(dataOff + 8, true);
    if (flags & IF.text) {
      out.text = p0 > 0 && base + p0 < bytes.length ? ctrlString(bytes, base + p0, Math.max(len, 1)) : '';
      out.bufLen = len;
      if (p1 > 0 && base + p1 < bytes.length) out.validation = ctrlString(bytes, base + p1);
      if (flags & IF.sprite && out.validation) {
        const m = /(?:^|;)s([^;]*)/i.exec(out.validation);
        if (m) out.sprite = m[1].split(',')[0];
      }
    } else if (flags & IF.sprite) {
      // indirected sprite only: [name ptr, area ptr, length]
      out.sprite = len > 0 && base + p0 < bytes.length ? ctrlString(bytes, base + p0, len) : '';
    }
  } else {
    const s = ctrlString(bytes, dataOff, 12);
    if (flags & IF.text) out.text = s;
    if (flags & IF.sprite) out.sprite = s;
  }
  return out;
}

/** Parse a binary Templates file. */
export function parseTemplateFile(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const v = dv(bytes);
  const fontOff = v.getInt32(0, true);
  const fonts = [];
  if (fontOff > 0 && fontOff < bytes.length) {
    for (let o = fontOff; o + 48 <= bytes.length; o += 48) {
      fonts.push({ xsize: v.getUint32(o, true) / 16, ysize: v.getUint32(o + 4, true) / 16, name: ctrlString(bytes, o + 8, 40) });
    }
  }
  const windows = {};
  for (let ix = 16; ix + 24 <= bytes.length; ix += 24) {
    const off = v.getInt32(ix, true);
    if (off === 0) break;
    const type = v.getInt32(ix + 8, true);
    const name = ctrlString(bytes, ix + 12, 12);
    if (type !== 1) continue;
    const b = off;
    const r = (o) => v.getInt32(b + o, true);
    const flags = r(28) >>> 0;
    const titleFlags = r(56) >>> 0;
    const w = {
      name,
      visible: { x0: r(0), y0: r(4), x1: r(8), y1: r(12) },
      scroll: { x: r(16), y: r(20) },
      behind: r(24), flags,
      colours: {
        titleFg: bytes[b + 32], titleBg: bytes[b + 33], workFg: bytes[b + 34], workBg: bytes[b + 35],
        scrollOuter: bytes[b + 36], scrollInner: bytes[b + 37], titleFocus: bytes[b + 38],
      },
      extraFlags: bytes[b + 39],
      extent: { x0: r(40), y0: r(44), x1: r(48), y1: r(52) },
      titleFlags, workFlags: r(60) >>> 0,
      minWidth: v.getUint16(b + 68, true), minHeight: v.getUint16(b + 70, true),
      title: parseIconData(bytes, v, b, b + 72, titleFlags),
      icons: [],
    };
    const n = r(84);
    for (let i = 0; i < n; i++) {
      const io = b + 88 + i * 32;
      const iflags = v.getInt32(io + 16, true) >>> 0;
      const icon = { bbox: { x0: v.getInt32(io, true), y0: v.getInt32(io + 4, true), x1: v.getInt32(io + 8, true), y1: v.getInt32(io + 12, true) }, flags: iflags };
      Object.assign(icon, parseIconData(bytes, v, b, io + 20, iflags));
      if (iflags & IF.font) {
        const fh = iflags >>> 24;
        if (fonts[fh - 1]) icon.font = fonts[fh - 1];
      }
      w.icons.push(icon);
    }
    if (titleFlags & IF.font) {
      const fh = titleFlags >>> 24;
      if (fonts[fh - 1]) w.title.font = fonts[fh - 1];
    }
    windows[name.toLowerCase()] = w;
  }
  return { fonts, windows };
}

// Accepts alternative JSON shapes (e.g. arrays of windows, hex strings) and returns the
// canonical {fonts, windows:{lcname: tpl}} form.
export function normaliseTemplates(json) {
  if (!json) return { fonts: [], windows: {} };
  let wins = json.windows ?? json.templates ?? json;
  const out = {};
  const num = (x) => (typeof x === 'string' ? parseInt(x.replace(/^(&|0x)/i, ''), /^(&|0x)/i.test(x) ? 16 : 10) : x) >>> 0;
  const list = Array.isArray(wins) ? wins : Object.entries(wins).map(([k, w]) => ({ name: k, ...w }));
  for (const w0 of list) {
    if (!w0 || typeof w0 !== 'object' || (!w0.icons && !w0.visible && !w0.extent)) continue;
    const w = { ...w0 };
    w.flags = num(w.flags ?? w.windowFlags ?? 0);
    w.titleFlags = num(w.titleFlags ?? w.titleIconFlags ?? 0);
    w.workFlags = num(w.workFlags ?? w.workAreaFlags ?? w.buttonFlags ?? 0);
    const box = (b) => {
      if (!b) return b;
      if (Array.isArray(b)) return { x0: b[0], y0: b[1], x1: b[2], y1: b[3] };
      if ('xmin' in b) return { x0: b.xmin, y0: b.ymin, x1: b.xmax, y1: b.ymax };
      return b;
    };
    w.visible = box(w.visible ?? w.visibleArea);
    w.extent = box(w.extent ?? w.workArea);
    w.scroll = w.scroll ?? { x: w.scrollX ?? 0, y: w.scrollY ?? 0 };
    if (Array.isArray(w.colours)) {
      const c = w.colours;
      w.colours = { titleFg: c[0], titleBg: c[1], workFg: c[2], workBg: c[3], scrollOuter: c[4], scrollInner: c[5], titleFocus: c[6] };
    }
    const fixIcon = (ic, flags) => {
      const i = { ...ic, flags };
      if (typeof i.text !== 'string') i.text = typeof i.data === 'string' && (flags & IF.text) ? i.data : undefined;
      if (typeof i.sprite !== 'string') i.sprite = i.spriteName ?? (!(flags & IF.text) && (flags & IF.sprite) && typeof ic.text === 'string' ? ic.text : undefined);
      if (i.bufLen == null && i.bufferSize != null) i.bufLen = i.bufferSize;
      if (i.validation === false || i.validation === null) delete i.validation;
      return i;
    };
    if (typeof w.title === 'string') w.title = { text: w.title };
    w.title = fixIcon(w.title ?? {}, w.titleFlags);
    w.icons = (w.icons ?? []).map((ic) => {
      const i = fixIcon(ic, num(ic.flags ?? 0));
      i.bbox = box(ic.bbox ?? ic.box);
      return i;
    });
    out[(w.name ?? '').toLowerCase()] = w;
  }
  const fonts = (json.fonts ?? []).map((f) => ({ name: f.name, xsize: f.xsize ?? f.xPoint, ysize: f.ysize ?? f.yPoint }));
  for (const w of Object.values(out)) {
    for (const ic of [w.title, ...w.icons]) {
      if (ic.flags & IF.font && !ic.font) { const f = fonts[(ic.fontHandle ?? (ic.flags >>> 24)) - 1]; if (f) ic.font = f; }
    }
  }
  return { fonts, windows: out };
}

const cache = new Map();
/** Load a template file (binary ,fec or JSON). Returns {fonts, windows}. */
export async function loadTemplates(url) {
  if (cache.has(url)) return cache.get(url);
  const p = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Template file not found: ${url}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    // JSON starts with '{' or '['
    let i = 0;
    while (i < buf.length && buf[i] <= 32) i++;
    if (buf[i] === 0x7B || buf[i] === 0x5B) return normaliseTemplates(JSON.parse(new TextDecoder().decode(buf)));
    return parseTemplateFile(buf);
  })();
  cache.set(url, p);
  return p;
}
