// Clock: open a clock (and a resized second one)
export default async (page) => {
  await page.mouse.move(300, 120);
  await page.evaluate(() => os.apps.start('Clock'));
  await page.waitForTimeout(800);
  await page.mouse.move(700, 150);
  await page.evaluate(async () => { const t = await os.apps.start('Clock'); const w = [...t.windows][0]; w.open({ x: w.x, y: w.y, w: 340, h: 340, behind: 'top' }); });
  await page.waitForTimeout(1500);
};
