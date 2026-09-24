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
