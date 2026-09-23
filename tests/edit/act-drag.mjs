// Edit: select drag, adjust extend, Ctrl-C copy, Ctrl-V move, drag file into window, save-as drag to a Filer window.
const E = (page, body) => page.evaluate(`(async () => { const E = await import('/src/apps/Edit/api.js'); const app = E.currentEdit(); ${body} })()`);
const st = (page) => E(page, `const s = app.states[0], v = s.views[0]; return JSON.stringify({ caret: v.caret, sel: E.scrap.doc ? [E.scrap.start, E.scrap.end] : null, text: s.doc.text, title: v.win.title })`);
export default async (page) => {
  await page.evaluate(() => os.apps.start('Edit'));
  await page.waitForTimeout(500);
  await page.evaluate(() => os.vfs.writeFile('RAM::RamDisc0.$.Insert', 'INSERTED\n', { filetype: 0xFFF }));
  await E(page, `const s = await app.open('', 0xFFF); s.doc.setText('alpha beta gamma\\ndelta epsilon\\nzeta eta theta\\n');`);
  await page.waitForTimeout(200);
  const w = await E(page, `const v = app.states[0].views[0].win; return { x: v.x, y: v.y }`);
  // select-drag from "beta" to "epsilon"
  await page.mouse.move(w.x + 2 + 6 * 8, w.y + 8);
  await page.mouse.down();
  await page.mouse.move(w.x + 2 + 8 * 8, w.y + 16 + 8, { steps: 6 });
  await page.mouse.up();
  console.log('drag', await st(page));
  // adjust-click (shift) extends to the end of "epsilon"
  await page.keyboard.down('Shift');
  await page.mouse.click(w.x + 2 + 13 * 8, w.y + 16 + 8);
  await page.keyboard.up('Shift');
  console.log('adjust', await st(page));
  await page.screenshot({ path: 'tests/screens/edit-select.png' });
  // caret to line 3 start and Ctrl-C copies the selection there
  await page.mouse.click(w.x + 2, w.y + 32 + 8);
  await page.keyboard.press('Control+c');
  console.log('copy', await st(page));
  await page.keyboard.press('F8');
  console.log('undo', await st(page));
  // drag a file from a Filer window into the Edit window
  await page.evaluate(() => os.filer.openDir('RAM::RamDisc0.$', { x: 600, y: 100, w: 300, h: 160 }));
  await page.waitForTimeout(500);
  const icon = await page.evaluate(() => { const v = [...os.filer.viewers.values()].find((q) => q.path.startsWith('RAM')); const i = v.items.findIndex((it) => it.name === 'Insert'); const r = v.itemRect(i); const p = v.win.workToScreen((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2); return p; });
  await page.mouse.move(icon.x, icon.y);
  await page.mouse.down();
  await page.mouse.move(icon.x - 30, icon.y + 30, { steps: 5 });
  await page.mouse.move(w.x + 60, w.y + 100, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  console.log('dropped', await st(page));
  // save-as drag into the Filer window: F3 then drag the file icon
  await page.keyboard.press('F3');
  await page.waitForTimeout(300);
  const spr = await page.evaluate(() => { const lv = wimp.menus.levels[0]; const ic = lv.win.icons[2]; return lv.win.workToScreen((ic.bbox.x0 + ic.bbox.x1) / 2, (ic.bbox.y0 + ic.bbox.y1) / 2); });
  await page.mouse.move(spr.x, spr.y);
  await page.mouse.down();
  await page.mouse.move(spr.x + 20, spr.y + 20, { steps: 4 });
  await page.mouse.move(750, 200, { steps: 10 });
  await page.screenshot({ path: 'tests/screens/edit-savedrag.png' });
  await page.mouse.up();
  await page.waitForTimeout(500);
  console.log('RAM', await page.evaluate(() => os.vfs.list('RAM::RamDisc0.$').map((f) => `${f.name}(${f.filetype.toString(16)},${f.size})`).join(' ')), JSON.parse(await st(page)).title);
  await page.screenshot({ path: 'tests/screens/edit-saved.png' });
};
