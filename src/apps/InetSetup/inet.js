// !Internet 5.00 (!Boot.Resources.!Internet): the TCP/IP Protocol Suite's resource directory.
//
// Its !Run (an Obey file) loads the network modules and runs the Choices:Internet.Startup file written by
// InetSetup, which configures the interfaces with the ARM programs in !Internet.bin (IfConfig, Route,
// Sysctl…). Those are placeholders on this disc, so they are JavaScript stand-ins here (native.js),
// keeping an in-memory interface / routing table that InetStat, IfConfig and Ping report from. There is
// no real network: interfaces are "up" but no packet ever leaves the machine (Ping only answers for this
// machine's own addresses).

import { registerNative } from '../../core/native.js';
import { sysvars } from '../../core/sysvars.js';
import { vfs } from '../../core/vfs.js';
import { os } from '../../core/os.js';

export const net = {
  ifaces: new Map([['lo0', { unit: 'lo0', addr: '127.0.0.1', mask: '255.0.0.0', up: true, loopback: true }]]),
  routes: [],        // {dest, gateway, flags}
  aunMap: [],        // AddMap entries
  sysctl: new Map([['net.inet.udp.checksum', '0'], ['net.inet.ip.forwarding', '0']]),
};

const hexMask = (m) => '0x' + m.split('.').map((x) => (+x).toString(16).padStart(2, '0')).join('');
function classMask(addr) {
  const a = +String(addr).split('.')[0];
  return a < 128 ? '255.0.0.0' : a < 192 ? '255.255.0.0' : '255.255.255.0';
}
function parseMask(m, addr) {
  if (!m || m === 'default') return classMask(addr);
  if (/^0x[0-9a-f]+$/i.test(m)) { const n = parseInt(m, 16) >>> 0; return [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.'); }
  return m;
}
const broadcast = (a, m) => a.split('.').map((x, i) => (+x | (~+m.split('.')[i] & 255))).join('.');
const isIP = (s) => /^\d+\.\d+\.\d+\.\d+$/.test(s);

async function hosts() {
  try {
    const t = await vfs.readText(vfs.canonical(sysvars.gstrans('InetDBase:Hosts')));
    return t.split('\n').map((l) => l.replace(/#.*/, '').trim().split(/\s+/)).filter((w) => w.length >= 2 && isIP(w[0]));
  } catch { return []; }
}
async function resolve(name) {
  if (isIP(name)) return name;
  const h = (await hosts()).find((w) => w.slice(1).includes(name));
  return h?.[0] ?? null;
}

function ifLine(i) {
  const flags = i.loopback ? '8049<UP,LOOPBACK,RUNNING,MULTICAST>' : '863<UP,BROADCAST,NOTRAILERS,RUNNING,SIMPLEX>';
  let s = `${i.unit}: flags=${flags}\n\tinet ${i.addr}`;
  if (i.dest) s += ` --> ${i.dest}`;
  s += ` netmask ${hexMask(i.mask)}`;
  if (!i.loopback && !i.dest) s += ` broadcast ${broadcast(i.addr, i.mask)}`;
  return s;
}

/** With -e, failures set Inet$Error instead of raising an error (the Startup file's CheckError reports it). */
function fail(ctx, e, text) {
  if (e) { sysvars.set('Inet$Error', text); return; }
  throw Object.assign(new Error(text), { riscos: true });
}

const NATIVES = {
  // IfConfig [-e] <unit> [<address> [<dest>]] [netmask <mask>] | -a
  IfConfig: async (args, ctx) => {
    const out = ctx.out;
    let e = false;
    if (args[0] === '-e') { e = true; args = args.slice(1); }
    if (!args.length || args[0] === '-a') { for (const i of net.ifaces.values()) out.writeln(ifLine(i)); return; }
    const unit = args[0];
    const rest = args.slice(1);
    if (!rest.length) {
      const i = net.ifaces.get(unit);
      if (!i) return fail(ctx, e, `ifconfig: interface ${unit} does not exist`);
      out.writeln(ifLine(i));
      return;
    }
    const i = net.ifaces.get(unit) ?? { unit, addr: '0.0.0.0', mask: '0.0.0.0', up: true };
    let k = 0;
    while (k < rest.length) {
      const w = rest[k++];
      if (w === 'netmask') i.mask = parseMask(rest[k++], i.addr);
      else if (w === 'up') i.up = true;
      else if (w === 'down') i.up = false;
      else if (w === 'broadcast') k++;
      else if (/^-?(arp|trailers|link\d)$/.test(w)) { /* flags */ }
      else if (i.addrSet && !i.dest && /^[\w.<>$-]+$/.test(w)) i.dest = (await resolve(w)) ?? w;
      else {
        const a = await resolve(sysvars.gstrans(w));
        if (!a) return fail(ctx, e, `ifconfig: ${w}: bad value`);
        i.addr = a; i.addrSet = true;
        if (!rest.includes('netmask')) i.mask = classMask(a);
      }
    }
    net.ifaces.set(unit, i);
  },
  // IfRConfig: RevARP / BOOTP - nobody answers on a network with no wire
  IfRConfig: async (args, ctx) => fail(ctx, args[0] === '-e', `ifrconfig: no response from ${args.includes('revarp') ? 'Reverse ARP' : 'BOOTP'} server`),
  // Route [-e] [-n] add|delete [-net|-host] <dest> <gateway>
  Route: async (args, ctx) => {
    let e = false;
    args = args.filter((a) => { if (a === '-e') { e = true; return false; } return a !== '-n' && a !== '-f'; });
    const cmd = args[0];
    if (cmd !== 'add' && cmd !== 'delete' && cmd !== 'change') return fail(ctx, e, 'usage: route [ -nqv ] cmd [[ -<qualifers> ] args ]');
    let k = 1, kind = 'net';
    if (args[k] === '-net' || args[k] === '-host') kind = args[k++].slice(1);
    const dest = args[k++], gw = args[k++];
    if (!dest || (cmd !== 'delete' && !gw)) return fail(ctx, e, `route: ${cmd}: not enough arguments`);
    if (cmd === 'delete') { net.routes = net.routes.filter((r) => r.dest !== dest); ctx.out.writeln(`delete ${kind} ${dest}`); return; }
    const g = await resolve(sysvars.gstrans(gw));
    if (!g) return fail(ctx, e, `route: ${gw}: bad address`);
    net.routes = net.routes.filter((r) => r.dest !== dest);
    net.routes.push({ dest, gateway: g, flags: kind === 'host' ? 'UGH' : 'UG' });
    ctx.out.writeln(`add ${kind} ${dest}: gateway ${g}`);
  },
  // Sysctl [-e] [-w] name[=value] | -a
  Sysctl: async (args, ctx) => {
    const ww = args.filter((a) => !a.startsWith('-'));
    if (args.includes('-a') || !ww.length) { for (const [k, v] of net.sysctl) ctx.out.writeln(`${k} = ${v}`); return; }
    for (const w of ww) {
      const [k, v] = w.split('=');
      if (v != null && /w/.test(args.find((a) => a.startsWith('-')) ?? '')) { const old = net.sysctl.get(k) ?? '0'; net.sysctl.set(k, v); if (!/e/.test(args[0] ?? '')) ctx.out.writeln(`${k}: ${old} -> ${v}`); }
      else ctx.out.writeln(`${k} = ${net.sysctl.get(k) ?? '0'}`);
    }
  },
  // InetStat [-a] [-i] [-r] [-n]
  InetStat: async (args, ctx) => {
    const o = ctx.out;
    if (args.includes('-i')) {
      o.writeln('Name  Mtu   Network     Address            Ipkts Ierrs    Opkts Oerrs  Coll');
      for (const i of net.ifaces.values()) o.writeln(`${i.unit.padEnd(5)} ${String(i.loopback ? 1536 : 1500).padEnd(5)} ${i.addr.split('.').map((x, k) => x & +i.mask.split('.')[k]).join('.').padEnd(11)} ${i.addr.padEnd(18)} ${'0'.padStart(5)} ${'0'.padStart(5)} ${'0'.padStart(8)} ${'0'.padStart(5)} ${'0'.padStart(5)}`);
      return;
    }
    if (args.includes('-r')) {
      o.writeln('Routing tables');
      o.writeln('Destination      Gateway            Flags     Refs     Use  Interface');
      for (const r of net.routes) o.writeln(`${r.dest.padEnd(16)} ${r.gateway.padEnd(18)} ${r.flags.padEnd(9)} ${'0'.padStart(4)} ${'0'.padStart(7)}  ${[...net.ifaces.values()].find((i) => !i.loopback)?.unit ?? 'lo0'}`);
      o.writeln(`${'127.0.0.1'.padEnd(16)} ${'127.0.0.1'.padEnd(18)} ${'UH'.padEnd(9)} ${'0'.padStart(4)} ${'0'.padStart(7)}  lo0`);
      return;
    }
    o.writeln('Active Internet connections');
    o.writeln('Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)');
  },
  ShowStat: async (args, ctx) => { ctx.out.writeln('Internet 5.02 - no network traffic'); },
  // Ping <host>: only this machine answers
  Ping: async (args, ctx) => {
    const o = ctx.out;
    const host = args.filter((a) => !a.startsWith('-')).pop();
    if (!host) { o.writeln('usage: ping [-dfnqrvR] [-c count] [-i wait] [-l preload] [-p pattern] [-s packetsize] host'); return; }
    const a = await resolve(host);
    if (!a) throw Object.assign(new Error(`ping: unknown host ${host}`), { riscos: true });
    o.writeln(`PING ${host} (${a}): 56 data bytes`);
    const local = [...net.ifaces.values()].some((i) => i.addr === a && i.up) || a.startsWith('127.');
    const n = 4;
    for (let k = 0; k < n; k++) {
      if (local) o.writeln(`64 bytes from ${a}: icmp_seq=${k} ttl=255 time=${(0.9 + Math.random() * 0.3).toFixed(3)} ms`);
      await new Promise((r) => setTimeout(r, 200));
    }
    o.writeln('');
    o.writeln(`--- ${host} ping statistics ---`);
    o.writeln(`${n} packets transmitted, ${local ? n : 0} packets received, ${local ? 0 : 100}% packet loss`);
  },
  Pong: null, ARP: async (args, ctx) => { if (args.includes('-a')) for (const i of net.ifaces.values()) if (!i.loopback) ctx.out.writeln(`? (${i.addr}) at (incomplete)`); },
  TraceRoute: async (args, ctx) => {
    const host = args.filter((a) => !a.startsWith('-')).pop() ?? '';
    const a = await resolve(host);
    if (!a) throw Object.assign(new Error(`traceroute: unknown host ${host}`), { riscos: true });
    ctx.out.writeln(`traceroute to ${host} (${a}), 30 hops max, 40 byte packets`);
    ctx.out.writeln(' 1  * * *');
  },
  // RMFind <module> <version> <file>: RMInsert the ROM copy or load the file - the ROM modules are all present
  RMFind: null,
};
for (const [name, run] of Object.entries(NATIVES)) registerNative(`$.!Boot.Resources.!Internet.bin.${name}`, run ? { run } : {});
// utils
registerNative('$.!Boot.Resources.!Internet.utils.ReadCMOSIP', {
  run: async () => {
    const c = os.config?.values?.netCMOS ?? { station: 0, ip: [0, 0, 0] };
    const [b0, b1, b2] = c.ip ?? [0, 0, 0];
    sysvars.set('Inet$CMOSIPAddr', !b0 && !b1 && !b2 ? (c.station ? `10.0.0.${c.station}` : '0.0.0.0') : `${b0}.${b1}.${b2}.${c.station}`);
  },
});
registerNative('$.!Boot.Resources.!Internet.utils.TriggerCBs');    // lets the network modules' callbacks run
registerNative('$.!Boot.Resources.!Internet.utils.NewFiler');      // restarts the Filer so ShareFS / NetFS icons appear

/** Commands provided by ROM network modules that the Startup / AUNMap files use. */
export const COMMANDS = {
  AddMap: { syntax: 'Syntax: *AddMap <IP address> <net number>', help: '*AddMap adds an entry to the AUN address map (Net module).', min: 2, max: 2,
    run: async (a) => { net.aunMap = net.aunMap.filter((m) => m.ip !== a[0]); net.aunMap.push({ ip: a[0], net: +a[1] }); } },
  InetGateway: { syntax: 'Syntax: *InetGateway [on|off]', help: '*InetGateway turns IP forwarding on or off.', min: 0, max: 1,
    run: async (a, ctx) => { if (a[0]) net.sysctl.set('net.inet.ip.forwarding', /on/i.test(a[0]) ? '1' : '0'); else ctx.out.writeln(`IP forwarding is ${net.sysctl.get('net.inet.ip.forwarding') === '1' ? 'on' : 'off'}`); } },
  InetInfo: { syntax: 'Syntax: *InetInfo', help: '*InetInfo displays Internet module statistics.', min: 0, max: 0,
    run: async (a, ctx) => { ctx.out.writeln('Internet 5.02 (Acorn): no network hardware'); for (const i of net.ifaces.values()) ctx.out.writeln(ifLine(i)); } },
};

/**
 * !Internet.!Run: configure the TCP/IP stack from Choices:Internet.Startup (+ User). quiet = at start-up.
 * Errors are thrown with the !Run's messages.
 */
export async function runInternet() {
  const cli = os.cli;
  if (sysvars.get('Inet$Started') === 'Yes') return;
  sysvars.unset?.('Inet$Error');
  const exists = (p) => { try { return vfs.exists(sysvars.gstrans(p)); } catch { return false; } };
  if (!exists('Choices:Internet.Startup')) throw Object.assign(new Error('Your !Internet application has not yet been configured. Please use InetSetup to configure it.'), { riscos: true });
  sysvars.set('Alias$CheckError', 'IF "<Inet$Error>" <> "" THEN Error <Inet$Error>');
  const out = { write() {}, writeln() {} };
  try {
    await cli.obey(vfs.canonical(sysvars.gstrans('Choices:Internet.Startup')), { out });
    if (exists('Choices:Internet.User')) await cli.obey(vfs.canonical(sysvars.gstrans('Choices:Internet.User')), { out });
    sysvars.set('Inet$Startup', 'Choices:Internet.Startup');
    net.sysctl.set('net.inet.udp.checksum', '1');
    if (/^y/i.test(sysvars.get('Inet$IsGateway') ?? '')) net.sysctl.set('net.inet.ip.forwarding', '1');
    sysvars.set('Inet$Started', 'Yes');
  } finally {
    sysvars.unset?.('Alias$CheckError');
  }
}
