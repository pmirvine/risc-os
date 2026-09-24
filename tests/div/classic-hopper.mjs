// !Hopper (tools/disc-classics.mjs, src/apps/Hopper): run it from $.Diversions, check the icon bar icon and menu,
// the Info and Choices windows (panes, sliders, Change keys, Set / Cancel), then play: the title and attract
// screens, a game (hops score 10, the time bar, pause F9 / resume F10), Escape back to the title and to the
// desktop, the QTM stand-in owning the sound system while the game runs. Engine checks (cars, water, fly, homes,
// crocodile, extra lives, the name entry of a new high score) run on a second Hopper instance.
// Screens: tests/screens/classic-hopper*.png
const SHOT = process.env.SHOTDIR || 'tests/screens';
const fail = (m) => console.log('FAIL ' + m);
export default async (page) => {
  const ok = await page.evaluate(() => { const s = os.vfs.stat('ADFS::HardDisc4.$.Diversions.!Hopper'); return !!(s && s.isApp); });
  if (!ok) fail('no $.Diversions.!Hopper');
  await page.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Diversions.!Hopper'));
  await page.waitForFunction(() => os.apps.tasksOf('Hopper')[0]?.hopper, null, { timeout: 15000 }).catch(() => fail('Hopper did not start'));
  // run fn(hopper, arg) in the page (fn is serialised; hopper = the task's test hook object)
  const H = (fn, arg) => page.evaluate(({ src, a }) => (0, eval)('(' + src + ')')(os.apps.tasksOf('Hopper')[0].hopper, a), { src: fn.toString(), a: arg });
  if (!(await page.evaluate(() => os.sprites.has('!hopper')))) fail('no !hopper sprite');
  const ib = await page.evaluate(() => {
    const it = os.wimp.iconbar.items.find((i) => i.task?.name === 'Hopper');
    const r = it?.icon?.el?.getBoundingClientRect?.() ?? it?.el?.getBoundingClientRect?.();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  });
  if (!ib) { fail('no icon bar icon'); return; }

  // ---------------------------------------------------------------- icon bar menu, Info, Choices
  await page.mouse.click(ib.x, ib.y, { button: 'middle' });
  await page.waitForTimeout(300);
  const items = await page.evaluate(() => [...document.querySelectorAll('.layer-menus *')].filter((e) => !e.children.length && e.textContent.trim()).map((e) => e.textContent.trim()));
  console.log('menu', items.join('|'));
  for (const t of ['Hopper', 'Info', 'Choices...', 'Quit']) if (!items.includes(t)) fail('menu lacks ' + t);
  const at = (t) => page.evaluate((s) => { const e = [...document.querySelectorAll('.layer-menus *')].find((x) => x.textContent.trim() === s && !x.children.length); const r = e?.getBoundingClientRect(); return r && { x: r.x + r.width - 4, y: r.y + r.height / 2 }; }, t);
  const inf = await at('Info');
  await page.mouse.move(inf.x, inf.y); await page.mouse.move(inf.x + 40, inf.y, { steps: 4 });
  await page.waitForTimeout(400);
  const ver = await H((h) => ({ open: h.proginfo.isOpen, v: h.proginfo.icons[3].text, n: h.proginfo.icons[0].text }));
  console.log('info', JSON.stringify(ver));
  if (!ver.open || ver.v !== '1.05 (23 Dec 2014)' || ver.n !== 'Hopper') fail('Info window ' + JSON.stringify(ver));
  await page.screenshot({ path: `${SHOT}/classic-hopper-info.png` });
  const ch = await at('Choices...');
  await page.mouse.click(ch.x - 30, ch.y);
  await page.waitForTimeout(400);
  const P = await H((h) => ({ open: h.prefs.isOpen, pane: h.panes.keys.isOpen, up: h.panes.keys.icons[0].text, down: h.panes.keys.icons[2].text, left: h.panes.keys.icons[4].text, right: h.panes.keys.icons[6].text,
    dx: h.panes.keys.x - h.prefs.x, dy: h.panes.keys.y - h.prefs.y, above: os.wimp.stack.indexOf(h.panes.keys) > os.wimp.stack.indexOf(h.prefs) }));
  console.log('choices', JSON.stringify(P));
  if (!P.open || !P.pane || !P.above) fail('Choices window / keys pane ' + JSON.stringify(P));
  if (P.up !== "'" || P.down !== '/' || P.left !== 'Z' || P.right !== 'X') fail('default keys ' + JSON.stringify(P));
  if (P.dx !== 1 || P.dy !== 77) fail(`pane offset ${P.dx},${P.dy} (want 1,77 from the templates)`);
  const shotPrefs = async (name) => {
    const r = await H((h) => ({ x: h.prefs.x, y: h.prefs.y, w: h.prefs.w, h: h.prefs.h }));
    const s = await page.evaluate(() => os.wimp.scale || 1);
    await page.screenshot({ path: `${SHOT}/${name}.png`, clip: { x: (r.x - 8) * s, y: (r.y - 28) * s, width: (r.w + 16) * s, height: (r.h + 36) * s } });
  };
  await shotPrefs('classic-hopper-choices');
  // the Sound & music pane: toggle effects off, set the music volume to about half with the slider, Cancel
  const clickPrefs = async (i) => { const q = await H((h, n) => { const r = h.prefs.icons[n].el.getBoundingClientRect(); return { x: r.x + 12, y: r.y + r.height / 2 }; }, i); await page.mouse.click(q.x, q.y); await page.waitForTimeout(200); };
  await clickPrefs(5);
  const S1 = await H((h) => ({ sound: h.panes.sound.isOpen, keys: h.panes.keys.isOpen, fx: h.panes.sound.icons[0].selected, bar: h.panes.sound.icons[5].bbox.x1 - h.panes.sound.icons[5].bbox.x0 }));
  console.log('sound pane', JSON.stringify(S1));
  if (!S1.sound || S1.keys) fail('pane switch ' + JSON.stringify(S1));
  if (!S1.fx) fail('sound effects option not on');
  if (S1.bar !== Math.trunc(48 * (150 / 64))) fail('music volume bar ' + S1.bar + ' (48/64 of 150)');
  await shotPrefs('classic-hopper-choices-sound');
  const clickPane = async (pane, i, fx = 0.5) => { const q = await H((h, a) => { const r = h.panes[a[0]].icons[a[1]].el.getBoundingClientRect(); return { x: r.x + r.width * a[2], y: r.y + r.height / 2 }; }, [pane, i, fx]); await page.mouse.click(q.x, q.y); await page.waitForTimeout(150); };
  await clickPane('sound', 0, 0.1);
  await clickPane('sound', 12, 0.5);
  const S2 = await H((h) => ({ fx: h.panes.sound.icons[0].selected, bar: h.panes.sound.icons[5].bbox.x1 - h.panes.sound.icons[5].bbox.x0, keysFx: h.keys.soundFx, vol: h.keys.musicVol }));
  console.log('after clicks', JSON.stringify(S2));
  if (S2.fx) fail('effects option did not toggle');
  if (Math.abs(S2.bar - 75) > 3) fail('slider bar ' + S2.bar);
  if (S2.keysFx !== 1 || S2.vol !== 48) fail('changes applied before Set');
  await clickPrefs(0);                                 // Cancel
  const S3 = await H((h) => ({ open: h.prefs.isOpen, fx: h.keys.soundFx, vol: h.keys.musicVol }));
  if (S3.open || S3.fx !== 1 || S3.vol !== 48) fail('Cancel ' + JSON.stringify(S3));
  // Change keys: W, S, A, D; then Set
  await H((h) => h.showKeys());
  await page.waitForTimeout(200);
  await clickPrefs(4);
  await clickPane('keys', 8);
  await page.waitForTimeout(200);
  const cw = await H((h) => ({ open: h.change.isOpen, text: h.change.icons[2].text }));
  console.log('change', JSON.stringify(cw));
  if (!cw.open || cw.text !== 'Press the new UP key') fail('change box ' + JSON.stringify(cw));
  await page.screenshot({ path: `${SHOT}/classic-hopper-change.png` });
  await page.keyboard.press('F1');                     // function keys are not accepted
  for (const k of ['KeyW', 'KeyW', 'KeyS', 'KeyA', 'KeyD']) { await page.keyboard.press(k); await page.waitForTimeout(80); }
  const K = await H((h) => ({ open: h.change.isOpen, up: h.panes.keys.icons[0].text, down: h.panes.keys.icons[2].text, left: h.panes.keys.icons[4].text, right: h.panes.keys.icons[6].text }));
  console.log('new keys', JSON.stringify(K));
  if (K.open || K.up !== 'W' || K.down !== 'S' || K.left !== 'A' || K.right !== 'D') fail('changed keys ' + JSON.stringify(K));
  await clickPrefs(1);                                 // Set
  const K2 = await H((h) => ({ open: h.prefs.isOpen, up: h.keys.up, right: h.keys.right }));
  if (K2.open || K2.up !== 33 + 128 || K2.right !== 50 + 128) fail('Set ' + JSON.stringify(K2));
  await H((h) => { Object.assign(h.keys, { up: 207, down: 232, left: 225, right: 194 }); });

  // ---------------------------------------------------------------- the game
  await page.mouse.click(ib.x, ib.y);
  await page.waitForFunction(() => os.apps.tasksOf('Hopper')[0].hopper.running, null, { timeout: 3000 }).catch(() => fail('Select did not start the game'));
  const snd = await page.evaluate(async () => { const { soundSystem } = await import('./src/core/sound/index.js'); return soundSystem().nchan; });
  if (snd !== 8) fail('QTM_SoundControl 8: ' + snd + ' channels');
  await page.waitForTimeout(2500);
  const title = await page.evaluate(() => document.querySelector('.fullscreen-program canvas.hopper-screen') != null);
  if (!title) fail('no full-screen game');
  await page.screenshot({ path: `${SHOT}/classic-hopper-title.png` });
  const mus = await H((h) => ({ playing: h.qtm.playing, title: h.qtm.mod?.title }));
  console.log('attract music', JSON.stringify(mus));
  if (!mus.playing || mus.title !== 'teddy bear boogie 2') fail('intro music ' + JSON.stringify(mus));
  await page.keyboard.press('Space');
  await page.waitForFunction(() => os.apps.tasksOf('Hopper')[0].hopper.game.inGame, null, { timeout: 5000 }).catch(() => fail('Space did not start a game'));
  await page.waitForTimeout(1800);
  const g0 = await H((h) => ({ score: h.game.score, lives: h.game.lives, y: h.game.yPos, x: h.game.frog.x, t: h.game.timer, song: h.qtm.mod?.title, level: h.game.level }));
  console.log('game', JSON.stringify(g0));
  if (g0.score !== 0 || g0.lives !== 3 || g0.y !== 20 || g0.x !== 150 || g0.level !== 1) fail('new game ' + JSON.stringify(g0));
  if (!(g0.t < 400 && g0.t > 300)) fail('time ' + g0.t);
  if (g0.song !== 'scrolltune') fail('in-game music ' + g0.song);
  await page.screenshot({ path: `${SHOT}/classic-hopper-game.png` });
  const hop = async (key) => { await page.keyboard.down(key); await page.waitForTimeout(70); await page.keyboard.up(key); await page.waitForTimeout(260); };
  for (let i = 0; i < 3; i++) await hop('Quote');
  await hop('KeyZ');
  const g1 = await H((h) => ({ score: h.game.score, y: h.game.yPos, x: h.game.frog.x, fy: h.game.frog.y }));
  console.log('after 3 up + 1 left', JSON.stringify(g1));
  if (g1.score !== 30 || g1.y !== 14 || g1.fy !== 224 - 60 || g1.x !== 130) {
    const dead = await H((h) => h.game.lives);
    if (dead === 3) fail('hops ' + JSON.stringify(g1)); else console.log('(the frog was run over)');
  }
  await page.screenshot({ path: `${SHOT}/classic-hopper-hop.png` });
  // F9 pause, F10 resume
  await page.keyboard.down('F9'); await page.waitForTimeout(100); await page.keyboard.up('F9');
  await page.waitForTimeout(300);
  const pa = await H((h) => ({ p: h.game.paused, t: h.game.timer }));
  await page.waitForTimeout(700);
  const pb = await H((h) => ({ p: h.game.paused, t: h.game.timer }));
  if (!pa.p || pa.t !== pb.t) fail('pause ' + JSON.stringify([pa, pb]));
  await page.screenshot({ path: `${SHOT}/classic-hopper-paused.png` });
  await page.keyboard.down('F10'); await page.waitForTimeout(100); await page.keyboard.up('F10');
  await page.waitForTimeout(300);
  if (await H((h) => h.game.paused)) fail('F10 did not resume');
  // Escape: abort the game (back to the title), Escape again: back to the desktop
  await page.keyboard.down('Escape'); await page.waitForTimeout(100); await page.keyboard.up('Escape');
  await page.waitForFunction(() => !os.apps.tasksOf('Hopper')[0].hopper.game.inGame, null, { timeout: 5000 }).catch(() => fail('Escape did not abort the game'));
  await page.waitForTimeout(2500);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !os.apps.tasksOf('Hopper')[0].hopper.running, null, { timeout: 8000 }).catch(() => fail('Escape did not leave the game'));
  const back = await page.evaluate(async () => { const { soundSystem } = await import('./src/core/sound/index.js'); return { scr: !!document.querySelector('.fullscreen-program'), n: soundSystem().nchan }; });
  if (back.scr || back.n === 8) fail('desktop not restored ' + JSON.stringify(back));

  // ---------------------------------------------------------------- engine checks on a second instance
  const E = await page.evaluate(async () => {
    const h = os.apps.tasksOf('Hopper')[0].hopper;
    const { Hopper } = await import('./src/apps/Hopper/game.js');
    const hi = h.hi.map((x) => ({ ...x }));
    const sounds = [];
    const keys = [];
    const env = { ...h.game.env, hi, qtm: { sample: (n) => sounds.push(n), start() {}, stop() {}, stopMusic() {}, volume() {} },
      readKey: () => keys.shift() ?? null, flushKeys() {}, alive: () => true, isDown: () => false };
    const g = new Hopper(env);
    const cv = document.createElement('canvas'); cv.width = 320; cv.height = 256; cv.id = 'hopper-test';
    cv.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:512px;z-index:999999;image-rendering:pixelated';
    document.body.appendChild(cv);
    g.attach(cv);
    const r = {};
    g.readTimer();
    g.cls(); g.scoreInit(); g.carsInit(1); g.waterInit(1); g.snakeInit(1); g.crocInit(1); g.sceneryDisplay(1000);
    // cars: the frog is hit when x+16 >= car.x and x <= car.x+29 (row 12 = lane 0)
    const car = g.road[0].sprites[0];
    r.hit = g.carsCollided({ x: car.x }, 12);
    r.miss = g.carsCollided({ x: car.x + 60 }, 12) === 0 || g.road[0].sprites.some((s) => s !== car && Math.abs(s.x - car.x - 60) < 40);
    // water: on a log the frog is carried; off it, it drowns; a sunk turtle (sprite 4) drowns it too
    const log = g.water[0].sprites[0];
    g.state.plus[0] = 3;
    const box = { x: log.x + 20 };
    r.onLog = g.waterCollided(box, 2) === 0 && box.x === log.x + 23;
    const far = { x: -500 };
    r.drown = g.waterCollided(far, 2) === 1;
    const t = g.water[1].sprites[0]; const was = t.spr; t.spr = 4;
    r.sunk = g.waterCollided({ x: t.x + 10 }, 4) === 1; t.spr = was;
    // the fly on row 6 is worth 200
    g.state.flyOk = 1; g.state.flyPos = g.water[2].sprites[0].x + 20;
    const before = g.score;
    g.waterCollided({ x: g.state.flyPos }, 6);
    r.fly = g.score - before === 200 && g.state.flyOk === 0 && sounds.includes(5);
    // level 1 has no snake and no crocodile; level 2 turtles submerge (dir[0] = -1)
    r.level1 = g.snakeSpeed === 0 && g.croc.use === 0 && g.state.dir.join() === '0,0,0';
    g.waterInit(2); g.snakeInit(2); g.crocInit(2);
    r.level2 = g.snakeSpeed === 96 && g.croc.use === 1 && g.state.dir.join() === '-1,0,0' && g.water[1].sprites[0].spr === 4;
    g.waterInit(6);
    r.level6 = g.state.dir.join() === '-1,1,1';
    // homes: 2 for each, 3 for the last; a home already used, or the bank between them, is 1
    const res = [0, 1, 2, 3, 4].map((l) => g.sceneryCollided({ x: 16 + l * 64 }));
    r.homes = res.join() === '2,2,2,2,3';
    g.homes = [0, 0, 0, 0, 0];
    r.bank = g.sceneryCollided({ x: 50 }) === 1;
    g.homes[0] = 1; r.used = g.sceneryCollided({ x: 16 }) === 1;
    // the crocodile in home 2 (num 6) makes it deadly
    g.homes = [0, 0, 0, 0, 0]; g.croc.inHome = 2;
    r.croc = g.sceneryCollided({ x: 16 + 128 }) === 1;
    // an extra life at 5000, then every 10000
    g.scoreInit(); g.scoreAdd(4990); const l0 = g.lives; g.scoreAdd(10); const l1 = g.lives; g.scoreAdd(10000); r.extra = l0 === 3 && l1 === 4 && g.lives === 5 && g.extra === 25000;
    // random numbers: sync_random from seed 0
    const g2 = new Hopper(env); r.random = [1, 2, 3, 4, 5].map(() => g2.random(1, 6)).join();
    // a new high score: CONGRATULATIONS, the name typed in, Return
    g.frame = async function () { this.present(); await new Promise((res) => requestAnimationFrame(res)); };
    const p = g.insertScore(4321);
    // (the title fades in and the box wipes in first, reading - and flushing - keys as they go)
    await new Promise((res) => setTimeout(res, 5000));
    for (const c of 'Frog') keys.push({ code: c.charCodeAt(0) });
    await new Promise((res) => setTimeout(res, 800));
    r.shot = true;
    window.__hopperFinish = () => { keys.push({ code: 13 }); return p.then(() => { cv.remove(); return hi.slice(0, 3); }); };
    return r;
  });
  console.log('engine', JSON.stringify(E));
  for (const [k, v] of Object.entries(E)) if (v === false) fail('engine: ' + k);
  if (E.random !== '2,5,2,5,5') fail('sync_random(1, 6) from seed 0 gave ' + E.random);   // seed 1, 76, 5701, ... % 6 + 1
  await page.screenshot({ path: `${SHOT}/classic-hopper-hiscore.png`, clip: { x: 0, y: 0, width: 640, height: 512 } });
  const table = await page.evaluate(() => window.__hopperFinish());
  console.log('hi scores', JSON.stringify(table));
  if (table[0].name !== 'Frog' || table[0].score !== 4321 || table[1].score !== 1000) fail('insert score ' + JSON.stringify(table));

  // ---------------------------------------------------------------- Quit
  await page.mouse.click(ib.x, ib.y, { button: 'middle' });
  await page.waitForTimeout(300);
  const q = await at('Quit');
  if (q) { await page.mouse.click(q.x - 20, q.y); await page.waitForTimeout(300); }
  if (await page.evaluate(() => os.apps.tasksOf('Hopper').length)) fail('Quit left the task running');
  const saved = await page.evaluate(() => os.vfs.exists('Choices:Hopper.HiScores'));
  if (!saved) fail('high scores not saved on exit');
  console.log('hopper done');
};
