# !AREncode ($.Replay.!AREncode)

Code: `src/apps/AREncode/` (`app.js` descriptor, `main.js`). Test: `tests/tierb/act-arencode.mjs`
(screenshots `tests/screens/tierB-arencode-*.png`).

The Acorn Replay compressor front end (Uniqueway / Acorn, 1994). The original `!RunImage` is object code
only (no source in the tree), so the interface is rebuilt from its **Templates** (`assets/templates/AREncode.json`),
its **`messages`** file (read from `<AREncode$Dir>.messages` at run time with `parseMessagesText`; it isn't in
`assets/messages`), `!Sprites` and the detailed description in `$.Replay.!ReadMe`.

Double-clicking the application directory starts it (registered `appDir`, so the disc `!Run` is replaced by
`start()`, which does the same checks: "ARMovie resources not found…" without `ARMovie$Dir`, "Cannot find
!ARWork application for temporary file storage." without `ARWork$Dir` — open `$.Replay` first so the Filer
boots !ARWork — and sets `AREncode$Dir`, `AREncode$Path`, `AREncode$OptionsFile`, `AREncode$WorkDir`).

## Interface
* Icon bar: click = a blank Compress window; drop an ARMovie (&AE7) or an extracted-movie directory to load
  it. Menu (`imenu`): Info (progInfo), Save choices, Quit (`main3` while a task runs).
* **Compress window** (`edithdr`, "Replay compressor"): Name / Date & © / Author from the movie header, the helpful
  sprite (the movie's, else `<ARMovie$Dir>.Default`, scaled into the Sprite box; drop a sprite file to replace
  it — `hdr4`/`hdr5` checks), Single task + mode (arrows step through 256-colour modes), Delete working files
  on joining; Compress (default), Join (only for extracted-movie directories), Continue (only with a saved
  StoppedC state). Menu (`hdrmenu`): Save encoded movie (shaded: nothing is ever encoded), Open work directory,
  Delete working files ▸ (work directories), Movie setup ▸, Configure compressor…, Filters…, Sound tracks….
* **Movie setup** (`cvtwin`, dialogue submenu): frame rate ÷ divisor (1–8; frames per chunk follow, 2-second
  chunks by default), frames per chunk, length, Start at, Index, Join keys; Default / Cancel / OK.
* **Configure compressor** (`compress`): compressor display + popup menu ("Replay compressors": Moving Lines,
  Moving Blocks, Moving Blocks HQ), Make keys, Quality / Frame size / Device bandwidth; the template keeps the
  Quality factor and Frame size rows below the window and the program moves the right one into the box
  (done here), Device bandwidth shows latency / data rate / double buffers.
* **Filters** (`filters` + two `fpane` panes): Available / In use lists; drag names between them (drop
  position = order), Adjust double-click removes. The list is the seven filters the ReadMe documents
  (DirectY, SharpenY, SMedian5/9, SmoothY5/9, TClamp).
* **Sound tracks** (`tracks`): source file n of m, file name, track n of m with its type / channels / rate
  (`Mtracks2`) and format (`Mtracks3`), Insert / Delete, Compress to ADPCM, drop movies to add or replace
  tracks (`Mtracks0` if a movie has none); Update / Cancel.
* **Summary** (`summary`): current operation, last four log lines, Abort / Suspend / Continue (pause),
  Save log… (standard Save box, Text).
* Interactive help from the `H…` tokens for every window, icon and menu item.

## What compression does
Loading checks the header like the original: `hdr3` for sound-only movies (every movie on the seed disc is one),
`hdr6` for unknown video types. Compress checks the compressor's colour spaces and size limits (`Mcomp0`,
`Mcomp1`), then creates the work directory `<ARWork$Dir>.AREncode.<leaf>` with a new `Header` text file and
the `Sprite`, opens the Summary ("Compress: <leaf>", Differ_task) and then reports

  "An error has occurred during compression - Compressor could not initialise correctly."

(`difftask6` + `difftask12`): the batch compressors (`<ARMovie$Dir>.MovingLine.BatchComp`, `Decomp7`, `Decomp17`)
and `Tools.Join` are ARM code / codec data that aren't on this disc. Single-task mode reports the same error
without taking over the screen. Join of an extracted directory reports that `Join` is ARM code.

The decompressor table (names, size steps, colour spaces) is embedded from the original `!ARMovie.Decomp*/Info`
files, since those directories were skipped from the seed disc; any `Decomp*`/`MovingLine` directory with an
`Info` file on the disc overrides it.

## Choices
Save choices writes `<AREncode$OptionsFile>` (`<AREncode$Dir>.!Choices`): first line `AREncode choices file`
(`pref0`), then `key:value` lines (Movie setup, compressor configuration, filters, single-task / mode / delete
options) — the original's binary format is unknown. Read back at start-up. Sound tracks aren't saved (as documented).

## Gaps
* No compression or joining (see above); no single-tasking compression screen.
* Version string in the Info box ("1.00 (RISC OS 3.70)") is a stand-in: the squeezed binary's version isn't readable.
* The xfersend (Save encoded movie) box exists but is never reachable, as nothing is encoded.
