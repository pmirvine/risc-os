// node tests/draw/run.mjs <scenario> [...]   screenshots -> tests/screens/draw-<scenario>.png
// env: PLAYWRIGHT_MODULE (see tests/core/pw.mjs), URL
import path from 'path';
import { launch, BASE_URL as BASE, SHOTS } from '../core/pw.mjs';
const names = process.argv.slice(2);
const { browser, page, logs } = await launch({ width: 1280, height: 1024 });
await page.goto(BASE + '?fast=1');
await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
await page.waitForTimeout(500);
const mod = await import('./scenarios.mjs?' + Date.now());
for (const n of names) {
  try {
    const clip = await mod[n](page);
    await page.screenshot({ path: path.join(SHOTS, `draw-${n}.png`), ...(clip ? { clip } : {}) });
    console.log('ok', n);
  } catch (e) { console.log('FAIL', n, e.message); }
}
if (logs.length) console.log(logs.filter((l) => !/favicon/.test(l)).join('\n'));
await browser.close();
