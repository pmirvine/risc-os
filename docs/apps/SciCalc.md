# !SciCalc (ACCESSORIES agent)

`src/apps/SciCalc/` — native port of the tokenised BASIC `HardDisc4.Apps.!SciCalc.!RunImage` (source
`Sources/Apps/SciCalc/bas/!RunImage`, v0.55). Disc app: `appDir ADFS::HardDisc4.$.Apps.!SciCalc`; the disc `!Run`
runs `!RunImage`, which the core intercepts and starts this task.

* `calc.js` — host-agnostic engine, a line-by-line port: entry buffer, operator stack with precedence, one level of
  brackets, memory (MC/Min/MR), Dec/Bin/Oct/Hex bases (Base cycles; hex digits A-F icons 64-69 appear, trig icons
  hide/grey via PROChide_icon/PROCgrey_icon semantics), Rad/Deg/Grad (Mode), HYP, x! factorial via the Lanczos gamma
  (same coefficients), BASIC64 number formatting (`@%="+G10"`, via `src/basic/numfmt.js`) and error texts from Messages.
* `main.js` — real "Calculator"/"Info" templates and the app's own `Sprites` (button faces); display painted by the task
  in the system font, right-justified in 36 characters; title "SciCalc (Dec)   (Deg)" from the `title` token.
  Icon bar icon (Select opens the calculator and takes the input focus); keyboard entry as in the original; interactive help.

Tests: `tests/acc/act-scicalc.mjs` (KEYS env), `act-scicalc2.mjs` (Base -> Hex); screenshots `acc-scicalc1/2.png`.
