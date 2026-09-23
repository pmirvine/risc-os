# !Flasher

`src/apps/Flasher/` — port of `Sources/Diversions/Flasher/bas/!RunImage` (Minerva Software, 1.06).

* Makes the caret flash (off 20 cs / on 45 cs, by hiding `wimp.caretEl` — the Wimp's "invisible caret" bit).
* Icon bar `!flasher`: SELECT/ADJUST = Find caret (beeps if none): the caret's window gets an Open_Window_Request
  (to the front, scrolled to centre the caret if Scroll is ticked), then the pointer glides to the caret in
  32-OS-unit steps. Browsers can't move the pointer, so a `ptr_default` sprite is animated along the path instead.
* MENU: Flasher ▸ Info (FlasherFrm `ProgInfo`, version filled in), Flash ✓, Scroll ✓, Find (shaded with no caret), Quit.
  Interactive help H00/H01.
* `!Flasher.!Help` is itself an application: the "Minerva Software Text Reader" (`helper.js`, descriptor
  `helpapp.js`, task "Helper"): reads `HelpText`, 17 lines/page, `*>` index entries, page arrows (ADJUST reverses),
  its own binary `Templates` parsed at run time. Print reports "Cannot gain access to printer".
* Test: `tests/div/flasher.mjs` → `tests/screens/div-flasher.png`.
