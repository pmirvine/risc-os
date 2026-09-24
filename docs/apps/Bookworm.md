# !Bookworm

Code: `src/apps/Bookworm/` — `app.js` descriptor, `main.js` (task, icon bar, browser windows, dialogues),
`html.js` (HTMLLib emulation: HTML → flat token list), `layout.js` (port of `Reformat.c` / `Redraw.c`),
`url.js` (file: URLs ↔ RISC OS paths). App dir `ADFS::HardDisc4.$.Manuals.!Bookworm`; the User Guide is in
`ADFS::HardDisc4.$.Manuals.Manual` (`ROManual:`, set at start like `!Run`). Source:
`vendor/ro371/Sources/Apps/BookWorm` (Merlyn Kline's Browser 1.00 (12-Feb-97), single-user build).

* **Icon bar** `!app` sprite. SELECT/ADJUST open a new browser window on the Params `HomePage`
  (`file://ROManual:BOOKB/USERGUIDE`); windows are centred, 640×660 px, each further one 16 px lower.
  MENU: Info (template `info`, version 1.00 (12-Feb-97)), Choices... (template `Choices`: bars, delay, backgrounds,
  body/heading/fixed typefaces with font menus; Set / Cancel / Save → writes `Params` / Default), Quit.
  HTML / text files dropped on the icon open a new window. `filetypes {0xFAF}`: double-clicking an HTML file runs
  Bookworm with it (or DataOpen when running).
* **Window**: template `viewer` plus panes `URLbar` (URL field; Return goes there; `gright` = history list),
  `buttonbar` (home, back, reload, stop, forward, add to hotlist, hotlist, resources, load images, export — greyed
  per `Button.c`) and `InfoBar` (status text: "Fetching…", "Fetching n images...", "Ready" or the link under the
  pointer; spinning globe `a1…a69` over `abase` while fetching; byte count "nnnn"/"nnK"). Menu (Messages
  `mBrowse1`…): File (Save F3 = HTML source, Export ▸ Plain text), Navigate (Open URL, Home, Back, Forward,
  Reload, Stop), Hotlist (Go to page, Add this page, Remove page, Save), Utilities (Find text F4, URL bar /
  Toolbar / Status bar toggles, Display backgrounds). Interactive help from the `Hw…`/`Hm…`/`Hd…` messages.
* **Rendering** on a hi-DPI canvas, geometry in OS units as the original: body `serif`, headings/ADDRESS `sans`,
  PRE/TT `fixed` typefaces from `Params` (Trinity/Homerton/Corpus; note the shipped Params map *italic* to the
  Medium fonts, so `<I>` shows upright), 205/16 pt base size, H1 ×2 bold, H2 ×1.5 bold, H3 ×4/3 italic, H4 bold,
  H5 italic, H6 ×2/3; line heights from the font bounding boxes + 4 OS leading, paragraph/heading gaps, margins
  from `redraw_margin`, bullet sprites `b0-b5`, rules as two 2-pixel lines, centring, text split at spaces per
  token (`fm_get_string_width`); reformatted when the window width changes (16 px steps). Page colour #dddddd
  unless `BODY BGCOLOR`; links #004499 underlined 5 OS units below the baseline, followed links #00bbff
  (global history `User.History`, same binary format), a clicked link flashes red; linked images get a
  2-pixel frame in the link colour. GIFs are decoded from the VFS (`createImageBitmap`), shown at their
  WIDTH/HEIGHT; unreadable ones show the `missing` sprite. Pointer `ptr_link` over links; ADJUST on a
  link opens it in a new window. Scroll arrows/keys: 16 px lines, page = height − bars − (status: 36 px, sic).
* **Links** resolve in URL space; names are matched case-insensitively and, like FileCore, truncated to 10
  characters (the manual links `BOOK3_2.HTM` to the file `BOOK3_2/HT`). `#name` scrolls the anchor to just
  below the bars. Hotlist = `User.HotList` (HTML, saved back on change), list dialogues use template `hotlist`
  (double-click; ADJUST keeps it open).

Deviations: no network (non-`file:` URLs give the `FALON` error), no Draw-file/picture/link export, printing
or resources list (greyed); images are never delayed; FONT/TABLE/forms are ignored as by the 3.7 renderer
(forms code not ported); fonts come from the converted outlines with canvas text rendering, so widths differ
slightly from the Font Manager; history persistence is written on Quit/PreQuit.

Tests: `node tests/div/bookworm-links.mjs` (parses all 87 pages, resolves 4307 links + 1162 images: 17 are
broken in the original data, e.g. `C_10.HTM`); screenshots `tests/div/bookworm.mjs` with
`BW=home|toc|chapter|index|app|link|back|adjust|menu ITEM=n|ibmenu|info|hot|find|choices|open`,
`bookworm-keys.mjs` (run an HTML file, keys, F3, Quit), `bookworm-resize.mjs` → `tests/screens/div-bookworm-*.png`.
`tests/div/monkey-div.mjs <App> [steps] [seed]` (random input with a sample file open, reports page errors) and `tests/div/filetypes-route.mjs` (double-clicks one file of each seed-disc type in Images/Sound/Tutorials/Manuals/Diversions and prints the task it opened) cover this app too.

Verified 2026-09: all screens OK; HTML files (&FAF) in `Manuals` open here by double-click. GIFs (&695) have no
run action in 3.71 (Filer "application not found" error), as in the original.
