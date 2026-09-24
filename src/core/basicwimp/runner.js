// Running a BASIC program from the desktop (double-click, *Run, an application's !Run).
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

import { os } from '../os.js';
import { wimp } from '../wimp.js';
import { sysvars } from '../sysvars.js';
import { basicFS } from '../basichost.js';
import { DesktopVDU } from './screen.js';
import { installServices } from './services.js';
import { WimpBridge, installWimpSwis } from './bridge.js';
import { installHardware } from './hardware.js';

/** Parse *BASIC arguments: -quit/-chain/-load <file> [args] | <file> | -help */
export function parseBasicArgs(argv = []) {
  let mode = 'interactive', file = null, programArgs = '';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (/^-(quit|chain|load)$/i.test(a)) { mode = a.slice(1).toLowerCase(); file = argv[++i] ?? null; programArgs = argv.slice(i + 1).join(' '); break; }
    if (/^-help$/i.test(a)) { mode = 'help'; continue; }
    if (!file) { file = a; mode = 'chain'; programArgs = argv.slice(i + 1).join(' '); break; }
  }
  // (only spaces separate arguments: a hard space &A0 is part of a name, as in Video.HiRes.!Warning&A0)
  if (file && /[ \t]/.test(file.replace(/^[ \t]+|[ \t]+$/g, ''))) { const parts = file.replace(/^[ \t]+|[ \t]+$/g, '').split(/[ \t]+/); file = parts.shift(); programArgs = [parts.join(' '), programArgs].filter(Boolean).join(' '); }
  return { mode, file, programArgs };
}

let wimpSlotK = 640;            // last *WimpSlot -min/-max (K), used for the next program's HIMEM
export function noteWimpSlot(k) { if (k > 0) wimpSlotK = k; }

// number of parameter bytes after each VDU control code
const VDU_PARAMS = [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 5, 0, 0, 1, 9, 8, 5, 0, 0, 4, 4, 0, 2];

export const processes = new Set();
let fullScreenBusy = false;

export async function runDesktopBasic(a, ctx = {}) {
  const f = await basicFS().readFile(a.file);
  if (!f) throw Object.assign(new Error(`File '${a.file}' not found`), { riscos: true, errnum: 0x214 });
  const proc = new BasicProcess(a, f.data, ctx);
  return proc.start();
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

export class BasicProcess {
  constructor(args, program, ctx) {
    this.args = args;
    this.program = program;
    this.ctx = ctx;
    this.file = args.file;
    this.slotK = Math.max(32, wimpSlotK);
    this.himemK = Math.ceil(this.slotK / 32) * 32;          // whole 32K pages
    wimpSlotK = 640;
    this.scr = null;              // acquired full screen (single tasking)
    this.bridge = null;           // WimpBridge once Wimp_Initialise is called
    this.lateOutput = '';         // text written after Wimp_Initialise
    this.ended = false;
  }

  async start() {
    const [{ BasicMachine }, soundMod] = await Promise.all([
      import('../../basic/machine.js'), import('../../basic/sound.js').catch(() => ({})),
    ]);
    this.sound = soundMod.Sound ? new soundMod.Sound() : null;
    const vdu = this.vdu = new DesktopVDU({ width: wimp.width, height: wimp.height, onBell: () => this.sound?.bell?.() });
    const m = this.machine = new BasicMachine({
      vdu, fs: basicFS(), sound: this.sound, sysvars: sysvarMap(),
      himem: 0x8000 + this.himemK * 1024,
      oscli: (cmd) => this.oscli(cmd),
      onOutput: (c) => this.output(c),
      onExit: (e) => { if (e && typeof e === 'object' && e.message) this.exitError = e; },
    });
    // errors seen (for diagnostics: console + docs/BASIC_WIMP.md "debugging")
    this.errors = [];
    m.errorHook = (e) => {
      this.errors.push({ message: e.message, line: m.interp.line?.num ?? 0, trapped: !!m.interp.errH || !!e.ext, stack: (e.stack ?? '').split('\n').slice(1, 4).join(' | ') });
      if (this.errors.length > 8) this.errors.shift();
    };
    // END=: on real machines the slot grows in whole pages (32K on an A5000 with 4MB)
    const I = m.interp, endEq = I.endEquals.bind(I);
    I.endEquals = (v) => endEq(Math.max(v, (((v + 0x7FFF) >> 15) << 15)));
    m.cmdLine = `BASIC -quit "${this.file}"${this.args.programArgs ? ' ' + this.args.programArgs : ''}`;
    m.process = this;
    // anything that waits for the keyboard makes a pre-Wimp program single tasking
    const waitKey = m.waitKey.bind(m);
    m.waitKey = (t) => { if (!this.bridge) this.takeScreen(); return waitKey(t); };
    installServices(m, this);
    installWimpSwis(m, this);
    installHardware(m, this);
    processes.add(this);
    window.bwProcesses = processes;
    this.started = new Promise((res) => { this._startedRes = res; });
    this.finished = (async () => {
      try {
        await m.load(this.program);
        await m.run();
      } catch (e) {
        console.error(e);
        if (!this.scr && !this.bridge) wimp.reportError(e.message ?? String(e), { appName: 'BASIC' });
      }
      await this.end();
    })();
    // *Run returns when the program has finished (single tasking) or has become a task
    await Promise.race([this.started, this.finished]);
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
    if (!this.scr) this.takeScreen();
  }

  async oscli(cmd) {
    const name = cmd.replace(/^[\s*]+/, '').replace(/^-[a-z]+-/i, '').replace(/^%/, '').split(/[\s]/)[0].toLowerCase();
    if (/^(fx\d*|key\d*|tv|opt|spool|spoolon|exec|quit|basic|load|save|screensave|screenload)$/.test(name)) return false;   // BASIC's own (these touch its memory)
    if (!os.cli.find(name) && sysvars.get('Alias$' + name) == null && !os.cli.findRunnable(name)) return false;
    const m = this.machine;
    const out = this.bridge || !this.scr
      ? undefined
      : { write: (s) => m.writeStr(String(s).replace(/\n/g, '\r\n')), writeln: (s = '') => { m.writeStr(String(s)); m.newLine(); }, cols: 80 };
    try { await os.cli.run(cmd, out ? { out } : {}); } catch (e) { throw Object.assign(new Error(e.message), { errnum: e.errnum ?? 0 }); }
    return true;
  }

  // ------------------------------------------------------------------ single tasking
  takeScreen() {
    if (this.scr || this.bridge || this.ended) return;
    if (fullScreenBusy) return;
    fullScreenBusy = true;
    const m = this.machine, vdu = this.vdu;
    const canvas = this.canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;image-rendering:pixelated';
    vdu._canvas = canvas;
    vdu._setupCanvas();
    vdu._dirtyAll();
    this.keyHandler = null;       // "Press SPACE" wait
    const scr = this.scr = os.cli.acquireScreen({
      onKey: (e, k) => {
        if (this.keyHandler) { this.keyHandler(e, k); return; }
        this.sound?.resume?.();
        const ik = this.keymap?.internalKey(e);
        if (ik !== undefined) m.keyDown(ik);
        if (e.key === 'Escape') { m.escape(); return; }
        const c = this.keymap ? this.keymap.keyCode(e, m.fx4) : -1;
        if (c <= -2) { vdu.cursorEdit?.(c); return; }
        if (c >= 0) m.keyPress(c);
      },
    });
    import('../../basic/keymap.js').then((km) => { this.keymap = km; });
    scr.el.appendChild(canvas);
    this._keyup = (e) => { const ik = this.keymap?.internalKey(e); if (ik !== undefined) m.keyUp(ik); };
    window.addEventListener('keyup', this._keyup, true);
    let dims = '';
    const fit = () => {
      const dw = vdu.displayWidth, dh = vdu.displayHeight;
      // the program's screen mode fills the monitor (aspect kept), like a mode change on real hardware
      const s = Math.min(scr.width / dw, scr.height / dh);
      canvas.style.width = dw * s + 'px'; canvas.style.height = dh * s + 'px';
      canvas.style.left = Math.floor((scr.width - dw * s) / 2) + 'px';
      canvas.style.top = Math.floor((scr.height - dh * s) / 2) + 'px';
    };
    const frame = () => {
      if (!this.scr) return;
      vdu.render();
      const d = vdu.displayWidth + 'x' + vdu.displayHeight;
      if (d !== dims) { dims = d; fit(); }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
    const mouseXY = (e) => {
      const r = canvas.getBoundingClientRect();
      const ox = vdu.W << vdu.xEig, oy = vdu.H << vdu.yEig;
      return [Math.floor((e.clientX - r.left) / r.width * ox), Math.floor((1 - (e.clientY - r.top) / r.height) * oy)];
    };
    let buttons = 0;
    const bits = (b) => ((b & 1) ? 4 : 0) | ((b & 4) ? 2 : 0) | ((b & 2) ? 1 : 0);
    scr.el.addEventListener('pointermove', (e) => { const [x, y] = mouseXY(e); m.setMouse(x, y, buttons); });
    scr.el.addEventListener('pointerdown', (e) => {
      if (this.keyHandler) { this.keyHandler(null, { code: -1 }); return; }
      buttons = bits(e.buttons); const [x, y] = mouseXY(e); m.setMouse(x, y, buttons); m.keyDown([9, 10, 11][e.button] ?? 9);
    });
    scr.el.addEventListener('pointerup', (e) => { buttons = bits(e.buttons); const [x, y] = mouseXY(e); m.setMouse(x, y, buttons); m.keyUp([9, 10, 11][e.button] ?? 9); });
    scr.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  async releaseScreen() {
    if (!this.scr) return;
    const m = this.machine;
    // VDU 4, then the Wimp's prompt at the bottom of whatever mode the program left
    m.writeC(4);
    if (m.pos()) m.newLine();
    m.writeStr('Press SPACE or click mouse to continue');
    await new Promise((resolve) => {
      this.keyHandler = (e, k) => { if (k.code === 32 || k.code === -1 || k.code === 13) resolve(); };
    });
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keyup', this._keyup, true);
    this.scr.release();
    this.scr = null;
    fullScreenBusy = false;
  }

  async end() {
    if (this.ended) return;
    this.ended = true;
    processes.delete(this);
    if (this.bridge) this.bridge.closeDown(true);
    if (this.scr) await this.releaseScreen();
    const last = this.errors[this.errors.length - 1];
    if (!this.exitError && this.bridge && last && !last.trapped && !this.killed) {
      // an untrapped error stopped a desktop task: BASIC printed "<error> at line <n>" to the screen
      this.exitError = { message: `${last.message} at line ${last.line}` };
    }
    if (this.exitError) {
      const I = this.machine.interp;
      console.warn(`BASIC program ${this.file} ended with error: ${this.exitError.message} (PAGE &${I.page?.toString(16)}, END &${(I.fsa ?? 0).toString(16)}, HIMEM &${I.himem?.toString(16)}); errors: ` + this.errors.map((x) => `${x.message} at line ${x.line} [${x.stack}]`).join(' ; '));
      // ERROR EXT / an untrapped error leaving BASIC: the Wimp reports it
      const e = this.exitError;
      await wimp.reportError(e.message, { appName: this.bridge?.task?.name ?? this.taskName ?? 'BASIC' });
    }
    const late = this.lateOutput.replace(/^\n+/, '');
    if (late.trim()) { const o = os.cli.desktopOut(); o.write(late.endsWith('\n') ? late : late + '\n'); }
    this.sound?.stop?.();
    this._startedRes?.();
  }

  /** Stop the program (task killed from the Task Manager, or the bridge task quit). */
  kill() {
    const I = this.machine?.interp;
    if (!I || this.ended) return;
    this.killed = true;
    I.quit(0);
    for (const w of this.machine.keyWaiters.splice(0)) w.reject(new Error('killed'));
    this.bridge?.abortPoll();
  }

  /** Wimp_Initialise: become a desktop task. */
  becomeTask(name, version, messages) {
    if (!this.bridge) this.bridge = new WimpBridge(this);
    return this.bridge.initialise(name, version, messages);
  }
}
