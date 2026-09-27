// The machine's memory: ONE model that everything reporting or allocating memory reads, so the figures
// agree - the Task Manager's display and bars, !MemNow, Wimp_SlotSize, *WimpSlot, OS_Memory 8,
// OS_ReadMemMapInfo, OS_ReadDynamicArea, *Status / *Configure and !Configure's Memory window.
//
// The simulated machine is a StrongARM Risc PC with 256MB of DRAM (the most a Risc PC takes: two 128MB
// SIMMs), 2MB of VRAM and 4MB of ROM. !Configure's Memory window ("RAM size") or *Configure RAMSize (this
// desktop's additions: RISC OS 3.71 had no such setting) choose 4, 8, 16, 32, 64, 128 or 256MB; 4MB is an
// A7000, which has no VRAM, so its screen comes out of DRAM. The setting applies at once.
//
//   DRAM = system areas in DRAM + application slots (the tasks) + Next + Free
//   total (Task Manager "Total", OS_ReadMemMapInfo) = DRAM + VRAM
//
// System areas: cursor/system/sound, system heap, module area (RMA), font cache, system sprites, RAM disc,
// system workspace and the screen. The screen is in VRAM when it fits (as on a Risc PC, the whole VRAM
// is the screen's); a desktop bigger than the VRAM takes the rest from DRAM, and on an A7000 all of it
// (at least the mode's size, or *Configure ScreenSize / the Task Manager's bar if bigger).
// Period limits: an application slot is at most 28MB (RISC OS 3.7's 26-bit application space,
// &8000-&1C00000 = 28640K), the RAM disc at most 128MB; font cache and system sprites 16MB each.
// Sizes are whole 4K pages. Growing an area takes memory from the free pool (Next first stays as set,
// but can only be as big as what is left); shrinking gives it back.
//
// The boot-time sizes come from the CMOS (os.config.values: memFontCache, memSprites, memHeap, memRMA,
// memScreen, memRAMDisc, as !Configure's Memory window sets them; they apply at the next start, as on
// RISC OS); the RAM size (values.ramSize, in MB) applies straight away.
//
//   import { memory } from './memory.js';      // also os.memory
//   memory.bind({ values, save, tasks, screen, ramdisc, changed })   // main.js; tests bind stubs
//   memory.snapshot()   -> { dramK, vramK, romK, totalK, sys: {...}, screen: {...}, apps, usedK, nextK, freeK, poolK }
//   memory.freeK        Wimp_SlotSize's free pool (Task Manager "Free"); memory.nextK, memory.dramK ...
//   memory.setArea('fontcache' | 'sprites' | 'ramdisc' | 'screen' | 'next' | 'free', k)  -> the size set (K)
//   memory.setRAMSize(mb)   memory.growSlot(task, k)   memory.checkSlot(k)   memory.dynamicArea(n)
//
// This module has no imports (no DOM), so node tests can use it with stubbed providers.

export const PAGE_K = 4;
export const RAM_SIZES_MB = [4, 8, 16, 32, 64, 128, 256];
export const DEFAULT_RAM_MB = 256;
export const RISCPC_VRAM_K = 2048;
export const ROM_K = 4096;
export const APP_SPACE_K = 28 * 1024 - 32;       // &8000-&1C00000: RISC OS 3.7's largest application slot
export const RAMDISC_MAX_K = 128 * 1024;
export const AREA_MAX_K = { fontcache: 16 * 1024, sprites: 16 * 1024, ramdisc: RAMDISC_MAX_K, heap: 3 * 1024, rma: 4 * 1024 };
const CURSOR_K = 32;                             // Cursor/System/Sound
const WORKSPACE_K = 32;                          // System workspace (as a 3.7 Risc PC's Task Manager shows)
const MODULE_BASE_K = 1176;                      // module area with the ROM modules' workspace
const A7000_SCREEN_MAX_K = 2048;                 // the most an A7000 (no VRAM) can give the screen, unless the mode needs more

const pages = (k) => Math.max(0, Math.ceil(k / PAGE_K) * PAGE_K);
const pagesDown = (k) => Math.max(0, Math.floor(k / PAGE_K) * PAGE_K);

/** A memory error (as RISC OS reports it: a number and a message) */
function memError(msg, errnum = 0x2B4) { const e = new Error(msg); e.errnum = errnum; return e; }

export const memory = {
  // providers (bind); defaults let the model work with no desktop at all
  p: {
    values: {}, save() {}, changed() {},
    tasks: () => [],
    screen: () => ({ width: 1024, height: 768, bpp: 8 }),
    ramdisc: null,               // { sizeK(): K (0 = none), usedK(): K, setK(k) }
  },
  // current sizes of the resizable areas (K), from the CMOS at init()
  cur: { fontcache: 64, sprites: 0, heap: 32, rmaExtra: 0, screenK: 0 },
  nextSlotK: 640,
  sizes: RAM_SIZES_MB,
  vramOverrideK: null,           // tests (window.riscHardware.vramK = 0): a Risc PC without VRAM

  bind(p) { Object.assign(this.p, p); return this; },

  /** Boot: the areas' configured sizes (CMOS), then make everything fit the RAM. */
  init() {
    const v = this.p.values;
    const num = (k, d) => (Number.isFinite(+v[k]) && v[k] != null ? Math.max(0, +v[k]) : d);
    this.cur.fontcache = Math.min(AREA_MAX_K.fontcache, pages(num('memFontCache', 64)));
    this.cur.sprites = Math.min(AREA_MAX_K.sprites, pages(num('memSprites', 0)));
    this.cur.heap = Math.min(AREA_MAX_K.heap, Math.max(32, pages(num('memHeap', 32))));
    this.cur.rmaExtra = Math.min(AREA_MAX_K.rma - MODULE_BASE_K, pages(num('memRMA', 0)));
    this.cur.screenK = pages(num('memScreen', 0));
    if (v.memRAMDisc != null && this.p.ramdisc) this.p.ramdisc.setK(Math.min(RAMDISC_MAX_K, pages(num('memRAMDisc', 0))));
    this.fit();
    return this;
  },

  // ---------------------------------------------------------------- the machine
  get ramMB() { const mb = +this.p.values.ramSize; return RAM_SIZES_MB.includes(mb) ? mb : DEFAULT_RAM_MB; },
  get dramK() { return this.ramMB * 1024; },
  get vramK() { return this.vramOverrideK ?? (this.ramMB <= 4 ? 0 : RISCPC_VRAM_K); },
  get romK() { return ROM_K; },
  get totalK() { return this.dramK + this.vramK; },
  get machine() { return this.vramK ? 'Risc PC' : this.ramMB <= 4 ? 'A7000' : 'Risc PC (no VRAM)'; },

  /** The screen: its size, and how much of it is in VRAM / DRAM. */
  screen() {
    const s = this.p.screen() ?? {};
    const needK = pages(((s.width ?? 1024) * (s.height ?? 768) * (s.bpp ?? 8)) / 8 / 1024);
    const vram = this.vramK;
    if (vram >= needK) return { k: vram, needK, vramK: vram, dramK: 0, inVRAM: true };
    const k = vram ? needK : Math.max(needK, Math.min(this.cur.screenK, Math.max(needK, A7000_SCREEN_MAX_K)));
    return { k, needK, vramK: vram, dramK: k - vram, inVRAM: false };
  },

  /** The system areas (K). */
  sys() {
    const tasks = this.p.tasks() ?? [];
    const modules = tasks.filter((t) => t.kind === 'module').length;
    const rd = this.p.ramdisc;
    return {
      screen: this.screen().k, cursor: CURSOR_K, heap: this.cur.heap,
      module: MODULE_BASE_K + modules * 4 + this.cur.rmaExtra,
      fontcache: this.cur.fontcache, sprites: this.cur.sprites,
      ramdisc: rd ? rd.sizeK() : 0, workspace: WORKSPACE_K,
    };
  },

  /** Application tasks and the memory their slots use (K). */
  apps() { return (this.p.tasks() ?? []).filter((t) => t.kind === 'app'); },
  slotK(t) { return Math.max(0, Math.round(t.memory ?? 64)); },

  /** Everything at once (what the Task Manager shows). */
  snapshot() {
    const scr = this.screen();
    const sys = this.sys();
    const sysDramK = sys.cursor + sys.heap + sys.module + sys.fontcache + sys.sprites + sys.ramdisc + sys.workspace + scr.dramK;
    const apps = this.apps();
    const usedK = apps.reduce((n, t) => n + this.slotK(t), 0);
    const poolK = Math.max(0, this.dramK - sysDramK - usedK);          // free pool, Next included
    const nextK = Math.min(this.nextSlotK, poolK);
    const freeK = poolK - nextK;
    return {
      dramK: this.dramK, vramK: this.vramK, romK: this.romK, totalK: this.totalK, ramMB: this.ramMB, machine: this.machine,
      screen: scr, sys, sysDramK, apps, usedK, nextK, nextSettingK: this.nextSlotK, freeK, poolK,
      over: Math.max(0, sysDramK + usedK - this.dramK),                 // K the areas and slots are over the RAM (0 normally)
    };
  },
  get freeK() { return this.snapshot().freeK; },
  get poolK() { return this.snapshot().poolK; },
  get nextK() { return this.snapshot().nextK; },

  // ---------------------------------------------------------------- changing sizes
  /**
   * Set an area's size (K), as dragging its bar in the Task Manager does. Clamped to the area's limits and
   * to what the free pool can give; returns the size set. 'free' sets Next so that Free becomes k.
   */
  setArea(name, k) {
    const s = this.snapshot();
    k = Math.max(0, Math.round(+k || 0));
    let out;
    switch (name) {
      case 'next':
        this.nextSlotK = out = Math.max(16, Math.min(APP_SPACE_K, pages(k), Math.max(16, s.poolK)));
        break;
      case 'free':
        this.nextSlotK = Math.max(16, Math.min(APP_SPACE_K, s.poolK - pages(k)));
        out = this.snapshot().freeK;
        break;
      case 'fontcache': case 'sprites':
        this.cur[name] = out = Math.min(AREA_MAX_K[name], pages(k), this.cur[name] + s.poolK);
        break;
      case 'screen': {
        if (s.screen.inVRAM || s.vramK) return s.screen.k;               // the screen is the VRAM (a Risc PC)
        const max = Math.max(s.screen.needK, A7000_SCREEN_MAX_K);
        this.cur.screenK = Math.min(max, pages(k), s.screen.k + s.poolK);
        out = this.screen().k;
        break;
      }
      case 'ramdisc': {
        const rd = this.p.ramdisc;
        if (!rd) return 0;
        const used = pages(rd.usedK());
        const size = k === 0 && used === 0 ? 0 : Math.max(used, k > 0 ? PAGE_K : 0, Math.min(RAMDISC_MAX_K, pages(k), s.sys.ramdisc + s.poolK));
        rd.setK(size);
        out = rd.sizeK();
        break;
      }
      default: throw memError(`Unknown memory area '${name}'`);
    }
    this.p.changed();
    return out;
  },

  /** RAM size (MB, one of RAM_SIZES_MB); saved with the CMOS settings, applied now. */
  setRAMSize(mb) {
    mb = +String(mb).replace(/\s*M(B|bytes)?$/i, '');
    if (!RAM_SIZES_MB.includes(mb)) throw memError(`RAM size must be one of ${RAM_SIZES_MB.join(', ')}MB`, 0x2B5);
    this.p.values.ramSize = mb;
    this.p.save();
    this.fit();
    this.p.changed();
    return mb;
  },

  /** After the RAM shrinks: give back what the areas can spare until the areas and slots fit (if they can). */
  fit() {
    let over = this.snapshot().over;
    const shrink = (get, set, min) => {
      if (over <= 0) return;
      const now = get(), to = Math.max(min, pages(now - over));
      if (to < now) { set(to); over -= now - to; }
    };
    const rd = this.p.ramdisc;
    if (rd) shrink(() => rd.sizeK(), (k) => rd.setK(k), pages(rd.usedK()) || (rd.sizeK() ? PAGE_K : 0));
    shrink(() => this.cur.sprites, (k) => { this.cur.sprites = k; }, 0);
    shrink(() => this.cur.fontcache, (k) => { this.cur.fontcache = k; }, 32);
    shrink(() => this.cur.screenK, (k) => { this.cur.screenK = k; }, 0);
    shrink(() => this.cur.rmaExtra, (k) => { this.cur.rmaExtra = k; }, 0);
    return this.snapshot().over === 0;
  },

  /**
   * *WimpSlot -min / Wimp_SlotSize for a task being started or growing: throws the Wimp's "ErrMem" if the
   * slot can't be had (bigger than the application space, or than the free pool can give).
   */
  checkSlot(k, currentK = 0) {
    k = pages(k);
    const s = this.snapshot();
    if (k > APP_SPACE_K || k > currentK + s.poolK) {
      throw memError(`${k}K free memory is needed before the application will start. Quit any unwanted applications or see the RISC OS User Guide for ways to maximise memory.`);
    }
    return k;
  },
  /** Wimp_SlotSize: the slot size a task can have (K), given what it asks for. */
  growSlot(task, k) {
    const cur = task ? this.slotK(task) : 0;
    const s = this.snapshot();
    const got = Math.max(0, Math.min(APP_SPACE_K, pages(k), cur + s.poolK));
    if (task) { task.memory = got; this.p.changed(); }
    return got;
  },

  /**
   * OS_ReadDynamicArea n (0 system heap, 1 RMA, 2 screen, 3 system sprites, 4 font cache, 5 RAM disc,
   * 6 free pool, -1 application space): { base, size, max } in bytes.
   */
  dynamicArea(n) {
    const s = this.snapshot();
    const K = 1024;
    switch (n) {
      case 0: return { base: 0x01C00000, size: s.sys.heap * K, max: AREA_MAX_K.heap * K };
      case 1: return { base: 0x01800000, size: s.sys.module * K, max: AREA_MAX_K.rma * K };
      case 2: return { base: 0x02000000 - s.screen.k * K, size: s.screen.k * K, max: (s.vramK || Math.max(s.screen.needK, A7000_SCREEN_MAX_K)) * K };
      case 3: return { base: 0x03000000, size: s.sys.sprites * K, max: AREA_MAX_K.sprites * K };
      case 4: return { base: 0x04000000, size: s.sys.fontcache * K, max: AREA_MAX_K.fontcache * K };
      case 5: return { base: 0x08000000, size: s.sys.ramdisc * K, max: RAMDISC_MAX_K * K };
      case 6: return { base: 0x10000000, size: s.freeK * K, max: s.dramK * K };
      case -1: return { base: 0x8000, size: s.nextK * K, max: APP_SPACE_K * K };
      default: return null;
    }
  },

  /** *Status rows for the memory settings (as configured: the sizes at the next start). */
  statusRows() {
    const v = this.p.values;
    const k = (key, d) => `${v[key] ?? d}K`;
    return [
      ['FontMax', k('memFontMax', 256)], ['FontSize', k('memFontCache', 64)],
      ['RAMFSSize', `${v.memRAMDisc ?? (this.p.ramdisc?.sizeK() ?? 0)}K`], ['RAMSize', `${this.ramMB}M`],
      ['RMASize', k('memRMA', 0)], ['ScreenSize', k('memScreen', 0)], ['SpriteSize', k('memSprites', 0)], ['SystemSize', k('memHeap', 32)],
    ];
  },
};

// ---------------------------------------------------------------- Task Manager bars
/**
 * The Switcher's stepped memory bars (RISC OS 3.5+ "SteppedMem", Switcher calcbarcoords): the first 512K
 * is drawn at full scale, the next 1MB at half, the next 2MB at a quarter and so on, so a 256MB machine's
 * bars stay on the screen and small slots stay visible. Returns the bar's length in OS units (1 per page
 * of the scaled size, as on a Medusa kernel).
 */
export function barOS(k) {
  if (k <= 0) return 0;
  let rest = k, seg = 512, shift = 0, acc = 0;
  while (rest >= seg) { acc += 512; rest -= seg; shift++; seg *= 2; }
  return (acc + rest / 2 ** shift) / PAGE_K;
}
/** The inverse (dragging a bar): OS units from the bar's start -> K. */
export function barK(os) {
  let scaled = Math.max(0, os) * PAGE_K, seg = 512, shift = 0, acc = 0;
  while (scaled >= 512) { acc += seg; scaled -= 512; shift++; seg *= 2; }
  return acc + scaled * 2 ** shift;
}
