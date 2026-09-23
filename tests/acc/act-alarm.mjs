// Alarm: start, open Set alarm (repeating), set one a few seconds ahead, browser, going off.
export default async (page) => {
  await page.evaluate(() => os.apps.start('Alarm'));
  await page.waitForTimeout(800);
  const step = process.env.STEP || 'set';
  if (step === 'set') {
    await page.evaluate(() => { const t = os.apps.tasksOf('Alarm')[0]; t.alarm.openSetAlarm(); });
    await page.waitForTimeout(300);
    await page.keyboard.type('Dentist appointment');
    // tick "Repeating alarm"
    const w = await page.evaluate(() => { const t = os.apps.tasksOf('Alarm')[0]; const w = [...t.windows].find((x) => x.title === 'Set alarm'); const p = w.workToScreen(w.icons[19].bbox.x0 + 10, w.icons[19].bbox.y0 + 10); return p; });
    await page.mouse.click(w.x, w.y);
    await page.waitForTimeout(300);
  } else if (step === 'browser') {
    await page.evaluate(() => { const t = os.apps.tasksOf('Alarm')[0]; const now = Date.now(); t.alarm.alarms.push({ id: 90, t: now + 3600e3, msg: ['Meeting with Acorn', '', ''], repeat: null }, { id: 91, t: now + 86400e3 * 3, msg: ['Backup', '', ''], repeat: { mode: 'every', n: 1, unit: 3 } }); t.alarm.openBrowser(); });
    await page.waitForTimeout(400);
  } else if (step === 'off') {
    await page.evaluate(() => { const t = os.apps.tasksOf('Alarm')[0]; t.alarm.alarms.push({ id: 92, t: Date.now() - 1000, msg: ['Time for tea', '', ''], urgent: true, repeat: { mode: 'every', n: 1, unit: 2 } }); t.alarm.checkAlarms(); });
    await page.waitForTimeout(400);
  } else if (step === 'setup') {
    await page.evaluate(() => { const t = os.apps.tasksOf('Alarm')[0]; t.alarm.openSetup(); });
    await page.waitForTimeout(400);
  } else if (step === 'menu') {
    const ib = page.locator('.ibicon');
    const n = await ib.count();
    const b = await ib.nth(n - 1).boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + 10, { button: 'right' });
    await page.waitForTimeout(300);
  }
};
// (STEP=menu) hover the Info item as well
