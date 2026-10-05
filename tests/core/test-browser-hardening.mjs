// Engine hardening: the /check probe refuses private targets, extra Chrome args, the idle timer. No Chrome needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { isPrivateAddress, frameCheck, parseBrowserArgs, makeIdleTimer, browserHandler } from '../../tools/browser-server.mjs';
import { makeTrust } from '../../tools/trust.mjs';

test('isPrivateAddress', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:192.168.1.1', '::ffff:c0a8:0101', '::ffff:7f00:1']) assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700::1111', '::ffff:8.8.8.8']) assert.equal(isPrivateAddress(ip), false, ip);
});

test('parseBrowserArgs: repeatable --browser-arg, RISCOS_BROWSER_ARGS, --browser-idle', () => {
  const was = process.env.RISCOS_BROWSER_ARGS;
  try {
    delete process.env.RISCOS_BROWSER_ARGS;
    let o = parseBrowserArgs(['--browser', '--browser-arg=--no-sandbox', '--browser-arg=--disable-dev-shm-usage']);
    assert.deepEqual(o.extraArgs, ['--no-sandbox', '--disable-dev-shm-usage']);
    assert.equal(o.idle, 300);
    assert.deepEqual(parseBrowserArgs(['--browser']).extraArgs, []);
    process.env.RISCOS_BROWSER_ARGS = '--a  --b=1\n--c';
    o = parseBrowserArgs(['--browser', '--browser-arg=--x']);
    assert.deepEqual(o.extraArgs, ['--x', '--a', '--b=1', '--c']);
    assert.equal(parseBrowserArgs(['--browser', '--browser-idle=0']).idle, 0);
    assert.equal(parseBrowserArgs(['--browser', '--browser-idle=45']).idle, 45);
    assert.equal(parseBrowserArgs(['--browser', '--browser-idle=junk']).idle, 300);
  } finally { if (was === undefined) delete process.env.RISCOS_BROWSER_ARGS; else process.env.RISCOS_BROWSER_ARGS = was; }
});

const never = () => { throw new Error('connected'); };
const refused = { frameable: null, reason: 'Private address' };

test('frameCheck refuses private literals and names without connecting', async () => {
  for (const u of ['http://127.0.0.1:1/', 'http://localhost/', 'http://[::1]/', 'http://[::ffff:10.0.0.1]/', 'http://169.254.169.254/latest']) {
    assert.deepEqual(await frameCheck(u, { fetch: never }), refused, u);
  }
  assert.deepEqual(await frameCheck('http://localhost/'), refused);
});

test('frameCheck refuses when any DNS answer is private', async () => {
  const lookup = async () => [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.5', family: 4 }];
  assert.deepEqual(await frameCheck('http://example.test/', { fetch: never, lookup }), refused);
});

test('frameCheck follows redirects by hand and re-checks every hop', async () => {
  const lookup = async (h) => [{ address: h === 'inner.test' ? '192.168.0.9' : '8.8.8.8', family: 4 }];
  const seen = [];
  const fetch = async (u, o) => {
    assert.equal(o.redirect, 'manual');
    seen.push(u);
    return new Response(null, { status: 302, headers: { location: 'http://inner.test/x' } });
  };
  assert.deepEqual(await frameCheck('http://pub.test/', { fetch, lookup }), refused);
  assert.deepEqual(seen, ['http://pub.test/']);
});

test('frameCheck gives up after 5 redirects, and reads framing headers at the end', async () => {
  const lookup = async () => [{ address: '8.8.8.8', family: 4 }];
  let n = 0;
  const loop = async () => new Response(null, { status: 301, headers: { location: `http://pub.test/${++n}` } });
  const r = await frameCheck('http://pub.test/', { fetch: loop, lookup });
  assert.equal(r.frameable, null);
  assert.equal(n, 6);                     // the first request plus 5 hops
  const ok = async () => new Response('', { status: 200, headers: { 'x-frame-options': 'DENY' } });
  assert.deepEqual(await frameCheck('http://pub.test/', { fetch: ok, lookup }), { frameable: false, reason: 'X-Frame-Options', url: 'http://pub.test/' });
  const fine = async () => new Response('', { status: 200 });
  assert.deepEqual(await frameCheck('http://pub.test/', { fetch: fine, lookup }), { frameable: true, url: 'http://pub.test/' });
  assert.equal((await frameCheck('ftp://x/')).frameable, false);
});

test('idle timer: fires after the delay, cancel stops it, 0 never arms', async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let fired = 0;
  const t = makeIdleTimer(0.03, () => { fired++; });
  t.arm(); t.cancel(); await wait(80);
  assert.equal(fired, 0);
  t.arm(); t.arm(); await wait(80);       // arming twice restarts, not doubles
  assert.equal(fired, 1);
  const off = makeIdleTimer(0, () => { fired++; });
  off.arm(); await wait(50);
  assert.equal(fired, 1);
});

test('--browser-check-private sets checkPrivate (off by default)', () => {
  assert.equal(parseBrowserArgs(['--browser']).checkPrivate, false);
  assert.equal(parseBrowserArgs(['--browser', '--browser-check-private']).checkPrivate, true);
});

// /__browse/check through the handler, from loopback, with the token from GET /__browse/
const PORT = 8371;
const checkVia = async (opts, trust) => {
  const { handle } = browserHandler({ enabled: false, ...opts }, PORT, trust);
  const call = async (path, extra = {}) => {
    const req = { socket: { remoteAddress: '127.0.0.1' }, headers: { host: `localhost:${PORT}`, ...extra }, method: 'GET', on() {} };
    const out = { code: null, body: '' };
    const res = { headersSent: false, writeHead(c) { out.code = c; this.headersSent = true; }, write() {}, end(b) { out.body += b ?? ''; } };
    await handle(req, res, new URL(path, 'http://x'));
    return JSON.parse(out.body);
  };
  const { token } = await call('/__browse/');
  return call('/__browse/check?url=' + encodeURIComponent('http://127.0.0.1:1/'), { 'x-browse-token': token });
};
const local = () => makeTrust({ publicUrl: null, secret: null }, PORT);

test('/__browse/check refuses private targets by default, not with checkPrivate, and again when public', async () => {
  assert.equal((await checkVia({}, local())).reason, 'Private address');
  const r = await checkVia({ checkPrivate: true }, local());
  assert.notEqual(r.reason, 'Private address');       // it tried to connect (and failed)
  const pub = makeTrust({ publicUrl: new URL('https://example.test/ro'), secret: 'a-long-enough-secret' }, PORT);
  assert.equal((await checkVia({ checkPrivate: true }, pub)).reason, 'Private address');
});

test('serve.mjs refuses --browser-check-private with --public-url', () => {
  const r = spawnSync(process.execPath, ['serve.mjs', '9', '--browser-check-private', '--public-url=https://example.test/'], { cwd: new URL('../..', import.meta.url).pathname, env: { ...process.env, RISCOS_PROXY_SECRET: 'a-long-enough-secret' }, encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--browser-check-private cannot be used with --public-url/);
});
