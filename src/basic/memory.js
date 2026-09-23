// Flat emulated memory (little-endian, byte addressed) shared by BASIC indirection, DIM blocks,
// the program image, the ARM emulator and SWI parameter blocks.
import { BasicError } from './errors.js';

export class Memory {
  /** @param {number} size bytes (addresses 0..size-1) */
  constructor(size = 0x400000) {
    this.size = size;
    this.buf = new ArrayBuffer(size);
    this.u8 = new Uint8Array(this.buf);
    this.dv = new DataView(this.buf);
    this.i32 = new Int32Array(this.buf); // aligned fast path
  }

  abort(addr) {
    const a = (addr >>> 0).toString(16).toUpperCase().padStart(8, '0');
    return new BasicError(0x80000002 | 0, `Abort on data transfer at &${a}`);
  }

  check(addr, n) {
    if (addr < 0 || addr + n > this.size) throw this.abort(addr);
  }

  rd8(a) { a >>>= 0; if (a >= this.size) throw this.abort(a); return this.u8[a]; }
  wr8(a, v) { a >>>= 0; if (a >= this.size) throw this.abort(a); this.u8[a] = v; }
  rd32(a) {
    a >>>= 0;
    if (a + 4 > this.size) throw this.abort(a);
    if ((a & 3) === 0) return this.i32[a >> 2];
    return this.dv.getInt32(a, true);
  }
  wr32(a, v) {
    a >>>= 0;
    if (a + 4 > this.size) throw this.abort(a);
    if ((a & 3) === 0) this.i32[a >> 2] = v; else this.dv.setInt32(a, v | 0, true);
  }
  rd16(a) { a >>>= 0; this.check(a, 2); return this.dv.getUint16(a, true); }
  wr16(a, v) { a >>>= 0; this.check(a, 2); this.dv.setUint16(a, v & 0xFFFF, true); }

  /** ARM-style word load: rotated for non-aligned addresses (used by the ARM emulator). */
  rd32rot(a) {
    a >>>= 0;
    const al = a & ~3;
    if (al + 4 > this.size) throw this.abort(a);
    const w = this.i32[al >> 2];
    const r = (a & 3) * 8;
    return r ? ((w >>> r) | (w << (32 - r))) : w;
  }

  /** $addr read: string terminated by CR (max 256 chars read, like VARRPA) */
  rdStrCR(a) {
    a >>>= 0;
    let s = '';
    for (let i = 0; i < 256; i++) {
      if (a + i >= this.size) throw this.abort(a + i);
      const c = this.u8[a + i];
      if (c === 13) return s;
      s += String.fromCharCode(c);
    }
    return s.slice(0, 256) === s ? s : s;
  }
  /** Read control-terminated string (any char < 32 terminates), used for SWI string args */
  rdStrCtrl(a, max = 65536) {
    a >>>= 0;
    let s = '';
    for (let i = 0; i < max; i++) {
      if (a + i >= this.size) throw this.abort(a + i);
      const c = this.u8[a + i];
      if (c < 32) return s;
      s += String.fromCharCode(c);
    }
    return s;
  }
  /** Zero terminated string */
  rdStr0(a, max = 65536) {
    a >>>= 0;
    let s = '';
    for (let i = 0; i < max; i++) {
      if (a + i >= this.size) throw this.abort(a + i);
      const c = this.u8[a + i];
      if (c === 0) return s;
      s += String.fromCharCode(c);
    }
    return s;
  }
  /** $addr=... : writes the string and a terminating CR */
  wrStrCR(a, s) {
    a >>>= 0;
    this.check(a, s.length + 1);
    for (let i = 0; i < s.length; i++) this.u8[a + i] = s.charCodeAt(i);
    this.u8[a + s.length] = 13;
  }
  wrStr0(a, s) {
    a >>>= 0;
    this.check(a, s.length + 1);
    for (let i = 0; i < s.length; i++) this.u8[a + i] = s.charCodeAt(i);
    this.u8[a + s.length] = 0;
  }
  wrBytes(a, bytes) { a >>>= 0; this.check(a, bytes.length); this.u8.set(bytes, a); }
  rdBytes(a, n) { a >>>= 0; this.check(a, n); return this.u8.slice(a, a + n); }

  /** |addr : BASIC V 5 byte real (4 byte mantissa, 1 byte exponent, excess-128) */
  rdFloat5(a) {
    a >>>= 0; this.check(a, 5);
    const m = this.dv.getUint32(a, true);
    const e = this.u8[a + 4];
    return decodeFloat5(m, e);
  }
  wrFloat5(a, v) {
    a >>>= 0; this.check(a, 5);
    const [m, e] = encodeFloat5(v);
    this.dv.setUint32(a, m >>> 0, true);
    this.u8[a + 4] = e;
  }
  rdDouble(a) { a >>>= 0; this.check(a, 8); return this.dv.getFloat64(a, true); }
}

/** Decode BASIC V 5-byte float: mantissa word (bit31 = sign, implicit 1), exponent byte. */
export function decodeFloat5(m, e) {
  if (e === 0) return 0;
  const sign = (m & 0x80000000) ? -1 : 1;
  const mant = ((m | 0x80000000) >>> 0) / 4294967296; // 0.5..1
  return sign * mant * Math.pow(2, e - 128);
}
export function encodeFloat5(v) {
  if (v === 0 || !Number.isFinite(v)) return [0, 0];
  const sign = v < 0 ? 0x80000000 : 0;
  let a = Math.abs(v);
  let e = Math.floor(Math.log2(a)) + 1; // a = f * 2^e, f in [0.5,1)
  let f = a / Math.pow(2, e);
  if (f >= 1) { f /= 2; e++; }
  if (f < 0.5) { f *= 2; e--; }
  let mant = Math.round(f * 4294967296);
  if (mant >= 4294967296) { mant = 2147483648; e++; }
  const ex = e + 128;
  if (ex <= 0) return [0, 0];
  if (ex > 255) return [0xFFFFFFFF, 255];
  return [((mant & 0x7FFFFFFF) | sign) >>> 0, ex];
}
