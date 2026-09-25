// JavaScript programs on the disc: files of type &F81 (JSScript) run with *JSRun (Alias$@RunType_F81), so a
// program written in !Edit can be saved and double-clicked, like a BASIC program. The book
// $.Manuals.JSTutor ("Programming in JavaScript") teaches with it.
//
// Two forms:
//   * a script (no import / export): its code runs with these names ready to use:
//       task, ctx, os, wimp, vfs, print, input, sleep, Menu, colourMenu, wimpColour, beep, sound, saveAs,
//       query, infoBox
//   * a module (uses import / export), like the desktop's own applications:
//       import { print, Menu } from 'riscos';           // the same names as above (except task / ctx)
//       import { drawGrid } from './Grid';              // another file in the same directory (Grid or Grid/js)
//       export default function start(task, ctx) { ... }
//
// ctx: {args (the command tail), argv (split), file (the program's full path), dir (its directory), os}.
// Each program is a Wimp task named after its file (or its application, for <App>.!RunImage). print() and
// input() use the task window it was run from, or open an output window for it. A program that has nothing
// left running (no windows, icon bar icons or timers) when its code ends has finished: the task ends, or,
// if it printed anything, when its output window is closed.
//
// Errors, including ones in event handlers and timers later on, are reported in a "Message from <program>"
// box that gives the line number.

import { wimp } from './wimp.js';
import { vfs } from './vfs.js';
import { os } from './os.js';
import { cli, CLIError, splitArgs } from './cli.js';
import { Menu, colourMenu } from './menu.js';
import { wimpColour } from './palette.js';
import { saveAs, query, infoBox } from './dialogs.js';
import { TextConsole, loadSystemFont } from './console.js';
import { sprites, SpriteInfo } from './sprites.js';

const runs = new Map();          // blob URL -> {path, offset, task}
let seq = 0;
globalThis.__jsrun ??= {};

// ---------------------------------------------------------------- output window
const COLS = 72, ROWS = 20;
let opened = 0;                  // output windows opened, to stagger them

/** print / input through the task window a program was run from. */
function taskWindowIO(tw) {
  return {
    write: (s) => tw.out.write(s),
    readLine: () => tw.readLine(),
    finished() {},
    get used() { return false; },
  };
}

/** print / input through a window of the program's own, opened when it first prints. */
function windowIO(task, title) {
  let w = null, con = null, used = false, done = false;
  let waiter = null, line = '';
  const open = async () => {
    await loadSystemFont();
    if (w || !task.alive) return;
    const stagger = opened++ % 6;
    con = new TextConsole({ cols: COLS, rows: ROWS, charW: 8, charH: 16, fg: '#000000', bg: '#ffffff' });
    con.cursorOn = false;
    w = task.createWindow({
      title, flags: { back: true, close: true, title: true, moveable: true },
      colours: { workBg: 0 },
      extent: { w: COLS * 8, h: ROWS * 16 }, w: COLS * 8, h: ROWS * 16,
      x: Math.max(8, Math.round((wimp.width - COLS * 8) / 2)) + stagger * 24, y: Math.max(40, Math.round(wimp.height / 4)) + stagger * 24,
    });
    w._jsOutput = true;
    w.work.appendChild(con.canvas);
    w.on('click', () => { wimp.setCaret(w); return true; });
    w.on('key', (ev) => {
      if (!waiter) return false;
      const k = ev.code;
      if (k === 13) { con.cursorOn = false; con._hideCursor(); con.write('\n'); const r = waiter, s = line; waiter = null; line = ''; r(s); }
      else if ((k === 8 || k === 127) && line.length) { line = line.slice(0, -1); con.write('\x7f'); }
      else if (k >= 32 && k < 256 && k !== 127) { line += String.fromCharCode(k); con.write(String.fromCharCode(k)); }
      return true;
    });
    w.on('close', (ev) => { ev.preventDefault(); task.quit(); });
    task.on('quit', () => con.destroy());
    w.open({ behind: 'top' });
  };
  let opening = null;
  const ready = () => (opening ??= open());
  return {
    async write(s) { used = true; await ready(); con?.write(s); },
    async readLine() {
      used = true; await ready();
      if (!con) return '';
      con.cursorOn = true;
      wimp.setCaret(w);
      return new Promise((r) => { waiter = r; });
    },
    finished() {
      if (done) return;
      done = true;
      if (w) w.setTitle(`${title} (finished)`);
    },
    get used() { return used; },
  };
}

/** Text for print(): strings as they are, other values much as the browser's console shows them. */
export function show(v, depth = 0) {
  if (typeof v === 'string') return depth ? JSON.stringify(v) : v;
  if (v === null || v === undefined || typeof v !== 'object') {
    if (typeof v === 'function') return `function ${v.name || ''}`.trim();
    return String(v);
  }
  if (depth > 2) return Array.isArray(v) ? '[...]' : '{...}';
  if (Array.isArray(v)) return '[' + v.map((x) => show(x, depth + 1)).join(', ') + ']';
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  return '{' + Object.entries(v).map(([k, x]) => `${k}: ${show(x, depth + 1)}`).join(', ') + '}';
}

// ---------------------------------------------------------------- errors with line numbers
/** Where an error happened in a program: {task, path, line} or null. */
function locate(e) {
  const stack = String(e?.stack ?? '');
  for (const [url, r] of runs) {
    const i = stack.indexOf(url + ':');
    if (i >= 0) {
      const m = /^:(\d+)/.exec(stack.slice(i + url.length));
      if (m) return { ...r, line: +m[1] - r.offset };
    }
  }
  return null;
}
function describe(e, where) {
  const msg = e?.message ?? String(e);
  if (!where) return msg;
  const file = vfs.leaf(where.path);
  return `${msg} (line ${where.line}${where.main ? '' : ` of ${file}`})`;
}
/** Report an error from a program (used for errors in its event handlers and timers too). */
function reportFor(task, e, where = locate(e)) {
  console.error(e);
  wimp.reportError(describe(e, where), { appName: task?.name ?? 'JSRun' });
}
/** Errors from event handlers (util.js) and uncaught ones: claim those that come from a program. */
function claim(e) {
  const where = locate(e);
  if (!where) return false;
  reportFor(where.task, e, where);
  return true;
}

// ---------------------------------------------------------------- loading code
/** Load a script: its code becomes the body of an async function taking `names`. */
function loadScript(src, names, info) {
  const id = ++seq;
  const code = `globalThis.__jsrun[${id}] = async function (${names.join(', ')}) {\n${src}\n};\n`;
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  runs.set(url, { ...info, offset: 1 });
  return new Promise((resolve, reject) => {
    let failed = null;
    const onErr = (ev) => { if (ev.filename === url) { failed = ev; ev.preventDefault(); } };
    window.addEventListener('error', onErr);
    const s = document.createElement('script');
    const end = () => { window.removeEventListener('error', onErr); s.remove(); };
    s.onload = () => {
      end();
      const fn = globalThis.__jsrun[id];
      delete globalThis.__jsrun[id];
      if (failed || !fn) {
        const e = new SyntaxError(String(failed?.message ?? 'Syntax error').replace(/^Uncaught SyntaxError: /, ''));
        e.where = { ...info, line: Math.max(1, (failed?.lineno ?? 1) - 1) };
        reject(e);
      } else resolve(fn);
    };
    s.onerror = () => { end(); reject(new Error('Could not load the program')); };
    s.src = url;
    document.head.appendChild(s);
  });
}

/** The 'riscos' module a program's modules import from (one per run: print and input belong to the run). */
function riscosModule(env) {
  if (env.url) return env.url;
  const id = ++seq;
  globalThis.__jsrun[id] = env.names;
  const code = `const R = globalThis.__jsrun[${id}];\n` + Object.keys(env.names).map((n) => `export const ${n} = R.${n};`).join('\n') + '\n';
  env.url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  env.id = id;
  return env.url;
}

/** RISC OS path of a relative import ('./Grid', '../lib/Grid.js') from a file in dir. */
function resolveImport(dir, spec) {
  const parts = spec.split('/');
  let base = dir;
  for (const p of parts.slice(0, -1)) {
    if (p === '.' || p === '') continue;
    base = p === '..' ? vfs.parent(base) : `${base}.${p}`;
  }
  const leaf = parts[parts.length - 1];
  for (const cand of [leaf.replace(/\./g, '/'), leaf.replace(/\.m?js$/i, '')]) {
    const p = `${base}.${cand}`;
    if (vfs.exists(p)) return vfs.canonical(p);
  }
  throw new Error(`Can't find '${spec}' (imported by a program in ${dir})`);
}

/** Load a module and (first) the modules it imports from the disc. Resolves its blob URL. */
async function moduleURL(path, info, cache, env) {
  const key = path.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    const src = await vfs.readText(path);
    const dir = vfs.parent(path);
    const specs = [];
    const re = /(\b(?:import|export)\b[^'";]*?\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"\n]+)\2/g;
    for (const m of src.matchAll(re)) specs.push(m[3]);
    const urls = new Map();
    for (const s of specs) {
      if (s === 'riscos') urls.set(s, riscosModule(env));
      else if (s.startsWith('./') || s.startsWith('../')) urls.set(s, await moduleURL(resolveImport(dir, s), info, cache, env));
    }
    const code = src.replace(re, (all, pre, q, s) => (urls.has(s) ? `${pre}${q}${urls.get(s)}${q}` : all));
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    runs.set(url, { ...info, path, main: path === info.path, offset: 0 });
    return url;
  })();
  cache.set(key, p);
  return p;
}

/** The line of a syntax error in a module (import() doesn't say): load it as a <script type=module>. */
function moduleSyntaxLine(urls) {
  return new Promise((resolve) => {
    let found = null;
    const onErr = (ev) => { if (runs.has(ev.filename)) { found = { ...runs.get(ev.filename), line: ev.lineno }; ev.preventDefault(); } };
    window.addEventListener('error', onErr);
    const s = document.createElement('script');
    s.type = 'module';
    const end = () => { window.removeEventListener('error', onErr); s.remove(); resolve(found); };
    s.onload = end; s.onerror = end;
    setTimeout(end, 2000);
    s.src = urls;
    document.head.appendChild(s);
  });
}

const isModule = (src) => /^\s*(import|export)\b(?!\s*\()/m.test(src);

// ---------------------------------------------------------------- *JSRun
/** Run the program in `path`. cliCtx: the *command's context (a task window's is ctx.tw). */
export async function jsRun(path, tail = '', cliCtx = {}) {
  const st = vfs.stat(path);
  if (!st || st.type !== 'file') throw new CLIError(`File '${path}' not found`, 0x214);
  const dir = vfs.parent(st.path);
  const name = /^!runimage$/i.test(st.name) ? vfs.leaf(dir).replace(/^!/, '') : st.name.replace(/\/m?js$/i, '');
  const src = await vfs.readText(st.path);

  const task = wimp.createTask(name, { memory: 32 });
  const io = cliCtx.tw ? taskWindowIO(cliCtx.tw) : windowIO(task, name);
  const print = (...a) => { const t = a.map((x) => show(x)).join(' ') + '\n'; os.hooks.jsOutput?.(task, t); io.write(t); };
  const input = async (prompt = '') => {
    if (prompt) io.write(String(prompt));
    const canned = os.hooks.jsInput;                 // tests: answers to give instead of waiting for keys
    if (canned?.length) { const s = String(canned.shift()); io.write(s + '\n'); return s; }
    return io.readLine();
  };
  const ctx = { args: tail, argv: splitArgs(tail ?? ''), file: st.path, dir, os };
  const info = { task, path: st.path, main: true };
  const mine = [];
  task.on('quit', () => { for (const u of mine) { runs.delete(u); URL.revokeObjectURL(u); } });

  try {
    if (isModule(src)) {
      const env = { names: { ...globalThis.__riscos, print, input } };
      const cache = new Map();
      const url = await moduleURL(st.path, info, cache, env);
      for (const p of cache.values()) mine.push(await p);
      if (env.url) { mine.push(env.url); task.on('quit', () => delete globalThis.__jsrun[env.id]); }
      let m;
      try { m = await import(url); } catch (e) {
        if (e instanceof SyntaxError) e.where = await moduleSyntaxLine(url);
        throw e;
      }
      const start = m.default ?? m.start;
      if (typeof start !== 'function') throw new Error(`${name} doesn't export a start function (export default function start(task, ctx) { ... })`);
      await start(task, ctx);
    } else {
      const helpers = { task, ctx, os, ...globalThis.__riscos, print, input };
      const fn = await loadScript(src, Object.keys(helpers), info);
      for (const [u, r] of runs) if (r.task === task) mine.push(u);
      await fn(...Object.values(helpers));
    }
  } catch (e) {
    if (e?.escape) throw e;
    reportFor(task, e, e.where ?? locate(e));
    if (!io.used) task.quit(); else io.finished();
    return;
  }
  // finished? (nothing left that could run more of the program)
  if (!task.alive) return;
  const busy = [...task.windows].some((w) => !w._jsOutput) || task.iconbarIcons.size || task.timers.size;
  if (busy) return;
  if (io.used && !cliCtx.tw) io.finished();
  else task.quit();
}

/** Filer icons for JSScript files (file_f81, small_f81): the BASIC file's frame with "JS" in it. */
async function makeSprites() {
  const base = sprites.get('file_ffb');
  if (!base) return;
  const src = await base.canvas().catch(() => null);
  if (!src) return;
  const draw = (size) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, 0, size, size);
    const m = Math.max(1, Math.round(size / 17));
    g.fillStyle = '#ffffff'; g.fillRect(m, m, size - 2 * m, size - 2 * m);
    g.fillStyle = '#eecc00'; g.fillRect(m, size * 0.55, size - 2 * m, size * 0.45 - m);
    g.fillStyle = '#000000';
    g.font = `bold ${Math.round(size * 0.42)}px Homerton, Helvetica, Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText('JS', size / 2, size - m - Math.round(size * 0.08));
    g.fillStyle = '#444444';
    for (let i = 0; i < 3; i++) g.fillRect(m * 3, m * 3 + i * m * 3, (size - 8 * m) * [1, 0.6, 0.8][i], m);
    return c;
  };
  const info = (name, size) => {
    const c = draw(size);
    return [name, new SpriteInfo({ name, osW: size * 2, osH: size * 2, w: size, h: size, url: c.toDataURL(), canvas: c })];
  };
  sprites.addArea(new Map([info('file_f81', 34), info('small_f81', 18)]), 'jsrun');
}

/** Install *JSRun, the &F81 run action and the error hooks. */
export function installJSRun() {
  globalThis.__riscos = {
    Menu, colourMenu, wimpColour, saveAs, query, infoBox,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    beep: () => wimp.beep?.(),
    sound: (channel, amplitude, pitch, duration) => import('./sound/index.js').then((s) => s.soundSystem().control(channel, amplitude, pitch, duration)),
    print: (...a) => console.log(...a), input: async () => '',
    os, wimp, vfs,
  };
  cli.register('JSRun', {
    syntax: 'Syntax: *JSRun <filename> [<parameters>]',
    help: '*JSRun runs a JavaScript program (a JSScript file, &F81). See $.Manuals.JSTutor.',
    min: 1, noSplit: true,
    run: async ([raw], ctx) => {
      const [file] = splitArgs(raw);
      const tail = raw.replace(/^\s*("[^"]*"|\S+)\s*/, '');
      return jsRun(file, tail, ctx);
    },
  });
  os.hooks = os.hooks ?? {};
  os.hooks.programError = claim;
  makeSprites();
  window.addEventListener('error', (ev) => { if (ev.error && claim(ev.error)) ev.preventDefault(); });
  window.addEventListener('unhandledrejection', (ev) => { if (ev.reason && claim(ev.reason)) ev.preventDefault(); });
}
