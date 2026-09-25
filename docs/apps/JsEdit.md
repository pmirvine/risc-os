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
| `lists.js` | Throwback and Functions windows |
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
* Modes: read from `<JsEdit$Dir>.Modes` (else the copies in `src/apps/JsEdit/Modes`); format in `Help.txt`.

Tests: `node --test tests/jsedit` (lexers without a browser; the editor in the desktop).
