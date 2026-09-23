export default async (page) => {
  await page.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Diversions.!Patience'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Diversions.!Puzzle'));
  await page.waitForTimeout(1200);
  const r = await page.evaluate(async () => {
    const t = os.apps.tasksOf('Patience')[0];
    const out = { patience: !!t, puzzle: os.apps.tasksOf('Puzzle').length };
    // Save Choices
    const ib = document.querySelectorAll('.iconbar .icon, .ib-icon').length;
    out.ib = ib;
    return out;
  });
  console.log(JSON.stringify(r));
  // icon bar menu: find the patience icon on the right
  const box = await page.evaluate(() => { const im = [...document.querySelectorAll('img')].find((i) => /patience/i.test(i.src) && i.getBoundingClientRect().top > 650); const b = im?.getBoundingClientRect(); return b && { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  console.log('ib', JSON.stringify(box));
  if (box) {
    await page.mouse.click(box.x, box.y); await page.waitForTimeout(300);
    await page.mouse.click(box.x, box.y, { button: 'middle' }); await page.waitForTimeout(300);
    if (process.env.SAVE) {
      await page.mouse.click(box.x + 20, box.y - 55); await page.waitForTimeout(300);
      console.log('config', JSON.stringify(await page.evaluate(() => os.vfs.readText('ADFS::HardDisc4.$.Diversions.!Patience.!Config'))));
    }
  }
};
