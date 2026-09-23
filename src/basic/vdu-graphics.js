// Graphics primitives for the VDU driver - direct ports of the RISC OS 3.71 kernel routines in
// vendor/ro371/Sources/OS_Core/Kernel/s/vdu/ (vduplot, vdugrafa .. vdugraff). The routine names in
// comments refer to the kernel source. All coordinates here are *internal* (pixel) coordinates:
// x to the right, y upwards from the bottom of the screen; screen row = YWindLimit - y.
//
// These functions are installed as methods on VDU.prototype (see vdu.js), so `this` is the VDU.
// Plotting always goes through an "OraEor" table (this.gcolAdr): for each of the 8 ECF rows and each
// pixel slot in a word, pixel := (pixel OR ora) EOR eor - exactly what the kernel does per word.

// ---------------------------------------------------------------------------------------------
// integer helpers

/** floor(sqrt(n)) for 0 <= n < 2^53 (SquareRoot / HellsTeeth produce exact floors) */
export function isqrt(n) {
  if (n <= 0) return 0;
  let r = Math.floor(Math.sqrt(n));
  while (r * r > n) r--;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}

/** DoubleMulDivSquareRoot: SQR(a*b/c) with a 64 bit intermediate */
function mulDivSqrt(a, b, c) {
  if (c === 0) return 0;
  const q = (BigInt(a >>> 0) * BigInt(b >>> 0)) / BigInt(c >>> 0);
  return isqrt(Number(q & 0xFFFFFFFFn));
}

// GenLineParm (vdugrafa): Bresenham control block
export function genLine(x0, y0, x1, y1) {
  let dx = x1 - x0, dy = y1 - y0;
  let bres = dy >= dx ? -1 : 0; // fudge so lines of gradient -1 match gradient 1
  const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
  dx = Math.abs(dx); dy = Math.abs(dy);
  bres += dy >= dx ? dy : dx;
  bres = (bres >> 1) - dy;
  return { x: x0, y: y0, bres, dx, dy, sx, sy, ex: x1, ey: y1 };
}

// AdvLineParm
export function advLine(L) {
  if (L.bres < 0) {
    L.y += L.sy;
    L.bres += L.dx;
    if (L.bres >= 0) { L.bres -= L.dy; L.x += L.sx; }
  } else {
    L.bres -= L.dy; L.x += L.sx;
  }
}

// GenArcTb (vdugrafb): quadrant control bytes for arcs / segments / sectors
const GenArcTb = [
  0x0000003A, 0x01010307, 0x03000007, 0x010A0007,
  0x00000E0A, 0x00001E00, 0x03000E01, 0x010A0E01,
  0x0E01010A, 0x0E010300, 0x1E000000, 0x0E0A0000,
  0x0007010A, 0x00070300, 0x03070101, 0x003A0000,
  0x01010157, 0x00001E00, 0x1E000000, 0x01570101,
  0x0000003A, 0x01017301, 0x73010101, 0x003A0000,
];

export const graphicsMethods = {

  // ---------------------------------------------------------------------------------------------
  // low level pixel plotting

  _inWindow(x, y) {
    return x >= this.gwl && x <= this.gwr && y >= this.gwb && y <= this.gwt;
  },

  /** plot with OraEor table oe at internal (x,y); no window check */
  _pixOE(x, y, oe) {
    const sr = this.yWL - y;
    const i = sr * this.W + x;
    const k = ((sr & 7) << this.ppwShift) | (x & this.ppwMask);
    this.fb[i] = (this.fb[i] | oe.ora[k]) ^ oe.eor[k];
    if (sr < this.dMin) this.dMin = sr;
    if (sr > this.dMax) this.dMax = sr;
  },

  // PlotPoint
  plotPoint(x, y) {
    if (x < this.gwl || x > this.gwr || y < this.gwb || y > this.gwt) return;
    const oe = this.gcolAdr;
    if (oe.nop) return;
    this._pixOE(x, y, oe);
  },

  // NewHLine: x0 <= x1 (sorted); clipped to the graphics window
  hline(x0, y, x1) {
    if (y > this.gwt || y < this.gwb || x0 > this.gwr || x1 < this.gwl || x0 > x1) return;
    const oe = this.gcolAdr;
    if (oe.nop) return;
    if (x0 < this.gwl) x0 = this.gwl;
    if (x1 > this.gwr) x1 = this.gwr;
    const sr = this.yWL - y, base = sr * this.W, fb = this.fb;
    if (oe.fill >= 0) {
      fb.fill(oe.fill, base + x0, base + x1 + 1);
    } else {
      const ora = oe.ora, eor = oe.eor, row = (sr & 7) << this.ppwShift, pm = this.ppwMask;
      for (let x = x0; x <= x1; x++) {
        const k = row | (x & pm);
        fb[base + x] = (fb[base + x] | ora[k]) ^ eor[k];
      }
    }
    if (sr < this.dMin) this.dMin = sr;
    if (sr > this.dMax) this.dMax = sr;
  },

  // HLine: sorts the coordinates first
  hlineU(xa, y, xb) {
    if (xa <= xb) this.hline(xa, y, xb); else this.hline(xb, y, xa);
  },

  // RectFillA: fill rectangle given two opposite corners
  rectFill(x0, y0, x1, y1) {
    if (x0 > x1) { const t = x0; x0 = x1; x1 = t; }
    if (y0 < y1) { const t = y0; y0 = y1; y1 = t; } // y0 = top
    if (this.gcolAdr.nop) return;
    const top = Math.min(y0, this.gwt), bot = Math.max(y1, this.gwb);
    for (let y = top; y >= bot; y--) this.hline(x0, y, x1);
  },

  // ---------------------------------------------------------------------------------------------
  // Lines (LineDrawSolid / LineDrawDotted in vdugraff)

  _nextDot() {
    const d = this.lineDot;
    if (d.cnt === 0) {
      d.lsw = this._dotLSW(); d.msw = this._dotMSW(); d.cnt = this.dotLineLength;
    }
    d.cnt--;
    const bit = d.msw >>> 31;
    d.msw = ((d.msw << 1) | (d.lsw >>> 31)) >>> 0;
    d.lsw = (d.lsw << 1) >>> 0;
    return bit;
  },

  lineDraw(k) {
    const solid = !(k & 16);
    if (solid && (k & 3) === 0) return; // no action: just shuffle the cursors
    const f = k ^ 0x18; // bit3: include last point, bit4: solid, bit5: exclude first point
    if (!solid && !(f & 0x20)) this.lineDot.cnt = 0; // restart the dot pattern
    let x0 = this.gcsIX, y0 = this.gcsIY, x1 = this.newX, y1 = this.newY;
    if (solid && y0 === y1) { // TryHLine
      let d = x1 >= x0 ? 1 : -1;
      if (f & 0x20) x0 += d;
      if (!(f & 8)) x1 -= d;
      if (x1 < x0) { const t = x0; x0 = x1; x1 = t; d = -d; if (d !== 1) return; }
      else if (x1 > x0 && d !== 1) return;
      this.hline(x0, y0, x1);
      return;
    }
    if (solid && x0 === x1) { // TryVLine (only for non-ECF actions)
      const a = (k & 3) === 1 ? this.gplfmd : (k & 3) === 2 ? 4 : this.gplbmd;
      if (a < 8) {
        let d = y1 >= y0 ? 1 : -1;
        if (f & 0x20) y0 += d;
        if (!(f & 8)) y1 -= d;
        if (y1 < y0) { const t = y0; y0 = y1; y1 = t; d = -d; if (d !== 1) return; }
        else if (y1 > y0 && d !== 1) return;
        const oe = this.gcolAdr;
        if (x0 < this.gwl || x0 > this.gwr) return;
        const ylo = Math.max(y0, this.gwb), yhi = Math.min(y1, this.gwt);
        for (let y = ylo; y <= yhi; y++) this._pixOE(x0, y, oe);
        return;
      }
    }
    // general case: CantUseHLineOrVLine
    let count = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) + 1;
    const L = genLine(x0, y0, x1, y1);
    if (f & 0x20) { advLine(L); count--; }
    if (!(f & 8)) count--;
    if (count <= 0) return;
    const oe = this.gcolAdr;
    for (let i = 0; i < count; i++) {
      const plot = solid ? true : this._nextDot();
      if (plot && !oe.nop && L.x >= this.gwl && L.x <= this.gwr && L.y >= this.gwb && L.y <= this.gwt) {
        this._pixOE(L.x, L.y, oe);
      }
      advLine(L);
    }
  },

  // ---------------------------------------------------------------------------------------------
  // Triangles and parallelograms (vdugrafa)

  // TrapLineStep: step line until CurrentY about to change (or at its end); widen limits
  _trapLineStep(L, lim) {
    if (L.ey === L.y) L.x = L.ex;
    else {
      while (L.bres >= 0) { L.x += L.sx; L.bres -= L.dy; }
    }
    if (L.x < lim.l) lim.l = L.x;
    if (L.x > lim.r) lim.r = L.x;
  },

  // TrapFill
  _trapFill(T1, T2, endY, lim) {
    for (;;) {
      this._trapLineStep(T1, lim);
      this._trapLineStep(T2, lim);
      if (endY === T2.y) return;
      this.hline(lim.l, T2.y, lim.r);
      advLine(T1);
      lim.l = T1.x;
      advLine(T2);
      if (T2.x >= lim.l) lim.r = T2.x; else { lim.r = lim.l; lim.l = T2.x; }
    }
  },

  // LowerTri: sort 3 vertices by Y (CompSwapT) and fill the lower part
  _lowerTri(v) {
    const cs = (a, b) => { if (v[a][1] > v[b][1]) { const t = v[a]; v[a] = v[b]; v[b] = t; } };
    cs(0, 1); cs(1, 2); cs(0, 1);
    const lim = { l: v[0][0], r: v[0][0] };
    const T1 = genLine(v[0][0], v[0][1], v[1][0], v[1][1]);
    const T2 = genLine(v[0][0], v[0][1], v[2][0], v[2][1]);
    this._trapFill(T1, T2, T1.ey, lim);
    return { lim, T2 };
  },

  // TriangleFill: OldCs, ICursor, NewPt
  triangleFill() {
    if (this.gcolAdr.nop) return;
    const v = [[this.oldX, this.oldY], [this.gcsIX, this.gcsIY], [this.newX, this.newY]];
    const { lim, T2 } = this._lowerTri(v);
    const T1 = genLine(v[1][0], v[1][1], v[2][0], v[2][1]);
    this._trapFill(T1, T2, T1.ey, lim);
    this.hline(lim.l, T2.y, lim.r);
  },

  // ParallelogramFill: OldCs, ICursor, NewPt are three vertices; the fourth is derived
  parallelogramFill() {
    if (this.gcolAdr.nop) return;
    const x1 = this.oldX, y1 = this.oldY, x2 = this.gcsIX, y2 = this.gcsIY, x3 = this.newX, y3 = this.newY;
    const v = [[x1, y1], [x2, y2], [x3, y3], [x1 + x3 - x2, y1 + y3 - y2]];
    const cs = (a, b) => { if (v[a][1] > v[b][1]) { const t = v[a]; v[a] = v[b]; v[b] = t; } };
    cs(0, 1); cs(1, 2); cs(2, 3); // highest point into v[3]
    const tri = [v[0], v[1], v[2]];
    const { lim, T2 } = this._lowerTri(tri); // sorts tri: Vertex1..3
    // restart TLine1 from Vertex2 to Vertex4; TEndY = Vertex3Y
    let T1 = genLine(tri[1][0], tri[1][1], v[3][0], v[3][1]);
    this._trapFill(T1, T2, tri[2][1], lim);
    // restart TLine2 from Vertex3 to Vertex4, fill upper triangle
    const T2b = genLine(tri[2][0], tri[2][1], v[3][0], v[3][1]);
    this._trapFill(T1, T2b, T2b.ey, lim);
    this.hline(lim.l, T2b.y, lim.r);
  },

  // ---------------------------------------------------------------------------------------------
  // Circles (vduplot GenCircleParm / AdvCircleParm, vdugrafb)

  _genCircle(cx, cy, px, py) {
    const aspect = this.aspect;
    let dx = px - cx; if (aspect === 1) dx <<= 1;
    let dy = py - cy; if (aspect === 2) dy <<= 1;
    const raw = (Math.imul(dx, dx) + Math.imul(dy, dy)) >>> 0;
    const radsq = (raw + isqrt(raw)) >>> 0;
    this.circleRadSquare = radsq;
    const rad = isqrt(radsq);
    const c = { x: rad, y: 0, sum: (radsq - Math.imul(rad, rad)) | 0, up: 1, down: 2 * rad - 1, cx, cy, aspect };
    if (aspect === 1) { c.x >>= 1; c.sum += c.down; c.down -= 2; }
    else if (aspect === 2) { c.sum -= c.up; c.up += 2; }
    return c;
  },

  /** AdvCircleParm - returns true if y changed */
  _advCircle(c) {
    if (c.sum < c.up) {
      c.x--; c.sum += c.down; c.down -= 2;
      if (c.aspect & 1) { c.sum += c.down; c.down -= 2; }
      if (c.sum < c.up) return false;
    }
    c.y++; c.sum -= c.up; c.up += 2;
    if (c.aspect & 2) { c.sum -= c.up; c.up += 2; }
    return true;
  },

  // CircleOutline: ICursor = centre, NewPt = point on circumference
  circleOutline() {
    if (this.gcolAdr.nop) return;
    const c = this._genCircle(this.gcsIX, this.gcsIY, this.newX, this.newY);
    for (;;) {
      const l = c.cx - c.x, r = c.cx + c.x;
      this.plotPoint(r, c.cy + c.y);
      if (l !== r) this.plotPoint(l, c.cy + c.y);
      if (c.y !== 0) {
        this.plotPoint(r, c.cy - c.y);
        if (l !== r) this.plotPoint(l, c.cy - c.y);
      }
      if (c.x === 0) return;
      this._advCircle(c);
    }
  },

  // CircleFill
  circleFill() {
    if (this.gcolAdr.nop) return;
    const c = this._genCircle(this.gcsIX, this.gcsIY, this.newX, this.newY);
    for (;;) {
      const up = c.cy + c.y, lo = c.cy - c.y;
      this.hline(c.cx - c.x, up, c.cx + c.x);
      if (lo !== up) this.hline(c.cx - c.x, lo, c.cx + c.x);
      for (;;) {
        if (c.x === 0) return;
        if (this._advCircle(c)) break;
      }
    }
  },

  // GenArcParmBlk: circle centre OldCs through ICursor; CLine0 = OldCs->ICursor, CLine1 = OldCs->NewPt
  _genArc() {
    const a = this.arc = {};
    a.c = this._genCircle(this.oldX, this.oldY, this.gcsIX, this.gcsIY);
    const L0 = a.L0 = genLine(this.oldX, this.oldY, this.gcsIX, this.gcsIY);
    const q0 = (L0.sx & 4) | (L0.sy & 8);
    let ex = this.newX, ey = this.newY;
    if (this.oldX === ex && this.oldY === ey) ex++; // Master compatibility
    const L1 = a.L1 = genLine(this.oldX, this.oldY, ex, ey);
    const q1 = (L1.sx & 4) | (L1.sy & 8);
    let idx;
    if (q0 !== q1) idx = q0 | (q1 << 2);
    else {
      const p = Math.imul(L0.dx, L1.dy), q = Math.imul(L0.dy, L1.dx);
      idx = p < q ? (q1 | 0x40) : p > q ? (q1 | 0x50) : (q1 | (q1 << 2));
    }
    const w = GenArcTb[idx >> 2];
    a.control = [w & 0xFF, (w >>> 8) & 0xFF, (w >>> 16) & 0xFF, (w >>> 24) & 0xFF];
    a.state = [0, 0, 0, 0];
    a.draw = [0, 0, 0, 0];
    a.pt = [[0, 0], [0, 0], [0, 0], [0, 0]];
    return a;
  },

  // Reflect
  _reflect(a) {
    const c = a.c, p = a.pt;
    p[0][0] = c.cx + c.x; p[0][1] = c.cy + c.y;
    p[1][0] = c.cx - c.x; p[1][1] = c.cy + c.y;
    p[2][0] = c.cx - c.x; p[2][1] = c.cy - c.y;
    p[3][0] = c.cx + c.x; p[3][1] = c.cy - c.y;
  },

  // ArcLineStep: returns 0 within, 1 on, 2 outside circle; L.ex := nearX
  _arcLineStep(L, cx, cy) {
    while (L.y !== cy) advLine(L);
    L.ex = L.x; // nearX
    if (L.x === cx) return 1;
    if ((L.x - cx < 0) === (L.sx < 0)) { L.x = cx; return 2; } // moving away: outside
    for (;;) {
      if (L.bres >= 0) { L.bres -= L.dy; L.x += L.sx; }
      if (L.x === cx) return 1;
      if (L.bres < 0) return 0;
    }
  },

  // UpdateQuadrants / UpdateQuadr10
  _updateQuadrants(a) {
    a.state[0] = a.state[1] = a.state[2] = a.state[3] = 0;
    for (let q = 0; q < 4; q++) a.draw[q] = a.control[q];
    for (let q = 0; q < 4; q++) {
      let r0 = a.control[q];
      if (!(r0 & 2)) continue;
      const p = a.pt[q];
      let r7 = this._arcLineStep((r0 & 4) ? a.L1 : a.L0, p[0], p[1]);
      if (r7 >= 1) a.state[q] = 1;
      r0 = a.control[q] >> 3;
      if (r7 >= 1) a.control[q] = r0;
      if (r7 === 2 || (r7 === 1 && (r0 & 1))) a.draw[q] = r0;
      if (!(r0 & 2)) continue;
      const saved = r0;
      r7 = this._arcLineStep((r0 & 4) ? a.L1 : a.L0, p[0], p[1]);
      if (r7 >= 1) a.state[q] = 2;
      r0 = saved >> 3;
      if (r7 >= 1) a.control[q] = r0;
      if (r7 === 2) a.draw[q] = r0;
    }
  },

  // CircleArc: OldCs centre, ICursor start, NewPt end
  circleArc() {
    if (this.gcolAdr.nop) return;
    const a = this._genArc(), c = a.c;
    for (;;) {
      this._reflect(a);
      this._updateQuadrants(a);
      if (a.draw[0] & 1) this.plotPoint(a.pt[0][0], a.pt[0][1]);
      if (c.x !== 0 && (a.draw[1] & 1)) this.plotPoint(a.pt[1][0], a.pt[1][1]);
      if (c.y !== 0) {
        if (a.draw[3] & 1) this.plotPoint(a.pt[3][0], a.pt[3][1]);
        if (c.x !== 0 && (a.draw[2] & 1)) this.plotPoint(a.pt[2][0], a.pt[2][1]);
      }
      if (c.x === 0) return;
      this._advCircle(c);
    }
  },

  // GenSegParmBlk
  _genSeg(a) {
    const L = a.L1;
    let dx = L.dx, dy = L.dy;
    if (this.aspect === 1) dx <<= 1; else if (this.aspect === 2) dy <<= 1;
    const r8 = this.circleRadSquare;
    const dx2 = Math.imul(dx, dx) >>> 0, dy2 = Math.imul(dy, dy) >>> 0, r2 = (dx2 + dy2) >>> 0;
    let iy = mulDivSqrt(dy2, r8, r2), ix = mulDivSqrt(dx2, r8, r2);
    if (this.aspect === 1) ix >>>= 1; else if (this.aspect === 2) iy >>>= 1;
    let x0 = L.sx >= 0 ? L.x + ix : L.x - ix;
    let y0 = L.sy >= 0 ? L.y + iy : L.y - iy;
    let x1 = a.L0.ex, y1 = a.L0.ey;
    if (y0 > y1) { let t = x0; x0 = x1; x1 = t; t = y0; y0 = y1; y1 = t; } // CompSwapT
    const w = a.control;
    const up = (w[0] | w[1]) & 2, lo = (w[2] | w[3]) & 2;
    if (up && lo) { // segment line crosses the X axis: start both lines now
      a.L2 = genLine(x0, y0, x1, y1);
      a.upper = a.L2;
      a.L3 = genLine(x1, y1, x0, y0);
      a.lower = a.L3;
    } else {
      a.L2 = { x: x1, y: y1 }; a.L3 = { x: x0, y: y0 };
      a.upper = a.lower = null;
    }
  },

  // SegmentLineO5
  _segLineO5(a, q, which) {
    const sc = a.state[q];
    if (sc === 0) return;
    if (a[which]) return;
    const key = which === 'upper' ? 'L2' : 'L3';
    const tgt = a[key];
    a[key] = genLine(a.pt[q][0], a.pt[q][1], tgt.x, tgt.y);
    a[which] = a[key];
    a.state[q] = sc >> 1;
  },

  // SegLineStep: returns [left, right] limited to r7..r8
  _segLineStep(L, r7, r8, r9) {
    let left;
    if (L.dy === 0) {
      left = L.ex;
    } else {
      while (r9 !== L.y) advLine(L);
      left = L.x;
      if (L.ex !== L.x) {
        for (;;) {
          if (L.bres >= 0) { L.bres -= L.dy; L.x += L.sx; }
          if (L.ex === L.x) break;
          if (L.bres < 0) break;
        }
      }
    }
    let right;
    if (left > L.x) { right = left; left = L.x; } else right = L.x;
    if (r8 < right) right = r8;
    if (r7 > right) right = r7;
    if (r7 > left) left = r7;
    if (r8 < left) left = r8;
    return [left, right];
  },

  // SegmentSlice
  _segSlice(x0, y, x2, d3, d4, r7, r8) {
    if (!(d3 & 1) && !(d4 & 1)) return;
    if ((d3 & 1) && (d4 & 1)) this.hlineU(x0, y, x2);
    else if (!(d3 & 1)) this.hlineU(r7, y, x2);
    else this.hlineU(x0, y, r8);
  },

  // SegmentFill: OldCs centre, ICursor start, NewPt end
  segmentFill() {
    if (this.gcolAdr.nop) return;
    const a = this._genArc(), c = a.c;
    this._genSeg(a);
    for (;;) {
      this._reflect(a);
      this._updateQuadrants(a);
      const any = () => a.state[0] | a.state[1] | a.state[2] | a.state[3];
      if (any()) { // SegmentLineOn
        this._segLineO5(a, 0, 'upper'); this._segLineO5(a, 1, 'upper');
        this._segLineO5(a, 2, 'lower'); this._segLineO5(a, 3, 'lower');
      }
      let r7 = a.pt[1][0], r8 = a.pt[0][0];
      if (a.upper) [r7, r8] = this._segLineStep(a.upper, r7, r8, a.pt[1][1]);
      this._segSlice(a.pt[1][0], a.pt[1][1], a.pt[0][0], a.draw[1], a.draw[0], r7, r8);
      if (c.y !== 0) {
        r7 = a.pt[2][0]; r8 = a.pt[3][0];
        if (a.lower) [r7, r8] = this._segLineStep(a.lower, r7, r8, a.pt[3][1]);
        const t = r7; r7 = r8; r8 = t;
        this._segSlice(a.pt[3][0], a.pt[3][1], a.pt[2][0], a.draw[3], a.draw[2], r7, r8);
      }
      if (any()) { // SegmentLineOff
        if ((a.state[0] & 3) || (a.state[1] & 3)) a.upper = null;
        if ((a.state[2] & 3) || (a.state[3] & 3)) a.lower = null;
      }
      for (;;) {
        if (c.x === 0) return;
        if (this._advCircle(c)) break;
      }
    }
  },

  // SectorSlice
  _sectorSlice(a, x0, y, x2, d3, d4) {
    const L0 = a.L0, L1 = a.L1;
    const dbl = (p, q) => { this.hlineU(x0, y, p); this.hlineU(q, y, x2); };
    if (d4 === 0x57) return dbl(L0.x, L1.ex);
    if (d3 === 0x73) return dbl(L0.ex, L1.x);
    if (d4 === 0x07 && d3 === 0x03) return dbl(L0.ex, L1.ex);
    if (d4 === 0x07) return this.hlineU(L1.ex, y, x2);
    if (d3 === 0x03) return this.hlineU(x0, y, L0.ex);
    if (d4 === 0x3A) return this.hlineU(L1.ex, y, L0.x);
    if (d3 === 0x1E) return this.hlineU(L1.x, y, L0.ex);
    if (d4 < 1) return;
    if (d4 > 1) x2 = L0.x;
    if (d3 > 1) x0 = L1.x;
    this.hlineU(x0, y, x2);
  },

  // SectorFill: OldCs centre, ICursor start, NewPt end
  sectorFill() {
    if (this.gcolAdr.nop) return;
    const a = this._genArc(), c = a.c;
    for (;;) {
      this._reflect(a);
      this._updateQuadrants(a);
      if (c.y === 0) { // SectorFi40
        const n0 = a.L0.ex, f0 = a.L0.x, f1 = a.L1.x;
        let r2 = Math.max(n0, f0, f1), r0 = Math.min(n0, f0, f1);
        if ((a.draw[0] & 1) || (a.draw[3] & 1)) r2 = a.pt[0][0];
        if ((a.draw[1] & 1) || (a.draw[2] & 1)) r0 = a.pt[1][0];
        this.hlineU(r0, a.pt[0][1], r2);
      } else {
        this._sectorSlice(a, a.pt[1][0], a.pt[1][1], a.pt[0][0], a.draw[1], a.draw[0]);
        this._sectorSlice(a, a.pt[3][0], a.pt[3][1], a.pt[2][0], a.draw[3], a.draw[2]);
      }
      for (;;) {
        if (c.x === 0) return;
        if (this._advCircle(c)) break;
      }
    }
  },

  // ---------------------------------------------------------------------------------------------
  // Ellipses (vdugrafc). OldCs = centre, ICursor gives the width, NewPt the top point (and shear).

  _advEllP20(e) {
    const n = (e.max - e.ysq) >>> 0;
    const v = isqrt(n * 65536); // HellsTeeth with 24 iterations: [0bb.b]
    const r9 = Math.imul(e.slice, v);
    const nr = ((e.xoff + r9) | 0) + 0x8000 >> 16;
    const nl = ((e.xoff - r9) | 0) + 0x8000 >> 16;
    e.ysq = (e.ysq + e.odd) | 0; e.odd += 2; e.xoff = (e.xoff + e.shear) | 0; e.cnt--; e.y++;
    return [nl, nr];
  },

  // GenEllParm: returns ellipse state or null if drawn as a single line
  _genEll() {
    const cx = this.oldX, cy = this.oldY;
    const w = Math.abs(this.gcsIX - cx);
    let h = this.newY - cy;
    let sgn = h;
    h = Math.abs(h);
    if (h === 0) { // EllipseZeroHeight
      this.hline(cx - w, cy, cx + w);
      return null;
    }
    let shear = this.newX - cx;
    sgn ^= shear;
    shear = Math.abs(shear);
    let shearPer = Math.floor(((shear << 16) >>> 0) / h);
    if (sgn < 0) shearPer = -shearPer;
    const e = {
      cx, cy, cnt: h, ysq: 0, odd: 1, xoff: 0, y: -2, shear: shearPer | 0,
      slice: Math.floor(((w << 8) >>> 0) / h), max: Math.imul(h, h) >>> 0,
    };
    let [nl, nr] = this._advEllP20(e);
    let thisL = nl, thisR = nr;
    [nl, nr] = this._advEllP20(e);
    const prevL = -nr, prevR = -nl;
    thisL = Math.min(thisL, prevR, nr);
    thisR = Math.max(thisR, prevL, nl);
    Object.assign(e, { prevL, prevR, thisL, thisR, nextL: nl, nextR: nr });
    return e;
  },

  _advEll(e) {
    const [nl, nr] = this._advEllP20(e);
    e.prevL = e.thisL; e.prevR = e.thisR;
    e.thisL = Math.min(e.nextL, nr);
    e.thisR = Math.max(e.nextR, nl);
    e.nextL = nl; e.nextR = nr;
  },

  // EllHLine: draw a slice and its reflection about the centre
  _ellHLine(e, l, y, r) {
    this.hline(e.cx + l, e.cy + y, e.cx + r);
    if (y === 0) return;
    this.hline(e.cx - r, e.cy - y, e.cx - l);
  },

  ellipseOutline() {
    if (this.gcolAdr.nop) return;
    const e = this._genEll();
    if (!e) return;
    for (;;) {
      const r3 = Math.max(Math.max(e.prevL, e.nextL) - 1, e.thisL);
      const r4 = Math.min(Math.min(e.prevR, e.nextR) + 1, e.thisR);
      if (r3 >= r4) this._ellHLine(e, e.thisL, e.y, e.thisR);
      else { this._ellHLine(e, e.thisL, e.y, r3); this._ellHLine(e, r4, e.y, e.thisR); }
      if (e.cnt < 0) break;
      this._advEll(e);
    }
    this._ellHLine(e, e.nextL, e.y + 1, e.nextR);
  },

  ellipseFill() {
    if (this.gcolAdr.nop) return;
    const e = this._genEll();
    if (!e) return;
    for (;;) {
      this._ellHLine(e, e.thisL, e.y, e.thisR);
      if (e.cnt < 0) break;
      this._advEll(e);
    }
    this._ellHLine(e, e.nextL, e.y + 1, e.nextR);
  },

  // ---------------------------------------------------------------------------------------------
  // Line fills and flood fills (vdugrafe)

  /** is pixel (x,y) fillable w.r.t. delimiter table (FgEcf/BgEcf pixels); non: fill while == delim */
  _fillable(x, y, delim, non) {
    const sr = this.yWL - y;
    const v = this.fb[sr * this.W + x];
    const d = delim[((sr & 7) << this.ppwShift) | (x & this.ppwMask)];
    return non ? v === d : v !== d;
  },

  // FillLineRight: from x (known fillable) rightwards; returns rightmost filled x
  _fillRight(x, y, delim, non) {
    const oe = this.gcolAdr;
    let xx = x;
    while (xx <= this.gwr && this._fillable(xx, y, delim, non)) xx++;
    if (!oe.nop && xx > x) this.hline(x, y, xx - 1);
    return xx - 1;
  },

  // FillLineLeft: from x-1 leftwards; returns leftmost filled x (x if none)
  _fillLeft(x, y, delim, non) {
    const oe = this.gcolAdr;
    let xx = x - 1;
    while (xx >= this.gwl && this._fillable(xx, y, delim, non)) xx--;
    if (!oe.nop && xx + 1 <= x - 1) this.hline(xx + 1, y, x - 1);
    return xx + 1;
  },

  // FillAlong2
  _fillAlong(x, y, delim, non) {
    if (!this._inWindow(x, y) || !this._fillable(x, y, delim, non)) return null;
    const right = this._fillRight(x, y, delim, non);
    const left = this._fillLeft(x, y, delim, non);
    return { left, right };
  },

  // FillLRnonBg (72) / FillLRtoFg (104)
  fillLR(delim, non) {
    const x = this.newX, y = this.newY;
    const res = this._fillAlong(x, y, delim, non);
    if (!res) { this.gcsIX = x; this.gcsIY = y - 1; return; }
    this.gcsIX = res.left; this.gcsIY = y;
    this.newX = res.right;
    this._iegb(res.right, y);
  },

  // FillLRtoBg (88) / FillLRnonFg (120) - really only fill right
  fillRightOnly(delim, non) {
    const x = this.newX, y = this.newY;
    this.gcsIX = x; this.gcsIY = y;
    let r;
    if (!this._inWindow(x, y) || !this._fillable(x, y, delim, non)) r = x - 1;
    else r = this._fillRight(x, y, delim, non);
    this.newX = r;
    this._iegb(r, y);
  },

  // FloodNonBg (128) / FloodToFg (136): 4-connected scan line flood
  floodFill(delim, non) {
    const x0 = this.newX, y0 = this.newY;
    if (!this._inWindow(x0, y0) || !this._fillable(x0, y0, delim, non)) return;
    const W = this.W, seen = new Uint8Array(W * this.H);
    const stack = [x0, y0];
    const oe = this.gcolAdr;
    const ok = (x, y) => !seen[(this.yWL - y) * W + x] && this._fillable(x, y, delim, non);
    while (stack.length) {
      const y = stack.pop(), x = stack.pop();
      if (!ok(x, y)) continue;
      let l = x, r = x;
      while (l - 1 >= this.gwl && ok(l - 1, y)) l--;
      while (r + 1 <= this.gwr && ok(r + 1, y)) r++;
      const base = (this.yWL - y) * W;
      for (let i = l; i <= r; i++) seen[base + i] = 1;
      if (!oe.nop) this.hline(l, y, r);
      for (const ny of [y + 1, y - 1]) {
        if (ny < this.gwb || ny > this.gwt) continue;
        let inRun = false;
        for (let i = l; i <= r; i++) {
          if (ok(i, ny)) { if (!inRun) { stack.push(i, ny); inRun = true; } }
          else inRun = false;
        }
      }
    }
  },

  // ---------------------------------------------------------------------------------------------
  // Block copy / move (vdugrafd): OldCs, ICursor = source corners, NewPt = destination bottom left

  blockCopyMove(k) {
    if ((k & 3) === 0) return;
    const saved = this.gcolAdr;
    this.gcolAdr = this.bgStore;
    const copy = (k & 2) !== 0;
    let sl = Math.min(this.oldX, this.gcsIX), sr = Math.max(this.oldX, this.gcsIX);
    let sb = Math.min(this.oldY, this.gcsIY), st = Math.max(this.oldY, this.gcsIY);
    let dl = this.newX, db = this.newY, dr = sr - sl + dl, dt = st - sb + db;
    const U = { sl, sb, sr, st, dl, db, dr, dt };
    const gwl = this.gwl, gwr = this.gwr, gwb = this.gwb, gwt = this.gwt;
    let d2 = null, d3 = null;
    const done = () => { this.gcolAdr = saved; };
    // window the destination
    let t = gwl - dl; if (t > 0) { dl += t; sl += t; }
    t = dr - gwr; if (t > 0) { dr -= t; sr -= t; }
    if (dr >= dl) {
      d2 = [dl, 0, dr, 0];
      t = gwl - sl; if (t > 0) { sl += t; dl += t; }
      t = sr - gwr; if (t > 0) { sr -= t; dr -= t; }
      t = gwb - db; if (t > 0) { db += t; sb += t; }
      t = dt - gwt; if (t > 0) { dt -= t; st -= t; }
      if (dt >= db) {
        d2[1] = db; d2[3] = dt;
        t = gwb - sb; if (t > 0) { sb += t; db += t; }
        t = st - gwt; if (t > 0) { st -= t; dt -= t; }
        d3 = [dl, db, dr, dt];
        if (sr >= sl && st >= sb) {
          // copy the pixels (handling overlap)
          const W = this.W, fb = this.fb, w = sr - sl + 1;
          const rows = st - sb + 1;
          const tmp = new Uint8Array(w * rows);
          for (let j = 0; j < rows; j++) {
            const srow = (this.yWL - (sb + j)) * W;
            tmp.set(fb.subarray(srow + sl, srow + sl + w), j * w);
          }
          for (let j = 0; j < rows; j++) {
            const drow = this.yWL - (db + j);
            fb.set(tmp.subarray(j * w, j * w + w), drow * W + dl);
            this._dirtyRows(drow, drow);
          }
        }
        this._eraseDifference(d2, d3);
      }
    }
    // EraseSource (moves only)
    if (!copy) {
      let { sl: a0, sb: a1, sr: a2, st: a3, dl: b0, db: b1, dr: b2, dt: b3 } = U;
      t = gwl - a0; if (t > 0) { a0 += t; b0 += t; }
      t = a2 - gwr; if (t > 0) { a2 -= t; b2 -= t; }
      if (a2 >= a0) {
        t = gwb - a1; if (t > 0) { a1 += t; b1 += t; }
        t = a3 - gwt; if (t > 0) { a3 -= t; b3 -= t; }
        if (a3 >= a1) {
          if (b3 >= a3) b3 = a3; else b1 = a1;
          if (b2 >= a2) b2 = a2; else b0 = a0;
          this._eraseDifference([a0, a1, a2, a3], [b0, b1, b2, b3]);
        }
      }
    }
    done();
  },

  // EraseDifference: erase rect r2 minus rect r3 (sharing at least one vertical & horizontal edge)
  _eraseDifference(r2, r3) {
    let [r0, r1, rr2, rr3] = r2;
    const [r4, r5, r6, r7] = r3;
    if (!(r6 >= r4 && r7 >= r5)) { this.rectFill(r0, r1, rr2, rr3); return; }
    // flat rectangle
    {
      let top = rr3, bot = r1;
      if (rr3 === r7) top = r5 - 1; else bot = r7 + 1;
      if (top >= bot) this.rectFill(r0, bot, rr2, top);
    }
    // tall rectangle
    {
      let top = rr3, bot = r1, left = r0, right = rr2;
      if (rr3 === r7) bot = r5; else top = r7;
      if (r0 === r4) left = r6 + 1; else right = r4 - 1;
      if (top >= bot && right >= left) this.rectFill(left, bot, right, top);
    }
  },
};
