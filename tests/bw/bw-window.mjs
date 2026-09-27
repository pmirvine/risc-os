// BASIC programs in desktop windows (runner.js startBasicWindow, display.js, scheduler.js): a MODE 12
// graphics program and a MODE 7 program running side by side, both advancing (WAIT at 50Hz), keys and
// INKEY(-n) only for the window with the input focus, MOUSE in the program's own OS units, a MODE change
// resizing the window, Alt-Return to full screen and back, Escape, Kill, Restart, Scale, Menu clicks, the
// > prompt in a window with *Cat, and two full-screen programs at once (the newest has the screen, the
// other gets it back).   Screenshots: tests/screens/bw-window-*.png   (server on 8371)
import path from 'path';
import { launch, BASE_URL, SHOTS } from '../core/pw.mjs';

const { browser, page, logs } = await launch({ width: 1400, height: 1024 });
const shot = (n) => page.screenshot({ path: path.join(SHOTS, 'bw-window-' + n + '.png') });
let fail = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fail++; };
const wait = (ms) => page.waitForTimeout(ms);

const CIRCLES = [
  'MODE 12', 'T%=0:S%=0:L%=0',
  'REPEAT',
  'GCOL T% MOD 15+1',
  'CIRCLE FILL 640+400*SIN(T%/20),512+300*COS(T%/31),40',
  'MOUSE X%,Y%,B%',
  'IF INKEY(-99) S%+=1',
  'K%=INKEY(0):IF K%>0 L%=K%',
  'IF K%=ASC"m" MODE 28',
  'T%+=1:WAIT',
  'UNTIL FALSE',
];
const TELETEXT = [
  'MODE 7',
  'PRINT CHR$141;CHR$129;"Teletext in a window"',
  'PRINT CHR$141;CHR$130;"Teletext in a window"',
  'N%=0:L%=0:S%=0',
  'REPEAT N%+=1:PRINT TAB(0,5);CHR$131;"Count ";N%;',
  'IF INKEY(-99) S%+=1',
  'K%=INKEY(0):IF K%>0 L%=K%:PRINT TAB(0,7);CHR$134;"Key ";K%;"  ";',
  'UNTIL FALSE',
];
const listing = (lines) => lines.map((l, i) => `${(i + 1) * 10} ${l}`).join('\n') + '\n';

await page.goto(BASE_URL + '?fast=1');
await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
await page.evaluate(async ([a, b]) => {
  window.R = await import('/src/core/basicwimp/runner.js');
  window.menuClicks = 0;
  window.P1 = await R.startBasicWindow({ program: a, name: 'Circles', onMenu: () => { window.menuClicks++; } });
  window.P2 = await R.startBasicWindow({ program: b, name: 'Teletext' });
}, [listing(CIRCLES), listing(TELETEXT)]);
await page.waitForFunction(() => P1.window?.isOpen && P2.window?.isOpen, null, { timeout: 5000 }).catch(() => {});
await page.evaluate(() => { P1.window.open({ x: 20, y: 60 }); P2.window.open({ x: 700, y: 80 }); });
// resident integer variables: A% = iv[1] ... Z% = iv[26]
const iv = (p, v) => page.evaluate(([p, n]) => window[p].machine.interp.iv[n], [p, v.charCodeAt(0) - 64]);
/** centre of a program's canvas in page coordinates */
const centre = (p) => page.evaluate((p) => { const r = window[p].windowDisplay.canvas.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: { l: r.left, t: r.top, w: r.width, h: r.height } }; }, p);

// ---- both run at once; WAIT ticks at 50Hz
let t0 = await iv('P1', 'T'), n0 = await iv('P2', 'N');
const ms0 = Date.now();
await wait(2000);
let t1 = await iv('P1', 'T'), n1 = await iv('P2', 'N');
const rate = (t1 - t0) / ((Date.now() - ms0) / 1000);
check(t1 > t0 && n1 > n0, `both programs advance (MODE 12: T% ${t0}->${t1}, MODE 7: N% ${n0}->${n1})`);
check(rate > 40 && rate < 56, `WAIT runs at 50Hz in a window (${rate.toFixed(1)} frames/s)`);
const info = await page.evaluate(() => [P1, P2].map((p) => ({ title: p.window.title, mode: p.vdu.mode, w: p.window.w, h: p.window.h, ext: p.window.extent, task: wimp.tasks.includes(p.task) })));
check(info[0].mode === 12 && info[0].w === 640 && info[0].h === 512, `MODE 12 window is 640x512 (${info[0].w}x${info[0].h})`);
check(info[1].mode === 7 && info[1].w === 640 && info[1].h === 500, `MODE 7 window is 640x500 (${info[1].w}x${info[1].h})`);
check(info[0].title === 'Circles' && info[1].title === 'Teletext', `titles (${info[0].title}, ${info[1].title})`);
check(info.every((i) => i.task), 'each program is a task (Task Manager)');
const modeVars = await page.evaluate(() => [P1, P2].map((p) => [p.machine.modeNumber(), p.machine.vduVar(11), p.machine.vduVar(12)]));
check(modeVars[0].join() === '12,639,255' && modeVars[1][0] === 7, `MODE / mode variables are the program's own (${JSON.stringify(modeVars)})`);
await shot('two');

// ---- keys go to the window with the focus
const c1 = await centre('P1'), c2 = await centre('P2');
await page.mouse.click(c2.x, c2.y);
await wait(100);
check(await page.evaluate(() => P2.window.hasFocus), 'clicking the MODE 7 window gives it the input focus');
await page.keyboard.press('a');
await wait(300);
check(await iv('P2', 'L') === 97 && await iv('P1', 'L') === 0, `a key reaches only the focused program (MODE 7 L%=${await iv('P2', 'L')}, MODE 12 L%=${await iv('P1', 'L')})`);
await page.keyboard.down('Space'); await wait(300); await page.keyboard.up('Space');
check(await iv('P1', 'S') === 0 && await iv('P2', 'S') > 0, `INKEY(-99) sees Space only in the focused window (MODE 12 ${await iv('P1', 'S')}, MODE 7 ${await iv('P2', 'S')})`);
// the first click on an unfocused window only gives it the focus
await page.mouse.click(c1.x, c1.y);
await wait(150);
check(await page.evaluate(() => P1.window.hasFocus && P1.machine.mb === 0), 'clicking the MODE 12 window focuses it (the click is not passed on)');
await page.keyboard.down('Space'); await wait(300); await page.keyboard.up('Space');
check(await iv('P1', 'S') > 0, `INKEY(-99) in the MODE 12 window once it has the focus (${await iv('P1', 'S')})`);
// MOUSE: the program's own OS units (MODE 12: 1280 x 1024), whatever the window position
await page.mouse.move(c1.r.l + c1.r.w / 4, c1.r.t + c1.r.h / 4);
await wait(200);
let mx = await iv('P1', 'X'), my = await iv('P1', 'Y');
check(Math.abs(mx - 320) <= 4 && Math.abs(my - 768) <= 4, `MOUSE x,y in OS units (${mx},${my}, want 320,768)`);
await page.mouse.down(); await wait(200);
check(await iv('P1', 'B') === 4, `MOUSE sees Select (B%=${await iv('P1', 'B')})`);
await page.mouse.up(); await wait(150);
// Menu opens the window menu hook, and reaches the program only in Menu button mode
await page.mouse.click(c1.x, c1.y, { button: 'right' });
await wait(150);
check(await page.evaluate(() => window.menuClicks) === 1, 'Menu over the window calls the menu hook');
await page.evaluate(() => P1.setMenuButton(true));
await page.mouse.move(c1.x, c1.y);
await page.mouse.down({ button: 'right' }); await wait(200);
check(await iv('P1', 'B') === 2 && await page.evaluate(() => window.menuClicks) === 1, `Menu button mode: the program sees Menu (B%=${await iv('P1', 'B')})`);
await page.mouse.up({ button: 'right' }); await wait(100);
await page.evaluate(() => P1.setMenuButton(false));

// ---- scrolling: MOUSE still maps to the program's screen
await page.evaluate(() => { P1.window.open({ w: 400, h: 300, scrollX: 100, scrollY: 50 }); });
await wait(100);
const cs = await page.evaluate(() => { const w = P1.window; const r = w.view.getBoundingClientRect(); return { x: r.left + 10, y: r.top + 10 }; });
await page.mouse.move(cs.x, cs.y); await wait(150);
mx = await iv('P1', 'X'); my = await iv('P1', 'Y');
check(Math.abs(mx - 220) <= 4 && Math.abs(my - (1024 - 120)) <= 4, `MOUSE allows for the scroll offsets (${mx},${my}, want 220,904)`);
await page.evaluate(() => { P1.window.open({ w: 640, h: 512, scrollX: 0, scrollY: 0 }); });

// ---- MODE change: the window follows the mode's size
await page.mouse.click(c1.x, c1.y); await wait(50);
await page.keyboard.press('m');
await page.waitForFunction(() => P1.vdu.mode === 28, null, { timeout: 3000 }).catch(() => {});
await wait(300);
const m28 = await page.evaluate(() => ({ mode: P1.machine.modeNumber(), w: P1.window.w, h: P1.window.h, ext: P1.window.extent }));
check(m28.mode === 28 && m28.w === 640 && m28.h === 480 && m28.ext.y1 === 480, `MODE 28 resizes the window to 640x480 (${m28.w}x${m28.h})`);
// Scale x2 doubles the work area; back to 1:1
await page.evaluate(() => P1.setScale(2)); await wait(200);
const x2 = await page.evaluate(() => ({ ext: P1.window.extent, title: P1.window.title }));
check(x2.ext.x1 === 1280 && x2.ext.y1 === 960 && x2.title === 'Circles (x2)', `scale x2: work area 1280x960, title "${x2.title}"`);
await page.evaluate(() => P1.setScale('fit')); await wait(200);
await page.evaluate(() => P1.window.open({ w: 320, h: 400 })); await wait(200);
const fit = await page.evaluate(() => { const r = P1.windowDisplay.canvas.getBoundingClientRect(); return { w: r.width, h: r.height, ww: P1.window.w, wh: P1.window.h }; });
check(Math.abs(fit.w - 320) < 2 && Math.abs(fit.h - 240) < 2, `scale fit: the screen fits the window (${fit.w}x${fit.h} in ${fit.ww}x${fit.wh})`);
await page.evaluate(() => P1.setScale(1)); await wait(200);
await shot('mode28');

// ---- full screen and back, the program carrying on
await page.mouse.click(c1.x, c1.y); await wait(50);
await page.keyboard.press('Alt+Enter');
await wait(400);
const fs = await page.evaluate(() => ({ el: !!document.querySelector('.fullscreen-program canvas'), full: P1.isFullScreen, open: P1.window.isOpen }));
check(fs.el && fs.full && !fs.open, 'Alt-Return: the program goes full screen (its window closes)');
t0 = await iv('P1', 'T'); await wait(500); t1 = await iv('P1', 'T');
check(t1 > t0, `it keeps running full screen (T% ${t0}->${t1})`);
await shot('fullscreen');
await page.keyboard.press('Alt+Enter');
await wait(400);
const back = await page.evaluate(() => ({ el: !!document.querySelector('.fullscreen-program'), full: P1.isFullScreen, open: P1.window.isOpen, mode: P1.vdu.mode, w: P1.window.w }));
check(!back.el && !back.full && back.open && back.mode === 28 && back.w === 640, 'Alt-Return again: back in its window, still in its own MODE 28');
t0 = await iv('P1', 'T'); await wait(300); t1 = await iv('P1', 'T');
check(t1 > t0, 'and still running');

// ---- Escape stops the focused program; the window stays with its picture
await page.mouse.click(c2.x, c2.y); await wait(100);
await page.keyboard.press('Escape');
await page.waitForFunction(() => P2.ended, null, { timeout: 3000 }).catch(() => {});
const esc = await page.evaluate(() => ({ state: P2.state, title: P2.window.title, open: P2.window.isOpen, err: P2.errors.map((e) => e.message).join() }));
check(esc.state === 'finished' && esc.open && /Escape/.test(esc.err), `Escape stops the MODE 7 program (${esc.state}, ${esc.err})`);
check(esc.title === 'Teletext (finished)', `title "${esc.title}"`);
check(!(await page.evaluate(() => P1.ended)), 'the other program is still running');
await shot('escape');

// ---- Restart, suspend / resume, Kill
await page.evaluate(() => P2.restart());
await wait(500);
const rs = await page.evaluate(() => ({ state: P2.state, title: P2.window.title, n: P2.machine.interp.iv[14] }));
check(rs.state === 'running' && rs.title === 'Teletext' && rs.n > 0, `Restart runs it again in the same window (${rs.state}, N%=${rs.n})`);
await page.evaluate(() => P2.suspend());
await wait(100);
n0 = await iv('P2', 'N'); await wait(400); n1 = await iv('P2', 'N');
check(n0 === n1 && (await page.evaluate(() => P2.state)) === 'suspended', `Suspend holds it (${n0} -> ${n1})`);
await page.evaluate(() => P2.resume());
await wait(300);
check(await iv('P2', 'N') > n1, 'Resume carries on');
await page.evaluate(() => P1.setSpeed('arm2'));
check((await page.evaluate(() => P1.machine.opsPerSecond)) === 30000, 'setSpeed(ARM2) limits the program');
await page.evaluate(() => P1.kill());
await page.waitForFunction(() => P1.ended, null, { timeout: 3000 }).catch(() => {});
t0 = await iv('P1', 'T'); await wait(300); t1 = await iv('P1', 'T');
check((await page.evaluate(() => P1.state)) === 'killed' && t0 === t1 && await page.evaluate(() => P1.window.isOpen), 'Kill stops the program and keeps its window');

// ---- the > prompt in a window: typing, *Cat, MODE
await page.evaluate(async () => { window.P3 = await R.startBasicWindow({ prompt: true, name: 'Graphic task window' }); P3.window.open({ x: 300, y: 300 }); });
await wait(600);
const c3 = await centre('P3');
await page.mouse.click(c3.x, c3.y);
await page.keyboard.type('PRINT 6*7'); await page.keyboard.press('Enter');
await page.keyboard.type('*Cat'); await page.keyboard.press('Enter');
await wait(400);
const txt = await page.evaluate(() => { const v = P3.vdu; let s = ''; for (let y = 0; y < 12; y++) { for (let x = 0; x < 80; x++) { const c = v.readCharAt?.(x, y); s += c ? String.fromCharCode(c) : ''; } s += '\n'; } return s; }).catch(() => '');
await shot('prompt');
check(await page.evaluate(() => P3.state === 'running' && P3.window.title === 'Graphic task window'), 'the > prompt runs in a window');
await page.keyboard.type('MODE 7'); await page.keyboard.press('Enter');
await wait(400);
check(await page.evaluate(() => P3.vdu.mode === 7 && P3.window.h === 500), 'MODE 7 typed at the prompt resizes the window');
await page.keyboard.type('*WimpMode 12'); await page.keyboard.press('Enter');
await wait(400);
check(await page.evaluate(() => P3.vdu.mode === 12 && P3.window.h === 512 && wimp.width === 1400), '*WimpMode 12 changes the program\'s own screen, not the desktop\'s');
await page.keyboard.type('QUIT'); await page.keyboard.press('Enter');
await wait(300);
check(await page.evaluate(() => P3.ended), 'QUIT at the prompt ends it');
void txt;

// ---- close: the task goes
await page.evaluate(() => { P1.closeRequest(); P2.closeRequest(); P3.closeRequest(); });
await wait(200);
check(await page.evaluate(() => [P1, P2, P3].every((p) => !p.window && !wimp.tasks.includes(p.task)) && !wimp.tasks.some((t) => t.basicProcess)), 'closing the windows ends their tasks');

// ---- two full-screen programs: the second is shown, the first gets the screen back
await page.evaluate(() => {
  const prog = (col) => `10 MODE 12\n20 GCOL ${col}:RECTANGLE FILL 0,0,1279,1023\n30 A%=0:REPEAT A%+=1:WAIT:UNTIL FALSE\n`;
  window.F1 = new R.BasicProcess({ file: null, programArgs: '' }, prog(1), {}); F1.start();
  setTimeout(() => { window.F2 = new R.BasicProcess({ file: null, programArgs: '' }, prog(2), {}); F2.start(); }, 500);
});
await wait(1200);
const two = await page.evaluate(() => { const cs = [...document.querySelectorAll('.fullscreen-program canvas')]; return { n: cs.length, shown: cs.filter((c) => c.style.display !== 'none').length, top: F2.display.canvas.style.display !== 'none', a: F1.machine.interp.iv[1], b: F2.machine.interp.iv[1] }; });
check(two.n === 2 && two.shown === 1 && two.top, 'a second full-screen program is shown over the first');
check(two.a > 0 && two.b > 0, 'both run');
await shot('twofull');
await page.evaluate(() => F2.kill());
await wait(300);
await page.keyboard.press('Space');
await wait(400);
const one = await page.evaluate(() => ({ n: document.querySelectorAll('.fullscreen-program canvas').length, top: F1.display.canvas?.style.display !== 'none', ended: F2.ended }));
check(one.ended && one.n === 1 && one.top, 'when it ends the first program has the screen again');
await page.keyboard.press('Escape'); await wait(300); await page.keyboard.press('Space'); await wait(400);
check(!(await page.evaluate(() => !!document.querySelector('.fullscreen-program'))), 'and when that ends too, the desktop is back');

const errs = logs.filter((l) => /PAGEERROR|error/i.test(l) && !/favicon/.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exit(fail ? 1 : 0);
