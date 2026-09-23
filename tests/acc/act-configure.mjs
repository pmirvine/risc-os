// !Configure: open the main window, then (env CHILD=name) one plug-in window by clicking its icon.
export default async (page) => {
  await page.evaluate(() => os.apps.start('Configure'));
  await page.waitForTimeout(1000);
  const child = process.env.CHILD;
  if (!child) return;
  const idx = ['HardDiscs', 'Floppies', null, 'Printer', 'Mouse', 'Keyboard', 'Memory', 'Sound', 'Screen', 'Fonts', 'WimpFlags', 'Apps', 'System', 'Lock'].indexOf(child);
  const p = await page.evaluate((i) => {
    const t = os.apps.tasksOf('Configure')[0];
    const w = [...t.windows].find((x) => x.isOpen);
    const b = w.icons[i].bbox;
    return w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
  }, idx);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(800);
};
