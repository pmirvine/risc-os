// Shared runner that lets `node --test tests/<area>` run an area's scripts. Most scripts are Playwright
// drivers (tests/core/shot.mjs actions, run.mjs scenarios, standalone checks) that print "FAIL ..." lines
// and page errors rather than using node:test, so each one runs in a child process and counts as failed if it
// exits non-zero, times out, or prints a failure / page error / HTTP 404.
//
// Browser scripts run with a temporary cwd and SHOTS pointing into it, so their screenshots do not
// overwrite the reference images in tests/screens/ (set KEEP_SHOTS=1 to write there instead).
// The static server is started on demand (URL / port 8371) and stopped afterwards.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const BASE = process.env.URL ?? 'http://localhost:8371/';
const BAD = [
  /PAGEERROR/, /^\s*FAIL\b/m, /SCRIPT ERROR/, /status of 404/, /^not ok\b/m, /^TIMEOUT$/m,
  /Uncaught|Unhandled/,
];

async function up() { try { return (await fetch(BASE)).ok; } catch { return false; } }

let server = null;
async function ensureServer() {
  if (await up()) return;
  server = spawn(process.execPath, ['serve.mjs'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 100));
}

/** Run `node args…` and resolve {code, out}. */
export function run(args, { browser = true, timeout = 240000, env = {} } = {}) {
  let cwd = ROOT;
  const e = { ...process.env, ...env };
  if (browser && !process.env.KEEP_SHOTS) {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'riscos-test-'));
    fs.mkdirSync(path.join(cwd, 'tests', 'screens'), { recursive: true });
    e.SHOTS = path.join(cwd, 'tests', 'screens');
    e.SHOTDIR = e.SHOTS;
  }
  const abs = args.map((a) => (/\.mjs$/.test(a) ? path.join(ROOT, a) : a));
  return new Promise((resolve) => {
    const p = spawn(process.execPath, abs, { cwd, env: e });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    const t = setTimeout(() => { out += '\nTIMEOUT\n'; p.kill(); }, timeout);
    p.on('close', (code) => {
      clearTimeout(t);
      if (cwd !== ROOT) fs.rmSync(cwd, { recursive: true, force: true });
      resolve({ code, out });
    });
  });
}

export function check({ code, out }, { allow = [] } = {}) {
  const lines = out.split('\n').filter((l) => BAD.some((re) => re.test(l)) && !allow.some((re) => re.test(l)));
  assert.ok(code === 0 && !lines.length, `exit ${code}\n${lines.slice(0, 20).join('\n') || out.slice(-2000)}`);
}

/**
 * suite('core', [ { name, args: ['tests/core/shot.mjs', 'x', 'tests/core/act-x.mjs'], browser, allow, timeout } … ])
 * Entries run CONCURRENCY (env, default 4) at a time.
 */
export function suite(title, entries) {
  describe(title, { concurrency: +(process.env.CONCURRENCY || 4) }, () => {
    before(ensureServer);
    after(() => server?.kill());
    for (const en of entries) {
      it(en.name, { timeout: (en.timeout ?? 240000) + 10000 }, async () => check(await run(en.args, en), en));
    }
  });
}

/** Entries for tests/core/shot.mjs action scripts in a directory (files matching `re`). */
export function actions(dir, re = /^act-.*\.mjs$/, skip = []) {
  return fs.readdirSync(path.join(ROOT, 'tests', dir)).filter((f) => re.test(f) && f !== 'index.mjs' && !skip.includes(f)).sort()
    .map((f) => ({ name: f, args: ['tests/core/shot.mjs', `${dir}-${f.replace(/\.mjs$/, '')}`, `tests/${dir}/${f}`] }));
}
