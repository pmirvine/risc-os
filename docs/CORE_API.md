# Core API (Wimp, desktop, filing system) — contract for application authors

Owner: WIMP CORE agent. Code: `src/core/`. Boot: `src/main.js`. Example app: `src/apps/_Example/`.
Everything is plain ES modules; import from `src/core/…` with relative paths, or use the global hub
`os` (`import { os } from '../../core/os.js'`) which holds every service once the desktop has booted:

| `os.` | what | module |
|---|---|---|
| `wimp` | window manager, tasks, caret, drags, messages, menus (`wimp.menus`), icon bar (`wimp.iconbar`) | `wimp.js` |
| `vfs` | virtual filing system | `vfs.js` |
| `sysvars` | system variables + GSTrans | `sysvars.js` |
| `cli` | OSCLI: `run`, `register`, `obey`, F12 command line, `acquireScreen` | `cli.js` |
| `filer` | directory viewers, `openDir`, `run` (= double-click), `bootApp` | `filer.js` |
| `apps` | application registry / launcher | `app.js` |
| `dialogs` | `reportError`, `infoBox`, `saveAs`, `query`, `discardChanges` | `dialogs.js` |
| `sprites`, `fonts` | Wimp sprite pool, desktop fonts | `sprites.js`, `fonts.js` |
| `pinboard`, `switcher`, `iconbar` | desktop components | |
| `hooks` | extension points: `hooks.basic(argv, ctx)`, `hooks.taskWindow(cmd)` | |

## 1. Coordinates and units

* **Desktop pixels**, y **down**, origin at the screen's top-left. 1 desktop pixel = 2 RISC OS OS units
  (square-pixel modes). `wimp.width/height` = screen size. The whole screen may be CSS-scaled (zoom / Display
  Manager modes): never use `clientX` directly — use the coordinates in events, or `wimp.hitTest`.
* **Work-area coordinates** (inside a window): pixels, y down, origin at the work area's top-left (the RISC OS
  work-area origin). A RISC OS template (OS units, y up, negative downwards) converts as `x = osX/2`, `y = -osY/2`.
  `win.screenToWork(sx, sy)`, `win.workToScreen(wx, wy)`.
* Window geometry: `x, y, w, h` = the **visible work area** on screen (furniture lies outside it, like RISC OS);
  `scrollX, scrollY` = work-area coordinate at the visible top-left; `extent = {x0, y0, x1, y1}` (usually `x0 = y0 = 0`).
* Colours: Wimp colour numbers 0–15 (`wimpColour(n)` in `palette.js` gives CSS). 0 white … 7 black, 8 dark blue,
  9 yellow, 10 green, 11 red, 12 cream, 13 dark green, 14 orange, 15 light blue. `workBg: 1` gives the 3.5+ textured
  grey background (tile_1), like dialogues/Filer; use `0` for white document windows, `255` / `'none'` for no fill.
* Fonts: desktop font = Homerton.Medium 12pt = `fonts.css` (`15px "Homerton", …`). `fonts.cssFor('Trinity.Medium', 14)`
  gives a CSS font for any RISC OS font at a point size; `textWidth(str, font)` measures.

## 2. Applications

### 2.1 Registering an app
Add **one line** to `src/apps/index.js`:
```js
export default [ './_Example/app.js', './Draw/app.js' ];
```
Each `app.js` default-exports a **descriptor** (keep it small; heavy code goes behind `load`):
```js
export default {
  name: 'Draw',                          // task name (Task Manager; "Message from Draw")
  appName: '!Draw',                      // default '!' + name
  appDir: 'Resources:$.Apps.!Draw',      // application directory (default Resources:$.Apps.<appName>);
                                         // ROM apps live in Resources:$.Apps, disc apps e.g. 'ADFS::HardDisc4.$.Apps.!SciCalc'
  hidden: false,                         // true: no application directory at all (run via *command / os.apps.start)
  sprite: '!draw',                       // icon bar / Filer sprite (default appName lower-case)
  sprites: [{ pool: 'Draw', file: '!Sprites22' }],   // sprite files merged into the Wimp pool at boot (like
                                         // *IconSprites in !Boot). Also accepts 'assets/sprites/Draw/Sprites22.json'
                                         // or a VFS path to a RISC OS sprite file.
  filetypes: { 0xAFF: { name: 'DrawFile' } },   // or [0xAFF]. Sets File$Type_AFF (if name given) and
                                         // Alias$@RunType_AFF so double-clicking such a file runs the app with it
                                         // ({run:false} to only claim DataOpen, {override:true} to replace an existing alias).
  open(task, path, msg) { … },           // optional: called for DataOpen of a declared type while running
  memory: 256,                           // K of application memory shown by the Task Manager
  multiInstance: false,                  // false: running again sends 'run' (+ DataOpen) to the running task
  help: 'assets/help/Draw.txt',          // becomes <appDir>.!Help (default assets/help/<name>.txt; false = none)
  files: { Templates: { filetype: 0xFEC, content: { src: 'assets/…' } } }, // extra ROM files in appDir
  commands: { Draw: { syntax, help, run: async (argv, ctx) => … } },     // * commands the app provides
  boot(os, desc) { … },                  // optional, at desktop start (Filer_Boot equivalent)
  info: { name, purpose, author, version },   // for your Info box (convention)
  load: () => import('./main.js'),       // module whose default export is start(task, ctx) (or {start})
  // or: start: async (task, ctx) => { … }
};
```
`ctx` passed to `start(task, ctx)`: `{ args, file, app, dir, os }` — `file` is the canonical path of a file to
open (double-click / `*Run <app> <file>`), `dir` = the app directory (also in `<Name>$Dir`).

ROM apps not (yet) implemented get a placeholder directory (`!Run` = `*Error … not available`), so
`Resources:$.Apps` always shows !Alarm, !Chars, !Configure, !Draw, !Edit, !Help, !Paint, !Printers.

Starting programmatically: `os.apps.start('Draw', args)` → Promise<Task>; `os.apps.tasksOf('Draw')`.
Shell-level: `*Run Resources:$.Apps.!Draw file`, double-click in the Filer, `?run=Draw` URL parameter.

### 2.2 Tasks
`start()` receives a `Task` (`wimp.createTask(name)` makes one without the registry):
```js
task.createWindow(def)                       // Window (see §3)
await task.createWindowFromTemplate('assets/templates/Draw.json', 'DrawWindow', overrides)
task.addIconbarIcon({ sprite: '!draw', text?, side: 'right', priority, onClick(ev), menu: Menu|fn(ev),
                      onDataLoad(ev), onDataSave(ev) })  // returns handle for wimp.iconbar.update/remove
task.onMessage('DataOpen', (msg) => { …; return true; }) // return true = claim (stops a broadcast)
task.every(ms, fn); task.after(ms, fn); task.animate(fn)  // "null events"/timers, cleaned up on quit
task.reportError('text', opts)               // "Message from <name>" error box
task.openHelp()                              // show <appDir>.!Help (the Filer's Help action)
task.quit()                                  // closes windows, removes icon bar icons, stops timers, TaskCloseDown
task.on('quit', fn); task.on('run', ({args, file}) => …)   // 'run' = started again (single instance)
```
Standard behaviour to implement: Menu ▸ Quit → check unsaved data (`discardChanges`) → `task.quit()`;
handle `PreQuit` (see §6) so Shutdown can be stopped.

## 3. Windows

```js
const w = task.createWindow({
  title: 'Untitled', x: 200, y: 100, w: 400, h: 300,       // visible area on screen
  extent: { w: 1000, h: 2000 },                            // or {x0,y0,x1,y1}
  flags: { back, close, title, toggle, vscroll, hscroll, size, moveable, pane, hotKeys, noBounds, backWindow,
           scrollRepeat, scrollDebounce },                 // or a raw Wimp flags number
  colours: { titleFg: 7, titleBg: 2, workFg: 7, workBg: 0, titleFocus: 12 },  // or workBg: 0|1|'none'
  workButton: 'click' | 'clickdrag' | 'clickdragdouble' | 'doubleclick' | 'release' | 'writable' | 0-15,
  icons: [ …icon specs (§4)… ], spriteArea: Map|null, menu: Menu | (ev) => Menu, minW, minH,
});
w.open({ x, y, w, h, scrollX, scrollY, behind: 'top' | 'bottom' | 'keep' | otherWindow })  // Wimp_OpenWindow
w.close(); w.delete(); w.bringToFront(); w.sendToBack(); w.toggleSize()
w.setTitle(t); w.setExtent({w, h}); w.scrollTo(x, y); w.getState(); w.isOpen; w.hasFocus
w.work        // DOM element positioned at the work-area origin (scrolls with the window): append your own DOM
w.view        // the clipping visible-area element
w.useCanvas((ctx, rect) => draw, { hiDPI: false })   // redraw-driven canvas; ctx is in work-area coords,
w.invalidate(rect?)                                   // rect = visible work area; call invalidate() to redraw
w.addIcon(spec) → Icon; w.icons[i]; w.iconAt(x, y); w.setIconText(i, t); w.getIconText(i); w.setIconState(i, {selected, shaded, deleted})
w.attachPane(pane, { dx, dy, w, h, fitWidth, fitHeight })   // pane kept at (x+dx, y+dy), directly in front, opened/closed with w
w.pointer = 'ptr_write'                                      // pointer sprite while over the window ('' = default arrow)
```
Shift-Select (or Alt-click) on a close icon iconises a window onto the Pinboard (`iconise` event, cancellable);
double-clicking the icon re-opens it. The mouse wheel scrolls the window under the pointer (`wheel` event
`{dx, dy}` first — return true to handle it yourself; windows with scroll-request flags get `scrollrequest`).
Templates: `wimp.createWindowFromTemplate(tplOrUrl, name, overrides, task)` accepts the assets JSON
(`assets/templates/<App>.json`), a parsed binary file (`parseTemplateFile(bytes)`), or a URL (→ Promise).
Icons keep their template indices (`w.icons[3]`). Templates whose icons use the app's own sprites need its
sprite area: `{ spriteArea: await os.sprites.loadManifest('Configure', 'Sprites22') }` in `overrides`
(icons look there first, then in the Wimp pool). Positions from the template are honoured (y converted
from the RISC OS bottom-left origin) — override with `{x, y}`.

### 3.1 Window events — `w.on(type, fn)`
Handlers receive an event object; call `ev.preventDefault()` (or return `false`) to suppress the Wimp's default
action, return `true` to mark it handled.

| event | when / fields | default action |
|---|---|---|
| `click` | mouse click reported per button type. `{button ('select' / 'menu' / 'adjust'), buttons (4/2/1), x, y (work), sx, sy (screen), icon (Icon or null), iconIndex, kind:'click', shift, ctrl, alt, window}` | Menu button: opens `w.menu` if set |
| `doubleclick` | same fields | |
| `drag` | a drag started (button types with drag): same fields + `pointerEvent`, `startSX/SY` | — (start one with `wimp.drag`) |
| `key` | key press while the window has the input focus: `{code (Wimp key code), char, key (DOM), shift, ctrl, alt, icon}`; return `true` if used | unhandled keys go on to `hotkey` windows |
| `hotkey` | unhandled keys, for windows with `flags.hotKeys` | |
| `open` | Open_Window_Request (user moved/resized/scrolled/toggled/back): `{x,y,w,h,scrollX,scrollY,behind}` — modify & call `w.open(ev)` yourself after `preventDefault()` (e.g. panes) | `w.open(ev)` |
| `close` | Close_Window_Request `{button, shift}` (Adjust = Filer "open parent" convention) | `w.close()` |
| `scrollrequest` | windows with `scrollRepeat`/`scrollDebounce`: `{dx, dy}` (±1 line, ±2 page); return true | Wimp scrolls 16px/page |
| `opened`, `closed`, `moved`, `deleted` | notifications | |
| `redraw` | `invalidate()` on a window without `useCanvas`: `{rect}` | |
| `gaincaret`, `losecaret` | input focus changes (title turns cream = focus) | |
| `pointerenter`, `pointerleave`, `pointermove` | pointer over window (`pointermove` only if listened) | |
| `dataload` | files dropped on the window: `{files:[{path, filetype, size, name, type}], path, filetype, x, y, sx, sy, icon, from, shift}`; return true | also sent as `DataLoad` message to the task |
| `datasave` | another app's Save box dropped here: `{leafname, filetype, size, x, y, icon, accept(path), receive() → Promise<data>}` | also `DataSave` message |
| `iconchanged` | a writable icon's text was edited `{icon}` | |
| `paste` | clipboard text pasted while focused (non-writable) `{text}` | |
| `menuopen`, `menuclosed` | window shown/hidden as a menu dialogue box | |

Mouse buttons: Select = left, Menu = middle **and right** (default), Adjust = Shift+left. With
`*Configure Buttons Adjust` (or `os.input.config.rightIsAdjust = true`, URL `?buttons=adjust`),
right = Adjust and Ctrl+left = Menu. Click semantics follow the Wimp button types (e.g. type 10 reports click,
then drag or double; types 4/5/7/8/11 auto-select icons with ESG rules; 14/15 give the caret to writable icons).
Adjust on scroll arrows scrolls the other way; Adjust-drag on a scroll bar scrolls both ways; Adjust-drag of the
title moves a window without raising it; Select on the back icon sends it to the bottom.

### 3.2 Input focus & caret
`wimp.setCaret(win, icon, index)` — caret in a writable icon; `wimp.setCaret(win, null, -1, {x, y, h})` — draw the
Wimp caret yourself at work-area x,y (Edit style); `wimp.setCaret(win)` — focus without visible caret;
`wimp.setCaret(null)` — nobody. `wimp.caret` = `{window, icon, index, pos}`. Keys go to the focus window.
Writable icons edit themselves (←/→, Home, Delete/Backspace, Copy(=End), Ctrl-U, ↑/↓/Tab between writables, `A`
validation, `bufLen`); Return and unhandled keys reach your `key` handler. A character rejected by an icon's `A`
validation also goes on to the `key` handler (Key_Pressed), as in the real Wimp.
`wimp.processKey(code, char?)` = Wimp_ProcessKey: delivers a key code to the input-focus owner as if typed (writable
icon editing, then the caret window's `key` event, then hot-key windows) — e.g. !Chars inserting characters.
**Key codes** (Wimp `Key_Pressed`): characters = Latin-1 code; Return 13, Escape 27, Backspace 8, Delete 127,
Home 30, F1–F9 &181–&189, F10–F12 &1CA–&1CC, Tab &18A, Copy(End) &18B, ←&18C →&18D ↓&18E ↑&18F, Insert &1CD,
PageDown &19E, PageUp &19F; +&10 Shift, +&20 Ctrl. Ctrl+letter = 1–26. F12/Ctrl-F12/Shift-F12/Ctrl-Shift-F12
are reserved by the desktop. For games: `os.input.isDown('ArrowLeft')` (DOM `KeyboardEvent.code`) tracks held keys,
`os.input.mouseX/mouseY` the pointer.

## 4. Icons
Friendly spec (or raw `{bbox, flags, text, validation, sprite, bufLen}` with RISC OS flag bits — `IF`, `BTYPE` in `icons.js`):
```js
{ x, y, w, h,                 // or bbox {x0,y0,x1,y1} (work area, y down)
  text: 'OK', sprite: 'file_fff', border, filled, hcentre, vcentre (default true), rjustify, halfSize,
  fg: 7, bg: 1, button: 'click'|'release'|'radio'|'writable'|'clickdrag'|…|0-15, esg: 1, allowAdjust,
  selected, shaded, validation: 'R6,3;A0-9;Pptr_write', maxLen: 10, font: {name:'Trinity.Medium', size: 14} }
```
Validation commands: `R` 3D borders (R1 slab out, R2 slab in, R3 ridge, R4 channel, R5 action button, R6 default
action button, R7 writable well; `R5,3` = highlight colour 3), `S` sprites (`Sradiooff,radioon`: 2nd shown when
selected), `A` allowed chars, `D` password char, `F` font colours, `L` wrapped multi-line text, `P` pointer sprite.
Standard dialogue look: action buttons `border, filled, hcentre, validation 'R5,3'`, default button `'R6,3'`,
writable field `border, filled, bg 0, button 'writable', validation 'R7'` (or plain black border like 3.71 save boxes),
labels `rjustify` text only, option/radio buttons `sprite+text 'Soptoff,opton'` / `'Sradiooff,radioon'` with
`button: 'radio'` (ESG 0 toggles; ESG n = exclusive group). `icon.setText(t)`, `icon.text`, `icon.setState({…})`,
`icon.setSprite(n)`, `icon.selected/shaded`, `icon.moveTo(bbox)`.

## 5. Menus
```js
import { Menu, colourMenu } from '../../core/menu.js';
const m = new Menu('Draw', [
  { text: 'Info', submenu: infoWindow },                       // a Window = dialogue-box submenu
  { text: 'Save', submenu: () => saveBox, dotted: true },      // function = built when opened; dotted = separator after
  { text: 'Grid', ticked: () => grid, action: () => { grid = !grid; } },
  { text: 'Style', submenu: styleMenu, shaded: () => !sel },
  { text: 'Find', key: '^F', … },                              // key text shown right-aligned ('^⇧F12' ok)
  { text: '', writable: { value: 'name', maxLen: 10, validation: 'A~ ' }, action: (ev) => use(ev.value) },
  { text: 'Quit', action: (ev) => task.quit() },               // ev: {item, index, path, button, value, menu}
  { text: '', sprite: 'pat1', spriteW: 64 },                   // sprite item (name or SpriteInfo; looked up in the
]);                                                            // menu's `spriteArea` Map, then the Wimp pool)
wimp.menus.openAt(m, clickEvent, { task })     // at the pointer (x-32, y) — standard for window menus
wimp.menus.openIconbar(m, ev.sx, { task })     // icon bar menus (just above the bar)
wimp.menus.open(m, x, y, { task, onSelect, onClose })
wimp.menus.close(); wimp.menus.refresh(); wimp.menus.isOpen
```
Submenus open when the pointer moves over the right-hand arrow; Adjust-click selects and keeps the tree open (ticks
are re-evaluated). Escape/click elsewhere closes. The owner task gets a `MenusDeleted` message. Colour menu:
`colourMenu(title, () => current, (n) => pick)` = the Wimp's 16-colour menu. A window given as `w.menu` opens on Menu clicks.

## 6. Messages, drag & drop, data transfer
`wimp.sendMessage(type, data, { to: task|window, from: task })` — broadcast when `to` omitted; the first handler
returning `true` claims it (returns the claiming task). Handlers get `{type, data, from, ...data}`.

| message | sent by | meaning / what to do |
|---|---|---|
| `DataOpen` `{path, filetype, files}` | Filer (double-click) | if you load this type, open it and `return true` |
| `DataLoad` `{files, window, icon, x, y}` | Filer / apps (drop) | also the window's `dataload` event |
| `DataSave` `{leafname, filetype, accept, receive}` | Save boxes | also `datasave` event |
| `PreQuit` `{object()}` | Task Manager (Shutdown / Exit / Quit task) | unsaved data? call `msg.object()` then ask the user |
| `Quit` | Task Manager | quit (after PreQuit) |
| `TaskInitialise`, `TaskCloseDown` `{task, name}` | Wimp | |
| `ModeChange` `{width, height}` | Wimp | screen size changed; `wimp.on('modechange')` too |
| `MenusDeleted` | menus | your menu tree closed |

**Dragging** (Wimp_DragBox / DragASprite): inside a `drag` event handler:
```js
const drop = await wimp.drag({ sprite: 'file_aff', box: {x0,y0,x1,y1} /*screen*/, event: ev.pointerEvent });
//   type: 'fixed' (default box/sprite follows pointer) | 'rubber' (rubber band) | 'point'; bounds: {x0,y0,x1,y1}
// drop = {window, icon, x, y (work), sx, sy, box, shift, part}
```
Move/resize a window from a work-area drag: `wimp.dragWindow(win, ev, {resize})`.
Deliver files to a drop point: `wimp.dataLoad(drop, [{path, filetype, size}], task)`. Drops on Filer windows copy
(Shift = move), on the Pinboard pin, on apps give `dataload`. A window's Filer directory is `win._filerDir`.

**Save boxes** — use the standard dialogue (drag the icon to a Filer window or an app, or type a full path + OK):
```js
import { saveAs } from '../../core/dialogs.js';
const box = saveAs({ task, title: 'Save as', filename: 'Drawing', filetype: 0xAFF,
                     getData: async () => bytesOrString, onSaved: (path) => { title = path; modified = false; } });
// use as a menu dialogue: { text: 'Save', submenu: () => box } ; or box.openCentred() (e.g. F3)
// dropping on another app's window uses its 'datasave' handler (ev.receive() gives the data: RAM transfer)
```

## 7. Standard dialogues (`dialogs.js`)
* `reportError(message, {appName, title, sprite, category:'error'|'info'|'warning'|'question'|'program', cancel, buttons:['Describe'], okText})`
  → Promise<1 OK | 2 Cancel | extra button text>. 3.71 look: "Message from <app>" (title "Error" without appName),
  category sprite, default OK button, Return/Escape. Also `wimp.reportError`, `task.reportError`.
* `infoBox(task, {name, purpose, author, version})` → "About this program" Window for an `Info ▸` submenu.
* `query({task, title, message, buttons: ['Discard', 'Cancel']})` → Promise<button text|null>;
  `discardChanges(task, text?)` → Promise<bool>.
* `saveAs({…})` see §6.

## 8. Filing system (`vfs`)
Paths: `ADFS::HardDisc4.$.Documents.Letter`, `RAM::RamDisc0.$.x`, `ADFS::0.$` (floppy), `Resources:$.Apps.!Draw`,
`$`, `@` (CSD), `^`, `&`, `%`, path variables `Boot:`, `Choices:`, `<Draw$Dir>.Templates` (GSTrans'd). Names are
case-insensitive/case-preserving; `.` is the separator (a host `/` is fine inside names).
```js
vfs.stat(path)   → {name, path, type:'file'|'dir', isApp, filetype, size, load, exec, attr, locked, date, readonly} | null
vfs.list(dir)    → [info…]              vfs.exists(p), vfs.isDir(p), vfs.canonical(p), vfs.parent(p), vfs.leaf(p)
await vfs.readFile(p) → Uint8Array      await vfs.readText(p) → string (RISC OS Latin-1)
vfs.readFileSync(p) (after await vfs.preload(p))
vfs.writeFile(p, data (Uint8Array|string), { filetype: 0xFFF })   // returns canonical path
vfs.mkdir(p, {parents}); vfs.delete(p, {recursive, force}); vfs.rename(a, b); await vfs.copy(a, b); await vfs.move(a, b)
vfs.setType(p, t); vfs.setAccess(p, attr); vfs.stamp(p); vfs.expandWild('$.Docs.*'); vfs.usage(disc)
vfs.on('change', ({dir}) => …)          // Filer windows refresh automatically
```
File types: numbers `0x000–0xFFF`; `-1` untyped (load/exec), `0x1000` directory, `0x2000` application (in `stat`).
`filetypes.js`: `typeName(t)`, `parseType('Text'|'&FFF')`, `fileSprite(info, {small})`. Errors are `FSError` with
RISC OS messages (e.g. "File 'x' not found"). Hard disc = seed disc (`assets/disc`) + IndexedDB overlay (persistent),
floppy persistent, RAM disc not; Resources: is read-only.

## 9. Commands (`cli`)
```js
await os.cli.run('Copy RAM::RamDisc0.$.a $.b ~CF', { out })   // out: {write(s), writeln(s)}; default: desktop *Command window
os.cli.register('Draw', { syntax: 'Syntax: *Draw [<file>]', help: '…', min: 0, max: 1, noSplit: false,
                          run: async (argv, ctx) => {…} })       // ctx: {out, raw (tail), cli, depth}
await os.cli.obey(path, { args, quiet })
const scr = os.cli.acquireScreen({ onKey: (domEvent, {code, char}) => … });  // full screen: {el, width, height, release()}
```
Built in: Cat/., Ex, Info, FileInfo, Dir, Back, URD, Lib, CDir, Type/List, Dump, Copy, Delete, Remove, Wipe, Rename,
Access, SetType, Stamp, Count, Free, Run, Obey, Echo, Set/SetMacro/SetEval/Unset/Show, Alias, Eval, If, IfThere,
Repeat, Error, Help, Modules, ROMModules, Time, FX, Configure, Status, Basic, Desktop, WimpTask, Filer_OpenDir,
Filer_CloseDir, Filer_Run, Filer_Boot, IconSprites, Pin, Pinboard, BackDrop, Shutdown, TaskWindow, RMEnsure (+ harmless
no-ops such as WimpSlot, RMLoad, LoadModeFile, DosMap), Do. `*Run`/double-click resolve `Alias$@RunType_XXX`; `%` prefix skips aliases.
`*Obey` with no file name inside an Obey file ends that file (the `BootEnd` / `RMEnsure … Obey` idiom); `-c`/`-v` are accepted.

**Native executables** (`src/core/native.js`): ARM code on the seed disc exists only as empty placeholders (docs/ASSETS.md §5).
Running an Absolute/Module/Utility file (`/path`, `*Run`, a Filer double-click, an Obey line) first looks it up here:
```js
import { registerNative } from '../../core/native.js';
registerNative('$.!Boot.Utils.BootVars', { run: async (args, ctx) => { … } });  // path from $ on its disc, or
registerNative('Utils.BootVars', impl);             // <parent>.<leaf>; case-insensitive; no run = a no-op
```
`ctx` is the OSCLI context plus `path` and `tail`. Registered: `Utils.BootVars` (Boot$OSVersion / State / Unique / Dir, as
`Boot/Source/BootVars/c/main`), `!System.SysPaths` (Sys$Path, System$Path from the numbered module directories),
`Configure.ClrMonitor` (Boot$MonitorNotConfigured) and no-ops for `Utils.FreePool`, `Utils.VProtect`, `Utils.PatchApp`,
`Library.Repeat` (→ `*Repeat`), `FontMerge.FontMerge`, the PreDesk `BandLimit`, `ROMPatch.!RunImage`, `SoundDMA.NewSound`/`SoundDMA`,
`Tasks.~CDReinit`, `!Maestro.EnsureRMA`, `utils.CheckMem` (!Internet). The `!RunImage` of a registered JS app starts the app
(`os.apps.runPath`). A module with no stand-in loads silently (like `*RMLoad`); other ARM code reports
"'<name>' is ARM code, which cannot be run on this computer".

## 10. Sprites
`sprites.get(name)` → `SpriteInfo {name, w, h, osW, osH, cssW, cssH, url, variantUrl('selected'|'shaded')}` from the
Wimp pool (apps' pools added via the descriptor `sprites` or `sprites.addManifest(pool, file)`).
`sprites.img(name, {half, variant, area})` → `<img>` at desktop size. `spritesFromFile(bytes)` / `sprites.addSpriteFile(bytes, id)`
decode RISC OS sprite files from the VFS. Private areas: `win.spriteArea = map` (icons look there first).
Tool sprites: `sprites.tool('bicon')`. To draw a sprite on a canvas: `ctx.drawImage(await sprites.get('file_aff').canvas(), x, y, s.cssW, s.cssH)`
(set `ctx.imageSmoothingEnabled = false`).

## 11. Other services
* `wimp.setPointer(spriteName | SpriteInfo)` (e.g. `'ptr_double'`, `''` for the arrow; `'name,x,y'` gives the active point
  like a `P` validation, default (0,0) as in the Wimp; a SpriteInfo may carry `hot: [x, y]`, its active point in CSS px;
  the pointer is scaled with the desktop zoom), `os.config.set('Zoom', 2)` /
  `('Buttons', 'Adjust')` / `('WimpFont', 1)` / `('Textured', 'Off')` (also `*Configure …`, persisted).
* `wimp.iconbar.add/update/remove` (`add({..., raw: {flags, validation, w, h}})` makes an icon with raw Wimp icon
  flags/validation and a fixed pixel size, e.g. MemNow's ridged text icon), `wimp.hitTest(sx, sy)`, `wimp.screenRect(excludeIconBar)`, `wimp.beep()`,
  `wimp.setMode({width, height})` (fixed "screen mode", scaled to fit), `wimp.setScale(z)` (zoom; `?zoom=2`).
* Sound (`src/core/sound/`, docs/SOUND.md): the one emulated RISC OS sound system with the ROM voices.
  `wimp.beep()` is VDU 7, which plays SOUND 1,-13 or -5 (Loud/Quiet),100,6 on WaveSynth-Beep; `beepGain` 0 (speaker
  off) silences it. `import { soundSystem, vdu7 } from '../../core/sound/index.js'`, then `soundSystem().control(ch, amp, pitch, dur)`
  (SOUND), `.qSchedule(...)`, `.attachNamedVoice(ch, name)`, `.stereo(ch, pos)`, `.configure(n)`. config.js applies
  the volume, speaker, loud/quiet and channel 1 voice settings.
* `os.filer.openDir(path, {mode:'large'|'small'|'full', sort, x, y, w, h})`, `os.filer.run(path)` (double-click semantics).
* `os.pinboard.pin(path, x, y)`, `os.pinboard.setBackdrop(path, 'tile'|'scale'|'centre')`.
* Hooks for other agents: `os.hooks.basic = async (argv, ctx) => …` (*BASIC), `os.hooks.taskWindow = (cmd) => …` (Ctrl-F12 /
  *TaskWindow). If an app named `TaskWindow` is registered, Ctrl-F12 starts it.
* Interactive help: `wimp.helpAt(sx, sy)` → help text for the thing under the pointer (menu item `help`, window
  `helprequest` event — set `ev.text` —, `icon.help`, icon bar `help`, or `win.helpText`), in !Help markup (`\S`, `\R`, `|M`).
* Boot completion: `os.ready === true` and `wimp.on('desktopready')`.
* Configuration (`os.config`, `src/core/config.js`, localStorage "CMOS"): `zoom`, `rightButton`, `textured`, `wimpFont`
  (`'homerton'`, `'system'` or any font name e.g. `'Trinity.Medium'`), `wimpFlags`, `doubleClickDelay`, `doubleClickMove`,
  `dragDelay`, `dragMove`, `beepLoud`, `speaker`, `volume` (0-7), `mode` ({width,height}, applied at boot); `apply()` pushes
  them into `input.config` / `wimp.config` (`solidDrags`, `errorBeep`, `beepGain`). Other keys may be kept in `values` + `save()`.
* Reset (`src/core/reset.js`): `*ResetDisc [-cmos]` (forget all changes to the hard disc / floppy), `*ResetCMOS`
  (configuration only), Delete held at start-up = both ("Delete-power-on"), R held = CMOS ("R-power-on"), `?reset=disc|cmos|all`.
* URL parameters: `?fast=1` skip the boot screen, `?open=<path>`, `?run=<app>`, `?cmd=<*command>`, `?zoom=2`, `?buttons=adjust`.

## 12. BBC BASIC integration
`src/core/basichost.js` runs `*BASIC` / BASIC files (`Alias$@RunType_FFB` = `BASIC -quit "%*0"`) full-screen with the
BASIC agent's `BasicMachine` (`src/basic/machine.js`) and `VDU` (mode 28, scaled to the screen), passing: `fs` = a
VFS adapter (`readFile(path) → {data, type}|null`, `writeFile(path, data, type)`, `stat`, `delete`, `rename`, `mkdir`,
`setDir`, `list(dir) → [{name, type, filetype, length}]`), `sysvars` (Map-like view of the core variables), `sound`,
`oscli(cmd)` (core * commands first; returns false for BASIC's own), `onExit` (QUIT). Keys come from
`os.cli.acquireScreen`; the mouse is mapped to OS units. `os.hooks.basic` may be replaced by a later agent.
Filer_Boot of applications runs their `!Boot` in "safe" mode (no *Run/BASIC), so booting never starts programs.

## 13. Tests
Every area runs with `node --test tests/<area>` (`basic`, `core`, `draw`, `edit`, `paint`, `acc`, `div`, `tw`, `bw`,
`integration`): `tests/lib/suite.mjs` starts the server if needed and runs each Playwright script in a child process,
failing on a non-zero exit, `FAIL` lines, page errors or 404s (screenshots go to a temporary directory; `KEEP_SHOTS=1`
writes them to `tests/screens/`). `tests/integration/flows.mjs [group…]` checks cross-application flows;
`tests/integration/monkey.mjs [steps] [seed…]` is the long random test over the whole desktop.
`tests/core/`: `test-core.mjs` (functional checks in the browser), `test-persist.mjs` (IndexedDB overlay),
`monkey.mjs [steps] [seed]` (random clicks/drags/keys, reports page errors), `shot.mjs <name> [actions.mjs]`
(screenshots into `tests/screens/`; `act-*.mjs` are action scripts, e.g. `act-menu.mjs`, `act-save.mjs`). Needs Playwright (`PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs` if not installed in the project)
and a server (`node serve.mjs`, port 8371; override with `URL=http://localhost:PORT/`).
