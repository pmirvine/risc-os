// !Pacman (the JavaScript game on the disc in $.Diversions), the real
// shell on the real core: start it from the Filer, check it takes the
// screen and draws the title, start a game with Return, steer and eat
// a dot, pause, go back to the desktop through the pause menu (the
// icon stays), play in a window chosen from the icon bar menu, View
// source (!JsEdit opens), sound (silent before a gesture, the Sound
// item, a siren in play), and quit during play (nothing is left,
// the AudioContext is closed).
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
  // the roll-call takes about 4 s to show all four ghosts
  await page.waitForFunction(() => os.wimp.tasks.find(
    (x) => x.name === 'Pacman').game.screens.titleScreen.shown() === 4,
  null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(100);
  const pix = await G(`const p = g.surface.pixels; let lit = 0;
    const cs = new Set();
    for (let i = 0; i < p.length; i += 7) {
      if ((p[i] & 0xffffff) > 0x101010) lit++;
      cs.add(p[i]);
    }
    const W = g.surface.width, any = (y0, y1) => {
      for (let i = y0 * W; i < y1 * W; i++) {
        if ((p[i] & 0xffffff) > 0x101010) return true;
      }
      return false;
    };
    const has = (r, gr, b) => {
      const want = ((255 << 24) | (b << 16) | (gr << 8) | r) >>> 0;
      for (let i = 0; i < p.length; i++) if (p[i] >>> 0 === want) {
        return true;
      }
      return false;
    };
    return { lit: lit / (p.length / 7), colours: cs.size,
      legend: any(170, 200), menu: any(214, 284),
      ghosts: [[255, 0, 0], [255, 184, 255], [0, 255, 255],
        [255, 184, 81]].map((c) => has(...c)) }`);
  if (pix.lit < 0.02 || pix.colours < 8) {
    fail('the title looks empty: ' + JSON.stringify(pix));
  }
  if (!pix.legend || !pix.menu || pix.ghosts.includes(false)) {
    fail('the title lacks roll-call, legend or menu: '
      + JSON.stringify(pix));
  }
  // no sound before the first gesture; watch the AudioContext made
  if (await G(`return g.audio.live`)) fail('audio live before a gesture');
  await page.evaluate(() => {
    const Real = window.AudioContext;
    window.AudioContext = class extends Real {
      constructor(...a) { super(...a); window.__ac = this; }
    };
  });
  await page.screenshot({ path: `${SHOT}/pacman-title.png` });
  const items = await G(`return g.screens.menu.items.map((i) =>
    typeof i.text === 'function' ? i.text() : i.text)`);
  if (items.join(',') !== 'Play,High scores,Settings,How to play,' +
    'View source,Desktop') fail('title menu: ' + items);

  // Settings from the title: Lives 3 -> 5 is saved in Choices
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  if ((await G('return g.screen')) !== 'settings') fail('no Settings');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  if ((await G('return g.settings.lives')) !== 5) fail('lives not 5');
  await page.screenshot({ path: `${SHOT}/pacman-settings.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  if ((await G('return g.screen')) !== 'title') fail('no way back');
  const saved = await page.evaluate(async () => {
    const d = (os.sysvars.get('Choices$Write')
      || 'ADFS::HardDisc4.$.!Boot.Choices') + '.Pacman.Settings';
    return os.vfs.exists(d) ? await os.vfs.readText(d) : 'missing ' + d;
  });
  if (!/"lives": ?5/.test(saved)) fail('lives not saved: ' + saved);
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowUp');

  // Return starts a game; Pac-Man is moved by the arrow key
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  let s = await state();
  if (s.screen !== 'play' || !s.game) {
    return fail('Return did not start a game: ' + JSON.stringify(s));
  }
  if ((await G('return g.game.lives')) !== 5) fail('lives not used');
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

  // Escape: the pause menu; Continue loses nothing, Restart is new
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  if ((await G('return g.screen')) !== 'pause') fail('no pause menu');
  const pf = await G('return g.game.frame');
  await page.waitForTimeout(200);
  if ((await G('return g.game.frame')) !== pf) fail('ran in the menu');
  await page.keyboard.press('Enter');          // Continue
  await page.waitForTimeout(200);
  if ((await G('return g.screen')) !== 'play'
    || (await G('return g.game.frame')) <= pf) fail('Continue failed');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');          // Restart
  await page.waitForTimeout(100);
  const rs = await G('return [g.screen, g.game.frame, g.game.lives]');
  if (rs[0] !== 'play' || rs[1] > 30 || rs[2] !== 5) {
    fail('Restart: ' + rs);
  }
  // Desktop is the fifth item
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
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

  // Sound item: ticked by default, unticks, and silences
  if (!(await G(`return g.audio.live`))) fail('no sound after a gesture');
  if (!(await iconMenu('Sound'))) fail('no Sound item');
  if ((await G(`return g.settings.sound`)) !== false) {
    fail('the Sound item did not turn sound off');
  }
  if (!(await iconMenu('Sound'))) fail('no Sound item (again)');
  if ((await G(`return g.settings.sound`)) !== true) {
    fail('the Sound item did not turn sound back on');
  }

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
  if (!(await G(`return g.audio.sources.length`))) {
    fail('no start jingle');
  }
  await page.waitForFunction(() => Object.keys(os.wimp.tasks.find(
    (x) => x.name === 'Pacman').game.audio.loops).length > 0, null,
  { timeout: 15000 }).catch(() => {});
  const loops = await G(`return Object.keys(g.audio.loops)`);
  if (loops.length !== 1 || !/^siren/.test(loops[0])) {
    fail('no siren while playing: ' + loops);
  }
  if (await page.evaluate(() => window.__ac?.state) === 'closed') {
    fail('the context was closed before Quit');
  }
  await page.evaluate(() => os.wimp.tasks.find(
    (x) => x.name === 'Pacman').quit());
  await page.waitForTimeout(300);
  if (await page.evaluate(() => os.wimp.tasks.some(
    (x) => x.name === 'Pacman'))) fail('Quit did not end the task');
  if (await page.evaluate(() => !!document
    .querySelector('.fullscreen-program'))) fail('the screen is left up');
  if (await page.evaluate(() => os.wimp.iconbar.items.some(
    (i) => i.task?.name === 'Pacman'))) fail('the icon is left');
  if (await page.evaluate(() => window.__ac?.state) !== 'closed') {
    fail('Quit left the AudioContext ' + await page.evaluate(
      () => window.__ac?.state));
  }

  // the next start opens the kind of display chosen (a window) with
  // the saved lives
  await page.evaluate(() => os.filer.run(
    'ADFS::HardDisc4.$.Diversions.!Pacman'));
  await page.waitForFunction(() => os.wimp.tasks.find(
    (t) => t.name === 'Pacman')?.game?.frames > 0, null,
  { timeout: 15000 }).catch(() => {});
  const n = await G(`return g && [g.display.kind, g.settings.lives,
    g.settings.display]`);
  if (!n || n[0] !== 'window' || n[1] !== 5 || n[2] !== 'window') {
    fail('settings not remembered: ' + n);
  }
  // put the lives back so reruns start alike
  await G(`g.settings.lives = 3; g.app.changeSetting('lives')`);
  await page.waitForTimeout(200);
  await page.evaluate(() => os.wimp.tasks.find(
    (x) => x.name === 'Pacman').quit());
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(300);
  if (errs.length) fail('page errors: ' + errs.join('; '));
  console.log('pacman ok');
};
