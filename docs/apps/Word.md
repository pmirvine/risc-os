# !Word and WimpLib

Code: `tools/moreapps/` — `!Word/` (the application, JSScript modules with no extension) and `!WimpLib/` (the
library of shared plain modules), put on the disc as `ADFS::HardDisc4.$.MoreApps.!Word` by
`node tools/disc-moreapps.mjs` and as the system library `ADFS::HardDisc4.$.!Boot.Resources.!WimpLib` by
`node tools/disc-wimplib.mjs` (both run by `tools/build.mjs`, after `disc.mjs`: the library first). User guide:
`$.Docs.Word` (`tools/docs/Word`); the app's own `!Help` is `tools/moreapps/!Word/!Help`, the library's
`tools/moreapps/!WimpLib/!Help`. Not part of RISC OS 3.71.

The early steps of a word processor for Microsoft Word files. Today `!Word` opens a `.docx` in a window (formatted
paragraphs in a page-width column, grey boxes for what it does not show), lets you select, **format** (deliverable 4:
Word's keys, a Format menu, a toolbar, a ruler with indent markers and zoom, below) and **type, delete and undo**
(deliverable 2: typing through the core's opt-in text-input caret, Enter, Shift-Enter, Tab, Backspace, Delete, the word
forms, Insert overwrite, Ctrl-Z/Ctrl-Y, IME composition, a `*` in the title while unsaved) and **saves** (deliverable
6a: *Save* writes the document back to its file and clears the star, *Save as* saves it under a new name that the
window takes, *Save a copy* writes a copy and changes nothing; an untitled document (a click on the icon bar icon,
*New*) offers a full path in its Save box; *Revert* reloads the file; closing a window with unsaved changes asks
Save / Discard / Cancel; Quit / PreQuit ask once, Discard / Cancel; *Recent* files in `Choices:Word`). What is built to last is underneath: a document model with
operations and undo, a reader and a writer for `.docx` that keep everything they do not understand, and `WimpLib`.
Copy, cut and paste are in (deliverable 6b, `EditClip`), and Find / Replace (`Find`, `EditFind`, `Ui/FindBox`). Batch A added the everyday Insert and paragraph features
(spacing, new lists, page and section breaks, tab stops, borders and shading, symbols, change case, hyperlinks,
bookmarks, a format painter and a word count). Not there yet: layout and pagination (breaks are only marks), margins,
making styles and list definitions of your own, printing, tables and images, headers/footers/footnotes, RTF/PDF export
and spell check.

**Fidelity:** content round-trip (text, formatting, every other part) is checked on 600+ real documents (below).
Page layout and pagination are not implemented and, when they are, will only approximate Word. Real Microsoft Word
could not be run during development; the written files follow the schema's element order and are validated with
`xmllint` against the ECMA-376 schema, but "Word opens it without a repair prompt" is only checked by hand
(the hand-off check, below).

## Layout of the source

```
tools/moreapps/
  !WimpLib/       the library: shared, pure modules (import 'wimplib/<Name>')
                  and its !Boot, !Run, !Help
  !Word/          the application
    Fonts/        20 TrueType files (no extension) + Licences
  icon.mjs        the sprites of both (iconFiles, libIconFiles)
  package.json    the package 'wimplib', so Node resolves 'wimplib/<Name>'
  .cache/         git-ignored: font archives, the wml.xsd schema files
tools/disc-wimplib.mjs    builds $.!Boot.Resources.!WimpLib, --check
tools/disc-moreapps.mjs   builds $.MoreApps.!Word, boot lines, --check
tools/moreapps-fonts.mjs  fetches the fonts (pinned, SHA-256 checked)
tools/moreapps-corpus.mjs fetches the sample corpus (optional)
tools/moreapps-xsdorder.mjs  prints the schema's child orders (Order's tables)
tests/moreapps/   everything below under Testing
```

All files on the disc are Latin-1 text, no tabs, **at most 72 columns**, extensionless, and import each other with
exact-name relative specifiers (`'./Ops'`), which Node 22.7+ also resolves natively (so the unit tests import the
disc files as they are). The pure modules never import `'riscos'`; only `!RunImage`, `AppWin`, `DocSave`, `CopySave`, `Replace`, `CloseDoc`, `Quit`, `RecentFiles`, `WordChoices`, `IconBar`, `EditView`, `EditMouse`, `EditInput`, `EditMenu`, `EditClip`, `EditFind`, `FindView`, `DocKeys`, `FormatMenu`, `ParaMenu`, `ParaBox`, `TabsBox`, `BorderBox`, `SymbolBind`, `LinkBox`, `BookmarkBox`, `PaintBind`, `CountBox`, `WinMenu`, `ZoomBind` and `ToolbarBind` (and WimpLib's `Ui/*`) do (`RulerBind` is desktop-bound through `Ui/Ruler`, `WinPanes` through `ToolbarBind` and `RulerBind`, and `AutoFormatOpt` through `WordChoices`, but none of them imports anything from `'riscos'` itself) (`EditPaint` is handed its canvas) (`Info`'s
`infoWindow` is handed the task, so `Info` stays pure).

## WimpLib

Plain JavaScript, no desktop services, runs the same in the browser and in Node.

### A system library: where it lives and how it is found

WimpLib is a library application among the system resources, `$.!Boot.Resources.!WimpLib` (disc encoding
`HardDisc4/=21Boot/Resources/=21WimpLib`), like `!System` or `!Scrap`; it is not part of `$.MoreApps`. It holds:

| file | type | what |
|---|---|---|
| `!Boot` | Obey &FEB | `IconSprites <Obey$Dir>.!Sprites`; `If "<WimpLib$Dir>" = "" Then Set WimpLib$Dir <Obey$Dir>`; `If "<WimpLib$Path>" = "" Then Set WimpLib$Path <WimpLib$Dir>.`; `Set WimpLib$Version 1.00` |
| `!Run` | Obey &FEB | a double-click: `Obey <Obey$Dir>.!Boot`, then `Filer_Run <Obey$Dir>.!Help` (it is a library, not a program; like `!System`'s `!Run` it makes the library known again) |
| `!Help` | Text &FFF | for users: what it is, the variables, how programs refer to it, overriding, the module list |
| `!Sprites` | Sprite &FF9 | `!wimplib` 34 x 34 and `sm!wimplib` 18 x 18 (books on a shelf), drawn by `icon.mjs` `libIconFiles()` |
| the modules | JSScript &F81 | the table below |

**Variables.** `WimpLib$Dir` is the library's directory (`ADFS::HardDisc4.$.!Boot.Resources.!WimpLib`);
`WimpLib$Path` is a RISC OS path list (directories ending in `.` or `:`, commas between), normally
`<WimpLib$Dir>.`; `WimpLib$Version` is `1.00`. `!Boot` sets the first two **only if they are not set**, as
`!System`'s `!Boot` does with `System$Dir`. This desktop runs no user boot file before `!Boot.Resources` is booted
(`src/main.js` runs `Filer_Boot` on it first; PreDesktop/Desktop files are not executed), so a user sets them
**after** start-up with `*Set`. `Set WimpLib$Path` stores the value expanded, so changing `WimpLib$Dir` afterwards
has no effect unless `WimpLib$Path` is set again.

**Start-up.** `src/main.js` runs `Repeat Filer_Boot <BootResources$Dir> -Applications -Tasks`, which boots every
application in `!Boot.Resources` (the Filer runs each `!Boot` in safe mode: `Set`, `If` and `IconSprites` run,
`Run` and `/` do not), and only then the `$.MoreApps` line. So the variables are set from a cold boot, before any
MoreApps application boots and without a Filer window being opened (`tests/moreapps/boot.mjs` checks both, with a
probe application in `$.MoreApps` whose `!Boot` records `<WimpLib$Dir>`). No `main.js` code is specific to the library.

**Resolution of `'wimplib/<Name>'`** (`resolveLib` in `src/core/jsrun.js`; `docs/CORE_API.md` 11a):

1. The specifier must be `wimplib/` (any case) followed by segments matching `/^[A-Za-z0-9_][A-Za-z0-9_-]*$/`,
   `/` between them (the rule below); `Dir/Name` becomes `Dir.Name`.
2. Each directory of `WimpLib$Path` is tried in order, with `Name` then `Name/js` (a directory of that name is not
   a module); the first file found wins. Prefixes are used as written, so `<Var>` and other path variables
   (`Boot:`) in them work as in any `<Name>$Path`.
3. Then `WimpLib$Dir`, unless it is already one of the path's directories (so with `WimpLib$Path` unset,
   `WimpLib$Dir` alone is used).
4. Not found: `Can't find 'wimplib/Nope' (not in WimpLib$Path: RAM::RamDisc0.$.MyLib,
   ADFS::HardDisc4.$.!Boot.Resources.!WimpLib)` (each directory by its full name; `...; nor in WimpLib$Dir: ...`
   when that was searched too). Neither variable set: `Can't find 'wimplib/Zip' (WimpLib is not installed:
   WimpLib$Dir is not set)`.

Every application, `!Word` included, imports the library by that one specifier (`import {readZip} from
'wimplib/Zip'`), never by a relative path to the library's directory. Relative imports (`'./Ops'`) are unaffected.
Obey files, BASIC and the command line name the files `<WimpLib$Dir>.Zip` (or `WimpLib:Zip`, through the path).

**Override.** To try a changed module, put it in a directory of your own and put that first in the path, e.g.
`Set WimpLib$Path RAM::RamDisc0.$.MyLib.,<WimpLib$Dir>.`: programs started afterwards find `MyLib.Hello` first and
everything else in the system library. Set it after start-up (see above). Copy a module **with the files it
imports**: `Zip` and `Xml` re-export through relative imports, so a lone copy of `Zip` fails with `Can't find
'./ZipError'`; and library-internal imports are relative, so overriding an inner module (`ZipRead`) does not affect
the other library modules, only programs that import it by `wimplib/` name. An entry with no final `.`/`:` that is a
directory is searched as that directory (`MyLib` = `MyLib.`); a `WimpLib$Dir` with a final `.` is accepted.
Unsetting `WimpLib$Path` and setting `WimpLib$Dir` replaces the whole library.
`tests/moreapps/jsrun-wimplib.mjs` checks these, the error texts and the specifier rules.

**In Node** (the unit tests) there are no system variables: `tools/moreapps/package.json` names the package
`wimplib` with `"exports": {"./*": "./!WimpLib/*"}` (and `"type": "module"`, as `tools/package.json`), so a module
**under `tools/moreapps/`** that imports `'wimplib/Zip'` gets `tools/moreapps/!WimpLib/Zip` through Node's package
self-reference (the extensionless file and the `!` in the directory name resolve as they are). The disc sources keep
one specifier for both. On the disc the prefix matches in any case; Node's package self-reference accepts only
lowercase `wimplib/` and has no `Name/js` fallback. Tests under `tests/` are outside the package and import the library by relative path
(`'../../tools/moreapps/!WimpLib/Zip'`); `harness.test.mjs` checks the self-reference resolves to the same URL.

| module | what | API |
|---|---|---|
| `Zip` | re-exports the three below | `readZip`, `writeZip`, `ZipError` |
| `ZipRead` | zip reader: central directory trusted, stored/deflate only, limits checked from declared sizes before inflating | `await readZip(bytes, {maxTotal = 256 MB, maxRatio = 1000}) -> Map<name, Uint8Array>` (directory order, folders left out) |
| `ZipWrite` | zip writer: each entry stored or deflated, whichever is smaller; UTF-8 names | `await writeZip(parts: Map \| [[name, bytes]], {date}) -> Uint8Array` (same input and date, same bytes) |
| `ZipError` | error class | `err.code`: `truncated bad-crc zip64 encrypted too-big bad-method not-zip` |
| `ZipNames` | which entry names are safe (plain relative path; no `..`, drive letter, control character) | `checkName(name)` |
| `Crc32` | CRC-32 | `crc32(bytes, seed = 0) -> number` |
| `Xml` | re-exports | everything below |
| `XmlParse` | parser: one pass, no regexes, no recursion, **no DTD** (`XmlError` `dtd`), no custom entities, depth <= 256 | `parseXml(text) -> {decl, before, root, after}` (`before`/`after`: `{comment}` / `{pi}` outside the root), `MAX_DEPTH` |
| `XmlWrite` | serializer and builders | `serialize(node, {decl, before, after}) -> string`, `el(name, attrs, ...children)`, `text(node)`, `find(node, name)`, `findAll(node, name)`, `attr(node, name)` |
| `XmlText` | character helpers | `XmlError` (`code` `malformed dtd depth entity`, `line`), `esc`, `escAttr`, plus helpers for the parser |
| `Segment` | grapheme and word boundaries in UTF-16 text (`Intl.Segmenter`, injectable); per-text cache of 64 entries, none for texts over 4096 units | `graphemes(text) -> frozen sorted boundaries 0..length`, `nextBoundary/prevBoundary(text, off)`, `wordBounds(text, off) -> {from, to}` (at a boundary the word on the right wins), `nextWord`, `prevWord` |
| `FontList` | font names for menus and fields (pure) | `WORD_FONTS`; `cleanFont(name)` (trimmed, spaces collapsed, no controls, at most 31 characters, `null` for none); `fontList(docFonts, desktop) -> {doc, word, desktop}` (in that order, each name once ignoring case); `allFonts(list)`; `findFont(list, name)` (ignoring case and spacing, or `null`) |
| `NumberField` | what a number field holds (pure) | `parseNumber(text, {min, max, step, unit})` (a plain decimal, optional unit such as `pt`; no sign or exponent; rounded to `step`, clamped; else `null`); `formatNumber(n, decimals)`; `halfPoints(text)` (points to the nearest half, clamped 1..400 pt, as half-points); `formatPoints(pt)` (`''` for mixed) |
| `ColourList` | the colour popup's colours (pure) | `SWATCHES` (40 `RRGGBB`, `COLS` 8 x `ROWS` 5: greys, Word's ten standard colours and lights, darks, theme accents), `swatchAt(col, row)`, `parseHex(text)` (`rrggbb`, `#rrggbb`, `rgb`), `cssOf(value)` (`'auto'` is black) |
| `Ui/Toolbar` | a pane toolbar (desktop) | `new Toolbar({task, parent, height, buttons, menu, dy = 0})` (`dy`: px from the parent's visible top, passed to `attachPane`: a second row): buttons `{name, kind: action\|toggle\|radio\|popup\|field, sprite, text, help, group, w, gap, validation, maxLen, swatch}` laid left to right (26 px buttons, 22 px popup arrows `gright`), the pane attached with `fitWidth` (buttons past the window's width are cut off); `on(name, fn)` (`{name, kind: 'click'\|'return'\|'escape', button, text}`), `setPressed` (a radio lets the rest of its group out), `pressed`, `setText`, `text`, `shade`, `setSwatch(name, css)` (a bar under the sprite, drawn on the pane's hiDPI canvas), `popupAt(name)` (screen point under the icon), `editing` (the field with the caret), `pane`, `width`, `destroy()` (safe twice; deleting the parent deletes the pane too). Setting a value to what it is changes nothing |
| `Ui/ColourPopup` | a swatch dialogue (desktop) | `colourPopup({task, at, current, allowAuto, onPick, title})` -> the Window: with `at` opened by `wimp.menus.open(win, x, y, {task})` (a click outside closes it), without it a submenu; swatch click, Automatic (`'auto'`) or the hex field + Return pick (menus closed first, then `onPick`); Escape closes; deleted when closed |
| `Ui/SaveQuery` | the Save / Discard / Cancel box (desktop) | `saveQuery({task, title, message, buttons = ['Save', 'Discard', 'Cancel'], enter})` -> Promise of the pressed button's text (`enter`: the button Return gives, with the default border; default the first): a `task.createWindow` box (least code: no template, so the icons can be named `button:<Text>` and `message`; laid out from the button count, the message cut off past the screen's width), centred, with the caret; buttons left to right: the middle ones, the last, the first (at the right, `R6,3` default border; the others `R5,3`); Return = the `enter` button (the first by default), Escape / the close icon = last; one box per task: a question asked while one is open waits (a per-task promise chain) and opens when the one before is answered, each getting its own answer; `promise.win` is its box while open (null while waiting); deleted when it answers, answers the last button if its task deletes it or is gone before a waiting box opens. No `parent` option (the plan's API listed one; omitted: the box is not tied to a window). The core's `query()` has two buttons at most, hence this (no core change). Tested through !Word: `word-close.mjs` |
| `Ui/FindBox` | a Find and Replace box (desktop) | `findBox(task, {title, onAction, onClose, onKey})` -> the task's one box (a `WeakMap` task -> box; asked again, the same box with the given handlers replacing its own; a new one after it was deleted, e.g. with its task): a `task.createWindow` box (no template: icons named `find`, `replace`, `matchCase`, `whole` (option icons `Soptoff,opton`, radio ESG 0), `message`, `button:Find next` (default, `R6,3`) / `Find previous` / `Replace` / `Replace all` / `Close`); `onAction('next' \| 'prev' \| 'replace' \| 'all')` from the buttons and Return; Escape, Close and the close icon hide it (`win.close()`, the fields kept) then `onClose()`; other keys go to `onKey(ev)` (true if used). API: `open({text, replace, x, y, focus = true})` (to the front; `focus: false` leaves the caret where it is; `text` put in Find; the caret in Find, or in Replace with `replace` when Find has text; first opening centred, later where it was), `close()`, `find`, `replace` (get/set; writable icons of `MAXLEN` 1000 characters: longer text is cut by the icon), `matchCase`, `whole` (get/set), `message` (the status line), `isOpen`, `win`, `delete()`. Ctrl-V in a field sets `ev.allowDefault` (as the core's TextArea and !Browse do), so the browser's paste reaches the core's writable-icon paste (its first line, character by character); Ctrl-C / Ctrl-X do nothing (writable icons have no selection: `docs/CHANGES_NEEDED.md`). It only asks: the program finds. Tested through !Word: `word-find.mjs` |
| `CharSets` | named sets of characters for a symbol picker (pure, A5.3) | `SETS` (frozen `{id, name, chars}` in the popup's order: `latin1` Latin-1 (U+00A1..U+00FF without the no-break space and soft hyphen), `latinA` Latin Extended-A, `greek`, `cyrillic`, `punct` Punctuation (dashes, quotes, daggers, bullet, ellipsis, per mille, guillemets), `currency`, `letterlike` Letterlike and fractions, `arrows`, `maths`, `shapes` Geometric shapes), written as ranges of code points `[first, last]` so the file is plain ASCII. **Rule (relaxed in the A5.3 review):** every character is in Carlito, Liberation Sans AND Liberation Serif, all four styles (12 files; `charsets.test.mjs` reads their `cmap` tables with opentype.js). Caladea (Cambria's substitute) and Liberation Mono are NOT asked: Caladea has no Greek, Cyrillic or most geometric shapes (the test pins that), and a glyph missing in the page's font is drawn from another font by the browser, as Word falls back too. No duplicate within a set (a character may be in two sets). `setById(id)` (a `Map`, so `__proto__` is null), `setOf(ch, id?)` (the set holding the one-unit string ch, `id`'s first; null for anything else), `codeLabel(ch)` (`U+00E9`), `statusText(ch, id?)` (`U+00E9  Latin-1`, the grid's status line) |
| `Ui/CharGrid`, `Ui/CharGridPaint` | a window of characters to pick from (desktop; `CharGridPaint` pure drawing, A5.3) | `charGrid({task, title, sets = SETS, font, onInsert, onClose})` -> the task's one grid (a `WeakMap` task -> grid; asked again, the same grid with the given handlers replacing its own, `title` re-set; a new one after it was deleted). A `task.createWindow` of 554 x 440 (`CharGridPaint` W x H): icons `label`, `set` (the set field, `R2`, border, white) and `arrow` (`gright`), both open a `Menu` of the sets (ticked) at the field's lower left, `recentlabel`, `status` (`U+00E9  Latin-1`, or the caller's `message`), `button:Insert` (default `R6,3`, shaded while nothing is chosen) and `button:Close` (`R5,3`); the characters are NOT icons: the window's hiDPI canvas draws the Recently used row (`RECENT` 16 cells, session only, kept for the TASK in a `WeakMap`, so a grid made again keeps it) at `RY` and the set as `COLS` 16 columns by `ROWS` 8 shown rows of 32 x 30 px cells at `GY` (`CharGridPaint.paint`: white cell, grey outline, the chosen one white on `#2a4f9a`), 19 px text in `font` (default `"Carlito", "Liberation Sans", sans-serif`: a bundled family, because the desktop font Homerton lacks most symbols (`listmenu-glyphs.test.mjs`) and a canvas draws a whole set at once; repainted when `document.fonts.ready` resolves); a set of more than 8 rows has a scroll bar drawn at the right (thumb only, no Wimp scroll flags: the controls must not scroll away), moved by the wheel (`wheel` event, one row), a click above / below the middle of the bar (7 rows), Page Up / Down (8 rows) and by choosing a character that is not shown. Work button `clickdragdouble`: a click in the work area (not on an icon) takes the caret (`wimp.setCaret(win)`, for the keys) and chooses the character under it (`select`), a double-click chooses and inserts; keys while it has the caret: arrows (one character / one row), Home / End (`CharGridPaint.target(code, i, n, key)`: Shift-Up has Page Up's code, so the browser's key name decides), Page Up / Down, Return inserts, Escape hides; the close icon too (`onClose()` after). `insert()` calls `onInsert(ch)`: `false` says it could not be put in (not remembered); otherwise the character goes to the front of the recent row. API: `open({x, y, set})` (front, caret in the window, first time centred), `close()`, `delete()`, `isOpen`, `gone`, `win`, `set`, `pick(id)`, `selected`, `select(ch)`, `insert()`, `recent`, `top`, `scrollTo(row)`, `where(ch, inRecent)` (a cell's rectangle in work coordinates, null when not shown), `message(text)`. Tested through !Word: `word-symbols.mjs` (real clicks) and `chargridpaint.test.mjs` |
| `Units` | lengths and points in a field (pure) | everything in twips (1440 an inch, 20 a point); `parseLength(text, {min, max})` -> twips or `null`: inches as a plain decimal alone or with `"` / `in`, or points with `pt` (`'0.5"'`, `'0.5'`, `'36 pt'` = 720), a minus sign allowed, spaces only around the parts, any case; no `cm`, exponent, other characters or text over 32 characters; whole twips (never -0), clamped to min..max (bad limits ignored; default `-LIMIT..LIMIT`, `LIMIT` 31680 = 22 inches); `formatLength(twips)` (`'0.5"'`, 2 decimals, trailing zeros dropped; `''` for none); `parsePoints(text, {min, max})` (points, bare or `pt`; default 0..`LIMIT`) and `formatPoints(twips)` (`'12 pt'`). `tests/moreapps/units.test.mjs` |
| `DialogLayout` | where a dialog's icons go (pure) | `KINDS` (`label text length number option radio popup colour button`), `controls(rows)` (rows: arrays of controls or one control `{kind, name, label?, text?, after?, w?, group?, choices?}`; copies with `row` and `index`; a `TypeError` for an unknown kind, a missing / bad / repeated name (letters, digits, `_`, `-`, starting with a letter: `__proto__` and `button:...` refused; a `label` may have none), a radio without a group, a group named as a control, more than 31 groups, choices not an array), `layout(rows, {buttons, measure, minW, maxW})` -> `{w, h, extent, boxes}` (`w` the window's width, at most `maxW` (the desktop passes the screen's width - 40); `extent` the width of everything, the work area): boxes `{name, kind, part: label\|field\|arrow\|after\|button, row, ci, x, y, w, h, text, rjustify}`, a label column as wide as the longest first label (`measure`, default 9 px a character; the desktop passes `textWidth`), fields 36 px high (options / radios / labels 28), default widths (text 240, length / number 88, colour 48, option / radio 32 + text, popup the longest choice + 16 (min 80) then a 22 px `gright` arrow, button max(96, text + 24)), rows stacked 8 px apart, a heading (a first `label` with no label) at the left edge, the buttons (unique texts) right-aligned at the bottom of what shows (`w - PAD`; at `PAD` when the row is wider than `w`), `PAD` 16 round the edge; nothing overlaps. `tests/moreapps/dialoglayout.test.mjs` |
| `DialogIcons` | a dialog's icon specs (pure) | `iconSpecs(boxes, list, {enter, groups})` -> specs for `task.createWindow`: a control's field named by its name (a nameless label `text:<i>`), `label:<name>`, `arrow:<name>`, `after:<name>`, `button:<text>` (`enter` `R6,3`, others `R5,3`); writable `text` (`R7` + the client's own `A` command, `maxLen` <= 1000, default 256), `length` (`R7;A-0-9. "inptINPT`, 16), `number` (`R7;A0-9.` + the unit's letters, 16; `-` first when `min` < 0); options `Soptoff,opton` ESG 0, radios `Sradiooff,radioon` with their group's ESG (`esgOf(list)`: 1..31 in order); popup display `R2` click; colour `R5`; row buttons `R5,3`. Tested in `dialoglayout.test.mjs` |
| `DialogValues` | what a dialog's controls hold (pure, over icons it is handed) | `readField(c, text)` (empty -> `undefined`: a mixed value left as it is; not a value -> `null`; text without control characters; lengths through `Units` (`unit: 'pt'` points); numbers through `NumberField.parseNumber` with a leading minus sign read here, only when `min` < 0 (else `null`), then clamped), `showField(c, v)`, `choiceText(c, id)`, `WRITE`; `store({list, groups, icon, repaint})` -> `{get, set, values, invalid, touched, colour}` (option values kept so a mixed option reads `undefined` until clicked; radios by name (boolean) and by group (the chosen radio's `value` or name)). Tested in `dialoglayout.test.mjs` |
| `Ui/Dialog` | a dialog box built from rows of controls (desktop) | `dialog({task, key, title, rows, buttons = ['Cancel', 'OK'], enter, help, minW})` -> api, unopened: a `task.createWindow` box (no template) from `DialogLayout` / `DialogIcons` (`textWidth` measures), its width at most the screen's - 40 (`maxW`; the extent the whole box, the buttons kept at the right of what shows); controls may add `help`, `value` (an option's default is false), text `maxLen` / `validation`, length `unit: 'pt'` / `min` / `max`, number `min` / `max` / `step` / `unit` / `decimals`, popup `choices [{id, text}]`, colour `allowAuto`, radio `value`. Return presses `enter` (default the last button; shaded: nothing), Escape and the close icon `Cancel` if there is one, **even when it is shaded**, else the last (no buttons: the box is deleted): every box should have a Cancel; Tab / arrows are the core's `focusNext` (shaded fields skipped); Ctrl-V in a field sets `allowDefault` (as `Ui/FindBox`). A popup's arrow or display field opens a `Menu` at the arrow's right (the choice ticked); a colour button opens `Ui/ColourPopup` there; the swatch is drawn on a hiDPI canvas behind the (unfilled) icon. API: `get`, `set` (no change event), `values()`, `invalid()`, `shade(name, on)` (all of a control's icons, or a bottom button by its text; the caret leaves a field shaded under it), `choices(name, list)` (A4.3: a popup's choices replaced, its value kept and its text shown again; the Tabs box's list of stops), `focus(name)`, `on('button' \| 'change' \| 'close', fn)` (a bottom button deletes the box after its handlers unless one returned `false`; a row's `button` never closes it; `close` when it closes or goes), `open({x, y})` (to the front, caret in the first writable field or the window; first time centred), `close()` (hidden, kept), `delete()`, `win`, `isOpen`, `gone`. One box per `key` per task (a `WeakMap` task -> `Map`): asked again while it exists, the same api, brought to the front. **Keys are per task, not per window**: a box about one document must carry that document in its key (e.g. `'para:' + dw.docKey`) and its program must `delete()` it when the document closes (e.g. on the document window's `deleted`); boxes go with their task. Tested through !Word's hook `task.word.dialog(spec)`: `word-dialog.mjs` (every kind by icon name, Tab / Down / Up / Shift-Tab, typing, a real popup and swatch pick, option, exclusive radios, Return / Escape / close icon / Cancel, `false` keeps it, shading, mixed values, two keys, 30 open / close cycles: windows, icons, Wimp and task listeners, menus and DOM back to the start; `set` reports no change; `close()` then `open()` keeps the box and its place; Escape / the close icon with Cancel shaded; a box wider than the screen; a per-document key deleted with its document leaves nothing; the task quitting deletes its box) |
| `Ui/PaneWheel` | the wheel over a pane (pure) | `forwardWheel(pane, parent)`: the core's `_wheel` scrolls any window under the pointer, so a pane (toolbar `extent.w` 4000, ruler 8000) would slide its own contents; this claims the pane's `wheel` and emits it on the parent first (`ZoomBind`'s Ctrl+wheel takes it there), else scrolls the parent by the same amounts as the core (`requestOpen`, Shift: sideways); the pane's own scroll is put back to 0 on `moved`. `Ui/Toolbar` and `Ui/Ruler` call it. `tests/moreapps/panewheel.test.mjs`, and `word-zoom.mjs` over the real panes |
| `Ui/FontMenu` | a font menu (desktop) | `fontMenu({current, docFonts, onPick, desktop?})` -> Menu: document fonts, Word's, then a `Desktop fonts` submenu (`os.fontreg.families()`), the current one ticked ignoring case; `desktopFonts()` |
| `RulerMath` | a ruler's arithmetic (pure) | `toPx(twips, zoom)`, `toTwips(px, zoom)` (15 twips a px at zoom 1, 96 dpi), `zoomOf` (0.1..5, else 1), `snap(twips, free)` (`SNAP` 90 = 1/16 inch; free: whole twips), `clampTo` (NaN or an empty range: lo), `ticks(from, to)` (every 180 twips from the origin, each end clamped to 100 inches: `{at, size: 1\|2\|3, label}`, labels unsigned inches counted out from the origin both ways, as Word numbers them; the origin itself is `{at: 0, size: 3}` with no label and is not drawn), `indentMarks({left, first, right}, textW)` (`first` down at left + first, `hanging` up and `left` box at left, `right` up at textW - right), `dragIndent(id, at, ind, textW, free)` (Word's markers: `left` moves left and keeps the first-line offset, `hanging` moves left keeping the first line's absolute place, `first` the first line only, `right` the right indent; snapped from the margin each is measured from; clamped: left 0..room - right, first -left..room - left, right 0..room - left, room = textW - `MIN_TEXT` (360); NaN or unknown id: unchanged; whole twips, never -0) |
| `Ui/Ruler` | a ruler pane (desktop) | `new Ruler({task, parent, dy, height, menu, help})`: a pane `attachPane(pane, {dy, h, fitWidth})`, hiDPI canvas; `setScale({origin, page, text, zoom, scrollX, ticks?})` (px in the parent's work area; `ticks` (A4.3) twips of small grey marks at the ruler's foot, the default tab stops, compared as part of the scale) and `setMarkers([{id, twips, kind: down\|up\|box\|tabL\|tabC\|tabR\|tabD\|tabBar, help, grey}])` redraw only on a change (a tab kind's band is the 'up' one; `grey`: a style's stop); `beep()` (the Wimp's, for a gesture the client refused); `setSelector(kind, help)` shows the tab-type selector (`Ui/RulerTabPaint.SEL`, an 18 px box at the pane's left end that does not scroll; null: none); a Select CLICK (workButton `releasedrag` since A4.2: a click is a press let go without a drag) on the selector emits `selector` ({}), elsewhere away from the markers `add` ({twips, free}); a tab marker dragged with the pointer more than `OFF` (16) px below the ruler gives `remove: true` in its `drag` and `commit`; ticks from `RulerMath.ticks`, grey outside `text`, darker outside `page`; a Select or Adjust drag pressed within 6 px of a marker (picked by `RulerPick.pickMarker`: its band first (top 40 % down, then up and tab stops, bottom 20 % box), the nearest; a tab stop and an indent marker within 1 px of each other: the tab from 60 % of the height down, the indent marker above) runs `wimp.drag({type: 'point'})`, emitting `drag` ({id, twips, free}: Shift from `os.input.keysDown`, the grab offset kept) and one `commit` on release (Shift from the release event) wherever the pointer is, then always one `end` ({id}; a drop with no place, as a cancelled pointer could give, gets no `commit` but still the `end`); the client's `setMarkers` redraws during the drag (the Ruler invalidates once when the drag starts and once when it ends, not again on each move); drawn by `Ui/RulerPaint` (`paintRuler(g, ruler)`: desk, page, text, ticks, markers); the dragged marker is filled dark with a dotted line through it; `helprequest` gives the marker's help; `show(on)` (hidden: closed again after every parent `moved`/`opened`, since `attachPane` cannot be undone; shown: reopened at `dy`, `_paneParent` stacking keeps it in front); `dragging`, `paints` (count, for tests), `destroy()` (parent listeners removed, pane deleted; a drag already running ends quietly on release) |
| `RulerPick` | which ruler marker a press picks (pure, A4.2 fixes) | `pickMarker(markers, x, y, h, xOf, near = 6)`: markers within `near` px; the press's band first (top 40 % `down`; middle `up` and tab kinds; bottom 20 % `box`), else any band; the nearest wins, and markers within 1 px of the nearest tie: a tab kind wins from 60 % of the height down, an indent marker above (so a right tab at the right margin and a stop at the hanging indent can both be dragged; the box and the first-line triangle keep their bands); ties otherwise go to the first listed |
| `RulerTabs` | a ruler's tab stops (pure, A4.2) | stops `{pos, val, leader?, style?, id?}` (twips from the margin); `tabMarks(stops)` -> markers `{id: 'tab:<pos>' (or the stop's id), twips, kind, grey}` (`KIND`: left `tabL`, center `tabC`, right `tabR`, decimal `tabD`, bar `tabBar`; Strict start/end and num as left/right/left; clear and malformed: none); `tabId`, `posOf`, `isTab`, `isTabKind`; `SELECTOR` and `nextKind` (left -> center -> right -> decimal -> left, anything else left); `addAt(stops, at, kind, free, max)` -> `{stops, stop}` or null outside 0..max; `dragTab(stops, id, at, free, max)` -> `{stops, from, to, stop}` (snapped as the indents, `RulerMath.snap`, kept in 0..max, kind, leader and id kept, a stop at `to` replaced) or null; `removeAt(stops, pos)`; `defaultTicks(stops, every, max)` (A4.3: every multiple of `every` past the last stop that is not a bar, up to `max`, at most `MAX_TICKS` 1000; [] for a step not above 0); inputs never changed |
| `Ui/RulerTabPaint` | tab glyphs and the selector (canvas only, A4.2) | `SEL` `{x: 3, w: 18}`, `inSelector(x, y, h)`, `paintTab(g, x, h, kind, grey)` (L, mirrored L, inverted T, inverted T with a dot, bar; black or grey #808080), `paintSelector(g, ruler)` (white box with the selector kind's glyph); called by `Ui/RulerPaint` |
| `TextMetrics` | text widths and hit testing over an injected `measure(text, css) -> px`, LRU cache (`max` 20000, none over 4096 units) | `width(text, css)`; `widthTo(text, css, off)` = width of `text.slice(0, off)` (off clamped, uncached, measured as a string so kerning and ligatures count); `prefixWidths(text, css)` = width of the prefix at each grapheme boundary, O(n^2) so give it line-sized text (<= ~2000); `offsetAt(text, css, x)` = nearest grapheme boundary, ties left, `x <= 0 -> 0`, `x >= width -> length`, O(log n) measures; `size`; `ctxMeasure(ctx)` for a canvas |

A node is `{name, attrs: [[name, value]...], children}`; children are nodes, strings, `{comment}` or `{pi}`. Prefixes and
attribute order are kept as written. `serialize` throws `XmlError('malformed')` for anything that is not valid XML
(bad names, `--` in a comment, `?>` in a PI, characters XML forbids), so a tree can never be written broken.

### Adding a WimpLib module

1. Put it in `tools/moreapps/!WimpLib/<Name>`: no extension, Latin-1, no tabs, <= 72 columns, at most 250 lines, a
   header comment saying what it does and its API, the word `riscos` nowhere (`disc-wimplib --check` enforces all
   of these). A subdirectory is fine (`wimplib/<Dir>/<Name>`). Add it to the module list in `!WimpLib/!Help`.
2. Import siblings with exact, extensionless relative specifiers (`'./ZipError'`); never the `Name/js` form or a name
   with a dot (Node would not resolve them). Do **not** import `'riscos'` in a module Node must be able to load: keep
   desktop code in the application.
3. Add `tests/moreapps/<name>.test.mjs` (Node test runner, imports the module from `tools/moreapps/!WimpLib/...`).
4. `node tools/disc-wimplib.mjs` (copies it to `$.!Boot.Resources.!WimpLib` as JSScript) and `--check`.
5. Use it from any disc program: `import {x} from 'wimplib/<Name>';` (and from `!Word`'s sources the same way: Node
   resolves it through `package.json`). `src/core/jsrun.js` finds it through `WimpLib$Path`, then `WimpLib$Dir`
   (above). The prefix matches in any case (`WimpLib/Zip`); every segment after it must match
   `/^[A-Za-z0-9_][A-Za-z0-9_-]*$/`, so `..`, `^`, `$`, `@`, `<Var>`, `:`, dots (`Zip.js`), wildcards, spaces and
   empty segments (`wimplib//Zip`, `wimplib/Zip/`) are refused with "Can't find '<spec>' (a WimpLib module name is
   letters, digits, _ and -, with / between directories)": the import cannot leave the directories searched.

Imports are found by a regular expression over the source, so an `import ... from '...'` inside a comment is resolved
too (pre-existing in `jsrun.js`); circular imports hang the loader. Keep module graphs acyclic.

## The application modules (`!Word/`)

Model and operations

| module | what |
|---|---|
| `Model` | factories and the data model (header comment): `newPara(text, opts)`, `newSection()`, `emptyDoc()`, `nextId()`, `reserveIds(doc)`, `clone`, `props`; re-exports `OBJ deepEqual sameFmt checkPara checkBlock normRuns` |
| `ModelCheck` | the invariants: `checkPara`, `checkBlock`, `checkInlines`, `checkProps`, `checkPos`, `checkContent`, `normRuns`, `deepEqual`, `fail` (throws `RangeError`) |
| `Ops` | `apply(doc, op) -> inverse`, `applyOwn`; insertBlock, removeBlock, restoreBlock (a paragraph keeping the id of the one it replaces skips the document-wide id scan, so undoing a setProps of 50,000 paragraphs is linear), compound; the KINDS of `OpsText`, `OpsProps`, `OpsBlocks`, `OpsDoc`, `OpsSect` |
| `OpsDoc` | setDocPart `{key, value}`: replaces `doc.numbering`, `doc.rels`, `doc.styles`, `doc.rawSettings` (key `settings`) or `meta.numberingPart` (`meta` replaced by a copy; value `undefined` removes the key) with a NEW value; the inverse holds the old one. **Values are immutable by contract**: `Ops.apply` keeps a setDocPart's value by reference (no `structuredClone`, also inside a compound), so a value given, or returned in an inverse, must never be changed afterwards (that would change the Doc and its history; not supported). Refused: any other key (`__proto__`, `parts`, `meta`...); a value of the wrong shape (numbering `null` or `{raw: node, nums: Map}`, rels an array of Rels with unique ids, a style table, a node, a relative part name without `..`); a part name another part has (main, styles, settings, `[Content_Types].xml`, any `.rels`, a `doc.parts` entry, an Override of another content type than numbering; case ignored); settings other than `null` in a document without `meta.settingsPart` (the writer writes settings only to that part, so they would be lost silently; no part name is invented); `isNode`; `partFree(doc, name)` (true when setDocPart would take `name` as the numbering part: `NumWrite` picks names with it) |
| `OpsSect` | splitSection `{at: [s, i], props, raw}` (blocks `0..i` keep section `s` with the NEW props/raw: the section before the break, its sectPr written in paragraph `i`; blocks `i+1..` become section `s+1` with the old ones; refused at a kept block, at the last block or out of range; props checked as the reader's: `extra` array, only the `SECT_FIELDS`; raw a `w:sectPr` node or null) and its inverse mergeSection `{at: s, keep?}` (s and s+1 joined with s+1's very props/raw; `keep`, when given, must equal them; refused for the last section, when s does not end with a paragraph or s+1 is empty); setSection `{at: s, props, raw}` (section `s` takes new props/raw, checked as a split's, raw `undefined`: no raw key; inverse: the old ones; the section break commands give a section its `type` with it); other sections and every block keep their identity |
| `DocParts` | pure helpers that build new parts for setDocPart: `freshRelId(rels)` (also used by `DocxWrite`), `addRel(rels, {kind, target, external, strict}) -> {rels, id}` (a NEW array, old Rel objects shared; type `relType(kind, strict)`: pass `meta.conformance === 'strict'` so a Strict document keeps Strict types; kind letters and digits, target 1..2048 characters without controls), `withStyle(styles, style, {replace}) -> styles` (a new table and Map, the style normalised by `Styles.addStyle`, the others shared and unchanged; the writer writes old styles from `raw` byte for byte), `findStyle(styles, id, name)` (by id, else by name ignoring case, else null), `hyperlinkStyle(styles) -> {id, styles} | null` (A6.1: the table's own Hyperlink character style, by id or name; else Word's definition added to a NEW table by `withStyle`: `character`, colour `0563C1`, `u single`, `basedOn` the default character style, `uiPriority 99`, `unhideWhenUsed`; null without a table or when its Hyperlink is not a character style) |
| `OpsBlocks` | removeBlocks `{at, count}` and its inverse insertBlocks `{at, blocks}`: many blocks of one section in one op, linear time (ids checked against one Set of the document's ids) |
| `OpsText` | replaceText, spliceText, splitBlock, mergeBlock |
| `OpsProps` | setProps, `mergeProps(base, patch)` |
| `OpsUtil` | `locate paraAt sectionAt idUsed cut join checkRange` |
| `DocEvents` | tiny emitter; one failing listener does not stop the others |
| `Document` | `new Document(doc)`: `apply(op, {coalesce})`, `undo()`, `redo()`, `group(fn, {coalesce})`, `atomic(fn, opts)` (a group that, when fn throws, undoes the ops it applied, records nothing and rethrows; the editing commands run in it), `groupStart/End`, `on('change', fn)`, `canUndo`, `canRedo`, `breakCoalesce()`, `markSaved()`, `stateId` (the current state's serial), `markSavedAt(id)` (state `id` is the saved one: a save that took time; edits made meanwhile stay dirty, undo back to it is clean; no `change` event), `dirty`, `undoDepth`, `maxSteps` (1000), `clearHistory()`, `onListenerError` (details under Operations and undo) |
| `DocHistory` | the undo and redo stacks behind `Document`: serial numbers per state (so `dirty` is "current serial != saved serial"), coalescing by key, `MAX_MERGE` = 128 ops per merged step, the `maxSteps` trim (O(1000) `shift`), `markSaved` (also ends the coalescing run, so the saved state stays reachable by undo), `markSavedAt(id)` (`markSaved` if `id` is current, else only the marker moves). Pure bookkeeping, no access to the Doc |
| `Styles` | `newStyleTable()`, `styleOf`, `resolvePara(styles, para, levelInd?)` (`levelInd`: the list level's indent, a layer between the style chain and the direct `pPr`: style < numbering level < direct, Word's order, attribute by attribute (a level giving only `left` keeps the style's hanging/firstLine; only `hanging` keeps its left); ind `firstLine`/`hanging` are one property: a layer giving one drops the other from lower layers, as Word does; both in one layer: hanging wins), `resolveRun`, `paraLayers(styles, para)` / `runLayers(styles, para, run)` (the layer objects themselves, lowest first: defaults, the paragraph style chain, (for a run) the character style chain, the direct properties; for rules that are not `mergeInto`'s, such as whole borders and shading, `BorderResolve`), `addStyle`, `setDefault`, `ensureBuiltins` |
| `StylesBuiltin`, `StylesMerge` | the built-in styles of a new document (`builtinStyle(id)`: a new copy of one, for `ListMake`'s List Paragraph); property merging without aliasing |
| `StylesNum` | the numbering of a paragraph's pPr layers: `numberingOf(layers)` -> `{numId, ilvl, ilvlGiven}` or `null` (`ilvlGiven` false: no layer gave an ilvl, `ilvl` 0); `layerNumPr(pPr)` also reads a `w:numPr` kept raw in `extra` (tracked change inside: `w:numId`/`w:ilvl` taken, other children ignored). `Styles.paraNumPr(styles, para)` (styles may be null), `Styles.paraStyleId` |
| `ListNumbers`, `ListLevel`, `NumFormat`, `BulletGlyph` | list labels (pure, display only). `ListNumbers.labels(doc)` -> `Map<paraId, {text, level, numId, indent?: {left?, hanging?, firstLine?}, suff, jc, rPr, bullet, fmt}>` (`indent` carries only the attributes the level's `w:ind` gives; hanging wins over firstLine) in one pass over every section's paragraphs (kept blocks neither count nor restart; 100k paragraphs well under a second): counters per abstractNum (per numId when it names none) continued through the document, so numIds over one abstractNum continue one count (Word); a `startOverride` sets its level's counter the first time that level is counted under that numId (once per numId and level), otherwise a first use or restart gives the level's `start` else 0; a paragraph at ilvl k restarts deeper counters per `lvlRestart` (absent: any higher level; 0 never; n: ilvl below n); `%n` in `lvlText` is counter n-1 in level n-1's format (decimal for `isLgl`; unused counters show their start; other `%` literal), numbering from the style when the paragraph has none, style numbering with no ilvl takes the level whose `pStyle` is the paragraph's style (else 0), missing levels use the nearest defined level below (`ListLevel.levelsIn`), numId 0 or unknown: no label; `jc` from `lvlJc` (default left). `lvlText` is read to 255 characters and `numFmt` to 64 (`NumLevel`), and `ListLevel`'s `parse` reads at most 255 template characters (`MAX_TEMPLATE`) once per numId and level (`labelMaker` keeps the parsed template), so hostile templates cost little. Not yet checked in real Word (hand-off): numIds sharing an abstractNum continuing one count and the one-shot `startOverride`; an unused upper level shown as its start in a deeper label (`%1.%2.` with no level-0 paragraph yet: `1.1.`); missing levels taking the nearest level below; the bullet glyph table; the level `w:tabs` is not read (a tab suffix uses the indents only). `NumFormat.formatNumber(n, numFmt)` (decimal, decimalZero, lower/upperLetter `aa` `bb` Word style, lower/upperRoman to 3999 else decimal, ordinal, bullet/none ''; unknown: decimal), `LABEL_CAP` 40, `capLabel`. `BulletGlyph.glyphFor(ch, font)`, `bulletText`: Symbol/Wingdings/private-use bullets as Unicode shapes (U+F0B7 -> U+2022, U+F0A7 -> U+25AA, 'o' in any font -> U+25E6 (the owner's level-1 bullet; it was U+25CB), unknown PUA -> U+2022) |
| `ListGallery` | the definitions a new list gets (pure, frozen): `BULLETS` (disc, circle, square, diamond, arrow, check) and `NUMBERS` (`1.` `a.` `i.`; `1)` `a)` `i)`; `I.` `A.` `1.`; `A.` `a.` `i.`; `a)` `i)` `1)`; `i.` `a.` `1.`), and `HIDDEN` (not in the galleries, for AutoFormat as you type: `dash`, an en dash U+2013 in Calibri at level 0 with Word's cycle below; `a.` (`a.` `i.` `1.`); `(1)` (`(1)` `(a)` `(i)`)); `ENTRIES` all of them in that order; each `{id, kind, name, levels}` with 9 Levels in `NumLevel`'s shape: start 1, `ind left` 720 x (k+1), `hanging` 360, `suff` tab, roman levels `lvlJc right`, bullets with `rFonts`: the entry's glyph at level 0 (U+F0B7 Symbol, `o` Courier New, U+F0A7 / U+F076 / U+F0D8 / U+F0FC Wingdings) and Word's cycle (U+F0B7 Symbol, `o` Courier New, U+F0A7 Wingdings) at level k >= 1, k mod 3, for every entry as Word does; `entryOf(id)`, `kindOf(level)` (`'bullet'` for numFmt bullet, else `'number'`), `matches(num, id)` (the Num's level 0, override first: the same bullet glyph through `BulletGlyph`, or the same numFmt and lvlText and not legal) |
| `NumWrite`, `NumScan` | numbering definitions written (pure; values for `setDocPart`, nothing changed in place). `ensurePart(doc) -> {numbering, rels, numberingPart}`: the doc's own objects when it has a numbering part; else a new root (`w:numbering` with `xmlns:w` only; Transitional in memory, Strict on write) and a free part name (an existing numbering relationship's target when that part is free, else `numbering.xml` beside the main part or the first free `numberingN.xml`, N from 2, by `OpsDoc.partFree`) with a NEW rels array from `DocParts.addRel` (Strict type for a Strict document; put before an unusable numbering relationship so the reader takes it); the content type is the writer's; RangeError without `meta.mainPart`. `addList(numbering, entry, {usedNumIds, rand, strict, start}) -> {numbering, numId, abstractNumId}` (`start`: level 0's `w:start`, 0..2^31 - 1, else RangeError: a list typed as `3. `; `strict`: pass `meta.conformance === 'strict'`; a Strict document gets Strict attribute names and values in the levels, `w:ind w:start` and `lvlJc start`/`end`, else `w:left` and `left`/`right`; `NumLevel` reads both alike. Known gap, not this module's: the paragraph `w:ind` writer (`WriteProps`) still writes `w:left`/`w:right` in Strict documents): a NEW root holding the same old child nodes plus a `w:abstractNum` (`w:nsid` 8 hex digits no abstract of the part has, `hybridMultilevel`, 9 `w:lvl`: start, numFmt, lvlText, lvlJc, pPr ind, rPr rFonts for bullets) after the last abstract / `w:numPicBullet` / `mc:AlternateContent` holding one (never after the first `w:num` or `w:numIdMacAtCleanup`) and a `w:num` after the last num, before `w:numIdMacAtCleanup`; ids one more than the largest numeric id (abstracts: also those `w:num`s name, so a num naming a missing abstract never starts showing ours; nums: also `usedNumIds`), RangeError past 2^31 - 1; new nodes declare `xmlns:w` when the root binds `w` elsewhere; `nums` a new Map with the old Num objects and the new one from `readNumbering`. `addRestart(numbering, numId, ilvl, start, {usedNumIds}) -> {numbering, numId}`: a new `w:num` on numId's abstract with `w:lvlOverride`/`w:startOverride` (Restart at 1, Set value); of the source `w:num`'s other `w:lvlOverride` nodes (every level but ilvl) only level replacements (holding a `w:lvl`) are kept, by identity (a new node without its `w:startOverride` when it has one: a restart never restarts another level), all in level order, with the source's xmlns declarations. `usedNumIds`: integers only (others ignored). `NumScan.scan(root, used)`: largest ids, nsids, insertion places (`absAt`, `numAt`; `numNode`, `overridesOf`; `mc:AlternateContent` children count at its place); 10,000 abstracts in well under 50 ms |
| `ListMake`, `ListRestart`, `ListUsed` | the commands that make lists, pure (`FormatApply` ids `bullets`, `numbering`, `listRestart`, `listContinue`). `toggleList(d, typing, sel, {kind: 'bullet' \| 'number', entry?}, pending?) -> {sel, pending}` (entry a `ListGallery` id of that kind, else RangeError) over the paragraphs the selection formats (kept blocks skipped): **off** when every one is in a list of that kind (`ListRestart.numKind`: the kind of the list's level 0, as `matches` looks at level 0, so a bullet sublevel of a numbered list is in a numbered list: Numbering takes it out, Bullets gives it a bullet list of its own at its level) and, with an entry, one the entry `matches`: the direct `numPr` removed, or `numId 0` when the style gives the list; a List Paragraph style back to the default; **on** otherwise (entry default `disc` / `1.`): the nearest list paragraph before the first one in the same section (any gap of non-list paragraphs and kept blocks: the owner's ruling, Word's behaviour; paragraphs numbered by their style alone skipped) is continued when its level 0 matches the entry, else the first selected paragraph in a list the entry matches, else an unused `w:num` of exactly that definition (`ListUsed.reusable(doc, entry, strict, used)`: its levels equal to what `addList` writes for the entry, no `lvlOverride`, no style link, `hybridMultilevel`, named nowhere, and no num in use on its abstract, since numIds over one abstract share a count; so Bullets off and on adds no definition: final review), else a new list (`NumWrite.ensurePart` + `addList` with `strict` = `meta.conformance === 'strict'` and `ListUsed.usedNumIds`: numIds named by paragraphs, by `w:numId` anywhere in kept blocks and in paragraphs' inline raw nodes (text boxes), by styles (and anywhere in a style's raw node), by `w:numId` in paragraphs' raw `pPr` and runs' raw `rPr` elements (an old `w:numPr` in a `w:pPrChange`: final review), and by `w:numId` in the text of every other XML part of the package (headers, footers, footnotes, endnotes, comments; read once per part data)); each paragraph gets direct `numPr {numId, ilvl}` (its level kept when in a list already, else 0; a style-numbered heading gets direct `numPr`, its style kept); a paragraph with the default paragraph style gets List Paragraph (found by id or name; the built-in one added with `DocParts.withStyle` when missing, based on `styles.defaults.paragraph` (Standard in a German Word's files; none without one) rather than the built-in's Normal). Ops: `setDocPart` numbering, numberingPart, rels, styles (only what differs), then one `setProps` per changed paragraph, all in one `runOps` (`typing.command` + `d.atomic`): one undo step restoring `doc.numbering`, `doc.rels`, `doc.styles` and `meta` exactly; none when nothing changes. `restart(d, typing, sel, start = 1, pending?)` (`ListRestart`; start 0..2^31 - 1, else RangeError): the first paragraph the selection formats, when in a list, gets a new `w:num` on its abstract with a `startOverride` for its level (`NumWrite.addRestart`, which keeps only the source num's level replacements, never another level's `startOverride`: restarting a sublevel never restarts its parent), and it and every LATER paragraph of the old numId (any section) move to it; nothing at all (no undo step, no new `w:num`) when no label would change (`ListNumbers.labels` before and after, compared by text: Restart at 1 on a list's first item, or pressed again; final review). `continueList(d, typing, sel, pending?)`: the RUN of that paragraph's numId (its paragraphs around it with only non-list paragraphs and kept blocks between, up to a paragraph of another list on either side) takes the numId of the nearest list paragraph before the run with another numId and the same kind (style-only ones skipped); nothing there: nothing changes, no undo step. `listKindOf(doc, para)` (`'bullet'`/`'number'`/`null`: `numKind` of its list), `listEntryOf(doc, para)` (the gallery id its list matches, cached per Num, or `null`), `listFacts` (both), `listStyle(doc)` / `plainStyle(doc, para)` (the List Paragraph style to give, and whether a paragraph has the default style: shared with `AutoList`). Hostile numbering parts: ids NumWrite cannot make are refused with a RangeError before anything is applied. 100,000 paragraphs made a list in about 1.4 s (Node), undo well under that |
| `ListMenu`, `ListBox` | the list menus and box (desktop). `bulletMenu(view)`: None (shaded outside lists; `listOff`), then the six `ListGallery.BULLETS` each as a hint glyph (`BulletGlyph.MENU_GLYPHS`: covered look-alikes, because Homerton has only U+2022 of the real shapes; menus only) and name, ticked when `query().listKind === 'bullet' && listEntry === id`; choosing runs `view.format('bullets', id)` (on the same entry: off). `numberMenu(view)`: None, then the six `NUMBERS` as three samples (`NumFormat.formatNumber` of 1, 2, 3 in the level 0 format and text: `1. 2. 3.`, `I. II. III.`, `a) b) c)`), `view.format('numbering', id)`. `listItems(view, {value}?)` / `listMenu`: Bullets > (key `Keymap.labelFor('bullets')`, Ctrl+Shift+L), Numbering >, Restart at 1 (`listRestart` 1), Continue numbering (`listContinue`), Set numbering value... (`value()` or shaded), Demote (Tab), Promote (Shift+Tab), Remove from list; all but the two galleries shaded outside lists (`inList(view)`: `FormatList.hasList`, cached per `selRev`), everything with no selection. `ListBox.listBox(dw)`: Set numbering value, a `Ui/Dialog` (key `listvalue:<docKey>`, kept in `dw.boxes` as `listvalue`, deleted with the document; Cancel always): radios `modeNew` / `modeCont` (group `mode`: Start new list, Continue from previous list) and a number field `value` (field max far above the limit so it never clamps; shaded for Continue; OK refuses anything but a whole number 0 to 32767, Word's Start at limit: beep, box kept, nothing written); OK = `view.format('listRestart', n)` or `'listContinue'`, one undo step. |
| `AutoList`, `ListMarker`, `AutoFormatOpt`, `WordChoices` | AutoFormat lists as you type (Batch A, A2.4). `ListMarker` (pure; re-exported by `AutoList`): `markerOf(text) -> {kind, entry, start} \| null` (the text before the space; at most `MAX_MARKER` 8 characters): `*` disc, `-` dash, `>` arrow; `N.` `N)` `(N)` with N 0..`MAX_START` 32767 and no leading zero (entries `1.` `1)` `(1)`); one letter `a.` `a)` `A.` (a = 1 .. z = 26; `A)` is none); roman with `.` only: `i` / `I` alone is roman 1 (any other single letter is a letter: `v.` 22, `M.` 13), two or more letters only when `NumFormat` writes the value back exactly and it is at most 39 (`iv` yes, `iiii`, `ic`, `xl` no); `i)`, mixed case, `1.5`, `a.b`, `e.g.`, `10000000000.` are none; `readings(text)`: both readings of one letter that can be roman (`i v x l c d m`, either case: with `.` roman and letter, lower case with `)` the letter). `AutoList` (pure): one such letter is read both ways first, and the reading that continues the nearer earlier list of its format (the label it would get there is the letter typed) wins (`v.` after `i.`..`iv.` is roman 5, `i.` after `a.`..`h.` the letter i, `i)` after `a)`..`h)`); else `markerOf`'s rule. `afterSpace(d, typing, sel, {typed = ' '}) -> sel \| undefined`: the caret just after a typed space (or `'\t'`) whose text before is exactly a marker (after nothing but `INVISIBLE` marks, at most 16: bookmarks such as Word's `_GoBack`, proofing marks, comment and permission ranges, `lastRenderedPageBreak`; a link, field, drawing, tab or any other inline refuses; the marks stay), in a paragraph with no numbering of its own or from its style (no list, no style-numbered heading, no `numId 0`, no dangling numId: any layer's `numPr`, raw too): one `runOps` step (`typing.command` + `d.atomic`) of `replaceText` removing the marker and the character FIRST (so undo's last leaf op is that text put back and `EditApply.stepEnd` puts the caret after the space), then the numbering part ops and `setProps` `numPr {numId, ilvl 0}` (+ List Paragraph for a default-style paragraph, `ListMake.listStyle`). The list: the nearest earlier list paragraph of the section whose list `matches` the entry (other formats and style-only paragraphs passed over) is continued for a bullet, and for a number when the label the paragraph would get there (`ListNumbers.labels` of a copy of the doc with that `numPr`) is the marker typed; else `NumWrite.addList(entry, {start})`. A refused numbering part (RangeError) or a document with no package data: `undefined`, nothing changed. `AutoFormatOpt` (desktop through `WordChoices`): `autoListOn(app)` (false only when the choice is `false`), `setAutoList(app, on)`, `autoListItem(app)` (Format > AutoFormat lists, ticked while on). `WordChoices` (desktop): Choices:Word as one object shared by `RecentFiles` (`recent`) and `AutoFormatOpt` (`autoList`): `loadChoices(app)` (`app.choices`, `app.choicesReady`, one read per app; missing, corrupt or non-object: `{}`), `choiceOf(app, key)` (own keys only), `setChoice(app, key, value)` (after the read, synchronously when it is done: the file read again with `vfs.readFileSync` when it is in memory, else the cache, the key set, written whole: so neither overwrites the other's key and unknown keys are kept; a failed write is a `console.warn`), `mergeChoice` (pure). Wiring: `DocKeys.attachKeys` sets `view.autoList = () => autoListOn(app)`; `EditInput.inputView` calls `afterSpace` after a single `' '` typed at a caret when `view.autoList()`, not in overwrite mode, not an input method's commit (`{composed}`: a `textinput` straight after `compositionend` in the same task, and `DocSave.commitComposition`'s typing of the composing text at a Save) and nothing composing; `EditRun` passes `{autoList}` to `EditApply.run`, which calls it after `tab` (typed `'\t'`); paste, Find / Replace, undo / redo never reach it. `WinMenu` passes `autoListItem(dw.app)` to `FormatMenu` (its last item) |
| `ParaInd`, `FormatList`, `EditList` | editing lists, pure. `ParaInd`: `listOf(doc, para)` -> `{numId, ilvl, fromStyle}` or `null` (the paragraph has a label: numbering in force, a defined numId, a level at or below ilvl; `fromStyle`: its style gives a numId), `numOf`, `listInfo` (both at once with the Level in force), `levelInd(doc, para)` (the level's indent, worked out for that paragraph alone: equal to the label's `indent`, pinned by a property test), `effPara(res, doc, para)` (`FormatEff` resolver `para(p, levelInd)`), `effective(doc, para, labels?)` -> `{left, first, right}` twips as drawn (style < level < direct). `Format.query` indents, `RulerInd.firstIndents`, `indentBy` (Ctrl-M, the toolbar's buttons) and `dragIndents` start from these, and `FormatPara.explicit` compares with style + level, so a list item's changed indent is written as direct `ind` (Word) and one back at the level's value is removed. `FormatList.setList(d, typing, sel, patch, pending?)` -> `{sel, pending}` over the selected list paragraphs (others skipped): `{by: 1 | -1}` (to the next level the numbering DEFINES in that direction, `ListLevel.levelAt`: with levels 0 and 2 only, Tab on 0 gives 2; a paragraph at an undefined level beyond the last steps up to the last; past the deepest or highest defined level nothing), `{level: n}` (clamped to 0..8 and `ListLevel.definedRange`), `{off: true, keep?}` (direct `numPr` removed, or `numId 0` when the style gives the list; `keep`: the level's left written as direct `ind` and a hanging first line made `firstLine 0`, so the text stays where it was drawn); writes direct `numPr {numId, ilvl}`; one undo step, none (not dirty) when nothing changes; bad patch: RangeError. `listParas(doc, sel)`, `hasList(doc, sel)` (`listParas > 0` stopping at the first list paragraph, at once with no numbering; `FormatMenu` asks it once per `v.selRev` and selection, so drawing the menu over a select-all of 50,000 paragraphs is cheap). `EditList`: `listTab` (a caret at an item's start, or a selection over items: `{by: 1}`; else a tab), `listShiftTab` (in an item anywhere: `{by: -1}`; else `undefined`: the key goes on), `listBack` (a caret at an item's start: `{off, keep}`; the next Backspace joins as before), `usesShiftTab`. Heading numbering (a style-numbered paragraph demoted gets direct `numPr`; Word would change the heading style) is not special-cased |
| `PropNames` | which property fields exist and the WML element each is read from / written as (rPr `rFonts b i strike color sz szCs highlight u vertAlign shd`; pPr `keepNext keepLines pageBreakBefore numPr spacing ind jc outlineLvl tabs pBdr shd widowControl contextualSpacing`; sectPr `pgSz pgMar cols titlePg type`); `withoutRaw` |

Reading and writing `.docx`

| module | what |
|---|---|
| `DocxRead` | `await readDocx(bytes, opts) -> Doc`; `DocxError`; opts `maxTotal maxRatio maxXmlBytes maxElements maxParagraphs` |
| `DocxWrite` | `await writeDocx(doc, {date}) -> Uint8Array`; `newDoc` |
| `NewDoc` | `newDoc({paper: 'a4'\|'letter', date}) -> Doc` (what Word starts a blank document with) |
| `DocxError` | `code`: `not-docx no-document bad-xml unsupported bad-model`; `part`, `cause`, `kind: 'ole2'` |
| `Package` | `openPackage(bytes, opts)`: zip, content types, relationships, main part, which parts the reader consumes |
| `Rels` | `parseRels relKind firstOfKind resolvePart relsNameFor findPart` (Transitional and Strict relationship types) |
| `PartXml` | `parsePart(bytes, name, limits)`: size/element/paragraph gates before parsing; UTF-8 or BOM UTF-16 |
| `Ns`, `NsMap`, `Wml` | namespace scopes (elements are recognised by URI and local name, never by the `w:` prefix); Strict <-> Transitional URI mapping (`mapNamespaces`, `mapNamespacesCopy`); constants. `Ns.strictScope(map)` / `isStrict(map)`: a Strict document's scopes are marked (`DocxRead` for the main and styles parts, `WriteBody.docScope`, `WriteStyles.stylesTree(styles, strict)`; `scope` copies the mark), and there `ReadProps` / `WriteProps` use Strict's names for `w:ind` (`w:start` / `w:end` attributes) and `w:pBdr` (`w:start` / `w:end` sides) as the `left` / `right` fields; the Transitional names keep the element raw in a Strict document and the Strict ones in a Transitional document (see "Strict documents") |
| `ReadBody ReadPara ReadProps ReadPropsMore ReadSect ReadStyles ReadNumbering NumLevel` | the XML -> model readers (`NumLevel`: one `w:lvl` of a numbering definition; `ReadPropsMore`: `intOf`, `onOffOf` and the readers of `w:tabs`, `w:pBdr`, `w:shd` and a section's `w:type`, with the value lists `TAB_VALS`, `LEADERS`, `SIDES`, `SECT_TYPES`, `MAX_STOPS` 256, `MAX_POS` 31680: a `w:tabs` with a position beyond it or a position twice stays raw) |
| `WriteBody WritePara WriteProps WritePropsMore WriteStyles WriteParts` | the model -> XML writers (`WritePropsMore`: `w:tabs` in model order, `w:pBdr` sides in schema order, `w:shd`, `w:type`; attributes in Word's order, booleans `1`/`0`); `WriteParts`: content types (`contentTypes(ct, names, known, fix)`), rels, zip order, XML declaration |
| `PartTypes` | `typeForRel(type)` (the content type a part reached by that relationship type must have: Transitional, Strict and Office 2010+ kinds), `repairs(ct, sources, has)` (the parts to retype, see below) |
| `Order`, `OrderP OrderR OrderTbl OrderSect` | child order of pPr, rPr, tblPr, tcPr, trPr, sectPr (tables checked against `wml.xsd`); `sortChildren(parent, children)` |

The application

| module | what |
|---|---|
| `!RunImage` | start-up (single instance), opening files, DataOpen / PreQuit (`Quit.preQuit`) / Quit (unconditional) messages, `app` (`docs` keyed by `keyOf(path)` = canonical path lower-cased, `'?name'` for a name that does not parse, `'untitled:N'` for an untitled document, so the three never collide; `rekey(dw)`; `newDoc({paper})` (A4 unless `'letter'`); `noteRecent(path)` (after a successful open and save); `recent` (the cached list); `prompt`, `closing`), `loadRecent` at start; the icon is `IconBar`, the `task.word` test hook `TestHook` |
| `SaveState` | (pure) `untitledName(taken)` ('Untitled', 'Untitled 2'... the first free, case ignored), `safeLeaf(name)` (what a vfs leaf cannot hold left out: the window 'Untitled 2' is saved as `Untitled2`, since `vfs._validLeaf` refuses spaces, hard spaces included), `leafOf`, `dirOf`, `defaultDir(recent)` (the directory of the newest full path, else `HOME` = `ADFS::HardDisc4.$`), `suggestName(dw, dir)` (the path, or `dir.safeLeaf`) |
| `DocSave` | (desktop) `save(dw)` (titled: write in place; untitled: open the Save as box centred, resolves true only after a save from it, false when it is closed without), `saveAsTo(dw, path)` (errors reported by `reportError`, false), `writeTo(dw, path)` (throws: the Save box reports), `canWrite(dw, path)` (refuses the file of another open window), `saveBox(dw)` (the cached Save as box: a full path, so OK works (an untitled document's is a name no file has: `SaveState.suggestName(dw, dir, exists)`), its `save` is `writeTo`, OK guarded by `Replace.guardOK`), `commitComposition(view)` and `notSaved(name, e)` (the Error "'name' could not be saved: why" that a failed `writeDocx` or `vfs.writeFile` becomes; both exported for `CopySave`); a written file goes to `app.noteRecent(full)`. The saved-state rule: commit any composing text (`wimp.textInput.blur()` then `view.input`), `breakCoalesce()`, take `stateId`, `await saveBytes()` (`writeDocx` builds the parts before its first await, so the bytes are that state), check `canWrite` again, `vfs.writeFile(path, bytes, {filetype: 0xA7E})`, and only then `markSavedAt(id)`, rename (title, `path`, `leaf`, `rekey`, the Save as box's name, the Save a copy box's full path, Info's `file` icon) and `retitle()`. The saves of one window are serialized (`writeTo` chains on the previous save's end, the first starts synchronously so its state is the one at the call): a slower earlier save can never overwrite a later one's file, rename the window back or move the saved marker back. One pending `save()` promise per untitled window (`waiting`): Save again returns it and leaves an open box's typed name alone; it resolves true from the box's `save`, false when the box closes and stays closed (checked in a microtask: if the box is open again, nothing; if a menu tree of the task is open, the menu was opened again over it, so check again on `MenusDeleted`; deleting the box is false). `onSaved` puts the canonical path back in the box (the core's `saveAs` shows the name as typed after OK). `bytesOf(dw)` is `dw.saveBytes()` (`writeDocx`, errors name the file). `idle(dw)` (the queue's end) and `saving(dw)`. Save on a titled document passes `path = null` so the queued save takes `dw.path` when it RUNS (Save while a Save as is writing saves under the new name). A window closed while its save was writing: the file is written and remembered, but the dead window is not marked, renamed, retitled or re-keyed (`app.rekey` also ignores a closed window). `writeTo` notes `d.stateId` when the save is ASKED; a queued save whose turn comes after its window was closed with changes made since (Discard) writes nothing and resolves `null` (`saveAsTo` false): the discarded edits never reach the file; the Save box's `save` then returns without settling a pending `save()` (only a written file settles it true). Committing composing text also sets `view.lateCommit = {text, at}`: `EditInput` drops the input method's own later commit of that text (the next `textinput`, if equal, within 800 ms, with nothing in between), so the text is typed once |
| `CopySave` | (desktop) `copyBox(dw)`: Save a copy, a cached `saveAs` box offered a full path (the document's, or a free name for an untitled one; set to the new path on a rename); its `save` refuses another open window's file (`canWrite`, before and after the bytes), commits composing text, writes `dw.saveBytes()` with type &A7E (a failed write is `DocSave.notSaved(leaf, e)`, "'leaf' could not be saved: why", as Save says it); OK guarded by `Replace` (asks even over the window's own file); nothing in the window changes |
| `Replace` | (desktop) `guardOK(box, task, skip)`: `first` handlers on the Save box's OK click and Return: a full path to an existing, unlocked file that `skip` does not excuse (Save as: the window's own file or another open window's file, refused anyway) asks `Ui/SaveQuery` "'leaf' already exists. Replace it?" Replace / Cancel with `enter: 'Cancel'` (Return and Escape both Cancel: the core `query` makes Return the first button, so it is not used); Replace re-sends the OK click, let through once; Cancel puts the caret back in the box's name. A drag of the box's icon goes straight to the core's save (no question, documented). `samePath(a, b)`; `questionOf(box)`: the window of the box's Replace question while it is open (a WeakMap box -> the `saveQuery` promise), else null: `Quit` brings it forward over the box (the question does not set `app.prompt`) |
| `CloseDoc` | (desktop) `requestClose(dw)` (close icon, Close): clean -> `destroy`; dirty -> `Ui/SaveQuery` "'leaf' has changes that are not saved." Save -> `await dw.save()`, closes only if true and not dirty again; Discard -> `destroy`; Cancel -> the focus back to the view; re-entry per window ignored while asking or saving; while another window's prompt is open the request brings that prompt to the front and beeps; a failed Save (reported by `saveAsTo`) or a document changed during the Save (`reportError` "... changed while it was being saved: it has not been closed.") keeps the window and gives the view the caret; the name in messages is cut to 40 characters (`shortName`); `app.prompt = {dw, buttons, win}` while open; `app.closing` is the promise of the `requestClose` asking or saving (`Quit` waits for it); while the quit prompt is open (`app.prompt.dw` null), or Revert's question (`askRevert`: the core `query` window found as the task's new window, set as `app.prompt` while open), a close request brings it to the front and beeps; a prompt that cannot open (`saveQuery` throws) is reported ("'leaf' was not closed: ...") and the window kept, no rejection. `revert(dw)`: first `await idle(dw)` (Revert after a Save as still writing reloads what was saved); untitled -> false (menu item shaded); dirty -> core `query` "Discard changes to 'leaf' and reload it?" (Discard / Cancel); `stateId` noted, `openDocx(vfs, path)`; failure -> `reportError(describe(e, leaf))`, old document kept; changed while the file was read (stateId moved) -> gives up quietly, the typing kept. The reloaded document gets a **new `DocWindow`** (`new dw.constructor(...)`, so no import of `AppWin`) opened with the old window's `getState()` (position, size, scroll) `behind` the old one, ruler and zoom copied, focus given if the old view had it, then the old one is `destroy`ed and `app.docs` re-keyed to the new one; fonts via `app.fonts(doc)` then `relayout`. Swapping the Document inside the window was not done: the view, typing, toolbar, ruler, zoom and listeners all hold the `Document`. `destroy(dw)` (= `dw.close()`, forced: tests, Quit): view, toolbar, ruler, zoom, boxes, window, `app.closed`; `dw.closed` |
| `Recent` | (pure) `MAX` 8; `clean(list, keyOf, max)` (strings with ':' or '$', <= 1024 characters, no control characters; first of each `keyOf`; a throwing `keyOf` drops the entry; non-arrays -> `[]`; stops at `max`, so 10,000 entries are cheap), `add(list, path, keyOf, max)` (path first, a new list), `fromChoices(c, keyOf)` (own `recent` only: missing / corrupt / `__proto__` choices -> `[]`), `shown(list, exists)` (exists may throw), `labels(list)` (leaf names; leaves that clash: the path cut to its last 40 characters) |
| `RecentFiles` | (desktop) `loadRecent(app)` (`WordChoices.loadChoices`, its `recent` key cleaned into the `app.recent` cache; `app.recentReady`), `noteRecent(app, path)` (canonical path first, keyed by canonical lower case, files that no longer exist dropped, `WordChoices.setChoice(app, 'recent', list)`: the other keys of Choices:Word kept; waits for the read; a failed write is a `console.warn` only, never breaks a Save), `recentItem(app)` (the menu item: shaded with nothing to show; the submenu built synchronously from the cache, missing files hidden, each entry -> `app.open`, which raises an open window) |
| `Quit` | (desktop) `changed(app)`, `quitMessage(n)` ('1 document has unsaved changes.' / 'N documents have unsaved changes.'), `mustAsk(app)` (sync: dirty documents, `app.closing`, or a quit prompt running), `mayQuit(app)` (one promise at a time; waits for an open close prompt (brought to the front; with no prompt open, a Save as box a close prompt's Save waits on is brought forward, and over it its Replace question when that is open: `Replace.questionOf`, so a Quit never hides the question under the box) and counts again: nothing left dirty -> true without asking; else `Ui/SaveQuery` Discard / Cancel, Return = Discard as in !Edit, Escape / close icon = Cancel; `app.prompt = {dw: null, quit: true, ...}` while open), `quit(app)` (the menu's Quit: at once when `!mustAsk`; Discard -> every window `destroy`ed, `task.quit()`), `preQuit(app)` (the handler: `msg.object()` synchronously when `mustAsk`, then `mayQuit`; Discard -> windows destroyed, `task.quit()` if `msg.single`, else `wimp.emit('hotkey:CtrlShiftF12')` to restart the closedown, which then finds nothing to ask; at most once per answer: two PreQuit-all messages before the answer share `mayQuit`'s promise, and the `restarted` WeakSet keyed by it lets only the first restart). Both chains (`quit`, `preQuit`) end in a `catch`: a prompt that cannot open is reported ('Word could not ask about unsaved changes: ...', `reportError`) and nothing quits (no unhandled rejection) |
| `IconBar` | (desktop) `addIcon(app)`: Select -> `app.newDoc()`; Adjust nothing. The Wimp reports every press on an icon bar icon (button type 3) as a `click` (`kind: 'click'`), never `double`: a double-click is two Select clicks, so a click within 500 ms of the one that made a document is ignored (one gesture, one document; `kind === 'double'` is ignored too). Menu: New, Recent > (`RecentFiles`), Info >, Quit (`Quit.quit`) |
| `TestHook` | `testHook(app)` -> `task.word`: `docs`, `open`, `new({paper})`, `newUntitled(paper)`, `keys`, `ask`, `prompt` (`leaf` null for the quit prompt), `recent` (a copy), `recentReady`, `mayQuit()`, `quit()`, `dialog(spec)` (WimpLib `Ui/Dialog` for the task) |
| `Boxes` | `box(dw, name, make)`: a window's dialogue boxes made once, kept in `dw.boxes` |
| `Open` | `openDocx(vfs, path)` (refuses more than `MAX_PARAGRAPHS` = 200,000 paragraphs), `describe(err, leaf)` (the plain-words error text) |
| `ToolbarBind`, `ToolbarButtons`, `EditScroll` | the toolbar. `ToolbarButtons` (pure): `BAR_H` (34, the height of a row), `ROWS` (2), `BUTTONS2` (row 2, under row 1: `lineSpacing`, an action button with sprite `wb_spacing` whose click opens `ParaMenu.spacingMenu` as a popup, not in `ACTIONS`; then `bullets` and `numbers`, toggles with sprites `wb_bullets` / `wb_numbers` (gap 6 before the first), each followed by a popup (`bulletsMenu`, `numbersMenu`) opening `ListMenu.bulletMenu` / `numberMenu` under the toggle; then `painter`, a toggle (gap 6, sprite `wb_painter`) that `ToolbarBind` hands to `PaintBind.bindPainter`; not in `ACTIONS`), `LIST_TOGGLES` (`[name, query key, value, FormatApply id]`: `bullets` -> `listKind 'bullet'`, `numbers` -> `listKind 'number'` run `view.format('bullets' | 'numbering')`; kept out of `TOGGLES` and `ACTIONS` because the button names are not the ids), `BUTTONS` (row 1: style field + popup, font field (`R7`) + popup, size field (`R7;A0-9.`) + popup, `fontBigger`/`fontSmaller` (`up`/`down`), B I U S super sub toggles, colour (`wb_colour`, swatch) and highlight, the `align` radio group, indent less/more, clear), `ACTIONS` (names run as `view.format(name)`), `TOGGLES`, `ALIGNS`. `ToolbarBind.bindToolbar(view, {task, parent, height, menu, buttons = BUTTONS, dy = 0}) -> {tb, refresh, destroy}` (desktop): binds one row (its button list, its pane `dy` px down: WimpLib `Ui/Toolbar`'s `dy` option, passed to `attachPane`); one listener per row in `view.formatListeners` sets the row's controls (only those it has) from `view.query()` (mixed: let out / empty; a field being edited is not overwritten); buttons call `view.format`; popups (`FormatMenu.styleMenu/fontsMenu/sizeMenu/highlightMenu`, `Ui/ColourPopup`) open at `tb.popupAt`; Return in the size field -> `NumberField.halfPoints` -> `view.format('size', pt)` (not a number: beep), in the font field -> `FontList.findFont` (else as typed) -> `view.format('font', name)`; Return or Escape gives the caret back (`view.focus()`); `view.addPane(pane)` (its `remove()` called by `destroy`) so `view.lit` keeps the selection blue while a field has the caret (and the pane's `losecaret` redraws the window); `destroy` removes the listener and closes a popup of its own that is still open. `EditScroll` (pure): `visible(v)` (`y0 = scrollY + v.inset`), `scrollToCaret(v)` (24 px inside the visible part: never under the toolbar), `pageStep(v)` (visible height less 32; `EditKeys` scrolls exactly that and moves the caret as far, scrolling again only when the line it lands on is not all in view), `dragStep(v, sx, sy)` (auto-scroll while a drag is above the visible part or outside the window). Sprites `wb_bold wb_italic wb_underline wb_strike wb_super wb_sub wb_left wb_centre wb_right wb_justify wb_indmore wb_indless wb_colour wb_highlight wb_clear wb_style wb_spacing wb_bullets wb_numbers` (20 x 20) are drawn by `tools/moreapps/icon.mjs` `barSprites()` into `!Word.!Sprites`; a pressed button is the R5 slab pushed in with highlight colour 2, so there are no pressed variants. Refresh after a caret move on 5000 paragraphs: well under 1 ms |
| `Zoom`, `ZoomBind` | the zoom: a view transform; the layout stays at 100%. `Zoom` (pure): `ZOOMS` [50, 75, 100, 125, 150, 200], `MIN`/`MAX` 10/500, `clampZoom(pct)` (whole percent; junk 100), `step(pct, dir)`, `wheelStep(pct, dy)`, `toScreen/toLayout(x, y, z, top)` (screen x = x * z, screen y = top + (y - top) * z: `top` = `L.top`, the toolbar and ruler, not scaled), `layoutRect`, `caretOf`, `extentOf`, `zoomScroll(oldScroll, viewSize, oldZ, newZ, top = 0)` (keeps the centre of what is visible below `top`). `EditView` keeps `zoom` (a factor) and uses it everywhere: `paint` (`g.translate(0, top); g.scale(z, z); g.translate(0, -top)` over `layoutRect(rect)`: the backing store stays at `devicePixelRatio * wimp.scale`, text drawn at the canvas scale, no double scaling), `caretRect()` (zoomed, so scrolling to the caret, the Wimp's caret and the IME proxy follow), `hitAt(x, y)` (clicks and drags in `EditMouse`); Page Up/Down move the caret `pageStep / zoom` layout px; `EditScroll` works in screen px. `ZoomBind.bindZoom(dw) -> {pct, set(pct), destroy}` (desktop: `set` clamps, keeps the centre, refits, scrolls, re-places the caret and the ruler; Ctrl+wheel (`os.input.keysDown`) claims the event, the plain wheel still scrolls); `zoomMenu(dw)`. No zoom keys (Ctrl+= / Ctrl+Shift+= are subscript/superscript, Ctrl+0 is Word's paragraph spacing); per window, not saved. Ruling: the toolbar zoom popup of the plan is NOT built (the toolbar has no room; zoom lives in the window menu's Zoom submenu and on Ctrl+wheel), and no `wb_zoom` sprite is drawn. Across, `ZoomBind.set` keeps the place on the PAGE at the window's centre (`Zoom.zoomScrollX` with the page's left edge before and after `fit()`, which lays out for width / zoom and so moves the page); Ctrl+wheel goes through `Zoom.wheelAcc` (dy added up to `NOTCH` 100 = a step, at most one per `GAP` 100 ms, reset after `IDLE` 300 ms or a turn) |
| `AppWin` | `DocWindow`: window (workButton `clickdragdouble`, hiDPI canvas, both scroll bars; first width `min(page + 48, screen - 40)`; first height `max(560, min(screen height - y - 92, ceil(inset + pageH + 16)))`: a whole page under the bars where the screen has room above the icon bar (92: its 68 px and the scroll bar), never less than the old 560), `fit()` on a width change, `relayout()` (fonts arrived: a new `DocLayout` and `TextMetrics`, selection kept by `Selection.clamp(sel, doc, oldL)`), `rebuild()` (after an edit: `new DocLayout(doc, old.metrics, old)` keeps the lines of unchanged paragraph objects, then `fit()`), `d` (the `Document`, one per window) and `typing` (its `Typing`), `path` (null: untitled, `isUntitled`) and `leaf` (`SaveState.untitledName` of the open untitled documents' names), `save()`, `saveAs(path)` (`DocSave`), title `leaf *` while `d.dirty` (Save a copy does not mark it saved), `requestClose()` (the close icon's `close` event, prevented) and `revert()` (`CloseDoc`), `close()` forced, `closed`, menu (Save / Save as / Revert / Save a copy / Info / Edit / Format / Zoom / New / Close), zoom (`zb`: `ZoomBind`; `zoom` percent, `setZoom(pct)`; `fit()` lays out for `viewW()` = window width / `view.zoom` and sets the extent `Zoom.extentOf` of the layout's), the panes (`WinPanes`; `AppWin` keeps one-line delegates): the toolbar rows (`bar`, `bar2`: `ToolbarBind`, `BAR_H` high each) and the ruler under them (`rb`: `RulerBind`, `RULER_H`, `rulerOn`, `setRuler(on)`: per window, not saved); the inset is `inset()` = `ROWS * BAR_H + (rulerOn ? RULER_H : 0)`, the one value given to the layout (`newLayout`: `{top: inset()}`, also used by `rebuild` and `relayout`) and to `view.inset`; `setRuler` shows or hides the pane, lays out again (lines kept), scrolls to the caret and gives the focus back; Menu on a toolbar row or the ruler opens the window's menu, the wheel over them scrolls the document (`Ui/PaneWheel`) (`WinMenu`, with the cached Save and Info boxes) |
| `WinPanes` | (desktop through `ToolbarBind` and `RulerBind`; no `riscos` import) the panes across a document window's top, taken out of `AppWin`: `makePanes(dw)` makes `dw.bar` (row 1, `BUTTONS`, `dy` 0), `dw.bar2` (row 2, `BUTTONS2`, `dy` `BAR_H`) and `dw.rb` (the ruler, `dy` `ROWS * BAR_H`), each with the window's menu on a Menu click, and sets `view.inset`; `inset(dw)` = `ROWS * BAR_H + (rulerOn ? RULER_H : 0)`; `setRuler(dw, on)` (the pane shown or hidden, a new layout, the caret scrolled into view, the focus given back); `destroyPanes(dw)` (from `CloseDoc.destroy`). Every pane is as wide as the window (`fitWidth`: buttons that do not fit are cut off) |
| `RulerBind`, `RulerInd`, `WinMenu` | the ruler and the window menu. `RulerInd` (pure): `RULER_H` (24), `firstPara(doc, sel)` (the paragraph below), `firstIndents(doc, sel)` (`ParaInd.effective`, the indents drawn including a list level's, of the first paragraph from the selection's start: `{left, first, right}`, a leading kept block skipped, `null` with none), `textTwips(L)`, `scaleOf(L, scrollX, zoom = 1)` (the column's px times the zoom; `zoom` passed to the ruler, so ticks, markers and drags scale). `RulerBind.bindRuler(view, {task, parent, dy, menu}) -> {ruler, refresh, show(on), destroy}`: one listener in `view.formatListeners` and the parent's `moved` set the scale and markers (`RulerMath.indentMarks`, help per marker); a drag shows `RulerMath.dragIndent` of the first paragraph's indents (the document unchanged), the commit runs `view.format('indentDrag', {marker, at, textW, free})` once and every drag's `end` sets the markers again from the paragraph (so a drag that ends without a commit does not leave them where it was dragged) (`FormatPara.dragIndents`: the same function on each paragraph's own resolved indents, only the changed keys written, `firstLine`/`hanging` exclusive, one undo step); the pane is registered with `view.addPane` (it never takes the caret). Margins are display-only. Tab stops (A4.2): the same paragraph's stops (`FormatTabs.rulerStops`: own black, the style's grey) as `RulerTabs.tabMarks` after the indent markers; `add` -> `view.format('tabs', {add})` of `RulerTabs.addAt` with the selector's kind (`rb.kind`, per window, left at first; `selector` -> `nextKind`), a tab drag previews `dragTab` (or the stop gone while `remove`), its commit -> `{remove: pos}` or `{move: {from, to, val, leader}}` (nothing when dropped where it was); help per tab marker and on the selector; every gesture whose `view.format` returns false (a RangeError: stops kept raw, more than 64 own entries, a bad value) calls `ruler.beep()` and changes nothing (the markers go back on `end`). The default stops (A4.3): `RulerTabs.defaultTicks(stops, TabStops.defaultStop(doc), textTwips)` passed as the scale's `ticks` on each refresh, so a new settings root (the Tabs dialog's default, its undo) moves them. `WinMenu.windowMenu(dw)` (desktop): Save (`DocSave.save`) / Save as (`saveBox`) / Revert (`CloseDoc.revert`, shaded while untitled) / Save a copy (`copyBox`) / Info / Edit / Insert (`InsertMenu`) / Format (with `{ruler, toggleRuler}` -> a Ruler tick item at its end) / Zoom (`ZoomBind.zoomMenu`) / New (`app.newDoc`) / Close (`CloseDoc.requestClose`), the Save as, Save a copy and Info boxes cached in `dw.boxes` (`Boxes`); Save, Save as, New and Close show their keys (`Ctrl+S`, `F3`, `F2`, `Ctrl+F2`: `Keymap.labelFor` through `MacKeys.macLabel`, so `Cmd+S` on a Mac) |
| `DocKeys` | (desktop) the window's own keys, RISC OS style (Edit's and Draw's). `attachKeys(dw)` (from `AppWin`) sets `view.docCommand = (id) => docCommand(dw, id)` and `view.autoList = () => AutoFormatOpt.autoListOn(dw.app)`; `EditRun.runView` sends every `Keymap.WINDOW` id there (`undefined` without one). `docCommand(dw, id)`: `new` (F2, Ctrl+N: `app.newDoc()`), `close` (Ctrl+F2: `CloseDoc.requestClose`, the close icon's prompt), `save` (Ctrl+S: `DocSave.save`, an untitled document opens the Save box), `saveBox` (F3: the cached `DocSave.saveBox` opened as a menu with `wimp.menus.open` 50/60 px right of / below the caret (else the window's top left), the caret put in its name icon, as Edit's `openSaveBox('key')`; already open: nothing; untitled: `save(dw)`, the centred box), `sendToBack` (Ctrl+F10: `win.sendToBack()`); `find` (Ctrl+F, F4: `EditFind.openFind(dw)`), `replace` (Ctrl+H: `openFind(dw, true)`), `findNext` / `findPrev` (Ctrl+G / Ctrl+Shift+G: `EditFind.findStep`), `hyperlink` (Ctrl+K, Cmd+K on a Mac: `LinkBox.linkBox(dw)`, A6.1), `bookmark` (Ctrl+Shift+F5, Ctrl on a Mac too: `BookmarkBox.bookmarkBox(dw)`, A6.2); `attachKeys` also calls `EditFind.attachFind(dw)`. `EditKeys.keyFor` uses up the browser's auto-repeats (`ev.domEvent.repeat`) of `new`, `close`, `save` and `saveBox`: `true`, no action, so a held key acts once and does not go on to the desktop |
| `EditView`, `EditMouse`, `EditPaint`, `Keys` | the caret, selection and editing in a window. `EditView(win, L, d, typing, rebuild)`: `L` (a getter: makes the layout again first when the document changed), `sel`, `input(text)` (`Typing.type`, with `overwrite`; refused -> `wimp.beep()`), `compose(text\|null)`, `run(id)` (`EditRun.runView`: a `FormatApply` id -> `format(id)`; otherwise the pending format is dropped, then Keymap ids `undo`, `redo`, `insert` toggles `overwrite`, `selectAll`, the rest via `EditApply.run`), `undo()`, `redo()` (`EditRun.stepView`), `format(id, arg)`, `query()`, `pending`, `selRev`, `formatListeners` (`EditFormat`, below), `ensure()`, `flush()`, `destroy()`; every Document `change` marks the layout stale and asks for one `requestAnimationFrame` flush (lay out, scroll to the caret, show it), so a burst of typing is laid out once; `setSelection` is a non-edit move and calls `typing.reset()`; `setSelection(sel, {scroll})` (scrolls the head 24 px inside the edges), `setLayout(L, oldL)`, `placed()` (re-places the caret; never takes the browser focus: after a resize or when fonts arrive it must not pull the focus from a page field outside the desktop; it moves `wimp.caret.pos` only while the hidden field is not the focus owner), `focus()` (a user gesture: takes it), `key(ev)` (`EditKeys.keyFor`: true if used, `undefined` to pass the key on), `caretRect()`, `text()`, `hook()` (`EditHook`: adds `type`, `press`, `compose`, `flush`, `lines()`, `dirty`, `undoDepth`, `overwrite`, `composing`, `format(id, arg)`, `query()`, `pending`, `selRev`, `lit`; `!RunImage`'s `task.word.docs[i].toolbar` is the `Ui/Toolbar`); the caret is the Wimp's text-input caret (`wimp.setCaret(win, null, -1, {x, y, h} or null, {text: true})`), shown only while nothing is selected (no blink yet); Page Up/Down scroll by the window height less the toolbar and 32 (`EditScroll.pageStep`) and move the caret as far; `inset` (px hidden by the toolbar and ruler: scrolling keeps the caret below them, `EditScroll`), `addPane(pane) -> remove()` and `lit` (the window or one of its registered panes has the caret: the selection is drawn blue); `!RunImage`'s docs also give `ruler`, `rulerOn`, `setRuler`; Ctrl-Home/End scroll to the very top/bottom; Ctrl-A does not scroll; Escape collapses to the head. `EditMouse.attachMouse(view)`: click caret, Shift/Adjust click extends from the anchor, drag via `wimp.drag({type: 'point'})` with a 60 ms auto-scroll timer outside the window (the release position is applied too: Chrome may deliver the last moves with it), double-click word (`selectWord`), triple-click = a Select click within `os.input.config.doubleClickMs` of a double-click (paragraph), Ctrl-Select click (Cmd-click on a Mac: `view.mac` and Meta in `os.input.keysDown`, the Wimp's click has no Meta flag) on a link to a bookmark (A6.1: `LinkFind.linkUnder`, the link DRAWN under the pointer, not the one next to the caret place the click gives; its address `#name`) puts the caret at the bookmark (`BookmarkFind.findBookmark`, scrolled into view; a beep when it is not there; on a web link a plain click: links are never opened; with the Acorn button mapping (`rightIsAdjust`) the core makes Ctrl-click Menu, so the jump needs the default mapping), Menu leaves the selection alone (as !Edit). `EditPaint.paintView(L, g, rect, sel, active, {comp, overwrite})`: grey desk `#888`, white page with border and shadow, text (`DocPaint`), selection multiplied in (`#b3d4fc`, inactive `#d4d4d4`); overwrite: the grapheme after the caret shaded `#a0a0a0` (multiplied; 8 px at a paragraph end); composition: the text drawn at the head black on white over what follows (not laid out: a known limitation), underlined 2 px `#0050c8`. `Keys.command(code, {shift, ctrl, key})` (pure): Wimp code -> `{cmd, extend}` or null; the browser's key name separates Shift-Down from Page Down (both &19E) |
| `DocLayout`, `DocItems`, `DocStack`, `DocRects`, `DocPaint` | the whole document as a page-width column: `new DocLayout(doc, metrics, prev?, {top, decorators}?)` (`prev`: a laid-out layout of the same doc, metrics and text width: the lines of every paragraph object it had are reused when the reuse key agrees, `DocItems`; `top`: px above everything, for the toolbar, 0..1000, `prev`'s when not given; `decorators`: `DocStack`'s list, `prev`'s when not given, else `DECORATORS` (`[ParaSpace.spacingDeco, BorderGroups.borderDeco, SectDeco.sectDeco, FlowDeco.flowDeco]`: the band goes under a bottom border's gap and the "Page break before" rule above a top border's, each reading the gaps of the decorators before it from `acc`); `EditPaint.pageRect` starts the page below it), `layout(viewWidth) -> {w, h}` (text width `(pgSz.w - pgMar.left - pgMar.right) / 15` from the FIRST section, A4/1440 defaults, clamped 80..4000 px; page `pgSz.w / 15` centred, at least 24 px from the left; 24 px above and below; `pageH` = `pgSz.h / 15` (A4 when missing or not finite, clamped 200..20000 px) and the extent's height `height` is at least `top + 2 * PAGE_TOP + pageH` (`PAGE_TOP` 8, exported: the desk above and below the page, which `EditPaint.pageRect` uses), so a short or empty document shows a whole white page (a longer one ends 24 px below its text: no page breaks yet); the height is set in `stack()` from the items, so a layout made from `prev` has the full layout's height (`layout-prop` checks it); lines depend only on the text width, so a new view width only moves the column; `invalidate()` re-breaks every paragraph), `items` `{id, block, kind: 'p'\|'box', index, y, h, gapAbove, gapBelow, marks, deco, lines?, list?, mark?, label?}` (a `'p'` item is also PositionMap's `pl`; x in item coordinates + `left`; a kept block is one box item, `BOX` 28 px in a 40 px item, labelled `[<kind> - preserved, not shown]` (`Info.kindOf`), the caret before it (off 0, its left edge) or after it (off 1, its right edge)), `byId`, `itemAtY` (binary search on `y + h`: a y in a gap gives the item below; where items overlap, after a negative gap, the lower one from the top of its first line on), `locate(pos)`, `caretRect(pos, aff)`, `hitTest(x, y) -> {pos, affinity}` (above the first item's text: start; below the last item's: end; a box: nearer edge; in a bottom border's gap, `BorderGroups`: the paragraph above (its last line); in a section break band, `SectDeco.inBand`: the end of the block above it; in any other gap above a paragraph: its first line), `labels` (`ListNumbers.labels(doc)`, once per layout object: one pass, about 20 ms for 50,000 list paragraphs) and each `'p'` item's `list` (its Label or null, passed to `layoutPara`), `selectionRects(sel, y0?, y1?)` (`DocRects`: only items/lines in the band; 6 px paragraph-mark stubs for paragraphs whose end is selected; a box lit whole when both edges are in), `boxRect`, `paraStart/End`, `docStart/End`, `next/prevItem`; `DocPaint.paint(L, g, rect)` draws the items in rect (the border boxes' shading of all of them first, under every text, their edges last: `BorderPaint`; the grey rules and labels of breaks, bands and the page break before mark: `MarkPaint`), each with its gaps (`y - gapAbove .. y + h + gapBelow`: after `itemAtY` it steps back over items whose gap below reaches rect, so a band in a gap is drawn when only it is in rect) (a list label on its first line's baseline, in its own format, never highlighted; a section break band, `SectDeco`). `DocItems` (pure): `buildItems(L, doc, prev)` makes the items (one per block, in section order), `L.byId`, `L.labels` and records `L.styles`, `L.numbering`, `L.settings` (`doc.styles`, `doc.numbering`, `doc.rawSettings`); an item's `mark` (a paragraph's or a kept block's) is its section-end mark `{type}` (`markOf(doc, s)`, `SectMark`'s: the FOLLOWING section's type, as `w:type` says how a section starts: its `type` field, else a raw `w:type` with a string `w:val` kept in `extra`, else `'nextPage'`) when it is the last block of a section that is not the last, else null; `reuseKey(item)` -> `{block, list, mark}`, `sameKey(a, b)` (items have the same fields), `sameMark(a, b)`; prev's lines are kept when prev was laid out (`laid`) with the same metrics, doc, text width AND the very `doc.styles`, `doc.numbering` and `doc.rawSettings` objects (edits replace them, never change them), and the keys agree (the paragraph object, `LineLabel.sameLabel`, `sameMark`); a reused item (a kept block too, under the same key) keeps `deco` when the decorator lists are the same. `DocStack` (pure): `stack(L)` breaks every paragraph without lines first (`LineLayout.layoutPara` with `L.doc.styles`; so a decorator and its `keyOf` may read the lines of the items on both sides) and then stacks the items from `top + MARGIN` (24): `y += gapAbove; item.y = y; y += h + gapBelow` (`item.y` stays the top of the text; a gap belongs to no item), `L.height = minHeight(y + MARGIN)`; a decorator is `(item, L, acc) -> {gapAbove?, gapBelow?, marks?}` or null, called in list order (`acc`: what the earlier ones gave), gaps summed (not finite -> 0; `gapBelow` < 0 -> 0; `gapAbove` may be negative: space taken back, clamped so an item never starts above the first item's top nor ends at or above the end of the item before, which keeps `itemAtY`'s search), marks concatenated (drawn only, never text); the result is frozen and kept in `item.deco`, which `DocItems` carries over only under the full reuse key (block object, `sameLabel`, `sameMark`, metrics, text width, `doc.styles` / `doc.numbering` / `doc.rawSettings` identity, the same decorator list; kept blocks too) and `invalidate()` drops; a decorator that reads anything else (Word's contextual spacing reads the neighbour's style, merged borders the neighbours' borders) gives `f.keyOf(item, L)` -> a value or an array of values, worked out on every layout (keep it cheap) and compared with `Object.is` (element by element for arrays) with the one the result was made with: any difference asks every decorator again for that item; `keyOf` may read `item.deco` (the result in hand), and the keys kept with a new result are worked out once it is in `item.deco` (`BorderGroups` gives null for an item whose result has no box); with no decorators nothing is looked at. Relayout after one typed character, 50,000 paragraphs (Node, median of 15): about 7 ms with no decorators (as before the split), about 10 ms with one |
| `Selection`, `SelMove`, `DocPos` | positions `{id, off}`: a paragraph id and UTF-16 offset, or a kept block (`DocPos.blockId`: a negative id held in a WeakMap per block object) with off 0 (before) or 1 (after). `Selection` is a frozen value `{anchor, head, affinity, goalX}`: `caret`, `select`, `collapsed`, `ordered(sel, L)`, `move(sel, L, cmd, extend, pageH)` (`SelMove`: left/right by grapheme of the whole paragraph text (`DocPos.nextG/prevG`, windowed on texts over 4096 units), every item boundary one step, boxes atomic; up/down keep `goalX` and cross into the next item; home/end per line; wordLeft/wordRight; paraStart/paraEnd; docHome/docEnd; pageUp/pageDown; non-extending left/right collapse a selection to its edge; A6.2: left/right step over unseen inlines (`Kinds.unseenAt`: bookmarks, proofing marks, field codes, deletions; not a soft hyphen, which is a character for the keys: one press, deletable, as in Word) TOGETHER with the next character, Shift too, so such an inline never costs a key press: in `a[mark]b` right from 0 gives 1 then 3, and at a paragraph's edge the marks go with the paragraph mark), `selectWord` (not the space after a word), `selectPara`, `selectAll`, `text(sel, L)` (paragraphs joined by `\n`, inline wrappers as their text), `clamp(sel, doc, oldL?)` |
| `LineLayout`, `LineTokens`, `Fmt`, `Justify`, `Highlight` | (`runFmt` also gives `highlight` (CSS colour via `Highlight.highlightCss`, Word's 16 names, else null), `vert` ('sup'/'sub'/null), `dy` and `full`: super/subscript at 0.65 of the size, baseline up 0.35 / down 0.15 of the full size, the line as high as for the full size; `colour` black unless 6 hex digits; `shade`: the character shading's CSS colour or null (`BorderResolve.runShade` / `shadeCss`: the run's layers, the whole `w:shd` of the highest one); items carry `hl`, `sh` (from `shade`; null on a break's rule), `dy`; alignment is `Justify.align(line, how, maxX)`; a line grows only to keep raised/lowered text inside it; `jc` 'both': items not merged, one item per space, and `Justify.justify(line, maxX)` spreads a wrapped line's free width over the spaces between its words (not the last line, nor one ending in a break; lines with tabs or boxes, or one word, left alone; widened spaces record `js`, which `PosLine.offIn` scales by; `rangeX` ends a selection at an item's edge as the caret does); `DocPaint` draws character shading and then highlights behind a line's text, full line height, and text/underline/strike at `dy`) (`Fmt.sizeBold(styles, para, rPr, pPr?)` -> `{pt, bold}`: the one size/bold rule, shared with `Format`: no size anywhere in a heading means Word's heading size and bold unless `b` is set; `HEADING_PT`) screen layout: `LineLayout.layoutPara(para, styles, width, metrics, cache, label?, defPx?)` (tab items to their stops, `TabStops`/`TabAlign`, with `leader`; `line.bars` for bar stops; greedy line breaking; lines and items keep the UTF-16 model offsets `from`/`to` they stand for, gap-free; `shown` marks items whose drawn text is not the model text; trailing spaces hang; a word wider than the line overflows on its own line), `LineTokens.tokens` (words, `isSpace` (only U+0020 breaks and hangs), spaces, tabs, breaks and inlines with their offsets; a run boundary inside a surrogate pair moves past it), `runFmt`/`paraFmt` from the resolved properties (`paraFmt(styles, para, levelInd?)`). List labels: `layoutPara(..., cache, label?)` puts the label (a `ListNumbers` Label) on the FIRST line as `line.label = {x, w, text, f, bullet}`, not an item and in no `from`/`to` (so `lines[0].from === 0`, the caret at offset 0 is the text start `line.x`, a click left of the text gives offset 0, selections start at the text, `Justify` never touches it); it moves with centre/right alignment |
| `LineLabel` | (pure) `labelLine(label, para, styles, pf, metrics, cache, defPx?, maxX?) -> {label, textX}`: the label starts at `left + first` (the hanging space `[left - hanging, left)`), lvlJc right/center within that space when it fits; text after the suffix: tab -> `left` when the label ends exactly there, else the stop a tab in the text would go to (`TabStops.nextStop`: the paragraph's stops, `left` as the hanging stop, the default stops `defPx` from the margin; G6); space -> one space of the label's font; nothing -> at its end. Format: the first run's `rPr` (Word: the paragraph mark, not modelled) less underline/strike/highlight/vertAlign and character style, the level's `rPr` over it; a bullet keeps the paragraph font (not Symbol/Wingdings) with `"DejaVu Sans"` before the generic family (not shipped: used if the system has it, else Chromium's per-glyph system fallback finds a font with the shape; `word-lists.mjs` checks U+2022 and U+25AA draw ink). The first line is as high as the label needs. `sameLabel(a, b)` (the reuse key) |
| `TabStops`, `TabAlign` | tab stops (Batch A, A4.1), pure. `TabStops`: `resolveTabs(styles, para)` (frozen `[{pos, px, val, leader?}]` sorted: the `Styles.paraLayers` layers merged, `clear` removing, Strict `start`/`end` and `num` mapped, a raw `w:tabs` read for the screen, 256 read per layer and 64 used; cached per paragraph object + styles), `defaultStop(doc)` (twips of `w:defaultTabStop`, 720 by default, cached per settings root), `nextStop(stops, x, leftPx, defPx, maxX) -> {pos, val, leader?}`, `ownTabs(pPr)` (one layer's stops as written: the field, else a raw `w:tabs`), `barsOf(stops)`, `twipsOf(v)`, `DEFAULT_TW`, `MAX_USED` 64, `MAX_LAYER` 256. `TabAlign`: `startOf(p, end, dot?)`, `alignedEnd(p, end, dot?)`, `close(line, p, end, asLeft?)` (the pending right/centre/decimal tab widened and the items after it moved), `dotIn(group, x, metrics)`. The rules: "Tab stops (Batch A, A4.1): the rules" below |
| `FormatTabs` | the tab stop commands (A4.2), pure: `setTabs(d, typing, sel, arg, pending)` (`FormatApply` id `tabs`; `FormatPara.paraCommand`: one undo step, none when nothing changes) with one of `{add: {val, pos, leader?}}`, `{remove: pos}`, `{move: {from, to, val?, leader?}}` (each paragraph's own stop at `from` gives the kind, else `val`), `{set: [...]}` (the stops in force made exactly these, <= 64) applied to each paragraph's DIRECT stops (`directFor(doc, p, arg)`); `rulerStops(doc, p)` -> `[{val, pos, leader?, style}]`. A style stop removed is written `clear`, a direct stop equal to the style's is not written, a clear under a returning stop dropped; Strict: new left/right written start/end; `{edits: [{add} | {remove} | {set}...]}` (A4.3, the Tabs dialog: applied in turn to each paragraph's direct stops; at most `MAX_EDITS` 256; no `move` or nested `edits`); `tabOps(doc, sel, arg)` the `setProps` ops without running them (`setTabs` runs them through `FormatOps.runOps`; `TabsCommand` adds a settings change); `isRawTabs(p)`: a paragraph whose own `w:tabs` is kept raw (w14 attributes, more than 256 stops, a position beyond +-31680 or repeated: `ReadPropsMore.tabs`, final review) is never edited: the command is refused (RangeError) when the selection formats one (the Tabs dialog follows the same rule: `TabsBox` beeps at once); more than 64 own entries after the change: refused (`FormatCheck`); bad args RangeError |
| `SettingsEdit`, `TabsPatch`, `TabsCommand`, `TabsBox` | the Tabs dialogue box (A4.3: Format > Tabs..., and the Paragraph box's Tabs... button) and the default tab stop. `SettingsEdit` (pure): `defaultTabOf(root, map?)` (the first `w:defaultTabStop`'s twips, namespace-checked, or null) and `withDefaultTab(root, twips, map?)` -> a NEW settings root (or the same root when the value is already that): the first `w:defaultTabStop` copied with only its `w:val` changed (twips; points such as `72pt` when the old value had a unit, as Strict files write it), else a new one inserted after the last child named in `BEFORE` (the `CT_Settings` sequence before it, pinned to `wml.xsd` by `settingsedit.test.mjs`), with the root's WordprocessingML prefix (declared on the element when the root has only a default namespace); every other child and the root's attributes are the same objects (setDocPart values are immutable), so the written part differs only in that element; twips outside `TabStops.MIN_TW..MAX_TW` (36..31680) RangeError. `TabsPatch` (pure): the box's state, never changed in place: `start(stops, def)`, `setStop(st, {pos, val, leader})` -> `{st}` or `{bad: 'pos' | 'full' | 'kind' | 'leader'}` (pos a whole number in -22..22 inches; leader undefined keeps the stop's own; no 65th stop), `clearStop`, `clearAll`, `choices(st)` (the popup: `'p<pos>'` ids, `'1" Left, dots'`; `(none)`), `stopOf`, `placeOf(st, pos, picked?)` (a field holds hundredths of an inch: a typed or picked value that shows as a stop's position means that stop), `clearedText`, `patch(st, def)` -> `{patch: {tabs?: {edits}, defaultTab?}, bad}` (edits: `{set: []}` after Clear all, then one add or remove per position; the default compared as the field shows it; `bad: ['deftab']` outside 36..31680 twips). `TabsCommand` (pure): `tabsBox(d, typing, sel, {tabs?, defaultTab?}, pending)` (`FormatApply` id `tabsBox`): the settings `setDocPart` (only when the root changes) and `FormatTabs.tabOps` in ONE `runOps` (typing.command + atomic: one undo step, all or nothing; the default alone is only the `setDocPart`); a default for a document without a settings part is refused (creating the part is out of scope). `TabsBox` (desktop, imports `wimp` for the beep): `tabsBox(dw, {done}?)` (`done(before, after)` after each OK that changed the document, with `where(view)` (the selection's ends and `d.stateId`, also exported for `ParaBox`) before and after it, until the next call; key `'tabs:' + dw.docKey`, in `dw.boxes` as `'tabs'`, Cancel and OK): Default tab stops (a length; shaded when no settings part was read, showing 0.5"), Tab stop position + a popup of the first paragraph's stops in force (`FormatTabs.rulerStops`), Alignment radios (Left Centre Right Decimal Bar: the only way to set a bar stop), Leader radios (None Dots Dashes Line), Set / Clear / Clear all (row buttons, the document unchanged until OK), "To be cleared"; fields never clamp (min/max 1e9: `TabsPatch` refuses with a beep); OK sets the position typed (as Word), then one `view.format('tabsBox')`; refused by the command (more than 64 own stops) -> beep, box kept; a selection holding a paragraph whose stops are kept raw: Set / Clear / Clear all / OK with a position beep at once (the default alone still goes in); the selection, the document (`stateId`) or the doc changed while open: OK beeps and refills. `RulerBind` draws the default stops from the same `TabStops.defaultStop`. Tests: `tabspatch.test.mjs`, `settingsedit.test.mjs`, `word-tabs.mjs` |
| `ParaSpace`, `ParaMenu`, `SpacingRaw` | line spacing and the space between paragraphs. `ParaSpace` (pure): `lineBox(pf, px, up?, down?) -> {h, base, clip}` (`LineLayout`'s `finish()` uses it for every line: `auto` 1.25 px times `factor` with the baseline 0.27 px above the bottom, grown for raised/lowered text; `atLeast` as auto at factor 1, then at least `lineTw / 15` px with the extra above the text; `exact` `lineTw / 15` px, baseline at 0.8 of it, `clip` when the text is higher (`line.clip`: `DocPaint` cuts the line's drawing to its box, as Word does); `lineTw` clamped to `MIN_LINE`..`MAX_LINE` 2..2112 px (1584 pt, Word's most), 240 twips when missing; auto's `factor` stays clamped 0.5..4 by `Fmt` although Word allows up to 132 lines: the Paragraph dialog, `ParaPatch`, refuses an At outside it), `contextual(prev, next) -> {cutAfter, cutBefore}` (Word's "don't add space between paragraphs of the same style": only between one style id, and each paragraph's own `contextualSpacing` drops its own space: prev's after, next's before), `contextualOf(styles, para)` (the resolved flag: the last layer that sets it), `rawSpacing` (re-exported from `SpacingRaw`), `spacingDeco` (the one entry of `DocStack.DECORATORS`: a negative `gapAbove` of `cutAfter + cutBefore` on the second paragraph, the space read back from the laid-out lines (`lines[0].y` before, `h - (last.y + last.h)` after); `spacingDeco.keyOf` is the block object above, so a change to the neighbour asks again; costs about 1 ms per relayout of 50,000 paragraphs, Node). `Fmt.paraFmt` gives `lineRule` ('auto' / 'exact' / 'atLeast'), `lineTw` (the line in twips or null) and `contextual`. `ParaMenu` (desktop): `spacingMenu(view, {options}?)` -> Menu `Line spacing`: 1.0 1.15 1.5 2.0 2.5 3.0 (`lineSpacing` with the factor; ticked when the whole selection has it with rule auto; keys Ctrl+1, Ctrl+5, Ctrl+2), Add / Remove space before (240 / 0; Add shaded when every paragraph has some, Remove when none has; Add's key Ctrl+0), Add / Remove space after, `Line spacing options...` (`options()` when given: the Paragraph box, `ParaBox`; shaded without). It is `FormatMenu`'s `Line spacing >` and the toolbar button's popup. `Format.query` also gives `contextual`, `keepNext`, `keepLines`, `widowControl`, `pageBreakBefore` (true / false, mixed null). `FormatPara.explicit` writes `keepNext keepLines widowControl pageBreakBefore contextualSpacing` (null where the style gives the same, absent counting as off, except `widowControl`, on by default as in Word, so turning it off writes `w:val="0"`) and writes `line` and `lineRule` together, never one alone. `StylesBuiltin`: List Paragraph has `contextualSpacing` (Word's). `SpacingRaw` (pure): a `w:spacing` the model keeps raw (autospacing, `beforeLines`, another namespace's attribute; matched by namespace, not by local name: prefix `w` as the writer binds it, or the element's own `xmlns`, so a foreign `x:spacing` (or a `w:spacing` whose own `xmlns:w` is foreign, also left alone by `PropNames.withoutRaw`) is never shown, patched or dropped, and attributes of another namespace on a `w:spacing` are neither read nor changed; with several `w:spacing` elements in one pPr the first is read and patched and none becomes the field, the reader keeping them all raw): `rawSpacing(pPr)` (what it says for the screen and `Format.query`, merged by `Styles.resolvePara` into `spacing`: before/after/line clamped 0..31680, lineRule; `w:beforeAutospacing` / `w:afterAutospacing` on show as `AUTO_TW` 280, 14 pt), `spacingNode(pPr)`, `patchSpacing(pPr, set)` (only the attributes set change, in place; setting or clearing `before` also drops `beforeAutospacing` and `beforeLines`, `after` likewise, and nothing else; when what is left is exactly what the reader takes as the field, the field instead: `{spacing}`, else `{extra}` with the new node where the old one was). |
| `ParaPatch`, `ParaBox` | the Paragraph dialogue box (Format > Paragraph..., and Line spacing options... in `ParaMenu`, from the Format menu and the toolbar's line spacing popup). `ParaPatch` (pure): `fill(q)` -> the box's values from a `Format.query` (names `NAMES`: `align left right special by before after spacing at noctx widow keepnext keeplines pagebreak`; lengths in twips, `at` in lines for Multiple and points for At least / Exactly; a mixed (null) value is `undefined`: an empty field, an option off); `patch(values, q)` -> `{patch, bad}`: the `FormatCheck.paraPatch` of what changed, compared with `fill(q)` as the fields show them (so a length shown rounded is not a change; an untouched mixed field is left alone), `firstLine` / `hanging` exclusive (None is `firstLine` 0; By empty is half an inch; By over a mixed Special is ignored), Single 240, 1.5 lines 360, Double 480, Multiple `at * 240` auto (empty: 3), At least / Exactly `at * 20` `atLeast` / `exact` (empty: 12 pt); `bad` names the fields refused (text that is not a value where it counts; At outside `LIMITS` `{lines: [0.5, 4], points: [1.5, 1584]}`, what `Fmt` and `ParaSpace.MAX_LINE` draw) and then `patch` is `{}`. `ParaBox` (desktop, imports `wimp` for the beep): `paraBox(dw)` builds the box with WimpLib `Ui/Dialog` (key `'para:' + dw.docKey`, so one box per document, registered in `dw.boxes` for `CloseDoc` to delete; Cancel and OK; nothing without a selection), fills it from `view.query()` when it opens (the query is kept for OK), shades By for None and At for Single / 1.5 / Double, puts the usual At in when the kind of spacing changes, and on OK runs `view.format('paraBox', patch)` (one undo step; none for an empty patch; a refused field beeps, keeps the box and puts the caret in it); Cancel / Escape / OK give the caret back to the document. If the selection or the document changed while the box was open (`TabsBox.where`: the selection's ends and `d.stateId`, so a key, the toolbar, a menu or the ruler counts; final review), OK beeps and refills it from the new selection (keeping it open); a change made by OK in the Tabs box opened from its own `Tabs...` button, from the state the Paragraph box shows, does not count (`tabsBox(dw, {done})` reports `where` before and after each OK that changed the document). At is read unclamped (field max 100000) and `patch` refuses it outside `LIMITS`: for the A1.7 guide, Multiple takes 0.5 to 4 lines, At least and Exactly 1.5 to 1584 points (a bigger number beeps and the box stays). `FormatApply` id `paraBox` -> `setPara`. A row button `Tabs...` (A4.3) opens the Tabs box (`TabsBox`), the Paragraph box staying open as it is. `FormatMenu.formatMenu(view, {ruler, toggleRuler, paragraph, tabs})` has `Paragraph...` and `Tabs...`; `ToolbarBind` takes `paragraph` for the popup (`WinMenu` and `WinPanes` pass `paraBox(dw)`). Tests: `parapatch.test.mjs` (including every key really written by `FormatPara.explicit` and an undo step), `word-parabox.mjs` |
| `PositionMap`, `PosLine` | offsets <-> places in one laid-out paragraph `pl = {para, y, h, lines, metrics}`: `caretRect(pl, off, aff)`, `hitTest(pl, x, y)`, `lineOf`, `lineStart`/`lineEnd` (End leaves out spaces hanging at a soft wrap, sits before a break), `vertical(pl, off, aff, dir, goalX)` (null past the first/last line), `selectionRects(pl, from, to)`. At a soft wrap an offset has two places by affinity (`'up'` end of the upper line, `'down'` start of the lower); atomic items (tab, box, hyphen, unseen, wrapper text) give the nearer edge; a wrapper's offset `i+1` is after its last piece, a line of only later wrapper pieces has no caret place; Up/Down fall back to the other edge of a hit wrapper piece so they never dead-end. Lines carry `x` (start after indent and alignment) for empty lines. Long items are measured with `widthTo`/`offsetAt` |
| `Edit`, `EditDel`, `EditPara`, `EditRange`, `EditPos` | the editing commands, pure, no layout: each `(d: Document, sel: Selection, ...) -> Selection` applies ONE `d.group` (one undo step) and returns a caret (affinity `'down'`, no `goalX`), or `sel` unchanged when nothing happens. `Edit`: `typeText(d, sel, text, {overwrite, key, rPr, rStyle})` (`rPr`/`rStyle`: the pending format, merged into the new text's format only (`Pending.applyTo`); `\r\n`/`\r` -> `\n`, other controls and U+FFFC dropped, lone surrogates -> U+FFFD; `\t` stays a tab character in the text (the reader's form of `<w:tab/>`), `\n` splits (bulk: `restoreBlock` + `insertBlocks`); over a selection the first selected character's format; `{coalesce: key}` unless `\n`/`\t`; a kept block's edge gets a new empty paragraph; a document with no blocks: refused), `overwrite` (replaces as many graphemes as typed, not past the paragraph end, a U+FFFC, a tab or a line break), `splitPara` (`EditPara.splitAt`: an empty list item (`ParaInd.listOf`: one with a label, style numbering included) ends the list: direct `numPr` (raw too) removed, or `numId 0` when the style gives the numbering; an empty paragraph with `numPr` but no label (numId 0, unknown numId) splits; at the end the style's `next` when it names another paragraph style, else Heading 1-9/Title by id or name -> default style), `lineBreak` (a `\n` character in the text, the reader's form of a plain `<w:br/>`: typed tabs and line breaks are the same model before and after a save; older `tab`/`br` inlines still read, display and write), `insertTab`. `EditDel`: `deleteBack`, `deleteForward` (grapheme clusters; merge at paragraph edges, not across sections; next to a kept block the first press returns the block selected, the second deletes it), `deleteWordBack/Forward` (`Segment.prevWord/nextWord`), `deleteSelection`; A6.2: Backspace, Delete and the word forms never delete an unseen inline (`Kinds.unseenAt`): they look past the ones next to the caret and delete the character or word beyond, keeping every unseen inline inside what they delete (one undo step); with only such inlines between the caret and the edge they join the paragraphs (inlines kept); from a table's edge a paragraph holding only such inlines counts as empty and is removed (`Kinds.onlyUnseen`). `EditRange`: `deleteRange` (A6.2: a bookmark mark in the range whose partner is outside it is put back where the range was: `BookmarkKeep`; cut the ends, `removeBlocks` per section, merge the ends; 40k of 50k paragraphs in a few ms; section breaks are never removed: removing one by deleting across it is not supported yet (the ops exist, `OpsSect`, but no editing command uses them yet), so a section the range empties gets one empty paragraph in the same undo step and stays reachable, and so does one it leaves ending with a kept block (not the last section: the paragraph that carries the section break, which the writer would otherwise add, so the file would read back with one paragraph more)), `mergeAt` (merge rule: the first paragraph keeps id/pPr/pStyle unless it is empty and the second is not, then the empty one is removed), `paraBy`. `EditPos`: `findBlock`, `neighbour`, `atIndex`, `checkPos`, `orderedPos(doc, sel)` (document order without a layout) |
| `Typing`, `Keymap` | pure. `new Typing(d, {now, pauseMs = 1000})`: `type(sel, text)` (`type(sel, text, {overwrite, rPr, rStyle})`: `Edit.typeText` with key `'typing'`; a new undo step on the first call after `reset()`, after a pause over `pauseMs`, when the caret is not where the last typing ended, or for the first non-space after a space, so "hello " and "world" are two steps; `\n`/`\t` text and typing over a selection are never joined; typing given a pending format (`rPr` or `rStyle`) starts a new step, and the typing after it joins it, so a word typed after Ctrl-B is one step), `command(fn)` (`d.breakCoalesce()`, then `fn()`), `reset()`. `Keymap`: `bind(rows)` of `{id, keys: ['Ctrl+Z'], label, menu}`, `lookup({code, key, shift, ctrl, alt})` -> id or null (ids `enter shiftEnter backspace delete ctrlBackspace ctrlDelete tab shiftTab insert undo redo selectAll`, and `cut copy paste` (Ctrl+X, C, V: Edit menu labels only, `EditKeys` passes them on so the browser fires its clipboard events; no Ctrl+Shift rows); `shiftTab` is Shift+Tab, code &19A on the bare path; Ctrl-Tab and Alt-Tab stay null; and the Format rows (`menu: 'Format'`) `bold` Ctrl+B, `italic` Ctrl+I, `underline` Ctrl+U, `alignLeft` Ctrl+L, `alignCenter` Ctrl+E, `alignRight` Ctrl+R, `alignJustify` Ctrl+J, `clearFormat` Ctrl+Space, `superscript` Ctrl+Shift+= (or `+`), `subscript` Ctrl+=, `fontBigger` Ctrl+Shift+> (or `.`), `fontSmaller` Ctrl+Shift+< (or `,`), `indentMore` Ctrl+M, `indentLess` Ctrl+Shift+M, `lineSingle` Ctrl+1, `lineDouble` Ctrl+2, `line15` Ctrl+5, `spaceBefore12` Ctrl+0, `bullets` Ctrl+Shift+L (Word's, a Mac too: `MacKeys` never maps Cmd-Shift-L, Safari's sidebar; the browser names them `1`...; on a Mac too it is Ctrl, as `MacKeys` never maps Cmd+digit, the browser's tab switch); the window rows (`menu: 'Window'`, ids in `WINDOW`, run by `DocKeys`) `new` F2 / Ctrl+N, `close` Ctrl+F2, `save` Ctrl+S, `saveBox` F3, `find` Ctrl+F / F4 (the menu label is Ctrl+F), `replace` Ctrl+H (with a key name only: the bare code 8 stays Backspace), `findNext` Ctrl+G, `findPrev` Ctrl+Shift+G, `sendToBack` Ctrl+F10, `hyperlink` Ctrl+K (A6.1: the Hyperlink box; Cmd+K on a Mac); `undo` also F8 and `redo` F9 (Edit's keys; F1, F5-F7, F10-F12 and other Shift forms have no row); key names may be any printable ASCII character, `Space` or a function key `F1`..`F12` (on the bare-code path &181..&189 and &1CA..&1CC, +&10 Shift, +&20 Ctrl); on the bare-code path codes 1..26 are Ctrl-letters except 8, 9 and 13 (Backspace, Tab, Enter), so Ctrl-I and Ctrl-M work only with a key name; the browser key name and flags decide, the Wimp code alone only without a name; Alt and unmapped keys give null so the key propagates; movement and Ctrl-A stay with `Keys`), `labelFor(id)` (Word style `Ctrl+Z`, `Ctrl+F2`; not RISC OS's `^F2`), `row(id)`; `keymap` is the default table (Ctrl+Y and Ctrl+Shift+Z both redo) |
| `Format`, `FormatSet`, `FormatPara`, `FormatOps`, `FormatEff`, `FormatCheck`, `Pending` | formatting, pure. `Format.query(doc, sel, pending?)` -> `{bold, italic, underline, strike, size (pt), family, color ('RRGGBB'/'auto'), highlight, vert, align, indentLeft, indentFirst, indentRight, spaceBefore, spaceAfter (twips), lineSpacing {line, rule}, style, contextual, keepNext, keepLines, widowControl, pageBreakBefore, listKind ('bullet'/'number'), listEntry (a `ListGallery` id), charShade, paraShade (the shading in force, `{val, color?, fill?}` whole from the highest layer giving one, or `'none'`), borders (the sides drawn, `{top?, left?, bottom?, right?, between?}` of model sides, `{}` for none: `BorderResolve`)}` from the resolved formatting (the list values from `ListMake.listFacts`, `null` for a paragraph in no list as for mixed ones) (a raw `w:spacing` counts: `SpacingRaw`; `widowControl` is on unless some layer turns it off, Word's default), `null` when mixed; a caret: the format typed text gets there plus `pending`. `FormatSet` commands `(d, typing, sel, ..., pending?) -> {sel, pending}`: `toggle(key)` (bold italic underline strike superscript subscript; Word's rule: all have it -> off, else on), `setChar(patch)` (`FormatCheck.charPatch`: b i u strike sz color highlight vertAlign rFonts), `sizeBy(steps)` (`stepSize`: Word's list 8..72, then tens to 400), `clearFormat`, `applyStyle(id)` (paragraph or character style; unknown id: RangeError), `setPara(patch)` (jc, ind, spacing, the flow flags; firstLine/hanging exclusive; `line` and `lineRule` always written together; a raw `w:spacing` patched in place: `SpacingRaw`), `indentBy(twips)` (from the left indent drawn: `ParaInd`), `clearParaFormat`, `setList`, `listParas` (`FormatList`); a caret: character commands change nothing and return the new pending format, paragraph commands format its paragraph; a selection: one undo step (`typing.command` + `d.atomic`), pending cleared; values equal to the style's are removed (`null`), others explicit (`b:false` in a heading; bold compared as `Fmt.sizeBold` shows it, and a size change that would switch the heading-bold rule writes `b` so the text stays as bold as it was; `szCs` against the inherited `szCs`; `firstLine`/`hanging` as one value: `firstLine: 0` cancels a style's hanging; both at once refused). Only paragraph/character style ids are accepted by `applyStyle` (table/numbering: RangeError). A value equal to the style's still makes an op when a raw element of that name is in `extra`, so it is replaced (`FormatOps.changes` follows `setProps`, including a raw `w:pStyle`/`w:rStyle` when the style is set or removed). A size is removed only when the style chain gives that very size; where no style gives one it is always written (Word shows 10 pt there, !Word assumes 11 pt, so the file says what was chosen: 11 pt in such a document is `sz` 22); a size change sets `b` to what keeps the text as bold as it was, removed when the rest gives it (so `{sz: null}` in a heading leaves no `b: true`). Character formatting skips the U+FFFC of a level-`p` inline (a hyperlink, a kept run, a bookmark: `FormatOps.pieces`): the writer puts such an inline outside any run, so a format on its run could not be saved (found by `format-roundtrip.test.mjs`); `Format.query` and the toggle rule skip it too. `FormatOps`: `touched(doc, sel)` (paragraphs and selected ranges; kept blocks skipped; a last paragraph reached only at offset 0 gets no paragraph formatting), `buildOps` (one `setProps` per paragraph, or per stretch of runs formatted alike; runs it would not change get none). `FormatCheck`: `charPatch` (also `shd {val, color?, fill?}`), `paraPatch` (also `keepNext keepLines widowControl pageBreakBefore contextualSpacing` true/false/null, `spacing.lineRule`, `tabs` (at most `MAX_TABS` 64 stops, positions clamped to +-31680, none twice at one position, a new array in the order given), `pBdr` (sides `{val, sz 0..96, space 0..31, color, shadow, frame}` or null), `shd`; no command sends the new keys yet and `FormatPara.explicit` writes only `jc ind spacing`) (checks the patch a command may carry: a bad key or value is a RangeError), `HIGHLIGHTS` (the highlight names). `Pending`: `merge`, `isEmpty`, `forTyping`, `styleFor`, `applyTo`, `onRun`. 50,000 paragraphs: bold 0.13 s, alignment 0.1 s, undo of both 24 ms (the rules and numbers below) |
| `EditKeys`, `EditInput`, `EditMenu`, `EditApply` | editing in the window. `EditKeys.keyFor(view, ev)` (pure): `MacKeys.macKey(ev, view.mac)` first (Cmd as Ctrl on a Mac), then `Keys.command` (movement, Ctrl-A, Escape), then `Keymap.lookup` -> `view.run(id)` (a repeat of `new`, `close`, `save` or `saveBox` is used up: `DocKeys`), then a printable key that still arrives as `key` (the proxy lost the browser focus, or `Wimp_ProcessKey`) is typed: exactly one character (not a C0/C1 control), and none of Ctrl, Alt or Meta (Cmd: a browser shortcut such as Cmd-C is never text; Ctrl and Alt are read from the Wimp event's flags, and Ctrl, Alt and Meta from the DOM event's `ctrlKey/altKey/metaKey`: the Wimp event has no Meta flag), and not an event whose DOM target is the text-input field while it has the focus (`view.fromProxy(ev)`, made by `EditInput`: such a key was not typed there, so it is not text); anything else `undefined`, so the key goes on to the desktop (F1, F5-F7, F10, F11, Shift- and Alt- forms, Ctrl-Q, Alt-letters, other Cmd-letters; F12 and its forms never reach the window: the Wimp takes them first). The routing order is therefore: `Keys.command` (movement, Ctrl-A, Escape), `Keymap.lookup` (editing), the printable fallback. `EditInput` also holds `showCaret(v, take)` (the Wimp's caret at `v.caretRect()`, zoomed: the proxy field and an input method's candidates follow it), `inputView(v, text, {composed})` (a single space may then run `AutoList.afterSpace`: see the AutoList row) and `composeView(v, text)` for `EditView`. `EditInput.attachInput(view)` (the proxy contract is in `docs/CORE_API.md` 3.1/3.2: committed text, composition, composition end; plain printable keys never arrive as `key` while the field has the focus; Backspace, Delete, Enter, Tab, arrows and Ctrl/Cmd keys do): `textinput` -> `view.input` (one event is one edit and one undo step, however long, at most 100,000 characters), `composition` -> `view.compose(text)`, `compositionend`/`losecaret` clear it; events for a closed window are ignored; `view.lateCommit` (`{text, at}`, set by `DocSave` when a save types the composing text itself): the next `textinput` equal to it within `LATE_MS` (800 ms) is dropped once; any other `textinput`, `composition`, `key`, `click`, `doubleclick`, `drag` or `losecaret` clears it (`first` handlers), so the same text typed on purpose is kept. `EditMenu.editMenu(view)`: Undo `Ctrl+Z`, Redo `Ctrl+Y` (shaded by `canUndo`/`canRedo`), Cut `Ctrl+X`, Copy `Ctrl+C` (shaded without a selection), Paste `Ctrl+V` (never shaded; `EditClip`), Select all `Ctrl+A`, Find... `Ctrl+F`, Find next `Ctrl+G`, Find previous `Ctrl+Shift+G`, Replace... `Ctrl+H` (never shaded; each `view.run(id)` -> `DocKeys` -> `EditFind`; F4 named in Find...'s help), Word count... last (no key, A6.4: `editMenu(view, {count})`, shaded without a selection: `CountBox`), labels from `Keymap.labelFor` (Undo and Redo keep Word's labels; F8 and F9 also undo and redo, named in their help). `EditApply` (pure): `run(id, d, typing, sel, {autoList, arg}?)` (enter shiftEnter backspace delete ctrlBackspace ctrlDelete tab shiftTab through `typing.command`; tab, shiftTab and backspace via `EditList`; shiftTab outside a list `undefined`; backspace, delete, ctrlBackspace and ctrlDelete first try `SectBreak.deleteBreakAt` (at a section edge: the break removed, a step of its own, the caret stays; the next press merges paragraphs as before); any other id goes to `InsertApply.insert` (`pageBreak`, `sectionNext`, `sectionContinuous`), `undefined` when it is none of its ids either; with `autoList`, `AutoList.afterSpace` after a `tab` at a caret), `stepEnd(doc, ops, oldL)`: the caret after undo/redo from the last leaf op applied, over all the change's ops with compounds opened (setDocParts and setSections skipped) (spliceText/replaceText: `at` + inserted length; restoreBlock: where the restored paragraph first differs from the one of that id in `oldL`, so undoing Enter goes back to the split point; splitBlock: start of the new paragraph; insertBlock(s): start of the first; removeBlock(s): end of the block before the gap; mergeBlock/setProps: start of that paragraph; splitSection/mergeSection: start of the paragraph at the split, for a merge the section-end mark found in `oldL` (else the section's first block); a setDocPart or setSection is skipped (the op before it decides; only those: `null`, the selection stays)) |
| `BreakMarks`, `InsertApply` | page and column breaks (Batch A, A3.1), pure. `BreakMarks`: `isPageBreak(x)` (a `br` inline of `brType` `page` or `column`; any other `br` is a line break), `breakLabel(x)` (`'Page break'` / `'Column break'` / `''`), `pbToken(x, i, f)` (`LineTokens`' `'pb'` token: kind `'pagebreak'`, `[i, i+1)`, shown, `label`), `ruleFit(x, maxX, real) -> {wrap, w}` (the rule runs from where the text ends to the line's end, at least `MIN_RULE` 90 px; less left on a line that holds something: wrap first), `ruleLit(it)` (selected, only the first `LIT` 8 px are lit), `rulePaint(it, labelW)` (`DocPaint`'s dots either side of the label, the label centred; no room: dots only). `LineLayout` places the `'pb'` token: the line ends there (`endsWithBreak`); a break followed by nothing but unseen inlines ends the paragraph on that line (no empty line after it: the paragraph mark shares the rule's line, as in Word), so `PositionMap.lineEnd` on the last line is the paragraph end; the item has `hl` null and `label`; `line.ink` is the rule's end (alignment never moves it). `InsertApply`: `insert(id, d, typing, sel, arg)` (the Insert menu's ids through `typing.command`: one undo step; unknown ids and no selection `undefined`; ids looked up in a `Map`), `pageBreak(d, sel)` (one `d.atomic`: the selection deleted, a table edge given an empty paragraph, `replaceText` of a U+FFFC with `{kind: 'br', level: 'r', brType: 'page'}` (no node; written `<w:br w:type="page"/>` in a run with the format of the text before it), then `EditPara.splitAt` after it (Word 2013's form: the break ends its paragraph; the new paragraph has a fresh id, the same pPr and pStyle, so a list goes on; after a heading the next style); caret at the new paragraph's start). `EditApply.run` passes any id it does not know to `insert` (with `{arg}`); `Keymap` row `pageBreak` `Ctrl+Enter` (menu `Insert`). A5.3 adds `nbsp`, `nbHyphen` and `softHyphen` to `InsertApply` (below) |
| `SectBreak`, `SectDeco`, `SectMark` | section breaks (Batch A, A3.2), pure. `SectMark` (no editing imports, for the layout): `markOf`, `sectLabel` (below; `SectBreak` re-exports them). `SectBreak`: `insertSection(d, typing, sel, type)` (`type` `nextPage`, `continuous`, `evenPage` or `oddPage`, else `undefined`; one `typing.command` + `d.atomic`: the selection deleted, a table edge given an empty paragraph, the paragraph split (`EditPara.splitAt`) or an empty one used, then `splitSection` with the old section's props/raw (a copy: the section before the break) and `setSection` giving the section after it the original sectPr with `type`; caret at the start of the block after the break), `deleteBreakAt(d, sel, dir) -> sel \| undefined` (Delete, dir 1, at the end of a section's last paragraph; Backspace, -1, at the start of the next section's first block: `mergeSection` and, when the types differ, `setSection` with the earlier section's type; `undefined` anywhere else and when the earlier section ends with a kept block), `markOf(doc, s) -> {type} \| null` (`DocItems`' mark), `sectLabel(type)` (`'Section break (Next page)'`, `(Continuous)`, `(Even page)`, `(Odd page)`, `(Next column)`, anything else `'Section break'`; a `Map`). `SectDeco`: `sectDeco(item)` (the `DocStack` decorator: an item with a mark gets `gapBelow` `BAND` (18) and a mark `{kind: 'section', type, label, dy: 0, h: 18}`; no `keyOf`: the mark is in the reuse key), `bandOf(item)`, `inBand(item, y)` (`DocLayout.hitTest`), `bandPaint(mark, w, labelW) -> {y1, y2, dots, label}` (`DocPaint`'s double dotted rule, the label centred with 6 px round it, none when it does not fit). `InsertApply` ids `sectionNext`, `sectionContinuous` (`Keymap` rows without keys, menu `Insert`: the menu itself is A3.3) |
| `InsertMenu`, `FlowDeco` | the Insert menu and page break before (Batch A, A3.3). `InsertMenu` (desktop: imports `'riscos'`): `insertMenu(dw) -> Menu('Insert')`, the window menu's item after Edit (`WinMenu`): Page break (`Ctrl+Enter` from `Keymap.labelFor('pageBreak')` through `MacKeys.macLabel`, which leaves it `Ctrl+Enter` on a Mac too; runs `view.run('pageBreak')`), Section break > (`sectionMenu(view)`: Next page, Continuous, no keys; `view.run(id)`), then Symbol... (A5.3: `SymbolBind.openSymbols(dw)`), Special character > (A5.3: `specialMenu(dw)`, the 16 items of `SpecialChars` with the keys of `nbsp` and `nbHyphen` from `Keymap` through `macLabel`; each `insertSpecial(dw, item)`), then Hyperlink... (A6.1: `key` from `Keymap.labelFor('hyperlink')` through `macLabel`, `Ctrl+K` / `Cmd+K`; opens `LinkBox.linkBox(dw)`) and Bookmark... (A6.2: `Ctrl+Shift+F5`, also on a Mac; opens `BookmarkBox.bookmarkBox(dw)`). Every item is shaded without a selection. `FlowDeco` (pure): `breaksBefore(styles, para)` (the last `paraLayers` layer with a boolean `pageBreakBefore`), `flowDeco(item, L)` (the DocStack decorator: `{gapAbove: 12, marks: [{kind: 'flow', label: 'Page break before', dy: -12, h: 12}]}` for a paragraph with the flag, else null; no `keyOf`: it reads only the paragraph and `doc.styles`, both in the reuse key), `flowMark(item)`, `flowPaint(mark, w, labelW)`, `GAP`. `ParaSpace.spacingDeco` returns null for a paragraph with the flag (no contextual cut across a page); `DocPaint.paintFlow` draws the single grey dotted rule in the gap |
| `BorderResolve`, `BorderGroups`, `BorderPaint`, `MarkPaint` | paragraph borders and shading, character shading, on the screen (Batch A, A5.1), pure. `BorderResolve`: `paraBorders(styles, para)` / `bordersOf(layers)` -> `{pBdr, shd}` (each side from the highest `Styles.paraLayers` layer giving it, WHOLE; `shd` whole from the highest layer: not `mergeInto`'s attribute-by-attribute merge, which `resolvePara` still does), `runShade(styles, para, run)` (`Styles.runLayers`), `shadeCss(shd)` (clear: the fill; solid: the colour; `pctN`: N% of the colour over the fill; other patterns half and half; colour auto black, fill auto none / white under a pattern; nil none), `edgeOf(side)` -> `{style, sz, lw, t, space, color, shadow}` or null (single double dotted dashed thick drawn, any other val as single; nil / none / no good val: no side; `sz` eighths of a point clamped 2..96, 4 when missing, `lw = max(1, round(sz / 6))` px, `t` 3 lw for double; `space` points clamped 0..31, px `round(space * 4 / 3)`; colour auto black); a layer whose field is absent but whose `extra` keeps a `w:pBdr` / `w:shd` raw (theme colours, w14 attributes, Strict `w:start` / `w:end` as left / right) is read best effort (the first one matched by namespace; good `w:val w:sz w:space w:color w:fill w:shadow w:frame` only, others ignored: a theme colour shows as the `w:color` / `w:fill` written beside it); nothing raw is changed. `BorderGroups`: `boxInfo(styles, para, levelInd?)` (null without a drawn side or a fill; else frozen `{sides, fill, left, inL, right, any, breaks, k}`: inL the box's inner left edge, the left indent or the first line's when further left; indents resolved from the layers by `resolvePara`'s rule for ind, `Fmt.indentPx`; cached per paragraph object (per style when the paragraph's own pPr gives no borders, shading, indents or page break before and keeps nothing raw) for the same styles object and level indent; paragraphs that look the same share one info), `borderDeco` (the `DocStack` decorator: `{gapAbove: padTop, gapBelow: padBottom, marks: [mark]}`; results shared per info and way of joining), `k` the side definitions (every side, attribute by attribute) and the left and right indents: what two paragraphs need equal to share a box; `borderDeco.keyOf` (`[the lines (or kept block) above, below]`, null when the item's result has no box), `boxMark(item)`; the mark `{kind: 'border', inL, inR, fill, joinAbove, joinBelow, padTop, padBottom, top?, between?, bottom?, left?, right?}`. `BorderPaint`: `geometry(m, it, prev, left)` -> `{fill, edges}`, `paintFill`, `paintEdges` (edges cut to rect's rows), `edge(g, e, rect?)`. `MarkPaint` (moved out of `DocPaint`, unchanged): `paintBand`, `paintFlow`, `paintRule`. Rules: "Borders and shading on the screen (Batch A, A5.1): the rules" below |
| `BorderNames`, `BorderPatch`, `BorderExplicit`, `BorderCommand`, `BorderBox` | the Borders and shading dialogue box and commands (Batch A, A5.2). `BorderNames` (pure): `BORDER_VALS` (the 193 `ST_Border` names of wml.xsd, schema order) and `SHD_VALS` (the 38 `ST_Shd` names): `FormatCheck` accepts only these for a command's side `val` / `shd` `val` (the reader keeps any name, `ReadPropsMore.NAME`). `BorderPatch` (pure): `fill(q, apply)` -> `{setting, top, bottom, left, right, between, style, width, colour, fillkind, fill, apply}` from `Format.query`'s `borders` / `paraShade` / `charShade` (mixed or not offered: undefined), `settingOf`, `sidesOf`, `patch(values, q) -> {id, arg, bad}` (compared with `fill(q, apply)`; `id` `'borders'` with `{pBdr?, shd?}` or `'charShade'` with the shd; `arg` undefined when nothing changes), `STYLES` (single double dotted dashed thick), `WIDTHS` (2 4 6 8 12 18 24 eighths), `SIDES5`, `NAMES`. `BorderExplicit` (pure): `boxExplicit(v, res, p)` (called by `FormatPara.explicit` for `pBdr` / `shd`: whole sides and whole shading, every attribute key given, null for the absent ones, so `OpsProps.mergeProps` replaces rather than merges; null over a side the styles draw is `{val: 'nil'}`, over their shading `NO_SHADE` clear/auto/auto; a value the styles give is not written; what the styles give from `Styles.paraLayers` + `BorderResolve.bordersOf`, cached per resolver), `runShade(shd, res, p, r)` (the same for `rPr.shd`, `BorderResolve.runShade`), `isRawOwn(props, key)`, `NO_SHADE`; a paragraph's own raw `w:pBdr` (`w:shd`) refuses a change of borders (shading) with RangeError, a run's own raw `w:shd` a change of its shading. `BorderCommand` (pure): `borders(d, typing, sel, {pBdr?, shd?}, pending)` (`FormatSet.setPara`), `paraShade`, `charShade` (`FormatSet.charCommand`, now exported: the selected runs, at a caret the pending format): `FormatApply` ids `borders`, `paraShade`, `charShade`. `BorderBox` (desktop, imports `wimp` for the beep): `borderBox(dw)`, key `borders:<docKey>`, `dw.boxes` `'borders'` (CloseDoc deletes it), Cancel + OK; `FormatMenu` item `Borders and shading...` (option `borders`), `WinMenu` passes it. Rules: "The Borders and shading dialog (Batch A, A5.2): the rules" below |
| `SpecialChars`, `SymbolBind` | Insert > Symbol... and Special character (Batch A, A5.3). `SpecialChars` (pure): `SPECIAL` (frozen, menu order: Em dash `\u2014`, En dash, Non-breaking space (`cmd: 'nbsp'`), Non-breaking hyphen (`'nbHyphen'`), Optional hyphen (`'softHyphen'`), Copyright, Registered, Trademark, Section, Paragraph, Ellipsis, Single / Double opening / closing quote, Degree; an item has `ch` (typed as text) or `cmd` (a `Keymap` id for `view.run`); every `ch` is in a `CharSets` set, so in every bundled font: tested), `specialFor(text)`. `SymbolBind` (desktop: imports `'riscos'` for `beep`): `attachSymbols(dw)` (from `DocKeys.attachKeys`: the document whose window last gained the caret is the grid's `active`, cleared on `deleted`: the pattern of `EditFind.attachFind`), `openSymbols(dw)` (makes dw active and opens the task's `Ui/CharGrid`, title `Symbol`), `putChar(dw, ch) -> bool` (`view.typing.reset()`, `view.input(ch)`, `reset()` again: the typed path, so the PENDING format and a replaced selection work as for typing, but always one undo step of its own; false when the document is gone, has no selection or `stateId` did not change), `insertSpecial(dw, item)` (a `ch` and the no-break space through `putChar`; the other commands `view.run(cmd)`), `symbolsHook(app)` -> `task.word.symbols`: `{grid, active, open(), withSets(sets)}`. The grid's Insert / Return / double-click call `putChar` for the active document and then `dw.view.focus()` (the caret back for the next key); with none alive: `wimp.beep()` and the status line says `No document to insert into: click in one first.`; `onClose` also gives the caret back |
| `LinkOps`, `LinkParts`, `LinkFind`, `LinkUrl`, `LinkBox` | hyperlinks (Batch A, A6.1). `LinkUrl` (pure): `cleanUrl(text) -> {url} \| {error}` (trimmed; `www.` gets `http://`; scheme `http` `https` `mailto` `ftp` only, in lower case; `javascript:`, `data:`, `file:`, `vbscript:`, none... refused with a message; http/https/ftp need `//` and a host without spaces, mailto something after it; C0, DEL, C1 and lone surrogates refused; a space, non-ASCII (an IRI) and `" < > \ ^ \` { \| }`, a `%` not before two hex digits percent-encoded as UTF-8; at most `MAX` 2048 characters, before and after encoding), `checkAnchor(name)` (1..255 characters, no white space, `#`, controls, U+FFF9..U+FFFD or non-characters), `parseAddress(text)` (`#name` -> `{anchor}`, else `cleanUrl`). `LinkFind` (pure): `isLink(x)` (a raw level-`p` inline whose node is a `w:hyperlink`), `docMap(doc)` (`WriteBody.docScope(doc).map`, null when refused), `linkAt(doc, sel) -> {s, i, p, off, x} \| null` (the selection is the link's U+FFFC alone, or a caret next to one: the one before first), `linkInfo(doc, x) -> {text, address, tip}` (the `r:id` relationship's target, `''` when `doc.rels` has none; `#anchor` after it; `w:tooltip`), `linkRange(doc, sel) -> {o, a, z, kept} \| {error}` (one paragraph, or a caret on a kept block's edge; refused across paragraphs, over a table, and round any level-`p` inline: a link (so links never nest), a bookmark...), `selInfo(doc, sel) -> {text, plain} \| {error}` (plain: no item, tab or line break), `linkUnder(L, x, y) -> {id, off, x} \| null` (the `kind: 'link'` line item under a layout point; a later piece `[i+1, i+1)` stands for `i`). `LinkParts` (pure, taken out of `LinkOps`): `clean`, `cleanText` (an untouched field compares equal: insert keeps the selection's runs when the box's text equals its cleaned text, edit leaves text and tip whose cleaned forms are unchanged, so spaces at the ends are not a change), `target`, `withTarget`, `withTip`, `runNodes`, `styleFor`, `shown`, `linkX`, `ONE`, `inside`. `LinkOps` (pure; re-exports the four): `insertLink / editLink (d, typing, sel, {text, address, anchor, tip})`, `removeLink(d, typing, sel)` -> `{sel} \| {error}`; one undo step each (`typing.command` + `d.atomic`: `setDocPart rels` (a NEW array from `DocParts.addRel`, kind `hyperlink`, External, Strict type when `meta.conformance === 'strict'`; a new relationship per link and per address change, the old one left: an unused relationship is valid), `setDocPart styles` (`DocParts.hyperlinkStyle`, first use only), then one `spliceText`); none when nothing changes. Insert: the selected content (`OpsUtil.cut`) written as `w:r` runs by `WritePara.paraNode` with each run's format and `rStyle` set to the Hyperlink style (none when there is no style table), inside `<w:hyperlink r:id="rIdN" w:history="1">` (an `xmlns:<p>` for the relationships namespace is put on the element when the root binds none) or `w:anchor="name"` (no relationship), `w:tooltip` for a ScreenTip; text given that differs from the selection (or at a caret) is one run in the format there (`OpsText.fmtAt`), the address itself when there is no text; a caret on a table's edge gets a paragraph first (`EditRange.paraBy`); the link is one U+FFFC in a plain run, the caret after it. Edit: only fields given that differ (text: one run in the format of the link's first run; address: the old `r:id` / `w:anchor` replaced; tip: `w:tooltip` set or removed); the other attributes and children kept. Remove: the link's children read by `ReadPara.readPara` (a `w:p` made of them, in the element's scope) and spliced in its place, the Hyperlink `rStyle` dropped (other styles kept), the text selected (after a caret: the caret after it); a link starting with a `w:pPr` child is refused. Text and ScreenTip: C0/C1 controls and U+FFFC become spaces, trimmed, at most 1024 / 255. The bookmark lookups A6.1 had in `LinkMarks` (`bookmarkNames`, `linkNames`, `findBookmark`) are now `BookmarkFind`'s (A6.2, next row; `LinkMarks` is gone). `LinkBox` (desktop: imports `'riscos'` for `beep`): `linkBox(dw)` -> the WimpLib `Ui/Dialog` keyed `link:<docKey>`, kept in `dw.boxes` ('link', deleted by `CloseDoc` with the document); title `Edit hyperlink` on a link (`linkAt`), else `Insert hyperlink`; fields `text` (shaded and left out when the selection holds items, tabs or breaks, or is longer than the field; a link's text, address or tip longer than its field (1000, 1000, 255) likewise shaded and passed as unchanged, never cut short), `address` with the `marks` popup (`(none)` and `linkNames`; a pick puts `#name` in the address), `tip`, message lines `msg` / `msg2`; buttons `Remove link` (shaded unless editing), `Cancel`, `OK` (Return). Refusals (a place a link cannot go, at once on opening; a refused address; a document or selection changed while open: refilled) beep and say why in the message lines, the box kept; done: `EditFormat.dropPending`, `view.edited(sel)`, `view.focus()` |
| `Bookmarks`, `BookmarkFind`, `BookmarkKeep`, `BookmarkBox` | bookmarks (Batch A, A6.2). A bookmark is a pair of raw level-`p` inlines `<w:bookmarkStart w:id="N" w:name="name"/>` / `<w:bookmarkEnd w:id="N"/>` round the selection (a caret: the two together), each a U+FFFC in a run with the format there (`OpsText.fmtAt`, so text typed after it keeps it; the reader gives such inlines a plain run, so a file read back differs only there). `BookmarkFind` (pure; the ONE bookmark lookup, also for links): `marks(doc)` (every `bookmarkStart`/`bookmarkEnd` in document order, `{kind, name, id, s, i, off, table, direct}`: in a paragraph at its U+FFFC (inside a wrapper: the wrapper's), in a table `table: true`; `direct` when the mark is a level-`p` inline itself; the walk stops after 1,000,000 nodes, `marks.complete` false), `pairs(doc)` (one per named start; each end goes with the earliest start before it with its id that has none: two starts with one id take the ends in turn), `findPair(ps, name)` (exact, else case ignored), `list(doc, {hidden, sort})` -> `[{name, id, at: {s, i, off} \| null}]` (one per name ignoring case, the first; `_` names only with `hidden`; `sort` `'location'` or `'name'`: case ignored, by UTF-16 code units), `bookmarkNames(doc, {hidden, max = 500})`, `linkNames(doc)` (the Hyperlink box's popup: without names `LinkUrl.checkAnchor` refuses), `findBookmark(doc, name) -> {id, off} \| null` (a Ctrl-click on a link: the start's U+FFFC, a table's `{id, off: 0}`). `Bookmarks` (pure; re-exports `list`, `bookmarkNames`, `linkNames`, `findBookmark`): `checkName(name)` (null or why: a letter (`\p{L}`) first, then letters, digits (`\p{Nd}`) and `_`, 1..`NAME_MAX` 40 UTF-16 units: so `_Toc...`, `__proto__`, `1st`, spaces refused), `addBookmark(d, typing, sel, name)`, `deleteBookmark(d, typing, name, sel?)` -> `{sel} \| {error}`, one step each (`typing.command` + `d.atomic`: one `spliceText` per new mark, one `replaceText` per old mark removed, last first), none when nothing changes; `goTo(doc, name) -> {sel} \| {error}` (the text between the marks selected; a caret when they meet, when there is no end or the end comes first; a start in a table refused: "!Word cannot go there yet"). Ids: one more than the largest bookmark `w:id` (tables' XML and wrappers included) that is a whole number 0..`MAX_ID` 2^31 - 1 (others, `abc`, `-4`, `4294967296`, are passed over: they cannot clash with a smaller new id); none free: refused; a document whose walk stopped at the node limit: refused. Add: names unique ignoring case, so every bookmark of that name (case ignored: a file may have two) is removed in the same step (moved); one whose marks are not inlines of their own (in a table, inside a link) is refused; the selection may cross paragraphs and tables but not start or end at a table; adding the same name round the same text (only unseen inlines between the old and new places) is no change; the result selects the new bookmark's text. Delete removes the start and its paired end (the selection given kept, its offsets moved). `BookmarkKeep` (pure; used by `EditRange.deleteRange`, so by every range deletion: Backspace/Delete on a selection, typing or pasting over it, cut, a break inserted over it): `keptMarks(doc, o)` (the direct marks in the range whose partner (other kind, same id) exists outside it (a partner inside a table or a wrapper, a link or `w:ins`, that the range covers counts as inside: review fix), ends first then starts; `[]` without a whole-document walk when the range holds none), `putMarks(d, pos, xs)` (back at the caret the deletion returns, one U+FFFC each in the format there; when that is a table's edge (a range that ended on tables both sides), at the start of the nearest paragraph after it, else the end of the nearest one before: final review). So deleting the paragraph holding a bookmark's start moves the start to where the deletion was (Word's behaviour): a pair is never broken by an edit; a bookmark wholly in the range goes; an orphan mark (no partner anywhere) is not kept. `BookmarkBox` (desktop: imports `'riscos'` for `beep`): `bookmarkBox(dw)` -> the `Ui/Dialog` keyed `bookmark:<docKey>`, kept in `dw.boxes` ('bookmark', deleted by `CloseDoc` with the document); `name` (writable, `maxLen` 80: a longer name typed or pasted is refused with a message, never cut short) and the `names` popup (`(none)` then `list` names, at most `MAX_SHOWN` 200, a longer list says so in the message lines; a pick puts the name in the field), radios `sort` (`Name` / `Location`, Location first), option `hidden` (`Hidden bookmarks`), message lines `msg` / `msg2`; buttons `Add` (Return: `addBookmark` with `view.sel`; done: `EditFormat.dropPending`, `view.edited(sel)`, `view.focus()`, the box closes), `Delete` and `Go to` (the box stays, its popup refilled; Go to `view.setSelection`, scrolled), `Close` (Escape, the close icon: the last button). Refusals beep and say why in the message lines, the box kept, nothing changed. `Kinds` (A6.2): `BLANK` (`del`, `moveFrom`, `softHyphen`: the other inlines drawn as nothing), `unseen(x)` (UNSEEN or BLANK: exactly `LineTokens`' zero-width `'z'` items, which now use it), `unseenAt(p, k)` (used by `SelMove` and `EditDel`; false for `w:softHyphen`, which the keys treat as a character: ruling in the A6.2 review), `onlyUnseen(p)` |
| `FormatPaint`, `PaintBind` | the format painter (Batch A, A6.3). `FormatPaint` (pure): `pick(doc, sel) -> {rPr, rStyle?, pPr?, pStyle?} \| null` (a caret: `OpsText.fmtAt` there and the paragraph's format; a selection inside one paragraph: the character format of its first character, an inline written outside any run passed over; a selection that reaches its paragraph's end or goes on to the next: also that paragraph's `pPr` (`numPr` included) and `pStyle` (null when none); null on a kept block or a bad position), `paint(d, typing, sel, picked, L?) -> sel` (REPLACES: for each run piece (`FormatOps.charOps`, level-`p` inlines skipped as `pieces` does) a first `setProps` removes the fields and sub-fields the target has and the pick lacks, a second sets the pick's `rPr` (its `extra` too) and `rStyle` (null removes); the same two passes for each paragraph `FormatOps.touched` marks `para`, over `pPr` and `pStyle`, the target's raw elements that are not paragraph formatting (`PPR_FIELDS`: the mark's `w:rPr`...) kept, the pick's raw formatting ones (`w:tabs`, `w:pBdr`...) copied; ops that `changes` says do nothing are dropped, all in one `runOps` (one undo step, none without ops); a caret (a click) paints the word there (`Selection.selectWord(L, pos)`, needs `L`) and the paragraph; the selection is returned as it was). `PaintBind` (desktop): `attachPainter(v)` (idempotent; from `DocKeys.attachKeys`): `v.painter` (null, or `{picked, sticky}`), `v.painterListeners`, `v.onMouseSelect` (`EditMouse` calls `v.onMouseSelect?.()` after a click and after the end of a drag) and `v.endPainter` (`EditKeys.keyFor` calls it first on Escape and consumes the key when it ended the painter); `togglePainter(v, sticky)` (off -> pick: a beep when there is nothing to pick; on -> off, except Adjust on a once painter makes it sticky), `bindPainter(v, tb)` (the button: Select = once, Adjust = sticky; pressed follows `v.painter`), `detachPainter(v)` (`CloseDoc.destroy`: the painter off, the release it waits for forgotten with its window listener; nothing painted afterwards). Format > Format painter (`FormatMenu`, ticked while on, shaded without a selection, no key) is `togglePainter(v, false)`. The pointer keeps its shape (the desktop has no pointer API for it: noted). `TestHook`: `docs[i].painter` |
| `WordCount`, `CountBox` | Edit > Word count... (Batch A, A6.4). `WordCount` (pure): `count(doc, sel?, L?) -> {words, chars, charsNoSpaces, paras, lines, scope, partial?}` of the selection (a range; `scope` 'selection') or the whole document (a caret or no selection; 'document'): words are runs of non-white-space (white space = the Unicode White_Space but the no-break U+00A0, U+2007, U+202F; a no-break hyphen joins); each East Asian character (Han, kana but U+30FB, Hangul, Bopomofo, halfwidth forms) is a word of its own and ends the word beside it (Word's "Asian characters + non-Asian words": W1); characters are code points, a tab or a line break one each, the optional hyphen none, paragraph marks none; `charsNoSpaces` leaves out white space, U+00A0, U+2007 and U+202F; a paragraph counts when it has any character; `lines` is the layout's (`L.byId`; a selection counts the lines it touches; `null` without `L`; a table's paragraphs have no layout lines). Text: the paragraphs' text, and the XML of their level-`p` inlines (links, insertions, fields, content controls, smart tags) and of kept blocks (tables...), by one iterative walk (`w:t`, `w:tab`, `w:br`/`w:cr`, `w:noBreakHyphen`, a paragraph per `w:p`) that skips `del`, `moveFrom`, `delText`, `instrText`, `drawing`, `pict`, `txbxContent`, `object`, ruby text (`rt`), formulas (`m:`...), every property container (`*Pr`, `*PrChange`: a `w:tab` there is a tab stop) and takes only the `mc:Choice` (else the `mc:Fallback`) of an `mc:AlternateContent`, all of them within `NODE_LIMIT` (1,000,000) nodes (past it `partial` is true); a kept block lies in a selection when the selection holds it whole or runs across it. `countView(view)`. Linear: 1,000,000 words < 1 s. `CountBox.countBox(dw)` (desktop; `Ui/Dialog`, key `count:<docKey>`, kept in `dw.boxes` 'count', deleted with the document): the scope line, Words, Characters (no spaces), Characters (with spaces), Paragraphs, Lines and a note when `partial`; one button Close (Return, Escape, the close icon: the box is deleted and the caret goes back to the document); asked again while open it is refreshed and brought to the front. `EditMenu.editMenu(view, {count})` has Word count... last (no key; shaded without a selection); `WinMenu` passes `count`. `TestHook`: `docs[i].count()` |
| `InlineText` | the text an inline stands for outside the drawing (A5.3 review), pure: `hyphenText(x)` (`-` for a bare `w:noBreakHyphen`, `''` for a bare `w:softHyphen`, else null), `inlineText(x)` (tab `\t`, br `\n`, the hyphens, else the inline's display `text`, else `''`); used by `Selection.text`, `ClipSlice.paraPlain`, `ClipHtmlRun` and `FindText` (see "Symbols and special characters (Batch A, A5.3): the rules" below) |
| `ChangeCase` | Format > Change case and Shift+F3 (Batch A, A5.4), pure. `changeCase(d, typing, sel, mode, pending) -> {sel, pending}` (`FormatApply` ids `changeCase` with the mode as arg and `caseCycle`), `MODES` (`sentence lower upper title toggle cycle`; others throw RangeError before anything changes), `caseState(texts)` -> `upper \| lower \| title \| mixed`. `FormatOps.touched` gives each paragraph's selected `[a, e)`; a caret (`a === e`) takes the word at it (`Segment.wordBounds` + `DocPos.isWordText`, the word it ends counts: as double-click) or nothing; per paragraph one `spliceText` from the first to the last changed character with `OpsUtil.cut`'s old runs and inlines for that stretch and the new text (a diff trimmed so it never starts or ends inside a surrogate pair), all through `FormatOps.runOps` (one `typing.command` + `d.atomic`: one undo step, none when nothing changes). Characters are changed one code point at a time with `toUpperCase` / `toLowerCase` kept ONLY when the result is as long as the original (so `\u00DF`, `\u0130`, `\u0149` and ligatures stay), no locale, no normalisation; a capital sigma lowers to the final sigma when a letter precedes it and none follows (context is the whole paragraph). An ASCII range uses one native call. Sentence: the range start and each place after `.` `!` `?` (closers `" ' ) ] }` and the curly / angle quotes allowed) followed by white space start a sentence; the first letter is capital, the rest small; a digit ends the wait. Title: a word is letters, digits and marks; an apostrophe (`'`, `\u2019`) between two of them stays in the word; the first letter of a word is capital, the others small (a word that starts with a digit has none). The cycle takes the state of all the text together (upper -> lower -> title -> upper; mixed -> upper). The pending format is returned for a caret and EMPTY for a selection. `Keymap` row `caseCycle` `Shift+F3` (menu `Format`; plain F3 stays `saveBox`); `FormatMenu` `caseMenu`: Format > Change case > Sentence case, lowercase, UPPERCASE, Capitalize Each Word, tOGGLE cASE, Next case (`Shift+F3`) |
| `ClipSlice`, `ClipHtml`, `ClipHtmlRun`, `ClipRead`, `ClipBuild`, `ClipCss`, `ClipClean`, `ClipIds`, `ClipPaste`, `ClipStore` | the clipboard (deliverable 6b), pure (`ClipIds`: `UNIQUE`, `hasUnique`, `hasIds`, `dropIds`, `keepIds`, `flatten`: ids that must stay unique in a same-document paste, below); wired into the window by Task 3. One block shape: `{type:'p', text, runs, inlines, pPr, pStyle?}` (no id, no extraP) or `{type:'opaque', node}`. `ClipSlice.slice(doc, sel)` -> `{blocks, ids, styleNames (Map id -> {name, type}), lists (Map numId -> {num, abs, m}: `ClipNums`), plain}` or null (collapsed); blocks share the document's objects (`OpsUtil.cut`), a kept block is in when covered; `plain`: `\n` between paragraphs, a table an empty line, inline text as `Selection.text`. `ClipHtml.toHtml(doc, slice, {token, urlOf, max = 2,000,000})` -> HTML or null (too big: plain text only): `<!--word-clip:TOKEN-->` first, then only `p h1-h6 ul ol li b i u s sup sub span br a`, every text and attribute escaped (`& < > " '`), the RESOLVED formatting (`FormatEff.charOf`), `white-space:pre-wrap`, headings by outline level / style name, labelled paragraphs as `<ol>`/`<ul>` `<li>`, links as text unless `urlOf` gives an http(s)/mailto URL. `ClipRead.readHtml(html, parseHtml)` -> `{blocks, styleNames}` or null (fall back to plain text; also on any throw): an injected DOM-like parser (DOMParser in the browser), a whitelist walker (iterative; elements deeper than 200 unwrapped (text kept, formatting ignored), 200,000 nodes, 5,000,000 text units; script/style/iframe/object/img/svg/... dropped with their content, unknown tags unwrapped, `display:none` and Word's `mso-list:ignore` skipped, href never kept), `ClipBuild` (HTML white space, `<br>`, `&nbsp;`, `<pre>` lines as paragraphs, tables as tab-separated rows), `ClipCss.parseStyle` (colour `#rgb #rrggbb rgb()` and names, first font family, sizes pt/px/em/%/keywords clamped to 1..400 pt, weight, italic, underline / line-through, sub / super, white-space, text-align; values with `url(`, `expression`, a backslash, comments, `< > { }` ignored); h1-h6 bold at Word's heading sizes with pStyle `HeadingN` named `heading N`; li items plain paragraphs; the Google Docs `<b style="font-weight:normal" id="docs-internal-guid-...">` wrapper is not bold. `ClipClean.clean(blocks, doc, {sameDoc, styleNames, lists})`: same document: everything passes (links, fields, symbols, pictures, numPr, tables) except raw inlines whose XML holds, at any depth, an element whose id must stay unique (`bookmarkStart/End commentRangeStart/End commentReference ins del moveFrom moveTo footnoteReference endnoteReference permStart/End`): they become their display text (a `w:del` nothing) or nothing; another: raw inlines -> their display text or nothing, tab / br inlines -> `\t` / `\n` (a page or column break stays one: a new inline without node, it refers to no part), pStyle / rStyle mapped by NAME (case ignored, type must match) else dropped, rPr / pPr: every modelled field kept and the raw `extra` cleaned (`ClipProps`, `NumClean`), numPr only for a list the slice carries (L6), tables skipped. `ClipPaste.pasteBlocks(d, sel, blocks, {sameDoc, styleNames, lists})` -> caret: one `d.atomic` (selection deleted first; a table edge gets an empty paragraph as typing does); one paragraph spliced in; several: head merged into the target (its id; the first block's properties at offset 0), middle blocks whole with fresh ids and `extraP = []`, last block + the target's tail as a new paragraph with the target's properties (`restoreBlock` + one `insertBlocks`: 100,000 paragraphs in ~0.4 s); `pastePlain` (`Edit.typeText`), `cutSelection` (slice + `EditDel.deleteSelection`). `ClipStore`: `put(slice, docKey)` -> 16 hex digits from 8 random bytes (`crypto.getRandomValues`), `get(token)` exact match only (the entry's `lists` passed on by `ClipPick` in the exact route's opts), last 4 kept, refuses over 5,000,000 text units or 100,000 blocks, `tokenIn(html)`; stores the slice object (and its `plain`), never parses anything. Contract for the wiring (Task 3): the exact route works only for copies within those limits (100,000 blocks, 5,000,000 text units; a larger copy is pasted from its HTML or plain text); a stored entry is used only when the clipboard's text/plain equals `entry.plain` (the HTML may have been edited elsewhere with our comment kept); each document window has a `docKey` that changes on Revert and reload (a counter on the window, e.g. `docKeyOf(win)` = window id + load count), so `sameDoc` is true only for the same loaded content (as built in Task 3: `EditClip` gives each `DocWindow` a counter `docKey`; Revert makes a new window, so a new key). `Edit.clean` is exported for them. The unique-id names also include the moveFrom/moveTo range marks and the `customXml*Range` marks |
| `ClipNums`, `NumClean`, `NumCopy`, `ClipProps` | lists, borders, shading and tab stops pasted into another document (L6, the owner's ruling: keep them, as Word does; pure). `ClipNums.numsOf(doc, blocks)` -> Map numId -> `{num, abs, m}`: the source's own top-level `w:num` and `w:abstractNum` nodes (shared, never changed) for each numId 1..2^31 - 1 a block's direct numPr names, `m` the scope at the part's root; a `numStyleLink` followed one step through the numbering style's numPr; left out: a missing num or abstract, an abstract still linked, a definition over `MAX_NODES` (5000) elements, numIds after `MAX_LISTS` (1000) or past `MAX_TOTAL` (200,000) elements. `NumClean.cleanEl(node, scope, strict)` -> a new tree with only WML elements (named `w:`, whatever prefix the source used) and WML attributes (plus `xml:space` / `xml:lang`), an `mc:AlternateContent` replaced by its `mc:Fallback` children, at most 64 deep; dropped with their content: other namespaces, anything with an attribute of the relationships namespace or a `w:id`, and `DROP` (`pStyle rStyle lvlPicBulletId styleLink numStyleLink numPr sectPr divId cnfStyle`); left / right spelled as the target spells them (`w:ind` sides and `...Chars`, `w:val` of `w:jc` `w:lvlJc` `w:tab`, `w:pBdr` side elements; never repeated). `cleanExtra(extra, strict)`: a pPr / rPr `extra` list cleaned so (scope: w, r, mc). `ClipProps.crossPPr(pPr, strict, lists)` / `crossRPr(rPr, strict)`: every modelled field (`PropNames`) kept, extras cleaned, jc and tab stop values by `JcName`, numPr kept (the source numId) only when `lists` has it or it is 0. `NumCopy.copyNums(doc, nums, numIds, {rand})` -> `{ops, map}`: one new abstract per source abstract used (cleaned, new id, a fresh `w:nsid` first; two source nums over one abstract share the copy, so they share a count as in the source) and one new num per source numId with the source's `w:lvlOverride`s cleaned (ilvl 0..8, first of each); placed and numbered as `NumWrite` (abstracts after the last abstract, before the first num; nums before `numIdMacAtCleanup`; ids past the largest, `ListUsed` numIds avoided; the part made by `ensurePart`); `ops` the `ListRestart.partOps` setDocParts; RangeError (nothing made) for no free id or a numbering that is not a node. `ClipPaste` runs it inside the paste's `d.atomic`, after the selection is deleted, for the numIds of the blocks whose pPr the paste keeps (the first at offset 0, the middle ones), applies the ops before `insert`, and gives those blocks the new numIds; any other source numPr, and all of them after a RangeError (the paste goes on without lists), is dropped |
| `EditClip`, `ClipPick`, `ClipLinks`, `ClipDom`, `MacKeys` | the clipboard wired into the window. `EditClip` (desktop): `attachClip(dw)` sets `dw.docKey` (a counter: unique per window, new after Revert), `dw.clip {last, status}`, `view.mac` (`MacKeys.isMac(navigator.platform)`) and handles the core's `copy` / `cut` / `paste` (CORE_API 3.1): copy = `ClipSlice.slice` -> `ClipStore.put(slice, docKey)` -> `ClipHtml.toHtml(doc, slice, {token, urlOf: ClipLinks.linkUrl(doc)})`; `setData('text/plain', plain)` always, `text/html` unless null (over 2,000,000 chars); nothing for a collapsed selection (the browser's default). Cut = copy, then `ClipPaste.deleteSelection` through `typing.command` (one step). Paste: refused with a beep while composing (`view.comp`); `ClipPick.pick` decides; `typing.command` (breaks coalescing) after `dropPending`; `pasteBlocks` / `pastePlain`; a RangeError (the model refusing the content) falls back to the plain text, any other error is thrown on (the core's handler reports it in an error box); nothing done: beep; files only: beep and `reportError('Pictures and files cannot be pasted into a document yet.')` (also `dw.clip.status`). Menu: `copyMenu` / `cutMenu` (`wimp.textInput.exec` inside the menu click), `pasteMenu` (`wimp.readClipboard()`, false -> `reportError` 'Press Ctrl-V (Cmd-V) to paste...'). `clipHook(dw)` for `TestHook` (`copy()`, `cut()` -> `{plain, html}`, `paste(payload)`, `stash(blocks, plain)` -> a marker for blocks put in the store under the window's key; plus `docKey`, `clipboard`). Caret: `{text: true, blink: true}` (no `clipboard: true`: Chromium fires copy/cut with an empty proxy). `ClipPick` (pure): `pick({text, html}, {store, docKey, parseHtml})` -> `exact` (the HTML's token is in the store AND `samePlain(text, entry.plain)`: both through `Edit.clean` and cut at 100,000 units like the core's `sanitizeText`; `sameDoc` = same docKey), else `html` (`ClipRead.readHtml`, `sameDoc: false`), else `plain`, else null. `ClipLinks.linkUrl(doc)` (pure): `urlOf` for `ClipHtml`: a raw `w:hyperlink` with a `<prefix>:id` (not `w:`) whose rel in `doc.rels` is an External hyperlink with an http/https/mailto target (`safeUrl`). `ClipDom.parserOf(DOMParser)` (pure, DOMParser injected): `parseFromString(html, 'text/html')`, an inert document never inserted into the page; ClipRead reads DOM nodes as they are. `MacKeys` (pure): `macKey(ev, mac)` gives Cmd + a b e f g i j k n s u y z as Ctrl (code 1..26) for `Keys`/`Keymap` (Cmd-F find, Cmd-G / Cmd-Shift-G find next / previous, Cmd-K hyperlink); never r, l (reload, address bar), c, x, v (the browser's clipboard events), m (macOS minimises the window: the page never gets Cmd-M, so indent is Ctrl-M only), h (macOS hides the program: Replace is Ctrl-H everywhere) or other keys; `macLabel(label, mac)` makes the Edit menu's labels `Cmd+Z`... on a Mac (CMD letters and C, X, V) |
| `Find`, `FindText`, `EditFind`, `FindView` | Find and Replace (deliverable 6b). `Find` (pure): `search(doc, from {s, i, off}, needle, {matchCase, whole, backwards, wrap})` -> `{s, i, from, to, inInline, wrapped}` or null: blocks walked by index from `[s, i]` (no `findBlock`), kept blocks skipped, sections crossed; forwards the first match with `from >= off` in the first block, backwards the last with `to <= off`; `wrap` scans again from the document's start (end) and marks `wrapped`; `count(doc, needle, opts)` (non-overlapping); `replaceOne(d, m, repl)` -> `{s, i, from, to}` or null (an inline in the range, a stale or bad match): one `spliceText` in `d.atomic`, the text formatted by `OpsText.fmtAt(p, from, del)` (the first replaced character's run); `replaceAll(d, needle, repl, opts)` -> `{count, skipped, last}` (`last` `{s, i, from, to}` of the last text put in, or null): one `d.atomic`, one pass over `sections[s].blocks[i]`, at most one `spliceText` per paragraph covering its first to last replaced match (unchanged stretches between kept as `OpsUtil.cut` pieces, inlines and runs reused), so the inverse restores each paragraph exactly with its id and `extraP`; text put in is never searched again (a replacement holding the needle cannot loop); 50,000 paragraphs x 2 matches in about 0.6 s. Replacement text: `Edit.clean` (controls other than `\n`/`\t`, U+FFFC and lone surrogates dealt with as typing does), so **a `\n` in it becomes a line break**: the model's line break is a `\n` in the paragraph's text (what Shift-Enter types and the writer writes as `<w:br/>`), a `\t` a tab; the box's fields are single-line, so this matters only to the API. `FindText` (pure): `view(p)` (cached per paragraph object in a `WeakMap`: models are immutable) is the paragraph as shown: each U+FFFC expanded to its inline's display text (tab `\t`, br `\n`, raw `text`, else nothing) with `map[k]` = model offset of shown character k; a match `[a, b)` of the shown text maps to model `[map[a], map[b-1]+1)`, `inInline` when that holds a U+FFFC (selected whole; never replaced, counted in `skipped`). After a match the next one starts at or after its model end (`matches`: `max(b, shownAt(to))`), so a link whose text holds the needle twice is ONE match for `count`, `replaceAll` and Find next alike (the search after it starts at its end). Case folding `fold(t)`: per code point, `toLowerCase()` when the same length, else the first code point of it when that is (U+0130 -> `i`), else unchanged: lengths never change (an all-ASCII string uses one `toLowerCase`); per character, so final sigma folds to the middle form, and `ss` does not match `ß` (no case expansion, no Unicode normalisation). Both ends must be grapheme boundaries of the model text (`DocPos.nextG/prevG`; skipped for paragraphs all below U+0300), so `e` does not match inside `e` + U+0301 nor a thumbs-up inside one with a skin tone. Whole words: `Segment.wordBounds` on the shown text, checked only at an end whose character is a letter, mark or digit (`\p{L}\p{M}\p{N}`: a run start at `a`, a run end at `b`); an end that is a space or punctuation needs nothing (Segment merges punctuation with spaces, so `foo.` / `foo,` could otherwise never match); texts over 4096 units segmented in a window of 256 either side. ICU treats `foo.bar` as one word. `prepare(needle)` -> `{needle, cut}`: at most `MAX` (1000) units, never half a surrogate pair. `EditFind` (desktop): the task's one `Ui/FindBox`; the active document is the `DocWindow` whose window last gained the caret (`attachFind`: `gaincaret`; cleared on `deleted`), state in a `WeakMap` app -> `{active}`. `openFind(dw, replace)` prefills Find with the selection when it is in one paragraph, at most 100 characters and has no line break (`orderedPos` checked before `view.text()`, so a huge selection costs nothing); `findStep(dw, back)` (Ctrl-G / Ctrl-Shift-G; empty Find: opens the box; with the box shut, a search that wraps or finds nothing opens it with `open({focus: false})` to show the message, the caret left in the document). Replace all puts the caret after `last`. Find next searches from the selection's end (previous: its start) with `wrap: true`, selects the match with `view.setSelection` (scrolls the head into view) and `FindView.show`: the document's window to the front, the box in front of it and moved below (or above) the selection's lines when it covers them; while the box is open it is lent to the active document's view as a pane (`FindView.lend`: `view.addPane(box.win)`, moved on `gaincaret` of another document, taken back on close or when the document is deleted), so the selection keeps the focused colour while the box has the caret; messages `Reached the end: continuing from the top` / `Reached the start: continuing from the end` / `Not found` (with a beep); Replace: if the selection is exactly a match (`search` from its start equals it) it is replaced through `typing.command` after `dropPending`, the caret put after it and the next found (`1 replaced`, `; no more found`, or the wrap message); a link match is skipped with `Link text is kept.` before the next search's message; otherwise Replace only finds; Replace all: `N replaced` (`; K in links not replaced`), `Not found` with a beep when nothing matched; an empty Find: `Type the text to find.`; over 1000 characters: `Only the first 1000 characters are looked for.` before the message; no live document: `No document to search: click in one first.`. `onClose` gives the active document `view.focus()`; `onKey` maps Ctrl-G / Ctrl-Shift-G (Cmd on a Mac) in the box to find next / previous. `findHook(app)` -> `task.word.find`: `{box, active, open(replace), run(action, {find, replace, matchCase, whole}) -> message}` (`find` is searched as given, even past the field's 1000) |
| `FormatApply`, `EditFormat`, `EditRun`, `EditHook`, `FormatMenu` | formatting in the window. `FormatApply` (pure): `apply(id, d, typing, sel, arg, pending) -> {sel, pending}` or `undefined` for a non-format id; ids `bold italic underline strike superscript subscript` (toggle), `alignLeft alignCenter alignRight alignJustify`, `align` (arg jc), `clearFormat`, `fontBigger fontSmaller` (`sizeBy` +-1), `indentMore indentLess` (`indentBy` +-720), `indentDrag` (arg `{marker, at, textW, free}`: `FormatPara.dragIndents`; a bad arg is a RangeError), `tabs` (arg `{add}`/`{remove}`/`{move}`/`{set}`/`{edits}`: `FormatTabs.setTabs`), `tabsBox` (arg `{tabs?, defaultTab?}`: `TabsCommand.tabsBox`, the Tabs dialog's OK), `listIn listOut listOff` (`setList` `{by: 1}`, `{by: -1}`, `{off: true}`), `size` (arg points -> `sz` half-points), `font` (arg family -> `rFonts`), `color` (arg `colourValue`: Wimp colour 0-15, `'auto'` or `'RRGGBB'`), `highlight` (Word name or `'none'`), `style` (style id), `lineSpacing` (arg a factor of `LINE_FACTORS` [1, 1.15, 1.5, 2, 2.5, 3] -> `line` 240/276/360/480/600/720 auto, or `{line, lineRule?}` checked by `FormatCheck`; other keys refused), `lineSingle lineDouble line15` (Ctrl-1, Ctrl-2, Ctrl-5), `spaceBefore spaceAfter` (arg twips, or null: the style's), `spaceBefore12` (Ctrl-0: `FormatPara.spaceBefore12`, 240 when every paragraph has none, else 0), `paraBox` (arg a `ParaPatch` patch -> `setPara`), `bullets` / `numbering` (arg a gallery entry id of that kind or none: `ListMake.toggleList`), `listRestart` (arg start, default 1), `listContinue`; `isFormat`; `PALETTE` (the desktop's Wimp palette as RRGGBB, pinned to `src/core/palette.js`: FFFFFF DDDDDD BBBBBB 999999 777777 555555 333333 000000 004499 EEEE00 00CC00 DD0000 EEEEBB 558800 FFBB00 00BBFF); `SIZES`; `WORD_FONTS` and `fontList` (re-exported from WimpLib `FontList`); `HIGHLIGHTS`; `paraStyles(styles)` (not `semiHidden`, by name). `EditFormat` (view glue, no `riscos`): `initFormat`, `touch(v)` (`selRev++`; `formatListeners` called once at the next animation frame), `dropPending`, `formatQuery(v)` (`Format.query` cached per `selRev`), `formatRun(v, id, arg)` (true if applied; RangeError -> false, nothing changed; the pending format it returns is kept; relayout through `v.edited`), `docFonts(v)` (`Info.facts(doc).fonts`, worked out once after each document change, not on every menu or popup), `stopFormat`. The view bumps `selRev` on every selection, document, layout and pending change; `setSelection`, undo/redo and every non-format command drop the pending format; `input` passes `{rPr: forTyping(pending), rStyle: styleFor(pending)}` to `Typing.type` and then drops it; `EditView.format` gives the browser focus back to the Wimp's text field when a menu click took it. `EditRun`: `runView(v, id)`, `stepView(v, kind)`. `EditHook.hook(v)`: the test hook (`labels()`: each block's list label text as laid out, or null). `FormatMenu.formatMenu(view, {ruler, toggleRuler, paragraph, listValue, autoList}?)` (desktop; `autoList` an item put last: `AutoFormatOpt.autoListItem`): Bold Italic Underline Strikethrough Superscript Subscript (ticked from `view.query()`, evaluated when the menu is drawn), Font > (WimpLib `Ui/FontMenu`: `docFonts`, Word, Desktop fonts >), Size > (`SIZES`, Bigger, Smaller), Colour > (16 `colour: n` items, Automatic, More colours... > a `Ui/ColourPopup` submenu), Highlight >, Align >, Indent >, List > (`ListMenu.listMenu`, see its row; shaded only with no selection), Style >, Paragraph... (`paragraph()`: `ParaBox`), Tabs... (`tabs()`: `TabsBox`, A4.3), Clear formatting; keys from `Keymap.labelFor`; all shaded with no selection. A command on 5000 selected paragraphs, laid out again: 50-70 ms A5.3 added to `EditRun`: `nbsp` is typed text (`view.input`) with the pending format; A5.4 added the ids `changeCase` and `caseCycle` (`ChangeCase`) and `FormatMenu`'s `Change case >` |
| `Kinds` | `UNSEEN` (the inline elements drawn as nothing and not counted: `proofErr`, `bookmarkStart/End`, `commentRangeStart/End`, `permStart/End`, `lastRenderedPageBreak`, `instrText`, `delText`, `fldChar`), `BLANK` (also drawn as nothing, but counted: `del`, `moveFrom`, `softHyphen`), `localName(node)`, `unseen(x)`, `unseenAt(p, k)` (the caret keys step over these with the next character and Backspace/Delete never delete them: A6.2; not a soft hyphen: a character for the keys), `onlyUnseen(p)` |
| `Info` | `facts(doc)`, `summary(doc)`, `kindOf(node)`, `infoWindow` |
| `FontMap`, `FontLoad` | `substitute(name) -> {family, css}`, `fontFiles()`, `fontFile(family, bold, italic)`, `bundledFamilies()`, `fontsToLoad(families)`; `loadFonts(vfs, dir, doc, families, FontFaceCtor)` |

### Caret and selection: the design

**Position model.** A position is `{id, off}`: a paragraph's id and a UTF-16 offset into its text, or, for a kept
block (a table, which the model holds but the view draws as one box), `DocPos.blockId(block)` (a negative id) with
`off` 0 (before) or 1 (after). A selection is the frozen value `{anchor, head, affinity, goalX}`
(`Selection.caret/select`); `goalX` is the column Up/Down keep. Positions name paragraphs by id, not by index, so
they survive a new layout; `Selection.clamp(sel, doc, oldL)` repairs a selection after the document changed.

**Affinity.** At a soft line wrap one offset has two places: `'up'` (the end of the upper line) and `'down'` (the
start of the lower; the default). Clicks, End and Left/Right set it; `caretRect`, `lineOf`, `vertical` take it.

**The offsets contract (`LineLayout`).** Every line and item carries the model offsets `from`/`to` it stands for,
gap-free across a paragraph. An inline element (link, field...) stands for ONE offset `i` but may show text: its
first piece covers `[i, i+1)` and the later pieces (after a wrap) are zero-length `[i+1, i+1)`, all `shown`. A
`shown` item's drawn text is not model text, so a caret inside it snaps to an edge. `PositionMap`'s header has the
rules for the caret at `i` / `i+1`, clicks in later pieces, Home/End and Up/Down around wrappers.

**Selection rules.** Left/Right move by grapheme of the whole paragraph text (`DocPos.nextG/prevG`; for texts over
4096 units a window of text is segmented, with `PosLine.snap` doing the same for a boundary inside a cluster),
one step per item boundary, boxes atomic; a non-extending Left/Right collapses a selection to its edge. Up/Down keep
`goalX` and cross into the next item. Word moves use `Segment.nextWord/prevWord`; double-click `selectWord` takes
the word under the caret (not the space after it; a box whole); triple-click `selectPara`; Ctrl-A `selectAll`;
Escape collapses to the head. Keys: `Keys.command(code, {shift, ctrl, key})` is pure. Shift-Down and Page Down are
both Wimp code &19E, so the optional browser key name (`ArrowDown`/`PageDown`) decides; without a name (a key sent
by `Wimp_ProcessKey`) &19E/&19F are Page Down/Up. The Menu button never moves the selection (as !Edit).

**Test strategy.** The modules are pure and take a measurer, so tests use a fake one (8 px per UTF-16 unit, 9 when bold,
in `tests/moreapps/positionmap.test.mjs`, `doclayout.test.mjs`) and exact numbers; the browser suites
`word-edit.mjs` and `word-edit-hostile.mjs` use the real canvas and the `task.word` hook. `snap.test.mjs` checks
`PosLine.snap` against `Segment.graphemes()` at every offset of short stress texts (flags in odd and even runs, ZWJ
chains over 32 units, modifier + ZWJ, 70 combining marks before flags, Devanagari conjuncts, Hangul, CRLF, lone
surrogates). `hostile-view.test.mjs` runs the hostile documents in a worker under a watchdog. The editing tests are in "Testing" below.

**Performance (measured, Node, this machine).** A 5000-paragraph document opens in the desktop in about 140 ms;
Ctrl-A on it takes about 2 ms; 50,000 paragraphs lay out in about 0.9 s (`doclayout.test.mjs` requires < 1.5 s) and
select-all draws visible rectangles in < 50 ms. Every call on the hostile documents is < 50 ms.

**Limits and known minors.**

* Grapheme snapping in a long paragraph is windowed (32 units either side, doubling while no boundary is found);
  texts over 4096 units are not cached, so each call re-segments them.
* The Wimp drag listeners of the core stay after a window is closed mid-drag until the button is released
  (nothing is drawn; the 60 ms auto-scroll timer stops on its next tick, within 60 ms).
* Tables are one atomic box (no caret in cells); right-to-left text is positioned in stored order, with no bidi
  caret logic (typing and deleting follow the stored order too); no find yet.
* The layout uses the FIRST section's page width for the whole document.
* Every new layout (each keystroke) recomputes the list labels of the whole document (`ListNumbers.labels`, one
  pass): in a 50,000-paragraph list a keystroke with its layout went from about 7 ms to 25 ms. Recomputing only on
  structural edits (paragraphs added or removed, `numPr` or style changed) is deferred (see "Lists (deliverable 5): the rules" below).
* Shared code (`src/core`) changed for typing: the opt-in text-input proxy (`src/core/textinput.js`, `wimp.js`,
  `menu.js`), in `docs/CORE_API.md` 3.1/3.2 and `docs/CHANGES_NEEDED.md`; the drag listeners above are noted there too.

**Editing: limits and known minors** (deliverable 2).

* A document with no block at all cannot be typed into (`Edit` returns `sel`; `EditView.input` beeps). Every other
  document has at least one paragraph or kept block, and the section-break rule below keeps it so.
* Section breaks are never removed by deleting a range: a deletion across one leaves every section,
  an emptied one holds one empty paragraph, a section left ending with a kept block (not the last) gets an empty
  paragraph after it. Delete at a section's last paragraph's end and Backspace at the next section's start remove
  the break (`SectBreak`, A3.2; `EditDel` alone still does nothing there: the keys go through `EditApply`).
* Composition text is drawn at the caret over what follows and is NOT laid out: the line reflows when the text is
  committed (a known cosmetic limitation; the composing text is in the view, never in the document).
* Printable keys: with the proxy focused they arrive as `textinput` only. If the field lacks the browser focus
  (the user clicked a page field outside the desktop and back without a click in the window), an AltGr/Option
  character typed meanwhile arrives as a `key` with Ctrl+Alt set and the printable fallback drops it (Ctrl and Alt
  are excluded so Ctrl-letters and Alt-menus stay shortcuts); click in the window to focus. Cmd (Meta) shortcuts are
  not mapped: Ctrl is the modifier, Cmd-letters are left to the browser and type nothing.
* `DocLayout(doc, metrics, prev)` keeps the lines of every block OBJECT of `prev` (the key is the paragraph object,
  its list label as `LineLabel.sameLabel` compares it: text, level indent, suffix, lvlJc, level `rPr` by identity,
  bullet; its section-end mark; the metrics and the text width; and `doc.styles`, `doc.numbering` and
  `doc.rawSettings` by identity: `DocItems`). A list paragraph's label depends on OTHER paragraphs, so the label is
  in the key; an op that changes the styles, numbering or settings must put NEW objects in the Doc (copy-on-write),
  which drops every paragraph's lines. Anything else a paragraph's lines or decorations come to depend on must be
  added to the key (`DocItems.sameKey`, `DocStack`'s cache).
* Undo steps: typing joins the previous step (same position, within 1 s, not a non-space after a space, no `\n`/`\t`,
  not over a selection, same overwrite mode), at most `MAX_MERGE` = 128 ops per step; the history holds 1000 steps
  (`maxSteps`); closing a window asks nothing, whatever the `dirty` state.
* Text typed right after a hyperlink (or any paragraph-level wrapper) is plain text after it, never inside it; typing
  over a selection takes the first selected character's run format (`rPr`/`rStyle`), as Word does.
* Typed tab and line break are the characters `\t` and `\n` in the paragraph text (the reader's form of `<w:tab/>` and
  a plain `<w:br/>`), so they are the same before and after a save; older `tab`/`br` inlines still work.
* The caret after an undo or redo is the end of the last op applied (`EditApply.stepEnd`, above); when no rule fits the
  selection stays and is clamped.
* Enter is `Edit.splitPara` (`EditPara.splitAt` over `splitBlock`; a bulk `\n` in typed text is `restoreBlock` +
  `insertBlocks`, linear in the number of lines).

**Performance of editing** (measured on this machine, Node 26 and the Chromium of the browser suites, 2026-10-06):
a keystroke in a 5000-paragraph document with its layout and drawing 2/1/1/1/1 ms (`word-typing.mjs`
requires < 100 ms; the layout keeps the lines of unchanged paragraphs, one `requestAnimationFrame` flush per burst);
100,000 characters in one `textinput` event 17 ms (40 ms through the real text field), one undo step; a storm of 5000
typed events 332 ms (35 ms for 5000 mixed events, laid out once); 3000 Backspaces 17 ms; 20,000 Enters 1.7 s (worst
one 2 ms); 1000 undos 149 ms and 1000 redos 148 ms; 50,000 paragraphs open in about 0.9 s, select all and type in them
2 ms and its undo 0.3 s; each keystroke in a 100,000-character word 9 ms; deleting 40,000 of 50,000 paragraphs
(`removeBlocks`, `editdel.test.mjs`) and undoing it takes about 0.25 s in all (the tests allow 3 s each).

## Formatting, toolbar, ruler and zoom (deliverable 4): the rules

The modules are in the tables above; this section is what to know before changing them.

**Coordinates (layout px vs screen px).** `DocLayout` works in *layout px* (96 dpi, 1 px = 15 twips, always as at
100%): lines depend only on the text width. *Screen px* are the window's work-area coordinates: mouse events, the
canvas, scrolling, the Wimp's caret and the panes. The two toolbar rows and the ruler are panes attached at the top of the
work area (`WinPanes`); the `inset` (`AppWin.inset()` = `ROWS` 2 * `BAR_H` 34 + `RULER_H` 24 when the ruler is shown) is the one value given to the
layout (`DocLayout` `{top}`, so the page starts below the panes) and to the view (`view.inset`, so scrolling and
`EditScroll` keep the caret under them). The inset is **not scaled by the zoom**. With `z` = percent / 100 and
`top` = `L.top`:

```
screen x = layout x * z          screen y = top + (layout y - top) * z      layout width = window width / z
```

(`Zoom.toScreen/toLayout`.) `EditView.paint` translates/scales the canvas accordingly (the backing store stays at
`devicePixelRatio * wimp.scale`); `caretRect()` and `hitAt()` convert; `EditScroll` and the scroll bars work in screen
px; Page Up/Down scroll `pageStep` screen px and move the caret `pageStep / zoom` layout px. `RulerInd.scaleOf`
gives the ruler the column's screen px (layout px * zoom, less `scrollX`). Anything new that takes a mouse position
must go through `hitAt`/`Zoom.toLayout`; anything drawn from layout numbers must be scaled by `z` (not `top`).

**Pending format.** `Format.query` of a caret = what text typed there gets (the character before it, or the paragraph's
and styles') with `view.pending` on top. A character command at a caret changes nothing in the document: it returns
the new pending format (`Pending.merge`: keys that equal what typing would get anyway are dropped, so two Ctrl-B give
`EMPTY` again), which the toolbar and menu show at once. `EditView.input` passes `{rPr: forTyping(pending), rStyle:
styleFor(pending)}` to `Typing.type` and drops the pending format; it is also dropped by `setSelection` (any caret or
selection move), undo, redo, Enter and every other non-format command (`EditRun.runView`). Word keeps the format over
Enter; !Word does not (user guide, part 5). Paragraph commands at a caret format the caret's paragraph and keep the
pending format.

**Commands and the toggle rule.** All go through `FormatApply.apply` -> `FormatSet` (character) / `FormatPara`
(paragraph) -> `FormatOps.buildOps` (one `setProps` per paragraph or per stretch of runs formatted alike; runs it
would not change get none) -> `runOps` (`typing.command` + `d.atomic`: one undo step, all or nothing). `toggle`:
Word's rule, if every character has it then off, otherwise on for all (also at a caret: pending). Values equal to
what the styles give are removed rather than written (`b:false` is written only where a style gives bold), except a
size: it is removed only when the style chain gives that very size, and where no style gives one a size is always
written. `Fmt.sizeBold` is the one rule for the size and bold of headings (no size in a heading: Word's heading size
and bold unless `b` is set), shared by the display, `Format.query` and the commands.

**The hyperlink limitation.** A level-`p` inline (hyperlink, kept run, bookmark, tracked change, content control) is a U+FFFC in the paragraph text whose shown text is not model text and whose node the writer puts
outside any run. A format put on the run holding that U+FFFC could not be saved, so after reopening it would be lost
(a real bug, found by `format-roundtrip.test.mjs`). `FormatOps.pieces` therefore leaves those characters out of every
character-format op, and `Format.query` and the toggle rule skip them. A selection holding a link formats the text
around it and not the link's own text. Word formats the link text too (question F13).

**Sprites.** The toolbar's `wb_*` sprites (`wb_bold wb_italic wb_underline wb_strike wb_super wb_sub wb_left wb_centre
wb_right wb_justify wb_indmore wb_indless wb_colour wb_highlight wb_clear wb_style` on row 1, `wb_spacing wb_bullets wb_numbers` on row 2, 20 x 20; `up`, `down` and
`gright` are the Wimp's) are character maps in `tools/moreapps/icon.mjs` (`BAR`, `barSprites()`, written by
`tools/lib/spritewrite.mjs`). `node tools/disc-moreapps.mjs` puts them in `!Word.!Sprites` with `iconFiles()`; change
the maps and run it again (`node tools/moreapps/icon.mjs` prints them as text). A pressed button is the slab pushed in
with highlight colour 2 (validation `R5`): no pressed variants. There is no `wb_zoom` (see below).

**Zoom.** Window menu Zoom submenu (50 75 100 125 150 200, Zoom in, Zoom out) and Ctrl+wheel, per window, not saved.
No keys: Ctrl+= and Ctrl+Shift+= are subscript and superscript, Ctrl+0 is Word's paragraph spacing, and the toolbar zoom
popup of the plan was not built (no room). The core's wheel event has no Ctrl flag, so `ZoomBind` reads Ctrl from
`os.input.keysDown`; a macOS pinch reaches the page as a wheel event with `ctrlKey` set, which the core's event does not carry, so it scrolls instead (see
`docs/CHANGES_NEEDED.md`).

**Performance (measured on this machine, Node 26, 2026-10-06).** `FormatSet.toggle` bold over every paragraph: 5000
paragraphs 17 ms, 50,000 paragraphs 130 ms; `setPara` centre 13 ms and 95 ms; undo of both steps 4 ms and 24 ms (redo
the same). In the desktop a command on 5000 selected paragraphs with the layout done again takes 50-70 ms and the
toolbar refresh after a caret move on 5000 paragraphs is well under 1 ms. `word-format-hostile.mjs` requires
select-all and Ctrl-B, Ctrl-E, Ctrl-Shift-> and three undos on 50,000 paragraphs to take under 5 s each.

**Limits and known minors.**

* The ruler's clamps and its scale use the FIRST section's page width, like the layout.
* Margins are shown on the ruler but cannot be changed; tab stops are drawn in the text (A4.1) and shown, added, moved and removed on the ruler (A4.2; the Tab stops rules below), the Tabs dialog is A4.3; spacing and flow have a UI since Batch A (the Paragraph rules below)
  (`FormatSet.setPara` takes them, the guide says so).
* The module size limit is 250 lines (`disc-wimplib --check` for the library): `EditFind` (250), `Ui/Dialog` (250), `Ui/Ruler` (246), `LineLayout` (245) and `EditView` (235) have little or no room, so split before adding to them.
* `Format > Colour` is the desktop palette (Red DD0000) and the toolbar colour popup Word's standard colours (Red
  FF0000); any `RRGGBB` is accepted by `colourValue`. The highlight popup is a menu of names (no swatches); a pressed
  toolbar button has no pressed sprite.
* `Fmt.runFmt` draws at most 200 pt (`look.pt` clamped 4..200) while the commands and the size field accept 1..400 pt; the file keeps the size chosen (the guide says so; the display clamp is deliberate).
* Highlight fills the full line height (Word: the font box); underline of superscript/subscript text has not been
  compared with Word; composition text is not justified; the colour `'auto'` is drawn black.
* The ruler's cancelled drag (`pointercancel`) is committed where the cancel event says (core gives no flag: see
  `docs/CHANGES_NEEDED.md`). A hidden ruler pane is closed again after each parent move or open (the core has no
  `detachPane`).
* A size change removes a direct `b` that the style gives (so the text stays as bold as it was); `szCs` is removed
  independently of `sz` when the style gives `sz` but no `szCs` (the file then holds an explicit `szCs`: harmless).
* Pending format across an input method's composition is untested; `Font` menu lists the document's fonts once per
  document change (`EditFormat.docFonts`), the Desktop fonts are read each time the menu is made.
* The size field drops letters as they are typed (`validation` `A0-9.`); an unreadable number beeps.

## Lists (deliverable 5): the rules

The modules are in the tables above (`ReadNumbering`/`NumLevel` read the definitions; `StylesNum`, `ListLevel`,
`NumFormat`, `BulletGlyph` and `ListNumbers` make the labels; `LineLabel`, `LineLayout`, `DocLayout` and `DocPaint`
draw them; `ParaInd`, `FormatList` and `EditList` edit lists, with `FormatEff`, `Format`, `RulerInd`, `FormatPara`,
`FormatApply`, `FormatMenu`, `Keymap`, `EditApply` and `EditRun` changed for them). What to know before changing them:

* **Display only.** A label is never text: not in `para.text`, not in a line's `from`/`to`, not selectable, not in
  `Selection.text`; `line.label` on the first line, `line.x` the text start (caret at offset 0). Editing never changes
  a numbering definition: the editing commands (Tab, Enter, Backspace, Remove from list) write only a paragraph's
  `numPr` (and `ind` for Backspace's `keep`); the list-making commands of Batch A task A2 add definitions (rules below).
* **Counters.** One linear pass (`ListNumbers.labels`): counters per abstractNum (numIds over one abstractNum continue
  one count), `startOverride` once per numId and level, restarts per `lvlRestart`, `%n` in level n-1's format
  (decimal for `isLgl`), missing levels drawn as the nearest defined level below, labels capped at 40 characters,
  templates read to 255 characters. Rulings made without Word (G4 below): shared counters, one-shot override.
* **Indents.** Style < numbering level < direct `ind`, attribute by attribute (`Styles.resolvePara(styles, para,
  levelInd)`; hanging and firstLine one value). `ParaInd.effective` is what is drawn and what the ruler, Format.query,
  Ctrl-M and ruler drags start from; `FormatPara.explicit` compares against style + level, so an indent back at the
  level's value is removed again.
* **Label geometry** (`LineLabel`): the label at `left + first`; tab suffix: the text at the stop a tab in the text
  at the label's end goes to (`TabStops.nextStop`: the paragraph's stops, the indent as the hanging stop, the
  document's default stops from the MARGIN), or at `left` when the label ends exactly there (G6, settled in A4.1:
  label and in-text tabs count the same way); lvlJc right/center inside the hanging space (Word may let a right-aligned number
  stick out to the left, G9).
* **Reuse key.** `DocLayout` keeps a paragraph's lines only when the object is the same AND `LineLabel.sameLabel` holds
  (text, suffix, jc, bullet, the level indent, level `rPr` by identity): a label depends on other paragraphs. A new
  `doc.numbering` object (or styles, or settings) drops every paragraph's lines (`DocItems`).
* **Editing.** Tab at an item's start (or over items) `{by: 1}`, Shift-Tab anywhere in an item `{by: -1}` (outside a
  list the key goes on), each to the next DEFINED level; Backspace at an item's start `{off, keep}` (the text stays
  where it was drawn when the label fitted `hanging` + tab; otherwise the first line moves to `left`); Format > List >
  Remove from list `{off}` (back to the style's indents). A heading numbered by its style gets a direct `numPr` level
  and keeps its style (Word is believed to switch to the level's `pStyle`, G13). Over a mixed selection only list
  paragraphs change.
* **The style gallery** named by the spec already exists: the toolbar's style field and popup and Format > Style list
  the document's paragraph styles and apply them; no separate gallery is planned.

**Performance (measured 2026-10-07, this machine).** Browser (`word-lists.mjs`): 50,000 list paragraphs open in about
1.6 s (budget 2 s), a frame paints in under 1 ms, a keystroke with its layout 27 ms. Node (`DocLayout` relayout after
one typed character, 50,000 paragraphs, median of 10): 14 ms without lists, 34 ms with them (the labels' pass). Browser
(`word-lists-hostile.mjs`): 100,000 list paragraphs open in about 3.5 s, a keystroke 88 ms, Tab 94 ms, Shift-Tab
75 ms, scroll and paint 13 ms; 1080 Tab/Shift-Tab commands, worst 1 ms. `FormatList.hasList` over a select-all of
50,000 paragraphs: about 4 ms (no numbering: at once).

**Limits and known minors.**

* Labels are recomputed for the whole document on every layout (each keystroke: about 7-14 ms -> 25-34 ms at 50,000
  list paragraphs); recomputing only on structural edits (paragraphs added or removed, `numPr` or style changed), or
  reusing the previous labels for text-only edits, is deferred.
* (G6 settled in A4.1: the tab after a label and tabs in the text count their stops the same way, from the margin.)
* A right-aligned label stays inside its hanging space (G9).
* A style-numbered heading keeps its style on a level change (G13).
* No creating lists or numbering definitions, no bullet/number toolbar buttons. Copy and paste (6b) kept `numPr` only within one document; since L6 a whole list item pasted into another !Word document brings its list (a new one there: `ClipNums`, `NumCopy`); from HTML, list items are still plain paragraphs.
* Absurd values are shown as given within the 40-character cap (a start of 2^31 as `2147483648.`, a negative start as
  `-5`): `word-lists-hostile.mjs` pins this; what Word does with them is G17.
* `docs/CHANGES_NEEDED.md`: nothing; lists needed no shared-code change.

## Paragraph spacing, flow and the Paragraph box (Batch A, A1): the rules

The modules are in the tables above (`ParaSpace`, `SpacingRaw`, `ParaMenu`, `ParaPatch`, `ParaBox`, `DocItems`,
`DocStack`, `WinPanes`, the toolbar's two rows, WimpLib `Ui/Dialog`, `DialogLayout` and `Units`); the user guide is part 6
of `$.Docs.Word`.

* **Spacing is drawn from the layers.** `Styles.resolvePara` merges the style layers and the paragraph's raw
  `w:spacing` (autospacing, `beforeLines` and so on stay raw in `extra`); `Fmt.paraFmt` gives `lineRule`, `lineTw`,
  `contextual`. `LineLayout` makes every line's height with `ParaSpace.lineBox`; the space before and after are read back
  from the laid-out lines, and the neighbour-dependent part (contextual spacing) is a `DocStack` decorator (`spacingDeco`)
  with a reuse key that includes the block above, so a change to the neighbour asks again.
* **Only what is set is written.** `line` and `lineRule` are written together; a raw `w:spacing` is patched in place
  (`SpacingRaw.patchSpacing`: setting `before` drops `beforeAutospacing` / `beforeLines`, nothing else); flags equal to
  the style's are written as null (absent); `widowControl` is on when absent (Word's default), so off writes `w:val="0"`.
  Undo restores the paragraph exactly, so open, change and undo all gives the same bytes (`spacing-roundtrip.test.mjs`).
* **Limits.** Auto line spacing is drawn 0.5..4 lines (`Fmt`), exact and at-least 2..2112 px (1584 pt). The Paragraph box
  refuses an At outside that (beep, box stays) instead of clamping, so what is saved is what is drawn. Word allows up to
  132 lines; no more is drawn yet.
* **Flow options have no effect yet.** `keepNext keepLines widowControl pageBreakBefore` are stored and written; pagination
  (Batch D) will use them. The guide says so.
* **The Paragraph box** is built by `Ui/Dialog` from rows; its values are a pure function of the query (`ParaPatch.fill`)
  and the patch a pure function of the values and the query it was filled from (`ParaPatch.patch`), so an untouched or
  mixed field changes nothing. One box per document (`para:<docKey>`), deleted with the document; OK with a different
  selection or document beeps and refills.
* **Hostile input.** `word-spacing-hostile.mjs`: 50,000 paragraphs, 1000 Ctrl-2 / Ctrl-1 toggles, absurd `w:spacing`
  values in files (every item height finite and below 500000 px), the box open while its window closes, 500 random actions
  with undo of everything.

## Making lists (Batch A, A2): the rules

Modules: `ListGallery`, `NumWrite`, `NumScan`, `ListMake`, `ListRestart`, `ListUsed`, `ListMenu`, `ListBox`, with
`ToolbarButtons` / `ToolbarBind` (row 2), `FormatApply` (ids `bullets`, `numbering`, `listRestart`, `listContinue`),
`FormatMenu`, `Keymap` (Ctrl+Shift+L) and `OpsDoc` (`setDocPart`); the rows above say what each does. The user guide is
part 7 of `$.Docs.Word`. What to know before changing them:

* **One undo step, every part.** A list command changes the numbering (`doc.numbering`), the relationships, the styles
  (List Paragraph) and the paragraphs' `numPr` in one `runOps` step; undo gives back `doc.numbering`, `doc.rels`,
  `doc.styles` and `meta` exactly (`listmake.test.mjs` compares deep copies), and a command that changes nothing makes
  no undo step. A refused command (RangeError: a bad entry or start, an id NumWrite cannot make) changes nothing.
* **Old nodes are never touched.** `NumWrite` returns a new root holding the same child NODES plus the new ones:
  `w:abstractNum` after the last abstract (or `w:numPicBullet` / `mc:AlternateContent`) and before the first `w:num`,
  `w:num` after the last num and before `w:numIdMacAtCleanup`. The round trip tests check this on real files
  (`roundtrip-lib.mjs` "grown": every original child serialized identically and in order, the new ones only added).
  Ids are the largest numeric id plus one (below 2^31), and a numId named anywhere in the package is not reused
  (`ListUsed`).
* **A new part is the writer's job.** `ensurePart` gives a new root, the part name and a new rels array; the content
  type, the prolog and the zip entry are written by `DocxWrite`. A list made in a document with no styles part also
  makes List Paragraph (`StylesBuiltin`), so the writer makes `styles.xml` too (the round trip tests' `withNewParts`
  takes those additions into account when they compare the model read back: new parts only the styles and numbering
  ones, new relationships only a styles or numbering one to such an added part; anything else still fails the
  comparison).
* **Which list.** The owner's ruling (L2): Bullets / Numbering continue the nearest earlier list of the section whose
  level 0 matches the entry, with any gap of non-list paragraphs; AutoFormat as you type does the same by format, and a
  number only when it is the number that comes next. Kinds and entries are those of level 0 (L8).
* **Restart and Continue** move paragraphs between `w:num`s of one abstract; the count of such nums is shared
  (`ListNumbers`, one-shot `startOverride`). A Restart makes a new `w:num` (600 Restart and Continue commands made 289 nums:
  `word-newlists-hostile.mjs`); there is no clean-up of unused nums, as Word keeps them too.
* **Menu glyphs** are look-alikes (`BulletGlyph.MENU_GLYPHS`): Homerton lacks the bullet shapes. The page draws the real
  ones; the `o` of Courier New is now drawn as U+25E6, a white bullet (A2.1).
* **Pasting** list items into another document makes their lists there (L6, the owner's ruling: `ClipNums`,
  `NumCopy`; see "Clipboard and Find"): new definitions copied from the source's, in the paste's undo step, never
  joined to a list of the target. `clipboard-newlists.test.mjs` pins the rules for lists made by !Word (inside one
  document the items stay in their list; the HTML copy is `ul` / `ol` and reads back as paragraphs; Find never sees
  labels); `clip-lists.test.mjs` and `clip-lists-paste.test.mjs` the cross-document ones.

## AutoFormat lists as you type (Batch A, A2.4): the rules

Modules: `AutoList` (pure), `AutoFormatOpt`, `WordChoices` (rows above). What to know before changing them:

* **Only a typed space or Tab.** `EditInput.inputView` runs `AutoList.afterSpace` for a `textinput` of exactly one
  space at a caret; `EditApply.run('tab')` for Tab. Never: in overwrite mode, an input method's commit (the
  `textinput` that follows `compositionend` in the same task is marked `composed`, as is the composing text a Save
  types itself, `DocSave.commitComposition`), while composing, a longer
  `textinput`, paste (`EditClip`), Find / Replace (`EditFind`), undo / redo, or when Format > AutoFormat lists is off.
* **Where.** The text before the caret must be exactly marker + the character, so the marker is at the paragraph's
  start; before it only invisible marks may come (bookmarks such as `_GoBack`, proofing marks, comment and permission
  ranges, `lastRenderedPageBreak`: AF5), never a link, field, drawing or tab (each a U+FFFC); text after the caret
  and the marks stay. One letter that can be roman (`i v x l c d m`) is read as whichever continues the nearer
  earlier list (roman or lettered), else by `markerOf`'s rule (AF3).
  A paragraph with any `numPr` (direct, raw, or from its style, `numId 0` included) is left alone.
* **Undo.** Two steps, as Word: the typing (`Typing`) and then the conversion (`typing.command`): Ctrl-Z once gives
  back the marker and the space with the caret after it (the conversion's first op is the text removal, so its
  inverse is the last op undo applies), Ctrl-Z again the typing. Typing on after that does not convert again (the
  text before the caret is no longer a bare marker).
* **Which list.** As `ListMake`'s continuation (the owner's ruling, any gap in the section), but by format: the
  nearest earlier list of the entry's format; a number continues it only when the label it would get there is the
  number typed (`3.` after `1.` `2.`), else a new list starting at that number (`w:start` of level 0 in a new
  abstract). Rulings made without Word: AF1..AF4 below.
* **Choices.** `autoList` in Choices:Word (default on), written through `WordChoices` so `recent` and it never
  overwrite each other; read once at start-up (until then: on).
* **Cost.** A space at offset 2..9 looks the paragraph up (`EditPos.findBlock`, linear): in 50,000 paragraphs a
  space typed there costs what a letter does (`word-newlists-hostile.mjs`: 8.2 ms against 8.1 ms with the layout); a
  conversion of a number scans the labels once (`ListNumbers.labels`): median 20 ms, worst about 300 ms (a new list's
  `ListUsed.usedNumIds` pass) at 50,000 paragraphs.

## Page breaks (Batch A, A3.1): the rules

Modules: `BreakMarks`, `InsertApply` (rows above); `LineTokens`, `LineLayout`, `PosLine`, `PositionMap`, `DocPaint`,
`ClipClean`, `EditApply` and `Keymap` changed for them. What to know before changing them:

* **The model.** A page break is one U+FFFC with `{kind: 'br', level: 'r', brType: 'page'}`, as the reader gives a
  `<w:br w:type="page"/>` (with its node; one made by Ctrl-Enter has none and is written as that element in a run).
  A column break (`brType: 'column'`) is read from files only and drawn the same way, labelled "Column break". A
  `w:lastRenderedPageBreak` (Word's record of where it last paginated) stays an unseen zero-width inline: no rule.
* **Ctrl-Enter** (Word 2013's form): the selection is deleted, the break goes in at the caret, and the paragraph is
  split straight after it as Enter splits it (`EditPara.splitAt`: `numPr` kept, so a list goes on), so the break
  always ends its paragraph and the caret starts the next one; one undo step (undo puts the caret where the break
  went, redo after it). At a paragraph's end the new paragraph is empty; in an empty paragraph it is a paragraph of
  just the break followed by an empty one. A break mid-paragraph (older files) ends its line; the text goes on below.
* **On screen** the break ends its line; the rest of the line, at least 90 px (`MIN_RULE`; less left: it wraps to
  the next line first; a page narrower than that: 90 px all the same), is a grey (`#909090`) dotted rule with its
  label in 11 px italics in the middle. Display only: not text, never in Find or the clipboard's text (the break's
  plain text stays `\n`, as before). It is never painted with a highlight colour, and a selection lights only its
  first 8 px (`LIT`): the break's offset is selected, the rule is not highlighted.
* **Caret.** One character: Left / Right pass it in one press; Backspace after it and Delete before it remove it;
  End on its line is the paragraph end (after the rule) when it ends the paragraph, else before it; a click on the
  rule puts the caret at its nearer edge (on a mid-paragraph break the right half is the next line's start).
* **At the start of a numbered item or heading** Ctrl-Enter leaves a paragraph of just the break with the item's
  `numPr` / `pStyle` (its own label or heading level), as Enter's rules give: question PB2 for the owner.
* **Clipboard.** Within a document the break is kept (it has no id); pasted into another document it is kept too, as
  a new inline with no node (it refers to no part; before A3.1 it became a line break); the HTML copy has `<br>`.
* **The Insert menu** is A3.3 (below); **not yet:** pagination (Batch D). (`DocPaint` culls items with their
  gaps since A3.2, for the marks drawn there.)

## Section breaks (Batch A, A3.2): the rules

Modules: `SectBreak`, `SectDeco`, `SectMark` (rows above); `OpsSect` (`setSection`), `Ops`, `DocItems`, `DocStack`,
`ParaSpace`, `DocPaint`, `DocLayout`, `EditApply`, `InsertApply`, `Keymap` and `ReadProps` changed for them. What to know before changing them:

* **The model.** A section ends with the paragraph whose `pPr` holds its `sectPr` (`WriteBody.placeOf`; the last
  section's at the body end or, as read, in its last paragraph). `w:type` (`props.type`) says how a section STARTS,
  so the break at the end of section `s` is labelled with section `s+1`'s type (`markOf`; none: `nextPage`).
* **Insert > Section break > Next page / Continuous** (ids `sectionNext`, `sectionContinuous`; the menu is `InsertMenu`, A3.3):
  the selection deleted first; a caret on a table's edge gets an empty paragraph there; inside or at the end of a
  non-empty paragraph it is split at the caret (Enter's rules: `numPr` and `pStyle` kept, after a heading the next
  style) and the first half ends the section; at the start of a non-empty paragraph an empty paragraph before it
  (Enter at its start) ends the section; an empty paragraph ends it itself (one is added after it when it was the
  section's last block). Caret: the start of the block after the break. One undo step.
* **Properties.** The section BEFORE the break gets a copy of the old section's props and `sectPr` node (every child,
  rsids, `w:headerReference` / `w:footerReference` included: both sectPrs name the same header parts, as Word does;
  `w:pgNumType w:start` kept too: question SB2), but NOT its `w:sectPrChange` (a tracked change's revision id must
  stay unique: the original keeps it); the section AFTER keeps the original sectPr (all its attributes, rsids, `w14:`
  and `mc:` ones too, and its unknown element children; children written in schema order; an XML comment inside it
  is dropped while it is rebuilt from its props, and back when the break is removed again) with `type` set to the
  chosen kind (`nextPage` written explicitly; a raw `w:type` in `extra` is replaced).
* **Reading.** A paragraph's `w:sectPr` ends a section whatever its attributes (`ReadProps`: before A3.2 one with a
  `w14:` or `mc:` attribute stayed in the pPr's `extra`, so the copy of such a sectPr read back as no break). A last section whose sectPr is in its last paragraph keeps it
  there. The page width on screen stays the FIRST section's (`DocLayout`).
* **Delete / Backspace at a break**: Delete at the end of a section's last paragraph, Backspace (also the Ctrl forms)
  at the start of the next section's first block, remove the break: the sections merge (`mergeSection`: the
  following section's props and sectPr) with the earlier section's type (its field, or the raw `w:type` it kept, or
  none) as one undo step (`setSection` after the merge when the types differ); the caret stays; the next press
  merges the paragraphs as before. Before the list rule: Backspace at the start of a list item that begins a
  section removes the break, not the number (question SB5). A section ending with a table is never merged (the
  writer adds the paragraph that carries its sectPr): those keys do nothing there, as before. Deleting a RANGE
  across a break still keeps every section (`EditRange`, question SB4).
* **On screen**: a band 18 px high (`SectDeco.BAND`, in the item's `gapBelow`) under the section's last block (under
  the paragraph's space after, or under a table's box), a grey double dotted rule with the label ("Section break
  (Next page)", "(Continuous)", "(Even page)", "(Odd page)") in 11 px italics in the middle; the last section has
  none. Display only: never text, never selected, never the caret; a click in it puts the caret at the end of the
  block above. Contextual spacing is never taken back across a band (`spacingDeco`; its `keyOf` is null after a
  section end). The mark is in the reuse key, so a changed type re-asks the decorators (`layout-prop`).
* **Files**: the fidelity rule holds: writing after Delete of a just-inserted break (and Delete again to join the
  paragraphs) gives the original bytes, and undo writes both sectPrs again byte for byte (`sectbreak.test.mjs`). A
  section whose props no longer read as its raw node is written from its props with the raw node's name and
  attributes (`WriteProps.sectPrNode`; `docx-compare.mjs expectedBack` models that, for those sections only).

## Insert menu and page break before (Batch A, A3.3): the rules

Modules: `InsertMenu`, `FlowDeco` (row above); `WinMenu`, `DocStack`, `ParaSpace`, `DocPaint` changed for them.

* **The menu.** `Insert` sits after `Edit` in the window menu: Page break (`Ctrl+Enter`), Section break > Next page /
  Continuous, Symbol..., Special character, Hyperlink..., Bookmark.... A5 enabled Symbol and Special character, A6.1
  Hyperlink... (`Ctrl+K`, its Keymap row and `key:`), A6.2 Bookmark... (`Ctrl+Shift+F5`, Ctrl on a Mac too: a
  function key, so `MacKeys` maps nothing). The menu keys come from
  `Keymap`, so a changed key shows in the menu; `mackeys.test.mjs` pins `Ctrl+Enter` on a Mac.
* **Page break before** (the paragraph flag, set in the Paragraph dialogue's "Page break before" option or read from a
  file, direct, from its style or from the document defaults): a 12 px gap above the paragraph (`gapAbove`, also for
  the first paragraph of the document: the flag is shown wherever it is set) and in it a grey `#909090` dotted
  rule with "Page break before" in 11 px italics in the middle. It belongs to no paragraph: a click in the gap is the
  start of the paragraph below. Never text. Contextual spacing takes nothing back across it. Keep with next, keep
  lines together and widow control have no mark and no effect on the screen until pages arrive (Batch D); they stay
  in the Paragraph dialogue and in `Format.query`.
* **User guide**: part 8 of `$.Docs.Word` ("Inserting: breaks, symbols, links and bookmarks"; named "page and section breaks" until A5.5 and "... symbols and special characters" until A6.5): the Insert menu, page breaks, section breaks (next page / continuous, how shown, deleting, what is copied) and page break before. The guide's old parts 8 to 16 became 9 to 17 with it (`tools/docs/Contents` points at part 16 for programmers). The Insert menu is where A5 (Symbol, Special character) and A6 (Hyperlink, Bookmark) add their items to the same part of the guide.
* **Hardening (A3.4).** `word-breaks-hostile.mjs` and `breaks-roundtrip.test.mjs` found no bug in the product code. They did find a gap in the test library (`expectedBack`, above) and, while writing the guide, a defect in the previous commit's docs: `tools/docs/Word` had been committed (190f50b) with about 860 lines of an older copy of parts 1 to 7 spliced in before part 8; it is removed.

## Bookmarks (Batch A, A6.2): the rules

Modules: `Bookmarks`, `BookmarkFind`, `BookmarkKeep`, `BookmarkBox` (row above); `Kinds`, `LineTokens`, `SelMove`,
`EditDel`, `EditRange`, `Keymap`, `DocKeys`, `InsertMenu`, `LinkBox`, `EditMouse` changed for them (`LinkMarks` folded
into `BookmarkFind`: one lookup for the Bookmark box, the Hyperlink box and Ctrl-click).

* **What a bookmark is.** Two raw level-`p` inlines, `w:bookmarkStart w:id w:name` before the selection and
  `w:bookmarkEnd w:id` after it, nothing else (no `w:colFirst`, no `w:displacedByCustomXml`). Bookmarks inside tables
  (kept blocks) and inside other kept items are listed (`list(...).at` is null in a table) but never moved, deleted or
  gone to: refused with a message.
* **Names**: Word's rule (`checkName`), unique ignoring case; adding a name that is there moves it; hidden names (a
  leading `_`, Word's `_Toc...`, `_GoBack`, `_Hlk...`) are never made, and are listed only with "Hidden bookmarks".
  Names from files are only compared (a bookmark may be called `__proto__`).
* **Ids**: one more than the largest whole-number id 0..2^31 - 1 of any bookmark mark in the document (tables
  included); other ids are passed over; at 2^31 - 1 a new bookmark is refused.
* **The caret over unseen inlines** (a change to an old behaviour, which each cost one key press): Left and Right
  (Shift too) go over unseen inlines (`Kinds.unseenAt`: bookmarks, proofing marks, comment and permission ranges,
  `lastRenderedPageBreak`, field codes, deletions) together with the next character, so every press moves the caret
  on the screen (a soft hyphen, drawn as nothing too, is a character for the keys: one press, and Backspace or
  Delete deletes it, as in Word); at a paragraph's edge the inlines go with the paragraph mark. Up/Down, Home/End and
  clicks are unchanged; Ctrl-Left/Right still stop at an inline (it ends a word for `Segment`).
* **Backspace and Delete** never delete an unseen inline: they delete the visible character (or, with Ctrl, the
  word) beyond, keeping every unseen inline inside it; with only unseen inlines before (after) the caret they join
  the paragraphs and the inlines stay; from a table's edge a paragraph holding only such inlines counts as empty and
  is removed, as an empty one is. Selecting and deleting takes them with it (explicit), but a bookmark is never
  left half: `BookmarkKeep` puts back, where the range was, a mark whose partner is outside the range (Word's
  behaviour: the bookmark shrinks; a partner inside a table or a wrapper that the range covers is in the range). So deleting the paragraph holding a bookmark's start keeps the bookmark, starting
  where the deletion was. A mark with no partner anywhere is not kept; marks inside a table go with the table.
* **Pastes**: as before (`ClipIds.UNIQUE`): in the same document bookmarks become their (empty) text, so a pasted
  copy never duplicates a name or id.
* **The box** (`BookmarkBox`): Add (Return) closes it, Delete and Go to keep it open; Close / Escape changes nothing;
  a refusal beeps and says why. One box per document (`bookmark:<docKey>`), deleted with the document.
* **Performance**: every command walks the document once (`marks`): 10,000 bookmarks in 10,000 paragraphs listed,
  added, gone to and deleted in well under a second together (`bookmarks.test.mjs`); the popup shows at most 200
  names.
* **User guide**: part 8 of `$.Docs.Word` ("Hyperlinks" and "Bookmarks", after the symbols; the rules for deleting and
  for Left/Right and Backspace/Delete beside marks are also in part 3). Questions BM1..BM7 are in "To check in real Word
  (links, bookmarks, format painter, word count, Batch A task A6)".

## Format painter (Batch A, A6.3): the rules

* **Picking** (`FormatPaint.pick`, run when the button or the menu item is used): a caret takes the character format
  where text typed there would get it (`OpsText.fmtAt`) and its paragraph's format; a selection inside one paragraph
  only the character format of its first character; a selection that reaches the end of its paragraph (or goes on to
  the next) also the paragraph's format: `pPr` (with its list, `numPr`) and `pStyle`. Nothing to pick (a table, no
  selection) beeps and the painter stays off.
* **Using**: Select on the toolbar's button (row 2) or Format > Format painter = once; Adjust on the button = sticky
  (it stays on until Escape or another click on the button; Adjust on a once painter makes it sticky; Select or the
  menu item on an active painter turns it off). The next mouse selection ends the wait, and the painting is done when the button is let go: the Wimp reports a
  click when the button goes DOWN, before any drag is known, so `EditMouse` calls `v.onMousePress` (arms a one-shot
  `pointerup` listener), `v.onMouseDrag` (a drag started: the release paints nothing itself) and, at the end of a
  drag, `v.onMouseSelect` (paints the final selection). A press without a drag paints the word and paragraph at the
  release (also Shift-click and Adjust-click). Keys never paint. Escape ends it and is
  used up (it does not collapse the selection); the pointer shape is not changed.
* **Painting**: the characters get exactly the picked run properties and character style (REPLACE: what the picked
  text does not have is taken away, also inside `rFonts`...; raw run elements are replaced by the pick's); with a
  paragraph pick the paragraph(s) touched get the picked `pPr`/`pStyle` the same way, the list included (a plain pick
  takes a list item out of its list). A click paints the word there (and the paragraph when the pick has one); the
  selection after painting is the one the mouse made. One undo step; a paint that changes nothing makes none.
  Characters of inlines written outside any run (links, bookmarks) are skipped.
* **Performance**: 50,000 paragraphs painted at once and undone in well under 5 s (`formatpaint.test.mjs`).
* **User guide**: part 5 of `$.Docs.Word`, "The format painter" (and the Format menu and toolbar lists). Questions FP1..FP6
  are in "To check in real Word (links, bookmarks, format painter, word count, Batch A task A6)".

## Word count (Batch A, A6.4): the rules

* **What is counted**: see `WordCount` above. The text of a link and the result of a field are in, a field's codes
  (`w:instrText`, `w:fldChar`) and tracked deletions (`w:del`, `w:delText`, `w:moveFrom`) out; footnotes, headers,
  text boxes and drawings are not walked (a table's drawing is skipped too). Tables are walked for their `w:t`
  text, one paragraph per `w:p`; whether a table paragraph counts as a "paragraph" follows the same rule as any other
  (it has a character).
* **Scope**: a range selection counts that range (a table counts when the selection holds or crosses it); a caret or
  no selection counts the whole document. The box says which in its first line.
* **No keys**: Word's Ctrl-Shift-G is Find previous here; the count is only on the Edit menu.
* **Performance**: one pass over the text (1,000,000 words in about 0.15 s in `wordcount.test.mjs`); the table walk
  is iterative (a 200,000-deep table does not overflow the stack) and capped at 1,000,000 nodes.
* **User guide**: part 3 of `$.Docs.Word`, "Word count" (the last subsection; the Edit menu sentence points at it).
  Questions W1..W4 are in "To check in real Word (links, bookmarks, format painter, word count, Batch A task A6)".

## Tab stops (Batch A, A4.1): the rules

Modules: `TabStops`, `TabAlign` (rows above); `LineLayout`, `LineLabel`, `LineTokens`, `Fmt`, `DocStack`,
`DocPaint`, `FormatCheck`, `FormatPara` changed for them. The ruler: `RulerTabs`, `Ui/RulerTabPaint`, `FormatTabs`
(A4.2). The Tabs dialog (A4.3). Hardening, round trip, hand-off and the guide: A4.4 (last bullet).

* **Measured from the MARGIN** (Word), in twips; on the screen px = twips / 15, rounded to 1/64 px (exact in binary,
  so a tab's `x + w` is the next item's `x` after alignment moves both: the `hitTest(caretRect)` round trip holds).
* **Which stops.** `TabStops.resolveTabs(styles, para)` merges the pPr layers of `Styles.paraLayers` (document
  defaults, the style chain from its root, the direct pPr; NOT `resolvePara`, whose `StylesMerge.mergeInto` replaces
  arrays whole): a layer's stop replaces one at the same position, `clear` removes an inherited one (a clear with
  nothing under it does nothing). Strict `start` / `end` are left / right, `num` is left. A layer's `w:tabs` kept raw
  (257 or more stops, a `w14:` attribute, a position beyond +-31680 twips or one given twice) is read for the screen only (prefix `w` or the node's own `xmlns`). At most
  256 entries of a layer are read and the 64 leftmost merged stops used (10,000 stops in a file: < 1 ms per
  paragraph). Cached per paragraph object and styles table (`WeakMap`); `Fmt.paraFmt` gives them as `tabs`.
  A numbering level's own `w:tabs` are not merged (rare; its stop at the indent is the hanging stop anyway).
* **The default stop** `TabStops.defaultStop(doc)`: the first `w:defaultTabStop` of `doc.rawSettings` (namespace
  matched; twips, or a number with a unit as Strict allows), 720 when absent or outside 36..31680; cached per settings
  root. `DocStack` passes it to `layoutPara` (`defPx`); the settings root's identity is in `DocItems`' reuse key, so
  a new root (A4.3's dialog) lays every paragraph out again.
* **Where a tab goes** (`nextStop(stops, x, leftPx, defPx, maxX)`): the first custom stop right of `x` (a bar never
  stops the text); when `x` is left of the left indent (a hanging indent's implicit stop) only a custom stop before
  the indent comes first, default stops before it are not used; else the next multiple of the default stop from the
  margin (custom stops clear the default ones left of them). A
  stop at `x` itself does not count (two tabs never land on one stop). A stop past the right indent is pulled back
  to it, keeping its kind; a tab with no stop before the right edge goes to the edge and the text after it wraps
  normally (T3). Negative stops are never reached.
* **Right, centre, decimal** (`TabAlign`): the tab item is placed with no width; the segment after it (to the next
  tab or the line's end) is laid out from there, and when it closes the tab widens so the segment ends at the stop
  (right), is centred on it (centre) or has its first `.` at it (decimal; no point: as right); spaces after the
  segment's last non-space are not counted (they hang past the stop). The line-fit test uses the lined-up end, so a
  right tab at the margin does not wrap its text early. A segment that no longer fits before its stop (or, centred,
  before the margin) leaves the tab with NO width: the text goes on right after the text before the tab and wraps as
  usual (Word; T1). Only `x` and `w` change.
* **Leaders** (`dot`, `hyphen`, `underscore`, `heavy`, `middleDot`) are `item.leader` on the tab item; `DocPaint`
  fills the item in the tab's own format: whole characters on a grid of their own width counted from the margin (so
  successive lines' dots line up), or a line under it (heavy twice as thick).
  **Bar stops**: `line.bars` (px from the margin, every line of the paragraph), drawn as 1 px black vertical lines the
  line's height. Display only: never text, never in `from`/`to`.
* **Tabs elsewhere.** A tab in a wrapper's text (a hyperlink's, a field result's) is a tab token too (it was drawn as
  a character): one more shown piece of the wrapper, `[i+1, i+1)`. A justified line with a tab is not spread (as
  before). A list label's tab suffix uses `nextStop` too (G6), with the text at the indent when the label ends exactly
  there (a right-aligned number).
* **Commands.** `FormatCheck.paraPatch` turns `tabs: []` into `null` (a `w:tabs` needs at least one `w:tab`);
  `FormatPara.explicit` writes `tabs` as given (direct stops; a removed style stop is a `clear` in them): set with
  `setPara`, written and read back (`formatcheck.test.mjs`). The dialog's command is `tabsBox` (A4.3, below).
* **The ruler (A4.2).** It shows the stops in force of the first paragraph the selection touches (as the indent
  markers do; a mixed selection is not merged): the paragraph's own black, its style's grey. A Select click away from
  the markers (inside the text: 0..text width) adds a stop of the selector's kind, snapped to 1/16 inch (Shift: free);
  the selector (the box at the ruler's left end) cycles left, centre, right, decimal (a bar stop only from the
  dialog), kept per window. A stop dragged moves (snapped, Shift free, kept in the text; dropped on another stop it
  replaces it); dragged with the pointer more than 16 px below the ruler it is removed (it disappears while there).
  Each gesture is ONE `view.format('tabs')`: one undo step over every selected paragraph, applied to each paragraph's
  own (direct) stops: add puts the stop in each; remove drops each one's own stop there and writes `clear` where the
  style has one; move takes each paragraph's own kind at `from` (else the dragged stop's). A stop the same as the
  style's is not written. Refused with a beep, nothing changed: a paragraph whose own `w:tabs` is kept raw (the model
  cannot hold it: w14 attributes, 257 or more stops, a position beyond +-31680 twips (22 inches) or two stops at one
  position; editing it would lose them; the Tabs dialog follows the same
  rule), or one that would have more than 64 own entries. Where a stop and an indent marker are at the same x
  (within 1 px) a press from 60 % of the ruler's height down takes the stop, higher the indent triangle
  (`RulerPick`); the box and the first-line triangle keep their bands.
* **The Tabs dialog (A4.3).** Format > Tabs... (and the Paragraph box's Tabs... button) opens one box per
  document (`tabs:<docKey>`), filled from the first paragraph the selection touches (its stops in force, as the
  ruler shows them) and `TabStops.defaultStop`. Set, Clear and Clear all change only the box's list; OK (which also
  sets the position typed, as Word does) makes ONE `tabsBox` command: the same edits on every selected paragraph's
  own stops (`FormatTabs` `{edits}`: Clear all is `{set: []}`, so a style's stops are written as `clear`), and a new
  `w:defaultTabStop` in `settings.xml` through `setDocPart 'settings'` with a NEW root (`SettingsEdit`), one undo
  step for both; only the default changed: only the `setDocPart`. The new root's identity is in `DocItems`' reuse
  key, so every paragraph is laid out again; the ruler's grey default marks come from the same `defaultStop`.
  A document with no settings part shows 0.5" shaded (creating the part is out of scope). A position the field
  shows to a hundredth of an inch means the stop at that place (`TabsPatch.placeOf`). Refused with a beep: a
  position that is not a length or past 22", Clear with no stop there, a 65th stop, a default outside 0.025" to 22"
  (36..31680 twips), the raw `w:tabs` rule above, more than 64 own entries; a stale box (selection or document
  changed) beeps at OK and is filled again. A bar stop can be set only here.
* **Hardening, round trip, hand-off, guide (A4.4).** No product bug was found. `tabs-roundtrip.test.mjs` (random
  `tabs` add / remove / move / set and `tabsBox` {edits, defaultTab} commands with hostile positions, kinds and
  leaders, mixed with typed Tabs, Enter, deleting ranges, paragraph styles and undo / redo bursts, on the reader and
  list fixtures, documents with stops in styles / docDefaults / Strict stops / a raw `w:tabs` of 257 stops / settings
  with and without `w:defaultTabStop`, and the corpus sample; the `roundtrip-lib` checks plus: a refused command
  throws RangeError and changes neither the model, the settings root nor the undo depth; a stop reads back as the
  resolved stop; only `w:defaultTabStop` differs in settings.xml) and `word-tabs-hostile.mjs` (a paragraph with 10,000
  raw stops: 64 shown, every edit refused; stops at +-31680 and far beyond in a file; 1000 ruler adds (at most 64 own
  stops) and a 1000-command churn; Tab storms in a right-tab line; 500 random actions with undo of everything).
  Facts they pinned: the `add` / `move` commands CLAMP a position past +-31680 to the limit (a non-number, NaN or
  Infinity is refused); `view.format` returns false for a refused gesture but does not beep (the ruler's `RulerBind`
  does); the history keeps 1000 steps (`maxSteps`), so a storm of more than 1000 undoable Tabs cannot be undone
  whole. The user guide is part 6 (Paragraphs: "Tab stops", the ruler's selector, the Tabs box). Questions T8 to T12
  and the hand-off files are in "To check in real Word (tab stops, Batch A task A4)".

## Borders and shading on the screen (Batch A, A5.1): the rules

Modules: `BorderResolve`, `BorderGroups`, `BorderPaint` (row above); `DocStack`, `DocPaint`, `MarkPaint`, `Fmt`,
`LineLayout`, `Justify`, `Format`, `SectDeco`, `FlowDeco`, `Styles` changed for them. The Borders and shading dialog
is A5.2 (next section); the user guide is part 6's "Borders and shading", and the hand-off files and questions BD1.. are in "To check in real Word (borders, symbols, case, Batch A task A5)" (A5.5).

* **What is in force.** A paragraph's sides come one by one from the highest pPr layer (document defaults, the style
  chain, the paragraph) that gives that side, and each side is taken whole: a direct `w:top` without a colour does
  not keep the style's colour. `w:shd` (paragraph and run) is taken whole from the highest layer that has one. This
  is Word's rule as believed. Strict's `w:start` / `w:end` sides are the left / right ones (read from the raw
  element, which stays as it was: the model has no field for them). `Styles.resolvePara` / `resolveRun` still merge `pBdr` and `shd` attribute by
  attribute (`mergeInto`), so nothing that shows or reports borders and shading may read them from there.
* **Raw elements** (`w:themeColor`, `w:themeFill`, a w14 attribute...: kept raw by `ReadPropsMore`) are drawn best
  effort: their `w:val`, `w:sz`, `w:space`, `w:color`, `w:fill`, `w:shadow` where valid, so a theme colour shows as
  the RGB value Word writes beside it; a foreign or rebound element is ignored; nothing raw is ever changed.
  `Format.query` reports what is drawn.
* **Edges.** `single`, `double`, `dotted`, `dashed`, `thick` are drawn (`thick` as a solid line of its width), every
  other style as single; `nil` and `none` are no side; shadows, frames and the `bar` side are not drawn (they still
  count for sharing a box). Widths: `sz` (eighths of a point) clamped 2..96 (4 when missing), one line `round(sz / 6)`
  px, at least 1; double: two lines with one line's width between (3 times as wide). `space` (points) clamped 0..31.
  Colour `auto` (or missing) is black.
* **Where.** Left and right edges are in the indent area, outside the text: the left edge's inner side `space` px
  left of the box's inner left (`inL`: the left indent, or the first line's start when a hanging indent puts it
  further left, so a list label is inside), the right edge `space` px right of the right indent. The top edge is
  `space` px above the first line's top, the bottom edge `space` px below the last line's bottom; `space + t` px is
  added as a gap above / below the paragraph (`DocStack`), so the text never moves within its own lines and the
  edges sit inside the space before / after when there is room. The gaps belong to no item, but a click in the gap
  above is the paragraph's first line and one in a bottom border's gap (also at a section's end, above the band, which
  starts after it) the paragraph's last line (`DocLayout.hitTest`).
* **One box.** Consecutive paragraphs share a box when no kept block is between them, the upper one does not end a
  section, the lower one has no page break before, their resolved `w:pBdr` are the same definition (every side,
  `between` and `bar` included, equal attribute by attribute as written: val, sz, space, color, shadow, frame; so a
  `wave` and a `single` side, sz 0 and 2, `auto` and `000000`, nil and no side all keep them apart although some draw
  alike) and their left and right indents are equal (each keeps its own `inL`: review ruling); paragraphs with shading but no drawn side share one only with an equal
  fill (question BD1). In a box the first paragraph has the top edge, the last the bottom edge, the others the
  `between` edge above them when it is set (with its `space + t` gap), and the side edges and shading run on through
  the space between paragraphs.
* **Shading** fills inside the edges: from the top edge (else the first line's top: not the space before) to the
  bottom edge (else the last line's bottom: not the space after), across from `inL` (less the left edge's space) to
  the right indent (plus the right edge's space), and through the space between paragraphs of one box. It is drawn
  for every item in the rect before any text, and the edges after all of it. Character shading is drawn behind its
  item the line's full height, like the highlight, and the highlight over it.
* **Reuse.** A box depends on the neighbours: `borderDeco.keyOf` gives the line arrays of the items above and below
  (a kept block's block), which `DocItems` keeps only under their reuse key, so an edit, a restyle or a level change
  next door asks again; it gives null when the item's (still valid) result has no box. `layout-prop` checks reuse
  against full layouts with random borders, shading, indents, page break before, section breaks, Enter, joins,
  replaced styles and undo. Paragraphs that look the same share one frozen info and one result per way of joining
  (and paragraphs whose own pPr adds nothing share their style's): thousands of small objects per paragraph slowed
  every later layout down (Node: 50,000 bordered paragraphs' relayout after a keystroke 15 ms -> about 11 ms against
  8.5 ms without the decorator).
* **Timings** (Chromium, `word-borders.mjs`): 50,000 paragraphs bordered and shaded through their style open in about
  2.1 to 2.2 s, as fast as their twin whose sides and shading are all nil (reading the file and `resolvePara` merging
  the style's `w:pBdr` for every paragraph: the plan's 2 s is NOT met, a debt from before A5.1, about 2.1 s at the
  commit before it); with `w:pBdr` and `w:shd` on every paragraph about 3.1 s against 2.8 s for its nil twin
  (reading the larger XML). The test guards drawing's share: at most 0.5 s over the nil twin, and a keystroke within
  5 ms of the twin's and a plain document's (about 12 ms against 11 ms).

## The Borders and shading dialog (Batch A, A5.2): the rules

Modules: `BorderNames`, `BorderPatch`, `BorderExplicit`, `BorderCommand`, `BorderBox` (module table); `FormatCheck`,
`FormatPara`, `FormatSet`, `FormatApply`, `FormatMenu`, `WinMenu` changed for them.

* **The box.** Format > Borders and shading... opens one box per document (`borders:<docKey>`, deleted with the
  document; always a Cancel): Setting None / Box / Custom (radios; None and Box set the side options, a side clicked
  makes the setting what the sides are), Top, Bottom, Left, Right, Between (options), Style (Single, Double, Dotted,
  Dashed, Thick), Width (1/4, 1/2, 3/4, 1, 1 1/2, 2 1/4, 3 pt), Colour (`Ui/ColourPopup`, Automatic allowed), Fill
  (None or Colour, with a colour button: Word's light grey `D9D9D9` until one is picked) and Apply to Paragraph /
  Text. It opens filled from `view.query()`; a mixed value is empty and changes nothing unless touched. Apply to
  Text shades every border control (text gets shading only) and shows the selected text's shading.
* **OK** is one `view.format` (one undo step; none when nothing changed): Paragraph: `borders` with each side turned
  off (null) or on / restyled (written whole: the fields' style, width and colour, a field left empty keeps the
  side's own value, else single, 1/2 pt, auto; the side's own space, shadow and frame kept, and a side without
  `w:space` stays without: its edge must not move; only a NEW side gets Word's spaces, 1 pt above and below and
  between, 4 pt left and right) and the fill (`{val: 'clear', color: 'auto', fill}`, or null for None; Fill None
  shown and chosen is no change, whatever the colour button holds). Text: `charShade` over the selected characters
  (at a caret, the pending format). Beeps with the box kept and nothing written: a value it does not offer, a mixed
  selection (no side known) whose Style, Width or Colour changed with no side chosen (nothing to draw them on:
  `BorderPatch` bad `sides`), a refused command, a selection or document that changed while it was open (then
  filled again).
* **Whole sides and shading.** Word holds a side and a `w:shd` as one thing: a command writes every attribute (null
  for absent ones) so `mergeProps` replaces the old side / shading instead of keeping, say, its old colour. A side the
  paragraph's styles give exactly is not written (and an own one removed); turning off a side a style draws writes
  `{val: 'nil'}`; Fill None over a style's shading writes `clear` / `auto` / `auto` (Word's "No Color"). The styles'
  values come from `Styles.paraLayers` / `runLayers` read whole (`BorderResolve`), never from `resolvePara`, which
  merges sides attribute by attribute.
* **Raw elements.** A paragraph whose own `w:pBdr` is kept raw (a theme colour, a w14 attribute, Strict start/end in a
  Transitional file or left/right in a Strict one) is never given a border command: writing one side would drop the raw element and its other sides
  (`props-more.test.mjs`'s "an edit of a field replaces its raw element"). The command is refused (RangeError) and the
  box beeps, as for a raw `w:tabs` (`FormatTabs.isRawTabs`). The same for a paragraph's own raw `w:shd` when the
  shading is to change, and a run's own raw `w:shd` for the text's shading. A raw element in a STYLE is never touched
  (the paragraph's own value is written over it).
* **Names.** Commands accept only Word's schema names (`BorderNames`: `ST_Border`, `ST_Shd`); a file's other names are
  kept by the reader and drawn best effort.
* **User guide (A5.5):** part 6 of `$.Docs.Word`, "Borders and shading" (the box, what is refused with a beep, how boxes
  are drawn and joined, what is not drawn); part 6 is now titled "Paragraphs: spacing, tabs, borders and shading". No part
  number moved in A5: still 17 parts, "Word, part 16" in `tools/docs/Contents` is still the programmers' part. Questions
  BD1..BD10 are in "To check in real Word (borders, symbols, case, Batch A task A5)".

## Symbols and special characters (Batch A, A5.3): the rules

Modules: `CharSets`, `Ui/CharGrid`, `Ui/CharGridPaint` (WimpLib), `SpecialChars`, `SymbolBind` (module tables);
`InsertApply`, `InsertMenu`, `Keymap`, `EditRun`, `DocKeys`, `ClipClean`, `TestHook`, `WinMenu` changed for them.

* **Symbols are ordinary text.** A symbol is a Unicode character typed through `view.input` in the current font: no
  `w:sym`, nothing new in the file. Only characters that Carlito and the two Liberation families have are offered (`CharSets`; the
  `cmap` test), so the usual fonts draw the font's own shape; in Caladea or Courier-like text a missing glyph is the
  browser's fallback.
* **How the grid draws.** On a canvas in the grid window, 19 px, in the bundled family Carlito (`font` option),
  not as icons: Homerton (the menu font) lacks most symbols and an icon's text cannot be told which family to use
  without a `font` flag per icon. Page text is drawn by `EditPaint` in the document's own font as ever.
* **One step per insert.** `putChar` ends the typing's undo step before and after, so two symbols in a second are
  two steps and typing after a symbol starts a third. The pending format (Ctrl-I at a caret, then a symbol) is applied
  because the symbol is typed, not run as a command; the grid taking the caret does not drop it (only a moved caret
  or a changed selection does: `Pending`).
* **AutoFormat lists.** `EditInput` offers a list marker to `AutoList` only for a typed `' '`; no set holds a space
  and U+00A0 is another character, so a symbol (or Ctrl-Shift-Space) after `1.` makes no list
  (`word-symbols.mjs` types `1.` + Ctrl-Shift-Space and `1.` + Space).
* **Which document.** The grid works on the document whose window last had the caret (`attachSymbols`), as the Find
  box does. A click on the grid does not change it (the grid is not a document window). A document that closes
  stops being the active one; the grid then beeps and says so. The grid is one per task and is never tied to a
  document, so unlike the dialogs it needs no per-document key or deletion.
* **The keys.** `nbsp` (`Ctrl+Shift+Space`) is typed text U+00A0 with the pending format (`EditRun` calls
  `view.input`); `InsertApply.insert('nbsp')` is the form without pending format (used by tests, and the one the
  command table has). `nbHyphen` (`Ctrl+Shift+-`, and `Ctrl+Shift+_` because the browser names the key `_` with Shift
  on a US keyboard) and `softHyphen` (Insert > Special character > Optional hyphen, no key) replace the selection
  with a U+FFFC whose inline is `{kind: 'raw', level: 'r', node: w:noBreakHyphen | w:softHyphen}` (one `d.atomic`,
  `replaceText` with `inlines`, the format of the text before); the writer puts the node in the run
  (`<w:r><w:rPr/><w:noBreakHyphen/></w:r>`), `LineTokens` draws `-` and nothing. A soft hyphen takes one caret step
  though it shows nothing, as the other unseen inlines do. A Mac has Ctrl there too (`MacKeys` maps no Cmd chord for
  them; Ctrl-Shift-Space may be taken by macOS input source switching on some systems).
* **Across documents.** `ClipClean` (cross-document and HTML paste) used to turn every raw inline without display
  text into nothing; a bare `w:noBreakHyphen` / `w:softHyphen` (no attributes, no children) is now kept as a new
  inline (a fresh `w:` node), as a page break is, so a copied hyphen survives. Pasting through the system clipboard's
  HTML still drops it (HTML has no such character).
* **Text of the hyphens** (`InlineText`, pure; used by `Selection.text`, `ClipSlice.paraPlain`, `ClipHtmlRun` and
  `FindText`): a bare `w:noBreakHyphen` inline is `-` (U+002D) outside the drawing, so copied text, HTML and the
  selection's text show a hyphen to other programs ("well-known" copies as such) and a Find needle `-` or `well-`
  matches it; a `w:softHyphen` is the empty string. Find treats a match that holds the inline like link text: it is
  found and counted, but never replaced (`inInline`, `skipped`), so Replace does not map `-` back to an inline and a
  pasted `-` is plain text. A hyphen with attributes or children is not "bare" and has no text.
* **Pending format.** `EditRun` hands the pending format (Ctrl-B at a caret) to `nbHyphen` / `softHyphen` as `arg`
  `{rPr, rStyle}`; `InsertApply.putIn` applies it on top of the text before (`OpsText.fmtAt` + `Pending.applyTo`), so
  the inline is in a bold run and what is typed next goes on bold (`word-symbols.mjs`: Ctrl-B, Ctrl-Shift--, x).
  `nbsp` is typed, so it takes it the usual way. The pending format is used up by either.
* **Overwrite mode** (Insert key): a symbol from the grid replaces the next character like any typed text (left as
  it is; a question for real Word's Symbol box).
* **To check in real Word** (A5.5's hand-off list): that `<w:noBreakHyphen/>` and `<w:softHyphen/>` in a run with
  `rPr` open without a repair prompt and behave (never break / break only at the end of a line).
* **User guide:** part 8 of `$.Docs.Word`, "Symbols and special characters" (the window, the sets, the Recently used row, the
  special characters, the hyphens, the keys), with the guesses at the end of part 8. Questions SY1..SY5 are in "To check in real Word
  (borders, symbols, case)".

## Change case (Batch A, A5.4): the rules

Modules: `ChangeCase` (module table); `FormatApply`, `Keymap`, `FormatMenu` changed for it.

* **Lengths never change.** A character whose case form is longer or shorter than itself is left as it is; this
  keeps every offset, run and inline of the paragraph, and means `ss` and `\u00DF` are not exchanged. It is also why
  "Capitalize Each Word" cannot make `\uFB01` (the fi ligature) into `Fi`.
* **The rest of a word is made small in title case**, as in sentence case. Whether Word's Capitalize Each Word does
  that or leaves the other letters alone is not known to be the same: **to check in real Word** (a hand-off line in
  A5.5).
* **A caret** changes the word it is in or ends; between spaces, in an empty paragraph or on a table nothing happens
  (no step, no star). The caret itself stays where it was, as does a selection.
* **The cycle** is Word's Shift+F3 order seen from the text: capitals, then small letters, then Title Case, then
  capitals; a sentence or any mixture goes to capitals first. A step that would change nothing (`3rd` has no Title
  Case form; a word starting with the fi ligature) is skipped for the next one, at most three tried, so Shift+F3 is
  never stuck. A text with no letters that have a case does nothing.
* **To check in real Word:** what Shift+F3 does after Sentence case (here: a sentence is "mixed", so it goes to
  capitals); whether Capitalize Each Word makes the rest of a word small; whether a Symbol typed in overwrite mode
  replaces the next character; and that Ctrl+Shift+- is not taken by the browser's zoom out (Chrome/Firefox: Ctrl+-
  zooms; the core `preventDefault`s every key while a caret exists, but a browser may keep the shortcut).
* **Not a dialog**: no option box; `Change case >` in the Format menu lists the modes. It has no toolbar button.
* **Tests**: `changecase.test.mjs` (unit, 32 tests) and the browser `word-case.mjs` (Shift-F3 by a real key, F3 still
  Save as, the menu).
* **User guide**: part 5 of `$.Docs.Word`, "Changing case", the keys list and the Format menu list. Questions CS1..CS6 are
  in "To check in real Word (borders, symbols, case, Batch A task A5)".

## Hardening, round trip, hand-off (Batch A, A5.5)

No product bug was found: nothing under `tools/moreapps` changed for the tests.

* `borders-roundtrip.test.mjs` (unit): 40 seeded commands per document (fixtures, list documents, eight border / shading
  / case / symbol documents of its own, the corpus sample), four seeds each, through `roundtrip-lib`: the model read
  back equals the changed one, `checkBlock` after every step, linter, `xmllint` against wml.xsd for one seed, undo
  of everything gives the opened model and its bytes. Commands: `borders` (a box, random sides, all sides off, bad
  arguments), `paraShade`, `charShade` (hostile names, widths, spaces, colours), `changeCase` (every mode and a bad
  one), `caseCycle`, symbols typed as text, `nbsp` / `nbHyphen` / `softHyphen` through `EditApply`, Enter, deleting,
  styles (one with a box and a fill) and undo / redo bursts. A refused command (`RangeError`) must leave the model and
  the undo depth alone; every kind must have run (more than 5 times) and the changing ones changed documents. Pinned: a
  box reads back as the very sides and shading; the refusals (a paragraph's or a run's own raw themed `w:pBdr` /
  `w:shd`, a made-up name, a bad width, a bogus key) change nothing and the raw elements are still in the saved
  `document.xml` after other commands; `w:noBreakHyphen` / `w:softHyphen` in the saved XML.
* `word-borders-hostile.mjs` (browser, 7 checks): 50,000 bordered and shaded paragraphs in one box (open about 3.2 s,
  under the 8 s bound; one `borders` command over all of them about 1.2 s and one undo, back to the opened model);
  a file with widths 0 and 96, spaces 0 and 31 and absurd values (finite layout and gaps) and the commands with
  hostile `sz` / `space` / `val` (never an exception out, widths 0..96, spaces 0..31); theme colours kept raw (drawn in
  the colour beside the theme name, read from the canvas; `view.format` gives false and no undo step for borders,
  paragraph shading and a run's shading; the beep is the Borders box's, tested in `word-borders.mjs`); 900 real
  Shift-F3 presses (undo to the opened model) and 100 more (the cycle is where the three-step cycle leaves it); the
  Symbol window open while three documents close in turn (it follows the last one clicked in, beeps with none, and
  works for a new one; one extra window, the grid itself); 500 seeded random actions (keys incl. Shift-F3 and
  Ctrl-Shift-Space / -, text, clicks and drags, the border / shading / case ids with hostile arguments, the grid's
  Insert, the Format and Insert menus' items) with undo of everything.
* The history keeps 1000 steps (`maxSteps`), so the 1000-press test undoes only the first 900 presses to the opened
  model.
* Hand-off files (`handoff-borders.mjs`, local): see "To check in real Word (borders, symbols, case, Batch A task A5)".

## Hardening, round trip, hand-off, docs and the batch wrap-up (Batch A, A6.5 and A6.6)

Two product bugs were found and fixed by the tests (the rest is tests, the generator and docs):
`LinkOps.editLink` threw a `TypeError` for an address that was not a string (`null`, a number, an object) where it must
give `{error}` (it now sends it to `target()`, which refuses it); and `BookmarkBox` wrote its "N bookmarks: the list
shows the first 200" note and then cleared it (the message was set before the line that empties it), so the note
never showed on opening.

* `links-roundtrip.test.mjs` (unit): 40 seeded commands per document, four seeds each, through `roundtrip-lib`: read
  back equal, `checkBlock` after every step, linter (no `rid-unresolved`: a link's relationship must be in the rels),
  `xmllint` for one seed, undo-all gives the opened model and bytes (relationships and styles included). Commands:
  `insertLink` / `editLink` / `removeLink` with good and hostile addresses, anchors, texts and ScreenTips,
  `addBookmark` / `deleteBookmark` / `goTo` with hostile names, `FormatPaint.pick` + `paint` between random
  selections, `WordCount.count` (must change nothing), character formats, typing, Enter, deleting ranges, styles
  (one named Hyperlink), undo / redo. A refused command (`{error}`) must leave the model and undo depth alone. Own
  documents: plain text, formatted runs, links (web, mailto, anchor, ScreenTip, a missing `r:id`), a document with its
  own Hyperlink style, bookmarks (across paragraphs, hidden, duplicate names, clashing ids, a 2^31-1 id, an orphan
  end), a bookmark in a table, Strict hyperlinks, an empty document. The reader fixture `lossless rule` is left out:
  a character-format command splits a run there whose raw `rPr` children are the same set in another order, the
  writer sorts them, and the reader merges the halves (the read-back equality check then sees one run fewer). That is
  not an A6 command (the format round trip has the fixture with other seeds); no file content is lost.
* `word-links-hostile.mjs` (browser, 14 checks, in `index.mjs`): see the header. No network request is made for any
  address (the page's requests are recorded).
* `handoff-links.mjs` (local): `lnk-1-links.docx`, `bm-1-bookmarks.docx`, `paint-1.docx`, `lnk-README.txt` (H1..H4,
  BM1..BM7, FP1..FP6, W1..W4, and the word counts !Word shows). `handoff-index.mjs` writes `INDEX.txt`, one list of
  every Batch A hand-off file (sp, nl, brk, tab, bdr, sym, case, lnk, bm, paint) with its README and what to try, for
  one real-Word session.
* **Final guide parts** (`tools/docs/Word`, 17 parts; no number moved in A6): 1 Starting, 2 What you see, 3 Typing,
  deleting and undo (and Word count), 4 Copy, paste and find, 5 Formatting (and the format painter), 6 Paragraphs:
  spacing, tabs, borders and shading, 7 Lists, 8 Inserting: breaks, symbols, links and bookmarks, 9 Saving, 10 New
  documents, closing and quitting, 11 What is kept, 12 Fonts, 13 What it will not open, 14 Safety and privacy, 15 What
  is coming, 16 For programmers (the "Word, part 16" in `tools/docs/Contents`), 17 Things to know. Every pointer in the
  guide, `Contents`, the README, `tools/moreapps/!Word/!Help` and this file was checked against this list.

## Final review of Batch A: what changed

* Tab stops: a `w:tabs` with a position beyond +-31680 twips or a position given twice is kept raw
  (`ReadPropsMore.tabs`), so the commands refuse it with a beep instead of silently dropping or merging stops.
* Strict documents: `w:ind` and `w:pBdr` use Strict's `start` / `end` names (see "Strict documents").
* Lists: Restart / Start at that would change no label makes no undo step and no `w:num`; Bullets / Numbering take an
  unused `w:num` of exactly the entry's definition before adding one (`ListUsed.reusable`), so toggling a list off and
  on does not grow the numbering part; the List Paragraph style added is based on the document's default paragraph
  style; `ListUsed.usedNumIds` also looks in paragraphs' raw `pPr` / `rPr` elements and styles' raw nodes.
  `list-make-prop.test.mjs`'s reference model has both rules.
* Bookmarks: a deletion whose range ends on tables both sides puts a kept mark at the nearest paragraph
  (`BookmarkKeep.putMarks`), so a pair is never broken.
* The Paragraph box's stale check is `TabsBox.where` (selection and `stateId`), except for its own Tabs box's OK; the
  format painter is detached when its window closes (`PaintBind.detachPainter` from `CloseDoc.destroy`).
* Tests: `docx-compare.withNewParts` takes only styles / numbering relationships to added parts; `roundtrip-lib`
  passes over an xmllint "attribute ... is not allowed" for a Microsoft extension attribute only when the opened part
  already has that attribute on that element (`extAttrs`, `extKey`), so a w14 attribute the writer added would fail.

## Documents (deliverable 6a): the rules

* **Saved state.** `Document.stateId` is the id of the history state (the same after undo/redo back to it);
  `markSavedAt(id)` marks that state saved: `markSaved()` when it is still current, else only the marker moves, so the
  `*` stays and undo back to the written state is clean. A save (`DocSave.write1`) commits composing text, ends the
  typing step (`breakCoalesce`), takes `stateId`, awaits `writeDocx` (its parts are built before its first await, so
  the bytes are that state), writes with `vfs.writeFile(path, bytes, {filetype: 0xA7E})` and only then marks. Any
  error: nothing marked, the `*` stays.
* **Saves in turn.** `writeTo` chains each window's saves; the first starts synchronously. A Save on a titled document
  takes `dw.path` when it runs. A queued save whose window was closed with changes made after it was asked (Discard)
  writes nothing (`null`). 1000 rapid Saves of a small document take about 1 s (`word-documents-hostile.mjs`).
* **The pending save.** `save()` of an untitled document opens the Save as box and returns one promise per window
  (`waiting`): true once the box has saved it, false when the box closes and stays closed (a menu reopened over it
  does not count: `MenusDeleted` is awaited). The close prompt's Save awaits it.
* **The Save box.** The core `saveAs` OK button needs a name with `.` or `:`, so the box is filled in with a full path
  (`SaveState.suggestName`: the document's path, or the directory of the newest Recent entry (else `$` of the hard
  disc) and `safeLeaf(leaf)`: `Untitled 2` -> `Untitled2`, a leaf cannot hold a space; when that file exists, the
  next free `Untitled2`, `Untitled3`...). OK onto another existing file asks Replace / Cancel (`Replace`; Return and
  Escape = Cancel); Save a copy asks even over its own file; a drag of the icon replaces without asking, as everywhere
  on the desktop. Saving onto the file of another open window is refused (`canWrite`, checked before
  and after the bytes are made).
* **Closing.** `CloseDoc.requestClose`: Save / Discard / Cancel (`Ui/SaveQuery`, Return = Save, Escape = Cancel); one
  prompt per task at a time (`app.prompt`; another close request brings it forward and beeps).
* **Quitting: the PreQuit contract.** The handler calls `msg.object()` synchronously, before anything awaits, whenever
  `mustAsk` (dirty documents, a close prompt or Save in progress (`app.closing`), or the quit prompt open); it then
  asks once (Discard / Cancel, Return = Discard as !Edit), and on Discard destroys every window and either quits
  (`msg.single`: the Task Manager) or emits `hotkey:CtrlShiftF12` once to restart the closedown. `task.onMessage('Quit')`
  and `task.quit()` stay unconditional. The Task Manager's Exit also sends PreQuit to all: after Discard the restart
  is a shutdown, not an exit (inherited from !Edit; `docs/CHANGES_NEEDED.md`).
* **Revert** is a new `DocWindow` in the old one's place (state, zoom, ruler, focus), the old one destroyed: no
  history, no stale `Typing` or layout. It waits for the window's saves (`idle`), asks (core `query`, Discard / Cancel)
  when dirty, keeps the document when the file has gone or is not a `.docx`.
* **New.** `app.newDoc({paper})` (`NewDoc.newDoc`, A4 unless `'letter'`), clean, keyed `untitled:N`, named by
  `SaveState.untitledName`. The icon bar gets no `double` (every press is a `click`): a click within 500 ms of the one
  that made a document is ignored (the core's `doubleClickMs` is not reachable from `'riscos'`).
* **Recent.** `Choices:Word` `{recent: [...]}`, 8, newest first, canonical lower-case keys; corrupt, hostile or huge
  choices give `[]` (10,000 entries: start-up about 0.2 s, the menu at once).
* **Limits / known minors.** No autosave, no backup file; on a HostFS drive the file is written to the host a moment
  after Save: if the host refuses, the HostFS Filer reports it and the document already shows as saved
  (`docs/CHANGES_NEEDED.md`); the late-commit guard holds for 800 ms after a Save; the quit prompt's count is taken when it opens (a document
  changed while it is open is not counted again); the prompt is sized from the message length (a long name is cut to
  40 characters); naming the single document in the quit prompt was not done; `saveAs`'s `doSave` (core) still calls
  `menus.close()` and `onSaved` after the box was deleted (`docs/CHANGES_NEEDED.md`).
* `docs/CHANGES_NEEDED.md`: five OPEN entries (three-button `query`, the Save box's OK and `doSave`, PreQuit-all ending in
  the shutdown, icon bar double-clicks, HostFS write completion).
* Note for 6b: the Save a copy box's offered name is the document's own path (OK then asks Replace); a "Copy of"
  name may be nicer.

## Clipboard and Find (deliverable 6b): the rules

The modules are in the table above (`ClipSlice`, `ClipHtml`, `ClipHtmlRun`, `ClipRead`, `ClipBuild`, `ClipCss`,
`ClipClean`, `ClipIds`, `ClipPaste`, `ClipStore`, `ClipPick`, `ClipLinks`, `ClipDom`, `EditClip`, `MacKeys`; `Find`, `FindText`,
`EditFind`, `FindView`, WimpLib `Ui/FindBox`); the user guide's part 4 says what the user sees.

* **Core API used** (Task 1, `docs/CORE_API.md` 3.1 / 3.2; `docs/CHANGES_NEEDED.md` "Clipboard events for text
  carets"): the window's caret is `setCaret(win, null, -1, pos, {text: true, blink: true})` (no `clipboard: true`:
  Chromium fires copy / cut with an empty hidden field). The core sends `copy` / `cut` `{window, cut, setData}` and
  `paste` `{text, html, files, window}` to that window; Ctrl/Cmd-C, X, V are left to the browser (the `key` event
  still comes first, `Keymap` maps none of them); `wimp.textInput.exec('copy' | 'cut')` and `wimp.readClipboard()` serve
  the Edit menu inside its click. Caps in the core: pasted text 100,000 units (`sanitizeText`), HTML dropped (never
  cut) over 2,000,000 characters, at most 8 files (never read); copied text 5,000,000 units, HTML 8,000,000.
* **The token route (exact copies).** A copy keeps its `ClipSlice` slice in `ClipStore` under the window's `docKey`
  and puts `<!--word-clip:TOKEN-->` (16 hex digits from 8 random bytes) first in its HTML. A paste uses the stored
  slice only when the HTML holds a token the store still has (the last 4 copies; at most 100,000 blocks and 5,000,000
  units) AND the clipboard's text/plain equals the entry's `plain` after the same cleaning (`ClipPick.samePlain`):
  another program that kept the comment but changed the text gets its HTML read instead. Nothing is ever parsed back
  from the clipboard into blocks: the entry is the slice object itself. `sameDoc` is `entry.docKey === dw.docKey`
  (a counter per window; Revert makes a new window, so a new key).
* **Same document** (exact): everything passes (links, fields, numbering, tables, drawings) except raw inlines holding
  an element whose id must stay unique (bookmarks, comments, tracked changes, move ranges, footnote / endnote
  references, `perm*`, `customXml*Range`): those become their display text. Fresh paragraph ids, `extraP = []`.
  Kept blocks (`ClipIds`): a table whose XML holds such an element, a `wp:docPr`, a `w:id` element (content control)
  or any `*:id` attribute other than `r:id` (change records) is pasted as text (`flatten`: a paragraph per `w:tr`,
  cells joined by tabs; without rows a paragraph per `w:p`; `w:t` text and a run's `w:tab` / `w:br`, nothing under `*Pr` / `*PrChange`); a kept one loses `w14:paraId` /
  `w14:textId` (`keepIds`). Elements with such ids in `pPr.extra` and runs' `rPr.extra` (`w:pPrChange`,
  `w:rPrChange`) are dropped (`dropIds`). Pictures as raw inlines are still kept (duplicate `wp:docPr` id: C7).
* **Across documents** (`ClipClean`, also for !Word's own copies from another window): raw inlines with relationship
  ids (hyperlink `r:id`, drawing `r:embed`) and every other raw inline become their display text (without the
  hyperlink's run formatting) or nothing; tab / br inlines `\t` / `\n`, except a page or column break, kept as a new
  `{kind: 'br', level: 'r', brType}` (no node, no relationship: A3.1); `pStyle` / `rStyle` mapped by style NAME to
  the target's styles (case ignored, type must match) else dropped; every modelled `rPr` and `pPr` field kept (tabs,
  borders, shading, `widowControl`, `contextualSpacing` too: L6, the owner's ruling, as Word) with jc and tab stop
  values spelled for the target (`JcName`), the raw `extra` kept cleaned (`NumClean.cleanExtra`: WML only, nothing
  with an r: attribute or a `w:id`, no style, list, section, div or cnfStyle element); tables (kept blocks) left
  out. Lists (L6): the slice carries the source's `w:num` / `w:abstractNum` nodes (`ClipNums`); the paste copies
  them into the target (`NumCopy`: new abstract with a fresh nsid, new num with the source's overrides, one per
  source list; never merged with a target list, as Word's "keep source formatting"), in the paste's one undo step
  through `setDocPart` (numbering, numberingPart, rels: undo gives them back exactly), and the pasted items name the
  new numIds; a numId missing in the source, a definition over the caps, or no free id in the target: the item is
  a plain paragraph. A paste never adds styles or other relationships; the HTML route makes no list (unchanged).
* **Other programs** (`ClipRead`, whitelist): `DOMParser` (`ClipDom`: an inert document never inserted into the page,
  so no script runs and nothing loads); the walker keeps text and a few checked formats (b i u s sup sub, colour hex /
  `rgb()` / names, the first font family, sizes clamped to 1..400 pt, text-align), unwraps unknown tags, drops script,
  style, iframe, object, img, svg and the like with their content, never keeps an href (links are text), skips
  `display:none` and Word's `mso-list:Ignore`; nesting deeper than 200 is unwrapped, the walk stops after 200,000 nodes,
  text is cut at 5,000,000 units. Headings take `HeadingN` by name (plus direct bold and Word's heading size), list
  items are plain paragraphs, tables a paragraph per row with tab-separated cells. Any failure: the plain text.
* **What !Word puts on the clipboard**: text/plain always (`\n` between paragraphs, a table an empty line);
  text/html (`ClipHtml`: only `p h1-h6 ul ol li b i u s sup sub span br a`, every text and attribute escaped, the
  resolved formatting, `<a href>` only for an External http / https / mailto hyperlink of the document's rels) unless
  over 2,000,000 characters; then text/html is the marker and the plain text escaped in one `<pre>` when that is at
  most 2,000,000 characters (the core's paste cap: the exact route still works, other programs get the text), else
  there is no text/html (other programs and !Word get the plain text; !Word's paste is cut at 100,000 units and says
  so). A collapsed selection copies nothing (the browser's
  default).
* **Undo.** Copy changes nothing; cut = copy + `deleteSelection`, one step; paste = one `d.atomic` through
  `typing.command` (breaks typing's coalescing, drops the pending format), replacing the selection in the same step;
  a `RangeError` from the model falls back to the plain text, any other error is thrown on. Replace = one step,
  Replace all = one step (one `spliceText` per changed paragraph). None of them touches the saved state other than
  through the normal `stateId` rule.
* **Cut short**: the core's `pastePayload` does not pass on `sanitizeText`'s `truncated` flag, so each document window
  adds a capture `paste` listener on the page (removed on `deleted`) that runs `ClipPick.cutShort` (the same cleaning
  and count as `sanitizeText`) on the raw text/plain before the core's listener; the flag lives until a `setTimeout(0)`.
  A plain-route paste of such an event is pasted, then a beep, `dw.clip.status` and `reportError('Only the first
  100,000 characters were pasted: the clipboard held more.')`. A paste through `wimp.readClipboard` (the menu) has no
  raw event: no message (a core flag in the payload would cover it: `docs/CHANGES_NEEDED.md`).
* **Refused pastes and cuts**: a cut while an input method composes (beep, nothing copied or deleted); files only (beep + `reportError('Pictures and files cannot be pasted into a document yet.')`),
  while an input method composes (beep; `dw.clip.last = 'composing'`; a real Ctrl-V during a CDP composition is
  refused the same way: `word-clipboard-hostile.mjs`), nothing to paste (beep).
* **Find**: literal (no patterns), case folding without length change, whole words through `Segment`, grapheme
  boundaries at both ends, never across paragraphs, tables not searched; link text found (one match per link) but not
  replaced (`skipped`). See the `Find` / `FindText` / `EditFind` row above.
* **Measured** (`word-clipboard-hostile.mjs`, Chromium, an M-series Mac): select-all copy of 50,000 paragraphs well
  under 3 s; Replace all over 50,000 paragraphs about 0.9 s (undo about 0.6 s); a 5 MB text paste (cut to 100,000
  characters) about 20 ms; 100,000 paragraphs of HTML about 1 s (about 99,997 paragraphs read before the node limit);
  1000 real Ctrl-V presses about 1.2 s.
* **Open** (`docs/CHANGES_NEEDED.md`): pictures and other rich types from the asynchronous clipboard (`readClipboard`
  reads text and HTML only); the core's `clipboard: true` placeholder for Safari / Firefox is untested and off;
  pasting pictures or files; keeping lists and tables from other programs; the per-character paste into a writable
  icon (Find's fields).

## The data model

Header of `!Word/Model` is the reference. In short:

```
Doc     {sections, styles, numbering, parts, rels, meta, rawSettings}
Section {props: {pgSz?, pgMar?, cols?, titlePg?, type?, extra}, blocks, raw}
Para    {type:'p', id, text, runs, inlines, pPr, pStyle?, extraP}
Run     {start, end, rPr, rStyle?}
Inline  {kind:'raw'|'br'|'tab', level:'p'|'r', node?, text?, brType?}
Opaque  {type:'opaque', node}
```

* **Property fields** (`PropNames`): `rPr` `{rFonts?, b?, i?, strike?, color?, sz?, szCs?, highlight?, u?,
  vertAlign?, shd?, extra}`; `pPr` `{keepNext?, keepLines?, pageBreakBefore?, widowControl?, contextualSpacing?
  (booleans), numPr?, spacing?, ind?, jc?, outlineLvl?, tabs?, pBdr?, shd?, extra}`: `tabs` `[{val, pos, leader?}]`
  in file order (`val` `left center right decimal bar clear num` or Strict `start end` as written, `pos` twips,
  `leader` `none dot hyphen underscore heavy middleDot`; at most 256 stops), `pBdr` `{top?, left?, bottom?, right?,
  between?, bar?}` each `{val, sz?, space?, color?, shadow?, frame?}` (sz eighths of a point, space points, color
  `auto` or hex as written, shadow/frame booleans), `shd` `{val, color?, fill?}`; a section's `type` is `nextPage`,
  `continuous`, `evenPage`, `oddPage` or `nextColumn`. A style's `pPr`/`rPr` has the same fields. Anything with more
  (`w:themeColor`, `w:themeFill`, a `w14:` attribute, a comment inside `w:tabs`...) stays raw in `extra` (the rule
  below). Tab stops are drawn since A4.1 (`TabStops`); nothing draws borders or shading yet, nor honours `widowControl`, `contextualSpacing` or the
  section type.
* **Units:** Word's. Twips (1/1440 inch) for indents, spacing and page sizes; half-points for `sz`; colours are hex
  strings; booleans are real booleans. **Offsets are UTF-16 code units** and never fall inside a surrogate pair.
* **Text and runs:** `text` is the paragraph's text. `runs` are sorted, non-empty, contiguous and cover
  `[0, text.length)`; adjacent runs never have equal formatting (`normRuns`). A tab is `\t`, a plain line break `\n`.
* **Non-text items** (a drawing, a field character, a footnote reference, a hyperlink, a bookmark, a tracked-change
  wrapper...) are one U+FFFC (`OBJ`) each in `text`, described by `inlines[index]` (the key is the index as a decimal
  string). `Inline.level` says where the node belongs when written: `'r'` inside the `w:r` with that run's
  formatting (`w:drawing`, `w:fldChar`, `w:br`...), `'p'` directly in the `w:p` (`w:hyperlink`, `w:ins`,
  bookmarks, a whole `w:r` that cannot be taken apart). `level` is required for `raw` and `br`; `tab` is always `'r'`.
  `Inline.text` is for display only; the writer uses `level` and `node`. A `raw` inline must have its `node`
  (`ModelCheck` refuses one without: it could not be written); a `br` needs its `node` or a string `brType` (written
  as `<w:br w:type="..."/>`); a `tab` needs neither (`<w:tab/>`).
* **Blocks:** a `Para`, or an `Opaque` holding the original XML node of everything else at body level (tables,
  content controls, custom XML, an `mc:AlternateContent`, a `sectPr` that is not last...), in place.
* **Ids:** paragraph ids come from one counter for the whole program (`nextId`), unique within a Doc; `reserveIds(doc)`
  moves the counter past a Doc's ids (the `Document` constructor does it). A reader must create paragraphs through
  `newPara`.
* **Sections and `sectPr`:** a paragraph whose `w:pPr` holds a `w:sectPr` ends a section (it is the section's last
  block); the body's last `w:sectPr` describes the last section. `Section.raw` is the original `w:sectPr` node.
  The writer puts a section's `sectPr` in the `pPr` of its last paragraph (adding an empty paragraph if the section
  does not end in one), and the last section's at the end of `w:body` when the file had it there (`meta.bodySectPr`)
  or when it has page properties; each is written exactly once.
* **`meta`:** `contentTypes`, `packageRels`, `mainPart`, `zipOrder`, `stylesPart/numberingPart/settingsPart`,
  `prolog` (a `Map` part -> `{decl, before, after}`), `documentRoot`, `bodyName`, `bodyAttrs`, `beforeBody`,
  `afterBody`, `bodySectPr`, `conformance` (`'strict'` or `'transitional'`), `stylesGenerated`.
* **`parts`:** a `Map` name -> bytes of every zip entry the reader does not interpret (headers, footers, footnotes,
  comments, media, docProps, other `.rels`, custom XML...). They are written back byte-identical.
* **`styles`:** a `StyleTable` (`docDefaults`, `styles: Map`, `defaults`, `latent`, and from a file `rootName`,
  `rootAttrs`, `docDefaultsRaw`, `extraStyles`). Each `Style` read from a file keeps its original element in `raw`.
  **The writer emits `raw` verbatim: edits to the fields of a style that has `raw` are not written yet** (a style
  editor must drop `raw` for the style it changes). Styles without `raw` (the built-ins of `newDoc`) are built from
  their fields. `resolvePara`/`resolveRun` return new objects.
* **`numbering`:** `{raw, nums}` (the original root kept whole and written back as it was read, so reading more of it
  never changes what is saved, and editing never changes it: `list-roundtrip.test.mjs` checks the written numbering
  part's bytes against the unedited write and its XML tree against the file's; the bytes equal the file's own only
  when it was written as the writer writes XML (prolog line end, no BOM, LF, `<x/>`): 13 of the 97 corpus files with
  a numbering part edited in the full run, about one in eight; `nums` is what display needs). `nums: Map<numId, {abstractNumId, levels, overrides,
  multiLevelType?, styleLink?, numStyleLink?}>`; `levels[ilvl]` (ilvl 0..8, holes for missing levels, the first of a
  repeated ilvl wins) is a `NumLevel` `{ilvl, numFmt?, lvlText?, start?, suff? ('tab'|'space'|'nothing', absent =
  tab), lvlRestart?, isLgl?, lvlJc? ('left'|'center'|'right'), pStyle?, pPr?: {ind: {left?, right?, firstLine?,
  hanging?}}, rPr?: {b?, i?, color?, sz?, rFonts?}}`; `overrides: Map<ilvl, {start?, level?}>` from `w:lvlOverride`
  (`w:startOverride`, a replacement `w:lvl`; at most 1000 read) is not applied to `levels`: `levelOf(num, ilvl)` gives
  the level in force. An abstract with `w:numStyleLink` takes the levels of the numbering style's `numId` (loops
  guarded). Unknown values are ignored; integers beyond 2^31 are dropped. `Styles.resolvePara(...).numPr` is the
  numbering in force, `{numId, ilvl, ilvlGiven}` or `null` (direct `numPr` over the style chain's key by key, a `numPr` kept raw
  counts, ilvl 0 and `ilvlGiven` false when none gives one, `numId 0` or an ilvl outside 0..8 -> `null`). `rawSettings` is the root of `settings.xml`, kept whole.

### The lossless property rule (`ReadProps`)

A child of `rPr`, `pPr` or `sectPr` becomes a model field only when it is understood **completely**: every attribute
is a known WML attribute with a value of the expected form, the element has no unexpected content and is the only
child of its name. Anything else — unknown elements, `w14:*` extensions, repeated elements, theme fonts or
`w:color` with `w:themeColor`, `w:spacing` with `w:beforeAutospacing` — is kept as the original XML node in the
object's `extra` array, in document order. Property objects are built from fixed whitelists of field names;
names found in a file are only ever `Map` keys, so an element called `__proto__` is inert (**prototype-pollution
rule: never copy keys from a file into a property object**).

Other rules of the same kind: a `w:pPr` carrying attributes makes its paragraph an `Opaque` block; the attributes of
`w:p` (rsids, `w14:paraId`) go to `extraP`; run rsid attributes are dropped (the one deliberate loss); a `w:r` with
unknown attributes, or text directly in it, is a whole `level: 'p'` inline; a tab, newline or U+FFFC inside a `w:t`
is kept as a `level: 'r'` raw inline so text never gains a meaning the file did not give.

### Child order and the extension slot (`Order.sortChildren`)

Word reports "unreadable content" when the children of `pPr`, `rPr`, `tblPr`, `tcPr`, `trPr` or `sectPr` come in
the wrong order (they are `xsd:sequence`s). `sortChildren(parent, children)` puts them in schema order: known
`w:` names by their position in the table (stable); an unknown `w:` name stays right after the known element that
preceded it in the input; and **children in other namespaces (`w14:*`, `w15:*`, ...) have one fixed slot: after all
base elements and before the `*Change` element** (`rPrChange`, `pPrChange`, `sectPrChange`...). Callers must pass
names normalised to the `w:` prefix (the writer orders by namespace and local name using the part's scope, so raw
nodes with another prefix for WML are ordered correctly). The tables are checked against the real `wml.xsd` by
`order.test.mjs` when the schema is in `tools/moreapps/.cache`.

### Strict documents

A document whose main part is in the Strict namespace is read with every parsed part mapped to the Transitional URIs
(`NsMap`, a one-to-one table of PURL pairs; `graphicData@uri` and the URIs in `w:dataBinding` `prefixMappings` too),
gets `meta.conformance = 'strict'`, and is written back Strict (`mapNamespacesCopy(..., 'toStrict')`).
Relationship types and the bytes in `doc.parts` stay as they were. Strict vocabulary differences stay raw/extra,
except where a writer names them (final review of Batch A): the scopes of a Strict document are marked
(`Ns.strictScope`), and there `w:ind`'s `w:start` / `w:end` attributes and `w:pBdr`'s `w:start` / `w:end` sides are
read as the `left` / `right` fields and written back so (a Transitional `w:left` / `w:right` in a Strict file keeps
that element raw, and the other way round, so nothing read is renamed); the List Paragraph style added by a list
command therefore says `w:start`, and so does any indent or border set by a command. New numbering definitions write
`w:start` and `lvlJc` start / end themselves (`NumWrite`), and new tab stops start / end (`FormatTabs`). A paragraph's `w:jc` is
`start` / `end` when an alignment command or a paste into a Strict document makes it (`JcName`; a value read is never
renamed, `start` / `end` display as left / right). Still Transitional in a Strict document: any other attribute or
element a command writes whose Strict name differs (to be checked in real Word: S1 in "To check in real Word (Batch A
final review)").
A file mixing Strict and Transitional URIs does not round-trip exactly (deferred). Output Strict is not
schema-validated (only the Transitional schema is used).

### Content types of known parts (`PartTypes`)

Word does not accept a package whose index (`[Content_Types].xml`) types a part it knows only generically. Checked
in Word: `docProps/core.xml` typed `application/xml` fails hard ("Word experienced an error trying to open the
file"); `word/footnotes.xml` typed so gives only the milder "unreadable content ... recover?" prompt.
So the writer **repairs** the index: for every internal relationship of the package (`_rels/.rels`) and of the main
part whose type is a known kind (`officeDocument styles numbering settings fontTable webSettings footnotes endnotes
comments header footer glossaryDocument theme extended-/custom-properties customXmlProps`, core properties (also the lower-case legacy spelling
`http://schemas.openxmlformats.org/officedocument/2006/relationships/metadata/core-properties`, found in 7 corpus
files; the Strict-style spelling is not known to exist and is not accepted),
`commentsExtended commentsIds commentsExtensible people stylesWithEffects`) and whose target is written, when the
part's effective type (its Override, else the Default of its extension) is missing, `application/xml` or `text/xml`,
it gets its own type: the existing Override is changed in place, else an Override is added. **A different specific
type is never changed** (it may be meant; the linter reports it as `ct-wrong`). Everything else in the index is
written as it was, in its order, so a valid file's content types do not change at all (`docx-package.test.mjs`
checks this on every reader fixture, the corpus test on every corpus file). Images, relationships of other parts (a header's
own picture...) and external targets are not looked at.

Decided with evidence and **not** done: the writer adds no `settings.xml` (with `w:footnotePr` naming the separator
notes) and no `docProps/app.xml` to a file that lacks them. Every Word-made file with footnotes in the corpus (157)
and on the development machine (20) has both separators and a `footnotePr`, but nothing shows their absence breaks
Word (10 corpus files and several real ones have no `app.xml`); the round-2 hand-off file `2k` tests the settings
question in real Word. A literal TAB inside `w:t` (round 1's file 2 had one, from the test fixture's text) is source
content kept by the lossless rule, not a writer bug: the writer writes a model `\t` as `<w:tab/>`.

## Operations and undo

`apply(doc, op) -> inverse`; `apply(doc, apply(doc, op))` restores the Doc exactly (ids included). Positions are
`[sectionIndex, blockIndex]`; offsets are UTF-16. An op that is refused throws `RangeError` and changes nothing.

| op | fields |
|---|---|
| `replaceText` | `{block, at, del, ins, rPr?, rStyle?, inlines?}`; becomes `spliceText` internally |
| `spliceText` | `{block, at, del, content: {text, runs, inlines}}` (what undo uses, so history costs about the size of the edit) |
| `setProps` | `{block, pPr?, pStyle?, range?, rPr?, rStyle?}`; deep merge, `null` deletes a key; setting or deleting a field removes same-named raw elements from `extra` (the edit replaces the element wholesale: attributes the model did not understand are lost) |
| `splitBlock` / `mergeBlock` | `{block, at}` / `{block}`; `extraP` stays with the first paragraph |
| `insertBlock` / `removeBlock` | `{at, block}` / `{at}` |
| `restoreBlock` | `{block, snapshot}` |
| `compound` | `{ops: [...]}`, all or nothing |
| `setDocPart` | `{key, value}`; key `numbering`, `rels`, `styles`, `settings` (`doc.rawSettings`) or `numberingPart` (`meta.numberingPart`, `meta` replaced by a copy; `undefined` removes it); the value replaces the old one whole (build it with `DocParts`, never change the old one); inverse: the same op with the old value |
| `splitSection` / `mergeSection` | `{at: [s, i], props, raw}` / `{at: s, keep?: {props, raw}}`: blocks `0..i` stay in section `s` with the new props/raw, the rest becomes `s+1` with the old ones; merge joins `s` and `s+1` keeping `s+1`'s props and gives `s`'s back in its inverse (see `OpsSect` for the refusals). **Header references (settled in A3.2):** the section break command gives the section before the break a copy of the old `sectPr` with its `w:headerReference`/`w:footerReference` children, so two sections point at the same header/footer relationship ids, as Word does when it copies a section's properties; question SB1 checks it in real Word |
| `setSection` | `{at: s, props, raw}`: section `s` takes the new props/raw (checked as a split's; raw `undefined`: no raw key), its blocks kept; inverse: the old ones. Used by the section break commands for `type` |

Formatting of inserted text: the format of the character before `at`; at offset 0 the first run's; **typing over a
selection (`del > 0`) takes the format of the first selected character** (Word's rule); in an empty paragraph none.
`op.rPr` replaces the rPr exactly.

`Document`: `apply(op)`, `undo()`, `redo()`, `group(fn)` (one undo step and one `'change'` event; groups nest; it ends the
group even when `fn` throws — prefer it to `groupStart/End`; **`fn` must be synchronous**: the group ends when `fn`
returns, so ops an async `fn` applies after its first `await` fall outside it). An op that throws changes nothing, not even inside a
group. `undo`/`redo` inside a group throw. `on('change', fn)` receives `{kind: 'apply'|'undo'|'redo', ops}`; a
listener that throws neither undoes the change nor stops the others: the error goes to `onListenerError(err)`
(by default rethrown from a microtask).

Typing support (`DocHistory` holds the stacks): `apply(op, {coalesce: key})` and `group(fn, {coalesce: key})` merge into
the previous undo step when it has the same non-null key and nothing broke the run (`breakCoalesce()`, a successful
`undo`/`redo`, an unkeyed or differently keyed edit); the merged inverse is `compound` of the new inverse(s) then the
old one (undo order, newest first). A merged step holds at most 128 ops (`MAX_MERGE`; a longer run starts a new step), so one undo stays fast and `maxSteps` still bounds memory. A nested group's key is ignored; `apply(op, {coalesce})` inside a group ignores its option. `markSaved()` / `dirty`: every state has a serial
number, `dirty` means the current serial differs from the saved one, so it is right through undo, redo, coalescing (a
merged step gets a new serial, and `markSaved()` ends the coalescing run so the saved state stays reachable by undo) and trimming
(`maxSteps`, default 1000: oldest steps dropped; a dropped saved state stays dirty until `markSaved`).
`clearHistory()` empties both stacks and keeps `dirty`; `undoDepth` is the number of undo steps. `'change'` payloads
also carry `dirty`.

### Never change a model object in place

The live Doc shares blocks, runs, `rPr`/`pPr` objects, inlines and XML nodes with its undo history (copy on write: an
op builds new objects for the part it changes). So: **change a Doc only through `Ops`/`Document`; never mutate a
Doc object, an op you applied, or an event payload.** `apply()` deep-copies the op it is given once, at the boundary,
so a caller's objects never enter the Doc; `applyOwn()` (used by `Document` for undo/redo) does not copy. For event
payloads this means: for `'undo'` and `'redo'` events, `ops` is `[the op applied]` and **that op is shared with the
history and is READ-ONLY** (a listener that mutates it corrupts redo); it may be a `spliceText` or `compound`, not
only the public kinds. For `'apply'`, `ops` are the ops as given. Nothing enforces this (nothing is frozen).
The same holds for style tables of a live Doc.

## Limits and security

* **Zip:** unpacked total <= 256 MB, ratio <= 1000, declared sizes checked before inflating; zip64, encryption,
  split archives and methods other than stored/deflate are refused; unsafe names, duplicate names, a wrong comment
  length, non-`Uint8Array` input are `ZipError('not-zip')`; corrupt deflate data is a `ZipError`, never a raw TypeError.
* **XML parts:** at most 64 MB each (`maxXmlBytes`), 4,000,000 elements (`maxElements`, counted from the bytes before
  parsing), depth 256; **DTDs are refused** (`XmlError` `dtd`) and there are no custom entities.
* **Paragraphs:** `readDocx` accepts at most 1,000,000 in the body by default (`maxParagraphs`; start tags with local
  name `p` are counted before parsing, so a 45 KB zip of five million `<w:p/>` is refused in well under a second);
  `!Word` (`Open.openDocx`) passes **200,000**, as the window lays out every paragraph (200,001 is refused as "too
  big" in well under a second). Memory is about **1.1 GB per 200,000 paragraphs** when read. UTF-16 parts bypass the byte gate on `<w:p` (bounded, but slower).
* **Trust model of `WimpLib$Dir`/`WimpLib$Path`:** only programs that run JavaScript read them, and they are changed
  only by `*Set` (the command line, an Obey file, or an application's `!Boot`). Viewing a directory in the Filer
  runs the `!Boot` of every application in it in safe mode, and `Set` is allowed there, so an untrusted application
  directory (downloaded, or on a HostFS drive) could redirect `WimpLib$Path` and hijack later `wimplib/...`
  imports. This is the same trust class as any application that sets `Alias$@RunType_xxx`: treat untrusted
  application directories like running them. A `.docx` is never executed; `?cmd`/`?run` work only on localhost.
* **Nothing is ever fetched:** external relationships are data only. A document never runs code (fields are kept,
  not evaluated; macros are not read).
* Older `.doc` and password-protected files are OLE2 containers: `DocxError` with `kind: 'ole2'`; `Open.describe`
  says so in words. Other files give `not-docx`, `no-document`, `bad-xml` (naming the part) or `unsupported`.
* `__proto__`/`constructor` as a font name, style id, property or part name are inert (Maps and `Object.hasOwn`).

## Fonts

`!Word/Fonts/` holds 20 unmodified TrueType files named without an extension (`Carlito-Regular`, ...) and `Licences`
(Latin-1 text, exempt from the tab/72-column checks; it has two verbatim tabs). Carlito = Calibri, Caladea = Cambria,
Liberation Sans/Serif/Mono = Arial/Times New Roman/Courier New, all **SIL Open Font License 1.1** (Caladea checked from
its own LICENSE file: it is OFL, not Apache). They are metric-compatible: same advance widths, so lines break where
they do in Word. `tools/moreapps-fonts.mjs` re-fetches them from pinned commits and checks SHA-256 and licence text
(`node tools/moreapps-fonts.mjs`); the output is the same bytes every time. The OFL requires the licence to travel
with the fonts and forbids selling them alone or using the Reserved Font Names for modified versions, which is why
they are not converted. The fonts are committed in both `tools/moreapps/!Word/Fonts` and the generated
`assets/disc` copy: the two copies are the same git objects, so the packed repository grows by about **3.7 MiB**; a
checkout's working tree by about 14 MB. `FontMap.substitute` never throws; its `css` is for CSS only (an unknown font
is `"Name", "Liberation Sans", sans-serif`: the computer's own font if it has it, else Liberation Sans).
`FontLoad` adds each face to the page once, however often `!Word` is started: it reuses a face `document.fonts`
already has (same family, weight and style, `loaded` or `loading`), and calls in flight share a job map kept on
`globalThis[Symbol.for('word.fontjobs')]` (keyed by `document.fonts`), which outlives a run's module instances. The
faces stay with the page after Quit, for the next run. `!RunImage` loads `fontsToLoad(facts(doc).fonts)`: the
bundled families used, plus the bundled fallback (Liberation Sans for an unknown font) of every other one. The stub
shows a document once its fonts are loaded, waiting at most 2.5 s, and lays it out again if they arrive later.

## The stub application

* `!RunImage` — single instance: a second start sends `DataOpen` to the running task and quits. Documents are opened
  by double-click (the type &A7E, `MSWordX`, is bound by `!Boot`: `Alias$@RunType_A7E` runs `!Run`), by a drop on
  the icon bar icon or a document window, and by `DataOpen`. The icon (`!word`, `IconBar`): Select makes a new
  untitled document; its menu is New, Recent >, Info, Quit. `PreQuit` -> `Quit.preQuit`; `Quit` stays unconditional.
* `AppWin` — one `DocWindow` per document (key = canonical path, lower-cased; `untitled:N` for an untitled one). Painting is a canvas: `DocLayout` lays out
  every paragraph once for the page's text width (words measured once, cached) and `DocPaint` paints only what is
  in view, on a white page on a grey desk, with the selection (`EditView`/`EditPaint`); the window has both scroll bars and its extent holds the page, a whole page high at least (`pgSz.h`), so a new document shows a full white page (and is at least the screen's width). Menu: *Save*, *Save as*,
  *Save a copy* (`DocSave`; the Save and Info boxes are created once per window and deleted with it — a menu asks
  for a submenu on every hover), *Info*, *Edit* (Undo, Redo, Cut, Copy, Paste, Select all, Find..., Find next, Find previous, Replace..., Word count...: `EditMenu`, `CountBox`), *New*, *Close*. Mouse and keys: `EditMouse`, `EditView`, `Keys` (arrows, Ctrl-arrows, Home, End/Copy, Ctrl-Home/End, Page Up/Down, Shift to extend, Ctrl-A, Escape), `Keymap` (editing keys; the window's F2, Ctrl-N, Ctrl-F2, Ctrl-S, F3, Ctrl-F10, F8/F9, and Find's Ctrl-F/F4, Ctrl-H, Ctrl-G, Ctrl-Shift-G: `DocKeys`); other keys are passed on.
* Test hooks: `task.word.docs` (`{path, leaf, untitled, stateId, save(), saveAs(path), doc, text, summary, win, saveBytes(), view}`; `view` is `EditView.hook()`: `{selection, layout, text(), caretRect(), setSelection(a, b?, aff?), type, press, compose, flush, lines(), dirty, undoDepth, overwrite, composing}`) `task.word.open(path)` (resolves to the `DocWindow`), `task.word.newUntitled(paper)` / `task.word.new({paper})` (likewise), `task.word.keys` (the `app.docs` keys), `recent`, `recentReady`, `mayQuit()`, `quit()` (the menu's Quit), `prompt`, `ask(opts)`, `find` (`EditFind.findHook`: the Find box, the active document, `open(replace)`, `run(action, fields)` -> the message) (`TestHook`).
* `LineTokens` draws inlines so (each stands for one offset; a wrapper's text still wraps word by word, its first piece covering `[i, i+1)` and later pieces the empty `[i+1, i+1)`, all `shown`; a tab or newline in that text is drawn as it is): a `w:hyperlink` with text in blue, underlined (the only link style); any other
  paragraph-level wrapper with text (`w:ins`, `w:fldSimple`, `w:sdt`, `w:smartTag`, `w:customXml`, a `w:r` kept
  whole) as plain text in the format at that position; nothing for `Kinds.UNSEEN`, `w:del`, `w:moveFrom` and
  `w:softHyphen`; `-` for `w:noBreakHyphen`; a page or column break (`w:br w:type="page"` / `"column"`) as a grey
  dotted rule labelled "Page break" / "Column break" that ends its line (`BreakMarks`; any other `w:br` with
  attributes is a line break); a grey `[...]` box for the rest (drawings, pictures, objects, footnote,
  endnote and comment references, `w:sym`...). `Info` counts the same way: the `UNSEEN` kinds are not preserved
  items, so a field made of `fldChar`s is not counted (its result is shown as text).
* Not shown yet (and not in the way of typing): caps/small caps, automatic-colour text on a dark highlight (drawn black; Word draws it white), table contents, a word
  longer than the line runs over. (Tabs: a tab with no stop before the right indent goes to it and the text after it
  wraps, T3 in "Tab stops (Batch A, A4.1): the rules".)

## Build and disc pipeline

`node tools/disc-wimplib.mjs` writes `!Boot/Resources/!WimpLib` (type `app`; `!Boot`/`!Run` Obey &FEB, `!Help` text
&FFF, `!Sprites` &FF9 from `icon.mjs` `libIconFiles()`, every other file JSScript &F81, subdirectories as
directories). It replaces only that subtree and its manifest node: the node is replaced in place, or inserted at its
sorted position among the other `Resources` entries, which are not re-sorted or touched; the manifest's `files` and
`totalBytes` are recounted. `--check` verifies the sources (Latin-1, no tabs, no CR, <= 72 columns, <= 250 lines,
`riscos` only in an `import ... from 'riscos'`). It runs after `disc.mjs` (which rewrites `!Boot`) and before
`disc-moreapps.mjs`.

`node tools/disc-moreapps.mjs` writes `MoreApps/!Word` (sources as JSScript &F81; `!Run`/`!Boot` as Obey &FEB; `!Help`
text &FFF; `Fonts/*` Data &FFD; `Fonts/Licences` text; `!Sprites` generated by `icon.mjs`, including the icons of
.docx &A7E and .doc &AE6), inserts `MoreApps` in the manifest at its sorted place, and patches the boot files. It
rewrites only its own subtree, and removes the library's old home `MoreApps/WimpLib` (directory and manifest node)
when it is there, so a disc built before the move is cleaned up. `--check` verifies every text source (Latin-1, no
tabs, no CR, <= 72 columns; the font binaries are exempt, `Fonts/Licences` is checked for Latin-1 and CR only)
without writing.

Both scripts hold the same lock (`.moreapps-lock` in the disc root: both rewrite `manifest.json`) and share
`MOREAPPS_SRC` (the source tree holding `!Word` and `!WimpLib`) and `MOREAPPS_DISC` (the disc root), used by
`disc.test.mjs`. `disc-moreapps` must run after `disc.mjs`, which rewrites the boot files (`tools/build.mjs` runs
`disc.mjs`, ..., `disc-wimplib.mjs`, `disc-moreapps.mjs`). `node tools/disc-docs.mjs` puts the guide on the disc.

**Boot wiring.** `disc-moreapps` adds one line to each of four boot files (`!Boot` and `Utilities.!ResetBoot`'s
`Choices.Boot.Desktop` and `PreDesktop`): `Filer_Boot` of `Boot:^.MoreApps` and `AddApp Boot:^.MoreApps.!*`, as
real RISC OS would have them. **This desktop runs neither of those files** (`src/main.js` runs only `Repeat Filer_Boot
<BootResources$Dir> -Applications -Tasks`) and `*AddApp` does nothing, so `src/main.js` runs the equivalent for
`ADFS::HardDisc4.$.MoreApps` right after it (when the directory exists; errors are only logged). That is what makes
`!Word`'s sprites and the file type &A7E known from a cold boot, without opening the MoreApps folder.
The patched boot files are kept because they document intent. `!Word` is not in the icon bar Apps viewer (ROM apps
only; `!Journal` neither); it is reached through the Filer or by double-clicking a .docx. `src/main.js` hard-codes the
`HardDisc4` path, as the `BootResources` line does. See `docs/CORE_API.md` 11a and 14 and `docs/CHANGES_NEEDED.md`.

## Testing

Node >= 22.7 (extensionless imports; the suite was run on Node 26).

```sh
node --test tests/moreapps                    # unit tests (no browser)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps   # the same under a 1 GB heap
node --test tests/moreapps/index.mjs          # browser suite: disc --check, the wimplib import, cold boot, !Word
node tools/disc-moreapps.mjs --check          # sources: Latin-1, 72 columns
node tools/disc-wimplib.mjs --check           # the library's sources: the same, <= 250 lines, no 'riscos'
node tools/moreapps-corpus.mjs                # fetch the optional sample corpus (needs the GitHub CLI, `gh auth status`)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/corpus.test.mjs   # ~25 s, up to ~1.9 GB RSS
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/edit-roundtrip.test.mjs   # 50 random edits per fixture and corpus file, write, read back, lint, xmllint, undo all (~25 s: one corpus file in ten)
WORD_EDIT_CORPUS=1 NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/edit-roundtrip.test.mjs   # the same on every corpus file (~2 min)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/format-roundtrip.test.mjs   # 40 random formatting commands per fixture and corpus file, the same checks (~20 s; WORD_EDIT_CORPUS=1 for every file)
node tests/moreapps/word-format-hostile.mjs   # browser: 50,000 paragraphs formatted, 1000 toggles, IME, absurd sizes, zoom while resizing, 500 random actions (in index.mjs)
node tests/moreapps/word-lists.mjs           # browser: list labels drawn (bullet, numbers), not selected, click on a label, typing/Enter/undo renumber, 200%, 50,000 list paragraphs; Tab/Shift-Tab/Backspace, Format > List, ruler and Ctrl-M in lists (in index.mjs)
node tests/moreapps/word-lists-ui.mjs        # browser: the row 2 Bullets / Numbering buttons and their popups, pressed state, Ctrl-Shift-L (Mac: not Cmd), Tab / Enter / Backspace in lists, Format > List (Restart, Continue, Set numbering value box), a saved list reopened, both toolbar rows at the A4 width, 30 cycles leak nothing (in index.mjs)
node tests/moreapps/word-lists-hostile.mjs   # browser: 100,000 list paragraphs, Tab/Shift-Tab spam, absurd numbering, select all + Backspace, 500 random actions (in index.mjs)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/list-roundtrip.test.mjs   # 40 random list commands per list fixture and corpus file, the same checks plus the numbering part unchanged (~15 s; WORD_EDIT_CORPUS=1 for every file)
node tests/moreapps/handoff-lists.mjs        # writes the list-*.docx real-Word hand-off files and list-README.txt (local, corpus/handoff)
node tests/moreapps/handoff-format.mjs       # writes the fmt-*.docx real-Word hand-off files (local, corpus/handoff)
node tests/moreapps/word-typing.mjs           # browser: typing, deleting, undo, IME, the Edit menu, Save copy (in index.mjs)
node tests/moreapps/word-format.mjs           # browser: formatting shown, keys, pending format, the Format menu (in index.mjs; also word-toolbar.mjs, word-ruler.mjs, word-zoom.mjs)
node tests/moreapps/word-typing-hostile.mjs   # browser: storms, 50,000 paragraphs, 500 random actions (in index.mjs)
node tests/moreapps/word-save.mjs             # browser: untitled documents, Save / Save as / Save a copy, Save box OK and drag, typing during a save, failures (in index.mjs)
node tests/moreapps/word-close.mjs            # browser: the Save / Discard / Cancel prompt on close (keys, untitled + Save box, one prompt), Revert, serialized saves, the pending save, leaks (in index.mjs)
node tests/moreapps/word-quit.mjs             # browser: New from the icon bar (one per double-click), Recent (Choices:Word, hostile), Quit / PreQuit prompts, shutdown, a save queued before Discard, 50 dirty windows, leaks (in index.mjs)
node tests/moreapps/word-replace.mjs          # browser: a new document's free name, OK onto an existing file asks Replace / Cancel (Return, Escape = Cancel), own / locked / open files, Save a copy (open file refused, composing text, own file asks), the late commit kept after 1.5 s / a click / a key, Quit with a close prompt's Save box, a close request during Revert's question (in index.mjs)
node tests/moreapps/word-page.mjs             # browser: a new document shows a whole white page (A4 and Letter heights, white down the window, the page's end, 50% and 200%), clicks low in the empty page put the caret at the end (empty and 3 paragraphs), double / triple click there, typing, Ctrl-End, Page Down (in index.mjs)
node tests/moreapps/word-clipboard.mjs        # browser: copy, cut and paste (real keys, other programs' HTML, Edit menu, Mac Cmd keys, hostile HTML, DOMParser round trip) (in index.mjs)
node tests/moreapps/word-clipboard-hostile.mjs   # browser: copy, paste and Find against hostile input (50,000 paragraphs: select-all copy < 3 s, no HTML, pasted into another document as plain text cut at 100,000 with the message; 30,000 paragraphs: HTML the marker + `<pre>` (DOMParser text equals the plain text), pasted whole by the exact route; the cut message for 99,999 / 100,000 / 100,001 characters and surrogates; Replace all < 5 s and one undo; 5 MB of text cut to 100,000 characters with the message; 100,000 paragraphs of HTML; 10,000-deep, script-laden HTML: no script, no request; files only; a table first; a real CDP input method composing, then a real Ctrl-V during it; 1000 real Ctrl-V; regular expression characters; 500 seeded random typing / copy / cut / paste / Find / undo / Save / mouse actions, each checked, undo-all to the opened model, no request) (in index.mjs; ~15 s)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/clipboard-roundtrip.test.mjs   # random copy / cut / paste (exact, as from another document, own HTML, plain, other programs' HTML, another document's copy) and Replace / Replace all on fixtures and the corpus sample: read back equal, lint, xmllint, undo all to the opened bytes (~25 s; WORD_EDIT_CORPUS=1 for every file)
node --test tests/moreapps/clip-lists.test.mjs tests/moreapps/clip-lists-paste.test.mjs   # L6: lists, borders, shading and tab stops pasted between documents (hostile numbering, Strict, undo, written and validated)
node tests/moreapps/handoff-cliplists.mjs     # writes cl-1-source.docx, cl-2-pasted.docx, cl-2b-next-to-a-list.docx, cl-2c-last-item-text.docx, cl-3-strict.docx and cl-README.txt (L6 questions; local)
node tests/moreapps/handoff-clipboard.mjs     # writes clip-1-samedoc.docx, clip-2-crossdoc.docx, clip-3-html.docx, find-1-replaceall.docx and clip-README.txt (local, corpus/handoff)
node tests/moreapps/word-find.mjs             # browser: Find and Replace (Ctrl-F, F4, Ctrl-H, Ctrl-G / Ctrl-Shift-G; Return, Find previous, wrap, Replace, Replace all one undo step, Match case / Whole words clicked, link text not replaced, Escape / Close back to the document, the box follows the document last clicked in, Edit menu, messages, 10,000 matches, 1 MB needle, long paste into the field, Mac Cmd-F / Cmd-G / Cmd-H, 30 cycles leak nothing) (in index.mjs)
node tests/moreapps/word-dialog.mjs           # browser: WimpLib Ui/Dialog through task.word.dialog(spec): every control kind, Tab / arrows, popup and colour picks, Return / Escape / close icon, mixed values, keys, 30-cycle leaks (in index.mjs)
node tests/moreapps/word-spacing.mjs          # browser: Ctrl-1/2/5/0 by real keys (one undo step each), the canvas line pitch at 1.0 vs 2.0, Format > Line spacing ticks and shading, the row 2 toolbar button's popup, Mac Ctrl-1 (Cmd-1 not ours), a table-only document, 50,000 paragraphs select all + Ctrl-2 and undo under 5 s (in index.mjs)
node --test tests/moreapps/paraspace.test.mjs   # ParaSpace: lineBox (auto, exact, at least; clamps; clip), contextual spacing, rawSpacing, spacingDeco and its neighbour key, negative gaps (unit)
node --test tests/moreapps/spacing-roundtrip.test.mjs   # random line spacing, space, flow and Paragraph-box patches on fixtures and corpus files, written and read back, undo restores (one corpus file in ten; WORD_EDIT_CORPUS=1: all)
node tests/moreapps/word-autolist.mjs        # browser: AutoFormat lists with real keys (* and 1. then text, Enter Enter, 3. continues, 7. new, Tab, Ctrl-Z gives back the marker), never in overwrite mode, a real input method's commit, paste, Replace all, undo / redo; Format > AutoFormat lists off kept in Choices:Word with Recent across a restart; Mac Cmd-Z (in index.mjs)
node tests/moreapps/word-breaks.mjs          # browser: page breaks drawn from a Word file, Ctrl-Enter (mid-paragraph, end, empty paragraph, over a selection; one undo step), Left / Right, Backspace / Delete, clicks on the rule at 100% and 200%, selection, copy and paste, saved as <w:br w:type="page"/>; section breaks: the band drawn and labelled, one undo step, clicks in the band, Delete / Ctrl-Z, saved sectPrs; the Insert menu (items, keys, Mac label, shaded later items, run from the menu); page break before (gap, rule, click) (in index.mjs)
node tests/moreapps/word-newlists-hostile.mjs # browser: 1000 rapid * + Ctrl-Z cycles, a space near a paragraph's start in 50,000 paragraphs (+5 ms budget), markers typed by script at 200 starts of 50,000 paragraphs, undo of everything (in index.mjs; A2.6 adds the list commands)
node tests/moreapps/word-spacing-hostile.mjs  # browser: 50,000 paragraphs + Ctrl-2 and undo, 1000 Ctrl-2 / Ctrl-1 toggles, absurd line values, the box open while its window closes, 500 random actions (in index.mjs)
node --test tests/moreapps/newlist-roundtrip.test.mjs   # random Bullets / Numbering / Restart / Continue / AutoFormat with list edits on fixtures and corpus files, written and read back; the numbering part only grown (originals kept in order); undo restores (also list-roundtrip.test.mjs, now with list-making in half of its runs, and clipboard-newlists.test.mjs: copy, paste, HTML and Find with lists made by !Word)
node tests/moreapps/handoff-newlists.mjs      # writes nl-1-new-bullets.docx, nl-2-new-numbers.docx, nl-3-restart-continue.docx, nl-4-existing-part.docx, nl-5-autoformat.docx and nl-README.txt (local, corpus/handoff)
node tests/moreapps/handoff-spacing.mjs       # writes sp-1-linespacing.docx, sp-2-before-after.docx, sp-3-flow.docx and sp-README.txt (local, corpus/handoff)
node --test tests/moreapps/breaks-roundtrip.test.mjs   # random Ctrl-Enter, Next page / Continuous section breaks, Delete / Backspace / Ctrl forms at section edges (breaks removed), Enter, typing, deleting ranges across breaks and the Page break before flag, with undo / redo bursts, on the fixtures, documents with 24 sections (types, landscape, header references), raw section properties and the corpus sample; written and read back, lint, xmllint, undo all (WORD_EDIT_CORPUS=1 NODE_OPTIONS=--max-old-space-size=4096: every corpus file)
node tests/moreapps/word-breaks-hostile.mjs   # browser: 50,000 paragraphs select all + Ctrl-Enter / Next page / the flag (and the flag on all of them, painted at the end), 1000 Ctrl-Enter (100 real keys), 1000 section breaks (50 from the Insert menu), delete storms at the edges of 500 sections (150 real keys, 450 commands), select all + Backspace over 500 sections, 500 random actions; undo gives back the opened model
node tests/moreapps/handoff-breaks.mjs        # writes brk-1-pagebreaks.docx, brk-2-sections.docx, brk-3-deleted.docx, brk-4-flow.docx and brk-README.txt (local, corpus/handoff)
node tests/moreapps/word-parabox.mjs          # browser: the Paragraph box: values of one paragraph and of a mixed selection, Before + Keep with next + OK = one undo step, Multiple / At least / Exactly / Hanging, Escape / Cancel, bad text and At out of range, a box per document, 30-cycle leaks (in index.mjs)
node tests/moreapps/word-tabs.mjs             # browser: the Tabs box: Format > Tabs... and the Paragraph box's button, the default 0.5" -> 1" moving the tabs on screen and the ruler's marks (Ctrl-Z back, the old settings root), Set / Clear / Clear all + a default in one undo step, a stop picked from the popup, refusals with beeps (raw stops too), a stale box refilled, no settings part shaded, a box per document, 20-cycle leaks (in index.mjs)
node --test tests/moreapps/tabs-roundtrip.test.mjs   # random ruler (tabs) and Tabs box (tabsBox) commands with hostile positions, kinds, leaders and default tab stops, typed Tabs, Enter, deletes, styles and undo / redo on the fixtures, tab-stop documents (styles, docDefaults, Strict, raw w:tabs, settings with and without a default) and the corpus sample; written and read back, lint, xmllint, undo all gives the opened model and bytes; refused commands change nothing (WORD_EDIT_CORPUS=1 NODE_OPTIONS=--max-old-space-size=4096: every corpus file)
node tests/moreapps/word-tabs-hostile.mjs     # browser: 10,000 raw stops, stops at +-31680 and beyond, 1000 ruler adds and a 1000-command churn, Tab storms in a right-tab line, 500 random actions; undo gives back the opened model
node --test tests/moreapps/borders-roundtrip.test.mjs   # random borders / paraShade / charShade / changeCase / caseCycle / symbol / nbsp / nbHyphen / softHyphen commands with typing and undo on fixtures and the corpus sample, written and read back; refused commands change nothing; raw themed borders kept (WORD_EDIT_CORPUS=1 with 4096 MB for every corpus file)
node tests/moreapps/word-borders-hostile.mjs  # browser: 50,000 bordered paragraphs, widths 0 and 96, theme colours kept raw, 1000 Shift-F3, the Symbol window open while documents close, 500 random actions
node tests/moreapps/handoff-borders.mjs       # writes bdr-1-boxes.docx, bdr-2-shading.docx, sym-1-symbols.docx, case-1.docx and bdr-README.txt (BD1.., SY1.., CS1..) into tests/moreapps/corpus/handoff
node tests/moreapps/handoff-tabs.mjs          # writes tab-1-kinds.docx, tab-2-decimal.docx, tab-3-ruler.docx, tab-4-default.docx and tab-README.txt (local, corpus/handoff)
node --test tests/moreapps/bordergroups.test.mjs   # BorderResolve (sides whole through the styles, shd whole, raw themed elements best effort, foreign ones ignored, edgeOf widths / spaces / styles, shadeCss patterns), BorderGroups (one box or several: the side definitions (wave vs single, sz 0 vs 2, auto vs 000000, frame, between, bar, nil / none), widths, colours, shadow, indents (another first line still joins), a kept block, a section break, page break before, shading only; pads; between; widths 0 and 96; indents equal to paraFmt's over 300 random layer sets; a list level), the reuse key, BorderPaint geometry and painting order, character shading under the highlight, Format.query, never text, Strict w:start / w:end drawn and written back unchanged, clicks in a bottom border's gap (also at a section's end) (unit)
node --test tests/moreapps/borderpatch.test.mjs   # BorderNames against wml.xsd's ST_Border / ST_Shd (commands only; the reader keeps any name), BorderPatch fill / patch (None, Box, Custom, style / width / colour, mixed, fill, Apply to Text, bad values), FormatApply borders / paraShade / charShade: every pBdr / shd key really written whole by FormatPara.explicit, nil and clear/auto over a style's, a style's value not written, raw own w:pBdr / w:shd (and a run's w:shd) refused and kept, written to the file and read back, one undo step, 50,000 paragraphs < 5 s (unit)
node tests/moreapps/word-borders.mjs          # browser: a box's four edges read from the canvas, two paragraphs in one box (between, no edge under the first, the side unbroken), shading not in the space before, character shading under the highlight, a themed border kept raw, typing and Enter in a box and undo, Format query; 50,000 bordered paragraphs (style and direct): one box, frames, open at most 0.5 s over a twin with nil borders, a keystroke within 5 ms of the twin and of plain; the Borders and shading box (Box and Ctrl-Z, Double / 3 pt / a typed colour / a grey fill on two paragraphs in one step, OK unchanged no step, None and Fill None, Cancel and Escape, raw themed borders and shading beep and stay, Apply to Text, a stale box refilled, deleted with its document)
node --test tests/moreapps/charsets.test.mjs tests/moreapps/chargridpaint.test.mjs tests/moreapps/insertchars.test.mjs   # CharSets (every character in all 12 Carlito / Liberation Sans / Liberation Serif files' cmap tables, no duplicates, the special characters), SpecialChars, CharGridPaint (geometry, key targets, painting on a fake canvas), nbsp / nbHyphen / softHyphen (keys, one undo step, replaced selections, formats, written and read back, drawn, copy and paste) (unit)
node --test tests/moreapps/linkops.test.mjs   # LinkUrl (cleaned and refused addresses: www., IRIs, javascript:/data:/file:/vbscript:, controls, 1 MB, 2048), insert over formatted runs (each run kept, rStyle Hyperlink, External relationship, one undo step, rels and styles back by identity on undo), the Hyperlink style added once (Word's definition), a document's own style, no styles, text at a caret, a tab and a picture inside, anchors, refusals (across paragraphs, round a link or bookmark, a table, too long), edit text / address / tip, no-change no step, remove unwraps exactly (runs, rPr) and keeps other styles and items, a missing r:id shows an empty address and is fixed, written and read back (ClipLinks finds the URL), Strict relationship type, the bookmark names and lookup links use (BookmarkFind), Ctrl-K and Cmd-K (unit)
node --test tests/moreapps/bookmarks.test.mjs   # Bookmarks: checkName (40/41 characters, a digit or _ first, spaces, __proto__, controls), add round a selection / at a caret (one step, the format there), ids (tables' XML included; non-numbers, negative, past 2^31 - 1 passed over; at 2^31 - 1 refused), moving an existing name (case ignored, two in a file), the same name again no step, across paragraphs written and read back, refusals (table edge, a bookmark in a table), Strict, list by name / location / hidden, goTo (a table refused, a start without end), deleteBookmark, two starts with one id, the lookups links use, BookmarkKeep (a deleted range keeps the mark whose partner is outside), Ctrl+Shift+F5 (not Cmd on a Mac), 10,000 bookmarks
node tests/moreapps/word-links.mjs           # browser: Ctrl-K with a selection / at a caret / on a link, the ScreenTip, javascript: refused with a beep and a message, Escape, Remove link by a real click and Ctrl-Z, a bookmark from the popup and a real Ctrl-click to it, Insert > Hyperlink... and Cmd-K, the box deleted with its document, Save and reopen, a copy gives <a href>, no network request, 20 cycles leak nothing; bookmarks: Ctrl+Shift+F5 and Return add one round the selection (id past the table's), real Right / Left / Shift+Left / Backspace / Delete next to the marks, the popup by location and by name, Go to, a digit-first and a 41-character name and Go to into a table refused with a beep, Delete, Insert > Bookmark... (Ctrl+Shift+F5 on a Mac too), the box deleted with its document, 20 cycles leak nothing
node --test tests/moreapps/links-roundtrip.test.mjs   # random insertLink / editLink / removeLink (good and hostile addresses, texts, tips), addBookmark / deleteBookmark / goTo (hostile names), format painter pick + paint, word count, typing, Enter, deleting, styles, undo/redo on fixtures, list fixtures, link and bookmark documents (existing links, a missing r:id, duplicate names, ids that clash, a bookmark in a table, a Strict file) and the corpus sample, via roundtrip-lib (read back equal, ModelCheck each step, lint with no rid-unresolved, xmllint for one seed, undo-all gives the opened model and bytes); refused commands ({error}) change nothing; pinned cases (a link written and read back, edit then remove, a bookmark link has no relationship, a bookmark over three paragraphs, the painter's replace, the count writes nothing). WORD_EDIT_CORPUS=1 NODE_OPTIONS=--max-old-space-size=4096 for every corpus file
node tests/moreapps/word-links-hostile.mjs   # browser: 21 bad and good addresses through the Hyperlink box (javascript:, data:, file:, vbscript: refused with a beep; the good ones made safe), a 1 MB address typed and in a file, 10,000 bookmarks (open, Add, move by name, Go to, Delete, undo), duplicate names / clashing ids / a 2^31 id in a file, 1000 painter uses by real clicks (two rounds, each undone), a word count of 1,000,000 words (exact, quick), 500 random actions (keys, text, clicks, drags, Ctrl-click, both boxes filled with hostile text, the painter, the menus, formats; undo-all gives the opened model, relationships and style included), no network request
node tests/moreapps/handoff-links.mjs         # writes lnk-1-links.docx, bm-1-bookmarks.docx, paint-1.docx and lnk-README.txt (H1.. H4, BM1..BM7, FP1..FP6, W1..W4 and the word counts !Word shows) into tests/moreapps/corpus/handoff/ (local, never committed)
node tests/moreapps/handoff-index.mjs         # writes INDEX.txt there: every Batch A hand-off file by deliverable, with its README and what to try, in order
node --test tests/moreapps/formatpaint.test.mjs   # FormatPaint: pick (caret, first character, reaching the paragraph's end, list, inlines passed over, tables), paint (replace not merge, rFonts sub-fields, rStyle, raw elements, one undo step, no-op, caret word, character-only pick, paragraph pick incl. numPr, raw paragraph elements, 50,000 paragraphs)
node tests/moreapps/word-painter.mjs         # browser: the format painter by real clicks and drags: Select once, Adjust sticky, Escape, a click paints the word and paragraph, a drag the selection, a list format carried, one undo step, no-op, Format > Format painter, no listener leak
node --test tests/moreapps/wordcount.test.mjs   # WordCount: punctuation, white space, the no-break space and hyphen, emoji, East Asian characters, paragraphs counted only when they have a character, tabs and breaks, unseen inlines, links, fields' results and codes, deleted text, tables (and other kept blocks, a text box skipped, 200,000 levels deep, past 1,000,000 nodes partial), selections (across paragraphs, inside a word, tables between or at the ends, a bad selection), lines from the layout, 1,000,000 words and a 5 MB paragraph under a second
node tests/moreapps/word-count.mjs           # browser: Edit > Word count... (no key) for the document and for a selection, refreshed when asked again, Close by a real click, Escape and Return, nothing changed in the document, the box deleted with it, 20 cycles leak nothing
node tests/moreapps/word-symbols.mjs         # browser: the Insert menu, the symbol grid (real clicks: select, double-click, Insert button, the set popup, the recent row, arrows / Return / Escape), formats, one undo step each, the document last clicked in, no document, a long set scrolling, Special character, Ctrl-Shift-Space / Ctrl-Shift-- by real keys, "1." + no-break space makes no list, a saved copy with w:noBreakHyphen / w:softHyphen, 20 cycles leak nothing
node --test tests/moreapps/changecase.test.mjs   # ChangeCase: every mode (Turkish dotted I, sharp s, final sigma, emoji and surrogate pairs, sentence boundaries with . ! ?, title case with apostrophes), the cycle, a caret taking its word, runs and inlines kept, kept blocks untouched, one undo step and none for a no-op, FormatApply ids and the Shift-F3 key, 50,000 paragraphs under 2 s (unit)
node tests/moreapps/word-case.mjs            # browser: Shift-F3 by a real key (cycle, Ctrl-Z / Ctrl-Y), plain F3 still Save as, a selection over two paragraphs with a bold run, the Format > Change case menu, a caret between spaces, typing then Shift-F3
node --test tests/moreapps/tabspatch.test.mjs tests/moreapps/settingsedit.test.mjs   # TabsPatch state, FormatTabs {edits} and FormatApply tabsBox per paragraph; SettingsEdit (only w:defaultTabStop differs in the written part, schema-order insertion pinned to wml.xsd, Strict, mc:Ignorable and unknown children, undo restores the old root, xmllint) (unit)
node --test tests/moreapps/parapatch.test.mjs  # ParaPatch: fill, the patch of each field, hanging vs first line, At limits, refused fields, every key written through FormatApply paraBox (unit)
node --test tests/moreapps/units.test.mjs tests/moreapps/dialoglayout.test.mjs   # WimpLib Units, DialogLayout, DialogIcons, DialogValues (unit)
node tests/moreapps/word-fkeys.mjs            # browser: F2 / Ctrl-N New, Ctrl-F2 Close (the prompt), F3 the Save as box (once, near the caret; untitled: Save), Ctrl-S, F8 / F9, Ctrl-F10, auto-repeat used up, unused keys go on, Ctrl-F12 still the desktop's, menu labels, Mac Cmd-S / Cmd-N, 30 cycles leak nothing (in index.mjs)
node tests/moreapps/word-documents-hostile.mjs   # browser: Save as onto open / locked / read-only / bad names, 1000 Saves, Save while typing and during a real IME composition, 50 dirty windows at shutdown, shutdown asked twice, prompts that cannot open, 10,000 hostile Recent entries and corrupt Choices, Revert of a deleted file, Quit with the Save box open, 500 random actions with state checks (in index.mjs; ~13 s)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/documents-roundtrip.test.mjs   # new documents (A4, Letter) and the corpus sample saved through DocSave ('riscos' replaced by stand-ins via module.registerHooks), read back, lint, xmllint (~12 s; WORD_EDIT_CORPUS=1 for every file)
node tests/moreapps/handoff-documents.mjs     # writes new-*.docx, saved-*.docx and doc-README.txt, made by !Word in the desktop (local, corpus/handoff)
node tests/core/test-textinput.mjs            # core, browser: the text-input proxy (in tests/core/index.mjs)
node --test tests/core/test-textinput-pure.mjs   # core: sanitizeText
node tests/moreapps/handoff-typing.mjs       # writes the typed-*.docx real-Word hand-off files (local, corpus/handoff)
node tools/moreapps-fonts.mjs                 # re-fetch the fonts (pinned, checked)
node tests/moreapps/validate.mjs              # xmllint schema validation of what the writer writes
node tests/moreapps/lint-package.mjs FILE.docx|DIR...   # package linter (exit 1 if any file has an error)
VALIDATE_DIR=tests/moreapps/corpus VALIDATE_MAX=150 node tests/moreapps/validate.mjs   # original vs written errors
```

* Unit tests (`*.test.mjs`): `zip`, `xml`, `order` (against `wml.xsd` if cached), `model` (including two property
  tests of 500 seeded op sequences that check every op's inverse, section splits and merges and setDocPart
  included: undo-all restores the Doc with `rels`, `numbering`, `styles` and `meta`), `model-perf` (typing 0.3 ms/key in a 20k-character,
  2000-run paragraph; undo-all of 1500 keys grows the heap by about 1 MB), `styles`, `docx-read`, `docx-write`,
  `docx-edit` (extension elements, edits replacing raw properties), `docx-roundtrip` (read -> write -> read equal;
  textutil output; real files on the machine only with `MOREAPPS_REAL_DOCX=1`, see below), `docx-corpus-fixes` (regressions the corpus found),
  `docx-compare` (the `assertSameDoc` helper), `docx-package` (content-type repair; valid fixtures' types
  unchanged; the linter on `newDoc` output and on its own cases), `fontmap`, `fontload`, `fontfiles`, `word-view` (Info, Fmt, LineLayout), `linelayout` (offsets, and the same lines as the stub's layout, `old-render.mjs`, on 200 generated paragraphs), `positionmap` (caret, hit test, Home/End, Up/Down, selection rectangles; `hitTest(caretRect(off))` round trip on 500 generated paragraphs), `tabstops` (A4.1: stops merged across style layers, clear, Strict start/end, raw `w:tabs`, 10,000 stops < 1 ms per paragraph, the default stop from settings, `nextStop`), `tabalign` (A4.1: left/centre/right/decimal at 1", 3", 6", decimal edge cases, leaders and bars drawn (`DocPaint` on a fake context), cleared style stops, default stops, hostile positions, a tab in a hyperlink, justified lines, the offsets contract and `hitTest(caretRect)` on 300 random paragraphs with stops), `layout-prop` (also: random stops, tabs typed and the settings root replaced, incremental == full), `list-display` (also: G6, the tab suffix matches in-text tabs), `doclayout` (the page-width column, items, caret/hit/selection rectangles, 50,000 paragraphs laid out < 1.5 s and select-all drawn < 50 ms), `selection` (every movement command, boxes, words, select word/paragraph/all, text, clamp; random moves never land inside a grapheme), `snap` (`PosLine.snap` against the true boundaries at every offset of short stress texts), `hostile-view` (with `hostile-docs.mjs`: a 100,000-character word, 50,000 runs, 5000 tabs, absurd indents and page sizes, only inlines, tables first and last, an empty document; every call < 50 ms and the selection valid, run in a worker under a 10 s watchdog; 500 random key/mouse sequences; windowed grapheme steps in paragraphs over 4096 units equal the whole text's, flag runs included),
  `disc` (the build script against a temporary disc), `harness` (pins Node's native handling of the disc layout).
  Editing (deliverable 2): `document-edit` (history: coalescing, `markSaved`/`dirty`, `stateId`/`markSavedAt`, the 1000-step cap,
  `MAX_MERGE`, atomic rollback), `savestate` (untitled names, leaf names, the Save box's directory and name), `recent` (the Recent list: order, cap, case-insensitive dedupe, hostile entries, labels), `documents-roundtrip` (new and corpus documents saved through `DocSave` with stand-ins for `'riscos'`: read back equal, lint, `xmllint`), `ops-blocks` (`removeBlocks`/`insertBlocks`), `props-more` (the A1.3 fields: tabs, pBdr, shd, widowControl, contextualSpacing, run shd, section type read and written back as the same XML, each not-understood form kept raw byte-equal, `__proto__` attributes inert, Strict `start`/`end`, a style's pPr, the written order, edits replacing raw elements, bad models refused), `formatcheck` (`paraPatch` flow flags, tabs, borders, shading; `charPatch` shading), `opsdoc` (`setDocPart` per key and its inverse, refusals, a numbering part made and written and undone, `DocParts`: Strict relationship types, `withStyle` leaving the old table and every raw style's bytes as they were, `findStyle`; values kept by reference through `Document.apply` and compounds, part names of other parts refused, settings refused without a settings part), `opssect` (`splitSection`/`mergeSection`: inverses deep-equal with identity of untouched sections and blocks, refusals, the sectPrs written after a split (also a raw `sectPr` with unknown children, written whole in paragraph `i`) and a merge and read back, the caret after undo/redo), `edit` (typing, Enter, Shift-Enter, Tab, overwrite),
  `editdel` (Backspace, Delete, word forms, ranges, section breaks, 50,000 paragraphs), `edit-prop` (seeded random
  editing with undo and redo back to the start), `layout-prop` (120 seeded editing/undo sequences, and 120 with lists (level changes and numbering on/off by `setProps numPr`): the layout made from the previous one equals a full layout, lines and labels and all), `list-display` (level indents under direct ones, label place, suffixes, lvlJc, alignment, justification, format, caret/click/selection at the text, reuse when a label changes), `edit-roundtrip` (random edits on fixtures and corpus files, write,
  read back, lint, `xmllint`, undo all; one corpus file in ten, or all with `WORD_EDIT_CORPUS=1`, ~2 min; the checks live in `roundtrip-lib.mjs`, shared with `format-roundtrip`: random formatting commands, refused ones changing nothing, counted per kind), `typing`
  (the coalescing rules with a fake clock), `keymap`, `editapply` (the commands and `stepEnd`, the caret after undo),
  `breakmarks` (page and column breaks: tokens, the rule's width and wrap, the offsets contract, `hitTest(caretRect)`
  round trips, clicks, End, selection, Left / Right in a `DocLayout`), `insertapply` (Ctrl-Enter in every place, one
  undo step, the caret after undo/redo, Backspace / Delete, copy and paste within and across documents, written as
  `<w:br w:type="page"/>` in a run, a Word file's breaks and `lastRenderedPageBreak`), `sectbreak` (section breaks:
  each insertion case, one undo step, the caret after undo/redo; the written copy and original sectPr (rsids, header
  references, `w:type`), a last-paragraph sectPr, every paragraph its own section, a section ending with a table;
  Delete / Backspace / Ctrl forms merge (the earlier type), bytes after undo; the band: its gap, label, never the
  caret, clicks in it; `DocPaint` drawing a band when only the gap is in the rect; the first section's page width);
  hostile original sectPrs (w14 / mc / rsid attributes, unknown children, an XML comment, `w:sectPrChange` left out
  of the copy; a paragraph sectPr with `w14` / `mc` attributes read as a break); `opssect` has `setSection`; `layout-prop` has 120 sequences inserting, deleting and retyping section breaks
  (incremental == full, gaps and marks too); `editdel` the keys at a section edge through `EditApply`.
  `flowdeco` (page break before: the flag from the paragraph, style and defaults, the 12 px gap and mark, no contextual cut
  across it, reuse equals a full layout, `DocPaint` drawing the rule when only the gap is in the rect, clicks in the gap);
  `mackeys` pins the Insert menu's `Ctrl+Enter` label on a Mac, `Ctrl+K` / `Cmd+K` (A6.1) and the unbound `Ctrl+Shift+F5`.
  `borders-roundtrip` (A5.5: borders, shading, change case, symbols and special characters; 40 per file, fixtures, own documents, corpus sample).
  `tabs-roundtrip` (A4.4: random ruler and Tabs box commands, see the Tab stops rules; 40 per file, fixtures, tab documents, corpus sample).
  `breaks-roundtrip` (A3.4: the fixtures, documents with 24 sections and header references, the corpus sample; 40 seeded break commands each, undo/redo bursts; every kind of command must have run and changed documents, a key at a section edge that changed nothing makes no undo step; `docx-compare.mjs expectedBack` models what the writer adds: a raw sectPr node for a section made by a break, and a body sectPr when the last section gained properties).
  Formatting (deliverable 4): `format` (`Format.query`), `formatset` (the commands, 50,000 paragraphs), `format-prop` (seeded random commands, undo and redo exact), `format-display` (highlight, superscript, subscript, justified text drawn), `formatapply` (the ids and arguments), `fontlist`, `numberfield`, `colourlist`, `rulermath`, `rulertabs` (A4.2: `RulerTabs` markers, selector, add/drag/remove; `FormatTabs` through `FormatApply` `tabs`: direct and style stops, clear for a removed style stop, move per paragraph, set, raw `w:tabs` refused, more than 64 refused, Strict, bad args, written and read back, 20,000 paragraphs; `RulerPick` ties between tab stops and indent markers; `defaultTicks`), `tabspatch` and `settingsedit` (A4.3: the Tabs dialog's state and command, the default tab stop in `settings.xml`), `zoom` and `toolbarbuttons` (the WimpLib pure modules and `Zoom`), `format-roundtrip` (above); `keymap` has the format keys.
  Lists (deliverable 5): `numbering-read` (the definitions read), `numformat`, `listnumbers` (labels: counters,
  restarts, overrides, legal, style numbering, hostile templates), `list-prop` (random documents against a reference
  counter model written in the test), `list-display` (above), `formatlist` (setList, the next defined level,
  `hasList`), `parind` (the drawn indents, the ruler and Ctrl-M in lists), `editlist` (Tab, Shift-Tab, Backspace,
  Enter), `list-roundtrip` (random list commands on `list-fixtures.mjs` documents and the corpus sample: write, read
  back, lint, `xmllint`, undo all, the numbering part's bytes unchanged; `roundtrip-lib.mjs` `keep`).
  New lists (Batch A2): `listgallery` (the entries, their labels through `ListNumbers`, `kindOf`, `matches`),
  `numwrite` (`ensurePart`: new part, taken names, an existing or unusable numbering relationship, Strict; `addList`:
  no part, an empty part, Word's part with `numPicBullet` / `mc:AlternateContent` / `numIdMacAtCleanup` (old children
  the same nodes, byte-identical), a num naming a missing abstract, non-numeric ids, ids at 2^31 - 1, nsid unique,
  10,000 abstracts < 50 ms, `xmllint` against `wml.xsd`, written and read back; `addRestart`), `listmake` (a new
  list in a document without numbering: part, relationship and Override written, read back with the same labels;
  continued after a gap and over a kept block, not across sections; a new list after another kind or entry; off
  restoring the style; bullets <-> numbers keeping levels; style-numbered headings: direct `numPr`, `numId 0` off;
  List Paragraph added when missing or found under another id; numIds named by paragraphs, kept blocks and styles
  avoided; Strict; Restart at 1 / 5, Continue, two lists continuing (G4); every command one undo step restoring
  sections, numbering, rels, styles and meta deep-equal; Continue over the whole run; a sublevel restart not
  restarting its parent; the kind from level 0 (a numbered list with bullet sublevels); numIds named in a footer
  part or a text box avoided; bad arguments; `FormatApply` ids and `Format.query`
  `listKind`/`listEntry`; hostile numbering parts: RangeError and nothing changed, or old children kept and read
  back equal; 100,000 paragraphs < 3 s, undo < 3 s), `list-make-prop` (300 random runs of 30 toggles / restarts /
  continues / Tab levels against a reference model written in the test: shared lists and labels; undo all exact),
  `autolist` (every marker and its start, a single roman-or-letter decided by the list before it (`v.` after `i.`..`iv.`, `i.` after `a.`..`h.`, the fallback), invisible marks before the marker (a `_GoBack` bookmark kept; a field, link, drawing or tab refusing), the refusals (`1.5`, `a.b`, `e.g.`, `10000000000.`, rounds that do not
  round-trip, mixed case, leading zeros), lists made, continued (after a gap, past other formats) or new, not across
  sections, text after the caret, Tab, never in a list item / style-numbered heading / `numId 0` / after an inline or
  a link, the two undo steps exact with the caret after the space, hostile numbering parts, a document with no
  package, written and read back (`w:start` 3, the dash), 100,000 characters, 50,000 paragraphs; `NumWrite`
  `start`; the hidden gallery entries), `wordchoices` (`WordChoices`, `RecentFiles` and `AutoFormatOpt` with
  stand-ins for `'riscos'`: each key kept by the other's writes and by another writer's, corrupt and hostile files,
  writes before the read, a failed write, the menu item).
  Clipboard (deliverable 6b): `clipslice`, `clipstore`, `cliphtml` (escaping, headings, lists, links, the size cap,
  a round-trip property test write -> parse -> `ClipRead`), `clipread` (whitelist, hostile styles, Word and Google
  Docs fragments, 10,000-deep nesting, 1,000,000 nodes, malformed HTML; `html-fake.mjs` is a small pure HTML
  tokenizer standing in for DOMParser), `clipclean`, `clippaste` (every insertion case, one undo step exact
  including ids, 100,000 paragraphs), `clipboard-prop` (200 random copy / paste sequences in one document against a
  reference model, undo all), `clipboard-roundtrip` (40 random clipboard and Find commands per document on the
  reader fixtures, small styled documents and the corpus sample, gated like `edit-roundtrip`: written, read back,
  lint, `xmllint`, undo all to the opened bytes; each kind must run and change a document), `clippick` (the exact / HTML / plain choice, `samePlain`, `ClipLinks`, `ClipDom`),
  `mackeys` (Cmd as Ctrl on a Mac, never R, L, M, H, C, X, V; Cmd-S, Cmd-N, Cmd-F, Cmd-G; menu labels); `keymap` also covers the
  function keys (real `keyCode()` events, the bare Wimp codes with Shift/Ctrl bits, Alt and unmapped F-keys null)
  and Find's keys (Ctrl-F, F4, Ctrl-H, Ctrl-G, Ctrl-Shift-G). Find: `find` (forwards, backwards, wrap, case folding
  with U+0130 / sharp s / sigma, every code point folded to the same length, emoji and combining marks, whole words
  with punctuation and Chinese, inline items, sections and tables, `replaceOne` formats, `replaceAll` counts, skips,
  one undo step exact with ids, 50,000 paragraphs under 5 s, 10,000 matches in one paragraph, a replacement holding
  the needle, line breaks; a property test of 300 random documents against a naive scan: every start place forwards
  and backwards, count, Replace all). The unit suite is about 2180 tests and runs in about 36 s.
* Browser tests (`index.mjs`, Playwright with the Chromium used by the other suites; `tests/lib/suite.mjs`): `disc
  --check`, `jsrun-wimplib.mjs` (the `wimplib/` import), `boot.mjs` (cold boot: `File$Type_A7E` set and a `.docx` runs
  !Word), `word.mjs` (open, text, formatting, save copy equals the original, 5000 paragraphs opens in ~150 ms,
  the menu does not leak windows), `word-life.mjs` (three runs of !Word add each font face to the page once; no fonts, close, Quit leave nothing
  behind), `word-edit.mjs` (caret and selection: clicks, drags with auto-scroll, Shift/Adjust, double/triple
  clicks, the keys, hiDPI; 30 documents and a document closed mid-drag leave no windows, timers or pointer
  listeners), `word-edit-hostile.mjs` (the hostile documents in the desktop: clicks at extreme places and keys
  < 50 ms; a drag held at the end of the scrolling draws nothing; a drag while the window closes; 500 random
  keys and mouse actions), `word-typing.mjs` (typing through `insertText`, key presses and an input method via CDP;
  the keys table; undo and redo with the star and the caret; Insert; a link and a table; the Edit menu; Save copy
  writes the typed text; Cmd and Ctrl-C/V/X change nothing; hiDPI; 30 open-type-close cycles leak nothing; a window resize leaves the focus in a page field outside the desktop, a click focuses the field again),
  `word-typing-hostile.mjs` (100,000 characters in one event, event storms, 20,000 Enters, 3000 Backspaces, 1000 undos
  and redos, 50,000 paragraphs, a 100,000-character word, a window closed mid-composition, 500 random actions),
  `word-format-hostile.mjs` (select-all in 50,000 paragraphs then Ctrl-B, Ctrl-E, Ctrl-Shift-> and three undos, each
  one step under 5 s; 1000 Ctrl-B on a selection and at a caret; toolbar clicks while an input method composes; each
  toolbar popup open while its window closes; absurd sizes in the size field; zoom while resizing; 500 random keys,
  text, mouse, toolbar, Format menu, zoom and ruler actions with undo-all to the opened model), `word-lists.mjs`
  (labels drawn and edited with real keys and menus), `word-lists-hostile.mjs` (100,000 list paragraphs: open,
  keystroke, Tab within bounds; 100 rounds of Tab/Shift-Tab; absurd numbering (start 2^31, 1000 placeholders, nine
  legal levels, numbering-style and basedOn cycles, unknown `numFmt`); select all + Backspace and Backspace held across
  lists; 500 random actions with list commands, each checked with `checkBlock`, undo-all to the opened model),
  `word-save.mjs`, `word-close.mjs`, `word-quit.mjs` (documents: Save / Save as / Save a copy, the close prompt and
  Revert, New / Recent / Quit / PreQuit), `word-replace.mjs` (free names, Replace / Cancel, Save a copy, the late
  commit's limits, prompts brought forward), `word-page.mjs` (a new document's whole page: pixels, heights, zoom,
  clicks below the text), `word-clipboard.mjs` (real Ctrl/Cmd-C, X, V through the system clipboard, other programs'
  HTML, the exact copy between and within documents, stale tokens, Revert, files only, composing, the Edit menu, Mac
  Cmd keys with `navigator.platform` injected, 50,000 paragraphs, 1000 pastes, hostile HTML with no request and no
  script, undo/redo exact, leaks, a DOMParser round trip of the system clipboard's HTML), `word-fkeys.mjs` (the RISC OS
  function keys and Ctrl-S / Ctrl-N by real key presses, repeats dispatched with `repeat: true`), `word-find.mjs` (Find and
  Replace by real keys and clicks on the box's icons; the hook `task.word.find.run` for messages, two documents, the 1 MB
  needle and 10,000 matches), `word-clipboard-hostile.mjs` (copy, paste and Find against hostile input: the
  Global Constraints list of the clipboard plan, a real input method through the DevTools protocol
  (`Input.imeSetComposition`), 500 seeded random actions with synthetic `ClipboardEvent`s of random plain / HTML
  payloads, real copy / cut / paste keys, the Find hook, F8 / F9, Ctrl-S; the desktop's own sprite loads are the only
  requests allowed), `word-documents-hostile.mjs` (the documents against hostile use; 500 random
  new / type / save / save as / revert / close (Save, Discard, Cancel) / reopen / quit actions, after each: title,
  `*`, path, leaf and `app.docs` key consistent, no stray windows, prompts, Save boxes or tasks, no page errors; every
  file saved with no edits after it read back equal to its document).
  Screenshots: `KEEP_SHOTS=1` writes them to `tests/screens/`.
* **The corpus** (`tests/moreapps/corpus/`, git-ignored, never committed): `tools/moreapps-corpus.mjs` fetches sample
  `.docx` files pinned to commits (python-docx MIT, Apache POI Apache-2.0, Open XML SDK MIT, a few LibreOffice test
  documents), each checked against its git blob hash; `SOURCES.txt` records URL, commit, licence and SHA-256 (the
  licences are repository-level: local testing only). Without an authenticated `gh` every source is skipped with a
  warning and the script still exits 0. `corpus.test.mjs` reads every file, requires `checkBlock` on every block,
  write -> read equal, a byte-stable second generation, unparsed parts byte-identical, every XML part well-formed, and the
  **written child order** of 33,973 property elements; files that are expected to fail are listed in
  `corpus-expected.json` (21, all genuine: old `.doc`, encrypted, not zips...). Result: 633 files, 612 read and
  written, 21 expected refusals, 0 failures; `xmllint` finds no schema error the writer adds (1,824 parts).
* **The package linter** (`tests/moreapps/lint-package.mjs`, `lintPackage(zipParts) -> {problems, facts}`; also a
  CLI) checks what schema validation of single parts cannot: level `error` = `no-content-types`, `ct-none` (a part
  with no type), `ct-dup`, `ct-orphan` (an Override for a missing part), `rel-id-dup`, `rel-missing` (an internal
  relationship of a known kind to a missing part), `ct-generic` / `ct-wrong` (a known part not typed as its
  relationship kind requires), `rid-unresolved` (an `r:id`/`r:embed`... in the main part, headers, footers, notes or
  comments with no relationship), `note-ref-missing`, `note-separators`; level `word` (Word always writes it, its
  absence is not known to matter) = `docpr-dup` (Word opened round 1's Strict file with duplicate `wp:docPr` ids;
  10 Word-made corpus files have them), `drawing-shape` (`wp:inline`/`anchor` without `wp:effectExtent` or
  `wp:cNvGraphicFramePr`), `notepr-missing`, `no-settings`, `no-app`. On the corpus: 8 of 615 originals have errors,
  all deliberately broken test files (`InvalidDocProps*`, a missing `[Content_Types].xml`, orphan Overrides, a PDF
  as an image, an untyped extra entry); **no file has `ct-generic`** (582 are Word-made). The corpus test requires
  that the written file has no package error its original did not have.
* **Real files on this machine** are off by default (the corpus and the fixtures cover real documents, and a plain
  `node --test tests/moreapps` must not read private files). `MOREAPPS_REAL_DOCX=1` round-trips up to 80 `.docx`
  found under `/Applications`, `/System/Library`, `/Library` and `/usr/share` (never the home folder) and the
  folders in `MOREAPPS_REAL_DOCX_DIRS` (colon-separated), e.g.
  `MOREAPPS_REAL_DOCX=1 MOREAPPS_REAL_DOCX_DIRS=~/Documents node --test tests/moreapps/docx-roundtrip.test.mjs`. The
  list of the default folders is kept for a day in the system temporary directory (`moreapps-real-docx.txt`), never
  in the repository.
* **Mutation-test the tests** when you change the writer: break the order (reverse `pPr` children), the placement of a
  `w14` element, the Override for a part, then check a test fails (the corpus test caught pPr reversal in 158 files,
  rPr 167, sectPr 605, `w14` insertion 174).
* **The real-Word hand-off** (`tests/moreapps/corpus/handoff/`, local only): a script can write new documents with
  `newDoc` + `Document` and the round trips of the rich fixture and of corpus documents, for opening in real
  Microsoft Word: there must be no repair prompt and no Compatibility Mode. Round 1: everything opened except the
  rich fixture of `word.mjs` (generic content types, above; `build-docx.mjs` now types notes, headers, footers and
  docProps parts as Word does). Round 2 adds a bisect set (`2-bisect/2a`...`2k`: one feature per file, Word-like
  packages, plus controls with one part typed `application/xml` each) to confirm the cause in Word.

### Verified in real Word

The owner opened round 2's bisect controls in real Microsoft Word:

* `2j-wrong-types-only-core.docx` (only `docProps/core.xml` typed `application/xml`): Word's hard failure, "Word
  experienced an error trying to open the file", the same failure as the original broken file.
* `2i-wrong-types-only-footnotes.docx` (only `word/footnotes.xml` typed `application/xml`): the milder "Word found
  unreadable content ... Do you want to recover the contents?" prompt.
* `2k-footnote-no-settings.docx` (footnotes and their separator notes, but no `word/settings.xml`): opens without
  a message. The writer therefore does not add a settings part.

So a generic core-properties type alone breaks the file and a generic footnotes type alone makes Word repair it.
The writer repairs the generic content types of known parts (`tools/moreapps/!Word/PartTypes`, above), and the
package linter (`tests/moreapps/lint-package.mjs`) reports a known part typed generically (`ct-generic`) or wrongly
(`ct-wrong`), core properties and footnotes, endnotes and comments included, at level `error`, its most severe
class (the other level, `word`, is for things whose absence is not known to matter).

### To check in real Word (editing, deliverable 2)

Behaviour chosen without real Word to compare, for the hand-off list (the user guide's section 3 says they are
guessed; section 5 does the same for formatting):

1. the merge rule at a paragraph boundary (the first paragraph's properties win unless it is empty and the second is
   not);
2. the extent of Ctrl-Backspace / Ctrl-Delete (a run of punctuation counts as a word; what they do across a line
   break is not decided);
3. Enter applying a style's `next` for any style (not only headings; otherwise Heading 1-9 and Title give Normal);
4. deleting a selection across a section break (Word removes the break and merges the sections; !Word keeps every
   section, emptied ones with an empty paragraph, and one left ending with a table gets an empty paragraph after it);
5. undo granularity (a word with its trailing spaces; a pause over 1 s, a caret move, Enter, Tab and every deletion
   start a new step; each Backspace is a step);
6. text typed right after a hyperlink is plain text after it (does Word join it to the link?);
7. Enter in an empty list item ends the list (numId 0 when the style numbers it: G18 below); Shift-Enter in a list
   item stays in it.

The hand-off files for these questions are made by `node tests/moreapps/handoff-typing.mjs` (local, in
`tests/moreapps/corpus/handoff/`: `typed-1-basic.docx`, `typed-2-rich.docx`, `typed-3-undo.docx`, `typed-4-sections.docx` and `typed-README.txt`; the
corpus is git-ignored, so none of it is committed). They must be opened in real Word by the owner before the branch is
merged: nothing in this deliverable has been seen in real Word.

### To check in real Word (formatting, deliverable 4)

`node tests/moreapps/handoff-format.mjs` writes `fmt-1-character.docx`, `fmt-2-paragraph.docx`, `fmt-3-rich.docx`,
`fmt-4-undo.docx` and `fmt-README.txt` into `tests/moreapps/corpus/handoff/` (local, never committed; only changed
bytes are written and no other file there is touched). The README lists what Word should show and the open
questions. The README is local (the corpus is git-ignored); the questions, to be tried in real Word, are:

| | question | what !Word does |
|---|---|---|
| F1 | toggle rule on a mixed selection | Ctrl-B on partly bold text makes all of it bold; clears only when all is bold |
| F2 | un-bolding a heading | writes `w:b w:val="0"`; Ctrl-B again removes it |
| F3 | reach of clear formatting | font, bold, italic, underline, strike, colour, size, highlight, super/subscript and character style; keeps paragraph formatting and other run properties (Word's Clear All also resets the paragraph) |
| F4 | superscript size and offset | 0.65 of the size, raised 0.35 (subscript lowered 0.15) |
| F5 | highlight colours | fixed colours for Word's 16 names; text on a dark highlight stays black |
| F6 | justified line breaks | breaks first, then spreads the space; last line left |
| F7 | `firstLine` vs `hanging` | one or the other is written and the other removed; does Word keep a 0 first line over a style's hanging? |
| F8 | applying a style | replaces the style, keeps direct formatting |
| F9 | the `auto` colour | removes `w:color` where no style gives one, else writes `auto` (drawn black) |
| F10 | first-line drag over paragraphs with different left indents | each gets the same first-line position, keeping its own left |
| F11 | Format > Colour palette | the desktop's (Red DD0000); should it be Word's standard colours? |
| F12 | ruler snapping | 1/16 inch (Shift: free); Word's modifier is Alt |
| F13 | a hyperlink in a bold selection | its text is left alone (Word makes it bold) |
| F14 | no default size anywhere in the styles | !Word assumes 11 pt (Word is believed to show 10 pt); a chosen size is always written (`sz` 22 for 11 pt) |
| F15 | bold as a toggle property (direct `w:b`, a bold character style, a bold paragraph style) | any `b: true` is bold; a size change removes a direct `b` that the styles seem to give |

### To check in real Word (lists, deliverable 5)

`node tests/moreapps/handoff-lists.mjs` writes `list-1-bullets.docx`, `list-2-numbered.docx`,
`list-3-multilevel.docx`, `list-4-edits.docx` and `list-README.txt` into `tests/moreapps/corpus/handoff/` (local,
never committed; only changed bytes written, no other file touched). Files 1-3 are built as `.docx` (`list-fixtures.mjs`)
and opened and saved by !Word; file 4 is edited with !Word's commands. The README (local) lists every paragraph's label
and indents as !Word draws them, and the questions (G1..G23):

| | question | what !Word does |
|---|---|---|
| G1 | letters after z | aa bb .. zz, then aaa |
| G2 | restart after a higher level | any higher level restarts deeper counters |
| G3 | `lvlRestart` 0 | never restarts |
| G4 | two numIds on one abstractNum; `startOverride` | one shared count; the override restarts once per numId |
| G5 | bullet glyphs (Symbol, Wingdings, Courier New 'o') | mapped to Unicode shapes (`BulletGlyph`) |
| G6 | label wider than its hanging space | text at the next tab stop after it (the paragraph's own stops, else the default ones from the MARGIN, as in-text tabs since A4.1) |
| G7 | indent precedence | style < level < direct, attribute by attribute (a level giving only `left`) |
| G8 | indents of style-numbered headings | the level's |
| G9 | right-aligned labels | inside the hanging space; Word may let them stick out left |
| G10 | Backspace at an item's start | number off, text kept in place (direct indent), second press joins |
| G11 | Remove from list | back to the style's indents |
| G12 | Tab / Shift-Tab | next DEFINED level; Shift-Tab anywhere in an item; top/bottom: nothing |
| G13 | Tab on a style-numbered heading | direct `numPr` level, the heading style kept (Word: switches style?) |
| G14 | `isLgl` | every number of the level decimal |
| G15 | `ilvl` without `numId` | no number unless the style gives a numId |
| G16 | `numPr` inside a tracked change | shown (as accepted), written back as it was |
| G17 | a start of 2^31 or negative | shown as given (Word may repair the file) |
| G18 | Enter in an empty item of a style-numbered list | ends the list: `numId 0` written, the style kept |
| G19 | Shift-Tab in the middle of an item | promotes (Word: only at the start?) |
| G20 | Tab at an item's start on a single-level list or the deepest level | nothing (Word may indent or type a tab) |
| G21 | `<w:numPr><w:numId w:val="0"/></w:numPr>` without ilvl | written so; no number shown (Word: opens without repair?) |
| G22 | the label's font | the first run's `rPr` (Word: the paragraph mark's) |
| G23 | Tab with a selection inside one item starting at offset 0 | demotes (Word may replace the selection with a tab) |

### To check in real Word (new lists, Batch A task A2)

The hand-off files are `nl-1-new-bullets.docx`, `nl-2-new-numbers.docx`, `nl-3-restart-continue.docx` and
`nl-4-existing-part.docx` with `nl-README.txt` (`node tests/moreapps/handoff-newlists.mjs`); the rules made so far:

| | question | what !Word does |
|---|---|---|
| L1 | the six bullets and six numberings of the gallery (`ListGallery`), three levels each (bullets) or levels 0-3 | each opens in Word with the glyphs of Word's own gallery (Symbol U+F0B7 disc, Courier New `o` circle, Wingdings square U+F0A7, diamond U+F076, arrow U+F0D8, check U+F0FC), indents 720 + 360 hanging per level, and the formats cycling 1. a. i. / 1) a) i) / I. A. 1. / A. a. i. / a) i) 1) / i. a. 1.; the files `nl-1`, `nl-2` |
| L2 | Bullets / Numbering after a gap of plain paragraphs | continues the nearest earlier list in the section when its level 0 is the chosen format (owner's ruling); a list of another kind or format nearer: a new list |
| L3 | Restart / Start at | a new `w:num` on the same abstract with one `startOverride`; the item and every later item of its list move to it; of the source num's other overrides only level replacements are copied (Start at 5 on an item, then a sublevel restarted: the next top-level item shows 6) |
| L4 | a document with no numbering part, Bullets clicked; one with a Word numbering part extended | the part, its relationship and its content type are written new (or the part extended: the new abstract after the last abstract and before the first num, the new num after the last num and before `numIdMacAtCleanup`, every old node as it was) and Word opens the file without a repair prompt, showing the list; the files `nl-1`, `nl-4` |
| L5 | List Paragraph | given to default-style paragraphs turned into a list, back to the default when turned off |
| L6 | list items copied from one !Word document and pasted into another | decided (owner: keep them, as Word): the list is made in the target, a new one copied from the source's definitions; borders, shading and tab stops come too. The questions are L6-1..L6-6 in "To check in real Word (lists, borders and shading pasted between documents, L6)" |
| L7 | Continue numbering on any item of a restarted list | the whole run of that list (up to another list either side) joins the previous list: five items, Restart on the third, then Continue on the fourth gives `1. 2. 3. 4. 5.`; items of two `w:num`s on one abstract share one count (G4) |
| L8 | a bullet sublevel of a numbered list, Numbering / Bullets clicked | it counts as numbered (level 0 decides): Numbering takes it out of the list, Bullets gives it a bullet list of its own at its level |
| L9 | a paragraph with a direct indent put into a list, or taken out | the direct `w:ind` is kept both ways (it overrides the level's indent while in the list) |
| AF1 | `- ` typed at a paragraph's start (AutoFormat) | a bullet list whose level 0 is an en dash U+2013 in Calibri (hidden gallery entry `dash`); `* ` the disc, `> ` Wingdings U+F0D8: what does Word write for each? |
| AF2 | `3. ` typed at a paragraph's start with no list before; `3. ` after a list `1.` `2.` | a new list whose abstract's level 0 has `w:start 3` (Word may use a `startOverride` instead); after `1.` `2.` the list is continued (the label it would get is the number typed), any other number starts a new list |
| AF3 | which markers convert | `*` `-` `>`; `N.` `N)` `(N)` (0..32767, no leading zero); one letter `a.` `a)` `A.` (`A)` not); roman `i.` `I.` and longer canonical romans up to 39 with `.` only (`v.` `x.` `c.` `M.` are letters; `i)` none), except that a single letter that can be roman is read as whichever continues the nearer earlier list (`v.` after `i.`..`iv.` roman 5; `i.` after `a.`..`h.` the letter i); `(1)` and `a.` use hidden entries `(1) (a) (i)` and `a. i. 1.` |
| AF5 | a marker after invisible marks (Word's `_GoBack` bookmark, a proofing mark, a comment range) | converts, the marks kept before the item's text (owner's ruling: unseen zero-width inlines do not count); after a link, a field, a drawing or a tab: no conversion |
| AF4 | Ctrl-Z right after the conversion; Tab instead of the space | the first Ctrl-Z gives back the typed marker and space (caret after it), the second the typing; Tab after a marker converts too (the tab removed) |

### To check in real Word (page and section breaks, Batch A task A3)

`node tests/moreapps/handoff-breaks.mjs` writes `brk-1-pagebreaks.docx` (Ctrl-Enter mid-paragraph, at an end, at a start, in an empty paragraph, in a numbered item, at a heading, over a selection), `brk-2-sections.docx` (Next page and Continuous breaks in a landscape original with a header and a page-number start), `brk-3-deleted.docx` (breaks taken out again with Delete / Backspace) and `brk-4-flow.docx` (page break before, keep with next chain, keep lines, widow control off) and `brk-README.txt` into `tests/moreapps/corpus/handoff/` (local, never committed; only changed bytes are written, no other file touched). The README lists every section's `sectPr` and every paragraph as written, and the questions:

| | question | what !Word does |
|---|---|---|
| PB1 | Ctrl-Enter mid-paragraph, at the end, at the start, in an empty paragraph | the break at the caret, then the paragraph split after it (Word 2013's form): `abc<w:br w:type="page"/>` ends the first paragraph, the rest is a new paragraph with the same properties (in a list: the next item). Does Word open the file with the text after the break at the top of the next page, and no empty paragraph at the top of that page? |
| PB2 | Ctrl-Enter at the start of a numbered item or a heading | the paragraph left holding only the break keeps its `numPr` / `pStyle`, so it takes a list label (the item after it is renumbered) or a heading level of its own, and the text goes on in the next paragraph (Enter's rules; ruling: kept until checked). What does Word do: is the break's paragraph numbered / a heading, or does Word give it the default style? Also mid-item: the item ends with the break and the next item (same `numPr`) starts the new page |
| PB3 | a page break pasted into another document | kept as a page break (before: a line break) |
| SB1 | Insert > Section break in a document with headers / footers | the section before the break gets a copy of the `sectPr` with the same `w:headerReference` / `w:footerReference` relationship ids (but without `w:sectPrChange`: revision ids stay unique; the original keeps it); the section after keeps the original with `w:type`. Does Word open it without a repair prompt and show the same headers in both sections (and "Link to Previous" as expected)? |
| SB2 | a section with `w:pgNumType w:start` (or a tracked `w:sectPrChange`) split | the copy keeps `w:start`, so both sections restart page numbers at that number; a `w:sectPrChange` stays only on the original (the section after the break). Does Word drop `w:start` from one of them, and which section does it give the tracked change? |
| SB3 | Delete at a section break | the merged section takes the FOLLOWING section's properties (page size, margins, headers) with the EARLIER section's `w:type`. Does Word keep the following section's properties too? |
| SB4 | deleting a range across a section break | every section kept (as before). Does Word remove the break and merge the sections? |
| SB5 | Backspace at the start of a list item that begins a section | the break goes first (the item keeps its number). Does Word remove the number first? |
| SB6 | the label of a break | the following section's `w:type` (`nextPage` when none). Does Word show "Section Break (Continuous)" at the end of section 1 when section 2's type is continuous? |
| B1 | page break before on the first paragraph, in a numbered item, and with other flags (brk-4) | the rule is shown for the flag wherever it is set (also on the first paragraph, where Word starts no new page). Does Word start a page for each flagged paragraph, and none for the first? |
| B2 | keep with next / keep lines / widow control (brk-4) | written as `w:keepNext`, `w:keepLines`, `w:widowControl w:val="0"`. Does Word's Paragraph box show the same boxes? |
| B3 | a Continuous break between sections of a different page size or orientation | the type is kept and drawn "(Continuous)"; Word is believed to start a new page whatever `w:type` says (no file) |
| B4 | Insert > Section break in the last EMPTY paragraph of a section | that paragraph ends the section and an empty one is added after it. Word's own does the same? (brk-2 paragraph 7) |

### To check in real Word (documents, deliverable 6a)

`node tests/moreapps/handoff-documents.mjs` runs !Word in the desktop and copies out what it saved:
`new-1-empty.docx` (New, saved untouched from the Save box), `new-2-typed.docx` (New, typed with real keys, Ctrl-B /
Ctrl-I), `saved-1-edited.docx` (the rich document of `edit-rich.mjs` opened, edited, Save), `saved-2-as.docx` (edited
again, Save as), and `doc-README.txt` (local, never committed; only changed bytes written, no other file touched):

| | question | what !Word does |
|---|---|---|
| D1 | a NEW document opens with no repair prompt? | `NewDoc` parts (styles, settings with compatibilityMode 15, core/app props) |
| D2 | the default look | Calibri 11, 8 pt after, 1.08 lines, 1" margins, A4 |
| D3 | A4 or Letter for New | A4 always (`app.newDoc({paper: 'letter'})` exists, not on a menu) |
| D4 | properties | no `dc:creator`; `lastModifiedBy` Word; created = modified = the time of New; a saved existing document keeps its docProps as read (modified not updated) |
| D5 | a saved-back edited document keeps everything | the reader/writer round trip (corpus: no loss but `rsid`) |
| D6 | names on the host | `Report/docx` -> `Report.docx` on HostFS; a plain `Report` -> `Report,a7e`; file type &A7E |

### To check in real Word (clipboard, deliverable 6b)

`node tests/moreapps/handoff-clipboard.mjs` writes `clip-1-samedoc.docx` (copies and a cut pasted in the same
document: exact route, a second live hyperlink with the same relationship id, a list item continuing its list, a
second copy of a table), `clip-2-crossdoc.docx` (pieces of the rich document pasted into a new one: heading style by
name, link as text, a list item's text without its paragraph mark plain, table left out), `clip-3-html.docx` (a new document made by pasting Word,
Google Docs, web page, table, `<pre>` and Notepad payloads; parsed by `html-fake.mjs` standing in for DOMParser),
`clip-4-tableids.docx` (a table with a bookmark pasted as text, a table with `w14:paraId` pasted whole without them),
`find-1-replaceall.docx` (Replace all with Match case / Whole words, link text skipped, a tab in the replacement, a
needle with pattern characters, one Replace) and `clip-README.txt` into `tests/moreapps/corpus/handoff/` (local,
never committed; only changed bytes written, no other file touched; the main parts validate against `wml.xsd`). The
README lists what Word should show, the questions and the checks by hand in a browser (copy and paste to and from
Word, Google Docs, a web page, Notepad; the Edit menu; Safari / Firefox):

| | question | what !Word does |
|---|---|---|
| C1 | documents with pasted content open with no repair prompt (clip-1..3, find-1) | same-document paste keeps raw inlines and tables as they are |
| C2 | formatting pasted from other programs (clip-3) | the whitelist: b i u s sup sub, colour, first font family, size (clamped), alignment |
| C3 | links across documents | the link's display text only (no rel, no link formatting) |
| C4 | headings and lists from HTML | Heading N by name (plus direct bold and size); list items plain paragraphs |
| C5 | tables | from HTML: a paragraph per row, cells joined by tabs; across !Word documents left out; same document copied whole |
| C6 | Replace all (find-1) | literal, one `spliceText` per paragraph, the first replaced character's format, link text skipped |
| C8 | tables with ids pasted in the same document (clip-4-tableids.docx) | a table holding a bookmark is pasted as text; one with only `w14:paraId` as a table without them |
| C7 | a picture copied and pasted in the same document: Word opens it with two `wp:docPr` of the same id without a repair prompt? (believed tolerated, unverified) | same-document paste keeps drawings as they are |

### To check in real Word (paragraph spacing, Batch A task A1)

`node tests/moreapps/handoff-spacing.mjs` writes `sp-1-linespacing.docx` (1.0, 1.15, 1.5, 2, 3, exactly 12 pt with 18 pt
text, at least 30 pt, the default), `sp-2-before-after.docx` (Ctrl-0 on and off, mixed selection, Add space after, List
Paragraph's contextual spacing, raw autospacing), `sp-3-flow.docx` (keep with next, keep lines, widow control off, page
break before) and `sp-README.txt` into `tests/moreapps/corpus/handoff/` (local, never committed; only changed bytes
written, no other file touched). The README lists every paragraph's written values and the questions:

| | question | what !Word does |
|---|---|---|
| S1 | Ctrl-0 on a selection whose paragraphs have different space before | sets 0 unless every paragraph has none (then 12 pt) |
| S2 | Format > Line spacing > Add space after | 12 pt after, as Add space before (Word's amount unverified) |
| S3 | a paragraph with `w:beforeAutospacing` / `w:afterAutospacing` (HTML-made documents): line spacing changed, then space before set | the flags kept when only the line changes; setting before removes `beforeAutospacing` / `beforeLines`; Auto drawn as 14 pt |
| S4 | `w:widowControl` absent everywhere | taken as on (Word's default); turning it off writes `w:val="0"` |
| S5 | exact line spacing: where the baseline sits, and what is cut off | baseline at 0.8 of the line, the text clipped to the line's box |
| S6 | the default line spacing of a new document (Normal 259 / 1.08 lines) | shown at that pitch as "Multiple 1.08"; compare sp-1 paragraph 8 with paragraph 1 (single) |

### To check in real Word (tab stops, Batch A task A4)

`node tests/moreapps/handoff-tabs.mjs` writes `tab-1-kinds.docx` (the five kinds with each leader), `tab-2-decimal.docx`
(a price list on a decimal stop, a contents list with a right stop and dots, a glossary with a hanging indent),
`tab-3-ruler.docx` (stops made as the ruler and the Tabs box make them, moved and removed, a style's stop cleared in
one paragraph), `tab-4-default.docx` (the default tab stop changed from 0.5" to 1") and `tab-README.txt` into
`tests/moreapps/corpus/handoff/` (local, never committed; only changed bytes are rewritten). The README lists what
was really written per paragraph. The questions:

| | question | what !Word does |
|---|---|---|
| T1 | text after a right / centre / decimal tab wider than the room between the text before it and the stop | the tab takes no width: the text follows the text before it and wraps as usual (ruled as Word's behaviour) |
| T2 | a list label that ends exactly at its indent; a tab in the text that ends exactly at a stop | label: the text at the indent; in the text: the NEXT stop (a stop at the tab's own place never counts) |
| T3 | a tab with no stop before the right indent; a custom stop past it | goes to the right indent (a custom stop keeps its kind there); the text after it wraps normally |
| T4 | default stops before a hanging indent on the first line | not used: the tab goes to the hanging indent unless a custom stop comes before it (ruled as Word's behaviour) |
| T5 | spaces typed after right-aligned or centred text | not counted: the text itself ends at (or is centred on) the stop |
| T6 | the Tabs dialog on a selection of paragraphs with different stops | shows the first paragraph's stops; Set / Clear / Clear all apply to each paragraph's own stops |
| T7 | a new `w:defaultTabStop` inserted into `settings.xml` (none before), and one written `72pt` where the file had `0.5in` | opens without a repair prompt and shows the new default stops (tab-4 rewrites an existing one) |
| T8 | the Paragraph box's Tabs... button | opens the Tabs box and LEAVES the Paragraph box open with its own pending values; Word applies the Paragraph box first and closes it |
| T9 | the leaders (tab-1) | dots, hyphens and middle dots drawn as whole characters on a grid counted from the margin; underscore and heavy as a line (heavy twice as thick). Do they look like Word's? |
| T10 | a stop the paragraph's style gives, removed (tab-3 paragraph 2) | a clear stop is written in the paragraph's own stops (`<w:tab w:val="clear" w:pos="1440"/>`). Does Word show it gone and write the same? |
| T11 | a bar stop (tab-1 line 8) | a vertical line at its place on every line of the paragraph |
| T12 | the Tabs box's position field | shows hundredths of an inch (a stop at 20 twips reads 0.01"); Word shows the same? |

### To check in real Word (borders, symbols, case, Batch A task A5)

`node tests/moreapps/handoff-borders.mjs` writes `bdr-1-boxes.docx` (a box in each style and each width from 1/4 pt to
12 pt, a group with a between line, a group whose left indents differ, a side turned off, a colour on each side),
`bdr-2-shading.docx` (paragraph shading with and without lines, in a group, character shading with a highlight over it,
a 25 percent pattern), `sym-1-symbols.docx` (the first six characters of each set, a no-break space, a non-breaking
hyphen, an optional hyphen), `case-1.docx` (each Change case mode and the Shift-F3 cycle on one text) and
`bdr-README.txt` into `tests/moreapps/corpus/handoff/` (local, never committed; only changed bytes are rewritten). The
README lists what was really written, paragraph by paragraph. The questions (BD for borders: the review renamed D1..D3):

| | question | what !Word does |
|---|---|---|
| BD1 | paragraphs with shading and no lines (bdr-2 lines 5 to 7) | one band only when the fill is equal; different fills are separate bands |
| BD2 | widths: the box offers 1/4 to 3 pt, the file can have up to 12 pt (bdr-1) | drawn up to 12 pt (sz 96), clamped beyond; does Word's box offer / draw 6 pt and 12 pt? |
| BD3 | a group with a between line (bdr-1 Group A) | one box, top on the first paragraph, between line, bottom on the last, sides unbroken |
| BD4 | the same borders with different left indents (bdr-1 Group B); only the right indent, or only the first-line indent, differing | left or right indent differing separates the boxes; the first-line indent does not |
| BD5 | line styles | single and thick solid (thick as wide as its width), double, dotted, dashed drawn; every other name as single, kept in the file |
| BD6 | shading and the space before / after (bdr-2 line 2) | the space before the first and after the last paragraph of a box is not shaded; the space between paragraphs of a box is |
| BD7 | character shading (`rPr/w:shd`) with a highlight on the same text (bdr-2 line 9) | the highlight is drawn over the shading |
| BD8 | a themed (raw) border or shading | the box beeps and changes nothing; Word changes it |
| BD9 | Apply to Text at a caret | sets the pending format for the next text; Word may shade the word. Text borders (`w:bdr`) are not offered |
| BD10 | a box on a list item | the box takes in the label (hanging indent), left side at the label's left. (Make it in Word, open in !Word) |
| SY1 | symbols as plain Unicode text in the current font (no `w:sym`) | every character of sym-1 in Calibri or a fallback; which need another font? |
| SY2 | `<w:noBreakHyphen/>` and `<w:softHyphen/>` in a run (sym-1 lines 12 to 14) | open without a repair prompt; never breaks / breaks only at the end of a line (and Word shows a hyphen there; !Word shows nothing) |
| SY3 | the sets (Latin-1, Latin Extended-A, Greek, Cyrillic, punctuation, currency, letterlike, arrows, maths, shapes) | characters every bundled family has; Word's Calibri may lack some |
| SY4 | a no-break space after `1.` | makes no list (only a typed space does) |
| SY5 | Ctrl+Shift+- reaching the page (browsers may zoom out); a symbol in overwrite mode | replaces the next character like typed text; Word? |
| CS1 | the Shift-F3 order (case-1 lines 7 to 9) | CAPITALS -> small -> Title Case from any text (a sentence or mixture goes to capitals); Word cycles Sentence case -> lowercase -> UPPERCASE? |
| CS2 | Capitalize Each Word | the rest of each word is made small ("O'neil's", "Well-Known"); Word leaves the other letters? |
| CS3 | lengths never change (case-1 line 4) | `straße` -> `STRAßE`, the fi ligature unchanged; Word writes `STRASSE` |
| CS4 | final sigma (case-1 line 10) | a capital sigma ending a word becomes the final sigma ς when lowercased |
| CS5 | a caret in a word / between spaces | the word is changed / nothing changes |
| CS6 | Shift-F3 on a selection | selection kept, one undo step per press |

### To check in real Word (links, bookmarks, format painter, word count, Batch A task A6)

`node tests/moreapps/handoff-links.mjs` writes `lnk-1-links.docx` (a web, a mail and an FTP link, a short `www.`
address, a ScreenTip, a bold italic phrase as the link, an address with a space and `&`, a link to a bookmark, one link
edited and one removed), `bm-1-bookmarks.docx` (two hidden bookmarks that came with the file, then bookmarks over a few
words, across three paragraphs, at a caret, nested, overlapping, one moved by adding its name in other case, one
deleted), `paint-1.docx` (the format painter: a drag over words, a replaced format, a paragraph format, a list item made
and taken away) and `lnk-README.txt` into `tests/moreapps/corpus/handoff/` (local, never committed; only changed bytes
are rewritten). The README lists what was really written, paragraph by paragraph, and the word counts !Word shows for
each file (words, characters with and without spaces, paragraphs: compare with Word's Review > Word Count). The
questions (H for hyperlinks, BM for bookmarks, FP for the painter, W for the count):

| | question | what !Word does |
|---|---|---|
| H1 | Remove link after Insert hyperlink over a run with its own character style (`w:rStyle`, e.g. Emphasis) | the link's runs take the Hyperlink style (one character style per run), so Remove link leaves that run with no character style: its own style is lost (direct formatting is kept); Word? |
| H2 | Edit hyperlink with a new address, and Remove link | the old relationship stays in the file, unused (valid; lnk-1 lines 10 and 11); Word opens it without complaint? |
| H3 | the Hyperlink character style added on first use (colour 0563C1, single underline, `basedOn` the default character style, `uiPriority` 99, `unhideWhenUsed`) | Word shows the links blue and underlined and the style in its Styles pane as usual |
| H4 | `www.example.org` typed as the address gets `http://` in front; a space is written `%20`, `&` as `&amp;`; a ScreenTip is `w:tooltip` (lnk-1 lines 5, 6, 8) | Word opens the right addresses with Ctrl+click and shows the ScreenTips |
| BM1 | a bookmark added by !Word (`w:bookmarkStart w:id w:name` / `w:bookmarkEnd w:id` as direct children of `w:p`, ids from one more than the largest) | opens without a repair prompt; Insert > Bookmark lists it; Go To selects the same text |
| BM2 | a bookmark across paragraphs, and one at a caret (start and end together) | Word keeps both; the caret one is an empty bookmark at that place |
| BM3 | deleting the paragraph that holds a bookmark's start (its end in a later paragraph) | !Word moves the start to where the deletion was (the bookmark shrinks); Word the same? |
| BM4 | Left / Right next to a bookmark | one press per visible character (the marks never take a press); Word? |
| BM5 | typed text right after a bookmark's end / before its start | !Word: text typed at the caret between the marks goes inside; after the end mark, outside; Word extends a bookmark only when typing inside it? |
| BM6 | a name Word itself refuses (from a file: `1st`, `has space`, longer than 40) | !Word lists, goes to and deletes it, but never makes one |
| BM7 | typing or pasting over a selection that holds a bookmark's start whose end is outside it | the start is put back where the selection was and the new text goes BEFORE it, so the typed text lands outside the bookmark; Word keeps it inside? |
| FP1 | a click with the painter on paints the word there and the paragraph | Word paints the clicked word (character format) and, when a paragraph mark was picked, the paragraph |
| FP2 | the pick's run properties REPLACE the target's (a bold word painted from plain text becomes plain) | Word's format painter replaces the character format |
| FP3 | a list item picked with its paragraph mark and painted over a plain paragraph | the paragraph joins the list (same numId and level); painting a plain paragraph over an item takes it out of its list |
| FP4 | the character style (`w:rStyle`) of the pick | copied; a pick without one removes the target's style |
| FP5 | raw paragraph children `!Word` does not model (`w:bidi`, `w:framePr`, `w:suppressAutoHyphens`, `w:textAlignment`, `w:textDirection`) | stay on the target and are not carried from the pick (only `PPR_FIELDS`' raw ones, tabs, borders, shading... are); Word copies them? Change records and `w:id` elements are never carried and a run keeps its own |
| FP6 | a sticky pick after an undo removed its list or character style | the part is dropped when painting (the target's list is left alone); no error |
| W1 | each East Asian character counted as a word (and ending the word beside it) | Word's status bar and Word Count box give "Asian characters" and "Non-Asian words": the sum is what !Word shows; kana and Hangul the same? |
| W2 | characters are code points (an emoji is 1; Word counts UTF-16 units?) | the Characters line for a document with emoji and with combining marks |
| W3 | the no-break spaces (U+00A0, U+2007, U+202F) are left out of "no spaces" and join words | Word's Characters (no spaces) for `a<nbsp>b`; words 1 |
| W4 | tables' text, links' text and field results in; field codes and tracked deletions out; text boxes, footnotes and headers not counted | the Word Count box with "Include textboxes, footnotes and endnotes" off, on a document with each |

### To check in real Word (lists, borders and shading pasted between documents, L6)

`node tests/moreapps/handoff-cliplists.mjs` writes `cl-1-source.docx` (the document to copy FROM, in Word and in
!Word: a multilevel list, its twin restarted at 5 on the same abstract, a bordered, shaded, right-aligned paragraph
with two tab stops and indents, a two-level bullet list), `cl-2-pasted.docx` (all of it pasted by !Word into a new
document), `cl-2b-next-to-a-list.docx` (its first items pasted after a list of the target),
`cl-2c-last-item-text.docx` (the last item copied without its paragraph mark), `cl-3-strict.docx`
(pasted into a Strict document) and `cl-README.txt` (the steps in Word and every paragraph as read back, with its
label) into `tests/moreapps/corpus/handoff/` (local, never committed; only changed bytes written).

| | question | what !Word does |
|---|---|---|
| L6-1 | the pasted documents open without a repair prompt (cl-2, cl-2b, cl-3) | new `w:abstractNum` / `w:num` added (old nodes untouched), numbering part and relationship made when missing; main and numbering parts validate against `wml.xsd` |
| L6-2 | the labels after a paste into a new document (step 2) | those of the source (1. a. 2. 5. 6., the bullets): one new abstract per source abstract (fresh `w:nsid`, no `w15:`/`w14:` extensions, no `lvlPicBulletId`, no level `pStyle`), one new num per source num with its `lvlOverride`s |
| L6-3 | items pasted next to a list of the target (step 3) | a new list (1. a. 2.), never the target's (Word's "keep source formatting" is believed to do the same; "merge" would continue it) |
| L6-4 | items copied from the middle of a list | numbered from the copied definition's start (1.), not their number in the source (Word may keep it) |
| L6-5 | the bordered paragraph | borders, shading, tab stops, indents and alignment as in the source (all modelled `pPr` fields kept; raw extras cleaned) |
| L6-6 | a Strict target (cl-3) | the copied definitions and paragraphs spelled Strict: `w:ind w:start`, `lvlJc` / `jc` start / end, tab stops start / end, `pBdr` `w:start` (and the other way for a Transitional target). Only these NAMES are respelled: other attribute VALUES in raw extras and the copied `w:lvl` (`rPr`, `pPr`) stay as the source wrote them, and some are thought to be Transitional-only (`w:w w:val="150"` where Strict wants `150%`; ST_OnOff `on` / `off`): does Word open cl-3 without a repair prompt? (open item below) |
| L6-7 | whole paragraphs only (cl-2c) | a paragraph brings its formatting and list only when its end (the paragraph mark) is selected too, as Word is thought to do: the last item selected up to the end of its text, or one item's text alone, comes as text with the target paragraph's properties (labels `1. a.` then none in cl-2c); the first block pasted into the middle of a paragraph joins it. Is that Word's rule? |

### To check in real Word (Batch A final review)

| | question | what !Word does |
|---|---|---|
| S1 | a Strict document (saved by Word as "Strict Open XML Document") made a list, indented and bordered in !Word | the List Paragraph style's indent and a paragraph's indent are `w:ind w:start`, borders `w:start` / `w:end` sides (as the Strict schema has them); alignment is written `w:jc w:val="start"` / `"end"` (`JcName`). Does Word open it without a repair prompt, with the indents, borders and alignment shown? |
| N1 | a document whose numbering relationship names a part it cannot use (a missing target, or one that names another part) gets a new list | `NumWrite.ensurePart` adds a SECOND numbering relationship to a new `numbering.xml` (or `numberingN.xml`) and puts it BEFORE the unusable one, so the reader (and, we expect, Word) takes the first; the old relationship is kept. Does Word use the first numbering relationship and ignore the second, without a repair prompt? A hostile hand-off file for this (one relationship to a missing part, one to `word/styles.xml`) is still to be made: `handoff-newlists.mjs` would gain it |

## Known limitations and deferred items

Pasting between documents (L6)

* A Strict target can get attribute values that are believed to be Transitional-only (`w:w w:val="150"`, ST_OnOff
  `on` / `off`) from raw extras or copied list levels: `NumClean` respells left / right names only, and there is no
  Strict schema to check against (hand-off L6-6).
* Raw extras are read in the writer's scope (`w`, `r`, `mc`): a source whose WML prefix is not `w` (a default
  namespace, `ns0:`) loses its raw pPr / rPr extras across documents (nothing is corrupted). Other namespaces' extras
  (w14 effects...) are dropped. An `mc:AlternateContent` extra whose fallback holds a field that is also set (a `w:jc`
  beside a modelled jc) is left out, so it is not written twice (`ClipProps`).
* Only a direct `numPr` brings its list; a list given by the paragraph's style alone is not copied, and a
  `numStyleLink` is followed one step only.

Clipboard (deliverable 6b)

* Cmd-M is not mapped on a Mac (macOS minimises the window before the page sees it): Indent more is Ctrl-M only.
  The Format menu and toolbar still show Ctrl labels on a Mac (only the Edit menu shows Cmd).
* `tests/core/test-hostfs-app.mjs` failed once in a full `tests/core/index.mjs` run during Task 3 and passed alone and
  on the rerun: a flake unrelated to !Word (it runs its own server on a random port).

* Headings read from HTML carry direct bold and Word's heading size as well as the mapped Heading N style, so a later
  change to that style does not resize them.
* Pasting several blocks: the head paragraph takes the first block's properties only at offset 0, the last pasted
  paragraph always takes the target's (its paragraph mark), so the properties of the last block read from HTML are
  lost.
* An empty Word paragraph (`<p>&nbsp;</p>`) is pasted as a paragraph holding one space.
* Ordered lists are written as plain `<ol>` with no `start`, so another program numbers them from 1; levels are not
  nested.

Reader / writer

* Older sysvars code makes `SetMacro WimpLib$Path <WimpLib$Path>` (self-reference) fail with "Maximum call stack
  size exceeded"; the desktop survives it. Not changed here.

* Run `rsid` attributes are dropped (the only deliberate loss). Empty `w:pPr` and `w:rPr` are not written.
* Whitespace without `xml:space="preserve"` is trimmed as Word trims; the writer adds `xml:space` when a text starts or
  ends with white space.
* Level-`'p'` inlines inside formatted text lose their paragraph-level formatting when edited, and a `w:tab` read from
  a document comes back as `\t` text (editor sub-project).
* Header/footer references are not regrouped and `styles.extraStyles` are written after the other styles (valid, but not
  in their original place); `proofErr`, bookmarks and `lastRenderedPageBreak` are U+FFFC inlines (`LineLayout` draws
  nothing for them, a zero-width item; an editor must still step over them).
* The writer repairs only the package index of the package and main-part relationships; it does not add missing
  parts (real Word does not need `settings.xml` for footnotes: see "Verified in real Word").
* Mixed Strict/Transitional URIs in one document do not round-trip; UTF-16 prolog parts are written as UTF-8 with a
  correct declaration; zip directory entries are dropped; new Override part names are not percent-encoded.
* An edit replaces a raw same-named property element wholesale (untouched attributes of it are lost).
* Style edits are not written when `Style.raw` is present.
* `NsMap` leaves out the pairs with no resolvable Strict URI (drawingml compatibility, customXmlDataProps).
* Written-order check in the corpus test covers direct body paragraphs and runs, not those inside hyperlinks,
  `w:ins`, `w:sdt` or tables (table paragraphs are kept verbatim).

Desktop

* Circular imports hang `jsrun`; `import` text inside comments is resolved.
* The stub: long words clip or run over, the layout is redone for every `moved` event (50 ms per step
  at 5000 paragraphs), theme fonts are taken to be Calibri, the extent is clamped
  per paragraph (not per document); "Save as" and "Save a copy" ask Replace / Cancel before OK replaces an existing file,
  but a drag of the Save box icon replaces a file of the same name without asking, as any desktop Save box does
  (a locked file is refused).
* No `.doc` handler (the icon for &AE6 exists, nothing runs it).

Other

* The 7 MB of fonts (and the generated copy, the same git objects) add about 3.7 MiB to the packed repository and
  about 14 MB to a checkout's working tree.
* `ZipWrite` has no entry-count or 4 GB checks; the zip reader's duplicate-name test is case-sensitive (RISC OS
  is case-insensitive: check again when unpacking to a disc).
* Corpus: the 20-second guard is only after the fact; the `gh` CLI is required to fetch it.
