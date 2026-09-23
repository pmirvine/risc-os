// BasicMachine: the host-facing BBC BASIC V machine (interpreter + emulated OS services).
//
//   const m = new BasicMachine({ vdu, fs, sound, oscli, swiHandlers, onExit, ... });
//   m.start()              // banner + ">" prompt loop (interactive session)
//   await m.load(bytesOrText); await m.run();
//   m.keyPress(code); m.keyDown(inkeyNum); m.keyUp(inkeyNum); m.escape();
//   await m.immediate('PRINT 1+1');
//   m.stop();
// See docs/BASIC.md for the full host interface.
import { Memory } from './memory.js';
import { Interp } from './interp.js';
import { installOps, bytesToLines } from './ops.js';
import { FileManager } from './files.js';
import { SwiTable, installCoreSwis, XBIT, C_FLAG, V_FLAG } from './swis.js';
import { BasicError, err } from './errors.js';
import {
  T, TC, tokenise, tokeniseProgramLine, parseProgram, buildProgram, textToLines, renumber as renumberLines,
  listProgram, programToText, listLine, computeIndent, insertLine, decodeLineNumber, encodeLineNumber,
} from './tokens.js';
import { formatNumber } from './numfmt.js';
import { TI, TF, TS } from './expr.js';
import { Assembler } from './assembler.js';
import { HELP } from './help.js';
import { LEX_TABLE, tokenName } from './tokens.js';
import { ARM } from './arm.js';

installOps(Interp);

const VERSION = '1.16';
export const BANNER = `ARM BBC BASIC V version ${VERSION} (C) Acorn 1989`;

const SCRATCH = 0x3F0000;         // SYS string args, error blocks, env
const SCRATCH_END = 0x400000;
const RMA_BASE = 0x300000;         // system heap (OS_Module claims, host allocations)

/** A tiny text-only VDU used when no VDU is supplied (tracks cursor for POS/VPOS). */
class NullVDU {
  constructor(onText) { this.x = 0; this.y = 0; this.q = 0; this.onText = onText; this.mode = 12; }
  writeC(c) {
    if (this.q > 0) { this.q--; return; }
    const n = [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 5, 0, 0, 1, 9, 8, 5, 0, 0, 4, 4, 0, 2][c];
    if (c < 32 && n) { this.q = n; return; }
    if (c === 13) this.x = 0; else if (c === 10) this.y++; else if (c === 8 || c === 127) { if (this.x) this.x--; } else if (c === 12 || c === 30) { this.x = 0; this.y = 0; } else if (c >= 32) this.x++;
  }
  get pos() { return this.x; }
  get vpos() { return this.y; }
  modeVar(n) { return [0, 79, 31, 15, 1, 2, 160, 81920, 5, 2, 2, 639, 255][n]; }
  vduVar(n) { return 0; }
  readPoint() { return { colour: 0, tint: 0, offScreen: false }; }
  readPalette() { return { first: 0, second: 0 }; }
  readCharAtCursor() { return { char: 32, mode: this.mode }; }
}

export class BasicMachine {
  /**
   * @param {object} o
   *  o.vdu          VDU instance (src/basic/vdu.js) or null (headless; text via o.onOutput)
   *  o.fs           filing system {readFile(path)->Promise<{data,type}|null>, writeFile(path,data,type), ...}
   *  o.sound        Sound instance (src/basic/sound.js) or null
   *  o.oscli        async (cmd, machine) => boolean  host * command handler (return true if handled)
   *  o.swiHandlers  {number|name: fn(r, machine, ctx)} extra SWIs
   *  o.onExit       (code) => void  called on QUIT / OS_Exit
   *  o.onOutput     (byte) => void  called for every byte written to the VDU stream
   *  o.onEdit       async (text) => text|null  EDIT/TWIN hand-off
   *  o.memSize      emulated memory size (default 4MB)
   *  o.page, o.himem   (defaults &8F00, &A8000 = 640K slot)
   *  o.seed         random seed (tests)
   *  o.sysvars      Map of system variables (shared with the host)
   *  o.sliceMs      time slice before yielding (default 12ms)
   */
  constructor(o = {}) {
    this.o = o;
    this.mem = new Memory(o.memSize || 0x400000);
    this.vdu = o.vdu || null;
    this.textOnly = !this.vdu;
    if (!this.vdu) this.vdu = new NullVDU();
    this.fs = o.fs || null;
    this.snd = o.sound || null;
    this.swis = new SwiTable();
    installCoreSwis(this.swis);
    if (o.swiHandlers) for (const [k, fn] of Object.entries(o.swiHandlers)) this.registerSwi(k, fn);
    this.sysvars = o.sysvars || new Map();
    if (!this.sysvars.has('Sys$Year')) this.initSysVars();
    this.interp = new Interp(this, { page: o.page, himem: o.himem, seed: o.seed ?? ((Date.now() * 7919) | 0) });
    this.interp.files = new FileManager(this);
    this.files = this.interp.files;
    this.asm = new Assembler(this);
    this.interp.asm = this.asm;
    this.arm = null;
    this.sliceMs = o.sliceMs ?? 12;
    // keyboard
    this.keybuf = [];
    this.keyWaiters = [];
    this.keysDown = new Set();
    this.fx4 = 0;           // cursor key mode
    this.escapeEnabled = true;
    this.escapeChar = 27;
    // mouse (OS units)
    this.mx = 0; this.my = 0; this.mb = 0;
    // time
    this.t0 = nowMs();
    this.timeOffset = 0;    // centiseconds added to elapsed time for TIME
    this.clockOffset = 0;   // ms offset applied to the real time clock
    // misc
    this.soundOn = true;
    this.beatsVal = 0; this.tempoVal = 0x1000;
    this.listo = 0;
    this.oldProgram = null;
    this.autoMode = null;
    this.rmaNext = RMA_BASE;
    this.scratchPtr = SCRATCH + 0x1000;
    this.cmdLine = 'BASIC';
    this.exited = false;
    this.busy = false;
    this.spool = null;
  }

  initSysVars() {
    const set = (k, v) => this.sysvars.set(k, v);
    set('Sys$Year', '1996'); set('Sys$DateFormat', '%24:%mi:%se %dy-%m3-%ce%yr');
    set('Sys$Time', ''); set('Cli$Prompt', '*'); set('Run$Path', ',%.'); set('File$Path', '');
    set('Alias$Mode', 'Echo |<22>|<%0>');
  }

  // =========================================================================
  // Public API
  // =========================================================================
  registerSwi(key, fn) {
    let num = typeof key === 'number' ? key : Number.isNaN(Number(key)) ? this.swis.lookup(key) : Number(key);
    if (num === undefined) throw new Error('Unknown SWI name ' + key);
    const name = typeof key === 'string' && Number.isNaN(Number(key)) ? key : undefined;
    this.swis.register(num, name, fn);
  }

  /** Load a program: tokenised bytes, or text (string / bytes). */
  async load(src) {
    const I = this.interp;
    if (typeof src === 'string') { const r = textToLines(src); I.setProgramLines(r.lines); }
    else {
      const b = src instanceof Uint8Array ? src : new Uint8Array(src);
      I.setProgramLines(bytesToLines(b));
    }
    I.clearVars();
  }

  /** RUN the current program; resolves when it stops. */
  async run() {
    this.interp.runProgram();
    await this.runLoop();
  }

  /** Stop the running program (like pressing Escape) */
  stop() { this.escape(); }

  /** Execute one line as if typed at the > prompt; resolves when done. */
  async immediate(text) {
    await this.enterLine(text);
  }

  /** Interactive session: banner then prompt loop. Resolves on QUIT. */
  async start(opts = {}) {
    if (opts.banner !== false) this.printBanner();
    if (opts.chain) { await this.chainFile(opts.chain); }
    while (!this.exited) {
      if (this.autoMode) { await this.autoStep(); continue; }
      this.writeC(62); // '>'
      let line;
      try {
        line = await this.readLine(238, 32, 255);
      } catch (e) {
        if (e instanceof BasicError && e.number === 17) { this.reportError('Escape', 0); continue; }
        throw e;
      }
      await this.enterLine(line);
    }
  }

  printBanner() {
    this.writeStr(BANNER); this.newLine();
    const free = this.interp.himem - (this.interp.page + 4);
    this.newLine();
    this.writeStr('Starting with ' + free + ' bytes free'); this.newLine();
    this.newLine();
  }

  // Keyboard ------------------------------------------------------------------
  /** A character key was typed (RISC OS key code 0-255) */
  keyPress(code) {
    if (code === this.escapeChar && this.escapeEnabled) { this.escape(); return; }
    if (this.fx4 === 0 && code >= 0x87 && code <= 0x8B) {
      // copy-key editing (cursor keys move the edit cursor, Copy copies a character)
      if (!this.vdu.cursorEdit) return;
      const c = this.vdu.cursorEdit(code);
      if (code !== 0x87 || c < 0) return;
      code = c;
    }
    if (this.keyWaiters.length) {
      const w = this.keyWaiters.shift();
      w.resolve(code);
      return;
    }
    if (this.keybuf.length < 255) this.keybuf.push(code);
  }
  /** Physical key state for INKEY(-n): n = RISC OS internal key number (INKEY value = -(n+1)) */
  keyDown(n) { this.keysDown.add(n); }
  keyUp(n) { this.keysDown.delete(n); }
  /** Escape condition */
  escape() {
    this.interp.escape = true;
    this.keybuf.length = 0;
    const ws = this.keyWaiters.splice(0);
    for (const w of ws) w.reject(err('ESCAPE'));
  }
  ackEscape() { this.interp.escape = false; }
  setMouse(x, y, b) { this.mx = x | 0; this.my = y | 0; this.mb = b | 0; }

  keyNow() { return this.keybuf.length ? this.keybuf.shift() : -1; }
  /** Wait for a key; timeoutMs < 0 = forever. Resolves to key code, or -1 on timeout. */
  waitKey(timeoutMs = -1) {
    if (this.interp.escape) { this.interp.escape = false; return Promise.reject(err('ESCAPE')); }
    return new Promise((resolve, reject) => {
      const w = { resolve, reject };
      if (timeoutMs >= 0) {
        w.timer = setTimeout(() => { const i = this.keyWaiters.indexOf(w); if (i >= 0) this.keyWaiters.splice(i, 1); resolve(-1); }, timeoutMs);
        const r0 = resolve;
        w.resolve = (k) => { clearTimeout(w.timer); r0(k); };
        const j0 = reject;
        w.reject = (e) => { clearTimeout(w.timer); j0(e); };
      }
      this.keyWaiters.push(w);
    });
  }
  keyScan(n) {
    const k = -n - 1; // internal key number
    if (k === 0) return this.keysDown.has(0) || this.keysDown.has(3) || this.keysDown.has(6);
    if (k === 1) return this.keysDown.has(1) || this.keysDown.has(4) || this.keysDown.has(7);
    if (k === 2) return this.keysDown.has(2) || this.keysDown.has(5) || this.keysDown.has(8);
    if (k === 9) return !!(this.mb & 4);
    if (k === 10) return !!(this.mb & 2);
    if (k === 11) return !!(this.mb & 1);
    return this.keysDown.has(k);
  }

  /** OS_ReadLine with echo. lo..hi = accepted character range. Resolves to the line (no CR). */
  async readLine(max = 255, lo = 32, hi = 255) {
    let s = '';
    for (;;) {
      let k = this.keyNow();
      if (k < 0) k = await this.waitKey(-1);
      if (k === 13 || k === 10) { this.newLine(); return s; }
      if (k === 8 || k === 127) { if (s.length) { s = s.slice(0, -1); this.writeC(127); } continue; }
      if (k === 21) { while (s.length) { s = s.slice(0, -1); this.writeC(127); } continue; } // Ctrl-U
      if (k >= 128 && k < 256 && k > hi) continue;
      if (k < lo || k > hi) { if (k < 32) this.writeC(k); continue; }
      if (s.length >= max) { this.writeC(7); continue; }
      s += String.fromCharCode(k);
      this.writeC(k);
    }
  }

  // Output ----------------------------------------------------------------------
  writeC(c) {
    this.vdu.writeC(c);
    if (this.o.onOutput) this.o.onOutput(c);
    if (this.spool) this.spool.push(c);
  }
  writeStr(s) { for (let i = 0; i < s.length; i++) this.writeC(s.charCodeAt(i) & 255); }
  newLine() { this.writeC(10); this.writeC(13); }
  vduBytes(bytes) { for (let i = 0; i < bytes.length; i++) this.writeC(bytes[i] & 255); }
  plot(k, x, y) { this.vduBytes([25, k & 255, x & 255, (x >> 8) & 255, y & 255, (y >> 8) & 255]); }
  vduFlushQueue() { if (this.vdu.flushQueue) this.vdu.flushQueue(); }
  pos() { return this.vdu.pos | 0; }
  vpos() { return this.vdu.vpos | 0; }
  point(x, y) { return this.vdu.readPoint(x, y).colour | 0; }
  tint(x, y) { return this.vdu.readPoint(x, y).tint | 0; }
  modeNumber() { return this.vdu.mode | 0; }
  vduVar(n) {
    if (n < 128 && n <= 12) return this.vdu.modeVar(n) ?? 0;
    return this.vdu.vduVar ? (this.vdu.vduVar(n) ?? 0) : 0;
  }
  prettyPrint(s) {
    // OS_PrettyPrint subset: CR forces newline, words wrap at the window width
    const width = (this.vdu.vduVar && this.vdu.vduVar(256)) || 80;
    let col = this.pos();
    const words = s.split(/(\r| )/);
    for (const w of words) {
      if (w === '\r') { this.newLine(); col = 0; continue; }
      if (w === ' ') { if (col > 0 && col < width) { this.writeC(32); col++; } continue; }
      if (!w) continue;
      if (col > 0 && col + w.length > width) { this.newLine(); col = 0; }
      this.writeStr(w); col += w.length;
    }
  }
  /** Default error report (BASICTrans message 24) */
  reportError(msg, erl) {
    if (!erl) { this.newLine(); this.writeStr(msg); this.newLine(); return; }
    this.prettyPrint(msg + ' at line ' + erl);
    this.newLine();
  }

  // Colours via ColourTrans -------------------------------------------------------
  nearestColour(pal, mode) {
    // pal = &BBGGRR00
    const r = (pal >>> 8) & 255, g = (pal >>> 16) & 255, b = (pal >>> 24) & 255;
    const ncol = (this.vdu.modeVar(3, mode) ?? 15);
    if (ncol >= 63) {
      // 256 colour: choose best GCOL (6 bits) + tint
      let best = 0, bd = 1e9, bt = 0;
      for (let c = 0; c < 64; c++) for (let t = 0; t < 4; t++) {
        const R = (c & 3) * 0x44 + t * 0x11, G = ((c >> 2) & 3) * 0x44 + t * 0x11, B = ((c >> 4) & 3) * 0x44 + t * 0x11;
        const d = (R - r) ** 2 * 3 + (G - g) ** 2 * 4 + (B - b) ** 2 * 2;
        if (d < bd) { bd = d; best = c; bt = t; }
      }
      const px = (bt) | ((best & 1) << 2) | ((best & 16) >> 1) | ((best & 2) << 3) | ((best & 4) << 3) | ((best & 8) << 3) | ((best & 32) << 2);
      return { gcol: best | (bt << 6), tint: bt << 6, num: px, c256: true };
    }
    let best = 0, bd = 1e9;
    for (let i = 0; i <= ncol; i++) {
      const p = this.vdu.readPalette(i, 16);
      const w = p.first >>> 0;
      const R = (w >>> 8) & 255, G = (w >>> 16) & 255, B = (w >>> 24) & 255;
      const d = (R - r) ** 2 * 3 + (G - g) ** 2 * 4 + (B - b) ** 2 * 2;
      if (d < bd) { bd = d; best = i; }
    }
    return { gcol: best, tint: 0, num: best };
  }
  gcolNumber(action, c, bg) {
    if (c.c256) {
      this.vduBytes([18, action & 255, (c.gcol & 63) | (bg ? 128 : 0)]);
      this.vduBytes([23, 17, bg ? 3 : 2, c.tint & 255, 0, 0, 0, 0, 0, 0]);
    } else this.vduBytes([18, action & 255, (c.gcol & 255) | (bg ? 128 : 0)]);
  }
  textColourNumber(c, bg) {
    if (c.c256) {
      this.vduBytes([17, (c.gcol & 63) | (bg ? 128 : 0)]);
      this.vduBytes([23, 17, bg ? 1 : 0, c.tint & 255, 0, 0, 0, 0, 0, 0]);
    } else this.vduBytes([17, (c.gcol & 255) | (bg ? 128 : 0)]);
  }
  setModeFromSelector(ptr) {
    // mode selector block: flags, xres, yres, log2bpp, framerate, ...
    const x = this.mem.rd32(ptr + 4), y = this.mem.rd32(ptr + 8), l2 = this.mem.rd32(ptr + 12);
    const table = { '640x480x3': 28, '640x480x2': 27, '640x480x1': 26, '640x480x0': 25, '800x600x3': 32, '800x600x2': 31, '800x600x1': 30, '800x600x0': 29, '640x256x2': 12, '640x256x3': 15, '640x512x2': 20, '640x512x3': 21 };
    const m = table[`${x}x${y}x${l2}`] ?? 28;
    this.vduBytes([22, m]);
  }

  // Time ------------------------------------------------------------------------------
  monotonicTime() { return Math.floor((nowMs() - this.t0) / 10); }
  readTime() { return (this.monotonicTime() + this.timeOffset) | 0; }
  writeTime(t) { this.timeOffset = (t | 0) - this.monotonicTime(); }
  realDate() { return new Date(Date.now() + this.clockOffset); }
  timeString() { return this.formatTime(null, '%W3,%DY %M3 %CE%YR.%24:%MI:%SE'); }
  setTimeString(s) {
    // "Wed,23 Sep 2026.20:53:00", or date part / time part only
    const d = this.realDate();
    const mt = /(\d\d):(\d\d):(\d\d)/.exec(s);
    const md = /(\d{1,2}) (\w{3}) (\d{4})/.exec(s);
    const nd = new Date(d);
    if (md) { const mon = MONTHS.findIndex((x) => x.toLowerCase() === md[2].toLowerCase()); nd.setFullYear(+md[3], mon < 0 ? 0 : mon, +md[1]); }
    if (mt) nd.setHours(+mt[1], +mt[2], +mt[3]);
    this.clockOffset += nd.getTime() - d.getTime();
  }
  /** Format a time: t = centiseconds since 1900 (5 byte RISC OS time) or null for now */
  formatTime(t, fmt) {
    let d;
    if (t === null || t === undefined) d = this.realDate();
    else d = new Date(Date.UTC(1900, 0, 1) + t * 10);
    const p2 = (n) => String(n).padStart(2, '0');
    return fmt.replace(/%(\w\w\d?|%)/gi, (all, code) => {
      const c = code.toUpperCase();
      switch (c) {
        case 'CS': return p2(Math.floor(d.getMilliseconds() / 10));
        case 'SE': return p2(d.getSeconds());
        case 'MI': return p2(d.getMinutes());
        case '12': return p2(((d.getHours() + 11) % 12) + 1);
        case '24': return p2(d.getHours());
        case 'AM': return d.getHours() < 12 ? 'am' : 'pm';
        case 'PM': return d.getHours() < 12 ? 'am' : 'pm';
        case 'WE': return DAYS_L[d.getDay()];
        case 'W3': return DAYS_L[d.getDay()].slice(0, 3);
        case 'WN': return String(d.getDay() + 1);
        case 'DY': return p2(d.getDate());
        case 'ST': return ordinal(d.getDate());
        case 'MO': return MONTHS_L[d.getMonth()];
        case 'M3': return MONTHS[d.getMonth()];
        case 'MN': return p2(d.getMonth() + 1);
        case 'CE': return p2(Math.floor(d.getFullYear() / 100));
        case 'YR': return p2(d.getFullYear() % 100);
        case 'WK': return p2(weekNo(d));
        case 'DN': return String(dayOfYear(d)).padStart(3, '0');
        case '%': return '%';
        default: return all;
      }
    });
  }
  waitVsync() { return new Promise((res) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => res()) : setTimeout(res, 20))); }

  // Mouse / misc --------------------------------------------------------------------
  mouse() { return { x: this.mx, y: this.my, b: this.mb, t: this.monotonicTime() }; }
  mouseOn(n) { if (this.o.onMouseOn) this.o.onMouseOn(n); }
  mouseTo(x, y) { this.mx = x; this.my = y; if (this.o.onMouseTo) this.o.onMouseTo(x, y); }
  pointerTo(x, y) { this.mouseTo(x, y); }
  mouseStep() {}
  mouseRect(x0, y0, x1, y1) { this.mouseBox = [x0, y0, x1, y1]; }
  adval(n) {
    if (n === 7) return this.mx;
    if (n === 8) return this.my;
    if (n === -1) return this.keybuf.length;
    if (n <= -5 && n >= -8) return 15;
    if (n < 0) return 0;
    return 0;
  }

  // Sound ------------------------------------------------------------------------------
  sound(ch, amp, pitch, dur, beat) { if (this.soundOn && this.snd) return this.snd.sound(ch, amp, pitch, dur, beat); }
  envelope(a) { if (this.snd) this.snd.envelope(a); }
  soundEnable(on) { this.soundOn = on; if (this.snd && this.snd.enable) this.snd.enable(on); }
  voices(n) { if (this.snd && this.snd.voices) this.snd.voices(n); }
  voice(c, name) { if (this.snd && this.snd.voice) this.snd.voice(c, name); }
  stereo(c, p) { if (this.snd && this.snd.stereo) this.snd.stereo(c, p); }
  beat() { return this.beatsVal ? Math.floor(this.monotonicTime() * this.tempoVal / 4096) % this.beatsVal : 0; }
  beats() { return this.beatsVal; }
  setBeats(n) { this.beatsVal = n; }
  tempo() { return this.tempoVal; }
  setTempo(n) { this.tempoVal = n; }

  // System variables -------------------------------------------------------------
  getSysVar(name) {
    if (name === 'Sys$Time') return this.formatTime(null, '%24:%MI:%SE');
    if (name === 'Sys$Date') return this.formatTime(null, '%W3, %DY %M3');
    if (name === 'Sys$Year') return this.formatTime(null, '%CE%YR');
    if (this.sysvars.has(name)) return this.sysvars.get(name);
    // wildcard lookup
    if (/[*#]/.test(name)) {
      const re = new RegExp('^' + name.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/#/g, '.') + '$', 'i');
      for (const [k, v] of this.sysvars) if (re.test(k)) return v;
    }
    for (const [k, v] of this.sysvars) if (k.toLowerCase() === name.toLowerCase()) return v;
    return undefined;
  }
  setSysVar(name, v) { if (v === undefined) { for (const k of [...this.sysvars.keys()]) if (k.toLowerCase() === name.toLowerCase()) this.sysvars.delete(k); } else this.sysvars.set(name, v); }
  /** GSTrans: expand <var>, |x control codes, "quotes" */
  gstrans(s) {
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '<') {
        const j = s.indexOf('>', i);
        if (j > i) {
          const name = s.slice(i + 1, j);
          if (/^\d+$/.test(name)) { out += String.fromCharCode(+name & 255); i = j; continue; }
          if (/^&[0-9a-f]+$/i.test(name)) { out += String.fromCharCode(parseInt(name.slice(1), 16) & 255); i = j; continue; }
          const v = this.getSysVar(name);
          if (v !== undefined) { out += v; i = j; continue; }
          if (/^[A-Za-z0-9$_]+$/.test(name)) { i = j; continue; }
        }
        out += c; continue;
      }
      if (c === '|' && i + 1 < s.length) {
        const d = s[++i];
        if (d === '!') { const e = s[++i] || ''; out += String.fromCharCode((e.charCodeAt(0) | 0x80) & 255); continue; }
        if (d === '?') { out += '\x7f'; continue; }
        if (d === '|') { out += '|'; continue; }
        if (d === '"') { out += '"'; continue; }
        if (d === '<') { out += '<'; continue; }
        const cc = d.charCodeAt(0);
        if (cc >= 64 && cc < 128) { out += String.fromCharCode(cc & 31); continue; }
        out += d; continue;
      }
      out += c;
    }
    return out;
  }

  // Memory helpers for SWIs ------------------------------------------------------
  resetSysScratch() { this.scratchPtr = SCRATCH + 0x1000; }
  scratchAlloc(n) {
    let p = (this.scratchPtr + 3) & ~3;
    if (p + n > SCRATCH_END) p = SCRATCH + 0x1000;
    this.scratchPtr = p + n;
    return p;
  }
  sysString(s) { const p = this.scratchAlloc(s.length + 1); this.mem.wrStr0(p, s); return p; }
  scratchStr(s) { return this.sysString(s); }
  errorBlock(e) {
    const p = SCRATCH + 0x100 + ((this._eb = ((this._eb || 0) + 1) & 3) * 0x100);
    this.mem.wr32(p, e.number | 0);
    this.mem.wrStr0(p + 4, e.message.slice(0, 250));
    return p;
  }
  envPtr() { const p = SCRATCH; this.mem.wrStr0(p, this.cmdLine.slice(0, 250)); return p; }
  /** allocate in the system heap (RMA) */
  sysAlloc(n) {
    const p = (this.rmaNext + 3) & ~3;
    if (p + n > SCRATCH) throw new BasicError(0x184, 'No room in RMA');
    this.rmaNext = p + n;
    return p;
  }
  maxAppSpace() { return RMA_BASE; }

  // SWI dispatch ------------------------------------------------------------------
  callSwiByName(name, regs) {
    const n = this.swis.lookup(name);
    if (n === undefined) throw new BasicError(0x1E6, 'SWI name not known');
    return this.callSwi(n, regs);
  }
  /**
   * Call a SWI. regs: array of up to 10 ints (modified). Returns {r, flags} or a Promise of it.
   * Errors: non-X SWIs throw BasicError; X SWIs set V and r[0] -> error block.
   */
  callSwi(num, regs) {
    const r = regs.length >= 10 ? regs : regs.concat(new Array(10 - regs.length).fill(0));
    const x = !!(num & XBIT);
    const base = num & ~XBIT & 0xFFFFFF;
    const ctx = { flags: 0, x };
    const fail = (e) => {
      if (!(e instanceof BasicError)) throw e;
      if (!x) throw e;
      r[0] = this.errorBlock(e); ctx.flags |= V_FLAG;
      return { r, flags: ctx.flags };
    };
    if (base >= 0x100 && base < 0x200) { this.writeC(base & 255); return { r, flags: 0 }; }
    const h = this.swis.byNum.get(base);
    if (!h) return fail(new BasicError(0x1E6, `SWI &${base.toString(16).toUpperCase()} not known`));
    let res;
    try { res = h.fn(r, this, ctx); } catch (e) { return fail(e); }
    if (res && typeof res.then === 'function') return res.then(() => ({ r, flags: ctx.flags }), fail);
    return { r, flags: ctx.flags };
  }

  // OS_Byte / OS_Word ------------------------------------------------------------
  osbyte(r, ctx) {
    const a = r[0] & 255, x = r[1] & 255, y = r[2] & 255;
    switch (a) {
      case 0: if (x === 0) throw new BasicError(0xF7, 'RISC OS 3.71 (23 Sep 1996)'); r[1] = 6; return;
      case 4: r[1] = this.fx4; this.fx4 = x; return;
      case 15: case 21: this.keybuf.length = 0; return;
      case 19: return this.waitVsync();
      case 106: this.mouseOn(x); return;
      case 117: r[1] = this.vdu.vduStatus ? this.vdu.vduStatus() : 0; return;
      case 124: this.interp.escape = false; return;
      case 125: this.escape(); return;
      case 126: { const e = this.interp.escape; this.interp.escape = false; r[1] = e ? 255 : 0; return; }
      case 128: { const v = this.adval((x << 24) >> 24 === x - 256 && x > 127 ? x - 256 : x); r[1] = v & 255; r[2] = (v >> 8) & 255; return; }
      case 129: {
        const n = x | (y << 8);
        if (y === 0xFF) {
          if (x === 0) { r[1] = 0xA7; r[2] = 0; return; }
          const k = ((x - 256) | 0); // negative INKEY
          const d = this.keyScan(k);
          r[1] = d ? 0xFF : 0; r[2] = d ? 0xFF : 0; return;
        }
        const k = this.keyNow();
        if (k >= 0) { r[1] = k; r[2] = 0; return; }
        if (n === 0) { r[1] = 0; r[2] = 0xFF; ctx.flags |= C_FLAG; return; }
        return this.waitKey(n * 10).then((k2) => { if (k2 < 0) { r[2] = 0xFF; ctx.flags |= C_FLAG; } else { r[1] = k2; r[2] = 0; } });
      }
      case 130: r[1] = 0xFF; r[2] = 0xFF; return;
      case 131: r[1] = this.interp.page & 255; r[2] = (this.interp.page >> 8) & 255; return;
      case 132: r[1] = this.interp.himem & 255; r[2] = (this.interp.himem >> 8) & 255; return;
      case 134: r[1] = this.pos(); r[2] = this.vpos(); return;
      case 135: { const c = this.vdu.readCharAtCursor ? this.vdu.readCharAtCursor() : { char: 0, mode: 0 }; r[1] = c.char; r[2] = c.mode; return; }
      case 138: this.keyPress(y); return;
      case 160: { const v = this.vduVar(x); r[1] = v & 255; r[2] = (v >> 8) & 255; return; }
      case 161: r[2] = 0; return;
      case 162: return;
      case 165: r[1] = this.pos(); r[2] = this.vpos(); return;
      case 200: case 220: case 221: case 222: case 223: case 224: case 225: case 226: case 227: case 228:
        return;
      case 202: r[1] = 0x20; return;
      case 218: r[1] = this.vdu.queueLength ?? 0; return;
      case 229: r[1] = this.escapeEnabled ? 0 : 1; this.escapeEnabled = x === 0; return;
      default: return;
    }
  }
  osword(r, ctx) {
    const a = r[0] & 255; const blk = r[1] >>> 0;
    const M = this.mem;
    switch (a) {
      case 0: { // read line: block: buffer addr (2 bytes), max, lo, hi
        const buf = M.rd16(blk); const max = M.rd8(blk + 2); const lo = M.rd8(blk + 3); const hi = M.rd8(blk + 4);
        return this.readLine(max, lo, hi).then((s) => { M.wrStrCR(buf, s); r[2] = s.length; }, (e) => { if (e.number === 17) { ctx.flags |= C_FLAG; return; } throw e; });
      }
      case 1: { const t = this.readTime(); M.wr32(blk, t); M.wr8(blk + 4, t < 0 ? 255 : 0); return; }
      case 2: this.writeTime(M.rd32(blk)); return;
      case 7: { const ch = M.rd16(blk), amp = (M.rd16(blk + 2) << 16) >> 16, p = M.rd16(blk + 4), d = M.rd16(blk + 6); this.sound(ch, amp, p, d, null); return; }
      case 8: { const v = []; for (let i = 0; i < 14; i++) v.push((M.rd8(blk + i) << 24) >> 24); v[0] = M.rd8(blk); this.envelope(v); return; }
      case 9: { const x = (M.rd16(blk) << 16) >> 16, y = (M.rd16(blk + 2) << 16) >> 16; const p = this.vdu.readPoint(x, y); M.wr8(blk + 4, p.offScreen ? 255 : p.colour & 255); return; }
      case 10: { const c = M.rd8(blk); const d = this.vdu.osWordReadCharDef ? this.vdu.osWordReadCharDef(c) : new Uint8Array(8); for (let i = 0; i < 8; i++) M.wr8(blk + 1 + i, d[i]); return; }
      case 11: { const l = M.rd8(blk); const p = this.vdu.readPalette(l, 16); M.wr8(blk + 1, (p.phys ?? l) & 255); M.wr8(blk + 2, (p.first >>> 8) & 255); M.wr8(blk + 3, (p.first >>> 16) & 255); M.wr8(blk + 4, (p.first >>> 24) & 255); return; }
      case 12: { const b = [19]; for (let i = 0; i < 5; i++) b.push(M.rd8(blk + i)); this.vduBytes(b); return; }
      case 13: { const g = this.vdu.graphicsCursors ? this.vdu.graphicsCursors() : { oldX: 0, oldY: 0, curX: 0, curY: 0 }; M.wr16(blk, g.oldX & 0xFFFF); M.wr16(blk + 2, g.oldY & 0xFFFF); M.wr16(blk + 4, g.curX & 0xFFFF); M.wr16(blk + 6, g.curY & 0xFFFF); return; }
      case 14: {
        const reason = M.rd8(blk);
        if (reason === 0) { M.wrStrCR(blk, this.timeString()); return; }
        if (reason === 1) { const d = this.realDate(); const bcd = (n) => ((Math.floor(n / 10) << 4) | (n % 10)); M.wr8(blk, bcd(d.getFullYear() % 100)); M.wr8(blk + 1, bcd(d.getMonth() + 1)); M.wr8(blk + 2, bcd(d.getDate())); M.wr8(blk + 3, d.getDay() + 1); M.wr8(blk + 4, bcd(d.getHours())); M.wr8(blk + 5, bcd(d.getMinutes())); M.wr8(blk + 6, bcd(d.getSeconds())); return; }
        if (reason === 3) { const cs = Math.floor((this.realDate().getTime() - Date.UTC(1900, 0, 1)) / 10); M.wr32(blk, cs % 4294967296); M.wr8(blk + 4, Math.floor(cs / 4294967296) & 255); return; }
        return;
      }
      case 15: {
        const len = r[1] >>> 0; void len;
        let s = ''; for (let i = 1; i < 25; i++) { const c = M.rd8(blk + i); s += String.fromCharCode(c); }
        this.setTimeString(s); return;
      }
      case 21: {
        const reason = M.rd8(blk);
        if (reason === 3) { const x = (M.rd16(blk + 1) << 16) >> 16, y = (M.rd16(blk + 3) << 16) >> 16; this.mouseTo(x, y); }
        else if (reason === 4) { M.wr16(blk + 1, this.mx & 0xFFFF); M.wr16(blk + 3, this.my & 0xFFFF); }
        else if (reason === 5) { const x = (M.rd16(blk + 1) << 16) >> 16, y = (M.rd16(blk + 3) << 16) >> 16; this.pointerTo(x, y); }
        else if (reason === 6) { M.wr16(blk + 1, this.mx & 0xFFFF); M.wr16(blk + 3, this.my & 0xFFFF); }
        return;
      }
      default: return;
    }
  }

  /** BBC MOS call emulation for CALL/USR &FFxx (EMUMOS) */
  emuMos(lo) {
    const I = this.interp;
    const A = I.iv[1], X = I.iv[24], Y = I.iv[25];
    let r0 = A, r1 = X, r2 = Y, carry = 0;
    const ret = () => (((r0 & 255) | ((r1 & 255) << 8) | ((r2 & 255) << 16) | (carry << 24)) | 0);
    switch (lo) {
      case 0xE0: { const k = this.keyNow(); r0 = k < 0 ? 0 : k; return ret(); }
      case 0xEE: this.writeC(A & 255); return ret();
      case 0xE7: this.newLine(); return ret();
      case 0xE3: if ((A & 255) === 13) this.writeC(10); this.writeC(A & 255); return ret();
      case 0xF4: { const r = [A, X, Y, 0, 0, 0, 0, 0, 0, 0]; const ctx = { flags: 0 }; this.osbyte(r, ctx); r0 = r[0]; r1 = r[1]; r2 = r[2]; carry = ctx.flags & C_FLAG ? 1 : 0; return ret(); }
      case 0xF1: { const blk = X < 256 ? (X | (Y << 8)) : X; const r = [A, blk, 0]; this.osword(r, { flags: 0 }); return ret(); }
      case 0xF7: { const blk = X < 256 ? (X | (Y << 8)) : X; this.oscli(this.mem.rdStrCtrl(blk)); return ret(); }
      default: return 0;
    }
  }

  // ARM code --------------------------------------------------------------------
  callArm(addr, params, isUsr) {
    if (!this.arm) { this.arm = new ARM(this.mem, (num, cpu) => this.armSwi(num, cpu)); this.arm.escape = () => this.interp.escape; }
    const I = this.interp;
    const r = new Array(16).fill(0);
    for (let i = 0; i < 8; i++) r[i] = I.iv[1 + i];
    // parameter block for CALL: list of (address, type) pairs
    if (params && params.length) {
      const blk = this.scratchAlloc(params.length * 8);
      params.forEach((lv, i) => {
        let addr = 0, type = 4;
        if (lv.kind === 'ind') { addr = lv.addr(); type = lv.ik === 'b' ? 0 : lv.ik === 'w' ? 4 : lv.ik === 'f' ? 5 : 129; }
        else {
          // variables live in JS: give them a temporary slot in memory and copy back afterwards
          addr = this.scratchAlloc(260);
          const v = I.readLV(lv);
          if (lv.t === TI) { this.mem.wr32(addr, v); type = 4; } else if (lv.t === TF) { this.mem.wrFloat5(addr, v); type = 5; } else { this.mem.wrStrCR(addr, v); type = 129; }
          lv._tmpAddr = addr;
        }
        this.mem.wr32(blk + (params.length - 1 - i) * 8, addr);
        this.mem.wr32(blk + (params.length - 1 - i) * 8 + 4, type);
      });
      r[9] = blk; r[10] = params.length;
    }
    r[8] = 0x8700; r[11] = SCRATCH + 0x2000; r[12] = 0;
    r[13] = (I.himem - I.stackBytes - 256) & ~3;
    const done = (cpu) => {
      if (params) for (const lv of params) {
        if (lv._tmpAddr) {
          const a = lv._tmpAddr; delete lv._tmpAddr;
          const v = lv.t === TI ? this.mem.rd32(a) : lv.t === TF ? this.mem.rdFloat5(a) : this.mem.rdStrCR(a);
          I.assignLV(lv, v);
        }
      }
      return cpu.r[0] | 0;
    };
    const res = this.arm.call(addr, r);
    if (res && typeof res.then === 'function') return res.then(() => done(this.arm));
    return done(this.arm);
  }
  armSwi(num, cpu) {
    // SWIs from ARM code share the SYS table; OS_WriteS needs the PC
    const base = num & ~XBIT & 0xFFFFFF;
    if (base === 1) { // OS_WriteS: string follows the SWI
      let a = cpu.pcAfterSwi();
      for (;;) { const c = this.mem.rd8(a++); if (c === 0) break; this.writeC(c); }
      cpu.setPcAfterSwi((a + 3) & ~3);
      return { flags: 0 };
    }
    if (base === 0x11) { cpu.halt = true; this.interp.quit(0); return { flags: 0 }; }
    const regs = cpu.r.slice(0, 10);
    const res = this.callSwi(num, regs);
    const apply = (o) => { for (let i = 0; i < 10; i++) cpu.r[i] = o.r[i] | 0; return o; };
    if (res && typeof res.then === 'function') return res.then(apply);
    return apply(res);
  }

  // =========================================================================
  // Execution loop
  // =========================================================================
  async runLoop() {
    const I = this.interp;
    this.busy = true;
    try {
      while (I.running) {
        let r;
        try {
          r = this.slice();
        } catch (e) {
          if (!I.handleError(e)) break;
          continue;
        }
        if (r === 'yield') { await yieldHost(); continue; }
        if (r && typeof r.then === 'function') {
          try { await r; } catch (e) { if (!I.handleError(e)) break; }
        }
      }
    } finally {
      this.busy = false;
    }
    if (I.quitRequested !== undefined) {
      const c = I.quitRequested; I.quitRequested = undefined;
      this.exited = true;
      if (this.o.onExit) this.o.onExit(c);
    }
    if (I.extError) {
      const e = I.extError; I.extError = null;
      if (this.o.onExit) { this.exited = true; this.o.onExit(e); } else this.reportError(e.message, I.erl);
    }
  }
  slice() {
    const I = this.interp;
    const end = nowMs() + this.sliceMs;
    let n = 0;
    for (;;) {
      const r = I.ops[I.pc++]();
      if (r !== undefined && r !== null && typeof r.then === 'function') return r;
      if (!I.running) return undefined;
      if (++n >= 2048) { n = 0; if (nowMs() >= end) return 'yield'; }
    }
  }

  /** A line typed at the prompt (or given to immediate()) */
  async enterLine(text) {
    const I = this.interp;
    if (this.autoMode) return this.autoLine(text);
    if (text.length > 255) { this.reportError('Line too long', 0); return; }
    const r = tokeniseProgramLine(text, this.listo);
    if (r.lineNumber !== null) {
      try {
        I.insertLine(r.lineNumber, Uint8Array.from(r.body));
        I.clearVars();
      } catch (e) { if (e instanceof BasicError) { this.reportError(e.message, 0); return; } throw e; }
      if (r.warn.unmatchedBrackets) { this.writeStr('Warning: unmatched ()'); this.newLine(); }
      if (r.warn.lineTooBig) { this.writeStr('Warning: line number too big'); this.newLine(); }
      if (r.warn.unmatchedQuote) { this.writeStr('Warning: unmatched "'); this.newLine(); }
      return;
    }
    // immediate statement(s)
    const body = r.body;
    const b = new Uint8Array(body.length + 1); b.set(body); b[body.length] = 13;
    const line = { num: 0, b, body: Uint8Array.from(body), idx: -1, imm: true, code: null };
    I.errH = null;
    I.stack.length = 0; I.stackBytes = 0;
    I.tmp = []; I.tmpT = [];
    I.running = true;
    try {
      I.goto(line, 0);
    } catch (e) {
      I.handleError(e);
    }
    await this.runLoop();
  }

  // =========================================================================
  // Commands (immediate mode only)
  // =========================================================================
  async command(tok, args) {
    const I = this.interp;
    const text = String.fromCharCode(...args);
    const argStr = () => this.evalString(text);
    switch (tok) {
      case TC.LIST: return this.cmdList(args);
      case TC.NEW: this.oldProgram = I.lines.map((l) => ({ num: l.num, body: l.body })); I.setProgramLines([]); I.clearVars(); return;
      case TC.OLD: if (this.oldProgram) { I.setProgramLines(this.oldProgram); I.clearVars(); } return;
      case TC.RENUMBER: return this.cmdRenumber(args);
      case TC.DELETE: return this.cmdDelete(args);
      case TC.AUTO: return this.cmdAuto(args);
      case TC.LOAD: { const name = argStr(); await this.loadProgramNamed(name); return; }
      case TC.TEXTLOAD: { const name = argStr(); await this.loadProgramNamed(name); return; }
      case TC.SAVE: { const name = text.trim() === '' ? this.progName() : argStr(); await this.saveProgram(name, false); return; }
      case TC.TEXTSAVE: {
        let t = text; let listo = 0;
        if (t.trimStart().startsWith('O')) { t = t.trimStart().slice(1); const k = t.indexOf(','); listo = this.evalInt(t.slice(0, k)); t = t.slice(k + 1); }
        await this.saveProgram(this.evalString(t), true, listo); return;
      }
      case TC.APPEND: {
        const name = argStr();
        const lines = await this.loadProgramFile(name);
        const last = I.lines.length ? I.lines[I.lines.length - 1].num : 0;
        const ren = renumberLines(lines, last + 10, 10).lines;
        I.setProgramLines(I.lines.map((l) => ({ num: l.num, body: l.body })).concat(ren));
        I.clearVars();
        return;
      }
      case TC.CRUNCH: return;
      case TC.LVAR: return this.cmdLvar();
      case TC.HELP: return this.cmdHelp(text);
      case TC.EDIT: case TC.TWIN: case TC.TWINO: {
        if (!this.o.onEdit) { this.writeStr('EDIT is not available'); this.newLine(); return; }
        const res = await this.o.onEdit(programToText(I.lines, this.listo));
        if (typeof res === 'string') { I.setProgramLines(textToLines(res).lines); I.clearVars(); }
        return;
      }
      case TC.INSTALL: { await this.loadLibrary(argStr(), true); return; }
    }
    throw err('ERSYNT');
  }
  evalString(text) {
    const v = this.evalExpr(text);
    if (v.t !== TS) throw err('ERTYPESTR');
    return v.v;
  }
  evalInt(text) {
    const v = this.evalExpr(text);
    if (v.t === TS) throw err('ERTYPEINT');
    return v.v | 0;
  }
  evalExpr(text) {
    const I = this.interp;
    const tok = tokenise(text, { mode: 'eval' }).bytes;
    const b = new Uint8Array(tok.length + 1); b.set(tok); b[tok.length] = 13;
    const line = { num: 0, b, body: b, idx: -1, imm: true };
    const { Parser } = I._parserMod || {};
    void Parser;
    return I.evalSync(line);
  }
  progName() { return this.lastProgName || ''; }

  parseRange(args) {
    // LIST [a][,[b]]  (line numbers are 0x8D constants)
    let i = 0; const b = args;
    const sp = () => { while (b[i] === 32) i++; };
    const num = () => { sp(); if (b[i] === T.CONST) { const n = decodeLineNumber(b[i + 1], b[i + 2], b[i + 3]); i += 4; return n; } let s = ''; while (b[i] >= 48 && b[i] <= 57) s += String.fromCharCode(b[i++]); return s ? +s : null; };
    let from = 0, to = 65279;
    const a = num();
    sp();
    if (a !== null) { from = a; to = a; }
    if (b[i] === 0x2C) { i++; to = 65279; const c = num(); if (c !== null) to = c; }
    sp();
    let match = null;
    if (b[i] === T.IF) { match = Array.from(b.slice(i + 1)); i = b.length; }
    return { from, to, match, rest: i };
  }
  async cmdList(args) {
    const I = this.interp;
    if (args[0] === 0x4F) { // LISTO n
      const n = this.evalInt(String.fromCharCode(...args.slice(1)));
      if (n < 0 || n >= 32) throw err('ERLISTO');
      this.listo = n; return;
    }
    const { from, to, match } = this.parseRange(args);
    const lines = I.lines.map((l) => ({ num: l.num, body: l.body }));
    let indent = 0;
    for (const l of lines) {
      const ci = computeIndent(l.body, indent);
      indent = ci.next;
      if (l.num < from || l.num > to) continue;
      if (match && !containsBytes(l.body, match)) continue;
      for (const s of listLine(l.num, l.body, this.listo, ci.use)) {
        this.writeStr(s); this.newLine();
        if (I.escape) { I.escape = false; throw err('ESCAPE'); }
      }
      if ((l.num & 15) === 0) await yieldHost();
    }
  }
  cmdRenumber(args) {
    const I = this.interp;
    const s = String.fromCharCode(...args).trim();
    let start = 10, step = 10;
    const nums = s.split(',').map((x) => x.trim());
    const decode = (x) => { if (!x) return null; if (x.charCodeAt(0) === T.CONST) return decodeLineNumber(x.charCodeAt(1), x.charCodeAt(2), x.charCodeAt(3)); return +x; };
    if (nums[0]) start = decode(nums[0]);
    if (nums[1]) step = decode(nums[1]);
    if (!step) throw err('ERSILL');
    const r = renumberLines(I.lines.map((l) => ({ num: l.num, body: l.body })), start, step);
    I.setProgramLines(r.lines);
    for (const [ln, ref] of r.failed) { this.writeStr(`Failed at ${ln}`); this.newLine(); void ref; }
    I.clearVars();
  }
  cmdDelete(args) {
    const I = this.interp;
    const { from, to } = this.parseRange(args);
    I.setProgramLines(I.lines.filter((l) => l.num < from || l.num > to).map((l) => ({ num: l.num, body: l.body })));
    I.clearVars();
  }
  cmdAuto(args) {
    const s = String.fromCharCode(...args).trim().split(',');
    const dec = (x) => { x = (x || '').trim(); if (!x) return null; if (x.charCodeAt(0) === T.CONST) return decodeLineNumber(x.charCodeAt(1), x.charCodeAt(2), x.charCodeAt(3)); return +x; };
    const start = dec(s[0]) ?? 10; const step = dec(s[1]) ?? 10;
    if (!step) throw err('ERSILL');
    this.autoMode = { n: start, step };
  }
  /** One AUTO line: print the number, read the line, insert it (AUMATCH + INSRT) */
  async autoStep() {
    const a = this.autoMode;
    this.writeStr(String(a.n).padStart(5, ' '));
    let text;
    try { text = await this.readLine(238, 32, 255); } catch (e) {
      this.autoMode = null;
      if (e instanceof BasicError && e.number === 17) { this.reportError('Escape', 0); return; }
      throw e;
    }
    const tok = tokenise(text, { mode: 'auto' }).bytes;
    const body = this.listo ? tok.slice(tok.findIndex((c) => c !== 32) < 0 ? tok.length : tok.findIndex((c) => c !== 32)) : tok;
    try { this.interp.insertLine(a.n, Uint8Array.from(finishBody(body))); this.interp.clearVars(); } catch (e) { if (e instanceof BasicError) this.reportError(e.message, 0); else throw e; }
    a.n += a.step;
    if (a.n > 65279) this.autoMode = null;
  }

  cmdLvar() {
    const I = this.interp;
    const w = I.iv[0];
    const fmt = ((w >> 16) & 255) === 1 ? 'e' : ((w >> 16) & 255) === 2 ? 'f' : 'g';
    this.writeStr(`Static Integer variables:               @% = "${(w & 0x1000000) ? '+' : ''}${fmt}${w & 255}${(w & 0x800000) ? ',' : '.'}${(w >> 8) & 255}"`);
    let col = 0;
    for (let k = 1; k <= 26; k++) {
      if ((k - 1) % 4 === 0) { this.newLine(); col = 0; } else { this.writeStr(' '.repeat(Math.max(1, 20 * ((k - 1) % 4) - col))); col = 20 * ((k - 1) % 4); }
      const s = String.fromCharCode(64 + k) + '% = ' + I.iv[k];
      this.writeStr(s); col += s.length;
    }
    this.newLine();
    const dyn = [...I.vars.values()].filter((v) => v.d);
    const arrs = [...I.arrs.values()].filter((a) => a.state);
    if (dyn.length || arrs.length) {
      this.writeStr('Dynamic variables:');
      let col = 256;
      const item = (s) => {
        if (col >= 60 || col + s.length > 79) { this.newLine(); col = 0; } else { const t = col < 20 ? 20 : col < 40 ? 40 : 60; this.writeStr(' '.repeat(t - col)); col = t; }
        this.writeStr(s); col += s.length;
      };
      const all = [...dyn.map((v) => [v.name, () => v.name + ' = ' + (v.t === TS ? '"' + v.v.replace(/[\x00-\x1f\x7f]/g, '.') + '"' : formatNumber(v.v, (w & ~0xFF) | 0))]),
        ...arrs.map((a) => [a.name, () => a.name + (a.dims ? a.dims.map((d) => d - 1).join(',') + ')' : (a.state === 1 ? 'local)' : 'undimensioned)'))])];
      all.sort((a, b) => a[0].localeCompare(b[0]));
      for (const [, f] of all) item(f());
      this.newLine();
    }
    const defs = [...I.defs.keys()];
    const procs = defs.filter((d) => d.startsWith('PROC')).map((d) => d.slice(4));
    const fns = defs.filter((d) => d.startsWith('FN')).map((d) => d.slice(2));
    if (procs.length) { this.writeStr('Procedures:'); this.newLine(); this.writeStr(procs.join(' ')); this.newLine(); }
    if (fns.length) { this.writeStr('Functions:'); this.newLine(); this.writeStr(fns.join(' ')); this.newLine(); }
  }
  /** HELP (BASICTrans_HELP + HELPTXT) */
  cmdHelp(text) {
    const I = this.interp;
    const b = Array.from(text, (ch) => ch.charCodeAt(0));
    let i = 0; while (b[i] === 32) i++;
    const c = b[i] ?? 13;
    const pp = (key) => { this.prettyPrint(HELP[key] || ''); };
    if (c === 0x2E || (c >= 0x41 && c <= 0x57)) {
      if (c !== 0x2E) pp('H1');
      let col = 0;
      for (const e of LEX_TABLE) {
        if (c !== 0x2E && e.codes[0] !== c) continue;
        if (col >= 70) { this.newLine(); col = 0; } else if (col) { while (col % 10) { this.writeC(32); col++; } }
        this.writeStr(e.name); col += e.name.length;
      }
      if (col) this.newLine();
      return;
    }
    if (c === 0x5B) { pp('HASM'); this.newLine(); return; }
    if (c === 0x40) { pp('H@'); this.newLine(); return; }
    if (c >= 0x7F) {
      let name = tokenName(c, b[i + 1]);
      if (name === 'POINT(') name = 'POINTPAR';
      name = name.replace(/\($/, '');
      if (c === T.CONST) name = 'CONST';
      const key = 'H' + name;
      if (HELP[key]) pp(key); else this.prettyPrint('HELP has no information on this keyword');
      this.newLine();
      return;
    }
    pp('H0');
    this.writeStr('ARM BBC BASIC V assembled on 1st April 1996.'); this.newLine();
    const prog = I.top - I.page, vars = I.fsa - I.lomem, free = I.himem - I.fsa - I.stackBytes;
    this.prettyPrint(`The program size is ${prog} bytes, the variables use ${vars} bytes. There are ${free} bytes of memory remaining.`);
    this.newLine();
  }

  // Program files -------------------------------------------------------------------
  async readFileBytes(name) {
    if (!this.fs || !this.fs.readFile) throw new BasicError(0xD6, `File '${name}' not found`);
    const path = this.gstrans(name);
    const f = await this.fs.readFile(path);
    if (!f) throw new BasicError(0xD6, `File '${name}' not found`);
    return { data: f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data || f), type: f.type ?? 0xFFB, path };
  }
  async loadProgramFile(name) {
    const f = await this.readFileBytes(name);
    return bytesToLines(f.data);
  }
  async loadProgramNamed(name) {
    const I = this.interp;
    const f = await this.readFileBytes(name);
    const p = parseProgram(f.data);
    if (p) I.setProgramLines(p.lines);
    else {
      const r = textToLines(f.data);
      I.setProgramLines(r.lines);
      if (r.renumbered) { this.writeStr('Program renumbered'); this.newLine(); }
    }
    I.clearVars();
    this.lastProgName = name;
  }
  async saveProgram(name, asText, listo = 0) {
    const I = this.interp;
    if (!this.fs || !this.fs.writeFile) throw new BasicError(0xD6, 'No filing system');
    const path = this.gstrans(name);
    if (asText) {
      const s = programToText(I.lines, listo);
      await this.fs.writeFile(path, Uint8Array.from(s, (c) => c.charCodeAt(0) & 255), 0xFFF);
    } else await this.fs.writeFile(path, I.programImage(), 0xFFB);
    this.lastProgName = name;
  }
  async chain(name) {
    const I = this.interp;
    const lines = await this.loadProgramFile(name);
    I.setProgramLines(lines);
    this.lastProgName = name;
    I.runProgram();
  }
  async chainFile(name) {
    await this.chain(name);
    await this.runLoop();
  }
  async loadLibrary(name, install) {
    const I = this.interp;
    const lines = await this.loadProgramFile(name);
    // library name for error messages: from a REM on the first line
    let libName = name;
    if (lines.length) {
      const b = lines[0].body; let i = 0; while (b[i] === 32) i++;
      if (b[i] === T.REM) { let s = String.fromCharCode(...b.slice(i + 1)).trim(); if (s.startsWith('>')) s = s.slice(1).trim(); if (s) libName = s.split(' ')[0]; }
    }
    const libLines = lines.map((l, j) => ({ ...I.mkLine(l.num, l.body, j), lib: true, libName }));
    for (const l of libLines) l.owner = libLines;
    const lib = { name, lines: libLines };
    let bytes = 0; for (const l of lines) bytes += l.body.length + 4;
    if (install) { I.installed.push(lib); I.himem -= bytes; I.memlimit = I.himem; }
    else { I.libraries.unshift(lib); I.fsa += (bytes + 7) & ~3; }
    I.defs.clear();
  }

  // =========================================================================
  // * commands
  // =========================================================================
  async oscli(cmdIn) {
    let cmd = String(cmdIn);
    cmd = cmd.replace(/^[\s*]+/, '');
    if (!cmd || cmd.startsWith('|')) return;
    const m = /^([A-Za-z_$][\w$.:]*)\s*(.*)$/s.exec(cmd);
    if (!m) { if (cmd[0] === '/') return this.oscli('Run ' + cmd.slice(1)); throw new BasicError(0xFE, 'Bad command'); }
    let [, name, rest] = m;
    rest = rest.trim();
    const un = name.toUpperCase();
    // host first (Wimp core may override anything)
    if (this.o.oscli) {
      const h = await this.o.oscli(cmd, this);
      if (h) return;
    }
    const mstart = (full, min) => un.length >= min && full.startsWith(un.replace(/\.$/, ''));
    const args = () => rest.split(/[\s,]+/).filter(Boolean);
    if (un === 'FX' || /^FX\d/.test(un)) {
      const a = (un === 'FX' ? rest : un.slice(2) + ' ' + rest).split(/[\s,]+/).filter(Boolean).map((x) => parseInt(x.replace(/^&/, '0x'), x.startsWith('&') ? 16 : 10));
      const r = [a[0] | 0, a[1] | 0, a[2] | 0, 0, 0, 0, 0, 0, 0, 0];
      return this.osbyte(r, { flags: 0 });
    }
    switch (un) {
      case 'ECHO': this.writeStr(this.gstrans(rest)); this.newLine(); return;
      case 'SET': { const k = rest.indexOf(' '); this.setSysVar(rest.slice(0, k < 0 ? undefined : k), k < 0 ? '' : this.gstrans(rest.slice(k + 1).trim())); return; }
      case 'SETMACRO': { const k = rest.indexOf(' '); this.setSysVar(rest.slice(0, k), rest.slice(k + 1).trim()); return; }
      case 'SETEVAL': { const k = rest.indexOf(' '); const v = this.evalOsExpr(rest.slice(k + 1).trim()); this.setSysVar(rest.slice(0, k), String(v)); return; }
      case 'UNSET': this.setSysVar(rest, undefined); return;
      case 'SHOW': {
        for (const [k, v] of this.sysvars) {
          if (rest && !new RegExp('^' + rest.replace(/\*/g, '.*').replace(/#/g, '.') + '$', 'i').test(k)) continue;
          this.writeStr(`${k} : ${v}`); this.newLine();
        }
        return;
      }
      case 'TIME': this.writeStr(this.timeString()); this.newLine(); return;
      case 'QUIT': this.interp.quit(0); return;
      case 'BASIC': return;
      case 'KEY': return;
      case 'WIMPSLOT': return;
      case 'POINTER': return;
      case 'TV': return;
      case 'CLOSE': return this.files.close(0);
      case 'SPOOL': this.spool = null; return;
      case 'SPOOLON': return;
      case 'HELP': this.writeStr('==> Help on keyword ' + (rest || 'HELP')); this.newLine(); return;
      case 'WIMPMODE': case 'SCREENMODE': case 'MODE': {
        const n = parseInt(rest, 10);
        if (!Number.isNaN(n)) { this.vduBytes([22, n & 255]); return; }
        const mx = /X(\d+)/i.exec(rest), my = /Y(\d+)/i.exec(rest), mc = /C(\d+)/i.exec(rest);
        const x = mx ? +mx[1] : 640, y = my ? +my[1] : 480, c = mc ? +mc[1] : 256;
        const l2 = c <= 2 ? 0 : c <= 4 ? 1 : c <= 16 ? 2 : 3;
        const blk = this.scratchAlloc(32);
        this.mem.wr32(blk, 1); this.mem.wr32(blk + 4, x); this.mem.wr32(blk + 8, y); this.mem.wr32(blk + 12, l2);
        this.setModeFromSelector(blk);
        return;
      }
      case 'CAT': case '.': case 'EX': case 'INFO': case 'FILEINFO': return this.cmdCat(rest);
      case 'DIR': case 'CDIR': case 'BACK': case 'URD': case 'LIB': case 'MOUNT': case 'DRIVE': case 'NODIR':
        if (un === 'CDIR' && this.fs && this.fs.mkdir) return this.fs.mkdir(this.gstrans(rest));
        if (un === 'DIR' && this.fs && this.fs.setDir) return this.fs.setDir(this.gstrans(rest));
        return;
      case 'DELETE': case 'REMOVE': case 'WIPE':
        if (this.fs && this.fs.delete) { const ok = await this.fs.delete(this.gstrans(args()[0] || '')); if (!ok && un === 'DELETE') throw new BasicError(0xD6, `File '${args()[0]}' not found`); }
        return;
      case 'RENAME': if (this.fs && this.fs.rename) { const [a, b] = args(); await this.fs.rename(this.gstrans(a), this.gstrans(b)); } return;
      case 'COPY': if (this.fs && this.fs.readFile) { const [a, b] = args(); const f = await this.readFileBytes(a); await this.fs.writeFile(this.gstrans(b), f.data, f.type); } return;
      case 'SETTYPE': return;
      case 'ACCESS': return;
      case 'TYPE': case 'PRINT': case 'LIST': {
        const f = await this.readFileBytes(args()[0] || '');
        for (const c of f.data) { if (c === 10) this.newLine(); else if (c !== 13) this.writeC(c); }
        return;
      }
      case 'DUMP': {
        const f = await this.readFileBytes(args()[0] || '');
        for (let o = 0; o < f.data.length; o += 16) {
          let s = o.toString(16).toUpperCase().padStart(6, '0') + ' : ';
          const row = f.data.slice(o, o + 16);
          s += Array.from(row, (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(48, ' ') + ' : ';
          s += Array.from(row, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
          this.writeStr(s); this.newLine();
        }
        return;
      }
      case 'SAVE': {
        const [fn, s, e] = args();
        const a0 = parseInt(s.replace('&', ''), 16); let a1;
        if (e.startsWith('+')) a1 = a0 + parseInt(e.slice(1).replace('&', ''), 16); else a1 = parseInt(e.replace('&', ''), 16);
        await this.fs.writeFile(this.gstrans(fn), this.mem.rdBytes(a0, a1 - a0), 0xFFD); return;
      }
      case 'LOAD': {
        const [fn, s] = args();
        const f = await this.readFileBytes(fn);
        const a0 = s ? parseInt(s.replace('&', ''), 16) : 0x8000;
        this.mem.wrBytes(a0, f.data); return;
      }
      case 'RUN': case 'CHAIN': return this.runFile(args()[0], rest);
      case 'SCREENSAVE': case 'SCREENLOAD': return;
      case 'CONFIGURE': case 'STATUS': return;
      case 'MODULES': case 'RMENSURE': case 'RMLOAD': case 'RMRUN': case 'RMKILL': case 'RMREINIT': return;
      case 'ERROR': { const mm = /^(\S+)\s+(.*)$/.exec(rest); throw new BasicError(mm ? parseInt(mm[1], 10) : 0, mm ? mm[2] : rest); }
      case 'IF': return;
      case 'OBEY': return;
      case 'SHUTDOWN': return;
      case 'SHADOW': return;
      case 'IGNORE': return;
      case 'CACHE': return;
    }
    if (un === 'VOLUME' || un === 'SPEAKER' || un === 'STEREO' || un === 'TUNING' || un === 'VOICES' || un === 'CHANNELVOICE' || un === 'QSOUND' || un === 'AUDIO') return;
    // try to run as a file (e.g. *MyProg)
    if (this.fs && this.fs.readFile) {
      const f = await this.fs.readFile(this.gstrans(name));
      if (f) return this.runFile(name, rest);
    }
    throw new BasicError(0xD6, `File '${name}' not found`);
  }
  async runFile(name, rest) {
    const f = await this.readFileBytes(name);
    if (f.type === 0xFFB || parseProgram(f.data)) { await this.chain(name); return; }
    throw new BasicError(0xFE, `Cannot run '${name}'`);
  }
  async cmdCat(dir) {
    if (!this.fs || !this.fs.list) { this.writeStr('No catalogue available'); this.newLine(); return; }
    const items = await this.fs.list(this.gstrans(dir || ''));
    let col = 0;
    for (const it of items || []) {
      const s = (it.name || String(it)).padEnd(20, ' ');
      if (col + s.length > 80) { this.newLine(); col = 0; }
      this.writeStr(s); col += s.length;
    }
    this.newLine();
  }
  evalOsExpr(s) { const n = parseInt(s, 10); return Number.isNaN(n) ? s : n; }

  // OS_File etc (programs using SYS "OS_File") -------------------------------------
  async osFile(r, ctx) {
    const reason = r[0] & 255;
    const name = this.gstrans(this.mem.rdStrCtrl(r[1] >>> 0));
    const fs = this.fs;
    switch (reason) {
      case 10: case 0: { // save block
        const a = r[4] >>> 0, e = r[5] >>> 0;
        const type = reason === 10 ? r[2] & 0xFFF : 0xFFD;
        await fs.writeFile(name, this.mem.rdBytes(a, e - a), type);
        return;
      }
      case 5: case 13: case 17: case 20: case 21: case 23: { // read catalogue info
        const f = fs.stat ? await fs.stat(name) : await fs.readFile(name).then((x) => x && { type: 'file', filetype: x.type, length: (x.data || x).length });
        if (!f) { r[0] = 0; return; }
        if (f.type === 'dir') { r[0] = 2; r[4] = 0; return; }
        const ft = f.filetype ?? 0xFFD;
        r[0] = 1; r[2] = (0xFFF00000 | (ft << 8)) | 0; r[3] = 0; r[4] = f.length | 0; r[5] = 3; r[6] = ft;
        return;
      }
      case 6: if (fs.delete) await fs.delete(name); return;
      case 8: if (fs.mkdir) await fs.mkdir(name); return;
      case 18: return; // set filetype
      case 255: case 12: case 14: case 16: {
        const f = await this.readFileBytes(name);
        let addr = r[2] >>> 0;
        if ((r[3] & 255) !== 0 && reason === 255) addr = 0x8000;
        this.mem.wrBytes(addr, f.data);
        r[0] = 1; r[4] = f.data.length; r[6] = f.type;
        return;
      }
      default: return;
    }
  }
  async osFind(r) {
    const reason = r[0] & 0xFF;
    if ((reason & 0xC0) === 0) { await this.files.close(r[1]); return; }
    const name = this.mem.rdStrCtrl(r[1] >>> 0);
    const h = await this.files.open(name, reason & 0xC0);
    if (!h && (reason & 0x08)) throw new BasicError(0xD6, `File '${name}' not found`);
    r[0] = h;
  }
  osArgs(r) {
    const F = this.files; const h = r[1];
    switch (r[0]) {
      case 0: if (h === 0) { r[0] = 9; return; } r[2] = F.ptr(h); return;
      case 1: F.setPtr(h, r[2]); return;
      case 2: r[2] = F.ext(h); return;
      case 3: F.setExt(h, r[2]); return;
      case 4: r[2] = Math.max(F.ext(h), 256); return;
      case 5: r[2] = F.eof(h) ? -1 : 0; return;
      default: return;
    }
  }
  osGBPB(r, ctx) {
    const F = this.files; const reason = r[0] & 255;
    if (reason >= 1 && reason <= 4) {
      const h = r[1]; let a = r[2] >>> 0; let n = r[3];
      if (reason === 1 || reason === 3) F.setPtr(h, r[4]);
      if (reason <= 2) { while (n > 0) { F.bput(h, this.mem.rd8(a++)); n--; } }
      else { while (n > 0) { const c = F.bgetRaw(h); if (c < 0) break; this.mem.wr8(a++, c); n--; } if (n) ctx.flags |= C_FLAG; }
      r[2] = a; r[3] = n; r[4] = F.ptr(h);
      return;
    }
    if (reason >= 9 && reason <= 12) {
      // directory enumeration
      const dir = this.gstrans(this.mem.rdStrCtrl(r[1] >>> 0));
      if (!this.fs || !this.fs.list) { r[3] = 0; r[4] = -1; return; }
      return this.fs.list(dir).then((items) => {
        let off = r[4]; let buf = r[2] >>> 0; let count = 0; const max = r[3];
        items = items || [];
        while (off < items.length && count < max) {
          const it = items[off];
          const nm = it.name || String(it);
          if (reason === 9) { this.mem.wrStr0(buf, nm); buf += nm.length + 1; }
          else {
            const ft = it.filetype ?? 0xFFD;
            this.mem.wr32(buf, (0xFFF00000 | (ft << 8)) | 0); this.mem.wr32(buf + 4, 0); this.mem.wr32(buf + 8, it.length | 0); this.mem.wr32(buf + 12, 3);
            this.mem.wr32(buf + 16, it.type === 'dir' ? 2 : 1);
            let p = buf + 20;
            if (reason === 12) { this.mem.wr32(p, 0); this.mem.wr32(p + 4, 0); this.mem.wr8(p + 8, 0); this.mem.wr32(p + 12, ft); p += 16; }
            this.mem.wrStr0(p, nm); buf = (p + nm.length + 1 + 3) & ~3;
          }
          off++; count++;
        }
        r[3] = count; r[4] = off >= items.length ? -1 : off;
      });
    }
  }
  osFSControl(r) {
    const reason = r[0] & 255;
    if (reason === 37) { // canonicalise path
      const s = this.gstrans(this.mem.rdStrCtrl(r[1] >>> 0));
      if (r[2]) { this.mem.wrStr0(r[2] >>> 0, s.slice(0, Math.max(0, r[5] - 1))); }
      r[5] = (r[5] | 0) - s.length - 1;
      return;
    }
    if (reason === 18) { r[2] = 0xFFF; return; }
  }
  osReadArgs(r) {
    // minimal: split the input string on spaces/commas into the output vector
    const s = this.mem.rdStrCtrl(r[1] >>> 0);
    const parts = s.split(/[\s]+/).filter(Boolean);
    let p = r[2] >>> 0; const vec = p;
    const nKeys = (this.mem.rdStrCtrl(r[0] >>> 0).split(',')).length;
    let strp = vec + nKeys * 4;
    for (let i = 0; i < nKeys; i++) {
      if (i < parts.length) { this.mem.wr32(vec + i * 4, strp); this.mem.wrStr0(strp, parts[i]); strp += parts[i].length + 1; } else this.mem.wr32(vec + i * 4, 0);
    }
    r[3] = (r[3] | 0) - (strp - vec);
  }
  osEvaluate(r) {
    const s = this.gstrans(this.mem.rdStrCtrl(r[0] >>> 0));
    const n = Number(s);
    if (!Number.isNaN(n)) { r[1] = 0; r[2] = n | 0; return; }
    r[1] = 1; r[2] = s.length;
  }
  osHeap(r) {
    // Simple heap: header at r1: magic 'Heap', free ptr, base, end. Blocks: size word before data.
    const M = this.mem; const h = r[1] >>> 0;
    const MAGIC = 0x70616548;
    switch (r[0]) {
      case 0: M.wr32(h, MAGIC); M.wr32(h + 4, 16); M.wr32(h + 8, 16); M.wr32(h + 12, r[3]); return; // init
      case 1: { if (M.rd32(h) !== MAGIC) throw new BasicError(0x1C2, 'Heap not initialised'); const end = M.rd32(h + 12); r[2] = end - M.rd32(h + 8); r[3] = end - M.rd32(h + 8); return; }
      case 2: { // claim
        if (M.rd32(h) !== MAGIC) throw new BasicError(0x1C2, 'Heap not initialised');
        const size = ((r[3] + 4 + 7) & ~7);
        const top = M.rd32(h + 8); const end = M.rd32(h + 12);
        // free list search
        let prev = h + 4; let f = M.rd32(prev) === 16 ? 0 : M.rd32(prev);
        void f;
        if (top + size > end) throw new BasicError(0x184, 'Heap full');
        M.wr32(h + top, size); M.wr32(h + 8, top + size);
        r[2] = h + top + 4; return;
      }
      case 3: return; // free (not reclaimed)
      case 4: { const p = r[2] >>> 0; const old = M.rd32(p - 4); const ns = ((r[3] + old - 4 + 4 + 7) & ~7); const top = M.rd32(h + 8); if (h + top === p - 4 + old) { M.wr32(p - 4, ns); M.wr32(h + 8, top - old + ns); r[2] = p; return; } const q = this.heapClaim(h, ns - 4); M.wrBytes(q, M.rdBytes(p, old - 4)); r[2] = q; return; }
      case 5: M.wr32(h + 12, M.rd32(h + 12) + r[3]); return;
      case 6: r[3] = M.rd32((r[2] >>> 0) - 4) - 4; return;
      default: return;
    }
  }
  heapClaim(h, n) { const r = [2, h, 0, n]; this.osHeap(r); return r[2]; }
  osModule(r) {
    switch (r[0]) {
      case 6: { const n = (r[3] + 3) & ~3; const p = this.sysAlloc(n + 4); this.mem.wr32(p, n); r[2] = p + 4; return; }
      case 7: return;
      case 13: { const n = (r[3] + 3) & ~3; const p = this.sysAlloc(n + 4); this.mem.wr32(p, n); r[2] = p + 4; return; }
      case 18: case 1: case 3: case 4: return;
      default: return;
    }
  }
}

// ---------------------------------------------------------------------------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_L = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_L = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function ordinal(n) { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return s[(v - 20) % 10] || s[v] || s[0]; }
function dayOfYear(d) { return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000); }
function weekNo(d) { return Math.ceil(dayOfYear(d) / 7); }
function containsBytes(hay, needle) {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return needle.length === 0;
}
function finishBody(body) {
  let end = body.length;
  while (end > 0 && body[end - 1] === 32) end--;
  const b = body.slice(0, end);
  let k = 0; while (b[k] === 32) k++;
  if (b[k] === T.ELSE) b[k] = T.ELSE2;
  return b;
}
function nowMs() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }

let yieldChannel = null;
/** Yield to the host event loop (fast: MessageChannel in browsers, setImmediate in node) */
export function yieldHost() {
  if (typeof setImmediate === 'function') return new Promise((r) => setImmediate(r));
  if (typeof MessageChannel !== 'undefined') {
    if (!yieldChannel) {
      yieldChannel = new MessageChannel();
      yieldChannel.q = [];
      yieldChannel.port1.onmessage = () => { const f = yieldChannel.q.shift(); if (f) f(); };
    }
    return new Promise((r) => { yieldChannel.q.push(r); yieldChannel.port2.postMessage(0); });
  }
  return new Promise((r) => setTimeout(r, 0));
}
