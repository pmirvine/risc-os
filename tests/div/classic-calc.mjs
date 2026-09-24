// !Calc (tools/disc-classics.mjs, src/apps/Calc): run it from $.Apps, open the window from the icon bar, click keys,
// type on the keyboard, check the arithmetic of the original (immediate execution, 8 digits, Error), the
// icon bar menu and Quit. Screens: tests/screens/classic-calc*.png
const SHOT = process.env.SHOTDIR || 'tests/screens';
const fail = (m) => console.log('FAIL ' + m);
export default async (page) => {
  const scale = await page.evaluate(() => os.wimp.scale || 1);
  // the Filer shows the application with its icon; double-click (os.filer.run) launches it
  const icon = await page.evaluate(() => { const s = os.vfs.stat('ADFS::HardDisc4.$.Apps.!Calc'); return s && s.isApp && os.sprites.has('!calc'); });
  if (!icon) fail('no !Calc application directory / sprite');
  await page.mouse.move(300, 500);
  await page.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Apps.!Calc'));
  await page.waitForFunction(() => os.apps.tasksOf('Calculator')[0]?.calc, null, { timeout: 8000 }).catch(() => fail('Calc did not start'));
  const ib = await page.evaluate(() => {
    const it = os.wimp.iconbar.items.find((i) => i.task?.name === 'Calculator');
    const r = it?.icon?.el?.getBoundingClientRect?.() ?? it?.el?.getBoundingClientRect?.();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  });
  if (!ib) { fail('no icon bar icon'); return; }
  const open0 = await page.evaluate(() => os.apps.tasksOf('Calculator')[0].calc.win.isOpen);
  if (open0) fail('window open before clicking the icon bar icon');
  await page.mouse.click(ib.x, ib.y);
  await page.waitForTimeout(300);
  const W = await page.evaluate(() => { const w = os.apps.tasksOf('Calculator')[0].calc.win; return { open: w.isOpen, x: w.x, y: w.y, w: w.w, h: w.h, title: w.title }; });
  if (!W.open) fail('window did not open'); if (W.title !== 'Calculator') fail('title ' + W.title);
  if (W.w !== 139 || W.h !== 156) fail(`window size ${W.w}x${W.h} (want 139x156 = 278x312 OS units)`);
  // click keys: centre of icon i (template OS units -> work area pixels)
  const click = async (i) => {
    const p = await page.evaluate((n) => { const w = os.apps.tasksOf('Calculator')[0].calc.win; const r = w.icons[n].el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, i);
    await page.mouse.click(p.x, p.y); await page.waitForTimeout(60);
  };
  const disp = () => page.evaluate(() => os.apps.tasksOf('Calculator')[0].calc.display);
  const seq = async (keys, want, label) => {
    for (const k of keys) await click(k);
    const d = await disp();
    console.log(`${label}: ${d}`);
    if (d !== want) fail(`${label}: display ${JSON.stringify(d)}, want ${JSON.stringify(want)}`);
  };
  await seq([3, 1, 4, 10, 1, 5, 9], '314.159', '314.159 entered');
  await page.screenshot({ path: `${SHOT}/classic-calc.png`, clip: { x: (W.x - 40) * scale, y: (W.y - 40) * scale, width: 240 * scale, height: 240 * scale } });
  await seq([16, 2, 12, 3, 14, 4, 11], '20', '2+3x4= (immediate execution)');
  await seq([16, 1, 15, 3, 11], '0.3333333', '1/3=');
  await seq([16, 7, 15, 0, 11], 'Error', '7/0=');
  await seq([5, 12], 'Error', 'keys ignored in error state');
  await seq([16], '0', 'C clears');
  await seq([9, 9, 9, 9, 9, 9, 9, 9, 9, 9], '99999999', 'eight digits at most');
  await seq([14, 1, 0, 11], 'Error', '99999999x10= overflows');
  await seq([16, 0, 13, 4, 11], '-4', '0-4=');
  await page.screenshot({ path: `${SHOT}/classic-calc-neg.png`, clip: { x: (W.x - 40) * scale, y: (W.y - 40) * scale, width: 240 * scale, height: 240 * scale } });
  // keyboard: click on the display for the input focus, then type 12*12 Enter; Delete clears
  const dsp = await page.evaluate(() => { const r = os.apps.tasksOf('Calculator')[0].calc.displayCanvas.getBoundingClientRect(); return { x: r.x + 20, y: r.y + r.height / 2 }; });
  await page.mouse.click(dsp.x, dsp.y);
  await page.keyboard.press('Delete');
  await page.keyboard.type('12*12');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  let d = await disp(); console.log('typed 12*12 Enter:', d);
  if (d !== '144') fail('keyboard 12*12 Enter gave ' + d);
  await page.keyboard.type('+.5');
  await page.keyboard.press('NumpadEnter');
  d = await disp(); if (d !== '144.5') fail('keyboard +.5 Enter gave ' + d);
  // unit checks of the engine
  const unit = await page.evaluate(async () => {
    const { Calculator } = await import('./src/apps/Calc/main.js');
    const c = new Calculator(); const r = [];
    const run = (ks) => { c.clear(); for (const k of ks) c.press(k); return c.dreg; };
    r.push(run([5, 12, 12]));            // 5 + + -> 5+5 = 10 (the original re-uses the display)
    r.push(run([2, 11, 11]));            // = = keeps 2
    r.push(run([10, 5, 14, 2, 11]));     // .5 x 2 = 1
    r.push(run([1, 10, 10, 2]));         // one point only: 1.2
    return r;
  });
  console.log('engine', JSON.stringify(unit));
  if (JSON.stringify(unit) !== JSON.stringify(['10', '2', '1', '1.2'])) fail('engine ' + JSON.stringify(unit));
  // close icon: window closes, icon stays; reopening puts it back where it was
  await page.evaluate(() => os.apps.tasksOf('Calculator')[0].calc.win.requestClose({}));
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({ open: os.apps.tasksOf('Calculator')[0]?.calc.win.isOpen, alive: os.apps.tasksOf('Calculator').length }));
  if (after.open || !after.alive) fail('close: ' + JSON.stringify(after));
  await page.mouse.click(ib.x, ib.y);
  await page.waitForTimeout(200);
  const W2 = await page.evaluate(() => { const w = os.apps.tasksOf('Calculator')[0].calc.win; return { x: w.x, y: w.y }; });
  if (W2.x !== W.x || W2.y !== W.y) fail(`reopened at ${JSON.stringify(W2)}, was ${W.x},${W.y}`);
  // icon bar menu: Calculator > Info, Quit
  await page.mouse.click(ib.x, ib.y, { button: 'middle' });
  await page.waitForTimeout(300);
  const menu = await page.evaluate(() => [...document.querySelectorAll('.layer-menus *')].filter((e) => !e.children.length && e.textContent.trim()).map((e) => e.textContent.trim()).join('|'));
  console.log('menu', menu);
  if (!['Calculator', 'Info', 'Quit'].every((t) => menu.split('|').includes(t))) fail('menu ' + menu);
  const info = await page.evaluate(() => { const e = [...document.querySelectorAll('.layer-menus *')].find((x) => x.textContent.trim() === 'Info' && !x.children.length); const r = e.getBoundingClientRect(); return { x: r.x + r.width - 4, y: r.y + r.height / 2 }; });
  await page.mouse.move(info.x, info.y); await page.mouse.move(info.x + 30, info.y, { steps: 3 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT}/classic-calc-menu.png` });
  await page.keyboard.press('Escape');
  const q = await page.evaluate(() => { const e = [...document.querySelectorAll('.layer-menus *')].find((x) => x.textContent.trim() === 'Quit' && !x.children.length); const r = e?.getBoundingClientRect(); return r && { x: r.x + 5, y: r.y + r.height / 2 }; });
  if (!q) { await page.mouse.click(ib.x, ib.y, { button: 'middle' }); await page.waitForTimeout(300); }
  const q2 = await page.evaluate(() => { const e = [...document.querySelectorAll('.layer-menus *')].find((x) => x.textContent.trim() === 'Quit' && !x.children.length); const r = e?.getBoundingClientRect(); return r && { x: r.x + 5, y: r.y + r.height / 2 }; });
  if (q2) { await page.mouse.click(q2.x, q2.y); await page.waitForTimeout(300); }
  const left = await page.evaluate(() => os.apps.tasksOf('Calculator').length);
  if (left) fail('Quit left the task running');
  console.log('calc done');
};
