// Task window test: Ctrl-F12, *cat, BASIC in the task window, the Task menu, the Task Manager.
//   PLAYWRIGHT_MODULE=~/.npm/_npx/<hash>/node_modules/playwright/index.mjs node tests/tw/tw.mjs
// (needs `node serve.mjs` running; URL=http://localhost:PORT/ to use another port)
import path from 'path';
import { launch, BASE_URL, SHOTS } from '../core/pw.mjs';

const { browser, page, logs } = await launch({ width: 1024, height: 768 });
const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });
const type = async (s) => { for (const ch of s) { if (ch === '\n') await page.keyboard.press('Enter'); else await page.keyboard.type(ch); } await page.waitForTimeout(150); };
const text = () => page.evaluate(() => {
  const s = [...(window.__tw ?? [])].pop();
  return s?.state?.doc.text ?? '';
});
let fail = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fail++; };

await page.goto(BASE_URL + '?fast=1');
await page.waitForFunction(() => window.os?.ready, null, { timeout: 20000 });
await page.waitForTimeout(500);
// expose sessions for checks
await page.evaluate(async () => {
  const m = await import('/src/apps/TaskWindow/main.js');
  window.__twmod = m;
});
await page.keyboard.press('Control+F12');
await page.waitForFunction(() => [...document.querySelectorAll('.win-title .ttext')].some((e) => e.textContent === 'Task window'), null, { timeout: 10000 });
await page.waitForTimeout(400);
const doc = () => page.evaluate(() => {
  const w = [...window.wimp.windows].find((w) => w.title === 'Task window');
  return w ? w.el.innerText + '|' : '';
});
await type('cat\n');
await page.waitForTimeout(600);
await shot('tw-cat');
await type('BASIC\n');
await page.waitForTimeout(500);
await type('PRINT 2^10\n');
await type('10 FOR I=1 TO 3:PRINT I:NEXT\n');
await type('RUN\n');
await page.waitForTimeout(500);
await shot('tw-basic');
const twText = () => page.evaluate(async () => { const m = await import('/src/apps/TaskWindow/main.js'); return [...m.taskWindows].pop()?.state?.doc.text ?? ''; });
const t1 = await twText();
console.log('--- task window text ---\n' + t1 + '\n---');
check(/\*cat/i.test(t1) && /Dir\./.test(t1), '*cat output');
check(/1024/.test(t1), 'PRINT 2^10');
check(/ +1\n +2\n +3/.test(t1), 'program output');
await type('QUIT\n');
await page.waitForTimeout(400);
await type('echo back at star\n');
await page.waitForTimeout(400);
const t2 = await twText();
check(/back at star\n\*$/.test(t2), 'back at * prompt after QUIT: ' + JSON.stringify(t2.slice(-40)));
// Task menu (right click = Menu)
const box = await page.evaluate(() => {
  const w = [...window.wimp.windows].find((w) => w.title === 'Task window');
  return { x: w.x + 100, y: w.y + 60 };
});
await page.mouse.click(box.x, box.y, { button: 'right' });
await page.waitForTimeout(400);
await shot('tw-menu');
await page.keyboard.press('Escape');
// Task Manager: click the Acorn icon at the right end of the icon bar
const sw = await page.evaluate(() => {
  const it = window.wimp.iconbar.items.find((i) => i.task?.name === 'Task Manager');
  return it ? { x: window.wimp.iconbar.iconScreenX(it), y: window.wimp.height - 30 } : null;
});
if (sw) { await page.mouse.click(sw.x, sw.y); await page.waitForTimeout(600); }
await shot('tw-taskman');
const tasks = await page.evaluate(() => window.wimp.tasks.map((t) => t.name + ':' + t.memory));
check(tasks.some((t) => t.startsWith('TaskWindow:640')), 'Task Manager lists TaskWindow 640K: ' + tasks.join(', '));
const content = await page.evaluate(() => {
  const st = window.os.apps.tasksOf('Edit').length && [...document.querySelectorAll('.win')].length;
  return st;
});
void content; void t1; void doc; void text;
// Escape stops a running BASIC program; Kill / Reconnect; Suspend / Resume; *TaskWindow -quit
await page.keyboard.press('Escape');
await page.evaluate(() => { const w = [...window.wimp.windows].find((w) => w.title === 'Task window'); w.open({ behind: 'top' }); });
await page.mouse.click(box.x, box.y);
await type('BASIC\n');
await type('REPEAT:UNTIL FALSE\n');
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await type('QUIT\n');
check(/Escape\n>QUIT\n\*$/.test(await twText()), 'Escape stops the loop');
const r = await page.evaluate(async () => {
  const m = await import('/src/apps/TaskWindow/main.js');
  const s = [...m.taskWindows].pop();
  const out = {};
  s.shell.suspend(true); s.shell.key(65); await new Promise((r) => setTimeout(r, 100));
  out.suspendedHeld = !s.state.doc.text.endsWith('A');
  s.resume(); await new Promise((r) => setTimeout(r, 100));
  out.resumed = s.state.doc.text.endsWith('*A');
  s.kill(); await new Promise((r) => setTimeout(r, 100));
  out.killed = !s.child && !window.wimp.tasks.some((t) => t.name === 'TaskWindow');
  s._startChild(); await new Promise((r) => setTimeout(r, 100));
  out.reconnected = s.child && window.wimp.tasks.some((t) => t.name === 'TaskWindow');
  await window.os.cli.run('TaskWindow "echo quitting" -quit');
  await new Promise((r) => setTimeout(r, 300));
  const q = [...m.taskWindows].pop();
  out.quitText = q.state?.doc.text; out.quitChild = q.child;
  return out;
});
check(r.suspendedHeld && r.resumed, 'suspend holds input, resume delivers it');
check(r.killed && r.reconnected, 'kill / reconnect');
check(r.quitText === 'quitting\n' && !r.quitChild, '*TaskWindow "echo quitting" -quit: ' + JSON.stringify(r));
// close with a live task -> ME5 query
await page.evaluate(async () => { const m = await import('/src/apps/TaskWindow/main.js'); const s = [...m.taskWindows][0]; s.state.closeView(s.state.views[0]); });
await page.waitForTimeout(400);
await shot('tw-close');
const errs = logs.filter((l) => /PAGEERROR|error/i.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exit(fail ? 1 : 0);
