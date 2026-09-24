// Hardware-facing services for BASIC programs run from the desktop (the Tier-A utilities on the
// 3.71 hard disc: !SaveCMOS, !ResetBoot, !Verify, !HForm, !Calibrate, Video.!Warning):
//
//   OS_Byte 161/162   CMOS RAM read / write (src/core/cmos.js: a persisted 240-byte image whose Wimp,
//                     sound, keyboard, mouse, memory and desktop-font locations are views of os.config)
//   OS_Module 18      module lookup for ROM modules (a header with title and help string in the RMA, so
//                     programs can read the version, e.g. !HForm's ADFS check)
//   OS_Memory 8       amount of VRAM / DRAM / ROM (a RiscPC with 1MB of VRAM; `hardware.vramK` changes it)
//   OS_Reset          restart the machine (reloads the page, keeping the disc and CMOS)
//   Joystick_*        the Joystick module (0.22 in the 3.71 ROM) on the browser Gamepad API
//   ADFS_*            disc operations on the emulated IDE drive 4 (adfs.js; writes to HardDisc4 are refused)
//
// installHardware(machine, proc) is called by the runner for every desktop BASIC program; all of it is
// additive (SWIs the BASIC interpreter doesn't provide, or wrappers that fall through to its own).

import { cmos } from '../cmos.js';
import { vfs } from '../vfs.js';
import { BasicError } from '../../basic/errors.js';
import { installADFS } from './adfs.js';

const u32 = (x) => x >>> 0;

/** Emulated machine details the programs can see (tests may change them). */
export const hardware = {
  vramK: 1024,             // Risc PC with 1MB VRAM (0 = an A7000, or a Risc PC without VRAM)
  dramK: 16 * 1024,
  romK: 4 * 1024,
  pageSize: 4096,
  joystickCalibration: null,
};
if (typeof window !== 'undefined') window.riscHardware = hardware;

// ROM modules that programs look up with OS_Module 18 (title, version, date as in their help strings)
const MODULE_HELP = {
  ADFS: ['3.23', '10 Feb 1997'], FileCore: ['2.98', '18 Nov 1996'], Joystick: ['0.22', '07 Mar 1995'],
  UtilityModule: ['3.71', '23 Sep 1996'], WindowManager: ['3.69', '30 Jan 1997'], BASIC: ['1.16', '16 Oct 1996'],
  RAMFS: ['2.07', '29 Nov 1996'], ColourTrans: ['1.25', '23 Aug 1995'], FontManager: ['3.37', '30 Jan 1997'],
  Squash: ['0.26', '26 Oct 1995'], MessageTrans: ['0.30', '23 Nov 1995'], TerritoryManager: ['0.28', '13 Feb 1996'],
  SoundDMA: ['1.52', '13 Jan 1997'], SoundChannels: ['1.25', '20 Jun 1994'], SoundScheduler: ['1.21', '17 Nov 1993'],
  TaskWindow: ['0.56', '12 Jan 1995'], DragASprite: ['0.13', '04 Jul 1995'], Hourglass: ['2.13', '05 Apr 1995'],
};

export function installHardware(m, proc = {}) {
  const S = (name, fn) => m.registerSwi(name, fn);
  const M = m.mem;
  const prev = (num) => m.swis.byNum.get(num)?.fn;

  // ---------------------------------------------------------------- OS_Byte 161 / 162 (CMOS RAM)
  const osByte = prev(0x06);
  S('OS_Byte', (r, mm, ctx) => {
    const a = r[0] & 255;
    if (a === 161) { r[2] = cmos.read(r[1] & 255); return undefined; }
    if (a === 162) { cmos.write(r[1] & 255, r[2] & 255); return undefined; }
    if (a === 247) { const old = proc._fx247 ?? 0; proc._fx247 = ((old & (r[2] & 255)) ^ (r[1] & 255)) & 255; r[1] = old; return undefined; }   // Break action
    return osByte(r, mm, ctx);
  });

  // ---------------------------------------------------------------- OS_Module 18 (lookup name)
  const osModule = prev(0x1E);
  const modules = proc._modules ?? (proc._modules = new Map());
  S('OS_Module', (r, mm, ctx) => {
    if ((r[0] & 255) === 18) {
      const name = M.rdStrCtrl(u32(r[1]), 64).trim();
      const key = Object.keys(MODULE_HELP).find((k) => k.toLowerCase() === name.toLowerCase());
      if (key) {
        let base = modules.get(key);
        if (!base) {
          const [ver, date] = MODULE_HELP[key];
          const help = `${key}${'\t'.repeat(Math.max(1, 3 - Math.floor(key.length / 8)))}${ver} (${date})`;
          base = m.sysAlloc(64 + key.length + help.length + 2);
          for (let i = 0; i < 52; i += 4) M.wr32(base + i, 0);
          M.wr32(base + 16, 52); M.wrStr0(base + 52, key);
          M.wr32(base + 20, 53 + key.length); M.wrStr0(base + 53 + key.length, help);
          modules.set(key, base);
        }
        r[1] = [...modules.keys()].indexOf(key) + 20; r[2] = 0; r[3] = base; r[4] = 0; r[5] = 0;
        return undefined;
      }
    }
    return osModule(r, mm, ctx);
  });

  // ---------------------------------------------------------------- OS_Memory 8 (amounts of memory)
  S('OS_Memory', (r) => {
    const reason = r[0] & 255;
    if (reason === 8) {
      const type = (r[0] >> 8) & 15;
      const k = { 1: hardware.dramK, 2: hardware.vramK, 3: hardware.romK, 4: 0 }[type] ?? 0;
      r[1] = Math.floor(k * 1024 / hardware.pageSize); r[2] = hardware.pageSize;
      return;
    }
    if (reason === 6) { r[1] = 0; r[2] = 0; return; }       // physical memory table: none
    if (reason === 7) { r[1] = 0; r[2] = 0; return; }
    r[1] = 0; r[2] = hardware.pageSize;
  });

  // ---------------------------------------------------------------- OS_Reset
  S('OS_Reset', () => {
    // a hard reset: the page reloads (the disc overlay and CMOS image are persistent)
    setTimeout(() => { try { sessionStorage.removeItem('riscos.booted'); } catch { /* */ } location.reload(); }, 50);
    return new Promise(() => {});                          // never returns
  });

  // ---------------------------------------------------------------- Joystick module (0.22)
  const pads = () => { try { return [...(navigator.getGamepads?.() ?? [])].filter(Boolean); } catch { return []; } };
  // Calibration (Joystick_CalibrateBottomLeft / TopRight, as !Calibrate does it): the raw analogue
  // positions at the two extremes are recorded and later reads are scaled so they map to -127 / +127.
  const raw = (n) => {
    const p = pads()[n];
    const ax = (i) => Math.max(-1, Math.min(1, p?.axes?.[i] ?? 0));
    return { p, x: ax(0), y: -ax(1) };
  };
  const scale = (v, lo, hi) => (hi - lo > 1e-3 ? Math.max(-1, Math.min(1, ((v - lo) / (hi - lo)) * 2 - 1)) : v);
  const calibrated = (n) => {
    const { p, x, y } = raw(n);
    const c = hardware.joystickCalibration?.[n];
    if (!c?.bottomLeft || !c?.topRight) return { p, x, y };
    return { p, x: scale(x, c.bottomLeft.x, c.topRight.x), y: scale(y, c.bottomLeft.y, c.topRight.y) };
  };
  S('Joystick_Read', (r) => {
    const n = r[0] & 255, wide = !!(r[0] & 0x100);
    if (n > 1) throw new BasicError(0x43F41, 'Joystick number out of range');
    const { p, x, y } = calibrated(n);
    const btn = p ? p.buttons.reduce((s, b, i) => s | ((b.pressed ? 1 : 0) << i), 0) & 0xFF : 0;
    if (wide) { r[0] = Math.round((x + 1) * 32767.5) & 0xFFFF; r[1] = Math.round((y + 1) * 32767.5) & 0xFFFF; r[2] = btn; return; }
    r[0] = ((Math.round(y * 127) & 255) | ((Math.round(x * 127) & 255) << 8) | (btn << 16)) >>> 0;
  });
  const calibrate = (which) => {
    const cal = hardware.joystickCalibration ?? (hardware.joystickCalibration = {});
    for (const n of [0, 1]) { const { x, y } = raw(n); cal[n] = { ...(cal[n] ?? {}), [which]: { x, y, time: Date.now() } }; }
    cal.last = which;
  };
  S('Joystick_CalibrateTopRight', () => calibrate('topRight'));
  S('Joystick_CalibrateBottomLeft', () => calibrate('bottomLeft'));

  // ---------------------------------------------------------------- Squash module (0.26)
  // Squash_Compress / _Decompress on whole buffers (the programs here - !PrintEdit's printer definitions -
  // pass all the input at once), with the module's 12-bit LZW (src/apps/Squash/lzw.js).
  const lzw = () => import('../../apps/Squash/lzw.js');
  const squashErr = () => new BasicError(0x921, 'Bad input for module Squash');
  S('Squash_Compress', async (r) => {
    if (r[0] & 8) { const n = r[1] | 0; r[0] = 16 * 1024 + 4096; r[1] = n < 0 ? -1 : Math.ceil(n * 3 / 2) + 64; return; }
    const { compress } = await lzw();
    const input = new Uint8Array(r[3] >>> 0);
    for (let i = 0; i < input.length; i++) input[i] = M.rd8(u32(r[2]) + i);
    const out = compress(input);
    if (out.length > (r[5] >>> 0)) { r[0] = 2; return; }           // output buffer full
    for (let i = 0; i < out.length; i++) M.wr8(u32(r[4]) + i, out[i]);
    r[0] = 0; r[2] = u32(r[2]) + input.length; r[3] = 0; r[4] = u32(r[4]) + out.length; r[5] = (r[5] >>> 0) - out.length;
  });
  S('Squash_Decompress', async (r) => {
    if (r[0] & 8) { r[0] = 16 * 1024; r[1] = -1; return; }
    const { decompress } = await lzw();
    const input = new Uint8Array(r[3] >>> 0);
    for (let i = 0; i < input.length; i++) input[i] = M.rd8(u32(r[2]) + i);
    let out;
    try { out = decompress(input, r[5] >>> 0); } catch { throw squashErr(); }
    const n = Math.min(out.length, r[5] >>> 0);
    for (let i = 0; i < n; i++) M.wr8(u32(r[4]) + i, out[i]);
    r[0] = 0; r[2] = u32(r[2]) + input.length; r[3] = 0; r[4] = u32(r[4]) + n; r[5] = (r[5] >>> 0) - n;
  });

  // ---------------------------------------------------------------- DragASprite (0.13)
  // A drag of the sprite is a Wimp_DragBox "fixed box" drag of its box (User_Drag_Box when released).
  S('DragASprite_Start', (r) => {
    const blk = proc._dasBlock ?? (proc._dasBlock = m.sysAlloc(40));
    const box = u32(r[3]), bound = u32(r[4]);
    M.wr32(blk, 0); M.wr32(blk + 4, 5);
    for (let i = 0; i < 4; i++) M.wr32(blk + 8 + i * 4, M.rd32(box + i * 4));
    const userBound = ((r[0] >> 4) & 3) === 3 && bound;
    for (let i = 0; i < 4; i++) M.wr32(blk + 24 + i * 4, userBound ? M.rd32(bound + i * 4) : [-0x10000, -0x10000, 0x10000, 0x10000][i]);
    return m.callSwiByName('Wimp_DragBox', [0, blk, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
  S('DragASprite_Stop', () => {});

  // ---------------------------------------------------------------- OSCLI "-fs-command" / "%command"
  // (!HForm: OSCLI "-ADFS-%DISMOUNT :4"): the temporary filing system prefix and the "no alias" mark
  const oscli = m.oscli.bind(m);
  m.oscli = (cmd) => oscli(String(cmd).replace(/^([\s*]*)-[A-Za-z]+-/, '$1').replace(/^([\s*]*)%(?=[A-Za-z])/, '$1'));

  // ---------------------------------------------------------------- ADFS
  installADFS(m, {
    delay: (ms) => new Promise((res) => setTimeout(res, ms)),
    freeBytes: () => { try { return vfs.usage(vfs.hd).free; } catch { return 0; } },
  });
}
