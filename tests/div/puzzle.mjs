export default async (page) => {
  await page.mouse.move(400, 200);
  await page.evaluate(async () => { await os.apps.start('Puzzle'); });
  await page.waitForTimeout(800);
  const w = await page.evaluate(() => { const w = os.apps.tasksOf('Puzzle')[0].puzzle.win; return { x: w.x, y: w.y }; });
  await page.mouse.click(w.x + 40, w.y + 40);
  await page.waitForTimeout(200);
  if (!process.env.NOMENU) await page.mouse.click(w.x + 60, w.y + 60, { button: "middle" });
  await page.waitForTimeout(400);
};
