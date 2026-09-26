# !HostFS — mounting folders from this computer

`$.Utilities.!HostFS` (disc: `tools/disc-hostfs.mjs`; code: `src/apps/HostFS/`). Not part of RISC OS 3.71. HostFS
itself — folders on the host as discs `HostFS::<name>.$`, their icons on the left of the icon bar, remembering and
remounting them, the `*HostFS` / `*HostMount` / `*HostDismount` / `*HostMounts` commands, folders dropped on the
page — is part of the desktop (`src/core/hostfs/`, see the README's HostFS section and the guide `$.Docs.HostFS`).
!HostFS is the application that makes and manages the mounts, run when needed, as !Access+ is for ShareFS: the
Style Guide puts filing systems on the left of the icon bar and applications on the right, and the mounts stay
when it quits.

* Icon bar (right): Select mounts a folder (`os.hostfs.pickFolder`, or a read-only snapshot where the browser can't
  pick one); Adjust opens the Mounts window; Menu: Info, Mounts..., Mount folder..., Mount read-only..., Server
  folders ▸ (the `serve.mjs --host` folders, ticked when mounted: click to mount / dismount), Quit.
* Mounts window: a row per mount from `os.hostfs.list()` (sorted by name): its disc sprite (`nodisc` when it needs the
  browser's permission again), name, kind (Folder / Server folder / Snapshot, read-only), state (Mounted / Needs
  permission / Reading... / Not mounted), and a "Mount" option: mounted when the desktop starts
  (`os.hostfs.setStartup`). Click a name to choose it; double-click opens it. Buttons: Mount folder..., Open (mounts
  first if need be), Dismount (it stays listed, start-up off), Mount, Forget (not for server folders, which come
  from the command line). It follows `os.hostfs.onChange`.
* Remembered mounts are the IndexedDB records of `src/core/hostfs/hostfs.js` (`MountStore`): picked folders keep
  their handle; server folders a record only once their start-up choice has been set. Snapshots aren't remembered.

Tests: `tests/core/test-hostfs-app.mjs` (and `test-hostfs.mjs` for HostFS itself).
