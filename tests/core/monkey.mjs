// Random clicking/dragging/typing to shake out exceptions: node tests/core/monkey.mjs [steps]
import { launch, BASE_URL } from './pw.mjs';
const steps = +(process.argv[2] || 300);
const { browser, page, logs } = await launch();
await page.goto(BASE_URL + '?fast=1');
await page.waitForFunction(() => window.os?.ready, null, { timeout: 15000 });
await page.evaluate(() => { os.filer.openDir('ADFS::HardDisc4.$'); os.filer.openDir('RAM::RamDisc0.$', { x: 500, y: 300 }); os.apps.start('Example'); });
let seed = +(process.argv[3] || 12345);
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const buttons = ['left', 'left', 'left', 'right', 'middle'];
for (let i = 0; i < steps; i++) {
  const x = rnd(1024), y = rnd(768);
  const k = rnd(10);
  try {
    if (k < 5) await page.mouse.click(x, y, { button: buttons[rnd(buttons.length)] });
    else if (k < 6) await page.mouse.dblclick(x, y);
    else if (k < 8) { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(rnd(1024), rnd(768), { steps: 5 }); await page.mouse.up(); }
    else if (k < 9) await page.keyboard.press(['Escape', 'Enter', 'ArrowDown', 'a', 'Tab', 'Backspace'][rnd(6)]);
    else await page.mouse.move(x, y, { steps: 3 });
  } catch (e) { logs.push('driver: ' + e.message); }
  // dismiss full-screen things
  if (i % 50 === 49) await page.evaluate(() => { if (os.cli.active) os.cli.close(); if (wimp.modal) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
}
await page.screenshot({ path: 'tests/screens/monkey.png' });
const errs = logs.filter((l) => /PAGEERROR|error/i.test(l));
console.log(errs.length ? errs.slice(0, 20).join('\n') : 'no errors');
await browser.close();
