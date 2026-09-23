// BBC BASIC V expression compiler.
//
// Tokenised line bytes are parsed once and compiled into closures ("nodes"). Each node has a
// static type t (TI int, TF real, TS string, TN numeric-but-dynamic, TA any-dynamic) and a
// closure f() returning the value. Dynamic nodes set I.t (0 int, 1 real, 2 string) before returning.
//
// Operations that may need to suspend (FN calls, GET, INKEY, EVAL, USR, OPENxx...) are hoisted
// out of the expression into statement-level micro-ops ("pre-ops") that store their result in a
// temp slot of the current activation (I.tmp / I.tmpT); the expression then just reads the temp.
// This keeps the interpreter fully cooperative (it can yield anywhere) while ordinary expression
// evaluation stays fast.
import { T, TF as TFN, TS as TST } from './tokens.js';
import { err } from './errors.js';
import { formatNumber, formatHex, toInt, readNumber, valOf } from './numfmt.js';

export const TI = 0, TF = 1, TS = 2, TN = 3, TA = 4;
const MAXF = 1.7014118346046923e38; // largest BASIC V 5 byte real

/** Error thrown while compiling; turned into a runtime error op. */
export class CompileError extends Error {
  constructor(key) { super(key); this.key = key; }
}
export const cerr = (k) => new CompileError(k);

export const isDigit = (c) => c >= 48 && c <= 57;
export const isWordC = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 95 && c <= 122);

// ---------------------------------------------------------------------------
// Generic value helpers used by compiled code
// ---------------------------------------------------------------------------
export function chkF(v) {
  if (v > MAXF || v < -MAXF || v !== v) throw err('FOVR');
  return v;
}

/** Make a node that throws a BASIC error when evaluated. */
export function errNode(key, t = TA) {
  return { t, f: () => { throw err(key); } };
}

// Coercion wrappers ---------------------------------------------------------
export function numNode(I, n) {
  // returns a node guaranteed numeric (TI/TF/TN); strings -> type mismatch
  if (n.t === TS) return errNode('ERTYPEINT', TN);
  if (n.t === TA) {
    const f = n.f;
    return { t: TN, f: () => { const v = f(); if (I.t === TS) throw err('ERTYPEINT'); return v; } };
  }
  return n;
}
/** closure returning an int32 (INTEGY) */
export function intF(I, n) {
  const f = n.f;
  switch (n.t) {
    case TI: return f;
    case TF: return () => toInt(f());
    case TN: return () => { const v = f(); return I.t === TI ? v : toInt(v); };
    case TS: return () => { f(); throw err('ERTYPEINT'); };
    default: return () => { const v = f(); const t = I.t; if (t === TI) return v; if (t === TF) return toInt(v); throw err('ERTYPEINT'); };
  }
}
/** closure returning a float */
export function fltF(I, n) {
  const f = n.f;
  switch (n.t) {
    case TI: case TF: case TN: return f;
    case TS: return () => { f(); throw err('ERTYPEINT'); };
    default: return () => { const v = f(); if (I.t === TS) throw err('ERTYPEINT'); return v; };
  }
}
/** closure returning a string */
export function strF(I, n) {
  const f = n.f;
  switch (n.t) {
    case TS: return f;
    case TA: return () => { const v = f(); if (I.t !== TS) throw err('ERTYPESTR'); return v; };
    default: return () => { f(); throw err('ERTYPESTR'); };
  }
}
/** closure returning value of a numeric node and setting I.t (for dynamic consumers) */
export function dynF(I, n) {
  const f = n.f;
  switch (n.t) {
    case TI: return () => { const v = f(); I.t = TI; return v; };
    case TF: return () => { const v = f(); I.t = TF; return v; };
    case TS: return () => { const v = f(); I.t = TS; return v; };
    default: return f;
  }
}

// ---------------------------------------------------------------------------
// RND (DORANDOM / FRNDAA from Factor)
// ---------------------------------------------------------------------------
export function rndNext(I) {
  const r2 = I.seed | 0; const c = I.seedHi & 1;
  let i = ((c << 31) | (r2 >>> 1)) | 0;
  const newHi = r2 & 1;
  i = (i ^ (r2 << 12)) | 0;
  i = (i ^ (i >>> 20)) | 0;
  I.seed = i; I.seedHi = newHi;
  return i;
}
export function rndFloat(i) {
  let x = (i ^ 0x80) | 0;
  x = (x ^ (x << 8)) | 0;
  x = (x ^ (x << 16)) | 0;
  return (x >>> 0) / 4294967296;
}

// String helpers ------------------------------------------------------------
export function strCat(a, b) {
  if (a.length + b.length > 255) throw err('ERLONG');
  return a + b;
}

// ---------------------------------------------------------------------------
// Binary operators
// ---------------------------------------------------------------------------
function lsl(a, n) { n &= 255; return n >= 32 ? 0 : (a << n) | 0; }
function asr(a, n) { n &= 255; return n >= 32 ? (a >> 31) : (a >> n); }
function lsr(a, n) { n &= 255; return n >= 32 ? 0 : (a >>> n) | 0; }

function numKinds(a, b) {
  // returns 'ii' | 'ff' | 'dyn'
  if (a.t === TI && b.t === TI) return 'ii';
  if ((a.t === TI || a.t === TF) && (b.t === TI || b.t === TF)) return 'ff';
  return 'dyn';
}

/** Evaluate l and r dynamically: returns [a, ta, b, tb] into scratch */
function binDyn(I, l, r, fn) {
  const lf = l.f, rf = r.f;
  const lt = l.t, rt = r.t;
  return () => {
    const a = lf(); const ta = lt <= TS ? lt : I.t;
    const b = rf(); const tb = rt <= TS ? rt : I.t;
    return fn(a, ta, b, tb);
  };
}

export function binop(I, op, l, r) {
  switch (op) {
    case '+': return addOp(I, l, r);
    case '-': return arith(I, l, r, (a, b) => (a - b) | 0, (a, b) => chkF(a - b));
    case '*': return mulOp(I, l, r);
    case '/': {
      const a = fltF(I, numNode(I, l)), b = fltF(I, numNode(I, r));
      return { t: TF, f: () => { const x = a(); const y = b(); if (y === 0) throw err('ZDIVOR'); return chkF(x / y); } };
    }
    case 'DIV': {
      const a = intF(I, l), b = intF(I, r);
      return { t: TI, f: () => { const x = a(); const y = b(); if (y === 0) throw err('ZDIVOR'); return (x / y) | 0; } };
    }
    case 'MOD': {
      const a = intF(I, l), b = intF(I, r);
      return { t: TI, f: () => { const x = a(); const y = b(); if (y === 0) throw err('ZDIVOR'); return (x % y) | 0; } };
    }
    case '^': return powOp(I, l, r);
    case 'AND': { const a = intF(I, l), b = intF(I, r); return { t: TI, f: () => a() & b() }; }
    case 'OR': { const a = intF(I, l), b = intF(I, r); return { t: TI, f: () => a() | b() }; }
    case 'EOR': { const a = intF(I, l), b = intF(I, r); return { t: TI, f: () => a() ^ b() }; }
    case '<<': { const a = intF(I, l), b = intF(I, r); return { t: TI, f: () => lsl(a(), b()) }; }
    case '>>': { const a = intF(I, l), b = intF(I, r); return { t: TI, f: () => asr(a(), b()) }; }
    case '>>>': { const a = intF(I, l), b = intF(I, r); return { t: TI, f: () => lsr(a(), b()) }; }
    default: return compareOp(I, op, l, r);
  }
}

function addOp(I, l, r) {
  if (l.t === TS && r.t === TS) {
    const a = l.f, b = r.f;
    return { t: TS, f: () => strCat(a(), b()) };
  }
  if (l.t === TS) { const a = l.f, b = r.f; return { t: TS, f: () => { a(); b(); throw err('ERTYPESTR'); } }; }
  if (r.t === TS && l.t !== TA) { const a = l.f, b = r.f; return { t: TN, f: () => { a(); b(); throw err('ERTYPEINT'); } }; }
  if (l.t === TA || r.t === TA) {
    return {
      t: TA, f: binDyn(I, l, r, (a, ta, b, tb) => {
        if (ta === TS) { if (tb !== TS) throw err('ERTYPESTR'); I.t = TS; return strCat(a, b); }
        if (tb === TS) throw err('ERTYPEINT');
        if (ta === TI && tb === TI) { I.t = TI; return (a + b) | 0; }
        I.t = TF; return chkF(a + b);
      }),
    };
  }
  return arith(I, l, r, (a, b) => (a + b) | 0, (a, b) => chkF(a + b));
}

function arith(I, l, r, iop, fop) {
  l = numNode(I, l); r = numNode(I, r);
  const k = numKinds(l, r);
  const a = l.f, b = r.f;
  if (k === 'ii') return { t: TI, f: () => iop(a(), b()) };
  if (k === 'ff') return { t: TF, f: () => fop(a(), b()) };
  return {
    t: TN, f: binDyn(I, l, r, (x, tx, y, ty) => {
      if (tx === TI && ty === TI) { I.t = TI; return iop(x, y); }
      I.t = TF; return fop(x, y);
    }),
  };
}

const B500 = 0xB500;
function mulOp(I, l, r) {
  l = numNode(I, l); r = numNode(I, r);
  const k = numKinds(l, r);
  const a = l.f, b = r.f;
  if (k === 'ff' && (l.t === TF || r.t === TF)) return { t: TF, f: () => chkF(a() * b()) };
  const imul = (x, y) => {
    if (x <= B500 && x >= -B500 && y <= B500 && y >= -B500) { I.t = TI; return Math.imul(x, y); }
    I.t = TF; return chkF(x * y);
  };
  if (k === 'ii') return { t: TN, f: () => imul(a(), b()) };
  return {
    t: TN, f: binDyn(I, l, r, (x, tx, y, ty) => {
      if (tx === TI && ty === TI) return imul(x, y);
      I.t = TF; return chkF(x * y);
    }),
  };
}

export function powF(x, y) {
  if (Number.isInteger(y) && Math.abs(y) < 64) {
    if (x === 0 && y < 0) throw err('ZDIVOR');
    return chkF(Math.pow(x, y));
  }
  if (x < 0) throw err('ERFLOG');
  if (x === 0) { if (y > 0) return 0; throw err('ERFLOG'); }
  const r = Math.pow(x, y);
  if (!Number.isFinite(r)) throw err('ERFEXP');
  return chkF(r);
}
function powOp(I, l, r) {
  const a = fltF(I, numNode(I, l)), b = fltF(I, numNode(I, r));
  return { t: TF, f: () => powF(a(), b()) };
}

function cmpFn(op) {
  switch (op) {
    case '=': return (a, b) => (a === b ? -1 : 0);
    case '<>': return (a, b) => (a !== b ? -1 : 0);
    case '<': return (a, b) => (a < b ? -1 : 0);
    case '>': return (a, b) => (a > b ? -1 : 0);
    case '<=': return (a, b) => (a <= b ? -1 : 0);
    case '>=': return (a, b) => (a >= b ? -1 : 0);
  }
  throw new Error('bad op ' + op);
}
function compareOp(I, op, l, r) {
  const c = cmpFn(op);
  const a = l.f, b = r.f;
  if (l.t === TS && r.t === TS) return { t: TI, f: () => c(a(), b()) };
  const lnum = l.t === TI || l.t === TF || l.t === TN;
  const rnum = r.t === TI || r.t === TF || r.t === TN;
  if (lnum && rnum) {
    return { t: TI, f: () => c(a(), b()) };
  }
  if (l.t === TS && r.t !== TA) return { t: TI, f: () => { a(); b(); throw err('ERTYPESTR'); } };
  if (lnum && r.t === TS) return { t: TI, f: () => { a(); b(); throw err('ERTYPEINT'); } };
  return {
    t: TI, f: binDyn(I, l, r, (x, tx, y, ty) => {
      if (tx === TS) { if (ty !== TS) throw err('ERTYPESTR'); return c(x, y); }
      if (ty === TS) throw err('ERTYPEINT');
      return c(x, y);
    }),
  };
}

// Operator table: returns {op, prec, len} for the operator at b[p] or null
export function peekOp(b, p) {
  const c = b[p];
  switch (c) {
    case 0x2B: return { op: '+', prec: 4, len: 1 };
    case 0x2D: return { op: '-', prec: 4, len: 1 };
    case 0x2A: return { op: '*', prec: 5, len: 1 };
    case 0x2F: return { op: '/', prec: 5, len: 1 };
    case 0x5E: return { op: '^', prec: 6, len: 1 };
    case 0x3D: return { op: '=', prec: 3, len: 1 };
    case 0x3C: {
      const d = b[p + 1];
      if (d === 0x3D) return { op: '<=', prec: 3, len: 2 };
      if (d === 0x3E) return { op: '<>', prec: 3, len: 2 };
      if (d === 0x3C) return { op: '<<', prec: 3, len: 2 };
      return { op: '<', prec: 3, len: 1 };
    }
    case 0x3E: {
      const d = b[p + 1];
      if (d === 0x3D) return { op: '>=', prec: 3, len: 2 };
      if (d === 0x3E) { if (b[p + 2] === 0x3E) return { op: '>>>', prec: 3, len: 3 }; return { op: '>>', prec: 3, len: 2 }; }
      return { op: '>', prec: 3, len: 1 };
    }
    case T.AND: return { op: 'AND', prec: 2, len: 1 };
    case T.OR: return { op: 'OR', prec: 1, len: 1 };
    case T.EOR: return { op: 'EOR', prec: 1, len: 1 };
    case T.DIV: return { op: 'DIV', prec: 5, len: 1 };
    case T.MOD: return { op: 'MOD', prec: 5, len: 1 };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Parser (shared by expressions and statements)
// ---------------------------------------------------------------------------
export class Parser {
  /**
   * @param {object} I interpreter
   * @param {Uint8Array|number[]} b bytes terminated by 13
   * @param {object} line line object (for temps allocation)
   */
  constructor(I, b, line) {
    this.I = I;
    this.b = b;
    this.p = 0;
    this.line = line;
    this.ops = [];
    this.relStop = false;
    this.asmMode = false;   // expression evaluation inside assembler: unknown vars allowed in pass 1
  }
  get c() { return this.b[this.p]; }
  sp() { while (this.b[this.p] === 32) this.p++; return this.b[this.p]; }
  emit(op) { this.ops.push(op); return this.ops.length - 1; }
  newTemp() { if (this.line.ntemps === undefined) this.line.ntemps = 0; return this.line.ntemps++; }
  atEnd() { const c = this.sp(); return c === 13 || c === 0x3A || c === T.ELSE; }
  /** DONE: statement must end here */
  done() { if (!this.atEnd()) throw cerr('ERSYNT'); }
  expect(ch, key) { if (this.sp() !== ch) throw cerr(key); this.p++; }

  // ---- expressions -------------------------------------------------------
  expr() {
    const save = this.relStop;
    this.relStop = false;
    const n = this.exprPrec(0);
    this.relStop = save;
    return n;
  }
  exprPrec(min) {
    const I = this.I;
    let left = this.factor();
    for (;;) {
      if (this.relStop) break;
      this.sp();
      const o = peekOp(this.b, this.p);
      if (!o || o.prec <= min) break;
      this.p += o.len;
      if (o.op === '^') {
        const right = this.factor();
        left = binop(I, '^', left, right);
        continue;
      }
      const right = this.exprPrec(o.prec);
      left = binop(I, o.op, left, right);
      if (o.prec === 3) {
        this.sp();
        const n2 = peekOp(this.b, this.p);
        if (n2 && n2.prec === 3) { this.relStop = true; break; }
      }
    }
    return left;
  }
  /** expression that must be numeric -> int closure */
  intExpr() { return intF(this.I, this.expr()); }
  fltExpr() { return fltF(this.I, this.expr()); }
  strExpr() { return strF(this.I, this.expr()); }

  /** Hoist a value-producing op; returns a node that reads the temp. op(tmp, slot) must store tmp[slot] (and tmpT). */
  hoist(t, makeOp) {
    const slot = this.newTemp();
    const I = this.I;
    this.emit(makeOp(slot));
    if (t === TA || t === TN) return { t, f: () => { I.t = I.tmpT[slot]; return I.tmp[slot]; } };
    return { t, f: () => I.tmp[slot] };
  }

  // ---- factors -----------------------------------------------------------
  factor() {
    const I = this.I;
    const b = this.b;
    let c = b[this.p++];
    while (c === 32) c = b[this.p++];
    if (c === 0x2B) return this.factor(); // unary +
    if (c === 0x2D) { // unary minus
      const n = this.factor();
      if (n.t === TS) return errNode('ERTYPEINT', TN);
      const f = n.f;
      if (n.t === TI) return { t: TI, f: () => (-f()) | 0 };
      if (n.t === TF) return { t: TF, f: () => -f() };
      return { t: TN, f: () => { const v = f(); if (I.t === TS) throw err('ERTYPEINT'); return I.t === TI ? (-v) | 0 : -v; } };
    }
    if (isDigit(c) || c === 0x2E) {
      const r = readNumber(b, this.p - 1);
      if (!r) throw cerr('FACERR');
      this.p = r.end;
      const v = r.value;
      return r.isInt ? { t: TI, f: () => v, k: v } : { t: TF, f: () => v, k: v };
    }
    if (c === 0x22) { // string literal
      let s = '';
      for (;;) {
        const d = b[this.p++];
        if (d === 13 || d === undefined) { this.p--; throw cerr('ERMISQ'); }
        if (d === 0x22) {
          if (b[this.p] === 0x22) { s += '"'; this.p++; continue; }
          break;
        }
        s += String.fromCharCode(d);
      }
      return { t: TS, f: () => s, k: s };
    }
    if (c === 0x26) { // &hex
      let v = 0; let n = 0;
      for (;;) {
        const d = b[this.p];
        let dv;
        if (d >= 48 && d <= 57) dv = d - 48;
        else if (d >= 65 && d <= 70) dv = d - 55;
        else if (d >= 97 && d <= 102) dv = d - 87;
        else break;
        if (v & 0xF0000000) throw cerr('ERHEX2');
        v = ((v << 4) | dv) | 0; n++; this.p++;
      }
      if (!n) throw cerr('ERHEX');
      return { t: TI, f: () => v, k: v };
    }
    if (c === 0x25) { // %binary
      let v = 0; let n = 0;
      for (;;) {
        const d = b[this.p];
        if (d !== 48 && d !== 49) break;
        v = ((v << 1) | (d - 48)) | 0; n++; this.p++;
      }
      if (!n) throw cerr('ERBIN');
      return { t: TI, f: () => v, k: v };
    }
    if (c === 0x28) { // ( expr )
      const n = this.expr();
      if (this.sp() !== 0x29) throw cerr('ERBRA');
      this.p++;
      return n;
    }
    // variables and indirection
    if (c === 0x21 || c === 0x24 || c === 0x3F || c === 0x7C || c === 0x40 || (c >= 0x41 && c <= 0x5A) || (c >= 0x5F && c <= 0x7A)) {
      this.p--;
      const lv = this.lvalue(false);
      if (!lv) throw cerr('FACERR');
      if (lv.kind === 'array') throw cerr('ERVARAR');
      return lv.read();
    }
    if (c >= 0x7F) return this.funcToken(c);
    this.p--;
    throw cerr('FACERR');
  }

  /** CHAN: '#' then factor, int */
  chan() {
    if (this.sp() !== 0x23) throw cerr('CHANNE');
    this.p++;
    return intF(this.I, this.factor());
  }

  funcToken(c) {
    const I = this.I;
    const P = this;
    const fac = () => P.factor();
    const numFac = () => numNode(I, fac());
    const fl = (fn) => { const a = fltF(I, numFac()); return { t: TF, f: () => fn(a()) }; };
    switch (c) {
      case T.MOD: { // MOD array: sqrt of sum of squares
        const arr = this.arrayRef();
        return { t: TF, f: () => { const A = I.arrData(arr, 'num'); let s = 0; for (let i = 0; i < A.length; i++) s += A[i] * A[i]; return chkF(Math.sqrt(s)); } };
      }
      case T.OPENIN: return this.openFn(0x40);
      case T.OPENUP: return this.openFn(0xC0);
      case T.OPENOUT: return this.openFn(0x80);
      case T.PTR: { const ch = this.chan(); return { t: TI, f: () => I.files.ptr(ch()) }; }
      case T.EXT: { const ch = this.chan(); return { t: TI, f: () => I.files.ext(ch()) }; }
      case T.EOF: { const ch = this.chan(); return { t: TI, f: () => (I.files.eof(ch()) ? -1 : 0) }; }
      case T.BGET: { const ch = this.chan(); return { t: TI, f: () => I.files.bget(ch()) }; }
      case T.PAGE: return { t: TI, f: () => I.page };
      case T.TIME:
        if (this.b[this.p] === 0x24) { this.p++; return { t: TS, f: () => I.host.timeString() }; }
        return { t: TI, f: () => I.host.readTime() | 0 };
      case T.LOMEM: return { t: TI, f: () => I.lomem };
      case T.HIMEM: return { t: TI, f: () => I.himem };
      case T.ABS: {
        const n = numFac(); const f = n.f;
        if (n.t === TI) return { t: TI, f: () => { const v = f(); return v < 0 ? (-v) | 0 : v; } };
        if (n.t === TF) return { t: TF, f: () => Math.abs(f()) };
        return { t: TN, f: () => { const v = f(); if (I.t === TI) return v < 0 ? (-v) | 0 : v; return Math.abs(v); } };
      }
      case T.ACS: return fl((x) => { if (x > 1 || x < -1) throw err('FOVR1'); return Math.acos(x); });
      case T.ASN: return fl((x) => { if (x > 1 || x < -1) throw err('FOVR1'); return Math.asin(x); });
      case T.ATN: return fl(Math.atan);
      case T.COS: return fl((x) => { if (Math.abs(x) >= 8388608) throw err('FRNGQQ'); return Math.cos(x); });
      case T.SIN: return fl((x) => { if (Math.abs(x) >= 8388608) throw err('FRNGQQ'); return Math.sin(x); });
      case T.TAN: return fl((x) => { if (Math.abs(x) >= 8388608) throw err('FRNGQQ'); return chkF(Math.tan(x)); });
      case T.DEG: return fl((x) => chkF(x * 57.29577951308232));
      case T.RAD: return fl((x) => x * 0.017453292519943295);
      case T.EXP: return fl((x) => { const r = Math.exp(x); if (r > MAXF) throw err('ERFEXP'); return r; });
      case T.LN: return fl((x) => { if (x <= 0) throw err('ERFLOG'); return Math.log(x); });
      case T.LOG: return fl((x) => { if (x <= 0) throw err('ERFLOG'); return Math.log10(x); });
      case T.SQR: return fl((x) => { if (x < 0) throw err('FSQRTN'); return Math.sqrt(x); });
      case T.ADVAL: { const a = intF(I, fac()); return { t: TI, f: () => I.host.adval(a()) | 0 }; }
      case T.ASC: {
        const a = strF(I, fac());
        return { t: TI, f: () => { const s = a(); return s.length ? s.charCodeAt(0) : -1; } };
      }
      case T.COUNT: return { t: TI, f: () => I.count };
      case T.ERL: return { t: TI, f: () => I.erl };
      case T.ERR: return { t: TI, f: () => I.errnum };
      case T.EVAL: return this.evalFn();
      case T.FALSE: return { t: TI, f: () => 0, k: 0 };
      case T.TRUE: return { t: TI, f: () => -1, k: -1 };
      case T.FN: return this.fnCall();
      case T.GET: return this.hoist(TI, (slot) => () => I.opGet(slot, false));
      case T.GETS:
        if (this.sp() === 0x23) {
          const ch = this.chan();
          return { t: TS, f: () => I.files.getLine(ch()) };
        }
        return this.hoist(TS, (slot) => () => I.opGet(slot, true));
      case T.INKEY: { const a = intF(I, fac()); return this.hoist(TI, (slot) => () => I.opInkey(slot, a(), false)); }
      case T.INKEYS: { const a = intF(I, fac()); return this.hoist(TS, (slot) => () => I.opInkey(slot, a(), true)); }
      case T.INSTR: return this.instrFn();
      case T.INT: {
        const n = numFac(); const f = n.f;
        if (n.t === TI) return n;
        if (n.t === TF) return { t: TI, f: () => toInt(Math.floor(f())) };
        return { t: TI, f: () => { const v = f(); return I.t === TI ? v : toInt(Math.floor(v)); } };
      }
      case T.LEN: { const a = strF(I, fac()); return { t: TI, f: () => a().length }; }
      case T.NOT: { const a = intF(I, fac()); return { t: TI, f: () => ~a() }; }
      case T.PI: return { t: TF, f: () => Math.PI, k: Math.PI };
      case T.POINT: { // POINT(x,y)
        const x = intF(I, this.expr());
        this.expect(0x2C, 'ERCOMM');
        const y = intF(I, this.expr());
        this.expect(0x29, 'ERBRA');
        return { t: TI, f: () => I.host.point(x(), y()) };
      }
      case T.POS: return { t: TI, f: () => I.host.pos() };
      case T.VPOS: return { t: TI, f: () => I.host.vpos() };
      case T.RND: return this.rndFn();
      case T.SGN: {
        const n = numFac(); const f = n.f;
        return { t: TI, f: () => { const v = f(); return v > 0 ? 1 : v < 0 ? -1 : 0; } };
      }
      case T.TO: {
        if (this.b[this.p] !== 0x50) throw cerr('FACERR'); // TOP
        this.p++;
        return { t: TI, f: () => I.top };
      }
      case T.USR: { const a = intF(I, fac()); return this.hoist(TI, (slot) => () => I.opUsr(slot, a())); }
      case T.VAL: {
        const a = strF(I, fac());
        return { t: TN, f: () => { const r = valOf(a()); I.t = r.isInt ? TI : TF; return r.value; } };
      }
      case T.CHRS: { const a = intF(I, fac()); return { t: TS, f: () => String.fromCharCode(a() & 255) }; }
      case T.LEFTS: return this.leftRight(true);
      case T.RIGHTS: return this.leftRight(false);
      case T.MIDS: return this.midFn();
      case T.STRS: return this.strFn();
      case T.STRINGS: {
        const n = intF(I, this.expr());
        this.expect(0x2C, 'ERCOMM');
        const s = strF(I, this.expr());
        this.expect(0x29, 'ERBRA');
        return {
          t: TS, f: () => {
            const k = n(); const str = s();
            if (k < 1 || str.length === 0) return '';
            if (k * str.length > 255) throw err('ERLONG');
            return str.repeat(k);
          },
        };
      }
      case T.ESCFN: {
        const d = this.b[this.p++];
        if (d === TFN.SUM) {
          if (this.b[this.p] === T.LEN) { // SUMLEN
            this.p++;
            const arr = this.arrayRef();
            return { t: TI, f: () => { const A = I.arrData(arr, 'str'); let s = 0; for (let i = 0; i < A.length; i++) s += A[i].length; return s; } };
          }
          const arr = this.arrayRef();
          return {
            t: TA, f: () => {
              const A = I.arrData(arr, 'any');
              if (arr.t === TS) { let s = ''; for (let i = 0; i < A.length; i++) { s += A[i]; if (s.length > 255) throw err('ERLONG'); } I.t = TS; return s; }
              if (arr.t === TI) { let s = 0; for (let i = 0; i < A.length; i++) s = (s + A[i]) | 0; I.t = TI; return s; }
              let s = 0; for (let i = 0; i < A.length; i++) s += A[i]; I.t = TF; return chkF(s);
            },
          };
        }
        if (d === TFN.BEAT) return { t: TI, f: () => I.host.beat() };
        throw cerr('FACERR');
      }
      case T.ESCSTMT: {
        const d = this.b[this.p++];
        switch (d) {
          case TST.QUIT: return { t: TI, f: () => (I.quitMode ? -1 : 0) };
          case TST.TINT: {
            if (this.sp() !== 0x28) throw cerr('ERBRA1');
            this.p++;
            const x = intF(I, this.expr());
            this.expect(0x2C, 'ERCOMM');
            const y = intF(I, this.expr());
            this.expect(0x29, 'ERBRA');
            return { t: TI, f: () => I.host.tint(x(), y()) };
          }
          case TST.BEATS: return { t: TI, f: () => I.host.beats() };
          case TST.TEMPO: return { t: TI, f: () => I.host.tempo() };
        }
        throw cerr('FACERR');
      }
      case T.DIM: return this.dimFn();
      case T.END: return { t: TI, f: () => I.fsa };
      case T.MODE: return { t: TI, f: () => I.host.modeNumber() };
      case T.REPORT: {
        if (this.b[this.p] !== 0x24) throw cerr('FACERR');
        this.p++;
        return { t: TS, f: () => I.report };
      }
      case T.TRACE: return { t: TI, f: () => I.traceHandle | 0 };
      case T.WIDTH: return { t: TI, f: () => I.width };
    }
    throw cerr('FACERR');
  }

  openFn(mode) {
    const I = this.I;
    const a = strF(I, this.factor());
    return this.hoist(TI, (slot) => () => I.opOpen(slot, mode, a()));
  }

  evalFn() {
    const I = this.I;
    const a = strF(I, this.factor());
    return this.hoist(TA, (slot) => () => I.opEval(slot, a()));
  }

  rndFn() {
    const I = this.I;
    if (this.b[this.p] === 0x28) {
      this.p++;
      const a = intF(I, this.expr());
      this.expect(0x29, 'ERBRA');
      return {
        t: TN, f: () => {
          const n = a();
          if (n < 0) { I.seed = n; I.seedHi = 0x40; I.t = TI; return n; }
          if (n === 0) { I.t = TF; return rndFloat(I.seed); }
          if (n === 1) { I.t = TF; return rndFloat(rndNext(I)); }
          const r = rndFloat(rndNext(I));
          I.t = TI; return (Math.trunc(r * n) + 1) | 0;
        },
      };
    }
    return { t: TI, f: () => rndNext(I) };
  }

  instrFn() {
    const I = this.I;
    const a = strF(I, this.expr());
    this.expect(0x2C, 'ERCOMM');
    const b = strF(I, this.expr());
    let st = null;
    const c = this.sp();
    if (c === 0x2C) { this.p++; st = intF(I, this.expr()); this.expect(0x29, 'ERBRA'); } else if (c === 0x29) this.p++;
    else throw cerr('ERCOMM');
    return {
      t: TI, f: () => {
        const s = a(); const sub = b();
        let start = 0;
        if (st) { start = st() - 1; if (start < 0) start = 0; if (start >= 255) start = 0; }
        if (sub.length > s.length) return 0;
        if (sub.length + start > s.length) return 0;
        if (sub.length === 0) return start + 1;
        const i = s.indexOf(sub, start);
        return i < 0 ? 0 : i + 1;
      },
    };
  }

  leftRight(left) {
    const I = this.I;
    const a = strF(I, this.expr());
    const c = this.sp();
    if (c === 0x2C) {
      this.p++;
      const n = intF(I, this.expr());
      this.expect(0x29, 'ERBRA');
      if (left) return { t: TS, f: () => { const s = a(); const k = n(); return (k >>> 0) < s.length ? s.slice(0, k) : s; } };
      return { t: TS, f: () => { const s = a(); const k = n(); if (k <= 0) return ''; if (k >= s.length) return s; return s.slice(s.length - k); } };
    }
    if (c !== 0x29) throw cerr('ERCOMM');
    this.p++;
    if (left) return { t: TS, f: () => { const s = a(); return s.length ? s.slice(0, -1) : s; } };
    return { t: TS, f: () => { const s = a(); return s.length ? s.slice(-1) : s; } };
  }

  midFn() {
    const I = this.I;
    const a = strF(I, this.expr());
    this.expect(0x2C, 'ERCOMM');
    const m = intF(I, this.expr());
    let n = null;
    if (this.sp() === 0x2C) { this.p++; n = intF(I, this.expr()); }
    this.expect(0x29, 'ERBRA');
    return {
      t: TS, f: () => {
        const s = a(); let st = m(); const cnt = n ? n() : 255;
        if (s.length === 0) return '';
        if (st !== 0) st -= 1;
        st >>>= 0;
        if (st > s.length) return '';
        const avail = s.length - st;
        const k = (cnt >>> 0) >= avail ? avail : cnt;
        return s.substr(st, k);
      },
    };
  }

  strFn() {
    const I = this.I;
    let hex = false;
    if (this.sp() === 0x7E) { hex = true; this.p++; }
    const n = numNode(I, this.factor());
    if (hex) { const f = intF(I, n); return { t: TS, f: () => formatHex(f()) }; }
    const f = n.f;
    return {
      t: TS, f: () => {
        const v = f();
        const w = I.iv[0];
        return formatNumber(v, (w & 0x1000000) ? w : 0);
      },
    };
  }

  dimFn() {
    const I = this.I;
    if (this.b[this.p] !== 0x28) throw cerr('ERARRW');
    this.p++;
    const lv = this.lvalue(true);
    if (!lv) throw cerr('ERARRYDIM');
    if (lv.kind !== 'array') throw cerr('ERDIMFN');
    const arr = lv.arr;
    const c = this.sp();
    if (c === 0x29) { this.p++; return { t: TI, f: () => { const A = I.arrCheck(arr); return A.dims.length; } }; }
    if (c !== 0x2C) throw cerr('ERBRA');
    this.p++;
    const n = intF(I, this.expr());
    this.expect(0x29, 'ERBRA');
    return {
      t: TI, f: () => {
        const A = I.arrCheck(arr); const k = n();
        if (k < 1 || k > A.dims.length) throw err('ERRSB2');
        return A.dims[k - 1] - 1;
      },
    };
  }

  /** parse `name()` whole array reference (for SUM, MOD etc.) */
  arrayRef() {
    let c = this.sp();
    if (c === 0x28) { // allow SUM(a())
      this.p++;
      const r = this.arrayRef();
      this.expect(0x29, 'ERBRA');
      return r;
    }
    const lv = this.lvalue(true);
    if (!lv || lv.kind !== 'array') throw cerr('ERTYPEARRAY');
    return lv.arr;
  }

  // ---- FN calls ------------------------------------------------------------
  /** Parse FNname(args) -> node (hoisted call) */
  fnCall() {
    const I = this.I;
    const call = this.parseCall('FN');
    return this.hoist(TA, (slot) => () => I.opCallFn(call, slot));
  }

  /**
   * Parse the name and actual arguments after an FN/PROC token.
   * Each argument is compiled as a value node, plus an lvalue if it is syntactically one
   * (so it can be passed to a RETURN parameter or as an array).
   */
  parseCall(kind) {
    const b = this.b;
    const start = this.p;
    let name = kind;
    while (isWordC(b[this.p])) name += String.fromCharCode(b[this.p++]);
    if (this.p === start) throw cerr('FNCALL');
    const args = [];
    // FNGOA: spaces are allowed between the name and the argument list
    const save0 = this.p;
    while (b[this.p] === 32) this.p++;
    if (b[this.p] !== 0x28) this.p = save0;
    if (b[this.p] === 0x28) {
      this.p++;
      for (;;) {
        this.sp();
        const save = this.p;
        let lv = null;
        // try lvalue followed by , or )
        try {
          const nOps = this.ops.length;
          lv = this.lvalue(true);
          if (lv) {
            const c = this.sp();
            if (c !== 0x2C && c !== 0x29) { lv = null; this.p = save; this.ops.length = nOps; }
          } else { this.p = save; this.ops.length = nOps; }
        } catch (e) {
          if (!(e instanceof CompileError)) throw e;
          lv = null; this.p = save;
        }
        let node;
        if (lv) {
          node = lv.kind === 'array' ? null : lv.readNoCheckNode ? lv.readNoCheckNode() : null;
          args.push({ lv, node });
        } else {
          node = this.expr();
          args.push({ lv: null, node });
        }
        const c = this.sp();
        if (c === 0x2C) { this.p++; continue; }
        if (c === 0x29) { this.p++; break; }
        throw cerr('ERBRA');
      }
    }
    return { name, args, I: this.I };
  }

  // ---- lvalues --------------------------------------------------------------
  /**
   * Parse an lvalue at the current position. Returns null if there isn't one
   * (position restored). allowArray: permit whole array `name()`.
   * Result: {kind, t, read():node, set(valueClosure)->op, ...}
   */
  lvalue(allowArray) {
    const I = this.I;
    const b = this.b;
    const start = this.p;
    let c = this.sp();
    // unary indirection
    if (c === 0x21 || c === 0x3F || c === 0x7C || c === 0x24) {
      this.p++;
      const addr = intF(I, this.factor());
      if (c === 0x21) return this.indLV(addr, 'w');
      if (c === 0x3F) return this.indLV(addr, 'b');
      if (c === 0x7C) return this.indLV(addr, 'f');
      return this.indLV(addr, 's');
    }
    if (c === 0x40) { // @%
      if (b[this.p + 1] === 0x25 && b[this.p + 2] !== 0x28) {
        this.p += 2;
        return this.dyadic(this.staticLV(0));
      }
      this.p = start;
      return null;
    }
    if (!((c >= 0x41 && c <= 0x5A) || (c >= 0x5F && c <= 0x7A))) { this.p = start; return null; }
    const ns = this.p;
    while (isWordC(b[this.p])) this.p++;
    let name = String.fromCharCode(...b.slice(ns, this.p));
    let t = TF;
    if (b[this.p] === 0x25) { t = TI; this.p++; name += '%'; } else if (b[this.p] === 0x24) { t = TS; this.p++; name += '$'; }
    if (b[this.p] === 0x28) {
      this.p++;
      const arr = I.getArr(name + '(', t);
      if (this.sp() === 0x29) {
        this.p++;
        if (!allowArray) throw cerr('ERVARAR');
        return { kind: 'array', t, arr };
      }
      const subs = [];
      for (;;) {
        subs.push(intF(I, this.expr()));
        const d = this.sp();
        if (d === 0x2C) { this.p++; continue; }
        if (d === 0x29) { this.p++; break; }
        throw cerr('ERBRA');
      }
      return this.dyadic(this.elemLV(arr, t, subs));
    }
    // static integer A%..Z%
    if (t === TI && name.length === 2 && c >= 0x41 && c <= 0x5A) {
      return this.dyadic(this.staticLV(c - 0x40));
    }
    return this.dyadic(this.varLV(I.getVar(name, t)));
  }

  /** var!n / var?n dyadic indirection immediately after a variable */
  dyadic(lv) {
    const c = this.b[this.p];
    if (c !== 0x21 && c !== 0x3F) return lv;
    this.p++;
    const I = this.I;
    const base = intF(I, lv.read());
    const off = intF(I, this.factor());
    const addr = () => (base() + off()) | 0;
    return this.indLV(addr, c === 0x21 ? 'w' : 'b');
  }

  varLV(v) {
    const I = this.I;
    const t = v.t;
    return {
      kind: 'var', t, v,
      read: () => ({ t, f: () => { if (v.d) return v.v; return I.undefVar(t, v); } }),
      // used when passing as an argument: value read at call time
      readNoCheckNode: () => ({ t, f: () => { if (v.d) return v.v; return I.undefVar(t, v); } }),
      get: () => { if (v.d) return v.v; return I.undefVar(t, v); },
      setter: (val) => () => { const x = val(); if (!v.d) { v.d = true; I.fsa += v.size; } v.v = x; },
      ref: () => ({ t, get: () => { if (!v.d) { v.v = t === TS ? '' : 0; v.d = true; } return v.v; }, set: (x) => { v.v = x; v.d = true; }, v }),
      exists: () => v.d,
      I,
    };
  }

  staticLV(idx) {
    const I = this.I;
    const iv = I.iv;
    return {
      kind: 'static', t: TI, idx,
      read: () => ({ t: TI, f: () => iv[idx] }),
      readNoCheckNode: () => ({ t: TI, f: () => iv[idx] }),
      get: () => iv[idx],
      setter: (val) => () => { iv[idx] = val(); },
      ref: () => ({ t: TI, get: () => iv[idx], set: (x) => { iv[idx] = x; } }),
      exists: () => true,
    };
  }

  elemLV(arr, t, subs) {
    const I = this.I;
    const n = subs.length;
    const index = n === 1 ? (() => {
      const s0 = subs[0];
      return () => {
        const d = arr.dims;
        if (d === null) I.arrMissing(arr);
        if (d.length !== 1) throw err('ERRSB2');
        const i = s0();
        if (i < 0 || i >= d[0]) throw err('ERRSUB');
        return i;
      };
    })() : n === 2 ? (() => {
      const s0 = subs[0], s1 = subs[1];
      return () => {
        const d = arr.dims;
        if (d === null) I.arrMissing(arr);
        const i = s0();
        if (i < 0 || i >= d[0]) throw err('ERRSUB');
        const j = s1();
        if (d.length !== 2) throw err('ERRSB2');
        if (j < 0 || j >= d[1]) throw err('ERRSUB');
        return i * d[1] + j;
      };
    })() : () => {
      const d = arr.dims;
      if (d === null) I.arrMissing(arr);
      let idx = 0;
      for (let k = 0; k < n; k++) {
        if (k >= d.length) throw err('ERRSB2');
        const i = subs[k]();
        if (i < 0 || i >= d[k]) throw err('ERRSUB');
        idx = idx * d[k] + i;
      }
      if (n !== d.length) throw err('ERRSB2');
      return idx;
    };
    return {
      kind: 'elem', t, arr,
      read: () => ({ t, f: () => { const i = index(); return arr.data[i]; } }),
      readNoCheckNode: () => ({ t, f: () => { const i = index(); return arr.data[i]; } }),
      get: () => arr.data[index()],
      setter: (val) => () => { const i = index(); arr.data[i] = val(); },
      ref: () => { const i = index(); const data = arr.data; return { t, get: () => data[i], set: (x) => { data[i] = x; } }; },
      exists: () => true,
      index,
    };
  }

  indLV(addr, k) {
    const I = this.I;
    const m = I.mem;
    let t;
    let read, set;
    switch (k) {
      case 'b': t = TI; read = (a) => m.rd8(a); set = (a, x) => m.wr8(a, x & 255); break;
      case 'w': t = TI; read = (a) => m.rd32(a); set = (a, x) => m.wr32(a, x); break;
      case 'f': t = TF; read = (a) => m.rdFloat5(a); set = (a, x) => m.wrFloat5(a, x); break;
      case 's': t = TS; read = (a) => m.rdStrCR(a); set = (a, x) => { if ((a >>> 0) < 256) throw err('ERDOLL'); m.wrStrCR(a, x); }; break;
    }
    return {
      kind: 'ind', t, ik: k,
      read: () => ({ t, f: () => read(addr()) }),
      readNoCheckNode: () => ({ t, f: () => read(addr()) }),
      get: () => read(addr()),
      setter: (val) => () => { const a = addr(); set(a, val()); },
      ref: () => { const a = addr(); return { t, get: () => read(a), set: (x) => set(a, x) }; },
      exists: () => true,
      addr,
    };
  }
}

/** Convert a node into a closure producing a value of type t (for storing into an lvalue). */
export function convTo(I, t, n) {
  if (t === TI) return intF(I, n);
  if (t === TF) return fltF(I, n);
  return strF(I, n);
}
/** Runtime conversion of a dynamically typed value to lvalue type t. */
export function convVal(t, v, vt) {
  if (t === TS) { if (vt !== TS) throw err('ERTYPESTR'); return v; }
  if (vt === TS) throw err('ERTYPEINT');
  if (t === TI) return vt === TI ? v : toInt(v);
  return v;
}
