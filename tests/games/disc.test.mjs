// tools/disc-gamelib.mjs: the library in $.!Boot.Resources.!GameLib, run
// against a temporary disc root (GAMES_DISC) and the --check of the
// sources (GAMES_SRC pointing at a temporary copy with mistakes in it).
import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'tools/disc-gamelib.mjs');
const run = (args, env = {}) => spawnSync(process.execPath,
  [SCRIPT, ...args], {env: {...process.env, ...env}, encoding: 'utf8'});
const node = (m, names) => names.reduce(
  (n, name) => n?.children?.find((c) => c.name === name), m.root);

// every file under dir -> its bytes (as latin1 text), by relative path
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

describe('disc-gamelib --check', () => {
  it('passes on the real sources', () => {
    const r = run(['--check']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /gamelib: !GameLib \d+ files;/);
  });

  it('reports tabs, long lines and files, riscos, import text', () => {
    const src = fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-src-'));
    try {
      const lib = path.join(src, '!GameLib');
      fs.mkdirSync(lib, {recursive: true});
      fs.writeFileSync(path.join(lib, 'Tab'), 'a\tb\n');
      fs.writeFileSync(path.join(lib, 'Long'),
        'ok\n' + 'x'.repeat(73) + '\n');
      fs.writeFileSync(path.join(lib, 'Big'), 'x\n'.repeat(251));
      fs.writeFileSync(path.join(lib, 'Os'), '// uses riscos\n');
      fs.writeFileSync(path.join(lib, 'Imp'),
        "// import x from 'y'\n");
      fs.writeFileSync(path.join(lib, 'Fine'), 'x'.repeat(72) + '\n'
        + "import {Rng} from 'gamelib/Maths';\n" + 'x\n'.repeat(240));
      const r = run(['--check'], {GAMES_SRC: src});
      assert.equal(r.status, 1);
      assert.match(r.stderr, /!GameLib\/Tab: only Latin-1/);
      assert.match(r.stderr, /!GameLib\/Long:2: longer than 72/);
      assert.match(r.stderr, /!GameLib\/Big: 251 lines/);
      assert.match(r.stderr, /!GameLib\/Os:1: 'riscos'/);
      assert.match(r.stderr, /!GameLib\/Imp:1: .*import/);
      assert.doesNotMatch(r.stderr, /Fine/);
    } finally { fs.rmSync(src, {recursive: true, force: true}); }
  });
});

describe('disc-gamelib on a disc root', () => {
  let tmp, others;
  const RES = ['!Boot', 'Resources'];
  const LIB = 'HardDisc4/=21Boot/Resources/=21GameLib';
  const mf = () => JSON.parse(
    fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8'));

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-disc-'));
    const m = {files: 0, totalBytes: 0, root: {name: '$', children: [
      {name: '!Boot', type: 'dir', children: [
        {name: 'Resources', type: 'dir', children: [
          {name: '!WimpLib', type: 'app', children: []},
          {name: 'Zebra', type: 'f81', size: 0, placeholder: true},
        ]}]}]}};
    others = JSON.stringify(node(m, RES).children);
    fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(m));
  });
  after(() => fs.rmSync(tmp, {recursive: true, force: true}));

  it('builds !Boot.Resources.!GameLib after !WimpLib, typed', () => {
    const r = run([], {GAMES_DISC: tmp});
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^gamelib: /);
    const m = mf();
    const names = node(m, RES).children.map((c) => c.name);
    assert.deepEqual(names, ['!GameLib', '!WimpLib', 'Zebra'].sort(
      (a, b) => a.localeCompare(b, 'en', {sensitivity: 'base'})));
    assert.ok(names.indexOf('!GameLib') < names.indexOf('Zebra'));
    assert.equal(node(m, [...RES, '!GameLib']).type, 'app');
    const type = (n) => node(m, [...RES, '!GameLib', n])?.type;
    assert.equal(type('!Boot'), 'feb');
    assert.equal(type('!Run'), 'feb');
    assert.equal(type('!Help'), 'fff');
    assert.equal(type('!Sprites'), 'ff9');
    for (const n of ['Maths', 'Loop', 'Surface', 'Display', 'Keys',
      'Audio', 'ScoreTable']) assert.equal(type(n), 'f81', n);
    const boot = fs.readFileSync(path.join(tmp, LIB, '=21Boot'), 'latin1');
    assert.match(boot,
      /^If "<GameLib\$Dir>" = "" Then Set GameLib\$Dir <Obey\$Dir>$/m);
    assert.match(boot, /^If "<GameLib\$Path>" = "" Then Set GameLib\$Path <GameLib\$Dir>\.$/m);
    assert.match(boot, /^Set GameLib\$Version 1\.00$/m);
  });

  it('leaves the other entries as they were', () => {
    const res = node(mf(), RES);
    assert.equal(JSON.stringify(
      res.children.filter((c) => c.name !== '!GameLib')), others);
  });

  it('draws the !gamelib sprites, 34 and 18 pixels square', () => {
    const b = fs.readFileSync(path.join(tmp, LIB, '=21Sprites'));
    const got = {};
    for (let i = 0, o = b.readUInt32LE(4) - 4; i < b.readUInt32LE(0); i++) {
      const name = b.toString('latin1', o + 4, o + 16).replace(/\0+$/, '');
      const w = (b.readUInt32LE(o + 16) + 1) * 8
        - (31 - b.readUInt32LE(o + 28)) / 4;
      got[name] = [w, b.readUInt32LE(o + 20) + 1];
      o += b.readUInt32LE(o);
    }
    assert.deepEqual(got, {'!gamelib': [34, 34], 'sm!gamelib': [18, 18]});
  });

  it('changes nothing when run again', () => {
    const first = snapshot(tmp);
    const r = run([], {GAMES_DISC: tmp});
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(snapshot(tmp), first);
  });

  it('keeps the manifest totals consistent', () => {
    const m = mf();
    let files = 0, bytes = 0;
    const walk = (n) => {
      for (const c of n.children ?? []) {
        if (c.children) walk(c);
        else if (!c.placeholder) { files++; bytes += c.size ?? 0; }
      }
    };
    walk(m.root);
    assert.equal(m.files, files);
    assert.equal(m.totalBytes, bytes);
  });
});

// tools/disc-pacman.mjs: !Pacman in $.Diversions, its --check, and the
// same five faults as disc-gamelib (also in !RunImage, which the unit
// rules test skips).
describe('disc-pacman --check', () => {
  const pac = (args, env) => spawnSync(process.execPath,
    [path.join(ROOT, 'tools/disc-pacman.mjs'), ...args],
    {env: {...process.env, ...env}, encoding: 'utf8'});

  it('passes on the real sources', () => {
    const r = pac(['--check']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /pacman: !Pacman \d+ files;/);
  });

  it('reports tabs, long lines and files, riscos, import text', () => {
    const src = fs.mkdtempSync(path.join(os.tmpdir(), 'pacman-src-'));
    try {
      const app = path.join(src, '!Pacman');
      fs.mkdirSync(app, {recursive: true});
      fs.writeFileSync(path.join(app, 'Tab'), 'a\tb\n');
      fs.writeFileSync(path.join(app, 'Long'),
        'ok\n' + 'x'.repeat(73) + '\n');
      fs.writeFileSync(path.join(app, 'Big'), 'x\n'.repeat(251));
      fs.writeFileSync(path.join(app, 'Os'), '// uses riscos\n');
      fs.writeFileSync(path.join(app, 'Imp'), "// import x from 'y'\n");
      // the shell may import riscos, but only in an import line
      fs.writeFileSync(path.join(app, '!RunImage'),
        "import { os } from 'riscos';\n// the riscos shell\n"
        + 'y'.repeat(73) + '\n');
      fs.writeFileSync(path.join(app, 'Fine'), 'x'.repeat(72) + '\n'
        + "import {Rng} from 'gamelib/Maths';\n" + 'x\n'.repeat(240));
      const r = pac(['--check'], {GAMES_SRC: src});
      assert.equal(r.status, 1);
      assert.match(r.stderr, /!Pacman\/Tab: only Latin-1/);
      assert.match(r.stderr, /!Pacman\/Long:2: longer than 72/);
      assert.match(r.stderr, /!Pacman\/Big: 251 lines/);
      assert.match(r.stderr, /!Pacman\/Os:1: 'riscos'/);
      assert.match(r.stderr, /!Pacman\/Imp:1: .*import/);
      assert.match(r.stderr, /!Pacman\/!RunImage:2: 'riscos'/);
      assert.match(r.stderr, /!Pacman\/!RunImage:3: longer than 72/);
      assert.doesNotMatch(r.stderr, /!RunImage:1:/);
      assert.doesNotMatch(r.stderr, /Fine/);
    } finally { fs.rmSync(src, {recursive: true, force: true}); }
  });
});

describe('disc-pacman on a disc root', () => {
  let tmp, others;
  const DIV = ['Diversions'];
  const APP = 'HardDisc4/Diversions/=21Pacman';
  const pac = (env) => spawnSync(process.execPath,
    [path.join(ROOT, 'tools/disc-pacman.mjs')],
    {env: {...process.env, ...env}, encoding: 'utf8'});
  const mf = () => JSON.parse(
    fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8'));

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pacman-disc-'));
    const m = {files: 0, totalBytes: 0, root: {name: '$', children: [
      {name: 'Diversions', type: 'dir', children: [
        {name: '!Lander', type: 'app', children: []},
        {name: '!Lander2', type: 'app', children: []},
        {name: '!Zarch', type: 'app', children: []},
        {name: 'Zebra', type: 'f81', size: 0, placeholder: true},
      ]}]}};
    others = JSON.stringify(node(m, DIV).children);
    fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(m));
  });
  after(() => fs.rmSync(tmp, {recursive: true, force: true}));

  it('builds Diversions.!Pacman in name order, typed', () => {
    const r = pac({GAMES_DISC: tmp});
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^pacman: /);
    const m = mf();
    const names = node(m, DIV).children.map((c) => c.name);
    assert.deepEqual(names, ['!Lander', '!Lander2', '!Pacman', '!Zarch',
      'Zebra']);
    assert.equal(node(m, [...DIV, '!Pacman']).type, 'app');
    const type = (n) => node(m, [...DIV, '!Pacman', n])?.type;
    assert.equal(type('!Boot'), 'feb');
    assert.equal(type('!Run'), 'feb');
    assert.equal(type('!Help'), 'fff');
    assert.equal(type('!Sprites'), 'ff9');
    assert.equal(type('!RunImage'), 'f81');
    assert.equal(type('Game'), 'f81');
    const run = fs.readFileSync(path.join(tmp, APP, '=21Run'), 'latin1');
    assert.match(run, /^Set Pacman\$Dir <Obey\$Dir>$/m);
    assert.match(run, /^IconSprites <Pacman\$Dir>\.!Sprites$/m);
    assert.match(run, /^WimpSlot -min 512K -max 512K$/m);
    assert.match(run, /^Run <Pacman\$Dir>\.!RunImage %\*0$/m);
  });

  it('leaves the other Diversions entries as they were', () => {
    assert.equal(JSON.stringify(node(mf(), DIV).children
      .filter((c) => c.name !== '!Pacman')), others);
  });

  it('draws the !pacman sprites, 34 and 18 pixels square', () => {
    const b = fs.readFileSync(path.join(tmp, APP, '=21Sprites'));
    const got = {};
    for (let i = 0, o = b.readUInt32LE(4) - 4; i < b.readUInt32LE(0); i++) {
      const name = b.toString('latin1', o + 4, o + 16).replace(/\0+$/, '');
      const w = (b.readUInt32LE(o + 16) + 1) * 8
        - (31 - b.readUInt32LE(o + 28)) / 4;
      got[name] = [w, b.readUInt32LE(o + 20) + 1];
      o += b.readUInt32LE(o);
    }
    assert.deepEqual(got, {'!pacman': [34, 34], 'sm!pacman': [18, 18]});
  });

  it('changes nothing when run again', () => {
    const first = snapshot(tmp);
    const r = pac({GAMES_DISC: tmp});
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(snapshot(tmp), first);
  });

  it('keeps the manifest totals consistent', () => {
    const m = mf();
    let files = 0, bytes = 0;
    const walk = (n) => {
      for (const c of n.children ?? []) {
        if (c.children) walk(c);
        else if (!c.placeholder) { files++; bytes += c.size ?? 0; }
      }
    };
    walk(m.root);
    assert.equal(m.files, files);
    assert.equal(m.totalBytes, bytes);
  });
});
