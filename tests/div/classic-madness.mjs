// !Madness (tools/disc-classics.mjs, src/apps/Madness): open some windows, run it from $.Diversions, check that it
// has no icon bar icon, that its title-bar-only window sits at the back, that it nudges one window per 20 cs
// walking up the stack (sending Open_Window_Requests: stacking kept), bounces off the edges, leaves the icon bar
// alone, ignores drags of its own window and quits from its close icon. Screens: tests/screens/classic-madness*.png
const SHOT = process.env.SHOTDIR || 'tests/screens';
const fail = (m) => console.log('FAIL ' + m);
export default async (page) => {
  await page.evaluate(() => {
    os.filer.openDir('ADFS::HardDisc4.$', { x: 120, y: 120, w: 420, h: 240 });
    os.filer.openDir('ADFS::HardDisc4.$.Diversions', { x: 360, y: 300, w: 420, h: 220 });
  });
  await page.waitForTimeout(500);
  const ibBefore = await page.evaluate(() => { const w = [...os.wimp.stack].find((x) => x._isIconbar); return w && { x: w.x, y: w.y }; });
  const nIcons = await page.evaluate(() => os.wimp.iconbar.items.length);
  const pos0 = await page.evaluate(() => [...os.wimp.stack].filter((w) => w.task && !w._isIconbar && !w.isBackWindow).map((w) => ({ t: w.title, x: w.x, y: w.y })));
  await page.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Diversions.!Madness'));
  await page.waitForFunction(() => os.wimp.tasks.some((t) => t.madness), null, { timeout: 8000 }).catch(() => fail('Madness did not start'));
  const info = await page.evaluate(() => {
    const t = os.wimp.tasks.find((x) => x.madness), w = t.madness.win, s = os.wimp.stack;
    const below = s.slice(0, s.indexOf(w)).filter((x) => !x.isBackWindow && !x._isIconbar);
    return { task: t.name, title: w.title, x: w.x, y: w.y, w: w.w, h: w.h, bottom: below.length === 0, icons: os.wimp.iconbar.items.length };
  });
  console.log('madness window', JSON.stringify(info));
  if (info.task !== 'Window Madness') fail('task name ' + info.task);
  if (info.title !== 'Madness') fail('title ' + info.title);
  if (!info.bottom) fail('Madness window not at the back');
  if (info.h !== 0) fail('work area height ' + info.h);
  if (info.icons !== nIcons) fail('Madness put an icon on the icon bar');
  // its window can't be dragged (Open_Window_Request ignored)
  await page.evaluate(() => { const w = os.wimp.tasks.find((x) => x.madness).madness.win; w.requestOpen({ x: w.x + 100, y: w.y - 100 }); });
  const still = await page.evaluate(() => { const w = os.wimp.tasks.find((x) => x.madness).madness.win; return { x: w.x, y: w.y }; });
  if (still.x !== info.x || still.y !== info.y) fail('Madness window moved on an Open_Window_Request');
  // one window per 20 cs: after 2 s each of the two Filer windows has moved several times
  await page.waitForTimeout(2200);
  const pos1 = await page.evaluate(() => [...os.wimp.stack].filter((w) => w.task && !w._isIconbar && !w.isBackWindow && !w.task.madness).map((w) => ({ t: w.title, x: w.x, y: w.y })));
  console.log('before', JSON.stringify(pos0), 'after', JSON.stringify(pos1));
  const moved = pos1.filter((p) => { const q = pos0.find((o) => o.t === p.t); return q && (q.x !== p.x || q.y !== p.y); });
  if (moved.length < 2) fail('windows did not drift: ' + JSON.stringify(pos1));
  for (const p of pos1) { const q = pos0.find((o) => o.t === p.t); if (q && (p.x <= q.x || p.y >= q.y)) fail(`${p.t} did not start moving right and up`); }
  const order = await page.evaluate(() => [...os.wimp.stack].filter((w) => w.task && !w._isIconbar && !w.isBackWindow).map((w) => w.title).join(' < '));
  console.log('stack', order);
  await page.screenshot({ path: `${SHOT}/classic-madness.png` });
  // bounce: a window pushed against the right/top edges comes back
  const bounce = await page.evaluate(async () => {
    const t = os.wimp.tasks.find((x) => x.madness);
    const w = [...os.wimp.stack].find((x) => x.task && x.title === 'ADFS::HardDisc4.$');
    w.open({ x: os.wimp.width - w.w - 10, y: 30 });
    const a = t.madness.X[w.handle & 255], b = t.madness.Y[w.handle & 255];
    for (let i = 0; i < 12; i++) t.madness.nudge();
    return { vx: t.madness.X[w.handle & 255], vy: t.madness.Y[w.handle & 255], a, b };
  });
  console.log('bounce', JSON.stringify(bounce));
  if (!(bounce.vx < 0 && bounce.vy < 0)) fail('no bounce off the top right: ' + JSON.stringify(bounce));
  await page.waitForTimeout(1500);
  const ibAfter = await page.evaluate(() => { const w = [...os.wimp.stack].find((x) => x._isIconbar); return w && { x: w.x, y: w.y }; });
  if (JSON.stringify(ibAfter) !== JSON.stringify(ibBefore)) fail('the icon bar moved');
  // Shift-F12 style: bring the icon bar to the back to see the Madness window
  await page.evaluate(() => { const w = os.wimp.tasks.find((x) => x.madness).madness.win; w.open({ behind: 'top' }); });
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${SHOT}/classic-madness-window.png`, clip: { x: 0, y: (await page.evaluate(() => os.wimp.height)) - 110, width: 300, height: 110 } });
  // close icon quits; windows stay where they drifted to
  await page.evaluate(() => os.wimp.tasks.find((x) => x.madness).madness.win.requestClose({}));
  await page.waitForTimeout(300);
  const alive = await page.evaluate(() => os.wimp.tasks.some((t) => t.madness && t.alive));
  if (alive) fail('close icon did not quit');
  const p2 = await page.evaluate(() => [...os.wimp.stack].filter((w) => w.task && w.title === 'ADFS::HardDisc4.$').map((w) => ({ x: w.x, y: w.y }))[0]);
  await page.waitForTimeout(600);
  const p3 = await page.evaluate(() => [...os.wimp.stack].filter((w) => w.task && w.title === 'ADFS::HardDisc4.$').map((w) => ({ x: w.x, y: w.y }))[0]);
  if (JSON.stringify(p2) !== JSON.stringify(p3)) fail('windows still moving after quit');
  console.log('madness done');
};
