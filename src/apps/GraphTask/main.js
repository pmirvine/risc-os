// !GraphTask: an icon on the right of the icon bar while it runs. Each program runs in a graphics task window of
// its own (src/core/basicwimp/runner.js startBasicWindow): its own screen mode, palette and speed, multitasking.
//
//   Select (or Adjust) on the icon   a new window at BASIC's > prompt (in the Choices' mode, MODE 12 at first)
//   BASIC files dropped on the icon  (or on !GraphTask in a Filer window) run, each in its own window
//   Menu on the icon                 Info, New task, Choices..., Quit (asks first while programs are running)
//   *GraphTask <file> [<args>]       the same from the command line, Obey files and !Run files (starts the app)
//   Run <GraphTask$Dir> <files>      each file in its own window, as David Ruck's !GraphTask
//
// Each window's menu (Menu over it; Shift-Menu in "Menu button" mode): Menu button, Suspend, Resume, Kill, Restart,
// Speed >, Scale >, Full screen (Alt-Return), Save screen > (a Sprite file). Closing a window whose program is still
// running asks first. Shift-drag the picture (with Select) to a Filer window to save it as a sprite.
// Choices (Choices:GraphTask): the speed, scale and prompt mode new windows start with, and whether double-clicking a
// BASIC file runs it in a window while !GraphTask is loaded (it claims the Filer's DataOpen), instead of full screen.
import { wimp } from '../../core/wimp.js';
import { os } from '../../core/os.js';
import { vfs } from '../../core/vfs.js';
import { input } from '../../core/input.js';
import { Menu } from '../../core/menu.js';
import { infoBox, query, saveAs, dragSave } from '../../core/dialogs.js';
import { choices } from '../../core/choices.js';
import { typeName } from '../../core/filetypes.js';
import { SPEEDS } from '../../core/basicwimp/scheduler.js';

export const DEFAULTS = { speed: 'strongarm', scale: 1, mode: 12, doubleClick: false };
const T_BASIC = 0xFFB, T_TEXT = 0xFFF, T_SPRITE = 0xFF9;
const PROMPT_NAME = 'Graphic task window';
const SCALES = [[1, '1:1'], [2, 'x2'], ['fit', 'Fit window']];

let app = null;               // the running !GraphTask: {task, open, ...}
let starting = null;

/** The running !GraphTask (null if it isn't running). */
export const current = () => app;

/** Start !GraphTask if it isn't running; resolves to it. */
export async function ensureRunning() {
  if (app) return app;
  starting ??= os.apps.start('GraphTask', '').finally(() => { starting = null; });
  await starting;
  if (!app) throw new Error('GraphTask could not be started');
  return app;
}

/** *BASIC -window (os.hooks.basicWindow): a window owned by !GraphTask. */
export async function openWindow(o) { return (await ensureRunning()).open(o); }

/** *GraphTask [<file> [<args>]] */
export async function command(argv = []) {
  const a = await ensureRunning();
  if (!argv.length) return a.open({});
  const file = argv[0];
  const st = vfs.stat(file);
  if (!st || st.type !== 'file') throw Object.assign(new Error(`File '${file}' not found`), { errnum: 0x214 });
  await a.open({ file: st.path, args: argv.slice(1).join(' ') });
}

const leaf = (p) => String(p).replace(/^.*[.:]/, '');

export default async function start(task, ctx) {
  let prefs = await choices.read('GraphTask', DEFAULTS);
  const procs = new Set();                     // the BasicProcesses in our windows
  const running = () => [...procs].filter((p) => p.running && !p.bridge);

  // ---------------------------------------------------------------- windows
  /** A new graphics task window: o.file (+ o.args), o.program (+ o.name), or neither for the > prompt. */
  async function open(o = {}) {
    const { startBasicWindow } = await import('../../core/basicwimp/runner.js');
    const hasProgram = !!o.file || o.program != null;
    const prompt = o.prompt ?? !hasProgram;
    let p;
    try {
      p = await startBasicWindow({
        file: o.file ?? undefined, program: o.program, args: o.args ?? '',
        name: o.name ?? (hasProgram ? undefined : PROMPT_NAME),
        prompt, run: o.run,
        speed: prefs.speed, scale: prefs.scale,
        mode: hasProgram ? 12 : (prefs.mode ?? 12),
        // a prompt shows at once; a program when it first writes to the screen (a Wimp program never needs one)
        open: hasProgram ? 'output' : 'now',
        ctx: o.ctx,
        onMenu: (ev, pr) => pr.openMenu(windowMenu(pr), ev),
        onClose: (pr) => { if (pr.running && !pr.bridge) { confirmClose(pr); return true; } return false; },
        onState: (pr) => stateChanged(pr),
        onEnd: (pr) => stateChanged(pr),
      });
    } catch (e) {
      task.reportError(e.message ?? String(e));
      return null;
    }
    procs.add(p);
    stateChanged(p);
    return p;
  }

  /** Run files (a drop, *Run with files): BASIC programs (and text listings) each in a window of its own. */
  async function runFiles(files) {
    for (const f of files) {
      const st = typeof f === 'string' ? vfs.stat(f) : (f.path ? vfs.stat(f.path) ?? f : f);
      if (!st) { task.reportError(`File '${f.path ?? f}' not found`); continue; }
      if (st.type !== 'file' || (st.filetype !== T_BASIC && st.filetype !== T_TEXT)) {
        task.reportError(`'${leaf(st.path ?? st.name)}' isn't a BASIC program${st.type === 'file' ? ` (it is a ${typeName(st.filetype)} file)` : ''}`);
        continue;
      }
      await open({ file: st.path });
    }
  }

  function stateChanged(p) {
    // gone: closed (the window deleted) or become a desktop task (Wimp_Initialise)
    if (p.bridge || (p.ended && !p.window && !p.task)) procs.delete(p);
    else if (p.window && p._gtWindow !== p.window) hookWindow(p);
    if (wimp.menus?.isOpen) wimp.menus.refresh();
  }

  /** Our extras on a program's window: files dropped on it, Shift-Select drag of the picture to save it. */
  function hookWindow(p) {
    const win = p._gtWindow = p.window;
    win.helpText = `This is a graphics task window: '${p.name}'.|MClick SELECT in it to give it the keyboard.|MClick MENU for the GraphTask menu (Shift-MENU in Menu button mode).|MShift-drag the picture with SELECT to a directory display to save it as a sprite.`;
    // a file dropped on the window: its pathname is typed, as in a task window (the program running: a > prompt)
    win.on('dataload', (ev) => {
      const f = ev.files?.[0];
      if (!f) return true;
      if (p.running && !p.bridge) { for (const ch of f.path + (ev.shift ? ' ' : '')) p.machine?.keyPress(ch.charCodeAt(0)); }
      else runFiles(ev.files);
      return true;
    });
    // Shift-drag of the picture with the left button (Select; Shift+left is Adjust with *Configure Buttons Menu):
    // a Sprite file dragged to a Filer window (or an application). The program doesn't see the press.
    win.view.addEventListener('pointerdown', (e) => {
      if (!e.shiftKey || e.button !== 0 || e.ctrlKey || e.altKey || !p.windowDisplay?.canvas) return;
      e.stopPropagation(); e.preventDefault();
      const s = input.pos(e);
      const end = () => { window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); };
      const move = (ev) => {
        const q = input.pos(ev);
        if (Math.abs(q.x - s.x) + Math.abs(q.y - s.y) < (input.config?.dragMove ?? 6)) return;
        end();
        dragSave({ sx: q.x, sy: q.y, pointerEvent: ev, window: win }, { task, leafname: 'Screen', filetype: T_SPRITE, getData: () => spriteOf(p) });
      };
      const up = () => { end(); if (!win.hasFocus) wimp.setCaret(win); };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
    }, true);
  }

  /** The program's screen as a sprite file (the whole screen at 1:1, whatever the scale and scroll). */
  async function spriteOf(p) {
    const { screenToSpriteFile } = await import('../../basic/sprites.js');
    return screenToSpriteFile(p.vdu, { name: 'screen' });
  }

  async function confirmClose(p) {
    if (p._asking) return;
    p._asking = true;
    const r = await query({ task, title: 'GraphTask', message: `'${p.name}' is still running. Kill this program?`, buttons: ['Kill', 'Cancel'] });
    p._asking = false;
    if (r === 'Kill') p.close();
  }

  // ---------------------------------------------------------------- the window menu
  function windowMenu(p) {
    const speeds = new Menu('Speed', Object.entries(SPEEDS).map(([k, s]) => ({
      text: s.name, ticked: () => p.speed === k, action: () => p.setSpeed(k),
      help: k === 'unlimited' ? 'Click SELECT to run the program as fast as this computer can.' : `Click SELECT to run the program at about the speed of ${k === 'arm2' ? 'an A310 or A3000 (ARM2)' : k === 'arm3' ? 'an A5000 (ARM3)' : k === 'arm610' ? 'a Risc PC with an ARM610' : 'a StrongARM Risc PC'}.`,
    })));
    const scales = new Menu('Scale', SCALES.map(([v, text]) => ({
      text, ticked: () => p.scale === v, action: () => p.setScale(v),
      help: v === 'fit' ? 'Click SELECT to fit the whole screen into the window, whatever its size.' : `Click SELECT to show the program's screen ${v === 1 ? 'at its natural size' : 'twice the size'}.`,
    })));
    return new Menu('GraphTask', [
      { text: 'Menu button', ticked: () => p.menuButton, action: () => p.setMenuButton(!p.menuButton), dotted: true, help: 'Click SELECT to give MENU clicks over the window to the program (MOUSE sees button 2). Shift-MENU then opens this menu.' },
      { text: 'Suspend', shaded: () => p.ended || p.suspended, action: () => p.suspend(), help: 'Click SELECT to pause the program.' },
      { text: 'Resume', shaded: () => p.ended || !p.suspended, action: () => p.resume(), dotted: true, help: 'Click SELECT to let the program carry on.' },
      { text: 'Kill', shaded: () => p.ended, action: () => p.kill(), help: 'Click SELECT to stop the program. The window keeps its last picture.' },
      { text: 'Restart', action: () => p.restart(), dotted: true, help: 'Click SELECT to run the program again from the start (or a new > prompt).' },
      { text: 'Speed', submenu: speeds, help: 'Move the pointer right to choose how fast the program runs.' },
      { text: 'Scale', submenu: scales, help: 'Move the pointer right to choose the size of the picture.' },
      { text: 'Full screen', key: 'Alt-Return', action: () => p.fullScreen(true), dotted: true, help: 'Click SELECT to give the program the whole screen (Alt-Return in the window). Alt-Return goes back to the window.' },
      { text: 'Save screen', submenu: () => saveBox(p), help: 'Move the pointer right to save the program\'s screen as a sprite file.' },
    ], { help: 'This is the GraphTask menu for this window.' });
  }

  function saveBox(p) {
    const box = saveAs({ task, title: 'Save as', filename: 'Screen', filetype: T_SPRITE, getData: () => spriteOf(p) });
    box.on('menuclosed', () => box.delete());
    return box;
  }

  // ---------------------------------------------------------------- Choices
  let choicesWin = null;
  const RADIO = (x, y, w, text, name, esg, help) => ({ x, y, w, h: 28, text, sprite: 'radiooff', validation: 'Sradiooff,radioon', button: 'radio', esg, name, help });
  const choicesWindow = () => {
    if (choicesWin) return choicesWin;
    const W = 560, H = 322;
    const speedIcons = Object.entries(SPEEDS).map(([k, s], i) => RADIO(132 + (i % 3) * 136, 16 + Math.floor(i / 3) * 32, 132, s.name, 'speed_' + k, 1, `Click SELECT to start new windows at the speed of ${s.name === 'Unlimited' ? 'this computer' : 'a machine with ' + (k === 'strongarm' ? 'a StrongARM' : 'an ' + s.name)}.`));
    const scaleIcons = SCALES.map(([v, text], i) => RADIO(132 + i * 136, 96, 132, text, 'scale_' + v, 2, 'Click SELECT to choose the scale new windows start at.'));
    const w = choicesWin = task.createWindow({
      title: 'GraphTask choices', x: Math.round(wimp.width / 2 - W / 2), y: Math.round(wimp.height / 2 - H / 2), w: W, h: H, extent: { w: W, h: H },
      flags: { title: true, moveable: true, close: true, back: true },
      icons: [
        { x: 12, y: 16, w: 112, h: 28, text: 'Speed', rjustify: true },
        ...speedIcons,
        { x: 12, y: 96, w: 112, h: 28, text: 'Scale', rjustify: true },
        ...scaleIcons,
        { x: 12, y: 140, w: 250, h: 28, text: 'Prompt windows start in MODE', rjustify: true },
        { x: 270, y: 138, w: 64, h: 32, text: '12', button: 'writable', border: true, filled: true, bg: 0, validation: 'R7;A0-9', maxLen: 3, name: 'mode', help: 'The screen mode a new window at the > prompt starts in (0 to 53; 12 is 640 x 256 in 16 colours, 7 is teletext, 28 is 640 x 480 in 256 colours).' },
        { x: 132, y: 184, w: 416, h: 28, text: 'Double-click runs BASIC in a window', sprite: 'optoff', validation: 'Soptoff,opton', button: 'radio', esg: 0, name: 'dclick', help: 'When this is on, double-clicking a BASIC file runs it in a graphics task window while GraphTask is loaded, instead of full screen.' },
        { x: 12, y: 228, w: 536, h: 2, border: true, validation: 'R4' },
        { x: 12, y: 262, w: 100, h: 40, text: 'Default', border: true, filled: true, hcentre: true, validation: 'R5,3', button: 'click', name: 'default', help: 'Click SELECT to fill in the standard choices.' },
        { x: 264, y: 262, w: 88, h: 40, text: 'Cancel', border: true, filled: true, hcentre: true, validation: 'R5,3', button: 'click', name: 'cancel', help: 'Click SELECT to close this without changing anything.' },
        { x: 360, y: 262, w: 88, h: 40, text: 'Set', border: true, filled: true, hcentre: true, validation: 'R5,3', button: 'click', name: 'set', help: 'Click SELECT to use these choices until you quit GraphTask.' },
        { x: 456, y: 258, w: 92, h: 48, text: 'Save', border: true, filled: true, hcentre: true, validation: 'R6,3', button: 'click', name: 'save', help: 'Click SELECT to use these choices and keep them (in Choices:GraphTask).' },
      ],
    });
    w.helpText = 'This is where you choose how new graphics task windows start.';
    const I = (n) => w.iconByName(n);
    const fill = (c) => {
      for (const k of Object.keys(SPEEDS)) I('speed_' + k).setState({ selected: c.speed === k });
      for (const [v] of SCALES) I('scale_' + v).setState({ selected: c.scale === v });
      I('mode').setText(String(c.mode ?? 12));
      I('dclick').setState({ selected: !!c.doubleClick });
    };
    const read = () => {
      const speed = Object.keys(SPEEDS).find((k) => I('speed_' + k).selected) ?? DEFAULTS.speed;
      const sc = SCALES.find(([v]) => I('scale_' + v).selected);
      const m = parseInt(I('mode').text, 10);
      return { speed, scale: sc ? sc[0] : 1, mode: m >= 0 && m <= 53 ? m : DEFAULTS.mode, doubleClick: I('dclick').selected };
    };
    const set = (save) => {
      prefs = read();
      if (save) Promise.resolve(choices.write('GraphTask', prefs)).catch((e) => task.reportError(e.message));
    };
    w.on('click', (ev) => {
      const n = ev.icon?.name;
      if (ev.button === 'menu' || !n) return;
      if (n === 'default') fill(DEFAULTS);
      else if (n === 'cancel') { fill(prefs); if (ev.button === 'select') w.close(); }
      else if (n === 'set' || n === 'save') { set(n === 'save'); if (ev.button === 'select') w.close(); }
      return true;
    });
    w.on('key', (ev) => {
      if (ev.code === 13) { set(true); w.close(); return true; }
      if (ev.code === 27) { fill(prefs); w.close(); return true; }
    });
    w.fill = () => fill(prefs);
    return w;
  };
  const showChoices = () => {
    const w = choicesWindow();
    w.fill();
    if (!w.isOpen) w.open({ behind: 'top' }); else w.bringToFront();
  };

  // ---------------------------------------------------------------- icon bar, quitting
  function quitNow() {
    for (const p of [...procs]) p.close();
    procs.clear();
    choicesWin?.delete();
    if (app === api) app = null;
    task.quit();
  }
  async function quit() {
    const live = running();
    if (live.length) {
      const n = live.length;
      const r = await query({ task, title: 'GraphTask', message: `${n === 1 ? 'A program is' : `${n} programs are`} still running in graphics task windows. Quit GraphTask and kill ${n === 1 ? 'it' : 'them'}?`, buttons: ['Quit', 'Cancel'] });
      if (r !== 'Quit') return false;
    }
    quitNow();
    return true;
  }

  task.addIconbarIcon({
    sprite: '!graphtask', side: 'right',
    help: 'This is the GraphTask icon.|MClick SELECT for a graphics task window at BASIC\'s > prompt.|MDrag a BASIC program here to run it in a window of its own.|MClick MENU for other options.',
    onClick: (ev) => { if (ev.button !== 'menu') open({}); },
    menu: () => new Menu('GraphTask', [
      { text: 'Info', submenu: () => infoBox(task, ctx.app?.info ?? {}), help: 'Move the pointer right for information about GraphTask.' },
      { text: 'New task', action: () => open({}), help: 'Click SELECT for a new graphics task window at BASIC\'s > prompt.' },
      { text: 'Choices...', action: showChoices, help: 'Click SELECT to choose how new windows start, and what double-clicking a BASIC file does.' },
      { text: 'Quit', action: quit, help: 'Click SELECT to quit GraphTask. Programs still running in its windows are killed (it asks first).' },
    ]),
    onDataLoad: (ev) => { runFiles(ev.files ?? [ev]); },
    // another program's Save box dropped on the icon: the program is run straight from memory
    onDataSave: async (ev) => {
      if (ev.filetype !== T_BASIC && ev.filetype !== T_TEXT) { task.reportError(`'${ev.leafname}' isn't a BASIC program`); return; }
      const data = await ev.receive();
      open({ program: data, name: ev.leafname });
    },
  });

  // files dropped on !GraphTask in a Filer window (appIconDrop: DataLoad with no window)
  task.onMessage('DataLoad', (msg) => { if (msg.window) return; runFiles(msg.files ?? [msg]); return true; });
  // double-click on a BASIC file (the Filer's DataOpen), when the Choices say so; otherwise it runs full screen.
  // (os.apps.start sends DataOpen with no sender too, for *Run <GraphTask$Dir> <file>: the 'run' event has it)
  task.onMessage('DataOpen', (msg) => {
    if (msg.filetype !== T_BASIC) return;
    if (!msg.from) return true;
    if (!prefs.doubleClick) return;
    open({ file: msg.path });
    return true;
  });
  task.onMessage('PreQuit', (msg) => {
    if (!running().length) return;
    msg.object?.();
    quit();
  });
  task.onMessage('Quit', () => { quitNow(); return true; });
  task.on('quit', () => { for (const p of [...procs]) p.close(); if (app === api) app = null; });

  /** Run <GraphTask$Dir> a b c: each file in its own window (or the first with the rest as its arguments). */
  const runArgs = (args) => {
    const words = String(args ?? '').match(/"[^"]*"|\S+/g)?.map((w) => w.replace(/^"(.*)"$/, '$1')) ?? [];
    if (!words.length) return;
    if (words.every((w) => vfs.stat(w)?.type === 'file')) { runFiles(words); return; }
    const st = vfs.stat(words[0]);
    if (st?.type === 'file') open({ file: st.path, args: words.slice(1).join(' ') });
    else task.reportError(`File '${words[0]}' not found`);
  };
  task.on('run', ({ args }) => runArgs(args));

  const api = app = { task, open, runFiles, showChoices, quit, procs, get prefs() { return prefs; }, windowMenu };
  task.graphTask = api;          // (for tests)
  runArgs(ctx.args);
  return task;
}
