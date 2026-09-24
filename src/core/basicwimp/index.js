// BASIC Wimp bridge: runs BASIC programs from the desktop the way RISC OS 3.71 does.
//
//   * A plain BASIC program started from the desktop (double-click, *Run, an app's !Run) runs
//     single-tasking, full screen through the VDU, in the program's own MODE; when it ends the
//     screen shows "Press SPACE or click mouse to continue" and the desktop comes back.
//   * A program that calls Wimp_Initialise becomes a multitasking desktop task: the Wimp_* SWIs
//     are implemented on top of the core window manager (see bridge.js), so original tokenised
//     BASIC Wimp applications run unmodified.
//   * *BASIC typed at the F12 command line keeps the core's interactive full-screen BASIC.
//   * Inside a task window (ctx.tw set by the TaskWindow shell) BASIC runs in the task window.
//
// installBasicWimp() replaces os.hooks.basic with the dispatcher below. See docs/BASIC_WIMP.md.

import { os } from '../os.js';

let installed = false;

export function installBasicWimp() {
  if (installed) return;
  installed = true;
  os.hooks = os.hooks ?? {};
  const previous = os.hooks.basic;            // core basichost (interactive full screen BASIC)
  os.hooks.basic = async (argv, ctx = {}) => {
    // 1. inside a task window: the task window's shell runs BASIC in text mode
    if (ctx.tw?.runBasic) return ctx.tw.runBasic(argv, ctx);
    // 2. from the F12 command line, or interactive BASIC: the core full-screen BASIC
    const { parseBasicArgs } = await import('./runner.js');
    const a = parseBasicArgs(argv);
    if (os.cli?.active || !a.file || a.mode === 'load' || a.mode === 'help') return previous?.(argv, ctx);
    // 3. a program run from the desktop: single-tasking or Wimp task
    const { runDesktopBasic } = await import('./runner.js');
    return runDesktopBasic(a, ctx);
  };
  // *WimpSlot remembers the slot for the next program. Registered here (not via services.hookWimpSlot) so
  // that the bridge / VDU modules (~200K) load only when a BASIC program actually runs.
  const prevSlot = os.cli.find('wimpslot');
  os.cli.register('WimpSlot', {
    ...(prevSlot ?? {}), name: 'WimpSlot', syntax: 'Syntax: *WimpSlot [-min] <size>[K] [-max <size>[K]] [-next <size>[K]]',
    run: async (argv) => {
      let min = null;
      for (let i = 0; i < argv.length; i++) {
        const a = argv[i].toLowerCase();
        if (a === '-min' || (!a.startsWith('-') && min == null)) { const v = a === '-min' ? argv[++i] : argv[i]; min = parseInt(v, 10) * (/k$/i.test(v) ? 1 : /m$/i.test(v) ? 1024 : 1 / 1024); }
      }
      if (min) (await import('./runner.js')).noteWimpSlot(Math.round(min));
    },
  });
  // BASIC64 (the !Run files of 3.5+ apps use "BASIC64 -quit <file>"): same interpreter here
  const cmd = os.cli.find('basic');
  if (cmd && !os.cli.commands.has('basic64')) os.cli.register('BASIC64', { ...cmd, name: 'BASIC64', syntax: 'Syntax: *BASIC64 [-help] [-chain|-quit|-load] [<filename>]' });
}
