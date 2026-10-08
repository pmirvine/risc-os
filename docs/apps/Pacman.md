# !Pacman

Code: `tools/games/!Pacman/` (JSScript modules, no extensions; `!Boot`, `!Run`, `!Help`), put on the disc as
`$.Diversions.!Pacman` by `node tools/disc-pacman.mjs` (run by `tools/build.mjs`, after `disc-lander2.mjs`); the icon
(`!pacman`, `sm!pacman`) is drawn by `tools/games/icon.mjs`. User guide: `$.Docs.Pacman` (`tools/docs/Pacman`).
Library: [GameLib.md](GameLib.md). Tests: `tests/games/`.

A personal, non-commercial tribute to Namco's 1980 arcade game (the notice is in `!Help`, the guide's Credits and the
`!RunImage` header: "Pac-Man is a trademark of Bandai Namco; this program is not connected with them."). Like Lander II
it lives on the disc as JavaScript that `*JSRun` loads, so users can read and change it; it uses only the public
`riscos` module and `'gamelib/<Name>'`. No shared code was changed for it beyond the `gamelib` specifier (CORE_API 11a).
No ROM data: the sprites are drawn from GameLib `Shapes`, sounds will be synthesised, tunes are our own.

This is the first stage: the maze, dots and energizers, Pac-Man, the four ghosts with scatter and chase, the title, the
pause menu and the desktop shell. Fright (blue and flashing ghosts) and eating ghosts are in; later stages add levels, lives, fruit, sound, settings, scores and the demo.

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
| Player | `new Player(start)`, `tick(maze, want, pct)` -> `{moved, ate}`; `anim`, `stopped`, `pause` |
| Targets | `chooseExit(maze, tile, dir, target, redZones)` (`redZones` is a boolean "apply red zones") |
| Ghost | a ghost: `state` `house` (bobbing y 112-120) / `leaving` / `active` / `eyes` (after `eat()`: target (13, 11), red zones ignored, `EYES_PCT` 200 until the level table, down the door at (112, 92) to (112, 116), sideways to home x, then `leaving` and not blue); `leave()`; `tick(ctx)`; decides one tile ahead (`turn`, `ahead`); `reverse` flag (boolean, so two signals make one reversal); house moves at 50% |
| Modes | `new Modes(level)`: `mode` (`scatter`/`chase`), `phase`, `timer`, `tick(frightOn)` -> switched?, `reset(level)` |
| Fright | `new Fright({frightFrames, flashes})` (frightFrames null: nobody turns blue): `start()` -> blue?, `tick()` -> true on the ending frame, `on`, `elapsed`, `flashWhite(frame)`, `nextScore()` 200/400/800/1600, `reset()`. Play starts it on an energizer (`frightStart` event; active ghosts get `reverse`, every non-eyes ghost `blue`), freezes Modes while `on`, sets `ghost.flash`, ends it with `frightEnd`. A blue ghost chooses with `frightExit` and the game's Rng. Fixed {360, 5} until the level table |
| Levels | `schedule(n)`: the scatter/chase phase lengths in frames; `houseLimits(n)` -> personal dot limits by ghost id; `idleLimit(n)` -> frames without a dot before a release |
| House | `new House(level)`: `waiting` (ids in order), `out` (released, still leaving), `counts`, `global`, `globalCount`, `idle`; `onDot()` per dot or energizer, `tick()` once per play frame, `onRelease(id)`, `onLeft(id)`, `restart()`, `onDeath()`. **Contract:** `tick()` returns the first unreleased ghost that is due on EVERY frame until it is dealt with (only the idle release fires once, then the timer restarts). The caller acts once: start the ghost's way out and call `onRelease(id)`; a released ghost no longer counts dots nor blocks the next one's personal count, but stays in `waiting` until `onLeft(id)`, called exactly once when it reaches the exit (112, 92). After a death: `restart()` (all back inside, counts kept), then `onDeath()` (global counter 7/17/32). The idle timer counts from the first `tick()` (240 frames, 180 from level 5) and a dot resets it |
| Play | `playFrame(game, input)`: one frame of the `'play'` state in the arcade's order; each ghost's target is its `SPECIAL.scatter` corner or `chaseTarget`; a `modeChange` event reverses the active ghosts. A blue ghost in Pac-Man's tile is eaten (`eat`: `Fright.nextScore()`, `ghostEaten {id, points}`, a popup `{px, py, text, frames: 60}`, state `'eaten'`); `eatenFrame` runs the 60 frame freeze (only other eyes move); the fourth ghost of the fourth energizer (`game.sweeps`) adds 12000 once (`bonus` event). Eyes are never collided with. `release` asks the House each frame (`Ghost.leave()` once, then `onRelease`); `step` calls `onLeft(id)` when a `'leaving'` ghost becomes `'active'`; `kill(game)` (a `death` event, `resetActors`, `house.restart()`, `house.onDeath()`, state `'ready'`) is also `debug.kill()` |
| Game | the state machine (`'start'` 252 frames, `'play'`, `'eaten'` 60 frames, `'ready'` 120 frames after a death; `house`; `eatenId`, `sweeps`); `tick(input)` -> events; `snapshot()`; `debug` |
| MazeDraw | `wallPixels(rows)`, `mazeSurface(rows, colours)` (cached) |
| Sprites | `drawPac`, `drawGhost`, `drawDigits` |
| FruitArt | `drawFruit` |
| Hud | `drawHud` |
| Render | `drawGame(surface, game, frame)`, `MAZE_TOP` |
| Menu | a list of items with keys and pointer |
| Title | the title picture and its menu |
| Screens | `Screens(app)`, `ACTIONS` (the key names), `DIRS`, `wantFor`; `frame`, `tick`, `draw`, `blur`, `pointer` |

`task.game` (set by `!RunImage`) exposes `app`, `settings`, `keys`, `surface`, `display`, `game`, `screen`, `frames`
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
  (what each module may import), `disc.test.mjs` (both disc scripts and their `--check`s).
* `URL=http://localhost:8372/ node --test tests/games/index.mjs`: the source checks, the `gamelib` import
  (`jsrun-gamelib.mjs`) and `pacman.mjs` in a real browser through `tests/core/shot.mjs`: start from the Filer, full
  screen and title, Return, an arrow key and a dot eaten, pause, the pause menu to the desktop (icon stays), Window
  from the icon bar menu, View source opens !JsEdit, Quit during play leaves nothing. Screenshots
  `pacman-title.png`, `pacman-play.png` in `SHOTDIR`.
