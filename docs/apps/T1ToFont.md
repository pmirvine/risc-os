# !T1ToFont (HardDisc4.$.Utilities.!T1ToFont)

Code: `src/apps/T1ToFont/` (tier-B apps agent). Type 1 Converter 1.28 (31-Jan-95), a port of
`vendor/ro371/Sources/Printing/T1ToFont/c/*` using the disc's real Templates (`ToAcorn`, `ProgInfo`), Messages,
`!Sprites22` and `Encodings` directory. Double-clicking the application directory runs it (registered `appDir`; the
ARM `!RunImage` placeholder is never executed).

* `app.js` descriptor. `start()` does what the disc `!Run` does: `T1ToFont$Dir`, `T1ToFont$Path`
  (macro `<T1ToFont$Dir>.,<Font$Path>`). `boot()` sets `Font$Path` to `<!Fonts dir>.,Resources:$.Fonts.` if it is unset
  (normally the Font Manager and the `!Fonts` `!Boot` `*FontInstall` do that; neither runs here).
* `main.js` front end (`c/frontend`): icon bar icon (task name "Type 1 Converter" from `Title`); Select opens the
  "Type 1 to Acorn Font Converter" box (only one; clicking again brings it to the front); icon menu Info (ProgInfo, version
  from Messages) / Quit. In the box: Menu gives the Encoding / Save in pop-ups over those fields (or the icon menu
  elsewhere), the pop-up buttons open them with Select (the original's faked Menu click). Encoding items come from
  Messages `Encodings` (Acorn Extended Latin = `/Base0`, As specified in Type 1 file, Selwyn, Sussex, Sidney), Save in
  lists the `Font$Path` directories. Dropping a file on the Type 1 / AFM field fills that field; elsewhere the file
  goes to the Type 1 field if it is type `&FF5` or its contents are a Type 1 font (PFA `%!PS-AdobeFont`, PFB `0x80`
  segments, Mac resource format), else to the AFM field. The font name is guessed from `/FontName`
  (`guess_acorn_fontname`: `Times-BoldItalic` → `Times.Bold.Italic`). Data saved from another application goes
  through `<Wimp$ScrapDir>.Type1File` / `AFMFile`. Dropping a file on the icon bar icon also works (opens the box).
  OK checks the fields with the original errors (`NoSaveDir`, `NoFiles`, `BadType1`, `NotAFM`, `NoName`, `DirErr*`) and
  converts; the box stays open.
* `type1.js` engine (pure JS, also used by the node test):
  * PC (PFB) and Mac formats are preprocessed to plain Type 1 (`c/convert`); eexec (hex or binary), charstring
    decryption (lenIV), Subrs, CharStrings (first set only, as the original), `/Encoding` arrays, `StandardEncoding`
    → Specials.Adobe with the "Using Adobe Standard Encoding" message, FontMatrix, closefile.
  * Charstring interpreter: hsbw/sbw, r/h/v moveto, lineto, curveto variants, closepath, callsubr/return, div,
    callothersubr with the PostScript stack (flex 0/1/2 - flattened to a line, as the front end always passes
    DO_FLATTEN - and hint replacement 3 via `pop callsubr`), pop, setcurrentpoint, seac (composite of base + accent by
    code when both are in the encoding, otherwise executed inline), endchar.
  * Outlines file version 8 exactly as `converttype1` lays it out: header, design size 1000, font bbox, chunk index,
    32-character chunks with dependency bytes, 12-bit coordinates, composite (base+accent) characters, empty glyphs for
    missing characters (NO_NULL_CHARS), non-zero winding flag. Names `Outlines0` / `IntMetric0` for Base0 fonts
    (`getfontfilename`), `Outlines` / `IntMetrics` + an `Encoding` file for the others.
  * IntMetrics from the AFM file, or from the crude AFM generated from the Type 1 file (GENAFM: ItalicAngle,
    isFixedPitch, UnderlinePosition/Thickness, CapHeight, per-character WX/B, FontBBox): `checkmetrics` +
    `writemetrics` with composites / dummies for characters not in the AFM, commoning-up of identical entries, the
    sized character map for >256 codes, kern pairs (KPX/KPY/KP) and the misc table.
  * Encodings are read through `T1ToFont$Path` (`T1ToFont:Encodings.<name>`, following `%%RISCOS_BasedOn`); the ROM
    `Resources:$.Fonts.Encodings./Base0` isn't in the VFS, so a copy is bundled (`base0.js`).
  * Keep PostScript copies the (preprocessed) Type 1 file to `<font>.Type1` (`&FF5`) and the AFM to `<font>.AFM`.
  * If `FontMerge` is found on `Run$Path` the original converts into `<Wimp$ScrapDir>.T1Font` and starts FontMerge
    (ARM code here): this version then copies the new font directory into the Save in directory itself.

## Differences / gaps

* **No scaffold (hinting) data**: stems, blue zones and the scaffold table are parsed but not converted; the
  Outlines have an empty scaffold index (valid for the Font Manager; hints only matter for low-resolution rendering).
* The metrics' composite accent offsets are 0, as in the original (character widths are never known there).
* Converted fonts reach the font menus through the core font registry (`src/core/fontreg.js`, `os.fontreg`): it
  scans the `Font$Path` directories for Outlines/IntMetrics pairs, and converts a font found there to a web font
  when it is first used (the same OpenType builder as `tools/fonts.mjs`, `src/core/fontbuild.js`, with opentype.js
  loaded on demand). Chars, Configure, Draw and Edit list and render them. The files written are valid RISC OS
  fonts (checked by parsing them back with `src/core/riscosfont.js`, and by drawing glyphs from them in the test:
  `tests/screens/tierB-t1tofont-glyphs.png`).
* The hourglass isn't shown; errors in the middle of a conversion don't stop to wait for OK.
* The seed disc has one Type 1 font to convert: `$.Utilities.Type1Fonts.cmr10/pfb` and `cmr10/afm`, Computer Modern
  Roman 10 from the AMS Type 1 fonts (SIL Open Font License 1.1, with its `OFL` and a `ReadMe`; written by
  `tools/disc-type1.mjs` from `tools/type1/`, see the README there). `tests/tierb/t1-make.mjs` also builds a font
  (PFA + PFB) from `assets/fonts/Trinity-Medium.otf`, with flex, hint replacement and a seac accent.

## Tests

* `node tests/tierb/t1-convert.test.mjs` (no browser): generated PFA/PFB → Outlines/IntMetrics with Base0 and
  font-specific encodings, user AFM with kerns, all parsed back.
* `tests/tierb/act-t1tofont.mjs`: launches from the Filer, error box, real Filer drag of a PFB typed Data into the box,
  pop-up menus, conversion into `!Fonts.Sample.Medium`, a second conversion (PFA, font-specific, Keep PostScript), Info,
  Quit. Screenshots `tests/screens/tierB-t1tofont-*.png`.
* `tests/tierb/act-t1-fontmenus.mjs`: converts the seed disc's cmr10 into `!Fonts.CompModern.Medium`, then checks the
  registry builds a web font from it and that the Chars, Configure, Draw and Edit font lists have it
  (`tests/screens/tierB-t1-fontmenu.png`).
