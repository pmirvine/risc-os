# !ChangeFSI

Code: `src/apps/ChangeFSI/` (`app.js` descriptor, `main.js` desktop front end, `fsi.js` decoders, image
processing and sprite/JPEG encoders). App dir: `ADFS::HardDisc4.$.Utilities.!ChangeFSI`.

A port of the Wimp part of Sophie Wilson's `source/ChangeFSI` (BASIC, 1.12 13 Mar 95), with the image
pipeline rewritten in JS:

* Windows from `assets/templates/ChangeFSI.3dTemplate.json` (the 3D set the BASIC loads): Info, Scaling,
  Processing, Sprite Output (`Output`), JPEG Output, picture window (`Pic`), Image / Source / Range info, Zoom.
  Menu texts come from the disc's `Messages` file (the `m$()` array, one line each).
* Icon bar menu: Info, Scaling, Processing, Sprite Output / JPEG Output (the ticked one is the destination),
  Reprocess, Fast (shaded: a RiscPC has VRAM), Save Choices (`<ChangeFSI$Dir>.Choices`, original line format),
  Quit (asks if the result is unsaved). Picture menu: Image info, Source info, Range info, Zoom, Save image, Reprocess.
* Input: drag a file to the icon bar icon (or double-click TIFF &FF0; JPEG only via DataOpen while running,
  as 3.71's !Boot makes JPEG double-click an error): JPEG, GIF, PNG, BMP, TIFF, RISC OS sprites (all modes).
  Browser formats are decoded with `createImageBitmap`; the "Source info" text follows ChangeFSI's wording.
* Output: sprite files in any mode number or `S<bpp>,<xdpi>,<ydpi>` mode string (1-32 bpp, dithered/greys/
  special palettes, sprite named from the options as ChangeFSI does, e.g. `p28`, `s32,90,90`), or JPEG (quality,
  mono). Scaling (fit screen, 1:1, halve, custom ratios, rotate, flips), processing (range, equalise, dither
  off, invert, brighten, black point, gamma, sharpen, smooth).
* Save box (standard `saveAs`); saving over the source asks "Overwrite source file?".

Deviations: "Fast" is always shaded; processing times are the browser's; formats the browser can't decode
(e.g. Kodak PhotoCD, Degas, etc.) give ChangeFSI's "format not recognised" error.

Tests: `tests/div/act-changefsi.mjs` (menu / dialogues, `CFSI=menu|256|scale|proc|jpeg|info|source|zoom|save`),
`tests/div/changefsi-formats.mjs` (GIF, PNG, JPEG, sprite inputs + sprite save round trip). Screens
`tests/screens/div-changefsi*.png`.
