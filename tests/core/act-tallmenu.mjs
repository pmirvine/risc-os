export default async (page) => {
  await page.evaluate(async () => {
    const { Menu } = await import('/src/core/menu.js');
    const items = Array.from({ length: 50 }, (_, i) => ({ text: 'Item ' + i, dotted: i % 10 === 9 }));
    wimp.menus.open(new Menu('Tall', items), 300, 100);
  });
  await page.waitForTimeout(200);
  await page.mouse.move(340, 300);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(300);
};
