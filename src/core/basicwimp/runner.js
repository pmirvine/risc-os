// Running a BASIC program from the desktop (double-click, *Run, an application's !Run), or in a window.
//
// The program starts "in the background" on its own BasicMachine with a DesktopVDU (a VDU the
// size of the desktop). What happens next depends on the program, as on RISC OS:
//   * it writes to the screen / reads the keyboard before calling Wimp_Initialise: it is a
//     single-tasking program. The screen is taken over (os.cli.acquireScreen) and the VDU shown
//     full screen (MODE changes are the program's own). When it ends: "Press SPACE or click
//     mouse to continue", then back to the desktop.
//   * it calls Wimp_Initialise: it becomes a desktop task (bridge.js). Output it writes to the
//     screen afterwards (e.g. an untrapped error) is collected and shown in the *Command window
//     when it ends, like the Wimp's command window.
//
// startBasicWindow() (and *BASIC -window) runs a program, or BASIC's ">" prompt, in a desktop window
// instead (a "graphics task window", as David Ruck's !GraphTask): the same BasicProcess with a
// WindowDisplay (display.js), its own task, multitasking. Any program can be switched between its
// window and the whole screen while it runs (Alt-Return, or fullScreen()).
//
// Every program's machine runs under the shared scheduler (scheduler.js): fair turns, a speed limit per
// program, and WAIT / *FX 19 on a steady 50Hz clock. See docs/CORE_API.md section 12 and docs/BASIC_WIMP.md.

import { os } from '../os.js';
import { wimp } from '../wimp.js';
import { sysvars } from '../sysvars.js';
import { basicFS } from '../basichost.js';
import { DesktopVDU } from './screen.js';
import { installServices } from './services.js';
import { WimpBridge, installWimpSwis } from './bridge.js';
import { installHardware } from './hardware.js';
import { FullScreenDisplay, WindowDisplay } from './display.js';
import { scheduler, vsync, speedOps } from './scheduler.js';

/** Parse *BASIC arguments: [-window] -quit/-chain/-load <file> [args] | <file> | -help */
export function parseBasicArgs(argv = []) {
  let mode = 'interactive', file = null, programArgs = '', window = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (/^-window$/i.test(a)) { window = true; continue; }
    if (/^-(quit|chain|load)$/i.test(a)) { mode = a.slice(1).toLowerCase(); file = argv[++i] ?? null; programArgs = argv.slice(i + 1).join(' '); break; }
    if (/^-help$/i.test(a)) { mode = 'help'; continue; }
    if (!file) { file = a; mode = 'chain'; programArgs = argv.slice(i + 1).join(' '); break; }
  }
  // (only spaces separate arguments: a hard space &A0 is part of a name, as in Video.HiRes.!Warning&A0)
  if (file && /[ \t]/.test(file.replace(/^[ \t]+|[ \t]+$/g, ''))) { const parts = file.replace(/^[ \t]+|[ \t]+$/g, '').split(/[ \t]+/); file = parts.shift(); programArgs = [parts.join(' '), programArgs].filter(Boolean).join(' '); }
  return { mode, file, programArgs, window };
}

let wimpSlotK = 640;            // last *WimpSlot -min/-max (K), used for the next program's HIMEM
export function noteWimpSlot(k) { if (k > 0) wimpSlotK = k; }

// number of parameter bytes after each VDU control code
const VDU_PARAMS = [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 5, 0, 0, 1, 9, 8, 5, 0, 0, 4, 4, 0, 2];

export const processes = new Set();

async function readProgram(file) {
  const f = await basicFS().readFile(file);
  if (!f) throw Object.assign(new Error(`File '${file}' not found`), { riscos: true, errnum: 0x214 });
  return f;
}

export async function runDesktopBasic(a, ctx = {}) {
  if (a.window) {
    const load = a.mode === 'load';
    await startBasicWindow({ file: a.file, args: a.programArgs, prompt: !a.file || load || a.mode === 'chain', run: !load, ctx });
    return;
  }
  const f = await readProgram(a.file);
  const proc = new BasicProcess(a, f.data, ctx);
  return proc.start();
}

/**
 * Run a BASIC program, or BASIC's ">" prompt, in a desktop window (see docs/CORE_API.md section 12).
 * Resolves, once the program has started, to its BasicProcess (the controller).
 *   o.file       program to run (a path), or o.program (tokenised bytes or text) with o.name
 *   o.args       its command line arguments (after the file name)
 *   o.prompt     true: BASIC's ">" prompt (after the program, if there is one); o.run false: only load it
 *   o.speed      'arm2' | 'arm3' | 'arm610' | 'strongarm' (default) | 'unlimited' | ops per second
 *   o.scale      1 (default) | 2 | 'fit'          o.mode   screen mode to start in (default 12)
 *   o.name       title / Task Manager name (default the file's leafname, or 'BASIC')
 *   o.open       'output' (default: when the program first writes to the screen or reads the keyboard,
 *                as a task window) | 'now'
 *   o.menuButton Menu clicks go to the program instead of o.onMenu
 *   o.onMenu(ev, proc)    Menu click over the window (ev: the Wimp click; proc.openMenu(menu, ev) opens one)
 *   o.onClose(proc, ev)   close icon: return true when handled (e.g. after asking); default: kill and close
 *   o.onEnd(proc, result) the program ended (result: BasicMachine.run()'s {reason, ...} or null)
 *   o.onState(proc)       title / state changed (running, suspended, finished, display, speed, scale)
 *   o.formatTitle({name, scale, state, finished}) -> the window title
 */
export async function startBasicWindow(o = {}) {
  let program = o.program ?? null;
  if (o.file && program == null) program = (await readProgram(o.file)).data;
  const args = { file: o.file ?? null, programArgs: o.args ?? '', mode: 'quit' };
  const proc = new BasicProcess(args, program, o.ctx ?? {}, { ...o, display: 'window' });
  await proc.start();
  return proc;
}

function sysvarMap() {
  return {
    get: (k) => sysvars.get(k) ?? undefined,
    set(k, v) { sysvars.set(k, String(v)); return this; },
    has: (k) => sysvars.has(k),
    delete: (k) => sysvars.unset(k) > 0,
    // iteration (wildcard lookups in OS_ReadVarVal)
    *[Symbol.iterator]() { for (const e of sysvars.list('*')) yield [e.name, sysvars.get(e.name) ?? '']; },
    *keys() { for (const e of sysvars.list('*')) yield e.name; },
  };
}

const leafName = (p) => String(p ?? '').replace(/^.*[.:]/, '') || 'BASIC';

export class BasicProcess {
  /**
   * args: {file, programArgs} (parseBasicArgs); program: tokenised bytes / text, or null for the prompt.
   * opts: see startBasicWindow (display: 'full' (default) | 'window').
   */
  constructor(args, program, ctx, opts = {}) {
    this.args = args;
    this.program = program;
    this.ctx = ctx;
    this.opts = opts;
    this.file = args.file;
    this.slotK = Math.max(32, wimpSlotK);
    this.himemK = Math.ceil(this.slotK / 32) * 32;          // whole 32K pages
    wimpSlotK = 640;
    this.windowed = opts.display === 'window';          // its home is a window (it goes back there from full screen)
    this.prompt = !!opts.prompt || program == null;
    this.name = opts.name ?? (this.file ? leafName(this.file) : 'BASIC');
    this.scale = opts.scale === 'fit' ? 'fit' : (+opts.scale || 1);
    this.menuButton = !!opts.menuButton;
    this._speed = opts.speed ?? (this.windowed ? 'strongarm' : 'unlimited');   // double-click: as fast as it goes, as before
    this.startMode = opts.mode ?? (this.windowed ? 12 : null);
    this.canWindow = true;        // false once it is a Wimp task
    this.display = null;          // FullScreenDisplay | WindowDisplay (display.js)
    this.windowDisplay = null;
    this.task = null;             // core task while it has a window (Task Manager entry)
    this.window = null;
    this.bridge = null;           // WimpBridge once Wimp_Initialise is called
    this.lateOutput = '';         // text written after Wimp_Initialise
    this.ended = false;
    this.suspended = false;
  }

  async start() {
    const [{ BasicMachine }, soundMod] = await Promise.all([
      import('../../basic/machine.js'), import('../../basic/sound.js').catch(() => ({})),
    ]);
    this.BasicMachine = BasicMachine;
    this.sound = soundMod.Sound ? new soundMod.Sound() : null;
    this.display = this.windowed ? this._windowDisplay() : new FullScreenDisplay(this);
    this._boot();
    if (this.windowed) {
      if (this.opts.open === 'now') this.showDisplay();
      return this;
    }
    // *Run returns when the program has finished (single tasking) or has become a task
    await Promise.race([this.started, this.finished]);
  }

  /** A new machine and screen, and run (start, Restart). */
  _boot() {
    // (its clock stands still while the program is suspended: flashing colours, teletext flash, the cursor)
    const vdu = this.vdu = new DesktopVDU({ width: wimp.width, height: wimp.height, onBell: () => this.sound?.bell?.(), clock: () => this.clock() });
    if (this.startMode != null) { vdu.writeC(22); vdu.writeC(this.startMode & 255); }
    const m = this.machine = new this.BasicMachine({
      vdu, fs: basicFS(), sound: this.sound, sysvars: sysvarMap(),
      himem: 0x8000 + this.himemK * 1024,
      oscli: (cmd) => this.oscli(cmd),
      onOutput: (c) => this.output(c),
      onExit: (e) => { if (e && typeof e === 'object' && e.message) this.exitError = e; },
    });
    this.ended = false; this.killed = false; this.exitError = null; this.lateOutput = ''; this.result = null;
    // errors seen (for diagnostics: console + docs/BASIC_WIMP.md "debugging")
    this.errors = [];
    m.errorHook = (e) => {
      this.errors.push({ message: e.message, line: m.interp.line?.num ?? 0, trapped: !!m.interp.errH || !!e.ext, stack: (e.stack ?? '').split('\n').slice(1, 4).join(' | ') });
      if (this.errors.length > 8) this.errors.shift();
    };
    // END=: on real machines the slot grows in whole pages (32K on an A5000 with 4MB)
    const I = m.interp, endEq = I.endEquals.bind(I);
    I.endEquals = (v) => endEq(Math.max(v, (((v + 0x7FFF) >> 15) << 15)));
    m.cmdLine = this.file ? `BASIC -quit "${this.file}"${this.args.programArgs ? ' ' + this.args.programArgs : ''}` : 'BASIC';
    m.process = this;
    // anything that waits for the keyboard shows a pre-Wimp program's screen
    const waitKey = m.waitKey.bind(m);
    m.waitKey = (t) => { if (!this.bridge) this.showDisplay(); return waitKey(t); };
    // WAIT / *FX 19: a steady 50Hz frame clock, whatever the display's refresh rate (scheduler.js)
    m.waitVsync = () => vsync.wait();
    installServices(m, this);
    installWimpSwis(m, this);
    installHardware(m, this);
    this.job = scheduler.add(m, { name: this.name, speed: this._speed });
    this.job.foreground = this.display?.kind === 'full' && this.display.attached;
    if (this.suspended) this.job.suspend();
    processes.add(this);
    window.bwProcesses = processes;
    this.started = new Promise((res) => { this._startedRes = res; });
    this.finished = (async () => {
      let result = null;
      try {
        if (this.program != null) {
          await m.load(this.program);
          if (this.opts.run !== false) result = await m.run();
          if (this.prompt && !m.exited && !this.killed) await m.start({ banner: this.opts.run === false });
        } else await m.start();
      } catch (e) {
        if (!this.killed) {
          console.error(e);
          if (this.display?.attached && !this.bridge) m.reportError(e.message ?? String(e), 0);
          else if (!this.bridge) wimp.reportError(e.message ?? String(e), { appName: 'BASIC' });
        }
      }
      await this.end(result);
    })();
    this._stateChanged();
  }

  /** Called by the bridge on the first Wimp_Poll: the task has started. */
  taskStarted() { this._startedRes?.(); }

  output(c) {
    if (this.ended) return;
    if (this.bridge) {
      // text written to the screen by a desktop task (outside redraws): collected for the command window
      if (this._vq > 0) { this._vq--; return; }
      const shown = !this.bridge.inRedraw && !this.bridge.vdu.vdu5;
      if (c < 32) { this._vq = VDU_PARAMS[c]; if (c === 10 && shown) this.lateOutput += '\n'; return; }
      if (!shown) return;
      if (c !== 127) this.lateOutput += String.fromCharCode(c);
      return;
    }
    if (!this.display?.attached) this.showDisplay();
  }

  async oscli(cmd) {
    const name = cmd.replace(/^[\s*]+/, '').replace(/^-[a-z]+-/i, '').replace(/^%/, '').split(/[\s]/)[0].toLowerCase();
    // BASIC's own: these touch its memory, its screen (the program's own mode, in a window too) or its sprites
    if (/^(fx\d*|key\d*|tv|opt|spool|spoolon|exec|quit|basic|load|save|wimpmode|screenmode|screensave|screenload|s(choose|get|flipx|flipy|delete|list|load|merge|new|save|info|rename|copy))$/.test(name)) return false;
    if (!os.cli.find(name) && sysvars.get('Alias$' + name) == null && !os.cli.findRunnable(name)) return false;
    const m = this.machine;
    // output (e.g. *Cat) goes to the program's screen, full screen or in its window
    const out = this.bridge
      ? undefined
      : { write: (s) => m.writeStr(String(s).replace(/\n/g, '\r\n')), writeln: (s = '') => { m.writeStr(String(s)); m.newLine(); }, cols: this.vdu.vduVar?.(256) || 80 };
    try { await os.cli.run(cmd, out ? { out } : {}); } catch (e) { throw Object.assign(new Error(e.message), { errnum: e.errnum ?? 0 }); }
    return true;
  }

  // ------------------------------------------------------------------ displays
  /** Show the program's screen (on its first output or keyboard wait): full screen or its window. */
  showDisplay() {
    if (this.ended || this.bridge || !this.display || this.display.attached) return;
    this.display.attach();
    this._stateChanged();
  }

  _windowDisplay() { return (this.windowDisplay ??= new WindowDisplay(this, { scale: this.scale })); }

  get isFullScreen() { return this.display?.kind === 'full'; }

  /** Switch the running program between the whole screen (true) and its window (false); it carries on. */
  fullScreen(on = true) {
    if (this.bridge || (!on && !this.canWindow)) return;
    if (on === this.isFullScreen && this.display) return;
    const was = this.display, shown = !!was?.attached;
    was?.detach();
    this.display = on ? new FullScreenDisplay(this) : this._windowDisplay();
    if (shown || this.ended) this.display.attach();
    this._stateChanged();
  }

  /** The core task for its window (made when first needed). */
  ensureTask() {
    if (this.task?.alive) return this.task;
    this.task = wimp.createTask(this.name, { memory: this.slotK });
    this.task.basicProcess = this;
    this.task.on('quit', () => { if (!this._closing) this.close(); });
    return this.task;
  }

  /** The window's close icon. */
  closeRequest(ev = {}) {
    if (this.opts.onClose?.(this, ev) === true) return;
    this.close();
  }

  /** Kill the program (if running) and close its window and task. */
  close() {
    if (this._closing) return;
    this._closing = true;
    this.kill();
    if (this.display?.attached) this.display.detach();
    this.window?.delete();
    this.window = null;
    this.windowDisplay = null;
    if (this.display?.kind === 'window') this.display = null;
    if (this.task?.alive) this.task.quit();
    this.task = null;
    this._closing = false;
    this.opts.onState?.(this);
  }

  /** Menu clicked over the window (not in Menu button mode). */
  menuClick(ev) {
    if (this.opts.onMenu) { this.opts.onMenu(ev, this); return; }
    if (this.opts.menu) this.openMenu(this.opts.menu, ev);
  }

  /** Open a Wimp menu (a Menu, or fn(proc, ev) -> Menu) at a click on the window, owned by its task. */
  openMenu(menu, ev) {
    const m = typeof menu === 'function' ? menu(this, ev) : menu;
    if (m) wimp.menus.openAt(m, ev, { task: this.task });
  }

  // ------------------------------------------------------------------ controls
  get state() {
    if (this.ended) return this.killed ? 'killed' : 'finished';
    if (this.bridge) return 'task';
    return this.suspended ? 'suspended' : 'running';
  }
  get running() { return !this.ended; }
  get speed() { return this.job?.speed ?? speedOps(this._speed).key; }
  get opsPerSecond() { return this.job?.ops ?? speedOps(this._speed).ops; }

  get title() {
    const parts = { name: this.name, scale: this.scale, state: this.state, finished: this.ended };
    if (this.opts.formatTitle) return this.opts.formatTitle(parts);
    let t = this.name;
    if (this.scale === 'fit') t += ' (fit)';
    else if (this.scale !== 1) t += ` (x${this.scale})`;
    if (this.ended) t += ' (finished)';
    return t;
  }
  setName(name) { this.name = String(name); if (this.task) { this.task.name = this.name; wimp.emit('taskschanged', {}); } this._stateChanged(); }

  _stateChanged() {
    this.window?.setTitle(this.title);
    this.opts.onState?.(this);
  }

  /** Pause the program where it is (invisibly to it); resume() carries on. */
  suspend() {
    if (this.ended || this.suspended) return;
    this.suspended = true; this._suspendedAt = performance.now();
    this.job?.suspend();
    this._stateChanged();
  }
  resume() {
    if (!this.suspended) return;
    this.suspended = false; this._pausedMs = (this._pausedMs ?? 0) + performance.now() - this._suspendedAt;
    this.job?.resume();
    this._stateChanged();
  }
  /** ms clock for its screen (flashing): stands still while suspended */
  clock() { return (this.suspended ? this._suspendedAt : performance.now()) - (this._pausedMs ?? 0); }

  /** 'arm2' | 'arm3' | 'arm610' | 'strongarm' | 'unlimited' | ops per second */
  setSpeed(s) { this._speed = s; this.job?.setSpeed(s); this._stateChanged(); }
  /** 1 | 2 | 'fit' */
  setScale(s) {
    this.scale = s === 'fit' ? 'fit' : (+s || 1);
    this.windowDisplay?.setScale(this.scale);
    this._stateChanged();
  }
  /** Menu clicks over the window go to the program (MOUSE sees button 2) instead of opening the window menu. */
  setMenuButton(on) { this.menuButton = !!on; this._stateChanged(); }

  /** Run the program again from the start (or a new prompt), on a fresh screen, in the same window. */
  async restart() {
    if (!this.ended) { this.kill(); await this.finished; }
    if (this.suspended) this.resume();
    this._boot();
    this.display?.rebind();
  }

  async end(result = null) {
    if (this.ended) return;
    this.ended = true;
    this.result = result;
    processes.delete(this);
    this.job?.remove();
    if (this.bridge) this.bridge.closeDown(true);
    const d = this.display;
    if (d?.kind === 'full' && d.attached) {
      if (this.windowDisplay && this.canWindow) {
        // a program from a window goes back to it at the end, showing its last picture
        d.detach();
        this.display = this.windowDisplay;
        this.display.attach();
      } else {
        await d.pressSpace();
        d.detach();
      }
    }
    const inWindow = this.display?.kind === 'window';
    const last = this.errors[this.errors.length - 1];
    if (!this.exitError && this.bridge && last && !last.trapped && !this.killed) {
      // an untrapped error stopped a desktop task: BASIC printed "<error> at line <n>" to the screen
      this.exitError = { message: `${last.message} at line ${last.line}` };
    }
    if (this.exitError) {
      const I = this.machine.interp;
      console.warn(`BASIC program ${this.file} ended with error: ${this.exitError.message} (PAGE &${I.page?.toString(16)}, END &${(I.fsa ?? 0).toString(16)}, HIMEM &${I.himem?.toString(16)}); errors: ` + this.errors.map((x) => `${x.message} at line ${x.line} [${x.stack}]`).join(' ; '));
      const e = this.exitError;
      if (inWindow && !this.bridge) {
        // in a window, as full screen BASIC: the error is printed on the program's screen
        this.showDisplay();
        this.machine.reportError(e.message, 0);
      } else {
        // ERROR EXT / an untrapped error leaving BASIC: the Wimp reports it
        await wimp.reportError(e.message, { appName: this.bridge?.task?.name ?? this.taskName ?? 'BASIC' });
      }
    }
    // the window keeps the last picture, without a flashing cursor
    if (inWindow) for (const b of [23, 1, 0, 0, 0, 0, 0, 0, 0, 0]) this.vdu.writeC(b);
    const late = this.lateOutput.replace(/^\n+/, '');
    if (late.trim()) { const o = os.cli.desktopOut(); o.write(late.endsWith('\n') ? late : late + '\n'); }
    this.sound?.stop?.();
    this._startedRes?.();
    this._stateChanged();
    this.opts.onEnd?.(this, result);
  }

  /** Stop the program (task killed from the Task Manager, the bridge task quit, Kill in a window). */
  kill() {
    const I = this.machine?.interp;
    if (!I || this.ended) return;
    this.killed = true;
    I.quit(0);
    for (const w of this.machine.keyWaiters.splice(0)) w.reject(new Error('killed'));
    this.bridge?.abortPoll();
    this.job?.remove();          // (a suspended program must still get to its end)
  }

  /** Wimp_Initialise: become a desktop task. */
  becomeTask(name, version, messages) {
    if (!this.bridge) this.bridge = new WimpBridge(this);
    return this.bridge.initialise(name, version, messages);
  }

  /**
   * Called by the bridge at Wimp_Initialise. A program running in a window becomes an ordinary desktop
   * task: its window and task go (the bridge makes the task's own) and its VDU is the desktop again.
   */
  beforeWimpTask() {
    this.canWindow = false;
    if (this.display?.kind !== 'window') return;
    this._closing = true;
    this.display.detach();
    this.window?.delete();
    this.window = null;
    this.display = this.windowDisplay = null;
    if (this.task?.alive) this.task.quit();
    this.task = null;
    this._closing = false;
    if (!this.vdu.isDesktopMode) this.vdu._setMode(this.vdu.desktop);
  }
}
