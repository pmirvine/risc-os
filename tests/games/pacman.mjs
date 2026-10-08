// !Pacman (the JavaScript game on the disc in $.Diversions), the real
// shell on the real core: start it from the Filer, check it takes the
// screen and draws the title, start a game with Return, steer and eat
// a dot, pause, go back to the desktop through the pause menu (the
// icon stays), play in a window chosen from the icon bar menu, View
// source (!JsEdit opens), and quit during play (nothing is left).
// Screenshots: pacman-title.png, pacman-play.png in SHOTDIR.
// node tests/core/shot.mjs games-pacman tests/games/pacman.mjs
const SHOT = process.env.SHOTDIR || 'tests/screens';
export default async (page) => {
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const fail = (m) => console.log('FAIL ' + m);
  const G = (body) => page.evaluate(`(() => {
    const t = os.wimp.tasks.find((x) => x.name === 'Pacman');
    const g = t?.game; ${body} })()`);
  const state = () => G(`return g && { frames: g.frames,
    screen: g.screen, display: g.display.kind,
    full: !!document.querySelector('.fullscreen-program'),
    game: g.game && { frame: g.game.frame, state: g.game.state,
      px: g.game.player.px, score: g.game.score } }`);
  const windowOpen = () => page.evaluate(() => [...document
    .querySelectorAll('.win')].some((e) => e.style.display !== 'none'
      && /Pac-?Man/i.test(e.textContent)));
  const hasIcon = () => page.evaluate(() => os.wimp.tasks.find(
    (x) => x.name === 'Pacman')?.iconbarIcons.size);
  // MENU on the icon bar icon, then click the item with this text
  async function iconMenu(text) {
    const ib = await page.evaluate(() => {
      const it = os.wimp.iconbar.items.find(
        (i) => i.task?.name === 'Pacman');
      const r = it.icon.el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.click(ib.x, ib.y, { button: 'middle' });
    await page.waitForTimeout(300);
    const box = await page.evaluate((t) => {
      const e = [...document.querySelectorAll('.layer-menus *')].find(
        (x) => x.textContent === t && x.children.length === 0);
      const r = e?.getBoundingClientRect();
      return r && { x: r.x + 8, y: r.y + r.height / 2 };
    }, text);
    if (!box) return false;
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(500);
    return true;
  }

  await page.evaluate(() => os.filer.run(
    'ADFS::HardDisc4.$.Diversions.!Pacman'));
  await page.waitForFunction(() => os.wimp.tasks.find(
    (t) => t.name === 'Pacman')?.game?.frames > 0, null,
  { timeout: 15000 }).catch(() => {});
  const a = await state();
  if (!a) return fail('Pacman did not start');
  if (a.display !== 'full' || !a.full) {
    fail('not full screen: ' + JSON.stringify(a));
  }
  if (a.screen !== 'title') fail('expected the title, got ' + a.screen);
  await page.waitForTimeout(1500);
  const b = await state();
  console.log(`pacman: ${b.frames - a.frames} frames in 1.5 s`);
  if (b.frames <= a.frames + 5) fail('frames are not being drawn');
  const pix = await G(`const p = g.surface.pixels; let lit = 0;
    const cs = new Set();
    for (let i = 0; i < p.length; i += 7) {
      if ((p[i] & 0xffffff) > 0x101010) lit++;
      cs.add(p[i]);
    }
    return { lit: lit / (p.length / 7), colours: cs.size }`);
  if (pix.lit < 0.02 || pix.colours < 8) {
    fail('the title looks empty: ' + JSON.stringify(pix));
  }
  await page.screenshot({ path: `${SHOT}/pacman-title.png` });

  // Return starts a game; Pac-Man is moved by the arrow key
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  let s = await state();
  if (s.screen !== 'play' || !s.game) {
    return fail('Return did not start a game: ' + JSON.stringify(s));
  }
  const px0 = s.game.px;
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(() => {
    const g = os.wimp.tasks.find((x) => x.name === 'Pacman').game;
    return g.game.player.px < 112 && g.game.score > 0;
  }, null, { timeout: 8000 }).catch(() => {});
  s = await state();
  console.log('after ArrowLeft: ' + JSON.stringify(s.game));
  if (!(s.game.px < px0)) fail('Pac-Man did not move left');
  if (!(s.game.score > 0)) fail('no dot was eaten');
  await page.keyboard.up('ArrowLeft');
  await page.screenshot({ path: `${SHOT}/pacman-play.png` });

  // P pauses: pictures go on, the game does not; P again resumes
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(200);
  const p1 = await state();
  await page.waitForTimeout(400);
  const p2 = await state();
  if (p2.frames <= p1.frames) fail('frames stopped while paused');
  if (p1.game.frame !== p2.game.frame) fail('game ran while paused');
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(400);
  if ((await state()).game.frame <= p2.game.frame) fail('no resume');

  // Escape: the pause menu; Desktop is the fourth item
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  if ((await G('return g.screen')) !== 'pause') fail('no pause menu');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const d = await state();
  if (!d) return fail('the task quit (it should stay on the icon bar)');
  if (d.full || d.display) {
    fail('Desktop did not leave the display: ' + JSON.stringify(d));
  }
  if (!(await hasIcon())) fail('no icon bar icon');

  // the windowed display, chosen from the icon bar menu
  if (!(await iconMenu('Window'))) fail('no Window item on the menu');
  await page.waitForTimeout(500);
  const w = await state();
  if (w?.display !== 'window' || w.full || !(await windowOpen())) {
    return fail('no game window: ' + JSON.stringify(w));
  }
  const win = await G(`const r = g.display._win; return r.title`);
  console.log('window: ' + win);
  const wb = await page.evaluate(() => {
    const e = [...document.querySelectorAll('.win')].find((x) =>
      x.style.display !== 'none' && /Pac-?Man/i.test(x.textContent));
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(wb.x, wb.y);
  await page.waitForTimeout(200);
  const f1 = (await state()).frames;
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const w2 = await state();
  if (w2.frames <= f1) fail('the window is not being drawn');
  if (w2.screen !== 'play') fail('keys do not reach the window');

  // View source: !JsEdit opens on the application's directory
  if (!(await iconMenu('View source'))) fail('no View source item');
  await page.waitForFunction(() => os.wimp.tasks.some(
    (x) => x.name === 'JsEdit'), null, { timeout: 10000 })
    .catch(() => {});
  if (!(await page.evaluate(() => os.wimp.tasks.some(
    (x) => x.name === 'JsEdit')))) fail('View source opened no !JsEdit');
  if ((await state())?.display) fail('View source left the display up');
  await page.evaluate(() => os.wimp.tasks.filter(
    (x) => x.name === 'JsEdit').forEach((x) => x.quit()));

  // quitting during play leaves nothing: no icon, no screen, no audio
  await page.evaluate(() => os.wimp.tasks.find(
    (x) => x.name === 'Pacman').game.play());
  await page.waitForTimeout(300);
  if ((await state())?.screen !== 'play') fail('not playing before Quit');
  await page.evaluate(() => os.wimp.tasks.find(
    (x) => x.name === 'Pacman').quit());
  await page.waitForTimeout(300);
  if (await page.evaluate(() => os.wimp.tasks.some(
    (x) => x.name === 'Pacman'))) fail('Quit did not end the task');
  if (await page.evaluate(() => !!document
    .querySelector('.fullscreen-program'))) fail('the screen is left up');
  if (await page.evaluate(() => os.wimp.iconbar.items.some(
    (i) => i.task?.name === 'Pacman'))) fail('the icon is left');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(300);
  if (errs.length) fail('page errors: ' + errs.join('; '));
  console.log('pacman ok');
};
