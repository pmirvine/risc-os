// SciCalc: start, open the calculator, type an expression with keys and click some buttons.
export default async (page) => {
  await page.evaluate(() => os.apps.start('SciCalc'));
  await page.waitForTimeout(800);
  await page.evaluate(() => os.apps.tasksOf('SciCalc')[0].openCalc());
  await page.waitForTimeout(300);
  const seq = process.env.KEYS ?? '12+3*4=';
  for (const k of seq) await page.keyboard.type(k);
  await page.waitForTimeout(200);
  console.log('DISPLAY', await page.evaluate(() => os.apps.tasksOf('SciCalc')[0].calc.display()));
};
