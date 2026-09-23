export default async (page) => {
  await page.evaluate(() => os.apps.start('Example'));
  await page.waitForTimeout(600);
  const doc = await page.locator('.win').filter({ hasText: '' }).last().boundingBox();
  // click in the document window to add dots
  const w = await page.evaluate(() => { const t = os.apps.tasksOf('Example')[0]; const ws = [...t.windows]; return ws.map((x) => ({ t: x.title, x: x.x, y: x.y, w: x.w, h: x.h })); });
  const d = w.find((q) => q.t.startsWith('Untitled'));
  for (let i = 0; i < 5; i++) await page.mouse.click(d.x + 40 + i * 50, d.y + 60 + (i % 2) * 40);
  await page.waitForTimeout(300);
  // icon bar menu of the example
  const ib = page.locator('.ibicon');
  const n = await ib.count();
  const b = await ib.nth(n - 3).boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + 10, { button: 'right' });
  await page.waitForTimeout(300);
  const it = await page.locator('.menu .mitem').nth(1).boundingBox();
  await page.mouse.move(it.x + it.width - 6, it.y + 10, { steps: 4 });
  await page.waitForTimeout(300);
};
