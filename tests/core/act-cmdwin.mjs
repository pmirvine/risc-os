export default async (page) => { await page.evaluate(() => os.cli.run('Help Modules')); await page.waitForTimeout(600); };
