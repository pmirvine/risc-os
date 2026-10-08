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
Not there yet: clipboard and find (deliverable 6b), layout and pagination, making
styles and lists, tab stops and margins, printing, tables and images, headers/footers/footnotes, RTF/PDF export and
spell check.

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
disc files as they are). The pure modules never import `'riscos'`; only `!RunImage`, `AppWin`, `DocSave`, `CopySave`, `Replace`, `CloseDoc`, `Quit`, `RecentFiles`, `IconBar`, `EditView`, `EditMouse`, `EditInput`, `EditMenu`, `FormatMenu`, `WinMenu`, `ZoomBind` and `ToolbarBind` (and WimpLib's `Ui/*`) do (`RulerBind` is desktop-bound through `Ui/Ruler` but imports nothing from `'riscos'` itself) (`EditPaint` is handed its canvas) (`Info`'s
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

**Resolution of `'wimplib/<Name>'`** (`resolveWimpLib` in `src/core/jsrun.js`; `docs/CORE_API.md` 11a):

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
| `Ui/Toolbar` | a pane toolbar (desktop) | `new Toolbar({task, parent, height, buttons, menu})`: buttons `{name, kind: action\|toggle\|radio\|popup\|field, sprite, text, help, group, w, gap, validation, maxLen, swatch}` laid left to right (26 px buttons, 22 px popup arrows `gright`), the pane attached with `fitWidth` (buttons past the window's width are cut off); `on(name, fn)` (`{name, kind: 'click'\|'return'\|'escape', button, text}`), `setPressed` (a radio lets the rest of its group out), `pressed`, `setText`, `text`, `shade`, `setSwatch(name, css)` (a bar under the sprite, drawn on the pane's hiDPI canvas), `popupAt(name)` (screen point under the icon), `editing` (the field with the caret), `pane`, `width`, `destroy()` (safe twice; deleting the parent deletes the pane too). Setting a value to what it is changes nothing |
| `Ui/ColourPopup` | a swatch dialogue (desktop) | `colourPopup({task, at, current, allowAuto, onPick, title})` -> the Window: with `at` opened by `wimp.menus.open(win, x, y, {task})` (a click outside closes it), without it a submenu; swatch click, Automatic (`'auto'`) or the hex field + Return pick (menus closed first, then `onPick`); Escape closes; deleted when closed |
| `Ui/SaveQuery` | the Save / Discard / Cancel box (desktop) | `saveQuery({task, title, message, buttons = ['Save', 'Discard', 'Cancel'], enter})` -> Promise of the pressed button's text (`enter`: the button Return gives, with the default border; default the first): a `task.createWindow` box (least code: no template, so the icons can be named `button:<Text>` and `message`; laid out from the button count, the message cut off past the screen's width), centred, with the caret; buttons left to right: the middle ones, the last, the first (at the right, `R6,3` default border; the others `R5,3`); Return = the `enter` button (the first by default), Escape / the close icon = last; one box per task: a question asked while one is open waits (a per-task promise chain) and opens when the one before is answered, each getting its own answer; `promise.win` is its box while open (null while waiting); deleted when it answers, answers the last button if its task deletes it or is gone before a waiting box opens. No `parent` option (the plan's API listed one; omitted: the box is not tied to a window). The core's `query()` has two buttons at most, hence this (no core change). Tested through !Word: `word-close.mjs` |
| `Ui/PaneWheel` | the wheel over a pane (pure) | `forwardWheel(pane, parent)`: the core's `_wheel` scrolls any window under the pointer, so a pane (toolbar `extent.w` 4000, ruler 8000) would slide its own contents; this claims the pane's `wheel` and emits it on the parent first (`ZoomBind`'s Ctrl+wheel takes it there), else scrolls the parent by the same amounts as the core (`requestOpen`, Shift: sideways); the pane's own scroll is put back to 0 on `moved`. `Ui/Toolbar` and `Ui/Ruler` call it. `tests/moreapps/panewheel.test.mjs`, and `word-zoom.mjs` over the real panes |
| `Ui/FontMenu` | a font menu (desktop) | `fontMenu({current, docFonts, onPick, desktop?})` -> Menu: document fonts, Word's, then a `Desktop fonts` submenu (`os.fontreg.families()`), the current one ticked ignoring case; `desktopFonts()` |
| `RulerMath` | a ruler's arithmetic (pure) | `toPx(twips, zoom)`, `toTwips(px, zoom)` (15 twips a px at zoom 1, 96 dpi), `zoomOf` (0.1..5, else 1), `snap(twips, free)` (`SNAP` 90 = 1/16 inch; free: whole twips), `clampTo` (NaN or an empty range: lo), `ticks(from, to)` (every 180 twips from the origin, each end clamped to 100 inches: `{at, size: 1\|2\|3, label}`, labels unsigned inches counted out from the origin both ways, as Word numbers them; the origin itself is `{at: 0, size: 3}` with no label and is not drawn), `indentMarks({left, first, right}, textW)` (`first` down at left + first, `hanging` up and `left` box at left, `right` up at textW - right), `dragIndent(id, at, ind, textW, free)` (Word's markers: `left` moves left and keeps the first-line offset, `hanging` moves left keeping the first line's absolute place, `first` the first line only, `right` the right indent; snapped from the margin each is measured from; clamped: left 0..room - right, first -left..room - left, right 0..room - left, room = textW - `MIN_TEXT` (360); NaN or unknown id: unchanged; whole twips, never -0) |
| `Ui/Ruler` | a ruler pane (desktop) | `new Ruler({task, parent, dy, height, menu, help})`: a pane `attachPane(pane, {dy, h, fitWidth})`, workButton `clickdrag`, hiDPI canvas; `setScale({origin, page, text, zoom, scrollX})` (px in the parent's work area) and `setMarkers([{id, twips, kind: down\|up\|box, help}])` redraw only on a change; ticks from `RulerMath.ticks`, grey outside `text`, darker outside `page`; a Select or Adjust drag pressed within 6 px of a marker (its band: top 40 % down, then up, bottom 20 % box) runs `wimp.drag({type: 'point'})`, emitting `drag` ({id, twips, free}: Shift from `os.input.keysDown`, the grab offset kept) and one `commit` on release (Shift from the release event) wherever the pointer is, then always one `end` ({id}; a drop with no place, as a cancelled pointer could give, gets no `commit` but still the `end`); the client's `setMarkers` redraws during the drag (the Ruler invalidates once when the drag starts and once when it ends, not again on each move); drawn by `Ui/RulerPaint` (`paintRuler(g, ruler)`: desk, page, text, ticks, markers); the dragged marker is filled dark with a dotted line through it; `helprequest` gives the marker's help; `show(on)` (hidden: closed again after every parent `moved`/`opened`, since `attachPane` cannot be undone; shown: reopened at `dy`, `_paneParent` stacking keeps it in front); `dragging`, `paints` (count, for tests), `destroy()` (parent listeners removed, pane deleted; a drag already running ends quietly on release) |
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
| `Ops` | `apply(doc, op) -> inverse`, `applyOwn`; insertBlock, removeBlock, restoreBlock (a paragraph keeping the id of the one it replaces skips the document-wide id scan, so undoing a setProps of 50,000 paragraphs is linear), compound |
| `OpsBlocks` | removeBlocks `{at, count}` and its inverse insertBlocks `{at, blocks}`: many blocks of one section in one op, linear time (ids checked against one Set of the document's ids) |
| `OpsText` | replaceText, spliceText, splitBlock, mergeBlock |
| `OpsProps` | setProps, `mergeProps(base, patch)` |
| `OpsUtil` | `locate paraAt sectionAt idUsed cut join checkRange` |
| `DocEvents` | tiny emitter; one failing listener does not stop the others |
| `Document` | `new Document(doc)`: `apply(op, {coalesce})`, `undo()`, `redo()`, `group(fn, {coalesce})`, `atomic(fn, opts)` (a group that, when fn throws, undoes the ops it applied, records nothing and rethrows; the editing commands run in it), `groupStart/End`, `on('change', fn)`, `canUndo`, `canRedo`, `breakCoalesce()`, `markSaved()`, `stateId` (the current state's serial), `markSavedAt(id)` (state `id` is the saved one: a save that took time; edits made meanwhile stay dirty, undo back to it is clean; no `change` event), `dirty`, `undoDepth`, `maxSteps` (1000), `clearHistory()`, `onListenerError` (details under Operations and undo) |
| `DocHistory` | the undo and redo stacks behind `Document`: serial numbers per state (so `dirty` is "current serial != saved serial"), coalescing by key, `MAX_MERGE` = 128 ops per merged step, the `maxSteps` trim (O(1000) `shift`), `markSaved` (also ends the coalescing run, so the saved state stays reachable by undo), `markSavedAt(id)` (`markSaved` if `id` is current, else only the marker moves). Pure bookkeeping, no access to the Doc |
| `Styles` | `newStyleTable()`, `styleOf`, `resolvePara(styles, para, levelInd?)` (`levelInd`: the list level's indent, a layer between the style chain and the direct `pPr`: style < numbering level < direct, Word's order, attribute by attribute (a level giving only `left` keeps the style's hanging/firstLine; only `hanging` keeps its left); ind `firstLine`/`hanging` are one property: a layer giving one drops the other from lower layers, as Word does; both in one layer: hanging wins), `resolveRun`, `addStyle`, `setDefault`, `ensureBuiltins` |
| `StylesBuiltin`, `StylesMerge` | the built-in styles of a new document; property merging without aliasing |
| `StylesNum` | the numbering of a paragraph's pPr layers: `numberingOf(layers)` -> `{numId, ilvl, ilvlGiven}` or `null` (`ilvlGiven` false: no layer gave an ilvl, `ilvl` 0); `layerNumPr(pPr)` also reads a `w:numPr` kept raw in `extra` (tracked change inside: `w:numId`/`w:ilvl` taken, other children ignored). `Styles.paraNumPr(styles, para)` (styles may be null), `Styles.paraStyleId` |
| `ListNumbers`, `ListLevel`, `NumFormat`, `BulletGlyph` | list labels (pure, display only). `ListNumbers.labels(doc)` -> `Map<paraId, {text, level, numId, indent?: {left?, hanging?, firstLine?}, suff, jc, rPr, bullet, fmt}>` (`indent` carries only the attributes the level's `w:ind` gives; hanging wins over firstLine) in one pass over every section's paragraphs (kept blocks neither count nor restart; 100k paragraphs well under a second): counters per abstractNum (per numId when it names none) continued through the document, so numIds over one abstractNum continue one count (Word); a `startOverride` sets its level's counter the first time that level is counted under that numId (once per numId and level), otherwise a first use or restart gives the level's `start` else 0; a paragraph at ilvl k restarts deeper counters per `lvlRestart` (absent: any higher level; 0 never; n: ilvl below n); `%n` in `lvlText` is counter n-1 in level n-1's format (decimal for `isLgl`; unused counters show their start; other `%` literal), numbering from the style when the paragraph has none, style numbering with no ilvl takes the level whose `pStyle` is the paragraph's style (else 0), missing levels use the nearest defined level below (`ListLevel.levelsIn`), numId 0 or unknown: no label; `jc` from `lvlJc` (default left). `lvlText` is read to 255 characters and `numFmt` to 64 (`NumLevel`), and `ListLevel`'s `parse` reads at most 255 template characters (`MAX_TEMPLATE`) once per numId and level (`labelMaker` keeps the parsed template), so hostile templates cost little. Not yet checked in real Word (hand-off): numIds sharing an abstractNum continuing one count and the one-shot `startOverride`; an unused upper level shown as its start in a deeper label (`%1.%2.` with no level-0 paragraph yet: `1.1.`); missing levels taking the nearest level below; the bullet glyph table; the level `w:tabs` is not read (a tab suffix uses the indents only). `NumFormat.formatNumber(n, numFmt)` (decimal, decimalZero, lower/upperLetter `aa` `bb` Word style, lower/upperRoman to 3999 else decimal, ordinal, bullet/none ''; unknown: decimal), `LABEL_CAP` 40, `capLabel`. `BulletGlyph.glyphFor(ch, font)`, `bulletText`: Symbol/Wingdings/private-use bullets as Unicode shapes (U+F0B7 -> U+2022, U+F0A7 -> U+25AA, 'o' -> U+25CB, unknown PUA -> U+2022) |
| `ParaInd`, `FormatList`, `EditList` | editing lists, pure. `ParaInd`: `listOf(doc, para)` -> `{numId, ilvl, fromStyle}` or `null` (the paragraph has a label: numbering in force, a defined numId, a level at or below ilvl; `fromStyle`: its style gives a numId), `numOf`, `levelInd(doc, para)` (the level's indent, worked out for that paragraph alone: equal to the label's `indent`, pinned by a property test), `effPara(res, doc, para)` (`FormatEff` resolver `para(p, levelInd)`), `effective(doc, para, labels?)` -> `{left, first, right}` twips as drawn (style < level < direct). `Format.query` indents, `RulerInd.firstIndents`, `indentBy` (Ctrl-M, the toolbar's buttons) and `dragIndents` start from these, and `FormatPara.explicit` compares with style + level, so a list item's changed indent is written as direct `ind` (Word) and one back at the level's value is removed. `FormatList.setList(d, typing, sel, patch, pending?)` -> `{sel, pending}` over the selected list paragraphs (others skipped): `{by: 1 | -1}` (to the next level the numbering DEFINES in that direction, `ListLevel.levelAt`: with levels 0 and 2 only, Tab on 0 gives 2; a paragraph at an undefined level beyond the last steps up to the last; past the deepest or highest defined level nothing), `{level: n}` (clamped to 0..8 and `ListLevel.definedRange`), `{off: true, keep?}` (direct `numPr` removed, or `numId 0` when the style gives the list; `keep`: the level's left written as direct `ind` and a hanging first line made `firstLine 0`, so the text stays where it was drawn); writes direct `numPr {numId, ilvl}`; one undo step, none (not dirty) when nothing changes; bad patch: RangeError. `listParas(doc, sel)`, `hasList(doc, sel)` (`listParas > 0` stopping at the first list paragraph, at once with no numbering; `FormatMenu` asks it once per `v.selRev` and selection, so drawing the menu over a select-all of 50,000 paragraphs is cheap). `EditList`: `listTab` (a caret at an item's start, or a selection over items: `{by: 1}`; else a tab), `listShiftTab` (in an item anywhere: `{by: -1}`; else `undefined`: the key goes on), `listBack` (a caret at an item's start: `{off, keep}`; the next Backspace joins as before), `usesShiftTab`. Heading numbering (a style-numbered paragraph demoted gets direct `numPr`; Word would change the heading style) is not special-cased |
| `PropNames` | which property fields exist and the WML element each is read from / written as; `withoutRaw` |

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
| `Ns`, `NsMap`, `Wml` | namespace scopes (elements are recognised by URI and local name, never by the `w:` prefix); Strict <-> Transitional URI mapping (`mapNamespaces`, `mapNamespacesCopy`); constants |
| `ReadBody ReadPara ReadProps ReadSect ReadStyles ReadNumbering NumLevel` | the XML -> model readers (`NumLevel`: one `w:lvl` of a numbering definition) |
| `WriteBody WritePara WriteProps WriteStyles WriteParts` | the model -> XML writers; `WriteParts`: content types (`contentTypes(ct, names, known, fix)`), rels, zip order, XML declaration |
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
| `RecentFiles` | (desktop) `loadRecent(app)` (`choices.read('Word', {recent: []})` into the `app.recent` cache; `app.recentReady`), `noteRecent(app, path)` (canonical path first, keyed by canonical lower case, files that no longer exist dropped, `choices.write('Word', {recent})`; waits for the read; a failed write is a `console.warn` only, never breaks a Save), `recentItem(app)` (the menu item: shaded with nothing to show; the submenu built synchronously from the cache, missing files hidden, each entry -> `app.open`, which raises an open window) |
| `Quit` | (desktop) `changed(app)`, `quitMessage(n)` ('1 document has unsaved changes.' / 'N documents have unsaved changes.'), `mustAsk(app)` (sync: dirty documents, `app.closing`, or a quit prompt running), `mayQuit(app)` (one promise at a time; waits for an open close prompt (brought to the front; with no prompt open, a Save as box a close prompt's Save waits on is brought forward, and over it its Replace question when that is open: `Replace.questionOf`, so a Quit never hides the question under the box) and counts again: nothing left dirty -> true without asking; else `Ui/SaveQuery` Discard / Cancel, Return = Discard as in !Edit, Escape / close icon = Cancel; `app.prompt = {dw: null, quit: true, ...}` while open), `quit(app)` (the menu's Quit: at once when `!mustAsk`; Discard -> every window `destroy`ed, `task.quit()`), `preQuit(app)` (the handler: `msg.object()` synchronously when `mustAsk`, then `mayQuit`; Discard -> windows destroyed, `task.quit()` if `msg.single`, else `wimp.emit('hotkey:CtrlShiftF12')` to restart the closedown, which then finds nothing to ask; at most once per answer: two PreQuit-all messages before the answer share `mayQuit`'s promise, and the `restarted` WeakSet keyed by it lets only the first restart). Both chains (`quit`, `preQuit`) end in a `catch`: a prompt that cannot open is reported ('Word could not ask about unsaved changes: ...', `reportError`) and nothing quits (no unhandled rejection) |
| `IconBar` | (desktop) `addIcon(app)`: Select -> `app.newDoc()`; Adjust nothing. The Wimp reports every press on an icon bar icon (button type 3) as a `click` (`kind: 'click'`), never `double`: a double-click is two Select clicks, so a click within 500 ms of the one that made a document is ignored (one gesture, one document; `kind === 'double'` is ignored too). Menu: New, Recent > (`RecentFiles`), Info >, Quit (`Quit.quit`) |
| `TestHook` | `testHook(app)` -> `task.word`: `docs`, `open`, `new({paper})`, `newUntitled(paper)`, `keys`, `ask`, `prompt` (`leaf` null for the quit prompt), `recent` (a copy), `recentReady`, `mayQuit()`, `quit()` |
| `Boxes` | `box(dw, name, make)`: a window's dialogue boxes made once, kept in `dw.boxes` |
| `Open` | `openDocx(vfs, path)` (refuses more than `MAX_PARAGRAPHS` = 200,000 paragraphs), `describe(err, leaf)` (the plain-words error text) |
| `ToolbarBind`, `ToolbarButtons`, `EditScroll` | the toolbar. `ToolbarButtons` (pure): `BAR_H` (34), `BUTTONS` (style field + popup, font field (`R7`) + popup, size field (`R7;A0-9.`) + popup, `fontBigger`/`fontSmaller` (`up`/`down`), B I U S super sub toggles, colour (`wb_colour`, swatch) and highlight, the `align` radio group, indent less/more, clear), `ACTIONS` (names run as `view.format(name)`), `TOGGLES`, `ALIGNS`. `ToolbarBind.bindToolbar(view, {task, parent, height, menu}) -> {tb, refresh, destroy}` (desktop): one listener in `view.formatListeners` sets every control from `view.query()` (mixed: let out / empty; a field being edited is not overwritten); buttons call `view.format`; popups (`FormatMenu.styleMenu/fontsMenu/sizeMenu/highlightMenu`, `Ui/ColourPopup`) open at `tb.popupAt`; Return in the size field -> `NumberField.halfPoints` -> `view.format('size', pt)` (not a number: beep), in the font field -> `FontList.findFont` (else as typed) -> `view.format('font', name)`; Return or Escape gives the caret back (`view.focus()`); `view.addPane(pane)` (its `remove()` called by `destroy`) so `view.lit` keeps the selection blue while a field has the caret (and the pane's `losecaret` redraws the window); `destroy` removes the listener and closes a popup of its own that is still open. `EditScroll` (pure): `visible(v)` (`y0 = scrollY + v.inset`), `scrollToCaret(v)` (24 px inside the visible part: never under the toolbar), `pageStep(v)` (visible height less 32; `EditKeys` scrolls exactly that and moves the caret as far, scrolling again only when the line it lands on is not all in view), `dragStep(v, sx, sy)` (auto-scroll while a drag is above the visible part or outside the window). Sprites `wb_bold wb_italic wb_underline wb_strike wb_super wb_sub wb_left wb_centre wb_right wb_justify wb_indmore wb_indless wb_colour wb_highlight wb_clear wb_style` (20 x 20) are drawn by `tools/moreapps/icon.mjs` `barSprites()` into `!Word.!Sprites`; a pressed button is the R5 slab pushed in with highlight colour 2, so there are no pressed variants. Refresh after a caret move on 5000 paragraphs: well under 1 ms |
| `Zoom`, `ZoomBind` | the zoom: a view transform; the layout stays at 100%. `Zoom` (pure): `ZOOMS` [50, 75, 100, 125, 150, 200], `MIN`/`MAX` 10/500, `clampZoom(pct)` (whole percent; junk 100), `step(pct, dir)`, `wheelStep(pct, dy)`, `toScreen/toLayout(x, y, z, top)` (screen x = x * z, screen y = top + (y - top) * z: `top` = `L.top`, the toolbar and ruler, not scaled), `layoutRect`, `caretOf`, `extentOf`, `zoomScroll(oldScroll, viewSize, oldZ, newZ, top = 0)` (keeps the centre of what is visible below `top`). `EditView` keeps `zoom` (a factor) and uses it everywhere: `paint` (`g.translate(0, top); g.scale(z, z); g.translate(0, -top)` over `layoutRect(rect)`: the backing store stays at `devicePixelRatio * wimp.scale`, text drawn at the canvas scale, no double scaling), `caretRect()` (zoomed, so scrolling to the caret, the Wimp's caret and the IME proxy follow), `hitAt(x, y)` (clicks and drags in `EditMouse`); Page Up/Down move the caret `pageStep / zoom` layout px; `EditScroll` works in screen px. `ZoomBind.bindZoom(dw) -> {pct, set(pct), destroy}` (desktop: `set` clamps, keeps the centre, refits, scrolls, re-places the caret and the ruler; Ctrl+wheel (`os.input.keysDown`) claims the event, the plain wheel still scrolls); `zoomMenu(dw)`. No zoom keys (Ctrl+= / Ctrl+Shift+= are subscript/superscript, Ctrl+0 is Word's paragraph spacing); per window, not saved. Ruling: the toolbar zoom popup of the plan is NOT built (the toolbar has no room; zoom lives in the window menu's Zoom submenu and on Ctrl+wheel), and no `wb_zoom` sprite is drawn. Across, `ZoomBind.set` keeps the place on the PAGE at the window's centre (`Zoom.zoomScrollX` with the page's left edge before and after `fit()`, which lays out for width / zoom and so moves the page); Ctrl+wheel goes through `Zoom.wheelAcc` (dy added up to `NOTCH` 100 = a step, at most one per `GAP` 100 ms, reset after `IDLE` 300 ms or a turn) |
| `AppWin` | `DocWindow`: window (workButton `clickdragdouble`, hiDPI canvas, both scroll bars; first width `min(page + 48, screen - 40)`; first height `max(560, min(screen height - y - 92, ceil(inset + pageH + 16)))`: a whole page under the bars where the screen has room above the icon bar (92: its 68 px and the scroll bar), never less than the old 560), `fit()` on a width change, `relayout()` (fonts arrived: a new `DocLayout` and `TextMetrics`, selection kept by `Selection.clamp(sel, doc, oldL)`), `rebuild()` (after an edit: `new DocLayout(doc, old.metrics, old)` keeps the lines of unchanged paragraph objects, then `fit()`), `d` (the `Document`, one per window) and `typing` (its `Typing`), `path` (null: untitled, `isUntitled`) and `leaf` (`SaveState.untitledName` of the open untitled documents' names), `save()`, `saveAs(path)` (`DocSave`), title `leaf *` while `d.dirty` (Save a copy does not mark it saved), `requestClose()` (the close icon's `close` event, prevented) and `revert()` (`CloseDoc`), `close()` forced, `closed`, menu (Save / Save as / Revert / Save a copy / Info / Edit / Format / Zoom / New / Close), zoom (`zb`: `ZoomBind`; `zoom` percent, `setZoom(pct)`; `fit()` lays out for `viewW()` = window width / `view.zoom` and sets the extent `Zoom.extentOf` of the layout's), the toolbar (`bar`: `ToolbarBind`, `BAR_H` high) and the ruler under it (`rb`: `RulerBind`, `RULER_H`, `rulerOn`, `setRuler(on)`: per window, not saved); the inset is `inset()` = `BAR_H + (rulerOn ? RULER_H : 0)`, the one value given to the layout (`newLayout`: `{top: inset()}`, also used by `rebuild` and `relayout`) and to `view.inset`; `setRuler` shows or hides the pane, lays out again (lines kept), scrolls to the caret and gives the focus back; Menu on the toolbar or ruler opens the window's menu (`WinMenu`, with the cached Save and Info boxes) |
| `RulerBind`, `RulerInd`, `WinMenu` | the ruler and the window menu. `RulerInd` (pure): `RULER_H` (24), `firstIndents(doc, sel)` (`ParaInd.effective`, the indents drawn including a list level's, of the first paragraph from the selection's start: `{left, first, right}`, a leading kept block skipped, `null` with none), `textTwips(L)`, `scaleOf(L, scrollX, zoom = 1)` (the column's px times the zoom; `zoom` passed to the ruler, so ticks, markers and drags scale). `RulerBind.bindRuler(view, {task, parent, dy, menu}) -> {ruler, refresh, show(on), destroy}`: one listener in `view.formatListeners` and the parent's `moved` set the scale and markers (`RulerMath.indentMarks`, help per marker); a drag shows `RulerMath.dragIndent` of the first paragraph's indents (the document unchanged), the commit runs `view.format('indentDrag', {marker, at, textW, free})` once and every drag's `end` sets the markers again from the paragraph (so a drag that ends without a commit does not leave them where it was dragged) (`FormatPara.dragIndents`: the same function on each paragraph's own resolved indents, only the changed keys written, `firstLine`/`hanging` exclusive, one undo step); the pane is registered with `view.addPane` (it never takes the caret). Margins are display-only; no tab stops. `WinMenu.windowMenu(dw)` (desktop): Save (`DocSave.save`) / Save as (`saveBox`) / Revert (`CloseDoc.revert`, shaded while untitled) / Save a copy (`copyBox`) / Info / Edit / Format (with `{ruler, toggleRuler}` -> a Ruler tick item at its end) / Zoom (`ZoomBind.zoomMenu`) / New (`app.newDoc`) / Close (`CloseDoc.requestClose`), the Save as, Save a copy and Info boxes cached in `dw.boxes` (`Boxes`) |
| `EditView`, `EditMouse`, `EditPaint`, `Keys` | the caret, selection and editing in a window. `EditView(win, L, d, typing, rebuild)`: `L` (a getter: makes the layout again first when the document changed), `sel`, `input(text)` (`Typing.type`, with `overwrite`; refused -> `wimp.beep()`), `compose(text\|null)`, `run(id)` (`EditRun.runView`: a `FormatApply` id -> `format(id)`; otherwise the pending format is dropped, then Keymap ids `undo`, `redo`, `insert` toggles `overwrite`, `selectAll`, the rest via `EditApply.run`), `undo()`, `redo()` (`EditRun.stepView`), `format(id, arg)`, `query()`, `pending`, `selRev`, `formatListeners` (`EditFormat`, below), `ensure()`, `flush()`, `destroy()`; every Document `change` marks the layout stale and asks for one `requestAnimationFrame` flush (lay out, scroll to the caret, show it), so a burst of typing is laid out once; `setSelection` is a non-edit move and calls `typing.reset()`; `setSelection(sel, {scroll})` (scrolls the head 24 px inside the edges), `setLayout(L, oldL)`, `placed()` (re-places the caret; never takes the browser focus: after a resize or when fonts arrive it must not pull the focus from a page field outside the desktop; it moves `wimp.caret.pos` only while the hidden field is not the focus owner), `focus()` (a user gesture: takes it), `key(ev)` (`EditKeys.keyFor`: true if used, `undefined` to pass the key on), `caretRect()`, `text()`, `hook()` (`EditHook`: adds `type`, `press`, `compose`, `flush`, `lines()`, `dirty`, `undoDepth`, `overwrite`, `composing`, `format(id, arg)`, `query()`, `pending`, `selRev`, `lit`; `!RunImage`'s `task.word.docs[i].toolbar` is the `Ui/Toolbar`); the caret is the Wimp's text-input caret (`wimp.setCaret(win, null, -1, {x, y, h} or null, {text: true})`), shown only while nothing is selected (no blink yet); Page Up/Down scroll by the window height less the toolbar and 32 (`EditScroll.pageStep`) and move the caret as far; `inset` (px hidden by the toolbar and ruler: scrolling keeps the caret below them, `EditScroll`), `addPane(pane) -> remove()` and `lit` (the window or one of its registered panes has the caret: the selection is drawn blue); `!RunImage`'s docs also give `ruler`, `rulerOn`, `setRuler`; Ctrl-Home/End scroll to the very top/bottom; Ctrl-A does not scroll; Escape collapses to the head. `EditMouse.attachMouse(view)`: click caret, Shift/Adjust click extends from the anchor, drag via `wimp.drag({type: 'point'})` with a 60 ms auto-scroll timer outside the window (the release position is applied too: Chrome may deliver the last moves with it), double-click word (`selectWord`), triple-click = a Select click within `os.input.config.doubleClickMs` of a double-click (paragraph), Menu leaves the selection alone (as !Edit). `EditPaint.paintView(L, g, rect, sel, active, {comp, overwrite})`: grey desk `#888`, white page with border and shadow, text (`DocPaint`), selection multiplied in (`#b3d4fc`, inactive `#d4d4d4`); overwrite: the grapheme after the caret shaded `#a0a0a0` (multiplied; 8 px at a paragraph end); composition: the text drawn at the head black on white over what follows (not laid out: a known limitation), underlined 2 px `#0050c8`. `Keys.command(code, {shift, ctrl, key})` (pure): Wimp code -> `{cmd, extend}` or null; the browser's key name separates Shift-Down from Page Down (both &19E) |
| `DocLayout`, `DocRects`, `DocPaint` | the whole document as a page-width column: `new DocLayout(doc, metrics, prev?, {top}?)` (`prev`: a laid-out layout of the same doc, metrics and text width: the lines of every paragraph object it had are reused; `top`: px above everything, for the toolbar, 0..1000, `prev`'s when not given; `EditPaint.pageRect` starts the page below it), `layout(viewWidth) -> {w, h}` (text width `(pgSz.w - pgMar.left - pgMar.right) / 15` from the FIRST section, A4/1440 defaults, clamped 80..4000 px; page `pgSz.w / 15` centred, at least 24 px from the left; 24 px above and below; `pageH` = `pgSz.h / 15` (A4 when missing or not finite, clamped 200..20000 px) and the extent's height `height` is at least `top + 2 * PAGE_TOP + pageH` (`PAGE_TOP` 8, exported: the desk above and below the page, which `EditPaint.pageRect` uses), so a short or empty document shows a whole white page (a longer one ends 24 px below its text: no page breaks yet); the height is set in `stack()` from the items, so a layout made from `prev` has the full layout's height (`layout-prop` checks it); lines depend only on the text width, so a new view width only moves the column; `invalidate()` re-breaks every paragraph), `items` `{id, block, kind: 'p'\|'box', index, y, h, lines?, label?}` (a `'p'` item is also PositionMap's `pl`; x in item coordinates + `left`), `byId`, `itemAtY`, `locate(pos)`, `caretRect(pos, aff)`, `hitTest(x, y) -> {pos, affinity}` (above all: start; below all: end; a box: nearer edge), `labels` (`ListNumbers.labels(doc)`, once per layout object: one pass, about 20 ms for 50,000 list paragraphs) and each `'p'` item's `list` (its Label or null, passed to `layoutPara`), `selectionRects(sel, y0?, y1?)` (`DocRects`: only items/lines in the band; 6 px paragraph-mark stubs for paragraphs whose end is selected; a box lit whole when both edges are in), `boxRect`, `paraStart/End`, `docStart/End`, `next/prevItem`; `DocPaint.paint(L, g, rect)` draws the items in rect (a list label on its first line's baseline, in its own format, never highlighted) |
| `Selection`, `SelMove`, `DocPos` | positions `{id, off}`: a paragraph id and UTF-16 offset, or a kept block (`DocPos.blockId`: a negative id held in a WeakMap per block object) with off 0 (before) or 1 (after). `Selection` is a frozen value `{anchor, head, affinity, goalX}`: `caret`, `select`, `collapsed`, `ordered(sel, L)`, `move(sel, L, cmd, extend, pageH)` (`SelMove`: left/right by grapheme of the whole paragraph text (`DocPos.nextG/prevG`, windowed on texts over 4096 units), every item boundary one step, boxes atomic; up/down keep `goalX` and cross into the next item; home/end per line; wordLeft/wordRight; paraStart/paraEnd; docHome/docEnd; pageUp/pageDown; non-extending left/right collapse a selection to its edge), `selectWord` (not the space after a word), `selectPara`, `selectAll`, `text(sel, L)` (paragraphs joined by `\n`, inline wrappers as their text), `clamp(sel, doc, oldL?)` |
| `LineLayout`, `LineTokens`, `Fmt`, `Justify`, `Highlight` | (`runFmt` also gives `highlight` (CSS colour via `Highlight.highlightCss`, Word's 16 names, else null), `vert` ('sup'/'sub'/null), `dy` and `full`: super/subscript at 0.65 of the size, baseline up 0.35 / down 0.15 of the full size, the line as high as for the full size; `colour` black unless 6 hex digits; items carry `hl`, `dy`; a line grows only to keep raised/lowered text inside it; `jc` 'both': items not merged, one item per space, and `Justify.justify(line, maxX)` spreads a wrapped line's free width over the spaces between its words (not the last line, nor one ending in a break; lines with tabs or boxes, or one word, left alone; widened spaces record `js`, which `PosLine.offIn` scales by; `rangeX` ends a selection at an item's edge as the caret does); `DocPaint` draws highlights behind a line's text, full line height, and text/underline/strike at `dy`) (`Fmt.sizeBold(styles, para, rPr, pPr?)` -> `{pt, bold}`: the one size/bold rule, shared with `Format`: no size anywhere in a heading means Word's heading size and bold unless `b` is set; `HEADING_PT`) screen layout: `LineLayout.layoutPara(para, styles, width, metrics, cache)` (greedy line breaking; lines and items keep the UTF-16 model offsets `from`/`to` they stand for, gap-free; `shown` marks items whose drawn text is not the model text; trailing spaces hang; a word wider than the line overflows on its own line), `LineTokens.tokens` (words, `isSpace` (only U+0020 breaks and hangs), spaces, tabs, breaks and inlines with their offsets; a run boundary inside a surrogate pair moves past it), `runFmt`/`paraFmt` from the resolved properties (`paraFmt(styles, para, levelInd?)`). List labels: `layoutPara(..., cache, label?)` puts the label (a `ListNumbers` Label) on the FIRST line as `line.label = {x, w, text, f, bullet}`, not an item and in no `from`/`to` (so `lines[0].from === 0`, the caret at offset 0 is the text start `line.x`, a click left of the text gives offset 0, selections start at the text, `Justify` never touches it); it moves with centre/right alignment |
| `LineLabel` | (pure) `labelLine(label, para, styles, pf, metrics, cache) -> {label, textX}`: the label starts at `left + first` (the hanging space `[left - hanging, left)`), lvlJc right/center within that space when it fits; text after the suffix: tab -> `left` when the label ends at or before it, else the next 48 px stop counted from the margin (Word's default stops); space -> one space of the label's font; nothing -> at its end. Format: the first run's `rPr` (Word: the paragraph mark, not modelled) less underline/strike/highlight/vertAlign and character style, the level's `rPr` over it; a bullet keeps the paragraph font (not Symbol/Wingdings) with `"DejaVu Sans"` before the generic family (not shipped: used if the system has it, else Chromium's per-glyph system fallback finds a font with the shape; `word-lists.mjs` checks U+2022 and U+25AA draw ink). The first line is as high as the label needs. `sameLabel(a, b)` (the reuse key) |
| `PositionMap`, `PosLine` | offsets <-> places in one laid-out paragraph `pl = {para, y, h, lines, metrics}`: `caretRect(pl, off, aff)`, `hitTest(pl, x, y)`, `lineOf`, `lineStart`/`lineEnd` (End leaves out spaces hanging at a soft wrap, sits before a break), `vertical(pl, off, aff, dir, goalX)` (null past the first/last line), `selectionRects(pl, from, to)`. At a soft wrap an offset has two places by affinity (`'up'` end of the upper line, `'down'` start of the lower); atomic items (tab, box, hyphen, unseen, wrapper text) give the nearer edge; a wrapper's offset `i+1` is after its last piece, a line of only later wrapper pieces has no caret place; Up/Down fall back to the other edge of a hit wrapper piece so they never dead-end. Lines carry `x` (start after indent and alignment) for empty lines. Long items are measured with `widthTo`/`offsetAt` |
| `Edit`, `EditDel`, `EditPara`, `EditRange`, `EditPos` | the editing commands, pure, no layout: each `(d: Document, sel: Selection, ...) -> Selection` applies ONE `d.group` (one undo step) and returns a caret (affinity `'down'`, no `goalX`), or `sel` unchanged when nothing happens. `Edit`: `typeText(d, sel, text, {overwrite, key, rPr, rStyle})` (`rPr`/`rStyle`: the pending format, merged into the new text's format only (`Pending.applyTo`); `\r\n`/`\r` -> `\n`, other controls and U+FFFC dropped, lone surrogates -> U+FFFD; `\t` stays a tab character in the text (the reader's form of `<w:tab/>`), `\n` splits (bulk: `restoreBlock` + `insertBlocks`); over a selection the first selected character's format; `{coalesce: key}` unless `\n`/`\t`; a kept block's edge gets a new empty paragraph; a document with no blocks: refused), `overwrite` (replaces as many graphemes as typed, not past the paragraph end, a U+FFFC, a tab or a line break), `splitPara` (`EditPara.splitAt`: an empty list item (`ParaInd.listOf`: one with a label, style numbering included) ends the list: direct `numPr` (raw too) removed, or `numId 0` when the style gives the numbering; an empty paragraph with `numPr` but no label (numId 0, unknown numId) splits; at the end the style's `next` when it names another paragraph style, else Heading 1-9/Title by id or name -> default style), `lineBreak` (a `\n` character in the text, the reader's form of a plain `<w:br/>`: typed tabs and line breaks are the same model before and after a save; older `tab`/`br` inlines still read, display and write), `insertTab`. `EditDel`: `deleteBack`, `deleteForward` (grapheme clusters; merge at paragraph edges, not across sections; next to a kept block the first press returns the block selected, the second deletes it), `deleteWordBack/Forward` (`Segment.prevWord/nextWord`), `deleteSelection`. `EditRange`: `deleteRange` (cut the ends, `removeBlocks` per section, merge the ends; 40k of 50k paragraphs in a few ms; section breaks are never removed: removing one by deleting across it is not supported yet (a section op is a later deliverable), so a section the range empties gets one empty paragraph in the same undo step and stays reachable, and so does one it leaves ending with a kept block (not the last section: the paragraph that carries the section break, which the writer would otherwise add, so the file would read back with one paragraph more)), `mergeAt` (merge rule: the first paragraph keeps id/pPr/pStyle unless it is empty and the second is not, then the empty one is removed), `paraBy`. `EditPos`: `findBlock`, `neighbour`, `atIndex`, `checkPos`, `orderedPos(doc, sel)` (document order without a layout) |
| `Typing`, `Keymap` | pure. `new Typing(d, {now, pauseMs = 1000})`: `type(sel, text)` (`type(sel, text, {overwrite, rPr, rStyle})`: `Edit.typeText` with key `'typing'`; a new undo step on the first call after `reset()`, after a pause over `pauseMs`, when the caret is not where the last typing ended, or for the first non-space after a space, so "hello " and "world" are two steps; `\n`/`\t` text and typing over a selection are never joined; typing given a pending format (`rPr` or `rStyle`) starts a new step, and the typing after it joins it, so a word typed after Ctrl-B is one step), `command(fn)` (`d.breakCoalesce()`, then `fn()`), `reset()`. `Keymap`: `bind(rows)` of `{id, keys: ['Ctrl+Z'], label, menu}`, `lookup({code, key, shift, ctrl, alt})` -> id or null (ids `enter shiftEnter backspace delete ctrlBackspace ctrlDelete tab shiftTab insert undo redo selectAll`; `shiftTab` is Shift+Tab, code &19A on the bare path; Ctrl-Tab and Alt-Tab stay null; and the Format rows (`menu: 'Format'`) `bold` Ctrl+B, `italic` Ctrl+I, `underline` Ctrl+U, `alignLeft` Ctrl+L, `alignCenter` Ctrl+E, `alignRight` Ctrl+R, `alignJustify` Ctrl+J, `clearFormat` Ctrl+Space, `superscript` Ctrl+Shift+= (or `+`), `subscript` Ctrl+=, `fontBigger` Ctrl+Shift+> (or `.`), `fontSmaller` Ctrl+Shift+< (or `,`), `indentMore` Ctrl+M, `indentLess` Ctrl+Shift+M; key names may be any printable ASCII character or `Space`; on the bare-code path codes 1..26 are Ctrl-letters except 8, 9 and 13 (Backspace, Tab, Enter), so Ctrl-I and Ctrl-M work only with a key name; the browser key name and flags decide, the Wimp code alone only without a name; Alt and unmapped keys give null so the key propagates; movement and Ctrl-A stay with `Keys`), `labelFor(id)` (Word style `Ctrl+Z`), `row(id)`; `keymap` is the default table (Ctrl+Y and Ctrl+Shift+Z both redo) |
| `Format`, `FormatSet`, `FormatPara`, `FormatOps`, `FormatEff`, `FormatCheck`, `Pending` | formatting, pure. `Format.query(doc, sel, pending?)` -> `{bold, italic, underline, strike, size (pt), family, color ('RRGGBB'/'auto'), highlight, vert, align, indentLeft, indentFirst, indentRight, spaceBefore, spaceAfter (twips), lineSpacing {line, rule}, style}` from the resolved formatting, `null` when mixed; a caret: the format typed text gets there plus `pending`. `FormatSet` commands `(d, typing, sel, ..., pending?) -> {sel, pending}`: `toggle(key)` (bold italic underline strike superscript subscript; Word's rule: all have it -> off, else on), `setChar(patch)` (`FormatCheck.charPatch`: b i u strike sz color highlight vertAlign rFonts), `sizeBy(steps)` (`stepSize`: Word's list 8..72, then tens to 400), `clearFormat`, `applyStyle(id)` (paragraph or character style; unknown id: RangeError), `setPara(patch)` (jc, ind, spacing; firstLine/hanging exclusive), `indentBy(twips)` (from the left indent drawn: `ParaInd`), `clearParaFormat`, `setList`, `listParas` (`FormatList`); a caret: character commands change nothing and return the new pending format, paragraph commands format its paragraph; a selection: one undo step (`typing.command` + `d.atomic`), pending cleared; values equal to the style's are removed (`null`), others explicit (`b:false` in a heading; bold compared as `Fmt.sizeBold` shows it, and a size change that would switch the heading-bold rule writes `b` so the text stays as bold as it was; `szCs` against the inherited `szCs`; `firstLine`/`hanging` as one value: `firstLine: 0` cancels a style's hanging; both at once refused). Only paragraph/character style ids are accepted by `applyStyle` (table/numbering: RangeError). A value equal to the style's still makes an op when a raw element of that name is in `extra`, so it is replaced (`FormatOps.changes` follows `setProps`, including a raw `w:pStyle`/`w:rStyle` when the style is set or removed). A size is removed only when the style chain gives that very size; where no style gives one it is always written (Word shows 10 pt there, !Word assumes 11 pt, so the file says what was chosen: 11 pt in such a document is `sz` 22); a size change sets `b` to what keeps the text as bold as it was, removed when the rest gives it (so `{sz: null}` in a heading leaves no `b: true`). Character formatting skips the U+FFFC of a level-`p` inline (a hyperlink, a kept run, a bookmark: `FormatOps.pieces`): the writer puts such an inline outside any run, so a format on its run could not be saved (found by `format-roundtrip.test.mjs`); `Format.query` and the toggle rule skip it too. `FormatOps`: `touched(doc, sel)` (paragraphs and selected ranges; kept blocks skipped; a last paragraph reached only at offset 0 gets no paragraph formatting), `buildOps` (one `setProps` per paragraph, or per stretch of runs formatted alike; runs it would not change get none). `FormatCheck`: `charPatch`, `paraPatch` (checks the patch a command may carry: a bad key or value is a RangeError), `HIGHLIGHTS` (the highlight names). `Pending`: `merge`, `isEmpty`, `forTyping`, `styleFor`, `applyTo`, `onRun`. 50,000 paragraphs: bold 0.13 s, alignment 0.1 s, undo of both 24 ms (the rules and numbers below) |
| `EditKeys`, `EditInput`, `EditMenu`, `EditApply` | editing in the window. `EditKeys.keyFor(view, ev)` (pure): `Keys.command` first (movement, Ctrl-A, Escape), then `Keymap.lookup` -> `view.run(id)`, then a printable key that still arrives as `key` (the proxy lost the browser focus, or `Wimp_ProcessKey`) is typed: exactly one character (not a C0/C1 control), and none of Ctrl, Alt or Meta (Cmd: a browser shortcut such as Cmd-C is never text; Ctrl and Alt are read from the Wimp event's flags, and Ctrl, Alt and Meta from the DOM event's `ctrlKey/altKey/metaKey`: the Wimp event has no Meta flag), and not an event whose DOM target is the text-input field while it has the focus (`view.fromProxy(ev)`, made by `EditInput`: such a key was not typed there, so it is not text); anything else `undefined`, so the key goes on to the desktop (F-keys, Ctrl-Q, Alt-letters, Cmd-letters). The routing order is therefore: `Keys.command` (movement, Ctrl-A, Escape), `Keymap.lookup` (editing), the printable fallback. `EditInput` also holds `showCaret(v, take)` (the Wimp's caret at `v.caretRect()`, zoomed: the proxy field and an input method's candidates follow it), `inputView(v, text)` and `composeView(v, text)` for `EditView`. `EditInput.attachInput(view)` (the proxy contract is in `docs/CORE_API.md` 3.1/3.2: committed text, composition, composition end; plain printable keys never arrive as `key` while the field has the focus; Backspace, Delete, Enter, Tab, arrows and Ctrl/Cmd keys do): `textinput` -> `view.input` (one event is one edit and one undo step, however long, at most 100,000 characters), `composition` -> `view.compose(text)`, `compositionend`/`losecaret` clear it; events for a closed window are ignored; `view.lateCommit` (`{text, at}`, set by `DocSave` when a save types the composing text itself): the next `textinput` equal to it within `LATE_MS` (800 ms) is dropped once; any other `textinput`, `composition`, `key`, `click`, `doubleclick`, `drag` or `losecaret` clears it (`first` handlers), so the same text typed on purpose is kept. `EditMenu.editMenu(view)`: Undo `Ctrl+Z`, Redo `Ctrl+Y` (shaded by `canUndo`/`canRedo`), Select all `Ctrl+A`, labels from `Keymap.labelFor`. `EditApply` (pure): `run(id, d, typing, sel)` (enter shiftEnter backspace delete ctrlBackspace ctrlDelete tab shiftTab through `typing.command`; tab, shiftTab and backspace via `EditList`; shiftTab outside a list and other ids `undefined`), `stepEnd(doc, ops, oldL)`: the caret after undo/redo from the last leaf op applied (spliceText/replaceText: `at` + inserted length; restoreBlock: where the restored paragraph first differs from the one of that id in `oldL`, so undoing Enter goes back to the split point; splitBlock: start of the new paragraph; insertBlock(s): start of the first; removeBlock(s): end of the block before the gap; mergeBlock/setProps: start of that paragraph) |
| `FormatApply`, `EditFormat`, `EditRun`, `EditHook`, `FormatMenu` | formatting in the window. `FormatApply` (pure): `apply(id, d, typing, sel, arg, pending) -> {sel, pending}` or `undefined` for a non-format id; ids `bold italic underline strike superscript subscript` (toggle), `alignLeft alignCenter alignRight alignJustify`, `align` (arg jc), `clearFormat`, `fontBigger fontSmaller` (`sizeBy` +-1), `indentMore indentLess` (`indentBy` +-720), `indentDrag` (arg `{marker, at, textW, free}`: `FormatPara.dragIndents`; a bad arg is a RangeError), `listIn listOut listOff` (`setList` `{by: 1}`, `{by: -1}`, `{off: true}`), `size` (arg points -> `sz` half-points), `font` (arg family -> `rFonts`), `color` (arg `colourValue`: Wimp colour 0-15, `'auto'` or `'RRGGBB'`), `highlight` (Word name or `'none'`), `style` (style id); `isFormat`; `PALETTE` (the desktop's Wimp palette as RRGGBB, pinned to `src/core/palette.js`: FFFFFF DDDDDD BBBBBB 999999 777777 555555 333333 000000 004499 EEEE00 00CC00 DD0000 EEEEBB 558800 FFBB00 00BBFF); `SIZES`; `WORD_FONTS` and `fontList` (re-exported from WimpLib `FontList`); `HIGHLIGHTS`; `paraStyles(styles)` (not `semiHidden`, by name). `EditFormat` (view glue, no `riscos`): `initFormat`, `touch(v)` (`selRev++`; `formatListeners` called once at the next animation frame), `dropPending`, `formatQuery(v)` (`Format.query` cached per `selRev`), `formatRun(v, id, arg)` (true if applied; RangeError -> false, nothing changed; the pending format it returns is kept; relayout through `v.edited`), `docFonts(v)` (`Info.facts(doc).fonts`, worked out once after each document change, not on every menu or popup), `stopFormat`. The view bumps `selRev` on every selection, document, layout and pending change; `setSelection`, undo/redo and every non-format command drop the pending format; `input` passes `{rPr: forTyping(pending), rStyle: styleFor(pending)}` to `Typing.type` and then drops it; `EditView.format` gives the browser focus back to the Wimp's text field when a menu click took it. `EditRun`: `runView(v, id)`, `stepView(v, kind)`. `EditHook.hook(v)`: the test hook (`labels()`: each block's list label text as laid out, or null). `FormatMenu.formatMenu(view, {ruler, toggleRuler}?)` (desktop): Bold Italic Underline Strikethrough Superscript Subscript (ticked from `view.query()`, evaluated when the menu is drawn), Font > (WimpLib `Ui/FontMenu`: `docFonts`, Word, Desktop fonts >), Size > (`SIZES`, Bigger, Smaller), Colour > (16 `colour: n` items, Automatic, More colours... > a `Ui/ColourPopup` submenu), Highlight >, Align >, Indent >, List > (Demote Tab, Promote Shift+Tab, Remove from list; shaded when no selected paragraph is in a list: `FormatList.hasList`, cached per `selRev`), Style >, Clear formatting; keys from `Keymap.labelFor`; all shaded with no selection. A command on 5000 selected paragraphs, laid out again: 50-70 ms |
| `Kinds` | `UNSEEN` (the inline elements drawn as nothing and not counted: `proofErr`, `bookmarkStart/End`, `commentRangeStart/End`, `permStart/End`, `lastRenderedPageBreak`, `instrText`, `delText`, `fldChar`), `localName(node)` |
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
  caret logic (typing and deleting follow the stored order too); no clipboard, no find, no blink for the caret.
* The layout uses the FIRST section's page width for the whole document.
* Every new layout (each keystroke) recomputes the list labels of the whole document (`ListNumbers.labels`, one
  pass): in a 50,000-paragraph list a keystroke with its layout went from about 7 ms to 25 ms. Recomputing only on
  structural edits (paragraphs added or removed, `numPr` or style changed) is deferred (see "Lists" below).
* Shared code (`src/core`) changed for typing: the opt-in text-input proxy (`src/core/textinput.js`, `wimp.js`,
  `menu.js`), in `docs/CORE_API.md` 3.1/3.2 and `docs/CHANGES_NEEDED.md`; the drag listeners above are noted there too.

**Editing: limits and known minors** (deliverable 2).

* A document with no block at all cannot be typed into (`Edit` returns `sel`; `EditView.input` beeps). Every other
  document has at least one paragraph or kept block, and the section-break rule below keeps it so.
* Section breaks are never removed (a section op is a later deliverable): a deletion across one leaves every section,
  an emptied one holds one empty paragraph, a section left ending with a kept block (not the last) gets an empty
  paragraph after it; Backspace at a section's first paragraph and Delete at its last do nothing.
* Composition text is drawn at the caret over what follows and is NOT laid out: the line reflows when the text is
  committed (a known cosmetic limitation; the composing text is in the view, never in the document).
* Printable keys: with the proxy focused they arrive as `textinput` only. If the field lacks the browser focus
  (the user clicked a page field outside the desktop and back without a click in the window), an AltGr/Option
  character typed meanwhile arrives as a `key` with Ctrl+Alt set and the printable fallback drops it (Ctrl and Alt
  are excluded so Ctrl-letters and Alt-menus stay shortcuts); click in the window to focus. Cmd (Meta) shortcuts are
  not mapped: Ctrl is the modifier, Cmd-letters are left to the browser and type nothing.
* `DocLayout(doc, metrics, prev)` keeps the lines of every block OBJECT of `prev` (the key is the paragraph object,
  its list label as `LineLabel.sameLabel` compares it: text, level indent, suffix, lvlJc, level `rPr` by identity,
  bullet; the metrics and the text width). A list paragraph's label depends on OTHER paragraphs, so the label is in
  the key; when styles or numbering definitions become editable the key must grow (a style change must invalidate),
  as the header of `DocLayout` says.
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
canvas, scrolling, the Wimp's caret and the panes. The toolbar and the ruler are panes attached at the top of the work
area; the `inset` (`AppWin.inset()` = `BAR_H` 34 + `RULER_H` 24 when the ruler is shown) is the one value given to the
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
Enter; !Word does not (user guide, part 4). Paragraph commands at a caret format the caret's paragraph and keep the
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
wb_right wb_justify wb_indmore wb_indless wb_colour wb_highlight wb_clear wb_style`, 20 x 20; `up`, `down` and
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
* Margins are shown on the ruler but cannot be changed; no tab stops; paragraph spacing and line spacing have no UI
  (`FormatSet.setPara` takes them, the guide says so).
* The module size limit is 250 lines (`disc-wimplib --check` for the library): `EditView` (233) and `Ui/Ruler` (204) have little room, so split before adding much to either.
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
  a numbering definition: commands write only a paragraph's `numPr` (and `ind` for Backspace's `keep`).
* **Counters.** One linear pass (`ListNumbers.labels`): counters per abstractNum (numIds over one abstractNum continue
  one count), `startOverride` once per numId and level, restarts per `lvlRestart`, `%n` in level n-1's format
  (decimal for `isLgl`), missing levels drawn as the nearest defined level below, labels capped at 40 characters,
  templates read to 255 characters. Rulings made without Word (G4 below): shared counters, one-shot override.
* **Indents.** Style < numbering level < direct `ind`, attribute by attribute (`Styles.resolvePara(styles, para,
  levelInd)`; hanging and firstLine one value). `ParaInd.effective` is what is drawn and what the ruler, Format.query,
  Ctrl-M and ruler drags start from; `FormatPara.explicit` compares against style + level, so an indent back at the
  level's value is removed again.
* **Label geometry** (`LineLabel`): the label at `left + first`; tab suffix: the text at `left` when the label ends
  before it, else at the next 48 px stop counted from the MARGIN (in-text tabs count from `left`: an inconsistency
  kept until Word is checked, G6); lvlJc right/center inside the hanging space (Word may let a right-aligned number
  stick out to the left, G9).
* **Reuse key.** `DocLayout` keeps a paragraph's lines only when the object is the same AND `LineLabel.sameLabel` holds
  (text, suffix, jc, bullet, the level indent, level `rPr` by identity): a label depends on other paragraphs.
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
* The tab after a label counts its stops from the margin, tabs in the text from the left indent (G6).
* A right-aligned label stays inside its hanging space (G9).
* A style-numbered heading keeps its style on a level change (G13).
* No creating lists or numbering definitions, no bullet/number toolbar buttons, no copy and paste of list items.
* Absurd values are shown as given within the 40-character cap (a start of 2^31 as `2147483648.`, a negative start as
  `-5`): `word-lists-hostile.mjs` pins this; what Word does with them is G17.
* `docs/CHANGES_NEEDED.md`: nothing; lists needed no shared-code change.

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

## The data model

Header of `!Word/Model` is the reference. In short:

```
Doc     {sections, styles, numbering, parts, rels, meta, rawSettings}
Section {props: {pgSz?, pgMar?, cols?, titlePg?, extra}, blocks, raw}
Para    {type:'p', id, text, runs, inlines, pPr, pStyle?, extraP}
Run     {start, end, rPr, rStyle?}
Inline  {kind:'raw'|'br'|'tab', level:'p'|'r', node?, text?, brType?}
Opaque  {type:'opaque', node}
```

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
Relationship types and the bytes in `doc.parts` stay as they were. Strict vocabulary differences stay raw/extra.
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
  for a submenu on every hover), *Info*, *Edit* (Undo, Redo, Select all: `EditMenu`), *New*, *Close*. Mouse and keys: `EditMouse`, `EditView`, `Keys` (arrows, Ctrl-arrows, Home, End/Copy, Ctrl-Home/End, Page Up/Down, Shift to extend, Ctrl-A, Escape), `Keymap` (editing keys); other keys are passed on.
* Test hooks: `task.word.docs` (`{path, leaf, untitled, stateId, save(), saveAs(path), doc, text, summary, win, saveBytes(), view}`; `view` is `EditView.hook()`: `{selection, layout, text(), caretRect(), setSelection(a, b?, aff?), type, press, compose, flush, lines(), dirty, undoDepth, overwrite, composing}`) `task.word.open(path)` (resolves to the `DocWindow`), `task.word.newUntitled(paper)` / `task.word.new({paper})` (likewise), `task.word.keys` (the `app.docs` keys), `recent`, `recentReady`, `mayQuit()`, `quit()` (the menu's Quit), `prompt`, `ask(opts)` (`TestHook`).
* `LineTokens` draws inlines so (each stands for one offset; a wrapper's text still wraps word by word, its first piece covering `[i, i+1)` and later pieces the empty `[i+1, i+1)`, all `shown`; a tab or newline in that text is drawn as it is): a `w:hyperlink` with text in blue, underlined (the only link style); any other
  paragraph-level wrapper with text (`w:ins`, `w:fldSimple`, `w:sdt`, `w:smartTag`, `w:customXml`, a `w:r` kept
  whole) as plain text in the format at that position; nothing for `Kinds.UNSEEN`, `w:del`, `w:moveFrom` and
  `w:softHyphen`; `-` for `w:noBreakHyphen`; a grey `[...]` box for the rest (drawings, pictures, objects, footnote,
  endnote and comment references, `w:sym`...). `Info` counts the same way: the `UNSEEN` kinds are not preserved
  items, so a field made of `fldChar`s is not counted (its result is shown as text).
* Not shown yet (and not in the way of typing): caps/small caps, exact/at-least line spacing, automatic-colour text on a dark highlight (drawn black; Word draws it white), table contents, tabs never wrap, a word
  longer than the line runs over.

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
  tests of 500 seeded op sequences that check every op's inverse), `model-perf` (typing 0.3 ms/key in a 20k-character,
  2000-run paragraph; undo-all of 1500 keys grows the heap by about 1 MB), `styles`, `docx-read`, `docx-write`,
  `docx-edit` (extension elements, edits replacing raw properties), `docx-roundtrip` (read -> write -> read equal;
  textutil output; real files on the machine only with `MOREAPPS_REAL_DOCX=1`, see below), `docx-corpus-fixes` (regressions the corpus found),
  `docx-compare` (the `assertSameDoc` helper), `docx-package` (content-type repair; valid fixtures' types
  unchanged; the linter on `newDoc` output and on its own cases), `fontmap`, `fontload`, `fontfiles`, `word-view` (Info, Fmt, LineLayout), `linelayout` (offsets, and the same lines as the stub's layout, `old-render.mjs`, on 200 generated paragraphs), `positionmap` (caret, hit test, Home/End, Up/Down, selection rectangles; `hitTest(caretRect(off))` round trip on 500 generated paragraphs), `doclayout` (the page-width column, items, caret/hit/selection rectangles, 50,000 paragraphs laid out < 1.5 s and select-all drawn < 50 ms), `selection` (every movement command, boxes, words, select word/paragraph/all, text, clamp; random moves never land inside a grapheme), `snap` (`PosLine.snap` against the true boundaries at every offset of short stress texts), `hostile-view` (with `hostile-docs.mjs`: a 100,000-character word, 50,000 runs, 5000 tabs, absurd indents and page sizes, only inlines, tables first and last, an empty document; every call < 50 ms and the selection valid, run in a worker under a 10 s watchdog; 500 random key/mouse sequences; windowed grapheme steps in paragraphs over 4096 units equal the whole text's, flag runs included),
  `disc` (the build script against a temporary disc), `harness` (pins Node's native handling of the disc layout).
  Editing (deliverable 2): `document-edit` (history: coalescing, `markSaved`/`dirty`, `stateId`/`markSavedAt`, the 1000-step cap,
  `MAX_MERGE`, atomic rollback), `savestate` (untitled names, leaf names, the Save box's directory and name), `recent` (the Recent list: order, cap, case-insensitive dedupe, hostile entries, labels), `documents-roundtrip` (new and corpus documents saved through `DocSave` with stand-ins for `'riscos'`: read back equal, lint, `xmllint`), `ops-blocks` (`removeBlocks`/`insertBlocks`), `edit` (typing, Enter, Shift-Enter, Tab, overwrite),
  `editdel` (Backspace, Delete, word forms, ranges, section breaks, 50,000 paragraphs), `edit-prop` (seeded random
  editing with undo and redo back to the start), `layout-prop` (120 seeded editing/undo sequences, and 120 with lists (level changes and numbering on/off by `setProps numPr`): the layout made from the previous one equals a full layout, lines and labels and all), `list-display` (level indents under direct ones, label place, suffixes, lvlJc, alignment, justification, format, caret/click/selection at the text, reuse when a label changes), `edit-roundtrip` (random edits on fixtures and corpus files, write,
  read back, lint, `xmllint`, undo all; one corpus file in ten, or all with `WORD_EDIT_CORPUS=1`, ~2 min; the checks live in `roundtrip-lib.mjs`, shared with `format-roundtrip`: random formatting commands, refused ones changing nothing, counted per kind), `typing`
  (the coalescing rules with a fake clock), `keymap`, `editapply` (the commands and `stepEnd`, the caret after undo).
  Formatting (deliverable 4): `format` (`Format.query`), `formatset` (the commands, 50,000 paragraphs), `format-prop` (seeded random commands, undo and redo exact), `format-display` (highlight, superscript, subscript, justified text drawn), `formatapply` (the ids and arguments), `fontlist`, `numberfield`, `colourlist`, `rulermath`, `zoom` and `toolbarbuttons` (the WimpLib pure modules and `Zoom`), `format-roundtrip` (above); `keymap` has the format keys.
  Lists (deliverable 5): `numbering-read` (the definitions read), `numformat`, `listnumbers` (labels: counters,
  restarts, overrides, legal, style numbering, hostile templates), `list-prop` (random documents against a reference
  counter model written in the test), `list-display` (above), `formatlist` (setList, the next defined level,
  `hasList`), `parind` (the drawn indents, the ruler and Ctrl-M in lists), `editlist` (Tab, Shift-Tab, Backspace,
  Enter), `list-roundtrip` (random list commands on `list-fixtures.mjs` documents and the corpus sample: write, read
  back, lint, `xmllint`, undo all, the numbering part's bytes unchanged; `roundtrip-lib.mjs` `keep`).
  The unit suite is about 1505 tests and runs in about 35 s.
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
  clicks below the text), `word-documents-hostile.mjs` (the documents against hostile use; 500 random
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
guessed; section 4 does the same for formatting):

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
| G6 | label wider than its hanging space | text at the next 0.5" stop from the MARGIN (in-text tabs: from the left indent) |
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

## Known limitations and deferred items

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
* The stub: long words clip or run over, tabs never wrap, the layout is redone for every `moved` event (50 ms per step
  at 5000 paragraphs), `lineRule` exact/at-least is ignored, theme fonts are taken to be Calibri, the extent is clamped
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
