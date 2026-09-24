// Original !SciCalc (tokenised BASIC !RunImage) through the BASIC Wimp bridge.
//   PLAYWRIGHT_MODULE=.../playwright/index.mjs node tests/bw/bw-scicalc.mjs   (server on 8371)
import path from 'path';
import { launch, BASE_URL, SHOTS } from '../core/pw.mjs';

const { browser, page, logs } = await launch({ width: 1024, height: 768 });
const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });
let fail = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fail++; };
await page.goto(BASE_URL + '?fast=1');
await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
await page.waitForTimeout(300);
// a copy of the original application, so that the native JS SciCalc doesn't claim it
await page.evaluate(async () => {
  const { vfs } = window.os;
  if (!vfs.exists('RAM::RamDisc0.$.!SciCalc')) await vfs.copy('ADFS::HardDisc4.$.Apps.!SciCalc', 'RAM::RamDisc0.$.!SciCalc');
  window.os.filer.openDir('RAM::RamDisc0.$', { x: 60, y: 60, w: 300, h: 150 });
});
await page.waitForTimeout(500);
// double-click the copy in the Filer window
const icon = page.locator('.win .icon', { hasText: '!SciCalc' }).first();
await icon.dblclick();
await page.waitForFunction(() => window.wimp.tasks.some((t) => t.name === 'SciCalc' && t.basicProcess), null, { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(800);
check(await page.evaluate(() => window.wimp.tasks.some((t) => t.name === 'SciCalc' && t.basicProcess)), 'SciCalc runs as a BASIC Wimp task');
await shot('bw-scicalc-iconbar');
// click the icon bar icon: opens the calculator
await page.evaluate(() => {
  const it = window.wimp.iconbar.items.find((i) => i.task?.basicProcess);
  window.__ib = it;
});
const box = await page.evaluate(() => { const r = window.__ib.icon.el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.click(box.x, box.y);
await page.waitForTimeout(1000);
const calc = await page.evaluate(() => [...window.wimp.windows].find((w) => w.task?.basicProcess && w.isOpen && w.icons.length > 20)?.title ?? null);
check(!!calc, 'calculator window open: ' + calc);
await shot('bw-scicalc');
// type a sum with the keyboard: 12*34=
for (const k of ['1', '2', '*', '3', '4', '=']) { await page.keyboard.press(k); await page.waitForTimeout(80); }
await page.waitForTimeout(600);
await shot('bw-scicalc-sum');
// click some buttons: C, 7, +, 8, =
const clickIcon = async (n) => {
  const r = await page.evaluate((t) => {
    const w = [...window.wimp.windows].find((w) => w.task?.basicProcess && w.isOpen && w.icons.length > 20);
    const ic = w?.icons[t];
    if (!ic) return null;
    const b = ic.el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }, n);
  if (r) { await page.mouse.click(r.x, r.y); await page.waitForTimeout(120); }
  return !!r;
};
check(await clickIcon(18), 'button C');
check(await clickIcon(7), 'button 7');
await clickIcon(15); await clickIcon(8); await clickIcon(16);
await page.waitForTimeout(500);
await shot('bw-scicalc-click');
// icon bar menu (built by the program with Wimp_CreateMenu)
await page.mouse.click(box.x, box.y, { button: 'middle' });
await page.waitForTimeout(600);
await shot('bw-scicalc-menu');
check(await page.evaluate(() => window.wimp.menus.isOpen), 'menu opened by the program');
console.log(logs.filter((l) => /error|PAGEERROR|warn/i.test(l)).join('\n'));
console.log('late output:', await page.evaluate(() => [...window.bwProcesses ?? []].map((p) => p.lateOutput).join('|')));
await browser.close();
process.exit(fail ? 1 : 0);
