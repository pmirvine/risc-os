# !ARWork ($.Replay.!ARWork)

Code: `src/apps/AREncode/arwork.js` (a `hidden` descriptor). Tested by `tests/tierb/act-arencode.mjs`.

The Acorn Replay work / scrap directory (Uniqueway, 1994), used by AREncode (and ReplayDIY, Empire). It has no
program: its `!boot` and `!Run` are Obey files that do `IconSprites <Obey$Dir>.!Sprites` and
`Set ARWork$Dir <Obey$Dir>.Work`. So the descriptor registers no application directory and the core runs the
original Obey files: the Filer boots it when `$.Replay` is displayed, double-clicking just (re)sets `ARWork$Dir`
and starts no task. `Work` doesn't exist until AREncode creates `Work.AREncode.<movie>` when compressing.
