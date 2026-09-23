// !ARPlayer: time bar drag with the mouse, Time bar / Tool bar toggles, interactive help.
export default async (page) => {
  const tk = 'os.apps.tasksOf("ARPlayer")[0].arplayer';
  await page.evaluate(async () => { const t = await os.apps.start('ARPlayer'); await t.arplayer.displayOpen('ADFS::HardDisc4.$.Diversions.AudioDemos.Sax3'); });
  await page.waitForTimeout(500);
  const b = await page.evaluate((tk) => { const dp = eval(tk).displays[0]; const ic = dp.tools.icons[6].bbox; const p = dp.tools.workToScreen(ic.x0, ic.y0); return { x: p.x, y: p.y + 12, w: ic.x1 - ic.x0 }; }, tk);
  await page.mouse.move(b.x + 20, b.y); await page.mouse.down(); await page.mouse.move(b.x + 80, b.y, { steps: 5 }); await page.mouse.move(b.x + b.w / 2, b.y, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(200);
  console.log(JSON.stringify(await page.evaluate((tk) => { const dp = eval(tk).displays[0]; return { f: dp.currentFrame, n: dp.nframes, t: dp.tools.icons[8].text }; }, tk)));
  const help = await page.evaluate(({ tk, b }) => [os.wimp.helpAt(b.x + 30, b.y), os.wimp.helpAt(b.x + 10, b.y + 30)], { tk, b });
  console.log('help', JSON.stringify(help));
  await page.evaluate((tk) => {
    const a = eval(tk);
    a.options.multipleWindows = true;
    return Promise.all([a.displayOpen('ADFS::HardDisc4.$.Diversions.AudioDemos.Piano'), a.displayOpen('ADFS::HardDisc4.$.Diversions.AudioDemos.Trumpet')]);
  }, tk);
  await page.waitForTimeout(400);
  await page.evaluate((tk) => {
    const a = eval(tk);
    const [, d1, d2] = a.displays;
    d1.win.open({ x: 400, y: 100 }); d2.win.open({ x: 700, y: 100 });
    a.displayMenu(d1).items[3].action();          // Time bar off -> buttons only
    a.displayMenu(d2).items[4].action();          // Tool bar off -> time bar only
  }, tk);
  await page.waitForTimeout(400);
};
