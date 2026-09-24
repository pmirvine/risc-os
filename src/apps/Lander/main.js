// !Lander: David Braben's 1987 Archimedes demo, full screen in MODE 13.
//
// Lander is (C) D. J. Braben 1987. If the original program is available (see store.js: a file given to
// !Lander, the copy kept in IndexedDB, or a local vendor/lander checkout on the dev server) it runs on the
// emulated ARM2 (host.js, src/basic/arm.js). Otherwise the JavaScript port (game.js, after Mark Moxon's
// documented reconstruction of the source) runs instead; it draws the same frames from the same input.
//
// Arguments (*Run <Lander$Dir> [-port | -original] [<file>]): -port always plays the port; <file> is a
// Lander binary to run (and keep). A binary dropped onto the game from the host computer, or dragged from a
// Filer window onto the !Lander icon (DataLoad), is kept too.
// Mouse: Select = full thrust, Menu = hover, Adjust = fire (browser left / middle / right button).
// Clicking captures the pointer; Escape ends the game.
import { os } from '../../core/os.js';
import { vfs } from '../../core/vfs.js';
import { createMachine, OriginalLander, portOs, portFrameCycles, identifyBinary, readC, FRAME_CYCLES, ARM2_HZ } from './host.js';
import { createLander } from './game.js';
import { loadStored, store, fetchVendor } from './store.js';

const MAX_LAG = 8 * FRAME_CYCLES;     // after a stall (hidden tab, a slow host) don't try to catch up
const now = () => performance.now();

/** Maps the wall clock onto the emulated cycle counter. */
class Clock {
  constructor(speed = 1) { this.speed = speed; this.sync(0); }
  sync(cycles) { this.wall0 = now(); this.emu0 = cycles; }
  target() { return this.emu0 + (now() - this.wall0) * (ARM2_HZ / 1000) * this.speed; }
}

function parseArgs(ctx) {
  const opts = { port: false, original: false, speed: 1, file: ctx.file || null };
  const words = String(ctx.args ?? '').trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (/^-port$/i.test(w)) opts.port = true;
    else if (/^-speed$/i.test(w)) opts.speed = Math.max(0.1, Math.min(16, Number(words[++i]) || 1));
    else if (/^-original$/i.test(w)) opts.original = true;
    else if (!opts.file) opts.file = w.replace(/^"(.*)"$/, '$1');
  }
  try { const q = new URLSearchParams(location.search).get('lander'); if (q === 'port') opts.port = true; } catch { /* no location */ }
  return opts;
}

/** Find the original program (or null to play the port). */
async function findBinary(opts) {
  if (opts.port) return null;
  if (opts.file && vfs.exists(opts.file)) {
    const b = await vfs.readFile(opts.file);
    if (identifyBinary(b)) { await store(b, vfs.leaf(opts.file)); return b; }
  }
  return (await loadStored()) ?? (await fetchVendor());
}

export default async function start(task, ctx) {
  const opts = parseArgs(ctx);
  const binary = await findBinary(opts);
  run(task, binary, opts);
}

function run(task, binary, opts = {}) {
  let soundMod = null;
  import('../../basic/sound.js').then((m) => { soundMod = m; }).catch(() => {});
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;image-rendering:pixelated';
  let machine = null, vdu = null, stopped = false, raf = 0, runner = null;
  let keymap = null;
  import('../../basic/keymap.js').then((k) => { keymap = k; });

  const scr = os.cli.acquireScreen({
    background: '#000',
    onKey: (e) => {
      if (!machine) return;
      machine.o.sound?.resume?.();
      const ik = keymap?.internalKey(e);
      if (ik !== undefined) machine.keyDown(ik);
      if (e.key === 'Escape') { machine.escape(); return; }
      const c = keymap ? keymap.keyCode(e, machine.fx4) : (e.key.length === 1 ? e.key.charCodeAt(0) : -1);
      if (c >= 0) machine.keyPress(c);
    },
  });
  scr.el.style.cursor = 'none';
  scr.el.appendChild(canvas);
  const keyup = (e) => { const ik = keymap?.internalKey(e); if (ik !== undefined) machine?.keyUp(ik); };
  window.addEventListener('keyup', keyup, true);

  // ---------------------------------------------------------------- the mouse (relative, like the real one)
  let buttons = 0;
  const bits = (b) => ((b & 1) ? 4 : 0) | ((b & 4) ? 2 : 0) | ((b & 2) ? 1 : 0);   // left, middle, right
  const osPerPx = () => 1280 / Math.max(1, canvas.getBoundingClientRect().width || 640);
  const move = (e) => {
    if (!machine) return;
    const k = osPerPx();
    const x = Math.max(0, Math.min(1279, machine.mx + Math.round((e.movementX || 0) * k)));
    const y = Math.max(0, Math.min(1023, machine.my - Math.round((e.movementY || 0) * k)));
    machine.setMouse(x, y, buttons);
  };
  const press = (e) => {
    e.preventDefault();
    buttons = bits(e.buttons);
    machine?.setMouse(machine.mx, machine.my, buttons);
    machine?.o.sound?.resume?.();
    if (e.type === 'pointerdown' && document.pointerLockElement !== scr.el) { try { scr.el.requestPointerLock?.()?.catch?.(() => {}); } catch { /* not allowed */ } }
  };
  scr.el.addEventListener('pointermove', move);
  scr.el.addEventListener('pointerdown', press);
  scr.el.addEventListener('pointerup', press);
  scr.el.addEventListener('contextmenu', (e) => e.preventDefault());
  scr.el.addEventListener('auxclick', (e) => e.preventDefault());
  scr.el.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });   // no autoscroll on Menu

  // ---------------------------------------------------------------- a binary dropped from the host computer
  scr.el.addEventListener('dragover', (e) => { e.preventDefault(); });
  scr.el.addEventListener('drop', async (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    const b = new Uint8Array(await f.arrayBuffer());
    if (!identifyBinary(b)) { os.wimp?.beep?.(); return; }
    await store(b, f.name);
    restart(b);
  });

  // ---------------------------------------------------------------- a binary from a RISC OS Filer (DataLoad)
  // Files dropped on the !Lander icon in a Filer viewer (appIconDrop in app.js) arrive as Message_DataLoad
  // while the game runs, or as the argument when it starts; *Run <Lander$Dir> <file> while running gives 'run'.
  const loadPath = async (path) => {
    let b = null;
    try { b = await vfs.readFile(path); } catch { /* unreadable */ }
    if (!b || !identifyBinary(b)) { os.wimp?.beep?.(); return; }
    await store(b, vfs.leaf(path));
    restart(b);
  };
  task.onMessage?.('DataLoad', (msg) => {
    const f = msg.files?.[0] ?? (msg.path ? { path: msg.path } : null);
    if (!f?.path) return false;
    loadPath(f.path);
    return true;
  });
  task.on?.('run', ({ file }) => { if (file && vfs.exists(file)) loadPath(vfs.canonical(file)); });

  // ---------------------------------------------------------------- display
  let dims = '';
  const fit = () => {
    const dw = vdu.displayWidth, dh = vdu.displayHeight;
    const k = Math.min(scr.width / dw, scr.height / dh);
    const s = k >= 1 ? Math.floor(k) : k;
    canvas.style.width = dw * s + 'px'; canvas.style.height = dh * s + 'px';
    canvas.style.left = Math.floor((scr.width - dw * s) / 2) + 'px';
    canvas.style.top = Math.floor((scr.height - dh * s) / 2) + 'px';
  };
  const frame = () => {
    if (stopped) return;
    try { runner?.tick(); } catch (e) { fail(e); return; }
    vdu.render();
    const d = vdu.displayWidth + 'x' + vdu.displayHeight;
    if (d !== dims) { dims = d; fit(); }
    raf = requestAnimationFrame(frame);
  };

  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    runner?.stop();
    window.removeEventListener('keyup', keyup, true);
    if (document.pointerLockElement === scr.el) document.exitPointerLock?.();
    scr.release();
  }
  function finish() { stop(); task.quit(); }
  function fail(e) {
    console.error(e);
    stop();
    os.dialogs?.reportError?.(e?.message ?? String(e), { appName: 'Lander', category: 'error' });
    task.quit();
  }
  task.on?.('quit', () => stop());

  function begin(bin) {
    const sound = soundMod?.Sound ? new soundMod.Sound() : null;
    ({ vdu, m: machine } = createMachine({ canvas, sound, seed: (Date.now() * 7919) | 0 }));
    machine.o.sound = sound;
    runner = bin ? originalRunner(machine, bin, finish, fail, opts.speed) : portRunner(machine, finish, fail, opts.speed);
    task.lander = { mode: bin ? 'original' : 'port', machine, vdu, get runner() { return runner; } };
    dims = '';
  }
  function restart(bin) { runner?.stop(); begin(bin); }

  begin(binary);
  raf = requestAnimationFrame(frame);
}

/** The original program on the emulated ARM2, paced to the wall clock. */
function originalRunner(m, bin, finish, fail, speed = 1) {
  const game = new OriginalLander(m, bin);
  const clock = new Clock(speed);
  let waiting = false, stopped = false;
  return {
    game,
    get frames() { return game.frames; },
    set pauseAt(n) { game.pauseAt = n; if (game.frames < n) game.resume?.(); },   // tests: hold after frame n
    get pauseAt() { return game.pauseAt; },
    tick() {
      if (waiting || stopped) return;
      let target = clock.target();
      if (target - game.cycles > MAX_LAG * clock.speed) { clock.sync(game.cycles); target = game.cycles + FRAME_CYCLES; }
      const res = game.runUntil(target);
      if (res === 'done') { stopped = true; finish(); return; }
      if (res && typeof res.then === 'function') {
        waiting = true;
        res.then(() => { waiting = false; clock.sync(game.cycles); }, (e) => { if (!stopped) fail(e); });
      }
    },
    stop() { stopped = true; },
  };
}

/** The JavaScript port, taking as long over each frame as the original would (host.js portFrameCycles). */
function portRunner(m, finish, fail, speed = 1) {
  const clock = new Clock(speed);
  let frameStart = 0, pending = null, stopped = false, g = null;
  const os2 = portOs(m, {
    onVsync: () => {
      const work = portFrameCycles(g.stats);
      for (const k in g.stats) g.stats[k] = 0;
      frameStart = (Math.floor((frameStart + work) / FRAME_CYCLES) + 1) * FRAME_CYCLES;
    },
    vsync: () => new Promise((res) => { pending = res; }),
  });
  os2.readC = () => readC(m).then((k) => { clock.sync(frameStart); return k; });
  g = createLander(os2);
  g.run().then(() => { if (!stopped) { stopped = true; finish(); } }, (e) => { if (!stopped) fail(e); });
  return {
    game: g,
    get frames() { return os2.frames; },
    pauseAt: Infinity,
    tick() {
      if (!pending || stopped || os2.frames >= this.pauseAt) return;
      const target = clock.target();
      if (target - frameStart > MAX_LAG * clock.speed) clock.sync(frameStart);
      if (clock.target() >= frameStart) { const p = pending; pending = null; p(); }
    },
    stop() { stopped = true; pending = null; },
  };
}
