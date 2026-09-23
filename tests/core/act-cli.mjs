export default async (page) => {
  await page.keyboard.press('F12');
  await page.waitForTimeout(300);
  for (const cmd of ['cat', 'show boot*', 'ex apps', 'help dir', 'time']) {
    await page.keyboard.type(cmd);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
  }
  await page.keyboard.type('info read*');
};
