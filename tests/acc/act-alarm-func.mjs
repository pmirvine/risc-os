// Functional: set an alarm via the Save button, check it is stored in Choices:Alarm.Alarms, analogue clock.
export default async (page) => {
  await page.evaluate(() => os.apps.start('Alarm'));
  await page.waitForTimeout(600);
  await page.evaluate(() => os.apps.tasksOf('Alarm')[0].alarm.openSetAlarm());
  await page.waitForTimeout(200);
  await page.keyboard.type('Func test');
  const p = await page.evaluate(() => { const t = os.apps.tasksOf('Alarm')[0]; const w = [...t.windows].find((x) => x.title === 'Set alarm'); return w.workToScreen(w.icons[31].bbox.x0 + 10, w.icons[31].bbox.y0 + 10); });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(300);
  const r = await page.evaluate(async () => { const t = os.apps.tasksOf('Alarm')[0]; t.alarm.setup.display = 'anasec'; return { n: t.alarm.alarms.length, file: os.vfs.exists('Choices:Alarm.Alarms') ? (await os.vfs.readText('Choices:Alarm.Alarms')).slice(0, 80) : null }; });
  console.log('RESULT', JSON.stringify(r));
  await page.waitForTimeout(1500);
};
