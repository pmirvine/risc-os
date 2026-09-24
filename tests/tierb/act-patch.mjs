// !Patch: launch from the Filer (Utilities.Patches), drop a directory of synthetic applications on its icon,
// apply the PocketFS patch (Copy transform: real byte patch on the virtual disc), then remove it again.
// The !Advance patch needs the Squeeze transform: UnSqueeze reports that the image isn't squeezed.
import path from 'path';
import { SHOTS } from '../core/pw.mjs';
import { filerOpen, iconbarPos, check } from '../edit/ui.mjs';

const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, `tierB-patch-${n}.png`) });
const APPS = 'RAM::RamDisc0.$.Apps';

export default async (page) => {
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  // synthetic targets on the RAM disc
  await page.evaluate((APPS) => {
    const v = os.vfs;
    v.mkdir(APPS, { parents: true });
    v.mkdir(APPS + '.!PocketFS'); v.mkdir(APPS + '.!Advance');
    const img = (n) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (i * 7) & 255; return b; };
    const put = (b, at, w) => new DataView(b.buffer).setUint32(at, w, true);
    const p = img(0x2000);
    put(p, 0x4F0, 0xE58C0024); put(p, 0x4F4, 0xE3E00000); put(p, 0x1C48, 0xE3300000);
    v.writeFile(APPS + '.!PocketFS.!RunImage', p, { filetype: 0xFF8 });
    const a = img(0x4000);
    put(a, 0, 0xFB000000); put(a, 16, 0xEF000011);                  // an AIF image that isn't squeezed
    v.writeFile(APPS + '.!Advance.!RunImage', a, { filetype: 0xFF8 });
  }, APPS);

  // launch from the Filer
  await filerOpen(page, 'ADFS::HardDisc4.$.Utilities.Patches', '!Patch', { wait: 1500 });
  const st = await page.evaluate(() => {
    const t = os.apps.tasksOf('Patch')[0];
    return t && { apps: t.patch.patcher.apps.map((a) => `${a.name}:${a.desc}:${a.patches.map((p) => p.desc).join('|')}`), transforms: t.patch.patcher.transforms.length, type: os.sysvars.get('File$Type_FC3') };
  });
  check('patch running', !!st, JSON.stringify(st));
  check('patch files read', st?.apps.length === 2 && st.apps.some((a) => a.startsWith('!PocketFS:Link to PocketBook')), JSON.stringify(st?.apps));
  check('transforms read', st?.transforms === 1);
  check('File$Type_FC3', st?.type === 'Patch');
  const ib = await iconbarPos(page, 'Patch');
  check('icon bar icon', !!ib);

  // click the icon: the (empty) target window
  await page.mouse.click(ib.x, ib.y);
  await page.waitForTimeout(400);
  await shot(page, 'empty');

  // drop the directory of applications on the icon bar icon (drag from a Filer window)
  await page.evaluate(() => os.filer.openDir('RAM::RamDisc0.$', { x: 60, y: 420, w: 300, h: 150 }));
  await page.waitForTimeout(400);
  const src = await page.evaluate(() => {
    const v = [...os.filer.viewers.values()].find((q) => /RamDisc0\.\$$/i.test(q.path));
    v.win.open({ behind: 'top' });
    const i = v.items.findIndex((it) => it.name === 'Apps');
    const r = v.hotRect(i);
    return v.win.workToScreen((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
  });
  await page.mouse.move(src.x, src.y);
  await page.mouse.down();
  await page.mouse.move(src.x + 20, src.y + 20, { steps: 4 });
  await page.mouse.move(ib.x, ib.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
  // the !Advance check reports UnSqueeze's error: take a picture, then OK
  const errText = await page.evaluate(() => [...wimp.windows].find((w) => w._errorBox && w.isOpen)?.icons[0]?.text ?? null);
  check('unsqueeze reported', /UnSqueeze: Input file is not squeezed/.test(errText ?? ''), errText);
  await shot(page, 'unsqueeze');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);

  const rows = async () => page.evaluate(() => {
    const t = os.apps.tasksOf('Patch')[0];
    return t.patch.patcher.allTargets.map((g) => ({ path: g.displayPath, p: g.patches.map((tp) => [tp.patch.desc, tp.action, tp.icon?.text ?? null]) }));
  });
  let r = await rows();
  check('targets found', r.length === 2, JSON.stringify(r));
  const pocket = r.find((g) => /PocketFS$/.test(g.path));
  check('PocketFS can be applied', pocket?.p[0][1] === 1 && pocket.p[0][2] === 'Apply', JSON.stringify(pocket));
  const adv = r.find((g) => /Advance$/.test(g.path));
  check('Advance greyed (no option)', adv?.p[0][1] === 0 && adv.p[0][2] === null, JSON.stringify(adv));
  // make the window big enough to show everything (as the user would with the toggle-size icon)
  await page.evaluate(() => { const w = os.apps.tasksOf('Patch')[0].patch.window; w.toggleSize(); });
  await page.waitForTimeout(300);
  await shot(page, 'list');

  // select "Apply" by clicking it, then Menu > Patch selected
  const clickOption = async () => {
    const p = await page.evaluate(() => {
      const t = os.apps.tasksOf('Patch')[0];
      const tp = t.patch.patcher.allTargets.flatMap((g) => g.patches).find((q) => q.icon);
      const w = t.patch.window;
      const b = tp.icon.bbox;
      return w.workToScreen(b.x0 + 12, (b.y0 + b.y1) / 2);
    });
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(200);
    return p;
  };
  const p = await clickOption();
  const sel = await page.evaluate(() => os.apps.tasksOf('Patch')[0].patch.patcher.allTargets.flatMap((g) => g.patches).find((q) => q.icon).icon.selected);
  check('option selected', sel === true);
  await page.mouse.click(p.x, p.y, { button: 'middle' });
  await page.waitForTimeout(300);
  const items = await page.locator('.menu').nth(0).locator('.mitem').allInnerTexts();
  check('target menu', items.length === 4 && /Patch selected/.test(items[3]), JSON.stringify(items));
  await shot(page, 'menu');
  await page.locator('.menu').nth(0).locator('.mitem').nth(3).click();
  await page.waitForTimeout(1200);

  const words = async () => page.evaluate(async (APPS) => {
    const b = await os.vfs.readFile(APPS + '.!PocketFS.!RunImage');
    const dv = new DataView(b.buffer, b.byteOffset);
    return [dv.getUint32(0x4F0, true), dv.getUint32(0x4F4, true), dv.getUint32(0x1C48, true), os.vfs.stat(APPS + '.!PocketFS.!RunImage').filetype, b.length].map((x) => x.toString(16));
  }, APPS);
  let w = await words();
  check('patch applied', w.join() === 'e3e00000,e58c0024,e3700001,ff8,2000', w.join());
  r = await rows();
  const pocket2 = r.find((g) => /PocketFS$/.test(g.path));
  check('now removable', pocket2?.p[0][1] === 2 && pocket2.p[0][2] === 'Remove', JSON.stringify(pocket2));
  await shot(page, 'applied');

  // remove it again: Select all remove + Patch selected
  await page.mouse.click(p.x, p.y, { button: 'middle' });
  await page.waitForTimeout(300);
  await page.locator('.menu').nth(0).locator('.mitem').nth(1).click();
  await page.waitForTimeout(200);
  await page.mouse.click(p.x, p.y, { button: 'middle' });
  await page.waitForTimeout(300);
  await page.locator('.menu').nth(0).locator('.mitem').nth(3).click();
  await page.waitForTimeout(1200);
  w = await words();
  check('patch removed', w.join() === 'e58c0024,e3e00000,e3300000,ff8,2000', w.join());

  // Info box from the icon bar menu
  await page.mouse.click(ib.x, ib.y, { button: 'middle' });
  await page.waitForTimeout(300);
  const ibItems = await page.locator('.menu').nth(0).locator('.mitem').allInnerTexts();
  check('icon bar menu', ibItems.length === 2 && /Info/.test(ibItems[0]) && /Quit/.test(ibItems[1]), JSON.stringify(ibItems));
  const it = await page.locator('.menu').nth(0).locator('.mitem').nth(0).boundingBox();
  await page.mouse.move(it.x + 20, it.y + it.height / 2, { steps: 2 });
  await page.mouse.move(it.x + it.width - 6, it.y + it.height / 2, { steps: 3 });
  await page.waitForTimeout(400);
  await shot(page, 'info');
  await page.keyboard.press('Escape');

  // double-clicking a Patch file loads it (DataOpen while running)
  await page.evaluate(() => os.vfs.writeFile('RAM::RamDisc0.$.MyPatch', 'Application:!Test &2000\nDescription:Test app\nPatch:Change a byte\nFile:!Test.Data &FFD\nLocation:4\nChangeByte:&04 &99\n', { filetype: 0xFC3 }));
  await filerOpen(page, 'RAM::RamDisc0.$', 'MyPatch', { wait: 800 });
  const n = await page.evaluate(() => os.apps.tasksOf('Patch')[0].patch.patcher.apps.map((a) => a.name));
  check('patch file loaded by double-click', n.includes('!Test'), JSON.stringify(n));

  check('no page errors', errs.length === 0, errs.join('; '));
};
