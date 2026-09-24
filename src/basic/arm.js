// ARM2/ARM3 (ARMv2a, 26-bit PC+PSR) interpreter used for CALL / USR on assembled code, and for
// running original ARM programs (e.g. !Lander, src/apps/Lander/original.js).
// R15 holds PC in bits 2-25 and N Z C V I F / mode in bits 31-26 and 1-0 (USR mode here).
// SWIs are passed to a callback that may return a Promise (execution then suspends).
//
// Speed: every instruction word is compiled once into a small specialised JavaScript function
// (decoded-instruction cache). Functions are shared by all addresses holding the same word and
// looked up through a per-address table that re-checks the word on every fetch, so code that is
// written or modified by anything (the CPU itself, SWIs, BASIC) is always executed as it now is.
//
// Timing: `cycles` counts ARM2 clock ticks (S-cycle 1, N-cycle 2, I-cycle 1, as on an 8MHz ARM2
// with MEMC: sequential accesses at 8MHz, non-sequential at 4MHz), so hosts can run code at the
// speed of the original machine (see runFor()).
import { BasicError } from './errors.js';

const RETURN_ADDR = 0x03FFFFF8; // sentinel placed in R14 by call()
const PCMASK = 0x03FFFFFC;

// condition field -> JS test on the cpu flags (c)
const COND = [
  'c.Z===1', 'c.Z===0', 'c.C===1', 'c.C===0', 'c.N===1', 'c.N===0', 'c.V===1', 'c.V===0',
  '(c.C===1&&c.Z===0)', '(c.C===0||c.Z===1)', 'c.N===c.V', 'c.N!==c.V',
  '(c.Z===0&&c.N===c.V)', '(c.Z===1||c.N!==c.V)', 'true', 'false',
];

export class ARM {
  /**
   * @param {Memory} mem
   * @param {(num:number, cpu:ARM) => ({flags:number}|Promise)} swi
   */
  constructor(mem, swi) {
    this.mem = mem;
    this.swiCb = swi;
    this.r = new Int32Array(16);
    this.N = 0; this.Z = 0; this.C = 0; this.V = 0; this.I = 0; this.F = 0;
    this.pc = 0;        // address of the instruction being executed
    this.nextPc = 0;
    this.halt = false;
    this.escape = null; // () => boolean, abort check
    this.instrCount = 0;
    this.cycles = 0;    // ARM2 clock ticks (see the header)
    this.sc = 0;        // shifter carry (register-specified shifts)
    this.returnAddr = RETURN_ADDR;
    this.swiCycles = 0; // extra ticks charged for each SWI (the OS routine's own time), set by hosts
    // RAM fast paths
    this.msize = mem.size;
    this.u8 = mem.u8;
    this.i32 = mem.i32;
    // linear screen memory (VDU `linear` mode): direct byte array for [linLo, linLo+linLen)
    this.linLo = 0; this.linLen = 0; this.linU8 = null; this.scrTouched = false;
    this.refreshIO();
    // decoded-instruction cache (allocated on first use)
    this.afn = null; this.ains = null;
    this.fnCache = new Map();
  }

  psr() { return ((this.N << 31) | (this.Z << 30) | (this.C << 29) | (this.V << 28) | (this.I << 27) | (this.F << 26)) | 0; }
  setPsr(v, user = true) {
    this.N = (v >>> 31) & 1; this.Z = (v >>> 30) & 1; this.C = (v >>> 29) & 1; this.V = (v >>> 28) & 1;
    if (!user) { this.I = (v >>> 27) & 1; this.F = (v >>> 26) & 1; }
  }
  /** value of R15 as seen by an instruction (PC+8 with PSR) */
  r15(offset = 8) { return (((this.pc + offset) & PCMASK) | this.psr()) | 0; }

  /** For OS_WriteS: address following the current SWI instruction */
  pcAfterSwi() { return (this.pc + 4) >>> 0; }
  setPcAfterSwi(a) { this.nextPc = a & PCMASK; }

  /** Re-read the memory-mapped screen (after a mode change: hosts call this after SWIs). */
  refreshIO() {
    const io = this.mem.io;
    const lin = io && io.linear;
    if (lin) { this.linLo = lin.lo >>> 0; this.linLen = lin.u8.length; this.linU8 = lin.u8; }
    else { this.linLo = 0; this.linLen = 0; this.linU8 = null; }
  }

  /**
   * Call code at addr with registers regs[0..15] (R14/R15 set here). Returns undefined when done,
   * or a Promise if a SWI suspended execution.
   */
  call(addr, regs) {
    for (let i = 0; i < 16; i++) this.r[i] = regs[i] | 0;
    if (!this.r[13]) this.r[13] = 0xA7000;
    this.r[14] = RETURN_ADDR;
    this.pc = addr & PCMASK;
    this.halt = false;
    return this.run();
  }

  run() {
    let t0 = Date.now();
    for (;;) {
      const r = this.step(200000);
      if (r === 'done') return undefined;
      if (r && typeof r.then === 'function') return r.then(() => this.run());
      if (Date.now() - t0 > 40) {
        // yield to the host so a runaway loop does not freeze the page
        return new Promise((res) => setTimeout(res, 0)).then(() => {
          if (this.escape && this.escape()) throw new BasicError(17, 'Escape');
          return this.run();
        });
      }
    }
  }

  /** Execute up to n instructions. Returns 'done', a Promise (SWI), or undefined (budget used). */
  step(n) { return this.runFor(n, Infinity); }

  /**
   * Execute until n instructions have run or `cycles` reaches cycleLimit. Returns 'done' (returned
   * to the sentinel / halted), a Promise (a SWI suspended; the CPU continues after it when the host
   * calls runFor again once it settles), or undefined.
   */
  runFor(n, cycleLimit) {
    if (this.afn === null) { const words = this.msize >>> 2; this.afn = new Array(words).fill(null); this.ains = new Int32Array(words); }
    const afn = this.afn, ains = this.ains, i32 = this.i32, r = this.r, msize = this.msize, ret = this.returnAddr;
    let k = 0;
    try {
      for (; k < n; k++) {
        const pc = this.pc;
        if (pc === ret || this.halt) return 'done';
        if (this.cycles >= cycleLimit) return undefined;
        if (pc + 4 > msize) throw new BasicError(0x80000001 | 0, `Abort on instruction fetch at &${pc.toString(16).toUpperCase()}`);
        const w = pc >>> 2;
        const ins = i32[w];
        let fn = afn[w];
        if (fn === null || ains[w] !== ins) { fn = this.compile(ins); afn[w] = fn; ains[w] = ins; }
        this.nextPc = (pc + 4) & PCMASK;
        const res = fn(this, r);
        if (res !== undefined) {
          k++;
          const next = this.nextPc;
          return res.then((o) => { this.afterSwi(o); this.refreshIO(); this.pc = this.nextPc; }, (e) => { this.pc = next; throw e; });
        }
        this.pc = this.nextPc;
      }
    } finally {
      this.instrCount += k;
    }
    return undefined;
  }

  afterSwi(o) {
    if (o && typeof o.flags === 'number') {
      if (o.flags & 1) this.V = 1; else this.V = 0;
      if (o.flags & 2) this.C = 1; else this.C = 0;
    }
  }

  condOK(c) {
    switch (c) {
      case 0: return this.Z === 1;
      case 1: return this.Z === 0;
      case 2: return this.C === 1;
      case 3: return this.C === 0;
      case 4: return this.N === 1;
      case 5: return this.N === 0;
      case 6: return this.V === 1;
      case 7: return this.V === 0;
      case 8: return this.C === 1 && this.Z === 0;
      case 9: return this.C === 0 || this.Z === 1;
      case 10: return this.N === this.V;
      case 11: return this.N !== this.V;
      case 12: return this.Z === 0 && this.N === this.V;
      case 13: return this.Z === 1 || this.N !== this.V;
      case 14: return true;
      default: return false; // NV
    }
  }

  reg(n, off = 8) { return n === 15 ? this.r15(off) : this.r[n]; }
  regPCOnly(n, off = 8) { return n === 15 ? ((this.pc + off) & PCMASK) : this.r[n]; }

  /** Write a register; writing R15 changes the PC (and PSR if s) */
  setReg(n, v, s) {
    if (n === 15) {
      this.nextPc = v & PCMASK;
      if (s) this.setPsr(v, true);
      return;
    }
    this.r[n] = v | 0;
  }

  /** Execute one instruction word at this.pc (conditions included). */
  exec(ins) { return this.compile(ins)(this, this.r); }

  // ------------------------------------------------------------------ memory (fast paths)
  ld32(a) {
    a >>>= 0;
    if (a < this.msize) {
      const w = this.i32[a >>> 2], s = (a & 3) << 3;
      return s ? ((w >>> s) | (w << (32 - s))) : w;
    }
    const o = (a & ~3) - this.linLo;
    if (o >= 0 && o < this.linLen) {
      const u = this.linU8, w = (u[o] | (u[o + 1] << 8) | (u[o + 2] << 16) | (u[o + 3] << 24)), s = (a & 3) << 3;
      return s ? ((w >>> s) | (w << (32 - s))) : w;
    }
    return this.mem.rd32rot(a);
  }
  /** aligned word load (LDM) */
  ldw(a) {
    a = (a & ~3) >>> 0;
    if (a < this.msize) return this.i32[a >>> 2];
    const o = a - this.linLo;
    if (o >= 0 && o < this.linLen) { const u = this.linU8; return u[o] | (u[o + 1] << 8) | (u[o + 2] << 16) | (u[o + 3] << 24); }
    return this.mem.rd32(a);
  }
  ld8(a) {
    a >>>= 0;
    if (a < this.msize) return this.u8[a];
    const o = a - this.linLo;
    if (o >= 0 && o < this.linLen) return this.linU8[o];
    return this.mem.rd8(a);
  }
  st32(a, v) {
    a = (a & ~3) >>> 0;
    if (a < this.msize) { this.i32[a >>> 2] = v; return; }
    const o = a - this.linLo;
    if (o >= 0 && o < this.linLen) { const u = this.linU8; u[o] = v; u[o + 1] = v >> 8; u[o + 2] = v >> 16; u[o + 3] = v >> 24; this.scrTouched = true; return; }
    this.mem.wr32(a, v);
  }
  st8(a, v) {
    a >>>= 0;
    if (a < this.msize) { this.u8[a] = v; return; }
    const o = a - this.linLo;
    if (o >= 0 && o < this.linLen) { this.linU8[o] = v; this.scrTouched = true; return; }
    this.mem.wr8(a, v & 255);
  }

  /** register-specified shift: value v, type 0-3, amount (bottom byte used). Sets this.sc. */
  shiftReg(v, type, amt) {
    amt &= 255;
    if (amt === 0) { this.sc = this.C; return v; }
    switch (type) {
      case 0: if (amt < 32) { this.sc = (v >>> (32 - amt)) & 1; return v << amt; } this.sc = amt === 32 ? v & 1 : 0; return 0;
      case 1: if (amt < 32) { this.sc = (v >>> (amt - 1)) & 1; return v >>> amt; } this.sc = amt === 32 ? (v >>> 31) & 1 : 0; return 0;
      case 2: if (amt < 32) { this.sc = (v >> (amt - 1)) & 1; return v >> amt; } this.sc = (v >>> 31) & 1; return v >> 31;
      default: { const a = amt & 31; if (a === 0) { this.sc = (v >>> 31) & 1; return v; } this.sc = (v >>> (a - 1)) & 1; return (v >>> a) | (v << (32 - a)); }
    }
  }

  undef() {
    throw new BasicError(0x80000000 | 0, `Undefined instruction at &${this.pc.toString(16).toUpperCase().padStart(8, '0')}`);
  }

  swi(num) {
    const res = this.swiCb(num, this);
    if (res && typeof res.then === 'function') return res;
    this.afterSwi(res);
    this.refreshIO();
    return undefined;
  }

  /** ARM2 multiply time: 1S + m I cycles, m = Booth steps for Rs (2 bits per cycle, up to 16) */
  static mulCycles(rs) {
    let m = 1; rs >>>= 2;
    while (rs && m < 16) { m++; rs >>>= 2; }
    return 1 + m;
  }

  // ------------------------------------------------------------------ the instruction compiler
  compile(ins) {
    let fn = this.fnCache.get(ins);
    if (fn) return fn;
    const body = genInstruction(ins | 0);
    // eslint-disable-next-line no-new-func
    fn = new Function('c', 'r', body);
    this.fnCache.set(ins, fn);
    return fn;
  }
}

// ======================================================================================
// Code generation. Only numbers decoded from the instruction word (register numbers, shift amounts,
// immediates, offsets) are spliced into the generated source. Each function gets (c = the ARM, r = c.r) and returns undefined, or a Promise
// when a SWI suspends. `c.pc` is the address of the instruction; `c.nextPc` is preset to pc+4.

const PSR = '((c.N<<31)|(c.Z<<30)|(c.C<<29)|(c.V<<28)|(c.I<<27)|(c.F<<26))';
const pcExpr = (off) => `((c.pc+${off})&${PCMASK})`;
const r15Expr = (off) => `((${pcExpr(off)}|${PSR})|0)`;

function genInstruction(ins) {
  const cond = ins >>> 28;
  if (cond === 15) return 'c.cycles+=1;';                // NV: never executed
  const body = genBody(ins);
  if (cond === 14) return body;
  return `if(!(${COND[cond]})){c.cycles+=1;return;}\n${body}`;
}

function genBody(ins) {
  const t = (ins >>> 25) & 7;
  switch (t) {
    case 0:
      if ((ins & 0x0FC000F0) === 0x00000090) return genMul(ins);
      if ((ins & 0x0FB00FF0) === 0x01000090) return genSwp(ins);
      return genDP(ins, false);
    case 1: return genDP(ins, true);
    case 2: case 3:
      if (t === 3 && (ins & 0x10)) return 'c.undef();';
      return genLdrStr(ins);
    case 4: return genLdmStm(ins);
    case 5: {
      const off = (ins & 0xFFFFFF) << 8 >> 6;
      let s = '';
      if (ins & 0x01000000) s += `r[14]=(${pcExpr(4)}|${PSR})|0;`;
      return s + `c.nextPc=${pcExpr(8 + off)};c.cycles+=4;`;
    }
    case 6: return 'c.undef();';
    default:
      if (ins & 0x01000000) return `c.cycles+=4+c.swiCycles;return c.swi(${ins & 0xFFFFFF});`;
      return 'c.undef();';
  }
}

/** Operand 2 of a data processing instruction: {pre, v, carry} where carry is an expression for the
 *  shifter carry out (null if it equals the current C). `needCarry` false skips carry computation. */
function genOp2(ins, imm, needCarry) {
  if (imm) {
    const rot = ((ins >>> 8) & 15) * 2;
    const v8 = ins & 255;
    const v = (rot ? ((v8 >>> rot) | (v8 << (32 - rot))) : v8) | 0;
    return { pre: '', v: String(v), carry: rot ? String((v >>> 31) & 1) : null, cyc: 0 };
  }
  const rm = ins & 15, type = (ins >>> 5) & 3;
  if (ins & 0x10) {
    // register-specified shift (PC reads as +12)
    const rs = (ins >>> 8) & 15;
    const src = rm === 15 ? r15Expr(12) : `r[${rm}]`;
    const amt = rs === 15 ? pcExpr(12) : `r[${rs}]`;
    return { pre: `const o2=c.shiftReg(${src},${type},${amt});`, v: 'o2', carry: 'c.sc', cyc: 1 };
  }
  const src = rm === 15 ? r15Expr(8) : `r[${rm}]`;
  const amt = (ins >>> 7) & 31;
  let pre = `const m=${src};`; let v; let carry = null;
  switch (type) {
    case 0:
      if (amt === 0) { v = 'm'; carry = null; } else { v = `(m<<${amt})`; carry = `((m>>>${32 - amt})&1)`; }
      break;
    case 1:
      if (amt === 0) { v = '0'; carry = '(m>>>31)'; } else { v = `(m>>>${amt})`; carry = `((m>>>${amt - 1})&1)`; }
      break;
    case 2:
      if (amt === 0) { v = '(m>>31)'; carry = '(m>>>31)'; } else { v = `(m>>${amt})`; carry = `((m>>${amt - 1})&1)`; }
      break;
    default:
      if (amt === 0) { v = '((c.C<<31)|(m>>>1))'; carry = '(m&1)'; } else { v = `((m>>>${amt})|(m<<${32 - amt}))`; carry = `((m>>>${amt - 1})&1)`; }
  }
  if (!needCarry) carry = null;
  if (v === 'm' && rm !== 15) { pre = ''; v = `r[${rm}]`; }
  return { pre, v, carry, cyc: 0 };
}

function genDP(ins, imm) {
  const opc = (ins >>> 21) & 15;
  const S = (ins >>> 20) & 1;
  const rn = (ins >>> 16) & 15;
  const rd = (ins >>> 12) & 15;
  const regShift = !imm && (ins & 0x10);
  const logical = [0, 1, 8, 9, 12, 13, 14, 15].includes(opc);
  const test = opc >= 8 && opc <= 11;
  const setFlags = (S || test) && !(rd === 15);   // Rd=15 with S (or TSTP etc.) sets the PSR from the result instead
  const op2 = genOp2(ins, imm, logical && setFlags);
  let s = op2.pre;
  const b = op2.v;
  const a = rn === 15 ? pcExpr(regShift ? 12 : 8) : `r[${rn}]`;
  let res; let flags = '';
  const nz = 'c.N=res>>>31;c.Z=res===0?1:0;';
  switch (opc) {
    case 0: case 8: res = `(${a}&${b})`; break;
    case 1: case 9: res = `(${a}^${b})`; break;
    case 12: res = `(${a}|${b})`; break;
    case 13: res = `(${b})`; break;
    case 14: res = `(${a}&~${b})`; break;
    case 15: res = `(~${b})`; break;
    case 2: case 10: // SUB, CMP
      s += `const x=${a},y=${b},res=(x-y)|0;`;
      flags = `${nz}c.C=(x>>>0)>=(y>>>0)?1:0;c.V=((x^y)&(x^res))>>>31;`;
      break;
    case 3: // RSB
      s += `const x=${b},y=${a},res=(x-y)|0;`;
      flags = `${nz}c.C=(x>>>0)>=(y>>>0)?1:0;c.V=((x^y)&(x^res))>>>31;`;
      break;
    case 4: case 11: // ADD, CMN
      s += `const x=${a},y=${b},t=(x>>>0)+(y>>>0),res=t|0;`;
      flags = `${nz}c.C=t>4294967295?1:0;c.V=(~(x^y)&(x^res))>>>31;`;
      break;
    case 5: // ADC
      s += `const x=${a},y=${b},t=(x>>>0)+(y>>>0)+c.C,res=t|0;`;
      flags = `${nz}c.C=t>4294967295?1:0;c.V=(~(x^y)&(x^res))>>>31;`;
      break;
    case 6: // SBC
      s += `const x=${a},y=${b},t=(x>>>0)-(y>>>0)-(1-c.C),res=t|0;`;
      flags = `${nz}c.C=t>=0?1:0;c.V=((x^y)&(x^res))>>>31;`;
      break;
    default: // RSC
      s += `const x=${b},y=${a},t=(x>>>0)-(y>>>0)-(1-c.C),res=t|0;`;
      flags = `${nz}c.C=t>=0?1:0;c.V=((x^y)&(x^res))>>>31;`;
  }
  if (res !== undefined) {
    s += `const res=${res}|0;`;
    flags = nz + (op2.carry !== null ? `c.C=${op2.carry};` : '');
  }
  const cyc = 1 + op2.cyc;
  if (test) {
    if (rd === 15) return s + `c.setPsr(res,true);c.cycles+=${cyc};`;   // TEQP etc: PSR := result (USR mode: flags only)
    return s + flags + `c.cycles+=${cyc};`;
  }
  if (rd === 15) {
    s += `c.nextPc=res&${PCMASK};`;
    if (S) s += 'c.setPsr(res,true);';
    return s + `c.cycles+=${cyc + 3};`;
  }
  s += `r[${rd}]=res;`;
  if (S) s += flags;
  return s + `c.cycles+=${cyc};`;
}

function genMul(ins) {
  const rd = (ins >>> 16) & 15, rn = (ins >>> 12) & 15, rs = (ins >>> 8) & 15, rm = ins & 15;
  let s = `let res=Math.imul(r[${rm}],r[${rs}]);`;
  if (ins & 0x200000) s += `res=(res+r[${rn}])|0;`;
  if (rd !== 15) s += `r[${rd}]=res;`;
  if (ins & 0x100000) s += 'c.N=res>>>31;c.Z=res===0?1:0;';
  return s + `c.cycles+=c.constructor.mulCycles(r[${rs}]);`;
}

function genSwp(ins) {
  const rn = (ins >>> 16) & 15, rd = (ins >>> 12) & 15, rm = ins & 15;
  if (ins & 0x400000) return `const a=r[${rn}]>>>0,v=c.ld8(a);c.st8(a,r[${rm}]&255);r[${rd}]=v;c.cycles+=6;`;
  return `const a=r[${rn}]>>>0,v=c.ld32(a);c.st32(a,r[${rm}]);r[${rd}]=v;c.cycles+=6;`;
}

function genLdrStr(ins) {
  const I = (ins >>> 25) & 1, P = (ins >>> 24) & 1, U = (ins >>> 23) & 1, B = (ins >>> 22) & 1, W = (ins >>> 21) & 1, L = (ins >>> 20) & 1;
  const rn = (ins >>> 16) & 15, rd = (ins >>> 12) & 15;
  let s = '';
  let off;
  if (I) { const o = genOp2(ins & ~0x10, false, false); s += o.pre; off = o.v; } else off = String(ins & 0xFFF);
  const base = rn === 15 ? pcExpr(8) : `r[${rn}]`;
  s += `const b=${base},oa=${off === '0' ? 'b' : U ? `(b+${off})|0` : `(b-${off})|0`};`;
  const addr = P ? 'oa' : 'b';
  const wb = (!P || W) && rn !== 15 && off !== '0' ? `r[${rn}]=oa;` : '';
  if (L) {
    s += `const v=${B ? `c.ld8(${addr})` : `c.ld32(${addr})`};`;
    s += wb;
    if (rd === 15) s += `c.nextPc=v&${PCMASK};c.cycles+=8;`;
    else s += `r[${rd}]=v;c.cycles+=4;`;
  } else {
    const v = rd === 15 ? r15Expr(12) : `r[${rd}]`;
    s += B ? `c.st8(${addr},${v}&255);` : `c.st32(${addr},${v});`;
    s += wb + 'c.cycles+=4;';
  }
  return s;
}

function genLdmStm(ins) {
  const P = (ins >>> 24) & 1, U = (ins >>> 23) & 1, S = (ins >>> 22) & 1, W = (ins >>> 21) & 1, L = (ins >>> 20) & 1;
  const rn = (ins >>> 16) & 15;
  const list = ins & 0xFFFF;
  const regs = [];
  for (let i = 0; i < 16; i++) if (list & (1 << i)) regs.push(i);
  const n = regs.length;
  let s = `const base=r[${rn}]>>>0;`;
  const startOff = U ? (P ? 4 : 0) : (P ? -4 * n : -4 * n + 4);
  s += `const st=(base+${startOff})>>>0;`;
  const nb = U ? `(base+${4 * n})|0` : `(base-${4 * n})|0`;
  const wb = W && rn !== 15;
  if (n === 0) return s + 'c.cycles+=3;';
  if (L) {
    if (wb) s += `r[${rn}]=${nb};`;
    // fast path: whole transfer in RAM
    s += `if(st+${4 * n}<=c.msize){const i32=c.i32,w=st>>>2;`;
    regs.forEach((reg, k) => {
      if (reg === 15) s += `{const v=i32[w+${k}];c.nextPc=v&${PCMASK};${S ? 'c.setPsr(v,true);' : ''}}`;
      else s += `r[${reg}]=i32[w+${k}];`;
    });
    s += '}else{';
    regs.forEach((reg, k) => {
      if (reg === 15) s += `{const v=c.ldw(st+${4 * k});c.nextPc=v&${PCMASK};${S ? 'c.setPsr(v,true);' : ''}}`;
      else s += `r[${reg}]=c.ldw(st+${4 * k});`;
    });
    s += '}';
    s += `c.cycles+=${n + 3 + (list & 0x8000 ? 3 : 0)};`;
    return s;
  }
  // STM: a base register stored after the first register is stored with its written-back value
  const val = (reg, k) => {
    if (reg === 15) return r15Expr(12);
    if (reg === rn && k > 0 && wb) return `(${nb})`;
    return `r[${reg}]`;
  };
  s += `if(st+${4 * n}<=c.msize){const i32=c.i32,w=st>>>2;`;
  regs.forEach((reg, k) => { s += `i32[w+${k}]=${val(reg, k)};`; });
  s += '}else{';
  regs.forEach((reg, k) => { s += `c.st32(st+${4 * k},${val(reg, k)});`; });
  s += '}';
  if (wb) s += `r[${rn}]=${nb};`;
  s += `c.cycles+=${n + 3};`;
  return s;
}

export { RETURN_ADDR };
