# !CloseUp (ADFS::HardDisc4.$.Apps.!CloseUp)

Code: `src/apps/CloseUp/` (owner: accessories agent). Re-implementation of CloseUp 3.09 (BASIC original in
`vendor/ro371/Sources/Apps/CloseUp/bas/!RunImage`) using its Templates (`closeup`, `magnifier`, `proginfo`),
Messages and `!Sprites`.

* Click the icon bar icon (Select/Adjust) to open the 400×400 OS unit CloseUp window; Menu gives
  Info ▸, Zoom ▸ (Magnifier: Mul:Div with adjuster arrows, Adjust reverses, Return/↑/↓ in the fields; Mul/Div ≥ 1,
  clamped 1..999), Key-cursor, Follow caret, Quit. Starts at 2:1. `CloseUp$AutoOpen TRUE` opens it at start.
* In the window: Select toggles the red position marker, Adjust takes the input focus; with Key-cursor ticked the
  cursor keys (Shift = ×10) then move the magnified point (the browser pointer itself can't be moved).
* Follow caret magnifies around the caret (unless a mouse button is down).
* Rendering: the "screen grab" is a clone of the desktop's window / menu / drag layers intersecting the magnified
  area (canvas pixels copied), rebuilt ~every 250 ms or when the point moves, shown through a CSS scale. The CloseUp
  window's own work area appears cream (Wimp colour 12) and off-screen areas black, as in the original.
  Text is magnified as vector text (smooth), not as blocky pixels.
