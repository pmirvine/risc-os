// *Configure Floppies (!Configure's Floppies window) decides at start-up whether the floppy drive icon is on
// the icon bar: node tests/core/test-floppies.mjs
import { launch, BASE_URL } from './pw.mjs';

const { browser, page, logs } = await launch();
const out = [];
const ok = (name, cond, extra = '') => out.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`);
const boot = async () => {
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 15000 });
  await page.waitForTimeout(300);
};
const floppyIcon = () => page.evaluate(() => wimp.iconbar.items.some((i) => i.sprite === 'floppydisc'));

try {
  await boot();
  ok('default: the floppy icon is on the icon bar', await floppyIcon());
  await page.evaluate(() => os.config.set('Floppies', 0));
  ok('*Configure Floppies 0 is stored', await page.evaluate(() => os.config.values.floppies === 0));
  await boot();
  ok('Floppies 0: no floppy icon after a restart', !(await floppyIcon()));
  ok('Floppies 0: the hard disc icon is still there', await page.evaluate(() => wimp.iconbar.items.some((i) => i.sprite === 'harddisc')));
  await page.evaluate(() => os.config.set('Floppies', 1));
  await boot();
  ok('Floppies 1: the floppy icon is back after a restart', await floppyIcon());
} catch (e) { out.push('FAIL exception ' + e.stack); }

console.log(out.join('\n'));
if (logs.some((l) => /PAGEERROR/.test(l))) console.log(logs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) ? 1 : 0;
