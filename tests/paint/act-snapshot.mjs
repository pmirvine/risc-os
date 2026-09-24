// node tests/paint/pw.mjs tests/paint/act-snapshot.mjs - icon bar menu > Snapshot of the whole screen
import { iconbarPos, hoverArrow, clickItem, saveBoxTo, check } from '../edit/ui.mjs';
export default async (page, h) => {
  await h.start();
  await page.evaluate(() => os.filer.openDir('ADFS::HardDisc4.$', { x: 400, y: 80, w: 400, h: 200 }));
  const ib = await iconbarPos(page, 'Paint');
  await page.mouse.click(ib.x, ib.y, { button: 'right' });
  await page.waitForTimeout(200);
  await clickItem(page, 0, 1);            // Snapshot ...
  await page.waitForTimeout(300);
  await h.shot('snapshot-box');
  const ic = await page.evaluate(() => { const w = [...wimp.windows].reverse().find((q) => q.isOpen && q.icons.length > 6 && q.task?.name === 'Paint'); const c = (i) => { const b = w.icons[i].bbox; return w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2); }; return { whole: c(5), ok: c(0), sel: w.icons[5].selected, title: w.title }; });
  console.log('snapshot box', ic.title);
  if (!ic.sel) await page.mouse.click(ic.whole.x, ic.whole.y);
  await page.mouse.click(ic.ok.x, ic.ok.y);
  await page.waitForTimeout(2500);
  await saveBoxTo(page, 'RAM::RamDisc0.$.Snap');
  const r = await page.evaluate(async () => { const { readSpriteFile } = await import('/src/apps/Paint/spritefile.js'); const b = await os.vfs.readFile('RAM::RamDisc0.$.Snap'); const s = readSpriteFile(b).sprites[0]; const n = new Set(); for (let i = 0; i < s.px.length; i += 97) n.add(s.px[i]); return { name: s.name, w: s.w, h: s.h, bpp: s.bpp, colours: n.size }; });
  check('snapshot saved as a sprite of the screen', r.w === 1024 && r.h === 768 && r.colours > 20, JSON.stringify(r));
  // show it: load the saved file
  await page.evaluate(() => os.filer.run('RAM::RamDisc0.$.Snap'));
  await page.waitForTimeout(1500);
  await h.shot('snapshot-result');
};
