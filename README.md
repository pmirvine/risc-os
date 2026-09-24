# RISC OS 3.71 in the browser

A faithful recreation of the Acorn RISC OS 3.71 desktop (RiscPC / A7000, 1996-98) that runs entirely in a web
browser: the Wimp and its window furniture, the icon bar, Filer, Pinboard, Task Manager, a persistent hard disc, a
BBC BASIC V interpreter, and the ROM and hard-disc applications. It is built from the original resources (sprites,
window templates, Messages files, help text, sample files) extracted from the RISC OS 3.71 source tree.

Plain modern JavaScript ES modules. There is no bundler, no framework and no runtime dependency.

## Running it

```sh
node serve.mjs            # static server on http://localhost:8371/ (node serve.mjs 9000 for another port)
```

Open `http://localhost:8371/` in a recent Chrome, Firefox or Safari. Any static web server works. The first visit in a
session shows the boot sequence; later reloads go straight to the desktop.

URL options: `?fast=1` (skip the boot screen), `?zoom=2` (double-size pixels), `?buttons=adjust` (right button =
Adjust), `?open=<dir>`, `?run=<app>`, `?cmd=<*command>`, `?reset=disc|cmos|all` (see below).

A cold load fetches about 0.9 MB (uncompressed) in about 130 requests. On localhost the desktop is ready in about
1.4 s, most of which is the boot screen (under 0.1 s with `?fast=1` and a warm cache). Only small application
descriptors load at start-up. Each application's code, templates, sprites and the BASIC interpreter / VDU load the
first time they are used, and sprites are fetched one PNG at a time as they are needed.

## Controls

| RISC OS | Browser |
|---|---|
| Select | left button |
| Menu | middle button or **right button** (default) |
| Adjust | Shift + left. With *Configure Buttons Adjust (or `?buttons=adjust`), the right button is Adjust and Ctrl + left is Menu |
| F12 | the `*` command line (Return on an empty line goes back to the desktop) |
| Ctrl-F12 | a new task window |
| Shift-F12 | bring the icon bar to the front / send it back |
| Ctrl-Shift-F12 | Shutdown (Task Manager) |
| Escape | cancel menus, dialogue boxes and drags; stop BASIC programs |
| Copy / Insert / Home / PageUp / PageDown | End / Insert / Home / PageUp / PageDown |
| mouse wheel | scrolls the window under the pointer |
| Shift-Select on a close icon | iconise the window onto the Pinboard |

Dragging works as on RISC OS: drag files between Filer windows (Shift = move), onto applications, onto the icon bar
or onto the backdrop (to pin them). Drag the file icon in a Save box to a Filer window or into another application.

### Resetting

Files written to the hard disc (`ADFS::HardDisc4`) and floppy (`ADFS::0`) are kept in IndexedDB as an overlay over the
supplied disc. The configuration ("CMOS RAM") is kept in localStorage. The RAM disc lasts only for the session. To
reset:

* `*ResetDisc` discards every change to the hard disc and floppy, restoring the disc as supplied, and restarts.
  `*ResetDisc -cmos` also resets the configuration.
* `*ResetCMOS` resets the configuration only (!Configure settings, zoom, mouse buttons, Pinboard, alarms, printers).
* Hold **Delete** while the page loads ("Delete-power-on") to reset both. Hold **R** ("R-power-on") to reset the
  configuration only.
* Or load `?reset=all`, `?reset=disc` or `?reset=cmos`.

## What's included

**Desktop:** Wimp (3D window furniture from the Tools sprites, textured backgrounds, menus with dialogue-box
submenus, drags, interactive help, error boxes); icon bar with floppy, hard disc, RAM disc, Apps and Display Manager
icons; Filer (large/small/full info, sorting, copy/move/delete/rename/access/count/find/set type, Filer_Action
windows); Pinboard (backdrop textures and pictures, pinned files, iconised windows, persistent); Task Manager
(task display, memory bars, New task, Quit task, Exit, Shutdown); F12 command line with about 100 `*` commands
(Cat, Ex, Copy, Wipe, Set, Alias, If, Obey, Configure …); system variables with GSTrans; `!Boot`.

**BBC BASIC V 1.16:** an interpreter with the full language, an inline ARM assembler and ARM2 emulation for CALL/USR,
and a VDU driver with screen modes, graphics, sprites and teletext. It runs full screen (F12 `*BASIC`), in task
windows, and as desktop applications through a Wimp SWI bridge, so original tokenised BASIC Wimp programs run
unchanged (for example the original !SciCalc).

**Applications** (36 descriptors in `src/apps/index.js`):

| ROM (`Resources:$.Apps`) | Hard disc applications | Diversions (games and demos) |
|---|---|---|
| !Alarm: alarms and clock | !SciCalc: scientific calculator | !Patience |
| !Chars: character map | !Maestro: music editor and player | !MineHunt |
| !Configure: all plug-ins | !Squash: file compression | !Meteors |
| !Draw 1.11 | !CloseUp: screen magnifier | !Blocks |
| !Edit 1.54 (with task windows) | !ChangeFSI: image conversion | !Puzzle |
| !Help 2.29: interactive help | !PhotoView: JPEG viewer | !Clock |
| !Paint 1.94 | !Bookworm: HTML manual browser | !MemNow |
| !Printers 1.54: printer manager | !ARPlayer: ARMovie player | !Flasher |
| | !Player: sample player | |
| | !SlideShow | |

The disc also includes !System, !Scrap and !Fonts (`!Boot.Resources`), the Examples directory (a BASIC Wimp demo),
the user guide in HTML, tutorials, images, Maestro tunes, and the original BASIC programs and !Boot files.

## Architecture

```
index.html             loads src/main.js
src/main.js            boot: services, !Boot, application registry, hot keys
src/core/              the operating system
  wimp.js window.js icons.js menu.js input.js     window manager, icons, menus, pointer / keyboard
  iconbar.js filer.js fileraction.js pinboard.js switcher.js devices.js
  vfs.js               filing system: ADFS / RAM / Resources discs, seed disc + IndexedDB overlay
  cli.js commands.js sysvars.js   OSCLI, * commands, system variables and GSTrans
  app.js               application registry: descriptors, lazy load(), Filer_Boot, file types, * commands
  sprites.js templates.js messages.js fonts.js dialogs.js   resources and standard dialogues
  basichost.js basicwimp/   full-screen BASIC, and BASIC programs as Wimp tasks (SWI bridge)
  reset.js             *ResetDisc / *ResetCMOS / Delete-power-on
src/basic/             BBC BASIC V interpreter, tokeniser, ARM assembler/emulator, VDU driver (host-agnostic)
src/apps/<Name>/       one directory per application: app.js (small descriptor) + main.js (loaded on first use)
assets/                converted resources: sprites (PNG + JSON), templates, Messages, fonts, the seed disc
tools/                 Node converters that build assets/ from the original source tree (node tools/build.mjs)
tests/                 node --test suites and Playwright scripts
docs/                  SPEC.md, CORE_API.md (the application API), ASSETS.md, BASIC.md, BASIC_WIMP.md, apps/*.md
```

Each application is a task that talks to the Wimp through an API modelled on the real one: windows made from the
original Templates, Wimp messages (DataOpen, DataLoad, DataSave with RAM transfer, PreQuit, Quit …), menus, the
caret, drags and icon bar icons. See `docs/CORE_API.md`. The screen uses 1 pixel = 2 OS units, square pixels and the
16-colour Wimp palette.

## Tests

```sh
node --test tests/basic/          # BASIC interpreter, tokeniser, assembler, VDU (no browser)
node --test tests/core            # and tests/draw tests/edit tests/paint tests/acc tests/div tests/tw tests/bw
node --test tests/integration     # cross-application flows + a long random ("monkey") test
node tests/integration/flows.mjs dnd print   # one group: dnd print help chars tw configure pinboard shutdown reset basic
node tests/integration/monkey.mjs 5000 1 2 3 # steps, seeds
```

The browser tests need Playwright's Chromium (`npx -y playwright@1.61 install chromium`). They find Playwright in
`node_modules`, the npx cache or `PLAYWRIGHT_MODULE`, and they start `serve.mjs` if nothing is listening on port
8371. Screenshots go to a temporary directory. Set `KEEP_SHOTS=1` to write them to `tests/screens/`.

## Known limitations

* Not an emulator: the OS and applications are reimplemented in JavaScript. ARM machine code runs only inside BASIC
  (CALL/USR and assembler); relocatable modules, absolutes (`,ff8`) and utilities can't run and are left off the disc.
* One screen mode (the browser window size, or a fixed mode from !Configure scaled to fit); 16M colours internally.
  `*WimpPalette` / palette changes are ignored.
* Printing uses the browser: !Printers renders the document to a page sized for the configured paper and opens the
  browser's print dialogue. Printer drivers and printer definition files are emulated, not run.
* Sound: WaveSynth / Percussion voices, Maestro and the sample players are approximated with WebAudio.
* Networking, CD-ROM, NFS/Econet, podules and the hardware-specific parts of !Configure are not provided.
* Outline fonts are the original RISC OS fonts converted to OpenType and drawn by the browser: close, but not
  pixel-identical to the RISC OS font manager (no kerning).
* Per-application gaps are listed under "Known gaps" in `docs/apps/*.md`, `docs/BASIC.md` and `docs/BASIC_WIMP.md`.

## Credits

* RISC OS 3.71 © Acorn Computers Ltd 1987-1997. Its source code is from
  [github.com/barryc-ro/RiscOS_371](https://github.com/barryc-ro/RiscOS_371) (put it in `vendor/ro371/`, which is not
  committed, to rebuild the assets). Everything in `assets/` comes from that tree by the converters in `tools/`: the
  sprites (Wimp, Tools, application and file icons, textures), window templates, Messages files, !Help texts, the
  outline fonts (Homerton, Trinity, Corpus, NewHall, Sassoon, Selwyn, Sidney) and the system font, the palette, file type names, and the
  seed hard disc (`Install/HardDisc4`), including the applications' resources, BASIC programs, tutorials, the user guide,
  images and music.
* The applications are ports of the original sources: Edit, Draw and Paint (C, RISC_OSLib), Alarm, Chars, Help,
  Configure, SciCalc, Maestro, Squash, CloseUp, ChangeFSI, PhotoView, Printers, Bookworm, ARPlayer, Player and the
  Diversions (BASIC and assembler originals). The original authors are credited in each application's Info box.
* This is a non-commercial preservation and educational project and is not affiliated with Acorn, RISC OS Open Ltd or
  RISC OS Developments.
