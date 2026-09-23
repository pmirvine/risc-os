export default async (page) => {
  await page.evaluate(() => os.apps.start('Help'));
  await page.evaluate(() => os.apps.start('Edit'));
  await page.waitForTimeout(700);
  await page.evaluate(async () => { const { currentEdit } = await import('/src/apps/Edit/api.js'); const s = await currentEdit().open('', 0xFFF); s.doc.setText('x\n'); s.views[0].setCaret(0, { take: true }); });
  await page.waitForTimeout(200);
  await page.keyboard.press('F4');
  await page.keyboard.press('F6');
  await page.waitForTimeout(200);
  const p = await page.evaluate(() => { const w = wimp.menus.levels[0].win; const ic = w.icons[22]; return w.workToScreen((ic.bbox.x0 + ic.bbox.x1) / 2, (ic.bbox.y0 + ic.bbox.y1) / 2); });
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'tests/screens/help-findbox.png' });
  console.log(await page.evaluate(() => { const t = os.apps.tasksOf('Help')[0]; const w = [...t.windows].find((q) => q.title === 'Interactive help'); return w.icons.filter(Boolean).map((i) => i.text).join(' / '); }));
};
