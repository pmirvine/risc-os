export default async (page, h) => {
  await h.start();
  await page.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Diversions.!MineHunt.!Sprites'));
  await page.waitForTimeout(800);
  await h.shot('open-file');
  // double-click the first sprite
  const p = await page.evaluate(() => { const w = [...wimp.windows].find((q) => q._paintFile); return w.workToScreen(52, 24 + 50); });
  await page.mouse.dblclick(p.x, p.y);
  await page.waitForTimeout(800);
  await h.shot('sprite-window');
};
