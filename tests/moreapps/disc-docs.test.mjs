// tools/disc-docs.mjs --check: builds $.Docs in memory and compares it
// with the disc and manifest.json, writing nothing. Run against the repo
// and against a temporary copy (DOCS_SRC / DOCS_DISC) with a changed
// guide, a stray file and a stale manifest.
import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'tools/disc-docs.mjs');
const DOCS = 'HardDisc4/Docs';

const run = (args, env = {}) => spawnSync(process.execPath,
  [SCRIPT, ...args], {env: {...process.env, ...env}, encoding: 'utf8'});

function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, {withFileTypes: true})) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = fs.readFileSync(p, 'latin1');
    }
  };
  walk(dir);
  return out;
}

describe('disc-docs --check', () => {
  it('passes against the repository and writes nothing', () => {
    const disc = path.join(ROOT, 'assets/disc');
    const mf = fs.readFileSync(path.join(disc, 'manifest.json'));
    const before = snapshot(path.join(disc, DOCS));
    const r = run(['--check']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(snapshot(path.join(disc, DOCS)), before);
    assert.ok(mf.equals(fs.readFileSync(path.join(disc, 'manifest.json'))));
  });

  describe('on a temporary copy', () => {
    let tmp, src, disc, env;
    before(() => {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-docs-'));
      src = path.join(tmp, 'docs');
      disc = path.join(tmp, 'disc');
      fs.cpSync(path.join(ROOT, 'tools/docs'), src, {recursive: true});
      fs.mkdirSync(path.join(disc, 'HardDisc4'), {recursive: true});
      fs.copyFileSync(path.join(ROOT, 'assets/disc/manifest.json'),
        path.join(disc, 'manifest.json'));
      fs.cpSync(path.join(ROOT, 'assets/disc', DOCS),
        path.join(disc, DOCS), {recursive: true});
      env = {DOCS_SRC: src, DOCS_DISC: disc};
    });
    after(() => fs.rmSync(tmp, {recursive: true, force: true}));

    it('passes on an identical copy', () => {
      const r = run(['--check'], env);
      assert.equal(r.status, 0, r.stdout + r.stderr);
    });

    it('names a changed guide and the manifest, writing nothing', () => {
      fs.appendFileSync(path.join(src, 'Contents'), 'One more line.\n');
      const before = snapshot(disc);
      const r = run(['--check'], env);
      assert.equal(r.status, 1);
      const out = r.stdout + r.stderr;
      assert.match(out, /HardDisc4\/Docs\/Contents/);
      assert.match(out, /manifest\.json/);
      assert.doesNotMatch(out, /HardDisc4\/Docs\/Letters\b/);
      assert.deepEqual(snapshot(disc), before);
    });

    it('names a new guide and a stray file on the disc', () => {
      fs.writeFileSync(path.join(src, 'NewGuide'), 'Hello.\n');
      fs.writeFileSync(path.join(disc, DOCS, 'Stray'), 'x');
      const r = run(['--check'], env);
      assert.equal(r.status, 1);
      const out = r.stdout + r.stderr;
      assert.match(out, /HardDisc4\/Docs\/NewGuide/);
      assert.match(out, /HardDisc4\/Docs\/Stray/);
    });

    it('the normal run writes what --check then accepts', () => {
      const r = run([], env);
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.ok(!fs.existsSync(path.join(disc, DOCS, 'Stray')));
      const c = run(['--check'], env);
      assert.equal(c.status, 0, c.stdout + c.stderr);
      const mf = JSON.parse(
        fs.readFileSync(path.join(disc, 'manifest.json'), 'utf8'));
      const d = mf.root.children.find((n) => n.name === 'Docs');
      assert.ok(d.children.some((n) => n.name === 'NewGuide'));
    });
  });
});
