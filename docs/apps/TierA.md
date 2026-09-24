# Tier-A utilities: original BASIC programs through the BASIC Wimp bridge

The 3.71 hard disc's small BASIC/Obey utilities run **unmodified** from the disc (double-click them in the Filer):
their `!Run` Obey files, tokenised `!RunImage`s, Templates, Messages and StartUp libraries are the originals. What they
touch below the Wimp is emulated in `src/core/basicwimp/hardware.js` (installed for every desktop BASIC program by
`runner.js`), `src/core/basicwimp/adfs.js` and `src/core/cmos.js`.
Test: `tests/bw/bw-tiera.mjs` (screenshots `tests/screens/tierA-*.png`); interpreter fixes: `tests/basic/tiera.test.mjs`.

| app | what works |
|---|---|
| `$.Diversions.Tools.!Calibrate` | Window from its Templates; "Calibrate" twice calls `Joystick_CalibrateBottomLeft` / `TopRight`, then quits. The Joystick module (0.22, `*RMEnsure Joystick 0.19` passes) reads the browser Gamepad API; calibration records the raw positions of both extremes and scales later `Joystick_Read`s to ±127 (`window.riscHardware.joystickCalibration`). |
| `$.Utilities.!SaveCMOS` | Save reads the 240 CMOS bytes with OS_Byte 161 and writes `<SaveCMOS$Dir>.Saved` (type &FF2 Configure); Restore is shaded until then, and writes them back with OS_Byte 162. The file also loads back with `*LoadCMOS <file>` and by double-clicking it (!Configure). "Factory" isn't in the 3.71 template (the file was withdrawn in 0.15). |
| `$.Utilities.!ResetBoot` | The "Are you sure" box (new-style Wimp_ReportError with Cancel / Help / RESTORE). RESTORE: `!Boot.Choices` is renamed to `!Boot.-Choices` (a previous one is wiped) and `!ResetBoot.Choices` copied in, then "Completed" with Exit / RESET (RESET = `*Shutdown` + OS_Reset, which reloads the page; the disc and CMOS persist). Help opens `!Help`. |
| `$.Utilities.!Verify` | Single tasking. Drive 4: reads the disc record and boot block and verifies every sector with `ADFS_SectorDiscOp` (1.1M calls, ~15 s): "0 defects found". |
| `$.Utilities.!HForm` | Single tasking. Identifies drive 4 as an IDE Conner CFS540A (1097 cyl, 16 heads, 63 sectors, LBA) from `ADFS_IDEUserOp` IDENTIFY, reads its shape and (empty) defect list from the boot block, asks all its questions (shape, defects, format/initialise, soak test, bootable, "Are you SURE", allocation unit) and then **is refused at its first write** (see below). |
| `$.Printing.!PrintEdit` | `!Run` stops with "!Printers must be seen by the Filer before !PrintEdit can be used" when `Printers$Path` isn't set (the !Printers descriptor's `boot` sets it, as its `!Boot` does when the Filer sees it). Printer definitions dragged to its icon bar icon load (`Squash_Decompress`; old graphics formats are translated as the original does); menu ▸ Save ▸ drag the file icon (DragASprite) to a Filer viewer saves it (`Squash_Compress`, type &FC6); the Wimp data transfer with the Filer (DataSave → DataSaveAck, DataLoad → DataLoadAck) is done by the bridge. |
| `$.Video.!Warning` | OS_Memory 8 reports 1MB of VRAM (a Risc PC): nothing is shown, as on a machine with VRAM. With `window.riscHardware.vramK = 0` (an A7000) the new-style warning box appears; Info opens `!Warning.Info` (`*Filer_Run`). |
| `$.Video.HiRes.!Warning ` | (the name ends in a hard space, &A0) Without VRAM, its `ERROR 0` is reported in the command window ("… at line 110", Press SPACE). |
| `$.Diversions.Tools.!ShowScrap` | Obey: `Filer_OpenDir <Wimp$ScrapDir>` opens `!Boot.Resources.!Scrap.ScrapDirs.ScrapDir` (set up by !Scrap's `!Boot` when the Filer boots `!Boot.Resources`). |

## CMOS RAM (`src/core/cmos.js`)

A 240-byte image laid out as RISC OS 3.71 (`HdrSrc/hdr/CMOS`), initialised like the kernel's Delete-power-on table
and persisted in `localStorage['riscos371.cmos']` (so `*ResetCMOS` / R-power-on reset it too). OS_Byte 161 reads,
OS_Byte 162 writes (&EF is the checksum, maintained automatically). Locations the desktop honours are views of
`os.config`: keyboard delay/repeat (&0C/&0D), printer ignore character, mouse type/step, Wimp flags, double-click and
drag delays/distances, memory sizes (font cache, screen, RAM disc, RMA, system sprites), the loud beep bit, SoundCMOS
(voice, volume, speaker), DesktopFeatures (3D, desktop font, textured windows) and the ROM applications started with
the desktop. Writing one of them changes and applies the setting. `*LoadCMOS <file>` (as `Boot:Library.LoadCMOS`:
skips the year and the DST bit) and `*SaveCMOS <file>` are real commands.

## ADFS / FileCore (`src/core/basicwimp/adfs.js`)

The VFS has no sectors, so drive 4 is modelled as the utilities see it: a 540MB IDE drive with a valid new-map boot
block at &C00 (empty defect lists, IDE parameters, the disc record of HardDisc4). `ADFS_DiscOp`/`SectorDiscOp`
reads return the boot block (everything else reads as zeros), verifies/seeks/restores succeed; `ADFS_DescribeDisc`,
`Drives`, `ControllerType`, `Retries`, `FreeSpace(64)`, `MiscOp 6` and `IDEUserOp` (IDENTIFY only) are answered.
The floppy drive 0 is empty.

**HForm never touches HardDisc4: writes and track formats of the hard disc are refused** with ADFS's "Protected
disc" error (&108C9) — HardDisc4 holds the running system and the user's files, so no program can overwrite or format
it. HForm stops at its first write ("Writing defect list", "HFORM failed: Protected disc at line 3205",
`HForm$EndStatus` stays 1) and the disc is unchanged. (We chose refusing over simulating a format on RAM/floppy: HForm
only formats drives 4-7, and a simulated "success" on HardDisc4 would be a lie about the user's files.)
`*Mount`/`*Dismount`/`*Free` with HForm's `-ADFS-%` prefixes are accepted.

## Other things these programs needed

* Wimp_LoadTemplate gives every indirected item its full buffer size in the workspace (as Wimp06 does); copying the
  stored bytes made PrintEdit's 255-byte save-path buffer overwrite the OK button's text.
* OS_File 18 on a file open for output (PrintEdit sets &FC6 before writing) sets the type it is closed with; the
  desktop BASIC filing system now implements OS_File 18.
* Wimp_ReportError: new-style extra buttons, sprite name; the error box queue no longer shows a box twice when a
  program reports its next error right after the previous box closed (ResetBoot's "Completed").
* OS_Module 18 finds ROM modules (HForm reads ADFS's version from its help string); OS_Memory 8; OS_Reset; OS_Byte 247;
  `-fs-` / `%` command prefixes; hard spaces (&A0) in file names (`HiRes.!Warning&A0`) are not argument separators
  and aren't trimmed by the VFS.
* BASIC: block IF/CASE/WHILE skipping inside LIBRARY files; WHILE in a FN called from a WHILE condition.

Gaps: `!Warning`'s `!Boot` (which shows the warning when the Filer first sees the Video directory) isn't run, because
the Filer's `Filer_Boot` doesn't start programs from `!Boot` files. There's no real joystick without a gamepad.
