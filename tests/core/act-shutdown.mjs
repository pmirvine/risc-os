export default async (page) => {
  await page.evaluate(() => os.apps.start('Example'));
  await page.waitForTimeout(400);
  await page.keyboard.down('Control'); await page.keyboard.down('Shift'); await page.keyboard.press('F12'); await page.keyboard.up('Shift'); await page.keyboard.up('Control');
  await page.waitForTimeout(500);
};
