# RISC OS 3.71 in the browser — master spec

Goal: a **faithful** recreation of the RISC OS 3.71 desktop (Acorn RiscPC / A7000 era, 1996-98),
running entirely in a browser, re-using the original resources (sprites, templates, messages, help
text, sample files) extracted from the original source tree wherever possible.

## Ground rules for every agent

* **Tech**: plain modern JavaScript ES modules, no bundler, no framework, no npm runtime deps.
  Everything loads from `index.html` via `<script type="module">`. Serve with `node serve.mjs`
  (port 8371). Node-side tooling (`tools/`) may use npm dev deps if really needed (put them in
  `package.json` devDependencies), but the shipped site must not.
* **Original source tree**: `vendor/ro371/` (exported from github.com/barryc-ro/RiscOS_371; read-only,
  git-ignored). RISC OS filetypes are encoded as `,xxx` suffixes (`,ff9` Sprite, `,fec` Template,
  `,ffb` BASIC, `,aff` Drawfile, `,fff` Text, `,feb` Obey, `,ff8` Absolute, `,ffa` Module).
  Key places:
  * `vendor/ro371/Sources/OS_Core/Desktop/` — Wimp, Filer, Pinboard, Switcher (Task Manager), TaskWindow, ShellCLI…
  * `vendor/ro371/Sources/OS_Core/Desktop/Wimp/Resources/UK/Tools,ff9` — window furniture sprites
  * `vendor/ro371/Sources/OS_Core/Internat/Messages/UK/` — Messages / Templates / Sprites for ROM modules & apps
  * `vendor/ro371/Sources/Apps/*`, `Sources/Diversions/*`, `Sources/Utilities/*`, `Sources/SystemRes/*` — app sources & resources
  * `vendor/ro371/Sources/Programmer/BASIC/` — BBC BASIC V source (ARM asm): keyword tables, error messages, semantics reference
  * `vendor/ro371/Install/HardDisc4/` — the shipped hard disc image (apps, !Boot, demos, images, sounds, tutorials)
* Where original data exists, **use it** (converted to web formats by tools in `tools/`) rather than re-drawing.
* Don't edit files owned by another agent's area unless your brief says so; if you need a change in
  core, make it minimal, backwards compatible, and note it in `docs/CHANGES_NEEDED.md` or the relevant doc.
* Browser testing: Playwright + Chromium are installed in `~/Library/Caches/ms-playwright`. Use
  `npx -y playwright@1.61` (matches the installed Chromium; or a devDependency) with a script in `tests/` to load the page, click around and
  screenshot (save screenshots in `tests/screens/`), and LOOK at the screenshots to check fidelity.
* Keep docs short and current: each area owns a doc in `docs/`.

## Layout

```
index.html            boots src/main.js
serve.mjs             static server
src/main.js           boot sequence
src/core/             the Wimp & desktop (window manager, menus, icon bar, pinboard, filer, vfs, …)
src/basic/            BBC BASIC V interpreter + VDU driver (standalone, host-agnostic)
src/apps/<Name>/      one directory per application (e.g. src/apps/Draw/)
assets/sprites/       converted sprites (PNG) + manifest JSON per sprite file
assets/templates/     converted Wimp Templates (JSON)
assets/messages/      Messages files (JSON or text)
assets/fonts/         system font + outline font substitutes
assets/disc/          seed files for the virtual hard disc (samples, demos, images, BASIC programs)
tools/                node converters (sprites, templates, fonts, disc image)
tests/                node unit tests + playwright scripts
docs/                 SPEC.md (this), ASSETS.md, CORE_API.md, BASIC.md, per-app notes
```

## Look & feel targets (RISC OS 3.71 defaults)

* Screen: like MODE 28/31-ish, square pixels, 1 screen pixel = 2 OS units. The desktop fills the browser
  window (render at CSS pixel scale 1 by default; user-selectable 2x zoom in Configure).
* Wimp 16-colour palette (colours 0-15): the standard RISC OS desktop palette.
* Window furniture from `Tools` sprites (3D look of 3.5+): back, close, title bar (cream `#ffffcc`-ish
  when input focus, grey otherwise), toggle-size, scroll bars with arrows, adjust-size. No iconise button in 3.71.
* Three mouse buttons: Select (left), Menu (middle — map to middle click AND right click AND ctrl-click),
  Adjust (right — map to shift+left click or right-click if the user chooses; default: right click = Menu,
  since most users lack a middle button; make it configurable). Menus open at the pointer, with
  submenus opening on hover over the arrow, dialog boxes as submenus (e.g. Save as).
* Icon bar along the bottom: devices on the left (floppy :0, hard disc :4 "HardDisc4", RAM disc, Apps),
  applications on the right (Palette, Task manager "Acorn" logo … ), font = Homerton Medium substitute.
* Pinboard backdrop, pinned icons, F12 command line, Ctrl+F12 task window, Alt-Break style escape.
* Drag & drop between windows (files from Filer into apps, Save-as drags to Filer windows).

## Wave plan

1. Assets pipeline (tools/ + assets/), BBC BASIC V interpreter (src/basic/), Wimp core (src/core/).
2. Applications in src/apps/: Edit, Draw, Paint, Alarm, Chars, Help, Configure, TaskWindow, SciCalc,
   Maestro, Squash, CloseUp, ChangeFSI, PhotoView, Diversions (Patience, MineHunt, Meteors, Blocks,
   Puzzle, Clock, MemNow, Flasher), plus a Wimp SWI bridge so original tokenised BASIC apps can run.
3. Integration / QA / fidelity pass.
