# !Draw (Resources:$.Apps.!Draw)

Code: `src/apps/Draw/` (owner: Draw agent). A port of Draw 1.11 (24-Jul-95) from
`vendor/ro371/Sources/Apps/Draw/c/*`, using the ROM Templates (`assets/templates/Draw.json`), Messages
(`assets/messages/Draw.json` – every menu text, key hint and error comes from there) and Draw's own sprite file
(`assets/sprites/Draw/Sprites` – toolbox `tb_*`/`ptb_*`, line patterns `none`/`pat1..4`, `crosshairs` pointer).

| file | contents |
|---|---|
| `app.js` | descriptor: `!draw` icon, `&AFF` DrawFile type (double-click opens), `*Desktop_Draw`, registers `printDrawfile` as !Printers' `&AFF` renderer at boot |
| `drawfile.js` | **reusable** Drawfile parser / writer / geometry / canvas renderer (no DOM needed for parse & write) |
| `editor.js` | diagram model, entry/select/edit state machine (c.DrawEnter, c.DrawSelect, c.DrawEdit), grid (c.DrawGrid), view rendering (c.DrawDispl) |
| `transform.js` | translate / scale / rotate / make-rotatable (c.DrawTrans) |
| `main.js` | icon bar, windows + toolbox pane, menus (c.DrawMenu), keys, mouse (paper_but), load/insert/save (c.DrawFileIO), dialogues |
| `picker.js` | the ColourPicker dialogue (RGB model) from the ColourPicker module's templates, as used by `dboxtcol` |

## Using `drawfile.js` from other apps
```js
import { parseDrawfile, renderDrawfile, prepareDrawfile, serialiseDrawfile } from '../Draw/drawfile.js';
const doc = parseDrawfile(bytes);              // throws DrawfileError('This is not a Draw file' ...)
await prepareDrawfile(doc);                    // outline fonts, system font bitmap, JPEG decode
renderDrawfile(ctx, doc, { fit: true });       // or { scale: 1 (=Draw 1:1), x, y, originX, originY, background, onReady }
const { canvas, html } = await printDrawfile(bytes, { dpi: 180 });   // for printing: <img> at true physical size
```
!Printers uses `printDrawfile` (via Draw's boot hook, and directly from `src/apps/Printers/print.js` as a fallback).
`renderObjects(ctx, objects, {k, ox, oy, fonts, clip})` paints with an explicit mapping (px = ox + x·k, py = oy − y·k).
Objects: font table, text, path (dashes, joins, butt/round/square/**triangle** caps, winding rules), sprite,
group, tagged, text area (+columns; \F \<n> \A \L \P \M \C \B \U \V \- \\ \; escapes, justification, column flow),
options, transformed text, transformed sprite, JPEG; unknown objects are kept as raw bytes.
Colours `0xBBGGRR00`, `0xFFFFFFFF` = none; coordinates in draw units (1/640 pt, 256 per OS unit).
Outline fonts map to `assets/fonts` (fonts.json); unknown fonts and font 0 use the system font bitmap
(scaled VDU 5 characters, baseline at row 7 of 8) exactly as Draw does.

## Behaviour implemented (as in the 3.71 source)
* Icon bar: Select = new drawing; menu Info / Quit (quit/close queries use Draw's `quit` / `close` templates).
  Drop Drawfile / Sprite / Text / JPEG on the icon = load in a new window; double-click an `,aff` in the Filer.
* Window: `paper` template position (each new window 48 OS units lower), white A4 paper extent (default portrait),
  opens scrolled to the bottom-left as the original; title `<untitled>`, ` *` when modified, ` 2` for multiple
  views, ` Lock` when grid locked. Toolbox pane glued to the left (`pane` template, textured), ^F1 / Toolbox.
* Defaults from `initial_options` (Draw$Options parsed too): closed-line mode, grid cm 1×2 hidden, zoom 1:1,
  thin black line, no fill, bevelled joins, butt caps, even-odd winding, triangle caps 1×/2×, system font 12.8×6.4pt.
* Entry: line / closed line / curve / closed curve (click points, double-click or Return completes, Move tool
  starts a subpath, Backspace deletes the last point, Esc abandons; curves auto-fitted with Draw's
  `fit_corner` algorithm); rectangle and ellipse (click, move, click); text lines (click, type, Return = next line).
  Construction shown as the grey skeleton with the live segment in red and light-blue anchor blobs.
  Crosshair pointer in entry modes.
* Select: click / Adjust-click / double-click (object below) / rubber-band (Adjust adds); dotted red bounding boxes
  with stretch (bottom right) and rotate (top right, rotatable objects only) handles; drag to move / scale / rotate
  with grey ghost boxes; auto-scroll at window edges. Select menu: Select all, Clear, Copy (grid jog), Delete,
  Front, Back, Group, Ungroup, Edit (paths → edit mode, text → writable Text submenu), Snap to grid, Justify
  (L/C/R/T/M/B), Interpolate / Grade (two matching paths in a group). Transform: Rotate, X/Y scale, Line scale,
  Magnify (writable values); text and sprites become transformed objects when rotated / mirrored.
* Path edit (Adjust on a path, or ^E): skeleton with anchor (light blue) and control (orange) points, current
  element red; Adjust selects elements, Adjust-drag moves points (Shift/Ctrl-Adjust drags control-point pairs);
  edit menu: change to curve / line / move, add point, delete segment, flatten join, open / close path,
  Enter coordinate (NumPoint dialogue, inches/cm), snap to grid. Select-click leaves edit mode.
* Style menu: line width, line / fill colour (ColourPicker with None), line pattern (sprite items), join, start /
  end cap incl. triangle width & height, winding rule, font name (System font + font families ▸ styles), font size,
  height, text colour, background. Applies to the selection, the text line being typed, and the current style.
* Misc: Info, New view, Paper limits (Show, Reset, Portrait, Landscape, A0–A5), Print (the paper at true size via
  !Printers `os.printers`, otherwise "A printer driver must be loaded…"), Zoom lock, Undo / Redo (F8 / F9; snapshot based, 80 steps).
* Zoom: Magnifier dialogue (1–8 : 1–8, arrows), ^Q / ^W / ^D / ^R, Shift-Adjust drag = zoom to box,
  Shift-Adjust double-click = zoom out, zoom lock to powers of two.
* Grid: Show F1, Lock ⇧F1 (snapping), Auto adjust, colour, inch / cm (and y-only) spacing and subdivision menus,
  rectangular / isometric; painted as dots with `+` major points (VDU 23,142 cross) on top of the drawing.
* Save: File (F3; direct re-save by clicking Save when named), Selection (⇧F3), Sprites (^F3), Text area (^⇧F3),
  JPEG image; standard Save-as drag to the Filer / other apps; files written with header, font table (fonts used),
  options object and objects – **byte-identical object streams for unmodified drawings** (90 of the 91 parseable vendor
  drawfiles, the other being the deliberately corrupt Test.Illegal; JPEG padding bytes are kept). As in Draw, the font table only lists fonts used by text objects.
* Load/insert: Drawfile (inserted at the pointer, fonts re-mapped, options applied to clean paper, paper size
  guessed from the bbox otherwise), sprite file (first sprite at the pointer), text file (text area 1.5" square,
  standard header prepended if it doesn't start with `\`), JPEG (size from its density, 90 dpi default);
  F2 / ⇧F2 file name dialogue (`dboxfile_db`); drops from other apps' save boxes (RAM transfer).
* Keys: all of `draw_menu_processkeys` (F1–F9 with Shift/Ctrl, ^A ^B ^C ^D ^E ^F ^G ^J ^L ^Q ^R ^S ^U ^W ^X ^Z,
  Tab, Copy, Delete/Backspace, Return, Escape, Print).

## Tests
* `node tests/draw/test-drawfile.mjs` – parses every `,aff` in vendor/ro371 (91 files, 3 intentionally bad ones
  rejected) and checks re-serialised object streams are byte-identical.
* `PLAYWRIGHT_MODULE=… node tests/draw/run.mjs <scenario>` – scenarios in `tests/draw/scenarios.mjs`
  (shapes, select, styles, edit, drags, imports, zoomed, picker, savebox, info, zoom, gridmenu,
  fontmenu, selmenu, closeq, filerrun, roundtrip …) → `tests/screens/draw-<scenario>.png`.
  Run one scenario per process (double-click timing leaks between scenarios otherwise).
  `e2e` = real-mouse check of Front/Back/Group/Undo keys, Save-as drag to a RAM Filer window, Filer double-click,
  Filer-to-window drag, and the Printers renderer; `monkey` (`SEED`, `STEPS`) = random clicks/drags/keys/menu picks.

## Known gaps
* Convert to path (text → outlines) reports "Operation not possible"; DXF import, PostScript/EPSF export
  are not implemented (menu entries shaded / error).
* Only the ColourPicker's RGB model (CMYK/HSV radio buttons shaded).
* Paths are anti-aliased canvas strokes (RISC OS Draw plots aliased); skeletons are painted, not EORed.
* Printer page limits are a fixed ¼" margin when shown (no printer driver page-size query).
* Text-area layout is a close approximation of DrawTextC (no hyphenation / kerning).
