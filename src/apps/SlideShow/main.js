// !SlideShow 1.10 - the JPEG slide show from Images on the RISC OS 3.71 hard disc, recreated from the
// original BASIC !RunImage (vendor/ro371/Sources/Demos/SlideShow/bas/!RunImage). No Wimp window: it
// changes to an 800x600 16bpp mode straight away and shows <Images$Dir>.00-49.sa00 .. 50-99.sa99 in a
// loop, each one wiped onto the screen with a randomly chosen effect, until Escape (-> *Desktop).
//
// The original decodes each picture (CFSIjpeg) into an off-screen copy of the screen (picblk%) and then
// copies it to the screen piecewise, one piece per VSync. Here both are Uint32Array pixel buffers.

import { os } from '../../core/os.js';
import { vfs } from '../../core/vfs.js';
import { sysvars } from '../../core/sysvars.js';
import { parseMessagesText } from '../../core/messages.js';

const XRES = 800, YRES = 600;         // MODE: 800 x 600, lbpp 4 (16bpp, 32K colours)
const VSYNC = 1000 / 60;              // one effect step per VSync
const DECODE_MS = 3000;               // stands in for the time CFSIjpeg took to decode a picture
const VCS = 16, HCS = 16;             // chunkiness of vertical / horizontal wipe
const VSLT = 24, HSLT = 32;           // lines in one slat / pixels in one slat
const SQSZ = 50;                      // square size for the table effects
const DFR = 2;                        // rate of diagonal wipe
const BLACK = 0xFF000000;

const DEFAULTS = {
  Name: 'SlideShow', E03: 'Couldn\'t read file', E04: 'Escape', E05: 'Couldn\'t find %0', E06: 'Couldn\'t allocate memory',
};

export default async function start(task, ctx) {
  const dir = ctx.dir || ctx.app.appDir;
  // what !Run sets up
  sysvars.set('SlideShow$Path', dir + '.');
  sysvars.set('Images$Dir', vfs.parent(dir));
  sysvars.set('JPEG$File', 'ADFS::HardDisc4.$.Utilities.!ChangeFSI.CFSIjpeg');
  let msgs = { ...DEFAULTS };
  try { msgs = { ...DEFAULTS, ...parseMessagesText(await vfs.readText('SlideShow:Messages')) }; } catch { /* defaults */ }
  const msg = (t, a = '') => (msgs[t] ?? t).replace(/%0/g, a);

  // ---------------------------------------------------------------- the "mode change"
  const canvas = document.createElement('canvas');
  canvas.width = XRES; canvas.height = YRES;
  const scr = os.cli.acquireScreen({
    background: '#000',
    onKey: (e) => { if (e.key === 'Escape') stop(); },       // Escape -> ERR 17 -> *Desktop: END
  });
  scr.el.style.cursor = 'none';                              // MODE turns the pointer off
  scr.el.addEventListener('contextmenu', (e) => e.preventDefault());
  const k = Math.min(scr.width / XRES, scr.height / YRES);
  canvas.style.cssText = `position:absolute;left:${Math.round((scr.width - XRES * k) / 2)}px;top:${Math.round((scr.height - YRES * k) / 2)}px;` +
    `width:${Math.round(XRES * k)}px;height:${Math.round(YRES * k)}px;${Number.isInteger(k) ? 'image-rendering:pixelated;' : ''}`;
  scr.el.appendChild(canvas);
  const g = canvas.getContext('2d');
  const screenImg = g.createImageData(XRES, YRES);
  const screen = new Uint32Array(screenImg.data.buffer).fill(BLACK);
  const pic = new Uint32Array(XRES * YRES).fill(BLACK);     // picblk%
  const flush = () => g.putImageData(screenImg, 0, 0);
  flush();

  let stopped = false, raf = 0, wake = null;
  const state = { file: '', index: -1, effect: '', phase: 'decode', step: 0, steps: 0, limit: 3, comp: 0, shown: 0, hold: DECODE_MS };
  task.slideshow = { state, get stopped() { return stopped; } };
  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    wake?.();
    scr.release();
    task.quit();
  }
  task.on?.('quit', () => { if (!stopped) { stopped = true; cancelAnimationFrame(raf); wake?.(); scr.release(); } });
  const sleep = (ms) => new Promise((res) => { const t = setTimeout(() => { wake = null; res(); }, ms); wake = () => { clearTimeout(t); wake = null; res(); }; });
  const rnd = (n) => 1 + Math.floor(Math.random() * n);    // RND(n)

  // ---------------------------------------------------------------- decoding (PROCshow)
  async function show(file) {
    let bytes;
    try { bytes = await vfs.readFile(file); } catch { throw new Error(msg('E05', file) + '(3540)'); }
    let bm;
    try { bm = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' })); } catch { throw new Error(msg('E03')); }
    const w = bm.width, h = bm.height;
    const cw = Math.min(w, XRES), ch = Math.min(h, YRES);
    const xoff = Math.max(XRES - w, 0) >> 1, yoff = Math.max(YRES - h, 0) >> 1;
    const xoff2 = Math.max(w - XRES, 0) >> 1, yoff2 = Math.max(h - YRES, 0) >> 1;
    const c = new OffscreenCanvas(cw, ch);
    const cg = c.getContext('2d');
    cg.drawImage(bm, -xoff2, -yoff2);
    bm.close?.();
    const d = cg.getImageData(0, 0, cw, ch).data;
    // 16bpp: 5 bits per gun
    for (let i = 0; i < d.length; i += 4) {
      d[i] = (d[i] & 0xF8) | (d[i] >> 5); d[i + 1] = (d[i + 1] & 0xF8) | (d[i + 1] >> 5); d[i + 2] = (d[i + 2] & 0xF8) | (d[i + 2] >> 5); d[i + 3] = 255;
    }
    const src = new Uint32Array(d.buffer);
    if (xoff || yoff) pic.fill(BLACK);
    for (let y = 0; y < ch; y++) pic.set(src.subarray(y * cw, y * cw + cw), (y + yoff) * XRES + xoff);
  }

  // ---------------------------------------------------------------- effects
  // An effect is a list of steps; step n is done at the n-th VSync (catching up if late, like the
  // original's REPEAT UNTIL (?vc%-vct%)>=&80 : vct%-=1 loop).
  function copyrect(x, y, w, h) {
    for (let r = y; r < y + h; r++) { const o = r * XRES + x; screen.set(pic.subarray(o, o + w), o); }
  }
  function run(name, steps) {
    state.effect = name; state.phase = 'transition'; state.step = 0; state.steps = steps.length;
    return new Promise((res) => {
      const t0 = performance.now();
      const tick = () => {
        if (stopped) return res();
        const target = Math.floor((performance.now() - t0) / VSYNC) + 1;
        let changed = false;
        while (state.step < target && state.step < steps.length) { steps[state.step++](); changed = true; }
        if (changed) flush();
        if (state.step >= steps.length) { state.phase = 'decode'; res(); } else raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
  }
  const range = (a, b, s) => { const r = []; if (s > 0) for (let i = a; i <= b; i += s) r.push(i); else for (let i = a; i >= b; i += s) r.push(i); return r; };
  const effects = {
    wipe_down: () => range(0, YRES - VCS, VCS).map((Y) => () => copyrect(0, Y, XRES, VCS)),
    wipe_up: () => range(YRES - VCS, 0, -VCS).map((Y) => () => copyrect(0, Y, XRES, VCS)),
    wipe_right: () => range(0, XRES - HCS, HCS).map((X) => () => copyrect(X, 0, HCS, YRES)),
    wipe_left: () => range(XRES - HCS, 0, -HCS).map((X) => () => copyrect(X, 0, HCS, YRES)),
    slats_down: () => range(0, VSLT - 1, 1).map((Y) => () => { for (let y = 0; y <= YRES - VSLT; y += VSLT) copyrect(0, Y + y, XRES, 1); }),
    slats_up: () => range(VSLT - 1, 0, -1).map((Y) => () => { for (let y = 0; y <= YRES - VSLT; y += VSLT) copyrect(0, Y + y, XRES, 1); }),
    slats_right: () => range(0, HSLT - 2, 2).map((X) => () => { for (let x = 0; x <= XRES - HSLT; x += HSLT) copyrect(X + x, 0, 2, YRES); }),
    slats_left: () => range(HSLT - 2, 0, -2).map((X) => () => { for (let x = 0; x <= XRES - HSLT; x += HSLT) copyrect(X + x, 0, 2, YRES); }),
  };
  // PROCdotable: frame f copies every pixel whose order-table entry is f, in each 50x50 square
  const NX = Math.floor(XRES / SQSZ), NY = Math.floor(YRES / SQSZ);
  function dotable(tab) {
    return tab.map((offs) => () => {
      for (let sy = 0; sy < NY; sy++) {
        for (let sx = 0; sx < NX; sx++) {
          const base = sy * SQSZ * XRES + sx * SQSZ;
          for (let i = 0; i < offs.length; i++) { const p = base + offs[i]; screen[p] = pic[p]; }
        }
      }
    });
  }

  // ---------------------------------------------------------------- order tables (FNcomp and friends)
  // table = Uint8Array: [0] = highest frame, [1 + y*50 + x] = frame for pixel (x, y) of a square
  function comp(table) {
    const buckets = new Map();
    let lo = Infinity;
    for (let y = 0; y < SQSZ; y++) {
      for (let x = 0; x < SQSZ; x++) {
        const f = table[1 + y * SQSZ + x];
        if (!buckets.has(f)) buckets.set(f, []);
        buckets.get(f).push(y * XRES + x);
        lo = Math.min(lo, f);
      }
    }
    const frames = [];
    for (let f = lo; f <= table[0]; f++) frames.push(Int32Array.from(buckets.get(f) ?? []));
    return frames;
  }
  function newTable(max, fn) {
    const t = new Uint8Array(SQSZ * SQSZ + 1);
    t[0] = max;
    for (let y = 0; y < SQSZ; y++) for (let x = 0; x < SQSZ; x++) t[1 + y * SQSZ + x] = fn(x, y);
    return t;
  }
  const S1 = SQSZ - 1;
  const diag = (fn) => newTable(Math.floor((SQSZ * 2 - 2) / DFR), (x, y) => Math.floor(fn(x, y) / DFR));
  function circtable() {
    const maxrad = Math.trunc(SQSZ * Math.SQRT2), radfac = 40 / maxrad;
    return newTable((SQSZ * 2 - 2) >> 1, (x, y) => Math.trunc(Math.sqrt((x - SQSZ / 2) ** 2 + (y - SQSZ / 2) ** 2) * radfac));
  }
  function shrinktable() {
    const t = new Uint8Array(SQSZ * SQSZ + 1);
    t[0] = SQSZ / 2 - 1;
    for (let X = 0; X <= SQSZ / 2 - 1; X++) {
      for (let x = X; x <= S1 - X; x++) t[X * SQSZ + x + 1] = X;
      for (let x = X + 1; x <= S1 - (X + 1); x++) { t[x * SQSZ + X + 1] = X; t[x * SQSZ + S1 - X + 1] = X; }
      for (let x = X; x <= S1 - X; x++) t[(S1 - X) * SQSZ + x + 1] = X;
    }
    return t;
  }
  async function comp2(name) {
    const file = 'SlideShow:Data.' + name;
    let t;
    try { t = await vfs.readFile(file); } catch { throw new Error(msg('E05', file) + '(3440)'); }
    return comp(t);
  }
  const tabs = {};
  async function nextComp() {       // PROCnext_comp: one more family of effects after each early picture
    switch (state.comp) {
      case 0: tabs.acorn = await comp2('Acorn'); state.limit = 7; break;
      case 1: tabs.diag0 = comp(diag((x, y) => x + y)); break;
      case 2: tabs.diag1 = comp(diag((x, y) => S1 - x + y)); break;
      case 3: tabs.diag2 = comp(diag((x, y) => x + S1 - y)); break;
      case 4: tabs.diag3 = comp(diag((x, y) => S1 - x + S1 - y)); state.limit = 9; break;
      case 5: tabs.circ = comp(circtable()); state.limit = 13; break;
      case 6: tabs.shrink = comp(shrinktable()); state.limit = 17; break;
      case 7: tabs.random = await comp2('Random'); state.limit = 19; break;
      case 8: tabs.rotsq = await comp2('RotSquare'); state.limit = 23; break;
      case 9: tabs.slide = await comp2('Slide'); state.limit = 25; break;   // never reached (comp% < 9)
    }
    state.comp++;
  }
  function choose() {               // PROCdo's CASE RND(limit%) OF
    const r = rnd(state.limit);
    const four = (a) => a[rnd(4) - 1];
    if (r === 1) { const n = four(['wipe_down', 'wipe_up', 'wipe_right', 'wipe_left']); return [n, effects[n]()]; }
    if (r <= 3) { const n = four(['slats_down', 'slats_up', 'slats_right', 'slats_left']); return [n, effects[n]()]; }
    if (r <= 7) return ['acorn', dotable(tabs.acorn)];
    if (r <= 9) { const n = four(['diag0', 'diag1', 'diag2', 'diag3']); return [n, dotable(tabs[n])]; }
    if (r <= 13) return ['circ', dotable(tabs.circ)];
    if (r <= 17) return ['shrink', dotable(tabs.shrink)];
    if (r <= 19) return ['random', dotable(tabs.random)];
    if (r <= 23) return ['rotsq', dotable(tabs.rotsq)];
    return ['slide', dotable(tabs.slide)];
  }

  // ---------------------------------------------------------------- main loop
  const name = (i) => `<Images$Dir>.${i < 50 ? '00-49' : '50-99'}.sa${String(i).padStart(2, '0')}`;
  (async () => {
    try {
      for (;;) {
        for (let i = 0; i < 100 && !stopped; i++) {
          state.file = name(i); state.index = i; state.phase = 'decode';
          const t0 = performance.now();
          await show(state.file);
          const left = state.hold - (performance.now() - t0);
          if (left > 0 && !stopped) await sleep(left);
          if (stopped) return;
          const [n, steps] = choose();
          await run(n, steps);
          state.shown++;
          if (i < 50 && state.comp < 9) await nextComp();
        }
        if (stopped) return;
      }
    } catch (e) {
      if (stopped) return;
      stop();
      os.wimp.reportError(`${e.message ?? e}`, { appName: msg('Name') });
    }
  })();
}
