// The machine's memory model (src/core/memory.js) in node: node --test tests/core/test-memory.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memory, barOS, barK, APP_SPACE_K, RAMDISC_MAX_K, RAM_SIZES_MB } from '../../src/core/memory.js';

/** A fresh model with a stub desktop: tasks, a 1024x768 screen, a RAM disc. */
function machine({ values = {}, apps = [], modules = 10, width = 1024, height = 768, ramdiscK = 1024, ramUsedK = 0 } = {}) {
  const tasks = [...apps.map((k, i) => ({ name: `App${i}`, kind: 'app', memory: k })), ...Array.from({ length: modules }, (_, i) => ({ name: `M${i}`, kind: 'module', memory: 0 }))];
  const rd = { size: ramdiscK, used: ramUsedK };
  let changes = 0, saves = 0;
  const m = Object.create(memory);
  m.p = {
    values: { ...values }, save: () => { saves++; }, changed: () => { changes++; },
    tasks: () => tasks, screen: () => ({ width, height, bpp: 8 }),
    ramdisc: { sizeK: () => rd.size, usedK: () => rd.used, setK: (k) => { rd.size = k; } },
  };
  m.cur = { ...memory.cur };
  m.nextSlotK = 640;
  m.vramOverrideK = null;
  m.init();
  return { m, tasks, rd, changes: () => changes, saves: () => saves };
}

/** Every K of DRAM + VRAM is accounted for once (the Task Manager's rows add up to its Total). */
function balanced(s) {
  const rows = s.sys.screen + s.sys.cursor + s.sys.heap + s.sys.module + s.sys.fontcache + s.sys.sprites + s.sys.ramdisc + s.sys.workspace + s.freeK + s.nextK + s.usedK;
  return rows === s.totalK;
}

test('default: a 256MB Risc PC with 2MB of VRAM', () => {
  const { m } = machine();
  const s = m.snapshot();
  assert.equal(s.dramK, 256 * 1024);
  assert.equal(s.vramK, 2048);
  assert.equal(s.romK, 4096);
  assert.equal(s.totalK, 256 * 1024 + 2048);
  assert.equal(s.machine, 'Risc PC');
  assert.ok(s.screen.inVRAM, '1024x768 in 256 colours fits the VRAM');
  assert.equal(s.sys.screen, 2048, 'the screen is the whole VRAM');
  assert.equal(s.screen.dramK, 0);
  assert.equal(s.nextK, 640);
  assert.ok(balanced(s), JSON.stringify(s.sys));
  assert.ok(s.freeK > 250 * 1024, `free ${s.freeK}K`);
});

test('4MB: an A7000, no VRAM, the screen in DRAM, little free', () => {
  const { m } = machine({ values: { ramSize: 4 } });
  const s = m.snapshot();
  assert.equal(s.dramK, 4096);
  assert.equal(s.vramK, 0);
  assert.equal(s.machine, 'A7000');
  assert.ok(!s.screen.inVRAM);
  assert.equal(s.sys.screen, 768, '1024 x 768 x 8bpp');
  assert.equal(s.screen.dramK, 768);
  assert.ok(balanced(s));
  assert.ok(s.freeK < 1024, `free ${s.freeK}K`);
  assert.equal(s.totalK, 4096);
});

test('free pool accounting: slots, areas and Next come out of DRAM', () => {
  const { m, tasks } = machine({ apps: [640, 188] });
  const a = m.snapshot();
  assert.equal(a.usedK, 828);
  assert.equal(a.freeK, a.dramK - a.sysDramK - a.usedK - a.nextK);
  tasks.push({ name: 'Edit', kind: 'app', memory: 256 });
  const b = m.snapshot();
  assert.equal(a.freeK - b.freeK, 256, 'a new task takes its slot from the free pool');
  assert.ok(balanced(b));
  // growing an area takes from free; shrinking gives it back
  assert.equal(m.setArea('fontcache', 1024), 1024);
  assert.equal(b.freeK - m.freeK, 1024 - 64);
  assert.equal(m.setArea('sprites', 100), 100);
  assert.equal(m.setArea('ramdisc', 8192), 8192);
  const c = m.snapshot();
  assert.equal(b.freeK - c.freeK, (1024 - 64) + 100 + (8192 - 1024));
  assert.ok(balanced(c));
  m.setArea('fontcache', 64); m.setArea('sprites', 0); m.setArea('ramdisc', 1024);
  assert.equal(m.freeK, b.freeK);
});

test('sizes are whole 4K pages', () => {
  const { m } = machine();
  assert.equal(m.setArea('fontcache', 101), 104);
  assert.equal(m.setArea('next', 641), 644);
});

test('limits: 28MB application space, 128MB RAM disc, 16MB font cache', () => {
  const { m } = machine();
  assert.equal(m.setArea('next', 64 * 1024), APP_SPACE_K);
  assert.equal(APP_SPACE_K, 28640);
  assert.equal(m.setArea('ramdisc', 200 * 1024), RAMDISC_MAX_K);
  assert.equal(m.setArea('fontcache', 64 * 1024), 16 * 1024);
  assert.throws(() => m.checkSlot(APP_SPACE_K + 4), /free memory is needed/);
  assert.equal(m.checkSlot(APP_SPACE_K), APP_SPACE_K);
  const t = { name: 'Big', kind: 'app', memory: 640 };
  assert.equal(m.growSlot(t, 40 * 1024), APP_SPACE_K, 'Wimp_SlotSize caps the slot at 28MB');
  assert.equal(t.memory, APP_SPACE_K);
});

test('an area cannot grow past the free pool; the RAM disc not below its files', () => {
  const { m, rd } = machine({ values: { ramSize: 4 }, ramUsedK: 300 });
  const s = m.snapshot();
  assert.equal(m.setArea('ramdisc', 64 * 1024), s.sys.ramdisc + s.poolK, 'as much as there is');
  assert.equal(m.freeK, 0);
  assert.equal(m.nextK, 0, 'Next can only be what is left');
  assert.equal(m.setArea('ramdisc', 0), 300, 'not below the 300K of files');
  rd.used = 0;
  assert.equal(m.setArea('ramdisc', 0), 0, 'an empty RAM disc can go');
});

test('Free bar sets Next', () => {
  const { m } = machine({ values: { ramSize: 8 } });
  const s = m.snapshot();
  m.setArea('free', 1000);
  const t = m.snapshot();
  assert.equal(t.freeK, 1000);
  assert.equal(t.nextK, s.poolK - 1000);
});

test('*WimpSlot / starting an application needs the free pool', () => {
  const { m } = machine({ values: { ramSize: 4 } });
  const pool = m.poolK;
  assert.equal(m.checkSlot(pool), pool);
  assert.throws(() => m.checkSlot(pool + 4), (e) => /^\d+K free memory is needed before the application will start/.test(e.message));
  const { m: big } = machine();
  assert.equal(big.checkSlot(188), 188);
});

test('RAM size setting: saved, applied, limited to the Risc PC sizes', () => {
  const { m, changes, saves } = machine();
  const before = m.freeK;
  assert.equal(m.setRAMSize(16), 16);
  assert.equal(m.p.values.ramSize, 16);
  assert.ok(saves() >= 1 && changes() >= 1);
  assert.equal(before - m.freeK, (256 - 16) * 1024);
  assert.equal(m.setRAMSize('64M'), 64);
  assert.equal(m.dramK, 64 * 1024);
  assert.throws(() => m.setRAMSize(512), /RAM size must be one of/);
  assert.throws(() => m.setRAMSize(12), /RAM size/);
  for (const mb of RAM_SIZES_MB) { m.setRAMSize(mb); assert.ok(balanced(m.snapshot()), `${mb}MB`); }
});

test('shrinking the RAM gives back what the areas can spare', () => {
  const { m, rd } = machine({ ramUsedK: 200 });
  m.setArea('ramdisc', 64 * 1024);
  m.setArea('fontcache', 8 * 1024);
  m.setArea('sprites', 4 * 1024);
  m.setRAMSize(4);
  const s = m.snapshot();
  assert.equal(s.over, 0, 'everything fits');
  assert.ok(rd.size >= 200 && rd.size < 4096, `RAM disc ${rd.size}K`);
  assert.ok(balanced(s));
});

test('a desktop too big for the VRAM takes the rest from DRAM', () => {
  const { m } = machine({ width: 2560, height: 1440 });
  const s = m.snapshot();
  assert.ok(!s.screen.inVRAM);
  assert.equal(s.screen.k, 3600);
  assert.equal(s.screen.dramK, 3600 - 2048);
  assert.ok(balanced(s));
  assert.equal(m.setArea('screen', 5000), 3600, 'not draggable on a Risc PC');
});

test('A7000 screen memory can be dragged bigger (up to 2MB), not smaller than the mode', () => {
  const { m } = machine({ values: { ramSize: 4 }, width: 640, height: 480 });
  assert.equal(m.snapshot().sys.screen, 300);
  assert.equal(m.setArea('screen', 480), 480);
  assert.equal(m.setArea('screen', 100), 300);
  const pool = m.poolK;
  assert.equal(m.setArea('screen', 4000), Math.min(2048, 300 + pool), 'as much as the free pool allows');
  const { m: rpc } = machine({ values: { ramSize: 16 }, width: 640, height: 480 });
  rpc.vramOverrideK = 0;                                  // a Risc PC without VRAM
  assert.equal(rpc.setArea('screen', 4000), 2048, 'at most 2MB');
});

test('CMOS sizes apply at start (FontSize, SpriteSize, RAMFSSize 0 = no RAM disc)', () => {
  const { m, rd } = machine({ values: { memFontCache: 256, memSprites: 32, memRAMDisc: 0, memRMA: 64 } });
  const s = m.snapshot();
  assert.equal(s.sys.fontcache, 256);
  assert.equal(s.sys.sprites, 32);
  assert.equal(rd.size, 0);
  assert.equal(s.sys.ramdisc, 0);
  const rows = Object.fromEntries(m.statusRows());
  assert.equal(rows.FontSize, '256K');
  assert.equal(rows.RAMFSSize, '0K');
  assert.equal(rows.RAMSize, '256M');
});

test('OS_ReadDynamicArea / OS_Memory figures agree with the snapshot', () => {
  const { m } = machine({ values: { ramSize: 32 } });
  const s = m.snapshot();
  assert.equal(m.dynamicArea(6).size, s.freeK * 1024);
  assert.equal(m.dynamicArea(2).size, s.sys.screen * 1024);
  assert.equal(m.dynamicArea(5).max, 128 * 1024 * 1024);
  assert.equal(m.dynamicArea(-1).max, APP_SPACE_K * 1024);
  assert.equal(m.dynamicArea(99), null);
  m.vramOverrideK = 0;
  assert.equal(m.vramK, 0, 'a Risc PC without VRAM (tests set riscHardware.vramK = 0)');
  assert.ok(balanced(m.snapshot()));
});

test('Task Manager bars: stepped scale as the 3.7 Switcher draws them', () => {
  // widths measured on a real 3.7 Task Manager (tests/reference/ro37-taskmanager*.png): 2 OS units a pixel
  assert.equal(Math.round(barOS(752) / 2), 79);          // Bookworm 752K
  assert.equal(Math.round(barOS(32768) / 2), 385);       // Total 32MB
  assert.equal(Math.round(barOS(28420) / 2), 369);       // Free 28420K
  assert.equal(barOS(512), 128);                         // first 512K: one OS unit a 4K page
  assert.equal(barOS(0), 0);
  // a 256MB machine's Total bar is still under 600 pixels; a 4MB one's about 200
  assert.ok(barOS(256 * 1024 + 2048) / 2 < 600);
  assert.ok(Math.abs(barOS(4096) / 2 - 200) < 2);
  // the inverse (dragging)
  for (const k of [0, 4, 100, 512, 752, 5000, 28640, 131072]) assert.ok(Math.abs(barK(barOS(k)) - k) < 1e-6, `${k}K`);
});
