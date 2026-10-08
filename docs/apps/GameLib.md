# GameLib (the `'gamelib/<Name>'` library)

Code: `tools/games/!GameLib/` (JSScript modules, no extensions; `!Boot`, `!Run`, `!Help`), put on the disc as
`$.!Boot.Resources.!GameLib` by `node tools/disc-gamelib.mjs` (run by `tools/build.mjs`, after `disc.mjs` and next to
`disc-wimplib.mjs`); the icon (`!gamelib`, `sm!gamelib`) is drawn by `tools/games/icon.mjs`. User guide:
`$.Docs.GameLib` (`tools/docs/GameLib`). Tests: `tests/games/`.

GameLib is the game-building half of the desktop's library pair; WimpLib (see [Word.md](Word.md)) is the other. It was
made for !Pacman, whose modules and engine are in `docs/apps/Pacman.md`. Programs import a module as
`import { Loop } from 'gamelib/Loop'`; `src/core/jsrun.js` (`resolveLib`, CORE_API 11a) finds it through the system
variable `GameLib$Path`, then `GameLib$Dir`. `!Boot` sets `GameLib$Dir`, `GameLib$Path` and `GameLib$Version 1.00` unless
already set; `src/main.js` runs the `!Boot` of every application in `!Boot.Resources` at start-up. `!Run` runs `!Boot` and
shows `!Help`.

## Modules

| module | contents | depends on |
|---|---|---|
| Maths | `Rng`, `clamp`, `lerp`, `wrap`, `wrapDelta` | - |
| Loop | `advance`, `Loop` (fixed-rate on `requestAnimationFrame`) | Maths |
| Surface | `rgb`, `rgb4`, `unrgb`, `Surface` (software pixels) | - |
| Raster | `fillTriangle`, `fillBox` | - |
| Shapes | `disc`, `pie`, `arc`, `line`, `polygon`, `roundRect` | Raster |
| Font | `CHAR_W`, `CHAR_H`, `textWidth`, `drawText`, `drawLines` | - |
| Keys | `Keys` (named actions from key codes) | - |
| Pad | `pollPad` (first gamepad, as presses) | - |
| SynthEnv | `val`, `perc`, `line`, `sweep`, `glide`, `steps`, `wobble`, `times`, `note` | - |
| Synth | `Svf`, `Synth` | SynthEnv |
| SynthFx | `filter`, `echo`, `fadeOut`, `levels`, `normalise`, `vidc8`, `loopify`, `renderDef` | Synth |
| Audio | `desktopGain`, `Audio` (Web Audio voices, loops, volume) | Maths |
| Options | `sanitise`, `stepOption`, `optionName` | - |
| ScoreTable | `cleanTable`, `qualifies`, `insertScore`, `today` | - |
| Choices | `choicesStore` (saved files in `<Choices$Write>.<App>`) | - |
| Display | `fitScale`, `Display` (full screen or a window, scaled canvas) | - |

(The JSDoc in each module is the reference; the table is checked against the files by `tests/games/gl-rules.test.mjs`.)

## Rules

* Source files: Latin-1 (in practice ASCII), no tabs, no CR, lines of at most 72 characters, files of at most 250
  lines, a reader's header comment first. `!Boot` / `!Run` are Obey (&FEB), `!Help` Text (&FFF), modules JSScript (&F81).
* No `riscos` import and no `riscos` text anywhere in the library; modules that need system services take them as
  arguments (`choicesStore({choices, vfs, sysvars}, app)`, `new Display({task, wimp, os, ...})`), so every module loads
  and is tested under Node. `document` is touched only lazily (`Display.open`, `Surface.present`), Web Audio only inside
  `Audio` methods.
* No `import ... from` text inside a comment: jsrun's import scan reads comments.
* Engine-style state is integer; randomness comes from an injected seeded `Rng`.

`tools/disc-gamelib.mjs --check` enforces the source rules (also `GAMES_SRC` for a copy to check, `GAMES_DISC` for a
disc root to write, as `MOREAPPS_SRC` / `MOREAPPS_DISC` do for `disc-wimplib.mjs`). It rewrites only
`!Boot.Resources.!GameLib` and its manifest entry.

## Tests

* `node --test tests/games`: a unit test per module (`gl-<name>.test.mjs`, importing the sources through
  `tools/games/package.json`), `gl-rules.test.mjs` (the source rules) and `disc.test.mjs` (`disc-gamelib.mjs` on a
  temporary disc root and its `--check`).
* `node --test tests/games/index.mjs` (server on port 8372, `URL=http://localhost:8372/`): the source check and
  `jsrun-gamelib.mjs`: in a real browser, the variables set at start-up, `'gamelib/Maths'` in any case, a directory first in
  `GameLib$Path` winning, and the exact messages when a module, a name or the library is missing.
