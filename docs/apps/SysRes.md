# !System, !Scrap, !Fonts (ACCESSORIES agent)

`src/apps/SysRes/` — descriptors for the `!Boot.Resources` application directories on the seed disc, so
double-clicking them does what 3.71 does (silently — no window, the task quits at once):

* `!System` — sets `System$Dir` and `System$Path` (= what the missing SysPaths absolute did: 370, 350, 310, 300, 200, root).
* `!Scrap` — sets `Scrap$Dir`, `Wimp$ScrapDir`, `Wimp$Scrap`, creates `ScrapDirs`.
* `!Fonts` — `*FontInstall` equivalent: adds the directory to `Font$Path` (browser fonts are fixed).

Shift-double-click opens them as directories (Filer default). Test: `tests/acc/act-sysapps.mjs`.
