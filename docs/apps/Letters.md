# !Letters and WimpLib

Code: `tools/moreapps/` — `!Letters/` (the application, JSScript modules with no extension) and `!WimpLib/` (the
library of shared plain modules), put on the disc as `ADFS::HardDisc4.$.MoreApps.!Letters` by
`node tools/disc-moreapps.mjs` and as the system library `ADFS::HardDisc4.$.!Boot.Resources.!WimpLib` by
`node tools/disc-wimplib.mjs` (both run by `tools/build.mjs`, after `disc.mjs`: the library first). User guide:
`$.Docs.Letters` (`tools/docs/Letters`); the app's own `!Help` is `tools/moreapps/!Letters/!Help`, the library's
`tools/moreapps/!WimpLib/!Help`. Not part of RISC OS 3.71.

**Name.** The application was called `!Word` until October 2026 and is now `!Letters`: its directory, its task name
(`Letters`, from the directory: `src/core/jsrun.js`), `Letters$Dir`, the sprites `!letters` / `sm!letters`, its menus,
prompts, error boxes and Info box, its choices file `Choices:Letters` (was `Choices:Word`: Recent files and the
AutoFormat setting saved under the old name are not carried over) and the guide `$.Docs.Letters`.
`tools/disc-moreapps.mjs` removes an old `MoreApps.!Word` from the disc and the manifest. Internal module names
(`WordChoices`, `WordCount`, `WordTally`, `task.word`) and the test files (`tests/moreapps/word-*.mjs`) keep their
names. "Word" elsewhere in these documents means Microsoft Word.

The early steps of a word processor for Microsoft Word files. Today `!Letters` opens a `.docx` in a window (formatted
paragraphs in a page-width column, grey boxes for what it does not show), lets you select, **format** (deliverable 4:
Word's keys, a Format menu, a toolbar, a ruler with indent markers and zoom, below) and **type, delete and undo**
(deliverable 2: typing through the core's opt-in text-input caret, Enter, Shift-Enter, Tab, Backspace, Delete, the word
forms, Insert overwrite, Ctrl-Z/Ctrl-Y, IME composition, a `*` in the title while unsaved) and **saves** (deliverable
6a: *Save* writes the document back to its file and clears the star, *Save as* saves it under a new name that the
window takes, *Save a copy* writes a copy and changes nothing; an untitled document (a click on the icon bar icon,
*New*) offers a full path in its Save box; *Revert* reloads the file; closing a window with unsaved changes asks
Save / Discard / Cancel; Quit / PreQuit ask once, Discard / Cancel; *Recent* files in `Choices:Letters`). What is built to last is underneath: a document model with
operations and undo, a reader and a writer for `.docx` that keep everything they do not understand, and `WimpLib`.
Copy, cut and paste are in (deliverable 6b, `EditClip`), and Find / Replace (`Find`, `EditFind`, `Ui/FindBox`). Batch A added the everyday Insert and paragraph features
(spacing, new lists, page and section breaks, tab stops, borders and shading, symbols, change case, hyperlinks,
bookmarks, a format painter and a word count). Not there yet: layout and pagination (breaks are only marks), margins,
making styles and list definitions of your own, printing, headers/footers/footnotes, RTF/PDF export
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
  !Letters/          the application
    Fonts/        20 TrueType files (no extension) + Licences
  icon.mjs        the sprites of both (iconFiles, libIconFiles)
  package.json    the package 'wimplib', so Node resolves 'wimplib/<Name>'
  .cache/         git-ignored: font archives, the wml.xsd schema files
tools/disc-wimplib.mjs    builds $.!Boot.Resources.!WimpLib, --check
tools/disc-moreapps.mjs   builds $.MoreApps.!Letters, boot lines, --check
tools/moreapps-fonts.mjs  fetches the fonts (pinned, SHA-256 checked)
tools/moreapps-corpus.mjs fetches the sample corpus (optional)
tools/moreapps-xsdorder.mjs  prints the schema's child orders (Order's tables)
tests/moreapps/   everything below under Testing
```

All files on the disc are Latin-1 text, no tabs, **at most 72 columns**, extensionless, and import each other with
exact-name relative specifiers (`'./Ops'`), which Node 22.7+ also resolves natively (so the unit tests import the
disc files as they are). The pure modules never import `'riscos'`; only `!RunImage`, `AppWin`, `DocSave`, `CopySave`, `Replace`, `CloseDoc`, `Quit`, `RecentFiles`, `WordChoices`, `IconBar`, `EditView`, `EditMouse`, `EditInput`, `EditMenu`, `EditClip`, `ClipRoute`, `EditFind`, `FindSel`, `FindView`, `DocKeys`, `FormatMenu`, `InsertMenu`, `ListBox`, `ListMenu`, `ParaMenu`, `ParaBox`, `TabsBox`, `BorderBox`, `SymbolBind`, `LinkBox`, `BookmarkBox`, `PaintBind`, `PicDrag`, `PicDrop`, `PicLoad`, `PicInsertBox`, `PicBox`, `TblSplitBox`, `TblInsertBox`, `TblConvertBox`, `TblBox`, `TblMenu`, `TblDrag`, `WinMenu`, `ZoomBind` and `ToolbarBind` (and WimpLib's `Ui/*`) do (`RulerBind` is desktop-bound through `Ui/Ruler`, `WinPanes` through `ToolbarBind` and `RulerBind`, `AutoFormatOpt` through `WordChoices`, and `CountBox` through `Ui/Dialog` and `Boxes`, but none of them imports anything from `'riscos'` itself) (`EditPaint` is handed its canvas) (`PicCache` imports nothing from `'riscos'` but uses the browser's `createImageBitmap`, `Blob` and `WeakRef`, its `decode` injectable for Node tests; `PicPaint` is pure) (`Info`'s
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

Every application, `!Letters` included, imports the library by that one specifier (`import {readZip} from
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
| `Ui/SaveQuery` | the Save / Discard / Cancel box (desktop) | `saveQuery({task, title, message, buttons = ['Save', 'Discard', 'Cancel'], enter})` -> Promise of the pressed button's text (`enter`: the button Return gives, with the default border; default the first): a `task.createWindow` box (least code: no template, so the icons can be named `button:<Text>` and `message`; laid out from the button count, the message cut off past the screen's width), centred, with the caret; buttons left to right: the middle ones, the last, the first (at the right, `R6,3` default border; the others `R5,3`); Return = the `enter` button (the first by default), Escape / the close icon = last; one box per task: a question asked while one is open waits (a per-task promise chain) and opens when the one before is answered, each getting its own answer; `promise.win` is its box while open (null while waiting); deleted when it answers, answers the last button if its task deletes it or is gone before a waiting box opens. No `parent` option (the plan's API listed one; omitted: the box is not tied to a window). The core's `query()` has two buttons at most, hence this (no core change). Tested through !Letters: `word-close.mjs` |
| `Ui/FindBox` | a Find and Replace box (desktop) | `findBox(task, {title, onAction, onClose, onKey})` -> the task's one box (a `WeakMap` task -> box; asked again, the same box with the given handlers replacing its own; a new one after it was deleted, e.g. with its task): a `task.createWindow` box (no template: icons named `find`, `replace`, `matchCase`, `whole` (option icons `Soptoff,opton`, radio ESG 0), `message`, `button:Find next` (default, `R6,3`) / `Find previous` / `Replace` / `Replace all` / `Close`); `onAction('next' \| 'prev' \| 'replace' \| 'all')` from the buttons and Return; Escape, Close and the close icon hide it (`win.close()`, the fields kept) then `onClose()`; other keys go to `onKey(ev)` (true if used). API: `open({text, replace, x, y, focus = true})` (to the front; `focus: false` leaves the caret where it is; `text` put in Find; the caret in Find, or in Replace with `replace` when Find has text; first opening centred, later where it was), `close()`, `find`, `replace` (get/set; writable icons of `MAXLEN` 1000 characters: longer text is cut by the icon), `matchCase`, `whole` (get/set), `message` (the status line), `isOpen`, `win`, `delete()`. Ctrl-V in a field sets `ev.allowDefault` (as the core's TextArea and !Browse do), so the browser's paste reaches the core's writable-icon paste (its first line, character by character); Ctrl-C / Ctrl-X do nothing (writable icons have no selection: `docs/CHANGES_NEEDED.md`). It only asks: the program finds. Tested through !Letters: `word-find.mjs` |
| `CharSets` | named sets of characters for a symbol picker (pure, A5.3) | `SETS` (frozen `{id, name, chars}` in the popup's order: `latin1` Latin-1 (U+00A1..U+00FF without the no-break space and soft hyphen), `latinA` Latin Extended-A, `greek`, `cyrillic`, `punct` Punctuation (dashes, quotes, daggers, bullet, ellipsis, per mille, guillemets), `currency`, `letterlike` Letterlike and fractions, `arrows`, `maths`, `shapes` Geometric shapes), written as ranges of code points `[first, last]` so the file is plain ASCII. **Rule (relaxed in the A5.3 review):** every character is in Carlito, Liberation Sans AND Liberation Serif, all four styles (12 files; `charsets.test.mjs` reads their `cmap` tables with opentype.js). Caladea (Cambria's substitute) and Liberation Mono are NOT asked: Caladea has no Greek, Cyrillic or most geometric shapes (the test pins that), and a glyph missing in the page's font is drawn from another font by the browser, as Word falls back too. No duplicate within a set (a character may be in two sets). `setById(id)` (a `Map`, so `__proto__` is null), `setOf(ch, id?)` (the set holding the one-unit string ch, `id`'s first; null for anything else), `codeLabel(ch)` (`U+00E9`), `statusText(ch, id?)` (`U+00E9  Latin-1`, the grid's status line) |
| `Ui/CharGrid`, `Ui/CharGridPaint` | a window of characters to pick from (desktop; `CharGridPaint` pure drawing, A5.3) | `charGrid({task, title, sets = SETS, font, onInsert, onClose})` -> the task's one grid (a `WeakMap` task -> grid; asked again, the same grid with the given handlers replacing its own, `title` re-set; a new one after it was deleted). A `task.createWindow` of 554 x 440 (`CharGridPaint` W x H): icons `label`, `set` (the set field, `R2`, border, white) and `arrow` (`gright`), both open a `Menu` of the sets (ticked) at the field's lower left, `recentlabel`, `status` (`U+00E9  Latin-1`, or the caller's `message`), `button:Insert` (default `R6,3`, shaded while nothing is chosen) and `button:Close` (`R5,3`); the characters are NOT icons: the window's hiDPI canvas draws the Recently used row (`RECENT` 16 cells, session only, kept for the TASK in a `WeakMap`, so a grid made again keeps it) at `RY` and the set as `COLS` 16 columns by `ROWS` 8 shown rows of 32 x 30 px cells at `GY` (`CharGridPaint.paint`: white cell, grey outline, the chosen one white on `#2a4f9a`), 19 px text in `font` (default `"Carlito", "Liberation Sans", sans-serif`: a bundled family, because the desktop font Homerton lacks most symbols (`listmenu-glyphs.test.mjs`) and a canvas draws a whole set at once; repainted when `document.fonts.ready` resolves); a set of more than 8 rows has a scroll bar drawn at the right (thumb only, no Wimp scroll flags: the controls must not scroll away), moved by the wheel (`wheel` event, one row), a click above / below the middle of the bar (7 rows), Page Up / Down (8 rows) and by choosing a character that is not shown. Work button `clickdragdouble`: a click in the work area (not on an icon) takes the caret (`wimp.setCaret(win)`, for the keys) and chooses the character under it (`select`), a double-click chooses and inserts; keys while it has the caret: arrows (one character / one row), Home / End (`CharGridPaint.target(code, i, n, key)`: Shift-Up has Page Up's code, so the browser's key name decides), Page Up / Down, Return inserts, Escape hides; the close icon too (`onClose()` after). `insert()` calls `onInsert(ch)`: `false` says it could not be put in (not remembered); otherwise the character goes to the front of the recent row. API: `open({x, y, set})` (front, caret in the window, first time centred), `close()`, `delete()`, `isOpen`, `gone`, `win`, `set`, `pick(id)`, `selected`, `select(ch)`, `insert()`, `recent`, `top`, `scrollTo(row)`, `where(ch, inRecent)` (a cell's rectangle in work coordinates, null when not shown), `message(text)`. Tested through !Letters: `word-symbols.mjs` (real clicks) and `chargridpaint.test.mjs` |
| `Units` | lengths and points in a field (pure) | everything in twips (1440 an inch, 20 a point); `parseLength(text, {min, max})` -> twips or `null`: inches as a plain decimal alone or with `"` / `in`, or points with `pt` (`'0.5"'`, `'0.5'`, `'36 pt'` = 720), a minus sign allowed, spaces only around the parts, any case; no `cm`, exponent, other characters or text over 32 characters; whole twips (never -0), clamped to min..max (bad limits ignored; default `-LIMIT..LIMIT`, `LIMIT` 31680 = 22 inches); `formatLength(twips)` (`'0.5"'`, 2 decimals, trailing zeros dropped; `''` for none); `parsePoints(text, {min, max})` (points, bare or `pt`; default 0..`LIMIT`) and `formatPoints(twips)` (`'12 pt'`). `tests/moreapps/units.test.mjs` |
| `DialogLayout` | where a dialog's icons go (pure) | `KINDS` (`label text length number option radio popup colour button`), `controls(rows)` (rows: arrays of controls or one control `{kind, name, label?, text?, after?, w?, group?, choices?}`; copies with `row` and `index`; a `TypeError` for an unknown kind, a missing / bad / repeated name (letters, digits, `_`, `-`, starting with a letter: `__proto__` and `button:...` refused; a `label` may have none), a radio without a group, a group named as a control, more than 31 groups, choices not an array), `layout(rows, {buttons, measure, minW, maxW})` -> `{w, h, extent, boxes}` (`w` the window's width, at most `maxW` (the desktop passes the screen's width - 40); `extent` the width of everything, the work area): boxes `{name, kind, part: label\|field\|arrow\|after\|button, row, ci, x, y, w, h, text, rjustify}`, a label column as wide as the longest first label (`measure`, default 9 px a character; the desktop passes `textWidth`), fields 36 px high (options / radios / labels 28), default widths (text 240, length / number 88, colour 48, option / radio 32 + text, popup the longest choice + 16 (min 80) then a 22 px `gright` arrow, button max(96, text + 24)), rows stacked 8 px apart, a heading (a first `label` with no label) at the left edge, the buttons (unique texts) right-aligned at the bottom of what shows (`w - PAD`; at `PAD` when the row is wider than `w`), `PAD` 16 round the edge; nothing overlaps. `tests/moreapps/dialoglayout.test.mjs` |
| `DialogIcons` | a dialog's icon specs (pure) | `iconSpecs(boxes, list, {enter, groups})` -> specs for `task.createWindow`: a control's field named by its name (a nameless label `text:<i>`), `label:<name>`, `arrow:<name>`, `after:<name>`, `button:<text>` (`enter` `R6,3`, others `R5,3`); writable `text` (`R7` + the client's own `A` command, `maxLen` <= 1000, default 256), `length` (`R7;A-0-9. "inptINPT`, 16), `number` (`R7;A0-9.` + the unit's letters, 16; `-` first when `min` < 0); options `Soptoff,opton` ESG 0, radios `Sradiooff,radioon` with their group's ESG (`esgOf(list)`: 1..31 in order); popup display `R2` click; colour `R5`; row buttons `R5,3`. Tested in `dialoglayout.test.mjs` |
| `DialogValues` | what a dialog's controls hold (pure, over icons it is handed) | `readField(c, text)` (empty -> `undefined`: a mixed value left as it is; not a value -> `null`; text without control characters; lengths through `Units` (`unit: 'pt'` points); numbers through `NumberField.parseNumber` with a leading minus sign read here, only when `min` < 0 (else `null`), then clamped), `showField(c, v)`, `choiceText(c, id)`, `WRITE`; `store({list, groups, icon, repaint})` -> `{get, set, values, invalid, touched, colour}` (option values kept so a mixed option reads `undefined` until clicked; radios by name (boolean) and by group (the chosen radio's `value` or name)). Tested in `dialoglayout.test.mjs` |
| `Ui/Dialog` | a dialog box built from rows of controls (desktop) | `dialog({task, key, title, rows, buttons = ['Cancel', 'OK'], enter, help, minW})` -> api, unopened: a `task.createWindow` box (no template) from `DialogLayout` / `DialogIcons` (`textWidth` measures), its width at most the screen's - 40 (`maxW`; the extent the whole box, the buttons kept at the right of what shows); controls may add `help`, `value` (an option's default is false), text `maxLen` / `validation`, length `unit: 'pt'` / `min` / `max`, number `min` / `max` / `step` / `unit` / `decimals`, popup `choices [{id, text}]`, colour `allowAuto`, radio `value`. Return presses `enter` (default the last button; shaded: nothing), Escape and the close icon `Cancel` if there is one, **even when it is shaded**, else the last (no buttons: the box is deleted): every box should have a Cancel; Tab / arrows are the core's `focusNext` (shaded fields skipped); Ctrl-V in a field sets `allowDefault` (as `Ui/FindBox`). A popup's arrow or display field opens a `Menu` at the arrow's right (the choice ticked); a colour button opens `Ui/ColourPopup` there; the swatch is drawn on a hiDPI canvas behind the (unfilled) icon. API: `get`, `set` (no change event), `values()`, `invalid()`, `shade(name, on)` (all of a control's icons, or a bottom button by its text; the caret leaves a field shaded under it), `choices(name, list)` (A4.3: a popup's choices replaced, its value kept and its text shown again; the Tabs box's list of stops), `focus(name)`, `on('button' \| 'change' \| 'close', fn)` (a bottom button deletes the box after its handlers unless one returned `false`; a row's `button` never closes it; `close` when it closes or goes), `open({x, y})` (to the front, caret in the first writable field or the window; first time centred), `close()` (hidden, kept), `delete()`, `win`, `isOpen`, `gone`. One box per `key` per task (a `WeakMap` task -> `Map`): asked again while it exists, the same api, brought to the front. **Keys are per task, not per window**: a box about one document must carry that document in its key (e.g. `'para:' + dw.docKey`) and its program must `delete()` it when the document closes (e.g. on the document window's `deleted`); boxes go with their task. Tested through !Letters' hook `task.word.dialog(spec)`: `word-dialog.mjs` (every kind by icon name, Tab / Down / Up / Shift-Tab, typing, a real popup and swatch pick, option, exclusive radios, Return / Escape / close icon / Cancel, `false` keeps it, shading, mixed values, two keys, 30 open / close cycles: windows, icons, Wimp and task listeners, menus and DOM back to the start; `set` reports no change; `close()` then `open()` keeps the box and its place; Escape / the close icon with Cancel shaded; a box wider than the screen; a per-document key deleted with its document leaves nothing; the task quitting deletes its box) |
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
5. Use it from any disc program: `import {x} from 'wimplib/<Name>';` (and from `!Letters`' sources the same way: Node
   resolves it through `package.json`). `src/core/jsrun.js` finds it through `WimpLib$Path`, then `WimpLib$Dir`
   (above). The prefix matches in any case (`WimpLib/Zip`); every segment after it must match
   `/^[A-Za-z0-9_][A-Za-z0-9_-]*$/`, so `..`, `^`, `$`, `@`, `<Var>`, `:`, dots (`Zip.js`), wildcards, spaces and
   empty segments (`wimplib//Zip`, `wimplib/Zip/`) are refused with "Can't find '<spec>' (a WimpLib module name is
   letters, digits, _ and -, with / between directories)": the import cannot leave the directories searched.

Imports are found by a regular expression over the source, so an `import ... from '...'` inside a comment is resolved
too (pre-existing in `jsrun.js`); circular imports hang the loader. Keep module graphs acyclic.

## The application modules (`!Letters/`)

Model and operations

| module | what |
|---|---|
| `Model` | factories and the data model (header comment): `newPara(text, opts)`, `newSection()`, `emptyDoc()`, `nextId()`, `reserveIds(doc)` (past every paragraph and table id at every depth, through `Walk.forEachId`), `clone`, `props`; tables (Batch C): `newCell(blocks, tcPr)`, `newRow(cells, trPr)`, `newTable({grid, rows, tblPr})` (a fresh id from `nextId`; blocks, cells and rows are shared, not copied; each checked by `TblCheck`, RangeError); re-exports `OBJ deepEqual sameFmt checkPara checkBlock normRuns` |
| `ModelCheck` | the invariants: `checkPara`, `checkBlock(b, around = 0)` (a Para, an Opaque, or a Table: `'tbl'` goes to `TblCheck.checkTable(b, {block, props: checkProps}, around + 1)`; `around` is the number of tables around the block's position, and a paragraph with `around > 0` also passes `TblCheck.checkCellPara`), `checkInlines`, `checkProps`, `checkPos`, `checkContent`, `normRuns`, `deepEqual`, `fail` (throws `RangeError`) |
| `TblCheck` | Batch C, pure, imports nothing (R8): the Table invariants `checkTable(t, {block, props}, depth)`, `checkRow`, `checkCell`, `checkCellPara(p)` (at least one row / cell / block; `gridSpan` integer 1..63; `trPr.gridBefore` / `gridAfter` integers 0..63; a row at most 63 grid columns wide (`gridBefore` + its cells' `gridSpan` + `gridAfter`; it may be wider than the grid, D2); `vMerge` `restart` / `continue` / absent; grid 1..63 integers 0..31680; `attrs` / `gridAttrs` `[string, string]` pairs; `lead` / `tail` element nodes; `tblPrEx` a node or null; depth <= 8; no `sectPr` element in a cell paragraph's `pPr.extra`; `'p'` and `'tbl'` ids unique within the table; a cell's last block not a table (C3 fix wave, C3b I2: `endsCell(b)`, a typed table or a kept `w:tbl`; `checkTail(b)` throws; Word reads a `w:tc` that does not end with a `w:p` as unreadable; a cell ending with another kept block, a content control, is as the file had it: 52 such cells in the corpus); ragged rows valid) and the caps, defined only here: `MAX_COLS` 63, `MAX_DEPTH` 8, `MAX_TW` 31680, `MAX_ROWS` 32767 (commands only: files with more rows still read) |
| `Path` | Batch C, pure: block paths `[s, i]` or `[s, i, r, c, j, ...]` (length 2 + 3k, k <= 8): `isPath`, `depthOf`, `isTop`, `sib(at, d)`, `tableOf` (RangeError at top level), `cellOf` (`{table, r, c}` or null), `topOf`, `samePath`, `cmpPath` (flow order: a table before its contents) |
| `Walk`, `WalkCursor` | Batch C, pure (D7): the one walk of the model for every scanner. `blocks(doc)` (entries `{b, at, depth, cell}` in flow order: a table, then its cells' blocks row by row, cell by cell; `depth` = tables around the block, `cell` `{table, r, c}` or null), `forEachBlock(doc, fn)` / `forEachIn(blocks, at0, fn)` (no entry objects; `fn` returning false stops), `walkBlocks(blocks, at0)` (clipboard blocks without ids), `loose(table)` (row/cell lead and tail marks and the table's tail, in document order), `ids(doc)`, `blockIds(blocks)`, `forEachId(doc, fn)`, `scan(doc, fn)` (C1.6: `fn(b)` for every block at every depth in flow order, without paths or stop: a plain loop over each section's blocks and the cursor only inside tables, so whole-document scans cost what they did before tables: 0.23 ms for 50,000 paragraphs against 1.1 ms for `forEachBlock`), `at(doc, path)` (never throws; R11's `outerEdge` was removed in C3.5: places in typed tables are real), `mapBlocks(blocks, fn, {opaque, table}?)` (copies only along changed paths; the same array when nothing changed; C1.7: `opaque(b)` may give a block or an array of blocks for each Opaque block, `table(t)` maps each table after its cells, innermost first: the clipboard's cleaning and fresh ids), `flatText(table, nodeText)` (R10: a line per row, cells joined by tabs, a cell's paragraphs by spaces). An explicit-stack walk: no recursion, no generator in `forEachBlock`. `WalkCursor` (C1.6 split): the `Cursor` engine and the shape tests `isObj`, `isTbl`, `arr`, used only by `Walk` |
| `Ops` | `apply(doc, op) -> inverse`, `applyOwn`; positions are paths (`Path`, Batch C); insertBlock, removeBlock, restoreBlock (a paragraph keeping the id of the one it replaces skips the document-wide id scan, so undoing a setProps of 50,000 paragraphs is linear; a table keeping its id is checked by `TblCheck` and only the ids it holds that the old one did not are looked for in the document), compound; the KINDS of `OpsText`, `OpsProps`, `OpsBlocks`, `OpsDoc`, `OpsSect`; in a cell `removeBlock`, `removeBlocks`, `insertBlock` and `insertBlocks` refuse (RangeError, nothing changed) to leave the cell ending with a table (`TblCheck.checkTail`, C3 fix wave), so a command must put a cell's carrier paragraph in BEFORE it removes what follows a table (`RangeTbl`); `apply` keeps a restoreBlock's TABLE snapshot by reference (D4: the new table shares its unchanged rows, cells and paragraphs), as it keeps a setDocPart's value |
| `OpsDoc` | setDocPart `{key, value}`: replaces `doc.numbering`, `doc.rels`, `doc.styles`, `doc.rawSettings` (key `settings`), `doc.parts` (key `parts`, Batch B plan R5) or `meta.numberingPart` (`meta` replaced by a copy; value `undefined` removes the key) with a NEW value; the inverse holds the old one. `parts`: a NEW Map differing from `doc.parts` only by names added or removed, every name in both holding the SAME bytes object; an added name well formed, no other part's (as below) and not `meta.numberingPart` (case ignored), given once, its value a `Uint8Array`; so the inverse (the old Map) passes the same check and undo gives back the very Map object. **Values are immutable by contract**: `Ops.apply` keeps a setDocPart's value by reference (no `structuredClone`, also inside a compound), so a value given, or returned in an inverse, must never be changed afterwards (that would change the Doc and its history; not supported). Refused: any other key (`__proto__`, `meta`...); a value of the wrong shape (numbering `null` or `{raw: node, nums: Map}`, rels an array of Rels with unique ids, a style table, a node, a relative part name without `..`); a part name another part has (main, styles, settings, `[Content_Types].xml`, any `.rels`, a `doc.parts` entry, an Override of another content type than numbering; case ignored); settings other than `null` in a document without `meta.settingsPart` (the writer writes settings only to that part, so they would be lost silently; no part name is invented); `isNode`; `partFree(doc, name)` (true when setDocPart would take `name` as the numbering part: `NumWrite` picks names with it); `newPartFree(doc, name)` (true when `parts` would take `name` as a new part: `InsertPicture` picks media names with it) |
| `OpsSect` | splitSection `{at: [s, i], props, raw}` (blocks `0..i` keep section `s` with the NEW props/raw: the section before the break, its sectPr written in paragraph `i`; blocks `i+1..` become section `s+1` with the old ones; refused at a kept block, at the last block or out of range; props checked as the reader's: `extra` array, only the `SECT_FIELDS`; raw a `w:sectPr` node or null) and its inverse mergeSection `{at: s, keep?}` (s and s+1 joined with s+1's very props/raw; `keep`, when given, must equal them; refused for the last section, when s does not end with a paragraph or s+1 is empty); setSection `{at: s, props, raw}` (section `s` takes new props/raw, checked as a split's, raw `undefined`: no raw key; inverse: the old ones; the section break commands give a section its `type` with it); other sections and every block keep their identity |
| `DocParts` | pure helpers that build new parts for setDocPart: `freshRelId(rels)` (also used by `DocxWrite`), `addRel(rels, {kind, target, external, strict}) -> {rels, id}` (a NEW array, old Rel objects shared; type `relType(kind, strict)`: pass `meta.conformance === 'strict'` so a Strict document keeps Strict types; kind letters and digits, target 1..2048 characters without controls), `withStyle(styles, style, {replace}) -> styles` (a new table and Map, the style normalised by `Styles.addStyle`, the others shared and unchanged; the writer writes old styles from `raw` byte for byte), `findStyle(styles, id, name)` (by id, else by name ignoring case, else null), `hyperlinkStyle(styles) -> {id, styles} | null` (A6.1: the table's own Hyperlink character style, by id or name; else Word's definition added to a NEW table by `withStyle`: `character`, colour `0563C1`, `u single`, `basedOn` the default character style, `uiPriority 99`, `unhideWhenUsed`; null without a table or when its Hyperlink is not a character style) |
| `OpsBlocks` | removeBlocks `{at, count}` and its inverse insertBlocks `{at, blocks}`: many blocks of one container (a section or a cell) in one op, linear time (ids at every depth checked in one scan, `OpsUtil.checkIds`) |
| `OpsText` | replaceText, spliceText, splitBlock, mergeBlock |
| `OpsProps` | setProps, `mergeProps(base, patch)` |
| `OpsUtil` | re-exports `locate own paraAt sectionAt` (`OpsPath`); `checkIds(doc, add, old)` (the one id rule for blocks put in: no `'p'` / `'tbl'` id inside `add`, at any depth, used twice among them or in the document outside `old`; one `Walk.forEachId` scan); `cut join checkRange` |
| `OpsPath` | Batch C, pure: `locate(doc, path, end) -> {s, i, blocks, at, depth, nested}` (read only; RangeError `bad position`, `no section`, `not a table`, `no row r`, `no cell c`, `no block j`), `own(doc, path)` (D5: copies each table on the path as `{...t, rows}`, its row `{...row, cells}` and cell `{...cell, blocks}`, returns the new mutable container; the section's own array at top level; only after every check), `paraAt`, `sectionAt` |
| `DocEvents` | tiny emitter; one failing listener does not stop the others |
| `Document` | `new Document(doc)`: `apply(op, {coalesce})`, `undo()`, `redo()`, `group(fn, {coalesce})`, `atomic(fn, opts)` (a group that, when fn throws, undoes the ops it applied, records nothing and rethrows; the editing commands run in it), `groupStart/End`, `on('change', fn)`, `canUndo`, `canRedo`, `breakCoalesce()`, `markSaved()`, `stateId` (the current state's serial), `markSavedAt(id)` (state `id` is the saved one: a save that took time; edits made meanwhile stay dirty, undo back to it is clean; no `change` event), `dirty`, `undoDepth`, `maxSteps` (1000), `clearHistory()`, `onListenerError` (details under Operations and undo) |
| `DocHistory` | the undo and redo stacks behind `Document`: serial numbers per state (so `dirty` is "current serial != saved serial"), coalescing by key, `MAX_MERGE` = 128 ops per merged step, the `maxSteps` trim (O(1000) `shift`), `markSaved` (also ends the coalescing run, so the saved state stays reachable by undo), `markSavedAt(id)` (`markSaved` if `id` is current, else only the marker moves). Pure bookkeeping, no access to the Doc |
| `Styles` | `newStyleTable()`, `styleOf`, `resolvePara(styles, para, levelInd?)` (`levelInd`: the list level's indent, a layer between the style chain and the direct `pPr`: style < numbering level < direct, Word's order, attribute by attribute (a level giving only `left` keeps the style's hanging/firstLine; only `hanging` keeps its left); ind `firstLine`/`hanging` are one property: a layer giving one drops the other from lower layers, as Word does; both in one layer: hanging wins), `resolveRun`, `paraLayers(styles, para)` / `runLayers(styles, para, run)` (the layer objects themselves, lowest first: defaults, the paragraph style chain, (for a run) the character style chain, the direct properties; for rules that are not `mergeInto`'s, such as whole borders and shading, `BorderResolve`), `addStyle`, `setDefault`, `ensureBuiltins` |
| `StylesBuiltin`, `StylesMerge` | the built-in styles of a new document (`builtinStyle(id, {strict}?)`: a new copy of one, for `ListMake`'s List Paragraph; C4.4: also Word's table styles Normal Table (`TableNormal`, default, `uiPriority` 99, hidden) and Table Grid (`TableGrid`, based on it, `uiPriority` 39, `pPr` spacing after 0 line 240 auto, six single `sz` 4 `auto` borders), the `w:tblPr` in `extra`, `start`/`end` sides for a Strict document; never part of `ensureBuiltins`); property merging without aliasing |
| `StylesNum` | the numbering of a paragraph's pPr layers: `numberingOf(layers)` -> `{numId, ilvl, ilvlGiven}` or `null` (`ilvlGiven` false: no layer gave an ilvl, `ilvl` 0); `layerNumPr(pPr)` also reads a `w:numPr` kept raw in `extra` (tracked change inside: `w:numId`/`w:ilvl` taken, other children ignored). `Styles.paraNumPr(styles, para)` (styles may be null), `Styles.paraStyleId` |
| `ListNumbers`, `ListLevel`, `NumFormat`, `BulletGlyph` | list labels (pure, display only). `ListNumbers.labels(doc)` -> `Map<paraId, {text, level, numId, indent?: {left?, hanging?, firstLine?}, suff, jc, rPr, bullet, fmt}>` (`indent` carries only the attributes the level's `w:ind` gives; hanging wins over firstLine) in one pass over every paragraph in flow order at every depth (`Walk.scan`, C1.6: a typed table's cell paragraphs count and restart as Word numbers them, so a list goes on through cells and after the table; kept blocks, Opaque tables among them, neither count nor restart; 100k paragraphs well under a second): counters per abstractNum (per numId when it names none) continued through the document, so numIds over one abstractNum continue one count (Word); a `startOverride` sets its level's counter the first time that level is counted under that numId (once per numId and level), otherwise a first use or restart gives the level's `start` else 0; a paragraph at ilvl k restarts deeper counters per `lvlRestart` (absent: any higher level; 0 never; n: ilvl below n); `%n` in `lvlText` is counter n-1 in level n-1's format (decimal for `isLgl`; unused counters show their start; other `%` literal), numbering from the style when the paragraph has none, style numbering with no ilvl takes the level whose `pStyle` is the paragraph's style (else 0), missing levels use the nearest defined level below (`ListLevel.levelsIn`), numId 0 or unknown: no label; `jc` from `lvlJc` (default left). `lvlText` is read to 255 characters and `numFmt` to 64 (`NumLevel`), and `ListLevel`'s `parse` reads at most 255 template characters (`MAX_TEMPLATE`) once per numId and level (`labelMaker` keeps the parsed template), so hostile templates cost little. Not yet checked in real Word (hand-off): numIds sharing an abstractNum continuing one count and the one-shot `startOverride`; an unused upper level shown as its start in a deeper label (`%1.%2.` with no level-0 paragraph yet: `1.1.`); missing levels taking the nearest level below; the bullet glyph table; the level `w:tabs` is not read (a tab suffix uses the indents only). `NumFormat.formatNumber(n, numFmt)` (decimal, decimalZero, lower/upperLetter `aa` `bb` Word style, lower/upperRoman to 3999 else decimal, ordinal, bullet/none ''; unknown: decimal), `LABEL_CAP` 40, `capLabel`. `BulletGlyph.glyphFor(ch, font)`, `bulletText`: Symbol/Wingdings/private-use bullets as Unicode shapes (U+F0B7 -> U+2022, U+F0A7 -> U+25AA, 'o' in any font -> U+25E6 (the owner's level-1 bullet; it was U+25CB), unknown PUA -> U+2022) |
| `ListGallery` | the definitions a new list gets (pure, frozen): `BULLETS` (disc, circle, square, diamond, arrow, check) and `NUMBERS` (`1.` `a.` `i.`; `1)` `a)` `i)`; `I.` `A.` `1.`; `A.` `a.` `i.`; `a)` `i)` `1)`; `i.` `a.` `1.`), and `HIDDEN` (not in the galleries, for AutoFormat as you type: `dash`, an en dash U+2013 in Calibri at level 0 with Word's cycle below; `a.` (`a.` `i.` `1.`); `(1)` (`(1)` `(a)` `(i)`)); `ENTRIES` all of them in that order; each `{id, kind, name, levels}` with 9 Levels in `NumLevel`'s shape: start 1, `ind left` 720 x (k+1), `hanging` 360, `suff` tab, roman levels `lvlJc right`, bullets with `rFonts`: the entry's glyph at level 0 (U+F0B7 Symbol, `o` Courier New, U+F0A7 / U+F076 / U+F0D8 / U+F0FC Wingdings) and Word's cycle (U+F0B7 Symbol, `o` Courier New, U+F0A7 Wingdings) at level k >= 1, k mod 3, for every entry as Word does; `entryOf(id)`, `kindOf(level)` (`'bullet'` for numFmt bullet, else `'number'`), `matches(num, id)` (the Num's level 0, override first: the same bullet glyph through `BulletGlyph`, or the same numFmt and lvlText and not legal) |
| `NumWrite`, `NumScan` | numbering definitions written (pure; values for `setDocPart`, nothing changed in place). `ensurePart(doc) -> {numbering, rels, numberingPart}`: the doc's own objects when it has a numbering part; else a new root (`w:numbering` with `xmlns:w` only; Transitional in memory, Strict on write) and a free part name (an existing numbering relationship's target when that part is free, else `numbering.xml` beside the main part or the first free `numberingN.xml`, N from 2, by `OpsDoc.partFree`) with a NEW rels array from `DocParts.addRel` (Strict type for a Strict document; put before an unusable numbering relationship so the reader takes it); the content type is the writer's; RangeError without `meta.mainPart`. `addList(numbering, entry, {usedNumIds, rand, strict, start}) -> {numbering, numId, abstractNumId}` (`start`: level 0's `w:start`, 0..2^31 - 1, else RangeError: a list typed as `3. `; `strict`: pass `meta.conformance === 'strict'`; a Strict document gets Strict attribute names and values in the levels, `w:ind w:start` and `lvlJc start`/`end`, else `w:left` and `left`/`right`; `NumLevel` reads both alike. Known gap, not this module's: the paragraph `w:ind` writer (`WriteProps`) still writes `w:left`/`w:right` in Strict documents): a NEW root holding the same old child nodes plus a `w:abstractNum` (`w:nsid` 8 hex digits no abstract of the part has, `hybridMultilevel`, 9 `w:lvl`: start, numFmt, lvlText, lvlJc, pPr ind, rPr rFonts for bullets) after the last abstract / `w:numPicBullet` / `mc:AlternateContent` holding one (never after the first `w:num` or `w:numIdMacAtCleanup`) and a `w:num` after the last num, before `w:numIdMacAtCleanup`; ids one more than the largest numeric id (abstracts: also those `w:num`s name, so a num naming a missing abstract never starts showing ours; nums: also `usedNumIds`), RangeError past 2^31 - 1; new nodes declare `xmlns:w` when the root binds `w` elsewhere; `nums` a new Map with the old Num objects and the new one from `readNumbering`. `addRestart(numbering, numId, ilvl, start, {usedNumIds}) -> {numbering, numId}`: a new `w:num` on numId's abstract with `w:lvlOverride`/`w:startOverride` (Restart at 1, Set value); of the source `w:num`'s other `w:lvlOverride` nodes (every level but ilvl) only level replacements (holding a `w:lvl`) are kept, by identity (a new node without its `w:startOverride` when it has one: a restart never restarts another level), all in level order, with the source's xmlns declarations. `usedNumIds`: integers only (others ignored). `NumScan.scan(root, used)`: largest ids, nsids, insertion places (`absAt`, `numAt`; `numNode`, `overridesOf`; `mc:AlternateContent` children count at its place); 10,000 abstracts in well under 50 ms |
| `ListMake`, `ListRestart`, `ListUsed` | the commands that make lists, pure (`FormatApply` ids `bullets`, `numbering`, `listRestart`, `listContinue`). `toggleList(d, typing, sel, {kind: 'bullet' \| 'number', entry?}, pending?) -> {sel, pending}` (entry a `ListGallery` id of that kind, else RangeError) over the paragraphs the selection formats (kept blocks skipped): **off** when every one is in a list of that kind (`ListRestart.numKind`: the kind of the list's level 0, as `matches` looks at level 0, so a bullet sublevel of a numbered list is in a numbered list: Numbering takes it out, Bullets gives it a bullet list of its own at its level) and, with an entry, one the entry `matches`: the direct `numPr` removed, or `numId 0` when the style gives the list; a List Paragraph style back to the default; **on** otherwise (entry default `disc` / `1.`): the nearest list paragraph before the first one in the same section, in flow order (C3.5: cells' paragraphs too, `ListRestart.listBefore`; any gap of non-list paragraphs and kept blocks: the owner's ruling, Word's behaviour; paragraphs numbered by their style alone skipped) is continued when its level 0 matches the entry, else the first selected paragraph in a list the entry matches, else an unused `w:num` of exactly that definition (`ListUsed.reusable(doc, entry, strict, used)`: its levels equal to what `addList` writes for the entry, no `lvlOverride`, no style link, `hybridMultilevel`, named nowhere, and no num in use on its abstract, since numIds over one abstract share a count; so Bullets off and on adds no definition: final review), else a new list (`NumWrite.ensurePart` + `addList` with `strict` = `meta.conformance === 'strict'` and `ListUsed.usedNumIds`: numIds named by paragraphs at every depth (`Walk.scan`, C1.6: typed tables' cell paragraphs too), by `w:numId` anywhere in kept blocks, in typed tables' loose marks and in paragraphs' inline raw nodes (text boxes), by styles (and anywhere in a style's raw node), by `w:numId` in paragraphs' raw `pPr` and runs' raw `rPr` elements (an old `w:numPr` in a `w:pPrChange`: final review), and by `w:numId` in the text of every other XML part of the package (headers, footers, footnotes, endnotes, comments; read once per part data)); each paragraph gets direct `numPr {numId, ilvl}` (its level kept when in a list already, else 0; a style-numbered heading gets direct `numPr`, its style kept); a paragraph with the default paragraph style gets List Paragraph (found by id or name; the built-in one added with `DocParts.withStyle` when missing, based on `styles.defaults.paragraph` (Standard in a German Word's files; none without one) rather than the built-in's Normal). Ops: `setDocPart` numbering, numberingPart, rels, styles (only what differs), then one `setProps` per changed paragraph, all in one `runOps` (`typing.command` + `d.atomic`): one undo step restoring `doc.numbering`, `doc.rels`, `doc.styles` and `meta` exactly; none when nothing changes. `restart(d, typing, sel, start = 1, pending?)` (`ListRestart`; start 0..2^31 - 1, else RangeError): the first paragraph the selection formats, when in a list, gets a new `w:num` on its abstract with a `startOverride` for its level (`NumWrite.addRestart`, which keeps only the source num's level replacements, never another level's `startOverride`: restarting a sublevel never restarts its parent), and it and every LATER paragraph of the old numId (any section; in flow order, cells' too since C3.5) move to it; nothing at all (no undo step, no new `w:num`) when no label would change (`ListNumbers.labels` before and after, compared by text: Restart at 1 on a list's first item, or pressed again; final review). `continueList(d, typing, sel, pending?)`: the RUN of that paragraph's numId (its paragraphs around it with only non-list paragraphs and kept blocks between, up to a paragraph of another list on either side) takes the numId of the nearest list paragraph before the run with another numId and the same kind (style-only ones skipped); nothing there: nothing changes, no undo step. `listKindOf(doc, para)` (`'bullet'`/`'number'`/`null`: `numKind` of its list), `listEntryOf(doc, para)` (the gallery id its list matches, cached per Num, or `null`), `listFacts` (both), `listStyle(doc)` / `plainStyle(doc, para)` (the List Paragraph style to give, and whether a paragraph has the default style: shared with `AutoList`). Hostile numbering parts: ids NumWrite cannot make are refused with a RangeError before anything is applied. 100,000 paragraphs made a list in about 1.4 s (Node), undo well under that |
| `ListMenu`, `ListBox` | the list menus and box (desktop). `bulletMenu(view)`: None (shaded outside lists; `listOff`), then the six `ListGallery.BULLETS` each as a hint glyph (`BulletGlyph.MENU_GLYPHS`: covered look-alikes, because Homerton has only U+2022 of the real shapes; menus only) and name, ticked when `query().listKind === 'bullet' && listEntry === id`; choosing runs `view.format('bullets', id)` (on the same entry: off). `numberMenu(view)`: None, then the six `NUMBERS` as three samples (`NumFormat.formatNumber` of 1, 2, 3 in the level 0 format and text: `1. 2. 3.`, `I. II. III.`, `a) b) c)`), `view.format('numbering', id)`. `listItems(view, {value}?)` / `listMenu`: Bullets > (key `Keymap.labelFor('bullets')`, Ctrl+Shift+L), Numbering >, Restart at 1 (`listRestart` 1), Continue numbering (`listContinue`), Set numbering value... (`value()` or shaded), Demote (Tab), Promote (Shift+Tab), Remove from list; all but the two galleries shaded outside lists (`inList(view)`: `FormatList.hasList`, cached per `selRev`), everything with no selection. `ListBox.listBox(dw)`: Set numbering value, a `Ui/Dialog` (key `listvalue:<docKey>`, kept in `dw.boxes` as `listvalue`, deleted with the document; Cancel always): radios `modeNew` / `modeCont` (group `mode`: Start new list, Continue from previous list) and a number field `value` (field max far above the limit so it never clamps; shaded for Continue; OK refuses anything but a whole number 0 to 32767, Word's Start at limit: beep, box kept, nothing written); OK = `view.format('listRestart', n)` or `'listContinue'`, one undo step. |
| `AutoList`, `ListMarker`, `AutoFormatOpt`, `WordChoices` | AutoFormat lists as you type (Batch A, A2.4). `ListMarker` (pure; re-exported by `AutoList`): `markerOf(text) -> {kind, entry, start} \| null` (the text before the space; at most `MAX_MARKER` 8 characters): `*` disc, `-` dash, `>` arrow; `N.` `N)` `(N)` with N 0..`MAX_START` 32767 and no leading zero (entries `1.` `1)` `(1)`); one letter `a.` `a)` `A.` (a = 1 .. z = 26; `A)` is none); roman with `.` only: `i` / `I` alone is roman 1 (any other single letter is a letter: `v.` 22, `M.` 13), two or more letters only when `NumFormat` writes the value back exactly and it is at most 39 (`iv` yes, `iiii`, `ic`, `xl` no); `i)`, mixed case, `1.5`, `a.b`, `e.g.`, `10000000000.` are none; `readings(text)`: both readings of one letter that can be roman (`i v x l c d m`, either case: with `.` roman and letter, lower case with `)` the letter). `AutoList` (pure): one such letter is read both ways first, and the reading that continues the nearer earlier list of its format (the label it would get there is the letter typed) wins (`v.` after `i.`..`iv.` is roman 5, `i.` after `a.`..`h.` the letter i, `i)` after `a)`..`h)`); else `markerOf`'s rule. `afterSpace(d, typing, sel, {typed = ' '}) -> sel \| undefined`: the caret just after a typed space (or `'\t'`) whose text before is exactly a marker (after nothing but `INVISIBLE` marks, at most 16: bookmarks such as Word's `_GoBack`, proofing marks, comment and permission ranges, `lastRenderedPageBreak`; a link, field, drawing, tab or any other inline refuses; the marks stay), in a paragraph with no numbering of its own or from its style (no list, no style-numbered heading, no `numId 0`, no dangling numId: any layer's `numPr`, raw too): one `runOps` step (`typing.command` + `d.atomic`) of `replaceText` removing the marker and the character FIRST (so undo's last leaf op is that text put back and `EditApply.stepEnd` puts the caret after the space), then the numbering part ops and `setProps` `numPr {numId, ilvl 0}` (+ List Paragraph for a default-style paragraph, `ListMake.listStyle`). The list: the nearest earlier list paragraph of the section in flow order (C3.5: cells' paragraphs too; AutoFormat works in a cell) whose list `matches` the entry (other formats and style-only paragraphs passed over) is continued for a bullet, and for a number when the label the paragraph would get there (`ListNumbers.labels` of a copy of the doc with that `numPr`) is the marker typed; else `NumWrite.addList(entry, {start})`. A refused numbering part (RangeError) or a document with no package data: `undefined`, nothing changed. `AutoFormatOpt` (desktop through `WordChoices`): `autoListOn(app)` (false only when the choice is `false`), `setAutoList(app, on)`, `autoListItem(app)` (Format > AutoFormat lists, ticked while on). `WordChoices` (desktop): Choices:Letters as one object shared by `RecentFiles` (`recent`) and `AutoFormatOpt` (`autoList`): `loadChoices(app)` (`app.choices`, `app.choicesReady`, one read per app; missing, corrupt or non-object: `{}`), `choiceOf(app, key)` (own keys only), `setChoice(app, key, value)` (after the read, synchronously when it is done: the file read again with `vfs.readFileSync` when it is in memory, else the cache, the key set, written whole: so neither overwrites the other's key and unknown keys are kept; a failed write is a `console.warn`), `mergeChoice` (pure). Wiring: `DocKeys.attachKeys` sets `view.autoList = () => autoListOn(app)`; `EditInput.inputView` calls `afterSpace` after a single `' '` typed at a caret when `view.autoList()`, not in overwrite mode, not an input method's commit (`{composed}`: a `textinput` straight after `compositionend` in the same task, and `DocSave.commitComposition`'s typing of the composing text at a Save) and nothing composing; `EditRun` passes `{autoList}` to `EditApply.run`, which calls it after `tab` (typed `'\t'`); paste, Find / Replace, undo / redo never reach it. `WinMenu` passes `autoListItem(dw.app)` to `FormatMenu` (its last item) |
| `ParaInd`, `FormatList`, `EditList` | editing lists, pure. `ParaInd`: `listOf(doc, para)` -> `{numId, ilvl, fromStyle}` or `null` (the paragraph has a label: numbering in force, a defined numId, a level at or below ilvl; `fromStyle`: its style gives a numId), `numOf`, `listInfo` (both at once with the Level in force), `levelInd(doc, para)` (the level's indent, worked out for that paragraph alone: equal to the label's `indent`, pinned by a property test), `effPara(res, doc, para)` (`FormatEff` resolver `para(p, levelInd)`), `effective(doc, para, labels?)` -> `{left, first, right}` twips as drawn (style < level < direct). `Format.query` indents, `RulerInd.firstIndents`, `indentBy` (Ctrl-M, the toolbar's buttons) and `dragIndents` start from these, and `FormatPara.explicit` compares with style + level, so a list item's changed indent is written as direct `ind` (Word) and one back at the level's value is removed. `FormatList.setList(d, typing, sel, patch, pending?)` -> `{sel, pending}` over the selected list paragraphs (others skipped): `{by: 1 | -1}` (to the next level the numbering DEFINES in that direction, `ListLevel.levelAt`: with levels 0 and 2 only, Tab on 0 gives 2; a paragraph at an undefined level beyond the last steps up to the last; past the deepest or highest defined level nothing), `{level: n}` (clamped to 0..8 and `ListLevel.definedRange`), `{off: true, keep?}` (direct `numPr` removed, or `numId 0` when the style gives the list; `keep`: the level's left written as direct `ind` and a hanging first line made `firstLine 0`, so the text stays where it was drawn); writes direct `numPr {numId, ilvl}`; one undo step, none (not dirty) when nothing changes; bad patch: RangeError. `listParas(doc, sel)`, `hasList(doc, sel)` (`listParas > 0` stopping at the first list paragraph, at once with no numbering; `FormatMenu` asks it once per `v.selRev` and selection, so drawing the menu over a select-all of 50,000 paragraphs is cheap). `EditList`: `listTab` (a caret at an item's start, or a selection over items: `{by: 1}`; else a tab), `listShiftTab` (in an item anywhere: `{by: -1}`; else `undefined`: the key goes on), `listBack` (a caret at an item's start: `{off, keep}`; the next Backspace joins as before), `usesShiftTab`. Heading numbering (a style-numbered paragraph demoted gets direct `numPr`; Word would change the heading style) is not special-cased |
| `PropNames` | which property fields exist and the WML element each is read from / written as (rPr `rFonts b i strike color sz szCs highlight u vertAlign shd`; pPr `keepNext keepLines pageBreakBefore numPr spacing ind jc outlineLvl tabs pBdr shd widowControl contextualSpacing`; sectPr `pgSz pgMar cols titlePg type`); `withoutRaw` |

Reading and writing `.docx`

| module | what |
|---|---|
| `DocxRead` | `await readDocx(bytes, opts) -> Doc`; `DocxError`; opts `maxTotal maxRatio maxXmlBytes maxElements maxParagraphs` (paragraphs in typed table cells count too) and `tableNote(reason)` (told of every table kept Opaque, at any depth). Body tables are read by `TblRead` (typed by default since C1.7, R23; the `tables` switch is gone) |
| `DocxWrite` | `await writeDocx(doc, {date}) -> Uint8Array`; `newDoc` |
| `NewDoc` | `newDoc({paper: 'a4'\|'letter', date}) -> Doc` (what Word starts a blank document with) |
| `DocxError` | `code`: `not-docx no-document bad-xml unsupported bad-model`; `part`, `cause`, `kind: 'ole2'` |
| `Package` | `openPackage(bytes, opts)`: zip, content types, relationships, main part, which parts the reader consumes |
| `Rels` | `parseRels relKind firstOfKind resolvePart relsNameFor findPart` (Transitional and Strict relationship types) |
| `PartXml` | `parsePart(bytes, name, limits)`: size/element/paragraph gates before parsing; UTF-8 or BOM UTF-16 |
| `Ns`, `NsMap`, `Wml` | namespace scopes (elements are recognised by URI and local name, never by the `w:` prefix); Strict <-> Transitional URI mapping (`mapNamespaces`, `mapNamespacesCopy`); constants. `Ns.strictScope(map)` / `isStrict(map)`: a Strict document's scopes are marked (`DocxRead` for the main and styles parts, `WriteBody.docScope`, `WriteStyles.stylesTree(styles, strict)`; `scope` copies the mark), and there `ReadProps` / `WriteProps` use Strict's names for `w:ind` (`w:start` / `w:end` attributes) and `w:pBdr` (`w:start` / `w:end` sides) as the `left` / `right` fields; the Transitional names keep the element raw in a Strict document and the Strict ones in a Transitional document (see "Strict documents") |
| `ReadBody ReadPara ReadProps ReadPropsMore ReadSect ReadStyles ReadNumbering NumLevel` | the XML -> model readers (`NumLevel`: one `w:lvl` of a numbering definition; `ReadPropsMore`: `intOf`, `onOffOf` and the readers of `w:tabs`, `w:pBdr`, `w:shd` and a section's `w:type`, `sides(names)` the border reader over any side names (Strict `start`/`end` as `pBdr`; `pBdr = sides(SIDES)`), with the value lists `TAB_VALS`, `LEADERS`, `SIDES`, `SECT_TYPES`, `MAX_STOPS` 256, `MAX_POS` 31680: a `w:tabs` with a position beyond it or a position twice stays raw) |
| `TblProps` | Batch C, pure (D12): `readTblPr`, `readTrPr`, `readTcPr` (node, map) -> the D1 property objects with `ReadProps.readProps` (a field only when understood completely, else raw in `extra`, in order). Widths `{w, type}` (exactly `w:w` and `w:type`; type `dxa pct auto nil`; `w` an integer, or with `pct` a string like `"50%"`: `width`, `WIDTH_PCT`, `WIDTH_TYPES`); margins `{top?, left?, bottom?, right?}` (Strict `start`/`end`, R22); borders through `ReadPropsMore.sides`; `tblLook` `{val?, firstRow?, ...}` (val four hex digits, flags booleans, only those written); `tblLayout`; `trHeight` `{val, hRule?}`; integers as written for `gridSpan gridBefore gridAfter tblStyle*BandSize` (ranges: `TblScan`); `vMerge` (`<w:vMerge/>` = `continue`); `jc textDirection vAlign tblStyle` strings 1..253 characters without control characters; on/off flags. A field is read only when `TblWriteProps.writesAs` writes its value back as exactly the element in the file (attribute order and spelling, sides in schema order; `vMerge` aside, R2: `<w:vMerge w:val="continue"/>` is read and written `<w:vMerge/>`), so what types writes back as it was; otherwise it stays raw. `cnfStyle`, `tblpPr`, `hMerge`, tracked changes, `w14:*`... stay in `extra` |
| `TblNames` | Batch C, pure, imports nothing: the value forms and name lists `TblProps` and `TblWriteProps` share (`WIDTH_PCT`, `WIDTH_TYPES`, `STR`, `HEX4`, `MAR`, `LOOK`, `SIDES6`, `SIDES8`, `H_RULES`) |
| `TblWriteProps` | Batch C, pure (D12, R22): `tblPrNode(tblPr, map)` (always a `w:tblPr`), `trPrNode(trPr, map)`, `tcPrNode(tcPr, map)` (null when empty): the fields with `TblProps`' syntax, then `extra`, through `WriteProps.ordered`; Strict scope: `w:start` / `w:end` for left / right in borders and margins; widths `w:w` then `w:type`; `tblLook` `w:val` then the flags as `1`/`0`; `vMerge` `continue` as `<w:vMerge/>`; a wrong type or unknown key -> `badModel`. `writesAs(kind, field, v, node, map)`: whether a field is written as exactly `node` (`TblProps`' rule) |
| `TblWrite` | Batch C, pure (D13): `tblNode(table, map)` -> `w:tbl` (attrs; `w:tblPr`; `w:tblGrid` with `gridAttrs`; per row its `lead`, `w:tr` (attrs; the raw `tblPrEx`; `trPr` when not empty; per cell its `lead`, `w:tc` (attrs; `tcPr` when not empty; blocks: `WritePara.paraNode(p, null, map)` (never a sectPr), nested `tblNode`, an Opaque node as it is)); the row's `tail`; the table's `tail`). A cell ending with a table is written as it is. Each element's content is written in its own namespace scope (`map` plus the `xmlns` attributes of the `w:tbl`, `w:tr`, `w:tc` around it), the scope `TblRead` read it in: a prefix bound on a `w:tc` still names a known property in its `tcPr` (sorted in schema order, not as an extension) |
| `TblScan` | Batch C, pure: `TblRead`'s first pass, `scanTable(node, map, found)` -> the plan of one `w:tbl` (attrs, props, grid, rows, cells with their block NODES, marks as leads / tails) and every Opaque reason found (a Set); `MARKS` (R4), `REASONS` (R3's order: `tracked wrapped hMerge grid span sectPr propAttrs order stray empty ns tail`; the first found wins; `tail` for a cell whose last block is a `w:tbl` (C3 fix wave: Word reads it as unreadable, and a paragraph added would change the file; 0 in the corpus); `stray` also for a comment, PI or non-blank text in `w:tblPr` / `w:trPr` / `w:tcPr`, `span` also for a row wider than 63 grid columns, `ns` for an `xmlns:w` on `w:tbl`, `w:tblGrid`, `w:tr`, `w:tc` or a cell's `w:p`, since the writer names them `w:...`; a `gridCol` `w:w` not spelled as the writer writes it, such as `-0`, is `grid`). Nested tables are not looked into. The grid and span checks (`readGrid`, `wide`, `inRange`) are in `TblScanGrid` (split out in the C3 fix wave, TblScan was at 250 lines) |
| `TblRead` | Batch C, pure (D11): `readTable(node, map, ctx) -> {table} \| {opaque: reason}` (ctx `{depth = 1, count = {paras}, max, part, note?}`): all or nothing; `TblScan` first, then the cell blocks (`w:p` by `ReadPara`, null -> an Opaque cell block; a `w:tbl` one level down, Opaque in the cell when it does not type or would be deeper than 8 (reason `depth`); anything else an Opaque cell block). `countPara(ctx)`: the ONE paragraph cap shared with `ReadBody` (`DocxError 'unsupported'`, the body's message). Re-exports `MARKS`, `REASONS` |
| `TblStyle` | Batch C, pure, read only (D15, R7): `viewOf(styles, id, strict?) -> {tblPr, trPr, tcPr, pPr, rPr, cond} \| null` (a table style's `w:tblPr` / `w:trPr` / `w:tcPr` from `style.extra` read by `TblProps`, its `pPr` / `rPr` as `ReadStyles` read them, and `cond`: a Map of each `w:tblStylePr w:type` in `COND_TYPES` (`wholeTable band1Vert band2Vert band1Horz band2Horz firstCol lastCol firstRow lastRow neCell nwCell seCell swCell`; the first of a type counts) -> the same five parts; `basedOn` followed through table styles only, a visited set, at most `MAX_LINKS` 64 styles, merged from the root ancestor down: the child over the parent field by field (`mergePart`: borders and margins side by side, `extra` concatenated; `pPr` / `rPr` as the style chains merge), `cond` by type then field; a part element repeated in a style is not read; `strict`: a Strict document's side names (pass `doc.meta.conformance === 'strict'`); the scope is the styles root's `xmlns` plus the style's own (`w` bound to WML for a built-in style, raw null). Memoised per Style object (its last 4 views), used only while the chain is the very same Style objects; views are frozen. A themed border, shading or font colour (Word writes `w:themeColor` / `w:themeFill` on every colour of its built-in table styles) stays raw in the style, written back untouched; the view shows it by the literal colour beside the theme, through `TblColor.showThemed`); `tableStyleId(styles, table)` (`tblStyle` when it names a table style, else `styles.defaults.table` when that is one, else null); `mergePart(dst, src)` |
| `TblColor` | Batch C, pure (C2.2 ruling): `showThemed(part, kind, map) -> part` for DISPLAY: a property object (`tblPr`, `tcPr`, `pPr`, `rPr`) whose `tblBorders` / `tcBorders` / `pBdr` / `shd` / `color` element is raw in `extra` because it carries theme attributes (`w:themeColor`, `w:themeTint`, `w:themeShade`, `w:themeFill`, `w:themeFillTint`, `w:themeFillShade`) gets that field read with the literal colour Word writes beside them (`w:color`, `w:fill`, `w:val`), the theme ignored (an approximation: Word applies the tint or shade to the theme's colour); `auto` or no colour as before; only an element in `extra` exactly once, every attribute known and well formed, the field not already given; a NEW object (`extra` the same array) or `part` itself; Strict side names under a Strict scope. The model keeps the element raw and writes it back untouched. Used by `TblStyle`; C2.5 uses it for the table's and cells' own borders and shading |
| `TblCond` | Batch C, pure (D16, R6): `lookOf(tblPr)` (each flag of `tblLook` when written, else its bit of the hex `w:val` (`LOOK_BITS` 0x20 firstRow .. 0x400 noVBand), else false: the flags win, TB5); `bandsOf(tblPr, view) -> {rows, cols}` (the table's band sizes over the style's, integers 1..`MAX_BAND` 1000 else 1, R24); `condsOf(look, r, c, rows, cols, bands?)` (D16's types in D16's order: `wholeTable`, the vertical band (unless `noVBand`; the first column left out when `firstColumn`), the horizontal band (unless `noHBand`; the first row left out when `firstRow`), `firstCol lastCol firstRow lastRow`, then the corners, each when both its flags are on: `nwCell` firstRow + firstColumn, `neCell` firstRow + lastColumn, `swCell` lastRow + firstColumn, `seCell` lastRow + lastColumn); `layerOf(view, look, r, c, rows, cols, bands?) -> {tcPr, pPr, rPr}` (the view's whole-table parts, then each condition's, later over earlier; memoised per view by the conditions' key: the SAME frozen object for every cell with the same conditions; no view: one shared empty layer); `compatOf(doc)` (`overrideTableStyleFontSizeAndJustification` in `doc.rawSettings`' `w:compat`, as its element or as a `w:compatSetting` with that `w:name` and an on `w:val`; absent: false; cached per settings root); `stylesFor(styles, layer, compat) -> StyleTable` (R6: `docDefaults` pPr / rPr with the layer's merged over them; compat on: the default paragraph style a copy without the `sz` / `szCs` / `jc` the layer gives; the other styles the same objects; a layer giving nothing -> `styles` itself; memoised per (styles, layer, compat); display only) |
| `TblGrid` | Batch C, pure (D2, C2.3): the resolved grid as a VIEW, the one for layout, selection shapes, table commands and the clipboard. `gridOf(table) -> {cols, grid, rows: [{cells: [{c0, c1, rowSpan, top: [r, k], cont}], before, after}], width}` (memoised per table object in a WeakMap, frozen; C3.4: a copy with the very same grid array, rows' `trPr` and cells' `tcPr` (an edit in a cell copies none of them) gets the grid of the table it was copied from, found by its grid array after an identity check per row (D20)): `c0..c1` half-open grid columns from `gridBefore` and each `gridSpan`; a `vMerge` continue cell joins the merge above when the cell of the row above at its `c0` has the same `c0..c1` and is merged (restart or continue), else it is a restart (the first row, under a plain cell, another span: merged cells stay rectangles); `rowSpan` on the top cell, 0 on continue cells; `before` / `after` the row's `gridBefore` / `gridAfter`; `cols` the widest of the grid and every row; `grid` the twips per column, the file's widened with copies of its last column (the file unchanged), `width` their sum. Hostile counts clamped (spans 1..63, before / after 0..63). `cellAt(g, r, col) -> {r, k} \| null` (a continue cell gives its top; null in gridBefore / gridAfter or past the row), `spanOf(g, r, k) -> {r0, r1, c0, c1} \| null` (the merged cell's rectangle). 10,000 rows in about 6 ms Final fix wave (final-2 I3): the memo holds each grid by a `WeakRef` (`memo` table -> `WeakRef(grid)`, `byGrid` grid array -> `{ref, g}` both weak), so a table object never keeps its grid alive: the layout's table items (`it.key.g`) hold the grids of the tables shown, and the undo history's old table versions keep none (1000 x 63, insert / delete rows: 9.4 MB retained per step before, 0.12 MB after; a collected grid is resolved again, at the cost of one `gridOf`; `tbl-final-ui.test.mjs` checks the collection with `--expose-gc` in a child process). |
| `TblWidth` | Batch C, pure (D18, R24, C2.3): the one rule for table widths and units. `TW_PX` 15, `MAX_PX` 4000, `twToPx`, `widthTw(w, baseTw)` (dxa as is, pct of the base as `w / 5000` or `"n%"`, auto / nil / anything else null); `colsOf(table, view, textW, minOf?, deps?) -> {cols, left, width}` (px, frozen; D18: the grid first; unusable (all 0, fewer columns than the widest row, sum off a dxa `tblW` by more than 1/20) -> each column the widest `tcW` of its single-span cells (pct of the table width: `tblW`, else textW), the others sharing what is left equally, each at least the widest `minOf(r, k)` of its cells, capped at textW; `tblW` dxa / pct with autofit scales, fixed never; total <= 4000 px exactly, columns >= 1 px (columns under 1 px lifted first, the others shrunk to make room); `tblW`, `tblLayout`, `jc`, `tblInd` from the table's `tblPr`, else the style view's; memoised per (grid array, tblPr, view, textW), and per rows array and `deps` (what `minOf` measures with: `TblItems` passes `[styles, metrics]`, so new styles or fonts measure again) when the grid is unusable); `alignOf(tblPr, width, colW)` (`jc` center / right / Strict end when the table fits, else `tblInd` dxa within +-31680 twips; pct / auto 0); `marginsOf(...mars)` (px per side from the first margins object giving it as dxa 0..31680 or nil; default left / right 108 twips, top / bottom 0); `spacingOf(...widths)` (`tblCellSpacing` px, the first dxa / nil given); `cellBox(cols, c0, c1, mar, spacing) -> {x, w, tx, tw}` (the box inset by the spacing on each side, the text area minus the left / right margins, each at least 1 px) |
| `TblItems` | Batch C, pure (D17, D18, D20, C2.4): a typed table's item. `tableItem(L, it, depth, prev, make, share)` fills a `'tbl'` item (`left`, `width`: `TblWidth.colsOf` at its column's width; `rows: [{y, h, ry, cells, geo, listed}]`; `tops`; `key`; `st` and `listed`, `TblReuse`'s) and makes every cell a column `{x, w, items, styles}` (x / w the cell's text area, styles the derived style table of its layer, `TblCond.stylesFor`) whose items `make(b, col, depth)` (passed in by `DocItems`: no cycle) gives; a cell `{x, w, tx, tw, col, rowSpan, cont, r, k, c0, c1, layer, styles, vAlign, mar, dy, clip, need, laid, ry}` (work-area px). With `share` (the same layout-wide key and decorators) a row whose geometry is kept keeps its cells (`TblReuse.adoptRow`), and in a changed row a cell of the same object, text width, styles and top / bottom margins keeps its column (`adoptCell`): only changed cells are made and stacked again. A row's geometry `geo` (frozen: the cells' boxes from the table's left, margins, layer, derived styles, vAlign, the row's `trH`) is kept from the older layout's item when the row object is the same at the same index and the table's key (column widths by value, tblPr, style view, look, bands, row and column counts, `doc.styles`, compat) is the same. A cell's layer: its own row, column `c0` (the last column when the cell reaches it, the first when it starts there). `minWidth(L, para)` (the widest word, D18 step 2's min width; memoised per paragraph, and per cell object with its margins) |
| `TblLayout` | Batch C, pure (D19, C2.4, C2 fix wave): `layoutTable(L, it, y0) -> h` (the rows laid out once, `it.st.laid`, relative to the table's top: each cell's column stacked by `L.stackColumn` from 0 only when not laid yet (`c.laid`); a cell's `need` = content + top and bottom margins; a row = the most its single-row cells need, `trHeight` atLeast (or no rule) raises it, exact sets it and clips its cells, auto is ignored, 2112 px cap (R24); a vertical merge's need grows the LAST row of its span (not an exact one: clipped); vAlign center / bottom put the cell's column `dy` lower; continue cells' content counts for nothing; hidden rows shown; rows' `ry`, cells' `ry`; then, unless placed at y0 already (`it.st.at`), every row, `tops` and item at every depth placed: `y = ry + top`, so a table that only moves gets the very values a new layout gives), `unlay(it)` (`DocLayout.invalidate`), `rowAtY(it, y)` (binary search on `tops`), `bottomOf(it, c)` (the bottom of a cell's box: the last row its vertical merge spans; `TablePaint` and `DocRects`, C3.2) |
| `TblReuse` | Batch C, pure (D20, C2 fix wave): a table's item kept from the older layout. `reuseTable(L, it, o, depth)` (the same block object, column width and styles, list labels (`listed`: a label flows in from above the table) and, checked by `DocItems`, the same metrics, styles, numbering, settings and decorators: `it` takes o's rows, cells, columns and placement state `st` `{laid, at, th, cx}` whole; its items registered by `register` (C3.1: put in `L.flow` at their flow places, `index` and a table's `endIndex`, and in `L.byId`: the ONE place where every layout-dependent field of a kept item gets its new value); moved to its x, a top-level one with the page through `L.moved`), `adoptRow` / `adoptCell` (`TblItems`), `listedOf(cells)`, `moveColumn(col, x)` (moved here from `DocItems`, which re-exports it: cells placed from the table's left and the row geometry, only tables not there yet, `st.cx`), `strictOf(doc)`. Kept items are shared with the older layout, which is USED UP (C3.1: `DocItems` sets `prev.spent`; offered again it gives no reuse; it is never laid out or painted again; `Selection.clamp` reads its ids and a gone item's index only) |
| `SelShape`, `SelCells` | Batch C, pure (D10, C3.2): the shape of a selection, DERIVED from the Doc (the selection value does not change). `shapeOf(doc, sel, owner?)` -> `{kind: 'text'}` (both ends in one cell, or in one container with no typed table between them), `{kind: 'cells', table, r0, r1, c0, c1, cells: [{r, k, at}], whole}` (the ends in different cells of one table: the innermost such table, a nested table's paragraph counting as its outer cell; rows r0..r1 and grid columns c0..c1 INCLUSIVE, grown until no merged cell crosses an edge, through `TblGrid.gridOf` / `spanOf` (a worklist since the C3 fix wave: each row scans only the columns it has not scanned, so a cell is looked at O(1) times: a hostile staircase of offset vertical merges: 1000 x 63 about 1 s -> 9 ms, 1000 x 5 89 -> 0.6 ms); `cells` every cell in it row by row, vMerge continue cells too, `at` the cell's path = the table's path + [r, k]; `whole` when every cell is in it or the selection is `{t,0}..{t,1}`) or `{kind: 'mixed', tables: [{table, r0, r1}], from, to}` (an end outside the table or in another one: every typed table of the ends' container that the range touches, as whole rows from the end's row to the edge toward the other end; a table spanned or entered at its start edge whole; a table met only at its far edge untouched). Frozen; an invalid selection is text. Memoised per (owner, anchor, head) when given an owner (`DocRects` passes the layout: one Doc state; the ops change the Doc in place, so the Doc is no key); otherwise computed afresh. `paraRanges(doc, sel, owner?) -> [{at, from, to}]` every paragraph touched in flow order (text: the ends' offsets; cells: every paragraph of the cells, nested ones too, whole; mixed: the range's paragraphs and the covered rows' whole; a caret: its paragraph) -- the one primitive the formatting commands use from C3.5 (`FormatOps.touched`, `RulerInd.firstPara`). `covered(doc, sel) -> [{b, at, from, to}]` (C3.5, not memoised) every block the selection covers in flow order: `paraRanges`' paragraphs and the kept (Opaque) blocks among them (one at an end only when the range holds it), tables entered, never listed (`WordCount`). `cellRect(doc, at)` (in `SelCells`, re-exported) one cell's shape from its cell path or a block path in it. `SelCells.cellsShape(tp, t, ends, all)` builds and grows a rectangle. A 1000-row whole-table shape: well under 20 ms |
| `SelTable` | Batch C, pure (D10, C3.3): moving and selecting in tables. `vertical(L, it, p, aff, gx, dir)` (`SelMove`'s up and down for every item): a paragraph's next line (`PositionMap.vertical`); past its first / last line the item beside it IN ITS COLUMN entered at goalX (`enter`: a table into the cell of its first / last row that spans goalX, `DocHit.cellAtX`, a vMerge continue cell's restart cell, then that cell's first / last item, nested tables the same way); past a cell's first / last item the cell above / below that spans goalX (a merge's restart cell; a merge that also spans the caret's own rows is passed); past the table's first / last row the item beside the table (none: the table's edge `{t, 0 | 1}`, reachable by D8); past the root column's ends the document's start / end. From `{t, 0}` Down (from `{t, 1}` Up) goes into the table. The cell holding an item is found through the Doc (`EditPos.findBlock(L.doc, id).cell`, then the table's item in `L.byId`), only for items not in the root column, so a table-free document moves exactly as before (`L.flow === L.items`, the same items beside). `cellTabTarget(doc, sel, dir)` -> a selection of the next / previous cell's whole content (its first block's start to its last block's end) in the head's innermost table, row by row, vMerge continue cells skipped; `'last'` when there is no cell further that way (the last cell for Tab, the first for Shift-Tab); `null` outside a cell. `inCell(doc, pos)`. `zoneAt(L, x, y)` (layout px: the caller undoes the zoom, `Zoom.toLayout`) -> `{kind: 'cell', table, r, k}` (the first `CELL_EDGE` = 4 px inside a cell's left edge: x - cell.x < 4), `{kind: 'row', table, r}` (x0 - `ROW_ZONE` (24 px, 0.25 in) <= x < x0, y in the table), `{kind: 'column', table, c, k}` (t.y - 4 <= y < t.y, x over the table: row 0's cell under x, c its grid column), innermost table first; `table` is the table's ITEM; null in a layout without a typed table. `zoneSel(L, z)`: a cell's content, a row from its first cell's start to its last cell's end, a column from its cell in row 0 to its cell in the last row that has one (`TblGrid.cellAt`; `SelShape` makes them `cells` rectangles, grown over merges) |
| `TblEdit`, `TblCmd` | Batch C, pure (D23..D26, R17, C3.4; C4 adds the rest): the table commands as pure functions on a Table, copy-on-write (a new table sharing every row, cell and block not changed; the same table when nothing changes). `TblEdit.emptyLike(p)` (R17: THE empty paragraph a command makes: a fresh id, `p`'s `pPr` (a raw paragraph-mark `w:rPr` in its extra kept) and `pStyle`, `extraP []`; a plain one for no paragraph), `clearCells(t, cells)` (`cells` `[{r, k}]`: each keeps one paragraph, `emptyLike` of its first paragraph (its first block, else the first paragraph in it at any depth); a cell already one empty paragraph kept as it is), `deleteRows(t, r0, r1) -> t' \| null` (inclusive; null for every row; a vMerge continue cell of the next row whose merge started in the removed rows becomes its restart; the removed rows' marks between rows and cells (row lead, cells' lead, row tail) move in order to the front of the next row's lead, or of the table's tail, and so do (C4.1) the bookmark marks in the removed rows' paragraphs at any depth whose partner is not in those paragraphs: a bookmark pair is never broken), `insertRows(t, r0, r1, below) -> t'` (C4.1, D23: r1 - r0 + 1 rows above r0 / below r1, each like the row beside them: its `trPr` (`tblHeader` kept only when the new rows stay in the header run: above a header row, or between two header rows), each cell's `tcPr` without vMerge restart (strictly inside a vertical merge `continue`, so the merge grows; below its last row or above its restart none: C4 fix wave A4), one `emptyLike` paragraph of the cell's first paragraph, `attrs` / `lead` / `tail` `[]`, `tblPrEx` null (R17); RangeError for rows not in t, `'rows'` past `MAX_ROWS`, R16), `splitTable(t, r) -> [a, b]` (C4.1, D25: rows from r a new table with a fresh id, t's tblPr, attrs and tail; `a` keeps t's id, tail `[]`; a merge crossing row r restarts there; RangeError unless 0 < r < rows). A changed table always gets a NEW grid array (equal values: `TblWidth.colsOf` memoises per grid array) and a `tcPr` / `trPr` is never changed in place (`TblGrid` reuse). `TblCmd.onTable(d, at, fn, place?) -> sel \| null` (`fn(table, gridOf(table))` -> a new table applied as ONE `restoreBlock` at `at` in the caller's `d.atomic`, ids reserved first; the caret at `place(newTable)` or its first paragraph; null when nothing applied); `firstPos`, `lastPos`, `cellPos`, `rowPos` re-exported from `TblPos` (C3 fix wave). C4.1's row commands, each ONE `d.atomic` (one undo step) returning the selection after, or null when refused (nothing changed, no step; `EditRun` beeps): `rowsOf(doc, sel) -> {at, r0, r1} \| null` (a `cells` shape's rows, inclusive; a `text` selection in one cell: that cell's row of its innermost table; else null), `insertRowsCmd(d, sel, below)` (the selection stays), `deleteRowsCmd(d, sel)` (the caret in the row after them, else the one before; every row: the table removed (`removeBlock`), the caret in the block after (a table: its first paragraph), an empty paragraph made when there is none: a section's end), `tabRowCmd(d, sel)` (only with the head in the last cell of its innermost table, `cellTabTarget(doc, sel, 1) === 'last'`: a row below the table's last row, the caret in its first cell), `splitTableCmd(d, sel)` (`restoreBlock` of the first part + `insertBlocks` of an empty paragraph and the second table, the caret in the paragraph; at row 0 an empty paragraph before the table); `atomic(d, fn)` and `removeTable(d, at)` (the table removed, the caret after it) are shared with `TblCmdCols` (C4.2), which holds `TABLE`. `rectOf(doc, sel)` (moved here from `TblCmdCols` in C4.3, which re-exports it: the merge commands need it and `TblCmdCols` imports `TblCmd`) and C4.3's `mergeCmd(d, sel)` (a `cells` shape of more than one cell merged by `TblMerge.mergeCells`, the caret at the merged cell's start; null for a caret / one cell / a rectangle that cannot be made whole) and `splitCellsCmd(d, sel, {cols, rows})` (`rectOf`'s cell split by `TblMerge.splitCell`; a `cells` shape of more than one cell merged first, then split, in the same step (Word's "Merge cells before split", on by default); the caret at the start of the first new cell; null when refused or 1 x 1). `TblEdit` also shares (C4.2) `firstPara(cell)`, `cellMarks(cell, out)` (a cell's lead nodes and its paragraphs' bookmark marks), `unpaired(got)` and `nodesOf(got)` (the marks that move, as `deleteRows` moves them) Final fix wave: `removeTable` moved to `TblRemove` (re-exported; `TblCmd` was full); `splitWhy(doc, sel, cols, rows)` gives the Split cells box's reason (a split past `MAX_ROWS` rows now says rows, not columns: final-3 minor 3). |
| `TblRemove` | Final fix wave, pure (final-1 I1): `removeTable(d, at) -> sel`, the table at `at` removed by ONE `removeBlock` in the caller's `d.atomic`, the caret in the block after it (a table: its first paragraph; an empty paragraph made at the end of a section or cell); the bookmark marks of the table at every depth, loose ones too (`BookmarkKeep.tableMarks`), whose partner stays go to the caret (`stillPaired`, `putMarks`), as a range delete of the table does (`RangeTbl`). Used by Delete > Table and by Delete > Rows / Columns over all of them (`TblCmd.deleteRowsCmd`, `TblCmdCols.deleteColsCmd`, `deleteTableCmd`) |
| `TblEditCols`, `TblEditDist`, `TblCmdCols` | Batch C4.2, pure (D24, D26, TB12, TB25, R16): the column, select and distribute commands. `TblEditCols.insertCols(t, g, {c0, c1, right}, textTw) -> t'` (`c1 - c0 + 1` new grid columns left of c0 / right of c1, the widths of columns c0..c1 in order; per row: a cell whose gridSpan crosses the point grows (a dxa tcW by the new widths); at a cell boundary new one-column cells beside the neighbour on the copied side (right: the cell ending there; left: the one starting there), its tcPr without vMerge / gridSpan, tcW dxa of the new width, one `emptyLike` paragraph of its first paragraph (`Model.newCell`); when that side is the row's gridBefore / gridAfter it grows; past a short row's end nothing; a table whose grid total was within `textTw` (a number; anything else never scales) and now exceeds it is scaled back to its old total, grid integers with the remainder to the largest fractions and every dxa tcW, TB12; a dxa tblW grows with the grid when not scaled; RangeError for bad columns, `'columns'` past `MAX_COLS`), `deleteCols(t, g, {c0, c1}) -> t' \| null` (spans crossing shrink (dxa tcW by the columns' widths), cells inside go with their content, gridBefore / gridAfter over them shrink, rows left with no cell go, every column (or row) null; a dxa tblW shrinks; the marks of what goes move to the next kept cell's lead in the row, else the row's tail, a gone row's to the next kept row's lead, else the table's tail, a pair wholly gone going with it; a vMerge continue cell not joined to a merge above (read as a restart) is written restart, so it cannot join one once a neighbour narrows), re-exports `TblEditDist`'s `distributeCols(t, g, {c0, c1})` (equal integer widths over the columns' total, the remainder to the last; every cell over them tcW dxa = its columns' sum; the same table when nothing changes) and `distributeRows(t, {r0, r1}, heights)` (trHeight `{val, hRule: 'atLeast'}`, val the tallest of the layout's px heights x `TW_PX`, at most `MAX_TW`; RangeError for bad rows or heights); `TblEditDist` also holds the shared `dxa`, `isDxa`, `sum`, `checkCols`; `TblEditCols` exports `tcPrWith(tcPr, n, w?)` and `trPrWith(trPr, before, after)` (gridSpan / tcW dxa, gridBefore / gridAfter set on a copy) for `TblMerge`. Every changed table gets a new grid array; no tblPr / trPr / tcPr is changed in place; unchanged rows and cells are the very same objects (no scaling). `TblCmdCols`: `rectOf(doc, sel) -> {at, r0, r1, c0, c1, r, k, one}` (`TblCmd`'s since C4.3, re-exported: a `cells` shape's rectangle, inclusive; a `text` selection in one cell: that cell's merged rectangle in its innermost table, `one`; r, k the head's cell), `insertColsCmd(d, sel, right, L?)` (scaled to the table's container width in layout L: its item's column px x 15; no L, no scaling; null past `MAX_COLS`; the selection stays), `deleteColsCmd(d, sel)` (the caret in the cell now at the first deleted column of the first row, else the column before; every column: `removeTable`), `selectCmd(d, sel, what)` (`'cell'` the head's cell's content, `'row'` from row r0's first cell to row r1's last, `'column'` from the first row's cell over c0 to the last row's cell over c1, `'table'` its edges `{t, 0}..{t, 1}`; a continue cell gives its restart; no change, no step), `distributeColsCmd(d, sel)` (a caret: every column of its table, Word), `distributeRowsCmd(d, sel, L)` (a caret: every row; the heights from layout L's item of that very table object, null without one); each one `d.atomic`, null when refused or nothing changes (no step). `TABLE` (`{id: fn(d, sel, arg)}`): `tabRow`, `splitTable`, `rowsAbove`, `rowsBelow`, `deleteRows`, `mergeCells` (C4.3), `colsLeft`, `colsRight`, `deleteCols`, `selectCell`, `selectRow`, `selectColumn`, `selectTable`, `distributeRows`, `distributeCols`; `EditRun` passes `{L: v.L}` as `arg` for these ids only (C4.4's menu runs them with `v.run(id)`) |
| `TblMerge`, `TblSplitBox` | Batch C4.3 (D25, TB13, TB14, R16). `TblMerge` (pure): `mergeCells(t, g, {r0, r1, c0, c1}) -> t' \| null` (inclusive; in each row of the rectangle its cells become one with the row's first cell's tcPr, gridSpan the columns' sum, tcW summed (all dxa: their sum; else, if it had one, dxa of the columns' widths); over several rows the first row's cell vMerge `restart`, the rows below `continue` (one row: no vMerge); the merged cell holds the SHOWN cells' blocks in flow order (the very objects: ids kept), a cell that is one empty paragraph adding nothing, at least the first cell's own; a vMerge continue cell's (hidden) blocks stay hidden in their row's continue cell (none: one `emptyLike` paragraph); the shown cells' leads go with their content to the front of the first row's merged cell's lead, a hidden cell's stays in its row, and a pair left end before start has its start put there (`TblPairs.inOrder`, C4 fix wave); null when a row has no cells exactly from c0 to c1 (gridBefore / gridAfter, a short row, a span crossing the edge), a merge reaches outside the rectangle, or it is one cell; RangeError for a rectangle not in t), `splitCell(t, g, {r, k}, {cols, rows}) -> t' \| null` (in `TblSplit` since the C4 fix wave, re-exported; a continue cell: its merge; columns: a span of at least `cols` divided, the remainder to the first pieces, the grid unchanged; otherwise lines at equal widths (twips rounded, a line already there reused) added to the grid and every other cell across the new columns, gridBefore and gridAfter grow their span; rows: a cell merged over h rows divided into `rows` parts of h / rows rows (null unless `rows` divides h); a plain cell gets `rows - 1` new rows after its row, the row's other cells made `restart` (unless merged already) and `continue` in the new rows (the merge grows), trPr copied (tblHeader only inside a header run); the content stays in the first new cell, the others `emptyLike`; new cells' tcW dxa of their columns when the cell's was dxa; the same table for 1 x 1; null for numbers not 1..63 / 1..`MAX_ROWS`, past 63 grid columns or `MAX_ROWS` rows; RangeError for no such cell). `TblSplitBox` (desktop): `tblSplitBox(dw)` the Split cells box (key `'tblsplit:' + docKey`, `Boxes.box` `'tblsplit'`, `minW` 468, R13): Columns and Rows (2 and 1 when it opens; fields that never clamp), Cancel / OK; OK runs `splitCellsCmd` in `typing.command` (one step) and closes; a number not 1..63, or a split refused (past 63 grid columns, rows not dividing a merge, no cell, 1 x 1), beeps, says why in the box and keeps it. Opened by C4.4's Table menu (the tests: `task.word.docs[i].splitBox()`) Final fix wave (final-2 I2): the box records `TabsBox.where(view)` when asked (again too); OK with another selection or document state beeps, says "The document changed while the box was open: look again, then click OK.", keeps the numbers typed and records the new state, so the next OK splits at the new caret (as `TblInsertBox`); its reasons come from `TblCmd.splitWhy`. |
| `TblNorm`, `TblPairs`, `TblSplit` | C4 fix wave, pure. `TblNorm`: `prWith(pr, patch)` (a copy of a tblPr / trPr / tcPr with each patch field set, or removed when undefined, and the raw element of the same name in `extra` dropped: `PropNames.withoutRaw`, setProps' rule; never two `w:tcW`), `unstray(t, g?)` (every `continue` cell `TblGrid` reads as a restart written `restart`: a new table and grid array, or `t`); every structure command starts from `unstray` and sets fields only with `prWith`. `TblPairs`: `endIn(cells)` (a bookmark end among the cells' marks), `inOrder(old, t, r, k)` (each pair `t` has end before start but `old` had in order: its start to the front of cell (r, k)'s lead; marks of the table's leads / tails and of paragraphs at any depth; `BookmarkKeep.markOf` reads a lead's node). `TblSplit`: `splitCell` (moved out of `TblMerge`, which re-exports it; unchanged but for `unstray` / `prWith`) Final fix wave (final-1 I2): `TblPairs.reversedIds(list)` (the ids of a document-order mark list's pairs that are end first: what was so before a command) and `endsAfter(was, t)` (every pair of t, counted as `inOrder` counts, that is end before start and not in `was`, put right by moving its END to just after its start, in the start's paragraph or after it in its lead or tail: an empty bookmark, never a longer one; t itself when none). |
| `TblInsert`, `TblInsertBox`, `TblMenu` | Batch C4.4 (D27, D30, D31, R13, R16, R22). `TblInsert` (pure): `insertTable(d, sel, {cols, rows, widthTw?, textTw?}) -> sel \| null` (ONE `d.atomic`; null and no step for cols / rows not whole numbers 1..`MAX_COLS` / 1..`MAX_ROWS`, `widthTw` not 1..`MAX_TW` or all columns wider than `MAX_TW`, a selection not in the document, a caret already in 8 tables; the selection deleted first with `EditRange.deleteRange`; placement: an empty paragraph or a paragraph's start: the table before it, mid-paragraph `EditPara.splitAt` and the table between, at the end after it, a kept block's edge as the page break does; `insertBlocks` of `[table]` plus an `emptyLike` paragraph after it when the next sibling is not a paragraph and a new paragraph before it when the previous sibling is a table (so the last op is the table and `EditApply.stepEnd` puts the caret in its first cell; two tables never touch); in a cell the table is nested). The table: `tblStyle` from `tableGridStyles`, `tblW 0 auto`, `tblLook` `04A0` with Word 2010's booleans (a Strict document: the booleans only, R22), a fixed `widthTw` also `tblLayout fixed` (Word's "Fixed column width"; `widthTw` is the width of EACH column), grid columns of equal width = the container's text width / cols (integer twips, the remainder in the last column; `textTw` when the caller knows it from the layout (the box: only in a cell, `layoutTw(doc, L, pos)` = `RulerInd.textTwips` there, else undefined), else the caret's section's column (`SectWidth.columnTw`: its page width less its margins and its `w:cols` spaces, divided by the columns: a 2-column section's column, a landscape later section's width), or the cell's grid width less 216 twips of margins; never under 1 twip a column, never over `MAX_TW` in all), every cell `tcW` dxa of its column and ONE `TblEdit.emptyLike` paragraph of the caret paragraph (its pPr and pStyle: a heading or a list item gives heading or list cells; `newPara` when the caret is not in a paragraph). `tableGridStyles(styles, {strict}?) -> {styles, id} \| null`: the document's own Table Grid (by id, else by name case-insensitive) as it is, never replaced; else Table Grid based on the document's Normal Table (a table style, by id or name), else on its default table style (`defaults.table`, when that is a table style), else on Word's Normal Table, which is added with it (and made `defaults.table`, in a copy) only when the document has no default table style and nothing named Normal Table (C4 fix wave: never a second `w:default` table style; a `TableNormal` that is no table style is never the base: no `basedOn` then), Table Grid added to a NEW style table with `DocParts.withStyle` (the same step's `setDocPart styles` op; a second table adds nothing; undo gives back the very old styles object); null when there is no style table or the id `TableGrid` is no table style: the table then has direct `tblBorders` (six single `sz` 4 `auto` sides) and no `tblStyle` (D31's fallback). `widthAt(doc, L, pos)` (C6.3): `layoutTw`, else the container's text width as `insertTable` takes it (the cell's grid width less 216 twips, or the section's column), undefined for a position not in the document: the width `ClipRoute` reads pasted HTML tables at. `TblInsertBox` (desktop: imports `'riscos'`): `tblInsertBox(dw)`: Columns (number, 1..63, 2), Rows (1..1000, 2: R16's box limit; the command itself takes `MAX_ROWS`) and Column width (popup Auto / Fixed + a length 0.1..22 in, shaded for Auto; Fixed puts 1 in) built by `Ui/Dialog` (`minW` 540, key `'tblins:' + docKey`, `Boxes.box(dw, 'tblins')`, `enter: 'OK'`, always a Cancel); OK checks every field (a number that is not a whole number in range, an empty / unreadable / out of range width, columns together wider than 22 in) and beeps with a message in the box (never clamps: no field has a range of its own, the length field included since the C4 fix wave, whose default range would have clamped to 22 in); a stale selection or document (`TabsBox.where`) beeps once and the next OK uses the new caret, and so does asking for the box again; no selection and a caret no longer in the document beep with their own messages; OK runs `v.typing.command(() => insertTable(v.d, v.sel, opts))` with `textTw = TblInsert.layoutTw(...)` for Auto (only in a cell), then `v.edited` and `v.focus`; a refusal (depth 8) beeps with a message. `TblMenu` (desktop): `tblMenu(dw) -> Menu('Table')` after Format in `WinMenu`: Insert table..., Insert > (Rows above, Rows below, Columns to the left, Columns to the right), Delete > (Rows, Columns, Table), Select > (Cell, Row, Column, Table), Merge cells, Split cells... (`TblSplitBox`), Split table (`Ctrl+Shift+Enter` from `Keymap.labelFor`, through `macLabel`), Distribute rows evenly, Distribute columns evenly, Cell alignment > (Top, Centre, Bottom), Table properties... (`TblBox`), Tab, dotted lines after Select >, Split table and Table properties... (four groups, C5.1); each runs `view.run(id)` (`TblCmdCols.TABLE`: `deleteTable` is new, `deleteTableCmd`: `rowsOf`'s table through `removeTable`). Shaded when the selection is not in a table (`TblCmd.rectOf`: the caret in a cell, a text selection inside one cell, or a `cells` shape; a `mixed` one is shaded), Merge cells also when `TblMerge.mergeCells` would refuse (one cell); the facts are memoised per (selection, `d.stateId`) in a WeakMap per view, since a menu asks on every draw. Word's Alt keys for these commands are not used (D30: `Keymap` gives Alt null). The RULING from the owner session: `cellTabItem(dw)` is the Tab item (text `Tab`, key `Ctrl+Tab` from `labelFor('cellTab')`, shaded unless the head is in a cell, `view.input('\t')`) in the Table menu AND in `InsertMenu` (after Table...), for when the browser keeps Ctrl-Tab for itself; the `cellTab` key binding stays. `InsertMenu` has Table... after Section break (shaded without a selection). Final fix wave: Insert > Table and Text to table put the separating empty paragraph after ANY table before them, typed or Opaque (`TblCheck.endsCell`, as `ClipPaste`: final-1 I3, D27); the Tab item is live only for a caret or text in one cell (`rectOf(...).one`; shaded for a `cells` or `mixed` selection: final-2 M8, where it typed a tab in the first cell and emptied the others). |
| `TblPatch`, `TblEditProps`, `TblBox` | Batch C5.1 (D26, R13). `TblPatch` (pure): `fill(shape, table, g?) -> values` (the Table properties box's nine values from the table and the shape, `TblCmd.rectOf`'s inclusive `{r0, r1, c0, c1}`: `widthMode` auto / length and `width` (tblW dxa; none, auto, nil: auto), `align` (jc: none and `left` / `start`: left; `end` = right), `indent` (tblInd dxa; none or nil: 0), `rowMode` auto / atLeast / exact and `rowHeight` of rows r0..r1 (an absent `hRule` is atLeast, as `TblItems` reads it), `colWidth` of the grid columns c0..c1, `cellWidth` (tcW dxa of the shape's top cells; none or auto: the columns' sum) and `vAlign` (none: top); mixed values, a percentage, a raw element in `extra` (Strict `1.5pt`) or `both` are undefined: the field is shown empty and, untouched, unchanged); `patchOf(values, q, strict?) -> {tblPr?, rows?, cols?, cells?} \| {error: 'range', field}` (only what changed as the box shows it, a hundredth of an inch; `rows: {trHeight: {val, hRule} \| null}`, null = Auto = no trHeight; widths 29..31680 twips (0.02..22 in), row height 0..31680, indent -31680..31680 (Word allows a negative indent, the brief said 0..22), a length wanted but blank, a length with no rule, or the other way round, a changed table width with no Auto / Length (`field: 'widthMode'`: a percentage table opens with the mode blank), and anything not a length (null) are `range`; never clamped; `strict` spells jc `start` / `end`; a length still as shown whose mode alone changed keeps its stored twips (C5 fix M1: At least 3000 -> Exactly stays 3000, not the shown 2995)), `fieldOf(patch, run)` (the box's field of the first one-part sub-patch that `run` (the command) refuses with a RangeError, for the message: C5 fix M3). `TblEditProps` (pure, re-exported by `TblEdit`): `setProps(t, g, shape, patch) -> t'` (a NEW table and grid array or `t`; fields set with `TblNorm.prWith`, so a raw same-named element is dropped; starts from `unstray` but a stray alone is no change; the patch is checked: tblPr keys only tblW / jc / tblInd with dxa / auto / nil widths, widths integers 1..`MAX_TW`, trHeight val 0..`MAX_TW`, vAlign top / center / bottom, else RangeError; `cols.widthTw` sets the grid columns and every cell over them to the sum of its columns, as `distributeCols`; `cells` set `tcW` / `vAlign` on the shape's top cells AND the continue cells below them) and `cellsOf(g, shape)`. `TblCmd.propsCmd(d, sel, patch)` (one `restoreBlock`, the selection kept; null for no table or no change) and `alignCmd(d, sel, 'top' \| 'center' \| 'bottom')`; `TblCmdCols.TABLE` has `cellTop`, `cellCenter`, `cellBottom` for the Table menu's Cell alignment >. `TblBox` (desktop: imports `'riscos'`): `tblBox(dw)` (key `'tblprops:' + docKey`, `Boxes.box(dw, 'tblprops')`, `minW` 648: Table width popup Auto / Length + length, Alignment popup Left / Centre / Right, Indent from left; Row height popup Auto / At least / Exactly + length; Column width; Cell width, Vertical alignment popup; Cancel / OK, `enter: 'OK'`). The length fields have `min` / `max` of +-`MAX_SAFE_INTEGER` (the C4 Fixed-width rule: a default range would clamp 23 in to 22); OK runs `patchOf` and beeps with a message naming the field (a RangeError from the command: the field `fieldOf` names, focused; else a general message); the width field is shaded while Table width is blank (a percentage or raw tblW) or Auto, and choosing Length enables it ("Choose Auto or Length for the table width." if a width comes with neither); nothing changed closes the box without a step; a stale selection or document (`TabsBox.where`) refills the box with a beep and keeps it; Length / non-Auto on a blank field puts the table's width (or 0.2 in) in; no caret in a table: the menu item is shaded and `tblBox` beeps. |
| `TblBorderPatch`, `TblBorderAt` | Batch C5.2 (D31), pure. `TblBorderPatch`: `fill(shape, table, g, apply, eff?) -> values` (the Borders and shading box's values for Apply to `'cell'` / `'table'`, `BorderPatch`'s names with the sides `top bottom left right insideH insideV` and `between` false; Cell: a side is on when every cell of the shape draws it at that edge, off when none does, undefined when mixed or raw; Table: the table's `tblBorders`; shading the cells' own `tcPr shd` / the table's `tblPr shd`), `settingOf` (none / box / all / custom), `sidesOf`, `patch(values, q) -> {cells?: Map 'r,k' -> {tcBorders?: {side: s}, shd?}, tblPr?: {tblBorders?, shd?}} | {bad}` (q `{shape, table, g, eff?}`; only what changed; a side turned off `{val: 'nil'}`, on `{val, sz, space, color}`; Fill None `shd: null`; a Cell outer side turned OFF also nil on the neighbouring cells across the edge whose edge lies along the shape's (not a wider one; none in a row with cell spacing); turned ON only on the shape's cells (a drawn side wins over none / nil); bad: a value not offered, `sides`, `raw` for a touched raw `w:tcBorders` / `w:tblBorders` / `w:shd`), `effOf`, `SIDES6`. `TblBorderAt`: `cellsIn(g, x)` (every cell of the shape, continue cells too), `placesOf(g, x)` (each cell side and the box side it belongs to: no line inside a merged cell), `nearOf(g, x, spaced?)` (the neighbours across the outer edges whose whole edge lies along the shape's, none in a spaced row), `spacedOf(t, eff?)` (row r spaced? `TblWidth.spacedRow`, the one rule `TblBorders` uses too; the style's spacing through `eff.styleTblPr`), `direct(t, g, r, k, side)` (own tcBorders side, else tblBorders by position; `UNKNOWN` when raw), `effOf(L, t)` (what the layout draws: `TblBorders.sidesOf`, the table's own `tblBorders` else its style's; null without an item of that very table). Written by `TblEditProps.setBorders(t, patch)` (sides merged over the cell's / table's own, shd null removed, `TblNorm.prWith`, the grid array kept, unchanged cells shared; RangeError for a cell not there, a side or shading `FormatCheck` refuses or would clamp, a raw element to change) through `TblCmdCols.bordersCmd(d, sel, patch)` (one step, the selection kept). `BorderBox` offers Apply to Cell / Table in a table (Cell the default there); `BorderPatch` exports `shadeOf` and `colourOf` for it |
| `TblEdge`, `TblDrag` | Batch C5.3 / C5.4 (D33): column and row edges dragged. C5.4: `TblEdge.dragHeight(h, dy, maxPx = MAX_PX)` (a row's height after its border moved dy px: not under `MIN_ROW_PX` (1 px = 15 twips, 0.01 in) unless already, not over maxPx unless already; h for a dy that is not a finite number), `TblCmdCols.rowDragCmd` and `TblDrag.rowDragStart(v, ev)` (see "Row edges dragged"); `colDragStart` and `rowDragStart` share one `follow` (ghost, stale check by `d.stateId`, Escape, `put`). `TblEdge` (pure): `EDGE` 3 (screen px), `MIN_PX` 9.6 (0.1 in), `MAX_PX` 2112 (`MAX_TW`); `edgeAt(L, x, y, zoom) -> {table, kind, index} \| null` (the border within `EDGE / zoom` layout px of a layout point: `'col'` a vertical border between two cells of the row at y, index its grid line 1..cols-1; `'right'` the table's right edge, index the column count; `'row'` a row's bottom border, index the row; a vertical border wins at a crossing; a nested table before the table round it, unless the outer border is nearer (C5 fix M1); no `'row'` edge inside a vertically merged cell (C5 fix M2); a line inside a cell spanning it, the left and top edges: none; null without a typed table or for a point / zoom not finite), `dragWidths(cols, index, dx, minPx, maxPx?)` (px: the two columns beside a border change, their sum kept; the right edge: the last column; each changed column within minPx..maxPx, or where it was when outside: a drag limit, never a clamp of what is there), `dragGrid(cols, next, index) -> {grid, total}` (twips: every column its shown px x 15 rounded, the pair's second the pair's old sum less the first, so a plain drag keeps the total exactly). `TblEditDist.withCols(t, g, grid, {fitW, styleW}) -> t'` (the grid given, integers 0..`MAX_TW`, one per column, else RangeError; a NEW grid array; every cell over a changed column tcW dxa = its columns' sum, pct / auto / raw ones too; fitW: a dxa or pct tblW (the table's own, else `styleW`, its style's: then the table gets its own, so the drag shows; C5 fix M5) becomes dxa of the total; from `unstray`; the same table when nothing changes) through `TblCmdCols.colDragCmd(d, sel, {table, grid, fitW, styleW})` (the very table object dragged must still be in the document; one step, the selection kept; null otherwise). `TblDrag` (desktop: `wimp`): `colDragStart(v, ev)`, asked by `EditMouse`'s drag handler after `PicDrag`: a Select drag (no Shift, no Ctrl, no painter) from a `'col'` or `'right'` edge (a `'row'` one is `rowDragStart`'s) follows the pointer with `wimp.drag({type: 'point'})`, `v.tblGhost = {x, y, h}` (the dashed line `EditPaint` draws), `v.tblDrag = {cancel()}` (Escape: `EditKeys`); the document changing (`d.stateId` at the press and every move) ends it with a beep; on release `dragGrid` and `colDragCmd` in `v.typing.command` (fitW and the style's tblW, `it.key.view.tblPr.tblW`, for the right edge), `v.edited`; none back at the start; a window closed mid-drag ends it with no beep |
| `TblPos` | Batch C, pure (C3 fix wave, review C3a I1): caret places in tables, found in the Doc. `firstPos(t)`, `lastPos(t)` (the start of the first paragraph, the end of the last, in flow order, nested tables entered, vMerge continue cells passed), `cellPos(t, r, k)` (the start of a cell's first paragraph; a continue cell gives its merge's restart cell), `rowPos(t, r)` (its first shown cell's); `contOf(doc, at) -> {tp, r, k} \| null` (the OUTERMOST continue cell the block at path `at` is in, given as the table's path and the merge's restart cell; null when shown), `shown(doc, pos)` (pos, or the start of that restart cell). A continue cell's blocks stay in the flow (D9 ranks) but are never drawn or hit, so no key, command or caret restore leaves the caret there: `SelVert.step` passes them, `Selection.clamp` maps to the restart cell |
| `RangeOps`, `RangeTbl` | Batch C, pure (D10, TB11, C3.4): deleting a range. `RangeOps` holds the ops `EditRange` (top level) and `RangeTbl` share: `cutOut(d, at, a, b)`, `putPara(d, at)`, `mergeAt(d, a, b)` (the merge rule, re-exported by `EditRange`), `removeTop(d, f, t, lo, hi)` (the top-level blocks k = lo..hi, one `removeBlocks` per section, paths from the locations' top-level paths: a location in a cell counts as its outermost table), `fillEmpty(d, s0, s1)`, `apart(d, at)` (C7 fix A1: where a range's blocks were removed, an empty paragraph when the blocks before and at `at` are both tables, typed or Opaque (`TblCheck.endsCell`); `EditRange` (top level, both ends kept blocks) and `RangeTbl.span` (every container) call it, so a deletion never leaves two `w:tbl` touching: Word would read them as one). `RangeTbl.deleteIn(d, o)` (`EditRange.deleteRange` for a range with an end in a cell, by `SelShape`'s shape: `cells` -> the cells cleared (`clearCells`), the caret at the top-left cell's start; else ONE container (the deepest cell holding both ends' blocks, or the body): the ends cut and merged, the blocks between removed, a table an end is in losing the rows from that end's row to its edge toward the other end (`deleteRows`; all of them: the table goes), a table spanned whole, a nested table's two edges that table; a cell the range would empty gets a paragraph first, one left ending with a table one at its end; the caret at `from`'s paragraph, else `to`'s start, else the block after (a table cut from its start: its first paragraph), else the end of the one before; an end in a table its shape does not take: RangeError before any op, the C1.5 refusal), `backCells(d, sh, o)` (Backspace over a `cells` shape not the whole table: rows removed when it spans every grid column, else cleared). Bookmarks: the marks of the paragraphs deleted or cleared (`SelShape.paraRanges`; rows of a table an end is in included; a table taken whole: all its marks, loose ones and nested tables' too, by `BookmarkKeep.tableMarks`, C7 fix A2) whose partner is still in the document afterwards go back at the caret (`BookmarkKeep.stillPaired` + `putMarks`) C6 fix B3: clearing a cells shape (Delete, Backspace that does not take whole rows) keeps marks by `BookmarkKeep.putAround` (starts at the start of the first cell, ends at the end of the last). C6 fix (found by `clip-tables-fuzz.test.mjs`): a range from one table into another in the same container (rows cut from each, the blocks between gone) leaves an empty paragraph between the two tables, the caret in it (D27: before, they were left touching and Word joins them). Final fix wave (final-1 I2): when the marks put back at the caret are kept, the top-level table holding the caret is passed through `TblPairs.endsAfter` against the pairs reversed before the deletion (`reversedIds(BookmarkFind.marks(doc))`, taken only when the range holds marks): a range from one table's cell into a later table's cell moved the later table's removed rows' marks to its first row's lead and put their partners at the caret after it, so a pair was written end before start. |
| `EditRank` | Batch C, pure (D9, D20, C3.4): what `EditPos` counts ranks and finds ids with, per object: `idOf`, `isTbl`, `sizeOf(b)` (a table: its start, every block in its cells, nested tables' two each, its end), `holds(t, id)`, `rowSize(row)`, `rowHolds(row, id)`. A table's facts are its rows' (each row walked once per row object), so after an edit in a cell only that row is walked again; `EditPos.findBlock` / `atRank` pass whole rows that do not hold the id / rank (a lookup in row 500 of a 1000 x 5 table: 0.03 ms, was 0.2 ms with the memo and 0.8 ms after an edit) |
| `TblBorders` | Batch C, pure (D22, C2.5): `edgesOf(it, map, r0?, r1?) -> {h, v, diag, own, box}` the resolved lines of a laid-out `'tbl'` item's rows r0..r1 (x from the table's left; only drawn sides): `h[r]` `[{x0, x1, side}]` at the top of row r (r = rows: the bottom), `v[r]` `[{x, side}]`, `diag[r]` `[{k, tl2br, tr2bl}]`, `own[r]` each cell's own four sides in a row with cell spacing, `box` the table's outer box with cell spacing. A cell side: its `tcBorders`, else the style's conditional / whole-table `tcBorders` (a part's region is the cells having its condition: between two of them its `insideH` / `insideV`), else the table's `tblBorders` (outer sides / inside; direct over the style's); nil stops. Shared edges: `TblConflict`. Themed sides by their literal colour (`shown`, `TblColor.showThemed` memoised per part). Memoised on the row geometry `geo` (a line between rows on the pair). `sidesOf(it, r, k, map)`; re-exports `weightOf`, `conflict`, `PRECEDENCE` |
| `TblConflict` | Batch C, pure (D22, ECMA-376 17.4.66, C2.5): `weightOf(side)` (sz eighths 2..96, else 4, x lines: double and thinThick/thickThin 2, triple 3), `conflict(a, b)` (heavier; then `PRECEDENCE`, D22's list; then the darker colour R + B + 2G, auto black; then a: the cell above / to the left; nil / none lose), `drawn`, `norm`, `PRECEDENCE` |
| `TablePaint` | Batch C, pure (D21, C2.5): `paintTable(L, g, it, rect)` draws the rows of a `'tbl'` item meeting rect (binary search on its tops; `it.painted = [r0, r1]`): the table's shading, each cell's (its own `tcPr` shd, else its layer's; fills on whole pixels, no seam), the cell columns' items (paragraphs with their own border boxes and shading, pictures, kept blocks as the grey box, nested tables by itself; a merged cell starting above rect too), clipped to the cell box when the cell is clipped; then the `TblBorders` lines through `BorderResolve.edgeOf` / `BorderPaint.edge` (centred on the line, joins square), diagonals as single lines, cell spacing's own sides and outer box; a floating table (`w:tblpPr` kept in `extra`) a 1 px dashed `[4, 3]` `#606060` outline. `DocPaint` calls it for a `'tbl'` item |
| `WriteBody WritePara WriteProps WritePropsMore WriteStyles WriteParts` | the model -> XML writers (`WriteBody`: a typed table through `TblWrite.tblNode`; a section ending with one gets the carrier paragraph, as after any non-paragraph; `WriteProps.fields(o, table, what)` the field elements, shared with `TblWriteProps`; `WritePropsMore`: `w:tabs` in model order, `sidesNode(name, names, v, strict)` any border element's sides in the order of `names` (`pBdrNode` is it over the pBdr sides), `w:shd`, `w:type`; attributes in Word's order, booleans `1`/`0`); `WriteParts`: content types (`contentTypes(ct, names, known, fix)`), rels, zip order, XML declaration |
| `PartTypes` | `typeForRel(type)` (the content type a part reached by that relationship type must have: Transitional, Strict and Office 2010+ kinds), `repairs(ct, sources, has)` (the parts to retype, see below) |
| `Order`, `OrderP OrderR OrderTbl OrderSect` | child order of pPr, rPr, tblPr, tcPr, trPr, sectPr (tables checked against `wml.xsd`); `sortChildren(parent, children)` |
| `PicRead` | (pure; Batch B) what a picture's `w:drawing` says: `pictureOf(node, map = PIC_SCOPE) -> {embed, cx, cy, alt, name, docPrId, floating, srcRect?, supported} \| null` (frozen, cached per node in a WeakMap). Understood ONLY: a `w:drawing` whose one element child is `wp:inline` / `wp:anchor` (`floating`) holding one `wp:extent` (`cx`, `cy` decimal integers 1..`MAX_EXT` = 2147483647), one `wp:docPr`, and `a:graphic/a:graphicData[uri=picture]/pic:pic/pic:blipFill/a:blip` with `r:embed` and no `r:link`; everything else (VML, `mc:AlternateContent`, charts, shapes, linked pictures, hostile extents) is null and stays a box. `alt` = `descr` or `''`; `docPrId` an integer 0..2^32-1 or null; `srcRect` `{l, t, r, b}` (1/1000 %, absent ones 0) only when each given value is an integer in -100000..100000 and `l + r`, `t + b` < 100000 (Strict documents also `12.5%` -> 12500); `supported` = `pic:spPr/a:xfrm/a:ext` present (plan R2: resizable). Prefixes resolved with `Ns.scope`, never fixed. `docMap(doc)` = `WriteBody.docScope(doc).map` cached per `meta.documentRoot` (`PIC_SCOPE`, binding `w wp a pic r`, without a root); `EMU_PX` = 9525 |
| `PicMedia` | (pure; Batch B) a picture's bytes, type, size and dpi: `mediaOf(doc, embed) -> {bytes, mime, name} \| null` (the main part's relationship `embed`: kind `image`, Transitional or Strict, not External, its part in `doc.parts` via `resolvePart` / `findPart`; `mime` `'image/png' \| 'image/jpeg' \| 'image/gif'` by magic bytes only, else null; the id lookup Map cached per `doc.rels` array); `imageInfo(bytes) -> {mime, ext, w, h, dpiX, dpiY} \| null` from the headers (PNG IHDR + `pHYs`, JPEG SOFn + JFIF hopping up to 512 segments, GIF screen and first frame with its offset, `w`/`h` the larger; never throws; dpi per axis, 96 when absent, 0 or above 10000; a PNG's whole pixels per metre are read as the whole dpi within 0.02 of it, so 11811 is exactly 300); `decodable(info, bytes) -> null \| 'too-big' \| 'too-large' \| 'not-image'` (`MAX_BYTES` 20 MB, `MAX_SIDE` 16384, `MAX_PIXELS` 64 Mpx, decided from the header before any decode); `naturalEmu(info) -> {cx, cy} \| null` (null when a side would be under 1 or over `MAX_EXT`) |
| `PicLine` | (pure; Batch B) a picture in the line layout: `picToken(x, i, f, map?) -> token \| null` (`LineTokens`' token for an inline `pictureOf` understands: `{t: 'w', text: '', f, kind: 'pic', from: i, to: i + 1, shown: true, pic: {info, w, h}}`, w and h the extent in px, `cx / EMU_PX`), `fitPic(pic, maxW) -> {w, h}` (plan R3: scaled down proportionally to `maxW`, then to at most `ParaSpace.MAX_LINE` 2112 px high, each side at least 1 px; the file keeps its extent). `LineLayout` uses both: "LineLayout: the rules" |
| `PicCache` | (browser globals only, no `riscos`; Batch B, plan R4) the program's decoded pictures: `createPicCache({decode, maxCount = 32, maxBytes = 134217728, recent = 1000, now = performance.now}) -> {get(bytes, mime, info, onReady?, want?) -> {state: 'ready', bitmap} \| {state: 'pending'} \| {state: 'deferred'} \| {state: 'failed'}, stats() -> {count, bytes, pending, decodes}, clear(), forget(bytes)}` (`forget`: the bitmap of those bytes closed and the entry dropped; a decode still running closes its bitmap when it ends). Decoded at about the size shown: `want` is the longest side the whole picture is shown at in device px (zoom and pixel ratio in), and `bucketOf(info, want)` the power of two from 32 up that holds it, at most the picture's own longest side and `MAX_DECODE` 4096 (no `want`: its own size); `decode(bytes, mime, info, opts)` gets `decodeSize(info, bucket)` (`resizeWidth/resizeHeight`, proportions kept, `resizeQuality: 'medium'`, or null at its own size); the default is `createImageBitmap(new Blob([bytes], {type: mime}), opts)`. So six phone photos shown 1.5 in wide take 256 x 192 x 4 bytes each, not 48 MB. Entries in a WeakMap by the bytes object (one picture per part); a ready picture asked for at a bigger bucket than it has is decoded again once (the small bitmap answered meanwhile, the bigger one replacing it and the small one closed); a smaller one is served by what it has. The first `get` starts the one decode; each `get` while it runs adds its `onReady` (a Set), each called once when it ends, well or not; a failed decode (rejected, or `decode` throwing) is remembered and never retried. Bitmaps are in an LRU list of `{ref: WeakRef(bytes), bitmap, size}` (`size` = width x height x 4); over `maxCount` or `maxBytes` the oldest are `close()`d and forgotten, first any whose bytes were garbage-collected (a closed document), but never one asked for in the last `recent` ms (it is in view: closing it would decode it again on the next redraw, every frame, as with more than 32 pictures in view at 10%) nor the newest alone. The caps are therefore soft: while pictures are in view the cache may hold any number of bitmaps and up to twice `maxBytes`; a timer (`recent` ms, armed while over a cap or while something waits, cleared by `clear()`) trims back to the caps once they are out of view, with no new decode. No decode starts while the bitmaps held plus those coming (sizes from `info`) would pass twice `maxBytes`: `get` answers `deferred`, keeps its `onReady` and calls it after the next timed trim (PicPaint shows 'Loading picture...' meanwhile). `clear()` closes all; a decode still running then closes its bitmap when it arrives. `CACHE` is the one cache; `picView(onReady) -> {get(bytes, mime, info, want?)}` is a window's view of it (`AppWin`: `dw.pics`, whose `onReady` invalidates the window only while it is open). The cache decodes what it is asked: callers check `PicMedia.decodable` first |
| `PicPaint` | (pure; Batch B) `paintPic(L, g, item, left, base)` draws a line item of kind `pic` (`DocPaint` calls it, before its empty-text skip), its box `{left, base - h, w, h}` (`item.pic.w/h`, the fitted size): with `L.pics` and media `mediaOf(L.doc, embed)` that `decodable` accepts, `L.pics.get(bytes, mime, info)`; `ready` -> `drawImage(bitmap, sx, sy, sw, sh, left, top, w, h)`, the source cut by `srcRect` (each edge / 100000 of the bitmap's size, negative edges as 0; uncropped when what is left has no width or height, e.g. `l=-50000 r=100000`); it asks for `want` = the whole picture's longest shown side (the box divided by what the crop leaves) x the scale of `g.getTransform()` (zoom x devicePixelRatio, 1 without); otherwise a box outlined `#a0a0a0` (1 px) with the alt text, or failing that the label (`LABEL`): `missing` 'Picture missing' (no media), `unsupported` 'Picture not shown: ' + the part's extension in capitals (not PNG/JPEG/GIF by magic bytes, a header `imageInfo` cannot read, or a failed decode), `large` 'Picture too large to show' (`decodable` 'too-big' / 'too-large'), `loading` '' (pending), `waiting` 'Loading picture...' (`deferred`: no room in the cache yet), in 11 px sans-serif `#606060`, clipped to the box. A floating picture also gets a dashed outline (`setLineDash([4, 3])`, `#606060`, 1 px) just outside its box, bitmap or not. Media that `decodable` refuses is never passed to `get`. `imageInfo` is worked out once per bytes object (WeakMap) |
| `PicEdit` | (pure; Batch B) copies of a picture's `w:drawing` node: `withSize(node, map, cx, cy)` (`wp:extent` and `pic:spPr/a:xfrm/a:ext` `cx`/`cy` only, never an `a:ext` of an `a:extLst`; integers 1..`MAX_EXT` else RangeError `'range'`), `withDescr(node, map, text)` (`wp:docPr descr` replaced in place, else appended last; `''` removes it), `withDocPrIds(node, map, next)` (every `wp:docPr id` at any depth of any node, `mc:AlternateContent` included; one old id -> one new id, `next()` called once per old id), `withEmbed(node, map, embed)` (the picture's `a:blip r:embed` only). Each returns a NEW node sharing every untouched subtree, the old one never changed, the SAME node when nothing changes; `withSize`/`withDescr`/`withEmbed` touch only what `pictureOf` understands; every other attribute and child and attribute order kept. Elements found by URI in `map` plus each element's own `xmlns` |
| `PicFind` | (pure; Batch B) `picAt(L, x, y) -> {pos: {id, off}, item, line, pi, rect: {x, y, w, h}} \| null` (layout point; `item` the `pic` line item, `line` its line, `pi` its paragraph's `L.items` entry, `rect` its box standing on the baseline as `PicPaint` draws it), `selectedPic(L, sel)` (the same when `sel`, either way round, covers exactly `[off, off + 1]` of a picture), `handleRects(rect, zoom) -> [{name, x, y, w, h}]` (`nw n ne e se s sw w`, 7 screen px, i.e. `7 / zoom` in layout), `handleAt(rect, x, y, zoom) -> name \| null` (hit within 5 screen px around a handle; overlapping ones: the nearest, a corner first; a zoom not above 0 counts as 1). Only top-level paragraphs are laid out, so only their pictures are found |
| `PicSize` | (pure; Batch B) `dragSize(start: {w, h}, handle, dx, dy, {free}) -> {w, h}` (edges change one side; corners keep the aspect ratio unless `free`: the side whose relative change is the larger leads, so the corner stays on the pointer along that axis (as Word); each side at least 1 px; a bad handle or move gives `start`), `pxToEmu(px)` = `round(px x 9525)`, `MIN_EMU` = 9525 (15 twips), `MAX_EMU` = 20116800 (22 in) |
| `PicOps` | (pure; Batch B) `setPicture(d, sel, {cx?, cy?, descr?}) -> sel`: the picture `sel` covers (exactly its U+FFFC, either way round) gets the new size (`PicEdit.withSize`) and alt text (`withDescr`) by ONE `replaceText {del: 1, ins: OBJ, inlines: {0: {...x, node}}}` in `d.atomic` (the run's format kept); returns the picture selected again (anchor at its offset). Only what differs is checked and changed, all checks before any change: RangeError `'floating'` / `'unsupported'` for a new size of a `wp:anchor` picture / one without `a:xfrm` (plan R12, R2), `'range'` for a new `cx`/`cy` not an integer in `MIN_EMU..MAX_EMU`, `'alt'` for a `descr` not a string, over 1024 (`MAX_ALT`) or with a control character (U+0000-001F, U+007F-009F). Nothing different, or a selection that is not a picture: `sel` back, no step. The caller wraps it in `typing.command` (B3.2 drag, B6 dialog). `stepSel(doc, ops) -> sel \| null`: after an undo or redo whose last op applied (compounds opened) is a `spliceText` putting a picture's U+FFFC in place of one character or of nothing (a resize undone or redone, a deleted picture given back), that picture selected (`EditView` uses it before `EditApply.stepEnd`'s caret) |
| `PicDrag` | (desktop: `wimp`, `os`; Batch B) the mouse on pictures, asked first by `EditMouse` (true: used). `picClick(v, ev)`: a Select click (no Ctrl) on a handle of the selected picture (`PicFind.handleAt` at `v.zoom`) keeps it selected (Shift too: a drag may follow); one without Shift on a picture (`picAt`) selects its U+FFFC. `picDragStart(v, ev)`: a Select drag from a handle of the selected picture; floating or unsupported: `wimp.beep()`, no drag; else `wimp.drag({type: 'point'})`, `v.picGhost = {x, y, w, h}` (layout px, the far side kept; `PicSize.dragSize`, Shift read live from `os.input.keysDown` frees a corner), `v.picDrag = {cancel()}` while it lasts (Escape: `EditKeys`); on release `v.typing.command(() => setPicture(v.d, sel, {cx, cy}))` + `v.edited` (one step; none when nothing changes; RangeError: a beep). The file's extent changes as the box does (`cx * new w / old w`, `cy` likewise), so a picture shown smaller than its extent (fitted to the column) keeps its proportions; each side within `MIN_EMU..MAX_EMU`; an edge keeps the other side's extent exactly; a corner without Shift keeps the extent's proportions with one factor, limited so that BOTH sides stay in range (the larger side derived from the smaller: within 1 EMU; no factor fits: a beep); the ghost shows that extent; back at the start (equal extent): no step. The document changing (`d.stateId` differs from the press) or the picture no longer selected (Delete, Ctrl-Z, typing during the drag) ends the drag at once with a beep, nothing put in. `picDouble(v, ev)`: a Select double-click on a picture selects it and calls `v.onPicture?.()` (B6). None acts while the format painter is on (`v.painter`) |
| `PicIds` | (pure; Batch B, plan R8) `usedDocPrIds(doc) -> {max, ids: Set}`: every `docPr` id (by local name, any prefix; attribute `id`, decimal, at most ten digits) of the main part (every paragraph's inline nodes at any depth, `mc:AlternateContent` branches, kept blocks, `meta.beforeBody`/`afterBody`; typed tables' paragraphs and kept cell blocks through `Walk.scan`, C1.6) and, by a text scan (UTF-8, `fatal: false`: each start tag `/<(?:[\w.-]+:)?docPr\b([^<>]*)/g`, ended by the first `<` or `>` so the scan is linear even over 128,000 unclosed `<docPr `, then its own attributes one by one, double- or single-quoted: the first named `id`, so an `id='N'` inside another attribute's value is not taken), of the header, footer, footnotes, endnotes and comments parts in `doc.parts` (named by the main part's relationships of those kinds, or by their file name); `max` the largest below 2^31 (ids of 2^31 and more are in `ids` but ignored for `max`, so one odd id cannot block inserts). Cached per paragraph / block object and per bytes object (WeakMaps), so a 5 MB header is decoded once. `freshDocPrId(used)` = `max + 1`, RangeError `'ids'` when that reaches 2^31 |
| `InsertPicture` | (pure; Batch B, plan R21) `insert(d, sel, {bytes, L?}) -> sel` (`L` the window's layout: in a table's cell the picture is no wider than the cell's text width, its column's `w` x 15 twips, C3 fix wave; `PicLoad` passes `v.L`): refused first, nothing changed (RangeError): `'not-image'` (not a `Uint8Array`, or not PNG / JPEG / GIF by `PicMedia.imageInfo`), `'too-big'` (over 20 MB), `'too-large'` (over the decode caps, or no size in range), `'ids'` (`PicIds`), `'no-package'` (no `meta.mainPart` / `documentRoot`), `'name'` (no media name free: a main part in a folder too long for one; the search is bounded); a position not in the document: `sel` back. Size (plan R18): `PicMedia.naturalEmu`, else (null: a tiny dpi) the 96 dpi size; then scaled down, proportions kept, to the caret's section's column (`pgSz.w` less `pgMar.left`/`right`, A4 and 1 in when absent, less `cols.space` (720 default) between `cols.num` equal columns), at most 6.5 in wide and at most 9 in tall (both sides together); `'too-large'` when the width would fall below 15 twips (a 1 x 16384 px picture). Media name (plan R6): `<main dir>media/imageN.<png\|jpeg\|gif>` by `PicNames` (the rule a paste follows): N the first number from 1 that no part, content-type Override or relationship target names as `imageN.*` (case ignored, as Word numbers them; a relationship whose part is missing keeps its name, and its rId stays its own: `DocParts.freshRelId` is unique over `doc.rels`) and `OpsDoc.newPartFree` takes, at most `max(used + 2, 1024)` tried. Then ONE `d.atomic`: `setDocPart parts` (a new Map with the bytes object itself), `setDocPart rels` (`DocParts.addRel` kind `image`, target `media/imageN.ext`, the Strict type in a Strict document), and the inline `{kind: 'raw', level: 'r', node}` by `InsertApply.putIn` (the selection deleted, a paragraph at a kept block's edge, the run format of the text before). Returns the picture selected (anchor before it). `pictureXml({cx, cy, id, rid, file}, pre?)`: Word's `w:drawing` / `wp:inline` (dist 0, `wp:docPr id name="Picture id"`, `a:graphicFrameLocks noChangeAspect`, `pic:cNvPr id="0" name=file`, `a:blip r:embed`, `a:stretch/a:fillRect`, `a:xfrm` off 0 and ext = extent, `prstGeom rect`). Prefixes: one the root binds to the (Transitional, in memory) URI, else `wp`, `a`, `pic`, `r` (or `a1`... when the root binds that prefix elsewhere) declared on `wp:inline`, `a:graphicFrameLocks` and `a:graphic`, `pic:pic`, `a:blip`; the writer maps them to Strict for a Strict document |
| `SectWidth` | (pure; C4 fix wave) `columnTw(props)`: a section's text column in twips (page width, A4's 11906 by default, less the left and right margins, 1440 each by default, less the `w:cols` spaces, 720 each by default, divided by the columns): the one rule `InsertPicture` (a picture no wider than the column) and `TblInsert` (an Auto table's width outside a cell) size by |
| `ClipPics` | (pure; Batch B, B7, plan R14, R15) pictures pasted between documents. `picsOf(doc, blocks) -> Map embed -> {bytes, ext}` (`ClipSlice.slice` puts it in the slice as `pics`, with `picScope` = `PicRead.docMap(doc)`; `ClipStore` keeps both, `ClipPick` passes them in the exact route's opts): each embed of a picture `pictureOf` understands whose part `PicMedia.mediaOf` finds, at most 20 MB (`MAX_ONE`), its part name's extension in `EXTS` (`png jpeg jpg gif bmp tif tiff emf wmf svg`, lower-cased and kept); at most `MAX_PICS` = 1000 embeds and `MAX_PIC_BYTES` = 200 MB per slice, the rest left out (their pictures dropped). `picKept(x, pics, from, doc)` (for `ClipClean.cross`): a picture read in `from` whose embed is in `pics`, whose `a:blip r:embed` is its ONLY relationship reference (`PicCarry.onlyEmbed`: any attribute in a relationships namespace by URI, any prefix, any depth; so a picture with an `asvg:svgBlip`, an `a14:imgLayer`, an `a:hlinkClick`/`a:hlinkHover` or an `r:link` is dropped across documents, R15; a same-document paste keeps it as it is), into a doc with a package, and still a picture once rebound to the target's namespaces (else dropped). `copyPics(doc, blocks, pics, from) -> {ops, blocks}` (in `ClipPaste`'s `d.atomic`, after the lists' ops): per source embed one new part `<main dir>media/imageN.<source ext>` (`PicNames`: N first free over every `imageN.*` a part, a content-type Override or an internal relationship's target names, case ignored, `OpsDoc.newPartFree`; at most `max(used + 2, 1024)` tried; the source's bytes object) and one relationship (`DocParts.addRel` kind image, Strict type in a Strict target); each inline's node `PicCarry.rebind`-ed (an `xmlns` declaration on the `w:drawing` for every prefix it uses that the target's root binds otherwise or not at all, the source's URI: so it reads the same in the target, and the writer maps it to Strict there), its `a:srcRect` in the target's form (`PicCarry.withCrop`: Strict `12.5%`, Transitional `12500`, converted only between a Strict and a Transitional document; a crop `PicRead` does not take is removed), then `PicEdit.withEmbed` (the new rId) and `withDocPrIds` (fresh: `PicIds` max below 2^31 plus one, each new); ops `setDocPart parts` (a new Map) then `rels`, none without a picture. `freshDocPrs(doc, blocks, next?)`: a same-document paste gives every `wp:docPr` id in the pasted raw inlines (pictures and other drawings, any depth) a fresh one, one old id per inline -> one new id (Choice / Fallback agree); media and relationship shared. `samePaste(doc, blocks, pics, from) -> {ops, blocks}` (what `ClipPaste` runs for a same-document paste): `stalePics` first finds the pictures whose embed no longer gives the bytes the copy held (an undo since the copy took their part or relationship away, or a later insert gave the rId to other media); those are carried as across documents (`copyPics` with only them: a new part and relationship from the clipboard entry's bytes), then `freshDocPrs`, one id counter for both (`next`). So insert, Ctrl-C, Ctrl-Z, Ctrl-V never writes a dangling `r:embed`. RangeError `'ids'` / `'name'` (nothing free): `EditClip` pastes the text instead, or, with no text (a picture alone), says `PicLoad.MSG.pasteFree` ("This picture could not be pasted: no free name or id.") |
| `PicNames` | (pure; Batch B final review) the one media-name rule of `InsertPicture` and `ClipPics`: `usedNumbers(doc, dir) -> Set` (the N of every `<dir>media/imageN.*` a part, a content-type Override or an internal relationship's target names, case ignored), `mediaName(doc, dir, ext, used)` (the first free N from 1, `OpsDoc.newPartFree`, at most `max(used.size + 2, 1024)` tried, else RangeError `'name'`; N added to `used`) |
| `PicRelease` | (browser globals only through `PicCache`; Batch B final review) `releasePics(doc, others, cache = CACHE)`: `CloseDoc.destroy` calls it with the closed document and the Docs still open; each part's bytes that no open document holds (the same object) is `forget`-ten, so a closed window's bitmaps go at once rather than at the next decode after garbage collection; bytes a paste shares with an open document stay |
| `PicCarry` | (pure; Batch B, B7 review) a picture's node made fit for another document, for `ClipPics`: `rebind(node, from, to)` (above), `onlyEmbed(node, map)` (the blip's `r:embed` the one attribute in a relationships namespace, `NS.r` or a URI ending `/relationships`, by scope, any depth), `withCrop(node, from, to)` (srcRect values converted, invalid or repeated srcRect removed, other attributes kept) |

The application

| module | what |
|---|---|
| `!RunImage` | start-up (single instance), opening files, DataOpen / PreQuit (`Quit.preQuit`) / Quit (unconditional) messages, `app` (`docs` keyed by `keyOf(path)` = canonical path lower-cased, `'?name'` for a name that does not parse, `'untitled:N'` for an untitled document, so the three never collide; `rekey(dw)`; `newDoc({paper})` (A4 unless `'letter'`); `noteRecent(path)` (after a successful open and save); `recent` (the cached list); `prompt`, `closing`), `loadRecent` at start; the icon is `IconBar`, the `task.word` test hook `TestHook` |
| `SaveState` | (pure) `untitledName(taken)` ('Untitled', 'Untitled 2'... the first free, case ignored), `safeLeaf(name)` (what a vfs leaf cannot hold left out: the window 'Untitled 2' is saved as `Untitled2`, since `vfs._validLeaf` refuses spaces, hard spaces included), `leafOf`, `dirOf`, `defaultDir(recent)` (the directory of the newest full path, else `HOME` = `ADFS::HardDisc4.$`), `suggestName(dw, dir)` (the path, or `dir.safeLeaf`) |
| `DocSave` | (desktop) `save(dw)` (titled: write in place; untitled: open the Save as box centred, resolves true only after a save from it, false when it is closed without), `saveAsTo(dw, path)` (errors reported by `reportError`, false), `writeTo(dw, path)` (throws: the Save box reports), `canWrite(dw, path)` (refuses the file of another open window), `saveBox(dw)` (the cached Save as box: a full path, so OK works (an untitled document's is a name no file has: `SaveState.suggestName(dw, dir, exists)`), its `save` is `writeTo`, OK guarded by `Replace.guardOK`), `commitComposition(view)` and `notSaved(name, e)` (the Error "'name' could not be saved: why" that a failed `writeDocx` or `vfs.writeFile` becomes; both exported for `CopySave`); a written file goes to `app.noteRecent(full)`. The saved-state rule: commit any composing text (`wimp.textInput.blur()` then `view.input`), `breakCoalesce()`, take `stateId`, `await saveBytes()` (`writeDocx` builds the parts before its first await, so the bytes are that state), check `canWrite` again, `vfs.writeFile(path, bytes, {filetype: 0xA7E})`, and only then `markSavedAt(id)`, rename (title, `path`, `leaf`, `rekey`, the Save as box's name, the Save a copy box's full path, Info's `file` icon) and `retitle()`. The saves of one window are serialized (`writeTo` chains on the previous save's end, the first starts synchronously so its state is the one at the call): a slower earlier save can never overwrite a later one's file, rename the window back or move the saved marker back. One pending `save()` promise per untitled window (`waiting`): Save again returns it and leaves an open box's typed name alone; it resolves true from the box's `save`, false when the box closes and stays closed (checked in a microtask: if the box is open again, nothing; if a menu tree of the task is open, the menu was opened again over it, so check again on `MenusDeleted`; deleting the box is false). `onSaved` puts the canonical path back in the box (the core's `saveAs` shows the name as typed after OK). `bytesOf(dw)` is `dw.saveBytes()` (`writeDocx`, errors name the file). `idle(dw)` (the queue's end) and `saving(dw)`. Save on a titled document passes `path = null` so the queued save takes `dw.path` when it RUNS (Save while a Save as is writing saves under the new name). A window closed while its save was writing: the file is written and remembered, but the dead window is not marked, renamed, retitled or re-keyed (`app.rekey` also ignores a closed window). `writeTo` notes `d.stateId` when the save is ASKED; a queued save whose turn comes after its window was closed with changes made since (Discard) writes nothing and resolves `null` (`saveAsTo` false): the discarded edits never reach the file; the Save box's `save` then returns without settling a pending `save()` (only a written file settles it true). Committing composing text also sets `view.lateCommit = {text, at}`: `EditInput` drops the input method's own later commit of that text (the next `textinput`, if equal, within 800 ms, with nothing in between), so the text is typed once |
| `CopySave` | (desktop) `copyBox(dw)`: Save a copy, a cached `saveAs` box offered a full path (the document's, or a free name for an untitled one; set to the new path on a rename); its `save` refuses another open window's file (`canWrite`, before and after the bytes), commits composing text, writes `dw.saveBytes()` with type &A7E (a failed write is `DocSave.notSaved(leaf, e)`, "'leaf' could not be saved: why", as Save says it); OK guarded by `Replace` (asks even over the window's own file); nothing in the window changes |
| `Replace` | (desktop) `guardOK(box, task, skip)`: `first` handlers on the Save box's OK click and Return: a full path to an existing, unlocked file that `skip` does not excuse (Save as: the window's own file or another open window's file, refused anyway) asks `Ui/SaveQuery` "'leaf' already exists. Replace it?" Replace / Cancel with `enter: 'Cancel'` (Return and Escape both Cancel: the core `query` makes Return the first button, so it is not used); Replace re-sends the OK click, let through once; Cancel puts the caret back in the box's name. A drag of the box's icon goes straight to the core's save (no question, documented). `samePath(a, b)`; `questionOf(box)`: the window of the box's Replace question while it is open (a WeakMap box -> the `saveQuery` promise), else null: `Quit` brings it forward over the box (the question does not set `app.prompt`) |
| `CloseDoc` | (desktop) `requestClose(dw)` (close icon, Close): clean -> `destroy`; dirty -> `Ui/SaveQuery` "'leaf' has changes that are not saved." Save -> `await dw.save()`, closes only if true and not dirty again; Discard -> `destroy`; Cancel -> the focus back to the view; re-entry per window ignored while asking or saving; while another window's prompt is open the request brings that prompt to the front and beeps; a failed Save (reported by `saveAsTo`) or a document changed during the Save (`reportError` "... changed while it was being saved: it has not been closed.") keeps the window and gives the view the caret; the name in messages is cut to 40 characters (`shortName`); `app.prompt = {dw, buttons, win}` while open; `app.closing` is the promise of the `requestClose` asking or saving (`Quit` waits for it); while the quit prompt is open (`app.prompt.dw` null), or Revert's question (`askRevert`: the core `query` window found as the task's new window, set as `app.prompt` while open), a close request brings it to the front and beeps; a prompt that cannot open (`saveQuery` throws) is reported ("'leaf' was not closed: ...") and the window kept, no rejection. `revert(dw)`: first `await idle(dw)` (Revert after a Save as still writing reloads what was saved); untitled -> false (menu item shaded); dirty -> core `query` "Discard changes to 'leaf' and reload it?" (Discard / Cancel); `stateId` noted, `openDocx(vfs, path)`; failure -> `reportError(describe(e, leaf))`, old document kept; changed while the file was read (stateId moved) -> gives up quietly, the typing kept. The reloaded document gets a **new `DocWindow`** (`new dw.constructor(...)`, so no import of `AppWin`) opened with the old window's `getState()` (position, size, scroll) `behind` the old one, ruler and zoom copied, focus given if the old view had it, then the old one is `destroy`ed and `app.docs` re-keyed to the new one; fonts via `app.fonts(doc)` then `relayout`. Swapping the Document inside the window was not done: the view, typing, toolbar, ruler, zoom and listeners all hold the `Document`. `destroy(dw)` (= `dw.close()`, forced: tests, Quit): view, toolbar, ruler, zoom, boxes, window, its decoded pictures (`PicRelease`), `app.closed`; `dw.closed` |
| `Recent` | (pure) `MAX` 8; `clean(list, keyOf, max)` (strings with ':' or '$', <= 1024 characters, no control characters; first of each `keyOf`; a throwing `keyOf` drops the entry; non-arrays -> `[]`; stops at `max`, so 10,000 entries are cheap), `add(list, path, keyOf, max)` (path first, a new list), `fromChoices(c, keyOf)` (own `recent` only: missing / corrupt / `__proto__` choices -> `[]`), `shown(list, exists)` (exists may throw), `labels(list)` (leaf names; leaves that clash: the path cut to its last 40 characters) |
| `RecentFiles` | (desktop) `loadRecent(app)` (`WordChoices.loadChoices`, its `recent` key cleaned into the `app.recent` cache; `app.recentReady`), `noteRecent(app, path)` (canonical path first, keyed by canonical lower case, files that no longer exist dropped, `WordChoices.setChoice(app, 'recent', list)`: the other keys of Choices:Letters kept; waits for the read; a failed write is a `console.warn` only, never breaks a Save), `recentItem(app)` (the menu item: shaded with nothing to show; the submenu built synchronously from the cache, missing files hidden, each entry -> `app.open`, which raises an open window) |
| `Quit` | (desktop) `changed(app)`, `quitMessage(n)` ('1 document has unsaved changes.' / 'N documents have unsaved changes.'), `mustAsk(app)` (sync: dirty documents, `app.closing`, or a quit prompt running), `mayQuit(app)` (one promise at a time; waits for an open close prompt (brought to the front; with no prompt open, a Save as box a close prompt's Save waits on is brought forward, and over it its Replace question when that is open: `Replace.questionOf`, so a Quit never hides the question under the box) and counts again: nothing left dirty -> true without asking; else `Ui/SaveQuery` Discard / Cancel, Return = Discard as in !Edit, Escape / close icon = Cancel; `app.prompt = {dw: null, quit: true, ...}` while open), `quit(app)` (the menu's Quit: at once when `!mustAsk`; Discard -> every window `destroy`ed, `task.quit()`), `preQuit(app)` (the handler: `msg.object()` synchronously when `mustAsk`, then `mayQuit`; Discard -> windows destroyed, `task.quit()` if `msg.single`, else `wimp.emit('hotkey:CtrlShiftF12')` to restart the closedown, which then finds nothing to ask; at most once per answer: two PreQuit-all messages before the answer share `mayQuit`'s promise, and the `restarted` WeakSet keyed by it lets only the first restart). Both chains (`quit`, `preQuit`) end in a `catch`: a prompt that cannot open is reported ('Letters could not ask about unsaved changes: ...', `reportError`) and nothing quits (no unhandled rejection) |
| `IconBar` | (desktop) `addIcon(app)`: Select -> `app.newDoc()`; Adjust nothing. The Wimp reports every press on an icon bar icon (button type 3) as a `click` (`kind: 'click'`), never `double`: a double-click is two Select clicks, so a click within 500 ms of the one that made a document is ignored (one gesture, one document; `kind === 'double'` is ignored too). Menu: New, Recent > (`RecentFiles`), Info >, Quit (`Quit.quit`) |
| `TestHook` | `testHook(app)` -> `task.word`: `docs`, `open`, `new({paper})`, `newUntitled(paper)`, `keys`, `ask`, `prompt` (`leaf` null for the quit prompt), `recent` (a copy), `recentReady`, `mayQuit()`, `quit()`, `dialog(spec)` (WimpLib `Ui/Dialog` for the task), `pics` (`PicCache.CACHE.stats()`: `{count, bytes, pending, decodes}`); each of `docs` also has `splitBox()` (C4.3: opens `TblSplitBox`, the tests' route until C4.4's Table menu) |
| `Boxes` | `box(dw, name, make)`: a window's dialogue boxes made once, kept in `dw.boxes` |
| `Open` | `openDocx(vfs, path)` (refuses more than `MAX_PARAGRAPHS` = 200,000 paragraphs), `describe(err, leaf)` (the plain-words error text) |
| `ToolbarBind`, `ToolbarButtons`, `EditScroll` | the toolbar. `ToolbarButtons` (pure): `BAR_H` (34, the height of a row), `ROWS` (2), `BUTTONS2` (row 2, under row 1: `lineSpacing`, an action button with sprite `wb_spacing` whose click opens `ParaMenu.spacingMenu` as a popup, not in `ACTIONS`; then `bullets` and `numbers`, toggles with sprites `wb_bullets` / `wb_numbers` (gap 6 before the first), each followed by a popup (`bulletsMenu`, `numbersMenu`) opening `ListMenu.bulletMenu` / `numberMenu` under the toggle; then `painter`, a toggle (gap 6, sprite `wb_painter`) that `ToolbarBind` hands to `PaintBind.bindPainter`; not in `ACTIONS`), `LIST_TOGGLES` (`[name, query key, value, FormatApply id]`: `bullets` -> `listKind 'bullet'`, `numbers` -> `listKind 'number'` run `view.format('bullets' | 'numbering')`; kept out of `TOGGLES` and `ACTIONS` because the button names are not the ids), `BUTTONS` (row 1: style field + popup, font field (`R7`) + popup, size field (`R7;A0-9.`) + popup, `fontBigger`/`fontSmaller` (`up`/`down`), B I U S super sub toggles, colour (`wb_colour`, swatch) and highlight, the `align` radio group, indent less/more, clear), `ACTIONS` (names run as `view.format(name)`), `TOGGLES`, `ALIGNS`. `ToolbarBind.bindToolbar(view, {task, parent, height, menu, buttons = BUTTONS, dy = 0}) -> {tb, refresh, destroy}` (desktop): binds one row (its button list, its pane `dy` px down: WimpLib `Ui/Toolbar`'s `dy` option, passed to `attachPane`); one listener per row in `view.formatListeners` sets the row's controls (only those it has) from `view.query()` (mixed: let out / empty; a field being edited is not overwritten); buttons call `view.format`; popups (`FormatMenu.styleMenu/fontsMenu/sizeMenu/highlightMenu`, `Ui/ColourPopup`) open at `tb.popupAt`; Return in the size field -> `NumberField.halfPoints` -> `view.format('size', pt)` (not a number: beep), in the font field -> `FontList.findFont` (else as typed) -> `view.format('font', name)`; Return or Escape gives the caret back (`view.focus()`); `view.addPane(pane)` (its `remove()` called by `destroy`) so `view.lit` keeps the selection blue while a field has the caret (and the pane's `losecaret` redraws the window); `destroy` removes the listener and closes a popup of its own that is still open. `EditScroll` (pure): `visible(v)` (`y0 = scrollY + v.inset`), `scrollToCaret(v)` (24 px inside the visible part: never under the toolbar), `pageStep(v)` (visible height less 32; `EditKeys` scrolls exactly that and moves the caret as far, scrolling again only when the line it lands on is not all in view), `dragStep(v, sx, sy)` (auto-scroll while a drag is above the visible part or outside the window). Sprites `wb_bold wb_italic wb_underline wb_strike wb_super wb_sub wb_left wb_centre wb_right wb_justify wb_indmore wb_indless wb_colour wb_highlight wb_clear wb_style wb_spacing wb_bullets wb_numbers` (20 x 20) are drawn by `tools/moreapps/icon.mjs` `barSprites()` into `!Letters.!Sprites`; a pressed button is the R5 slab pushed in with highlight colour 2, so there are no pressed variants. Refresh after a caret move on 5000 paragraphs: well under 1 ms |
| `Zoom`, `ZoomBind` | the zoom: a view transform; the layout stays at 100%. `Zoom` (pure): `ZOOMS` [50, 75, 100, 125, 150, 200], `MIN`/`MAX` 10/500, `clampZoom(pct)` (whole percent; junk 100), `step(pct, dir)`, `wheelStep(pct, dy)`, `toScreen/toLayout(x, y, z, top)` (screen x = x * z, screen y = top + (y - top) * z: `top` = `L.top`, the toolbar and ruler, not scaled), `layoutRect`, `caretOf`, `extentOf`, `zoomScroll(oldScroll, viewSize, oldZ, newZ, top = 0)` (keeps the centre of what is visible below `top`). `EditView` keeps `zoom` (a factor) and uses it everywhere: `paint` (`g.translate(0, top); g.scale(z, z); g.translate(0, -top)` over `layoutRect(rect)`: the backing store stays at `devicePixelRatio * wimp.scale`, text drawn at the canvas scale, no double scaling), `caretRect()` (zoomed, so scrolling to the caret, the Wimp's caret and the IME proxy follow), `hitAt(x, y)` (clicks and drags in `EditMouse`); Page Up/Down move the caret `pageStep / zoom` layout px; `EditScroll` works in screen px. `ZoomBind.bindZoom(dw) -> {pct, set(pct), destroy}` (desktop: `set` clamps, keeps the centre, refits, scrolls, re-places the caret and the ruler; Ctrl+wheel (`os.input.keysDown`) claims the event, the plain wheel still scrolls); `zoomMenu(dw)`. No zoom keys (Ctrl+= / Ctrl+Shift+= are subscript/superscript, Ctrl+0 is Word's paragraph spacing); per window, not saved. Ruling: the toolbar zoom popup of the plan is NOT built (the toolbar has no room; zoom lives in the window menu's Zoom submenu and on Ctrl+wheel), and no `wb_zoom` sprite is drawn. Across, `ZoomBind.set` keeps the place on the PAGE at the window's centre (`Zoom.zoomScrollX` with the page's left edge before and after `fit()`, which lays out for width / zoom and so moves the page); Ctrl+wheel goes through `Zoom.wheelAcc` (dy added up to `NOTCH` 100 = a step, at most one per `GAP` 100 ms, reset after `IDLE` 300 ms or a turn) |
| `AppWin` | `DocWindow` (C7.1: `metrics()` measures on a scratch canvas context until the window's own exists: a table's layout measures its cells' text while the document is being made): window (workButton `clickdragdouble`, hiDPI canvas, both scroll bars; first width `min(page + 48, screen - 40)`; first height `max(560, min(screen height - y - 92, ceil(inset + pageH + 16)))`: a whole page under the bars where the screen has room above the icon bar (92: its 68 px and the scroll bar), never less than the old 560), `fit()` on a width change, `relayout()` (fonts arrived: a new `DocLayout` and `TextMetrics`, selection kept by `Selection.clamp(sel, doc, oldL)`), `rebuild()` (after an edit: `new DocLayout(doc, old.metrics, old)` keeps the lines of unchanged paragraph objects, then `fit()`), `d` (the `Document`, one per window) and `typing` (its `Typing`), `path` (null: untitled, `isUntitled`) and `leaf` (`SaveState.untitledName` of the open untitled documents' names), `save()`, `saveAs(path)` (`DocSave`), title `leaf *` while `d.dirty` (Save a copy does not mark it saved), `requestClose()` (the close icon's `close` event, prevented) and `revert()` (`CloseDoc`), `close()` forced, `closed`, menu (Save / Save as / Revert / Save a copy / Info / Edit / Format / Zoom / New / Close), zoom (`zb`: `ZoomBind`; `zoom` percent, `setZoom(pct)`; `fit()` lays out for `viewW()` = window width / `view.zoom` and sets the extent `Zoom.extentOf` of the layout's), the panes (`WinPanes`; `AppWin` keeps one-line delegates): the toolbar rows (`bar`, `bar2`: `ToolbarBind`, `BAR_H` high each) and the ruler under them (`rb`: `RulerBind`, `RULER_H`, `rulerOn`, `setRuler(on)`: per window, not saved); the inset is `inset()` = `ROWS * BAR_H + (rulerOn ? RULER_H : 0)`, the one value given to the layout (`newLayout`: `{top: inset()}`, also used by `rebuild` and `relayout`) and to `view.inset`; `setRuler` shows or hides the pane, lays out again (lines kept), scrolls to the caret and gives the focus back; Menu on a toolbar row or the ruler opens the window's menu, the wheel over them scrolls the document (`Ui/PaneWheel`) (`WinMenu`, with the cached Save and Info boxes) |
| `WinPanes` | (desktop through `ToolbarBind` and `RulerBind`; no `riscos` import) the panes across a document window's top, taken out of `AppWin`: `makePanes(dw)` makes `dw.bar` (row 1, `BUTTONS`, `dy` 0), `dw.bar2` (row 2, `BUTTONS2`, `dy` `BAR_H`) and `dw.rb` (the ruler, `dy` `ROWS * BAR_H`), each with the window's menu on a Menu click, and sets `view.inset`; `inset(dw)` = `ROWS * BAR_H + (rulerOn ? RULER_H : 0)`; `setRuler(dw, on)` (the pane shown or hidden, a new layout, the caret scrolled into view, the focus given back); `destroyPanes(dw)` (from `CloseDoc.destroy`). Every pane is as wide as the window (`fitWidth`: buttons that do not fit are cut off) |
| `RulerBind`, `RulerInd`, `WinMenu` | the ruler and the window menu (C4.4: Table > after Format, `TblMenu`). `RulerInd` (pure): `RULER_H` (24), `firstPara(doc, sel)` (the paragraph below), `firstIndents(doc, sel)` (`ParaInd.effective`, the indents drawn including a list level's, of the first paragraph from the selection's start: `{left, first, right}`, a leading kept block skipped, `null` with none), `textTwips(L, pos?)`, `scaleOf(L, scrollX, zoom = 1, pos?)` (the column of `pos`'s item, else the page's text column, px times the zoom; `RulerBind` passes the start of the paragraph the ruler shows; `zoom` passed to the ruler, so ticks, markers and drags scale). `RulerBind.bindRuler(view, {task, parent, dy, menu}) -> {ruler, refresh, show(on), destroy}`: one listener in `view.formatListeners` and the parent's `moved` set the scale and markers (`RulerMath.indentMarks`, help per marker); a drag shows `RulerMath.dragIndent` of the first paragraph's indents (the document unchanged), the commit runs `view.format('indentDrag', {marker, at, textW, free})` once and every drag's `end` sets the markers again from the paragraph (so a drag that ends without a commit does not leave them where it was dragged) (`FormatPara.dragIndents`: the same function on each paragraph's own resolved indents, only the changed keys written, `firstLine`/`hanging` exclusive, one undo step); the pane is registered with `view.addPane` (it never takes the caret). Margins are display-only. Tab stops (A4.2): the same paragraph's stops (`FormatTabs.rulerStops`: own black, the style's grey) as `RulerTabs.tabMarks` after the indent markers; `add` -> `view.format('tabs', {add})` of `RulerTabs.addAt` with the selector's kind (`rb.kind`, per window, left at first; `selector` -> `nextKind`), a tab drag previews `dragTab` (or the stop gone while `remove`), its commit -> `{remove: pos}` or `{move: {from, to, val, leader}}` (nothing when dropped where it was); help per tab marker and on the selector; every gesture whose `view.format` returns false (a RangeError: stops kept raw, more than 64 own entries, a bad value) calls `ruler.beep()` and changes nothing (the markers go back on `end`). The default stops (A4.3): `RulerTabs.defaultTicks(stops, TabStops.defaultStop(doc), textTwips)` passed as the scale's `ticks` on each refresh, so a new settings root (the Tabs dialog's default, its undo) moves them. `WinMenu.windowMenu(dw)` (desktop): Save (`DocSave.save`) / Save as (`saveBox`) / Revert (`CloseDoc.revert`, shaded while untitled) / Save a copy (`copyBox`) / Info / Edit / Insert (`InsertMenu`) / Format (with `{ruler, toggleRuler}` -> a Ruler tick item at its end) / Zoom (`ZoomBind.zoomMenu`) / New (`app.newDoc`) / Close (`CloseDoc.requestClose`), the Save as, Save a copy and Info boxes cached in `dw.boxes` (`Boxes`); Save, Save as, New and Close show their keys (`Ctrl+S`, `F3`, `F2`, `Ctrl+F2`: `Keymap.labelFor` through `MacKeys.macLabel`, so `Cmd+S` on a Mac) |
| `DocKeys` | (desktop) the window's own keys, RISC OS style (Edit's and Draw's). `attachKeys(dw)` (from `AppWin`) sets `view.docCommand = (id) => docCommand(dw, id)` and `view.autoList = () => AutoFormatOpt.autoListOn(dw.app)`; `EditRun.runView` sends every `Keymap.WINDOW` id there (`undefined` without one). `docCommand(dw, id)`: `new` (F2, Ctrl+N: `app.newDoc()`), `close` (Ctrl+F2: `CloseDoc.requestClose`, the close icon's prompt), `save` (Ctrl+S: `DocSave.save`, an untitled document opens the Save box), `saveBox` (F3: the cached `DocSave.saveBox` opened as a menu with `wimp.menus.open` 50/60 px right of / below the caret (else the window's top left), the caret put in its name icon, as Edit's `openSaveBox('key')`; already open: nothing; untitled: `save(dw)`, the centred box), `sendToBack` (Ctrl+F10: `win.sendToBack()`); `find` (Ctrl+F, F4: `EditFind.openFind(dw)`), `replace` (Ctrl+H: `openFind(dw, true)`), `findNext` / `findPrev` (Ctrl+G / Ctrl+Shift+G: `EditFind.findStep`), `hyperlink` (Ctrl+K, Cmd+K on a Mac: `LinkBox.linkBox(dw)`, A6.1), `bookmark` (Ctrl+Shift+F5, Ctrl on a Mac too: `BookmarkBox.bookmarkBox(dw)`, A6.2); `attachKeys` also calls `EditFind.attachFind(dw)`. `EditKeys.keyFor` uses up the browser's auto-repeats (`ev.domEvent.repeat`) of `new`, `close`, `save` and `saveBox`: `true`, no action, so a held key acts once and does not go on to the desktop |
| `EditView`, `EditMouse`, `EditPaint`, `Keys` | the caret, selection and editing in a window. `EditView(win, L, d, typing, rebuild)`: `L` (a getter: makes the layout again first when the document changed), `sel`, `input(text)` (`Typing.type`, with `overwrite`; refused -> `wimp.beep()`), `compose(text\|null)`, `run(id)` (`EditRun.runView`: a `FormatApply` id -> `format(id)`; otherwise the pending format is dropped, then Keymap ids `undo`, `redo`, `insert` toggles `overwrite`, `selectAll`, the rest via `EditApply.run`), `undo()`, `redo()` (`EditRun.stepView`), `refused()` (a beep: `runView` calls it when a command returns null, the selection kept; C1.5), `format(id, arg)`, `query()`, `pending`, `selRev`, `formatListeners` (`EditFormat`, below), `ensure()`, `flush()`, `destroy()`; every Document `change` marks the layout stale and asks for one `requestAnimationFrame` flush (lay out, scroll to the caret, show it), so a burst of typing is laid out once; `setSelection` is a non-edit move and calls `typing.reset()`; `setSelection(sel, {scroll})` (scrolls the head 24 px inside the edges), `setLayout(L, oldL)`, `placed()` (re-places the caret; never takes the browser focus: after a resize or when fonts arrive it must not pull the focus from a page field outside the desktop; it moves `wimp.caret.pos` only while the hidden field is not the focus owner), `focus()` (a user gesture: takes it), `key(ev)` (`EditKeys.keyFor`: true if used, `undefined` to pass the key on), `caretRect()`, `text()`, `hook()` (`EditHook`: adds `type`, `press`, `compose`, `flush`, `lines()`, `dirty`, `undoDepth`, `overwrite`, `composing`, `format(id, arg)`, `query()`, `pending`, `selRev`, `lit`, `pic()` (the selected picture: `{pos, rect, handles, cx, cy, floating, supported, alt}` or null); `!RunImage`'s `task.word.docs[i].toolbar` is the `Ui/Toolbar`); the caret is the Wimp's text-input caret (`wimp.setCaret(win, null, -1, {x, y, h} or null, {text: true})`), shown only while nothing is selected (no blink yet); Page Up/Down scroll by the window height less the toolbar and 32 (`EditScroll.pageStep`) and move the caret as far; `inset` (px hidden by the toolbar and ruler: scrolling keeps the caret below them, `EditScroll`), `addPane(pane) -> remove()` and `lit` (the window or one of its registered panes has the caret: the selection is drawn blue); `!RunImage`'s docs also give `ruler`, `rulerOn`, `setRuler`; Ctrl-Home/End scroll to the very top/bottom; Ctrl-A does not scroll; Escape collapses to the head. `EditMouse.attachMouse(view)`: click caret (in a table: in the cell's column; C3.3: in a table's zones, `SelTable.zoneAt` at `Zoom.toLayout` of the click, a cell's content, a row or a column selected instead, see "Moving and selecting in tables"), Shift/Adjust click extends from the anchor, drag via `wimp.drag({type: 'point'})` with a 60 ms auto-scroll timer outside the window (the release position is applied too: Chrome may deliver the last moves with it), double-click word (`selectWord`), triple-click = a Select click within `os.input.config.doubleClickMs` of a double-click (paragraph), Ctrl-Select click (Cmd-click on a Mac: `view.mac` and Meta in `os.input.keysDown`, the Wimp's click has no Meta flag) on a link to a bookmark (A6.1: `LinkFind.linkUnder`, the link DRAWN under the pointer, not the one next to the caret place the click gives; its address `#name`) puts the caret at the bookmark (`BookmarkFind.findBookmark`, scrolled into view; a beep when it is not there; on a web link a plain click: links are never opened; with the Acorn button mapping (`rightIsAdjust`) the core makes Ctrl-click Menu, so the jump needs the default mapping), Menu leaves the selection alone (as !Edit); `PicDrag` is asked first by the click, double-click and drag handlers (pictures selected and resized), then `TblDrag.colDragStart` and `rowDragStart` by the drag handler (a table's column edge, C5.3; a row's bottom edge, C5.4); after an undo or redo `PicOps.stepSel` selects a resized picture. `EditPaint.paintView(L, g, rect, sel, active, {comp, overwrite, zoom, ghost})`: grey desk `#888`, white page with border and shadow, text (`DocPaint`), selection multiplied in (`#b3d4fc`, inactive `#d4d4d4`); overwrite: the grapheme after the caret shaded `#a0a0a0` (multiplied; 8 px at a paragraph end); composition: the text drawn at the head black on white over what follows (not laid out: a known limitation), underlined 2 px `#0050c8`; a selected picture (`PicFind.selectedPic`): eight black handles 7 screen px with a white 1 px border, after the selection; `ghost` (`v.picGhost` while a handle is dragged): 1 px dashes of `#000000` (sizes divided by `zoom`); `line` (`v.tblGhost` while a table's border is dragged, `{x, y, h}` vertical or `{x, y, w}` horizontal): a line in the same dashes, 1 screen px. `Keys.command(code, {shift, ctrl, key})` (pure): Wimp code -> `{cmd, extend}` or null; the browser's key name separates Shift-Down from Page Down (both &19E) |
| `DocLayout`, `DocItems`, `DocStack`, `DocRects`, `DocPaint` | the whole document as columns of items, the root one page-width (Batch C, C2.1: see "Columns of items" under "Tables (Batch C): the rules"): `new DocLayout(doc, metrics, prev?, {top, decorators, pics}?)` (`prev`: a laid-out layout of the same doc, metrics and text width: the lines of every paragraph object it had are reused when the reuse key agrees, `DocItems`; `top`: px above everything, for the toolbar, 0..1000, `prev`'s when not given; `decorators`: `DocStack`'s list, `prev`'s when not given, else `DECORATORS`; `pics`: a `PicCache.picView`, kept as `L.pics` for `PicPaint`, `prev`'s when not given, else null: pictures drawn as boxes, nothing decoded (`[ParaSpace.spacingDeco, BorderGroups.borderDeco, SectDeco.sectDeco, FlowDeco.flowDeco]`: the band goes under a bottom border's gap and the "Page break before" rule above a top border's, each reading the gaps of the decorators before it from `acc`); `EditPaint.pageRect` starts the page below it), `layout(viewWidth) -> {w, h}` (the width reaches the widest top-level table, `L.wide`, when it is wider than the page: D18 step 4; text width `(pgSz.w - pgMar.left - pgMar.right) / 15` from the FIRST section, A4/1440 defaults, clamped 80..4000 px; page `pgSz.w / 15` centred, at least 24 px from the left; 24 px above and below; `pageH` = `pgSz.h / 15` (A4 when missing or not finite, clamped 200..20000 px) and the extent's height `height` is at least `top + 2 * PAGE_TOP + pageH` (`PAGE_TOP` 8, exported: the desk above and below the page, which `EditPaint.pageRect` uses), so a short or empty document shows a whole white page (a longer one ends 24 px below its text: no page breaks yet); the height is set in `stack()` from the items, so a layout made from `prev` has the full layout's height (`layout-prop` checks it); lines depend only on the text width, so a new view width only moves the column; `invalidate()` re-breaks every paragraph), `items` `{id, block, kind: 'p'\|'box'\|'tbl', index, x, w, col, ci, y, h, gapAbove, gapBelow, marks, deco, lines?, list?, mark?, label?}` (the root column's; a `'p'` item is also PositionMap's `pl`; x in item coordinates + the item's `x`; a kept block is one box item, `BOX` 28 px in a 40 px item, labelled `[<kind> - preserved, not shown]` (`Info.kindOf`; a typed table is one `'tbl'` item (C2.4: `TblItems`, `TblLayout`; until C2.5 drawn as such a box, its box the whole table, labelled `[table - preserved, not shown]`), its caret and hits as a box's: off 0 at its left edge with the first row's height, off 1 at its right edge with the last row's), the caret before it (off 0, its left edge) or after it (off 1, its right edge)), `byId`, `itemAtY` (binary search on `y + h`: a y in a gap gives the item below; where items overlap, after a negative gap, the lower one from the top of its first line on), `locate(pos)`, `caretRect(pos, aff)`, `hitTest(x, y) -> {pos, affinity}` (above the first item's text: start; below the last item's: end; a box: nearer edge; in a bottom border's gap, `BorderGroups`: the paragraph above (its last line); in a section break band, `SectDeco.inBand`: the end of the block above it; in any other gap above a paragraph: its first line), `labels` (`ListNumbers.labels(doc)`, once per layout object: one pass, about 20 ms for 50,000 list paragraphs) and each `'p'` item's `list` (its Label or null, passed to `layoutPara`), `selectionRects(sel, y0?, y1?)` (`DocRects`: only items/lines in the band; 6 px paragraph-mark stubs for paragraphs whose end is selected; a box lit whole when both edges are in; tables by the selection's shape, `SelShape`, C3.2), `boxRect`, `paraStart/End`, `docStart/End`, `next/prevItem` (through `L.flow`); `DocPaint.paint(L, g, rect)` draws the items in rect (the border boxes' shading of all of them first, under every text, their edges last: `BorderPaint`; the grey rules and labels of breaks, bands and the page break before mark: `MarkPaint`), each with its gaps (`y - gapAbove .. y + h + gapBelow`: after `itemAtY` it steps back over items whose gap below reaches rect, so a band in a gap is drawn when only it is in rect) (a list label on its first line's baseline, in its own format, never highlighted; a section break band, `SectDeco`). `DocItems` (pure): `buildItems(L, doc, prev)` makes the items (one per block, in section order), `L.byId`, `L.labels` and records `L.styles`, `L.numbering`, `L.settings` (`doc.styles`, `doc.numbering`, `doc.rawSettings`); an item's `mark` (a paragraph's or a kept block's) is its section-end mark `{type}` (`markOf(doc, s)`, `SectMark`'s: the FOLLOWING section's type, as `w:type` says how a section starts: its `type` field, else a raw `w:type` with a string `w:val` kept in `extra`, else `'nextPage'`) when it is the last block of a section that is not the last, else null; `reuseKey(item)` -> `{block, list, mark}`, `sameKey(a, b)` (items have the same fields), `sameMark(a, b)`; prev's lines are kept when prev was laid out (`laid`) with the same metrics, doc, text width, scope (`L.ns`, what is a picture) AND the very `doc.styles`, `doc.numbering` and `doc.rawSettings` objects (edits replace them, never change them), and the keys agree (the paragraph object, `LineLabel.sameLabel`, `sameMark`); a reused item (a kept block too, under the same key) keeps `deco` when the decorator lists are the same. `DocStack` (pure): `stack(L)` (C2.4: `stackColumn(L, L.root, ...)`; any column the same way) breaks every paragraph without lines first (`LineLayout.layoutPara` with its column's styles: `doc.styles` on the page, a cell's derived ones, and `L.ns`, the scope pictures are read in (`PicRead.docMap(doc)`, set by the `DocLayout` constructor); so a decorator and its `keyOf` may read the lines of the items on both sides) and then stacks the items from `top + MARGIN` (24): `y += gapAbove; item.y = y; y += h + gapBelow` (`item.y` stays the top of the text; a gap belongs to no item), `L.height = minHeight(y + MARGIN)`; a decorator is `(item, L, acc) -> {gapAbove?, gapBelow?, marks?}` or null, called in list order (`acc`: what the earlier ones gave), gaps summed (not finite -> 0; `gapBelow` < 0 -> 0; `gapAbove` may be negative: space taken back, clamped so an item never starts above the first item's top nor ends at or above the end of the item before, which keeps `itemAtY`'s search), marks concatenated (drawn only, never text); the result is frozen and kept in `item.deco`, which `DocItems` carries over only under the full reuse key (block object, `sameLabel`, `sameMark`, metrics, text width, `doc.styles` / `doc.numbering` / `doc.rawSettings` identity, the same decorator list; kept blocks too) and `invalidate()` drops; a decorator that reads anything else (Word's contextual spacing reads the neighbour's style, merged borders the neighbours' borders) gives `f.keyOf(item, L)` -> a value or an array of values, worked out on every layout (keep it cheap) and compared with `Object.is` (element by element for arrays) with the one the result was made with: any difference asks every decorator again for that item; `keyOf` may read `item.deco` (the result in hand), and the keys kept with a new result are worked out once it is in `item.deco` (`BorderGroups` gives null for an item whose result has no box); with no decorators nothing is looked at. Relayout after one typed character, 50,000 paragraphs (Node, median of 15): about 7 ms with no decorators (as before the split), about 10 ms with one |
| `DocHit`, `ItemPaint`, `SelVert` | (pure; Batch C, C0.1: moved out of `DocLayout`, `DocPaint` and `SelMove` unchanged, so each stays under its size limit). `DocHit`: `caretRect(L, pos, aff?)`, `hitTest(L, x, y)` (C3.1: a hit in a table goes into a cell, see "Carets in cells"), `boxRect(L, it)`, `itemIn(items, y)` (the item of a column at y: `L.itemAtY`'s rule, used for cell columns too), `leafAt(L, x, y)` (C3.5: the item drawn at a layout point, into a table's cell under x (exact; a vMerge's restart cell) and nested tables, null outside every cell: `LinkFind.linkUnder` and `PicFind.picAt`, so links and pictures in cells are found under the pointer); `DocLayout`'s methods of the same names are one-line delegates. `ItemPaint`: `paintPara(L, g, it, rect)` (a paragraph item's lines in rect: highlights, list label, bar stops, leaders, text, pictures, rules; the drawing rules are in `DocPaint`'s header) and `paintBox(L, g, it)` (a kept block's grey box); `DocPaint.paint` keeps the item search and the border boxes. `SelVert`: `make(anchor, head, aff?, goalX?)` (the frozen selection; moved here from `SelMove` in C3.3 so that `SelTable` can make selections without an import cycle; `SelMove` re-exports it), `at(it, off, aff?)`, `withAff(it, r)`, `enter(L, n, dir, gx)` (a paragraph or a kept block), `page(L, p, aff, gx, dir, pageH)`, `step(L, it, off, dir)` and `reachable(t, edge)` (C3.1: the next caret place in `L.flow`, a table's edge only where reachable, D8; the C3 fix wave: the items of a vMerge continue cell passed, as Up, Down, clicks and Tab pass them: `TblPos.contOf`, found once per layout in one pass over its table items, C7.1), the moves of `SelMove` across items by the flow; Up and Down are `SelTable.vertical` (C3.3); `SelMove` keeps `move` and the commands |
| `Selection`, `SelMove`, `DocPos` | positions `{id, off}`: a paragraph id and UTF-16 offset, or a kept block (`DocPos.blockId`: a table's own `id`; for an Opaque a negative id held in a WeakMap per block object) with off 0 (before) or 1 (after). `Selection` is a frozen value `{anchor, head, affinity, goalX}`: `caret`, `select`, `collapsed`, `ordered(sel, L)`, `move(sel, L, cmd, extend, pageH)` (`SelMove`: left/right by grapheme of the whole paragraph text (`DocPos.nextG/prevG`, windowed on texts over 4096 units), every item boundary one step, boxes atomic; up/down keep `goalX` and cross into the next item; home/end per line; wordLeft/wordRight; paraStart/paraEnd; docHome/docEnd; pageUp/pageDown; non-extending left/right collapse a selection to its edge; A6.2: left/right step over unseen inlines (`Kinds.unseenAt`: bookmarks, proofing marks, field codes, deletions; not a soft hyphen, which is a character for the keys: one press, deletable, as in Word) TOGETHER with the next character, Shift too, so such an inline never costs a key press: in `a[mark]b` right from 0 gives 1 then 3, and at a paragraph's edge the marks go with the paragraph mark), `selectWord` (not the space after a word), `selectPara`, `selectAll`, `text(sel, L)` (paragraphs joined by `\n`, inline wrappers as their text; C3.1: cells' paragraphs in flow order), `clamp(sel, doc, oldL?)` (C3.1: blocks at every depth, `Walk.scan`). `DocPos.placeOf(item, off)` (C3.1): a position's place in `L.flow` (a table's off 1: its `endIndex`); `compare` and `L.locate(pos).index` use it |
| `LineLayout`, `LineTokens`, `Fmt`, `Justify`, `Highlight` | (`runFmt` also gives `highlight` (CSS colour via `Highlight.highlightCss`, Word's 16 names, else null), `vert` ('sup'/'sub'/null), `dy` and `full`: super/subscript at 0.65 of the size, baseline up 0.35 / down 0.15 of the full size, the line as high as for the full size; `colour` black unless 6 hex digits; `shade`: the character shading's CSS colour or null (`BorderResolve.runShade` / `shadeCss`: the run's layers, the whole `w:shd` of the highest one); items carry `hl`, `sh` (from `shade`; null on a break's rule), `dy`; alignment is `Justify.align(line, how, maxX)`; a line grows only to keep raised/lowered text inside it; `jc` 'both': items not merged, one item per space, and `Justify.justify(line, maxX)` spreads a wrapped line's free width over the spaces between its words (not the last line, nor one ending in a break; lines with tabs or boxes, or one word, left alone; widened spaces record `js`, which `PosLine.offIn` scales by; `rangeX` ends a selection at an item's edge as the caret does); `DocPaint` draws character shading and then highlights behind a line's text, full line height, and text/underline/strike at `dy`) (`Fmt.sizeBold(styles, para, rPr, pPr?)` -> `{pt, bold}`: the one size/bold rule, shared with `Format`: no size anywhere in a heading means Word's heading size and bold unless `b` is set; `HEADING_PT`) screen layout: `LineLayout.layoutPara(para, styles, width, metrics, cache, label?, defPx?, map?)` (`map`: the scope raw inlines are read in, `DocLayout`'s `L.ns` = `PicRead.docMap(doc)`, passed by `DocStack`; pictures are items of kind `pic`, see "LineLayout: the rules"; tab items to their stops, `TabStops`/`TabAlign`, with `leader`; `line.bars` for bar stops; greedy line breaking; lines and items keep the UTF-16 model offsets `from`/`to` they stand for, gap-free; `shown` marks items whose drawn text is not the model text; trailing spaces hang; a word wider than the line overflows on its own line), `LineTokens.tokens` (words, `isSpace` (only U+0020 breaks and hangs), spaces, tabs, breaks and inlines with their offsets; a run boundary inside a surrogate pair moves past it), `runFmt`/`paraFmt` from the resolved properties (`paraFmt(styles, para, levelInd?)`). List labels: `layoutPara(..., cache, label?)` puts the label (a `ListNumbers` Label) on the FIRST line as `line.label = {x, w, text, f, bullet}`, not an item and in no `from`/`to` (so `lines[0].from === 0`, the caret at offset 0 is the text start `line.x`, a click left of the text gives offset 0, selections start at the text, `Justify` never touches it); it moves with centre/right alignment |
| `LineLabel` | (pure) `labelLine(label, para, styles, pf, metrics, cache, defPx?, maxX?) -> {label, textX}`: the label starts at `left + first` (the hanging space `[left - hanging, left)`), lvlJc right/center within that space when it fits; text after the suffix: tab -> `left` when the label ends exactly there, else the stop a tab in the text would go to (`TabStops.nextStop`: the paragraph's stops, `left` as the hanging stop, the default stops `defPx` from the margin; G6); space -> one space of the label's font; nothing -> at its end. Format: the first run's `rPr` (Word: the paragraph mark, not modelled) less underline/strike/highlight/vertAlign and character style, the level's `rPr` over it; a bullet keeps the paragraph font (not Symbol/Wingdings) with `"DejaVu Sans"` before the generic family (not shipped: used if the system has it, else Chromium's per-glyph system fallback finds a font with the shape; `word-lists.mjs` checks U+2022 and U+25AA draw ink). The first line is as high as the label needs. `sameLabel(a, b)` (the reuse key) |
| `TabStops`, `TabAlign` | tab stops (Batch A, A4.1), pure. `TabStops`: `resolveTabs(styles, para)` (frozen `[{pos, px, val, leader?}]` sorted: the `Styles.paraLayers` layers merged, `clear` removing, Strict `start`/`end` and `num` mapped, a raw `w:tabs` read for the screen, 256 read per layer and 64 used; cached per paragraph object + styles), `defaultStop(doc)` (twips of `w:defaultTabStop`, 720 by default, cached per settings root), `nextStop(stops, x, leftPx, defPx, maxX) -> {pos, val, leader?}`, `ownTabs(pPr)` (one layer's stops as written: the field, else a raw `w:tabs`), `barsOf(stops)`, `twipsOf(v)`, `DEFAULT_TW`, `MAX_USED` 64, `MAX_LAYER` 256. `TabAlign`: `startOf(p, end, dot?)`, `alignedEnd(p, end, dot?)`, `close(line, p, end, asLeft?)` (the pending right/centre/decimal tab widened and the items after it moved), `dotIn(group, x, metrics)`. The rules: "Tab stops (Batch A, A4.1): the rules" below |
| `FormatTabs` | the tab stop commands (A4.2), pure: `setTabs(d, typing, sel, arg, pending)` (`FormatApply` id `tabs`; `FormatPara.paraCommand`: one undo step, none when nothing changes) with one of `{add: {val, pos, leader?}}`, `{remove: pos}`, `{move: {from, to, val?, leader?}}` (each paragraph's own stop at `from` gives the kind, else `val`), `{set: [...]}` (the stops in force made exactly these, <= 64) applied to each paragraph's DIRECT stops (`directFor(doc, p, arg)`); `rulerStops(doc, p)` -> `[{val, pos, leader?, style}]`. A style stop removed is written `clear`, a direct stop equal to the style's is not written, a clear under a returning stop dropped; Strict: new left/right written start/end; `{edits: [{add} | {remove} | {set}...]}` (A4.3, the Tabs dialog: applied in turn to each paragraph's direct stops; at most `MAX_EDITS` 256; no `move` or nested `edits`); `tabOps(doc, sel, arg)` the `setProps` ops without running them (`setTabs` runs them through `FormatOps.runOps`; `TabsCommand` adds a settings change); `isRawTabs(p)`: a paragraph whose own `w:tabs` is kept raw (w14 attributes, more than 256 stops, a position beyond +-31680 or repeated: `ReadPropsMore.tabs`, final review) is never edited: the command is refused (RangeError) when the selection formats one (the Tabs dialog follows the same rule: `TabsBox` beeps at once); more than 64 own entries after the change: refused (`FormatCheck`); bad args RangeError |
| `SettingsEdit`, `TabsPatch`, `TabsCommand`, `TabsBox` | the Tabs dialogue box (A4.3: Format > Tabs..., and the Paragraph box's Tabs... button) and the default tab stop. `SettingsEdit` (pure): `defaultTabOf(root, map?)` (the first `w:defaultTabStop`'s twips, namespace-checked, or null) and `withDefaultTab(root, twips, map?)` -> a NEW settings root (or the same root when the value is already that): the first `w:defaultTabStop` copied with only its `w:val` changed (twips; points such as `72pt` when the old value had a unit, as Strict files write it), else a new one inserted after the last child named in `BEFORE` (the `CT_Settings` sequence before it, pinned to `wml.xsd` by `settingsedit.test.mjs`), with the root's WordprocessingML prefix (declared on the element when the root has only a default namespace); every other child and the root's attributes are the same objects (setDocPart values are immutable), so the written part differs only in that element; twips outside `TabStops.MIN_TW..MAX_TW` (36..31680) RangeError. `TabsPatch` (pure): the box's state, never changed in place: `start(stops, def)`, `setStop(st, {pos, val, leader})` -> `{st}` or `{bad: 'pos' | 'full' | 'kind' | 'leader'}` (pos a whole number in -22..22 inches; leader undefined keeps the stop's own; no 65th stop), `clearStop`, `clearAll`, `choices(st)` (the popup: `'p<pos>'` ids, `'1" Left, dots'`; `(none)`), `stopOf`, `placeOf(st, pos, picked?)` (a field holds hundredths of an inch: a typed or picked value that shows as a stop's position means that stop), `clearedText`, `patch(st, def)` -> `{patch: {tabs?: {edits}, defaultTab?}, bad}` (edits: `{set: []}` after Clear all, then one add or remove per position; the default compared as the field shows it; `bad: ['deftab']` outside 36..31680 twips). `TabsCommand` (pure): `tabsBox(d, typing, sel, {tabs?, defaultTab?}, pending)` (`FormatApply` id `tabsBox`): the settings `setDocPart` (only when the root changes) and `FormatTabs.tabOps` in ONE `runOps` (typing.command + atomic: one undo step, all or nothing; the default alone is only the `setDocPart`); a default for a document without a settings part is refused (creating the part is out of scope). `TabsBox` (desktop, imports `wimp` for the beep): `tabsBox(dw, {done}?)` (`done(before, after)` after each OK that changed the document, with `where(view)` (the selection's ends and `d.stateId`, also exported for `ParaBox`) before and after it, until the next call; key `'tabs:' + dw.docKey`, in `dw.boxes` as `'tabs'`, Cancel and OK): Default tab stops (a length; shaded when no settings part was read, showing 0.5"), Tab stop position + a popup of the first paragraph's stops in force (`FormatTabs.rulerStops`), Alignment radios (Left Centre Right Decimal Bar: the only way to set a bar stop), Leader radios (None Dots Dashes Line), Set / Clear / Clear all (row buttons, the document unchanged until OK), "To be cleared"; fields never clamp (min/max 1e9: `TabsPatch` refuses with a beep); OK sets the position typed (as Word), then one `view.format('tabsBox')`; refused by the command (more than 64 own stops) -> beep, box kept; a selection holding a paragraph whose stops are kept raw: Set / Clear / Clear all / OK with a position beep at once (the default alone still goes in); the selection, the document (`stateId`) or the doc changed while open: OK beeps and refills. `RulerBind` draws the default stops from the same `TabStops.defaultStop`. Tests: `tabspatch.test.mjs`, `settingsedit.test.mjs`, `word-tabs.mjs` |
| `ParaSpace`, `ParaMenu`, `SpacingRaw` | line spacing and the space between paragraphs. `ParaSpace` (pure): `lineBox(pf, px, up?, down?) -> {h, base, clip}` (`LineLayout`'s `finish()` uses it for every line: `auto` 1.25 px times `factor` with the baseline 0.27 px above the bottom, grown for raised/lowered text; `atLeast` as auto at factor 1, then at least `lineTw / 15` px with the extra above the text; `exact` `lineTw / 15` px, baseline at 0.8 of it, `clip` when the text is higher (`line.clip`: `DocPaint` cuts the line's drawing to its box, as Word does); `lineTw` clamped to `MIN_LINE`..`MAX_LINE` 2..2112 px (1584 pt, Word's most), 240 twips when missing; auto's `factor` stays clamped 0.5..4 by `Fmt` although Word allows up to 132 lines: the Paragraph dialog, `ParaPatch`, refuses an At outside it), `contextual(prev, next) -> {cutAfter, cutBefore}` (Word's "don't add space between paragraphs of the same style": only between one style id, and each paragraph's own `contextualSpacing` drops its own space: prev's after, next's before), `contextualOf(styles, para)` (the resolved flag: the last layer that sets it), `rawSpacing` (re-exported from `SpacingRaw`), `spacingDeco` (the one entry of `DocStack.DECORATORS`: a negative `gapAbove` of `cutAfter + cutBefore` on the second paragraph, the space read back from the laid-out lines (`lines[0].y` before, `h - (last.y + last.h)` after); `spacingDeco.keyOf` is the block object above, so a change to the neighbour asks again; costs about 1 ms per relayout of 50,000 paragraphs, Node). `Fmt.paraFmt` gives `lineRule` ('auto' / 'exact' / 'atLeast'), `lineTw` (the line in twips or null) and `contextual`. `ParaMenu` (desktop): `spacingMenu(view, {options}?)` -> Menu `Line spacing`: 1.0 1.15 1.5 2.0 2.5 3.0 (`lineSpacing` with the factor; ticked when the whole selection has it with rule auto; keys Ctrl+1, Ctrl+5, Ctrl+2), Add / Remove space before (240 / 0; Add shaded when every paragraph has some, Remove when none has; Add's key Ctrl+0), Add / Remove space after, `Line spacing options...` (`options()` when given: the Paragraph box, `ParaBox`; shaded without). It is `FormatMenu`'s `Line spacing >` and the toolbar button's popup. `Format.query` also gives `contextual`, `keepNext`, `keepLines`, `widowControl`, `pageBreakBefore` (true / false, mixed null). `FormatPara.explicit` writes `keepNext keepLines widowControl pageBreakBefore contextualSpacing` (null where the style gives the same, absent counting as off, except `widowControl`, on by default as in Word, so turning it off writes `w:val="0"`) and writes `line` and `lineRule` together, never one alone. `StylesBuiltin`: List Paragraph has `contextualSpacing` (Word's). `SpacingRaw` (pure): a `w:spacing` the model keeps raw (autospacing, `beforeLines`, another namespace's attribute; matched by namespace, not by local name: prefix `w` as the writer binds it, or the element's own `xmlns`, so a foreign `x:spacing` (or a `w:spacing` whose own `xmlns:w` is foreign, also left alone by `PropNames.withoutRaw`) is never shown, patched or dropped, and attributes of another namespace on a `w:spacing` are neither read nor changed; with several `w:spacing` elements in one pPr the first is read and patched and none becomes the field, the reader keeping them all raw): `rawSpacing(pPr)` (what it says for the screen and `Format.query`, merged by `Styles.resolvePara` into `spacing`: before/after/line clamped 0..31680, lineRule; `w:beforeAutospacing` / `w:afterAutospacing` on show as `AUTO_TW` 280, 14 pt), `spacingNode(pPr)`, `patchSpacing(pPr, set)` (only the attributes set change, in place; setting or clearing `before` also drops `beforeAutospacing` and `beforeLines`, `after` likewise, and nothing else; when what is left is exactly what the reader takes as the field, the field instead: `{spacing}`, else `{extra}` with the new node where the old one was). |
| `ParaPatch`, `ParaBox` | the Paragraph dialogue box (Format > Paragraph..., and Line spacing options... in `ParaMenu`, from the Format menu and the toolbar's line spacing popup). `ParaPatch` (pure): `fill(q)` -> the box's values from a `Format.query` (names `NAMES`: `align left right special by before after spacing at noctx widow keepnext keeplines pagebreak`; lengths in twips, `at` in lines for Multiple and points for At least / Exactly; a mixed (null) value is `undefined`: an empty field, an option off); `patch(values, q)` -> `{patch, bad}`: the `FormatCheck.paraPatch` of what changed, compared with `fill(q)` as the fields show them (so a length shown rounded is not a change; an untouched mixed field is left alone), `firstLine` / `hanging` exclusive (None is `firstLine` 0; By empty is half an inch; By over a mixed Special is ignored), Single 240, 1.5 lines 360, Double 480, Multiple `at * 240` auto (empty: 3), At least / Exactly `at * 20` `atLeast` / `exact` (empty: 12 pt); `bad` names the fields refused (text that is not a value where it counts; At outside `LIMITS` `{lines: [0.5, 4], points: [1.5, 1584]}`, what `Fmt` and `ParaSpace.MAX_LINE` draw) and then `patch` is `{}`. `ParaBox` (desktop, imports `wimp` for the beep): `paraBox(dw)` builds the box with WimpLib `Ui/Dialog` (key `'para:' + dw.docKey`, so one box per document, registered in `dw.boxes` for `CloseDoc` to delete; Cancel and OK; nothing without a selection), fills it from `view.query()` when it opens (the query is kept for OK), shades By for None and At for Single / 1.5 / Double, puts the usual At in when the kind of spacing changes, and on OK runs `view.format('paraBox', patch)` (one undo step; none for an empty patch; a refused field beeps, keeps the box and puts the caret in it); Cancel / Escape / OK give the caret back to the document. If the selection or the document changed while the box was open (`TabsBox.where`: the selection's ends and `d.stateId`, so a key, the toolbar, a menu or the ruler counts; final review), OK beeps and refills it from the new selection (keeping it open); a change made by OK in the Tabs box opened from its own `Tabs...` button, from the state the Paragraph box shows, does not count (`tabsBox(dw, {done})` reports `where` before and after each OK that changed the document). At is read unclamped (field max 100000) and `patch` refuses it outside `LIMITS`: for the A1.7 guide, Multiple takes 0.5 to 4 lines, At least and Exactly 1.5 to 1584 points (a bigger number beeps and the box stays). `FormatApply` id `paraBox` -> `setPara`. A row button `Tabs...` (A4.3) opens the Tabs box (`TabsBox`), the Paragraph box staying open as it is. `FormatMenu.formatMenu(view, {ruler, toggleRuler, paragraph, tabs})` has `Paragraph...` and `Tabs...`; `ToolbarBind` takes `paragraph` for the popup (`WinMenu` and `WinPanes` pass `paraBox(dw)`). Tests: `parapatch.test.mjs` (including every key really written by `FormatPara.explicit` and an undo step), `word-parabox.mjs` |
| `PositionMap`, `PosLine` | offsets <-> places in one laid-out paragraph `pl = {para, y, h, lines, metrics}`: `caretRect(pl, off, aff)`, `hitTest(pl, x, y)`, `lineOf`, `lineStart`/`lineEnd` (End leaves out spaces hanging at a soft wrap, sits before a break), `vertical(pl, off, aff, dir, goalX)` (null past the first/last line), `selectionRects(pl, from, to)`. At a soft wrap an offset has two places by affinity (`'up'` end of the upper line, `'down'` start of the lower); atomic items (tab, box, hyphen, unseen, wrapper text) give the nearer edge; a wrapper's offset `i+1` is after its last piece, a line of only later wrapper pieces has no caret place; Up/Down fall back to the other edge of a hit wrapper piece so they never dead-end. Lines carry `x` (start after indent and alignment) for empty lines. Long items are measured with `widthTo`/`offsetAt` |
| `Edit`, `EditDel`, `EditPara`, `EditRange`, `EditPos` | the editing commands, pure, no layout: each `(d: Document, sel: Selection, ...) -> Selection` applies ONE `d.group` (one undo step) and returns a caret (affinity `'down'`, no `goalX`), or `sel` unchanged when nothing happens. `Edit`: `typeText(d, sel, text, {overwrite, key, rPr, rStyle})` (`rPr`/`rStyle`: the pending format, merged into the new text's format only (`Pending.applyTo`); `\r\n`/`\r` -> `\n`, other controls and U+FFFC dropped, lone surrogates -> U+FFFD; `\t` stays a tab character in the text (the reader's form of `<w:tab/>`), `\n` splits (bulk: `restoreBlock` + `insertBlocks`); over a selection the first selected character's format; `{coalesce: key}` unless `\n`/`\t`; a kept block's edge gets a new empty paragraph; a document with no blocks: refused), `overwrite` (replaces as many graphemes as typed, not past the paragraph end, a U+FFFC, a tab or a line break), `splitPara` (`EditPara.splitAt`: an empty list item (`ParaInd.listOf`: one with a label, style numbering included) ends the list: direct `numPr` (raw too) removed, or `numId 0` when the style gives the numbering; an empty paragraph with `numPr` but no label (numId 0, unknown numId) splits; at the end the style's `next` when it names another paragraph style, else Heading 1-9/Title by id or name -> default style), `lineBreak` (a `\n` character in the text, the reader's form of a plain `<w:br/>`: typed tabs and line breaks are the same model before and after a save; older `tab`/`br` inlines still read, display and write), `insertTab`. `EditDel`: `deleteBack`, `deleteForward` (grapheme clusters; merge at paragraph edges, not across sections; next to a kept block the first press returns the block selected, the second deletes it), `deleteWordBack/Forward` (`Segment.prevWord/nextWord`), `deleteSelection`; C3.4 (D10, TB10, TB11): in a cell nothing joins across the cell's edge (Backspace at its first paragraph's start, Delete at its last's end: nothing, no beep); by a typed table Backspace at the start of the paragraph after it removes that paragraph when empty and not the last of its section or cell (the caret at the end of the last cell), else only moves the caret there, and Delete at the end of the paragraph before it removes that paragraph when empty (the caret in the first cell), else does nothing; never the last paragraph between two tables, typed or Opaque, at any depth (C7 fix A1, D27: Backspace then moves the caret into the table before, Delete does nothing, and from a kept block's or table's edge the caret goes into the paragraph); on a table's edge the kept-block rule; Backspace over a `cells` shape removes its rows when it spans every grid column, the table when it is the whole table, else clears it (`RangeTbl.backCells`), Delete clears; A6.2: Backspace, Delete and the word forms never delete an unseen inline (`Kinds.unseenAt`): they look past the ones next to the caret and delete the character or word beyond, keeping every unseen inline inside what they delete (one undo step); with only such inlines between the caret and the edge they join the paragraphs (inlines kept); from a table's edge a paragraph holding only such inlines counts as empty and is removed (`Kinds.onlyUnseen`), its bookmark marks whose partner stays put back at the caret's place (C3 fix wave: `BookmarkKeep`), and never the last paragraph of a cell after a table (`TblCheck.endsCell`). `EditRange`: `deleteRange` (C3.4: a range with an end in a cell is `RangeTbl.deleteIn`'s, so typing, Enter, paste and a page break over a `cells` shape clear the cells and go into the top-left one, and a `mixed` range deletes its paragraphs and covered rows; the top-level range below unchanged, its ops in `RangeOps`; A6.2: a bookmark mark in the range whose partner is outside it is put back where the range was: `BookmarkKeep`; cut the ends, `removeBlocks` per section, merge the ends; 40k of 50k paragraphs in a few ms; section breaks are never removed: removing one by deleting across it is not supported yet (the ops exist, `OpsSect`, but no editing command uses them yet), so a section the range empties gets one empty paragraph in the same undo step and stays reachable, and so does one it leaves ending with a kept block (not the last section: the paragraph that carries the section break, which the writer would otherwise add, so the file would read back with one paragraph more)), `mergeAt` (merge rule: the first paragraph keeps id/pPr/pStyle unless it is empty and the second is not, then the empty one is removed; siblings of one container, or (top level only) across a section end), `paraBy` (at `sibOf(loc, 0 \| 1)`, a cell too); C1.5: `deleteRange` refuses (RangeError, nothing changed) a range with an end in a table's cell (`EditPos.topOnly`) until C3.4. `EditPos` (C1.5, D6, R5): `findBlock(doc, id) -> {at, k, rank, endRank?, b, s, i?, depth, cell?}` at any depth (`at` the path; `k` today's top-level index, a cell block's outermost table's; `rank` D9's flow rank, a table's `endRank`; `i` only at top level; `depth` Walk's: a top-level table 0; `cell` `{table, r, c}`; a table's size and ids kept per table object in a WeakMap, so a lookup enters only the table holding the id), `neighbour(doc, loc, d)` (the sibling in its container: across sections at top level, null at a cell's edge), `nextInFlow` / `prevInFlow` (flow order across containers), `atIndex(doc, k)` (top level), `atRank(doc, rank)`, `checkPos` (a table's edge 0 or 1), `orderedPos(doc, sel)` (by `rankOf(loc, off)`: a table's `endRank` at off 1), `rankOf`, `isNested(loc)`, `topOnly(o)` (o when both ends are top level, else null: the one rule for the sites that stay top level: the breaks, Insert's, `EditRange`'s own path; the clipboard's slice follows `SelShape` since C6.1), `pathOf(loc)` / `sibOf(loc, d)` (RangeError `bad position` for a location without a path; `topPath` was removed in C3.5: `Find`'s matches carry paths), `posOf`, `endOf`. `EditPara.splitAt` (C3.1, D8): at offset 0 of the first paragraph of the first cell of a table first in its container (the document or a cell), Enter puts an empty paragraph before the table (`EditRange.paraBy` at the table's path, nested too) and the caret stays |
| `Typing`, `Keymap` | pure. `new Typing(d, {now, pauseMs = 1000})`: `type(sel, text)` (`type(sel, text, {overwrite, rPr, rStyle})`: `Edit.typeText` with key `'typing'`; a new undo step on the first call after `reset()`, after a pause over `pauseMs`, when the caret is not where the last typing ended, or for the first non-space after a space, so "hello " and "world" are two steps; `\n`/`\t` text and typing over a selection are never joined; typing given a pending format (`rPr` or `rStyle`) starts a new step, and the typing after it joins it, so a word typed after Ctrl-B is one step), `command(fn)` (`d.breakCoalesce()`, then `fn()`), `reset()`. `Keymap`: `bind(rows)` of `{id, keys: ['Ctrl+Z'], label, menu}`, `lookup({code, key, shift, ctrl, alt})` -> id or null (ids `enter shiftEnter backspace delete ctrlBackspace ctrlDelete tab shiftTab insert undo redo selectAll`, and `cut copy paste` (Ctrl+X, C, V: Edit menu labels only, `EditKeys` passes them on so the browser fires its clipboard events; no Ctrl+Shift rows); `shiftTab` is Shift+Tab, code &19A on the bare path; `cellTab` is Ctrl+Tab (C3.3, R21: code &1AA on the bare path; `EditKeys` uses it only in a table's cell, a tab character, and passes it on elsewhere); Ctrl+Shift+Tab and Alt-Tab stay null; `splitTable` is Ctrl+Shift+Enter (C4.1, R21, Word's key; `menu: 'Table'`; outside a table it beeps); and the Format rows (`menu: 'Format'`) `bold` Ctrl+B, `italic` Ctrl+I, `underline` Ctrl+U, `alignLeft` Ctrl+L, `alignCenter` Ctrl+E, `alignRight` Ctrl+R, `alignJustify` Ctrl+J, `clearFormat` Ctrl+Space, `superscript` Ctrl+Shift+= (or `+`), `subscript` Ctrl+=, `fontBigger` Ctrl+Shift+> (or `.`), `fontSmaller` Ctrl+Shift+< (or `,`), `indentMore` Ctrl+M, `indentLess` Ctrl+Shift+M, `lineSingle` Ctrl+1, `lineDouble` Ctrl+2, `line15` Ctrl+5, `spaceBefore12` Ctrl+0, `bullets` Ctrl+Shift+L (Word's, a Mac too: `MacKeys` never maps Cmd-Shift-L, Safari's sidebar; the browser names them `1`...; on a Mac too it is Ctrl, as `MacKeys` never maps Cmd+digit, the browser's tab switch); the window rows (`menu: 'Window'`, ids in `WINDOW`, run by `DocKeys`) `new` F2 / Ctrl+N, `close` Ctrl+F2, `save` Ctrl+S, `saveBox` F3, `find` Ctrl+F / F4 (the menu label is Ctrl+F), `replace` Ctrl+H (with a key name only: the bare code 8 stays Backspace), `findNext` Ctrl+G, `findPrev` Ctrl+Shift+G, `sendToBack` Ctrl+F10, `hyperlink` Ctrl+K (A6.1: the Hyperlink box; Cmd+K on a Mac); `undo` also F8 and `redo` F9 (Edit's keys; F1, F5-F7, F10-F12 and other Shift forms have no row); key names may be any printable ASCII character, `Space` or a function key `F1`..`F12` (on the bare-code path &181..&189 and &1CA..&1CC, +&10 Shift, +&20 Ctrl); on the bare-code path codes 1..26 are Ctrl-letters except 8, 9 and 13 (Backspace, Tab, Enter), so Ctrl-I and Ctrl-M work only with a key name; the browser key name and flags decide, the Wimp code alone only without a name; Alt and unmapped keys give null so the key propagates; movement and Ctrl-A stay with `Keys`), `labelFor(id)` (Word style `Ctrl+Z`, `Ctrl+F2`; not RISC OS's `^F2`), `row(id)`; `keymap` is the default table (Ctrl+Y and Ctrl+Shift+Z both redo) |
| `Format`, `FormatSet`, `FormatPara`, `FormatOps`, `FormatEff`, `FormatCheck`, `Pending` | formatting, pure. `Format.query(doc, sel, pending?)` -> `{bold, italic, underline, strike, size (pt), family, color ('RRGGBB'/'auto'), highlight, vert, align, indentLeft, indentFirst, indentRight, spaceBefore, spaceAfter (twips), lineSpacing {line, rule}, style, contextual, keepNext, keepLines, widowControl, pageBreakBefore, listKind ('bullet'/'number'), listEntry (a `ListGallery` id), charShade, paraShade (the shading in force, `{val, color?, fill?}` whole from the highest layer giving one, or `'none'`), borders (the sides drawn, `{top?, left?, bottom?, right?, between?}` of model sides, `{}` for none: `BorderResolve`)}` from the resolved formatting (the list values from `ListMake.listFacts`, `null` for a paragraph in no list as for mixed ones) (a raw `w:spacing` counts: `SpacingRaw`; `widowControl` is on unless some layer turns it off, Word's default), `null` when mixed; a caret: the format typed text gets there plus `pending`. `FormatSet` commands `(d, typing, sel, ..., pending?) -> {sel, pending}`: `toggle(key)` (bold italic underline strike superscript subscript; Word's rule: all have it -> off, else on), `setChar(patch)` (`FormatCheck.charPatch`: b i u strike sz color highlight vertAlign rFonts), `sizeBy(steps)` (`stepSize`: Word's list 8..72, then tens to 400), `clearFormat`, `applyStyle(id)` (paragraph or character style; unknown id: RangeError), `setPara(patch)` (jc, ind, spacing, the flow flags; firstLine/hanging exclusive; `line` and `lineRule` always written together; a raw `w:spacing` patched in place: `SpacingRaw`), `indentBy(twips)` (from the left indent drawn: `ParaInd`), `clearParaFormat`, `setList`, `listParas` (`FormatList`); a caret: character commands change nothing and return the new pending format, paragraph commands format its paragraph; a selection: one undo step (`typing.command` + `d.atomic`), pending cleared; values equal to the style's are removed (`null`), others explicit (`b:false` in a heading; bold compared as `Fmt.sizeBold` shows it, and a size change that would switch the heading-bold rule writes `b` so the text stays as bold as it was; `szCs` against the inherited `szCs`; `firstLine`/`hanging` as one value: `firstLine: 0` cancels a style's hanging; both at once refused). Only paragraph/character style ids are accepted by `applyStyle` (table/numbering: RangeError). A value equal to the style's still makes an op when a raw element of that name is in `extra`, so it is replaced (`FormatOps.changes` follows `setProps`, including a raw `w:pStyle`/`w:rStyle` when the style is set or removed). A size is removed only when the style chain gives that very size; where no style gives one it is always written (Word shows 10 pt there, !Letters assumes 11 pt, so the file says what was chosen: 11 pt in such a document is `sz` 22); a size change sets `b` to what keeps the text as bold as it was, removed when the rest gives it (so `{sz: null}` in a heading leaves no `b: true`). Character formatting skips the U+FFFC of a level-`p` inline (a hyperlink, a kept run, a bookmark: `FormatOps.pieces`): the writer puts such an inline outside any run, so a format on its run could not be saved (found by `format-roundtrip.test.mjs`); `Format.query` and the toggle rule skip it too. `FormatOps`: `touched(doc, sel)` -> `[{at, p, a, e, para}]` (C3.5: through `SelShape.paraRanges`, so every formatting command, the list commands, change case, the painter, `Format.query`, the Tabs box and the ruler act on a `cells` rectangle's paragraphs only, a `mixed` range's touched rows whole, and text inside one cell; `at` the paragraph's path; kept blocks skipped; the to-end's paragraph reached only at offset 0 in the ends' container gets no paragraph formatting; null for an invalid selection), `buildOps` (one `setProps` per paragraph, or per stretch of runs formatted alike; runs it would not change get none). `FormatCheck`: `charPatch` (also `shd {val, color?, fill?}`), `paraPatch` (also `keepNext keepLines widowControl pageBreakBefore contextualSpacing` true/false/null, `spacing.lineRule`, `tabs` (at most `MAX_TABS` 64 stops, positions clamped to +-31680, none twice at one position, a new array in the order given), `pBdr` (sides `{val, sz 0..96, space 0..31, color, shadow, frame}` or null), `shd`; no command sends the new keys yet and `FormatPara.explicit` writes only `jc ind spacing`) (checks the patch a command may carry: a bad key or value is a RangeError), `HIGHLIGHTS` (the highlight names). `Pending`: `merge`, `isEmpty`, `forTyping`, `styleFor`, `applyTo`, `onRun`. 50,000 paragraphs: bold 0.13 s, alignment 0.1 s, undo of both 24 ms (the rules and numbers below) |
| `EditKeys`, `EditInput`, `EditMenu`, `EditApply` | editing in the window. `EditKeys.keyFor(view, ev)` (pure): Escape during a picture's handle drag (`view.picDrag`) only cancels it (ghost gone, nothing changed); `MacKeys.macKey(ev, view.mac)` first (Cmd as Ctrl on a Mac), then `Keys.command` (movement, Ctrl-A, Escape), then `Keymap.lookup` -> `view.run(id)` (C3.3, D10: first, with the selection's head in a table's cell, `tab` / `shiftTab` select the next / previous cell's content through `SelTable.cellTabTarget`, in a list paragraph too; Tab in the last cell (`cellTabTarget` `'last'` going forward) is `view.run('tabRow')` (C4.1: a row below the last one, the caret in its first cell, `TblCmd.tabRowCmd`); Shift-Tab at the first cell is used and nothing happens; `cellTab` (Ctrl+Tab) types a tab character through `view.input`, and outside a cell goes on, `undefined`, R21) (a repeat of `new`, `close`, `save` or `saveBox` is used up: `DocKeys`), then a printable key that still arrives as `key` (the proxy lost the browser focus, or `Wimp_ProcessKey`) is typed: exactly one character (not a C0/C1 control), and none of Ctrl, Alt or Meta (Cmd: a browser shortcut such as Cmd-C is never text; Ctrl and Alt are read from the Wimp event's flags, and Ctrl, Alt and Meta from the DOM event's `ctrlKey/altKey/metaKey`: the Wimp event has no Meta flag), and not an event whose DOM target is the text-input field while it has the focus (`view.fromProxy(ev)`, made by `EditInput`: such a key was not typed there, so it is not text); anything else `undefined`, so the key goes on to the desktop (F1, F5-F7, F10, F11, Shift- and Alt- forms, Ctrl-Q, Alt-letters, other Cmd-letters; F12 and its forms never reach the window: the Wimp takes them first). The routing order is therefore: `Keys.command` (movement, Ctrl-A, Escape), `Keymap.lookup` (editing), the printable fallback. `EditInput` also holds `showCaret(v, take)` (the Wimp's caret at `v.caretRect()`, zoomed: the proxy field and an input method's candidates follow it), `inputView(v, text, {composed})` (a single space may then run `AutoList.afterSpace`: see the AutoList row) and `composeView(v, text)` for `EditView`. `EditInput.attachInput(view)` (the proxy contract is in `docs/CORE_API.md` 3.1/3.2: committed text, composition, composition end; plain printable keys never arrive as `key` while the field has the focus; Backspace, Delete, Enter, Tab, arrows and Ctrl/Cmd keys do): `textinput` -> `view.input` (one event is one edit and one undo step, however long, at most 100,000 characters), `composition` -> `view.compose(text)`, `compositionend`/`losecaret` clear it; events for a closed window are ignored; `view.lateCommit` (`{text, at}`, set by `DocSave` when a save types the composing text itself): the next `textinput` equal to it within `LATE_MS` (800 ms) is dropped once; any other `textinput`, `composition`, `key`, `click`, `doubleclick`, `drag` or `losecaret` clears it (`first` handlers), so the same text typed on purpose is kept. `EditMenu.editMenu(view)`: Undo `Ctrl+Z`, Redo `Ctrl+Y` (shaded by `canUndo`/`canRedo`), Cut `Ctrl+X`, Copy `Ctrl+C` (shaded without a selection), Paste `Ctrl+V` (never shaded; `EditClip`), Select all `Ctrl+A`, Find... `Ctrl+F`, Find next `Ctrl+G`, Find previous `Ctrl+Shift+G`, Replace... `Ctrl+H` (never shaded; each `view.run(id)` -> `DocKeys` -> `EditFind`; F4 named in Find...'s help), Word count... last (no key, A6.4: `editMenu(view, {count})`, shaded without a selection: `CountBox`), labels from `Keymap.labelFor` (Undo and Redo keep Word's labels; F8 and F9 also undo and redo, named in their help). `EditApply` (pure): `run(id, d, typing, sel, {autoList, arg}?)` (enter shiftEnter backspace delete ctrlBackspace ctrlDelete tab shiftTab through `typing.command`; tab, shiftTab and backspace via `EditList`; shiftTab outside a list `undefined`; backspace, delete, ctrlBackspace and ctrlDelete first try `SectBreak.deleteBreakAt` (at a section edge: the break removed, a step of its own, the caret stays; the next press merges paragraphs as before); the table commands `TblCmdCols.TABLE` (`tabRow`, `splitTable`, `rowsAbove`, `rowsBelow`, `deleteRows`, C4.1; `colsLeft`, `colsRight`, `deleteCols`, `selectCell`, `selectRow`, `selectColumn`, `selectTable`, `distributeRows`, `distributeCols`, C4.2, given `arg`: `{L}` from `EditRun`) through `typing.command`, null where they cannot apply; any other id goes to `InsertApply.insert` (`pageBreak`, `sectionNext`, `sectionContinuous`), `undefined` when it is none of its ids either; with `autoList`, `AutoList.afterSpace` after a `tab` at a caret), `stepEnd(doc, ops, oldL)`: the caret after undo/redo from the last leaf op applied, over all the change's ops with compounds opened (setDocParts and setSections skipped) (spliceText/replaceText: `at` + inserted length; restoreBlock: where the restored paragraph first differs from the one of that id in `oldL`, so undoing Enter goes back to the split point (a table, R18, C3.4: the start of the first paragraph of its first row that is not the very row object of `oldL`'s table at that index, else row 0: a table command undone puts the caret in the rows it changed; C4.1: when every row is `oldL`'s at its index but `oldL`'s table had more (rows at the end undone: Tab's new row), the end of its last paragraph); splitBlock: start of the new paragraph; insertBlock(s): start of the first (a typed table: its first paragraph, R18's row 0, C4.1); removeBlock(s): end of the block before the gap; mergeBlock/setProps: start of that paragraph; splitSection/mergeSection: start of the paragraph at the split, for a merge the section-end mark found in `oldL` (else the section's first block); a setDocPart or setSection is skipped (the op before it decides; only those: `null`, the selection stays)) |
| `BreakMarks`, `InsertApply` | page and column breaks (Batch A, A3.1), pure. `BreakMarks`: `isPageBreak(x)` (a `br` inline of `brType` `page` or `column`; any other `br` is a line break), `breakLabel(x)` (`'Page break'` / `'Column break'` / `''`), `pbToken(x, i, f)` (`LineTokens`' `'pb'` token: kind `'pagebreak'`, `[i, i+1)`, shown, `label`), `ruleFit(x, maxX, real) -> {wrap, w}` (the rule runs from where the text ends to the line's end, at least `MIN_RULE` 90 px; less left on a line that holds something: wrap first), `ruleLit(it)` (selected, only the first `LIT` 8 px are lit), `rulePaint(it, labelW)` (`DocPaint`'s dots either side of the label, the label centred; no room: dots only). `LineLayout` places the `'pb'` token: the line ends there (`endsWithBreak`); a break followed by nothing but unseen inlines ends the paragraph on that line (no empty line after it: the paragraph mark shares the rule's line, as in Word), so `PositionMap.lineEnd` on the last line is the paragraph end; the item has `hl` null and `label`; `line.ink` is the rule's end (alignment never moves it). `InsertApply`: `insert(id, d, typing, sel, arg)` (the Insert menu's ids through `typing.command`: one undo step; unknown ids and no selection `undefined`; ids looked up in a `Map`), `putIn(d, sel, ins, x?, fmt?)` (exported for `InsertPicture`: text or one U+FFFC for inline `x` at `sel` in one `d.atomic`, the selection deleted, a paragraph at a kept block's edge; a caret after it), `pageBreak(d, sel)` (one `d.atomic`: the selection deleted, a table edge given an empty paragraph, `replaceText` of a U+FFFC with `{kind: 'br', level: 'r', brType: 'page'}` (no node; written `<w:br w:type="page"/>` in a run with the format of the text before it), then `EditPara.splitAt` after it (Word 2013's form: the break ends its paragraph; the new paragraph has a fresh id, the same pPr and pStyle, so a list goes on; after a heading the next style); caret at the new paragraph's start). `EditApply.run` passes any id it does not know to `insert` (with `{arg}`); `Keymap` row `pageBreak` `Ctrl+Enter` (menu `Insert`). A5.3 adds `nbsp`, `nbHyphen` and `softHyphen` to `InsertApply` (below) |
| `SectBreak`, `SectDeco`, `SectMark` | section breaks (Batch A, A3.2), pure. `SectMark` (no editing imports, for the layout): `markOf`, `sectLabel` (below; `SectBreak` re-exports them). `SectBreak`: `insertSection(d, typing, sel, type)` (`type` `nextPage`, `continuous`, `evenPage` or `oddPage`, else `undefined`; one `typing.command` + `d.atomic`: the selection deleted, a table edge given an empty paragraph, the paragraph split (`EditPara.splitAt`) or an empty one used, then `splitSection` with the old section's props/raw (a copy: the section before the break) and `setSection` giving the section after it the original sectPr with `type`; caret at the start of the block after the break), `deleteBreakAt(d, sel, dir) -> sel \| undefined` (Delete, dir 1, at the end of a section's last paragraph; Backspace, -1, at the start of the next section's first block: `mergeSection` and, when the types differ, `setSection` with the earlier section's type; `undefined` anywhere else and when the earlier section ends with a kept block), `markOf(doc, s) -> {type} \| null` (`DocItems`' mark), `sectLabel(type)` (`'Section break (Next page)'`, `(Continuous)`, `(Even page)`, `(Odd page)`, `(Next column)`, anything else `'Section break'`; a `Map`). `SectDeco`: `sectDeco(item)` (the `DocStack` decorator: an item with a mark gets `gapBelow` `BAND` (18) and a mark `{kind: 'section', type, label, dy: 0, h: 18}`; no `keyOf`: the mark is in the reuse key), `bandOf(item)`, `inBand(item, y)` (`DocLayout.hitTest`), `bandPaint(mark, w, labelW) -> {y1, y2, dots, label}` (`DocPaint`'s double dotted rule, the label centred with 6 px round it, none when it does not fit). `InsertApply` ids `sectionNext`, `sectionContinuous` (`Keymap` rows without keys, menu `Insert`: the menu itself is A3.3) |
| `InsertMenu`, `FlowDeco` | the Insert menu and page break before (Batch A, A3.3). `InsertMenu` (desktop: imports `'riscos'`): `insertMenu(dw) -> Menu('Insert')`, the window menu's item after Edit (`WinMenu`): Page break (`Ctrl+Enter` from `Keymap.labelFor('pageBreak')` through `MacKeys.macLabel`, which leaves it `Ctrl+Enter` on a Mac too; runs `view.run('pageBreak')`), Section break > (`sectionMenu(view)`: Next page, Continuous, no keys; `view.run(id)`), then Picture... (B4.2: `PicInsertBox.picInsertBox(dw)`) and Symbol... (A5.3: `SymbolBind.openSymbols(dw)`), Special character > (A5.3: `specialMenu(dw)`, the 16 items of `SpecialChars` with the keys of `nbsp` and `nbHyphen` from `Keymap` through `macLabel`; each `insertSpecial(dw, item)`), then Hyperlink... (A6.1: `key` from `Keymap.labelFor('hyperlink')` through `macLabel`, `Ctrl+K` / `Cmd+K`; opens `LinkBox.linkBox(dw)`) and Bookmark... (A6.2: `Ctrl+Shift+F5`, also on a Mac; opens `BookmarkBox.bookmarkBox(dw)`). Table... (C4.4: `TblInsertBox.tblInsertBox(dw)`) and Tab (C4.4: `TblMenu.cellTabItem(dw)`, a tab in a cell) come after Section break. Every item is shaded without a selection (Tab: unless the caret is in a cell). `FlowDeco` (pure): `breaksBefore(styles, para)` (the last `paraLayers` layer with a boolean `pageBreakBefore`), `flowDeco(item, L)` (the DocStack decorator: `{gapAbove: 12, marks: [{kind: 'flow', label: 'Page break before', dy: -12, h: 12}]}` for a paragraph with the flag, else null; no `keyOf`: it reads only the paragraph and `doc.styles`, both in the reuse key), `flowMark(item)`, `flowPaint(mark, w, labelW)`, `GAP`. `ParaSpace.spacingDeco` returns null for a paragraph with the flag (no contextual cut across a page); `DocPaint.paintFlow` draws the single grey dotted rule in the gap |
| `BorderResolve`, `BorderGroups`, `BorderPaint`, `MarkPaint` | paragraph borders and shading, character shading, on the screen (Batch A, A5.1), pure. `BorderResolve`: `paraBorders(styles, para)` / `bordersOf(layers)` -> `{pBdr, shd}` (each side from the highest `Styles.paraLayers` layer giving it, WHOLE; `shd` whole from the highest layer: not `mergeInto`'s attribute-by-attribute merge, which `resolvePara` still does), `runShade(styles, para, run)` (`Styles.runLayers`), `shadeCss(shd)` (clear: the fill; solid: the colour; `pctN`: N% of the colour over the fill; other patterns half and half; colour auto black, fill auto none / white under a pattern; nil none), `edgeOf(side)` -> `{style, sz, lw, t, space, color, shadow}` or null (single double dotted dashed thick drawn, any other val as single; nil / none / no good val: no side; `sz` eighths of a point clamped 2..96, 4 when missing, `lw = max(1, round(sz / 6))` px, `t` 3 lw for double; `space` points clamped 0..31, px `round(space * 4 / 3)`; colour auto black); a layer whose field is absent but whose `extra` keeps a `w:pBdr` / `w:shd` raw (theme colours, w14 attributes, Strict `w:start` / `w:end` as left / right) is read best effort (the first one matched by namespace; good `w:val w:sz w:space w:color w:fill w:shadow w:frame` only, others ignored: a theme colour shows as the `w:color` / `w:fill` written beside it); nothing raw is changed. `BorderGroups`: `boxInfo(styles, para, levelInd?)` (null without a drawn side or a fill; else frozen `{sides, fill, left, inL, right, any, breaks, k}`: inL the box's inner left edge, the left indent or the first line's when further left; indents resolved from the layers by `resolvePara`'s rule for ind, `Fmt.indentPx`; cached per paragraph object (per style when the paragraph's own pPr gives no borders, shading, indents or page break before and keeps nothing raw) for the same styles object and level indent; paragraphs that look the same share one info), `borderDeco` (the `DocStack` decorator: `{gapAbove: padTop, gapBelow: padBottom, marks: [mark]}`; results shared per info and way of joining), `k` the side definitions (every side, attribute by attribute) and the left and right indents: what two paragraphs need equal to share a box; `borderDeco.keyOf` (`[the lines (or kept block) above, below, the column's width]`, null when the item's result has no box), `boxMark(item)`; the mark `{kind: 'border', inL, inR, fill, joinAbove, joinBelow, padTop, padBottom, top?, between?, bottom?, left?, right?}`. `BorderPaint`: `geometry(m, it, prev, left)` -> `{fill, edges}`, `paintFill`, `paintEdges` (edges cut to rect's rows), `edge(g, e, rect?)`. `MarkPaint` (moved out of `DocPaint`): `paintBand`, `paintFlow` (across the item's column, `it.x` / `it.w`), `paintRule(g, x, left, top, h)` (C2.1: the column's `left` instead of `L`). Rules: "Borders and shading on the screen (Batch A, A5.1): the rules" below |
| `BorderNames`, `BorderPatch`, `BorderExplicit`, `BorderCommand`, `BorderBox` | the Borders and shading dialogue box and commands (Batch A, A5.2). `BorderNames` (pure): `BORDER_VALS` (the 193 `ST_Border` names of wml.xsd, schema order) and `SHD_VALS` (the 38 `ST_Shd` names): `FormatCheck` accepts only these for a command's side `val` / `shd` `val` (the reader keeps any name, `ReadPropsMore.NAME`). `BorderPatch` (pure): `fill(q, apply)` -> `{setting, top, bottom, left, right, between, style, width, colour, fillkind, fill, apply}` from `Format.query`'s `borders` / `paraShade` / `charShade` (mixed or not offered: undefined), `settingOf`, `sidesOf`, `patch(values, q) -> {id, arg, bad}` (compared with `fill(q, apply)`; `id` `'borders'` with `{pBdr?, shd?}` or `'charShade'` with the shd; `arg` undefined when nothing changes), `STYLES` (single double dotted dashed thick), `WIDTHS` (2 4 6 8 12 18 24 eighths), `SIDES5`, `NAMES`. `BorderExplicit` (pure): `boxExplicit(v, res, p)` (called by `FormatPara.explicit` for `pBdr` / `shd`: whole sides and whole shading, every attribute key given, null for the absent ones, so `OpsProps.mergeProps` replaces rather than merges; null over a side the styles draw is `{val: 'nil'}`, over their shading `NO_SHADE` clear/auto/auto; a value the styles give is not written; what the styles give from `Styles.paraLayers` + `BorderResolve.bordersOf`, cached per resolver), `runShade(shd, res, p, r)` (the same for `rPr.shd`, `BorderResolve.runShade`), `isRawOwn(props, key)`, `NO_SHADE`; a paragraph's own raw `w:pBdr` (`w:shd`) refuses a change of borders (shading) with RangeError, a run's own raw `w:shd` a change of its shading. `BorderCommand` (pure): `borders(d, typing, sel, {pBdr?, shd?}, pending)` (`FormatSet.setPara`), `paraShade`, `charShade` (`FormatSet.charCommand`, now exported: the selected runs, at a caret the pending format): `FormatApply` ids `borders`, `paraShade`, `charShade`. `BorderBox` (desktop, imports `wimp` for the beep): `borderBox(dw)`, key `borders:<docKey>`, `dw.boxes` `'borders'` (CloseDoc deletes it), Cancel + OK; `FormatMenu` item `Borders and shading...` (option `borders`), `WinMenu` passes it. Rules: "The Borders and shading dialog (Batch A, A5.2): the rules" below |
| `PicDrop` | files dropped on a window (B5; desktop: imports `'riscos'`). `dropFiles(dw, ev)` (the `dataload` handler of `AppWin`) -> `true`: the first non-directory file whose `filetype` is in `PIC_TYPES` (`0xB60` PNG, `0xC85` JPEG, `0x695` GIF) goes in through `PicLoad.putPicture(dw, () => vfs.readFile(path), {at})`, `at` = `v.hitAt(ev.x, ev.y)?.pos` (else the selection; a window with no selection takes the drop at `at`, and with neither the drop beeps: final review M8); over 20 MB (`size` of the event): beep and `MSG.tooBig`, no read; further picture files are ignored (never opened as documents); while `v.comp` is set the picture is refused with a beep; `dropPending(v)` first, as paste does; every other non-directory file is `app.open(path)` as before. `putPicture(dw, read, {at, live})` never rejects: `live()` false (the box was cancelled) or the document closed during the read give a quiet `false`; an unexpected error is reported (`MSG.failed`); `no-package` says `MSG.noPackage`, `name` `MSG.name` ("No picture name is free in this document."). `PicInsertBox` clears its busy flag in `finally` and wires its handlers once. Test: `word-pictures-insert.mjs` |
| `PicPatch`, `PicBox` | the Picture dialogue box (Batch B, B6; `PicBox` is desktop: imports `'riscos'`). `PicPatch` (pure): `fill(pic, info) -> {width, height, keep: true, alt, shaded}` (`pic` is `pictureOf`'s result, `info` `imageInfo`'s; twips = EMU / 635; `shaded` names `width height keep reset` for a floating or unsupported picture (R12, R2), `reset` without a natural size, `alt` (value undefined: left unchanged) for a `descr` over 1024 characters (R17; tabs and line ends are allowed in alt text, shown without them and kept unless the text is edited)); `patchOf(values, pic, reset?) -> {cx?, cy?, descr?} \| {error}` (only what changed, compared as the field shows it (0.01"); one side changed with Keep proportions: the other follows by the extent's ratio; both changed: both as given; `reset` (the natural `{cx, cy}` Reset size put in the fields): when the fields still show it (0.01"), exactly that extent; errors `'range'` (a side not 15..31680 twips, an emptied field (undefined), text that is not a length (null), or the follower out of range: never clamped) and `'alt'` (a control character other than tab, LF, CR: `PicOps.CONTROL`); size values of a floating or unsupported picture are ignored, alt is not). `PicBox.picBox(dw)`: key `'pic:' + dw.docKey`, kept in `dw.boxes` ('pic'); rows Width, Height (inches; the fields carry min -1000000 / max 1000000 twips only so that `readField` never clamps: the range check is `patchOf`'s), the option Keep proportions, a row button Reset size (Width and Height from `naturalEmu`, not applied until OK), Alt text (1024, w 360; emptied = the description removed), a message line; buttons Cancel, OK. OK: `v.typing.command(() => setPicture(v.d, v.sel, patch))` then `v.edited(sel)`; nothing changed makes no step; an error beeps, says why in the message line and keeps the box. A selection or document that changed since the box was filled (`where`: both ends and `stateId`) beeps and refills the box from the picture then selected, or says there is none. Nothing selected / not a picture: `null` and a beep. Opened by Format > Picture... (`FormatMenu` option `picture`, shaded unless `selectedPic`; `WinMenu` passes `picBox`) and by `view.onPicture` (`DocKeys`: `PicDrag`'s double-click). Tests: `picpatch.test.mjs`, browser `word-picbox.mjs`. |
| `PicLoad`, `PicInsertBox` | Insert > Picture... (Batch B, B4.2; both desktop: import `'riscos'`). `PicLoad.putPicture(dw, read, {at}?) -> Promise<boolean>`: awaits `read()` (bytes only from there: a `vfs` file, later a pasted File), then (R11) puts the picture in only when `dw` is not closed, its window open and the selection and `d.stateId` are as when the read began (else a beep and `MSG.changed`); runs `InsertPicture.insert` in `v.typing.command` at the selection or at `caret(at)`, `v.edited(sel)` (the picture selected); every `RangeError` code of `insert` (`not-image`, `too-big`, `too-large`, `ids`, `no-package`, `name`: "No picture name is free in this document.") and a failed read gives a beep and `reportError(MSG..., {appName: 'Letters'})`, nothing changed. `PicInsertBox.picInsertBox(dw)`: `Ui/Dialog` key `picins:<docKey>`, kept in `dw.boxes` ('picins'), rows Path (255, w 360) and a message label, buttons Cancel / Insert; null without a selection; a `dataload` on the box fills Path with the first non-directory file; Insert checks (R19 `://` refused, `vfs.stat`: missing, a directory, over 20 MB: message in the box, beep, box kept), then `putPicture(dw, () => vfs.readFile(path))`; the box stays (returns false, one read at a time) until the picture is in, then is deleted and the caret returns to the document. `InsertMenu`: Picture... between Section break and Symbol..., shaded without a selection. Test: `word-pictures-insert.mjs` |
| `SpecialChars`, `SymbolBind` | Insert > Symbol... and Special character (Batch A, A5.3). `SpecialChars` (pure): `SPECIAL` (frozen, menu order: Em dash `\u2014`, En dash, Non-breaking space (`cmd: 'nbsp'`), Non-breaking hyphen (`'nbHyphen'`), Optional hyphen (`'softHyphen'`), Copyright, Registered, Trademark, Section, Paragraph, Ellipsis, Single / Double opening / closing quote, Degree; an item has `ch` (typed as text) or `cmd` (a `Keymap` id for `view.run`); every `ch` is in a `CharSets` set, so in every bundled font: tested), `specialFor(text)`. `SymbolBind` (desktop: imports `'riscos'` for `beep`): `attachSymbols(dw)` (from `DocKeys.attachKeys`: the document whose window last gained the caret is the grid's `active`, cleared on `deleted`: the pattern of `EditFind.attachFind`), `openSymbols(dw)` (makes dw active and opens the task's `Ui/CharGrid`, title `Symbol`), `putChar(dw, ch) -> bool` (`view.typing.reset()`, `view.input(ch)`, `reset()` again: the typed path, so the PENDING format and a replaced selection work as for typing, but always one undo step of its own; false when the document is gone, has no selection or `stateId` did not change), `insertSpecial(dw, item)` (a `ch` and the no-break space through `putChar`; the other commands `view.run(cmd)`), `symbolsHook(app)` -> `task.word.symbols`: `{grid, active, open(), withSets(sets)}`. The grid's Insert / Return / double-click call `putChar` for the active document and then `dw.view.focus()` (the caret back for the next key); with none alive: `wimp.beep()` and the status line says `No document to insert into: click in one first.`; `onClose` also gives the caret back |
| `LinkOps`, `LinkParts`, `LinkFind`, `LinkUrl`, `LinkBox` | hyperlinks (Batch A, A6.1). `LinkUrl` (pure): `cleanUrl(text) -> {url} \| {error}` (trimmed; `www.` gets `http://`; scheme `http` `https` `mailto` `ftp` only, in lower case; `javascript:`, `data:`, `file:`, `vbscript:`, none... refused with a message; http/https/ftp need `//` and a host without spaces, mailto something after it; C0, DEL, C1 and lone surrogates refused; a space, non-ASCII (an IRI) and `" < > \ ^ \` { \| }`, a `%` not before two hex digits percent-encoded as UTF-8; at most `MAX` 2048 characters, before and after encoding), `checkAnchor(name)` (1..255 characters, no white space, `#`, controls, U+FFF9..U+FFFD or non-characters), `parseAddress(text)` (`#name` -> `{anchor}`, else `cleanUrl`). `LinkFind` (pure): `isLink(x)` (a raw level-`p` inline whose node is a `w:hyperlink`), `docMap(doc)` (`WriteBody.docScope(doc).map`, null when refused), `linkAt(doc, sel) -> {at, p, off, x} \| null` (the selection is the link's U+FFFC alone, or a caret next to one: the one before first), `linkInfo(doc, x) -> {text, address, tip}` (the `r:id` relationship's target, `''` when `doc.rels` has none; `#anchor` after it; `w:tooltip`), `linkRange(doc, sel) -> {o, a, z, kept} \| {error}` (one paragraph, or a caret on a kept block's edge; refused across paragraphs, over a table, and round any level-`p` inline: a link (so links never nest), a bookmark...), `selInfo(doc, sel) -> {text, plain} \| {error}` (plain: no item, tab or line break), `linkUnder(L, x, y) -> {id, off, x} \| null` (the `kind: 'link'` line item under a layout point; a later piece `[i+1, i+1)` stands for `i`). `LinkParts` (pure, taken out of `LinkOps`): `clean`, `cleanText` (an untouched field compares equal: insert keeps the selection's runs when the box's text equals its cleaned text, edit leaves text and tip whose cleaned forms are unchanged, so spaces at the ends are not a change), `target`, `withTarget`, `withTip`, `runNodes`, `styleFor`, `shown`, `linkX`, `ONE`, `inside`. `LinkOps` (pure; re-exports the four): `insertLink / editLink (d, typing, sel, {text, address, anchor, tip})`, `removeLink(d, typing, sel)` -> `{sel} \| {error}`; one undo step each (`typing.command` + `d.atomic`: `setDocPart rels` (a NEW array from `DocParts.addRel`, kind `hyperlink`, External, Strict type when `meta.conformance === 'strict'`; a new relationship per link and per address change, the old one left: an unused relationship is valid), `setDocPart styles` (`DocParts.hyperlinkStyle`, first use only), then one `spliceText`); none when nothing changes. Insert: the selected content (`OpsUtil.cut`) written as `w:r` runs by `WritePara.paraNode` with each run's format and `rStyle` set to the Hyperlink style (none when there is no style table), inside `<w:hyperlink r:id="rIdN" w:history="1">` (an `xmlns:<p>` for the relationships namespace is put on the element when the root binds none) or `w:anchor="name"` (no relationship), `w:tooltip` for a ScreenTip; text given that differs from the selection (or at a caret) is one run in the format there (`OpsText.fmtAt`), the address itself when there is no text; a caret on a table's edge gets a paragraph first (`EditRange.paraBy`); the link is one U+FFFC in a plain run, the caret after it. Edit: only fields given that differ (text: one run in the format of the link's first run; address: the old `r:id` / `w:anchor` replaced; tip: `w:tooltip` set or removed); the other attributes and children kept. Remove: the link's children read by `ReadPara.readPara` (a `w:p` made of them, in the element's scope) and spliced in its place, the Hyperlink `rStyle` dropped (other styles kept), the text selected (after a caret: the caret after it); a link starting with a `w:pPr` child is refused. Text and ScreenTip: C0/C1 controls and U+FFFC become spaces, trimmed, at most 1024 / 255. The bookmark lookups A6.1 had in `LinkMarks` (`bookmarkNames`, `linkNames`, `findBookmark`) are now `BookmarkFind`'s (A6.2, next row; `LinkMarks` is gone). `LinkBox` (desktop: imports `'riscos'` for `beep`): `linkBox(dw)` -> the WimpLib `Ui/Dialog` keyed `link:<docKey>`, kept in `dw.boxes` ('link', deleted by `CloseDoc` with the document); title `Edit hyperlink` on a link (`linkAt`), else `Insert hyperlink`; fields `text` (shaded and left out when the selection holds items, tabs or breaks, or is longer than the field; a link's text, address or tip longer than its field (1000, 1000, 255) likewise shaded and passed as unchanged, never cut short), `address` with the `marks` popup (`(none)` and `linkNames`; a pick puts `#name` in the address), `tip`, message lines `msg` / `msg2`; buttons `Remove link` (shaded unless editing), `Cancel`, `OK` (Return). Refusals (a place a link cannot go, at once on opening; a refused address; a document or selection changed while open: refilled) beep and say why in the message lines, the box kept; done: `EditFormat.dropPending`, `view.edited(sel)`, `view.focus()` |
| `Bookmarks`, `BookmarkFind`, `BookmarkKeep`, `BookmarkBox` | bookmarks (Batch A, A6.2). A bookmark is a pair of raw level-`p` inlines `<w:bookmarkStart w:id="N" w:name="name"/>` / `<w:bookmarkEnd w:id="N"/>` round the selection (a caret: the two together), each a U+FFFC in a run with the format there (`OpsText.fmtAt`, so text typed after it keeps it; the reader gives such inlines a plain run, so a file read back differs only there). `BookmarkFind` (pure; the ONE bookmark lookup, also for links): `marks(doc)` (every `bookmarkStart`/`bookmarkEnd` in document order, `{kind, name, id, at, off, table, direct}` (`at` the block's path): walked through the model (`Walk.forEachBlock`, C1.6; XML only inside an Opaque block or an inline), so a typed table gives its cell paragraphs' marks, its kept cell blocks' and its loose marks (`Walk.loose`: before a row, before a cell, after a row's cells, after the last row) in document order, nested tables too; in a paragraph at its U+FFFC (inside a wrapper: the wrapper's), in a typed table's cell paragraph the same at its path (C3.5: R11's edge gone), a typed table's loose mark at a paragraph's edge (a row's or a cell's lead: the start of that row's / cell's first paragraph; a row's tail: the end of its last cell's last paragraph; the table's tail: the end of the last cell's), in a kept block (an Opaque table, an Opaque cell block) `table: true` at its own path, `off` 0; `direct` when the mark is a level-`p` inline itself (loose and kept marks are not: they cannot be moved or deleted); the walk stops after 1,000,000 nodes, `marks.complete` false), `pairs(doc)` (one per named start; each end goes with the earliest start before it with its id that has none: two starts with one id take the ends in turn), `findPair(ps, name)` (exact, else case ignored), `list(doc, {hidden, sort})` -> `[{name, id, at: {at, off} \| null}]` (C3.5: `at` the path; null in a kept block) (one per name ignoring case, the first; `_` names only with `hidden`; `sort` `'location'` or `'name'`: case ignored, by UTF-16 code units), `bookmarkNames(doc, {hidden, max = 500})`, `linkNames(doc)` (the Hyperlink box's popup: without names `LinkUrl.checkAnchor` refuses), `findBookmark(doc, name) -> {id, off} \| null` (a Ctrl-click on a link: the start's U+FFFC, in a cell too; a kept block's `{id, off: 0}`). `Bookmarks` (pure; re-exports `list`, `bookmarkNames`, `linkNames`, `findBookmark`): `checkName(name)` (null or why: a letter (`\p{L}`) first, then letters, digits (`\p{Nd}`) and `_`, 1..`NAME_MAX` 40 UTF-16 units: so `_Toc...`, `__proto__`, `1st`, spaces refused), `addBookmark(d, typing, sel, name)`, `deleteBookmark(d, typing, name, sel?)` -> `{sel} \| {error}`, one step each (`typing.command` + `d.atomic`: one `spliceText` per new mark, one `replaceText` per old mark removed, last first), none when nothing changes; `goTo(doc, name) -> {sel} \| {error}` (the text between the marks selected; a caret when they meet, when there is no end or the end comes first; a start in a kept (Opaque) table refused: "!Letters cannot go there yet"; in a typed table's cell it goes there, C3.5). Ids: one more than the largest bookmark `w:id` (tables', typed or kept, and wrappers included) that is a whole number 0..`MAX_ID` 2^31 - 1 (others, `abc`, `-4`, `4294967296`, are passed over: they cannot clash with a smaller new id); none free: refused; a document whose walk stopped at the node limit: refused. Add: names unique ignoring case, so every bookmark of that name (case ignored: a file may have two) is removed in the same step (moved); one whose marks are not inlines of their own (in a kept table, between a typed table's rows or cells, inside a link) is refused; the selection may cross paragraphs and tables and start or end in a cell (C3.5), but not start or end on a table's edge; adding the same name round the same text (only unseen inlines between the old and new places) is no change; the result selects the new bookmark's text. Delete removes the start and its paired end (the selection given kept, its offsets moved). `BookmarkKeep` (pure; used by `EditRange.deleteRange`, so by every range deletion: Backspace/Delete on a selection, typing or pasting over it, cut, a break inserted over it): `keptMarks(doc, o)` (the direct marks in the range, and since the C7 fix wave (A2) every mark of a typed table it covers (`tableMarks(t, out)`: cells' paragraphs and loose marks, every depth, a loose node as a level-`p` raw inline), whose partner (other kind, same id) exists outside it (a partner inside a table or a wrapper, a link or `w:ins`, that the range covers counts as inside: review fix), ends first then starts; `[]` without a whole-document walk when the range holds none), `putMarks(d, pos, xs)` (back at the caret the deletion returns, one U+FFFC each in the format there; when that is a table's edge (a range that ended on tables both sides), at the start of the nearest paragraph after it, else the end of the nearest one before: final review). So deleting the paragraph holding a bookmark's start moves the start to where the deletion was (Word's behaviour): a pair is never broken by an edit; a bookmark wholly in the range goes; an orphan mark (no partner anywhere) is not kept. `BookmarkBox` (desktop: imports `'riscos'` for `beep`): `bookmarkBox(dw)` -> the `Ui/Dialog` keyed `bookmark:<docKey>`, kept in `dw.boxes` ('bookmark', deleted by `CloseDoc` with the document); `name` (writable, `maxLen` 80: a longer name typed or pasted is refused with a message, never cut short) and the `names` popup (`(none)` then `list` names, at most `MAX_SHOWN` 200, a longer list says so in the message lines; a pick puts the name in the field), radios `sort` (`Name` / `Location`, Location first), option `hidden` (`Hidden bookmarks`), message lines `msg` / `msg2`; buttons `Add` (Return: `addBookmark` with `view.sel`; done: `EditFormat.dropPending`, `view.edited(sel)`, `view.focus()`, the box closes), `Delete` and `Go to` (the box stays, its popup refilled; Go to `view.setSelection`, scrolled), `Close` (Escape, the close icon: the last button). Refusals beep and say why in the message lines, the box kept, nothing changed. `Kinds` (A6.2): `BLANK` (`del`, `moveFrom`, `softHyphen`: the other inlines drawn as nothing), `unseen(x)` (UNSEEN or BLANK: exactly `LineTokens`' zero-width `'z'` items, which now use it), `unseenAt(p, k)` (used by `SelMove` and `EditDel`; false for `w:softHyphen`, which the keys treat as a character: ruling in the A6.2 review), `onlyUnseen(p)` C6 fix B3: `BookmarkKeep.putAround(d, first, last, xs)` puts the kept STARTS at `first` (the start of the first cell overwritten or cleared) and the kept ENDS at `last` (the end of the last), the later place first so `first`'s offset stays; `ClipPasteTbl.overwrite` and `RangeTbl`'s cell clearing use it, so a start never moves later nor an end earlier and no pair is reversed (before, every kept mark went to one place: a start in (1,0) with its end in (1,3) of a rectangle (0,0)..(2,1) went after its end). |
| `FormatPaint`, `PaintBind` | the format painter (Batch A, A6.3). `FormatPaint` (pure): `pick(doc, sel) -> {rPr, rStyle?, pPr?, pStyle?} \| null` (a caret: `OpsText.fmtAt` there and the paragraph's format; a selection inside one paragraph: the character format of its first character, an inline written outside any run passed over; a selection that reaches its paragraph's end or goes on to the next: also that paragraph's `pPr` (`numPr` included) and `pStyle` (null when none); null on a kept block or a bad position), `paint(d, typing, sel, picked, L?) -> sel` (REPLACES: for each run piece (`FormatOps.charOps`, level-`p` inlines skipped as `pieces` does) a first `setProps` removes the fields and sub-fields the target has and the pick lacks, a second sets the pick's `rPr` (its `extra` too) and `rStyle` (null removes); the same two passes for each paragraph `FormatOps.touched` marks `para`, over `pPr` and `pStyle`, the target's raw elements that are not paragraph formatting (`PPR_FIELDS`: the mark's `w:rPr`...) kept, the pick's raw formatting ones (`w:tabs`, `w:pBdr`...) copied; ops that `changes` says do nothing are dropped, all in one `runOps` (one undo step, none without ops); a caret (a click) paints the word there (`Selection.selectWord(L, pos)`, needs `L`) and the paragraph; the selection is returned as it was). `PaintBind` (desktop): `attachPainter(v)` (idempotent; from `DocKeys.attachKeys`): `v.painter` (null, or `{picked, sticky}`), `v.painterListeners`, `v.onMouseSelect` (`EditMouse` calls `v.onMouseSelect?.()` after a click and after the end of a drag) and `v.endPainter` (`EditKeys.keyFor` calls it first on Escape and consumes the key when it ended the painter); `togglePainter(v, sticky)` (off -> pick: a beep when there is nothing to pick; on -> off, except Adjust on a once painter makes it sticky), `bindPainter(v, tb)` (the button: Select = once, Adjust = sticky; pressed follows `v.painter`), `detachPainter(v)` (`CloseDoc.destroy`: the painter off, the release it waits for forgotten with its window listener; nothing painted afterwards). Format > Format painter (`FormatMenu`, ticked while on, shaded without a selection, no key) is `togglePainter(v, false)`. The pointer keeps its shape (the desktop has no pointer API for it: noted). `TestHook`: `docs[i].painter` |
| `WordCount`, `CountBox` | Edit > Word count... (Batch A, A6.4). `WordCount` (pure): `count(doc, sel?, L?) -> {words, chars, charsNoSpaces, paras, lines, scope, partial?}` of the selection (a range; `scope` 'selection') or the whole document (a caret or no selection; 'document'): words are runs of non-white-space (white space = the Unicode White_Space but the no-break U+00A0, U+2007, U+202F; a no-break hyphen joins); each East Asian character (Han, kana but U+30FB, Hangul, Bopomofo, halfwidth forms) is a word of its own and ends the word beside it (Word's "Asian characters + non-Asian words": W1); characters are code points, a tab or a line break one each, the optional hyphen none, paragraph marks none; `charsNoSpaces` leaves out white space, U+00A0, U+2007 and U+202F; a paragraph counts when it has any character; `lines` is the layout's (`L.byId`; a selection counts the lines it touches; `null` without `L`; a typed table's cells' lines count too, in the document and in a selection, since the C3 fix wave; an Opaque table has none). Text: the paragraphs' text, a typed table's through `Walk` (C1.6: its cells' paragraphs in flow order, nested tables too, its kept cell blocks and loose marks by the XML walk: the same numbers as the table read Opaque), and the XML of their level-`p` inlines (links, insertions, fields, content controls, smart tags) and of kept blocks (Opaque tables...), by one iterative walk (`w:t`, `w:tab`, `w:br`/`w:cr`, `w:noBreakHyphen`, a paragraph per `w:p`) that skips `del`, `moveFrom`, `delText`, `instrText`, `drawing`, `pict`, `txbxContent`, `object`, ruby text (`rt`), formulas (`m:`...), every property container (`*Pr`, `*PrChange`: a `w:tab` there is a tab stop) and takes only the `mc:Choice` (else the `mc:Fallback`) of an `mc:AlternateContent`, all of them within `NODE_LIMIT` (1,000,000) nodes (past it `partial` is true); a kept block lies in a selection when the selection holds it whole or runs across it. `countView(view)`. Linear: 1,000,000 words < 1 s. `WordTally` (pure, C1.6 split): the `Tally` of running numbers (`text(s)`, `gap()`, `end()`) and the white-space and East Asian tests. `CountBox.countBox(dw)` (desktop; `Ui/Dialog`, key `count:<docKey>`, kept in `dw.boxes` 'count', deleted with the document): the scope line, Words, Characters (no spaces), Characters (with spaces), Paragraphs, Lines and a note when `partial`; one button Close (Return, Escape, the close icon: the box is deleted and the caret goes back to the document); asked again while open it is refreshed and brought to the front. `EditMenu.editMenu(view, {count})` has Word count... last (no key; shaded without a selection); `WinMenu` passes `count`. `TestHook`: `docs[i].count()` |
| `InlineText` | the text an inline stands for outside the drawing (A5.3 review), pure: `hyphenText(x)` (`-` for a bare `w:noBreakHyphen`, `''` for a bare `w:softHyphen`, else null), `inlineText(x)` (tab `\t`, br `\n`, the hyphens, else the inline's display `text`, else `''`); used by `Selection.text`, `ClipSlice.paraPlain`, `ClipHtmlRun` and `FindText` (see "Symbols and special characters (Batch A, A5.3): the rules" below) |
| `ChangeCase` | Format > Change case and Shift+F3 (Batch A, A5.4), pure. `changeCase(d, typing, sel, mode, pending) -> {sel, pending}` (`FormatApply` ids `changeCase` with the mode as arg and `caseCycle`), `MODES` (`sentence lower upper title toggle cycle`; others throw RangeError before anything changes), `caseState(texts)` -> `upper \| lower \| title \| mixed`. `FormatOps.touched` gives each paragraph's selected `[a, e)`; a caret (`a === e`) takes the word at it (`Segment.wordBounds` + `DocPos.isWordText`, the word it ends counts: as double-click) or nothing; per paragraph one `spliceText` from the first to the last changed character with `OpsUtil.cut`'s old runs and inlines for that stretch and the new text (a diff trimmed so it never starts or ends inside a surrogate pair), all through `FormatOps.runOps` (one `typing.command` + `d.atomic`: one undo step, none when nothing changes). Characters are changed one code point at a time with `toUpperCase` / `toLowerCase` kept ONLY when the result is as long as the original (so `\u00DF`, `\u0130`, `\u0149` and ligatures stay), no locale, no normalisation; a capital sigma lowers to the final sigma when a letter precedes it and none follows (context is the whole paragraph). An ASCII range uses one native call. Sentence: the range start and each place after `.` `!` `?` (closers `" ' ) ] }` and the curly / angle quotes allowed) followed by white space start a sentence; the first letter is capital, the rest small; a digit ends the wait. Title: a word is letters, digits and marks; an apostrophe (`'`, `\u2019`) between two of them stays in the word; the first letter of a word is capital, the others small (a word that starts with a digit has none). The cycle takes the state of all the text together (upper -> lower -> title -> upper; mixed -> upper). The pending format is returned for a caret and EMPTY for a selection. `Keymap` row `caseCycle` `Shift+F3` (menu `Format`; plain F3 stays `saveBox`); `FormatMenu` `caseMenu`: Format > Change case > Sentence case, lowercase, UPPERCASE, Capitalize Each Word, tOGGLE cASE, Next case (`Shift+F3`) |
| `ClipSlice`, `ClipHtml`, `ClipHtmlRun`, `ClipRead`, `ClipBuild`, `ClipCss`, `ClipClean`, `ClipIds`, `ClipPaste`, `ClipStore` | the clipboard (deliverable 6b), pure (`ClipIds`: `UNIQUE`, `hasUnique`, `hasIds`, `dropIds`, `keepIds`, `keepAttrs`, `flatten`, `nodeText`, `plainPara`: ids that must stay unique in a same-document paste, below); wired into the window by Task 3. One block shape: `{type:'p', text, runs, inlines, pPr, pStyle?}` (no id, no extraP), `{type:'tbl', tblPr, grid, gridAttrs, rows, attrs, tail}` (Batch C1.7, C6.1, D28: a typed table, its cells holding these blocks, no ids at any depth) or `{type:'opaque', node}`. `ClipSlice.slice(doc, sel)` -> `{blocks, ids, styleNames (Map id -> {name, type}), lists (Map numId -> {num, abs, m}: `ClipNums`), plain}` or null (collapsed); by the selection's `SelShape` shape (C6.1): `text` the paragraphs in one container, `cells` one table block of the rectangle (`ClipCut.cutRect`; the table as it is when whole), `mixed` the paragraphs plus table blocks of the covered rows (`ClipCut.cutRows`); `ids` a source id per `Walk.walkBlocks` entry (null for a table or kept block; `ClipHtml` follows that order); `styleNames` include the table styles (`tblStyle`, type `table`); `styles` the source's table styles they name and need (`TblStyleCopy.sourceStyles`, C6.2); blocks share the document's objects (`OpsUtil.cut`), a kept block is in when covered; `plain`: `\n` between blocks, a typed table a line per row with its cells joined by tabs (`ClipHtmlTable.tablePlain`, C6.3), a kept block an empty line, inline text as `Selection.text`. `ClipHtml.toHtml(doc, slice, {token, urlOf, max = 2,000,000})` -> HTML or null (too big: plain text only): `<!--word-clip:TOKEN-->` first, then only `p h1-h6 ul ol li b i u s sup sub span br a table tr td` (tables: `ClipHtmlTable`, C6.3), every text and attribute escaped (`& < > " '`), the RESOLVED formatting (`FormatEff.charOf`), `white-space:pre-wrap`, headings by outline level / style name, labelled paragraphs as `<ol>`/`<ul>` `<li>`, links as text unless `urlOf` gives an http(s)/mailto URL. `ClipRead.readHtml(html, parseHtml, {textTw}?)` -> `{blocks, styleNames}` or null (fall back to plain text; also on any throw): an injected DOM-like parser (DOMParser in the browser), a whitelist walker (`ClipWalk`, iterative; `<table>` a table block by `ClipReadTable`, C6.3; elements deeper than 200 unwrapped (text kept, formatting ignored), 200,000 nodes, 5,000,000 text units; script/style/iframe/object/img/svg/... dropped with their content, unknown tags unwrapped, `display:none` and Word's `mso-list:ignore` skipped, href never kept), `ClipBuild` (HTML white space, `<br>`, `&nbsp;`, `<pre>` lines as paragraphs, tables it does not read as tab-separated rows; a `tally` shared by a table's cells' Builders, `block(x)`), `ClipCss.parseStyle` (and `decls`, the checked declarations it and `ClipTblLook` read) (colour `#rgb #rrggbb rgb()` and names, first font family, sizes pt/px/em/%/keywords clamped to 1..400 pt, weight, italic, underline / line-through, sub / super, white-space, text-align; values with `url(`, `expression`, a backslash, comments, `< > { }` ignored); h1-h6 bold at Word's heading sizes with pStyle `HeadingN` named `heading N`; li items plain paragraphs; the Google Docs `<b style="font-weight:normal" id="docs-internal-guid-...">` wrapper is not bold. `ClipClean.clean(blocks, doc, {sameDoc, styleNames, lists})`: same document: everything passes (links, fields, symbols, pictures, numPr, tables) except raw inlines whose XML holds, at any depth, an element whose id must stay unique (`bookmarkStart/End commentRangeStart/End commentReference ins del moveFrom moveTo footnoteReference endnoteReference permStart/End`): they become their display text (a `w:del` nothing) or nothing; another: raw inlines -> their display text or nothing, tab / br inlines -> `\t` / `\n` (a page or column break stays one: a new inline without node, it refers to no part), pStyle / rStyle mapped by NAME (case ignored, type must match) else dropped, rPr / pPr: every modelled field kept and the raw `extra` cleaned (`ClipProps`, `NumClean`), numPr only for a list the slice carries (L6), kept (Opaque) tables skipped, typed tables as tables (`ClipCleanTbl.crossTable`, C6.1). `ClipPaste.pasteBlocks(d, sel, blocks, {sameDoc, styleNames, styles, lists, pics, picScope})` -> caret: one `d.atomic` (selection deleted first; a table edge gets an empty paragraph as typing does; one table block over a `cells` selection overwrites its cells instead, tables past depth 8 as text, table styles copied across documents: "Pasting tables" below, C6.2); one paragraph spliced in; several: head merged into the target (its id; the first block's properties at offset 0), middle blocks whole with fresh ids and `extraP = []`, last block + the target's tail as a new paragraph with the target's properties (`restoreBlock` + one `insertBlocks`: 100,000 paragraphs in ~0.4 s); `pastePlain` (`Edit.typeText`), `cutSelection` (slice + `EditDel.deleteSelection`). `ClipStore`: `put(slice, docKey)` -> 16 hex digits from 8 random bytes (`crypto.getRandomValues`), `get(token)` exact match only (the entry's `styles`, `lists`, `pics` and `picScope` passed on by `ClipPick` in the exact route's opts), last 4 kept, and at most `MAX_PIC_STORE` = 256 MB of picture bytes over all entries (the oldest entries dropped whole: B7 review), refuses over 5,000,000 text units or 100,000 blocks (both counted at every depth, a table's cell blocks too: `Walk.walkBlocks`), `tokenIn(html)`; stores the slice object (and its `plain`), never parses anything. Contract for the wiring (Task 3): the exact route works only for copies within those limits (100,000 blocks, 5,000,000 text units; a larger copy is pasted from its HTML or plain text); a stored entry is used only when the clipboard's text/plain equals `entry.plain` (the HTML may have been edited elsewhere with our comment kept); each document window has a `docKey` that changes on Revert and reload (a counter on the window, e.g. `docKeyOf(win)` = window id + load count), so `sameDoc` is true only for the same loaded content (as built in Task 3: `EditClip` gives each `DocWindow` a counter `docKey`; Revert makes a new window, so a new key). `Edit.clean` is exported for them. The unique-id names also include the moveFrom/moveTo range marks and the `customXml*Range` marks |
| `ClipCleanTbl` | Batch C1.7, C6.1, pure (D28, R8): `sameTable(block, cleanPara)` (a typed table for its own document: paragraphs cleaned by the given cleaner at every depth, row/cell `w14:paraId` / `w14:textId` dropped, `UNIQUE` marks between rows and cells dropped, Opaque cell blocks with ids as text), `crossTable(block, cleanPara, {strict, style})` (another document, C6.1: paragraphs by the given cross cleaner; tblPr / trPr / tcPr by `ClipProps.crossTblPr`; tblPrEx by `NumClean.cleanExtra`; no attributes on table, grid, rows, cells; no marks between rows and cells; Opaque cell blocks skipped; a cell left empty or ending with a table gets an empty paragraph; R10's `flatTable` is gone), `freshTable(block)` (a pasted table: fresh ids for the table, nested tables and paragraphs, `extraP = []`), `freshBlocks(blocks)` (the same for a list: a cell's contents pasted over it, C6.2). Used by `ClipClean`, `ClipPaste` and `ClipPasteTbl` C6 fix B1: `apart(blocks)` puts an empty paragraph (`ClipIds.plainPara('')`) between two tables next to each other (typed, or kept: `TblCheck.endsCell`) at every depth, in cells too (Word joins two `w:tbl` with no `w:p` between them into one table; HTML gives `<table></table><table></table>`); the same list and objects where nothing touches. `ClipPaste.pasteBlocks` runs it on every cleaned paste. C6 fix B4: `crossParts` passes the kind ('tbl', 'tr', 'tc') to `ClipProps.crossTblPr`. A row's `tblPrEx` stays a raw element (it reads back raw too). |
| `ClipPasteTbl` | Batch C6.2, pure (D28, TB15): the table rules of a paste, for `ClipPaste`. `fitDepth(blocks, depth)` (blocks going into a container inside `depth` tables: a table that would be nested deeper than `TblCheck.MAX_DEPTH` (8) is its text, `Walk.flatText` + `ClipIds.plainPara`: a paragraph per row, cells joined by tabs; never refused; the rest shared), `overShape(doc, sel, blocks)` (the `cells` shape a paste of ONE table block overwrites, else null), `landing(doc, shape, block)` (`[{r, k, from}]`: each rectangle cell that is not a hidden vMerge continue cell gets the pasted cell starting at its row and grid column relative to the rectangle's top-left; pasted continue cells give nothing; extra pasted cells dropped), `landed(doc, shape, block)` (the block with only the landing cells' contents and no tblStyle, so lists, pictures and table styles are made for what lands only), `overwrite(d, shape, block)` (the landing cells' blocks replaced by the pasted cells' blocks, `fitDepth`-ed, `freshBlocks`; tcPr, rows and grid kept; one `restoreBlock` after `TblNorm.unstray`; bookmark marks of the overwritten paragraphs whose partner remains put back at the caret, `BookmarkKeep`; the caret at the end of the last cell overwritten) C6 fix B3: the kept bookmark marks of the overwritten cells go back by `BookmarkKeep.putAround` (starts at the start of the first cell overwritten, `TblPos.cellPos`; ends at the end of the last). |
| `ClipCarry` | C6 fix (split from `ClipPaste`, which was at 247 lines), pure: what a paste from another document makes in the target in the paste's step: `relist(d, list, idx, lists)` (the pasted paragraphs' lists made anew by `NumCopy.copyNums`, numPr renamed; unchanged rule) and `styled(d, list, styles)` (the tables' styles by `TblStyleCopy.copyStyles`, `restyle`). |
| `TblStyleCopy` | Batch C6.2, pure (D28; `NumCopy`'s pattern): table styles across documents. `tableStyleIds(blocks)` (every table's `tblStyle`, every depth), `sourceStyles(doc, ids)` (copy time, put in the slice as `styles`: Map id -> `{style, m}`, the source's Style objects shared, through `basedOn` and `link`, cycle-safe; `m` the styles root's scope), `copyStyles(doc, src, ids)` -> `{ops, map}` (a target style of the same name and type, case ignored, is used; a name the target gives another type maps to none; else the style is copied with what it needs (basedOn, link): its raw element `NumClean.cleanEl`-ed for the target, `w:styleId` the source's or the first free `id1`, `id2`..., no `w:default`, `w:basedOn` / `w:link` / `w:next` naming target ids or left out, read back by `ReadStyles` so raw is the cleaned element (an `xmlns:w` declaration on it when the target's root binds `w` otherwise); a raw-less style (Table Grid made by !Letters) by its fields (`ClipProps`, `cleanExtra`); ONE `setDocPart styles` op with a new style table holding every old style object unchanged; none when nothing is copied), `restyle(blocks, map)` (each table's tblStyle to `map`'s id or left out, `TblNorm.prWith`) C6 fix B5 (C6a M6): at most `MAX_COPY` (500) styles copied by one paste (ids past it map to none; a style needing one past it is copied without that basedOn or link); a `src` entry whose key is not its style's id (forged) names no style instead of throwing. |
| `ClipCut` | Batch C6.1, pure (D28): the part of a typed table a copy takes, still the document's objects (ids and all). `cutRows(t, r0, r1)` (inclusive; `t` itself for every row; else a new grid array, the rows, the tail only with the last row, `TblNorm.unstray`: a continue cell at the top row a restart), `cutRect(t, {r0, r1, c0, c1})` (`cutRows`, then the columns outside gone by `TblEditCols.deleteCols`: spans cut at the edges, dxa tcW / tblW shrink, the grid of the rectangle's columns; null when no cell is left); RangeError for rows or columns not in `t` |
| `ClipNums`, `NumClean`, `NumCopy`, `ClipProps` | lists, borders, shading and tab stops pasted into another document (L6, the owner's ruling: keep them, as Word does; pure). `ClipNums.numsOf(doc, blocks)` -> Map numId -> `{num, abs, m}`: the source's own top-level `w:num` and `w:abstractNum` nodes (shared, never changed) for each numId 1..2^31 - 1 a block's direct numPr names (in table blocks' cells too: `Walk.forEachIn`, C6.1), `m` the scope at the part's root; a `numStyleLink` followed one step through the numbering style's numPr; left out: a missing num or abstract, an abstract still linked, a definition over `MAX_NODES` (5000) elements, numIds after `MAX_LISTS` (1000) or past `MAX_TOTAL` (200,000) elements. `NumClean.cleanEl(node, scope, strict)` -> a new tree with only WML elements (named `w:`, whatever prefix the source used) and WML attributes (plus `xml:space` / `xml:lang`), an `mc:AlternateContent` replaced by its `mc:Fallback` children, at most 64 deep; dropped with their content: other namespaces, anything with an attribute of the relationships namespace or a `w:id`, and `DROP` (`pStyle rStyle lvlPicBulletId styleLink numStyleLink numPr sectPr divId cnfStyle`); left / right spelled as the target spells them (`w:ind` sides and `...Chars`, `w:val` of `w:jc` `w:lvlJc` `w:tab`, `w:pBdr` side elements; never repeated). `cleanExtra(extra, strict, keep?)`: a pPr / rPr `extra` list cleaned so (scope: w, r, mc; `keep` a Set of `DROP` names kept, C6.1: `cnfStyle` for tables). `ClipProps.crossPPr(pPr, strict, lists)` / `crossRPr(rPr, strict)`: every modelled field (`PropNames`) kept, extras cleaned, jc and tab stop values by `JcName`, numPr kept (the source numId) only when `lists` has it or it is 0. `ClipProps.crossTblPr(pr, strict, style)` (C6.1): a tblPr / trPr / tcPr across, every modelled field kept but `tblStyle` (`style(id)`: the target's style of that name, else left out), jc by `JcName`, the extra cleaned keeping `w:cnfStyle`, a raw `w:tblStyle` dropped; set with `TblNorm.prWith`. `NumCopy.copyNums(doc, nums, numIds, {rand})` -> `{ops, map}`: one new abstract per source abstract used (cleaned, new id, a fresh `w:nsid` first; two source nums over one abstract share the copy, so they share a count as in the source) and one new num per source numId with the source's `w:lvlOverride`s cleaned (ilvl 0..8, first of each); placed and numbered as `NumWrite` (abstracts after the last abstract, before the first num; nums before `numIdMacAtCleanup`; ids past the largest, `ListUsed` numIds avoided; the part made by `ensurePart`); `ops` the `ListRestart.partOps` setDocParts; RangeError (nothing made) for no free id or a numbering that is not a node. `ClipPaste` runs it inside the paste's `d.atomic`, after the selection is deleted, for the numIds of the blocks whose pPr the paste keeps (the first at offset 0, the middle ones; a middle table's cell paragraphs at every depth, C6.1), applies the ops before `insert`, and gives those blocks the new numIds; any other source numPr, and all of them after a RangeError (the paste goes on without lists), is dropped C6 fix B4: `crossTblPr(pr, strict, style, kind)` then reads each raw extra element left through `TblProps` (`readTblPr` / `readTrPr` / `readTcPr` by kind) in the TARGET's conformance (a `w`-bound scope, `strictScope` for Strict): one that reads as a field becomes that field unless the field is set or another raw element has its name (Word 2010's Strict `w:tblBorders` with `w:left`, raw in Strict, is a field in Transitional, and the reverse), so a pasted table's model is what its saved file reads back as. |
| `ClipRoute` | (desktop, C0.2) where a paste goes: `routePaste(dw, p, lost)` is `EditClip.pasteIn`'s second half (pick the route: exact, picture, html, plain; paste; the messages); `say(message)`. `EditClip.pasteIn` keeps the composing guard. HTML tables are read at the text width where the caret is (`TblInsert.widthAt`: the cell's from the layout, else the cell's grid width less its margins or the section's column, C6.3). |
| `ClipHtmlTable` | Batch C6.3, pure (D28): `tableHtml(t, ctx) -> string \| null` (`<table style="border-collapse:collapse;width:Wpt">`, a `<tr>` per row, a `<td>` per cell from `TblGrid.gridOf`: `colspan` its grid columns, `rowspan` the rows its vMerge covers, a continue cell not written (`ctx.skip(blocks)` keeps `ClipHtml`'s walk index in step), a row's gridBefore an empty `<td colspan>`; style `width` (pt), `vertical-align:top`, `border:1px solid #000000` when the cell has a side drawn (its own tcBorders, else the table's tblBorders where it is: `TblBorderAt.direct`; else any side of the table style's tblBorders / tcBorders, `TblStyle.viewOf`, conditional parts not read; nil / none sides none, a raw side counts), `background-color` its shd fill (6 hex digits); the cells' content `ctx.cell(blocks)` (`ClipHtml`'s own block writer, so lists open and close inside a cell); null over `ctx.room()` or when a cell is: nothing cut short), `tablePlain(t, nodeText?)` (`Walk.flatText` joined by `\n`: a line per row, cells by tabs, a cell's paragraphs and nested tables by spaces) |
| `TblConvert`, `TblToText`, `TblConvertCmd`, `TblConvertBox` | Batch C6.4 (D29, D30, R13, TB16): text to table and table to text. `TblConvert` (pure): `sepChar(sep)` (`'para'` -> null, `'tab'`, `'comma'`, or Other: ONE code point other than U+FFFC; RangeError else), `defaultSep(paras)` (tabs when every paragraph has a tab, else commas when every one has a comma, else paragraphs; none: paragraphs), `colsFor(paras, sep)` (1 for paragraphs, else the most pieces a paragraph has, 1..`MAX_COLS`), `straddles(paras, sep)` (a separator between the `fldChar` begin and end of a complex field, counted across the paragraphs: such a field would be cut in two, so the conversion is refused; hyperlinks, pictures, simple fields and bookmarks are one U+FFFC each, and a bookmark whose ends land in two cells stays a pair), `textToTable(paras, {sep?, cols?, textTw?, ts?, strict?}) -> table` (a NEW table made with `TblInsert.build` and its `fill` hook: Insert > Table's tblPr and equal columns of `textTw` twips (default 9026); Paragraphs fill rows `cols` cells at a time, the last row padded; any other separator: a paragraph a row cut with `OpsUtil.cut` (runs and inlines go with their text, the separators dropped), a long row's extra pieces JOINED into the last cell WITH their separators (nothing is lost), short rows padded; each cell paragraph is new (fresh id, `extraP []`) with the source's pPr and pStyle, an empty piece or padding cell is `TblEdit.emptyLike` of its row's paragraph; RangeError for no paragraphs, a bad sep or cols, a field across a separator). `TblToText` (pure): `tableToText(t, {sep}) -> blocks`: a ROW is one paragraph (the cells' first paragraphs joined by the separator with `OpsUtil.join`; the separator takes the format of the text before it; the pPr, pStyle and extraP of the first of them), a cell's further blocks follow as their own paragraphs, cell after cell (TB16); with `'para'` every paragraph of every cell is its own; a nested table is converted FIRST with the same rule and its blocks come where it was (a cell whose first block is a table has no text in the joined paragraph); a vMerge continue cell gives no text and no separator (a merged cell counts once); marks (a row's or cell's `lead`, a row's or the table's `tail`, and bookmark marks in hidden continue cells) become level-`p` inlines of the paragraph next to them, in the order of the file, so no pair is broken; every paragraph made has a fresh id, Opaque cell blocks are kept. `TblConvertCmd` (pure; the brief put these in `TblCmd`, which is full at 248 lines): `textParas(doc, sel) -> {at, paras} \| {error}` (the top-level paragraphs the selection touches, whole; a selection ending at offset 0 of a later paragraph leaves that one out; errors for no selection, a caret alone, an end in a cell, two sections, a table or kept block among them), `whyText(doc, sel, {sep?, cols?}) -> message \| null`, `textToTableCmd(d, sel, {sep?, cols?, textTw?}) -> sel \| null` (ONE `d.atomic`: Table Grid added as Insert > Table does (`tableGridStyles`, `setDocPart styles` in the same step), `insertBlocks` of the table (plus an empty paragraph before when a table is before it and after when no paragraph follows) then `removeBlocks` of the paragraphs, the caret in the first cell; null and no step when `whyText` has a message; more than `MAX_ROWS` rows refused), `whyTable`, `tableToTextCmd(d, sel, {sep}) -> sel \| null` (the WHOLE innermost table of the selection (`TblCmd.rowsOf`; Word converts only the selected rows, here the whole table, documented in the guide), `insertBlocks` then `removeBlock`, the converted paragraphs selected). `TblConvertBox` (desktop: imports `'riscos'`): `tblConvertBox(dw, mode)` (`'totable'` / `'totext'`): ONE box per document (key `'tblconv:' + docKey`, `Boxes.box(dw, 'tblconv')`, `minW` 540, `enter: 'OK'`, always a Cancel) whose title, heading, popup choices (`api.choices`) and Columns shading change with the mode; Columns (number, no clamping), Separate popup (Paragraphs / Paragraph marks, Tabs, Commas, Other) and Other (text, shaded unless Other, validated to ONE code point at OK); in Text to table Columns is computed when the box opens (`defaultSep`, `colsFor`) and again whenever the separator changes; OK validates and beeps with a message (never clamps), a stale selection or document (`TabsBox.where`) refills the box with a beep, Cancel / Escape change nothing. `TblMenu` gains Convert > (Text to table... shaded unless `textParas` has no error, Table to text... shaded outside a table; Convert itself shaded when both are), after Table properties..., which is no longer followed by a dotted line (Convert is). C6 fix B2, B5: `straddles(paras, sep, open?)` is true for a separator between a `fldChar` begin and end, a paragraph end while a field is open (every separator, Paragraphs too: a field over several paragraphs), an end with no begin in the paragraphs, or `open`; `TblConvertCmd.fieldOpen(doc, f)` counts the begins and ends of the paragraphs before the selection backwards (only when the box asks); `fldType(inline)` exported. `sepChar` refuses control characters and lone surrogates (RangeError 'control separator', the box says 'Separator: Other cannot be a control character.'). Empty pieces and padding cells are `emptyLike` without `numPr` (a paragraph empty itself in Paragraphs keeps it). `TblToText`: a hidden (vMerge continue) cell's paragraphs of bookmark marks only go with the row, empty paragraphs go, every other block follows the row's paragraph (in Paragraph marks: in its place; nested tables converted). `TblConvertBox` asked again in the same mode for another selection fills itself for it. Final fix wave ruling (final-1 M2, TB16 still asks Word): with a separator `TblToText` keeps a cell's paragraphs together in FILE ORDER: a row is its cells' text joined by the separator, a cell's second paragraph starting a new paragraph that the next cell's text continues (`a1 / a2 | b` -> `a1`, `a2<sep>b`), a nested table or kept block ending the paragraph before it and coming in its place, a hidden continue cell's other blocks in their place too; so the text and every bookmark pair keep the table's order (before, a cell's further paragraphs came after the row's paragraph, which reversed a pair from `a2` to `b`). Paragraph marks unchanged. |
| `ClipWalk`, `ClipReadTable`, `ClipTblLook` | Batch C6.3, pure (D28, TB17): HTML tables in. `ClipWalk` is `ClipRead`'s whitelist walk moved out of it unchanged (`walk(frame, b, ctx)`, `skipped(el)`, `cellFmt(el, f)`), with one hook: a `<table>` outside a flattened cell goes to `ctx.table(el, g, b, depth)` first. `ClipRead`'s hook reads it with `ClipReadTable.readTable(el, build, {textTw})` while fewer than 8 tables are around it (`LIMITS.depth`), its cells and those of the tables read before within `LIMITS.cells` (63,000), and its subtree's nodes and text (an element one unit) within what is left of `ClipRead.LIMITS` (counted first: `sizeOf`), so a table is never cut short; otherwise, or when `readTable` gives null, it is flattened as before. `readTable`: rows the `<tr>` in the table or its thead / tbody / tfoot, cells their `<td>` / `<th>`; null (flattened) for no row or cell, more than 1000 rows or 63 grid columns, or anything but white space, comments, caption / colgroup / col and dropped or hidden elements directly in the table, a section or a row; each cell at the first free grid column of its row, `colspan` / `rowspan` (`ClipTblLook.spanOf`: digits 1..63, anything else 1) cut at the last row and shrunk where they would overlap; grid columns the widest row; a rowspan a vMerge restart and continue cells (empty, the same shading and borders); empty grid slots empty cells (ragged rows filled); every cell ends with a paragraph (its blocks read by a nested `ClipBuild` Builder sharing the text tally: paragraphs, runs, line breaks, nested tables); `<caption>` paragraphs before the table; tblPr `tblW` 0 auto, tcPr by `TblNorm.prWith` (tcW dxa, gridSpan, vMerge, shd, tcBorders), no ids, no attributes. `ClipTblLook`: `lengthTw` (px 15 twips, pt 20, in 1440, % of the base; a bare number px in a `width` attribute; 1..`MAX_TW`), `widthsOf` (a column the width of its first one-column cell giving one, style before attribute; the rest share what is left of the table's width (else `textTw`, else `TEXT_TW` 9026) equally, at least 360 twips; scaled to `MAX_TW` in all), `lookOf` (`background-color`, `background` (Word's), `bgcolor` -> fill; a border style other than none / hidden and not 0 wide on any side -> single 4 auto on four sides; `mso-` declarations never read), `tableBorder` (a `border` attribute of 1 or more, or empty: cells without border declarations bordered; trimmed before its test, C6 fix A1: the old `/^\s*(...)?\s*$/` backtracked in O(n^2), a pasted `border` of 100,000 spaces took 6.5 s). Only `colspan rowspan width bgcolor border style` are read, each value through `ClipCss.decls` / `colour` (no `url(`, `expression`...). |
| `EditClip`, `ClipPick`, `ClipLinks`, `ClipDom`, `MacKeys` | the clipboard wired into the window. `EditClip` (desktop): `attachClip(dw)` sets `dw.docKey` (a counter: unique per window, new after Revert), `dw.clip {last, status}`, `view.mac` (`MacKeys.isMac(navigator.platform)`) and handles the core's `copy` / `cut` / `paste` (CORE_API 3.1): copy = `ClipSlice.slice` -> `ClipStore.put(slice, docKey)` -> `ClipHtml.toHtml(doc, slice, {token, urlOf: ClipLinks.linkUrl(doc)})`; `setData('text/plain', plain)` always, `text/html` unless null (over 2,000,000 chars); nothing for a collapsed selection (the browser's default). Cut = copy, then `ClipPaste.deleteSelection` through `typing.command` (one step). Paste: refused with a beep while composing (`view.comp`); `ClipPick.pick` decides; `typing.command` (breaks coalescing) after `dropPending`; `pasteBlocks` / `pastePlain`; a RangeError (the model refusing the content) falls back to the plain text, any other error is thrown on (the core's handler reports it in an error box); nothing done: beep; a picture route (R10) calls `PicLoad.putPicture(dw, () => file.arrayBuffer()...)` (asynchronous: R11; `dw.clip.last` 'picture'); files that are not PNG/JPEG/GIF pictures only: beep and `reportError('Only PNG, JPEG and GIF pictures can be pasted: other files cannot.')` (also `dw.clip.status`). Menu: `copyMenu` / `cutMenu` (`wimp.textInput.exec` inside the menu click), `pasteMenu` (`wimp.readClipboard()`, false -> `reportError` 'Press Ctrl-V (Cmd-V) to paste...'). `clipHook(dw)` for `TestHook` (`copy()`, `cut()` -> `{plain, html}`, `paste(payload)`, `stash(blocks, plain)` -> a marker for blocks put in the store under the window's key; plus `docKey`, `clipboard`). Caret: `{text: true, blink: true}` (no `clipboard: true`: Chromium fires copy/cut with an empty proxy). `ClipPick` (pure): `pick({text, html}, {store, docKey, parseHtml, textTw})` -> `exact` (the HTML's token is in the store AND `samePlain(text, entry.plain)`: both through `Edit.clean` and cut at 100,000 units like the core's `sanitizeText`; `sameDoc` = same docKey), else, when the cleaned text is empty and one of the first 8 `files` has type `image/png|jpeg|gif` and `size` <= 20 MB, `{route: 'picture', file, tooBig}` (`tooBig`: over 20 MB, never read: `EditClip` beeps and says `MSG.tooBig`) (R10: text with the file stays text), else `html` (`ClipRead.readHtml` with `textTw`, `sameDoc: false`), else `plain`, else null. `ClipLinks.linkUrl(doc)` (pure): `urlOf` for `ClipHtml`: a raw `w:hyperlink` with a `<prefix>:id` (not `w:`) whose rel in `doc.rels` is an External hyperlink with an http/https/mailto target (`safeUrl`). `ClipDom.parserOf(DOMParser)` (pure, DOMParser injected): `parseFromString(html, 'text/html')`, an inert document never inserted into the page; ClipRead reads DOM nodes as they are; `ClipDom.attrOf(el, name)` is the one way the HTML readers (`ClipWalk`, `ClipReadTable`, `ClipTblLook`) read an attribute: a value longer than `MAX_ATTR` (65,536 characters) is ignored whole, as if absent (C6 fix A2: a second line of defence behind linear regular expressions). `MacKeys` (pure): `macKey(ev, mac)` gives Cmd + a b e f g i j k n s u y z as Ctrl (code 1..26) for `Keys`/`Keymap` (Cmd-F find, Cmd-G / Cmd-Shift-G find next / previous, Cmd-K hyperlink); never r, l (reload, address bar), c, x, v (the browser's clipboard events), m (macOS minimises the window: the page never gets Cmd-M, so indent is Ctrl-M only), h (macOS hides the program: Replace is Ctrl-H everywhere) or other keys; `macLabel(label, mac)` makes the Edit menu's labels `Cmd+Z`... on a Mac (CMD letters and C, X, V) |
| `FindSel` | (desktop, C0.2) what Find does to the selection, `EditFind`'s second half: `st(app)` (the task's find state), `select(dw, m)`, `step(dw, n, o, back, at)`, `current(dw, n, o)`, `replaceStep(dw, n, o, repl)`, `all(dw, n, o, repl)`. |
| `Find`, `FindText`, `EditFind`, `FindView` | Find and Replace (deliverable 6b). `Find` (pure): `search(doc, from {at, off}, needle, {matchCase, whole, backwards, wrap})` -> `{at, from, to, inInline, wrapped}` or null (C3.5: matches carry the paragraph's path; `from` at a table's path is its start edge at off 0, before its cells, and its end edge at off 1; anything else the document's start): the paragraphs in flow order through cells (row by row, cell by cell, nested tables entered; the top-level blocks walked by index from `topOf(from.at)`, no `findBlock`), kept blocks skipped, sections crossed; forwards the first match with `from >= off` in the first block, backwards the last with `to <= off`; `wrap` scans again from the document's start (end) and marks `wrapped`; `count(doc, needle, opts)` (non-overlapping); `replaceOne(d, m, repl)` -> `{at, from, to}` or null (an inline in the range, a stale or bad match): one `spliceText` in `d.atomic`, the text formatted by `OpsText.fmtAt(p, from, del)` (the first replaced character's run); `replaceAll(d, needle, repl, opts)` -> `{count, skipped, last}` (`last` `{at, from, to}` of the last text put in, or null): one `d.atomic`, one pass over the paragraphs in flow order (found first: cells' too), at most one `spliceText` per paragraph covering its first to last replaced match (unchanged stretches between kept as `OpsUtil.cut` pieces, inlines and runs reused), so the inverse restores each paragraph exactly with its id and `extraP`; text put in is never searched again (a replacement holding the needle cannot loop); 50,000 paragraphs x 2 matches in about 0.6 s. Replacement text: `Edit.clean` (controls other than `\n`/`\t`, U+FFFC and lone surrogates dealt with as typing does), so **a `\n` in it becomes a line break**: the model's line break is a `\n` in the paragraph's text (what Shift-Enter types and the writer writes as `<w:br/>`), a `\t` a tab; the box's fields are single-line, so this matters only to the API. `FindText` (pure): `view(p)` (cached per paragraph object in a `WeakMap`: models are immutable) is the paragraph as shown: each U+FFFC expanded to its inline's display text (tab `\t`, br `\n`, raw `text`, else nothing) with `map[k]` = model offset of shown character k; a match `[a, b)` of the shown text maps to model `[map[a], map[b-1]+1)`, `inInline` when that holds a U+FFFC (selected whole; never replaced, counted in `skipped`). After a match the next one starts at or after its model end (`matches`: `max(b, shownAt(to))`), so a link whose text holds the needle twice is ONE match for `count`, `replaceAll` and Find next alike (the search after it starts at its end). Case folding `fold(t)`: per code point, `toLowerCase()` when the same length, else the first code point of it when that is (U+0130 -> `i`), else unchanged: lengths never change (an all-ASCII string uses one `toLowerCase`); per character, so final sigma folds to the middle form, and `ss` does not match `ß` (no case expansion, no Unicode normalisation). Both ends must be grapheme boundaries of the model text (`DocPos.nextG/prevG`; skipped for paragraphs all below U+0300), so `e` does not match inside `e` + U+0301 nor a thumbs-up inside one with a skin tone. Whole words: `Segment.wordBounds` on the shown text, checked only at an end whose character is a letter, mark or digit (`\p{L}\p{M}\p{N}`: a run start at `a`, a run end at `b`); an end that is a space or punctuation needs nothing (Segment merges punctuation with spaces, so `foo.` / `foo,` could otherwise never match); texts over 4096 units segmented in a window of 256 either side. ICU treats `foo.bar` as one word. `prepare(needle)` -> `{needle, cut}`: at most `MAX` (1000) units, never half a surrogate pair. `EditFind` (desktop): the task's one `Ui/FindBox`; the active document is the `DocWindow` whose window last gained the caret (`attachFind`: `gaincaret`; cleared on `deleted`), state in a `WeakMap` app -> `{active}`. `openFind(dw, replace)` prefills Find with the selection when it is in one paragraph, at most 100 characters and has no line break (`orderedPos` checked before `view.text()`, so a huge selection costs nothing); `findStep(dw, back)` (Ctrl-G / Ctrl-Shift-G; empty Find: opens the box; with the box shut, a search that wraps or finds nothing opens it with `open({focus: false})` to show the message, the caret left in the document). Replace all puts the caret after `last`. Find next searches from the selection's end (previous: its start) with `wrap: true`, selects the match with `view.setSelection` (scrolls the head into view) and `FindView.show`: the document's window to the front, the box in front of it and moved below (or above) the selection's lines when it covers them; while the box is open it is lent to the active document's view as a pane (`FindView.lend`: `view.addPane(box.win)`, moved on `gaincaret` of another document, taken back on close or when the document is deleted), so the selection keeps the focused colour while the box has the caret; messages `Reached the end: continuing from the top` / `Reached the start: continuing from the end` / `Not found` (with a beep); Replace: if the selection is exactly a match (`search` from its start equals it) it is replaced through `typing.command` after `dropPending`, the caret put after it and the next found (`1 replaced`, `; no more found`, or the wrap message); a link match is skipped with `Link text is kept.` before the next search's message; otherwise Replace only finds; Replace all: `N replaced` (`; K in links not replaced`), `Not found` with a beep when nothing matched; an empty Find: `Type the text to find.`; over 1000 characters: `Only the first 1000 characters are looked for.` before the message; no live document: `No document to search: click in one first.`. `onClose` gives the active document `view.focus()`; `onKey` maps Ctrl-G / Ctrl-Shift-G (Cmd on a Mac) in the box to find next / previous. `findHook(app)` -> `task.word.find`: `{box, active, open(replace), run(action, {find, replace, matchCase, whole}) -> message}` (`find` is searched as given, even past the field's 1000) |
| `FormatApply`, `EditFormat`, `EditRun`, `EditHook`, `FormatMenu` | formatting in the window. `FormatApply` (pure): `apply(id, d, typing, sel, arg, pending) -> {sel, pending}` or `undefined` for a non-format id; ids `bold italic underline strike superscript subscript` (toggle), `alignLeft alignCenter alignRight alignJustify`, `align` (arg jc), `clearFormat`, `fontBigger fontSmaller` (`sizeBy` +-1), `indentMore indentLess` (`indentBy` +-720), `indentDrag` (arg `{marker, at, textW, free}`: `FormatPara.dragIndents`; a bad arg is a RangeError), `tabs` (arg `{add}`/`{remove}`/`{move}`/`{set}`/`{edits}`: `FormatTabs.setTabs`), `tabsBox` (arg `{tabs?, defaultTab?}`: `TabsCommand.tabsBox`, the Tabs dialog's OK), `listIn listOut listOff` (`setList` `{by: 1}`, `{by: -1}`, `{off: true}`), `size` (arg points -> `sz` half-points), `font` (arg family -> `rFonts`), `color` (arg `colourValue`: Wimp colour 0-15, `'auto'` or `'RRGGBB'`), `highlight` (Word name or `'none'`), `style` (style id), `lineSpacing` (arg a factor of `LINE_FACTORS` [1, 1.15, 1.5, 2, 2.5, 3] -> `line` 240/276/360/480/600/720 auto, or `{line, lineRule?}` checked by `FormatCheck`; other keys refused), `lineSingle lineDouble line15` (Ctrl-1, Ctrl-2, Ctrl-5), `spaceBefore spaceAfter` (arg twips, or null: the style's), `spaceBefore12` (Ctrl-0: `FormatPara.spaceBefore12`, 240 when every paragraph has none, else 0), `paraBox` (arg a `ParaPatch` patch -> `setPara`), `bullets` / `numbering` (arg a gallery entry id of that kind or none: `ListMake.toggleList`), `listRestart` (arg start, default 1), `listContinue`; `isFormat`; `PALETTE` (the desktop's Wimp palette as RRGGBB, pinned to `src/core/palette.js`: FFFFFF DDDDDD BBBBBB 999999 777777 555555 333333 000000 004499 EEEE00 00CC00 DD0000 EEEEBB 558800 FFBB00 00BBFF); `SIZES`; `WORD_FONTS` and `fontList` (re-exported from WimpLib `FontList`); `HIGHLIGHTS`; `paraStyles(styles)` (not `semiHidden`, by name). `EditFormat` (view glue, no `riscos`): `initFormat`, `touch(v)` (`selRev++`; `formatListeners` called once at the next animation frame), `dropPending`, `formatQuery(v)` (`Format.query` cached per `selRev`), `formatRun(v, id, arg)` (true if applied; RangeError -> false, nothing changed; the pending format it returns is kept; relayout through `v.edited`), `docFonts(v)` (`Info.facts(doc).fonts`, worked out once after each document change, not on every menu or popup), `stopFormat`. The view bumps `selRev` on every selection, document, layout and pending change; `setSelection`, undo/redo and every non-format command drop the pending format; `input` passes `{rPr: forTyping(pending), rStyle: styleFor(pending)}` to `Typing.type` and then drops it; `EditView.format` gives the browser focus back to the Wimp's text field when a menu click took it. `EditRun`: `runView(v, id)` (a command's null result: `v.refused()`), `stepView(v, kind)`. `EditHook.hook(v)`: the test hook (`labels()`: each block's list label text as laid out, or null; `tables()`: every table item at every depth, outermost first, `{id, depth, rows, painted}`, painted the rows its last paint drew, C2.5). `FormatMenu.formatMenu(view, {ruler, toggleRuler, paragraph, listValue, autoList}?)` (desktop; `autoList` an item put last: `AutoFormatOpt.autoListItem`): Bold Italic Underline Strikethrough Superscript Subscript (ticked from `view.query()`, evaluated when the menu is drawn), Font > (WimpLib `Ui/FontMenu`: `docFonts`, Word, Desktop fonts >), Size > (`SIZES`, Bigger, Smaller), Colour > (16 `colour: n` items, Automatic, More colours... > a `Ui/ColourPopup` submenu), Highlight >, Align >, Indent >, List > (`ListMenu.listMenu`, see its row; shaded only with no selection), Style >, Paragraph... (`paragraph()`: `ParaBox`), Tabs... (`tabs()`: `TabsBox`, A4.3), Clear formatting; keys from `Keymap.labelFor`; all shaded with no selection. A command on 5000 selected paragraphs, laid out again: 50-70 ms A5.3 added to `EditRun`: `nbsp` is typed text (`view.input`) with the pending format; A5.4 added the ids `changeCase` and `caseCycle` (`ChangeCase`) and `FormatMenu`'s `Change case >` |
| `Kinds` | `UNSEEN` (the inline elements drawn as nothing and not counted: `proofErr`, `bookmarkStart/End`, `commentRangeStart/End`, `permStart/End`, `lastRenderedPageBreak`, `instrText`, `delText`, `fldChar`), `BLANK` (also drawn as nothing, but counted: `del`, `moveFrom`, `softHyphen`), `localName(node)`, `unseen(x)`, `unseenAt(p, k)` (the caret keys step over these with the next character and Backspace/Delete never delete them: A6.2; not a soft hyphen: a character for the keys), `onlyUnseen(p)` |
| `Info` | `facts(doc) -> {paragraphs, tables, preserved, kinds, fonts}` (C1.6, R12: through `Walk.scan`, paragraphs at every depth and `tables` the typed tables at every depth; an Opaque table stays a preserved item, kept blocks in cells count as preserved items too), `summary(doc)` (`'9 paragraphs, 2 tables, 1 preserved item (1 link), fonts: ...'`, the tables part left out when there are none), `kindOf(node)` (unchanged: Opaque blocks only), `infoWindow` (the Paragraphs field `9 (2 tables)` when there are tables) |
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
* Right-to-left text is positioned in stored order, with no bidi
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

### EditView: the API

The header of `EditView`, moved here verbatim (C0.2).

```
EditView - the caret, the selection and the editing in a document's
window: it draws it (./EditPaint), shows the caret and keeps it in
view. Keys: ./EditKeys; typed text and input methods: ./EditInput;
the mouse: ./EditMouse; commands: ./EditApply.

  const v = new EditView(win, L, d, typing, rebuild)
    win: the Window; L: a ./DocLayout of d.doc; d: its ./Document;
    typing: its ./Typing; rebuild(): makes a new layout after an
    edit and calls v.setLayout (./AppWin)
  v.L, v.sel             the layout (made again first if the
                         document has changed); the selection
                         (./Selection), at first a caret at the start
  v.paint(g, rect)       the window's canvas redraw: L drawn at
                         v.zoom (./Zoom: a factor, 1 = 100%; the
                         part below L.top scaled)
  v.setSelection(sel, {scroll = true})  show sel, its head scrolled
                         into view (24 px inside); not an edit, so
                         the next typing is a new undo step
  v.setLayout(L, oldL)   a new layout: the selection is made valid
                         for it (Selection.clamp); then v.placed()
  v.placed(), v.focus()  show the caret (focus: take the focus;
                         placed() never takes the browser focus)
  v.key(ev)              -> true if used, undefined if not
  v.input(text, {composed}?)  type text (./EditInput: AutoFormat
                         lists after a space, when v.autoList()
                         says so: ./DocKeys);  v.compose(text|null):
                         show what an input method composes
  v.run(id)              a ./Keymap command -> true, or undefined
                         (./EditRun); a command returning null is
                         refused: v.refused() (a beep), sel kept
  v.refused()            a beep (a command refused)
  v.format(id, arg)      a formatting command (./FormatApply ids)
                         -> true if applied (./EditFormat)
  v.query()              the selection's formatting, cached
  v.pending, v.selRev, v.formatListeners   ./EditFormat
  v.caretRect()          the head's caret in the work area (zoomed)
  v.hitAt(x, y)          L.hitTest of a work-area point (zoomed)
  v.undo(), v.redo(), v.overwrite (Insert's mode), v.text(),
  v.destroy(), v.hook() (for tests: ./EditHook)
  v.inset   px hidden by the toolbar and ruler (./EditScroll)
  v.addPane(pane) -> remove()  the caret in this pane keeps v.lit

The caret is the Wimp's text-input caret ({text: true}), hidden
while something is selected, as in Word. After an edit the
selection is the command's; after an undo or a redo,
EditApply.stepEnd's (a picture resized: it selected, ./PicOps
stepSel). v.picGhost, v.picDrag: a picture's handle dragged
(./PicDrag), the ghost painted. The layout is made again at most
once a frame (a burst of typing is laid out once), then the caret
is scrolled into view. A refused edit (no paragraph to type in)
beeps.
The pending format (Ctrl-B at a caret...) is typed with the next
text and then used up; a selection set (mouse, keys), undo, redo
or any other command drops it. A format chosen from a menu keeps
the caret, and gives the focus back to the Wimp's text field.
```

### LineLayout: the rules

Moved here from the header of `LineLayout` (Batch B, B2.1), unchanged:

Offsets are UTF-16 indices into para.text. The lines cover the text
without gaps or overlap (lines[0].from is 0, the last .to is the
length, each .to is the next .from), and so do the items of a line.
An item's text is what is drawn; shown is true when that is not the
model text of [from, to): a hyperlink or other wrapper (its text),
a [...] box, a non-breaking hyphen, and the zero-width items with
text '' (an unseen inline, a tab, a line break; spaces at the start
of a line after a break are not drawn either, as in the stub).

Lines break greedily at spaces. Spaces that end a wrapped line hang
in it: they count in its items (for hit-testing) but not for its
alignment; the next line starts at the next non-space. A word longer
than the line is not broken: it overflows on a line of its own
(measured once, so a 100,000-character word costs one measure). A tab
item runs from where it starts to its stop (./TabStops nextStop: the
paragraph's stops, else the default ones, counted from the margin);
after a right, centre or decimal stop it is widened once its segment
is placed, to line it up (./TabAlign: its last non-space, else no
width); leader: the stop's leader, drawn by ./DocPaint. bars: the x
of each bar stop, on every line (drawn, no item). A line break (\n or
a plain w:br) ends its line, endsWithBreak, and its offset belongs to
that line; so does a page or column break, a rule (shown, text '', no
highlight, no shading) from where the text ends to the line's end,
at least ./BreakMarks MIN_RULE wide (when less is left the line
wraps before it); after one that ends the paragraph (nothing but
unseen inlines after it) there is no empty line (the paragraph mark
is on the rule's line, as in Word). wrapped is true when the line
ends because the next word did not fit. Items are merged only when
both are model text in the same format, touching in x and in offsets.
An empty paragraph has one line, from = to = 0, as high as the text
of its mark (first run) would be. A line's height and baseline are
./ParaSpace lineBox's for the paragraph's line spacing: single, 1.25
times its largest text high, its baseline 0.27 of that text above its
bottom; it grows, only when it holds superscript or subscript, to
keep that shifted text (0.98 of its size above its baseline, 0.27
below) inside it; line.clip is set on an exact line too low for its
text. Alignment: left, centre or right (./Justify align); it moves
items, never offsets. Justified ('both'): items are not merged and a
space in model text is an item of its own, and a wrapped line is
spread to the width by ./Justify (not the last line, nor one ending
in a break). A list paragraph
takes its level's indents (under its own: ./Fmt paraFmt), and its
first line holds the label (./LineLabel: in the hanging space, the
text after it at its suffix); the label is at least as high as its
text, moves with the alignment and is never spread. Pure: no desktop
services.

Pictures (Batch B): an inline that `PicRead.pictureOf(node, L.ns)` understands is one token (`PicLine.picToken`) and one item of kind `pic`, `[i, i+1)`, text `''`, shown (one caret step), never measured: its width and height are `PicLine.fitPic(pic, maxX - start)` (start: `left` once the line has something on it, else where the line begins, `x`: so a picture starting the first line fits what the first-line indent or the list label leaves; the extent in px scaled down to that width, then to at most 2112 px high, each side at least 1 px), and the item carries `pic: {...pictureOf, w, h}`, `dy` 0. It stands on the baseline: it raises `line.up` to its height, so an auto or at-least line grows to hold it above the baseline (the descent below stays the text's) and an exact line too low is clipped (`line.clip`, as Word). The tallest picture of a line decides; a picture is a break opportunity on both sides (a group of its own, flushed before and after it, as Word treats an inline picture), so a picture wider than what is left of a line wraps to the next even right after a word or another picture with no space between (final review I1), and a word right after it can wrap too; it counts as ink (a page break rule after it starts at its right edge). Anything `pictureOf` does not understand stays a `[...]` box. `DocPaint` draws a `pic` item with `PicPaint.paintPic` (the bitmap from `L.pics`, or a labelled box; a floating one outlined dashed).

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
Enter; !Letters does not (user guide, part 5). Paragraph commands at a caret format the caret's paragraph and keep the
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
`tools/lib/spritewrite.mjs`). `node tools/disc-moreapps.mjs` puts them in `!Letters.!Sprites` with `iconFiles()`; change
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
* The module size limit is 250 lines (`disc-wimplib --check` for the library): `Ui/Dialog` (250), `Ui/Ruler` (246), `LineLayout` (215: its rules moved to "LineLayout: the rules" below) and `EditView` (201) have little or no room, so split before adding to them.
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
* No creating lists or numbering definitions, no bullet/number toolbar buttons. Copy and paste (6b) kept `numPr` only within one document; since L6 a whole list item pasted into another !Letters document brings its list (a new one there: `ClipNums`, `NumCopy`); from HTML, list items are still plain paragraphs.
* Absurd values are shown as given within the 40-character cap (a start of 2^31 as `2147483648.`, a negative start as
  `-5`): `word-lists-hostile.mjs` pins this; what Word does with them is G17.
* `docs/CHANGES_NEEDED.md`: nothing; lists needed no shared-code change.

## Paragraph spacing, flow and the Paragraph box (Batch A, A1): the rules

The modules are in the tables above (`ParaSpace`, `SpacingRaw`, `ParaMenu`, `ParaPatch`, `ParaBox`, `DocItems`,
`DocStack`, `WinPanes`, the toolbar's two rows, WimpLib `Ui/Dialog`, `DialogLayout` and `Units`); the user guide is part 6
of `$.Docs.Letters`.

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
part 7 of `$.Docs.Letters`. What to know before changing them:

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
  joined to a list of the target. `clipboard-newlists.test.mjs` pins the rules for lists made by !Letters (inside one
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
* **Choices.** `autoList` in Choices:Letters (default on), written through `WordChoices` so `recent` and it never
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
* **Ctrl-Enter** (Word 2013's form; in a table's cell refused with a beep since C3.4, D25, TB22): the selection is deleted, the break goes in at the caret, and the paragraph is
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
* **User guide**: part 8 of `$.Docs.Letters` ("Inserting: breaks, symbols, links and bookmarks"; named "page and section breaks" until A5.5 and "... symbols and special characters" until A6.5): the Insert menu, page breaks, section breaks (next page / continuous, how shown, deleting, what is copied) and page break before. The guide's old parts 8 to 16 became 9 to 17 with it (`tools/docs/Contents` pointed at part 16 for programmers; Batch B's new part 9 Pictures moved it to 17). The Insert menu is where A5 (Symbol, Special character) and A6 (Hyperlink, Bookmark) add their items to the same part of the guide.
* **Hardening (A3.4).** `word-breaks-hostile.mjs` and `breaks-roundtrip.test.mjs` found no bug in the product code. They did find a gap in the test library (`expectedBack`, above) and, while writing the guide, a defect in the previous commit's docs: `tools/docs/Letters` had been committed (190f50b) with about 860 lines of an older copy of parts 1 to 7 spliced in before part 8; it is removed.

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
* **User guide**: part 8 of `$.Docs.Letters` ("Hyperlinks" and "Bookmarks", after the symbols; the rules for deleting and
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
* **User guide**: part 5 of `$.Docs.Letters`, "The format painter" (and the Format menu and toolbar lists). Questions FP1..FP6
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
* **User guide**: part 3 of `$.Docs.Letters`, "Word count" (the last subsection; the Edit menu sentence points at it).
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
* **Cell and Table (Batch C5.2, D31).** With the selection in a table (`TblCmd.rectOf`: the caret's cell or the selected cells) Apply to also offers Cell and Table, and Cell is what the box opens with (Word's). Setting gains All; Inside horizontal / Inside vertical options join Between (Between shaded for Cell and Table, the inside options and All for Paragraph and Text). Cell: the sides are those of the selected rectangle (Top, Bottom, Left, Right its outer edges, the inside ones the lines between its cells, none inside a merged cell), filled from what the layout draws (`TblBorderAt.effOf`: the table style's lines too); an outer side turned OFF is also written (nil) on the neighbouring cells across that edge whose edge lies along the selection's (the line two cells share is the heavier of their sides, D22, so turning one off needs both); a neighbour wider than the selection, or reaching past it, is not touched (its line may then still be drawn there, as Word: TBC5h), and in a table or row with cell spacing no neighbour is touched (each cell draws its own four sides, D22); a side turned ON is written on the selected cells only (a drawn side wins over none or nil, so no neighbour needs it); a side turned off is `{val: 'nil'}`; the fill is each cell's `tcPr shd`. Table: `tblBorders` and `tblPr shd`. Changing Apply to between Paragraph / Text and Cell / Table fills the box again. OK: `TblCmdCols.bordersCmd`, one step, the selection kept; a touched cell or table whose own `w:tcBorders`, `w:tblBorders` or `w:shd` is kept raw (themed) beeps and keeps the box, and a line under the options says why (every refusal of the box does: C5 fix M6). Modules: `TblBorderPatch`, `TblBorderAt`, `TblEditProps.setBorders`.
* **Names.** Commands accept only Word's schema names (`BorderNames`: `ST_Border`, `ST_Shd`); a file's other names are
  kept by the reader and drawn best effort.
* **User guide (A5.5):** part 6 of `$.Docs.Letters`, "Borders and shading" (the box, what is refused with a beep, how boxes
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
* **User guide:** part 8 of `$.Docs.Letters`, "Symbols and special characters" (the window, the sets, the Recently used row, the
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
* **User guide**: part 5 of `$.Docs.Letters`, "Changing case", the keys list and the Format menu list. Questions CS1..CS6 are
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
  BM1..BM7, FP1..FP6, W1..W4, and the word counts !Letters shows). `handoff-index.mjs` writes `INDEX.txt`, one list of
  every Batch A hand-off file (sp, nl, brk, tab, bdr, sym, case, lnk, bm, paint) with its README and what to try, for
  one real-Word session.
* **Final guide parts** (`tools/docs/Letters`, 19 parts since Batch C (C2.6, R19) added part 10 Tables and moved Batch B's
  10..18 to 11..19; Batch B (B8.2) had added part 9 Pictures): 1 Starting, 2 What you see, 3 Typing, deleting and undo (and Word count), 4 Copy, paste and find,
  5 Formatting: keys, Format menu, toolbar, ruler and zoom (and the format painter), 6 Paragraphs: spacing, tabs,
  borders and shading, 7 Lists, 8 Inserting: breaks, symbols, links and bookmarks, 9 Pictures, 10 Tables, 11
  Saving, 12 New documents, closing and quitting, 13 What is kept, 14 Fonts, 15 What it will not open, 16 Safety and
  privacy, 17 What is coming, 18 For programmers: the source and WimpLib (the "Word, part 18" in `tools/docs/Contents`
  and the README), 19 Things to know (renumbering map of C2.6: 10 -> 11, 11 -> 12, 12 -> 13, 13 -> 14, 14 -> 15, 15 ->
  16, 16 -> 17, 17 -> 18, 18 -> 19; parts 1..9 unchanged, so the `!Help` pointers to parts 3..9 stand). Every pointer in the guide, `Contents`, the README, `tools/moreapps/!Letters/!Help` and this file was checked
  against this list.

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

## Pictures (Batch B): the rules

Plan `2026-10-10-word-batch-b`; the rulings R1..R21 as finally implemented (several were changed by review rulings:
those say so). The modules are in the table of application modules (`PicRead`, `PicMedia`, `PicLine`, `PicCache`,
`PicPaint`, `PicEdit`, `PicFind`, `PicSize`, `PicOps`, `PicDrag`, `PicIds`, `InsertPicture`, `PicLoad`, `PicInsertBox`,
`PicDrop`, `PicPatch`, `PicBox`, `ClipPics`, `PicCarry`); the user guide is part 9 of `$.Docs.Letters` ("Pictures"). The
fidelity rule is the cardinal one: a picture or drawing that is not understood, or not touched by a command, is kept
byte for byte; commands touch only `wp:extent cx/cy`, `pic:spPr/a:xfrm/a:ext cx/cy` (never an `a:ext` of an `a:extLst`),
`wp:docPr descr`, and (paste only) `wp:docPr id`, `a:blip r:embed`, `a:srcRect` (converted between the Transitional and
the Strict form) and the namespace declarations a pasted node needs.

* **R1** A picture is a character of its paragraph: one U+FFFC holding the raw `w:drawing` node. `pic` is a LINE item
  kind (`LineLayout`), not a `DocItems` kind.
* **R2** `pictureOf(...).supported` means "resizable consistently": the picture has `pic:spPr/a:xfrm/a:ext`. Others are
  shown; a resize (drag or dialog size) is refused with a beep, alt text is still allowed.
* **R3** Display size: the extent in px (`EMU / 9525`, 96 dpi), scaled down in proportion to what the line leaves (the
  column; a picture that starts a line is fitted to what the first-line indent or list label leaves, B2 review M3), then
  in proportion to at most 2112 px high (`ParaSpace.MAX_LINE`), each side at least 1 px. The file keeps its extent.
  Hostile extents (0, negative, 1e9, 12.5, above 2^31-1, no `wp:extent`) are not understood (a box) or capped.
* **R4** One `PicCache` for the program (soft caps 32 bitmaps / 128 MB decoded), each window registering its own
  `onReady`. Changed by review (B2 fix round 1, rulings): a bitmap asked for in the last second is never evicted, so
  the caps are soft (up to 2x the bytes) while the pictures are in view and a timed trim brings them back; a decode that
  would pass 2x is `deferred` (label `Loading picture...`, retried after the trim); the decode is at the SHOWN size,
  bucketed to a power of two from 32 up to 4096 (`want`; a larger request later decodes once more); a failed decode is
  remembered (no retry storm). Only pictures being painted are decoded; media that `decodable` refuses never is.
* **R5** New media goes in through `setDocPart {key: 'parts'}`: the value is a NEW Map that differs from `doc.parts`
  only by added or removed names, every name in both maps the SAME bytes object; added names pass `checkPartName` and are
  not taken. Undo (the old Map back) passes the same check.
* **R6** Media names `<main dir>media/imageN.<png|jpeg|gif>` (the source's extension for a pasted one), N the first
  free number from 1, case ignored, counted over every `imageN.*` (Word's numbering) in `doc.parts`, content-type
  Override names and internal relationship targets; the search is bounded by `max(used + 2, 1024)` (a main folder too long
  for a part name refuses: `'name'`). The relationship target is `media/imageN.ext`; a Strict document gets a Strict
  image relationship.
* **R7** Deleting a picture leaves its media part and relationship (as H2 left a link's): orphans, question PI7.
* **R8** A fresh `wp:docPr` id is one more than the largest id BELOW 2^31 found in the main part's inlines (all depths,
  `mc:AlternateContent` and kept blocks included) and, by a text scan, in the header, footer, footnotes, endnotes and
  comments parts (B1 ruling M6: one odd larger id cannot block every insert); none free refuses (`'ids'`). `name` is
  `Picture N`, `descr` absent until alt text is set. Duplicate ids in a file are kept as they are.
* **R9** Insert > Picture... and a paste put the picture at the selection (replaced, as typing does); a drop puts it at
  the drop point (`v.hitAt(ev.x, ev.y)?.pos`). Only the FIRST picture of a drop or paste goes in. Changed by review (B5/B6
  ruling): further pictures of a drop are ignored with no message (not opened as documents); files that are not pictures
  open as documents, as before; a drop while an input method is composing beeps.
* **R10** Paste order: this program's exact copy; else, when the cleaned, trimmed text is empty and one of the first 8
  `files` is `image/png|jpeg|gif`, that picture (over 20 MB: `MSG.tooBig`, never read); else HTML, else plain text (a
  paste with text and a rendered image stays text). Files that are not such pictures only: a beep and a message.
* **R11** Reading a file or a pasted File is asynchronous: the picture goes in only if the window is open, the document
  not closed, and `d.stateId` and `v.sel` are as when the read began; else a beep and `MSG.changed`. Cancel, Escape or
  closing the document during a read puts nothing in (B4 review I2: `{live}`).
* **R12** A floating picture (`wp:anchor`): a resize drag is refused with a beep; in the Picture box Width, Height, Keep
  proportions and Reset size are shaded; alt text is editable (only `wp:docPr descr`). It is drawn in its paragraph with a
  1 px dashed outline, not where Word puts it; the text does not wrap.
* **R13** Insert never puts in what it cannot show: refused with a message for bytes that are not PNG/JPEG/GIF by magic
  bytes, over 20 MB, or over the decode caps (16384 px a side, 64 Mpx), checked from the header BEFORE any decode.
* **R14** A same-document paste gives every `wp:docPr` in the pasted inlines (pictures and unmodelled drawings) a fresh
  id; within one inline one old id maps to one new id (Choice / Fallback agree). Media and relationship are shared.
* **R15** Across documents a picture travels when `pictureOf` understands it, its media part exists (up to 20 MB, copied
  by reference) with an extension in `png jpeg jpg gif bmp tif tiff emf wmf svg`, and its `a:blip r:embed` is the ONLY
  attribute in a relationships namespace in its subtree (B7 review C1 ruling: a picture with an `svgBlip`, `imgLayer`,
  `hlinkClick` / `hlinkHover` or `r:link` is dropped across documents; a same-document paste keeps it as it is). The crop
  is converted between the Transitional integer and the Strict `N%` forms (B7 review I1). Otherwise it is dropped as
  before (linked, VML, other drawings). At most 1000 pictures and 200 MB per slice; `ClipStore` keeps at most 256 MB of
  picture bytes over its slices, dropping the oldest slices whole (B7 review M2). When ids or names run out the paste
  comes as plain text. An Opaque table that holds a picture still comes as text when pasted (`ClipClean`: it holds an
  inline that must exist once): the picture is lost from the copy. A typed table (C1.7) comes whole in the same
  document, its pictures with fresh `wp:docPr` ids (`ClipPics` walks cells).
* **R16** The guide's new part is `9) Pictures`; parts 9..17 became 10..18 and every pointer follows ("Word, part 17"
  in `tools/docs/Contents`, the README, both `!Help`s, this file).
* **R17** Dialog sizes in inches (`Units`, 2 decimals), accepted 15..31680 twips (0.01..22 in), EMU = twips x 635; out of
  range, an emptied Width / Height or text that is not a length is refused (beep, message line, box kept), never
  clamped. Alt text at most 1024 characters. Changed by review (B5/B6 rulings): tab, LF and CR are allowed in alt text
  (Word files have them), other control characters are refused (`PicOps.CONTROL`); an emptied Alt text removes the
  description; a `descr` over 1024 characters in a file shades the field and is left unchanged. Keep proportions applies
  on OK (one side changed: the other follows by the extent's ratio; both changed: both as given). Reset size puts the
  natural size in the fields and OK then sets exactly that extent.
* **R18** Natural size (insert default and Reset size): pixels / dpi inches, dpi from PNG `pHYs` (unit 1: px per metre x
  0.0254) or JPEG JFIF density (units 1 dpi, 2 dpcm x 2.54), each axis on its own, 96 when absent, 0 or above 10000, and
  snapped to a whole dpi when within 0.02 (11811 px/m is 300 dpi; B4 ruling, so insert and Reset size agree). The insert
  default is then scaled in proportion to the caret's section's real column width (`w:cols` included), at most 6.5 in wide
  and 9 in tall (B4 review M6); a width under 15 twips refuses (`'too-large'`). EXIF orientation is not applied (P3).
* **R19** A path typed in Insert > Picture... containing `://` is refused (never a URL); only `vfs` paths are read.
* **R20** `PicPaint` is pure; `PicCache` uses only browser globals (`createImageBitmap`, `Blob`, `WeakRef`) with an
  injectable `decode`; neither imports `riscos`.
* **R21** `InsertPicture.insert` takes `(d, sel, {bytes})`: a ./Document and a selection, one undo step, the selection
  replaced.

Mouse (B3, as finally implemented): a Select click on a picture selects its U+FFFC (handles drawn by `EditPaint`); a
Shift-Right over it selects it as it does a character; a double-click selects it and opens the Picture box. A handle drag
follows the pointer: a corner without Shift keeps the extent's ratio and is led by the side with the larger RELATIVE
change (the corner follows the pointer along that axis; B3 ruling M1), Shift frees it, an edge changes one side. The
file's extent is scaled by the box's relative change (`cx x new w / old w`: a picture fitted to the column keeps its
proportions in the file; B3 ruling), within 15 twips..22 in; back where it began makes no step; Escape, a changed
document or a picture no longer selected ends the drag at once (beep, nothing put in); no autoscroll. Undo or redo of a
resize selects the picture again (`PicOps.stepSel`).

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
* **Recent.** `Choices:Letters` `{recent: [...]}`, 8, newest first, canonical lower-case keys; corrupt, hostile or huge
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
  `w:rPrChange`) are dropped (`dropIds`). Pictures and other drawings are kept, every `wp:docPr` id in the pasted
  inlines made fresh (`ClipPics.freshDocPrs`, plan R14), the media and relationship shared.
* **Typed tables** (Batch C1.7, C6.1, D28; `ClipCut`, `ClipCleanTbl`, pure): a copy follows the selection's shape
  (`SelShape`): a `cells` rectangle is one table block of its cells (`ClipCut.cutRect`: spans cut at its edges, a
  continue cell at its top row a restart, the grid of its columns; SelShape grows the rectangle to whole merges, so a
  copy does not cut a merge); a `mixed` range gives its paragraphs and, for each table it touches, a table block of the
  covered rows (`cutRows`); a covered table comes whole. Cell paragraphs whole, nested tables whole, no ids at any
  depth (`Walk.mapBlocks`); `ids` a source id per walked block; lists and pictures in cells travel (`ClipNums`,
  `ClipPics` walk the blocks); the HTML is a `<table>` and the plain text a line per row, cells joined by tabs (C6.3,
  "Tables as HTML" below).
  Same document: `sameTable(block, cleanPara)` cleans its paragraphs at every depth with the paragraph rule above,
  drops `w14:paraId` / `w14:textId` from row and cell `attrs` (`keepAttrs`, `keepIds`' rule) and the marks between rows and cells whose element is in `UNIQUE` (a
  bookmark pair between rows stays in the source only), turns an Opaque cell block with ids into text (`flatten`; a
  cell left empty gets one empty paragraph) and takes `w14` ids off the others; `ClipPaste` puts it in with
  `freshTable(block)`: a fresh id for the table, each nested table and each paragraph, `extraP = []` (the one helper
  for fresh table ids). Another document (C6.1; R10's flattening is gone): `crossTable` makes it a table there: its
  paragraphs by the cross-document rule above (styles by name, pictures carried, lists made: `ClipPaste` maps the
  numPr of a pasted table's cell paragraphs too), tblPr / trPr / tcPr with every modelled field (`ClipProps.crossTblPr`:
  `tblStyle` mapped by name to a target table style; with the source's styles in the copy (`slice.styles`, the exact
  route) kept as the source's id and made by `ClipPaste` (C6.2, below); jc spelled for the target;
  the raw extra cleaned as pPr's, but `w:cnfStyle` kept), a row's `tblPrEx` cleaned the same way, no attributes on the
  table, grid, rows or cells (rsids, w14 ids: as a pasted paragraph's `extraP`), no marks between rows and cells,
  Opaque cell blocks skipped (a cell left empty or ending with a table gets an empty paragraph). A raw element keeps
  its spelling (a Transitional `w:left` side in a raw border is not renamed for a Strict target: read back raw, R22).
  An Opaque table across documents is skipped, as before.
* **Regular expressions over untrusted input** (C6 fix A1, A2; `tests/moreapps/regex-hostile.test.mjs`): pasted HTML,
  loaded parts and typed values reach regular expressions, and two unbounded runs over overlapping characters can
  backtrack in O(n^2) (a pasted `border` of 100,000 spaces took 6.5 s; 3.9 MB would have frozen the desktop for
  hours). Every regular expression in `!Letters` and `!WimpLib` is audited by that test: one with no unbounded run, or
  anchored at the start with one, is linear by its shape; every other one is listed in the test's `AUDIT` table with
  the reason it is linear (or the cap that bounds its input), and a new one fails the test until it is listed. Fixed by
  the audit: `ClipTblLook.tableBorder` (trimmed first), `ListUsed`'s numId scan of other parts (a tag ends at the first
  `<` or `>`: 1 MB of `<w:numId ` took 81 s) and `SaveState.suggestName` (the trailing digits found by a loop). The
  audited ones are pumped with 100,000 characters (each under 200 ms), and 1 MB values (and values just under the
  attribute cap) go into every attribute, style and text the HTML reader reads, the CSS, URL and number parsers and
  the part scans. The HTML readers read attributes only through `ClipDom.attrOf`, which ignores a value longer than
  65,536 characters.
* **Pasting tables** (Batch C6.2, D27, D28, TB15; `ClipPasteTbl`, `TblStyleCopy`): a table block at a caret goes in as
  Insert > Table places one (mid-paragraph the paragraph is split and the table goes between, at a paragraph's start
  before it, in an empty paragraph before it, at its end after it with a paragraph after it); a table that would follow
  a table directly (typed, or a kept `w:tbl`: `TblCheck.endsCell`) gets an empty paragraph before it, and pasted
  tables next to each other get one between them, at every depth, in cells too (`ClipCleanTbl.apart`, C6 fix B1:
  tables never touch; HTML `<table></table><table></table>` was pasted touching, and Word joins such tables). Several blocks keep the paragraph rules. In a
  cell the table is nested; a table that would be nested deeper than 8 is pasted as its text (`fitDepth`: a paragraph
  per row, cells joined by tabs). One table block pasted over a `cells` selection overwrites the rectangle's cells'
  contents from its top-left: no row or column added, the cells' properties kept, extra pasted cells dropped, hidden
  vMerge continue cells (target or pasted) left as they are, the bookmarks of overwritten text kept paired (C6 fix B3:
  a kept start goes to the start of the first cell overwritten, a kept end to the end of the last, so no pair is
  reversed; the same rule for cells cleared by Delete or Backspace); anything
  else pasted over cells clears them first as before. Fresh ids for every paragraph and table at every depth. Across
  documents with the source's table styles (`slice.styles`, carried by `ClipStore` and `ClipPick`'s exact route), the
  pasted tables' styles are the target's of the same name or copied with their basedOn chain by
  `TblStyleCopy.copyStyles` into the target's style table, its `setDocPart styles` op in the paste's `d.atomic` (one
  undo step: undo gives back the very `doc.styles` object); lists and pictures in cells are made as for paragraphs
  (`ClipNums`, `NumCopy`, `ClipPics`), over cells only for the cells that land. HTML pastes keep mapping by name. At
  most 500 table styles are copied by one paste (C6 fix B5). Across conformance (C6 fix B4), a raw property element
  of a pasted table, row or cell that the target reads as a field (Word 2010's Strict `w:tblBorders` with `w:left`,
  raw in Strict, is a border field in a Transitional document, and the reverse) becomes that field, so the pasted
  table shows as its saved file will.
* **Pictures across documents** (Batch B, B7: `ClipPics`): a picture `PicRead` understands whose media came with the
  copy (`slice.pics`) is kept by `ClipClean` and `ClipPaste` copies it in the same undo step: a new media part per
  source embed (the source's extension), a relationship of the target's kind (Strict / Transitional), the node bound
  to the target's namespaces, a new `r:embed` and fresh `wp:docPr` ids. Linked (`r:link`), VML and other drawings, a
  missing part, an unknown extension, over 20 MB, past 1000 pictures or 200 MB: dropped as before.
* **Across documents** (`ClipClean`, also for !Letters' own copies from another window): raw inlines with relationship
  ids (hyperlink `r:id`, drawing `r:embed`: but pictures, above) and every other raw inline become their display text (without the
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
  items are plain paragraphs, tables are tables ("Tables as HTML" below; past its limits a paragraph per row with
  tab-separated cells). Any failure: the plain text.
* **Text to table and table to text** (Batch C6.4, D29, TB16; `TblConvert`, `TblToText`, `TblConvertCmd`, `TblConvertBox`):
  Table > Convert > Text to table... takes the top-level paragraphs of the selection (whole; refused with a message in a
  cell, across a table, across a section, with a complex field the table would cut (C6 fix B2: a separator inside it,
  a paragraph end while it is open, for every separator, Paragraphs too, so a table of contents is never converted;
  a selection starting or ending inside a field), past 32767 rows) and makes Insert >
  Table's table of them in one undo step: a paragraph a row cut at tabs, commas or one other character, or Paragraphs
  `cols` to a row. Our rules where Word's are not given: a long row's extra pieces go in the last cell with their
  separators; every cell paragraph keeps its source's pPr and pStyle (padding cells too); the separator the text
  suggests is chosen when the box opens, the columns follow it. Table to text... converts the WHOLE table the caret is in
  (rows are one paragraph, further cell paragraphs follow; nested tables flattened first with the same separator;
  merged cells once; marks kept as inlines) and selects the result.
* **Tables as HTML** (Batch C6.3, D28, TB17; `ClipHtmlTable`, `ClipReadTable`, `ClipTblLook`, `ClipWalk`): out, a table
  is a `<table>` (`colspan` from gridSpan, `rowspan` from vMerge, widths in pt, a 1px solid black border where a cell
  has one of its own, of the table or of its table style, `background-color` from the cell's shading; its cells'
  paragraphs by the paragraph rules; nested tables nested) and its plain text a line per row, cells joined by tabs, a
  cell's paragraphs by spaces (Word's text/plain). In, a `<table>` (from a browser, Word, Google Docs, LibreOffice,
  Excel...) becomes a table block: thead / tbody / tfoot rows, `<td>` / `<th>` cells (`<th>` bold), `colspan` /
  `rowspan` (not 1..63: 1) as gridSpan / vMerge, ragged rows filled with empty cells, widths from `width` / `style`
  (px, pt, in, %), else equal shares of the text width where it is pasted, `background-color` (or `background`,
  `bgcolor`) as shading, any border style as single 4 borders on that cell (or every cell for `border="1"` on the
  table), `<caption>` a paragraph before it; Word's `mso-` styles and classes are not read. It is pasted as a table
  from another document (`ClipClean.cross`, `ClipPaste`: placement, nesting, depth 8, over cells). Past 63 columns,
  1000 rows, depth 8, 63,000 cells in one paste or the reader's node and text limits, a table is flattened as before,
  never cut.
* **What !Letters puts on the clipboard**: text/plain always (`\n` between paragraphs, a table a line per row with tabs
  between cells, a kept block an empty line); text/html (`ClipHtml`: only `p h1-h6 ul ol li b i u s sup sub span br a
  table tr td`, every text and attribute escaped, the
  resolved formatting, `<a href>` only for an External http / https / mailto hyperlink of the document's rels) unless
  over 2,000,000 characters; then text/html is the marker and the plain text escaped in one `<pre>` when that is at
  most 2,000,000 characters (the core's paste cap: the exact route still works, other programs get the text), else
  there is no text/html (other programs and !Letters get the plain text; !Letters' paste is cut at 100,000 units and says
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
  boundaries at both ends, never across paragraphs, tables searched in flow order since C3.5; link text found (one match per link) but not
  replaced (`skipped`). See the `Find` / `FindText` / `EditFind` row above.
* **Measured** (`word-clipboard-hostile.mjs`, Chromium, an M-series Mac): select-all copy of 50,000 paragraphs well
  under 3 s; Replace all over 50,000 paragraphs about 0.9 s (undo about 0.6 s); a 5 MB text paste (cut to 100,000
  characters) about 20 ms; 100,000 paragraphs of HTML about 1 s (about 99,997 paragraphs read before the node limit);
  1000 real Ctrl-V presses about 1.2 s.
* **Open** (`docs/CHANGES_NEEDED.md`): pictures and other rich types from the asynchronous clipboard (`readClipboard`
  reads text and HTML only); the core's `clipboard: true` placeholder for Safari / Firefox is untested and off;
  pasting pictures or files; keeping lists and tables from other programs; the per-character paste into a writable
  icon (Find's fields).

## Tables (Batch C): the rules

Status at the end of Batch C (C7.3): tables are read, kept, written, walked, addressed, drawn, edited (caret, cells,
rows, columns, merge, split, properties, borders, drags, the ruler), copied, pasted and converted. The sections below
were written task by task; "The rules R1..R24 as finally implemented", "Performance (D20), measured", "Batch C modules:
lines and kind" and "Known limitations of tables, consolidated" (after them) are the reconciled summary.
Decisions D1..D33 are in the spec; the ones C1 built (D8..D10, R5 and R11 are now built and retired: see "Carets in
cells", "Selection shapes", "Moving and selecting in tables", "Typing and deleting in tables" and "Formatting, lists,
links, pictures, bookmarks and Find in cells" below):

* **Shape (D1, D2).** `Table`, `Row`, `Cell` as in "The data model". Merges stay as in the file (`gridSpan`, `vMerge`);
  rows and cells have no id (D3); table ids come from `nextId`. The reader is all or nothing per table (D11): a table
  it does not understand completely stays an `Opaque` block, byte for byte.
* **Opaque reasons (R3, R1).** One per table, the first found, in this order: `tracked`, `wrapped`, `hMerge`, `grid`,
  `span`, `sectPr`, `propAttrs`, `order`, `stray`, `empty`, `ns`, `tail` (and `depth` for a table nested 9 deep, an
  Opaque block of its cell). `tail` (C3 fix wave, C3b I2): a cell whose last block is a `w:tbl`. Word reads a `w:tc`
  that does not end with a `w:p` as unreadable, and typing the table with a paragraph added would change the file, so
  it stays Opaque (0 such tables in the corpus; a cell ending with a content control, 52 in the corpus, types as
  before). The model keeps the rule from then on: `TblCheck` refuses a cell ending with a table, the ops refuse to
  leave one, and the editing commands never try (see "Typing and deleting in tables"). The corpus histogram is pinned in `corpus-expected.json` (`opaqueTables`, every reason named, 0
  for those the corpus has none of); any change fails the test. Structural values fail closed (R2): a bad `gridCol`
  (also one not spelled as the writer writes it: `-0`), `gridSpan` 1..63, `vMerge`, `gridBefore` / `gridAfter` 0..63,
  a row wider than 63 grid columns (`gridBefore` + its cells' spans + `gridAfter`; a row may be wider than the grid)
  make the whole table Opaque; display fields not understood go to `extra`. `stray` covers text, comments and
  processing instructions anywhere in the property area, including inside `w:tblPr` / `w:trPr` / `w:tcPr` (the
  property reader would drop them). `ns`: `w:tbl`, `w:tblGrid`, `w:tr`, `w:tc` or a cell's `w:p` declares the prefix
  `w` (the writer names these elements `w:...`, so a rebinding would put them in another namespace).
* **Marks between rows and cells (R4).** Only `TblRead.MARKS` (bookmarks, comment and permission ranges, `proofErr`,
  move ranges) may sit directly in `w:tbl` (a row's `lead`, the table's `tail`) and in `w:tr` (a cell's `lead`, the
  row's `tail`); in a `w:tc` they are block-level and make an Opaque cell block.
* **Paths (D4, D5, R9, R14).** `[s, i]` or `[s, i, r, c, j, ...]` (length 2 + 3k, k <= 8); a table block has k <= 7.
  Helpers live in `Path` only. Ops at a nested path copy the tables on the path first (`OpsPath.own`): objects are
  never changed. A structural table change is one `restoreBlock` (D4).
* **Edit locations (D6, R5).** `EditPos.findBlock` returns `{at, k, rank, b, s, i?, depth, cell?, endRank?}`: `k` keeps
  its top-level meaning (`EditRange`'s arithmetic), `rank` is the flow rank; comparisons use `rank`. Every consumer
  builds ops from `loc.at`; the gate `paths-gate.test.mjs` (R15) lists what is still top level.
* **Scanners (D7).** All walk the model through `Walk` (`blocks`, `scan`, `at`, `ids`, `mapBlocks`, `flatText`); XML
  is read only inside an Opaque block or an inline. A typed table gives the same word count, numIds, picture ids and
  bookmark names and pairs as the same table read Opaque (`walk-scanners.test.mjs`). Since C3.5 a position found
  inside a typed table is real (a bookmark in a cell is at its paragraph, a Find match at its path; R11's
  outermost-table edge, `Walk.outerEdge`, is gone and the gate asserts no call remains).
* **List numbering through tables.** Typed, a list that goes on into a cell numbers in flow order (the table, then its
  rows, cells and blocks in order), Word's rule: `one 1., two 2., three 3., four 4.`. The same document with the table
  Opaque numbers `one 1., four 2.` (the Opaque table is skipped, as before `Walk`). `listnumbers.test` pins both. Users
  see the first for every table the reader now types, so numbers after a table whose cells hold items of the same list
  go up, as in Word (the guide's part 7 says so; since C2 the cells are drawn, with their numbers).
* **Info (R12).** `facts(doc)` counts typed tables (`tables`) and paragraphs at every depth; an Opaque table stays a
  preserved item. Summary `'8 paragraphs, 1 table, 2 preserved items (...)'` (the tables part left out when 0);
  the Info box's paragraphs field says `9 (2 tables)`.
* **Caps (R16, `TblCheck`).** `MAX_COLS` 63 (grid columns, and the width of a row in grid columns), `MAX_DEPTH` 8,
  `MAX_TW` 31680, `MAX_ROWS` 32767. The paragraph cap of the reader counts paragraphs inside tables. `TblCheck`
  checks the same row width and `gridBefore` / `gridAfter` 0..63, so no op can make a model the reader would refuse.
* **Writer (D13, D14).** `TblWrite` writes a typed table equal to the file but for the documented normalisations:
  those of every body paragraph; property children in schema order; empty `trPr` / `tcPr` left out; white space
  between elements dropped, also between the children of a field read from them (the sides of `tblBorders`,
  `tcBorders`, `tblCellMar`, `tcMar`); `<w:vMerge w:val="continue"/>` written `<w:vMerge/>` (Word's form, R2);
  element and attribute prefixes normalised to `w:` (a WML element under another prefix bound to WML, such as
  `x:tblW`, `x:tr`, is written `w:tblW`, `w:tr`; the meaning is the same). Content is written in each element's own
  namespace scope, as it was read. An Opaque table writes its node as before. `tables-corpus.test.mjs` checks each corpus
  table with `canonTbl`.
* **Clipboard (R8, R10, D28's C1 part).** `ClipCleanTbl` (one cleaner for cell paragraphs, no cycle, R8): within one
  document a covered typed table comes whole (`sameTable`: cleaned paragraphs, no w14 ids, unique marks dropped, so the
  bookmarks stay with the original; pictures get fresh `docPr` ids; `freshTable` gives every id fresh); across documents
  it was flattened by the model until C6.1, which pastes it as a table (`crossTable`). An Opaque table keeps today's
  behaviour exactly (across documents it is skipped). Since C6.1 a partly covered table gives the rows (or the cell
  rectangle) the selection covers. Cut and paste of a table within one document therefore loses its bookmarks and comment
  ranges (the copy has none, the cut removed the original); copy keeps them on the original (guide part 4).
* **Switch (R23).** The `tables` option of `readDocx` is gone: typed is the default since C1.7.
* **Migration checklist (D6): done in C1.5.** Every `[loc.s, loc.i]` / `block: [s, i]` user takes `loc.at`; those that
  stayed top level were in the gate's allow list with an `until` (C3.4 / C3.5); both lists are empty since C3.5.

* **Columns of items (D17, C2.1).** The layout is a tree of columns, each `{x, w, items}` stacked by `DocStack`. The
  page is the root column `L.root` (`x` = `L.left`, moved by `layout()` with `DocItems.moveColumn` when the page
  moves; `w` = `L.textW`; `items` = `L.items`). Every item carries `x`, `w` (its column's), `col` and `ci` (its index
  in `col.items`); `index` is its place in `L.flow`, the caret-holding items in flow order (C3.1: cells' items too,
  see "Carets in cells"; `L.items` itself, the same array, in a document without a typed table). Whatever places, hits or draws an item reads `it.x` / `it.w`, never `L.left` /
  `L.textW` (which stay the page's: page rectangle, extent, `AppWin`): `DocHit` (caret, hit, box), `ItemPaint`,
  `MarkPaint`, `DocPaint`'s border boxes, `DocRects`, `SelVert`, `LinkFind`, `PicFind`, `BorderGroups` (box width),
  `DocStack` (the width a paragraph is broken at), `RulerInd`. Neighbours are taken in the item's column
  (`it.col.items[it.ci +- 1]`: `ParaSpace`, `BorderGroups`, `DocHit`'s bottom-border gap); everything that walks
  positions in order walks `L.flow` by `index` (`DocRects`, `Selection.text` / `clamp`, `next/prevItem`,
  `docStart/End`, `DocPos.compare`); `DocPaint` walks the root column by `ci`. `DocPos.itemEnd` / `clampOff` treat
  every item that is not a paragraph as atomic (off 0 or 1). Documents without tables lay out exactly as before C2:
  `notable-layout.test.mjs` compares six of them with the pre-C2 snapshot.
* **Table styles and the cell layer (D15, D16, R6, C2.2).** Table styles are read only (`TblStyle.viewOf`, a frozen
  view per Style object; nothing is written: styles keep their XML). A cell's formatting comes in D16's order: the
  style's whole-table parts, its conditions (`TblCond.condsOf`: bands, first/last column, first/last row, corners)
  from the table's `tblLook` (`lookOf`: the 2010 flags over the hex), then (C2.4 / C2.5) the table's own `tblPr`, the
  row's `trPr` and the cell's `tcPr`. A cell's paragraphs see the style through `TblCond.stylesFor(styles,
  layerOf(...), compatOf(doc))`: a derived style table whose document defaults have the layer merged over them, so
  `Styles`, `Fmt` and `LineLayout` are unchanged (one function to change: `stylesFor`). With the compatibility switch
  `overrideTableStyleFontSizeAndJustification` on (Word 2013 and later write it), the table style's font size and
  justification win over Normal's; off (older documents), Normal's win. Identity: every cell with the same conditions
  gets the very same layer object, and a (styles, layer, compat) the very same derived table, so the layout's caches
  can key on them. Themed colours (`w:themeColor`, `w:themeFill`..., which Word writes in all its built-in table
  styles beside a literal colour) stay raw in the model and are written back untouched; for the screen
  `TblColor.showThemed` reads the literal colour and ignores the theme and its tint or shade (an approximation: TB4b).
  `GRID_TABLE_4` / `LIST_TABLE_3` in `tbl-fixtures.mjs` are Word's definitions with their theme attributes, as Word
  writes them (`styleFromCorpus(id)` gives Word's own when the corpus is there).
* **Grid view and widths (D2, D18, R24, C2.3).** Merges stay as written; `TblGrid.gridOf` resolves them into a
  memoised view (grid columns per cell, the merge's top cell, rows covered) that every consumer shares. Widths are
  `TblWidth.colsOf`'s: a Word-made file is shown with the widths of its `w:tblGrid` (Word writes its last layout
  there); only a grid that cannot be right (all 0, too few columns, or off a twips `tblW` by more than 1/20) is
  rebuilt from the cells' `tcW` and the text's min widths (an approximation of Word's autofit: TB7). A `tblW`
  scales an autofit table, never a fixed one; a table may be wider than its column (at most 4000 px, exactly), and
  the work area then reaches its right edge (D18 step 4: `DocStack` records the widest top-level table as `L.wide`,
  `layout()`'s extent takes it, so the window scrolls to it; 24 corpus tables are wider than their page). 15 twips are
  1 px (`TW_PX`, not rounded). `tblInd` shifts a left-aligned table; `jc` centres or right-aligns one that fits.
  Cell margins: `tcMar` over the style layer's over `tblCellMar` over the style's, 108 twips left and right by
  default; `tblCellSpacing` insets every cell by its value on each side (the table does not grow).
* **Rows and cells laid out (D17, D19, D20, C2.4).** A typed table is ONE `'tbl'` item of its column; each cell is a
  column `{x, w, items, styles}` of its blocks' items (paragraphs `'p'`, Opaque blocks and tables deeper than 8
  `'box'`, nested tables `'tbl'`, the same code at every depth); `L.byId` holds every id at every depth. `DocStack`'s
  `stackColumn(L, col, y0)` is the page's algorithm for any column: paragraphs broken at the column's width with its
  `styles` (`L.cacheFor(styles)`: one `Fmt` cache per derived style table, R6), decorators per column from the item's
  column (`FlowDeco.stylesOf`), `SectDeco` and `FlowDeco` only in the root column; a `'tbl'` item is laid out where it
  stands (`TblLayout.layoutTable`). Reuse (D20, C2 fix wave): a table's item is kept WHOLE when its block object,
  column width and styles, list labels and the layout-wide key and decorators are the same (`TblReuse`): a keystroke
  outside a table stacks no cell, and a table that moves is only placed again (rows and cells hold their places
  relative to the table's top, `ry`, so the result is the very one a new layout gives). In a changed table, rows whose
  object and geometry are the same keep their cells, and a changed row keeps its unchanged cells: a keystroke in a
  cell stacks that cell only, then the rows' heights (O(rows) arithmetic) and the places. A cell paragraph's lines
  are kept under today's key plus its column's width and styles object. Measured (Node, median of 20): five 1000 x 5
  tables in 1,000 paragraphs, a plain keystroke about 1.7 ms against 0.3 ms without the tables (15.6 ms before), a
  cell keystroke about 2.8 ms (`tblreuse`); one 1000 x 5 table, a cell keystroke about +1.5 ms over a plain one
  (+2.5 ms when the grid is unusable: the widths are recomputed, cell min widths memoised per cell). Kept items are
  shared with the older layout (their y, x, index and endIndex follow the new one; the older layout is used up: see
  "Carets in cells"). A word wider than an autofit column widens
  it, and the whole column is laid out again. `moveColumn` places nested columns from their geometry (no drift).
  `borderDeco.keyOf` holds the column's width. `DocPaint` walks the root column by `ci`; `DocRects` walks `L.flow`
  by place (C3.1).
* **Tables drawn (D21, D22, C2.5).** `DocPaint` hands a `'tbl'` item to `TablePaint.paintTable`, which draws only the
  rows meeting the paint rectangle (a screen of a 1000 x 5 table: about 30 rows; `it.painted` records them, and
  `EditHook`'s `tables()` shows them to the browser tests) in D21's order: table shading, cell shading, the cells'
  items (clipped for exact rows), the resolved borders. Each cell edge is ONE border (`TblBorders.edgesOf`): the
  cell's own `tcBorders`, else the table style's conditional parts (a part's region is the cells sharing its
  condition, so Grid Table 4's header row has its own outer sides and `insideV nil` between its cells), else the
  table's `tblBorders`. Two cells meeting: `TblConflict.conflict` (weight, D22's list, the darker colour, the cell
  above / to the left). Themed table and cell borders and shading (direct or from the style) are shown by their
  literal colour, never changed in the model (`TblColor.showThemed`, memoised by `TblBorders.shown`). Documents
  without tables draw exactly as before (only the `'tbl'` branch is new; the 50,000-paragraph budgets of
  `word-typing-hostile` and `word-format-hostile` pass with their thresholds unchanged).
* **Carets in cells (D8, D9, C3.1).** Positions stay `{id, off}`; a caret is in a paragraph at any depth or at a
  table's edge `{tableId, 0 | 1}`. `L.flow` (`DocItems`) holds every caret-holding item in flow order: a table's item
  at its start (`index`), its cells' items row by row, cell by cell (a vMerge continue cell's own paragraph too;
  nested tables the same way), then the table's item AGAIN (`endIndex`); the places are `EditPos`'s ranks
  (`rank`, `endRank`: tested on every item). `DocPos.placeOf` gives a position's place (a table's off 1:
  `endIndex`); `compare`, `L.locate(pos).index`, `Selection.text` and `DocRects` go by it (`DocRects`: the band's
  ends from the root column's items, a table's to its `endIndex`; a cell's item outside the band passed; tables lit by the selection's shape since C3.2, see "Selection shapes"). `DocHit.hitTest` in a table: the
  row at y (`TblLayout.rowAtY`), the cell at x (outside every cell: the nearest one; in a lower row of a vertical
  merge: its restart cell, which holds what is shown), then the item of the cell's column at y (`itemIn`, the rule
  of `L.itemAtY`), nested tables the same way. Left / Right (`SelVert.step`) go through `L.flow`: from the end of
  the paragraph before a table straight to its first cell's start, from the last cell's end to the paragraph after;
  a table's edge is a stop only where no paragraph is beside it in its column (`reachable`: a table first in the
  document or a cell, last in a cell, next to another table or a kept block); Right from `{t, 0}` goes into the
  first cell, Left from `{t, 1}` into the last. paraStart / paraEnd go by the same steps. A vMerge continue cell's
  items (its own paragraphs and nested tables, which are never drawn or hit) are passed by every step (C3 fix wave;
  Left / Right, word and paragraph moves, Shift-extend), as Up / Down, clicks and Tab pass them, and
  `Selection.clamp` maps a position in one to the start of the merge's restart cell (`TblPos`), so nothing typed
  lands where it cannot be seen; `TblPos.firstPos` / `lastPos` pass them too. Up / Down go by the cells'
  geometry since C3.3 (see "Moving and selecting in tables"). Enter at `{t, 0}` (as for a kept block) or at
  offset 0 of the first paragraph of the first cell of a table first in its container puts an empty paragraph before
  the table (`EditPara`; nested through `EditRange.paraBy`); Enter at `{t, 1}` puts it after (the kept block's rule,
  unchanged); anywhere else in a cell Enter splits the cell's paragraph. `Selection.clamp` finds blocks at every
  depth (`EditPos.findBlock` since C3.4: O(top-level blocks) with whole rows passed, `EditRank`; for a position whose
  block is gone, up to 8 lookups by `findBlock`, then a map of every block: 5.7 ms -> 0.2 ms in a 1000 x 63 table, C3
  fix wave). A gone position goes to the next block still there in the old flow; when that is a table's END place
  (the table's last paragraphs gone) it goes to the end of the table's last paragraph left (`TblPos.lastPos`), never
  to its start edge (C3a m1; a table's id is twice in the old flow, so the place is told by whether the id comes
  again, reading ids only). **The two layout rules (C2 re-review):** (1) a previous layout is USED UP once a layout is
  built from it: `DocItems.buildItems` sets `prev.spent`, and a spent prev is never kept from again (offered a second
  time, the new layout is built fresh; `cellpos` checks that the first layout built from it is not disturbed); only
  ids (and a gone item's index) are read from it (`Selection.clamp`). (2) `TblReuse.register` is the one place where
  a kept item's layout-dependent fields are refreshed: it puts every kept item in the new `L.flow` (`index`,
  `endIndex`) and `L.byId`, in the order a new layout makes them (`cellpos`, `tblreuse`: equal to a fresh layout's).
  Documents without a typed table: `L.flow` is `L.items` as before, and nothing changes (the `notable-layout` and
  `nopic` snapshots pass). The D20 budget is unchanged (five 1000 x 5 tables: plain 1.7 ms, cell 2.8 ms).
* **Selection shapes (D10, C3.2).** The selection stays `{anchor, head}`; `SelShape.shapeOf` derives its shape:
  `text`, `cells` (a rectangle of grid rows and columns in the innermost table where the ends are in different
  cells, grown until no merged cell crosses its edge; whole when it covers every cell or is `{t,0}..{t,1}`) or
  `mixed` (an end outside the table: each table touched taken as whole rows from the end's row to its edge toward
  the other end, a table spanned whole). A range between two paragraphs of one container with a typed table
  between them is therefore `mixed` (the table whole), not `text`. Painting (`DocRects`): a `cells` shape lights
  each cell's box on whole pixels (a vertical merge over every row it spans, also when it starts above the band),
  only the rows in the band; a whole table one box over its rows (the table's box); a `mixed` range its text as
  before and one box over each table's taken rows (the table's width), not their text. `EditPaint` fills the rects
  as before (multiplied, `SEL` / `SEL_OFF`): it needed no change. A layout without a typed table never asks for a
  shape (`L.flow === L.items`: all text), so table-free painting is unchanged. Commands that act on shapes: typing
  and deleting since C3.4 (below), formatting since C3.5 ("Formatting, lists, Find... in cells" below), through
  `shapeOf` and `paraRanges`.
* **Moving and selecting in tables (D10, C3.3).** Up / Down keep goalX by the cells' geometry (`SelTable.vertical`):
  within a cell's column first (its lines, then its next block, a nested table entered at goalX), then the cell
  above / below that spans goalX (a vertical merge's restart cell), then out of the table to the item beside it in
  its column (none: its edge). Home / End: the line in the cell (`PositionMap`, unchanged). Tab / Shift-Tab with the
  head in a cell: the next / previous cell of the innermost table in flow order (continue cells skipped), its whole
  content selected; Tab in the last cell adds a row (C4.1, below), Shift-Tab at the first cell does nothing; in a list paragraph in a cell
  Tab still moves cells (EditKeys looks before the keymap's list Tab). Ctrl-Tab (`cellTab`, R21) types a tab in a
  cell and goes on elsewhere; the desktop passes Ctrl-Tab to the window (`src/core/wimp.js` gives it code &1AA), and
  the browser suite gets it there, but a real browser keeps Ctrl-Tab for its own tabs (it never reaches the page):
  an owner question, no core change. Shift + any movement extends; a cell boundary crossed makes a `cells` shape
  (derived, C3.2). The mouse (`EditMouse`, plain Select click): the cell's column (`DocHit`); `SelTable.zoneAt`'s
  zones select a cell's content, a row or a column; a drag across cells is their rectangle; double / triple click as
  in a paragraph; Ctrl-A the document. `DocHit.cellAtX` is the one rule for "the cell at x in a row" (hits, Up /
  Down, zones); a point exactly on the boundary between two cells is the right-hand one (the box `[x, x + w)` that
  holds it; before C3.3 it was the left-hand one).
* **Typing and deleting in tables (D10, D25, TB10, TB11, C3.4).** In a cell typing and Enter work as in a paragraph
  (Enter splits within the cell); Backspace at the start of a cell's first paragraph and Delete at the end of its last
  do nothing, no beep (nothing joins across a cell's edge). By a typed table (TB10): Backspace at the start of the
  paragraph after it removes that paragraph when it is empty (or holds only unseen inlines, the kept-block rule) and
  is not the last of its section or cell, the caret going to the end of the last cell; otherwise the caret just moves
  there. Delete at the end of the paragraph before it removes that paragraph when empty (the caret in the first cell),
  otherwise does nothing. On a table's edge `{t, 0|1}` the kept-block rule: the first press selects the table, the
  next deletes it (a section left ending with a table gets its carrier paragraph, a cell left with no block or ending
  with a table a paragraph). Over a `cells` shape (TB11): Delete clears the cells (`TblEdit.clearCells`: each keeps
  one empty paragraph, `emptyLike` of its first: its `pPr` and style, a fresh id; cells already empty: no step);
  Backspace removes the rows when the rectangle spans every grid column (`deleteRows`), the table when it is the whole
  table, else clears; typing, Enter, paste and anything else that replaces a selection (`EditRange.deleteRange`)
  clears the cells and goes into the top-left one. A `mixed` range deletes its paragraphs and the rows it covers (a
  table whose rows are all covered goes) in one step; rows removed pass a vertical merge's restart to the next row,
  and their marks between rows and cells move to the next row (C4.1: so do the bookmark marks in their paragraphs
  whose partner is not in them, `TblEdit.deleteRows`); a bookmark mark deleted or cleared whose partner is still in
  the document goes back at the caret (`BookmarkKeep.stillPaired`; a mark the deletion moved is not put back twice). Ctrl-Enter (a page break) and section
  breaks in a cell are refused with a beep (D25, TB22). C3 fix wave (C3b I1, I2, M3): a paragraph removed by TB10's
  Backspace or Delete (or from a kept block's edge) because it holds only unseen inlines gives its bookmark marks
  whose partner stays to the caret's place in the same step (`BookmarkKeep.marksIn` / `stillPaired` / `putMarks`: a
  bookmark spanning a table, its end in a mark-only paragraph after it, stays whole); Delete (or Ctrl-Delete) on a
  nested table's end edge never removes its cell's last paragraph (the caret goes into it: a cell ends with a
  paragraph); after an undo or redo of a block removal next to a typed table the caret goes where TB10 put it (the
  end of its last paragraph, or the start of its first: `EditApply.stepEnd`), never to the table's edge. Every one is
  one undo step (a table changed by one
  `restoreBlock`, `TblCmd.onTable`); undoing a table restore puts the caret in the first changed row (R18,
  `EditApply.stepEnd`). D20, measured here: a lookup by id walks only the row holding it and an edit in a cell
  re-walks only that row (`EditRank`: 0.8 ms -> 0.03 ms in a 1000 x 5 table); `Selection.clamp` uses `findBlock`
  (a keystroke in a cell of a 1000 x 5 table: 0.45 ms -> 0.09 ms; with five such tables 2.0 ms -> 0.1 ms; in
  50,000 paragraphs 2.6 ms -> 0.6 ms);
  `TblGrid.gridOf` reuses the grid of the table a cell edit copied (0.4 ms a keystroke). A whole keystroke (edit,
  layout, clamp) in cell (500, 2) of one of five 1000 x 5 tables: about 2.4 ms against 0.25 ms without the tables (6.0
  ms before these); in the browser (edit, layout, paint, one table) 1.8 ms against 1.0 ms in a plain paragraph.
* **Rows, Tab in the last cell, split table (D23, D25, R16, R17, R18, R21, C4.1).** Every command is pure
  (`TblEdit` on a Table) and applied by `TblCmd` as ONE `restoreBlock` of a new table that shares every row, cell and
  paragraph it does not change (split table: that, plus an `insertBlocks` of the empty paragraph and the second
  table), in one `d.atomic`: one undo step, none when refused (not in a table, a `mixed` selection, past `MAX_ROWS`
  32767), and undo gives back the very old table object. Insert rows (as many as the shape's rows) copies the row
  beside them; a cell strictly inside a vertical merge (the new row between two of its rows) becomes `continue` (the
  merge grows); below the merge's last row (Tab in the last cell, Insert row below) or above its restart the new cell
  is plain (C4 fix wave, A4 ruling: a category column merged down to the last row does not swallow Tab's new row);
  `tblHeader` stays only when the new rows stay in the header run (our reading of D23, TB row for C7.2).
  Delete rows reuses C3.4's `deleteRows`; all rows: the table goes, the caret in the block after (an empty paragraph
  made at a section's end). Tab in the last cell (`EditKeys`, only Tab going forward: Shift-Tab at the first cell
  does nothing) adds a row below the table's last row, the caret in its first cell; Ctrl-Z removes it and puts the
  caret at the end of the last cell (`stepEnd`: every row the old layout's, rows gone at the end). Split table
  (Ctrl+Shift+Enter, `Keymap` `splitTable`): rows from the caret's row become a new table (fresh id, the same tblPr,
  equal grid values in a new array), an empty paragraph between, the caret in it; in the first row an empty paragraph
  before the table (Word's behaviour); a vertical merge crossing the split restarts in the second table. Fresh ids:
  `onTable` reserves the document's ids first (`TblEdit.emptyLike`, `nextId`); `tblcmd` checks 100 random row
  commands keep every id unique. D20: insert row in cell (500, 2) of a 1000 x 5 table about 4 ms, its undo about 2
  ms (budget 50 ms each). The Table menu (`TblMenu`, C4.4) runs them: `rowsAbove`, `rowsBelow`, `deleteRows`, `splitTable`.
* **Columns, select, distribute (D24, D26, R16, TB12, TB25, C4.2).** The same pattern (`TblEditCols` /
  `TblEditDist` pure, `TblCmdCols` one `restoreBlock` in one `d.atomic`). Insert columns: as many as the selection's
  columns, each the width of the selected column it copies; each row a new cell beside the neighbour (its tcPr without
  vMerge or gridSpan, tcW dxa the new width, an empty paragraph like its first) or, where a gridSpan crosses the
  point, that span grows; a row's gridBefore / gridAfter holding the point grows; a short row ending before it is
  left as it is. Our readings (TB rows for C7.2): the new cells next to a vertical merge are plain cells (D24 says
  "without vMerge restart"; a `continue` copy under a plain new cell would be a broken merge, so no vMerge at all); a
  table within the container's text width (from the layout: the table's column) that would exceed it is scaled back
  to its old total (TB12), otherwise a dxa tblW grows with the grid (and shrinks on delete) so the grid stays usable
  (`TblWidth`'s 1/20 rule). Delete columns: spans shrink, cells inside go with their content and their bookmark marks
  move like deleted rows' (to the next kept cell's lead, else the row's tail), rows left with no cell go, every
  column = the table goes (`removeTable`); a stray `continue` cell is written `restart` (`TblNorm.unstray`, below).
  Distribute columns: equal integer widths over the
  selected columns' total (a caret: every column, as Word does with only the insertion point in a table), every cell
  over them tcW dxa = its columns' sum. Distribute rows: trHeight atLeast = the tallest of the rows' laid-out heights
  (px x 15; a caret: every row; refused without the view's layout). Select cell / row / column / table give a
  selection (no step): a cell's content, row r0's first cell to row r1's last, a column's first to last cell, the
  table's two edges (whole); `SelShape` grows the rectangle over merged cells. Refused (beep, no step): not in a
  table, a `mixed` selection, past `MAX_COLS` 63. No keys (Word's are Alt chords, which `Keymap` gives null): the
  Table menu (`TblMenu`, C4.4) runs the ids.
* **Merge and split cells (D25, TB13, TB14, R16, C4.3).** The same pattern (`TblMerge` pure, `TblCmd` one `restoreBlock` in
  one `d.atomic`). Merge cells (a `cells` shape of more than one cell): in each row the rectangle's cells become one
  cell (the row's first cell's tcPr, gridSpan the columns' sum, tcW summed); over several rows the first row's cell is
  vMerge `restart` and the rows below `continue`, as Word writes merges. The content (D25's rule, Word's, TB13): the
  selected cells' paragraphs in flow order (row by row, left to right), the cells that are one empty paragraph skipped
  (only those: an empty paragraph among others in a cell is kept), at least one paragraph. Our readings (TB rows for
  C7.2): a vMerge continue cell inside the rectangle is hidden (never shown, the C3 fix wave's rule), so its content is
  not merged into the shown cell but stays hidden in its row's new continue cell; the leads (marks before a cell) of
  the shown cells go with their content, in order, to the front of the first row's merged cell's lead (a hidden cell's
  stays in its row), and bookmarks in paragraphs travel with them (nothing dropped); a pair the move would leave end
  before start (its start right of the rectangle, or left of it in a lower row, its end moved up) has its start put
  at the front of the merged cell's lead (`TblPairs.inOrder`, C4 fix wave A2): no pair is ever written reversed;
  a cell's own tcPr fields other than gridSpan / vMerge / tcW come from each row's first cell. Refused (beep,
  no step): one cell, a `mixed` or caret selection, a rectangle that cannot be made whole (gridBefore / gridAfter or a
  short row in it; `SelShape` already grows it over merges). Split cells (the Split cells box, `TblSplitBox`): Columns
  1..63 and Rows 1..63; a span of at least the columns is divided without changing the grid, otherwise the grid gets
  new lines at equal widths and the other rows' cells across them widen their span; rows: new rows after the cell's
  row with its neighbours vMerge-extended over them, or, for a cell merged over h rows, the merge divided into parts
  (the number of rows must divide h, as in Word's box). The content stays in the first new cell (TB14). With several
  cells selected they are merged first, then split, in one step (Word's "Merge cells before split", on by default).
  Refused with a beep and a message in the box: past 63 grid columns or `MAX_ROWS` rows, rows not dividing a merge.
  Ids: moved paragraphs keep theirs, new ones are fresh (`emptyLike` after `onTable`'s `reserveIds`); `tblmerge` runs
  60 random merges and splits keeping every id unique and every row covering the grid. The Table menu runs
  `mergeCells` and opens the box.
* **The rules every structure command keeps (C4 fix wave, `TblNorm`).** One helper each, used by `TblEdit`,
  `TblEditCols`, `TblEditDist`, `TblMerge`, `TblSplit`: `prWith(pr, patch)` sets or removes a tcPr / trPr / tblPr
  field and drops the raw element of the same name kept in `extra` (setProps' rule, `PropNames.withoutRaw`): a
  Strict file writes `w:tcW w:w="155.80pt"`, which the reader keeps raw, and insert / distribute columns used to write
  a second `w:tcW` beside it (a schema error; read back without the field). `unstray(t)`: a `continue` cell that
  `TblGrid` reads as a restart (no merged cell of the same columns above it: Word reads it so too) is written
  `restart` before any command changes rows or cells around it, so delete rows, merge, split into rows, insert rows
  or columns and split table never join it to a merge (its text hidden). `tables-cmd-fuzz` (20 seeds x 40 commands
  on 8 documents, the Strict one among them; `FUZZ_SEEDS` / `FUZZ_N` for more) checks every command for these and for
  pairs reversed, marks lost, shown paragraphs hidden and new strays. `rawW(pr)` (C5.3, the C4 review's N2): a cell
  whose `tcW` is kept raw (Strict `155.80pt`) and whose columns change (merge, split, insert or delete columns,
  a drag) gets tcW dxa of its new columns, as a dxa one does, so no stale width is left beside new columns.
* **Insert > Table and the Table menu (D27, D30, D31, R13, R16, R22, C4.4).** `TblInsert.insertTable` makes Word's "Table
  Grid" table in one undo step (placement, widths, styles: the module row above); the Table menu (`TblMenu`) and Insert >
  Table... / Tab are the UI. Decisions and readings (TB rows for C7.2): the box's Rows limit is 1000 (R16, the spec's D30)
  though the command takes up to 32767; "Column width Fixed" is the width of EACH column and writes `tblLayout fixed`;
  the Table Grid style is added WITH Normal Table (its basedOn) the first time, a document with its own Table Grid by
  name or id keeps it untouched, and a document with no style table gets direct `tblBorders` (D31); the cells copy the
  caret paragraph's whole pPr (a list item's `numPr` too, as the spec says: TB9 asks what Word copies); a table never
  ends a container and never touches another table (an empty paragraph is added after or before); Auto widths: in a cell
  the layout's text column of the cell (its real margins), so a nested table fills its cell; elsewhere the caret's
  section's column (`SectWidth`: a 2-column section's column, a landscape later section's width; C4 fix wave, the
  layout only knows the first section). Insert over a `cells` selection clears every selected cell (the selection is
  deleted first, D27) and then nests the table in the first (TB row TBC4o). The Table
  menu's Cell alignment and Table properties are C5.1's (module row `TblPatch`); Borders and shading for cells and tables is C5.2's (`TblBorderPatch`), the drags C5.3 / C5.4's (`TblDrag`); Convert comes with C6. Delete table
  (`deleteTable`) removes the innermost table the caret or cells are in (`removeTable`: the caret after it).
* **Column edges dragged (D33, C5.3: `TblEdge`, `TblDrag`).** A Select drag that starts within 3 SCREEN px of a
  vertical cell border (at any zoom) moves it: the two columns beside it change and the table's width stays (Word's
  plain drag); from the table's right edge the last column and the table's width change. While the button is held a
  dashed line shows where the border goes; it stops where a column would be narrower than 0.1 in (one narrower
  already cannot shrink, and is not widened) or wider than 22 in. Escape ends the drag with nothing changed. On
  release the widths go in as one undo step: the grid columns (what is shown, in twips) and tcW dxa of every cell over
  a changed column (pct, auto and raw ones become dxa, as Word writes them); for the right edge a dxa or pct tblW
  becomes the new total (auto is kept; a dxa or pct width the table takes from its style becomes the table's own
  dxa tblW, else the style would scale it back and the step would change nothing visible). Back at the start: no step. The press is a click first (the caret, or a cell
  zone's selection, as a click there does). TB rows TBC5l..o.
* **Row edges dragged (D19, D33, C5.4: `TblDrag.rowDragStart`, `TblEdge.dragHeight`, `TblCmdCols.rowDragCmd`).** A Select
  drag that starts within 3 SCREEN px of a row's bottom border (a vertical border or the right edge wins at a
  crossing) follows the pointer with a dashed HORIZONTAL line (`v.tblGhost {x, y, w}`; `EditPaint` draws `{x, y, h}`
  vertical and `{x, y, w}` horizontal). The row's height is its shown height plus the pointer's vertical move, not
  under 0.01 in (15 twips: a 0 would be no height, the rule lost) and not over 22 in (a drag limit). Escape and a changed document end it as for columns. On release the row's
  trHeight is `{val: height in twips, hRule}` by `rowDragCmd(d, sel, {table, row, val, rule})` (`TblEditProps.setProps`,
  one `rows` patch: the other rows are shared; one undo step; the selection stays; null for another table object, a
  row or value outside 0..`MAX_TW`, a rule that is not atLeast / exact, or no change): `exact` when the row is laid out
  exact (its own trHeight or its table style's), else `atLeast` (auto becomes atLeast, as Word). A row whose content is
  taller than the dragged height keeps showing the content (atLeast); an exact one clips. Back at the start: no step.
  A row of a vertically merged cell is dragged like any other (the merged cell's need is met by its last row), but
  not at a point inside the merged cell, where no line is drawn (`TblEdge` rowEdge, as a column line inside a
  spanning cell).
* **The ruler in a cell (D32, C5.4).** With the caret in a cell the ruler's origin and text range are that cell's
  text area (`RulerInd.scaleOf` / `textTwips` with the paragraph's position: `L.locate(pos).item`'s x and w, the cell
  box less its margins), so the indent markers, the tab stops and their drags are relative to the cell
  (`indentDrag` gets the cell's `textW`); there are no column markers (`Ui/Ruler` is unchanged). This needed no code
  after C2.1; C5.4 added the tests (`rulermath.test.mjs`: origin, text range, zoom, indents and `indentDrag` in a cell; `word-tables-format.mjs`: markers over the cell by real mouse).
* **Formatting, lists, links, pictures, bookmarks and Find in cells (D7, D10, C3.5).** Every formatting command acts on
  `SelShape.paraRanges` through `FormatOps.touched`: a `cells` rectangle formats exactly its cells' paragraphs (nested
  tables' too; the other cells' paragraph objects are the very same), a `mixed` range its text and the touched rows
  whole, a selection inside one cell only its text; so bold, size, fonts, alignment, spacing, indents, borders and
  shading, styles, change case, the format painter (its pick works in a cell too), Bullets / Numbering / Restart /
  Continue, the Tabs box and the ruler. Lists continue in flow order through cells, as Word numbers them
  (`ListRestart.listBefore`: Numbering on the paragraph after a table whose cells hold items 2 and 3 continues as 4;
  AutoList's "3. " after cells holding 1 and 2 continues their list; AutoList works in a cell, Tab still moving cells).
  Find / Replace / Replace all go through the paragraphs in flow order (cells row by row, cell by cell), wrap, and
  select the match in the cell (painted there as any text selection); matches are `{at, from, to}`. Bookmarks in cells
  are at their real places (added, found, gone to, deleted when they are inlines of their own); a mark between rows or
  cells is at a paragraph's edge (a row's or cell's lead: the start of its first paragraph; a row's or the table's
  tail: the end of the last cell's last paragraph) and cannot be moved or deleted. Links and pictures are inserted and
  edited in cells (paths), and found under the pointer there (`DocHit.leafAt`: a Ctrl-click on a link in a cell
  follows it; a picture in a cell is selected with its handles at the cell's x and resized). Word count counts a
  selection's blocks at every depth (`SelShape.covered`: a `cells` rectangle its cells). Insert > Page break and
  Section break are shaded with an end of the selection in a cell (`InsertApply.breakable`; their keys beep, C3.4).
  An inserted picture (Insert > Picture..., a drop, a pasted image: `PicLoad`) is sized to the cell's text width since
  the C3 fix wave (`InsertPicture.insert` with the window's layout: the cell's column, the innermost cell's), so the
  file holds the size it is drawn at; resizing it by its handles and its alt text work in a cell as anywhere (checked
  by `word-tables-edit` and `cellformat`). Costs on 50,000 paragraphs (median of 21): `touched` of the whole document 1.4 -> 3.7 ms,
  `Format.query` at a caret 0.3 -> 0.5 ms, a selection's word count 4.2 -> 6.1 ms, Find through the whole document
  without a match 2.8 -> 3.0 ms.

* **User guide (C2.6):** part 10 of `$.Docs.Letters`, "Tables" (what is shown, what is kept but not shown, the grey box that
  remains for tables the reader cannot model, selecting and deleting, "editing arrives in the next steps", and what is
  still to be checked in real Word: TB3, TB4, TB7). Parts 2, 7, 13 (What is kept), 17 (What is coming) and 19 (Things
  to know), `tools/docs/Contents`, `!Help` and the README no longer call tables a grey box except for the Opaque ones.
  C3..C7 extend part 10 as editing arrives; nothing in it describes editing. C2 fix wave: part 10's widths (the
  window scrolls to a table's right edge; beyond the page it is on the grey desk) and cell text (its list numbers
  and pictures: `word-tables` checks both by pixels); part 9 no longer says pictures in tables are not shown (they
  are, but cannot be selected yet), and a table holding a picture comes whole within one document (as text in
  another); part 3's word count: a table's lines are not counted yet (`WordCount` counts top-level lines only; since
  the C3 fix wave they are, and the guide says so).

* **User guide (C3.6):** part 10 of `$.Docs.Letters` now has "Working in a table's cells" (caret, arrows, Tab, Shift-Tab,
  Ctrl-Tab, Enter), "Selecting cells" (drag, Shift-click and arrows, the cell, row and column zones), "Typing and
  deleting in cells" (clearing, removing rows, TB10's edges, bookmarks, Ctrl-Enter refused) and "Formatting, lists,
  links and the rest in cells"; parts 2, 3, 4, 8, 9, 17 and 19, `tools/docs/Contents`, `!Help` and the README no longer say
  the caret cannot enter a table, text in tables is not searched, or pictures in cells cannot be selected. The "still
  to be checked in real Word" paragraph lists what is unverified: marks of deleted rows, a mixed range's paragraph
  formatting, where marks between rows and cells are shown, a picture's size in a cell, Ctrl-Tab. Not yet claimed in
  the guide: resizing a picture in a cell, copying cells (C6).
* **User guide (C5.5):** part 10 of `$.Docs.Letters` gained "Table properties" (the box's nine fields, the 0.02..22 in
  limits, never rounded, what an empty field means, Cell alignment), "Lines and shading of cells and tables" (Apply to
  Cell / Table, the neighbouring cells, Fill None, the raw refusals), "Dragging the edges of columns and rows" and "The
  ruler in a table", and a C5 "still to be checked in real Word" paragraph (TBC5a..o); part 6's Borders and shading
  points at it; parts 1, 17 and 18's lists, `Contents`, `!Help` and the README no longer say table width, lines and
  shading cannot be changed (not yet: Convert, copying cells: C6). No part moved.
* **User guide (C6.5):** part 10 of `$.Docs.Letters` gained "Copying and pasting tables" (what a cell rectangle, rows,
  a whole table and a mixed range copy; where a table goes: in text, in a cell nested to depth 8 then as text, over
  cells overwriting them; table styles copied across documents), "Tables and other programs" (HTML and tab text out;
  HTML tables in, the 63 / 1000 / 8 / 63,000 limits, flattened beyond), "Converting text to a table and back" (both
  boxes, the separator rules, what is refused) and a "still to be checked in real Word" paragraph (TBC6a..k); the
  Table menu listing gained Convert >. Part 4 (copying within and across documents, what other programs get and
  take, "Not possible yet"), part 9 (a table with a picture comes whole across documents), parts 17 and 19, the
  guide's opening paragraph, `Contents`, `!Help` and the README no longer say tables come as text or cells cannot be
  copied. Part numbers did not change.
* **User guide (C5 fix wave):** part 10's "Table properties" says a percentage width opens with Table width empty and
  the field greyed (Auto or Length first; the "Choose Auto or Length..." refusal) and that lengths are compared as
  shown; "Lines and shading of cells and tables" gives the new neighbour rule (a line put on: the selected cells only;
  taken off: also the cells along the edge, not a wider one, none with cell spacing; a line only the neighbour draws
  shows off; Table keeps the cells' own lines) and the message line; "Dragging the edges" the 0.01 in least row
  height, no row drag inside a merged cell, a style's width made the table's own, the nearer of nested and outer
  lines, the right-edge line for centred tables, a window closed mid-drag; the real-Word paragraph TBC5h, q, r. The
  README's Formatting tables paragraph and `!Help` follow.
* **User guide (C3 fix wave):** part 3 (a bookmark mark in a paragraph Backspace or Delete removes beside a table is
  kept; the word count's lines include table cells), part 10 (the arrows never stop in a vertical merge's hidden
  lower parts; a table whose cell ends with another table stays a grey box; a cell always ends with a paragraph;
  a picture put in a cell is made no wider than the cell, resized and given alt text there as anywhere; still to be
  checked: whether Word sizes it to exactly the cell's text width) and part 13; `!Help` and the README feature text
  the same (the "a picture put in a cell is sized to the column" limit is gone).
* **User guide (C7.3):** part 10 of `$.Docs.Letters` gained "Keys in tables, at a glance", "Limits", "What is kept,
  untouched, in a table" and "Not possible yet"; part 17 (What is coming) lists the table items; the `!Help` and the
  README carry the limits and the list of what is not possible yet. Every "part N" pointer was checked.
* **Ctrl-Tab in a real browser (C3.3, R21).** Chrome, Firefox and Safari keep Ctrl-Tab for their own tabs, so the key
  that types a tab in a cell (`Keymap` `cellTab`) may never reach the page (the browser suite cannot see this). The
  guide says so. The Table menu step (C4) is to give the same action a menu route.

### Hostile input and speed (C7.1)

* **The suite.** `tests/moreapps/word-tables-hostile.mjs` (browser; `SECTIONS=hostile,big,budgets,ops,convert,random,close`
  runs only some; about 80 s): D14f's set opened in the window (10,000 rows, 63 and 64 columns, `gridSpan` 0 / 64 / -1 /
  1e9 / x, an empty and a 0-width grid, a `vMerge` continue first, depth 9, ragged rows, a row of only marks,
  `__proto__` names), each typed or Opaque as expected with no message, laid out, drawn, edited and undone to the opened
  model. Refused with a message, in under 10 s, the window still usable: a file of 1,008,000 cells and one of
  1,000,001 paragraphs in cells (both stopped by the window's 200,000-paragraph cap, which the window words as "it has
  more than 200,000 paragraphs, the most !Letters opens": `DocxError` kind `paragraphs`, C7 fix A4), and 200 nested tables (the XML parser's depth
  cap: "not well-formed"). Then 1000 x 5, 1000 x 63, a merged staircase, a table with every column merged top to
  bottom, depth 8 and 100 tables opened and scrolled end to end; keystrokes, a drag across cells and the first arrow
  press across 4995 hidden cells measured against the same operation in a table-free document of the same run (ratios
  and margins, never a bare threshold); select all + Delete and undo; 1000 Tab presses at the last cell (the caret put
  at the last cell before each: the Tab key in a 5-column table adds a row only every fifth press) and undo of all 1000
  steps (about 10 s); Table to text and Text to table over 5000 and 63,000 cells; hostile HTML tables pasted; column
  borders dragged; 500 seeded random actions (the page's own choices come from a seeded generator, so a run repeats);
  windows closed mid-drag, with each box and a menu open, and 20 open / close cycles.
* **Measured (this machine, key handler + layout + paint, median of 25 presses, milliseconds):**

  | key | 1000 x 5 cell | table-free, 5000 paragraphs | 1000 x 63 cell | table-free, 63,000 paragraphs |
  |---|---|---|---|---|
  | type | 0.4 | 0.2 | 2.2 | 0.2 |
  | Backspace | 0.5 | 0.3 | 2.3 | 0.8 |
  | Tab / ArrowRight | 0.5 | 0.5 | 2.2 | 0.4 |
  | Shift+ArrowRight | 0.5 | 0.3 | 2.1 | 0.3 |
  | Ctrl-B on a paragraph | 0.8 | 0.4 | 2.5 | 3 |

  The first ArrowRight after an edit across 4995 hidden cells of a 1000 x 5 table with every column merged top to
  bottom: 1.3 ms (107-175 ms before `SelVert` marked hidden columns once per layout; 3.2 s at 1000 x 63). Opening: 1000 x
  5 about 0.1 s, 1000 x 63 about 1.1 s, the merged staircase 1.2 s. Table to text / Text to table: 1000 x 5 85 / 133 ms,
  1000 x 63 209 / 1088 ms (63,000 cells). A 30 px column drag releases in 8 ms (1000 x 5) and 0.4 s (1000 x 63).
* **The 50,000-paragraph document (the +5 ms budget, D20).** `tests/moreapps/relayout-perf.test.mjs` times the relayout
  after one edit (the keystroke's work, median of 25) and fails only on a gross regression (above 25 ms) or on
  non-linear growth. The comparison with the main branch before Batch C was made by hand in the same session, six
  interleaved runs each: main (Batch B) 9.3-10.1 ms, this branch 12.2-14.4 ms, so +2.9 to +4.4 ms (the C2.1 report
  said +0.8 then; the cost is the per-item fields `x`, `w`, `col`, `ci`, the `L.flow` array and the garbage they make:
  in a CPU profile `itemOf` is 1231 ms against `buildItems` 919 ms over 150 relayouts, the collector 302 against 109).
  It was inside the +5 ms budget with about 1 ms to spare. **C7 fix A3** (target: within +2 ms of main): a table-free
  layout no longer pays for tables: `L.flow` is made only at the first table (before, a second 50,000-entry array was
  built and dropped), a paragraph's item is built by `DocItems.paraItem` (no table checks, `ci` in the literal instead
  of a later write), `ry` is set only on items in cells (it added a property to every item), and `invalidate()` skips
  the `byId` pass. Measured again, six interleaved runs each: relayout main 9.2-9.8 ms, this branch 9.7-10.5 ms (-0.1
  to +1.2 ms); a whole keystroke (`Typing.type`, the relayout and `Selection.clamp`, median of 40) main 12.8-13.5 ms,
  this branch 11.6-12.3 ms. What remains of the difference is the four column fields every item still carries (`x`,
  `w`, `col`, `ci`; the C2 design: items are placed by their column): an experiment without `x`, `w`, `ci` gave
  about 0.5 ms more, but every reader (`DocPaint`, `DocRects`, `DocHit`, the decorators, about 20 modules) would need a
  fallback to the page, a design change not worth it inside the budget. The browser suites' 50,000-paragraph budgets
  (`word-typing-hostile.mjs`, `word-format-hostile.mjs`) pass unchanged.
* **Found by the suite.** A table whose layout measures text while the window is being made (a grid of zero widths,
  any autofit table whose cells need more than the grid gives) failed to open with "Cannot set properties of null
  (setting 'font')": `DocWindow.metrics()` measured on the window's canvas before it existed. It now measures on a
  scratch canvas until then (`AppWin`, tested in `word-tables.mjs`).
* **Whole corpus.** `WORD_EDIT_CORPUS=1 NODE_OPTIONS=--max-old-space-size=4096 node --test tests/moreapps/tables-roundtrip.test.mjs`:
  139 corpus files hold a table; 138 read (the one refused is the file `corpus-expected.json` lists), 0 failures, in
  77 s: 30 random document ops and, in a second run, 30 random table commands (every `TABLE` id, Split cells, Table
  properties and Borders patches, Insert table, text <-> table; hostile arguments count as refusals) per file, each
  written, read back equal, linted, xmllint-checked and undone to the opened bytes; the second generation of every file
  is byte-stable. The Opaque-reason histogram stays pinned by `tables-corpus.test.mjs` (`corpus-expected.json`
  `opaqueTables`).

### The rules R1..R24 as finally implemented

The plan's rulings, reconciled with the code and the ledger at the end of Batch C (the sections above say how each
works; this is the one list). "Retired" means a stop-gap that a later task removed.

| rule | as implemented |
|---|---|
| R1 | `corpus-expected.json` holds `opaqueTables`, an OBJECT reason -> count; `corpus.test.mjs` and `roundtrip-lib.mjs` skip non-string entries; `tables-corpus.test.mjs` asserts the histogram EQUALS it (every reason of R3, 0 where the corpus has none; `tail` is 0). Any change is a reviewed change of the pin. |
| R2 | Structural values fail closed: `gridCol w:w` an integer 0..31680 spelled as the writer writes it, 1..63 grid columns, `gridSpan` 1..63, `vMerge` absent / restart / continue / bare, `gridBefore` / `gridAfter` 0..63, a row's `gridBefore` + spans + `gridAfter` <= 63 (reason `span`), no `hMerge`. Display fields not understood go to `extra`. |
| R3 | The Opaque reasons, one per table, first found in this order: `tracked`, `wrapped`, `hMerge`, `grid`, `span`, `sectPr`, `propAttrs`, `order`, `stray`, `empty`, `ns`, `tail`; and `depth` for a table nested 9 deep (an Opaque CELL BLOCK of the depth-8 table). `stray`, `ns` and `tail` were added by the C1 and C3 fix waves. |
| R4 | `TblRead.MARKS` (bookmarks, comment and permission ranges, `proofErr`, move ranges) may sit between rows and cells (a row's or cell's `lead`, a `tail`); directly in a `w:tc` they are an Opaque cell block. |
| R5 | `EditPos.findBlock` gives `{at, k, rank, b, s, i?, depth, cell?, endRank?}`: `k` is the top-level index (EditRange's arithmetic), `rank` D9's flow rank. `atRank` is new. The Find match shape became `{at, from, to}` in C3.5. |
| R6 | The table-style layer is a derived style table (`TblCond.stylesFor`, memoised per styles and layer, `L.cacheFor`); `Styles`, `Fmt`, `LineLayout`, `BorderResolve`, `TabStops` are unchanged. `overrideTableStyleFontSizeAndJustification` on: the table style wins over Normal's size and `jc`; off: Normal wins (TB5). |
| R7 | `TblStyle` reads `style.pPr`, `style.rPr` and the `tblPr`, `trPr`, `tcPr`, `tblStylePr` of `style.extra`, never `style.raw`. |
| R8 | No import cycles: `ModelCheck.checkBlock` stays the one entry point and dispatches `'tbl'` to `TblCheck`, which imports nothing; `ClipCleanTbl` and `TblWrite` follow the pattern. `paths-gate.test.mjs` and `disc-moreapps --check` hold it. |
| R9 | Depth: a top-level table 1, at most 8 (`TblCheck.MAX_DEPTH`); a path is `2 + 3k` long, k <= 8. |
| R10 | Superseded in C6: an Opaque table across documents is still skipped, as before; a typed table is a real table (`ClipCleanTbl`, `ClipPasteTbl`), a content control or other kept block in a cell is left out across documents. The C1 flattening (`Walk.flatText`) is only the plain-text form and the paste at depth > 8. |
| R11 | Retired (C3.1, C3.5): positions inside typed tables are real cell positions; the gate's exit lists are empty (asserted). |
| R12 | `Info.facts` counts `tables` at every depth and `paragraphs` at every depth; `summary` `'7 paragraphs, 2 tables, 5 preserved items (...)'`; the box shows `7 (2 tables)`. |
| R13 | Dialog widths by `minW`: Insert table 540, Table properties 648, Split cells 468, Text to table / Table to text (one box) 540. Heights are the dialog's own layout. |
| R14 | `Path` is the one module for paths (`sib`, `tableOf`, `cellOf`, `isTop`, `samePath`, `cmpPath`, `depthOf`, `topOf`). |
| R15 | `paths-gate.test.mjs` greps `!Letters` for position arrays built from indexes; its allow-list shrank to nothing for the tables' exit lists (C3.4 and C3.5 empty). |
| R16 | Caps, defined once in `TblCheck`: `MAX_COLS` 63, `MAX_DEPTH` 8, `MAX_TW` 31680, `MAX_ROWS` 32767 for COMMANDS (files with more still read); the Insert table box takes rows 1..1000. Pasted HTML tables: 63 columns, 1000 rows, depth 8, 63,000 cells, else text. |
| R17 | One `TblEdit.emptyLike(p)` makes every empty cell paragraph (fresh id, `pPr` with its paragraph-mark `rPr` extras, `pStyle`, `extraP: []`); new rows and cells get `attrs: []`, `lead: []`, `tail: []`, `tblPrEx: null`. What Word copies into new cells is TB9. |
| R18 | Undo of a table restore puts the caret in the first paragraph of the first changed row (cell 0); one undo step per command; a structural `restoreBlock`'s inverse gives back the very old table object, a text op inside a cell a deep-equal new one. |
| R19 | Done in C2.6: part 10 `Tables`, old parts 10..18 are 11..19, `Contents` says `Word, part 18`; every "part N" pointer follows (checked in C7.3). |
| R20 | The hand-off has 23 `tb-*.docx` files (the spec's, `tb-13-*` from the corpus when it is there, and the extras for TB19, TB23, TB26 inside tb-4, tb-14 and tb-11) and `tb-README.txt`; TB10, TB11, TB17, TB22, TBC4k, TBC5g, TBC5n, TBC5p and TBC6f have no file (9 in all). C7.3 added the PRIORITY list. |
| R21 | `Keymap` rows `splitTable` Ctrl+Shift+Enter and `cellTab` Ctrl+Tab. `cellTab` acts only when the caret is in a cell. Browsers keep Ctrl-Tab, so the Table and Insert menus have a `Tab` item (C4.4); recorded in `docs/CHANGES_NEEDED.md`. |
| R22 | Strict: `start` / `end` in `tblBorders`, `tcBorders`, `tblCellMar`, `tcMar` (the other spelling stays raw), `tblLook` without `w:val`, one `tcW` / `trHeight` per cell (`TblNorm.prWith`, the C4 fix wave); a Transitional table pasted into a Strict document keeps some Transitional spellings (see "Clipboard and conversion" under the known limitations). |
| R23 | Retired (C1.7): typed tables are the default, the `tables` option is gone. |
| R24 | Display caps: a table at most 4000 px wide (wider ones scroll, D18), a column at least 1 px, a `trHeight` at most 2112 px (the row still grows for its text), margins and `tblCellSpacing` 0..31680, `tblInd` +-31680, band sizes 1..1000 else 1; `hRule="auto"` and a height of 0 or less are ignored (TB24c). |

Rulings of the final fix wave (after the whole-branch review):

* **Table to text keeps the file's order (final-1 M2).** With a separator a cell's paragraphs stay together and in
  order (`TblToText`), so text and bookmark marks never reorder; TB16 and TBC6k still ask what Word does.
* **A reversed pair is put right by moving its END (final-1 I2).** `TblPairs.endsAfter`: the bookmark becomes empty
  at its start, never longer (`inOrder`, for merges, moves the start instead, as before).
* **Grids are held weakly (final-2 I3).** Fixed, not parked: the change was small (`TblGrid`). The undo history still
  keeps each old table version itself (rows shared where unchanged), as it must to undo; a command that copies every
  paragraph (select all + bold on 63,000 cells) costs its copies per step, as in a table-free document.
* **The final-2 minors M1-M7 and M9-M12 are known limits** (the guide's part 10 says them where users meet them; the
  list is under "Known limitations of tables, consolidated"); M8 (the Tab item) was fixed.

### Performance (D20), measured

All on one development machine; medians as the tests state; the budgets are asserted by the named test.

| budget (D20) | measured | test |
|---|---|---|
| a keystroke in a cell of a 1000 x 5 table within +5 ms of one in a paragraph | 0.4 ms in the cell against 0.2 ms in a table-free 5000-paragraph document (C7.1 table above); 1.8 ms against 1.0 ms plain, with five such tables in the document 2.4-3.9 ms (C3.4) | `word-tables-edit.mjs`, `word-tables-hostile.mjs`, `tblreuse.test.mjs` |
| opening the 1000-row document under 1.5 s | 1000 x 5 about 0.1 s; 1000 x 63 about 1.1 s; the merged staircase 1.2 s | `word-tables-hostile.mjs` |
| the corpus tables laid out, none taller than its content | 140 files, 501 typed tables, 5246 rows, no error, slowest file 333-505 ms | `tables-layout-corpus.test.mjs` |
| insert row in the 1000-row table, and its undo, under 50 ms | 3.8-6.2 ms and 2.3-2.8 ms | `tbledit-rows.test.mjs` |
| painting a screen draws only the visible rows | scrolled to row 500 the painted rows were 500..530 | `word-tables.mjs` |
| the 50,000-paragraph document unchanged within +5 ms | relayout 9.7-10.5 ms against 9.2-9.8 ms on the branch before Batch C; a whole keystroke 11.6-12.3 ms against 12.8-13.5 ms | `relayout-perf.test.mjs`, `word-typing-hostile.mjs` |

### Batch C modules: lines and kind

| module | lines | desktop-bound |
|---|---|---|
| `ClipCarry` | 56 |  |
| `ClipCleanTbl` | 154 |  |
| `ClipCut` | 56 |  |
| `ClipHtmlTable` | 124 |  |
| `ClipPasteTbl` | 150 |  |
| `ClipReadTable` | 219 |  |
| `ClipRoute` | 88 | yes |
| `ClipTblLook` | 118 |  |
| `ClipWalk` | 155 |  |
| `DocHit` | 158 |  |
| `EditRank` | 62 |  |
| `FindSel` | 105 | yes |
| `ItemPaint` | 135 |  |
| `OpsPath` | 83 |  |
| `Path` | 78 |  |
| `RangeOps` | 108 |  |
| `RangeTbl` | 230 |  |
| `SectWidth` | 24 |  |
| `SelCells` | 124 |  |
| `SelShape` | 224 |  |
| `SelTable` | 228 |  |
| `SelVert` | 98 |  |
| `TablePaint` | 238 |  |
| `TblBorderAt` | 138 |  |
| `TblBorderPatch` | 245 |  |
| `TblBorders` | 240 |  |
| `TblBox` | 192 | yes |
| `TblCheck` | 169 |  |
| `TblCmd` | 250 |  |
| `TblCmdCols` | 242 |  |
| `TblColor` | 132 |  |
| `TblCond` | 223 |  |
| `TblConflict` | 62 |  |
| `TblConvert` | 196 |  |
| `TblConvertBox` | 183 | yes |
| `TblConvertCmd` | 195 |  |
| `TblDrag` | 166 | yes |
| `TblEdge` | 178 |  |
| `TblEdit` | 250 |  |
| `TblEditCols` | 238 |  |
| `TblEditDist` | 132 |  |
| `TblEditProps` | 246 |  |
| `TblGrid` | 177 |  |
| `TblInsert` | 208 |  |
| `TblInsertBox` | 146 | yes |
| `TblItems` | 230 |  |
| `TblLayout` | 151 |  |
| `TblMenu` | 167 | yes |
| `TblMerge` | 121 |  |
| `TblNames` | 26 |  |
| `TblNorm` | 64 |  |
| `TblPairs` | 192 |  |
| `TblPatch` | 224 |  |
| `TblPos` | 100 |  |
| `TblProps` | 164 |  |
| `TblRead` | 88 |  |
| `TblRemove` | 39 |  |
| `TblReuse` | 169 |  |
| `TblScan` | 214 |  |
| `TblScanGrid` | 60 |  |
| `TblSplit` | 164 |  |
| `TblSplitBox` | 103 | yes |
| `TblStyle` | 211 |  |
| `TblStyleCopy` | 213 |  |
| `TblToText` | 203 |  |
| `TblWidth` | 248 |  |
| `TblWrite` | 70 |  |
| `TblWriteProps` | 183 |  |
| `Walk` | 216 |  |
| `WalkCursor` | 62 |  |
| `WordTally` | 83 |  |

71 modules added since Batch B (including the C0 splits and the final fix wave's `TblRemove`), 8 desktop-bound (they import `'riscos'`): `ClipRoute`, `FindSel`, `TblBox`, `TblConvertBox`, `TblDrag`, `TblInsertBox`, `TblMenu`, `TblSplitBox`. Every module is within the 250-line limit (largest: `TblEdit` 250, `TblCmd` 250, `TblWidth` 248, `TblEditProps` 246, `TblBorderPatch` 245: the next change to any of them means a split first).

### Known limitations of tables, consolidated

Each is described where it arose (the section named); this is the list to read first.

* **Not built (the guide's "Not possible yet"):** pages (a row is never split, header rows do not repeat), text flowing
  round a floating table (it is drawn in the text with a dashed outline), tracked changes to a table (the table stays
  Opaque; !Letters has no Track changes switch), editing or making a table style, AutoFit commands, sorting, formulas,
  `textDirection` and `bidiVisual` (kept, drawn left to right), content controls round rows or cells (Opaque, reason
  `wrapped`).
* **Opaque on purpose:** the reasons of R3; tracked changes INSIDE cell paragraphs type, as in the body (owner to
  confirm); a cell ending with a table stays Opaque (`tail`).
* **Hidden text of a vertical merge:** Find, Replace and Go to reach it (TBX1); the hidden cells are skipped by the
  arrows and clicks.
* **Bookmarks:** the rules above ("Bookmarks and table deletions", "Table structure commands"); a bookmark END in a
  merged cell's lead is emptied by a merge (N1); a cut and paste inside one document drops bookmarks and comment
  ranges; Insert > Bookmark... with a cell rectangle marks from its first cell to its last in reading order, cells
  outside the rectangle between them included (Word would use `colFirst` / `colLast`: final-2 M9).
* **On screen (final-2 minors, parked):** fills are rounded to layout pixels, so 1 px light seams show between shaded
  cells at 50, 75, 90, 110, 125, 150 and 175% (`TablePaint` `fill`, M1); 0.5 pt single borders are anti-aliased to
  grey below 100% (`BorderPaint`, shared with paragraph borders, M2); the caret and the selection rects are not
  clipped to an exact-height (clipped) cell (`DocHit`, `DocRects`, M3); `SelTable`'s `CELL_EDGE` (4) and `ROW_ZONE`
  (24) are layout pixels, so the zones scale with the zoom while `TblEdge`'s drag zone is 3 screen px (M4); a press
  just right of a border selects the cell's content, which stays after the drag (documented, M5); undo of a column
  command puts the caret in row 0 (R18) and undo of a merge restores a caret, not the rectangle (by design, M6); a
  nested table wider than its cell has no drag zones outside the outer cell (C5 M1, M7).
* **Keys and boxes (final-2 minors, parked):** Convert's Other separator cannot be a space (WimpLib `readField` reads
  whitespace-only text as empty; Word allows one, M10); on a Mac Split table is Ctrl+Shift+Enter and Cmd+Shift+Enter
  makes a line break (the "Ctrl on a Mac too" rule, M11).
* **Clipboard and conversion:** the 100,000-block / 5,000,000-unit store bound, the HTML limits (R16), Strict
  spellings of a pasted Transitional table, content controls left out across documents, Table to text converts the
  whole innermost table (TBC6h).
* **Drags:** a pointer-cancel puts a drag's change in (the core's `wimp.drag` has no cancel event: `docs/CHANGES_NEEDED.md`);
  the dashed line of a centred table's right edge is approximate (TBX3).
* **Keys:** Ctrl-Tab is reserved by Chrome, Firefox and Safari: the Tab menu item is the route (`docs/CHANGES_NEEDED.md`).
* **Widths:** colour of themed table styles is the literal colour (TB4b); the autofit width of a table is estimated
  (TB7); `wBefore` / `wAfter` are kept as they are when `gridBefore` / `gridAfter` change.
* **Pre-existing, owner to decide:** a literal tab inside one `w:t` is not counted by the word count ("Known items from
  C1"); row-level content controls (13 rows, 16 cells in the corpus's 12 `wrapped` tables) keep their tables Opaque.
* **Unverified in real Word:** everything under "To check in real Word (tables, consolidated)"; the PRIORITY list in
  `tb-README.txt` is the order to take them in.

### Known items from C1

* **Literal tab in a word count (pre-existing, not changed).** A literal tab inside one `w:t` (`tab\there`, not
  `<w:tab/>`) is read as a raw level-`r` inline; `WordCount.para` counts it as nothing, so `tab` + `here` is one word
  and the tab is not a character, while the XML walk of an Opaque block counts a tab. The fix is one line (walk raw
  level-`r` inlines with `xml()`) but changes top-level counts; left for the owner to decide.
* The guide's numbering was changed in C2.6 (R19): part 10 Tables, parts 10..18 became 11..19 (see "Final guide parts").

## The data model

Header of `!Letters/Model` is the reference. In short:

```
Doc     {sections, styles, numbering, parts, rels, meta, rawSettings}
Section {props: {pgSz?, pgMar?, cols?, titlePg?, type?, extra}, blocks, raw}
Para    {type:'p', id, text, runs, inlines, pPr, pStyle?, extraP}
Run     {start, end, rPr, rStyle?}
Inline  {kind:'raw'|'br'|'tab', level:'p'|'r', node?, text?, brType?}
Opaque  {type:'opaque', node}
Table   {type:'tbl', id, tblPr, grid, rows, attrs, tail, gridAttrs}
Row     {trPr, cells, attrs, lead, tail, tblPrEx}
Cell    {tcPr, blocks, attrs, lead}
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
* **Tables (Batch C):** a typed table is a `Table` block: `grid` the `w:gridCol` widths in twips, in order;
  `attrs` / `gridAttrs` the attributes of `w:tbl` / `w:tblGrid` as `[name, value]` pairs, in order; `tail` the unseen
  marks (bookmarks, comment and permission ranges...) after the last row; a `Row`'s `lead` the marks before its
  `w:tr` and `tail` those after its last cell, `tblPrEx` its `w:tblPrEx` kept raw (or null); a `Cell`'s `lead` the
  marks before its `w:tc` and `blocks` its Paras, nested Tables and Opaque blocks (at least one). `tblPr`, `trPr`,
  `tcPr` are property objects with `extra`; merges stay as written (`tcPr.gridSpan`, `tcPr.vMerge` `restart` /
  `continue`). Table, row and cell objects are immutable like every model object. Rows and cells have no id: a block
  in a cell is addressed by its path (`Path`: `[s, i, r, c, j, ...]`), and scanners walk the model through `Walk`
  (C1.6: `WordCount`, `ListNumbers`, `ListUsed`, `PicIds`, `BookmarkFind` (and so `Bookmarks`, `BookmarkKeep`),
  `Info`, `DocItems`; XML is read only inside an Opaque block or an inline, D7). A typed table gives the same word
  count, numIds, picture ids and bookmarks as the same table read Opaque (`walk-scanners.test.mjs`); lists number
  through its cells (Word); Info counts it as a table, not a preserved item (R12). The rules are `TblCheck`'s (nesting at most 8 deep, at most 63 grid columns...). Since C1.7
  the reader types tables by default (the `tables` switch of R23 is gone): `TblRead` types every table it understands
  completely and keeps the others Opaque, byte for byte, for one reason each (R3; a table nested 9 deep is an Opaque
  block of its cell, reason `depth`). `TblWrite` writes a typed table back equal to the file but for the documented
  normalisations (D14b): in a cell paragraph those of every body paragraph (run rsids dropped, runs of equal format
  merged, empty `pPr` / `rPr` left out, `xml:space` as the writer puts it); property children in schema order; an
  empty `w:trPr` / `w:tcPr` left out; white space between elements dropped (also inside read fields);
  `<w:vMerge w:val="continue"/>` as `<w:vMerge/>`; prefixes as `w:` (the full list: "Tables (Batch C): the rules",
  Writer). `tables-corpus.test.mjs` checks this per
  corpus table (`tbl-canon.mjs` `canonTbl`) and pins the Opaque reasons (`corpus-expected.json` `opaqueTables`).
* **Ids:** paragraph and table ids come from one counter for the whole program (`nextId`), unique within a Doc;
  `reserveIds(doc)` moves the counter past a Doc's ids at every depth (the `Document` constructor does it). A reader
  must create paragraphs through `newPara` and give tables ids from `nextId`.
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
paths (`Path`): `[sectionIndex, blockIndex]` at top level, `[s, i, r, c, j, ...]` for block `j` of cell `c` of row `r`
of the table at `[s, i]` (and so on into nested tables, at most 8). Every op below takes a nested path for
`block` / `at` with the same meaning inside the cell's blocks; offsets are UTF-16. An op that is refused throws
`RangeError` and changes nothing (no table copied). **Nested paths (Batch C1.4):**

- an op in a cell copies the tables on its path first (`OpsPath.own`, D5): a table, row or cell object is never
  changed; rows and cells off the path stay shared; the inverse uses the same path;
- `mergeBlock` joins blocks of one container only (never across cells); `removeBlock(s)` refuse to empty a cell
  (`a cell needs at least one block`); a cell paragraph may not hold a `sectPr` (`TblCheck.checkCellPara`, through
  `ModelCheck.checkBlock(b, around)`, `around` the number of tables around the position);
- `insertBlock(s)` of a table: every id inside unique (among the new blocks and in the document) and its nesting
  (path depth + its own) at most 8; `restoreBlock` of a table with the same id: `checkBlock`, then only its new ids
  against the document (one scan, none without new ids); structural table commands are one such restoreBlock;
- `splitSection`, `mergeSection`, `setSection` refuse nested paths;
- `EditApply.stepEnd` finds blocks with `Walk.at` and neighbours with `Path.sib`.

**Edit-layer locations (Batch C1.5, D6).** `EditPos.findBlock` gives a location with its path `at` (above, in the
`EditPos` row), and every editing command builds its op's `block` / `at` from `loc.at` or `EditPos.sibOf(loc, d)`,
never from `s` and `i`: `Edit`, `EditDel`, `EditPara`, `EditRange` (`paraBy`, `mergeAt`), `ClipPaste`,
`InsertApply`, `PicOps` (`stepSel` by `Walk.at`), `LinkOps` / `LinkFind.linkAt`, `Bookmarks` (edit records `{at,
off}`, sorted by `Path.cmpPath`), `BookmarkKeep.putMarks`, `BookmarkFind` (marks `{at, off}`), `AutoList`, `ChangeCase`,
`FormatOps` (`touched` entries `{at, p, a, e, para}`), `FormatPaint`, `ListMake`, `ListRestart`, `SectBreak`. So
typing, Enter, Backspace / Delete, paste and the Insert commands at a caret in a cell's paragraph act in that cell
(Backspace at a cell's first paragraph start and Delete at its last's end do nothing: no neighbour across a cell).
The migration fails closed: a location without a path gives no path (`locate`, or `pathOf`, refuses with
`RangeError('bad position')`, the Doc unchanged), and the sites that stay top level refuse a nested end or see none
(`EditPos.topOnly` / `isNested`): since C6.1 no longer `ClipSlice.slice` (it follows `SelShape`); `BookmarkKeep`'s
top-level range walk (`RangeTbl` handles ranges in tables), `InsertApply.pageBreak` / `breakable` and
`SectBreak.insertSection` (null: `EditRun` beeps through `v.refused`; the Insert menu shades both breaks), `SectBreak`'s
Delete / Backspace at a break (not a section edge). `Find`'s matches are `{at, from, to}` since C3.5. The gate
`tests/moreapps/paths-gate.test.mjs` (R15) greps every `!Letters` source (comment lines left out) for positions built
from section and block indexes (`[x.s, x.i]`, `block: [s, i]`, `[s, i + 1]`, `[s, k]`, `.blocks[m.i]`) and
`topPath(` and `outerEdge(` calls, and (C1 review) for readers of a path's or location's top-level indexes: `at[0]` /
`at[1]`, a path destructured (`[s0, i0] = ...at`), the range loops over `f.i` / `t.i` and over `k` (`loc.k <= t.k`);
each match must be in its `ALLOW` list (file, pattern, count, why, until `-`: sites that are not positions or are
section-level by definition; a file and pattern's entries add up); a new match fails, and so does an entry whose count
is larger than what is found (the list only shrinks). `exitList('C3.4')` is empty since C3.4 (`EditRange`'s
`removeWhole` became `RangeOps.removeTop`) and `exitList('C3.5')` since C3.5, both asserted, with no `outerEdge(`
call left: `BookmarkFind.list()` gives `{at, off}`; `ListMake` / `AutoList` find the list to continue with
`ListRestart.listBefore` (flow order through cells); `ListRestart.moveOps` / `continueList` walk every paragraph in
flow order and `sameLabels` compares ops at any depth (an op whose path names no paragraph gives false); the range
loops of `WordCount`, `FormatOps`, `RulerInd` go through `SelShape` (`covered`, `paraRanges`); `BookmarkKeep` and
`ClipSlice` step by flow rank (`neighbour`, `rank`); `Find` / `FindSel` use match paths (`EditPos.topPath` is gone).

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
  `!Letters` (`Open.openDocx`) passes **200,000**, as the window lays out every paragraph (200,001 is refused in well under a
  second, with "it has more than 200,000 paragraphs, the most !Letters opens": `PartXml` and `TblRead.countPara` throw
  `DocxError` `unsupported` with kind `paragraphs`, which `Open.describe` words so; C7 fix A4). Memory is about **1.1 GB per 200,000 paragraphs** when read. UTF-16 parts bypass the byte gate on `<w:p` (bounded, but slower).
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

`!Letters/Fonts/` holds 20 unmodified TrueType files named without an extension (`Carlito-Regular`, ...) and `Licences`
(Latin-1 text, exempt from the tab/72-column checks; it has two verbatim tabs). Carlito = Calibri, Caladea = Cambria,
Liberation Sans/Serif/Mono = Arial/Times New Roman/Courier New, all **SIL Open Font License 1.1** (Caladea checked from
its own LICENSE file: it is OFL, not Apache). They are metric-compatible: same advance widths, so lines break where
they do in Word. `tools/moreapps-fonts.mjs` re-fetches them from pinned commits and checks SHA-256 and licence text
(`node tools/moreapps-fonts.mjs`); the output is the same bytes every time. The OFL requires the licence to travel
with the fonts and forbids selling them alone or using the Reserved Font Names for modified versions, which is why
they are not converted. The fonts are committed in both `tools/moreapps/!Letters/Fonts` and the generated
`assets/disc` copy: the two copies are the same git objects, so the packed repository grows by about **3.7 MiB**; a
checkout's working tree by about 14 MB. `FontMap.substitute` never throws; its `css` is for CSS only (an unknown font
is `"Name", "Liberation Sans", sans-serif`: the computer's own font if it has it, else Liberation Sans).
`FontLoad` adds each face to the page once, however often `!Letters` is started: it reuses a face `document.fonts`
already has (same family, weight and style, `loaded` or `loading`), and calls in flight share a job map kept on
`globalThis[Symbol.for('word.fontjobs')]` (keyed by `document.fonts`), which outlives a run's module instances. The
faces stay with the page after Quit, for the next run. `!RunImage` loads `fontsToLoad(facts(doc).fonts)`: the
bundled families used, plus the bundled fallback (Liberation Sans for an unknown font) of every other one. The stub
shows a document once its fonts are loaded, waiting at most 2.5 s, and lays it out again if they arrive later.

## The stub application

* `!RunImage` — single instance: a second start sends `DataOpen` to the running task and quits. Documents are opened
  by double-click (the type &A7E, `MSWordX`, is bound by `!Boot`: `Alias$@RunType_A7E` runs `!Run`), by a drop on
  the icon bar icon or a document window, and by `DataOpen`. The icon (`!letters`, `IconBar`): Select makes a new
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

`node tools/disc-moreapps.mjs` writes `MoreApps/!Letters` (sources as JSScript &F81; `!Run`/`!Boot` as Obey &FEB; `!Help`
text &FFF; `Fonts/*` Data &FFD; `Fonts/Licences` text; `!Sprites` generated by `icon.mjs`, including the icons of
.docx &A7E and .doc &AE6), inserts `MoreApps` in the manifest at its sorted place, and patches the boot files. It
rewrites only its own subtree, and removes the library's old home `MoreApps/WimpLib` (directory and manifest node)
when it is there, so a disc built before the move is cleaned up. `--check` verifies every text source (Latin-1, no
tabs, no CR, <= 72 columns; the font binaries are exempt, `Fonts/Licences` is checked for Latin-1 and CR only)
without writing.

Both scripts hold the same lock (`.moreapps-lock` in the disc root: both rewrite `manifest.json`) and share
`MOREAPPS_SRC` (the source tree holding `!Letters` and `!WimpLib`) and `MOREAPPS_DISC` (the disc root), used by
`disc.test.mjs`. `disc-moreapps` must run after `disc.mjs`, which rewrites the boot files (`tools/build.mjs` runs
`disc.mjs`, ..., `disc-wimplib.mjs`, `disc-moreapps.mjs`). `node tools/disc-docs.mjs` puts the guide on the disc.

**Boot wiring.** `disc-moreapps` adds one line to each of four boot files (`!Boot` and `Utilities.!ResetBoot`'s
`Choices.Boot.Desktop` and `PreDesktop`): `Filer_Boot` of `Boot:^.MoreApps` and `AddApp Boot:^.MoreApps.!*`, as
real RISC OS would have them. **This desktop runs neither of those files** (`src/main.js` runs only `Repeat Filer_Boot
<BootResources$Dir> -Applications -Tasks`) and `*AddApp` does nothing, so `src/main.js` runs the equivalent for
`ADFS::HardDisc4.$.MoreApps` right after it (when the directory exists; errors are only logged). That is what makes
`!Letters`' sprites and the file type &A7E known from a cold boot, without opening the MoreApps folder.
The patched boot files are kept because they document intent. `!Letters` is not in the icon bar Apps viewer (ROM apps
only; `!Journal` neither); it is reached through the Filer or by double-clicking a .docx. `src/main.js` hard-codes the
`HardDisc4` path, as the `BootResources` line does. See `docs/CORE_API.md` 11a and 14 and `docs/CHANGES_NEEDED.md`.

## Testing

Node >= 22.7 (extensionless imports; the suite was run on Node 26).

```sh
node --test tests/moreapps                    # unit tests (no browser)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps   # the same under a 1 GB heap
node --test tests/moreapps/index.mjs          # browser suite: disc --check, the wimplib import, cold boot, !Letters
node tools/disc-moreapps.mjs --check          # sources: Latin-1, 72 columns
node tools/disc-wimplib.mjs --check           # the library's sources: the same, <= 250 lines, no 'riscos'
node tools/moreapps-corpus.mjs                # fetch the optional sample corpus (needs the GitHub CLI, `gh auth status`)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/corpus.test.mjs   # ~35 s, up to ~1.9 GB RSS (tables typed; their own checks are tables-corpus)
node --test tests/moreapps/regex-hostile.test.mjs   # C6 fix A: every regular expression in !Letters and !WimpLib linear by shape or audited (AUDIT table), the audited ones pumped with 100,000 characters, 1 MB values in every attribute, style and text the HTML reader reads, the CSS / URL / number parsers, the part scans (each < 200 ms)
node --test tests/moreapps/clip-tables-fuzz.test.mjs   # C6 fix: seeded fuzz of table copies (cells, whole tables, ranges at any depth; exact and HTML routes) pasted at carets and over cells, same document and across, Strict and Transitional: checkBlock, unique ids, one undo step, undo / redo exact with part identities, styles resolve, no continue cell on top, no bookmark pair broken or reversed, no tables touching, the file reads back as the model, then the round trip (WORD_EDIT_CORPUS=1 adds corpus sources and targets)
node --test tests/moreapps/bookmark-cells.test.mjs   # C6 fix B3: bookmark pairs kept in order when cells are overwritten by a paste or cleared by Delete / Backspace (model and written XML)
node --test tests/moreapps/tblconvert.test.mjs   # C6.4: textToTable / tableToText / defaultSep / colsFor, the two commands (one step, undo exact, refusals, fields, bookmarks, MAX_ROWS, written files)
node --test tests/moreapps/cliphtmltable.test.mjs tests/moreapps/clipreadtable.test.mjs   # C6.3: tables out (colspan / rowspan, widths, borders, shading, nested, escaped, plain text, a 1000 x 63 table, write -> parse -> read) and in (thead / tbody, spans, th bold, widths, shading, borders, ragged rows, caption; Word, Google Docs, LibreOffice and Excel HTML; 63 columns / 1000 rows / depth 8 / 63,000 cells / the node budget flattened, never cut; huge spans, 100,000 cells, 10,000 nested tables, unclosed tags, scripts and URLs, 5 MB)
node --test tests/moreapps/clippaste-tables.test.mjs   # C6.2: a table pasted mid-paragraph, in a cell (nested), in a depth-8 cell (text), over cells (3x3, one cell, a hidden merge cell, a bookmark kept), ids fresh; Grid Table 4 across documents copied with its basedOn chain (undo gives doc.styles back), used by name, a fresh id, a Strict target, Table Grid by fields; lists and pictures in cells; TblStyleCopy hostile
node --test tests/moreapps/clip-tables.test.mjs   # C1.7: a typed table copied whole in a document (fresh ids, marks dropped, one undo step, lint + xmllint); C6.1: a table across documents (picture and lists in cells carried); ClipCleanTbl; ClipStore counts cell blocks
node --test tests/moreapps/clipslice-tables.test.mjs tests/moreapps/clipclean.test.mjs   # C6.1: ClipCut (spans cut, a continue at the top a restart), cells / mixed / whole slices, ids in walk order, lists, pictures and table styles in table blocks, a 1000 x 63 copy within ClipStore.LIMITS; crossTable cleaning
node tests/moreapps/word-tables.mjs   # browser, after building the disc: tables drawn (pixels: Table Grid lines, Grid Table 4 header and bands, merges, depth 8, a 1000 x 5 table opened < 1.5 s painting only the rows in view, 200% zoom), Left / Right into its cells (C3.1), Info "2 tables", copy + paste + undo, save -> same bytes
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/tables-corpus.test.mjs   # every corpus table: typed ones written back equal after canonTbl (D14b), Opaque ones byte for byte, the Opaque reasons equal corpus-expected.json opaqueTables (~20 s; the typed round trip on one table file in ten, WORD_EDIT_CORPUS=1 for all)
node --test tests/moreapps/editpos-paths.test.mjs tests/moreapps/paths-gate.test.mjs   # edit locations at every depth (ranks, flow order, neighbours), commands in a cell, fail-closed refusals (forged locations through a module hook; nested ends at top-level sites), and the [s, i] gate (R15)
node --test tests/moreapps/walk-scanners.test.mjs   # C1.6: each fixture table read typed and Opaque gives the same word count, numIds, docPr ids, bookmark marks / pairs / names; lists through cells (Word); a bookmark in a cell at its real place (C3.5: inline, a cell's / row's lead, a row's / the table's tail; Go to; nested 4 deep); Info (R12) and DocItems for typed tables
node --test tests/moreapps/cellformat.test.mjs   # formatting, lists, links, pictures, bookmarks and Find in cells (C3.5, D10 paraRanges): Ctrl-B / size / alignment / line spacing / borders / change case / the painter on a 2x2 rectangle touch exactly its four cells (the others the very same objects), one undo step; text in one cell, a mixed range's rows; Bullets on a rectangle; numbering continued before / in / after a table (flow order), Restart / Continue in a cell; AutoList after a table and in a cell; Find from before a table to cells (1,0), (1,1), wrap, backwards, a table's edges; Replace / Replace all in cells; a bookmark added in a cell, found and gone to; a link inserted in a cell and found under the pointer; a picture in a cell found, selected (handles at the cell's x), resized, given alt text; word count of a cells selection; page / section break not breakable in a cell
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/ops-paths.test.mjs tests/moreapps/tables-roundtrip.test.mjs   # ops at nested paths (deep-frozen tables, refusals, ids, a 1000-row restore); 30 random ops in cells and (C7.1) 30 random table commands per table fixture and corpus file with a table, written, read back, lint, xmllint, undo all, plus 1000 cell edits undone and the second generation byte-stable (~22 s; WORD_EDIT_CORPUS=1 for every corpus file, ~77 s)
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
node tests/moreapps/word-quit.mjs             # browser: New from the icon bar (one per double-click), Recent (Choices:Letters, hostile), Quit / PreQuit prompts, shutdown, a save queued before Discard, 50 dirty windows, leaks (in index.mjs)
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
node tests/moreapps/word-autolist.mjs        # browser: AutoFormat lists with real keys (* and 1. then text, Enter Enter, 3. continues, 7. new, Tab, Ctrl-Z gives back the marker), never in overwrite mode, a real input method's commit, paste, Replace all, undo / redo; Format > AutoFormat lists off kept in Choices:Letters with Recent across a restart; Mac Cmd-Z (in index.mjs)
node tests/moreapps/word-breaks.mjs          # browser: page breaks drawn from a Word file, Ctrl-Enter (mid-paragraph, end, empty paragraph, over a selection; one undo step), Left / Right, Backspace / Delete, clicks on the rule at 100% and 200%, selection, copy and paste, saved as <w:br w:type="page"/>; section breaks: the band drawn and labelled, one undo step, clicks in the band, Delete / Ctrl-Z, saved sectPrs; the Insert menu (items, keys, Mac label, shaded later items, run from the menu); page break before (gap, rule, click) (in index.mjs)
node tests/moreapps/word-newlists-hostile.mjs # browser: 1000 rapid * + Ctrl-Z cycles, a space near a paragraph's start in 50,000 paragraphs (+5 ms budget), markers typed by script at 200 starts of 50,000 paragraphs, undo of everything (in index.mjs; A2.6 adds the list commands)
node tests/moreapps/word-spacing-hostile.mjs  # browser: 50,000 paragraphs + Ctrl-2 and undo, 1000 Ctrl-2 / Ctrl-1 toggles, absurd line values, the box open while its window closes, 500 random actions (in index.mjs)
node --test tests/moreapps/newlist-roundtrip.test.mjs   # random Bullets / Numbering / Restart / Continue / AutoFormat with list edits on fixtures and corpus files, written and read back; the numbering part only grown (originals kept in order); undo restores (also list-roundtrip.test.mjs, now with list-making in half of its runs, and clipboard-newlists.test.mjs: copy, paste, HTML and Find with lists made by !Letters)
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
node tests/moreapps/handoff-links.mjs         # writes lnk-1-links.docx, bm-1-bookmarks.docx, paint-1.docx and lnk-README.txt (H1.. H4, BM1..BM7, FP1..FP6, W1..W4 and the word counts !Letters shows) into tests/moreapps/corpus/handoff/ (local, never committed)
node tests/moreapps/handoff-index.mjs         # writes INDEX.txt there: every Batch A hand-off file by deliverable, with its README and what to try, in order
node --test tests/moreapps/formatpaint.test.mjs   # FormatPaint: pick (caret, first character, reaching the paragraph's end, list, inlines passed over, tables), paint (replace not merge, rFonts sub-fields, rStyle, raw elements, one undo step, no-op, caret word, character-only pick, paragraph pick incl. numPr, raw paragraph elements, 50,000 paragraphs)
node tests/moreapps/word-painter.mjs         # browser: the format painter by real clicks and drags: Select once, Adjust sticky, Escape, a click paints the word and paragraph, a drag the selection, a list format carried, one undo step, no-op, Format > Format painter, no listener leak
node --test tests/moreapps/picread.test.mjs tests/moreapps/picmedia.test.mjs tests/moreapps/pic-corpus.test.mjs tests/moreapps/pic-fixtures.test.mjs   # PicRead (extents, crops, floating, Strict, alternate content, hostile values), PicMedia (magic bytes, PNG / JPEG / GIF sizes and dpi, caps, hostile headers, the part a relationship names), the corpus read, and the fixture generators
node --test tests/moreapps/picedit.test.mjs tests/moreapps/picops.test.mjs tests/moreapps/picids.test.mjs tests/moreapps/insertpicture.test.mjs   # PicEdit (only size, alt text, docPr id and r:embed change; an extLst untouched), PicOps (resize, alt text, stepSel), PicIds (max + 1, headers and comments, 2^31), InsertPicture (sizes, names, undo exact, Strict; in a table's cell: the cell's text width, a nested cell's, a picture that fits kept, outside a cell or without a layout the section's column)
node --test tests/moreapps/clippick.test.mjs tests/moreapps/clippics.test.mjs   # ClipPick routes (a picture only when the clipboard has no text) and ClipPics / PicCarry (pictures between documents, same-document ids, Strict crops, caps, the store cap)
node --test tests/moreapps/piccache.test.mjs tests/moreapps/picpaint.test.mjs   # PicCache (one decode for gets while pending, both onReady called; 33 entries evict the first and close it; two 80 MB bitmaps; 40 in view kept without a decode loop; at twice the byte cap deferred, then retried after the timed trim; the timed trim back to 32; a bitmap whose bytes were collected dropped first (with --expose-gc); decoded at a power-of-two bucket of the size shown, a bigger bucket decoded once and replacing the smaller; a failed decode remembered; clear closes all, a late bitmap closed; decodeSize) and PicPaint on a fake context (drawImage with srcRect, negative edges as 0, uncropped when nothing would be left; the size asked for (x the transform's scale); 'Loading picture...' when deferred; missing, 'Picture not shown: EMF', too large with no get for a 50 MB part, IHDR 100000 px or a 20000 px GIF frame; floating dashed; alt text while loading; DocPaint -> paintPic, L.pics inherited from prev)
node --test tests/moreapps/notable-layout.test.mjs   # the layout as columns of items (C2.1): six documents without typed tables (plain, lists, borders, breaks, pictures, Opaque tables) give the items, 40 caret rectangles, 40 hits and 5 selections' rectangles of notable-layout.json, made from the pre-C2 tree (8eae01a) by notable-fixture.mjs; every item's x, w, col, ci are the root column's, L.flow is L.items, the column follows the page, next/prevItem through L.flow, the ruler's column
node --test tests/moreapps/tblstyle.test.mjs tests/moreapps/tblcond.test.mjs tests/moreapps/tblcolor.test.mjs   # TblStyle (Grid Table 4 / List Table 3 / Table Grid views, basedOn merged child over parent, cycles, 64-link cap, non-table ids, memoised by the chain's Style objects, themed colours shown by their literal colour, Strict sides, tableStyleId; Word's own Grid Table 4 from the corpus when present) and TblCond (tblLook flags over the hex, D16's conditions for a 4x4 and band sizes, corners, bandsOf caps, the same layer object per conditions, the compatibility switch, stylesFor: 9 pt with compat on / 11 pt off, a paragraph style's sz wins, docDefaults merged, memoised) and TblColor (themed borders, shading and font colours shown by the literal colour, auto/none as before, Strict sides, hostile attributes not shown, the input never changed)
node --test tests/moreapps/tblgrid.test.mjs tests/moreapps/tblwidth.test.mjs   # TblGrid (a 3x3 with a gridSpan and a vertical merge, cellAt / spanOf, a continue in the first row or under another shape restarts, a span past the grid widens the view only, gridBefore / gridAfter, memo, hostile counts, 10,000 rows < 50 ms) and TblWidth (grid first, D18 step 2's tcW dxa / pct / auto mix with min widths, tblW pct / dxa scaling autofit and not fixed, the 4000 px cap and 1 px columns, tblInd, jc, margins, cell spacing, hostile widths, the memo keys)
node --test tests/moreapps/tblborders.test.mjs tests/moreapps/tablepaint.test.mjs   # TblBorders / TblConflict / TablePaint (TB3's neighbours: single 4 vs double 6, thick 12 vs double 6, dotted 24, the darker colour, nil, the cell above; Table Grid's lines; a conditional firstRow bottom over insideH; Grid Table 4's header with no inside line; themed sides by their literal colour, kept raw; merges, cell spacing, the memo; D21's order on a fake context, an exact row clipped, a merged cell from above, nested, a diagonal, a floating outline, a 1000-row table painted ~30 rows)
node --test tests/moreapps/tbllayout.test.mjs tests/moreapps/tables-layout-corpus.test.mjs   # TblItems / TblLayout (a long cell sets its row, items at the cell's tx, exact 300 tw = 20 px clipped, atLeast 720 tw = 48 px, a 3-row merge grows its last row, vAlign dy, depth 8 typed and the 9th a box, derived styles (a bold firstRow), byId at every depth, L.flow the root items, caret and hits on a table, rowAtY, columns moved with the page, reuse: one cell of a 1000x5 table re-laid out, rows' geometry kept; D20's keystroke budget; autofit widths measured again with new fonts; the work area reaching a 4000 px table) and every corpus table laid out (rows as high as their content, trHeight and merges ask; the extent past every top-level table; a layout after it, every table reused, places everything alike; < 5 s a file; skipped without the corpus)
node --test tests/moreapps/cellpos.test.mjs   # carets in cells (C3.1, D8, D9): L.flow order and places = EditPos ranks (a vMerge continue cell in it); compare and orderedPos agree on every pair; hitTest in cell (1,1), 50 random points round-trip (caretRect in the cell), the nearest cell outside, a merge's restart cell, the nested table; Right / Left through every cell and nested cell, a table's edge reached only where reachable (first / last in the document, in a cell, two tables); Down / Up pass the table; Enter at {t, 0}, at the start of cell (0,0) of a table first in the document and first in a cell (one undo step), elsewhere a split; clamp at every depth (C3 fix wave: the last paragraph of the last cell gone: the end of the one left, not the table's start edge; a whole last row gone: the row before's end); the used-up previous layout and the refreshed flow places of kept cells; selectionRects in a band inside a table
node --test tests/moreapps/celledit.test.mjs   # typing and deleting in and around tables (C3.4, D10, TB10, TB11, D23, R17, R18): typing and Enter in a cell, Backspace / Delete at a cell's start / end do nothing, a range in one cell; TB10's four cases (and nested); a table's edge selects then deletes (a section or cell left ending with a table gets a paragraph); 2x2 + Delete clears (first paragraph's pPr and style kept, untouched rows shared), + Backspace in a 3x3 clears, empty cells no step, whole rows + Backspace removed (+ Delete cleared), every cell + Backspace the table removed; typing, Enter and paste over cells into the top-left cell; mixed ranges (rows 0..1 and the paragraphs, a bookmark pair across them and a loose start kept; rows to the end; a whole table; two tables); Ctrl-Enter / section break in a cell refused; R18; emptyLike / clearCells / deleteRows (restart passed, marks moved) / onTable; EditPos ranks per row equal the flow places after cell edits; D20: a whole keystroke (edit, layout, clamp) in cell (500, 2) of one of five 1000 x 5 tables within +5 ms of the document without them; C3 fix wave: TB10's Backspace / Delete and a kept block's edge keep a removed mark-only paragraph's bookmark marks (one undo step, exact), Delete / Ctrl-Delete on a nested table's end edge never strip its cell's last paragraph, the redo caret of a TB10 removal is the last cell's end (stepEnd), a removal before a table at the document's start redoes into its first cell
node --test tests/moreapps/seltable.test.mjs   # moving and selecting in tables (C3.3, D10): Down from cell (0,1) to (1,1) at goalX and Up back; a cell's next line / block first; out of the last / first row to the paragraphs; in from the paragraphs at goalX; through a vMerge to its restart cell, a merge spanning the caret's own row passed; a table last in the document: its end edge; a nested table in and out; no loop; Home / End in a cell; cellTabTarget: (0,2) -> all of (1,0), 'last' at both ends, null outside, continue cells skipped, a cell of several blocks, nested tables, a selection's head; zoneAt at its pixel limits (3.9 / 4.1 px, 24 / 24.1 px, 4 / 4.1 px above), a table first in the document, a nested table's own zones; zoneSel row / column as cell shapes; Ctrl-Tab outside a cell goes on without running a command (C3a m3: the pending format kept)
node --test tests/moreapps/contcell.test.mjs   # the hidden part of a vertical merge (C3 fix wave, C3a I1): Left / Right, word and paragraph moves and Shift-extend pass a continue cell (text and a nested table in it too; a merge in the last row); TblPos lastPos / cellPos / rowPos / contOf / shown; clamp maps an end in a continue cell to the restart cell; a seeded walk of 600 moves and typing never puts the caret or text there
node --test tests/moreapps/tbledit-rows.test.mjs   # TblEdit's rows (C4.1, D23, D25, R16, R17): insertRows 2 below rows 1-2 of a 3x3 (copied trPr / tcPr, a vertical merge ending at row 2 not grown (C4 fix A4), emptyLike paragraphs in the first paragraph's format with fresh ids, rows not involved shared, a new grid array), below / above a restart and above a continue cell, tblHeader kept above a header row and dropped below the header run, MAX_ROWS + 1 refused ('rows'), bad rows; deleteRows a restart passed to the next row (TB25), a bookmark start in a deleted row's paragraph moved to the next row's lead (a pair wholly inside goes; the last rows: the table's tail), every row null; splitTable at rows 1 and 2 (valid tables, the second a fresh id, the same tblPr, equal grids in new arrays, a merge restarting, the tail with the second), row 0 / past the end refused
node --test tests/moreapps/tblcmd.test.mjs   # TblCmd's row commands (C4.1): insert rows below a caret / above a cells shape / in a nested table, delete rows (the row after / before, every row: the table removed and the caret in the block after, an empty paragraph made when none, a nested table, a bookmark start moved to the next row), Tab in the last cell, split table (at row 1 and row 0): each one undo step, undo exact and giving back the very old table object, R18's caret after undo (the changed row; Tab: the end of the last cell) and the command's own after redo; EditKeys: Tab in the last cell runs tabRow, Shift-Tab at the first nothing; EditApply runs the TABLE ids, null outside a table; Ctrl+Shift+Enter is splitTable (menu 'Table'); refusals (not in a table, mixed, MAX_ROWS) no step; 100 random row commands keep ids unique (tblids); D20: insert row in a 1000 x 5 table and its undo < 50 ms each
node --test tests/moreapps/tblmerge.test.mjs   # TblMerge / merge and split commands (C4.3, D25, TB13, TB14): merge 2x3 with text in 4 cells (one restart cell over 3 columns and 2 rows, paragraphs in flow order, empty cells skipped, tcW summed); ragged rows, a merge reaching outside, one cell: null; a vertical merge inside keeps its hidden content hidden; leads and bookmarks kept; split a plain cell 2x2 (grid split, the other rows' spans grow, a new row with the neighbour vMerge-extended), a gridSpan 3 cell 3x1 (spans divided, no grid change), a span of 2 into 3 (old line kept); a vertical merge divided by rows (null when they do not divide it); past 63 columns / MAX_ROWS rows / absurd numbers: null; the commands one undo step each (undo gives the very old table), a cells shape merged then split, nested tables, 60 random commands keep ids unique
node --test tests/moreapps/tbledit-cols.test.mjs   # TblEditCols / TblCmdCols (C4.2, D24, D26, TB12, TB25): insert a column right of column 1 in a full-width 3x3 (4 columns scaled to the old total, integers), not scaled when it still fits or was already wider (untouched cells shared, tblW dxa grows), left of column 0, two columns, a crossing gridSpan grows, new cells beside a vertical merge plain (the merge kept), gridBefore / gridAfter grow, a short row untouched, absurd textTw never scales, 63 columns allowed and 64 refused, bad columns; delete a column through a gridSpan 2 cell (the span shrinks, TB25), every column null, a row left with no cell goes, gridBefore / gridAfter shrink, a merge shrinks on every row and a stray continue cell restarts, bookmark marks of deleted cells moved (a pair wholly gone goes); distribute 1000/2000/3000 -> 2000 each, a subset, already even = the same table; distribute rows 20/40 px -> atLeast 600, bad heights, MAX_TW; the commands: one undo step, undo the very old table, scaled with a layout, the caret after delete, every column removes the table, refusals no step; select cell/row/column/table shapes (caret, shape, nested table, a merged cell) with no step; distribute commands (caret = whole table); EditRun passes the layout to table ids only; every TABLE id; 60 random column commands keep ids unique
node --test tests/moreapps/celltail.test.mjs   # a cell never ends with a table (C3b I2): TblCheck refuses a typed table or a kept w:tbl last in a cell (a content control last is valid), endsCell; removeBlock / removeBlocks / insertBlock / insertBlocks / restoreBlock that would leave one: RangeError, nothing changed
node --test tests/moreapps/tables-fuzz.test.mjs   # random command sequences in and around tables (C3 fix wave, from the C3b review's fuzz; FUZZ_SEEDS=n, default 40 per document): five documents (nested, merges with row lead / tail bookmarks, nested 3 deep, two tables in two sections, the C3b doorways), 18 commands and undo + redo with stepEnd's caret; after each: blocks valid, ids unique, cells end with a paragraph, one undo step, undo / redo exact, the caret valid, no bookmark pair broken; each sequence written and read back
node --test tests/moreapps/tblpatch.test.mjs   # Table properties (C5.1, D26): fill of a uniform and a mixed table (raw, pct, both: undefined), patchOf (only what changed, never clamped: -1 in, 23 in, text, a length with no rule), setProps (new table and grid array, a raw twin dropped, hostile patches refused, merged cells once), propsCmd / alignCmd (Centre on a 2x2 of a 3x3: those four only, one step; written and read back equal); C5 fix: a width typed for a pct table with no Auto / Length refused (widthMode), only the rule changed keeps the stored height, fieldOf names the refused field
node --test tests/moreapps/tbldrag.test.mjs   # column and row edges dragged (C5.3, C5.4, D33): dragHeight and rowDragCmd (20 px taller: atLeast the new height, one step; exact stays exact; no change, another table, bad row / value / rule: null),  dragWidths (+30 px on border 1 of [100, 100, 100] -> [130, 70, 100]; the shrinking column stops at 0.1 in = 9.6 px; the right edge; a column narrower already not grown; maxPx; bad index / dx), dragGrid (the pair's twips sum kept; fractions), withCols (a new grid array, tcW dxa of every cell over a changed column, pct and raw ones too, the rest shared; fitW: dxa / pct tblW to the total, auto kept; nothing changed: the same table; hostile grids refused), colDragCmd (one undo step, undo gives the very old table; no change or another table: null), edgeAt (3 screen px at 100%, 200%, 50%; right edge; none in a spanning cell, the left edge, text, a table-free layout, absurd points; row borders; nested tables first); N2: merge / split / delete / insert columns give a raw (Strict) tcW the dxa width of its columns; C5 fixes: insertCols scaled beside a raw (Strict) width keeps a cell ending at the new columns its own width (each row sums to the grid), dragHeight stops at 0.01 in, withCols styleW, no row edge inside a vertical merge, the nearer of a nested and an outer border at 50%
node --test tests/moreapps/tblborderpatch.test.mjs   # Borders and shading for cells and tables (C5.2, D31): fill (none, the table's borders, mixed, one cell, shading, raw, eff), Cell + Box on a 2x2 of a 3x3 (outer sides only, inside and neighbours untouched), Box below a cell spanning 3 columns (every other cell unchanged), a line turned off (a wider neighbour skipped, neighbours along the edge nil), cell spacing (table or rows: only the selected cell changes), Inside horizontal / vertical only, a side turned off (nil), Table + All (cells' own kept), shading on cells and the table, raw refused, only tcBorders / shd touched, a vertical merge, hostile setBorders patches, bordersCmd (one step, undo gives the old table, written and read back equal)
node --test tests/moreapps/tblnorm.test.mjs   # the C4 fix wave's rules (TblNorm, TblPairs): prWith drops the raw element a field replaces; a Strict 3x3 whose tcW (155.80pt) and trHeight (12pt) stay raw, through insert column right / columns left / distribute columns / rows / merge / split / merge then split / rows below / delete column: every w:tcPr / w:trPr / w:tblPr written with no child twice and read back equal (and the hand-off 6-roundtrip-strict.docx when the corpus is there); merge keeps bookmark pairs in order (the reported edge, a start in a lower cell's lead, a start left of the rectangle in a lower row, split over a cells shape, the model function), written and read back start first; a stray continue stays shown through delete rows, merge over rows, split into rows, insert rows, split table, columns (unstray); a new row below a merge's last row (Tab in the last cell, Insert row below) plain, inside the merge continue
node --test tests/moreapps/tables-cmd-fuzz.test.mjs   # random structure command sequences (C4 fix wave, from the C4a review's fuzz; FUZZ_SEEDS=n default 20, FUZZ_N default 40): every Table command and Split cells on 8 documents (merges with marks, gridBefore / gridAfter / wBefore / tblPrEx, pct with a stray continue, nested with a merge, nested 3 deep, marks in empty cells, the reversed-pair edge, Strict raw widths); after each: frozen tables, valid blocks, unique ids, grid memo fresh, no field beside its raw element, one step, undo / redo exact, caret valid, no mark duplicated, no pair broken or reversed, no mark or text lost by non-deleting commands, no shown paragraph hidden, no new stray, full tables full; then written, read back equal, undone
node --test tests/moreapps/selcells.test.mjs   # cellsShape's worklist growth (C3a I2): a staircase grows to the whole table; a hostile 1000 x 63 staircase < 50 ms; equal to the old fixpoint on 3000 random merged grids
node --test tests/moreapps/selshape.test.mjs   # selection shapes (C3.2, D10): (0,0)..(1,1) of a 3x3 = 4 cells; a gridSpan and a vMerge crossing the rectangle grow it (fixpoint); a nested table's paragraph as its outer cell; one cell / a caret = text; mixed forward rows 0..1, backward rows 1..2, a table spanned whole, two tables and one between; {t,0}..{t,1} whole; cellRect; paraRanges of cells, text and mixed; memo per owner; a 1000-row shape < 20 ms; DocRects: cell boxes, a merge over its rows, mixed row boxes, a whole table once as its box
node --test tests/moreapps/tblinsert.test.mjs   # TblInsert / Insert > Table (C4.4, D27, D31): 3 rows x 4 columns in a new document (one step, Table Grid and Normal Table added once, undo gives the very styles object back, the XML exactly Word's incl. grid 2256 x 3 + 2258, the styles Word's exact definitions), lint / xmllint / read back, the four placements, a selection deleted first, pPr / pStyle copied, no two tables touching, nested in a cell (width = cell less 216), refused at depth 8, Strict (booleans only, start / end), an existing Table Grid kept, no style table (direct borders), a fixed width, hostile numbers, Delete table; C4 fix wave: SectWidth.columnTw, Auto in a 2-column section [2076, 2077] (layoutTw nothing outside a cell) and in a landscape second section (13958), layoutTw in a cell, a Strict insert through roundTrip (lint, xmllint, read back), 32767 rows taken and 32768 refused, another default table style (no Normal Table, Table Grid based on it, one default), a TableNormal that is no table style never the base, a list item's numPr in the cells
node tests/moreapps/word-tables-format.mjs   # browser (C5.1, C5.2): Table > Table properties... opens filled; Row height Exactly 0.3 in + Return: one undo step, 28.8 px high by pixels, the cell clipped; Escape; bad lengths beep and keep the box; Cell alignment > Top / Centre / Bottom moves the text by pixels; a stale box is refilled; several fields in one OK; 20 cycles leak nothing; Borders and shading in a table: Apply to Cell (default) / Table offered, shaded outside; Cell + Box + grey fill on the middle cell of a 3x3: one step, the four lines and the fill drawn (pixels), undo; Table + All: the table's six sides drawn; Paragraph + Box in a cell paragraph; a themed raw cell beeps and says why; 20 Borders-box cycles leak nothing; a pct table: Table width blank, the width shaded, a width with no mode beeps with "Choose Auto or Length", Length enables it and 5 in is one step; closing the document with both table boxes open deletes them; row edges dragged (C5.4): a real drag of a row's bottom border 20 px down draws a dashed horizontal line, one step with trHeight atLeast the new height, the border's pixels move 20 px, Ctrl-Z, Escape, back to the start, an exact row stays exact; the ruler in a cell: the left marker over the cell's text, the right marker at its width, no column markers, a real drag of the left marker 0.5 in gives the cell paragraph indent 720 in one step; column edges dragged (C5.3): a real drag of the border between columns 1 and 2 by 30 px draws a dashed line and makes one step (grid 3450 / 2550 / 3000, every cell's tcW in both columns, the pct one dxa), the border's pixels move 30 px, Ctrl-Z; Escape mid-drag: nothing, no step; back to the start: no step; the right edge +50 px; at 200% a press 2 screen px away drags (30 screen px = 15 layout px), 5 screen px away is a text drag
node tests/moreapps/word-tables-hostile.mjs   # browser (C7.1): D14f's set opened, refused files, 1000 x 5 / 1000 x 63 / staircase / merged columns / depth 8 / 100 tables, keystroke budgets against a table-free baseline, drags, Delete + undo, 1000 Tab presses, convert, paste, border drags, 500 random actions, windows closed mid-operation (SECTIONS=hostile,big,budgets,ops,convert,random,close; ~80 s)
node --test tests/moreapps/relayout-perf.test.mjs   # C7.1 / C7 fix A3: relayout of 50,000 paragraphs after one edit (within about 1 ms of the main branch before Batch C); a table-free layout makes no second flow array and no `ry`
node --test tests/moreapps/tbl-final-pairs.test.mjs tests/moreapps/tbl-final-ui.test.mjs tests/moreapps/handoff-xsd.test.mjs   # the final fix wave: Delete > Table / every row / every column keep a pair across the table's edge, a range from one table into a later one never writes a pair end before start (Delete, typing, Enter, Insert table), nothing new touches an Opaque table, Table to text in file order; Borders and shading on a 1000 x 63 selection, the Split cells reasons, old table versions keep no grid (--expose-gc child); the tb-*.docx hand-off files with no element out of schema order and no unknown value (when the local hand-off folder and xmllint are there)
node tests/moreapps/word-tables-final.mjs   # browser (final fix wave): the Tab item shaded for cells selected and a selection into a table, live for a caret or text in one cell; the Split cells box's stale guard (the caret moved, the document edited)
node tests/moreapps/handoff-tables.mjs   # C7.2 / C7.3: writes the 23 tb-*.docx files and tb-README.txt (a PRIORITY list of 15 checks first, then 98 questions each marked [PRIORITY] or [if time allows]); node tests/moreapps/handoff-index.mjs then writes INDEX.txt (the Batch C block); local, git-ignored. `--word-md` prints the consolidated index below.
node --test tests/moreapps/tables-apart.test.mjs   # C7 fix A1 / A2: Backspace, Delete and deleted ranges never leave two tables touching (typed, Opaque, in cells); a table deleted whole keeps bookmark pairs
node tests/moreapps/word-tables-drag.mjs   # browser (C5 fixes): the border after a cell over two columns dragged (one step, the wide cell's tcW the sum); a row border inside a vertical merge not dragged, beside it dragged; a nested table's own column border; the right edge of a table 100% wide by its style (tblW dxa written, drawn narrower); an exact row dragged far up stops at 15 twips, exact kept; a window closed mid-drag: no beep
node tests/moreapps/word-tables-menu.mjs   # browser (C4.4): the menus by real clicks (shading, keys, order), the Insert Table box by real clicks and keys (4 x 3 and Return: the grid drawn by pixels; 0, 64, 1001, text, 23 in: beep + message + box kept; fixed 1.5 in; Escape), every Table menu item on a 3 x 3 (one undo step each), Select, Split cells..., Insert > Tab, 20 box cycles leak nothing; C4 fix wave: dotted lines after Select, Split table, Distribute columns evenly; one column with a Fixed width of 23, 0.05 or -1 in refused (not clamped), 4 x 6 in "Too wide"; the caret moved while the box is open beeps once, the box asked for again takes the new caret; Auto in a 2-column section [2076, 2077]; the leak cycles close by Escape and Cancel in turn
node tests/moreapps/word-tables-edit.mjs   # browser (C3.1): a click in each cell (the Wimp's caret inside it), Right / Left through a 2x2 between "Before" and "After", clicks at 50% and 200%, a table first in the document: Left to its edge, Enter there and Ctrl-Z; (C3.2) a Shift-drag from cell (0,0) to (1,1) of a 3x3 lights the four cells' boxes in the selection colour by pixels, the other cells stay white; (C3.3) Tab through the cells selecting each one's content and Shift-Tab back (nothing past the ends), ArrowDown / ArrowUp by the cells and out, Shift-Right across a cell boundary lights two boxes, a plain drag (0,0) to (2,1) lights six, a click in a cell's first 4 px / left of row 2 / above column 1 selects the cell / row / column, Ctrl-Tab types a tab in a cell (one undo step), Ctrl-A the document; (C3.4) by real keys: Backspace at the start of "After" goes to the end of the last cell (nothing deleted), Delete at the end of "Before" and Backspace / Delete at a cell's start / end do nothing; Delete over cells (0,0)..(1,1) clears them and Ctrl-Z restores them with the caret in cell (0,0); Backspace over row 1 removes it and Ctrl-Z restores it, the caret in it; typing over two cells clears them and puts the text in the top-left one; Ctrl-Enter in a cell beeps and changes nothing; typing in a cell and Ctrl-Z put the caret back in the cell; D20: 200 characters typed in cell (500, 2) of a 1000 x 5 table (median of edit, layout and the next paint) within +5 ms of 200 in a plain paragraph of the same document (1.8 ms against 1.0 ms here); (C3.5) Ctrl-B with cells (0,0)..(1,1) of a 3x3 selected: exactly those four cells bold, drawn with more ink by pixels, (0,2) and (2,2) drawn exactly as before, one undo step; the Find box finds "find me" in cell (1,1) from the document's start, selects it and paints it inside the cell; a real Ctrl-click on a link in cell (2,0) goes to its bookmark in "After"; (C3 fix wave) ArrowRight from the end of a 2x3's row 0 passes the hidden continue cell of a vertical merge to "c", a letter typed goes there, Home and ArrowLeft go back to "b"; a PNG dropped on cell (0,0) of a 2x2 goes in sized to the cell's text width (one undo step), and its SE handle dragged by a real mouse makes it smaller in proportion (one undo step, still in the cell); (C4.1) a real Tab in the last cell of a 3x3 adds a row (one undo step, the caret in its first cell), Ctrl-Z removes it with the caret back at the end of the last cell, Shift-Tab in the first cell adds nothing; Ctrl-Shift-Enter in row 1 splits the table with an empty paragraph between (one undo step, the caret in it), two separate grids by pixels (the column border dark in both tables, white between), Ctrl-Z gives the one table back; C4.3: cells (0,0)..(1,1) merged by `mergeCells` (one cell with the four texts in flow order, one undo step, the caret at its start, no line drawn inside it by pixels, Ctrl-Z gives the nine back), the Split cells box (`splitBox()`) with Columns 3 and Rows 2 typed and OK clicked (one undo step, 5 grid columns, 4 rows, the new lines drawn), Columns 70 and Columns 62 (past 63 grid columns) beep with a message and keep the box, Escape changes nothing
node --test tests/moreapps/tblreuse.test.mjs   # TblReuse (D20, C2 fix wave): a plain keystroke stacks no cell and keeps every table's cells; a table that moves is placed again; a new paragraph above (new indexes); a cell keystroke stacks that cell only; a cell that grows; merges, vAlign and nested tables edited and moved; list labels through a table; a new width, new decorators, invalidate(); every result equal to a full layout; the budget: five 1000 x 5 tables, plain and cell keystrokes within +5 ms of the document without them
node --test tests/moreapps/picline.test.mjs   # PicLine and pictures in LineLayout (fit to the column and to what a first-line indent leaves, caps, exact spacing, lines kept only in the same L.ns), and 'no pictures, same lines': four paragraphs (runs, tab, superscript, justified with a link, VML box, right tab with leader, a drawing in a scope where nothing is a picture) laid out today equal nopic-lines.json, the pre-batch LineLayout's lines (e7c33d7; nopic-fixture.mjs makes it again)
node tests/moreapps/word-pictures.mjs        # browser: a red PNG, a JPEG and a GIF drawn (pixels), a floating PNG with a dashed edge, EMF and missing boxes labelled; decodes = the 4 decodable pictures in view; repaints decode nothing; 200% twice as wide; 1000 pictures open < 2 s decoding only the first screen, 100 scrolled into view decoded once each, back to 32 bitmaps by the timed trim; 117 in view at 10% drawn with no decode on repaint; a 1000 x 1000 picture shown 48 px wide decoded at 64 x 64 and once more, bigger, at 400%; a window closed (cache unchanged) and closed while decoding (no redraw, no error)
node tests/moreapps/word-pictures-edit.mjs   # browser: a real click selects a picture (8 black handles), Shift-Right, Delete / Backspace + undo; SE handle keeps the ratio within 1 EMU, e changes the width only, Shift frees a corner; Escape mid-drag changes nothing; a floating picture beeps; Ctrl-Z selects the picture; 50% / 200%; double-click -> onPicture; 30 cycles leak nothing; a drag back to its start makes no step; Delete / Ctrl-Z mid-drag end it with a beep; a 12 x 6 in picture fitted to the column: e and corner drags scale the file extent; min / max sizes keep the ratio
node --test tests/moreapps/picpatch.test.mjs   # PicPatch: fill (twips, shaded floating / unsupported / no natural size / long or control alt), patchOf (unchanged -> {}, keep recomputes the other side, both changed, range, alt)
node tests/moreapps/word-picbox.mjs   # browser: double-click and Format > Picture... open the box filled; shaded without a picture; Escape and Cancel; Width 3 + OK one undo step; Keep off; out of range / not a length keeps the box; alt saved as descr; floating shaded, anchor XML byte-equal but descr; Reset size on a 300 dpi PNG; stale selection refilled; 20 cycles leak nothing; deleted with its document
node tests/moreapps/word-pictures-hostile.mjs   # browser: 100 pictures in one paragraph; 1000 pictures in 1000 paragraphs scrolled end to end (decodes never more than seen, `pics.bytes` under 128 MB); a 50 MB PNG part and IHDR / SOF / GIF-frame bombs as labelled boxes of their extent, no decode, bytes untouched; a corrupt PNG decoded once, never retried; 1000 real resize drags (no leak, undo all); select all of 50,000 paragraphs with 100 pictures, Delete and Ctrl-Z under 5 s; a copy between two documents; 500 seeded random actions incl. the Picture and Insert picture boxes with hostile text and dropped and pasted files, then undo gives back the opened model, parts and relationships (in index.mjs, ~85 s)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/pictures-roundtrip.test.mjs   # random insert / resize / alt text / delete / copy and paste within and between documents (good and hostile arguments) per fixture and corpus file: written, read back equal, package lint, xmllint (one seed), undo all gives the opened model, the same `parts` Map and `rels` array and its bytes; media parts never lost (~25 s; WORD_EDIT_CORPUS=1 for every file with NODE_OPTIONS=--max-old-space-size=4096 also checks every untouched file writes the same bytes twice over with its media parts identical)
node tests/moreapps/handoff-pictures.mjs      # writes pic-1-inserted.docx, pic-2-resized.docx, pic-2b-real.docx (when the corpus has a Word-made picture), pic-3-strict.docx, pic-4-dpi.docx, pic-5-floating.docx, pic-6-source.docx, pic-6-pasted.docx, pic-7-deleted.docx and pic-README.txt (PI1..PI8, PI*; local, corpus/handoff)
node --test tests/moreapps/wordcount.test.mjs   # WordCount: punctuation, white space, the no-break space and hyphen, emoji, East Asian characters, paragraphs counted only when they have a character, tabs and breaks, unseen inlines, links, fields' results and codes, deleted text, tables (and other kept blocks, a text box skipped, 200,000 levels deep, past 1,000,000 nodes partial), selections (across paragraphs, inside a word, tables between or at the ends, a bad selection), lines from the layout (a typed table's cells' lines too), 1,000,000 words and a 5 MB paragraph under a second
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
node tests/moreapps/handoff-documents.mjs     # writes new-*.docx, saved-*.docx and doc-README.txt, made by !Letters in the desktop (local, corpus/handoff)
node tests/core/test-textinput.mjs            # core, browser: the text-input proxy (in tests/core/index.mjs)
node --test tests/core/test-textinput-pure.mjs   # core: sanitizeText
node tests/moreapps/handoff-typing.mjs       # writes the typed-*.docx real-Word hand-off files (local, corpus/handoff)
node tools/moreapps-fonts.mjs                 # re-fetch the fonts (pinned, checked)
node tests/moreapps/validate.mjs              # xmllint schema validation of what the writer writes
node tests/moreapps/lint-package.mjs FILE.docx|DIR...   # package linter (exit 1 if any file has an error)
VALIDATE_DIR=tests/moreapps/corpus VALIDATE_MAX=150 node tests/moreapps/validate.mjs   # original vs written errors
```

Timing tests run in parallel under `node --test tests/moreapps` can miss their caps when the machine is loaded; rerun
the one that failed alone before suspecting a regression. Known ones: `docx-read` "200,000 paragraphs still read
quickly", `hostile-view` "calls quick", and `relayout-perf.test.mjs:92` (the 50,000-paragraph relayout median, 25 ms
cap; 33 ms was seen once under the full parallel run, it passes alone). That test asserts only the 25 ms ceiling and
linear growth: the D20 "main + 5 ms" budget is measured by hand against the main branch (see "The 50,000-paragraph
document" above), so a regression of 5 to 10 ms would pass the suite (final-2 M12).

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
  !Letters), `word.mjs` (open, text, formatting, save copy equals the original, 5000 paragraphs opens in ~150 ms,
  the menu does not leak windows), `word-life.mjs` (three runs of !Letters add each font face to the page once; no fonts, close, Quit leave nothing
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
  `corpus-expected.json` (21, all genuine: old `.doc`, encrypted, not zips...; its `opaqueTables` entry is not a
  file but the pinned histogram of tables kept Opaque, R1). Result: 633 files, 612 read and
  written, 21 expected refusals, 0 failures; `xmllint` finds no schema error the writer adds (1,824 parts).
  The shared check is `corpus-check.mjs` (`checkFile(bytes, what, opts)`; `checkWrittenOrder` also descends into
  typed tables: tblPr, trPr, tcPr and cell paragraphs, nested tables). `tables-corpus.test.mjs` (C1.3): 134 files
  with a body table; 319 tables type (23 nested) and write back equal after `canonTbl`; 24 stay Opaque (tracked 8,
  wrapped 12, order 3, grid 1); 13 `w:sdt` around rows and 16 around cells.
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
The writer repairs the generic content types of known parts (`tools/moreapps/!Letters/PartTypes`, above), and the
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
4. deleting a selection across a section break (Word removes the break and merges the sections; !Letters keeps every
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

| | question | what !Letters does |
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
| F14 | no default size anywhere in the styles | !Letters assumes 11 pt (Word is believed to show 10 pt); a chosen size is always written (`sz` 22 for 11 pt) |
| F15 | bold as a toggle property (direct `w:b`, a bold character style, a bold paragraph style) | any `b: true` is bold; a size change removes a direct `b` that the styles seem to give |

### To check in real Word (lists, deliverable 5)

`node tests/moreapps/handoff-lists.mjs` writes `list-1-bullets.docx`, `list-2-numbered.docx`,
`list-3-multilevel.docx`, `list-4-edits.docx` and `list-README.txt` into `tests/moreapps/corpus/handoff/` (local,
never committed; only changed bytes written, no other file touched). Files 1-3 are built as `.docx` (`list-fixtures.mjs`)
and opened and saved by !Letters; file 4 is edited with !Letters' commands. The README (local) lists every paragraph's label
and indents as !Letters draws them, and the questions (G1..G23):

| | question | what !Letters does |
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

| | question | what !Letters does |
|---|---|---|
| L1 | the six bullets and six numberings of the gallery (`ListGallery`), three levels each (bullets) or levels 0-3 | each opens in Word with the glyphs of Word's own gallery (Symbol U+F0B7 disc, Courier New `o` circle, Wingdings square U+F0A7, diamond U+F076, arrow U+F0D8, check U+F0FC), indents 720 + 360 hanging per level, and the formats cycling 1. a. i. / 1) a) i) / I. A. 1. / A. a. i. / a) i) 1) / i. a. 1.; the files `nl-1`, `nl-2` |
| L2 | Bullets / Numbering after a gap of plain paragraphs | continues the nearest earlier list in the section when its level 0 is the chosen format (owner's ruling); a list of another kind or format nearer: a new list |
| L3 | Restart / Start at | a new `w:num` on the same abstract with one `startOverride`; the item and every later item of its list move to it; of the source num's other overrides only level replacements are copied (Start at 5 on an item, then a sublevel restarted: the next top-level item shows 6) |
| L4 | a document with no numbering part, Bullets clicked; one with a Word numbering part extended | the part, its relationship and its content type are written new (or the part extended: the new abstract after the last abstract and before the first num, the new num after the last num and before `numIdMacAtCleanup`, every old node as it was) and Word opens the file without a repair prompt, showing the list; the files `nl-1`, `nl-4` |
| L5 | List Paragraph | given to default-style paragraphs turned into a list, back to the default when turned off |
| L6 | list items copied from one !Letters document and pasted into another | decided (owner: keep them, as Word): the list is made in the target, a new one copied from the source's definitions; borders, shading and tab stops come too. The questions are L6-1..L6-6 in "To check in real Word (lists, borders and shading pasted between documents, L6)" |
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

| | question | what !Letters does |
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

`node tests/moreapps/handoff-documents.mjs` runs !Letters in the desktop and copies out what it saved:
`new-1-empty.docx` (New, saved untouched from the Save box), `new-2-typed.docx` (New, typed with real keys, Ctrl-B /
Ctrl-I), `saved-1-edited.docx` (the rich document of `edit-rich.mjs` opened, edited, Save), `saved-2-as.docx` (edited
again, Save as), and `doc-README.txt` (local, never committed; only changed bytes written, no other file touched):

| | question | what !Letters does |
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
name, link as text, a list item's text without its paragraph mark plain, table left out: as in Batch 6b; since Batch C
a typed table comes as a table), `clip-3-html.docx` (a new document made by pasting Word,
Google Docs, web page, table, `<pre>` and Notepad payloads; parsed by `html-fake.mjs` standing in for DOMParser),
`clip-4-tableids.docx` (a table with a bookmark pasted as text, a table with `w14:paraId` pasted whole without them),
`find-1-replaceall.docx` (Replace all with Match case / Whole words, link text skipped, a tab in the replacement, a
needle with pattern characters, one Replace) and `clip-README.txt` into `tests/moreapps/corpus/handoff/` (local,
never committed; only changed bytes written, no other file touched; the main parts validate against `wml.xsd`). The
README lists what Word should show, the questions and the checks by hand in a browser (copy and paste to and from
Word, Google Docs, a web page, Notepad; the Edit menu; Safari / Firefox):

| | question | what !Letters does |
|---|---|---|
| C1 | documents with pasted content open with no repair prompt (clip-1..3, find-1) | same-document paste keeps raw inlines and tables as they are |
| C2 | formatting pasted from other programs (clip-3) | the whitelist: b i u s sup sub, colour, first font family, size (clamped), alignment |
| C3 | links across documents | the link's display text only (no rel, no link formatting) |
| C4 | headings and lists from HTML | Heading N by name (plus direct bold and size); list items plain paragraphs |
| C5 | tables (superseded by Batch C: see "Tables (Batch C): the rules") | from HTML: a paragraph per row, cells joined by tabs; across !Letters documents left out; same document copied whole |
| C6 | Replace all (find-1) | literal, one `spliceText` per paragraph, the first replaced character's format, link text skipped |
| C8 | tables with ids pasted in the same document (clip-4-tableids.docx; superseded by Batch C for typed tables: an Opaque one still follows this) | a table holding a bookmark is pasted as text; one with only `w14:paraId` as a table without them |
| C7 | a picture copied and pasted in the same document: Word opens it with two `wp:docPr` of the same id without a repair prompt? (believed tolerated, unverified) | moot since Batch B (B7): a same-document paste gives every pasted `wp:docPr` a fresh id (`ClipPics.freshDocPrs`); a file that already has duplicates keeps them |

### To check in real Word (paragraph spacing, Batch A task A1)

`node tests/moreapps/handoff-spacing.mjs` writes `sp-1-linespacing.docx` (1.0, 1.15, 1.5, 2, 3, exactly 12 pt with 18 pt
text, at least 30 pt, the default), `sp-2-before-after.docx` (Ctrl-0 on and off, mixed selection, Add space after, List
Paragraph's contextual spacing, raw autospacing), `sp-3-flow.docx` (keep with next, keep lines, widow control off, page
break before) and `sp-README.txt` into `tests/moreapps/corpus/handoff/` (local, never committed; only changed bytes
written, no other file touched). The README lists every paragraph's written values and the questions:

| | question | what !Letters does |
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

| | question | what !Letters does |
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

| | question | what !Letters does |
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
| BD10 | a box on a list item | the box takes in the label (hanging indent), left side at the label's left. (Make it in Word, open in !Letters) |
| SY1 | symbols as plain Unicode text in the current font (no `w:sym`) | every character of sym-1 in Calibri or a fallback; which need another font? |
| SY2 | `<w:noBreakHyphen/>` and `<w:softHyphen/>` in a run (sym-1 lines 12 to 14) | open without a repair prompt; never breaks / breaks only at the end of a line (and Word shows a hyphen there; !Letters shows nothing) |
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
are rewritten). The README lists what was really written, paragraph by paragraph, and the word counts !Letters shows for
each file (words, characters with and without spaces, paragraphs: compare with Word's Review > Word Count). The
questions (H for hyperlinks, BM for bookmarks, FP for the painter, W for the count):

| | question | what !Letters does |
|---|---|---|
| H1 | Remove link after Insert hyperlink over a run with its own character style (`w:rStyle`, e.g. Emphasis) | the link's runs take the Hyperlink style (one character style per run), so Remove link leaves that run with no character style: its own style is lost (direct formatting is kept); Word? |
| H2 | Edit hyperlink with a new address, and Remove link | the old relationship stays in the file, unused (valid; lnk-1 lines 10 and 11); Word opens it without complaint? |
| H3 | the Hyperlink character style added on first use (colour 0563C1, single underline, `basedOn` the default character style, `uiPriority` 99, `unhideWhenUsed`) | Word shows the links blue and underlined and the style in its Styles pane as usual |
| H4 | `www.example.org` typed as the address gets `http://` in front; a space is written `%20`, `&` as `&amp;`; a ScreenTip is `w:tooltip` (lnk-1 lines 5, 6, 8) | Word opens the right addresses with Ctrl+click and shows the ScreenTips |
| BM1 | a bookmark added by !Letters (`w:bookmarkStart w:id w:name` / `w:bookmarkEnd w:id` as direct children of `w:p`, ids from one more than the largest) | opens without a repair prompt; Insert > Bookmark lists it; Go To selects the same text |
| BM2 | a bookmark across paragraphs, and one at a caret (start and end together) | Word keeps both; the caret one is an empty bookmark at that place |
| BM3 | deleting the paragraph that holds a bookmark's start (its end in a later paragraph) | !Letters moves the start to where the deletion was (the bookmark shrinks); Word the same? |
| BM4 | Left / Right next to a bookmark | one press per visible character (the marks never take a press); Word? |
| BM5 | typed text right after a bookmark's end / before its start | !Letters: text typed at the caret between the marks goes inside; after the end mark, outside; Word extends a bookmark only when typing inside it? |
| BM6 | a name Word itself refuses (from a file: `1st`, `has space`, longer than 40) | !Letters lists, goes to and deletes it, but never makes one |
| BM7 | typing or pasting over a selection that holds a bookmark's start whose end is outside it | the start is put back where the selection was and the new text goes BEFORE it, so the typed text lands outside the bookmark; Word keeps it inside? |
| FP1 | a click with the painter on paints the word there and the paragraph | Word paints the clicked word (character format) and, when a paragraph mark was picked, the paragraph |
| FP2 | the pick's run properties REPLACE the target's (a bold word painted from plain text becomes plain) | Word's format painter replaces the character format |
| FP3 | a list item picked with its paragraph mark and painted over a plain paragraph | the paragraph joins the list (same numId and level); painting a plain paragraph over an item takes it out of its list |
| FP4 | the character style (`w:rStyle`) of the pick | copied; a pick without one removes the target's style |
| FP5 | raw paragraph children `!Letters` does not model (`w:bidi`, `w:framePr`, `w:suppressAutoHyphens`, `w:textAlignment`, `w:textDirection`) | stay on the target and are not carried from the pick (only `PPR_FIELDS`' raw ones, tabs, borders, shading... are); Word copies them? Change records and `w:id` elements are never carried and a run keeps its own |
| FP6 | a sticky pick after an undo removed its list or character style | the part is dropped when painting (the target's list is left alone); no error |
| W1 | each East Asian character counted as a word (and ending the word beside it) | Word's status bar and Word Count box give "Asian characters" and "Non-Asian words": the sum is what !Letters shows; kana and Hangul the same? |
| W2 | characters are code points (an emoji is 1; Word counts UTF-16 units?) | the Characters line for a document with emoji and with combining marks |
| W3 | the no-break spaces (U+00A0, U+2007, U+202F) are left out of "no spaces" and join words | Word's Characters (no spaces) for `a<nbsp>b`; words 1 |
| W4 | tables' text, links' text and field results in; field codes and tracked deletions out; text boxes, footnotes and headers not counted | the Word Count box with "Include textboxes, footnotes and endnotes" off, on a document with each |

### To check in real Word (lists, borders and shading pasted between documents, L6)

`node tests/moreapps/handoff-cliplists.mjs` writes `cl-1-source.docx` (the document to copy FROM, in Word and in
!Letters: a multilevel list, its twin restarted at 5 on the same abstract, a bordered, shaded, right-aligned paragraph
with two tab stops and indents, a two-level bullet list), `cl-2-pasted.docx` (all of it pasted by !Letters into a new
document), `cl-2b-next-to-a-list.docx` (its first items pasted after a list of the target),
`cl-2c-last-item-text.docx` (the last item copied without its paragraph mark), `cl-3-strict.docx`
(pasted into a Strict document) and `cl-README.txt` (the steps in Word and every paragraph as read back, with its
label) into `tests/moreapps/corpus/handoff/` (local, never committed; only changed bytes written).

| | question | what !Letters does |
|---|---|---|
| L6-1 | the pasted documents open without a repair prompt (cl-2, cl-2b, cl-3) | new `w:abstractNum` / `w:num` added (old nodes untouched), numbering part and relationship made when missing; main and numbering parts validate against `wml.xsd` |
| L6-2 | the labels after a paste into a new document (step 2) | those of the source (1. a. 2. 5. 6., the bullets): one new abstract per source abstract (fresh `w:nsid`, no `w15:`/`w14:` extensions, no `lvlPicBulletId`, no level `pStyle`), one new num per source num with its `lvlOverride`s |
| L6-3 | items pasted next to a list of the target (step 3) | a new list (1. a. 2.), never the target's (Word's "keep source formatting" is believed to do the same; "merge" would continue it) |
| L6-4 | items copied from the middle of a list | numbered from the copied definition's start (1.), not their number in the source (Word may keep it) |
| L6-5 | the bordered paragraph | borders, shading, tab stops, indents and alignment as in the source (all modelled `pPr` fields kept; raw extras cleaned) |
| L6-6 | a Strict target (cl-3) | the copied definitions and paragraphs spelled Strict: `w:ind w:start`, `lvlJc` / `jc` start / end, tab stops start / end, `pBdr` `w:start` (and the other way for a Transitional target). Only these NAMES are respelled: other attribute VALUES in raw extras and the copied `w:lvl` (`rPr`, `pPr`) stay as the source wrote them, and some are thought to be Transitional-only (`w:w w:val="150"` where Strict wants `150%`; ST_OnOff `on` / `off`): does Word open cl-3 without a repair prompt? (open item below) |
| L6-7 | whole paragraphs only (cl-2c) | a paragraph brings its formatting and list only when its end (the paragraph mark) is selected too, as Word is thought to do: the last item selected up to the end of its text, or one item's text alone, comes as text with the target paragraph's properties (labels `1. a.` then none in cl-2c); the first block pasted into the middle of a paragraph joins it. Is that Word's rule? |

### To check in real Word (Batch A final review)

| | question | what !Letters does |
|---|---|---|
| S1 | a Strict document (saved by Word as "Strict Open XML Document") made a list, indented and bordered in !Letters | the List Paragraph style's indent and a paragraph's indent are `w:ind w:start`, borders `w:start` / `w:end` sides (as the Strict schema has them); alignment is written `w:jc w:val="start"` / `"end"` (`JcName`). Does Word open it without a repair prompt, with the indents, borders and alignment shown? |
| N1 | a document whose numbering relationship names a part it cannot use (a missing target, or one that names another part) gets a new list | `NumWrite.ensurePart` adds a SECOND numbering relationship to a new `numbering.xml` (or `numberingN.xml`) and puts it BEFORE the unusable one, so the reader (and, we expect, Word) takes the first; the old relationship is kept. Does Word use the first numbering relationship and ignore the second, without a repair prompt? A hostile hand-off file for this (one relationship to a missing part, one to `word/styles.xml`) is still to be made: `handoff-newlists.mjs` would gain it |

### To check in real Word (pictures, Batch B)

Hand-off files: `node tests/moreapps/handoff-pictures.mjs` (steps, what !Letters wrote and all 16 of these questions in
`pic-README.txt`; `INDEX.txt`, from `handoff-index.mjs`, points to it). The question about a picture sharing its run
with text, first recorded as PI8, is PI9 (PI* is the last PI row: real drag and drop and image paste, which no
synthetic test reaches). P1..P6 are questions from the display, selection and paste work (B2, B3, B7); there is no P7.
PI9, PI* and P1..P5 have no file (marked "(No file)" in the README: tried in Word on a document of the owner's own);
P6 is asked of `pic-6-pasted.docx`.

| | question | what !Letters does |
|---|---|---|
| PI1 | the inserted PNG, JPEG and GIF of `pic-1-inserted.docx` | open without a repair prompt (a media part per picture, a `Default` content type per extension, one image relationship each, `wp:inline` as Word writes it) |
| PI2 | `pic-2-resized.docx`: pictures resized by a corner and by an edge, alt text set | `wp:extent` and `pic:spPr/a:xfrm/a:ext` agree, Word shows that size (3 x 1.5 in and 2 x 2 in) and the alt text; no repair |
| PI3 | `pic-3-strict.docx`: a Strict document with an inserted, resized picture | opens, and stays Strict on save (Strict image relationship type, Strict `wp` / `a` / `pic` namespaces in the main part) |
| PI4 | `pic-4-dpi.docx`: a PNG at 300 dpi, a JPEG at 72 dpi (JFIF) and one in dots per cm (118 = 299.7 dpi), and a PNG with no density | Word's "original size" (Size > Reset) equals !Letters' Reset size: pixels over dpi per axis, 96 when none (2 x 1, 4 x 2, 0.8 x 0.4 and 2 x 1 in) |
| PI5 | `pic-5-floating.docx`: a floating picture (a Word-made one when the corpus has it) whose alt text was set | keeps its place and wrap; only `wp:docPr descr` changed; a resize was refused (`floating`) |
| PI6 | `pic-6-pasted.docx`: two pictures sharing `wp:docPr id` 7 in the file | accepted by Word without a repair (kept as they are); pictures pasted into the document have fresh ids (8 and 9) |
| PI7 | `pic-7-deleted.docx`: a picture deleted, its media part and relationship left | no repair prompt; Word drops the orphan part and relationship when it saves |
| PI8 | a picture pasted between documents (`pic-6-pasted.docx` from `pic-6-source.docx`) | keeps its size, crop (`a:srcRect`) and alt text; Word shows it the same |
| PI9 | an inserted picture shares its run with neighbouring text (`<w:r><w:t>x</w:t><w:drawing/></w:r>`) and takes its `rPr`: with `w:vanish` text before it, is the picture hidden; do `w:position` / `w:vertAlign` move it? Inside a hyperlink run is it a linked picture; inside a complex field's result is it lost on update? | the picture takes the run format of the text before it, as typing does (nothing dropped) |
| PI* | real drag and drop of a picture from the host, and paste of an image copied in a browser or a paint program, in Chrome, Firefox and Safari | not testable with Playwright's synthetic events; Insert > Picture... always works |
| P1 | a picture on a line with 1.5 or double line spacing (auto): is the whole line (picture included) scaled, leaving a big gap above the picture? | the line is as high as the picture plus the text's descent; multiple spacing adds only to the text part (`ParaSpace.lineBox`), so no extra gap |
| P2 | a picture in a run raised or lowered (`w:position`, superscript / subscript) | the baseline shift is ignored: the picture's bottom is on the baseline (`dy` 0); a subscript run still deepens the line under it |
| P3 | a JPEG with an EXIF orientation (a phone photo taken upright) inserted or opened: does Word turn it? Is its natural size (Reset size, insert) the turned one? | the bitmap is decoded with the browser's default (`imageOrientation: 'from-image'`, turned), but `naturalEmu` and the decode size (`decodeSize`, from the SOF) take the stored, unturned width and height, so a turned photo can come out squashed; decide in Word, then set `imageOrientation` (or swap the sides for orientations 5-8) |
| P4 | a resize drag ending exactly where it began, then Ctrl-Z: is there an undo step in Word? | none: the extent is compared by value, no step, no `*` |
| P5 | an edge (`e`) drag on a picture wider than the column | the file's width is scaled by the box's change; Word shows pictures at their own size, !Letters fits them to the column (plan R3), so a picture still wider than the column is shown narrower and taller than the ghost |
| P6 | a picture pasted within one document keeps its `wp14:anchorId` / `wp14:editId` (only `wp:docPr id` is made fresh), so two drawings share them; a picture pasted into another document may get `xmlns:wp14` on its `w:drawing` while the root's `mc:Ignorable` does not list `wp14`: does Word (2010 and later know wp14) open both without a repair and keep both pictures? | duplicates kept; the namespace declared where it is used |

### To check in real Word (table styles, Batch C task C2.2)

Open questions for TB4 (`tbl-4-styles.docx`, written by C7's hand-off): what `TblCond.condsOf` does is a reading of
D16, not yet compared with Word.

| | question | what !Letters does |
|---|---|---|
| TB4a | the corner cells (`nwCell`, `neCell`, `swCell`, `seCell`) | a corner applies only when both its flags are on (nwCell: firstRow and firstColumn; neCell: firstRow and lastColumn; swCell: lastRow and firstColumn; seCell: lastRow and lastColumn) |
| TB4b | themed colours in a table style (Grid Table 4 Accent 1: `w:color="45B0E1" w:themeColor="accent1" w:themeTint="99"`) | shown in the literal colour written beside the theme; the tint or shade is ignored, so the colour may differ slightly from Word's |
| TB4c | banding next to the last row / last column | the last row and last column are NOT left out of the bands (only the header row and first column are, when on); their own formatting comes later in D16's order and wins where both give a value |
| TB4d | `firstRow` and repeated header rows (`tblHeader`) | `firstRow` formats row 0 only |

### To check in real Word (table borders, Batch C task C2.5)

Open questions for TB3 (`tbl-3-borders.docx`) and TB4: `TblBorders` and `TblConflict` are readings of D22 and
ECMA-376 17.4.66, not yet compared with Word.

| | question | what !Letters does |
|---|---|---|
| TB3a | which conditional part gives a cell side | the latest condition (D16's order) whose `tcBorders` gives the side wins; a side between two cells of the same condition is that part's `insideH` / `insideV` |
| TB3b | a table's direct `tblBorders` against a style's conditional `tcBorders`; likewise a table's direct `tblCellMar` against a style's conditional `tcMar` (C2 review M4) | the style's conditional part wins over the table's direct table-level value, for borders AND cell margins (D22: tcBorders, then conditional/style tcBorders, then the table's; margins: `tcMar`, the layer's `tcMar`, `tblCellMar`, the style's: `TblItems` `marginsOf`). D16's general order would put direct tblPr after the conditional parts: one Word check settles both |
| TB3c | cell spacing | each cell draws its four sides inside its box from `tcBorders`, else the style's, else the table's `insideH` / `insideV` (all four sides); the table's `top` / `left` / `bottom` / `right` are its outer box |
| TB3d | a vertically merged cell's sides | each row's part uses its own `w:tc`'s `tcBorders`; the bottom of the merge is the last continue cell's |
| TB3e | the `thinThickThin` families' weight | counted as 2 lines, like the other thinThick families (D22) |
| TB3f | a direct cell `w:shd` of `clear` with no fill | it replaces the style's shading of that cell (nothing drawn) |
| TB3g | ECMA-376 17.4.66's further tie-breaks (a per-style "border number", more colour comparisons before the position rule; C2 review M11) | D22 literally: weight (eighths x lines), D22's style list, the darker colour (R+B+2G), then the cell above / to the left. The fixture should hold thick 12 against double 6, and red against blue (equal R+B+2G) |

### To check in real Word (table layout, Batch C tasks C2.3 and C2.4)

Readings of D18 / D19 / R24 made while laying tables out (`TblGrid`, `TblWidth`, `TblItems`, `TblLayout`), not yet
compared with Word. TB7 and TB8 are the spec's fixtures; the rest go in C7.2's hand-off.

| | question | what !Letters does |
|---|---|---|
| TB7a | D18 step 2: a column's width from the cells' `tcW` | the WIDEST `tcW` of the column's single-span cells; cells with a `gridSpan` > 1 give no width and no min width; the auto columns share what is left equally, each raised to its min width (the others are not shrunk, so the table may be wider than `tblW` / the text until steps 3 and 4) |
| TB7b | a `tcW` of 0 or less (`-5`) | counted as auto |
| TB7c | the autofit min width | the widest word of the cell's paragraphs measured at the page's styles (not the cell's derived ones); a nested table counts 0; a word split over runs is measured in pieces |
| TB8a | a `vMerge` continue cell under a cell of different columns (`c0..c1`) | it joins the merge above only when the cell above spans the SAME grid columns; otherwise it starts a merge of its own (restart) |
| TB6a | `jc` center / right with a `tblInd` | when the table fits its column, `jc` places it and `tblInd` is ignored; a wider table (or `jc` left / start / none) is shifted by `tblInd` |
| TB24a | `tblCellSpacing` (C2 review M3) | each cell box is inset by the spacing on its left and right only: 2x the spacing between cells across, 1x at the table's edges; the table does not grow, and rows are not separated vertically (the `own` borders of cells one above the other touch). D18 says "around every cell" |
| TB24b | the R24 row cap (2112 px) | applies to the `trHeight` value only; a row whose content is taller grows past it (capping would hide text) |
| TB24c | a `trHeight` of 0 or less, or `hRule="auto"` | ignored, whatever its rule |
| TB24d | a vertical merge whose last row is `exact` | the merged cell is clipped to the rows it spans; the row does not grow |
| TB24e | the conditional layer of a cell that spans columns | its own row's, at grid column `c0`, except: a cell reaching the last column gets lastCol, one starting at column 0 firstCol (firstCol wins for a cell spanning the whole row); a merged cell uses its top row's, continue cells their own row's |

### To check in real Word (table structure commands, Batch C4)

Readings made by C4.1 to C4.4, not yet compared with Word (for C7.2's hand-off):

| | question | what !Letters does |
|---|---|---|
| TBC4a | `tblHeader` on inserted rows (D23 read) | the new rows keep `tblHeader` only inside the header run (above a header row, or below a header row whose next row is also a header row); D23 literally says "below a non-header row" drops it, and so does our reading below the LAST header row |
| TBC4b | inserting a row below a vertical merge's last row, and above its restart | the merge grows only when the new row is strictly inside it (between two of its rows: `continue`); below its last row (Tab in the last cell too) and above its restart the new cell has no vMerge (C4 fix wave ruling). Insert rows with the caret in a merged cell acts on the caret's row only, not all the merge's rows |
| TBC4c | marks (bookmarks) of deleted rows, columns and merged cells | move to the next row's lead (cell's lead), else the table's (row's) tail: a pair is never broken, one wholly inside goes with the cells; Word's behaviour is unchecked (also the guide) |
| TBC4d | a column inserted beside a vertical merge; a caret in a merged cell | the new cells are plain (no vMerge: a copied `continue` under a plain cell would be a broken merge); a caret in a gridSpan-2 cell counts both columns (insert adds 2, delete removes 2) |
| TBC4e | TB12: a column inserted into a table as wide as the text | scaled back to the old total (integers, remainder to the largest fractions, every dxa tcW scaled); the container is the layout's column at the table; `tblW` dxa follows the grid when not scaled and on delete. `wBefore` / `wAfter` are not adjusted |
| TBC4f | TB13: merge cells content | the SHOWN cells' paragraphs in flow order, a cell that is one empty paragraph adding nothing; the hidden (vMerge continue) cells' content is NOT merged in but stays hidden in their row's continue cell; the shown cells' leads go with their content to the merged cell's lead (a pair left end-first: its start moved there too); tcPr from each row's first cell; tcW summed (all dxa) else dxa of the grid widths |
| TBC4g | TB14: split cell | content stays in the first new cell; columns beyond the span add equal-width lines to the grid, keeping the old lines (Word may move them); rows must divide a merged cell's height (Word's box may allow others); several selected cells are merged first ("Merge cells before split"); new rows copy `trPr` including `trHeight`; hidden content of a divided vertical merge's group tops becomes visible |
| TBC4h | Distribute rows and columns evenly | columns: equal integer widths over the selection's total, remainder to the last, every touched cell `tcW` dxa (whatever type it was); rows: `trHeight` atLeast = the tallest row's laid-out height; with only a caret the whole table, as Word |
| TBC4i | Split table, Ctrl-Shift-Enter | rows from the caret's row become a second table (fresh id, same `tblPr`), an empty paragraph between; row 0 puts a paragraph BEFORE the table (Word's first-row case); a merge across the cut restarts; outside a table it beeps (Word inserts a column break) |
| TBC4j | Insert > Table (D27, D31) | `tblStyle` TableGrid with Normal Table added to the style table once (Word's definitions); `tblW 0 auto`, `tblLook 04A0`, grid = text width / columns (remainder in the last), `tcW` dxa; Fixed width writes `tblLayout fixed`, the width being that of EACH column; the cells copy the caret paragraph's whole pPr (a list item's `numPr` too: TB9); an empty paragraph keeps a table off a container's end and off another table; a document with no style table gets direct six-side `tblBorders` |
| TBC4k | CTRL-Tab | a browser may keep it for its own tabs; the Tab item of the Table and Insert menus is the same command (`view.input('\t')`) |
| TBC4l | a percentage-width table (`tblW` / `tcW` pct): insert and distribute columns | the inserted cells get dxa (twips) widths beside the pct ones and the grid grows (`tblW` pct kept); Distribute columns writes every touched `tcW` as dxa. Word may keep pct preferred widths |
| TBC4m | a new row beside a row with exceptions (`w:tblPrEx`: borders, cell spacing) | new rows take `tblPrEx` null (R17), so they may look different from the row they copy; Word copies the template row's exceptions |
| TBC4n | a stray `continue` cell (no merge above it) in a command's table | written `restart` (it reads as one, here and in Word), so no command joins it to a merge |
| TBC4o | Insert > Table with several cells selected | the selection is deleted first (D27): every selected cell is cleared (`RangeTbl`, undoable), then the table is nested in the first cell; Word may instead treat the cells as a caret in the first |
| TBC5a | Table properties: Row height Exactly / At least | `trHeight` `{val, hRule}`; Auto removes the element; a `trHeight` with no `hRule` is read as At least (as `TblItems` draws it) and Word too? the spec's default is auto |
| TBC5b | Alignment | `jc` left / center / right (a Strict document: start / center / end); none reads as Left; does Word move the table by `tblInd` as well when `jc` is not left? (`TblWidth.alignOf` ignores the indent then) |
| TBC5c | Column width on a table with `tblW` dxa and autofit | the grid columns and the tcW of the cells over them are set; `tblW` is not changed, so the layout (`TblWidth` rule 3) scales the columns back to `tblW`: does Word keep the new width and grow the table? |
| TBC5d | Cell width | sets only `tcW` dxa of the shape's cells (and of a merge's continue cells), not the grid: Word's "Preferred width" of a cell is the same field, but its Column width box also moves the neighbour |
| TBC5e | Indent from left | -22 in..22 in (a negative `tblInd` is what Word itself writes, -0.08 in); the box refuses 23 in, never clamps |
| TBC5f | Cell alignment on a merged cell | `vAlign` is written on the top cell and on its continue cells; Word reads it from the top cell |
| TBC5g | widths under 0.02 in | refused with a message (a zero width hides the cell); Word's own minimum is lower |
| TBC5h | Borders and shading, Apply to Cell: an outer side | turned on: written on the selected cells only; turned off: nil on the selected cells and on the neighbours across that edge whose edge lies along the selection's (a wider neighbour is skipped, so its own line may still be drawn there; none with cell spacing); does Word write the neighbours, and what does it do with a wider one? |
| TBC5i | Apply to Cell, a side turned off over the table's or a style's line | `{val: 'nil'}` on both cells; Word may write `none` with `sz 0` instead |
| TBC5j | Apply to Cell / Table, Fill None | the cells' (table's) own `w:shd` removed: a table style's shading shows again (the box shows only the cells' own shading); Word writes `clear` / `auto` / `auto`? |
| TBC5k | Apply to Cell, a new side's `w:space` | 0 (the side's own kept when it had one); Word's table borders use 0 |
| TBC5l | Column edge dragged (plain drag) | the two columns beside the border change, the total stays; the grid and tcW dxa of every cell over them are written (a pct or auto tcW becomes dxa); does Word write the same (and does it touch tcW of cells spanning both columns)? |
| TBC5m | The table's right edge dragged | the last column changes; a dxa or pct tblW becomes dxa of the new total, auto stays: does Word change a pct preferred width to dxa, or keep pct? |
| TBC5n | The drag's limit | the line stops where a column would be under 0.1 in (Word's own limit is smaller, about 0.03 in?) and a column narrower already is left as it is |
| TBC5o | A table shown scaled (tblW with autofit, or a grid the layout could not use) | a drag writes every grid column as shown, so the file then shows the same in Word: does Word rewrite the grid alike? |
| TBC5p | Table properties: lengths compared as shown | a length is compared with the old one to a hundredth of an inch (what the box shows), so an edit smaller than that (149.8 pt typed over 3000 twips) is no change; Word's own box works in its units the same way? |
| TBC5q | Apply to Cell: a line only the neighbour draws | the box shows a side from the cell's own resolved side, so a line drawn by the neighbour's side alone shows as off and leaving it off changes nothing; it is removed from the neighbour (select it). Does Word show it on? |
| TBC5r | Apply to Table with None (or All) | writes `tblBorders` only and keeps every cell's own `tcBorders`, so for a table whose cells all carry their own lines (LibreOffice and many generators write them) nothing visible changes, yet it takes an undo step; does Word's Apply to: Table clear the cells' own borders? |
| TBC6a | A table pasted over a cell rectangle (TB15) | the pasted cells overwrite the rectangle's cells from its top-left by grid position; a hidden vMerge continue cell of the target, and a pasted continue cell, give nothing (the cell keeps its text); the cells keep their own properties (width, borders, shading); a bookmark that starts (ends) in an overwritten cell and ends (starts) elsewhere keeps its start at the start of the first cell overwritten (its end at the end of the last), so the pair is never reversed (C6 fix B3; Delete over cells the same): does Word's "Overwrite cells" take the pasted cells' formatting too, fill a merge, and where does it keep such a bookmark? |
| TBC6b | After overwriting cells | the caret goes to the end of the last cell overwritten (Word selects the pasted cells?) |
| TBC6c | A table pasted where it would be nested deeper than 8 | its text: a paragraph per row, cells joined by tabs, the first row joined to the caret's paragraph as pasted paragraphs are (Word: refuses, or pastes text?) |
| TBC6d | A table style copied from another document whose id the target gives another style | the copy gets the first free of `<id>1`, `<id>2`...; a name the target gives a style of another type: not copied, the table gets the default table style (Word: renames the style?) |
| TBC6e | A table pasted at the start of a paragraph that follows a table | an empty paragraph goes between the two tables (as Insert > Table): Word joins two tables that touch |
| TBC6f | An HTML table pasted from a browser, Google Docs and Excel, and a Word table copied in Word and pasted into !Letters (TB17) | spans as gridSpan / vMerge, widths from the HTML (else equal shares of the text width), shading, any border style a single 4 border on all four sides of that cell, no table style; does Word give the same widths, borders and merges? |
| TBC6g | A table copied in !Letters and pasted into Word as HTML (TB17) | `<table>` with colspan / rowspan, widths in pt, a 1px solid border on cells that have one, shading; the table style's conditional formatting (banded rows, header row) is not in the HTML: does Word show it as !Letters does? |
| TBC6h | Table to text with some rows selected | the WHOLE innermost table is converted; Word converts the selected rows |
| TBC6i | Text to table, a row with more pieces than Columns | the extra pieces are joined into the last cell WITH their separators (nothing lost); does Word make more columns, or cut? |
| TBC6j | Text to table, a field the table would cut (a `fldChar` begin and end in different pieces, rows or cells: a separator inside it, a field over several paragraphs such as a table of contents, any separator; or a selection starting or ending inside a field) | refused with a message (C6 fix B2); Word cuts the field? |
| TBC6l | Table to text of a table whose vMerge continue cell holds content (Word does not show it) | that content follows the row's paragraph (paragraphs, pictures, comment ranges, a nested table converted); paragraphs of bookmark marks only go with the row; empty paragraphs go (C6 fix B5, C6b M3): does Word keep or drop it? |
| TBC6m | Text to table of list paragraphs: the padding cells of a short row and empty pieces | an empty cell is in no list (no numPr: no label, the numbering not shifted); the text cells keep the paragraph's list (C6 fix B5, C6b M6): does Word number the cells? |
| TBC6n | A Transitional table pasted into a Strict document | keeps `tblLook w:val`, `cnfStyle w:val`, `textDirection btLr`, `w:left` / `w:right` in copied table styles' raw borders and margins, as Word 2010's own Strict files do (C6a M1): does Word open such a file without repair? |
| TBC6o | A table holding a content control (`w:sdt`) in a cell copied to another document | the content control (and any kept block in a cell) is left out (C6a M4): what does Word carry? |
| TBC6k | The separator in Table to text, and a table nested in the table | the separator takes the character format of the text before it; a nested table is converted first with the same separator and its paragraphs come where it stood; a cell's paragraphs stay together in file order (its second paragraph starts a new paragraph that the next cell's text continues: the final fix wave's ruling, so bookmarks never reorder); Opaque or kept blocks among the paragraphs refuse Text to table: does Word agree on each? |

### To check in real Word (tables, consolidated)

The index of every table question recorded while Batch C was built (the spec's TB1..TB26 and the readings TB3a..,
TB4a.., TB6a, TB7a.., TB8a, TB24a.., TBC4a.., TBC5a.., TBC6a.. in the detailed tables above, which stay the place for
what !Letters believes), each with the hand-off file it is asked of. TBX1..TBX3 are the known limits recorded at hand-off
(Find into a hidden merged cell, the row zone of a merge, the right-edge drag of a centred table). A question that
two rows ask alike (TBC4e is TB12, TBC4f is TB13, TBC4g is TB14, TBC5l and TB18) shares its file. Two files have no
question of their own: `tb-7b-nested-edits.docx` (Tab in a nested table, an outer row holding a nested table deleted)
and `tb-12-hostile-but-valid.docx` (63 columns, nesting 8) are covered by the smoke test that opens the PRIORITY list
(every file opens with no repair prompt, its word counts as INDEX.txt says).

The files are made by `node tests/moreapps/handoff-tables.mjs` (local, git-ignored, like the earlier batches): with
!Letters' own commands (Insert > Table, the row, column, merge, split, distribute, drag, Table properties, Borders and
shading, paste and Convert commands) on fixtures, and from Word-made tables of the local corpus (`tb-13-*`, `tb-1b`,
skipped with a note when the corpus is absent). Each file is written, linted, read back and every block checked, so
that all of them open again in !Letters. `tb-README.txt` has, for every id, the file, the steps in Word, the question and
what !Letters does now, and lists the tables !Letters wrote; `INDEX.txt` (from `handoff-index.mjs`, a Batch C block) has the
files in session order with the word counts and table counts !Letters shows. Smoke test first: open EVERY file once and
note any repair prompt. "(No file)" questions are made in Word, or in !Letters, on any table. 98 questions, 9 with no file. They are too many for one session: `tb-README.txt` opens with a PRIORITY list of
15 checks (anything that could give a repair prompt or an "unreadable content" message first: Strict spellings, Insert >
Table output, duplicate or odd properties, `tblLook` and `cnfStyle`, nil against none borders, merged-cell structures,
nested tables, convert output, pasted tables, copied styles, bookmark placement) and marks every other question "if time
allows"; `INDEX.txt` repeats the order (`PRIORITY` in `handoff-tables-q.mjs`).
TB24c's `hRule="auto"` half is in `tb-4-widths.docx` (Table 16, row 2: 1 inch with the rule auto). Per OOXML an auto
rule means the height is the content's, so the layout ignores the `trHeight` (D19 names atLeast, no rule and exact only);
`tables-layout-corpus.test.mjs`, which scans the hand-off folder too, now agrees (C7.3 fixed the TEST: it counted an auto
rule's height). Word's own reading of a `trHeight` without any `hRule` (!Letters: atLeast) is part of the same question.
The shared helpers are `handoff-tables-lib.mjs` (fixtures, `put`, `save`), `-a`, `-b`, `-c` (the files), `-corpus`
(the Word-made tables) and `-q` (this list; `node tests/moreapps/handoff-tables.mjs --word-md` prints the table).

| | file | question |
|---|---|---|
| TB1 | `tb-13-roundtrip-merged.docx`, `tb-13-roundtrip-nested.docx`, `tb-13-roundtrip-styled.docx` | three Word-made corpus tables (merged cells, nested, styled) read and written by !Letters, untouched |
| TB2 | `tb-1-insert.docx`, `tb-1b-existing.docx` | Insert > Table 3x4 in a new and in an existing document |
| TB3 | `tb-5-borders-shading.docx` | neighbours with single 4 / double 6 / thick 12 / dotted 24, colours, nil |
| TB3a | `tb-6-styles.docx` | which conditional part gives a cell side |
| TB3b | `tb-6-styles.docx` | a table's direct `tblBorders` against a style's conditional `tcBorders`; likewise a table's direct `tblCellMar` against a style's conditional `tcMar` (C2 review M4) |
| TB3c | `tb-5-borders-shading.docx` | cell spacing |
| TB3d | `tb-5-borders-shading.docx` | a vertically merged cell's sides |
| TB3e | `tb-5-borders-shading.docx` | the `thinThickThin` families' weight |
| TB3f | `tb-5-borders-shading.docx` | a direct cell `w:shd` of `clear` with no fill |
| TB3g | `tb-5-borders-shading.docx` | ECMA-376 17.4.66's further tie-breaks (a per-style "border number", more colour comparisons before the position rule; C2 review M11) |
| TB4 | `tb-6-styles.docx` | Word's Grid Table 4 / List Table 3 with tblLook combinations (header row, first column, banded rows/columns, last row/column off and on) |
| TB4a | `tb-6-styles.docx` | the corner cells (`nwCell`, `neCell`, `swCell`, `seCell`) |
| TB4b | `tb-6-styles.docx` | themed colours in a table style (Grid Table 4 Accent 1: `w:color="45B0E1" w:themeColor="accent1" w:themeTint="99"`) |
| TB4c | `tb-6-styles.docx` | banding next to the last row / last column |
| TB4d | `tb-6-styles.docx` | `firstRow` and repeated header rows (`tblHeader`) |
| TB5 | `tb-6b-compat14.docx`, `tb-6c-compat15.docx` | a table style with sz 9 and jc center over Normal 11 left, compat mode 14 and 15; tblLook hex vs booleans disagreeing |
| TB6 | `tb-6b-compat14.docx`, `tb-6c-compat15.docx` | tblInd 0 and 720 with cell margins 108 / 0, compat 14 vs 15 |
| TB6a | `tb-4-widths.docx` | `jc` center / right with a `tblInd` |
| TB7 | `tb-4-widths.docx` | generated tables with no usable grid, tcW pct/auto/dxa mixes |
| TB7a | `tb-4-widths.docx` | D18 step 2: a column's width from the cells' `tcW` |
| TB7b | `tb-4-widths.docx` | a `tcW` of 0 or less (`-5`) |
| TB7c | `tb-4-widths.docx` | the autofit min width |
| TB8 | `tb-3-merge-split.docx` | vMerge continue in the first row, a span past the grid, gridBefore/After ragged rows |
| TB8a | `tb-3-merge-split.docx` | a `vMerge` continue cell under a cell of different columns (`c0..c1`) |
| TB9 | `tb-2-rows-cols.docx` | a row added by Tab in the last cell |
| TB10 | (No file) | Backspace at the start of the paragraph after a table, Delete at the end of the one before (empty and not) |
| TB11 | (No file) | typing, Delete, Backspace with 2x2 cells selected; Backspace with whole rows |
| TB12 | `tb-2-rows-cols.docx` | a column inserted in a full-width table |
| TB13 | `tb-3-merge-split.docx` | 2x3 merged with text in 4 cells |
| TB14 | `tb-3-merge-split.docx` | split a plain cell 2x2 and a merged cell 3x1 |
| TB15 | `tb-8-pasted.docx`, `tb-8-source.docx` | a table pasted into a cell (nested) and over a 2x2 rectangle (overwrite) |
| TB16 | `tb-9-convert.docx` | text to table by tabs/commas, a table with a two-paragraph cell to text |
| TB17 | (No file) | an HTML table with colspan/rowspan pasted from a browser, and a Word table copied in Word and pasted into !Letters (and back) |
| TB18 | `tb-4-widths.docx` | column boundary dragged; row height dragged |
| TB19 | `tb-4-widths.docx` | an exact row height shorter than its text |
| TB20 | `tb-14-floating-bidi.docx` | a floating table after !Letters edited inside it |
| TB21 | `tb-14-floating-bidi.docx` | bidiVisual and textDirection btLr cells after editing |
| TB22 | (No file) | Ctrl-Enter and a section break asked for in a cell |
| TB23 | `tb-14-floating-bidi.docx` | rows with tblPrEx (row-level borders) |
| TB24 | `tb-10-strict.docx` | Strict document, table inserted and borders set |
| TB24a | `tb-5-borders-shading.docx` | `tblCellSpacing` (C2 review M3) |
| TB24b | `tb-4-widths.docx` | the R24 row cap (2112 px) |
| TB24c | `tb-4-widths.docx` | a `trHeight` of 0 or less, or `hRule="auto"` |
| TB24d | `tb-4-widths.docx` | a vertical merge whose last row is `exact` |
| TB24e | `tb-6-styles.docx` | the conditional layer of a cell that spans columns |
| TB25 | `tb-3-merge-split.docx` | delete a column crossing a gridSpan and a row holding a vMerge restart |
| TB26 | `tb-11-bookmarks.docx` | a bookmark spanning rows (marks between rows) after a row delete |
| TBC4a | `tb-2-rows-cols.docx` | `tblHeader` on inserted rows (D23 read) |
| TBC4b | `tb-2-rows-cols.docx` | inserting a row below a vertical merge's last row, and above its restart |
| TBC4c | `tb-11-bookmarks.docx` | marks (bookmarks) of deleted rows, columns and merged cells |
| TBC4d | `tb-2-rows-cols.docx` | a column inserted beside a vertical merge; a caret in a merged cell |
| TBC4e | `tb-2-rows-cols.docx` | TB12: a column inserted into a table as wide as the text |
| TBC4f | `tb-3-merge-split.docx`, `tb-11-bookmarks.docx` | TB13: merge cells content |
| TBC4g | `tb-3-merge-split.docx` | TB14: split cell |
| TBC4h | `tb-4-widths.docx` | Distribute rows and columns evenly |
| TBC4i | `tb-2-rows-cols.docx` | Split table, Ctrl-Shift-Enter |
| TBC4j | `tb-1-insert.docx` | Insert > Table (D27, D31) |
| TBC4k | (No file) | CTRL-Tab |
| TBC4l | `tb-2-rows-cols.docx` | a percentage-width table (`tblW` / `tcW` pct): insert and distribute columns |
| TBC4m | `tb-2-rows-cols.docx` | a new row beside a row with exceptions (`w:tblPrEx`: borders, cell spacing) |
| TBC4n | `tb-3-merge-split.docx` | a stray `continue` cell (no merge above it) in a command's table |
| TBC4o | `tb-7-nested.docx` | Insert > Table with several cells selected |
| TBC5a | `tb-4-widths.docx` | Table properties: Row height Exactly / At least |
| TBC5b | `tb-4-widths.docx`, `tb-10-strict.docx` | Alignment |
| TBC5c | `tb-4-widths.docx` | Column width on a table with `tblW` dxa and autofit |
| TBC5d | `tb-4-widths.docx` | Cell width |
| TBC5e | `tb-4-widths.docx` | Indent from left |
| TBC5f | `tb-3-merge-split.docx` | Cell alignment on a merged cell |
| TBC5g | (No file) | widths under 0.02 in |
| TBC5h | `tb-5-borders-shading.docx` | Borders and shading, Apply to Cell: an outer side |
| TBC5i | `tb-5-borders-shading.docx` | Apply to Cell, a side turned off over the table's or a style's line |
| TBC5j | `tb-5-borders-shading.docx` | Apply to Cell / Table, Fill None |
| TBC5k | `tb-5-borders-shading.docx` | Apply to Cell, a new side's `w:space` |
| TBC5l | `tb-4-widths.docx` | Column edge dragged (plain drag) |
| TBC5m | `tb-4-widths.docx` | The table's right edge dragged |
| TBC5n | (No file) | The drag's limit |
| TBC5o | `tb-4-widths.docx` | A table shown scaled (tblW with autofit, or a grid the layout could not use) |
| TBC5p | (No file) | Table properties: lengths compared as shown |
| TBC5q | `tb-5-borders-shading.docx` | Apply to Cell: a line only the neighbour draws |
| TBC5r | `tb-5-borders-shading.docx` | Apply to Table with None (or All) |
| TBC6a | `tb-8-pasted.docx` | A table pasted over a cell rectangle (TB15) |
| TBC6b | `tb-8-pasted.docx` | After overwriting cells |
| TBC6c | `tb-8-pasted.docx` | A table pasted where it would be nested deeper than 8 |
| TBC6d | `tb-8b-style-clash.docx` | A table style copied from another document whose id the target gives another style |
| TBC6e | `tb-8-pasted.docx` | A table pasted at the start of a paragraph that follows a table |
| TBC6f | (No file) | An HTML table pasted from a browser, Google Docs and Excel, and a Word table copied in Word and pasted into !Letters (TB17) |
| TBC6g | `tb-8-source.docx` | A table copied in !Letters and pasted into Word as HTML (TB17) |
| TBC6h | `tb-9-convert.docx` | Table to text with some rows selected |
| TBC6i | `tb-9-convert.docx` | Text to table, a row with more pieces than Columns |
| TBC6j | `tb-9-convert.docx` | Text to table, a field the table would cut (a `fldChar` begin and end in different pieces, rows or cells: a separator inside it, a field over several paragraphs such as a table of contents, any separator; or a selection starting or ending inside a field) |
| TBC6k | `tb-9-convert.docx` | The separator in Table to text, and a table nested in the table |
| TBC6l | `tb-9-convert.docx` | Table to text of a table whose vMerge continue cell holds content (Word does not show it) |
| TBC6m | `tb-9-convert.docx` | Text to table of list paragraphs: the padding cells of a short row and empty pieces |
| TBC6n | `tb-10-strict.docx` | A Transitional table pasted into a Strict document |
| TBC6o | `tb-8c-content-control.docx`, `tb-8-source.docx` | A table holding a content control (`w:sdt`) in a cell copied to another document |
| TBX1 | `tb-3-merge-split.docx` | Find, Replace and Go to (a bookmark) reaching text in the hidden part of a cell merged down |
| TBX2 | `tb-3-merge-split.docx` | a click in the row zone of a row that a vertical merge crosses |
| TBX3 | `tb-4-widths.docx` | the right edge of a centred or right-aligned table dragged |

## Known limitations and deferred items

Tables (Batch C, after C1; to settle in the deliverable named)

* **Known limits recorded at hand-off (C7 fix A4).** Find, Replace and Go to (a bookmark) can reach text in the
  hidden part of a cell merged down (a `vMerge` continue cell, which Word does not show either): the match is selected
  in a cell nobody sees (the C7.1 concern 5, re-review m2). An HTML `style` attribute over 64 KB on the clipboard
  (`ClipDom.MAX_ATTR`) is ignored whole, so a `font-weight:bold` before a long `data:` URL in it is lost (the C6 fix
  re-review M-1). The paragraph cap's refusal now names itself ("it has more than 200,000 paragraphs, the most !Letters
  opens"), for paragraphs in cells too; the other `unsupported` causes keep the generic message.

* **Bookmarks and table deletions (C3b M1, M2).** Clearing cells (Delete, typing or Backspace over `cells`) and the
  row deletion of a `mixed` range keep only the marks of the cleared paragraphs (`SelShape.paraRanges`): marks inside
  a kept block in those cells (a content control holding a `bookmarkStart`) and the marks between a NESTED table's rows
  and cells go with them, and their partners outside are left alone (unpaired). A table a deletion takes WHOLE (a
  range covering it, its two edges, Backspace over every cell) keeps its pairs since the C7 fix wave (A2): its marks
  at every depth, loose ones too (`BookmarkKeep.tableMarks`), whose partner stays go to the caret; marks inside an
  Opaque block go with it. TB rows for C7.2.
* **Rules for table commands (C3b M5, M7; kept by every C4 command).** `TblGrid`'s reuse of a grid (`copied` / `sameShape`) relies on identity: a command must never
  change a `tcPr` or `trPr` (or the grid array) in place, only make new ones. `TblCmd.onTable` and `RangeOps.putPara`
  scan every id of the document (`reserveIds`) once per command: keep them off any per-keystroke path.
* **Table structure commands (Batch C4).** Deleting every row (or column) of a table, and Delete > Table, keep a
  bookmark with one end in the table and the other outside it: that end goes to the caret after the table
  (`TblRemove`, the final fix wave: final-1 I1; before, it was lost); marks in a nested table's loose positions inside deleted rows are
  lost (M1), and so are bookmark marks inside an Opaque block (a form field, a content control) of a deleted row or
  column: they are invisible to `marksIn`, so their in-paragraph partner is moved as unpaired and left an orphan
  (`poi/form_footnotes.docx`: `Text34`'s orphan `bookmarkEnd` in the next row's lead; Word ignores an orphan end).
  `wBefore` / `wAfter` are kept as they are when `gridBefore` / `gridAfter` change (delete columns can leave a
  `wBefore` with no `gridBefore`; a dxa one is not scaled with the count). Split table of a 1000 x 63 table takes
  about 128 ms (two id scans; the other commands about 35 ms there; no D20 budget). `splitCell` on a row wider than the
  file's grid writes the widened grid, as `insertCols` does. The Insert table box takes 1..1000 rows though the
  command takes 32767 (R16). A `mixed` selection (text across the table's edge) shades the whole Table menu: it has no
  rectangle. The Table menu's Convert items and copying cells came with C6 (below). User guide: `$.Docs.Letters` part 10.
  Merging cells when a bookmark's END is in the lead of a shown cell of the rectangle (before its first paragraph)
  puts that end in the merged cell's lead, and the pair's start is put before it (`TblPairs.inOrder`): the bookmark
  is kept but marks nothing (its text is not lost, but no longer marked; none in the corpus; the C4 review's N1).
* **Clipboard and conversion (Batch C6).** The exact route (`ClipStore`) is bounded at 100,000 blocks and 5,000,000
  text units counted at every depth, so a 1000 x 63 table fits once (63,001 walked blocks), two do not (they paste
  from HTML or text). `ClipHtmlTable` returns null over the HTML room, so a table is never cut short (the copy is then
  text only). HTML in reads only what `ClipReadTable` and `ClipTblLook` list (colspan, rowspan, width, bgcolor,
  border, style), never `mso-` styles, and flattens (a paragraph a row, tabs) a table past 63 columns, 1000 rows, 8
  deep, 63,000 cells in all, the node or text budget, or with stray content between its rows. The table style's
  conditional formatting is not in the HTML out. A raw property element that the target reads as a field becomes
  that field (C6 fix B4); what is raw in both keeps its spelling. A Transitional table pasted into a Strict document
  keeps Transitional spellings Word 2010's own Strict files also hold (C6a M1, TBC6n): `tblLook w:val`, `cnfStyle
  w:val`, `textDirection w:val="btLr"`, and `w:left` / `w:right` in a copied table style's raw `tblBorders` and
  `tblCellMar` (`NumClean.cleanEl` renames only `ind`, `jc` and `pBdr`). A `cnfStyle` in a cell paragraph's pPr is
  dropped. A content control (`w:sdt`) or any other kept block in a cell is left out when the table goes to another
  document (C6a M4: 23 corpus files have one; kept blocks across documents are skipped, as at top level; the user
  guide says so; TBC6o). A paste over cells overwrites only
  for exactly one table block (a mixed paste over cells clears them and inserts). Table to text converts the whole
  innermost table, not the selected rows (TBC6h). Text to table works on top-level paragraphs only (a selection with
  an end in a cell is refused); `Convert >` opens only when live (a shaded submenu does not open). Plain text of a
  cell that ends with a nested table and an empty paragraph ends with a space (`Walk.flatText`'s rule).
* **Column edges dragged (C5.3).** The widths written are what is shown: for a table the layout scales (a dxa or pct
  tblW with autofit, an unusable grid) every grid column is rewritten to its shown width, not only the two dragged.
  A border inside a nested table is taken before the cell border round it, unless the outer border is nearer to the
  press (C5 fix M1). The right edge's dashed line assumes the table's left edge stays: for a centred or right-aligned
  table (`jc`) the edge drawn after the drag is elsewhere (a centred one moves half as far, a right-aligned one not at
  all; the C5 review's M4). The press point, the item and its top are read once at the press: a zoom change or a
  relayout (a window resize) during a drag leaves the dashed line where the old geometry puts it (the command itself
  is safe: it is keyed by the table object); a border drag does not scroll the window (a text drag does); every
  mouse move redraws the whole window, as a picture drag does (no layout runs; M7, M8). A pointer-cancel (the browser
  taking the gesture) ends the drag like a release and puts the change in: the core's `wimp.drag` reports no cancel
  (the drop has no flag; `startPointerDrag` sends `pointercancel` to `onEnd`), so !Letters cannot tell (M6; PicDrag the
  same). A window closed during a drag ends it without a beep (M7).
* **Rows dragged (C5.4, C5 fixes).** A row stops at 0.01 in (`TblEdge.MIN_ROW_PX`, 15 twips): a val of 0 is no height
  at all (`TblItems` reads `val > 0`), so an exact row would lose its rule. A row border inside a vertically merged
  cell (where no line is drawn) is not a row edge; beside the merge it is (M2).
* **Zones (C3a m5, m6).** A click in the row zone of a row that a vertical merge crosses selects every row of the
  merge (the `cells` rectangle grows over merges, D10); Word highlights just the row. The column zone of a table
  directly below another table never fires (the 4 px above it are inside the upper table), and a drag that starts
  in a column zone does not extend across columns (the pointer above the table hits the paragraph before, so the
  selection becomes `mixed`).
* **`cellTabTarget`'s `'last'`** (C3a m4) means "no cell further that way" for both keys: Tab in the last cell and
  Shift-Tab in the first. Settled in C4.1: `EditKeys` adds a row only for Tab (`id === 'tab'`), and `tabRowCmd`
  itself checks `cellTabTarget(doc, sel, 1) === 'last'`.
* **Inserting a picture in a cell (settled in the C3 fix wave).** It is sized to the cell's text width from the
  window's layout (`InsertPicture.insert(d, sel, {bytes, L})`); for a `cells` selection the width is that of the
  selection's first end's cell (the picture goes into the top-left cell, which may be another width).
* **Silent top-level fallbacks (settled in C3.5).** `WordCount` with a selection end in a cell now counts the
  selection (`SelShape.covered`); `FormatPaint.pick` picks in a cell and `paint` paints there (`touched` through
  `paraRanges`); `AutoList` and `ListMake` choose the list to continue in flow order through cells
  (`ListRestart.listBefore`), as the labels count them. The gate's `exitList('C3.5')` is empty (asserted).
* **findBlock after an edit in a cell (settled in C3.4).** Measured and optimised: a table's rank facts are kept per
  row (`EditRank`), so an edit re-walks only its row (0.05 ms after an edit in a 1000 x 5 table). D20 holds (the
  whole keystroke in a cell, 1.8 ms against 1.0 plain in the browser).
* **Table identity after undo.** Undo of a text op in a cell (and a refused compound or a rolled-back `atomic` group
  that touched a cell) gives a deep-equal but NEW table / row / cell chain (D5). Only a structural `restoreBlock`'s
  inverse gives back the very old table object: C2's layout must not assume undo restores table identity otherwise.
* **Tracked changes inside cell paragraphs type.** A table with tracked changes on its structure or properties
  (`tblPrChange`, `trPrChange`, `tcPrChange`, `tblGridChange`, `cellIns`, `cellDel`, `cellMerge`, `w:ins` / `w:del`
  in `trPr`) stays Opaque (reason `tracked`); tracked changes INSIDE the paragraphs of a typed table (`w:ins` runs,
  `pPrChange`...) are kept as in body paragraphs (raw inlines / `extra`), and the table types. (Owner to confirm.)
* **Cut and paste of a table within one document** drops its bookmarks and comment ranges: the pasted copy has none
  (unique marks are dropped from a copy) and the cut removed the original. Copy and paste leaves them on the original.

Pictures (Batch B)

* A Select click (or Shift-click) within 8.5 screen px of a selected picture's handle, outside the picture over text, is
  used by the picture (a drag may follow): Shift-click there does not extend a text selection (B3 review M3). On a
  small picture in a line of text this covers the neighbouring characters: a click there to put the caret does
  nothing (final review M3).
* Selecting a picture and grabbing a handle within the double-click time gives a double-click (the Picture dialog,
  B6), not a drag, as RISC OS reports clicks (B3 review M4).
* No autoscroll while a picture's handle is dragged near the window's edge (text drags have one) (B3 review M6;
  final review M6).
* A picture inside a hyperlink (`w:hyperlink` holding a `w:drawing`) is drawn as a `[...]` box, kept byte for byte;
  with text in the same link the picture is not shown. Insert > Hyperlink on a selection that holds a picture is
  refused ("A picture cannot be made a link yet.", `LinkFind.linkRange`) (final review I2).
* Typing after a picture taller than the window: the caret is the line's full height and `scrollToCaret` shows its
  top, so the text typed at the baseline is below the window (final review M2).
* On an exactly spaced line the picture is clipped to the line, but its handles and hit rectangle are the whole
  picture's and reach over the lines above (final review M4).
* A lone selected picture is tinted by the selection fill as well as given handles; Word shows only the handles
  (final review M5).
* A Menu (right) click over a picture does not select it, so Format > Picture... stays shaded; Word selects it
  (final review M9).
* A re-decode deferred for room is asked again on every repaint until there is room (with the 1 s timer: a 1 Hz
  repaint while such pictures are in view) (final review M10).
* Closing the window during a handle drag ends the drag with a beep when the button is released (final review M11).
* Hyperlinks have the weakness pictures had before `ClipPics.samePaste` (final review I1): copy a link made by
  Insert > Hyperlink, undo the insert (its relationship goes), paste in the same document, and the pasted
  `w:hyperlink r:id` names no relationship (a later link may take the id). Not fixed.

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
  on the rerun: a flake unrelated to !Letters (it runs its own server on a random port).

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
