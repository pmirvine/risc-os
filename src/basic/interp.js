// BBC BASIC V runtime: program store, variables, stack frames, control flow, error handling.
// The compiled micro-ops (stmt.js / expr.js) call back into this object.
import { T, TS as TST, parseProgram, buildProgram, tokenise, insertLine as insertProgLine } from './tokens.js';
import { err, BasicError, toBasicError } from './errors.js';
import { compileLine, F } from './stmt.js';
import { Parser, TI, TF, TS, TA, CompileError, convVal, intF, fltF, strF } from './expr.js';
import { toInt, formatNumber, readNumber } from './numfmt.js';

const EMPTY = new Uint8Array(0);

export class Var {
  constructor(name, t) {
    this.name = name; this.t = t; this.v = t === TS ? '' : 0; this.d = false;
    // heap bytes used by the variable (CREATE): link word, name, value
    let n = 4 + (name.length === 1 ? 1 : name.length);
    if (t === TI) n = ((n + 3) & ~3) + 4; else n += 5;
    this.size = (n + 3) & ~3;
  }
}
export class Arr {
  constructor(name, t) { this.name = name; this.t = t; this.dims = null; this.data = null; this.state = 0; }
}

export class Interp {
  /**
   * @param {object} m machine (host services: vdu, keyboard, fs, swis, time...)
   */
  constructor(m, opts = {}) {
    this.m = m;
    this.host = m;
    this.mem = m.mem;
    this.iv = new Int32Array(27);
    this.iv[0] = 0x90A;
    this.vars = new Map();
    this.arrs = new Map();
    this.defs = new Map();
    this.lines = [];
    this.lineMap = new Map();
    this.page = opts.page ?? 0x8F00;
    this.memlimit = opts.himem ?? 0xA8000;
    this.himem = this.memlimit;
    this.top = this.page + 2;
    this.lomem = this.top; this.fsa = this.top;
    this.stack = [];
    this.stackBytes = 0;
    this.tmp = []; this.tmpT = [];
    this.t = TI; this._pv = 0;
    this.errH = null; this.errnum = 0; this.erl = 0; this.report = '';
    this.count = 0; this.width = -1;
    this.pw = 10; this.phex = false;
    this.inq = false; this.inbuf = null;
    this.seed = 0x21575241 ^ (opts.seed ?? 0); this.seedHi = 0;
    this.dataPtr = null;
    this.trace = { on: false, proc: false, step: false, below: 65536 };
    this.traceHandle = 0;
    this.quitMode = false;
    this.running = false;
    this.line = null; this.ops = null; this.pc = 0;
    this.caseValue = null; this.caseType = TI;
    this.escape = false;
    this.libraries = []; this.installed = [];
    this.overlay = null;
    this.pendingWhile = null;
    this.progVersion = 0;
    this.bytesm = 255;
    this.writeProgram();
  }

  // -------------------------------------------------------------------------
  // Program store
  // -------------------------------------------------------------------------
  /** Replace the program with lines [{num, body}] */
  setProgramLines(lines) {
    this.lines = lines.map((l, idx) => this.mkLine(l.num, l.body, idx));
    this.progChanged();
  }
  mkLine(num, body, idx) {
    const b = new Uint8Array(body.length + 1);
    b.set(body); b[body.length] = 13;
    return { num, body: body instanceof Uint8Array ? body : Uint8Array.from(body), b, idx, code: null, asmCode: null };
  }
  progChanged() {
    this.lineMap = new Map();
    this.lines.forEach((l, i) => { l.idx = i; l.code = null; l.asmCode = null; this.lineMap.set(l.num, l); });
    this.defs.clear();
    this.progVersion++;
    this.writeProgram();
  }
  /** Serialise program into memory at PAGE and set TOP */
  writeProgram() {
    const img = buildProgram(this.lines.map((l) => ({ num: l.num, body: l.body })));
    if (this.page + img.length + 256 > this.himem) throw err('CANTLOAD');
    this.mem.wrBytes(this.page, img);
    this.top = this.page + img.length;
  }
  /** Load a program image (tokenised) from bytes; returns false if not tokenised */
  loadImage(bytes) {
    const p = parseProgram(bytes);
    if (!p) return false;
    this.setProgramLines(p.lines);
    return true;
  }
  programImage() {
    return this.mem.rdBytes(this.page, this.top - this.page);
  }
  insertLine(num, body) {
    const lines = insertProgLine(this.lines.map((l) => ({ num: l.num, body: l.body })), num, body);
    this.setProgramLines(lines);
  }
  /** Re-read program from memory (after a program poked at PAGE, or OLD) */
  readProgramFromMemory() {
    const max = Math.max(0, this.memlimit - this.page);
    const p = parseProgram(this.mem.u8.subarray(this.page, this.page + max));
    if (!p) return false;
    this.lines = p.lines.map((l, i) => this.mkLine(l.num, Uint8Array.from(l.body), i));
    this.progChanged();
    return true;
  }
  getCode(line, asm = false) {
    if (asm) {
      if (!line.asmCode) line.asmCode = compileLine(this, line, 'asm');
      return line.asmCode;
    }
    if (!line.code) line.code = compileLine(this, line, 'basic');
    return line.code;
  }

  // -------------------------------------------------------------------------
  // Variables
  // -------------------------------------------------------------------------
  getVar(name, t) {
    let v = this.vars.get(name);
    if (!v) { v = new Var(name, t); this.vars.set(name, v); }
    return v;
  }
  getArr(name, t) {
    let a = this.arrs.get(name);
    if (!a) { a = new Arr(name, t); this.arrs.set(name, a); }
    return a;
  }
  /** Reading an undefined variable: error, except in the assembler with OPT bit 1 clear (value P%) */
  undefVar(t, v) {
    if ((this.bytesm & 2) === 0 && t !== TS) return this.iv[16];
    this.lastUndefined = v ? v.name : null; // diagnostic for hosts (BASIC does not name the variable)
    throw err('FACERR');
  }
  arrMissing(a) {
    if (a.state === 0) throw err('ERARRY');
    throw err('ERARRZ');
  }
  arrCheck(a) {
    if (a.dims === null) this.arrMissing(a);
    return a;
  }
  arrData(a) { return this.arrCheck(a).data; }

  /** CLEAR: forget all dynamic variables, reset heap (SETFSA) */
  clearVars() {
    for (const v of this.vars.values()) { v.d = false; v.v = v.t === TS ? '' : 0; }
    for (const a of this.arrs.values()) { a.dims = null; a.data = null; a.state = 0; }
    this.lomem = (this.top + 3) & ~3;
    this.fsa = this.lomem;
    this.defs.clear();
    this.libraries = [];
    this.overlay = null;
    this.dataPtr = null;
  }

  dimArray(a, dims) {
    if (a.dims !== null) throw err('ERNDIM');
    let count = 1;
    const sizes = [];
    for (const d of dims) {
      if ((d >>> 0) >= 0x1000000) throw err('BADDIMSUB');
      sizes.push(d + 1);
      count *= d + 1;
      if (count >= 0x1000000) throw err('DIMRAM');
    }
    const esize = a.t === TI ? 4 : 5;
    const bytes = ((count * esize + 3) & ~3) + 8 + 4 * sizes.length;
    const local = a.state === 1;
    if (this.fsa + bytes + 1024 > this.himem - this.stackBytes) throw err('DIMRAM');
    // the block BASIC would have built (dims, 0, count, data): its address is where CALL finds the
    // array; the data lives in JS and is copied to/from this block around CALL/USR (machine.callArm)
    a.addr = local ? this.himem - this.stackBytes - bytes : this.fsa;
    a.dims = sizes;
    a.data = a.t === TI ? new Int32Array(count) : a.t === TF ? new Float64Array(count) : new Array(count).fill('');
    if (local) this.stackBytes += bytes; else this.fsa += bytes;
    a.state = 2;
  }
  dimBlock(n, set) {
    const size = n + 1;
    if (size < 0) throw err('BADDIMSIGN');
    const addr = this.fsa;
    set(addr);
    const nf = addr + ((size + 3) & ~3);
    if (nf + 512 > this.himem - this.stackBytes) throw err('BADDIMSIZE');
    this.fsa = nf;
  }
  swapArrays(a, b) {
    const x = [a.dims, a.data, a.state, a.addr];
    a.dims = b.dims; a.data = b.data; a.state = b.state; a.addr = b.addr;
    [b.dims, b.data, b.state, b.addr] = x;
  }
  matMul(dst, l, r) {
    const D = this.arrCheck(dst), L = this.arrCheck(l), R = this.arrCheck(r);
    if (L.t !== D.t || R.t !== D.t || D.t === TS) throw err('ERTYPEARRAYB');
    // A(i,k) = B(i,j) . C(j,k) ; vectors allowed
    const ld = L.dims, rd = R.dims;
    let I_, J, K;
    if (ld.length === 2 && rd.length === 2) { I_ = ld[0]; J = ld[1]; if (rd[0] !== J) throw err('ERTYPEARRAYC'); K = rd[1]; }
    else if (ld.length === 1 && rd.length === 2) { I_ = 1; J = ld[0]; if (rd[0] !== J) throw err('ERTYPEARRAYC'); K = rd[1]; }
    else if (ld.length === 2 && rd.length === 1) { I_ = ld[0]; J = ld[1]; if (rd[0] !== J) throw err('ERTYPEARRAYC'); K = 1; }
    else throw err('ERTYPEARRAYC');
    if (D.data.length !== I_ * K) throw err('ERTYPEARRAYC');
    const out = new Float64Array(I_ * K);
    for (let i = 0; i < I_; i++) for (let k = 0; k < K; k++) {
      let s = 0;
      for (let j = 0; j < J; j++) s += L.data[i * J + j] * R.data[j * K + k];
      out[i * K + k] = s;
    }
    for (let i = 0; i < out.length; i++) D.data[i] = D.t === TI ? (out[i] | 0) : out[i];
  }

  // -------------------------------------------------------------------------
  // Memory pseudo variables
  // -------------------------------------------------------------------------
  setPage(v) {
    v = (v + 3) & ~3;
    if (v < 0x8000 || v >= this.memlimit) { this.printRaw('Out of range value assigned to PAGE'); this.newline(); return; }
    this.page = v;
  }
  setLomem(v) {
    v = (v + 3) & ~3;
    if (v < 0x8000 || v >= this.memlimit) { this.printRaw('Out of range value assigned to LOMEM'); this.newline(); return; }
    this.lomem = v; this.fsa = v;
    for (const x of this.vars.values()) { x.d = false; }
    for (const a of this.arrs.values()) { a.dims = null; a.data = null; a.state = 0; }
    this.defs.clear();
  }
  setHimem(v) {
    v &= ~3;
    if (v < 0x8000 || v > this.memlimit) { this.printRaw('Out of range value assigned to HIMEM'); this.newline(); return; }
    this.himem = v;
    this.stack.length = 0; this.stackBytes = 0;
  }
  endEquals(v) {
    // END=: change the memory limit (wimpslot)
    const nv = v & ~3;
    if (nv < this.fsa + 1024 + this.stackBytes) throw err('ERREND');
    const max = this.m.maxAppSpace ? this.m.maxAppSpace() : this.mem.size;
    this.memlimit = Math.min(nv, max);
    this.himem = this.memlimit;
    this.installed = [];
  }

  // -------------------------------------------------------------------------
  // Output helpers (CHOUT / PRINTS / NLINE)
  // -------------------------------------------------------------------------
  printStr(s) {
    if (!s.length) return;
    if (this.width === -1) { this.m.writeStr(s); this.count += s.length; return; }
    for (let i = 0; i < s.length; i++) this.outc(s.charCodeAt(i));
  }
  printRaw(s) { this.m.writeStr(s); }
  outc(c) {
    if (this.width !== -1 && this.width >= 0 && this.count > this.width) { this.m.newLine(); this.count = 0; }
    this.count++;
    this.m.writeC(c);
  }
  newline() { this.m.newLine(); this.count = 0; }
  spaces(n) {
    if (n <= 0) return;
    n &= 255;
    for (let i = 0; i < n; i++) this.outc(32);
  }
  printComma() {
    const w = this.iv[0] & 255;
    if (w === 0) return;
    const c = this.count;
    if (c === 0) return;
    const r = c % w;
    if (r === 0) return;
    this.spaces(w - r);
  }
  vdu(bytes) { this.m.vduBytes(bytes); }
  plot(k, x, y) { this.m.plot(k, x, y); }
  swi(name, regs) { return this.m.callSwiByName(name, regs); }

  // -------------------------------------------------------------------------
  // Execution control
  // -------------------------------------------------------------------------
  goto(line, pc, asm = false) {
    this.line = line;
    this.ops = this.getCode(line, asm).ops;
    this.pc = pc;
  }
  gotoLine(n) {
    const l = this.lineMap.get(n);
    if (!l) throw err('NOLINE');
    this.traceLine(l);
    this.goto(l, 0);
  }
  nextLine(asm) {
    const l = this.line;
    if (l.imm) { this.endImmediate(); return; }
    const nx = (l.owner || this.lines)[l.idx + 1];
    if (!nx) { this.endProgram(); return; }
    if (this.escape) this.escCheck();
    this.traceLine(nx);
    this.goto(nx, 0, asm);
  }
  escCheck() {
    if (this.escape) {
      this.escape = false;
      this.m.ackEscape && this.m.ackEscape();
      throw err('ESCAPE');
    }
  }
  traceLine(l) {
    const t = this.trace;
    if (t.on && l.num < t.below) {
      this.traceOut('[' + l.num + ']');
    }
  }
  traceOut(s) {
    if (this.traceHandle) { try { for (let i = 0; i < s.length; i++) this.files.bput(this.traceHandle, s.charCodeAt(i)); this.files.bput(this.traceHandle, 10); } catch (e) { this.traceHandle = 0; } return; }
    this.m.writeStr(s + ' ');
  }
  setTrace(o) { Object.assign(this.trace, o); }
  traceTo(name) { this.traceHandle = this.files.openSync(name, 0x80); }
  traceClose() { if (this.traceHandle) { const h = this.traceHandle; this.traceHandle = 0; return this.files.close(h); } }

  /** End of program: back to the prompt (keeps variables) */
  endProgram() {
    this.running = false;
    this.stack.length = 0; this.stackBytes = 0;
  }
  endImmediate() { this.endProgram(); }
  quit(code) { this.running = false; this.quitRequested = code | 0; }

  /** RUN: clear variables and start */
  runProgram() {
    this.clearVars();
    this.errH = null;
    this.stack.length = 0; this.stackBytes = 0;
    this.tmp = []; this.tmpT = [];
    this.dataPtr = null;
    if (!this.lines.length) { this.endProgram(); return; }
    this.running = true;
    this.traceLine(this.lines[0]);
    this.goto(this.lines[0], 0);
  }

  pushFrame(f) {
    if (f.line && f.line === this.line && !f.ops) f.ops = this.ops;  // return into the same compiled code
    const sz = f.k === F.FOR ? 28 : f.k >= F.PROC && f.k <= F.FN ? 32 : 12;
    if (this.fsa + 1024 + this.stackBytes + sz > this.himem) {
      throw err(f.k === F.PROC || f.k === F.FN ? 'ERDEEPPROC' : 'ERDEEPNEST');
    }
    f.sz = sz;
    this.stackBytes += sz;
    this.stack.push(f);
  }
  popFrame() {
    const f = this.stack.pop();
    this.stackBytes -= f.sz || 0;
    return f;
  }
  /** POPA: pop a loop-ish frame from the top; returns false if the top can't be popped */
  popa() {
    const f = this.stack[this.stack.length - 1];
    if (!f) return false;
    switch (f.k) {
      case F.REPEAT: case F.WHILE: case F.FOR: this.popFrame(); return true;
      case F.LERROR: this.popFrame(); this.errH = f.errH; return true;
      case F.LDATA: this.popFrame(); this.dataPtr = f.data; return true;
    }
    return false;
  }

  doUntil(v) {
    for (;;) {
      const f = this.stack[this.stack.length - 1];
      if (f && f.k === F.REPEAT) {
        if (v === 0) this.jumpTo(f.line, f.pc, f.ops);
        else this.popFrame();
        return;
      }
      if (!this.popa()) throw err('ERREPT');
    }
  }

  doNext(key) {
    const st = this.stack;
    let f;
    if (key === null) {
      for (;;) {
        f = st[st.length - 1];
        if (f && f.k === F.FOR) break;
        if (!this.popa()) throw err('ERNEXT');
      }
    } else {
      let first = true;
      for (;;) {
        f = st[st.length - 1];
        if (f && f.k === F.FOR && f.id === key) break;
        if (first && !(f && (f.k === F.FOR || f.k === F.REPEAT || f.k === F.WHILE || f.k === F.LERROR || f.k === F.LDATA))) throw err('ERNEXT');
        first = false;
        if (!this.popa()) throw err('NEXTER');
      }
    }
    // step the loop
    let v;
    if (f.isInt) {
      const cur = f.isVar ? f.ref.v : f.ref.get();
      v = cur + f.step;
      if (v > 2147483647 || v < -2147483648) { this.popFrame(); return; }
      if (f.isVar) f.ref.v = v; else f.ref.set(v);
      if (f.step >= 0 ? v <= f.limit : v >= f.limit) { this.jumpTo(f.line, f.pc, f.ops); return; }
    } else {
      const cur = f.isVar ? f.ref.v : f.ref.get();
      v = cur + f.step;
      if (f.isVar) f.ref.v = v; else f.ref.set(f.ref.t === TI ? toInt(v) : v);
      if (f.step >= 0 ? v <= f.limit : v >= f.limit) { this.jumpTo(f.line, f.pc, f.ops); return; }
    }
    this.popFrame();
  }
  /** ops: the exact compiled code saved in a frame (a line may be compiled as BASIC or as assembler) */
  jumpTo(line, pc, ops) {
    if (ops) { this.line = line; this.ops = ops; }
    else if (line !== this.line) { this.line = line; this.ops = this.getCode(line).ops; }
    this.pc = pc;
  }

  doReturn() {
    for (;;) {
      const f = this.stack[this.stack.length - 1];
      if (f && f.k === F.GOSUB) {
        this.popFrame();
        this.jumpTo(f.line, f.pc, f.ops);
        return;
      }
      if (!this.popa()) throw err('ERGOSB');
    }
  }

  // WHILE / ENDWHILE -----------------------------------------------------------
  doWhile(cond, line, condPc, bodyPc, pos) {
    const pw = this.pendingWhile;
    if (pw) {
      this.pendingWhile = null;
      const f = pw.frame;
      if (cond !== 0) { this.jumpTo(f.bodyLine, f.bodyPc, f.ops); return; }
      this.popFrame();
      this.jumpTo(pw.line, pw.pc, pw.ops);
      return;
    }
    if (cond !== 0) {
      this.pushFrame({ k: F.WHILE, line, pc: condPc, bodyLine: line, bodyPc });
      this.jumpTo(line, bodyPc);
      return;
    }
    this.skipWhile(line, pos);
  }
  doEndwhile(line, afterPc) {
    for (;;) {
      const f = this.stack[this.stack.length - 1];
      if (f && f.k === F.WHILE) {
        this.pendingWhile = { frame: f, line, pc: afterPc, ops: line === this.line ? this.ops : undefined };
        this.jumpTo(f.line, f.pc, f.ops);
        return;
      }
      if (!this.popa()) throw err('ERWHIL');
    }
  }
  skipWhile(line, pos) {
    let depth = 0;
    let li = line.idx; let b = line.b; let i = pos;
    if (line.imm || line.lib) { this.endProgram(); return; }
    let q = false;
    for (;;) {
      if (i >= b.length || b[i] === 13) {
        li++; q = false;
        if (li >= this.lines.length) { this.endProgram(); return; }
        b = this.lines[li].b; i = 0; continue;
      }
      const c = b[i];
      if (c === 0x22) { q = !q; i++; continue; }
      if (q) { i++; continue; }
      if (c === T.DATA || c === T.REM) { i = b.length; continue; }
      if (c === T.CONST) { i += 4; continue; }
      if (c === T.ESCSTMT && b[i + 1] === TST.WHILE) { depth++; i += 2; continue; }
      if (c === T.ESCFN || c === T.ESCCOM || c === T.ESCSTMT) { i += 2; continue; }
      if (c === T.ENDWHILE) {
        depth--;
        if (depth === -1) {
          const tl = this.lines[li] || line;
          const code = this.getCode(tl);
          const pc = code.tokPc.get(i);
          this.jumpTo(tl, pc !== undefined ? pc : code.eol.pc);
          return;
        }
      }
      i++;
    }
  }

  // Block IF --------------------------------------------------------------------
  lineEndsWith(l, tok) { const b = l.body; return b.length > 0 && b[b.length - 1] === tok; }
  firstTok(l) { const b = l.body; let i = 0; while (b[i] === 32) i++; return i < b.length ? b[i] : 13; }
  skipBlockIf(line) {
    if (line.imm) { this.endImmediate(); return; }
    let depth = 0;
    let li = line.idx;
    for (;;) {
      const cur = this.lines[li];
      if (this.lineEndsWith(cur, T.THEN)) depth++;
      li++;
      const nx = this.lines[li];
      if (!nx) throw err('NOENDI');
      const t = this.firstTok(nx);
      if (t === T.ENDIF) {
        depth--;
        if (depth === 0) { const code = this.getCode(nx); this.jumpTo(nx, code.blockEntry ? code.blockEntry.pc : 0); return; }
      } else if (t === T.ELSE2 && depth === 1) {
        const code = this.getCode(nx);
        this.jumpTo(nx, code.blockEntry ? code.blockEntry.pc : 0);
        return;
      }
    }
  }
  skipToEndif(line) {
    if (line.imm) { this.endImmediate(); return; }
    let depth = 0;
    let li = line.idx;
    for (;;) {
      const cur = this.lines[li];
      if (this.lineEndsWith(cur, T.THEN)) depth++;
      li++;
      const nx = this.lines[li];
      if (!nx) throw err('NOENDI');
      if (this.firstTok(nx) === T.ENDIF) {
        depth--;
        if (depth < 0) { const code = this.getCode(nx); this.jumpTo(nx, code.blockEntry ? code.blockEntry.pc : 0); return; }
      }
    }
  }

  // CASE -------------------------------------------------------------------------
  caseScan(line, mode) {
    if (line.imm) throw err('NOENDC');
    let depth = mode === 0 ? -1 : 0;
    let li = line.idx;
    for (;;) {
      const cur = this.lines[li];
      if (this.lineEndsWith(cur, T.OF)) depth++;
      li++;
      const nx = this.lines[li];
      if (!nx) throw err('NOENDC');
      const t = this.firstTok(nx);
      if (depth !== 0) { if (t === T.ENDCASE) depth--; continue; }
      if (t === T.ENDCASE || t === T.WHEN || t === T.OTHERWISE) {
        const code = this.getCode(nx);
        const ce = code.caseEntry;
        if (!ce) { this.jumpTo(nx, 0); return; }
        if (t === T.ENDCASE) this.caseValue = null;
        if (t === T.OTHERWISE) this.caseValue = null;
        this.jumpTo(nx, ce.pc);
        return;
      }
    }
  }
  skipToEndcase(line) {
    if (line.imm) throw err('NOENDC');
    let depth = 1;
    let li = line.idx;
    for (;;) {
      const cur = this.lines[li];
      if (this.lineEndsWith(cur, T.OF)) depth++;
      li++;
      const nx = this.lines[li];
      if (!nx) throw err('NOENDC');
      if (this.firstTok(nx) === T.ENDCASE) {
        depth--;
        if (depth === 0) { const code = this.getCode(nx); this.jumpTo(nx, code.caseEntry ? code.caseEntry.pc : 0); return; }
      }
    }
  }

  // -------------------------------------------------------------------------
  // PROC / FN
  // -------------------------------------------------------------------------
  findDef(name) {
    let d = this.defs.get(name);
    if (d) return d;
    const isProc = name.startsWith('PROC');
    const tok = isProc ? T.PROC : T.FN;
    const nm = name.slice(isProc ? 4 : 2);
    const search = (lines) => {
      for (const l of lines) {
        const b = l.body;
        let i = 0;
        while (b[i] === 32) i++;
        if (b[i] !== T.DEF) continue;
        i++;
        while (b[i] === 32) i++;
        if (b[i] !== tok) continue;
        i++;
        let k = 0;
        for (; k < nm.length; k++) if (b[i + k] !== nm.charCodeAt(k)) break;
        if (k < nm.length) continue;
        const nc = b[i + k];
        if (nc !== undefined && ((nc >= 48 && nc <= 57) || (nc >= 65 && nc <= 90) || (nc >= 95 && nc <= 122))) continue;
        const code = this.getCode(l);
        if (code.def && code.def.name === name) return code.def;
      }
      return null;
    };
    d = search(this.lines);
    if (!d) for (const lib of this.libraries) { d = search(lib.lines); if (d) break; }
    if (!d) for (const lib of this.installed) { d = search(lib.lines); if (d) break; }
    if (!d && this.overlay) d = this.findOverlayDef(name, search);
    if (!d) throw err('FNMISS');
    this.defs.set(name, d);
    return d;
  }

  opCallFn(call, slot) { this.callProc(call, true, slot); }

  callProc(call, isFn, slot) {
    const def = this.findDef(call.name);
    if (def.bad) throw err(def.bad);
    const formals = def.formals;
    const args = call.args;
    if (formals.length !== args.length) throw err('ARGMAT');
    const n = formals.length;
    const vals = new Array(n);
    for (let i = 0; i < n; i++) {
      const fo = formals[i]; const a = args[i];
      if (fo.isArr) {
        if (!a.lv || a.lv.kind !== 'array') throw err('ARGMATARR');
        if (a.lv.t !== fo.lv.t) throw err('ERSIZE');
        vals[i] = a.lv.arr;
      } else if (fo.isRet) {
        if (!a.lv || a.lv.kind === 'array') throw err('ARGMATRET');
        const ref = a.lv.ref();
        vals[i] = { ref, v: ref.get(), t: ref.t };
      } else {
        if (!a.node) throw err('ARGMAT');
        const v = a.node.f();
        vals[i] = [v, a.node.t <= TS ? a.node.t : this.t];
      }
    }
    const frame = {
      k: isFn ? F.FN : F.PROC, line: this.line, pc: this.pc, tmp: this.tmp, tmpT: this.tmpT,
      slot, saved: [], locals: [], rets: null, name: call.name,
    };
    // save formals
    for (let i = 0; i < n; i++) frame.saved.push(this.saveLV(formals[i].lv));
    this.pushFrame(frame);
    // assign formals (reverse order like FNARGZ)
    for (let i = n - 1; i >= 0; i--) {
      const fo = formals[i]; const v = vals[i];
      if (fo.isArr) {
        const dst = fo.lv.arr; const src = v;
        dst.dims = src.dims; dst.data = src.data; dst.state = src.state; dst.addr = src.addr;
      } else if (fo.isRet) {
        this.assignLV(fo.lv, convVal(fo.lv.t, v.v, v.t));
        if (!frame.rets) frame.rets = [];
        frame.rets.push({ lv: fo.lv, ref: v.ref });
      } else {
        this.assignLV(fo.lv, convVal(fo.lv.t, v[0], v[1]));
      }
    }
    if (this.trace.proc) this.traceOut('[' + call.name + ']');
    this.tmp = []; this.tmpT = [];
    this.goto(def.line, def.entry);
  }

  saveLV(lv) {
    switch (lv.kind) {
      case 'var': return { lv, v: lv.v.d ? lv.v.v : (lv.t === TS ? '' : 0) };
      case 'static': return { lv, v: this.iv[lv.idx] };
      case 'array': return { lv, dims: lv.arr.dims, data: lv.arr.data, state: lv.arr.state, addr: lv.arr.addr };
      default: { const r = lv.ref(); return { lv, ref: r, v: r.get() }; }
    }
  }
  restoreLV(s) {
    const lv = s.lv;
    switch (lv.kind) {
      case 'var': lv.v.v = s.v; lv.v.d = true; return;
      case 'static': this.iv[lv.idx] = s.v; return;
      case 'array': { const a = lv.arr; if (a.state === 2 && a.local) { this.stackBytes -= 0; } a.dims = s.dims; a.data = s.data; a.state = s.state; a.addr = s.addr; return; }
      default: s.ref.set(s.v);
    }
  }
  assignLV(lv, v) {
    switch (lv.kind) {
      case 'var': lv.v.v = v; lv.v.d = true; return;
      case 'static': this.iv[lv.idx] = v; return;
      default: lv.ref().set(v);
    }
  }
  readLV(lv) {
    switch (lv.kind) {
      case 'var': return lv.v.d ? lv.v.v : (lv.t === TS ? '' : 0);
      case 'static': return this.iv[lv.idx];
      default: return lv.ref().get();
    }
  }

  makeLocal(lvs) {
    const f = this.stack[this.stack.length - 1];
    if (!f || (f.k !== F.PROC && f.k !== F.FN)) throw err('ERRNLC');
    for (const lv of lvs) {
      f.locals.push(this.saveLV(lv));
      if (lv.kind === 'array') { const a = lv.arr; a.dims = null; a.data = null; a.state = 1; continue; }
      this.assignLV(lv, lv.t === TS ? '' : 0);
      this.stackBytes += 8;
      f.sz += 8;
    }
  }

  /** Unwind a PROC/FN frame: restore locals & parameters, write RETURN parameters. */
  unwindCall(f) {
    for (let i = f.locals.length - 1; i >= 0; i--) this.restoreLV(f.locals[i]);
    let retVals = null;
    if (f.rets) retVals = f.rets.map((r) => [r, this.readLV(r.lv)]);
    for (let i = f.saved.length - 1; i >= 0; i--) this.restoreLV(f.saved[i]);
    if (retVals) for (const [r, v] of retVals) r.ref.set(convVal(r.ref.t, v, r.lv.t));
    this.tmp = f.tmp; this.tmpT = f.tmpT;
  }

  endProc() {
    for (;;) {
      const f = this.stack[this.stack.length - 1];
      if (f && f.k === F.PROC) {
        this.popFrame();
        this.unwindCall(f);
        this.jumpTo(f.line, f.pc, f.ops);
        return;
      }
      if (!this.popa()) throw err('ENDPRE');
    }
  }
  fnReturn(v, t) {
    for (;;) {
      const f = this.stack[this.stack.length - 1];
      if (f && f.k === F.FN) {
        this.popFrame();
        this.unwindCall(f);
        this.tmp[f.slot] = v; this.tmpT[f.slot] = t;
        this.jumpTo(f.line, f.pc, f.ops);
        return;
      }
      if (f && f.k === F.EVAL) { // '=' inside EVAL is not in a function
        throw err('ERRFN');
      }
      if (!this.popa()) throw err('ERRFN');
    }
  }

  // EVAL ---------------------------------------------------------------------
  opEval(slot, s) {
    const tok = tokenise(s, { mode: 'eval' }).bytes;
    const b = new Uint8Array(tok.length + 1); b.set(tok); b[tok.length] = 13;
    const line = { num: this.line ? this.line.num : 0, b, body: b.subarray(0, tok.length), idx: -1, evalLine: true, imm: false };
    const P = new Parser(this, b, line);
    let node;
    try {
      node = P.expr();
      const c = P.sp();
      if (c !== 13) throw new CompileError('ERSYNT');
    } catch (e) {
      if (e instanceof CompileError) throw err(e.key);
      throw e;
    }
    const f = node.f; const t = node.t;
    const I = this;
    P.emit(() => { const v = f(); I.evalReturn(v, t <= TS ? t : I.t); });
    line.code = { ops: P.ops, eol: { pc: P.ops.length - 1 }, tokPc: new Map(), elseAt: new Map() };
    const frame = { k: F.EVAL, line: this.line, pc: this.pc, tmp: this.tmp, tmpT: this.tmpT, slot };
    this.pushFrame(frame);
    this.tmp = []; this.tmpT = [];
    this.line = line; this.ops = P.ops; this.pc = 0;
  }
  evalReturn(v, t) {
    const f = this.popFrame();
    if (!f || f.k !== F.EVAL) throw err('ERRQ1');
    this.tmp = f.tmp; this.tmpT = f.tmpT;
    this.tmp[f.slot] = v; this.tmpT[f.slot] = t;
    this.jumpTo(f.line, f.pc, f.ops);
  }
  /** Evaluate an expression line synchronously (commands like LOAD "x", LISTO n). Returns {v, t}. */
  evalSync(line) {
    const P = new Parser(this, line.b, line);
    let node;
    try {
      node = P.expr();
      if (P.sp() !== 13) throw new CompileError('ERSYNT');
    } catch (e) { if (e instanceof CompileError) throw err(e.key); throw e; }
    const saveTmp = this.tmp, saveT = this.tmpT;
    this.tmp = []; this.tmpT = [];
    try {
      for (const op of P.ops) { const r = op(); if (r && typeof r.then === 'function') throw err('ERSYNT'); }
      const v = node.f();
      return { v, t: node.t <= TS ? node.t : this.t };
    } finally { this.tmp = saveTmp; this.tmpT = saveT; }
  }

  // -------------------------------------------------------------------------
  // DATA / READ / RESTORE
  // -------------------------------------------------------------------------
  restoreLine(n) {
    if (n === null) { this.dataPtr = null; return; }
    const l = this.lineMap.get(n);
    if (!l) throw err('NOLINE');
    this.dataPtr = { li: l.idx - 1, off: -1 };
  }
  restoreRelative(n) {
    // RESTORE +n: from the start of the next line, move forward n lines
    let li = this.line.idx;
    if (this.line.imm) li = -1;
    let k = n;
    let target = li;
    do { target++; if (target >= this.lines.length) throw err('NOLINE'); k--; } while (k > 0);
    this.dataPtr = { li: target - 1, off: -1 };
  }
  restoreData() {
    const f = this.stack[this.stack.length - 1];
    if (!f || f.k !== F.LDATA) throw err('ERRDATASTACK');
    this.popFrame();
    this.dataPtr = f.data;
  }
  restoreError() {
    const f = this.stack[this.stack.length - 1];
    if (!f || f.k !== F.LERROR) throw err('ONERRX');
    this.popFrame();
    this.errH = f.errH;
  }
  /** DATAIT: position at the start of the next data item; returns {line, off} */
  dataItem() {
    let p = this.dataPtr || { li: -1, off: -1 };
    let li = p.li; let off = p.off;
    let b = li >= 0 ? this.lines[li].b : null;
    for (;;) {
      let c = 13;
      if (b && off >= 0 && off < b.length) c = b[off];
      if (b && off >= 0) off++;
      if (c === 32) continue;
      if (c === 0x2C) return { li, off, b };
      if (c !== 13) continue;
      // next line with DATA as first token
      for (;;) {
        li++;
        if (li >= this.lines.length) throw err('DATAOT');
        b = this.lines[li].b;
        let i = 0;
        while (b[i] === 32) i++;
        if (b[i] === T.DATA) { off = i + 1; return { li, off, b }; }
      }
    }
  }
  readData(t) {
    const it = this.dataItem();
    const b = it.b;
    let i = it.off;
    if (t === TS) {
      while (b[i] === 32) i++;
      let s = '';
      if (b[i] === 0x22) {
        i++;
        for (;;) {
          const c = b[i];
          if (c === 13) throw err('ERMISQ');
          i++;
          if (c === 0x22) { if (b[i] === 0x22) { s += '"'; i++; continue; } break; }
          s += String.fromCharCode(c);
        }
      } else {
        while (b[i] !== 0x2C && b[i] !== 13) s += String.fromCharCode(b[i++]);
      }
      this.dataPtr = { li: it.li, off: i };
      return s;
    }
    // numeric: evaluate the (untokenised) text as an expression
    const line = this.lines[it.li];
    const P = new Parser(this, b, line);
    P.p = i;
    let node;
    try { node = P.expr(); } catch (e) { if (e instanceof CompileError) throw err(e.key); throw e; }
    const v = node.f();
    const vt = node.t <= TS ? node.t : this.t;
    this.dataPtr = { li: it.li, off: P.p };
    return convVal(t, v, vt);
  }

  // -------------------------------------------------------------------------
  // Errors
  // -------------------------------------------------------------------------
  userError(num, msg, ext) {
    const e = new BasicError(num | 0, msg);
    if (ext) e.ext = true;
    throw e;
  }

  /**
   * Handle an error thrown by an op. Returns true if execution continues (ON ERROR), false if
   * the program stopped (default handler printed the message).
   */
  handleError(e) {
    if (!(e instanceof BasicError)) e = toBasicError(e) || e;
    if (!(e instanceof BasicError)) {
      if (e && e.name === 'RangeError' && /call stack/i.test(e.message)) e = err('ERDEEPPROC');
      else { console.error(e); e = new BasicError(0, 'Internal error: ' + (e && e.message)); }
    }
    this.m.errorHook && this.m.errorHook(e);
    this.escape = false;
    this.m.vduFlushQueue && this.m.vduFlushQueue();
    this.errnum = e.number;
    let msg = e.message;
    const l = this.line;
    this.erl = l && !l.imm ? (l.num | 0) : 0;
    if (l && l.lib && l.libName) msg += ' in "' + l.libName + '"';
    this.report = msg;
    this.pendingWhile = null;
    if (e.ext) { this.running = false; this.extError = e; return false; }
    const h = this.errH;
    if (h && e.number !== 0) {
      if (h.depth > this.stack.length) {
        this.printRaw('Attempt to use badly nested error handler (or corrupt R13).'); this.newline();
        this.errH = null;
      } else {
        // truncate stack (no restoring of LOCALs, like BASIC)
        let tmp = null, tmpT = null;
        for (let i = h.depth; i < this.stack.length; i++) {
          const f = this.stack[i];
          if ((f.k === F.PROC || f.k === F.FN || f.k === F.EVAL) && tmp === null) { tmp = f.tmp; tmpT = f.tmpT; }
        }
        while (this.stack.length > h.depth) this.popFrame();
        if (tmp) { this.tmp = tmp; this.tmpT = tmpT; }
        this.running = true;
        this.goto(h.line, h.pc);
        return true;
      }
    }
    // default error handler (ERRHAN)
    this.trace.on = false; this.trace.proc = false;
    this.dataPtr = null;
    this.running = false;
    this.stack.length = 0; this.stackBytes = 0;
    this.lastError = { number: e.number, message: msg, erl: this.erl };
    if (this.quitMode) { this.extError = e; return false; }
    this.m.reportError(msg, this.erl);
    return false;
  }

  // -------------------------------------------------------------------------
  // Misc statements implemented by the machine
  // -------------------------------------------------------------------------
  oscli(s) { return this.m.oscli(s); }
  chain(name) { return this.m.chain(name); }
  command(tok, args) { return this.m.command(tok, args); }
}

export { TI, TF, TS, TA, F };
