// Start CloseUp, open its window, move the pointer over the icon bar / a filer window, open the menu.
export default async (page) => {
  await page.evaluate(() => os.filer.openDir('ADFS::HardDisc4.$.Apps'));
  await page.waitForTimeout(400);
  await page.evaluate(() => os.apps.start('CloseUp'));
  await page.waitForTimeout(500);
  const ib = page.locator('.ibicon');
  const n = await ib.count();
  // find the CloseUp icon bar icon via the task
  const pos = await page.evaluate(() => { const t = os.apps.tasksOf('CloseUp')[0]; const it = [...t.iconbarIcons][0]; const r = it.icon.el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 10 }; });
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(300);
  if (process.env.POS) { const [x, y] = process.env.POS.split(',').map(Number); await page.mouse.move(x, y, { steps: 5 }); } else await page.mouse.move(pos.x - 200, pos.y - 10, { steps: 5 });
  if (process.env.ZOOMK) await page.evaluate((z) => { const t = os.apps.tasksOf('CloseUp')[0]; const m = [...t.windows].find((w) => w.title === 'Magnifier'); m.icons[0].setText(z); m.emit('key', { code: 13, icon: m.icons[0] }); }, process.env.ZOOMK);
  await page.waitForTimeout(300);
  await page.waitForTimeout(400);
  if (process.env.MENU) {
    const w = await page.evaluate(() => { const t = os.apps.tasksOf('CloseUp')[0]; const w = [...t.windows].find((x) => x.title === 'CloseUp'); return { x: w.x, y: w.y }; });
    await page.mouse.click(w.x + 100, w.y + 100, { button: 'right' });
    await page.waitForTimeout(300);
    const it = await page.locator('.menu .mitem').nth(1).boundingBox();
    await page.mouse.move(it.x + it.width - 6, it.y + 10, { steps: 4 });
    await page.waitForTimeout(500);
  }
};
