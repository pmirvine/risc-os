# !Alarm (ACCESSORIES agent)

`src/apps/Alarm/` — JS re-implementation of Alarm 2.70 (the 3.71 ROM app; original is crunched BASIC
`Sources/Apps/Alarm/Resources/!RunImage`), using the ROM Templates (`assets/templates/Alarm.json`) and Messages.

* **Icon bar clock**: rendered to a private sprite area (`SpriteInfo` from a canvas) — analogue with/without
  seconds, HH:MM, HH:MM:SS or a user-defined Territory format (`timefmt.js`: %24 %12 %MI %SE %AM %W3 %WE %DY %ST
  %MO %M3 %MN %CE %YR, `z` = no leading zero). SELECT = Set alarm, ADJUST = alarm browser, MENU = Info / Alarms... /
  Setup... / Set clock... / Quit.
* **Set / Change alarm** ("alarm" template): adjuster arrows (ADJUST reverses), 3 message lines, Urgent, Task alarm
  (lines = a * command run via `os.cli.run`), Working week, Repeating (every N minutes..years, or the Nth /
  last / penultimate weekday of every M months). Window shrinks when not repeating. MENU = Previous / Next / Find alarm.
* **Going off**: "message" window (URGENT! / Attention!), repeat info, beeps (`wimp.beep`) unless silent; stops after
  N seconds unless continuous (urgent ones keep beeping until acknowledged). MENU = Accept / Cancel / Defer ▸ unit ▸
  How many?. Close = accept (reschedules repeating alarms; working-week fitting; year 2247 limit).
* **Browser** ("browser" + "browse1" header pane): SELECT/ADJUST selection, double-click to change, MENU =
  Set new alarm, Selection ▸ (Change/Delete/Copy/Save as text/Save as alarms), Select all, Clear selection,
  Save as text, Save as alarms (standard save boxes). Delete confirmation ("deleting" template).
* **Setup**: all options of the template; stored as JSON in `Choices:Alarm.Setup`. **Set clock** keeps an offset from
  the host clock (localStorage) since the real clock can't be set. BST dates are shown but not used (JS Date does DST).
* **Persistence**: `Choices:Alarm.Alarms` (type &AE9 "Alarms"), autosaved when "Automatically update" is on
  (default); quitting with unsaved changes shows the "warning" box. Format is ours: `ALRM` + JSON (not the original
  binary). Alarm files dropped on the icon / double-clicked are merged.

Tests: `tests/acc/act-alarm.mjs` (STEP=set|browser|off|setup|menu), `act-alarm-func.mjs`; screenshots `acc-alarm-*.png`.
