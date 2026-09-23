// Random keys, clicks and menu picks in an Edit window; page errors are printed by shot.mjs.
export default async (page) => {
  await page.evaluate(() => os.apps.start('Edit'));
  await page.waitForTimeout(500);
  await page.evaluate(async () => { const { currentEdit } = await import('/src/apps/Edit/api.js'); const s = await currentEdit().open('ADFS::HardDisc4.$.Diversions.!Puzzle.!Help'); s.views[0].setCaret(0, { take: true }); });
  await page.waitForTimeout(500);
  const w = await page.evaluate(() => { const t = os.apps.tasksOf('Edit')[0]; const w = [...t.windows].find((q) => q.isOpen); return { x: w.x, y: w.y, w: w.w, h: w.h }; });
  const keys = ['a', 'b', 'Enter', 'Backspace', 'Delete', 'End', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift+ArrowUp', 'Control+ArrowDown', 'Shift+ArrowLeft', 'Control+End', 'Shift+End', 'F6', 'F7', 'F8', 'F9', 'Shift+F6', 'Shift+F7', 'Control+F7', 'Control+F6', 'Control+F8', 'Insert', 'Home', 'PageDown', 'PageUp', 'Shift+F1', 'Shift+F3', 'Control+F5', 'Escape', 'Control+c', 'Control+v', 'Control+x', 'Control+z'];
  let seed = 12345; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let i = 0; i < 400; i++) {
    const r = rnd(10);
    if (r < 7) await page.keyboard.press(keys[rnd(keys.length)]);
    else if (r < 9) await page.mouse.click(w.x + rnd(w.w), w.y + rnd(w.h));
    else { await page.mouse.move(w.x + rnd(w.w), w.y + rnd(w.h)); await page.mouse.down(); await page.mouse.move(w.x + rnd(w.w), w.y + rnd(w.h), { steps: 3 }); await page.mouse.up(); }
    if (await page.evaluate(() => wimp.menus.isOpen || wimp.caret?.window?.title?.startsWith('Edit') === false && !wimp.caret?.window?.title?.includes('!Help'))) await page.keyboard.press('Escape');
  }
  console.log('text length', await page.evaluate(async () => { const { currentEdit } = await import('/src/apps/Edit/api.js'); return currentEdit().states[0]?.doc.length; }));
  await page.screenshot({ path: 'tests/screens/edit-monkey.png' });
};
