// Draw's diagram model, entry/select/edit state machine and view (window) rendering.
// Behaviour follows the 3.71 sources: c.DrawEnter (path/rectangle/ellipse/text entry, curve fitting),
// c.DrawSelect (selection, capture, handles), c.DrawEdit (path edit), c.DrawDispl (skeletons,
// selection boxes), c.DrawGrid (grid painting and snapping), c.DrawAction (zoom, paper).

import * as DF from './drawfile.js';
import { translateObject, scaleObject, rotateObject, isRotatable, makeRotatable } from './transform.js';
import { WIMP_COLOURS } from '../../core/palette.js';

const { PATH, TRANSPARENT } = DF;
export const BLACK = 0x00000000, WHITE = 0xFFFFFF00;

// draw units
export const dbc = {
  OneInch: 180 << 8, HalfInch: 90 << 8, QuarterInch: 45 << 8, FifthInch: 36 << 8, TenthInch: 18 << 8, TwentiethInch: 9 << 8,
  OneCm: 18144, HalfCm: 9072, OnePoint: 640, A4long: 538809, A4short: 380976,
};
export const MAXZOOM = 8;
const GRAB = 16;             // grab box size, OS units
const StdCircRad = 2115 << 8;

// Wimp colours from the 'paper' template icons (c.Draw main: get_icon_colour)
export const COLOURS = { skeleton: 2, anchor: 15, bezier: 14, highlight: 11, grid: 8, bbox: 11, printmargin: 1 };

// Paper sizes (Paper_A0..A5 = 0x100..0x600)
export const PAPER = { A0: 0x100, A1: 0x200, A2: 0x300, A3: 0x400, A4: 0x500, A5: 0x600, Show: 1, Landscape: 0x10, Default: 0x100 };
export function paperLimit(size, opt) {
  const L = dbc.A4long, S = dbc.A4short;
  const t = { 0x100: [L * 4, S * 4], 0x200: [S * 4, L * 2], 0x300: [L * 2, S * 2], 0x400: [S * 2, L], 0x500: [L, S], 0x600: [S, L / 2 | 0] }[size] ?? [L, S];
  return opt & PAPER.Landscape ? { x0: 0, y0: 0, x1: t[0], y1: t[1] } : { x0: 0, y0: 0, x1: t[1], y1: t[0] };
}

// dash patterns (c.DrawMenu)
export const PATTERNS = [
  null,
  { offset: 0, elements: [dbc.TwentiethInch, dbc.TwentiethInch, dbc.TwentiethInch, dbc.TwentiethInch, dbc.TwentiethInch, dbc.TwentiethInch] },
  { offset: 0, elements: [dbc.TenthInch, dbc.TenthInch, dbc.TenthInch, dbc.TenthInch, dbc.TenthInch, dbc.TenthInch] },
  { offset: 0, elements: [dbc.FifthInch, dbc.FifthInch, dbc.FifthInch, dbc.FifthInch, dbc.FifthInch, dbc.FifthInch] },
  { offset: 0, elements: [dbc.FifthInch, dbc.TwentiethInch, dbc.TwentiethInch, dbc.TwentiethInch] },
];
export const patternIndex = (d) => {
  if (!d || !d.elements?.length) return 0;
  for (let i = 1; i < PATTERNS.length; i++) if (PATTERNS[i].elements.length === d.elements.length && PATTERNS[i].elements.every((e, j) => e === d.elements[j]) && d.offset === 0) return i;
  return -1;
};

// the standard circle (bezierarc_circle): 13 points, move to p0, curves (1,2,3) (4,5,6) (7,8,9) (10,11,12)
function stdCircle(r) {
  const k90 = 0.552284750, cos45 = 0.707106781;
  const x = r * cos45, kx = k90 * x;
  const s = Math.trunc(x), c1x = Math.trunc(x - kx), c1y = Math.trunc(x + kx);
  const p = [];
  p[0] = [s, s]; p[9] = [s, -s]; p[3] = [-s, s]; p[6] = [-s, -s];
  p[1] = [c1x, c1y]; p[8] = [c1x, -c1y]; p[2] = [-c1x, c1y]; p[7] = [-c1x, -c1y];
  p[4] = [-c1y, c1x]; p[5] = [-c1y, -c1x]; p[11] = [c1y, c1x]; p[10] = [c1y, -c1x];
  p[12] = p[0];
  return p;
}
const STDCIRC = stdCircle(StdCircRad);

// entry states
export const S = {
  PATH: 'path', P_MOVE: 'p_move', P1: 'p1', P2: 'p2', P3: 'p3',
  TEXT: 'text', T_CARET: 't_caret', T_CHAR: 't_char',
  SEL: 'sel', SEL_SELECT: 'sel_select', SEL_ADJUST: 'sel_adjust', SEL_TRANS: 'sel_trans', SEL_SCALE: 'sel_scale', SEL_ROTATE: 'sel_rotate',
  EDIT: 'edit', EDIT_DRAG: 'edit_drag',
  RECT: 'rect', RECT_DRAG: 'rect_drag', ELLI: 'elli', ELLI_DRAG: 'elli_drag', ZOOM: 'zoom',
};

const within = (pt, b) => b.x0 <= pt.x && pt.x <= b.x1 && b.y0 <= pt.y && pt.y <= b.y1;
const overlap = (a, b) => !(a.x1 < b.x0 || a.x0 > b.x1 || a.y1 < b.y0 || a.y0 > b.y1);
const inside = (a, b) => a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1;
const endPoint = (e) => [e.x, e.y];

// ======================================================================================= Diagram
export class Diagram {
  constructor(app, opts) {
    this.app = app;
    this.objects = [];
    this.fonts = new Map();
    this.filename = '';
    this.modified = false;
    this.views = [];
    this.sel = new Set();
    this.undo = []; this.redo = [];
    const o = app.options;
    this.main = o.mode === 'rect' ? S.RECT : o.mode === 'elli' ? S.ELLI : o.mode === 'text' ? S.TEXT : o.mode === 'sel' ? S.SEL : S.PATH;
    this.sub = this.main;
    this.curved = o.curved; this.closed = o.closed;
    this.paper = { size: o.paperSize, options: o.paperOptions | PAPER.Default };
    // current path & text styles (draw_createblank)
    this.path = { width: 0, stroke: BLACK, fill: TRANSPARENT, dash: null, join: DF.JOIN.BEVEL, startcap: 0, endcap: 0, winding: 1, tricapW: 0x10, tricapH: 0x20 };
    this.font = { ref: 0, xsize: 4096, ysize: 8192, colour: BLACK, bg: WHITE };
    this.cons = null;        // object under construction (path/text)
    this.ptzzz = { x: 0, y: 0 };
    this.edit = null;        // {obj, cur (index), over, cor}
    this.saved = null;       // state before path edit
    this.drag = null;        // select-mode drag in progress
  }

  get viewLimit() { return paperLimit(this.paper.size, this.paper.options); }
  get title() { return this.filename || this.app.msg('DrawUn'); }

  // --------------------------------------------------------------------- change tracking / undo
  snapshot() { return { objects: this.objects.map(DF.cloneObject), fonts: new Map(this.fonts), sel: [...this.sel].map((o) => this.objects.indexOf(o)), modified: this.modified }; }
  restore(s) {
    this.objects = s.objects.map(DF.cloneObject);
    this.fonts = new Map(s.fonts);
    this.sel = new Set(s.sel.filter((i) => i >= 0).map((i) => this.objects[i]).filter(Boolean));
  }
  /** Record the state before a (major) edit. */
  checkpoint() {
    this.undo.push(this.snapshot());
    if (this.undo.length > 80) this.undo.shift();
    this.redo = [];
  }
  canUndo() { return this.undo.length > 0; }
  canRedo() { return this.redo.length > 0; }
  doUndo() {
    if (!this.undo.length) return;
    this.abandon();
    if (this.main === S.EDIT) this.leaveEdit(false);
    this.redo.push(this.snapshot());
    this.restore(this.undo.pop());
    this.setModified(true);
    this.redrawAll();
  }
  doRedo() {
    if (!this.redo.length) return;
    this.abandon();
    this.undo.push(this.snapshot());
    this.restore(this.redo.pop());
    this.setModified(true);
    this.redrawAll();
  }
  setModified(m = true) {
    if (this.modified === m) return;
    this.modified = m;
    this.updateTitles();
  }
  updateTitles() { for (const v of this.views) v.updateTitle(); }
  redrawAll() { for (const v of this.views) v.invalidate(); }

  // --------------------------------------------------------------------- fonts
  fontRef(name) {
    if (!name) return 0;
    for (const [n, f] of this.fonts) if (f.toLowerCase() === name.toLowerCase()) return n;
    let n = 1;
    while (this.fonts.has(n)) n++;
    this.fonts.set(n, name);
    return n;
  }
  bound(o) { return DF.boundObject(o, this.fonts); }

  // --------------------------------------------------------------------- state changes
  /** draw_action_changestate */
  changeState(state, curved = 0, closed = 0) {
    const old = this.main;
    if (old === state && (state !== S.PATH || (this.curved === !!curved && this.closed === !!closed))) { this.app.noteMode(this); return; }
    if (old === state && state === S.PATH) {
      if (this.cons && this.curved !== !!curved) this.stateChangeLineCurve(curved ? PATH.CURVE : PATH.LINE);
      this.curved = !!curved;
    } else {
      this.complete();
      this.abandon();
      if (old === S.SEL) this.clearSelection();
      if (old === S.EDIT) this.leaveEdit(false);
      this.main = this.sub = state;
      if (state === S.PATH) this.curved = !!curved;
    }
    if (state === S.PATH) this.closed = !!closed;
    this.app.noteMode(this);
    for (const v of this.views) { v.showToolState(); v.updatePointer(); }
    this.redrawAll();
  }

  /** draw_action_abandon: flush any object under construction. */
  abandon() {
    switch (this.sub) {
      case S.P_MOVE: case S.P1: case S.P2: case S.P3: case S.RECT_DRAG: case S.ELLI_DRAG:
      case S.T_CARET: case S.T_CHAR:
        this.cons = null;
        this.app.releaseCaret(this);
        break;
      default: break;
    }
    if (this.drag) this.drag = null;
    if (this.main !== S.EDIT) this.sub = this.main;
    this.redrawAll();
  }

  // --------------------------------------------------------------------- construction (c.DrawEnter)
  el(i) { return this.cons.elements[i]; }
  newPath() {
    const p = this.path;
    return {
      type: 'path', tag: DF.OBJ.PATH, bbox: { x0: 0, y0: 0, x1: 0, y1: 0 }, fill: p.fill, stroke: p.stroke, width: p.width,
      style: DF.pathStyle.make({ join: p.join, endcap: p.endcap, startcap: p.startcap, winding: p.winding, tricapW: p.tricapW, tricapH: p.tricapH }),
      dash: p.dash ? { offset: p.dash.offset, elements: p.dash.elements.slice() } : null, elements: [],
    };
  }
  addEl(e) { this.cons.elements.push(e); return this.cons.elements.length - 1; }

  straightCurve(a, b) {
    const A = this.el(a), B = this.el(b);
    const [ax, ay] = endPoint(A);
    const dx = Math.trunc((B.x - ax) / 3), dy = Math.trunc((B.y - ay) / 3);
    B.x1 = ax + dx; B.y1 = ay + dy; B.x2 = B.x - dx; B.y2 = B.y - dy;
  }
  fitCurveCurve(A, B, C) {
    const [ax, ay] = endPoint(A), bx = B.x, by = B.y, [cx, cy] = endPoint(C);
    const lab = Math.hypot(ax - bx, ay - by), lbc = Math.hypot(bx - cx, by - cy);
    let ix, iy;
    if (lab < 0.1) { ix = (cx + 2 * bx) / 3; iy = (cy + 2 * by) / 3; }
    else { const r = lbc / lab; ix = bx + r * (ax - bx); iy = by + r * (ay - by); }
    const lci = Math.hypot(ix - cx, iy - cy);
    if (lci < 0.1) return [Math.trunc(bx), Math.trunc(by)];
    const f = lbc / (3 * lci);
    return [Math.trunc(bx + f * (cx - ix)), Math.trunc(by + f * (cy - iy))];
  }
  fitLineCurve(A, B) {
    const [ax, ay] = endPoint(A), [bx, by] = endPoint(B);
    const [cx, cy] = [0, 0];
    return (C) => {
      const [ccx, ccy] = endPoint(C);
      const lab = Math.hypot(ax - bx, ay - by), lbc = Math.hypot(bx - ccx, by - ccy);
      if (lab === 0) return [Math.trunc(bx), Math.trunc(by)];
      const f = lbc / (3 * lab);
      return [Math.trunc(bx + f * (bx - ax)), Math.trunc(by + f * (by - ay))];
    };
  }
  /** draw_enter_fit_corner(a, b, c) */
  fitCorner(a, b, c) {
    const A = this.el(a), B = this.el(b), C = this.el(c);
    if (!A || !B || !C) return;
    if (B.t === PATH.CURVE) {
      if (C.t === PATH.CURVE) {
        [C.x1, C.y1] = this.fitCurveCurve(A, B, C);
        [B.x2, B.y2] = this.fitCurveCurve(C, B, A);
      } else [B.x2, B.y2] = this.fitLineCurve(C, B)(A);
    } else if (C.t === PATH.CURVE) [C.x1, C.y1] = this.fitLineCurve(A, B)(C);
  }

  addSegment(pt) {
    return this.curved ? this.addEl({ t: PATH.CURVE, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y, x: pt.x, y: pt.y }) : this.addEl({ t: PATH.LINE, x: pt.x, y: pt.y });
  }

  /** draw_enter_select: a click in an entry mode. */
  enterSelect(view, pt) {
    switch (this.sub) {
      case S.PATH:
        this.cons = this.newPath();
        // fall through
      case S.P_MOVE:
        this.pta = this.pty = this.addEl({ t: PATH.MOVE, x: pt.x, y: pt.y });
        this.ptz = this.addSegment(pt);
        this.sub = S.P1;
        this.app.claimFocus(this, view);
        break;
      case S.P1: {
        this.ptx = this.pty; this.pty = this.ptz;
        this.ptb = this.pty;
        if (this.curved) { this.straightCurve(this.ptx, this.pty); this.ptz = this.addSegment(pt); this.fitCorner(this.ptx, this.pty, this.ptz); }
        else this.ptz = this.addSegment(pt);
        this.sub = S.P2;
        break;
      }
      case S.P2: case S.P3: {
        this.ptw = this.ptx; this.ptx = this.pty; this.pty = this.ptz;
        if (this.curved) this.straightCurve(this.ptx, this.pty);
        this.ptz = this.addSegment(pt);
        this.fitCorner(this.ptw, this.ptx, this.pty);
        this.fitCorner(this.ptx, this.pty, this.ptz);
        this.sub = S.P3;
        break;
      }
      case S.RECT:
        this.cons = this.newPath();
        this.addEl({ t: PATH.MOVE, x: pt.x, y: pt.y });
        for (let i = 0; i < 4; i++) this.addEl({ t: PATH.LINE, x: pt.x, y: pt.y });
        this.addEl({ t: PATH.CLOSE });
        this.sub = S.RECT_DRAG;
        this.app.claimFocus(this, view);
        break;
      case S.RECT_DRAG: case S.ELLI_DRAG:
        this.complete();
        break;
      case S.ELLI: {
        this.cons = this.newPath();
        this.addEl({ t: PATH.MOVE, x: pt.x, y: pt.y });
        for (let i = 0; i < 4; i++) this.addEl({ t: PATH.CURVE, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y, x: pt.x, y: pt.y });
        this.addEl({ t: PATH.CLOSE });
        this.elliCentre = { ...pt };
        this.sub = S.ELLI_DRAG;
        this.app.claimFocus(this, view);
        break;
      }
      case S.T_CARET: case S.T_CHAR:
        if (this.sub === S.T_CHAR) this.finishText();
        // fall through
      case S.TEXT: {
        const f = this.font;
        this.cons = { type: 'text', tag: DF.OBJ.TEXT, bbox: { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y }, colour: f.colour, bg: f.bg, style: f.ref, xsize: f.xsize, ysize: f.ysize, x: pt.x, y: pt.y, text: '' };
        this.sub = S.T_CARET;
        this.app.claimFocus(this, view);
        this.app.showTextCaret(this, view);
        break;
      }
      default: return;
    }
    this.redrawAll();
  }

  /** draw_obj_move_construction: pointer moved. */
  moveConstruction(pt) {
    const old = this.ptzzz;
    this.ptzzz = { ...pt };
    switch (this.sub) {
      case S.P1: case S.P2: case S.P3: {
        const z = this.el(this.ptz);
        z.x = pt.x; z.y = pt.y;
        if (z.t === PATH.CURVE) this.straightCurve(this.pty, this.ptz);
        if (this.sub !== S.P1) this.fitCorner(this.ptx, this.pty, this.ptz);
        break;
      }
      case S.RECT_DRAG: {
        const e = this.cons.elements;
        e[1].x = e[2].x = pt.x; e[2].y = e[3].y = pt.y;
        break;
      }
      case S.ELLI_DRAG: {
        const c = this.elliCentre;
        const sx = (pt.x - c.x) / StdCircRad, sy = (pt.y - c.y) / StdCircRad;
        const e = this.cons.elements;
        const P = (i) => [Math.trunc(STDCIRC[i][0] * sx + c.x), Math.trunc(STDCIRC[i][1] * sy + c.y)];
        for (let n = 0; n < 4; n++) {
          const q = e[1 + n];
          [q.x1, q.y1] = P(1 + 3 * n); [q.x2, q.y2] = P(2 + 3 * n); [q.x, q.y] = P(3 + 3 * n);
        }
        e[0].x = e[4].x; e[0].y = e[4].y;
        break;
      }
      case S.SEL_TRANS: this.drag.dx += pt.x - old.x; this.drag.dy += pt.y - old.y; break;
      case S.SEL_SCALE: this.drag.newDx += pt.x - old.x; this.drag.newDy -= pt.y - old.y; break;
      case S.SEL_ROTATE: {
        const d = this.drag;
        const l = Math.hypot(pt.x - d.cx, pt.y - d.cy) || 1;
        const sinA = (pt.y - d.cy) / l, cosA = (pt.x - d.cx) / l;
        d.sin = sinA * d.cosB - cosA * d.sinB;
        d.cos = cosA * d.cosB + sinA * d.sinB;
        break;
      }
      case S.SEL_SELECT: case S.SEL_ADJUST: case S.ZOOM: this.drag.box.x1 = pt.x; this.drag.box.y1 = pt.y; break;
      case S.EDIT_DRAG: this.editMovePoints(pt); break;
      default: return;
    }
    this.redrawAll();
  }

  stateChangeLineCurve(tag) {
    if (![S.P1, S.P2, S.P3].includes(this.sub)) return;
    this.changeLineCurve(this.cons, this.pty, this.ptz, tag);
    if (this.sub !== S.P1) this.fitCorner(this.ptx, this.pty, this.ptz);
  }
  /** draw_enter_changelinecurve on any path (element indices). */
  changeLineCurve(obj, prev, cur, tag) {
    const E = obj.elements, c = E[cur];
    if (!c || ![PATH.LINE, PATH.CURVE, PATH.MOVE].includes(c.t) || c.t === tag) return;
    if (tag === PATH.LINE) E[cur] = { t: PATH.LINE, x: c.x, y: c.y };
    else {
      const [ax, ay] = endPoint(E[prev]);
      const dx = Math.trunc((c.x - ax) / 3), dy = Math.trunc((c.y - ay) / 3);
      E[cur] = { t: PATH.CURVE, x1: ax + dx, y1: ay + dy, x2: c.x - dx, y2: c.y - dy, x: c.x, y: c.y };
    }
  }

  closePathEntry() {
    const A = this.el(this.pta), Z = this.el(this.ptz);
    Z.x = A.x; Z.y = A.y;
    this.addEl({ t: PATH.CLOSE });
    this.fitCorner(this.ptx, this.pty, this.ptz);
    this.fitCorner(this.pty, this.ptz, this.ptb);
  }
  openPathEntry() { this.cons.elements.splice(this.ptz, 1); }

  /** draw_enter_complete */
  complete() {
    if (this.sub === S.P1) this.enterDelete();
    switch (this.sub) {
      case S.P_MOVE: case S.P2: case S.P3:
        if (this.sub !== S.P_MOVE) { if (this.closed) this.closePathEntry(); else this.openPathEntry(); }
        this.finishPath();
        break;
      case S.RECT_DRAG: case S.ELLI_DRAG: this.finishPath(); break;
      case S.T_CARET: this.cons = null; this.sub = S.TEXT; this.app.releaseCaret(this, true); break;
      case S.T_CHAR: this.finishText(); this.sub = S.TEXT; this.app.releaseCaret(this, true); break;
      default: return;
    }
    this.redrawAll();
  }
  finishPath() {
    const o = this.cons;
    this.cons = null;
    this.sub = this.main;
    // strip degenerate trailing moves
    while (o.elements.length && o.elements[o.elements.length - 1].t === PATH.MOVE) o.elements.pop();
    if (!o.elements.some((e) => e.t === PATH.LINE || e.t === PATH.CURVE)) return;
    this.checkpoint();
    this.bound(o);
    this.objects.push(o);
    this.setModified(true);
  }
  finishText() {
    const o = this.cons;
    this.cons = null;
    if (!o || !o.text) return;
    this.checkpoint();
    this.bound(o);
    this.objects.push(o);
    this.setModified(true);
  }

  /** draw_enter_movepending: the Move tool / Enter ▸ Move. */
  movePending() {
    if (this.main !== S.PATH || ![S.P2, S.P3].includes(this.sub)) return;
    if (this.closed) this.closePathEntry(); else this.openPathEntry();
    this.sub = S.P_MOVE;
    this.redrawAll();
  }

  /** draw_enter_delete: Delete/Backspace during entry. */
  enterDelete() {
    switch (this.sub) {
      case S.RECT_DRAG: case S.ELLI_DRAG: this.abandon(); return;
      case S.T_CHAR: {
        this.cons.text = this.cons.text.slice(0, -1);
        if (!this.cons.text) this.sub = S.T_CARET;
        this.app.showTextCaret(this);
        this.redrawAll();
        return;
      }
      case S.P_MOVE: {
        // reopen the previous subpath and continue it
        const E = this.cons.elements;
        if (E.length && (E[E.length - 1].t === PATH.CLOSE)) E.pop();
        let a = E.length - 1;
        while (a > 0 && E[a].t !== PATH.MOVE) a--;
        this.pta = a;
        const n = E.length - 1 - a;          // segments in the subpath
        this.ptz = this.addSegment(this.ptzzz);
        this.pty = this.ptz - 1; this.ptx = this.pty - 1; this.ptw = this.ptx - 1;
        this.ptb = a + 1;
        this.sub = n >= 2 ? S.P3 : n === 1 ? S.P2 : S.P1;
        if (this.sub === S.P2) this.ptx = a;
        if (this.el(this.ptz).t === PATH.CURVE) this.straightCurve(this.pty, this.ptz);
        if (this.sub !== S.P1) this.fitCorner(this.ptx, this.pty, this.ptz);
        break;
      }
      case S.P1:
        if (this.pta === 0) { this.cons = null; this.sub = S.PATH; this.app.releaseCaret(this); }
        else { this.cons.elements.splice(this.pty, 2); this.sub = S.P_MOVE; }
        break;
      case S.P2:
        this.cons.elements.splice(this.pty, 1);
        this.ptz = this.pty; this.pty = this.ptx;
        this.sub = S.P1;
        if (this.el(this.ptz).t === PATH.CURVE) this.straightCurve(this.pty, this.ptz);
        break;
      case S.P3:
        this.cons.elements.splice(this.pty, 1);
        this.ptz = this.pty; this.pty = this.ptx; this.ptx = this.ptw;
        if (this.ptx === this.pta) this.sub = S.P2;
        else this.ptw = this.ptx - 1;
        if (this.el(this.ptz).t === PATH.CURVE) this.straightCurve(this.pty, this.ptz);
        this.fitCorner(this.ptx, this.pty, this.ptz);
        break;
      default: return;
    }
    this.moveConstruction(this.ptzzz);
    this.redrawAll();
  }

  addTextChar(ch) {
    if (this.sub !== S.T_CARET && this.sub !== S.T_CHAR) return false;
    this.cons.text += ch;
    this.sub = S.T_CHAR;
    this.bound(this.cons);
    this.app.showTextCaret(this);
    this.redrawAll();
    return true;
  }
  lineHeight() {
    const o = this.cons;
    const fn = (o.style & 0xFF) ? this.fonts.get(o.style & 0xFF) : null;
    const fi = fn ? DF.fontInfo(fn) : null;
    return fi ? Math.round((fi.ascender - fi.descender) / 1000 * o.ysize) : o.ysize;
  }

  // --------------------------------------------------------------------- selection (c.DrawSelect)
  objectAt(pt, before = null) {
    // last object whose (widened) bbox contains pt, occurring before `before` (cycling)
    let found = before;
    for (const o of this.objects) {
      if (!o.bbox) continue;
      const b = { ...o.bbox };
      if (b.x1 - b.x0 < 512) { b.x0 -= 512; b.x1 += 512; }
      if (b.y1 - b.y0 < 512) { b.y0 -= 512; b.y1 += 512; }
      if (within(pt, b)) {
        if (o === before && found !== before) return found;
        found = o;
      }
    }
    return found;
  }
  /** over_selected_object: returns {obj, region: 'object'|'rotate'|'stretch'} */
  overSelected(pt, grab) {
    const sel = this.objects.filter((o) => this.sel.has(o));
    for (let i = sel.length - 1; i >= 0; i--) {
      const o = sel[i], b = o.bbox;
      if (within(pt, b)) return { obj: o, region: 'object' };
      if (b.x1 <= pt.x && b.x1 + grab >= pt.x) {
        if (b.y1 <= pt.y && b.y1 + grab >= pt.y && isRotatable(o, this.fonts)) return { obj: o, region: 'rotate' };
        if (b.y0 >= pt.y && b.y0 - grab <= pt.y) return { obj: o, region: 'stretch' };
      }
    }
    return null;
  }
  clearSelection() { if (this.sel.size) { this.sel.clear(); this.redrawAll(); } }
  selectAll() { this.changeState(S.SEL); this.sel = new Set(this.objects); this.redrawAll(); }
  selectClick(pt, grab) {
    if (this.sub !== S.SEL) return;
    if (!this.overSelected(pt, grab)) {
      this.sel.clear();
      const o = this.objectAt(pt);
      if (o) this.sel.add(o);
      this.redrawAll();
    }
  }
  selectAdjust(pt, grab) {
    if (this.sub !== S.SEL) return;
    const h = this.overSelected(pt, grab);
    if (h) { if (h.region === 'object') this.sel.delete(h.obj); }
    else { const o = this.objectAt(pt); if (o) this.sel.add(o); }
    this.redrawAll();
  }
  selectDouble(pt, grab) {
    const h = this.overSelected(pt, grab);
    if (!h) return;
    const prev = this.objectAt(pt, h.obj);
    if (prev && prev !== h.obj) { this.sel.delete(h.obj); this.sel.add(prev); this.redrawAll(); }
  }
  /** draw_select_longselect: start a drag in select mode. Returns false if nothing to do. */
  selectDragStart(pt, grab, adjust, shift) {
    if (this.sub !== S.SEL) return false;
    const h = adjust ? null : this.overSelected(pt, grab);
    if (adjust && this.overSelected(pt, grab)) return false;
    if (h) {
      const b = h.obj.bbox;
      if (h.region === 'object') { this.sub = S.SEL_TRANS; this.drag = { dx: 0, dy: 0 }; }
      else if (h.region === 'rotate') {
        const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, l = Math.hypot(pt.x - cx, pt.y - cy) || 1;
        this.sub = S.SEL_ROTATE;
        this.drag = { cx, cy, sinB: (pt.y - cy) / l, cosB: (pt.x - cx) / l, sin: 0, cos: 1 };
      } else {
        this.sub = S.SEL_SCALE;
        this.drag = { oldDx: b.x1 - b.x0, oldDy: b.y1 - b.y0, newDx: b.x1 - b.x0, newDy: b.y1 - b.y0 };
        pt = { x: b.x1, y: b.y0 };
      }
    } else {
      if (adjust && !this.sel.size) return false;
      this.sub = adjust ? S.SEL_ADJUST : S.SEL_SELECT;
      this.drag = { box: { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y }, overlap: !!shift };
    }
    this.ptzzz = { ...pt };
    this.redrawAll();
    return true;
  }
  /** draw_obj_drop_construction for select drags. */
  selectDragEnd() {
    const d = this.drag;
    const sub = this.sub;
    this.sub = S.SEL;
    this.drag = null;
    if (!d) return;
    const sel = this.objects.filter((o) => this.sel.has(o));
    switch (sub) {
      case S.SEL_TRANS:
        if (!d.dx && !d.dy) break;
        this.checkpoint();
        for (const o of sel) translateObject(o, d.dx, d.dy);
        this.setModified(true);
        break;
      case S.SEL_SCALE: {
        if (d.newDx === d.oldDx && d.newDy === d.oldDy) break;
        this.checkpoint();
        const sx = d.oldDx ? d.newDx / d.oldDx : 1, sy = d.oldDy ? d.newDy / d.oldDy : 1;
        for (const o of sel) scaleObject(o, sx, sy, null, { body: true }, this.fonts);
        this.setModified(true);
        break;
      }
      case S.SEL_ROTATE:
        if (Math.abs(d.sin) < 1e-6 && d.cos > 0) break;
        this.checkpoint();
        for (const o of sel) if (isRotatable(o, this.fonts)) rotateObject(o, d.sin, d.cos, null, this.fonts);
        this.setModified(true);
        break;
      case S.SEL_SELECT: case S.SEL_ADJUST: {
        const b = { x0: Math.min(d.box.x0, d.box.x1), y0: Math.min(d.box.y0, d.box.y1), x1: Math.max(d.box.x0, d.box.x1), y1: Math.max(d.box.y0, d.box.y1) };
        if (sub === S.SEL_SELECT) this.sel.clear();
        for (const o of this.objects) if (o.bbox && (d.overlap ? overlap(o.bbox, b) : inside(o.bbox, b))) this.sel.add(o);
        break;
      }
      default: break;
    }
    this.redrawAll();
  }

  selected() { return this.objects.filter((o) => this.sel.has(o)); }
  deleteSelection() {
    if (!this.sel.size) return;
    this.checkpoint();
    this.objects = this.objects.filter((o) => !this.sel.has(o));
    this.sel.clear();
    this.setModified(true);
    this.redrawAll();
  }
  copySelection(jog) {
    if (!this.sel.size) return;
    this.checkpoint();
    const copies = this.selected().map((o) => { const c = DF.cloneObject(o); translateObject(c, jog.dx, jog.dy); return c; });
    this.objects.push(...copies);
    this.sel = new Set(copies);
    this.setModified(true);
    this.redrawAll();
  }
  frontBack(front) {
    if (!this.sel.size) return;
    this.checkpoint();
    const s = this.selected(), rest = this.objects.filter((o) => !this.sel.has(o));
    this.objects = front ? rest.concat(s) : s.concat(rest);
    this.setModified(true);
    this.redrawAll();
  }
  group() {
    if (this.sel.size < 2) return;
    this.checkpoint();
    const s = this.selected();
    const idx = this.objects.indexOf(s[s.length - 1]);
    const g = { type: 'group', tag: DF.OBJ.GROUP, bbox: null, name: new Uint8Array(12).fill(32), objects: s };
    this.bound(g);
    const rest = [];
    this.objects.forEach((o, i) => { if (!this.sel.has(o)) rest.push(o); if (i === idx) rest.push(g); });
    this.objects = rest;
    this.sel = new Set([g]);
    this.setModified(true);
    this.redrawAll();
  }
  ungroup() {
    if (![...this.sel].some((o) => o.type === 'group')) return;
    this.checkpoint();
    const out = [], nsel = new Set();
    for (const o of this.objects) {
      if (this.sel.has(o) && o.type === 'group') { for (const c of o.objects) { out.push(c); nsel.add(c); } }
      else { out.push(o); if (this.sel.has(o)) nsel.add(o); }
    }
    this.objects = out; this.sel = nsel;
    this.setModified(true);
    this.redrawAll();
  }
  restyle(fn) {
    // apply to selection (recursing into groups) in select mode
    if (!this.sel.size) return false;
    this.checkpoint();
    const walk = (o) => { if (o.type === 'group') o.objects.forEach(walk); else if (o.type === 'tagged' && o.object) walk(o.object); else fn(o); };
    for (const o of this.selected()) { walk(o); this.bound(o); }
    this.setModified(true);
    this.redrawAll();
    return true;
  }
  transformSelection(fn) {
    if (!this.sel.size) return;
    this.checkpoint();
    for (const o of this.selected()) fn(o);
    this.setModified(true);
    this.redrawAll();
  }
  justify(h, v) {
    const groups = this.selected().filter((o) => o.type === 'group');
    if (!groups.length) return;
    this.checkpoint();
    for (const g of groups) {
      const b = g.bbox;
      for (const c of g.objects) {
        const cb = c.bbox;
        let dx = 0, dy = 0;
        if (h === 1) dx = b.x0 - cb.x0; else if (h === 2) dx = Math.round((b.x0 + b.x1) / 2 - (cb.x0 + cb.x1) / 2); else if (h === 3) dx = b.x1 - cb.x1;
        if (v === 1) dy = b.y1 - cb.y1; else if (v === 2) dy = Math.round((b.y0 + b.y1) / 2 - (cb.y0 + cb.y1) / 2); else if (v === 3) dy = b.y0 - cb.y0;
        if (dx || dy) translateObject(c, dx, dy);
      }
      this.bound(g);
    }
    this.setModified(true);
    this.redrawAll();
  }
  /** Interpolate / grade between the two paths in a selected group (simplified draw_select_interpolate). */
  interpolate(levels, grade) {
    const g = this.selected()[0];
    if (!g || g.type !== 'group') return false;
    const paths = g.objects.filter((o) => o.type === 'path');
    if (paths.length !== 2) return false;
    const [a, b] = paths;
    if (a.elements.length !== b.elements.length || a.elements.some((e, i) => e.t !== b.elements[i].t)) return false;
    this.checkpoint();
    const lerp = (x, y, t) => Math.round(x + (y - x) * t);
    const lc = (c1, c2, t) => {
      if ((c1 >>> 0) === TRANSPARENT || (c2 >>> 0) === TRANSPARENT) return t < 0.5 ? c1 : c2;
      const A = DF.colourRgb(c1), B = DF.colourRgb(c2);
      return DF.rgbToColour(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
    };
    const out = [a];
    for (let i = 1; i < levels; i++) {
      const t = i / levels;
      const p = DF.cloneObject(a);
      p.elements = a.elements.map((e, j) => { const f = b.elements[j], r = { t: e.t }; for (const k of ['x', 'y', 'x1', 'y1', 'x2', 'y2']) if (k in e) r[k] = lerp(e[k], f[k], t); return r; });
      p.fill = lc(a.fill, b.fill, t); p.stroke = lc(a.stroke, b.stroke, t); p.width = lerp(a.width, b.width, t);
      if (grade) p.stroke = TRANSPARENT;
      this.bound(p);
      out.push(p);
    }
    out.push(b);
    g.objects = [...g.objects.filter((o) => o !== a && o !== b), ...out];
    this.bound(g);
    this.setModified(true);
    this.redrawAll();
    return true;
  }

  // --------------------------------------------------------------------- path edit (c.DrawEdit)
  /** Enter edit mode on a path object. */
  editObject(obj) {
    if (this.main !== S.EDIT) { this.saved = { state: this.main, curved: this.curved, closed: this.closed }; }
    this.complete();
    this.abandon();
    this.sel.clear();
    this.checkpoint();
    this.main = this.sub = S.EDIT;
    this.edit = { obj, cur: -1, over: 'object', cor: null, first: -1 };
    for (const v of this.views) { v.showToolState(); v.updatePointer(); }
    this.app.noteMode(this);
    this.redrawAll();
  }
  /** Leave edit mode, restoring the previous state (restore_state). */
  leaveEdit(restore = true) {
    const e = this.edit;
    this.edit = null;
    if (e) {
      this.bound(e.obj);
      if (!this.objects.includes(e.obj)) { /* deleted */ }
    }
    if (restore && this.saved) {
      const s = this.saved;
      this.saved = null;
      this.main = this.sub = s.state;
      this.curved = s.curved; this.closed = s.closed;
      if (s.state === S.SEL && e && this.objects.includes(e.obj)) this.sel = new Set([e.obj]);
      for (const v of this.views) { v.showToolState(); v.updatePointer(); }
      this.app.noteMode(this);
    }
    this.redrawAll();
  }
  /** whatpoint: find the element / control point of the edited path under pt. */
  whatPoint(pt, grab) {
    const o = this.edit.obj;
    const box = { x0: pt.x - grab, y0: pt.y - grab, x1: pt.x + grab, y1: pt.y + grab };
    let res = null, first = -1;
    o.elements.forEach((e, i) => {
      if (e.t === PATH.MOVE) first = i;
      if (e.t === PATH.MOVE || e.t === PATH.LINE) {
        if (within(e, box)) res = { cur: i, over: e.t === PATH.MOVE ? 'moveEp' : 'lineEp', cor: ['x', 'y'], first };
      } else if (e.t === PATH.CURVE) {
        let r = null;
        if (within({ x: e.x, y: e.y }, box)) r = { over: 'curveEp', cor: ['x', 'y'] };
        if (within({ x: e.x1, y: e.y1 }, box)) r = { over: 'curveB1', cor: ['x1', 'y1'] };
        if (within({ x: e.x2, y: e.y2 }, box)) r = { over: 'curveB2', cor: ['x2', 'y2'] };
        if (r) res = { cur: i, ...r, first };
      }
    });
    if (res) return res;
    return overlap(o.bbox, box) ? { over: 'object' } : null;
  }
  editAdjust(pt, grab) {
    if (this.main !== S.EDIT) {
      const o = this.objects.slice().reverse().find((q) => q.type === 'path' && within(pt, q.bbox));
      if (o) this.editObject(o);
      else return;
    }
    const hit = this.edit ? this.whatPoint(pt, grab) : null;
    if (hit) {
      if (hit.cur != null) Object.assign(this.edit, hit);
      this.redrawAll();
      return;
    }
    // another path?
    const o = this.objects.slice().reverse().find((q) => q.type === 'path' && within(pt, q.bbox));
    if (o) { this.bound(this.edit.obj); this.edit = { obj: o, cur: -1, over: 'object', cor: null, first: -1 }; }
    else this.leaveEdit(true);
    this.redrawAll();
  }
  editDoubleAdjust(pt, grab) {
    if (!this.edit || this.saved?.state === S.SEL) return;
    const cur = this.edit.obj;
    const paths = this.objects.filter((q) => q.type === 'path' && within(pt, q.bbox));
    let prev = cur;
    for (const q of paths) { if (q === cur && prev !== cur) break; prev = q; }
    if (prev !== cur) { this.bound(cur); this.edit = { obj: prev, cur: -1, over: 'object', cor: null, first: -1 }; this.redrawAll(); }
  }
  gotElement() {
    const e = this.edit;
    if (!e || e.cur < 0) return false;
    const el = e.obj.elements[e.cur];
    return !!el && [PATH.LINE, PATH.CURVE, PATH.MOVE].includes(el.t);
  }
  /** alter_points: start dragging points. pairs: shift-drag moves bezier pairs. */
  editDragStart(pt, grab, pairs) {
    const hit = this.whatPoint(pt, grab);
    if (!hit || hit.cur == null) return false;
    Object.assign(this.edit, hit);
    const E = this.edit.obj.elements, i = hit.cur, e = E[i];
    const moves = [];                   // [element, xkey, ykey]
    const nextOf = (j) => {
      let n = j + 1;
      if (E[n]?.t === PATH.CLOSE || E[n]?.t === PATH.CLOSEGAP) { n = hit.first + 1; }
      return n;
    };
    let pair = null;
    if (hit.over === 'curveB1' || hit.over === 'curveB2') {
      moves.push([e, hit.cor[0], hit.cor[1]]);
      if (pairs) {
        if (hit.over === 'curveB1') {
          let p = i - 1;
          if (p === hit.first) { let k = i; while (E[k + 1] && E[k + 1].t !== PATH.MOVE && E[k + 1].t !== PATH.CLOSE) k++; if (E[k + 1]?.t === PATH.CLOSE) p = k; }
          if (E[p]?.t === PATH.CURVE) pair = { centre: [E[p], 'x', 'y'], other: [E[p], 'x2', 'y2'] };
        } else {
          const n = nextOf(i);
          if (E[n]?.t === PATH.CURVE) pair = { centre: [e, 'x', 'y'], other: [E[n], 'x1', 'y1'] };
        }
      }
    } else {
      moves.push([e, 'x', 'y']);
      if (e.t === PATH.CURVE) moves.push([e, 'x2', 'y2']);
      const n = e.t === PATH.MOVE ? i + 1 : i + 1;
      if (E[n]?.t === PATH.CLOSE || E[n]?.t === PATH.CLOSEGAP) {
        const f = E[hit.first]; moves.push([f, 'x', 'y']);
        const n2 = hit.first + 1; if (E[n2]?.t === PATH.CURVE) moves.push([E[n2], 'x1', 'y1']);
      } else if (E[n]?.t === PATH.CURVE) moves.push([E[n], 'x1', 'y1']);
      // a move at the start of a closed subpath: also move the closing endpoint
      if (e.t === PATH.MOVE) {
        let k = i + 1; while (E[k] && E[k].t !== PATH.MOVE && E[k].t !== PATH.CLOSE) k++;
        if (E[k]?.t === PATH.CLOSE && E[k - 1] && k - 1 > i) { moves.push([E[k - 1], 'x', 'y']); if (E[k - 1].t === PATH.CURVE) moves.push([E[k - 1], 'x2', 'y2']); }
      }
    }
    if (pair) {
      const [ce, cx, cy] = pair.centre, [oe, ox, oy] = pair.other;
      const xA = e[hit.cor[0]] - ce[cx], yA = e[hit.cor[1]] - ce[cy], xC = oe[ox] - ce[cx], yC = oe[oy] - ce[cy];
      const rA = Math.hypot(xA, yA), rC = Math.hypot(xC, yC);
      pair.ratio = rA < 256 ? 1 : rC / rA;
      pair.angle = (xC || yC ? Math.atan2(yC, xC) : 0) - (xA || yA ? Math.atan2(yA, xA) : 0);
    }
    this.edit.drag = { moves, pair, a: [e, hit.cor[0], hit.cor[1]], last: { x: e[hit.cor[0]], y: e[hit.cor[1]] } };
    this.checkpoint();
    this.sub = S.EDIT_DRAG;
    this.ptzzz = { x: e[hit.cor[0]], y: e[hit.cor[1]] };
    return true;
  }
  editMovePoints(pt) {
    const d = this.edit?.drag;
    if (!d) return;
    const [ae, ax, ay] = d.a;
    const dx = pt.x - ae[ax], dy = pt.y - ae[ay];
    const seen = new Map();
    for (const [e, kx, ky] of d.moves) {
      const s = seen.get(e) ?? new Set();
      if (s.has(kx)) continue;
      s.add(kx); seen.set(e, s);
      e[kx] += dx; e[ky] += dy;
    }
    if (d.pair) {
      const [ce, cx, cy] = d.pair.centre, [oe, ox, oy] = d.pair.other;
      const xA = ae[ax] - ce[cx], yA = ae[ay] - ce[cy];
      const r = Math.hypot(xA, yA) * d.pair.ratio, th = Math.atan2(yA, xA) + d.pair.angle;
      oe[ox] = Math.round(ce[cx] + r * Math.cos(th)); oe[oy] = Math.round(ce[cy] + r * Math.sin(th));
    }
    this.setModified(true);
  }
  editDragEnd() {
    if (this.sub !== S.EDIT_DRAG) return;
    this.sub = S.EDIT;
    if (this.edit) { delete this.edit.drag; this.bound(this.edit.obj); }
    this.redrawAll();
  }
  editOp(op, arg) {
    const e = this.edit;
    if (!e) return;
    const o = e.obj, E = o.elements;
    const cur = e.cur, el = E[cur];
    this.checkpoint();
    switch (op) {
      case 'curve': case 'line':
        if (!this.gotElement()) return;
        if (el.t === PATH.MOVE) { if (cur > 0) this.changeToLineFromMove(o, cur, op); }
        else this.changeLineCurve(o, cur - 1, cur, op === 'curve' ? PATH.CURVE : PATH.LINE);
        break;
      case 'move': {
        if (!this.gotElement() || el.t === PATH.MOVE) return;
        let k = cur; while (E[k + 1] && ![PATH.MOVE, PATH.CLOSE, PATH.CLOSEGAP].includes(E[k + 1].t)) k++;
        if (E[k + 1]?.t === PATH.CLOSE) {
          const f = E[e.first];
          E.splice(cur, 1, { t: PATH.LINE, x: f.x, y: f.y }, { t: PATH.CLOSE }, { t: PATH.MOVE, x: f.x, y: f.y }, { t: PATH.LINE, x: el.x, y: el.y });
        } else E[cur] = { t: PATH.MOVE, x: el.x, y: el.y };
        break;
      }
      case 'add': {
        if (!this.gotElement() || el.t === PATH.MOVE) return;
        const [px, py] = endPoint(E[cur - 1]);
        if (el.t === PATH.LINE) E.splice(cur, 0, { t: PATH.LINE, x: Math.trunc((el.x + px) / 2), y: Math.trunc((el.y + py) / 2) });
        else {
          // de Casteljau split at t = 0.5 (fit_mid_curve)
          const h = (a, b) => Math.trunc((a + b) / 2);
          const b1x = h(px, el.x1), b1y = h(py, el.y1), tx = h(el.x1, el.x2), ty = h(el.y1, el.y2);
          const b2x = h(b1x, tx), b2y = h(b1y, ty), c2x = h(el.x2, el.x), c2y = h(el.y2, el.y);
          const c1x = h(tx, c2x), c1y = h(ty, c2y), mx = h(b2x, c1x), my = h(b2y, c1y);
          E.splice(cur, 1, { t: PATH.CURVE, x1: b1x, y1: b1y, x2: b2x, y2: b2y, x: mx, y: my }, { t: PATH.CURVE, x1: c1x, y1: c1y, x2: c2x, y2: c2y, x: el.x, y: el.y });
        }
        break;
      }
      case 'delete': this.editDeleteSegment(); break;
      case 'flatten': this.editFlatten(); break;
      case 'open': case 'close': {
        if (!this.gotElement()) return;
        let k = cur; while (E[k + 1] && ![PATH.MOVE, PATH.CLOSE, PATH.CLOSEGAP].includes(E[k + 1].t)) k++;
        const closed = E[k + 1]?.t === PATH.CLOSE || E[k + 1]?.t === PATH.CLOSEGAP;
        if (op === 'open' && closed) { E[k].x += arg?.dx ?? 0; E[k].y += arg?.dy ?? 0; E.splice(k + 1, 1); }
        else if (op === 'close' && !closed) { const f = E[e.first]; E[k].x = f.x; E[k].y = f.y; E.splice(k + 1, 0, { t: PATH.CLOSE }); }
        break;
      }
      case 'setpoint': if (e.cor && el) { el[e.cor[0]] = arg.x; el[e.cor[1]] = arg.y; } break;
      case 'snap': for (const q of E) for (const [a, b] of (q.t === PATH.CURVE ? [['x1', 'y1'], ['x2', 'y2'], ['x', 'y']] : q.t === PATH.MOVE || q.t === PATH.LINE ? [['x', 'y']] : [])) { const p = arg({ x: q[a], y: q[b] }); q[a] = p.x; q[b] = p.y; } break;
      default: break;
    }
    this.bound(o);
    this.setModified(true);
    this.redrawAll();
  }
  changeToLineFromMove(o, cur, op) {
    const E = o.elements, el = E[cur];
    E[cur] = { t: PATH.LINE, x: el.x, y: el.y };
    if (op === 'curve') this.changeLineCurve(o, cur - 1, cur, PATH.CURVE);
  }
  editDeleteSegment() {
    const e = this.edit, E = e.obj.elements, cur = e.cur, el = E[cur];
    if (!this.gotElement() || el.t === PATH.MOVE) return;
    const next = E[cur + 1], prev = E[cur - 1];
    let from = cur, count = 1, deselect = false;
    if (next && (next.t === PATH.CLOSE || next.t === PATH.CLOSEGAP)) {
      const f = E[e.first]; const [px, py] = endPoint(prev); f.x = px; f.y = py;
    }
    deselect = !next || next.t === PATH.MOVE;
    if (prev && prev.t === PATH.MOVE) {
      if (next && (next.t === PATH.CLOSE || next.t === PATH.CLOSEGAP)) count++;
      if (!next || next.t === PATH.MOVE || next.t === PATH.CLOSE || next.t === PATH.CLOSEGAP) { from--; count++; deselect = true; }
    }
    E.splice(from, count);
    if (deselect) { e.cur = -1; e.cor = null; }
    else if (e.cur >= E.length) e.cur = -1;
    if (!E.some((q) => q.t === PATH.LINE || q.t === PATH.CURVE)) {
      this.objects = this.objects.filter((q) => q !== e.obj);
      this.edit = null;
      this.leaveEdit(true);
    }
  }
  editFlatten() {
    const e = this.edit, E = e.obj.elements, cur = e.cur, c = E[cur];
    if (!c || (c.t !== PATH.LINE && c.t !== PATH.CURVE)) return;
    let n = E[cur + 1];
    if (n && (n.t === PATH.CLOSE || n.t === PATH.CLOSEGAP)) n = E[e.first + 1];
    if (!n || (n.t !== PATH.LINE && n.t !== PATH.CURVE)) return;
    if (c.t !== PATH.CURVE && n.t !== PATH.CURVE) return;
    if (c.t === PATH.CURVE && n.t === PATH.CURVE) {
      const a1 = Math.atan2(c.y - c.y2, c.x - c.x2), l1 = Math.hypot(c.x - c.x2, c.y - c.y2);
      const a2 = Math.atan2(n.y1 - c.y, n.x1 - c.x), l2 = Math.hypot(n.x1 - c.x, n.y1 - c.y);
      const diff = ((a2 - a1 + 16 * Math.PI) % (2 * Math.PI));
      const ang = diff < Math.PI ? diff / 2 + a1 : diff / 2 + a1 + Math.PI;
      c.x2 = c.x - Math.trunc(l1 * Math.cos(ang)); c.y2 = c.y - Math.trunc(l1 * Math.sin(ang));
      n.x1 = c.x + Math.trunc(l2 * Math.cos(ang)); n.y1 = c.y + Math.trunc(l2 * Math.sin(ang));
    } else if (c.t === PATH.CURVE) {
      const ang = Math.atan2(n.y - c.y, n.x - c.x), l = Math.hypot(c.x - c.x2, c.y - c.y2);
      c.x2 = c.x - Math.trunc(l * Math.cos(ang)); c.y2 = c.y - Math.trunc(l * Math.sin(ang));
    } else {
      const [sx, sy] = endPoint(E[cur - 1]);
      const ang = Math.atan2(c.y - sy, c.x - sx), l = Math.hypot(c.x - n.x1, c.y - n.y1);
      n.x1 = c.x + Math.trunc(l * Math.cos(ang)); n.y1 = c.y + Math.trunc(l * Math.sin(ang));
    }
  }
  editCloseCheck() {
    const e = this.edit;
    if (!this.gotElement()) return { closed: false };
    const E = e.obj.elements;
    let k = e.cur; while (E[k + 1] && ![PATH.MOVE, PATH.CLOSE, PATH.CLOSEGAP].includes(E[k + 1].t)) k++;
    return { closed: E[k + 1]?.t === PATH.CLOSE || E[k + 1]?.t === PATH.CLOSEGAP };
  }
  /** Which edit menu entries are available (edit_check). */
  editChecks() {
    const e = this.edit;
    const got = this.gotElement();
    const r = { got, move: false, line: false, curve: false, enter: false, closed: false };
    if (!e || !(got || e.over === 'moveEp')) return r;
    const E = e.obj.elements, cur = E[e.cur], prev = E[e.cur - 1];
    r.move = r.line = r.curve = r.enter = true;
    let next;
    if (cur.t === PATH.MOVE) {
      r.move = false;
      if (!prev || prev.t === PATH.MOVE) r.line = r.curve = false;
      next = E[e.cur + 1];
    } else { if (cur.t === PATH.LINE) r.line = false; else r.curve = false; next = E[e.cur + 1]; }
    if (!(prev && (prev.t === PATH.LINE || prev.t === PATH.CURVE) && next && (next.t === PATH.LINE || next.t === PATH.CURVE))) r.move = false;
    r.closed = this.editCloseCheck().closed;
    return r;
  }
}

// ======================================================================================= View
/** Pixel helpers for crisp overlay drawing (ctx in work-area px). */
function blob(g, x, y, colour) { g.fillStyle = colour; g.fillRect(Math.round(x) - 4, Math.round(y) - 4, 8, 8); }
function line(g, x0, y0, x1, y1, colour) { g.strokeStyle = colour; g.lineWidth = 1; g.beginPath(); g.moveTo(Math.round(x0) + 0.5, Math.round(y0) + 0.5); g.lineTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5); g.stroke(); }
function rectOutline(g, x0, y0, x1, y1, colour, dotted) {
  x0 = Math.round(x0); x1 = Math.round(x1); y0 = Math.round(y0); y1 = Math.round(y1);
  if (x0 > x1) [x0, x1] = [x1, x0];
  if (y0 > y1) [y0, y1] = [y1, y0];
  g.fillStyle = colour;
  if (!dotted) { g.fillRect(x0, y0, x1 - x0 + 1, 1); g.fillRect(x0, y1, x1 - x0 + 1, 1); g.fillRect(x0, y0, 1, y1 - y0 + 1); g.fillRect(x1, y0, 1, y1 - y0 + 1); return; }
  // dot pattern &CC: 2 on, 2 off, continuing round the box
  let n = 0;
  const dot = (x, y) => { if (((0xCC >> (7 - (n++ & 7))) & 1)) g.fillRect(x, y, 1, 1); };
  for (let x = x0; x < x1; x++) dot(x, y1);
  for (let y = y1; y > y0; y--) dot(x1, y);
  for (let x = x1; x > x0; x--) dot(x, y0);
  for (let y = y0; y < y1; y++) dot(x0, y);
}

export class View {
  constructor(app, diag, win, pane) {
    this.app = app; this.diag = diag; this.win = win; this.pane = pane;
    const o = app.options;
    this.zoom = { mul: o.zoomMul, div: o.zoomDiv }; this.lastzoom = { mul: 1, div: 1 };
    this.zoomLock = !!o.zoomLock;
    this.showPane = !!o.toolbox;
    const g = o.grid;
    this.grid = {
      show: !!g.show, lock: !!g.lock, auto: !!g.auto, iso: !!g.iso,
      xinch: !g.cm, yinch: !g.cm,
      unit: [{ space: [g.cm ? 1 : g.space, g.cm ? 1 : g.space], divide: [g.cm ? 4 : g.divide, g.cm ? 4 : g.divide] },
        { space: [g.cm ? g.space : 1, g.cm ? g.space : 1], divide: [g.cm ? g.divide : 2, g.cm ? g.divide : 2] }],
      colour: COLOURS.grid, space: [0, 0], divide: [1, 1],
    };
    this.setGridState();
  }
  get k() { return this.zoom.mul / this.zoom.div / 512; }
  get extH() { return Math.ceil(this.diag.viewLimit.y1 * this.k); }
  get extW() { return Math.ceil(this.diag.viewLimit.x1 * this.k); }
  toWork(x, y) { return { x: x * this.k, y: this.extH - y * this.k }; }
  fromWork(wx, wy) { return { x: Math.round(wx / this.k), y: Math.round((this.extH - wy) / this.k) }; }
  /** Grab box half-size (draw units) for this zoom (draw_scaledown(grabW)). */
  get grab() { return Math.round(GRAB * 256 / (this.zoom.mul / this.zoom.div)); }

  updateTitle() {
    const d = this.diag;
    let t = d.title;
    const n = d.views.length;
    if (n > 1) t += (d.modified ? ' * ' : ' ') + n + (this.grid.lock ? this.app.msg('DrawG1') : '');
    else t += (d.modified ? ' *' : '') + (this.grid.lock ? this.app.msg('DrawG1') : '');
    this.win.setTitle(t);
  }

  /** draw_setextent */
  setExtent() { this.win.setExtent({ x0: 0, y0: 0, x1: this.extW, y1: this.extH }); this.invalidate(); }
  invalidate() { this.win.invalidate(); }

  showToolState() {
    const d = this.diag, I = this.pane.icons;
    const on = d.main === S.PATH ? (d.curved ? (d.closed ? 3 : 2) : (d.closed ? 1 : 0)) : d.main === S.RECT ? 6 : d.main === S.ELLI ? 7 : d.main === S.TEXT ? 5 : d.main === S.SEL ? 8 : -1;
    [0, 1, 2, 3, 5, 6, 7, 8].forEach((i) => { if (I[i] && I[i].selected !== (i === on)) I[i].setState({ selected: i === on }); });
  }
  updatePointer() {
    const m = this.diag.main;
    this.win.pointer = m === S.PATH || m === S.RECT || m === S.ELLI ? 'drawcrosshairs' : '';
  }

  // ------------------------------------------------------------------ grid
  setGridState() {
    const g = this.grid, scale = this.zoom.mul / this.zoom.div;
    for (let xy = 0; xy < 2; xy++) {
      const inch = xy === 0 ? g.xinch : g.yinch;
      const u = g.unit[inch ? 0 : 1];
      let space = (inch ? dbc.OneInch : dbc.OneCm) * u.space[xy];
      let divide = u.divide[xy];
      if (g.auto) {
        const base = space / divide, twice = 2 * base, half = base / 2;
        if (space < 0.01) space = 0.01;
        if (divide < 1) divide = 1;
        const ss = scale * space;
        while (ss / divide > twice) divide *= 2;
        if (ss / divide < half) {
          let two = true;
          do {
            if (two && divide % 2 === 0) { divide /= 2; two = false; }
            else if (divide % 5 === 0) { divide /= 5; two = true; }
            else break;
          } while (divide > 1 && ss / divide < half);
        }
        while (divide > 1 && ss / divide < half) divide = Math.floor(divide / 2);
        if (!divide) divide = 1;
        if (ss / divide < half) { divide = 1; do space *= 2; while (scale * space < half); }
      }
      g.space[xy] = space; g.divide[xy] = divide;
    }
  }
  snap(pt) {
    const g = this.grid;
    let xspace = Math.trunc(g.space[0] / g.divide[0]), yspace = Math.trunc(g.space[1] / g.divide[1]);
    if (!g.iso) {
      const r = (v, s) => (s ? Math.round(v / s) * s : v);
      return { x: r(pt.x, xspace), y: r(pt.y, yspace) };
    }
    xspace = Math.trunc(0.866025404 * yspace); yspace = Math.trunc((yspace + 1) / 2);
    if (!xspace || !yspace) return pt;
    const x0 = Math.floor(pt.x / xspace) * xspace, col = Math.floor(x0 / xspace), x1 = x0 + xspace;
    let y0 = Math.floor(pt.y / yspace) * yspace; const row = Math.floor(y0 / yspace);
    let y1;
    if ((row & 1) === (col & 1)) y1 = y0 + yspace; else { y1 = y0; y0 += yspace; }
    return (x0 - pt.x) ** 2 + (y0 - pt.y) ** 2 < (x1 - pt.x) ** 2 + (y1 - pt.y) ** 2 ? { x: x0, y: y0 } : { x: x1, y: y1 };
  }
  snapIfLocked(pt) { return this.grid.lock ? this.snap(pt) : pt; }
  /** draw_grid_jog: offset used when copying. */
  jog() {
    const g = this.grid;
    let xs, ys;
    if (g.lock) {
      if (g.iso) { ys = Math.trunc(g.space[1] / g.divide[1]); xs = Math.trunc(0.866025404 * ys); ys = Math.trunc(ys / 2); }
      else { xs = Math.trunc(g.space[0] / g.divide[0]); ys = Math.trunc(g.space[1] / g.divide[1]); }
    } else if (g.iso) { ys = dbc.HalfCm; xs = Math.trunc(0.866025404 * ys); ys = Math.trunc(ys / 2); }
    else xs = ys = dbc.HalfCm;
    return { dx: xs, dy: -ys };
  }

  paintGrid(g, r) {
    const G = this.grid, k = this.k;
    g.fillStyle = WIMP_COLOURS[G.colour & 15];
    const clip = { x0: r.x0 / k, x1: r.x1 / k, y0: (this.extH - r.y1) / k, y1: (this.extH - r.y0) / k };
    const X = (x) => Math.floor(x * k), Y = (y) => Math.floor(this.extH - y * k);
    const cross = (px, py) => { g.fillRect(px - 3, py, 7, 1); g.fillRect(px, py - 2, 1, 5); };
    if (G.iso) {
      let yInc = G.space[0], ySteps = G.divide[0];
      const ySub = yInc / ySteps;
      const xInc = 0.866025404 * yInc * 2, xSub = 0.866025404 * ySub;
      yInc /= 2;
      const yDelta = yInc / ySteps;
      let y = Math.floor(clip.y0 / yInc) * yInc - yInc;
      let row = Math.round(y / yInc);
      for (; y < clip.y1 + yInc; y += yInc, row++) {
        const shift = (row & 1) ? xInc / 2 : 0;
        for (let x = Math.floor(clip.x0 / xInc) * xInc - xInc + shift; x < clip.x1 + xInc; x += xInc) {
          cross(X(x), Y(y));
          for (let i = 1; i < ySteps; i++) g.fillRect(X(x), Y(y + i * ySub), 1, 1);
          for (let i = 1; i < ySteps; i++) { const yy = y + i * yDelta; g.fillRect(X(x + i * xSub), Y(yy), 1, 1); g.fillRect(X(x + xInc - i * xSub), Y(yy), 1, 1); }
        }
      }
      return;
    }
    const yInc = G.space[1], xInc = G.space[0];
    let ySub = yInc / G.divide[1], xSub = xInc / G.divide[0];
    const pix = 512;          // one pixel in draw units at 1:1 (pixsize)
    if (k * ySub * 512 < 1) ySub = pix / (k * 512);
    if (k * xSub * 512 < 1) xSub = pix / (k * 512);
    const y0 = Math.floor(clip.y0 / ySub - 1) * ySub, y1 = clip.y1 + ySub, x0 = Math.floor(clip.x0 / xSub - 1) * xSub, x1 = clip.x1 + xSub;
    for (let y = y0; y <= y1; y += ySub) { const py = Y(y); for (let x = x0; x <= x1; x += xSub) g.fillRect(X(x), py, 1, 1); }
    if (yInc * k >= 1 && xInc * k >= 1) {
      for (let y = Math.floor(clip.y0 / yInc - 1) * yInc; y <= clip.y1 + yInc; y += yInc)
        for (let x = Math.floor(clip.x0 / xInc - 1) * xInc; x <= clip.x1 + xInc; x += xInc) cross(X(x), Y(y));
    }
  }

  // ------------------------------------------------------------------ redraw (paper_redraw)
  redraw(g, r) {
    const d = this.diag, k = this.k, H = this.extH;
    const view = { k, ox: 0, oy: H, fonts: d.fonts, clip: { x0: r.x0 / k - 1024, x1: r.x1 / k + 1024, y0: (H - r.y1) / k - 1024, y1: (H - r.y0) / k + 1024 }, onReady: () => this.invalidate() };
    // paper limits (printable area) in the print margin colour
    if (d.paper.options & PAPER.Show) {
      const page = d.viewLimit, m = dbc.QuarterInch;
      g.fillStyle = WIMP_COLOURS[COLOURS.printmargin];
      const P = this.toWork(page.x0, page.y1), Q = this.toWork(page.x1, page.y0), M = m * k;
      g.fillRect(P.x, P.y, Q.x - P.x, M); g.fillRect(P.x, Q.y - M, Q.x - P.x, M);
      g.fillRect(P.x, P.y, M, Q.y - P.y); g.fillRect(Q.x - M, P.y, M, Q.y - P.y);
    }
    const editObj = d.main === S.EDIT ? d.edit?.obj : null;
    for (const o of d.objects) if (o !== editObj) DF.renderObject(g, o, view);
    this.paintSkeleton(g, view);
    if (d.main === S.SEL && d.sel.size) this.paintBBoxes(g);
    if (this.grid.show) this.paintGrid(g, r);
  }

  W(x, y) { return [x * this.k, this.extH - y * this.k]; }

  strokeThin(g, elements, colour) {
    DF.buildPath(g, elements, { k: this.k, ox: 0, oy: this.extH });
    g.strokeStyle = colour; g.lineWidth = 1; g.setLineDash([]); g.stroke();
  }
  segment(g, prev, e, colour) {
    const [px, py] = endPoint(prev);
    this.strokeThin(g, [{ t: PATH.MOVE, x: px, y: py }, e], colour);
  }

  paintSkeleton(g, view) {
    const d = this.diag, C = (n) => WIMP_COLOURS[n];
    const grey = C(COLOURS.skeleton), red = C(COLOURS.highlight), blue = C(COLOURS.anchor), orange = C(COLOURS.bezier);
    switch (d.sub) {
      case S.P_MOVE: case S.P1: case S.P2: case S.P3: {
        const E = d.cons.elements;
        this.strokeThin(g, E, grey);
        if (d.sub !== S.P_MOVE) {
          const z = E[d.ptz], y = E[d.pty];
          this.segment(g, E[d.ptz - 1], z, red);
          if (z.t === PATH.CURVE) { const [x0, y0] = this.W(...endPoint(E[d.ptz - 1])), [x1, y1] = this.W(z.x1, z.y1); line(g, x0, y0, x1, y1, grey); blob(g, x1, y1, orange); }
          if (y.t === PATH.CURVE) { const [x2, y2] = this.W(y.x2, y.y2), [x3, y3] = this.W(y.x, y.y); line(g, x2, y2, x3, y3, grey); blob(g, x2, y2, orange); }
        }
        const end = d.sub === S.P_MOVE ? E.length : d.ptz;
        for (let i = 0; i < end; i++) if (E[i].t !== PATH.CLOSE) { const [x, y] = this.W(E[i].x, E[i].y); blob(g, x, y, blue); }
        break;
      }
      case S.RECT_DRAG: {
        const E = d.cons.elements;
        const [x0, y0] = this.W(E[0].x, E[0].y), [x1, y1] = this.W(E[2].x, E[2].y);
        rectOutline(g, x0, y0, x1, y1, grey);
        break;
      }
      case S.ELLI_DRAG: this.strokeThin(g, d.cons.elements, grey); break;
      case S.T_CHAR: DF.renderObject(g, d.cons, { ...view, clip: null }); break;
      case S.SEL_SELECT: case S.SEL_ADJUST: case S.ZOOM: {
        const b = d.drag.box;
        const [x0, y0] = this.W(b.x0, b.y0), [x1, y1] = this.W(b.x1, b.y1);
        rectOutline(g, x0, y0, x1, y1, grey);
        break;
      }
      case S.SEL_TRANS: for (const o of d.selected()) { const b = o.bbox; const [x0, y0] = this.W(b.x0 + d.drag.dx, b.y0 + d.drag.dy), [x1, y1] = this.W(b.x1 + d.drag.dx, b.y1 + d.drag.dy); rectOutline(g, x0, y0, x1, y1, grey); } break;
      case S.SEL_SCALE: {
        const dr = d.drag;
        for (const o of d.selected()) {
          const b = o.bbox;
          const x1 = dr.oldDx ? b.x0 + (b.x1 - b.x0) * dr.newDx / dr.oldDx : b.x0;
          const y0 = dr.oldDy ? b.y1 + (b.y0 - b.y1) * dr.newDy / dr.oldDy : b.y1;
          const [X0, Y0] = this.W(b.x0, y0), [X1, Y1] = this.W(x1, b.y1);
          rectOutline(g, X0, Y0, X1, Y1, grey);
        }
        break;
      }
      case S.SEL_ROTATE: {
        const dr = d.drag;
        for (const o of d.selected()) {
          const b = o.bbox, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
          const R = (x, y) => this.W(cx + (x - cx) * dr.cos - (y - cy) * dr.sin, cy + (x - cx) * dr.sin + (y - cy) * dr.cos);
          const p = [R(b.x0, b.y0), R(b.x1, b.y0), R(b.x1, b.y1), R(b.x0, b.y1)];
          for (let i = 0; i < 4; i++) line(g, ...p[i], ...p[(i + 1) % 4], grey);
        }
        break;
      }
      case S.EDIT: case S.EDIT_DRAG: {
        const e = d.edit;
        if (!e) break;
        const E = e.obj.elements;
        let prev = null;
        for (const q of E) {
          if (q.t === PATH.MOVE || q.t === PATH.LINE) { const [x, y] = this.W(q.x, q.y); blob(g, x, y, blue); }
          else if (q.t === PATH.CURVE && prev) {
            const [x0, y0] = this.W(...endPoint(prev)), [x1, y1] = this.W(q.x1, q.y1), [x2, y2] = this.W(q.x2, q.y2), [x3, y3] = this.W(q.x, q.y);
            line(g, x0, y0, x1, y1, grey); blob(g, x1, y1, orange);
            line(g, x2, y2, x3, y3, grey); blob(g, x2, y2, orange);
            blob(g, x3, y3, blue);
          }
          if (q.t !== PATH.CLOSE && q.t !== PATH.CLOSEGAP) prev = q;
        }
        const c = E[e.cur];
        if (c) {
          if (c.t !== PATH.MOVE && E[e.cur - 1]) this.segment(g, E[e.cur - 1], c, red);
          const [x, y] = this.W(c.x, c.y);
          blob(g, x, y, red);
        }
        this.strokeThin(g, E, grey);
        break;
      }
      default: break;
    }
  }

  paintBBoxes(g) {
    const d = this.diag, red = WIMP_COLOURS[COLOURS.bbox];
    for (const o of d.selected()) {
      const b = o.bbox;
      const [x0, y1] = this.W(b.x0, b.y0), [x1, y0] = this.W(b.x1, b.y1);   // y0 = top
      rectOutline(g, x0, y0, x1, y1, red, true);
      // stretch box (bottom right, outside) and rotate box (top right)
      rectOutline(g, x1, y1, x1 + 8, y1 + 8, red);
      if (isRotatable(o, d.fonts)) rectOutline(g, x1, y0 - 8, x1 + 8, y0, red);
    }
  }
}

export { translateObject, scaleObject, rotateObject, isRotatable, makeRotatable };
