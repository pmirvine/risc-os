// OSCLI: the * command interpreter, command registry, Obey files, aliases, and the F12
// command line (the desktop scrolls up and a "*" prompt appears at the bottom of the screen).
//
//   cli.register('Hello', { syntax: 'Syntax: *Hello [<name>]', help: 'Says hello',
//                           run: async (args, ctx) => ctx.out.writeln('Hello ' + args.join(' ')) });
//   await cli.run('Cat ADFS::HardDisc4.$', { out })   // out: {write(s), writeln(s)}

import { vfs, FT_UNTYPED } from './vfs.js';
import { sysvars } from './sysvars.js';
import { typeName, hex3 } from './filetypes.js';
import { os } from './os.js';
import { TextConsole, loadSystemFont } from './console.js';
import { wimp } from './wimp.js';
import { decodeLatin1 } from './charset.js';
import { findNative, noNative, EXEC_TYPES } from './native.js';

export class CLIError extends Error { constructor(m, n = 0) { super(m); this.errnum = n; this.riscos = true; } }
/** Thrown by *Obey with no file name inside an Obey file: ends that Obey file (the "BootEnd" / "RMEnsure … Obey" idiom). */
export class ObeyEnd extends Error { constructor() { super('Obey'); this.obeyEnd = true; } }

const nullOut = { write() {}, writeln() {} };

/** Split a command tail into arguments, honouring "quotes". */
export function splitArgs(s) {
  const out = [];
  let cur = '', q = false, any = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') { if (q && s[i + 1] === '"') { cur += '"'; i++; continue; } q = !q; any = true; continue; }
    if (!q && (c === ' ' || c === '\t')) { if (cur || any) out.push(cur); cur = ''; any = false; continue; }
    cur += c;
  }
  if (cur || any) out.push(cur);
  return out;
}

export class OSCLI {
  constructor() {
    this.commands = new Map();   // lcname -> def
    this.history = [];
    this.active = false;         // F12 command line active
  }

  register(name, def) {
    this.commands.set(name.toLowerCase(), { name, ...def });
  }
  unregister(name) { this.commands.delete(name.toLowerCase()); }

  /** Find a command by name or '.'-abbreviation. */
  find(name) {
    const l = name.toLowerCase();
    if (this.commands.has(l)) return this.commands.get(l);
    if (l.endsWith('.')) {
      const p = l.slice(0, -1);
      if (p === '') return this.commands.get('cat');
      for (const [k, v] of this.commands) if (k.startsWith(p)) return v;
    }
    return null;
  }

  /**
   * Execute a command line. ctx: {out, env ({'%0'..}), depth}
   * Throws CLIError on failure.
   */
  async run(line, ctx = {}) {
    const out = ctx.out ?? this.desktopOut();
    const c = { ...ctx, out, cli: this, depth: (ctx.depth ?? 0) + 1 };
    if (c.depth > 32) throw new CLIError('Alias or Obey nesting too deep');
    let s = String(line ?? '');
    s = s.replace(/^[\s*]+/, '');
    if (!s || s.startsWith('|')) return;
    // strip trailing control chars
    s = s.replace(/[\r\n]+$/, '');
    if (s.startsWith('/')) s = 'Run ' + s.slice(1);
    // "-fs-command": run with a temporary filing system (e.g. !HForm's "-ADFS-%DISMOUNT :4"); single FS model
    const tmpFS = /^-([A-Za-z]+)-(\S.*)$/.exec(s);
    if (tmpFS) s = tmpFS[2];
    let noAlias = false;
    if (s.startsWith('%')) { noAlias = true; s = s.slice(1); }
    // command name
    let m = /^([^\s]+)\s*(.*)$/.exec(s);
    let name = m[1], tail = m[2] ?? '';
    // "*." abbreviations like "cat.fred" are unusual; treat "."-terminated names
    const dot = name.indexOf('.');
    if (dot > 0 && dot < name.length - 1 && this.find(name.slice(0, dot + 1)) && !this.commands.has(name.toLowerCase())) {
      tail = name.slice(dot + 1) + (tail ? ' ' + tail : ''); name = name.slice(0, dot + 1);
    }
    if (c.safe && /^(run|basic|wimptask|desktop|filer_run|filer_opendir|taskwindow|shellcli|chain|go|@runtype_\w+)$/i.test(name)) return;
    // FS prefix "adfs:cat" -> just run the command (single FS model)
    const fsm = /^(adfs|ram|resources):(.+)$/i.exec(name);
    if (fsm && this.find(fsm[2])) name = fsm[2];
    // aliases
    if (!noAlias) {
      const alias = sysvars.get('Alias$' + name);
      if (alias != null) {
        const args = splitArgs(tail);
        const expanded = alias.replace(/%\*(\d)/g, (_, n) => args.slice(+n).join(' ')).replace(/%(\d)/g, (_, n) => args[+n] ?? '');
        for (const part of expanded.split(/\r|\n/)) await this.run(part, { ...c, depth: c.depth });
        return;
      }
    }
    const cmd = this.find(name);
    if (cmd) {
      const args = cmd.noSplit ? [tail] : splitArgs(tail);
      if (cmd.min != null && args.length < cmd.min) throw new CLIError(cmd.syntax ?? 'Syntax error', 0xDC);
      if (cmd.max != null && args.length > cmd.max) throw new CLIError(cmd.syntax ?? 'Syntax error', 0xDC);
      return cmd.run(args, { ...c, raw: tail, name: cmd.name });
    }
    // Not a command: try to run it as a file via Run$Path
    const path = this.findRunnable(name);
    if (path) return this.runFile(path, tail, c);
    throw new CLIError('File \'' + name + '\' not found', 0x214);
  }

  /** Locate a file for *Run using Run$Path (",%." by default). */
  findRunnable(name) {
    if (/[:$&@%^]/.test(name) || name.includes('.')) {
      if (vfs.exists(name)) return vfs.canonical(name);
    }
    const rp = (sysvars.get('Run$Path') ?? ',%.').split(',');
    for (const pre of rp) {
      const cand = pre + name;
      try { if (vfs.exists(cand)) return vfs.canonical(cand); } catch { /* */ }
    }
    try { if (vfs.exists(name)) return vfs.canonical(name); } catch { /* */ }
    return null;
  }

  /** *Run semantics for a resolved path. */
  async runFile(path, tail, ctx) {
    const st = vfs.stat(path);
    if (!st) throw new CLIError(`File '${path}' not found`, 0x214);
    // application registry (JS apps): app dir or its !Run
    if (os.apps?.runPath(st.path, tail)) return;
    if (st.type === 'dir') {
      if (st.isApp) {
        const r = st.path + '.!Run';
        if (vfs.exists(r)) return this.runFile(vfs.canonical(r), tail, ctx);
        throw new CLIError(`File '${st.name}.!Run' not found`, 0x214);
      }
      throw new CLIError(`'${st.name}' is a directory`, 0);
    }
    if (st.filetype === FT_UNTYPED) throw new CLIError(`File '${st.name}' cannot be executed`, 0);
    // ARM code (Absolute / Module / Utility): a JavaScript stand-in from the native registry (native.js)
    const nat = EXEC_TYPES.has(st.filetype) ? findNative(st.path) : null;
    if (nat) return nat.run?.(splitArgs(tail ?? ''), { ...ctx, cli: this, out: ctx?.out ?? this.desktopOut(), path: st.path, tail: tail ?? '' });
    if (EXEC_TYPES.has(st.filetype) && (st.placeholder || !sysvars.get('Alias$@RunType_' + hex3(st.filetype)))) {
      if (st.filetype === 0xFFA) return;   // a module is RMRun: loaded silently, like *RMLoad (a no-op here)
      throw noNative(st.name);
    }
    const alias = sysvars.get('Alias$@RunType_' + hex3(st.filetype));
    if (alias == null) throw new CLIError(`File type '${typeName(st.filetype)}' has no run action`, 0x118);
    return this.run(`@RunType_${hex3(st.filetype)} ${st.path}${tail ? ' ' + tail : ''}`, ctx);
  }

  /** Run an Obey file: each line through OSCLI with %0-%9 parameters and Obey$Dir set. */
  async obey(path, opts = {}) {
    const st = vfs.stat(path);
    if (!st) throw new CLIError(`File '${path}' not found`, 0x214);
    const text = decodeLatin1(await vfs.readFile(st.path));
    const args = splitArgs(opts.args ?? '');
    const prevDir = sysvars.get('Obey$Dir');
    sysvars.set('Obey$Dir', vfs.parent(st.path));
    try {
      for (let line of text.split(/\r?\n|\r/)) {
        line = line.replace(/%\*(\d)/g, (_, n) => args.slice(+n).join(' ')).replace(/%(\d)/g, (_, n) => args[+n] ?? '');
        if (!line.trim() || /^\s*\|/.test(line)) continue;
        // "safe" mode (Filer_Boot of applications): don't start programs, only set things up
        if (opts.safe && /^\s*[*%]*\s*(run|\/|basic|wimptask|desktop|filer_run|filer_opendir|taskwindow|shellcli|chain|go)\b/i.test(line)) continue;
        try {
          await this.run(line, { out: opts.out ?? (opts.quiet ? nullOut : undefined), depth: opts.depth, safe: opts.safe, inObey: true });
        } catch (e) {
          if (e?.obeyEnd) break;
          if (opts.quiet) continue;
          throw e;
        }
      }
    } finally {
      if (prevDir != null) sysvars.set('Obey$Dir', prevDir); else sysvars.unset('Obey$Dir');
    }
  }

  /** Output stream used for commands run from the desktop: collects text into a *Command window. */
  desktopOut() {
    if (this.active && this.console) return this.console;
    if (this._dout) return this._dout;
    let buf = '';
    const self = this;
    const flush = () => {
      self._dout = null;
      if (buf.trim()) showCommandWindow(buf);
    };
    this._dout = {
      write(s) { buf += s; clearTimeout(this._t); this._t = setTimeout(flush, 50); },
      writeln(s = '') { this.write(s + '\n'); },
    };
    return this._dout;
  }

  /**
   * Take over the whole screen (single-tasking programs: BASIC, full-screen games, *commands
   * that change mode). Returns {el, width, height, release()}. While acquired, key presses go to
   * opts.onKey(domEvent, {code, char}) and the desktop is hidden underneath.
   */
  acquireScreen(opts = {}) {
    const el = document.createElement('div');
    el.className = 'fullscreen-program';
    el.style.cssText = `position:absolute;left:0;top:0;width:100%;height:100%;background:${opts.background ?? '#000'};z-index:400000;overflow:hidden`;
    wimp.screen.appendChild(el);
    wimp.menus?.close();
    const prev = wimp.fullscreenHandler;
    wimp.fullscreenHandler = (e, k) => { opts.onKey?.(e, k); return true; };
    let released = false;
    return {
      el, width: wimp.width, height: wimp.height,
      release: () => {
        if (released) return;
        released = true;
        el.remove();
        wimp.fullscreenHandler = prev;
      },
    };
  }

  // ------------------------------------------------------------------ F12 command line
  /** Open the F12 command line. opts.exited: the desktop was left (Task Manager Exit) - only *Desktop returns. */
  async open(opts = {}) {
    this.exited = !!opts.exited;
    if (this.active) return;
    await loadSystemFont();
    this.active = true;
    wimp.menus?.close();
    const W = wimp.width, H = wimp.height;
    const cols = Math.floor(W / 8), rows = Math.floor(H / 8);
    const con = this.console = new TextConsole({ cols, rows, charW: 8, charH: 8 });
    const holder = this.holder = document.createElement('div');
    holder.className = 'cmdline';
    holder.style.cssText = `position:absolute;left:0;bottom:0;width:100%;height:0;overflow:hidden;z-index:300000;background:#000`;
    con.canvas.style.cssText = 'position:absolute;left:0;bottom:0;image-rendering:pixelated';
    holder.appendChild(con.canvas);
    wimp.screen.appendChild(holder);
    this._shift = 0;
    con.onNewline = () => this._updateShift();
    // start at the bottom line
    con.y = rows - 1;
    con.lines = 1;
    this._updateShift();
    this._prompt();
  }
  _updateShift() {
    const h = this.exited ? wimp.height : Math.min(this.console.lines * 8, wimp.height);
    this.holder.style.height = h + 'px';
    for (const k of ['windows', 'menus']) wimp.layers[k].style.transform = `translateY(-${h}px)`;
    this._shift = h;
  }
  close() {
    if (!this.active) return;
    this.active = false;
    this.exited = false;
    this.console.destroy();
    this.holder.remove();
    this.console = null;
    for (const k of ['windows', 'menus']) wimp.layers[k].style.transform = '';
    wimp.emit('cliclosed', {});
  }
  _prompt() { this.line = ''; this.pos = 0; this.hIndex = this.history.length; this.console.write('*'); }

  /** Key handling while the F12 command line is active. */
  key(e, k) {
    if (this._busy) { if (k.code === 27) this._escape = true; return; }
    if (this.keyHandler) { this.keyHandler(e, k); return; }
    const con = this.console;
    const redraw = (old) => {
      con.write('\b'.repeat(old.length) + this.line + (old.length > this.line.length ? ' '.repeat(old.length - this.line.length) + '\b'.repeat(old.length - this.line.length) : ''));
    };
    const setLine = (l) => { const old = this.line; this.line = l; redraw(old); };
    switch (k.code) {
      case 13: {
        const l = this.line;
        con.newline();
        if (!l.trim()) { if (this.exited) { this._prompt(); return; } this.close(); return; }
        this.history.push(l);
        this._exec(l);
        return;
      }
      case 27: con.newline(); con.writeln('Escape'); this._prompt(); return;
      case 8: case 127:
        if (this.line.length) setLine(this.line.slice(0, -1));
        return;
      case 21: setLine(''); return;
      case 0x18F: if (this.hIndex > 0) { this.hIndex--; setLine(this.history[this.hIndex]); } return;
      case 0x18E: if (this.hIndex < this.history.length) { this.hIndex++; setLine(this.history[this.hIndex] ?? ''); } return;
      default:
        if (k.char && k.code >= 32 && k.code < 256 && !e.ctrlKey && !e.metaKey) { this.line += k.char; con.write(k.char); }
    }
  }

  async _exec(l) {
    this._busy = true;
    this._escape = false;
    try {
      await this.run(l, { out: this.console });
    } catch (e) {
      if (!this.console) return;
      this.console.writeln(e.message ?? String(e));
    } finally {
      this._busy = false;
    }
    if (this.active && !this.keyHandler) this._prompt();
  }
}

/** The "*Command" window used to show text output from commands run in the desktop. */
function showCommandWindow(text) {
  const lines = text.replace(/\n$/, '').split('\n');
  const cols = Math.min(100, Math.max(40, ...lines.map((l) => l.length)) + 2);
  const rows = Math.min(40, lines.length + 3);
  loadSystemFont().then(() => {
    const con = new TextConsole({ cols, rows, charW: 8, charH: 16, fg: '#000000', bg: '#ffffff' });
    con.cursorOn = false;
    for (const l of lines) con.writeln(l);
    con.newline();
    con.write('Press SPACE or click mouse to continue');
    const w = wimp.createWindow(wimp.systemTask, {
      title: '*Command', flags: { title: true, moveable: true },
      colours: { titleFg: 7, titleBg: 12, workFg: 7, workBg: 0, titleFocus: 12 },
      extent: { x0: 0, y0: 0, x1: cols * 8, y1: rows * 16 }, w: cols * 8, h: rows * 16, workButton: 3,
      x: Math.round((wimp.width - cols * 8) / 2), y: Math.max(40, Math.round((wimp.height - rows * 16) / 2)),
    });
    w.work.appendChild(con.canvas);
    const close = () => { con.destroy(); w.delete(); };
    w.on('click', close);
    w.on('key', () => { close(); return true; });
    w.open({ behind: 'top' });
    wimp.setCaret(w);
  });
}

export const cli = new OSCLI();
