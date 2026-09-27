// The Task Manager's memory display on the machine's memory model (src/core/memory.js), in a real browser:
// node tests/core/test-taskmanager.mjs   (screenshots tm-256mb.png, tm-4mb.png, tm-configure-ram.png in SHOTS)
import path from 'path';
import { launch, BASE_URL, SHOTS } from './pw.mjs';

const { browser, page, logs } = await launch();
await page.goto(BASE_URL + '?fast=1');
await page.waitForFunction(() => window.os?.ready, null, { timeout: 15000 });
await page.waitForTimeout(500);
const out = [];
const ok = (name, cond, extra = '') => out.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`);

/** The Task display as the page shows it: rows (label, K, bar width), window and extent widths. */
const display = () => page.evaluate(() => {
  const w = os.switcher.win;
  const icons = w.icons.filter(Boolean);
  const rows = [];
  for (const r of os.switcher.rows) {
    const inRow = icons.filter((ic) => ic.bbox.y0 >= r.y0 && ic.bbox.y1 <= r.y1 + 1);
    const size = inRow.find((ic) => /^\d+K$/.test(ic.text ?? ''));
    const bar = inRow.find((ic) => !ic.text && ic.bbox.x0 === os.switcher._barX);
    rows.push({ label: r.label, k: size ? parseInt(size.text, 10) : null, bar: bar ? bar.bbox.x1 - bar.bbox.x0 : 0, barEnd: bar ? bar.bbox.x1 : 0, red: r.draggable });
  }
  return { rows, w: w.w, extW: w.extent.x1 - w.extent.x0, extX1: w.extent.x1, snap: os.memory.snapshot() };
});
const row = (d, label) => d.rows.find((r) => r.label === label);
const SYS = ['Screen memory', 'Cursor/System/Sound', 'System heap/stack', 'Module area', 'Font cache', 'System sprites', 'RAM disc', 'Applications (free)', 'Applications (used)', 'System workspace'];
const checkDisplay = (d, tag) => {
  const sum = SYS.reduce((n, l) => n + row(d, l).k, 0);
  ok(`${tag}: system rows add up to Total`, sum === row(d, 'Total').k, `${sum}K vs ${row(d, 'Total').k}K`);
  ok(`${tag}: Free is the model's free pool`, row(d, 'Free').k === d.snap.freeK, `${row(d, 'Free').k}K`);
  const barEnds = d.rows.map((r) => r.barEnd);
  ok(`${tag}: every bar inside the window's extent`, Math.max(...barEnds) <= d.extX1, `${Math.max(...barEnds)} <= ${d.extX1}`);
  ok(`${tag}: the Total bar is the longest`, row(d, 'Total').bar === Math.max(...d.rows.map((r) => r.bar)));
  ok(`${tag}: the window shows the whole width`, d.w === d.extW, `${d.w} / ${d.extW}`);
  ok(`${tag}: non-empty bars are at least a pixel`, d.rows.every((r) => !r.k || r.bar >= 1 || /Module tasks|Free in|Largest/.test(r.label) || r.k === 0));
};
const shot = (name) => page.screenshot({ path: path.join(SHOTS, name) });

try {
  // a couple of tasks, then the Task display at the default 256MB
  await page.evaluate(() => os.apps.start('Edit'));
  await page.evaluate(() => os.apps.start('Clock'));
  await page.waitForTimeout(600);
  await page.evaluate(() => os.switcher.toggleDisplay());
  await page.waitForTimeout(400);
  let d = await display();
  ok('256MB: Total is DRAM + VRAM', row(d, 'Total').k === 256 * 1024 + 2048, `${row(d, 'Total').k}K`);
  ok('256MB: the screen is the 2MB of VRAM', row(d, 'Screen memory').k === 2048 && !row(d, 'Screen memory').red);
  ok('256MB: tasks listed with their slots', row(d, 'Edit')?.k === 188, JSON.stringify(row(d, 'Edit')));
  ok('256MB: small slots still get a visible bar (24K: 3 pixels, as on 3.7)', row(d, 'Clock').bar >= 3, `${row(d, 'Clock').bar}px`);
  ok('256MB: the Total bar stays under 600 pixels', row(d, 'Total').bar < 600 && row(d, 'Total').bar > 500, `${row(d, 'Total').bar}px`);
  ok('256MB: Next and Free bars red (draggable)', row(d, 'Next').red && row(d, 'Free').red && row(d, 'RAM disc').red);
  checkDisplay(d, '256MB');
  await shot('tm-256mb.png');

  // !MemNow and Wimp_SlotSize read the same free pool
  const memnow = await page.evaluate(async () => {
    await os.apps.start('MemNow');
    await new Promise((r) => setTimeout(r, 900));
    const it = os.wimp.iconbar.items.find((i) => i.task?.name === 'MemNow');
    return { text: it?.icon?.text, freeK: os.memory.freeK };
  });
  ok('MemNow shows the free pool', memnow.text === String(memnow.freeK), JSON.stringify(memnow));

  // dragging the font cache bar grows it, and Free goes down by as much
  const drag = await page.evaluate(() => {
    const before = os.memory.snapshot();
    const r = os.switcher.rows.find((q) => q.label === 'Font cache');
    const p = os.switcher.win.workToScreen(os.switcher._barX + 150, (r.y0 + r.y1) / 2);
    return { p, before: { fc: before.sys.fontcache, free: before.freeK } };
  });
  await page.mouse.move(drag.p.x - 140, drag.p.y);
  await page.mouse.down();
  await page.mouse.move(drag.p.x - 60, drag.p.y, { steps: 4 });
  await page.mouse.move(drag.p.x, drag.p.y, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => os.memory.snapshot());
  ok('font cache bar drag grows it', after.sys.fontcache > drag.before.fc, `${drag.before.fc}K -> ${after.sys.fontcache}K`);
  ok('... and Free shrinks by the same', drag.before.free - after.freeK === after.sys.fontcache - drag.before.fc);
  await page.mouse.move(drag.p.x + 100, drag.p.y + 50, { steps: 4 });
  const later = await page.evaluate(() => os.memory.snapshot().sys.fontcache);
  ok('... and the drag ends with the button', later === after.sys.fontcache, `${later}K`);
  await page.evaluate(() => os.memory.setArea('fontcache', 64));

  // *Configure RAMSize 4M: an A7000; the Task display follows at once
  await page.evaluate(() => os.cli.run('Configure RAMSize 4M'));
  await page.waitForTimeout(400);
  d = await display();
  ok('4MB: Total is 4096K (no VRAM)', row(d, 'Total').k === 4096, `${row(d, 'Total').k}K`);
  ok('4MB: the screen comes out of DRAM (1024x768, 256 colours)', row(d, 'Screen memory').k === 768 && row(d, 'Screen memory').red);
  ok('4MB: little free memory', row(d, 'Free').k < 1024, `${row(d, 'Free').k}K`);
  ok('4MB: the window narrows to the shorter bars', d.extW < 500, `${d.extW}px`);
  checkDisplay(d, '4MB');
  await shot('tm-4mb.png');

  // with 4MB, a big *WimpSlot is refused with the Wimp's error
  const err = await page.evaluate(async () => { try { await os.cli.run('WimpSlot -min 3000K'); return ''; } catch (e) { return e.message; } });
  ok('4MB: *WimpSlot -min 3000K refused', /^3000K free memory is needed before the application will start/.test(err), err);
  const st = await page.evaluate(async () => { const l = []; await os.cli.run('Status RAMSize', { out: { write: (s) => l.push(s), writeln: (s = '') => l.push(s + '\n') } }); return l.join(''); });
  ok('*Status RAMSize', /RAMSize\s+4M/.test(st), st.trim());
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('riscos371.config')).ramSize);
  ok('RAM size saved with the CMOS settings', persisted === 4, String(persisted));

  // !Configure's Memory window: RAM size pop-up -> 64MB
  await page.evaluate(() => os.apps.start('Configure'));
  await page.waitForTimeout(1000);
  const memIcon = await page.evaluate(() => {
    const t = os.apps.tasksOf('Configure')[0];
    const w = [...t.windows].find((x) => x.isOpen);
    const b = w.icons[6].bbox;
    return w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
  });
  await page.mouse.click(memIcon.x, memIcon.y);
  await page.waitForTimeout(800);
  const cw = await page.evaluate(() => {
    const t = os.apps.tasksOf('Configure')[0];
    const w = [...t.windows].find((x) => x.isOpen && x.title === 'Memory allocation');
    const b = w.icons[38].bbox;
    return { shown: w.icons[37].text, label: w.icons[36].text, p: w.workToScreen((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2), wy1: w.y + w.h, unitY1: w.workToScreen(0, w.icons[39].bbox.y1).y };
  });
  ok('Configure: RAM size row shows 4', cw.shown === '4' && cw.label === 'RAM size', JSON.stringify(cw));
  ok('Configure: RAM size row inside the window', cw.unitY1 <= cw.wy1, `${cw.unitY1} <= ${cw.wy1}`);
  await page.mouse.click(cw.p.x, cw.p.y);
  await page.waitForTimeout(400);
  await shot('tm-configure-ram-menu.png');
  const item = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.menu .mi, .menu [class*=item]')].find((e) => /^64MB/.test(e.textContent.trim()));
    if (!el) return null;
    const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  ok('Configure: RAM size menu has 64MB', !!item);
  if (item) { await page.mouse.click(item.x, item.y); await page.waitForTimeout(500); }
  const after64 = await page.evaluate(() => {
    const t = os.apps.tasksOf('Configure')[0];
    const w = [...t.windows].find((x) => x.isOpen && x.title === 'Memory allocation');
    return { mb: os.memory.ramMB, shown: w.icons[37].text };
  });
  ok('Configure: choosing 64MB applies it', after64.mb === 64 && after64.shown === '64', JSON.stringify(after64));
  d = await display();
  ok('64MB: the Task display follows', row(d, 'Total').k === 64 * 1024 + 2048, `${row(d, 'Total').k}K`);
  checkDisplay(d, '64MB');
  await shot('tm-configure-ram.png');
} catch (e) { out.push('FAIL exception ' + e.stack); }

console.log(out.join('\n'));
if (logs.some((l) => /PAGEERROR/.test(l))) console.log(logs.join('\n'));
await browser.close();
process.exitCode = out.some((l) => l.startsWith('FAIL')) ? 1 : 0;
