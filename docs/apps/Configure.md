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
* **Stored only** (persisted in `os.config.values`, shown again): disc counts & spindown (with the real "reset"
  warning), printer port / ignore char, mouse speed & type, keyboard delay/repeat/caps, memory sizes, voice, 16-bit,
  monitor, blank delay, font cache sizes, ROM app auto-start, lock password (hashed; locking shades the main icons).
* Display manager (core, `src/core/devices.js`) already uses the real `Display` template; left unchanged.

Tests: `tests/acc/act-configure.mjs` (CHILD=HardDiscs|Mouse|Screen|Sound|Fonts|WimpFlags|Lock|Keyboard|Memory|Floppies|System),
`act-configure-func.mjs` (texture T7 + Set, desktop font Trinity); screenshots `tests/screens/acc-configure-*.png`.
