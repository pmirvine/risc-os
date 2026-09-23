export default async (page) => {
  const snap = (n) => page.screenshot({ path: `tests/screens/${n}.png` });
  // error box
  await page.evaluate(() => { os.wimp.reportError("File 'Fred' not found", { appName: 'Filer', cancel: true }); });
  await page.waitForTimeout(300);
  await snap('m-error');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  // small icons + full info
  await page.evaluate(() => { const a = os.filer.openDir('ADFS::HardDisc4.$', { x: 20, y: 40 }); a.setMode('small'); const b = os.filer.openDir('ADFS::HardDisc4.$.!Boot', { x: 20, y: 330, w: 640, h: 200 }); b.setMode('full'); });
  await page.waitForTimeout(400);
  await snap('m-filer-modes');
  // pinboard menu + info
  await page.mouse.click(900, 400, { button: 'right' });
  await page.waitForTimeout(300);
  const b = await page.locator('.menu .mitem').nth(0).boundingBox();
  await page.mouse.move(b.x + b.width - 5, b.y + 10, { steps: 4 });
  await page.waitForTimeout(300);
  await snap('m-pinboard-menu');
  await page.keyboard.press('Escape');
  // display manager
  const ib = page.locator('.ibicon');
  const n = await ib.count();
  const d = await ib.nth(n - 2).boundingBox();
  await page.mouse.click(d.x + d.width / 2, d.y + 10);
  await page.waitForTimeout(400);
  await snap('m-display');
};
