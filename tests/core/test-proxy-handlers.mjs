// The proxy secret through the handlers themselves: a peer that is NOT loopback (the Docker bridge, say) gets in
// only with the right X-Proxy-Auth and the public Host. Fake req/res, so the peer address can be chosen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostfsHandler } from '../../tools/hostfs-server.mjs';
import { browserHandler } from '../../tools/browser-server.mjs';
import { makeTrust } from '../../tools/trust.mjs';

const SECRET = 'a-long-enough-secret';
const PORT = 8371;
const trust = makeTrust({ publicUrl: new URL('https://example.test/ro'), secret: SECRET }, PORT);

const call = async (handle, path, headers) => {
  const req = { socket: { remoteAddress: '172.17.0.1' }, headers, method: 'GET', on() {} };
  const out = { code: null, body: '' };
  const res = { headersSent: false, writeHead(c) { out.code = c; this.headersSent = true; }, write() {}, end(b) { out.body += b ?? ''; } };
  await handle(req, res, new URL(path, 'http://x'));
  return out;
};

const cases = [
  ['hostfs', () => hostfsHandler([], PORT, trust), '/__hostfs/'],
  ['!Browse', () => browserHandler({ enabled: false }, PORT, trust).handle, '/__browse/'],
];
for (const [name, make, path] of cases) {
  test(`${name}: a non-loopback peer needs the proxy secret and the public Host`, async () => {
    const handle = make();
    const good = { host: 'example.test', 'x-proxy-auth': SECRET };
    assert.equal((await call(handle, path, { host: 'example.test' })).code, 403, 'no secret');
    assert.equal((await call(handle, path, { ...good, 'x-proxy-auth': 'x'.repeat(SECRET.length) })).code, 403, 'wrong secret');
    assert.equal((await call(handle, path, { ...good, 'x-proxy-auth': 'short' })).code, 403, 'different length');
    assert.equal((await call(handle, path, { ...good, host: 'evil.test' })).code, 403, 'wrong Host');
    const ok = await call(handle, path, good);
    assert.equal(ok.code, 200);
    assert.ok(JSON.parse(ok.body).token);
  });
}
