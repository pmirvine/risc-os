export default async (page) => {
  await page.evaluate(() => { os.filer.openDir('ADFS::HardDisc4.$.Diversions', { x: 20, y: 40 }); os.filer.openDir('ADFS::HardDisc4.$.Apps', { x: 20, y: 330 }); os.filer.openDir('ADFS::HardDisc4.$.Utilities', { x: 460, y: 330 }); });
  await page.waitForTimeout(1500);
};
