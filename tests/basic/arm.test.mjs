// The ARM2 emulator (src/basic/arm.js) as the original Lander binary uses it, and the Lander host's SWIs
// (src/apps/Lander/host.js): decoded-instruction cache with self-modifying code, ARM2 cycle counting and
// runFor() limits, flags from register-specified shifts, LDM ^ with the PC, SWIs that suspend, the linear
// (directly addressed) MODE 13 screen memory with two banks in 160K, OS_WriteS, OS_Byte 19 / 129 / 112 /
// 113, OS_ReadVduVariables and OS_Exit. No copyrighted code is needed: the programs are hand-assembled.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Memory } from '../../src/basic/memory.js';
import { ARM, RETURN_ADDR } from '../../src/basic/arm.js';
import { VDU } from '../../src/basic/vdu.js';
import { createMachine, OriginalLander, identifyBinary, FRAME_CYCLES, SCREEN_MEMORY } from '../../src/apps/Lander/host.js';

const put = (mem, addr, words) => words.forEach((w, i) => mem.wr32(addr + i * 4, w | 0));
const MOVPC = 0xE1A0F00E;   // MOV PC, R14

test('decoded instructions are re-decoded when code changes (by the CPU or from outside)', () => {
  const mem = new Memory(0x100000);
  const cpu = new ARM(mem, () => ({ flags: 0 }));
  put(mem, 0x9000, [0xE3A00001, MOVPC]);             // MOV R0,#1
  cpu.call(0x9000, []); assert.equal(cpu.r[0], 1);
  mem.wr32(0x9000, 0xE3A00002);                      // MOV R0,#2 written by the host
  cpu.call(0x9000, []); assert.equal(cpu.r[0], 2);
  // the CPU patches its own next instruction: LDR R1,[PC,#4] ; STR R1,[PC,#-4] (at 0x9104 -> 0x9108) ; MOV R0,#9 ; MOV PC,R14 ; data
  put(mem, 0x9100, [0xE59F1008, 0xE50F1004, 0xE3A00009, MOVPC, 0xE3A00007]);
  // (the STR at 0x9104 writes PC+8-4 = 0x9108: MOV R0,#9 becomes MOV R0,#7)
  cpu.call(0x9100, []); assert.equal(cpu.r[0], 7);
});

test('ARM2 cycles: S/N/I counts, runFor stops at the cycle limit and continues', () => {
  const mem = new Memory(0x100000);
  const cpu = new ARM(mem, () => ({ flags: 0 }));
  // MOV R0,#10 ; loop: SUBS R0,R0,#1 ; BNE loop ; MOV PC,R14
  put(mem, 0x9000, [0xE3A0000A, 0xE2500001, 0x1AFFFFFD, MOVPC]);
  cpu.call(0x9000, []);
  // MOV 1 + 10 SUBS + 9 taken B (4 each: 2S + 1N) + 1 untaken B (1) + MOV PC (1 + 3 for the refill)
  assert.equal(cpu.cycles, 1 + 10 + 9 * 4 + 1 + 4);
  // with a limit
  const c2 = new ARM(mem, () => ({ flags: 0 }));
  for (let i = 0; i < 16; i++) c2.r[i] = 0;
  c2.r[14] = RETURN_ADDR; c2.pc = 0x9000;
  assert.equal(c2.runFor(1e6, 20), undefined);
  assert.ok(c2.cycles >= 20 && c2.cycles < 25, 'stopped at the limit: ' + c2.cycles);
  assert.ok(c2.r[0] > 0 && c2.r[0] < 10);
  assert.equal(c2.runFor(1e6, Infinity), 'done');
  assert.equal(c2.r[0], 0);
  // MUL takes 1 + Booth steps (2 bits of Rs a cycle)
  assert.equal(ARM.mulCycles(0), 2);
  assert.equal(ARM.mulCycles(0xFF), 5);
  assert.equal(ARM.mulCycles(-1), 17);
});

test('register-specified shifts by 32 and more set C like the ARM2; LDM ^ with the PC restores the flags', () => {
  const mem = new Memory(0x100000);
  const cpu = new ARM(mem, () => ({ flags: 0 }));
  // MOVS R0,R1,LSR R2 ; MOV R3,#0 ; ADC R3,R3,#0 (R3 = C) ; MOV PC,R14
  put(mem, 0x9000, [0xE1B00231, 0xE3A03000, 0xE2A33000, MOVPC]);
  const run = (r1, r2) => { cpu.call(0x9000, [0, r1, r2]); return [cpu.r[0] >>> 0, cpu.r[3]]; };
  assert.deepEqual(run(0x80000001, 32), [0, 1]);    // LSR #32: result 0, C = bit 31
  assert.deepEqual(run(0x80000001, 33), [0, 0]);    // more than 32: C = 0
  assert.deepEqual(run(0x80000001, 256), [0x80000001, 0]);   // only the bottom byte counts: 0 = no shift, C unchanged (clear)
  assert.deepEqual(run(0x80000001, 1), [0x40000000, 1]);
  // STMFD R13!,{R14} with Z set in R14's PSR bits, then LDMFD R13!,{PC}^ restores them:
  // MOV R14,#&40000000 (Z) ; ORR R14,R14,#&9200 ; STMFD R13!,{R14} ; MOVS R0,#1 (Z clear) ; LDMFD R13!,{PC}^
  put(mem, 0x9100, [0xE3A0E101, 0xE38EEC92, 0xE92D4000, 0xE3B00001, 0xE8FD8000]);
  // resumes at &9200: MOVEQ R5,#1 ; MOVNE R5,#2 ; MOV PC,R12 (R12 = the return sentinel)
  put(mem, 0x9200, [0x03A05001, 0x13A05002, 0xE1A0F00C]);
  cpu.call(0x9100, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, RETURN_ADDR, 0x8000]);
  assert.equal(cpu.r[5], 1, 'Z restored from the stacked PSR');
});

test('a SWI that returns a Promise suspends the CPU and it continues after the SWI', async () => {
  const mem = new Memory(0x100000);
  let calls = 0;
  const cpu = new ARM(mem, (num, c) => { calls++; return new Promise((res) => setTimeout(() => { c.r[0] = 42; res({ flags: 2 }); }, 5)); });
  // SWI &10 ; MOVCS R1,#1 ; MOV PC,R14
  put(mem, 0x9000, [0xEF000010, 0x23A01001, MOVPC]);
  await cpu.call(0x9000, []);
  assert.equal(calls, 1);
  assert.equal(cpu.r[0], 42);
  assert.equal(cpu.r[1], 1, 'C returned by the SWI');
});

test('linear MODE 13 screen memory: two banks in 160K at &1FD8000, written by STR/STRB/STM, read by LDR/LDM', () => {
  const vdu = new VDU({ mode: 13, screenMemory: SCREEN_MEMORY, linearScreen: true });
  const mem = new Memory(0x100000);
  mem.io = vdu.screenIO;
  const cpu = new ARM(mem, () => ({ flags: 0 }));
  assert.equal(vdu.totalScreenSize, 160 * 1024);
  assert.equal(vdu.screenStart, 0x1FD8000);
  assert.ok(vdu._linear && vdu._linear.length === 160 * 1024);
  // R0 = screen: STRB R1,[R0] ; STR R1,[R0,#4] ; STMIA R2,{R3,R4} (R2 = bank 2) ; LDR R5,[R0,#4] ; LDMIA R2,{R6,R7} ; MOV PC,R14
  put(mem, 0x9000, [0xE5C01000, 0xE5801004, 0xE8820018, 0xE5905004, 0xE89200C0, MOVPC]);
  cpu.call(0x9000, [0x1FD8000, 0x12345678, 0x1FD8000 + 81920, 0x04030201, 0x08070605]);
  assert.deepEqual(Array.from(vdu.banks[0].slice(0, 8)), [0x78, 0, 0, 0, 0x78, 0x56, 0x34, 0x12]);
  assert.deepEqual(Array.from(vdu.banks[1].slice(0, 8)), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(cpu.r[5], 0x12345678);
  assert.equal(cpu.r[6], 0x04030201); assert.equal(cpu.r[7], 0x08070605);
  // MODE 128+13 shows / draws bank 2 and keeps bank 1
  vdu.write([22, 128 + 13]);
  assert.equal(vdu.driverBank, 1);
  assert.equal(vdu.banks[0][4], 0x78, 'the other bank survives the mode change');
});

/** A tiny stand-in "Lander" program (identifyBinary looks for the title): an Absolute file at &8000. */
function fakeLander() {
  const words = [
    0xEA000008,                 // B start (0x8028)
  ];
  const title = 'Lander Demo/Practice (C) D.J.Braben 1987\0\0\0\0';
  const img = new Uint8Array(0x2000);
  const dv = new DataView(img.buffer);
  words.forEach((w, i) => dv.setUint32(i * 4, w >>> 0, true));
  for (let i = 0; i < 36; i++) img[4 + i] = title.charCodeAt(i);
  const code = [
    0xE3A00016, 0xEF000000,     // start: MOV R0,#22 ; SWI OS_WriteC
    0xE3A0000D, 0xEF000000,     //        MOV R0,#13 ; SWI OS_WriteC      (MODE 13)
    0xEF000001, 0x00006948,     //        SWI OS_WriteS "Hi"
    0xE3A00013, 0xEF000006,     //        MOV R0,#19 ; SWI OS_Byte        (vsync)
    0xE3A00013, 0xEF000006,     //        MOV R0,#19 ; SWI OS_Byte        (vsync)
    0xE3A00081, 0xE3A01000, 0xE3A02000, 0xEF000006,   // OS_Byte 129,0,0
    0xE1A0A002,                 //        MOV R10,R2
    0xE3A00071, 0xE3A01002, 0xEF000006,               // OS_Byte 113,2 (display bank 2)
    0xE3A00070, 0xE3A01001, 0xEF000006,               // OS_Byte 112,1 (draw bank 1)
    0xE3A00094, 0xE58B0000, 0xE3E00000, 0xE58B0004,   // block: 148, -1
    0xE1A0000B, 0xE28B1008, 0xEF000031,               // OS_ReadVduVariables R0=block R1=block+8
    0xE59B9008,                 //        LDR R9,[R11,#8]
    0xEF000011,                 //        SWI OS_Exit
  ];
  code.forEach((w, i) => dv.setUint32(0x28 + i * 4, w >>> 0, true));
  return img;
}

test('Lander host: OS_WriteS, vsync (OS_Byte 19) on the ARM2 clock, OS_Byte 129 Escape, banks, OS_ReadVduVariables, OS_Exit', async () => {
  const img = fakeLander();
  assert.deepEqual(identifyBinary(img), { kind: 'absolute', load: 0x8000, exec: 0x8000 });
  assert.equal(identifyBinary(new Uint8Array(0x3000)), null);
  const { vdu, m } = createMachine();
  let out = '';
  const orig = new OriginalLander(m, img, { onVsync: (o) => { if (o.frames === 2) m.escape(); } });
  orig.cpu.r[11] = 0x40000;
  const w = m.writeC.bind(m); m.writeC = (b) => { out += String.fromCharCode(b); w(b); };
  let res;
  do { res = orig.runUntil(orig.cycles + FRAME_CYCLES); if (res?.then) await res; } while (res !== 'done');
  assert.equal(orig.frames, 2);
  assert.equal(orig.cycles >= 2 * FRAME_CYCLES && orig.cycles < 3 * FRAME_CYCLES, true, 'two vsyncs = two 50Hz frames: ' + orig.cycles);
  assert.ok(out.includes('Hi'));
  assert.equal(vdu.mode, 13);
  assert.equal(orig.cpu.r[10], 0x1B, 'OS_Byte 129 with no time limit reports Escape as &1B');
  assert.equal(vdu.displayBank, 1); assert.equal(vdu.driverBank, 0);
  assert.equal(orig.cpu.r[9] >>> 0, 0x1FD8000, 'OS_ReadVduVariables 148: screen start of bank 1');
  assert.equal(orig.exited, true);
});
