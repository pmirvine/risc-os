# !Calc

Code: `src/apps/Calc/` (`app.js` descriptor, `main.js`, `Templates.json`, `Help.txt`). App dir:
`ADFS::HardDisc4.$.Apps.!Calc`, written by `tools/disc-classics.mjs` (`!Boot`, `!Help`, `!Run`, `!Sprites`,
`!Sprites22`; `!RunImage` is a placeholder that starts the JavaScript app). Task name "Calculator".

The four-function desk calculator of Arthur 1.2, RISC OS 2 and RISC OS 3.0/3.1 (in the 3.1 ROM; RISC OS 3.5
replaced it with !SciCalc). RISC OS 3.71 has no copy, so this puts it back on the hard disc.

## Sources

* The RISC OS 2 Applications 2 disc (`!Calc` 0.40, 03-Nov-88: BASIC `!RunImage`, `Template`, `!Sprites`, `!Run`),
  from the 4corn archive of Acorn OS discs ([archiology/osdiscs](https://www.4corn.co.uk/aview.php?sPath=/archiology/osdiscs),
  `riscos2/App2.zip`). The `!RunImage` was detokenised and read line by line.
* The RISC OS 3 Applications Guide, chapter 6 "Calculator" (keyboard use: numeric keypad, Enter = equals,
  Delete = Clear; errors cleared with C).
* The `!calc` / `sm!calc` sprites of the RISC OS 3 ROM (still in the 3.71 Wimp sprite pool).

## What is original and what is recreated

* **Original, carried over exactly:** the window template (size, the 17 key icons, their positions, colours
  and button types, from `Template`), the arithmetic (`PROCdigit`, `PROCpoint`, `PROCoperator`, `PROCdisplay`:
  immediate execution, so 2 + 3 x 4 = 20; 8 digits; results through `STR$` with `@%=&01020711` and `EVAL`, BASIC
  5-byte reals; 100000000 or more, or a division by zero, shows "Error" and only C works until cleared), the
  display (`PROCcalc`: a white box at (12,-28)-(172,-60) with the number PRINTed right-aligned in the system font
  with VDU 5, so on this square-pixel desktop the characters are 8 x 8 pixels at the top of the box), the icon
  bar menu (Info, Quit), closing the window keeps the icon, reopening puts it back where it was, the first opening
  at the pointer, the sprites (pixel for pixel), the task name and the 32K Wimpslot.
* **From the RISC OS 3 guide, not in the RISC OS 2 source:** keyboard input (digits, `.`, `+ - * x /`, Enter /
  Return = "=", Delete / Backspace / C = Clear) after clicking in the window. The 3.1 ROM version's own source was
  not found.
* **Recreated:** the `!Help` text (the original had none), `!Boot`, and the Info box, which is the standard
  3.71 "About this program" box with the original's name, purpose, author and version.

Test: `tests/div/classic-calc.mjs` (screens `tests/screens/classic-calc*.png`).
