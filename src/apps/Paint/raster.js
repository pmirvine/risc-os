// Shape rasterisation for Paint, using the BASIC agent's port of the RISC OS kernel VDU
// graphics code (src/basic/vdu.js) with output "switched to a sprite": we plot into a coverage
// buffer the size of the sprite with colour 1, then Paint applies its colour / GCOL action /
// mask to every covered pixel. Coordinates are sprite OS units, origin bottom-left, exactly as
// Paint plots with output redirected to the sprite (OS_SpriteOp 60).

import { VDU } from '../../basic/vdu.js';

let vdu = null;

/**
 * Run fn(v) with VDU output switched to a w x h coverage buffer (xeig/yeig = sprite eigs).
 * Returns the coverage Uint8Array (row 0 = top of the sprite), non-zero = plotted.
 */
export function rasterise(w, h, xeig, yeig, fn) {
  if (!vdu) vdu = new VDU({ mode: 27 });
  const v = vdu;
  v.W = w; v.H = h; v.xWL = w - 1; v.yWL = h - 1;
  v.xEig = xeig; v.yEig = yeig;
  const ed = xeig - yeig; v.aspect = ed < 0 ? 2 : ed > 0 ? 1 : 0;
  v.fb = new Uint8Array(w * h);
  v.banks = [v.fb, v.fb]; v.driverBank = 0; v.displayBank = 0;
  v.gwl = 0; v.gwb = 0; v.gwr = w - 1; v.gwt = h - 1;
  v.orgX = 0; v.orgY = 0; v.gcsX = 0; v.gcsY = 0;
  v.gcsIX = v.gcsIY = v.oldX = v.oldY = v.olderX = v.olderY = v.newX = v.newY = 0;
  v.ecfYOffset = h & 7; v.ecfShift = 0;
  v.vdu5 = false; v.cursorFlags = 0; v.disabled = false; v.qNeed = 0;
  v.gCharSizeX = 8; v.gCharSizeY = 8; v.gCharSpaceX = 8; v.gCharSpaceY = 8;
  v._gcol(0, 1);
  v._gcol(0, 128);
  v.dMin = 1e9; v.dMax = -1;
  fn(v);
  return v.fb;
}

/** PLOT codes (bbc.h) used by Paint's tools. */
export const PLOT = {
  move: 4, line: 5, point: 69, triangle: 85, rect: 101, parallelogram: 117,
  circle: 149, circleFill: 157, arc: 165, segment: 173, sector: 181, ellipse: 197, ellipseFill: 205,
  // "SolidBoth + DrawAbsFore" = line with both end points
};

/** Plot a table-driven shape: points [[x,y]...] (OS units), final plot code k. */
export function plotShape(sprite, points, k) {
  return rasterise(sprite.w, sprite.h, sprite.xeig, sprite.yeig, (v) => {
    for (let i = 0; i < points.length - 1; i++) v.plot(4, points[i][0], points[i][1]);
    const p = points[points.length - 1];
    v.plot(k, p[0], p[1]);
  });
}

/** Rectangle outline (bbc_rectangle: four lines) from (x0,y0) to (x1,y1). */
export function plotRectOutline(sprite, x0, y0, x1, y1) {
  return rasterise(sprite.w, sprite.h, sprite.xeig, sprite.yeig, (v) => {
    v.plot(4, x0, y0); v.plot(5, x1, y0); v.plot(5, x1, y1); v.plot(5, x0, y1); v.plot(5, x0, y0);
  });
}

/** Parallelogram outline, points a, b, c (the fourth is a + c - b). */
export function plotParallelogramOutline(sprite, a, b, c) {
  return rasterise(sprite.w, sprite.h, sprite.xeig, sprite.yeig, (v) => {
    v.plot(4, a[0], a[1]); v.plot(5, b[0], b[1]); v.plot(5, c[0], c[1]);
    v.plot(5, c[0] + a[0] - b[0], c[1] + a[1] - b[1]); v.plot(5, a[0], a[1]);
  });
}

/** VDU 5 text (system font) with its top-left at (x, y) OS units, char size / spacing in pixels. */
export function plotText(sprite, text, x, y, sx, sy, space) {
  return rasterise(sprite.w, sprite.h, sprite.xeig, sprite.yeig, (v) => {
    v.gCharSizeX = sx; v.gCharSizeY = sy; v.gCharSpaceX = space; v.gCharSpaceY = sy;
    v.vdu5 = true;
    v.plot(4, x, y);
    for (const ch of text) {
      const c = ch.charCodeAt(0) & 255;
      if (c >= 32) v._printChar(c);
    }
    v.vdu5 = false;
  });
}

/** Bounding box of the non-zero entries of a coverage buffer: {x0, y0, x1, y1} (top-row origin) or null. */
export function coverageBox(cov, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const r = y * w;
    for (let x = 0; x < w; x++) {
      if (cov[r + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}
