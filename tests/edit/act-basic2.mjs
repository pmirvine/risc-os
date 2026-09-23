// Edit: BASIC detokenise/retokenise, icon bar menu, outline font display, drag file into window.
const E = (page, body) => page.evaluate(`(async () => { const E = await import('/src/apps/Edit/api.js'); const app = E.currentEdit(); ${body} })()`);
const menuItem = async (page, level, idx) => page.locator('.menu').nth(level).locator('.mitem').nth(idx).boundingBox();
const hoverArrow = async (page, level, idx) => { const b = await menuItem(page, level, idx); await page.mouse.move(b.x + 20, b.y + 10, { steps: 2 }); await page.mouse.move(b.x + b.width - 6, b.y + 10, { steps: 3 }); await page.waitForTimeout(250); };
export default async (page) => {
  await page.evaluate(() => os.apps.start('Edit'));
  await page.waitForTimeout(600);
  const bas = await page.evaluate(() => { const find = (d) => { for (const f of os.vfs.list(d)) { if (f.type === 'dir') { const r = find(f.path); if (r) return r; } else if (f.filetype === 0xFFB && f.size > 1500 && f.size < 6000) return f.path; } return null; }; return find('ADFS::HardDisc4.$.Diversions'); });
  console.log('basic file', bas);
  // Shift-double-click semantics: load as text into Edit
  await page.evaluate((p) => os.filer.run(p, { shift: true }), bas);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/screens/edit-basic.png' });
  const info = await E(page, `const s = app.states[0]; return JSON.stringify({ title: s.views[0].win.title, type: s.filetype, lines: s.doc.text.split('\\n').slice(0, 3) })`);
  console.log(info);
  // save the BASIC back to RAM and compare bytes
  const cmp = await E(page, `await app.states[0].saveTo('RAM::RamDisc0.$.Prog', false); return 'ok';`).catch((e) => 'err ' + e.message);
  const eq = await page.evaluate(async (p) => { const a = await os.vfs.readFile(p); const b = await os.vfs.readFile('RAM::RamDisc0.$.Prog'); return a.length === b.length && a.every((x, i) => x === b[i]) ? 'identical' : `differ ${a.length} ${b.length}`; }, bas);
  console.log('saved', cmp, eq, await page.evaluate(() => os.vfs.stat('RAM::RamDisc0.$.Prog')?.filetype.toString(16)));
  // display: choose Homerton.Medium via the font menu
  const w = await E(page, `const v = app.states[0].views[0].win; return { x: v.x, y: v.y }`);
  await page.mouse.click(w.x + 150, w.y + 100, { button: 'right' });
  await hoverArrow(page, 0, 4);
  await hoverArrow(page, 1, 0);
  await hoverArrow(page, 2, 3);          // Homerton
  const b = await menuItem(page, 3, 0);  // Medium
  await page.mouse.click(b.x + 30, b.y + 10);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'tests/screens/edit-outline.png' });
  console.log('options', await page.evaluate(() => os.sysvars.get('Edit$Options')));
  // back to the system font
  await E(page, `const v = app.states[0].views[0]; v.options.fixfont = true; v.applyOptions();`);
  // icon bar menu ▸ Create
  const ib = await page.evaluate(() => { const it = wimp.iconbar.items.find((i) => i.task?.name === 'Edit'); return { x: wimp.iconbar.iconScreenX(it), y: wimp.height - 30 }; });
  await page.mouse.click(ib.x, ib.y, { button: 'right' });
  await page.waitForTimeout(200);
  await hoverArrow(page, 0, 1);
  await page.screenshot({ path: 'tests/screens/edit-iconmenu.png' });
  const c = await menuItem(page, 1, 2);   // Obey
  await page.mouse.click(c.x + 30, c.y + 10);
  await page.waitForTimeout(300);
  console.log('created', await E(page, `return app.states.map((s) => s.views[0].win.title + ' ' + s.filetype.toString(16)).join(' | ')`));
};
