// Random input over the Diversions finisher's apps: node tests/div/monkey-div.mjs <App> [steps] [seed]
// App = ChangeFSI | PhotoView | ARPlayer | Bookworm | Player. Opens the app with a sample file, then clicks/drags/types at random.
import { launch, BASE_URL } from '../core/pw.mjs';
const [,, app = 'PhotoView', stepsArg = 250, seedArg = 7] = process.argv;
const steps = +stepsArg; let seed = +seedArg;
const { browser, page, logs } = await launch();
await page.goto(BASE_URL + '?fast=1');
await page.waitForFunction(() => window.os?.ready, null, { timeout: 15000 });
const FILE = { ChangeFSI: 'Images.00-49.sa07', PhotoView: 'Images.00-49.sa07', ARPlayer: 'Diversions.AudioDemos.Space', Bookworm: 'Manuals.Manual.BOOKB.TOC/HTM', Player: 'Diversions.AudioDemos.Blast' }[app];
await page.evaluate(async ([a, f]) => {
  const t = await os.apps.start(a === 'Player' ? '!Player' : a);
  const p = 'ADFS::HardDisc4.$.' + f;
  const st = os.vfs.stat(p);
  os.wimp.sendMessage('DataOpen', { path: st.path, filetype: st.filetype, files: [st] });
  const it = os.wimp.iconbar.items.find((i) => i.task === t);
  if (a === 'ChangeFSI' || a === 'Player') it?.onDataLoad?.({ files: [{ path: st.path, filetype: st.filetype }] });
  if (a === 'PhotoView') it?.onClick?.({ button: 'select', sx: 900, sy: 740 });
}, [app, FILE]);
await page.waitForTimeout(2500);
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const buttons = ['left', 'left', 'left', 'right', 'middle'];
for (let i = 0; i < steps; i++) {
  const x = rnd(1024), y = rnd(768), k = rnd(10);
  try {
    if (k < 5) await page.mouse.click(x, y, { button: buttons[rnd(buttons.length)] });
    else if (k < 6) await page.mouse.dblclick(x, y);
    else if (k < 8) { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(rnd(1024), rnd(768), { steps: 5 }); await page.mouse.up(); }
    else if (k < 9) await page.keyboard.press(['Escape', 'Enter', 'ArrowDown', 'a', 'Tab', 'Backspace', 'F3', 'ArrowUp', 'PageDown'][rnd(9)]);
    else await page.mouse.move(x, y, { steps: 3 });
  } catch (e) { logs.push('driver: ' + e.message); }
  if (i % 50 === 49) await page.evaluate(() => { if (os.cli.active) os.cli.close?.(); });
}
await page.screenshot({ path: `tests/screens/div-monkey-${app.toLowerCase()}.png` });
const errs = logs.filter((l) => /PAGEERROR|^error/i.test(l));
console.log(app, errs.length ? '\n' + [...new Set(errs)].slice(0, 10).join('\n') : 'no errors');
await browser.close();
