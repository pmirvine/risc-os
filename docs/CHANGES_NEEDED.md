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
  response carries `X-HostFS: 1`, so the page only asks for `/__hostfs/` from this server. `--public-url=<url>` with
  `RISCOS_PROXY_SECRET` (`tools/trust.mjs`) also lets HostFS and !Browse's engine answer a trusted reverse proxy
  (`X-Proxy-Auth`); see `deploy/` and `$.Docs.Server`. New engine options `--browser-arg`, `--browser-idle`,
  `--browser-check-private`.
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

## !Journal — changes in shared code
**Status:** done. Additive (existing TextArea users unchanged: `tests/core/test-appkit.mjs`, `node --test tests/jsapps`).
* `src/core/textarea.js` (TextArea, given to programs by jsrun): a selection (`selection`, `select(a, b)`,
  `selectedText`; Shift-Left / Shift-Right, drag with Select, Adjust or Shift-click to extend, double-click a word),
  typing and `insert()` replace it; undo / redo (`undo()`, `redo()`, F8 / F9, a typed word is one step);
  Ctrl-C / Ctrl-X copy and cut to the host clipboard, Ctrl-V lets the browser paste; Shift-Up / Shift-Down (Page Up /
  Page Down) move a box full; the mouse wheel scrolls a box, which shows a scroll indicator when its text overflows;
  `resize(w, h)`, `setFont(css)`, `scrollBy(rows)`. Options `grow: true` (the box is as tall as its text and emits
  `'resize' {h}`; the caret is kept in view by scrolling the *window*, so a window's own scroll bars move a long
  text) and `border: false`. Keys it doesn't use (other Ctrl-keys, function keys) still go on to the program.
* The disc app itself (`tools/journal/!Journal`, `tools/disc-journal.mjs`) only uses the public `riscos` module.

## MoreApps ($.MoreApps, !Word, WimpLib) — changes in shared code
**Status:** done. Additive (relative imports and the existing boot unchanged: `node tests/jstutor/jsrun.mjs`,
`node tests/core/test-persist.mjs`).
* `src/core/jsrun.js`: the import specifier `'wimplib/<Name>'` (or `'wimplib/<Dir>/<Name>'`) loads a module of
  WimpLib, the system library `$.!Boot.Resources.!WimpLib`: `resolveLib` searches each directory of the system
  variable `WimpLib$Path` in turn (a path list, prefixes used as written, as `vfs` does for `<Name>$Path`), then
  `WimpLib$Dir` (unless already in the path), for `Name` then `Name/js` (files only); first found wins. Errors name
  what was searched: "Can't find 'wimplib/X' (not in WimpLib$Path: <dir>, <dir>)" (`; nor in WimpLib$Dir: <dir>`),
  and with neither variable set "Can't find 'wimplib/X' (WimpLib is not installed: WimpLib$Dir is not set)"; a
  bare `'wimplib'` is "(no module name)" (docs/CORE_API.md 11a). The earlier hard-coded lookup of
  `$.MoreApps.WimpLib` is gone (the library moved; the specifier did not). The name is confined: the prefix matches in any
  case (`/^(wimplib|gamelib)(\/|$)/i`, in `moduleURL` and `resolveLib`) and every segment after it must match the
  whitelist `/^[A-Za-z0-9_][A-Za-z0-9_-]*$/`, so `..`, `^`, `$`, `@`, `<Var>`, `:`, dots (`Zip.js`), wildcards,
  spaces and empty segments are refused with "Can't find '<spec>' (a WimpLib module name is letters, digits, _ and
  -, with / between directories)" (tested in `tests/moreapps/jsrun-wimplib.mjs`).
  Pre-existing: circular imports hang, and `import` text inside comments is resolved.
* `src/main.js`: after `Repeat Filer_Boot <BootResources$Dir>`, start-up runs `Repeat Filer_Boot
  ADFS::HardDisc4.$.MoreApps -Applications -Tasks` when the directory exists (errors are only logged), so the
  applications' `!Boot` files set their sprites and file types (!Word: &A7E) from a cold boot. This desktop runs
  neither `Choices.Boot.Desktop` nor PreDesktop's `*AddApp`, so the boot is done here.
* `tools/disc-wimplib.mjs` (new; in `tools/build.mjs` after `disc.mjs`, before `disc-moreapps.mjs`) installs
  `tools/moreapps/!WimpLib` as `$.!Boot.Resources.!WimpLib` (an addition to the system resources: `!Boot`, `!Run`,
  `!Help`, `!Sprites` and the modules), rewriting only that subtree and its manifest node (inserted at its sorted
  place; the other `Resources` entries untouched). Its `!Boot` sets `WimpLib$Dir`, `WimpLib$Path` (only when unset)
  and `WimpLib$Version`; `src/main.js`'s existing `Repeat Filer_Boot <BootResources$Dir>` runs it at start-up,
  before the MoreApps line, so no new `main.js` code was needed. `--check` as below, plus <= 250 lines and no
  `riscos` outside an import from it. It shares `MOREAPPS_SRC` / `MOREAPPS_DISC` and the `.moreapps-lock` with
  `disc-moreapps.mjs`.
* `tools/moreapps/package.json` (new): the package `wimplib` with `"exports": {"./*": "./!WimpLib/*"}`, so the
  `!Word` sources' `'wimplib/<Name>'` imports resolve in Node (package self-reference) for the unit tests.
* `tools/disc-moreapps.mjs` now installs only `$.MoreApps.!Word`, and removes `MoreApps.WimpLib` (disc and manifest)
  when present. It (after `disc.mjs` in `tools/build.mjs`) adds one line each to `!Boot`'s and
  `Utilities.!ResetBoot`'s `Choices.Boot.Desktop` (`Filer_Boot` of `Boot:^.MoreApps`) and `PreDesktop` (`AddApp
  Boot:^.MoreApps.!*`), as RISC OS would have them.
* Tests: `tests/moreapps/disc.test.mjs` (node), `tests/moreapps/jsrun-wimplib.mjs` and `tests/moreapps/boot.mjs`
  (Playwright), in `node --test tests/moreapps/index.mjs`. The application and library are described in
  `docs/apps/Word.md`; the user guide is `$.Docs.Word`.

## wimp.drag keeps its pointer listeners after a mid-drag close — noted by the WORD work (!Word)
**Status:** Open: shared code, not changed by the !Word work.

`src/core/wimp.js` `wimp.drag({type: 'point'})`: if the window that started the drag is closed while the button is
still down, the drag's pointer listeners stay on the document until the button is released (then `onEnd` runs).
Nothing is drawn meanwhile; !Word's `EditMouse` stops its own auto-scroll timer on its next tick (within 60 ms).
Possible fix: let `wimp.drag` end the drag when its owner window is deleted or closed.

## Text-input caret (opt-in text-input proxy) — changes in shared code, for !Word typing
**Status:** Done: documented in CORE_API.md §3.1 (`textinput`, `composition`, `compositionend`) and §3.2
(text-input caret). Copy/cut events, HTML (rich) paste, caret blinking and click counts followed: see "Clipboard
events for text carets" below.

* `src/core/textinput.js` (new): `TextInput`, one hidden `<textarea>` appended to `document.body` (outside
  `.screen`) the first time a text caret is set, never before; `sanitizeText(s)` (pure) and `MAX_TEXT` (100,000).
  Commits come from `beforeinput` `insertText` / `insertReplacementText` (cancelled, so the field stays empty) and
  from `compositionend` (the input method's own `insertCompositionText` / `insertFromComposition` edits are left to
  it); a non-cancellable edit is caught by the `input` event once and the field cleared (an edit already delivered by
  `beforeinput` is not delivered again: the `_sent` flag). Some browsers end a composition with empty `data` although
  the field holds the committed text: that value is used (after a real cancel the field is empty, so it is a cancel).
  Known limitation: while the field lacks the browser focus (the user clicked a page field outside the desktop),
  AltGr/Option characters arrive as `key` events with Ctrl+Alt and !Word's printable fallback drops them.
* `src/core/wimp.js`: `wimp.textInput`; `setCaret(win, icon, index, pos, opts)` — a 5th argument `{text: true}`
  sets `wimp.caret.text = true` (only then; the property is absent otherwise) and focuses the proxy synchronously
  at the caret; any other caret blurs it (no effect when it was never made). `_drawCaret` moves it with the caret.
  `_keyDown`: the guard that ignores keys typed in page fields outside `.screen` lets the proxy's own keys through
  (`e.target === wimp.textInput.el` while the caret is a text caret); for those keys, composing keys (isComposing,
  keyCode 229) are left to the browser, printable keys (one character, no Ctrl/Cmd; Ctrl+Alt only as AltGr: AltGraph modifier on, or a character other
  than an ASCII letter or digit) return before
  the `key` event and without `preventDefault` so they arrive once as `textinput`, and a modal state cancels every
  key. All other paths are unchanged.
* `src/core/menu.js`: restoring the caret after a menu closes passes `{text: true}` again for a text caret.
* Tests: `tests/core/test-textinput.mjs` (Playwright and CDP: `insertText`, dead keys, `Input.imeSetComposition`,
  auto-repeat, hot keys, focus/blur) and `tests/core/test-textinput-pure.mjs` (node), both in
  `tests/core/index.mjs`.

## Clipboard events for text carets; caret blink; click count — changes in shared code, for !Word copy and paste
**Status:** Done: documented in CORE_API.md §3.1 (`click` `count`, `paste`, `copy`, `cut`) and §3.2 (text-input
caret: keys, options, `exec`, `readClipboard`). Used by !Word's copy, cut, paste and Find (`docs/apps/Word.md`,
"Clipboard and Find"), which needed no further core change. Open:
* pictures and other rich types from the asynchronous clipboard (`readClipboard` reads text and HTML only), and
  pasted `File`s are passed on but never read: !Word refuses a files-only paste with a message;
* the `clipboard: true` placeholder is untested in Safari and Firefox (no WebKit or Firefox to test with: Chrome
  fires copy / cut with an empty field) and stays off unless asked for; !Word does not ask for it, so copy and cut in
  those browsers are unverified (on the owner's hand-off list);
* the `paste` payload does not carry `sanitizeText`'s `truncated` flag: !Word recomputes it from the raw event in a
  capture listener of its own (`ClipPick.cutShort`), which a paste through `readClipboard` does not have. Possible
  fix: `pastePayload` returns `truncated` and `_textPaste` / `readClipboard` pass it on.

Everything except the click `count` (an extra field on every `click` / `doubleclick` / `drag`) applies only to a
text caret (`wimp.caret.text`); other carets, writable icons, TextArea, Edit, !Browse and every other app behave
as before (control tests below).
* `src/core/textinput.js`: pure `pastePayload({text, html, files})` (text through `sanitizeText`, html dropped over
  `MAX_HTML` 2,000,000 characters, at most `MAX_FILES` 8 files) and `copyData()` (`setData` for `COPY_TYPES`
  text/plain, text/html, text/uri-list, string data only, caps `MAX_COPY_TEXT` 5,000,000 / `MAX_COPY_HTML`
  8,000,000, a larger value drops the type; `close()` ends it); `TextInput.exec(cmd)`, `setHasSelection(on)` and the
  placeholder (only with the caret option `clipboard`; the declaration is dropped when the caret leaves the window,
  so apps declare it again on `gaincaret`); the `input` fallback never delivers an `insertFromPaste*`
  edit as text (so a browser that ignores the cancelled `beforeinput` cannot deliver a paste twice); a cancelled
  composition that leaves the placeholder behind is not text.
* `src/core/wimp.js`: `_paste` sends a text caret's window `{text, html, files, window}` (`_textPaste`) and calls
  `preventDefault` when it was used; the plain branch and the writable-icon branch are unchanged. New `copy` / `cut`
  listeners on `document` (`_copyCut`, added once in `init`): only with a text caret in an open window and the event
  aimed at the hidden field or inside `.screen`; data set through `setData` is written with
  `clipboardData.setData` and the default cancelled, none leaves the default (the document's `body` / `html` as the
  target, when the hidden field lost the browser focus, counts as the desktop; a page field does not).
  `_keyDown`: for the focused hidden field, Ctrl/Cmd + C/X/V without Alt are not `preventDefault`ed (the letter:
  `e.key` when an ASCII letter, else `e.code` KeyC/KeyX/KeyV for non-Latin layouts; the `key` event still comes
  first) and the old
  Cmd + c/v/x/r/l exemption does not apply (Cmd-R, Cmd-L, Cmd+Alt+C are cancelled); other targets keep the old rule.
  `readClipboard()` (call inside a user gesture; text items read at most 400,000 bytes, HTML items over
  6,000,000 bytes skipped). `setCaret` options `blink`, `clipboard` (`wimp.caret.blink` / `.clipboard`), `_drawCaret`
  toggles the `blink` class and restarts the animation. `_workPointerDown` adds `count` (a separate run tracker,
  `_clickRun`; `isDouble` / `_lastClick` untouched).
* `src/core/menu.js`: the caret restored after a menu closes keeps `blink` and `clipboard`.
* `src/core/desktop.css`: `.caret.blink` (`caret-blink 1.06s steps(1) infinite`, none with reduced motion).
* Tests: `tests/core/test-clipboard.mjs` (Playwright, in `tests/core/index.mjs`: synthetic `ClipboardEvent`s, real
  Ctrl/Cmd keys with clipboard permissions, plain-caret and writable-icon controls, `exec`, `readClipboard`, blink,
  counts) and `tests/core/test-textinput-pure.mjs` (the caps).

## wimp.drag does not say that a pointer drag was cancelled — noted by the !Word formatting work (!Word)
**Status:** Open: shared code, not changed by the !Word work.

`wimp.drag({type: 'point'})` (`src/core/wimp.js`, over `startPointerDrag` in `src/core/input.js`) ends on `pointerup`
and on `pointercancel` alike, and what it resolves with is the same. !Word's ruler (`tools/moreapps/!WimpLib/Ui/Ruler`) cannot tell a cancelled drag from a
release, so it commits the indent at the coordinates of the cancel event, where a cancel should leave the paragraph
alone. Possible fix: add `cancelled: true` to the drop information on `pointercancel` (and on a mid-drag close).

## The core has no detachPane — noted by the !Word formatting work (!Word)
**Status:** Open: shared code, not changed by the !Word work.

A pane attached with `attachPane` cannot be detached again. !Word's ruler is hidden by Format > Ruler, so `Ui/Ruler`
closes the pane again after every `moved` or `opened` event of its parent window (it reopens when shown). It works,
but each parent move restacks the windows once more. Possible fix: `detachPane(pane)` (or `attachPane` accepting a
hidden state) in `src/core`.

## The wheel event has no Ctrl flag — noted by the !Word formatting work (!Word)
**Status:** Open: shared code, not changed by the !Word work.

The core's `wheel` event (`src/core/wimp.js` `_wheel`) carries `dx`, `dy` and `shift` but not Ctrl, so !Word's zoom (`ZoomBind`) reads Ctrl from
`os.input.keysDown` for Ctrl+wheel. A trackpad pinch reaches the browser as a wheel event with `ctrlKey` set but
nothing in `keysDown`, so a pinch scrolls instead of zooming. Possible fix: add `ctrl` to the `wheel` event
(the pinch could then zoom).

## The wheel scrolls pane windows that have no scroll bars — noted by the !Word formatting work (!Word)
**Status:** Open: shared code, not changed by the !Word work.

`src/core/wimp.js` `_wheel` scrolls whatever window is under the pointer, panes included. A toolbar or ruler pane is
wider than its window (extents 4000 and 8000 px), so a sideways wheel, Shift+wheel or trackpad swipe over it slid its
contents away for good, and a wheel over it did nothing for its document. Possible fix: skip pane windows (or windows
with no scroll bars) in `_wheel` and route the wheel to the parent. Worked round in !Word: `Ui/PaneWheel` (used by
`Ui/Toolbar` and `Ui/Ruler`) claims the pane's `wheel` event and forwards it to the parent window.

## The Wimp's query() has two buttons at most — noted by the !Word documents work (!Word)
**Status:** Open: shared code, not changed by the !Word work.

`query({task, title, message, buttons})` (`src/core/dialogs.js`) lays out and answers two buttons only, so the
Save / Discard / Cancel box a program shows before it throws changes away cannot be made with it. !Word built its own
in WimpLib (`tools/moreapps/!WimpLib/Ui/SaveQuery`: any number of buttons, Return = the first, Escape and the close
icon = the last, one box per task at a time). Possible fix: let `query()` take three buttons (or more), with the
same Return / Escape rule; `Ui/SaveQuery` could then become a thin wrapper.

## The Save box's OK needs a full path; doSave carries on after the box is deleted — noted by the !Word documents work (!Word)
**Status:** Open: shared code, not changed by the !Word work.

`saveAs()` (`src/core/dialogs.js`): OK (and Return) only saves when the name contains `.` or `:`; a bare leaf says
"To save, drag the icon to a directory display". !Word therefore fills its Save as box with a full path (the
document's, or a directory and the window's name for an untitled one). Also, `doSave` awaits the program's `save`
(or `getData`) and then calls `wimp.menus.close()`, `nameI.setText`, `w.close()` and `opts.onSaved` even when the box
was deleted meanwhile (its owner window closed while the bytes were being made); !Word's `onSaved` and pending-save
code cope with a deleted box (`DocSave`: a `gone` set; a skipped write settles nothing). Possible fix: OK with a bare
leaf could save into a default directory supplied by the program (`opts.dir`), and `doSave` could stop after its
await if the window has been deleted.

## Shutdown restarted after PreQuit ends in the shutdown, even from Exit — noted by the !Word documents work (!Word)
**Status:** Open: shared code, not changed by the !Word work.

The PreQuit pattern (`src/apps/Edit/main.js`, followed by !Journal and !Word): when every task is asked
(`os.switcher.preQuitAll()`, used by both `shutdown()` and `exitDesktop()`), a program that objected and then got
Discard restarts the closedown with `wimp.emit('hotkey:CtrlShiftF12')`, which is always the shutdown. So leaving the
desktop (Task Manager > Exit) with unsaved changes in !Edit or !Word, answered Discard, ends in the shutdown's
restart box instead of the command line. The message does not say which closedown sent it. Possible fix: pass the
closedown's kind in the PreQuit message (`{all: true, exit: true}`) or give the switcher a `restartClosedown()`
that repeats the last one; programs would call that instead of emitting the hot key.

## Icon bar icons never report a double-click; doubleClickMs is not reachable from 'riscos' — noted by the !Word documents work (!Word)
**Status:** Open: shared code, not changed by the !Word work.

`wimp.iconbar.add` makes button type 3 icons, and `wimp._workPointerDown` reports every press on them as a `click`
(only types 5, 8 and 10 produce `double`), so a double-click on an icon bar icon reaches the program as two Select
clicks. !Word (whose click makes a new document) ignores a click within 500 ms of the one that made a document, a
constant: the configured double-click time (`os.input.config.doubleClickMs`, set by !Configure) is not among the
names the `'riscos'` module gives a disc program. Possible fix: report `kind: 'double'` for the second click of a
double-click on an icon bar icon, or give programs the configured double-click time (through `'riscos'`).

## HostFS writes complete after the save has returned — noted by the !Word documents work (!Word)
**Status:** Open: shared code, not changed by the !Word work.

`vfs.writeFile` on a HostFS drive (`src/core/hostfs/hostfs.js`) updates the mount's metadata synchronously and writes
the bytes to the host (File System Access or the server) a moment later. If the host refuses the write (a read-only
folder, the permission withdrawn, the server gone), the HostFS Filer reports it in an error box, but the program has
already been told the save succeeded: !Word marks the document saved (no `*`). Possible fix: a `vfs.flush(path)` (or
`writeFileAsync`) that resolves when the host has the bytes and rejects when it refused, so a program can mark the
document saved only then.

## A long paste into a writable icon is typed character by character — noted by the !Word Find work (!Word)
**Status:** Open: shared code, not changed by the !Word work.

`wimp._paste` (`src/core/wimp.js`) gives a writable icon with the caret the clipboard's first line one character at a
time through `_editKey`; past the icon's `maxLen` every further character beeps (`wimp.beep`, VDU 7) and is dropped.
A 3000-character paste into !Word's Find field (`maxLen` 1000) takes about 50 ms and beeps 2000 times; a 1 MB paste
would run a million `_editKey` calls and beeps. The text is not passed through `sanitizeText` either. Possible fix:
take the line, cut it to the room left in the icon (`maxLen - text.length`, at a code point), insert it in one
`set`, and beep once when anything was cut.

Also: Ctrl-V reaches this path in !Word's Find box only because `Ui/FindBox` sets `ev.allowDefault` for it (as the
TextArea and !Browse do); writable icons have no selection, so Ctrl-C / Ctrl-X (and Cmd-C / Cmd-X) copy and cut
nothing from them. Copying from a writable icon would need a selection model in `_editKey` and a plain-caret branch
in `_copyCut`: not done (no shared-code change in the !Word work).

## jsrun: 'gamelib' import specifier (resolveLib); disc-gamelib, disc-pacman; tools/games package — noted by the !Pacman / GameLib work (GameLib)
**Status:** Resolved: documented in CORE_API.md 11a and 14.

* `src/core/jsrun.js`: `resolveWimpLib` became `resolveLib`, serving two libraries from the `LIBS` table
  (`wimplib` / `WimpLib`, `gamelib` / `GameLib`): the import specifier `'gamelib/<Name>'` is searched through
  `GameLib$Path`, then `GameLib$Dir`, exactly as `'wimplib/<Name>'` is through `WimpLib$*`, with the library's name in
  the messages. The `WimpLib` messages and behaviour are unchanged (`tests/moreapps/jsrun-wimplib.mjs` is untouched
  and passes); `GameLib` is tested in `tests/games/jsrun-gamelib.mjs`.
* `tools/disc-gamelib.mjs` (`$.!Boot.Resources.!GameLib`, from `tools/games/!GameLib`) is registered in
  `tools/build.mjs` after `disc-wimplib.mjs`; `disc-pacman.mjs` (`$.Diversions.!Pacman`, from `tools/games/!Pacman`, with the same checks plus the `riscos`-only-in-an-import-line
  rule for `!RunImage`) runs after `disc-lander2.mjs`. `tools/games` is a
  package (`package.json` maps `gamelib/*` to the sources) so the tests import the modules as the disc programs do.
* Pre-existing, unchanged: `import` text inside comments is resolved, so the library's sources have none (checked by
  `disc-gamelib.mjs`).
