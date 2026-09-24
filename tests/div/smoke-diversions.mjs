// Smoke test of the Diversions games/utilities: run each from the Filer, click its icon bar icon, click and type
// in its window, open the icon bar menu (screenshot div-smoke-<app>.png), then Quit from the menu.
// node tests/core/shot.mjs div-smoke tests/div/smoke-diversions.mjs   (SMOKE=Meteors,Clock to pick)
const SHOT = process.env.SHOTDIR || 'tests/screens';
const APPS = (process.env.SMOKE || 'Meteors,MineHunt,Patience,Puzzle,Blocks,Clock,MemNow,Flasher').split(',');
export default async (page) => {
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const scale = await page.evaluate(() => os.wimp.scale || 1);
  for (const app of APPS) {
    errs.length = 0;
    await page.evaluate((a) => os.filer.run('ADFS::HardDisc4.$.Diversions.!' + a), app);
    await page.waitForTimeout(1500);
    const ib = await page.evaluate((a) => {
      const it = os.wimp.iconbar.items.find((i) => i.task?.name === a);
      const r = it?.icon?.el?.getBoundingClientRect?.() ?? it?.el?.getBoundingClientRect?.();
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    }, app);
    if (ib) { await page.mouse.click(ib.x, ib.y); await page.waitForTimeout(800); }
    const win = await page.evaluate((a) => {
      const ws = [...os.wimp.windows].filter((w) => w.isOpen && w.task?.name === a);
      const w = ws[ws.length - 1]; return w ? { title: w.title, x: w.x + w.w / 2, y: w.y + w.h / 2 } : null;
    }, app);
    if (win) {
      await page.mouse.click(win.x * scale, win.y * scale);
      await page.waitForTimeout(300);
      for (const k of ['ArrowLeft', 'ArrowRight', 'Space', 'ArrowUp', 'KeyZ', 'KeyX', 'Enter']) { await page.keyboard.press(k); await page.waitForTimeout(80); }
      await page.waitForTimeout(1000);
    }
    let menu = null;
    if (ib) {
      await page.mouse.click(ib.x, ib.y, { button: 'middle' });
      await page.waitForTimeout(400);
      menu = await page.evaluate(() => [...document.querySelectorAll('.layer-menus *')].filter((e) => !e.children.length && e.textContent.trim()).map((e) => e.textContent.trim()).join('|'));
    }
    await page.screenshot({ path: `${SHOT}/div-smoke-${app.toLowerCase()}.png` });
    // Quit from the menu
    const q = await page.evaluate(() => { const e = [...document.querySelectorAll('.layer-menus *')].find((x) => x.textContent.trim() === 'Quit' && !x.children.length); const r = e?.getBoundingClientRect(); return r && { x: r.x + 5, y: r.y + r.height / 2 }; });
    if (q) { await page.mouse.click(q.x, q.y); await page.waitForTimeout(600); } else await page.keyboard.press('Escape');
    const left = await page.evaluate((a) => os.apps.tasksOf(a).length, app);
    if (left) await page.evaluate((a) => os.apps.tasksOf(a).forEach((t) => t.quit()), app);
    await page.waitForTimeout(300);
    console.log(`SMOKE ${app.padEnd(9)} icon=${!!ib} window=${win ? JSON.stringify(win.title) : '-'} menu=[${menu}] quitViaMenu=${q ? !left : 'no Quit'} errors=${errs.length ? JSON.stringify(errs) : 0}`);
  }
};
