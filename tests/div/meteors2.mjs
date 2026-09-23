// Game over, focus toggling, pause, moving the window, closing.
const M = () => os.wimp.tasks.find((t) => t.name === 'Meteors')?.meteors?.state;
export default async (page) => {
  await page.evaluate(() => os.cli.run('Meteors_Start'));
  await page.waitForTimeout(1000);
  const st = async (l) => console.log(l, JSON.stringify(await page.evaluate(`(${M})()`)));
  await st('start');
  const t0 = await page.evaluate(() => performance.now());
  await page.waitForTimeout(2000);
  await st('after 2s');
  // click toggles focus -> frozen
  await page.mouse.click(300, 500);
  await page.waitForTimeout(300);
  await st('clicked');
  await page.mouse.click(300, 500);
  await page.waitForTimeout(300);
  await st('clicked again');
  await page.keyboard.press('End');
  await page.waitForTimeout(200);
  await st('paused');
  await page.keyboard.press('Delete');
  // kill all ships
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => os.wimp.tasks.find((t) => t.name === 'Meteors').meteors.killship());
    await page.waitForFunction(() => { const s = os.wimp.tasks.find((t) => t.name === 'Meteors').meteors.state; return s.ship.type < 32 || s.gameoverflag === 1; }, null, { timeout: 20000 }).catch(() => {});
    await st('killed ' + i);
  }
  await page.waitForTimeout(2500);
  await st('over');
  await page.screenshot({ path: 'tests/screens/div-meteors-over.png' });
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await st('new game');
  // drag the window by its title
  await page.mouse.move(300, 267); await page.mouse.down(); await page.mouse.move(500, 100, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'tests/screens/div-meteors-moved.png' });
  await page.evaluate(() => { const t = os.wimp.tasks.find((t) => t.name === 'Meteors'); [...t.windows][0].requestClose({}); });
  await page.waitForTimeout(300);
  console.log('tasks', await page.evaluate(() => os.wimp.tasks.map((t) => t.name).join(',')));
};
