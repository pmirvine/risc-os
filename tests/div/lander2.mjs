// !Lander2 (Lander II, the JavaScript game on the disc in $.Diversions): start it from the Filer, check that
// it takes the screen and draws the title (frames advance, the picture isn't empty), start a game from the
// menu, fly and fire with the mouse, pause, quit to the title and Escape back to the desktop (the icon bar
// icon stays). Then the windowed display. Screenshots: lander2-title.png, lander2-play.png.
// node tests/core/shot.mjs div-lander2 tests/div/lander2.mjs
const SHOT = process.env.SHOTDIR || 'tests/screens';
export default async (page) => {
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const fail = (m) => console.log('FAIL ' + m);
  const G = (body) => page.evaluate(`(() => { const t = os.wimp.tasks.find((x) => x.name === 'Lander2'); const g = t?.game; ${body} })()`);
  const state = () => G(`return g && { frames: g.frames, screen: g.screen, display: g.display,
    full: !!document.querySelector('.fullscreen-program'), world: g.world && { state: g.world.state, y: g.world.player.y,
    shots: g.world.shots || 0, fuel: g.world.player.fuel, paused: !!g.screenObject.paused } }`);

  await page.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Diversions.!Lander2'));
  await page.waitForFunction(() => os.wimp.tasks.find((t) => t.name === 'Lander2')?.game?.frames > 0, null, { timeout: 15000 }).catch(() => {});
  const a = await state();
  if (!a) return fail('Lander2 did not start');
  if (a.display !== 'full' || !a.full) fail('not full screen: ' + JSON.stringify(a));
  if (a.screen !== 'title') fail('expected the title screen, got ' + a.screen);
  await page.waitForTimeout(1500);
  const b = await state();
  console.log(`lander2: ${b.frames - a.frames} frames in 1.5 s`);
  if (b.frames <= a.frames + 5) fail('frames are not being drawn');
  // the picture: plenty of colours, not mostly black
  const pix = await G(`const p = g.surface.pixels; let lit = 0; const cs = new Set();
    for (let i = 0; i < p.length; i += 7) { if ((p[i] & 0xffffff) > 0x101010) lit++; cs.add(p[i]); }
    return { lit: lit / (p.length / 7), colours: cs.size }`);
  if (pix.lit < 0.3 || pix.colours < 40) fail('the title looks empty: ' + JSON.stringify(pix));
  await page.screenshot({ path: `${SHOT}/lander2-title.png` });

  // Return chooses the first item, Play Invasion
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  let s = await state();
  if (s.screen !== 'play' || !s.world) return fail('Return did not start a game: ' + JSON.stringify(s));
  await page.waitForFunction(() => os.wimp.tasks.find((x) => x.name === 'Lander2').game.world?.state === 'playing', null, { timeout: 8000 }).catch(() => {});
  const y0 = (await state()).world.y;

  // fly: thrust (Select) while moving the mouse, then fire (Adjust)
  const vp = page.viewportSize();
  const cx = vp.width / 2, cy = vp.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'left' });
  for (let i = 0; i < 12; i++) { await page.mouse.move(cx + i * 2, cy - i); await page.waitForTimeout(40); }
  await page.mouse.up({ button: 'left' });
  await page.mouse.down({ button: 'right' }); await page.waitForTimeout(700); await page.mouse.up({ button: 'right' });
  s = await state();
  console.log('after flying: ' + JSON.stringify(s.world));
  if (!(s.world.y < y0 - 0.5)) fail('the ship did not take off');
  if (s.world.shots < 1) fail('no shots were fired');
  const stick = await G('return [g.input.stickX, g.input.stickY]');
  if (!(stick[0] > 0 && stick[1] > 0)) fail('the mouse did not move the virtual mouse: ' + stick);
  await page.screenshot({ path: `${SHOT}/lander2-play.png` });

  // P pauses (the world stops), P again resumes
  await page.keyboard.press('KeyP'); await page.waitForTimeout(200);
  const p1 = await state(); await page.waitForTimeout(300); const p2 = await state();
  if (!p1.world.paused) fail('P did not pause');
  if (p1.world.y !== p2.world.y) fail('the world moved while paused');
  await page.keyboard.press('KeyP'); await page.waitForTimeout(200);
  if ((await state()).world.paused) fail('P did not resume');

  // Escape: the pause menu; Quit to title (the fourth item); Escape again: the desktop
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  if (!(await state()).world.paused) fail('Escape did not pause');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  if ((await state()).screen !== 'title') fail('Quit to title did not');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  const d = await state();
  if (!d) return fail('the task quit (it should stay on the icon bar)');
  if (d.full || d.display) fail('Escape did not return to the desktop: ' + JSON.stringify(d));
  if (!(await page.evaluate(() => os.wimp.tasks.find((x) => x.name === 'Lander2').iconbarIcons.size))) fail('no icon bar icon');

  // the windowed display: a desktop window with the game in it
  await G("g.open('window')");
  await page.waitForTimeout(800);
  const w = await state();
  const win = await page.evaluate(() => [...document.querySelectorAll('.win')].some((e) => e.style.display !== 'none' && /Lander II/.test(e.textContent)));
  if (w.display !== 'window' || !win || w.full) fail('no game window: ' + JSON.stringify(w));
  const f1 = w.frames; await page.waitForTimeout(500);
  if ((await state()).frames <= f1) fail('the window is not being drawn');
  await G('g.toDesktop()');
  await page.waitForTimeout(200);
  if (await page.evaluate(() => [...document.querySelectorAll('.win')].some((e) => e.style.display !== 'none' && /Lander II/.test(e.textContent)))) fail('the window did not close');

  // quitting removes it altogether
  await page.evaluate(() => os.wimp.tasks.find((x) => x.name === 'Lander2').quit());
  await page.waitForTimeout(200);
  if (await page.evaluate(() => os.wimp.tasks.some((x) => x.name === 'Lander2'))) fail('Quit did not end the task');
  if (errs.length) fail('page errors: ' + errs.join('; '));
  console.log('lander2 ok');
};
