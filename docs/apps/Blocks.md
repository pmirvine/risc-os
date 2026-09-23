# !Blocks

`src/apps/Blocks/` — port of `Sources/Diversions/Blocks/bas/!RunImage` (BASIC). Disc app `$.Diversions.!Blocks`.

* Icon bar icon `-blocks` (game's own `Sprites`). SELECT opens the game window (template `main`) and starts a
  game (or brings it to the front); MENU (icon bar or window): New game, New keys ▸ (template `keys`), Auto, Quit.
* Rules as the source: 11×31 board of 28-OS-unit tiles (`tile1`–`tile7`), 4×4 bit-mask pieces (7 shapes; 1/200 random
  junk, 1/30 random 3×3 blob), start X=4 Y=26, random initial rotation, drop interval `30*EXP(-score/500)` cs,
  drop key = interval/3 + fall every null event, score = pieces landed, high score for the session, full rows removed,
  pauses while the window lacks the input focus. Default keys 2 turn, Space drop, 1 left, 3 right.
* "Auto" = the original's position evaluator (PROCsuss_piece/sussmove/sussrot/suss_grommets).
* Score/high-score text drawn in the system font (`assets/fonts/system8x8.json`) with `@%=5` padding, as VDU 5 text.
* Deviation: keys are ignored after game over (the original would EOR a piece that was never placed).
* Needs the core change "writable icons pass on disallowed characters" (`docs/CHANGES_NEEDED.md`) for the keys dialogue.
* Test: `tests/div/blocks.mjs`, `tests/div/blocks-keys.mjs` → `tests/screens/div-blocks*.png`.
