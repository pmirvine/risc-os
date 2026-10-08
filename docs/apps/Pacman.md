# !Pacman

Code: `tools/games/!Pacman/` (JSScript modules, no extensions; `!Boot`, `!Run`, `!Help`), put on the disc as
`$.Diversions.!Pacman` by `node tools/disc-pacman.mjs` (run by `tools/build.mjs`, after `disc-lander2.mjs`); the icon
(`!pacman`, `sm!pacman`) is drawn by `tools/games/icon.mjs`. User guide: `$.Docs.Pacman` (`tools/docs/Pacman`).
Library: [GameLib.md](GameLib.md). Tests: `tests/games/`.

A personal, non-commercial tribute to Namco's 1980 arcade game (the notice is in `!Help`, the guide's Credits and the
`!RunImage` header: "Pac-Man is a trademark of Bandai Namco; this program is not connected with them."). Like Lander II
it lives on the disc as JavaScript that `*JSRun` loads, so users can read and change it; it uses only the public
`riscos` module and `'gamelib/<Name>'`. No shared code was changed for it beyond the `gamelib` specifier (CORE_API 11a).
No ROM data: the sprites are drawn from GameLib `Shapes`, sounds are synthesised, tunes are our own.

This is the first stage: the maze, dots and energizers, Pac-Man, the four ghosts with scatter and chase, the title, the
pause menu and the desktop shell. Fright (blue and flashing ghosts), eating ghosts, lives, the death sequence, the extra life, game over and Cruise Elroy are in; sound is in; later stages add settings, scores and the demo.

## Layers

1. **Engine** (pure: imports only `./X` and `gamelib/Maths`; integers only; all randomness from an injected `Rng`).
   Moves at a fixed 60 Hz: `acc += pct * STEP; n = floor(acc / UNIT); acc %= UNIT` with `UNIT = 1e6`,
   `STEP = 12626`.
2. **Drawing** (GameLib `Surface`, `Shapes`, `Font` only): paints a `Game` into a 224 x 288 `Surface`.
3. **Screens** (no desktop): the title, the pause menu and play, from the key presses of each display frame.
4. **Shell** (`!RunImage`, the only file with `import ... from 'riscos'`): icon bar icon and menu, `Display`, keys and
   gamepad, the `Loop`, the saved settings, View source.

## Modules

| module | contents |
|---|---|
| Dirs | `UP LEFT DOWN RIGHT` (0-3), `DX`, `DY`, `reverse(d)`, `NAMES` |
| MazeData | `ROWS` (31 strings), `SPECIAL` (house, door, exit, tunnelRow, redZones, fruit, eyesTarget, starts, scatter) |
| Theme | `TITLE`, `COLOURS`, `GHOSTS` (id, name, nickname, colour), `FRUIT` |
| Maze | `new Maze(rows, special)`: `walkable`, `isTunnel`, `isRedZone`, `exits`, `dotAt`, `eat` -> 0/10/50, `dotsLeft`, `reset` |
| Mover | `UNIT`, `STEP`, `steps(actor, pct)` -> whole pixels this frame |
| Player | `new Player(start)`, `tick(maze, want, pct)` -> `{moved, ate}`; `anim`, `stopped`, `pause`. Per pixel: `turn` (reverse at once; a side turn when he is on the centre line of his way and within 3 px either side of the tile centre, `past()` -3..3, and `open`), then the stop check (`past() >= 0` and the next tile closed: he stops only on the centre line; if a reversal left him off it he first finishes the cut sideways), then the step: 1 px along `dir` plus 1 px of `slack()` towards the centre line across it (the diagonal cut). Ghosts never corner: they turn exactly at centres |
| Targets | `chooseExit(maze, tile, dir, target, redZones)` (`redZones` is a boolean "apply red zones"; tiles from `Maze.isRedZone`). Play passes true for a ghost that is neither eyes nor blue (scatter or chase), never otherwise |
| Ghost | a ghost: `state` `house` (bobbing y 112-120) / `leaving` / `active` / `eyes` (after `eat()`: target (13, 11), red zones ignored, `EYES_PCT` 200 until the level table, down the door at (112, 92) to (112, 116), sideways to home x, then `leaving` and not blue); `leave()`; `tick(ctx)`; decides one tile ahead (`turn`, `ahead`); `reverse` flag (boolean, so two signals make one reversal); house moves at 50% |
| Modes | `new Modes(level)`: `mode` (`scatter`/`chase`), `phase`, `timer`, `tick(frightOn)` -> switched?, `reset(level)` |
| Fright | `new Fright({frightFrames, flashes})` (frightFrames null: nobody turns blue): `start()` -> blue?, `tick()` -> true on the ending frame, `on`, `elapsed`, `flashWhite(frame)`, `nextScore()` 200/400/800/1600, `reset()`. Play starts it on an energizer (`frightStart` event; active ghosts get `reverse`, every non-eyes ghost `blue`), freezes Modes while `on`, sets `ghost.flash`, ends it with `frightEnd`. A blue ghost chooses with `frightExit` and the game's Rng. Built from `levelSpec(level)` (a new Fright on each level); with null frames an energizer still reverses the ghosts but nobody turns blue |
| Levels | `LEVELS` (21 rows) and `levelSpec(n)` (21 and up share the last): `pac`, `pacFright`, `ghost`, `tunnel`, `ghostFright` (percent; null with no fright), `elroy1Dots`/`elroy1`/`elroy2Dots`/`elroy2`, `frightFrames`/`flashes` (null: nobody turns blue), `fruit` (cherries, strawberry, peach, apple, grapes, rocket, bell, key), `fruitPoints`, `schedule`, `inky`, `clyde`, `idleFrames`; also `schedule(n)`, `houseLimits(n)`, `idleLimit(n)`, and `mazeWhite(t)` (white at 120-134, 150-164, 180-194, 210-224 of the level-complete sequence). All of it is used by the engine |
| Fruit | `new Fruit(level, rng)`: `onDots(eaten)` shows it at 70 and 170 (`timer` = 540 + `rng.int(60)`), `tick()`, `eat()` -> points (0 if not shown), `clear()`, `shown`, `kind`, `points`. Play eats it on its tile (events `fruitEaten`; a 120 frame popup), clears it on a death |
| Level complete | the last dot gives the `levelDone` event and state `'levelDone'` for 240 frames (`stateTimer` 0-239; Render hides the ghosts from 60 and whitens the maze by `mazeWhite`), then `nextLevel()`: dots back, new Fright/House/Fruit, `sweeps`, `eatenId` and popups reset, state `'ready'`. `debug.clearLevel()` eats every dot |
| House | `new House(level)`: `waiting` (ids in order), `out` (released, still leaving), `counts`, `global`, `globalCount`, `idle`; `onDot()` per dot or energizer, `tick()` once per play frame, `onRelease(id)`, `onLeft(id)`, `restart()`, `onDeath()`. **Contract:** `tick()` returns the first unreleased ghost that is due on EVERY frame until it is dealt with (only the idle release fires once, then the timer restarts). The caller acts once: start the ghost's way out and call `onRelease(id)`; a released ghost no longer counts dots nor blocks the next one's personal count, but stays in `waiting` until `onLeft(id)`, called exactly once when it reaches the exit (112, 92). After a death: `restart()` (all back inside, counts kept), then `onDeath()` (global counter 7/17/32). The idle timer counts from the first `tick()` (240 frames, 180 from level 5) and a dot resets it |
| Play | `playFrame(game, input)`: one frame of the `'play'` state in the arcade's order; each ghost's target is its `SPECIAL.scatter` corner or `chaseTarget`; a `modeChange` event reverses the active ghosts. A blue ghost in Pac-Man's tile is eaten (`eat`: `Fright.nextScore()`, `ghostEaten {id, points}`, a popup `{px, py, text, frames: 60}`, state `'eaten'`); `eatenFrame` runs the 60 frame freeze (only other eyes move); the fourth ghost of the fourth energizer (`game.sweeps`) adds 12000 once (`bonus` event). Eyes are never collided with. `release` asks the House each frame (`Ghost.leave()` once, then `onRelease`); `step` calls `onLeft(id)` when a `'leaving'` ghost becomes `'active'`; `kill(game)` (a `death` event; clears popups, `eatenId` and the fruit; Elroy off; state `'dying'`) is also `debug.kill()`; `dyingFrame(game)` runs one frame of the 210 frame death (sets `game.ghostsShown`, false from frame 60, and `game.deathFrame`, -1 then 0-10 over frames 60-149). `addScore(game, n)` is how every score is added: crossing `game.bonus` once gives `extraLife` and `lives + 1` (bonus 0 never). `ghostPct(game, g)` gives the ghost's percent by precedence: eyes 200 (`EYES_PCT`), then 50 for a ghost in the house or leaving, then `tunnel` in a `T` tile, then `ghostFright` if blue, then Blinky's `elroy1`/`elroy2` if active, else `ghost`; `pacPct(game)` is `pacFright` while `fright.on` (when the level has one), else `pac`, never slowed in the tunnel; both read `levelSpec` (`game.elroy` 0-2 by dots left; `game.elroyOff` after a death until Clyde is `'active'`); in Elroy `targetOf` gives Blinky his chase target in scatter |
| Game | the state machine: `'start'` 252 frames (`start` event on frame 1; at frame 120 `actorsShown` and a spare life goes: `lives` is the spare lives the Hud draws), `'play'`, `'eaten'` 60, `'dying'` 210 (`death` event at its start), then `'ready'` 120 (`ready` event, `lives - 1`; dots kept; `afterDeath()` resets actors, Modes, `house.restart()` and `onDeath()`) or, with `lives` 0, `'gameOver'` 180 (`gameOver` event) and `'over'` (`tick` does nothing); also `'levelDone'`. `startLevel(n)` resets maze, sweeps, `eatenId`, popups, Fright, House, Fruit, actors and Elroy; the constructor and `nextLevel()` use it. `tick(input)` -> events; `snapshot()`; `debug` |
| MazeDraw | `wallPixels(rows)`, `mazeSurface(rows, colours)` (cached) |
| Sprites | `drawPac`, `drawGhost`, `drawDigits` |
| FruitArt | `drawFruit` |
| Hud | `drawHud` |
| Render | `drawGame(surface, game, frame)`, `MAZE_TOP` |
| Menu | a list of items with keys and pointer |
| Title | the title picture and its menu |
| Sfx | `RATE` (24000), `WAVES` (our 32-level 4-bit tables, high at both ends), `RECIPES` {name: {make, loop}}: startJingle (4.2 s), waka0/1, siren0-4, fright, eyes (loops: one voice, a whole number of cycles, so no crossfade), ghostEaten, fruitEaten, extraLife, death |
| SoundMap | pure: `soundsFor(events, mem)` (dot/energizer alternate `waka0`/`waka1` through `mem.waka`; unknown events ignored), `loopFor(game)` (null unless `'play'` and not demo; `eyes`, `fright`, `siren0`-`4` by `maze.dotsLeft` > 180 / 128 / 64 / 32) |
| Sound | `new Sound(settings, os.config)`: defines the recipes in a GameLib `Audio`; `resume()` (every click and key), `update(screens, moved)` each tick, `silence()`, `toggle()`, `close()`. Silent while paused, off the play screen, or `settings.sound === false`; volume is `settings.volume` (0..1, values 0.2-1, default 0.8; `tidyVolume(saved)` turns an old percent such as 80 into 0.8) times `desktopGain` |
| Screens | `Screens(app)`, `ACTIONS` (the key names), `DIRS`, `wantFor`; `frame`, `tick`, `draw`, `blur`, `pointer` |

`task.game` (set by `!RunImage`) exposes `app`, `settings`, `keys`, `surface`, `display`, `audio`, `sound`, `game`, `screen`, `frames`
and `open`, `play`, `title`, `toDesktop` for the browser test.

## Data shapes

An actor (Player, Ghost) is `{px, py, dir, acc, tx, ty}`, all integers. `game.tick({want})` takes `want` 0..3 (up,
left, down, right) or -1 and returns the frame's events (`{type: 'dot' | 'energizer' | 'frightStart' | 'frightEnd' | 'death' | 'start'}`). The
state is `'start'` or `'play'` for now. Settings are `{display: 'full' | 'window', browserFull}` in
`Choices:Pacman.Settings` (GameLib `Choices`, checked by `Options.sanitise`).

## Source rules

`disc-pacman.mjs` refuses what !Edit and !JsEdit cannot show well, in every file including `!RunImage`: Latin-1 only
(no tabs, no CR), lines of at most 72 characters, files of at most 250 lines, `riscos` only in an `import ... from
'riscos';` line of `!RunImage`, and no `import ... from` text in a comment (jsrun's import scan reads comments).
`--check` only checks; `GAMES_SRC` / `GAMES_DISC` point the script at another tree and disc root (used by
`tests/games/disc.test.mjs`).

## Tests

* `node --test tests/games` (no browser): `pm-*.test.mjs` for each engine and drawing module, `pm-rules.test.mjs`
  (what each module may import), `pm-golden.test.mjs` (pinned hashes of three scripted 3000-tick runs; see Rule
  coverage), `disc.test.mjs` (both disc scripts and their `--check`s).
* `URL=http://localhost:8372/ node --test tests/games/index.mjs`: the source checks, the `gamelib` import
  (`jsrun-gamelib.mjs`) and `pacman.mjs` in a real browser through `tests/core/shot.mjs`: start from the Filer, full
  screen and title, Return, an arrow key and a dot eaten, pause, the pause menu to the desktop (icon stays), Window
  from the icon bar menu, View source opens !JsEdit, Quit during play leaves nothing. Screenshots
  `pacman-title.png`, `pacman-play.png` in `SHOTDIR`.

## Rule coverage

Each rule of the mechanics reference (sections 1-12) and the test that checks it (`pm-<module>` is
`tests/games/pm-<module>.test.mjs`). `pm-golden` pins a whole 3000-tick run for seeds 1, 2 and 3 as sha256 hashes of
`game.snapshot()`; **a change to those hashes must say why in its commit message.** (The scripted route is dull: on all three seeds
Pac-Man eats 10 dots and dies twice, and never reaches an energizer, so the three hashes differ only by the Rng state
and guard just movement and the ghosts' decisions. The rules below are checked one by one; a richer golden, a long
autopilot demo run through an energizer and a level clear, arrives in Task 22.)

| section | rule | test |
|---|---|---|
| 1 | tile = pixel >> 3, centre at 8x + 4; start (112, 188) | pm-player "starts at the start and moves left" |
| 1 | directions UP 0, LEFT 1, DOWN 2, RIGHT 3; reverse is `d ^ 2` | pm-dirs "directions are numbered in tie-break order", "reverse flips each direction" |
| 1 | the tunnel row wraps modulo 224 (Pac-Man, ghosts) | pm-player "wraps through the tunnel"; pm-game "the tunnel slows a ghost entering column 5 and wraps it" |
| 2 | 31 x 28 maze, 244 dots, symmetric, connected, no dead ends | pm-maze "31 rows of 28, 244 dots, symmetric", "300 walkable tiles, connected, no dead ends" |
| 2 | energizers, door, house interior, tunnel tiles | pm-maze "special tiles" |
| 2 | no-dot corridors (house band, start, tunnel) | pm-maze "no dots in the band round the house, the start and the tunnel" |
| 2 | exit tile, fruit tile, eyes' target, starts | pm-maze "the places of the appendix: exit, fruit, eyes, starts" |
| 2 | red zones: columns 12-15 of rows 11 and 23 | pm-maze "red zones are the 8 tiles only" |
| 2 | walls, door and house are closed to Pac-Man; open to ghosts only by their paths | pm-maze "walkable by who", "exits lists the open directions" |
| 3 | the five starting positions and facings | pm-game "starting positions: the five actors of the appendix"; "sharing a tile is a death and everyone goes back" (after a death) |
| 4 | accumulator: `acc += pct * 12626`, whole pixels per frame | pm-mover "constants", "600 frames per speed" |
| 4 | eating pauses: 1 frame a dot, 3 an energizer, accumulator not advanced | pm-player "eats on tile entry and pauses", "50 for an energizer, pause 3", "eating pauses: 1 frame a dot, 3 an energizer, acc kept", "a run of 10 dots takes 10 frames longer than none" |
| 4 | eyes 200%, house and leaving 50% | pm-ghost "eyes run at 200%", "house speed is 50%: 60 frames bob about 38 pixels"; pm-game "ghost speed precedence" |
| 4 | precedence eyes > tunnel > frightened > Elroy > normal | pm-game "ghost speed precedence", "speed precedence: blue beats Elroy, tunnel beats Elroy" |
| 4 | Pac-Man: PacFright while a fright runs, else PacSpeed; not slowed in the tunnel | pm-game "Pac-Man speed: normal, frightened, level 5 and 21", "Pac-Man is not slowed in the tunnel" |
| 4 | the tunnel slows a ghost on `T` tiles (level table `tunnel`) | pm-game "the tunnel slows a ghost entering column 5 and wraps it", "the ghosts follow the level table" |
| 4 | the level table (21 rows) and levels 22+ | pm-levels "every row of the appendix table", "there are 17 rows and 21 levels", "level 22 and beyond are level 21", "frightFrames are seconds x 60" |
| 4 | levels with no fright: reverse, nobody turns blue | pm-fright "no fright time: nobody turns blue"; pm-game "level N: energizer reverses ghosts, nobody turns blue" |
| 4 | flashing: 14 + 14 frames, last `flashes x 28`, short frights flash from the start | pm-fright "flashing: the last 5 flashes of 360 frames", "a short fright flashes from the start"; pm-game "flash counts: level 1 five flashes, level 9 from the start" |
| 5 | buffered input (kept after the key is let go) | pm-player "an impossible turn is buffered, he keeps going"; pm-screens "wantFor: the latest held direction, else the old want", "a direction press sets want and it persists" |
| 5 | turns open anywhere: at the centre, and reversing at any moment | pm-player "turns at the centre of a tile with an opening", "reverses at once mid-tile" |
| 5 | cornering: pre-turn up to 3 px, diagonal cut, 3 pixel steps saved | pm-player "cornering: a turn 3 px early cuts the corner diagonally", "cornering: each diagonal step is 1 px up and 1 px across", "cornering: at 80% the early turn is 2 or 3 frames sooner" |
| 5 | cornering: post-turn up to 3 px after the centre | pm-player "cornering: a turn up to 3 px after the centre cuts back" |
| 5 | no turn 4 px away or into a wall; reversal mid-diagonal; never inside a wall | pm-player "cornering: 4 px away is too far, a wall is not turned into", "cornering: reversing works in the middle of a diagonal", "cornering: he never ends up inside a wall" |
| 5 | he stops at the centre of a tile whose next tile is closed | pm-player "stops at the centre of the last tile" |
| 5 | ghosts turn only at tile centres | pm-ghost "a reverse flag turns an active ghost at the next tile entry", "seeded game: ghosts reverse only after a mode change or fright" |
| 5 | collision = same tile, checked after Pac-Man moves and again after the ghosts | pm-game "a collision is seen right after Pac-Man moves", "a collision is seen again after the ghosts move", "sharing a tile is a death and everyone goes back". The swap pass-through in the appendix cannot arise with single pixel steps and a check after each mover, so it has no test of its own |
| 6 | decide one tile ahead; never reverse; no `-`, `H`, `#`; ties up, left, down, right | pm-targets "chooseExit: ties go up, left, down, right", "chooseExit never reverses", "chooseExit never goes into the door"; pm-ghost "a reverse flag turns an active ghost at the next tile entry" |
| 6 | red zones: no UP at a red-zone tile in scatter or chase, not frightened, not eyes | pm-targets "chooseExit: red zones refuse up only when asked", "red zone at (12, 23) arriving left: no up when asked"; pm-game "red zones apply to chasing and scattering ghosts only" |
| 6 | forced reversal on a mode change and a fright start, not at its end; boolean flag | pm-game "a mode change reverses every active ghost, and only them", "active ghosts reverse when the fright starts", "the end of a fright turns nobody round"; pm-ghost "two signals before a tile entry make one reversal"; pm-game "level 2: the 1-frame scatter gives one reversal" |
| 6 | chase targets of Blinky, Pinky (up bug), Inky (up bug), Clyde | pm-targets "Blinky targets Pac-Man whatever way he faces", "Pinky aims 4 ahead; facing up also 4 left", "Inky doubles the line from Blinky to 2 ahead of Pac-Man", "Clyde heads home within 8 tiles, else chases" |
| 6 | scatter corners | pm-targets "the scatter row is pinned"; pm-game "scatter aims at the corner, chase at chaseTarget" |
| 6 | exits facing right after a mode change | not implemented on purpose: the reference chooses to always exit left |
| 7 | scatter / chase schedules, in frames, by level | pm-modes "the schedule by level", "level 1 switches at the scheduled frames, then never", "levels 2 and 5 follow their own lists" |
| 7 | the timer stops during a fright and restarts on a new level or life | pm-modes "a fright stops the timer", "reset restarts at phase 0 for the level"; pm-game "the Modes timer is frozen during a fright, and it ends", "a lost life: ready, ghosts back in the house, Pinky at 7 dots" |
| 8 | fright: every non-eyes ghost blue (house too), chain restarts, second energizer restarts the timer | pm-game "an energizer turns every ghost blue and turns active ones", "a ghost leaving the house is still blue"; pm-fright "scores double, then stay at 1600; a restart starts over" |
| 8 | frightened ghosts choose with `rng.int(4)` | pm-targets "frightExit follows the seeded rule and never reverses"; pm-game "blue ghosts outside choose with the game rng" |
| 8 | eyes: target (13, 11), red zones ignored, down the door, home column, revive not blue and leave | pm-game "eyes steer for (13, 11) and ignore red zones", "a revived ghost leaves the house not blue, the rest still are", "revived eyes leave the house without disturbing the House"; pm-ghost "eyes of ghost N go down the door, then to x HOME", "eating a ghost makes eyes and clears blue and flash" |
| 8 | Cruise Elroy 1 and 2, chases in scatter, suspended after a death | pm-game "Cruise Elroy 1: Blinky 75, 75, then 80 and 85", "in Elroy Blinky chases during scatter", "after a death Elroy is off until Clyde is out" |
| 9 | bobbing 4 px either side of 116; the release path (to x 112, up to y 92, then left) | pm-ghost "ghosts in the house bob 4 pixels either side of 116", "a leaving ghost goes to x 112, up to y 92, then left", "a ghost put back in the house bobs within y 112-120" |
| 9 | personal dot counters by level, first waiting ghost only | pm-house "limits by level", "level 1: personal counters, first waiting ghost only", "level 2 and 3"; pm-game "Pinky leaves at once at level 1, Inky and Clyde wait", "Inky leaves on the 30th dot, Clyde on his own 60th after" |
| 9 | global counter after a death (7, 17, 32) and its switch-off | pm-house "after a death the global counter releases at 7, 17", "global counter at 32 switches off without releasing Clyde" |
| 9 | idle timer 240 / 180 frames, reset by a dot | pm-house "idle timer", "the idle timer counts from the first tick: 240 frames"; pm-game "there is no release timer: nothing at frame 240 but the idle", "a dot resets the idle timer" |
| 10 | dot 10, energizer 50 | pm-player "eats on tile entry and pauses", "50 for an energizer, pause 3"; pm-game "eating scores 10 a dot" |
| 10 | ghosts 200 / 400 / 800 / 1600, 60 frame freeze, eyes keep moving | pm-game "ghost chain: 200, 400, 800, 1600, each a 60 frame freeze", "during the freeze only eyes move, and Pac-Man waits" |
| 10 | 12000 bonus for 16 ghosts, once per level | pm-game "12000 bonus once, after 4 ghosts on each of 4 energizers", "three full sweeps give no bonus", "a new level resets the 12000 sweeps" |
| 10 | fruit at 70 and 170 dots, `540 + rng.int(60)` frames, 120 frame points, the level table | pm-fruit (all), pm-levels "the fruit of each level"; pm-game "the fruit appears at 70 dots, is eaten for its points", "a missed fruit goes away and a death removes it", "the fruit follows the level" |
| 10 | 3 lives (setting), one extra life at the bonus score | pm-game "extra life: once at 10000, not again at 20000", "extra life: bonus 0 never, 15000 at 15000 only", "a big jump past the bonus is one life", "the options are kept" |
| 11 | game start 252 frames, actors and a life at frame 120 | pm-game "the intro lasts 252 frames, then play", "start: 252 frames, actors and the first life at frame 120" |
| 11 | later lives: 120 frames of READY! | pm-game "a lost life: ready, ghosts back in the house, Pinky at 7 dots" |
| 11 | death: 60 + 90 + 60, 11 frames of animation, then reset or game over | pm-game "death: freeze, vanish, 11 frame animation, pause, ready", "death animation: frame k lasts 90/11 ticks from tick 60" |
| 11 | level complete: 120 + 120, four white flashes of 15 + 15 | pm-game "clearing the level: levelDone for 240 frames, then ready", "levelDone counts stateTimer 0 to 239 and the ghosts stay put"; pm-levels "the maze is white in four bursts of 15 frames" |
| 11 | game over: 180 frames | pm-game "the last life: gameOver for 180 frames, then over for good" |
| 11 | intermissions, kill screen | out of scope for version 1 (the reference says so); levels go on for ever from the level 21 row (pm-game "a level 17 clear goes to level 18, and so on", pm-levels "level 22 and beyond are level 21") |
| 12 | sounds (jingle, waka, siren, fright loop, eyes, eaten, fruit, extra life, death) | implemented in `Sfx` (own 4-bit waveforms and tunes), `SoundMap` and `Sound`; siren steps are dots left > 180, > 128, > 64, > 32, else; pm-sound checks the recipes and the mapping, pacman.mjs the shell (silent before a gesture, siren in play, context closed on Quit) |
| all | the whole engine is deterministic | pm-golden "golden run, seed 1" (and 2, 3), "two runs of seed 1 agree, and the seeds differ"; pm-game "the same seed plays the same game" |
