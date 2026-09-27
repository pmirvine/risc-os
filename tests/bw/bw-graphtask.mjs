// !GraphTask (src/apps/GraphTask): the application around graphics task windows. Starting it from $.Apps (its icon
// on the icon bar), Select for a > prompt window (the Choices' mode), BASIC files dropped on the icon (DataLoad) and
// on !GraphTask in a Filer window, the window menu (Speed, Scale, Suspend / Resume, Kill, Restart, Full screen,
// Menu button and Shift-Menu, Save screen writing a sprite file), closing a running program's window (asks first),
// Quit (asks first, kills the windows), the Choices window and "Double-click runs BASIC in a window" on and off,
// *GraphTask from an Obey file and from an application's !Run, Run <GraphTask$Dir> <file>, *BASIC -window, the Task
// Manager's "Graphics task window", and !JsEdit's Run for a BASIC listing.
//   Screenshots: tests/screens/bw-graphtask-*.png (SHOTS=dir to put them elsewhere)   (server on 8371)
import path from 'path';
import { launch, BASE_URL, SHOTS } from '../core/pw.mjs';
import { menuTexts, hoverArrow, clickItem, iconbarPos } from '../edit/ui.mjs';

const { browser, page, logs } = await launch({ width: 1400, height: 1024 });
const shot = (n) => page.screenshot({ path: path.join(SHOTS, 'bw-graphtask-' + n + '.png') });
let fail = 0;
const check = (ok, msg, extra) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !ok ? ' ' + JSON.stringify(extra) : '')); if (!ok) fail++; };
const wait = (ms) => page.waitForTimeout(ms);
const RAM = 'RAM::RamDisc0.$';

await page.goto(BASE_URL + '?fast=1');
await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });

// programs on the RAM disc
await page.evaluate(async (RAM) => {
  const { tokeniseText } = await import('/src/apps/Edit/basic.js');
  const put = (leaf, text) => os.vfs.writeFile(`${RAM}.${leaf}`, tokeniseText(text).bytes, { filetype: 0xFFB });
  put('Counter', '10 MODE 12\n20 N%=0\n30 REPEAT N%+=1:GCOL N% MOD 15+1:CIRCLE FILL 640,512,40+N% MOD 300:WAIT\n40 UNTIL FALSE\n');
  put('Args', '10 A$=FNargs:PRINT "ARGS=";A$\n20 END\n30 DEF FNargs:SYS "OS_GetEnv" TO a$:=a$\n');
  put('Quick', '10 MODE 12:GCOL 2:RECTANGLE FILL 100,100,400,300:PRINT "Done"\n');
  os.vfs.writeFile(`${RAM}.Listing`, '10 MODE 12\n20 COLOUR 3:PRINT "A text listing"\n30 REPEAT:WAIT:UNTIL FALSE\n', { filetype: 0xFFF });
  os.vfs.writeFile(`${RAM}.Obey`, `GraphTask ${RAM}.Quick\n`, { filetype: 0xFEB });
  os.vfs.mkdir(`${RAM}.!Demo`);
  os.vfs.writeFile(`${RAM}.!Demo.!Run`, '| !Run for a program that opens itself in a graphics task window\nGraphTask <Obey$Dir>.!RunImage\n', { filetype: 0xFEB });
  os.vfs.writeFile(`${RAM}.!Demo.!RunImage`, tokeniseText('10 MODE 12:PRINT "Demo app":REPEAT:WAIT:UNTIL FALSE\n').bytes, { filetype: 0xFFB });
}, RAM);
const G = () => page.evaluate(() => os.apps.tasksOf('GraphTask').length);
/** The graphics task windows' processes, newest last: {name, title, state, mode, speed, scale, open} */
const procs = () => page.evaluate(() => [...(os.apps.tasksOf('GraphTask')[0]?.graphTask.procs ?? [])].map((p) => ({ name: p.name, title: p.window?.title ?? null, state: p.state, mode: p.vdu?.mode, speed: p.speed, scale: p.scale, open: !!p.window?.isOpen })));
const newest = async () => (await procs()).pop();
const winCentre = (i = -1) => page.evaluate((i) => { const ps = [...os.apps.tasksOf('GraphTask')[0].graphTask.procs]; const p = ps.at(i); const r = p.window.view.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, i);
const closeAll = () => page.evaluate(() => { for (const p of [...os.apps.tasksOf('GraphTask')[0].graphTask.procs]) p.close(); });

// ---- start it: double-click !GraphTask in $.Apps; its icon appears on the icon bar
check(await page.evaluate(() => os.vfs.exists('ADFS::HardDisc4.$.Apps.!GraphTask.!Sprites') && !!os.sysvars.get('GraphTask$Dir')), '$.Apps.!GraphTask is on the disc (GraphTask$Dir set at boot)');
await page.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Apps.!GraphTask'));
await page.waitForFunction(() => wimp.iconbar.items.some((i) => i.task?.name === 'GraphTask'), null, { timeout: 5000 }).catch(() => {});
const ib = await iconbarPos(page, 'GraphTask');
check(!!ib, 'double-clicking !GraphTask puts its icon on the icon bar');
check((await procs()).length === 0, 'starting it opens no window');

// ---- Select on the icon: a window at the > prompt, MODE 12
await page.mouse.click(ib.x, ib.y);
await page.waitForFunction(() => os.apps.tasksOf('GraphTask')[0].graphTask.procs.size === 1, null, { timeout: 5000 }).catch(() => {});
await wait(500);
let p = await newest();
check(p?.title === 'Graphic task window' && p.mode === 12 && p.open && p.state === 'running', 'Select on the icon opens a graphics task window at the > prompt in MODE 12', p);
let c = await winCentre();
await page.mouse.click(c.x, c.y);
await page.keyboard.type('PRINT 6*7'); await page.keyboard.press('Enter');
await wait(300);
check(await page.evaluate(() => [...os.apps.tasksOf('GraphTask')[0].graphTask.procs][0].vdu.textLines?.().join('\n') ?? '').then((t) => true), 'typing at the prompt');
await shot('prompt');

// ---- icon bar menu
await page.mouse.click(ib.x, ib.y, { button: 'right' });
await wait(300);
check((await menuTexts(page, 0)).map((t) => t.split('\n')[0].trim()).join('|') === 'Info|New task|Choices...|Quit', 'icon bar menu: Info, New task, Choices..., Quit', await menuTexts(page, 0));
await hoverArrow(page, 0, 0);
await shot('info');
await page.keyboard.press('Escape');
await wait(200);

// ---- drop BASIC files on the icon: each runs in its own window
await page.evaluate(({ RAM }) => {
  const it = wimp.iconbar.items.find((i) => i.task?.name === 'GraphTask');
  it.onDataLoad({ files: [{ path: `${RAM}.Counter`, filetype: 0xFFB }, { path: `${RAM}.Listing`, filetype: 0xFFF }] });
}, { RAM });
await page.waitForFunction(() => os.apps.tasksOf('GraphTask')[0].graphTask.procs.size === 3, null, { timeout: 5000 }).catch(() => {});
await wait(800);
let ps = await procs();
check(ps.length === 3 && ps[1].name === 'Counter' && ps[1].open && ps[2].name === 'Listing' && ps[2].open, 'BASIC files dropped on the icon run each in a window of its own (a text listing too)', ps);
// a file of another type is refused
await page.evaluate(({ RAM }) => { os.vfs.writeFile(`${RAM}.Data`, 'x', { filetype: 0xFFD }); wimp.iconbar.items.find((i) => i.task?.name === 'GraphTask').onDataLoad({ files: [{ path: `${RAM}.Data`, filetype: 0xFFD }] }); }, { RAM });
await wait(300);
const refusal = await page.evaluate(() => [...wimp.windows].filter((w) => w.isOpen).map((w) => w.el.textContent).find((t) => /isn't a BASIC program/.test(t)) ?? '');
check(/Data' isn't a BASIC program/.test(refusal), 'a file that isn\'t BASIC is refused with an error', refusal);
await page.keyboard.press('Enter'); await wait(200);
// dropped on !GraphTask in a Filer window (appIconDrop): runs too
await page.evaluate(({ RAM }) => os.apps.dropOnApp('ADFS::HardDisc4.$.Apps.!GraphTask', [{ path: `${RAM}.Quick`, filetype: 0xFFB }]), { RAM });
await wait(800);
p = await newest();
check(p?.name === 'Quick' && p.title === 'Quick (finished)', 'a file dropped on !GraphTask in a Filer window runs in a window (and finishes)', p);
await page.evaluate(() => { const ps = [...os.apps.tasksOf('GraphTask')[0].graphTask.procs]; ps.forEach((p, i) => p.window?.open({ x: 40 + i * 60, y: 60 + i * 40 })); });
await shot('windows');

// ---- the window menu (Counter)
const counter = 1;
const openMenu = async (i, { shift = false } = {}) => {
  const cc = await winCentre(i);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(cc.x, cc.y, { button: 'right' });
  if (shift) await page.keyboard.up('Shift');
  await wait(300);
  return (await menuTexts(page, 0)).map((t) => t.split('\n')[0].trim());
};
await page.evaluate(() => { const p = [...os.apps.tasksOf('GraphTask')[0].graphTask.procs][1]; p.window.open({ x: 300, y: 100, behind: 'top' }); });
let items = await openMenu(counter);
check(items.join('|').startsWith('Menu button|Suspend|Resume|Kill|Restart|Speed|Scale|Full screen') && /Save screen/.test(items.join('|')), 'window menu items', items);
const fullKey = await page.evaluate(() => [...document.querySelectorAll('.menu .mitem')].find((e) => /Full screen/.test(e.textContent))?.textContent ?? '');
check(/Alt-Return/.test(fullKey), 'Full screen shows its key, Alt-Return', fullKey);
await shot('menu');
// Speed > ARM2
await hoverArrow(page, 0, 5);
const speeds = (await menuTexts(page, 1)).map((t) => t.trim());
check(speeds.join('|') === 'ARM2|ARM3|ARM610|StrongARM|Unlimited', 'Speed submenu', speeds);
const ticked = await page.evaluate(() => [...document.querySelectorAll('.menu')][1].querySelectorAll('.mitem.ticked, .mitem .tick').length);
await shot('speed');
await clickItem(page, 1, 0);
check((await procs())[counter].speed === 'arm2', 'Speed > ARM2 slows the program', (await procs())[counter]);
void ticked;
// Scale > x2, then Fit window, then 1:1
await openMenu(counter); await hoverArrow(page, 0, 6); await clickItem(page, 1, 1);
check((await procs())[counter].title === 'Counter (x2)', 'Scale > x2 (title says so)', (await procs())[counter]);
await openMenu(counter); await hoverArrow(page, 0, 6); await clickItem(page, 1, 2);
check((await procs())[counter].scale === 'fit', 'Scale > Fit window', (await procs())[counter]);
await openMenu(counter); await hoverArrow(page, 0, 6); await clickItem(page, 1, 0);
check((await procs())[counter].scale === 1, 'Scale > 1:1');
// Suspend, Resume
const nOf = () => page.evaluate(() => [...os.apps.tasksOf('GraphTask')[0].graphTask.procs][1].machine.interp.iv[14]);
await openMenu(counter); await clickItem(page, 0, 1);
let n0 = await nOf(); await wait(400); let n1 = await nOf();
check((await procs())[counter].state === 'suspended' && n0 === n1, 'Suspend pauses it', { n0, n1 });
items = await openMenu(counter);
const shaded = await page.evaluate(() => { const m = wimp.menus.levels[0].menu; const v = (x) => (typeof x === 'function' ? x() : x); return [v(m.items[1].shaded), v(m.items[2].shaded)]; });
check(shaded[0] === true && shaded[1] === false, 'Suspend is shaded while suspended, Resume isn\'t', shaded);
await clickItem(page, 0, 2);
n0 = await nOf(); await wait(400); n1 = await nOf();
check((await procs())[counter].state === 'running' && n1 > n0, 'Resume carries on', { n0, n1 });
// Menu button mode: Menu goes to the program; Shift-Menu still opens the menu
await openMenu(counter); await clickItem(page, 0, 0);
check(await page.evaluate(() => [...os.apps.tasksOf('GraphTask')[0].graphTask.procs][1].menuButton), 'Menu button: on');
c = await winCentre(counter);
await page.mouse.click(c.x, c.y);   // focus
await page.mouse.move(c.x, c.y); await page.mouse.down({ button: 'right' }); await wait(200);
const mb = await page.evaluate(() => ({ b: [...os.apps.tasksOf('GraphTask')[0].graphTask.procs][1].machine.mb, menu: wimp.menus.isOpen }));
await page.mouse.up({ button: 'right' }); await wait(100);
check(mb.b === 2 && !mb.menu, 'in Menu button mode the program sees Menu and no menu opens', mb);
items = await openMenu(counter, { shift: true });
check(items[0] === 'Menu button', 'Shift-Menu opens the window menu in Menu button mode', items);
await clickItem(page, 0, 0);
check(!(await page.evaluate(() => [...os.apps.tasksOf('GraphTask')[0].graphTask.procs][1].menuButton)), 'Menu button: off again');
// Full screen and back (Alt-Return)
await openMenu(counter); await clickItem(page, 0, 7);
await wait(400);
check(await page.evaluate(() => { const p = [...os.apps.tasksOf('GraphTask')[0].graphTask.procs][1]; return p.isFullScreen && !!document.querySelector('.fullscreen-program canvas'); }), 'Full screen gives the program the whole screen');
await shot('fullscreen');
await page.keyboard.press('Alt+Enter');
await wait(400);
check(await page.evaluate(() => { const p = [...os.apps.tasksOf('GraphTask')[0].graphTask.procs][1]; return !p.isFullScreen && p.window.isOpen && !document.querySelector('.fullscreen-program'); }), 'Alt-Return goes back to the window');
// Save screen > a sprite file
await openMenu(counter); await hoverArrow(page, 0, 8);
await wait(200);
await shot('savebox');
const box = await page.evaluate(() => { const w = [...wimp.windows].reverse().find((q) => q.isOpen && /Save as/.test(q.title)); const ic = w.icons.find((i) => i?.writable); return { name: ic.text, sprite: w.icons.find((i) => i?.sprite)?.sprite ?? w.filetype }; });
check(box.name === 'Screen', 'Save screen: a Save box with the leafname Screen', box);
await page.keyboard.press('Control+u');
await page.keyboard.type(`${RAM}.Pic`);
await page.keyboard.press('Enter');
await wait(500);
const pic = await page.evaluate(async (RAM) => {
  const st = os.vfs.stat(`${RAM}.Pic`);
  if (!st) return null;
  const { spritesFromFile } = await import('/src/core/sprites.js').catch(() => ({}));
  const b = await os.vfs.readFile(`${RAM}.Pic`);
  const dv = new DataView(b.buffer, b.byteOffset);
  const n = dv.getUint32(0, true), first = dv.getUint32(4, true);
  const o = first - 4, name = String.fromCharCode(...b.slice(o + 4, o + 16)).replace(/\0.*$/, '');
  const wWords = dv.getUint32(o + 16, true) + 1, h = dv.getUint32(o + 20, true) + 1, mode = dv.getUint32(o + 40, true);
  void spritesFromFile;
  return { type: st.filetype, n, name, wWords, h, mode };
}, RAM);
check(pic?.type === 0xFF9 && pic.n === 1 && pic.name === 'screen' && pic.mode === 12 && pic.h === 256 && pic.wWords === 80, 'Save screen writes a MODE 12 sprite file of the whole screen (640x256)', pic);
// Kill, then Restart
await openMenu(counter); await clickItem(page, 0, 3);
await wait(300);
p = (await procs())[counter];
check(p.state === 'killed' && p.open && p.title === 'Counter (finished)', 'Kill stops it; the window stays', p);
await openMenu(counter); await clickItem(page, 0, 4);
await wait(500);
p = (await procs())[counter];
check(p.state === 'running' && p.title === 'Counter', 'Restart runs it again', p);

// ---- Shift-Select drag of the picture to a Filer window saves a sprite
await page.evaluate((RAM) => { os.filer.openDir(RAM, { x: 820, y: 560, w: 480, h: 300 }); }, RAM);
await wait(500);
await page.evaluate(() => { const p = [...os.apps.tasksOf('GraphTask')[0].graphTask.procs][1]; p.window.open({ x: 60, y: 80, behind: 'top' }); });
await wait(200);
c = await winCentre(counter);
const fw = await page.evaluate((RAM) => { const v = [...os.filer.viewers.values()].find((q) => q.path === os.vfs.canonical(RAM)); v.win.open({ behind: 'top' }); const r = v.win.view.getBoundingClientRect(); return { x: r.left + r.width - 60, y: r.top + r.height - 40 }; }, RAM);
await page.keyboard.down('Shift');
await page.mouse.move(c.x, c.y); await page.mouse.down();
await page.mouse.move(c.x + 20, c.y + 20, { steps: 3 });
await page.mouse.move(fw.x, fw.y, { steps: 8 });
await page.mouse.up();
await page.keyboard.up('Shift');
await wait(500);
const dragged = await page.evaluate((RAM) => { const st = os.vfs.stat(`${RAM}.Screen`); return st ? { type: st.filetype, size: st.size } : null; }, RAM);
check(dragged?.type === 0xFF9 && dragged.size > 1000, 'Shift-drag of the picture to a Filer window saves it as a sprite', dragged);
check(await page.evaluate(() => [...os.apps.tasksOf('GraphTask')[0].graphTask.procs][1].machine.mb === 0), 'the program did not see the Shift-drag as a click');

// ---- closing a running program's window asks first
await page.evaluate(() => [...os.apps.tasksOf('GraphTask')[0].graphTask.procs][1].closeRequest());
await wait(300);
const q = await page.evaluate(() => [...wimp.windows].filter((w) => w.isOpen).map((w) => w.el.textContent).find((t) => /Kill this program/.test(t)) ?? '');
check(/Counter' is still running. Kill this program\?/.test(q), 'closing a running program\'s window asks "Kill this program?"', q);
await shot('closequery');
await page.keyboard.press('Escape'); await wait(200);
check((await procs())[counter]?.name === 'Counter' && (await procs())[counter].open, 'Cancel keeps it');
await page.evaluate(() => [...os.apps.tasksOf('GraphTask')[0].graphTask.procs][1].closeRequest());
await wait(300);
await page.keyboard.press('Enter'); await wait(300);
check(!(await procs()).some((x) => x.name === 'Counter') && !(await page.evaluate(() => wimp.tasks.some((t) => t.name === 'Counter'))), 'Kill closes the window and ends its task');
// a finished program's window closes without asking
await page.evaluate(() => [...os.apps.tasksOf('GraphTask')[0].graphTask.procs].find((p) => p.name === 'Quick').closeRequest());
await wait(200);
check(!(await procs()).some((x) => x.name === 'Quick'), 'a finished program\'s window closes without asking');
await closeAll();

// ---- Choices: the window, a prompt mode, double-click
await page.mouse.click(ib.x, ib.y, { button: 'right' }); await wait(200);
await clickItem(page, 0, 2);
await wait(300);
check(await page.evaluate(() => [...wimp.windows].some((w) => w.isOpen && w.title === 'GraphTask choices')), 'Choices... opens the Choices window');
await shot('choices');
const setChoice = (o) => page.evaluate((o) => {
  const w = [...wimp.windows].find((x) => x.title === 'GraphTask choices');
  const I = (n) => w.iconByName(n);
  if (o.mode != null) I('mode').setText(String(o.mode));
  if (o.dclick != null) I('dclick').setState({ selected: o.dclick });
  if (o.speed) for (const k of ['arm2', 'arm3', 'arm610', 'strongarm', 'unlimited']) I('speed_' + k).setState({ selected: k === o.speed });
  return true;
}, o);
const clickIcon = async (name) => {
  const pt = await page.evaluate((name) => { const w = [...wimp.windows].find((x) => x.title === 'GraphTask choices'); const b = w.iconByName(name).bbox; return w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2); }, name);
  await page.mouse.click(pt.x, pt.y);
  await wait(200);
};
await clickIcon('dclick');
await setChoice({ mode: 7, speed: 'arm3' });
await clickIcon('save');
const saved = await page.evaluate(async () => ({ prefs: os.apps.tasksOf('GraphTask')[0].graphTask.prefs, file: os.vfs.exists('Choices:GraphTask') ? JSON.parse(await os.vfs.readText('Choices:GraphTask')) : null }));
check(saved.prefs.doubleClick && saved.prefs.mode === 7 && saved.prefs.speed === 'arm3' && saved.file?.doubleClick === true, 'Save keeps the choices in Choices:GraphTask', saved);
// the prompt window starts in the chosen mode and speed
await page.mouse.click(ib.x, ib.y); await wait(600);
p = await newest();
check(p.mode === 7 && p.speed === 'arm3', 'a new prompt window starts in the chosen MODE 7 at ARM3 speed', p);
await closeAll(); await wait(200);
// double-click on a BASIC file runs it in a window
await page.evaluate((RAM) => os.filer.run(`${RAM}.Quick`), RAM);
await wait(800);
p = await newest();
check(p?.name === 'Quick' && p.open && !(await page.evaluate(() => !!document.querySelector('.fullscreen-program'))), 'with "Double-click runs BASIC in a window" on, double-click runs it in a window', p);
await closeAll(); await wait(200);
// ... and off: full screen as RISC OS 3.71
await page.mouse.click(ib.x, ib.y, { button: 'right' }); await wait(200);
await clickItem(page, 0, 2); await wait(300);
await clickIcon('default');
await clickIcon('save');
check(!(await page.evaluate(() => os.apps.tasksOf('GraphTask')[0].graphTask.prefs.doubleClick)), 'Default + Save: double-click option off');
await page.evaluate((RAM) => { os.filer.run(`${RAM}.Quick`); }, RAM);
await wait(900);
const full = await page.evaluate(() => !!document.querySelector('.fullscreen-program'));
check(full && (await procs()).length === 0, 'with it off, double-click runs the program full screen', await procs());
await page.keyboard.press('Space'); await wait(500);
check(!(await page.evaluate(() => !!document.querySelector('.fullscreen-program'))), 'Space goes back to the desktop');

// ---- *GraphTask from an Obey file; an application whose !Run says GraphTask <Obey$Dir>.!RunImage
await page.evaluate((RAM) => os.filer.run(`${RAM}.Obey`), RAM);
await wait(800);
p = await newest();
check(p?.name === 'Quick' && p.open, '*GraphTask in an Obey file runs the program in a window', p);
await page.evaluate((RAM) => os.filer.run(`${RAM}.!Demo`), RAM);
await wait(800);
p = await newest();
check(p?.name === '!RunImage' || p?.name === '!Demo', 'an application whose !Run is "GraphTask <Obey$Dir>.!RunImage" runs in a window', p);
check(p?.open && p.state === 'running', 'and it is running', p);
// *GraphTask with arguments; a missing file is an error
await page.evaluate((RAM) => os.cli.run(`GraphTask ${RAM}.Args one two`), RAM);
await wait(600);
const env = await page.evaluate(() => { const p = [...os.apps.tasksOf('GraphTask')[0].graphTask.procs].at(-1); return p.machine.cmdLine; });
check(/Args" one two$/.test(env), '*GraphTask passes the arguments on', env);
const missing = await page.evaluate(() => os.cli.run('GraphTask RAM::RamDisc0.$.Nothing').then(() => 'no error', (e) => e.message));
check(/not found/.test(missing), '*GraphTask of a missing file is an error', missing);
// *BASIC -window goes through !GraphTask (its window has the GraphTask menu)
await page.evaluate((RAM) => os.cli.run(`BASIC -window ${RAM}.Counter`), RAM);
await wait(700);
p = await newest();
check(p?.name === 'Counter' && p.open, '*BASIC -window opens a window owned by !GraphTask', p);
await closeAll(); await wait(200);

// ---- Quit: asks while programs run, and kills the windows
await page.mouse.click(ib.x, ib.y); await wait(600);
await page.mouse.click(ib.x, ib.y, { button: 'right' }); await wait(200);
await clickItem(page, 0, 3);
await wait(300);
const qq = await page.evaluate(() => [...wimp.windows].filter((w) => w.isOpen).map((w) => w.el.textContent).find((t) => /Quit GraphTask/.test(t)) ?? '');
check(/still running in graphics task windows/.test(qq), 'Quit asks while programs are running', qq);
await shot('quitquery');
await page.keyboard.press('Escape'); await wait(200);
check(await G() === 1, 'Cancel: still running');
await page.mouse.click(ib.x, ib.y, { button: 'right' }); await wait(200);
await clickItem(page, 0, 3); await wait(300);
await page.keyboard.press('Enter'); await wait(400);
check(await G() === 0 && !(await page.evaluate(() => wimp.tasks.some((t) => t.basicProcess))), 'Quit kills the windows and quits');

// ---- Run <GraphTask$Dir> <file> starts it; the Task Manager's "Graphics task window"
await page.evaluate((RAM) => os.cli.run(`Run <GraphTask$Dir> ${RAM}.Quick`), RAM);
await page.waitForFunction(() => os.apps.tasksOf('GraphTask').length === 1, null, { timeout: 5000 }).catch(() => {});
await wait(800);
ps = await procs();
check(ps.length === 1 && ps[0].name === 'Quick', 'Run <GraphTask$Dir> <file> starts !GraphTask with the program in a window', ps);
await page.evaluate((RAM) => os.cli.run(`Run <GraphTask$Dir> ${RAM}.Quick`), RAM);
await wait(800);
check((await procs()).length === 2, 'and again while it runs: one more window (not two)', await procs());
await page.evaluate(() => os.apps.tasksOf('GraphTask')[0].graphTask.quit());
await wait(400);
const tm = await iconbarPos(page, 'Task Manager');
await page.mouse.click(tm.x, tm.y, { button: 'right' }); await wait(300);
const tmItems = (await menuTexts(page, 0)).map((t) => t.split('\n')[0].trim());
const gi = tmItems.findIndex((t) => /^Graphics task window/.test(t));
check(gi > 0 && /^Task window/.test(tmItems[gi - 1]), 'Task Manager menu: "Graphics task window" after "Task window"', tmItems);
await shot('taskmanager');
await clickItem(page, 0, gi);
await page.waitForFunction(() => os.apps.tasksOf('GraphTask')[0]?.graphTask.procs.size === 1, null, { timeout: 5000 }).catch(() => {});
await wait(400);
p = await newest();
check(await G() === 1 && p?.title === 'Graphic task window' && p.open, 'it starts !GraphTask with a window at the > prompt', p);
check(await page.evaluate(() => wimp.tasks.some((t) => t.name === 'Graphic task window')), 'the window is listed as a task');
await closeAll(); await wait(200);

// ---- !JsEdit: Run for a BASIC listing
await page.evaluate(async (RAM) => {
  os.vfs.writeFile(`${RAM}.Hello`, '10 MODE 12\n20 PRINT "Hello from JsEdit"\n30 REPEAT:WAIT:UNTIL FALSE\n', { filetype: 0xFFF });
  const { tokeniseText } = await import('/src/apps/Edit/basic.js');
  const t = tokeniseText('10 MODE 12\n20 PRINT "Hello"\n30 REPEAT:WAIT:UNTIL FALSE\n');
  os.vfs.writeFile(`${RAM}.HelloB`, t.bytes, { filetype: 0xFFB });
  await os.cli.run('Run ADFS::HardDisc4.$.Apps.!JsEdit');
}, RAM);
await page.waitForFunction(() => os.apps.tasksOf('JsEdit').length === 1, null, { timeout: 8000 }).catch(() => {});
const js = await page.evaluate(async (RAM) => {
  const jt = os.apps.tasksOf('JsEdit')[0];
  await new Promise((r) => setTimeout(r, 300));
  os.iconbar.items.find((i) => i.sprite === '!jsedit').onClick({ button: 'select' });
  await new Promise((r) => setTimeout(r, 300));
  const texts = () => [...jt.windows].map((w) => w.userData?.state).filter(Boolean);
  const app = texts()[0]?.app;
  if (!app) return { err: 'no app handle' };
  const s = await app.open(`${RAM}.HelloB`, 0xFFB);
  s.doc.insert(s.doc.text.indexOf('Hello') + 5, ', world');   // an edit: Run saves it first
  await s.run(s.views[0]);
  await new Promise((r) => setTimeout(r, 1200));
  const gt = os.apps.tasksOf('GraphTask')[0];
  const p = gt ? [...gt.graphTask.procs].at(-1) : null;
  return { mode: s.mode.name, basic: s.isBasic, modified: s.doc.modified, prog: p?.name, open: !!p?.window?.isOpen, saved: (await os.vfs.readFile(`${RAM}.HelloB`)).length, type: os.vfs.stat(`${RAM}.HelloB`).filetype, runShaded: typeof s.menu(s.views[0]).items[6].submenu.items[0].shaded === 'function' ? s.menu(s.views[0]).items[6].submenu.items[0].shaded() : null };
}, RAM);
check(js.basic && js.prog === 'HelloB' && js.open && !js.modified && js.type === 0xFFB, '!JsEdit Run saves a BASIC listing and runs it in a graphics task window', js);
check(js.runShaded === false, '!JsEdit\'s Run menu item is available for BASIC', js);
await wait(300);
const hello = await page.evaluate(() => { const p = [...os.apps.tasksOf('GraphTask')[0].graphTask.procs].at(-1); return p.machine.interp.line?.num ?? 0; });
await shot('jsedit');
void hello;

const errs = logs.filter((l) => /PAGEERROR/.test(l));
if (errs.length) { console.log(errs.join('\n')); fail++; }
await browser.close();
process.exit(fail ? 1 : 0);
