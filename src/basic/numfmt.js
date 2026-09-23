// Number <-> string conversion with BBC BASIC V semantics.
// Formatting follows FCONFP (fp2, FP=0 variant used by the 3.71 ROM BASIC 1.16):
//   @% = &SSFFDDWW : WW field width, DD digits, FF format (0 G, 1 E, 2 F), bit 23 ',' as point,
//   bit 24 (+) make STR$ use @%.
// Reading follows FREAD (FP=0): integer if no '.'/E and < 2^31, max 2 exponent digits.
import { err } from './errors.js';

const MAXDIGS = 10;

/**
 * Format a number (JS number; isInt tells whether it's a BASIC integer) using format word w.
 * Integers are converted to reals first exactly as PRINT/STR$ do.
 */
export function formatNumber(v, w) {
  let fmt = (w >>> 16) & 0x7F;
  const dp = (w & 0x800000) ? ',' : '.';
  if (fmt >= 3) fmt = 0;
  let digs = (w >>> 8) & 0xFF;
  if (digs > MAXDIGS) digs = MAXDIGS;
  if (digs === 0 && fmt !== 2) digs = MAXDIGS;
  if (!Number.isFinite(v)) return v > 0 ? '1E999' : (v < 0 ? '-1E999' : '0');
  if (v === 0) return formatZero(fmt, digs, dp);
  let sign = '';
  if (v < 0) { sign = '-'; v = -v; }
  // normalise: v = m * 10^exp with 1 <= m < 10
  let exp = normExp(v);
  let D = digs;
  let digits;
  let curFmt = fmt;
  // (loop handles rounding overflow like FPRTEE which re-enters with the value 1.0 * 10^(exp+1))
  let value = v;
  for (let pass = 0; pass < 3; pass++) {
    D = digs;
    if (curFmt === 2) {
      D = digs + exp + 1;
      if (D < 0) return sign === '-' ? formatZero(2, digs, dp) : formatZero(2, digs, dp);
      if (D > MAXDIGS) { D = MAXDIGS; curFmt = 0; }
    }
    if (D === 0) {
      // Only the round-up constant (5 at this position) is added: does it overflow to the next decade?
      const m = value / Math.pow(10, exp);
      if (m + 5 >= 10 - 1e-12) { exp += 1; value = Math.pow(10, exp); continue; }
      return formatZero(2, digs, dp);
    }
    const s = value.toExponential(D - 1); // d.dddde+x
    const ei = s.indexOf('e');
    const e2 = parseInt(s.slice(ei + 1), 10);
    if (e2 !== exp) {
      // rounding overflowed into the next decade (e.g. 9.99999 -> 10.0000)
      exp = e2; value = Math.pow(10, exp);
      if (curFmt === 2) continue; // recompute digit count for F format
    }
    digits = s.slice(0, ei).replace('.', '');
    break;
  }
  if (digits === undefined) digits = '1'.padEnd(Math.max(D, 1), '0');
  // Layout (FPRTH)
  let out = sign;
  let wn = 1; let showExp = true; let leadZeros = -1;
  if (curFmt !== 1) {
    if (exp >= 0) {
      if (exp < D) { wn = exp + 1; showExp = false; }
    } else if (curFmt === 2 || exp === -1 || exp === -2) {
      leadZeros = -exp - 1; showExp = false;
    }
  }
  if (leadZeros >= 0) {
    out += '0' + dp + '0'.repeat(leadZeros) + digits;
  } else {
    for (let i = 0; i < digits.length; i++) {
      out += digits[i];
      if (i + 1 === wn) out += dp;
    }
  }
  if (curFmt === 0) {
    // strip trailing zeros then a trailing point
    let end = out.length;
    while (end > 0 && out[end - 1] === '0') end--;
    if (out[end - 1] === dp) end--;
    // only strip if there is a point in the number (zeros before the point are significant)
    if (out.indexOf(dp) >= 0) out = out.slice(0, end);
  }
  if (showExp) {
    const e = exp;
    let es = 'E' + (e < 0 ? '-' : '') + String(Math.abs(e));
    if (curFmt !== 0) {
      if (e >= 0) es += ' ';
      if (Math.abs(e) < 10) es += ' ';
    }
    out += es;
  }
  return out;
}

function formatZero(fmt, digs, dp) {
  if (fmt === 0) return '0';
  if (fmt === 1) {
    // digits of 0 with the point after the first, then "E0  "
    let s = '0';
    if (digs >= 1) s += dp;
    s += '0'.repeat(Math.max(digs - 1, 0));
    return s + 'E0  ';
  }
  // F format: digs+1 digits, point after the first
  let s = '0' + dp + '0'.repeat(digs);
  return s;
}

function normExp(v) {
  const s = v.toExponential(15);
  return parseInt(s.slice(s.indexOf('e') + 1), 10);
}

/** STR$~ / PRINT ~ : upper case hex of the integer value, no leading zeros. */
export function formatHex(i) {
  return ((i | 0) >>> 0).toString(16).toUpperCase();
}

/** Convert a BASIC real to integer (INTEGY / SFIX): truncate, "Number too big" if out of range. */
export function toInt(v) {
  if (Number.isInteger(v) && v >= -2147483648 && v <= 2147483647) return v | 0;
  const t = Math.trunc(v);
  if (!(t >= -2147483648 && t <= 2147483647)) throw err('FOVR');
  return t | 0;
}

/**
 * FREAD: read a number from char codes / string s starting at index i.
 * Returns null if no number there, else {value, isInt, end}.
 */
export function readNumber(s, i) {
  const code = typeof s === 'string' ? (k) => s.charCodeAt(k) : (k) => s[k];
  const len = s.length;
  const start = i;
  let c = i < len ? code(i) : 13;
  if (!((c >= 48 && c <= 57) || c === 46)) return null;
  let intPart = '';
  let seenDot = false; let fracPart = '';
  for (;;) {
    c = i < len ? code(i) : 13;
    if (c >= 48 && c <= 57) { if (seenDot) fracPart += String.fromCharCode(c); else intPart += String.fromCharCode(c); i++; continue; }
    if (c === 46) { if (seenDot) break; seenDot = true; i++; continue; }
    break;
  }
  let expo = 0; let seenE = false;
  if ((i < len ? code(i) : 13) === 69) { // 'E'
    seenE = true; i++;
    let neg = false;
    let d = i < len ? code(i) : 13;
    if (d === 45) { neg = true; i++; } else if (d === 43) i++;
    d = i < len ? code(i) : 13;
    if (d >= 48 && d <= 57) {
      expo = d - 48; i++;
      d = i < len ? code(i) : 13;
      if (d >= 48 && d <= 57) { expo = expo * 10 + d - 48; i++; }
    }
    if (neg) expo = -expo;
  }
  if (!seenDot && !seenE) {
    const n = intPart === '' ? 0 : parseInt(intPart, 10);
    if (n < 2147483648) return { value: n, isInt: true, end: i };
    return { value: n, isInt: false, end: i };
  }
  const str = (intPart || '0') + '.' + (fracPart || '0') + 'e' + expo;
  let value = parseFloat(str);
  if (!Number.isFinite(value)) throw err('FOVR');
  void start;
  return { value, isInt: false, end: i };
}

/** VAL semantics: skip spaces, optional sign, number; 0 if none. Returns {value,isInt}. */
export function valOf(str) {
  let i = 0;
  while (i < str.length && str.charCodeAt(i) === 32) i++;
  let neg = false;
  if (str[i] === '-') { neg = true; i++; } else if (str[i] === '+') i++;
  const r = readNumber(str, i);
  if (!r) return { value: 0, isInt: true };
  if (neg) {
    if (r.isInt) return { value: (-r.value) | 0, isInt: true };
    return { value: -r.value, isInt: false };
  }
  return { value: r.value, isInt: r.isInt };
}

/** Parse the string forms of @% ("G10.9", "+F10.3", "E", ",", ...) as ASSIGNATSTRING does. */
export function parseAtPercentString(s, cur) {
  let v = cur;
  let i = 0;
  let plus = false;
  if (s[i] === '+') { plus = true; i++; }
  const ch = (s[i] || '').toUpperCase();
  if (ch === 'G' || ch === 'E' || ch === 'F') {
    v = (v & ~0xFF0000) | ((ch === 'G' ? 0 : ch === 'E' ? 1 : 2) << 16);
    i++;
  }
  // field width
  let n = '';
  while (i < s.length && s[i] >= '0' && s[i] <= '9') n += s[i++];
  if (n !== '') v = (v & ~0xFF) | (parseInt(n, 10) & 0xFF);
  if (s[i] === '.' || s[i] === ',') {
    if (s[i] === ',') v |= 0x800000; else v &= ~0x800000;
    i++;
    let m = '';
    while (i < s.length && s[i] >= '0' && s[i] <= '9') m += s[i++];
    if (m !== '') v = (v & ~0xFF00) | ((parseInt(m, 10) & 0xFF) << 8);
  }
  if (plus) v |= 0x1000000; else v &= ~0x1000000;
  return v | 0;
}
