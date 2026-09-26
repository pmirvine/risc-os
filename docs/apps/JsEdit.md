# !JsEdit — the programmer's editor

`$.Apps.!JsEdit` (disc: `tools/disc-jsedit.mjs`; code: `src/apps/JsEdit/`). Not part of RISC OS 3.71: a
programmer's editor in the style of the period's StrongED and Zap, for JavaScript (JSScript files run by
`*JSRun`, `src/core/jsrun.js`), BBC BASIC listings, Obey files, JSON and text. It is built on !Edit's code, so
everything Edit does (menus, Find, keys, Save box, drag and drop, the desktop-wide selection) works the same.
The tutorial `$.Manuals.JSTutor` uses it.

## Files

| file | contents |
|---|---|
| `app.js` | descriptor: `appDir` on the hard disc, `sprites` from `!JsEdit.!Sprites`, `edits: [0xF81]` (Shift-double-click on a JSScript file opens it here; double-click still runs it) |
| `main.js` | icon bar icon and menu (Info, Create ▸ JavaScript/BASIC/Obey/JSON/Text, Throwback, Quit), loading dropped files, throwback hook, PreQuit/Quit |
| `editor.js` | `JsEditApp extends EditApp` (options `JsEdit$Options` + `JsEdit$Display`, throwback, `openAt`) and `CodeText extends TextState` (mode, toolbar pane on each window, window menu, Run, syntax check, completion and Functions hooks, comment toggle) |
| `view.js` | `CodeView extends EditView`: token cache per line, gutter with line numbers and error marks, colouring (system font strips per colour, bold by overstrike), caret-line shading, bracket matching, smart indent (Return, closers, Tab/Shift-Tab on lines), the toolbar inset |
| `modes.js` | mode files (parser), lexers `c-like` (comments, strings, template strings with `${…}`, numbers, regex literals), `basic` (line numbers, keywords from BBC BASIC's tables, REM, `&`/`%` numbers, PROC/FN, `*` commands), `obey`, `text`; line state carried between lines |
| `complete.js` | the completion list (mode `Complete` entries, keywords, words in the text; member completion by object or by member name) |
| `lists.js` | Throwback and Functions windows (`ListWindow`) |
| `dirs.js` | directory views: `DirViews` (all of them: opening, remembering them in `Choices:JsEditDirs`, Find in files into a `Found` list) and `DirView` (one: the tree, its menu, keys, drags) |
| `Modes/*` | JavaScript, JSON, BASIC, Obey, Text — copied to `!JsEdit.Modes` on the disc, where users can change them |
| `Help.txt`, `sprites.json` | `!Help`, `!Sprites` (character maps, `tools/lib/spritewrite.mjs`) |

## Behaviour

* Windows: 740×520 (max), a toolbar pane (`Save Run Check Find Goto Functions Errors`, mode and Line/Col) across
  the top — the text starts below it (`CodeView.inset`); line numbers in a grey gutter (`Display ▸ Line numbers`).
* Colouring: each line is lexed with the state at its start (block comment, template string) and cached; an edit
  drops the cache from its line on. Colours per token class from the mode (`Colour keyword 8 bold`).
* Keys: Edit's, plus Return (indent kept, one step more after `{ ( [`, and a closer on its own line between a
  pair), a closer typed at the start of a line outdents, Tab/Shift-Tab (lines of the selection, or to the next
  step), Ctrl-Space completion, Ctrl-R run. `Edit ▸ Comment` toggles line comments.
* Completion: as you type a name (2+ characters) or after `.`; Up/Down, Return/Tab, Escape. `Display ▸ Completion`.
* Syntax check: 0.9 s after typing stops (`checkSyntax` in jsrun.js: the program is parsed, not run; a module's
  import/export lines are blanked first); the first mistake is marked in the gutter and shaded.
* Run: saves (a new text gets the Save box first), checks, then `*Run`s the file (an application's `!RunImage`:
  the application directory, so its `!Run` sets things up).
* Throwback: `os.hooks.throwback({path, line, message})` is called by jsrun for every program error; !JsEdit takes
  those for files it has open (Throwback window, gutter mark, caret to the line) and jsrun then shows no error box.
* Functions: the mode's `Functions` patterns over the text; click an entry to go to it.
* Dark theme (`Display ▸ Dark theme`, `JsEdit$Display` `dark`): the window's own colours from `THEMES` in
  view.js (background, selection band, caret line, gutter), the text colours from the mode's `Dark` lines
  (defaults after VS Code's Dark+). Colours in mode files are Wimp numbers or `#rrggbb`.
* Fonts: the system font by default; any font in `Display ▸ Font list`, including the Nerd Fonts
  (`tools/nerdfonts.mjs`). Bold keywords use weight 700 with outline fonts, an overstrike with the system font.
* Modes: read from `<JsEdit$Dir>.Modes` (else the copies in `src/apps/JsEdit/Modes`); format in `Help.txt`.

* Directory views (`dirs.js`): a directory or application dropped on the icon bar icon (or `Open directory ▸`
  on its menu, or `*Run <JsEdit$Dir> <directory>`) opens a tree in the Filer's small-icon style (`fileSprite`,
  directories first, then names), drawn on a canvas, 22 px rows. Sub-directories fold open by their arrow,
  double-click or Right/Left; applications run on double-click but open by their arrow. Double-click / Return
  edits text files (a type one of the modes colours, Text or untyped: `isTextType`) and runs anything else with
  `os.filer.run` (Shift: edit as text). Texts being edited are bold, `*` when modified (`CodeText.updateTitles` /
  `dispose` call `dirs.marks()`). It follows `vfs.on('change')` for the directories shown. Menu: the selection
  (Open, Edit as text, Rename ▸, Delete — asks, then Filer_Action —, Open in Filer), New file ▸ (type from a
  `/js`, `/bas`, `/json`… suffix, else the commonest text type beside it, else JSScript; it opens at once), New
  directory ▸, Select all, Clear selection, Expand all, Collapse all, Find in files ▸ (case-insensitive, text
  files up to 1 MB, into a `Found` list: click a line to go there), Open in Filer, Refresh. Renaming moves open
  texts with their files. Drags: out to a Filer window (or a directory in it, or another view) copies (Shift
  moves), elsewhere a DataLoad (e.g. into a text: the path); files dropped in are copied (Shift: moved) into the
  directory under the pointer. Keys: Up/Down, Page Up/Down, Right/Left, Return, Delete, Escape, F5, letters.
  Views (with their open sub-directories and places) are saved when they change and when !JsEdit quits, and
  reopened when it starts.

Tests: `node --test tests/jsedit` (lexers without a browser; the editor in the desktop).
