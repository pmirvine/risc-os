export default async (page) => {
  await page.keyboard.press('F12');
  await page.waitForTimeout(300);
  await page.keyboard.type('basic');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  await page.keyboard.type('PRINT "Hello from BASIC"; 6*7');
  await page.keyboard.press('Enter');
  await page.keyboard.type('*cat');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/screens/basic1.png' });
  await page.keyboard.type('QUIT');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
};
