// tools/disc-moreapps.mjs: $.MoreApps on the seed disc and its boot wiring,
// run against a temporary disc root (MOREAPPS_DISC) holding only the
// manifest and the four boot files, and the --check of the sources
// (MOREAPPS_SRC pointing at a temporary copy with mistakes in it).
// tools/disc-wimplib.mjs: the library in $.!Boot.Resources.!WimpLib, the
// same way (the two scripts share MOREAPPS_SRC and MOREAPPS_DISC).
import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'tools/disc-moreapps.mjs');
const LIBSCRIPT = path.join(ROOT, 'tools/disc-wimplib.mjs');
const DISC = path.join(ROOT, 'assets/disc');
const BOOT = ['HardDisc4/=21Boot/Choices/Boot',
  'HardDisc4/Utilities/=21ResetBoot/Choices/Boot'];
const LEAVES = ['Desktop', 'PreDesktop'];
const MORE = /Boot:\^\.MoreApps/;

const run = (args, env = {}, script = SCRIPT) => spawnSync(process.execPath,
  [script, ...args], {env: {...process.env, ...env}, encoding: 'utf8'});
const runLib = (args, env = {}) => run(args, env, LIBSCRIPT);
const byName = (a, b) =>
  a.name.localeCompare(b.name, 'en', {sensitivity: 'base'});
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

// the manifest's file count and total size match its entries
function assertTotals(m) {
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
}

// each file entry under n is on the disc root, with its size
function assertOnDisc(root, n) {
  for (const c of n.children ?? []) {
    if (c.children) { assertOnDisc(root, c); continue; }
    assert.equal(fs.statSync(path.join(root, c.path)).size, c.size, c.path);
  }
}

describe('disc-moreapps --check', () => {
  it('passes on the real sources', () => {
    const r = run(['--check']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /moreapps: !Word \d+ files;/);
    assert.doesNotMatch(r.stdout, /WimpLib/);
  });

  it('reports a tab, a non-Latin-1 character and a long line', () => {
    const src = fs.mkdtempSync(path.join(os.tmpdir(), 'moreapps-src-'));
    try {
      fs.mkdirSync(path.join(src, '!Word'));
      fs.writeFileSync(path.join(src, '!Word/Tabbed'), 'a\tb\n');
      fs.writeFileSync(path.join(src, '!Word/Wide'), 'x Ā y\n');
      fs.writeFileSync(path.join(src, '!Word/Long'),
        'ok\n' + 'x'.repeat(73) + '\n');
      fs.writeFileSync(path.join(src, '!Word/Fine'), 'x'.repeat(72));
      const r = run(['--check'], {MOREAPPS_SRC: src});
      assert.equal(r.status, 1);
      assert.match(r.stderr, /!Word\/Tabbed: only Latin-1/);
      assert.match(r.stderr, /!Word\/Wide: only Latin-1/);
      assert.match(r.stderr, /!Word\/Long:2: longer than 72/);
      assert.doesNotMatch(r.stderr, /Fine/);
    } finally { fs.rmSync(src, {recursive: true, force: true}); }
  });
});

describe('disc-moreapps on a disc root', () => {
  let tmp;
  const original = {};           // the unpatched boot files
  const mf = () => JSON.parse(
    fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8'));
  const OLD = 'HardDisc4/MoreApps/WimpLib';

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moreapps-disc-'));
    // the manifest with only the old MoreApps.WimpLib (where the library
    // was before it moved to !Boot.Resources), the boot files without
    // the MoreApps lines
    const m = JSON.parse(
      fs.readFileSync(path.join(DISC, 'manifest.json'), 'utf8'));
    fs.mkdirSync(path.join(tmp, OLD), {recursive: true});
    fs.writeFileSync(path.join(tmp, OLD, 'Zip'), 'export {};\n');
    m.root.children = m.root.children.filter((c) => c.name !== 'MoreApps');
    m.root.children.push({name: 'MoreApps', type: 'dir', children: [
      {name: 'WimpLib', type: 'dir', children: [
        {name: 'Zip', type: 'f81', size: 11, path: OLD + '/Zip'}]}]});
    m.root.children.sort(byName);
    fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(m));
    for (const d of BOOT) {
      fs.mkdirSync(path.join(tmp, d), {recursive: true});
      for (const leaf of LEAVES) {
        const rel = `${d}/${leaf}`;
        const s = fs.readFileSync(path.join(DISC, rel), 'latin1')
          .split('\n').filter((l) => !MORE.test(l)).join('\n');
        original[rel] = s;
        fs.writeFileSync(path.join(tmp, rel), s, 'latin1');
      }
    }
  });
  after(() => fs.rmSync(tmp, {recursive: true, force: true}));

  it('starts with no MoreApps lines in the boot files', () => {
    for (const s of Object.values(original)) {
      assert.equal(s.split('\n').filter((l) => MORE.test(l)).length, 0);
    }
  });

  it('builds MoreApps.!Word and removes the old MoreApps.WimpLib', () => {
    const r = run([], {MOREAPPS_DISC: tmp});
    assert.equal(r.status, 0, r.stderr);
    const m = mf();
    const more = node(m, ['MoreApps']);
    assert.equal(more.type, 'dir');
    const names = m.root.children.map((c) => c.name);
    assert.ok(names.indexOf('Manuals') < names.indexOf('MoreApps'));
    assert.ok(names.indexOf('MoreApps') < names.indexOf('Printing'));
    const app = node(m, ['MoreApps', '!Word']);
    assert.equal(app.type, 'app');
    const type = (n) => node(m, ['MoreApps', '!Word', ...n.split('.')]).type;
    assert.equal(type('!Run'), 'feb');
    assert.equal(type('!Boot'), 'feb');
    assert.equal(type('!Help'), 'fff');
    assert.equal(type('!RunImage'), 'f81');
    assert.equal(type('!Sprites'), 'ff9');
    assert.equal(type('Model'), 'f81');
    assert.equal(type('Fonts'), 'dir');
    assert.equal(type('Fonts.Carlito-Regular'), 'ffd');
    assert.equal(type('Fonts.Licences'), 'fff');
    // the library is not in MoreApps any more (tools/disc-wimplib.mjs)
    assert.deepEqual(more.children.map((c) => c.name), ['!Word']);
    assert.ok(!fs.existsSync(path.join(tmp, OLD)));
    // !Word imports the library by name, not as '../WimpLib/...'
    const pkg = fs.readFileSync(
      path.join(tmp, 'HardDisc4/MoreApps/=21Word/Package'), 'latin1');
    assert.match(pkg, /from 'wimplib\/Zip'/);
    assert.doesNotMatch(pkg, /\.\.\/WimpLib/);
    assertOnDisc(tmp, more);
    assert.ok(fs.existsSync(
      path.join(tmp, 'HardDisc4/MoreApps/=21Word/=21RunImage')));
  });

  it('adds exactly one line to each boot file, after its anchor', () => {
    const m = mf();
    for (const [rel, before] of Object.entries(original)) {
      const now = fs.readFileSync(path.join(tmp, rel), 'latin1');
      const lines = now.split('\n');
      const at = lines.findIndex((l) => MORE.test(l));
      assert.equal(lines.filter((l) => MORE.test(l)).length, 1, rel);
      assert.match(lines[at - 1],
        rel.endsWith('PreDesktop') ? /Boot:\^\.Apps\.!\*/ : /Utilities/);
      lines.splice(at, 1);
      assert.equal(lines.join('\n'), before, rel);
      const entry = node(m, rel.replace('HardDisc4/', '').split('/')
        .map((s) => s.replace('=21', '!')));
      assert.equal(entry.size, Buffer.byteLength(now, 'latin1'), rel);
    }
  });

  it('changes nothing when run again', () => {
    const first = snapshot(tmp);
    const r = run([], {MOREAPPS_DISC: tmp});
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(snapshot(tmp), first);
    for (const rel of Object.keys(original)) {
      const s = fs.readFileSync(path.join(tmp, rel), 'latin1');
      assert.equal(s.split('\n').filter((l) => MORE.test(l)).length, 1);
    }
  });

  it('keeps the manifest totals consistent', () => assertTotals(mf()));
});

describe('disc-wimplib --check', () => {
  it('passes on the real sources', () => {
    const r = runLib(['--check']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /wimplib: !WimpLib \d+ files;/);
  });

  it('reports tabs, CRs, non-Latin-1, long lines and files, riscos', () => {
    const src = fs.mkdtempSync(path.join(os.tmpdir(), 'wimplib-src-'));
    try {
      const lib = path.join(src, '!WimpLib');
      fs.mkdirSync(path.join(lib, 'Sub'), {recursive: true});
      fs.writeFileSync(path.join(lib, '!Boot'), 'Set A$B\tC\n');
      fs.writeFileSync(path.join(lib, 'Wide'), 'x Ā y\n');
      fs.writeFileSync(path.join(lib, 'CR'), 'a\r\nb\n');
      fs.writeFileSync(path.join(lib, 'Sub/Long'),
        'ok\n' + 'x'.repeat(73) + '\n');
      fs.writeFileSync(path.join(lib, 'Big'), 'x\n'.repeat(251));
      fs.writeFileSync(path.join(lib, 'Os'), '// uses riscos\n');
      fs.writeFileSync(path.join(lib, 'Fine'), 'x'.repeat(72) + '\n'
        + "import {print} from 'riscos';\n" + 'x\n'.repeat(240));
      const r = runLib(['--check'], {MOREAPPS_SRC: src});
      assert.equal(r.status, 1);
      assert.match(r.stderr, /!WimpLib\/!Boot: only Latin-1/);
      assert.match(r.stderr, /!WimpLib\/Wide: only Latin-1/);
      assert.match(r.stderr, /!WimpLib\/CR: only Latin-1/);
      assert.match(r.stderr, /!WimpLib\/Sub\/Long:2: longer than 72/);
      assert.match(r.stderr, /!WimpLib\/Big: 251 lines/);
      assert.match(r.stderr, /!WimpLib\/Os:1: 'riscos'/);
      assert.doesNotMatch(r.stderr, /Fine/);
    } finally { fs.rmSync(src, {recursive: true, force: true}); }
  });
});

describe('disc-wimplib on a disc root', () => {
  let tmp, others;
  const RES = ['!Boot', 'Resources'];
  const LIB = 'HardDisc4/=21Boot/Resources/=21WimpLib';
  const mf = () => JSON.parse(
    fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8'));

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wimplib-disc-'));
    // the real manifest without !WimpLib, and a stray file in the
    // library's directory (which the script replaces)
    const m = JSON.parse(
      fs.readFileSync(path.join(DISC, 'manifest.json'), 'utf8'));
    const res = node(m, RES);
    res.children = res.children.filter((c) => c.name !== '!WimpLib');
    others = JSON.stringify(res.children);
    fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(m));
    fs.mkdirSync(path.join(tmp, LIB), {recursive: true});
    fs.writeFileSync(path.join(tmp, LIB, 'Stray'), 'x');
  });
  after(() => fs.rmSync(tmp, {recursive: true, force: true}));

  it('builds !Boot.Resources.!WimpLib with its file types', () => {
    const r = runLib([], {MOREAPPS_DISC: tmp});
    assert.equal(r.status, 0, r.stderr);
    const m = mf();
    const lib = node(m, [...RES, '!WimpLib']);
    assert.equal(lib.type, 'app');
    const type = (n) => node(m, [...RES, '!WimpLib', n])?.type;
    assert.equal(type('!Boot'), 'feb');
    assert.equal(type('!Run'), 'feb');
    assert.equal(type('!Help'), 'fff');
    assert.equal(type('!Sprites'), 'ff9');
    for (const n of ['Zip', 'Crc32', 'ZipError', 'ZipRead', 'ZipWrite',
      'ZipNames', 'Xml', 'XmlParse', 'XmlText', 'XmlWrite']) {
      assert.equal(type(n), 'f81', n);
    }
    assert.equal(type('Stray'), undefined);
    assert.ok(!fs.existsSync(path.join(tmp, LIB, 'Stray')));
    assertOnDisc(tmp, lib);
    const boot = fs.readFileSync(path.join(tmp, LIB, '=21Boot'), 'latin1');
    assert.match(boot,
      /^If "<WimpLib\$Dir>" = "" Then Set WimpLib\$Dir <Obey\$Dir>$/m);
    assert.match(boot, /^If "<WimpLib\$Path>" = "" Then Set WimpLib\$Path <WimpLib\$Dir>\.$/m);
    assert.match(boot, /^IconSprites <Obey\$Dir>\.!Sprites$/m);
    assert.match(boot, /^Set WimpLib\$Version \d+\.\d\d$/m);
  });

  it('leaves the rest of !Boot.Resources as it was, in order', () => {
    const res = node(mf(), RES);
    const names = res.children.map((c) => c.name);
    assert.equal(JSON.stringify(
      res.children.filter((c) => c.name !== '!WimpLib')), others);
    const at = names.indexOf('!WimpLib');
    assert.ok(at > 0 && byName(res.children[at - 1], res.children[at]) < 0);
    assert.ok(at === names.length - 1
      || byName(res.children[at], res.children[at + 1]) < 0);
  });

  it('draws the !wimplib sprites, 34 and 18 pixels square', () => {
    const b = fs.readFileSync(path.join(tmp, LIB, '=21Sprites'));
    const got = {};
    for (let i = 0, o = b.readUInt32LE(4) - 4; i < b.readUInt32LE(0); i++) {
      const name = b.toString('latin1', o + 4, o + 16).replace(/\0+$/, '');
      const w = (b.readUInt32LE(o + 16) + 1) * 8
        - (31 - b.readUInt32LE(o + 28)) / 4;
      got[name] = [w, b.readUInt32LE(o + 20) + 1];
      o += b.readUInt32LE(o);
    }
    assert.deepEqual(got, {'!wimplib': [34, 34], 'sm!wimplib': [18, 18]});
  });

  it('changes nothing when run again', () => {
    const first = snapshot(tmp);
    const r = runLib([], {MOREAPPS_DISC: tmp});
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(snapshot(tmp), first);
  });

  it('keeps the manifest totals consistent', () => assertTotals(mf()));
});
