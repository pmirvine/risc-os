// Edit: F4 Find/Replace, wildcards, Goto, fileinfo icon, save box to RAM disc, close query.
const E = (page, body) => page.evaluate(`(async () => { const E = await import('/src/apps/Edit/api.js'); const app = E.currentEdit(); ${body} })()`);
export default async (page) => {
  await page.evaluate(() => os.apps.start('Edit'));
  await page.waitForTimeout(600);
  await E(page, `const s = await app.open('', 0xFFF); s.doc.setText('one two three\\nfour five six two\\nseven two eight\\n'); s.views[0].setCaret(0);`);
  await page.waitForTimeout(200);
  await page.keyboard.press('F4');
  await page.waitForTimeout(200);
  await page.keyboard.type('two');
  await page.keyboard.press('Enter');
  await page.keyboard.type('TWO');
  await page.keyboard.press('F6');         // wildcarded expressions on -> big box
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'tests/screens/edit-find.png' });
  await page.keyboard.press('F6');         // off again
  await page.keyboard.press('Enter');      // Go
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'tests/screens/edit-found.png' });
  console.log('after go', await E(page, `return JSON.stringify([app.states[0].views[0].caret, E.scrap.start, E.scrap.end])`));
  await page.keyboard.press('r');           // Replace -> next
  await page.keyboard.press('e');           // End of file replace
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'tests/screens/edit-replaced.png' });
  console.log('text', await E(page, `return JSON.stringify(app.states[0].doc.text)`));
  await page.keyboard.press('d');           // reDo (nothing)
  await page.keyboard.press('u');           // Undo last
  console.log('undo', await E(page, `return JSON.stringify(app.states[0].doc.text)`));
  await page.keyboard.press('Escape');
  // wildcard search: t.o  -> "two" ; magic \\d
  await page.keyboard.press('F4');
  await page.keyboard.press('F6');
  await page.keyboard.type('f%@');
  await page.keyboard.press('F3');          // Count
  await page.waitForTimeout(100);
  console.log('count msg', await E(page, `return app.find.fbox.field(4)`));
  await page.keyboard.press('Escape');
  // Goto
  await page.keyboard.press('F5');
  await page.waitForTimeout(100);
  await page.keyboard.type('3');
  await page.screenshot({ path: 'tests/screens/edit-goto.png' });
  await page.keyboard.press('Enter');
  console.log('goto caret', await E(page, `return app.states[0].views[0].caret`));
  // F3 save box -> type RAM path -> Return
  await page.keyboard.press('F3');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'tests/screens/edit-savebox.png' });
  await page.keyboard.press('Control+u');
  await page.keyboard.type('RAM::RamDisc0.$.Doc');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log('saved', await page.evaluate(() => JSON.stringify(os.vfs.stat('RAM::RamDisc0.$.Doc'))), await E(page, `return app.states[0].views[0].win.title`));
  // modify then close with Ctrl-F2 -> query
  await page.keyboard.type('x');
  await page.keyboard.press('Control+F2');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'tests/screens/edit-closequery.png' });
  await page.keyboard.press('Escape');
};
