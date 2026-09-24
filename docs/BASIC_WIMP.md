# BASIC programs in the desktop and the Wimp SWI bridge (`src/core/basicwimp/`)

Owner: TASKWINDOW + BASIC-WIMP agent. Lets original tokenised BBC BASIC programs run from the desktop as on
RISC OS 3.71: plain programs single-tasking and full screen, Wimp programs as multitasking desktop tasks.

## How a BASIC program is run

`installBasicWimp()` (called from `src/main.js` after `installBasicHost()`) wraps `os.hooks.basic`
(`*BASIC`, `*BASIC64`, and `Alias$@RunType_FFB` = `BASIC -quit "%*0"`, i.e. double-clicking a `,ffb` file):

| started from | runs as |
|---|---|
| a task window (`ctx.tw` set by the TaskWindow shell) | text mode in the task window (`src/apps/TaskWindow/shell.js`) |
| the F12 command line, interactive `*BASIC`, `-load` | the core's full-screen BASIC (`src/core/basichost.js`) |
| the desktop (Filer double-click, `*Run`, an app's `!Run`) | `runner.js`: a `BasicProcess` |

A `BasicProcess` starts the program in the background on its own `BasicMachine` + `DesktopVDU` (a VDU in a 256-colour
mode exactly the desktop's size, 1 px = 2 OS units, so screen coordinates are the real ones). Then:

* **it writes to the screen or waits for a key before calling `Wimp_Initialise`** → single tasking: the screen is taken
  (`os.cli.acquireScreen`), the VDU is shown scaled to fill it (its own `MODE`s included), keys/mouse go to the program.
  When it ends: VDU 4, "Press SPACE or click mouse to continue", then back to the desktop.
* **it calls `Wimp_Initialise`** → a desktop task (`bridge.js`), listed in the Task Manager with its `*WimpSlot` size.
  Anything it prints outside redraws (e.g. an untrapped error) is collected and shown in the *Command window when it
  ends; `ERROR EXT` / untrapped errors are reported with "Message from <task>".

`*WimpSlot -min nK` (in `!Run`) sets the next program's slot: HIMEM = &8000 + slot rounded up to 32K pages; `END=` also
grows in 32K pages (as on a 4MB A5000, which is what makes e.g. !Patience's `END=END+10000` work). `Wimp_SlotSize` can grow
the slot up to the RMA (the program's memory is a flat 4MB; HIMEM doesn't move).

## Running the original applications

Native JavaScript versions stay the default: their descriptors claim the disc application directories (double-clicking
`$.Apps.!SciCalc` runs `src/apps/SciCalc/`). To run an **original** `!RunImage` through the bridge, **copy the application
directory somewhere else** (e.g. drag `!SciCalc` to the RAM disc) and double-click the copy — its `!Run` Obey file runs as
on RISC OS (`Set SciCalc$Dir <Obey$Dir>`, `WimpSlot`, `IconSprites`, `BASIC64 -quit <SciCalc$Dir>.!RunImage`). Any
user BASIC Wimp application works the same way. Status of the originals on the seed disc (`tests/bw/bw-apps.mjs`):

| app | through the bridge |
|---|---|
| !SciCalc | works: templates, sprite icons, keys, clicks, icon bar menu, Info box submenu, interactive help, Quit |
| !Maestro | works (score window with staves, panes, menus); needs a stand-in for `EnsureRMA` (an ARM binary not on the seed disc); no sound playback (Sound_QSchedule is a no-op) |
| !Clock, !Puzzle, !Blocks, !Patience, !MemNow, !Flasher | start, windows / icon bar work (windows open at the pointer, like the originals) |
| !CloseUp | runs, but magnifies its own blank screen (the bridge has no access to desktop pixels) |
| !Player, !AWViewer | need modules that aren't there (Audio_*, AWRender_*) |
| !SlideShow, !HForm, !Verify, !SaveCMOS | single-tasking programs (take the screen); they need hardware/ChangeFSI and don't get far |
| Examples.!Doodle | the demo below: works |

## Seed disc examples (`$.Examples`, built by `node tools/basicwimp-demo.mjs`)

Sources in `src/core/basicwimp/demo/`: `Doodle.bas` (a small Wimp app: icon bar icon, window created from a block,
redraw loop with VDU graphics, Wimp_SetColour, menu with Adjust-keeps-open, ReportError, keys) and `Spiral.bas`
(single tasking, MODE 28). The tool tokenises them into `assets/disc/HardDisc4/Examples/` and adds them to
`assets/disc/manifest.json`; re-run it after `node tools/disc.mjs` (which rebuilds `assets/disc` from vendor/).

## Files

| file | contents |
|---|---|
| `index.js` | `installBasicWimp()`: the `os.hooks.basic` dispatcher, `*BASIC64`, the `*WimpSlot` hook |
| `runner.js` | `parseBasicArgs`, `runDesktopBasic`, `BasicProcess` (single tasking screen, Press SPACE, errors, END= pages) |
| `bridge.js` | `WimpBridge` (one per task) and `installWimpSwis` — the Wimp_* SWIs |
| `screen.js` | `DesktopVDU`, `WindowCanvas` (per-window backing store + canvas), rectangle lists |
| `templates.js` | Templates files from the VFS: Wimp_OpenTemplate / LoadTemplate (wildcards, size enquiry, fonts) |
| `services.js` | MessageTrans_*, Territory_*, OS_SpriteOp (sprite areas in program memory, plotting), Font_*, ColourTrans font colours, Sound voices, OS_ReadDynamicArea |

## The bridge

* **Handles**: window handles are `&220000 + n*64` (never valid menu/app memory, so a menu item's submenu pointer is
  recognised as a dialogue box); icon handles are indices; icon bar icons are window -2 (-1 when creating = right side).
* **Blocks** are read from / written to the program's memory in OS units (origin bottom-left, y up) and converted to
  the core's pixels (y down). Indirected icon text / validation / titles stay in program memory: the bridge re-reads
  them on every Wimp_Poll, SetIconState and ForceRedraw, and writes a writable icon's text back as the user types.
  Icons in the app's sprite area (window block +64, or an indirected sprite icon's area) are decoded from memory.
* **Wimp_Poll / PollIdle** return a Promise: the program is suspended until an event is available (cooperative
  scheduling). Order: queued events (masked ones are dropped), then Redraw_Window_Request for windows with invalid
  areas (top first), then null events (Poll: after ~1ms; PollIdle: at the given monotonic time). Core window events are
  turned into Wimp events: user moves/resizes/scrolls/toggles → Open_Window_Request (the window only moves when the
  program calls Wimp_OpenWindow), close → Close_Window_Request, clicks/drags/double clicks → Mouse_Click (buttons ×256
  for a single click on type 10, ×16 for drags), keys → Key_Pressed (unhandled ones come back via Wimp_ProcessKey and go
  to hot-key windows / F12 …), caret gain/loss, pointer enter/leave, scroll requests, menu selections, messages.
* **Redraw**: each window has a work-area-sized backing store of pixel values + a canvas behind its icons. For each
  rectangle of Wimp_RedrawWindow / Wimp_UpdateWindow / Wimp_GetRectangle the program's VDU graphics window is set to it
  (screen coordinates), the colours are set to the window's work area colours, Redraw fills it with the background
  (Update copies the current contents in), the program draws with any VDU/PLOT/SpriteOp/Font_Paint call, and the pixels
  are copied back; pixels still equal to the background colour stay transparent so the core's (textured) background
  shows through. Windows keep their content while moved/scrolled; only never-drawn or ForceRedraw'n areas are asked for.
* **Menus**: Wimp_CreateMenu blocks become core `Menu`s (ticks, dotted lines, shading, writable items, sprite items,
  submenus, dialogue-box submenus, submenu warnings → Message_MenuWarning + Wimp_CreateSubMenu). Selecting gives
  Menu_Selection; re-opening the same menu after an Adjust click refreshes the open tree in place.
* **Messages**: Quit, PreQuit, ModeChange, MenusDeleted, MenuWarning, HelpRequest (the reply is cached for the core's
  interactive help, so !Help shows the program's own help texts), DataLoad/DataOpen (files dropped on its windows /
  icon bar icon) are delivered as User_Message blocks; messages between BASIC tasks are passed on.
* **SWIs**: Initialise, CloseDown, Create/Delete Window/Icon, Open/CloseWindow, Poll, PollIdle, RedrawWindow,
  UpdateWindow, GetRectangle, GetWindowState/Info/Outline, Set/GetIconState, WhichIcon, ResizeIcon, GetPointerInfo,
  DragBox (window move/size, fixed/rubber/point boxes → User_Drag_Box), ForceRedraw, Set/GetCaretPosition,
  CreateMenu, CreateSubMenu, DecodeMenu, GetMenuState, SetExtent, BlockCopy, Open/Close/LoadTemplate, ProcessKey,
  StartTask, ReportError, PlotIcon (sprites, text, fill, border), SetColour, TextColour, ReadPalette, SetFontColours,
  TextOp, SpriteOp, BaseOfSprites, ReadPixTrans, SlotSize, ReadSysInfo, SendMessage, TransferBlock (BASIC↔BASIC);
  no-ops: SetMode, SetPalette, SetPointerShape, CommandWindow, ClaimFreeMemory, Add/RemoveMessages, RegisterFilter,
  SetWatchdogState, SetColourMapping, Extend.

## Limitations

* The bridge VDU is per task, not the real screen: programs that read the screen (CloseUp, OS_SpriteOp 14/16 of the
  desktop) see only their own drawing. Output-to-sprite (SpriteOp 60) stays on the screen.
* 256 colours: Wimp colours map to the nearest of the default 256-colour palette (as on a real 256-colour desktop).
* Messages to JavaScript tasks aren't translated (no RAM transfer / DataSave protocol with native apps yet); a Wimp
  program started inside a task window has no Wimp SWIs (it runs in the task window's text-only BASIC).
* No ARM-code Wimp calls beyond what BASIC's ARM emulator passes through the SWI table (they do go through it).

## Tests / screenshots

`tests/bw/bw-scicalc.mjs` (original !SciCalc from a RAM disc copy: window, keys, buttons, help, menu, Info box,
Task Manager entry, Quit), `tests/bw/bw-demo.mjs` (Examples.Spiral single tasking + Press SPACE, Examples.!Doodle),
`tests/bw/bw-apps.mjs [Dir.!App …]` (every original BASIC app on the seed disc). Run with `node serve.mjs` up and
`PLAYWRIGHT_MODULE=…/node_modules/playwright/index.mjs`. Screenshots: `tests/screens/bw-*.png`.
Debugging: `window.bwProcesses` (live `BasicProcess`es: `.machine`, `.bridge`, `.errors`, `.lateOutput`); a program that
ends with an error logs `BASIC program … ended with error …` with its last errors and line numbers to the console.
