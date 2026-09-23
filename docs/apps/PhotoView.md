# !PhotoView

Code: `src/apps/PhotoView/` (`app.js` descriptor, `main.js` Wimp front end, `image.js` decode / render / sprite
encoding; the sprite encoder is ChangeFSI's exported `encodeSprite`). App dir: `ADFS::HardDisc4.$.Utilities.!PhotoView`.
Tests: `tests/div/photoview.mjs` (screens, `PV=overview|params|orient|image|grey|menu|save|scale|scaled|info|rights|filer|iconmenu|progInfo`),
`tests/div/photoview-check.mjs` (functional PASS/FAIL). Screens: `tests/screens/div-photoview-*.png`.

Acorn's PhotoCD Toolkit example app (0.10, 31 Mar 1995; C sources `c.main`, `c.pcdovervw`, `c.sprparam`, `c.image`).
No PhotoCD discs here, so **PhotoView is the desktop's JPEG viewer**: a "Source" is a directory of JPEGs (&C85).
Descriptor claims `&C85` (`override`: double-click a JPEG runs PhotoView) and names `&BE8` PhotoCD (`run:false`).

* Icon bar `!photoview`; menu Info ▸ (ProgInfo template with the `title`/`pcdlogo` sprites) / Source ▸ / Quit.
  Source lists `CDFS::0.$` (faded - no CD drives, as the original) + `Images.00-49`, `50-99`, `Team` (00-49 ticked);
  dropping a directory (or a file: its parent) on the icon adds it (max 16) and selects it.
* SELECT on the icon: "Overview" contact sheet (template `Overview`, one per path, max 12): 128×128 white slide
  frames (R1) on a 136 px pitch, thumbnails in an R2 slot centred in the frame (portrait/landscape), label below.
  Columns follow the window width (4 at first, re-flowed on resize, as `overvw_event_handler`). Thumbnails are
  decoded lazily (visible rows + one ahead, two at a time); failures show "N/A".
* Click a slide: the "Opening an Image Pac (name)" box (`SprParams`): Resolution / Orientation / Palette popup
  menus (`MEresol*`, `MExform*`, `MEpal*`), Dither option, the thumbnail drawn in the current orientation (click
  a side to rotate there, ADJUST = mirrored, like the original). Cancel restores the settings. OK opens an image
  window (template `Image`, black work area, title = leafname) at 1 image pixel = 1 desktop pixel.
* Image menu (`MEimageB`): Image info ▸, Save ▸ (standard save box, "Spritefile", &FF9), Export (faded as in the
  released build), Scale view ▸ (`ScaleView`: 25..400% buttons, arrows step 5% below / 50% above 100%, 6-1600%,
  Return/Scale applies, ADJUST-Scale keeps the box open).
* JPEGs double-clicked in the Filer (start or DataOpen), `*Run`, or dropped on the icon / any PhotoView window
  open directly with the current parameters. `&BE8` files give "PhotoCD error: Invalid or corrupted Pac handle".
* Interactive help from the Messages tokens (icon bar, menus, `PROGINFO`, `SPRPAR`, `IMAGEINFO`, `SCALEVIEW` + icon
  letter, like `main_processhelpevent`). Quit / Quit message quit; PreQuit never objects (nothing unsaved).

Deviations (JPEG instead of PhotoCD):
* Resolution = linear scale of the JPEG: Base/16 ¼, Base/4 ½, Base 1, 4Base 2, 16Base 4 (the disc's Corel images
  are 768×512 = PhotoCD Base). Orientation n = (n%4)·90° anticlockwise, mirrored first for n ≥ 4 (PCD transform).
* The desktop is always 16M colours ("32 bpp - 90 x 90 dpi"); the original fades Palette/Dither in >8bpp modes,
  here they stay active: Default WIMP = full colour (saved as a 32bpp sprite), Bitonal/4/8/16/256 greys = the
  `c.palettes` grey ramps with optional Floyd-Steinberg dither (saved as 1/2/4/4/8 bpp sprites with palette).
* Image info relabels the PhotoCD fields: Filename, Last modified, Image size, File size; "Image copyright?" = a
  `ReadMe` in the image's directory or its parent, and Read rights shows it in the `text` window (system font).
* Overview title "Overview: <path>" (original "PhotoCD: <path> (Ser# …)"); slide labels show leafnames (widened
  to the frame) instead of numbers; clicking the icon when the overview is open brings it to the front.
* No progress window / scrolling partial views (decoding is quick); no desktop-save message.
