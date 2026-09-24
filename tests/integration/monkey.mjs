// Long random test over the whole desktop: launches many applications, then clicks, drags, types, opens
// menus and picks menu items at random. Page errors are collected with the step that caused them.
//   node tests/integration/monkey.mjs [steps=2000] [seed ...]      (server on 8371)
// Prints "PAGEERROR ..." lines (deduplicated) and exits 1 if there were any.
import { launch, BASE_URL } from '../core/pw.mjs';

const steps = +(process.argv[2] || 2000);
const seeds = process.argv.slice(3).map(Number);
if (!seeds.length) seeds.push(1);
const W = 1280, H = 1024;
const APPS = ['Alarm', 'Blocks', 'Chars', 'Clock', 'CloseUp', 'Configure', 'Draw', 'Edit', 'Help', 'Maestro', 'MemNow',
  'MineHunt', 'Paint', 'Patience', 'Printers', 'Puzzle', 'SciCalc', 'Squash', 'TaskWindow', 'Flasher', 'Meteors', 'Bookworm',
  'PhotoView', 'ChangeFSI', 'ARPlayer', '!Player',
  // apps-and-demos: Calc, Madness, Hopper, Lander (full screen; Escape ends it), tier-B apps
  'Calculator', 'Madness', 'Hopper', 'Lander', 'CDPlayer', 'FontPrint', 'Access+', 'Patch', 'AREncode', 'T1ToFont', 'InetSetup',
  // started like a Filer double-click: tier-A BASIC utilities (not !Verify / !HForm, which run single-tasking for
  // a long time, nor !ResetBoot, whose RESET restarts the machine) and BASIC demos (Plasma is full screen)
  'ADFS::HardDisc4.$.Diversions.Tools.!Calibrate', 'ADFS::HardDisc4.$.Diversions.Tools.!ShowScrap', 'ADFS::HardDisc4.$.Printing.!PrintEdit',
  'ADFS::HardDisc4.$.Utilities.!SaveCMOS', 'ADFS::HardDisc4.$.Video.!Warning', 'ADFS::HardDisc4.$.Demos.BASIC.WimpClock',
  'ADFS::HardDisc4.$.Demos.BASIC.Plasma'];
const FILES = ['ADFS::HardDisc4.$.Tutorials.DrawTutor.Map', 'ADFS::HardDisc4.$.Tutorials.PaintTutor.Flower', 'ADFS::HardDisc4.$.Tutorials.ReadMe',
  'ADFS::HardDisc4.$.Sound.Fanfare', 'ADFS::HardDisc4.$.Images.00-49.sa07'];
const KEYS = ['Escape', 'Enter', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'a', 'Z', '1', ' ', 'Tab', 'Backspace', 'Delete',
  'Home', 'End', 'PageDown', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'Control+F12', 'Control+c',
  'Control+v', 'Control+z', 'Shift+F3', 'Control+F2', 'Control+a', 'Insert'];
const BUTTONS = ['left', 'left', 'left', 'right', 'middle'];

let total = 0;
const unique = new Map();
for (const seed0 of seeds) {
  let seed = seed0;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const { browser, page } = await launch({ width: W, height: H });
  // printing opens pop-up windows and window.print(): stub them; no confirm dialogs either
  await page.addInitScript(() => { window.print = () => {}; window.open = () => null; window.alert = () => {}; window.confirm = () => true; });
  let step = -1, action = 'boot';
  page.on('pageerror', (e) => {
    const key = e.message.split('\n')[0];
    total++;
    if (!unique.has(key)) unique.set(key, { n: 0, first: `seed ${seed0} step ${step} ${action}`, stack: (e.stack ?? '').split('\n').slice(0, 6).join('\n') });
    unique.get(key).n++;
  });
  page.on('console', (m) => { if (m.type() === 'error' && /Error in \w+ handler|Uncaught/.test(m.text())) { const k = 'console: ' + m.text().slice(0, 160); if (!unique.has(k)) unique.set(k, { n: 0, first: `seed ${seed0} step ${step} ${action}`, stack: '' }); unique.get(k).n++; total++; } });
  const ready = async () => { await page.waitForFunction(() => window.os?.ready, null, { timeout: 30000 }); };
  await page.goto(BASE_URL + '?fast=1');
  await ready();
  const launchSome = async (n) => {
    for (let i = 0; i < n; i++) {
      const a = APPS[rnd(APPS.length)];
      action = 'start ' + a;
      await page.evaluate((a) => (/^ADFS::/.test(a) ? os.filer.run(a) : os.apps.start(a)).catch?.(() => {}), a).catch(() => {});
      await page.waitForTimeout(200);
    }
    const f = FILES[rnd(FILES.length)];
    action = 'run ' + f;
    await page.evaluate((f) => os.filer.run(f), f).catch(() => {});
    await page.evaluate(() => { os.filer.openDir('ADFS::HardDisc4.$', { x: 20, y: 40, w: 500, h: 300 }); os.filer.openDir('RAM::RamDisc0.$', { x: 600, y: 500, w: 400, h: 250 }); }).catch(() => {});
  };
  await launchSome(10);
  await page.waitForTimeout(1500);
  for (step = 0; step < steps; step++) {
    try {
      if (page.url().includes('about:blank')) break;
      const menuOpen = await page.evaluate(() => !!wimp.menus?.isOpen).catch(() => false);
      let x = rnd(W), y = rnd(H);
      const k = rnd(20);
      if (rnd(2)) {   // aim at a random open window (work area or furniture) rather than anywhere
        const wins = await page.evaluate(() => [...wimp.windows].filter((w) => w.isOpen && !/iconbar|pinboard/.test(w.el.className)).map((w) => [w.x - 20, w.y - 20, w.w + 40, w.h + 40])).catch(() => []);
        if (wins.length) { const [wx, wy, ww, wh] = wins[rnd(wins.length)]; x = Math.max(0, Math.min(W - 1, wx + rnd(Math.max(1, ww)))); y = Math.max(0, Math.min(H - 1, wy + rnd(Math.max(1, wh)))); }
      }
      if (menuOpen && k < 8) {
        const items = page.locator('.menu .mitem');
        const n = await items.count();
        if (n) {
          const b = await items.nth(rnd(n)).boundingBox();
          if (b) {
            action = 'menu item';
            if (rnd(3) === 0) await page.mouse.move(b.x + b.width - 6, b.y + b.height / 2, { steps: 2 });   // open the submenu
            else await page.mouse.click(b.x + 20, b.y + b.height / 2, { button: rnd(4) ? 'left' : 'right' });
          }
        }
      } else if (k < 8) {
        const adj = rnd(6) === 0;   // Shift+Select = Adjust
        action = `${adj ? 'adjust ' : ''}click ${x},${y}`;
        if (adj) await page.keyboard.down('Shift');
        await page.mouse.click(x, y, { button: adj ? 'left' : BUTTONS[rnd(BUTTONS.length)] });
        if (adj) await page.keyboard.up('Shift');
      }
      else if (k < 9) { action = `dblclick ${x},${y}`; await page.mouse.dblclick(x, y); }
      else if (k < 12) {
        const x2 = rnd(W), y2 = rnd(H);
        action = `drag ${x},${y} -> ${x2},${y2}`;
        const shift = rnd(4) === 0;
        if (shift) await page.keyboard.down('Shift');
        await page.mouse.move(x, y); await page.mouse.down({ button: rnd(5) ? 'left' : 'right' });
        await page.mouse.move(x2, y2, { steps: 6 }); await page.mouse.up({ button: 'left' }); await page.mouse.up({ button: 'right' });
        if (shift) await page.keyboard.up('Shift');
      } else if (k < 15) { const key = KEYS[rnd(KEYS.length)]; action = 'key ' + key; await page.keyboard.press(key); }
      else if (k < 16) { action = 'type'; await page.keyboard.type('Hello *cat 42'.slice(0, 1 + rnd(12))); }
      else if (k < 17) { action = 'menu click'; await page.mouse.click(x, y, { button: 'middle' }); }
      else if (k < 18) {   // icon bar: click / menu on a random icon
        const ib = await page.evaluate(() => wimp.iconbar.items.map((i) => wimp.iconbar.iconScreenX(i))).catch(() => []);
        if (ib.length) { const ix = ib[rnd(ib.length)]; action = `iconbar ${ix}`; await page.mouse.click(ix, H - 30, { button: rnd(2) ? 'left' : 'middle' }); }
      } else { action = 'move'; await page.mouse.move(x, y, { steps: 3 }); }
    } catch (e) {
      if (/Target (page|closed)|has been closed/.test(e.message)) { console.log(`stopped at step ${step}: ${e.message.split("\n")[0]}`); break; }
      if (/Execution context was destroyed|navigation/i.test(e.message)) { await ready().catch(() => {}); }
    }
    if (step % 10 === 9) {   // error boxes showing JavaScript errors (handler exceptions are reported this way)
      const boxes = await page.evaluate(() => [...wimp.windows].filter((w) => w.isOpen && /^(Message from|Error)/.test(w.title ?? ''))
        .map((w) => w.title + ': ' + w.icons.map((i) => i?.text).filter(Boolean).join(' | '))).catch(() => []);
      for (const b of boxes) if (/Cannot read|is not a function|is not defined|undefined|TypeError|ReferenceError|RangeError|Internal error|null/i.test(b)) {
        const k = 'errorbox: ' + b.slice(0, 200);
        if (!unique.has(k)) unique.set(k, { n: 0, first: `seed ${seed0} step ${step} ${action}`, stack: '' });
        unique.get(k).n++; total++;
      }
    }
    if (step % 100 === 99) {
      action = 'housekeeping';
      // back to the desktop from full-screen things; restart after a shutdown; top up the running apps
      await page.evaluate(() => {
        if (os.cli?.active) os.cli.close?.();
        if (window.basic && os.cli?.acquired) { /* */ }
        for (const w of [...wimp.windows]) if (w.isOpen && /^(Message from|Error)/.test(w.title ?? '')) w.emit('key', { code: 27, preventDefault() {} });
      }).catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
      const shut = await page.evaluate(() => !wimp.tasks.some((t) => t.kind === 'app')).catch(() => true);
      if (!(await page.evaluate(() => !!window.os?.ready).catch(() => false))) {
        await page.goto(BASE_URL + '?fast=1').catch(() => {}); await ready().catch(() => {});
      }
      if (shut || step % 500 === 499) await launchSome(4);
    }
  }
  if (process.env.DUMP) console.log(await page.evaluate(() => JSON.stringify({ stack: [...wimp.windows].filter((w) => w.isOpen).map((w) => [w.title, w.task?.name, w.el.className, w.el.style.zIndex, w.x, w.y, w.w, w.h]).slice(0, 12), body: getComputedStyle(document.body).background.slice(0, 80), top: [[640, 100], [640, 990], [1200, 300]].map(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + '.' + e.className + ' <' + (e.parentElement?.className ?? '') : null; }), scale: wimp.scale, size: [wimp.width, wimp.height] })).catch((e) => e.message));
  if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}-${seed0}.png` }).catch(() => {});
  console.log(`seed ${seed0}: ran ${step} steps; ${await page.evaluate(() => wimp.tasks.filter((t) => t.kind === 'app').length + ' apps, ' + [...wimp.windows].filter((w) => w.isOpen).length + ' windows open').catch(() => '?')}`);
  await browser.close();
}
for (const [k, v] of unique) console.log(`PAGEERROR x${v.n} ${k}\n    first: ${v.first}\n    ${v.stack.replace(/\n/g, '\n    ')}`);
console.log(`${steps} steps x ${seeds.length} seed(s): ${total} page errors, ${unique.size} distinct`);
process.exit(unique.size ? 1 : 0);
