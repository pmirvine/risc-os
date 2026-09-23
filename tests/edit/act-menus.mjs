// Edit: menus, Find box, file load via Filer double-click, BASIC.
const menuItem = async (page, level, idx) => page.locator('.menu').nth(level).locator('.mitem').nth(idx).boundingBox();
const hoverArrow = async (page, level, idx) => { const b = await menuItem(page, level, idx); await page.mouse.move(b.x + 20, b.y + 10, { steps: 2 }); await page.mouse.move(b.x + b.width - 6, b.y + 10, { steps: 3 }); await page.waitForTimeout(250); };
const edit = (page, fn) => page.evaluate(`(async () => { const E = await import('/src/apps/Edit/api.js'); return (${fn})(E); })()`);
export default async (page) => {
  console.log('alias', await page.evaluate(() => os.sysvars.get('Alias$@RunType_FFF')));
  // open a text file from the disc by Filer double-click semantics
  const path = await page.evaluate(() => { const l = os.vfs.list('ADFS::HardDisc4.$.Diversions.!Puzzle').map((f) => f.path); return l; });
  console.log('puzzle dir', JSON.stringify(path));
  await page.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Diversions.!Puzzle.!Help'));
  await page.waitForTimeout(1500);
  const w = await page.evaluate(() => { const t = os.apps.tasksOf('Edit')[0]; const w = t && [...t.windows].find((q) => q.isOpen); return w ? { x: w.x, y: w.y, w: w.w, h: w.h, title: w.title } : null; });
  console.log('window', JSON.stringify(w));
  await page.screenshot({ path: 'tests/screens/edit-file.png' });
  // Misc submenu
  await page.mouse.click(w.x + 150, w.y + 100, { button: 'right' });
  await page.waitForTimeout(200);
  await hoverArrow(page, 0, 0);
  await page.screenshot({ path: 'tests/screens/edit-misc.png' });
  await hoverArrow(page, 1, 1);
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'tests/screens/edit-fileinfo.png' });
  await hoverArrow(page, 0, 3);
  await page.screenshot({ path: 'tests/screens/edit-editmenu.png' });
  await hoverArrow(page, 1, 0);
  await page.waitForTimeout(300);
  await page.keyboard.type('the');
  await page.screenshot({ path: 'tests/screens/edit-findsub.png' });
  await page.keyboard.press('Escape');
  await page.mouse.click(w.x + 150, w.y + 100, { button: 'right' });
  await hoverArrow(page, 0, 4);
  await page.screenshot({ path: 'tests/screens/edit-display.png' });
  await hoverArrow(page, 1, 0);
  await hoverArrow(page, 2, 2);
  await page.screenshot({ path: 'tests/screens/edit-fontmenu.png' });
  await page.keyboard.press('Escape');
};
