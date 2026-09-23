// SciCalc calculation engine: a line-by-line port of the logic in the original
// !SciCalc.!RunImage (BBC BASIC, v0.35+ / 0.55): entry buffer, operator stack with
// precedence, one level of brackets, memory, four number bases, three trig modes,
// and BASIC64 floating point error semantics. Host-agnostic (unit-testable in node).
//
// Icon numbers are the template icon numbers of the "Calculator" window.

import { formatNumber, toInt } from '../../basic/numfmt.js';

class CalcError extends Error {}

const DEC = 1, BIN = 2, OCT = 3, HEX = 4;
const COF = [0, 76.18009173, -86.50532033, 24.01409822, -1.231739516, 0.120858003e-2, -0.536382e-5];
const STP = 2.50662827465;

export class SciCalc {
  /** msg(token) -> text (the SciCalc Messages file). */
  constructor(msg = (t) => t) {
    this.msg = msg;
    this.memory = 0;
    this.trig = 2;          // 1 rad, 2 deg, 3 grad
    this.base = DEC;
    this.icon = 0;          // last icon clicked (PROCretitle looks at it)
    this.num = new Array(21).fill(0);
    this.op = new Array(21).fill('');
    // icon display state: 'hidden' | 'grey' | undefined (normal)
    this.hidden = new Set();
    this.greyed = new Set();
    for (let i = 53; i <= 69; i++) this.hide(i);
    this.clear();
  }

  E(tok) { return new CalcError(this.msg(tok)); }

  // ---------------------------------------------------------------- BASIC helpers
  /** FP result check (FPEmulator exceptions: invalid operation, overflow). */
  chk(v) {
    if (Number.isNaN(v)) throw this.E('E4');
    if (!Number.isFinite(v)) throw this.E('E1');
    return v;
  }
  str(v) { return formatNumber(v, 0); }                  // STR$ (@% = G10)
  val(s) {                                               // VAL
    const m = /^\s*([+-]?)(\d*\.?\d*)(?:E([+-]?\d{0,2}))?/.exec(s);
    if (!m || !/\d/.test(m[2])) return 0;
    const v = parseFloat(m[2] + (m[3] && /\d/.test(m[3]) ? 'e' + m[3] : ''));
    return m[1] === '-' ? -v : v;
  }
  int(v) { return toInt(v); }                             // assign to an integer variable
  todec(radix, s) {                                      // OS_ReadUnsigned -> signed int
    const digits = '0123456789ABCDEF'.slice(0, radix);
    let v = 0, any = false;
    for (const c of String(s).toUpperCase()) {
      const d = digits.indexOf(c);
      if (d < 0) break;
      v = v * radix + d; any = true;
      if (v > 0xFFFFFFFF) throw new CalcError('Number too big');
    }
    if (!any) throw new CalcError('Bad number');
    return v | 0;
  }
  zero(s) { s = s.replace(/^0+/, ''); return s === '' ? '0' : s; }
  tobin(vs) { return this.zero((this.int(this.val(vs)) >>> 0).toString(2).padStart(32, '0')); }
  tohex(vs) { return this.zero((this.int(this.val(vs)) >>> 0).toString(16).toUpperCase().padStart(8, '0')); }
  tooct(vs) { return this.zero((this.int(this.val(vs)) >>> 0).toString(8).padStart(11, '0')); }
  convert(s) {
    switch (this.base) {
      case DEC: return this.val(s);
      case BIN: return this.todec(2, s);
      case OCT: return this.todec(8, s);
      default: return this.todec(16, s);
    }
  }
  tobase(dec) {
    if (Number.isNaN(dec)) throw this.E('E7');
    if (this.base !== DEC && dec > 0x7FFFFFFF) throw this.E('E1');
    if (this.base !== DEC && dec < -0x80000000) throw this.E('E2');
    switch (this.base) {
      case DEC: return this.str(dec);
      case BIN: return this.tobin(this.str(dec));
      case OCT: return this.tooct(this.str(dec));
      default: return this.tohex(this.str(dec));
    }
  }

  // ---------------------------------------------------------------- state
  clear() {
    this.errorflag = false; this.errorText = '';
    this.entry = '0'; this.dreg = 0;
    this.F = false; this.hyp = false; this.bracket = false;
    this.lostack = 0; this.histack = -1; this.opstack = false;
  }

  /** The text shown in the display (PROCcalc). */
  display() {
    if (this.errorflag) return this.errorText;
    if (!this.F) return this.entry;
    try { return this.tobase(this.dreg); } catch (e) { this.fail(e); return this.errorText; }
  }

  fail(e) { this.errorflag = true; this.errorText = e?.message ?? String(e); }

  /** Run fn with ON ERROR LOCAL semantics. */
  guard(fn) {
    if (this.errorflag) return;
    try { fn(); } catch (e) { this.fail(e); }
  }

  // ---------------------------------------------------------------- mouse
  /** A click on icon i with Select ('select') or Adjust ('adjust'). */
  click(i, button = 'select') {
    const K = button === 'adjust' ? 1 : 4;
    if (this.errorflag) { if (i === 18) this.clear(); if (i !== 50) this.hyp = false; return; }
    this.icon = i;
    this.guard(() => {
      if (i >= 0 && i <= 9) return this.digit(String(i));
      if (i >= 64 && i <= 69) return this.digit(String.fromCharCode(i + 1));
      const map = {
        10: () => this.point(), 11: () => this.operator('/'), 12: () => this.operator('*'), 13: () => this.sign(),
        14: () => this.operator('-'), 15: () => this.operator('+'), 16: () => this.operator('='),
        17: () => { if (K === 4) this.base = this.base > 3 ? 1 : this.base + 1; else this.base = this.base < 2 ? 4 : this.base - 1; this.retitle(K === 4); },
        18: () => this.clear(), 19: () => this.unary('CE'), 20: () => this.unary('MC'), 21: () => this.unary('Min'),
        22: () => this.unary('MR'), 23: () => this.unary('NOT'), 24: () => this.operator('AND'), 25: () => this.operator('OR'),
        26: () => this.operator('EOR'), 27: () => this.operator('%'), 28: () => this.unary('RND'), 29: () => this.unary('COS'),
        30: () => this.unary('TAN'), 31: () => this.unary('ASN'), 32: () => this.unary('ACS'), 33: () => this.unary('ATN'),
        34: () => this.unary('fact'), 35: () => this.unary('10x'), 36: () => this.unary('LOG'), 37: () => this.unary('LN'),
        38: () => this.unary('ex'), 39: () => this.operator('nCr'), 40: () => this.operator('nPr'), 41: () => this.unary('root'),
        42: () => this.operator('xrty'), 43: () => this.unary('sqrt'), 44: () => this.operator('^'), 45: () => this.unary('reci'),
        46: () => this.digit('E'),
        47: () => { if (K === 4) this.trig = this.trig > 2 ? 1 : this.trig + 1; else this.trig = this.trig < 2 ? 3 : this.trig - 1; this.retitle(K === 4); },
        48: () => (this.bracket ? this.operator(')') : this.operator('(')),
        49: () => this.unary('PI'), 50: () => this.unary('HYP'), 51: () => this.unary('SIN'),
        53: () => this.operator('DIV'), 54: () => this.operator('NOR'), 55: () => this.operator('MOD'), 56: () => this.operator('NAND'),
        57: () => this.operator('EQV'), 58: () => this.operator('<O'), 59: () => this.operator('<<'), 60: () => this.operator('<<'),
        61: () => this.operator('>>'), 62: () => this.operator('>>>'), 63: () => this.operator('O>'),
      };
      map[i]?.();
    });
    if (i !== 50) this.hyp = false;
  }

  // ---------------------------------------------------------------- keyboard
  /** Key press (character code). Returns false if not used (Wimp_ProcessKey). */
  key(code) {
    let c = code;
    if (c >= 97 && c <= 122) c -= 32;
    if (this.errorflag) { if (c === 127) this.clear(); return true; }
    const b = this.base;
    let used = true;
    this.guard(() => {
      if (c === 48 || c === 49) this.digit(String.fromCharCode(c));
      else if (c >= 50 && c <= 55) { if (b !== BIN) this.digit(String.fromCharCode(c)); }
      else if (c === 56 || c === 57) { if (b === DEC || b === HEX) this.digit(String.fromCharCode(c)); }
      else if ([65, 66, 67, 68, 70].includes(c)) { if (b === HEX) this.digit(String.fromCharCode(c)); }
      else if (c === 69) { if (b === DEC || b === HEX) this.digit('E'); }
      else if (c === 13 || c === 61) this.operator('=');
      else if (c === 47) this.operator(b === DEC ? '/' : 'DIV');
      else if (c === 40) { if (!this.bracket) this.operator('('); }
      else if (c === 41) { if (this.bracket) this.operator(')'); }
      else if (c === 42) this.operator('*');
      else if (c === 43) this.operator('+');
      else if (c === 45) this.operator('-');
      else if (c === 94) { if (b === DEC) this.operator('^'); }
      else if (c === 37) { if (b === DEC) this.operator('%'); }
      else if (c === 33) { if (b === DEC) this.unary('fact'); }
      else if (c === 35) this.sign();
      else if (c === 127) this.clear();
      else if (c === 46) { if (b === DEC) this.point(); else this.operator('MOD'); }
      else used = false;
    });
    return used;
  }

  // ---------------------------------------------------------------- PROCretitle (icon states + base conversion)
  // PROChide_icon / PROCshow_icon toggle the 'deleted' flag, PROCgrey_icon sets 'shaded' and
  // removes the sprite and border (leaving an empty filled box); PROCungrey_icon restores them.
  show(i) { this.hidden.delete(i); }
  hide(i) { this.hidden.add(i); }
  grey(i) { this.greyed.add(i); }
  ungrey(i) { this.greyed.delete(i); }
  range(a, b, f) { for (let i = a; i <= b; i++) f.call(this, i); }
  /** Effective state of icon i for the UI: 'hidden' | 'grey' | 'normal'. */
  state(i) { return this.hidden.has(i) ? 'hidden' : this.greyed.has(i) ? 'grey' : 'normal'; }

  title() {
    const base = this.msg(['', 'Dec', 'Bin', 'Oct', 'Hex'][this.base] ?? '???');
    let trig = '';
    if (this.base === DEC) trig = '   (' + this.msg(['NoIdea', 'Rad', 'Deg', 'Grad'][this.trig] ?? 'NoIdea') + ')';
    return this.msg('title', base, trig);
  }

  retitle(forward) {
    const hideR = (a, b) => this.range(a, b, this.hide), showR = (a, b) => this.range(a, b, this.show);
    const greyR = (a, b) => this.range(a, b, this.grey), ungreyR = (a, b) => this.range(a, b, this.ungrey);
    let temp;
    switch (this.base) {
      case DEC:
        if (this.icon !== 47) {
          if (forward) {
            hideR(53, 69); ungreyR(35, 51); this.show(48); this.ungrey(27);
            this.entry = this.str(this.todec(16, this.entry));
          } else {
            hideR(53, 63); ungreyR(35, 51); this.show(48); this.ungrey(27); ungreyR(2, 9);
            this.entry = this.str(this.todec(2, this.entry));
          }
        }
        break;
      case BIN:
        if (forward) {
          showR(53, 63); greyR(2, 9); greyR(35, 51); this.grey(27); this.hide(48);
          this.round(this.val(this.entry));
        } else {
          greyR(2, 7);
          temp = this.todec(8, this.entry); this.entry = this.tobin(this.str(temp));
        }
        break;
      case OCT:
        if (forward) { ungreyR(2, 7); temp = this.todec(2, this.entry); }
        else { this.grey(8); this.grey(9); hideR(64, 69); temp = this.todec(16, this.entry); }
        this.entry = this.tooct(this.str(temp));
        break;
      case HEX:
        if (forward) {
          this.ungrey(8); this.ungrey(9); showR(64, 69);
          temp = this.todec(8, this.entry); this.entry = this.tohex(this.str(temp));
        } else {
          showR(53, 69); greyR(35, 51); this.grey(27); this.hide(48);
          this.round(this.val(this.entry));
        }
        break;
    }
    this.F = true;
  }

  /** Set the base/trig directly (SciCalc$Options at start-up). */
  setOptions(base, trig) {
    this.base = base; this.trig = trig;
    const showR = (a, b) => this.range(a, b, this.show), greyR = (a, b) => this.range(a, b, this.grey);
    if (base === OCT) { showR(53, 63); this.grey(8); this.grey(9); greyR(35, 51); this.grey(27); this.hide(48); }
    if (base === HEX) { showR(53, 63); greyR(35, 51); this.grey(27); this.hide(48); }
  }

  round(temp) {
    if (temp < 0) temp -= 0.5; else if (temp > 0) temp += 0.5;
    if (temp >= 2147483648) throw this.E('E1');
    if (temp <= -2147483649) throw this.E('E2');
    this.dreg = Math.trunc(temp);
    if (this.base === BIN) this.entry = this.tobin(this.str(this.dreg));
    else if (this.base === OCT) this.entry = this.tooct(this.str(this.dreg));
    else if (this.base === HEX) this.entry = this.tohex(this.str(this.dreg));
    if (this.opstack) this.num[this.histack] = this.dreg;
  }

  // ---------------------------------------------------------------- entry
  digit(key) {
    let W;
    if (this.F) this.entry = '0';
    if (this.base === DEC) {
      const E = this.entry.indexOf('E') + 1;
      if (E) {
        if (key === 'E') return;
        W = 2 + E + (this.entry.slice(E - 1).includes('-') ? 1 : 0);
      } else if (key === 'E') W = this.entry.length + 1;
      else W = 10 + (this.entry.includes('-') ? 1 : 0) + (this.entry.includes('.') ? 1 : 0);
    } else if (this.base === BIN) W = 32;
    else if (this.base === OCT) W = this.val(this.entry.slice(0, 1)) < 4 ? 11 : 10;
    else W = 8;
    if (this.entry.length < W) {
      if (this.base === DEC && this.entry === '0' && key === 'E') key = '1E';
      if (this.entry === '0') this.entry = key; else this.entry += key;
      this.dreg = this.convert(this.entry); this.F = false; this.opstack = false;
    }
  }

  point() {
    if (this.base !== DEC) return;
    if (this.F) this.entry = '0';
    if (this.entry.includes('E')) return;
    if (!this.entry.includes('.') && this.entry.length < 10) this.entry += '.';
    this.dreg = this.val(this.entry);
    this.F = false; this.opstack = false;
  }

  sign() {
    if (this.entry === '0') this.entry = this.tobase(this.dreg);
    if (this.base === DEC) {
      if (!this.entry.includes('E') || this.F) {
        this.entry = this.entry.includes('-') ? this.entry.slice(1) : '-' + this.entry;
      } else {
        const exp = this.entry.indexOf('E') + 1;
        const l = this.entry.slice(0, exp); let r = this.entry.slice(exp);
        r = r.startsWith('-') ? r.slice(1) : '-' + r;
        this.entry = l + r;
      }
    } else {
      this.entry = this.tobase(-this.convert(this.entry));
    }
    this.dreg = this.convert(this.entry);
    if (this.opstack) this.num[this.histack] = this.dreg;
  }

  unary(key) {
    this.F = true;
    switch (key) {
      case 'CE': if (!this.opstack) { this.dreg = 0; this.entry = '0'; } break;
      case 'MC': this.memory = 0; break;
      case 'Min': this.memory = this.dreg; break;
      case 'MR':
        this.opstack = false;
        if (this.base !== DEC) this.round(this.memory); else this.dreg = this.memory;
        this.entry = this.tobase(this.dreg);
        break;
      case 'RND': this.opstack = false; this.dreg = Math.random(); this.entry = this.tobase(this.dreg); break;
      case 'PI': this.opstack = false; this.dreg = Math.PI; this.entry = this.tobase(this.dreg); break;
      case 'HYP': this.hyp = true; break;
      default: this.operator(key); this.opstack = false;
    }
  }

  // ---------------------------------------------------------------- operators
  trigIn(v) { return this.trig === 1 ? v : this.trig === 2 ? v * Math.PI / 180 : (Math.PI / 200) * v; }
  trigOut(v) { return this.trig === 1 ? v : this.trig === 2 ? v * 180 / Math.PI : (200 / Math.PI) * v; }
  div(a, b) { if (b === 0) throw new CalcError('Division by zero'); return this.chk(a / b); }
  ln(v) { if (v === 0) throw this.E('E5'); return this.chk(Math.log(v)); }

  operator(key) {
    const d = this.dreg;
    let ans;
    const h = this.hyp;
    switch (key) {
      case 'SIN': ans = h ? this.hsin(d) : Math.sin(this.trigIn(d)); break;
      case 'COS': ans = h ? this.hcos(d) : Math.cos(this.trigIn(d)); break;
      case 'TAN': ans = h ? this.htan(d) : Math.tan(this.trigIn(d)); break;
      case 'ASN': ans = h ? this.hasn(d) : this.trigOut(this.chk(Math.asin(d))); break;
      case 'ACS': ans = h ? this.hacs(d) : this.trigOut(this.chk(Math.acos(d))); break;
      case 'ATN': ans = h ? this.hatn(d) : this.trigOut(Math.atan(d)); break;
      case '%':
        ans = d / 100;
        if (this.histack >= this.lostack) ans = ans * this.num[this.histack];
        break;
      case '(':
        if (!this.opstack) {
          if (this.histack < 0 && this.dreg === 0) this.dreg = 1;
          this.sum('*');
        }
        this.bracket = true;
        this.lostack = this.histack + 1; this.histack = this.lostack - 1;
        this.opstack = false;
        ans = 0;
        break;
      case 'LOG': if (d === 0) throw this.E('E5'); ans = Math.log10(d); break;
      case 'LN': ans = this.ln(d); break;
      case 'root': ans = Math.sqrt(d); break;
      case 'sqrt': ans = d ** 2; break;
      case 'reci': ans = this.div(1, d); break;
      case 'NOT': ans = ~this.int(d); break;
      case 'ex': ans = Math.exp(d); break;
      case '10x': ans = 10 ** d; break;
      case 'fact': ans = this.fact(d); break;
      default: ans = this.sum(key);
    }
    this.dreg = this.chk(ans); this.entry = this.tobase(this.dreg);
    this.hyp = false; this.F = true;
  }

  static pos(p) {
    switch (p) {
      case '^': return 1;
      case 'nCr': case 'nPr': return 2;
      case '*': case '/': case 'DIV': case 'MOD': return 3;
      case '+': case '-': return 4;
      case '<<': case '>>>': case '>>': case 'O>': case '<O': return 5;
      case 'AND': case 'NAND': return 6;
      case 'OR': case 'EOR': case 'NOR': case 'EQV': return 7;
      default: return 0;
    }
  }

  sum(key) {
    this.F = true;
    if (!this.opstack) this.histack++;
    if (this.histack > 20) throw new CalcError('Subscript out of range');
    this.num[this.histack] = this.dreg;
    if (key === '=') { this.bracket = false; this.lostack = 0; }
    for (;;) {
      let more = false;
      if (this.histack > this.lostack) more = key === '=' || key === ')' || SciCalc.pos(key) >= SciCalc.pos(this.op[this.histack - 1]);
      if (!more) break;
      this.num[this.histack - 1] = this.eval2(this.num[this.histack - 1], this.op[this.histack - 1], this.num[this.histack]);
      this.histack--;
    }
    const ans = this.num[this.histack];
    if (key === '=') { this.histack = -1; this.opstack = false; }
    else if (key === ')') { this.bracket = false; this.lostack = 0; this.histack--; this.opstack = false; }
    else { this.op[this.histack] = key; this.opstack = true; }
    return ans;
  }

  /** FNeval2. Ordinary operators go through EVAL(STR$ n1 + op$ + STR$ n2) - 10 digit precision. */
  eval2(n1, op, n2) {
    const I = (v) => this.int(v);
    const shift = (n) => I(n) & 0xFF;          // ARM register-specified shift amount
    switch (op) {
      case 'NAND': return ~(I(n1) & I(n2));
      case 'NOR': return ~(I(n1) | I(n2));
      case 'EQV': return ~(I(n1) ^ I(n2));
      case 'xrty': return this.chk(this.pow(n1, this.div(1, n2)));
      case 'O>': { const a = I(n1) >>> 0, r = I(n2) & 31; return ((a >>> r) | (a << (32 - r))) | 0; }
      case '<O': { const a = I(n1) >>> 0, r = (32 - I(n2)) & 31; return ((a >>> r) | (a << (32 - r))) | 0; }
      case 'nCr': return this.chk(Math.floor(Math.exp(this.lnFact(n1) - this.lnFact(n2) - this.lnFact(n1 - n2)) + 0.5));
      case 'nPr': return this.chk(Math.floor(Math.exp(this.lnFact(n1) - this.lnFact(n1 - n2)) + 0.5));
    }
    const a = Number(this.str(n1)), b = Number(this.str(n2));
    switch (op) {
      case '+': return this.chk(a + b);
      case '-': return this.chk(a - b);
      case '*': return this.chk(a * b);
      case '/': return this.div(a, b);
      case '^': return this.chk(this.pow(a, b));
      case 'DIV': { const y = I(b); if (y === 0) throw new CalcError('Division by zero'); return (I(a) / y) | 0; }
      case 'MOD': { const y = I(b); if (y === 0) throw new CalcError('Division by zero'); return (I(a) % y) | 0; }
      case 'AND': return I(a) & I(b);
      case 'OR': return I(a) | I(b);
      case 'EOR': return I(a) ^ I(b);
      case '<<': { const s = shift(b); return s >= 32 ? 0 : (I(a) << s) | 0; }
      case '>>': { const s = shift(b); return I(a) >> Math.min(s, 31); }
      case '>>>': { const s = shift(b); return s >= 32 ? 0 : (I(a) >>> s) | 0; }
      default: throw new CalcError('Syntax error');
    }
  }

  pow(a, b) {
    if (a === 0 && b < 0) throw this.E('E5');
    return a ** b;
  }

  // ---------------------------------------------------------------- functions
  hsin(n) { return Math.abs(n) > 1e-3 ? this.chk(Math.exp(n)) / 2 - Math.exp(-n) / 2 : n + n ** 3 / 6; }
  hcos(n) { return this.chk(Math.exp(n) / 2 + Math.exp(-n) / 2); }
  htan(n) { return Math.abs(n) > 37 ? Math.sign(n) : this.hsin(n) / this.hcos(n); }
  hasn(n) {
    if (Math.abs(n) > 1e18) return Math.sign(n) * this.ln(2 * Math.abs(n));
    return Math.abs(n) < 1e-6 ? n : this.ln(n + Math.sqrt(n * n + 1));
  }
  hacs(n) { return n > 1e18 ? this.ln(2 * n) : this.ln(n + this.chk(Math.sqrt(n * n - 1))); }
  hatn(n) { return Math.abs(n) < 1e-6 ? n : this.ln(this.div(1 + n, 1 - n)) / 2; }

  lnFact(x) {
    let tmp = x + 5.5;
    tmp = (x + 0.5) * this.ln(tmp) - tmp;
    let ser = 1;
    for (let j = 1; j <= 6; j++) { x += 1; ser += this.div(COF[j], x); }
    return tmp + this.ln(STP * ser);
  }

  fact(x) {
    if (x === Math.trunc(x)) {
      if (x < 0) throw this.E('E3');
      let f = 1;
      for (let n = 1; n <= x; n++) { f *= n; if (!Number.isFinite(f)) throw this.E('E1'); }
      return f;
    }
    return this.chk(Math.exp(this.lnFact(x)));
  }
}
