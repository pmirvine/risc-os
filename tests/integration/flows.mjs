// Cross-application integration checks with real mouse / keyboard where a user would use them.
//   node tests/integration/flows.mjs [group ...]     (server on 8371; prints PASS / FAIL lines)
// Groups: dnd print help chars tw configure pinboard tasks shutdown  (default: all)
import path from 'path';
import { launch, BASE_URL, SHOTS } from '../core/pw.mjs';
import { filerItem, iconbarPos, menuItem, hoverArrow, clickItem } from '../edit/ui.mjs';

const want = process.argv.slice(2);
const on = (g) => !want.length || want.includes(g);
let fails = 0;
const check = (label, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra !== '' ? ' - ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); if (!ok) fails++; return ok; };

async function fresh(q = '') {
  const s = await launch({ width: 1280, height: 1024 });
  s.errors = [];
  s.page.on('pageerror', (e) => s.errors.push(e.message));
  s.page.on('response', (r) => { if (r.status() >= 400) s.errors.push(`HTTP ${r.status()} ${r.url()}`); });
  await s.page.goto(BASE_URL + '?fast=1' + q);
  await s.page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await s.page.waitForTimeout(400);
  return s;
}
const sleep = (page, ms) => page.waitForTimeout(ms);
const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, `int-${n}.png`) });
/** Drag with the real mouse from a to b. */
async function drag(page, a, b, { shift = false } = {}) {
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 8, a.y + 8, { steps: 3 });
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await sleep(page, 100);
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
  await sleep(page, 600);
}
/** Screen centre of a window's visible work area (window found by a predicate source). */
const winCentre = (page, pred) => page.evaluate((pred) => {
  const w = [...wimp.windows].reverse().find((q) => q.isOpen && (0, eval)(pred)(q));
  return w ? { x: w.x + Math.min(w.w, 300) / 2, y: w.y + Math.min(w.h, 300) / 2 } : null;
}, pred);
/** Screen centre of a save box's file icon. */
const saveIcon = (page) => page.evaluate(() => {
  const w = [...wimp.windows].reverse().find((q) => q.isOpen && /save/i.test(q.title ?? '') && q.icons?.[2]);
  if (!w) return null;
  const b = w.icons[2].bbox;
  return w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
});
const errorBox = (page) => page.evaluate(() => {
  const w = [...wimp.windows].reverse().find((q) => q.isOpen && /^(Message from|Error)/.test(q.title ?? ''));
  return w ? w.icons.map((i) => i?.text).filter(Boolean).join(' | ') : null;
});
const closeErrors = async (page) => { for (let i = 0; i < 3 && await errorBox(page); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(200); } };

// ------------------------------------------------------------------------------------------ drag & drop
if (on('dnd')) {
  const { browser, page, errors } = await fresh();
  // Filer -> Edit window
  await page.evaluate(() => os.apps.start('Edit'));
  await sleep(page, 600);
  await page.evaluate(() => os.wimp.iconbar.items.find((i) => i.task?.name === 'Edit').onClick({ button: 'select' }));
  await sleep(page, 600);
  const edit = await winCentre(page, "(w) => w.task?.name === 'Edit' && /untitled/i.test(w.title)");
  let p = await filerItem(page, 'ADFS::HardDisc4.$.Tutorials', 'ReadMe', { x: 700, y: 60, w: 500, h: 300 });
  await drag(page, p, edit);
  const editLen = await page.evaluate(async () => (await import('/src/apps/Edit/api.js')).currentEdit().states.map((s) => [s.views[0].win.title, s.doc.length]));
  check('Filer -> Edit: file inserted into the window', editLen.length === 1 && editLen[0][1] > 100, editLen);

  // Filer -> Draw window
  await page.evaluate(() => os.apps.start('Draw'));
  await sleep(page, 800);
  await page.evaluate(() => globalThis.__draw.newDiagram());
  await sleep(page, 600);
  const draw = await winCentre(page, "(w) => w.task?.name === 'Draw' && w.title?.includes('untitled')");
  p = await filerItem(page, 'ADFS::HardDisc4.$.Tutorials.DrawTutor', 'Sign', { x: 700, y: 60, w: 500, h: 300 });
  await drag(page, p, draw);
  let n = await page.evaluate(() => globalThis.__draw.diagrams.map((d) => d.objects.length));
  check('Filer -> Draw: Drawfile imported', n.some((x) => x > 0), n);

  // Filer -> Paint (icon bar): sprite file opens
  await page.evaluate(() => os.apps.start('Paint'));
  await sleep(page, 800);
  p = await filerItem(page, 'ADFS::HardDisc4.$.Tutorials.PaintTutor', 'Flower', { x: 700, y: 60, w: 500, h: 300 });
  const ibPaint = await iconbarPos(page, 'Paint');
  await drag(page, p, ibPaint);
  n = await page.evaluate(() => os.wimp.tasks.find((t) => t.name === 'Paint').paint.files.length);
  check('Filer -> Paint icon: sprite file opened', n === 1, n);

  // Paint sprite Save box -> Draw window (RAM transfer: sprite object inserted)
  const before = await page.evaluate(() => globalThis.__draw.diagrams.map((d) => d.objects.length));
  await page.evaluate(() => { const A = os.wimp.tasks.find((t) => t.name === 'Paint').paint; A.dialogs.saveSpriteBox(A.files[0].sprites[0]).openCentred(); });
  await sleep(page, 300);
  const drawWin = await page.evaluate(() => { const w = globalThis.__draw.diagrams.find((d) => d.filename === '' || !d.filename)?.views[0].win ?? globalThis.__draw.diagrams[0].views[0].win; w.open({ behind: 'top', x: 60, y: 80 }); return { x: w.x + 100, y: w.y + 100 }; });
  await page.evaluate(() => { const w = [...wimp.windows].reverse().find((q) => q.isOpen && /save/i.test(q.title ?? '')); w.open({ behind: 'top', x: 700, y: 500 }); });
  await drag(page, await saveIcon(page), drawWin);
  const after = await page.evaluate(() => globalThis.__draw.diagrams.map((d) => d.objects.map((o) => o.type)));
  check('Paint sprite -> Draw: sprite object added', after.some((objs, i) => objs.length > (before[i] ?? 0) && objs.includes('sprite')), after);
  check('Paint sprite -> Draw: save box closed', !(await saveIcon(page)));

  // Draw Save box -> Filer window (RAM disc)
  await page.evaluate(() => os.filer.openDir('RAM::RamDisc0.$', { x: 700, y: 400, w: 400, h: 200 }));
  await sleep(page, 300);
  const ram = await winCentre(page, "(w) => w._filerDir === 'RAM::RamDisc0.$'");
  // Edit's Save box (F3) -> Filer
  await page.evaluate(() => { const w = [...wimp.windows].find((q) => q.task?.name === 'Edit' && q.isOpen); w.bringToFront(); wimp.setCaret(w, null, -1, { x: 0, y: 0, h: 16 }); });
  await page.keyboard.press('F3');
  await sleep(page, 400);
  await page.evaluate(() => { const w = [...wimp.windows].reverse().find((q) => q.isOpen && /save/i.test(q.title ?? '')); w?.open({ behind: 'top', x: 200, y: 600 }); });
  const si = await saveIcon(page);
  check('Edit F3 opens a Save box', !!si);
  if (si) {
    await drag(page, si, ram);
    const ls = await page.evaluate(() => os.vfs.list('RAM::RamDisc0.$').map((f) => f.name + ',' + f.filetype.toString(16)));
    check('Edit Save box -> Filer: file written', ls.some((x) => /,fff$/.test(x)), ls);
  }
  // Edit Save box -> Draw window (text becomes a text object)
  await page.evaluate(() => { const w = [...wimp.windows].find((q) => q.task?.name === 'Edit' && q.isOpen); w.bringToFront(); wimp.setCaret(w, null, -1, { x: 0, y: 0, h: 16 }); });
  await page.keyboard.press('F3');
  await sleep(page, 400);
  const dw2 = await page.evaluate(() => { const w = globalThis.__draw.diagrams[0].views[0].win; w.open({ behind: 'top', x: 60, y: 80 }); return { x: w.x + 150, y: w.y + 150 }; });
  await page.evaluate(() => { const w = [...wimp.windows].reverse().find((q) => q.isOpen && /save/i.test(q.title ?? '')); w?.open({ behind: 'top', x: 700, y: 600 }); });
  const beforeT = await page.evaluate(() => globalThis.__draw.diagrams[0].objects.length);
  await drag(page, await saveIcon(page), dw2);
  const afterT = await page.evaluate(() => globalThis.__draw.diagrams[0].objects.map((o) => o.type));
  check('Edit text -> Draw: text area / text inserted', afterT.length > beforeT, afterT);
  // Draw's Save box (F3) -> RAM Filer window, then -> Edit's icon bar icon (a new Edit window gets the data)
  const focusDraw = () => page.evaluate(() => { const w = globalThis.__draw.diagrams[0].views[0].win; w.open({ behind: 'top', x: 60, y: 80 }); wimp.setCaret(w); });
  await focusDraw();
  await page.keyboard.press('F3');
  await sleep(page, 400);
  await page.evaluate(() => { const w = [...wimp.windows].reverse().find((q) => q.isOpen && /save/i.test(q.title ?? '')); w?.open({ behind: 'top', x: 200, y: 600 }); });
  const ram2 = await page.evaluate(() => { const w = [...wimp.windows].find((q) => q._filerDir === 'RAM::RamDisc0.$'); w.open({ behind: 'top', x: 700, y: 400, w: 400, h: 200 }); return { x: w.x + 300, y: w.y + 150 }; });
  const ds = await saveIcon(page);
  check('Draw F3 opens a Save box', !!ds);
  if (ds) {
    await drag(page, ds, ram2);
    const ls = await page.evaluate(() => os.vfs.list('RAM::RamDisc0.$').map((f) => f.name + ',' + f.filetype.toString(16)));
    check('Draw Save box -> Filer: Drawfile written', ls.some((x) => /,aff$/.test(x)), ls);
  }
  await focusDraw();
  await page.keyboard.press('F3');
  await sleep(page, 400);
  await page.evaluate(() => { const w = [...wimp.windows].reverse().find((q) => q.isOpen && /save/i.test(q.title ?? '')); w?.open({ behind: 'top', x: 200, y: 600 }); });
  const nEdit = await page.evaluate(async () => (await import('/src/apps/Edit/api.js')).currentEdit().states.length);
  await drag(page, await saveIcon(page), await iconbarPos(page, 'Edit'));
  const nEdit2 = await page.evaluate(async () => (await import('/src/apps/Edit/api.js')).currentEdit().states.map((s) => [s.filetype.toString(16), s.doc.length]));
  check('Draw Save box -> Edit icon: new Edit window with the data', nEdit2.length === nEdit + 1 && nEdit2.at(-1)[1] > 0, nEdit2);
  check('Draw Save box -> Edit icon: save box closed', !(await saveIcon(page)));
  // Paint's sprite file Save box -> Filer
  await page.evaluate(() => { const A = os.wimp.tasks.find((t) => t.name === 'Paint').paint; const b = A.dialogs.saveFileBox(A.files[0]); b.openCentred(); b.open({ behind: 'top', x: 200, y: 600 }); });
  await sleep(page, 300);
  await page.evaluate(() => { const w = [...wimp.windows].find((q) => q._filerDir === 'RAM::RamDisc0.$'); w.open({ behind: 'top' }); });
  await drag(page, await saveIcon(page), ram2);
  const ls3 = await page.evaluate(() => os.vfs.list('RAM::RamDisc0.$').map((f) => f.name + ',' + f.filetype.toString(16)));
  check('Paint Save box -> Filer: sprite file written', ls3.some((x) => /,ff9$/.test(x)), ls3);
  const eb = await errorBox(page);
  check('no error boxes after drags', !eb, eb ?? '');
  await shot(page, 'dnd');
  check('dnd: no page errors', !errors.length, errors);
  await browser.close();
}

// ------------------------------------------------------------------------------------------ printing
if (on('print')) {
  const { browser, page, errors } = await fresh();
  await page.evaluate(() => os.apps.start('Edit'));
  await sleep(page, 600);
  await page.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Tutorials.ReadMe'));
  await sleep(page, 1000);
  const printEdit = () => page.evaluate(async () => {
    const w = [...wimp.windows].find((q) => q.task?.name === 'Edit' && q.isOpen && /ReadMe/.test(q.title));
    w.bringToFront();
    wimp.setCaret(w, null, -1, { x: 0, y: 0, h: 16 });
  });
  await printEdit();
  let eb;
  // Menu > Misc > Print with no printer manager: the Edit error
  await page.evaluate(async () => {
    const E = await import('/src/apps/Edit/api.js');
    const app = E.currentEdit();
    const st = [...app.states ?? app.texts ?? []].find?.((s) => /ReadMe/.test(s.filename)) ?? null;
    (st ?? app.activeState ?? app.current)?.print?.();
  });
  await sleep(page, 300);
  eb = await errorBox(page);
  check('Edit print without !Printers: error', /Printers/.test(eb ?? ''), eb ?? '');
  await closeErrors(page);
  await page.evaluate(() => os.apps.start('Printers'));
  await sleep(page, 1200);
  check('!Printers running: os.printers.current', await page.evaluate(() => !!os.printers?.current), await page.evaluate(() => os.printers?.current?.name));
  const popup = page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null);
  await page.evaluate(async () => {
    const E = await import('/src/apps/Edit/api.js');
    const app = E.currentEdit();
    const st = [...app.states ?? app.texts ?? []].find?.((s) => /ReadMe/.test(s.filename)) ?? null;
    (st ?? app.activeState ?? app.current)?.print?.();
  });
  let pp = await popup;
  if (pp) { await pp.waitForLoadState().catch(() => {}); await sleep(page, 1500); }
  let body = pp ? await pp.evaluate(() => document.body.innerText).catch(() => '') : '';
  check('Edit print with !Printers: output page has the text', /Tutorials|tutorial/i.test(body), body.slice(0, 80));
  eb = await errorBox(page); check('Edit print: no error box', !eb, eb ?? '');
  await pp?.close().catch(() => {});

  // Paint: Print sprite
  await page.evaluate(() => os.filer.run('ADFS::HardDisc4.$.Tutorials.PaintTutor.Flower'));
  await sleep(page, 1500);
  const popup2 = page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null);
  await page.evaluate(() => { const A = os.wimp.tasks.find((t) => t.name === 'Paint').paint; A.dialogs.print(A.files[0].sprites[0]); });
  pp = await popup2;
  if (pp) { await pp.waitForLoadState().catch(() => {}); await sleep(page, 1500); }
  const img = pp ? await pp.evaluate(() => { const i = document.querySelector('img'); return i ? { w: i.style.width, ok: i.src.startsWith('data:image/png') } : null; }).catch(() => null) : null;
  check('Paint print sprite: output page has the sprite at true size', img?.ok && /in$/.test(img.w), img);
  eb = await errorBox(page); check('Paint print: no error box', !eb, eb ?? '');
  check('print: no page errors', !errors.length, errors);
  await browser.close();
}

// ------------------------------------------------------------------------------------------ help, task manager, quitting
const APPS = ['Alarm', 'ARPlayer', 'Blocks', 'Bookworm', 'ChangeFSI', 'Chars', 'Clock', 'CloseUp', 'Configure', 'Draw', 'Edit',
  'Flasher', 'Maestro', 'MemNow', 'Meteors', 'MineHunt', 'Paint', 'Patience', 'PhotoView', '!Player', 'Printers', 'Puzzle',
  'SciCalc', 'SlideShow', 'Squash', 'TaskWindow'];
if (on('help') || on('tasks')) {
  const { browser, page, errors } = await fresh();
  await page.evaluate(() => os.apps.start('Help'));
  await sleep(page, 600);
  const started = [];
  for (const a of APPS) {
    const r = await page.evaluate(async (a) => {
      try { const t = await os.apps.start(a); return t?.name ?? null; } catch (e) { return 'ERR ' + e.message; }
    }, a);
    await sleep(page, a === 'SlideShow' ? 1500 : 500);
    if (a === 'SlideShow') { await page.keyboard.press('Escape'); await sleep(page, 800); }
    if (a === 'TaskWindow') await page.keyboard.press('Escape');
    started.push([a, r]);
  }
  check('every app starts', started.every(([, r]) => r && !/^ERR/.test(r)), started.filter(([, r]) => !r || /^ERR/.test(r)));
  await closeErrors(page);
  // help on each icon bar icon and each open window of each app
  const noHelp = await page.evaluate(() => {
    const out = [];
    for (const it of wimp.iconbar.items) {
      const x = wimp.iconbar.iconScreenX(it), y = wimp.height - 30;
      const h = wimp.helpAt(x, y);
      if (!h) out.push('iconbar ' + (it.task?.name ?? it.sprite));
    }
    for (const w of wimp.windows) {
      if (!w.isOpen || !w.task || w.task.kind !== 'app' || w.task.name === 'Help') continue;
      if (/^(Message from|Error)/.test(w.title ?? '')) continue;
      const r = { x: w.x + Math.min(20, w.w / 2), y: w.y + Math.min(20, w.h / 2) };
      const hit = wimp.hitTest(r.x, r.y);
      if (hit?.window !== w) continue;
      if (!wimp.helpAt(r.x, r.y)) out.push(`window ${w.task.name}: ${w.title}`);
    }
    return out;
  });
  // the originals of these give no interactive help (no Message_HelpRequest handler / no help tokens in 3.71)
  const NOHELP = /^(iconbar (ADFS Filer|RAMFS Filer|Resource Filer|Display Manager|Blocks|ChangeFSI|MemNow|Patience)|window (Meteors|Blocks|MemNow|Patience|ChangeFSI):)/;
  check('interactive help over every icon bar icon and app window', !noHelp.filter((x) => !NOHELP.test(x)).length, noHelp.filter((x) => !NOHELP.test(x)));
  // the Help window shows it: pointer over Draw's icon
  const ib = await iconbarPos(page, 'Draw');
  await page.mouse.move(ib.x, ib.y);
  await sleep(page, 700);
  const htext = await page.evaluate(() => { const t = os.apps.tasksOf('Help')[0]; const w = [...t.windows].find((q) => q.title === 'Interactive help'); return w?.icons.filter(Boolean).map((i) => i.text).join(' '); });
  check('!Help window shows help for the icon under the pointer', /Draw/i.test(htext ?? ''), htext);

  // Task Manager lists every running app
  await page.evaluate(() => os.switcher.toggleDisplay());
  await sleep(page, 400);
  const listed = await page.evaluate(() => os.switcher.rows.filter((r) => r.task).map((r) => r.label));
  const running = await page.evaluate(() => wimp.tasks.filter((t) => t.kind === 'app').map((t) => t.name));
  check('Task Manager lists every running application', running.every((n) => listed.includes(n)), { running, listed });
  // Quit each through the Task Manager's menu (the Task ▸ Quit entry), with the real mouse for the first one
  const row = await page.evaluate(() => { const r = os.switcher.rows.find((q) => q.task?.name === 'Puzzle'); const w = os.switcher.win; w.open({ behind: 'top', scrollY: Math.max(w.extent.y0, r.y0 - 40) }); return w.workToScreen(40, (r.y0 + r.y1) / 2); });
  await page.mouse.click(row.x, row.y, { button: 'middle' });
  await sleep(page, 300);
  await hoverArrow(page, 0, 2);
  await clickItem(page, 1, 0);
  await sleep(page, 400);
  check('Task Manager menu > Task Puzzle > Quit', await page.evaluate(() => !os.apps.tasksOf('Puzzle').length));
  const left = await page.evaluate(async () => {
    for (const t of wimp.tasks.filter((t) => t.kind === 'app' && t.name !== 'Help')) await os.switcher.quitTask(t);
    await new Promise((r) => setTimeout(r, 1500));
    return wimp.tasks.filter((t) => t.kind === 'app').map((t) => t.name);
  });
  // apps with unsaved data object (a query box); none here, so everything but Help should be gone
  check('Task Manager Quit ends every task', left.length === 1 && left[0] === 'Help', left);
  const stray = await page.evaluate(() => [...wimp.windows].filter((w) => w.isOpen && w.task && !w.task.alive).map((w) => w.title));
  check('no windows left from quit tasks', !stray.length, stray);
  await closeErrors(page);
  check('help/tasks: no page errors', !errors.length, errors);
  await shot(page, 'tasks');
  await browser.close();
}

// ------------------------------------------------------------------------------------------ Chars -> Edit
if (on('chars')) {
  const { browser, page, errors } = await fresh();
  await page.evaluate(async () => { await os.apps.start('Edit'); await os.apps.start('Chars'); });
  await sleep(page, 800);
  await page.evaluate(async () => { const E = await import('/src/apps/Edit/api.js'); const s = await E.currentEdit().open('', 0xFFF); s.views[0].win.open({ x: 100, y: 500, w: 500, h: 300, behind: 'top' }); s.views[0].setCaret(0, { take: true }); });
  await sleep(page, 300);
  const w = await page.evaluate(() => { const x = [...os.apps.tasksOf('Chars')[0].windows][0]; x.open({ behind: 'top', x: 100, y: 80 }); return { x: x.x, y: x.y }; });
  const cell = (ch) => ({ x: w.x + 8 + (ch % 32) * 12 + 4, y: w.y + 8 + Math.floor(ch / 32) * 22 + 8 });
  for (const ch of [0x48, 0x69, 0x21, 0xa9]) { const p = cell(ch); await page.mouse.click(p.x, p.y); }
  await page.keyboard.type('xy');
  const txt = await page.evaluate(async () => (await import('/src/apps/Edit/api.js')).currentEdit().states[0].doc.text);
  check('Chars clicks type into Edit (caret stays in Edit)', txt === 'Hi!©xy', JSON.stringify(txt));
  check('chars: no page errors', !errors.length, errors);
  await browser.close();
}

// ------------------------------------------------------------------------------------------ TaskWindow
if (on('tw')) {
  const { browser, page, errors } = await fresh();
  await page.keyboard.press('Control+F12');
  await sleep(page, 1500);
  await page.keyboard.type('echo hello<Sys$Year>');
  await page.keyboard.press('Enter');
  await sleep(page, 800);
  await page.keyboard.type('basic');
  await page.keyboard.press('Enter');
  await sleep(page, 800);
  await page.keyboard.type('PRINT 6*7');
  await page.keyboard.press('Enter');
  await sleep(page, 800);
  const txt = await page.evaluate(async () => (await import('/src/apps/Edit/api.js')).currentEdit()?.states.map((s) => s.doc.text).join('\n---\n'));
  check('TaskWindow runs *echo with GSTrans', new RegExp('hello' + new Date().getFullYear()).test(txt ?? ''), (txt ?? '').slice(0, 200));
  check('TaskWindow runs BASIC', /\b42\b/.test(txt ?? ''), (txt ?? '').slice(-200));
  check('tw: no page errors', !errors.length, errors);
  await browser.close();
}

// ------------------------------------------------------------------------------------------ Configure live
if (on('configure')) {
  const { browser, page, errors } = await fresh();
  await page.evaluate(() => os.apps.start('Configure'));
  await sleep(page, 800);
  const before = await page.evaluate(() => [os.config.values?.Buttons ?? null, os.input.config.rightIsAdjust, getComputedStyle(document.querySelector('.desktop, body')).backgroundImage.slice(0, 60)]);
  await page.evaluate(() => os.cli.run('Configure Buttons Adjust'));
  const mid = await page.evaluate(() => os.input.config.rightIsAdjust);
  check('*Configure Buttons Adjust applies at once', mid === true, { before, mid });
  await page.evaluate(() => os.cli.run('Configure Buttons Menu'));
  // !Configure Screen plug-in: pick texture 7 and Set (as tests/acc/act-configure-func.mjs) -> backdrop changes live
  const tb = await page.evaluate(() => os.pinboard.backdrop?.path ?? null);
  const opened = await page.evaluate(async () => {
    const t = os.apps.tasksOf('Configure')[0];
    const main = [...t.windows].find((x) => x.isOpen);
    const ic = main.icons.find((i) => /screen/i.test(i?.text ?? '') || /screen/i.test(i?.spriteName ?? ''));
    if (!ic) return false;
    const b = ic.bbox; return main.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
  });
  if (opened) { await page.mouse.click(opened.x, opened.y); await sleep(page, 800); }
  const click = (win, i) => page.evaluate(([win, i]) => {
    const t = os.apps.tasksOf('Configure')[0];
    const w = [...t.windows].find((x) => x.isOpen && x.title === win);
    if (!w) return null;
    const b = w.icons[i].bbox; return w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
  }, [win, i]).then((p) => p && page.mouse.click(p.x, p.y));
  await click('Screen', 29); await click('Screen', 35);
  await sleep(page, 800);
  const ta = await page.evaluate(() => os.pinboard.backdrop?.path ?? null);
  check('!Configure Screen texture Set changes the backdrop live', ta && ta !== tb, { tb, ta });
  // Font change through *Configure applies at once
  await page.evaluate(() => os.config.set('WimpFont', 'Trinity.Medium'));
  const f = await page.evaluate(() => os.fonts.css);
  check('desktop font change applies live', /Trinity/i.test(f), f);
  check('configure: no page errors', !errors.length, errors);
  await browser.close();
}

// ------------------------------------------------------------------------------------------ Pinboard persistence
if (on('pinboard')) {
  let s = await fresh();
  // drag a file from a Filer window to the backdrop
  const p = await filerItem(s.page, 'ADFS::HardDisc4.$.Tutorials.DrawTutor', 'Map', { x: 700, y: 60, w: 500, h: 300 });
  await drag(s.page, p, { x: 300, y: 300 });
  const pins = await s.page.evaluate(() => os.pinboard.pins.map((q) => q.path));
  check('drag from Filer to the backdrop pins the file', pins.some((x) => /Map$/.test(x)), pins);
  await s.page.reload();
  await s.page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  await sleep(s.page, 500);
  const pins2 = await s.page.evaluate(() => os.pinboard.pins.map((q) => [q.path, Math.round(q.x), Math.round(q.y)]));
  check('pinned icon survives a reload', pins2.some(([x]) => /Map$/.test(x)), pins2);
  // double-click the pinned icon runs it (Draw opens the file)
  const at = await s.page.evaluate(() => { const q = os.pinboard.pins.find((q) => /Map$/.test(q.path)); const b = q.icon.bbox; return { x: (b.x0 + b.x1) / 2, y: b.y0 + 17 }; });
  await s.page.mouse.dblclick(at.x, at.y);
  await sleep(s.page, 1500);
  check('double-click on a pinned file opens it', await s.page.evaluate(() => os.apps.tasksOf('Draw').length === 1));
  await s.page.evaluate(() => os.pinboard.clear());
  check('pinboard: no page errors', !s.errors.length, s.errors);
  await s.browser.close();
}

// ------------------------------------------------------------------------------------------ Shutdown
if (on('shutdown')) {
  const { browser, page, errors } = await fresh();
  await page.evaluate(async () => { await os.apps.start('Edit'); await os.apps.start('Draw'); await os.apps.start('Clock'); });
  await sleep(page, 800);
  // Unsaved Edit text: Shutdown asks first
  await page.evaluate(async () => { const E = await import('/src/apps/Edit/api.js'); const st = await E.currentEdit().open('', 0xFFF); st.doc.setText('unsaved', { modified: true }); st.doc.setModified(true); });
  await page.keyboard.press('Control+Shift+F12');
  await sleep(page, 600);
  const q = await page.evaluate(() => [...wimp.windows].filter((w) => w.isOpen).map((w) => w.title));
  check('Shutdown with unsaved data: Edit objects (desktop still running)', await page.evaluate(() => os.apps.tasksOf('Edit').length === 1), q);
  // the Edit query: Discard (the default button) restarts the closedown sequence
  await page.keyboard.press('Enter');
  await sleep(page, 800);
  const after = await page.evaluate(() => ({ apps: wimp.tasks.filter((t) => t.kind === 'app').map((t) => t.name), wins: [...wimp.windows].filter((w) => w.isOpen && !/iconbar|pinboard/.test(w.el?.className)).map((w) => w.task?.name) }));
  check('Shutdown quits every application and shows the restart box', !after.apps.length && after.wins.join() === 'Task Manager', after);
  const nav = page.waitForNavigation({ timeout: 8000 }).then(() => true, () => false);
  await page.keyboard.press('Enter');
  check('Restart reloads the desktop', await nav);
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
  check('shutdown: no page errors', !errors.length, errors);
  await browser.close();
}

// ------------------------------------------------------------------------------------------ disc / CMOS reset
if (on('reset')) {
  const s = await fresh();
  const { page } = s;
  const write = () => page.evaluate(() => { os.vfs.writeFile('ADFS::HardDisc4.$.QAResetTest', 'x', { filetype: 0xFFF }); os.config.set('Zoom', 1); os.config.values.qaMark = 1; os.config.save(); });
  const state = () => page.evaluate(() => ({ file: os.vfs.exists('ADFS::HardDisc4.$.QAResetTest'), cmos: !!os.config.values.qaMark }));
  const reboot = async (fn) => { const nav = page.waitForNavigation({ timeout: 10000 }).catch(() => null); await fn(); await nav; await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 }); await sleep(page, 800); await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 }); await sleep(page, 300); };
  await write();
  await sleep(page, 300);
  await reboot(() => page.reload());
  check('files and CMOS persist across a reload', JSON.stringify(await state()) === '{"file":true,"cmos":true}', await state());
  await reboot(() => page.evaluate(() => os.cli.run('ResetCMOS')));
  check('*ResetCMOS resets the configuration, keeps files', JSON.stringify(await state()) === '{"file":true,"cmos":false}', await state());
  await write(); await sleep(page, 300);
  await reboot(() => page.evaluate(() => os.cli.run('ResetDisc')));
  check('*ResetDisc restores the disc as supplied', JSON.stringify(await state()) === '{"file":false,"cmos":true}', await state());
  await write(); await sleep(page, 300);
  // Delete held down during start-up
  await page.addInitScript(() => { if (!sessionStorage.getItem('qaDel')) { sessionStorage.setItem('qaDel', '1'); document.addEventListener('DOMContentLoaded', () => dispatchEvent(new KeyboardEvent('keydown', { code: 'Delete', key: 'Delete' }))); } });
  await reboot(() => page.reload());
  check('Delete held at start-up resets disc and CMOS', JSON.stringify(await state()) === '{"file":false,"cmos":false}', await state());
  check('reset: no page errors', !s.errors.length, s.errors);
  await s.browser.close();
}

// ------------------------------------------------------------------------------------------ F12 BASIC system variables
if (on('basic')) {
  const s = await fresh();
  const { page } = s;
  await page.keyboard.press('F12');
  await sleep(page, 300);
  await page.keyboard.type('BASIC');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !!window.basic, null, { timeout: 10000 });
  await sleep(page, 500);
  const r = await page.evaluate(() => { try { return [window.basic.getSysVar('Missing$Var') ?? null, window.basic.getSysVar('boot$osversion'), window.basic.getSysVar('Wimp$Ver*')]; } catch (e) { return 'ERR ' + e.message; } });
  check('full-screen BASIC reads missing / wildcard / case-insensitive system variables', JSON.stringify(r) === '[null,"371","369"]', r);
  await page.keyboard.type('QUIT');
  await page.keyboard.press('Enter');
  check('basic: no page errors', !s.errors.length, s.errors);
  await s.browser.close();
}

if (fails) console.log(`${fails} FAILED`);
process.exit(fails ? 1 : 0);
