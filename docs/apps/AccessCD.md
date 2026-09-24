# !AccessCD (HardDisc4.$.Utilities.Access+.!AccessCD)

Code: `src/apps/AccessPlus/cdapp.js` (descriptor), `cdmain.js`. Tier-B apps agent. The original (AccessCD 1.02,
23-May-1995, "Peer to Peer CD Cacheing") keeps a RAM cache for CD-ROMs shared over Access; its
`Resources.!RunImage` is ARM code with no source in `vendor/`. Behaviour from its Templates
(`assets/templates/AccessCD.json`: progInfo, Cache), Messages (`assets/messages/AccessCD.json`), `!Help`, `!Run`,
`!Boot` and `!RunCDFS`.

* Double-click `!AccessCD` (or run `Resources.!RunImage`, registered as a native stand-in). `!Boot` / `!RunCDFS`
  (CDCache module, TestCDP, SetCache) are replaced by the descriptor's boot: `AccessCD$Dir`, `AccessCD$Path`,
  `AccessCDS$Dir/Path`; `SetCache` and `rm.CDCacheP` are registered no-ops. `AccessCD$Running` guards against a
  second copy (the `!Run` errors).
* Icon bar icon; Select opens **Set cache**: Cache size (K, digits only) with ↓ ↑ adjusters (16K steps, Adjust
  reverses), Save (use the size and write it to `!AccessCD.Config`, initially 256), Cancel, OK (use it for this
  session). The size in use is also in `AccessCD$CacheSize`.
* Menu **AccessCD**: Info ▸, Quit.
* CD shares saved in `!AccessCD.sharecd` are re-shared (`-cdrom -readonly`) at start when their path exists; there
  is no CD-ROM drive, so normally there is nothing to share.

Test: `tests/tierb/act-access.mjs` (screenshots `tierB-access-cd-*.png`).
