// !ARPlayer functional checks (run through shot.mjs): node tests/core/shot.mjs div-arplayer-func tests/div/arplayer-func.mjs
export default async (page) => {
  const tk = 'os.apps.tasksOf("ARPlayer")[0].arplayer';
  const res = [];
  const ok = (name, cond, info = '') => res.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${info}`);
  ok('alias', /ARPlayer/.test(await page.evaluate(() => os.sysvars.get('Alias$@RunType_AE7'))));
  // double-click a movie: opens and plays
  await page.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Diversions.AudioDemos.G2'));
  await page.waitForTimeout(1000);
  let s = await page.evaluate((tk) => { const a = eval(tk), dp = a.displays[0]; return { n: a.displays.length, state: dp.state, frames: a.voice.frames, rate: a.voice.baseRate, w: dp.win.w, h: dp.win.h }; }, tk);
  ok('run plays', s.state === 'playing' && s.frames > 0, JSON.stringify(s));
  await page.waitForTimeout(1800);
  s = await page.evaluate((tk) => { const dp = eval(tk).displays[0]; return { state: dp.state, f: dp.currentFrame, n: dp.nframes, t: dp.tools.icons[8].text, red: dp.bar.red.style.width }; }, tk);
  ok('ends', s.state === 'stopped' && s.f === s.n && s.t === '00:01.07', JSON.stringify(s));
  // second double-click with single window: reuses the window
  await page.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Diversions.AudioDemos.Space'));
  await page.waitForTimeout(800);
  s = await page.evaluate((tk) => { const a = eval(tk); return { n: a.displays.length, title: a.displays[0].win.title, nf: a.displays[0].nframes, ch: a.voice.snd?.channels.length }; }, tk);
  ok('reuse window', s.n === 1 && /Space/.test(s.title) && s.ch === 2, JSON.stringify(s));
  // loop 2 times via the setup window (Update while playing restarts)
  s = await page.evaluate(async (tk) => {
    const a = eval(tk), dp = a.displays[0];
    a.playStop(dp); a.playStop(dp);
    a.setupPopup(dp);
    const w = os.wimp.stack.find((x) => x.title === 'Movie setup');
    w.icons[12].setState({ selected: true }); w.icons[13].setText('2');
    w.emit('click', { button: 'select', iconIndex: 0, icon: w.icons[0] });
    return { open: w.isOpen, loop: dp.play.loop, loopFor: dp.play.loopFor, opt: a.options.play.loopFor };
  }, tk);
  ok('setup update', !s.open && s.loop && s.loopFor === 2 && s.opt === 2, JSON.stringify(s));
  // mute / multiple windows / icon bar drop
  s = await page.evaluate(async (tk) => {
    const a = eval(tk);
    a.options.multipleWindows = true;
    await a.displayOpen('ADFS::HardDisc4.$.Diversions.AudioDemos.Piano');
    return { n: a.displays.length, t: a.displays[1]?.win.title };
  }, tk);
  ok('multiple windows', s.n === 2 && /Piano/.test(s.t), JSON.stringify(s));
  // save frame + extract
  s = await page.evaluate(async (tk) => {
    const a = eval(tk), dp = a.displays[1];
    const m = a.displayMenu(dp);
    const fm = m.items[0].submenu;
    const box = fm.items[1].submenu();
    box.icons[2].setText('RAM::RamDisc0.$.Frame');
    box.emit('click', { button: 'select', iconIndex: 0, icon: box.icons[0] });
    const box2 = fm.items[2].submenu();
    box2.icons[2].setText('RAM::RamDisc0.$.Extract');
    box2.emit('click', { button: 'select', iconIndex: 0, icon: box2.icons[0] });
    await new Promise((r) => setTimeout(r, 200));
    const st = (p) => os.vfs.stat(p);
    return { frame: st('RAM::RamDisc0.$.Frame')?.filetype, hdr: st('RAM::RamDisc0.$.Extract.Header')?.size, spr: st('RAM::RamDisc0.$.Extract.Sprite')?.filetype, snd: st('RAM::RamDisc0.$.Extract.Adpcm')?.size };
  }, tk);
  ok('save frame/extract', s.frame === 0xFF9 && s.hdr > 0 && s.spr === 0xFF9 && s.snd > 0, JSON.stringify(s));
  // save choices
  s = await page.evaluate((tk) => {
    const a = eval(tk);
    a.iconMenu.items[3].action();
    return { choices: os.vfs.stat(os.sysvars.get('ARPlayer$OptionsFile'))?.size, state: os.vfs.stat(os.sysvars.get('ARPlayer$StateFile'))?.filetype, f: os.sysvars.get('ARPlayer$StateFile') };
  }, tk);
  ok('save choices', s.choices > 0 && s.state === 0xFEB, JSON.stringify(s));
  // info track arrows; global choices toggles set variables
  s = await page.evaluate((tk) => {
    const a = eval(tk);
    a.globalPopup();
    const w = os.wimp.stack.find((x) => x.title === 'Global choices');
    w.icons[4].setState({ selected: true }); w.emit('click', { button: 'select', iconIndex: 4, icon: w.icons[4] });
    const v = os.sysvars.get('ARMovie$Interpolate');
    w.icons[4].setState({ selected: false }); w.emit('click', { button: 'select', iconIndex: 4, icon: w.icons[4] });
    return { v, after: os.sysvars.get('ARMovie$Interpolate') };
  }, tk);
  ok('global interpolate', s.v === '100000000,100000000' && s.after == null, JSON.stringify(s));
  // quit stops everything
  s = await page.evaluate(async (tk) => {
    const a = eval(tk);
    a.playStart(a.displays[0], false);
    const was = a.voice.playing;
    os.apps.tasksOf('ARPlayer')[0].quit();
    return { was, now: a.voice.playing, tasks: os.apps.tasksOf('ARPlayer').length };
  }, tk);
  ok('quit', s.was && !s.now && s.tasks === 0, JSON.stringify(s));
  // choices are read back on the next start
  s = await page.evaluate(async () => { const t = await os.apps.start('ARPlayer'); const o = t.arplayer.options; const r = { mw: o.multipleWindows, loop: o.play.loop, lf: o.play.loopFor }; t.quit(); return r; });
  ok('load choices', s.mw === true && s.loop === true && s.lf === 2, JSON.stringify(s));
  await page.evaluate(() => { os.vfs.delete('RAM::RamDisc0.$.Extract', { recursive: true, force: true }); os.vfs.delete('RAM::RamDisc0.$.Frame', { force: true }); });
  console.log(res.join('\n'));
};
