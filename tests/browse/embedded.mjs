// !Browse without its engine (serve.mjs without --browser): pages in a frame. A site that refuses to be framed
// (X-Frame-Options, found by /__browse/check) gets a note and a button to open it in the host's own browser
// instead; Back and Forward go through !Browse's own history. A little server of its own serves the pages.
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { launch } from '../core/pw.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const PORT = 8399, SITE = 8400;
const BASE = `http://localhost:${PORT}/`;
const res = [];
const ok = (name, v, detail) => res.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { await fetch(BASE); console.log(`FAIL something is already running on port ${PORT}`); process.exit(1); } catch { /* free */ }
const site = http.createServer((req, res) => {
  const deny = req.url.startsWith('/deny');
  res.writeHead(200, { 'Content-Type': 'text/html', ...(deny ? { 'X-Frame-Options': 'DENY' } : {}) });
  res.end(`<!doctype html><title>${deny ? 'Denied' : 'Framed'}</title><body style="background:#0a0"><h1>${req.url}</h1>`);
}).listen(SITE, '127.0.0.1');
const server = spawn(process.execPath, ['serve.mjs', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* not yet */ } await sleep(100); }

const { browser, page, logs } = await launch({ width: 1200, height: 860 });
const until = async (fn, arg, ms = 8000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await page.evaluate(fn, arg).catch(() => null);
    if (v || Date.now() - t0 > ms) return v;
    await sleep(100);
  }
};
try {
  await page.goto(BASE + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 30000 });
  const OKURL = `http://127.0.0.1:${SITE}/ok`, DENY = `http://127.0.0.1:${SITE}/deny`;
  await page.evaluate((u) => {
    window.B = () => os.apps.tasksOf('Browse')[0]?.browse;
    window.W = () => [...(B()?.windows ?? [])][0];
    window.T = () => W()?.current;
    return os.apps.start('Browse', `-url ${u}`);
  }, OKURL);
  ok('without --browser, pages are embedded', await until(() => B()?.probe.mode === 'embedded' && B().probe.reason === 'off'), await page.evaluate(() => B()?.probe));
  ok('a page in a frame', await until((u) => { const f = W()?.win.view.querySelector('iframe'); return f && f.src === u && f.style.display !== 'none' && f.getAttribute('sandbox')?.includes('allow-scripts') && !f.getAttribute('sandbox').includes('top-navigation'); }, OKURL));
  ok('the frame loads', await until(() => !T().loading));
  ok('the status bar says how to get the full browser', await until(() => /--browser/.test(W().status.icons[0].text)), await page.evaluate(() => W().status.icons[0].text));
  const fr = page.frames().find((f) => f.url() === OKURL);
  ok('the page is there', (await fr?.textContent('h1')) === '/ok');
  await page.evaluate((u) => W().go(u), DENY);
  ok('a site that refuses frames: a note instead, and no frame', await until(() => W().note.style.display !== 'none' && /doesn't let itself be shown/.test(W().note.textContent) && !W().win.view.querySelector('iframe')), await page.evaluate(() => W().note.textContent));
  ok('with a button to open it in the host\'s browser', await page.evaluate(() => W().note.querySelector('button')?.textContent) === 'Open in your own browser');
  ok('Back is on', await page.evaluate(() => T().canBack && !W().bbar.icons[7].shaded));
  await page.evaluate(() => W().button(7, { button: 'select' }));
  ok('Back goes to the framed page again', await until((u) => W().win.view.querySelector('iframe')?.src === u && W().note.style.display === 'none' && T().canForward, OKURL));
  // a drag over the frame: the frame lets the pointer through
  const pe = await page.evaluate(() => { document.body.classList.add('dragging'); const v = getComputedStyle(W().win.view.querySelector('iframe')).pointerEvents; document.body.classList.remove('dragging'); return v; });
  ok('frames let drags through', pe === 'none', pe);
  // only web addresses: a javascript: one would run as the desktop
  await page.evaluate(() => W().go('javascript:void(parent.__pwned = 1)'));
  await sleep(500);
  ok('a javascript: address is refused', await page.evaluate(() => !window.__pwned && os.wimp.stack.some((w) => w._errorBox && w.isOpen)));
  await page.keyboard.press('Enter');
  // a page from the desktop's own server isn't same-origin with it
  await page.evaluate((u) => W().go(u), BASE + 'tests/browse/fixtures/second.html');
  ok('the desktop\'s own pages are never same-origin frames', await until(() => { const f = W().win.view.querySelector('iframe'); return !T().loading && (!f || !f.getAttribute('sandbox').includes('allow-same-origin')); }));
} catch (e) {
  res.push(`FAIL exception ${e.stack ?? e}`);
} finally {
  console.log(res.join('\n'));
  const errs = logs.filter((l) => /PAGEERROR/.test(l));
  if (errs.length) console.log(errs.join('\n'));
  await browser.close();
  server.kill();
  site.close();
}
