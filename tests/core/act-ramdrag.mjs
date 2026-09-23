export default async (page) => {
  await page.evaluate(() => os.switcher.toggleDisplay());
  await page.waitForTimeout(300);
  const p = await page.evaluate(() => { const s = os.switcher; const r = s.rows.find((q) => q.label === 'RAM disc'); return s.win.workToScreen(s._barX + 20, (r.y0 + r.y1) / 2); });
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x - 60, p.y, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(300);
  console.log('RAM present after drag to 0:', await page.evaluate(() => os.ramdisc.present));
  await page.mouse.move(p.x - 18, p.y); await page.mouse.down(); await page.mouse.move(p.x + 80, p.y, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(300);
  console.log('RAM present after drag up:', await page.evaluate(() => os.ramdisc.present), await page.evaluate(() => os.vfs.ram.size));
};
