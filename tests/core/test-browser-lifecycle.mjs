// Chrome's lifecycle in the engine: stale profile locks, no overlap between an idle-stopped Chrome and the next one,
// no proxy secret in Chrome's environment, close-and-wait on shutdown. Fake child processes; no Chrome needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clearStaleProfileLocks, chromeEnv, stopChild, Service } from '../../tools/browser-server.mjs';

test('clearStaleProfileLocks removes the Singleton* entries, dangling symlinks included, and keeps the rest', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'prof-'));
  try {
    fs.symlinkSync('oldhost-1234', path.join(d, 'SingletonLock'));          // dangling: what Chromium leaves
    fs.symlinkSync('/nonexistent/socket', path.join(d, 'SingletonSocket'));
    fs.writeFileSync(path.join(d, 'SingletonCookie'), 'x');
    fs.writeFileSync(path.join(d, 'Preferences'), '{}');
    clearStaleProfileLocks(d);
    for (const n of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) assert.throws(() => fs.lstatSync(path.join(d, n)), { code: 'ENOENT' }, n);
    assert.ok(fs.existsSync(path.join(d, 'Preferences')));
    clearStaleProfileLocks(d);                                              // nothing there: no error
    clearStaleProfileLocks(path.join(d, 'missing'));                        // no profile yet: no error
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('chromeEnv strips the proxy secret and keeps the rest', () => {
  const e = chromeEnv({ RISCOS_PROXY_SECRET: 'sssssssssssssssssss', PATH: '/bin', HOME: '/h' });
  assert.equal('RISCOS_PROXY_SECRET' in e, false);
  assert.deepEqual(e, { PATH: '/bin', HOME: '/h' });
});

const fake = () => { const c = new EventEmitter(); c.exited = false; c.signals = []; c.kill = (s = 'SIGTERM') => { c.signals.push(s); }; return c; };

test('stopChild resolves on exit, and sends SIGKILL after the timeout', async () => {
  const a = fake();
  const p = stopChild(a, 1000);
  assert.deepEqual(a.signals, ['SIGTERM']);
  a.exited = true; a.emit('exit');
  await p;
  assert.deepEqual(a.signals, ['SIGTERM']);
  const b = fake();
  await stopChild(b, 20);
  assert.deepEqual(b.signals, ['SIGTERM', 'SIGKILL']);
  const c = fake(); c.exited = true;
  await stopChild(c, 20);
  assert.deepEqual(c.signals, []);
});

test('after idleStop, ensure() waits for the old Chrome to exit before launching', async () => {
  const svc = new Service({ enabled: true, idle: 0 });
  const old = fake();
  svc.chrome = old;
  let launched = 0;
  svc.launch = async () => { launched++; svc.chrome = fake(); };
  svc.idleStop();
  assert.deepEqual(old.signals, ['SIGTERM']);
  const e = svc.ensure();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(launched, 0, 'must not start while the old one is still exiting');
  old.exited = true; old.emit('exit');
  await e;
  assert.equal(launched, 1);
});

test('close() asks Chrome to close and waits for it; no Chrome: returns at once', async () => {
  const svc = new Service({ enabled: true, idle: 0 });
  await svc.close();
  const c = fake();
  c.send = async (m) => { c.asked = m; setTimeout(() => { c.exited = true; c.emit('exit'); }, 10); };
  svc.chrome = c;
  await svc.close();
  assert.equal(c.asked, 'Browser.close');
  assert.deepEqual(c.signals, []);
});
