# !Maestro (ACCESSORIES agent)

`src/apps/Maestro/` — JS re-implementation of Maestro 2.13 (disc app `ADFS::HardDisc4.$.Apps.!Maestro`; original is
crunched BASIC `!RunImage`). Filetype &AF1 "Music": double-click a tune in `$.Sound` (BachFXVI, Fanfare, Gigue,
HandlMes1a/b, ShostF1) to open it. (`1812` / `Enigma` there are ARMovie files, not Maestro.)

* `format.js` — the real file format, reversed from the BASIC: `"Maestro"LF`, version byte, tagged sections
  (1 music queue + 8 channel note streams as BASIC `PRINT#` ints, 2 staves/percussion, 3 voices, 4 volumes,
  5 stereo, 6 tempo); version-1 files too. Load/save round-trips byte-exactly for all seed tunes except
  HandlMes1a (it carries unused trailing channel bytes). `perform()` = the playback timing (bars, ties, key &
  bar accidentals, clefs, per-stave cursors).
* `score.js` — layout/drawing in OS units using the original sprite table (hotspots) and the Sprites22 note glyphs:
  staves, clefs, key & time signatures, notes/rests/accidentals/dots/ties/ledger lines, bar lines + numbers every 5.
* `synth.js` — Web Audio: WaveSynth-Beep (wavetable), StringLib-Soft/Pluck/Steel/Hard (Karplus-Strong),
  Percussion-Soft/Medium/Snare/Noise; stereo positions, per-channel volume; look-ahead scheduler.
* `main.js` — "ScoreWind" + NotesPane/RestsPane (top) + SharpsPane (bottom) as panes. Pick a palette item
  (highlighted inverted), SELECT on a stave places it (notes go to a free channel of that stave; accidentals,
  dots, tie toggle on the nearest note; bar/clef/key/time insert commands); ADJUST deletes. Menu (as the
  !RunImage DATA): Save ▸ (save box), File ▸ (fileInfo), Print ▸ (uses `os.printers.print` if present), Clear,
  Staves ▸ (1-4 + percussion), Instruments ▸ (InstrWind: SELECT/ADJUST cycle voice/volume/stereo), Volume ▸,
  Tempo ▸, Time sig. ▸ (TimeSigW), Key sig. ▸ Major/Minor ▸, Goto ▸ (BarW), Play (toggle; red position marker,
  auto-scroll, starts at the first visible column). Icon bar: SELECT opens the score, MENU = Info / Quit;
  unsaved-changes boxes from the "close"/"query" templates. Sets `Maestro$Running`.

Not done: MIDI column, printing layout beyond one strip, beaming (the original doesn't beam either).
Tests: `tests/acc/act-maestro.mjs` (STEP=load|play|instr|menu|edit), `act-maestro-save.mjs`; screenshots `acc-maestro-*.png`.
