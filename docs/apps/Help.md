# !Help (owner: EDIT agent)

RISC OS 3.71 !Help 2.29 (a BASIC program, `Sources/Apps/Help/bas/!RunImage`), reimplemented in
`src/apps/Help/`: `app.js` (descriptor), `main.js` (the app), `desktop.js` (help for core components).
Resources: `assets/templates/Help.json` (`interactive`, `info`), `assets/messages/Help.json`.

* Icon bar icon `!help`; Select/Adjust opens the "Interactive help" window (template position, just above the
  icon bar); Menu: Help ▸ Info ▸ (info box, version from `HelpID`), Quit. Closing the window stops helping.
  `Help$Options` `~I` starts with the window closed (default `I`).
* Every 10cs while helpful it looks at the pointer (`os.input.mouseX/Y`):
  1. window furniture → its own `HelpI*` texts (back, close, title, toggle, scroll arrows/bars, size);
  2. otherwise the core interactive-help hook `wimp.helpAt(x, y)` (menu item `help`, window `helprequest`,
     `icon.help`, icon bar `help`, `win.helpText`) = Message_HelpRequest;
  3. fall-backs from the original Messages of components that don't answer yet (`desktop.js`): icon bar devices
     (ADFSFiler `F??FF`/`H??FF`, RAMFSFiler `F`, ResFiler `HFF`, Display `HB00`), Filer menus (`MH<kind><path><G|?>`),
     Filer copy/info/access boxes, Task Manager window + menu (`H`, `H?0n`, `HT03`, `HT13`), Pinboard menu (`PHn`),
     Display Manager menu/windows, else for icon bar icons "This is the <task> icon." (`HelpH3`).
* The reply is GSTrans'd (`|M` = new line) and `\X` expands to message `TX` (`\S` "Click SELECT to ",
  `\R` "Move the pointer right to ", `\T` "This is the ", `\w` "window", `\s`, `\a`, `\A`, `\D`, `\d`, `\G`, `\W`),
  then word-wrapped into up to 32 line icons, 20px apart; the window height follows the line count (≥ 4 lines).

To give help from an app: set `help` on menu items / icon bar icons, or handle the window `helprequest`
event (`ev.text = '\\Sdo something.|MMore.'`, using the same markup as the original Messages files).

Known gaps: help for Wimp error boxes and generic core Save boxes (none in the original either, unless the
app answers); the Filer menu help follows the Filer's token scheme approximately.

Tests: `node tests/core/shot.mjs help-full tests/edit/act-helpfull.mjs` starts !Help from `Resources:$.Apps` by
double-click and checks the text over icon bar icons, a Filer window and its menu, Edit's menu and Paint's tool
pane, sprite window and sprite menu (screenshots `tests/screens/help-*.png`); `act-help.mjs` / `act-help2.mjs` too.
