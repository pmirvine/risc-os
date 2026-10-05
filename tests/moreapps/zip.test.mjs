import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync,
  rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {crc32} from '../../tools/moreapps/!WimpLib/Crc32';
import {readZip, writeZip, ZipError}
  from '../../tools/moreapps/!WimpLib/Zip';

const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder().decode(b);
const DATE = new Date(2026, 0, 2, 3, 4, 6);
const big = enc('The quick brown fox. '.repeat(500));

/** Offset of the first record with this signature. */
function find(bytes, sig) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  for (let i = 0; i + 4 <= bytes.length; i++)
    if (dv.getUint32(i, true) === sig) return i;
  return -1;
}
const CEN = 0x02014b50, LOC = 0x04034b50;
/** Copy of the zip with a 16/32-bit field patched in the first
 *  central directory record (offset = field offset in the record). */
function patchCen(bytes, off, size, value) {
  const out = bytes.slice();
  const dv = new DataView(out.buffer);
  const at = find(out, CEN) + off;
  if (size === 2) dv.setUint16(at, value, true);
  else dv.setUint32(at, value, true);
  return out;
}
const rejects = (p, code) => assert.rejects(p,
  (e) => e instanceof ZipError && e.code === code);

describe('crc32', () => {
  it('crc32 known vectors', () => {
    assert.equal(crc32(new Uint8Array(0)), 0);
    assert.equal(crc32(enc('123456789')), 0xCBF43926);
    const a = enc('12345'), b = enc('6789');
    assert.equal(crc32(b, crc32(a)), 0xCBF43926);
  });
});

describe('zip', () => {
  it('write then read round-trips stored and deflated entries',
    async () => {
      const zip = await writeZip(new Map([
        ['big.txt', big], ['small', enc('hi')]]), {date: DATE});
      const m = await readZip(zip);
      assert.deepEqual([...m.keys()], ['big.txt', 'small']);
      assert.deepEqual(m.get('big.txt'), big);
      assert.equal(dec(m.get('small')), 'hi');
      assert.ok(zip.length < big.length / 4, 'big one was deflated');
      const dv = new DataView(zip.buffer);
      assert.equal(dv.getUint16(find(zip, LOC) + 8, true), 8);
      assert.equal(dv.getUint16(find(zip, CEN) + 10, true), 8);
    });

  it('is deterministic when a date is given', async () => {
    const a = await writeZip([['x', big]], {date: DATE});
    const b = await writeZip([['x', big]], {date: DATE});
    assert.deepEqual(a, b);
  });

  it('empty archive', async () => {
    const zip = await writeZip([], {date: DATE});
    assert.equal(zip.length, 22);
    assert.equal((await readZip(zip)).size, 0);
  });

  it('UTF-8 names and a 0-byte entry', async () => {
    const zip = await writeZip([['déjà/日.txt', new Uint8Array(0)]],
      {date: DATE});
    const m = await readZip(zip);
    assert.deepEqual([...m.keys()], ['déjà/日.txt']);
    assert.equal(m.get('déjà/日.txt').length, 0);
    const dv = new DataView(zip.buffer);
    assert.equal(dv.getUint16(find(zip, LOC) + 6, true) & 0x0800, 0x0800);
  });

  it('entries are in the order given and [Content_Types].xml first is kept',
    async () => {
      const zip = await writeZip([['[Content_Types].xml', enc('<a/>')],
        ['z', enc('1')], ['a', enc('2')]], {date: DATE});
      assert.deepEqual([...(await readZip(zip)).keys()],
        ['[Content_Types].xml', 'z', 'a']);
      assert.equal(dec(zip.subarray(30, 49)), '[Content_Types].xml');
    });

  it('reads a zip made by the system zip tool', {
    skip: existsSync('/usr/bin/zip') ? false : '/usr/bin/zip not installed',
  }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ziptest-'));
    try {
      mkdirSync(join(dir, 'src/sub'), {recursive: true});
      writeFileSync(join(dir, 'src/big.txt'), big);
      writeFileSync(join(dir, 'src/sub/s.txt'), 'tiny');
      writeFileSync(join(dir, 'src/empty'), '');
      execFileSync('/usr/bin/zip', ['-q', '-r', '../out.zip', '.'],
        {cwd: join(dir, 'src')});
      const m = await readZip(new Uint8Array(
        readFileSync(join(dir, 'out.zip'))));
      assert.deepEqual([...m.keys()].sort(),
        ['big.txt', 'empty', 'sub/s.txt']);
      assert.deepEqual(m.get('big.txt'), big);
      assert.equal(dec(m.get('sub/s.txt')), 'tiny');
      assert.equal(m.get('empty').length, 0);
    } finally { rmSync(dir, {recursive: true, force: true}); }
  });

  it('reads a zip whose entry uses a data descriptor (bit 3)',
    async () => {
      const hex = '504b03041400080000000000210000000000000000000000000005'
        + '000000612e74787468656c6c6f504b070886a6103605000000050000'
        + '00504b010214001400080000000000210086a610360500000005000000'
        + '050000000000000000000000000000000000612e747874504b05060000'
        + '00000100010033000000380000000000';
      const m = await readZip(Uint8Array.from(Buffer.from(hex, 'hex')));
      assert.equal(dec(m.get('a.txt')), 'hello');
    });

  it('truncated file -> ZipError truncated', async () => {
    const zip = await writeZip([['a', enc('hello')]], {date: DATE});
    // End of central directory kept, but offsets now point past the end.
    const eocd = zip.subarray(zip.length - 22);
    const pad = new Uint8Array(40 + 22);
    pad.set(zip.subarray(0, 40)); pad.set(eocd, 40);
    await rejects(readZip(pad), 'truncated');
    await rejects(readZip(zip.subarray(0, 21)), 'not-zip');
  });

  it('flipped byte -> bad-crc', async () => {
    const zip = await writeZip([['a', enc('hello')]], {date: DATE});
    zip[30 + 1] ^= 0xff;  // inside the stored data
    await rejects(readZip(zip), 'bad-crc');
  });

  it('garbage -> not-zip', async () => {
    await rejects(readZip(enc('this is not a zip file at all, no')), 'not-zip');
    await rejects(readZip(new Uint8Array(0)), 'not-zip');
  });

  it('rejects zip-slip names', async () => {
    for (const n of ['../evil', 'a/../../b', '/abs'])
      await rejects(readZip(await writeZip([[n, enc('x')]])), 'not-zip');
  });

  it('skips directory entries', async () => {
    const zip = await writeZip([['d/', new Uint8Array(0)], ['d/f', enc('1')]]);
    assert.deepEqual([...(await readZip(zip)).keys()], ['d/f']);
  });

  it('zip64 marker -> zip64', async () => {
    const zip = await writeZip([['a', enc('hello')]], {date: DATE});
    await rejects(readZip(patchCen(zip, 20, 4, 0xffffffff)), 'zip64');
  });

  it('encrypted flag -> encrypted', async () => {
    const zip = await writeZip([['a', enc('hello')]], {date: DATE});
    await rejects(readZip(patchCen(zip, 8, 2, 0x0801)), 'encrypted');
  });

  it('unknown method -> bad-method', async () => {
    const zip = await writeZip([['a', enc('hello')]], {date: DATE});
    await rejects(readZip(patchCen(zip, 10, 2, 12)), 'bad-method');
  });

  it('bomb: entry claiming 1 TB, or ratio over maxRatio, -> too-big before inflating',
    async () => {
      const zip = await writeZip([['a', big]], {date: DATE});
      // 0xfffffffe bytes is below the zip64 marker but over maxTotal.
      await rejects(readZip(patchCen(zip, 24, 4, 0xfffffffe),
        {maxTotal: 1e6}), 'too-big');
      await rejects(readZip(zip, {maxRatio: 2}), 'too-big');
      await rejects(readZip(zip, {maxTotal: 100}), 'too-big');
      // Lying about the size must not let more than that come out.
      const lie = patchCen(zip, 24, 4, 100);
      await assert.rejects(readZip(lie, {maxRatio: 1e6}),
        (e) => e instanceof ZipError);
      // Corrupt data that would not inflate: never reached when too big.
      const bad = zip.slice();
      bad[find(bad, LOC) + 30 + 1 + 3] ^= 0xff;
      await rejects(readZip(patchCen(bad, 24, 4, 0xfffffffe),
        {maxTotal: 1e6}), 'too-big');
    });

  it('no CompressionStream -> stored entries', async () => {
    const saved = globalThis.CompressionStream;
    globalThis.CompressionStream = undefined;
    try {
      const zip = await writeZip([['a', big]], {date: DATE});
      const dv = new DataView(zip.buffer);
      assert.equal(dv.getUint16(find(zip, LOC) + 8, true), 0);
      assert.ok(zip.length > big.length);
      assert.deepEqual((await readZip(zip)).get('a'), big);
    } finally { globalThis.CompressionStream = saved; }
  });

  it('corrupt deflate data -> ZipError, never a raw TypeError', async () => {
    const zip = await writeZip([['a', big]], {date: DATE});
    const bad = zip.slice();
    bad[find(bad, LOC) + 30 + 1] = 0x07;  // reserved block type
    await rejects(readZip(bad), 'bad-crc');
  });

  it('trailing junk after the deflate stream -> ZipError', async () => {
    const zip = await writeZip([['a', big]], {date: DATE});
    const dv = new DataView(zip.buffer);
    const cen = find(zip, CEN), eocd = zip.length - 22;
    const body = 30 + 1;
    const junk = Uint8Array.of(1, 2, 3, 4);
    const out = new Uint8Array(zip.length + 4);
    out.set(zip.subarray(0, cen)); out.set(junk, cen);
    out.set(zip.subarray(cen), cen + 4);
    const o = new DataView(out.buffer);
    const csize = dv.getUint32(cen + 20, true) + 4;
    o.setUint32(18, csize, true);
    o.setUint32(cen + 4 + 20, csize, true);
    o.setUint32(eocd + 4 + 16, cen + 4, true);
    await rejects(readZip(out), 'bad-crc');
    assert.ok(body > 0);
  });

  it('truncations and random flips only ever throw ZipError', async () => {
    const zip = await writeZip([['a.txt', big.subarray(0, 300)],
      ['b', enc('bee')], ['dir/c', enc('see')]], {date: DATE});
    const run = async (b) => {
      try { assert.ok((await readZip(b)) instanceof Map); }
      catch (err) { assert.ok(err instanceof ZipError, String(err)); }
    };
    for (let n = 0; n < zip.length; n++) await run(zip.subarray(0, n));
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
    for (let k = 0; k < 300; k++) {
      const b = zip.slice();
      for (let j = 0; j <= k % 3; j++)
        b[Math.floor(rnd() * b.length)] ^= 1 + Math.floor(rnd() * 255);
      await run(b);
    }
  });

  /** Copy of a zip with a comment appended to the EOCD. */
  const withComment = (zip, comment) => {
    const out = new Uint8Array(zip.length + comment.length);
    out.set(zip); out.set(comment, zip.length);
    new DataView(out.buffer).setUint16(zip.length - 2, comment.length, true);
    return out;
  };

  it('a comment containing an EOCD signature does not hide entries',
    async () => {
      const zip = await writeZip([['a', enc('1')], ['b', enc('2')]]);
      const fake = new Uint8Array(100);
      fake.set([0x50, 0x4b, 0x05, 0x06], 50);
      assert.equal((await readZip(withComment(zip, fake))).size, 2);
      assert.equal((await readZip(withComment(zip, enc('hello')))).size, 2);
    });

  it('an EOCD whose comment length does not fit -> not-zip', async () => {
    const zip = (await writeZip([['a', enc('1')]])).slice();
    new DataView(zip.buffer).setUint16(zip.length - 2, 5, true);
    await rejects(readZip(zip), 'not-zip');
  });

  it('duplicate names -> not-zip', async () => {
    await rejects(readZip(await writeZip([['a', enc('1')], ['a', enc('2')]])),
      'not-zip');
  });

  it('rejects control characters, empty names and segments, drives',
    async () => {
      for (const n of ['a\0b', 'a\x1fb', 'a\nb', '', 'a//b', './a', 'a/./b',
        'C:/x', 'a\\b', '..', '/'])
        await rejects(readZip(await writeZip([[n, enc('x')]])), 'not-zip');
    });

  it('accepts an ArrayBuffer and refuses other arguments', async () => {
    const zip = await writeZip([['a', enc('1')]]);
    const ab = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.length);
    assert.equal((await readZip(ab)).size, 1);
    await rejects(readZip('text'), 'not-zip');
    await rejects(readZip(null), 'not-zip');
  });

  it('no DecompressionStream and a deflated entry -> bad-method',
    async () => {
      const zip = await writeZip([['a', big]]);
      const saved = globalThis.DecompressionStream;
      globalThis.DecompressionStream = undefined;
      try { await rejects(readZip(zip), 'bad-method'); }
      finally { globalThis.DecompressionStream = saved; }
    });
});
