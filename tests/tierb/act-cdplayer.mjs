// !CDPlayer: launched by double-clicking it in $.Utilities; the Audio Panel with an empty CD-ROM drive.
// Opens the main window from the icon bar, presses PLAY / PAUSE / STOP / EJECT / skip buttons (nothing
// stays lit, the track display keeps "--"), opens the keypad via the logo, the Setup window from the
// icon bar menu, changes the SCSI device number (written to <AudioPanel$Dir>.config), the Info box.
import path from 'path';
import { SHOTS } from '../core/pw.mjs';
import { filerOpen, iconbarPos, menuTexts, clickItem, hoverArrow, check } from '../edit/ui.mjs';

const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, `tierB-cdplayer-${n}.png`) });
const iconCentre = (page, win, i) => page.evaluate(({ win, i }) => {
  const t = os.apps.tasksOf('CDPlayer')[0].cdplayer[win];
  const b = t.icons[i].bbox;
  return t.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
}, { win, i });
const sel = (page, win, i) => page.evaluate(({ win, i }) => !!os.apps.tasksOf('CDPlayer')[0].cdplayer[win].icons[i].selected, { win, i });
const spr = (page, win, i) => page.evaluate(({ win, i }) => os.apps.tasksOf('CDPlayer')[0].cdplayer[win].icons[i].spriteName, { win, i });

export default async (page) => {
  await filerOpen(page, 'ADFS::HardDisc4.$.Utilities', '!CDPlayer', { wait: 1500 });
  check('CDPlayer task running', await page.evaluate(() => os.apps.tasksOf('CDPlayer').length === 1));
  check('AudioPanel$Dir set', /!CDPlayer$/i.test(await page.evaluate(() => os.sysvars.get('AudioPanel$Dir') ?? '')));
  const ib = await iconbarPos(page, 'CDPlayer');
  check('icon bar icon', !!ib);
  await page.mouse.click(ib.x, ib.y);
  await page.waitForTimeout(700);
  check('main window open', await page.evaluate(() => os.apps.tasksOf('CDPlayer')[0].cdplayer.main.isOpen));
  check('track display empty (--)', (await spr(page, 'main', 10)) === '-' && (await spr(page, 'main', 11)) === '-');
  await shot(page, 'main');

  // PLAY lights only while held; nothing plays without a disc
  const play = await iconCentre(page, 'main', 3);
  await page.mouse.move(play.x, play.y);
  await page.mouse.down();
  await page.waitForTimeout(250);
  check('PLAY lit while held', await sel(page, 'main', 3));
  await shot(page, 'play-held');
  await page.mouse.up();
  await page.waitForTimeout(250);
  check('PLAY released: not playing', !(await sel(page, 'main', 3)) && !(await page.evaluate(() => os.apps.tasksOf('CDPlayer')[0].cdplayer.state.playing)));
  for (const i of [5, 6, 7, 0, 1, 2, 4]) {
    const p = await iconCentre(page, 'main', i);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(150);
    check(`button ${i} released`, !(await sel(page, 'main', i)));
  }
  check('still no disc', !(await page.evaluate(() => os.apps.tasksOf('CDPlayer')[0].cdplayer.state.discIn)));

  // the logo opens the keypad
  const logo = await iconCentre(page, 'main', 8);
  await page.mouse.click(logo.x, logo.y);
  await page.waitForTimeout(400);
  check('keypad open', await page.evaluate(() => os.apps.tasksOf('CDPlayer')[0].cdplayer.keypad.isOpen));
  const k5 = await iconCentre(page, 'keypad', 5);
  await page.mouse.click(k5.x, k5.y);
  const rpt = await iconCentre(page, 'keypad', 14);
  await page.mouse.click(rpt.x, rpt.y);
  await page.waitForTimeout(200);
  check('keypad keys do nothing without a disc', (await spr(page, 'main', 10)) === '-' && !(await sel(page, 'keypad', 14)));
  await shot(page, 'keypad');

  // icon bar menu: Info, Keypad, Setup, Quit
  await page.mouse.click(ib.x, ib.y, { button: 'right' });
  await page.waitForTimeout(300);
  const items = await menuTexts(page, 0);
  check('menu items', items.map((s) => s.trim()).join(',').startsWith('Info,Keypad,Setup,Quit'), items.join('|'));
  await hoverArrow(page, 0, 0);
  await page.waitForTimeout(300);
  await shot(page, 'info');
  check('info version', await page.evaluate(() => document.body.innerText.includes('1.14 (18 Oct 1993)')));
  await clickItem(page, 0, 2);   // Setup
  await page.waitForTimeout(400);
  check('setup open', await page.evaluate(() => os.apps.tasksOf('CDPlayer')[0].cdplayer.setup.isOpen));
  check('setup shows device 0', (await spr(page, 'setup', 6)) === '0');
  const devPlus = await iconCentre(page, 'setup', 1);
  await page.mouse.click(devPlus.x, devPlus.y);
  await page.waitForTimeout(200);
  await page.mouse.click(devPlus.x, devPlus.y);
  await page.waitForTimeout(400);
  check('device now 2', (await spr(page, 'setup', 6)) === '2');
  const cfg = await page.evaluate(async () => Array.from(await os.vfs.readFile('<AudioPanel$Dir>.config')));
  check('config written', cfg.length === 20 && cfg[0] === 2 && cfg[12] === 4, cfg.join(','));
  await shot(page, 'setup');
  const devMinus = await iconCentre(page, 'setup', 0);
  await page.mouse.click(devMinus.x, devMinus.y); await page.waitForTimeout(150);
  await page.mouse.click(devMinus.x, devMinus.y); await page.waitForTimeout(300);
  check('device back to 0', (await spr(page, 'setup', 6)) === '0');

  // interactive help text from the program
  const h = await page.evaluate(({ x, y }) => wimp.helpAt(x, y), await iconCentre(page, 'main', 3));
  check('help for PLAY', h === 'This is the PLAY button.', h);

  // close the main window: keypad closes too
  await page.evaluate(() => { const c = os.apps.tasksOf('CDPlayer')[0].cdplayer; c.main.emit('close', { button: 'select' }); });
  await page.waitForTimeout(200);
  check('keypad closed with main', !(await page.evaluate(() => os.apps.tasksOf('CDPlayer')[0].cdplayer.keypad.isOpen)));
  await page.mouse.click(ib.x, ib.y);
  await page.waitForTimeout(300);

  // Quit, then run the ARM program file itself: the native stand-in starts the panel again
  await page.evaluate(() => os.apps.tasksOf('CDPlayer')[0].quit());
  await page.waitForTimeout(200);
  await page.evaluate(() => os.cli.run('Run ADFS::HardDisc4.$.Utilities.!CDPlayer.cdplayer'));
  await page.waitForTimeout(800);
  check('cdplayer file starts the app', await page.evaluate(() => os.apps.tasksOf('CDPlayer').length === 1));
};
