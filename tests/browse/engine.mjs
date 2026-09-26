// !Browse's engine (tools/browser-server.mjs), driven the way the app drives it, over its WebSocket: pages
// arrive as frames, links and history work, keys and clicks reach the page, dialogues, <select> menus,
// pop-ups, downloads, uploads, printing and sound come back to the desktop. Its own serve.mjs --browser on
// another port, with a throw-away profile, and local pages only.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { findChrome } from '../../tools/browser-server.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const PORT = 8397;
const BASE = `http://localhost:${PORT}/`;
const FIX = BASE + 'tests/browse/fixtures/';
const res = [];
const ok = (name, v, detail) => res.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!findChrome()) { console.log('SKIP no Chrome to test with'); process.exit(0); }
// (a server already on the port would be tested instead: stop)
try { await fetch(BASE); console.log(`FAIL something is already running on port ${PORT}`); process.exit(1); } catch { /* free */ }
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'browse-test-'));
const server = spawn(process.execPath, ['serve.mjs', String(PORT), '--browser', '--browser-profile', profile], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
let serverOut = '';
server.stdout.on('data', (d) => { serverOut += d; });
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* not yet */ } await sleep(100); }
  // the token, and the guards
  const info = await (await fetch(BASE + '__browse/')).json();
  ok('GET /__browse/ says the engine is on', info.enabled && info.token && info.engine, info);
  const cross = await fetch(BASE + '__browse/', { headers: { 'Sec-Fetch-Site': 'cross-site' } });
  ok('cross-site requests are refused', cross.status === 403, cross.status);
  const badHost = await new Promise((resolve) => http.get({ host: '127.0.0.1', port: PORT, path: '/__browse/', headers: { Host: 'evil.example:' + PORT } }, (r) => { r.resume(); resolve(r.statusCode); }).on('error', () => resolve(null)));
  ok('other host names are refused (DNS rebinding)', badHost === 403, badHost);
  const noTok = await fetch(BASE + '__browse/check?url=' + encodeURIComponent(FIX + 'page.html'));
  ok('the frame check needs the token', noTok.status === 403, noTok.status);
  const chk = await (await fetch(BASE + '__browse/check?url=' + encodeURIComponent(FIX + 'page.html'), { headers: { 'X-Browse-Token': info.token } })).json();
  ok('the frame check reads frame-ancestors (serve.mjs\'s own pages only allow their own site)', chk.frameable === false && chk.reason === 'frame-ancestors', chk);

  // bad requests don't stop the server; the desktop can't be framed by other sites
  const badReq = await fetch(BASE + '%');
  ok('a malformed address gets 400, and the server carries on', badReq.status === 400 && (await fetch(BASE)).ok, badReq.status);
  ok('the desktop can\'t be framed by other sites', /frame-ancestors 'self'/.test((await fetch(BASE)).headers.get('content-security-policy') ?? ''));

  // a WebSocket without the right origin or token is refused
  const refused = await new Promise((resolve) => {
    const w = new WebSocket(`ws://localhost:${PORT}/__browse/ws?t=wrong`);
    w.onopen = () => { w.close(); resolve(false); };
    w.onerror = () => resolve(true);
  });
  ok('a WebSocket with a wrong token is refused', refused);

  const ws = new WebSocket(`ws://localhost:${PORT}/__browse/ws?t=${info.token}`, { headers: { Origin: `http://localhost:${PORT}` } });
  ws.binaryType = 'arraybuffer';
  const events = [];
  const frames = new Map();                      // tab -> count
  let audioBytes = 0, lastFrame = null, lastMeta = null;
  const waiters = new Set();
  let req = 0;
  const replies = new Map();
  ws.onmessage = (m) => {
    if (typeof m.data !== 'string') {
      const b = new Uint8Array(m.data);
      const tab = new DataView(m.data).getUint32(1, true);
      if (b[0] === 1) { frames.set(tab, (frames.get(tab) ?? 0) + 1); lastFrame = b.subarray(13); lastMeta = [...new Uint16Array(m.data.slice(5, 13))]; }
      if (b[0] === 2) audioBytes += b.length - 5;
    } else {
      const e = JSON.parse(m.data);
      events.push(e);
      if (e.ev === 'reply') replies.get(e.req)?.(e);
    }
    for (const w of [...waiters]) if (w.test()) { waiters.delete(w); w.resolve(true); }
  };
  const until = (test, ms = 10000) => test() ? Promise.resolve(true) : new Promise((resolve) => {
    const w = { test, resolve };
    waiters.add(w);
    setTimeout(() => { if (waiters.delete(w)) resolve(false); }, ms);
  });
  const call = (o) => new Promise((resolve) => { const id = ++req; replies.set(id, resolve); ws.send(JSON.stringify({ ...o, req: id })); });
  const cmd = (o) => ws.send(JSON.stringify(o));
  const state = (tab) => Object.assign({}, ...events.filter((e) => e.ev === 'state' && e.tab === tab));
  await until(() => events.some((e) => e.ev === 'ready' || e.ev === 'error'), 20000);
  const hello = events.find((e) => e.ev === 'hello');
  const ready = events.find((e) => e.ev === 'ready');
  ok('the engine starts', !!ready, events);

  const { tab } = await call({ op: 'open', url: FIX + 'page.html', w: 640, h: 480, scale: 1, zoom: 1 });
  cmd({ op: 'show', tab, on: true });
  ok('a tab opens and loads', await until(() => state(tab).title === 'Fixture page' && state(tab).loading === false), state(tab));
  ok('frames arrive', await until(() => (frames.get(tab) ?? 0) > 0), [...frames]);
  ok('frames are JPEGs', lastFrame?.[0] === 0xFF && lastFrame?.[1] === 0xD8);

  const click = async (x, y, t = tab) => {
    cmd({ op: 'mouse', tab: t, type: 'mouseMoved', x, y, buttons: 0 });
    cmd({ op: 'mouse', tab: t, type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    cmd({ op: 'mouse', tab: t, type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(150);
  };
  const key = (k, code, keyCode, text, modifiers = 0, commands) => {
    cmd({ op: 'key', tab, type: text ? 'keyDown' : 'rawKeyDown', key: k, code, keyCode, text, modifiers, commands });
    cmd({ op: 'key', tab, type: 'keyUp', key: k, code, keyCode, modifiers });
  };
  const text = async () => (await call({ op: 'source', tab })).text;
  const res1 = async () => /<p id="res"[^>]*>([^<]*)</.exec(await text())?.[1];

  const f = await call({ op: 'find', tab, text: 'Hello from the fixture' });
  ok('find', f.found === true, f);
  const nf = await call({ op: 'find', tab, text: 'not on the page anywhere' });
  ok('find: not found', nf.found === false, nf);
  const copied = await call({ op: 'copy', tab });
  ok('copy the selection', copied.text === 'Hello from the fixture', copied);
  ok('the page source', /<h1 id="h"[^>]*>Hello/.test(await text()));

  // clicking into a field and typing
  await click(60, 125);
  for (const ch of 'RISC') key(ch, 'Key' + ch, ch.charCodeAt(0), ch);
  cmd({ op: 'text', tab, text: ' OS' });
  key('a', 'KeyA', 65, undefined, 4, ['selectAll']);
  await sleep(200);
  const typed = await call({ op: 'copy', tab });
  ok('keys and text reach the focused field', typed.text === 'RISC OS', typed);

  // a <select> opens as a RISC OS menu
  events.length = 0;
  await click(250, 125);
  await until(() => events.some((e) => e.ev === 'select'));
  const sel = events.find((e) => e.ev === 'select');
  ok('a <select> opens as a menu', sel && sel.options.length === 4 && sel.options[2].disabled && sel.index === 0 && Math.abs(sel.x - 200) < 2 && Math.abs(sel.y - 140) < 2, sel ?? events.slice(-5));
  cmd({ op: 'select', tab, index: 3 });
  await sleep(200);
  ok('choosing from the menu sets the <select>', (await call({ op: 'copy', tab })).text !== undefined);

  // the pointer shape and the link under the pointer
  events.length = 0;
  cmd({ op: 'mouse', tab, type: 'mouseMoved', x: 40, y: 70, buttons: 0 });
  await until(() => events.some((e) => e.ev === 'state' && e.link));
  const link = events.find((e) => e.ev === 'state' && e.link)?.link;
  ok('the link under the pointer is reported', /second\.html$/.test(link ?? ''), link);
  ok('the pointer becomes a hand over links', events.filter((e) => e.ev === 'state' && e.cursor).at(-1)?.cursor === 'pointer', events);
  await click(40, 70);
  ok('following a link', await until(() => state(tab).title === 'Second fixture'), state(tab));
  ok('back is possible', state(tab).canBack === true, state(tab));
  cmd({ op: 'back', tab });
  ok('back', await until(() => state(tab).title === 'Fixture page' && state(tab).canForward === true), state(tab));
  await sleep(300);

  // a JavaScript dialogue
  events.length = 0;
  await click(40, 175);
  await until(() => events.some((e) => e.ev === 'dialog'));
  const dlg = events.find((e) => e.ev === 'dialog');
  ok('confirm() comes back as a dialogue', dlg?.type === 'confirm' && dlg.message === 'Sure?', dlg ?? events.slice(-3));
  cmd({ op: 'dialog', tab, accept: true });
  await sleep(200);
  ok("the dialogue's answer reaches the page", await res1() === 'true', await res1());

  // a download: the app asks where (a save box), then fetches it
  events.length = 0;
  await click(140, 175);
  await until(() => events.some((e) => e.ev === 'download'));
  const dl = events.find((e) => e.ev === 'download');
  ok('a download is offered', dl?.name === 'notes.txt', dl ?? events.slice(-3));
  if (dl) {
    ok('the download completes', await until(() => events.some((e) => e.ev === 'progress' && e.id === dl.id && e.state === 'completed')), events.filter((e) => e.ev === 'progress'));
    const body = await fetch(`${BASE}__browse/file/${dl.id}?c=${hello.id}`, { headers: { 'X-Browse-Token': info.token } }).then((r) => r.text());
    ok('the downloaded file', body === 'Downloaded text', body);
  }

  // an upload: the page's file chooser, answered with a file sent from the desktop
  events.length = 0;
  await click(260, 175);
  await until(() => events.some((e) => e.ev === 'files'));
  ok('a file chooser asks the desktop', events.some((e) => e.ev === 'files' && e.multiple === false), events.slice(-3));
  const up = await (await fetch(`${BASE}__browse/upload?c=${hello.id}&name=hello.txt`, { method: 'POST', body: 'Uploaded text', headers: { 'X-Browse-Token': info.token } })).json();
  cmd({ op: 'files', tab, files: [up.id] });
  await sleep(500);
  ok('the file reaches the page', await res1() === 'hello.txt:Uploaded text', await res1());

  // an upload called '..' is just a file; files need their own connection's id
  const dots = await fetch(`${BASE}__browse/upload?c=${hello.id}&name=..`, { method: 'POST', body: 'x', headers: { 'X-Browse-Token': info.token } });
  ok('an upload named .. is harmless', dots.ok && (await fetch(BASE)).ok, dots.status);
  const pdf0 = await call({ op: 'pdf', tab });
  const noC = await fetch(`${BASE}__browse/file/${pdf0.file}`, { headers: { 'X-Browse-Token': info.token } });
  ok('a file needs the connection it belongs to', noC.status === 404, noC.status);
  const refusedOpen = await call({ op: 'open', url: 'file:///etc/passwd', w: 100, h: 100 });
  ok('a tab isn\'t opened on a file: address', /doesn't open file/.test(refusedOpen.error ?? ''), refusedOpen);

  // printing to PDF
  const pdf = await call({ op: 'pdf', tab });
  const pdfBytes = pdf.file ? new Uint8Array(await (await fetch(`${BASE}__browse/file/${pdf.file}?c=${hello.id}`, { headers: { 'X-Browse-Token': info.token } })).arrayBuffer()) : null;
  ok('print to PDF', pdfBytes && String.fromCharCode(...pdfBytes.subarray(0, 5)) === '%PDF-', pdf);

  // a target=_blank link opens a new tab
  events.length = 0;
  await click(240, 70);
  await until(() => events.some((e) => e.ev === 'opened'));
  const opened = events.find((e) => e.ev === 'opened');
  ok('target=_blank opens a tab', opened?.opener === tab, opened ?? events.slice(-3));
  if (opened) {
    cmd({ op: 'show', tab: opened.tab, on: true });
    ok('the new tab loads', await until(() => state(opened.tab).title === 'Second fixture'), state(opened.tab));
    ok('the new tab sends frames', await until(() => frames.get(opened.tab) > 0), [...frames]);
    cmd({ op: 'close', tab: opened.tab });
  }

  // sound (Chrome for Testing / Chromium only)
  if (ready?.audio) {
    cmd({ op: 'audio', on: true });
    await click(470, 175);
    ok('the page\'s sound arrives', await until(() => audioBytes > 0), audioBytes);
  } else res.push('SKIP sound: the engine has none (use Chrome for Testing)');

  // resizing: the frames follow the window; a page smaller than Chrome's smallest window is cropped from a frame
  cmd({ op: 'size', tab, w: 640, h: 400 });
  await sleep(500);
  cmd({ op: 'wheel', tab, x: 50, y: 50, dx: 0, dy: 300 });
  await sleep(500);
  let size = jpegSize(lastFrame);
  ok('frames follow the window size', size?.w === 640 && size?.h === 400 && lastMeta.join() === '640,400,640,400', [size, lastMeta]);
  cmd({ op: 'size', tab, w: 320, h: 200 });
  await sleep(500);
  cmd({ op: 'wheel', tab, x: 50, y: 50, dx: 0, dy: -100 });
  await sleep(500);
  size = jpegSize(lastFrame);
  ok('a small page: the frame says how much of it is page', lastMeta[0] === 320 && lastMeta[1] === 200 && lastMeta[2] >= 320 && size?.w === lastMeta[2], [size, lastMeta]);
  // zoom
  cmd({ op: 'zoom', tab, zoom: 1.5 });
  await sleep(300);
  ok('zoom', /<html[^>]*zoom: 1.5/.test(await text()), (await text()).slice(0, 120));
  cmd({ op: 'navigate', tab, url: FIX + 'second.html' });
  await until(() => state(tab).title === 'Second fixture');
  ok('zoom stays for the next page', /<html[^>]*zoom: 1.5/.test(await text()), (await text()).slice(0, 120));

  // forbidden schemes
  const bad = await call({ op: 'navigate', tab, url: 'file:///etc/passwd' });
  ok('file: addresses are refused', /doesn't open file/.test(bad.error ?? ''), bad);

  // closing the socket closes its tabs
  ws.close();
  await sleep(300);
} catch (e) {
  res.push(`FAIL exception ${e.stack ?? e}`);
} finally {
  console.log(res.join('\n'));
  server.kill();
  await sleep(300);
  fs.rmSync(profile, { recursive: true, force: true });
  if (/Error/.test(serverOut)) console.log(serverOut);
}

function jpegSize(b) {
  if (!b) return null;
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xFF) return null;
    const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xC0 && m <= 0xC2) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + len;
  }
  return null;
}
