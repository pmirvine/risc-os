# !Journal

Code: `tools/journal/!Journal/` (JSScript modules, no extensions), put on the disc by `node tools/disc-journal.mjs`
(run by `tools/build.mjs`), which also copies the JSApps toolkit modules it uses (`Emitter`, `Dates`, `Form`,
`ListView` from `tools/jsapps/toolkit`) into `!Journal.Toolkit` and draws the sprites (`tools/journal/icon.mjs`). App
dir: `ADFS::HardDisc4.$.Apps.!Journal`. User guide: `$.Docs.Journal` (`tools/docs/Journal`); the app's own `!Help`
is in the source directory. Not part of RISC OS 3.71.

A diary with a page a day. Like !Lander2 it lives **on the disc** as JavaScript that `*JSRun` loads
(`src/core/jsrun.js`, CORE_API §11a), so users can read and change it in !JsEdit, and it only uses the public
`riscos` module. The one shared-code change was to the TextArea (selection, undo, clipboard, `grow`), see
`docs/CHANGES_NEEDED.md` ("!Journal").

## Storage

A journal is a folder (`ADFS::HardDisc4.$.Journal` by default, `Choices:Journal` `folder`): `<root>.<yyyy>.<mm>.<dd>`,
one Text file (&FFF) per day with something in it. Optional `Mood: …` / `Weather: …` header lines, then a blank
line, then the body (`Days` `parse` / `format`); any word works (unknown ones draw as a grey face / cloud). An
empty day is deleted, and its month / year folders once empty. Timestamped entries are just `HH:MM` lines (Ctrl-T).

`Days.Journal` scans the tree once (`days`: a Set of `yyyy-mm-dd` keys, `stamps`: each file's date), caches entries,
and listens to `vfs` `change` events for folders inside it: a file whose date stamp differs from the one it last
wrote or read was changed by another program (!Edit) → `'changed' {key}` (an open page reloads, or asks Keep mine /
Load new if it has unsaved changes); days added / removed → `'days'` (the calendar redraws).

**Lock** (`Lock`): `<root>.Lock` (type &1C6) holds `Journal lock 1`, a random 16-byte salt and a sealed check
string (base64). The key is PBKDF2-SHA-256 (150 000 rounds) of the password → AES-GCM-256 (Web Crypto). A sealed day
is `JLK1` + 12-byte IV + ciphertext, type &1C6 (`File$Type_1C6 Journal`, `Alias$@RunType_1C6` runs !Journal on it;
sprites `file_1c6` / `small_1c6`). `Journal.read` unseals when the bytes start `JLK1`, so a half-converted journal
still reads. Lock / Change / Remove password re-write every day (`reseal` in `!RunImage`). The password is never
stored; forgetting it loses the pages.

## Modules

| file | what |
|---|---|
| `!RunImage` | single instance (DataOpen to the running one), the `app` object (`ready()` opens the journal, asking for a password; `openDay`, `openCalendar`, `useFolder`, `openPath`, `streak`, `settleAll`/`closeAll`), icon bar (Select today, Adjust calendar, menu Info/Today/Calendar/Find/Password/Choices/Quit), drops (folder = use it, day file = open it, other Text = append to today), PreQuit, On this day at start |
| `Days` | the journal on disc (above), `parse`, `format`, `countWords` |
| `Lock` | password lock (above) |
| `DayWindow` | a page: Mood / Weather display fields + pop-up menus, word count, a `grow` TextArea filling the window (extent follows it; `ignoreRight/ignoreBottom` so the window can be sized and the text re-wraps). Autosave 1.5 s after the last change; else `*` in the title and a Discard / Cancel / Save Form on close. Keys Ctrl-T, Ctrl-D, F3, F4, F5, Print, Ctrl-F2, Ctrl-Shift-Left/Right (turn the page in the same window). Menu Page (Info box, Save, Export, Print) / Edit / Insert (Time, Date, Prompt) / Mood / Weather / navigation |
| `Calendar` | month grid drawn with `useCanvas` (`paint(g)` also prints it), arrow and Today icons, day click opens a page, arrow keys; menu Today / Go to / Find / On this day / Export / Print month |
| `Finder` | Find window (writable + ListView of matches with snippets; double-click opens the day with the match selected), On this day, Go to (Form, `Dates.parseDay`) |
| `Export` | text, HTML (Latin-1 `charset`), a Draw month page (A4, via `DrawFile`), Save boxes, `os.printers.print` for a day (text) and a month (the calendar canvas) |
| `DrawFile` | a small Draw file writer: font table, text objects, paths (points → Draw units ×640) |
| `Symbols` | moods, weather, their drawings, the prompts |
| `Settings` | Choices (Form: folder, autosave, On this day, font, size), `askPassword` (writables with `D*` validation), `say` (a "Message from Journal" box) |
| `Check` | a self test that needs no windows (double-click it): parse/format, a journal on the RAM disc, find, exports, the lock |

## Tests

`node --test tests/journal`: `tools/disc-journal.mjs --check` (Latin-1, 72 columns) and `tests/journal/journal.mjs`
(Playwright, Acorn buttons): Check, On this day at start, typing / Ctrl-T / autosave to the file, mood and weather
pop-ups, Insert > Date and F8, the calendar, a change made by another program, Find, turning the page, a Draw month
read back by `src/apps/Draw/drawfile.js`, lock → quit → wrong / right password → remove password, autosave off and
the close box. Screenshots `journal-day.png`, `journal-calendar.png`. The TextArea additions are tested in
`tests/core/test-appkit.mjs`.
