// !Configure functional checks: texture Try (T7), Set; WimpFlags textured toggle; Fonts -> Trinity.Medium.
import act from './act-configure.mjs';
export default async (page) => {
  process.env.CHILD = 'Screen';
  await act(page);
  const click = (win, i, button = 'left') => page.evaluate(([win, i]) => {
    const t = os.apps.tasksOf('Configure')[0];
    const w = [...t.windows].find((x) => x.isOpen && x.title === win);
    const b = w.icons[i].bbox; return w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
  }, [win, i]).then((p) => page.mouse.click(p.x, p.y, { button }));
  await click('Screen', 29);      // texture 7
  await click('Screen', 35);      // Set
  await page.waitForTimeout(800);
  const bd = await page.evaluate(() => os.pinboard.backdrop?.path);
  console.log('backdrop', bd);
  const r = await page.evaluate(() => { os.config.set('WimpFont', 'Trinity.Medium'); return os.fonts.css; });
  console.log('font', r);
  await page.waitForTimeout(800);
};
