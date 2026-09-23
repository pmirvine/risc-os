export default async (page) => { await page.evaluate(() => os.apps.start('Example')); await page.waitForTimeout(600); };
