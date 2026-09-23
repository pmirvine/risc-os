// Paint's painting tools (a port of c.Tools).
//
// Every tool is {click(sw, m), null(sw, m), redraw(sw, eor), stop(s), description}, like the C
// toolwindow_block. `sw` is a sprite window (see sprwin.js), `m` a mouse state
//   {x, y  - OS units from the sprite's bottom-left (tools_mouse_to_extent_coords),
//    bbits - 4 Select / 1 Adjust / 64 Select drag / 16 Adjust drag / 0 no buttons}.
// Painting into the sprite rasterises with the RISC OS VDU (raster.js) into a coverage buffer,
// then applies the colour / GCOL action / mask here. EOR outlines ("rubber banding") are drawn
// by redraw() through eor.plot(fn), which rasterises in screen OS units and inverts pixels.

import { rasterise, plotShape, plotText, plotRectOutline, plotParallelogramOutline, coverageBox, PLOT } from './raster.js';
import { nColours, applyAction, translation } from './colours.js';
import { pix, setPix, maskAt, setMask, inside } from './ops.js';

export const BLEFT = 4, BRIGHT = 1, BDRAGLEFT = 64, BDRAGRIGHT = 16;

/** Bit mask of a pixel value for the sprite's depth. */
export const pixBits = (s) => (s.bpp <= 8 ? (1 << s.bpp) - 1 : s.bpp === 16 ? 0x7FFF : 0xFFFFFF);

/** Colour number -> pixel for (x, y): ECF colours read the sprite's pattern. */
export function colourAt(s, c, x, y) {
  if (c >= 0) return c;
  const e = s.st?.ecfs?.[-c - 1];
  return e ? e.pat[(y & 7) * 8 + (x & 7)] : 0;
}

/**
 * Apply colour `c` (colour number, nc = transparent, < 0 = ECF) with GCOL action `mode` to every
 * pixel covered by `cov` (row 0 = top). Returns the changed box in pixels (y from bottom) or null.
 */
export function applyCoverage(s, cov, c, mode) {
  const b = coverageBox(cov, s.w, s.h);
  if (!b) return null;
  const trans = c === nColours(s);
  const bits = pixBits(s), w = s.w;
  for (let r = b.y0; r < b.y1; r++) {
    const yb = s.h - 1 - r;
    for (let x = b.x0; x < b.x1; x++) {
      const i = r * w + x;
      if (!cov[i]) continue;
      if (!trans) s.px[i] = (applyAction(mode, s.px[i], colourAt(s, c, x, yb)) & bits) >>> 0;
      if (s.mask) s.mask[i] = trans ? 0 : 1;
    }
  }
  return { x0: b.x0, y0: s.h - b.y1, x1: b.x1, y1: s.h - b.y0 };
}

const union = (a, b) => (!a ? b : !b ? a : { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });

/** Pseudo-random numbers exactly as c.Tools myrnd (32-bit wrap-around). */
let rndseed = 42;
const myrnd = () => { rndseed = (Math.imul(2147001325, rndseed) + 715136305) | 0; return rndseed; };

/**
 * Make the tool set. app provides:
 *   options: {mode (0 Set 1 OR 2 AND 3 EOR), floodLocal, exporting, text: {text, xsize, ysize, xspace},
 *             spray: {density, radius}, brush: {sprite, scale: {xmul,xdiv,ymul,ydiv}, useGcol}}
 *   edited(s, box)      - pixels changed (box in pixels from the bottom-left, or null = all)
 *   undo(s)             - record the sprite's state before a change
 *   redisplay(s)        - refresh every window showing s (tool outlines included)
 *   error(token)        - report an error from the Messages file
 *   exportSprite(s, x0, y0, x1, y1) - "Export" a block (save box)
 */
export function makeTools(app) {
  const opt = app.options;
  const ts = (s) => (s.ts ??= { state: 0, pts: [], adjust: -1 });

  // ------------------------------------------------------------------ table driven shapes
  function tabledriven(table) {
    return {
      click(sw, m) {
        if (!(m.bbits & (BRIGHT | BLEFT))) return;              // ignore drags
        const s = sw.sprite, t = ts(s);
        if (m.bbits & BRIGHT) {
          // Adjust: pick the nearest placed point, and move it while Adjust is held
          let point = -1, bd = Infinity;
          for (let i = 0; i < t.state; i++) {
            const d = (t.pts[i][0] - m.x) ** 2 + (t.pts[i][1] - m.y) ** 2;
            if (d < bd) { bd = d; point = i; }
          }
          t.adjust = point;
          return;
        }
        if (t.state === 0 || t.state < table.length) {
          if (t.state === 0) { t.pts = [[m.x, m.y], [m.x, m.y]]; t.active = true; }
          else { t.pts[t.state] = [m.x, m.y]; if (t.state + 1 <= 3) t.pts[t.state + 1] = [m.x, m.y]; }
          t.state++;
          app.redisplay(s);
          return;
        }
        // final point: paint it
        const pts = t.pts.slice(0, t.state).concat([[m.x, m.y]]);
        const code = table[t.state - 1];
        t.state = 0; t.active = false; t.adjust = -1;
        paintShape(s, sw, (v) => { for (let i = 0; i < pts.length - 1; i++) v.plot(4, pts[i][0], pts[i][1]); v.plot(code, pts[pts.length - 1][0], pts[pts.length - 1][1]); });
      },
      null(sw, m) {
        const s = sw.sprite, t = ts(s);
        if (!t.state) return;
        if (!(m.bbits & BRIGHT)) t.adjust = -1;
        const point = t.adjust >= 0 ? t.adjust : t.state;
        const p = t.pts[point];
        if (p && (p[0] !== m.x || p[1] !== m.y)) { t.pts[point] = [m.x, m.y]; app.redisplay(s); }
      },
      redraw(sw, eor) {
        const t = ts(sw.sprite);
        if (!t.state) return;
        const pts = t.pts.slice(0, t.state + 1);
        eor.plot((v, P) => { for (let i = 0; i < t.state; i++) v.plot(4, ...P(pts[i])); v.plot(table[t.state - 1], ...P(pts[t.state])); });
      },
      stop(s) { const t = ts(s); if (t.state) { t.state = 0; t.adjust = -1; app.redisplay(s); } },
    };
  }

  /** Paint a shape (fn plots with the VDU in sprite OS units) in the current colour. */
  function paintShape(s, sw, fn) {
    const c = s.st.gcol;
    app.undo(s);
    const cov = rasterise(s.w, s.h, s.xeig, s.yeig, fn);
    const box = applyCoverage(s, cov, c, opt.mode);
    app.edited(s, box);
  }

  // ------------------------------------------------------------------ rectangle outlines
  const rectangleOutline = {
    click(sw, m) {
      if (!(m.bbits & (BRIGHT | BLEFT))) return;
      const s = sw.sprite, t = ts(s);
      if (m.bbits & BRIGHT) {
        let point = -1, bd = Infinity;
        for (let i = 0; i < t.state; i++) { const d = (t.pts[i][0] - m.x) ** 2 + (t.pts[i][1] - m.y) ** 2; if (d < bd) { bd = d; point = i; } }
        t.adjust = point;
        return;
      }
      if (t.state === 0) { t.pts = [[m.x, m.y], [m.x, m.y]]; t.state = 1; app.redisplay(s); return; }
      const [a, b] = t.pts;
      t.state = 0; t.adjust = -1;
      paintShape(s, sw, (v) => { v.plot(4, a[0], a[1]); v.plot(5, b[0], a[1]); v.plot(5, b[0], b[1]); v.plot(5, a[0], b[1]); v.plot(5, a[0], a[1]); });
    },
    null(sw, m) {
      const s = sw.sprite, t = ts(s);
      if (!t.state) return;
      if (!(m.bbits & BRIGHT)) t.adjust = -1;
      const k = t.adjust === 0 ? 0 : 1;
      if (t.pts[k][0] !== m.x || t.pts[k][1] !== m.y) { t.pts[k] = [m.x, m.y]; app.redisplay(s); }
    },
    redraw(sw, eor) {
      const t = ts(sw.sprite);
      if (!t.state) return;
      const [a, b] = t.pts;
      eor.plot((v, P) => { const A = P(a), B = P(b); v.plot(4, A[0], A[1]); v.plot(5, B[0], A[1]); v.plot(5, B[0], B[1]); v.plot(5, A[0], B[1]); v.plot(5, A[0], A[1]); }, true);
    },
    stop(s) { const t = ts(s); if (t.state) { t.state = 0; app.redisplay(s); } },
  };

  // ------------------------------------------------------------------ parallelogram outlines
  const parallelogramOutline = {
    click(sw, m) {
      if (!(m.bbits & (BRIGHT | BLEFT))) return;
      const s = sw.sprite, t = ts(s);
      if (m.bbits & BRIGHT) {
        let point = -1, bd = Infinity;
        for (let i = 0; i < t.state; i++) { const d = (t.pts[i][0] - m.x) ** 2 + (t.pts[i][1] - m.y) ** 2; if (d < bd) { bd = d; point = i; } }
        t.adjust = point;
        return;
      }
      if (t.state === 0) { t.pts = [[m.x, m.y], [m.x, m.y]]; t.state = 1; app.redisplay(s); return; }
      if (t.state === 1) { t.pts[1] = [m.x, m.y]; t.pts[2] = [m.x, m.y]; t.state = 2; app.redisplay(s); return; }
      const [a, b, c] = t.pts;
      t.state = 0; t.adjust = -1;
      paintShape(s, sw, (v) => { v.plot(4, a[0], a[1]); v.plot(5, b[0], b[1]); v.plot(5, c[0], c[1]); v.plot(5, c[0] + a[0] - b[0], c[1] + a[1] - b[1]); v.plot(5, a[0], a[1]); });
    },
    null(sw, m) {
      const s = sw.sprite, t = ts(s);
      if (!t.state) return;
      if (!(m.bbits & BRIGHT)) t.adjust = -1;
      const k = t.adjust >= 0 ? t.adjust : t.state;
      if (t.pts[k][0] !== m.x || t.pts[k][1] !== m.y) { t.pts[k] = [m.x, m.y]; app.redisplay(s); }
    },
    redraw(sw, eor) {
      const t = ts(sw.sprite);
      if (!t.state) return;
      eor.plot((v, P) => {
        const a = P(t.pts[0]), b = P(t.pts[1]);
        v.plot(4, a[0], a[1]); v.plot(5, b[0], b[1]);
        if (t.state === 2) { const c = P(t.pts[2]); v.plot(5, c[0], c[1]); v.plot(5, c[0] + a[0] - b[0], c[1] + a[1] - b[1]); v.plot(5, a[0], a[1]); }
      }, true);
    },
    stop(s) { const t = ts(s); if (t.state) { t.state = 0; app.redisplay(s); } },
  };

  // ------------------------------------------------------------------ pixels ("Set/clear pixels")
  function pixelBox(s, m) {
    const dx = 1 << s.xeig, dy = 1 << s.yeig;
    return [Math.floor(m.x / dx), Math.floor(m.y / dy)];
  }
  function plotPixel(s, x, y, c) {
    if (!inside(s, x, y)) return false;
    const nc = nColours(s);
    if (c !== nc) setPix(s, x, y, (applyAction(opt.mode, pix(s, x, y), colourAt(s, c, x, y)) & pixBits(s)) >>> 0);
    if (s.mask) setMask(s, x, y, c !== nc);
    return true;
  }
  const pixel = {
    click(sw, m) {
      if (!(m.bbits & (BRIGHT | BLEFT))) return;
      const s = sw.sprite, t = ts(s);
      app.undo(s);
      t.last = null; t.held = true;
      this.splot(sw, m);
    },
    splot(sw, m) {
      const s = sw.sprite, t = ts(s);
      const [x, y] = pixelBox(s, m);
      if (t.last && t.last[0] === x && t.last[1] === y) return;
      t.last = [x, y];
      const c = m.bbits === BRIGHT ? s.st.gcol2 : s.st.gcol;
      if (plotPixel(s, x, y, c)) app.edited(s, { x0: x, y0: y, x1: x + 1, y1: y + 1 });
    },
    null(sw, m) { const t = ts(sw.sprite); if (!t.held) return; if (!m.bbits) t.held = false; else this.splot(sw, m); },
    redraw() {},
    stop(s) { ts(s).held = false; },
  };

  // ------------------------------------------------------------------ spray can
  const spray = {
    click(sw, m) {
      if (!(m.bbits & (BRIGHT | BLEFT))) return;
      const s = sw.sprite, t = ts(s);
      const r = parseInt(opt.spray.radius, 10), d = parseInt(opt.spray.density, 10);
      if (String(r) === String(opt.spray.radius).trim() && !isNaN(r)) t.radius = r; else t.radius ??= 30;
      if (String(d) === String(opt.spray.density).trim() && !isNaN(d)) t.density = d; else t.density ??= 20;
      app.undo(s);
      t.held = true;
      this.splot(sw, m);
    },
    splot(sw, m) {
      const s = sw.sprite, t = ts(s);
      const radius = t.radius ?? 30;
      if (!(radius > 0)) return;
      const pxs = 1 << s.xeig, pys = 1 << s.yeig;
      const x = Math.floor(m.x / pxs), y = Math.floor(m.y / pys);
      const c = m.bbits === BRIGHT ? s.st.gcol2 : s.st.gcol;
      let box = null;
      for (let i = 0; i < (t.density ?? 20); i++) {
        const r = myrnd() % radius;
        const theta = myrnd() % (2 * 3.1415926);
        const nx = x + Math.trunc(Math.trunc(r * Math.cos(theta)) / pxs);
        const ny = y + Math.trunc(Math.trunc(r * Math.sin(theta)) / pys);
        if (plotPixel(s, nx, ny, c)) box = union(box, { x0: nx, y0: ny, x1: nx + 1, y1: ny + 1 });
      }
      if (box) app.edited(s, box);
    },
    null(sw, m) { const t = ts(sw.sprite); if (!t.held) return; if (!m.bbits) t.held = false; else this.splot(sw, m); },
    tick(sw, m) { if (ts(sw.sprite).held && m.bbits) this.splot(sw, m); },
    redraw() {},
    stop(s) { ts(s).held = false; },
  };

  // ------------------------------------------------------------------ flood fill ("Replace colour")
  const fill = {
    click(sw, m) {
      if (!(m.bbits & (BRIGHT | BLEFT))) return;
      const s = sw.sprite, nc = nColours(s);
      const gcol = m.bbits & BLEFT ? s.st.gcol : s.st.gcol2;
      const [x, y] = pixelBox(s, m);
      if (!inside(s, x, y)) return;
      const toT = gcol === nc, fromT = !maskAt(s, x, y);
      const col = pix(s, x, y);
      if (toT && fromT) return;
      const bits = pixBits(s), mode = opt.mode;
      const put = (xx, yy) => setPix(s, xx, yy, (applyAction(mode, pix(s, xx, yy), colourAt(s, gcol, xx, yy)) & bits) >>> 0);
      if (!opt.floodLocal) {
        app.undo(s);
        for (let yy = 0; yy < s.h; yy++) for (let xx = 0; xx < s.w; xx++) {
          if (fromT) { if (maskAt(s, xx, yy)) continue; setMask(s, xx, yy, 1); }
          else { if (pix(s, xx, yy) !== col) continue; if (toT) { setMask(s, xx, yy, 0); continue; } }
          put(xx, yy);
        }
        app.edited(s, null);
        return;
      }
      if (toT) { app.error('PntEL'); return; }
      if (!fromT) {
        // would the fill change anything? (for a plain colour)
        if (gcol >= 0 && ((applyAction(mode, col, gcol) & bits) >>> 0) === col) return;
        app.undo(s);
        flood(s, x, y, (xx, yy) => pix(s, xx, yy) === col, (xx, yy) => put(xx, yy));
      } else {
        app.undo(s);
        // every transparent pixel takes the colour; the connected transparent area becomes solid
        for (let yy = 0; yy < s.h; yy++) for (let xx = 0; xx < s.w; xx++) if (!maskAt(s, xx, yy)) setPix(s, xx, yy, colourAt(s, gcol, xx, yy) & bits);
        flood(s, x, y, (xx, yy) => !maskAt(s, xx, yy), (xx, yy) => setMask(s, xx, yy, 1));
      }
      app.edited(s, null);
    },
    null() {}, redraw() {}, stop() {},
  };

  /** 4-connected scan-line flood fill (the VDU's flood algorithm fills the same area). */
  function flood(s, x, y, test, set) {
    const seen = new Uint8Array(s.w * s.h);
    const stack = [[x, y]];
    const ok = (xx, yy) => xx >= 0 && yy >= 0 && xx < s.w && yy < s.h && !seen[yy * s.w + xx] && test(xx, yy);
    while (stack.length) {
      const [sx, sy] = stack.pop();
      if (!ok(sx, sy)) continue;
      let l = sx, r = sx;
      while (ok(l - 1, sy)) l--;
      while (ok(r + 1, sy)) r++;
      for (let xx = l; xx <= r; xx++) { seen[sy * s.w + xx] = 1; set(xx, sy); }
      for (const ny of [sy - 1, sy + 1]) {
        if (ny < 0 || ny >= s.h) continue;
        let inRun = false;
        for (let xx = l; xx <= r; xx++) {
          if (ok(xx, ny)) { if (!inRun) { stack.push([xx, ny]); inRun = true; } } else inRun = false;
        }
      }
    }
  }

  // ------------------------------------------------------------------ block copy / move / whole sprite
  const order = (a, b) => (a <= b ? [a, b] : [b, a]);
  function rectEOR(eor, x0, y0, x1, y1) {
    eor.plot((v, P) => { const A = P([x0, y0]), B = P([x1, y1]); v.plot(4, A[0], A[1]); v.plot(5, B[0], A[1]); v.plot(5, B[0], B[1]); v.plot(5, A[0], B[1]); v.plot(5, A[0], A[1]); }, true);
  }

  /** PLOT 189/190 (block copy / move, absolute): source OS rect (x0,y0)-(x1,y1) to (dx, dy). */
  function blockOp(s, move, x0, y0, x1, y1, dxo, dyo) {
    const pw = 1 << s.xeig, ph = 1 << s.yeig;
    let [a, b] = order(x0, x1), [c, d] = order(y0, y1);
    let sx0 = Math.floor(a / pw), sx1 = Math.floor(b / pw), sy0 = Math.floor(c / ph), sy1 = Math.floor(d / ph);
    const dx0 = Math.floor(dxo / pw), dy0 = Math.floor(dyo / ph);
    const W = sx1 - sx0 + 1, H = sy1 - sy0 + 1;
    const get = (x, y) => (inside(s, x, y) ? [pix(s, x, y), maskAt(s, x, y)] : null);
    const buf = [];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) buf.push(get(sx0 + i, sy0 + j));
    let box = null;
    if (move) {
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const x = sx0 + i, y = sy0 + j;
        if (!inside(s, x, y)) continue;
        setPix(s, x, y, 0); if (s.mask) setMask(s, x, y, 0);
      }
      box = { x0: Math.max(0, sx0), y0: Math.max(0, sy0), x1: Math.min(s.w, sx1 + 1), y1: Math.min(s.h, sy1 + 1) };
    }
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const v = buf[j * W + i], x = dx0 + i, y = dy0 + j;
      if (!v || !inside(s, x, y)) continue;
      setPix(s, x, y, v[0]); if (s.mask) setMask(s, x, y, v[1]);
    }
    box = union(box, { x0: Math.max(0, dx0), y0: Math.max(0, dy0), x1: Math.min(s.w, dx0 + W), y1: Math.min(s.h, dy0 + H) });
    return box.x1 > box.x0 && box.y1 > box.y0 ? box : null;
  }

  function copymove(move) {
    return {
      click(sw, m) {
        const s = sw.sprite, t = ts(s);
        if (m.bbits & BRIGHT) return;       // Adjust ignored
        if (t.state === 0) {
          if (m.bbits & BDRAGLEFT) { t.r = [m.x, m.y, m.x, m.y]; t.d = null; t.state = 1; app.redisplay(s); }
          return;
        }
        if (t.state === 2 || t.state === 3) {
          const [x0, y0, x1, y1] = t.r, [d0, e0, d1, e1] = t.d;
          app.undo(s);
          const box = blockOp(s, !!move, x0, y0, x1, y1, Math.min(d0, d1), Math.min(e0, e1));
          if (move) { t.state = 0; t.d = null; }
          app.edited(s, box);
        }
      },
      null(sw, m) {
        const s = sw.sprite, t = ts(s);
        if (t.state < 0 || !t.state) return;
        if (t.state === 1 && !(m.bbits & BLEFT)) {
          t.r[2] = m.x; t.r[3] = m.y;
          if (opt.exporting && !move) { /* copy tool exports too */ }
          if (opt.exporting) {
            const [a, b] = order(t.r[0], t.r[2]), [c, d] = order(t.r[1], t.r[3]);
            t.state = 0;
            app.redisplay(s);
            app.exportSprite(s, a, c, b, d);
            return;
          }
          t.d = [m.x, m.y, t.r[0], t.r[1]];
          t.state = 2;
          app.redisplay(s);
          return;
        }
        if (t.state === 1) { if (t.r[2] !== m.x || t.r[3] !== m.y) { t.r[2] = m.x; t.r[3] = m.y; app.redisplay(s); } return; }
        if (t.state === 3) {
          const nx = m.x - t.r[0], ny = m.y - t.r[1];
          if (t.d[0] !== nx || t.d[1] !== ny) { t.d = [nx, ny, nx + t.sz[0], ny + t.sz[1]]; app.redisplay(s); }
          return;
        }
        if (t.d[0] !== m.x || t.d[1] !== m.y) {
          t.d = [m.x, m.y, m.x + t.d[2] - t.d[0], m.y + t.d[3] - t.d[1]];
          app.redisplay(s);
        }
      },
      redraw(sw, eor) {
        const t = ts(sw.sprite);
        if (!t.state) return;
        if (t.state !== 3) rectEOR(eor, ...t.r);
        if (t.state >= 2 && t.d) rectEOR(eor, ...t.d);
      },
      stop(s) { const t = ts(s); if (t.state) { t.state = 0; app.redisplay(s); } },
    };
  }
  const camera = copymove(0), scissor = copymove(1);
  const grabber = {
    click(sw, m) {
      const s = sw.sprite, t = ts(s);
      if (t.state === 0 && (m.bbits & BDRAGLEFT)) {
        const W = s.w << s.xeig, H = s.h << s.yeig;
        t.r = [m.x, m.y, W, H]; t.sz = [W, H]; t.d = [0, 0, W, H]; t.state = 3;
        app.redisplay(s);
      }
    },
    null(sw, m) {
      const s = sw.sprite, t = ts(s);
      if (t.state !== 3) return;
      scissor.null(sw, m);
      if (!(m.bbits & BLEFT)) {
        app.undo(s);
        const box = blockOp(s, true, 0, 0, t.sz[0] - 1, t.sz[1] - 1, Math.min(t.d[0], t.d[2]), Math.min(t.d[1], t.d[3]));
        t.state = 0;
        app.edited(s, box ? { x0: 0, y0: 0, x1: s.w, y1: s.h } : null);
      }
    },
    redraw(sw, eor) { const t = ts(sw.sprite); if (t.state === 3 && t.d) rectEOR(eor, ...t.d); },
    stop(s) { scissor.stop(s); },
  };

  // ------------------------------------------------------------------ text
  let tx = 8, ty = 8, txs = 8, curText = '';
  /** set_text_parameters: pick up the tool box fields. Returns true if they changed. */
  function textParams() {
    const T = opt.text;
    const text = String(T.text ?? '').replace(/[\x00-\x1F].*$/s, '');
    const num = (str, d) => (/^\d+$/.test(String(str).trim()) ? parseInt(str, 10) : d);
    const nx = num(T.xsize, tx), ny = num(T.ysize, ty), ns = num(T.xspace, txs);
    const ch = text !== curText || nx !== tx || ny !== ty || ns !== txs;
    curText = text; tx = nx; ty = ny; txs = ns;
    return ch;
  }
  const textTool = {
    click(sw, m) {
      textParams();
      if (!(m.bbits & (BLEFT | BRIGHT))) return;
      const s = sw.sprite, t = ts(s);
      t.state = 2; t.last = null;
      app.undo(s);
      this.splot(sw, m);
      app.redisplay(s);
    },
    splot(sw, m) {
      const s = sw.sprite, t = ts(s);
      const pxs = 1 << s.xeig, pys = 1 << s.yeig;
      let x0 = m.x & ~(pxs - 1), y1 = m.y & ~(pys - 1);
      if (t.last && t.last[0] === x0 && t.last[1] === y1) return;
      t.last = [x0, y1];
      const c = m.bbits & BRIGHT ? s.st.gcol2 : s.st.gcol;
      x0 -= Math.trunc(((curText.length - 1) * txs + tx) * pxs / 2);
      y1 += Math.trunc(pys * ty / 2);
      if (!curText) return;
      const cov = plotText(s, curText, x0, y1, tx, ty, txs);
      const box = applyCoverage(s, cov, c, opt.mode);
      if (box) app.edited(s, box);
    },
    null(sw, m) {
      const s = sw.sprite, t = ts(s);
      if (textParams()) app.redisplayAll();
      if (!m.bbits || t.state !== 2) {
        const x = m.x & ~((1 << s.xeig) - 1), y = m.y & ~((1 << s.yeig) - 1);
        if (t.state !== 1 || t.at?.[0] !== x || t.at?.[1] !== y) { t.state = 1; t.at = [x, y]; app.redisplay(s); }
      } else this.splot(sw, m);
    },
    redraw(sw, eor) {
      const s = sw.sprite, t = ts(s);
      if (t.state !== 1 || !curText || !t.at) return;
      const z = sw.zoom;
      // size in screen pixels (mode scale * zoom)
      const sx = Math.trunc(tx * z.mul * (1 << s.xeig) / (z.div * 2)), sy = Math.trunc(ty * z.mul * (1 << s.yeig) / (z.div * 2)), sp = Math.trunc(txs * z.mul * (1 << s.xeig) / (z.div * 2));
      if (sx < 1 || sy < 1) return;
      eor.plot((v, P) => {
        const [X, Y] = P(t.at);
        const x0 = X - ((curText.length - 1) * sp + sx), y1 = Y + sy;
        v.gCharSizeX = sx; v.gCharSizeY = sy; v.gCharSpaceX = sp; v.gCharSpaceY = sy;
        v.vdu5 = true; v.plot(4, x0, y1);
        for (const ch of curText) { const cc = ch.charCodeAt(0) & 255; if (cc >= 32) v._printChar(cc); }
        v.vdu5 = false;
      });
    },
    stop(s) { const t = ts(s); t.state = 0; t.at = null; app.redisplay(s); },
  };

  // ------------------------------------------------------------------ brush ("Use sprite as brush")
  /** Brush coverage/colours: returns fn(cb) visiting dest pixels (x, y) with brush pixel (i, j). */
  function brushPlot(s, bx, by, cb) {
    const b = opt.brush.sprite;
    if (!b) return null;
    const sc = opt.brush.scale;
    // destination pixels per brush pixel = 2^beig / 2^deig * mul / div
    const xm = (1 << b.xeig) * sc.xmul, xd = (1 << s.xeig) * sc.xdiv;
    const ym = (1 << b.yeig) * sc.ymul, yd = (1 << s.yeig) * sc.ydiv;
    const halfW = Math.trunc(((b.w << b.xeig) * sc.xmul) / (sc.xdiv * 2)), halfH = Math.trunc(((b.h << b.yeig) * sc.ymul) / (sc.ydiv * 2));
    const ox = Math.floor((bx - halfW) / (1 << s.xeig)), oy = Math.floor((by - halfH) / (1 << s.yeig));
    const W = Math.trunc(b.w * xm / xd), H = Math.trunc(b.h * ym / yd);
    let box = null;
    for (let J = 0; J < H; J++) {
      const j = Math.trunc(J * yd / ym);
      if (j >= b.h) continue;
      for (let I = 0; I < W; I++) {
        const i = Math.trunc(I * xd / xm);
        if (i >= b.w) continue;
        const bi = (b.h - 1 - j) * b.w + i;
        if (b.mask && !b.mask[bi]) continue;
        const x = ox + I, y = oy + J;
        if (!inside(s, x, y)) continue;
        cb(x, y, b.px[bi]);
        box = union(box, { x0: x, y0: y, x1: x + 1, y1: y + 1 });
      }
    }
    return box;
  }
  const brush = {
    click(sw, m) {
      if (!(m.bbits & (BLEFT | BRIGHT)) || !opt.brush.sprite) return;
      const s = sw.sprite, t = ts(s);
      t.state = 2; t.last = null;
      app.undo(s);
      this.splot(sw, m);
      app.redisplay(s);
    },
    splot(sw, m) {
      const s = sw.sprite, t = ts(s);
      const x = m.x & ~((1 << s.xeig) - 1), y = m.y & ~((1 << s.yeig) - 1);
      if (t.last && t.last[0] === x && t.last[1] === y) return;
      t.last = [x, y];
      const nc = nColours(s), bits = pixBits(s), mode = opt.mode;
      const c = m.bbits & BRIGHT ? s.st.gcol2 : s.st.gcol;
      let tr = null;
      if (!opt.brush.useGcol) tr = translation(opt.brush.sprite, s, app.desktop(s));
      const box = brushPlot(s, x, y, (px, py, bv) => {
        if (opt.brush.useGcol) {
          if (c !== nc) setPix(s, px, py, (applyAction(mode, pix(s, px, py), colourAt(s, c, px, py)) & bits) >>> 0);
          if (s.mask) setMask(s, px, py, c !== nc);
        } else {
          setPix(s, px, py, (applyAction(mode, pix(s, px, py), tr(bv)) & bits) >>> 0);
          if (s.mask) setMask(s, px, py, 1);
        }
      });
      if (box) app.edited(s, box);
    },
    null(sw, m) {
      if (!opt.brush.sprite) return;
      const s = sw.sprite, t = ts(s);
      if (!m.bbits || t.state !== 2) {
        const x = m.x & ~((1 << s.xeig) - 1), y = m.y & ~((1 << s.yeig) - 1);
        if (t.state !== 1 || t.at?.[0] !== x || t.at?.[1] !== y) { t.state = 1; t.at = [x, y]; app.redisplay(s); }
      } else this.splot(sw, m);
    },
    redraw(sw, eor) {
      const s = sw.sprite, t = ts(s), b = opt.brush.sprite;
      if (t.state !== 1 || !b || !t.at) return;
      const sc = opt.brush.scale, z = sw.zoom;
      // screen pixels per brush pixel
      const fx = (1 << b.xeig) * sc.xmul * z.mul / (sc.xdiv * z.div * 2), fy = (1 << b.yeig) * sc.ymul * z.mul / (sc.ydiv * z.div * 2);
      eor.pixels((set, P) => {
        const [X, Y] = P(t.at);   // screen OS
        const W = Math.trunc(b.w * fx), H = Math.trunc(b.h * fy);
        const ox = Math.floor(X / 2) - (W >> 1), oy = Math.floor(Y / 2) - (H >> 1);
        for (let J = 0; J < H; J++) {
          const j = Math.trunc(J / fy);
          for (let I = 0; I < W; I++) {
            const i = Math.trunc(I / fx);
            const bi = (b.h - 1 - j) * b.w + i;
            if (b.mask && !b.mask[bi]) continue;
            set(ox + I, oy + J);
          }
        }
      });
    },
    stop(s) { const t = ts(s); t.state = 0; t.at = null; app.redisplay(s); },
  };

  const tools = {
    pixel, spray, fill, line: tabledriven([PLOT.line]),
    ellipseOutline: tabledriven([PLOT.line, PLOT.ellipse]), ellipse: tabledriven([PLOT.line, PLOT.ellipseFill]),
    circleOutline: tabledriven([PLOT.circle]), circle: tabledriven([PLOT.circleFill]),
    triangle: tabledriven([PLOT.line, PLOT.triangle]), arc: tabledriven([PLOT.line, PLOT.arc]),
    segment: tabledriven([PLOT.line, PLOT.segment]), sector: tabledriven([PLOT.line, PLOT.sector]),
    camera, scissor, text: textTool, grabber,
    rectangle: tabledriven([PLOT.rect]), rectangleOutline,
    parallelogram: tabledriven([PLOT.line, PLOT.parallelogram]), parallelogramOutline, brush,
  };
  const desc = { pixel: 'PntT1', circle: 'PntT2', line: 'PntT3', circleOutline: 'PntT4', triangle: 'PntT5', ellipse: 'PntT6', ellipseOutline: 'PntT7',
    segment: 'PntT8', sector: 'PntT9', arc: 'PntTA', parallelogram: 'PntTB', parallelogramOutline: 'PntTC', rectangle: 'PntTD', rectangleOutline: 'PntTE',
    fill: 'PntTF', scissor: 'PntTG', grabber: 'PntTH', camera: 'PntTI', text: 'PntTJ', spray: 'PntTK', brush: 'PntTL' };
  for (const [k, t] of Object.entries(tools)) { t.name = k; t.description = desc[k]; }
  return { tools, textParams, blockOp, applyCoverage };
}

/** Tool icons in the "toolwind" template -> tools (c.ToolWindow toolarray). */
export const TOOLARRAY = [null, 'pixel', 'spray', 'fill', 'line', 'ellipseOutline', 'ellipse', 'circleOutline', 'circle', 'triangle',
  'arc', 'segment', 'sector', 'camera', 'scissor', 'text', 'grabber', 'rectangle', 'rectangleOutline', 'parallelogram', 'parallelogramOutline', 'brush'];

/** Interactive help tokens for the tool window icons 1..27 (c.ToolWindow). */
export const TOOL_HELP = ['PntHT1', 'PntHT2', 'PntHTD', 'PntHT7', 'PntHTF', 'PntHTJ', 'PntHTE', 'PntHTI', 'PntHTA', 'PntHTG',
  'PntHTK', 'PntHTL', 'PntHT4', 'PntHT5', 'PntHTH', 'PntHT6', 'PntHTB', 'PntHT8', 'PntHTC', 'PntHT9',
  'PntHT3', null, null, 'PntHTM', 'PntHTN', 'PntHTO', 'PntHTP'];
