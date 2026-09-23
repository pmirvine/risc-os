// Interpreter ops that talk to the host: keyboard input, INPUT, SYS, CALL/USR, files, libraries.
import { err, BasicError } from './errors.js';
import { TI, TF, TS } from './expr.js';
import { toInt, valOf } from './numfmt.js';
import { parseProgram, textToLines } from './tokens.js';
import { C_FLAG, V_FLAG } from './swis.js';

export function installOps(Interp) {
  const P = Interp.prototype;

  P.opGet = function (slot, str) {
    const tmp = this.tmp, tmpT = this.tmpT;
    const store = (k) => { tmp[slot] = str ? String.fromCharCode(k & 255) : k; tmpT[slot] = str ? TS : TI; };
    const k = this.m.keyNow();
    if (k >= 0) { store(k); return; }
    return this.m.waitKey(-1).then(store);
  };

  P.opInkey = function (slot, n, str) {
    const tmp = this.tmp, tmpT = this.tmpT;
    tmpT[slot] = str ? TS : TI;
    if (n < 0) {
      let v;
      if (n === -256) v = 0xA7;
      else if (n >= -255) v = this.m.keyScan(n) ? -1 : 0;
      else v = 0;
      if (str) tmp[slot] = (n >= -255 && v) ? '' : String.fromCharCode(n === -256 ? 0xA7 : 0);
      else tmp[slot] = v;
      return;
    }
    const k = this.m.keyNow();
    if (k >= 0) { tmp[slot] = str ? String.fromCharCode(k) : k; return; }
    if (n === 0) { tmp[slot] = str ? '' : -1; return; }
    return this.m.waitKey(n * 10).then((k2) => {
      if (k2 < 0) tmp[slot] = str ? '' : -1;
      else tmp[slot] = str ? String.fromCharCode(k2) : k2;
    });
  };

  /** One variable of INPUT (see INPUT in Stmt) */
  P.inputItem = function (lineMode, t, set) {
    const I = this;
    const store = (s) => {
      if (t === TS) I._pv = s;
      else { const r = valOf(s); I._pv = t === TI ? (r.isInt ? r.value : toInt(r.value)) : r.value; }
      set();
    };
    const fromBuf = () => {
      const b = I.inbuf; let i = I.inpos;
      while (b.charCodeAt(i) === 32) i++;
      let s = '';
      if (b[i] === '"') {
        i++;
        for (;;) {
          if (i >= b.length) break;
          const c = b[i++];
          if (c === '"') { if (b[i] === '"') { s += '"'; i++; continue; } break; }
          s += c;
        }
      } else {
        while (i < b.length && b[i] !== ',') s += b[i++];
      }
      // INTERM: find next comma
      while (i < b.length && b[i] !== ',') i++;
      if (i < b.length) { I.inpos = i + 1; } else { I.inbuf = null; }
      store(s);
    };
    if (!lineMode && I.inbuf !== null) { fromBuf(); return; }
    if (I.inq) this.m.writeC(63);
    I.inq = false;
    return this.m.readLine(238, 32, 255).then((line) => {
      I.count = 0;
      if (lineMode) { store(line); return; }
      I.inbuf = line; I.inpos = 0;
      fromBuf();
    });
  };

  // Files ----------------------------------------------------------------------
  P.opOpen = function (slot, mode, name) {
    const tmp = this.tmp, tmpT = this.tmpT;
    tmpT[slot] = TI;
    return this.files.open(name, mode).then((h) => { tmp[slot] = h; });
  };
  P.opClose = function (h) { return this.files.close(h); };

  // SYS -------------------------------------------------------------------------
  P.opSys = function (sw, regs, strs, outs, flagsLV) {
    const m = this.m;
    let num = sw;
    if (typeof sw === 'string') {
      num = m.swis.lookup(sw);
      if (num === undefined) throw new BasicError(0x1E6, 'SWI name not known');
    }
    m.resetSysScratch();
    for (const [i, s] of strs) regs[i] = m.sysString(s);
    const I = this;
    const finish = (res) => {
      const r = res.r;
      for (let i = 0; i < outs.length; i++) {
        const o = outs[i];
        if (!o) continue;
        if (o.t === TS) {
          let a = r[i] >>> 0; let s = '';
          for (let k = 0; k < 255; k++) {
            const c = m.mem.rd8(a + k);
            if (c === 0 || c === 10 || c === 13) break;
            s += String.fromCharCode(c);
          }
          I._pv = s;
        } else I._pv = o.t === TI ? r[i] | 0 : r[i] | 0;
        o.set();
      }
      if (flagsLV) { I._pv = res.flags & 15; flagsLV.set(); }
    };
    const res = m.callSwi(num, regs);
    if (res && typeof res.then === 'function') return res.then(finish);
    finish(res);
  };

  // CALL / USR ------------------------------------------------------------------
  P.opUsr = function (slot, addr) {
    const tmp = this.tmp, tmpT = this.tmpT;
    tmpT[slot] = TI;
    if (((addr >>> 8) & 0xFFFFFF) === 0xFF) { tmp[slot] = this.m.emuMos(addr & 255); return; }
    const r = this.m.callArm(addr, [], true);
    if (r && typeof r.then === 'function') return r.then((v) => { tmp[slot] = v | 0; });
    tmp[slot] = r | 0;
  };
  P.opCall = function (addr, params) {
    if (((addr >>> 8) & 0xFFFFFF) === 0xFF) { this.m.emuMos(addr & 255); return; }
    return this.m.callArm(addr, params, false);
  };

  // LIBRARY / OVERLAY ----------------------------------------------------------------
  P.opLibrary = function (name) {
    return this.m.loadLibrary(name, false);
  };
  P.opOverlay = function (arr) {
    this.arrCheck(arr);
    const names = arr.data.filter((s) => s.length);
    const I = this;
    return Promise.all(names.map((n) => I.m.loadProgramFile(n).catch(() => null))).then((progs) => {
      I.overlay = progs.map((p, i) => p && { name: names[i], lines: p.map((l, j) => ({ ...I.mkLine(l.num, l.body, j), lib: true, libName: names[i] })) }).filter(Boolean);
      for (const o of I.overlay) for (const l of o.lines) l.owner = o.lines;
      I.defs.clear();
    });
  };
  P.findOverlayDef = function (name, search) {
    for (const o of this.overlay || []) { const d = search(o.lines); if (d) return d; }
    return null;
  };
}

/** Convert loaded file bytes into program lines (tokenised image or text) */
export function bytesToLines(bytes) {
  const p = parseProgram(bytes);
  if (p) return p.lines;
  return textToLines(bytes).lines;
}
