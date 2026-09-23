export default async (page) => {
  await page.evaluate(() => { os.filer.openDir('ADFS::HardDisc4.$.Apps', { x: 100, y: 100 }); });
  await page.waitForTimeout(300);
  const c = await page.locator('.win.filer [data-part="close"]').first().boundingBox();
  await page.mouse.click(c.x + 10, c.y + 10, { modifiers: ['Alt'] });
  await page.waitForTimeout(300);
};
