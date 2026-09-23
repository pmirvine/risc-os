export default async (page) => {
  const ib = page.locator('.ibicon');
  const n = await ib.count();
  const tm = await ib.nth(n - 1).boundingBox();
  await page.mouse.click(tm.x + tm.width / 2, tm.y + 10);
  await page.waitForTimeout(400);
  await page.mouse.click(tm.x + tm.width / 2, tm.y + 10, { button: 'right' });
  await page.waitForTimeout(300);
};
