# !Lander

Code: `src/apps/Lander/` (`app.js` descriptor, `main.js` full-screen runner, `host.js` the emulated machine and
the original-binary host, `game.js` the JavaScript port, `store.js` where the binary comes from).
App dir: `ADFS::HardDisc4.$.Diversions.!Lander`, written by `node tools/disc-lander.mjs` (run by `tools/build.mjs`).

Lander is © D. J. Braben 1987. **The original program is never in this repository or on the seed disc**
(`!RunImage` is an empty placeholder; the icon is drawn by the disc tool). Two ways to play:

* **The original** on the emulated ARM2 (`src/basic/arm.js`) when the user has it. `store.js` looks, in order,
  at a file given to the app (`*Run <Lander$Dir> <file>`, or a host file dropped onto the running game; it is
  then kept in IndexedDB `riscos-lander`), the IndexedDB copy, and a local git-ignored checkout of
  [markmoxon/lander-source-code-acorn-archimedes](https://github.com/markmoxon/lander-source-code-acorn-archimedes)
  in `vendor/lander` served by the dev server (`4-reference-binaries/!RunImage.bin`, or the Arthur
  `GameCode.bin`, entered at &A614). The checkout is only looked for when the page comes from this machine
  (localhost), through the dev server's `__dev/lander.json` (serve.mjs lists the binaries that exist), so a public
  static deployment makes no requests for it and a missing checkout logs no 404s. The binary can also be
  dragged from a RISC OS Filer window onto the !Lander icon (the descriptor's `appIconDrop`: the app is started
  with the file, or a running game gets Message_DataLoad and restarts with it). The OS is BBC BASIC's machine (`src/basic/machine.js`): MODE 13 with two
  banks in 160K ending at &2000000 (`*ScreenSize 160`, `linearScreen` VDU so ARM stores hit the frame buffer
  directly), OS_Byte 4/112/113/126/129/19, OS_Word 21, OS_Mouse, OS_ReadC, OS_WriteS, OS_BinaryToDecimal.
  Time is emulated: the CPU counts 8MHz ARM2 cycles and OS_Byte 19 moves the clock to the next 50Hz vsync, so
  the game runs at A310 speed (~16 frames/s on the pad) and deterministically. The emulator itself runs at
  ~90 MIPS (about 30x an ARM2). `-speed n` scales the clock.
* **The port** (`game.js`), after Mark Moxon's documented reconstruction: every routine keeps its name and
  32-bit arithmetic, the workspace layout and the screen memory layout, and the lookup tables equal the
  original's. With the same mouse input it draws identical frames (checked frame by frame, 2 x 1500 frames of
  play with crashes and game over, in `tests/basic/lander.test.mjs`). It counts its work per frame and
  `host.js portFrameCycles` (a least-squares fit to the original's cycle counts, R² 0.98) makes it take as
  many vsyncs per frame as the original. `-port` (or `?lander=port`) forces it.

Controls as the original: mouse position steers, Select full thrust, Menu hover, Adjust fire (browser left,
middle, right); a click captures the pointer (pointer lock). Escape ends the game (MODE 0, back to the
desktop). Lander has no sound calls, so neither mode makes any sound.

Test hooks: `task.lander` = `{mode: 'original'|'port', machine, vdu, runner}`; `runner.pauseAt = n` holds at
the vsync of frame n. Tests: `tests/basic/arm.test.mjs` (emulator and host SWIs, hand-assembled code),
`tests/basic/lander.test.mjs`, `tests/div/lander-port.mjs`, `tests/div/lander-original.mjs`, `tests/div/lander-drop.mjs` (skipped
without vendor/lander; screens `tests/screens/lander-*.png`).
