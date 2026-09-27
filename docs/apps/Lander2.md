# !Lander2 (Lander II)

Code: `tools/lander2/!Lander2/` (JSScript modules, no extensions), put on the disc by `node tools/disc-lander2.mjs`
(run by `tools/build.mjs`); icon drawn by `tools/lander2/icon.mjs`. App dir:
`ADFS::HardDisc4.$.Diversions.!Lander2`. User guide: `$.Docs.Lander2` (`tools/docs/Lander2`); the app's own
`!Help` is in the source directory.

An enhanced, Zarch-like game grown from David Braben's 1987 Lander, which is not part of RISC OS 3.71. Unlike
`!Lander` (`src/apps/Lander`, a faithful port, see [Lander.md](Lander.md)), which is left alone, the whole game
lives **on the disc** as JavaScript that `*JSRun` loads (`src/core/jsrun.js`, CORE_API §11a), so users can read
and change it in !JsEdit. It only uses the public `riscos` module, like any user program. No shared code was
changed to add it.

* **Invasion**: waves of aliens (seeder, drone, mutant, bomber, pest, fighter, attractor) spread a red virus over
  a 64×64-tile wrapping world; homing missiles, smart bombs, pickups, clean-land bonus, extra life every 5000.
* **Lander+**: the original rules on the original 256-tile landscape (500 to start, −1 a shot, +20 an object,
  rocks from 800, gravity up at 1024/1488, refuel on the pad), with the new presentation, sound and high scores.
* Looks (independent of the mode): **Classic** (320×256, 12×10 tiles, the VIDC 256-colour palette, Lander's text
  score bar) and **Enhanced** (any resolution, view distance up to 64 rows, fog, stars, infection tint, Zarch-style
  console with scanner).
* Sound sets: **Original** (Archimedes/Zarch feel, 8-bit VIDC-log samples at 20.8 kHz), **Arcade** (the Williams
  Defender/Robotron sound board recreated by the `Williams` engine; one sound at a time by priority unless the
  **Arcade voices** setting is Many), **Off**. All synthesised; no sample files.

## Source rules

The files are read by users in !Edit / !JsEdit, and `disc-lander2.mjs` refuses anything else:

* Latin-1 only (in practice ASCII), no tabs, no CR, 2-space indent, lines ≤ 90 characters (the node test checks
  the engine modules).
* Names: no extension, ≤ 10 characters, letters and digits. Imports are `import { x } from './Name'`. `!Run` and
  `!Boot` become Obey (&FEB), `!Help` Text, everything else JSScript (&F81); `Name,xxx` sets another type.
* jsrun finds imports with a regex over the raw text, **comments included**: never write `import … from './X'`
  in a comment unless X exists.
* Engine modules (Maths, Terrain, Models, World, Player, Enemies, Waves, Virus, Particles, Autopilot, SfxKit,
  SfxOrig, SfxArcade, Williams, Channel, Sound) import neither `riscos` nor the DOM, so they run under node (`tools/package.json` is
  `type: module`). Only `!RunImage`, Settings and Scores import `riscos`.
* Each module starts with a header for readers (what it does, how it fits), with credits to Braben / Mark Moxon's
  [lander.bbcelite.com](https://lander.bbcelite.com) where formulas come from.

## Modules

| file | responsibility, key API |
|---|---|
| `!Run`, `!Boot` | Obey: `Lander2$Dir`, `IconSprites`, `WimpSlot`, `Run <Lander2$Dir>.!RunImage %*0` |
| `!RunImage` | the shell: `export default async function start(task, ctx)`. Icon bar icon and menu (Info, Full screen, Window, Browser full screen, View source, Open directory, Quit), the display (full screen via `os.cli.acquireScreen`, or a Wimp window with the canvas in its view), pointer lock, key/mouse routing, layout (surface size from look/resolution), the main loop, the `app` object the screens use, the test hook `task.game` |
| `Maths` | `TAU`, `wrap`, `wrapDelta`, `clamp`, `lerp`, `Rng` (xorshift32: `next/float/range/int/signed/chance`), `orientation(pitch, dir)` → `{nose, roof, side}`, `dot`, `len3` |
| `Terrain` | `new Terrain(kind 'lander'\|'invasion', landscape n)`: `period`, `seaLevel`, `name`, `altitude(x,z)`, `raw(x,z)` (2^24 per tile, for the colour bits), `isPad`, `isSea`, `wrap`, `delta(a,b)`, `index(x,z)`; `TILE`, `SEA_LEVEL`, `PAD_ALTITUDE`, `PAD_SIZE` (8), `UNDERCARRIAGE`. Lander: the original's six sines, period 256; Invasion: period 64, hillier and wetter for later landscapes |
| `Surface` | `rgb`, `rgb4`, `unrgb`; `new Surface(w,h)`: `pixels` (Uint32Array, ImageData layout), `clear`, `pixel`, `fillRect`, `shade(x,y,w,h,c,alpha)`, `present(ctx,dx,dy,dw,dh)`, `resize` |
| `World` | the simulation: `new World({mode, difficulty, seed, demo, particles})`, `world.tick(input)`. State read by the front end: `player`, `camera`, `score`, `highScore`, `lives`, `missiles`, `smartBombs`, `wave`, `infection` (Uint8Array per tile), `infectedPercent`, `objects`, `mutated`, `particles`, `enemies`, `projectiles`, `pickups`, `state` (`playing`/`dying`/`waveStart`/`waveEnd`/`gameOver`), `stateTimer`, `message`, `tally`, `events` (last tick). Extras listed in its header (`hitFlash`, `aliensLeft`, `debugKillAll()`, `setParticleMax(n)`…). Deterministic for a seed and inputs |
| `Player` | the flight model (Braben's `MoveAndDrawPlayer`): `makePlayer`, `placeOnPad`, `moveShip`, `stickTarget(x,y)` (polar mouse → pitch/dir), `stickFor(pitch,dir)` (inverse, for autopilots), `SHIP_VERTICES` (crash test), constants `DRAG`, `THRUST`, `HOVER`, `START_FUEL`, `MAX_FUEL`, `REFUEL`, `LANDING_SPEED`, `CAMERA_Z` |
| `Enemies` | `ENEMY` (per type: hp, radius, score, speed, cruise height, colour), a steering routine per type, `spawnEnemy`, `updateEnemies`, `updateProjectiles`, `updatePickups`, `damageEnemy`, `killEnemy`, `isHostile` |
| `Waves` | `DIFFICULTY` (easy/normal/hard/zarch: lives, missiles, smart bombs, hover, alien count/fire/aim/speed, virus strength, shield cost, residual infection, infection game over, pickup chance, gravity by wave), `waveInfo(n, difficulty)` (counts, spawn order, gravity, landscape number, enemy missiles from wave 6, max alive) |
| `Virus` | the infection map: spores, tree mutation, creep, `percent`, `clean`, `cleanse(residual)`; `isTree` |
| `Particles` | structure-of-arrays pools (`PF` flags): cosmetic particles (dropped when the pool, sized by the Particles setting, is full; own RNG) and `keep` (bullets, enemy bullets, spores: separate pool, `KEEP_LIMIT`), so the detail setting never changes the game. `count`, `forEach(fn)` for the renderer; hooks call back into World on ground/object hits |
| `Models` | `MODELS.name = {vertices, faces:[{normal, v, colour 0xRGB}], rotates, shadow, sort, radius}` in tiles, y down. First half: the original blueprints number for number (÷2^24, normals ÷2^31); second half: aliens, missiles, bombs, pickups (the unused spinning pyramid), sea monster. `faceLevel`, `litColour` (the original's lighting rule), `worldVertices`; `OBJECT_MODELS`, `ENEMY_MODELS`, `PROJECTILE_MODELS`, `PICKUP_MODELS` |
| `Render` | `new Renderer(surface, {look, view, shadows, stars, fog})`, `setOptions`, `render(world, top, height)`, `project(x,y,z)` → `{x,y,z}` or null, `drawModelAt(name, o, sx, sy, size, opts)` (title/help pages), `backD`/`frontD`/`halfW` (the scanner draws the view wedge); `CLASSIC` (4096 &RGB → VIDC palette pixel) |
| `Raster` | `fillTriangle`, `fillBox`: flat triangles a row at a time, pixel centres, top-left rule (no seams or double fills between tiles) |
| `Sound` | `new Sound({set, volume, desktopGain, voices})`, `resume()` (from a gesture), `setSet`, `setVoices('one'\|'many')`, `oneVoice` (true for Arcade + One), `setVolume`, `setDesktopGain`, `frame(world, events)`, `play(name, opts)`, `silence()`, `close()`; `SETS`, `SOUND_NAMES`, `LOOP_NAMES` |
| `SfxKit` | a synthesiser on Float32Arrays: envelopes (`perc`, `line`, `sweep`, `glide`, `steps`), `Synth` (tone, noise incl. sample-and-hold, pluck, bell), `Svf` filter, `echo`, `fadeOut`, `normalise`, `vidc8` (8-bit log quantising), `loopify`, `levels`, `renderDef` |
| `SfxOrig`, `SfxArcade` | the two sets: `SET = {rate, target, pan(), sounds:{name: {make(k), level, pos, gap, max, vary, priority, oneVoice}}, loops:{thrust, refuel, bomber, pest}}` (`priority`/`oneVoice` only matter to the Arcade set's one-voice channel) |
| `Williams` | the Williams sound board engine for the Arcade set: Sam Dicker's sound routines re-implemented, cycle-timed, rendering the DAC output as samples |
| `Channel` | the one-voice decision, no Web Audio: `new Channel()`, `decide(def, now)` → `'play'`/`'refuse'`/`'bypass'`, `start(name, def, now, seconds, voice)` → the entry it cuts or null, `playing(now)`, `busy(now)`, `stopped(voice)`, `clear()`; `priorityOf(def)` (missing → 0), `bypasses(def)` (`oneVoice === false`), `DUCK` (0.126, −18 dB) |
| `Input` | `KEYS`, `KEY_HELP`, `new Input(settings)`: `keyDown/keyUp`, `mouseMove(dx,dy)`, `mouseButtons`, `recentre`, `takePresses()` (menu keys, gamepad as keys), `sample()` → the per-tick input; `idleInput()` |
| `Autopilot` | `new Autopilot().input(world)`: flies the demo through the same input structure (target choice, desired velocity, tilt via `stickFor`, pulsed thrust, fire when aligned, refuel on the pad) |
| `Font` | RISC OS system font 8×8 (from `assets/fonts/system8x8.json`'s glyphs), `drawText(surface, text, x, y, {scale, colour (or per-row function), shadow, outline, smooth (Scale2x), align})`, `textWidth`, `drawLines` |
| `Hud` | `new Hud()`, `viewArea(surface, look)` (Classic reserves 16 rows), `draw(s, world, {look, view, renderer, stick, banner})`: Classic text bar + fuel line, or the Enhanced console (scanner, score/HI, icons, wave, virus %, fuel and altitude gauges, virtual-mouse gauge, banner); `BLIPS`, `mix` |
| `Menu` | `Menu` (keyboard/pointer list with values changed by Left/Right or Select/Adjust), `COLOURS`, `layout(s)` (a 320×256 unit grid, `u = floor(height/256)`), `say`, `panel` |
| `Screens` | `Backdrop` (a cut-down Invasion world under a gliding camera, behind the menus), `TitleScreen` (idle 25 s → attract), `ScoresScreen`, `HelpScreen` (4 pages), `SettingsScreen`, `drawLogo`, `tipTowardsViewer` |
| `Play` | `PlayScreen` (a game or the demo: ticks the World with Input or Autopilot, pause menu, tally, game over), `NameEntryScreen` |
| `Settings` | `OPTIONS` (key, label, values, names, `enhanced` / `arcade` (shaded unless that look / sound set), help: drives the settings screen), `DEFAULTS`, `SPEEDS` (original 0.67, normal 1, fast 1.33), `loadSettings`, `saveSettings`, `sanitise`, `stepSetting`, `settingName`, `choicesDir` |
| `Scores` | `MODES`, `MODE_NAMES`, top 10 per mode `{name, score, wave, date}` seeded with Archimedes names, `loadScores`, `saveScores`, `qualifies`, `insertScore`, `today` |

A screen is an object with `frame(presses)`, `pointer(ev)`, `tick()` (game time, if `ticks`), `draw(surface)`,
optional `enter/leave/blur`, and flags `playing` (mouse flies the ship: pointer hidden and locked), `sounds`,
`world`, `hotkeys` (false while typing a name). `!RunImage`'s `app` switches them (`title`, `play(mode)`,
`showScores`, `help`, `openSettings`, `attract(stage)`, `changeSetting(key)`, `viewSource`, `runOriginal`,
`toDesktop`).

## Coordinates and time

* 1 tile = 1.0. **y points down** (as the original): sea level 5.3125, pad altitude 3.3125, the ship rests at
  `PAD_ALTITUDE − UNDERCARRIAGE`. Engines cut out above y = −52.
* The world is a torus: x, z are stored wrapped in `[0, period)` (64 Invasion, 256 Lander+); differences always
  go through `terrain.delta(a, b)` / `wrapDelta`. The pad is tiles [0,8)×[0,8).
* The camera is the original's: `camera = {x: p.x, y: min(p.y, 0), z: p.z + 5}`; the eye is 20 tiles behind it and
  never turns (looks along +z).
* **Simulation tick = 1/50 s.** The original has no fixed rate; one of its frames counts as 1/25 s, so per tick
  speeds ×½, accelerations ×¼, drag `sqrt(1 − 1/64)`, lifetimes and timers ×2. `!RunImage` accumulates
  `dt × SPEEDS[speed]`, runs up to 6 ticks per displayed frame (no big catch-up), collects each tick's
  `world.events` into `world.frameEvents` for `sound.frame`, then draws once per animation frame.
* Input per tick: `{stickX, stickY, thrust, hover, fire, missile, smartBomb}`; the stick is the virtual mouse
  offset in the original's units (±512, +y up), clamped to a circle of 512. `stickTarget` turns it into pitch
  (distance/512 × π) and direction (angle); Player moves halfway there per original frame (capped at 67.5°).
  Keyboard dip/raise/rotate edits the same offset in polar form (up to 200 units, ~70°); a gamepad stick sets
  it directly.

## Renderer

Braben's engine grown: a fixed-direction eye, landscape as a grid of tile corners painted back to front, two
flat triangles per tile (diagonal back-right to front-left, as the original), no depth buffer.

* **Bins**: objects, enemies, projectiles, pickups, shadows, particles and the player are not drawn immediately;
  each triangle or dot is pushed into a bin by depth (`binFor(D)`, one per row of tiles), stored in flat typed
  arrays (`kind`, `data` ×6, `col`, `next` linked lists, grown by doubling, no per-frame garbage). After row r of
  land is painted, bin r − 2 is flushed, so hills hide what is behind them.
* **Projection**: `x = cx + f·dx/D`, `y = cy + f·dy/D`, focal length `f = 256 × min(width/320, height/239)`, the
  horizon 64/239 of the way down the view. Wider screens see more tiles across.
* **Classic**: 12×10 tiles, 13 corners centred on the camera, integer projection, row brightness 1 (back) … 10
  (front), green/brown speckle from two low bits of the raw height, slope lighting, pad grey, sea blue, every
  &RGB mapped through the default VIDC 256-colour palette (`CLASSIC`), the original's particle dot shapes by
  distance, black shadows.
* **Enhanced**: `VIEW_ROWS` near 10 / medium 19 / far 33 / huge 65 plus 6 front rows; each row is exactly as wide
  as the frustum at its depth (`rowRange`), so there are no ragged edges; brightness spread over more rows;
  24-bit colour with fractional levels; fog towards the horizon colour; a sky gradient, its haze brightest where
  the land's far edge meets the sky (sea level at `backD`, below the eye line), fading to black as the camera
  climbs (`space()`); infection blends tiles towards red; mutated trees recoloured (`mutate`).
* Stars (`addStars`), as in Zarch: 3D points 14-70 tiles up, `STAR_COUNT` in a `STAR_CELL`-square block repeated
  across the world, seen out to `STAR_FAR` tiles whatever the land's view distance, drawn in three sizes (a 2u x 1u dash near,
  a 1u dot further, a half-unit speck far, nudged by each star's own `mag`) and dimmer with distance, through the
  depth bins so ships and hills hide them, fading in with `space()`. Enhanced:
  with the Stars option; Classic: in Invasion only (the 1987 Lander had none).
* `Raster` fills from pixel centres with the top-left rule and always computes an edge's x from its upper end,
  so shared tile edges are neither doubled nor missed.
* Performance: everything is software into one `Uint32Array`, presented with `putImageData` and scaled by CSS
  (`image-rendering: pixelated`). The Resolution setting caps the surface height (512/768/native, 256–2160),
  the width follows the display's shape; Classic is always 320×256, scaled in whole device pixels where it fits.
  `render.html`'s `lander.bench(n)` measures ms per frame.

## Sound

Own `AudioContext` (created on the first gesture via `resume()`), per-set buffers rendered once from the recipes
when a set is first needed, a compressor, then the volume × desktop gain (`speaker` off → 0, else
`(volume + 1)/8` from `os.config`). At most 16 one-shot voices (a new one replaces the one nearest its end);
per-sound `gap` (retrigger throttle), `max` overlapping copies, `vary` pitch jitter; fast repeats (autofire at 25
shots/s) are played a little quieter. Positional sounds: gain `1 / (1 + (d/8)²)` from the listener at the ship,
pan by lateral offset (Original quantises to the Archimedes' seven stereo positions), Doppler pitch bend, all
distances the short way round the wrap. Loops (thrust, refuel, bomber whoosh, pest twitter) follow world state
each frame through a filter (`params(s)` → gain, rate, freq). Aliases: `landingBonus` → `pickup`,
`newLandscape` → `waveStart`. Without Web Audio every method is a no-op, so the engine and tests run under node.

**One voice (Arcade set, `arcadeVoices: 'one'`, the default).** The Williams board (a 6808 driving an 8-bit DAC)
plays one sound at a time: a new command's IRQ resets the stack and abandons the current routine, and the main
CPU's per-sound priority tables decide which requests are sent (`SNDLD` ignores a table whose priority is below
the one running). Sound models this with a `Channel`: a one-shot plays only if `def.priority` (missing → 0) is
≥ the priority of the sound still playing (or nothing is playing / it has ended), and then cuts the old voice
off with a ~6 ms fade (`_cutVoice`, time constant 1.2 ms) so it does not click. Equal priority cuts in (the
autofire's shots cut each other off). `def.oneVoice === false` bypasses the channel and mixes as usual. The
loops are not in the channel, but on the board the background rumble (BG1) and thrust are themselves board
sounds that effects interrupt; to approximate that the loops go through `loopBus`, which ducks to `DUCK`
(−18 dB) when a channel sound starts and comes back at its end (rescheduled by each new sound; `silence()`,
a set change or `setVoices` restore it). `Many` (and the Original set, always) keeps the 16-voice mixing above.
The setting is applied live from `!RunImage`'s `changeSetting`. A sound holds its priority only for
`def.protect` seconds (Defender's table time, e.g. 8 frames for the mutant explosion; `SfxArcade` takes it from
`Williams.SOUNDS`), then plays on at priority 0 so anything, even the laser, can cut it (`Channel.holding`).
The Arcade thrust loop is marked `idle`: while the ship is airborne with the engines off, Sound keeps it going
quietly at a third of the speed, as Defender's constant background rumble (BG1).

## Persistence

`choices` from `riscos`: `Choices:Lander2.Settings` and `Choices:Lander2.Scores` (JSON), i.e.
`<Choices$Write>.Lander2.*`, normally `$.!Boot.Choices.Lander2`. `choicesDir()` makes the directory first.
Settings are `sanitise`d against `OPTIONS` (unknown or bad values → defaults); score tables are cleaned (bad
entries dropped, names trimmed to 10 printable characters) and fall back to the seeded tables; `lastName` is
offered again at name entry. Saving failures only warn.

## Disc tool and icon

`tools/disc-lander2.mjs` copies every file in `tools/lander2/!Lander2` to `assets/disc/HardDisc4/Diversions/!Lander2`
(types from the name rule above), adds `!Sprites` / `!Sprites22` from `tools/lander2/icon.mjs`, and replaces only
the `Diversions.!Lander2` entry of `assets/disc/manifest.json` (idempotent; a mkdir lock guards concurrent runs).
It fails on non-Latin-1 text, tabs or CR. `icon.mjs` draws the ship over perspective chequered land with the pad,
sea, virus patches, shadow and exhaust as flat polygons with 4×4 supersampling: 68×68 / 36×36 32bpp at 180 dpi in
`!Sprites22`, 34×34 / 18×18 in 16 Wimp colours (mode 27) in `!Sprites`.

## Developer pages (not on the disc)

Served by `node serve.mjs`; both load the extensionless modules as blobs with their `./Name` imports rewritten,
as jsrun does.

* `tools/lander2/dev/render.html`: Render/Models without the game. Query `look=classic|enhanced`,
  `view=near|medium|far|huge`, `w`, `h`, `scale`, `top`, `mode=lander|invasion`, `x y z` (player), `enemies=0`,
  `fog=0`, `stars=0`, `shadows=0`, `real=N` (the real World after N autopilot ticks), `gallery=angle` (every
  model), `model=name` (one, via `drawModelAt`). Console: `lander.bench(100)`. Uses `dev/fakeworld.js`, a
  stand-in world (terrain, objects placed like `PlaceObjectsOnMap`, particles, one enemy of each type).
* `tools/lander2/dev/sounds.html`: every one-shot in both sets (Shift/Alt-click pans), the loops driven by a
  pretend world, stress tests (autofire, explosion piles), and a levels table rendered offline through the whole
  chain.

## Tests

* `node tests/div/lander2-node.mjs`: the engine under node, no browser: source rules, invariants every tick (no
  NaN, wrapped positions, fuel in range, aliens never inside hills), the flight model, Lander+ rules (fuel, score,
  landing, crashing, rocks, gravity), Invasion (waves, infection, missiles, smart bombs, extra lives, each
  difficulty flown by the autopilot), determinism for a seed and independence from the particle setting; the
  one-voice `Channel` (priorities, cut-off, bypass, finished sounds) and `Sound` in one/many mode with a stand-in
  AudioContext and made-up recipes.
* `node tests/core/shot.mjs div-lander2 tests/div/lander2.mjs`: in the desktop: starts it from the Filer, checks
  full screen and title frames, Return → Play Invasion, flies and fires with the mouse, P pause/resume, Escape
  pause, Quit to title, Escape to the desktop (icon stays), the windowed display, Quit. Screens
  `tests/screens/lander2-title.png`, `lander2-play.png`.

Test hook: `task.game = {app, settings, scores, input, sound, world, screen, screenObject, frames, display,
surface, open(kind), play(mode), demo(), title(), toDesktop()}` on the task named `Lander2`.

## Running it while developing

1. Edit `tools/lander2/!Lander2/*`, then `node tools/disc-lander2.mjs`.
2. `node serve.mjs` (port 8371), open `http://localhost:8371/?fast=1`, and double-click
   `$.Diversions.!Lander2` (or `os.cli.run('Run ADFS::HardDisc4.$.Diversions.!Lander2')` in the console).
   The browser keeps the hard disc in an IndexedDB overlay: seed files update automatically unless the disc copy
   was written over in RISC OS (`?reset=disc` discards the overlay).
3. Engine modules can be imported directly under node:
   `node -e "import('./tools/lander2/!Lander2/World').then(m => console.log(new m.World({mode:'invasion'}).wave))"`.

Credits: Lander © D. J. Braben 1987. Formulas, blueprints and particle rules from Mark Moxon's commentary at
[lander.bbcelite.com](https://lander.bbcelite.com); his "Hacking the landscape" deep dive (BigLander: 64×64 tiles
in view) inspired the Enhanced view distances. Invasion's cast and rules follow Zarch and the Virus manual.
