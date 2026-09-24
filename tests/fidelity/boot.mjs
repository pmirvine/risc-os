// Boot sequence screenshots: kernel start-up text, Desktop banner, desktop.
// node tests/fidelity/boot.mjs  -> tests/screens/fid-boot-<ms>.png
import path from 'path';
import { launch, BASE_URL, SHOTS } from '../core/pw.mjs';
const { browser, page, logs } = await launch({ width: +(process.env.W || 800), height: +(process.env.H || 600) });
const t0 = Date.now();
await page.goto(BASE_URL);
for (const ms of [700, 2500, 4500, 7000]) {
  await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
  await page.screenshot({ path: path.join(SHOTS, `fid-boot-${ms}.png`) });
}
console.log('ready:', await page.evaluate(() => !!window.os?.ready), 'banner:', await page.locator('.desktop-banner').count());
if (logs.length) console.log(logs.join('\n'));
await browser.close();
