// ChangeFSI picture menu: open each submenu (hover over the item's arrow). CFSIP=Image info|Source info|Range info|Zoom|Save image
export default async (page) => {
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  const item = process.env.CFSIP || 'Source info';
  await page.evaluate(async () => { await os.apps.start('ChangeFSI'); });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const it = os.wimp.iconbar.items.find((i) => i.task?.name === 'ChangeFSI');
    it.onDataLoad({ files: [{ path: 'ADFS::HardDisc4.$.Images.00-49.sa05', filetype: 0xC85 }] });
  });
  await page.waitForFunction(() => [...os.wimp.windows].some((x) => /sa05/.test(x.title) && x.isOpen), null, { timeout: 10000 });
  await page.waitForTimeout(1500);
  const w = await page.evaluate(() => { const w = [...os.wimp.windows].find((x) => /sa05/.test(x.title)); return { x: w.x + 60, y: w.y + 60 }; });
  const s = await page.evaluate(() => os.wimp.scale || 1);
  await page.mouse.click(w.x * s, w.y * s, { button: 'middle' });
  await page.waitForTimeout(300);
  const box = await page.evaluate((t) => {
    const e = [...document.querySelectorAll('.layer-menus *')].find((x) => x.textContent === t && !x.children.length);
    const row = e?.parentElement; const r = (row || e).getBoundingClientRect(); return r && { x: r.right - 8, y: r.y + r.height / 2, l: r.x };
  }, item);
  await page.mouse.move(box.l + 5, box.y); await page.mouse.move(box.x, box.y, { steps: 4 });
  await page.waitForTimeout(600);
};
