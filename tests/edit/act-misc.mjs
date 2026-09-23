const E = (page, body) => page.evaluate(`(async () => { const E = await import('/src/apps/Edit/api.js'); const app = E.currentEdit(); ${body} })()`);
export default async (page) => {
  await page.evaluate(() => os.apps.start('Edit'));
  await page.waitForTimeout(500);
  await E(page, `const s = await app.open('', 0xFFF); s.doc.setText('a\\tb\\tc\\n'); s.views[0].setCaret(0, { take: true });`);
  await page.keyboard.press('Shift+Control+F1');      // expand tabs
  console.log('expand', await E(page, `return JSON.stringify(app.states[0].doc.text)`));
  await page.keyboard.press('Control+F5');            // wordwrap on
  await page.keyboard.press('Control+ArrowDown');
  await page.keyboard.type('The quick brown fox jumps over the lazy dog and keeps running far far away into the distance beyond the hills. ');
  console.log('wrap', await E(page, `return JSON.stringify(app.states[0].doc.text)`));
  await page.keyboard.press('Shift+F3');              // column tab
  await page.keyboard.press('Shift+F1');              // overwrite
  console.log('title', await E(page, `return app.states[0].views[0].win.title`), await page.evaluate(() => os.sysvars.get('Edit$Options')));
  await E(page, `app.states[0].splitWindow();`);
  await page.waitForTimeout(200);
  console.log('views', await E(page, `return app.states[0].views.map((v) => v.win.title).join(' | ')`));
  await page.screenshot({ path: 'tests/screens/edit-views.png' });
  // PreQuit with a modified file: the quit query appears
  await page.evaluate(() => { wimp.sendMessage('PreQuit', { object: () => { window.__objected = true; }, single: true }, { to: os.apps.tasksOf('Edit')[0] }); });
  await page.waitForTimeout(300);
  console.log('objected', await page.evaluate(() => window.__objected));
  await page.screenshot({ path: 'tests/screens/edit-quitquery.png' });
  await page.keyboard.press('Enter');               // Discard (default)
  await page.waitForTimeout(300);
  console.log('edit running', await page.evaluate(() => os.apps.tasksOf('Edit').length));
};
