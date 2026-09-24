# !Internet ($.!Boot.Resources.!Internet)

Code: `src/apps/InetSetup/internet.js` (descriptor) and `src/apps/InetSetup/inet.js` (tier-B apps agent).
!Internet 5.00 is the TCP/IP Protocol Suite's resource directory, not a Wimp task.

* **!Boot** (run when the Filer sees it; the desktop boots `!Boot.Resources` at start-up): `Inet$Path`,
  `InetDBase$Path` (= `!Internet.files.`: Hosts, Networks, Protocols, Services, AUNMap), `bin` added to `Run$Path`.
* **!Run** (double-click, or `Run BootResources:!Internet` from the PreDesk `SetUpNet` that !InetSetup writes):
  if `Choices:Internet.Startup` is missing: "Your !Internet application has not yet been configured. Please use
  InetSetup to configure it."; otherwise it obeys `Startup` then `User` (with `CheckError` reporting `Inet$Error`)
  and sets `Inet$Started Yes`. The desktop here has no PreDesk stage, so the boot hook does what `SetUpNet` would
  once the desktop is up.
* The ARM programs in `bin` / `utils` have JavaScript stand-ins (core native registry) working on an in-memory
  interface / route table: `IfConfig` (configure / show units, BSD-style output), `IfRConfig` (RevARP / BOOTP: no
  server answers), `Route` (add / delete), `Sysctl`, `InetStat` (`-r` routes, `-i` interfaces), `ShowStat`, `Ping`
  (only this machine's own addresses answer; others give 100% packet loss), `TraceRoute`, `ARP`, `RMFind`,
  `utils.ReadCMOSIP` (`Inet$CMOSIPAddr`), `TriggerCBs`, `NewFiler`. The Net / Internet modules' commands
  `*AddMap` (AUNMap), `*InetGateway`, `*InetInfo` are provided too.
* There is no real network: no packets leave the browser.
