export default async (page) => {
  const hd = await page.locator('.ibicon').nth(1).boundingBox();
  await page.mouse.click(hd.x + hd.width / 2, hd.y + 10);
  await page.waitForTimeout(400);
  // menu click on the ReadMe icon
  const w = await page.locator('.win.filer').first().boundingBox();
  await page.mouse.click(w.x + 240, w.y + 110, { button: 'right' });
  await page.waitForTimeout(300);
  // hover over "File 'ReadMe'" arrow to open submenu
  const items = page.locator('.menu .mitem');
  const b = await items.nth(1).boundingBox();
  await page.mouse.move(b.x + b.width - 6, b.y + 10, { steps: 4 });
  await page.waitForTimeout(300);
};
