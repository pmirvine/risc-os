// Action script for tests/core/shot.mjs: start !Patience, open its window, play a few moves.
export default async (page) => {
  await page.evaluate(async () => { await os.apps.start('Patience'); });
  await page.waitForTimeout(800);
  // click the icon bar icon to open the window
  const t = await page.evaluate(() => { const t = os.apps.tasksOf('Patience')[0]; t.patience.win.open({ behind: 'top' }); const w = t.patience.win; return { x: w.x, y: w.y }; });
  await page.waitForTimeout(400);
  // turn over the pack a few times, then Adjust-click the waste pile (to suit stack)
  const pk = { x: t.x + (24 + 9 * 68) / 2 + 15, y: t.y + 256 / 2 - 20 };
  await page.mouse.click(pk.x, pk.y);
  await page.waitForTimeout(200);
  // drag the waste card (at x=24+8*68) to pile D
  const waste = { x: t.x + (24 + 8 * 68) / 2 + 15, y: t.y + 256 / 2 - 20 };
  await page.mouse.move(waste.x, waste.y); await page.mouse.down();
  await page.mouse.move(waste.x - 100, waste.y - 20, { steps: 5 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'tests/screens/div-patience-drag.png' });
  await page.mouse.up();
  await page.waitForTimeout(300);
  // open the window menu
  await page.mouse.click(t.x + 200, t.y + 250, { button: 'middle' });
  await page.waitForTimeout(400);
};
