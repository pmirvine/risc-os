# !Madness

Code: `src/apps/Madness/` (`app.js`, `main.js`). App dir: `ADFS::HardDisc4.$.Diversions.!Madness`, written by
`tools/disc-classics.mjs` from `tools/classics/Madness`.

The RISC OS 2/3 desktop toy that "moves all of the windows on the screen except its own".

## Sources

* RISC OS Open's `Apps/Diversions/Madness` 0.48 (07 Apr 2016, Apache 2.0, "Copyright 2016 Castle Technology"):
  <https://gitlab.riscosopen.org/RiscOS/Sources/Apps/Diversions/Madness> - `!RunImage` (BBC BASIC), `!Help`,
  `!Run`, `Messages`, `!Sprites`, `!Sprites22`, `LICENSE`, `VersionNum`, all in `tools/classics/Madness`.
* The RISC OS 2 Applications 2 disc copy (0.41, 1988; [4corn osdiscs](https://www.4corn.co.uk/aview.php?sPath=/archiology/osdiscs))
  for comparison: the same algorithm.

## What is original and what is recreated

* **Original:** every file in the application directory. `!RunImage` is the real BASIC program, tokenised by
  the disc script, so it can be listed or run in BASIC. `!Help`, `!Run`, `Messages`, the sprites, `LICENSE`.
* **Recreated in JavaScript (`main.js`), following `!RunImage` line by line:** "Window Madness" task; one
  title-only window ("Madness", back and close icons) opened at the back at (0,100) OS units, usually under the
  icon bar; Open_Window_Request for it ignored; its close icon quits; every 20 cs (`Wimp_PollIdle`,
  `madspeed%=20`) one window is moved, walking up the stack from its own window and starting again at the top;
  per-window velocities `X%(handle AND 255)`, `Y%()` of 4*RND(3) OS units, reversed near the screen edges
  (x1 > width-64, x0 < 10, y1 > height-64, y0 < 100); the move is sent to the owner as an Open_Window_Request so
  the stacking order is kept. The icon bar, backdrop and panes are left alone (Wimp 2.95 stopped the icon bar
  moving, and panes follow their parents here).

Test: `tests/div/classic-madness.mjs` (screens `tests/screens/classic-madness*.png`).
