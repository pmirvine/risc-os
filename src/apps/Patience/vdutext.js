// VDU 5 style text plotting in the system font (8x8 pixels per character, as in a square-pixel
// desktop mode), plus helpers converting RISC OS work-area OS-unit coordinates to canvas pixels.
// Shared by !Patience and !Puzzle, whose original BASIC programs draw with MOVE/PRINT/RECTANGLE.

let font = null;
let fontP = null;
export function loadSystemFont() {
  fontP ??= fetch('assets/fonts/system8x8.json').then((r) => r.json()).then((j) => { font = j.chars; return font; }).catch(() => null);
  return fontP;
}

/** Pixel column for OS x, pixel row (from the work-area top) for OS y (work area, y up, negative downwards). */
export const col = (x) => Math.floor(x / 2);
export const row = (y) => -Math.floor(y / 2) - 1;

/** RECTANGLE FILL x,y,w,h (inclusive of both edges, like the VDU). */
export function rectFill(g, x, y, w, h) {
  const x0 = Math.min(x, x + w), x1 = Math.max(x, x + w), y0 = Math.min(y, y + h), y1 = Math.max(y, y + h);
  const c0 = col(x0), c1 = col(x1), r0 = row(y1), r1 = row(y0);
  g.fillRect(c0, r0, c1 - c0 + 1, r1 - r0 + 1);
}

/** RECTANGLE x,y,w,h outline. */
export function rectOutline(g, x, y, w, h) {
  const x0 = Math.min(x, x + w), x1 = Math.max(x, x + w), y0 = Math.min(y, y + h), y1 = Math.max(y, y + h);
  rectFill(g, x0, y0, 0, y1 - y0); rectFill(g, x1, y0, 0, y1 - y0);
  rectFill(g, x0, y0, x1 - x0, 0); rectFill(g, x0, y1, x1 - x0, 0);
}

/** PRINT text at graphics cursor (x,y) = top-left of the first character cell (VDU 5). fillStyle = colour. */
export function vduText(g, s, x, y) {
  if (!font) return;
  let cx = col(x);
  const ry = row(y);
  for (const ch of String(s)) {
    const bits = font[ch.charCodeAt(0) & 255] ?? [];
    for (let r = 0; r < 8; r++) {
      const b = bits[r] | 0;
      if (!b) continue;
      for (let c = 0; c < 8; c++) if (b & (0x80 >> c)) g.fillRect(cx + c, ry + r, 1, 1);
    }
    cx += 8;
  }
}

/** Plot a sprite (SpriteInfo with a loaded canvas) with its bottom-left corner at OS (x,y). */
export function plotSprite(g, spr, cv, x, y) {
  if (!spr || !cv) return;
  const w = spr.cssW, h = spr.cssH;
  g.drawImage(cv, col(x), row(y) - h + 1, w, h);
}

/** Parse an old-style line-indexed Messages file (as !Patience reads it: one string per line until a blank line). */
export function parseLines(text) {
  const out = [];
  for (const l of text.split(/\r?\n/)) { if (l === '') break; out.push(l); }
  return out;
}
