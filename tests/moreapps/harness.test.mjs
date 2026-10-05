// Regression test for what the moreapps unit tests rely on: Node imports
// disc-style modules (no file extension, extensionless relative imports,
// directory names containing '!') natively, and a module under
// tools/moreapps imports the library as 'wimplib/<Name>', as on the disc
// (tools/moreapps/package.json: the package 'wimplib' refers to itself).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {readZip, writeZip} from '../../tools/moreapps/!WimpLib/Zip';
import * as Xml from '../../tools/moreapps/!WimpLib/Xml';
import {ORDER, sortChildren} from '../../tools/moreapps/!Word/Order';
import {W} from '../../tools/moreapps/!Word/Wml';

describe('disc-style modules import natively', () => {
  // Node >= 22.7 is needed for extensionless ES modules (syntax detection).
  it('runs on Node 22 or later', () =>
    assert.ok(Number(process.versions.node.split('.')[0]) >= 22));
  it('imports extensionless modules that import each other', async () => {
    // Zip -> ZipWrite -> Crc32, all extensionless relative imports.
    const m = await readZip(await writeZip([['a', new Uint8Array([1])]]));
    assert.deepEqual([...m.get('a')], [1]);
  });
  it("imports one inside !Word that imports 'wimplib/Xml'", () => {
    // !Word/Wml imports 'wimplib/Xml'; Order is reached by the same path.
    assert.ok(ORDER.pPr.includes('jc'));
    const out = sortChildren('pPr', [W('jc'), W('pStyle')]);
    assert.equal(out[0].name, 'w:pStyle');
  });
});

describe("'wimplib/<Name>' in Node (package self-reference)", () => {
  const ROOT = path.resolve(import.meta.dirname, '..', '..');
  const probe = (cwd) => spawnSync(process.execPath, ['--input-type=module',
    '-e', "const z = await import('wimplib/Zip');"
      + " const c = await import('wimplib/Crc32');"
      + " console.log(typeof z.readZip,"
      + " c.crc32(new TextEncoder().encode('123456789')).toString(16),"
      + " import.meta.resolve('wimplib/Zip'));"],
  {cwd, encoding: 'utf8'});

  it('resolves from tools/moreapps to the extensionless !WimpLib file', () => {
    const r = probe(path.join(ROOT, 'tools/moreapps'));
    assert.equal(r.status, 0, r.stderr);
    const [type, crc, url] = r.stdout.trim().split(' ');
    assert.equal(type, 'function');
    assert.equal(crc, 'cbf43926');
    assert.ok(url.endsWith('/tools/moreapps/!WimpLib/Zip'), url);
  });

  it('is the same module (one URL) as the relative import', () => {
    const r = probe(path.join(ROOT, 'tools/moreapps'));
    const url = r.stdout.trim().split(' ')[2];
    assert.equal(url, import.meta.resolve('../../tools/moreapps/!WimpLib/Zip'));
    assert.equal(typeof Xml.parseXml, 'function');
  });

  it('is not a bare name outside tools/moreapps', () => {
    const r = probe(path.join(ROOT, 'tests'));
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /ERR_MODULE_NOT_FOUND|Cannot find package/);
  });
});
