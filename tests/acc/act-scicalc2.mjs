// SciCalc: type 255, click Base (icon 17) three times -> hex, then click SIN in dec deg mode.
import first from './act-scicalc.mjs';
export default async (page) => {
  process.env.KEYS = '255';
  await first(page);
  const at = (i) => page.evaluate((i) => { const w = os.apps.tasksOf('SciCalc')[0].calcWindow; const b = w.icons[i].bbox; return w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2); }, i);
  for (let n = 0; n < 3; n++) { const p = await at(17); await page.mouse.click(p.x, p.y); await page.waitForTimeout(100); }
  console.log('HEX', await page.evaluate(() => os.apps.tasksOf('SciCalc')[0].calc.display()));
  await page.waitForTimeout(200);
};
