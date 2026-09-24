// node tests/core/shot.mjs help-full tests/edit/act-helpfull.mjs
// !Help started from its application directory (Filer double-click), then the pointer is moved over
// the icon bar, a Filer window, the Filer menu, Edit's and Paint's windows/menus/tool pane.
import { filerOpen, iconbarPos, hoverArrow, menuItem, check } from './ui.mjs';

const helpText = (page) => page.evaluate(() => { const t = os.apps.tasksOf('Help')[0]; const w = t && [...t.windows].find((q) => q.title === 'Interactive help'); return w ? w.icons.filter(Boolean).map((i) => i.text).join(' ').replace(/\s+/g, ' ').trim() : null; });
const shot = async (page, name, expect) => {
  await page.waitForTimeout(450);
  const t = await helpText(page);
  check(`help over ${name}`, !!t && (expect ? expect.test(t) : t.length > 0), t);
  await page.screenshot({ path: `tests/screens/help-${name}.png` });
};

export default async (page) => {
  // start !Help by double-clicking it in Resources:$.Apps, and Paint + Edit from the icon bar
  await filerOpen(page, 'Resources:$.Apps', '!Help', { wait: 1200 });
  check('!Help started from the Filer', await page.evaluate(() => os.apps.tasksOf('Help').length === 1));
  await page.evaluate(() => { for (const v of [...os.filer.viewers.values()]) v.close(); });
  await page.evaluate(() => Promise.all([os.apps.start('Edit'), os.apps.start('Paint')]));
  await page.waitForTimeout(800);
  // keep the help window out of the way (it opens just above the icon bar)
  // icon bar
  let p = await iconbarPos(page, 'Paint');
  await page.mouse.move(p.x, p.y);
  await shot(page, 'iconbar-paint', /Paint/);
  p = await iconbarPos(page, 'Edit');
  await page.mouse.move(p.x, p.y);
  await shot(page, 'iconbar-edit', /Edit/);
  p = await page.evaluate(() => { const it = wimp.iconbar.items.find((i) => /harddisc/i.test(i.sprite ?? '')); return { x: wimp.iconbar.iconScreenX(it), y: wimp.height - 30 }; });
  await page.mouse.move(p.x, p.y);
  await shot(page, 'iconbar-hd', /hard disc/i);
  // Filer window and menu
  await page.evaluate(() => os.filer.openDir('ADFS::HardDisc4.$', { x: 560, y: 40, w: 440, h: 200 }));
  await page.waitForTimeout(400);
  await page.mouse.move(720, 100);
  await shot(page, 'filer', /SELECT/);
  await page.mouse.click(720, 100, { button: 'right' });
  await page.waitForTimeout(200);
  await hoverArrow(page, 0, 0);          // Display >
  const b = await menuItem(page, 1, 0);
  await page.mouse.move(b.x + 20, b.y + 10);
  await shot(page, 'filermenu', /\S/);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  // Edit: window menu item
  await page.evaluate(async () => { const { currentEdit } = await import('/src/apps/Edit/api.js'); const s = await currentEdit().open('', 0xFFF); s.doc.setText('Some text\n'); });
  await page.waitForTimeout(300);
  const w = await page.evaluate(async () => { const { currentEdit } = await import('/src/apps/Edit/api.js'); const v = currentEdit().states.at(-1).views[0].win; v.open({ x: 60, y: 60, behind: 'top' }); return { x: v.x, y: v.y }; });
  await page.mouse.click(w.x + 100, w.y + 60, { button: 'right' });
  await page.waitForTimeout(200);
  await hoverArrow(page, 0, 3);          // Edit >
  const e = await menuItem(page, 1, 0);  // Find
  await page.mouse.move(e.x + 20, e.y + 10);
  await shot(page, 'editmenu-find', /find/i);
  await page.keyboard.press('Escape');
  // Paint: a sprite editor, its tool pane and sprite menu
  await page.evaluate(async () => { const A = os.apps.tasksOf('Paint')[0].paint; const f = A.makeFile(); A.fileWins.create(f, { open: true }); const { newSprite } = await import('/src/apps/Paint/spritefile.js'); const s = newSprite({ name: 'demo', w: 32, h: 32, mode: 27 }); A.attach(s, f); f.sprites.push(s); A.fileWins.layout(f, true); A.spriteWins.open(s); });
  await page.waitForTimeout(500);
  const tw = await page.evaluate(() => { const A = os.apps.tasksOf('Paint')[0].paint; const w = A.toolWin.win; w.open({ x: 600, y: 300, behind: 'top' }); const b = w.icons[4].bbox; return w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2); });
  await page.mouse.move(tw.x, tw.y);
  await shot(page, 'paint-tools', /line/i);
  const sw = await page.evaluate(() => { const A = os.apps.tasksOf('Paint')[0].paint; const s = A.files.at(-1).sprites[0]; const w = s.st.windows[0].win; w.open({ x: 100, y: 300, behind: 'top' }); return { x: w.x, y: w.y }; });
  await page.mouse.move(sw.x + 10, sw.y + 10);
  await shot(page, 'paint-sprite', /\S/);
  await page.mouse.click(sw.x + 10, sw.y + 10, { button: 'right' });
  await page.waitForTimeout(200);
  await hoverArrow(page, 0, 3);          // Edit >
  const f = await menuItem(page, 1, 0);  // Flip vertically
  await page.mouse.move(f.x + 20, f.y + 10);
  await shot(page, 'paint-menu', /flip/i);
  await page.keyboard.press('Escape');
};
