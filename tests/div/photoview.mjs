// PhotoView screenshots / checks. PV=overview|params|image|menu|save|scale|info|filer|iconmenu|rights
// Run: sh shot.sh div-photoview-<mode> tests/div/photoview.mjs  (with PV=<mode> in the environment)
const pv = (page, fn, arg) => page.evaluate(fn, arg);
async function hoverItem(page, text) {
  const box = await page.evaluate((t) => {
    const els = [...document.querySelectorAll('.layer-menus *')].filter((e) => e.textContent === t && e.children.length === 0);
    const r = els[els.length - 1]?.getBoundingClientRect();
    return r && { x: r.x + 5, y: r.y + r.height / 2 };
  }, text);
  if (!box) { console.log('menu item not found:', text); return; }
  await page.mouse.move(box.x, box.y);
  await page.mouse.move(box.x + 170, box.y, { steps: 6 });
  await page.waitForTimeout(500);
}
const scale = (page) => page.evaluate(() => os.wimp.scale || 1);
async function clickWork(page, win, x, y, button = 'left') {
  const p = await page.evaluate(([t, x, y]) => { const w = [...os.wimp.windows].find((w) => w.title === t || w.title.startsWith(t)); const q = w.workToScreen(x, y); return q; }, [win, x, y]);
  const s = await scale(page);
  await page.mouse.click(p.x * s, p.y * s, { button });
}

export default async (page) => {
  const mode = process.env.PV || 'overview';
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  if (mode === 'filer') {
    await page.evaluate(() => os.filer.openDir('ADFS::HardDisc4.$.Utilities'));
    await page.waitForTimeout(800);
    await page.evaluate(() => os.filer.openDir('ADFS::HardDisc4.$.Images.00-49', { x: 300, y: 80 }));
    await page.waitForTimeout(800);
    console.log('alias C85 =', await page.evaluate(() => os.sysvars.get('Alias$@RunType_C85')));
    await page.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Images.00-49.sa07'));
    await page.waitForTimeout(2500);
    console.log('windows:', await page.evaluate(() => [...os.wimp.windows].filter((w) => w.isOpen).map((w) => w.title).join(' | ')));
    return;
  }
  await pv(page, () => os.apps.start('PhotoView'));
  await page.waitForTimeout(800);
  const ib = await page.evaluate(() => { const it = os.wimp.iconbar.items.find((i) => i.task?.name === 'PhotoView'); const r = it.icon.el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (mode === 'iconmenu') {
    await page.mouse.click(ib.x, ib.y, { button: 'middle' });
    await page.waitForTimeout(300);
    await hoverItem(page, 'Source');
    return;
  }
  if (mode === 'progInfo') {
    await page.mouse.click(ib.x, ib.y, { button: 'middle' });
    await page.waitForTimeout(300);
    await hoverItem(page, 'Info');
    return;
  }
  await page.mouse.click(ib.x, ib.y);
  await page.waitForTimeout(2500);
  if (mode === 'overview') return;
  // click slide 6 (sa05) -> parameter box
  await clickWork(page, 'Overview', 3 * 136 + 70, 136 + 70);
  await page.waitForTimeout(600);
  if (mode === 'params') return;
  if (mode === 'orient') {
    await clickWork(page, 'Opening', 107 + 60, 66 + 10);     // top side of the display icon: rotate 90
    await page.waitForTimeout(200);
    await clickWork(page, 'Opening', 251, 253);     // palette popup
    await page.waitForTimeout(400);
    return;
  }
  if (mode === 'grey') {
    await pv(page, () => { const t = os.apps.tasksOf('PhotoView')[0]; t.photoview.opts.palette = 4; t.photoview.opts.resolution = 2; });
  }
  await clickWork(page, 'Opening', 330, 284);                // OK
  await page.waitForTimeout(1500);
  const title = 'sa05';
  if (mode === 'image' || mode === 'grey') return;
  await clickWork(page, title, 200, 150, 'middle');
  await page.waitForTimeout(300);
  if (mode === 'menu') return;
  if (mode === 'save') { await hoverItem(page, 'Save'); return; }
  if (mode === 'info') { await hoverItem(page, 'Image info'); return; }
  if (mode === 'scale' || mode === 'scaled') {
    await hoverItem(page, 'Scale view');
    if (mode === 'scaled') {
      await clickWork(page, 'Scale view', 25 + 25, 62 + 13);  // 25%
      await page.waitForTimeout(200);
      await clickWork(page, 'Scale view', 139, 163);          // Scale
      await page.waitForTimeout(800);
    }
  }
  if (mode === 'rights') {
    await hoverItem(page, 'Image info');
    await clickWork(page, 'Image information', 229, 214);
    await page.waitForTimeout(800);
  }
};
