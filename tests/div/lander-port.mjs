// !Lander, JavaScript port: start it from the Filer, check that frames are drawn (at the original's frame
// rate), fly and fire with the mouse, screenshot (lander-port-*.png), then Escape back to the desktop.
// node tests/core/shot.mjs lander-port-end tests/div/lander-port.mjs   (QS=lander=port is implied)
const SHOT = process.env.SHOTDIR || 'tests/screens';
export default async (page) => {
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const fail = (m) => { console.log('FAIL ' + m); };
  await page.evaluate(() => os.cli.run('Run ADFS::HardDisc4.$.Diversions.!Lander -port'));
  await page.waitForFunction(() => os.apps.tasksOf('Lander')[0]?.lander, null, { timeout: 10000 }).catch(() => {});
  const L = () => page.evaluate(() => { const l = os.apps.tasksOf('Lander')[0]?.lander; return l && { mode: l.mode, frames: l.runner.frames, bank: l.vdu.displayBank, mode13: l.vdu.mode }; });
  const s0 = await L();
  if (!s0) { fail('Lander did not start'); return; }
  if (s0.mode !== 'port') fail('expected the port, got ' + s0.mode);
  await page.waitForTimeout(2000);
  const s1 = await L();
  const fps = (s1.frames - s0.frames) / 2;
  console.log(`lander port: mode ${s1.mode}, MODE ${s1.mode13}, ${s1.frames} frames, ~${fps.toFixed(1)} frames/s`);
  if (s1.mode13 !== 128 + 13 && s1.mode13 !== 13) fail('not in MODE 13: ' + s1.mode13);
  if (fps < 5 || fps > 30) fail('frame rate out of range: ' + fps);
  // what is on the screen: the title, the fuel bar and the landscape
  const pix = () => page.evaluate(() => {
    const l = os.apps.tasksOf('Lander')[0].lander, v = l.vdu, b = v.banks[v.displayBank];
    let lit = 0, colours = new Set();
    for (let i = 0; i < b.length; i++) if (b[i]) { lit++; colours.add(b[i]); }
    return { lit, colours: colours.size };
  });
  const p1 = await pix();
  if (p1.lit < 5000 || p1.colours < 8) fail('screen looks empty: ' + JSON.stringify(p1));
  await page.screenshot({ path: `${SHOT}/lander-port-start.png` });
  // fly: thrust (Select) while moving the mouse, then hover (Menu) and fire (Adjust)
  const vp = page.viewportSize();
  const cx = vp.width / 2, cy = vp.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'left' });
  for (let i = 0; i < 20; i++) { await page.mouse.move(cx + i * 3, cy - i * 2); await page.waitForTimeout(40); }
  await page.mouse.up({ button: 'left' });
  await page.mouse.down({ button: 'middle' }); await page.waitForTimeout(500); await page.mouse.up({ button: 'middle' });
  await page.mouse.down({ button: 'right' });
  for (let i = 0; i < 10; i++) { await page.mouse.move(cx + 60 - i * 6, cy - 40); await page.waitForTimeout(50); }
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(300);
  const st = await page.evaluate(() => { const l = os.apps.tasksOf('Lander')[0].lander; return { y: l.runner.game.workspace[0x98 >> 2], fuel: l.runner.game.workspace[0x128 >> 2], score: l.runner.game.workspace[0x124 >> 2] }; });
  console.log('after flying: ' + JSON.stringify(st));
  if (st.y === 0x03500000 - 0x00640000) fail('the ship did not take off');
  if (st.score >= 500) fail('no bullets were fired');
  await page.screenshot({ path: `${SHOT}/lander-port-flying.png` });
  // Escape ends the game (MODE 0) and returns to the desktop
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  const left = await page.evaluate(() => ({ tasks: os.apps.tasksOf('Lander').length, full: !!document.querySelector('.fullscreen-program') }));
  if (left.tasks || left.full) fail('Escape did not quit: ' + JSON.stringify(left));
  if (errs.length) fail('page errors: ' + errs.join('; '));
  console.log('lander port ok');
};
