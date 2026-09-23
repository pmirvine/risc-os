// BBC BASIC V statement compiler: turns a tokenised line into an array of micro-op closures.
// See expr.js for the execution model. Statement semantics follow Stmt/Stmt2/Command/Array
// in vendor/ro371/Sources/Programmer/BASIC.
import { T, TS as TST, TC } from './tokens.js';
import { err } from './errors.js';
import { formatNumber, formatHex, toInt, valOf, parseAtPercentString } from './numfmt.js';
import {
  Parser, CompileError, cerr, TI, TF, TS, TN, TA,
  intF, fltF, strF, numNode, convTo, convVal, strCat, isWordC, chkF,
} from './expr.js';

// Frame kinds (loop / call stack)
export const F = { GOSUB: 1, REPEAT: 2, WHILE: 3, FOR: 4, PROC: 5, FN: 6, LERROR: 7, LDATA: 8, EVAL: 9 };

/**
 * Compile a line. line: {num, b (bytes incl. trailing 13), imm?}
 * mode: 'basic' (normal) or 'asm' (entered while in assembler mode)
 */
export function compileLine(I, line, mode = 'basic') {
  const P = new Parser(I, line.b, line);
  const code = {
    ops: P.ops,
    elseAt: new Map(),   // byte pos of ELSE token -> pc after it
    ifFix: [],           // {pos, label}
    eol: { pc: -1 },
    def: null,           // {kind, name, formals, entry}
    caseEntry: null,     // {kind:'WHEN'|'OTHERWISE'|'ENDCASE', pc}
    blockEntry: null,    // {kind:'ELSE2'|'ENDIF', pc}
    tokPc: new Map(),    // byte pos of statement token -> pc of op after it (ENDWHILE targets)
    line,
  };
  P.code = code;
  if (mode === 'asm') {
    I.asm.compile(P, true);
  }
  if (!P.asmEOL) stmtList(P);
  code.eol.pc = P.ops.length;
  if (P.asmEOL) P.emit(() => I.nextLine(true));
  else if (line.imm) P.emit(() => I.endImmediate());
  else P.emit(() => I.nextLine(false));
  // WHEN test sequence is appended after the end-of-line op
  if (code.caseEntry && code.caseEntry.kind === 'WHEN') {
    code.caseEntry.pc = P.ops.length;
    for (const op of code.caseEntry.testOps) P.ops.push(op);
    code.caseEntry.testOps = null;
  }
  // resolve IF false targets: first ELSE token byte after the IF
  for (const fx of code.ifFix) {
    let pc = code.eol.pc;
    const b = line.b;
    for (let i = fx.pos + 1; i < b.length; i++) {
      if (b[i] === T.ELSE && code.elseAt.has(i)) { pc = code.elseAt.get(i); break; }
      if (b[i] === T.CONST) i += 3;
    }
    fx.label.pc = pc;
  }
  return code;
}

function errOp(I, key) { return () => { throw err(key); }; }

/** Skip to the end of the current statement (':' or ELSE outside quotes, or CR) */
function skipStatement(P) {
  const b = P.b;
  let q = false;
  for (;;) {
    const c = b[P.p];
    if (c === 13) return;
    if (c === 0x22) q = !q;
    if (!q && (c === 0x3A || c === T.ELSE)) return;
    P.p++;
  }
}

export function stmtList(P) {
  const I = P.I;
  const code = P.code;
  for (;;) {
    const c = P.sp();
    if (c === 13) break;
    if (c === 0x3A) { P.p++; continue; }
    if (c === T.ELSE) {
      const pos = P.p;
      P.p++;
      const eol = code.eol;
      P.emit(() => { I.pc = eol.pc; });
      code.elseAt.set(pos, P.ops.length);
      continue;
    }
    let r;
    P.atLineStart = true;
    for (let k = 0; k < P.p; k++) if (P.b[k] !== 32) { P.atLineStart = false; break; }
    try {
      r = compileStatement(P);
    } catch (e) {
      if (!(e instanceof CompileError)) throw e;
      P.emit(errOp(I, e.key));
      skipStatement(P);
      continue;
    }
    if (r === 'eol') break;
    if (r === 'next') continue; // statement that may be directly followed by another (REPEAT, THEN...)
    // check end of statement
    const d = P.sp();
    if (d !== 13 && d !== 0x3A && d !== T.ELSE) {
      P.emit(errOp(I, 'ERSYNT'));
      skipStatement(P);
    }
  }
}

// ---------------------------------------------------------------------------
// Statement dispatch
// ---------------------------------------------------------------------------
function compileStatement(P) {
  const I = P.I;
  const c = P.b[P.p];
  if ((c >= 0x41 && c <= 0x5A) || (c >= 0x5F && c <= 0x7A) || c === 0x40 || c === 0x21 || c === 0x3F || c === 0x24 || c === 0x7C) {
    return assignment(P, false);
  }
  if (c === 0x2A) { // *command: rest of line
    P.p++;
    let s = '';
    while (P.b[P.p] !== 13) s += String.fromCharCode(P.b[P.p++]);
    P.emit(() => I.oscli(s));
    return 'eol';
  }
  if (c === 0x3D) { // =expr  function return
    P.p++;
    const n = P.expr();
    P.done();
    const f = n.f; const t = n.t;
    P.emit(() => { const v = f(); I.fnReturn(v, t <= TS ? t : I.t); });
    return;
  }
  if (c === 0x5B) { // [ assembler
    P.p++;
    P.emit(() => I.asm.start());
    I.asm.compile(P, false);
    if (P.asmEOL) return 'eol';
    return 'next';
  }
  if (c < 0x7F) {
    P.p++;
    throw cerr('ERSYNT');
  }
  P.p++;
  const h = STMTS[c];
  if (h) return h(P);
  throw cerr('ERSYNT');
}

// ---------------------------------------------------------------------------
// Assignment (LET)
// ---------------------------------------------------------------------------
function assignment(P, isLet) {
  const I = P.I;
  const lv = P.lvalue(true);
  if (!lv) throw cerr(isLet ? 'MISSEQ' : 'MISTAK');
  const c = P.sp();
  if (c === 0x3D) {
    P.p++;
    if (lv.kind === 'array') return arrayAssign(P, lv);
    if (lv.kind === 'static' && lv.idx === 0) { // @% may take a string
      const n = P.expr();
      P.done();
      const f = n.f; const t = n.t;
      P.emit(() => {
        const v = f(); const vt = t <= TS ? t : I.t;
        if (vt === TS) I.iv[0] = parseAtPercentString(v, I.iv[0]);
        else I.iv[0] = vt === TI ? v : toInt(v);
      });
      return;
    }
    const n = P.expr();
    P.done();
    P.emit(lv.setter(convTo(I, lv.t, n)));
    return;
  }
  if ((c === 0x2B || c === 0x2D) && P.b[P.p + 1] === 0x3D) {
    const minus = c === 0x2D;
    P.p += 2;
    if (lv.kind === 'array') return arrayPlusEq(P, lv, minus);
    if (lv.kind === 'var' && isLet === false) {
      // BASIC gives "Mistake" if the variable does not exist yet
    }
    const n = P.expr();
    P.done();
    const exists = lv.exists;
    const get = lv.get;
    if (lv.t === TS) {
      if (minus) throw cerr('ERTYPEINT');
      const s = strF(I, n);
      const setv = lv.setter(() => I._pv);
      P.emit(() => {
        if (!exists()) throw err('MISTAK');
        const a = get(); const b = s();
        I._pv = strCat(a, b); setv();
      });
      return;
    }
    if (lv.t === TI) {
      const s = intF(I, n);
      const setv = lv.setter(() => I._pv);
      P.emit(() => {
        if (!exists()) throw err('MISTAK');
        const a = get(); const b = s();
        I._pv = minus ? (a - b) | 0 : (a + b) | 0; setv();
      });
      return;
    }
    const s = fltF(I, numNode(I, n));
    const setv = lv.setter(() => I._pv);
    P.emit(() => {
      if (!exists()) throw err('MISTAK');
      const a = get(); const b = s();
      I._pv = chkF(minus ? a - b : a + b); setv();
    });
    return;
  }
  throw cerr(isLet ? 'MISSEQ' : 'MISTAK');
}

// ---- whole array assignments (Array source) ---------------------------------
function arrayAssign(P, lv) {
  const I = P.I;
  const dst = lv.arr;
  const t = lv.t;
  let c = P.sp();
  if (c === 0x2D) { // a() = -b()  or  - factor
    P.p++;
    const save = P.p;
    const src = tryArrayRef(P);
    if (src) {
      P.done();
      P.emit(() => { const [D, S] = sameShape(I, dst, src); for (let i = 0; i < D.length; i++) D[i] = t === TI ? (-S[i]) | 0 : -S[i]; });
      return;
    }
    P.p = save - 1;
  }
  const save = P.p;
  const src = tryArrayRef(P);
  if (src) {
    c = P.sp();
    if (c === 0x2B || c === 0x2D || c === 0x2A || c === 0x2F || c === 0x2E) {
      P.p++;
      const op = String.fromCharCode(c);
      const save2 = P.p;
      const src2 = tryArrayRef(P);
      if (src2) {
        P.done();
        if (op === '.') { P.emit(() => I.matMul(dst, src, src2)); return; }
        P.emit(() => arrayBinary(I, dst, src, op, src2, null, false));
        return;
      }
      P.p = save2;
      const k = P.factor();
      P.done();
      if (op === '.') throw cerr('ERTYPEARRAY');
      const kv = dynVal(I, k);
      P.emit(() => { const [v, vt] = kv(); arrayBinary(I, dst, src, op, null, [v, vt], false); });
      return;
    }
    P.done();
    P.emit(() => {
      if (src.t !== dst.t) throw err('ERTYPEARRAYB');
      const [D, S] = sameShape(I, dst, src);
      for (let i = 0; i < D.length; i++) D[i] = S[i];
    });
    return;
  }
  P.p = save;
  // factor [op array] | factor, list...
  const k = P.factor();
  c = P.sp();
  if (c === 0x2B || c === 0x2D || c === 0x2A || c === 0x2F) {
    P.p++;
    const op = String.fromCharCode(c);
    const src2 = tryArrayRef(P);
    if (!src2) throw cerr('ERTYPEARRAY');
    P.done();
    const kv = dynVal(I, k);
    P.emit(() => { const [v, vt] = kv(); arrayBinary(I, dst, src2, op, null, [v, vt], true); });
    return;
  }
  if (c === 0x2C) { // list of values
    const items = [convTo(I, t, k)];
    while (P.sp() === 0x2C) { P.p++; items.push(convTo(I, t, P.expr())); }
    P.done();
    P.emit(() => {
      const A = I.arrCheck(dst).data;
      for (let i = 0; i < items.length; i++) {
        const v = items[i]();
        if (i >= A.length) throw err('ERRSUB');
        A[i] = v;
      }
    });
    return;
  }
  P.done();
  const v = convTo(I, t, k);
  P.emit(() => { const A = I.arrCheck(dst).data; const x = v(); A.fill(x); });
}

function tryArrayRef(P) {
  const save = P.p;
  const nOps = P.ops.length;
  try {
    const lv = P.lvalue(true);
    if (lv && lv.kind === 'array') return lv.arr;
  } catch (e) { if (!(e instanceof CompileError)) throw e; }
  P.p = save; P.ops.length = nOps;
  return null;
}
function dynVal(I, n) {
  const f = n.f; const t = n.t;
  return () => { const v = f(); return [v, t <= TS ? t : I.t]; };
}
function sameShape(I, a, b) {
  const A = I.arrCheck(a); const B = I.arrCheck(b);
  if (A.dims.length !== B.dims.length) throw err('ERTYPEARRAYC');
  for (let i = 0; i < A.dims.length; i++) if (A.dims[i] !== B.dims[i]) throw err('ERTYPEARRAYC');
  return [A.data, B.data];
}
function arrayBinary(I, dst, src, op, src2, k, constFirst) {
  const t = dst.t;
  if (src.t !== t || (src2 && src2.t !== t)) throw err('ERTYPEARRAYB');
  const [D, S] = sameShape(I, dst, src);
  let S2 = null;
  if (src2) S2 = sameShape(I, dst, src2)[1];
  let kv = null;
  if (k) {
    const [v, vt] = k;
    if (t === TS) { if (op !== '+') throw err('ERTYPEARRAYB'); kv = convVal(TS, v, vt); } else kv = convVal(t === TI ? TI : TF, v, vt);
  }
  const n = D.length;
  for (let i = 0; i < n; i++) {
    let a = S[i]; let b = S2 ? S2[i] : kv;
    if (constFirst) { const x = a; a = b; b = x; }
    let r;
    if (t === TS) { if (op !== '+') throw err('ERTYPESTR'); r = strCat(a, b); }
    else if (t === TI) {
      switch (op) {
        case '+': r = (a + b) | 0; break;
        case '-': r = (a - b) | 0; break;
        case '*': r = Math.imul(a, b); break;
        case '/': if (b === 0) throw err('ZDIVOR'); r = (a / b) | 0; break;
      }
    } else {
      switch (op) {
        case '+': r = chkF(a + b); break;
        case '-': r = chkF(a - b); break;
        case '*': r = chkF(a * b); break;
        case '/': if (b === 0) throw err('ZDIVOR'); r = chkF(a / b); break;
      }
    }
    D[i] = r;
  }
}
function arrayPlusEq(P, lv, minus) {
  const I = P.I;
  const dst = lv.arr;
  const src = tryArrayRef(P);
  if (src) {
    P.done();
    P.emit(() => arrayBinary(I, dst, dst, minus ? '-' : '+', src, null, false));
    return;
  }
  const k = P.factor();
  P.done();
  const kv = dynVal(I, k);
  P.emit(() => { const [v, vt] = kv(); arrayBinary(I, dst, dst, minus ? '-' : '+', null, [v, vt], false); });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** INTEXA / INTEXC style: list of comma separated integer expressions */
function intList(P, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) P.expect(0x2C, 'ERCOMM');
    out.push(P.intExpr());
  }
  return out;
}

/** Parse a line number reference (GOFACT): TCONST or expression. Returns closure -> line number. */
function lineRef(P) {
  const I = P.I;
  const c = P.sp();
  if (c === T.CONST) {
    const b = P.b;
    const n = decodeConst(b, P.p);
    P.p += 4;
    return { k: n, f: () => n };
  }
  const f = P.intExpr();
  return { k: null, f: () => { const n = f(); if (n < 0 || n >= 65280) throw err('NOLINE'); return n; } };
}
function decodeConst(b, p) {
  const r0 = (b[p + 1] << 2) & 0xFF;
  const lo = ((r0 & 0xC0) ^ b[p + 2]) & 0xFF;
  const hi = (b[p + 3] ^ ((r0 << 2) & 0xFF)) & 0xFF;
  return lo | (hi << 8);
}

/** CHECKFILL: optional FILL keyword after CIRCLE/ELLIPSE/RECTANGLE */
function checkFill(P) {
  if (P.sp() === T.ESCSTMT && P.b[P.p + 1] === TST.FILL) { P.p += 2; return true; }
  return false;
}

// ---------------------------------------------------------------------------
// Statement table
// ---------------------------------------------------------------------------
const STMTS = new Array(256).fill(null);

STMTS[T.LET] = (P) => assignment(P, true);

STMTS[T.REM] = (P) => { P.p = P.b.length - 1; return 'eol'; };
STMTS[T.DATA] = (P) => { P.p = P.b.length - 1; return 'eol'; };

STMTS[T.DEF] = (P) => {
  const I = P.I;
  const code = P.code;
  const eol = code.eol;
  P.emit(() => { I.pc = eol.pc; }); // executing DEF skips the line
  // parse header: PROC/FN name (params)
  const c = P.sp();
  if (c !== T.PROC && c !== T.FN) return 'eol';
  P.p++;
  let name = c === T.PROC ? 'PROC' : 'FN';
  while (isWordC(P.b[P.p])) name += String.fromCharCode(P.b[P.p++]);
  const formals = [];
  let bad = null;
  if (P.sp() === 0x28) {
    P.p++;
    try {
      for (;;) {
        let isRet = false;
        if (P.sp() === T.RETURN) { isRet = true; P.p++; }
        const lv = P.lvalue(true);
        if (!lv) throw cerr('FACERR');
        formals.push({ lv, isRet, isArr: lv.kind === 'array' });
        const d = P.sp();
        if (d === 0x2C) { P.p++; continue; }
        if (d === 0x29) { P.p++; break; }
        throw cerr('ERBRA');
      }
    } catch (e) {
      if (!(e instanceof CompileError)) throw e;
      bad = e.key;
    }
  }
  const def = { name, formals, entry: P.ops.length, line: P.line, bad };
  code.def = def;
  if (bad) { P.emit(errOp(I, bad)); return 'eol'; }
  return 'next';
};

STMTS[T.PRINT] = (P) => printStmt(P);
STMTS[T.INPUT] = (P) => inputStmt(P, false);
STMTS[T.IF] = (P) => ifStmt(P);
STMTS[T.THEN] = () => { throw cerr('ERSYNT'); };

STMTS[T.GOTO] = (P) => {
  const I = P.I;
  const r = lineRef(P);
  const f = r.f;
  P.emit(() => { I.escCheck(); I.gotoLine(f()); });
};
STMTS[T.GOSUB] = (P) => {
  const I = P.I;
  const r = lineRef(P);
  const f = r.f;
  let back;
  const i = P.emit(() => { I.escCheck(); const n = f(); I.pushFrame({ k: F.GOSUB, line: I.line, pc: back }); I.gotoLine(n); });
  back = i + 1;
};
STMTS[T.RETURN] = (P) => { const I = P.I; P.emit(() => I.doReturn()); };

STMTS[T.END] = (P) => {
  const I = P.I;
  if (P.sp() === 0x3D) {
    P.p++;
    const f = P.intExpr();
    P.emit(() => I.endEquals(f()));
    return;
  }
  P.emit(() => I.endProgram());
};
STMTS[T.STOP] = (P) => { P.emit(() => { throw err('ERSTOP'); }); };

STMTS[T.REPEAT] = (P) => {
  const I = P.I;
  let back;
  const i = P.emit(() => { I.pushFrame({ k: F.REPEAT, line: I.line, pc: back }); });
  back = i + 1;
  return 'next';
};
STMTS[T.UNTIL] = (P) => {
  const I = P.I;
  const f = P.intExpr();
  P.emit(() => { const v = f(); I.escCheck(); I.doUntil(v); });
};

STMTS[T.FOR] = (P) => forStmt(P);
STMTS[T.NEXT] = (P) => nextStmt(P);

STMTS[T.ENDPROC] = (P) => { const I = P.I; P.emit(() => I.endProc()); };
STMTS[T.PROC] = (P) => {
  const I = P.I;
  const call = P.parseCall('PROC');
  P.emit(() => I.callProc(call, false, -1));
};
STMTS[T.LOCAL] = (P) => localStmt(P);

STMTS[T.DIM] = (P) => dimStmt(P);
STMTS[T.READ] = (P) => readStmt(P);
STMTS[T.RESTORE] = (P) => restoreStmt(P);

STMTS[T.ON] = (P) => onStmt(P);
STMTS[T.ERROR] = (P) => errorStmt(P);
STMTS[T.REPORT] = (P) => { const I = P.I; P.emit(() => { I.newline(); I.printRaw(I.report); }); };

STMTS[T.CLEAR] = (P) => { const I = P.I; P.emit(() => I.clearVars()); };
STMTS[T.RUN] = (P) => { const I = P.I; P.emit(() => I.runProgram()); };
STMTS[T.CHAIN] = (P) => { const I = P.I; const f = P.strExpr(); P.emit(() => I.chain(f())); };
STMTS[T.TRACE] = (P) => traceStmt(P);
STMTS[T.WIDTH] = (P) => { const I = P.I; const f = P.intExpr(); P.emit(() => { I.width = (f() - 1) | 0; }); };
STMTS[T.OSCLI] = (P) => { const I = P.I; const f = P.strExpr(); P.emit(() => I.oscli(f())); };

STMTS[T.CALL] = (P) => {
  const I = P.I;
  const a = P.intExpr();
  const params = [];
  while (P.sp() === 0x2C) {
    P.p++;
    const lv = P.lvalue(true);
    if (!lv) throw cerr('ERSYNT');
    params.push(lv);
  }
  P.emit(() => I.opCall(a(), params));
};

STMTS[T.SOUND] = (P) => soundStmt(P);
STMTS[T.ENVELOPE] = (P) => {
  const I = P.I;
  const a = intList(P, 14);
  P.emit(() => I.host.envelope(a.map((f) => f())));
};

// Graphics & VDU ------------------------------------------------------------
STMTS[T.MODE] = (P) => {
  const I = P.I;
  const n = P.expr();
  const f = n.f; const t = n.t;
  P.emit(() => {
    const v = f(); const vt = t <= TS ? t : I.t;
    I.count = 0;
    if (vt === TS) { I.oscli('WimpMode ' + v); return; }
    const m = vt === TI ? v : toInt(v);
    if ((m >>> 0) >= 256) I.swi('OS_ScreenMode', [0, m]);
    else I.vdu([22, m & 255]);
  });
};
STMTS[T.CLS] = (P) => { const I = P.I; P.emit(() => { I.count = 0; I.vdu([12]); }); };
STMTS[T.CLG] = (P) => { const I = P.I; P.emit(() => { I.count = 0; I.vdu([16]); }); };
STMTS[T.COLOUR] = (P) => colourStmt(P);
STMTS[T.GCOL] = (P) => gcolStmt(P);
STMTS[T.MOVE] = (P) => plotter(P, 4);
STMTS[T.DRAW] = (P) => plotter(P, 5);
STMTS[T.PLOT] = (P) => {
  const I = P.I;
  const [k, x, y] = intList(P, 3);
  P.emit(() => { const kk = k(); const xx = x(); const yy = y(); I.plot(kk, xx, yy); });
};
STMTS[T.LINE] = (P) => {
  const I = P.I;
  if (P.sp() === T.INPUT) { P.p++; return inputStmt(P, true); }
  const [x1, y1, x2, y2] = intList(P, 4);
  P.emit(() => { const a = x1(), b = y1(), c = x2(), d = y2(); I.plot(4, a, b); I.plot(5, c, d); });
};
STMTS[T.VDU] = (P) => vduStmt(P);
STMTS[T.OFF] = (P) => { const I = P.I; P.emit(() => I.vdu([23, 1, 0, 0, 0, 0, 0, 0, 0, 0])); };

// File I/O ------------------------------------------------------------------
STMTS[T.BPUT] = (P) => {
  const I = P.I;
  const ch = P.chan();
  P.expect(0x2C, 'ERCOMM');
  const n = P.expr();
  const f = n.f; const t = n.t;
  let nl = true;
  if (n.t === TS || n.t === TA) {
    if (P.sp() === 0x3B) { P.p++; nl = false; }
  }
  P.emit(() => {
    const h = ch(); const v = f(); const vt = t <= TS ? t : I.t;
    if (vt === TS) { for (let i = 0; i < v.length; i++) I.files.bput(h, v.charCodeAt(i)); if (nl) I.files.bput(h, 10); }
    else I.files.bput(h, (vt === TI ? v : toInt(v)) & 255);
  });
};
STMTS[T.CLOSE] = (P) => { const I = P.I; const ch = P.chan(); P.emit(() => I.opClose(ch())); };
STMTS[T.PTR] = STMTS[T.PTR2] = (P) => {
  const I = P.I;
  const ch = P.chan();
  P.expect(0x3D, 'MISSEQ');
  const v = P.intExpr();
  P.emit(() => I.files.setPtr(ch(), v()));
};
STMTS[T.EXT] = (P) => {
  const I = P.I;
  const ch = P.chan();
  P.expect(0x3D, 'MISSEQ');
  const v = P.intExpr();
  P.emit(() => I.files.setExt(ch(), v()));
};

// Pseudo variables ------------------------------------------------------------
STMTS[T.PAGE] = STMTS[T.PAGE2] = (P) => {
  const I = P.I;
  P.expect(0x3D, 'MISSEQ');
  const v = P.intExpr();
  P.emit(() => I.setPage(v()));
};
STMTS[T.LOMEM] = STMTS[T.LOMEM2] = (P) => {
  const I = P.I; P.expect(0x3D, 'MISSEQ'); const v = P.intExpr();
  P.emit(() => I.setLomem(v()));
};
STMTS[T.HIMEM] = STMTS[T.HIMEM2] = (P) => {
  const I = P.I; P.expect(0x3D, 'MISSEQ'); const v = P.intExpr();
  P.emit(() => I.setHimem(v()));
};
STMTS[T.TIME] = STMTS[T.TIME2] = (P) => {
  const I = P.I;
  if (P.b[P.p] === 0x24) {
    P.p++;
    P.expect(0x3D, 'MISSEQ');
    const s = P.strExpr();
    P.emit(() => I.host.setTimeString(s()));
    return;
  }
  P.expect(0x3D, 'MISSEQ');
  const v = P.intExpr();
  P.emit(() => I.host.writeTime(v()));
};

// LEFT$( / MID$( / RIGHT$( = assignment
STMTS[T.LEFTS] = (P) => midAssign(P, 'L');
STMTS[T.MIDS] = (P) => midAssign(P, 'M');
STMTS[T.RIGHTS] = (P) => midAssign(P, 'R');

// Structures ------------------------------------------------------------------
STMTS[T.WHEN] = (P) => whenLine(P);
STMTS[T.OTHERWISE] = (P) => otherwiseLine(P);
STMTS[T.ENDCASE] = (P) => {
  const code = P.code;
  if (P.atLineStart && !code.caseEntry) code.caseEntry = { kind: 'ENDCASE', pc: P.ops.length };
  return;
};
STMTS[T.ELSE2] = (P) => {
  const I = P.I;
  const line = P.line;
  P.emit(() => I.skipToEndif(line));
  if (P.atLineStart && !P.code.blockEntry) P.code.blockEntry = { kind: 'ELSE2', pc: P.ops.length };
  return 'next';
};
STMTS[T.ENDIF] = (P) => {
  if (P.atLineStart && !P.code.blockEntry) P.code.blockEntry = { kind: 'ENDIF', pc: P.ops.length };
  return;
};
STMTS[T.ENDWHILE] = (P) => {
  const I = P.I;
  const pos = P.p - 1;
  let after;
  const i = P.emit(() => { I.escCheck(); I.doEndwhile(I.line, after); });
  after = i + 1;
  P.code.tokPc.set(pos, after);
};

// Two byte statements
STMTS[T.ESCSTMT] = (P) => {
  const d = P.b[P.p++];
  const h = STMTS2[d];
  if (h) return h(P);
  throw cerr('ERSYNT');
};
STMTS[T.ESCCOM] = (P) => {
  // commands are only valid in immediate mode (handled by the machine); in programs: Syntax error
  const I = P.I;
  if (P.line.imm) {
    const d = P.b[P.p++];
    const pos = P.p;
    const b = P.b;
    let s = [];
    while (b[P.p] !== 13) s.push(b[P.p++]);
    P.emit(() => I.command(d, Uint8Array.from(s), pos));
    return 'eol';
  }
  throw cerr('ERSYNT');
};
STMTS[T.ESCFN] = () => { throw cerr('ERSYNT'); };

const STMTS2 = new Array(256).fill(null);
STMTS2[TST.CASE] = (P) => caseStmt(P);
STMTS2[TST.WHILE] = (P) => whileStmt(P);
STMTS2[TST.CIRCLE] = (P) => {
  const I = P.I;
  const fill = checkFill(P);
  const [x, y, r] = intList(P, 3);
  P.emit(() => { const a = x(), b = y(), c = r(); I.plot(4, a, b); I.plot(fill ? 0x9D : 0x95, (a + c) | 0, b); });
};
STMTS2[TST.ELLIPSE] = (P) => {
  const I = P.I;
  const fill = checkFill(P);
  const [x, y, maj, min] = intList(P, 4);
  let ang = null;
  if (P.sp() === 0x2C) { P.p++; ang = P.fltExpr(); }
  P.emit(() => {
    const X = x(), Y = y(), A = maj(), B = min();
    const type = fill ? 0xCD : 0xC5;
    if (!ang) { I.plot(4, X, Y); I.plot(4, (X + A) | 0, Y); I.plot(type, X, (Y + B) | 0); return; }
    const a = ang();
    const s = Math.sin(a), c = Math.cos(a);
    const slicet = A * B;
    const maxy = Math.sqrt((B * c) * (B * c) + (A * s) * (A * s));
    const slicew = Math.trunc(slicet / maxy);
    const sheart = (A * A - B * B) * s * c;
    const shearx = Math.trunc(sheart / maxy);
    const maxyi = Math.trunc(maxy);
    I.plot(4, X, Y); I.plot(4, (X + slicew) | 0, Y); I.plot(type, (X + shearx) | 0, (Y + maxyi) | 0);
  });
};
STMTS2[TST.RECTANGLE] = (P) => {
  const I = P.I;
  const fill = checkFill(P);
  const [x, y, w] = intList(P, 3);
  let h = null;
  if (P.sp() === 0x2C) { P.p++; h = P.intExpr(); }
  if (P.sp() === T.TO) {
    P.p++;
    const [x3, y3] = intList(P, 2);
    P.emit(() => {
      const X = x(), Y = y(), W = w(); const H = h ? h() : W;
      const X3 = x3(), Y3 = y3();
      I.plot(4, X, Y); I.plot(4, (X + W) | 0, (Y + H) | 0); I.plot(fill ? 0xBE : 0xBD, X3, Y3);
    });
    return;
  }
  P.emit(() => {
    const X = x(), Y = y(), W = w(); const H = h ? h() : W;
    const X2 = (X + W) | 0, Y2 = (Y + H) | 0;
    I.plot(4, X, Y);
    if (fill) { I.plot(0x65, X2, Y2); return; }
    I.plot(13, X2, Y); I.plot(13, X2, Y2); I.plot(13, X, Y2); I.plot(13, X, Y);
  });
};
STMTS2[TST.FILL] = (P) => plotter(P, 0x85);
STMTS2[TST.POINT] = (P) => {
  const I = P.I;
  if (P.sp() === T.TO) {
    P.p++;
    const [x, y] = intList(P, 2);
    P.emit(() => I.host.pointerTo(x(), y()));
    return;
  }
  return plotter(P, 0x45);
};
STMTS2[TST.ORIGIN] = (P) => {
  const I = P.I;
  const [x, y] = intList(P, 2);
  P.emit(() => { const a = x(), b = y(); I.vdu([29, a & 255, (a >> 8) & 255, b & 255, (b >> 8) & 255]); });
};
STMTS2[TST.TINT] = (P) => {
  const I = P.I;
  const [a, t] = intList(P, 2);
  P.emit(() => { const x = a(), y = t(); I.vdu([23, 17, x & 255, y & 255, 0, 0, 0, 0, 0, 0]); });
};
STMTS2[TST.SWAP] = (P) => swapStmt(P);
STMTS2[TST.WAIT] = (P) => { const I = P.I; P.emit(() => I.host.waitVsync()); };
STMTS2[TST.MOUSE] = (P) => mouseStmt(P);
STMTS2[TST.QUIT] = (P) => {
  const I = P.I;
  let f = null;
  if (!P.atEnd()) f = P.intExpr();
  P.emit(() => I.quit(f ? f() : 0));
};
STMTS2[TST.SYS] = (P) => sysStmt(P);
STMTS2[TST.INSTALL] = () => { throw cerr('INSTALLBAD'); };
STMTS2[TST.LIBRARY] = (P) => {
  const I = P.I;
  const f = P.strExpr();
  P.emit(() => I.opLibrary(f()));
};
STMTS2[TST.OVERLAY] = (P) => {
  const I = P.I;
  const lv = P.lvalue(true);
  if (!lv) throw cerr('ERARRY');
  if (lv.kind !== 'array' || lv.t !== TS) throw cerr('ERTYPESTRINGARRAY');
  P.emit(() => I.opOverlay(lv.arr));
};
STMTS2[TST.BEATS] = (P) => { const I = P.I; const f = P.intExpr(); P.emit(() => I.host.setBeats(f())); };
STMTS2[TST.TEMPO] = (P) => { const I = P.I; const f = P.intExpr(); P.emit(() => I.host.setTempo(f())); };
STMTS2[TST.VOICES] = (P) => { const I = P.I; const f = P.intExpr(); P.emit(() => I.host.voices(f())); };
STMTS2[TST.VOICE] = (P) => {
  const I = P.I;
  const c = P.intExpr(); P.expect(0x2C, 'ERCOMM'); const s = P.strExpr();
  P.emit(() => I.host.voice(c(), s()));
};
STMTS2[TST.STEREO] = (P) => {
  const I = P.I;
  const [c, p] = intList(P, 2);
  P.emit(() => I.host.stereo(c(), p()));
};

// ---------------------------------------------------------------------------
// PRINT
// ---------------------------------------------------------------------------
function printStmt(P) {
  const I = P.I;
  if (P.sp() === 0x23) return printHash(P);
  // state at runtime: I.pw (field width), I.phex
  P.emit(() => { I.pw = I.iv[0] & 255; I.phex = false; });
  let lastSemi = false;
  for (;;) {
    const c = P.sp();
    if (c === 13 || c === 0x3A || c === T.ELSE) break;
    lastSemi = false;
    if (c === 0x7E) { P.p++; P.emit(() => { I.phex = true; }); continue; }
    if (c === 0x2C) { P.p++; P.emit(() => { I.printComma(); I.pw = I.iv[0] & 255; I.phex = false; }); continue; }
    if (c === 0x3B) { P.p++; P.emit(() => { I.pw = 0; I.phex = false; }); lastSemi = true; continue; }
    if (printSpecial(P)) continue;
    const n = P.expr();
    const f = n.f; const t = n.t;
    P.emit(() => {
      const v = f(); const vt = t <= TS ? t : I.t;
      if (vt === TS) { I.printStr(v); return; }
      let s;
      if (I.phex) s = formatHex(vt === TI ? v : toInt(v));
      else s = formatNumber(v, I.iv[0]);
      const pad = I.pw - s.length;
      if (pad > 0) I.spaces(pad);
      I.printStr(s);
    });
  }
  if (!lastSemi) P.emit(() => I.newline());
}

/** PRSPEC: ' TAB( SPC ; returns true if handled. Also string literal (PRSPEL) handled by expr. */
function printSpecial(P) {
  const I = P.I;
  const c = P.sp();
  if (c === 0x27) { P.p++; P.emit(() => I.newline()); return true; }
  if (c === T.TAB) {
    P.p++;
    const x = P.intExpr();
    if (P.sp() === 0x2C) {
      P.p++;
      const y = P.intExpr();
      P.expect(0x29, 'ERBRA');
      P.emit(() => { const a = x(), b = y(); I.vdu([31, a & 255, b & 255]); });
      return true;
    }
    P.expect(0x29, 'ERBRA');
    P.emit(() => {
      const n = x();
      const d = n - I.count;
      if (d === 0) return;
      if (d > 0) { I.spaces(d); return; }
      I.newline(); I.spaces(n);
    });
    return true;
  }
  if (c === T.SPC) {
    P.p++;
    const n = intF(I, P.factor());
    P.emit(() => I.spaces(n()));
    return true;
  }
  return false;
}

function printHash(P) {
  const I = P.I;
  const ch = P.chan();
  const items = [];
  while (P.sp() === 0x2C) {
    P.p++;
    const n = P.expr();
    items.push(n);
  }
  const fs = items.map((n) => ({ f: n.f, t: n.t }));
  P.emit(() => {
    const h = ch();
    for (const it of fs) {
      const v = it.f(); const vt = it.t <= TS ? it.t : I.t;
      I.files.printHash(h, v, vt);
    }
  });
}

// ---------------------------------------------------------------------------
// INPUT
// ---------------------------------------------------------------------------
function inputStmt(P, lineMode) {
  const I = P.I;
  if (!lineMode && P.sp() === 0x23) return inputHash(P);
  if (!lineMode && P.sp() === T.LINE) { P.p++; lineMode = true; }
  // runtime state: I.inq (pending '?' flag), I.inbuf (remaining input or null)
  P.emit(() => { I.inq = false; I.inbuf = null; });
  for (;;) {
    // INPLP
    let c = P.sp();
    if (c === 13 || c === 0x3A || c === T.ELSE) break;
    let printed = false;
    for (;;) {
      c = P.sp();
      if (c === 0x22) { // string prompt
        const n = P.factor();
        const f = n.f;
        P.emit(() => I.printStr(f()));
        printed = true; continue;
      }
      if (printSpecial(P)) { printed = true; continue; }
      break;
    }
    if (printed) P.emit(() => { I.inq = false; I.inbuf = null; });
    else P.emit(() => { I.inq = true; });
    c = P.sp();
    if (c === 0x2C || c === 0x3B) { P.p++; continue; }
    if (c === 13 || c === 0x3A || c === T.ELSE) break;
    const lv = P.lvalue(false);
    if (!lv) break;
    const set = lv.setter(() => I._pv);
    const t = lv.t;
    P.emit(() => I.inputItem(lineMode, t, set));
  }
}

function inputHash(P) {
  const I = P.I;
  const ch = P.chan();
  const lvs = [];
  while (P.sp() === 0x2C) {
    P.p++;
    const lv = P.lvalue(false);
    if (!lv) throw cerr('ERSYNT');
    lvs.push({ t: lv.t, set: lv.setter(() => I._pv) });
  }
  P.emit(() => {
    const h = ch();
    for (const it of lvs) {
      const [v, vt] = I.files.inputHash(h);
      I._pv = convVal(it.t, v, vt);
      it.set();
    }
  });
}

// ---------------------------------------------------------------------------
// IF / block IF
// ---------------------------------------------------------------------------
function ifStmt(P) {
  const I = P.I;
  const code = P.code;
  const ifPos = P.p - 1;
  const cond = P.intExpr();
  const c = P.sp();
  const label = { pc: -1 };
  code.ifFix.push({ pos: ifPos, label });
  if (c === T.THEN) {
    P.p++;
    const d = P.sp();
    if (d === 13) { // block IF
      const line = P.line;
      P.emit(() => { if (cond() === 0) I.skipBlockIf(line); });
      return;
    }
    P.emit(() => { if (cond() === 0) I.pc = label.pc; });
    if (d === T.CONST) { // THEN line number
      const n = decodeConst(P.b, P.p);
      P.p += 4;
      P.emit(() => { I.escCheck(); I.gotoLine(n); });
      return;
    }
    return 'next';
  }
  P.emit(() => { if (cond() === 0) I.pc = label.pc; });
  return 'next';
}

// ELSE entry: statements after ELSE may start with a line number (THENLN)
// handled by stmtList through a small hook: a line constant at statement start = GOTO
STMTS[T.CONST] = (P) => {
  const I = P.I;
  const n = decodeConst(P.b, P.p - 1);
  P.p += 3;
  P.emit(() => { I.escCheck(); I.gotoLine(n); });
};

// ---------------------------------------------------------------------------
// FOR / NEXT
// ---------------------------------------------------------------------------
function forStmt(P) {
  const I = P.I;
  const lv = P.lvalue(false);
  if (!lv || lv.t === TS) throw cerr('FORCV');
  if (P.sp() !== 0x3D) throw cerr('MISSEQFOR');
  P.p++;
  const start = P.expr();
  if (P.sp() !== T.TO) throw cerr('FORTO');
  P.p++;
  const isInt = lv.t === TI;
  const startF = convTo(I, lv.t, start);
  const limitF = isInt ? P.intExpr() : P.fltExpr();
  let stepF = null;
  if (P.sp() === T.STEP) { P.p++; stepF = isInt ? P.intExpr() : P.fltExpr(); }
  const setter = lv.setter(() => I._pv);
  let back;
  const i = P.emit(() => {
    I._pv = startF();
    setter();
    const lim = limitF();
    let st = 1;
    if (stepF) { st = stepF(); if (st === 0) throw err('FORSTEP'); }
    const isVar = lv.kind === 'var';
    I.pushFrame({ k: F.FOR, ref: isVar ? lv.v : lv.ref(), isVar, isInt, step: st, limit: lim, line: I.line, pc: back, id: key() });
  });
  back = i + 1;
  const key = forKey(lv);
}
/** returns a closure computing the identity of a FOR control variable */
export function forKey(lv) {
  if (lv.kind === 'var') { const v = lv.v; return () => v; }
  if (lv.kind === 'static') { const k = 'static' + lv.idx; return () => k; }
  if (lv.kind === 'elem') { const a = lv.arr; const ix = lv.index; return () => a.name + ':' + ix(); }
  if (lv.kind === 'ind') { const ad = lv.addr; return () => 'ind:' + ad(); }
  return () => null;
}

function nextStmt(P) {
  const I = P.I;
  const vars = [];
  for (;;) {
    const c = P.sp();
    if (c === 13 || c === 0x3A || c === T.ELSE) break;
    const lv = P.lvalue(false);
    if (!lv) throw cerr('ERSYNT');
    if (lv.t === TS) throw cerr('ERSYNT');
    vars.push(lv);
    if (P.sp() === 0x2C) { P.p++; continue; }
    break;
  }
  if (vars.length === 0) {
    P.emit(() => { I.escCheck(); I.doNext(null); });
    return;
  }
  for (const lv of vars) {
    const key = forKey(lv);
    P.emit(() => { I.escCheck(); I.doNext(key()); });
  }
}

// ---------------------------------------------------------------------------
// WHILE / CASE
// ---------------------------------------------------------------------------
function whileStmt(P) {
  const I = P.I;
  const startPc = P.ops.length; // pre-ops of the condition start here
  const cond = P.intExpr();
  const pos = P.p;
  const line = P.line;
  let body;
  const i = P.emit(() => I.doWhile(cond(), line, startPc, body, pos));
  body = i + 1;
  return 'next';
}

function caseStmt(P) {
  const I = P.I;
  const n = P.expr();
  if (P.sp() !== T.OF) throw cerr('ERCASE1');
  P.p++;
  if (P.sp() !== 13) throw cerr('ERCASE');
  const f = n.f; const t = n.t;
  const line = P.line;
  P.emit(() => {
    let v = f(); let vt = t <= TS ? t : I.t;
    if (vt === TI) { vt = TF; }
    I.caseValue = v; I.caseType = vt;
    I.caseScan(line, 0);
  });
  return 'eol';
}

/** WHEN at start of line: fallthrough -> skip to ENDCASE; test entry compiled after the line */
function whenLine(P) {
  const I = P.I;
  const code = P.code;
  const line = P.line;
  const isEntry = P.atLineStart && !code.caseEntry;
  P.emit(() => I.skipToEndcase(line));
  if (!isEntry) { skipStatement(P); return 'next'; }
  // compile the test sequence into a separate op list
  const mainOps = P.ops;
  const testOps = [];
  P.ops = testOps;
  const bodyLabel = { pc: -1 };
  let ok = true;
  try {
    for (;;) {
      const n = P.expr();
      const f = n.f; const t = n.t;
      P.emit(() => {
        const v = f(); const vt = t <= TS ? t : I.t;
        if (I.caseType === TS) { if (vt !== TS) throw err('ERTYPESTR'); if (v === I.caseValue) { I.pc = bodyLabel.pc; I.caseValue = null; } return; }
        if (vt === TS) throw err('ERTYPEINT');
        if (v === I.caseValue) { I.pc = bodyLabel.pc; I.caseValue = null; }
      });
      const c = P.sp();
      if (c === 0x2C) { P.p++; continue; }
      break;
    }
  } catch (e) {
    if (!(e instanceof CompileError)) throw e;
    P.emit(errOp(I, e.key));
    ok = false;
    skipStatement(P);
  }
  P.emit(() => I.caseScan(line, 1)); // no match: continue scanning after this line
  P.ops = mainOps;
  // body starts after the expression list (end of statement)
  const c = P.sp();
  if (ok && c !== 13 && c !== 0x3A) { P.emit(errOp(I, 'ERSYNT')); skipStatement(P); }
  bodyLabel.pc = P.ops.length;
  code.caseEntry = { kind: 'WHEN', pc: -1, testOps, bodyLabel };
  return 'next';
}

function otherwiseLine(P) {
  const I = P.I;
  const line = P.line;
  P.emit(() => I.skipToEndcase(line));
  if (P.atLineStart && !P.code.caseEntry) P.code.caseEntry = { kind: 'OTHERWISE', pc: P.ops.length };
  return 'next';
}

// ---------------------------------------------------------------------------
// LOCAL / DIM / READ / RESTORE / SWAP
// ---------------------------------------------------------------------------
function localStmt(P) {
  const I = P.I;
  const c = P.sp();
  if (c === T.ERROR) { P.p++; P.emit(() => I.pushFrame({ k: F.LERROR, errH: I.errH })); return; }
  if (c === T.DATA) { P.p++; P.emit(() => I.pushFrame({ k: F.LDATA, data: I.dataPtr })); return; }
  const lvs = [];
  for (;;) {
    const lv = P.lvalue(true);
    if (!lv) break;
    lvs.push(lv);
    if (P.sp() === 0x2C) { P.p++; continue; }
    break;
  }
  P.emit(() => I.makeLocal(lvs));
}

function dimStmt(P) {
  const I = P.I;
  for (;;) {
    const c = P.sp();
    if (!isWordC(c) || (c >= 0x30 && c <= 0x39)) {
      if (c !== 0x21 && c !== 0x3F && c !== 0x24 && c !== 0x7C && c !== 0x40) throw cerr('BADDIM');
    }
    // array or byte block?
    const save = P.p;
    let q = P.p;
    const b = P.b;
    while (isWordC(b[q])) q++;
    if (b[q] === 0x25 || b[q] === 0x24) q++;
    if (b[q] === 0x28 && q > save) {
      // array: name( dims )
      let name = String.fromCharCode(...b.slice(save, q));
      const t = name.endsWith('%') ? TI : name.endsWith('$') ? TS : TF;
      P.p = q + 1;
      const arr = I.getArr(name + '(', t);
      const dims = [];
      for (;;) {
        dims.push(P.intExpr());
        const d = P.sp();
        if (d === 0x2C) { P.p++; continue; }
        if (d === 0x29) { P.p++; break; }
        throw cerr('BADDIMLIST');
      }
      P.emit(() => I.dimArray(arr, dims.map((f) => f())));
    } else {
      P.p = save;
      const lv = P.lvalue(false);
      if (!lv) throw cerr('BADDIM');
      if (lv.t === TS) throw cerr('ERTYPENUM');
      const n = P.intExpr();
      const set = lv.setter(() => I._pv);
      const exists = lv.exists;
      P.emit(() => {
        if (!exists()) { I._pv = 0; set(); } // the variable is created before the block is allocated
        const size = n(); I.dimBlock(size, (addr) => { I._pv = addr; set(); });
      });
    }
    if (P.sp() === 0x2C) { P.p++; continue; }
    break;
  }
}

function readStmt(P) {
  const I = P.I;
  for (;;) {
    const lv = P.lvalue(false);
    if (!lv) break;
    const set = lv.setter(() => I._pv);
    const t = lv.t;
    P.emit(() => { I._pv = I.readData(t); set(); });
    if (P.sp() === 0x2C) { P.p++; continue; }
    break;
  }
}

function restoreStmt(P) {
  const I = P.I;
  const c = P.sp();
  if (c === T.ERROR) {
    P.p++;
    P.emit(() => I.restoreError());
    return;
  }
  if (c === T.DATA) { P.p++; P.emit(() => I.restoreData()); return; }
  if (c === 0x2B) {
    P.p++;
    const n = P.intExpr();
    P.emit(() => I.restoreRelative(n()));
    return;
  }
  if (c === 13 || c === 0x3A || c === T.ELSE) { P.emit(() => I.restoreLine(null)); return; }
  const r = lineRef(P);
  const f = r.f;
  P.emit(() => I.restoreLine(f()));
}

function swapStmt(P) {
  const I = P.I;
  const a = P.lvalue(true);
  if (!a) throw cerr('FACERR');
  P.expect(0x2C, 'ERCOMM');
  const b = P.lvalue(true);
  if (!b) throw cerr('FACERR');
  if (a.kind === 'array' || b.kind === 'array') {
    if (a.kind !== 'array' || b.kind !== 'array') throw cerr('ERTYPEARRAY');
    P.emit(() => {
      if (a.t !== b.t) throw err('ERTYPESWAP');
      I.swapArrays(a.arr, b.arr);
    });
    return;
  }
  const ra = a, rb = b;
  P.emit(() => {
    const x = ra.ref(); const y = rb.ref();
    if (x.t !== y.t) { if (x.t === TS || y.t === TS) throw err('ERTYPESTRING'); }
    const va = x.get(); const vb = y.get();
    x.set(convVal(x.t, vb, y.t));
    y.set(convVal(y.t, va, x.t));
  });
}

// ---------------------------------------------------------------------------
// ON / ERROR
// ---------------------------------------------------------------------------
function onStmt(P) {
  const I = P.I;
  const code = P.code;
  const c = P.sp();
  if (c === T.ERROR) {
    P.p++;
    const d = P.sp();
    if (d === T.OFF) { P.p++; P.emit(() => { I.errH = null; }); return; }
    let local = false;
    if (d === T.LOCAL) { P.p++; local = true; }
    const line = P.line;
    const eol = code.eol;
    let handlerPc;
    const i = P.emit(() => {
      I.errH = { line, pc: handlerPc, local, depth: local ? I.stack.length : 0 };
      I.pc = eol.pc;
    });
    handlerPc = i + 1;
    return 'next';
  }
  if (c === 13 || c === 0x3A || c === T.ELSE) { // cursor on
    P.emit(() => I.vdu([23, 1, 1, 0, 0, 0, 0, 0, 0, 0]));
    return;
  }
  const sel = P.intExpr();
  const kind = P.sp();
  if (kind !== T.GOTO && kind !== T.GOSUB && kind !== T.PROC) throw cerr('ONER');
  if (kind !== T.PROC) P.p++;
  // compile the alternatives
  const alts = [];
  for (;;) {
    const d = P.sp();
    if (kind === T.PROC) {
      if (d !== T.PROC) throw cerr('ONER');
      P.p++;
      alts.push(P.parseCall('PROC'));
    } else {
      alts.push(lineRef(P).f);
    }
    if (P.sp() === 0x2C) { P.p++; continue; }
    break;
  }
  let elseLabel = null;
  if (P.sp() === T.ELSE) {
    // ON ... ELSE statements: handled like THEN part at ELSE entry
    elseLabel = { pc: -1 };
    code.ifFix.push({ pos: P.p - 1, label: elseLabel });
  }
  let back;
  const i = P.emit(() => {
    const n = sel();
    if (n < 1 || n > alts.length) {
      if (elseLabel) { I.pc = elseLabel.pc; return; }
      throw err('ONRGER');
    }
    const a = alts[n - 1];
    if (kind === T.GOTO) { I.escCheck(); I.gotoLine(a()); return; }
    if (kind === T.GOSUB) { I.escCheck(); const ln = a(); I.pushFrame({ k: F.GOSUB, line: I.line, pc: back }); I.gotoLine(ln); return; }
    I.pc = back;
    I.callProc(a, false, -1);
  });
  // after the call/gosub returns, continue after the whole ON statement (skip ELSE part)
  const eol = code.eol;
  back = i + 1;
  if (elseLabel) {
    P.emit(() => { I.pc = eol.pc; });
    back = i + 1;
  }
  return;
}

function errorStmt(P) {
  const I = P.I;
  let ext = false;
  if (P.sp() === T.EXT) { P.p++; ext = true; }
  const n = P.intExpr();
  P.expect(0x2C, 'ERCOMM');
  const s = P.strExpr();
  P.emit(() => { const num = n(); const msg = s(); I.userError(num, msg, ext); });
}

function traceStmt(P) {
  const I = P.I;
  let step = false;
  let c = P.sp();
  if (c === T.STEP) { step = true; P.p++; c = P.sp(); }
  if (c === T.ON) { P.p++; P.emit(() => I.setTrace({ on: true, step, below: 65536 })); return; }
  if (c === T.OFF) { P.p++; P.emit(() => I.setTrace({ on: false, proc: false, step: false })); return; }
  if (c === T.PROC) { P.p++; P.emit(() => I.setTrace({ proc: true, step })); return; }
  if (c === T.TO) { P.p++; const f = P.strExpr(); P.emit(() => I.traceTo(f())); return; }
  if (c === T.CLOSE) { P.p++; P.emit(() => I.traceClose()); return; }
  const f = P.intExpr();
  P.emit(() => I.setTrace({ on: true, step, below: f() }));
}

// ---------------------------------------------------------------------------
// MID$ assignment
// ---------------------------------------------------------------------------
function midAssign(P, kind) {
  const I = P.I;
  const lv = P.lvalue(false);
  if (!lv) throw cerr('FACERR');
  if (lv.t !== TS) throw cerr('ERTYPESTRING');
  let start = null; let cnt = null;
  if (kind === 'M') {
    P.expect(0x2C, 'ERCOMM');
    start = P.intExpr();
    if (P.sp() === 0x2C) { P.p++; cnt = P.intExpr(); }
  } else if (P.sp() === 0x2C) { P.p++; cnt = P.intExpr(); }
  P.expect(0x29, 'ERBRA');
  P.expect(0x3D, 'MISSEQ');
  const rhs = P.strExpr();
  P.done();
  const get = lv.get; const set = lv.setter(() => I._pv);
  P.emit(() => {
    const cur = get();
    let st = start ? start() : 1;
    let n = cnt ? cnt() : 255;
    const r = rhs();
    if (r.length === 0) return;
    if (kind === 'R') {
      if ((n >>> 0) > r.length) n = r.length;
      st = cur.length - n + 1;
      if (st < 1) return;
    }
    if (((st - 1) >>> 0) >= 255) st = 1;
    if (st > cur.length) return;
    const startIdx = st - 1;
    // copy loop (LMIDD2): copies at least one char; stops when either string is exhausted
    // or the (unsigned) count runs out
    const nEff = n === 0 ? 1 : (n >>> 0);
    const k = Math.min(r.length, cur.length - startIdx, nEff);
    I._pv = cur.slice(0, startIdx) + r.slice(0, k) + cur.slice(startIdx + k);
    set();
  });
}

// ---------------------------------------------------------------------------
// Graphics helpers
// ---------------------------------------------------------------------------
function plotter(P, k) {
  const I = P.I;
  // optional BY -> relative
  if (P.sp() === 0x42 && P.b[P.p + 1] === 0x59) { P.p += 2; k -= 4; }
  const [x, y] = intList(P, 2);
  P.emit(() => { const a = x(), b = y(); I.plot(k, a, b); });
}

function colourStmt(P) {
  const I = P.I;
  const a = P.intExpr();
  let c = P.sp();
  if (c === T.ESCSTMT && P.b[P.p + 1] === TST.TINT) {
    P.p += 2;
    const t = P.intExpr();
    P.emit(() => { const x = a(), y = t(); I.vdu([17, x & 255]); I.vdu([23, 17, (x >> 7) & 1, y & 255, 0, 0, 0, 0, 0, 0]); });
    return;
  }
  if (c !== 0x2C) { P.emit(() => I.vdu([17, a() & 255])); return; }
  P.p++;
  const b = P.intExpr();
  c = P.sp();
  if (c !== 0x2C) { // COLOUR a,p : palette
    P.emit(() => { const x = a(), y = b(); I.vdu([19, x & 255, y & 255, (y >> 8) & 255, (y >> 16) & 255, (y >> 24) & 255]); });
    return;
  }
  P.p++;
  const cc = P.intExpr();
  if (P.sp() !== 0x2C) { // COLOUR r,g,b -> ColourTrans_SetTextColour
    P.emit(() => { const r = a() & 255, g = b() & 255, bl = cc() & 255; I.swi('ColourTrans_SetTextColour', [((bl << 24) | (g << 16) | (r << 8)) | 0, 0, 0, 0]); });
    return;
  }
  P.p++;
  const d = P.intExpr();
  P.emit(() => { const l = a(), r = b(), g = cc(), bl = d(); I.vdu([19, l & 255, 16, r & 255, g & 255, bl & 255]); });
}

function gcolStmt(P) {
  const I = P.I;
  const a = P.intExpr();
  let c = P.sp();
  const tintTail = (act, col) => {
    P.p += 2;
    const t = P.intExpr();
    P.emit(() => { const x = act(), y = col(), z = t(); I.vdu([18, x & 255, y & 255]); I.vdu([23, 17, (y & 128) ? 3 : 2, z & 255, 0, 0, 0, 0, 0, 0]); });
  };
  if (c === T.ESCSTMT && P.b[P.p + 1] === TST.TINT) return tintTail(() => 0, a);
  if (c !== 0x2C) { P.emit(() => I.vdu([18, 0, a() & 255])); return; }
  P.p++;
  const b = P.intExpr();
  c = P.sp();
  if (c === T.ESCSTMT && P.b[P.p + 1] === TST.TINT) return tintTail(a, b);
  if (c !== 0x2C) { P.emit(() => { const x = a(), y = b(); I.vdu([18, x & 255, y & 255]); }); return; }
  P.p++;
  const cc = P.intExpr();
  if (P.sp() !== 0x2C) { // GCOL r,g,b
    P.emit(() => { const r = a() & 255, g = b() & 255, bl = cc() & 255; I.swi('ColourTrans_SetGCOL', [((bl << 24) | (g << 16) | (r << 8)) | 0, 0, 0, 256, 0]); });
    return;
  }
  P.p++;
  const d = P.intExpr();
  P.emit(() => { const act = a(), r = b() & 255, g = cc() & 255, bl = d() & 255; I.swi('ColourTrans_SetGCOL', [((bl << 24) | (g << 16) | (r << 8)) | 0, 0, 0, (act & 255) | 256, act & 255]); });
}

function vduStmt(P) {
  const I = P.I;
  const items = [];
  for (;;) {
    const c = P.sp();
    if (c === 13 || c === 0x3A || c === T.ELSE) break;
    const f = P.intExpr();
    const d = P.sp();
    if (d === 0x2C) { P.p++; items.push([f, 1]); continue; }
    if (d === 0x3B) { P.p++; items.push([f, 2]); continue; }
    if (d === 0x7C) { P.p++; items.push([f, 10]); continue; }
    items.push([f, 1]);
  }
  P.emit(() => {
    const out = [];
    for (const [f, k] of items) {
      const v = f();
      out.push(v & 255);
      if (k === 2) out.push((v >> 8) & 255);
      else if (k === 10) for (let i = 0; i < 9; i++) out.push(0);
    }
    I.vdu(out);
  });
}

function mouseStmt(P) {
  const I = P.I;
  const c = P.sp();
  if (c === T.COLOUR) {
    P.p++;
    const [a, r, g, b] = intList(P, 4);
    P.emit(() => I.vdu([19, a() & 255, 25, r() & 255, g() & 255, b() & 255]));
    return;
  }
  if (c === T.ON) {
    P.p++;
    let f = null;
    if (!P.atEnd()) f = P.intExpr();
    P.emit(() => I.host.mouseOn(f ? f() : 1));
    return;
  }
  if (c === T.OFF) { P.p++; P.emit(() => I.host.mouseOn(0)); return; }
  if (c === T.TO) { P.p++; const [x, y] = intList(P, 2); P.emit(() => I.host.mouseTo(x(), y())); return; }
  if (c === T.STEP) {
    P.p++;
    const a = P.intExpr(); let b = a;
    if (P.sp() === 0x2C) { P.p++; b = P.intExpr(); }
    P.emit(() => I.host.mouseStep(a(), b()));
    return;
  }
  if (c === T.ESCSTMT && P.b[P.p + 1] === TST.RECTANGLE) {
    P.p += 2;
    const [x, y, w, h] = intList(P, 4);
    P.emit(() => { const X = x(), Y = y(); I.host.mouseRect(X, Y, (X + w()) | 0, (Y + h()) | 0); });
    return;
  }
  const lvs = [];
  for (let i = 0; i < 4; i++) {
    if (i > 0) { if (P.sp() !== 0x2C) { if (i < 3) throw cerr('ERCOMM'); break; } P.p++; }
    const lv = P.lvalue(false);
    if (!lv || lv.t === TS) throw cerr('ERMOUS');
    lvs.push(lv);
  }
  const sets = lvs.map((lv) => ({ t: lv.t, set: lv.setter(() => I._pv) }));
  P.emit(() => {
    const m = I.host.mouse(); // {x,y,b,t}
    const vals = [m.x, m.y, m.b, m.t];
    for (let i = sets.length - 1; i >= 0; i--) { I._pv = sets[i].t === TI ? vals[i] | 0 : vals[i]; sets[i].set(); }
  });
}

function soundStmt(P) {
  const I = P.I;
  const c = P.sp();
  if (c === T.ON) { P.p++; P.emit(() => I.host.soundEnable(true)); return; }
  if (c === T.OFF) { P.p++; P.emit(() => I.host.soundEnable(false)); return; }
  const a = intList(P, 4);
  let beat = null;
  if (P.sp() === 0x2C) { P.p++; beat = P.intExpr(); }
  P.emit(() => I.host.sound(a[0](), a[1](), a[2](), a[3](), beat ? beat() : null));
}

// ---------------------------------------------------------------------------
// SYS
// ---------------------------------------------------------------------------
function sysStmt(P) {
  const I = P.I;
  const sw = P.expr();
  const swf = sw.f; const swt = sw.t;
  const ins = [];
  while (P.sp() === 0x2C) {
    P.p++;
    if (ins.length >= 10) throw cerr('ERSYSINPUTS');
    const c = P.sp();
    if (c === 0x2C || c === 13 || c === 0x3A || c === T.TO || c === T.ELSE) { ins.push(null); continue; }
    const n = P.expr();
    ins.push({ f: n.f, t: n.t });
  }
  const outs = []; let flags = null;
  if (P.sp() === T.TO) {
    P.p++;
    for (;;) {
      const c = P.sp();
      if (c === 0x3B) break;
      if (c === 13 || c === 0x3A || c === T.ELSE) break;
      if (outs.length >= 10) throw cerr('ERSYSOUTPUTS');
      if (c === 0x2C) { outs.push(null); P.p++; continue; }
      const lv = P.lvalue(false);
      if (!lv) throw cerr('ERSYNT');
      outs.push({ t: lv.t, set: lv.setter(() => I._pv) });
      if (P.sp() === 0x2C) { P.p++; continue; }
      break;
    }
    if (P.sp() === 0x3B) {
      P.p++;
      const lv = P.lvalue(false);
      if (!lv) throw cerr('ERSYNT');
      flags = { t: lv.t, set: lv.setter(() => I._pv) };
    }
  }
  P.emit(() => {
    const v = swf(); const vt = swt <= TS ? swt : I.t;
    const regs = new Array(10).fill(0);
    const strs = [];
    for (let i = 0; i < ins.length; i++) {
      const it = ins[i];
      if (!it) continue;
      const x = it.f(); const xt = it.t <= TS ? it.t : I.t;
      if (xt === TS) strs.push([i, x]);
      else regs[i] = xt === TI ? x : toInt(x);
    }
    return I.opSys(vt === TS ? v : (vt === TI ? v : toInt(v)), regs, strs, outs, flags);
  });
}

export { STMTS, STMTS2 };
