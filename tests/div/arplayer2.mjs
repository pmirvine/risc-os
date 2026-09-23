// !ARPlayer: blank window from the icon bar, Info box, Save frame / Save data boxes, transport checks.
// AR2=blank|proginfo|saveframe|savedata|transport
export default async (page) => {
  const mode = process.env.AR2 || 'blank';
  const tk = 'os.apps.tasksOf("ARPlayer")[0].arplayer';
  const ibIcon = async () => page.evaluate(() => { const e = [...document.querySelectorAll('.iconbar img')].find((x) => /arplayer/i.test(x.src)); const r = e?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; });
  if (mode === 'blank' || mode === 'proginfo') {
    await page.evaluate(async () => { await os.apps.start('ARPlayer'); });
    await page.waitForTimeout(500);
    const ib = await ibIcon();
    if (mode === 'blank') { await page.mouse.click(ib.x, ib.y); await page.waitForTimeout(800); }
    else {
      await page.mouse.click(ib.x, ib.y, { button: 'right' }); await page.waitForTimeout(300);
      const m = await page.evaluate(() => { const r = [...document.querySelectorAll('.menu')].pop().getBoundingClientRect(); return { x: r.right - 8, y: r.top + 30 }; });
      await page.mouse.move(m.x - 30, m.y); await page.mouse.move(m.x, m.y); await page.waitForTimeout(600);
    }
    console.log(JSON.stringify(await page.evaluate((tk) => { const a = eval(tk); return { displays: a.displays.length, title: a.displays[0]?.win.title, w: a.displays[0]?.win.w, h: a.displays[0]?.win.h }; }, tk)));
    return;
  }
  await page.evaluate(() => os.filer.openDir('ADFS::HardDisc4.$.Diversions.AudioDemos', { x: 480, y: 60 }));
  await page.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Diversions.AudioDemos.Minor'));
  await page.waitForTimeout(1200);
  if (mode === 'transport') {
    const r = await page.evaluate(async (tk) => {
      const a = eval(tk), dp = a.displays[0];
      const out = [];
      const snap = (l) => out.push(`${l}: ${dp.state} f=${dp.currentFrame} t=${dp.tools.icons[8].text} play=${dp.tools.icons[2].selected} pause=${dp.tools.icons[3].selected} vp=${a.voice.playing}`);
      snap('start');
      a.playPause(dp); snap('pause'); await new Promise((r) => setTimeout(r, 300)); snap('paused+300');
      a.playStep(dp); await new Promise((r) => setTimeout(r, 300)); snap('step');
      a.playPause(dp); snap('resume'); await new Promise((r) => setTimeout(r, 300)); snap('resumed+300');
      a.playStop(dp); snap('stop1'); a.playStop(dp); snap('stop2');
      a.playStep(dp); snap('step-stopped');
      return out.join('\n');
    }, tk);
    console.log(r);
    await page.waitForTimeout(500);
    // close the error box if any
    await page.keyboard.press('Enter');
    return;
  }
  const p = await page.evaluate((tk) => { const dp = eval(tk).displays[0]; eval(tk).playStop(dp); return dp.win.workToScreen(40, 30); }, tk);
  await page.mouse.click(p.x, p.y, { button: 'right' }); await page.waitForTimeout(300);
  const file = await page.evaluate(() => { const r = [...document.querySelectorAll('.menu')].pop().getBoundingClientRect(); return { x: r.right - 8, y: r.top + 32 }; });
  await page.mouse.move(file.x - 30, file.y); await page.mouse.move(file.x, file.y); await page.waitForTimeout(400);
  const sub = await page.evaluate((n) => { const r = [...document.querySelectorAll('.menu')].pop().getBoundingClientRect(); return { x: r.right - 8, y: r.top + 32 + 22 * n }; }, mode === 'saveframe' ? 1 : 2);
  await page.mouse.move(sub.x - 30, sub.y); await page.mouse.move(sub.x, sub.y); await page.waitForTimeout(600);
};
