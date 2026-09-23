// node tests/core/shot.mjs <name> [actions.mjs]   (env: W H ZOOM CLIP=x,y,w,h WAIT QS)
import fs from 'fs';
import path from 'path';
import { launch, BASE_URL as BASE, SHOTS } from './pw.mjs';
const [,, name = 'shot', script] = process.argv;
const { browser, page, logs } = await launch({ width: +(process.env.W || 1024), height: +(process.env.H || 768), zoom: +(process.env.ZOOM || 1) });
await page.goto(BASE + '?fast=1' + (process.env.QS ? '&' + process.env.QS : ''));
await page.waitForFunction(() => window.os?.ready, null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(+(process.env.WAIT || 800));
if (script) { const fn = (await import(path.resolve(script) + '?' + Date.now())).default; await fn(page); }
const opts = { path: path.join(SHOTS, name + '.png') };
if (process.env.CLIP) { const [x, y, width, height] = process.env.CLIP.split(',').map(Number); opts.clip = { x, y, width, height }; }
await page.screenshot(opts);
if (logs.length) console.log(logs.join('\n'));
await browser.close();
