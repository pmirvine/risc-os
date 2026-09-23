# !SlideShow

Code: `src/apps/SlideShow/` (`app.js` descriptor, `main.js`). App dir: `ADFS::HardDisc4.$.Images.!SlideShow`
(the seed disc's `!Run`, `!RunImage`, `Messages`, `Data.*` are used as data; the program itself is JS).

Port of `!SlideShow` 1.10 (`vendor/ro371/Sources/Demos/SlideShow/bas/!RunImage`, BBC BASIC), following its
800x600 16bpp path (the one a RiscPC with enough memory takes; the 8bpp/ChangeFSI + `Shell` library path is not used):

* No Wimp window, icon or menu: starting it "changes mode" straight away (`os.cli.acquireScreen`, black,
  pointer hidden) to an 800x600 canvas scaled to fit the screen. Sets `SlideShow$Path`, `Images$Dir`, `JPEG$File` as `!Run`.
* Shows `<Images$Dir>.00-49.sa00` … `50-99.sa99` in order, forever (key*, Team are not shown - as the original).
  Pictures (768x512 JPEG) are decoded with `createImageBitmap`, reduced to 5 bits per gun (16bpp) and centred
  in an off-screen copy of the screen (`picblk%`), which is then copied to the screen by an effect, one step per
  VSync (60 Hz, catching up when late like the original's `?vc%` loop).
* Effects and their `CASE RND(limit%)` weights exactly as the original: wipes (down/up/left/right, 16 px),
  slats (24-line / 32-px), and order-table effects on 50x50 squares: Acorn logo, 4 diagonals, circle, shrinking
  square (computed like `FNdiag*`/`FNcirctable`/`FNshrinktable`) and `Data.Acorn/Random/RotSquare` (byte 0 = last
  frame, then 50x50 frame numbers). Tables are "compiled" one per picture after each of the first 9, so the
  first slides only use wipes/slats; `Data.Slide` is never used (the original stops at `comp%<9` too).
* Escape quits (ERR 17 → `*Desktop`): screen released, task quits. Other keys and the mouse do nothing.
  A missing picture/data file gives "Couldn't find <Images$Dir>.00-49.saNN(3540)" (Messages E05) and quits.
* Deviations: the pause between pictures is a fixed 3 s (`DECODE_MS`, the original's was simply the CFSIjpeg
  decode time); no dithering to 16bpp; JPEGs that fail to decode report E03 "Couldn't read file".
* Test hook: `task.slideshow.state` `{file, index, effect, phase, step, steps, limit, comp, shown, hold}` (`hold`
  writable). Tests: `tests/div/slideshow.mjs` (start, mid-transition, slide, Escape), `slideshow2.mjs` (each table
  effect); screens `tests/screens/div-slideshow*.png`.
