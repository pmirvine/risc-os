// node --test tests/core/test-trust.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTrustArgs, makeTrust } from '../../tools/trust.mjs';

const SECRET = '0123456789abcdef0123';
const req = (remoteAddress, headers = {}) => ({ socket: { remoteAddress }, headers });
const pub = () => makeTrust(parseTrustArgs(['--public-url=https://example.test/ro/'], { RISCOS_PROXY_SECRET: SECRET }), 8080);
const local = () => makeTrust({ publicUrl: null, secret: null }, 8080);

test('loopback peer is allowed without secret', () => {
  for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal(local().allowedRemote(req(a)), true, a);
});

test('non-loopback peer without secret refused', () => {
  assert.equal(local().allowedRemote(req('192.168.20.5')), false);
  assert.equal(local().allowedRemote(req('172.17.0.1', { 'x-proxy-auth': SECRET })), false);   // header ignored with no public URL
});

test('public mode accepts the right secret', () => {
  assert.equal(pub().allowedRemote(req('172.17.0.1', { 'x-proxy-auth': SECRET })), true);
});

test('wrong secret refused', () => {
  assert.equal(pub().allowedRemote(req('172.17.0.1', { 'x-proxy-auth': 'x'.repeat(SECRET.length) })), false);
  assert.equal(pub().allowedRemote(req('172.17.0.1')), false);
});

test('secret of different length refused (no throw)', () => {
  assert.equal(pub().allowedRemote(req('172.17.0.1', { 'x-proxy-auth': 'short' })), false);
  assert.equal(pub().allowedRemote(req('172.17.0.1', { 'x-proxy-auth': SECRET + 'x' })), false);
});

test('x-forwarded-for/host headers never grant access', () => {
  const h = { 'x-forwarded-for': '127.0.0.1', 'x-forwarded-host': 'localhost:8080', 'x-real-ip': '127.0.0.1' };
  assert.equal(local().allowedRemote(req('10.0.0.9', h)), false);
  assert.equal(pub().allowedRemote(req('10.0.0.9', h)), false);
});

test('public host and origin are accepted only in public mode', () => {
  const p = pub(), l = local();
  assert.ok(p.hosts.has('example.test') && p.origins.has('https://example.test'));
  assert.ok(!l.hosts.has('example.test') && !l.origins.has('https://example.test'));
  for (const t of [p, l]) {
    for (const h of ['localhost:8080', '127.0.0.1:8080', '[::1]:8080']) {
      assert.ok(t.hosts.has(h), h);
      assert.ok(t.origins.has(`http://${h}`), h);
    }
  }
  const q = makeTrust(parseTrustArgs(['--public-url=https://example.org:8443/'], { RISCOS_PROXY_SECRET: SECRET }), 1);
  assert.ok(q.hosts.has('example.org:8443') && q.origins.has('https://example.org:8443'));
});

test('public-url without secret throws', () => {
  assert.throws(() => parseTrustArgs(['--public-url=https://a.example/'], {}));
  assert.throws(() => parseTrustArgs(['--public-url=https://a.example/'], { RISCOS_PROXY_SECRET: 'tooshort' }));
  assert.deepEqual(parseTrustArgs([], {}), { publicUrl: null, secret: null });
});

test('http(s) only', () => {
  assert.throws(() => parseTrustArgs(['--public-url=ftp://a.example/'], { RISCOS_PROXY_SECRET: SECRET }));
  assert.throws(() => parseTrustArgs(['--public-url=nonsense'], { RISCOS_PROXY_SECRET: SECRET }));
  assert.doesNotThrow(() => parseTrustArgs(['--public-url=http://a.example/'], { RISCOS_PROXY_SECRET: SECRET }));
});

test('isPublic says whether a public URL is set', () => {
  assert.equal(pub().isPublic, true);
  assert.equal(local().isPublic, false);
});

test('public mode: a loopback peer needs the secret too (the engine\'s own Chrome is loopback)', () => {
  for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    assert.equal(pub().allowedRemote(req(a)), false, a);
    assert.equal(pub().allowedRemote(req(a, { 'x-proxy-auth': 'x'.repeat(SECRET.length) })), false, a);
    assert.equal(pub().allowedRemote(req(a, { 'x-proxy-auth': SECRET })), true, a);
  }
});
