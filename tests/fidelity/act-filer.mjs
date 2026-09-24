export default async (page) => {
  const hd = await page.locator('.ibicon').nth(1).boundingBox();
  await page.mouse.click(hd.x + hd.width / 2, hd.y + 10);
  await page.waitForTimeout(500);
};
