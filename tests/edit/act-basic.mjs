// Edit smoke test: start Edit, open a window, type, select, menu.
export default async (page) => {
  await page.evaluate(() => os.apps.start('Edit'));
  await page.waitForTimeout(800);
  // click the icon bar icon
  const ib = await page.evaluate(() => { const it = wimp.iconbar.items.find((i) => i.task?.name === 'Edit'); const p = wimp.iconbar.iconScreenX(it); return { x: p, y: wimp.height - 30 }; });
  await page.mouse.click(ib.x, ib.y);
  await page.waitForTimeout(400);
  await page.keyboard.type('Hello RISC OS world.\nThis is !Edit running in a browser.\n');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Tab here, ctrl char:');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('\nThe quick brown fox jumps over the lazy dog.');
  await page.waitForTimeout(200);
  const w = await page.evaluate(() => { const t = os.apps.tasksOf('Edit')[0]; const w = [...t.windows].find((q) => q.isOpen && q.title.includes('untitled')); return { x: w.x, y: w.y, w: w.w, h: w.h, title: w.title }; });
  console.log('window', JSON.stringify(w));
  // double-click a word, adjust-extend
  await page.mouse.dblclick(w.x + 8 * 8, w.y + 8);
  await page.waitForTimeout(500);
  await page.keyboard.down('Shift');
  await page.mouse.click(w.x + 8 * 12, w.y + 16 + 8);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'tests/screens/edit-typing.png' });
  // menu
  await page.mouse.click(w.x + 100, w.y + 100, { button: 'right' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'tests/screens/edit-menu.png' });
};
