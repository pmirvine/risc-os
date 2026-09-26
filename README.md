# RISC OS 3.71 in the browser

A faithful recreation of the Acorn RISC OS 3.71 desktop (RiscPC / A7000, 1996-98) that runs entirely in a web
browser: the Wimp and its window furniture, the icon bar, Filer, Pinboard, Task Manager, a persistent hard disc, a
BBC BASIC V interpreter, and the ROM and hard-disc applications. It is built from the original resources (sprites,
window templates, Messages files, help text, sample files) extracted from the RISC OS 3.71 source tree.

Plain modern JavaScript ES modules. There is no bundler, no framework and no runtime dependency.

## Screenshots

| | |
|---|---|
| ![Desktop welcome banner](docs/screenshots/fid-banner.png) Boot: the Desktop welcome banner | ![Filer with menu](docs/screenshots/fid-filer-menu.png) Filer window and menu |
| ![Draw](docs/screenshots/fid-draw.png) !Draw with its toolbox, showing a tutorial Drawfile | ![Paint](docs/screenshots/fid-paint.png) !Paint: sprite file, colours and tools |
| ![Task window running BASIC](docs/screenshots/tw-basic.png) Ctrl-F12 task window running BBC BASIC V | ![Original SciCalc](docs/screenshots/bw-scicalc.png) The original tokenised !SciCalc, running unmodified through the Wimp SWI bridge |
| ![Maestro](docs/screenshots/acc-maestro-play.png) !Maestro playing one of the original tunes | ![Patience](docs/screenshots/div-patience.png) !Patience |
| ![Meteors](docs/screenshots/div-meteors-play.png) !Meteors, ported from the original assembler | ![Task Manager](docs/screenshots/fid-taskmanager.png) Task Manager |
| ![Configure](docs/screenshots/acc-configure-main.png) !Configure | ![BASIC Mandelbrot](docs/screenshots/basic-mandel.png) BBC BASIC V graphics (standalone `src/basic/demo.html`) |
| ![Lander](docs/screenshots/div-lander.png) !Lander: David Braben's 1987 demo (JavaScript port; the original runs on the ARM2 emulator if you supply it) | ![Hopper](docs/screenshots/div-hopper.png) !Hopper, from RISC OS Open's sources |
| ![Plasma](docs/screenshots/basic-plasma.png) `$.Demos.BASIC.Plasma`, one of the BBC BASIC demo programs | ![T1ToFont and Chars](docs/screenshots/tierb-t1tofont-chars.png) !Chars showing a Type 1 font converted by !T1ToFont |
| ![JsEdit](docs/screenshots/jsedit.png) !JsEdit, the programmer's editor, completing a name in the Snake game's source | ![Programming in JavaScript](docs/screenshots/jstutor.png) *Programming in JavaScript*, the tutorial book, in !Bookworm |
| ![Browse](docs/screenshots/browse.png) !Browse showing today's web, in tabs (`node serve.mjs --browser`) | ![Browse select menu](docs/screenshots/browse-select.png) A web page's drop-down list as a RISC OS menu |

## Running it

```sh
node serve.mjs            # static server on http://localhost:8371/ (node serve.mjs 9000 for another port)
node serve.mjs --host Work=~/riscos-files   # ... with a host folder as HostFS::Work (see HostFS below)
node serve.mjs --browser  # ... with a real web browser engine for !Browse (see !Browse below)
node serve.mjs --lan      # ... answering other computers on the network too
```

`serve.mjs` only answers this computer unless `--lan` (every network interface) or `--listen=<address>` is given;
HostFS and !Browse's engine only ever answer this computer.

Open `http://localhost:8371/` in a recent Chrome, Firefox or Safari. Any static web server works. The first visit in a
session shows the boot sequence; later reloads go straight to the desktop.

URL options: `?fast=1` (skip the boot screen), `?zoom=2` (double-size pixels), `?buttons=menu` (two-button mapping:
right = Menu, Shift + left = Adjust), `?open=<dir>`, `?run=<app>`, `?cmd=<*command>`, `?reset=disc|cmos|all` (see below).

A cold load fetches about 0.9 MB (uncompressed) in about 130 requests. On localhost the desktop is ready in about
1.4 s, most of which is the boot screen (under 0.1 s with `?fast=1` and a warm cache). Only small application
descriptors load at start-up. Each application's code, templates, sprites and the BASIC interpreter / VDU load the
first time they are used, and sprites are fetched one PNG at a time as they are needed.

## Controls

| RISC OS | Browser |
|---|---|
| Select | left button |
| Menu | middle button, or Ctrl + right click for mice and trackpads without one (Ctrl + left click works too; macOS turns it into a right click) |
| Adjust | right button |

This is the Acorn mouse layout (as in RPCEmu and Arculator), and Shift keeps its RISC OS meaning, e.g.
Shift-double-click opens an application as a directory or a file as text. For a two-button mapping (right = Menu,
Shift + left = Adjust) use `*Configure Buttons Menu` or `?buttons=menu`.

Action buttons are drawn pressed in while you hold a mouse button on them, as in RISC OS 4 (3.71 itself didn't);
`*Configure WimpPress Off`, or !Configure's Window manager pane, turns this off.
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
* Or load `?reset=all`, `?reset=disc` or `?reset=cmos` (it asks first, as any web site could link to that address).

### HostFS: folders from this computer

As with RPCEmu's or VirtualRPC's HostFS, folders on the host machine can be mounted as RISC OS discs,
`HostFS::<name>.$`. Each mounted folder gets an icon on the icon bar (Select opens it; Menu has Rescan, Free and
Dismount) and can be used like any other disc: open and save files in applications, copy, rename and delete in the
Filer, run BASIC and Obey applications from it, `*Cat HostFS::Work.$`. A guide is on the hard disc itself, in
`$.Docs.HostFS` (source `tools/docs/HostFS`).

* **Click the HostFS icon** (Chrome, Edge and other Chromium browsers) to pick a folder. Changes are written back to
  the folder. The browser remembers the folder: after a reload it comes back, or shows a "no disc" icon to click to
  give permission again.
* **Or name folders when starting the server**, which works in every browser and also keeps RISC OS datestamps:
  ```sh
  node serve.mjs --host Work=~/riscos-files --host-ro Photos=~/Pictures
  ```
  These mount at start-up (HostFS icon menu > Server folders, or `*HostMount Work`). The server only answers
  requests from this machine, and only for the folders named.
* **Firefox and Safari** can't write to a picked folder: *Mount read-only...* on the HostFS icon's menu, or dropping a
  folder onto the page, mounts a read-only snapshot. (In Chromium a dropped folder mounts read-only at first, as the
  browser only asks for write access after a click: choose *Allow changes* from its icon's menu.)

File types follow RPCEmu's convention: a `,xxx` suffix gives the type (`Sprites,ff9`), `,llllllll-eeeeeeee` the
load and exec addresses of an untyped file, otherwise the extension is looked up (`photo.png` is a PNG, &B60;
see `src/core/hostfs/mimemap.js`) and anything else is Text. Files saved from RISC OS get a suffix only when their
type can't be told from the name, so a PNG is saved as `photo.png` but a sprite file as `Sprites,ff9`. The host's
`.` and RISC OS's `/` swap places (`photo.png` is `photo/png`), as do space and hard space, `#` and `?`, `$` and
`<`, `^` and `>`; characters RISC OS can't have in names are shown as `_`, and the file keeps its host name. Files
the host has as read-only show as locked. Mounting a folder holding more than 20,000 objects asks first. Commands: `*HostFS`,
`*HostMount [<server folder>]`, `*HostDismount <name>` (or `*Dismount HostFS::<name>`), `*HostMounts`.

Limits: a folder picked in the browser gets "now" as the date of anything saved to it (the API can't set file
dates), and renaming a directory there copies it. Changes made on the host show up when a Filer window opens the
directory, when the browser window gets the focus again, or at once where the browser or server can watch the
folder.

### !Browse: the web

`$.Apps.!Browse` is a web browser in the style of Acorn's Browse (its button bar, URL bar and status bar with the
spinning globe), for today's web. Started with `node serve.mjs --browser`, the server runs Chrome out of sight
(Chrome for Testing, Chromium, Chrome or Edge, whichever it finds; `--browser=/path/to/chrome` picks one) and
!Browse shows its pages: scripts, logins (kept in `~/.riscos-browse`, or `--browser-profile <dir>`), video, pages'
sound (with Chrome for Testing or Chromium: `npx @puppeteer/browsers install chrome@stable`), tabs and pop-ups.
The RISC OS way: a page's drop-down lists are RISC OS menus, its messages are error boxes, downloads come with a
Save box to drag to a Filer window, a page asking for a file gets one dragged from the Filer, the window's scroll
bars follow the page, and Adjust on a link opens it in a tab behind. File > Save keeps the HTML, Save location a
URI file, Print to PDF a PDF; the hotlist and history are kept in Choices. URI (&F91) and URL (&B28) files open
in !Browse, and other programs (and !Bookworm's links) use `*URLOpen_http <address>`.

Chrome runs headless over a private pipe (no debugging port is opened); pages reach the desktop as a stream of
JPEG frames, and the mouse and keys go back. Without `--browser` (any other server, or from another computer)
!Browse shows pages in a frame instead: many sites refuse that, and it offers to open them in your own browser.
A guide is on the hard disc, in `$.Docs.Browse` (source `tools/docs/Browse`); the design is in `docs/apps/Browse.md`.

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

**JavaScript programs:** files of type JSScript (&F81) run when double-clicked, like BASIC programs, so you can
write your own desktop programs in JavaScript in !Edit, using the same programming interface as the built-in
applications. The book *Programming in JavaScript* (`$.Manuals.JSTutor`, read with !Bookworm) teaches JavaScript
this way, for people who have done a little programming before; its example programs, including a Snake game, are
in `$.Examples.JS`. A second book, *Writing Desktop Applications in JavaScript* (`$.Manuals.JSApps`), follows on:
readers build !Contacts, an address book with a Draw-style toolbar, vCard/CSV import and export, undo and Choices,
and then !Organiser, a personal organiser in the spirit of Lotus Organizer (a ring binder with Diary, To do,
Address, Notepad, Planner and Anniversary sections, links, alarms, printing and iCalendar), with a small toolkit
of their own; every chapter's stage is in `$.Examples.JSApps`. `$.Apps.!JsEdit` is a programmer's editor for them (in the style of StrongED and Zap): syntax
colouring for JavaScript, BBC BASIC, Obey and JSON, line numbers, smart indentation, completion of the desktop's
programming interface, a syntax check as you type, Run, throwback of errors to their lines, a Functions list and
a dark theme. Three programming fonts with icons ("Nerd Fonts": JetBrains Mono, Hack, Fira Code) are in every
font menu.

**Applications** (48 descriptors in `src/apps/index.js`):

| ROM (`Resources:$.Apps`) | Hard disc applications | Diversions (games and demos) |
|---|---|---|
| !Alarm: alarms and clock | !SciCalc: scientific calculator | !Patience |
| !Chars: character map | !Calc: the RISC OS 2 / 3.1 desk calculator, restored | !MineHunt |
| !Configure: all plug-ins | !Maestro: music editor and player | !Meteors |
| !Draw 1.11 | !Squash: file compression | !Blocks |
| !Edit 1.54 (with task windows) | !CloseUp: screen magnifier | !Puzzle |
| !Help 2.29: interactive help | !ChangeFSI: image conversion | !Clock |
| !Paint 1.94 | !PhotoView: JPEG viewer | !MemNow |
| !Printers 1.54: printer manager | !Bookworm: HTML manual browser | !Flasher |
| !InetSetup: Internet configuration (and !Internet) | !ARPlayer: ARMovie player | !Madness: moves every other window |
| | !AREncode (and !ARWork): Replay movie compressor | !Hopper: Frogger-style game |
| | !JsEdit: programmer's editor (JavaScript, BASIC, Obey) | |
| | !Browse: web browser (see above) | |
| | !Player: sample player | !Lander: David Braben's 1987 demo (see below) |
| | !SlideShow | |
| | !CDPlayer: the Audio Panel (no CD drive) | |
| | !FontPrint: PostScript printer font lists | |
| | !Access+ and !AccessCD: ShareFS sharing | |
| | !Patch: application patcher | |
| | !T1ToFont: Type 1 to RISC OS outline font converter | |

**Original BASIC utilities**, running unmodified through the BASIC Wimp bridge (see `docs/apps/TierA.md`):
!Calibrate and !ShowScrap (`Diversions.Tools`), !SaveCMOS, !ResetBoot, !Verify and !HForm (`Utilities`), !PrintEdit
(`Printing`) and !Warning (`Video`). The CMOS RAM, the IDE hard disc and the joystick they use are emulated.

**BBC BASIC demos** in `$.Demos.BASIC` (double-click to run; Shift-double-click to read the listing in !Edit):
Mandelbrot, Plasma, Fire, Stars, AsmBars and AsmPlot (inline ARM assembler), Cube, Sprites, Lissajous, Roses, Spiral,
Circles, Colours, Tree, Life, Hanoi, Snake, Ball, Voices, Canon and Tune (the sound system), Teletext (MODE 7), Sieve,
Guess, Errors, and WimpClock, a small Wimp task. The listings are in `src/basic/demos/`.

The disc also includes !System, !Scrap and !Fonts (`!Boot.Resources`), the Examples directory (a BASIC Wimp demo),
a sample Type 1 font to convert with !T1ToFont (`Utilities.Type1Fonts`), the user guide in HTML, tutorials, images,
Maestro tunes, and the original BASIC programs and !Boot files. Fonts converted by !T1ToFont (any outline font in
the `Font$Path` directories) appear in the font menus of !Chars, !Configure, !Draw and !Edit.

### !Lander

!Lander is David Braben's 1987 Archimedes demo, © D. J. Braben. It runs in one of two modes:

* **The JavaScript port** (the default): a line-by-line reconstruction after Mark Moxon's documented disassembly.
  With the same mouse input it draws the same frames as the original, at the speed of an 8 MHz ARM2.
* **The original program** on an emulated ARM2 (the ARM emulator from the BASIC interpreter), when you supply it.
  The binary is never part of this repository or its disc image. Drag it from the host computer onto the running
  game, or copy it onto the RISC OS disc and drag it from a Filer window onto the !Lander icon, or
  `*Run <Lander$Dir> <file>`; it is then kept in the browser (IndexedDB) for later runs. When developing locally you can instead clone
  [markmoxon/lander-source-code-acorn-archimedes](https://github.com/markmoxon/lander-source-code-acorn-archimedes) into
  `vendor/lander` (git-ignored); `serve.mjs` then offers its `4-reference-binaries/!RunImage.bin` to pages loaded from
  localhost. `*Run <Lander$Dir> -port` (or `?lander=port`) always plays the port.

Mouse: position steers, Select = full thrust, Menu = hover, Adjust = fire. Escape ends the game. See `docs/apps/Lander.md`.

## Architecture

```
index.html             loads src/main.js
src/main.js            boot: services, !Boot, application registry, hot keys
src/core/              the operating system
  wimp.js window.js icons.js menu.js input.js     window manager, icons, menus, pointer / keyboard
  iconbar.js filer.js fileraction.js pinboard.js switcher.js devices.js
  vfs.js               filing system: ADFS / RAM / Resources discs, seed disc + IndexedDB overlay
  hostfs/             HostFS: host folders as discs (File System Access API, serve.mjs --host, read-only snapshots)
  cli.js commands.js sysvars.js   OSCLI, * commands, system variables and GSTrans
  app.js               application registry: descriptors, lazy load(), Filer_Boot, file types, * commands
  sprites.js templates.js messages.js fonts.js dialogs.js   resources and standard dialogues
  fontreg.js fontbuild.js riscosfont.js   font registry: built-in fonts + outline fonts on Font$Path, converted at run time
  basichost.js basicwimp/   full-screen BASIC, and BASIC programs as Wimp tasks (SWI bridge)
  jsrun.js             *JSRun: JavaScript programs on the disc (JSScript files), as scripts or modules
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
node --test tests/sound tests/basic   # no browser
node --test tests/core            # and tests/draw tests/edit tests/paint tests/acc tests/div tests/tw tests/bw tests/tierb
node --test tests/integration     # cross-application flows + a long random ("monkey") test
node --test tests/jstutor         # *JSRun and the JavaScript tutorial's example programs
node --test tests/jsapps          # the second tutorial's applications (!Contacts, !Organiser and their stages)
node --test tests/browse          # !Browse and its engine (needs a Chrome; local pages only)
node tests/integration/flows.mjs dnd print   # one group: dnd print help chars tw configure pinboard shutdown reset basic
node tests/integration/monkey.mjs 5000 1 2 3 # steps, seeds
```

The browser tests need Playwright's Chromium (`npx -y playwright@1.61 install chromium`). They find Playwright in
`node_modules`, the npx cache or `PLAYWRIGHT_MODULE`, and they start `serve.mjs` if nothing is listening on port
8371. Screenshots go to a temporary directory. Set `KEEP_SHOTS=1` to write them to `tests/screens/`.

## Known limitations

* Not an emulator: the OS and applications are reimplemented in JavaScript. ARM machine code runs only inside BASIC
  (CALL/USR and assembler) and for !Lander's original program; relocatable modules, absolutes (`,ff8`) and utilities
  can't run and are left off the disc (as empty placeholders).
* One screen mode (the browser window size, or a fixed mode from !Configure scaled to fit); 16M colours internally.
  `*WimpPalette` / palette changes are ignored.
* Printing uses the browser: !Printers renders the document to a page sized for the configured paper and opens the
  browser's print dialogue. Printer drivers and printer definition files are emulated, not run.
* Sound: WaveSynth / Percussion voices, Maestro and the sample players are approximated with WebAudio.
* Networking (other than !Browse's pages, which come from the host's own browser engine), CD-ROM, NFS/Econet, podules
  and the hardware-specific parts of !Configure are not provided.
* Outline fonts are the original RISC OS fonts converted to OpenType and drawn by the browser: close, but not
  pixel-identical to the RISC OS font manager (no kerning). Fonts found on the disc (e.g. made by !T1ToFont) are
  converted the same way when first used.
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
* !Hopper is from RISC OS Open's `Apps/Diversions/Hopper` (© 1994 Simon Foster, BSD 3-clause licence) and
  !Madness from RISC OS Open's `Apps/Diversions/Madness` (© 2016 Castle Technology, Apache License 2.0), at
  [gitlab.riscosopen.org](https://gitlab.riscosopen.org/RiscOS/Sources/Apps/Diversions); their licences are in
  `tools/classics/`. !Calc is reconstructed from the RISC OS 2 Applications 2 disc.
* !Lander © D. J. Braben 1987. The JavaScript port follows Mark Moxon's fully documented source code at
  [lander.bbcelite.com](https://lander.bbcelite.com) /
  [github.com/markmoxon/lander-source-code-acorn-archimedes](https://github.com/markmoxon/lander-source-code-acorn-archimedes).
  The original program is not included.
* The sample Type 1 font is Computer Modern Roman 10 from the AMS Type 1 fonts, © 1997, 2009 American Mathematical
  Society, under the SIL Open Font License 1.1 (`tools/type1/`). opentype.js (© Frederik De Bleser, MIT licence) is
  bundled in `assets/lib/opentype/` to build web fonts.
* The programming fonts in `assets/fonts/nerd/` are [Nerd Fonts](https://www.nerdfonts.com) v3.5.1 (MIT licence,
  © Ryan L McIntyre; icon sets under their own free licences) patched from JetBrains Mono (© JetBrains, SIL Open
  Font License 1.1), Hack (© Source Foundry, MIT / Bitstream Vera licence) and Fira Code (© The Fira Code
  Project Authors, SIL Open Font License 1.1); their licences are beside them (`tools/nerdfonts.mjs`).
* This is a non-commercial preservation and educational project and is not affiliated with Acorn, RISC OS Open Ltd or
  RISC OS Developments.
