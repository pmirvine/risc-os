export default async (page) => {
  await page.evaluate(() => os.apps.start('MemNow'));
  await page.waitForTimeout(1200);
  // open its icon bar menu and the Info box
  const box = await page.evaluate(() => { const it = os.wimp.iconbar.items.find((i) => i.task?.name === 'MemNow'); const r = it.icon.el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(box.x, box.y, { button: 'right' });
  await page.waitForTimeout(400);
  const m = await page.$('.menu');
  const mb = await m.boundingBox();
  await page.mouse.move(mb.x + mb.width - 8, mb.y + 30);
  await page.waitForTimeout(800);
};
