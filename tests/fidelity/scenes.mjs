// Fidelity screenshots: node tests/fidelity/scenes.mjs [filter...]
// Takes one screenshot per scene into tests/screens/fid-<scene>.png (fresh page per scene).
// env: W, H (viewport, default 1024x768), ZOOM (deviceScaleFactor), PLAYWRIGHT_MODULE, URL.
import path from 'path';
import { launch, BASE_URL, SHOTS } from '../core/pw.mjs';

const W = +(process.env.W || 1024), H = +(process.env.H || 768);
const ibIcon = async (page, n) => page.locator('.ibicon').nth(n).boundingBox();
const clickIb = async (page, n, button = 'left') => { const b = await ibIcon(page, n); await page.mouse.click(b.x + b.width / 2, b.y + 12, { button }); await page.waitForTimeout(400); };
const lastIb = async (page) => (await page.locator('.ibicon').count()) - 1;
const openHD = async (page, mode) => {
  await page.evaluate((mode) => os.filer.openDir('ADFS::HardDisc4.$', mode ? { mode } : {}), mode);
  await page.waitForTimeout(400);
};
const hover = async (page, text, dx = -6) => {
  const it = page.locator('.menu .mitem', { hasText: text }).first();
  const b = await it.boundingBox();
  await page.mouse.move(b.x + b.width + dx, b.y + b.height / 2, { steps: 3 });
  await page.waitForTimeout(350);
};

export const scenes = {
  desktop: async () => {},
  'filer-large': async (p) => { await clickIb(p, 1); },
  'filer-small': async (p) => { await openHD(p, 'small'); },
  'filer-full': async (p) => { await openHD(p, 'full'); },
  'filer-select': async (p) => {
    await clickIb(p, 1);
    const w = await p.locator('.win.filer').first().boundingBox();
    await p.mouse.click(w.x + 50, w.y + 60);
    await p.mouse.click(w.x + 145, w.y + 120, { modifiers: ['Shift'] });
    await p.waitForTimeout(300);
  },
  'filer-menu': async (p) => {
    await clickIb(p, 1);
    const w = await p.locator('.win.filer').first().boundingBox();
    await p.mouse.click(w.x + 50, w.y + 60);
    await p.mouse.click(w.x + 240, w.y + 200, { button: 'right' });
    await p.waitForTimeout(300);
    await hover(p, 'Display');
  },
  'filer-menu2': async (p) => {
    await clickIb(p, 1);
    const w = await p.locator('.win.filer').first().boundingBox();
    await p.mouse.click(w.x + 240, w.y + 200, { button: 'right' });
    await p.waitForTimeout(300);
    await hover(p, 'Options');
  },
  'ib-hd-menu': async (p) => { await clickIb(p, 1, 'right'); },
  'ib-tm-menu': async (p) => { await clickIb(p, await lastIb(p), 'right'); },
  'taskmanager': async (p) => { await clickIb(p, await lastIb(p)); },
  'saveas': async (p) => {
    await p.evaluate(() => { const b = os.dialogs.saveAs({ filename: 'TextFile', filetype: 0xFFF, getData: async () => '' }); b.openCentred(); });
    await p.waitForTimeout(300);
  },
  'info': async (p) => {
    await clickIb(p, await lastIb(p), 'right');
    await hover(p, 'Info');
  },
  'error': async (p) => {
    await p.evaluate(() => { os.dialogs.reportError("File 'Wibble' not found", { appName: 'Filer' }); });
    await p.waitForTimeout(300);
  },
  'error-plain': async (p) => {
    await p.evaluate(() => { os.dialogs.reportError('Not enough memory'); });
    await p.waitForTimeout(300);
  },
  'query': async (p) => {
    await p.evaluate(() => { os.dialogs.query({ title: 'Edit', message: 'This file has been modified. Discard changes?', buttons: ['Discard', 'Cancel'] }); });
    await p.waitForTimeout(300);
  },
  'configure': async (p) => { await p.evaluate(() => os.apps.start('Configure')); await p.waitForTimeout(1200); },
  'draw': async (p) => { await p.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Tutorials.DrawTutor.Sign')); await p.waitForTimeout(2000); },
  'paint': async (p) => { await p.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Tutorials.PaintTutor.Flower')); await p.waitForTimeout(2000); },
  'edit': async (p) => { await p.evaluate(() => os.filer.run('ADFS::HardDisc4.$.ReadMe')); await p.waitForTimeout(2000); },
  'minehunt': async (p) => { await p.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Diversions.!MineHunt')); await p.waitForTimeout(2000); await clickIb(p, await lastIb(p) - 0); },
  'patience': async (p) => { await p.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Diversions.!Patience')); await p.waitForTimeout(2500); },
  'f12': async (p) => { await p.keyboard.press('F12'); await p.waitForTimeout(300); await p.keyboard.type('cat'); await p.keyboard.press('Enter'); await p.waitForTimeout(500); },
  'writable-shaded': async (p) => {
    await p.evaluate(async () => {
      const t = wimp.createTask('Test');
      const w = t.createWindow({ title: 'Shading test', x: 100, y: 100, w: 360, h: 170, flags: { title: true, close: true, back: true, moveable: true }, icons: [
        { x: 10, y: 10, w: 150, h: 26, text: 'Writable', button: 'writable', border: true, filled: true, bg: 0, validation: 'R7' },
        { x: 180, y: 10, w: 150, h: 26, text: 'Shaded wr', button: 'writable', border: true, filled: true, bg: 0, validation: 'R7', shaded: true },
        { x: 10, y: 50, w: 150, h: 26, text: 'Plain bdr', button: 'writable', border: true, filled: true, bg: 0 },
        { x: 180, y: 50, w: 150, h: 26, text: 'Plain shaded', button: 'writable', border: true, filled: true, bg: 0, shaded: true },
        { x: 10, y: 90, w: 110, h: 30, text: 'Action', button: 'click', border: true, filled: true, bg: 1, validation: 'R5,3' },
        { x: 130, y: 90, w: 110, h: 30, text: 'Shaded', button: 'click', border: true, filled: true, bg: 1, validation: 'R5,3', shaded: true },
        { x: 250, y: 90, w: 100, h: 30, text: 'OK', button: 'click', border: true, filled: true, bg: 1, validation: 'R6,3' },
        { x: 10, y: 130, w: 150, h: 26, text: 'Option', sprite: 'optoff', button: 'radio', validation: 'Soptoff,opton', selected: true },
        { x: 180, y: 130, w: 150, h: 26, text: 'Shaded opt', sprite: 'optoff', button: 'radio', validation: 'Soptoff,opton', shaded: true, selected: true },
      ] });
      w.open();
      wimp.setCaret(w, w.icons[0], 3);
    });
    await p.waitForTimeout(300);
  },
  'rubber': async (p) => {
    await clickIb(p, 1);
    const w = await p.locator('.win.filer').first().boundingBox();
    await p.mouse.move(w.x + 300, w.y + 250);
    await p.mouse.down();
    await p.mouse.move(w.x + 120, w.y + 90, { steps: 8 });
    await p.waitForTimeout(200);
  },
  'filedrag': async (p) => {
    await clickIb(p, 1);
    const w = await p.locator('.win.filer').first().boundingBox();
    await p.mouse.move(w.x + 50, w.y + 40);
    await p.mouse.down();
    await p.mouse.move(w.x + 500, w.y + 90, { steps: 8 });
    await p.waitForTimeout(200);
  },
};

const want = process.argv.slice(2);
const { browser, page, logs } = await launch({ width: W, height: H, zoom: +(process.env.ZOOM || 1) });
for (const [name, fn] of Object.entries(scenes)) {
  if (want.length && !want.some((w) => name.includes(w))) continue;
  await page.goto(BASE_URL + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  try { await fn(page); } catch (e) { console.log(name, 'FAILED', e.message); }
  await page.screenshot({ path: path.join(SHOTS, 'fid-' + name + '.png') });
  await page.mouse.up().catch(() => {});
  console.log('shot', name);
}
if (logs.length) console.log(logs.filter((l) => !l.startsWith('log')).join('\n'));
await browser.close();
