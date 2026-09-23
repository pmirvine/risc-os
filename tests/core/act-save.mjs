const menuItem = async (page, level, idx) => page.locator('.menu').nth(level).locator('.mitem').nth(idx).boundingBox();
const hoverArrow = async (page, level, idx) => { const b = await menuItem(page, level, idx); await page.mouse.move(b.x + 20, b.y + 10, { steps: 2 }); await page.mouse.move(b.x + b.width - 6, b.y + 10, { steps: 3 }); await page.waitForTimeout(250); };
export default async (page) => {
  await page.evaluate(() => os.filer.openDir('RAM::RamDisc0.$', { x: 600, y: 420, w: 300, h: 150 }));
  await page.evaluate(() => os.apps.start('Example'));
  await page.waitForTimeout(500);
  const d = await page.evaluate(() => { const t = os.apps.tasksOf('Example')[0]; const w = [...t.windows].find((q) => q.title.startsWith('Untitled')); return { x: w.x, y: w.y }; });
  for (let i = 0; i < 3; i++) await page.mouse.click(d.x + 60 + i * 40, d.y + 60);
  // menu on the document -> Colour submenu screenshot
  await page.mouse.click(d.x + 200, d.y + 150, { button: 'right' });
  await page.waitForTimeout(200);
  await hoverArrow(page, 0, 1);
  await page.screenshot({ path: 'tests/screens/colourmenu.png' });
  await hoverArrow(page, 0, 2);   // Save ▸
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'tests/screens/savebox.png' });
  // drag the file icon from the save box into the RAM viewer
  const icon = await page.evaluate(() => { const lv = wimp.menus.levels[1]; const w = lv.win; const ic = w.icons[2]; const p = w.workToScreen((ic.bbox.x0 + ic.bbox.x1) / 2, (ic.bbox.y0 + ic.bbox.y1) / 2); return p; });
  await page.mouse.move(icon.x, icon.y);
  await page.mouse.down();
  await page.mouse.move(icon.x + 20, icon.y + 20, { steps: 4 });
  await page.mouse.move(700, 500, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  console.log('RAM:', await page.evaluate(() => os.vfs.list('RAM::RamDisc0.$').map((f) => `${f.name}(${f.filetype.toString(16)},${f.size})`).join(' ')));
};
