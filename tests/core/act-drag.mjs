export default async (page) => {
  await page.evaluate(() => { os.filer.openDir('ADFS::HardDisc4.$', { x: 20, y: 60 }); os.filer.openDir('RAM::RamDisc0.$', { x: 500, y: 60, w: 300, h: 200 }); });
  await page.waitForTimeout(400);
  const hd = await page.evaluate(() => { const v = os.filer.viewers.get('adfs::harddisc4.$'); const i = v.items.findIndex((x) => x.name === 'ReadMe'); const r = v.hotRect(i); const p = v.win.workToScreen((r.x0 + r.x1) / 2, r.y0 + 15); return p; });
  await page.mouse.move(hd.x, hd.y);
  await page.mouse.down();
  await page.mouse.move(hd.x + 30, hd.y + 10, { steps: 5 });
  await page.mouse.move(600, 90, { steps: 10 });
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'tests/screens/drag-during.png' });
  await page.mouse.up();
  await page.waitForTimeout(60); await page.screenshot({ path: 'tests/screens/drag-action.png' }); await page.waitForTimeout(1500);
};
