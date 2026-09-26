// !Browse in the desktop with its engine (serve.mjs --browser on its own port, a throw-away profile, local
// pages only): the page drawn in the window, clicks and typing, links and the buttons, the tab bar, a page's
// <select> as a RISC OS menu, its dialogues as error boxes, downloads through a Save box, uploads from the
// Filer, zoom, the hotlist, URI files, *URLOpen_http and printing to PDF.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, SHOTS } from '../core/pw.mjs';
import { findChrome } from '../../tools/browser-server.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const PORT = 8396;
const BASE = `http://localhost:${PORT}/`;
const FIX = BASE + 'tests/browse/fixtures/';
const res = [];
const ok = (name, v, detail) => res.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!findChrome()) { console.log('SKIP no Chrome to test with'); process.exit(0); }
// (a server already on the port would be tested instead: stop)
try { await fetch(BASE); console.log(`FAIL something is already running on port ${PORT}`); process.exit(1); } catch { /* free */ }
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'browse-app-'));
const server = spawn(process.execPath, ['serve.mjs', String(PORT), '--browser', '--browser-profile', profile], { cwd: ROOT, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* not yet */ } await sleep(100); }

const { browser, page, logs } = await launch({ width: 1200, height: 860 });
const until = async (fn, ms = 10000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await page.evaluate(fn).catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > ms) return v;
    await sleep(100);
  }
};
try {
  await page.goto(BASE + '?fast=1');
  await page.waitForFunction(() => window.os?.ready, null, { timeout: 30000 });
  await page.evaluate((u) => {
    window.B = () => os.apps.tasksOf('Browse')[0]?.browse;
    window.W = () => [...(B()?.windows ?? [])][0];
    window.T = () => W()?.current;
    return os.apps.start('Browse', `-url ${u}`);
  }, FIX + 'page.html');
  ok('!Browse finds its engine', await until(() => B()?.probe.mode === 'engine'), await page.evaluate(() => B()?.probe));
  ok('the page loads: its title is the window\'s', await until(() => T()?.title === 'Fixture page' && W().win.title === 'Fixture page' && !T().loading));
  ok('the page is drawn', await until(() => {
    const c = W().canvas, d = c.getContext('2d').getImageData(100, 300, 1, 1).data;
    return d[0] > 180 && d[1] < 60 && d[2] < 60;                 // the red box
  }));
  ok('the URL bar shows the address', await page.evaluate(() => W().urlbar.icons[2].text) === FIX + 'page.html');
  const box = await page.evaluate(() => { const r = W().canvas.getBoundingClientRect(); return { x: r.left, y: r.top }; });
  const at = (x, y) => [box.x + x, box.y + y];

  // typing into the page's field
  await page.mouse.click(...at(60, 125));
  await sleep(300);
  await page.keyboard.type('RISC OS');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await sleep(300);
  ok('clicks and typing reach the page (and select all)', await page.evaluate(() => T().copy()) === 'RISC OS', await page.evaluate(() => T().copy()));

  // a <select>: a RISC OS menu
  await page.mouse.click(...at(250, 125));
  const menu = await until(() => os.wimp.menus.isOpen && os.wimp.menus.levels[0].menu.items.map((i) => `${i.text}${i.shaded ? '-' : ''}${typeof i.ticked === 'boolean' && i.ticked ? '*' : ''}`).join());
  ok('a <select> opens as a RISC OS menu', menu === 'Red*,Green,Grey-,Blue', menu);
  await page.evaluate(() => { const m = os.wimp.menus.levels[0].menu; m.items[3].action(); os.wimp.menus.close(); });
  await sleep(300);
  await page.mouse.click(...at(250, 125));
  const menu2 = await until(() => os.wimp.menus.isOpen && os.wimp.menus.levels[0].menu.items.findIndex((i) => i.ticked === true));
  ok('choosing from it sets the <select>', menu2 === 3, menu2);
  await page.evaluate(() => os.wimp.menus.close());

  // the link under the pointer, the pointer shape, following it, Back
  await page.mouse.move(...at(40, 70));
  ok('the status bar shows where a link goes', await until(() => W().status.icons[0].text.endsWith('second.html')), await page.evaluate(() => W().status.icons[0].text));
  ok('the pointer over a link is a hand', await until(() => /ptr_link|pointer/.test(W().canvas.style.cursor)));
  await page.mouse.click(...at(40, 70));
  ok('following a link', await until(() => T().title === 'Second fixture'));
  ok('Back is on, Forward is off', await until(() => !W().bbar.icons[7].shaded && W().bbar.icons[1].shaded));
  await page.evaluate(() => W().button(7, { button: 'select' }));
  ok('the Back button', await until(() => T().title === 'Fixture page' && !W().bbar.icons[1].shaded));
  await sleep(500);

  // the URL bar: an address typed and Return
  await page.evaluate(() => W().focusURL());
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.evaluate(() => { const ic = W().urlbar.icons[2]; ic.setText(''); os.wimp.setCaret(W().urlbar, ic, 0); });
  await page.keyboard.type(FIX + 'second.html');
  await page.keyboard.press('Enter');
  ok('an address typed in the URL bar', await until(() => T().title === 'Second fixture'));
  ok('words typed in the URL bar are searched for', await page.evaluate(() => B().fixURL('risc os browsers')) === 'https://duckduckgo.com/?q=risc%20os%20browsers'
    && await page.evaluate(() => B().fixURL('example.com/x')) === 'https://example.com/x' && await page.evaluate(() => B().fixURL('localhost:8000')) === 'http://localhost:8000', 0);
  await page.evaluate(() => W().button(7, { button: 'select' }));
  await until(() => T().title === 'Fixture page' && !T().loading);
  await sleep(500);

  // the page's confirm(): an error box with OK and Cancel
  await page.mouse.click(...at(40, 175));
  ok('confirm() is a RISC OS error box', await until(() => os.wimp.stack.some((w) => w._errorBox && w.isOpen && /Sure\?/.test(w.icons[0].text))));
  await page.keyboard.press('Enter');
  ok('its answer reaches the page', await until(async () => /id="res"[^>]*>true</.test((await T().request({ op: 'source' })).text)));

  // a download: a Save box; its file written where it's saved
  await page.mouse.click(...at(140, 175));
  const saveBox = await until(() => os.wimp.stack.find((w) => w.isOpen && w.title === 'Save download')?.icons[1].text);
  ok('a download asks where with a Save box', saveBox === 'notes/txt', saveBox);
  await page.evaluate(() => { const w = os.wimp.stack.find((x) => x.isOpen && x.title === 'Save download'); w.icons[1].setText('RAM::RamDisc0.$.notes/txt'); os.wimp.setCaret(w, w.icons[1], 0); });
  await page.keyboard.press('Enter');
  ok('the downloaded file is saved', await until(async () => os.vfs.exists('RAM::RamDisc0.$.notes/txt') && await os.vfs.readText('RAM::RamDisc0.$.notes/txt') === 'Downloaded text' && os.vfs.stat('RAM::RamDisc0.$.notes/txt').filetype === 0xFFF));

  // an upload: the page's file chooser asks for a file from the Filer
  await page.mouse.click(...at(260, 175));
  ok('a file chooser opens a box to drag a file into', await until(() => os.wimp.stack.some((w) => w.isOpen && w.title === 'Send files to the page')));
  await page.evaluate(() => {
    os.vfs.writeFile('RAM::RamDisc0.$.photo/txt', 'Uploaded text', { filetype: 0xFFF });
    const w = os.wimp.stack.find((x) => x.isOpen && x.title === 'Send files to the page');
    w.emit('dataload', { files: [{ path: 'RAM::RamDisc0.$.photo/txt', filetype: 0xFFF }] });
  });
  ok('the file reaches the page, with its host name', await until(async () => /id="res"[^>]*>photo\.txt:Uploaded text</.test((await T().request({ op: 'source' })).text)));

  // a link to a new tab: the tab bar
  await page.mouse.click(...at(240, 70));
  ok('a target=_blank link opens a tab', await until(() => W().tabs.length === 2 && T().title === 'Second fixture'));
  ok('the tab bar appears with two tabs', await until(() => W().tabbar.isOpen && W().tabbar.icons.filter(Boolean).length === 3));
  await page.evaluate(() => W().tabClick({ button: 'select', icon: W().tabbar.icons[0] }));
  ok('clicking a tab shows its page', await until(() => T().title === 'Fixture page'));
  await page.evaluate(() => W().tabClick({ button: 'adjust', icon: W().tabbar.icons[1] }));
  ok('ADJUST on a tab closes it; the tab bar goes', await until(() => W().tabs.length === 1 && !W().tabbar.isOpen));

  // zoom
  await page.evaluate(() => T().setZoom(1.5));
  ok('zoom', await until(async () => W().status.icons[3].text === '150%' && /<html[^>]*zoom: 1.5/.test((await T().request({ op: 'source' })).text)));
  await page.evaluate(() => T().setZoom(1));

  // the hotlist
  await page.evaluate(() => W().button(8, { button: 'select' }));
  ok('Add to hotlist', await page.evaluate((u) => B().hotlist[0]?.url === u && os.vfs.exists('Choices:Browse'), FIX + 'page.html'));

  // Save location: a URI file, which opens in !Browse when double-clicked
  const uri = await page.evaluate(async () => {
    const box = B().saveLocation(W());
    box.icons[1].setText('RAM::RamDisc0.$.Fixture');
    os.wimp.setCaret(box, box.icons[1], 0);
    box.emit('key', { code: 13 });
    await new Promise((r) => setTimeout(r, 300));
    return os.vfs.exists('RAM::RamDisc0.$.Fixture') ? { type: os.vfs.stat('RAM::RamDisc0.$.Fixture').filetype, text: await os.vfs.readText('RAM::RamDisc0.$.Fixture') } : null;
  });
  ok('Save location writes a URI file', uri?.type === 0xF91 && uri.text.startsWith('URI\t100') && uri.text.includes(FIX + 'page.html'), uri);
  await page.evaluate(() => os.filer.run('RAM::RamDisc0.$.Fixture'));
  ok('double-clicking a URI file opens its page', await until(() => B().windows.size === 2 && [...B().windows][1].current?.title === 'Fixture page'));
  await page.evaluate(() => [...B().windows][1].destroy());

  // *URLOpen_http: other programs' way to open a web address
  await page.evaluate((u) => os.cli.run(`URLOpen_http ${u}`), FIX + 'second.html');
  ok('*URLOpen_http opens the address in !Browse', await until(() => [...B().windows].some((w) => w.current?.title === 'Second fixture')));
  await page.evaluate(() => { for (const w of [...B().windows].slice(1)) w.destroy(); });

  // !Bookworm's links to the web: to !Browse
  await page.evaluate(async (u) => { const t = await os.apps.start('Bookworm'); t.bookworm.newView(u); }, FIX + 'second.html');
  ok('!Bookworm gives web links to !Browse', await until(() => [...B().windows].some((w) => w.current?.title === 'Second fixture') && !os.wimp.stack.some((w) => w._errorBox && w.isOpen)));
  await page.evaluate(() => { for (const w of [...B().windows].slice(1)) w.destroy(); const bw = os.apps.tasksOf('Bookworm')[0]; for (const v of [...bw.bookworm.views]) v.destroy(); });

  // Print to PDF
  const pdf = await page.evaluate(async () => {
    const box = B().pdfBox(W());
    box.icons[1].setText('RAM::RamDisc0.$.Page/pdf');
    box.emit('key', { code: 13 });
    for (let i = 0; i < 50 && !os.vfs.exists('RAM::RamDisc0.$.Page/pdf'); i++) await new Promise((r) => setTimeout(r, 100));
    const b = os.vfs.exists('RAM::RamDisc0.$.Page/pdf') ? await os.vfs.readFile('RAM::RamDisc0.$.Page/pdf') : null;
    return b && { head: String.fromCharCode(...b.slice(0, 5)), type: os.vfs.stat('RAM::RamDisc0.$.Page/pdf').filetype };
  });
  ok('Print to PDF', pdf?.head === '%PDF-' && pdf.type === 0xADF, pdf);

  // sound
  if (await page.evaluate(() => B().engine.hasAudio)) {
    await page.mouse.click(...at(470, 175));
    ok('the page\'s sound plays on the desktop', await until(() => !!B().engine.audio && B().engine.audio.next > 0));
  } else res.push('SKIP sound: the engine has none');

  // scroll bars follow the page
  await page.mouse.move(...at(300, 300));
  await page.mouse.wheel(0, 500);
  ok('the window\'s scroll bar follows the page', await until(() => W().win.scrollY > 0 && W().win.extent.y1 > W().win.h), await page.evaluate(() => [W().win.scrollY, W().win.extent]));
  await page.evaluate(() => W().win.emit('open', { ...W().win.getState(), scrollY: 0 }));
  ok('and moves it', await until(() => T().scroll?.y === 0));

  ok('the page is drawn again at the top', await until(() => { const d = W().canvas.getContext('2d').getImageData(100, 300, 1, 1).data; return d[0] > 180 && d[1] < 60; }));
  await page.screenshot({ path: path.join(SHOTS, 'browse.png') });
} catch (e) {
  res.push(`FAIL exception ${e.stack ?? e}`);
} finally {
  console.log(res.join('\n'));
  const errs = logs.filter((l) => /PAGEERROR/.test(l));
  if (errs.length) console.log(errs.join('\n'));
  await browser.close();
  server.kill();
  await sleep(300);
  fs.rmSync(profile, { recursive: true, force: true });
}
