# Changes needed / cross-area notes

Each entry records a change one agent made (or needs) in another agent's area. Every entry has a **Status** line;
the integration QA pass resolved or documented all of them (see the end of this file for the QA changes).


## wimp.processKey(code, char?) — added by ACCESSORIES agent (Chars)
**Status:** Resolved: documented in CORE_API.md §3.2.

`src/core/wimp.js`: new public method = Wimp_ProcessKey. Delivers a key code to the input-focus owner
(writable icon editing, then the caret window's `key` event, then hot-key windows). Additive only.
Please document in CORE_API.md §3.2.

## Writable icons pass on disallowed characters — DIVERSIONS agent (Blocks)
**Status:** Resolved: documented in CORE_API.md §3.2.

`src/core/wimp.js` `_editKey`: a character rejected by the icon's `A` validation now returns false, so it
reaches the window's `key` handler (Key_Pressed), as the real Wimp does. !Blocks' "Alter keys" dialogue uses
writable icons validated `a0~0` (nothing allowed) and reads every key via Key_Pressed.

## Icon bar: raw icons — DIVERSIONS agent (MemNow)
**Status:** Resolved: documented in CORE_API.md §11.

`src/core/iconbar.js`: `wimp.iconbar.add({ ..., text, raw: {flags, validation, w, h} })` creates an icon with the
given Wimp icon flags/validation and a fixed size in pixels (e.g. MemNow's ridged text icon showing free memory).
Additive only; please document in CORE_API.md §11.

## os.config extensions for !Configure — ACCESSORIES agent (Configure)
**Status:** Resolved: documented in CORE_API.md §11 (config keys) and in the header of `src/core/config.js`.

All additive / backwards compatible:
* `src/core/config.js`: new keys `doubleClickMove` (OS units, `*Configure WimpDoubleClickMove`), `beepLoud`,
  `speaker`, `volume` (0-7; together set `wimp.config.beepGain`), `mode` ({width,height}|null, applied once at
  boot via `wimp.setMode`, `modeGreys`). `wimpFont` may be any RISC OS font name (e.g. `Trinity.Medium`) as well as
  'homerton'/'system'. apply() now also sets `input.config.doubleClickMs/doubleClickMove/dragMove/dragDelayMs`,
  `wimp.config.solidDrags` (WimpFlags bit 0) and `wimp.config.errorBeep` (bit 4 clear = beep on errors).
  Unknown keys may be stored in `config.values` + `save()` (Configure keeps CMOS-only settings there).
* `src/core/fonts.js`: `fonts.weight` / `fonts.style` so the desktop font can be a bold/italic outline font.
* `src/core/dialogs.js`: error boxes beep only if `wimp.config.errorBeep !== false`.

## Menu sprite items + pointer hot spots — DRAW agent
**Status:** Resolved: documented in CORE_API.md §5 (sprite items) and §11 (`setPointer` hot spot).

Both additive / backwards compatible:
* `src/core/menu.js`: a menu item may have `sprite` (name or SpriteInfo, looked up in `spriteArea` (a Map) or the
  Wimp pool) drawn in the item's text area, and `spriteW` (px) as a width hint for measuring. Used by Draw's
  Style ▸ Line pattern menu (sprites `none`, `pat1`…`pat4`, like RISC_OSLib `menu_make_sprite`).
* `src/core/wimp.js` `setPointer`: a SpriteInfo may carry `hot: [x, y]` (CSS px) for its active point; used by
  Draw's crosshair pointer (active point 8,4 in the mode-12 sprite).
Please document in CORE_API.md §5 / §11.

## Menu owner / ctx survive opening — EDIT agent
**Status:** Resolved: bug fix merged, no API change.

`src/core/menu.js` `MenuManager.close()`: the top-level teardown (owner reset, `ctx.onClose()`, `MenusDeleted`,
caret restore) now only runs if a menu level was actually closed. Before, `open()` set `owner`/`ctx`/`_savedCaret`
and then `_openLevel(0)` → `close(0)` immediately wiped them, so `wimp.menus.owner`/`ctx` were always null while a
menu was open (MenusDeleted never sent, `onClose`/`onSelect` from `open()` opts fired at once or never, caret not
restored after menu dialogue boxes). Bug fix, no API change. (!Help needs `wimp.menus.owner` to give help on the
Filer / Task Manager / Pinboard / device menus.)

## Default run action for Palette files — DIVERSIONS finisher
**Status:** Resolved (accepted limitation): `*WimpPalette` remains a no-op; see README known limitations.

`src/main.js`: added FileSwitch's default `Alias$@RunType_FED` = `WimpPalette %0` (from `FileSwBody`), so
double-clicking `Diversions.Desktop` (a Palette file) no longer gives the Filer's "no application" error.
`*WimpPalette` is still a no-op in `commands.js`. That is fine for the seed disc: its only palette file is the
standard desktop palette at 4 bits per gun. A real implementation would need the Wimp to re-map colours 0-15 at run time.

## Filer viewers: template icons removed — EDIT+PAINT finisher
**Status:** Resolved: bug fix merged, no API change.

`src/core/filer.js` `DirViewer`: the `directory` template's prototype icons ("next dir", date, sprite
examples) were left in `win.icons` (their DOM was cleared by `render()`), so `wimp` hit-testing found
them over the first row of items: the click reported that icon, button type 6 (click/drag) instead of
the window's type 10, so **double-clicking the first items in a viewer never opened them**. The viewer
now deletes the template icons after creating the window. Bug fix, no API change.

## Printers prints Drawfiles with Draw's renderer — DRAW agent
**Status:** Resolved: no API change.

`src/apps/Printers/print.js` `renderFile`: the `&AFF` case now imports `printDrawfile` from `src/apps/Draw/drawfile.js`
(true-size `<img>`) instead of printing a placeholder. Normally unused, because Draw's descriptor `boot` registers the
same renderer through `os.printerRenderers`; the fallback covers Printers started without that hook. No API change.

## BASIC: `"str" + FNx(...)` gave "Type mismatch" — TASKWINDOW/BASIC-WIMP agent
**Status:** Resolved: regression test added in `tests/basic/lang.test.mjs` ("str" + FNx …).

`src/basic/expr.js` `addOp`: a string on the left of `+` with a dynamically typed right operand (an FN call
whose name has no `$`, e.g. crunched programs' `">"+FNa("M1")`) was compiled to an unconditional
"Type mismatch: string needed". One-line fix: that shortcut now only applies when the right operand is
statically numeric (`r.t !== TA`), so the dynamic path (binDyn) handles it. Found running the original
!SciCalc !RunImage. (BASIC agent: please keep / add a test.)

## VDU: desktop-sized screen mode — TASKWINDOW/BASIC-WIMP agent
**Status:** Resolved (note kept for the BASIC owner): the VDU internals listed are still used by `DesktopVDU`.

No change to `src/basic/`: `src/core/basicwimp/screen.js` subclasses `VDU` (`DesktopVDU`) and resizes MODE 28
after `_setMode(28)` (W, H, xWL/yWL, scrRCol/scrBRow, banks, windows). If the VDU grows real mode-selector
support (OS_ScreenMode 0 with a selector block), DesktopVDU could use it instead. It relies on the VDU
internals `_setMode`, `_defaultWindows`, `_ff`, `_setupCanvas`, `_dirtyAll`, `fb`, `pal1`, `gwl/gwb/gwr/gwt`,
`orgX/orgY`, `nColour` — please keep those names.

## core basichost sysvar map is not iterable — TASKWINDOW/BASIC-WIMP agent
**Status:** Resolved (QA): `sysvarMap()` in `src/core/basichost.js` now has `[Symbol.iterator]` and `keys()` (and `set` returns the map). Checked by `tests/integration/flows.mjs basic`.

`src/core/basichost.js` `sysvarMap()` has no `[Symbol.iterator]`/`keys()`, but `BasicMachine.getSysVar` iterates
the map for wildcard / case-insensitive lookups, so `SYS "XOS_ReadVarVal","Missing$Var",...` in full-screen BASIC
fails with "Internal error: this.sysvars is not iterable". The desktop runner (`src/core/basicwimp/runner.js`)
has an iterable version; the same two generator methods could be added to basichost.js (WIMP CORE owner).

## main.js: installBasicWimp() — TASKWINDOW/BASIC-WIMP agent
**Status:** Resolved. QA: `installBasicWimp()` now registers `*WimpSlot` itself instead of importing `services.js` at boot, so the bridge and VDU (~200K) load only when a BASIC program runs.

`src/main.js`: one import and one call after `installBasicHost()`: `installBasicWimp()` wraps `os.hooks.basic`
(task windows → `ctx.tw.runBasic`; F12 / interactive → the core basichost; programs run from the desktop →
single-tasking full screen or a Wimp task through the SWI bridge), registers `*BASIC64` (same interpreter) and
makes `*WimpSlot` remember the slot size for the next program's HIMEM / Task Manager memory. See docs/BASIC_WIMP.md.

## *If with string comparisons — TASKWINDOW/BASIC-WIMP agent
**Status:** Resolved: fix merged.

`src/core/commands.js` *If: the expression was GSTrans'd with quote stripping, so `If "<Maestro$Running>"="Yes" Then …`
(the first line of !Maestro's !Run) became `=Yes` and crashed evalExpr ("Cannot read properties of undefined (reading
'toUpperCase')"). Now `sysvars.gstrans(expr, { noQuotes: true })`, so quoted strings reach the evaluator (as OS_EvaluateExpression
does). One-line fix.

## Seed disc: $.Examples — TASKWINDOW/BASIC-WIMP agent
**Status:** Resolved (QA): `tools/build.mjs` runs `basicwimp-demo.mjs` after `disc.mjs`; `Examples` is listed in docs/ASSETS.md §5.

`assets/disc/HardDisc4/Examples/` (`!Doodle` BASIC Wimp app, `Spiral` single-tasking program, `ReadMe`) and its entry in
`assets/disc/manifest.json` are written by `node tools/basicwimp-demo.mjs` from `src/core/basicwimp/demo/`. `tools/disc.mjs`
wipes `assets/disc`, so re-run the tool after it (assets agent: please call it from `tools/build.mjs`, and list `Examples` in
docs/ASSETS.md §5).

## QA integration pass — changes in shared code
**Status:** done (INTEGRATION QA agent). All backwards compatible.
* `src/core/wimp.js` `dataSave()`: a receiver that fetches the data asynchronously (`ev.receive()` after an `await`,
  e.g. Draw inserting a Paint sprite, Edit's icon bar opening a window first) no longer leaves the Save box open: the
  Wimp waits for a started `receive()`, and a claimed-but-deferred save returns `{handled: true}` (the box closes,
  `onSaved(null, {toApp: true})`).
* `src/apps/Printers/main.js` `os.printers.print({html})`: `html` may be a Promise (the output window has to be opened
  inside the click, but the page can be rendered afterwards). Used by Paint.
* Edit (Misc ▸ Print, Select ▸ Print) and Paint (Print dialogue / Print item on sprite and file menus) print through
  `os.printers` when !Printers is running; otherwise they give their original "load !Printers" errors.
* `src/core/reset.js` (new): `*ResetDisc [-cmos]`, `*ResetCMOS`, Delete / R held down at start-up, `?reset=disc|cmos|all`.
* `src/apps/Chars/main.js`: font menu messages come from `Fonts` (there is no `FontManager` messages file: it was a 404).
* Tests: `node --test tests/<area>` works for every area (`tests/lib/suite.mjs` runs the Playwright scripts as child
  processes); new `tests/integration/` (cross-app flows, long monkey test).

## !Lander — changes in shared code
**Status:** done (LANDER agent). All additive.
* `src/basic/vdu.js` (in the WIP snapshot): `new VDU({linearScreen: true})` keeps all 8bpp banks in one array
  (`screenIO.linear`), so ARM code writes pixels at full speed; `MODE n+128` selects bank 2 and a mode change keeps
  the other banks when the layout is unchanged (as ModeChangeSub). `src/basic/arm.js`: decoded-instruction cache,
  ARM2 cycle counting and `runFor(n, cycleLimit)`. Documented in docs/BASIC.md.
* `src/apps/index.js` (+ `./Lander/app.js`), `tools/build.mjs` (+ `disc-lander.mjs`), `tests/basic/index.mjs`
  (+ `arm.test.mjs`, `lander.test.mjs`). The Lander binary (© D.J. Braben) is only ever read from the user's
  IndexedDB or a git-ignored `vendor/lander`; `tests/basic/lander.test.mjs` and `tests/div/lander-original.mjs`
  skip without it.

## Tier-A utilities (original BASIC !Calibrate, !SaveCMOS, !ResetBoot, !Verify, !HForm, !PrintEdit, !Warning, !ShowScrap) — changes in shared code
**Status:** done (TIER-A APPS agent). All additive / bug fixes; see docs/apps/TierA.md.
* `src/core/cmos.js` (new): the CMOS RAM image (OS_Byte 161/162), views onto `os.config`; `*LoadCMOS` / `*SaveCMOS`
  registered from `commands.js` (`registerCMOSCommands`), replacing their no-op stubs. `src/apps/Configure/main.js`:
  double-clicking a 240-byte CMOS file (type &FF2) loads it with `*LoadCMOS`.
* `src/core/basicwimp/hardware.js`, `adfs.js` (new), installed by `runner.js` for every desktop BASIC program.
* `src/core/basicwimp/templates.js`: Wimp_LoadTemplate allocates each indirected item's full buffer size (Wimp06);
  it used to copy the stored bytes, so writing a long string into an indirected buffer overwrote the next icon's text.
  Size enquiries return the Wimp's sizes. The window's sprite area word is set to 1 as the Wimp does.
* `src/core/basicwimp/bridge.js`: Wimp_ReportError new-style extra buttons / sprite; DataSave / DataLoad sent to a
  Filer viewer are answered for the Filer (DataSaveAck with `<dir>.<leaf>`, DataLoadAck).
* `src/core/dialogs.js` `reportError`: a box queued just after the previous one closed was shown twice.
* `src/core/vfs.js` `parse()` and `basicwimp/runner.js parseBasicArgs`: hard spaces (&A0) are part of file names
  (not trimmed / not argument separators) — `$.Video.HiRes.!Warning&A0`.
* `src/core/basichost.js` `basicFS().setType` (OS_File 18); `src/basic/machine.js` OS_File 18 also sets the type of
  a file open for output, which is written with that type when closed.
* `src/core/cli.js`, `commands.js`: `-fs-command` prefix; Joystick 0.22 in the module list.
* `src/apps/Printers` descriptor: `files` (the classes' PaperRO) and `boot` (Printers$Path, as its !Boot);
  `src/apps/SysRes/scrap.js`: !Scrap's `!Boot` sets up `ScrapDirs.ScrapDir` (used by !ShowScrap).

## HostFS (host folders as discs) — changes in shared code
**Status:** done. All additive; new code in `src/core/hostfs/` and `tools/hostfs-server.mjs`.
* `src/core/vfs.js`: `Node` is exported; `Disc` takes a `host` driver, called by `_persist` / `_unpersist` instead of
  the IndexedDB overlay (`writeFile` and `copy` pass `{data: true}` when contents change; `rename` on a host disc
  hands the node to the driver as a whole). `addDisc({dynamic})` emits `discs`; new `removeDisc(disc)` (the CSD, URD,
  library and previous directory fall back to the hard disc), `registerFS(name, ...aliases)` (the FS name table
  `fsNames` replaces the fixed list in `_fsName`), `revalidate(path)`, and `usage()` uses `disc.host.space` when the
  host reports its free space. `_parseCanonical` falls back to the hard disc for a disc that has gone (it returned
  `disc: null`); `FS:path` for a filing system with no disc now gives "No <FS> disc is mounted" instead of silently
  using the current disc.
* `src/core/cli.js`: `hostfs:` command prefix. `src/core/filer.js` `openDir` calls `vfs.revalidate`.
* `src/core/devices.js`: `os.free.showDisc(disc)`. `src/main.js`: `initHostFS()` after `initDevices()`.
* `src/core/pinboard.js`: pins on a HostFS disc that isn't mounted are kept (`parked`) and come back when it is,
  instead of being dropped.
* `serve.mjs`: `--host Name=/path`, `--host-ro Name=/path` and `/__hostfs/` (tools/hostfs-server.mjs); every static
  response carries `X-HostFS: 1`, so the page only asks for `/__hostfs/` from this server.
* `assets/filetypes.json` (+ `tools/misc.mjs`): names for later file types (JSON, WebP, MP4, Zip, SVG, …) that HostFS
  gives files by extension.
* `*Dismount` dismounts HostFS discs (still no effect for others). New commands `*HostFS`, `*HostMount`,
  `*HostDismount`, `*HostMounts`.

## JavaScript programs on the disc (*JSRun) and the JavaScript tutorial — changes in shared code
**Status:** done. Additive; new code in `src/core/jsrun.js`, `tools/disc-jstutor.mjs`, `tools/jstutor/`.
* `src/main.js`: `Alias$@RunType_F81` = `JSRun %*0`; `installJSRun()` after `installBasicWimp()`; the handler
  error reporter asks `os.hooks.programError(e)` first, so errors from a program's event handlers give its name
  and line number.
* `file_f81` / `small_f81` Filer icons are drawn at start-up (the BASIC file's frame with "JS").
* `tools/lib/spritewrite.mjs`: writes small sprite files from character maps (as `tools/basicwimp-demo.mjs`).
* `tools/build.mjs` runs `disc-jstutor.mjs`; it adds `$.Manuals.JSTutor`, `$.Examples.JS` and a line in
  `!Bookworm`'s hot list.

## !JsEdit (programmer's editor) — changes in shared code
**Status:** done. Additive; the app is `src/apps/JsEdit/` (docs/apps/JsEdit.md), its disc directory
`tools/disc-jsedit.mjs`.
* `src/apps/Edit/editor.js`: `EditApp.createText(opts)` and `TextState.createView(opts)` factories (used where
  `new TextState` / `new EditView` were), so !JsEdit can subclass them. `src/apps/Edit/view.js` exports the
  system-font glyph strips as `systemFontAtlas`. Edit's behaviour is unchanged.
* `src/core/app.js`: `apps.editFile(path, type)` — an app whose descriptor lists the type in `edits` opens it;
  `src/core/filer.js` Shift-double-click tries it before opening the file in Edit (so JSScript files open in
  !JsEdit; everything else as before).
* `src/core/jsrun.js`: `checkSyntax(src)`; `os.hooks.throwback` is offered each program error before the error box.
* `tools/build.mjs` runs `disc-jsedit.mjs`.
* Nerd Fonts: `assets/fonts/nerd/` (WOFF2 + licences), added to `assets/fonts/fonts.json` / `fonts.css` by
  `tools/nerdfonts.mjs` (run by `tools/build.mjs` after `fonts.mjs`). `src/core/fonts.js` `cssFor`: a built-in font
  that isn't one of the RISC OS families it maps takes its CSS family and fallback from fonts.json (the RISC OS
  fonts' CSS is unchanged).

## Helpers for applications (for the second tutorial) — changes in shared code
**Status:** done. Additive.
* `src/core/templates.js` `loadTemplates`: a RISC OS pathname is read from the virtual disc (not cached); web
  addresses as before. `src/core/icons.js`: `Icon.name` / `Icon.help` from the spec. `src/core/window.js`:
  `def.returnNext`; `src/core/wimp.js`: `caretmove` event between icons of one window, Return moves to the next
  writable icon in a `returnNext` window.
* `src/core/dialogs.js` `dragSave`; `src/core/choices.js`; `src/core/textarea.js` (TextArea gadget);
  `src/core/timefmt.js` (moved from `src/apps/Alarm/timefmt.js`, which re-exports it).
* `src/core/jsrun.js`: programs also get reportError, discardChanges, dragSave, loadTemplates, parseTemplateFile,
  textWidth, choices, formatTime, DAYS, MONTHS, ordinal, TextArea, sprites.
* `src/core/cli.js` `obey`: `%%` in an Obey file is a literal `%` (as on RISC OS), so `!Boot` files can write run
  actions such as `Set Alias$@RunType_1C4 Run <Contacts$Dir>.!Run %%*0`. (23 Obey files on the seed disc use it -
  `!Maestro.!Boot`, `!Squash.!Boot` … - and were mangled before.)
* `src/core/wimp.js` `focusNext(win, from, d)`: Tab / Shift-Tab / Up / Down move through a window's writable icons
  and TextAreas together, in reading order; a TextArea's Tab moves to the next field.
* `src/core/util.js` `Emitter.on(type, fn, {first: true})` puts a handler before the others; TextArea's click, key
  and paste handlers use it, so a program's own window handlers only see what the text area doesn't use.

## !Browse (the web browser) — changes in shared code
**Status:** done. Additive.
* `serve.mjs`: answers only this machine unless `--lan` (every interface) or `--listen=<address>` is given (it used
  to listen on every interface); `--browser[=chrome]` / `--browser-profile <dir>` start !Browse's engine
  (`tools/browser-server.mjs`, `/__browse/`, a WebSocket at `/__browse/ws`), which like HostFS only answers this
  machine. `tools/browse-ext/` is the engine's sound-capture extension. Its pages now carry `Content-Security-Policy: frame-ancestors 'self'` (no framing of the desktop by other sites), and a malformed request (e.g. `GET /%`) gets 400 instead of stopping the server.
* `src/core/window.js`: the `ignoreRight` / `ignoreBottom` window flags (bits 14, 15) let a window be sized beyond its
  extent (the real Wimp's "ignore right/lower extent"); toggle-size then fills the screen. Windows without them are
  unchanged.
* `src/core/wimp.js` `_keyDown`: a window's `key` handler may set `ev.allowDefault` so the host browser's default
  still happens (!Browse lets Ctrl-V turn into a paste event).
* `src/core/desktop.css`: `body.dragging iframe { pointer-events: none }`.
* `src/apps/Bookworm/main.js`: links to `http:` / `https:` pages go to `*URLOpen_<scheme>` when one is set (!Browse),
  instead of the "only file:" error.
* `assets/filetypes.json`: `&F91` URI, `&B28` URL. `tools/build.mjs` runs `disc-browse.mjs`.

## Windows kept on screen as the 3.71 Wimp does — changes in shared code
**Status:** done.
* `src/core/wimp.js` `constrainWindow(win, p, {force})` follows Wimp02 `int_open_window`: size capped at the screen,
  top left on screen unless WimpFlags bit 6, bottom right unless bit 5 (moving the window), then shrink; forced for
  windows that were closed, flag bit 13, menus and `win._onScreenOnce` (size drags, toggle-size, mode changes,
  an extent making an on-screen window smaller). `_sizeDrag`: with bits 5 and 6 clear a size drag stops at the
  screen edge (it used to move the window up). `wimp.config.offScreenBR` / `noBounds` from WimpFlags bits 5 / 6
  (`src/core/config.js`). `src/core/window.js`: `open()` passes `force`, `setExtent` / `toggleSize` set the flag.
* Behaviour change: resizing past the bottom / right of the screen pushes the window up / left (it used to run
  off screen); windows reopened from closed, and windows asked to be bigger than the screen, are kept on it.
  Test: `tests/core/act-resizeedge.mjs`.

## HostFS: !HostFS in Utilities instead of a permanent icon — changes in shared code
**Status:** done.
* `src/core/hostfs/ui.js`: no permanent "HostFS" icon on the left; mounted folders keep their left icons (menu adds
  Mount at start-up and Forget). Each remembered mount has a start-up choice (`startup` in its IndexedDB record;
  old `dismounted` records are read as `startup: !dismounted`); Dismount keeps it remembered with start-up off.
  New `os.hostfs` calls for the application: `list`, `setStartup`, `mountRemembered`, `forget`, `serverFolders`,
  `mountServerFolder`, `supportsPicking`, `onChange`.
* `src/apps/HostFS` (registered in `src/apps/index.js`), `tools/disc-hostfs.mjs` (run by `tools/build.mjs`) writes
  `$.Utilities.!HostFS`.
* `$.Docs` gains `Contents`, `JsEdit` and `Programming` guides (`tools/docs/`); the HostFS guide describes !HostFS.

## jsrun: a program's own 'quit' handlers were skipped — fixed during the Lander II review
**Status:** done.
* `src/core/jsrun.js`: the handler that tidies `globalThis.__jsrun` was `() => delete ...`, which returns true;
  `Emitter.emit` stops at a handler returning true, so a module program's `task.on('quit', ...)` never ran (Lander II
  kept drawing, its listeners and AudioContext stayed alive after Quit). Now it has braces and returns nothing.

## BASIC programs in windows (!GraphTask phase 1: runner core) — changes in shared code
**Status:** done (the !GraphTask application, its commands and the `$.Docs` guide: next section).
* `src/core/basicwimp/runner.js`: `BasicProcess` is now the controller for a program in either display: new
  `startBasicWindow(opts)` (docs/CORE_API.md section 12) and `*BASIC -window [<file>]` (`parseBasicArgs` returns
  `window`; `index.js` dispatches it from anywhere, task windows too). `takeScreen` / `releaseScreen` / `scr` are gone
  (now `display.js`); `processes`, `errors`, `machine`, `bridge`, `lateOutput`, `ended` are unchanged for the tests.
  `*command` output goes to the program's screen whichever display it has (before: only once it had the screen).
  `*WimpMode`, `*ScreenMode` and the sprite commands (`*SLoad`, `*SSave`, ...) are BASIC's own in desktop programs
  (they change the program's screen / sprites, not the desktop's). Each process's VDU clock stands still while it is
  suspended (flashing colours, teletext flash, cursor).
* `src/core/basicwimp/display.js` (new): `FullScreenDisplay`, with a stack of programs wanting the screen. **Bug fixed:**
  a second full-screen program started while one had the screen ran invisibly (`fullScreenBusy`); now it is shown
  over the first, which gets the screen back when it ends. `WindowDisplay`. Alt-Return switches a running program
  between the whole screen and a window (both ways, full-screen programs too). Escape in a full-screen program now
  goes through `keyPress(27)`, so `*FX 229` can disable it as on RISC OS.
* `src/core/basicwimp/scheduler.js` (new): one cooperative scheduler for every desktop BASIC machine (wraps
  `machine.slice`; no change to `src/basic/`): fair turns, BASIC capped at 11 ms of each 16 ms (15 ms while one is
  full screen), per-program speed limits (`SPEEDS`), suspend. **Behaviour change:** `WAIT` / `*FX 19` in desktop BASIC
  (`BasicProcess` and `basichost.js`'s `*BASIC`) wait for a steady 50Hz clock instead of the display's animation frame
  (programs ran 20% fast at 60Hz, 2.4x at 120Hz, and stopped in background tabs). Double-clicked programs stay
  Unlimited speed; windowed ones default to StrongARM.
* `src/core/basicwimp/bridge.js`: `Wimp_Initialise` calls `proc.beforeWimpTask()` (a windowed program gives up its
  window and becomes an ordinary task, its VDU back to the desktop mode).
* `src/core/basichost.js`: `machine.waitVsync` = the 50Hz clock. `src/core/commands.js`: `*BASIC` syntax lists `-window`.
* Tests: `tests/basic/scheduler.test.mjs` (node), `tests/bw/bw-window.mjs` (Playwright, in `node --test tests/bw`).

## !GraphTask, the application (phases 2 and 3) — changes in shared code
**Status:** done. The application is `src/apps/GraphTask` (docs/apps/GraphTask.md); shared code touched:
* `src/core/basicwimp/runner.js`: `*BASIC -window` goes through `os.hooks.basicWindow(o)` when set (!GraphTask's
  `boot()` sets it), so its windows have !GraphTask's menu; otherwise `startBasicWindow` as before.
* `src/core/basicwimp/display.js`: in Menu button mode, Shift-Menu still calls the window menu hook (the mode could not
  be turned off from the window before).
* `src/core/switcher.js`: the Task Manager's icon bar menu has "Graphics task window" after "Task window"
  (`*GraphTask`; shaded if nothing registers that command). Scripts that pick Task Manager items by index after
  "Task window" (Desktop boot, Exit, Shutdown) move down one.
* `src/apps/JsEdit/editor.js`: Run on a BASIC listing (`isBasic`) saves it and runs `*GraphTask <file>` (it used to
  say only JavaScript could be run); the Run menu item is no longer shaded for BASIC.
* Demos: `src/basic/demos/ceefax.bas`, `ballpit.bas` (index.json, `tests/basic/demos.test.mjs` plans; the Filer count
  in `tests/bw/bw-basicdemos.mjs` is now 30). Disc: `tools/disc-graphtask.mjs` (in `tools/build.mjs`).
* Tests: `tests/bw/bw-graphtask.mjs` (in `node --test tests/bw`).

## One memory model: a 256MB Risc PC, RAM size in !Configure — changes in shared code
**Status:** done. Guide: `$.Docs.Memory` (`tools/docs/Memory`).
* `src/core/memory.js` (new, `os.memory`, docs/CORE_API.md section 11): the machine's memory in one place. A StrongARM
  Risc PC with 256MB of DRAM (was: the Task Manager's 8MB, OS_ReadDynamicArea's / OS_Memory's 16MB with 1MB VRAM,
  Wimp_SlotSize's flat 12MB), 2MB VRAM, 4MB ROM; RAM size 4-256MB (config `ramSize`; 4MB = an A7000, no VRAM).
  The screen is the VRAM when it fits, else (partly) DRAM. DRAM = system areas + slots + Next + Free exactly.
  Limits: 28MB slot (`APP_SPACE_K` 28640), RAM disc 128MB, font cache / system sprites 16MB. No imports (node tests).
* `src/main.js`: binds `os.memory` (config values, tasks, screen size, RAM disc = `vfs.ram.size`) and calls `init()`
  after `config.apply()`: the CMOS memory sizes (`memFontCache`, `memSprites`, `memHeap`, `memRMA`, `memScreen`,
  `memRAMDisc`) now apply at start-up. `src/core/devices.js`: no RAM disc icon if its size is 0 (RAMFSSize 0).
* `src/core/switcher.js`: `memory()` is now `os.memory.snapshot()` (plus the old `used/next/free/total` names;
  `TOTAL_K`, `nextK` and `custom` are gone). Bars use 3.7's stepped scale (`barOS`), at least a pixel when not
  empty; the window's extent (and the section headings) end 16 OS units after the Total bar, the window opens as wide
  as that and follows it when the RAM size changes. Red (draggable) bars: Next, Free (sets Next), Font cache, System
  sprites, RAM disc, and Screen memory only on a machine without VRAM (it used to be red and did nothing); dragging
  goes through `os.memory.setArea` (limited by the free pool) and ends when the button is released (before, a quick
  click could leave the drag running). System workspace is 32K (was 368K), as a 3.7 Risc PC shows. Refreshes on
  `wimp` `memorychanged`.
* `src/apps/MemNow/main.js`: reads `os.memory.freeK`.
* `src/core/basicwimp/bridge.js` `Wimp_SlotSize`: slot limited by the free pool and 28MB (and the BASIC machine's
  flat memory as before); r1 sets/reads the global Next (`setArea('next')`), r2 = free pool.
  `services.js`: OS_ReadMemMapInfo (pages of DRAM + VRAM), OS_ReadDynamicArea 0-6 / -1 (+128: max in r2),
  Font_CacheAddr's size. `hardware.js`: `hardware.dramK/vramK/romK` are the model's (setting `vramK` overrides the
  model's VRAM, for tests); OS_ReadSysInfo 0 = screen size.
* `*WimpSlot -min` (`basicwimp/index.js`, `services.hookWimpSlot`) and `os.apps.start` (`src/core/app.js`) refuse a
  slot the free pool can't give, with the Wimp's `ErrMem` ("…K free memory is needed before the application will
  start…"); `apps.start` reports it and resolves to null. Only happens with little RAM (or huge slots).
* `src/core/config.js`: `*Configure RAMSize <n>M` (this desktop's), `FontSize`, `FontMax`, `RAMFSSize`, `RMASize`,
  `ScreenSize`, `SpriteSize`, `SystemSize` (`<n>` pages, `<n>K`, `<n>M`; start-up sizes). `src/core/commands.js`:
  `*Status` memory rows from the model (`statusRows()`), incl. `RAMSize`; `*Configure` lists the new keywords.
* `src/apps/Configure/main.js`: Memory window has a RAM size row (docs/apps/Configure.md); `DEF.memScreen` 0 (was
  1200) and `DEF.memRAMDisc` 1024 (was 0), what the desktop starts with.
* Tests: `tests/core/test-memory.mjs` (node: sizes, limits, accounting, settings, bar scale against the 3.7
  screenshots) and `tests/core/test-taskmanager.mjs` (Playwright: the Task display at 256MB, 4MB and 64MB, bar drag,
  !MemNow, `*WimpSlot` refusal, !Configure's RAM size), both in `node --test tests/core`.
