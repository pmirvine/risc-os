# !Squash (ACCESSORIES agent)

`src/apps/Squash/` — native port of `Sources/Apps/Squash/c/main` + `c/squash` (app 0.49) and the Squash module's LZW.
Disc app: `ADFS::HardDisc4.$.Apps.!Squash` (its `!RunImage` absolute isn't on the seed disc; the core intercepts it).
Filetype &FCA "Squash" (double-clicking a Squash file decompresses it in place, like `!RunImage <file>`).

* `lzw.js` — node/browser module: `compress`/`decompress` (12-bit Unix `compress` LZW exactly as `cssr`/`zssr`,
  output byte-identical to `compress -b 12`), `squashFile(data, load, exec)` (header `SQSH`, length, load, exec, 0;
  returns null when there is no gain), `unsquashFile`, `readHeader`.
* `main.js` — icon bar icon (clicks do nothing, as the original); files dropped on it are queued and each gets a Save
  box at the pointer (file_fca icon when compressing, the original type's icon when decompressing); OK with a full
  path or drag to a directory display; same name = in place. Directories get the real "xfer_dir" template (Squash /
  Unsquash radios) and are processed recursively; `!` directories are copied unless "Squash Apps" is ticked. Menu:
  Info (ProgInfo template), Save Box (off = squash in place without asking), Squash Apps, Quit. Files that wouldn't
  shrink are left alone / copied; attributes and load/exec preserved. `*Squash <from> [<to>]` command too.

Tests: `node tests/acc/squash.test.mjs` (round trips, real ,fca files, agreement with `Printers/unsquash.js` on the
seed disc's squashed printer definitions, host `compress` interop); `tests/acc/act-squash.mjs`, `act-squash-dir.mjs`;
screenshots `acc-squash*.png`.
