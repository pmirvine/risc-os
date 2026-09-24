// !InetSetup 0.21 (27-Nov-96) - native port of Sources/SystemRes/InetSetup/Source/c/* (K Bracey, Acorn).
//
// A Toolbox application: its dialogue boxes come from the original Res file (converted by
// tools/toolbox.mjs, built by ./toolbox.js). Main window: AUN / Access / Internet buttons with their
// "lights", Save, Cancel, Help. Internet ▸ Interfaces (built at run time from the detected interfaces,
// one "Configure..." button each → Interface / InterfacePP), Routing (+ RouteD options), Host names (DNS).
// Save (SaveSetup) checks the settings (Diagnose), writes Choices:Internet.Startup in the exact format
// of c/Save (ScanInetStartup reads it back next time), copies the Blanks.User / Blanks.Routes files, writes
// <Boot$ToBeLoaded>.SetUpNet and offers to reset the computer.
//
// Emulation: there are no expansion cards, so ScanInterfaces finds only the interfaces described by
// InetSetup$Driver$<location> variables (set by programs in !InetSetup.AutoSense, as the !Help explains).
// The ROM network modules (Internet, MbufManager, AUNMsgs, Net, BootNet, Freeway, ShareFS, NetFS …) are
// present; *Unplug / RMInsert state is kept in the configuration ("CMOS") under `netUnplugged`, and the
// AUN file/print server CMOS bytes under `netCMOS`. No networking takes place.

import { wimp } from '../../core/wimp.js';
import { os } from '../../core/os.js';
import { sysvars } from '../../core/sysvars.js';
import { vfs } from '../../core/vfs.js';
import { reportError } from '../../core/dialogs.js';
import { parseMessagesText } from '../../core/messages.js';
import { Toolbox, loadRes } from './toolbox.js';

// Gadget component ids (h/Gadgets)
const main_AUN = 9, main_AUN_B = 15, main_Access = 10, main_Access_B = 14, main_Internet = 11, main_Internet_B = 16, main_Save = 4;
const internet_Enable = 13, internet_Interfaces = 2, internet_Routing = 3, internet_Names = 4, internet_Logo = 11, internet_Extra = 14;
const aun_Enable = 13, aun_Logo1 = 12, aun_Logo2 = 14, aun_ThisStation = 7, aun_ThisStationLabel = 6, aun_FileServer = 9, aun_FileServerLabel = 8,
  aun_PrintServer = 11, aun_PrintServerLabel = 10, aun_Mappings = 15;
const access_Enable = 13, access_Logo1 = 10, access_Logo2 = 11, access_Logo3 = 12;
const routing_Gateway = 1, routing_Router = 3, routing_RouteD = 8, routing_RoutesFile = 9;
const routemenu_RouteDOptions = 0, routedopts_Options = 1;
const dns_HostName = 8, dns_LocalDomain = 7, dns_DomainLabel = 3, dns_Primary = 2, dns_PrimaryLabel = 13, dns_Secondary = 4, dns_SecondaryLabel = 14,
  dns_Tertiary = 5, dns_TertiaryLabel = 15, dns_NoDNS = 10, dns_UseDNS = 11, dns_HostsFile = 17, dns_ResolverType = 20, dns_ResolverTypeLabel = 21;
const ifs_Close = 0, ifs_Logo = 0x100000;
const if_Address = 2, if_Netmask = 4, if_FromHostname = 12, if_Manual = 6, if_FromCMOS = 8, if_RevARP = 7, if_BOOTP = 10, if_Primary = 13, if_ICMP = 14, if_LinkAddr = 15;
const action_Help = 1, action_Quit = 2, action_DefaultNetmask = 3, action_UpdateAUNCMOS = 5, action_DefaultRouteD = 6;
const RT = ['Resolver', 'Resolve', 'InetDB', 'DNSResolver'];

const CONFIGDIR_READ = 'Choices:Internet.';
const CONFIGDIR_STEM = '<Choices$Write>.Internet';
const CONFIGDIR_WRITE = CONFIGDIR_STEM + '.';

// ROM network modules of RISC OS 3.71 (BuildSys Components) and their versions
export const ROM_NET = { MbufManager: '0.17', AUNMsgs: '0.07', Internet: '5.02', BootNet: '0.84', Net: '6.18', Freeway: '0.26', ShareFS: '3.38',
  NetFS: '5.79', NetFiler: '0.77', NetPrint: '5.43', NetStatus: '0.03', NetUtils: '0.99', BBCEconet: '0.10' };
const DEFAULT_UNPLUGGED = ['ShareFS', 'Freeway', 'Net', 'BootNet', 'Internet', 'AUNMsgs', 'MbufManager'];   // Blanks.SetUpNet

/** VersionToInt (c/ModUtils): "0.17" -> 0x00017000. */
export function versionToInt(s) {
  s = String(s ?? '');
  let i = 16, v = 0, k = 0;
  while (/[0-9]/.test(s[k] ?? '')) { v = (v << 4) + (s.charCodeAt(k) - 48); k++; }
  if (s[k] !== '.') return (v << 16) >>> 0;
  k++;
  while (/[0-9]/.test(s[k] ?? '')) { v = (v << 4) + (s.charCodeAt(k) - 48); i -= 4; if (i === 0) break; k++; }
  return (v << i) >>> 0;
}
/** VersionToString (c/ModUtils): 0x00017000 -> "0.17". */
export function versionToString(n) {
  let s = '';
  if (n >>> 28) s += (n >>> 28);
  n &= ~0xF0000000;
  if (n >>> 24) s += (n >>> 24);
  n &= ~0x0F000000;
  if (n >>> 20) s += (n >>> 20);
  n &= ~0x00F00000;
  s += (n >>> 16) + '.';
  n &= ~0x000F0000;
  s += (n >>> 12);
  n &= ~0x0000F000;
  s += (n >>> 8);
  return s;
}

// --------------------------------------------------------------------------- module / CMOS emulation
const cfg = () => os.config;
function unplugged() {
  const v = cfg()?.values;
  if (!v) return new Set(DEFAULT_UNPLUGGED);
  if (!Array.isArray(v.netUnplugged)) v.netUnplugged = [...DEFAULT_UNPLUGGED];
  return new Set(v.netUnplugged);
}
function setUnplugged(set) { const v = cfg()?.values; if (v) { v.netUnplugged = [...set]; cfg().save(); } }
export function Unplug(m) { const s = unplugged(); if (m in ROM_NET) { s.add(m); setUnplugged(s); } }
/** RMInsert (c/ModUtils): insert the ROM copy if its version is new enough. */
export function RMInsert(m, minversion = 0) {
  if (!(m in ROM_NET)) return false;
  const ok = versionToInt(ROM_NET[m]) >= minversion;
  const s = unplugged();
  if (ok) s.delete(m); else s.add(m);
  setUnplugged(s);
  return ok;
}
export const RMLoaded = (m) => m in ROM_NET && !unplugged().has(m);

function systemModule(file) {
  const dir = sysvars.get('System$Dir') ?? '';
  for (const n of ['', '370.', '360.', '350.', '310.']) {
    const p = `${dir}.${n}Modules.Network.${file}`;
    try { if (vfs.exists(p)) return p; } catch { /* */ }
  }
  return null;
}
/** RMFind: 1 = in ROM, 2 = on disc (System:Modules.Network.<file>), 0 = not available. */
function RMFind(m, file, req) {
  if (m in ROM_NET && versionToInt(ROM_NET[m]) >= req) return 1;
  if (file && systemModule(String(file).replace(/^System:Modules\.Network\./i, ''))) return 2;
  return 0;
}
const exists = (p) => { try { return vfs.exists(sysvars.gstrans(p)); } catch { return false; } };
const canon = (p) => vfs.canonical(sysvars.gstrans(p));
async function readText(p) { try { return await vfs.readText(canon(p)); } catch { return null; } }
function write(p, text, filetype = 0xFFF) { return vfs.writeFile(sysvars.gstrans(p), text, { filetype }); }
function mkdir(p) { const q = sysvars.gstrans(p); if (!vfs.exists(q)) vfs.mkdir(q, { parents: true }); }
async function copy(from, to) { await vfs.copy(canon(from), sysvars.gstrans(to)); }
const bootToBeLoaded = () => sysvars.get('Boot$ToBeLoaded') || `${sysvars.get('Choices$Write') ?? ''}.Boot.PreDesk`;

// CMOS: station number (byte 0) and IP address bytes 108-110; AUN file / print server (Econet CMOS)
function netCMOS() {
  const v = cfg()?.values ?? {};
  v.netCMOS ??= { station: 0, ip: [0, 0, 0], fs: { net: 0, station: 254, name: '' }, ps: { net: 0, station: 235, name: '' } };
  return v.netCMOS;
}
function readCMOSIP() {
  const c = netCMOS(), [b0, b1, b2] = c.ip, b3 = c.station;
  if (!b0 && !b1 && !b2) return b3 ? `10.0.0.${b3}` : null;
  return `${b0}.${b1}.${b2}.${b3}`;
}

export const isIPAddr = (s) => /^\d+(\.\d+){0,3}$/.test(String(s));

// --------------------------------------------------------------------------- the application
export default async function start(task, ctx) {
  // !Run: "IF <Choices$Write> = "" OR <Boot$Path> = "" THEN Error No Boot application appears to have been run."
  if (!sysvars.get('Choices$Write') || !sysvars.get('Boot$Path')) {
    await reportError('No Boot application appears to have been run.', { appName: 'InetSetup' });
    task.quit(); return;
  }
  const dir = sysvars.get('InetSetup$Dir') ?? ctx.dir;
  // "Unset InetSetup$Driver$*" is not done: nothing else can set these variables here, and the
  // !Help's AutoSense mechanism is the way to describe a (simulated) network card.
  // Repeat Run <InetSetup$Dir>.AutoSense
  try {
    if (vfs.isDir(dir + '.AutoSense')) for (const e of vfs.list(dir + '.AutoSense')) await os.cli.run(`Run ${dir}.AutoSense.${e.name}`, { out: { write() {}, writeln() {} } }).catch(() => {});
  } catch { /* */ }

  const [res, msgText, spriteArea] = await Promise.all([
    loadRes('assets/templates/InetSetup.Res.json'),
    readText(dir + '.Messages'),
    os.sprites.loadManifest('InetSetup', 'Sprites22'),
  ]);
  let M = parseMessagesText(msgText ?? '');
  if (!Object.keys(M).length) { try { M = await (await fetch('assets/messages/InetSetup.json')).json(); } catch { M = {}; } }
  const msg = (t) => M[t] ?? t;
  const fmt = (t, ...a) => { let i = 0; return msg(t).replace(/%[sd]/g, () => String(a[i++] ?? '')); };
  const APP = msg('_TaskName');
  const error = (text) => reportError(text, { appName: APP, sprite: '!inetsetup' });

  // ------------------------------------------------------------------- state (c/Main globals)
  const S = {
    InternetEnabled: false, AUNEnabled: false, AccessEnabled: false,
    HostName: '', LocalDomain: '', Resolver: ['', '', ''], UseResolver: false, ResolverType: 0,
    Gateway: '', AmRouter: false, UseRouteD: false, RouteDoptions: 'DEFAULT',
    HaveResolver: false, HaveResolve: false, HaveInetDB: false, HaveDNSResolver: false, HaveAResolver: false, HaveEconet: false,
    CMOSIP: null, StartupExists: false, primary: -1,
    ifs: [],   // {location, name, unit, module, version, filename, address, netmask, linkaddr, pp, addrtype}
  };
  const V = {};
  for (const m of ['MbufManager', 'AUNMsgs', 'Internet', 'BootNet', 'Net', 'NetI', 'Freeway', 'ShareFS', 'Resolver', 'Resolve', 'InetDB', 'DNSResolver']) V[m] = versionToInt(msg('v_' + m));

  // ScanInterfaces (c/Detect): no expansion cards; Econet not fitted; SLIP if on disc; then the variables
  if (!sysvars.get('InetSetup$Driver$Serial') && systemModule('Slip')) sysvars.set('InetSetup$Driver$Serial', 'SLIP:sl0:Slip:2.07:Slip:P');
  S.CMOSIP = readCMOSIP();
  for (const v of sysvars.list('InetSetup$Driver$*')) {
    const parts = String(v.value).split(':');
    if (parts.length < 2) continue;
    S.ifs.push({
      location: v.name.slice('InetSetup$Driver$'.length).replace(/_/g, ' '), name: parts[0], unit: parts[1], module: parts[2] ?? '',
      version: versionToInt(parts[3] ?? ''), filename: parts[4] ?? '', pp: /P/.test(parts[5] ?? ''),
      address: '', netmask: '', linkaddr: '', addrtype: 0,
    });
  }
  const interfaces = () => S.ifs.length;

  // ------------------------------------------------------------------- CheckConfig (c/Load)
  async function checkConfig() {
    S.HaveResolver = !!RMFind('Resolver', 'System:Modules.Network.Resolver', V.Resolver);
    S.HaveResolve = !!RMFind('Resolve', 'System:Modules.Network.Resolve', V.Resolve);
    S.HaveInetDB = !!RMFind('InetDB', 'System:Modules.Network.InetDB', V.InetDB);
    S.HaveDNSResolver = !!RMFind('DNSResolver', 'System:Modules.Network.DNSResolve', V.DNSResolver);
    S.HaveAResolver = S.HaveResolver || S.HaveResolve || S.HaveInetDB || S.HaveDNSResolver;
    S.InternetEnabled = false;
    const setup = await readText(bootToBeLoaded() + '.SetUpNet');
    if (setup && setup.split('\n')[0].includes('!Internet')) S.InternetEnabled = true;
    if (sysvars.get('Inet$Path')) await scanInetStartup();
    if (!S.StartupExists) defaultAnInterface();
    if (!S.InternetEnabled) {
      S.AccessEnabled = RMLoaded('ShareFS') && RMLoaded('Freeway');
      S.AUNEnabled = RMLoaded('Net');
    }
  }
  async function scanInetStartup() {
    const text = await readText(CONFIGDIR_READ + 'Startup');
    if (text == null) return;
    S.StartupExists = true;
    const lines = text.split('\n');
    let k = 0;
    while (k < lines.length && lines[k] !== '|') k++;
    k++;
    // sections: "|\n| <title>\n|\n" … up to the next line starting with '|'
    while (k < lines.length) {
      const title = lines[k] ?? ''; k += 2;
      const body = [];
      while (k < lines.length && !lines[k].startsWith('|')) body.push(lines[k++]);
      k++;    // the '|' that starts the next section
      if (title.includes('Host name')) getHostName(body);
      else if (title.includes('Interface: ')) getInterface(body, title.slice(title.indexOf('Interface: ') + 11).trim());
      else if (title.includes('Name resolver')) await getResolvers(body);
      else if (title.includes('Routing')) getRouting(body);
      else if (title.includes('AUN')) S.AUNEnabled = true;
      else if (title.includes('Access')) S.AccessEnabled = true;
    }
  }
  const word = (s, re) => (re.exec(s) ?? [])[1];
  function getHostName(body) {
    for (const l of body) {
      if (l.includes('Inet$HostName')) S.HostName = word(l, /Set Inet\$HostName (\S+)/) ?? S.HostName;
      else if (l.includes('Inet$LocalDomain')) S.LocalDomain = word(l, /Set Inet\$LocalDomain (\S+)/) ?? S.LocalDomain;
    }
  }
  async function getResolvers(body) {
    for (const l of body) {
      if (!S.HaveResolver) continue;     // (sic: c/Load only reads the section when ANT's Resolver is available)
      if (l.includes('Inet$Resolvers')) { const m = l.split(/\s+/).slice(2); S.Resolver = [m[0] ?? '', m[1] ?? '', m[2] ?? '']; }
      else if (l.includes('RMEnsure Resolver ')) { S.UseResolver = true; S.ResolverType = 0; }
      else if (l.includes('RMEnsure Resolve ')) {
        S.UseResolver = true; S.ResolverType = 1;
        const t = await readText('InetDBase:resolve');
        let sn = 0;
        for (const r of (t ?? '').split('\n')) {
          if (r.startsWith(';')) continue;
          const d = word(r, /^domain (\S+)/); if (d) { S.LocalDomain = d; continue; }
          const n = word(r, /^nameserver (\S+)/); if (n && sn < 3) S.Resolver[sn++] = n;
        }
      } else if (l.includes('RMEnsure InetDB') || l.includes('RMEnsure DNSResolver')) {
        S.UseResolver = true; S.ResolverType = l.includes('InetDB') ? 2 : 3;
        const t = await readText('InetDBase:resconf');
        let sn = 0;
        for (const r of (t ?? '').split('\n')) {
          if (r.startsWith(';')) continue;
          const d = word(r, /^domain\s+(\S+)/); if (d) { S.LocalDomain = d.replace(/\.$/, ''); continue; }
          const n = word(r, /^nameserver\s+(\S+)/); if (n && sn < 3) S.Resolver[sn++] = n;
        }
      }
    }
  }
  function getRouting(body) {
    for (const l of body) {
      if (l.includes('Route -e add default')) S.Gateway = word(l, /Route -e add default (\S+)/) ?? '';
      else if (l.includes('Set Inet$IsGateway Yes')) S.AmRouter = true;
      else if (l.includes('Set Inet$RouteDOptions')) {
        const o = word(l, /Set Inet\$RouteDOptions (\S+)/) ?? '""';
        if (o === '""') S.RouteDoptions = 'DEFAULT'; else { S.RouteDoptions = o; S.UseRouteD = true; }
      }
    }
  }
  function getInterface(body, name) {
    let halfdone = false, i = -1;
    for (const l of body) {
      if (!halfdone && l.includes('IfConfig -e ')) {
        const unit = word(l, /IfConfig -e (\S+)/);
        i = S.ifs.findIndex((f) => f.name === name && f.unit === unit);
        if (i < 0) return;
        const f = S.ifs[i];
        if (S.primary === -1 && f.unit !== 'ec0') S.primary = i;
        const rest = l.slice(l.indexOf(unit) + unit.length).trim().split(/\s+/);
        if (!f.pp) { f.address = rest[0] ?? ''; f.netmask = rest[2] ?? ''; } else { f.address = rest[0] ?? ''; f.linkaddr = rest[1] ?? ''; f.netmask = rest[3] ?? ''; }
        if (f.address === S.HostName) f.addrtype = if_FromHostname;
        else if (f.address === '<Inet$CMOSIPAddr>') { f.addrtype = if_FromCMOS; f.address = S.CMOSIP ?? '0.0.0.0'; }
        else f.addrtype = if_Manual;
        return;
      } else if (l.includes('IfRConfig -e ')) {
        const unit = word(l, /IfRConfig -e (\S+)/);
        i = S.ifs.findIndex((f) => f.name === name && f.unit === unit);
        if (i < 0) return;
        const f = S.ifs[i];
        if (S.primary === -1) S.primary = i;
        if (l.includes('revarp')) f.addrtype = if_RevARP; else if (l.includes('bootp')) f.addrtype = if_BOOTP;
        if (l.includes('netmask')) { f.netmask = 'zzzz'; return; }
        halfdone = true;
      } else if (halfdone && l.includes('IfConfig -e')) {
        S.ifs[i].netmask = word(l, /netmask (\S+)/) ?? '';
        return;
      }
    }
  }
  function defaultAnInterface() {
    let firstInt = -1, firstPP = -1;
    S.ifs.forEach((f, i) => { if (firstInt === -1 && !f.pp) firstInt = i; else if (firstPP === -1 && f.pp) firstPP = i; });
    if (firstPP >= 0 && firstInt === -1) firstInt = firstPP;
    if (firstInt === -1) return;
    S.primary = firstInt;
    const f = S.ifs[firstInt];
    f.netmask = 'default'; f.address = S.HostName; f.addrtype = if_FromHostname;
  }

  await checkConfig();

  // ------------------------------------------------------------------- objects
  const O = {};
  const tb = new Toolbox(task, res, {
    spriteArea, info: { name: APP, version: msg('_Version') },
    onEvent: (code, id) => onToolboxEvent(code, id),
    onCreate: (name, o) => {     // create_handler: RouteDopts is created when the Routing menu's submenu first opens
      if (name === 'RouteDopts') { O.RouteDopts = o; o.setValue(routedopts_Options, S.RouteDoptions); }
    },
  });
  task.inetsetup = { S, O, tb, save: () => saveSetup() };

  function onToolboxEvent(code, id) {
    switch (code) {
      case action_Quit: task.quit(); break;
      case action_Help:
        if (!sysvars.get('Help$Dir')) os.apps.start('Help').catch?.(() => {});
        break;
      case action_DefaultNetmask: {
        const o = id.obj;
        if (!o) break;
        o.setValue(if_Netmask, 'default'); o.fade(if_Netmask, false); o.setState(if_ICMP, false);
        break;
      }
      case action_DefaultRouteD: id.obj?.setValue(routedopts_Options, 'DEFAULT'); break;
      case action_UpdateAUNCMOS: updateAUNCMOS(); break;
      default: break;
    }
  }

  // Main (auto-created, shown on create)
  O.Main = tb.create('Main');
  const mainB = (cmp, on) => O.Main._main(cmp)?.setState({ selected: !!on });
  if (!exists('BootResources:!Internet') || !RMFind('Internet', 'System:Modules.Network.Internet', V.Internet)) { O.Main.fade(main_Internet); O.Main.fade(main_Internet_B); }
  if (!RMFind('Freeway', 'System:Modules.Network.Freeway', V.Freeway) || !RMFind('ShareFS', 'System:Modules.Network.Share+', V.ShareFS)) { O.Main.fade(main_Access); O.Main.fade(main_Access_B); }
  if (!RMFind('Net', 'System:Modules.Network.Net', V.Net) && !RMFind('NetI', 'System:Modules.Network.NetI', V.NetI) && !S.HaveEconet) { O.Main.fade(main_AUN); O.Main.fade(main_AUN_B); }
  mainB(main_AUN_B, S.AUNEnabled); mainB(main_Access_B, S.AccessEnabled); mainB(main_Internet_B, S.InternetEnabled);
  O.Main.on('action', (ev) => { if (ev.isDefault) { readDboxes(); saveSetup(); } });
  O.Main.on('click', ({ cmp, ev }) => {
    if (ev.button !== 'select' && ev.button !== 'adjust') return false;
    switch (cmp) {
      case main_AUN: showAUN(); return true;
      case main_Access: showAccess(); return true;
      case main_Internet: showInternet(); return true;
      case main_AUN_B: case main_Access_B: case main_Internet_B: {
        const on = !O.Main._main(cmp).selected;
        mainB(cmp, on);
        const [obj, c, key] = cmp === main_AUN_B ? [O.AUN, aun_Enable, 'AUNEnabled'] : cmp === main_Access_B ? [O.Access, access_Enable, 'AccessEnabled'] : [O.Internet, internet_Enable, 'InternetEnabled'];
        S[key] = on;
        if (obj) { obj.setState(c, on); obj.emit('option', { cmp: c, on }); }
        return true;
      }
      default: return false;
    }
  });
  O.Main.show();

  // ------------------------------------------------------------------- AUN
  function aunShade(active) {
    const flag = !(active || S.HaveEconet);
    for (const c of [aun_Logo1, aun_Logo2, aun_ThisStation, aun_FileServer, aun_PrintServer, aun_ThisStationLabel, aun_FileServerLabel, aun_PrintServerLabel]) O.AUN.fade(c, flag);
    const istate = O.Internet ? O.Internet.getState(internet_Enable) : S.InternetEnabled;
    O.AUN.fade(aun_Mappings, !(istate && active));
  }
  function aunFaff() {
    const c = netCMOS();
    O.AUN.setValue(aun_ThisStation, String(c.station));    // no Econet: the CMOS station number
    O.AUN.setValue(aun_FileServer, c.fs.station ? `${c.fs.net}.${c.fs.station}` : c.fs.name);
    O.AUN.setValue(aun_PrintServer, c.ps.station ? `${c.ps.net}.${c.ps.station}` : c.ps.name);
  }
  function updateAUNCMOS() {
    if (!O.AUN) return;
    const c = netCMOS();
    const put = (key, s, maxName) => {
      const m = /^(?:(\d+)\.)?(\d+)$/.exec(s.trim());
      if (m && +m[2] > 0 && +m[2] < 255) c[key] = { net: m[1] ? +m[1] : 0, station: +m[2], name: '' };
      else c[key] = { net: 0, station: 0, name: s.slice(0, maxName) };
    };
    put('fs', O.AUN.getValue(aun_FileServer), 16);
    put('ps', O.AUN.getValue(aun_PrintServer), 6);
    cfg()?.save();
    aunFaff();
  }
  function showAUN() {
    if (!O.AUN) {
      O.AUN = tb.create('AUN');
      O.AUN.on('option', ({ cmp, on }) => { if (cmp === aun_Enable) { aunShade(on); mainB(main_AUN_B, on); } });
      O.AUN.on('action', (ev) => {
        if (ev.isDefault) { updateAUNCMOS(); S.AUNEnabled = O.AUN.getState(aun_Enable); }
        else if (ev.isCancel) { O.AUN.setState(aun_Enable, S.AUNEnabled); aunShade(S.AUNEnabled); mainB(main_AUN_B, S.AUNEnabled); aunFaff(); }
      });
      fileIcon(O.AUN, aun_Mappings, 'InetDBase:AUNMap');
      dropTarget(O.AUN, 'InetDBase:AUNMap');
      O.AUN.setState(aun_Enable, S.AUNEnabled);
      aunShade(S.AUNEnabled);
      aunFaff();
      // no Econet / NetFS: the file and print server lists are empty
      O.AUN.on('stringsetshown', ({ cmp }) => O.AUN.setAvailable(cmp, ''));
    }
    O.AUN.show(O.Main);
  }

  // ------------------------------------------------------------------- Access
  function accessShade(on) { for (const c of [access_Logo1, access_Logo2, access_Logo3]) O.Access.fade(c, !on); }
  function showAccess() {
    if (!O.Access) {
      O.Access = tb.create('Access');
      O.Access.on('option', ({ cmp, on }) => { if (cmp === access_Enable) { accessShade(on); mainB(main_Access_B, on); } });
      O.Access.on('action', (ev) => {
        if (ev.isDefault) S.AccessEnabled = O.Access.getState(access_Enable);
        else if (ev.isCancel) { O.Access.setState(access_Enable, S.AccessEnabled); accessShade(S.AccessEnabled); mainB(main_Access_B, S.AccessEnabled); }
      });
      O.Access.setState(access_Enable, S.AccessEnabled);
      accessShade(S.AccessEnabled);
    }
    O.Access.show(O.Main);
  }

  // ------------------------------------------------------------------- Internet
  function internetShade(on) { for (const c of [internet_Interfaces, internet_Routing, internet_Names, internet_Logo, internet_Extra]) O.Internet.fade(c, !on); }
  function hideInternetChildren() { for (const k of ['Routing', 'DNS', 'Interfaces']) O[k]?.hide(); }
  function showInternet() {
    if (!O.Internet) {
      O.Internet = tb.create('Internet');
      O.Internet.on('option', ({ cmp, on }) => {
        if (cmp !== internet_Enable) return;
        internetShade(on);
        mainB(main_Internet_B, on);
        if (O.AUN) O.AUN.fade(aun_Mappings, !(on && O.AUN.getState(aun_Enable)));
        if (!on) hideInternetChildren();
      });
      O.Internet.on('completed', hideInternetChildren);
      O.Internet.on('click', ({ cmp, ev }) => {
        if (ev.button !== 'select' && ev.button !== 'adjust') return false;
        if (cmp === internet_Routing) { showRouting(); return true; }
        if (cmp === internet_Interfaces) { showInterfaces(); return true; }
        if (cmp === internet_Names) { showNames(); return true; }
        if (cmp === internet_Logo) {
          if (ev.button === 'select') os.filer.openDir(canon('BootResources:!Internet'));
          else { mkdir(CONFIGDIR_STEM); os.filer.openDir(canon(CONFIGDIR_STEM)); }
          return true;
        }
        if (cmp === internet_Extra) { openFile(CONFIGDIR_READ + 'User', O.Internet); return true; }
        return false;
      });
      O.Internet.on('drag', ({ cmp, drop }) => { if (cmp === internet_Extra) dragFile(CONFIGDIR_READ + 'User', O.Internet, drop); });
      // Extra options: a Button gadget (not a Draggable) - SmallDragHandler starts a drag of the small icon
      O.Internet.win.on('drag', (ev) => {
        if (ev.icon?._tbCmp !== internet_Extra || O.Internet.faded(internet_Extra)) return;
        const ic = ev.icon, p = O.Internet.win.workToScreen(ic.bbox.x0, ic.bbox.y0);
        wimp.drag({ sprite: 'small_feb', box: { x0: p.x, y0: p.y, x1: p.x + 18, y1: p.y + 18 }, event: ev.pointerEvent })
          .then((drop) => { if (drop) dragFile(CONFIGDIR_READ + 'User', O.Internet, drop); });
        return true;
      });
      O.Internet.setState(internet_Enable, S.InternetEnabled);
      internetShade(S.InternetEnabled);
    }
    O.Internet.show(O.Main);
  }

  // the "file" icons (Draggables): double-click edits the file, drag saves a copy, drop replaces it
  function checkExistence(obj) {
    if (obj === O.Routing && !exists(CONFIGDIR_READ + 'Routes')) { mkdir(CONFIGDIR_STEM); return copy(`${dir}.Blanks.Routes`, CONFIGDIR_WRITE + 'Routes'); }
    if (obj === O.Internet && !exists(CONFIGDIR_READ + 'User')) { mkdir(CONFIGDIR_STEM); return copy(`${dir}.Blanks.User`, CONFIGDIR_WRITE + 'User'); }
    return null;
  }
  async function openFile(file, obj) {
    await checkExistence(obj);
    if (!exists(file)) return;
    const path = canon(file);
    // DoubleClickFile: DataOpen as a Text file; if it bounces, *@RunType_FFF
    const claimed = wimp.sendMessage('DataOpen', { path, filetype: 0xFFF, files: [{ path, filetype: 0xFFF }] }, { from: task });
    if (!claimed) os.cli.run(`@RunType_FFF ${path}`).catch((e) => error(e.message));
  }
  async function dragFile(file, obj, drop) {
    if (drop.window === obj.win) return;
    await checkExistence(obj);
    if (!exists(file)) return;
    const st = vfs.stat(canon(file));
    wimp.dataLoad(drop, [{ path: st.path, filetype: 0xFFF, size: st.size, name: st.name }], task);
  }
  function fileIcon(obj, cmp, file) {
    obj.on('doubleclick', (ev) => { if (ev.cmp === cmp) openFile(file, obj); });
    obj.on('drag', (ev) => { if (ev.cmp === cmp) dragFile(file, obj, ev.drop); });
  }
  // files dropped on a window replace its file (file_acker)
  function dropTarget(obj, file) {
    obj.on('dataload', async (ev) => {
      const f = ev.files?.[0];
      if (!f?.path || vfs.stat(f.path)?.type === 'dir') return;
      try { mkdir(CONFIGDIR_STEM); await vfs.copy(f.path, sysvars.gstrans(file)); } catch (e) { error(e.message); }
    });
  }

  // ------------------------------------------------------------------- Routing
  function showRouting() {
    if (!O.Routing) {
      O.Routing = tb.create('Routing');
      O.Routing.setValue(routing_Gateway, S.Gateway);
      O.Routing.setState(routing_Router, S.AmRouter);
      O.Routing.setState(routing_RouteD, S.UseRouteD);
      tb.setMenuFade('RouteMenu', routemenu_RouteDOptions, !S.UseRouteD);
      fileIcon(O.Routing, routing_RoutesFile, CONFIGDIR_READ + 'Routes');
      dropTarget(O.Routing, CONFIGDIR_WRITE + 'Routes');
      O.Routing.on('option', ({ cmp, on }) => { if (cmp === routing_RouteD) tb.setMenuFade('RouteMenu', routemenu_RouteDOptions, !on); });
      O.Routing.on('action', (ev) => {
        if (ev.isCancel) { O.Routing.setValue(routing_Gateway, S.Gateway); O.Routing.setState(routing_Router, S.AmRouter); O.Routing.setState(routing_RouteD, S.UseRouteD); }
      });
    }
    O.Routing.show(O.Internet);
  }

  // ------------------------------------------------------------------- Host names (DNS)
  function dnsShade(active) {
    for (const c of [dns_LocalDomain, dns_DomainLabel, dns_Primary, dns_PrimaryLabel, dns_Secondary, dns_SecondaryLabel, dns_Tertiary, dns_TertiaryLabel, dns_ResolverType, dns_ResolverTypeLabel]) O.DNS.fade(c, !active);
  }
  function showNames() {
    if (!O.DNS) {
      O.DNS = tb.create('DNS');
      O.DNS.setValue(dns_HostName, S.HostName);
      O.DNS.setValue(dns_LocalDomain, S.LocalDomain);
      O.DNS.setValue(dns_Primary, S.Resolver[0]);
      O.DNS.setValue(dns_Secondary, S.Resolver[1]);
      O.DNS.setValue(dns_Tertiary, S.Resolver[2]);
      O.DNS.setState(S.UseResolver ? dns_UseDNS : dns_NoDNS, true);
      dnsShade(S.UseResolver);
      if (!S.HaveAResolver) O.DNS.fade(dns_UseDNS);
      else {
        const set = [S.HaveResolver && 'Res0', S.HaveResolve && 'Res1', S.HaveInetDB && 'Res2', S.HaveDNSResolver && 'Res3'].filter(Boolean).map(msg);
        O.DNS.setAvailable(dns_ResolverType, set.join(','));
        O.DNS.setValue(dns_ResolverType, msg('Res' + S.ResolverType));
      }
      O.DNS.on('radio', ({ cmp, on }) => { if (cmp === dns_UseDNS) dnsShade(on); });
      fileIcon(O.DNS, dns_HostsFile, 'InetDBase:Hosts');
      dropTarget(O.DNS, 'InetDBase:Hosts');
      O.DNS.on('value', ({ cmp, value }) => {       // hostname_changed
        if (cmp !== dns_HostName) return;
        S.HostName = value;
        S.ifs.forEach((f, i) => { const o = O.ifObjs?.[i]; if (o && o.getState(if_FromHostname)) o.setValue(if_Address, S.HostName); });
      });
      O.DNS.on('action', (ev) => {
        if (ev.isCancel) {
          O.DNS.setValue(dns_HostName, S.HostName); O.DNS.setValue(dns_LocalDomain, S.LocalDomain);
          [dns_Primary, dns_Secondary, dns_Tertiary].forEach((c, k) => O.DNS.setValue(c, S.Resolver[k]));
          O.DNS.setState(S.UseResolver ? dns_UseDNS : dns_NoDNS, true); dnsShade(S.UseResolver);
        }
      });
    }
    O.DNS.show(O.Internet);
  }

  // ------------------------------------------------------------------- Interfaces (c/IfsDbox)
  const textW = (s) => Math.ceil(measure(s)) * 2;     // wimptextop_string_width (OS units)
  function measure(s) { const c = (measure.c ??= document.createElement('canvas').getContext('2d')); c.font = os.fonts?.css ?? '15px Homerton'; return c.measureText(s).width; }
  function makeIfsDbox() {
    const o = O.Interfaces = tb.create('Interfaces');
    O.ifObjs = [];
    const n = interfaces();
    let labelW = 80, buttonW = 0;
    for (const f of S.ifs) { labelW = Math.max(labelW, textW(f.location)); buttonW = Math.max(buttonW, textW(f.name)); }
    labelW += 12; buttonW += 24 + 44;
    const configW = textW(msg('Conf')) + 32;
    const y1 = -8 - 60 * n - 8, y0 = y1 - 68;
    const close = o.gadget(ifs_Close).bbox, cw = close.xmax - close.xmin;
    const x1 = 12 + labelW + 8 + buttonW + 8 + configW;
    o.moveGadget(ifs_Close, { xmin: x1 - cw, ymin: y0, xmax: x1, ymax: y1 });
    const logo = o.gadget(ifs_Logo).bbox;
    o.moveGadget(ifs_Logo, { xmin: logo.xmin, ymin: y0, xmax: logo.xmax, ymax: y1 });
    S.ifs.forEach((f, i) => {
      const haveDriver = !!RMFind(f.module, f.filename, f.version);
      const top = -8 - 60 * i;
      o.addGadget({ type: 'Label', cmp: (i << 8) + 1, flags: 3, faded: !haveDriver, bbox: { xmin: 12, ymin: top - 52, xmax: 12 + labelW, ymax: top }, label: f.location });
      o.addGadget({ type: 'ActionButton', cmp: (i << 8) + 2, flags: 4, faded: (!f.address && !f.addrtype) || !haveDriver,
        bbox: { xmin: 12 + labelW + 8 + buttonW + 8, ymin: top - 52, xmax: 12 + labelW + 8 + buttonW + 8 + configW, ymax: top },
        text: msg('Conf'), maxText: msg('Conf').length + 1, help: fmt('IfsHelp1', f.name) });
      const ifo = tb.create(f.pp ? 'InterfacePP' : 'Interface');
      O.ifObjs[i] = ifo;
      o.setClickShow((i << 8) + 2, ifo);
      o.addGadget({ type: 'OptionButton', cmp: (i << 8) + 3, flags: 1 | (haveDriver && (f.address || f.addrtype) ? 4 : 0), faded: !haveDriver,
        bbox: { xmin: 12 + labelW + 8, ymin: top - 4 - 44, xmax: 12 + labelW + 8 + buttonW, ymax: top - 4 }, label: f.name, maxLabel: f.name.length + 1, help: msg('IfsHelp2') });
      fillInterfaceDbox(ifo, i);
      ifo.on('radio', (ev) => ifButton(ifo, i, ev));
      ifo.on('option', (ev) => ifOption(ifo, i, ev));
      ifo.on('action', (ev) => ifAction(ifo, i, ev));
    });
    const w = 12 + labelW + 8 + buttonW + 8 + configW + 12, h = 8 + 60 * n + 8 + 68 + 12;
    o.setSize(w, h);
    o.on('option', ({ cmp, on }) => { o.fade(cmp - 1, !on); if (!on) O.ifObjs[cmp >> 8]?.hide(); });
    o.on('completed', () => { for (const x of O.ifObjs) x.hide(); });
  }
  function showInterfaces() {
    if (!O.Interfaces) makeIfsDbox();
    O.Interfaces.show(O.Internet);
  }
  function fillInterfaceDbox(o, i) {
    const f = S.ifs[i];
    o.setTitle(`${f.location}: ${f.name}`);
    o.setValue(if_Address, f.addrtype === if_FromHostname ? S.HostName : f.address);
    o.setValue(if_Netmask, f.netmask);
    if (f.pp) o.setValue(if_LinkAddr, f.linkaddr);
    o.setState(if_Primary, S.primary === i);
    if (f.addrtype === if_BOOTP || f.addrtype === if_RevARP) { o.fade(if_ICMP, false); o.setValue(if_Address, msg(f.addrtype === if_BOOTP ? 'BOOTP' : 'RevARP')); }
    if (!f.addrtype) f.addrtype = if_Manual;
    o.setState(f.addrtype, true);
    if (!o.getState(if_Manual)) o.fade(if_Address);
    if (!f.pp) o.fade(if_FromCMOS, !S.CMOSIP);
    if (!f.pp && !exists('Inet:bin.IfRConfig')) { o.fade(if_RevARP); o.fade(if_BOOTP); }
    if (f.netmask === 'zzzz') {
      f.netmask = 'default';
      o.setValue(if_Netmask, msg('ICMPReq')); o.fade(if_Netmask);
      if (!f.pp) o.setState(if_ICMP, true);
      o.setDefaultFocus(-2);
    }
    if (f.unit === 'ec0') o.fade(if_Primary);
    else if (interfaces() === 1) { o.fade(if_Primary); o.setState(if_Primary, true); }
  }
  function ifAction(o, i, ev) {
    const f = S.ifs[i];
    if (ev.isDefault) {
      f.address = o.getValue(if_Address); f.netmask = o.getValue(if_Netmask);
      if (f.pp) f.linkaddr = o.getValue(if_LinkAddr);
      if (o.getState(if_Primary)) S.primary = i; else if (S.primary === i) S.primary = -1;
      f.addrtype = o.radioOn(if_Manual);
    } else if (ev.isCancel) {
      o.setValue(if_Address, f.address); o.setValue(if_Netmask, f.netmask);
      if (f.pp) o.setValue(if_LinkAddr, f.linkaddr);
      const prev = o.radioOn(if_Manual);
      o.setState(f.addrtype, true);
      ifButton(o, i, { cmp: prev, on: false, previous: prev });
      ifButton(o, i, { cmp: f.addrtype, on: true, previous: prev });
      o.setState(if_Primary, S.primary === i);
      ifOption(o, i, { cmp: if_Primary, on: S.primary === i });
    }
  }
  function ifButton(o, i, { cmp, on, previous }) {
    const f = S.ifs[i];
    switch (cmp) {
      case if_FromHostname:
        if (on) {
          o.setValue(if_Address, S.HostName);
          O.ifObjs.forEach((x, j) => { if (j !== i && x.getState(if_FromHostname)) { x.setState(if_Manual, true); x.fade(if_Address, false); } });
        }
        break;
      case if_Manual:
        o.fade(if_Address, !on);
        if (on) { o.setValue(if_Address, f.address); if (o.showing) o.setFocus(if_Address); } else f.address = o.getValue(if_Address);
        break;
      case if_RevARP: if (on) o.setValue(if_Address, msg('RevARP')); break;
      case if_BOOTP: if (on) o.setValue(if_Address, msg('BOOTP')); break;
      case if_FromCMOS: if (on) o.setValue(if_Address, S.CMOSIP ?? '0.0.0.0'); break;
      default: break;
    }
    if (!on) return;
    const dyn = (c) => c === if_RevARP || c === if_BOOTP;
    if (!dyn(cmp) && dyn(previous)) {
      o.fade(if_ICMP); o.fade(if_Netmask, false); o.setDefaultFocus(if_Address);
      if (o.getState(if_ICMP)) { o.setState(if_ICMP, false); o.setValue(if_Netmask, f.netmask); }
    } else if (dyn(cmp) && !dyn(previous)) o.fade(if_ICMP, false);
  }
  function ifOption(o, i, { cmp, on }) {
    const f = S.ifs[i];
    if (cmp === if_Primary && on) O.ifObjs.forEach((x) => { if (x !== o) x.setState(if_Primary, false); });
    else if (cmp === if_ICMP) {
      if (on) { wimp.setCaret(o.win); o.fade(if_Netmask); f.netmask = o.getValue(if_Netmask); o.setValue(if_Netmask, msg('ICMPReq')); o.setDefaultFocus(-2); }
      else { o.fade(if_Netmask, false); o.setValue(if_Netmask, f.netmask); o.setFocus(if_Netmask); o.setDefaultFocus(if_Address); }
    }
  }

  // ------------------------------------------------------------------- ReadDboxes / SaveSetup
  function readDboxes() {
    if (O.Routing) { S.Gateway = O.Routing.getValue(routing_Gateway); S.AmRouter = O.Routing.getState(routing_Router); S.UseRouteD = O.Routing.getState(routing_RouteD); }
    if (O.RouteDopts) S.RouteDoptions = O.RouteDopts.getValue(routedopts_Options);
    if (O.DNS) {
      S.UseResolver = O.DNS.getState(dns_UseDNS);
      S.Resolver = [O.DNS.getValue(dns_Primary), O.DNS.getValue(dns_Secondary), O.DNS.getValue(dns_Tertiary)];
      S.HostName = O.DNS.getValue(dns_HostName); S.LocalDomain = O.DNS.getValue(dns_LocalDomain);
      const r = O.DNS.getValue(dns_ResolverType);
      for (let k = 0; k < 4; k++) if (r === msg('Res' + k)) { S.ResolverType = k; break; }
    }
    if (!O.Interfaces) makeIfsDbox();
    S.ifs.forEach((f, i) => {
      if (!O.Interfaces.getState((i << 8) + 3)) { f.address = ''; return; }
      const o = O.ifObjs[i];
      f.address = o.getValue(if_Address); f.netmask = o.getValue(if_Netmask);
      if (f.pp) f.linkaddr = o.getValue(if_LinkAddr);
      if (o.getState(if_Primary)) S.primary = i;
      f.addrtype = o.radioOn(if_Manual);
    });
    if (O.Internet) S.InternetEnabled = O.Internet.getState(internet_Enable);
  }

  async function inHostsFile(name) {
    const t = await readText('InetDBase:Hosts');
    for (const l of (t ?? '').split('\n')) {
      const w = l.replace(/#.*/, '').trim().split(/\s+/);
      if (w.length >= 2 && w.slice(1).includes(name)) return true;
    }
    return false;
  }
  async function diagnose() {
    if (!S.InternetEnabled) return true;
    if (!S.HostName) { await error(msg('NoHostName')); return false; }
    let configured = 0;
    for (const f of S.ifs) {
      if (!f.address) continue;
      configured++;
      if (!f.netmask) { await error(fmt('NoMask', f.name, f.location)); return false; }
      if (f.pp && !f.linkaddr) { await error(fmt('NoLinkAddr', f.name, f.location)); return false; }
      if ((f.addrtype === if_Manual || f.addrtype === if_FromHostname) && !isIPAddr(f.address) && !(await inHostsFile(f.address))) {
        await error(fmt('NotInHosts', f.address)); return false;
      }
    }
    if (configured === 0 && interfaces() > 0) {
      const r = await reportError(msg('NoIfs'), { appName: APP, sprite: '!inetsetup', category: 'question', cancel: true });
      if (r === 2) return false;
    }
    return true;
  }

  async function saveSetup() {
    if (!(await diagnose())) return;
    let cf = '', bf = '';
    Unplug('InternetA'); Unplug('Netmsgs'); Unplug('Accmsgs');
    if (S.InternetEnabled) {
      mkdir(CONFIGDIR_STEM);
      if (!exists(CONFIGDIR_READ + 'User')) await copy(`${dir}.Blanks.User`, CONFIGDIR_WRITE + 'User');
      if (!exists(CONFIGDIR_READ + 'Routes')) await copy(`${dir}.Blanks.Routes`, CONFIGDIR_WRITE + 'Routes');
    }
    // SetupInternet
    if (S.InternetEnabled) {
      cf += '|================================================================|\n'
        + '| Startup file for !Internet V5.00 (21st May 1996)               |\n'
        + '|                                                                |\n'
        + '| This file was automatically generated by !InetSetup. Do not    |\n'
        + '| edit it by hand unless you really, REALLY, know what you\'re    |\n'
        + '| doing. Comments and spacing are significant to !InetSetup.     |\n'
        + '|                                                                |\n'
        + '| If you want to add extra configuration options, place them in  |\n'
        + '| the User file.                                                 |\n'
        + '|================================================================|\n'
        + '\n';
      cf += `|\n| Host name\n|\nSet Inet$HostName ${S.HostName}\n`;
      if (S.LocalDomain) cf += `Set Inet$LocalDomain ${S.LocalDomain}\n`;
      if (S.primary !== -1) {
        const f = S.ifs[S.primary];
        if (f.filename) cf += `Set Inet$EtherDevice ${f.filename}\n`;
        if (f.addrtype === if_Manual || f.addrtype === if_FromHostname) cf += `Set Inet$EtherIPAddr ${f.address}\nSet Inet$EtherIPMask ${f.netmask}\n`;
        else if (f.addrtype === if_FromCMOS) cf += `SetMacro Inet$EtherIPAddr <Inet$CMOSIPAddr>\nSet Inet$EtherIPMask ${f.netmask}\n`;
        else cf += `Set Inet$EtherIPAddr ${f.addrtype === if_RevARP ? 'revarp' : 'bootp'}\nSet Inet$EtherIPMask default\n`;
        if (f.pp) cf += `Set Inet$LinkIPAddr ${f.linkaddr}\n`;
        cf += saveInterface(S.primary);
      }
      cf += 'Set Inet$EtherTypeA <Inet$EtherType>\n';
      S.ifs.forEach((_, i) => { if (i !== S.primary) cf += saveInterface(i); });
      cf += '|\n| Loopback\n|\nIfConfig -e lo0 127.0.0.1\nCheckError\nSet Inet$EtherType <Inet$EtherTypeA>\nUnset Inet$EtherTypeA\n';
      if (S.UseResolver) {
        const files = ['Resolver', 'Resolve', 'InetDB', 'DNSResolve'];
        cf += '|\n| Name resolver\n|\n';
        if (S.ResolverType === 0) cf += 'Set Inet$Resolvers' + S.Resolver.filter(Boolean).map((r) => ' ' + r).join('') + '\n';
        cf += `RMEnsure ${RT[S.ResolverType]} ${versionToString(V[RT[S.ResolverType]])} RMLoad System:Modules.Network.${files[S.ResolverType]}\n`;
        if (S.ResolverType >= 2) await saveResConf(); else if (S.ResolverType === 1) saveResolve();
      }
      cf += '|\n| Routing\n|\n';
      if (S.Gateway) cf += `Route -e add default ${S.Gateway}\nCheckError\n`;
      cf += `Run ${CONFIGDIR_READ}Routes\nCheckError\nSet Inet$IsGateway ${S.AmRouter ? 'Yes' : '""'}\nSet Inet$RouteDOptions ${S.UseRouteD ? S.RouteDoptions : '""'}\n`;
      RMInsert('AUNMsgs', V.AUNMsgs); RMInsert('MbufManager', V.MbufManager); RMInsert('Internet', V.Internet);
      bf += 'Run BootResources:!Internet\n';
    } else if (S.AUNEnabled || S.AccessEnabled) {
      const a = RMInsert('AUNMsgs', V.AUNMsgs), m = RMInsert('MbufManager', V.MbufManager), i = RMInsert('Internet', V.Internet);
      let d = false;
      for (const f of S.ifs) d = RMInsert(f.module, f.version) || d;
      if (!a || !m || !i || !d) bf += '|\n| Internet\n|\nIF "<BootResources$Path>" = "" THEN Set BootResources$Path <Boot$Dir>.Resources.\nIF "<System$Path>" = "" THEN Run BootResources:!System\n';
      if (!a) bf += `RMEnsure AUNMsgs ${versionToString(V.AUNMsgs)} RMLoad System:Modules.Network.AUNMsgs\n`;
      if (!m) bf += `RMEnsure MbufManager ${versionToString(V.MbufManager)} RMLoad System:Modules.Network.MManager\n`;
      if (!i) bf += `RMEnsure Internet ${versionToString(V.Internet)} RMLoad System:Modules.Network.Internet\n`;
      if (!d) bf += S.ifs[0] ? `RMEnsure ${S.ifs[0].module} ${versionToString(S.ifs[0].version)} RMLoad System:Modules.Network.${S.ifs[0].filename}\n` : 'RMEnsure  0.00 RMLoad System:Modules.Network.\n';
      if (!a || !m || !i || !d) bf += 'Run BootResources:!Internet.utils.TriggerCBs\n';
    }
    if (!S.InternetEnabled && !S.AUNEnabled && !S.AccessEnabled) for (const x of ['Internet', 'AUNMsgs', 'MbufManager', 'BootNet', 'Net']) Unplug(x);
    // SetupAUN
    if (O.AUN && (S.AUNEnabled || S.HaveEconet)) updateAUNCMOS();
    if (S.AUNEnabled) {
      if (S.InternetEnabled) {
        cf += `|\n| AUN\n|\nRMFind NetI ${versionToString(V.NetI)} System:Modules.Network.NetI\nRun InetDBase:AUNMap\nRMEnsure BBCEconet 0 RMReInit BBCEconet\n`
          + 'RMEnsure NetFS 0 RMReInit NetFS\nRMEnsure NetFS 5.79 RMEnsure NetUtils 0.99 Run System:Modules.Network.NetUtils\n'
          + 'RMEnsure NetPrint 0 RMReInit NetPrint\nRMEnsure NetFiler 0 RMReInit NetFiler\n';
      } else if (!RMInsert('Net', V.Net)) bf += '|\n| AUN\n|\nSet Net$Device ""\nRun BootResources:!Internet.utils.BootNet\n';
      for (const x of ['BootNet', 'NetFS', 'NetPrint', 'NetFiler', 'NetStatus', 'NetUtils', 'BBCEconet']) RMInsert(x, 0);
    }
    // SetupAccess
    if (S.AccessEnabled) {
      if (S.InternetEnabled) {
        cf += `|\n| Access\n|\nIF "<ShareFS$Path>" = "" THEN Run Resources:$.Resources.ShareFS.!Boot\nRMFind Freeway ${versionToString(V.Freeway)} System:Modules.Network.Freeway\n`
          + `RMFind ShareFS ${versionToString(V.ShareFS)} System:Modules.Network.Share+\n`;
        RMInsert('Freeway', V.Freeway); RMInsert('ShareFS', V.ShareFS);
      } else {
        const f = RMInsert('Freeway', V.Freeway), s = RMInsert('ShareFS', V.ShareFS);
        if (!f || !s) bf += `|\n| Access\n|\nIF "<ShareFS$Path>" = "" THEN Run Resources:$.Resources.ShareFS.!Boot\nRMEnsure Freeway ${versionToString(V.Freeway)} RMLoad System:Modules.Network.Freeway\nRMEnsure ShareFS ${versionToString(V.ShareFS)} RMLoad System:Modules.Network.Share+\n`;
      }
      RMInsert('BootNet', 0); RMInsert('AUNMsgs', 0);
    } else { Unplug('ShareFS'); Unplug('Freeway'); }
    if (S.InternetEnabled && (S.AccessEnabled || S.AUNEnabled)) cf += 'SetEval Inet$KickFiler 1\n';
    try {
      if (S.InternetEnabled) write(CONFIGDIR_WRITE + 'Startup', cf, 0xFEB);
    } catch { await error(msg('CantSaveStartup')); return; }
    const setUpNet = bootToBeLoaded() + '.SetUpNet';
    try {
      mkdir(bootToBeLoaded());
      if (bf) write(setUpNet, bf, 0xFEB);
      else {
        if (exists(setUpNet)) vfs.delete(canon(setUpNet));
        if (!S.InternetEnabled && !S.AccessEnabled && !S.AUNEnabled) await copy(`${dir}.Blanks.SetUpNet`, setUpNet);
      }
    } catch { await error(msg('CantSaveSetup')); return; }
    const [now, later] = msg('ResetButs').split(',');
    const r = await reportError(msg('ResetPrompt'), { appName: APP, sprite: '!inetsetup', category: 'question', ok: false, buttons: [now, later] });
    if (r === now) {
      try { sessionStorage.removeItem('riscos.booted'); } catch { /* */ }
      os.cli.run('Shutdown').catch(() => {});
      setTimeout(() => location.reload(), 1500);
    } else task.quit();
  }

  function saveInterface(i) {
    const f = S.ifs[i];
    if (!f.address) return '';
    RMInsert(f.module, f.version);
    let s = `|\n| Interface: ${f.name}\n|\nRMEnsure ${f.module} ${versionToString(f.version)} RMLoad System:Modules.Network.${f.filename}\n`;
    if (f.unit === 'ec0') {
      if (f.addrtype === if_Manual || f.addrtype === if_FromHostname) s += `Set Inet$EcoIPAddr ${f.address}\nSet Inet$EcoIPMask ${f.netmask}\n`;
      else s += `Set Inet$EcoIPAddr ${f.addrtype === if_RevARP ? 'revarp' : 'bootp'}\nSet Inet$EcoIPMask default\n`;
    }
    const dynamicNetmask = f.netmask === msg('ICMPReq');
    switch (f.addrtype) {
      case if_FromHostname: case if_Manual:
        s += f.pp ? `IfConfig -e ${f.unit} ${f.address} ${f.linkaddr} netmask ${f.netmask}\nCheckError\n` : `IfConfig -e ${f.unit} ${f.address} netmask ${f.netmask}\nCheckError\n`;
        break;
      case if_FromCMOS:
        s += `Run Inet:utils.ReadCMOSIP\nIfConfig -e ${f.unit} <Inet$CMOSIPAddr> netmask ${f.netmask}\n`;
        break;
      case if_RevARP: case if_BOOTP: {
        const how = f.addrtype === if_RevARP ? 'revarp' : 'bootp';
        s += `IF "<Wimp$State>" = "commands" THEN Echo ${fmt('Contacting', msg(f.addrtype === if_RevARP ? 'RevARP' : 'BOOTP'), f.name)}\n`
          + `IfRConfig -e ${f.unit} ${how}${dynamicNetmask ? ' netmask' : ''}\nCheckError\n`
          + 'IF "<Wimp$State>" = "commands" THEN Echo <11><23><8><5><6><0><0><0><0><0><0><11>\n';
        if (!dynamicNetmask) s += `IfConfig -e ${f.unit} netmask ${f.netmask}\nCheckError\n`;
        break;
      }
      default: break;
    }
    return s;
  }
  function saveResolve() {
    let t = `domain ${S.LocalDomain}\n`;
    for (const r of S.Resolver) if (r) t += `nameserver ${r}\n`;
    try { write('InetDBase:resolve', t); } catch { /* */ }
  }
  async function saveResConf() {
    const old = await readText('InetDBase:resconf');
    let t = '', ns = 0;
    if (old != null) {
      for (const l of old.replace(/\n$/, '').split('\n')) {
        if (/^domain\s+\S/.test(l)) t += `domain     ${S.LocalDomain}.\n`;
        else if (/^nameserver\s+\S/.test(l)) { if (ns < 3 && S.Resolver[ns]) t += `nameserver ${S.Resolver[ns++]}\n`; } else t += l + '\n';
      }
    } else t += `domain     ${S.LocalDomain}.\ncachesize  16k\ncacheload  resboot rescache\ncachesave  rescache\nretry      3\ntimeout    3 12\nlookup     file bind\n`;
    for (; ns < 3; ns++) if (S.Resolver[ns]) t += `nameserver ${S.Resolver[ns]}\n`;
    try { write('InetDBase:resconf', t); } catch { /* */ }
  }

  task.onMessage('Quit', () => task.quit());
}
