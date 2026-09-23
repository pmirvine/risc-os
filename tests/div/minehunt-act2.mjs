// Expert level + Custom level dialogue + Info box.
import base from './minehunt-act.mjs';
const find = (page, text) => page.evaluate((t) => { const e = [...document.querySelectorAll('*')].filter((n) => n.childElementCount === 0 && n.textContent === t).pop(); const r = e?.getBoundingClientRect(); return r && { x: r.x + 10, y: r.y + r.height / 2, r: r.right }; }, text);
export default async (page) => {
  process.env.MH = 'none';
  await base(page);
  const geo = await page.evaluate(() => { const w = [...os.wimp.windows].find((w) => w.task?.name === 'MineHunt' && w.title === 'Mine Hunt'); return { x: w.x, y: w.y }; });
  await page.mouse.click(geo.x + 50, geo.y + 100, { button: 'middle' });
  let it = await find(page, 'Level'); await page.mouse.move(it.x, it.y); await page.mouse.move(it.r + 20, it.y, { steps: 4 }); await page.waitForTimeout(300);
  it = await find(page, 'Expert'); await page.mouse.click(it.x, it.y); await page.waitForTimeout(400);
  const g2 = await page.evaluate(() => { const w = [...os.wimp.windows].find((w) => w.task?.name === 'MineHunt' && w.title === 'Mine Hunt'); return { x: w.x, y: w.y }; });
  await page.mouse.click(g2.x + 16 + 12 * 24 + 5, g2.y + 64 + 8 * 24 + 5);
  await page.mouse.click(g2.x + 100, g2.y + 150, { button: 'middle' });
  it = await find(page, 'Level'); await page.mouse.move(it.x, it.y); await page.mouse.move(it.r + 20, it.y, { steps: 4 }); await page.waitForTimeout(300);
  it = await find(page, 'Custom'); await page.mouse.move(it.x, it.y); await page.mouse.move(it.r + 40, it.y, { steps: 6 }); await page.waitForTimeout(500);
  if (process.env.OK) await customOk(page);
  if (process.env.INFO) { await page.keyboard.press("Escape"); await page.waitForTimeout(200); const p = await page.evaluate(() => { const h = os.wimp.iconbar.items.find((i) => i.task?.name === "MineHunt"); const r = h.icon.el.getBoundingClientRect(); return { x: r.x + 10, y: r.y + 10 }; }); await page.mouse.click(p.x, p.y, { button: "middle" }); await page.waitForTimeout(300); const i2 = await find(page, "Info"); await page.mouse.move(i2.x, i2.y); await page.mouse.move(i2.r + 30, i2.y, { steps: 5 }); await page.waitForTimeout(500); }
};
export async function customOk(page) {
  const up = await page.evaluate(() => { const w = [...os.wimp.windows].find((w) => w.title === 'Custom level'); const a = w.workToScreen(144, 20), b = w.workToScreen(190, 116); return { a, b }; });
  for (let i = 0; i < 3; i++) await page.mouse.click(up.a.x, up.a.y);
  await page.mouse.click(up.b.x, up.b.y); await page.waitForTimeout(500);
}
