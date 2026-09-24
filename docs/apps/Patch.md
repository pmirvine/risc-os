# !Patch (HardDisc4.Utilities.Patches.!Patch)

Code: `src/apps/Patch/` (tier-B apps agent). The Application Patcher 1.32 (17-Mar-95), ported from
`vendor/ro371/Sources/Utilities/Patches/Patch/c/*` (Main, PatchParse, PatchApply, Subroutins) with its real
Templates (`TargetDir`, `TargetProto`, `ProgInfo`), Messages and `!Sprites22`. Test: `tests/tierb/act-patch.mjs`
(screenshots `tests/screens/tierB-patch-*.png`).

* `app.js` registers the disc application directory, so double-clicking `!Patch` (or a Patch file) starts this
  version. It does what the disc's `!Boot`/`!Run` do: `Patch$Path`, `File$Type_FC3` = Patch, `Alias$@RunType_FC3`.
* `patch.js` is the engine: patch-file parser (all keywords: Application, Description, Patch, File, Transform,
  Location, Change/Verify Word/Byte/String (GSTrans'd), ReplaceFile/CreateFile/DeleteFile + Old/NewContents,
  PatchesDir, TransformsFile), recursive enumeration, `check_patch` (Apply / Remove / neither) and `perform_patch`.
  Lists are built by prepending, as in the C, so the window shows patches in the same order as the original.
* `main.js`: at start-up `Patch:BootStrap` is read (→ `Patch:Patches` → `Advance`, `PocketFS`; `Patch:Transforms`),
  then files named on the command line. Icon bar Select opens the "Patch target directory" window; icon bar menu
  "Patcher": Info ▸ (ProgInfo), Quit. Drop an application, or a directory containing applications (even `$`), on the
  icon or the window: each application a patch file knows (exact name + type) gets a description line, its path and
  one line per patch, built from the `TargetProto` prototype icons, with an **Apply** / **Remove** option button when
  the patch can be applied / removed. Window menu "Patcher": Select all apply, Select all remove, Clear selection,
  Patch selected (greyed as `target_menu_creator` does). Errors use "Message from Patcher" with OK / Cancel
  (Cancel quits, as `report_error` does). Double-clicking a Patch file while running loads it (DataOpen).
* Transforms run as *commands through the CLI, as Wimp_StartTask would: `Copy` (`Copy %0 %1 …`) works on the
  virtual disc via `<Wimp$Scrap>` (the scrap directory is created if needed), so byte/word/string patches, file
  extension, CreateFile/DeleteFile/ReplaceFile all really change files. The `Squeeze` transform needs ARM code:
  `*UnSqueeze` (registered when !Patch starts, like the RMLoad in `!Run`) performs the module's checks and reports
  "Input file must be of type Application", "Input file is not squeezed", "not a valid AIF run image", or, for a
  genuinely squeezed image, that unsqueezing runs its ARM decompressor, which cannot be run here;
  `Patch:Library.squeeze` reports that it cannot squeeze the patched file back. So the !Advance patch is shown
  greyed after the error, which is what 3.71 does for a file it cannot unsqueeze.

Seed disc: the `,fc3` patch files are data, not code, but `tools/disc.mjs` skipped them; `tools/disc-patch.mjs`
(idempotent) adds `!Patch.BootStrap`, `Patches.Advance.Advance` and `Patches.PocketFS.PocketFS`.

Gaps: the target applications (!Advance, !PocketFS) are not on the disc, so the test uses synthetic copies on the RAM
disc. No real unsqueeze/squeeze. The `%2` output-redirection of transforms is not implemented (nor in the original).
