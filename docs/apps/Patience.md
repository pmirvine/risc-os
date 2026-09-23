# !Patience

Code: `src/apps/Patience/` (`main.js`, `vdutext.js` = VDU 5 system-font text + OS-unit drawing helpers, shared with !Puzzle).
App dir: `ADFS::HardDisc4.$.Diversions.!Patience` (seed disc). Port of the original BASIC `!RunImage` (v0.67).

* Layout, rules and messages exactly as the original: 7 piles A–G (pile A gets 6 face-down + 1 face-up … G gets 1),
  4 suit stacks (empty stack shows the blank suit card), pack + waste, "Games: n  Won: m" line; card sprites from
  `assets/sprites/Patience/Sprites22` (`club`/`halfclub`…, backs `back0-3`/`half0-3`), rank printed in the system font
  (red/black), green (`Wimp colour 10`) work area, 800×1024 OS extent, 800×640 visible, opened centred.
* Mouse: Select on the pack deals `numberover` (3) cards (reversed if *Rev. Cards*), recycling when exhausted; Select on a
  pile/waste starts a Wimp drag box (60×80 OS, confined to the window) — drop on a pile (finds the deepest face-up card
  that fits: alternate colour, one lower; empty pile takes kings only unless *Only Kings* is off) or on the suit-stack
  area; Adjust on a pile/waste sends its top card to its suit stack. Invalid moves beep (VDU 7).
* Window menu "Patience": Deal Hand (counts the previous game as won if the pack is empty and all cards are face up),
  Resign (turns everything face up, then the pack steps one card at a time), New Pack (cycles the card back design),
  Only Kings ✓, Rev. Cards ✓. Icon bar menu: Save Choices (writes `!Config`: back, kingsonly, dealreverse, numberover —
  read at start-up), Quit. No Info entry (as the original). Window is opened by clicking the icon bar icon.
* Messages are read from the disc `Messages` file by line index, like the original (falls back to built-in English).
* Test: `tests/div/patience*.mjs` (screens `tests/screens/div-patience*.png`).
