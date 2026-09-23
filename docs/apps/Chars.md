# !Chars (ACCESSORIES agent)

`src/apps/Chars/` — JS port of `Sources/Apps/Chars/bas/!RunImage` (ROM app, `Resources:$.Apps.!Chars`).

* Window "Characters" from `assets/templates/Chars.json`; 32 x 8 grid, geometry as the BASIC (24 x 44 OS
  pitch, 16 OS margins). System font = the real 8x8 kernel font (`assets/fonts/system8x8.json`) at 16x32 OS;
  control codes 0-31 and 127 shown inverted ('@'+n / '?'), exactly like the original's VDU 23 trick.
* SELECT (auto-repeat, work-area button type 2) or pressing **Shift** while the pointer is over a character
  enters it with `wimp.processKey(code)` (= Wimp_ProcessKey, added to core — see CHANGES_NEEDED.md), so it
  goes to whatever has the caret; Chars never takes the input focus.
* MENU = Font Manager font menu ("Font List": System Font + families/styles from `assets/fonts/fonts.json`);
  outline fonts drawn 13 x 15 pt, codes 32-255 centred in each cell, Latin-1 0x80-0x9F mapped via `latin1ToUnicode`.
* Interactive help from Messages (`Help` token with decimal/hex code). Close icon quits (no icon bar icon).

Tests: `tests/acc/act-chars.mjs` (types "RISC OS©" into a writable icon by clicking; screenshots `acc-chars*.png`).
