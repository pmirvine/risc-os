// Native executables: JavaScript stand-ins for ARM code on the disc.
//
// The seed disc keeps ARM executables (&FF8 Absolute, &FFC Utility, &FFA Module) only as empty
// placeholders (tools/disc.mjs, docs/ASSETS.md). When one of them is run - `/path`, *Run, a Filer
// double-click, a line of an Obey file, *RMRun - OSCLI.runFile asks this registry first:
//
//   import { registerNative } from './native.js';
//   registerNative('$.!Boot.Utils.BootVars', { run: async (args, ctx) => { … } });   // disc path from $
//   registerNative('Utils.BootVars', impl);          // or <parent>.<leaf>: matches on any disc / copy
//
// Keys are case-insensitive. `run(args, ctx)` gets the split command tail and the OSCLI context plus
// `ctx.path` (the canonical path run) and `ctx.tail`. A registered program with no `run` is a no-op
// (what running it amounts to here, e.g. a module that patches the ROM, or a memory utility).
// Running a placeholder that has no entry reports `noNative()` instead of executing nothing.
//
// Programs with registered stand-ins are listed in docs/CORE_API.md (§9).
import { sysvars } from './sysvars.js';
import { vfs } from './vfs.js';
import { wimp } from './wimp.js';

const natives = new Map();

/** Register a JS implementation for an ARM program on the disc (see the header). */
export function registerNative(key, impl = {}) { natives.set(String(key).toLowerCase(), { name: key, ...impl }); }

/** The registered implementation for a canonical path, or null. */
export function findNative(path) {
  const p = String(path);
  const i = p.indexOf('$');
  const fromRoot = (i >= 0 ? p.slice(i) : p).toLowerCase();
  const parts = fromRoot.split('.');
  return natives.get(fromRoot) ?? (parts.length >= 2 ? natives.get(parts.slice(-2).join('.')) : null) ?? null;
}

/** Filetypes FileSwitch executes itself (no Alias$@RunType): Absolute, Module (RMRun), Utility. */
export const EXEC_TYPES = new Set([0xFF8, 0xFFA, 0xFFC]);

/** The error for ARM code with no stand-in. */
export function noNative(name) {
  const e = new Error(`'${name}' is ARM code, which cannot be run on this computer`);
  e.errnum = 0; e.riscos = true;
  return e;
}

// ------------------------------------------------------------------------------ helpers
/** Module_Version (BootVars c/main): "3.71" → 0x371 (BCD-ish: digits before '.' shifted up, after '.' down). */
export function moduleVersionNumber(str) {
  let version = 0, place = 8, after = false;
  for (const ch of String(str)) {
    const d = parseInt(ch, 16);
    if (!Number.isNaN(d)) {
      if (!after) version = (version << 4) | (d << 8);
      else version += d << (place -= 4);
    } else if (ch === '.' && !after) { after = true; place = 8; } else break;
  }
  return version;
}

let moduleVersion = () => null;
/** commands.js supplies the ROM module table (for BootVars). */
export function setModuleLookup(fn) { moduleVersion = fn; }

// ------------------------------------------------------------------------------ !Boot.Utils
// BootVars (Sources/SystemRes/Boot/Source/BootVars/c/main).
registerNative('Utils.BootVars', {
  run: async () => {
    // Boot$OSVersion = "%X0" of the UtilityModule version / 16 (3.71 → 0x371 / 16 = 0x37 → "370")
    const v = moduleVersionNumber(moduleVersion('UtilityModule') ?? '3.71');
    sysvars.set('Boot$OSVersion', ((v / 16) | 0).toString(16).toUpperCase() + '0');
    // Boot$State: "desktop" if any Wimp tasks are running (Wimp_ReadSysInfo 0)
    sysvars.set('Boot$State', (wimp.tasks?.length ?? 0) === 0 ? 'commands' : 'desktop');
    // Boot$Unique: the configured filing system is ADFS (not NetFS / ShareFS / Nexus) → "Local"
    sysvars.set('Boot$Unique', 'Local');
    // Boot$Dir: canonicalised to include the filing system and disc, once ("ADFS::<drive>.$.!Boot")
    const dir = sysvars.get('Boot$Dir') ?? '';
    if (!dir.includes('$')) sysvars.set('Boot$Dir', 'ADFS::4.$.!Boot');   // configured drive 4 (HardDisc4)
  },
});
// FreePool: moves application space into the free pool, leaving a next-slot's worth - no memory map here.
registerNative('Utils.FreePool');
// Modules RMLoaded by BootRun on RISC OS 3.00+ / 3.60+: VProtect (virus protection), PatchApp (AppPatcher).
registerNative('Utils.VProtect');
registerNative('Utils.PatchApp');
// *Repeat as a Boot:Library utility: the built-in command does the job.
registerNative('Library.Repeat', { run: async (args, ctx) => ctx.cli.run('Repeat ' + ctx.tail, ctx) });
// FontMerge (Boot:Library.FontMerge): merges font directories; nothing to merge in the substitute font set.
registerNative('FontMerge.FontMerge');

// ------------------------------------------------------------------------------ pre-desktop (BootRun)
// Only reached from the command-line boot sequence; each is a hardware / ROM tweak with no effect here.
registerNative('Configure.BandLimit');        // VIDC bandwidth limits for the screen modes
registerNative('ROMPatch.!RunImage');         // patches ROM bugs
registerNative('SoundDMA.NewSound');          // soft-loads SoundDMA 1.53
registerNative('SoundDMA.SoundDMA');
registerNative('Tasks.~CDReinit');            // re-initialises CDFS after the desktop starts
// ClrMonitor (Sources/SystemRes/Boot/Source/ClrMonitor): Boot$MonitorNotConfigured from the CMOS reset bit.
registerNative('Configure.ClrMonitor', { run: async () => { sysvars.set('Boot$MonitorNotConfigured', 0, 'number'); } });

// ------------------------------------------------------------------------------ !System
// SysPaths (Sources/SystemRes/System/c/main): Sys$Path and System$Path from the numbered module directories.
registerNative('!System.SysPaths', {
  run: async () => {
    const dir = sysvars.get('System$Dir') ?? '';
    const sys = dir + '.';
    sysvars.set('Sys$Path', sys);
    const osv = sysvars.get('Boot$OSVersion') ?? '';
    if (!/^\d+$/.test(osv)) return;
    let entries = [];
    try { entries = vfs.list(dir).map((e) => e.name).filter((n) => /^\d+$/.test(n) && +n <= +osv); } catch { return; }
    entries.sort((a, b) => +b - +a);
    sysvars.set('System$Path', [...entries.map((n) => `Sys:${n}.`), sys].join(','));
  },
});

// ------------------------------------------------------------------------------ applications' helpers
// Utilities that application !Run files call before their main program; memory checks with no meaning here.
registerNative('!Maestro.EnsureRMA');         // grows the RMA for the sound system's voice buffers
registerNative('utils.CheckMem');             // !Internet: checks there is enough free memory
