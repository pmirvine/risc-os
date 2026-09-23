import base from './blocks.mjs';
const icons = (page) => page.evaluate(() => { const t = os.wimp.tasks.find((t) => t.name === 'Blocks'); const w = [...t.windows].find((w) => w.title === 'Alter keys'); return w.icons.slice(0, 4).map((i) => i.text).join('|') + ' caret=' + os.wimp.caret?.window?.title; });
export default async (page) => {
  await base(page);
  await page.keyboard.press('q');
  console.log('after q', await icons(page));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log('after down+return', await icons(page));
};
