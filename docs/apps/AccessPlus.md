# !Access+ (HardDisc4.$.Utilities.Access+.!Access+)

Code: `src/apps/AccessPlus/` (`app.js` descriptor, `main.js` front end, `sharefs.js` local ShareFS). Tier-B apps agent.
The original is the Acorn Access+ Sharer 1.01 (24-May-1995); its `!RunImage` is squeezed ARM code and there is no
source for it in `vendor/`, so behaviour comes from its real Templates (`assets/templates/AccessPlus.json`:
progInfo, Server, Show, Quit, Ovr), Messages (`assets/messages/AccessPlus.json`: menu, interactive help, errors),
`!Help`, and the ShareFS 3.40 "Access+" module it drives (`Sources/NetWorking/AUN/Access/ShareFS`: `cmhg/msharep`
command table, `c/daemon` *Share / *UnShare / *Shares, `c/sharephow` options, `password_to_pin`).

**Local only**: there is no network. A share is recorded by `sharefs.js`, listed by the front end and `*Shares`,
and saved/restored, but no other machine (and no ShareFS filing system) sees it.

* Double-clicking `!Access+` (or `*Run` of the directory / `!Run` / `!RunImage`) starts it; the disc `!Run`
  (ShareFS/Freeway RMEnsures, `Resources.StartImage` → `!RunImage`) is replaced by the descriptor, which sets
  `Access+$Dir`, `Access$Path`, `ShareFS$Path`, `File$Type_BDA/BD9/FB5/FB4/F9F/F9E/F9D`, loads the `!access+` and
  ShareFS disc sprites. `Access+$Running` guards against a second copy ("An Access+ Sharer is already running").
* Icon bar icon. **Select** opens the share dialogue ("Server"): Directory, Password (display `-`), *Share protected*,
  Cancel / OK (Return = OK, Escape = Cancel; Adjust-OK keeps it open). **Drag a directory** to the icon to open it
  with the directory filled in. The disc name is the directory's leaf; if a directory was dropped and the field is
  changed to a plain name, that name is used. Errors: empty field → `Dir0`, bad key (not 2–6 letters/numbers) →
  `Pin0`, a ShareFS: path → `Inv0`, a name already shared → ShareFS `DupExprt`, a non-directory dropped → `BadNam`.
* Menu **Access+**: Info ▸ (progInfo), Show ▸ *shares* ▸ "About a share" (Name, Directory, Shared = protected /
  read only / CD-ROM / password), Save (writes `!Access+.!Shares` as `Share <path> <name> [-protected …] [-auth <pin>]`
  lines, re-shared when Access+ next starts), Remove ▸ *shares* (stop sharing), Quit. Menu order follows the help
  tokens `M_0`…`M_4`. Quit with shares made by this task opens the "Quit" box: Quit (unshare them), Leave (quit,
  shares stay), Cancel.
* **Structured sharing**: dropping a text file of `U|P <user> <key>` lines shares `Apps` (read only) and `Boot`
  (`-noicon`) next to `!Access+` if present, and `Dirs.<user>` per line (P = protected, key → PIN), keeps the file
  as `!Access+.PINS` (the "Ovr" box — Replace / Add / Cancel — when a PINS file exists) and saves the shares.
* `*Share <path> [<disc>] [-protected] [-readonly] [-cdrom] [-subdir] [-noicon] [-auth <key>]`, `*UnShare <disc|path>`,
  `*Shares [-spin|-readonly]` (from the descriptor, available whether or not Access+ is running; output
  `Export <name> <path> <options>` as the module prints it).

Gaps: no ShareFS filing system / Discs icon / logon box; shares aren't kept across a reload unless saved with Save;
the Show/Remove submenus are rebuilt each time the menu opens. Test: `tests/tierb/act-access.mjs`
(screenshots `tests/screens/tierB-access-*.png`).
