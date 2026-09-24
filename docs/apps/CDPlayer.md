# !CDPlayer ($.Utilities.!CDPlayer)

Code: `src/apps/CDPlayer/` (tier-B apps agent). The "Audio Panel" 1.14 (18 Oct 1993), ported from
`vendor/ro371/Sources/Apps/CDPlayer/c/cdplayer`. Test: `tests/tierb/act-cdplayer.mjs` (screenshots `tests/screens/tierB-cdplayer-*.png`).

* **Starting:** double-click `!CDPlayer` (the registered `appDir` makes `*Run` skip the disc `!Run`), or run its
  ARM program `cdplayer` directly (`registerNative('!CDPlayer.cdplayer')`). `AudioPanel$Dir` is set as `!Run` does (descriptor
  `dirVar`); the Filer icon comes from `!sprites`. The `!Run` check `rmensure cdfsdriver 2.00` is treated as passing:
  the computer has a CD-ROM drive, **with no disc in it**.
* **Resources:** the real Templates (`MainWindow`, `Keypad`, `Memory`, `Control` = Setup, `ProgInfo`), the panel's own sprite
  file (`<AudioPanel$Dir>.sprites` → `assets/sprites/CDPlayer/sprites`: buttons with `~` pressed variants, red LED track digits
  `0-9`/`-`/`e`, info digits `kb0-9`, slider, logos). There's no Messages file: menu, help and version strings are the ones in the C source.
* **Icon bar:** sprite `logo2`; Select/Adjust opens the main window; menu "CD Player": Info ▸ (ProgInfo, version field set to
  "1.14 (18 Oct 1993)"), Keypad, Setup, Quit.
* **No-disc behaviour (as the original):** every null event (0.5 s) calls CD_AudioStatus, which fails, so the panel stays
  empty: track display `--`, disc info `00/00:00`, time `00:00`, slider knob at the left. PLAY and PAUSE light only
  while held and go out on release (playing/paused reset because `disc_in` is false); STOP, EJECT, skip and fast buttons
  press and release; EJECT does nothing (ProcessIcon returns FALSE before `Eject()`); clicking the time display cycles the
  (invisible) elapsed-disc / elapsed-track / remaining mode; the logo opens the Keypad (opening the main window first); keypad keys
  press and release without effect; the Memory window never opens (it only opens when tracks are memorised). Closing the main
  window closes the keypad and memory windows.
* **Setup:** the −/+ buttons change the SCSI device (0-6), logical unit (0-7) and card (0-3), shown with the LED sprites, and
  after each click the 20-byte control block (device, card, unit, type, reserved; little-endian words) is written to
  `<AudioPanel$Dir>.config` (type &FFD), which is also read at start-up (the shipped one: device 0, type 4).
* **Interactive help:** all of `GiveHelp()`'s texts (main, keypad, memory, setup windows and the icon bar icon).

Gaps: there's no emulated audio disc, so the play/program/random/repeat logic that needs tracks isn't reachable (the
keypad and memory code paths are only kept where the no-disc path uses them). `task.cdplayer` exposes the windows and state for tests.
