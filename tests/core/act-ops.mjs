// Filer operations through the real menus: new directory, rename, info, delete
const menuItem = async (page, level, idx) => page.locator('.menu').nth(level).locator('.mitem').nth(idx).boundingBox();
const hoverArrow = async (page, level, idx) => { const b = await menuItem(page, level, idx); await page.mouse.move(b.x + 20, b.y + 10, { steps: 2 }); await page.mouse.move(b.x + b.width - 6, b.y + 10, { steps: 3 }); await page.waitForTimeout(250); };
export default async (page) => {
  await page.evaluate(() => os.filer.openDir('RAM::RamDisc0.$', { x: 100, y: 100, w: 400, h: 250 }));
  await page.waitForTimeout(300);
  const w = await page.locator('.win.filer').first().boundingBox();
  // New directory ▸ "Docs"
  await page.mouse.click(w.x + 200, w.y + 150, { button: 'right' });
  await page.waitForTimeout(200);
  await hoverArrow(page, 0, 5);
  await page.keyboard.type('Docs');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  // create a file via API and refresh
  await page.evaluate(() => os.vfs.writeFile('RAM::RamDisc0.$.Letter', 'Dear Sir,\n', { filetype: 0xFFF }));
  await page.waitForTimeout(200);
  // select Letter and rename via menu to "Note"
  const pos = await page.evaluate(() => { const v = os.filer.viewers.get('ram::ramdisc0.$'); const i = v.items.findIndex((x) => x.name === 'Letter'); const r = v.hotRect(i); return v.win.workToScreen((r.x0 + r.x1) / 2, r.y0 + 20); });
  await page.mouse.click(pos.x, pos.y);
  await page.mouse.click(pos.x, pos.y, { button: 'right' });
  await page.waitForTimeout(200);
  await hoverArrow(page, 0, 1);            // File 'Letter'
  await hoverArrow(page, 1, 1);            // Rename
  await page.keyboard.press('Control+u');
  await page.keyboard.type('Note');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const names = await page.evaluate(() => os.vfs.list('RAM::RamDisc0.$').map((x) => x.name).join(','));
  console.log('RAM disc now:', names);
  // Info box on Note
  const pos2 = await page.evaluate(() => { const v = os.filer.viewers.get('ram::ramdisc0.$'); const i = v.items.findIndex((x) => x.name === 'Note'); const r = v.hotRect(i); return v.win.workToScreen((r.x0 + r.x1) / 2, r.y0 + 20); });
  await page.mouse.click(pos2.x, pos2.y);
  await page.mouse.click(pos2.x, pos2.y, { button: 'right' });
  await page.waitForTimeout(200);
  await hoverArrow(page, 0, 1);
  await hoverArrow(page, 1, 6);            // Info
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'tests/screens/ops-info.png' });
};
