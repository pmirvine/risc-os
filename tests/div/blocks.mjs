export default async (page) => {
  await page.evaluate(() => os.apps.start('Blocks'));
  await page.waitForTimeout(800);
  const ib = await page.evaluate(() => { const it = os.wimp.iconbar.items.find((i) => i.task?.name === 'Blocks'); const r = it.icon.el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(ib.x, ib.y);
  await page.waitForTimeout(500);
  for (let n = 0; n < 6; n++) {
    await page.keyboard.press('1'); await page.keyboard.press('1');
    await page.keyboard.press('2');
    await page.keyboard.press(' ');
    await page.waitForTimeout(700);
  }
  // turn Auto on via the menu (right-click on the icon bar icon -> Auto)
  await page.mouse.click(ib.x, ib.y, { button: 'right' });
  await page.waitForTimeout(300);
  const mb0 = await (await page.$('.menu')).boundingBox();
  await page.mouse.click(mb0.x + 30, mb0.y + 75);
  await page.waitForTimeout(300);
  await page.mouse.click(ib.x, ib.y);   // give focus back
  await page.waitForTimeout(12000);
  await page.mouse.click(ib.x, ib.y, { button: 'right' });
  await page.waitForTimeout(300);
  const mb = await (await page.$('.menu')).boundingBox();
  await page.mouse.move(mb.x + mb.width - 8, mb.y + 53);
  await page.waitForTimeout(800);
};
export async function keys(page) {}
