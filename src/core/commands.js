// Built-in * commands.

import { cli, CLIError, splitArgs, ObeyEnd } from './cli.js';
import { vfs, FT_UNTYPED, ATTR } from './vfs.js';
import { sysvars } from './sysvars.js';
import { typeName, parseType } from './filetypes.js';
import { os } from './os.js';
import { wimp } from './wimp.js';
import { sprites } from './sprites.js';
import { decodeLatin1 } from './charset.js';
import { registerResetCommands } from './reset.js';
import { registerSoundCommands } from './sound/commands.js';
import { setModuleLookup } from './native.js';

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const H8 = (n) => (n >>> 0).toString(16).toUpperCase().padStart(8, '0');

function attrStr(st) {
  let s = '';
  if (st.type === 'dir') s += 'D';
  if (st.attr & ATTR.locked) s += 'L';
  if (st.attr & ATTR.ownerWrite) s += 'W';
  if (st.attr & ATTR.ownerRead) s += 'R';
  s += '/';
  if (st.attr & ATTR.publicWrite) s += 'w';
  if (st.attr & ATTR.publicRead) s += 'r';
  return s;
}
function typeCol(st) {
  if (st.type === 'dir') return '';
  if (st.filetype === FT_UNTYPED) return `${H8(st.load)} ${H8(st.exec)}`;
  return pad(typeName(st.filetype), 9) + ' ' + formatDateCS(st.date);
}
function formatDateCS(d) {
  const p = (n) => String(n).padStart(2, '0');
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${p(d.getDate())}-${M[d.getMonth()]}-${d.getFullYear()}`;
}
function infoLine(st) {
  return `${pad(st.name, 12)} ${pad(attrStr(st), 6)} ${typeCol(st)}  ${st.type === 'dir' ? '' : lpad(H8(st.size), 8)}`.trimEnd();
}
function dirHeader(out, path) {
  const d = vfs.discOf(path);
  out.writeln(`${pad(d.fs === 'Resources' ? 'Resources' : d.name, 21)} Option 00 (Off)`);
  const leaf = (p) => { const c = vfs.canonical(p); const i = c.indexOf('$'); return i >= 0 ? c.slice(i) : c; };
  out.writeln(`Dir. ${pad(leaf(path), 16)} Lib. ${leaf(vfs.lib)}`);
  out.writeln(`URD  ${leaf(vfs.urd)}`);
  out.writeln('');
}
const argPath = (a) => (a == null || a === '' ? '@' : a);
function must(path) {
  const st = vfs.stat(path);
  if (!st) throw new CLIError(`File '${path}' not found`, 0x214);
  return st;
}
const parseAttrs = (s, old) => {
  let a = 0;
  const [own, pub = ''] = s.split('/');
  for (const c of own.toUpperCase()) { if (c === 'L') a |= ATTR.locked; else if (c === 'W') a |= ATTR.ownerWrite; else if (c === 'R') a |= ATTR.ownerRead; else if (c !== 'E') throw new CLIError(`Access attributes '${s}' not recognised`); }
  for (const c of pub.toUpperCase()) { if (c === 'W') a |= ATTR.publicWrite; else if (c === 'R') a |= ATTR.publicRead; else throw new CLIError(`Access attributes '${s}' not recognised`); }
  return a;
};

// option flags for *Copy / *Wipe:  ~C ~V F R etc.
function copyOpts(s = '') {
  const o = { confirm: false, verbose: false, force: false, recurse: false, delete: false, newer: false, quick: false, stamp: false };
  let neg = false;
  for (const c of s.toUpperCase()) {
    if (c === '~') { neg = true; continue; }
    const map = { C: 'confirm', V: 'verbose', F: 'force', R: 'recurse', D: 'delete', N: 'newer', Q: 'quick', S: 'stamp', P: 'prompt', A: 'access', L: 'look' };
    if (map[c]) o[map[c]] = !neg;
    neg = false;
  }
  return o;
}

const MODULES = [
  ['UtilityModule', '3.71'], ['Podule', '1.35'], ['FileSwitch', '2.36'], ['ResourceFS', '0.15'], ['Messages', '0.28'],
  ['MessageTrans', '0.30'], ['TerritoryManager', '0.28'], ['SystemDevices', '1.26'], ['FontManager', '3.37'],
  ['International', '1.34'], ['SharedCLibrary', '4.83'], ['Desktop', '2.53'], ['WindowManager', '3.69'],
  ['TaskManager', '1.04'], ['Filer', '1.77'], ['FilerSWIs', '0.03'], ['Filer_Action', '0.44'], ['Free', '0.31'],
  ['Pinboard', '0.66'], ['DisplayManager', '0.33'], ['ADFS', '3.23'], ['ADFSFiler', '0.85'], ['RAMFS', '2.07'],
  ['RAMFSFiler', '0.30'], ['ResourceFiler', '0.10'], ['FileCore', '2.98'], ['BASIC', '1.16'], ['TaskWindow', '0.56'],
  ['ShellCLI', '0.28'], ['ColourTrans', '1.25'], ['DragASprite', '0.13'], ['SpriteExtend', '0.99'], ['DrawFile', '1.40'],
  ['Squash', '0.26'], ['SoundDMA', '1.52'], ['SoundChannels', '1.25'], ['SoundScheduler', '1.21'], ['WaveSynth', '1.13'],
  ['Obey', '0.35'], ['BufferManager', '0.20'], ['DeviceFS', '0.36'], ['Parallel', '0.53'], ['Serial', '0.28'], ['ScreenBlanker', '2.10'],
];

setModuleLookup((name) => MODULES.find((m) => m[0].toLowerCase() === String(name).toLowerCase())?.[1] ?? null);

const HELP = {};
function def(name, syntax, help, run, extra = {}) {
  HELP[name.toLowerCase()] = { name, syntax, help };
  cli.register(name, { syntax, help, run, ...extra });
}

export function installCommands() {
  // ---------------------------------------------------------------- filing system
  def('Cat', 'Syntax: *Cat [<directory>]', '*Cat lists all the objects in a directory (default is the current directory).', async (a, { out }) => {
    const p = argPath(a[0]);
    const list = vfs.list(p);
    dirHeader(out, p);
    const colW = 20;
    const perLine = Math.max(1, Math.floor(((out.cols ?? 80) + 1) / colW));
    let row = [];
    for (const st of list) {
      row.push(pad(`${pad(st.name, 11)}${attrStr(st)}`, colW - 1));
      if (row.length === perLine) { out.writeln(row.join(' ').trimEnd()); row = []; }
    }
    if (row.length) out.writeln(row.join(' ').trimEnd());
  });
  cli.register('.', { run: (a, c) => cli.find('cat').run(a, c) });
  def('Ex', 'Syntax: *Ex [<directory>]', '*Ex lists all the objects in a directory together with their file information.', async (a, { out }) => {
    const p = argPath(a[0]);
    dirHeader(out, p);
    for (const st of vfs.list(p)) out.writeln(infoLine(st));
  });
  def('Info', 'Syntax: *Info <object>', '*Info lists file information about the specified object(s).', async (a, { out }) => {
    const paths = vfs.expandWild(a[0]);
    if (!paths.length) throw new CLIError(`File '${a[0]}' not found`, 0x214);
    for (const p of paths) out.writeln(infoLine(vfs.stat(p)));
  }, { min: 1 });
  def('FileInfo', 'Syntax: *FileInfo <object>', '*FileInfo lists full file information about the specified object.', async (a, { out }) => {
    for (const p of vfs.expandWild(a[0])) {
      const st = vfs.stat(p);
      out.writeln(`${pad(st.name, 12)} ${pad(attrStr(st), 6)} ${H8(st.load)} ${H8(st.exec)} ${H8(st.size)} ${st.type === 'dir' ? '' : typeName(st.filetype)} ${formatDateCS(st.date)}`);
    }
  }, { min: 1 });
  def('Dir', 'Syntax: *Dir [<directory>]', '*Dir selects a directory as the current directory (default is the user root directory).', async (a) => { vfs.setCSD(a[0] ?? vfs.urd); });
  def('Back', 'Syntax: *Back', '*Back swaps the current and previous directories.', async () => { vfs.setCSD(vfs.prevDir); });
  def('NoDir', 'Syntax: *NoDir', 'Unsets the current directory.', async () => {});
  def('URD', 'Syntax: *URD [<directory>]', '*URD selects a directory as the user root directory.', async (a) => { vfs.urd = vfs.canonical(a[0] ?? '$'); });
  def('Lib', 'Syntax: *Lib [<directory>]', '*Lib selects a directory as the library.', async (a) => { vfs.lib = vfs.canonical(a[0] ?? '$'); });
  def('CDir', 'Syntax: *CDir <directory>', '*CDir creates a directory.', async (a) => { vfs.mkdir(a[0]); }, { min: 1 });
  def('Type', 'Syntax: *Type [-File] <filename> [-TabExpand]', '*Type displays the contents of a file as text.', async (a, { out }) => {
    const f = a.filter((x) => !x.startsWith('-'))[0];
    const txt = decodeLatin1(await vfs.readFile(f));
    for (const l of txt.split(/\r?\n|\r/)) out.writeln(l.replace(/\t/g, '        '));
  }, { min: 1 });
  cli.register('List', { run: (a, c) => cli.find('type').run(a, c) });
  def('Dump', 'Syntax: *Dump <filename> [<file offset> [<start address>]]', '*Dump displays the contents of a file in hexadecimal and ASCII.', async (a, { out }) => {
    const d = await vfs.readFile(a[0]);
    const off = a[1] ? parseInt(a[1].replace(/^&/, ''), 16) : 0;
    const base = a[2] ? parseInt(a[2].replace(/^&/, ''), 16) : 0;
    const cols = (out.cols ?? 80) >= 80 ? 16 : 8;
    out.writeln('Address  :' + Array.from({ length: cols }, (_, i) => ' ' + (i & 15).toString(16).toUpperCase().padStart(2, ' ')).join('') + ' :    ASCII data');
    out.writeln('');
    for (let i = off; i < d.length; i += cols) {
      const bytes = Array.from(d.slice(i, i + cols));
      const hexs = bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(cols * 3 - 1);
      const asc = bytes.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
      out.writeln(`${H8(base + i - off + off)} : ${hexs} : ${asc}`);
    }
  }, { min: 1 });
  def('Copy', 'Syntax: *Copy <source spec> <destination spec> [[~]<options>]', '*Copy copies one or more objects. Options: C(onfirm) D(elete) F(orce) N(ewer) Q(uick) R(ecurse) S(tamp) V(erbose).', async (a, { out }) => {
    const o = copyOpts(a[2]);
    const src = vfs.expandWild(a[0]);
    if (!src.length) throw new CLIError(`File '${a[0]}' not found`, 0x214);
    let n = 0, bytes = 0;
    for (const s of src) {
      const st = vfs.stat(s);
      let dest = a[1];
      if (/[*#]/.test(a[0])) dest = `${a[1]}.${st.name}`;
      else if (vfs.isDir(a[1]) && !(st.type === 'dir' && !vfs.exists(a[1] + '.' + st.name) && false)) dest = vfs.isDir(a[1]) ? `${a[1]}.${st.name}` : a[1];
      if (st.type === 'dir' && !o.recurse) { if (o.verbose) out.writeln(`Directory ${st.name} not copied (use R option)`); continue; }
      if (o.delete) await vfs.move(s, dest, { force: o.force, newer: o.newer });
      else await vfs.copy(s, dest, { force: o.force, newer: o.newer, stamp: o.stamp });
      n++; bytes += st.size;
      if (o.verbose) out.writeln(`File ${st.name} ${o.delete ? 'moved' : 'copied'} as ${vfs.leaf(dest)}, ${bytes} bytes`);
    }
    if (o.verbose) out.writeln(`${n} files ${o.delete ? 'moved' : 'copied'}, total ${bytes} bytes`);
  }, { min: 2 });
  const del = async (a, { out }) => {
    const paths = vfs.expandWild(a[0]);
    if (!paths.length) throw new CLIError(`File '${a[0]}' not found`, 0x214);
    for (const p of paths) vfs.delete(p);
  };
  def('Delete', 'Syntax: *Delete <object>', '*Delete deletes a file or empty directory.', del, { min: 1, max: 1 });
  def('Remove', 'Syntax: *Remove <object>', '*Remove deletes an object without complaining if it doesn\'t exist.', async (a) => { if (vfs.exists(a[0])) vfs.delete(a[0]); }, { min: 1 });
  def('Wipe', 'Syntax: *Wipe <file spec> [[~]<options>]', '*Wipe deletes one or more objects. Options: C F R V.', async (a, { out }) => {
    const o = copyOpts(a[1] ?? '~CR~V');
    for (const p of vfs.expandWild(a[0])) {
      vfs.delete(p, { recursive: o.recurse, force: o.force });
      if (o.verbose) out.writeln(`File ${vfs.leaf(p)} deleted`);
    }
  }, { min: 1 });
  def('Rename', 'Syntax: *Rename <object> <new name>', '*Rename changes the name of an object.', async (a) => { vfs.rename(a[0], a[1]); }, { min: 2, max: 2 });
  def('Access', 'Syntax: *Access <object> [<attributes>]', '*Access changes the attributes of objects. Attributes: L(ock) W(rite) R(ead) /r /w (public).', async (a) => {
    const paths = vfs.expandWild(a[0]);
    if (!paths.length) throw new CLIError(`File '${a[0]}' not found`, 0x214);
    for (const p of paths) vfs.setAccess(p, parseAttrs(a[1] ?? '', 0));
  }, { min: 1 });
  def('SetType', 'Syntax: *SetType <filename> <file type>', '*SetType sets the file type of a file.', async (a) => {
    const t = parseType(a[1]);
    if (t < 0) throw new CLIError('File type is unrecognised', 0);
    for (const p of vfs.expandWild(a[0])) vfs.setType(p, t);
  }, { min: 2, max: 2 });
  def('Stamp', 'Syntax: *Stamp <filename>', '*Stamp sets the date stamp of a file to the current time.', async (a) => { for (const p of vfs.expandWild(a[0])) vfs.stamp(p); }, { min: 1 });
  def('Load', 'Syntax: *Load <filename> [<address>]', '*Load loads a file into memory.', async (a) => { await vfs.readFile(a[0]); }, { min: 1 });
  def('Save', 'Syntax: *Save <filename> <start> <end>|+<length>', '*Save saves an area of memory to a file.', async () => { throw new CLIError('Not supported'); });
  def('Count', 'Syntax: *Count <file spec> [[~]<options>]', '*Count adds up the size of one or more files.', async (a, { out }) => {
    let n = 0, b = 0;
    const walk = (p) => { const st = vfs.stat(p); if (st.type === 'dir') vfs.list(p).forEach((c) => walk(c.path)); else { n++; b += st.size; } };
    for (const p of vfs.expandWild(a[0] ?? '*')) walk(p);
    out.writeln(`${n} ${n === 1 ? 'file' : 'files'} counted, total ${b} bytes`);
  });
  def('Free', 'Syntax: *Free [<disc spec>]', '*Free displays the total free space on a disc.', async (a, { out }) => {
    const d = vfs.discOf(a[0] ?? '@');
    const u = vfs.usage(d);
    out.writeln(`Bytes free &${H8(u.free)} = ${u.free.toLocaleString('en-GB')}`);
    out.writeln(`Bytes used &${H8(u.used)} = ${u.used.toLocaleString('en-GB')}`);
  });
  def('ShowFree', 'Syntax: *ShowFree -FS <Filing system name> <Device>', '*ShowFree shows the amount of free space on devices.', async (a) => { os.free?.show(a.join(' ')); });
  def('Up', 'Syntax: *Up [<levels>]', 'Moves the current directory up.', async (a) => { let p = vfs.csd; for (let i = 0; i < (+a[0] || 1); i++) p = vfs.parent(p); vfs.setCSD(p); });
  def('Canonicalise', 'Syntax: *Canonicalise <path>', 'Shows the canonical form of a path.', async (a, { out }) => out.writeln(vfs.canonical(a[0])), { min: 1 });

  // ---------------------------------------------------------------- running things
  def('Run', 'Syntax: *Run <filename> [<parameters>]', '*Run loads and executes a file.', async (a, ctx) => {
    const path = cli.findRunnable(a[0]);
    if (!path) throw new CLIError(`File '${a[0]}' not found`, 0x214);
    const tail = ctx.raw.replace(/^\s*("[^"]*"|\S+)\s*/, '');
    return cli.runFile(path, tail, ctx);
  }, { min: 1 });
  def('Obey', 'Syntax: *Obey [-v] [-c] [<filename> [<parameters>]]', '*Obey executes a file of * commands.', async (a, ctx) => {
    let raw = ctx.raw;
    while (/^\s*-[vc]\b/i.test(raw)) raw = raw.replace(/^\s*-[vc]\s*/i, '');   // -v verbose, -c cache: no difference here
    const file = splitArgs(raw)[0];
    if (!file) { if (ctx.inObey) throw new ObeyEnd(); return; }   // no file: end the Obey file being executed
    return cli.obey(file, { args: raw.replace(/^\s*("[^"]*"|\S+)\s*/, ''), out: ctx.out, depth: ctx.depth, safe: ctx.safe, quiet: ctx.safe });
  }, { noSplit: true });
  // Do (Sources/SystemRes/Boot/Source/Do): GSTrans the tail, then OSCLI it.
  def('Do', 'Syntax: *Do <*command>', '*Do GSTranses its argument and executes it as a * command.', async (a, ctx) => cli.run(sysvars.gstrans(ctx.raw), ctx), { noSplit: true });
  def('Exec', 'Syntax: *Exec [<filename>]', '*Exec takes keyboard input from a file.', async () => {});
  def('Spool', 'Syntax: *Spool [<filename>]', 'Sends output to a file.', async () => {});
  def('WimpTask', 'Syntax: *WimpTask <*command>', 'Start up a new task (from within a task).', async (a, ctx) => { setTimeout(() => cli.run(ctx.raw).catch((e) => wimp.reportError(e.message)), 0); }, { noSplit: true });
  def('Desktop', 'Syntax: *Desktop [<*command> | -File <filename>]', '*Desktop starts up any dormant Wimp modules.', async (a, ctx) => { cli.close(); if (ctx.raw.trim()) setTimeout(() => cli.run(ctx.raw).catch((e) => wimp.reportError(e.message)), 0); }, { noSplit: true });
  def('Filer_OpenDir', 'Syntax: *Filer_OpenDir <full dirname> [<x> <y> [<width> <height>]] [<switches>]', '*Filer_OpenDir may be used in the Desktop to open a directory viewer.', async (a) => {
    const nums = a.slice(1).filter((x) => /^-?\d+$/.test(x)).map(Number);
    const sw = a.slice(1).filter((x) => x.startsWith('-')).map((x) => x.toLowerCase());
    const opts = {};
    if (nums.length >= 2) { opts.x = nums[0] / 2; opts.y = wimp.height - nums[1] / 2; }
    if (nums.length >= 4) { opts.w = nums[2] / 2; opts.h = nums[3] / 2; }
    if (sw.includes('-smallicons')) opts.mode = 'small';
    if (sw.includes('-largeicons')) opts.mode = 'large';
    if (sw.includes('-fullinfo')) opts.mode = 'full';
    for (const s of ['name', 'type', 'size', 'date']) if (sw.includes('-sortby' + s)) opts.sort = s;
    cli.close();
    os.filer.openDir(a[0], opts);
  }, { min: 1 });
  def('Filer_CloseDir', 'Syntax: *Filer_CloseDir <full dirname>', '*Filer_CloseDir closes a directory viewer.', async (a) => { os.filer.closeDir(a[0]); }, { min: 1 });
  def('Filer_Run', 'Syntax: *Filer_Run <file>|<application>', '*Filer_Run is equivalent of double clicking on an object.', async (a) => { cli.close(); await os.filer.run(a[0]); }, { min: 1 });
  def('Filer_Boot', 'Syntax: *Filer_Boot <application>', '*Filer_Boot boots the application specified.', async (a) => {
    const sw = a.slice(1).map((x) => x.toLowerCase());
    const st = must(a[0]);
    if (st.isApp || sw.length === 0) await os.filer.bootApp(st.path);
  }, { min: 1 });
  def('Repeat', 'Syntax: *Repeat <command> <directory> [-Directories] [-Applications] [-Files] [-Type <type>] [-Tasks]', '*Repeat runs a command on each object in a directory.', async (a, ctx) => {
    const cmd = a[0], dir = a[1];
    if (!vfs.isDir(dir)) return;
    const sw = a.slice(2).map((x) => x.toLowerCase());
    const want = { dirs: sw.includes('-directories'), apps: sw.includes('-applications'), files: sw.includes('-files') };
    const any = !want.dirs && !want.apps && !want.files;
    for (const st of vfs.list(dir)) {
      const ok = any || (st.isApp ? want.apps : st.type === 'dir' ? want.dirs : want.files);
      if (!ok) continue;
      try { await cli.run(`${cmd} ${st.path}`, ctx); } catch { /* keep going */ }
    }
  }, { min: 2 });
  def('IfThere', 'Syntax: *IfThere <filename> Then <command> [Else <command>]', 'Conditionally executes a command if a file exists.', async (a, ctx) => {
    const m = /^\s*(\S+)\s+then\s+(.*?)(?:\s+else\s+(.*))?$/i.exec(ctx.raw);
    if (!m) throw new CLIError('Syntax: *IfThere <filename> Then <command> [Else <command>]');
    const there = (() => { try { return vfs.exists(m[1]); } catch { return false; } })();
    const c = there ? m[2] : m[3];
    if (c) await cli.run(c, ctx);
  }, { noSplit: true });
  def('If', 'Syntax: *If <expression> Then <command> [Else <command>]', 'Conditionally executes a command.', async (a, ctx) => {
    const m = /^\s*(.*?)\s+then\s+(.*?)(?:\s+else\s+(.*))?$/i.exec(ctx.raw);
    if (!m) throw new CLIError('Syntax: *If <expression> Then <command> [Else <command>]');
    const c = evalExpr(sysvars.gstrans(m[1], { noQuotes: true })) ? m[2] : m[3];   // keep "quotes": string comparisons
    if (c) await cli.run(c, ctx);
  }, { noSplit: true });
  def('Error', 'Syntax: *Error [<number>] <text>', '*Error generates an error with the given number and text.', async (a, ctx) => {
    const m = /^\s*(?:(&?[0-9a-f]+)\s+)?(.*)$/i.exec(ctx.raw);
    throw new CLIError(sysvars.gstrans(m[2]), 0);
  }, { noSplit: true });
  def('RMEnsure', 'Syntax: *RMEnsure <module title> <version number> [<*command>]', 'Checks a module is present.', async (a, ctx) => {
    const mod = MODULES.find((x) => x[0].toLowerCase() === (a[0] ?? '').toLowerCase());
    if (!mod || parseFloat(mod[1]) < parseFloat(a[1] ?? '0')) {
      // not present: only harmless for commands we can emulate
      const rest = ctx.raw.replace(/^\s*\S+\s+\S+\s*/, '');
      if (rest && !/^rmload|^error/i.test(rest.trim())) await cli.run(rest, ctx).catch((e) => { if (e?.obeyEnd) throw e; });
    }
  }, { noSplit: true });
  for (const n of ['RMLoad', 'RMRun', 'RMKill', 'RMReInit', 'RMTidy', 'Unplug', 'RMFaster', 'WimpSlot', 'ChangeDynamicArea', 'Hourglass', 'Pointer', 'X', 'FontInstall', 'FontLibrary', 'LoadCMOS', 'SaveCMOS', 'SetMacro_', 'PreDesktop', 'Key', 'TV', 'Mode', 'ScreenLoad', 'ScreenSave', 'SetPalette', 'WimpPalette', 'Shadow', 'Opt', 'Close', 'Shut', 'Mount', 'Dismount', 'AddApp', 'AppSize', 'BootLog', 'SafeLogon', 'ToolSprites', 'WimpWriteDir', 'WimpMode', 'RTCAdjust', 'Ignore', 'Ecf', 'AddToRMA', 'LoadModeFile', 'DosMap']) {
    const nm = n;
    if (!cli.commands.has(nm.toLowerCase())) def(nm, `Syntax: *${nm} ...`, `*${nm} (no effect in this emulation).`, async (a, ctx) => {
      if (nm === 'X') { try { await cli.run(ctx.raw, ctx); } catch { /* ignore */ } }
    }, { noSplit: nm === 'X' });
  }
  def('IconSprites', 'Syntax: *IconSprites <filename>', '*IconSprites loads a sprite file into the Wimp\'s common sprite pool.', async (a) => {
    let p = a[0];
    // prefer the 22 variant as the Wimp does in square-pixel modes
    try { if (vfs.exists(p + '22')) p = p + '22'; } catch { /* */ }
    const st = must(p);
    if (os.apps?.iconSprites(st.path)) return;
    sprites.addSpriteFile(await vfs.readFile(st.path), st.path);
  }, { min: 1 });
  def('WimpKillSprite', 'Syntax: *WimpKillSprite <spritename>', 'Remove a sprite from the wimp sprite pool.', async (a) => sprites.kill(a[0]), { min: 1 });
  def('Pin', 'Syntax: *Pin <pathname> <x> <y>', '*Pin adds a file, application or directory to the desktop pinboard.', async (a) => { os.pinboard?.pin(a[0], +a[1] / 2, wimp.height - +a[2] / 2); }, { min: 1 });
  def('Pinboard', 'Syntax: *Pinboard [-Grid]', '*Pinboard clears the pinboard.', async () => { os.pinboard?.clear(); });
  def('BackDrop', 'Syntax: *BackDrop [-Centre | -Tile | -Scale | -Remove] [<pathname>]', '*BackDrop puts a sprite on the desktop background.', async (a) => {
    const sw = a.filter((x) => x.startsWith('-')).map((x) => x.toLowerCase());
    const file = a.find((x) => !x.startsWith('-'));
    if (sw.includes('-remove')) return os.pinboard?.removeBackdrop();
    const mode = sw.includes('-tile') ? 'tile' : sw.includes('-centre') ? 'centre' : 'scale';
    if (file) await os.pinboard?.setBackdrop(file, mode);
  });
  def('AddTinyDir', 'Syntax: *AddTinyDir [<pathname>]', '*AddTinyDir adds an object to the icon bar.', async (a) => { os.pinboard?.addTinyDir?.(a[0]); });
  registerResetCommands(def);    // *ResetDisc, *ResetCMOS (src/core/reset.js)
  registerSoundCommands(def);    // *Voices, *ChannelVoice, *Volume, *Sound, *Tuning, *Stereo, *Speaker, *Audio, *Tempo, *QSound
  def('Shutdown', 'Syntax: *Shutdown', '*Shutdown closes files, logs off file servers and makes the machine ready to switch off.', async () => { os.switcher?.shutdown(); });
  def('TaskWindow', 'Syntax: *TaskWindow [<command>] [[-wimpslot] <n>K] [[-name] <taskname>] [-ctrl] [-display] [-quit]', 'Starts a task window.', async (a, ctx) => { os.hooks?.taskWindow?.(ctx.raw); }, { noSplit: true });
  def('ShellCLI', 'Syntax: *ShellCLI', 'Used by a Wimp program to create a CLI shell.', async () => { cli.open(); });

  // ---------------------------------------------------------------- variables
  def('Set', 'Syntax: *Set <varname> <value>', '*Set assigns a string value to a system variable.', async (a, ctx) => {
    const m = /^\s*(\S+)\s?(.*)$/.exec(ctx.raw);
    if (!m) throw new CLIError('Syntax: *Set <varname> <value>');
    sysvars.set(m[1], sysvars.gstrans(m[2]));
  }, { noSplit: true });
  def('SetMacro', 'Syntax: *SetMacro <varname> <value>', '*SetMacro assigns a macro value to a system variable.', async (a, ctx) => {
    const m = /^\s*(\S+)\s?(.*)$/.exec(ctx.raw);
    sysvars.set(m[1], m[2], 'macro');
  }, { noSplit: true });
  def('SetEval', 'Syntax: *SetEval <varname> <expression>', '*SetEval evaluates an expression and assigns it to a system variable.', async (a, ctx) => {
    const m = /^\s*(\S+)\s?(.*)$/.exec(ctx.raw);
    const v = evalExpr(m[2]);
    if (typeof v === 'string') sysvars.set(m[1], v); else sysvars.set(m[1], v | 0, 'number');
  }, { noSplit: true });
  def('Unset', 'Syntax: *Unset <varname>', '*Unset deletes a system variable.', async (a) => { sysvars.unset(a[0]); }, { min: 1 });
  def('Show', 'Syntax: *Show [<variable>]', '*Show lists system variables matching the name given, or all system variables if no name is specified.', async (a, { out }) => {
    for (const v of sysvars.list(a[0] ?? '*')) {
      if (v.type === 'number') out.writeln(`${v.name}(Number) : ${v.value}`);
      else if (v.type === 'macro') out.writeln(`${v.name}(Macro) : ${v.value}`);
      else if (v.type === 'code') out.writeln(`${v.name} : ${v.value()}`);
      else out.writeln(`${v.name} : ${printable(v.value)}`);
    }
  });
  def('Echo', 'Syntax: *Echo <string>', '*Echo sends a string to the VDU, after transformation by GSRead.', async (a, { out, raw }) => out.writeln(sysvars.gstrans(raw)), { noSplit: true });
  def('Eval', 'Syntax: *Eval <expression>', '*Eval evaluates an integer or string expression.', async (a, { out, raw }) => {
    const v = evalExpr(raw);
    out.writeln(typeof v === 'string' ? `Result is a string, value : ${v}` : `Result is an integer, value : ${v | 0}`);
  }, { noSplit: true });
  def('Alias', 'Syntax: *Alias <name> <value>', 'Sets an alias.', async (a, ctx) => {
    const m = /^\s*(\S+)\s?(.*)$/.exec(ctx.raw);
    if (!m) { for (const v of sysvars.list('Alias$*')) ctx.out.writeln(`${v.name.slice(6)} : ${v.value}`); return; }
    sysvars.set('Alias$' + m[1], m[2]);
  }, { noSplit: true });

  // ---------------------------------------------------------------- system
  def('Help', 'Syntax: *Help [<subjects>]', '*Help gives brief information about each command in the machine.', async (a, { out }) => {
    if (!a.length) {
      out.writeln('*Help gives brief information about each command in the machine.');
      out.writeln('Syntax: *Help <keywords>');
      out.writeln('');
      out.writeln('Useful keywords are: Commands, FileCommands, Modules, Desktop.');
      return;
    }
    for (const k of a) {
      const l = k.toLowerCase().replace(/\.$/, '');
      if (l === 'commands' || l === 'filecommands' || l === 'desktop') {
        out.writeln(`==> Help on keyword ${k}`);
        const names = [...cli.commands.values()].map((c) => c.name).filter((n) => n !== '.' && !n.startsWith('@')).sort();
        let line = '';
        for (const n of names) { if ((line + n).length > (out.cols ?? 80) - 12) { out.writeln('  ' + line); line = ''; } line += n.padEnd(12); }
        if (line) out.writeln('  ' + line);
        continue;
      }
      if (l === 'modules') {
        out.writeln('==> Help on keyword Modules');
        for (const [n, v] of MODULES) out.writeln(`${n.padEnd(20)}${v}`);
        continue;
      }
      const hits = [...cli.commands.values()].filter((c) => c.name.toLowerCase().startsWith(l) && c.name !== '.');
      if (!hits.length) { out.writeln('No help found.'); continue; }
      for (const c of hits) {
        out.writeln(`==> Help on keyword ${c.name}`);
        if (c.help) out.writeln(c.help);
        if (c.syntax) out.writeln(c.syntax);
      }
    }
  });
  def('Modules', 'Syntax: *Modules', '*Modules lists the relocatable modules currently in the machine.', async (a, { out }) => {
    out.writeln('No. Position Workspace Name');
    MODULES.forEach(([n], i) => out.writeln(`${String(i + 1).padStart(3)} ${H8(0x03800000 + i * 0x2340)} ${H8(0x01800000 + i * 0x120)} ${n}`));
  });
  def('ROMModules', 'Syntax: *ROMModules', '*ROMModules lists the modules in ROM.', async (a, { out }) => {
    out.writeln('No. Position    Module Name             Version  Status');
    MODULES.forEach(([n, v], i) => out.writeln(`${String(i + 1).padStart(3)} System ROM  ${n.padEnd(24)}${v.padEnd(9)}Active`));
  });
  def('Time', 'Syntax: *Time', '*Time displays the time and date.', async (a, { out }) => out.writeln(sysvars.get('Sys$Time') ? timeString() : timeString()));
  def('FX', 'Syntax: *FX <r0> [[,] <r1> [[,] <r2>]]', '*FX calls OS_Byte.', async () => {});
  def('Configure', 'Syntax: *Configure [<keyword> [<value>]]', '*Configure sets the values held in the non-volatile memory.', async (a, { out }) => {
    if (!a.length) {
      out.writeln('Syntax: *Configure <option> <parameters>');
      for (const k of ['Buttons      Menu|Adjust  (right mouse button)', 'Textured     On|Off', 'WimpDoubleClickDelay <n>', 'WimpDragMove <n>', 'WimpFlags    <n>', 'WimpFont     0|1  (0 = Homerton, 1 = system font)', 'Zoom         1|2']) out.writeln('  ' + k);
      return;
    }
    if (!os.config?.set?.(a[0], a.slice(1).join(' '))) throw new CLIError('Bad configure option', 0);
  });
  def('Status', 'Syntax: *Status [<option>]', '*Status shows the configured values held in non-volatile memory.', async (a, { out }) => {
    const rows = [['Baud', '4'], ['Boot', ''], ['Caps', ''], ['Delay', '32'], ['DumpFormat', '4'], ['FileSystem', 'ADFS'], ['FontSize', '64K'], ['Language', '4'], ['Mode', 'Auto'], ['MouseStep', '2'], ['RAMFSSize', '1024K'], ['Repeat', '8'], ['ScreenSize', '160K'], ['SpriteSize', '0K'], ['WimpDragDelay', '5'], ['WimpDoubleClickDelay', '10'], ['WimpFlags', '111'], ['WimpMode', 'X1024 Y768 C256']];
    for (const [k, v] of rows) if (!a[0] || k.toLowerCase().startsWith(a[0].toLowerCase())) out.writeln(`${k.padEnd(18)}${v}`);
  });
  def('Basic', 'Syntax: *BASIC [-help] [-chain|-quit|-load] [<filename>]', '*BASIC starts the BBC BASIC V interpreter.', async (a, ctx) => {
    if (!os.hooks?.basic) throw new CLIError('BASIC is not available', 0);
    return os.hooks.basic(a, ctx);
  });
  def('Quit', 'Syntax: *Quit', 'Leaves the current application.', async () => {});
  def('Reset', 'Syntax: *Reset', 'Reset the machine.', async () => { location.reload(); });
}

function printable(s) {
  return String(s).replace(/[\x00-\x1f\x7f]/g, (c) => (c === '\x7f' ? '|?' : '|' + String.fromCharCode(c.charCodeAt(0) + 64)));
}

export function timeString(d = new Date()) {
  const D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p = (n) => String(n).padStart(2, '0');
  return `${D[d.getDay()]},${p(d.getDate())} ${M[d.getMonth()]} ${d.getFullYear()}.${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Minimal OS_EvaluateExpression: integers, strings in quotes, + - * / MOD, comparisons, = <>, AND OR NOT, LEN, sysvars. */
export function evalExpr(src) {
  const toks = [];
  const re = /\s*(?:(&[0-9a-fA-F]+|\d+)|("(?:[^"]|"")*")|(<>|>=|<=|<<|>>|[-+*/=<>()])|([A-Za-z_$@][\w$@.:]*))/y;
  let m, s = String(src);
  re.lastIndex = 0;
  while (re.lastIndex < s.length && (m = re.exec(s))) {
    if (m[1]) toks.push({ n: m[1].startsWith('&') ? parseInt(m[1].slice(1), 16) : parseInt(m[1], 10) });
    else if (m[2]) toks.push({ s: m[2].slice(1, -1).replace(/""/g, '"') });
    else if (m[3]) toks.push({ op: m[3] });
    else toks.push({ id: m[4] });
    if (/^\s*$/.test(s.slice(re.lastIndex))) break;
  }
  let i = 0;
  const peek = () => toks[i];
  const opIs = (o) => peek() && (peek().op === o || (peek().id && peek().id.toUpperCase() === o));
  const prim = () => {
    const t = toks[i++];
    if (!t) return 0;
    if (t.n != null) return t.n;
    if (t.s != null) return t.s;
    if (t.op === '(') { const v = or(); i++; return v; }
    if (t.op === '-') return -prim();
    if (t.op === '+') return prim();
    const u = t.id.toUpperCase();
    if (u === 'NOT') return ~prim();
    if (u === 'LEN') return String(prim()).length;
    if (u === 'TRUE') return -1;
    if (u === 'FALSE') return 0;
    const v = sysvars.get(t.id);
    if (v == null) return t.id;
    const e = sysvars.entry(t.id);
    return e?.type === 'number' ? +v : (/^-?\d+$/.test(v) ? +v : v);
  };
  const mul = () => { let v = prim(); while (opIs('*') || opIs('/') || opIs('MOD')) { const o = toks[i++]; const r = prim(); const oo = o.op ?? o.id.toUpperCase(); v = oo === '*' ? v * r : oo === '/' ? Math.trunc(v / r) : v % r; } return v; };
  const add = () => { let v = mul(); while (opIs('+') || opIs('-')) { const o = toks[i++].op; const r = mul(); v = o === '+' ? (typeof v === 'string' || typeof r === 'string' ? String(v) + String(r) : v + r) : v - r; } return v; };
  const cmp = () => {
    let v = add();
    while (peek() && ['=', '<>', '<', '>', '<=', '>='].includes(peek().op)) {
      const o = toks[i++].op; const r = add();
      const a = typeof v === 'string' || typeof r === 'string' ? [String(v), String(r)] : [v, r];
      const res = o === '=' ? a[0] === a[1] : o === '<>' ? a[0] !== a[1] : o === '<' ? a[0] < a[1] : o === '>' ? a[0] > a[1] : o === '<=' ? a[0] <= a[1] : a[0] >= a[1];
      v = res ? -1 : 0;
    }
    return v;
  };
  const and = () => { let v = cmp(); while (opIs('AND')) { i++; v = v & cmp(); } return v; };
  const or = () => { let v = and(); while (opIs('OR') || opIs('EOR')) { const o = toks[i++].id.toUpperCase(); const r = and(); v = o === 'OR' ? v | r : v ^ r; } return v; };
  const v = or();
  return typeof v === 'number' ? v | 0 : v;
}

export { HELP };
