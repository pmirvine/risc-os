// ARM2/ARM3 (ARMv2a, 26-bit PC+PSR) interpreter used for CALL / USR on assembled code.
// R15 holds PC in bits 2-25 and N Z C V I F / mode in bits 31-26 and 1-0 (USR mode here).
// SWIs are passed to a callback that may return a Promise (execution then suspends).
import { BasicError } from './errors.js';

const RETURN_ADDR = 0x03FFFFF8; // sentinel placed in R14 by call()
const PCMASK = 0x03FFFFFC;

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
    this.halt = false;
    this.escape = null; // () => boolean, abort check
    this.instrCount = 0;
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
    let budget = 0;
    for (;;) {
      const r = this.step(200000);
      if (r === 'done') return undefined;
      if (r && typeof r.then === 'function') return r.then(() => this.run());
      budget++;
      if (budget > 50) {
        // yield to the host so a runaway loop does not freeze the page
        return new Promise((res) => setTimeout(res, 0)).then(() => {
          if (this.escape && this.escape()) throw new BasicError(17, 'Escape');
          return this.run();
        });
      }
    }
  }

  /** Execute up to n instructions. Returns 'done', a Promise (SWI), or undefined (budget used). */
  step(n) {
    const mem = this.mem;
    const r = this.r;
    for (let k = 0; k < n; k++) {
      const pc = this.pc;
      if (pc === RETURN_ADDR || this.halt) return 'done';
      if (pc + 4 > mem.size) throw new BasicError(0x80000001 | 0, `Abort on instruction fetch at &${pc.toString(16).toUpperCase()}`);
      const ins = mem.i32[pc >> 2];
      this.instrCount++;
      this.nextPc = (pc + 4) & PCMASK;
      if (this.condOK(ins >>> 28)) {
        const res = this.exec(ins);
        if (res !== undefined) {
          if (typeof res.then === 'function') {
            return res.then((o) => { this.afterSwi(o); this.pc = this.nextPc; });
          }
        }
      }
      this.pc = this.nextPc;
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

  exec(ins) {
    const t = (ins >>> 25) & 7;
    switch (t) {
      case 0:
        if ((ins & 0x0FC000F0) === 0x00000090) return this.mul(ins);
        if ((ins & 0x0FB00FF0) === 0x01000090) return this.swp(ins);
        return this.dp(ins, false);
      case 1: return this.dp(ins, true);
      case 2: case 3:
        if (t === 3 && (ins & 0x10)) return this.undef();
        return this.ldrstr(ins);
      case 4: return this.ldmstm(ins);
      case 5: {
        let off = (ins & 0xFFFFFF) << 8 >> 6;
        if (ins & 0x01000000) this.r[14] = ((this.pc + 4) & PCMASK) | this.psr();
        this.nextPc = (this.pc + 8 + off) & PCMASK;
        return;
      }
      case 6: return this.undef();
      case 7:
        if (ins & 0x01000000) return this.swi(ins & 0xFFFFFF);
        return this.undef();
    }
  }
  undef() {
    throw new BasicError(0x80000000 | 0, `Undefined instruction at &${this.pc.toString(16).toUpperCase().padStart(8, '0')}`);
  }

  swi(num) {
    const res = this.swiCb(num, this);
    if (res && typeof res.then === 'function') return res;
    this.afterSwi(res);
    // error from non-X SWI would have thrown
  }

  // shifter: returns value, sets this.sc (shifter carry)
  shiftOp(ins, regShift) {
    const rm = ins & 15;
    const type = (ins >>> 5) & 3;
    let amt;
    let v;
    if (regShift) {
      v = rm === 15 ? this.r15(12) : this.r[rm];
      amt = this.r[(ins >>> 8) & 15] & 255;
      if (amt === 0) { this.sc = this.C; return v; }
      switch (type) {
        case 0: if (amt < 32) { this.sc = (v >>> (32 - amt)) & 1; return v << amt; } this.sc = amt === 32 ? v & 1 : 0; return 0;
        case 1: if (amt < 32) { this.sc = (v >>> (amt - 1)) & 1; return v >>> amt; } this.sc = amt === 32 ? (v >>> 31) & 1 : 0; return 0;
        case 2: if (amt < 32) { this.sc = (v >> (amt - 1)) & 1; return v >> amt; } this.sc = (v >>> 31) & 1; return v >> 31;
        default: { const a = amt & 31; if (a === 0) { this.sc = (v >>> 31) & 1; return v; } this.sc = (v >>> (a - 1)) & 1; return (v >>> a) | (v << (32 - a)); }
      }
    }
    v = rm === 15 ? this.r15(8) : this.r[rm];
    amt = (ins >>> 7) & 31;
    switch (type) {
      case 0:
        if (amt === 0) { this.sc = this.C; return v; }
        this.sc = (v >>> (32 - amt)) & 1; return v << amt;
      case 1:
        if (amt === 0) { this.sc = (v >>> 31) & 1; return 0; }
        this.sc = (v >>> (amt - 1)) & 1; return v >>> amt;
      case 2:
        if (amt === 0) { this.sc = (v >>> 31) & 1; return v >> 31; }
        this.sc = (v >> (amt - 1)) & 1; return v >> amt;
      default:
        if (amt === 0) { this.sc = v & 1; return (this.C << 31) | (v >>> 1); } // RRX
        this.sc = (v >>> (amt - 1)) & 1; return (v >>> amt) | (v << (32 - amt));
    }
  }

  dp(ins, imm) {
    let op2;
    if (imm) {
      const rot = ((ins >>> 8) & 15) * 2;
      const v = ins & 255;
      op2 = rot ? ((v >>> rot) | (v << (32 - rot))) : v;
      this.sc = rot ? (op2 >>> 31) & 1 : this.C;
    } else op2 = this.shiftOp(ins, (ins & 0x10) !== 0);
    op2 |= 0;
    const opc = (ins >>> 21) & 15;
    const S = (ins >>> 20) & 1;
    const rn = (ins >>> 16) & 15;
    const rd = (ins >>> 12) & 15;
    const regShift = !imm && (ins & 0x10);
    const a = rn === 15 ? ((this.pc + (regShift ? 12 : 8)) & PCMASK) : this.r[rn];
    let res; let logical = true; let cOut = this.sc; let vOut = this.V;
    switch (opc) {
      case 0: res = a & op2; break;
      case 1: res = a ^ op2; break;
      case 2: res = (a - op2) | 0; logical = false; cOut = (a >>> 0) >= (op2 >>> 0) ? 1 : 0; vOut = (((a ^ op2) & (a ^ res)) >>> 31); break;
      case 3: res = (op2 - a) | 0; logical = false; cOut = (op2 >>> 0) >= (a >>> 0) ? 1 : 0; vOut = (((op2 ^ a) & (op2 ^ res)) >>> 31); break;
      case 4: { const s = (a >>> 0) + (op2 >>> 0); res = s | 0; logical = false; cOut = s > 0xFFFFFFFF ? 1 : 0; vOut = ((~(a ^ op2) & (a ^ res)) >>> 31); break; }
      case 5: { const s = (a >>> 0) + (op2 >>> 0) + this.C; res = s | 0; logical = false; cOut = s > 0xFFFFFFFF ? 1 : 0; vOut = ((~(a ^ op2) & (a ^ res)) >>> 31); break; }
      case 6: { const s = (a >>> 0) - (op2 >>> 0) - (1 - this.C); res = s | 0; logical = false; cOut = s >= 0 ? 1 : 0; vOut = (((a ^ op2) & (a ^ res)) >>> 31); break; }
      case 7: { const s = (op2 >>> 0) - (a >>> 0) - (1 - this.C); res = s | 0; logical = false; cOut = s >= 0 ? 1 : 0; vOut = (((op2 ^ a) & (op2 ^ res)) >>> 31); break; }
      case 8: res = a & op2; break;                 // TST
      case 9: res = a ^ op2; break;                 // TEQ
      case 10: res = (a - op2) | 0; logical = false; cOut = (a >>> 0) >= (op2 >>> 0) ? 1 : 0; vOut = (((a ^ op2) & (a ^ res)) >>> 31); break; // CMP
      case 11: { const s = (a >>> 0) + (op2 >>> 0); res = s | 0; logical = false; cOut = s > 0xFFFFFFFF ? 1 : 0; vOut = ((~(a ^ op2) & (a ^ res)) >>> 31); break; } // CMN
      case 12: res = a | op2; break;
      case 13: res = op2; break;
      case 14: res = a & ~op2; break;
      default: res = ~op2; break;
    }
    res |= 0;
    if (opc >= 8 && opc <= 11) {
      // test ops: always set flags; Rd=15 (TEQP etc) sets PSR from the result
      if (rd === 15) { this.setPsr(res, true); return; }
      this.N = (res >>> 31) & 1; this.Z = res === 0 ? 1 : 0; this.C = cOut; if (!logical) this.V = vOut;
      return;
    }
    if (rd === 15) {
      this.nextPc = res & PCMASK;
      if (S) this.setPsr(res, true);
      return;
    }
    this.r[rd] = res;
    if (S) {
      this.N = (res >>> 31) & 1; this.Z = res === 0 ? 1 : 0; this.C = cOut;
      if (!logical) this.V = vOut;
    }
  }

  mul(ins) {
    const rd = (ins >>> 16) & 15, rn = (ins >>> 12) & 15, rs = (ins >>> 8) & 15, rm = ins & 15;
    let res = Math.imul(this.r[rm], this.r[rs]);
    if (ins & 0x200000) res = (res + this.r[rn]) | 0;
    if (rd !== 15) this.r[rd] = res;
    if (ins & 0x100000) { this.N = (res >>> 31) & 1; this.Z = res === 0 ? 1 : 0; }
  }

  swp(ins) {
    const rn = (ins >>> 16) & 15, rd = (ins >>> 12) & 15, rm = ins & 15;
    const addr = this.r[rn] >>> 0;
    if (ins & 0x400000) { const v = this.mem.rd8(addr); this.mem.wr8(addr, this.r[rm] & 255); this.r[rd] = v; }
    else { const v = this.mem.rd32rot(addr); this.mem.wr32(addr & ~3, this.r[rm]); this.r[rd] = v; }
  }

  ldrstr(ins) {
    const I = (ins >>> 25) & 1, P = (ins >>> 24) & 1, U = (ins >>> 23) & 1, B = (ins >>> 22) & 1, W = (ins >>> 21) & 1, L = (ins >>> 20) & 1;
    const rn = (ins >>> 16) & 15, rd = (ins >>> 12) & 15;
    let off;
    if (I) { off = this.shiftOp(ins, false); } else off = ins & 0xFFF;
    const base = rn === 15 ? ((this.pc + 8) & PCMASK) : this.r[rn];
    const offAddr = U ? (base + off) | 0 : (base - off) | 0;
    const addr = (P ? offAddr : base) >>> 0;
    const mem = this.mem;
    if (L) {
      let v;
      if (B) v = mem.rd8(addr); else v = mem.rd32rot(addr);
      if (!P || W) { if (rn !== 15) this.r[rn] = offAddr; }
      if (rd === 15) { this.nextPc = v & PCMASK; } else this.r[rd] = v;
    } else {
      const v = rd === 15 ? this.r15(12) : this.r[rd];
      if (B) mem.wr8(addr, v & 255); else mem.wr32(addr & ~3, v);
      if (!P || W) { if (rn !== 15) this.r[rn] = offAddr; }
    }
  }

  ldmstm(ins) {
    const P = (ins >>> 24) & 1, U = (ins >>> 23) & 1, S = (ins >>> 22) & 1, W = (ins >>> 21) & 1, L = (ins >>> 20) & 1;
    const rn = (ins >>> 16) & 15;
    const list = ins & 0xFFFF;
    let n = 0; for (let i = 0; i < 16; i++) if (list & (1 << i)) n++;
    const base = this.r[rn] >>> 0;
    let start;
    if (U) start = P ? base + 4 : base;
    else start = P ? base - 4 * n : base - 4 * n + 4;
    const newBase = U ? (base + 4 * n) | 0 : (base - 4 * n) | 0;
    const mem = this.mem;
    let a = start >>> 0;
    if (L) {
      if (W) this.r[rn] = newBase;
      for (let i = 0; i < 16; i++) {
        if (!(list & (1 << i))) continue;
        const v = mem.rd32(a & ~3); a += 4;
        if (i === 15) { this.nextPc = v & PCMASK; if (S) this.setPsr(v, true); }
        else this.r[i] = v;
      }
    } else {
      let first = true;
      for (let i = 0; i < 16; i++) {
        if (!(list & (1 << i))) continue;
        let v = i === 15 ? this.r15(12) : this.r[i];
        if (i === rn && !first && W) v = newBase;
        mem.wr32(a & ~3, v); a += 4;
        first = false;
      }
      if (W) this.r[rn] = newBase;
    }
  }
}

export { RETURN_ADDR };
