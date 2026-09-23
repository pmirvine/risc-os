# !ARPlayer

Code: `src/apps/ARPlayer/` — `app.js` (descriptor), `main.js` (the application), `armovie.js` (ARMovie header /
catalogue / sound track reading). Sound decoding and playback come from `../Player/audio.js` (`decodeADPCM`,
`decodeRaw`, `Voice`). App dir: `ADFS::HardDisc4.$.Apps.!ARPlayer`.

The `!RunImage` is squeezed, but its C source is in the tree:
`vendor/ro371/BuildSys/ReplayFlop/Source/ARPlayer/Uniqueway/ARTools/c/*` (main, display, tools, play, info, setup,
global; the 3.71 binary is byte-identical to that build) plus SJM's libraries (`Libraries/ARLib/c/arhdr`, `arsnd`,
`Spr/c/spr_disp`, `Wimp/c/wmisc*`). The port follows them; windows come from `assets/templates/ARPlayer.json`,
text from `assets/messages/ARPlayer.json`, button sprites from `!ARMovie.Sprites22` plus `ARPlayer:Sprites22`.

* **File type**: descriptor claims `&AE7` (`override`); !ARMovie's `!Boot` (booted later) sets
  `Alias$@RunType_AE7` to its `Player` binary, so the descriptor's `boot()` re-claims it on `desktopready`.
  Double-click = open the movie and play it (as ARPlayer's `CatchDataOpen`); `DataOpen` does the same while running.
* **Icon bar**: Select/Adjust open a display window (or bring the one window forward). Drop an ARMovie to open it.
  Menu: Info ▸ (`progInfo`, version 1.29 (01-Jul-96) = `VERSION_NUMBER 129` + `__DATE__` of main.o), Global
  choices…, Multiple windows, Save choices (writes `<ARPlayer$OptionsFile>` = `!ARPlayer.!Choices` and the Obey
  file `<ARPlayer$StateFile>` = `Choices:Boot.PreDesk.ARPlayer` with the `ARMovie$…` variables), Quit.
* **Display window** (`sprdisp`): work area = the helpful sprite at its own size (from the header's sprite
  offset), or `<ARMovie$Dir>.Default` ("Acorn Replay") for an empty window; title = movie name, else the path.
  New windows are shifted down by a title bar (`wmisc_openshifted`) and kept clear of the icon bar. Select plays,
  Adjust stops, Menu gives File (Movie info…, Save frame ▸, Save data ▸) / Edit (Copy frame, Clear clipboard) /
  Movie setup… / Time bar / Tool bar / Play. Close with Adjust opens the parent directory.
* **Tools pane** (`Tools`, attached left/bottom, not resized — it sticks out beyond small movies as in the
  original): red/white time bar (drag with Select while stopped), `mm:ss.ff` counter (`mm:ss` while playing),
  Stop (again = rewind), Play, Play big (shaded while playing; does nothing for sound-only movies, as the
  original), Pause (from stopped: start paused), Step (compressed sound only steps in Pause mode, else error
  `play2`), Sound monitor. Time bar / Tool bar crop the pane like `tools_create`.
* **Movie info** (`info`, one per display): name/date/author, video type ("None"), size, bpp/colour space/fps/
  keys, per-track sound (`Minfo2`, `Minfo3` or the decompressor's `Info` description), "n chunks x f fpc = t s".
* **Movie setup** (`Controls`, shared, template scroll hides "Change mode"): all fields with the original fade
  rules; only Loop (count / Forever) and Sound track affect sound playback; Update restarts a playing movie;
  trajectory menu lists `<ARMovie$Dir>.Trajectory`.
* **Global choices** (`global`): sets `ARMovie$Interpolate/4Colour/PrefMode/PrefBigMode` immediately; version
  from `ARMovie$Version` (set to `0.37 (9th December 1994)`, what the !ARMovie Player sets); Create colour tables
  asks, then runs `<ARMovie$Dir>.MovingLine.Make8col11` (absent → error).
* **Save frame / Save data** (`xfersend` / `xferdata`): save the helpful sprite (`Frame`, &FF9); extract
  Header (first 14 lines), Sprite, sound tracks (`Adpcm`/`Sound`/`Samples`, numbered), Images/Keys (video only)
  into a directory, like `!ARMovie.Tools.Extract`. Drag to a Filer window or type a full path.

## Deviations
* No video decompressors: movies with video show their helpful sprite and play the sound track in the desktop;
  Play big shows the helpful sprite full screen while the sound plays (click/Escape stop). Change mode,
  trajectory, shape, rate and extra args are kept but have no effect.
* Only one sound plays at a time (as ARLib); Copy frame only marks the clipboard as ARPlayer's (no core
  clipboard protocol). The `!Choices` file is a simple `Key: value` text file.

## Tests
`node tests/div/arplayer-node.mjs` (header parsing / decoding of all AudioDemos movies);
`tests/div/arplayer-func.mjs` (functional, via `tests/core/shot.mjs`); screenshots `tests/div/arplayer.mjs`
(`AR=movie|blank|menu|imenu|setup|info|global`), `arplayer2.mjs` (`AR2=blank|proginfo|saveframe|savedata|transport`),
`arplayer3.mjs` (time bar drag, bar toggles, help) → `tests/screens/div-arplayer*.png`.
