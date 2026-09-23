export default async (page) => {
  await page.evaluate(async () => { const { fileAction } = await import('/src/core/fileraction.js'); fileAction('count', ['ADFS::HardDisc4.$.Apps', 'ADFS::HardDisc4.$.Diversions'], null, os.filer.options); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const v = os.filer.openDir('ADFS::HardDisc4.$', { x: 20, y: 40 }); const w = v.accessBox([v.items[6]]); w.open({ x: 500, y: 60, behind: 'top' }); });
  await page.waitForTimeout(300);
};
