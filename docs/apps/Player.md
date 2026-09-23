# !Player

Code: `src/apps/Player/` (`app.js` descriptor, `main.js` Wimp front end, `audio.js` decoders + WebAudio
voice). App dir: `ADFS::HardDisc4.$.Diversions.!Player`. Task name "Player for sample data" as the original.

Port of the BASIC `!RunImage` (Expressive Software Projects, 1.23 22-Nov-94):

* Windows from `assets/templates/Player.json` with the app's own `Sprites22` area: Player (stop / play /
  pause / loop, time bar, volume bar with up/down arrows, mute, length, format description, Control button),
  Options ("Control": type signed / unsigned / µ-law / ADPCM, bits 4/8/12/16 with the original shading
  rules, mono/stereo, reversed, sample rate with arrows and the Sound_SampleRate menu, Cancel / Set), Info.
* Icon bar icon: Select opens the Player window; menu Info / Quit; drop a file on the icon or the window to load it.
* Formats: Acorn Replay (&AE7) sound tracks (4-bit ADPCM, 8/16-bit linear, µ-law), RIFF WAVE (&BF7 / the
  disc's WaveForm &FB1 files), ArmSamps &D3C and anything else as raw data in the Control format (unknown
  types ask first, as the original). Double-click does not load (the !Boot only names the types) - drop
  files on !Player; &AE7 double-click belongs to !ARPlayer.
* Time bar and volume bar are redrawn sprites like the original; drag or click to seek / set volume;
  Adjust reverses the arrows, Shift steps by 10.

Deviations: playback is WebAudio (no Sound DMA / channel handler); the rate list is a RiscPC's 16-bit sound list.

Tests: `tests/div/act-player.mjs` (`CONTROL=1` opens the Control box), `act-player-play.mjs`,
`tests/div/player-all.mjs` (loads every file in `Diversions.AudioDemos`, all decode). Screens `tests/screens/div-player*.png`.
