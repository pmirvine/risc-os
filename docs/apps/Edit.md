# !Edit (owner: EDIT agent)

RISC OS 3.71 Edit 1.54 (ROM app, `Resources:$.Apps.!Edit`), a port of `Sources/Apps/Edit/c/edit` and
RISC_OSLib's `txtedit`, `txtar`, `txtmisc`, `txtfind`/`txtregexp`, `txtoptmenu`, `txtfile` and `dbox`.
Resources: `assets/messages/Edit.json` (all menu texts, help, errors), `assets/templates/Edit.json`
(find, found, goto, indent, fileInfo, progInfo, dboxfile_db, close, quit), system font `assets/fonts/system8x8.json`.

## Files (`src/apps/Edit/`)

| file | contents |
|---|---|
| `app.js` | descriptor: claims type &FFF (`Alias$@RunType_FFF`), sets `TaskWindow$Server` like Edit's `!Boot` |
| `main.js` | icon bar icon + menu (Info, Create ▸ Text/BASIC/Obey/Command/typed, BASIC options ▸, Quit), DataOpen/DataLoad/RAM import, PreQuit/Quit |
| `editor.js` | `EditApp` (texts, Edit$Options, BASIC settings, queries, font menu) and `TextState` (one text: menus, files, dialogues, close) |
| `view.js` | `EditView`: one window on a document: layout/rendering (system font 8×16 or outline fonts), caret, selection, mouse, keys |
| `document.js` | `EditDocument`: the text (Latin-1 char codes), undo/redo, word/line helpers, task-window `output()` |
| `misc.js` | txtmisc ports: wordwrap/Format text, Expand tabs, CR↔LF, indent region, goto line |
| `find.js` / `findbox.js` | pattern compiler (plain, "magic characters", "wildcarded expressions") / the Find & Found boxes |
| `dbox.js` | RISC_OSLib dbox conventions (F-keys, Return, Escape, letter hot keys, Adjust = persist) |
| `basic.js` | detokenise (strip line numbers unless GOTO-style references; bas2 query) / retokenise via `src/basic/tokens.js` |
| `api.js` | public API for other apps (TaskWindow) |

## Behaviour implemented

* Windows from the `text` template geometry, staggered 24px down (5 positions). Title
  `name [*] [n] [ColTab] [Overwrite] [Wordwrap]`. Default display: system font, black on white, margin 2,
  wrapping at screen width; all Display options persist in `Edit$Options` (`f b l m h w r a O T D u n`).
* Mouse: Select click = caret, Select drag = selection, double/triple click = word/line, Adjust click/drag
  extends, Ctrl-Select selects one char. One desktop-wide selection (`scrap`), so Copy/Move work between windows.
* Keys (txtedit_obeyeventcode): cursor keys; Shift ←/→ word, Ctrl ←/→ line ends, Ctrl ↑/↓ / Home file ends,
  Shift ↑/↓ (PageUp/Down) page, Shift-Ctrl ↑/↓ scroll; Delete/Backspace, Copy(End) delete right, Shift-Copy word,
  Ctrl-Copy line; Insert inserts a space; Tab = word tab (to next word start in the line above) or column tab;
  ^C copy, ^V move, ^X delete, ^Z clear selection; F2 new file, Shift-F2 insert file, F3 save, Shift-F3 column tab,
  F4 find, Ctrl-F4 indent, F5 goto, Ctrl-F5 wordwrap, F6 select char/extend, Shift-F6 clear, Ctrl-F6 format,
  F7 copy, Shift-F7 move, Ctrl-F7 exchange caret/selection, F8 undo, F9 redo, Ctrl-F8 CR↔LF, Shift-F1 overwrite,
  Shift-Ctrl-F1 expand tabs, Ctrl-F2 close, Ctrl-F10 to back, Print = print. Other control codes are inserted
  and shown as `[xx]`. Undo is per key press (major edits), as in Edit.
* Menu tree from Messages `txt10..txt18`, `txt62..txt63`: Misc ▸ (Info, File info, Set type, New view, Print, Column
  tab, Overwrite, Wordwrap), Save ▸ (click = save to the current name), Select ▸ (Save, Print, Copy, Move, Delete,
  Clear, Indent), Edit ▸ (Find, Goto, Undo, Redo, CR<->LF, Expand tabs, Format text ▸ width), Display ▸ (Font list
  incl. System font, Font size, Font height, Line spacing, Margin, Invert, Window wrap, Foreground, Background,
  Work area). Shading/ticks as `txtedit__menusetflags`/`txtoptmenu__setflags`. Menu help = `HELPnn`/`HELPXnn`.
* Find: plain, magic characters (`\. \a \d \xXX \n \cX \\ \*`, replace `\&`) and wildcarded expressions
  (`. $ @ # |X \x [set] ~x *x ^x %x -` and &84 hex; replace `& ?n $ |X`), case sensitivity, Count, Previous,
  wildcard buttons, the box growing when a pattern mode is on; Found box: Stop, Continue, Replace, Last Replace,
  End of file replace, Undo, reDo (dbox keys S C R L E U D, F1-F8, Return, Escape).
* Files: load/save any type byte for byte (Text, Obey, Data, Command …); BASIC detokenised on load (strip line numbers
  option; bas1/bas2 questions) and retokenised on save (line increment option, bas3-5/basA warnings, bas9 limit).
  Double-click text → Edit; Shift-double-click any file → Edit; drop on icon bar = open; drop into a window =
  insert at caret (Shift = insert the path); Save box drag to a Filer (or app) window, or type a full path;
  RAM transfer both ways; "save into itself" refused (txt1), selection dragged into its own text = copy.
  Set type, file info box, close query (Save/Discard/Cancel, Adjust-close opens the parent), quit query,
  PreQuit (restarts shutdown with Ctrl-Shift-F12 after Discard).

## API for task windows (and other clients) — `src/apps/Edit/api.js`

```js
import { getEdit } from '../Edit/api.js';
const edit = await getEdit();                        // starts !Edit if needed (task windows belong to Edit)
const s = edit.install({ title: 'Task window', noQuitCheck: true, readOnly: false, text: '', options: {} });
const v = s.views[0];  v.open();  v.setCaret(s.doc.length, { take: true });
s.doc.output(bytesOrString, { ignoreCtl: true });   // append at end: BS/DEL delete back, ctl chars dropped (message.c)
s.keyFilter = (view, ev) => bool;                   // every key (ev.code = Wimp key code) before Edit sees it
s.menuHook = (view, ev) => bool;                    // Menu click: open your own menu (e.g. the Task menu) and return true;
                                                    //   s.menu(view) returns Edit's own window menu for an "Edit ▸" submenu
s.closeHook = async (view, ev) => bool;             // intercept close requests (return true = handled)
s.titleOverride = 'Task window' | ((view) => string);
s.splitWindow(); s.dispose(); s.onDispose = () => {};
s.doc.on('change', ({pos, delLen, insLen}) => …);   // document events; s.doc.readOnly blocks typing
```
`EditView` extras: `caret`, `setCaret(i, {take})`, `select(a, b)`, `options` + `applyOptions()`, `win` (the Wimp
window), `typeText(s)`. `scrap` (`{doc, start, end}`) is the global selection (TaskInput sends it to the task).
Keys the filter doesn't consume get normal Edit behaviour, so "Unlink" = stop filtering.

## Known gaps

* Printing: Print sends a `PrintSave` message; with nothing to claim it Edit reports txt64 (no !Printers protocol yet).
* The outline-font display uses the browser's text metrics (no kerning), font size width≠height is a horizontal scale.
* No DataSaved (safe-after-RAM-transfer) tracking; untyped (load/exec) files are saved as Data.
* "Move all windows" (Shift-Ctrl-←/→) only scrolls the current window.
