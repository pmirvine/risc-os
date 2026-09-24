// The machine Lander runs on: BBC BASIC's RISC OS emulation (src/basic/machine.js) supplies the OS - VDU
// stream, MODE 13 with two screen banks (OS_Byte 112/113) in 160K of screen memory ending at &2000000, as
// the game's !Run sets up with *ScreenSize 160, OS_Mouse / OS_Word 21, OS_ReadC, OS_Byte 129/126 and
// OS_BinaryToDecimal - and src/basic/arm.js runs the original binary.
//
// Both ways of playing Lander use it:
//   * OriginalLander  runs David Braben's own ARM code (the !RunImage from the RISC OS application disc, or
//                     the Arthur GameCode file). It is never part of this repository: the user supplies it.
//   * portOs(machine) is the `os` object for the JavaScript port (game.js).
// Time is emulated: the ARM counts ARM2 cycles (8MHz, S 1 / N 2 cycles) and OS_Byte 19 (wait for vsync)
// moves the clock on to the next 50Hz frame, so the game runs at the speed of an A310 whatever the host
// can do, and runs deterministically (tests compare the two frame by frame).
import { BasicMachine } from '../../basic/machine.js';
import { VDU } from '../../basic/vdu.js';
import { ARM, RETURN_ADDR } from '../../basic/arm.js';

export const ARM2_HZ = 8000000;
export const VSYNC_HZ = 50;
export const FRAME_CYCLES = ARM2_HZ / VSYNC_HZ;
export const SCREEN_MEMORY = 160 * 1024;      // *ScreenSize 160 in the original !Run
const C_FLAG = 2;

/** The emulated computer: a VDU with linear (directly addressable) screen memory and the OS. */
export function createMachine({ canvas = null, sound = null, seed = 1 } = {}) {
  const vdu = new VDU({ canvas, mode: 12, screenMemory: SCREEN_MEMORY, linearScreen: true });
  const m = new BasicMachine({ vdu, sound, seed });
  m.setMouse(640, 512, 0);
  return { vdu, m };
}

/** OS_Byte from JS (returns the registers) */
export function osByte(m, a, x = 0, y = 0) {
  const r = [a, x, y, 0, 0, 0, 0, 0, 0, 0];
  const res = m.osbyte(r, { flags: 0 });
  return res && typeof res.then === 'function' ? res.then(() => r) : r;
}

/** Read a key like OS_ReadC: resolves to the character, 27 on Escape. */
export function readC(m) {
  const k = m.keyNow();
  if (k >= 0) return Promise.resolve(k);
  return m.waitKey(-1).then((c) => c, () => 27);
}

/**
 * How to run a Lander binary: {exec, load, kind} or null if it isn't one.
 *   Absolute (!RunImage, &FF8): loaded and entered at &8000; its first instruction branches to the
 *                              decryption / copy routine, which moves the game to &8000 and enters it.
 *   GameCode (Arthur, &FFD): load &8000, execute &A614 (Entry).
 */
export function identifyBinary(bytes) {
  if (!bytes || bytes.length < 0x2000 || bytes.length > 0x40000) return null;
  const w0 = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
  const text = String.fromCharCode(...bytes.subarray(0, Math.min(bytes.length, 0xC000))).replace(/[^ -~]/g, '.');
  if (!text.includes('Lander Demo/Practice')) return null;
  if ((w0 >>> 24) === 0xEA) return { kind: 'absolute', load: 0x8000, exec: 0x8000 };
  return { kind: 'gamecode', load: 0x8000, exec: 0xA614 };
}

/** The original game on the emulated ARM2. */
export class OriginalLander {
  /**
   * @param {BasicMachine} m
   * @param {Uint8Array} image  the binary
   * @param {{onVsync?: (o: OriginalLander) => void, swiCycles?: number}} opts
   */
  constructor(m, image, opts = {}) {
    const id = identifyBinary(image);
    if (!id) throw new Error('This is not the Lander program');
    this.m = m; this.id = id; this.opts = opts;
    this.frames = 0;          // vsyncs waited for (one per frame drawn)
    this.frameStart = 0; this.frameWork = 0;
    this.pauseAt = Infinity;  // hold at the vsync of this frame (tests); resume() continues
    this.resume = null;
    this.exited = false;
    m.mem.u8.fill(0, 0x8000, 0x80000);
    m.mem.u8.set(image, id.load);
    const cpu = this.cpu = new ARM(m.mem, (num, c) => this.swi(num, c));
    cpu.swiCycles = opts.swiCycles ?? 200;   // what a simple SWI costs on the real machine, roughly
    cpu.r[13] = 0x7F00;                       // the SVC-free Absolute file entry: some stack below &8000
    cpu.r[14] = RETURN_ADDR;
    cpu.pc = id.exec;
    this.pending = null;
  }

  get cycles() { return this.cpu.cycles; }

  swi(num, cpu) {
    const m = this.m;
    const base = num & ~0x20000 & 0xFFFFFF;
    const r = cpu.r;
    switch (base) {
      case 0x01: {  // OS_WriteS
        let a = cpu.pcAfterSwi();
        for (;;) { const c = m.mem.rd8(a++); if (c === 0) break; m.writeC(c); }
        cpu.setPcAfterSwi((a + 3) & ~3);
        return { flags: 0 };
      }
      case 0x04:   // OS_ReadC
        return readC(m).then((k) => { r[0] = k; return { flags: k === 27 ? C_FLAG : 0 }; });
      case 0x06: { // OS_Byte
        const a = r[0] & 255;
        if (a === 19) {   // wait for vsync: the clock moves on to the next frame
          this.frameWork = cpu.cycles - this.frameStart;   // cycles the frame took to draw
          cpu.cycles = this.frameStart = (Math.floor(cpu.cycles / FRAME_CYCLES) + 1) * FRAME_CYCLES;
          this.frames++;
          this.opts.onVsync?.(this);
          if (this.frames >= this.pauseAt) return new Promise((res) => { this.resume = () => { this.resume = null; res({ flags: 0 }); }; });
          return { flags: 0 };
        }
        if (a === 129 && (r[1] | r[2]) === 0 && m.interp.escape) { r[2] = 0x1B; return { flags: C_FLAG }; }
        break;
      }
      case 0x11:   // OS_Exit
        cpu.halt = true; this.exited = true; return { flags: 0 };
      default:
    }
    const regs = Array.from(r.subarray(0, 10));
    const res = m.callSwi(num, regs);
    const apply = (o) => { for (let i = 0; i < 10; i++) r[i] = o.r[i] | 0; return o; };
    if (res && typeof res.then === 'function') return res.then(apply);
    return apply(res);
  }

  /**
   * Run until the cycle counter reaches cycleLimit. Returns 'done' when the game has quit, a Promise
   * while it waits in a SWI (call again once it settles), or undefined.
   */
  runUntil(cycleLimit) {
    if (this.exited) return 'done';
    for (;;) {
      const res = this.cpu.runFor(1 << 20, cycleLimit);
      if (res === 'done') { this.exited = true; return 'done'; }
      if (res !== undefined) return res;
      if (this.cpu.cycles >= cycleLimit) return undefined;
    }
  }

  /** Run until `frames` more vsyncs have happened (headless use: tests). */
  async runFrames(frames) {
    const target = this.frames + frames;
    while (this.frames < target && !this.exited) {
      const res = this.runUntil(this.cpu.cycles + FRAME_CYCLES);
      if (res && typeof res.then === 'function') await res;
    }
  }
}

/**
 * The `os` object for the JavaScript port (see the header of game.js) on the same machine.
 * `vsync` is the host's frame wait (a Promise); `onVsync` is called at each one first.
 */
export function portOs(m, { vsync, onVsync } = {}) {
  let frames = 0;
  return {
    get frames() { return frames; },
    writeC: (b) => m.writeC(b & 255),
    osByte: (a, x, y) => osByte(m, a, x, y),
    mouse: () => { const s = m.mouse(); return { x: s.x, y: s.y, buttons: s.b }; },
    mouseTo: (x, y) => m.mouseTo(x, y),
    escape: () => !!m.interp.escape,
    readC: () => readC(m),
    vsync: () => { frames++; onVsync?.(frames); return vsync ? vsync() : Promise.resolve(); },
    screen: () => m.vdu._linear,
  };
}

/**
 * ARM2 cycles the original takes to draw a frame, estimated from the work the port did (game.js `stats`).
 * The weights are a least-squares fit to the original running on the emulated ARM2 (R² 0.98 over 3000
 * frames of play; the vsync a frame ends on agrees 94% of the time), so the port keeps the original's
 * frame rate: about 16 frames a second on the launchpad, fewer in busy scenes.
 */
const WORK = { base: 27800, tris: 234, lines: 25.5, pixels: 4.6, particles: 135, objects: 2573, altitudes: 192, dots: 281, verts: 578, divs: 530, rows: 36 };
export function portFrameCycles(stats) {
  let c = WORK.base;
  for (const k in stats) c += (WORK[k] ?? 0) * stats[k];
  return c;
}
