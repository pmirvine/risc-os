// serve.mjs behind a reverse proxy: --public-url plus RISCOS_PROXY_SECRET (tools/trust.mjs)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SECRET = 'a-long-enough-secret';
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
let dir, port, child;

const freePort = () => new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const req = (method, p, headers = {}, body) => new Promise((ok, fail) => {
  const r = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => ok({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
  });
  r.on('error', fail);
  r.end(body);
});
const proxied = (extra = {}) => ({ host: 'example.test', 'x-proxy-auth': SECRET, ...extra });

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proxy-mode-'));
  port = await freePort();
  child = spawn(process.execPath, ['serve.mjs', String(port), '--listen=127.0.0.1', '--public-url=https://example.test/ro', '--host', `Srv=${dir}`],
    { cwd: repo, env: { ...process.env, RISCOS_PROXY_SECRET: SECRET }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => {
    child.on('exit', (c) => fail(new Error(`serve.mjs exited ${c}`)));
    child.stdout.on('data', (d) => { if (/HostFS::Srv/.test(d)) ok(); });
  });
});
after(() => { child?.kill(); fs.rmSync(dir, { recursive: true, force: true }); });

test('loopback with a loopback Host and no secret is refused in public mode', async () => {
  for (const p of ['/__hostfs/', '/__browse/']) {
    assert.equal((await req('GET', p, { host: `localhost:${port}` })).status, 403, p);
    assert.equal((await req('GET', p, { host: `127.0.0.1:${port}` })).status, 403, p);
  }
});

test('loopback with the secret works (the proxy on the same machine)', async () => {
  assert.equal((await req('GET', '/__hostfs/', { host: `localhost:${port}`, 'x-proxy-auth': SECRET })).status, 200);
});

test('without --public-url plain loopback still works', async () => {
  const p2 = await freePort();
  const c = spawn(process.execPath, ['serve.mjs', String(p2), '--listen=127.0.0.1', '--host', `Srv=${dir}`], { cwd: repo, stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    await new Promise((ok, fail) => { c.on('exit', (x) => fail(new Error(`exit ${x}`))); c.stdout.on('data', (d) => { if (/HostFS::Srv/.test(d)) ok(); }); });
    const status = await new Promise((ok, fail) => http.get({ host: '127.0.0.1', port: p2, path: '/__hostfs/', headers: { host: `localhost:${p2}` } }, (r) => { r.resume(); ok(r.statusCode); }).on('error', fail));
    assert.equal(status, 200);
  } finally { c.kill(); }
});

test('the proxy (secret, public Host) gets the mount list', async () => {
  const r = await req('GET', '/__hostfs/', proxied());
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(r.body).mounts[0].name, 'Srv');
});

test('Host names match case-insensitively', async () => {
  const r = await req('GET', '/__hostfs/', proxied({ host: 'Example.Test' }));
  assert.equal(r.status, 200);
});

test('a foreign Host is refused', async () => {
  assert.equal((await req('GET', '/__hostfs/', proxied({ host: 'evil.test' }))).status, 403);
});

test('a cross-site request is refused', async () => {
  assert.equal((await req('GET', '/__hostfs/', proxied({ 'sec-fetch-site': 'cross-site' }))).status, 403);
});

test('!Browse engine follows the same rules', async () => {
  const ok = await req('GET', '/__browse/', proxied());
  assert.equal(ok.status, 200);
  assert.equal(JSON.parse(ok.body).enabled, false);
  assert.equal((await req('GET', '/__browse/', proxied({ host: 'evil.test' }))).status, 403);
});

test('writes need the token and an allowed Origin', async () => {
  const { token } = JSON.parse((await req('GET', '/__hostfs/', proxied())).body);
  const put = (origin) => req('PUT', '/__hostfs/Srv/a.txt', proxied({ 'x-hostfs-token': token, origin }), 'hi');
  assert.equal((await put('https://evil.test')).status, 403);
  assert.equal(fs.existsSync(path.join(dir, 'a.txt')), false);
  assert.equal((await put('https://example.test')).status, 200);
  assert.equal(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'hi');
  assert.equal((await put('https://Example.Test')).status, 200);
});

test('a sibling directory sharing the root as a prefix cannot be fetched', async () => {
  const r = await req('GET', `/..%2f${path.basename(repo)}-evil/x`, { host: `localhost:${port}` });
  assert.ok(r.status === 403 || r.status === 404, `status ${r.status}`);
});
