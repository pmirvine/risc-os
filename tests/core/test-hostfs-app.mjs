// !HostFS ($.Utilities.!HostFS) and the mounts it manages: no permanent HostFS icon on the left; the application
// on the right while it runs; its Mounts window (open, dismount, mount, "Mount at start-up"); a dismounted folder
// remembered but not mounted at start-up; the start-up choice kept across a reload; mounts staying after it quits.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './pw.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const PORT = 8300 + Math.floor(Math.random() * 60);
const URL0 = `http://localhost:${PORT}/`;
const mk = (name) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), `hostfs-${name}-`)); fs.writeFileSync(path.join(d, 'Hello.txt'), name); return d; };
const a = mk('Work'), b = mk('Photos');
const server = spawn(process.execPath, ['serve.mjs', String(PORT), '--host', `Work=${a}`, '--host-ro', `Photos=${b}`], { cwd: ROOT, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(URL0)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 100)); }

const res = [];
const ok = (name, v, detail) => res.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail)}`);
const { browser, page, logs } = await launch();
const until = async (fn, arg, ms = 10000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await page.evaluate(fn, arg).catch(() => null);
    if (v || Date.now() - t0 > ms) return v;
    await page.waitForTimeout(100);
  }
};
const icons = () => page.evaluate(() => os.iconbar.items.map((i) => `${i.side}:${i.text ?? i.sprite}`));
try {
  await page.goto(URL0 + '?fast=1');
  await page.evaluate(async () => { await new Promise((r) => { const t = setInterval(() => { if (window.os?.hostfs) { clearInterval(t); r(); } }, 50); }); await os.hostfs.hostfs.store.clear(); });
  await page.reload();
  await until(() => os.hostfs?.slots.filter((s) => s.state === 'mounted').length === 2);
  let ic = await icons();
  ok('no HostFS icon on the left, only the mounted folders', !ic.includes('left:HostFS') && ic.includes('left:Work') && ic.includes('left:Photos'), ic);

  // the application, from Utilities
  await page.evaluate(() => os.cli.run('Run ADFS::HardDisc4.$.Utilities.!HostFS'));
  ok('!HostFS runs from $.Utilities with its icon on the right', await until(() => os.iconbar.items.some((i) => i.side === 'right' && i.sprite === '!hostfs')));
  await page.evaluate(() => { window.HA = () => os.wimp.tasks.find((t) => t.name === 'HostFS').hostfsApp; HA().showMounts(); });
  const rows = await until(() => HA().win?.isOpen && os.hostfs.list().map((m) => `${m.name}:${m.kind}:${m.state}:${m.startup}`).join());
  ok('the Mounts window lists the mounts', rows === 'Photos:server:mounted:true,Work:server:mounted:true', rows);
  const texts = await page.evaluate(() => HA().win.icons.filter(Boolean).map((i) => i.text).join('|'));
  ok('with their kind and state', /Work\|Server folder\|Mounted/.test(texts) && /Photos\|Server folder \(read-only\)\|Mounted/.test(texts), texts);

  // Dismount from the window: remembered, not mounted at start-up
  await page.evaluate(() => { HA().select('server:Photos'); const d = HA().win.icons.find((i) => i?.name === 'dismount'); HA().win.emit('click', { button: 'select', icon: d }); });
  ok('Dismount: its icon goes, it stays in the list, not at start-up', await until(() => {
    const m = os.hostfs.list().find((x) => x.id === 'server:Photos');
    return !os.iconbar.items.some((i) => i.text === 'Photos') && m?.state === 'dismounted' && m.startup === false;
  }), await page.evaluate(() => os.hostfs.list()));

  // the start-up choice for Work: off, kept across a reload
  await page.evaluate(() => { const opt = HA().win.icons.find((i) => i?._startup?.id === 'server:Work'); HA().win.emit('click', { button: 'select', icon: opt }); });
  ok('the Mount-at-start-up option', await until(() => os.hostfs.list().find((x) => x.id === 'server:Work')?.startup === false));
  // quitting !HostFS leaves the mounts
  await page.evaluate(() => os.wimp.tasks.find((t) => t.name === 'HostFS').quit());
  ic = await icons();
  ok('quitting !HostFS: its icon goes, the mounts stay', !ic.some((x) => x.startsWith('right:!hostfs')) && ic.includes('left:Work') && !(await page.evaluate(() => !!os.vfs.exists('HostFS::Photos.$'))), ic);

  await page.reload();
  await page.waitForFunction(() => window.os?.ready && os.hostfs, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => ({ slots: os.hostfs.slots.map((s) => s.name), list: os.hostfs.list().map((m) => `${m.name}:${m.state}:${m.startup}`) }));
  ok('after a reload: neither is mounted, both remembered', !after.slots.length && after.list.join() === 'Photos:dismounted:false,Work:dismounted:false', after);

  // Mount at start-up back on, Mount from the list
  await page.evaluate(async () => { await os.hostfs.setStartup('server:Work', true); await os.hostfs.mountRemembered('server:Photos'); });
  ok('Mount from the list', await until(() => os.hostfs.slots.some((s) => s.name === 'Photos' && s.state === 'mounted')));
  await page.reload();
  await until(() => os.hostfs?.slots.some((s) => s.name === 'Work' && s.state === 'mounted'));
  const again = await page.evaluate(() => os.hostfs.slots.map((s) => s.name).join());
  ok('Mount at start-up turned on again: mounted after a reload (and the other not)', again === 'Work', again);

  // the left icon's menu has the choice too
  const menu = await page.evaluate(() => { const i = os.iconbar.items.find((x) => x.text === 'Work'); return i.menu().items.map((x) => x.text).join(); });
  ok('a mount\'s icon menu: Mount at start-up, Dismount', /Mount at start-up/.test(menu) && /Dismount/.test(menu), menu);
  await page.evaluate(async () => { await os.hostfs.hostfs.store.clear(); });
} catch (e) {
  res.push(`FAIL exception ${e.stack ?? e}`);
} finally {
  console.log(res.join('\n'));
  const errs = logs.filter((l) => /PAGEERROR/.test(l));
  if (errs.length) console.log(errs.join('\n'));
  await browser.close();
  server.kill();
  fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true });
}
