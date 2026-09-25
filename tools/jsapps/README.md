# Writing Desktop Applications in JavaScript — the second tutorial's sources

The book `$.Manuals.JSApps` and its examples `$.Examples.JSApps`, built by `node tools/disc-jstutor.mjs --book jsapps`
with the same tools as the first book (`tools/jstutor/README.md`: directives, HTML subset, the style guide —
all of which apply here too). Tests: `node --test tests/jsapps` (`JSBOOK=jsapps` for the harness and shots:
`JSBOOK=jsapps node tools/jstutor/shots.mjs …`).

```
book.json, book/<Page>.htm, runs/<Page>.json, pics/   as in the first book
examples/        the applications, one directory per chapter stage (below)
toolkit/<Module> the reader's toolkit modules (JSScript modules). An application directory lists the ones it uses
                 in a file Toolkit.list; the build copies them into its Toolkit directory
```

## The applications

**Part One** builds **!Contacts**, an address book; **Part Two** builds **!Organiser**, a personal organiser in
the spirit of Lotus Organizer (a ring binder with coloured section tabs) that reuses !Contacts' modules for its
Address section. Every chapter ends with a complete, working application directory:

| chapter | directory | |
|---|---|---|
| 1–8 | `!Contacts1` … `!Contacts8` | the stages |
| 9 | `!Contacts` | the finished address book |
| 10–15 | `!Org10` … `!Org15` | the stages |
| 16 | `!Organiser` | the finished organiser |
| 17 | `!Org17` | !Organiser with the reader's own text area in place of the desktop's TextArea |

Each is a module-based application directory like book 1's `!Snake`: `!Boot`, `!Run`, `!Sprites`
(`!Sprites.sprites.json`), `!Help`, `!RunImage` (`export default function start(task, ctx)`), the app's own
modules (`Model`, `Main` parts …), and `Toolkit.list`. Stages change only what their chapter teaches; everything
else is carried forward unchanged, so a reader can compare one stage with the next.

## The toolkit (the reader builds it; each module is final once introduced)

Kept small (each under ~150 lines, lines ≤ 70 characters), with a test in each app's `Check` program.

| module | chapter | what |
|---|---|---|
| `Emitter` | 1 | `class Emitter { on(type, fn) → off(); emit(type, data) }` |
| `ListView` | 2 | a scrolling, selectable list of rows drawn on a window's canvas: columns, Select/Adjust selection, double-click to open, keyboard movement, events `select`, `open`, `menu` |
| `Form` | 3 | a dialogue box made from a list of fields (labels, writable icons, options), OK/Cancel, Return/Escape, validation; `get()` / `set(obj)` |
| `Toolbar` | 5 | a pane of buttons (sprites from the app's `!Sprites`) along a window's edge, with help and shading |
| `Undo` | 9 | a stack of commands `{ do(), undo(), name }` |
| `Formats` | 8 | vCard 3.0 (reads 2.1) and CSV (RFC 4180) read/write (iCalendar added in 16 as `ICal`) |
| `Dates` | 11 | day keys `YYYY-MM-DD`, adding days, weeks starting Monday, month grids, formatting |
| `Binder` | 10 | the ring-binder spread: pages, coloured section tabs, turned-up corners |

The desktop provides the rest (windows, icons, menus, panes, `saveAs`, `dragSave`, `choices`, `TextArea`,
`formatTime`, …: see `src/core/jsrun.js` and `docs/CORE_API.md` §11a).

## Style

As the first book (`tools/jstutor/README.md`), for readers who have finished it. New JavaScript is introduced as
it's needed (classes, destructuring, spread, `Map`/`Set`, Promises, `Date`) and gathered in appendix A. The
RISC OS Style Guide (Acorn, 1993) is quoted for the conventions the apps follow: `*` in the title when changed,
Discard/Cancel/Save, Choices (Default/Save/Cancel/Set), F3 save, F4 find, F6 sort, F8/F9 undo/redo, Ctrl-A select
all, colour only inside the data area and never alone. Each chapter: what we'll add, the plan, the code (by
module, in listings with line ranges), trying it, how it works, Summary, Exercises, Answers.
