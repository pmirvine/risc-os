// ChangeFSI: convert a JPEG from the seed disc, open the icon bar menu and dialogues.
//   CFSI=menu  -> icon bar menu with the Sprite Output dialogue open
//   CFSI=256   -> reprocess to 256 colours (mode 28, dithered) and show Image info
//   CFSI=scale / proc / jpeg -> other dialogues
const icon = (page) => page.evaluate(() => {
  const it = os.wimp.iconbar.items.find((i) => i.task?.name === 'ChangeFSI');
  const r = it.icon.el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
async function hoverItem(page, text) {
  const box = await page.evaluate((t) => {
    const els = [...document.querySelectorAll('.layer-menus *')].filter((e) => e.textContent === t && e.children.length === 0);
    const r = els[0]?.getBoundingClientRect();
    return r && { x: r.x + 5, y: r.y + r.height / 2, right: r.right };
  }, text);
  if (!box) return;
  await page.mouse.move(box.x, box.y);
  await page.mouse.move(box.x + 170, box.y, { steps: 5 });
  await page.waitForTimeout(500);
}
export default async (page) => {
  const mode = process.env.CFSI || '';
  await page.evaluate(async () => { await os.apps.start('ChangeFSI'); });
  await page.waitForTimeout(500);
  if (mode === '256') await page.evaluate(() => { /* select 256 colours square via a click on the dialogue */ });
  await page.evaluate(() => {
    const it = os.wimp.iconbar.items.find((i) => i.task?.name === 'ChangeFSI');
    it.onDataLoad({ files: [{ path: 'ADFS::HardDisc4.$.Images.00-49.sa05', filetype: 0xC85 }] });
  });
  await page.waitForTimeout(2500);
  const ib = await icon(page);
  const menuOn = async () => { await page.mouse.click(ib.x, ib.y, { button: 'middle' }); await page.waitForTimeout(300); };
  if (mode === 'menu' || mode === '256') {
    await menuOn();
    await hoverItem(page, 'Sprite Output');
  }
  if (mode === '256') {
    // click the square "256" radio (icon 6) and the Colour radio, then Reprocess from the menu
    await page.evaluate(() => {
      const w = [...os.wimp.windows].find((x) => x.title === 'Sprite Output');
      const ic = w.icons[6]; const b = ic.bbox; const p = w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
      window.__p = p;
    });
    const p = await page.evaluate(() => window.__p);
    const r = await page.evaluate(() => os.wimp.scale);
    await page.mouse.click(p.x * r, p.y * r);
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await menuOn();
    const box = await page.evaluate(() => { const e = [...document.querySelectorAll('.layer-menus *')].find((x) => x.textContent === 'Reprocess' && !x.children.length); const r = e.getBoundingClientRect(); return { x: r.x + 5, y: r.y + 5 }; });
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(3000);
    // image menu -> Image info
    const w = await page.evaluate(() => { const w = [...os.wimp.windows].find((x) => /sa05/.test(x.title)); return { x: w.x + 100, y: w.y + 100 }; });
    await page.mouse.click(w.x, w.y, { button: 'middle' });
    await page.waitForTimeout(300);
    await hoverItem(page, 'Image info');
  }
  if (mode === 'scale' || mode === 'proc' || mode === 'jpeg' || mode === 'info') {
    await menuOn();
    await hoverItem(page, { scale: 'Scaling', proc: 'Processing', jpeg: 'JPEG Output', info: 'Info' }[mode]);
  }
  if (mode === 'source' || mode === 'zoom' || mode === 'save') {
    const w = await page.evaluate(() => { const w = [...os.wimp.windows].find((x) => /sa05/.test(x.title)); return { x: w.x + 100, y: w.y + 100 }; });
    await page.mouse.click(w.x, w.y, { button: 'middle' });
    await page.waitForTimeout(300);
    await hoverItem(page, { source: 'Source info', zoom: 'Zoom', save: 'Save image' }[mode]);
  }
};
