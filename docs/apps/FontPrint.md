# !FontPrint (ADFS::HardDisc4.$.Printing.!FontPrint)

Code: `src/apps/FontPrint/` (tier-B apps agent). FontPrint 1.26 (31-Jan-95), ported from
`vendor/ro371/Sources/Printing/FontPrint/c/*` with the real Templates (`Download` main window, `List` pane,
`ProgInfo`), Messages and `!Sprites22`. The disc's `!RunImage` is ARM code; double-clicking the application
directory (or `*Run`) starts this version (`FontPrint$Dir` is set as `!Run` would).

Despite its name, the 3.71 FontPrint does not print font sample sheets: it edits the **PostScript font
list** of the current PostScript printer (see its `!Help`). Each entry maps a RISC OS font to a
PostScript font with an encoding (`Trinity.Medium  Map to  Times-Roman`), or is a *Download* entry.

* Icon bar: Select opens the window (main window + list pane, columns at 42 % / 58 % from Messages);
  menu Info ▸ / Quit. A second copy reports "FontPrint is already running".
* List: Select selects one entry, Adjust toggles. Menu (only when a PostScript printer is selected;
  with no selection, the entry under the pointer is selected until the menu closes): Font/Selection ▸
  (Download, Map to ▸ = the PostScript names in the list + a writable entry, Encoding ▸ = Adobe.Special /
  Adobe.Standard, Delete), Select all, Clear selection, Add font ▸ (outline font menu from `assets/fonts/fonts.json`).
* Save writes the font file (`local foreign encoding` lines, or just `local` for downloads);
  Defaults rewrites it from the printer definition's `font_alias` list.
* !Printers protocol (PSPrinterQuery/Ack/NotPS/Modified/Defaults) is emulated against `os.printers`:
  with no !Printers running, or a non-PostScript current printer, the title is "No PostScript printer
  selected" and Defaults/Save are greyed. This is what the original does (it raises no error box).
  For a PS printer the file is `<Choices$Write>.Printers.ps.Printers.<n>` (n = the printer's position),
  created from the definition file in `$.Printing.Printers` (unsquashed) the first time. FontPrint
  polls `os.printers` in place of the SetPrinter message, so it picks up !Printers starting, quitting,
  or the current printer changing.

Test: `tests/tierb/act-fontprint.mjs` (screenshots `tests/screens/tierB-fontprint-*.png`).
