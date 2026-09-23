// Open file handles for BASIC (OPENIN/OPENOUT/OPENUP, BGET#, BPUT#, PTR#, EXT#, EOF#, CLOSE#,
// PRINT#, INPUT#, GET$#). Files are held in memory while open; the host filing system is only
// accessed (asynchronously) on open and close.
import { BasicError, err } from './errors.js';
import { encodeFloat5, decodeFloat5 } from './memory.js';
import { TI, TF, TS } from './expr.js';

export class FileManager {
  constructor(m) {
    this.m = m;
    this.handles = new Map();
    this.next = 255; // RISC OS style file handles count down from 255
  }
  chErr() { return new BasicError(0xDE, 'Channel'); }
  get(h) {
    const f = this.handles.get(h);
    if (!f) throw this.chErr();
    return f;
  }
  alloc() {
    for (let i = 0; i < 254; i++) {
      const h = this.next;
      this.next = this.next <= 2 ? 255 : this.next - 1;
      if (!this.handles.has(h)) return h;
    }
    throw new BasicError(0xC0, 'Too many open files');
  }
  /**
   * Open a file. mode: 0x40 OPENIN, 0x80 OPENOUT, 0xC0 OPENUP. Returns Promise<handle> (0 if not found).
   */
  async open(name, mode) {
    const fs = this.m.fs;
    const path = this.m.gstrans(name);
    if (mode === 0x80) {
      const h = this.alloc();
      this.handles.set(h, { name: path, data: new Uint8Array(256), ext: 0, ptr: 0, dirty: true, write: true, type: 0xFFF });
      if (fs && fs.writeFile) await fs.writeFile(path, new Uint8Array(0), 0xFFF);
      return h;
    }
    if (!fs || !fs.readFile) return 0;
    const f = await fs.readFile(path);
    if (!f) return 0;
    const data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data || f);
    const h = this.alloc();
    const buf = new Uint8Array(Math.max(256, data.length));
    buf.set(data);
    this.handles.set(h, { name: path, data: buf, ext: data.length, ptr: 0, dirty: false, write: mode === 0xC0, type: f.type ?? 0xFFF });
    return h;
  }
  /** synchronous open for output (TRACE TO etc): the file is written on close */
  openSync(name, mode) {
    const h = this.alloc();
    this.handles.set(h, { name: this.m.gstrans(name), data: new Uint8Array(256), ext: 0, ptr: 0, dirty: true, write: true, type: 0xFFF });
    return h;
  }
  async close(h) {
    if (h === 0) {
      const all = [...this.handles.keys()];
      for (const k of all) await this.close(k);
      return;
    }
    const f = this.get(h);
    this.handles.delete(h);
    if (f.dirty && f.write && this.m.fs && this.m.fs.writeFile) {
      await this.m.fs.writeFile(f.name, f.data.slice(0, f.ext), f.type ?? 0xFFF);
    }
  }
  ensure(f, n) {
    if (n <= f.data.length) return;
    let sz = f.data.length * 2;
    while (sz < n) sz *= 2;
    const nb = new Uint8Array(sz);
    nb.set(f.data.subarray(0, f.ext));
    f.data = nb;
  }
  bget(h) {
    const f = this.get(h);
    if (f.ptr >= f.ext) { f.eofErr = (f.eofErr || 0) + 1; if (f.eofErr > 1) throw new BasicError(0xDF, 'End of file'); return -1 & 0xFF; }
    return f.data[f.ptr++];
  }
  bgetRaw(h) { // returns -1 at EOF (no error)
    const f = this.get(h);
    if (f.ptr >= f.ext) return -1;
    return f.data[f.ptr++];
  }
  bput(h, b) {
    const f = this.get(h);
    if (!f.write) throw new BasicError(0xC1, 'Not open for update');
    this.ensure(f, f.ptr + 1);
    f.data[f.ptr++] = b & 255;
    if (f.ptr > f.ext) f.ext = f.ptr;
    f.dirty = true;
  }
  eof(h) { const f = this.get(h); return f.ptr >= f.ext; }
  ptr(h) { return this.get(h).ptr; }
  ext(h) { return this.get(h).ext; }
  setPtr(h, p) {
    const f = this.get(h);
    if (p < 0) throw new BasicError(0xB7, 'Outside file');
    if (p > f.ext) {
      if (!f.write) throw new BasicError(0xB7, 'Outside file');
      this.ensure(f, p); f.data.fill(0, f.ext, p); f.ext = p; f.dirty = true;
    }
    f.ptr = p; f.eofErr = 0;
  }
  setExt(h, n) {
    const f = this.get(h);
    if (!f.write) throw new BasicError(0xC1, 'Not open for update');
    this.ensure(f, n);
    if (n > f.ext) f.data.fill(0, f.ext, n);
    f.ext = n; if (f.ptr > n) f.ptr = n; f.dirty = true;
  }
  /** GET$#: read to CR/LF/EOF, max 255 chars */
  getLine(h) {
    let s = '';
    for (;;) {
      if (s.length >= 255) return s;
      const c = this.bgetRaw(h);
      if (c < 0 || c === 10 || c === 13) return s;
      s += String.fromCharCode(c);
    }
  }
  /** PRINT# value */
  printHash(h, v, t) {
    if (t === TS) {
      this.bput(h, 0);
      this.bput(h, v.length);
      for (let i = v.length - 1; i >= 0; i--) this.bput(h, v.charCodeAt(i));
    } else if (t === TI) {
      this.bput(h, 0x40);
      this.bput(h, (v >>> 24) & 255); this.bput(h, (v >>> 16) & 255); this.bput(h, (v >>> 8) & 255); this.bput(h, v & 255);
    } else {
      this.bput(h, 0x80);
      const [m, e] = encodeFloat5(v);
      this.bput(h, m & 255); this.bput(h, (m >>> 8) & 255); this.bput(h, (m >>> 16) & 255); this.bput(h, (m >>> 24) & 255); this.bput(h, e);
    }
  }
  /** INPUT# value -> [v, t] */
  inputHash(h) {
    const b = () => { const c = this.bgetRaw(h); if (c < 0) throw new BasicError(0xDF, 'End of file'); return c; };
    const tb = b();
    if (tb === 0) {
      const n = b();
      const chars = new Array(n);
      for (let i = n - 1; i >= 0; i--) chars[i] = String.fromCharCode(b());
      return [chars.join(''), TS];
    }
    if (tb === 0x40) {
      const v = (b() << 24) | (b() << 16) | (b() << 8) | b();
      return [v | 0, TI];
    }
    if (tb === 0x88) {
      const bytes = new Uint8Array(8);
      for (let i = 0; i < 8; i++) bytes[i] = b();
      return [new DataView(bytes.buffer).getFloat64(0, true), TF];
    }
    if (tb & 0x80) {
      const m = (b() | (b() << 8) | (b() << 16) | (b() << 24)) >>> 0;
      const e = b();
      return [decodeFloat5(m, e), TF];
    }
    throw err('ERTYPEINT');
  }
}
