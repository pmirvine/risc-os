// Sprite pools.
//
// The Wimp keeps a "common sprite pool" searched by name (case-insensitive). We model it as
// an ordered list of areas: areas added later (like *IconSprites) are searched first, then the
// ROM Wimp pool (assets/sprites/Wimp/Sprites22). Tool (window furniture) sprites come from
// assets/sprites/Wimp/Tools3d, using the square-pixel "…22" versions.
//
// Sprites are loaded from the assets agent's PNG manifests, or decoded at runtime from RISC OS
// sprite files (e.g. an application's !Sprites found on the virtual disc).

import { decodeSpriteFile } from './spritefile.js';

export class SpriteInfo {
  constructor(o) {
    this.name = o.name;          // lower-case name
    this.osW = o.osW; this.osH = o.osH;
    this.w = o.w; this.h = o.h;  // native pixel size
    this.url = o.url;            // PNG/data URL of the native-resolution image
    this.hasMask = !!o.hasMask;
    this._variants = new Map();
    this._pixels = null;
    if (o.canvas) this._canvas = o.canvas;
  }
  /** Size in desktop (CSS) pixels: 1 px = 2 OS units. */
  get cssW() { return this.osW / 2; }
  get cssH() { return this.osH / 2; }

  async canvas() {
    if (this._canvas) return this._canvas;
    if (!this._canvasP) {
      this._canvasP = new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => {
          const c = document.createElement('canvas');
          c.width = im.naturalWidth; c.height = im.naturalHeight;
          c.getContext('2d').drawImage(im, 0, 0);
          this._canvas = c;
          resolve(c);
        };
        im.onerror = () => reject(new Error('sprite load failed ' + this.url));
        im.src = this.url;
      });
    }
    return this._canvasP;
  }

  /**
   * URL for a highlighted variant, following the Wimp's inversefunc (RISC OS 3.5+):
   * 'selected' - greys inverted, dark colours halved, others V*10/16;
   * 'shaded'   - luma mapped into the range &b0..&ff.
   * Returns a promise.
   */
  variantUrl(kind) {
    if (!kind || kind === 'normal') return Promise.resolve(this.url);
    if (!this._variants.has(kind)) {
      this._variants.set(kind, this.canvas().then((src) => {
        const c = document.createElement('canvas');
        c.width = src.width; c.height = src.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(src, 0, 0);
        const id = ctx.getImageData(0, 0, c.width, c.height);
        const d = id.data;
        for (let i = 0; i < d.length; i += 4) {
          if (!d[i + 3]) continue;
          let [r, g, b] = [d[i], d[i + 1], d[i + 2]];
          if (kind === 'selected' || kind === 'selshaded') [r, g, b] = invertRGB(r, g, b);
          if (kind === 'shaded' || kind === 'selshaded') [r, g, b] = shadeRGB(r, g, b);
          d[i] = r; d[i + 1] = g; d[i + 2] = b;
        }
        ctx.putImageData(id, 0, 0);
        return c.toDataURL();
      }).catch(() => this.url));
    }
    return this._variants.get(kind);
  }
}

export function invertRGB(r, g, b) {
  if (r === g && g === b) return [255 - r, 255 - g, 255 - b];
  if (r <= 5 || g <= 5 || b <= 5) return [r >> 1, g >> 1, b >> 1];
  // HSV: keep hue & saturation, V = V*10/16
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const s = max === 0 ? 0 : (max - min) / max;
  if (s < 1 / 32) return [255 - r, 255 - g, 255 - b];
  const k = 10 / 16;
  return [Math.round(r * k), Math.round(g * k), Math.round(b * k)];
}

export function shadeRGB(r, g, b) {
  const luma = (r * 77 + g * 150 + b * 28) / 255;
  const v = Math.round(0xb0 + (luma * (0xff - 0xb0)) / 255);
  return [v, v, v];
}

// ---------------------------------------------------------------------------

const manifests = new Map();   // "Pool/File" -> Promise<Map>

/** Load an assets sprite manifest (assets/sprites/<pool>/<file>.json) as Map name->SpriteInfo. */
export function loadManifest(pool, file) {
  const key = `${pool}/${file}`;
  if (!manifests.has(key)) {
    manifests.set(key, (async () => {
      const base = `assets/sprites/${pool}/`;
      const map = new Map();
      try {
        const r = await fetch(`${base}${file}.json`);
        if (!r.ok) return map;
        const j = await r.json();
        for (const [name, e] of Object.entries(j)) {
          map.set(name.toLowerCase(), new SpriteInfo({ name: name.toLowerCase(), w: e.w, h: e.h, osW: e.osW, osH: e.osH, url: base + e.file, hasMask: e.hasMask }));
        }
      } catch { /* missing */ }
      return map;
    })());
  }
  return manifests.get(key);
}

/** Decode a RISC OS sprite file (bytes) into a Map name->SpriteInfo (data URLs). */
export function spritesFromFile(bytes) {
  const map = new Map();
  for (const s of decodeSpriteFile(bytes)) {
    const c = document.createElement('canvas');
    c.width = s.width; c.height = s.height;
    c.getContext('2d').putImageData(new ImageData(s.rgba, s.width, s.height), 0, 0);
    const name = s.name.toLowerCase();
    map.set(name, new SpriteInfo({ name, w: s.width, h: s.height, osW: s.osWidth, osH: s.osHeight, url: c.toDataURL(), hasMask: s.hasMask, canvas: c }));
  }
  return map;
}

// ---------------------------------------------------------------------------
// The Wimp common pool

const areas = [];      // [{id, map}] searched front to back
let rom = new Map();
let tools = new Map();
const listeners = new Set();

export const sprites = {
  /** Load ROM sprites (Wimp pool + tools). */
  async init() {
    [rom, tools] = await Promise.all([loadManifest('Wimp', 'Sprites22'), loadManifest('Wimp', 'Tools3d')]);
    // fall back to the mode-12 pool for anything missing in Sprites22
    const lo = await loadManifest('Wimp', 'Sprites');
    for (const [k, v] of lo) if (!rom.has(k)) rom.set(k, v);
  },

  /** Find a sprite in the common pool (user areas first, then ROM). */
  get(name) {
    if (!name) return null;
    const n = String(name).toLowerCase();
    for (const a of areas) { const s = a.map.get(n); if (s) return s; }
    return rom.get(n) ?? null;
  },
  has(name) { return !!this.get(name); },

  /** Window tool sprite (square-pixel version preferred). */
  tool(name) { return tools.get(name + '22') ?? tools.get(name) ?? null; },

  /** Merge a sprite map into the common pool (like *IconSprites). Later adds take priority. */
  addArea(map, id = 'area' + areas.length) {
    const existing = areas.findIndex((a) => a.id === id);
    if (existing >= 0) areas.splice(existing, 1);
    areas.unshift({ id, map });
    for (const f of listeners) f();
    return id;
  },
  hasArea(id) { return areas.some((a) => a.id === id); },
  /** Load an assets manifest into the common pool. */
  async addManifest(pool, file) {
    const m = await loadManifest(pool, file);
    if (m.size) this.addArea(m, `${pool}/${file}`);
    return m;
  },
  /** Load a raw sprite file (bytes) into the common pool. */
  addSpriteFile(bytes, id) {
    const m = spritesFromFile(bytes);
    if (m.size) this.addArea(m, id);
    return m;
  },
  /** Remove a sprite (like *WimpKillSprite) - only from user areas. */
  kill(name) {
    const n = name.toLowerCase();
    for (const a of areas) a.map.delete(n);
  },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  loadManifest,
  spritesFromFile,

  /**
   * Create an <img> element for a sprite (or area map / SpriteInfo), sized at desktop scale.
   * opts: {variant:'selected'|'shaded'|'selshaded', half:true, area: Map}
   */
  img(nameOrInfo, opts = {}) {
    const info = nameOrInfo instanceof SpriteInfo ? nameOrInfo : (opts.area?.get(String(nameOrInfo).toLowerCase()) ?? this.get(nameOrInfo));
    const im = document.createElement('img');
    im.className = 'spr';
    im.draggable = false;
    im.alt = '';
    if (!info) { im.style.display = 'none'; return im; }
    const f = opts.half ? 0.5 : 1;
    im.style.width = info.cssW * f + 'px';
    im.style.height = info.cssH * f + 'px';
    setImgVariant(im, info, opts.variant);
    im._sprite = info;
    return im;
  },
};

export function setImgVariant(im, info, variant) {
  if (!info) return;
  if (!variant || variant === 'normal') { im.src = info.url; return; }
  const token = {};
  im._tok = token;
  im.src = info.url;
  info.variantUrl(variant).then((u) => { if (im._tok === token) im.src = u; });
}
