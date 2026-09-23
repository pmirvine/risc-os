export default async (page) => {
  await page.evaluate(async () => { await os.cli.run('Configure WimpFont 1'); os.filer.openDir('ADFS::HardDisc4.$', { x: 20, y: 40 }); });
  await page.waitForTimeout(300);
  await page.mouse.click(200, 200, { button: 'right' });
  await page.waitForTimeout(300);
  await page.evaluate(async () => { localStorage.clear(); });
};
