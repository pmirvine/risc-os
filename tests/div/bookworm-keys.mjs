// !Bookworm: start by running an HTML file (Alias$@RunType_FAF), Up/Shift-Down keys, F3 save box (screen div-bookworm-save), Quit from the icon bar menu.
export default async (page) => {
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Manuals.Manual.BOOKB.TOC/HTM'));
  await page.waitForTimeout(2000);
  console.log(await page.evaluate(() => { const t = os.apps.tasksOf('Bookworm')[0]; return JSON.stringify({ n: t?.bookworm.views.size, url: [...t.bookworm.views][0]?.url, rt: os.sysvars.get('Alias$@RunType_FAF'), ft: os.sysvars.get('File$Type_FAF'), rp: os.sysvars.get('ROManual$Path') }); }));
  // keyboard: Down scrolls, F3 opens save box
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  console.log(await page.evaluate(() => [...os.apps.tasksOf('Bookworm')[0].bookworm.views][0].win.scrollY));
  await page.keyboard.press('Shift+ArrowDown');
  await page.waitForTimeout(200);
  console.log(await page.evaluate(() => [...os.apps.tasksOf('Bookworm')[0].bookworm.views][0].win.scrollY));
  await page.keyboard.press('F3');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/screens/div-bookworm-save.png' });
  await page.keyboard.press('Escape');
  // quit via icon bar menu
  const ib = await page.evaluate(() => { const it = os.wimp.iconbar.items.find((i) => i.task?.name === 'Bookworm'); const r = it.icon.el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(ib.x, ib.y, { button: 'right' });
  await page.waitForTimeout(300);
  const m = await page.$$('.menu'); const mb = await m[m.length - 1].boundingBox();
  await page.mouse.click(mb.x + 30, mb.y + 32 + 44);
  await page.waitForTimeout(500);
  console.log('after quit', await page.evaluate(() => os.apps.tasksOf('Bookworm').length + ' ' + os.wimp.iconbar.items.filter((i) => i.task?.name === 'Bookworm').length + ' windows ' + [...os.wimp.windows].filter((w) => w.task?.name === 'Bookworm').length));
};
