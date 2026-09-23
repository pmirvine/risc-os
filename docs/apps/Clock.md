# !Clock

`src/apps/Clock/` — port of `Sources/Diversions/Clock/bas/!RunImage` (Merlyn Kline / Acorn, 0.23).

* No icon bar icon: each run opens a "Clock" window (flags &BF000003: back, close, title, toggle, v-scroll, size;
  400×400 OS units, extent 1280×980) centred on the pointer just below it. Closing the window quits. Never scrolls.
* Drawn exactly as the BASIC: minute dots (POINT, colour 7, when R>150), hour marks (RECTANGLE FILL, colour 8,
  when R>50), face circle, hour/minute hands as PLOT 117 parallelograms and a second hand line in GCOL 3 (EOR),
  red centre boss. Rasterised into an 8 bpp framebuffer with the default 256-colour palette so EOR overlaps look
  as on a 256-colour 3.71 desktop. Radius follows the window size; updates once a second.
* Interactive help: Messages `Help`. Multi-instance.
* Test: `tests/div/clock.mjs` → `tests/screens/div-clock.png`.
