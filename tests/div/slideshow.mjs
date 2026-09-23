// !SlideShow: start from the Filer, catch the first picture mid-transition, then a finished slide, then Escape.
const SHOT = process.env.SHOTDIR || 'tests/screens';
export default async (page) => {
  await page.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Images.!SlideShow'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOT}/div-slideshow-start.png` });
  const st = () => page.evaluate(() => { const t = os.apps.tasksOf('SlideShow')[0]; return t?.slideshow ? { ...t.slideshow.state } : null; });
  console.log('state', JSON.stringify(await st()));
  // mid-transition of the first slide
  await page.waitForFunction(() => { const s = os.apps.tasksOf('SlideShow')[0]?.slideshow?.state; return s && s.phase === 'transition' && s.step >= s.steps / 2; }, null, { timeout: 15000, polling: 5 });
  await page.screenshot({ path: `${SHOT}/div-slideshow-mid1.png` });
  console.log('mid1', JSON.stringify(await st()));
  // speed up and wait for a table effect mid-way
  await page.evaluate(() => { os.apps.tasksOf('SlideShow')[0].slideshow.state.hold = 200; });
  await page.waitForFunction(() => { const s = os.apps.tasksOf('SlideShow')[0]?.slideshow?.state; return s && s.phase === 'transition' && s.shown >= 9 && !/wipe|slats/.test(s.effect) && s.step >= s.steps / 3; }, null, { timeout: 60000, polling: 5 });
  await page.screenshot({ path: `${SHOT}/div-slideshow-mid2.png` });
  console.log('mid2', JSON.stringify(await st()));
  await page.waitForFunction(() => { const s = os.apps.tasksOf('SlideShow')[0]?.slideshow?.state; return s && s.phase === 'decode'; }, null, { timeout: 15000, polling: 5 });
  await page.screenshot({ path: `${SHOT}/div-slideshow-slide.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  console.log('after escape tasks', await page.evaluate(() => os.apps.tasksOf('SlideShow').length), 'overlays', await page.evaluate(() => document.querySelectorAll('.fullscreen-program').length));
};
