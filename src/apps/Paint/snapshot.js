// Screen snapshot (Paint's icon bar menu > Snapshot): grab part of the desktop as a sprite.
//
// The desktop is DOM (windows, icons, canvases), so it is rasterised the way a browser can without
// extra libraries: the screen element is cloned with every canvas turned into an <img>, every image
// and every url() in the style sheets inlined as data: URLs, wrapped in an SVG <foreignObject>,
// drawn into a canvas and read back. The result is a 16M-colour (32bpp, 90 dpi) sprite.

import { wimp } from '../../core/wimp.js';
import { newSprite } from './spritefile.js';

const dataCache = new Map();

async function toDataURL(url) {
  if (!url || url.startsWith('data:')) return url;
  if (dataCache.has(url)) return dataCache.get(url);
  const p = fetch(url).then((r) => r.blob()).then((b) => new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => res(url);
    fr.readAsDataURL(b);
  })).catch(() => url);
  dataCache.set(url, p);
  return p;
}

/** Replace every url(...) in css (relative to base) with a data: URL. */
async function inlineUrls(css, base) {
  const urls = new Set();
  css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => { if (!u.startsWith('data:')) urls.add(u); return m; });
  const map = new Map();
  await Promise.all([...urls].map(async (u) => { map.set(u, await toDataURL(new URL(u, base).href)); }));
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => (map.has(u) ? `url("${map.get(u)}")` : m));
}

let sheetCss = null;
async function styleSheets() {
  if (sheetCss) return sheetCss;
  let out = '';
  for (const sh of document.styleSheets) {
    let text = '';
    try { text = [...sh.cssRules].map((r) => r.cssText).join('\n'); } catch { continue; }
    out += await inlineUrls(text, sh.href ?? location.href) + '\n';
  }
  sheetCss = out;
  return out;
}

/** The whole desktop as a canvas (desktop pixels). */
export async function renderDesktop() {
  const scr = wimp.screen;
  const W = Math.round(wimp.width), H = Math.round(wimp.height);
  const clone = scr.cloneNode(true);
  // canvases don't clone their pixels
  const src = scr.querySelectorAll('canvas'), dst = clone.querySelectorAll('canvas');
  src.forEach((c, i) => {
    const img = document.createElement('img');
    try { img.src = c.toDataURL(); } catch { return; }
    img.className = c.className;
    img.setAttribute('style', c.getAttribute('style') ?? '');
    if (!c.style.width) img.style.width = `${c.clientWidth || c.width}px`;
    if (!c.style.height) img.style.height = `${c.clientHeight || c.height}px`;
    dst[i].replaceWith(img);
  });
  await Promise.all([...clone.querySelectorAll('img')].map(async (img) => { img.src = await toDataURL(img.src); }));
  await Promise.all([...clone.querySelectorAll('[style*="url("]')].map(async (e) => { e.setAttribute('style', await inlineUrls(e.getAttribute('style'), location.href)); }));
  // no pointer, caret blink or drag shield; the screen at its own size
  for (const e of clone.querySelectorAll('.caret')) e.style.visibility = 'hidden';
  clone.style.transform = 'none';
  clone.style.left = '0'; clone.style.top = '0';
  clone.style.position = 'relative';
  clone.style.width = `${W}px`; clone.style.height = `${H}px`;
  clone.style.cursor = 'none';
  const css = await styleSheets();
  const html = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject x="0" y="0" width="${W}" height="${H}">`
    + `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${W}px;height:${H}px;overflow:hidden;margin:0"><style>${css.replace(/<\/style/gi, '<\\/style')}</style>${html}</div></foreignObject></svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  return c;
}

/** Grab screen box {x0,y0,x1,y1} (desktop px, y down) as a 16M-colour sprite called `name`. */
export async function grabScreen(box, name) {
  const x0 = Math.max(0, Math.floor(box.x0)), y0 = Math.max(0, Math.floor(box.y0));
  const x1 = Math.min(Math.round(wimp.width), Math.ceil(box.x1)), y1 = Math.min(Math.round(wimp.height), Math.ceil(box.y1));
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return null;
  const c = await renderDesktop();
  const d = c.getContext('2d').getImageData(x0, y0, w, h).data;
  const mode = ((6 << 27) | (90 << 14) | (90 << 1) | 1) >>> 0;
  const s = newSprite({ name: String(name || 'snapshot'), w, h, mode });
  for (let i = 0; i < w * h; i++) s.px[i] = (d[i * 4] | (d[i * 4 + 1] << 8) | (d[i * 4 + 2] << 16)) >>> 0;
  return s;
}
