// !ARPlayer screenshots: node tests/core/shot.mjs div-arplayer tests/div/arplayer.mjs
// AR=blank|movie|menu|imenu|setup|info|global|save  (default movie)
export default async (page) => {
  const mode = process.env.AR || 'movie';
  const alias = await page.evaluate(() => os.sysvars.get('Alias$@RunType_AE7'));
  console.log('alias', alias);
  if (mode === 'blank' || mode === 'imenu') {
    await page.evaluate(async () => { await os.apps.start('ARPlayer'); });
    await page.waitForTimeout(600);
  } else {
    await page.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Diversions.AudioDemos.Blues'));
    await page.waitForTimeout(1500);
  }
  const st = await page.evaluate(() => {
    const t = os.apps.tasksOf('ARPlayer')[0];
    const a = t?.arplayer;
    const dp = a?.displays[0];
    return { task: !!t, displays: a?.displays.length, title: dp?.win.title, state: dp?.state, frame: dp?.currentFrame, nframes: dp?.nframes,
      samples: a?.voice.frames, playing: a?.voice.playing, time: dp?.tools?.icons[8].text };
  });
  console.log(JSON.stringify(st));
  const tk = 'os.apps.tasksOf("ARPlayer")[0].arplayer';
  if (mode === 'imenu') {
    const ib = await page.evaluate(() => { const e = [...document.querySelectorAll('.iconbar img, .iconbar .icon')].find((x) => /arplayer/i.test(x.src || x.innerHTML)); const r = e?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; });
    console.log('ib', JSON.stringify(ib));
    if (ib) { await page.mouse.click(ib.x, ib.y, { button: 'right' }); await page.waitForTimeout(300); await page.mouse.move(ib.x + 20, ib.y - 110); await page.mouse.move(ib.x + 40, ib.y - 100); await page.waitForTimeout(500); }
  }
  if (mode === 'menu') {
    const p = await page.evaluate((tk) => { const dp = eval(tk).displays[0]; return dp.win.workToScreen(40, 40); }, tk);
    await page.mouse.click(p.x, p.y, { button: 'right' });
    await page.waitForTimeout(400);
  }
  if (mode === 'setup') { await page.evaluate((tk) => { const a = eval(tk); a.playStop(a.displays[0]); a.setupPopup(a.displays[0]); }, tk); await page.waitForTimeout(400); }
  if (mode === 'info') { await page.evaluate((tk) => { const a = eval(tk); a.infoOpen(a.displays[0]); }, tk); await page.waitForTimeout(400); }
  if (mode === 'global') { await page.evaluate((tk) => { const a = eval(tk); a.globalPopup(); }, tk); await page.waitForTimeout(400); }
  if (process.env.WAITEND) { await page.waitForTimeout(4500); console.log(JSON.stringify(await page.evaluate((tk) => { const dp = eval(tk).displays[0]; return { state: dp.state, frame: dp.currentFrame, time: dp.tools.icons[8].text }; }, tk))); }
};
