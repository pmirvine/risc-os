export default async (page) => {
  const hd = await page.locator('.ibicon').nth(1).boundingBox();
  await page.mouse.click(hd.x + hd.width / 2, hd.y + 10);
  await page.waitForTimeout(400);
  const w = await page.locator('.win.filer').first().boundingBox();
  await page.mouse.click(w.x + 240, w.y + 110);
  await page.waitForTimeout(100);
  await page.mouse.click(w.x + 240, w.y + 110, { button: 'right' });
  await page.waitForTimeout(300);
  let b = await page.locator('.menu .mitem').nth(1).boundingBox();
  await page.mouse.move(b.x + b.width - 6, b.y + 10, { steps: 4 });
  await page.waitForTimeout(300);
  // submenu level 1: Copy is item 0 of the second menu
  const menus = page.locator('.menu');
  b = await menus.nth(1).locator('.mitem').nth(0).boundingBox();
  await page.mouse.move(b.x + 20, b.y + 10, { steps: 3 });
  await page.mouse.move(b.x + b.width - 6, b.y + 10, { steps: 4 });
  await page.waitForTimeout(400);
};
