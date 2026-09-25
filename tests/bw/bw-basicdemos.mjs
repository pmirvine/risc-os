// $.Demos.BASIC from the Filer (tools/disc-basicdemos.mjs): double-click Plasma and Sprites (single
// tasking, full screen), WimpClock (a Wimp task through the bridge), and Shift-double-click a program
// to load it into Edit. Screenshots: tests/screens/demo-*.png.   (server on 8371)
import path from 'path';
import { launch, BASE_URL, SHOTS } from '../core/pw.mjs';
import { filerItem } from '../edit/ui.mjs';

const DIR = 'ADFS::HardDisc4.$.Demos.BASIC';
const { browser, page, logs } = await launch({ width: 1024, height: 768, buttons: 'acorn' });   // Shift-double-click is Shift-Select only with the Acorn mapping
const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });
let fail = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fail++; };
const fullScreen = () => page.evaluate(() => !!document.querySelector('.fullscreen-program'));
const dbl = async (leaf, shift = false) => {
  const p = await filerItem(page, DIR, leaf, { x: 60, y: 60, w: 620, h: 300 });
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.dblclick(p.x, p.y);
  if (shift) await page.keyboard.up('Shift');
};
/** Run a full-screen demo for ms, screenshot it, stop it with Escape and return with SPACE. */
async function fullScreenDemo(leaf, ms, name) {
  await dbl(leaf);
  await page.waitForFunction(() => document.querySelector('.fullscreen-program'), null, { timeout: 10000 }).catch(() => {});
  check(await fullScreen(), `${leaf} took over the screen`);
  await page.waitForTimeout(ms);
  await shot(name);
  const err = await page.evaluate(() => [...(window.bwProcesses ?? [])].flatMap((p) => p.errors.filter((e) => !/Escape/.test(e.message)).map((e) => `${e.message} at line ${e.line}`)));
  check(!err.length, `${leaf} ran without errors ${err.join('; ')}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await page.keyboard.press('Space');
  await page.waitForTimeout(700);
  check(!(await fullScreen()), `${leaf}: Escape then SPACE returns to the desktop`);
}

await page.goto(BASE_URL + '?fast=1');
await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
await page.evaluate((d) => window.os.filer.openDir(d, { x: 60, y: 60, w: 620, h: 300 }), DIR);
await page.waitForTimeout(800);
const names = await page.evaluate((d) => [...window.os.filer.viewers.values()].find((v) => /Demos\.BASIC$/i.test(v.path))?.items.map((i) => i.name) ?? [], DIR);
check(names.length === 28 && names.includes('ReadMe') && names.includes('WimpClock'), `Filer lists $.Demos.BASIC (${names.length} items)`);
await shot('demo-filer');

await fullScreenDemo('Plasma', 2500, 'demo-plasma');
await fullScreenDemo('Sprites', 2500, 'demo-sprites');
await fullScreenDemo('Fire', 2500, 'demo-fire');

// ---- MouseTest: what a program sees for each button (Acorn mapping: right = Adjust, Ctrl+left = Menu)
await dbl('MouseTest');
await page.waitForFunction(() => document.querySelector('.fullscreen-program'), null, { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(1200);
const seen = () => page.evaluate(() => { const p = [...(window.bwProcesses ?? [])].pop(); const m = p?.machine; return m ? { b: m.mb, keys: [9, 10, 11].filter((k) => m.keysDown.has(k)).join() } : null; });
for (const [what, press, want, keys] of [
  ['left', async () => page.mouse.down(), 4, '9'],
  ['middle', async () => page.mouse.down({ button: 'middle' }), 2, '10'],
  ['right', async () => page.mouse.down({ button: 'right' }), 1, '11'],
  ['Ctrl+left', async () => { await page.keyboard.down('Control'); await page.mouse.down(); }, 2, '10'],
]) {
  await page.mouse.move(512, 300);
  await press(); await page.waitForTimeout(250);
  const s = await seen();
  if (what === 'right') await shot('demo-mousetest');
  await page.mouse.up({ button: what === 'middle' ? 'middle' : what === 'right' ? 'right' : 'left' }); await page.keyboard.up('Control');
  await page.waitForTimeout(150);
  check(s?.b === want && s?.keys === keys, `MouseTest: ${what} reads as b=${want}, INKEY key ${keys} (got b=${s?.b}, keys ${s?.keys})`);
}
const after = await seen();
check(after?.b === 0 && after?.keys === '', `MouseTest: no buttons held after release (b=${after?.b}, keys ${after?.keys})`);
await page.keyboard.press('q'); await page.waitForTimeout(600);
await page.keyboard.press('Space'); await page.waitForTimeout(700);
check(!(await fullScreen()), 'MouseTest: Q then SPACE returns to the desktop');

// ---- WimpClock: a desktop task
await dbl('WimpClock');
await page.waitForFunction(() => window.wimp.tasks.some((t) => t.name === 'WimpClock'), null, { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(2500);
check(await page.evaluate(() => window.wimp.tasks.some((t) => t.name === 'WimpClock')), 'WimpClock is a desktop task');
check(!(await fullScreen()), 'WimpClock did not take the screen');
const win = await page.evaluate(() => { const w = [...window.wimp.windows].find((q) => q.task?.name === 'WimpClock' && q.isOpen); return w ? w.title : null; });
check(win === 'Clock', `WimpClock window open (${win})`);
await shot('demo-wimpclock');
const ib = await page.evaluate(() => window.wimp.iconbar.items.some((i) => i.task?.name === 'WimpClock'));
check(ib, 'WimpClock icon on the icon bar');

// ---- Shift-double-click: the listing in Edit
await dbl('Snake', true);
await page.waitForTimeout(1500);
const edit = await page.evaluate(() => [...window.wimp.windows].some((w) => w.isOpen && /Snake/.test(w.title ?? '') && !/Filer/.test(w.task?.name ?? '')));
check(edit, 'Shift-double-click opens Snake in Edit');
const viewerOpen = await page.evaluate(() => [...window.os.filer.viewers.values()].some((v) => /Demos\.BASIC$/i.test(v.path) && v.win?.isOpen));
check(viewerOpen, 'Shift-double-click leaves the Filer viewer open (only Adjust closes it)');
await shot('demo-edit');

// quit WimpClock (Message_Quit, as the Task Manager does)
await page.evaluate(() => { const t = window.wimp.tasks.find((q) => q.name === 'WimpClock'); t?.quit?.(); });
await page.waitForTimeout(500);
console.log(logs.filter((l) => /PAGEERROR|error/i.test(l) && !/favicon/.test(l)).join('\n'));
await browser.close();
process.exit(fail ? 1 : 0);
