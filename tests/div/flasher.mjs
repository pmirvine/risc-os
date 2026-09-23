export default async (page) => {
  await page.evaluate(() => os.apps.start('Example'));
  await page.waitForTimeout(500);
  await page.evaluate(() => os.apps.start('Flasher'));
  await page.waitForTimeout(500);
  const vis = [];
  for (let i = 0; i < 6; i++) { vis.push(await page.evaluate(() => os.wimp.caretEl.style.visibility || 'visible')); await page.waitForTimeout(150); }
  console.log('caret visibility samples', vis.join(','));
  await page.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Diversions.!Flasher.!Help'));
  await page.waitForTimeout(1200);
  // click the "Using" index arrow (icon 2)
  await page.evaluate(() => { const t = os.apps.tasksOf ? os.apps.tasksOf('Helper')[0] : null; });
  const box = await page.evaluate(() => { const t = os.wimp.tasks.find((t) => t.name === 'Helper'); const w = [...t.windows][0]; const r = w.icons[2].el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(300);
  // icon bar menu of Flasher
  const ib = await page.evaluate(() => { const it = os.wimp.iconbar.items.find((i) => i.task?.name === 'Flasher'); const r = it.icon.el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(ib.x, ib.y, { button: 'right' });
  await page.waitForTimeout(500);
};
