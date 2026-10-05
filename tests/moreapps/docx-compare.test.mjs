// The test helper assertSameDoc on big documents: a difference is
// reported quickly, with a short message saying where it is (Node's
// own deepStrictEqual message is an inspect + diff of both whole
// models, which took over a gigabyte for an 18 MB real document).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readDocx} from '../../tools/moreapps/!Word/DocxRead';
import {buildDocx, documentXml, p, r} from './build-docx.mjs';
import {assertSameDoc, realDocxFiles, realDocxRoots}
  from './docx-compare.mjs';
import {mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync}
  from 'node:fs';
import {tmpdir, homedir} from 'node:os';
import {join} from 'node:path';

const big = (n) => buildDocx({'word/document.xml': documentXml(
  Array.from({length: n}, (_, i) => p(r('paragraph ' + i, '<w:b/>') +
    '<w:r><w:drawing><x/></w:drawing></w:r>')).join(''))});

describe('assertSameDoc', () => {
  it('passes equal documents', async () => {
    const b = await big(10);
    assertSameDoc(await readDocx(b), await readDocx(b), 'same');
  });
  it('reports a difference in a big document briefly', async () => {
    const b = await big(20000);
    const want = await readDocx(b);
    const got = await readDocx(b);
    const blocks = got.sections[0].blocks;
    blocks[15000] = {...blocks[15000], text: 'changed'};
    const t0 = Date.now();
    let err = null;
    try { assertSameDoc(got, want, 'big'); } catch (e) { err = e; }
    const ms = Date.now() - t0;
    assert.ok(err instanceof assert.AssertionError, String(err));
    assert.ok(err.message.length < 2000, 'message length ' +
      err.message.length);
    assert.match(err.message, /sections\[0\]\.blocks\[15000\]\.text/);
    assert.match(err.message, /changed/);
    assert.ok(ms < 5000, ms + ' ms');
  });
});

describe('realDocxFiles', () => {
  const REPO_CACHE = new URL('../../tools/moreapps/.cache/real-docx.txt',
    import.meta.url);
  it('searches nothing unless MOREAPPS_REAL_DOCX=1', async () => {
    assert.deepEqual(realDocxRoots({}), []);
    assert.deepEqual(realDocxRoots({MOREAPPS_REAL_DOCX: '0'}), []);
    const t0 = Date.now();
    assert.deepEqual(await realDocxFiles({}), []);
    assert.ok(Date.now() - t0 < 100);
  });
  it('when enabled: system folders and the listed ones, never home',
    () => {
      const home = homedir();
      const roots = realDocxRoots({MOREAPPS_REAL_DOCX: '1', HOME: home,
        MOREAPPS_REAL_DOCX_DIRS: '/tmp/a:/tmp/b c:'});
      assert.deepEqual(roots, ['/Applications', '/System/Library',
        '/Library', '/usr/share', '/tmp/a', '/tmp/b c']);
      assert.ok(!roots.includes(home));
    });
  it('finds files in the listed folders; keeps no list in the repo',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'real-docx-'));
      mkdirSync(join(dir, 'sub'));
      writeFileSync(join(dir, 'sub', 'a.docx'), 'x');
      writeFileSync(join(dir, '~$lock.docx'), 'x');
      try {
        const list = await realDocxFiles({MOREAPPS_REAL_DOCX: '1',
          MOREAPPS_REAL_DOCX_DIRS: dir}, {system: false});
        assert.deepEqual(list, [join(dir, 'sub', 'a.docx')]);
        assert.ok(!existsSync(REPO_CACHE), 'no list in tools/moreapps');
      } finally {
        rmSync(dir, {recursive: true, force: true});
      }
    });
});
