# !InetSetup ($.!Boot.Resources.!InetSetup)

Code: `src/apps/InetSetup/` (tier-B apps agent). Internet Setup 0.21 (27-Nov-96), a native port of
`vendor/ro371/Sources/SystemRes/InetSetup/Source/c/*` (Main, Load, Save, IfsDbox, AUN, Diagnose, Detect, FileUtils).
Double-clicking the disc's `!InetSetup` runs it (`app.js` registers the application directory).

## Toolbox resources
InetSetup is a Toolbox application: its windows and menus are in the `Res` file (`,fae`).
`node tools/toolbox.mjs --build` converts it to `assets/templates/InetSetup.Res.json` (Window objects with the
Wimp window block and every gadget's fields, Menu, ProgInfo; strings / messages resolved from the relocation
table). It must run **after** `tools/templates.mjs --build`, which clears `assets/templates/`.
`src/apps/InetSetup/toolbox.js` is a small Toolbox: it builds Wimp windows from Window objects, mapping
gadgets to icons with the 3.71 Window module's look (ActionButton `R5`/`R6` default, Option/RadioButton
`optoff/opton` / `radiooff/radioon`, WritableField `R7`, DisplayField `R2`, StringSet = field + `gright` pop-up,
LabelledBox = channel + label, Draggable = sprite over text, Button = raw icon flags), gadget help text, fading,
default focus, Return = default button / Escape = cancel button, non-local action buttons closing the dialogue,
click-show objects, Menu objects (ProgInfo → the "About this program" box) and Toolbox events
(`hide_event` 2 on Main = Quit, action_Help, DefaultNetmask, DefaultRouteD). Messages come from the disc's
`!InetSetup.Messages`, sprites from `assets/sprites/InetSetup`.

## Behaviour
* **Main** (Network configuration): AUN / Access / Internet buttons with their green "lights" (click a light to
  toggle), Help (starts !Help), Cancel (quits), Save. Menu: Info ▸, Quit.
* **Internet**: Enable TCP/IP Protocol Suite; Interfaces, Routing, Host names; the !Internet icon opens
  `BootResources:!Internet` (Adjust: the `Choices:Internet` directory); Extra options = the User file
  (double-click edits it, drag saves a copy).
* **Interfaces**: built at run time from the detected interfaces (label, option button with the card's name,
  "Configure…" → *Interface* / *InterfacePP* dialogue: IP address from host name / manually / from CMOS / RevARP /
  BOOTP, netmask + ICMP, primary interface; menu "Default netmask").
* **Routing**: gateway, Act as an IP router, Run RouteD (menu ▸ RouteD options), Routes file icon.
* **Host names**: host name, local domain / name servers / resolver (shaded unless "Use name servers also";
  that is shaded because no resolver module is installed, as on a stock 3.71 disc), Hosts file icon.
* **AUN**: Enable AUN, this station, file / print server (the CMOS values; server lists are empty with no
  Econet), AUNMap file, Update CMOS. **Access**: Enable Access.
* **Save** (SaveSetup): Diagnose (host name set, netmasks, "not in your Hosts file", "no interfaces
  configured?"), then writes `Choices:Internet.Startup` (same text as c/Save, so ScanInetStartup reads it back
  next time; filetype Obey), copies `Blanks.User` / `Blanks.Routes` if missing, `resolve` / `resconf` for resolvers,
  and `<Choices$Write>.Boot.PreDesk.SetUpNet` (`Run BootResources:!Internet`, the module-loading lines, or the
  blank "no network" file), then asks "Reset now / Reset later" (Reset now restarts the desktop).
* Files dropped on the AUN / Routing / Host names windows replace AUNMap / Routes / Hosts.

## Emulation notes
* No expansion cards: interfaces come only from `InetSetup$Driver$<location>` variables, which programs in
  `!InetSetup.AutoSense` set (the mechanism the !Help describes), e.g. an Obey file containing
  `Set InetSetup$Driver$NIC Ethernet III:ea0:Ether3:4.20:Ether3-16`. SLIP is offered if
  `System:Modules.Network.Slip` exists. With none, the Interfaces window is empty (as on a machine with no card).
  The !Run's `Unset InetSetup$Driver$*` is not done.
* The 3.71 ROM network modules (Internet, MbufManager, AUNMsgs, Net, BootNet, Freeway, ShareFS, NetFS …) are present.
  *Unplug / RMInsert state is kept in the configuration (`os.config.values.netUnplugged`, initially the blank
  SetUpNet's list); the AUN station / server CMOS bytes in `netCMOS` (file server 0.254, printer server 0.235).
* No networking: see docs/apps/Internet.md for what running !Internet does.

Test: `tests/tierb/act-inetsetup.mjs` (screenshots `tests/screens/tierB-inet-*.png`).
