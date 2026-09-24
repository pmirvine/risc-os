// The child task of a task window: a ShellCLI-style "*" prompt (OS_ReadLine with echo) that runs
// commands through the core OSCLI, and BBC BASIC in text mode (no VDU: every byte BASIC writes
// goes to the task window, like the TaskWindow module's WrchV redirection).
//
//   const sh = new TaskShell({ output(str), onDeath() });
//   sh.start(command, { quit })   sh.key(code)   sh.escape()   sh.kill()   sh.suspend(on)
//
// Commands are run as os.cli.run(line, { out, tw: shell }); the BASIC hook (src/core/basicwimp)
// hands *BASIC (and BASIC files, via Alias$@RunType_FFB) back to shell.runBasic().

import { os } from '../../core/os.js';
import { sysvars } from '../../core/sysvars.js';
import { basicFS } from '../../core/basichost.js';

class Killed extends Error {}

function sysvarMap() {
  return {
    get: (k) => sysvars.get(k) ?? undefined,
    set(k, v) { sysvars.set(k, String(v)); return this; },
    has: (k) => sysvars.has(k),
    delete: (k) => sysvars.unset(k) > 0,
  };
}

export function parseBasicArgs(argv = []) {
  let mode = 'interactive', file = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (/^-(quit|chain|load)$/i.test(a)) { mode = a.slice(1).toLowerCase(); file = argv[++i] ?? null; }
    else if (/^-help$/i.test(a)) mode = 'help';
    else if (!file) { file = a; mode = 'chain'; }
  }
  return { mode, file };
}

export class TaskShell {
  constructor({ output, onDeath }) {
    this.output = output;            // (string of Latin-1 bytes) => void
    this.onDeath = onDeath;          // () => void when the task ends
    this.keys = [];                  // pending input codes
    this.waiter = null;
    this.alive = false;
    this.suspended = false;
    this.escapeFlag = false;
    this.machine = null;             // BASIC machine while BASIC runs (keys go there)
    this.out = {
      cols: 80,
      write: (s) => this.output(String(s)),
      writeln: (s = '') => this.output(String(s) + '\n'),
    };
  }

  // ------------------------------------------------------------------ input
  /** A key typed in the task window (RISC OS character code 0-255). */
  key(code) {
    if (!this.alive) return;
    if (code === 27) { this.escape(); return; }
    if (this.machine) { this.machine.keyPress(code); return; }
    this.keys.push(code);
    this._wake();
  }
  escape() {
    if (this.machine) { this.machine.escape(); return; }
    this.escapeFlag = true;
    this._wake();
  }
  _wake() { const w = this.waiter; this.waiter = null; w?.(); }
  async _readKey() {
    for (;;) {
      if (!this.alive) throw new Killed();
      if (this.escapeFlag) { this.escapeFlag = false; const e = new Error('Escape'); e.escape = true; throw e; }
      if (this.keys.length && !this.suspended) return this.keys.shift();
      await new Promise((r) => { this.waiter = r; });
    }
  }

  /** OS_ReadLine: echoes printable characters, Delete/Backspace, Ctrl-U; Return ends. */
  async readLine(max = 255) {
    let s = '';
    for (;;) {
      const k = await this._readKey();
      if (k === 13 || k === 10) { this.output('\r\n'); return s; }
      if (k === 8 || k === 127) { if (s.length) { s = s.slice(0, -1); this.output('\x7f'); } continue; }
      if (k === 21) { while (s.length) { s = s.slice(0, -1); this.output('\x7f'); } continue; }
      if (k < 32) continue;
      if (s.length >= max) { this.output('\x07'); continue; }
      s += String.fromCharCode(k);
      this.output(String.fromCharCode(k));
    }
  }

  // ------------------------------------------------------------------ life cycle
  /** Start the task: run `command` (if any) then, unless quit, the "*" prompt loop. */
  async start(command = '', { quit = false, keepAlive = () => true } = {}) {
    this.alive = true;
    try {
      if (command) {
        await this.exec(command);
        if (quit || !keepAlive()) return;
      }
      for (;;) {
        if (!this.alive) return;
        this.output(sysvars.get('Cli$Prompt') ?? '*');
        let line;
        try { line = await this.readLine(); } catch (e) {
          if (e instanceof Killed) return;
          if (e.escape) { this.output('\r\nEscape\r\n'); continue; }
          throw e;
        }
        await this.exec(line);
      }
    } catch (e) {
      if (!(e instanceof Killed)) console.error(e);
    } finally {
      this._die();
    }
  }

  /** Run one command line, printing errors like ShellCLI. */
  async exec(line) {
    if (!line.trim()) return;
    this.escapeFlag = false;
    try {
      await os.cli.run(line, { out: this.out, tw: this });
    } catch (e) {
      if (e instanceof Killed || !this.alive) return;
      this.output((e.escape ? 'Escape' : (e.message ?? String(e))) + '\r\n');
    }
  }

  kill() {
    if (!this.alive) return;
    this.alive = false;
    const m = this.machine;
    if (m) {
      m.interp.quit(0);
      for (const w of m.keyWaiters.splice(0)) w.resolve(13);
    }
    this._wake();
    this._die();
  }
  _die() {
    if (this._dead) return;
    this._dead = true;
    this.alive = false;
    this.onDeath?.();
  }

  /** Suspend / resume: input is held and a running BASIC program is paused. */
  suspend(on) {
    this.suspended = on;
    if (!on) { const r = this._resume; this._resume = null; r?.(); this._wake(); }
  }

  // ------------------------------------------------------------------ BASIC in the task window
  async runBasic(argv = [], ctx = {}) {
    const { BasicMachine } = await import('../../basic/machine.js');
    const { mode, file } = parseBasicArgs(argv);
    const fs = basicFS();
    const shell = this;
    const outer = this.machine;
    let done;
    const finished = new Promise((r) => { done = r; });
    const m = new BasicMachine({
      fs, sysvars: sysvarMap(),
      onOutput: (c) => this.output(String.fromCharCode(c)),
      oscli: async (cmd) => {
        const name = cmd.replace(/^[\s*]+/, '').split(/\s/)[0].toLowerCase();
        if (/^(fx\d*|key\d*|tv|opt|spool|spoolon|exec|quit)$/.test(name)) return false;
        if (!os.cli.find(name) && sysvars.get('Alias$' + name) == null && !os.cli.findRunnable(name)) return false;
        try { await os.cli.run(cmd, { out: shell.out, tw: shell }); } catch (e) { throw Object.assign(new Error(e.message), { errnum: e.errnum ?? 0 }); }
        return true;
      },
      onExit: () => done(),
    });
    // Suspend pauses the interpreter between slices
    const slice = m.slice.bind(m);
    m.slice = () => (shell.suspended ? new Promise((r) => { shell._resume = r; }).then(() => undefined) : slice());
    this.machine = m;
    try {
      if (mode === 'help') { m.printBanner(); return; }
      const run = (async () => {
        if (file && (mode === 'quit' || mode === 'chain')) {
          const f = await fs.readFile(file);
          if (!f) throw Object.assign(new Error(`File '${file}' not found`), { errnum: 0x214 });
          await m.load(f.data);
          await m.run();
          if (mode === 'quit' || !this.alive) return;
          await m.start({ banner: false });
        } else {
          if (file && mode === 'load') { const f = await fs.readFile(file); if (f) await m.load(f.data); }
          await m.start();
        }
      })();
      await Promise.race([run, finished]);
    } finally {
      this.machine = outer;
    }
  }
}
