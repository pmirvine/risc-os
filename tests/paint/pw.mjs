// node tests/paint/pw.mjs <script.mjs> - run a Paint test script against the desktop.
// Script default export: async (page, h) => {}; h = helpers. Screenshots go to tests/screens/.
import path from 'path';
import { launch, BASE_URL, SHOTS } from '../core/pw.mjs';
const script = process.argv[2];
const { browser, page, logs } = await launch({ width: +(process.env.W || 1024), height: +(process.env.H || 768) });
await page.goto(BASE_URL + '?fast=1');
await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(600);
const h = {
  shot: async (name, clip) => page.screenshot({ path: path.join(SHOTS, `paint-${name}.png`), ...(clip ? { clip } : {}) }),
  start: async () => { await page.evaluate(() => os.apps.start('Paint')); await page.waitForTimeout(500); },
  // Paint's app object is not global: reach it through the task
  eval: (fn, arg) => page.evaluate(fn, arg),
  menuItem: async (level, idx) => page.locator('.menu').nth(level).locator('.mitem').nth(idx).boundingBox(),
  async hoverArrow(level, idx) { const b = await this.menuItem(level, idx); await page.mouse.move(b.x + 20, b.y + 10, { steps: 2 }); await page.mouse.move(b.x + b.width - 6, b.y + 10, { steps: 3 }); await page.waitForTimeout(250); },
  async clickItem(level, idx, button = 'left') { const b = await this.menuItem(level, idx); await page.mouse.click(b.x + 30, b.y + 10, { button }); await page.waitForTimeout(150); },
  logs,
};
try {
  const fn = (await import(path.resolve(script) + '?' + Date.now())).default;
  await fn(page, h);
} catch (e) { console.log('SCRIPT ERROR', e); }
const errs = logs.filter((l) => /error|PAGEERROR/i.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
