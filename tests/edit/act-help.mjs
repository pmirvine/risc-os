// !Help: start it, hover over various things, screenshot the help window.
const menuItem = async (page, level, idx) => page.locator('.menu').nth(level).locator('.mitem').nth(idx).boundingBox();
export default async (page) => {
  await page.evaluate(() => os.apps.start('Help'));
  await page.evaluate(() => os.apps.start('Edit'));
  await page.waitForTimeout(800);
  const helpText = () => page.evaluate(() => { const t = os.apps.tasksOf('Help')[0]; const w = [...t.windows].find((q) => q.title === 'Interactive help'); return w.icons.filter(Boolean).map((i) => i.text).join(' / '); });
  const shot = async (name) => { await page.waitForTimeout(350); console.log(name, '=>', await helpText()); await page.screenshot({ path: `tests/screens/help-${name}.png` }); };
  // icon bar: Edit icon, hard disc, Help icon
  const ib = await page.evaluate(() => Object.fromEntries(wimp.iconbar.items.map((i) => [i.sprite, wimp.iconbar.iconScreenX(i)])));
  await page.mouse.move(ib['!edit'], wimp_h(await page.evaluate(() => wimp.height)) );
  function wimp_h(h) { return h - 30; }
  await shot('iconbar-edit');
  await page.mouse.move(ib.harddisc, await page.evaluate(() => wimp.height - 30));
  await shot('iconbar-hd');
  // open an Edit window and hover over its work area and title bar
  await page.evaluate(async () => { const { currentEdit } = await import('/src/apps/Edit/api.js'); const s = await currentEdit().open('', 0xFFF); s.doc.setText('Some text\n'); });
  await page.waitForTimeout(300);
  const w = await page.evaluate(() => { const t = os.apps.tasksOf('Edit')[0]; const w = [...t.windows].find((q) => q.isOpen && q.title.includes('untitled')); return { x: w.x, y: w.y, w: w.w, h: w.h }; });
  await page.mouse.move(w.x + 100, w.y + 60);
  await shot('editwindow');
  await page.mouse.move(w.x + 200, w.y - 10);
  await shot('titlebar');
  await page.mouse.move(w.x + w.w + 10, w.y + w.h - 30);
  await shot('scrollarrow');
  // Edit's menu
  await page.mouse.click(w.x + 100, w.y + 60, { button: 'right' });
  await page.waitForTimeout(200);
  const b = await menuItem(page, 0, 3);
  await page.mouse.move(b.x + 20, b.y + 10);
  await shot('editmenu');
  await page.keyboard.press('Escape');
  // a Filer window and its menu
  await page.evaluate(() => os.filer.openDir('ADFS::HardDisc4.$', { x: 560, y: 80, w: 400, h: 200 }));
  await page.waitForTimeout(400);
  await page.mouse.move(700, 150);
  await shot('filer');
  await page.mouse.click(700, 150, { button: 'right' });
  await page.waitForTimeout(200);
  const f = await menuItem(page, 0, 0);
  await page.mouse.move(f.x + 20, f.y + 10);
  await shot('filermenu');
  await page.keyboard.press('Escape');
};
