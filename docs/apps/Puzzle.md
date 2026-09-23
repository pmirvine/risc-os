# !Puzzle

Code: `src/apps/Puzzle/main.js` (uses `../Patience/vdutext.js`). App dir: `ADFS::HardDisc4.$.Diversions.!Puzzle`.
Port of the original BASIC `!RunImage` (v0.53): the fifteen-tile sliding puzzle.

* No icon bar icon; each run pops up a new window (multi-instance) centred on the pointer, 64 OS units below it
  (kept on screen). Window flags as the original (title bar, moveable → back/close/title), grey (Wimp 3) work area.
* Drawing follows the source: grey background, black frame, tiles = white-filled 56 OS squares with a black outline and
  the number in the system font; the blank is Wimp grey 4.
* Select/Adjust on a tile in the blank's row or column slides the whole run towards the blank; otherwise beep.
  Menu "Puzzle" ▸ "New board" re-randomises by moving the blank 10×16 times (Don Bennett's algorithm, always solvable).
  Closing the window quits. Interactive help texts from the `Messages` file (`Help`, `HelpNew`).
* Test: `tests/div/puzzle.mjs` (screens `tests/screens/div-puzzle*.png`).
