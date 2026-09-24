// BASIC programs from the Filer: Examples.Spiral (single tasking, full screen) and
// Examples.!Doodle (a BASIC Wimp application).   (server on 8371; PLAYWRIGHT_MODULE=...)
import path from 'path';
import { launch, BASE_URL, SHOTS } from '../core/pw.mjs';

const { browser, page, logs } = await launch({ width: 1024, height: 768 });
const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });
let fail = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fail++; };
await page.goto(BASE_URL + '?fast=1');
await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
await page.evaluate(() => window.os.filer.openDir('ADFS::HardDisc4.$.Examples', { x: 80, y: 80, w: 360, h: 140 }));
await page.waitForTimeout(700);
await shot('bw-examples');
// ---- single tasking
await page.locator('.win .icon', { hasText: 'Spiral' }).first().dblclick();
await page.waitForFunction(() => document.querySelector('.fullscreen-program'), null, { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(2500);
check(await page.evaluate(() => !!document.querySelector('.fullscreen-program')), 'Spiral took over the screen');
await shot('bw-spiral');
await page.keyboard.press('Space');
await page.waitForTimeout(600);
check(await page.evaluate(() => !document.querySelector('.fullscreen-program')), 'SPACE returns to the desktop');
// ---- Wimp application
await page.locator('.win .icon', { hasText: '!Doodle' }).first().dblclick();
await page.waitForFunction(() => window.wimp.tasks.some((t) => t.name === 'Doodle'), null, { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(600);
check(await page.evaluate(() => window.wimp.tasks.some((t) => t.name === 'Doodle')), 'Doodle task started');
const ib = await page.evaluate(() => { const it = window.wimp.iconbar.items.find((i) => i.task?.name === 'Doodle'); const r = it.icon.el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.click(ib.x, ib.y);
await page.waitForTimeout(700);
const wr = await page.evaluate(() => { const w = [...window.wimp.windows].find((w) => w.task?.name === 'Doodle' && w.isOpen); if (!w) return null; const r = w.view.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, title: w.title }; });
check(!!wr, 'Doodle window open: ' + wr?.title);
if (wr) {
  for (const [dx, dy] of [[100, 150], [220, 200], [300, 130]]) { await page.mouse.click(wr.x + dx, wr.y + dy); await page.waitForTimeout(250); }
  await page.mouse.click(wr.x + 150, wr.y + 250, { button: 'right' });     // right = Menu by default? (default config: right = Menu)
  await page.waitForTimeout(600);
  await shot('bw-doodle-menu');
  check(await page.evaluate(() => window.wimp.menus.isOpen), 'Doodle menu open');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await shot('bw-doodle');
}
console.log(logs.filter((l) => /error|PAGEERROR/i.test(l)).join('\n'));
await browser.close();
process.exit(fail ? 1 : 0);
