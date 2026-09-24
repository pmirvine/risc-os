# !Hopper

Code: `src/apps/Hopper/`: `app.js` (descriptor), `main.js` (desktop side: icon bar, menu, Info, Choices, file
loading, QTM calls), `game.js` (the game), `qtm.js` (QTMTracker stand-in), `prefs.js` (Choices and HiScores
formats). App dir: `ADFS::HardDisc4.$.Diversions.!Hopper`, written by `tools/disc-classics.mjs` from
`tools/classics/Hopper`.

Simon Foster's Frogger-style game (1994-96), shipped in the Diversions of the RISC OS 3.6/3.7 era. Help the frog
across four lanes of traffic, past the snake on the verge and over the river on logs and turtles to its five
homes, eating flies on the way and dodging the crocodile.

## Sources

* RISC OS Open's `Apps/Diversions/Hopper` 1.05 (23 Dec 2014, BSD 3-clause, "Copyright (c) 1994, Simon Foster"):
  <https://gitlab.riscosopen.org/RiscOS/Sources/Apps/Diversions/Hopper>, commit `8d97121`. It has the complete C
  source (`c/*`, `h/*`), `Resources` (`!Help`, `!Run`, `!Sprites`, `!Sprites11`, `!Sprites22`, `Keys`, `UK/Messages`,
  `UK/Templates`) and `DataFiles` (`Graphics`, `Levels`, `Music`, `Sounds`). The port follows the C source function
  by function.
* The two modules `!Run` RMEnsures, QTMTracker 1.25 (Steve Harrison's ProTracker player) and PsychoEffect 1.02
  (Andy Southgate's 256-colour fade), are third-party and not in the source release. Their behaviour comes from
  how `qtm.c` and `graphics.c` call them.

## What is original and what is recreated

**Original files (the application directory as the Makefile installs it):** `!Help`, `!Run`, `!Sprites`,
`!Sprites11`, `!Sprites22`, `Keys`, `Messages` (plus the `_Version` line the build adds), `Templates`, `LICENSE`,
`Graphics.*` (the game's pre-shifted MODE 13 graphics: frog, fly, snake, vehicles, logs and turtles, scenery, digits,
title), `Levels.Cars` and `Levels.Water` (10 levels), `Music.Intro`, `.InGame` and `.HiScore` (ProTracker modules by
Leitch, Myers & Young) and the nine `Sounds.*` effects (8-bit VIDC log samples). No new artwork was needed. The
game draws these original graphics exactly as `graphics.c` does.

**Recreated in JavaScript:**

* `!RunImage` (C) is a placeholder that starts the app.
* `game.js` is `hopper.c`, `frog.c`, `cars.c`, `water.c`, `scenery.c`, `snake.c`, `score.c`, `timer.c`, `sync.c` and
  the drawing side of `graphics.c`. It keeps the original's model: a 320 x 256 8-bit screen and a second buffer
  in the default 256-colour palette, the same word addresses (screen base − 40 words), the plot, store, mask, water
  and cars lists plotted in the same order, and the frog's and snake's saved backgrounds. It also keeps the
  original's rules:
  * the 800 ticks/s clock (`OS_ReadMonotonicTime << 3`) and objects moving one pixel every `speed` ticks;
  * the hop: 4 + 5 + 6 + 5 pixels in 20-tick steps, then two rest steps;
  * collisions with their exact margins;
  * scoring: 10 for each hop forward, 200 for a fly, the remaining time for each frog home, and 200 for each
    home when a level is cleared;
  * an extra life at 5000 and then every 10000;
  * a time limit of 400 × 5 cs, with the alarm at 100;
  * the snake from level 2 (speeds 96/64/48), the crocodile in the homes from level 2, and turtles that dive
    (levels 2, 3-5, 6+, at three speeds);
  * levels past 10 made harder by speeding up level 10;
  * `sync_random` with its never-seeded `seed` (starts at 0);
  * the title and attract loop (credits, high scores, control keys, general keys, changing every 15 s with the
    four wipe effects), the "Press 'SPACE' to start" pulse, the high score entry, pause and resume.
* Controls, as in the original: `'` up, `/` down, `Z` left, `X` right (redefinable), Space starts, F9 pause, F10
  resume, Escape aborts the game and, on the title screen, returns to the desktop, F1/F2 effects on/off, F5/F6 music
  on/off. Auto-repeat off means each hop needs a new key press (Choices ▸ Miscellaneous).
* The desktop side (`main.c`, `iconbar.c`, `menu.c`, `templates.c`, `keys.c`):
  * the icon bar icon: Select or Adjust plays; Menu gives Info ▸ / Choices... / Quit (Adjust keeps the menu);
  * the original Templates: the proginfo window, and the Choices window with its four panes kept joined to it;
  * Set, Save and Cancel (Adjust re-shows the window instead of closing it);
  * the volume sliders, the option and radio icons, and Reset of the high score table;
  * "Change" keys: the change box in the middle of the screen, then UP, DOWN, LEFT, RIGHT. Mouse buttons and
    function keys are not accepted, and each key must differ from the earlier ones;
  * `Choices:Hopper.Choices` (13 words) and `Choices:Hopper.HiScores` (10 × score + 40-byte name), written to
    `<Choices$Write>.Hopper`, with the table saved on quit when "Save on exit" is on.
* `qtm.js` (the QTMTracker stand-in) runs on the one emulated sound system (`src/core/sound`, docs/SOUND.md):
  * 8 channels, as `QTM_SoundControl 8` asks for: 1-4 play the module (panned L R R L) and 5-8 the effects;
  * one installed voice fills the channel buffers with VIDC log samples;
  * ProTracker timing (speed/BPM, 50 Hz ticks) and the usual effects;
  * `QTM_Volume` (the fade-out with the screen), `QTM_MusicVolume` / `QTM_SampleVolume` from Choices, and
    `QTM_Stereo` set from the frog's x position;
  * the effect channel rotation of `qtm_sample`.

  The game takes the sound system when it starts and gives it back (channels, voices, stereo) when it returns to
  the desktop.

**Approximations and differences:**

* *PsychoEffect_Fade* is modelled as scaling each pixel's colour by fade/60 and picking the nearest colour in
  the palette.
* *Text* is Trinity.Bold.Italic at 45 × 19 point, drawn with the web font. It is anti-aliased against black in
  16 levels and matched to the palette, like ColourTrans_SetFontColours + Font_Paint.
* *Frame rate:* the MODE 13 screen is a canvas scaled to fit the desktop. The loop waits for the browser's next
  frame where the original waits for VSync. Timing is still in the original's 800 Hz ticks.
* *Joystick:* not available, so there is no `Joystick_Read`. The title screen always says "Press 'SPACE' to
  start".
* *Sound quality:* the Choices setting (QTM_SetSampleSpeed 24/32/48/64 µs) is stored but not used. The mix always
  runs at the sound system's 48 µs rate.
* *QTM note numbers* are taken as ProTracker notes from C-1, which sets the pitch of the effects.
* *Change box:* its two icons name a sprite `!hopper95` that isn't in `!Sprites`, so `!hopper` is shown. The box is
  a window here. The original plotted its icons straight onto the screen.

Tests: `tests/div/hopper-node.mjs` covers the disc files, level tables, QTM music and effects on the sound system,
and the Choices/HiScores formats. `tests/div/classic-hopper.mjs` covers the icon bar menu, Info, Choices (panes,
sliders, Change keys, Set/Cancel), the title, attract music, a game (hops, time, pause/resume, Escape) and engine
checks (cars, water, logs, turtles, the fly, homes, the crocodile, extra lives, `sync_random`, the high score name
entry). Screens: `tests/screens/classic-hopper*.png`.
