# !Paint (Resources:$.Apps.!Paint)

Code: `src/apps/Paint/` (owner: Paint agent, finished by the EDIT+PAINT finisher). A port of Paint 1.94
(17-Feb-95) from `vendor/ro371/Sources/Apps/Paint/c/*`, using its ROM Templates (`assets/templates/Paint.json`),
Messages (`assets/messages/Paint.json`: every menu, help and error text), its own sprites
(`assets/sprites/Paint/Sprites`: tool icons, brushes, pointers) and the ColourPicker module's templates
(`Picker.json`, `Picker-RGB.json`).

| file | contents |
|---|---|
| `app.js` | descriptor: `!paint` icon, type &FF9 Sprite (double-click opens), `*Desktop_Paint` |
| `main.js` | `PaintApp` (`task.paint`): options (`Paint$Options`), files, load/merge/save, icon bar + menu, DataOpen/DataLoad/RAM import, PreQuit, undo |
| `filewin.js` | sprite file windows (c.Main): "Drawing and name" / "Full info" layouts, file menu (Misc, Display, Save, Sprite ▸ Copy/Rename/Delete/Save/Info/Print, New sprite) |
| `sprwin.js` | sprite editing windows (c.SprWindow), colour windows (c.Colours), the sprite menu (c.Menus) and graphical insert/delete of rows/columns |
| `toolwin.js` | the "Paint tools" pane (c.ToolWindow) with the per-tool extra fields (text, spray, fill, copy/move, brush) |
| `tools.js` / `raster.js` | the 21 tools (c.Tools) / VDU-style shape rasteriser (plot codes as in the original) |
| `dialogs.js` | Create new sprite, info boxes, save boxes, Sprite size, How many?, Select ECF, Magnifier, Print, close/quit queries, Snapshot |
| `picker.js` | ColourPicker dialogue (32K/16M sprites' colour "window", Edit palette) |
| `snapshot.js` | screen grab for Snapshot: rasterises the desktop DOM (SVG foreignObject) into a 16M-colour sprite |
| `spritefile.js` / `ops.js` / `colours.js` / `render.js` | the sprite model: file codec, whole-sprite operations, palettes, canvas rendering |

## Behaviour

* **Icon bar**: Select = new sprite file + "Create new sprite" box (file window appears once a sprite is made);
  Menu = Info ▸, Snapshot ..., Quit; files/Save boxes dropped on it open new file windows.
* **Files**: double-click (DataOpen), `*Run`, drag to icon bar (new window) or into a file window (merge; same
  names replaced), RAM transfer both ways, JPEG (&C85) import as a 16M sprite. Save from the file menu (click = save to
  the current name, ▸ = save box), a single sprite (Sprite ▸ Save, Save ▸ Sprite), palette (&FED). Title `path *`.
  Close query (Save / Discard / Cancel), Adjust-close opens the parent directory, quit query / PreQuit.
* **Byte compatibility**: `spritefile.js` keeps each unmodified sprite's original bytes and the area's extension
  words, so load + save reproduces the file exactly; edited sprites are re-encoded in their own format (old
  mode numbers or new-style mode words, left-hand wastage, masks, 1/2/4/8 bpp palettes with flash pairs,
  16/32 bpp). `node tests/paint/roundtrip.mjs` checks all 114 sprite files on the seed disc (787 sprites):
  raw round trip identical, re-encode identical, fresh encode decodes to the same pixels.
* **Sprite windows**: zoom (`Paint$Options Z`, Magnifier box), grid (colour submenu), several views per sprite
  ("name 2"), colour window beside it (4 or 16 across, mask "T" and ECF entries, small colours), ColourPicker
  for >256 colours; Select/Adjust use the current tool with the Select/Adjust colours.
* **Tools** (all 21): set pixels, spray (density, radius), flood fill (local/global), line, rectangle and
  parallelogram (outline/filled), triangle, circle and ellipse (outline/filled), arc, segment, sector, copy block /
  move block (Local or Export = save as a sprite), grab (scroll), text (text, size, spacing), use sprite as brush
  (name, scale, use sprite colours). Plot actions Set / OR / AND / EOR. Adjust moves the nearest placed point.
  Outlines are EORed while the shape is being placed, as in the original.
* **Sprite menu**: Misc ▸ (Info, Sprite info, Print), Save ▸ (Sprite, Palette), Paint ▸ (Select ECF, Select colour,
  Show colours, Show tools, Small colours, Edit palette), Edit ▸ (Flip vertically/horizontally, Rotate, Scale x/y,
  Shear, Adjust size, Insert/Delete columns/rows with the graphical display, Mask, Palette), Zoom ▸, Grid ▸.
* **Snapshot** (icon bar menu): whole screen or a dragged box, optional delay with the countdown window; the
  result is offered in a Save box.
* Interactive help: every window, tool icon, dialogue icon and menu item answers with the original `PntH*`,
  `EDIT*`, `FILER*` messages.
* Extra (not in 1.94): Ctrl-Z / Ctrl-Y undo/redo of sprite edits in sprite and file windows.

## Tests
`node tests/paint/pw.mjs tests/paint/act-full.mjs` (Filer double-click, byte-exact save, Create, tools, menus,
save + reload), `act-tools2.mjs` (every tool and sprite-menu operation at 16, 256 and 16M colours),
`act-snapshot.mjs`; screenshots `tests/screens/paint-*.png`. `tests/paint/roundtrip.mjs` runs in node.

## Known gaps
* Printing goes through `os.printers` when !Printers is running: the Print dialogue's copies, scale, corner (inches/cm)
  and orientation are honoured, the sprite printed at true size (180 OS units per inch). Without !Printers: PntE9.
* JPEGs are imported as 16M-colour sprites (1.94 used a full palette in ≤256-colour modes).
* Snapshots are made from the browser's rendering of the desktop (16M colours), not from screen memory.
