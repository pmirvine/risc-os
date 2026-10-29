# RISC OS 3.71 in the browser

A faithful recreation of the Acorn RISC OS 3.71 desktop (RiscPC / A7000, 1996-98) that runs entirely in a web
browser: the Wimp and its window furniture, the icon bar, Filer, Pinboard, Task Manager, a persistent hard disc, a
BBC BASIC V interpreter, and the ROM and hard-disc applications. It is built from the original resources (sprites,
window templates, Messages files, help text, sample files) extracted from the RISC OS 3.71 source tree.

Plain modern JavaScript ES modules. There is no bundler, no framework and no runtime dependency.

This is an unashamedly retro experience from when I owned a RiscPC with a StrongARM CPU. For a modern twist on the Acorn experience see [ACORN-2026](https://github.com/zolbatar/Acorn-2026)

## Screenshots

| | |
|---|---|
| ![Desktop welcome banner](docs/screenshots/fid-banner.png) Boot: the Desktop welcome banner | ![Filer with menu](docs/screenshots/fid-filer-menu.png) Filer window and menu |
| ![Draw](docs/screenshots/fid-draw.png) !Draw with its toolbox, showing a tutorial Drawfile | ![Paint](docs/screenshots/fid-paint.png) !Paint: sprite file, colours and tools |
| ![Task window running BASIC](docs/screenshots/tw-basic.png) Ctrl-F12 task window running BBC BASIC V | ![Original SciCalc](docs/screenshots/bw-scicalc.png) The original tokenised !SciCalc, running unmodified through the Wimp SWI bridge |
| ![Maestro](docs/screenshots/acc-maestro-play.png) !Maestro playing one of the original tunes | ![Patience](docs/screenshots/div-patience.png) !Patience |
| ![Meteors](docs/screenshots/div-meteors-play.png) !Meteors, ported from the original assembler | ![Task Manager](docs/screenshots/fid-taskmanager.png) Task Manager |
| ![Configure](docs/screenshots/acc-configure-main.png) !Configure | ![BASIC Mandelbrot](docs/screenshots/basic-mandel.png) BBC BASIC V graphics (standalone `src/basic/demo.html`) |
| ![Lander](docs/screenshots/div-lander.png) !Lander: David Braben's 1987 demo (JavaScript port; the original runs on the ARM2 emulator if you supply it) | ![Hopper](docs/screenshots/div-hopper.png) !Hopper, from RISC OS Open's sources |
| ![Plasma](docs/screenshots/basic-plasma.png) `$.Demos.BASIC.Plasma`, one of the BBC BASIC demo programs | ![T1ToFont and Chars](docs/screenshots/tierb-t1tofont-chars.png) !Chars showing a Type 1 font converted by !T1ToFont |
| ![JsEdit](docs/screenshots/jsedit.png) !JsEdit, the programmer's editor, completing a name in the Snake game's source | ![Programming in JavaScript](docs/screenshots/jstutor.png) *Programming in JavaScript*, the tutorial book, in !Bookworm |
| ![Browse](docs/screenshots/browse.png) !Browse showing today's web, in tabs (`node serve.mjs --browser`) | ![Browse select menu](docs/screenshots/browse-select.png) A web page's drop-down list as a RISC OS menu |
| ![Lander II](docs/screenshots/div-lander2.png) !Lander2: Lander II, a Zarch-like game grown from Lander, written in JavaScript on the disc | ![Lander II title](docs/screenshots/div-lander2-title.png) Lander II's title page |
| ![Pacman](docs/screenshots/games-pacman.png) !Pacman: the 1980 arcade game, written in JavaScript on the disc with the shared !GameLib | ![Pacman title](docs/screenshots/games-pacman-title.png) !Pacman's title page |

## Running it

```sh
node serve.mjs            # static server on http://localhost:8371/ (node serve.mjs 9000 for another port)
node serve.mjs --host Work=~/riscos-files   # ... with a host folder as HostFS::Work (see HostFS below)
node serve.mjs --browser  # ... with a real web browser engine for !Browse (see !Browse below)
node serve.mjs --lan      # ... answering other computers on the network too
node serve.mjs --public-url=https://host/ro   # ... behind a trusted reverse proxy (see deploy/)
```

Further options: `--public-url=<url>` (with the environment variable `RISCOS_PROXY_SECRET`, at least 16
characters) lets HostFS and !Browse's engine answer requests that arrive through a reverse proxy which adds the header
`X-Proxy-Auth: <secret>` and passes the public Host; `--browser-arg=<flag>` (repeatable; or `RISCOS_BROWSER_ARGS`) adds
Chrome flags; `--browser-idle=<seconds>` stops Chrome after that long with no desktop connected (default 300, 0 =
never) and restarts it on demand. `--browser-check-private` (tests only; not with `--public-url`) lets the frame check
reach private addresses. `deploy/` has a complete deployment (Docker, Apache, firewall, backups; see
`deploy/README.md`) and the user guide is `$.Docs.Server`.
`./deploy.sh` syncs a checkout to the servers afterwards (the full deployment and/or a plain static copy);
it reads the server details from a git-ignored `.deploy.env` (see `deploy.env.example`).

`serve.mjs` only answers this computer unless `--lan` (every network interface) or `--listen=<address>` is given;
HostFS and !Browse's engine only answer this computer, even with `--lan`, unless `--public-url` is given, when they also
answer requests that come through the trusted proxy (and carry its secret).

Open `http://localhost:8371/` in a recent Chrome, Firefox or Safari. Any static web server works. The first visit in a
session shows the boot sequence; later reloads go straight to the desktop.

**Start with `$.Docs`** on the hard disc (click the hard disc icon, then open Docs): a guide to each thing this
desktop adds to RISC OS 3.71 — !Browse, !GraphTask, HostFS, !JsEdit, !Journal, !Letters, the game library GameLib, the maze game !Pacman, the machine's memory, using the desktop from another computer, programming in JavaScript and the
game Lander II — with `Contents` listing them. The sources are in `tools/docs/` (`node tools/disc-docs.mjs` puts them on the disc).

URL options: `?fast=1` (skip the boot screen), `?zoom=2` (double-size pixels), `?buttons=menu` (two-button mapping:
right = Menu, Shift + left = Adjust), `?open=<dir>`, `?run=<app>`, `?cmd=<*command>` (`?run` and `?cmd` work only on localhost), `?reset=disc|cmos|all` (see below).

A cold load fetches about 0.9 MB (uncompressed) in about 130 requests. On localhost the desktop is ready in about
1.4 s, most of which is the boot screen (under 0.1 s with `?fast=1` and a warm cache). Only small application
descriptors load at start-up. Each application's code, templates, sprites and the BASIC interpreter / VDU load the
first time they are used, and sprites are fetched one PNG at a time as they are needed.

## Controls

| RISC OS | Browser |
|---|---|
| Select | left button |
| Menu | middle button, or Ctrl + right click for mice and trackpads without one (Ctrl + left click works too; macOS turns it into a right click) |
| Adjust | right button |

This is the Acorn mouse layout (as in RPCEmu and Arculator), and Shift keeps its RISC OS meaning, e.g.
Shift-double-click opens an application as a directory or a file as text. For a two-button mapping (right = Menu,
Shift + left = Adjust) use `*Configure Buttons Menu` or `?buttons=menu`.

Action buttons are drawn pressed in while you hold a mouse button on them, as in RISC OS 4 (3.71 itself didn't);
`*Configure WimpPress Off`, or !Configure's Window manager pane, turns this off.
| F12 | the `*` command line (Return on an empty line goes back to the desktop) |
| Ctrl-F12 | a new task window |
| Shift-F12 | bring the icon bar to the front / send it back |
| Ctrl-Shift-F12 | Shutdown (Task Manager) |
| Escape | cancel menus, dialogue boxes and drags; stop BASIC programs |
| Copy / Insert / Home / PageUp / PageDown | End / Insert / Home / PageUp / PageDown |
| mouse wheel | scrolls the window under the pointer |
| Shift-Select on a close icon | iconise the window onto the Pinboard |

Dragging works as on RISC OS: drag files between Filer windows (Shift = move), onto applications, onto the icon bar
or onto the backdrop (to pin them). Drag the file icon in a Save box to a Filer window or into another application.

### Resetting

Files written to the hard disc (`ADFS::HardDisc4`) and floppy (`ADFS::0`) are kept in IndexedDB as an overlay over the
supplied disc. The configuration ("CMOS RAM") is kept in localStorage. The RAM disc lasts only for the session. To
reset:

* `*ResetDisc` discards every change to the hard disc and floppy, restoring the disc as supplied, and restarts.
  `*ResetDisc -cmos` also resets the configuration.
* `*ResetCMOS` resets the configuration only (!Configure settings, zoom, mouse buttons, Pinboard, alarms, printers).
* Hold **Delete** while the page loads ("Delete-power-on") to reset both. Hold **R** ("R-power-on") to reset the
  configuration only.
* Or load `?reset=all`, `?reset=disc` or `?reset=cmos` (it asks first, as any web site could link to that address).

### HostFS: folders from this computer

As with RPCEmu's or VirtualRPC's HostFS, folders on the host machine can be mounted as RISC OS discs,
`HostFS::<name>.$`. Folders are mounted with the application `$.Utilities.!HostFS`, which sits on the right of the
icon bar while it runs (like !Access+ for ShareFS): Select mounts a folder, and its Mounts window lists the folders
mounted and remembered, each with a choice of being mounted when the desktop starts. The mounts stay when it quits.
Each mounted folder gets an icon on the left of the icon bar (Select opens it; Menu has Rescan, Free, Mount at
start-up, Dismount and Forget) and can be used like any other disc: open and save files in applications, copy, rename and delete in the
Filer, run BASIC and Obey applications from it, `*Cat HostFS::Work.$`. A guide is on the hard disc itself, in
`$.Docs.HostFS` (source `tools/docs/HostFS`). On a deployed server (`deploy/`) the folder given as `--host Server=/data`
is mounted on every computer that opens the desktop, so `HostFS::Server` is shared between them (the hard disc stays
per browser); see `$.Docs.Server`.

* **Click !HostFS's icon** (Chrome, Edge and other Chromium browsers) to pick a folder. Changes are written back to
  the folder. The browser remembers the folder: after a reload it comes back, or shows a "no disc" icon to click to
  give permission again.
* **Or name folders when starting the server**, which works in every browser and also keeps RISC OS datestamps:
  ```sh
  node serve.mjs --host Work=~/riscos-files --host-ro Photos=~/Pictures
  ```
  These mount at start-up (!HostFS menu > Server folders, or `*HostMount Work`). The server only answers
  requests from this machine, and only for the folders named.
* **Firefox and Safari** can't write to a picked folder: *Mount read-only...* on !HostFS's menu, or dropping a
  folder onto the page, mounts a read-only snapshot. (In Chromium a dropped folder mounts read-only at first, as the
  browser only asks for write access after a click: choose *Allow changes* from its icon's menu.)

File types follow RPCEmu's convention: a `,xxx` suffix gives the type (`Sprites,ff9`), `,llllllll-eeeeeeee` the
load and exec addresses of an untyped file, otherwise the extension is looked up (`photo.png` is a PNG, &B60;
see `src/core/hostfs/mimemap.js`) and anything else is Text. Files saved from RISC OS get a suffix only when their
type can't be told from the name, so a PNG is saved as `photo.png` but a sprite file as `Sprites,ff9`. The host's
`.` and RISC OS's `/` swap places (`photo.png` is `photo/png`), as do space and hard space, `#` and `?`, `$` and
`<`, `^` and `>`; characters RISC OS can't have in names are shown as `_`, and the file keeps its host name. Files
the host has as read-only show as locked. Mounting a folder holding more than 20,000 objects asks first. Commands: `*HostFS`,
`*HostMount [<server folder>]`, `*HostDismount <name>` (or `*Dismount HostFS::<name>`), `*HostMounts`.

Limits: a folder picked in the browser gets "now" as the date of anything saved to it (the API can't set file
dates), and renaming a directory there copies it. Changes made on the host show up when a Filer window opens the
directory, when the browser window gets the focus again, or at once where the browser or server can watch the
folder.

### !Browse: the web

`$.Apps.!Browse` is a web browser in the style of Acorn's Browse (its button bar, URL bar and status bar with the
spinning globe), for today's web. Started with `node serve.mjs --browser`, the server runs Chrome out of sight
(Chrome for Testing, Chromium, Chrome or Edge, whichever it finds; `--browser=/path/to/chrome` picks one) and
!Browse shows its pages: scripts, logins (kept in `~/.riscos-browse`, or `--browser-profile <dir>`), video, pages'
sound (with Chrome for Testing or Chromium: `npx @puppeteer/browsers install chrome@stable`), tabs and pop-ups.
The RISC OS way: a page's drop-down lists are RISC OS menus, its messages are error boxes, downloads come with a
Save box to drag to a Filer window, a page asking for a file gets one dragged from the Filer, the window's scroll
bars follow the page, and Adjust on a link opens it in a tab behind. File > Save keeps the HTML, Save location a
URI file, Print to PDF a PDF; the hotlist and history are kept in Choices. URI (&F91) and URL (&B28) files open
in !Browse, and other programs (and !Bookworm's links) use `*URLOpen_http <address>`.

Chrome runs headless over a private pipe (no debugging port is opened); pages reach the desktop as a stream of
JPEG frames, and the mouse and keys go back. Without `--browser` (any other server, or from another computer)
!Browse shows pages in a frame instead: many sites refuse that, and it offers to open them in your own browser.
Behind a trusted proxy (`--public-url`, see `deploy/`) the engine also serves the computers that reach it that way;
it has one Chrome profile (shared logins), and stops Chrome when idle (`--browser-idle`). Its Chrome is not filtered
for private addresses: the deployment's container firewall does that.
A guide is on the hard disc, in `$.Docs.Browse` (source `tools/docs/Browse`); the design is in `docs/apps/Browse.md`.

## What's included

**Desktop:** Wimp (3D window furniture from the Tools sprites, textured backgrounds, menus with dialogue-box
submenus, drags, interactive help, error boxes); icon bar with floppy, hard disc, RAM disc, Apps and Display Manager
icons; Filer (large/small/full info, sorting, copy/move/delete/rename/access/count/find/set type, Filer_Action
windows); Pinboard (backdrop textures and pictures, pinned files, iconised windows, persistent); Task Manager
(task display, memory bars, New task, Quit task, Exit, Shutdown); F12 command line with about 100 `*` commands
(Cat, Ex, Copy, Wipe, Set, Alias, If, Obey, Configure …); system variables with GSTrans; `!Boot`.

**The machine:** a StrongARM Risc PC with 256MB of RAM (the most a Risc PC takes), 2MB of VRAM and 4MB of ROM. Its
memory is simulated by one model (`src/core/memory.js`) that the Task Manager (with RISC OS 3.7's stepped memory bars,
so 256MB fits on the screen), !MemNow, `Wimp_SlotSize`, `*WimpSlot`, `OS_Memory`, `OS_ReadDynamicArea` and `*Status`
all read, so their figures agree: the screen in VRAM, the system areas, the tasks' slots, Next and Free. !Configure's
Memory window has a RAM size (this desktop's addition, also `*Configure RAMSize`): 4MB (an A7000, no VRAM, where
memory really is short and programs can fail to start) up to 256MB, applied at once. RISC OS 3.7's limits hold: a
28MB application slot, a 128MB RAM disc. Guide: `$.Docs.Memory`.

**BBC BASIC V 1.16:** an interpreter with the full language, an inline ARM assembler and ARM2 emulation for CALL/USR,
and a VDU driver with screen modes, graphics, sprites and teletext. It runs full screen (F12 `*BASIC`), in task
windows, and as desktop applications through a Wimp SWI bridge, so original tokenised BASIC Wimp programs run
unchanged (for example the original !SciCalc).

**BASIC programs in windows:** `$.Apps.!GraphTask` (after David Ruck's !GraphTask) runs non-desktop BASIC programs
in desktop windows, each with its own screen mode, palette and teletext, multitasking. Drag a BASIC file to its icon
bar icon, or click the icon for a `>` prompt; `*GraphTask <file>` (or `*BASIC -window <file>`) does it from Obey and
`!Run` files. The window menu has Suspend, Kill, Restart, Speed (ARM2 … StrongARM, Unlimited), Scale, Full screen
(Alt-Return) and Save screen (a sprite). The Task Manager's menu has "Graphics task window", and !JsEdit's Run runs
BASIC listings this way. Double-clicking a BASIC file still runs it full screen, unless !GraphTask's Choices say
otherwise. Guide: `$.Docs.GraphTask`; developers: `docs/apps/GraphTask.md`.

**A journal:** `$.Apps.!Journal` is a diary with a page for every day. Select on its icon bar icon opens today's
page to type into (Ctrl-T starts an entry with the time); Adjust opens a month calendar that marks the days written
on with their mood and weather. Pages save as you type, as Text files in `$.Journal.<year>.<month>.<day>` that
!Edit can read (the Journal notices changes made there). Find (F4) searches every day, On this day looks back at
the same date in other years, prompts help when there is nothing to say, and a month or the whole journal exports
as text, a web page or a Draw calendar page; pages print through !Printers. Password > Lock journal scrambles every
page with AES (through the browser's Web Crypto) until the password is given. It is written in JavaScript on the
disc, like Lander II. Guide: `$.Docs.Journal`; developers: `docs/apps/Journal.md`.

**A word processor for Microsoft Word files (early steps):** `$.MoreApps.!Letters` opens a `.docx` (double-click one, on
the hard disc or a HostFS drive; or drop it on its icon bar icon) in a window with its text, headings, bold, italic,
underlining, colours, sizes, indents and alignment, in a column as wide as the text on its page, shown as pages one below the other as they will print (Print layout; Draft
shows one long page), each a sheet of its paper (a new document shows a whole empty page, as in Word; Info says what the file holds).
Tables are drawn (see Tables below; a few kept exactly as they were are a grey box), footnotes and the like are shown as boxes (PNG, JPEG and GIF pictures are drawn: see Pictures below), and the window menu's *Save* writes the document
back (*Save as* under a new name the window takes, *Save a copy* as a copy) keeping **everything** in it (tables, pictures, comments, tracked changes, headers and footers, custom XML). Text
can be selected with the mouse and keys (caret, drag, double/triple click, Shift+arrows, Ctrl-A) and **typed**: click
in the text and type (any Unicode, dead-key accents, input methods and emoji pickers, through an opt-in text-input
caret in the core), with Enter, Shift-Enter, Tab, Backspace, Delete, Ctrl-Backspace/Delete, Insert (overwrite), and
undo and redo (Ctrl-Z, Ctrl-Y or Ctrl-Shift-Z, or the Edit menu; a word is one step, 1000 steps are kept); a `*` in
the title shows unsaved changes (Save clears it). To try it, double-click a `.docx`, click
in the text, type, and press Ctrl-Z. Selected text can be **formatted** with Word's keys (Ctrl-B/I/U, Ctrl-L/E/R/J,
Ctrl-Shift->/<, Ctrl-=, Ctrl-M, Ctrl-Space; Shift-F3 changes the case of the selection or of the caret's word: capitals, small letters, Title Case; `$.Docs.Letters`, part 5) or the window menu's Format submenu (font, size, colour, highlight, Change case >,
alignment, indent, the styles the document has (paragraph, character and linked; Styles, below), more colours as swatches or RRGGBB) or the **toolbar**
across the window's top (style, font and size fields with popups, bigger/smaller, B I U S, superscript/subscript, text
colour and highlight, alignment, indent, clear formatting: pressed in or filled in from the selection); at a caret a
character format applies to the text typed next (moving the caret, undo or Enter forgets it). The text of a link,
field, tracked change or content control is not changed by formatting. A **ruler** under the toolbar shows the
paragraph's indents: drag its markers (first line, hanging, left, right; 1/16-inch steps, Shift for free) to indent
every selected paragraph in one undo step; it shows the tab stops too (a style's grey): click the ruler to add one of
the kind in the box at its left end (click the box: left, centre, right, decimal), drag one to move it or down off the
ruler to remove it (a paragraph with stops !Letters keeps as the file has them, or over 64 of its own, beeps instead; Format > Tabs... opens the Tabs box for numbers, leaders, bars and the document's default tab stop; `$.Docs.Letters`, part 6); View > Ruler hides it (margins are shown but not editable). Format > Borders and shading... draws lines round the selected paragraphs and a fill behind them, or behind the selected text only, in one undo step (borders or shading the file gives in theme colours are kept as they are: changing them beeps; paragraphs with the same borders and indents are drawn as one box; `$.Docs.Letters`, part 6). The window menu's **Zoom** (50% to 200%, Zoom in/out) or Ctrl+wheel shows the page larger or smaller, per
window (no zoom keys; Ctrl+= and Ctrl+Shift+= are subscript and superscript). To try formatting: open a `.docx`,
select some words, press Ctrl-B or choose Format > Colour, drag a ruler marker, and Ctrl+wheel; Ctrl-Z undoes each.
**Lists** show their bullets and numbers as Word would (still to be checked in real Word; bullets from Symbol/Wingdings drawn as Unicode shapes; 1. a) i.
I. 01 1st; nine-level multilevel lists, legal 1.1.1, headings numbered by their styles; Word's level indents), renumbered
live as you edit; Enter continues a list, Tab / Shift-Tab at an item's start change its level (Shift-Tab anywhere in an
item), Backspace at an item's start takes its number away first, and Format > List has Demote, Promote and Remove from
list. **New lists:** the toolbar's second row has Bullets and Numbering buttons, each with an arrow opening a gallery (six
bullets, six numberings, None); Ctrl-Shift-L makes or removes a bulleted list; Format > List > Bullets > / Numbering >
give the same galleries, and Restart at 1, Continue numbering and Set numbering value... (a small box) change where a list
counts from. Typing `*`, `-`, `>`, `1.`, `1)`, `(1)`, `a.`, `A.`, `i.` and the like and a space (or Tab) at the start of
a paragraph makes it a list item (Ctrl-Z gives back what was typed; Format > AutoFormat lists turns it off, kept in
`Choices:Letters`). The definitions !Letters writes are Word's own gallery lists and are still to be checked in real Word. To
try lists: open a `.docx` with a numbered list, click at the start of an item and press Tab, Shift-Tab, then Backspace;
or click Numbering in a new document and type. A list's bullets and numbers cannot be defined by you yet; whole list
items (selected up to the start of the next paragraph) pasted into another !Letters document bring their list along as a
new list there (`$.Docs.Letters`, parts 4 and 7).
**Page and section breaks:** the window menu's *Insert* item (after Edit) has Page break (Ctrl-Enter, Ctrl on a Mac too),
Column break (Ctrl-Shift-Enter outside a table; in a table the key still splits it), Section break > Next page / Continuous, Symbol... (a window of characters: Latin-1, Latin Extended-A, Greek, Cyrillic, punctuation,
currency, letterlike and fractions, arrows, maths and shapes, with a Recently used row; click one and Insert, or double-click)
and Special character > (dashes, quotes, copyright and trademark signs, degree, the no-break space on Ctrl-Shift-Space,
the no-break hyphen on Ctrl-Shift-- and the optional hyphen), Hyperlink... (Ctrl-K, Cmd-K on a Mac: insert, edit or
remove a link to an http, https, mailto or ftp address or to a bookmark; never opened or fetched; Ctrl-click on a link
to a bookmark goes there; Edit hyperlink and Remove link on a link) and Bookmark... (Ctrl-Shift-F5: add a bookmark round the selection, Go to or Delete one by name;
Word's naming rules; the caret keys never stop at a bookmark and Backspace / Delete never delete one; an optional hyphen is an ordinary
character for them). A page break ends its paragraph (the rest starts the next, as Enter does) and starts a new page; in
Draft (or with View > Formatting marks) it shows as a dotted rule labelled "Page break". A column break goes in the same
way and starts the next column of a section set in columns (the next page after the last column, or with one column);
it is labelled "Column break". No break goes in a table's cell or a header or footer. Insert > Section break offers Next
page, Continuous, Even page and Odd page; the break shows (in Draft, or with Formatting marks) as a double dotted band labelled "Section break (Next page)", "(Continuous)", "(Even page)" or "(Odd page)"
under the last paragraph of the section, whose properties (page size, margins, headers, page-number start) the section
before the break copies. Delete at a section's end or Backspace at the start of the next one takes the break out; a
paragraph with Page break before set shows a dotted rule above it. A document opens in Print layout: its pages one below the other, with grey desk between them, and the second toolbar row
says which page the caret is on ("Page 3 of 12"); clicks in a page's margins or between pages go to the nearest line of the nearer
page, Up and Down cross from page to page and Ctrl-Page Down / Ctrl-Page Up go to the next / previous page's first line (also Edit > Next page / Previous page, since a browser may keep those keys); the window menu's **View** (after Insert) switches to Draft (one long page,
the quickest view, where breaks show as marks) and back, and its Formatting marks shows the breaks in Print layout too.
**Outline** shows the headings indented a quarter inch per level (the text under each one step further in) with a mark left of each paragraph: - a heading with text under it, + one whose text is folded away, o one with nothing under it, a small o ordinary text (tables and pictures count as text); a file saved in Word's Outline view opens in it. In Outline, Shift-Tab and Tab at the start of a heading promote and demote it (ordinary text promoted becomes Heading 1, Heading 9 demoted becomes ordinary text), and Ctrl-Shift-Up and Down move a paragraph, with any text folded under it and any field, bookmark or comment that runs on from it into other paragraphs (so they stay whole), above or below its neighbour (never past a section break). The Outline menu (in Outline only) has Expand, Collapse, Show level 1 to 9 or All (the headings down to that level, no ordinary text), Show first line only, Promote, Demote, Move up and Move down, and a double-click on a heading's + or - folds it away or opens it; what is folded away belongs to the window and is never saved in the file. The caret never goes into folded text: Find, Replace all and Go to open the headings over what they find, Return at the end of a + heading starts a new heading after its folded text, and Backspace or Delete that would join a paragraph to folded text beeps. **Web layout** shows the text as wide as the window (a quarter inch kept clear each side and the text a little in from the white area's edges, no page edges, headers or footers), and the lines break again when the window is resized (at most five times a second; a very long document breaks what is on screen first and the rest in the background). The next window opens in the view chosen last, or in Draft or Web layout when its file was saved in Word's Normal or Web view; the view is
never written to the file. Breaks are saved as Word saves them. **Pages:** Print layout breaks pages by Word's rules (page
breaks, page break before, section starts, widow and orphan control, keep with next, keep lines together; space before
dropped at the top of a page after a natural break; the blank page an even or odd page break needs is counted but not
drawn); a table carries on across pages, a row that does not fit is split between them with its borders closed, header
rows repeat at the top of each page (a click there goes to the original row), cells merged down flow with their rows, a
nested table is cut between its rows only when taller than a page; a bordered paragraph group is closed on each page.
Format > Page setup... sets the paper (A4, A5, A3, Letter, Legal, Executive, B5 (JIS), Custom), orientation, margins,
gutter and gutter position for This section, This point forward or Whole document, and Format > Layout... the section's
start, Different first page, Different odd and even, the header and footer distances and the vertical alignment, each
one undo step (values out of range are refused, never rounded). The pages follow Word's rules but are often not Word's: in the
test corpus a little over four in ten of the page and column starts Word recorded match !Letters' within a line (nearly
all page starts at forced breaks match and about half the column starts; about seven in ten natural breaks are more than
a line away, and one page out puts the pages after it out too), since footnotes are not laid out yet and the fonts are stand-ins (`$.Docs.Letters`, part 11).
Sections set in columns of text have their columns side by side on the pages, filled left to right (a column break,
Ctrl-Shift-Enter or Insert > Column break, or a New column section starts the next one; each paragraph at the width of the column it starts in; Draft shows one
column; before a Continuous section break the columns are balanced and the next section starts below them on the same
page; a line between columns is drawn when the section asks for one; Format > Columns... sets the number of columns, their widths and spacing (presets One, Two, Three, Left and Right as Word makes them), Line between, and where they apply (this section, this point forward, the whole document); a section that numbers its lines shows the line numbers in the left margin as Word
does (Format > Layout... > Line numbers... switches them on and off and sets Start at, Count by, From text and the
restart; Format > Paragraph... Suppress line numbers leaves a paragraph out): `$.Docs.Letters`, part 13).
**Text wrap:** in Print layout floating pictures and floating tables are placed on their pages where the document puts them
(kept on the page, never hiding each other) and the text flows round them on the wider side, page by page as Word lays them out
(the caret's page at once, the rest a moment later); a picture or table anchored in a cell wraps that cell's text, one across
newspaper columns wraps both; a picture behind text lets a click reach the text over it (`$.Docs.Letters`, part 13). To try
it: Insert > Picture..., then Format > Wrap text > Square, drag the picture to the right and type beside it. To try the
pages: open a long `.docx` (it opens in Print layout), choose Format > Columns..., click Two and OK; double-click the top
of a page to edit its header, choose Insert > Page number and press Escape; then View > Outline and press Shift-Tab at the
start of a heading, and View > Web layout and resize the window.
**Headers, footers and fields:** in Print layout each page shows its header and footer (first page, odd and even, and
"Same as previous" sections as Word picks them; a tall one pushes the text; pictures and tables in them drawn).
Double-click one (or View > Header and footer) to edit it with every command of the text, the body shown pale; a page
without one makes it on the first key typed; in a linked section the typing changes the shared header. The window menu's
Header (Footer) menu sets Different first page, Different odd and even pages, Link to previous (unticked: a copy of
its own; ticked: the section's own deleted, without Word's question, undoable), Go to footer/header, Previous/Next section
and Remove; undo and redo take the window to the header or body they change; Find and Replace in the mode search that
header only. PAGE, NUMPAGES, SECTIONPAGES, SECTION, DATE and TIME are worked out on the screen for each page (the file
keeps its results until Edit > Update field / Update all fields; saving never updates); a computed result is one piece
for the caret, a selection taking part of a field takes the whole field, and a paste drops half fields. Insert > Page
number, Number of pages, Date, Time and Field... put fields in; View > Field codes (Shift-F9; F9 stays Redo) and View >
Field shading show codes and grey shading. Fields are never run and nothing (INCLUDETEXT, INCLUDEPICTURE) is fetched
(`$.Docs.Letters`, part 12). Symbol..., Special character >, hyperlinks and bookmarks are described with the breaks (`$.Docs.Letters`, part 8). To try it: open a document, click in a line and press
Ctrl-Enter, or use Insert > Section break; select some words and press Ctrl-K, type `www.example.org` and press Return, then Ctrl-Shift-F5 on another word, type a name and press Return.
**Format painter:** the brush on the toolbar's second row (and Format > Format painter) copies formatting: click it with
Select and the next click or drag paints it, with Adjust it stays on until Escape or another click on it. A caret picks up the
character format there and its paragraph's format (indents, spacing, style, list); a selection inside a paragraph the
character format of its first character; a selection reaching the end of a paragraph its paragraph format too. A click paints
the word there and a drag the dragged text, both when the button is let go; what is painted replaces the old formatting; one undo step. The pointer keeps its shape. To try it: select a
bold word, click the brush, then click a plain word (`$.Docs.Letters`, part 5).
**Styles:** the toolbar's Style field (click it or its arrow, or press Ctrl-Shift-S) and Format > Style list the document's gallery styles - paragraph, character and linked - with Word's names (*Heading 1*, not the stored `heading 1`), and Word's built-ins the file lacks (Normal, Title, List Paragraph, Heading 1 to 6), which are added to the file when first used; the list ends with *More styles...*. A paragraph style goes on the paragraphs the selection touches, a character style on the selected text (at a caret, on what is typed next), a linked style by Word's rule (a caret or whole paragraphs: the paragraph style; part of a paragraph: the character style); one undo step. Format > Styles... opens the Styles window: every style drawn in its own look, Show (Gallery or All styles), Apply (Return or a double-click too), New..., Modify..., Rename and Delete (a style in use asks first; the paragraphs and runs go back to the default, in one undo step; Normal, the default style and built-in styles cannot be deleted or renamed, in any language). The Style box (New and Modify) has Name, Style type (Paragraph, Character, Linked), Based on, Following paragraph, Add to gallery, Font, Size, Bold, Italic, Underline, Colour and, for a paragraph style, Alignment, indents and spacing in inches and points, with Tabs..., Borders... and Numbering... acting on the style; nothing changes until OK, and OK is one undo step. Fonts and colours a file takes from its theme are now shown (in the text, toolbar, Style box and copied HTML), though not editable. Not yet: templates, editing theme fonts and colours, document defaults, table and numbering styles in the lists, Word's whole gallery (Quote, Emphasis... only when the file has them), the style inspector. The styles !Letters writes follow Word's definitions but are still to be checked in real Word (hand-off files `st-*` from `node tests/moreapps/handoff-styles.mjs`, local) (`$.Docs.Letters`, part 23). To try it: select a word, press Ctrl-Shift-S and choose Heading 1; then Format > Styles..., choose Heading 1, Modify..., make it red and OK.
**Word count:** the Edit menu's last item, *Word count...* (no key), shows the words, characters (with and without spaces),
paragraphs and lines of the selection, or of the whole document when nothing is selected; table text (and the lines in table cells), link text and field
results are counted, field codes and tracked deletions are not; a no-break space or hyphen joins words and each East Asian
character is a word (`$.Docs.Letters`, part 3).
**Documents:** *Save* writes back to the file, *Save as* (a Save box filled in with a full pathname, so OK works; or drag
its icon) renames the window, *Save a copy* leaves it as it was; closing a window with unsaved changes asks Save / Discard
/ Cancel, and *Revert* reloads the file; Quit, the Task Manager, shutdown and Exit ask once (Discard / Cancel) when
documents have unsaved changes. A click on !Letters' icon bar icon (or *New*) makes a new, empty *Untitled* document
(*Untitled 2*... saved as `Untitled2`); the icon bar menu's *Recent* lists the last 8 files opened or saved (kept in
`Choices:Letters`). OK onto a file that is already there asks Replace / Cancel (Return and Escape are Cancel); a new
document's Save box offers a name no file has. Documents are file type &A7E (`Report/docx` on the desktop is `Report.docx` on a HostFS drive; a plain
name gets `,a7e`). To try: click !Letters' icon, type, choose *Save* from the window's menu and click OK; type again and
close the window to see the prompt. No automatic saving or backup file. The RISC OS keys work as in !Edit: F2 (or Ctrl-N) a new
document, F3 the Save as box, Ctrl-S Save, Ctrl-F2 Close, F8 / F9 undo and redo. Ctrl-C, Ctrl-X and Ctrl-V (Cmd on a Mac, and the Edit menu) copy, cut
and paste: exactly between !Letters documents, as text and HTML formatting with other programs (in another document links
become text, a table comes as a table (with its table style) and pictures come with their picture files, while whole list items bring their list as a new list and whole paragraphs keep
their borders, shading and tab stops; a table, some rows of one or a rectangle of cells copied comes as a table (with its pictures; its bookmarks stay with the original; pasted in a cell it is nested up to eight deep, over selected cells it overwrites them), a table goes to other programs as an HTML table and as tab-separated text, and tables pasted from browsers, Word, Google Docs, LibreOffice and Excel come as real tables (up to 63 columns, 1000 rows, 8 deep and 63,000 cells; bigger ones as tab-separated text);
a pasted PNG, JPEG or GIF picture file goes in as a picture (as does one dropped on the window, where it is dropped), other files cannot be pasted; pasted HTML is read with a whitelist, nothing in it runs or is fetched).
Ctrl-F (or F4) opens the Find box: Find next / previous, Match case, Whole words, Replace and Replace all (one undo step;
text as typed, no wildcards; link text found but not replaced); Ctrl-H Replace, Ctrl-G / Ctrl-Shift-G find again
(`$.Docs.Letters`, part 4). **Pictures:** the PNG, JPEG and GIF pictures of a document are drawn at their size (made to fit the column, in proportion, when wider; the crop is applied); in Print layout a floating picture is placed on its page where the document puts it and the text flows round it (Square, Tight, Top and bottom) or runs over or under it (Behind text, In front of text), and Format > Wrap text changes how (one undo step; in line to floating keeps the picture where it was shown); Draft, Web layout, Outline and headers and footers show it in its paragraph with a dashed outline; every other picture or drawing (EMF, WMF, SVG, BMP, charts, VML and shape drawings) is a labelled grey box and is kept byte for byte. A click selects a picture (eight handles; Shift-Left / Right too), a drag of a corner handle resizes it keeping its proportions (Shift frees them, an edge handle changes one side, Escape cancels; in Print layout a selected floating picture is moved by dragging it, one undo step), Delete removes it, and a double-click or Format > Picture... opens the Picture box (Width and Height in inches, Keep proportions, Reset size from the image's own resolution, Alt text); each is one undo step. Insert > Picture... takes the path of a PNG, JPEG or GIF file (type it or drop the file's icon on the box; at most 20 MB, 16384 px a side and 64 megapixels; never a web address), a file icon dropped on a document puts the first picture in where it is dropped, and a PNG, JPEG or GIF file pasted alone (no text with it) goes in at the caret. Pictures copied to another !Letters document bring a copy of their picture file (not ones with a link, an SVG version or effects); a table holding a picture comes whole with it, within one document and into another. Not yet: text on both sides of a floating picture, floating pictures in headers and footers placed on the page, turning, cropping, effects, other formats, pictures in footnotes, and pictures in links (shown as a grey box; Insert > Hyperlink on a picture is refused) (`$.Docs.Letters`, part 9). To try it: Insert > Picture..., type the path of a PNG on the disc and press Return, then drag a corner handle. **Tables:** the tables of a document are drawn with their borders (single, double, dashed... and diagonals; one line where two cells meet), shading, column widths, merged cells (across and down), cell margins and spacing, row heights, vertical alignment, nested tables (up to eight deep), the list numbers and pictures in their cells and the look of their table style (header row, first and last column, last row, banded rows and columns; theme colours are shown by the literal colour the style gives beside them, so they may differ slightly from Word's); only the rows in the window are drawn, and the window scrolls sideways to the right edge of a table wider than the page. A floating table is placed on its page in Print layout with the text flowing round it (typing, every Table command and dragging its edges work in it; it cannot be moved by dragging), and drawn in the text with a dashed outline in the other views, in a cell, a header or a footer; vertical text and right-to-left order are kept but not shown; in Print layout rows split between pages and header rows repeat (see Pages above). A table with tracked changes in it, content controls round its rows or cells, a cell ending with another table (Word needs a paragraph after it), or a structure !Letters does not model stays a grey box, kept byte for byte. The caret goes into a table's cells: a click puts it in a cell, the arrows move between cells, Tab and Shift-Tab go to the next and previous cell and select its text (Tab in the last cell adds a row; Ctrl-Tab types a tab; a browser may keep it for its own tabs), Ctrl-Shift-Enter splits a table at the caret's row (outside a table it puts in a column break), a drag or Shift-click or Shift with the arrows selects a rectangle of cells, and a click just inside a cell's left edge, just left of a row or just above a column selects that cell, row or column. Typing, Enter, Backspace and Delete over selected cells clear them, Backspace over whole rows removes them, Backspace and Delete next to a table follow Word's rules, and Ctrl-Enter and section breaks are refused in a cell. Character and paragraph formatting, lists (numbered through tables in reading order), links, bookmarks, symbols, pictures, Find and Replace and the word count work in cells and on selected cells; a picture put in a cell is made no wider than the cell, and resized and given alt text there as anywhere. A table kept as a grey box is selected by a click and deleted by Delete as before. **Making and changing tables:** Insert > Table... (or Table > Insert table...) asks for Columns (1 to 63), Rows (1 to 1000) and Auto or Fixed column width (Auto fills the text there: a cell, or one column of a section set in columns, or a landscape section's width; a Fixed width outside 0.1 to 22 inches is refused, never rounded), and puts in a table with a line round every cell (Word's Table Grid style, added to the document the first time; the caret goes in its first cell, and a table in a cell is nested). The window menu's **Table** menu (after Format) inserts rows above or below and columns to the left or right of the selected ones, deletes rows, columns or the whole table, selects a cell, row, column or the table, merges the selected cells (their text in reading order), splits cells (a box for columns and rows; several selected cells are merged first), splits the table in two at the caret's row (Ctrl-Shift-Enter, an empty paragraph between), makes the selected rows or columns even, and types a tab in a cell (Tab, also in the Insert menu: it is Ctrl-Tab, which a browser may keep). Tab in the last cell adds a row (a cell merged down to the last row is not made longer: the new row has its own cell there). Merging keeps bookmarks in order, and a cell a file marks as the lower part of a merge with nothing above it stays a cell of its own (its text never disappears); widths a Strict file writes in points are replaced, never written twice. Every one is a single undo step, a command that cannot be done beeps, and each item but Insert table... is shaded outside a table. **Formatting tables:** Table > Table properties... sets the table's width (Auto or a length), alignment (Left, Centre, Right) and indent, the height of the selected rows (Auto, At least, Exactly), the width of the selected columns and cells and the vertical alignment in cells (0.02 to 22 inches; an out-of-range number is refused, never rounded; a table whose width is a percentage opens with Table width blank and the width field greyed until Auto or Length is chosen), and Table > Cell alignment > Top, Centre, Bottom does the last at once. Format > Borders and shading... offers Apply to Cell and Table with the table's inside lines (a line put on goes on the selected cells; a line taken off the outer edge is also taken off the cells beside it along that edge, since the heavier line wins where cells meet, but not off a wider cell, and never in a table with space between its cells; a line under the options says why the box refuses). A drag with Select from a line between two cells moves it (the two columns beside it change, the table keeps its width; the table's right edge changes the last column and the width; a row's bottom line changes the row's height, down to 0.01 inch), with a dashed line while you drag, Escape to cancel, and one undo step; the ruler shows the cell's text area when the caret is in a cell. **Copying and converting tables:** Table > Convert > Text to table... turns the selected paragraphs into a table (a box: Columns and Separate text at Paragraphs, Tabs, Commas or Other; Columns is worked out from the text), Table > Convert > Table to text... turns the whole table at the caret into paragraphs (Paragraph marks, Tabs, Commas or Other), each one undo step; a field such as a table of contents is never cut into cells (the conversion is refused); a pasted table brings its table style into another document (a content control in a cell is left out there); tables are never left touching (an empty paragraph goes between two pasted together, and between two a deletion brings together); bookmarks over cells pasted over or cleared stay in order, and a table deleted whole keeps the other end of a bookmark that only starts or ends in it. Info counts the tables. Limits: 63 columns, 1000 rows in the Insert table box, tables eight deep, widths 0.02 to 22 inches. Not possible yet: moving a floating table by dragging, tracked changes to tables, editing table styles, AutoFit, sorting and formulas. Not yet checked against real Word: what a table made here and these commands write look like in Word (Table Grid, widths of Fixed columns, header rows, where bookmarks go; and for formatting, how Word reads the widths, alignment, lines and drags) (`$.Docs.Letters`, part 10). To try it: Insert > Table..., 3 columns, 4 rows, OK, then select two cells and choose Table > Merge cells. Not yet compared with real Word: the more unusual border styles, the widths of autofit tables, which border wins where cell and style meet, theme colours (`$.Docs.Letters`, part 10). To try it: open a document with a table (a .docx from Word). **Paragraph spacing:** Ctrl-1 / Ctrl-2 / Ctrl-5 set single, double and one-and-a-half line spacing, Ctrl-0 adds or removes 12 pt before a paragraph; Format > Line spacing and the Line spacing button on the toolbar's second row give 1.0 to 3.0 lines and add or remove space before and after; Format > Paragraph... opens the Paragraph dialogue box (alignment, indents, first line / hanging, before / after, Single / 1.5 / Double / At least / Exactly / Multiple, and keep with next, keep lines together, widow control and page break before, which decide where Print layout's pages break). Documents are drawn with the line spacing and the space around paragraphs they ask for (`$.Docs.Letters`, part 6). Tab stops are set on the ruler (above) or in Format > Tabs... (the Tabs dialogue box: position, alignment including bar, leader, Set / Clear / Clear all, and the document's default tab stops); margins are set in Format > Page setup... (Pages, above); later steps add templates, editing the theme's fonts and colours, bullets and numbering of your own, footnotes on the pages, a table of contents, tracked changes, printing, RTF/PDF export
and spell check. Reading and writing is checked on 600+ real documents from public test collections; real Microsoft
Word could not be run during development, so a hand-off check was prepared. Older `.doc` and password-protected files
are refused with a clear message. Documents never run anything and nothing is fetched. Calibri, Cambria, Arial, Times
New Roman and Courier New are shown in the metric-compatible Carlito, Caladea and Liberation fonts bundled on the disc
(all SIL OFL 1.1; licences in `$.MoreApps.!Letters.Fonts.Licences`), with line heights taken from each font's own metrics as
Word does (Calibri about 1.22 times the size, Cambria 1.17, Arial and Times New Roman 1.15, Courier New 1.13; a line
mixing fonts as high as its tallest ascent plus its deepest descent; `$.Docs.Letters`, part 17). Each section is laid out
at its own page's width, the white page as wide as the widest section (a landscape section, Strict files' page sizes,
a gutter at the side; in Draft a section in columns at its first column's width). WimpLib, the library of plain JavaScript modules
(zip, XML...) it is built on, is installed with the system resources as `$.!Boot.Resources.!WimpLib`: any disc program
imports it as `'wimplib/<Module>'`, found through the system variable `WimpLib$Path` (set at start-up with
`WimpLib$Dir`; put a directory of your own first to override a module). Guide: `$.Docs.Letters` (part 21 for programmers;
part 3 typing, deleting, undo and the word count, part 4 is copy, paste and find, part 5 formatting and the format painter, part 6 paragraph spacing, tab stops, borders and shading, part 7 lists, part 8 page and section breaks, symbols, special characters, hyperlinks and bookmarks, part 9 pictures, part 10 tables, part 11 pages, Page setup and Layout, part 12 headers, footers and fields, part 13 columns, line numbers and text wrap, part 14 saving, part 15 new documents, closing and quitting); developers: `docs/apps/Letters.md`.

**JavaScript programs:** files of type JSScript (&F81) run when double-clicked, like BASIC programs, so you can
write your own desktop programs in JavaScript in !Edit, using the same programming interface as the built-in
applications. The book *Programming in JavaScript* (`$.Manuals.JSTutor`, read with !Bookworm) teaches JavaScript
this way, for people who have done a little programming before; its example programs, including a Snake game, are
in `$.Examples.JS`. A second book, *Writing Desktop Applications in JavaScript* (`$.Manuals.JSApps`), follows on:
readers build !Contacts, an address book with a Draw-style toolbar, vCard/CSV import and export, undo and Choices,
and then !Organiser, a personal organiser in the spirit of Lotus Organizer (a ring binder with Diary, To do,
Address, Notepad, Planner and Anniversary sections, links, alarms, printing and iCalendar), with a small toolkit
of their own; every chapter's stage is in `$.Examples.JSApps`. For a complete program to read, the game
`$.Diversions.!Lander2` (Lander II, see below) is written the same way. `$.Apps.!JsEdit` is a programmer's editor for them (in the style of StrongED and Zap): syntax
colouring for JavaScript, BBC BASIC, Obey and JSON, line numbers, smart indentation, completion of the desktop's
programming interface, a syntax check as you type, Run, throwback of errors to their lines, a Functions list,
directory views (a tree of a directory's files, with New file, Rename, Delete, Find in files and drags to and
from the Filer) and a dark theme. Three programming fonts with icons ("Nerd Fonts": JetBrains Mono, Hack, Fira Code) are in every
font menu.

**Applications** (49 descriptors in `src/apps/index.js`):

| ROM (`Resources:$.Apps`) | Hard disc applications | Diversions (games and demos) |
|---|---|---|
| !Alarm: alarms and clock | !SciCalc: scientific calculator | !Patience |
| !Chars: character map | !Calc: the RISC OS 2 / 3.1 desk calculator, restored | !MineHunt |
| !Configure: all plug-ins | !Maestro: music editor and player | !Meteors |
| !Draw 1.11 | !Squash: file compression | !Blocks |
| !Edit 1.54 (with task windows) | !CloseUp: screen magnifier | !Puzzle |
| !Help 2.29: interactive help | !ChangeFSI: image conversion | !Clock |
| !Paint 1.94 | !PhotoView: JPEG viewer | !MemNow |
| !Printers 1.54: printer manager | !Bookworm: HTML manual browser | !Flasher |
| !InetSetup: Internet configuration (and !Internet) | !ARPlayer: ARMovie player | !Madness: moves every other window |
| | !AREncode (and !ARWork): Replay movie compressor | !Hopper: Frogger-style game |
| | !JsEdit: programmer's editor (JavaScript, BASIC, Obey) | |
| | !GraphTask: BASIC programs in desktop windows (see above) | |
| | !Journal: a diary with a page a day, in JavaScript (see above) | |
| | !Letters (MoreApps): reads and saves Word .docx files, in JavaScript (see above) | |
| | !WimpLib (!Boot.Resources): the `'wimplib/...'` JavaScript library (see above) | |
| | !GameLib (!Boot.Resources): the `'gamelib/...'` JavaScript library for games (see below) | |
| | !Browse: web browser (see above) | |
| | !HostFS (Utilities): folders from this computer as discs | |
| | !Player: sample player | !Lander: David Braben's 1987 demo (see below) |
| | | !Lander2: Lander II, a Zarch-like game grown from Lander, in JavaScript (see below) |
| | | !Pacman: a tribute to the 1980 maze game, in JavaScript (see below) |
| | !SlideShow | |
| | !CDPlayer: the Audio Panel (no CD drive) | |
| | !FontPrint: PostScript printer font lists | |
| | !Access+ and !AccessCD: ShareFS sharing | |
| | !Patch: application patcher | |
| | !T1ToFont: Type 1 to RISC OS outline font converter | |

**Original BASIC utilities**, running unmodified through the BASIC Wimp bridge (see `docs/apps/TierA.md`):
!Calibrate and !ShowScrap (`Diversions.Tools`), !SaveCMOS, !ResetBoot, !Verify and !HForm (`Utilities`), !PrintEdit
(`Printing`) and !Warning (`Video`). The CMOS RAM, the IDE hard disc and the joystick they use are emulated.

**BBC BASIC demos** in `$.Demos.BASIC` (double-click to run; Shift-double-click to read the listing in !Edit):
Mandelbrot, Plasma, Fire, Stars, AsmBars and AsmPlot (inline ARM assembler), Cube, Sprites, Lissajous, Roses, Spiral,
Circles, Colours, Tree, Life, Hanoi, Snake, Ball, Voices, Canon and Tune (the sound system), Teletext (MODE 7), Sieve,
Guess, Errors, WimpClock (a small Wimp task), and Ceefax (a teletext page) and BallPit (a mouse toy), made for
running in !GraphTask's windows (drag any of them to its icon). The listings are in `src/basic/demos/`.

The disc also includes !System, !Scrap and !Fonts (`!Boot.Resources`), the Examples directory (a BASIC Wimp demo),
a sample Type 1 font to convert with !T1ToFont (`Utilities.Type1Fonts`), the user guide in HTML, tutorials, images,
Maestro tunes, and the original BASIC programs and !Boot files. Fonts converted by !T1ToFont (any outline font in
the `Font$Path` directories) appear in the font menus of !Chars, !Configure, !Draw and !Edit.

### !Lander

!Lander is David Braben's 1987 Archimedes demo, © D. J. Braben. It runs in one of two modes:

* **The JavaScript port** (the default): a line-by-line reconstruction after Mark Moxon's documented disassembly.
  With the same mouse input it draws the same frames as the original, at the speed of an 8 MHz ARM2.
* **The original program** on an emulated ARM2 (the ARM emulator from the BASIC interpreter), when you supply it.
  The binary is never part of this repository or its disc image. Drag it from the host computer onto the running
  game, or copy it onto the RISC OS disc and drag it from a Filer window onto the !Lander icon, or
  `*Run <Lander$Dir> <file>`; it is then kept in the browser (IndexedDB) for later runs. When developing locally you can instead clone
  [markmoxon/lander-source-code-acorn-archimedes](https://github.com/markmoxon/lander-source-code-acorn-archimedes) into
  `vendor/lander` (git-ignored); `serve.mjs` then offers its `4-reference-binaries/!RunImage.bin` to pages loaded from
  localhost. `*Run <Lander$Dir> -port` (or `?lander=port`) always plays the port.

Mouse: position steers, Select = full thrust, Menu = hover, Adjust = fire. Escape ends the game. See `docs/apps/Lander.md`.

### !Lander2: Lander II

`$.Diversions.!Lander2` is an enhanced, Zarch-like game grown from Lander, written in JavaScript as modules on the
disc, so its whole source can be read and changed in !JsEdit (View source on its title page or icon bar menu).

* **Invasion**: waves of aliens (seeders, drones, mutants, bombers, pests, fighters, attractors) spray a red virus
  over a wrapping 64×64-tile landscape; homing missiles, smart bombs, pickups, a bonus for clean land.
* **Lander+**: the original game's rules and landscape, with high scores.
* The **Enhanced** look (any resolution, up to 64 rows of landscape in view, fog, stars, a Zarch-style console
  with a scanner) or the **Classic** look (320×256 in the Archimedes' 256 colours, as Lander drew it).
* Two synthesised sound sets, **Original** (Archimedes/Zarch-style 8-bit samples) and **Arcade** (the Williams
  Defender/Robotron sound board recreated, one sound at a time like the arcade machine unless Arcade voices is
  set to Many), a demo flown by an autopilot, full screen or in a window, mouse, keyboard or gamepad.

Settings and high scores are kept in `Choices:Lander2`. The user guide is `$.Docs.Lander2` (source
`tools/docs/Lander2`); the design is in `docs/apps/Lander2.md`; `node tools/disc-lander2.mjs` puts the sources
(`tools/lander2/!Lander2`) on the disc.

### !Pacman

`$.Diversions.!Pacman` is a personal, non-commercial tribute to Namco's 1980 arcade game (Pac-Man is a trademark of
Bandai Namco; this program is not connected with them), written in JavaScript as modules on the disc, built on
GameLib, so its whole source can be read and changed in !JsEdit (View source on its title or icon bar menu). It plays
the arcade maze at a fixed 60 Hz, full screen or in a window, steered by the arrow keys, W A S D or a gamepad, with the
arcade's cornering (turns started up to three pixels early or late); four ghosts with their own targets, scatter and
chase, red zones, the slowing tunnel, Cruise Elroy and a ghost house that lets them out by the dots you eat; energizers
that turn the ghosts blue, which you can then eat (200 to 1600 points, eyes running home, a 12000 bonus); bonus fruit and
a level table (speeds, fright time, schedule, house limits) with the level-complete sequence and endless levels; lives
(three, one extra at 10000), the death sequence and game over; synthesised sound (our own tunes and waveforms; a Sound
item on the icon bar menu, scaled by the desktop volume); a title that introduces the four ghosts, a pause menu
(Continue, Restart, Settings, Title, Desktop), a How to play page and a Settings screen (display, browser full screen,
sound, volume, lives, bonus life; kept in `Choices:Pacman.Settings`); a table of the ten best scores (name, score, level,
date) with three-character name entry for a score that makes it, kept in `Choices:Pacman.Scores`; and attract mode
(leave the title for 10 s and a silent demo game, played by an autopilot, runs until its first death or 60 s, then the
scores show for 6 s; any key or click returns to the title and is not passed on). Not in it: the intermissions, the kill
screen, and a few arcade details listed under Known limitations in `docs/apps/Pacman.md`. The user guide is
`$.Docs.Pacman` (source `tools/docs/Pacman`); the design is in `docs/apps/Pacman.md`; `node tools/disc-pacman.mjs` puts
the sources (`tools/games/!Pacman`) on the disc.

### GameLib: a library for writing games

`$.!Boot.Resources.!GameLib` is a library of plain JavaScript modules for games, installed with the system resources
beside WimpLib: a fixed-rate main loop, a software pixel surface with shapes and the 8×8 system font, keyboard and
gamepad as named actions, a sound synthesiser, saved options and a high score table, and a full screen or windowed
display. Any disc program imports a module as `'gamelib/<Module>'` (`import { Loop } from 'gamelib/Loop'`), found
through the system variable `GameLib$Path` (set at start-up with `GameLib$Dir` and `GameLib$Version`; put a directory
of your own first to override a module). Double-clicking `!GameLib` shows its help. The guide is `$.Docs.GameLib`
(source `tools/docs/GameLib`), with a small game as an example; the design is in `docs/apps/GameLib.md`;
`node tools/disc-gamelib.mjs` puts the sources (`tools/games/!GameLib`) on the disc.

## Architecture

```
index.html             loads src/main.js
src/main.js            boot: services, !Boot, application registry, hot keys
src/core/              the operating system
  wimp.js window.js icons.js menu.js input.js     window manager, icons, menus, pointer / keyboard
  iconbar.js filer.js fileraction.js pinboard.js switcher.js devices.js
  vfs.js               filing system: ADFS / RAM / Resources discs, seed disc + IndexedDB overlay
  hostfs/             HostFS: host folders as discs (File System Access API, serve.mjs --host, read-only snapshots)
  cli.js commands.js sysvars.js   OSCLI, * commands, system variables and GSTrans
  app.js               application registry: descriptors, lazy load(), Filer_Boot, file types, * commands
  sprites.js templates.js messages.js fonts.js dialogs.js   resources and standard dialogues
  fontreg.js fontbuild.js riscosfont.js   font registry: built-in fonts + outline fonts on Font$Path, converted at run time
  basichost.js basicwimp/   full-screen BASIC, and BASIC programs as Wimp tasks (SWI bridge)
  jsrun.js             *JSRun: JavaScript programs on the disc (JSScript files), as scripts or modules
  reset.js             *ResetDisc / *ResetCMOS / Delete-power-on
src/basic/             BBC BASIC V interpreter, tokeniser, ARM assembler/emulator, VDU driver (host-agnostic)
src/apps/<Name>/       one directory per application: app.js (small descriptor) + main.js (loaded on first use)
assets/                converted resources: sprites (PNG + JSON), templates, Messages, fonts, the seed disc
tools/                 Node converters that build assets/ from the original source tree (node tools/build.mjs)
tests/                 node --test suites and Playwright scripts
docs/                  SPEC.md, CORE_API.md (the application API), ASSETS.md, BASIC.md, BASIC_WIMP.md, apps/*.md
```

Each application is a task that talks to the Wimp through an API modelled on the real one: windows made from the
original Templates, Wimp messages (DataOpen, DataLoad, DataSave with RAM transfer, PreQuit, Quit …), menus, the
caret, drags and icon bar icons. See `docs/CORE_API.md`. The screen uses 1 pixel = 2 OS units, square pixels and the
16-colour Wimp palette.

## Tests

```sh
node --test tests/basic/          # BASIC interpreter, tokeniser, assembler, VDU (no browser)
node --test tests/sound tests/basic   # no browser
node --test tests/core            # and tests/draw tests/edit tests/paint tests/acc tests/div tests/tw tests/bw tests/tierb
node --test tests/integration     # cross-application flows + a long random ("monkey") test
node --test tests/jstutor         # *JSRun and the JavaScript tutorial's example programs
node --test tests/jsapps          # the second tutorial's applications (!Contacts, !Organiser and their stages)
node --test tests/core/test-trust.mjs tests/core/test-proxy-mode.mjs tests/core/test-proxy-handlers.mjs tests/core/test-browser-hardening.mjs   # --public-url, the trusted proxy and the engine's guards
node --test tests/browse          # !Browse and its engine (needs a Chrome; local pages only)
node tests/core/test-textinput.mjs   # the opt-in text-input caret (a hidden field: typed text, dead keys, input methods; Playwright)
node --test tests/core/test-textinput-pure.mjs   # its text cleaning (no browser)
node --test tests/moreapps        # !Letters and WimpLib unit tests (no browser; Node >= 22.7; about 6000 tests, about 1.5 minutes)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps   # the same under a 1GB heap (the corpus test needs this care)
WORD_PERF=1 WORD_SECTIONS_PERF=1 node --test --test-concurrency=1 tests/moreapps/outline-minor.test.mjs tests/moreapps/pages-perf.test.mjs tests/moreapps/relayout-perf.test.mjs tests/moreapps/wrap-settle.test.mjs tests/moreapps/fields-incr.test.mjs tests/moreapps/hdrpick-chain.test.mjs   # also assert the absolute time ceilings (a quiet machine; by default they are printed and the tests hold paired ratios and counts)
node --test tests/games          # GameLib and !Pacman unit tests and the two disc scripts (no browser)
URL=http://localhost:8372/ node --test tests/games/index.mjs   # the source checks, the 'gamelib' import and !Pacman in a real browser (server on 8372)
node --test tests/moreapps/index.mjs   # the browser suite: disc check, the wimplib import, cold boot, !Letters opening and saving, and its caret and selection (word-edit.mjs, word-edit-hostile.mjs: clicks, drags, keys, hostile documents), typing in it (word-typing.mjs, word-typing-hostile.mjs: storms, 50,000 paragraphs, random input), formatting by keys, menu, toolbar and ruler (word-format.mjs, word-toolbar.mjs, word-ruler.mjs), zoom (word-zoom.mjs), lists (word-lists.mjs, word-lists-hostile.mjs: 100,000 list paragraphs, Tab spam, absurd numbering, 500 random actions; word-lists-ui.mjs: the Bullets and Numbering buttons, Ctrl-Shift-L, Format > List and its box; word-autolist.mjs: AutoFormat as you type; word-newlists-hostile.mjs: 1000 rapid markers with Ctrl-Z, 100,000 paragraphs made a list, 1000 toggles, Restart spam, hostile numbering parts, lists inside styles, 500 random actions), saving, closing and quitting (word-save.mjs, word-close.mjs, word-quit.mjs: New, Recent, Quit and PreQuit prompts; word-fkeys.mjs: F2, F3, Ctrl-F2, Ctrl-S, Ctrl-N, F8/F9; word-find.mjs: Find and Replace; word-dialog.mjs: the WimpLib dialog builder Ui/Dialog; word-spacing.mjs: line spacing and space before / after by keys, menu and toolbar, 50,000 paragraphs; word-parabox.mjs: the Paragraph dialogue box; word-tabs.mjs: the Tabs dialogue box and the default tab stop; word-spacing-hostile.mjs: 50,000 paragraphs, 1000 Ctrl-2 / Ctrl-1 toggles, absurd line values, the box open while its window closes, 500 random actions; word-clipboard.mjs and word-clipboard-hostile.mjs: copy, cut, paste and Find against 50,000 paragraphs, 5 MB pastes, hostile HTML, a real input method, 500 random actions; word-documents-hostile.mjs: saves onto open, locked and read-only files, 1000 Saves, a real input method, shutdowns, 10,000 Recent entries, 500 random actions)
node tests/moreapps/word-edit.mjs  # one browser group alone: !Letters' caret and selection (also word-edit-hostile.mjs)
node tests/moreapps/word-typing.mjs  # one browser group alone: typing, deleting, undo and input methods in !Letters (also word-typing-hostile.mjs)
node tests/moreapps/word-format.mjs  # one browser group alone: formatting by keys, pending format and the Format menu (also word-toolbar.mjs, word-ruler.mjs, word-zoom.mjs, word-format-hostile.mjs: 50,000 paragraphs, 500 random actions)
node --test tests/moreapps/format.test.mjs tests/moreapps/formatset.test.mjs tests/moreapps/format-prop.test.mjs tests/moreapps/format-display.test.mjs tests/moreapps/formatapply.test.mjs   # formatting: queries, commands, seeded random commands with undo, drawing (unit; also fontlist, numberfield, colourlist, rulermath, rulertabs, zoom, toolbarbuttons)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/format-roundtrip.test.mjs   # random formatting on fixtures and corpus files, written and read back (WORD_EDIT_CORPUS=1: every corpus file)
node tests/moreapps/handoff-format.mjs   # writes the fmt-*.docx files to try in real Word (local, in tests/moreapps/corpus/handoff; never committed)
node --test tests/moreapps/numbering-read.test.mjs tests/moreapps/numformat.test.mjs tests/moreapps/listnumbers.test.mjs tests/moreapps/list-prop.test.mjs tests/moreapps/list-display.test.mjs tests/moreapps/formatlist.test.mjs tests/moreapps/parind.test.mjs tests/moreapps/editlist.test.mjs   # lists: numbering read, number formats, labels (with a reference model), drawing, level and Remove from list commands, list indents, Tab/Shift-Tab/Backspace (unit)
node --test tests/moreapps/paraspace.test.mjs tests/moreapps/parapatch.test.mjs tests/moreapps/tabspatch.test.mjs tests/moreapps/settingsedit.test.mjs tests/moreapps/borderpatch.test.mjs tests/moreapps/docitems.test.mjs tests/moreapps/dialoglayout.test.mjs   # paragraph spacing: the line boxes, the decorator, the Paragraph box's values and patch, the Borders and shading box's values and commands, the layout pieces, the dialog builder (unit; also opsdoc, opssect, props-more, toolbarbuttons)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/spacing-roundtrip.test.mjs   # random line spacing, space, flow and Paragraph-box patches on fixtures and corpus files, written and read back; undo restores (WORD_EDIT_CORPUS=1: every corpus file)
node tests/moreapps/word-spacing.mjs   # one browser group alone: line spacing and space by keys, menu and toolbar (also word-parabox.mjs, word-tabs.mjs, word-spacing-hostile.mjs)
node tests/moreapps/handoff-spacing.mjs   # writes the sp-*.docx files and sp-README.txt to try in real Word (local, in tests/moreapps/corpus/handoff; never committed)
node tests/moreapps/word-lists.mjs   # one browser group alone: lists drawn and edited in !Letters (also word-lists-hostile.mjs)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/list-roundtrip.test.mjs   # random list edits on list fixtures and corpus files, written and read back; numbering part unchanged (WORD_EDIT_CORPUS=1: every corpus file)
node tests/moreapps/handoff-lists.mjs   # writes the list-*.docx files and list-README.txt to try in real Word (local, in tests/moreapps/corpus/handoff; never committed)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/newlist-roundtrip.test.mjs   # random Bullets, Numbering, Restart, Continue and AutoFormat commands with list edits on fixtures and corpus files, written and read back; every old child of the numbering part kept in order (WORD_EDIT_CORPUS=1: every corpus file; also list-roundtrip.test.mjs and clipboard-newlists.test.mjs)
node tests/moreapps/handoff-newlists.mjs   # writes the nl-*.docx files and nl-README.txt to try in real Word (local, in tests/moreapps/corpus/handoff; never committed)
node tests/moreapps/word-breaks.mjs   # one browser group alone: page and section breaks, the Insert menu and Page break before (also word-breaks-hostile.mjs: 50,000 paragraphs, 1000 breaks, delete storms, 500 random actions)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/breaks-roundtrip.test.mjs   # random page breaks, section breaks (inserted and removed by the keys) and Page break before on fixtures and corpus files, written and read back; undo restores (WORD_EDIT_CORPUS=1 NODE_OPTIONS=--max-old-space-size=4096: every corpus file)
node tests/moreapps/handoff-breaks.mjs   # writes the brk-*.docx files and brk-README.txt to try in real Word (local, in tests/moreapps/corpus/handoff; never committed)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/tabs-roundtrip.test.mjs   # random ruler and Tabs box commands (hostile positions, kinds, leaders, the default tab stop) with typing and undo on fixtures and corpus files, written and read back; undo restores (WORD_EDIT_CORPUS=1 NODE_OPTIONS=--max-old-space-size=4096: every corpus file)
node tests/moreapps/word-tabs-hostile.mjs   # one browser group alone: 10,000 stops, positions beyond the limits, 1000 ruler adds, Tab storms, 500 random actions
node tests/moreapps/handoff-tabs.mjs   # writes the tab-*.docx files and tab-README.txt to try in real Word (local, in tests/moreapps/corpus/handoff; never committed)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/borders-roundtrip.test.mjs   # random border, shading, change case, symbol and special character commands with typing and undo on fixtures and corpus files, written and read back; refused commands change nothing; raw themed borders kept; undo restores (WORD_EDIT_CORPUS=1 NODE_OPTIONS=--max-old-space-size=4096: every corpus file)
node tests/moreapps/word-borders-hostile.mjs   # one browser group alone: 50,000 bordered paragraphs, widths 0 and 96, theme colours kept raw, 1000 Shift-F3, the Symbol window open while documents close, 500 random actions
node tests/moreapps/handoff-borders.mjs   # writes bdr-1-boxes, bdr-2-shading, sym-1-symbols and case-1 .docx and bdr-README.txt (questions BD1.., SY1.., CS1..) to try in real Word (local, in tests/moreapps/corpus/handoff; never committed)
node tests/moreapps/word-borders.mjs   # one browser group alone: paragraph borders and shading and character shading read from the canvas; 50,000 bordered paragraphs; the Borders and shading box (also bordergroups.test.mjs and borderpatch.test.mjs, unit)
node --test tests/moreapps/charsets.test.mjs tests/moreapps/chargridpaint.test.mjs tests/moreapps/insertchars.test.mjs   # the symbol sets (every character in Carlito, Liberation Sans and Serif), the symbol grid's geometry and keys, no-break space / hyphen and optional hyphen (unit)
node tests/moreapps/word-symbols.mjs   # one browser group alone: Insert > Symbol... (real clicks in the grid), Special character, Ctrl-Shift-Space and Ctrl-Shift--
node --test tests/moreapps/changecase.test.mjs   # Change case: upper / lower / sentence / title / toggle / the Shift-F3 cycle, lengths never change (sharp s, Turkish I, final sigma, emoji), runs and inlines kept, a caret takes its word, one undo step, 50,000 paragraphs (unit)
node tests/moreapps/word-case.mjs   # one browser group alone: Shift-F3 by a real key, the Format > Change case menu
node --test tests/moreapps/linkops.test.mjs tests/moreapps/bookmarks.test.mjs tests/moreapps/formatpaint.test.mjs tests/moreapps/wordcount.test.mjs   # hyperlinks (addresses, insert, edit, remove), bookmarks (names, ids, orphan rule, 10,000), the format painter's pick and paint, and the word count's rules (unit)
node tests/moreapps/word-links.mjs   # one browser group alone: Ctrl-K and Ctrl-Shift-F5 boxes by real keys and clicks, Ctrl-click to a bookmark (also word-painter.mjs: the format painter; word-count.mjs: Edit > Word count...)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/links-roundtrip.test.mjs   # random link, bookmark, format painter and word count commands with typing and undo on fixtures and corpus files, written and read back, no rid-unresolved; refused commands change nothing; undo restores (WORD_EDIT_CORPUS=1 NODE_OPTIONS=--max-old-space-size=4096: every corpus file)
node tests/moreapps/word-links-hostile.mjs   # one browser group alone: bad addresses and a 1 MB one, 10,000 bookmarks, duplicate names, 1000 painter uses, a word count of 1,000,000 words, 500 random actions; no network request
node tests/moreapps/handoff-links.mjs   # writes lnk-1-links, bm-1-bookmarks and paint-1 .docx and lnk-README.txt (questions H.., BM.., FP.., W.. and the word counts !Letters shows) to try in real Word (local, in tests/moreapps/corpus/handoff; never committed)
node --test tests/moreapps/savestate.test.mjs tests/moreapps/recent.test.mjs   # documents: untitled names, leaf names, the Save box's directory, the Recent list (unit)
node tests/moreapps/word-save.mjs   # one browser group alone: Save, Save as, Save a copy (also word-close.mjs: the close prompt and Revert; word-quit.mjs: New, Recent, Quit and PreQuit; word-replace.mjs: Replace / Cancel, free names; word-page.mjs: a new document's whole page; word-clipboard.mjs: copy, cut and paste; word-find.mjs: Find and Replace; word-documents-hostile.mjs)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/documents-roundtrip.test.mjs   # new and corpus documents saved through !Letters' own save code (DocSave), read back, linted and schema-checked (WORD_EDIT_CORPUS=1: every corpus file)
node tests/moreapps/handoff-documents.mjs   # writes new-*.docx, saved-*.docx and doc-README.txt, made by !Letters in the desktop, to try in real Word (local, in tests/moreapps/corpus/handoff; never committed)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/clipboard-roundtrip.test.mjs   # random copy, cut, paste (own, other documents', other programs' HTML) and Find / Replace on fixtures and corpus files, written and read back (WORD_EDIT_CORPUS=1: every corpus file)
node tests/moreapps/word-clipboard.mjs   # one browser group alone: copy, cut and paste in !Letters (also word-clipboard-hostile.mjs, word-find.mjs)
node tests/moreapps/handoff-cliplists.mjs   # writes cl-*.docx and cl-README.txt: lists, borders and shading pasted between documents, to try in real Word (local, in tests/moreapps/corpus/handoff/)
node tests/moreapps/handoff-clipboard.mjs   # writes clip-*.docx, find-1-replaceall.docx and clip-README.txt to try in real Word (local, in tests/moreapps/corpus/handoff; never committed)
node --test tests/moreapps/picread.test.mjs tests/moreapps/picmedia.test.mjs tests/moreapps/picedit.test.mjs tests/moreapps/picops.test.mjs tests/moreapps/picids.test.mjs tests/moreapps/insertpicture.test.mjs tests/moreapps/clippick.test.mjs tests/moreapps/clippics.test.mjs tests/moreapps/picpatch.test.mjs tests/moreapps/picline.test.mjs tests/moreapps/piccache.test.mjs tests/moreapps/picpaint.test.mjs   # pictures: what a picture's XML says, image sizes and dpi, hostile extents and media, edits that touch only size, alt text and ids, insert, paste between documents, the Picture box's values, layout, cache and painting (also pic-corpus.test.mjs over the corpus)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/tblcheck.test.mjs tests/moreapps/tblprops.test.mjs tests/moreapps/tblread.test.mjs tests/moreapps/tblwrite.test.mjs tests/moreapps/walk.test.mjs tests/moreapps/walk-scanners.test.mjs tests/moreapps/ops-paths.test.mjs tests/moreapps/editpos-paths.test.mjs tests/moreapps/paths-gate.test.mjs tests/moreapps/clip-tables.test.mjs tests/moreapps/tables-corpus.test.mjs tests/moreapps/tables-roundtrip.test.mjs tests/moreapps/celltail.test.mjs tests/moreapps/tables-fuzz.test.mjs tests/moreapps/tbledit-rows.test.mjs tests/moreapps/tblcmd.test.mjs tests/moreapps/tbledit-cols.test.mjs tests/moreapps/tblmerge.test.mjs tests/moreapps/tblinsert.test.mjs tests/moreapps/tblnorm.test.mjs tests/moreapps/tables-cmd-fuzz.test.mjs   # tables in the model (Batch C1): invariants (a cell never ends with a table), properties, reader, writer, the one walk of the model, ops and edit locations at every depth, the migration gate, the clipboard, every corpus table written back equal and the random round trip; random editing sequences in and around tables (the C3 review's fuzz); inserting and deleting rows, Tab in the last cell and split table (C4.1), inserting and deleting columns, select and distribute (C4.2), merging and splitting cells (C4.3), Insert > Table (C4.4), the rules every structure command keeps (one width per cell in Strict files, bookmark pairs in order, stray merge cells kept shown, rows below a merge plain) and a seeded fuzz of every structure command (C4 fix wave); each command one undo step
node --test tests/moreapps/tables-apart.test.mjs tests/moreapps/relayout-perf.test.mjs   # tables never left touching by Backspace, Delete or a deleted range (typed and grey-box tables, in cells too); a table deleted whole keeps bookmark pairs; a table-free layout takes no table path and its 50,000-paragraph relayout stays near Batch B's
node --test tests/moreapps/tbl-final-pairs.test.mjs tests/moreapps/tbl-final-ui.test.mjs tests/moreapps/handoff-xsd.test.mjs   # the tables' final fix wave: bookmark pairs kept by Delete > Table and never reversed across two tables, no table touching a grey-box one, Table to text in the table's order, Borders and shading on a 1000 x 63 selection, the Split cells reasons, no grid kept by the undo history; the hand-off files valid against the schema
node tests/moreapps/word-tables-final.mjs   # browser: the Tab item's shading and the Split cells box's stale guard
node tests/moreapps/word-tables.mjs   # the browser group for tables: drawn (borders, shading, cell text, checked by pixels), the caret into its cells, Info counts, copy and paste of a whole table, undo (also word-tables-edit.mjs: editing in tables, from clicks and arrow keys into cells, cell rectangles selected and lit, Tab / Shift-Tab between cells, Up / Down by the cells, the mouse's cell, row and column zones, Ctrl-Tab typing a tab in a cell, typing and deleting in and around a table by Word's rules: cells cleared, rows removed, Ctrl-Enter refused, undo back into the cell, a keystroke in a 1000-row table within 5 ms of one outside it, bold on a rectangle of cells, Find into a cell and a Ctrl-click on a link in a cell, the arrows passing the hidden part of a vertical merge, a picture dropped in a cell sized to it and resized there, Tab in the last cell adding a row and Ctrl-Shift-Enter splitting a table, each undone by one Ctrl-Z)
node tests/moreapps/word-tables-menu.mjs   # browser (C4.4): the Table menu and Insert > Table... by real clicks: the menus' order, shading and keys, the Insert table box (defaults, refused numbers, Return, Fixed width, Escape, the grid drawn, checked by pixels), each Table item on a 3x3 as one undo step, Select, the Split cells box, Insert > Tab, no leaks over 20 open/close cycles (Escape and Cancel in turn); one-column Fixed widths of 23, 0.05 and -1 in refused, the menu's four groups, the caret moved while the box is open, Auto in a 2-column section
node --test tests/moreapps/tblstyle.test.mjs tests/moreapps/tblcond.test.mjs tests/moreapps/tblcolor.test.mjs tests/moreapps/tblgrid.test.mjs tests/moreapps/tblwidth.test.mjs tests/moreapps/tblborders.test.mjs tests/moreapps/tablepaint.test.mjs tests/moreapps/tbllayout.test.mjs tests/moreapps/tblreuse.test.mjs tests/moreapps/notable-layout.test.mjs tests/moreapps/tables-layout-corpus.test.mjs   # tables drawn (Batch C2): table styles and their conditional formatting, theme colours, the grid and widths, borders where cells meet, the paint, the layout of rows and cells (every corpus table when the optional corpus is there), tables reused between layouts, and documents without tables laid out exactly as before
node --test tests/moreapps/selshape.test.mjs tests/moreapps/seltable.test.mjs tests/moreapps/celledit.test.mjs tests/moreapps/selcells.test.mjs tests/moreapps/contcell.test.mjs tests/moreapps/cellpos.test.mjs   # the caret and selections in cells (Batch C3): cell rectangles, moving by the arrows, typing and deleting by Word's rules, the hidden part of a vertical merge
node --test tests/moreapps/tblpatch.test.mjs tests/moreapps/tblborderpatch.test.mjs tests/moreapps/tbldrag.test.mjs tests/moreapps/tblread-hostile.test.mjs   # Table properties, Borders and shading for cells and tables, dragging the edges of columns and rows (Batch C5) and hostile table files
node tests/moreapps/word-tables-format.mjs   # browser (C5): Table properties..., Cell alignment and Borders and shading... by real clicks (also word-tables-drag.mjs: dragging column and row edges; word-tables-hostile.mjs: hostile, huge and deep tables opened, and the keystroke budgets)
node tests/moreapps/handoff-tables.mjs   # writes the tb-*.docx files (tables made by !Letters' own commands, and Word-made ones from the corpus) and tb-README.txt (a PRIORITY list of the checks that matter most, then every question TB1.. with its file and steps) to try in real Word, and handoff-index.mjs writes INDEX.txt (local, in tests/moreapps/corpus/handoff; never committed)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/clipslice-tables.test.mjs tests/moreapps/clipclean.test.mjs tests/moreapps/clippaste-tables.test.mjs tests/moreapps/cliphtmltable.test.mjs tests/moreapps/clipreadtable.test.mjs tests/moreapps/tblconvert.test.mjs tests/moreapps/bookmark-cells.test.mjs tests/moreapps/clip-tables-fuzz.test.mjs tests/moreapps/regex-hostile.test.mjs   # tables on the clipboard and converting (Batch C6): rectangles, rows and whole tables cut for the clipboard, cleaned across documents, pasted (in a cell, over cells, table styles copied), HTML tables out and in with their limits and hostile input, text to table and table to text; the browser groups word-clipboard.mjs, word-clipboard-hostile.mjs and word-tables-menu.mjs check them by real keys and clicks
node tests/moreapps/word-pictures.mjs   # one browser group alone: pictures drawn (also word-pictures-edit.mjs: select, handles, resize; word-picbox.mjs: the Picture box; word-pictures-insert.mjs: Insert > Picture..., drop and paste; word-pictures-hostile.mjs: 1000 pictures, decode bombs, 500 random actions)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/pictures-roundtrip.test.mjs   # random picture insert, resize, alt text, delete and paste on fixtures and corpus files: written, read back equal, linted, undo all gives the opened model, parts and relationships (WORD_EDIT_CORPUS=1: every corpus file untouched is byte-stable)
node tests/moreapps/handoff-pictures.mjs   # writes pic-*.docx and pic-README.txt (questions PI1.., P1..) to try in real Word (local, in tests/moreapps/corpus/handoff; never committed)
NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/paginate.test.mjs tests/moreapps/pagekeep.test.mjs tests/moreapps/pagerows.test.mjs tests/moreapps/pages-incr.test.mjs tests/moreapps/pages-cover.test.mjs tests/moreapps/pages-perf.test.mjs tests/moreapps/place.test.mjs tests/moreapps/pages-corpus.test.mjs   # Batch D pages: breaking by Word's rules, tables across pages, reuse after an edit and 2 ms slices, 3,000 random galleys, the D37 budgets, screen placement, and the page-start oracle pinned in corpus-expected.json (`pageStarts`)
node --test tests/moreapps/storyread.test.mjs tests/moreapps/storywrite.test.mjs tests/moreapps/ops-story.test.mjs tests/moreapps/storyfacade.test.mjs tests/moreapps/hdrpick.test.mjs tests/moreapps/hdrcmd.test.mjs tests/moreapps/stories-corpus.test.mjs   # Batch D headers and footers: stories read, written byte for byte when untouched, edited through every command, which header on which page
node --test tests/moreapps/fieldscan.test.mjs tests/moreapps/fieldparse.test.mjs tests/moreapps/fields.test.mjs tests/moreapps/fieldshow.test.mjs tests/moreapps/fields-update.test.mjs tests/moreapps/fieldinsert.test.mjs tests/moreapps/fieldcodes.test.mjs   # Batch D fields: spans, instructions, evaluators, the computed display, Update field and Insert
node --test tests/moreapps/pagecols.test.mjs tests/moreapps/colpass-settle.test.mjs tests/moreapps/linenumbers.test.mjs tests/moreapps/anchorplace.test.mjs tests/moreapps/lineshape.test.mjs tests/moreapps/wrap-settle.test.mjs tests/moreapps/tblfloat.test.mjs tests/moreapps/tblfloat-wrap.test.mjs tests/moreapps/weblayout.test.mjs tests/moreapps/outlinecmd.test.mjs   # Batch D columns, line numbers, floating pictures and tables with text wrap (edited == fresh), Web layout and Outline
node tests/moreapps/word-pages.mjs   # browser (Batch D): Print layout and the views (also word-pages-edit.mjs, word-print.mjs, word-pagesetup.mjs, word-pages-hostile.mjs, word-headers.mjs, word-fields.mjs, word-fields-hostile.mjs, word-columns.mjs, word-linenums.mjs, word-linenumbers.mjs, word-wrap.mjs, word-views.mjs, word-outline.mjs, word-layout-hostile.mjs, word-fonts-load.mjs; word-pages-oracle.mjs: the page starts with the real fonts, needs the corpus)
node tests/moreapps/handoff-pages.mjs   # writes the pg-*.docx, hf-*.docx and cl-*.docx files and their README (questions PG, HF, CL) to try in real Word (local, in tests/moreapps/corpus/handoff; never committed)
node tools/moreapps-corpus.mjs    # fetch the optional sample .docx corpus for the corpus test (needs the GitHub CLI, gh)
WORD_EDIT_CORPUS=1 NODE_OPTIONS=--max-old-space-size=1024 node --test tests/moreapps/edit-roundtrip.test.mjs   # !Letters' editing round trip on every corpus file (~2 min; by default one file in ten)
node tools/moreapps-fonts.mjs     # re-fetch the bundled fonts (pinned and checked)
node tests/moreapps/validate.mjs  # check what the .docx writer writes against the Word schema (needs xmllint)
MOREAPPS_REAL_DOCX=1 MOREAPPS_REAL_DOCX_DIRS=~/Documents node --test tests/moreapps/docx-roundtrip.test.mjs   # also round-trip .docx files on this machine (off by default; system folders + the listed ones, never the home folder)
node tests/integration/flows.mjs dnd print   # one group: dnd print help chars tw configure pinboard shutdown reset basic
node tests/integration/monkey.mjs 5000 1 2 3 # steps, seeds
```

The browser tests need Playwright's Chromium (`npx -y playwright@1.61 install chromium`). They find Playwright in
`node_modules`, the npx cache or `PLAYWRIGHT_MODULE`, and they start `serve.mjs` if nothing is listening on port
8371. Screenshots go to a temporary directory. Set `KEEP_SHOTS=1` to write them to `tests/screens/`.

## Known limitations

* Not an emulator: the OS and applications are reimplemented in JavaScript. ARM machine code runs only inside BASIC
  (CALL/USR and assembler) and for !Lander's original program; relocatable modules, absolutes (`,ff8`) and utilities
  can't run and are left off the disc (as empty placeholders).
* One screen mode (the browser window size, or a fixed mode from !Configure scaled to fit); 16M colours internally.
  `*WimpPalette` / palette changes are ignored.
* Printing uses the browser: !Printers renders the document to a page sized for the configured paper and opens the
  browser's print dialogue. Printer drivers and printer definition files are emulated, not run.
* Sound: WaveSynth / Percussion voices, Maestro and the sample players are approximated with WebAudio.
* Networking (other than !Browse's pages, which come from the host's own browser engine), CD-ROM, NFS/Econet, podules
  and the hardware-specific parts of !Configure are not provided.
* Outline fonts are the original RISC OS fonts converted to OpenType and drawn by the browser: close, but not
  pixel-identical to the RISC OS font manager (no kerning). Fonts found on the disc (e.g. made by !T1ToFont) are
  converted the same way when first used.
* Per-application gaps are listed under "Known gaps" in `docs/apps/*.md`, `docs/BASIC.md` and `docs/BASIC_WIMP.md`.

## Credits

* RISC OS 3.71 © Acorn Computers Ltd 1987-1997. Its source code is from
  [github.com/barryc-ro/RiscOS_371](https://github.com/barryc-ro/RiscOS_371) (put it in `vendor/ro371/`, which is not
  committed, to rebuild the assets). Everything in `assets/` comes from that tree by the converters in `tools/`: the
  sprites (Wimp, Tools, application and file icons, textures), window templates, Messages files, !Help texts, the
  outline fonts (Homerton, Trinity, Corpus, NewHall, Sassoon, Selwyn, Sidney) and the system font, the palette, file type names, and the
  seed hard disc (`Install/HardDisc4`), including the applications' resources, BASIC programs, tutorials, the user guide,
  images and music.
* The applications are ports of the original sources: Edit, Draw and Paint (C, RISC_OSLib), Alarm, Chars, Help,
  Configure, SciCalc, Maestro, Squash, CloseUp, ChangeFSI, PhotoView, Printers, Bookworm, ARPlayer, Player and the
  Diversions (BASIC and assembler originals). The original authors are credited in each application's Info box.
* !Hopper is from RISC OS Open's `Apps/Diversions/Hopper` (© 1994 Simon Foster, BSD 3-clause licence) and
  !Madness from RISC OS Open's `Apps/Diversions/Madness` (© 2016 Castle Technology, Apache License 2.0), at
  [gitlab.riscosopen.org](https://gitlab.riscosopen.org/RiscOS/Sources/Apps/Diversions); their licences are in
  `tools/classics/`. !Calc is reconstructed from the RISC OS 2 Applications 2 disc.
* !Lander © D. J. Braben 1987. The JavaScript port follows Mark Moxon's fully documented source code at
  [lander.bbcelite.com](https://lander.bbcelite.com) /
  [github.com/markmoxon/lander-source-code-acorn-archimedes](https://github.com/markmoxon/lander-source-code-acorn-archimedes).
  The original program is not included. !Lander2 (Lander II) is new code after the same commentary (including its
  "Hacking the landscape" deep dive) and Braben's Zarch.
* The sample Type 1 font is Computer Modern Roman 10 from the AMS Type 1 fonts, © 1997, 2009 American Mathematical
  Society, under the SIL Open Font License 1.1 (`tools/type1/`). opentype.js (© Frederik De Bleser, MIT licence) is
  bundled in `assets/lib/opentype/` to build web fonts.
* The programming fonts in `assets/fonts/nerd/` are [Nerd Fonts](https://www.nerdfonts.com) v3.5.1 (MIT licence,
  © Ryan L McIntyre; icon sets under their own free licences) patched from JetBrains Mono (© JetBrains, SIL Open
  Font License 1.1), Hack (© Source Foundry, MIT / Bitstream Vera licence) and Fira Code (© The Fira Code
  Project Authors, SIL Open Font License 1.1); their licences are beside them (`tools/nerdfonts.mjs`).
* This is a non-commercial preservation and educational project and is not affiliated with Acorn, RISC OS Open Ltd or
  RISC OS Developments.
