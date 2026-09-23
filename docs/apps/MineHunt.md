# !MineHunt

Code: `src/apps/MineHunt/` (`app.js` descriptor, `main.js` game). App dir: `ADFS::HardDisc4.$.Diversions.!MineHunt`.
Tests: `tests/div/minehunt-act.mjs` (`MH=play|win|lose|menu`, `RET=1` enters the name), `tests/div/minehunt-act2.mjs`
(Expert level, Custom dialogue; `OK=1`, `INFO=1`). Screens: `tests/screens/div-minehunt*.png`.

The original `!RunImage` is a squeezed C binary (Paul LeBeau, 1.10, 1994), so behaviour comes from its
`!Help`, Messages, Templates and sprites:

* Board drawn on a canvas from the real `Parts` sprites: header `tplft` (mine counter LEDs) + `tpmid` fill +
  `tprgt` (man + timer, right-aligned), `sides`, `btlft/btmid/btrgt`, squares `cover/blank/s1-s8/flag/qmark`,
  end-of-game `mine/badmine/goodflag`, man `alive/dead/success`. Window `Main` template (no scroll bars) is
  sized to the board. Man position (right, next to the timer) follows from the `tprgt` sprite's holes - a guess.
* SELECT uncovers (cascade on blanks; timer starts at first uncover), ADJUST cycles clear → flag → ? (if
  "Question marks" ticked) → clear; flagged squares are protected. SHIFT-SELECT clears around a numbered
  square (with the default mouse mapping Shift+left arrives as Adjust; on an uncovered square it clears around).
* Win = every mine flagged and every other square uncovered. Score = seconds.
* Levels Beginner 8×8/10, Better 16×8/20, Intermediate 16×16/40, Good 24×16/60, Expert 30×16/99; levels not
  fitting the screen are shaded; Custom dialogue (template `Custom`: width ≥8, height ≥2, ≤64 and screen-limited;
  Auto mines = w·h·10/64). A ModeChange that makes the board too big drops the level with the `modechg` message.
* Click the man: new game. Click LED digits: cycle colour green → light grey → blue → orange.
* Top-5 per level: `EnterName` dialogue, `HighScore` window (scrolled to the current level); Reset.
  Stored as JSON in `<MineHunt$Dir>.HiScores`; icon-bar "Save choices" writes `<MineHunt$Dir>.Choices`.
* Sound: the speech modules (Applause, YouDidIt, RealMine …) aren't on the disc; small WebAudio effects
  stand in (Quiet/Loud volume).
