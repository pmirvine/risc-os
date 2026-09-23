export default async (page) => {
  await page.evaluate(() => os.apps.start('Example'));
  await page.waitForTimeout(400);
  await page.evaluate(() => os.switcher.toggleDisplay());
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => { const w = os.switcher.win; const row = os.switcher.rows.find((q) => q.task); const p = w.workToScreen(120, (row.y0 + row.y1) / 2); return p; });
  await page.mouse.click(r.x, r.y, { button: 'right' });
  await page.waitForTimeout(300);
  const b = await page.locator('.menu .mitem').nth(2).boundingBox();
  await page.mouse.move(b.x + 20, b.y + 10); await page.mouse.move(b.x + b.width - 5, b.y + 10, { steps: 3 });
  await page.waitForTimeout(300);
};
