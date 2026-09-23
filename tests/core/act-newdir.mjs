const menuItem = async (page, level, idx) => page.locator('.menu').nth(level).locator('.mitem').nth(idx).boundingBox();
const hoverArrow = async (page, level, idx) => { const b = await menuItem(page, level, idx); await page.mouse.move(b.x + 20, b.y + 10, { steps: 2 }); await page.mouse.move(b.x + b.width - 6, b.y + 10, { steps: 3 }); await page.waitForTimeout(250); };
export default async (page) => {
  await page.evaluate(() => os.filer.openDir('RAM::RamDisc0.$', { x: 100, y: 100, w: 400, h: 250 }));
  await page.waitForTimeout(300);
  const w = await page.locator('.win.filer').first().boundingBox();
  await page.mouse.click(w.x + 200, w.y + 30, { button: 'right' });
  await page.waitForTimeout(200);
  console.log('levels', await page.evaluate(() => wimp.menus.levels.length));
  await hoverArrow(page, 0, 5);
  console.log('levels', await page.evaluate(() => wimp.menus.levels.length));
  await page.keyboard.type('Docs');
  console.log('value', await page.evaluate(() => wimp.menus.levels[1]?.menu?.items[0]?.writable?.value));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log(await page.evaluate(() => os.vfs.list('RAM::RamDisc0.$').map((x) => x.name).join(',')));
};
