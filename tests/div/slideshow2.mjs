// !SlideShow: capture each table effect (circ, shrink, diag*, random, rotsq) mid-way, with a short hold.
const SHOT = process.env.SHOTDIR || 'tests/screens';
export default async (page) => {
  await page.evaluate(() => os.apps.start('SlideShow'));
  await page.waitForFunction(() => os.apps.tasksOf('SlideShow')[0]?.slideshow, null, { timeout: 10000 });
  await page.evaluate(() => { os.apps.tasksOf('SlideShow')[0].slideshow.state.hold = 50; });
  const want = new Set(['circ', 'shrink', 'diag', 'random', 'rotsq']);
  const t0 = Date.now();
  while (want.size && Date.now() - t0 < 90000) {
    const s = await page.waitForFunction((w) => { const s = os.apps.tasksOf('SlideShow')[0]?.slideshow?.state; const e = s?.effect.replace(/\d$/, ''); return s && s.phase === 'transition' && w.includes(e) && s.step >= s.steps * 0.4 && s.step <= s.steps * 0.6 && { ...s }; }, [...want], { timeout: 90000, polling: 5 }).then((h) => h.jsonValue());
    const e = s.effect.replace(/\d$/, '');
    await page.screenshot({ path: `${SHOT}/div-slideshow-${e}.png` });
    console.log(JSON.stringify(s));
    want.delete(e);
  }
  await page.keyboard.press('Escape');
};
