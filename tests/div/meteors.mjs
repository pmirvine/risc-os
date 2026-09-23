// Action script: start Meteors, play a little, screenshot states.
// PLAYWRIGHT_MODULE=... node tests/core/shot.mjs div-meteors tests/div/meteors.mjs
export default async (page) => {
  await page.evaluate(() => os.filer.openDir('ADFS::HardDisc4.$.Diversions', { x: 20, y: 500, w: 420, h: 160 }));
  await page.waitForTimeout(600);
  await page.evaluate(() => os.cli.run('Filer_Run ADFS::HardDisc4.$.Diversions.!Meteors'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/screens/div-meteors-start.png' });
  // thrust & fire
  await page.keyboard.down('z'); await page.waitForTimeout(300); await page.keyboard.up('z');
  await page.keyboard.down('Shift'); await page.waitForTimeout(400); await page.keyboard.up('Shift');
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(120); }
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'tests/screens/div-meteors-play.png' });
  // pause & full screen
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'tests/screens/div-meteors-full.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  // lose all lives quickly: park the ship, wait for rocks
  const st = await page.evaluate(() => ({ tasks: os.wimp.tasks?.map?.((t) => t.name) }));
  console.log(JSON.stringify(st));
};
