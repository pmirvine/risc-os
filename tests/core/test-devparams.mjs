// ?cmd and ?run work only on a loopback host name (a link from another site must not run commands on the desktop)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devParamsAllowed } from '../../src/core/devparams.js';

test('loopback host names are allowed', () => {
  for (const h of ['localhost', 'LOCALHOST', '127.0.0.1', '[::1]', '::1']) assert.equal(devParamsAllowed(h), true, h);
});

test('everything else is refused', () => {
  for (const h of ['example.org', 'localhost.evil.test', 'evil.test', '127.0.0.1.evil.test', '192.168.20.5', '10.0.0.1', '', undefined, null, '0.0.0.0', 'foo.localhost']) assert.equal(devParamsAllowed(h), false, String(h));
});
