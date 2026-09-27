# !GraphTask — BASIC programs in desktop windows

`$.Apps.!GraphTask` (disc: `tools/disc-graphtask.mjs`; code: `src/apps/GraphTask/`). Not part of RISC OS 3.71: a fresh
implementation after David Ruck's !GraphTask ("Graphic Task Windows", DEEJ Technology 1990-2021), credited in its
Info box and `!Help`. The windows themselves — a program's own screen (mode, palette, banks), the scheduler and speed
limits, keys only with the input focus, MOUSE in the program's OS units, full screen and back — are the runner core
(`src/core/basicwimp/runner.js` `startBasicWindow`, `display.js`, `scheduler.js`; docs/CORE_API.md section 12,
docs/BASIC_WIMP.md). !GraphTask is the application around them: the icon bar icon, the window menu, Choices,
`*GraphTask`, and the hooks in the Task Manager and !JsEdit.

| file | |
|---|---|
| `app.js` | descriptor: `appDir` `ADFS::HardDisc4.$.Apps.!GraphTask`, `appIconDrop`, single instance, `*GraphTask`; `boot()` sets `os.hooks.basicWindow` (used by `*BASIC -window`) |
| `main.js` | `start(task, ctx)`: the icon bar icon and its menu, `open(o)` (one window), the window menu, the Choices window, Quit; exports `ensureRunning()`, `openWindow(o)`, `command(argv)`, `current()`, `DEFAULTS` |
| `Help.txt` | the application's `!Help` (written to the disc by the disc tool) |

## Behaviour
* Starting it (double-click in `$.Apps`, `*Run <GraphTask$Dir>`) puts `!graphtask` on the right of the icon bar and
  opens nothing. `GraphTask$Dir` is set at boot (every registered app is booted), so `Run <GraphTask$Dir> …` works
  in Obey files before it has run.
* Icon bar: Select / Adjust = `open({})`: a window at BASIC's `>` prompt (`prompt: true`, `open: 'now'`), titled
  "Graphic task window", in the Choices' prompt mode. Menu: Info, New task, Choices..., Quit.
* Files: dropped on the icon (`onDataLoad`), on `!GraphTask` in a Filer window (`appIconDrop` → `DataLoad` with no
  window), `Run <GraphTask$Dir> a b c` (each file, if they all exist; otherwise the first with the rest as its
  arguments; the `'run'` event when already running) — BASIC (&FFB) and Text (&FFF, a listing: BASIC's loader
  tokenises it) run, each in its own window (`open: 'output'`: the window appears when the program first writes or
  reads the keyboard, so a program that calls Wimp_Initialise never shows one). Other types: an error box. Another
  program's Save box dropped on the icon (`onDataSave`) runs the data from memory. A file dropped on a window types
  its pathname into the program (Shift: followed by a space), as a task window does; on a finished window it runs.
* `*GraphTask [<file> [<args>]]` (descriptor command, usable in Obey and `!Run` files, e.g.
  `GraphTask <Obey$Dir>.!RunImage`): starts the app if needed (`ensureRunning`), then one window; no file = the
  prompt; a missing file is the error "File '…' not found". `*BASIC -window …` goes through `os.hooks.basicWindow`
  (runner.js `runDesktopBasic`), so its windows are !GraphTask's too.
* Each window is `startBasicWindow({speed, scale, mode, onMenu, onClose, onState, onEnd})` with the Choices' speed and
  scale; programs start in MODE 12, prompt windows in the Choices' mode. `procs` holds the live processes; one leaves
  it when its window is closed or it becomes a desktop task (`p.bridge`).
* Window menu (`windowMenu(p)`, opened by `p.openMenu`; Shift-Menu in Menu button mode — display.js): Menu button
  (tick: `p.setMenuButton`), Suspend / Resume (shaded as they apply), Kill, Restart, Speed ▸ ARM2 / ARM3 / ARM610 /
  StrongARM / Unlimited (`SPEEDS`, ticked), Scale ▸ 1:1 / x2 / Fit window (ticked), Full screen (`Alt-Return` shown as
  its key; `p.fullScreen(true)`), Save screen ▸ the standard Save box (`saveAs`, leaf `Screen`, &FF9) with
  `screenToSpriteFile(p.vdu)`: the whole screen at 1:1 in the program's mode.
* Shift-drag of the picture with the left button (a capture-phase `pointerdown` on the window's view, so the program
  never sees the press; `e.button === 0` because Shift+left is Adjust under `*Configure Buttons Menu`): `dragSave`
  of the same sprite file to a Filer window or an application.
* Close icon: a running program (the prompt too) asks "'<name>' is still running. Kill this program?" (Kill / Cancel,
  `query`); a finished one closes at once. Quit (and PreQuit from the Task Manager, which it objects to) asks when
  programs are running, then closes every window. The `Quit` message closes them without asking.
* Choices (`Choices:GraphTask`, JSON via `core/choices.js`): speed, scale, "Prompt windows start in MODE" (0-53),
  "Double-click runs BASIC in a window" (default off). Default / Cancel / Set / Save, Return = Save, Escape =
  Cancel. The double-click option works by claiming the Filer's `DataOpen` broadcast for &FFB while !GraphTask runs;
  when it isn't running (or the option is off) nothing claims it and the file runs full screen through
  `Alias$@RunType_FFB`, as in 3.71. `*Run` of a BASIC file (e.g. from an application's `!Run`) is never affected.
  (`os.apps.start` also sends `DataOpen` with no sender to a running app for `*Run <app> <file>`: claimed and ignored,
  since the `'run'` event has opened it.)
* Task Manager: "Graphics task window" after "Task window" on its icon bar menu runs `*GraphTask` (shaded if the
  command isn't registered). Each window's program is a task of its own in the Task display.
* !JsEdit: Run on a BASIC listing (`isBasic`) saves it (the Save box first if it has never been saved) and runs
  `*GraphTask <file>`.

## Demos
`$.Demos.BASIC.Ceefax` (MODE 7 teletext page: clock, flashing headline, moving graphics wave, ticker) and
`$.Demos.BASIC.BallPit` (MODE 28 balls thrown with the mouse; Menu toggles gravity, for Menu button mode) are
written to show it off (`src/basic/demos/`, `tools/disc-basicdemos.mjs`).

## Icon
Drawn in `tools/disc-graphtask.mjs` (Wimp colours, 34 and 18 pixels): a small window with a cream (focused) title
bar showing a BASIC picture — a teletext colour band, a sun over green hills and a `>` prompt.

Tests: `tests/bw/bw-graphtask.mjs` (in `node --test tests/bw`); the windows themselves: `tests/bw/bw-window.mjs`.
