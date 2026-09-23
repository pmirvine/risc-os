// !Clock - an analogue clock in a window (Diversions). Port of the BBC BASIC original by Merlyn Kline
// (Minerva Software) / Philip Colmer (Acorn): Sources/Diversions/Clock/bas/!RunImage.
//
// The original draws with VDU primitives in the window: minute dots (POINT, Wimp colour 7), hour
// marks (RECTANGLE FILL, colour 8), the face (CIRCLE, colour 7), hour/minute hands as parallelograms
// (PLOT 117) and the second hand as a line, both plotted with GCOL 3 (EOR) chosen so that on the white
// background they show as Wimp colour 3 / 11 - overlapping hands EOR each other. We reproduce this
// exactly by rasterising into an 8 bpp framebuffer with the default 256-colour VIDC palette (the
// usual 3.71 desktop depth), using the same geometry in OS units.

import { loadMessages } from '../../core/messages.js';
import { os } from '../../core/os.js';

let PAL = null;          // vidc256 [r,g,b]
let WIMP2PIX = null;     // Wimp colour -> nearest 256-colour pixel value

async function palettes() {
  if (PAL) return;
  const p = await (await fetch('assets/palette.json')).json();
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  PAL = p.vidc256.map(rgb);
  WIMP2PIX = p.wimpHex.map((h) => {
    const [r, g, b] = rgb(h);
    let best = 0, bd = 1e9;
    PAL.forEach(([R, G, B], i) => { const d = (R - r) ** 2 + (G - g) ** 2 + (B - b) ** 2; if (d < bd) { bd = d; best = i; } });
    return best;
  });
}

/** A tiny VDU-like 8bpp framebuffer in OS units (origin = work area top-left, y up = negative). */
class Frame {
  constructor(w, h) { this.w = w; this.h = h; this.pix = new Uint8Array(w * h); this.col = 0; this.eor = false; }
  gcol(mode, wimpCol) {
    // GCOL 0 = set; GCOL 3 = EOR, value chosen so that EOR over Wimp colour 0 gives wimpCol
    this.eor = mode === 3;
    this.col = this.eor ? (WIMP2PIX[wimpCol & 15] ^ WIMP2PIX[0]) : WIMP2PIX[wimpCol & 15];
  }
  clear(wimpCol) { this.pix.fill(WIMP2PIX[wimpCol]); }
  _px(x, y) {             // pixel coordinates
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.pix[i] = this.eor ? this.pix[i] ^ this.col : this.col;
  }
  // OS units -> pixel (1 px = 2 OS units; OS y up from the work-area origin, i.e. negative downwards)
  X(x) { return Math.floor(x / 2); }
  Y(y) { return Math.floor(-y / 2); }
  point(x, y) { this._px(this.X(x), this.Y(y)); }
  hspan(y, xa, xb) { for (let x = Math.ceil(xa); x <= Math.floor(xb); x++) this._px(x, y); }
  rectFill(x, y, w, h) {
    const x0 = this.X(Math.min(x, x + w)), x1 = this.X(Math.max(x, x + w));
    const y0 = this.Y(Math.max(y, y + h)), y1 = this.Y(Math.min(y, y + h));
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) this._px(px, py);
  }
  circle(cx, cy, r) {
    // outline: midpoint circle in pixel space
    const X = cx / 2, Y = -cy / 2, R = Math.round(r / 2);
    let x = R, y = 0, e = 1 - R;
    const seen = new Set();
    const plot = (px, py) => { const k = px * 65536 + py; if (!seen.has(k)) { seen.add(k); this._px(Math.round(X + px), Math.round(Y + py)); } };
    while (x >= y) {
      plot(x, y); plot(y, x); plot(-y, x); plot(-x, y); plot(-x, -y); plot(-y, -x); plot(y, -x); plot(x, -y);
      y++;
      if (e < 0) e += 2 * y + 1; else { x--; e += 2 * (y - x) + 1; }
    }
  }
  circleFill(cx, cy, r) {
    const X = cx / 2, Y = -cy / 2, R = r / 2;
    for (let py = Math.ceil(Y - R); py <= Math.floor(Y + R); py++) {
      const d = Math.sqrt(Math.max(0, R * R - (py - Y) ** 2));
      this.hspan(py, Math.round(X - d), Math.round(X + d));
    }
  }
  line(x0, y0, x1, y1) {
    let ax = this.X(x0), ay = this.Y(y0); const bx = this.X(x1), by = this.Y(y1);
    const dx = Math.abs(bx - ax), dy = -Math.abs(by - ay), sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this._px(ax, ay);
      if (ax === bx && ay === by) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; ax += sx; }
      if (e2 <= dx) { err += dx; ay += sy; }
    }
  }
  /** Filled convex polygon (points in OS units), each pixel plotted once (so EOR works). */
  poly(pts) {
    const P = pts.map(([x, y]) => [x / 2, -y / 2]);
    const ys = P.map((p) => p[1]);
    for (let py = Math.floor(Math.min(...ys)); py <= Math.ceil(Math.max(...ys)); py++) {
      const yc = py + 0.5;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < P.length; i++) {
        const [xa, ya] = P[i], [xb, yb] = P[(i + 1) % P.length];
        if ((ya <= yc && yb > yc) || (yb <= yc && ya > yc)) {
          const x = xa + (yc - ya) * (xb - xa) / (yb - ya);
          lo = Math.min(lo, x); hi = Math.max(hi, x);
        }
      }
      if (lo <= hi) this.hspan(py, Math.round(lo), Math.round(hi) - 1 < Math.round(lo) ? Math.round(lo) : Math.round(hi) - 1);
    }
  }
  toCanvas(c) {
    c.width = this.w; c.height = this.h;
    const g = c.getContext('2d');
    const img = g.createImageData(this.w, this.h);
    const d = img.data;
    for (let i = 0; i < this.pix.length; i++) { const p = PAL[this.pix[i]]; d[i * 4] = p[0]; d[i * 4 + 1] = p[1]; d[i * 4 + 2] = p[2]; d[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
    return c;
  }
}

const SIN = [], COS = [];
for (let i = 0; i < 60; i++) { SIN[i] = Math.sin(i * 6 * Math.PI / 180); COS[i] = Math.cos(i * 6 * Math.PI / 180); }

// PROChand: a parallelogram from the centre, sides at +-6 degrees (PLOT 117)
function hand(f, A, X, Y, R) {
  const T = (R >> 1) / COS[1];
  const p1 = [X + SIN[(A + 1) % 60] * T, Y + COS[(A + 1) % 60] * T];
  const p2 = [X, Y];
  const p3 = [X + SIN[(A + 60 - 1) % 60] * T, Y + COS[(A + 60 - 1) % 60] * T];
  const p4 = [p1[0] + p3[0] - p2[0], p1[1] + p3[1] - p2[1]];
  f.poly([p2, p1, p4, p3]);
}

// PROCclock
function drawClock(f, H, M, S, R, X, Y) {
  f.gcol(0, 7);
  if (R > 150) {
    const T = R - (R >> 5) - 8;
    for (let i = 0; i < 60; i++) f.point(X + T * SIN[i], Y + T * COS[i]);
  }
  if (R > 50) {
    f.gcol(0, 8);
    const T = R - (R >> 4);
    for (let i = 0; i < 60; i += 5) f.rectFill(X + T * SIN[i] - (R >> 5), Y + T * COS[i] - (R >> 5), R >> 4, R >> 4);
  }
  f.gcol(0, 7);
  f.circle(X, Y, R);
  // PROChands
  f.gcol(3, 3);
  hand(f, H * 5 + Math.floor(M / 12), X, Y, R - (R >> 1));
  hand(f, M, X, Y, R - (R >> 2));
  f.gcol(3, 11);
  const s = S % 60, a = R >> 4;
  f.line(X + a * SIN[s], Y + a * COS[s], X + a * SIN[s] + (R - a) * SIN[s], Y + a * COS[s] + (R - a) * COS[s]);
  f.gcol(0, 11);
  f.circleFill(X, Y, R >> 4);
}

export default async function start(task, ctx) {
  const M = await loadMessages('Clock');
  await palettes();
  const off = document.createElement('canvas');

  // FNcwindow: DATA &BF000003,7,0, extent 0,-980,1280,0, visible 0,-400,400,0
  const w = task.createWindow({
    title: M.lookup('Clock'),
    flags: 0xBF000003,
    colours: { titleFg: 7, titleBg: 2, workFg: 7, workBg: 0, scrollOuter: 3, scrollInner: 1, titleFocus: 12 },
    extent: { x0: 0, y0: 0, x1: 640, y1: 490 },
    w: 200, h: 200,
    workButton: 3,
  });
  w.helpText = M.lookup('Help');

  const now = () => { const d = new Date(); return { h: d.getHours() % 12, m: d.getMinutes(), s: d.getSeconds() }; };

  w.useCanvas((g) => {
    // PROCcalcrxy
    const wOS = w.w * 2, hOS = w.h * 2;
    let r = Math.min(wOS, hOS) >> 1; r -= r >> 4;
    const x = wOS >> 1, y = -(hOS >> 1);
    const f = new Frame(w.w, w.h);
    f.clear(0);
    const t = now();
    drawClock(f, t.h, t.m, t.s, r, x, y);
    g.drawImage(f.toCanvas(off), 0, 0);
  });

  // IF handle%=clock%: scx%=0: scy%=0 - the clock never scrolls
  w.on('open', (ev) => { ev.preventDefault(); w.open({ ...ev, scrollX: 0, scrollY: 0 }); w.invalidate(); });
  w.on('close', () => { task.quit(); });

  // PROCpopup: centred on the pointer, top 64 OS units below it
  const mx = os.input?.mouseX ?? 300, my = os.input?.mouseY ?? 200;
  const scr = os.wimp.screenRect(true);
  const x = Math.max(4, Math.min(mx - 100, scr.w - 224));
  const y = Math.max(24, Math.min(my + 32, scr.h - 204));
  w.open({ x, y, w: 200, h: 200, scrollX: 0, scrollY: 0, behind: 'top' });

  // Null events once a second (Wimp_PollIdle to the next whole second)
  const tick = () => {
    if (!task.alive) return;
    w.invalidate();
    task.after(1000 - (Date.now() % 1000) + 5, tick);
  };
  tick();
  task.onMessage('Quit', () => task.quit());
}
