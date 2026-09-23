// Player: load an ARMovie sound file, open the Control dialogue.
export default async (page) => {
  await page.evaluate(async () => {
    os.filer.openDir('ADFS::HardDisc4.$.Diversions.AudioDemos', { x: 20, y: 40 });
    await os.apps.start('!Player', 'ADFS::HardDisc4.$.Diversions.AudioDemos.Minor');
  });
  await page.waitForTimeout(1500);
  const st = await page.evaluate(() => { const t = os.apps.tasksOf ? os.apps.tasksOf('!Player') : null; return [...document.querySelectorAll('.window .title')].map((e) => e.textContent).join(' | '); });
  console.log('titles', st);
  if (process.env.CONTROL) {
    const box = await page.evaluate(() => { const w = [...os.wimp.windows].find((w) => w.name?.toLowerCase() === 'player'); const i = w.icons[17]; const p = w.workToScreen(i.bbox.x0 + 10, i.bbox.y0 + 10); return p; });
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(500);
  }
};
export async function playTest(page) {
  const box = await page.evaluate(() => { const w = [...os.wimp.windows].find((w) => w.name?.toLowerCase() === 'player'); const i = w.icons[2]; return w.workToScreen(i.bbox.x0 + 10, i.bbox.y0 + 10); });
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(1200);
}
