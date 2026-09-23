// BBC BASIC V inline ARM assembler ([ ... ]), following vendor/.../BASIC/Assembler.
// Assembler statements are compiled (like BASIC statements) into ops; operand expressions are
// normal BASIC expressions evaluated at run time, so multi-pass assembly with OPT works.
//   OPT bits: 0 listing, 1 report errors, 2 offset assembly (code at O%), 3 limit check (L%)
import { T } from './tokens.js';
import { err } from './errors.js';
import { cerr, CompileError, intF, TI, TS, isWordC } from './expr.js';
import { detokenise } from './tokens.js';

const P_IDX = 16, O_IDX = 15, L_IDX = 12;

const MNEMONICS = {
  SWI: 0x8F, ADC: 0x05, ADD: 0x04, AND: 0x00, BIC: 0x0E, CMN: 0x1B, CMP: 0x1A, EOR: 0x01, MOV: 0x2D,
  MVN: 0x2F, ORR: 0x0C, RSB: 0x03, RSC: 0x07, SBC: 0x06, SUB: 0x02, TEQ: 0x19, TST: 0x18, MUL: 0x30,
  MLA: 0x31, LDR: 0x44, STR: 0x54, LDM: 0x68, STM: 0x78, OPT: 0xC0, EQU: 0xC1, DCB: 0xC2, DCW: 0xC3,
  DCD: 0xC4, ADR: 0xC5, ALI: 0xC6,
};
const CONDS = { EQ: 0, NE: 1, CS: 2, HS: 2, CC: 3, LO: 3, MI: 4, PL: 5, VS: 6, VC: 7, HI: 8, LS: 9, GE: 10, LT: 11, GT: 12, LE: 13, AL: 14, NV: 15 };
const STMMODES = { IA: [1, 1], IB: [3, 3], DA: [0, 0], DB: [2, 2], FA: [0, 3], FD: [1, 2], EA: [2, 1], ED: [3, 0] }; // [LDM, STM] -> P<<1|U
const SHIFTS = { ASL: 0, LSL: 0, LSR: 1, ASR: 2, ROR: 3, RRX: 4 };

const up = (c) => (c >= 97 && c <= 122 ? c - 32 : c);

/** encode a 32 bit immediate as an 8 bit value with even rotation; returns -1 if impossible */
export function encodeImm(v) {
  v >>>= 0;
  for (let r = 0; r < 16; r++) {
    const rot = ((v << (2 * r)) | (v >>> (32 - 2 * r))) >>> 0;
    if (r === 0 ? v < 256 : rot < 256) return (r << 8) | (r === 0 ? v : rot);
  }
  return -1;
}

export class Assembler {
  constructor(m) { this.m = m; }
  get I() { return this.m.interp; }

  /** '[' executed: default OPT 3 until an OPT statement */
  start() { this.I.bytesm = 3; }
  end() { this.I.bytesm = 255; }

  /**
   * Compile assembler statements from P.p. Stops after ']' (P.asmEOL=false) or at the end of
   * line (P.asmEOL = true, the line continues in assembler mode).
   */
  compile(P) {
    const I = this.I;
    const b = P.b;
    P.asmEOL = false;
    for (;;) {
      const st = P.p;
      let c = P.sp();
      if (c === 13) {
        P.asmEOL = true;
        return;
      }
      if (c === 0x5D) { // ]
        P.p++;
        P.emit(() => { I.bytesm = 255; });
        return;
      }
      try {
        this.statement(P, st);
      } catch (e) {
        if (!(e instanceof CompileError)) throw e;
        P.emit(() => { throw err(e.key); });
        // skip to next ':' or CR
        let q = false;
        while (b[P.p] !== 13) { const d = b[P.p]; if (d === 0x22) q = !q; if (!q && d === 0x3A) break; P.p++; }
      }
      c = P.sp();
      if (c === 0x3A) { P.p++; continue; }
      if (c === 13) continue;
    }
  }

  // ---- one statement --------------------------------------------------------
  statement(P, st) {
    const I = this.I;
    const b = P.b;
    let label = null;
    let labelText = null;
    if (P.sp() === 0x2E) { // .label
      const ls = P.p;
      P.p++;
      const lv = P.lvalue(false);
      if (!lv) throw cerr('ERSYNT');
      if (lv.t === TS) throw cerr('ERTYPENUM');
      label = lv.setter(() => I._pv);
      labelText = detokenise(b.slice(ls, P.p));
    }
    const itemStart = P.p;
    const c = P.sp();
    let gen = null; // () => {bytes:number, value?:int, str?:string}
    let size = 0;
    let isOpcode = false;
    let fnCall = false;
    if (c === 0x3A || c === 13 || c === 0x5D) {
      gen = null;
    } else if (c === 0x5C || c === 0x3B || c === T.REM) { // comment
      while (b[P.p] !== 13 && b[P.p] !== 0x3A) P.p++;
    } else if (c === 0x3D) { // = DCB
      P.p++;
      const n = P.expr();
      gen = this.dcbGen(n);
    } else if (c === 0x26) { // & DCD
      P.p++;
      const f = intF(I, P.expr());
      gen = () => ({ n: 4, v: f() });
    } else if (c === T.FN) {
      P.p++;
      const save = { v: 0 };
      P.emit(() => { save.v = I.bytesm; });
      P.fnCall(); // hoisted call op (value ignored)
      P.emit(() => { I.bytesm = save.v; });
      fnCall = true;
    } else {
      const r = this.instruction(P);
      gen = r.gen; isOpcode = r.opcode;
    }
    // end of statement: ':' CR or comment
    let d = P.sp();
    if (d === 0x3B || d === 0x5C || d === T.REM) { while (b[P.p] !== 13 && b[P.p] !== 0x3A) P.p++; d = b[P.p]; }
    if (d !== 0x3A && d !== 13) throw cerr('ERSYNT');
    const srcBytes = b.slice(itemStart, P.p);
    const self = this;
    P.emit(() => self.exec(label, labelText, gen, isOpcode, srcBytes));
    void fnCall; void size;
  }

  /** execute one assembled statement */
  exec(label, labelText, gen, isOpcode, srcBytes) {
    const I = this.I;
    const m = this.m;
    const iv = I.iv;
    if (label) { I._pv = iv[P_IDX]; label(); }
    if (isOpcode) this.align();
    let bytes = null; let n = 0;
    const r = gen ? gen() : null;  // (ALIGN and OPT change P% / OPT here)
    const addr = iv[P_IDX];
    if (r) {
      n = r.n;
      if (r.s !== undefined) { bytes = Array.from(r.s, (ch) => ch.charCodeAt(0) & 255); n = bytes.length; }
      else { bytes = []; for (let i = 0; i < n; i++) bytes.push((r.v >>> (8 * i)) & 255); }
    }
    const opt = I.bytesm;
    let dest = addr;
    if (opt & 4) dest = iv[O_IDX];
    if (opt & 8) { if (((dest + n) >>> 0) > (iv[L_IDX] >>> 0)) throw err('ERASS2LIM'); }
    if (bytes) for (let i = 0; i < bytes.length; i++) m.mem.wr8((dest + i) >>> 0, bytes[i]);
    if (opt & 4) iv[O_IDX] = (dest + n) | 0;
    if (opt & 1) this.list(addr, bytes, n, labelText, srcBytes);
    iv[P_IDX] = (addr + n) | 0;
  }

  list(addr, bytes, n, labelText, srcBytes) {
    const m = this.m;
    let s = (addr >>> 0).toString(16).toUpperCase().padStart(8, '0') + ' ';
    if (n >= 5) s += '        ';
    else {
      let v = 0; for (let i = 0; i < n; i++) v |= bytes[i] << (8 * i);
      s += n ? (v >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(8 - 2 * n) : '';
      s += ' '.repeat((4 - n) * 2);
    }
    s += ' ';
    let src = detokenise(srcBytes).replace(/^ +/, '');
    if (labelText) s += labelText + ' '.repeat(Math.max(1, 10 - labelText.length));
    else if (src.length) s += ' '.repeat(10);
    s += src.replace(/ +$/, '');
    m.writeStr(s.replace(/ +$/, '')); m.newLine();
  }

  align() {
    const iv = this.I.iv;
    if (this.I.bytesm & 4) iv[O_IDX] = (iv[O_IDX] + 3) & ~3;
    iv[P_IDX] = (iv[P_IDX] + 3) & ~3;
  }

  dcbGen(n) {
    const I = this.I;
    const f = n.f; const t = n.t;
    return () => {
      const v = f(); const vt = t <= TS ? t : I.t;
      if (vt === TS) return { s: v };
      return { n: 1, v: vt === TI ? v : Math.trunc(v) | 0 };
    };
  }

  // ---- instructions ---------------------------------------------------------
  instruction(P) {
    const I = this.I;
    const b = P.b;
    let c = b[P.p];
    let op = null;
    let code = 0;
    // tokenised mnemonics
    if (c === T.AND) { P.p++; op = 0x00; }
    else if (c === T.EOR) { P.p++; op = 0x01; }
    else if (c === T.OR) {
      if (up(b[P.p + 1]) !== 0x52) throw cerr('ERASS1');
      P.p += 2; op = 0x0C;
    } else if (c === T.MOVE) { // MOVEQ
      if (up(b[P.p + 1]) !== 0x51) throw cerr('ERASS1');
      P.p += 2;
      return { gen: this.dataOp(P, 0x0D, 2, 0 << 28), opcode: true };
    } else if (up(c) === 0x42 && up(b[P.p + 1]) !== 0x49) { // B / BL (not BIC)
      P.p++;
      return { gen: this.branch(P), opcode: true };
    } else {
      const m3 = String.fromCharCode(up(b[P.p]), up(b[P.p + 1] || 0), up(b[P.p + 2] || 0));
      if (!(m3 in MNEMONICS)) throw cerr('ERASS1');
      P.p += 3;
      op = MNEMONICS[m3];
      if (op >= 0xC0) return this.directive(P, op);
      const kind = op >> 4;
      if (kind === 0 || kind === 1 || kind === 2 || kind === 3) {
        // data processing / multiply : fall through to below
      } else {
        const cond = this.cond(P);
        switch (kind) {
          case 4: return { gen: this.ldrStr(P, true, cond), opcode: true };
          case 5: return { gen: this.ldrStr(P, false, cond), opcode: true };
          case 6: return { gen: this.ldmStm(P, true, cond), opcode: true };
          case 7: return { gen: this.ldmStm(P, false, cond), opcode: true };
          case 8: return { gen: this.swi(P, cond), opcode: true };
        }
      }
    }
    const kind = op >> 4;
    const cond = this.cond(P);
    if (kind === 3) return { gen: this.mul(P, op & 1, cond), opcode: true };
    return { gen: this.dataOp(P, op & 15, kind, cond), opcode: true };
  }

  cond(P) {
    const b = P.b;
    const s = String.fromCharCode(up(b[P.p]), up(b[P.p + 1] || 0));
    if (s in CONDS) { P.p += 2; return CONDS[s] << 28; }
    return 0xE0000000 | 0;
  }

  /** register: R0-R15 / PC, else FACTOR expression 0..15. Returns closure */
  reg(P) {
    const I = this.I;
    const b = P.b;
    P.sp();
    const c = up(b[P.p]);
    if (c === 0x52) { // R
      const d = b[P.p + 1];
      if (d >= 48 && d <= 57) {
        let n = d - 48;
        let len = 2;
        if (n === 1) { const e = b[P.p + 2]; if (e >= 48 && e <= 53) { n = 10 + (e - 48); len = 3; } }
        const e2 = b[P.p + 2];
        if (!(n === 1 && e2 >= 54 && e2 <= 57)) { // R16-R19 are expressions (variables)
          P.p += len;
          return () => n;
        }
      }
    } else if (c === 0x50 && up(b[P.p + 1]) === 0x43) { P.p += 2; return () => 15; }
    const f = intF(I, P.factor());
    return () => { const v = f(); if ((v >>> 0) > 15) throw err('ERASS3'); return v; };
  }
  comma(P) {
    if (P.sp() !== 0x2C) throw cerr('ERCOMM');
    P.p++;
  }
  suffix(P, ch) {
    if (up(P.b[P.p]) === ch) { P.p++; return true; }
    return false;
  }

  /** operand 2: #imm | Rm [, shift] */
  operand2(P, allowRegShift = true) {
    const I = this.I;
    if (P.sp() === 0x23) {
      P.p++;
      const f = intF(I, P.expr());
      return () => {
        const v = f();
        const e = encodeImm(v);
        if (e < 0) { if (I.bytesm & 2) throw err('ERASS2'); return 0x2000000 | (v & 255); }
        return 0x2000000 | e;
      };
    }
    const rm = this.reg(P);
    let sh = null;
    if (P.sp() === 0x2C) { P.p++; sh = this.shift(P, allowRegShift); }
    return () => { let v = rm(); if (sh) v |= sh(); return v; };
  }
  shift(P, allowReg) {
    const I = this.I;
    const b = P.b;
    P.sp();
    const s = String.fromCharCode(up(b[P.p]), up(b[P.p + 1] || 0), up(b[P.p + 2] || 0));
    if (!(s in SHIFTS)) throw cerr('ERSYNT');
    P.p += 3;
    const t = SHIFTS[s];
    if (t === 4) return () => 0x60; // RRX = ROR #0
    if (P.sp() === 0x23) {
      P.p++;
      const f = intF(I, P.expr());
      return () => {
        let n = f();
        if (t !== 0 && n === 0) throw err('ERASS2S');
        if (t === 1 || t === 2) { if ((n >>> 0) >= 33) throw err('ERASS2S'); }
        else if ((n >>> 0) >= 32) throw err('ERASS2S');
        return (t << 5) | ((n & 31) << 7);
      };
    }
    if (!allowReg) throw cerr('ERASS2S');
    const rs = this.reg(P);
    return () => 0x10 | (t << 5) | (rs() << 8);
  }

  dataOp(P, opc, kind, cond) {
    let S = 0;
    let rdF = null, rnF = null;
    if (kind === 1) { // CMP etc: S always, optional S / P
      S = 1;
      if (this.suffix(P, 0x53)) { /* S */ }
      let pFlag = false;
      if (this.suffix(P, 0x50)) pFlag = true;
      rnF = this.reg(P);
      this.comma(P);
      const o2 = this.operand2(P);
      return () => ({ n: 4, v: (cond | (opc << 21) | (1 << 20) | (rnF() << 16) | (pFlag ? 0xF000 : 0) | o2()) | 0 });
    }
    if (this.suffix(P, 0x53)) S = 1;
    rdF = this.reg(P);
    this.comma(P);
    if (kind === 0) { rnF = this.reg(P); this.comma(P); }
    const o2 = this.operand2(P);
    return () => {
      const rd = rdF(); const rn = rnF ? rnF() : 0;
      return { n: 4, v: (cond | (opc << 21) | (S << 20) | (rn << 16) | (rd << 12) | o2()) | 0 };
    };
  }

  mul(P, acc, cond) {
    let S = 0;
    if (this.suffix(P, 0x53)) S = 1;
    const rd = this.reg(P); this.comma(P);
    const rm = this.reg(P); this.comma(P);
    const rs = this.reg(P);
    let rn = null;
    if (acc) { this.comma(P); rn = this.reg(P); }
    return () => {
      const d = rd(), mm = rm();
      if (d === mm) throw err('ERASSMUL');
      return { n: 4, v: (cond | 0x90 | (acc << 21) | (S << 20) | (d << 16) | mm | (rs() << 8) | ((rn ? rn() : 0) << 12)) | 0 };
    };
  }

  ldrStr(P, load, cond) {
    const I = this.I;
    let base = 0x04000000 | 0x800000 | (load ? 0x100000 : 0);
    if (this.suffix(P, 0x42)) base |= 0x400000; // B
    if (this.suffix(P, 0x54)) base |= 0x200000; // T
    const rd = this.reg(P);
    this.comma(P);
    const c = P.sp();
    if (c !== 0x5B) { // label: PC relative
      const f = intF(I, P.expr());
      return () => {
        const off = (f() - (I.iv[P_IDX] + 8)) | 0;
        return { n: 4, v: this.packOffset(cond | base | 0x1000000 | (15 << 16) | (rd() << 12), off) };
      };
    }
    P.p++;
    const rn = this.reg(P);
    let d = P.sp();
    if (d === 0x5D) { // post-indexed or [Rn]
      P.p++;
      if (P.sp() !== 0x2C) {
        let wb = 0;
        return () => ({ n: 4, v: (cond | base | 0x1000000 | (rn() << 16) | (rd() << 12) | wb) | 0 });
      }
      P.p++;
      const off = this.offset(P);
      return () => ({ n: 4, v: off(cond | base | (rn() << 16) | (rd() << 12)) });
    }
    if (d !== 0x2C) throw cerr('ERCOMM');
    P.p++;
    const off = this.offset(P);
    if (P.sp() !== 0x5D) throw cerr('ERASSB1');
    P.p++;
    let wb = 0;
    if (P.sp() === 0x21) { P.p++; wb = 0x200000; }
    return () => ({ n: 4, v: off(cond | base | 0x1000000 | wb | (rn() << 16) | (rd() << 12)) });
  }
  packOffset(w, off) {
    if (off < 0) { w &= ~0x800000; off = -off; }
    if (off >= 0x1000) { if (this.I.bytesm & 2) throw err('ERASS2A'); off &= 0xFFF; }
    return (w | off) | 0;
  }
  /** offset after '[Rn,' or '],' : #imm | [-]Rm[,shift]; returns fn(word)->word */
  offset(P) {
    const I = this.I;
    if (P.sp() === 0x23) {
      P.p++;
      const f = intF(I, P.expr());
      return (w) => this.packOffset(w, f());
    }
    let neg = false;
    if (P.sp() === 0x2D) { P.p++; neg = true; }
    const rm = this.reg(P);
    let sh = null;
    if (P.sp() === 0x2C) { P.p++; sh = this.shift(P, false); }
    return (w) => {
      let v = w | 0x2000000 | rm();
      if (neg) v &= ~0x800000;
      if (sh) v |= sh();
      return v | 0;
    };
  }

  ldmStm(P, load, cond) {
    const b = P.b;
    const s = String.fromCharCode(up(b[P.p]), up(b[P.p + 1] || 0));
    if (!(s in STMMODES)) throw cerr('ERSYNT');
    P.p += 2;
    const pu = STMMODES[s][load ? 0 : 1];
    let w = 0x08000000 | ((pu & 1) << 23) | ((pu >> 1) << 24) | (load ? 0x100000 : 0);
    const rn = this.reg(P);
    if (P.sp() === 0x21) { P.p++; w |= 0x200000; }
    this.comma(P);
    if (P.sp() !== 0x7B) throw cerr('ERASSB2');
    P.p++;
    const parts = [];
    for (;;) {
      const r1 = this.reg(P);
      if (P.sp() === 0x2D) { P.p++; const r2 = this.reg(P); parts.push([r1, r2]); } else parts.push([r1, null]);
      if (P.sp() === 0x2C) { P.p++; continue; }
      break;
    }
    if (P.sp() !== 0x7D) throw cerr('ERASSB3');
    P.p++;
    if (P.sp() === 0x5E) { P.p++; w |= 0x400000; }
    return () => {
      let list = 0;
      for (const [a, bb] of parts) {
        let x = a();
        if (bb) { let y = bb(); if (x > y) [x, y] = [y, x]; for (let i = x; i <= y; i++) list |= 1 << i; } else list |= 1 << x;
      }
      return { n: 4, v: (cond | w | (rn() << 16) | list) | 0 };
    };
  }

  swi(P, cond) {
    const I = this.I; const m = this.m;
    const n = P.expr();
    const f = n.f; const t = n.t;
    return () => {
      const v = f(); const vt = t <= TS ? t : I.t;
      let num;
      if (vt === TS) { num = m.swis.lookup(v); if (num === undefined) throw err('ERASS1'); }
      else num = vt === TI ? v : Math.trunc(v);
      return { n: 4, v: (cond | 0x0F000000 | (num & 0xFFFFFF)) | 0 };
    };
  }

  branch(P) {
    const I = this.I;
    const b = P.b;
    let link = 0;
    let cond;
    if (up(b[P.p]) === 0x4C) { // L
      const s2 = String.fromCharCode(up(b[P.p + 1] || 0), up(b[P.p + 2] || 0));
      if (s2 in CONDS) { P.p += 3; link = 1; cond = CONDS[s2] << 28; }
      else {
        const s1 = String.fromCharCode(0x4C, up(b[P.p + 1] || 0));
        if (s1 in CONDS) { P.p += 2; cond = CONDS[s1] << 28; }
        else { P.p++; link = 1; cond = 0xE0000000 | 0; }
      }
    } else cond = this.cond(P);
    const f = intF(I, P.expr());
    return () => {
      const pc = (I.iv[P_IDX] + 3) & ~3;
      const off = ((f() - (pc + 8 - 3)) >>> 2) & 0xFFFFFF;
      return { n: 4, v: (cond | 0x0A000000 | (link << 24) | off) | 0 };
    };
  }

  directive(P, op) {
    const I = this.I;
    const b = P.b;
    switch (op) {
      case 0xC0: { // OPT
        const f = intF(I, P.expr());
        return { gen: () => { I.bytesm = f() & 15; return { n: 0, v: 0 }; }, opcode: false };
      }
      case 0xC1: { // EQUx
        const k = up(b[P.p++]);
        if (k === 0x53) { // EQUS
          const s = P.expr();
          const f = s.f; const t = s.t;
          return { gen: () => { const v = f(); if ((t <= TS ? t : I.t) !== TS) throw err('ERTYPESTR'); return { s: v }; }, opcode: false };
        }
        const f = intF(I, P.expr());
        if (k === 0x44) return { gen: () => ({ n: 4, v: f() }), opcode: false };
        if (k === 0x42) return { gen: () => ({ n: 1, v: f() }), opcode: false };
        if (k === 0x57) return { gen: () => ({ n: 2, v: f() }), opcode: false };
        throw cerr('ERASS1EQU');
      }
      case 0xC2: return { gen: this.dcbGen(P.expr()), opcode: false }; // DCB
      case 0xC3: { const f = intF(I, P.expr()); return { gen: () => ({ n: 2, v: f() }), opcode: false }; }
      case 0xC4: { const f = intF(I, P.expr()); return { gen: () => ({ n: 4, v: f() }), opcode: false }; }
      case 0xC5: { // ADR
        const cond = this.cond(P);
        const rd = this.reg(P);
        this.comma(P);
        const f = intF(I, P.expr());
        return {
          gen: () => {
            const pc = (I.iv[P_IDX] + 3) & ~3;
            let off = (f() - (pc + 8)) | 0;
            let w = cond | 0x02000000 | (15 << 16) | (rd() << 12);
            if (off >= 0) w |= 0x00800000; else { w |= 0x00400000; off = -off; }
            const e = encodeImm(off);
            if (e < 0) { if (I.bytesm & 2) throw err('ERASS2'); return { n: 4, v: (w | (off & 255)) | 0 }; }
            return { n: 4, v: (w | e) | 0 };
          },
          opcode: true,
        };
      }
      case 0xC6: { // ALIGN
        if (up(b[P.p]) !== 0x47 || up(b[P.p + 1]) !== 0x4E) throw cerr('ERASS1');
        P.p += 2;
        return { gen: () => { this.align(); return { n: 0, v: 0 }; }, opcode: false };
      }
    }
    throw cerr('ERASS1');
  }
}
