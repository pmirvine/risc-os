# Fidelity to RISC OS 3.71

This doc tracks how closely the desktop matches real RISC OS 3.71: what was checked, what was
fixed, and the differences that remain. The FIDELITY agent owns it.

Ground truth, in order of authority:

1. The original sources in `vendor/ro371`: Wimp (`Desktop/Wimp/s/Wimp01`–`Wimp10`, `Iconbar`),
   Filer, Switcher, Desktop, DragASprite, Kernel `NewReset`, ResourceFS.
2. RISC OS 3.5–3.71 screenshots in `tests/reference/`. `SOURCES.txt` gives the origin and a
   description of each one.

How to check:

* `node tests/fidelity/scenes.mjs [filter…]` takes one screenshot per scene and writes it to
  `tests/screens/fid-<scene>.png`. Scenes: desktop, Filer (large, small, full info, selection, menus),
  icon bar menus, Task Manager, Save as, Info, error, query, Configure, Draw, Paint, Edit, games,
  F12, shaded/writable icons, rubber band, file drag.
* `node tests/fidelity/boot.mjs` captures the boot sequence at 0.7 s, 2.5 s, 4.5 s and 7 s.
* To compare with a reference, crop the same region from both images and put them side by side
  (ImageMagick `magick a.png b.png +append`). Measure pixel rows with `magick x.png -format
  "%[pixel:p{x,y}]" info:`.

## Checked and matching (no change needed)

| Area | Evidence |
|---|---|
| Window furniture | The ROM `Tools3d` sprites, including the speckled title bar and the scroll wells. Title bar and scroll bars are 20 px. Focused title is cream (Wimp colour 12), unfocused is grey (2). Matches `ro37-edit.png` pixel for pixel. |
| Menus | Items 44 OS units, tick and arrow columns 24 OS units, text 3 px into its icon, dotted separator 24 OS units with the `&F0` dash pattern, shaded text in Wimp colour 4, highlight inverted. Checked against `ro37-menu-filer-display.png`. |
| Menu positions | Window menus open 64 OS units left of the pointer. Icon bar menus open 96 OS units above the bottom of the screen. Submenus and dialogue boxes open at the right edge of the arrow, level with the item. |
| Text placement | Text is centred on the font bounding box (Font_ReadInfo), as `findtextorigin` does. Left-justified text sits 3 px in. |
| Icon bar | Height and icon and label baselines match `ro37-desktop-empty.png` exactly (see the fix below). |
| Backdrop | The `!Boot` default is `Backdrop -tile …Textures.T3` (Acorn logo marble), tiled from the top-left like 3.7. |
| Configure | The main window is pixel-identical to `ro37-configure-menu.png`. Window manager and Alarm setup match their references, including the shaded writable (white field, light border, grey text). |
| Shaded sprites and selection | Sprite colours follow the Wimp's `inversefunc`: selected inverts greys, dark colours are halved, others scaled by V×10/16; shaded maps luma into &B0–&FF. |
| Greyed writable fields | Shaded writables, including ones in ESG groups such as Keyboard > Auto repeat and Alarm > User defined, render as in 3.7. The brief's known issue did not reproduce. |
| F12 | The desktop scrolls up. There is a `*` prompt in the 8×8 system font. |

## Fixed

| Fix | Source |
|---|---|
| **Boot:** after the kernel start-up text, the Desktop welcome banner is shown centred over the grey screen until 4 s have passed or a mouse button is pressed. The banner uses the 3.71 ROM `Desktop` template: Acorn logo, "RISC OS 3.7", © 1997, and a drop shadow at +16 OS units. | `Desktop/s/Desktop` DisplayNewWelcome, KeepItUpLoop |
| Template icons with an outline font never got their font, because the decoded `font: true` flag blocked the lookup. The banner's 36pt text, among others, was drawn at 12pt. | `templates.js` |
| **Caret:** a 1-pixel red stroke with the Font_Caret ends (the pixels either side on the end rows), as tall as the font bounding box (19 px), instead of 2 px with 6 px bars. Edit's caret moved onto the character boundary. | `Wimp05` plotcaret / Font_Caret; `ro37-dialog-alarm-controls.png` |
| **Pointers:** the active point defaults to (0,0), which is what `setptr_shape` and P validation do. `Pname,x,y` is honoured. The pointer is scaled with the desktop zoom. | `Wimp01` setptr_shape, `Wimp03` |
| **Double-click pointer:** after the first click on a double-click icon or work area, the pointer shows `ptr_double` until the double-click time passes. | `Wimp03` doubleptr_on/off |
| **Drag boxes:** an EOR (inverting) 1-pixel dot-dash line with pattern `&FC` (6 on, 2 off) that marches round the box, one pixel every 2 cs. The old version was a CSS dashed outline. | `Wimp04` dottedbox, rotdotdash |
| **DragASprite:** the dragged sprite is hatched (checkerboard) with a black drop shadow at 8 OS units, instead of being 85 % opaque. | `DragASprit/s/StartUp` |
| **L-validation text** (error boxes, query boxes, Configure drop zones): each line is centred, lines are 40 OS units apart, and the block is centred vertically. | `Wimp04` iconformatted |
| **Error box:** the application sprite is `!<appname>`, or `switcher` when there is no app name. If that sprite is missing, the category sprite takes the space, which is what happens with Filer errors. | `Wimp07` |
| **Menu width:** the widest item plus 16 OS units (fixupmenuwidth), where it was 24. The Filer's shaded `File ''` item keeps its shaded arrow. | `Wimp05` |
| **Submenus** open only when the pointer is over the arrow icon (the last 24 OS units of the item), not 16 px before it. | `Wimp05` |
| **Shaded outline-font icons** AND their colours with 2, so black becomes light grey. Desktop-font icons still use AND 4. | `Wimp04` setfancyfontcolours |
| **Icon bar:** 130 OS units are visible (the extent is 132, opened from `scry0 + dy`), giving 67 px with the outline. It was 1 px too tall. | `Wimp/s/Iconbar` openiconbar |
| **Filer viewers:** small-icon and full-info rows are 22 px (smi_height plus 4 OS units above and below), not 26. Full-info columns are sized from `cache_lengths` strings. Width is columns × item width + `dvr_rhsgap`, and at least the title plus 6 characters. Reflow uses the 32 OS unit `dvr_rhsslack`. The date format is `"%24:%mi:%se %dy %m3 %ce%yr"` (spaces, from template icon 1). Resources: directories show `WR/`. The `ro37-filer*.png` windows now match to within a few pixels. | `Filer/s/Redraw`, `Open`, `GoFiler`, `MsgsIn` |
| **Task Manager:** rows are 40 OS units and section headings 56 OS units. Labels are aligned as in the template (names left; Next, Free and Total right). The Total row has a bar. The window opens at its template position (front_window). Checked against `ro37-taskmanager*.png`. | `Switcher/s/Switcher` allocateblock |

## Remaining known differences

* **Pressed-in action buttons (deliberate, optional).** While Select or Adjust is held on an action button
  (R5/R6 validation, e.g. !Configure's adjuster arrows with their `pup`/`pdown` sprites), it is drawn pressed
  in, as in RISC OS 4. The 3.71 Wimp was built with this switched off (`slabinout SETL false` in
  Wimp/s/Options). It is on by default; *Configure WimpPress Off, or the "Pressed-in action buttons" option
  added to !Configure's Window manager pane, gives strict 3.71 behaviour.

* **Fonts.** Homerton is converted to OpenType and rendered by the browser. Glyph shapes and
  anti-aliasing are close to the Font Manager's, but the Font Manager's hinting is not reproduced,
  so text widths can differ by 1–3 %. Menus and Filer windows can come out a few pixels wider.
* **Colours.** The desktop uses the 16 Wimp colours exactly. Real 3.7 machines usually ran
  256-colour modes, where colours such as the caret red were snapped to the VIDC palette
  (`#cc0000` instead of `#dd0000`).
* **Boot.** The power-on beep is missing, because browsers block audio before user input. The
  `!Boot` hourglass is not shown. The kernel text uses 16 px cells rather than the configured
  mode's 8 px. The backdrop can appear before the banner closes because booting is fast; on a
  real machine the backdrop is set by the boot file while the banner is still up.
* **Drag boxes** are not shown or hidden according to `*Configure WimpFlags` for each drag type.
  Rotation continues while the box moves; the Wimp rotates the pattern only while the box is still.
* **The EOR caret** is always red. The Wimp EORs colour 11 with the background, so on a
  non-white background the caret takes a different colour.
* **Pointer** active points for app-specific sprites (e.g. Draw's crosshair) come from the app.
  Other pointers without explicit coordinates use (0,0), exactly like the Wimp.
* **Icon bar menus** are placed from their measured height, so separators count. Applications
  that follow the Style Guide formula (96 + 44 × items) ignore separators.
* **Task Manager** memory figures are simulated. Pinboard is listed as a module task; one 3.7
  screenshot shows it as a 64K application task.
* **Menus** open a dialogue-box submenu when an item without an action is clicked. The Wimp
  reports the selection to the application instead.
