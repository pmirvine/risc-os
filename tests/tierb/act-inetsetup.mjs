// !InetSetup and !Internet: launch InetSetup from the Filer (with an AutoSense program describing a network
// card), enable TCP/IP, configure the interface, host name and gateway through the Toolbox dialogue boxes,
// Save, check the files written (Choices:Internet.Startup/User/Routes, PreDesk.SetUpNet), relaunch to see
// the settings read back, then double-click !Internet and check the stack is configured.
import path from 'path';
import { SHOTS } from '../core/pw.mjs';
import { filerOpen, check } from '../edit/ui.mjs';

const RES = 'ADFS::HardDisc4.$.!Boot.Resources';
const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, `tierB-inet-${n}.png`) });

/** Screen centre of gadget cmp of InetSetup's object `obj` (O.Main, O.Internet …, or ifObjs[i]). */
async function gpos(page, obj, cmp, role = 'main') {
  return page.evaluate(({ obj, cmp, role }) => {
    const I = os.apps.tasksOf('InetSetup')[0].inetsetup;
    const o = obj.startsWith('if') ? I.O.ifObjs[+obj.slice(2)] : I.O[obj];
    const ic = o.gadgets.get(cmp).icons.find((i) => i._tbRole === role) ?? o.gadgets.get(cmp).icons[0];
    return o.win.workToScreen((ic.bbox.x0 + ic.bbox.x1) / 2, (ic.bbox.y0 + ic.bbox.y1) / 2);
  }, { obj, cmp, role });
}
async function click(page, obj, cmp, opts = {}) {
  const p = await gpos(page, obj, cmp, opts.role);
  await page.mouse.click(p.x, p.y, { button: opts.button ?? 'left' });
  await page.waitForTimeout(opts.wait ?? 300);
}
async function type(page, obj, cmp, text) {
  await click(page, obj, cmp, { wait: 150 });
  await page.keyboard.press('Control+u');
  await page.keyboard.type(text);
  await page.waitForTimeout(150);
}
const read = (page, p) => page.evaluate(async (p) => { try { return await os.vfs.readText(os.vfs.canonical(os.sysvars.gstrans(p))); } catch { return null; } }, p);

export default async (page) => {
  // an AutoSense program, as described in !InetSetup.!Help, announces an Ethernet III network card
  await page.evaluate((RES) => {
    os.vfs.mkdir(`${RES}.!InetSetup.AutoSense`, { parents: true });
    os.vfs.writeFile(`${RES}.!InetSetup.AutoSense.EtherIII`, 'Set InetSetup$Driver$NIC Ethernet III:ea0:Ether3:4.20:Ether3-16\n', { filetype: 0xFEB });
  }, RES);

  // ---- !Internet before InetSetup has been used: its !Run's error
  await filerOpen(page, RES, '!Internet', { wait: 900 });
  const err = await page.evaluate(() => [...wimp.windows].filter((w) => w._errorBox && w.isOpen).map((w) => w.icons[0]?.text).join('|'));
  check('!Internet not yet configured', /has not yet been configured\. Please use InetSetup/.test(err), err);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);

  // ---- launch from the Filer
  await filerOpen(page, RES, '!InetSetup', { wait: 1800 });
  const up = await page.evaluate(() => !!os.apps.tasksOf('InetSetup')[0]?.inetsetup?.O.Main?.showing);
  check('InetSetup main window open', up);
  const title = await page.evaluate(() => os.apps.tasksOf('InetSetup')[0].inetsetup.O.Main.win.title);
  check('main window title from the Res file', title === 'Network configuration', title);
  await page.evaluate(() => { for (const v of os.filer.viewers.values()) v.win.close(); });
  await page.waitForTimeout(200);
  // Menu on the main window: Info ▸ / Quit, from the Res file's "Menu" object
  const mp = await gpos(page, 'Main', 13);
  await page.mouse.click(mp.x, mp.y - 60, { button: 'middle' });
  await page.waitForTimeout(300);
  const items = await page.locator('.menu').first().locator('.mitem').allInnerTexts().catch(() => []);
  check('main menu Info / Quit', items.length === 2 && /Info/.test(items[0]) && /Quit/.test(items[1]), JSON.stringify(items));
  await page.keyboard.press('Escape');
  await shot(page, 'main');

  // ---- Internet ▸ enable, Interfaces ▸ Configure… (manual address)
  await click(page, 'Main', 11);                  // Internet
  await click(page, 'Internet', 13);              // Enable TCP/IP Protocol Suite
  const light = await page.evaluate(() => os.apps.tasksOf('InetSetup')[0].inetsetup.O.Main._main(16).selected);
  check('Internet light comes on', light);
  await click(page, 'Internet', 2, { wait: 500 }); // Interfaces
  const nIfs = await page.evaluate(() => os.apps.tasksOf('InetSetup')[0].inetsetup.S.ifs.map((f) => `${f.location}:${f.name}:${f.unit}`));
  check('AutoSense interface detected', nIfs.length === 1 && nIfs[0] === 'NIC:Ethernet III:ea0', JSON.stringify(nIfs));
  await click(page, 'Interfaces', 2, { wait: 500 }); // Configure...
  const ifTitle = await page.evaluate(() => os.apps.tasksOf('InetSetup')[0].inetsetup.O.ifObjs[0].win.title);
  check('interface dialogue titled with location and name', ifTitle === 'NIC: Ethernet III', ifTitle);
  await click(page, 'if0', 6);                    // "manually"
  const shaded = await page.evaluate(() => os.apps.tasksOf('InetSetup')[0].inetsetup.O.ifObjs[0].faded(2));
  check('address field unshaded for manual entry', !shaded);
  await type(page, 'if0', 2, '10.0.0.5');
  await type(page, 'if0', 4, '255.255.255.0');
  await shot(page, 'interface');
  await click(page, 'if0', 0);                    // Set
  const ifState = await page.evaluate(() => { const f = os.apps.tasksOf('InetSetup')[0].inetsetup.S.ifs[0]; return `${f.address}/${f.netmask}/${f.addrtype}`; });
  check('interface settings applied', ifState === '10.0.0.5/255.255.255.0/6', ifState);

  // ---- Host names
  await click(page, 'Internet', 4, { wait: 400 });
  await type(page, 'DNS', 8, 'archimedes');
  const dom = await page.evaluate(() => os.apps.tasksOf('InetSetup')[0].inetsetup.O.DNS.faded(7));
  check('local domain shaded while only the Hosts file is used', dom);
  await shot(page, 'hostnames');
  await click(page, 'DNS', 0);                    // Set

  // ---- Routing: gateway + RouteD menu
  await click(page, 'Internet', 3, { wait: 400 });
  await type(page, 'Routing', 1, '10.0.0.1');
  const rp = await gpos(page, 'Routing', 1);
  await page.mouse.click(rp.x, rp.y + 60, { button: 'middle' });
  await page.waitForTimeout(300);
  const rmenu = await page.locator('.menu').first().locator('.mitem').allInnerTexts().catch(() => []);
  check('Routing menu from the Res file', rmenu.some((t) => /RouteD options/.test(t)), JSON.stringify(rmenu));
  await shot(page, 'routing');
  await page.keyboard.press('Escape');
  await click(page, 'Routing', 2);                // Set
  await click(page, 'Internet', 0);               // Close (also closes its sub-dialogues)
  const kids = await page.evaluate(() => ['Routing', 'DNS', 'Interfaces'].map((k) => os.apps.tasksOf('InetSetup')[0].inetsetup.O[k].showing));
  check('Internet Close hides its dialogue boxes', !kids.some(Boolean), JSON.stringify(kids));

  // ---- AUN and Access dialogue boxes
  await click(page, 'Main', 9, { wait: 400 });    // AUN
  const station = await page.evaluate(() => os.apps.tasksOf('InetSetup')[0].inetsetup.O.AUN.getValue(9));
  check('AUN file server from CMOS', station === '0.254', station);
  await click(page, 'Main', 10, { wait: 400 });   // Access
  await click(page, 'Access', 13);                // Enable Access
  await shot(page, 'aun-access');
  await click(page, 'Access', 0);                 // Set
  await click(page, 'AUN', 17);                   // Cancel

  // ---- Save
  await click(page, 'Main', 4, { wait: 800 });
  const prompt = await page.evaluate(() => [...wimp.windows].filter((w) => w._errorBox && w.isOpen).map((w) => w.icons[0]?.text).join('|'));
  check('reset prompt after saving', /reset before your choices take effect/.test(prompt), prompt);
  await shot(page, 'saved');
  const later = await page.evaluate(async () => {
    const w = [...wimp.windows].find((q) => q._errorBox && q.isOpen);
    if (!w) return 'none';
    const ic = w.icons.find((i) => i && i._extra === 'Reset later');
    const p = w.workToScreen((ic.bbox.x0 + ic.bbox.x1) / 2, (ic.bbox.y0 + ic.bbox.y1) / 2);
    return p;
  });
  if (later !== 'none') { await page.mouse.click(later.x, later.y); await page.waitForTimeout(400); }
  check('InetSetup quit after "Reset later"', await page.evaluate(() => os.apps.tasksOf('InetSetup').length === 0));

  const startup = await read(page, 'Choices:Internet.Startup');
  check('Startup written', !!startup);
  for (const l of ['Set Inet$HostName archimedes', '| Interface: Ethernet III', 'RMEnsure Ether3 4.20 RMLoad System:Modules.Network.Ether3-16',
    'IfConfig -e ea0 10.0.0.5 netmask 255.255.255.0', 'Set Inet$EtherDevice Ether3-16', 'Route -e add default 10.0.0.1', 'Run Choices:Internet.Routes',
    '| Access', 'SetEval Inet$KickFiler 1', 'IfConfig -e lo0 127.0.0.1']) check(`Startup has "${l}"`, startup?.includes(l + '\n'));
  const ftype = await page.evaluate(() => os.vfs.stat(os.sysvars.gstrans('<Choices$Write>.Internet.Startup'))?.filetype);
  check('Startup is an Obey file', ftype === 0xFEB);
  check('User file copied from Blanks', /User startup file for !Internet/.test(await read(page, 'Choices:Internet.User') ?? ''));
  check('Routes file copied from Blanks', /Routes file for !Internet/.test(await read(page, 'Choices:Internet.Routes') ?? ''));
  const setup = await read(page, '<Choices$Write>.Boot.PreDesk.SetUpNet');
  check('SetUpNet runs !Internet', setup === 'Run BootResources:!Internet\n', JSON.stringify(setup));

  // ---- relaunch: the settings are read back from the Startup file
  await filerOpen(page, RES, '!InetSetup', { wait: 1800 });
  const back = await page.evaluate(() => { const S = os.apps.tasksOf('InetSetup')[0].inetsetup.S; return [S.InternetEnabled, S.AccessEnabled, S.HostName, S.Gateway, S.ifs[0].address, S.ifs[0].netmask, S.primary].join(','); });
  check('settings read back', back === 'true,true,archimedes,10.0.0.1,10.0.0.5,255.255.255.0,0', back);
  await page.evaluate(() => os.apps.tasksOf('InetSetup')[0].quit());

  // ---- !Internet: double-click runs the Startup file through the IfConfig / Route stand-ins
  await filerOpen(page, RES, '!Internet', { wait: 1200 });
  const vars = await page.evaluate(() => ['Inet$Started', 'Inet$HostName', 'Inet$EtherIPAddr', 'Inet$Error'].map((v) => os.sysvars.get(v) ?? '').join(','));
  check('!Internet configured the stack', vars === 'Yes,archimedes,10.0.0.5,', vars);
  const ifc = await page.evaluate(async () => { let s = ''; try { await os.cli.run('IfConfig ea0', { out: { write: (t) => { s += t; }, writeln: (t = '') => { s += t + '\n'; } } }); } catch (e) { s = e.message; } return s; });
  check('IfConfig reports ea0', /inet 10\.0\.0\.5 netmask 0xffffff00 broadcast 10\.0\.0\.255/.test(ifc), ifc);
  const ping = await page.evaluate(async () => { let s = ''; await os.cli.run('Ping 10.0.0.1', { out: { write: (t) => { s += t; }, writeln: (t = '') => { s += t + '\n'; } } }); return s; });
  check('no real network: the gateway does not answer', /100% packet loss/.test(ping), ping);
  // run the Internet ReadMe-style check through a *Command window for the screenshot
  await page.evaluate(() => os.cli.run('InetStat -r'));
  await page.waitForTimeout(500);
  await shot(page, 'internet');
};
