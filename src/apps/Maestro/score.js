// Score layout and drawing for Maestro, following the original's geometry (PROCJ, PROCK/PROCab/
// PROCbb, PROCdb/PROCeb): everything is computed in OS units (y up, like the BASIC) and
// converted to work-area pixels (y down) only when plotting.

import { channelStaves, KEYPOS } from './format.js';

// The sprite table (DATA in !RunImage): name, hotspot x (mode 12 pixels), hotspot y, width, height
const DATA = [
  ['B', 7, 3, 26, 7], ['SB', 0, 2, 12, 5], ['Mu', 0, 2, 11, 15], ['Cu', 0, 2, 11, 15], ['Qu', 0, 2, 17, 17], ['SQu', 0, 2, 17, 17], ['DSQu', 0, 2, 17, 17], ['SDSQu', 0, 2, 17, 17],
  ['B', 7, 3, 26, 7], ['SB', 0, 2, 12, 5], ['Md', 0, 12, 11, 15], ['Cd', 0, 12, 11, 15], ['Qd', 0, 14, 11, 17], ['SQd', 0, 14, 11, 17], ['DSQd', 0, 14, 11, 17], ['SDSQd', 0, 14, 11, 17],
  ['Rest', -1, -1, 8, 4], ['Rest', -1, -2, 8, 4], ['Rest', -1, 0, 8, 4], ['Rest4', -2, 5, 7, 12], ['Rest8', -1, 4, 9, 8], ['Rest16', 0, 8, 11, 12], ['Rest32', 1, 8, 13, 16], ['Rest64', 2, 12, 15, 20],
  ['M', 0, 2, 11, 5], ['Natural', 8, 6, 7, 13], ['Sharp', 10, 5, 9, 11], ['Flat', 8, 3, 7, 12], ['Sharp2', 9, 2, 8, 5], ['Flat2', 14, 3, 13, 12], ['NSharp', 17, 6, 16, 13], ['NFlat', 15, 6, 14, 15],
  ['Treble', 0, 16, 18, 31], ['Alto', 0, 8, 16, 19], ['Alto', 0, 4, 16, 19], ['Bass', 0, 7, 20, 17],
  ['Bh', 7, 3, 26, 7], ['SBh', 0, 2, 12, 5], ['Mh', 0, 2, 11, 5], ['Ch', 0, 2, 11, 5],
  ['ldg5', 2, 28, 15, 17], ['ldg4', 2, 24, 15, 13], ['ldg3', 2, 20, 15, 9], ['ldg2', 2, 16, 15, 5], ['ldg1', 2, 12, 15, 1],
  ['Dot1', -12, 2, 3, 2], ['Dot2', -12, 2, 8, 2], ['Dot3', -12, 2, 13, 2], ['Bar', -1, 8, 2, 17], ['C', 0, 2, 11, 5],
  ['ldg1', 2, -12, 15, 1], ['ldg2', 2, -12, 15, 5], ['ldg3', 2, -12, 15, 9], ['ldg4', 2, -12, 15, 13], ['ldg5', 2, -12, 15, 17],
  ['Time', 1, 9, 25, 19], ['Key', 0, 13, 0, 30], ['Tie', -12, -3, 23, 3],
];
export const SPR = DATA.map(([n, x, y, W, H]) => ({ name: n.toLowerCase(), x: x * 2, y: y * 4, X: (W - x) * 2, Y: (H - y) * 4 }));
export const S_NOTE = 0, S_REST = 16, S_ACC = 24, S_CLEF = 32, S_LDG = 47, S_DOT = 44, S_BAR = 48, S_TIME = 55, S_KEY = 56, S_TIE = 57;
const Qc = 2, Rc = 4, PD = 8, OD = 64, IC = Math.floor(SPR[2].X / 2) + 1;
export const GEOM = { PD, OD, IC, PANE: 80 };

const lowBit = (v) => { let t = 1; while (!(v & t) && t < 256) t <<= 1; return t; };

/** Stave centre y (OS, negative downwards from the work-area top) for each stave. */
export function staveLayout(doc) {
  const z = doc.staves, qc = doc.perc;
  const Uc = (qc + 1 + 3 * (z + 1) + 1) * OD;
  const b = [];
  let Y = -Uc - OD / 2;
  for (let S = qc; S >= 1; S--) { Y += OD; b[z + S] = Y; }
  for (let S = z; S >= 0; S--) { Y += 3 * OD; b[S] = Y; }
  return { Uc, b, count: z + 1 + qc };
}

/** Left/right extents of a note (PROCP). */
function noteExtent(n) {
  const a = n.a, H = n.b;
  const S = a & 248 ? (H >> 5) | ((a << 3) & 8) : S_REST | (H >> 5);
  let K = SPR[S].x, L = SPR[S].X;
  if (H & 7) K += SPR[S_ACC | (H & 7)].x;
  if (H & 24) L = SPR[S].x + SPR[S_DOT + ((H >> 3) & 3)].X;
  return { K, L };
}

/**
 * Columns: [{x (OS), w, type (0 gate / command bit), items: [index...]}]. Consecutive commands of
 * the same kind share a column (e.g. the clefs of all staves).  Column 0 is the opening bar.
 */
export function layoutColumns(doc) {
  const cols = [{ x: 0, w: 4 * Qc, type: 32, items: [] }];
  let prevKey = 2;         // g%(1)
  for (let i = 0; i < doc.items.length; i++) {
    const it = doc.items[i];
    const cur = cols[cols.length - 1];
    if (it.t === 'gate') {
      let P = 0, R = 0;
      for (const n of it.notes) { const e = noteExtent(n); if (e.K > P) P = e.K; if (e.L > R) R = e.L; }
      cols.push({ x: cur.x + cur.w + IC + P, w: R, type: 0, items: [i] });
      continue;
    }
    const A = it.v, T = lowBit(A);
    if (cur.type && (A & T) && T === cur.type) { cur.items.push(i); continue; }
    let w = 0;
    if (T === 1) w = 20 * Qc;
    else if (T === 2) {
      let AA = A, s;
      if (AA & 56) { s = S_ACC + ((AA >> 2) & 1) + 2; prevKey = AA; } else { s = S_ACC + 1; [AA, prevKey] = [prevKey, AA]; if (!(AA & 56)) { AA = 8; s += 1; } }
      w = ((AA >> 3) & 7) * (SPR[s].x + SPR[s].X);
    } else if (T === 4) w = SPR[S_CLEF + 3].x + SPR[S_CLEF + 3].X;
    else if (T === 32) w = Qc * 4;
    cols.push({ x: cur.x + cur.w + IC, w, type: T, items: [i] });
  }
  return cols;
}

/**
 * Draw the score. g: canvas context in work-area pixels; spr(name) -> {img, w, h} (desktop px);
 * text(g, str, x, y) draws system-font text with its top-left at x,y (px).
 * rect: visible work-area rectangle (px).  Returns nothing.
 */
export function drawScore(g, doc, L, cols, spr, text, rect, extentW) {
  const toY = (osy) => 20 - osy / 2;       // work-area px
  const toX = (osx) => osx / 2;
  const plot = (s, X, Y) => {
    const d = SPR[s], im = spr(d.name);
    if (!im) return;
    // PROCe: sprite bottom-left at (X - x, Y - y) in OS units
    const left = toX(X - d.x), bottom = toY(Y - d.y);
    g.drawImage(im.img, Math.round(left), Math.round(bottom - im.h), im.w, im.h);
  };
  const z = doc.staves, qc = doc.perc;
  const stv = channelStaves(z, qc);
  const b = L.b;
  // stave lines
  g.fillStyle = '#000';
  const x0 = Math.max(1, rect.x0), x1 = Math.min(extentW, rect.x1);
  for (let S = 0; S <= z + qc; S++) {
    const lines = S > z ? [0] : [-32, -16, 0, 16, 32];
    for (const d of lines) g.fillRect(x0, Math.round(toY(b[S] + d)), x1 - x0, 1);
  }
  // walk the music keeping clefs / key state
  const clef = [0, 0, 0, 0, 0, 0];
  let keyPrev = 2, bar = 0;
  const visible = (c) => toX(c.x) + 60 >= rect.x0 && toX(c.x) - 40 <= rect.x1;
  for (let ci = 1; ci < cols.length; ci++) {
    const c = cols[ci];
    const X = c.x;
    const vis = visible(c);
    for (const idx of c.items) {
      const it = doc.items[idx];
      if (it.t === 'gate') {
        if (!vis) continue;
        let Td = false, Sd = 0;
        for (const n of [...it.notes].sort((p, q) => p.ch - q.ch)) {
          const Qd = n.a, Rd = n.b;
          let y = b[stv[n.ch]] ?? b[0];
          const base = y;
          let s;
          let x = X;
          if (Qd & 248) {
            const l = (Qd >> 3) - 16;
            if (Math.abs(l) > 5) plot(S_LDG + Math.trunc(l / 2), X, base);
            y += PD * l;
            s = (Rd >> 5) | ((Qd << 3) & 8);
            if (Td) { if (Math.abs(Sd - y) < 2 * PD) { x = X + IC; Td = false; } } else Td = true;
            plot(s, x, y);
            Sd = y;
            if (Rd & 7) plot(S_ACC | (Rd & 7), x - SPR[s].x, y);
          } else {
            s = S_REST | (Rd >> 5);
            plot(s, x, y);
          }
          if (Rd & 24) plot(S_DOT + ((Rd >> 3) & 3), x + SPR[s].x, y);
          if (Qd & 4) plot(S_TIE, x, y);
        }
        continue;
      }
      const A = it.v, T = lowBit(A);
      if (T === 1) {
        if (!vis) continue;
        const B$ = String(((A >> 1) & 15) + 1), D$ = String(1 << ((A >> 5) - 1));
        const w = c.w;
        const xb = X + (B$.length < 2 ? w >> 2 : 0), xd = X + (D$.length < 2 ? w >> 2 : 0);
        for (let S = 0; S <= z + qc; S++) {
          text(g, B$, toX(xb), toY(b[S] + PD * 4 - Rc));
          text(g, D$, toX(xd), toY(b[S] - Rc));
        }
      } else if (T === 2) {
        let AA = A, a = 0;
        if (AA & 56) keyPrev = AA; else { [AA, keyPrev] = [keyPrev, AA]; a = S_ACC + 1; }
        const N = ((AA >> 3) & 7) - 1;
        if (N >= 0 && vis) {
          const fl = (AA >> 2) & 1;
          if (!a) a = S_ACC + 2 + fl;
          const W = SPR[a].x + SPR[a].X;
          let x = X + SPR[a].x;
          for (let C = 0; C <= N; C++) {
            for (let S = 0; S <= z; S++) plot(a, x, b[S] + PD * KEYPOS[clef[S]][fl][C]);
            x += W;
          }
        }
      } else if (T === 4) {
        const S = A >> 6;
        clef[S] = (A >> 3) & 3;
        if (S <= z && vis) plot(S_CLEF + clef[S], X, b[S]);
      } else if (T === 32) {
        bar++;
        if (!vis) continue;
        for (let S = 0; S <= z + qc; S++) plot(S_BAR, X, b[S]);
        if (bar % 5 === 0) text(g, String(bar), toX(X + Qc), toY(b[0] + OD + 10 * Rc));
        if ((z + 1) & 2) {
          const yTop = toY(b[z - 1] - OD / 2), yBot = toY(b[z] + OD / 2);
          g.fillRect(Math.round(toX(X + Qc)), Math.round(yTop), 1, Math.round(yBot - yTop));
          g.fillRect(Math.round(toX(X + 2 * Qc)), Math.round(yTop), 1, Math.round(yBot - yTop));
        }
      }
    }
  }
}

/** The clef in force on each stave, and the key, just before column ci (for placing items). */
export function stateAt(doc, cols, ci) {
  const clef = [0, 0, 0, 0, 0, 0];
  for (let k = 1; k <= ci && k < cols.length; k++) for (const idx of cols[k].items) {
    const it = doc.items[idx];
    if (it.t === 'cmd' && lowBit(it.v) === 4) clef[it.v >> 6] = (it.v >> 3) & 3;
  }
  return { clef };
}

export { lowBit };
