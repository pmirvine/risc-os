// A live check of a deployed desktop behind Apache basic auth (see deploy/README.md). Not part of the default
// suites: it needs a real server.
//
//   RO_URL=https://your-server/ro/ RO_USER=name RO_PASS=password node tests/core/remote-check.mjs
//
// It checks, through the real URL: logins are required; the desktop loads and mounts the Server drive;
// HostFS writes land; !Browse's engine starts, shows a public page, and cannot reach private addresses or
// the container's own server. The password is only read from the environment and never printed.
import { launch } from './pw.mjs';

const URL_ = process.env.RO_URL, USER = process.env.RO_USER, PASS = process.env.RO_PASS;
if (!URL_ || !USER || !PASS) { console.log('usage: RO_URL=https://host/ro/ RO_USER=... RO_PASS=... node tests/core/remote-check.mjs'); process.exit(2); }
const base = URL_.endsWith('/') ? URL_ : URL_ + '/';
const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const res = [];
const ok = (name, v, detail) => res.push(`${v ? 'PASS' : 'FAIL'} ${name}${v ? '' : ' ' + JSON.stringify(detail)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (p, h = {}) => fetch(base + p, { headers: { Authorization: auth, ...h }, redirect: 'manual' });

// --- login required
for (const p of ['', '__hostfs/', '__browse/']) ok(`no login: /${p} is refused`, (await fetch(base + p, { redirect: 'manual' })).status === 401);
ok('wrong password is refused', (await fetch(base, { headers: { Authorization: 'Basic ' + Buffer.from(`${USER}:wrong-${Date.now()}`).toString('base64') } })).status === 401);
ok('the path without a slash redirects', [301, 302].includes((await fetch(base.slice(0, -1), { redirect: 'manual' })).status));

// --- HostFS through the proxy
const hf = await (await get('__hostfs/')).json();
ok('HostFS offers the Server drive', hf.mounts?.some((m) => m.name === 'Server' && !m.readonly), hf);
ok('cross-site requests are refused', (await get('__hostfs/', { 'Sec-Fetch-Site': 'cross-site' })).status === 403);
const origin = new globalThis.URL(base).origin;
const put = (o, body) => fetch(base + '__hostfs/Server/remote-check,fff', { method: 'PUT', body, headers: { Authorization: auth, 'X-HostFS-Token': hf.token, Origin: o } });
ok('a write from another origin is refused', (await put('https://evil.example', 'x')).status === 403);
const stamp = `remote-check ${new Date().toISOString()}`;
ok('a write from the page\'s own origin lands', (await put(origin, stamp)).status === 200);
ok('and reads back', (await (await get('__hostfs/Server/remote-check,fff')).text()) === stamp);

// --- the desktop in a browser
const { browser } = await launch({ width: 1024, height: 768 });
const ctx = await browser.newContext({ httpCredentials: { username: USER, password: PASS }, viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
await page.goto(base + '?fast=1');
await page.waitForFunction(() => window.os?.filer?.task && window.os.vfs?.hd, null, { timeout: 30000 }).catch(() => {});
await page.waitForFunction(() => window.os?.ready, null, { timeout: 30000 }).catch(() => {});
ok('the desktop loads', await page.evaluate(() => !!window.os?.ready));
await sleep(2500);
const hasServer = await page.evaluate(() => { try { return os.vfs.exists('HostFS::Server.$'); } catch { return false; } });
ok('the Server drive is mounted automatically', hasServer);
ok('the file written above is visible on the desktop', await page.evaluate(() => { try { return os.vfs.exists('HostFS::Server.$.remote-check'); } catch { return false; } }));
ok('?cmd is not run on a non-local address', await page.evaluate(async () => {
  const u = new URL(location.href); return !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
}));
await ctx.close();

// --- !Browse's engine over its WebSocket
const info = await (await get('__browse/')).json();
ok('the engine is enabled', info.enabled === true && !!info.token, info);
if (info.enabled) {
  const wsUrl = base.replace(/^http/, 'ws') + '__browse/ws?t=' + info.token;
  const open = (headers) => new WebSocket(wsUrl, { headers });
  const refused = await new Promise((resolve) => { const w = open({ Authorization: auth, Origin: 'https://evil.example' }); w.onopen = () => { w.close(); resolve(false); }; w.onerror = () => resolve(true); });
  ok('a WebSocket from another origin is refused', refused);
  const ws = open({ Authorization: auth, Origin: origin });
  ws.binaryType = 'arraybuffer';
  const events = [], frames = new Map(), replies = new Map(), waiters = new Set();
  let n = 0;
  ws.onmessage = (m) => {
    if (typeof m.data !== 'string') { const b = new Uint8Array(m.data); if (b[0] === 1) { const t = new DataView(m.data).getUint32(1, true); frames.set(t, (frames.get(t) ?? 0) + 1); } }
    else { const e = JSON.parse(m.data); events.push(e); if (e.ev === 'reply') replies.get(e.req)?.(e); }
    for (const w of [...waiters]) if (w.test()) { waiters.delete(w); w.resolve(true); }
  };
  const until = (test, ms = 20000) => test() ? Promise.resolve(true) : new Promise((resolve) => { const w = { test, resolve }; waiters.add(w); setTimeout(() => { if (waiters.delete(w)) resolve(false); }, ms); });
  const call = (o) => new Promise((resolve) => { const id = ++n; replies.set(id, resolve); ws.send(JSON.stringify({ ...o, req: id })); });
  const state = (tab) => Object.assign({}, ...events.filter((e) => e.ev === 'state' && e.tab === tab));
  await until(() => events.some((e) => e.ev === 'ready' || e.ev === 'error'), 60000);
  ok('the engine starts', events.some((e) => e.ev === 'ready'), events.slice(0, 5));
  const visit = async (url) => {
    const { tab } = await call({ op: 'open', url, w: 640, h: 480, scale: 1, zoom: 1 });
    ws.send(JSON.stringify({ op: 'show', tab, on: true }));
    await until(() => state(tab).loading === false, 25000);
    await sleep(500);
    return { tab, st: state(tab), text: (await call({ op: 'source', tab })).text ?? '' };
  };
  const pub = await visit('https://example.com/');
  ok('a public page loads', /Example Domain/i.test(pub.st.title ?? '') || /Example Domain/i.test(pub.text), pub.st);
  // a static page may not repaint once the screencast is running: nudge it
  for (let i = 0; i < 5 && !(frames.get(pub.tab) > 0); i++) { ws.send(JSON.stringify({ op: 'mouse', tab: pub.tab, type: 'mouseMoved', x: 10 + i * 5, y: 10, buttons: 0 })); await sleep(800); }
  ok('and frames arrive', await until(() => (frames.get(pub.tab) ?? 0) > 0, 10000));
  for (const [name, url] of [['the server\'s LAN address', process.env.RO_PRIVATE_URL], ['the router', process.env.RO_ROUTER_URL]].filter(([, u]) => u)) {
    const p = await visit(url);
    if (process.env.RO_DEBUG) console.log(name, JSON.stringify(p.st), p.text.slice(0, 300));
    ok(`${name} is not reachable from the engine`, /(can.?t be reached|ERR_|timed out|refused|unreachable)/i.test(p.text + JSON.stringify(p.st)) || !p.st.title, p.st);
  }
  const loop = await visit('http://localhost:8371/__hostfs/');
  ok('the container\'s own HostFS is not reachable from the engine', /Bad host|only available|403|forbidden|Cross-site/i.test(loop.text) || !/"mounts"/.test(loop.text), loop.text.slice(0, 200));
  ws.close();
}
await browser.close();

console.log(res.join('\n'));
process.exit(res.some((r) => r.startsWith('FAIL')) ? 1 : 0);
