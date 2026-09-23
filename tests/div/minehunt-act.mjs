// Start MineHunt, open the game, play a few clicks, show menus.
export default async (page) => {
  await page.evaluate(() => os.apps.start('MineHunt'));
  await page.waitForTimeout(1200);
  // click the icon bar icon
  const ib = await page.evaluate(() => { const i = [...document.querySelectorAll('.iconbar img, .iconbar .icon')].pop(); const r = i?.getBoundingClientRect(); return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.evaluate(() => { const t = os.apps.tasksOf('MineHunt')[0]; });
  const w = await page.evaluate(() => { const win = [...os.wimp.windows].find((w) => w.title === 'Mine Hunt'); return win ? null : 'none'; });
  const mode = process.env.MH || 'play';
  // find the game window
  const g = async () => page.evaluate(() => { const win = [...os.wimp.windows].find((w) => w.task?.name === 'MineHunt' && w.title === 'Mine Hunt'); return win && { x: win.x, y: win.y, w: win.w, h: win.h, open: win.isOpen }; });
  let geo = await g();
  if (!geo || !geo.open) {
    // Select on icon bar icon
    const pos = await page.evaluate(() => { const h = os.wimp.iconbar.items.find((i) => i.task?.name === 'MineHunt'); const e = h?.icon?.el; const r = e?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; });
    if (pos) await page.mouse.click(pos.x, pos.y);
    await page.waitForTimeout(600);
    geo = await g();
  }
  console.log('geo', JSON.stringify(geo));
  if (!geo) return;
  const cell = (cx, cy) => ({ x: geo.x + 16 + cx * 24 + 12, y: geo.y + 64 + cy * 24 + 12 });
  if (mode === 'play') {
    let p = cell(0, 0); await page.mouse.click(p.x, p.y);
    p = cell(7, 7); await page.mouse.click(p.x, p.y);
    p = cell(3, 4); await page.keyboard.down('Shift'); await page.mouse.click(p.x, p.y); await page.keyboard.up('Shift');
    p = cell(5, 1); await page.keyboard.down('Shift'); await page.mouse.click(p.x, p.y); await page.mouse.click(p.x, p.y); await page.keyboard.up('Shift');
    await page.waitForTimeout(1300);
  }
  if (mode === 'win') { await solve(page, geo); await page.keyboard.type('Fred'); await page.waitForTimeout(300); if (process.env.RET) { await page.keyboard.press('Enter'); await page.waitForTimeout(500); } }
  if (mode === 'lose') { const st = await page.evaluate(() => os.apps.tasksOf('MineHunt')[0].debugState()); const k = st.mines.indexOf(1); let p = cell(0, 0); const f = st.mines.indexOf(1, k + 1); p = cell(f % st.W, Math.floor(f / st.W)); await page.keyboard.down('Shift'); await page.mouse.click(p.x, p.y); await page.keyboard.up('Shift'); p = cell(k % st.W, Math.floor(k / st.W)); await page.mouse.click(p.x, p.y); await page.waitForTimeout(300); }
  if (mode === 'menu') {
    await page.mouse.click(geo.x + 50, geo.y + 100, { button: 'middle' });
    await page.waitForTimeout(300);
    const it = await page.evaluate(() => { const e = [...document.querySelectorAll('*')].find((n) => n.childElementCount === 0 && n.textContent === 'Level'); const r = e?.getBoundingClientRect(); return r && { x: r.right + 60, y: r.y + r.height / 2 }; });
    if (it) { await page.mouse.move(it.x - 70, it.y); await page.mouse.move(it.x, it.y, { steps: 5 }); }
    await page.waitForTimeout(400);
  }
};
// MH=win: solve the board (flag mines with Adjust, uncover the rest) to reach the name entry
export async function solve(page, geo) {
  const st = await page.evaluate(() => os.apps.tasksOf('MineHunt')[0].debugState());
  const cell = (cx, cy) => ({ x: geo.x + 16 + cx * 24 + 12, y: geo.y + 64 + cy * 24 + 12 });
  for (let y = 0; y < st.H; y++) for (let x = 0; x < st.W; x++) {
    const p = cell(x, y);
    if (st.mines[y * st.W + x]) { await page.keyboard.down('Shift'); await page.mouse.click(p.x, p.y); await page.keyboard.up('Shift'); }
  }
  for (let y = 0; y < st.H; y++) for (let x = 0; x < st.W; x++) {
    const p = cell(x, y);
    if (!st.mines[y * st.W + x]) await page.mouse.click(p.x, p.y);
  }
}
