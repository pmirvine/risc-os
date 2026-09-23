// !Bookworm: big index page timing, URL bar toggled off and window resized (reformat to the new width).
export default async (page) => {
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.evaluate(() => os.apps.start('Bookworm'));
  await page.waitForTimeout(800);
  const r = await page.evaluate(async () => {
    const t = os.apps.tasksOf('Bookworm')[0];
    const v = t.bookworm.newView('file://ROManual:INDEX/S.HTM');
    await new Promise((r) => setTimeout(r, 1500));
    const t0 = performance.now(); v.reformat(true); const t1 = performance.now();
    await v.go('file://ROManual:BOOKB/BOOK_8.HTM'); const t2 = performance.now();
    v.toggleBar('url');
    v.win.open({ w: 420, h: 500 });
    await new Promise((r) => setTimeout(r, 300));
    return { reformat: t1 - t0, go: t2 - t1, lines: v.layout.lines.length, dw: v.displayWidth };
  });
  console.log(JSON.stringify(r));
  await page.waitForTimeout(800);
};
