#!/usr/bin/env node
// Screenshots of the tutorial's example programs for the book (tools/jstutor/pics/<shot>.png), from the entries
// in tools/jstutor/examples.json that have a "shot". Needs the desktop served (node serve.mjs) and the disc
// built (node tools/disc-jstutor.mjs). Re-run disc-jstutor.mjs afterwards to put the pictures in the book.
//   Usage: node tools/jstutor/shots.mjs [name ...]      (default: all)
import path from 'node:path';
import { launch, BASE_URL } from '../../tests/core/pw.mjs';
import { ROOT, list, prepare, runExample, finish } from './harness.mjs';

const only = process.argv.slice(2);
const { browser, page } = await launch({ width: 1024, height: 768 });
await page.goto(BASE_URL + '?fast=1');
await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
await prepare(page);
let bad = 0;
for (const e of list().filter((x) => x.shot && (!only.length || only.includes(x.shot)))) {
  const r = await runExample(page, e);
  if (r.msgs.length) { console.log(`FAIL ${e.shot}: ${r.msgs.join('; ')}`); bad++; }
  const file = path.join(ROOT, 'tools/jstutor/pics', e.shot + '.png');
  const pad = 4;
  if (e.shotAll || !r.rect) await page.screenshot({ path: file });
  else await page.screenshot({ path: file, clip: { x: Math.max(0, r.rect.x - pad), y: Math.max(0, r.rect.y - pad), width: r.rect.x1 - r.rect.x + 2 * pad, height: r.rect.y1 - r.rect.y + 2 * pad } });
  console.log(`${e.shot}.png`);
  await finish(page);
  await page.waitForTimeout(200);
}
await browser.close();
process.exit(bad ? 1 : 0);
