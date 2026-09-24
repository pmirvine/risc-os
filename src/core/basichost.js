// *BASIC: runs the BBC BASIC V interpreter (src/basic/) in a full-screen VDU, like typing BASIC
// at the F12 command line (or double-clicking a BASIC file) on RISC OS 3.71. QUIT returns.
//
// Installed as os.hooks.basic unless another agent has already provided one.

import { os } from './os.js';
import { vfs } from './vfs.js';
import { sysvars } from './sysvars.js';
import { wimp } from './wimp.js';

/** Adapter from the core VFS to the BASIC machine's filing-system interface. */
export function basicFS() {
  const safe = (fn) => { try { return fn(); } catch { return null; } };
  return {
    async readFile(path) {
      const st = safe(() => vfs.stat(path));
      if (!st || st.type !== 'file') return null;
      return { data: (await vfs.readFile(st.path)).slice(), type: st.filetype < 0 ? 0xFFD : st.filetype };
    },
    async writeFile(path, data, type = 0xFFD) { vfs.writeFile(path, data, { filetype: type }); },
    async stat(path) {
      const st = safe(() => vfs.stat(path));
      if (!st) return null;
      return st.type === 'dir' ? { type: 'dir' } : { type: 'file', filetype: st.filetype, length: st.size, load: st.load, exec: st.exec };
    },
    async delete(path) { try { vfs.delete(path); return true; } catch { return false; } },
    async rename(a, b) { vfs.rename(a, b); return true; },
    async mkdir(path) { vfs.mkdir(path); },
    async setDir(path) { vfs.setCSD(path); },
    async list(dir) {
      return vfs.list(dir || '@').map((s) => (s.type === 'dir' ? { name: s.name, type: 'dir' } : { name: s.name, type: 'file', filetype: s.filetype, length: s.size }));
    },
    canonical: (p) => safe(() => vfs.canonical(p)) ?? p,
  };
}

// system variables shared with BASIC: a Map-like view onto the core sysvars
function sysvarMap() {
  return {
    get: (k) => sysvars.get(k) ?? undefined,
    set(k, v) { sysvars.set(k, String(v)); return this; },
    has: (k) => sysvars.has(k),
    delete: (k) => sysvars.unset(k) > 0,
    // iteration: BasicMachine.getSysVar walks the map for wildcard / case-insensitive lookups
    *[Symbol.iterator]() { for (const e of sysvars.list('*')) yield [e.name, sysvars.get(e.name) ?? '']; },
    *keys() { for (const e of sysvars.list('*')) yield e.name; },
  };
}

let running = false;

export async function runBasic(argv = [], ctx = {}) {
  if (running) throw Object.assign(new Error('BASIC is already running'), { riscos: true });
  const [{ BasicMachine }, { VDU }, keymap, soundMod] = await Promise.all([
    import('../basic/machine.js'), import('../basic/vdu.js'), import('../basic/keymap.js'), import('../basic/sound.js').catch(() => ({})),
  ]);
  // options: -quit <file>, -chain <file>, -load <file>, <file>
  let mode = 'interactive', file = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (/^-(quit|chain|load)$/i.test(a)) { mode = a.slice(1).toLowerCase(); file = argv[++i] ?? null; }
    else if (/^-help$/i.test(a)) mode = 'help';
    else if (!file) { file = a; mode = 'chain'; }
  }
  if (file && /\s/.test(file.trim())) { const parts = file.trim().split(/\s+/); file = parts.shift(); ctx.programArgs = parts.join(' '); }
  running = true;
  const fromCLI = os.cli.active;
  let machine = null, vdu = null, raf = 0;
  const sound = soundMod.Sound ? new soundMod.Sound() : null;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;image-rendering:pixelated';
  const scr = os.cli.acquireScreen({
    onKey: (e, k) => {
      if (!machine) return;
      sound?.resume?.();
      const ik = keymap.internalKey(e);
      if (ik !== undefined) machine.keyDown(ik);
      if (e.key === 'Escape') { machine.escape(); return; }
      const c = keymap.keyCode(e, machine.fx4);
      if (c <= -2) { vdu.cursorEdit?.(c); return; }
      if (c >= 0) machine.keyPress(c);
    },
  });
  scr.el.appendChild(canvas);
  const keyup = (e) => { const ik = keymap.internalKey(e); if (ik !== undefined) machine?.keyUp(ik); };
  window.addEventListener('keyup', keyup, true);
  const fit = () => {
    const dw = vdu.displayWidth, dh = vdu.displayHeight;
    const k = Math.min(scr.width / dw, scr.height / dh);
    const s = k >= 1 ? Math.floor(k) : k;
    canvas.style.width = dw * s + 'px'; canvas.style.height = dh * s + 'px';
    canvas.style.left = Math.floor((scr.width - dw * s) / 2) + 'px';
    canvas.style.top = Math.floor((scr.height - dh * s) / 2) + 'px';
  };
  let dims = '';
  const frame = () => {
    vdu.render();
    const d = vdu.displayWidth + 'x' + vdu.displayHeight;
    if (d !== dims) { dims = d; fit(); }
    raf = requestAnimationFrame(frame);
  };
  // mouse
  const mouseXY = (e) => {
    const r = canvas.getBoundingClientRect();
    const ox = vdu.width << vdu.modeVar(4), oy = vdu.height << vdu.modeVar(5);
    return [Math.floor((e.clientX - r.left) / r.width * ox), Math.floor((1 - (e.clientY - r.top) / r.height) * oy)];
  };
  let buttons = 0;
  const bits = (b) => ((b & 1) ? 4 : 0) | ((b & 4) ? 2 : 0) | ((b & 2) ? 1 : 0);
  scr.el.addEventListener('pointermove', (e) => { if (machine) { const [x, y] = mouseXY(e); machine.setMouse(x, y, buttons); } });
  scr.el.addEventListener('pointerdown', (e) => { buttons = bits(e.buttons); if (machine) { const [x, y] = mouseXY(e); machine.setMouse(x, y, buttons); machine.keyDown([9, 10, 11][e.button] ?? 9); } });
  scr.el.addEventListener('pointerup', (e) => { buttons = bits(e.buttons); if (machine) { const [x, y] = mouseXY(e); machine.setMouse(x, y, buttons); machine.keyUp([9, 10, 11][e.button] ?? 9); } });
  scr.el.addEventListener('contextmenu', (e) => e.preventDefault());

  const done = new Promise((resolve) => {
    vdu = new VDU({ canvas, mode: 28, onBell: () => sound?.bell?.() });
    machine = new BasicMachine({
      vdu, fs: basicFS(), sound, sysvars: sysvarMap(),
      oscli: async (cmd) => {
        const name = cmd.replace(/^[\s*]+/, '').split(/[\s]/)[0].toLowerCase();
        if (/^(fx\d*|key\d*|tv|opt|spool|spoolon|exec|quit|basic)$/.test(name)) return false;   // BASIC's own
        if (!os.cli.find(name) && sysvars.get('Alias$' + name) == null && !os.cli.findRunnable(name)) return false;
        const out = { write: (s) => machine.writeStr(String(s).replace(/\n/g, '\r\n')), writeln: (s = '') => { machine.writeStr(String(s)); machine.newLine(); }, cols: 80 };
        try { await os.cli.run(cmd, { out }); } catch (e) { throw Object.assign(new Error(e.message), { errnum: e.errnum ?? 0 }); }
        return true;
      },
      onExit: () => resolve(),
    });
    window.basic = machine;
    raf = requestAnimationFrame(frame);
    (async () => {
      try {
        if (mode === 'help') { machine.printBanner(); resolve(); return; }
        if (file && (mode === 'quit' || mode === 'chain')) {
          const f = await basicFS().readFile(file);
          if (!f) throw new Error(`File '${file}' not found`);
          await machine.load(f.data);
          await machine.run();
          if (mode === 'quit') { resolve(); return; }
          await machine.start({ banner: false });
        } else {
          if (file && mode === 'load') { const f = await basicFS().readFile(file); if (f) await machine.load(f.data); }
          await machine.start();
        }
        resolve();
      } catch (e) {
        console.error(e);
        wimp.reportError(e.message ?? String(e), { appName: 'BASIC' });
        resolve();
      }
    })();
  });
  await done;
  cancelAnimationFrame(raf);
  window.removeEventListener('keyup', keyup, true);
  scr.release();
  running = false;
  if (fromCLI && os.cli.console) os.cli.console.writeln('');
}

export function installBasicHost() {
  os.hooks = os.hooks ?? {};
  if (!os.hooks.basic) os.hooks.basic = (argv, ctx) => runBasic(argv, ctx);
}
