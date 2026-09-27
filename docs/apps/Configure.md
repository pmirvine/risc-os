# !Configure (ACCESSORIES agent)

`src/apps/Configure/` — the RISC OS 3.71 Configure application (`Sources/SystemRes/Configure`), ROM app
`Resources:$.Apps.!Configure`; the disc copy `!Boot.Resources.!Configure` is routed to it (alias registered in `boot()`).
Windows are the real templates (`assets/templates/Configure.json`; Printer/Apps come from `Configure.Templat2D.json`,
upgraded to 3D borders) with the app's own sprites (`assets/sprites/Configure/Sprites22`) and Messages (interactive
help tokens `<plugin><icon>[S][D]`).

* **Main window** "Configuration": Discs, Floppies, Network (shaded), Screen, Mouse, Keyboard, Memory, Sound,
  System, Fonts, Windows, Lock. Children cascade from it; ADJUST opens a child and closes the main window, ADJUST
  on a child's close icon reopens it. MENU: Info, Save (config file &FF2 = JSON of the settings), Quit. Dropping a
  saved file restores it.
* **Wired to the desktop** (`os.config`, see docs/CHANGES_NEEDED.md): Mouse drag delay / drag start distance /
  double-click delay / cancel distance; Windows: instant dragging bits, off-screen bits, error beep, textured
  backgrounds (`textured`), interactive file copying (Filer option); Sound volume / loud-quiet beep (beep gain);
  Screen: resolution (`wimp.setMode`, monitor mode lists generated from the real `Configure.Monitors` files into
  `monitors.json`), colours (grey modes), background texture None/1-7/Random + Lighter (`*Backdrop -tile
  BootResources:Configure.Textures.Tn[L]`), Try / Default / Cancel / Set; Fonts: desktop font (System font or any
  outline font, e.g. Trinity.Medium → `wimpFont`).
  Memory: **RAM size** (this desktop's addition, not in 3.71): a row below RAM disc (icons 36-39, added to a copy of
  the `Memory` template: label, an `R2` display field and pop-up menu button as in the Screen window, "MBytes"; the
  window is 64 OS units taller) with a menu of 4MB (A7000) … 256MB → `os.memory.setRAMSize(mb)` (config `ramSize`,
  applied at once; the Task Manager follows). The other memory sizes (screen, system heap, module area, font cache,
  system sprites, RAM disc) are the CMOS start-up sizes: `src/core/memory.js` uses them when the desktop starts
  (RAM disc 0 = no RAM disc); `DEF` shows what it starts with (screen 0, RAM disc 1024K).
  Floppies: the count (`floppies`, also `*Configure Floppies`) is read by `src/core/devices.js` at the next
  start; 0 leaves the floppy icon off the icon bar (there is only ever one floppy, `ADFS::0`, so 1-4 show one).
* **Stored only** (persisted in `os.config.values`, shown again): hard disc counts & spindown (with the real "reset"
  warning), printer port / ignore char, mouse speed & type, keyboard delay/repeat/caps, font cache limit, voice, 16-bit,
  monitor, blank delay, font cache sizes, ROM app auto-start, lock password (hashed; locking shades the main icons).
* Display manager (core, `src/core/devices.js`) already uses the real `Display` template; left unchanged.

Tests: `tests/acc/act-configure.mjs` (CHILD=HardDiscs|Mouse|Screen|Sound|Fonts|WimpFlags|Lock|Keyboard|Memory|Floppies|System),
`act-configure-func.mjs` (texture T7 + Set, desktop font Trinity); screenshots `tests/screens/acc-configure-*.png`.
RAM size: `tests/core/test-taskmanager.mjs` (pop-up menu → 64MB, the Task Manager follows).
